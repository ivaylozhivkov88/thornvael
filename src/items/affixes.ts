import { Ik, type ItemDef, Slot } from '../sim/item-types';
import type { Rng } from '../sim/rng';
import type { AffixRollRecord, AffixSpec, StatRange } from './types';

const r = (min: number, max: number): StatRange => ({ min, max });

export const PREFIX_POOL: readonly AffixSpec[] = [
  // Group 1: Physical Damage (Weapon)
  { id: 'pre_jagged', name: 'Jagged', kind: 'prefix', group: 1, ilvlMin: 1, ilvlMax: 14, tierMin: 1, tierMax: 2, weight: 10, slots: [Slot.Weapon], minDmg: r(1, 2), maxDmg: r(1, 2) },
  { id: 'pre_serrated', name: 'Serrated', kind: 'prefix', group: 1, ilvlMin: 11, ilvlMax: 26, tierMin: 2, tierMax: 3, weight: 8, slots: [Slot.Weapon], minDmg: r(2, 4), maxDmg: r(3, 5), acc: r(1, 1) },
  { id: 'pre_keen', name: 'Keen', kind: 'prefix', group: 1, ilvlMin: 21, ilvlMax: 38, tierMin: 3, tierMax: 4, weight: 6, slots: [Slot.Weapon], minDmg: r(3, 6), maxDmg: r(5, 8), acc: r(2, 2) },
  { id: 'pre_cruel', name: 'Cruel', kind: 'prefix', group: 1, ilvlMin: 31, ilvlMax: 50, tierMin: 4, tierMax: 5, weight: 4, slots: [Slot.Weapon], minDmg: r(5, 9), maxDmg: r(8, 13), acc: r(3, 3) },

  // Group 2: Defense & Absorption
  { id: 'pre_stout', name: 'Stout', kind: 'prefix', group: 2, ilvlMin: 1, ilvlMax: 14, tierMin: 1, tierMax: 2, weight: 10, slots: [Slot.Armor, Slot.Shield, Slot.Helm, Slot.Boots, Slot.Gloves], def: r(1, 2), abs: r(1, 1) },
  { id: 'pre_hardened', name: 'Hardened', kind: 'prefix', group: 2, ilvlMin: 11, ilvlMax: 26, tierMin: 2, tierMax: 3, weight: 8, slots: [Slot.Armor, Slot.Shield, Slot.Helm, Slot.Boots, Slot.Gloves], def: r(2, 3), abs: r(1, 2) },
  { id: 'pre_tempered', name: 'Tempered', kind: 'prefix', group: 2, ilvlMin: 21, ilvlMax: 38, tierMin: 3, tierMax: 4, weight: 6, slots: [Slot.Armor, Slot.Shield, Slot.Helm, Slot.Boots, Slot.Gloves], def: r(2, 4), abs: r(2, 3) },
  { id: 'pre_indomitable', name: 'Indomitable', kind: 'prefix', group: 2, ilvlMin: 31, ilvlMax: 50, tierMin: 4, tierMax: 5, weight: 4, slots: [Slot.Armor, Slot.Shield, Slot.Helm, Slot.Boots, Slot.Gloves], def: r(3, 6), abs: r(3, 5) },

  // Group 3: Fire
  { id: 'pre_glowing', name: 'Glowing', kind: 'prefix', group: 3, ilvlMin: 1, ilvlMax: 16, tierMin: 1, tierMax: 2, weight: 7, fireRes: r(8, 12), minDmg: r(1, 1), maxDmg: r(1, 1) },
  { id: 'pre_fiery', name: 'Fiery', kind: 'prefix', group: 3, ilvlMin: 15, ilvlMax: 36, tierMin: 2, tierMax: 4, weight: 5, fireRes: r(16, 24), minDmg: r(2, 3), maxDmg: r(3, 4) },
  { id: 'pre_volcanic', name: 'Volcanic', kind: 'prefix', group: 3, ilvlMin: 32, ilvlMax: 50, tierMin: 4, tierMax: 5, weight: 3, fireRes: r(25, 35), minDmg: r(4, 5), maxDmg: r(6, 8) },

  // Group 4: Water / Cold
  { id: 'pre_chilly', name: 'Chilly', kind: 'prefix', group: 4, ilvlMin: 1, ilvlMax: 16, tierMin: 1, tierMax: 2, weight: 7, waterRes: r(8, 12), def: r(1, 1) },
  { id: 'pre_glacial', name: 'Glacial', kind: 'prefix', group: 4, ilvlMin: 22, ilvlMax: 50, tierMin: 3, tierMax: 5, weight: 4, waterRes: r(20, 30), def: r(2, 3), abs: r(1, 1) },

  // Group 5: Air / Lightning
  { id: 'pre_breezy', name: 'Breezy', kind: 'prefix', group: 5, ilvlMin: 1, ilvlMax: 16, tierMin: 1, tierMax: 2, weight: 7, airRes: r(8, 12), acc: r(1, 1) },
  { id: 'pre_storming', name: 'Storming', kind: 'prefix', group: 5, ilvlMin: 22, ilvlMax: 50, tierMin: 3, tierMax: 5, weight: 4, airRes: r(20, 30), acc: r(2, 3), minDmg: r(2, 2), maxDmg: r(3, 4) },

  // Group 6: Earth
  { id: 'pre_earthen', name: 'Earthen', kind: 'prefix', group: 6, ilvlMin: 1, ilvlMax: 16, tierMin: 1, tierMax: 2, weight: 7, earthRes: r(8, 12), abs: r(1, 1) },
  { id: 'pre_granite', name: 'Granite', kind: 'prefix', group: 6, ilvlMin: 22, ilvlMax: 50, tierMin: 3, tierMax: 5, weight: 4, earthRes: r(20, 30), abs: r(2, 3), def: r(2, 2) },

  // Group 7: Astral / Spell Power
  { id: 'pre_glimmering', name: 'Glimmering', kind: 'prefix', group: 7, ilvlMin: 1, ilvlMax: 18, tierMin: 1, tierMax: 2, weight: 8, slots: [Slot.Weapon, Slot.Helm, Slot.Ring, Slot.Amulet], mana: r(5, 10), pow: r(4, 6) },
  { id: 'pre_luminescent', name: 'Luminescent', kind: 'prefix', group: 7, ilvlMin: 19, ilvlMax: 38, tierMin: 3, tierMax: 4, weight: 5, slots: [Slot.Weapon, Slot.Helm, Slot.Ring, Slot.Amulet], mana: r(12, 20), pow: r(8, 12) },
  { id: 'pre_celestial', name: 'Celestial', kind: 'prefix', group: 7, ilvlMin: 34, ilvlMax: 50, tierMin: 4, tierMax: 5, weight: 3, slots: [Slot.Weapon, Slot.Helm, Slot.Ring, Slot.Amulet], mana: r(22, 34), pow: r(14, 20) },

  // Group 8: Magic Find
  { id: 'pre_lucky', name: 'Lucky', kind: 'prefix', group: 8, ilvlMin: 5, ilvlMax: 25, tierMin: 1, tierMax: 3, weight: 5, slots: [Slot.Helm, Slot.Boots, Slot.Gloves, Slot.Ring, Slot.Amulet], mf: r(8, 15) },
  { id: 'pre_fortunate', name: 'Fortunate', kind: 'prefix', group: 8, ilvlMin: 26, ilvlMax: 50, tierMin: 3, tierMax: 5, weight: 3, slots: [Slot.Helm, Slot.Boots, Slot.Gloves, Slot.Ring, Slot.Amulet], mf: r(16, 28) },
];

