import {
  advanceQuestStep,
  createQuestRuntimeState,
  deserializeQuestSave,
  getQuestJournalText,
  serializeQuestSave,
  type AdvanceStepResult,
  type QuestRuntimeState,
  type SteppedQuestDef,
  type SteppedQuestSaveV2,
} from './sidequests';

/**
 * Pure adapter over `src/sidequests.ts` stepped quest runtime for `main.ts` / `townui.ts` integration.
 */
export class SteppedQuestAdapter {
  private state: QuestRuntimeState;
  private readonly questIds: string[];
  private onAdvance?: (results: AdvanceStepResult[]) => void;

  constructor(defs: readonly SteppedQuestDef[], saved?: unknown) {
    this.questIds = defs.map((d) => d.id);
    this.state = saved ? deserializeQuestSave(saved, defs) : createQuestRuntimeState(defs);
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
