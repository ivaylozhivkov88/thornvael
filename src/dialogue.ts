// Pure dialogue runtime helpers: reputation-tier greetings, quest-aware nodes, and seeded idle barks.
// No UI or DOM dependencies.

export type ReputationTier = 'low' | 'neutral' | 'high';
export type QuestDialogueState = 'before' | 'during' | 'after';

export interface DialogueChoice {
  label: string;
  next: string;
  requires_flag?: string;
  sets_flag?: string;
  requires_quest?: string;
  quest_state?: string;
}

export interface DialogueNode {
  id: string;
  npc: string;
  node: string;
  requires_reputation?: ReputationTier;
  quest_id?: string;
  quest_state?: QuestDialogueState;
  text: string;
  choices: DialogueChoice[];
}

export interface TownBark {
  town: string;
  npc?: string;
  kind: string;
  line: string;
}

/** Map numeric reputation to 'low' (< 0), 'neutral' (0..49), or 'high' (>= 50). */
export function reputationTier(rep: number): ReputationTier {
  if (rep < 0) return 'low';
  if (rep >= 50) return 'high';
  return 'neutral';
}

/** Pick the greeting dialogue node for an NPC based on numeric reputation. */
export function pickGreetingNode(
  nodes: readonly DialogueNode[],
  npcId: string,
  reputation: number,
): DialogueNode | null {
  const npcNodes = nodes.filter((n) => n.npc === npcId);
  if (npcNodes.length === 0) return null;

  const tier = reputationTier(reputation);
  const exact =
    npcNodes.find((n) => n.node === `greeting_${tier}` || n.requires_reputation === tier) ?? null;
  if (exact) return exact;

  return (
    npcNodes.find((n) => n.node === 'greeting_neutral' || n.requires_reputation === 'neutral') ??
    npcNodes.find((n) => n.node.startsWith('entry_')) ??
    npcNodes[0]
  );
}

/** Pick a quest-aware dialogue node ('before' | 'during' | 'after') for an NPC and optional questId. */
export function pickQuestNode(
  nodes: readonly DialogueNode[],
  npcId: string,
  questId: string | null,
  questState: QuestDialogueState,
): DialogueNode | null {
  const npcNodes = nodes.filter((n) => n.npc === npcId);
  if (npcNodes.length === 0) return null;

  const targetNode = `quest_${questState}`;
  if (questId) {
    const exactQuest = npcNodes.find(
      (n) => n.quest_id === questId && (n.quest_state === questState || n.node === targetNode),
    );
    if (exactQuest) return exactQuest;
  }

  return (
    npcNodes.find((n) => n.quest_state === questState || n.node === targetNode) ?? null
  );
}

/** Deterministic 32-bit seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a deterministic idle bark for an NPC (or town fallback) using a seeded PRNG. */
export function pickIdleBark(
  barks: readonly TownBark[],
  npcId: string,
  seed: number,
): TownBark | null {
  let pool = barks.filter((b) => b.npc === npcId);
  if (pool.length === 0) {
    pool = barks.filter((b) => !b.npc && b.town === npcId);
  }
  if (pool.length === 0) return null;

  const rng = mulberry32(seed);
  const idx = Math.floor(rng() * pool.length);
  return pool[idx] ?? pool[0];
}

export interface DialogueQueryState {
  nodes: readonly DialogueNode[];
  barks: readonly TownBark[];
  reputation: number;
  questId?: string | null;
  questState?: QuestDialogueState;
  seed?: number;
}

export interface DialogueBundle {
  tier: ReputationTier;
  greeting: DialogueNode | null;
  questNode: DialogueNode | null;
  idleBark: TownBark | null;
}

/** Single-call pure entry for townui.ts: resolves tier, greeting, quest node, and idle bark. */
export function dialogueFor(npcId: string, state: DialogueQueryState): DialogueBundle {
  return {
    tier: reputationTier(state.reputation),
    greeting: pickGreetingNode(state.nodes, npcId, state.reputation),
    questNode: state.questState
      ? pickQuestNode(state.nodes, npcId, state.questId ?? null, state.questState)
      : null,
    idleBark: pickIdleBark(state.barks, npcId, state.seed ?? 1),
  };
}
