import { CAT_TO_TYPE } from './sections';
import type { WikiEntryType } from './types';

export type WikiRoute =
  | { kind: 'home' }
  | { kind: 'search'; query: string }
  | { kind: 'category'; cat: string; entryType: WikiEntryType }
  | { kind: 'article'; entryType: WikiEntryType; id: string };

const ALIAS_CAT: Record<string, string> = {
  ...Object.fromEntries(Object.keys(CAT_TO_TYPE).map((c) => [c, c])),
  unique: 'uniques',
  set: 'sets',
  affix: 'affixes',
  gem: 'gems',
  spell: 'spells',
  skill: 'skills',
  class: 'classes',
  merc: 'mercs',
  city: 'cities',
  map: 'maps',
  region: 'regions',
  biome: 'biomes',
  mission: 'missions',
  achievement: 'achievements',
  tip: 'tips',
};

export function parseHash(rawHash = window.location.hash): WikiRoute {
  const clean = rawHash.replace(/^#\/?/, '').trim();
  if (!clean || clean === 'home') return { kind: 'home' };

  const qIdx = clean.indexOf('?');
  const path = qIdx >= 0 ? clean.slice(0, qIdx) : clean;
  const qs = qIdx >= 0 ? clean.slice(qIdx + 1) : '';
  const parts = path.split('/').filter(Boolean).map((p) => decodeURIComponent(p));

  if (parts[0] === 'search') {
    const params = new URLSearchParams(qs);
    return { kind: 'search', query: params.get('q') ?? parts[1] ?? '' };
  }

  if (parts.length === 1) {
    const cat = ALIAS_CAT[parts[0].toLowerCase()];
    if (cat && CAT_TO_TYPE[cat]) {
      return { kind: 'category', cat, entryType: CAT_TO_TYPE[cat] };
    }
  }

  if (parts.length >= 2) {
    const rawType = parts[0].toLowerCase();
    const cat = ALIAS_CAT[rawType];
    if (cat && CAT_TO_TYPE[cat]) {
      return { kind: 'article', entryType: CAT_TO_TYPE[cat], id: parts.slice(1).join('/') };
    }
  }

  return { kind: 'home' };
}

export function go(route: string): void {
  const target = route.startsWith('#') ? route : `#/${route.replace(/^\/+/, '')}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  } else {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}
