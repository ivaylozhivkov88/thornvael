import {
  MAX_LOADOUT_SLOTS,
  SYNERGY_PCT_PER_RANK,
  getSkillNode,
  getSkillTreeForClass,
} from './trees';
import type {
  ComputedPassiveBonuses,
  RespecResult,
  SkillBranch,
  SkillClass,
  SkillTreeState,
} from './types';

export function createSkillTreeState(
  cls: SkillClass,
  level = 1,
  ranks: Readonly<Record<string, number>> = {},
  loadout: readonly (string | null)[] = [],
  respecCount = 0,
): SkillTreeState {
  const spent = Object.values(ranks).reduce((s, r) => s + Math.max(0, r), 0);
  const totalEarned = Math.max(0, level - 1);
  return {
    cls,
    level,
    availablePoints: Math.max(0, totalEarned - spent),
    ranks: { ...ranks },
    loadout: Array.from({ length: MAX_LOADOUT_SLOTS }, (_, i) => loadout[i] ?? null),
    respecCount,
  };
}

export function canAllocateSkill(state: SkillTreeState, skillId: string): { ok: boolean; reason?: string } {
  const node = getSkillNode(skillId);
  if (!node) return { ok: false, reason: 'Unknown skill.' };
  if (node.cls !== state.cls) return { ok: false, reason: 'Skill belongs to another class.' };
  if (state.availablePoints <= 0) return { ok: false, reason: 'No skill points available.' };

  const curRank = state.ranks[skillId] ?? 0;
  if (curRank >= node.maxRank) return { ok: false, reason: 'Skill is already at max rank.' };

  for (const reqId of node.requires) {
    if ((state.ranks[reqId] ?? 0) < 1) {
      return { ok: false, reason: `Requires ${getSkillNode(reqId)?.name ?? reqId}.` };
    }
  }
  return { ok: true };
}

export function allocateSkill(state: SkillTreeState, skillId: string): SkillTreeState | null {
  if (!canAllocateSkill(state, skillId).ok) return null;
  const curRank = state.ranks[skillId] ?? 0;
  const nextRanks = { ...state.ranks, [skillId]: curRank + 1 };
  const node = getSkillNode(skillId)!;

  let nextLoadout = [...state.loadout];
  if (node.type === 'active' && curRank === 0 && !nextLoadout.includes(skillId)) {
    const emptyIdx = nextLoadout.indexOf(null);
    if (emptyIdx >= 0) nextLoadout[emptyIdx] = skillId;
  }

  return {
    ...state,
    availablePoints: state.availablePoints - 1,
    ranks: nextRanks,
    loadout: nextLoadout,
  };
}

export function setLoadoutSlot(state: SkillTreeState, slotIndex: number, skillId: string | null): SkillTreeState | null {
  if (slotIndex < 0 || slotIndex >= MAX_LOADOUT_SLOTS) return null;
  if (skillId !== null) {
    const node = getSkillNode(skillId);
    if (!node || node.cls !== state.cls || node.type !== 'active') return null;
    if ((state.ranks[skillId] ?? 0) < 1) return null;
  }
  const nextLoadout = [...state.loadout];
  nextLoadout[slotIndex] = skillId;
  return { ...state, loadout: nextLoadout };
}

export function computeSkillSynergyPct(state: SkillTreeState, skillId: string): number {
  const node = getSkillNode(skillId);
  if (!node) return 0;
  let totalRanks = 0;
  for (const synId of node.synergies) {
    totalRanks += state.ranks[synId] ?? 0;
  }
  return totalRanks * SYNERGY_PCT_PER_RANK;
}

export function computeActiveSkillPowerPct(state: SkillTreeState, skillId: string): number {
  const node = getSkillNode(skillId);
  const rank = state.ranks[skillId] ?? 0;
  if (!node || rank <= 0) return 0;
  const base = (node.basePct ?? 100) + Math.max(0, rank - 1) * (node.perRankPct ?? 0);
  const syn = computeSkillSynergyPct(state, skillId);
  return Math.floor((base * (100 + syn)) / 100);
}

export function computePassiveBonuses(state: SkillTreeState): ComputedPassiveBonuses {
  const totals: Record<string, number> = {
    meleeDmgPct: 0,
    lifestealPct: 0,
    iasPct: 0,
    def: 0,
    abs: 0,
    blockPct: 0,
    maxHp: 0,
    critPct: 0,
    acc: 0,
    firePowPct: 0,
    fireResPct: 0,
    waterPowPct: 0,
    chillDurPct: 0,
    maxMana: 0,
    fcrPct: 0,
    killMana: 0,
    cheatDeathHpPct: 0,
  };

  for (const node of getSkillTreeForClass(state.cls)) {
    const rank = state.ranks[node.id] ?? 0;
    if (rank <= 0 || node.type !== 'passive' || !node.passivePerRank) continue;
    for (const [key, perRank] of Object.entries(node.passivePerRank)) {
      if (key in totals) totals[key] += perRank * rank;
    }
  }

  return totals as unknown as ComputedPassiveBonuses;
}

export function getTotalAllocatedPoints(state: SkillTreeState): number {
  return Object.values(state.ranks).reduce((s, r) => s + Math.max(0, r), 0);
}

export function getBranchPoints(state: SkillTreeState, branch: SkillBranch): number {
  let sum = 0;
  for (const node of getSkillTreeForClass(state.cls)) {
    if (node.branch === branch) sum += state.ranks[node.id] ?? 0;
  }
  return sum;
}

export function respecCost(level: number, respecCount: number): number {
  const base = 100 * Math.max(1, level);
  const mult = Math.min(8, 1 + Math.max(0, respecCount));
  return base * mult;
}

export function respecSkills(state: SkillTreeState, goldAvailable: number): RespecResult {
  const cost = respecCost(state.level, state.respecCount);
  if (goldAvailable < cost) {
    return { ok: false, reason: 'Not enough gold for respec.', cost, state };
  }
  return {
    ok: true,
    cost,
    state: {
      ...state,
      availablePoints: Math.max(0, state.level - 1),
      ranks: {},
      loadout: Array.from({ length: MAX_LOADOUT_SLOTS }, () => null),
      respecCount: state.respecCount + 1,
    },
  };
}
