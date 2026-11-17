/**
 * Classic ARPG Runes & Runewords System for Thornvael (RoM2 Web)
 *
 * Implements:
 * 1. All 33 Runes (El through Zod equivalent in Thornvael lore)
 * 2. Weapon, Armor/Helm, and Shield socket properties
 * 3. Exact Horadric Cube Rune Progression & Gem Upgrade Requirements
 * 4. Iconic Runewords Library (Stealth, Steel, Lore, Spirit, Insight, Ancient's Pledge,
 *    Rhyme, Smoke, Leaf, White, Treachery, Duress, Sanctuary, Crescent Moon,
 *    Call to Arms, Enigma, Infinity, Fortitude, Grief, Heart of the Oak, Breath of the Dying,
 *    Faith, Chains of Honor, Beast, Death)
 * 5. Runeword matching, validation, and stat application engine
 */

import { Slot, type ItemDef } from './item-types';

export interface RuneDef {
  readonly id: number; // 1..33
  readonly name: string; // Thornvael lore name
  readonly d2Name: string; // Canonical D2 name
  readonly clvl: number; // Required level
  readonly weaponBonus: {
    min?: number;
    max?: number;
    acc?: number;
    elemDmg?: { elem: number; min: number; max: number };
    lifesteal?: number;
    manasteal?: number;
    crushingBlow?: number;
    deadlyStrike?: number;
    openWounds?: number;
    ignoreDef?: boolean;
    knockback?: boolean;
    preventHeal?: boolean;
    freeze?: number;
    mf?: number;
    gold?: number;
    manaAfterKill?: number;
  };
  readonly armorBonus: {
    hp?: number;
    mana?: number;
    def?: number;
    fhr?: number;
    res?: readonly [number, number, number, number, number];
    maxRes?: readonly [number, number, number, number, number];
    attr?: readonly [number, number, number, number];
    regen?: number;
    damageReduced?: number;
    magicReduced?: number;
    damageToMana?: number;
    mf?: number;
    gold?: number;
    manaAfterKill?: number;
  };
  readonly shieldBonus: {
    hp?: number;
    mana?: number;
    def?: number;
    block?: number;
    res?: readonly [number, number, number, number, number];
    maxRes?: readonly [number, number, number, number, number];
    attr?: readonly [number, number, number, number];
    attackerTakesDmg?: number;
    damageToMana?: number;
    damageReduced?: number;
    magicReduced?: number;
    regen?: number;
    manaAfterKill?: number;
    mf?: number;
    gold?: number;
    cannotBeFrozen?: boolean;
  };
}

