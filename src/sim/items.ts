import { SPELLS } from './spelldata';

/** Item table (our own simplified list). Pure data, shared by the sim, the UI and the tests. */

export const Slot = { Weapon: 0, Shield: 1, Helm: 2, Armor: 3, Boots: 4, Ring: 5, Amulet: 6 } as const;
export const SLOT_COUNT = 7;
export const SLOT_NAMES = ['Weapon', 'Shield', 'Helm', 'Armor', 'Boots', 'Ring', 'Amulet'] as const;
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
  def: number;
  abs: number;
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

const Z5 = [0, 0, 0, 0, 0] as const;
const Z4 = [0, 0, 0, 0] as const;

function item(name: string, kind: number, tier: number, w: number, extra: Partial<ItemDef>): ItemDef {
  return { name, kind, slot: -1, tier, w, cls: CLS_BOTH, need: 0, needv: 0, min: 0, max: 0, acc: 0, def: 0, abs: 0, res: Z5, attr: Z4, hp: 0, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1, ...extra };
}
const gear = (name: string, slot: number, tier: number, w: number, cls: number, need: number, needv: number, extra: Partial<ItemDef> = {}): ItemDef =>
  item(name, Ik.Gear, tier, w, { slot, cls, need, needv, ...extra });

const B = Attr.Body;
const A = Attr.Agility;
const M = Attr.Mind;
const P = Attr.Spirit;

