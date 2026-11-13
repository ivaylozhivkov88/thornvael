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
/** Gear is worn; potions are used up; learn items (scroll or tome) teach a spell for good; portal opens a rift; gem socketed into gear. */
export const Ik = { Gear: 0, Potion: 1, Learn: 2, Portal: 3, Gem: 4 } as const;
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
  sockets?: number; // sockets count (0..3)
  socketedGems?: string[]; // slotted gem names
  lifesteal?: number; // life steal percentage
  runes?: readonly string[]; // architectural hook for future slotted runes
  mf?: number; // Magic Find %
  rarity?: 'common' | 'normal' | 'magic' | 'rare' | 'set' | 'unique' | string;
  set?: string;
}

export type GemType = 'ruby' | 'sapphire' | 'topaz' | 'emerald' | 'skull';
export type GemQuality = 'chipped' | 'flawed' | 'regular' | 'flawless' | 'perfect';

export interface GemDef {
  name: string;
  type: GemType;
  quality: GemQuality;
  tier: number; // 1 to 5
  weaponBonus: { min: number; max: number; elem?: number; lifesteal?: number };
  armorBonus: { hp?: number; mana?: number; mf?: number; def?: number; attr?: readonly [number, number, number, number]; regen?: number };
}

export const BUILTIN_GEMS: readonly GemDef[] = [
  // Ruby (Fire & HP)
  { name: 'Chipped Ruby', type: 'ruby', quality: 'chipped', tier: 1, weaponBonus: { min: 2, max: 2, elem: 1 }, armorBonus: { hp: 10 } },
  { name: 'Flawed Ruby', type: 'ruby', quality: 'flawed', tier: 2, weaponBonus: { min: 4, max: 4, elem: 1 }, armorBonus: { hp: 20 } },
  { name: 'Ruby', type: 'ruby', quality: 'regular', tier: 3, weaponBonus: { min: 8, max: 8, elem: 1 }, armorBonus: { hp: 40 } },
  { name: 'Flawless Ruby', type: 'ruby', quality: 'flawless', tier: 4, weaponBonus: { min: 15, max: 15, elem: 1 }, armorBonus: { hp: 75 } },
  { name: 'Perfect Ruby', type: 'ruby', quality: 'perfect', tier: 5, weaponBonus: { min: 25, max: 25, elem: 1 }, armorBonus: { hp: 125 } },

  // Sapphire (Cold & Mana)
  { name: 'Chipped Sapphire', type: 'sapphire', quality: 'chipped', tier: 1, weaponBonus: { min: 2, max: 2, elem: 2 }, armorBonus: { mana: 10 } },
  { name: 'Flawed Sapphire', type: 'sapphire', quality: 'flawed', tier: 2, weaponBonus: { min: 4, max: 4, elem: 2 }, armorBonus: { mana: 20 } },
  { name: 'Sapphire', type: 'sapphire', quality: 'regular', tier: 3, weaponBonus: { min: 8, max: 8, elem: 2 }, armorBonus: { mana: 40 } },
  { name: 'Flawless Sapphire', type: 'sapphire', quality: 'flawless', tier: 4, weaponBonus: { min: 15, max: 15, elem: 2 }, armorBonus: { mana: 75 } },
  { name: 'Perfect Sapphire', type: 'sapphire', quality: 'perfect', tier: 5, weaponBonus: { min: 25, max: 25, elem: 2 }, armorBonus: { mana: 125 } },

  // Topaz (Lightning & Magic Find)
  { name: 'Chipped Topaz', type: 'topaz', quality: 'chipped', tier: 1, weaponBonus: { min: 1, max: 5, elem: 3 }, armorBonus: { mf: 8 } },
  { name: 'Flawed Topaz', type: 'topaz', quality: 'flawed', tier: 2, weaponBonus: { min: 2, max: 10, elem: 3 }, armorBonus: { mf: 15 } },
  { name: 'Topaz', type: 'topaz', quality: 'regular', tier: 3, weaponBonus: { min: 3, max: 18, elem: 3 }, armorBonus: { mf: 24 } },
  { name: 'Flawless Topaz', type: 'topaz', quality: 'flawless', tier: 4, weaponBonus: { min: 5, max: 28, elem: 3 }, armorBonus: { mf: 35 } },
  { name: 'Perfect Topaz', type: 'topaz', quality: 'perfect', tier: 5, weaponBonus: { min: 8, max: 42, elem: 3 }, armorBonus: { mf: 50 } },

  // Emerald (Poison & Agility/Def)
  { name: 'Chipped Emerald', type: 'emerald', quality: 'chipped', tier: 1, weaponBonus: { min: 3, max: 3, elem: 4 }, armorBonus: { attr: [0, 1, 0, 0], def: 1 } },
  { name: 'Flawed Emerald', type: 'emerald', quality: 'flawed', tier: 2, weaponBonus: { min: 6, max: 6, elem: 4 }, armorBonus: { attr: [0, 2, 0, 0], def: 2 } },
  { name: 'Emerald', type: 'emerald', quality: 'regular', tier: 3, weaponBonus: { min: 12, max: 12, elem: 4 }, armorBonus: { attr: [0, 3, 0, 0], def: 3 } },
  { name: 'Flawless Emerald', type: 'emerald', quality: 'flawless', tier: 4, weaponBonus: { min: 22, max: 22, elem: 4 }, armorBonus: { attr: [0, 4, 0, 0], def: 4 } },
  { name: 'Perfect Emerald', type: 'emerald', quality: 'perfect', tier: 5, weaponBonus: { min: 36, max: 36, elem: 4 }, armorBonus: { attr: [0, 6, 0, 0], def: 6 } },

  // Skull (Life Steal & Health/Mana Regen)
  { name: 'Chipped Skull', type: 'skull', quality: 'chipped', tier: 1, weaponBonus: { min: 1, max: 1, lifesteal: 2 }, armorBonus: { regen: 1 } },
  { name: 'Flawed Skull', type: 'skull', quality: 'flawed', tier: 2, weaponBonus: { min: 2, max: 2, lifesteal: 4 }, armorBonus: { regen: 2 } },
  { name: 'Skull', type: 'skull', quality: 'regular', tier: 3, weaponBonus: { min: 3, max: 3, lifesteal: 6 }, armorBonus: { regen: 3 } },
  { name: 'Flawless Skull', type: 'skull', quality: 'flawless', tier: 4, weaponBonus: { min: 5, max: 5, lifesteal: 9 }, armorBonus: { regen: 4 } },
  { name: 'Perfect Skull', type: 'skull', quality: 'perfect', tier: 5, weaponBonus: { min: 8, max: 8, lifesteal: 14 }, armorBonus: { regen: 6 } },
];

