import type { WikiEntry, WikiIndex } from '../src/wiki/types';

export interface WikiMissingEntry {
  id: string;
  type: string;
  where: string;
}

export interface WikiBuildOutput {
  bestiary: WikiEntry[];
  items: WikiEntry[];
  uniques: WikiEntry[];
  sets: WikiEntry[];
  affixes: WikiEntry[];
  gems: WikiEntry[];
  spells: WikiEntry[];
  skills: WikiEntry[];
  classes: WikiEntry[];
  mercs: WikiEntry[];
  cities: WikiEntry[];
  maps: WikiEntry[];
  regions: WikiEntry[];
  biomes: WikiEntry[];
  missions: WikiEntry[];
  lore: WikiEntry[];
  achievements: WikiEntry[];
  tips: WikiEntry[];
  glossary: WikiEntry[];
  index: WikiIndex;
  [key: string]: WikiEntry[] | WikiIndex;
}

export function buildWikiData(): { out: WikiBuildOutput; missing: WikiMissingEntry[] };
export function renderMissing(missing: readonly WikiMissingEntry[]): string;
export function serialise(out: WikiBuildOutput): Record<string, string>;
