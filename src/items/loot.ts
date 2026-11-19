import { UNIQUE_ARTIFACTS } from '../sim/affixes';
import { Ik, type ItemDef, Slot } from '../sim/item-types';
import { ITEMS } from '../sim/items';
import { calculateMaxrollEffectiveMF } from '../sim/mechanics';
import { Rng } from '../sim/rng';
import { ALL_SET_ITEMS, findSetByItemName } from '../sim/sets';
import {
  PREFIX_POOL,
  RARE_FIRST_WORDS,
  RARE_SECOND_WORDS,
  SUFFIX_POOL,
  applyRolledAffixes,
  instantiateAffix,
  rareAffixCountForTier,
  rollAffixSpec,
} from './affixes';
import type {
  AffixRollRecord,
  DifficultyTier,
  GeneratedItem,
  ItemRarity,
  MonsterRank,
} from './types';

export interface LootTableRow {
  readonly ilvlBonus: number;
  readonly uniqueBp: number;
  readonly setBp: number;
  readonly rareBp: number;
  readonly magicBp: number;
}

export const RANK_DROP_WEIGHTS: Readonly<Record<MonsterRank, LootTableRow>> = {
  normal: { ilvlBonus: 0, uniqueBp: 25, setBp: 60, rareBp: 350, magicBp: 1800 },
  champion: { ilvlBonus: 2, uniqueBp: 120, setBp: 260, rareBp: 1200, magicBp: 4200 },
  elite: { ilvlBonus: 3, uniqueBp: 350, setBp: 650, rareBp: 2500, magicBp: 5000 },
  boss: { ilvlBonus: 5, uniqueBp: 1200, setBp: 1600, rareBp: 4200, magicBp: 3000 },
};

const DIFF_MULT: Readonly<Record<DifficultyTier, number>> = {
  normal: 100,
  veteran: 125,
  doomed: 160,
};

const SOCKET_CAPABLE_SLOTS = new Set<number>([Slot.Weapon, Slot.Armor, Slot.Shield, Slot.Helm]);

export function clampIlvl(ilvl: number): number {
  return Math.max(1, Math.min(50, Math.floor(ilvl)));
}

export function ilvlToTier(ilvl: number): number {
  return Math.max(1, Math.min(5, Math.ceil(clampIlvl(ilvl) / 10)));
}

export function maxSocketsFor(slot: number, tier: number): number {
  if (!SOCKET_CAPABLE_SLOTS.has(slot)) return 0;
  if (tier <= 1) return 1;
  if (tier === 2) return slot === Slot.Helm ? 1 : 2;
  if (tier === 3) return slot === Slot.Helm || slot === Slot.Shield ? 2 : 3;
  return slot === Slot.Helm ? 2 : 3;
}

function effectiveChanceBp(baseBp: number, emf: number, diffMultPct: number): number {
  const scaled = Math.floor((baseBp * (100 + emf) * diffMultPct) / 10000);
  return Math.min(10000, Math.max(0, scaled));
}

export function rollRarity(
  rank: MonsterRank,
  mf: number,
  difficulty: DifficultyTier,
  rng: Rng,
): ItemRarity {
  const row = RANK_DROP_WEIGHTS[rank];
  const emf = calculateMaxrollEffectiveMF(mf);
  const diffMult = DIFF_MULT[difficulty];

  if (rng.int(10000) < effectiveChanceBp(row.uniqueBp, emf.unique, diffMult)) return 'unique';
  if (rng.int(10000) < effectiveChanceBp(row.setBp, emf.set, diffMult)) return 'set';
  if (rng.int(10000) < effectiveChanceBp(row.rareBp, emf.rare, diffMult)) return 'rare';
  if (rng.int(10000) < effectiveChanceBp(row.magicBp, emf.magic, 100)) return 'magic';
  return rank === 'boss' ? 'magic' : 'common';
}

function deterministicHash(seed: number, name: string): number {
  let h = seed ^ 2166136261;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  }
  return 1000 + ((h >>> 0) % 900000);
}

