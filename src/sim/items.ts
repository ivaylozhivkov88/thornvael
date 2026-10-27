import { SPELLS } from './spelldata';

/** Item types. The table itself lives in public/data/items.json, loaded once by data.ts before a game starts. */

export const Slot = { Weapon: 0, Shield: 1, Helm: 2, Armor: 3, Boots: 4, Ring: 5, Amulet: 6, Gloves: 7 } as const;
export const SLOT_COUNT = 8;
export const SLOT_NAMES = ['Weapon', 'Shield', 'Helm', 'Armor', 'Boots', 'Ring', 'Amulet', 'Gloves'] as const;
/** Body parts a blow can land on. Each has its own defence and absorption; armour covers one or more. */
export const Part = { Head: 0, Torso: 1, Arms: 2, Legs: 3 } as const;
export const PART_COUNT = 4;
export const PART_NAMES = ['head', 'torso', 'arms', 'legs'] as const;
/** Chance in percent that a blow lands on each part (sums to 100). */
export const PART_WEIGHT = [15, 45, 20, 20] as const;
/** Blow damage in percent per part, before absorption: the head takes more. */
export const PART_DMG = [150, 100, 100, 100] as const;
/** Gear is worn; potions are used up; learn items (scroll or tome) teach a spell for good. */
export const Ik = { Gear: 0, Potion: 1, Learn: 2 } as const;
export const Cls = { Warrior: 0, Mage: 1 } as const;
export const Attr = { Body: 0, Agility: 1, Mind: 2, Spirit: 3 } as const;
export const ATTR_NAMES = ['Body', 'Agility', 'Mind', 'Spirit'] as const;
export const CLS_WARRIOR = 1;
export const CLS_MAGE = 2;
export const CLS_BOTH = 3;

export interface ItemDef {
  name: string;
  kind: number;
  slot: number; // -1 unless gear
  tier: number; // item level 1..5
  w: number; // weight
  cls: number; // class mask: 1 warrior, 2 mage
  need: number; // attribute index required to use the item
  needv: number;
  min: number; // added blow damage
  max: number;
  acc: number;
  cover: number; // bit per body part this piece protects
  def: number; // defence on each covered part
  abs: number; // absorption on each covered part
  res: readonly [number, number, number, number, number]; // percent: fire, water, air, earth, astral
  attr: readonly [number, number, number, number]; // bonus to Body, Agility, Mind, Spirit
  hp: number;
  mana: number;
  pow: number; // spell power, percent
  heal: number;
  restore: number;
  grow: number; // attribute index + 1 raised by one for good, or 0
  spell: number; // spell taught, or -1
}

const LIST: ItemDef[] = [];
/** Filled from items.json by installData; the index is the item id. */
export const ITEMS: readonly ItemDef[] = LIST;
export const itemId = (name: string): number => ITEMS.findIndex((d) => d.name === name);

/** Loot pools: [category][tier] -> item ids. Categories: 0 gear, 1 potion, 2 learn. */
let POOL: number[][][] = [];

export function setItems(defs: readonly ItemDef[]): void {
  LIST.length = 0;
  LIST.push(...defs);
  POOL = [0, 1, 2].map(() => [[], [], [], [], [], []]);
  ITEMS.forEach((d, id) => POOL[d.kind][d.tier].push(id));
}

/** Pick a loot item for a monster whose drops range over tiers lo..hi. `rnd(n)` returns an integer in 0..n-1. */
export function rollLoot(rnd: (n: number) => number, lo: number, hi: number): number {
  const r = rnd(100);
  const cat = r < 55 ? 0 : r < 80 ? 1 : 2;
  const tier = lo + rnd(hi - lo + 1);
  let pool = POOL[cat][tier];
  if (pool.length === 0) {
    pool = [];
    for (let t = 1; t <= hi; t++) pool.push(...POOL[cat][t]);
  }
  if (pool.length === 0) pool = POOL[1][1];
  return pool[rnd(pool.length)];
}

/** Drop rules per unit kind (index into the combat table): [chance percent, lowest tier, highest tier]. */
export const LOOT_RULES: readonly (readonly [number, number, number])[] = [
  [20, 1, 2], // Warrior
  [35, 1, 3], // Archer
  [0, 1, 1], // Hero
  [35, 2, 4], // Mage
  [30, 1, 2], // Gnoll
  [85, 3, 5], // Golem
  [35, 2, 3], // Imp
];

const SCHOOL_NAMES = ['fire', 'water', 'air', 'earth', 'astral'];

/** Short stat line for tooltips and the pack. */
export function itemText(id: number): string {
  const d = ITEMS[id];
  const p: string[] = [];
  const kind = d.kind === Ik.Gear ? SLOT_NAMES[d.slot] : d.kind === Ik.Potion ? 'Potion' : d.w > 1 ? 'Tome' : 'Scroll';
  p.push(`${d.name} (${kind}, level ${d.tier}, weight ${d.w})`);
  if (d.max > 0) p.push(`Blow damage +${d.min}-${d.max}`);
  if (d.acc) p.push(`Hit +${d.acc}`);
  if (d.cover && (d.def || d.abs)) {
    const parts = PART_NAMES.filter((_, k) => (d.cover >> k) & 1).join(', ');
    p.push(`Covers ${parts}: defence +${d.def}, absorb +${d.abs}`);
  }
  d.res.forEach((v, n) => v && p.push(`Resist ${SCHOOL_NAMES[n]} +${v}%`));
  d.attr.forEach((v, n) => v && p.push(`${ATTR_NAMES[n]} +${v}`));
  if (d.hp) p.push(`Hit points +${d.hp}`);
  if (d.mana) p.push(`Mana +${d.mana}`);
  if (d.pow) p.push(`Spell power +${d.pow}%`);
  if (d.heal) p.push(`Heals ${d.heal}`);
  if (d.restore) p.push(`Restores ${d.restore} mana`);
  if (d.grow) p.push(`Raises ${ATTR_NAMES[d.grow - 1]} by 1 for good`);
  if (d.spell >= 0) p.push(`Teaches ${SPELLS[d.spell].name}`);
  if (d.needv > 0) p.push(`Needs ${ATTR_NAMES[d.need]} ${d.needv}`);
  if (d.kind === Ik.Gear) p.push(d.cls === CLS_BOTH ? 'Warriors and mages' : d.cls === CLS_WARRIOR ? 'Warriors only' : 'Mages only');
  return p.join('\n');
}
