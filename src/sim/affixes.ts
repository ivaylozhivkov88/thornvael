import { Ik, ItemDef, Slot } from './items';

/**
 * Procedural Magic Affixes inspired by classic ARPG (MagicPrefix.txt, MagicSuffix.txt) & RoM2.
 * Includes mutual exclusion groups, tier eligibility windows [tierMin..tierMax],
 * weights (frequency), slot applicability, and balanced stat bonuses.
 */

export interface MagicAffix {
  readonly name: string;
  readonly kind: 'prefix' | 'suffix';
  readonly group: number; // Mutual exclusion group
  readonly tierMin: number; // 1..5
  readonly tierMax: number; // 1..5
  readonly weight: number; // Selection frequency
  readonly slots?: readonly number[]; // Allowed equipment slots (undefined = all gear)
  readonly min?: number; // Blow damage bonus min
  readonly max?: number; // Blow damage bonus max
  readonly acc?: number; // Hit accuracy bonus
  readonly def?: number; // Defense bonus
  readonly abs?: number; // Absorption bonus
  readonly hp?: number;  // Max HP bonus
  readonly mana?: number; // Max Mana bonus
  readonly pow?: number; // Spell power %
  readonly regen?: number; // HP regen
  readonly res?: readonly [number, number, number, number, number]; // Fire, Water, Air, Earth, Astral
  readonly attr?: readonly [number, number, number, number]; // Body, Agility, Mind, Spirit
}

export const MAGIC_PREFIXES: readonly MagicAffix[] = [
  // Group 1: Sharpness / Physical Damage (Weapons)
  { name: 'Jagged', kind: 'prefix', group: 1, tierMin: 1, tierMax: 2, weight: 10, slots: [Slot.Weapon], min: 1, max: 1 },
  { name: 'Serrated', kind: 'prefix', group: 1, tierMin: 2, tierMax: 3, weight: 8, slots: [Slot.Weapon], min: 2, max: 3, acc: 1 },
  { name: 'Keen', kind: 'prefix', group: 1, tierMin: 3, tierMax: 4, weight: 6, slots: [Slot.Weapon], min: 3, max: 5, acc: 2 },
  { name: 'Cruel', kind: 'prefix', group: 1, tierMin: 4, tierMax: 5, weight: 4, slots: [Slot.Weapon], min: 5, max: 8, acc: 3 },

  // Group 2: Fortitude / Armor & Defense (Armor, Shield, Helm, Boots)
  { name: 'Stout', kind: 'prefix', group: 2, tierMin: 1, tierMax: 2, weight: 10, slots: [Slot.Armor, Slot.Shield, Slot.Helm, Slot.Boots], def: 1, abs: 1 },
  { name: 'Hardened', kind: 'prefix', group: 2, tierMin: 2, tierMax: 3, weight: 8, slots: [Slot.Armor, Slot.Shield, Slot.Helm, Slot.Boots], def: 2, abs: 1 },
  { name: 'Tempered', kind: 'prefix', group: 2, tierMin: 3, tierMax: 4, weight: 6, slots: [Slot.Armor, Slot.Shield, Slot.Helm, Slot.Boots], def: 2, abs: 2 },
  { name: 'Indomitable', kind: 'prefix', group: 2, tierMin: 4, tierMax: 5, weight: 4, slots: [Slot.Armor, Slot.Shield, Slot.Helm, Slot.Boots], def: 3, abs: 3 },

  // Group 3: Elemental Fire
  { name: 'Glowing', kind: 'prefix', group: 3, tierMin: 1, tierMax: 2, weight: 7, res: [10, 0, 0, 0, 0], min: 1, max: 1 },
  { name: 'Fiery', kind: 'prefix', group: 3, tierMin: 2, tierMax: 4, weight: 5, res: [20, 0, 0, 0, 0], min: 2, max: 3 },
  { name: 'Volcanic', kind: 'prefix', group: 3, tierMin: 4, tierMax: 5, weight: 3, res: [30, 0, 0, 0, 0], min: 4, max: 6 },

  // Group 4: Elemental Water / Cold
  { name: 'Chilly', kind: 'prefix', group: 4, tierMin: 1, tierMax: 2, weight: 7, res: [0, 10, 0, 0, 0], def: 1 },
  { name: 'Glacial', kind: 'prefix', group: 4, tierMin: 3, tierMax: 5, weight: 4, res: [0, 25, 0, 0, 0], def: 2, abs: 1 },

  // Group 5: Elemental Air / Lightning
  { name: 'Breezy', kind: 'prefix', group: 5, tierMin: 1, tierMax: 2, weight: 7, res: [0, 0, 10, 0, 0], acc: 1 },
  { name: 'Storming', kind: 'prefix', group: 5, tierMin: 3, tierMax: 5, weight: 4, res: [0, 0, 25, 0, 0], acc: 2, min: 2, max: 3 },

  // Group 6: Elemental Earth
  { name: 'Earthen', kind: 'prefix', group: 6, tierMin: 1, tierMax: 2, weight: 7, res: [0, 0, 0, 10, 0], abs: 1 },
  { name: 'Granite', kind: 'prefix', group: 6, tierMin: 3, tierMax: 5, weight: 4, res: [0, 0, 0, 25, 0], abs: 2, def: 2 },

  // Group 7: Astral / Arcane Power (Staves, Helms, Rings, Amulets)
  { name: 'Glimmering', kind: 'prefix', group: 7, tierMin: 1, tierMax: 2, weight: 8, slots: [Slot.Weapon, Slot.Helm, Slot.Ring, Slot.Amulet], mana: 6, pow: 4 },
  { name: 'Luminescent', kind: 'prefix', group: 7, tierMin: 3, tierMax: 4, weight: 5, slots: [Slot.Weapon, Slot.Helm, Slot.Ring, Slot.Amulet], mana: 14, pow: 8 },
  { name: 'Celestial', kind: 'prefix', group: 7, tierMin: 4, tierMax: 5, weight: 3, slots: [Slot.Weapon, Slot.Helm, Slot.Ring, Slot.Amulet], mana: 24, pow: 14 },
];