export const ALL_RUNES: readonly RuneDef[] = [
  {
    id: 1,
    name: 'Rune of Eldun',
    d2Name: 'El',
    clvl: 11,
    weaponBonus: { acc: 50 },
    armorBonus: { def: 15 },
    shieldBonus: { def: 15 },
  },
  {
    id: 2,
    name: 'Rune of Elvar',
    d2Name: 'Eld',
    clvl: 11,
    weaponBonus: { min: 2, max: 2, acc: 20 },
    armorBonus: { def: 10 },
    shieldBonus: { block: 7 },
  },
  {
    id: 3,
    name: 'Rune of Tyra',
    d2Name: 'Tir',
    clvl: 13,
    weaponBonus: { manaAfterKill: 2 },
    armorBonus: { manaAfterKill: 2 },
    shieldBonus: { manaAfterKill: 2 },
  },
  {
    id: 4,
    name: 'Rune of Neph',
    d2Name: 'Nef',
    clvl: 13,
    weaponBonus: { knockback: true },
    armorBonus: { def: 30 },
    shieldBonus: { def: 30 },
  },
  {
    id: 5,
    name: 'Rune of Aeth',
    d2Name: 'Eth',
    clvl: 15,
    weaponBonus: { acc: 25 },
    armorBonus: { regen: 2 },
    shieldBonus: { regen: 2 },
  },
  {
    id: 6,
    name: 'Rune of Ithos',
    d2Name: 'Ith',
    clvl: 15,
    weaponBonus: { max: 9 },
    armorBonus: { damageToMana: 15 },
    shieldBonus: { damageToMana: 15 },
  },
  {
    id: 7,
    name: 'Rune of Talgor',
    d2Name: 'Tal',
    clvl: 17,
    weaponBonus: { elemDmg: { elem: 4, min: 15, max: 25 } },
    armorBonus: { res: [0, 0, 0, 30, 0] },
    shieldBonus: { res: [0, 0, 0, 35, 0] },
  },
  {
    id: 8,
    name: 'Rune of Ralon',
    d2Name: 'Ral',
    clvl: 19,
    weaponBonus: { elemDmg: { elem: 1, min: 5, max: 30 } },
    armorBonus: { res: [30, 0, 0, 0, 0] },
    shieldBonus: { res: [35, 0, 0, 0, 0] },
  },
  {
    id: 9,
    name: 'Rune of Orthan',
    d2Name: 'Ort',
    clvl: 21,
    weaponBonus: { elemDmg: { elem: 3, min: 1, max: 50 } },
    armorBonus: { res: [0, 0, 30, 0, 0] },
    shieldBonus: { res: [0, 0, 35, 0, 0] },
  },
  {
    id: 10,
    name: 'Rune of Thulor',
    d2Name: 'Thul',
    clvl: 23,
    weaponBonus: { elemDmg: { elem: 2, min: 3, max: 14 } },
    armorBonus: { res: [0, 30, 0, 0, 0] },
    shieldBonus: { res: [0, 35, 0, 0, 0] },
  },
  {
    id: 11,
    name: 'Rune of Amnir',
    d2Name: 'Amn',
    clvl: 25,
    weaponBonus: { lifesteal: 7 },
    armorBonus: { damageReduced: 5 },
    shieldBonus: { attackerTakesDmg: 14 },
  },
  {
    id: 12,
    name: 'Rune of Solan',
    d2Name: 'Sol',
    clvl: 27,
    weaponBonus: { min: 9 },
    armorBonus: { damageReduced: 7 },
    shieldBonus: { damageReduced: 7 },
  },
  {
    id: 13,
    name: 'Rune of Shaela',
    d2Name: 'Shael',
    clvl: 29,
    weaponBonus: { acc: 10 },
    armorBonus: { fhr: 20 },
    shieldBonus: { block: 20 },
  },
  {
    id: 14,
    name: 'Rune of Dolur',
    d2Name: 'Dol',
    clvl: 31,
    weaponBonus: { acc: 15 },
    armorBonus: { regen: 7 },
    shieldBonus: { regen: 7 },
  },
  {
    id: 15,
    name: 'Rune of Helva',
    d2Name: 'Hel',
    clvl: 1,
    weaponBonus: {},
    armorBonus: {},
    shieldBonus: {},
  },
  {
    id: 16,
    name: 'Rune of Ioran',
    d2Name: 'Io',
    clvl: 35,
    weaponBonus: { min: 4, max: 4 },
    armorBonus: { attr: [10, 0, 0, 0], hp: 20 },
    shieldBonus: { attr: [10, 0, 0, 0], hp: 20 },
  },
  {
    id: 17,
    name: 'Rune of Lumix',
    d2Name: 'Lum',
    clvl: 37,
    weaponBonus: { min: 4, max: 4 },
    armorBonus: { attr: [0, 0, 10, 0], mana: 25 },
    shieldBonus: { attr: [0, 0, 10, 0], mana: 25 },
  },
  {
    id: 18,
    name: 'Rune of Kord',
    d2Name: 'Ko',
    clvl: 39,
    weaponBonus: { acc: 30 },
    armorBonus: { attr: [0, 10, 0, 0], def: 10 },
    shieldBonus: { attr: [0, 10, 0, 0], def: 10 },
  },
  {
    id: 19,
    name: 'Rune of Falkor',
    d2Name: 'Fal',
    clvl: 41,
    weaponBonus: { min: 6, max: 8 },
    armorBonus: { attr: [10, 0, 0, 0] },
    shieldBonus: { attr: [10, 0, 0, 0] },
  },
  {
    id: 20,
    name: 'Rune of Lemur',
    d2Name: 'Lem',
    clvl: 43,
    weaponBonus: { gold: 75 },
    armorBonus: { gold: 50 },
    shieldBonus: { gold: 50 },
  },
  {
    id: 21,
    name: 'Rune of Pulon',
    d2Name: 'Pul',
    clvl: 45,
    weaponBonus: { min: 8, max: 12, acc: 25 },
    armorBonus: { def: 30 },
    shieldBonus: { def: 30 },
  },
  {
    id: 22,
    name: 'Rune of Umbra',
    d2Name: 'Um',
    clvl: 47,
    weaponBonus: { openWounds: 25 },
    armorBonus: { res: [15, 15, 15, 15, 15] },
    shieldBonus: { res: [22, 22, 22, 22, 22] },
  },
  {
    id: 23,
    name: 'Rune of Malcor',
    d2Name: 'Mal',
    clvl: 49,
    weaponBonus: { preventHeal: true },
    armorBonus: { magicReduced: 7 },
    shieldBonus: { magicReduced: 7 },
  },
  {
    id: 24,
    name: 'Rune of Istari',
    d2Name: 'Ist',
    clvl: 51,
    weaponBonus: { mf: 30 },
    armorBonus: { mf: 25 },
    shieldBonus: { mf: 25 },
  },
  {
    id: 25,
    name: 'Rune of Guldan',
    d2Name: 'Gul',
    clvl: 53,
    weaponBonus: { acc: 50 },
    armorBonus: { maxRes: [0, 0, 0, 5, 0] },
    shieldBonus: { maxRes: [0, 0, 0, 5, 0] },
  },
  {
    id: 26,
    name: 'Rune of Vexor',
    d2Name: 'Vex',
    clvl: 55,
    weaponBonus: { manasteal: 7 },
    armorBonus: { maxRes: [5, 0, 0, 0, 0] },
    shieldBonus: { maxRes: [5, 0, 0, 0, 0] },
  },
  {
    id: 27,
    name: 'Rune of Ohmar',
    d2Name: 'Ohm',
    clvl: 57,
    weaponBonus: { min: 15, max: 25 },
    armorBonus: { maxRes: [0, 5, 0, 0, 0] },
    shieldBonus: { maxRes: [0, 5, 0, 0, 0] },
  },
  {
    id: 28,
    name: 'Rune of Loral',
    d2Name: 'Lo',
    clvl: 59,
    weaponBonus: { deadlyStrike: 20 },
    armorBonus: { maxRes: [0, 0, 5, 0, 0] },
    shieldBonus: { maxRes: [0, 0, 5, 0, 0] },
  },
  {
    id: 29,
    name: 'Rune of Suran',
    d2Name: 'Sur',
    clvl: 61,
    weaponBonus: { min: 10, max: 15 },
    armorBonus: { mana: 50 },
    shieldBonus: { mana: 50 },
  },
  {
    id: 30,
    name: 'Rune of Beran',
    d2Name: 'Ber',
    clvl: 63,
    weaponBonus: { crushingBlow: 20 },
    armorBonus: { damageReduced: 8 },
    shieldBonus: { damageReduced: 8 },
  },
  {
    id: 31,
    name: 'Rune of Jahkar',
    d2Name: 'Jah',
    clvl: 65,
    weaponBonus: { ignoreDef: true },
    armorBonus: { hp: 60 },
    shieldBonus: { hp: 50 },
  },
  {
    id: 32,
    name: 'Rune of Chamir',
    d2Name: 'Cham',
    clvl: 67,
    weaponBonus: { freeze: 3 },
    armorBonus: {},
    shieldBonus: { cannotBeFrozen: true },
  },
  {
    id: 33,
    name: 'Rune of Zodar',
    d2Name: 'Zod',
    clvl: 69,
    weaponBonus: { min: 25, max: 35 },
    armorBonus: { def: 50 },
    shieldBonus: { def: 50 },
  },
];

