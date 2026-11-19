import { BUILTIN_GEMS, Slot, type ItemDef } from '../sim/item-types';
import { Rng } from '../sim/rng';
import { getRuneByName } from '../sim/runes';
import { PREFIX_POOL, SUFFIX_POOL, applyRolledAffixes, instantiateAffix, rollAffixSpec } from './affixes';
import { maxSocketsFor } from './loot';
import type { EssenceMap, EssenceType, GeneratedItem, SalvageResult, SocketResult, UpgradeResult } from './types';

export function emptyEssences(): EssenceMap {
  return { ash: 0, glimmer: 0, amber: 0, verdant: 0, astral: 0 };
}

export function salvageItem(item: GeneratedItem): SalvageResult {
  const t = Math.max(1, item.tier);
  switch (item.rarity) {
    case 'common':
      return { essence: 'ash', quantity: 1 + Math.floor(t / 3), gold: 5 * t };
    case 'magic':
      return { essence: 'glimmer', quantity: 1 + (item.affixes.length >= 2 ? 1 : 0), gold: 15 * t };
    case 'rare':
      return { essence: 'amber', quantity: 1 + Math.floor(t / 2), gold: 35 * t };
    case 'set':
      return { essence: 'verdant', quantity: 1 + Math.floor(t / 3), gold: 60 * t };
    case 'unique':
      return { essence: 'astral', quantity: 1 + Math.floor(t / 3), gold: 100 * t };
  }
}

interface UpgradeStepSpec {
  readonly baseChance: number;
  readonly goldMult: number;
  readonly essenceType: EssenceType;
  readonly essenceCost: number;
  readonly pityBonus: number;
}

export const UPGRADE_TABLE: readonly UpgradeStepSpec[] = [
  { baseChance: 100, goldMult: 100, essenceType: 'ash', essenceCost: 2, pityBonus: 0 },     // +0 -> +1
  { baseChance: 85, goldMult: 250, essenceType: 'glimmer', essenceCost: 2, pityBonus: 15 }, // +1 -> +2
  { baseChance: 70, goldMult: 500, essenceType: 'amber', essenceCost: 2, pityBonus: 15 },   // +2 -> +3
  { baseChance: 50, goldMult: 1000, essenceType: 'verdant', essenceCost: 1, pityBonus: 20 },// +3 -> +4
  { baseChance: 30, goldMult: 2000, essenceType: 'astral', essenceCost: 1, pityBonus: 25 }, // +4 -> +5
];

export function getUpgradeChancePct(currentLevel: number, pityCount: number): number {
  if (currentLevel < 0 || currentLevel >= 5) return 0;
  const spec = UPGRADE_TABLE[currentLevel];
  return Math.min(100, spec.baseChance + Math.max(0, pityCount) * spec.pityBonus);
}

export function getUpgradedDef(def: ItemDef, upgradeLevel: number): ItemDef {
  if (upgradeLevel <= 0) return def;
  if (def.slot === Slot.Weapon) {
    const minBonus = Math.max(upgradeLevel, Math.floor((def.min * upgradeLevel * 8) / 100));
    const maxBonus = Math.max(upgradeLevel, Math.floor((def.max * upgradeLevel * 8) / 100));
    const accBonus = (upgradeLevel >= 3 ? 1 : 0) + (upgradeLevel >= 5 ? 1 : 0);
    return { ...def, min: def.min + minBonus, max: def.max + maxBonus, acc: def.acc + accBonus };
  }
  if (def.slot === Slot.Ring || def.slot === Slot.Amulet) {
    const powBonus = def.pow > 0 ? Math.max(upgradeLevel, Math.floor((def.pow * upgradeLevel * 10) / 100)) : 0;
    const hpBonus = def.hp > 0 ? Math.max(upgradeLevel * 2, Math.floor((def.hp * upgradeLevel * 10) / 100)) : 0;
    const manaBonus = def.mana > 0 ? Math.max(upgradeLevel * 2, Math.floor((def.mana * upgradeLevel * 10) / 100)) : 0;
    return { ...def, pow: def.pow + powBonus, hp: def.hp + hpBonus, mana: def.mana + manaBonus };
  }
  const defBonus = Math.max(upgradeLevel, Math.floor((def.def * upgradeLevel * 10) / 100));
  const absBonus = Math.max(upgradeLevel, Math.floor((def.abs * upgradeLevel * 10) / 100));
  const hpBonus = (upgradeLevel >= 2 ? 5 : 0) + (upgradeLevel >= 4 ? 5 : 0) + (upgradeLevel >= 5 ? 5 : 0);
  return { ...def, def: def.def + defBonus, abs: def.abs + absBonus, hp: def.hp + hpBonus };
}

