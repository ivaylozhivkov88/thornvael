import type { WikiEntry, WikiEntryType, WikiIndexEntry } from './types';

export const GRAIL_STORAGE_KEY = 'thornvael_grail_v2';
export const LEGACY_CODEX_STORAGE_KEY = 'thornvael_codex_v1';
export const GRAIL_PINS_STORAGE_KEY = 'thornvael_grail_pins_v1';
export const GRAIL_UPDATED_EVENT = 'thornvael:grail-updated';
export const MAX_GRAIL_PINS = 3;

export const GRAIL_ELIGIBLE_TYPES: ReadonlySet<WikiEntryType> = new Set(['item', 'unique', 'set', 'gem', 'bestiary']);

export interface GrailDiscoveryRecord {
  discovered: boolean;
  rollPerfectionPct?: number;
  primal: boolean;
  discoveredByHero?: string;
  heroClass?: string;
  heroLevel?: number;
  missionName?: string;
  droppedBy?: string;
  timestamp?: number;
  source: 'grail_v2' | 'codex_v1' | 'none';
}

export interface GrailSnapshot {
  v2Map: Map<string, GrailDiscoveryRecord>;
  codexNumbers: Set<number>;
  codexStrings: Set<string>;
  pins: string[];
}

export interface GrailTomeCount {
  discovered: number;
  total: number;
}

export interface GrailSummary {
  discoveredCount: number;
  totalCount: number;
  pct: number;
  tomes: {
    uniques: GrailTomeCount;
    sets: GrailTomeCount;
    gems: GrailTomeCount;
    bestiary: GrailTomeCount;
    items: GrailTomeCount;
  };
  pins: string[];
}

export interface PinToggleResult {
  pinned: boolean;
  pins: string[];
  limitReached: boolean;
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function slugifyName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseFiniteNumber(val: unknown): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function parseOptionalString(val: unknown): string | undefined {
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;
}

function normalizeV2Record(raw: unknown): GrailDiscoveryRecord | null {
  if (raw === true || typeof raw === 'number' || typeof raw === 'string') {
    return { discovered: true, primal: false, source: 'grail_v2' };
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.discovered === false) return null;

  const rawPct = parseFiniteNumber(obj.rollPerfectionPct ?? obj.perfectionPct ?? obj.perfection ?? obj.rollPct);
  const rollPerfectionPct = rawPct != null ? Math.max(0, Math.min(100, Math.round(rawPct))) : undefined;
  const primal = Boolean(obj.isPrimalPerfect ?? obj.primal) || (rollPerfectionPct != null && rollPerfectionPct >= 98);

  return {
    discovered: true,
    rollPerfectionPct,
    primal,
    discoveredByHero: parseOptionalString(obj.discoveredByHero ?? obj.heroName ?? obj.hero),
    heroClass: parseOptionalString(obj.heroClass ?? obj.cls),
    heroLevel: parseFiniteNumber(obj.heroLevel ?? obj.level),
    missionName: parseOptionalString(obj.missionName ?? obj.mission),
    droppedBy: parseOptionalString(obj.droppedBy ?? obj.sourceMonster ?? obj.monster),
    timestamp: parseFiniteNumber(obj.discoveredAt ?? obj.timestamp ?? obj.foundAt),
    source: 'grail_v2',
  };
}

function addV2Entry(map: Map<string, GrailDiscoveryRecord>, key: string, raw: unknown): void {
  const cleanKey = key.trim().toLowerCase();
  if (!cleanKey) return;
  const rec = normalizeV2Record(raw);
  if (!rec) return;

  const existing = map.get(cleanKey);
  if (!existing || (rec.rollPerfectionPct ?? -1) >= (existing.rollPerfectionPct ?? -1)) {
    map.set(cleanKey, rec);
  }
}

function indexObjectEntry(
  map: Map<string, GrailDiscoveryRecord>,
  obj: Record<string, unknown>,
  fallbackKey?: string,
): void {
  const key = parseOptionalString(obj.key ?? obj.id ?? obj.itemId ?? fallbackKey ?? obj.name);
  if (!key) return;
  addV2Entry(map, key, obj);
  const name = parseOptionalString(obj.name);
  if (name) {
    addV2Entry(map, name, obj);
    addV2Entry(map, slugifyName(name), obj);
  }
  const setId = parseOptionalString(obj.setId);
  if (setId) {
    addV2Entry(map, setId, obj);
    addV2Entry(map, `set:${setId}`, obj);
    addV2Entry(map, `sim-${slugifyName(setId)}`, obj);
  }
  const setName = parseOptionalString(obj.setName);
  if (setName) {
    addV2Entry(map, setName, obj);
    addV2Entry(map, slugifyName(setName), obj);
  }
  const baseId = parseFiniteNumber(obj.baseId);
  if (baseId != null && (obj.tome === 'armory' || key.startsWith('armory:'))) {
    addV2Entry(map, `armory:${baseId}`, obj);
  }
}

function parseV2Map(rawJson: string | null): Map<string, GrailDiscoveryRecord> {
  const map = new Map<string, GrailDiscoveryRecord>();
  if (!rawJson) return map;
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === 'string' || typeof item === 'number') {
          addV2Entry(map, String(item), true);
        } else if (item && typeof item === 'object') {
          indexObjectEntry(map, item as Record<string, unknown>);
        }
      }
      return map;
    }
    if (!parsed || typeof parsed !== 'object') return map;
    const root = parsed as Record<string, unknown>;
    const containers = [root.entries, root.records, root.items, root.discovered, root.relics];
    let usedContainer = false;
    for (const c of containers) {
      if (Array.isArray(c)) {
        usedContainer = true;
        for (const item of c) {
          if (typeof item === 'string' || typeof item === 'number') addV2Entry(map, String(item), true);
          else if (item && typeof item === 'object') {
            indexObjectEntry(map, item as Record<string, unknown>);
          }
        }
      } else if (c && typeof c === 'object') {
        usedContainer = true;
        for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
          if (v && typeof v === 'object') indexObjectEntry(map, v as Record<string, unknown>, k);
          else addV2Entry(map, k, v);
        }
      }
    }
    if (Array.isArray(root.ids)) {
      usedContainer = true;
      for (const id of root.ids) {
        if (typeof id === 'string' || typeof id === 'number') addV2Entry(map, String(id), true);
      }
    }
    if (!usedContainer) {
      const IGNORED_META = new Set(['version', 'schemaVersion', 'updatedAt', 'createdAt', 'pins']);
      for (const [k, v] of Object.entries(root)) {
        if (IGNORED_META.has(k)) continue;
        if (v && typeof v === 'object') indexObjectEntry(map, v as Record<string, unknown>, k);
        else addV2Entry(map, k, v);
      }
    }
  } catch {
    // Ignore malformed JSON in storage
  }
  return map;
}

