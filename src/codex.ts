import sets1 from '../public/data/content/item-sets.json';
import sets2 from '../public/data/content/item-sets-2.json';
import uniques1 from '../public/data/content/uniques.json';
import uniques2 from '../public/data/content/uniques-2.json';
import uniques3 from '../public/data/content/uniques-3.json';
import {
  type BestiaryEntry,
  getBestiaryEntry,
  ITEM_LORE_PACK,
  type JsonFetcher,
  loadBestiary,
} from './data/text/index';
import { DYNAMIC_ITEM_OFFSET, getItemDef, ITEMS } from './sim/items';
import { ALL_RUNES, getRuneById, getRuneByName, RUNEWORDS } from './sim/runes';
import { ALL_SETS, findSetByItemName, isSetItem } from './sim/sets';
import type { Sim } from './sim/sim';
import { getSuperUniqueById, SUPER_UNIQUES } from './sim/super-uniques';

/**
 * Hall of Relics Codex & Bestiary system for Thornvael, inspired by classic ARPG relic hunts.
 * Persistently tracks every unique base and artifact item discovered by the player
 * across campaigns, skirmishes, and procedural expeditions, and exposes live accessors
 * for all 52 bestiary lore entries and 273 curated item-lore strings.
 */

export const CODEX_STORAGE_KEY = 'thornvael_codex_v1';
export const GRAIL_STORAGE_KEY = 'thornvael_grail_v2';
export const GRAIL_PINS_KEY = 'thornvael_grail_pins_v1';

export type GrailTome = 'uniques' | 'sets' | 'runewords' | 'trophies' | 'armory';

export interface GrailEntry {
  key: string;
  tome: GrailTome;
  name: string;
  baseName?: string;
  baseId?: number;
  itemId?: number;
  tier?: number;
  slot?: number | string;
  setId?: string;
  setName?: string;
  discoveredAt: number;
  heroName?: string;
  heroClass?: string;
  heroLevel?: number;
  missionName?: string;
  droppedBy?: string;
  rollPerfectionPct: number;
  isPrimalPerfect?: boolean;
  count: number;
}

export interface GrailDiscoveryMeta {
  heroName?: string;
  heroClass?: string;
  heroLevel?: number;
  missionName?: string;
  droppedBy?: string;
  rollPerfectionPct?: number;
  inst?: any;
}

export interface DiscoveryResult {
  isNew: boolean;
  isRollUpgrade: boolean;
  prevPct?: number;
  newPct?: number;
  entry: GrailEntry;
}

export interface GrailCatalogItem {
  key: string;
  tome: GrailTome;
  name: string;
  baseName?: string;
  baseId?: number;
  act?: number;
  tier?: number;
  slot?: number | string;
  cls?: string;
  setId?: string;
  setName?: string;
  dropFrom?: string;
  runes?: readonly string[];
  clue: string;
  icon?: string;
}

export interface GrailMilestoneBoons {
  totalCount: number;
  discoveredCount: number;
  pct: number;
  mfBonus: number;
  smartGrailPityBias: number;
  canForgeReplica: boolean;
  unlockedGrailBounties: boolean;
  hasSovereignCrown: boolean;
  title: string;
  nextMilestonePct: number;
  toNextMilestone: number;
  uniquesProgress: { discovered: number; total: number; pct: number };
  setsProgress: { discovered: number; total: number; pct: number; setsCompleted: number; totalSets: number };
  runewordsProgress: { discovered: number; total: number; pct: number };
  trophiesProgress: { discovered: number; total: number; pct: number };
  armoryProgress: { discovered: number; total: number; pct: number };
}

const memoryDiscovered = new Set<number>();
const memoryGrail = new Map<string, GrailEntry>();
let memoryPins: string[] | null = null;
const listeners = new Set<(itemId: number) => void>();
const grailListeners = new Set<(res: DiscoveryResult) => void>();

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Load the set of discovered item IDs from persistent storage or in-memory fallback. */
export function loadDiscovered(): Set<number> {
  const store = getStorage();
  if (!store) return new Set(memoryDiscovered);
  try {
    const raw = store.getItem(CODEX_STORAGE_KEY);
    if (!raw) return new Set(memoryDiscovered);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      parsed.forEach((id) => {
        if (typeof id === 'number' && id >= 0) memoryDiscovered.add(id);
      });
    }
  } catch {
    // Malformed JSON fallback
  }
  return new Set(memoryDiscovered);
}

/** Save the set of discovered item IDs to persistent storage. */
export function saveDiscovered(set: Set<number>): void {
  const arr = [...set].filter((id) => id >= 0);
  const store = getStorage();
  if (store) {
    try {
      store.setItem(CODEX_STORAGE_KEY, JSON.stringify(arr));
    } catch {
      // Storage quota or security error
    }
  }
}

/** Load all Grail v2 entries from persistent storage into memory. */
export function loadGrailEntries(): Map<string, GrailEntry> {
  if (memoryGrail.size > 0) return memoryGrail;
  const store = getStorage();
  if (!store) return memoryGrail;
  try {
    const raw = store.getItem(GRAIL_STORAGE_KEY);
    if (!raw) return memoryGrail;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item.key === 'string') {
          memoryGrail.set(item.key, item);
        }
      }
    } else if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === 'object') {
          memoryGrail.set(k, v as GrailEntry);
        }
      }
    }
  } catch {
    // Malformed JSON fallback
  }
  return memoryGrail;
}

/** Save all Grail v2 entries to persistent storage. */
export function saveGrailEntries(entries: Map<string, GrailEntry>): void {
  const store = getStorage();
  if (store) {
    try {
      store.setItem(GRAIL_STORAGE_KEY, JSON.stringify([...entries.values()]));
    } catch {
      // Storage quota or security error
    }
  }
}

/** Get a single Grail record by unique canonical key. */
export function getGrailEntry(key: string): GrailEntry | undefined {
  loadGrailEntries();
  return memoryGrail.get(key);
}

/** Return an array of all discovered Grail entries. */
export function getAllGrailEntries(): readonly GrailEntry[] {
  loadGrailEntries();
  return [...memoryGrail.values()];
}

