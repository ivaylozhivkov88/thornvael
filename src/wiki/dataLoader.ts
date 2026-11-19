import indexData from './data/index.json';
import { TYPE_TO_CAT } from './sections';
import type { WikiEntry, WikiEntryType, WikiIndex, WikiIndexEntry } from './types';

export const WIKI_INDEX = indexData as unknown as WikiIndex;

const ROUTE_MAP = new Map<string, WikiIndexEntry>();
for (const entry of WIKI_INDEX.entries) ROUTE_MAP.set(entry.r, entry);

export function getIndexEntry(route: string): WikiIndexEntry | undefined {
  return ROUTE_MAP.get(route);
}

const catCache = new Map<string, Promise<WikiEntry[]>>();

const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  bestiary: () => import('./data/bestiary.json'),
  items: () => import('./data/items.json'),
  uniques: () => import('./data/uniques.json'),
  sets: () => import('./data/sets.json'),
  affixes: () => import('./data/affixes.json'),
  gems: () => import('./data/gems.json'),
  spells: () => import('./data/spells.json'),
  skills: () => import('./data/skills.json'),
  classes: () => import('./data/classes.json'),
  mercs: () => import('./data/mercs.json'),
  cities: () => import('./data/cities.json'),
  maps: () => import('./data/maps.json'),
  regions: () => import('./data/regions.json'),
  biomes: () => import('./data/biomes.json'),
  missions: () => import('./data/missions.json'),
  lore: () => import('./data/lore.json'),
  achievements: () => import('./data/achievements.json'),
  tips: () => import('./data/tips.json'),
  glossary: () => import('./data/glossary.json'),
};

export function loadCategory(cat: string): Promise<WikiEntry[]> {
  let pending = catCache.get(cat);
  if (!pending) {
    const loader = LOADERS[cat];
    if (!loader) return Promise.resolve([]);
    pending = loader().then((m) => m.default as WikiEntry[]);
    catCache.set(cat, pending);
  }
  return pending;
}

export async function loadArticle(type: WikiEntryType, id: string): Promise<WikiEntry | null> {
  const cat = TYPE_TO_CAT[type];
  if (!cat) return null;
  const list = await loadCategory(cat);
  return list.find((e) => e.id === id) ?? null;
}