export function getRuneById(id: number): RuneDef | undefined {
  return ALL_RUNES.find((r) => r.id === id);
}

export function getRuneByName(name: string): RuneDef | undefined {
  const norm = name.trim().toLowerCase();
  return ALL_RUNES.find(
    (r) =>
      r.name.toLowerCase() === norm ||
      r.d2Name.toLowerCase() === norm ||
      r.name.toLowerCase().includes(norm) ||
      `rune of ${r.d2Name.toLowerCase()}` === norm,
  );
}

/**
 * Rune Progression Table (Horadric Cube Transmutations):
 * - Runes 1..9 (El..Ort): 3 runes -> 1 next rune
 * - Runes 10..15 (Thul..Hel): 3 runes + Chipped Gem -> 1 next rune
 * - Runes 16..21 (Io..Lem): 3 runes + Flawed Gem -> 1 next rune
 * - Runes 22..32 (Um..Cham): 2 runes + Regular/Flawless Gem -> 1 next rune
 */
export interface RuneUpgradeRecipe {
  fromRuneId: number;
  fromCount: number;
  gemRequired?: { type: string; quality: string };
  toRuneId: number;
}

export const RUNE_UPGRADE_RECIPES: readonly RuneUpgradeRecipe[] = [
  // 1..9 (El to Ort): 3 runes -> next rune
  { fromRuneId: 1, fromCount: 3, toRuneId: 2 },
  { fromRuneId: 2, fromCount: 3, toRuneId: 3 },
  { fromRuneId: 3, fromCount: 3, toRuneId: 4 },
  { fromRuneId: 4, fromCount: 3, toRuneId: 5 },
  { fromRuneId: 5, fromCount: 3, toRuneId: 6 },
  { fromRuneId: 6, fromCount: 3, toRuneId: 7 },
  { fromRuneId: 7, fromCount: 3, toRuneId: 8 },
  { fromRuneId: 8, fromCount: 3, toRuneId: 9 },
  { fromRuneId: 9, fromCount: 3, toRuneId: 10 },

  // 10..15 (Thul to Hel): 3 runes + Chipped Gem
  { fromRuneId: 10, fromCount: 3, gemRequired: { type: 'topaz', quality: 'chipped' }, toRuneId: 11 }, // 3 Thul + Chipped Topaz -> Amn
  { fromRuneId: 11, fromCount: 3, gemRequired: { type: 'amethyst', quality: 'chipped' }, toRuneId: 12 }, // 3 Amn + Chipped Amethyst -> Sol
  { fromRuneId: 12, fromCount: 3, gemRequired: { type: 'sapphire', quality: 'chipped' }, toRuneId: 13 }, // 3 Sol + Chipped Sapphire -> Shael
  { fromRuneId: 13, fromCount: 3, gemRequired: { type: 'ruby', quality: 'chipped' }, toRuneId: 14 }, // 3 Shael + Chipped Ruby -> Dol
  { fromRuneId: 14, fromCount: 3, gemRequired: { type: 'emerald', quality: 'chipped' }, toRuneId: 15 }, // 3 Dol + Chipped Emerald -> Hel
  { fromRuneId: 15, fromCount: 3, gemRequired: { type: 'diamond', quality: 'chipped' }, toRuneId: 16 }, // 3 Hel + Chipped Diamond -> Io

  // 16..21 (Io to Lem): 3 runes + Flawed Gem
  { fromRuneId: 16, fromCount: 3, gemRequired: { type: 'topaz', quality: 'flawed' }, toRuneId: 17 }, // 3 Io + Flawed Topaz -> Lum
  { fromRuneId: 17, fromCount: 3, gemRequired: { type: 'amethyst', quality: 'flawed' }, toRuneId: 18 }, // 3 Lum + Flawed Amethyst -> Ko
  { fromRuneId: 18, fromCount: 3, gemRequired: { type: 'sapphire', quality: 'flawed' }, toRuneId: 19 }, // 3 Ko + Flawed Sapphire -> Fal
  { fromRuneId: 19, fromCount: 3, gemRequired: { type: 'ruby', quality: 'flawed' }, toRuneId: 20 }, // 3 Fal + Flawed Ruby -> Lem
  { fromRuneId: 20, fromCount: 3, gemRequired: { type: 'emerald', quality: 'flawed' }, toRuneId: 21 }, // 3 Lem + Flawed Emerald -> Pul
  { fromRuneId: 21, fromCount: 3, gemRequired: { type: 'diamond', quality: 'flawed' }, toRuneId: 22 }, // 3 Pul + Flawed Diamond -> Um

  // 22..32 (Um to Cham): 2 runes + Regular/Flawless Gem
  { fromRuneId: 22, fromCount: 2, gemRequired: { type: 'topaz', quality: 'regular' }, toRuneId: 23 }, // 2 Um + Topaz -> Mal
  { fromRuneId: 23, fromCount: 2, gemRequired: { type: 'amethyst', quality: 'regular' }, toRuneId: 24 }, // 2 Mal + Amethyst -> Ist
  { fromRuneId: 24, fromCount: 2, gemRequired: { type: 'sapphire', quality: 'regular' }, toRuneId: 25 }, // 2 Ist + Sapphire -> Gul
  { fromRuneId: 25, fromCount: 2, gemRequired: { type: 'ruby', quality: 'regular' }, toRuneId: 26 }, // 2 Gul + Ruby -> Vex
  { fromRuneId: 26, fromCount: 2, gemRequired: { type: 'emerald', quality: 'regular' }, toRuneId: 27 }, // 2 Vex + Emerald -> Ohm
  { fromRuneId: 27, fromCount: 2, gemRequired: { type: 'diamond', quality: 'regular' }, toRuneId: 28 }, // 2 Ohm + Diamond -> Lo
  { fromRuneId: 28, fromCount: 2, gemRequired: { type: 'topaz', quality: 'flawless' }, toRuneId: 29 }, // 2 Lo + Flawless Topaz -> Sur
  { fromRuneId: 29, fromCount: 2, gemRequired: { type: 'amethyst', quality: 'flawless' }, toRuneId: 30 }, // 2 Sur + Flawless Amethyst -> Ber
  { fromRuneId: 30, fromCount: 2, gemRequired: { type: 'sapphire', quality: 'flawless' }, toRuneId: 31 }, // 2 Ber + Flawless Sapphire -> Jah
  { fromRuneId: 31, fromCount: 2, gemRequired: { type: 'ruby', quality: 'flawless' }, toRuneId: 32 }, // 2 Jah + Flawless Ruby -> Cham
  { fromRuneId: 32, fromCount: 2, gemRequired: { type: 'emerald', quality: 'flawless' }, toRuneId: 33 }, // 2 Cham + Flawless Emerald -> Zod
];

