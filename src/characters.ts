import { getRecord, putRecord } from './savedb';
import type { CarryoverState } from './carryover';
import { cloneHero, type HeroState } from './sim/hero';
import type { ItemInstance } from './sim/items';

/**
 * Persistent heroes. A character is a hero that outlives any one game: it is picked on the character screen and
 * brings its level, skills, gear and spells into the story campaign and into every skirmish, then keeps what it earned.
 * Plain JSON in IndexedDB (record key `characters`), so it can go into exported files unchanged.
 */
export const CHARACTERS_KEY = 'characters';
export const ACTIVE_KEY = 'thornvael.activeChar';
export const MAX_CHARACTERS = 8;
export const NAME_MAX = 16;

export interface Character {
  id: string;
  name: string;
  cls: number; // 0 warrior, 1 mage, 2 archer, 3 necromancer
  female: boolean;
  diff: number;
  createdAt: number;
  lastPlayed: number;
  level: number; // cached from the hero for the list screen
  hero: HeroState | null; // null until the first game has been played
  items: ItemInstance[]; // dynamic item instances the hero carries
  slots: number[] | null; // quick row
  gold: number; // purse for the story campaign
  played: number; // finished games
  clearedDifficulties?: number[]; // difficulties where the campaign was completed
  ngPlusTier?: number; // 0 = Normal only, 1 = Nightmare unlocked, 2 = Hell unlocked
}

interface Store {
  v: 1;
  list: Character[];
}

export const CLASS_NAMES = ['Warrior', 'Mage', 'Archer', 'Necromancer'] as const;

export function cleanName(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} '-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function newCharacter(name: string, cls: number, female: boolean, diff: number, now = Date.now()): Character {
  const n = cleanName(name) || 'Nameless';
  return {
    id: `c${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: n,
    cls,
    female,
    diff,
    createdAt: now,
    lastPlayed: now,
    level: 1,
    hero: null,
    items: [],
    slots: null,
    gold: 0,
    played: 0,
  };
}

function parse(raw: unknown): Character[] {
  const s = raw as Store | null;
  if (!s || s.v !== 1 || !Array.isArray(s.list)) return [];
  return s.list.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string');
}

export async function listCharacters(): Promise<Character[]> {
  try {
    return parse(await getRecord(CHARACTERS_KEY)).sort((a, b) => b.lastPlayed - a.lastPlayed);
  } catch {
    return [];
  }
}

async function write(list: Character[]): Promise<void> {
  await putRecord(CHARACTERS_KEY, { v: 1, list } satisfies Store);
}

export async function getCharacter(id: string): Promise<Character | null> {
  return (await listCharacters()).find((c) => c.id === id) ?? null;
}

export async function addCharacter(c: Character): Promise<boolean> {
  const list = await listCharacters();
  if (list.length >= MAX_CHARACTERS) return false;
  await write([...list.filter((x) => x.id !== c.id), c]);
  return true;
}

export async function deleteCharacter(id: string): Promise<void> {
  await write((await listCharacters()).filter((c) => c.id !== id));
  if (getActiveId() === id) setActiveId(null);
}

/** Keep what the hero earned: replace the stored snapshot of a character. */
export async function saveCharacter(
  id: string,
  upd: {
    hero: HeroState;
    items?: ItemInstance[];
    slots?: readonly number[];
    gold?: number;
    finished?: boolean;
    clearedDifficulty?: number;
  },
  now = Date.now(),
): Promise<boolean> {
  const list = await listCharacters();
  const c = list.find((x) => x.id === id);
  if (!c) return false;
  const updated = applyCharacterUpdate(c, upd, now);
  if (!updated) return false;
  Object.assign(c, updated);
  await write(list);
  return true;
}

export function applyCharacterUpdate(
  c: Character,
  upd: {
    hero: HeroState;
    items?: ItemInstance[];
    slots?: readonly number[];
    gold?: number;
    finished?: boolean;
    clearedDifficulty?: number;
  },
  now = Date.now(),
): Character | null {
  const h = cloneHero(upd.hero);
  if (!h) return null;
  const next: Character = {
    ...c,
    hero: h,
    items: upd.items ? structuredClone(upd.items) : [],
    slots: upd.slots ? [...upd.slots] : c.slots,
    gold: upd.gold !== undefined ? upd.gold : c.gold,
    level: h.level ?? 1,
    lastPlayed: now,
    played: c.played + (upd.finished ? 1 : 0),
  };
  if (upd.clearedDifficulty !== undefined) {
    const cleared = new Set(c.clearedDifficulties ?? []);
    cleared.add(upd.clearedDifficulty);
    next.clearedDifficulties = [...cleared].sort((a, b) => a - b);
    const unlockedNgPlus = upd.clearedDifficulty >= 2 ? 2 : 1;
    next.ngPlusTier = Math.max(c.ngPlusTier ?? 0, unlockedNgPlus);
    next.diff = Math.max(c.diff, upd.clearedDifficulty >= 2 ? 3 : 2);
  }
  return next;
}

/** Promote a character to New Game+ (`Normal -> Nightmare` or `Nightmare -> Hell`), keeping gear, spells, gold, and level. */
export function ascendCharacterToNewGamePlus(c: Character, clearedDiff: number, now = Date.now()): { character: Character; nextDifficulty: number } {
  const nextDifficulty = Math.min(3, Math.max(2, clearedDiff + 1));
  const cleared = new Set(c.clearedDifficulties ?? []);
  cleared.add(clearedDiff);
  const hero = c.hero ? { ...cloneHero(c.hero)!, diff: nextDifficulty } : null;
  return {
    nextDifficulty,
    character: {
      ...c,
      diff: nextDifficulty,
      hero,
      clearedDifficulties: [...cleared].sort((a, b) => a - b),
      ngPlusTier: Math.max(c.ngPlusTier ?? 0, nextDifficulty >= 3 ? 2 : 1),
      lastPlayed: now,
    },
  };
}

export function getActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* storage denied: the pick lasts only this page */
  }
}

/** What the character brings into a game; `progress` and mercenaries come from the game itself. */
export function characterCarry(c: Character, base: Pick<CarryoverState, 'progress' | 'shopSeed'>): CarryoverState | null {
  if (!c.hero) return null;
  return {
    hero: cloneHero(c.hero)!,
    mercs: [],
    gold: c.gold,
    shopSeed: base.shopSeed,
    progress: base.progress,
    slots: c.slots ?? undefined,
    items: c.items.length > 0 ? structuredClone(c.items) : undefined,
  };
}
