/**
 * Classic ARPG Item & Encounter Catalog for Thornvael
 *
 * Implements:
 * 1. Base Items Hierarchy (Weapons, Body Armors [Light/Medium/Heavy], Helms, Shields,
 *    Belts [1x4 to 4x4 potion slots], Boots, Gloves, Jewelry, Charms [Small, Large, Grand])
 * 2. Quality Tiers: Normal (White), Superior (Grey/White), Socketed (Grey),
 *    Magic (Blue), Rare (Yellow), Set (Green), Unique (Gold), Crafted (Orange)
 * 3. Gems Matrix (Ruby, Sapphire, Topaz, Emerald, Diamond, Skull, Amethyst)
 *    across all 5 grades with distinct Weapon / Armor / Shield socket bonuses
 * 4. Monster Champion Types (Champion, Berserker, Possessed, Fanatic, Ghostly)
 * 5. Monster Elite Boss Affixes & Mechanics (Lightning Enchanted, Cold Enchanted, Fire Enchanted,
 *    Stone Skin, Extra Fast, Extra Strong, Mana Burn, Cursed, Teleporting, Spectral Hit, Multi-Shot)
 */

import { Slot, type GemQuality, type GemType } from './item-types';

export type ItemQuality =
  | 'normal'
  | 'superior'
  | 'socketed'
  | 'magic'
  | 'rare'
  | 'set'
  | 'unique'
  | 'crafted';

export type WeaponSubtype =
  | 'dagger'
  | 'sword_1h'
  | 'sword_2h'
  | 'axe_1h'
  | 'axe_2h'
  | 'mace'
  | 'polearm'
  | 'spear'
  | 'staff'
  | 'wand'
  | 'scepter'
  | 'bow';

export type ArmorWeightClass = 'light' | 'medium' | 'heavy';

export interface BaseItemDef {
  readonly id: string;
  readonly name: string;
  readonly slot: number; // Slot.Weapon, Slot.Armor, Slot.Helm, Slot.Shield, Slot.Boots, Slot.Gloves, Slot.Ring, Slot.Amulet
  readonly tier: number; // 1..5
  readonly weaponSubtype?: WeaponSubtype;
  readonly armorWeight?: ArmorWeightClass;
  readonly runSpeedPenalty?: number; // 0 for light, -5% for medium, -10% for heavy
  readonly minDmg?: number;
  readonly maxDmg?: number;
  readonly def?: number;
  readonly abs?: number;
  readonly maxSockets: number;
  readonly beltSlots?: number; // 4, 8, 12, 16 for belts
  readonly charmSize?: 'small' | 'large' | 'grand'; // 1x1, 1x2, 1x3
  readonly reqStr: number;
  readonly reqDex: number;
}

