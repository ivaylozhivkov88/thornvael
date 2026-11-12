import { Ik, ItemDef, Slot, CLS_WARRIOR, CLS_MAGE, CLS_BOTH } from './items';

/**
 * Item Sets inspired by classic Diablo II (e.g. Sigon's, Tal Rasha's, Immortal King).
 * Equipping multiple items from the same set activates partial (2-piece, 3-piece)
 * and complete set bonuses.
 */

export interface SetBonus {
  readonly pieces: number;
  readonly hp?: number;
  readonly mana?: number;
  readonly def?: number;
  readonly abs?: number;
  readonly acc?: number;
  readonly min?: number;
  readonly max?: number;
  readonly pow?: number; // Spell power %
  readonly res?: readonly [number, number, number, number, number];
  readonly attr?: readonly [number, number, number, number];
}

export interface ItemSetDef {
  readonly id: string;
  readonly name: string;
  readonly pieces: readonly ItemDef[];
  readonly bonuses: readonly SetBonus[];
}

// -----------------------------------------------------------------------------
// 1. Warrior Set: Iron Warden's Bastion (4 Pieces - Tank / Defender)
// -----------------------------------------------------------------------------
export const SET_IRON_WARDEN: ItemSetDef = {
  id: 'iron_warden',
  name: "Iron Warden's Bastion",
  pieces: [
    {
      name: "Iron Warden's Visor",
      kind: Ik.Gear,
      slot: Slot.Helm,
      tier: 3,
      w: 4,
      cls: CLS_WARRIOR,
      need: 0, // Body
      needv: 11,
      min: 0,
      max: 0,
      acc: 0,
      cover: 1, // head
      def: 3,
      abs: 4,
      res: [0, 0, 0, 10, 0],
      attr: [1, 0, 0, 0],
      hp: 20,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 1,
    },
    {
      name: "Iron Warden's Tower",
      kind: Ik.Gear,
      slot: Slot.Shield,
      tier: 3,
      w: 8,
      cls: CLS_WARRIOR,
      need: 0, // Body
      needv: 12,
      min: 0,
      max: 0,
      acc: 0,
      cover: 4, // arms
      def: 4,
      abs: 3,
      res: [15, 0, 0, 15, 0],
      attr: [0, 0, 0, 0],
      hp: 15,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 1,
    },
    {
      name: "Iron Warden's Hauberk",
      kind: Ik.Gear,
      slot: Slot.Armor,
      tier: 3,
      w: 12,
      cls: CLS_WARRIOR,
      need: 0, // Body
      needv: 13,
      min: 0,
      max: 0,
      acc: 0,
      cover: 6, // torso + arms
      def: 2,
      abs: 5,
      res: [0, 0, 0, 10, 0],
      attr: [1, 0, 0, 0],
      hp: 35,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 2,
    },
    {
      name: "Iron Warden's Greaves",
      kind: Ik.Gear,
      slot: Slot.Boots,
      tier: 3,
      w: 4,
      cls: CLS_WARRIOR,
      need: 0, // Body
      needv: 10,
      min: 0,
      max: 0,
      acc: 0,
      cover: 8, // legs
      def: 2,
      abs: 2,
      res: [0, 0, 0, 0, 0],
      attr: [0, 0, 0, 1], // Spirit +1
      hp: 15,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
  ],
  bonuses: [
    {
      pieces: 2,
      hp: 15,
      def: 2,
    },
    {
      pieces: 3,
      res: [15, 0, 0, 15, 0],
      attr: [2, 0, 0, 0],
    },
    {
      pieces: 4, // Full Set
      hp: 50,
      abs: 4,
      attr: [3, 0, 0, 0],
      res: [15, 15, 15, 15, 15],
    },
  ],
};

// -----------------------------------------------------------------------------
// 2. Mage Set: Pyromancer's Ember-Veil (3 Pieces - Fire Element Specialist)
// -----------------------------------------------------------------------------
export const SET_PYROMANCER: ItemSetDef = {
  id: 'pyromancer',
  name: "Pyromancer's Ember-Veil",
  pieces: [
    {
      name: "Ember-Weaver's Focus",
      kind: Ik.Gear,
      slot: Slot.Weapon,
      tier: 3,
      w: 2,
      cls: CLS_MAGE,
      need: 2, // Mind
      needv: 12,
      min: 1,
      max: 2,
      acc: 1,
      cover: 0,
      def: 0,
      abs: 0,
      res: [15, 0, 0, 0, 0],
      attr: [0, 0, 1, 0],
      hp: 0,
      mana: 25,
      pow: 18,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 1,
    },
    {
      name: 'Robe of the Blazing Core',
      kind: Ik.Gear,
      slot: Slot.Armor,
      tier: 3,
      w: 3,
      cls: CLS_MAGE,
      need: 2, // Mind
      needv: 11,
      min: 0,
      max: 0,
      acc: 0,
      cover: 2, // torso
      def: 1,
      abs: 2,
      res: [30, 0, 0, 0, 0],
      attr: [0, 0, 1, 0],
      hp: 0,
      mana: 20,
      pow: 8,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 1,
    },
    {
      name: 'Heart of Cinders',
      kind: Ik.Gear,
      slot: Slot.Amulet,
      tier: 3,
      w: 0,
      cls: CLS_MAGE,
      need: 3, // Spirit
      needv: 9,
      min: 0,
      max: 0,
      acc: 0,
      cover: 0,
      def: 0,
      abs: 0,
      res: [25, 0, 0, 0, 0],
      attr: [0, 0, 0, 1],
      hp: 0,
      mana: 15,
      pow: 10,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
  ],
  bonuses: [
    {
      pieces: 2,
      mana: 25,
      res: [15, 0, 0, 0, 0],
      pow: 10,
    },
    {
      pieces: 3, // Full Set
      mana: 50,
      res: [25, 0, 0, 0, 0],
      pow: 20,
      attr: [0, 0, 2, 2],
    },
  ],
};

// -----------------------------------------------------------------------------
// 3. Rogue/Agile Set: Shadow-Stalker's Silent Walk (3 Pieces)
// -----------------------------------------------------------------------------
export const SET_SHADOW_STALKER: ItemSetDef = {
  id: 'shadow_stalker',
  name: "Shadow-Stalker's Silent Walk",
  pieces: [
    {
      name: "Shadow-Stalker's Cowl",
      kind: Ik.Gear,
      slot: Slot.Helm,
      tier: 3,
      w: 2,
      cls: CLS_BOTH,
      need: 1, // Agility
      needv: 11,
      min: 0,
      max: 0,
      acc: 4,
      cover: 1, // head
      def: 2,
      abs: 1,
      res: [0, 0, 10, 0, 0],
      attr: [0, 1, 0, 0],
      hp: 15,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
    {
      name: 'Boots of the Mist-Strider',
      kind: Ik.Gear,
      slot: Slot.Boots,
      tier: 3,
      w: 2,
      cls: CLS_BOTH,
      need: 1, // Agility
      needv: 12,
      min: 0,
      max: 0,
      acc: 2,
      cover: 8, // legs
      def: 1,
      abs: 1,
      res: [0, 0, 15, 0, 0],
      attr: [0, 1, 0, 0],
      hp: 10,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
    {
      name: 'Grip of the Night-Hunter',
      kind: Ik.Gear,
      slot: Slot.Gloves,
      tier: 3,
      w: 1,
      cls: CLS_BOTH,
      need: 1, // Agility
      needv: 10,
      min: 2,
      max: 4,
      acc: 3,
      cover: 4, // arms
      def: 1,
      abs: 1,
      res: [0, 0, 0, 0, 10],
      attr: [0, 1, 0, 0],
      hp: 0,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
  ],
  bonuses: [
    {
      pieces: 2,
      attr: [0, 2, 0, 0],
      acc: 5,
      hp: 15,
    },
    {
      pieces: 3, // Full Set
      attr: [0, 4, 0, 0],
      acc: 10,
      hp: 30,
      min: 5,
      max: 5,
      res: [0, 0, 15, 0, 15],
    },
  ],
};

// -----------------------------------------------------------------------------
// 1. Early Levelling Set: Alder Vanguard's Regalia (4 Pieces - Shared Tier 1-2)
// -----------------------------------------------------------------------------
// Spiritual archetype: Sigon's Complete Steel.
// Highly accessible (low stat requirements equipable by Level 1 Warrior or Mage),
// with an immediately impactful 2-piece power spike (+20 HP, +3 Acc, +2 Def)
// that smooths early Act 1 progression through Alder River and the Border Fords.
export const SET_ALDER_VANGUARD: ItemSetDef = {
  id: 'alder_vanguard',
  name: "Alder Vanguard's Regalia",
  pieces: [
    {
      name: "Alder Vanguard's Sallet",
      kind: Ik.Gear,
      slot: Slot.Helm,
      tier: 1,
      w: 2,
      cls: CLS_BOTH,
      need: 1, // Agility
      needv: 4,
      min: 0,
      max: 0,
      acc: 1,
      cover: 1, // Head
      def: 1,
      abs: 1,
      res: [0, 0, 0, 0, 0],
      attr: [0, 0, 0, 0],
      hp: 10,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
    {
      name: "Alder Vanguard's Brigandine",
      kind: Ik.Gear,
      slot: Slot.Armor,
      tier: 2,
      w: 6,
      cls: CLS_BOTH,
      need: 0, // Body
      needv: 4,
      min: 0,
      max: 0,
      acc: 0,
      cover: 6, // Torso + Arms
      def: 1,
      abs: 2,
      res: [0, 0, 0, 0, 0],
      attr: [0, 0, 0, 0],
      hp: 15,
      mana: 10,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 1,
    },
    {
      name: "Alder Vanguard's Grips",
      kind: Ik.Gear,
      slot: Slot.Gloves,
      tier: 1,
      w: 1,
      cls: CLS_BOTH,
      need: 1, // Agility
      needv: 4,
      min: 1,
      max: 1,
      acc: 2,
      cover: 4, // Arms
      def: 1,
      abs: 1,
      res: [0, 0, 0, 0, 0],
      attr: [0, 0, 0, 0],
      hp: 0,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
    {
      name: "Alder Vanguard's Striders",
      kind: Ik.Gear,
      slot: Slot.Boots,
      tier: 1,
      w: 2,
      cls: CLS_BOTH,
      need: 1, // Agility
      needv: 4,
      min: 0,
      max: 0,
      acc: 0,
      cover: 8, // Legs
      def: 1,
      abs: 1,
      res: [0, 0, 0, 0, 0],
      attr: [0, 1, 0, 0], // Agility +1
      hp: 10,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
  ],
  bonuses: [
    {
      pieces: 2,
      hp: 20,
      acc: 3,
      def: 2,
    },
    {
      pieces: 3,
      min: 2,
      max: 2,
      pow: 8,
      abs: 1,
    },
    {
      pieces: 4, // Full Set
      hp: 30,
      mana: 25,
      attr: [1, 1, 1, 1],
      res: [10, 10, 10, 10, 10],
    },
  ],
};

// -----------------------------------------------------------------------------
// 2. Mid Warrior Set: Redmarsh Reaver's Armament (4 Pieces - Offensive Warlord)
// -----------------------------------------------------------------------------
// Complements the existing defensive tank set (Iron Warden's Bastion).
// Focused on high blow damage, accuracy, and aggressive momentum for Act 2-3.
export const SET_REDMARSH_REAVER: ItemSetDef = {
  id: 'redmarsh_reaver',
  name: "Redmarsh Reaver's Armament",
  pieces: [
    {
      name: "Redmarsh Reaver's Cleaver",
      kind: Ik.Gear,
      slot: Slot.Weapon,
      tier: 3,
      w: 8,
      cls: CLS_WARRIOR,
      need: 0, // Body
      needv: 11,
      min: 8,
      max: 12,
      acc: 2,
      cover: 0,
      def: 0,
      abs: 0,
      res: [0, 0, 0, 0, 0],
      attr: [1, 0, 0, 0], // Body +1
      hp: 15,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 1,
    },
    {
      name: "Redmarsh Reaver's Visage",
      kind: Ik.Gear,
      slot: Slot.Helm,
      tier: 3,
      w: 4,
      cls: CLS_WARRIOR,
      need: 0, // Body
      needv: 11,
      min: 0,
      max: 0,
      acc: 2,
      cover: 1, // Head
      def: 2,
      abs: 3,
      res: [0, 0, 0, 15, 0], // Earth res +15%
      attr: [0, 0, 0, 0],
      hp: 20,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
    {
      name: "Redmarsh Reaver's Hauberk",
      kind: Ik.Gear,
      slot: Slot.Armor,
      tier: 4,
      w: 18,
      cls: CLS_WARRIOR,
      need: 0, // Body
      needv: 13,
      min: 2,
      max: 2,
      acc: 0,
      cover: 6, // Torso + Arms
      def: 2,
      abs: 5,
      res: [0, 0, 0, 10, 0],
      attr: [1, 0, 0, 0], // Body +1
      hp: 40,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 2,
    },
    {
      name: "Redmarsh Reaver's Claws",
      kind: Ik.Gear,
      slot: Slot.Gloves,
      tier: 3,
      w: 4,
      cls: CLS_WARRIOR,
      need: 0, // Body
      needv: 10,
      min: 2,
      max: 3,
      acc: 2,
      cover: 4, // Arms
      def: 1,
      abs: 3,
      res: [0, 0, 0, 0, 0],
      attr: [0, 1, 0, 0], // Agility +1
      hp: 0,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
  ],
  bonuses: [
    {
      pieces: 2,
      min: 4,
      max: 5,
      acc: 4,
      hp: 25,
    },
    {
      pieces: 3,
      min: 6,
      max: 8,
      attr: [2, 1, 0, 0],
      abs: 2,
    },
    {
      pieces: 4, // Full Set
      min: 8,
      max: 12,
      acc: 6,
      hp: 50,
      attr: [3, 2, 0, 0],
      res: [15, 0, 0, 15, 0],
    },
  ],
};

// -----------------------------------------------------------------------------
// 3. Mid Mage Set: Boreal Frost-Weaver's Shroud (4 Pieces - Water & Air Controller)
// -----------------------------------------------------------------------------
// Complements the existing fire specialist set (Pyromancer's Ember-Veil).
// Emphasizes Water/Frost and Air/Storm spells, mana pool resilience, and chilling defense.
export const SET_BOREAL_FROSTWEAVER: ItemSetDef = {
  id: 'boreal_frostweaver',
  name: "Boreal Frost-Weaver's Shroud",
  pieces: [
    {
      name: "Boreal Frost-Weaver's Wand",
      kind: Ik.Gear,
      slot: Slot.Weapon,
      tier: 3,
      w: 2,
      cls: CLS_MAGE,
      need: 2, // Mind
      needv: 11,
      min: 1,
      max: 2,
      acc: 1,
      cover: 0,
      def: 0,
      abs: 0,
      res: [0, 20, 0, 0, 0], // Water res +20%
      attr: [0, 0, 1, 0], // Mind +1
      hp: 0,
      mana: 20,
      pow: 22,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 1,
    },
    {
      name: "Boreal Frost-Weaver's Circlet",
      kind: Ik.Gear,
      slot: Slot.Helm,
      tier: 3,
      w: 1,
      cls: CLS_MAGE,
      need: 2, // Mind
      needv: 10,
      min: 0,
      max: 0,
      acc: 0,
      cover: 1, // Head
      def: 1,
      abs: 1,
      res: [0, 15, 0, 0, 0], // Water res +15%
      attr: [0, 0, 1, 0], // Mind +1
      hp: 0,
      mana: 20,
      pow: 10,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
    {
      name: "Boreal Frost-Weaver's Robe",
      kind: Ik.Gear,
      slot: Slot.Armor,
      tier: 4,
      w: 3,
      cls: CLS_MAGE,
      need: 2, // Mind
      needv: 13,
      min: 0,
      max: 0,
      acc: 0,
      cover: 6, // Torso + Arms
      def: 1,
      abs: 2,
      res: [0, 25, 15, 0, 0], // Water 25%, Air 15%
      attr: [0, 0, 1, 1], // Mind +1, Spirit +1
      hp: 15,
      mana: 30,
      pow: 16,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 1,
    },
    {
      name: "Boreal Frost-Weaver's Band",
      kind: Ik.Gear,
      slot: Slot.Ring,
      tier: 3,
      w: 0,
      cls: CLS_MAGE,
      need: 3, // Spirit
      needv: 9,
      min: 0,
      max: 0,
      acc: 0,
      cover: 0,
      def: 0,
      abs: 0,
      res: [0, 15, 0, 0, 0],
      attr: [0, 0, 1, 1], // Mind +1, Spirit +1
      hp: 0,
      mana: 25,
      pow: 8,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
  ],
  bonuses: [
    {
      pieces: 2,
      mana: 35,
      pow: 12,
      res: [0, 20, 0, 0, 0],
    },
    {
      pieces: 3,
      mana: 50,
      pow: 18,
      def: 2,
      abs: 2,
      res: [0, 25, 20, 0, 0],
    },
    {
      pieces: 4, // Full Set
      mana: 80,
      pow: 28,
      attr: [0, 0, 3, 2],
      res: [15, 35, 25, 0, 15],
    },
  ],
};

// -----------------------------------------------------------------------------
// 4. Endgame Warrior Set: Crown-Forged Juggernaut (5 Pieces - Tier 5 Melee Colossus)
// -----------------------------------------------------------------------------
// Spiritual archetype: Immortal King's Legend.
// High Body requirements (16-18) reflect legendary tier 5 status.
// Deliberate partial combos:
// - 2-piece (Gloves + Boots) provides an irresistible melee foundation (+8 Acc, +2 Body, +2 Agi, +3 Def, +35 HP).
// - 3-piece (adding Helm or Full Plate) adds crushing blow damage (+6-10 dmg, +3 Abs, +15% all res)
//   while leaving the weapon and shield slots open for specialized single-hand unique setups.
// - 5-piece transforms the warrior into an unstoppable juggernaut (+100 HP, +14-20 dmg, +6 Abs, +25% all res).
export const SET_CROWN_FORGED: ItemSetDef = {
  id: 'crown_forged',
  name: "Crown-Forged Juggernaut",
  pieces: [
    {
      name: "Crown-Forged Greatmaul",
      kind: Ik.Gear,
      slot: Slot.Weapon,
      tier: 5,
      w: 15,
      cls: CLS_WARRIOR,
      need: 0, // Body
      needv: 18,
      min: 16,
      max: 24,
      acc: 3,
      cover: 0,
      def: 0,
      abs: 0,
      res: [0, 0, 0, 0, 0],
      attr: [2, 0, 0, 0], // Body +2
      hp: 25,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 2,
    },
    {
      name: "Crown-Forged Great-Helm",
      kind: Ik.Gear,
      slot: Slot.Helm,
      tier: 5,
      w: 6,
      cls: CLS_WARRIOR,
      need: 0, // Body
      needv: 16,
      min: 0,
      max: 0,
      acc: 2,
      cover: 1, // Head
      def: 3,
      abs: 6,
      res: [10, 10, 10, 10, 10],
      attr: [1, 0, 0, 0], // Body +1
      hp: 35,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 1,
    },
    {
      name: "Crown-Forged Full Plate",
      kind: Ik.Gear,
      slot: Slot.Armor,
      tier: 5,
      w: 26,
      cls: CLS_WARRIOR,
      need: 0, // Body
      needv: 18,
      min: 0,
      max: 0,
      acc: 0,
      cover: 6, // Torso + Arms
      def: 3,
      abs: 8,
      res: [10, 10, 10, 10, 10],
      attr: [2, 0, 0, 0], // Body +2
      hp: 50,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 2,
    },
    {
      name: "Crown-Forged Greaves",
      kind: Ik.Gear,
      slot: Slot.Boots,
      tier: 5,
      w: 7,
      cls: CLS_WARRIOR,
      need: 0, // Body
      needv: 16,
      min: 0,
      max: 0,
      acc: 2,
      cover: 8, // Legs
      def: 2,
      abs: 5,
      res: [0, 0, 0, 0, 0],
      attr: [0, 1, 0, 0], // Agility +1
      hp: 30,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
    {
      name: "Crown-Forged Gauntlets",
      kind: Ik.Gear,
      slot: Slot.Gloves,
      tier: 5,
      w: 5,
      cls: CLS_WARRIOR,
      need: 0, // Body
      needv: 16,
      min: 3,
      max: 5,
      acc: 4,
      cover: 4, // Arms
      def: 2,
      abs: 5,
      res: [0, 0, 0, 0, 0],
      attr: [1, 1, 0, 0], // Body +1, Agility +1
      hp: 0,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
  ],
  bonuses: [
    {
      pieces: 2,
      acc: 8,
      attr: [2, 2, 0, 0],
      def: 3,
      hp: 35,
    },
    {
      pieces: 3,
      min: 6,
      max: 10,
      abs: 3,
      res: [15, 15, 15, 15, 15],
    },
    {
      pieces: 4,
      hp: 60,
      min: 8,
      max: 12,
      abs: 4,
      def: 4,
    },
    {
      pieces: 5, // Full Set
      hp: 100,
      min: 14,
      max: 20,
      abs: 6,
      attr: [4, 2, 0, 0],
      res: [25, 25, 25, 25, 25],
    },
  ],
};

// -----------------------------------------------------------------------------
// 5. Endgame Mage Set: Astral Sovereign's Regalia (5 Pieces - Tier 5 Archmage)
// -----------------------------------------------------------------------------
// Spiritual archetype: Tal Rasha's Wrappings.
// Slots: Weapon, Helm, Armor, Amulet, Gloves.
// Deliberate partial combos:
// - The famous 3-piece combo (Amulet + Gloves + Robes/Diadem) provides immense spell power (+37% combined),
//   all-resistance (+30% all), and +100 Max Mana, while keeping the Weapon slot open for specialized
//   elemental staves (like Thorn Archon Staff) or unique wands and rings/boots.
// - Full 5-piece unlocks absolute cosmic mastery (+185%+ total Spell Power, +350+ Mana, maxed 80% res).
export const SET_ASTRAL_SOVEREIGN: ItemSetDef = {
  id: 'astral_sovereign',
  name: "Astral Sovereign's Regalia",
  pieces: [
    {
      name: "Astral Sovereign's Spire",
      kind: Ik.Gear,
      slot: Slot.Weapon,
      tier: 5,
      w: 5,
      cls: CLS_MAGE,
      need: 2, // Mind
      needv: 17,
      min: 2,
      max: 4,
      acc: 2,
      cover: 0,
      def: 0,
      abs: 0,
      res: [0, 0, 0, 0, 20], // Astral res +20%
      attr: [0, 0, 2, 1], // Mind +2, Spirit +1
      hp: 0,
      mana: 40,
      pow: 45,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 2,
    },
    {
      name: "Astral Sovereign's Diadem",
      kind: Ik.Gear,
      slot: Slot.Helm,
      tier: 5,
      w: 2,
      cls: CLS_MAGE,
      need: 2, // Mind
      needv: 16,
      min: 0,
      max: 0,
      acc: 0,
      cover: 1, // Head
      def: 2,
      abs: 2,
      res: [10, 10, 10, 10, 10],
      attr: [0, 0, 1, 0], // Mind +1
      hp: 0,
      mana: 40,
      pow: 18,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 1,
    },
    {
      name: "Astral Sovereign's Robes",
      kind: Ik.Gear,
      slot: Slot.Armor,
      tier: 5,
      w: 4,
      cls: CLS_MAGE,
      need: 2, // Mind
      needv: 16,
      min: 0,
      max: 0,
      acc: 0,
      cover: 6, // Torso + Arms
      def: 2,
      abs: 3,
      res: [20, 20, 20, 20, 20],
      attr: [0, 0, 1, 1], // Mind +1, Spirit +1
      hp: 30,
      mana: 45,
      pow: 24,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 2,
    },
    {
      name: "Astral Sovereign's Eye",
      kind: Ik.Gear,
      slot: Slot.Amulet,
      tier: 5,
      w: 0,
      cls: CLS_MAGE,
      need: 3, // Spirit
      needv: 13,
      min: 0,
      max: 0,
      acc: 0,
      cover: 0,
      def: 0,
      abs: 0,
      res: [15, 15, 15, 15, 15],
      attr: [0, 0, 1, 1], // Mind +1, Spirit +1
      hp: 0,
      mana: 35,
      pow: 15,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
    {
      name: "Astral Sovereign's Handwraps",
      kind: Ik.Gear,
      slot: Slot.Gloves,
      tier: 5,
      w: 1,
      cls: CLS_MAGE,
      need: 2, // Mind
      needv: 15,
      min: 0,
      max: 0,
      acc: 0,
      cover: 4, // Arms
      def: 1,
      abs: 2,
      res: [0, 0, 0, 0, 15], // Astral res +15%
      attr: [0, 0, 1, 1], // Mind +1, Spirit +1
      hp: 0,
      mana: 30,
      pow: 16,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    },
  ],
  bonuses: [
    {
      pieces: 2,
      mana: 40,
      pow: 15,
      res: [10, 10, 10, 10, 10],
    },
    {
      pieces: 3, // The Famous 3-Piece Tal's Combo
      pow: 22,
      mana: 60,
      res: [20, 20, 20, 20, 20],
      attr: [0, 0, 3, 2],
    },
    {
      pieces: 4,
      hp: 40,
      mana: 80,
      def: 3,
      abs: 2,
      pow: 15,
    },
    {
      pieces: 5, // Full Set
      pow: 35,
      mana: 120,
      hp: 60,
      attr: [0, 0, 4, 4],
      res: [25, 25, 25, 25, 25],
      abs: 3,
    },
  ],
};


export const ALL_SETS: readonly ItemSetDef[] = [
  SET_IRON_WARDEN,
  SET_PYROMANCER,
  SET_SHADOW_STALKER,
  SET_ALDER_VANGUARD,
  SET_REDMARSH_REAVER,
  SET_BOREAL_FROSTWEAVER,
  SET_CROWN_FORGED,
  SET_ASTRAL_SOVEREIGN,
];

/** All unique individual set piece items across all sets */
export const ALL_SET_ITEMS: readonly ItemDef[] = ALL_SETS.flatMap((s) => s.pieces);

/** Find set definition by an item's exact name */
export function findSetByItemName(name: string): ItemSetDef | undefined {
  return ALL_SETS.find((s) => s.pieces.some((p) => p.name === name));
}

/** Check if an item name belongs to any set */
export function isSetItem(name: string): boolean {
  return ALL_SETS.some((s) => s.pieces.some((p) => p.name === name));
}

/**
 * Given the names of all currently equipped items, calculate all active
 * partial and full set bonuses.
 */
export function calculateActiveSetBonuses(equippedNames: readonly string[]): SetBonus[] {
  const activeBonuses: SetBonus[] = [];

  for (const set of ALL_SETS) {
    let count = 0;
    for (const piece of set.pieces) {
      if (equippedNames.includes(piece.name)) {
        count++;
      }
    }

    if (count >= 2) {
      for (const bonus of set.bonuses) {
        if (count >= bonus.pieces) {
          activeBonuses.push(bonus);
        }
      }
    }
  }

  return activeBonuses;
}