export const MAGIC_SUFFIXES: readonly MagicAffix[] = [
  // Group 11: Slaughter / Extra Blow Damage
  { name: 'of Striking', kind: 'suffix', group: 11, tierMin: 1, tierMax: 2, weight: 10, slots: [Slot.Weapon, Slot.Ring, Slot.Amulet], min: 1, max: 2 },
  { name: 'of Carnage', kind: 'suffix', group: 11, tierMin: 2, tierMax: 3, weight: 8, slots: [Slot.Weapon, Slot.Ring, Slot.Amulet], min: 2, max: 4 },
  { name: 'of Slaughter', kind: 'suffix', group: 11, tierMin: 4, tierMax: 5, weight: 4, slots: [Slot.Weapon, Slot.Ring, Slot.Amulet], min: 4, max: 7 },

  // Group 12: Body & Extra HP (The Bear)
  { name: 'of the Ox', kind: 'suffix', group: 12, tierMin: 1, tierMax: 2, weight: 10, attr: [1, 0, 0, 0], hp: 10 },
  { name: 'of the Bear', kind: 'suffix', group: 12, tierMin: 2, tierMax: 4, weight: 7, attr: [2, 0, 0, 0], hp: 20 },
  { name: 'of the Behemoth', kind: 'suffix', group: 12, tierMin: 4, tierMax: 5, weight: 4, attr: [3, 0, 0, 0], hp: 35 },

  // Group 13: Agility & Accuracy (Grace)
  { name: 'of Dexterity', kind: 'suffix', group: 13, tierMin: 1, tierMax: 2, weight: 10, attr: [0, 1, 0, 0], acc: 1 },
  { name: 'of Grace', kind: 'suffix', group: 13, tierMin: 2, tierMax: 4, weight: 7, attr: [0, 2, 0, 0], acc: 2, def: 1 },
  { name: 'of Nirvana', kind: 'suffix', group: 13, tierMin: 4, tierMax: 5, weight: 4, attr: [0, 3, 0, 0], acc: 3, def: 2 },

  // Group 14: Mind & Mana (Wisdom)
  { name: 'of Thought', kind: 'suffix', group: 14, tierMin: 1, tierMax: 2, weight: 10, attr: [0, 0, 1, 0], mana: 8 },
  { name: 'of Wisdom', kind: 'suffix', group: 14, tierMin: 2, tierMax: 4, weight: 7, attr: [0, 0, 2, 0], mana: 16 },
  { name: 'of the Archmage', kind: 'suffix', group: 14, tierMin: 4, tierMax: 5, weight: 4, attr: [0, 0, 3, 0], mana: 28, pow: 6 },

  // Group 15: Spirit & Health Regen
  { name: 'of Health', kind: 'suffix', group: 15, tierMin: 1, tierMax: 2, weight: 8, hp: 15, regen: 1 },
  { name: 'of Regeneration', kind: 'suffix', group: 15, tierMin: 2, tierMax: 4, weight: 6, hp: 25, regen: 2 },
  { name: 'of Immortality', kind: 'suffix', group: 15, tierMin: 4, tierMax: 5, weight: 3, hp: 40, regen: 3 },

  // Group 16: All Resistances (Warding)
  { name: 'of Protection', kind: 'suffix', group: 16, tierMin: 1, tierMax: 2, weight: 8, res: [6, 6, 6, 6, 6] },
  { name: 'of Warding', kind: 'suffix', group: 16, tierMin: 2, tierMax: 4, weight: 6, res: [12, 12, 12, 12, 12] },
  { name: 'of the Aegis', kind: 'suffix', group: 16, tierMin: 4, tierMax: 5, weight: 3, res: [20, 20, 20, 20, 20] },
];

