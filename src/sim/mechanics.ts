/**
 * Combat Mechanics & Breakpoints Engine
 *
 * Implements combat mathematical mechanics:
 * 1. Chance to Hit formula: clamp(200 * (AR / (AR + Def)) * (Alvl / (Alvl + Dlvl)), 5%, 95%)
 * 2. FHR (Faster Hit Recovery) frame breakpoints & flinch trigger (> 1/12th Max HP)
 * 3. FCR (Faster Cast Rate) & IAS (Increased Attack Speed) frame breakpoint tables
 * 4. Elemental & Physical resistances, cap at 75% (+Max Resist up to 95%), Nightmare (-40%) & Hell (-100%) penalties
 * 5. Crushing Blow, Deadly Strike, Open Wounds, Leech penalties, Prevent Monster Heal, Knockback, Freeze/Chill shatter
 * 6. Magic Find (MF) formula with diminishing returns for Uniques (250), Sets (500), Rares (600), Magics (linear)
 */

export interface HitChanceParams {
  attackerAr: number;
  defenderDef: number;
  attackerLevel: number;
  defenderLevel: number;
}

/**
 * Calculates Chance to Hit percentage (5% to 95% clamped):
 * Hit% = clamp(200 * (AR / (AR + Def)) * (Alvl / (Alvl + Dlvl)), 5, 95)
 */
export function calculateHitChance(
  attackerAr: number,
  defenderDef: number,
  attackerLevel: number,
  defenderLevel: number,
): number {
  const ar = Math.max(0, attackerAr);
  const def = Math.max(0, defenderDef);
  const alvl = Math.max(1, attackerLevel);
  const dlvl = Math.max(1, defenderLevel);

  // If AR and Def are both 0, ratio is 0.5 (100)
  const arFactor = ar + def === 0 ? 0.5 : ar / (ar + def);
  const lvlFactor = alvl / (alvl + dlvl);

  const rawPercent = Math.floor(200 * arFactor * lvlFactor);
  return Math.max(5, Math.min(95, rawPercent));
}

/**
 * Determines whether an incoming damage blow triggers a flinch / hit recovery.
 * A target enters hit recovery if damage > Max HP / 12 (more than 8.33% of max life in one hit).
 */
export function shouldTriggerFlinch(dmg: number, maxHp: number): boolean {
  if (dmg <= 0 || maxHp <= 0) return false;
  return dmg > Math.floor(maxHp / 12);
}

/**
 * Faster Hit Recovery (FHR) frame breakpoint tables (25 frames/second standard).
 * Class 0 = Warrior / Vanguard
 * Class 1 = Mage / Necromancer
 */
export const FHR_BREAKPOINTS: Record<number, readonly { fhr: number; frames: number }[]> = {
  // Warrior: 0% -> 9f, 7% -> 8f, 15% -> 7f, 27% -> 6f, 48% -> 5f, 86% -> 4f, 200% -> 3f
  0: [
    { fhr: 200, frames: 3 },
    { fhr: 86, frames: 4 },
    { fhr: 48, frames: 5 },
    { fhr: 27, frames: 6 },
    { fhr: 15, frames: 7 },
    { fhr: 7, frames: 8 },
    { fhr: 0, frames: 9 },
  ],
  // Mage: 0% -> 15f, 5% -> 14f, 9% -> 13f, 14% -> 12f, 20% -> 11f, 30% -> 10f, 42% -> 9f, 60% -> 8f, 86% -> 7f, 142% -> 6f, 280% -> 5f
  1: [
    { fhr: 280, frames: 5 },
    { fhr: 142, frames: 6 },
    { fhr: 86, frames: 7 },
    { fhr: 60, frames: 8 },
    { fhr: 42, frames: 9 },
    { fhr: 30, frames: 10 },
    { fhr: 20, frames: 11 },
    { fhr: 14, frames: 12 },
    { fhr: 9, frames: 13 },
    { fhr: 5, frames: 14 },
    { fhr: 0, frames: 15 },
  ],
};

/**
 * Returns FHR recovery duration in frames (25 FPS).
 */
export function getFHRDurationFrames(cls: number, fhrPercent: number): number {
  const table = FHR_BREAKPOINTS[cls === 1 ? 1 : 0];
  const fhr = Math.max(0, fhrPercent);
  for (const bp of table) {
    if (fhr >= bp.fhr) return bp.frames;
  }
  return table[table.length - 1].frames;
}

/**
 * Converts FHR frames to simulation ticks (20 ticks/sec engine).
 */
