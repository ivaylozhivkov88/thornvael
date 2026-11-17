import { SPELLS } from './spelldata';

export * from './item-types';

import {
  Attr,
  ATTR_NAMES,
  CLS_BOTH,
  CLS_MAGE,
  CLS_WARRIOR,
  Cls,
  GemDef,
  GemQuality,
  GemType,
  Ik,
  ItemDef,
  Part,
  PART_COUNT,
  PART_DMG,
  PART_NAMES,
  PART_WEIGHT,
  Slot,
  SLOT_COUNT,
  SLOT_NAMES,
  BUILTIN_GEMS,
  getGemDefByName,
} from './item-types';

import { ALL_RUNES, applyRunewordToItem, getRuneByName, matchRuneword } from './runes';
import { transmuteCube } from './cube';

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
    name: 'Scroll of Identification',
    kind: Ik.Identify,
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
    lore: 'An enchanted parchment inscribed with the Eye of Vaelen, revealing hidden dweomers on dormant relics.',
  },
  {
    name: 'Identification Scroll',
    kind: Ik.Identify,
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
    lore: 'An enchanted parchment inscribed with the Eye of Vaelen, revealing hidden dweomers on dormant relics.',
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
  {
    name: 'Rejuvenation Potion',
    kind: Ik.Potion,
    slot: -1,
    tier: 2,
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
    heal: 35,
    restore: 35,
    grow: 0,
    spell: -1,
    rarity: 'magic',
    lore: 'A distilled elixir instantly restoring vitality and essence.',
  },
  {
    name: 'Full Rejuvenation Potion',
    kind: Ik.Potion,
    slot: -1,
    tier: 4,
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
    heal: 9999,
    restore: 9999,
    grow: 0,
    spell: -1,
    rarity: 'magic',
    lore: 'The supreme draught of restoration, replenishing all life and mana instantaneously.',
  },
  {
    name: 'Small Talisman Charm',
    kind: Ik.Gear,
    slot: -1,
    tier: 1,
    w: 1,
    cls: CLS_BOTH,
    need: 0,
    needv: 0,
    min: 1,
    max: 2,
    acc: 5,
    cover: 0,
    def: 1,
    abs: 0,
    res: [5, 5, 5, 5, 5],
    attr: [1, 1, 1, 1],
    hp: 15,
    mana: 10,
    pow: 2,
    heal: 0,
    restore: 0,
    grow: 0,
    spell: -1,
    mf: 5,
    charmSize: 'small',
    rarity: 'magic',
    lore: 'Carried in the inventory, this talisman imparts minor blessings.',
  },
  {
    name: 'Large Relic Charm',
    kind: Ik.Gear,
    slot: -1,
    tier: 2,
    w: 2,
    cls: CLS_BOTH,
    need: 0,
    needv: 0,
    min: 2,
    max: 4,
    acc: 10,
    cover: 0,
    def: 2,
    abs: 1,
    res: [8, 8, 8, 8, 8],
    attr: [2, 2, 2, 2],
    hp: 25,
    mana: 20,
    pow: 4,
    heal: 0,
    restore: 0,
    grow: 0,
    spell: -1,
    mf: 8,
    charmSize: 'large',
    rarity: 'magic',
    lore: 'A mystic relic that strengthens the adventurer while kept in their pack.',
  },
  {
    name: 'Grand Mystic Charm',
    kind: Ik.Gear,
    slot: -1,
    tier: 3,
    w: 3,
    cls: CLS_BOTH,
    need: 0,
    needv: 0,
    min: 4,
    max: 8,
    acc: 20,
    cover: 0,
    def: 4,
    abs: 2,
    res: [12, 12, 12, 12, 12],
    attr: [3, 3, 3, 3],
    hp: 45,
    mana: 35,
    pow: 8,
    heal: 0,
    restore: 0,
    grow: 0,
    spell: -1,
    mf: 12,
    charmSize: 'grand',
    rarity: 'magic',
    lore: 'A potent grand charm humming with ancient magic while held in the pack.',
  },
  ...ALL_RUNES.map((r): ItemDef => ({
    name: r.name,
    kind: Ik.Gem,
    slot: -1,
    tier: Math.min(5, Math.ceil(r.id / 7)),
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
    lore: `Rune #${r.id} (${r.d2Name}). Socket into weapons, armor, or shields, or combine in the Transmutation Cube.`,
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
  const runeDef = !('type' in gem && 'weaponBonus' in gem) ? getRuneByName(gem.name) : undefined;
  const gemDef = !runeDef ? ('type' in gem && 'weaponBonus' in gem ? (gem as GemDef) : getGemDefByName(gem.name)) : undefined;
  if (!gemDef && !runeDef) return item;

  const itemName = runeDef ? runeDef.name : gemDef!.name;
  const currentGems = [...(item.socketedGems ?? []), itemName];
  const isWeapon = item.slot === Slot.Weapon;
  const isShield = item.slot === Slot.Shield;

  let min = item.min;
  let max = item.max;
  let acc = item.acc ?? 0;
  let hp = item.hp;
  let mana = item.mana;
  let def = item.def;
  let mf = item.mf ?? 0;
  let lifesteal = item.lifesteal ?? 0;
  let manasteal = item.manasteal ?? 0;
  let crushingBlow = item.crushingBlow ?? 0;
  let deadlyStrike = item.deadlyStrike ?? 0;
  let openWounds = item.openWounds ?? 0;
  let fhr = item.fhr ?? 0;
  let grow = item.grow;
  const res: [number, number, number, number, number] = [...item.res];
  const attr: [number, number, number, number] = [...item.attr];

  if (gemDef) {
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
  } else if (runeDef) {
    if (isWeapon) {
      if (runeDef.weaponBonus.min) min += runeDef.weaponBonus.min;
      if (runeDef.weaponBonus.max) max += runeDef.weaponBonus.max;
      if (runeDef.weaponBonus.acc) acc += runeDef.weaponBonus.acc;
      if (runeDef.weaponBonus.lifesteal) lifesteal += runeDef.weaponBonus.lifesteal;
      if (runeDef.weaponBonus.manasteal) manasteal += runeDef.weaponBonus.manasteal;
      if (runeDef.weaponBonus.crushingBlow) crushingBlow += runeDef.weaponBonus.crushingBlow;
      if (runeDef.weaponBonus.deadlyStrike) deadlyStrike += runeDef.weaponBonus.deadlyStrike;
      if (runeDef.weaponBonus.openWounds) openWounds += runeDef.weaponBonus.openWounds;
      if (runeDef.weaponBonus.mf) mf += runeDef.weaponBonus.mf;
      if (runeDef.weaponBonus.elemDmg) {
        res[runeDef.weaponBonus.elemDmg.elem - 1] += 5;
      }
    } else if (isShield) {
      if (runeDef.shieldBonus.def) def += runeDef.shieldBonus.def;
      if (runeDef.shieldBonus.hp) hp += runeDef.shieldBonus.hp;
      if (runeDef.shieldBonus.mana) mana += runeDef.shieldBonus.mana;
      if (runeDef.shieldBonus.mf) mf += runeDef.shieldBonus.mf;
      if (runeDef.shieldBonus.res) {
        for (let i = 0; i < 5; i++) res[i] += runeDef.shieldBonus.res[i];
      }
      if (runeDef.shieldBonus.attr) {
        for (let i = 0; i < 4; i++) attr[i] += runeDef.shieldBonus.attr[i];
      }
    } else {
      if (runeDef.armorBonus.def) def += runeDef.armorBonus.def;
      if (runeDef.armorBonus.hp) hp += runeDef.armorBonus.hp;
      if (runeDef.armorBonus.mana) mana += runeDef.armorBonus.mana;
      if (runeDef.armorBonus.fhr) fhr += runeDef.armorBonus.fhr;
      if (runeDef.armorBonus.mf) mf += runeDef.armorBonus.mf;
      if (runeDef.armorBonus.res) {
        for (let i = 0; i < 5; i++) res[i] += runeDef.armorBonus.res[i];
      }
      if (runeDef.armorBonus.attr) {
        for (let i = 0; i < 4; i++) attr[i] += runeDef.armorBonus.attr[i];
      }
    }
  }

  const baseResult: ItemDef = {
    ...item,
    socketedGems: currentGems,
    min,
    max,
    acc,
    hp,
    mana,
    def,
    mf,
    lifesteal,
    manasteal,
    crushingBlow,
    deadlyStrike,
    openWounds,
    fhr,
    grow,
    res,
    attr,
  };

  const rw = matchRuneword(item.slot, currentGems);
  if (rw) {
    return applyRunewordToItem(baseResult, rw);
  }

  return baseResult;
}

export function canTransmute(items: readonly ItemDef[]): { recipe: string; result: ItemDef } | null {
  const cubeRes = transmuteCube(items);
  if (cubeRes) return cubeRes;

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
  if (itemIds.length < 1) return null;
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
  POOL = [0, 1, 2, 3, 4, 5].map(() => [[], [], [], [], [], []]);
  ITEMS.forEach((d, id) => {
    if (POOL[d.kind] && POOL[d.kind][d.tier]) {
      POOL[d.kind][d.tier].push(id);
    }
  });
}

/** Pick a loot item for a monster whose drops range over tiers lo..hi. `rnd(n)` returns an integer in 0..n-1. */
export function rollLoot(rnd: (n: number) => number, lo: number, hi: number): number {
  const r = rnd(100);
  const cat = r < 55 ? 0 : r < 80 ? 1 : 2;
  const tier = lo + rnd(hi - lo + 1);
  if (!POOL || !POOL[cat]) {
    POOL = [0, 1, 2, 3, 4, 5].map(() => [[], [], [], [], [], []]);
    ITEMS.forEach((d, id) => {
      if (POOL[d.kind] && POOL[d.kind][d.tier]) {
        POOL[d.kind][d.tier].push(id);
      }
    });
  }
  let pool = (POOL[cat] && POOL[cat][tier]) || [];
  if (pool.length === 0) {
    pool = [];
    for (let t = 1; t <= hi; t++) {
      if (POOL[cat] && POOL[cat][t]) pool.push(...POOL[cat][t]);
    }
  }
  if (pool.length === 0) pool = (POOL[1] && POOL[1][1]) || [];
  if (pool.length === 0) return 0;
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

export function getUnidentifiedName(def: ItemDef): string {
  const slot = def.slot;
  const tier = def.tier || 1;
  const isMage = def.cls === CLS_MAGE;
  if (slot === Slot.Weapon) {
    if (isMage) return tier <= 2 ? 'Unidentified Oak Staff' : tier <= 4 ? 'Unidentified Rune Staff' : 'Unidentified Astral Staff';
    return tier <= 2 ? 'Unidentified Broadsword' : tier <= 4 ? 'Unidentified Runed Blade' : 'Unidentified Highland Blade';
  }
  if (slot === Slot.Armor) {
    if (isMage) return tier <= 2 ? 'Unidentified Silk Robe' : tier <= 4 ? 'Unidentified Mage Vestment' : 'Unidentified Astral Shroud';
    return tier <= 2 ? 'Unidentified Chain Hauberk' : tier <= 4 ? 'Unidentified Gothic Plate' : 'Unidentified Imperial Full Plate';
  }
  if (slot === Slot.Shield) {
    return tier <= 2 ? 'Unidentified Round Targe' : tier <= 4 ? 'Unidentified Tower Shield' : 'Unidentified Aegis Pavise';
  }
  if (slot === Slot.Helm) {
    if (isMage) return tier <= 2 ? 'Unidentified Sage Cowl' : 'Unidentified Runic Diadem';
    return tier <= 2 ? 'Unidentified Iron Visor' : tier <= 4 ? 'Unidentified Great Helm' : 'Unidentified Winged Armet';
  }
  if (slot === Slot.Boots) {
    return tier <= 2 ? 'Unidentified Leather Boots' : tier <= 4 ? 'Unidentified Heavy Greaves' : 'Unidentified War Boots';
  }
  if (slot === Slot.Gloves) {
    return tier <= 2 ? 'Unidentified Leather Wraps' : tier <= 4 ? 'Unidentified Chain Gauntlets' : 'Unidentified War Gauntlets';
  }
  if (slot === Slot.Ring) return 'Unidentified Ring';
  if (slot === Slot.Amulet) return 'Unidentified Amulet';
  return `Unidentified ${def.name}`;
}

/** Short stat line for tooltips and the pack. */
export function itemText(id: number): string {
  const d = getItemDef(id);
  if (!d) return 'Unknown Item';
  const p: string[] = [];
  const kind = d.kind === Ik.Gear ? SLOT_NAMES[d.slot] : d.kind === Ik.Potion ? 'Potion' : d.kind === Ik.Gem ? 'Gem' : d.kind === Ik.Portal ? 'Portal' : d.kind === Ik.Identify ? 'Scroll' : d.w > 1 ? 'Tome' : 'Scroll';
  p.push(`${d.name} (${kind}, level ${d.tier}, weight ${d.w})`);
  if (d.unidentified) {
    p.push('Unidentified Magical Relic');
    p.push('Right-click an Identification Scroll or visit High Arcanist Vaelen / Master Corin in town to reveal its powers.');
    return p.join('\n');
  }
  if (d.lore) {
    p.push(`"${d.lore}"`);
  }
  if (d.kind === Ik.Identify) {
    p.push('Reveals the hidden enchantments on an unidentified item in inventory.');
  }
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
  if (d.manasteal) {
    p.push(`Mana Steal: +${d.manasteal}%`);
  }
  if (d.crushingBlow) {
    p.push(`Crushing Blow: +${d.crushingBlow}%`);
  }
  if (d.deadlyStrike) {
    p.push(`Deadly Strike: +${d.deadlyStrike}%`);
  }
  if (d.openWounds) {
    p.push(`Open Wounds: +${d.openWounds}%`);
  }
  if (d.fcr) {
    p.push(`Faster Cast Rate: +${d.fcr}%`);
  }
  if (d.fhr) {
    p.push(`Faster Hit Recovery: +${d.fhr}%`);
  }
  if (d.ias) {
    p.push(`Increased Attack Speed: +${d.ias}%`);
  }
  if (d.cannotBeFrozen) {
    p.push('Cannot Be Frozen');
  }
  if (d.beltSlots) {
    p.push(`Belt Capacity: ${d.beltSlots} potion slots`);
  }
  if (d.charmSize) {
    p.push(`Inventory Charm (${d.charmSize}): Grants active bonuses while in pack`);
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