export function getGemDefByName(name: string): GemDef | undefined {
  return BUILTIN_GEMS.find((g) => g.name === name);
}

export const SPECIAL_ITEMS: readonly ItemDef[] = [
  {
    name: 'Scroll of Town Portal',
    kind: Ik.Portal,
    slot: -1,
    tier: 1,
    w: 1,
    cls: CLS_BOTH,
    need: 0,
    needv: 0,
    min: 0,
    max: 0,
    acc: 0,
    cover: 0,
    def: 0,
    abs: 0,
    res: [0, 0, 0, 0, 0],
    attr: [0, 0, 0, 0],
    hp: 0,
    mana: 0,
    pow: 0,
    heal: 0,
    restore: 0,
    grow: 0,
    spell: -1,
    rarity: 'normal',
  },
  {
    name: 'Greater Healing Potion',
    kind: Ik.Potion,
    slot: -1,
    tier: 3,
    w: 1,
    cls: CLS_BOTH,
    need: 0,
    needv: 0,
    min: 0,
    max: 0,
    acc: 0,
    cover: 0,
    def: 0,
    abs: 0,
    res: [0, 0, 0, 0, 0],
    attr: [0, 0, 0, 0],
    hp: 0,
    mana: 0,
    pow: 0,
    heal: 100,
    restore: 0,
    grow: 0,
    spell: -1,
    rarity: 'normal',
  },
  {
    name: 'Greater Mana Potion',
    kind: Ik.Potion,
    slot: -1,
    tier: 3,
    w: 1,
    cls: CLS_BOTH,
    need: 0,
    needv: 0,
    min: 0,
    max: 0,
    acc: 0,
    cover: 0,
    def: 0,
    abs: 0,
    res: [0, 0, 0, 0, 0],
    attr: [0, 0, 0, 0],
    hp: 0,
    mana: 0,
    pow: 0,
    heal: 0,
    restore: 90,
    grow: 0,
    spell: -1,
    rarity: 'normal',
  },
  ...BUILTIN_GEMS.map((g): ItemDef => ({
    name: g.name,
    kind: Ik.Gem,
    slot: -1,
    tier: g.tier,
    w: 0,
    cls: CLS_BOTH,
    need: 0,
    needv: 0,
    min: 0,
    max: 0,
    acc: 0,
    cover: 0,
    def: 0,
    abs: 0,
    res: [0, 0, 0, 0, 0],
    attr: [0, 0, 0, 0],
    hp: 0,
    mana: 0,
    pow: 0,
    heal: 0,
    restore: 0,
    grow: 0,
    spell: -1,
    rarity: 'magic',
  })),
];