export const BASE_ITEMS: readonly BaseItemDef[] = [
  // --- WEAPONS ---
  { id: 'dagger', name: 'Dagger', slot: Slot.Weapon, tier: 1, weaponSubtype: 'dagger', minDmg: 1, maxDmg: 4, maxSockets: 1, reqStr: 0, reqDex: 0 },
  { id: 'kris', name: 'Kris Dagger', slot: Slot.Weapon, tier: 2, weaponSubtype: 'dagger', minDmg: 3, maxDmg: 8, maxSockets: 2, reqStr: 0, reqDex: 10 },
  { id: 'short_sword', name: 'Short Sword', slot: Slot.Weapon, tier: 1, weaponSubtype: 'sword_1h', minDmg: 3, maxDmg: 7, maxSockets: 2, reqStr: 10, reqDex: 0 },
  { id: 'crystal_sword', name: 'Crystal Sword', slot: Slot.Weapon, tier: 2, weaponSubtype: 'sword_1h', minDmg: 5, maxDmg: 15, maxSockets: 4, reqStr: 15, reqDex: 0 },
  { id: 'broad_sword', name: 'Broad Sword', slot: Slot.Weapon, tier: 2, weaponSubtype: 'sword_1h', minDmg: 7, maxDmg: 14, maxSockets: 4, reqStr: 20, reqDex: 0 },
  { id: 'phase_blade', name: 'Dimensional Blade', slot: Slot.Weapon, tier: 5, weaponSubtype: 'sword_1h', minDmg: 25, maxDmg: 35, maxSockets: 6, reqStr: 25, reqDex: 35 },
  { id: 'claymore', name: 'Claymore', slot: Slot.Weapon, tier: 2, weaponSubtype: 'sword_2h', minDmg: 9, maxDmg: 20, maxSockets: 4, reqStr: 25, reqDex: 0 },
  { id: 'colossus_blade', name: 'Colossus Blade', slot: Slot.Weapon, tier: 5, weaponSubtype: 'sword_2h', minDmg: 45, maxDmg: 85, maxSockets: 6, reqStr: 45, reqDex: 25 },
  { id: 'hand_axe', name: 'Hand Axe', slot: Slot.Weapon, tier: 1, weaponSubtype: 'axe_1h', minDmg: 3, maxDmg: 6, maxSockets: 2, reqStr: 10, reqDex: 0 },
  { id: 'berserker_axe', name: 'Berserker Axe', slot: Slot.Weapon, tier: 5, weaponSubtype: 'axe_1h', minDmg: 24, maxDmg: 71, maxSockets: 6, reqStr: 35, reqDex: 20 },
  { id: 'mace', name: 'Heavy Mace', slot: Slot.Weapon, tier: 1, weaponSubtype: 'mace', minDmg: 3, maxDmg: 10, maxSockets: 2, reqStr: 15, reqDex: 0 },
  { id: 'flail', name: 'Spiked Flail', slot: Slot.Weapon, tier: 2, weaponSubtype: 'mace', minDmg: 4, maxDmg: 24, maxSockets: 5, reqStr: 18, reqDex: 15 },
  { id: 'scepter', name: 'Holy Scepter', slot: Slot.Weapon, tier: 2, weaponSubtype: 'scepter', minDmg: 6, maxDmg: 15, maxSockets: 3, reqStr: 15, reqDex: 0 },
  { id: 'colossus_voulge', name: 'Colossus Voulge', slot: Slot.Weapon, tier: 5, weaponSubtype: 'polearm', minDmg: 17, maxDmg: 120, maxSockets: 4, reqStr: 40, reqDex: 15 },
  { id: 'short_bow', name: 'Short Bow', slot: Slot.Weapon, tier: 1, weaponSubtype: 'bow', minDmg: 1, maxDmg: 5, maxSockets: 3, reqStr: 0, reqDex: 10 },
  { id: 'hydra_bow', name: 'Hydra Bow', slot: Slot.Weapon, tier: 5, weaponSubtype: 'bow', minDmg: 10, maxDmg: 68, maxSockets: 6, reqStr: 25, reqDex: 45 },
  { id: 'short_staff', name: 'Oak Short Staff', slot: Slot.Weapon, tier: 1, weaponSubtype: 'staff', minDmg: 2, maxDmg: 6, maxSockets: 2, reqStr: 0, reqDex: 0 },
  { id: 'archon_staff', name: 'Archon Staff', slot: Slot.Weapon, tier: 5, weaponSubtype: 'staff', minDmg: 35, maxDmg: 65, maxSockets: 6, reqStr: 15, reqDex: 0 },
  { id: 'bone_wand', name: 'Bone Wand', slot: Slot.Weapon, tier: 2, weaponSubtype: 'wand', minDmg: 3, maxDmg: 7, maxSockets: 2, reqStr: 0, reqDex: 0 },

  // --- BODY ARMORS (Light, Medium, Heavy) ---
  { id: 'quilted_armor', name: 'Quilted Armor', slot: Slot.Armor, tier: 1, armorWeight: 'light', runSpeedPenalty: 0, def: 8, abs: 1, maxSockets: 2, reqStr: 0, reqDex: 0 },
  { id: 'leather_armor', name: 'Leather Jerkin', slot: Slot.Armor, tier: 1, armorWeight: 'light', runSpeedPenalty: 0, def: 14, abs: 1, maxSockets: 2, reqStr: 10, reqDex: 0 },
  { id: 'breast_plate', name: 'Breast Plate', slot: Slot.Armor, tier: 2, armorWeight: 'light', runSpeedPenalty: 0, def: 25, abs: 2, maxSockets: 3, reqStr: 15, reqDex: 0 },
  { id: 'mage_plate', name: 'Mage Plate', slot: Slot.Armor, tier: 4, armorWeight: 'light', runSpeedPenalty: 0, def: 55, abs: 4, maxSockets: 3, reqStr: 20, reqDex: 0 },
  { id: 'archon_plate', name: 'Archon Plate', slot: Slot.Armor, tier: 5, armorWeight: 'light', runSpeedPenalty: 0, def: 95, abs: 6, maxSockets: 4, reqStr: 30, reqDex: 0 },
  { id: 'ring_mail', name: 'Ring Mail', slot: Slot.Armor, tier: 1, armorWeight: 'medium', runSpeedPenalty: -5, def: 20, abs: 2, maxSockets: 3, reqStr: 15, reqDex: 0 },
  { id: 'chain_mail', name: 'Chain Mail Hauberk', slot: Slot.Armor, tier: 2, armorWeight: 'medium', runSpeedPenalty: -5, def: 35, abs: 3, maxSockets: 3, reqStr: 25, reqDex: 0 },
  { id: 'field_plate', name: 'Field Plate', slot: Slot.Armor, tier: 3, armorWeight: 'medium', runSpeedPenalty: -5, def: 50, abs: 4, maxSockets: 4, reqStr: 35, reqDex: 0 },
  { id: 'full_plate', name: 'Full Plate Mail', slot: Slot.Armor, tier: 3, armorWeight: 'heavy', runSpeedPenalty: -10, def: 65, abs: 5, maxSockets: 4, reqStr: 40, reqDex: 0 },
  { id: 'sacred_armor', name: 'Sacred Plate Armor', slot: Slot.Armor, tier: 5, armorWeight: 'heavy', runSpeedPenalty: -10, def: 120, abs: 8, maxSockets: 4, reqStr: 50, reqDex: 0 },

  // --- HELMS ---
  { id: 'cap', name: 'Leather Cap', slot: Slot.Helm, tier: 1, def: 4, abs: 1, maxSockets: 2, reqStr: 0, reqDex: 0 },
  { id: 'skull_cap', name: 'Skull Cap', slot: Slot.Helm, tier: 1, def: 8, abs: 1, maxSockets: 2, reqStr: 10, reqDex: 0 },
  { id: 'helm', name: 'Iron Helm', slot: Slot.Helm, tier: 2, def: 15, abs: 2, maxSockets: 2, reqStr: 15, reqDex: 0 },
  { id: 'great_helm', name: 'Great Helm', slot: Slot.Helm, tier: 3, def: 25, abs: 3, maxSockets: 3, reqStr: 25, reqDex: 0 },
  { id: 'tiara', name: 'Enchanted Tiara', slot: Slot.Helm, tier: 4, def: 35, abs: 2, maxSockets: 3, reqStr: 0, reqDex: 0 },
  { id: 'diadem', name: 'Arcane Diadem', slot: Slot.Helm, tier: 5, def: 45, abs: 3, maxSockets: 3, reqStr: 0, reqDex: 0 },

  // --- SHIELDS ---
  { id: 'buckler', name: 'Buckler', slot: Slot.Shield, tier: 1, def: 5, abs: 1, maxSockets: 1, reqStr: 5, reqDex: 0 },
  { id: 'small_shield', name: 'Small Round Shield', slot: Slot.Shield, tier: 1, def: 10, abs: 1, maxSockets: 2, reqStr: 10, reqDex: 0 },
  { id: 'kite_shield', name: 'Kite Shield', slot: Slot.Shield, tier: 2, def: 18, abs: 2, maxSockets: 3, reqStr: 18, reqDex: 0 },
  { id: 'tower_shield', name: 'Tower Shield', slot: Slot.Shield, tier: 3, def: 30, abs: 3, maxSockets: 4, reqStr: 30, reqDex: 0 },
  { id: 'monarch', name: 'Monarch Shield', slot: Slot.Shield, tier: 5, def: 55, abs: 4, maxSockets: 4, reqStr: 35, reqDex: 0 },

  // --- BELTS (Potion Slot Progression) ---
  { id: 'sash', name: 'Sash', slot: Slot.Armor, tier: 1, def: 2, abs: 0, maxSockets: 0, beltSlots: 4, reqStr: 0, reqDex: 0 },
  { id: 'light_belt', name: 'Light Belt', slot: Slot.Armor, tier: 2, def: 4, abs: 0, maxSockets: 0, beltSlots: 8, reqStr: 10, reqDex: 0 },
  { id: 'belt', name: 'Heavy Belt', slot: Slot.Armor, tier: 3, def: 8, abs: 1, maxSockets: 0, beltSlots: 12, reqStr: 15, reqDex: 0 },
  { id: 'plated_belt', name: 'Plated Belt', slot: Slot.Armor, tier: 4, def: 14, abs: 1, maxSockets: 0, beltSlots: 16, reqStr: 25, reqDex: 0 },
  { id: 'colossus_girdle', name: 'Colossus Girdle', slot: Slot.Armor, tier: 5, def: 25, abs: 2, maxSockets: 0, beltSlots: 16, reqStr: 35, reqDex: 0 },

  // --- CHARMS (Small, Large, Grand) ---
  { id: 'small_charm', name: 'Small Talisman Charm', slot: -1, tier: 1, charmSize: 'small', maxSockets: 0, reqStr: 0, reqDex: 0 },
  { id: 'large_charm', name: 'Large Relic Charm', slot: -1, tier: 2, charmSize: 'large', maxSockets: 0, reqStr: 0, reqDex: 0 },
  { id: 'grand_charm', name: 'Grand Mystic Charm', slot: -1, tier: 3, charmSize: 'grand', maxSockets: 0, reqStr: 0, reqDex: 0 },
];

