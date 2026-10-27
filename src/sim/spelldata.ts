/** Spell types and status ids. The numbers live in public/data/spells.json, loaded once by data.ts before a game starts. */

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

const list: SpellDef[] = [];
/** Filled from spells.json by installData; the index is the spell id. */
export const SPELLS: readonly SpellDef[] = list;
export function setSpells(defs: readonly SpellDef[]): void {
  list.length = 0;
  list.push(...defs);
}

export const MAX_SPELLS = 32; // known spells are one bit each in a Uint32
export const ALL_SPELLS = 0xffffffff;
/** Spells a Mage knows: Fire Bolt, Fireball, Frost Bolt, Healing, Blessing, Weaken (ids are the order in spells.json). */
export const MAGE_SPELLS = (1 << 0) | (1 << 1) | (1 << 4) | (1 << 7) | (1 << 19) | (1 << 20);
export const CORPSE_TICKS = 1500; // a body can be raised or burst for 60 seconds
export const POISON_STACKS = 3;