/** Select an eligible affix from a list given tier and gear slot using PRNG `rnd(n)`. */
export function rollAffix(
  affixes: readonly MagicAffix[],
  tier: number,
  slot: number,
  excludeGroup: number,
  rnd: (n: number) => number,
): MagicAffix | null {
  const candidates = affixes.filter(
    (a) =>
      a.group !== excludeGroup &&
      tier >= a.tierMin &&
      tier <= a.tierMax &&
      (!a.slots || a.slots.includes(slot)),
  );
  if (candidates.length === 0) return null;
  const totalWeight = candidates.reduce((sum, a) => sum + a.weight, 0);
  let roll = rnd(totalWeight);
  for (const c of candidates) {
    if (roll < c.weight) return c;
    roll -= c.weight;
  }
  return candidates[0];
}

/** Apply a prefix and/or suffix to an existing base gear item, returning an enriched ItemDef. */
export function applyAffixes(base: ItemDef, prefix?: MagicAffix | null, suffix?: MagicAffix | null): ItemDef {
  if (!prefix && !suffix) return base;
  if (base.kind !== Ik.Gear) return base;

  const pre = prefix ? `${prefix.name} ` : '';
  const suf = suffix ? ` ${suffix.name}` : '';
  const name = `${pre}${base.name}${suf}`;

  const res: [number, number, number, number, number] = [
    base.res[0] + (prefix?.res?.[0] ?? 0) + (suffix?.res?.[0] ?? 0),
    base.res[1] + (prefix?.res?.[1] ?? 0) + (suffix?.res?.[1] ?? 0),
    base.res[2] + (prefix?.res?.[2] ?? 0) + (suffix?.res?.[2] ?? 0),
    base.res[3] + (prefix?.res?.[3] ?? 0) + (suffix?.res?.[3] ?? 0),
    base.res[4] + (prefix?.res?.[4] ?? 0) + (suffix?.res?.[4] ?? 0),
  ];

  const attr: [number, number, number, number] = [
    base.attr[0] + (prefix?.attr?.[0] ?? 0) + (suffix?.attr?.[0] ?? 0),
    base.attr[1] + (prefix?.attr?.[1] ?? 0) + (suffix?.attr?.[1] ?? 0),
    base.attr[2] + (prefix?.attr?.[2] ?? 0) + (suffix?.attr?.[2] ?? 0),
    base.attr[3] + (prefix?.attr?.[3] ?? 0) + (suffix?.attr?.[3] ?? 0),
  ];

  return {
    ...base,
    name,
    min: base.min + (prefix?.min ?? 0) + (suffix?.min ?? 0),
    max: base.max + (prefix?.max ?? 0) + (suffix?.max ?? 0),
    acc: base.acc + (prefix?.acc ?? 0) + (suffix?.acc ?? 0),
    def: base.def + (prefix?.def ?? 0) + (suffix?.def ?? 0),
    abs: base.abs + (prefix?.abs ?? 0) + (suffix?.abs ?? 0),
    hp: base.hp + (prefix?.hp ?? 0) + (suffix?.hp ?? 0),
    mana: base.mana + (prefix?.mana ?? 0) + (suffix?.mana ?? 0),
    pow: base.pow + (prefix?.pow ?? 0) + (suffix?.pow ?? 0),
    grow: base.grow + (prefix?.regen ?? 0) + (suffix?.regen ?? 0), // Use grow slot or stats
    res,
    attr,
  };
}

export const RARE_PREFIX_WORDS = [
  'Shadow', 'Doom', 'Storm', 'Brimstone', 'Soul', 'Gale', 'Dusk', 'Viper',
  'Iron', 'Rune', 'Wraith', 'Death', 'Chaos', 'Blood', 'Dread', 'Grim',
  'Dire', 'Plague', 'Raven', 'Ghost', 'Stone', 'Bone', 'Blight', 'Cinder',
] as const;

export const RARE_SUFFIX_WORDS = [
  'Bite', 'Grasp', 'Song', 'Touch', 'Mark', 'Fang', 'Weaver', 'Brand',
  'Ward', 'Shroud', 'Spike', 'Harrow', 'Claw', 'Bane', 'Heart', 'Stalker',
  'Flange', 'Fist', 'Hew', 'Strike', 'Edge', 'Grip', 'Vow', 'Crown',
] as const;

