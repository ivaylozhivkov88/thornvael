// Side quests: machine specs (content/quest-specs.json) tracked from kills by family and gold.
// UI-side only; never touches the deterministic sim state except the optional win bonus.
interface Obj { type: string; args: Record<string, number | string> }
interface Spec { id: string; mission: string; objectives: Obj[]; reward_bonus: number }
export interface ActiveQuest { id: string; title: string; objs: Obj[]; bonus: number; done: boolean }

let active: ActiveQuest[] = [];
let kills: Record<string, number> = {};
let total = 0;
let maxGold = 0;
let prevAlive: boolean[] = [];

function hash(s: string): number { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

/** Pick the quests of a mission key like "m07": all mission-specific plus two generic ones. */
export async function startSideQuests(key: string): Promise<ActiveQuest[]> {
  active = []; kills = {}; total = 0; maxGold = 0; prevAlive = [];
  try {
    const base = import.meta.env.BASE_URL;
    const r = await fetch(`${base}data/content/quest-specs.json`);
    if (!r.ok) return active;
    const specs = ((await r.json()) as { quest_specs: Spec[] }).quest_specs;
    const titles: Record<string, string> = {};
    for (const f of ['side-quests', 'side-quests-2', 'side-quests-3', 'side-quests-4']) {
      try {
        const q = await fetch(`${base}data/content/${f}.json`);
        if (q.ok) for (const e of (await q.json()) as { id: string; title?: string }[]) if (e.title) titles[e.id] = e.title;
      } catch { /* optional */ }
    }
    const own = specs.filter((s) => s.mission === key);
    const any = specs.filter((s) => s.mission === 'any');
    const pick = own.slice();
    for (let i = 0; i < 2 && any.length; i++) pick.push(any[(hash(key) + i * 7) % any.length]);
    active = [...new Map(pick.map((s) => [s.id, s])).values()].map((s) => ({ id: s.id, title: titles[s.id] ?? s.id, objs: s.objectives, bonus: s.reward_bonus, done: false }));
  } catch { /* optional */ }
  return active;
}

/** Call each UI tick: counts newly dead enemies by family. */
export function sqTrack(count: number, team: ArrayLike<number>, hp: ArrayLike<number>, family: readonly string[], gold: number): void {
  if (!active.length) return;
  maxGold = Math.max(maxGold, gold);
  for (let i = 0; i < count; i++) {
    const foe = team[i] === 1;
    if (prevAlive[i] && foe && hp[i] <= 0) { total++; const f = family[i] || ''; if (f) kills[f] = (kills[f] ?? 0) + 1; }
    prevAlive[i] = foe && hp[i] > 0;
  }
}

function met(o: Obj, win: boolean, flawless: boolean): boolean {
  const n = Number(o.args.count ?? o.args.amount ?? 0);
  switch (o.type) {
    case 'kill_family': return (kills[String(o.args.family)] ?? 0) >= n;
    case 'kill_any': return total >= n;
    case 'hold_gold': return maxGold >= n;
    case 'win_mission': return win;
    case 'no_losses': return win && flawless;
    default: return false;
  }
}

/** On mission end: the quests fulfilled, with their bonus percent. */
export function sqFinish(win: boolean, flawless: boolean): ActiveQuest[] {
  const out: ActiveQuest[] = [];
  for (const q of active) if (!q.done && win && q.objs.every((o) => met(o, win, flawless))) { q.done = true; out.push(q); }
  return out;
}

// ---------------------------------------------------------------------------
// Headless stepped side-quest runtime (Act 1 steps[] state machine + saves)
// ---------------------------------------------------------------------------

export type QuestStepKind = 'talk' | 'fetch' | 'kill' | 'escort' | 'choice';
export type QuestTriggerType =
  | 'talk_npc'
  | 'collect_item'
  | 'kill_count'
  | 'escort_safe'
  | 'dialogue_choice';

export interface QuestStepTrigger {
  type: QuestTriggerType;
  ref: string;
  requires_step?: string;
  sets_flag?: string;
}

export interface QuestStepReward {
  gold?: number;
  xp?: number;
  item?: string | null;
  flag?: string;
}

export interface QuestStepDef {
  id: string;
  kind: QuestStepKind;
  target: string;
  count?: number;
  trigger: QuestStepTrigger;
  journal: string;
  next: string | string[] | null;
  /** Button labels for a choice step, one per `next` entry. */
  options?: string[];
  reward?: QuestStepReward;
}

export interface SteppedQuestDef {
  id: string;
  title: string;
  giver?: string;
  act?: number;
  town?: string;
  unlocks_after?: string;
  briefing?: string;
  objective?: string;
  steps: QuestStepDef[];
}

export interface QuestTriggerEvent {
  type: QuestTriggerType;
  ref: string;
  count?: number;
  choiceIndex?: number;
}

export interface QuestStepProgress {
  questId: string;
  currentStepId: string | null;
  completedStepIds: string[];
  stepCounts: Record<string, number>;
  completed: boolean;
  claimedRewards: string[];
}

export interface GrantedStepReward {
  stepId: string;
  gold: number;
  xp: number;
  item: string | null;
  flag: string | null;
}

export interface AdvanceStepResult {
  advanced: boolean;
  completedQuest: boolean;
  stepId: string | null;
  grantedReward: GrantedStepReward | null;
}

export interface QuestRuntimeState {
  defs: Record<string, SteppedQuestDef>;
  quests: Record<string, QuestStepProgress>;
  flags: Record<string, boolean>;
  totalGold: number;
  totalXp: number;
  items: string[];
}

export interface SteppedQuestSaveV1 {
  version?: 1;
  activeSteps: Record<string, string | null>;
  completedQuests?: string[];
  flags?: Record<string, boolean>;
}

export interface SteppedQuestSaveV2 {
  version: 2;
  quests: Record<string, QuestStepProgress>;
  flags: Record<string, boolean>;
  totalGold: number;
  totalXp: number;
  items: string[];
}

function makeInitialProgress(q: SteppedQuestDef): QuestStepProgress {
  const firstStep = Array.isArray(q.steps) ? (q.steps[0]?.id ?? null) : null;
  return {
    questId: q.id,
    currentStepId: firstStep,
    completedStepIds: [],
    stepCounts: {},
    completed: firstStep === null,
    claimedRewards: [],
  };
}

/** Create a fresh headless quest runtime state from stepped quest definitions. */
export function createQuestRuntimeState(quests: readonly SteppedQuestDef[]): QuestRuntimeState {
  const defs: Record<string, SteppedQuestDef> = {};
  const progress: Record<string, QuestStepProgress> = {};
  for (const q of quests) {
    defs[q.id] = q;
    progress[q.id] = makeInitialProgress(q);
  }
  return {
    defs,
    quests: progress,
    flags: {},
    totalGold: 0,
    totalXp: 0,
    items: [],
  };
}

/** Advance a stepped quest when a matching trigger event occurs. */
export function advanceQuestStep(
  state: QuestRuntimeState,
  questId: string,
  event: QuestTriggerEvent,
): AdvanceStepResult {
  const def = state.defs[questId];
  const prog = state.quests[questId];
  if (!def || !prog || prog.completed || !prog.currentStepId) {
    return {
      advanced: false,
      completedQuest: prog?.completed ?? false,
      stepId: prog?.currentStepId ?? null,
      grantedReward: null,
    };
  }

  const step = Array.isArray(def.steps) ? def.steps.find((s) => s.id === prog.currentStepId) : undefined;
  if (!step) {
    return { advanced: false, completedQuest: false, stepId: prog.currentStepId, grantedReward: null };
  }

  if (step.trigger.type !== event.type || step.trigger.ref !== event.ref) {
    return { advanced: false, completedQuest: false, stepId: step.id, grantedReward: null };
  }

  if (step.trigger.requires_step && !prog.completedStepIds.includes(step.trigger.requires_step)) {
    return { advanced: false, completedQuest: false, stepId: step.id, grantedReward: null };
  }

  const requiredCount = step.count ?? 1;
  if (requiredCount > 1) {
    const inc = event.count ?? 1;
    const nextCount = (prog.stepCounts[step.id] ?? 0) + inc;
    prog.stepCounts[step.id] = nextCount;
    if (nextCount < requiredCount) {
      return { advanced: false, completedQuest: false, stepId: step.id, grantedReward: null };
    }
  }

  if (!prog.completedStepIds.includes(step.id)) {
    prog.completedStepIds.push(step.id);
  }

  if (step.trigger.sets_flag) {
    state.flags[step.trigger.sets_flag] = true;
  }

  let grantedReward: GrantedStepReward | null = null;
  if (step.reward && !prog.claimedRewards.includes(step.id)) {
    prog.claimedRewards.push(step.id);
    const gold = step.reward.gold ?? 0;
    const xp = step.reward.xp ?? 0;
    const item = step.reward.item ?? null;
    const flag = step.reward.flag ?? null;
    state.totalGold += gold;
    state.totalXp += xp;
    if (item) state.items.push(item);
    if (flag) state.flags[flag] = true;
    grantedReward = { stepId: step.id, gold, xp, item, flag };
  }

  if (step.next === null) {
    prog.currentStepId = null;
    prog.completed = true;
  } else if (typeof step.next === 'string') {
    prog.currentStepId = step.next;
  } else if (Array.isArray(step.next)) {
    const idx = event.choiceIndex ?? 0;
    const chosen = step.next[idx] ?? step.next[0] ?? null;
    prog.currentStepId = chosen;
    if (chosen === null) prog.completed = true;
  }

  return {
    advanced: true,
    completedQuest: prog.completed,
    stepId: step.id,
    grantedReward,
  };
}

/** Return the journal entries for a quest (completed steps in order + active step if any). */
export function getQuestJournalText(state: QuestRuntimeState, questId: string): string[] {
  const def = state.defs[questId];
  const prog = state.quests[questId];
  if (!def || !prog) return [];

  const byId = new Map<string, QuestStepDef>();
  for (const s of def.steps ?? []) byId.set(s.id, s);

  const lines: string[] = [];
  for (const id of prog.completedStepIds) {
    const s = byId.get(id);
    if (s) lines.push(s.journal);
  }
  if (!prog.completed && prog.currentStepId && !prog.completedStepIds.includes(prog.currentStepId)) {
    const cur = byId.get(prog.currentStepId);
    if (cur) lines.push(cur.journal);
  }
  return lines;
}

/** Serialize quest runtime state to a version 2 save payload. */
export function serializeQuestSave(state: QuestRuntimeState): SteppedQuestSaveV2 {
  const quests: Record<string, QuestStepProgress> = {};
  for (const [id, p] of Object.entries(state.quests)) {
    quests[id] = {
      questId: p.questId,
      currentStepId: p.currentStepId,
      completedStepIds: [...p.completedStepIds],
      stepCounts: { ...p.stepCounts },
      completed: p.completed,
      claimedRewards: [...p.claimedRewards],
    };
  }
  return {
    version: 2,
    quests,
    flags: { ...state.flags },
    totalGold: state.totalGold,
    totalXp: state.totalXp,
    items: [...state.items],
  };
}

/** Migrate a v1 or v2 quest save payload to SteppedQuestSaveV2. */
export function migrateQuestSave(raw: unknown): SteppedQuestSaveV2 {
  if (!raw || typeof raw !== 'object') {
    return { version: 2, quests: {}, flags: {}, totalGold: 0, totalXp: 0, items: [] };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version === 2 && obj.quests && typeof obj.quests === 'object') {
    const rawQuests = obj.quests as Record<string, Partial<QuestStepProgress>>;
    const quests: Record<string, QuestStepProgress> = {};
    for (const [id, p] of Object.entries(rawQuests)) {
      quests[id] = {
        questId: p.questId ?? id,
        currentStepId: p.currentStepId ?? null,
        completedStepIds: Array.isArray(p.completedStepIds) ? [...p.completedStepIds] : [],
        stepCounts: p.stepCounts && typeof p.stepCounts === 'object' ? { ...p.stepCounts } : {},
        completed: Boolean(p.completed),
        claimedRewards: Array.isArray(p.claimedRewards) ? [...p.claimedRewards] : [],
      };
    }
    return {
      version: 2,
      quests,
      flags: obj.flags && typeof obj.flags === 'object' ? { ...(obj.flags as Record<string, boolean>) } : {},
      totalGold: typeof obj.totalGold === 'number' ? obj.totalGold : 0,
      totalXp: typeof obj.totalXp === 'number' ? obj.totalXp : 0,
      items: Array.isArray(obj.items) ? [...(obj.items as string[])] : [],
    };
  }

  // Legacy v1 migration
  const v1 = obj as Partial<SteppedQuestSaveV1>;
  const quests: Record<string, QuestStepProgress> = {};
  const completedSet = new Set(Array.isArray(v1.completedQuests) ? v1.completedQuests : []);
  if (v1.activeSteps && typeof v1.activeSteps === 'object') {
    for (const [questId, currentStepId] of Object.entries(v1.activeSteps)) {
      const done = completedSet.has(questId) || currentStepId === null;
      quests[questId] = {
        questId,
        currentStepId: done ? null : currentStepId,
        completedStepIds: [],
        stepCounts: {},
        completed: done,
        claimedRewards: [],
      };
    }
  }
  for (const questId of completedSet) {
    if (!quests[questId]) {
      quests[questId] = {
        questId,
        currentStepId: null,
        completedStepIds: [],
        stepCounts: {},
        completed: true,
        claimedRewards: [],
      };
    }
  }
  return {
    version: 2,
    quests,
    flags: v1.flags && typeof v1.flags === 'object' ? { ...v1.flags } : {},
    totalGold: 0,
    totalXp: 0,
    items: [],
  };
}

/** Deserialize (and migrate if needed) a saved quest payload against quest definitions. */
export function deserializeQuestSave(raw: unknown, defs: readonly SteppedQuestDef[]): QuestRuntimeState {
  const migrated = migrateQuestSave(raw);
  const state = createQuestRuntimeState(defs);
  for (const [id, savedProg] of Object.entries(migrated.quests)) {
    if (state.quests[id]) {
      state.quests[id] = {
        questId: id,
        currentStepId: savedProg.currentStepId,
        completedStepIds: [...savedProg.completedStepIds],
        stepCounts: { ...savedProg.stepCounts },
        completed: savedProg.completed,
        claimedRewards: [...savedProg.claimedRewards],
      };
    }
  }
  state.flags = { ...migrated.flags };
  state.totalGold = migrated.totalGold;
  state.totalXp = migrated.totalXp;
  state.items = [...migrated.items];
  return state;
}
