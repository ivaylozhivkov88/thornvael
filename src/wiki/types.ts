export type WikiEntryType =
  | 'bestiary'
  | 'item'
  | 'unique'
  | 'set'
  | 'affix'
  | 'gem'
  | 'spell'
  | 'skill'
  | 'class'
  | 'merc'
  | 'city'
  | 'map'
  | 'region'
  | 'biome'
  | 'mission'
  | 'lore'
  | 'achievement'
  | 'tip'
  | 'glossary';

export interface WikiImageAtlas {
  x: number;
  y: number;
  w: number;
  h: number;
  sw: number;
  sh: number;
  label?: string;
}

export interface WikiImage {
  src: string;
  atlas?: WikiImageAtlas;
  turnaround?: WikiImageAtlas[];
}

export interface WikiTable {
  head: string[];
  rows: string[][];
}

export interface WikiSection {
  h: string;
  p?: string[];
  list?: string[];
  table?: WikiTable;
}

export interface WikiTags {
  family?: string;
  level?: number;
  act?: number;
  rarity?: string;
  slot?: string;
  cls?: string;
  school?: string;
  biome?: string;
  cat?: string;
  core?: boolean;
  codexId?: number;
}

export interface WikiGate {
  m?: string;
  a?: number;
}

export interface WikiEntry {
  id: string;
  type: WikiEntryType;
  title: string;
  summary: string;
  img: WikiImage | null;
  sprite?: WikiImage | null;
  infobox: [string, string][];
  sections: WikiSection[];
  related: string[];
  tags: WikiTags;
  gate?: WikiGate;
}

export interface WikiIndexEntry {
  r: string;
  t: WikiEntryType;
  id: string;
  n: string;
  s: string;
  img: WikiImage | null;
  tag: WikiTags;
  g?: WikiGate;
}

export interface WikiIndex {
  cats: string[];
  entries: WikiIndexEntry[];
  acts: Record<string, number>;
  counts: Record<string, number>;
}