export function upgradeItem(
  item: GeneratedItem,
  goldAvailable: number,
  essences: EssenceMap,
  seed: number,
): UpgradeResult | null {
  if (item.upgradeLevel >= 5) return null;
  const spec = UPGRADE_TABLE[item.upgradeLevel];
  const goldCost = spec.goldMult * Math.max(1, item.tier);
  if (goldAvailable < goldCost) return null;
  if ((essences[spec.essenceType] ?? 0) < spec.essenceCost) return null;

  const chancePct = getUpgradeChancePct(item.upgradeLevel, item.upgradePity);
  const rng = new Rng(seed);
  const success = rng.int(100) < chancePct;

  const nextLevel = success ? item.upgradeLevel + 1 : item.upgradeLevel;
  const nextPity = success ? 0 : item.upgradePity + 1;

  return {
    success,
    item: {
      ...item,
      upgradeLevel: nextLevel,
      upgradePity: nextPity,
    },
    goldSpent: goldCost,
    essenceType: spec.essenceType,
    essenceSpent: spec.essenceCost,
    chancePct,
  };
}

export function punchSocket(item: GeneratedItem): SocketResult {
  const cap = maxSocketsFor(item.def.slot, item.tier);
  if (cap === 0) return { ok: false, reason: 'Slot cannot hold sockets.', item };
  if (item.sockets >= cap) return { ok: false, reason: 'Maximum sockets reached.', item };
  const nextSockets = item.sockets + 1;
  return {
    ok: true,
    item: {
      ...item,
      sockets: nextSockets,
      def: { ...item.def, sockets: nextSockets },
    },
  };
}

export function insertSocketItem(item: GeneratedItem, gemOrRuneName: string): SocketResult {
  if (item.sockets <= 0) return { ok: false, reason: 'Item has no sockets.', item };
  if (item.socketed.length >= item.sockets) return { ok: false, reason: 'All sockets are full.', item };

  const gem = BUILTIN_GEMS.find((g) => g.name === gemOrRuneName);
  const rune = getRuneByName(gemOrRuneName);
  if (!gem && !rune) return { ok: false, reason: 'Unknown gem or rune.', item };

  const nextSocketed = [...item.socketed, gemOrRuneName];
  let def = { ...item.def, socketedGems: nextSocketed };

  if (gem) {
    const isWeapon = item.def.slot === Slot.Weapon;
    if (isWeapon) {
      def = {
        ...def,
        min: def.min + gem.weaponBonus.min,
        max: def.max + gem.weaponBonus.max,
        lifesteal: (def.lifesteal ?? 0) + (gem.weaponBonus.lifesteal ?? 0),
      };
    } else {
      const attr: [number, number, number, number] = [...def.attr];
      if (gem.armorBonus.attr) {
        for (let i = 0; i < 4; i++) attr[i] += gem.armorBonus.attr[i];
      }
      def = {
        ...def,
        hp: def.hp + (gem.armorBonus.hp ?? 0),
        mana: def.mana + (gem.armorBonus.mana ?? 0),
        def: def.def + (gem.armorBonus.def ?? 0),
        mf: (def.mf ?? 0) + (gem.armorBonus.mf ?? 0),
        grow: def.grow + (gem.armorBonus.regen ?? 0),
        attr,
      };
    }
  } else if (rune) {
    const isWeapon = item.def.slot === Slot.Weapon;
    const isShield = item.def.slot === Slot.Shield;
    const b = isWeapon ? rune.weaponBonus : isShield ? rune.shieldBonus : rune.armorBonus;
    def = {
      ...def,
      min: def.min + ('min' in b && b.min ? b.min : 0),
      max: def.max + ('max' in b && b.max ? b.max : 0),
      acc: def.acc + ('acc' in b && b.acc ? b.acc : 0),
      hp: def.hp + ('hp' in b && b.hp ? b.hp : 0),
      mana: def.mana + ('mana' in b && b.mana ? b.mana : 0),
      def: def.def + ('def' in b && b.def ? b.def : 0),
      lifesteal: (def.lifesteal ?? 0) + ('lifesteal' in b && b.lifesteal ? b.lifesteal : 0),
    };
  }

  return {
    ok: true,
    item: {
      ...item,
      socketed: nextSocketed,
      def,
    },
  };
}

export function rerollAffix(item: GeneratedItem, affixIndex: number, baseDef: ItemDef, seed: number): GeneratedItem | null {
  if (item.rarity !== 'magic' && item.rarity !== 'rare') return null;
  if (affixIndex < 0 || affixIndex >= item.affixes.length) return null;

  const target = item.affixes[affixIndex];
  const excluded = new Set<number>(item.affixes.map((a) => a.group));
  const pool = target.kind === 'prefix' ? PREFIX_POOL : SUFFIX_POOL;
  const rng = new Rng(seed);
  const spec = rollAffixSpec(pool, item.ilvl, baseDef.slot, excluded, rng);
  if (!spec) return null;

  const rolled = instantiateAffix(spec, rng);
  const nextAffixes = item.affixes.map((a, idx) => (idx === affixIndex ? rolled : a));
  const customName = item.rarity === 'rare' ? item.name : undefined;
  const nextDef = {
    ...applyRolledAffixes(baseDef, nextAffixes, customName),
    rarity: item.rarity,
    sockets: item.sockets,
    socketedGems: [...item.socketed],
  };

  return {
    ...item,
    name: nextDef.name,
    affixes: nextAffixes,
    def: nextDef,
  };
}