function rollSockets(slot: number, tier: number, baseSockets: number | undefined, rng: Rng): number {
  const cap = maxSocketsFor(slot, tier);
  if (cap === 0) return 0;
  if (baseSockets !== undefined && baseSockets > 0) return Math.min(cap, baseSockets);
  if (rng.int(100) < 35) return 1 + rng.int(cap);
  return 0;
}

function buildMagicItem(
  base: ItemDef,
  baseId: number,
  ilvl: number,
  tier: number,
  seed: number,
  rng: Rng,
): GeneratedItem {
  const mode = rng.int(100);
  const wantPre = mode < 70;
  const wantSuf = mode >= 30;
  const used = new Set<number>();
  const affixes: AffixRollRecord[] = [];

  if (wantPre) {
    const spec = rollAffixSpec(PREFIX_POOL, ilvl, base.slot, used, rng);
    if (spec) {
      used.add(spec.group);
      affixes.push(instantiateAffix(spec, rng));
    }
  }
  if (wantSuf || affixes.length === 0) {
    const spec = rollAffixSpec(SUFFIX_POOL, ilvl, base.slot, used, rng);
    if (spec) {
      used.add(spec.group);
      affixes.push(instantiateAffix(spec, rng));
    }
  }

  const sockets = rollSockets(base.slot, tier, base.sockets, rng);
  const def = { ...applyRolledAffixes(base, affixes), rarity: 'magic' as const, sockets };
  return {
    id: deterministicHash(seed, def.name),
    baseId,
    name: def.name,
    rarity: 'magic',
    ilvl,
    tier,
    def,
    affixes,
    sockets,
    socketed: [],
    upgradeLevel: 0,
    upgradePity: 0,
    unidentified: false,
    seed,
  };
}

function buildRareItem(
  base: ItemDef,
  baseId: number,
  ilvl: number,
  tier: number,
  seed: number,
  rng: Rng,
): GeneratedItem {
  const targetCount = rareAffixCountForTier(tier, rng);
  const used = new Set<number>();
  const affixes: AffixRollRecord[] = [];
  let preCount = 0;
  let sufCount = 0;

  for (let i = 0; i < targetCount; i++) {
    const preferPre = preCount < 3 && (sufCount >= 3 || rng.int(2) === 0);
    if (preferPre) {
      const spec = rollAffixSpec(PREFIX_POOL, ilvl, base.slot, used, rng);
      if (spec) {
        used.add(spec.group);
        affixes.push(instantiateAffix(spec, rng));
        preCount++;
        continue;
      }
    }
    if (sufCount < 3) {
      const spec = rollAffixSpec(SUFFIX_POOL, ilvl, base.slot, used, rng);
      if (spec) {
        used.add(spec.group);
        affixes.push(instantiateAffix(spec, rng));
        sufCount++;
      }
    }
  }

  const w1 = RARE_FIRST_WORDS[rng.int(RARE_FIRST_WORDS.length)];
  const w2 = RARE_SECOND_WORDS[rng.int(RARE_SECOND_WORDS.length)];
  const customName = `${w1} ${w2}`;
  const sockets = rollSockets(base.slot, tier, base.sockets, rng);
  const def = {
    ...applyRolledAffixes(base, affixes, customName),
    rarity: 'rare' as const,
    unidentified: true,
    trueName: customName,
    sockets,
  };

  return {
    id: deterministicHash(seed, customName),
    baseId,
    name: customName,
    rarity: 'rare',
    ilvl,
    tier,
    def,
    affixes,
    sockets,
    socketed: [],
    upgradeLevel: 0,
    upgradePity: 0,
    unidentified: true,
    seed,
  };
}

export interface RollDropOptions {
  readonly mlvl: number;
  readonly rank?: MonsterRank;
  readonly mf?: number;
  readonly difficulty?: DifficultyTier;
  readonly seed: number;
  readonly pool?: readonly ItemDef[];
  readonly forcedRarity?: ItemRarity;
}

