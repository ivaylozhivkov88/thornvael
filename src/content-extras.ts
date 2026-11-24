// Typed loader for supplementary content JSON packs in public/data/content/.

export const EXTRA_CONTENT_KEYS = [
  'ambient-objects',
  'challenge-rifts',
  'class-skill-data',
  'consumable-effects',
  'cutscene-scripts',
  'elite-affixes',
  'hero-visuals',
  'merc-abilities',
  'merc-hire-dialogues',
  'merc-party-banter',
  'npc-reactions',
  'rare-name-parts',
  'salvage-lines',
  'ui-strings',
  'vendor-stock',
] as const;

export type ExtraContentKey = (typeof EXTRA_CONTENT_KEYS)[number];

/** Fetch a supplementary content pack from public/data/content/<key>.json. */
export async function loadExtraContent<T = unknown>(
  key: ExtraContentKey,
  baseUrl = '/',
): Promise<T> {
  const res = await fetch(`${baseUrl}data/content/${key}.json`);
  if (!res.ok) throw new Error(`Failed to load ${key}.json: ${res.status}`);
  return (await res.json()) as T;
}