export function applyAffixList(base: ItemDef, affixes: readonly MagicAffix[], customName?: string): ItemDef {
  let name = customName ?? base.name;
  const res: [number, number, number, number, number] = [...base.res];
  const attr: [number, number, number, number] = [...base.attr];
  let min = base.min;
  let max = base.max;
  let acc = base.acc;
  let def = base.def;
  let abs = base.abs;
  let hp = base.hp;
  let mana = base.mana;
  let pow = base.pow;
  let grow = base.grow;

  for (const a of affixes) {
    if (a.min) min += a.min;
    if (a.max) max += a.max;
    if (a.acc) acc += a.acc;
    if (a.def) def += a.def;
    if (a.abs) abs += a.abs;
    if (a.hp) hp += a.hp;
    if (a.mana) mana += a.mana;
    if (a.pow) pow += a.pow;
    if (a.regen) grow += a.regen;
    if (a.res) {
      for (let i = 0; i < 5; i++) res[i] += a.res[i] ?? 0;
    }
    if (a.attr) {
      for (let i = 0; i < 4; i++) attr[i] += a.attr[i] ?? 0;
    }
  }

  return {
    ...base,
    name,
    min,
    max,
    acc,
    def,
    abs,
    hp,
    mana,
    pow,
    grow,
    res,
    attr,
  };
}

export function rollRareItem(
  base: ItemDef,
  tier: number,
  rnd: (n: number) => number,
): ItemDef {
  if (base.kind !== Ik.Gear) return base;
  const preWord = RARE_PREFIX_WORDS[rnd(RARE_PREFIX_WORDS.length)];
  const sufWord = RARE_SUFFIX_WORDS[rnd(RARE_SUFFIX_WORDS.length)];
  const rareName = `${preWord} ${sufWord} ${base.name}`;

  const numPrefixes = rnd(100) < 50 ? 1 : 2;
  const numSuffixes = rnd(100) < 50 ? 1 : 2;

  const chosenAffixes: MagicAffix[] = [];
  const usedGroups = new Set<number>();

  for (let i = 0; i < numPrefixes; i++) {
    const candidates = MAGIC_PREFIXES.filter(
      (a) => !usedGroups.has(a.group) && tier >= a.tierMin && tier <= a.tierMax && (!a.slots || a.slots.includes(base.slot)),
    );
    if (candidates.length > 0) {
      const a = rollAffix(candidates, tier, base.slot, 0, rnd);
      if (a) {
        chosenAffixes.push(a);
        usedGroups.add(a.group);
      }
    }
  }

  for (let i = 0; i < numSuffixes; i++) {
    const candidates = MAGIC_SUFFIXES.filter(
      (a) => !usedGroups.has(a.group) && tier >= a.tierMin && tier <= a.tierMax && (!a.slots || a.slots.includes(base.slot)),
    );
    if (candidates.length > 0) {
      const a = rollAffix(candidates, tier, base.slot, 0, rnd);
      if (a) {
        chosenAffixes.push(a);
        usedGroups.add(a.group);
      }
    }
  }

  const def = applyAffixList(base, chosenAffixes, rareName);
  return { ...def, rarity: 'rare' };
}

/** Roll a randomized magic gear item for a given base item and tier. */
export function rollMagicItem(
  base: ItemDef,
  tier: number,
  rnd: (n: number) => number,
  mode?: 'magic' | 'rare',
): ItemDef {
  if (mode === 'rare') return rollRareItem(base, tier, rnd);
  if (base.kind !== Ik.Gear) return base;
  let p: MagicAffix | null = null;
  let s: MagicAffix | null = null;

  if (mode === 'magic') {
    // Magic: prefix OR suffix
    const pickPrefix = rnd(100) < 50;
    if (pickPrefix) {
      p = rollAffix(MAGIC_PREFIXES, tier, base.slot, 0, rnd);
    } else {
      s = rollAffix(MAGIC_SUFFIXES, tier, base.slot, 0, rnd);
    }
  } else {
    const rollKind = rnd(100);
    // 40% prefix only, 40% suffix only, 20% both prefix + suffix
    if (rollKind < 40) {
      p = rollAffix(MAGIC_PREFIXES, tier, base.slot, 0, rnd);
    } else if (rollKind < 80) {
      s = rollAffix(MAGIC_SUFFIXES, tier, base.slot, 0, rnd);
    } else {
      p = rollAffix(MAGIC_PREFIXES, tier, base.slot, 0, rnd);
      s = rollAffix(MAGIC_SUFFIXES, tier, base.slot, p ? p.group : 0, rnd);
    }
  }
  const def = applyAffixes(base, p, s);
  return { ...def, rarity: 'magic' };
}