export function getFHRDurationTicks(cls: number, fhrPercent: number): number {
  const frames = getFHRDurationFrames(cls, fhrPercent);
  return Math.max(1, Math.round((frames * 20) / 25));
}

/**
 * Faster Cast Rate (FCR) frame breakpoint tables (25 frames/second standard).
 */
export const FCR_BREAKPOINTS: Record<number, readonly { fcr: number; frames: number }[]> = {
  // Mage: 0% -> 13f, 9% -> 12f, 20% -> 11f, 37% -> 10f, 63% -> 9f, 105% -> 8f, 200% -> 7f
  1: [
    { fcr: 200, frames: 7 },
    { fcr: 105, frames: 8 },
    { fcr: 63, frames: 9 },
    { fcr: 37, frames: 10 },
    { fcr: 20, frames: 11 },
    { fcr: 9, frames: 12 },
    { fcr: 0, frames: 13 },
  ],
  // Warrior: 0% -> 15f, 9% -> 14f, 18% -> 13f, 30% -> 12f, 48% -> 11f, 75% -> 10f, 125% -> 9f
  0: [
    { fcr: 125, frames: 9 },
    { fcr: 75, frames: 10 },
    { fcr: 48, frames: 11 },
    { fcr: 30, frames: 12 },
    { fcr: 18, frames: 13 },
    { fcr: 9, frames: 14 },
    { fcr: 0, frames: 15 },
  ],
};

/**
 * Returns FCR cast animation duration in frames (25 FPS).
 */
export function getFCRFrames(cls: number, fcrPercent: number): number {
  const table = FCR_BREAKPOINTS[cls === 1 ? 1 : 0];
  const fcr = Math.max(0, fcrPercent);
  for (const bp of table) {
    if (fcr >= bp.fcr) return bp.frames;
  }
  return table[table.length - 1].frames;
}

/**
 * Calculates cast cooldown in sim ticks based on FCR.
 */
export function getFCRCastCooldown(baseCd: number, fcrPercent: number, cls: number): number {
  const baseFrames = cls === 1 ? 13 : 15;
  const currentFrames = getFCRFrames(cls, fcrPercent);
  const ratio = currentFrames / baseFrames;
  return Math.max(2, Math.round(baseCd * ratio));
}

/**
 * Calculates attack cooldown in sim ticks based on Increased Attack Speed (IAS).
 * IAS follows diminishing returns equation: EIAS = Math.floor((120 * IAS) / (120 + IAS))
 */
export function getIASAttackCooldown(baseCd: number, iasPercent: number): number {
  const ias = Math.max(0, iasPercent);
  if (ias === 0) return baseCd;
  const eias = Math.floor((120 * ias) / (120 + ias));
  const mult = 100 / (100 + eias);
  return Math.max(4, Math.round(baseCd * mult));
}

/**
 * Difficulty resistance penalties for player heroes:
 * - Normal: 0%
 * - Nightmare: -40%
 * - Hell: -100%
 */
export function getDifficultyResistPenalty(diff: number | string | undefined): number {
  if (typeof diff === 'string') {
    const s = diff.toLowerCase();
    if (s.includes('hell') || s === '3') return -100;
    if (s.includes('night') || s.includes('hard') || s === '2') return -40;
    return 0;
  }
  if (diff === 3) return -100;
  if (diff === 2) return -40;
  return 0;
}

/**
 * Calculates effective resistance after difficulty penalty and max resistance cap.
 * Default cap is 75%, expandable via +maxResBonus up to absolute cap of 95%.
 */
export function calculateEffectiveResistance(
  baseRes: number,
  maxResBonus = 0,
  diff: number | string | undefined = 0,
): { effectiveRes: number; cap: number } {
  const penalty = getDifficultyResistPenalty(diff);
  const rawRes = baseRes + penalty;
  const cap = Math.min(95, 75 + Math.max(0, maxResBonus));
  const effectiveRes = Math.max(-100, Math.min(cap, rawRes));
  return { effectiveRes, cap };
}

/**
 * Crushing Blow calculation:
 * - Melee vs Normal Monster: 25% (1/4) of current HP
 * - Ranged vs Normal Monster: 12.5% (1/8) of current HP
 * - Melee vs Boss / Champion: 12.5% (1/8) of current HP
 * - Ranged vs Boss / Champion: 6.25% (1/16) of current HP
 * Damage is reduced by positive physical resistance, but not below 1.
 */
