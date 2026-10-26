/** Spell table and status ids. Pure data (our own numbers), so the sim, the UI and the tests share one list. */

/** Targeting kinds: a living enemy, a living friend, a ground point, an enemy plus its neighbours, the caster, a dead unit. */
export const Tk = { Foe: 0, Ally: 1, Ground: 2, Multi: 3, Self: 4, Corpse: 5 } as const;
/** Status effects. Timers and values live per unit in CombatState. */
export const St = { Bless: 0, Shield: 1, Haste: 2, Slow: 3, Poison: 4, Burn: 5, Stone: 6, Weaken: 7 } as const;
export const NST = 8;
export const CURSES = (1 << St.Slow) | (1 << St.Poison) | (1 << St.Burn) | (1 << St.Stone) | (1 << St.Weaken);

/** Schools match the damage kinds in combat.ts: 1 fire, 2 water, 3 air, 4 earth, 5 astral. */
export interface SpellDef {
  name: string;
  school: number;
  tk: number;
  cost: number;
  cd: number; // ticks, at most 255
  reach: number; // tiles
  min: number;
  max: number;
  radius: number; // tiles, area and multi
  count: number; // targets of a multi spell
  heal: boolean;
  st: number; // status applied, or -1
  dur: number; // seconds
  val: number; // shield points, poison stacks added, burn damage per second, mana restored
}

const d = (
  name: string,
  school: number,
  tk: number,
  cost: number,
  cd: number,
  reach: number,
  min: number,
  max: number,
  extra: Partial<SpellDef> = {},
): SpellDef => ({ name, school, tk, cost, cd, reach, min, max, radius: 0, count: 1, heal: false, st: -1, dur: 0, val: 0, ...extra });

export const SPELLS: readonly SpellDef[] = [
  // fire
  d('Fire Bolt', 1, Tk.Foe, 8, 30, 7, 16, 24),
  d('Fireball', 1, Tk.Ground, 14, 40, 8, 18, 28, { radius: 2 }),
  d('Flame Burst', 1, Tk.Multi, 12, 35, 7, 12, 18, { radius: 3.5, count: 3 }),
  d('Ignite', 1, Tk.Foe, 8, 30, 6, 0, 0, { st: St.Burn, dur: 6, val: 2 }),
  // water
  d('Frost Bolt', 2, Tk.Foe, 8, 30, 7, 12, 18, { st: St.Slow, dur: 8 }),
  d('Ice Storm', 2, Tk.Ground, 16, 45, 8, 10, 16, { radius: 2.5, st: St.Slow, dur: 6 }),
  d('Chain Frost', 2, Tk.Multi, 14, 40, 7, 9, 14, { radius: 3.5, count: 4, st: St.Slow, dur: 4 }),
  d('Healing', 2, Tk.Ally, 10, 30, 7, 30, 45, { heal: true }),
  d('Healing Rain', 2, Tk.Ground, 18, 50, 8, 14, 22, { radius: 3, heal: true }),
  // air
  d('Lightning', 3, Tk.Foe, 12, 35, 8, 24, 34),
  d('Chain Lightning', 3, Tk.Multi, 16, 40, 7, 14, 22, { radius: 3.5, count: 4 }),
  d('Haste', 3, Tk.Ally, 12, 30, 7, 0, 0, { st: St.Haste, dur: 25 }),
  d('Gale', 3, Tk.Ground, 12, 40, 8, 8, 12, { radius: 3, st: St.Slow, dur: 5 }),
  d('Wind Ward', 3, Tk.Self, 8, 30, 0, 0, 0, { st: St.Shield, dur: 45, val: 35 }),
  // earth
  d('Rock Throw', 4, Tk.Foe, 9, 32, 7, 18, 26),
  d('Stone Curse', 4, Tk.Foe, 16, 40, 6, 0, 0, { st: St.Stone, dur: 5 }),
  d('Stone Skin', 4, Tk.Ally, 10, 30, 7, 0, 0, { st: St.Shield, dur: 45, val: 50 }),
  d('Poison Cloud', 4, Tk.Ground, 12, 40, 8, 0, 0, { radius: 2.5, st: St.Poison, dur: 12, val: 1 }),
  d('Quake', 4, Tk.Ground, 22, 60, 7, 20, 30, { radius: 3.5 }),
  // astral
  d('Blessing', 5, Tk.Ally, 10, 30, 7, 0, 0, { st: St.Bless, dur: 60 }),
  d('Weaken', 5, Tk.Foe, 8, 30, 7, 0, 0, { st: St.Weaken, dur: 30 }),
  d('Resurrect', 5, Tk.Corpse, 30, 75, 6, 0, 0),
  d('Corpse Burst', 5, Tk.Corpse, 14, 50, 7, 18, 26, { radius: 2.5 }),
  d('Meditation', 5, Tk.Self, 0, 250, 0, 0, 0, { val: 12 }),
];

export const SPELL_COUNT = SPELLS.length;
export const ALL_SPELLS = (1 << SPELL_COUNT) - 1;
/** Spells a Mage knows: Fire Bolt, Fireball, Frost Bolt, Healing, Blessing, Weaken. */
export const MAGE_SPELLS = (1 << 0) | (1 << 1) | (1 << 4) | (1 << 7) | (1 << 19) | (1 << 20);
export const CORPSE_TICKS = 1500; // a body can be raised or burst for 60 seconds
export const POISON_STACKS = 3;