const LIST: ItemDef[] = [
  // weapons: swords for warriors, staves for mages
  gear('Rusty Sword', Slot.Weapon, 1, 4, CLS_WARRIOR, B, 4, { min: 2, max: 3 }),
  gear('Iron Sword', Slot.Weapon, 2, 6, CLS_WARRIOR, B, 8, { min: 4, max: 6, acc: 1 }),
  gear('Steel Sword', Slot.Weapon, 3, 7, CLS_WARRIOR, B, 11, { min: 7, max: 9, acc: 2 }),
  gear('Knight Sword', Slot.Weapon, 4, 8, CLS_WARRIOR, B, 14, { min: 10, max: 13, acc: 3 }),
  gear('Thorn Blade', Slot.Weapon, 5, 9, CLS_WARRIOR, B, 17, { min: 14, max: 18, acc: 4 }),
  gear('Oak Staff', Slot.Weapon, 1, 3, CLS_MAGE, M, 5, { max: 1, pow: 6, mana: 4 }),
  gear('Ash Staff', Slot.Weapon, 2, 3, CLS_MAGE, M, 8, { min: 1, max: 2, pow: 12, mana: 8 }),
  gear('Rune Staff', Slot.Weapon, 3, 4, CLS_MAGE, M, 11, { min: 1, max: 2, pow: 20, mana: 14 }),
  gear('Star Staff', Slot.Weapon, 4, 4, CLS_MAGE, M, 14, { min: 2, max: 3, pow: 30, mana: 22 }),
  gear('Thorn Staff', Slot.Weapon, 5, 5, CLS_MAGE, M, 17, { min: 2, max: 4, pow: 42, mana: 32 }),
  // shields (warriors)
  gear('Wooden Buckler', Slot.Shield, 1, 3, CLS_WARRIOR, B, 4, { def: 1 }),
  gear('Iron Shield', Slot.Shield, 2, 7, CLS_WARRIOR, B, 8, { def: 2, abs: 1 }),
  gear('Tower Shield', Slot.Shield, 3, 12, CLS_WARRIOR, B, 12, { def: 3, abs: 2 }),
  gear('Knight Shield', Slot.Shield, 4, 13, CLS_WARRIOR, B, 15, { def: 4, abs: 3 }),
  // helms
  gear('Leather Cap', Slot.Helm, 1, 1, CLS_BOTH, B, 3, { def: 1 }),
  gear('Iron Helm', Slot.Helm, 2, 4, CLS_WARRIOR, B, 7, { def: 1, abs: 1 }),
  gear('Steel Helm', Slot.Helm, 4, 5, CLS_WARRIOR, B, 12, { def: 2, abs: 2 }),
  gear('Scholar Hat', Slot.Helm, 2, 1, CLS_MAGE, M, 6, { mana: 6 }),
  gear('Wizard Hat', Slot.Helm, 4, 2, CLS_MAGE, M, 12, { mana: 16, pow: 6 }),
  // armor
  gear('Padded Jerkin', Slot.Armor, 1, 5, CLS_BOTH, B, 4, { abs: 1 }),
  gear('Chain Mail', Slot.Armor, 2, 14, CLS_WARRIOR, B, 9, { abs: 2, def: 1 }),
  gear('Plate Armor', Slot.Armor, 4, 24, CLS_WARRIOR, B, 14, { abs: 4, def: 2 }),
  gear('Cloth Robe', Slot.Armor, 1, 2, CLS_MAGE, M, 4, { mana: 6 }),
  gear('Mage Robe', Slot.Armor, 3, 3, CLS_MAGE, M, 9, { mana: 14, res: [10, 10, 10, 10, 10] }),
  gear('Star Robe', Slot.Armor, 5, 4, CLS_MAGE, M, 15, { mana: 26, pow: 8, res: [18, 18, 18, 18, 18] }),
  // boots
  gear('Sandals', Slot.Boots, 1, 1, CLS_BOTH, A, 3, {}),
  gear('Leather Boots', Slot.Boots, 2, 2, CLS_BOTH, A, 6, { def: 1 }),
  gear('Iron Boots', Slot.Boots, 3, 5, CLS_WARRIOR, B, 10, { def: 1, abs: 1 }),
  gear('Swift Boots', Slot.Boots, 4, 2, CLS_BOTH, A, 12, { attr: [0, 2, 0, 0] }),
  // rings
  gear('Ring of Might', Slot.Ring, 2, 0, CLS_BOTH, P, 6, { attr: [1, 0, 0, 0] }),
  gear('Ring of Grace', Slot.Ring, 2, 0, CLS_BOTH, P, 6, { attr: [0, 1, 0, 0] }),
  gear('Ring of Insight', Slot.Ring, 2, 0, CLS_BOTH, P, 6, { attr: [0, 0, 1, 0] }),
  gear('Ring of Calm', Slot.Ring, 2, 0, CLS_BOTH, P, 6, { attr: [0, 0, 0, 1] }),
  gear('Great Ring of Might', Slot.Ring, 4, 0, CLS_BOTH, P, 11, { attr: [2, 0, 0, 0] }),
  gear('Great Ring of Grace', Slot.Ring, 4, 0, CLS_BOTH, P, 11, { attr: [0, 2, 0, 0] }),
  gear('Great Ring of Insight', Slot.Ring, 4, 0, CLS_BOTH, P, 11, { attr: [0, 0, 2, 0] }),
  gear('Great Ring of Calm', Slot.Ring, 4, 0, CLS_BOTH, P, 11, { attr: [0, 0, 0, 2] }),
  // amulets
  gear('Ember Charm', Slot.Amulet, 2, 1, CLS_BOTH, P, 5, { res: [25, 0, 0, 0, 0] }),
  gear('Frost Charm', Slot.Amulet, 2, 1, CLS_BOTH, P, 5, { res: [0, 25, 0, 0, 0] }),
  gear('Storm Charm', Slot.Amulet, 2, 1, CLS_BOTH, P, 5, { res: [0, 0, 25, 0, 0] }),
  gear('Stone Charm', Slot.Amulet, 2, 1, CLS_BOTH, P, 5, { res: [0, 0, 0, 25, 0] }),
  gear('Life Charm', Slot.Amulet, 3, 1, CLS_BOTH, B, 8, { hp: 30 }),
  gear('Mind Charm', Slot.Amulet, 3, 1, CLS_BOTH, M, 8, { mana: 25 }),
  gear('Ward Charm', Slot.Amulet, 4, 1, CLS_BOTH, P, 10, { res: [12, 12, 12, 12, 12] }),
  // potions
  item('Healing Draught', Ik.Potion, 1, 1, { heal: 50 }),
  item('Greater Healing Draught', Ik.Potion, 3, 1, { heal: 120 }),
  item('Mana Draught', Ik.Potion, 1, 1, { restore: 40 }),
  item('Greater Mana Draught', Ik.Potion, 3, 1, { restore: 90 }),
  item('Elixir of Body', Ik.Potion, 4, 1, { grow: B + 1 }),
  item('Elixir of Agility', Ik.Potion, 4, 1, { grow: A + 1 }),
  item('Elixir of Mind', Ik.Potion, 4, 1, { grow: M + 1 }),
  item('Elixir of Spirit', Ik.Potion, 4, 1, { grow: P + 1 }),
];

/** One scroll or tome per spell: cheap spells come on scrolls, the rest in tomes. The Mind needed grows with the mana cost. */
SPELLS.forEach((sp, sid) => {
  const scroll = sp.cost <= 14;
  const need = Math.max(3, (scroll ? 1 : 3) + Math.ceil(sp.cost / 3));
  const tier = Math.min(5, 1 + Math.ceil(sp.cost / 6));
  LIST.push(item(`${scroll ? 'Scroll' : 'Tome'} of ${sp.name}`, Ik.Learn, scroll ? Math.max(2, tier) : Math.max(3, tier), scroll ? 1 : 2, { need: M, needv: need, spell: sid }));
});

export const ITEMS: readonly ItemDef[] = LIST;
export const ITEM_COUNT = ITEMS.length;
export const itemId = (name: string): number => ITEMS.findIndex((d) => d.name === name);

/** Loot pools: [category][tier] -> item ids. Categories: 0 gear, 1 potion, 2 learn. */
const POOL: number[][][] = [0, 1, 2].map(() => [[], [], [], [], [], []]);
ITEMS.forEach((d, id) => POOL[d.kind][d.tier].push(id));

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
  if (d.def) p.push(`Defence +${d.def}`);
  if (d.abs) p.push(`Absorb +${d.abs}`);
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