export function calculateCrushingBlowDamage(
  currentHp: number,
  isRanged: boolean,
  isBoss: boolean,
  physicalResistance = 0,
): number {
  if (currentHp <= 0) return 0;
  let fraction: number;
  if (isBoss) {
    fraction = isRanged ? 1 / 16 : 1 / 8;
  } else {
    fraction = isRanged ? 1 / 8 : 1 / 4;
  }
  const rawCb = Math.floor(currentHp * fraction);
  if (rawCb <= 0) return 1;
  const res = Math.max(0, Math.min(99, physicalResistance));
  const finalCb = Math.floor(rawCb * (1 - res / 100));
  return Math.max(1, finalCb);
}

/**
 * Deadly Strike calculation:
 * Grants a chance to deal double physical damage.
 */
export function calculateDeadlyStrike(
  dmg: number,
  deadlyStrikeChance: number,
  rngRoll: number, // 0..99
): { dmg: number; isDeadly: boolean } {
  if (deadlyStrikeChance > 0 && rngRoll < Math.min(100, deadlyStrikeChance)) {
    return { dmg: dmg * 2, isDeadly: true };
  }
  return { dmg, isDeadly: false };
}

/**
 * Open Wounds bleeding damage over duration:
 * Open Wounds lasts 200 frames (8 seconds at 25 fps, or 160 ticks at 20 ticks/sec).
 * Clvl per-frame formulas:
 * Clvl 1-15:  (9 * Clvl + 31) / 256 per frame
 * Clvl 16-30: (18 * Clvl - 104) / 256 per frame
 * Clvl 31-45: (27 * Clvl - 374) / 256 per frame
 * Clvl 46-60: (36 * Clvl - 779) / 256 per frame
 * Clvl 61-99: (45 * Clvl - 1319) / 256 per frame
 */
export function calculateOpenWoundsDamage(clvl: number, ticks = 160): number {
  const lvl = Math.max(1, Math.min(99, clvl));
  let perFrame256: number;
  if (lvl <= 15) {
    perFrame256 = 9 * lvl + 31;
  } else if (lvl <= 30) {
    perFrame256 = 18 * lvl - 104;
  } else if (lvl <= 45) {
    perFrame256 = 27 * lvl - 374;
  } else if (lvl <= 60) {
    perFrame256 = 36 * lvl - 779;
  } else {
    perFrame256 = 45 * lvl - 1319;
  }
  const damagePerFrame = Math.max(0.1, perFrame256 / 256);
  // Convert 20 ticks to equivalent 25 frames
  const equivalentFrames = Math.round((ticks * 25) / 20);
  return Math.max(1, Math.round(damagePerFrame * equivalentFrames));
}

/**
 * Life Steal & Mana Steal calculation with difficulty and drain effectiveness penalties:
 * - Normal: 100% effectiveness (1/1)
 * - Nightmare: 50% effectiveness (1/2)
 * - Hell: 33.3% effectiveness (1/3)
 * - Drain effectiveness: 0..100% (some undead/skeletons have 0% leech effectiveness)
 */
export function calculateLeechAmount(
  damageDealt: number,
  leechPct: number,
  diff: number | string | undefined,
  drainEffectiveness = 100,
): number {
  if (damageDealt <= 0 || leechPct <= 0 || drainEffectiveness <= 0) return 0;

  let diffPenalty = 1.0;
  if (typeof diff === 'string') {
    const s = diff.toLowerCase();
    if (s.includes('hell') || s === '3') diffPenalty = 1 / 3;
    else if (s.includes('night') || s.includes('hard') || s === '2') diffPenalty = 0.5;
  } else if (diff === 3) {
    diffPenalty = 1 / 3;
  } else if (diff === 2) {
    diffPenalty = 0.5;
  }

  const drainMult = Math.max(0, Math.min(100, drainEffectiveness)) / 100;
  const rawLeech = damageDealt * (leechPct / 100);
  const effectiveLeech = Math.floor(rawLeech * diffPenalty * drainMult);
  return Math.max(0, effectiveLeech);
}

/**
 * Knockback calculation:
 * Pushes target away from attacker in 2D space by distance in fixed point units.
 */
export function calculateKnockback(
  srcX: number,
  srcY: number,
  tgtX: number,
  tgtY: number,
  distanceFP = 20,
): { x: number; y: number } {
  const dx = tgtX - srcX;
  const dy = tgtY - srcY;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: tgtX + distanceFP, y: tgtY };
  const nx = dx / dist;
  const ny = dy / dist;
  return {
    x: Math.round(tgtX + nx * distanceFP),
    y: Math.round(tgtY + ny * distanceFP),
  };
}