export const SPECIAL_ITEM_OFFSET = 500;

export function canSocket(item: ItemDef): boolean {
  if (item.kind !== Ik.Gear) return false;
  const maxSockets = item.sockets ?? 0;
  if (maxSockets <= 0) return false;
  const currentGems = item.socketedGems?.length ?? 0;
  return currentGems < maxSockets;
}

export function socketGem(item: ItemDef, gem: ItemDef | GemDef): ItemDef {
  const gemDef = 'type' in gem && 'weaponBonus' in gem ? (gem as GemDef) : getGemDefByName(gem.name);
  if (!gemDef) return item;
  const currentGems = [...(item.socketedGems ?? []), gemDef.name];
  const isWeapon = item.slot === Slot.Weapon;

  let min = item.min;
  let max = item.max;
  let hp = item.hp;
  let mana = item.mana;
  let def = item.def;
  let mf = item.mf ?? 0;
  let lifesteal = item.lifesteal ?? 0;
  let grow = item.grow;
  const res: [number, number, number, number, number] = [...item.res];
  const attr: [number, number, number, number] = [...item.attr];

  if (isWeapon) {
    min += gemDef.weaponBonus.min;
    max += gemDef.weaponBonus.max;
    if (gemDef.weaponBonus.lifesteal) lifesteal += gemDef.weaponBonus.lifesteal;
    if (gemDef.type === 'ruby') res[0] += 5 * gemDef.tier;
    if (gemDef.type === 'sapphire') res[1] += 5 * gemDef.tier;
    if (gemDef.type === 'topaz') res[2] += 5 * gemDef.tier;
    if (gemDef.type === 'emerald') res[3] += 5 * gemDef.tier;
  } else {
    if (gemDef.armorBonus.hp) hp += gemDef.armorBonus.hp;
    if (gemDef.armorBonus.mana) mana += gemDef.armorBonus.mana;
    if (gemDef.armorBonus.def) def += gemDef.armorBonus.def;
    if (gemDef.armorBonus.mf) mf += gemDef.armorBonus.mf;
    if (gemDef.armorBonus.regen) grow += gemDef.armorBonus.regen;
    if (gemDef.armorBonus.attr) {
      for (let i = 0; i < 4; i++) attr[i] += gemDef.armorBonus.attr[i];
    }
  }

  return {
    ...item,
    socketedGems: currentGems,
    min,
    max,
    hp,
    mana,
    def,
    mf,
    lifesteal,
    grow,
    res,
    attr,
  };
}

