import {
  advanceQuestStep,
  createQuestRuntimeState,
  deserializeQuestSave,
  getQuestJournalText,
  serializeQuestSave,
  type AdvanceStepResult,
  type GrantedStepReward,
  type QuestStepDef,
  type QuestRuntimeState,
  type SteppedQuestDef,
  type SteppedQuestSaveV2,
} from './sidequests';

export interface TalkOutcome {
  questId: string;
  title: string;
  text: string;
  rewards: GrantedStepReward[];
  /** Set when the NPC waits for a decision; answer with `choose`. */
  options: string[] | null;
}

export interface TakenQuest {
  id: string;
  title: string;
  briefing: string;
  done: string[];
  task: string | null;
  completed: boolean;
}

const titleCase = (ref: string): string => ref.replace(/(^|-)([a-z])/g, (_m, d, c) => (d ? ' ' : '') + c.toUpperCase());

/**
 * Pure adapter over `src/sidequests.ts` stepped quest runtime for `main.ts` / `townui.ts` integration.
 */
export class SteppedQuestAdapter {
  private state: QuestRuntimeState;
  private readonly questIds: string[];
  private onAdvance?: (results: AdvanceStepResult[]) => void;

  constructor(defs: readonly SteppedQuestDef[], saved?: unknown) {
    // Entries without steps are not playable yet (later acts); they are never offered.
    const playable = defs.filter((d) => d.steps?.length);
    this.questIds = playable.map((d) => d.id);
    this.state = saved ? deserializeQuestSave(saved, playable) : createQuestRuntimeState(playable);
  }

  setOnAdvance(cb?: (results: AdvanceStepResult[]) => void): void {
    this.onAdvance = cb;
  }

  getPendingEscortTargets(): string[] {
    const refs: string[] = [];
    for (const qid of this.questIds) {
      const prog = this.state.quests[qid];
      const def = this.state.defs[qid];
      if (!prog || !def || prog.completed || !prog.currentStepId) continue;
      const step = Array.isArray(def.steps) ? def.steps.find((s) => s.id === prog.currentStepId) : undefined;
      if (!step || step.trigger.type !== 'escort_safe') continue;
      if (step.trigger.requires_step && !prog.completedStepIds.includes(step.trigger.requires_step)) continue;
      refs.push(step.trigger.ref);
    }
    return refs;
  }

  getState(): QuestRuntimeState {
    return this.state;
  }

  save(): SteppedQuestSaveV2 {
    return serializeQuestSave(this.state);
  }

  /** A quest is taken once its first step (talking to the giver) is done. */
  isTaken(questId: string): boolean {
    return (this.state.quests[questId]?.completedStepIds.length ?? 0) > 0;
  }

  /** '?' = an active quest waits for this NPC, '!' = the NPC has a new quest. */
  npcMark(npcId: string): '!' | '?' | null {
    if (this.activeIds().some((q) => this.waitsFor(q, npcId))) return '?';
    return this.offer(npcId) ? '!' : null;
  }

  /** One conversation: turns in, reminds, or hands out at most one quest. */
  talk(npcId: string, npcName: (id: string) => string = titleCase): TalkOutcome | null {
    const waiting = this.activeIds().find((q) => this.waitsFor(q, npcId));
    if (waiting) {
      const step = this.currentStep(waiting)!;
      if (step.trigger.type !== 'dialogue_choice') return this.turnIn(waiting, npcId);
      const branches = Array.isArray(step.next) ? step.next : [];
      return this.outcome(waiting, step.journal, [], step.options ?? branches.map((_n, i) => `Option ${i + 1}`));
    }
    const own = this.activeIds().find((q) => this.state.defs[q].giver === npcId);
    if (own) return this.outcome(own, this.task(own, npcName) ?? '', [], null);
    const next = this.offer(npcId);
    if (!next) return null;
    advanceQuestStep(this.state, next, { type: 'talk_npc', ref: npcId });
    if (!this.isTaken(next)) return null;
    const def = this.state.defs[next];
    return this.outcome(next, def.briefing ?? def.steps[0].journal, [], null);
  }

  /** Answers a choice step; turns the quest in at once if the same NPC takes the result. */
  choose(questId: string, npcId: string, choiceIndex: number): TalkOutcome | null {
    const step = this.currentStep(questId);
    if (!step || step.trigger.type !== 'dialogue_choice' || step.trigger.ref !== npcId) return null;
    const res = advanceQuestStep(this.state, questId, { type: 'dialogue_choice', ref: npcId, choiceIndex });
    if (!res.advanced) return null;
    const after = this.currentStep(questId);
    if (after?.trigger.type === 'talk_npc' && after.trigger.ref === npcId) return this.turnIn(questId, npcId);
    const rest = this.task(questId, (id) => titleCase(id.replace(/^npc-/, '')));
    return this.outcome(questId, rest ?? step.journal, res.grantedReward ? [res.grantedReward] : [], null);
  }

  /**
   * A kill counts for kill steps. During a fetch step, one more kill of the same
   * family recovers the item (there are no ground items for quests yet).
   */
  onFoeKilled(family: string): AdvanceStepResult[] {
    const out: AdvanceStepResult[] = [];
    for (const qid of this.activeIds()) {
      const step = this.currentStep(qid)!;
      let res: AdvanceStepResult | null = null;
      if (step.trigger.type === 'kill_count') {
        res = advanceQuestStep(this.state, qid, { type: 'kill_count', ref: family, count: 1 });
      } else if (step.trigger.type === 'collect_item' && this.huntFamily(qid) === family) {
        res = advanceQuestStep(this.state, qid, { type: 'collect_item', ref: step.trigger.ref, count: step.count ?? 1 });
      }
      if (res?.advanced) out.push(res);
    }
    return out;
  }