/**
 * Enhanced Gems Matrix:
 * Includes all 7 Gem types: Ruby, Sapphire, Topaz, Emerald, Diamond, Skull, Amethyst
 * Across all 5 Qualities: Chipped, Flawed, Regular, Flawless, Perfect
 */
export interface CatalogGemDef {
  readonly name: string;
  readonly type: GemType | 'diamond' | 'amethyst';
  readonly quality: GemQuality;
  readonly tier: number;
  readonly weaponBonus: {
    min?: number;
    max?: number;
    elem?: number;
    lifesteal?: number;
    manasteal?: number;
    acc?: number;
    undeadDmg?: number;
  };
  readonly armorBonus: {
    hp?: number;
    mana?: number;
    mf?: number;
    def?: number;
    attr?: readonly [number, number, number, number];
    regen?: number;
  };
  readonly shieldBonus: {
    res?: readonly [number, number, number, number, number];
    def?: number;
    attackerTakesDmg?: number;
  };
}

export const CATALOG_GEMS: readonly CatalogGemDef[] = [
  // Diamond (Undead Damage / Attack Rating / All Resistances)
  { name: 'Chipped Diamond', type: 'diamond', quality: 'chipped', tier: 1, weaponBonus: { undeadDmg: 20 }, armorBonus: { attr: [0, 1, 0, 0] }, shieldBonus: { res: [6, 6, 6, 6, 6] } },
  { name: 'Flawed Diamond', type: 'diamond', quality: 'flawed', tier: 2, weaponBonus: { undeadDmg: 35 }, armorBonus: { attr: [0, 2, 0, 0] }, shieldBonus: { res: [8, 8, 8, 8, 8] } },
  { name: 'Diamond', type: 'diamond', quality: 'regular', tier: 3, weaponBonus: { undeadDmg: 50 }, armorBonus: { attr: [0, 3, 0, 0] }, shieldBonus: { res: [11, 11, 11, 11, 11] } },
  { name: 'Flawless Diamond', type: 'diamond', quality: 'flawless', tier: 4, weaponBonus: { undeadDmg: 68 }, armorBonus: { attr: [0, 4, 0, 0] }, shieldBonus: { res: [14, 14, 14, 14, 14] } },
  { name: 'Perfect Diamond', type: 'diamond', quality: 'perfect', tier: 5, weaponBonus: { undeadDmg: 100 }, armorBonus: { attr: [0, 6, 0, 0] }, shieldBonus: { res: [19, 19, 19, 19, 19] } },

  // Amethyst (Attack Rating / Strength-Body / Defense)
  { name: 'Chipped Amethyst', type: 'amethyst', quality: 'chipped', tier: 1, weaponBonus: { acc: 40 }, armorBonus: { attr: [3, 0, 0, 0] }, shieldBonus: { def: 8 } },
  { name: 'Flawed Amethyst', type: 'amethyst', quality: 'flawed', tier: 2, weaponBonus: { acc: 60 }, armorBonus: { attr: [4, 0, 0, 0] }, shieldBonus: { def: 12 } },
  { name: 'Amethyst', type: 'amethyst', quality: 'regular', tier: 3, weaponBonus: { acc: 80 }, armorBonus: { attr: [6, 0, 0, 0] }, shieldBonus: { def: 18 } },
  { name: 'Flawless Amethyst', type: 'amethyst', quality: 'flawless', tier: 4, weaponBonus: { acc: 100 }, armorBonus: { attr: [8, 0, 0, 0] }, shieldBonus: { def: 24 } },
  { name: 'Perfect Amethyst', type: 'amethyst', quality: 'perfect', tier: 5, weaponBonus: { acc: 150 }, armorBonus: { attr: [10, 0, 0, 0] }, shieldBonus: { def: 30 } },
];