export function canTransmute(items: readonly ItemDef[]): { recipe: string; result: ItemDef } | null {
  if (items.length !== 3) return null;

  // Recipe 1: 3 identical potions -> 1 higher potion
  if (items[0].kind === Ik.Potion && items.every((x) => x.name === items[0].name)) {
    const name = items[0].name;
    if (name === 'Healing Draught') {
      const res = SPECIAL_ITEMS.find((s) => s.name === 'Greater Healing Potion');
      if (res) return { recipe: '3 Healing Draughts -> Greater Healing Potion', result: res };
    }
    if (name === 'Mana Draught') {
      const res = SPECIAL_ITEMS.find((s) => s.name === 'Greater Mana Potion');
      if (res) return { recipe: '3 Mana Draughts -> Greater Mana Potion', result: res };
    }
    const upgradedDef: ItemDef = {
      ...items[0],
      name: `Superior ${items[0].name}`,
      heal: items[0].heal ? Math.round(items[0].heal * 2.2) : 0,
      restore: items[0].restore ? Math.round(items[0].restore * 2.2) : 0,
      tier: Math.min(5, items[0].tier + 1),
    };
    return { recipe: `3 ${name} -> Superior ${name}`, result: upgradedDef };
  }

  // Recipe 2: 3 identical gems of grade N -> 1 gem of grade N+1
  if (items[0].kind === Ik.Gem && items.every((x) => x.name === items[0].name)) {
    const g0 = getGemDefByName(items[0].name);
    if (g0) {
      const qualityProgression: GemQuality[] = ['chipped', 'flawed', 'regular', 'flawless', 'perfect'];
      const qIdx = qualityProgression.indexOf(g0.quality);
      if (qIdx >= 0 && qIdx < qualityProgression.length - 1) {
        const nextQuality = qualityProgression[qIdx + 1];
        const nextGemDef = BUILTIN_GEMS.find((g) => g.type === g0.type && g.quality === nextQuality);
        if (nextGemDef) {
          const nextItemDef = SPECIAL_ITEMS.find((s) => s.name === nextGemDef.name);
          if (nextItemDef) {
            return {
              recipe: `3 ${items[0].name} -> ${nextGemDef.name}`,
              result: nextItemDef,
            };
          }
        }
      }
    }
  }

  // Recipe 3: 3 Magic Rings -> 1 Rare Amulet
  if (items.every((x) => x.kind === Ik.Gear && x.slot === Slot.Ring)) {
    const avgTier = Math.min(5, Math.max(1, Math.round(items.reduce((s, x) => s + x.tier, 0) / 3)));
    const amuletDef: ItemDef = {
      name: 'Runewright Transmuted Amulet',
      kind: Ik.Gear,
      slot: Slot.Amulet,
      tier: avgTier,
      w: 1,
      cls: CLS_BOTH,
      need: 0,
      needv: 0,
      min: 0,
      max: 0,
      acc: 2,
      cover: 0,
      def: 1,
      abs: 1,
      res: [8 * avgTier, 8 * avgTier, 8 * avgTier, 8 * avgTier, 8 * avgTier],
      attr: [avgTier, avgTier, avgTier, avgTier],
      hp: 15 * avgTier,
      mana: 15 * avgTier,
      pow: 4 * avgTier,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      rarity: 'rare',
    };
    return { recipe: '3 Rings -> Runewright Rare Amulet', result: amuletDef };
  }

  // Recipe 4: 3 Magic Amulets -> 1 Rare Ring
  if (items.every((x) => x.kind === Ik.Gear && x.slot === Slot.Amulet)) {
    const avgTier = Math.min(5, Math.max(1, Math.round(items.reduce((s, x) => s + x.tier, 0) / 3)));
    const ringDef: ItemDef = {
      name: 'Runewright Transmuted Ring',
      kind: Ik.Gear,
      slot: Slot.Ring,
      tier: avgTier,
      w: 0,
      cls: CLS_BOTH,
      need: 0,
      needv: 0,
      min: avgTier,
      max: avgTier * 2,
      acc: 2,
      cover: 0,
      def: 1,
      abs: 0,
      res: [6 * avgTier, 6 * avgTier, 6 * avgTier, 6 * avgTier, 6 * avgTier],
      attr: [avgTier, avgTier, avgTier, avgTier],
      hp: 12 * avgTier,
      mana: 12 * avgTier,
      pow: 3 * avgTier,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      rarity: 'rare',
    };
    return { recipe: '3 Amulets -> Runewright Rare Ring', result: ringDef };
  }

  return null;
}

export function transmuteItems(inv: { item: number; n: number }[], itemIds: number[]): { resultDef: ItemDef; resultId: number; recipe: string } | null {
  if (itemIds.length !== 3) return null;
  const defs: ItemDef[] = [];
  for (const id of itemIds) {
    const d = getItemDef(id);
    if (!d) return null;
    defs.push(d);
  }
  const match = canTransmute(defs);
  if (!match) return null;

  // Check that inv has all 3 items
  const counts: Record<number, number> = {};
  for (const id of itemIds) counts[id] = (counts[id] || 0) + 1;
  for (const [idStr, need] of Object.entries(counts)) {
    const id = Number(idStr);
    const stack = inv.find((s) => s.item === id);
    if (!stack || stack.n < need) return null;
  }

  // Consume items
  for (const [idStr, need] of Object.entries(counts)) {
    const id = Number(idStr);
    const stackIdx = inv.findIndex((s) => s.item === id);
    if (stackIdx >= 0) {
      inv[stackIdx].n -= need;
      if (inv[stackIdx].n <= 0) inv.splice(stackIdx, 1);
    }
  }

  // Register dynamic result item or find existing ID
  let resId = itemId(match.result.name);
  if (resId < 0) {
    resId = DYNAMIC_ITEM_OFFSET + Math.floor(Math.random() * 900000);
    registerDynamicItem(resId, match.result);
  }

  // Add result to inventory
  const existingStack = inv.find((s) => s.item === resId);
  if (existingStack) {
    existingStack.n += 1;
  } else {
    inv.push({ item: resId, n: 1 });
  }

  return { resultDef: match.result, resultId: resId, recipe: match.recipe };
}

