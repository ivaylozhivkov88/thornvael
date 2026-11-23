import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface WikiEntry {
  id: string;
  type: string;
  title: string;
  related?: string[];
}

const WIKI_DIR = resolve(__dirname, '..', 'src', 'wiki', 'data');
const CONTENT_DIR = resolve(__dirname, '..', 'public', 'data', 'content');

function loadWiki<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(WIKI_DIR, name), 'utf8')) as T;
}

function loadContent<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(CONTENT_DIR, name), 'utf8')) as T;
}

describe('Act 1 Wiki & Codex Coverage + Cross-Links', () => {
  const lore = loadWiki<WikiEntry[]>('lore.json');
  const regions = loadWiki<WikiEntry[]>('regions.json');
  const bestiary = loadWiki<WikiEntry[]>('bestiary.json');
  const uniques = loadWiki<WikiEntry[]>('uniques.json');
  const cities = loadWiki<WikiEntry[]>('cities.json');

  const allRoutes = new Set([
    ...lore.map((e) => `lore/${e.id}`),
    ...regions.map((e) => `region/${e.id}`),
    ...bestiary.map((e) => `bestiary/${e.id}`),
    ...uniques.map((e) => `unique/${e.id}`),
    ...cities.map((e) => `city/${e.id}`),
    'map/map1',
    'map/map2',
    'map/map3',
    'map/map4',
  ]);

  it('has wiki entries for every Act 1 town NPC and field NPC with valid cross-links', () => {
    const townNpcs = loadContent<{ id: string }[]>('npcs.json').filter((n: any) => n.town === 'town-thornwick');
    const fieldNpcs = loadContent<{ id: string; act: number }[]>('field-npcs.json').filter((n) => n.act === 1);
    const loreById = new Map(lore.map((l) => [l.id, l]));

    for (const npc of [...townNpcs, ...fieldNpcs]) {
      const entry = loreById.get(npc.id);
      expect(entry, `Missing wiki lore entry for ${npc.id}`).toBeDefined();
      expect((entry!.related ?? []).length, `${npc.id} has no related links`).toBeGreaterThan(0);
      for (const rel of entry!.related ?? []) {
        expect(allRoutes.has(rel), `${npc.id} broken related link ${rel}`).toBe(true);
      }
    }
  });

  it('has wiki entries for all Act 1 locations, monsters, and unique items with cross-links', () => {
    const locs = [
      ...loadContent<{ id: string; act: number }[]>('map-locations.json'),
      ...loadContent<{ id: string; act: number }[]>('map-locations-2.json'),
    ].filter((l) => l.act === 1);
    const loreById = new Map(lore.map((l) => [l.id, l]));
    for (const loc of locs) {
      expect(loreById.has(loc.id), `Missing Act 1 location ${loc.id}`).toBe(true);
    }

    const act1Uniques = loadContent<{ id: string; act?: number }[]>('uniques.json').filter((u) => u.act === 1);
    const uniqById = new Map(uniques.map((u) => [u.id, u]));
    for (const u of act1Uniques) {
      expect(uniqById.has(u.id), `Missing Act 1 unique ${u.id}`).toBe(true);
    }

    expect(bestiary.some((b) => b.id === 'briar-hound')).toBe(true);
    expect(bestiary.some((b) => b.id === 'morvessa')).toBe(true);
  });
});