/**
 * Monster Champion Types
 */
export type ChampionType =
  | 'champion' // +300% HP, +33% Damage, +300% XP
  | 'berserker' // +100% HP, +200% Damage, +50% Attack Speed, -50% Defense
  | 'possessed' // +400% HP, Immune to Curses / Crowd Control
  | 'fanatic' // +100% Move Speed, +50% Attack Speed
  | 'ghostly'; // 50% Physical Resistance, adds Cold Damage & Chill

export interface ChampionModStats {
  hpMult: number;
  dmgMult: number;
  speedMult: number;
  xpMult: number;
  defMult: number;
  immuneToCurse?: boolean;
  coldDamage?: boolean;
  physicalRes?: number;
}

export const CHAMPION_TYPES: Record<ChampionType, ChampionModStats> = {
  champion: { hpMult: 3.0, dmgMult: 1.33, speedMult: 1.2, xpMult: 3.0, defMult: 1.0 },
  berserker: { hpMult: 2.0, dmgMult: 3.0, speedMult: 1.5, xpMult: 3.0, defMult: 0.5 },
  possessed: { hpMult: 4.0, dmgMult: 1.2, speedMult: 1.1, xpMult: 3.0, defMult: 1.0, immuneToCurse: true },
  fanatic: { hpMult: 2.0, dmgMult: 1.2, speedMult: 2.0, xpMult: 3.0, defMult: 1.0 },
  ghostly: { hpMult: 1.5, dmgMult: 1.2, speedMult: 0.8, xpMult: 3.0, defMult: 1.0, coldDamage: true, physicalRes: 50 },
};