export const SUFFIX_POOL: readonly AffixSpec[] = [
  // Group 11: Slaughter / Extra Blow Damage
  { id: 'suf_striking', name: 'of Striking', kind: 'suffix', group: 11, ilvlMin: 1, ilvlMax: 16, tierMin: 1, tierMax: 2, weight: 10, slots: [Slot.Weapon, Slot.Gloves, Slot.Ring, Slot.Amulet], minDmg: r(1, 2), maxDmg: r(2, 3) },
  { id: 'suf_carnage', name: 'of Carnage', kind: 'suffix', group: 11, ilvlMin: 14, ilvlMax: 32, tierMin: 2, tierMax: 3, weight: 8, slots: [Slot.Weapon, Slot.Gloves, Slot.Ring, Slot.Amulet], minDmg: r(2, 3), maxDmg: r(4, 6) },
  { id: 'suf_slaughter', name: 'of Slaughter', kind: 'suffix', group: 11, ilvlMin: 31, ilvlMax: 50, tierMin: 4, tierMax: 5, weight: 4, slots: [Slot.Weapon, Slot.Gloves, Slot.Ring, Slot.Amulet], minDmg: r(4, 6), maxDmg: r(7, 10) },

  // Group 12: Body & HP
  { id: 'suf_ox', name: 'of the Ox', kind: 'suffix', group: 12, ilvlMin: 1, ilvlMax: 16, tierMin: 1, tierMax: 2, weight: 10, body: r(1, 2), hp: r(8, 14) },
  { id: 'suf_bear', name: 'of the Bear', kind: 'suffix', group: 12, ilvlMin: 15, ilvlMax: 36, tierMin: 2, tierMax: 4, weight: 7, body: r(2, 3), hp: r(18, 28) },
  { id: 'suf_behemoth', name: 'of the Behemoth', kind: 'suffix', group: 12, ilvlMin: 33, ilvlMax: 50, tierMin: 4, tierMax: 5, weight: 4, body: r(3, 5), hp: r(32, 48) },

  // Group 13: Agility & Accuracy
  { id: 'suf_dexterity', name: 'of Dexterity', kind: 'suffix', group: 13, ilvlMin: 1, ilvlMax: 16, tierMin: 1, tierMax: 2, weight: 10, agility: r(1, 2), acc: r(1, 1) },
  { id: 'suf_grace', name: 'of Grace', kind: 'suffix', group: 13, ilvlMin: 15, ilvlMax: 36, tierMin: 2, tierMax: 4, weight: 7, agility: r(2, 3), acc: r(2, 2), def: r(1, 1) },
  { id: 'suf_nirvana', name: 'of Nirvana', kind: 'suffix', group: 13, ilvlMin: 33, ilvlMax: 50, tierMin: 4, tierMax: 5, weight: 4, agility: r(3, 5), acc: r(3, 4), def: r(2, 2) },

  // Group 14: Mind & Mana
  { id: 'suf_thought', name: 'of Thought', kind: 'suffix', group: 14, ilvlMin: 1, ilvlMax: 16, tierMin: 1, tierMax: 2, weight: 10, slots: [Slot.Weapon, Slot.Helm, Slot.Ring, Slot.Amulet], mind: r(1, 2), mana: r(6, 12) },
  { id: 'suf_wisdom', name: 'of Wisdom', kind: 'suffix', group: 14, ilvlMin: 15, ilvlMax: 36, tierMin: 2, tierMax: 4, weight: 7, slots: [Slot.Weapon, Slot.Helm, Slot.Ring, Slot.Amulet], mind: r(2, 3), mana: r(14, 24) },
  { id: 'suf_archmage', name: 'of the Archmage', kind: 'suffix', group: 14, ilvlMin: 33, ilvlMax: 50, tierMin: 4, tierMax: 5, weight: 4, slots: [Slot.Weapon, Slot.Helm, Slot.Ring, Slot.Amulet], mind: r(3, 5), mana: r(26, 40), pow: r(6, 10) },

  // Group 15: HP & Regen
  { id: 'suf_health', name: 'of Health', kind: 'suffix', group: 15, ilvlMin: 1, ilvlMax: 16, tierMin: 1, tierMax: 2, weight: 8, slots: [Slot.Armor, Slot.Shield, Slot.Helm, Slot.Ring, Slot.Amulet], hp: r(12, 20), regen: r(1, 1) },
  { id: 'suf_regeneration', name: 'of Regeneration', kind: 'suffix', group: 15, ilvlMin: 15, ilvlMax: 36, tierMin: 2, tierMax: 4, weight: 6, slots: [Slot.Armor, Slot.Shield, Slot.Helm, Slot.Ring, Slot.Amulet], hp: r(22, 34), regen: r(2, 2) },
  { id: 'suf_immortality', name: 'of Immortality', kind: 'suffix', group: 15, ilvlMin: 33, ilvlMax: 50, tierMin: 4, tierMax: 5, weight: 3, slots: [Slot.Armor, Slot.Shield, Slot.Helm, Slot.Ring, Slot.Amulet], hp: r(38, 55), regen: r(3, 4) },

  // Group 16: All Resistances
  { id: 'suf_protection', name: 'of Protection', kind: 'suffix', group: 16, ilvlMin: 1, ilvlMax: 16, tierMin: 1, tierMax: 2, weight: 8, allRes: r(5, 8) },
  { id: 'suf_warding', name: 'of Warding', kind: 'suffix', group: 16, ilvlMin: 15, ilvlMax: 36, tierMin: 2, tierMax: 4, weight: 6, allRes: r(10, 15) },
  { id: 'suf_aegis', name: 'of the Aegis', kind: 'suffix', group: 16, ilvlMin: 33, ilvlMax: 50, tierMin: 4, tierMax: 5, weight: 3, allRes: r(18, 25) },

  // Group 17: Attack Speed
  { id: 'suf_alacrity', name: 'of Alacrity', kind: 'suffix', group: 17, ilvlMin: 10, ilvlMax: 35, tierMin: 2, tierMax: 4, weight: 6, slots: [Slot.Weapon, Slot.Gloves], ias: r(10, 15) },
  { id: 'suf_quickness', name: 'of Quickness', kind: 'suffix', group: 17, ilvlMin: 28, ilvlMax: 50, tierMin: 4, tierMax: 5, weight: 3, slots: [Slot.Weapon, Slot.Gloves], ias: r(18, 25) },

  // Group 18: Cast Speed
  { id: 'suf_apprentice', name: 'of the Apprentice', kind: 'suffix', group: 18, ilvlMin: 10, ilvlMax: 35, tierMin: 2, tierMax: 4, weight: 6, slots: [Slot.Weapon, Slot.Ring, Slot.Amulet], fcr: r(10, 15) },
  { id: 'suf_magus', name: 'of the Magus', kind: 'suffix', group: 18, ilvlMin: 28, ilvlMax: 50, tierMin: 4, tierMax: 5, weight: 3, slots: [Slot.Weapon, Slot.Ring, Slot.Amulet], fcr: r(18, 25) },

  // Group 19: Life Steal
  { id: 'suf_leech', name: 'of the Leech', kind: 'suffix', group: 19, ilvlMin: 12, ilvlMax: 50, tierMin: 2, tierMax: 5, weight: 4, slots: [Slot.Weapon, Slot.Gloves, Slot.Ring], lifesteal: r(3, 7) },

  // Group 20: Critical Strike
  { id: 'suf_precision', name: 'of Precision', kind: 'suffix', group: 20, ilvlMin: 15, ilvlMax: 50, tierMin: 2, tierMax: 5, weight: 4, slots: [Slot.Weapon, Slot.Gloves, Slot.Ring, Slot.Amulet], crit: r(4, 10) },
];