  /**
   * No living foe of this family is left on a map that had them: the step they
   * block counts as done, so a quest taken late can't get stuck.
   */
  onFamilyCleared(family: string): AdvanceStepResult[] {
    const out: AdvanceStepResult[] = [];
    // two passes: clearing a kill step opens the fetch step behind it
    for (let pass = 0; pass < 2; pass++) {
      for (const qid of this.activeIds()) {
        const step = this.currentStep(qid);
        if (!step || this.huntFamily(qid) !== family) continue;
        const { type, ref } = step.trigger;
        if (type !== 'kill_count' && type !== 'collect_item') continue;
        const res = advanceQuestStep(this.state, qid, { type, ref, count: step.count ?? 1 });
        if (res.advanced) out.push(res);
      }
    }
    return out;
  }

  takenQuests(npcName: (id: string) => string = titleCase): TakenQuest[] {
    return this.questIds
      .filter((q) => this.isTaken(q))
      .map((q) => {
        const def = this.state.defs[q];
        const prog = this.state.quests[q];
        return {
          id: q,
          title: def.title,
          briefing: def.briefing ?? '',
          done: def.steps.filter((s, i) => i > 0 && prog.completedStepIds.includes(s.id)).map((s) => s.journal),
          task: this.task(q, npcName),
          completed: prog.completed,
        };
      });
  }

  private currentStep(questId: string): QuestStepDef | null {
    const prog = this.state.quests[questId];
    if (!prog || prog.completed) return null;
    return this.state.defs[questId]?.steps.find((s) => s.id === prog.currentStepId) ?? null;
  }

  private activeIds(): string[] {
    return this.questIds.filter((q) => this.isTaken(q) && !this.state.quests[q].completed);
  }

  private waitsFor(questId: string, npcId: string): boolean {
    const step = this.currentStep(questId);
    if (!step) return false;
    const t = step.trigger;
    if (t.type === 'escort_safe') return this.state.defs[questId].giver === npcId;
    return (t.type === 'talk_npc' || t.type === 'dialogue_choice') && t.ref === npcId;
  }

  private offer(npcId: string): string | null {
    if (this.activeIds().some((q) => this.state.defs[q].giver === npcId)) return null;
    return (
      this.questIds.find(
        (q) => this.state.defs[q].giver === npcId && !this.isTaken(q) && !this.state.quests[q].completed,
      ) ?? null
    );
  }

  private huntFamily(questId: string): string | null {
    return this.state.defs[questId].steps.find((s) => s.trigger.type === 'kill_count')?.trigger.ref ?? null;
  }

  private task(questId: string, npcName: (id: string) => string): string | null {
    const step = this.currentStep(questId);
    if (!step) return null;
    const { type, ref } = step.trigger;
    if (type === 'kill_count') {
      const n = this.state.quests[questId].stepCounts[step.id] ?? 0;
      return `Slay: ${titleCase(ref)} (${n}/${step.count ?? 1})`;
    }
    if (type === 'collect_item') {
      const family = this.huntFamily(questId);
      return `Recover: ${ref}${family ? ` (hunt another ${titleCase(family)})` : ''}`;
    }
    if (type === 'escort_safe') return `Report back to ${npcName(this.state.defs[questId].giver ?? '')}`;
    return `Speak with ${npcName(ref)}`;
  }

  private turnIn(questId: string, npcId: string): TalkOutcome {
    const rewards: GrantedStepReward[] = [];
    let text = '';
    const apply = (type: 'talk_npc' | 'escort_safe', ref: string): void => {
      const step = this.currentStep(questId);
      if (!step || step.trigger.type !== type) return;
      const res = advanceQuestStep(this.state, questId, { type, ref });
      if (!res.advanced) return;
      text = step.journal;
      if (res.grantedReward) rewards.push(res.grantedReward);
    };
    const first = this.currentStep(questId);
    if (first?.trigger.type === 'escort_safe') apply('escort_safe', first.trigger.ref);
    apply('talk_npc', npcId);
    return this.outcome(questId, text, rewards, null);
  }

  private outcome(questId: string, text: string, rewards: GrantedStepReward[], options: string[] | null): TalkOutcome {
    return { questId, title: this.state.defs[questId].title, text, rewards, options };
  }

  onTalkNpc(npcId: string): AdvanceStepResult[] {
    return this.dispatch({ type: 'talk_npc', ref: npcId });
  }

  onCollectItem(itemRef: string, count = 1): AdvanceStepResult[] {
    return this.dispatch({ type: 'collect_item', ref: itemRef, count });
  }

  onKillFamily(family: string, count = 1): AdvanceStepResult[] {
    return this.dispatch({ type: 'kill_count', ref: family, count });
  }

  onEscortSafe(targetRef: string): AdvanceStepResult[] {
    return this.dispatch({ type: 'escort_safe', ref: targetRef });
  }

  onDialogueChoice(npcId: string, choiceIndex: number): AdvanceStepResult[] {
    return this.dispatch({ type: 'dialogue_choice', ref: npcId, choiceIndex });
  }

  getJournal(questId: string): string[] {
    return getQuestJournalText(this.state, questId);
  }

  isCompleted(questId: string): boolean {
    return Boolean(this.state.quests[questId]?.completed);
  }

  private dispatch(event: {
    type: 'talk_npc' | 'collect_item' | 'kill_count' | 'escort_safe' | 'dialogue_choice';
    ref: string;
    count?: number;
    choiceIndex?: number;
  }): AdvanceStepResult[] {
    const out: AdvanceStepResult[] = [];
    for (const qid of this.questIds) {
      const res = advanceQuestStep(this.state, qid, event);
      if (res.advanced) out.push(res);
    }
    if (out.length > 0) this.onAdvance?.(out);
    return out;
  }
}