export function rollItemDrop(opts: RollDropOptions): GeneratedItem {
  const rng = new Rng(opts.seed);
  const rank = opts.rank ?? 'normal';
  const mf = opts.mf ?? 0;
  const difficulty = opts.difficulty ?? 'normal';
  const pool = opts.pool ?? ITEMS;

  const ilvl = clampIlvl(opts.mlvl + RANK_DROP_WEIGHTS[rank].ilvlBonus);
  const tier = ilvlToTier(ilvl);
  const rarity = opts.forcedRarity ?? rollRarity(rank, mf, difficulty, rng);

  if (rarity === 'unique') {
    const eligible = UNIQUE_ARTIFACTS.filter((u) => u.tier <= tier);
    const chosen = eligible.length > 0 ? eligible[rng.int(eligible.length)] : UNIQUE_ARTIFACTS[0];
    const sockets = rollSockets(chosen.slot, chosen.tier, chosen.sockets, rng);
    const def: ItemDef = { ...chosen, rarity: 'unique', unidentified: true, trueName: chosen.name, sockets };
    return {
      id: deterministicHash(opts.seed, chosen.name),
      baseId: -1,
      name: chosen.name,
      rarity: 'unique',
      ilvl,
      tier: chosen.tier,
      def,
      affixes: [],
      sockets,
      socketed: [],
      upgradeLevel: 0,
      upgradePity: 0,
      unidentified: true,
      seed: opts.seed,
    };
  }

  if (rarity === 'set') {
    const eligible = ALL_SET_ITEMS.filter((s) => s.tier <= tier);
    const chosen = eligible.length > 0 ? eligible[rng.int(eligible.length)] : ALL_SET_ITEMS[0];
    const setDef = findSetByItemName(chosen.name);
    const sockets = rollSockets(chosen.slot, chosen.tier, chosen.sockets, rng);
    const def: ItemDef = { ...chosen, rarity: 'set', set: setDef?.id, unidentified: true, trueName: chosen.name, sockets };
    return {
      id: deterministicHash(opts.seed, chosen.name),
      baseId: -1,
      name: chosen.name,
      rarity: 'set',
      ilvl,
      tier: chosen.tier,
      def,
      affixes: [],
      sockets,
      socketed: [],
      upgradeLevel: 0,
      upgradePity: 0,
      unidentified: true,
      seed: opts.seed,
      setId: setDef?.id,
    };
  }

  // Common, Magic, or Rare from base gear pool
  const gearEntries = pool
    .map((def, idx) => ({ def, idx }))
    .filter((e) => e.def.kind === Ik.Gear && e.def.tier <= tier);
  const tierMatched = gearEntries.filter((e) => e.def.tier === tier);
  const candidates = tierMatched.length > 0 ? tierMatched : gearEntries;

  const fallback: ItemDef = {
    name: 'Iron Sword', kind: Ik.Gear, slot: Slot.Weapon, tier: 1, w: 4, cls: 1, need: 0, needv: 4,
    min: 2, max: 4, acc: 0, cover: 0, def: 0, abs: 0, res: [0, 0, 0, 0, 0], attr: [0, 0, 0, 0],
    hp: 0, mana: 0, pow: 0, heal: 0, restore: 0, grow: 0, spell: -1,
  };
  const pick = candidates.length > 0 ? candidates[rng.int(candidates.length)] : { def: fallback, idx: 0 };

  if (rarity === 'magic') return buildMagicItem(pick.def, pick.idx, ilvl, tier, opts.seed, rng);
  if (rarity === 'rare') return buildRareItem(pick.def, pick.idx, ilvl, tier, opts.seed, rng);

  const sockets = rollSockets(pick.def.slot, tier, pick.def.sockets, rng);
  const def: ItemDef = { ...pick.def, rarity: 'common', sockets };
  return {
    id: deterministicHash(opts.seed, def.name),
    baseId: pick.idx,
    name: def.name,
    rarity: 'common',
    ilvl,
    tier,
    def,
    affixes: [],
    sockets,
    socketed: [],
    upgradeLevel: 0,
    upgradePity: 0,
    unidentified: false,
    seed: opts.seed,
  };
}