export interface ItemInstance {
  readonly id: number; // >= 1000
  readonly baseId: number; // base item index in ITEMS
  readonly quality: 'magic' | 'rare' | string;
  readonly name: string;
  readonly def: ItemDef;
  readonly affixes?: readonly string[];
}

export const DYNAMIC_ITEM_OFFSET = 1000;
const DYNAMIC_ITEMS: Map<number, ItemDef> = new Map();

export function registerDynamicItem(id: number, def: ItemDef): void {
  DYNAMIC_ITEMS.set(id, def);
}

export function unregisterDynamicItem(id: number): void {
  DYNAMIC_ITEMS.delete(id);
}

export function clearDynamicItems(): void {
  DYNAMIC_ITEMS.clear();
}

export function getItemDef(id: number): ItemDef | undefined {
  if (id >= DYNAMIC_ITEM_OFFSET) return DYNAMIC_ITEMS.get(id);
  if (id >= SPECIAL_ITEM_OFFSET && id < SPECIAL_ITEM_OFFSET + SPECIAL_ITEMS.length) {
    return SPECIAL_ITEMS[id - SPECIAL_ITEM_OFFSET];
  }
  return ITEMS[id];
}

const LIST: ItemDef[] = [];
/** Filled from items.json by installData; the index is the item id. */
export const ITEMS: readonly ItemDef[] = LIST;
export const itemId = (name: string): number => {
  const staticId = ITEMS.findIndex((d) => d.name === name);
  if (staticId >= 0) return staticId;
  const specIdx = SPECIAL_ITEMS.findIndex((d) => d.name === name);
  if (specIdx >= 0) return SPECIAL_ITEM_OFFSET + specIdx;
  for (const [id, def] of DYNAMIC_ITEMS) {
    if (def.name === name) return id;
  }
  return -1;
};

/** Loot pools: [category][tier] -> item ids. Categories: 0 gear, 1 potion, 2 learn. */
let POOL: number[][][] = [];

export function setItems(defs: readonly ItemDef[]): void {
  LIST.length = 0;
  LIST.push(...defs);
  clearDynamicItems();
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
  const d = getItemDef(id);
  if (!d) return 'Unknown Item';
  const p: string[] = [];
  const kind = d.kind === Ik.Gear ? SLOT_NAMES[d.slot] : d.kind === Ik.Potion ? 'Potion' : d.kind === Ik.Gem ? 'Gem' : d.kind === Ik.Portal ? 'Portal' : d.w > 1 ? 'Tome' : 'Scroll';
  p.push(`${d.name} (${kind}, level ${d.tier}, weight ${d.w})`);
  if (d.kind === Ik.Gem) {
    const g = getGemDefByName(d.name);
    if (g) {
      p.push(`Weapon: +${g.weaponBonus.min}-${g.weaponBonus.max} damage${g.weaponBonus.lifesteal ? ` (${g.weaponBonus.lifesteal}% Life Steal)` : ''}`);
      const a = g.armorBonus;
      const b: string[] = [];
      if (a.hp) b.push(`+${a.hp} HP`);
      if (a.mana) b.push(`+${a.mana} Mana`);
      if (a.mf) b.push(`+${a.mf}% Magic Find`);
      if (a.def) b.push(`+${a.def} Def`);
      if (a.regen) b.push(`+${a.regen} HP/MP Regen`);
      p.push(`Armor/Shield/Helm: ${b.join(', ')}`);
    }
  }
  if (d.kind === Ik.Portal) {
    p.push('Opens an ethereal rift back to town.');
  }
  if (d.sockets) {
    p.push(`Sockets: (${d.socketedGems?.length ?? 0}/${d.sockets}) ${d.socketedGems?.length ? `[${d.socketedGems.join(', ')}]` : ''}`.trim());
  }
  if (d.lifesteal) {
    p.push(`Life Steal: +${d.lifesteal}%`);
  }
  if (d.mf) {
    p.push(`Magic Find: +${d.mf}%`);
  }
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
