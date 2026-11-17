/** Item types and core interfaces. Extracted to eliminate circular imports between items, runes, cube and affixes. */

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

/** Gear is worn; potions are used up; learn items (scroll or tome) teach a spell for good; portal opens a rift; gem socketed into gear; identify unmasks relics. */
export const Ik = { Gear: 0, Potion: 1, Learn: 2, Portal: 3, Gem: 4, Identify: 5, Key: 6 } as const;
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
  crit?: number; // critical strike chance percentage
  runes?: readonly string[]; // architectural hook for future slotted runes
  mf?: number; // Magic Find %
  crushingBlow?: number;
  deadlyStrike?: number;
  openWounds?: number;
  fcr?: number;
  fhr?: number;
  ias?: number;
  manasteal?: number;
  beltSlots?: number;
  charmSize?: 'small' | 'large' | 'grand';
  maxRes?: readonly [number, number, number, number, number];
  cannotBeFrozen?: boolean;
  rarity?: 'common' | 'normal' | 'magic' | 'rare' | 'set' | 'unique' | string;
  set?: string;
  unidentified?: boolean;
  trueName?: string;
  lore?: string;
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
