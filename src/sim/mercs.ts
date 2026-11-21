/**
 * Mercenary Veterancy & Squad Management System for Thornvael (RoM2 Web)
 *
 * Implements:
 * 1. 4 Veterancy Ranks (Recruit, Veteran, Elite, Champion Guard) based on kills & missions survived.
 * 2. Stat scaling (+HP, +Damage, +Accuracy) & Chevron badges (bronze, silver, gold).
 * 3. Class-specific passive perks at Rank 2+ (Shield Wall, Double Draw, Arcane Conduit).
 * 4. Mercenary Charm Slot & Auto-Potion Belt (auto-consumed at <30% HP).
 * 5. Temple Resurrection tracking for fallen veterans at the town Arcane Sanctum / School.
 */

import { Kind } from './combat';

export type VeteranRank = 0 | 1 | 2 | 3;
export type VeteranChevron = 'bronze' | 'silver' | 'gold';

export interface MercenaryRankDef {
  readonly rank: VeteranRank;
  readonly title: string;
  readonly minKills: number;
  readonly minMissions: number;
  readonly hpPctBonus: number;
  readonly dmgPctBonus: number;
  readonly accBonus: number;
  readonly chevron?: VeteranChevron;
  readonly description: string;
}

export const VETERAN_RANKS: readonly MercenaryRankDef[] = [
  {
    rank: 0,
    title: 'Recruit',
    minKills: 0,
    minMissions: 0,
    hpPctBonus: 0,
    dmgPctBonus: 0,
    accBonus: 0,
    description: 'Freshly hired recruit with standard combat training.',
  },
  {
    rank: 1,
    title: 'Veteran',
    minKills: 15,
    minMissions: 1,
    hpPctBonus: 12,
    dmgPctBonus: 0,
    accBonus: 8,
    chevron: 'bronze',
    description: '+12% HP, +8 Accuracy from battle-hardened experience.',
  },
  {
    rank: 2,
    title: 'Elite',
    minKills: 40,
    minMissions: 3,
    hpPctBonus: 25,
    dmgPctBonus: 15,
    accBonus: 8,
    chevron: 'silver',
    description: '+25% HP, +15% Damage and class combat specialization.',
  },
  {
    rank: 3,
    title: 'Champion Guard',
    minKills: 80,
    minMissions: 6,
    hpPctBonus: 40,
    dmgPctBonus: 22,
    accBonus: 12,
    chevron: 'gold',
    description: '+40% HP, +22% Damage, legendary resilience and battlefield mastery.',
  },
];

export interface MercenaryPassivePerk {
  readonly name: string;
  readonly description: string;
  readonly bonusArmor?: number;
  readonly damageReductionPct?: number;
  readonly attackSpeedPct?: number;
  readonly critBonusPct?: number;
  readonly spellDmgPct?: number;
  readonly manaRegen?: number;
}

export const MERCENARY_PERKS: Record<string, MercenaryPassivePerk> = {
  'Shield Wall': {
    name: 'Shield Wall',
    description: 'Sturdy defensive stance: +15 Armor and reduces physical damage taken by 15%.',
    bonusArmor: 15,
    damageReductionPct: 15,
  },
  'Double Draw': {
    name: 'Double Draw',
    description: 'Fluid archery technique: +18% Attack Speed and +10% Critical Strike chance.',
    attackSpeedPct: 18,
    critBonusPct: 10,
  },
  'Arcane Conduit': {
    name: 'Arcane Conduit',
    description: 'Channels ambient ley energy: +20% Spell Damage and restores 2 Mana per second.',
    spellDmgPct: 20,
    manaRegen: 2,
  },
};

/**
 * Determine veterancy rank from lifetime kills and missions survived.
 */
export function calculateVeteranRank(kills: number, missionsSurvived: number): VeteranRank {
  if (kills >= 80 || missionsSurvived >= 6) return 3;
  if (kills >= 40 || missionsSurvived >= 3) return 2;
  if (kills >= 15 || missionsSurvived >= 1) return 1;
  return 0;
}

/**
 * Resolve the passive combat perk for an Elite or Champion Guard mercenary.
 */
export function getMercenaryPerk(kind: number, rank: VeteranRank): string | undefined {
  if (rank < 2) return undefined;
  if (kind === Kind.Archer) return 'Double Draw';
  if (kind === Kind.Mage || kind === Kind.Imp) return 'Arcane Conduit';
  return 'Shield Wall'; // Warrior, Golem, and standard melee
}