export const RARE_FIRST_WORDS = [
  'Shadow', 'Doom', 'Storm', 'Brimstone', 'Soul', 'Gale', 'Dusk', 'Viper',
  'Iron', 'Rune', 'Wraith', 'Death', 'Chaos', 'Blood', 'Dread', 'Grim',
  'Dire', 'Plague', 'Raven', 'Ghost', 'Stone', 'Bone', 'Blight', 'Cinder',
] as const;

export const RARE_SECOND_WORDS = [
  'Bite', 'Grasp', 'Song', 'Touch', 'Mark', 'Fang', 'Weaver', 'Brand',
  'Ward', 'Shroud', 'Spike', 'Harrow', 'Claw', 'Bane', 'Heart', 'Stalker',
  'Flange', 'Fist', 'Hew', 'Strike', 'Edge', 'Grip', 'Vow', 'Crown',
] as const;

function rollRange(range: StatRange, rng: Rng): number {
  if (range.max <= range.min) return range.min;
  return range.min + rng.int(range.max - range.min + 1);
}

const STAT_KEYS = [
  'minDmg', 'maxDmg', 'acc', 'def', 'abs', 'hp', 'mana', 'pow', 'regen',
  'mf', 'ias', 'fcr', 'lifesteal', 'crit',
  'fireRes', 'waterRes', 'airRes', 'earthRes', 'astralRes', 'allRes',
  'body', 'agility', 'mind', 'spirit',
] as const;