/**
 * Canonical Runewords Database
 */
export interface RunewordDef {
  readonly id: string;
  readonly name: string; // Thornvael name
  readonly d2Name: string; // Canonical D2 name
  readonly allowedSlots: readonly number[]; // e.g. [Slot.Weapon], [Slot.Armor], [Slot.Shield]
  readonly runeIds: readonly number[]; // Exact sequence of rune IDs
  readonly clvl: number;
  readonly stats: {
    min?: number;
    max?: number;
    acc?: number;
    def?: number;
    abs?: number;
    hp?: number;
    mana?: number;
    pow?: number;
    res?: readonly [number, number, number, number, number];
    attr?: readonly [number, number, number, number];
    fcr?: number;
    fhr?: number;
    ias?: number;
    crushingBlow?: number;
    deadlyStrike?: number;
    openWounds?: number;
    lifesteal?: number;
    manasteal?: number;
    mf?: number;
    gold?: number;
    damageReduced?: number;
    cannotBeFrozen?: boolean;
    ignoreDef?: boolean;
    aura?: string;
  };
}

export const RUNEWORDS: readonly RunewordDef[] = [
  // Stealth [Tal-Eth]
  {
    id: 'stealth',
    name: 'Shadow Veil',
    d2Name: 'Stealth',
    allowedSlots: [Slot.Armor],
    runeIds: [7, 5], // Tal + Eth
    clvl: 17,
    stats: {
      def: 15,
      fcr: 25,
      fhr: 25,
      res: [0, 0, 0, 30, 0],
      mana: 15,
    },
  },
  // Steel [Tir-El]
  {
    id: 'steel',
    name: 'Iron Blade',
    d2Name: 'Steel',
    allowedSlots: [Slot.Weapon],
    runeIds: [3, 1], // Tir + El
    clvl: 13,
    stats: {
      min: 3,
      max: 6,
      acc: 50,
      openWounds: 50,
      ias: 25,
    },
  },
  // Lore [Ort-Sol]
  {
    id: 'lore',
    name: 'Wisdom of Eld',
    d2Name: 'Lore',
    allowedSlots: [Slot.Helm],
    runeIds: [9, 12], // Ort + Sol
    clvl: 27,
    stats: {
      pow: 15,
      res: [0, 0, 30, 0, 0],
      damageReduced: 7,
      mana: 20,
    },
  },
  // Spirit [Tal-Thul-Ort-Amn]
  {
    id: 'spirit-sword',
    name: 'Aether Spirit',
    d2Name: 'Spirit',
    allowedSlots: [Slot.Weapon, Slot.Shield],
    runeIds: [7, 10, 9, 11], // Tal + Thul + Ort + Amn
    clvl: 25,
    stats: {
      pow: 25,
      fcr: 35,
      fhr: 55,
      mana: 100,
      hp: 45,
      res: [0, 35, 35, 35, 0],
      lifesteal: 7,
    },
  },
  // Insight [Ral-Tir-Tal-Sol]
  {
    id: 'insight',
    name: 'Eye of Clarity',
    d2Name: 'Insight',
    allowedSlots: [Slot.Weapon],
    runeIds: [8, 3, 7, 12], // Ral + Tir + Tal + Sol
    clvl: 27,
    stats: {
      min: 9,
      max: 18,
      acc: 80,
      aura: 'Meditation',
      mf: 23,
    },
  },
  // Ancient's Pledge [Ral-Ort-Tal]
  {
    id: 'ancients-pledge',
    name: 'Oath of the Ancestors',
    d2Name: "Ancient's Pledge",
    allowedSlots: [Slot.Shield],
    runeIds: [8, 9, 7], // Ral + Ort + Tal
    clvl: 21,
    stats: {
      def: 25,
      abs: 3,
      res: [48, 43, 48, 48, 0],
    },
  },
  // Rhyme [Shael-Eth]
  {
    id: 'rhyme',
    name: 'Frost Ward',
    d2Name: 'Rhyme',
    allowedSlots: [Slot.Shield],
    runeIds: [13, 5], // Shael + Eth
    clvl: 29,
    stats: {
      def: 20,
      res: [25, 25, 25, 25, 25],
      mf: 25,
      gold: 50,
      cannotBeFrozen: true,
    },
  },
  // Smoke [Nef-Lum]
  {
    id: 'smoke',
    name: 'Mist Veil',
    d2Name: 'Smoke',
    allowedSlots: [Slot.Armor],
    runeIds: [4, 17], // Nef + Lum
    clvl: 37,
    stats: {
      def: 45,
      fhr: 20,
      res: [50, 50, 50, 50, 50],
      mana: 30,
    },
  },
  // Leaf [Tir-Ral]
  {
    id: 'leaf',
    name: 'Blaze of Autumn',
    d2Name: 'Leaf',
    allowedSlots: [Slot.Weapon],
    runeIds: [3, 8], // Tir + Ral
    clvl: 19,
    stats: {
      pow: 30,
      min: 5,
      max: 30,
      res: [0, 33, 0, 0, 0],
    },
  },
  // White [Dol-Io]
  {
    id: 'white',
    name: 'Bone Weaver',
    d2Name: 'White',
    allowedSlots: [Slot.Weapon],
    runeIds: [14, 16], // Dol + Io
    clvl: 35,
    stats: {
      pow: 35,
      fcr: 20,
      mana: 30,
      hp: 20,
    },
  },
  // Treachery [Shael-Thul-Lem]
  {
    id: 'treachery',
    name: 'Venom Shade',
    d2Name: 'Treachery',
    allowedSlots: [Slot.Armor],
    runeIds: [13, 10, 20], // Shael + Thul + Lem
    clvl: 43,
    stats: {
      ias: 45,
      fhr: 20,
      res: [0, 30, 0, 0, 0],
      gold: 50,
    },
  },
  // Duress [Shael-Um-Thul]
  {
    id: 'duress',
    name: "Winter's Grip",
    d2Name: 'Duress',
    allowedSlots: [Slot.Armor],
    runeIds: [13, 22, 10], // Shael + Um + Thul
    clvl: 47,
    stats: {
      def: 60,
      fhr: 40,
      crushingBlow: 15,
      openWounds: 33,
      res: [15, 45, 15, 15, 15],
    },
  },
  // Sanctuary [Ko-Ko-Mal]
  {
    id: 'sanctuary',
    name: 'Haven of Light',
    d2Name: 'Sanctuary',
    allowedSlots: [Slot.Shield],
    runeIds: [18, 18, 23], // Ko + Ko + Mal
    clvl: 49,
    stats: {
      def: 55,
      fhr: 20,
      res: [60, 60, 60, 60, 60],
      damageReduced: 7,
      attr: [0, 20, 0, 0],
    },
  },
  // Crescent Moon [Shael-Um-Tir]
  {
    id: 'crescent-moon',
    name: 'Storm Crescent',
    d2Name: 'Crescent Moon',
    allowedSlots: [Slot.Weapon],
    runeIds: [13, 22, 3], // Shael + Um + Tir
    clvl: 47,
    stats: {
      min: 15,
      max: 30,
      ias: 20,
      openWounds: 25,
      res: [0, 0, 35, 0, 0],
    },
  },
  // Call to Arms [Amn-Ral-Mal-Ist-Ohm]
  {
    id: 'call-to-arms',
    name: 'War Cry',
    d2Name: 'Call to Arms',
    allowedSlots: [Slot.Weapon],
    runeIds: [11, 8, 23, 24, 27], // Amn + Ral + Mal + Ist + Ohm
    clvl: 57,
    stats: {
      min: 25,
      max: 50,
      ias: 40,
      pow: 20,
      hp: 80,
      mana: 80,
      lifesteal: 7,
      mf: 30,
    },
  },
  // Enigma [Jah-Ith-Ber]
  {
    id: 'enigma',
    name: 'Arcane Weave',
    d2Name: 'Enigma',
    allowedSlots: [Slot.Armor],
    runeIds: [31, 6, 30], // Jah + Ith + Ber
    clvl: 65,
    stats: {
      def: 75,
      abs: 5,
      pow: 30,
      hp: 120,
      damageReduced: 8,
      mf: 75,
      attr: [25, 0, 0, 0],
    },
  },
  // Infinity [Ber-Mal-Ber-Ist]
  {
    id: 'infinity',
    name: 'Boundless Static',
    d2Name: 'Infinity',
    allowedSlots: [Slot.Weapon],
    runeIds: [30, 23, 30, 24], // Ber + Mal + Ber + Ist
    clvl: 63,
    stats: {
      min: 35,
      max: 70,
      crushingBlow: 40,
      aura: 'Conviction',
      mf: 35,
    },
  },
  // Fortitude [El-Sol-Dol-Lo]
  {
    id: 'fortitude',
    name: 'Bastion of Stone',
    d2Name: 'Fortitude',
    allowedSlots: [Slot.Armor, Slot.Weapon],
    runeIds: [1, 12, 14, 28], // El + Sol + Dol + Lo
    clvl: 59,
    stats: {
      min: 20,
      max: 40,
      def: 90,
      abs: 6,
      hp: 100,
      res: [30, 30, 30, 30, 30],
      deadlyStrike: 20,
    },
  },
  // Grief [Eth-Tir-Lo-Mal-Ral]
  {
    id: 'grief',
    name: 'Bitter Sorrow',
    d2Name: 'Grief',
    allowedSlots: [Slot.Weapon],
    runeIds: [5, 3, 28, 23, 8], // Eth + Tir + Lo + Mal + Ral
    clvl: 59,
    stats: {
      min: 40,
      max: 80,
      ias: 35,
      deadlyStrike: 20,
      ignoreDef: true,
    },
  },
  // Heart of the Oak [Ko-Vex-Pul-Thul]
  {
    id: 'heart-of-the-oak',
    name: 'Verdant Scepter',
    d2Name: 'Heart of the Oak',
    allowedSlots: [Slot.Weapon],
    runeIds: [18, 26, 21, 10], // Ko + Vex + Pul + Thul
    clvl: 55,
    stats: {
      pow: 45,
      fcr: 40,
      mana: 60,
      res: [35, 35, 35, 35, 35],
      attr: [0, 10, 0, 0],
    },
  },
  // Breath of the Dying [Vex-Hel-El-Eld-Zod-Eth]
  {
    id: 'breath-of-the-dying',
    name: 'Doom Whisper',
    d2Name: 'Breath of the Dying',
    allowedSlots: [Slot.Weapon],
    runeIds: [26, 15, 1, 2, 33, 5], // Vex + Hel + El + Eld + Zod + Eth
    clvl: 69,
    stats: {
      min: 60,
      max: 120,
      ias: 60,
      lifesteal: 15,
      manasteal: 7,
      acc: 100,
      attr: [30, 30, 30, 30],
    },
  },
  // Faith [Ohm-Jah-Lem-Eld]
  {
    id: 'faith',
    name: "Matron's Zephyr",
    d2Name: 'Faith',
    allowedSlots: [Slot.Weapon],
    runeIds: [27, 31, 20, 2], // Ohm + Jah + Lem + Eld
    clvl: 65,
    stats: {
      min: 45,
      max: 90,
      acc: 120,
      aura: 'Fanaticism',
      ignoreDef: true,
      gold: 75,
    },
  },
  // Chains of Honor [Dol-Um-Ber-Ist]
  {
    id: 'chains-of-honor',
    name: 'Chains of Virtue',
    d2Name: 'Chains of Honor',
    allowedSlots: [Slot.Armor],
    runeIds: [14, 22, 30, 24], // Dol + Um + Ber + Ist
    clvl: 63,
    stats: {
      pow: 25,
      def: 70,
      res: [65, 65, 65, 65, 65],
      damageReduced: 8,
      lifesteal: 8,
      attr: [20, 0, 0, 0],
      mf: 25,
    },
  },
  // Beast [Ber-Tir-Um-Mal-Lum]
  {
    id: 'beast',
    name: 'Feral Maw',
    d2Name: 'Beast',
    allowedSlots: [Slot.Weapon],
    runeIds: [30, 3, 22, 23, 17], // Ber + Tir + Um + Mal + Lum
    clvl: 63,
    stats: {
      min: 30,
      max: 60,
      ias: 40,
      crushingBlow: 20,
      openWounds: 25,
      aura: 'Fanaticism',
      attr: [30, 0, 10, 0],
    },
  },
  // Death [Hel-El-Vex-Ort-Gul]
  {
    id: 'death',
    name: 'Grim Reaping',
    d2Name: 'Death',
    allowedSlots: [Slot.Weapon],
    runeIds: [15, 1, 26, 9, 25], // Hel + El + Vex + Ort + Gul
    clvl: 55,
    stats: {
      min: 45,
      max: 95,
      crushingBlow: 50,
      deadlyStrike: 40,
      manasteal: 7,
      cannotBeFrozen: true,
    },
  },
];

