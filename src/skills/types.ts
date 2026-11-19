export type SkillClass = 'warrior' | 'mage';
export type WarriorBranch = 'Berserker' | 'Guardian' | 'Warlord';
export type MageBranch = 'Pyromancer' | 'Cryomancer' | 'Shadowcaller';
export type SkillBranch = WarriorBranch | MageBranch;
export type SkillType = 'active' | 'passive';

export interface SkillNodeDef {
  readonly id: string;
  readonly name: string;
  readonly cls: SkillClass;
  readonly branch: SkillBranch;
  readonly type: SkillType;
  readonly tier: 1 | 2 | 3 | 4;
  readonly maxRank: number;
  readonly requires: readonly string[];
  readonly synergies: readonly string[];
  readonly desc: string;
  readonly cooldownTicks?: number; // 25 ticks = 1 second
  readonly manaCost?: number;
  readonly staminaCost?: number;
  readonly legacyId?: string;
  readonly passivePerRank?: Readonly<Record<string, number>>;
  readonly basePct?: number;
  readonly perRankPct?: number;
}

export interface SkillTreeState {
  readonly cls: SkillClass;
  readonly level: number;
  readonly availablePoints: number;
  readonly ranks: Readonly<Record<string, number>>;
  readonly loadout: readonly (string | null)[]; // up to 6 slots [Q, W, E, R, T, RMB]
  readonly respecCount: number;
}

export interface RespecResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly cost: number;
  readonly state: SkillTreeState;
}

export interface ComputedPassiveBonuses {
  readonly meleeDmgPct: number;
  readonly lifestealPct: number;
  readonly iasPct: number;
  readonly def: number;
  readonly abs: number;
  readonly blockPct: number;
  readonly maxHp: number;
  readonly critPct: number;
  readonly acc: number;
  readonly firePowPct: number;
  readonly fireResPct: number;
  readonly waterPowPct: number;
  readonly chillDurPct: number;
  readonly maxMana: number;
  readonly fcrPct: number;
  readonly killMana: number;
  readonly cheatDeathHpPct: number;
}