/**
 * Magic Find (MF) diminishing returns formula:
 * Effective MF (EMF) = (MF * Factor) / (MF + Factor)
 * - Unique: Factor 250 -> EMF_Unique = (MF * 250) / (MF + 250)
 * - Set: Factor 500 -> EMF_Set = (MF * 500) / (MF + 500)
 * - Rare: Factor 600 -> EMF_Rare = (MF * 600) / (MF + 600)
 * - Magic: Linear, no diminishing returns -> EMF_Magic = MF
 */
export function calculateEffectiveMFTable(mf: number): {
  unique: number;
  set: number;
  rare: number;
  magic: number;
} {
  const val = Math.max(0, mf);
  if (val === 0) return { unique: 0, set: 0, rare: 0, magic: 0 };
  return {
    unique: Math.round((val * 250) / (val + 250)),
    set: Math.round((val * 500) / (val + 500)),
    rare: Math.round((val * 600) / (val + 600)),
    magic: val,
  };
}

/**
 * Chance to block: min(floor((shield + bonus) * (dex - 15) / (clvl * 2)), 75).
 * Running cuts it to a third (cap 25). Zero without a shield or when dex <= 15.
 */
export function calculateBlockChance(
  shieldBlock: number,
  bonusBlock: number,
  dex: number,
  clvl: number,
  running = false,
): number {
  if (shieldBlock <= 0) return 0;
  const raw = Math.floor(((shieldBlock + Math.max(0, bonusBlock)) * (dex - 15)) / (Math.max(1, clvl) * 2));
  const capped = Math.max(0, Math.min(75, raw));
  return running ? Math.min(25, Math.floor(capped / 3)) : capped;
}

/** Independent crit sources combine as 100 - prod(100 - chance_i) / 100^(n-1). Each chance 0..100. */
export function combineCritChance(...chances: number[]): number {
  let miss = 100;
  for (const c of chances) miss = (miss * (100 - Math.max(0, Math.min(100, c)))) / 100;
  return 100 - miss;
}

export interface MitigationInput {
  /** Flat reduction applied before percentages. */
  flatReduction?: number;
  /** Resistance percent (-100..95) or, for physical, damage-reduced percent (-100..50). */
  resist: number;
  isPhysical?: boolean;
  /** Percent absorb (capped at 40, never applies to physical) and flat absorb (uncapped). */
  absorbPct?: number;
  absorbFlat?: number;
}

/**
 * Order: flat reduction, then resist, then percent absorb, then flat absorb.
 * Returns life lost; negative values mean the absorb healed the target.
 */
export function mitigateDamage(damage: number, m: MitigationInput): number {
  let d = Math.max(0, damage - Math.max(0, m.flatReduction ?? 0));
  const res = m.isPhysical ? Math.max(-100, Math.min(50, m.resist)) : Math.max(-100, Math.min(95, m.resist));
  d = d * (1 - res / 100);
  if (!m.isPhysical) {
    d = d * (1 - Math.max(0, Math.min(40, m.absorbPct ?? 0)) / 100);
    d = d - Math.max(0, m.absorbFlat ?? 0);
  }
  return Math.floor(d + 1e-9);
}

/** Running is 50% faster than walking before the armour penalty. */
export const RUN_SPEED_PCT = 150;
/** Stamina per tick: running drains, otherwise it recovers (standing recovers twice as fast). */
export const STAMINA_DRAIN = 1;
export const STAMINA_REGEN_WALK = 1;
export const STAMINA_REGEN_IDLE = 2;
/** Maximum stamina from Body (attr 0): about 9 seconds of running at 25 ticks per second at Body 0. */
export const staminaMax = (body: number): number => 225 + 10 * Math.max(0, body);
/** After running dry the hero may run again once a quarter of the pool is back. */
export const staminaResumeAt = (max: number): number => Math.floor(max / 4);

/** Run-speed penalty in percent points by armour tier: light (1-2) none, medium (3) -5, heavy (4+) -10. */
export function armourRunPenalty(tier: number): number {
  if (tier >= 4) return -10;
  if (tier === 3) return -5;
  return 0;
}

/** Hero speed percent of walking speed: 100 walking, 150 running, less armour penalty. */
export function heroSpeedPct(running: boolean, armourTier: number): number {
  return running ? RUN_SPEED_PCT + armourRunPenalty(armourTier) : 100;
}