function parseLegacyCodex(rawJson: string | null): { numbers: Set<number>; strings: Set<string> } {
  const numbers = new Set<number>();
  const strings = new Set<string>();
  if (!rawJson) return { numbers, strings };
  try {
    const parsed: unknown = JSON.parse(rawJson);
    const arr = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).discovered)
        ? ((parsed as Record<string, unknown>).discovered as unknown[])
        : [];
    for (const item of arr) {
      if (typeof item === 'number' && item >= 0) numbers.add(item);
      else if (typeof item === 'string' && item.trim()) strings.add(item.trim().toLowerCase());
    }
  } catch {
    // Ignore malformed JSON in storage
  }
  return { numbers, strings };
}

function parsePins(rawJson: string | null): string[] {
  if (!rawJson) return [];
  try {
    const parsed: unknown = JSON.parse(rawJson);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).pins)
        ? ((parsed as Record<string, unknown>).pins as unknown[])
        : [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of list) {
      const rawId =
        typeof item === 'string'
          ? item.trim()
          : item && typeof item === 'object'
            ? parseOptionalString((item as Record<string, unknown>).id)
            : undefined;
      if (rawId && !seen.has(rawId)) {
        seen.add(rawId);
        out.push(rawId);
        if (out.length >= MAX_GRAIL_PINS) break;
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function isGrailEligibleType(type: WikiEntryType): boolean {
  return GRAIL_ELIGIBLE_TYPES.has(type);
}

export function loadGrailPins(): string[] {
  const store = getStorage();
  return store ? parsePins(store.getItem(GRAIL_PINS_STORAGE_KEY)) : [];
}

function saveGrailPins(pins: readonly string[]): void {
  const store = getStorage();
  if (!store) return;
  try {
    store.setItem(GRAIL_PINS_STORAGE_KEY, JSON.stringify(pins.slice(0, MAX_GRAIL_PINS)));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(GRAIL_UPDATED_EVENT));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function stripPinPrefix(pin: string): string {
  const slash = pin.indexOf('/');
  const colon = pin.lastIndexOf(':');
  const idx = Math.max(slash, colon);
  return idx >= 0 ? pin.slice(idx + 1) : pin;
}

export function isTargetPinned(pins: readonly string[], id: string, type?: WikiEntryType, title?: string): boolean {
  const titleSlug = title ? slugifyName(title) : '';
  return pins.some((p) => {
    const bare = stripPinPrefix(p);
    return (
      p === id ||
      bare === id ||
      (type ? p === `${type}/${id}` || p === `${type}:${id}` : false) ||
      (titleSlug ? bare === titleSlug || p === `runeword:${titleSlug}` || p === `trophy:${id}` : false)
    );
  });
}

export function toggleGrailPin(id: string, title?: string): PinToggleResult {
  const cleanId = id.trim();
  const titleSlug = title ? slugifyName(title) : '';
  const current = loadGrailPins();
  if (!cleanId) return { pinned: false, pins: current, limitReached: false };

  if (isTargetPinned(current, cleanId, undefined, title)) {
    const next = current.filter((p) => {
      const bare = stripPinPrefix(p);
      return p !== cleanId && bare !== cleanId && (!titleSlug || bare !== titleSlug);
    });
    saveGrailPins(next);
    return { pinned: false, pins: next, limitReached: false };
  }

  if (current.length >= MAX_GRAIL_PINS) {
    return { pinned: false, pins: current, limitReached: true };
  }

  const next = [...current, cleanId];
  saveGrailPins(next);
  return { pinned: true, pins: next, limitReached: false };
}

export function findIndexEntryForPin(pin: string, entries: readonly WikiIndexEntry[]): WikiIndexEntry | undefined {
  const bare = stripPinPrefix(pin).toLowerCase();
  return entries.find((e) => e.r === pin || e.id === bare || e.id === pin || slugifyName(e.n) === bare);
}

export function unpinGrailTarget(id: string): string[] {
  const cleanId = id.trim();
  const cleanBare = stripPinPrefix(cleanId);
  const current = loadGrailPins();
  const next = current.filter((p) => p !== cleanId && stripPinPrefix(p) !== cleanBare && stripPinPrefix(p) !== cleanId);
  saveGrailPins(next);
  return next;
}

export function loadGrailSnapshot(): GrailSnapshot {
  const store = getStorage();
  if (!store) {
    return {
      v2Map: new Map(),
      codexNumbers: new Set(),
      codexStrings: new Set(),
      pins: [],
    };
  }
  const v2Map = parseV2Map(store.getItem(GRAIL_STORAGE_KEY));
  const legacy = parseLegacyCodex(store.getItem(LEGACY_CODEX_STORAGE_KEY));
  const pins = parsePins(store.getItem(GRAIL_PINS_STORAGE_KEY));
  return {
    v2Map,
    codexNumbers: legacy.numbers,
    codexStrings: legacy.strings,
    pins,
  };
}

export function lookupGrailStatus(
  snapshot: GrailSnapshot,
  entry: { id: string; type: WikiEntryType; title: string; codexId?: number },
): GrailDiscoveryRecord {
  const idLower = entry.id.toLowerCase();
  const titleLower = entry.title.trim().toLowerCase();
  const titleSlug = slugifyName(entry.title);
  const candidates = [
    idLower,
    `${entry.type}/${idLower}`,
    `${entry.type}:${idLower}`,
    ...(entry.type === 'gem'
      ? [`runeword:${titleSlug}`, `rune:${titleSlug}`, `rune:${idLower.replace(/^rune-/, '')}`]
      : []),
    ...(entry.type === 'bestiary' ? [`trophy:${idLower}`] : []),
    ...(entry.codexId != null ? [`armory:${entry.codexId}`, String(entry.codexId)] : []),
    titleSlug,
    titleLower,
  ];

  for (const k of candidates) {
    const hit = snapshot.v2Map.get(k);
    if (hit) return hit;
  }

  if (entry.codexId != null && snapshot.codexNumbers.has(entry.codexId)) {
    return { discovered: true, primal: false, source: 'codex_v1' };
  }
  for (const k of [idLower, `${entry.type}/${idLower}`, titleSlug]) {
    if (snapshot.codexStrings.has(k)) {
      return { discovered: true, primal: false, source: 'codex_v1' };
    }
  }

  return { discovered: false, primal: false, source: 'none' };
}

export function getEntryGrailStatus(entry: Pick<WikiEntry, 'id' | 'type' | 'title' | 'tags'>): GrailDiscoveryRecord {
  return lookupGrailStatus(loadGrailSnapshot(), {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    codexId: entry.tags.codexId,
  });
}

export function getGrailSummary(entries: readonly WikiIndexEntry[], snapshot = loadGrailSnapshot()): GrailSummary {
  const tomes = {
    uniques: { discovered: 0, total: 0 },
    sets: { discovered: 0, total: 0 },
    gems: { discovered: 0, total: 0 },
    bestiary: { discovered: 0, total: 0 },
    items: { discovered: 0, total: 0 },
  };

  for (const e of entries) {
    if (!isGrailEligibleType(e.t)) continue;
    const status = lookupGrailStatus(snapshot, {
      id: e.id,
      type: e.t,
      title: e.n,
      codexId: e.tag.codexId,
    });
    const bucket =
      e.t === 'unique'
        ? tomes.uniques
        : e.t === 'set'
          ? tomes.sets
          : e.t === 'gem'
            ? tomes.gems
            : e.t === 'bestiary'
              ? tomes.bestiary
              : tomes.items;
    bucket.total += 1;
    if (status.discovered) bucket.discovered += 1;
  }

  const totalCount =
    tomes.uniques.total + tomes.sets.total + tomes.gems.total + tomes.bestiary.total + tomes.items.total;
  const discoveredCount =
    tomes.uniques.discovered +
    tomes.sets.discovered +
    tomes.gems.discovered +
    tomes.bestiary.discovered +
    tomes.items.discovered;
  const pct = totalCount > 0 ? Math.round((discoveredCount / totalCount) * 100) : 0;

  return {
    discoveredCount,
    totalCount,
    pct,
    tomes,
    pins: snapshot.pins,
  };
}

export function getEntryDropClue(entry: Pick<WikiEntry, 'infobox'>): string | undefined {
  const row = entry.infobox.find(([k]) => k === 'Drop Clue');
  return row?.[1] && row[1].trim() !== '' ? row[1] : undefined;
}