/**
 * Checks if the array of socketed runes matches a valid runeword for the given item slot.
 */
export function matchRuneword(slot: number, runeNames: readonly string[]): RunewordDef | null {
  if (runeNames.length < 2) return null;
  const runes = runeNames.map(getRuneByName);
  if (runes.some((r) => r === undefined)) return null;
  const ids = runes.map((r) => r!.id);

  for (const rw of RUNEWORDS) {
    if (!rw.allowedSlots.includes(slot)) continue;
    if (rw.runeIds.length !== ids.length) continue;
    let match = true;
    for (let i = 0; i < ids.length; i++) {
      if (rw.runeIds[i] !== ids[i]) {
        match = false;
        break;
      }
    }
    if (match) return rw;
  }
  return null;
}

/**
 * Applies runeword completion to a base item when all runes are correctly socketed.
 */
export function applyRunewordToItem(item: ItemDef, rw: RunewordDef): ItemDef {
  const min = (item.min ?? 0) + (rw.stats.min ?? 0);
  const max = (item.max ?? 0) + (rw.stats.max ?? 0);
  const acc = (item.acc ?? 0) + (rw.stats.acc ?? 0);
  const def = (item.def ?? 0) + (rw.stats.def ?? 0);
  const abs = (item.abs ?? 0) + (rw.stats.abs ?? 0);
  const hp = (item.hp ?? 0) + (rw.stats.hp ?? 0);
  const mana = (item.mana ?? 0) + (rw.stats.mana ?? 0);
  const pow = (item.pow ?? 0) + (rw.stats.pow ?? 0);
  const mf = (item.mf ?? 0) + (rw.stats.mf ?? 0);
  const lifesteal = (item.lifesteal ?? 0) + (rw.stats.lifesteal ?? 0);

  const res: [number, number, number, number, number] = [...item.res];
  if (rw.stats.res) {
    for (let i = 0; i < 5; i++) res[i] += rw.stats.res[i];
  }

  const attr: [number, number, number, number] = [...item.attr];
  if (rw.stats.attr) {
    for (let i = 0; i < 4; i++) attr[i] += rw.stats.attr[i];
  }

  return {
    ...item,
    name: `${rw.name} (${item.name})`,
    rarity: 'unique',
    min,
    max,
    acc,
    def,
    abs,
    hp,
    mana,
    pow,
    mf,
    lifesteal,
    res,
    attr,
  };
}
