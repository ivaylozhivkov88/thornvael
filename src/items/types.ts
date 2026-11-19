import type { ItemDef } from '../sim/item-types';

export type ItemRarity = 'common' | 'magic' | 'rare' | 'set' | 'unique';
export type MonsterRank = 'normal' | 'champion' | 'elite' | 'boss';
export type DifficultyTier = 'normal' | 'veteran' | 'doomed';
export type EssenceType = 'ash' | 'glimmer' | 'amber' | 'verdant' | 'astral';
export type EssenceMap = Record<EssenceType, number>;

export interface StatRange {
  readonly min: number;
  readonly max: number;
}

export interface AffixSpec {
  readonly id: string;
  readonly name: string;
  readonly kind: 'prefix' | 'suffix';
  readonly group: number;
  readonly ilvlMin: number;
  readonly ilvlMax: number;
  readonly tierMin: number;
  readonly tierMax: number;
  readonly weight: number;
  readonly slots?: readonly number[];
  readonly minDmg?: StatRange;
  readonly maxDmg?: StatRange;
  readonly acc?: StatRange;
  readonly def?: StatRange;
  readonly abs?: StatRange;
  readonly hp?: StatRange;
  readonly mana?: StatRange;
  readonly pow?: StatRange;
  readonly regen?: StatRange;
  readonly mf?: StatRange;
  readonly ias?: StatRange;
  readonly fcr?: StatRange;
  readonly lifesteal?: StatRange;
  readonly crit?: StatRange;
  readonly fireRes?: StatRange;
  readonly waterRes?: StatRange;
  readonly airRes?: StatRange;
  readonly earthRes?: StatRange;
  readonly astralRes?: StatRange;
  readonly allRes?: StatRange;
  readonly body?: StatRange;
  readonly agility?: StatRange;
  readonly mind?: StatRange;
  readonly spirit?: StatRange;
}

export interface AffixRollRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: 'prefix' | 'suffix';
  readonly group: number;
  readonly stats: Readonly<Record<string, number>>;
}

export interface GeneratedItem {
  readonly id: number;
  readonly baseId: number;
  readonly name: string;
  readonly rarity: ItemRarity;
  readonly ilvl: number;
  readonly tier: number;
  readonly def: ItemDef;
  readonly affixes: readonly AffixRollRecord[];
  readonly sockets: number;
  readonly socketed: readonly string[];
  readonly upgradeLevel: number;
  readonly upgradePity: number;
  readonly unidentified: boolean;
  readonly seed: number;
  readonly setId?: string;
}

export interface SalvageResult {
  readonly essence: EssenceType;
  readonly quantity: number;
  readonly gold: number;
}

export interface UpgradeResult {
  readonly success: boolean;
  readonly item: GeneratedItem;
  readonly goldSpent: number;
  readonly essenceType: EssenceType;
  readonly essenceSpent: number;
  readonly chancePct: number;
}

export interface SocketResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly item: GeneratedItem;
}