export function rollAffixSpec(
  pool: readonly AffixSpec[],
  ilvl: number,
  slot: number,
  excludedGroups: ReadonlySet<number>,
  rng: Rng,
): AffixSpec | null {
  const candidates = pool.filter(
    (a) =>
      !excludedGroups.has(a.group) &&
      ilvl >= a.ilvlMin &&
      ilvl <= a.ilvlMax &&
      (!a.slots || a.slots.includes(slot)),
  );
  if (candidates.length === 0) return null;
  const totalWeight = candidates.reduce((s, a) => s + a.weight, 0);
  let pick = rng.int(totalWeight);
  for (const c of candidates) {
    if (pick < c.weight) return c;
    pick -= c.weight;
  }
  return candidates[0];
}

export function instantiateAffix(spec: AffixSpec, rng: Rng): AffixRollRecord {
  const stats: Record<string, number> = {};
  for (const key of STAT_KEYS) {
    const range = spec[key];
    if (range) stats[key] = rollRange(range, rng);
  }
  return { id: spec.id, name: spec.name, kind: spec.kind, group: spec.group, stats };
}

export function applyRolledAffixes(base: ItemDef, affixes: readonly AffixRollRecord[], customName?: string): ItemDef {
  if (base.kind !== Ik.Gear) return base;
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
  let mf = base.mf ?? 0;
  let ias = base.ias ?? 0;
  let fcr = base.fcr ?? 0;
  let lifesteal = base.lifesteal ?? 0;
  let crit = base.crit ?? 0;

  for (const a of affixes) {
    const s = a.stats;
    if (s.minDmg) min += s.minDmg;
    if (s.maxDmg) max += s.maxDmg;
    if (s.acc) acc += s.acc;
    if (s.def) def += s.def;
    if (s.abs) abs += s.abs;
    if (s.hp) hp += s.hp;
    if (s.mana) mana += s.mana;
    if (s.pow) pow += s.pow;
    if (s.regen) grow += s.regen;
    if (s.mf) mf += s.mf;
    if (s.ias) ias += s.ias;
    if (s.fcr) fcr += s.fcr;
    if (s.lifesteal) lifesteal += s.lifesteal;
    if (s.crit) crit += s.crit;
    if (s.fireRes) res[0] += s.fireRes;
    if (s.waterRes) res[1] += s.waterRes;
    if (s.airRes) res[2] += s.airRes;
    if (s.earthRes) res[3] += s.earthRes;
    if (s.astralRes) res[4] += s.astralRes;
    if (s.allRes) {
      for (let i = 0; i < 5; i++) res[i] += s.allRes;
    }
    if (s.body) attr[0] += s.body;
    if (s.agility) attr[1] += s.agility;
    if (s.mind) attr[2] += s.mind;
    if (s.spirit) attr[3] += s.spirit;
  }

  let name = customName ?? base.name;
  if (!customName) {
    const pre = affixes.find((a) => a.kind === 'prefix');
    const suf = affixes.find((a) => a.kind === 'suffix');
    name = `${pre ? `${pre.name} ` : ''}${base.name}${suf ? ` ${suf.name}` : ''}`;
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
    ...(mf > 0 ? { mf } : {}),
    ...(ias > 0 ? { ias } : {}),
    ...(fcr > 0 ? { fcr } : {}),
    ...(lifesteal > 0 ? { lifesteal } : {}),
    ...(crit > 0 ? { crit } : {}),
  };
}

export function rareAffixCountForTier(tier: number, rng: Rng): number {
  if (tier <= 1) return 3 + rng.int(2); // 3..4
  if (tier === 2) return 4;
  if (tier === 3) return 4 + rng.int(2); // 4..5
  if (tier === 4) return 5 + rng.int(2); // 5..6
  return 6;
}
