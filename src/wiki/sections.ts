import type { WikiEntryType } from './types';

export interface WikiSectionDef {
  id: string;
  label: string;
  route: string;
  icon: string;
  desc: string;
  types: WikiEntryType[];
  tabs?: { id: string; label: string; route: string; type: WikiEntryType }[];
}

export const WIKI_SECTIONS: readonly WikiSectionDef[] = [
  {
    id: 'home',
    label: 'Home',
    route: 'home',
    icon: '🏰',
    desc: 'Compendium overview, quick links, and province guides.',
    types: [],
  },
  {
    id: 'bestiary',
    label: 'Bestiary',
    route: 'bestiary',
    icon: '💀',
    desc: '52 core creatures & bosses, 16 super uniques, and 60 field variants.',
    types: ['bestiary'],
  },
  {
    id: 'classes',
    label: 'Heroes & Classes',
    route: 'classes',
    icon: '⚔️',
    desc: 'Playable hero classes, archetypes, starting gear, and progression.',
    types: ['class'],
  },
  {
    id: 'mercs',
    label: 'Mercenaries',
    route: 'mercs',
    icon: '🛡️',
    desc: '24 hireable sellswords, upkeep, abilities, and backstories.',
    types: ['merc'],
  },
  {
    id: 'items',
    label: 'Items',
    route: 'items',
    icon: '💎',
    desc: 'Common gear, base items, 132 uniques, 28 sets, affixes, and sockets.',
    types: ['item', 'unique', 'set', 'affix', 'gem'],
    tabs: [
      { id: 'items', label: 'Common & Base', route: 'items', type: 'item' },
      { id: 'uniques', label: 'Uniques', route: 'uniques', type: 'unique' },
      { id: 'sets', label: 'Sets', route: 'sets', type: 'set' },
      { id: 'affixes', label: 'Affixes', route: 'affixes', type: 'affix' },
      { id: 'gems', label: 'Sockets & Runes', route: 'gems', type: 'gem' },
    ],
  },
  {
    id: 'spells',
    label: 'Spells & Skills',
    route: 'spells',
    icon: '🔥',
    desc: '81 elemental and arcane spells plus 96 class skill tree nodes.',
    types: ['spell', 'skill'],
    tabs: [
      { id: 'spells', label: 'Spells', route: 'spells', type: 'spell' },
      { id: 'skills', label: 'Skill Trees', route: 'skills', type: 'skill' },
    ],
  },
  {
    id: 'cities',
    label: 'Cities',
    route: 'cities',
    icon: '🏛️',
    desc: 'The four campaign hub cities, merchants, academies, and NPCs.',
    types: ['city'],
  },
  {
    id: 'maps',
    label: 'Regions & Maps',
    route: 'maps',
    icon: '🗺️',
    desc: '4 campaign macro maps, 28 regions, 7 skirmish biomes, and 46 missions.',
    types: ['map', 'region', 'biome', 'mission'],
    tabs: [
      { id: 'maps', label: 'Macro Maps', route: 'maps', type: 'map' },
      { id: 'regions', label: 'Regions', route: 'regions', type: 'region' },
      { id: 'biomes', label: 'Skirmish Biomes', route: 'biomes', type: 'biome' },
      { id: 'missions', label: 'Missions', route: 'missions', type: 'mission' },
    ],
  },
  {
    id: 'lore',
    label: 'Story & Lore',
    route: 'lore',
    icon: '📜',
    desc: 'Timeline, factions, lore books, codex, rumors, quests, and endings.',
    types: ['lore'],
  },
  {
    id: 'achievements',
    label: 'Achievements',
    route: 'achievements',
    icon: '🏆',
    desc: '230 campaign, combat, and challenge achievements.',
    types: ['achievement'],
  },
  {
    id: 'tips',
    label: 'Tips',
    route: 'tips',
    icon: '💡',
    desc: 'Tactical loading tips, combat guides, and epitaphs.',
    types: ['tip'],
  },
  {
    id: 'glossary',
    label: 'Glossary',
    route: 'glossary',
    icon: '📖',
    desc: 'Schools, rarities, difficulties, elite modifiers, and cube crafting.',
    types: ['glossary'],
  },
];

export const TYPE_TO_CAT: Record<WikiEntryType, string> = {
  bestiary: 'bestiary',
  item: 'items',
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
  lore: 'lore',
  achievement: 'achievements',
  tip: 'tips',
  glossary: 'glossary',
};

export const CAT_TO_TYPE: Record<string, WikiEntryType> = Object.fromEntries(
  Object.entries(TYPE_TO_CAT).map(([t, c]) => [c, t as WikiEntryType]),
) as Record<string, WikiEntryType>;

export const TYPE_LABEL: Record<WikiEntryType, string> = {
  bestiary: 'Bestiary',
  item: 'Item',
  unique: 'Unique',
  set: 'Item Set',
  affix: 'Affix',
  gem: 'Socket / Rune',
  spell: 'Spell',
  skill: 'Skill',
  class: 'Hero & Class',
  merc: 'Mercenary',
  city: 'City',
  map: 'Macro Map',
  region: 'Region',
  biome: 'Skirmish Biome',
  mission: 'Mission',
  lore: 'Lore',
  achievement: 'Achievement',
  tip: 'Tip',
  glossary: 'Glossary',
};

export function sectionForType(type: WikiEntryType): WikiSectionDef {
  return WIKI_SECTIONS.find((s) => s.types.includes(type)) ?? WIKI_SECTIONS[0];
}