/**
 * Unique Boss Affixes & Mechanics
 */
export type BossAffixId =
  | 'lightning_enchanted' // +75% Lightning resist, emits charged bolts when struck
  | 'cold_enchanted' // +75% Cold resist, Frost Nova on death
  | 'fire_enchanted' // +75% Fire resist, Corpse Explosion on death
  | 'stone_skin' // +50% Physical resistance, +100% Defense
  | 'extra_fast' // +20% Move Speed, +20% Attack Speed
  | 'extra_strong' // +150% Physical Damage
  | 'mana_burn' // Drains target mana on hit, +20% Magic resist
  | 'cursed' // 50% chance to cast Amplify Damage / Weaken on hit
  | 'teleporting' // Teleports away when damaged < 33% HP and heals
  | 'spectral_hit' // Adds random elemental damage to attacks, +20% all resists
  | 'multi_shot' // Fires 3 projectiles instead of 1 for ranged units
  | 'aura_enchanted'; // Might / Holy Freeze / Fanaticism aura

export interface BossAffixDef {
  id: BossAffixId;
  name: string;
  description: string;
}

export const BOSS_AFFIXES: readonly BossAffixDef[] = [
  { id: 'lightning_enchanted', name: 'Lightning Enchanted', description: '+75% Lightning Resist, emits Charged Bolts on hit' },
  { id: 'cold_enchanted', name: 'Cold Enchanted', description: '+75% Cold Resist, casts Frost Nova on death' },
  { id: 'fire_enchanted', name: 'Fire Enchanted', description: '+75% Fire Resist, Corpse Explosion on death' },
  { id: 'stone_skin', name: 'Stone Skin', description: '+50% Physical Resistance, +100% Defense' },
  { id: 'extra_fast', name: 'Extra Fast', description: '+20% Movement Speed, +20% Attack Speed' },
  { id: 'extra_strong', name: 'Extra Strong', description: '+150% Physical Damage' },
  { id: 'mana_burn', name: 'Mana Burn', description: 'Drains target Mana on strike, +20% Magic Resist' },
  { id: 'cursed', name: 'Cursed', description: 'Inflicts Amplify Damage hex on strike' },
  { id: 'teleporting', name: 'Teleporting', description: 'Teleports and heals when reduced below 33% HP' },
  { id: 'spectral_hit', name: 'Spectral Hit', description: 'Adds random elemental damage, +20% all resistances' },
  { id: 'multi_shot', name: 'Multi-Shot', description: 'Triple projectile barrage for ranged attacks' },
  { id: 'aura_enchanted', name: 'Aura Enchanted', description: 'Projects combat aura empowering surrounding allies' },
];