/** 18 Original Unique Artifact items inspired by classic ARPG & RoM2 classics. */
export const UNIQUE_ARTIFACTS: readonly ItemDef[] = [
  {
    name: "Sovereign's Gilded Crest", kind: Ik.Gear, slot: Slot.Helm, tier: 5, w: 3, cls: 3, need: 2, needv: 15,
    min: 0, max: 0, acc: 0, cover: 1, def: 3, abs: 4, hp: 45, mana: 45, pow: 15, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [10, 10, 10, 10, 10], attr: [2, 2, 2, 2], sockets: 2,
  },
  {
    name: 'Bastion of the Sunlit Oath', kind: Ik.Gear, slot: Slot.Shield, tier: 5, w: 14, cls: 1, need: 0, needv: 17,
    min: 0, max: 0, acc: 2, cover: 7, def: 5, abs: 5, hp: 50, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [35, 10, 10, 10, 20], attr: [2, 0, 0, 1], sockets: 1,
  },
  {
    name: 'Signet of the Astral Well', kind: Ik.Gear, slot: Slot.Ring, tier: 4, w: 0, cls: 3, need: 3, needv: 12,
    min: 0, max: 0, acc: 0, cover: 0, def: 0, abs: 0, hp: 0, mana: 50, pow: 12, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0, 0, 0, 0, 20], attr: [0, 0, 1, 1],
  },
  {
    name: 'Zephyr-Bough of the Tempest', kind: Ik.Gear, slot: Slot.Weapon, tier: 5, w: 4, cls: 3, need: 1, needv: 18,
    min: 12, max: 18, acc: 6, cover: 0, def: 0, abs: 0, hp: 0, mana: 0, pow: 10, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0, 0, 30, 0, 0], attr: [0, 3, 0, 0], sockets: 1,
  },
  {
    name: "Cinder-Weaver's Wraps", kind: Ik.Gear, slot: Slot.Gloves, tier: 3, w: 0, cls: 2, need: 2, needv: 9,
    min: 0, max: 0, acc: 0, cover: 4, def: 1, abs: 1, hp: 0, mana: 20, pow: 15, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [25, 0, 0, 0, 0], attr: [0, 0, 1, 0],
  },
  {
    name: 'Colossus of the Fallen Dynasty', kind: Ik.Gear, slot: Slot.Weapon, tier: 5, w: 12, cls: 1, need: 0, needv: 18,
    min: 16, max: 24, acc: 3, cover: 0, def: 2, abs: 0, hp: 40, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0, 0, 0, 15, 0], attr: [3, 0, 0, 0], sockets: 2,
  },
  {
    name: 'Cowl of the Pale Stalker', kind: Ik.Gear, slot: Slot.Helm, tier: 4, w: 2, cls: 3, need: 1, needv: 14,
    min: 0, max: 0, acc: 4, cover: 1, def: 3, abs: 3, hp: 20, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0, 0, 0, 15, 0], attr: [0, 2, 0, 0],
  },
  {
    name: 'Mantle of the Storm-Caller', kind: Ik.Gear, slot: Slot.Armor, tier: 5, w: 4, cls: 2, need: 2, needv: 16,
    min: 0, max: 0, acc: 0, cover: 6, def: 2, abs: 3, hp: 0, mana: 35, pow: 18, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0, 0, 30, 0, 10], attr: [0, 0, 2, 1], sockets: 1,
  },
  {
    name: "Dune-Strider's Treads", kind: Ik.Gear, slot: Slot.Boots, tier: 4, w: 3, cls: 3, need: 1, needv: 13,
    min: 0, max: 0, acc: 0, cover: 8, def: 2, abs: 3, hp: 20, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [25, 0, 0, 25, 0], attr: [0, 2, 0, 0],
  },
  {
    name: 'Glacial Shard of the First Frost', kind: Ik.Gear, slot: Slot.Weapon, tier: 4, w: 2, cls: 2, need: 2, needv: 14,
    min: 2, max: 4, acc: 1, cover: 0, def: 1, abs: 0, hp: 0, mana: 25, pow: 22, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0, 35, 0, 0, 0], attr: [0, 0, 2, 0], sockets: 1,
  },
  {
    name: 'Caduceus of the Dawn-Bearer', kind: Ik.Gear, slot: Slot.Weapon, tier: 5, w: 5, cls: 2, need: 2, needv: 18,
    min: 3, max: 6, acc: 2, cover: 0, def: 1, abs: 1, hp: 30, mana: 45, pow: 35, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [20, 20, 20, 20, 20], attr: [0, 0, 3, 2], sockets: 2,
  },
  {
    name: 'Talisman of the Prismatic Loom', kind: Ik.Gear, slot: Slot.Amulet, tier: 5, w: 1, cls: 3, need: 3, needv: 15,
    min: 0, max: 0, acc: 0, cover: 0, def: 0, abs: 0, hp: 30, mana: 30, pow: 10, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [18, 18, 18, 18, 18], attr: [1, 1, 1, 1],
  },
  {
    name: 'Crown of the Primordial Ages', kind: Ik.Gear, slot: Slot.Helm, tier: 5, w: 6, cls: 1, need: 0, needv: 17,
    min: 0, max: 0, acc: 1, cover: 1, def: 4, abs: 6, hp: 40, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [15, 15, 15, 15, 15], attr: [2, 0, 2, 0], sockets: 2,
  },
  {
    name: "Blood-Drinker's Crescent", kind: Ik.Gear, slot: Slot.Weapon, tier: 4, w: 8, cls: 1, need: 0, needv: 15,
    min: 11, max: 18, acc: 2, cover: 0, def: 0, abs: 0, hp: 25, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0, 0, 0, 0, 0], attr: [2, 0, 0, 0], sockets: 1,
  },
  {
    name: 'Hammer of the Earth-Breaker', kind: Ik.Gear, slot: Slot.Weapon, tier: 5, w: 14, cls: 1, need: 0, needv: 18,
    min: 14, max: 24, acc: 2, cover: 0, def: 0, abs: 2, hp: 0, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0, 0, 0, 30, 0], attr: [4, 0, 0, 0], sockets: 2,
  },
  {
    name: 'Aegis of the Sunken Citadel', kind: Ik.Gear, slot: Slot.Shield, tier: 4, w: 12, cls: 1, need: 0, needv: 14,
    min: 0, max: 0, acc: 0, cover: 7, def: 4, abs: 4, hp: 30, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0, 20, 0, 20, 0], attr: [1, 0, 0, 1], sockets: 1,
  },
  {
    name: 'Boots of the Shadow-Dancer', kind: Ik.Gear, slot: Slot.Boots, tier: 5, w: 3, cls: 3, need: 1, needv: 16,
    min: 0, max: 0, acc: 2, cover: 8, def: 3, abs: 4, hp: 25, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [10, 10, 10, 10, 10], attr: [0, 3, 0, 0],
  },
  {
    name: 'Girdle of Giants', kind: Ik.Gear, slot: Slot.Armor, tier: 4, w: 16, cls: 1, need: 0, needv: 15,
    min: 0, max: 0, acc: 0, cover: 6, def: 3, abs: 5, hp: 50, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0, 0, 0, 0, 0], attr: [4, 0, 0, 0], sockets: 1,
  },

  {
    name: 'Cleaver of the Bog Troll', kind: Ik.Gear, slot: Slot.Weapon, tier: 2, w: 9, cls: 1, need: 0, needv: 9,
    min: 6, max: 11, acc: -2, cover: 0, def: 0, abs: 0, hp: 15, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,0,0,0], attr: [1,-1,0,0], sockets: 1,
  },
  {
    name: 'Pyre-Branch of the Ash-Witch', kind: Ik.Gear, slot: Slot.Weapon, tier: 2, w: 3, cls: 2, need: 2, needv: 8,
    min: 1, max: 2, acc: 0, cover: 0, def: 0, abs: 0, hp: 0, mana: 16, pow: 22, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [30,-25,0,0,0], attr: [0,0,1,0], sockets: 1,
  },
  {
    name: 'Hood of the Raven Scout', kind: Ik.Gear, slot: Slot.Helm, tier: 2, w: 1, cls: 3, need: 1, needv: 6,
    min: 0, max: 0, acc: 2, cover: 1, def: 2, abs: 0, hp: 10, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,15,0,0], attr: [0,1,0,1],
  },
  {
    name: 'Band of the Frugal Hermit', kind: Ik.Gear, slot: Slot.Ring, tier: 2, w: 0, cls: 3, need: 3, needv: 5,
    min: 0, max: 0, acc: 0, cover: 0, def: 0, abs: 0, hp: 20, mana: 15, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [5,5,5,5,5], attr: [0,0,0,2],
  },
  {
    name: 'Spiked Targe of Redmarsh', kind: Ik.Gear, slot: Slot.Shield, tier: 3, w: 5, cls: 1, need: 0, needv: 10,
    min: 2, max: 4, acc: 2, cover: 6, def: 2, abs: 2, hp: 15, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,0,20,0], attr: [0,1,0,0], sockets: 1,
  },
  {
    name: 'Juggernaut\'s Ribcage', kind: Ik.Gear, slot: Slot.Armor, tier: 3, w: 18, cls: 1, need: 0, needv: 12,
    min: 0, max: 0, acc: 0, cover: 6, def: 2, abs: 6, hp: 35, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,0,15,-10], attr: [2,-2,0,0], sockets: 1,
  },
  {
    name: 'Brawler\'s Ironknuckles', kind: Ik.Gear, slot: Slot.Gloves, tier: 3, w: 3, cls: 1, need: 0, needv: 10,
    min: 2, max: 4, acc: 2, cover: 4, def: 1, abs: 2, hp: 20, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,0,10,0], attr: [1,1,0,0],
  },
  {
    name: 'Mirror of the Astral Veil', kind: Ik.Gear, slot: Slot.Shield, tier: 3, w: 3, cls: 2, need: 2, needv: 11,
    min: 0, max: 0, acc: 0, cover: 6, def: 3, abs: 0, hp: 0, mana: 25, pow: 14, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [10,10,10,10,25], attr: [0,0,1,1], sockets: 1,
  },
  {
    name: 'Whispering Dirk of the Fen-Strider', kind: Ik.Gear, slot: Slot.Weapon, tier: 3, w: 2, cls: 3, need: 1, needv: 11,
    min: 6, max: 8, acc: 5, cover: 0, def: 2, abs: 0, hp: 0, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,0,20,0], attr: [0,2,0,0], sockets: 1,
  },
  {
    name: 'Amulet of the Blood Altar', kind: Ik.Gear, slot: Slot.Amulet, tier: 3, w: 1, cls: 3, need: 0, needv: 9,
    min: 2, max: 3, acc: 2, cover: 0, def: 0, abs: 0, hp: 60, mana: -25, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [15,0,0,0,-15], attr: [2,0,-1,0],
  },
  {
    name: 'Visor of the Ashen Vanguard', kind: Ik.Gear, slot: Slot.Helm, tier: 4, w: 5, cls: 1, need: 0, needv: 13,
    min: 0, max: 0, acc: 2, cover: 1, def: 3, abs: 4, hp: 25, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [30,-10,0,10,0], attr: [1,0,-1,0], sockets: 1,
  },
  {
    name: 'Tower of the Iron Line', kind: Ik.Gear, slot: Slot.Shield, tier: 4, w: 16, cls: 1, need: 0, needv: 15,
    min: 0, max: 0, acc: 0, cover: 7, def: 4, abs: 4, hp: 45, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,0,20,0], attr: [2,-2,0,0], sockets: 1,
  },
  {
    name: 'Greaves of the Mountain Ram', kind: Ik.Gear, slot: Slot.Boots, tier: 4, w: 6, cls: 1, need: 0, needv: 13,
    min: 2, max: 3, acc: 1, cover: 8, def: 2, abs: 4, hp: 25, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,0,25,0], attr: [1,0,0,0],
  },
  {
    name: 'Band of the Bloodbound Berserker', kind: Ik.Gear, slot: Slot.Ring, tier: 4, w: 0, cls: 1, need: 0, needv: 13,
    min: 4, max: 6, acc: 2, cover: 0, def: 0, abs: 0, hp: 40, mana: -40, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,0,0,-20], attr: [3,1,-2,-2],
  },
  {
    name: 'Diadem of the Tempest Eye', kind: Ik.Gear, slot: Slot.Helm, tier: 4, w: 1, cls: 2, need: 2, needv: 14,
    min: 0, max: 0, acc: 0, cover: 1, def: 1, abs: 0, hp: 0, mana: 30, pow: 18, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,40,-20,10], attr: [0,1,2,0], sockets: 1,
  },
  {
    name: 'Shroud of the Glacial Hermit', kind: Ik.Gear, slot: Slot.Armor, tier: 4, w: 4, cls: 2, need: 2, needv: 14,
    min: 0, max: 0, acc: 0, cover: 6, def: 1, abs: 4, hp: 30, mana: 24, pow: 12, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [-25,45,0,15,0], attr: [1,-1,2,0], sockets: 1,
  },
  {
    name: 'Spellslinger\'s Silk Cuffs', kind: Ik.Gear, slot: Slot.Gloves, tier: 4, w: 0, cls: 2, need: 2, needv: 13,
    min: 0, max: 0, acc: 3, cover: 4, def: 0, abs: 0, hp: 0, mana: 22, pow: 18, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,0,0,15], attr: [0,1,2,0],
  },
  {
    name: 'Spark-Catcher\'s Pendant', kind: Ik.Gear, slot: Slot.Amulet, tier: 4, w: 1, cls: 2, need: 2, needv: 13,
    min: 0, max: 0, acc: 0, cover: 0, def: 0, abs: 0, hp: 0, mana: 28, pow: 15, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,40,-15,10], attr: [0,0,2,1],
  },
  {
    name: 'Eye of the Obsidian Wyrm', kind: Ik.Gear, slot: Slot.Amulet, tier: 4, w: 1, cls: 2, need: 2, needv: 14,
    min: 0, max: 0, acc: 0, cover: 0, def: 0, abs: 0, hp: 25, mana: 25, pow: 16, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [30,-20,0,30,0], attr: [0,0,2,1],
  },
  {
    name: 'Jerkin of the Weeping Willow', kind: Ik.Gear, slot: Slot.Armor, tier: 4, w: 5, cls: 3, need: 1, needv: 13,
    min: 0, max: 0, acc: 0, cover: 6, def: 3, abs: 3, hp: 30, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,25,0,20,0], attr: [0,2,0,2], sockets: 1,
  },
  {
    name: 'Grips of the Zephyr Archer', kind: Ik.Gear, slot: Slot.Gloves, tier: 4, w: 1, cls: 3, need: 1, needv: 13,
    min: 2, max: 3, acc: 5, cover: 4, def: 2, abs: 2, hp: 15, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,30,0,0], attr: [0,2,0,0],
  },
  {
    name: 'Obsidian Doom-Maul', kind: Ik.Gear, slot: Slot.Weapon, tier: 5, w: 17, cls: 1, need: 0, needv: 18,
    min: 18, max: 28, acc: -1, cover: 0, def: 0, abs: 2, hp: 40, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [25,-20,0,20,0], attr: [4,-2,0,0], sockets: 2,
  },
  {
    name: 'Bulwark of the Unbroken Realm', kind: Ik.Gear, slot: Slot.Armor, tier: 5, w: 30, cls: 1, need: 0, needv: 19,
    min: 0, max: 0, acc: 0, cover: 15, def: 4, abs: 8, hp: 75, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [15,15,15,25,0], attr: [4,-2,0,1], sockets: 2,
  },
  {
    name: 'Gauntlets of the Stone Colossus', kind: Ik.Gear, slot: Slot.Gloves, tier: 5, w: 7, cls: 1, need: 0, needv: 17,
    min: 3, max: 6, acc: -1, cover: 4, def: 2, abs: 6, hp: 35, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,0,35,0], attr: [3,-1,0,0], sockets: 1,
  },
  {
    name: 'Heart of the Ironhide Warlord', kind: Ik.Gear, slot: Slot.Amulet, tier: 5, w: 2, cls: 1, need: 0, needv: 17,
    min: 0, max: 0, acc: 0, cover: 0, def: 3, abs: 4, hp: 55, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [20,0,0,30,0], attr: [3,0,0,1],
  },
  {
    name: 'Scepter of the Howling Void', kind: Ik.Gear, slot: Slot.Weapon, tier: 5, w: 2, cls: 2, need: 2, needv: 17,
    min: 2, max: 4, acc: 1, cover: 0, def: 0, abs: 0, hp: -30, mana: 45, pow: 45, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [-10,-10,-10,-10,50], attr: [-1,0,4,1], sockets: 2,
  },
  {
    name: 'Signet of the Astral Singularity', kind: Ik.Gear, slot: Slot.Ring, tier: 5, w: 0, cls: 2, need: 2, needv: 16,
    min: 0, max: 0, acc: 0, cover: 0, def: 0, abs: 0, hp: -30, mana: 60, pow: 20, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,0,0,0,35], attr: [-1,0,3,2],
  },
  {
    name: 'Slippers of the Spring Rain', kind: Ik.Gear, slot: Slot.Boots, tier: 5, w: 1, cls: 2, need: 2, needv: 15,
    min: 0, max: 0, acc: 0, cover: 8, def: 2, abs: 1, hp: 20, mana: 40, pow: 12, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [0,35,0,15,10], attr: [0,1,3,2],
  },
  {
    name: 'Ghost-Strider\'s Treads', kind: Ik.Gear, slot: Slot.Boots, tier: 5, w: 1, cls: 3, need: 1, needv: 17,
    min: 0, max: 0, acc: 3, cover: 8, def: 4, abs: 1, hp: 25, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [12,12,12,12,25], attr: [0,4,0,0],
  },
  {
    name: 'Loop of the Prismatic Spiral', kind: Ik.Gear, slot: Slot.Ring, tier: 5, w: 0, cls: 3, need: 3, needv: 15,
    min: 0, max: 0, acc: 0, cover: 0, def: 0, abs: 0, hp: 25, mana: 25, pow: 8, heal: 0, restore: 0, grow: 0, spell: -1,
    res: [18,18,18,18,18], attr: [1,1,1,1],
  },
];