/**
 * Persistent record of a hired mercenary.
 */
export interface MercenaryRecord {
  id: string; // e.g. "merc-1"
  name: string;
  kind: number; // Kind.*
  unitId: number; // Active sim unit ID, or -1 if dormant/stored
  kills: number;
  missionsSurvived: number;
  rank: VeteranRank;
  chevron?: VeteranChevron;
  perkName?: string;
  charmItem: number; // Item ID for Charm/Ring slot (-1 if empty)
  potionBelt: [number, number]; // Item IDs for up to 2 auto-potions (-1 if empty)
  fallen: boolean;
  townIndex?: number;
  hireFee: number;
}

/**
 * Create a new mercenary record with base Recruit rank.
 */
export function createMercenaryRecord(
  id: string,
  name: string,
  kind: number,
  unitId: number,
  hireFee = 100,
): MercenaryRecord {
  return {
    id,
    name,
    kind,
    unitId,
    kills: 0,
    missionsSurvived: 0,
    rank: 0,
    charmItem: -1,
    potionBelt: [-1, -1],
    fallen: false,
    hireFee,
  };
}

/**
 * Update mercenary kills, check for promotion, and assign perks and chevron badges.
 * Returns true if the mercenary achieved a rank promotion.
 */
export function registerMercenaryKill(merc: MercenaryRecord): boolean {
  merc.kills++;
  const newRank = calculateVeteranRank(merc.kills, merc.missionsSurvived);
  if (newRank > merc.rank) {
    promoteMercenary(merc, newRank);
    return true;
  }
  return false;
}

/**
 * Register mission survival for carryover veterans.
 */
export function registerMissionSurvival(merc: MercenaryRecord): boolean {
  merc.missionsSurvived++;
  const newRank = calculateVeteranRank(merc.kills, merc.missionsSurvived);
  if (newRank > merc.rank) {
    promoteMercenary(merc, newRank);
    return true;
  }
  return false;
}

/**
 * Apply rank promotion, assigning chevron and perks.
 */
export function promoteMercenary(merc: MercenaryRecord, targetRank: VeteranRank): void {
  merc.rank = targetRank;
  const def = VETERAN_RANKS[targetRank];
  merc.chevron = def.chevron;
  merc.perkName = getMercenaryPerk(merc.kind, targetRank);
}

/**
 * Evaluates whether a mercenary should automatically drink a potion from their belt.
 * Triggers when HP drops below 30% (< 0.30 max HP).
 * Returns true if a potion was consumed.
 */
export function checkAndConsumeMercAutoPotion(
  merc: MercenaryRecord,
  currentHp: number,
  maxHp: number,
  consumeCallback: (potionItemId: number) => boolean,
): boolean {
  if (currentHp <= 0 || maxHp <= 0) return false;
  const hpRatio = currentHp / maxHp;
  if (hpRatio >= 0.30) return false;

  for (let slot = 0; slot < merc.potionBelt.length; slot++) {
    const pot = merc.potionBelt[slot];
    if (pot !== undefined && pot >= 0) {
      const success = consumeCallback(pot);
      if (success) {
        merc.potionBelt[slot] = -1;
        return true;
      }
    }
  }
  return false;
}

/**
 * Calculate the gold tithe required to resurrect a fallen veteran at the Arcane Sanctum / School.
 * Scale:
 * - Recruit (Rank 0): 100 gold
 * - Veteran (Rank 1): 200 gold
 * - Elite (Rank 2): 350 gold
 * - Champion Guard (Rank 3): 550 gold
 */
export function templeResurrectionCost(rank: VeteranRank): number {
  switch (rank) {
    case 3:
      return 550;
    case 2:
      return 350;
    case 1:
      return 200;
    default:
      return 100;
  }
}

/**
 * Compute total stat scaling for a mercenary based on their veterancy rank.
 */
export function getMercenaryStatMultipliers(rank: VeteranRank): {
  hpMultiplier: number;
  dmgMultiplier: number;
  accBonus: number;
} {
  const def = VETERAN_RANKS[rank] ?? VETERAN_RANKS[0];
  return {
    hpMultiplier: 1 + def.hpPctBonus / 100,
    dmgMultiplier: 1 + def.dmgPctBonus / 100,
    accBonus: def.accBonus,
  };
}
