/**
 * End-Game Nightmare & Hell Calibration (Phase 11).
 *
 * Calibrates end-game ARPG progression across difficulty tiers:
 * - Normal: standard baseline challenge.
 * - Nightmare: +50% monster HP/damage, +25% all elemental resists, +50% unique/set drop boost.
 * - Hell: +120% monster HP/damage, +50% all elemental resists, elemental immunities on champions, +120% unique/set drop boost.
 */

export type DifficultyTier = 'normal' | 'nightmare' | 'hell';

export interface DifficultyCalibration {
  readonly tier: DifficultyTier;
  readonly name: string;
  /** Multiplier for monster maximum health (1.0 = normal, 1.5 = +50% Nightmare, 2.2 = +120% Hell) */
  readonly monsterHpMult: number;
  /** Multiplier for monster attack damage (1.0 = normal, 1.5 = +50% Nightmare, 2.2 = +120% Hell) */
  readonly monsterDmgMult: number;
  /** Flat bonus to all elemental resistances (+0 normal, +25 Nightmare, +50 Hell) */
  readonly allResistBonus: number;
  /** Champions and bosses gain elemental immunity (100% resistance) in Hell */
  readonly championElementalImmunity: boolean;
  /** Multiplier for unique artifact drop rates */
  readonly uniqueDropMult: number;
  /** Multiplier for set item drop rates */
  readonly setDropMult: number;
}

export const DIFFICULTY_CALIBRATIONS: Record<DifficultyTier, DifficultyCalibration> = {
  normal: {
    tier: 'normal',
    name: 'Normal / Veteran',
    monsterHpMult: 1.0,
    monsterDmgMult: 1.0,
    allResistBonus: 0,
    championElementalImmunity: false,
    uniqueDropMult: 1.0,
    setDropMult: 1.0,
  },
  nightmare: {
    tier: 'nightmare',
    name: 'Nightmare',
    monsterHpMult: 1.5,
    monsterDmgMult: 1.5,
    allResistBonus: 25,
    championElementalImmunity: false,
    uniqueDropMult: 1.5,
    setDropMult: 1.4,
  },
  hell: {
    tier: 'hell',
    name: 'Hell',
    monsterHpMult: 2.2,
    monsterDmgMult: 2.2,
    allResistBonus: 50,
    championElementalImmunity: true,
    uniqueDropMult: 2.2,
    setDropMult: 1.8,
  },
};

/**
 * Maps numeric or string difficulty representations to a calibrated tier:
 * 0 -> normal
 * 1 -> normal
 * 2 -> nightmare
 * 3 -> hell
 */
export function getDifficultyTier(diff: number | string | undefined): DifficultyTier {
  if (typeof diff === 'string') {
    const s = diff.toLowerCase();
    if (s.includes('hell') || s === '3') return 'hell';
    if (s.includes('night') || s.includes('hard') || s === '2') return 'nightmare';
    return 'normal';
  }
  if (diff === 3) return 'hell';
  if (diff === 2) return 'nightmare';
  return 'normal';
}

export function getDifficultyCalibration(diff: number | string | undefined): DifficultyCalibration {
  const tier = getDifficultyTier(diff);
  return DIFFICULTY_CALIBRATIONS[tier];
}

/**
 * Returns the effective elemental resistance after applying difficulty calibration bonuses.
 * In Hell difficulty, champions and bosses gain elemental immunity (100% resistance)
 * on their aligned primary element.
 */
export function calculateCalibratedResist(
  baseRes: number,
  elem: number, // 1..5: Fire, Water, Air, Earth, Astral
  unitId: number,
  isFoe: boolean,
  isChampionOrBoss: boolean,
  diff: number | string | undefined,
): number {
  if (!isFoe || diff === undefined || diff === 0 || diff === 1 || diff === 'normal') {
    return Math.min(90, baseRes);
  }

  const cal = getDifficultyCalibration(diff);
  let res = baseRes + cal.allResistBonus;

  if (cal.championElementalImmunity && isChampionOrBoss) {
    // Deterministic elemental immunity based on unit id (1: Fire, 2: Water, 3: Air, 4: Earth, 5: Astral)
    const immuneElem = (unitId % 5) + 1;
    if (elem === immuneElem) {
      return 100; // True Elemental Immunity
    }
  }

  return Math.min(90, res);
}