/** Register a discovery listener (e.g. for toasts or HUD animations). */
export function onDiscovery(fn: (itemId: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Register a detailed Grail discovery listener (for perfection celebrations). */
export function onGrailDiscovery(fn: (res: DiscoveryResult) => void): () => void {
  grailListeners.add(fn);
  return () => grailListeners.delete(fn);
}

/** Calculate percentage roll perfection (0..100%) for an item instance. */
export function computeRollPerfection(inst?: any, def?: any): number {
  if (!inst && !def) return 75;
  if (typeof inst?.rollPerfectionPct === 'number') {
    return Math.max(1, Math.min(100, Math.round(inst.rollPerfectionPct)));
  }

  let totalPct = 0;
  let count = 0;

  // 1. Rolled affix values vs max rolls
  if (Array.isArray(inst?.affixes) && inst.affixes.length > 0) {
    for (const af of inst.affixes) {
      if (typeof af?.val === 'number' && typeof af?.max === 'number' && af.max > 0) {
        totalPct += Math.min(100, (af.val / af.max) * 100);
        count++;
      } else if (typeof af?.pct === 'number') {
        totalPct += Math.min(100, af.pct);
        count++;
      }
    }
  }

  // 2. Weapon damage ratio
  if (typeof inst?.max === 'number' && typeof def?.max === 'number' && def.max > 0) {
    totalPct += Math.min(100, (inst.max / def.max) * 100);
    count++;
  }

  // 3. Armor / Defense ratio
  if (typeof inst?.def === 'number' && typeof def?.def === 'number' && def.def > 0) {
    totalPct += Math.min(100, (inst.def / def.def) * 100);
    count++;
  }

  // 4. Absorb ratio
  if (typeof inst?.abs === 'number' && typeof def?.abs === 'number' && def.abs > 0) {
    totalPct += Math.min(100, (inst.abs / def.abs) * 100);
    count++;
  }

  // 5. Seed / quality variation
  if (typeof inst?.quality === 'number') {
    totalPct += Math.min(100, inst.quality * 100);
    count++;
  } else if (typeof inst?.seed === 'number') {
    const seedVal = 65 + (Math.abs(inst.seed) % 35);
    totalPct += seedVal;
    count++;
  }

  if (count > 0) {
    return Math.max(1, Math.min(100, Math.round(totalPct / count)));
  }

  return 80;
}

// -----------------------------------------------------------------------------
// Canonical Grail Catalog Construction
// -----------------------------------------------------------------------------

interface RawUnique {
  id: string;
  name: string;
  base: string;
  act?: number;
  tier?: number;
  cls?: string;
  class?: string;
  drop_from?: string;
  quirk?: string;
  lore?: string;
  inspect?: string;
}

const RAW_UNIQUES: readonly RawUnique[] = [...(uniques1 as any[]), ...(uniques2 as any[]), ...(uniques3 as any[])];

function findUniqueInCatalog(uniqueId?: string, name?: string): RawUnique | undefined {
  if (uniqueId) {
    const byId = RAW_UNIQUES.find((u) => u.id === uniqueId);
    if (byId) return byId;
  }
  if (name) {
    const nLow = name.toLowerCase();
    return RAW_UNIQUES.find((u) => u.name.toLowerCase() === nLow);
  }
  return undefined;
}

interface CatalogSetPiece {
  key: string;
  name: string;
  setId: string;
  setName: string;
  act: number;
  tier: number;
  cls: string;
}

const ALL_GRAIL_SET_PIECES: readonly CatalogSetPiece[] = (() => {
  const pieces: CatalogSetPiece[] = [];
  // 8 sim sets
  for (const set of ALL_SETS) {
    for (const p of set.pieces) {
      pieces.push({
        key: `set:${slug(set.id)}:${slug(p.name)}`,
        name: p.name,
        setId: set.id,
        setName: set.name,
        act: p.tier ?? 1,
        tier: p.tier ?? 1,
        cls: p.cls === 1 ? 'warrior' : p.cls === 2 ? 'mage' : 'both',
      });
    }
  }
  // 20 JSON sets
  const jsonSets = [...(sets1 as any[]), ...(sets2 as any[])];
  for (const s of jsonSets) {
    const sId = s.id ?? slug(s.name);
    for (const p of s.pieces ?? []) {
      pieces.push({
        key: `set:${slug(sId)}:${slug(p.name)}`,
        name: p.name,
        setId: sId,
        setName: s.name,
        act: s.tier ?? 1,
        tier: s.tier ?? 1,
        cls: s.class ?? 'any',
      });
    }
  }
  return pieces;
})();

function findSetPieceInCatalog(name: string): CatalogSetPiece | undefined {
  const nLow = name.toLowerCase();
  return ALL_GRAIL_SET_PIECES.find((p) => p.name.toLowerCase() === nLow);
}

export const ACT_BOSS_TROPHIES = [
  { id: 'morvessa', name: 'Widow Morvessa', act: 1, loc: 'Weeping Ossuary' },
  { id: 'gorrathul', name: 'Gorrathul, the Sand Glutton', act: 2, loc: 'Gullet of Dunes' },
  { id: 'vesperion', name: 'Vesperion the Drowned', act: 3, loc: 'Drowned Citadel' },
  { id: 'ashkarath', name: 'Ashkarath, the Cinder King', act: 4, loc: 'Cinder Throne' },
];

let cachedCatalog: readonly GrailCatalogItem[] | null = null;

/** Returns the complete, canonical 5-Tome Holy Grail Catalog. */
export function getGrailCatalog(): readonly GrailCatalogItem[] {
  if (cachedCatalog) return cachedCatalog;

  const catalog: GrailCatalogItem[] = [];

  // Tome I: Uniques (132)
  for (const u of RAW_UNIQUES) {
    const act = u.act ?? u.tier ?? 1;
    catalog.push({
      key: `unique:${u.id}`,
      tome: 'uniques',
      name: u.name,
      baseName: u.base,
      act,
      tier: act,
      cls: u.cls ?? u.class ?? 'any',
      dropFrom: u.drop_from,
      clue: u.drop_from
        ? `Target Farm: Dropped by ${u.drop_from.replace(/-/g, ' ')} in Act ${act}.`
        : `Target Farm: Act ${act} expeditions, reliquary chests, and dungeon champions.`,
      icon: `public/itemicons/${u.id}.png`,
    });
  }

  // Tome II: Sacred Sets (112 pieces across 28 sets)
  for (const p of ALL_GRAIL_SET_PIECES) {
    catalog.push({
      key: p.key,
      tome: 'sets',
      name: p.name,
      setId: p.setId,
      setName: p.setName,
      act: p.act,
      tier: p.tier,
      cls: p.cls,
      clue: `Target Farm: Part of ${p.setName}. Dropped by Act ${p.act} elites, shrines, and high-tier chests.`,
      icon: `public/itemicons/${slug(p.name)}.png`,
    });
  }

  // Tome III: Runes & Crafted Runewords (33 runes + 25 runewords = 58)
  for (const r of ALL_RUNES) {
    const tier = r.id <= 10 ? 1 : r.id <= 20 ? 2 : r.id <= 28 ? 3 : 4;
    catalog.push({
      key: `rune:${slug(r.name)}`,
      tome: 'runewords',
      name: `${r.name} Rune`,
      tier,
      act: tier,
      clue:
        r.id <= 10
          ? 'Common rune from Act 1 & 2 Countess, tomb sarcophagi, and elite packs.'
          : r.id <= 20
            ? 'Mid rune found in Act 2 & 3 dungeons, boss chests, or Cube transmutation.'
            : 'High rune: Extremely rare Act 4 Hell drop / Horadric Cube upgrade.',
      icon: `public/wiki/icons/rune-${slug(r.d2Name)}.png`,
    });
  }

  for (const rw of RUNEWORDS) {
    const runeNames = rw.runeIds.map((id) => ALL_RUNES.find((r) => r.id === id)?.d2Name ?? `Rune #${id}`);
    catalog.push({
      key: `runeword:${slug(rw.name)}`,
      tome: 'runewords',
      name: rw.name,
      runes: runeNames,
      tier: rw.clvl <= 25 ? 1 : rw.clvl <= 45 ? 2 : rw.clvl <= 60 ? 3 : 4,
      act: rw.clvl <= 25 ? 1 : rw.clvl <= 45 ? 2 : rw.clvl <= 60 ? 3 : 4,
      clue: `Horadric Runeword: Socket ${runeNames.join(' + ')} into an open-socketed base item.`,
      icon: 'public/wiki/icons/runeword-seal.png',
    });
  }

  // Tome IV: Boss Trophies (20)
  for (const b of ACT_BOSS_TROPHIES) {
    catalog.push({
      key: `trophy:${b.id}`,
      tome: 'trophies',
      name: `${b.name} Trophy Seal`,
      act: b.act,
      clue: `Target Farm: Slay ${b.name} in Act ${b.act} (${b.loc}) on any difficulty.`,
      icon: `public/wiki/icons/trophy-${b.id}.png`,
    });
  }

  for (const su of SUPER_UNIQUES) {
    catalog.push({
      key: `trophy:${su.id}`,
      tome: 'trophies',
      name: `${su.name} Trophy Seal`,
      act: su.act,
      clue: `Target Farm: Slay Super-Unique ${su.name} in Act ${su.act} territory.`,
      icon: `public/wiki/icons/trophy-${su.id}.png`,
    });
  }

  // Tome V: Imperial Armory (187 Base Items)
  ITEMS.forEach((it, idx) => {
    catalog.push({
      key: `armory:${idx}`,
      tome: 'armory',
      name: it.name,
      baseId: idx,
      tier: it.tier,
      act: it.tier,
      slot: it.slot,
      clue: `Target Farm: Standard military base equipment from Act ${it.tier} vendors, weapon racks, and crates.`,
      icon: `public/itemicons/${slug(it.name)}.png`,
    });
  });

  cachedCatalog = catalog;
  return catalog;
}

/** Return filtered catalog items belonging to a specific Tome. */
export function getGrailCatalogByTome(tome: GrailTome): readonly GrailCatalogItem[] {
  return getGrailCatalog().filter((it) => it.tome === tome);
}

/** Find a catalog item by key. */
export function getGrailCatalogItem(key: string): GrailCatalogItem | undefined {
  return getGrailCatalog().find((it) => it.key === key);
}

/** Return a list of all distinct Set IDs. */
export function getAllSetIds(): string[] {
  const setIds = new Set<string>();
  for (const p of ALL_GRAIL_SET_PIECES) {
    setIds.add(p.setId);
  }
  return [...setIds];
}

/** Calculate completion progress for a specific Set. */
export function getSetProgress(setIdOrName: string): {
  name: string;
  foundPieces: string[];
  totalPieces: string[];
  isComplete: boolean;
  ratio: string;
} {
  loadGrailEntries();
  const qLow = setIdOrName.toLowerCase();
  const matchingPieces = ALL_GRAIL_SET_PIECES.filter(
    (p) => p.setId.toLowerCase() === qLow || p.setName.toLowerCase() === qLow,
  );
  const setName = matchingPieces[0]?.setName ?? setIdOrName;
  const totalPieces = matchingPieces.map((p) => p.name);
  const foundPieces = matchingPieces.filter((p) => memoryGrail.has(p.key)).map((p) => p.name);
  const isComplete = totalPieces.length > 0 && foundPieces.length === totalPieces.length;
  const ratio = `${foundPieces.length}/${totalPieces.length}`;
  return { name: setName, foundPieces, totalPieces, isComplete, ratio };
}

// -----------------------------------------------------------------------------
// Grail Discovery Engine
// -----------------------------------------------------------------------------

function recordGrailDiscovery(
  key: string,
  tome: GrailTome,
  name: string,
  extra: {
    baseName?: string;
    baseId?: number;
    itemId?: number;
    tier?: number;
    slot?: number | string;
    setId?: string;
    setName?: string;
    meta?: Partial<GrailDiscoveryMeta>;
    inst?: any;
    def?: any;
  },
): DiscoveryResult {
  loadGrailEntries();
  const existing = memoryGrail.get(key);
  const now = Date.now();
  const calculatedPct = extra.meta?.rollPerfectionPct ?? computeRollPerfection(extra.inst, extra.def);
  const rollPct = Math.max(1, Math.min(100, calculatedPct));

  if (!existing) {
    const entry: GrailEntry = {
      key,
      tome,
      name,
      baseName: extra.baseName,
      baseId: extra.baseId,
      itemId: extra.itemId,
      tier: extra.tier,
      slot: extra.slot,
      setId: extra.setId,
      setName: extra.setName,
      discoveredAt: now,
      heroName: extra.meta?.heroName ?? 'Veteran Mercenary',
      heroClass: extra.meta?.heroClass ?? 'Warrior',
      heroLevel: extra.meta?.heroLevel ?? 1,
      missionName: extra.meta?.missionName ?? 'Campaign Expedition',
      droppedBy: extra.meta?.droppedBy,
      rollPerfectionPct: rollPct,
      isPrimalPerfect: rollPct >= 98,
      count: 1,
    };
    memoryGrail.set(key, entry);
    saveGrailEntries(memoryGrail);
    const result: DiscoveryResult = { isNew: true, isRollUpgrade: false, newPct: rollPct, entry };
    for (const fn of grailListeners) {
      try {
        fn(result);
      } catch {
        // Ignore
      }
    }
    return result;
  }

  // Already exists: record increment and check for higher roll
  existing.count = (existing.count || 1) + 1;
  let isRollUpgrade = false;
  const prevPct = existing.rollPerfectionPct;
  if (rollPct > existing.rollPerfectionPct) {
    isRollUpgrade = true;
    existing.rollPerfectionPct = rollPct;
    existing.isPrimalPerfect = rollPct >= 98;
    existing.discoveredAt = now;
    if (extra.meta?.heroName) existing.heroName = extra.meta.heroName;
    if (extra.meta?.heroClass) existing.heroClass = extra.meta.heroClass;
    if (extra.meta?.heroLevel) existing.heroLevel = extra.meta.heroLevel;
    if (extra.meta?.missionName) existing.missionName = extra.meta.missionName;
    if (extra.meta?.droppedBy) existing.droppedBy = extra.meta.droppedBy;
  }
  saveGrailEntries(memoryGrail);
  const result: DiscoveryResult = {
    isNew: false,
    isRollUpgrade,
    prevPct,
    newPct: rollPct,
    entry: existing,
  };
  if (isRollUpgrade) {
    for (const fn of grailListeners) {
      try {
        fn(result);
      } catch {
        // Ignore
      }
    }
  }
  return result;
}

function recordGrailDiscoveryFromItem(
  itemId: number,
  inst: any,
  def: any,
  meta?: Partial<GrailDiscoveryMeta>,
): DiscoveryResult | null {
  const name = inst?.name ?? def?.name;
  if (!name) {
    if (itemId >= 0 && itemId < ITEMS.length) {
      return recordGrailDiscovery(`armory:${itemId}`, 'armory', ITEMS[itemId].name, {
        baseId: itemId,
        itemId,
        tier: ITEMS[itemId].tier,
        slot: ITEMS[itemId].slot,
        inst,
        def: def ?? ITEMS[itemId],
        meta,
      });
    }
    return null;
  }

  // 1. Check if Unique
  const uniqueMatch = findUniqueInCatalog(inst?.uniqueId, name);
  if (uniqueMatch || inst?.quality === 'unique' || def?.quality === 'unique') {
    const uId = uniqueMatch ? uniqueMatch.id : slug(name);
    const uName = uniqueMatch?.name ?? name;
    return recordGrailDiscovery(`unique:${uId}`, 'uniques', uName, {
      baseName: uniqueMatch?.base ?? def?.name,
      baseId: inst?.baseId,
      itemId,
      tier: uniqueMatch?.act ?? uniqueMatch?.tier ?? def?.tier ?? 1,
      slot: def?.slot,
      inst,
      def,
      meta,
    });
  }

  // 2. Check if Set item
  const setPieceMatch = findSetPieceInCatalog(name);
  if (setPieceMatch) {
    return recordGrailDiscovery(setPieceMatch.key, 'sets', setPieceMatch.name, {
      setId: setPieceMatch.setId,
      setName: setPieceMatch.setName,
      baseId: inst?.baseId,
      itemId,
      tier: setPieceMatch.tier,
      slot: def?.slot,
      inst,
      def,
      meta,
    });
  }

  // 3. Check if Runeword
  const runewordMatch = RUNEWORDS.find((rw) => rw.name.toLowerCase() === name.toLowerCase());
  if (runewordMatch || inst?.runeword) {
    const rwName = runewordMatch?.name ?? name;
    return recordGrailDiscovery(`runeword:${slug(rwName)}`, 'runewords', rwName, {
      baseId: inst?.baseId,
      itemId,
      slot: def?.slot,
      inst,
      def,
      meta,
    });
  }

  // 4. Check if Rune
  const runeMatch = ALL_RUNES.find(
    (r) => r.name.toLowerCase() === name.toLowerCase() || r.d2Name.toLowerCase() === name.toLowerCase(),
  );
  if (runeMatch) {
    return recordGrailDiscovery(`rune:${slug(runeMatch.name)}`, 'runewords', `${runeMatch.name} Rune`, {
      baseId: inst?.baseId,
      itemId,
      inst,
      def,
      meta,
    });
  }

  // 5. Fallback: Base Armory item
  const baseId = inst?.baseId ?? (itemId < ITEMS.length ? itemId : -1);
  if (baseId >= 0 && baseId < ITEMS.length) {
    return recordGrailDiscovery(`armory:${baseId}`, 'armory', ITEMS[baseId].name, {
      baseId,
      itemId,
      tier: ITEMS[baseId].tier,
      slot: ITEMS[baseId].slot,
      inst,
      def: def ?? ITEMS[baseId],
      meta,
    });
  }

  return null;
}

/**
 * Record an item discovery. Returns true if newly discovered in the legacy codex OR Grail v2,
 * or if a higher roll perfection was achieved.
 */
export function discoverItem(itemId: number, sim?: Sim, meta?: Partial<GrailDiscoveryMeta>): boolean {
  if (typeof itemId !== 'number' || itemId < 0) return false;

  let targetBaseId = itemId;
  let inst: any;
  let def: any;

  if (itemId >= DYNAMIC_ITEM_OFFSET) {
    inst = sim ? sim.instances.get(itemId) : undefined;
    def = getItemDef(itemId);
    if (inst) {
      targetBaseId = inst.baseId;
    } else if (def) {
      const baseIndex = ITEMS.findIndex((b) => b.slot === def.slot && b.tier === def.tier);
      targetBaseId = baseIndex >= 0 ? baseIndex : -1;
    } else {
      targetBaseId = -1;
    }
  } else {
    def = getItemDef(itemId);
  }

  // 1. Maintain legacy thornvael_codex_v1
  loadDiscovered();
  let newlyDiscoveredLegacy = false;
  if (targetBaseId >= 0 && targetBaseId < ITEMS.length) {
    if (!memoryDiscovered.has(targetBaseId)) {
      memoryDiscovered.add(targetBaseId);
      saveDiscovered(memoryDiscovered);
      newlyDiscoveredLegacy = true;
    }
  }

  // 2. Maintain canonical Grail v2
  const grailRes = recordGrailDiscoveryFromItem(itemId, inst, def, meta);

  if (newlyDiscoveredLegacy || grailRes?.isNew || grailRes?.isRollUpgrade) {
    for (const fn of listeners) {
      try {
        fn(targetBaseId >= 0 ? targetBaseId : itemId);
      } catch {
        // Ignore listener error
      }
    }
    return true;
  }

  return false;
}

/** Detailed Grail discovery for items. */
export function discoverGrailItem(
  itemId: number,
  sim?: Sim,
  meta?: Partial<GrailDiscoveryMeta>,
): DiscoveryResult | null {
  if (typeof itemId !== 'number' || itemId < 0) return null;
  const inst = sim ? sim.instances.get(itemId) : undefined;
  const def = getItemDef(itemId);
  // Also discover in legacy
  discoverItem(itemId, sim, meta);
  return recordGrailDiscoveryFromItem(itemId, inst, def, meta);
}

/** Explicitly discover a Unique item by ID or name. */
export function discoverUnique(uniqueIdOrName: string, meta?: Partial<GrailDiscoveryMeta>): DiscoveryResult {
  const match = findUniqueInCatalog(uniqueIdOrName, uniqueIdOrName);
  const key = match ? `unique:${match.id}` : `unique:${slug(uniqueIdOrName)}`;
  const name = match?.name ?? uniqueIdOrName;
  return recordGrailDiscovery(key, 'uniques', name, {
    baseName: match?.base,
    tier: match?.act ?? match?.tier ?? 1,
    meta,
  });
}

/** Explicitly discover a Set piece by set name and piece name, or directly by piece name. */
export function discoverSetPiece(
  setNameOrPieceName: string,
  pieceNameOrMeta?: string | Partial<GrailDiscoveryMeta>,
  meta?: Partial<GrailDiscoveryMeta>,
): DiscoveryResult {
  let setName = setNameOrPieceName;
  let pieceName = typeof pieceNameOrMeta === 'string' ? pieceNameOrMeta : setNameOrPieceName;
  const actualMeta = typeof pieceNameOrMeta === 'object' && pieceNameOrMeta !== null ? pieceNameOrMeta : meta;

  const match = findSetPieceInCatalog(pieceName) ?? findSetPieceInCatalog(setNameOrPieceName);
  if (match) {
    setName = match.setName;
    pieceName = match.name;
  }
  const key = match ? match.key : `set:${slug(setName)}:${slug(pieceName)}`;
  return recordGrailDiscovery(key, 'sets', match?.name ?? pieceName, {
    setId: match?.setId ?? slug(setName),
    setName: match?.setName ?? setName,
    tier: match?.tier ?? 1,
    meta: actualMeta,
  });
}

/** Explicitly discover a completed Runeword. */
export function discoverRuneword(runewordName: string, meta?: Partial<GrailDiscoveryMeta>): DiscoveryResult {
  const match = RUNEWORDS.find((rw) => rw.name.toLowerCase() === runewordName.toLowerCase());
  const name = match?.name ?? runewordName;
  const key = `runeword:${slug(name)}`;
  return recordGrailDiscovery(key, 'runewords', name, {
    tier: match ? (match.clvl <= 25 ? 1 : match.clvl <= 45 ? 2 : 3) : 1,
    meta,
  });
}

/** Explicitly discover a Rune by name or ID (1..33). */
export function discoverRune(runeNameOrId: string | number, meta?: Partial<GrailDiscoveryMeta>): DiscoveryResult {
  const r = typeof runeNameOrId === 'number' ? getRuneById(runeNameOrId) : getRuneByName(runeNameOrId);
  const name = r ? `${r.name} (${r.d2Name})` : String(runeNameOrId);
  const key = `rune:${slug(r?.d2Name ?? String(runeNameOrId))}`;
  return recordGrailDiscovery(key, 'runewords', name, {
    tier: r ? (r.id <= 10 ? 1 : r.id <= 20 ? 2 : 3) : 1,
    meta,
  });
}

/** Explicitly discover a Boss Trophy seal. */
export function discoverBossTrophy(
  bossId: string,
  difficulty = 'Normal',
  meta?: Partial<GrailDiscoveryMeta>,
): DiscoveryResult {
  const b = ACT_BOSS_TROPHIES.find((x) => x.id === bossId);
  const su = getSuperUniqueById(bossId);
  const name = b ? `${b.name} Trophy Seal` : su ? `${su.name} Trophy Seal` : `${bossId} Trophy Seal`;
  const act = b?.act ?? su?.act ?? 1;
  const key = `trophy:${slug(bossId)}`;
  return recordGrailDiscovery(key, 'trophies', name, {
    tier: act,
    meta: {
      ...meta,
      missionName: meta?.missionName ?? `${difficulty} Campaign`,
    },
  });
}

/** Check whether a specific item, unique, set, runeword, or trophy has been discovered. */
export function isGrailDiscovered(keyOrItemId: string | number, sim?: Sim): boolean {
  loadGrailEntries();
  if (typeof keyOrItemId === 'string') {
    return memoryGrail.has(keyOrItemId);
  }

  // Number: check if it's dynamic
  if (keyOrItemId >= DYNAMIC_ITEM_OFFSET) {
    const inst = sim ? sim.instances.get(keyOrItemId) : undefined;
    const def = getItemDef(keyOrItemId);
    const name = inst?.name ?? def?.name;
    if (name) {
      const u = findUniqueInCatalog(undefined, name);
      if (u && memoryGrail.has(`unique:${u.id}`)) return true;
      const sp = findSetPieceInCatalog(name);
      if (sp && memoryGrail.has(sp.key)) return true;
      const rw = RUNEWORDS.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (rw && memoryGrail.has(`runeword:${slug(rw.name)}`)) return true;
    }
    const baseId = inst?.baseId ?? -1;
    if (baseId >= 0 && (memoryGrail.has(`armory:${baseId}`) || memoryDiscovered.has(baseId))) return true;
    return false;
  }

  // Static item id
  return memoryGrail.has(`armory:${keyOrItemId}`) || isDiscovered(keyOrItemId);
}

/** Check whether a specific item has been discovered (legacy). */
export function isDiscovered(itemId: number): boolean {
  loadDiscovered();
  return memoryDiscovered.has(itemId);
}

/** Calculate overall Hall of Relics completion progress (legacy). */
export function getCodexProgress(): { discovered: number; total: number; pct: number } {
  loadDiscovered();
  const total = ITEMS.length;
  const discovered = [...memoryDiscovered].filter((id) => id < total).length;
  const pct = total > 0 ? Math.round((discovered / total) * 100) : 0;
  return { discovered, total, pct };
}

/** Return target-farming clue for any catalog item or canonical key. */
export function getGrailDropClue(entryOrKey: GrailCatalogItem | string): string {
  const item = typeof entryOrKey === 'string' ? getGrailCatalogItem(entryOrKey) : entryOrKey;
  if (!item) return 'Rumored relic lost in the deep vaults of Thornvael.';
  if (item.clue) return item.clue;

  switch (item.tome) {
    case 'uniques': {
      if (item.dropFrom) {
        return `Target Farm: Dropped by ${item.dropFrom.replace(/-/g, ' ')} in Act ${item.act ?? 1}.`;
      }
      const act = item.act ?? item.tier ?? 1;
      const actNames: Record<number, string> = {
        1: 'Act 1: Border Fords & Weeping Ossuary',
        2: 'Act 2: Redmarsh Wastes & Sunken Cisterns',
        3: 'Act 3: Iron Coast & Drowned Citadel',
        4: 'Act 4: Obsidian Caldera & Cinder Throne',
      };
      return `Target Farm: ${actNames[act] ?? `Act ${act}`} chests, elite champions, and dungeon bosses.`;
    }
    case 'sets': {
      const act = item.act ?? item.tier ?? 1;
      return `Target Farm: Part of ${item.setName ?? 'Sacred Set'}. Dropped by Act ${act} champions and reliquary caches.`;
    }
    case 'runewords': {
      if (item.runes && item.runes.length > 0) {
        return `Horadric Runeword: Socket ${item.runes.join(' + ')} into an open-socketed ${item.slot ?? 'item'}.`;
      }
      return `Target Farm: Runes drop from Countess, tombstones, and Act ${item.tier ?? 1}+ elite packs.`;
    }
    case 'trophies': {
      return `Target Farm: Slay ${item.name.replace(/ Trophy Seal$/, '')} in Act ${item.act ?? 1} on any difficulty.`;
    }
    case 'armory': {
      return `Target Farm: Common military base equipment from Act ${item.tier ?? 1} vendors, weapon racks, and crates.`;
    }
  }
}

/** Get list of up to 3 pinned Grail targets. */
export function getPinnedGrailTargets(): string[] {
  if (memoryPins) return [...memoryPins];
  const store = getStorage();
  if (!store) {
    memoryPins = [];
    return [];
  }
  try {
    const raw = store.getItem(GRAIL_PINS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryPins = parsed.filter((k) => typeof k === 'string').slice(0, 3);
        return [...memoryPins];
      }
    }
  } catch {
    // Malformed fallback
  }
  memoryPins = [];
  return [];
}

/** Toggle pin status for a Grail target (max 3 pinned targets). */
export function togglePinGrailTarget(grailKey: string): boolean {
  if (!grailKey) return false;
  const pins = getPinnedGrailTargets();
  const idx = pins.indexOf(grailKey);
  const store = getStorage();
  if (idx >= 0) {
    pins.splice(idx, 1);
    memoryPins = pins;
    if (store) {
      try {
        store.setItem(GRAIL_PINS_KEY, JSON.stringify(pins));
      } catch {
        // Storage error
      }
    }
    return false;
  }
  if (pins.length >= 3) {
    return false; // Limit of 3 pins reached
  }
  pins.push(grailKey);
  memoryPins = pins;
  if (store) {
    try {
      store.setItem(GRAIL_PINS_KEY, JSON.stringify(pins));
    } catch {
      // Storage error
    }
  }
  return true;
}

/** Check if a specific Grail target is currently pinned. */
export function isGrailTargetPinned(grailKey: string): boolean {
  return getPinnedGrailTargets().includes(grailKey);
}

/** Calculate account-wide Holy Grail completion progress and active boons. */
export function getGrailMilestoneBoons(): GrailMilestoneBoons {
  loadGrailEntries();
  const catalog = getGrailCatalog();
  const totalCount = catalog.length;
  const discoveredCount = memoryGrail.size;
  const pct = totalCount > 0 ? Math.round((discoveredCount / totalCount) * 100) : 0;

  let mfBonus = 0;
  if (pct >= 75) mfBonus = 30;
  else if (pct >= 50) mfBonus = 18;
  else if (pct >= 10) mfBonus = 8;

  const smartGrailPityBias = pct >= 25 ? 0.25 : 0;
  const canForgeReplica = pct >= 50;
  const unlockedGrailBounties = pct >= 75;
  const hasSovereignCrown = pct >= 100;

  let title = 'Initiate of the Archives';
  if (pct >= 100) title = 'Sovereign of the Holy Grail';
  else if (pct >= 75) title = 'Chronicler of the Crown';
  else if (pct >= 50) title = 'Grand Antiquarian';
  else if (pct >= 25) title = 'Keeper of the Vault';
  else if (pct >= 10) title = 'Seeker of Relics';

  let nextMilestonePct = 10;
  if (pct >= 100) nextMilestonePct = 100;
  else if (pct >= 75) nextMilestonePct = 100;
  else if (pct >= 50) nextMilestonePct = 75;
  else if (pct >= 25) nextMilestonePct = 50;
  else if (pct >= 10) nextMilestonePct = 25;

  const targetCount = Math.ceil((nextMilestonePct / 100) * totalCount);
  const toNextMilestone = Math.max(0, targetCount - discoveredCount);

  // Per-tome progress breakdown
  const uniquesTotal = getGrailCatalogByTome('uniques').length;
  const uniquesDiscovered = [...memoryGrail.values()].filter((e) => e.tome === 'uniques').length;

  const setsTotalPieces = getGrailCatalogByTome('sets').length;
  const setsDiscoveredPieces = [...memoryGrail.values()].filter((e) => e.tome === 'sets').length;
  let setsCompleted = 0;
  const allSetIds = getAllSetIds();
  for (const sId of allSetIds) {
    const sp = getSetProgress(sId);
    if (sp.isComplete) setsCompleted++;
  }

  const runewordsTotal = getGrailCatalogByTome('runewords').length;
  const runewordsDiscovered = [...memoryGrail.values()].filter((e) => e.tome === 'runewords').length;

  const trophiesTotal = getGrailCatalogByTome('trophies').length;
  const trophiesDiscovered = [...memoryGrail.values()].filter((e) => e.tome === 'trophies').length;

  const armoryTotal = getGrailCatalogByTome('armory').length;
  const armoryDiscovered = [...memoryGrail.values()].filter((e) => e.tome === 'armory').length;

  return {
    totalCount,
    discoveredCount,
    pct,
    mfBonus,
    smartGrailPityBias,
    canForgeReplica,
    unlockedGrailBounties,
    hasSovereignCrown,
    title,
    nextMilestonePct,
    toNextMilestone,
    uniquesProgress: {
      discovered: uniquesDiscovered,
      total: uniquesTotal,
      pct: uniquesTotal > 0 ? Math.round((uniquesDiscovered / uniquesTotal) * 100) : 0,
    },
    setsProgress: {
      discovered: setsDiscoveredPieces,
      total: setsTotalPieces,
      pct: setsTotalPieces > 0 ? Math.round((setsDiscoveredPieces / setsTotalPieces) * 100) : 0,
      setsCompleted,
      totalSets: allSetIds.length,
    },
    runewordsProgress: {
      discovered: runewordsDiscovered,
      total: runewordsTotal,
      pct: runewordsTotal > 0 ? Math.round((runewordsDiscovered / runewordsTotal) * 100) : 0,
    },
    trophiesProgress: {
      discovered: trophiesDiscovered,
      total: trophiesTotal,
      pct: trophiesTotal > 0 ? Math.round((trophiesDiscovered / trophiesTotal) * 100) : 0,
    },
    armoryProgress: {
      discovered: armoryDiscovered,
      total: armoryTotal,
      pct: armoryTotal > 0 ? Math.round((armoryDiscovered / armoryTotal) * 100) : 0,
    },
  };
}

/** Export entire Grail v2 state as a JSON string for save export / cross-device transfer. */
export function exportGrailState(): string {
  loadDiscovered();
  loadGrailEntries();
  const pins = getPinnedGrailTargets();
  const state = {
    version: 2,
    exportedAt: Date.now(),
    legacy: [...memoryDiscovered],
    grail: [...memoryGrail.values()],
    pins,
  };
  return JSON.stringify(state, null, 2);
}

/** Import and merge a Grail v2 state from a JSON string. */
export function importGrailState(jsonStr: string): boolean {
  if (!jsonStr) return false;
  try {
    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== 'object') return false;
    loadDiscovered();
    loadGrailEntries();

    // 1. Merge legacy IDs
    if (Array.isArray(data.legacy)) {
      for (const id of data.legacy) {
        if (typeof id === 'number' && id >= 0) {
          memoryDiscovered.add(id);
        }
      }
      saveDiscovered(memoryDiscovered);
    }

    // 2. Merge Grail entries (keeping higher roll perfection on conflict)
    if (Array.isArray(data.grail)) {
      for (const entry of data.grail) {
        if (entry && typeof entry.key === 'string') {
          const current = memoryGrail.get(entry.key);
          if (
            !current ||
            (typeof entry.rollPerfectionPct === 'number' && entry.rollPerfectionPct > current.rollPerfectionPct)
          ) {
            memoryGrail.set(entry.key, {
              ...entry,
              count: (current?.count || 0) + (entry.count || 1),
            });
          }
        }
      }
      saveGrailEntries(memoryGrail);
    }

    // 3. Merge pins
    if (Array.isArray(data.pins)) {
      const pins = data.pins.filter((k: any) => typeof k === 'string').slice(0, 3);
      memoryPins = pins;
      const store = getStorage();
      if (store) {
        try {
          store.setItem(GRAIL_PINS_KEY, JSON.stringify(pins));
        } catch {
          // Storage error
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

/** Hard reset all Grail and legacy codex discoveries (for tests and resets). */
export function resetCodex(): void {
  memoryDiscovered.clear();
  memoryGrail.clear();
  memoryPins = [];
  const store = getStorage();
  if (store) {
    try {
      store.removeItem(CODEX_STORAGE_KEY);
      store.removeItem(GRAIL_STORAGE_KEY);
      store.removeItem(GRAIL_PINS_KEY);
    } catch {
      // Ignore
    }
  }
}

export const resetGrail = resetCodex;

/** Synchronous bundled fallback of all 52 unit & boss bestiary lore entries (`public/data/text/bestiary-52.json`). */
export const BUNDLED_BESTIARY: readonly BestiaryEntry[] = [
  {
    id: 'anvilmaw-smith',
    nameKey: 'bestiary.anvilmaw-smith.name',
    name: 'Anvilmaw Smith',
    loreKey: 'bestiary.anvilmaw-smith.lore',
    lore: 'Forged from slag-iron and chained to geothermal floor-vents, these lumbering constructs hammer fallen shields back into caldera armor. Their furnace chests hiss with sulfur brine before every crushing overhead blow.',
    weakness: 'Frost magic and kiting between heavy hammer swings.',
  },
  {
    id: 'archer',
    nameKey: 'bestiary.archer.name',
    name: 'Frontier Marksman',
    loreKey: 'bestiary.archer.lore',
    lore: 'Trained on the sleet-swept palisades of Thornwick, frontier marksmen keep their bowstrings waxed with mutton tallow and count every bodkin arrow against their pay. In open skirmishes they pick off casters before closing ranks.',
    weakness: 'Fast cavalry or pack rushers that close the gap.',
  },
  {
    id: 'ash-weaver',
    nameKey: 'bestiary.ash-weaver.name',
    name: 'Ash Weaver',
    loreKey: 'bestiary.ash-weaver.lore',
    lore: 'Disgraced arcanists of the Caldera Schism who stitched copper grounding-wire into their own robes to channel magma pressure. They unravel ward-lines from afar, leaving scorched ozone and brittle cinder in their wake.',
    weakness: 'Interrupting casts and closing into melee range.',
  },
  {
    id: 'ashkarath',
    nameKey: 'bestiary.ashkarath.name',
    name: 'Ashkarath, the Cinder King',
    loreKey: 'bestiary.ashkarath.lore',
    lore: 'First Warden of the Seven Anchor Seals, Ashkarath has stood watch over the Obsidian Dais for four centuries as his flesh calcified into meteoric slag. He burns all challengers to keep the Primordial Ember from consuming the northern realm.',
    weakness: 'Frost damage, disciplined dispersion against fire rings, and focus fire during vents.',
  },
  {
    id: 'basalt-brute',
    nameKey: 'bestiary.basalt-brute.name',
    name: 'Basalt Brute',
    loreKey: 'bestiary.basalt-brute.lore',
    lore: 'Quarried from volcanic fault-lines and animated by third-dynasty telluric wedges, a basalt brute feels neither cold nor blade-nick. Its stone fists shatter shield walls like dry slate.',
    weakness: 'Arcane and lightning spells that crack its mineral seams.',
  },
  {
    id: 'briar-hound',
    nameKey: 'bestiary.briar-hound.name',
    name: 'Briar Hound',
    loreKey: 'bestiary.briar-hound.lore',
    lore: 'Lean, thorn-matted curs that hunt the bog-iron ditches along the Alder River in starving packs. They scent spilled tallow and bloodied bandages from half a league downwind.',
    weakness: 'Sweeping melee cleaves and fire.',
  },
  {
    id: 'cinder-shaman',
    nameKey: 'bestiary.cinder-shaman.name',
    name: 'Cinder Shaman',
    loreKey: 'bestiary.cinder-shaman.lore',
    lore: 'Hunched pyromancers who carry clay braziers of peat-charcoal to ignite ambush lines in damp timberlands. Once their kind falls, scattered warbands lose both cohesion and torchlight.',
    weakness: 'Frost bolts and early sniping before they rally allies.',
  },
  {
    id: 'cinderhorn',
    nameKey: 'bestiary.cinderhorn.name',
    name: 'Cinderhorn',
    loreKey: 'bestiary.cinderhorn.lore',
    lore: 'Horned beasts born in the sulfurous vents beneath the Gauntlet of Iron, their ribs glowing like banked forge coals. They charge through smoke clouds and exhale superheated grit.',
    weakness: 'Cold magic and armored frontliners holding choke points.',
  },
  {
    id: 'cinderling',
    nameKey: 'bestiary.cinderling.name',
    name: 'Cinderling',
    loreKey: 'bestiary.cinderling.lore',
    lore: 'Skittering sparks given sinew around cracked ley-valves, cinderlings swarm overpowder wagons and dry thatch. A single crushed ember-sac scatters harmlessly, yet dozens overwhelm careless squads.',
    weakness: 'Area-of-effect frost and water-soaked wards.',
  },
  {
    id: 'claw-viper',
    nameKey: 'bestiary.claw-viper.name',
    name: 'Scale Viper',
    loreKey: 'bestiary.claw-viper.lore',
    lore: 'Alkali-crusted serpents that coil beneath sun-baked limestone slabs along the Redmarsh causeways. Their hooked fangs inject a coagulant venom that turns blood to silt within minutes.',
    weakness: 'Fire and ranged volleys before they close to strike.',
  },
  {
    id: 'crowned-maw',
    nameKey: 'bestiary.crowned-maw.name',
    name: 'Crowned Maw',
    loreKey: 'bestiary.crowned-maw.lore',
    lore: 'Crested apex predators of the high basalt ridges, scarred by decades of territorial duels over hot-spring carrion. Their jagged jaws snap bronze greaves in a single lunge.',
    weakness: 'Stuns, slow effects, and concentrated ranged fire.',
  },
  {
    id: 'doom-knight',
    nameKey: 'bestiary.doom-knight.name',
    name: 'Dread Knight',
    loreKey: 'bestiary.doom-knight.lore',
    lore: 'Oath-bound champions of the First Watch whose plates were riveted shut after the Caldera Schism. They march in dead silence, answering only to iron-stamped probate warrants.',
    weakness: 'Armor-piercing spells and sustained lightning arcs.',
  },
  {
    id: 'dune-beast',
    nameKey: 'bestiary.dune-beast.name',
    name: 'Dune Beast',
    loreKey: 'bestiary.dune-beast.lore',
    lore: "Broad-pawed stalkers of the evaporated inland sea, capable of bounding across shifting salt-crusts without sinking. Caravaneers hang copper bells on their mules to warn of a pack's approach.",
    weakness: 'Earth-binding slows and disciplined spear formations.',
  },
  {
    id: 'dune-lurker',
    nameKey: 'bestiary.dune-lurker.name',
    name: 'Dune Lurker',
    loreKey: 'bestiary.dune-lurker.lore',
    lore: 'Scavengers wrapped in salt-stiffened hides who bury themselves beside dry cisterns to ambush stray outriders. They strip canteens and copper fittings before dragging bodies into the scree.',
    weakness: 'Area sweeps and keeping scouts ahead of the column.',
  },
  {
    id: 'dune-scarab',
    nameKey: 'bestiary.dune-scarab.name',
    name: 'Dune Scarab',
    loreKey: 'bestiary.dune-scarab.lore',
    lore: 'Carapaced beetles that graze on vitrified slag near shattered quartz wardstones, storing static charge in their wing-cases. When cracked open, they vent sharp arcs of blue lightning.',
    weakness: 'Ranged attacks that avoid close-quarters static bursts.',
  },
  {
    id: 'fallen-shaman',
    nameKey: 'bestiary.fallen-shaman.name',
    name: 'Ash-Tongue Shaman',
    loreKey: 'bestiary.fallen-shaman.lore',
    lore: 'Outcast ritualists who barter salt-rations for stolen mint copper and chant over bone talismans in ruined tollhouses. Their firebolts blister wet leather and panic poorly trained levies.',
    weakness: 'Quick flanking strikes and silencing magic.',
  },
  {
    id: 'fetish-blowdart',
    nameKey: 'bestiary.fetish-blowdart.name',
    name: 'Bog Dartblower',
    loreKey: 'bestiary.fetish-blowdart.lore',
    lore: 'Wiry reed-hunters of the coastal fens who dip bone needles in fermented marsh-toad bile. They dart between sunken pilings, bleeding armored soldiers through visor slits.',
    weakness: 'Wide-arc melee attacks and fire.',
  },
  {
    id: 'flintback',
    nameKey: 'bestiary.flintback.name',
    name: 'Flintback',
    loreKey: 'bestiary.flintback.lore',
    lore: 'Thick-shelled mire beasts whose dorsal plates spark when struck by steel, earning their name from desperate border pickets. They anchor enemy lines while lighter scavengers flank.',
    weakness: 'Elemental magic that bypasses heavy physical plating.',
  },
  {
    id: 'frost-bell',
    nameKey: 'bestiary.frost-bell.name',
    name: 'Frost Bell',
    loreKey: 'bestiary.frost-bell.lore',
    lore: 'Hollow bronze resonators torn from drowned coastal belfries and hung with rime-crusted telluric wire. Every chime drains warmth from the air and numbs bow-hands.',
    weakness: 'Fire spells and shattering blunt weapons.',
  },
  {
    id: 'glasswing',
    nameKey: 'bestiary.glasswing.name',
    name: 'Glasswing',
    loreKey: 'bestiary.glasswing.lore',
    lore: 'Translucent coastal flyers whose wings hum like taut copper wire in storm squalls. They dive out of sea-fog to slash exposed necks and scatter pack animals.',
    weakness: 'Ranged archers and rapid lightning strikes.',
  },
  {
    id: 'gloom-stag',
    nameKey: 'bestiary.gloom-stag.name',
    name: 'Gloom Stag',
    loreKey: 'bestiary.gloom-stag.lore',
    lore: 'Gaunt antlered beasts of the Greywood timberlands, their racks draped in black moss and corroded iron snares. Driven mad by winter starvation, they gore loggers and patrols alike.',
    weakness: 'Fire and braced polearms.',
  },
  {
    id: 'gnoll',
    nameKey: 'bestiary.gnoll.name',
    name: 'Border Gnoll',
    loreKey: 'bestiary.gnoll.lore',
    lore: 'Hired by Morvessa with stamped mint copper, these hunched raiders haunt the Sunken Ford and Alder River toll-roads. They fight viciously for looted rations but break when their chieftains fall.',
    weakness: 'Disciplined melee lines and targeting pack leaders.',
  },
  {
    id: 'golem',
    nameKey: 'bestiary.golem.name',
    name: 'Wardstone Golem',
    loreKey: 'bestiary.golem.lore',
    lore: 'A towering frame of quarried granite bound with copper bands and calibrated quartz lenses by Conclave artificers. Built to absorb siege bolts, it marches without fatigue or fear.',
    weakness: 'Sustained lightning and high-tier armor-piercing strikes.',
  },
  {
    id: 'gorrathul',
    nameKey: 'bestiary.gorrathul.name',
    name: 'Gorrathul, the Sand Glutton',
    loreKey: 'bestiary.gorrathul.lore',
    lore: 'Castellan of Ironheart Bastion, Gorrathul locked the mountain sluices and starved the salt-parishes to hide that his legendary cisterns silted dry years ago. Swollen with alkali brine and ancient wards, he crushes any army climbing the twin causeways.',
    weakness: 'Fire damage, mobility to evade subterranean charges, and breaking his freeze aura.',
  },
  {
    id: 'greater-mummy',
    nameKey: 'bestiary.greater-mummy.name',
    name: 'Crypt Embalmer',
    loreKey: 'bestiary.greater-mummy.lore',
    lore: 'Third-Dynasty probate bailiffs preserved in bitumen and copper-wire shrouds to audit unpaid granary liens beyond death. They raise fallen debtors until their tally-tablets are shattered.',
    weakness: 'Fire that ignites their pitch-soaked wrappings.',
  },
  {
    id: 'hollow-king',
    nameKey: 'bestiary.hollow-king.name',
    name: 'Hollow King',
    loreKey: 'bestiary.hollow-king.lore',
    lore: 'Crowned remnants of sovereigns who defaulted on the caldera maintenance tithe and were beheaded in iron collars. Cold frost bleeds from their empty ribcages with every sweeping greatsword arc.',
    weakness: 'Fire magic and kiting during heavy swings.',
  },
  {
    id: 'hollow-knight',
    nameKey: 'bestiary.hollow-knight.name',
    name: 'Hollow Knight',
    loreKey: 'bestiary.hollow-knight.lore',
    lore: 'Indebted men-at-arms whose skeletons remain legally bound to guard ossuary gates under Probate Debt Law. Rusted mail still clings to their ribs, rattling in strict formation.',
    weakness: 'Blunt crushing weapons and fire.',
  },
  {
    id: 'imp',
    nameKey: 'bestiary.imp.name',
    name: 'Spite Imp',
    loreKey: 'bestiary.imp.lore',
    lore: 'Wiry, soot-stained familiars conjured from unstable telluric vents to harass supply trains and siphon lamp oil. They cackle from rooftops and fling sparks before darting out of reach.',
    weakness: 'Frost bolts and fast ranged volleys.',
  },
  {
    id: 'ironbark',
    nameKey: 'bestiary.ironbark.name',
    name: 'Ironbark',
    loreKey: 'bestiary.ironbark.lore',
    lore: 'Centuries-old oaks rooted over bog-iron seams, their sap thickened with mineral ore until axes ring uselessly against their trunks. They awaken only when wildfires or warbands threaten deep groves.',
    weakness: 'Fire magic and sustained slashing blows.',
  },
  {
    id: 'lantern-eel',
    nameKey: 'bestiary.lantern-eel.name',
    name: 'Lantern Eel',
    loreKey: 'bestiary.lantern-eel.lore',
    lore: 'Blind, pale eels that drift above flooded canal locks, lured by the telluric hum of copper sluice-chains. Their jawless mouths discharge stored static bolts across wet stone.',
    weakness: 'Earth-based strikes and insulated ranged attacks.',
  },
  {
    id: 'mage',
    nameKey: 'bestiary.mage.name',
    name: 'Conclave Arcanist',
    loreKey: 'bestiary.mage.lore',
    lore: 'Trained in the expelled Thermodynamic Conclave, these scholars carry copper grounding-staves and smoked quartz lenses. They treat every spell as a high-pressure valve waiting to burst.',
    weakness: 'Ambushes and fast melee rushers that break their concentration.',
  },
  {
    id: 'maggot-swarm',
    nameKey: 'bestiary.maggot-swarm.name',
    name: 'Maggot Swarm',
    loreKey: 'bestiary.maggot-swarm.lore',
    lore: 'Blind, bloated larvae breeding in the rank sump-pits beneath Deep Quarry and Redmarsh tombs. Though slow individually, their corrosive bile eats through boot leather in seconds.',
    weakness: 'Area-of-effect fire and sweeping attacks.',
  },
  {
    id: 'mire-wisp',
    nameKey: 'bestiary.mire-wisp.name',
    name: 'Mire Wisp',
    loreKey: 'bestiary.mire-wisp.lore',
    lore: 'Pocketed marsh-gas ignited by stray ley currents above peat bogs and flooded ditches. Travelers who mistake their pale glow for watch-lanterns rarely find dry footing again.',
    weakness: 'Physical arrows and non-elemental strikes.',
  },
  {
    id: 'morvessa',
    nameKey: 'bestiary.morvessa.name',
    name: 'Morvessa, the Silk Widow',
    loreKey: 'bestiary.morvessa.lore',
    lore: 'High Quartermaster of the Salt Tithe, Morvessa burned the Thornwick Border Mint to conceal shaved silver groats and bred a parasitic silk-brood in the Weeping Ossuary. She audits living and dead alike with gall-ink writs and venom.',
    weakness: 'Fire magic, cleansing poison quickly, and bursting down hatched broodlings.',
  },
  {
    id: 'night-orchard',
    nameKey: 'bestiary.night-orchard.name',
    name: 'Night Orchard',
    loreKey: 'bestiary.night-orchard.lore',
    lore: 'Gnarled, leafless fruit trees fertilized by coastal battlefields and draped in hex-knots of salted twine. Their roots drink spilled blood and spit shadowy thorns at trespassers.',
    weakness: 'Fire and heavy axes.',
  },
  {
    id: 'pale-burrower',
    nameKey: 'bestiary.pale-burrower.name',
    name: 'Pale Burrower',
    loreKey: 'bestiary.pale-burrower.lore',
    lore: 'Sightless subterranean crawlers unearthed when chained miners cut too deep into ironstone seams. Their chitinous foreclaws shear through timber pit-props as easily as bone.',
    weakness: 'Fire and frost slowing their burrowing lunge.',
  },
  {
    id: 'quill-fiend',
    nameKey: 'bestiary.quill-fiend.name',
    name: 'Quill Fiend',
    loreKey: 'bestiary.quill-fiend.lore',
    lore: 'Bristled scavengers that nest in felled brushwood along the border marches, flicking barbed spines with whip-like snaps of their backs. Scouts check tree-lines twice before crossing open clearings.',
    weakness: 'Shielded frontliners and closing into melee.',
  },
  {
    id: 'redglass-drake',
    nameKey: 'bestiary.redglass-drake.name',
    name: 'Redglass Drake',
    loreKey: 'bestiary.redglass-drake.lore',
    lore: 'Winged lizards whose scales fuse with airborne volcanic silica, catching torchlight like stained glass. They roost on basalt spires and rain molten cinders onto marching columns.',
    weakness: 'Frost magic and concentrated ranged volleys.',
  },
  {
    id: 'rift-moth',
    nameKey: 'bestiary.rift-moth.name',
    name: 'Rift Moth',
    loreKey: 'bestiary.rift-moth.lore',
    lore: 'Velvet-winged moths drawn to open ley-fissures and fractured wardstones, drinking ambient mana like nectar. Their dusted wings leave a numbing static across sword-arms.',
    weakness: 'Physical projectiles and fire.',
  },
  {
    id: 'rootbound',
    nameKey: 'bestiary.rootbound.name',
    name: 'Rootbound',
    loreKey: 'bestiary.rootbound.lore',
    lore: 'Shattered boundary stones entangled in living ash-roots and bound by old First Compact oaths. They guard forgotten forest trails long after the lords who raised them turned to dust.',
    weakness: 'Fire and lightning.',
  },
  {
    id: 'ruin-mite',
    nameKey: 'bestiary.ruin-mite.name',
    name: 'Ruin Mite',
    loreKey: 'bestiary.ruin-mite.lore',
    lore: 'Fist-sized parasites infesting damp masonry in burned tollhouses and sunken vaults. Alone they are a nuisance; in swarms they strip a fallen soldier to clean bone before dawn.',
    weakness: 'Area damage and fire.',
  },
  {
    id: 'salt-crab',
    nameKey: 'bestiary.salt-crab.name',
    name: 'Salt Crab',
    loreKey: 'bestiary.salt-crab.lore',
    lore: "Armored crustaceans swollen to the size of millstones along Oakhaven's whale-oil breakwaters. Their calcified shells turn aside careless sword cuts while their pincers crush boat hulls.",
    weakness: 'Blunt trauma and lightning conducted through wet shells.',
  },
  {
    id: 'sand-raider',
    nameKey: 'bestiary.sand-raider.name',
    name: 'Sand Raider',
    loreKey: 'bestiary.sand-raider.lore',
    lore: 'Deserters and salt-exiles armed with twin curved blades who prey on water-convoys crossing the Redmarsh flats. They strike fast at dusk and vanish into alkali squalls.',
    weakness: 'Frost slows and braced armored troops.',
  },
  {
    id: 'silt-colossus',
    nameKey: 'bestiary.silt-colossus.name',
    name: 'Silt Colossus',
    loreKey: 'bestiary.silt-colossus.lore',
    lore: 'Massive harbor-dredge automatons choked with river-mud and drowned chain links inside the Sunken Citadel. Each lumbering step shakes wet flagstones and crushes anything beneath its iron heels.',
    weakness: 'Lightning magic and kiting around slow swing animations.',
  },
  {
    id: 'spore-matron',
    nameKey: 'bestiary.spore-matron.name',
    name: 'Spore Matron',
    loreKey: 'bestiary.spore-matron.lore',
    lore: "Blighted fungal elders rooted in the dampest galleries of Redmarsh's undervaults, exhaling yellow clouds of choking rot. Miners seal side-tunnels with tallow-soaked planks at the first sign of their caps.",
    weakness: 'Fire and ranged bursts from upwind.',
  },
  {
    id: 'storm-kite',
    nameKey: 'bestiary.storm-kite.name',
    name: 'Storm Kite',
    loreKey: 'bestiary.storm-kite.lore',
    lore: 'Razor-winged sea-raptors that ride gale-force squalls above the Iron Coast, gathering static charge in their bronze-flecked plumage. They wheel just out of sword-reach and loose jagged arcs.',
    weakness: 'Archers and earth-grounded wards.',
  },
  {
    id: 'stormtree',
    nameKey: 'bestiary.stormtree.name',
    name: 'Stormtree',
    loreKey: 'bestiary.stormtree.lore',
    lore: "Lightning-split coastal pines whose charred heartwood still crackles with trapped atmospheric charge. Approaching within ten paces raises the hair on a soldier's neck before the branches strike.",
    weakness: 'Fire and ranged focus outside static discharge range.',
  },
  {
    id: 'thorn-boar',
    nameKey: 'bestiary.thorn-boar.name',
    name: 'Thorn Boar',
    loreKey: 'bestiary.thorn-boar.lore',
    lore: 'Tusks notched by rusty arrowheads, these scarred boars barrel through bramble thickets along the Greywood logging tracks. Their thick hides turn aside light glancing shots.',
    weakness: 'Spears, heavy strikes, and fire.',
  },
  {
    id: 'vesperion',
    nameKey: 'bestiary.vesperion.name',
    name: 'Vesperion, the Hollow Choir',
    loreKey: 'bestiary.vesperion.lore',
    lore: "Lord Admiral of the Black Fleet, Vesperion torched Oakhaven's drydocks in a ruthless quarantine to stop mainland armies from shattering the southern caldera seals. Drowned mariners sing in his wake as lightning arcs from his flagship's copper hull.",
    weakness: 'Spread formations against ball lightning and high mana reserves to endure Soul Siphon.',
  },
  {
    id: 'warrior',
    nameKey: 'bestiary.warrior.name',
    name: 'Vanguard Man-at-Arms',
    loreKey: 'bestiary.warrior.lore',
    lore: 'Stalwart sellswords of the northern frontier who value dry bowstrings, honest silver groats, and unbroken shield lines. They hold the breach while arcanists vent telluric fire behind them.',
    weakness: 'Ranged kiting and sustained elemental magic.',
  },
  {
    id: 'wendigo-bruiser',
    nameKey: 'bestiary.wendigo-bruiser.name',
    name: 'Frosthorn Bruiser',
    loreKey: 'bestiary.wendigo-bruiser.lore',
    lore: 'Hulking mountain beasts driven down from alpine snowlines by four centuries of cooling winters. Frost cakes their matted shoulders, slowing the blood of any warrior caught in their grip.',
    weakness: 'Fire magic and keeping distance.',
  },
  {
    id: 'witch-doctor',
    nameKey: 'bestiary.witch-doctor.name',
    name: 'Fen Hexer',
    loreKey: 'bestiary.witch-doctor.lore',
    lore: "Masked marsh elders who brew bitter root-tonics and bind copper-wire fetishes to ward off coastal press-gangs. Their curses rot leather straps and sap a company's endurance.",
    weakness: 'Immediate focus fire and stun effects.',
  },
];

let activeBestiary: readonly BestiaryEntry[] = BUNDLED_BESTIARY;

/**
 * Hydrate the 52-entry bestiary lore cache from `public/data/text/bestiary-52.json`,
 * preserving the synchronous bundled fallback when offline or unavailable.
 */
export async function hydrateCodexBestiary(baseUrl?: string, fetcher?: JsonFetcher): Promise<number> {
  try {
    const pack = await loadBestiary(baseUrl, fetcher);
    if (Array.isArray(pack?.entries) && pack.entries.length > 0) {
      activeBestiary = pack.entries;
    }
  } catch {
    // Keep bundled bestiary fallback
  }
  return activeBestiary.length;
}

/** Reset the active bestiary cache back to the bundled 52-entry fallback. */
export function resetCodexBestiaryCache(): void {
  activeBestiary = BUNDLED_BESTIARY;
}

/** Return all active bestiary lore entries (52 entries synchronously). */
export function getAllBestiaryLore(): readonly BestiaryEntry[] {
  return activeBestiary;
}

/** Return the total count of cataloged bestiary entries. */
export function getBestiaryCount(): number {
  return activeBestiary.length;
}

/** Look up a curated bestiary entry by unit/sprite ID (e.g. 'morvessa', 'briar-hound') or display name. */
export function getBestiaryLore(unitIdOrName: string): BestiaryEntry | undefined {
  const raw = unitIdOrName.trim();
  if (!raw) return undefined;
  const normalized = raw.toLowerCase().replace(/^beast-/, '');
  const byId = getBestiaryEntry(activeBestiary, normalized);
  if (byId) return byId;
  const lower = raw.toLowerCase();
  return activeBestiary.find((entry) => entry.name.toLowerCase() === lower || entry.id.toLowerCase() === lower);
}

/** Search curated bestiary entries across id, name, lore, and weakness text. */
export function searchBestiaryLore(query: string): BestiaryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...activeBestiary];
  return activeBestiary.filter(
    (e) =>
      e.id.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.lore.toLowerCase().includes(q) ||
      e.weakness.toLowerCase().includes(q),
  );
}

function toSnakeCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function collectLoreKeyLines(prefix: string): string[] {
  if (ITEM_LORE_PACK[prefix]) return [ITEM_LORE_PACK[prefix]];
  const numbered = Object.keys(ITEM_LORE_PACK)
    .filter((k) => k.startsWith(`${prefix}.`))
    .sort()
    .map((k) => ITEM_LORE_PACK[k]);
  return numbered;
}

/**
 * Look up all curated lore lines for an item by numeric `ITEMS` id, exact key
 * (`item.unique.*` / `item.set.*`), unique/set id (`uniq-*` / `set-*`), or item display name.
 */
export function getItemLoreLines(idOrKeyOrName: number | string): string[] {
  if (typeof idOrKeyOrName === 'number') {
    const def = getItemDef(idOrKeyOrName);
    if (!def) return [];
    const setDef = findSetByItemName(def.name);
    if (setDef) {
      const pieceKey = `item.set.${setDef.id}.${toSnakeCase(def.name)}.lore`;
      const setLines = collectLoreKeyLines(pieceKey);
      if (setLines.length > 0) return setLines;
    }
    const snake = toSnakeCase(def.name);
    for (const [k, v] of Object.entries(ITEM_LORE_PACK)) {
      if (k.endsWith(`.${snake}.lore`) || k.includes(`.${snake}.lore.`)) {
        return collectLoreKeyLines(k.replace(/\.\d+$/, ''));
      }
      if (k === `item.unique.${def.name}.lore`) return [v];
    }
    return def.lore ? [def.lore] : [];
  }

  const query = idOrKeyOrName.trim();
  if (!query) return [];

  // 1. Direct key or multi-part key prefix (e.g. 'item.unique.uniq-tollkeeper-bill.lore')
  const direct = collectLoreKeyLines(query);
  if (direct.length > 0) return direct;

  // 2. Unique or Set ID shorthand ('uniq-*', 'set-*', 'iron_warden', etc.)
  const uniqPrefix = `item.unique.${query}.lore`;
  const uniqLines = collectLoreKeyLines(uniqPrefix);
  if (uniqLines.length > 0) return uniqLines;

  const setPrefix = `item.set.${query}.lore`;
  const setLines = collectLoreKeyLines(setPrefix);
  if (setLines.length > 0) return setLines;

  // 3. Sim set or set-piece display name lookup
  const bySetName = ALL_SETS.find((s) => s.id === query || s.name.toLowerCase() === query.toLowerCase());
  if (bySetName) {
    const found = collectLoreKeyLines(`item.set.${bySetName.id}.lore`);
    if (found.length > 0) return found;
  }

  const owningSet = findSetByItemName(query);
  if (owningSet) {
    const pieceLines = collectLoreKeyLines(`item.set.${owningSet.id}.${toSnakeCase(query)}.lore`);
    if (pieceLines.length > 0) return pieceLines;
  }

  // 4. Normalized snake-case piece suffix match across all item-lore keys
  const snake = toSnakeCase(query);
  if (snake) {
    for (const key of Object.keys(ITEM_LORE_PACK)) {
      if (key.endsWith(`.${snake}.lore`) || key.includes(`.${snake}.lore.`)) {
        return collectLoreKeyLines(key.replace(/\.\d+$/, ''));
      }
    }
  }

  // 5. Fallback to inline ItemDef.lore if present on static items
  const itemMatch = ITEMS.find((it) => it.name.toLowerCase() === query.toLowerCase());
  return itemMatch?.lore ? [itemMatch.lore] : [];
}

/** Return joined curated lore text for an item ID, key, or name, or undefined if none exists. */
export function getItemLore(idOrKeyOrName: number | string): string | undefined {
  const lines = getItemLoreLines(idOrKeyOrName);
  return lines.length > 0 ? lines.join(' ') : undefined;
}

/** Return curated overview lore for an item set by set ID or display name. */
export function getSetLore(setIdOrName: string): string | undefined {
  const q = setIdOrName.trim();
  if (!q) return undefined;
  const direct = ITEM_LORE_PACK[`item.set.${q}.lore`];
  if (direct) return direct;
  const setDef = ALL_SETS.find((s) => s.id === q || s.name.toLowerCase() === q.toLowerCase());
  if (setDef) return ITEM_LORE_PACK[`item.set.${setDef.id}.lore`];
  return undefined;
}

/** Return all bundled `item-lore.json` keys (273 entries). */
export function getAllItemLoreKeys(): readonly string[] {
  return Object.keys(ITEM_LORE_PACK);
}

/** Return the number of entries in `item-lore.json`. */
export function getItemLoreCount(): number {
  return Object.keys(ITEM_LORE_PACK).length;
}
