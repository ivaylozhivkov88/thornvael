/**
 * Localization-ready text & lore packs for Thornvael.
 * Provides typed schemas, async loaders, bundled dictionaries, lookup helpers,
 * and validation utilities across all 9 text packs:
 *   - Public packs (`public/data/text/*.json`): bestiary-52, achievements-60,
 *     loading-tips-50, death-messages-30, tavern-rumors-40, location-plaques-40
 *   - Bundled packs (`src/data/text/*.json`): barks, item-lore, spell-flavor
 */

import barksJson from './barks.json' with { type: 'json' };
import itemLoreJson from './item-lore.json' with { type: 'json' };
import spellFlavorJson from './spell-flavor.json' with { type: 'json' };

export type FlatTextPack = Readonly<Record<string, string>>;

export const BARKS_PACK: FlatTextPack = barksJson;
export const ITEM_LORE_PACK: FlatTextPack = itemLoreJson;
export const SPELL_FLAVOR_PACK: FlatTextPack = spellFlavorJson;

export type CampaignMapId =
  | 'map1-border-fords'
  | 'map2-redmarsh-wastes'
  | 'map3-iron-coast'
  | 'map4-obsidian-caldera';

export interface LocationPlaqueEntry {
  key: string;
  mapId: CampaignMapId;
  act: CampaignStage;
  region: string;
  title: string;
  text: string;
}

export interface LocationPlaquesPack {
  version: number;
  entries: LocationPlaqueEntry[];
}

export interface BestiaryEntry {
  id: string;
  nameKey: string;
  name: string;
  loreKey: string;
  lore: string;
  weakness: string;
}

export interface BestiaryPack {
  version: number;
  entries: BestiaryEntry[];
}

export type AchievementCategory =
  | 'combat'
  | 'campaign'
  | 'exploration'
  | 'economy'
  | 'codex'
  | 'mastery';

export interface AchievementCondition {
  metric: string;
  target: number | string;
}

export interface AchievementEntry {
  id: string;
  titleKey: string;
  title: string;
  descKey: string;
  desc: string;
  category: AchievementCategory;
  condition: AchievementCondition;
}

export interface AchievementsPack {
  version: number;
  entries: AchievementEntry[];
}

export interface LoadingTipEntry {
  key: string;
  text: string;
}

export interface LoadingTipsPack {
  version: number;
  entries: LoadingTipEntry[];
}

export interface DeathMessageEntry {
  key: string;
  text: string;
}

export interface DeathMessagesPack {
  version: number;
  entries: DeathMessageEntry[];
}

export type CampaignStage = 1 | 2 | 3 | 4;

export type HubId =
  | 'town-thornwick'
  | 'town-redmarsh'
  | 'town-oakhaven'
  | 'town-ironcamp';

export interface TavernRumorEntry {
  key: string;
  stage: CampaignStage;
  hub: HubId;
  text: string;
}

export interface TavernRumorsPack {
  version: number;
  entries: TavernRumorEntry[];
}

export interface TextPacksBundle {
  bestiary: BestiaryPack;
  achievements: AchievementsPack;
  loadingTips: LoadingTipsPack;
  deathMessages: DeathMessagesPack;
  tavernRumors: TavernRumorsPack;
  locationPlaques?: LocationPlaquesPack;
}

export interface AllTextPacksBundle {
  bestiary: BestiaryPack;
  achievements: AchievementsPack;
  loadingTips: LoadingTipsPack;
  deathMessages: DeathMessagesPack;
  tavernRumors: TavernRumorsPack;
  locationPlaques: LocationPlaquesPack;
  barks: FlatTextPack;
  itemLore: FlatTextPack;
  spellFlavor: FlatTextPack;
}

export type JsonFetcher = (url: string) => Promise<unknown>;

const BANNED_PATTERNS: readonly RegExp[] = [
  ['Rage of', ' Mages'],
  ['Allo', 'ds'],
  ['Niva', 'l'],
  ['Necromancer', "'s Rage"],
  ['Dia', 'blo'],
  ['Kur', 'ast'],
  ['Tal Ra', 'sha'],
  ['Bishi', 'bosh'],
  ['Raka', 'nishu'],
  ['Rada', 'ment'],
  ['Heph', 'asto'],
  ['Izu', 'al'],
  ['Endu', 'gu'],
  ['De ', 'Seis'],
].map(([a, b]) => new RegExp(a + b, 'i'));

function resolveBaseUrl(baseUrl?: string): string {
  if (baseUrl !== undefined) {
    return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }
  const envBase =
    typeof import.meta !== 'undefined' &&
    typeof import.meta.env === 'object' &&
    import.meta.env !== null &&
    typeof import.meta.env.BASE_URL === 'string'
      ? import.meta.env.BASE_URL
      : '/';
  return envBase.endsWith('/') ? envBase : `${envBase}/`;
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load text pack "${url}": ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** Load the 52-unit bestiary lore pack. */
export async function loadBestiary(
  baseUrl?: string,
  fetcher: JsonFetcher = defaultFetchJson,
): Promise<BestiaryPack> {
  const url = `${resolveBaseUrl(baseUrl)}data/text/bestiary-52.json`;
  return (await fetcher(url)) as BestiaryPack;
}

/** Load the 60-achievement definitions pack. */
export async function loadAchievements(
  baseUrl?: string,
  fetcher: JsonFetcher = defaultFetchJson,
): Promise<AchievementsPack> {
  const url = `${resolveBaseUrl(baseUrl)}data/text/achievements-60.json`;
  return (await fetcher(url)) as AchievementsPack;
}

/** Load the 50 loading-screen tips pack. */
export async function loadLoadingTips(
  baseUrl?: string,
  fetcher: JsonFetcher = defaultFetchJson,
): Promise<LoadingTipsPack> {
  const url = `${resolveBaseUrl(baseUrl)}data/text/loading-tips-50.json`;
  return (await fetcher(url)) as LoadingTipsPack;
}

/** Load the 30 death-message epitaphs pack. */
export async function loadDeathMessages(
  baseUrl?: string,
  fetcher: JsonFetcher = defaultFetchJson,
): Promise<DeathMessagesPack> {
  const url = `${resolveBaseUrl(baseUrl)}data/text/death-messages-30.json`;
  return (await fetcher(url)) as DeathMessagesPack;
}

/** Load the 40 staged tavern rumors pack. */
export async function loadTavernRumors(
  baseUrl?: string,
  fetcher: JsonFetcher = defaultFetchJson,
): Promise<TavernRumorsPack> {
  const url = `${resolveBaseUrl(baseUrl)}data/text/tavern-rumors-40.json`;
  return (await fetcher(url)) as TavernRumorsPack;
}

/** Load the 40 location lore plaques pack across Maps 1-4. */
export async function loadLocationPlaques(
  baseUrl?: string,
  fetcher: JsonFetcher = defaultFetchJson,
): Promise<LocationPlaquesPack> {
  const url = `${resolveBaseUrl(baseUrl)}data/text/location-plaques-40.json`;
  return (await fetcher(url)) as LocationPlaquesPack;
}

/** Load the 5 core runtime text & lore packs concurrently. */
export async function loadAllTextPacks(
  baseUrl?: string,
  fetcher: JsonFetcher = defaultFetchJson,
): Promise<TextPacksBundle> {
  const [bestiary, achievements, loadingTips, deathMessages, tavernRumors] = await Promise.all([
    loadBestiary(baseUrl, fetcher),
    loadAchievements(baseUrl, fetcher),
    loadLoadingTips(baseUrl, fetcher),
    loadDeathMessages(baseUrl, fetcher),
    loadTavernRumors(baseUrl, fetcher),
  ]);
  return { bestiary, achievements, loadingTips, deathMessages, tavernRumors };
}

/** Load all 6 public text packs concurrently and attach the 3 bundled src text packs. */
export async function loadAllNineTextPacks(
  baseUrl?: string,
  fetcher: JsonFetcher = defaultFetchJson,
): Promise<AllTextPacksBundle> {
  const [bestiary, achievements, loadingTips, deathMessages, tavernRumors, locationPlaques] =
    await Promise.all([
      loadBestiary(baseUrl, fetcher),
      loadAchievements(baseUrl, fetcher),
      loadLoadingTips(baseUrl, fetcher),
      loadDeathMessages(baseUrl, fetcher),
      loadTavernRumors(baseUrl, fetcher),
      loadLocationPlaques(baseUrl, fetcher),
    ]);
  return {
    bestiary,
    achievements,
    loadingTips,
    deathMessages,
    tavernRumors,
    locationPlaques,
    barks: BARKS_PACK,
    itemLore: ITEM_LORE_PACK,
    spellFlavor: SPELL_FLAVOR_PACK,
  };
}

/** Look up a bestiary entry by sprite/unit ID. */
export function getBestiaryEntry(
  entries: readonly BestiaryEntry[],
  id: string,
): BestiaryEntry | undefined {
  return entries.find((entry) => entry.id === id);
}

/** Look up an achievement definition by ID. */
export function getAchievementById(
  entries: readonly AchievementEntry[],
  id: string,
): AchievementEntry | undefined {
  return entries.find((entry) => entry.id === id);
}

/** Filter achievements by category. */
export function getAchievementsByCategory(
  entries: readonly AchievementEntry[],
  category: AchievementCategory,
): AchievementEntry[] {
  return entries.filter((entry) => entry.category === category);
}

/** Pick a loading tip using the provided RNG (defaults to Math.random). */
export function getRandomTip(
  tips: readonly LoadingTipEntry[],
  rng: () => number = Math.random,
): LoadingTipEntry | undefined {
  if (tips.length === 0) return undefined;
  const idx = Math.floor(Math.max(0, Math.min(0.999999, rng())) * tips.length);
  return tips[idx];
}

/** Pick a death message using the provided RNG (defaults to Math.random). */
export function getRandomDeathMessage(
  messages: readonly DeathMessageEntry[],
  rng: () => number = Math.random,
): DeathMessageEntry | undefined {
  if (messages.length === 0) return undefined;
  const idx = Math.floor(Math.max(0, Math.min(0.999999, rng())) * messages.length);
  return messages[idx];
}

/** Filter tavern rumors by campaign stage (1..4). */
export function getRumorsByStage(
  rumors: readonly TavernRumorEntry[],
  stage: CampaignStage,
): TavernRumorEntry[] {
  return rumors.filter((rumor) => rumor.stage === stage);
}

/** Filter tavern rumors by town hub ID. */
export function getRumorsByHub(
  rumors: readonly TavernRumorEntry[],
  hub: HubId,
): TavernRumorEntry[] {
  return rumors.filter((rumor) => rumor.hub === hub);
}

/** Look up a location lore plaque by exact key. */
export function getPlaqueByKey(
  plaques: readonly LocationPlaqueEntry[],
  key: string,
): LocationPlaqueEntry | undefined {
  return plaques.find((plaque) => plaque.key === key);
}

/** Filter location lore plaques by campaign map ID. */
export function getPlaquesByMap(
  plaques: readonly LocationPlaqueEntry[],
  mapId: CampaignMapId,
): LocationPlaqueEntry[] {
  return plaques.filter((plaque) => plaque.mapId === mapId);
}

/** Filter location lore plaques by campaign act (1..4). */
export function getPlaquesByAct(
  plaques: readonly LocationPlaqueEntry[],
  act: CampaignStage,
): LocationPlaqueEntry[] {
  return plaques.filter((plaque) => plaque.act === act);
}

/** Look up a bundled bark string by exact key. */
export function getBarkLine(key: string): string | undefined {
  return BARKS_PACK[key];
}

/** Filter bundled bark lines by mercenary/unit prefix (e.g. 'merc.thornwick_levyman') and optional category. */
export function getBarksByMerc(mercId: string, category?: string): string[] {
  const cleanId = mercId.startsWith('merc.') ? mercId : `merc.${mercId}`;
  const prefix = category ? `${cleanId}.${category}.` : `${cleanId}.`;
  return Object.entries(BARKS_PACK)
    .filter(([k]) => k.startsWith(prefix))
    .map(([, v]) => v);
}

/** Look up a bundled item-lore string by exact key. */
export function getItemLoreLine(key: string): string | undefined {
  return ITEM_LORE_PACK[key];
}

/** Look up bundled spell flavor text by key (e.g. 'spell.fire_bolt.flavor') or spell name/slug (e.g. 'Fire Bolt' / 'fire_bolt'). */
export function getSpellFlavorLine(spellIdOrKey: string): string | undefined {
  if (SPELL_FLAVOR_PACK[spellIdOrKey]) return SPELL_FLAVOR_PACK[spellIdOrKey];
  const snake = spellIdOrKey
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return SPELL_FLAVOR_PACK[`spell.${snake}.flavor`];
}

/** Return the first matching banned pattern source if text contains a forbidden term, or null. */
export function containsBannedTerm(text: string): string | null {
  for (const re of BANNED_PATTERNS) {
    if (re.test(text)) return re.source;
  }
  return null;
}

function collectDuplicateStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const val of values) {
    if (seen.has(val)) dupes.push(val);
    seen.add(val);
  }
  return dupes;
}

/** Validate the bestiary pack schema, counts, duplicates, and banned terms. */
export function validateBestiaryPack(
  pack: BestiaryPack,
  expectedUnitIds?: readonly string[],
): string[] {
  const errors: string[] = [];
  if (!Array.isArray(pack.entries)) {
    return ['bestiary.entries must be an array'];
  }
  if (pack.entries.length !== 52) {
    errors.push(`bestiary expected 52 entries, got ${pack.entries.length}`);
  }
  for (const idDupe of collectDuplicateStrings(pack.entries.map((e) => e.id))) {
    errors.push(`bestiary duplicate id: ${idDupe}`);
  }
  for (const keyDupe of collectDuplicateStrings(
    pack.entries.flatMap((e) => [e.nameKey, e.loreKey]),
  )) {
    errors.push(`bestiary duplicate key: ${keyDupe}`);
  }
  for (const loreDupe of collectDuplicateStrings(pack.entries.map((e) => e.lore.trim()))) {
    errors.push(`bestiary duplicate lore line: ${loreDupe.slice(0, 40)}`);
  }
  for (const e of pack.entries) {
    if (!e.id || !e.nameKey || !e.loreKey) errors.push(`bestiary missing keys for ${e.id}`);
    if (e.name.trim().length < 2 || e.name.trim().length > 60) {
      errors.push(`bestiary name length out of bounds for ${e.id}`);
    }
    if (e.lore.trim().length < 40 || e.lore.trim().length > 420) {
      errors.push(`bestiary lore length out of bounds for ${e.id}`);
    }
    if (e.weakness.trim().length < 10 || e.weakness.trim().length > 160) {
      errors.push(`bestiary weakness length out of bounds for ${e.id}`);
    }
    for (const field of [e.name, e.lore, e.weakness]) {
      const hit = containsBannedTerm(field);
      if (hit) errors.push(`bestiary banned term (${hit}) in ${e.id}`);
    }
  }
  if (expectedUnitIds) {
    const present = new Set(pack.entries.map((e) => e.id));
    for (const id of expectedUnitIds) {
      if (!present.has(id)) errors.push(`bestiary missing sprite unit id: ${id}`);
    }
  }
  return errors;
}

/** Validate the achievements pack schema, counts, duplicates, and banned terms. */
export function validateAchievementsPack(pack: AchievementsPack): string[] {
  const errors: string[] = [];
  if (!Array.isArray(pack.entries)) {
    return ['achievements.entries must be an array'];
  }
  if (pack.entries.length !== 60) {
    errors.push(`achievements expected 60 entries, got ${pack.entries.length}`);
  }
  for (const idDupe of collectDuplicateStrings(pack.entries.map((e) => e.id))) {
    errors.push(`achievements duplicate id: ${idDupe}`);
  }
  for (const keyDupe of collectDuplicateStrings(
    pack.entries.flatMap((e) => [e.titleKey, e.descKey]),
  )) {
    errors.push(`achievements duplicate key: ${keyDupe}`);
  }
  for (const titleDupe of collectDuplicateStrings(pack.entries.map((e) => e.title.trim()))) {
    errors.push(`achievements duplicate title: ${titleDupe}`);
  }
  for (const descDupe of collectDuplicateStrings(pack.entries.map((e) => e.desc.trim()))) {
    errors.push(`achievements duplicate desc: ${descDupe}`);
  }
  for (const e of pack.entries) {
    if (e.title.trim().length < 3 || e.title.trim().length > 60) {
      errors.push(`achievements title length out of bounds for ${e.id}`);
    }
    if (e.desc.trim().length < 15 || e.desc.trim().length > 180) {
      errors.push(`achievements desc length out of bounds for ${e.id}`);
    }
    if (!e.condition || !e.condition.metric) {
      errors.push(`achievements missing condition for ${e.id}`);
    }
    for (const field of [e.title, e.desc]) {
      const hit = containsBannedTerm(field);
      if (hit) errors.push(`achievements banned term (${hit}) in ${e.id}`);
    }
  }
  return errors;
}

/** Validate the loading tips pack schema, counts, duplicates, and banned terms. */
export function validateLoadingTipsPack(pack: LoadingTipsPack): string[] {
  const errors: string[] = [];
  if (!Array.isArray(pack.entries)) {
    return ['loadingTips.entries must be an array'];
  }
  if (pack.entries.length !== 50) {
    errors.push(`loadingTips expected 50 entries, got ${pack.entries.length}`);
  }
  for (const keyDupe of collectDuplicateStrings(pack.entries.map((e) => e.key))) {
    errors.push(`loadingTips duplicate key: ${keyDupe}`);
  }
  for (const textDupe of collectDuplicateStrings(pack.entries.map((e) => e.text.trim()))) {
    errors.push(`loadingTips duplicate text: ${textDupe.slice(0, 40)}`);
  }
  for (const e of pack.entries) {
    if (e.text.trim().length < 25 || e.text.trim().length > 220) {
      errors.push(`loadingTips text length out of bounds for ${e.key}`);
    }
    const hit = containsBannedTerm(e.text);
    if (hit) errors.push(`loadingTips banned term (${hit}) in ${e.key}`);
  }
  return errors;
}

/** Validate the death messages pack schema, counts, duplicates, and banned terms. */
export function validateDeathMessagesPack(pack: DeathMessagesPack): string[] {
  const errors: string[] = [];
  if (!Array.isArray(pack.entries)) {
    return ['deathMessages.entries must be an array'];
  }
  if (pack.entries.length !== 30) {
    errors.push(`deathMessages expected 30 entries, got ${pack.entries.length}`);
  }
  for (const keyDupe of collectDuplicateStrings(pack.entries.map((e) => e.key))) {
    errors.push(`deathMessages duplicate key: ${keyDupe}`);
  }
  for (const textDupe of collectDuplicateStrings(pack.entries.map((e) => e.text.trim()))) {
    errors.push(`deathMessages duplicate text: ${textDupe.slice(0, 40)}`);
  }
  for (const e of pack.entries) {
    if (e.text.trim().length < 25 || e.text.trim().length > 200) {
      errors.push(`deathMessages text length out of bounds for ${e.key}`);
    }
    const hit = containsBannedTerm(e.text);
    if (hit) errors.push(`deathMessages banned term (${hit}) in ${e.key}`);
  }
  return errors;
}

/** Validate the tavern rumors pack schema, stage distribution, duplicates, and banned terms. */
export function validateTavernRumorsPack(pack: TavernRumorsPack): string[] {
  const errors: string[] = [];
  if (!Array.isArray(pack.entries)) {
    return ['tavernRumors.entries must be an array'];
  }
  if (pack.entries.length !== 40) {
    errors.push(`tavernRumors expected 40 entries, got ${pack.entries.length}`);
  }
  for (const keyDupe of collectDuplicateStrings(pack.entries.map((e) => e.key))) {
    errors.push(`tavernRumors duplicate key: ${keyDupe}`);
  }
  for (const textDupe of collectDuplicateStrings(pack.entries.map((e) => e.text.trim()))) {
    errors.push(`tavernRumors duplicate text: ${textDupe.slice(0, 40)}`);
  }
  const stageCounts = new Map<number, number>([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ]);
  for (const e of pack.entries) {
    stageCounts.set(e.stage, (stageCounts.get(e.stage) ?? 0) + 1);
    if (e.text.trim().length < 30 || e.text.trim().length > 220) {
      errors.push(`tavernRumors text length out of bounds for ${e.key}`);
    }
    const hit = containsBannedTerm(e.text);
    if (hit) errors.push(`tavernRumors banned term (${hit}) in ${e.key}`);
  }
  for (const stage of [1, 2, 3, 4] as const) {
    const count = stageCounts.get(stage) ?? 0;
    if (count !== 10) {
      errors.push(`tavernRumors stage ${stage} expected 10 entries, got ${count}`);
    }
  }
  return errors;
}

/** Validate the 40 location lore plaques pack schema, per-map counts, duplicates, and banned terms. */
export function validateLocationPlaquesPack(pack: LocationPlaquesPack): string[] {
  const errors: string[] = [];
  if (!Array.isArray(pack.entries)) {
    return ['locationPlaques.entries must be an array'];
  }
  if (pack.entries.length !== 40) {
    errors.push(`locationPlaques expected 40 entries, got ${pack.entries.length}`);
  }
  for (const keyDupe of collectDuplicateStrings(pack.entries.map((e) => e.key))) {
    errors.push(`locationPlaques duplicate key: ${keyDupe}`);
  }
  for (const titleDupe of collectDuplicateStrings(pack.entries.map((e) => e.title.trim()))) {
    errors.push(`locationPlaques duplicate title: ${titleDupe}`);
  }
  for (const textDupe of collectDuplicateStrings(pack.entries.map((e) => e.text.trim()))) {
    errors.push(`locationPlaques duplicate text: ${textDupe.slice(0, 40)}`);
  }

  const expectedMaps: Record<CampaignStage, CampaignMapId> = {
    1: 'map1-border-fords',
    2: 'map2-redmarsh-wastes',
    3: 'map3-iron-coast',
    4: 'map4-obsidian-caldera',
  };
  const actCounts = new Map<number, number>([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ]);

  for (const e of pack.entries) {
    actCounts.set(e.act, (actCounts.get(e.act) ?? 0) + 1);
    const keyMatch = /^plaque\.map([1-4])\.[a-z0-9_]+$/.exec(e.key);
    if (!keyMatch || Number(keyMatch[1]) !== e.act) {
      errors.push(`locationPlaques invalid key/act alignment: ${e.key} (act ${e.act})`);
    }
    if (e.mapId !== expectedMaps[e.act]) {
      errors.push(`locationPlaques mapId mismatch for ${e.key}: ${e.mapId}`);
    }
    if (e.region.trim().length < 3 || e.region.trim().length > 60) {
      errors.push(`locationPlaques region length out of bounds for ${e.key}`);
    }
    if (e.title.trim().length < 5 || e.title.trim().length > 70) {
      errors.push(`locationPlaques title length out of bounds for ${e.key}`);
    }
    if (e.text.trim().length < 45 || e.text.trim().length > 240) {
      errors.push(`locationPlaques text length out of bounds for ${e.key}`);
    }
    for (const field of [e.key, e.region, e.title, e.text]) {
      if (/[^\x20-\x7E]/.test(field)) {
        errors.push(`locationPlaques non-ASCII character in ${e.key}`);
      }
      const hit = containsBannedTerm(field);
      if (hit) errors.push(`locationPlaques banned term (${hit}) in ${e.key}`);
    }
  }

  for (const act of [1, 2, 3, 4] as const) {
    const count = actCounts.get(act) ?? 0;
    if (count !== 10) {
      errors.push(`locationPlaques act ${act} expected 10 entries, got ${count}`);
    }
  }
  return errors;
}

/** Validate a flat key-to-string dictionary pack (barks, item-lore, spell-flavor). */
export function validateFlatTextPack(
  pack: Readonly<Record<string, unknown>>,
  label: string,
  opts: { maxLen?: number; requireAscii?: boolean } = {},
): string[] {
  const maxLen = opts.maxLen ?? 90;
  const requireAscii = opts.requireAscii ?? true;
  const errors: string[] = [];
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    return [`${label} must be a flat JSON object`];
  }
  const vals: string[] = [];
  for (const [k, v] of Object.entries(pack)) {
    if (!k || k.trim().length === 0) {
      errors.push(`${label} contains an empty key`);
      continue;
    }
    if (typeof v !== 'string') {
      errors.push(`${label}[${k}] must be a string`);
      continue;
    }
    const trimmed = v.trim();
    if (trimmed.length === 0) {
      errors.push(`${label}[${k}] is empty`);
      continue;
    }
    if (v.length > maxLen) {
      errors.push(`${label}[${k}] length ${v.length} > ${maxLen}`);
    }
    if (requireAscii && !/^[\x20-\x7E]+$/.test(v)) {
      errors.push(`${label}[${k}] contains non-ASCII or control characters`);
    }
    const hitKey = containsBannedTerm(k);
    if (hitKey) errors.push(`${label}[${k}] key contains banned term (${hitKey})`);
    const hitVal = containsBannedTerm(v);
    if (hitVal) errors.push(`${label}[${k}] value contains banned term (${hitVal})`);
    vals.push(trimmed);
  }
  for (const valDupe of collectDuplicateStrings(vals)) {
    errors.push(`${label} duplicate value: ${valDupe.slice(0, 40)}`);
  }
  return errors;
}

/** Validate all core runtime packs together, including cross-pack key uniqueness. */
export function validateAllTextPacks(
  bundle: TextPacksBundle,
  expectedBestiaryIds?: readonly string[],
): string[] {
  const errors: string[] = [
    ...validateBestiaryPack(bundle.bestiary, expectedBestiaryIds),
    ...validateAchievementsPack(bundle.achievements),
    ...validateLoadingTipsPack(bundle.loadingTips),
    ...validateDeathMessagesPack(bundle.deathMessages),
    ...validateTavernRumorsPack(bundle.tavernRumors),
    ...(bundle.locationPlaques ? validateLocationPlaquesPack(bundle.locationPlaques) : []),
  ];

  const allKeys = [
    ...bundle.bestiary.entries.flatMap((e) => [e.nameKey, e.loreKey]),
    ...bundle.achievements.entries.flatMap((e) => [e.titleKey, e.descKey]),
    ...bundle.loadingTips.entries.map((e) => e.key),
    ...bundle.deathMessages.entries.map((e) => e.key),
    ...bundle.tavernRumors.entries.map((e) => e.key),
    ...(bundle.locationPlaques ? bundle.locationPlaques.entries.map((e) => e.key) : []),
  ];
  for (const keyDupe of collectDuplicateStrings(allKeys)) {
    errors.push(`cross-pack duplicate key: ${keyDupe}`);
  }
  return errors;
}

/** Validate all 9 text packs together (6 public + 3 src bundled), including cross-pack uniqueness. */
export function validateAllNineTextPacks(
  bundle: AllTextPacksBundle,
  expectedBestiaryIds?: readonly string[],
): string[] {
  const errors: string[] = [
    ...validateAllTextPacks(bundle, expectedBestiaryIds),
    ...validateFlatTextPack(bundle.barks, 'barks'),
    ...validateFlatTextPack(bundle.itemLore, 'itemLore'),
    ...validateFlatTextPack(bundle.spellFlavor, 'spellFlavor'),
  ];

  const allKeys = [
    ...bundle.bestiary.entries.flatMap((e) => [e.nameKey, e.loreKey]),
    ...bundle.achievements.entries.flatMap((e) => [e.titleKey, e.descKey]),
    ...bundle.loadingTips.entries.map((e) => e.key),
    ...bundle.deathMessages.entries.map((e) => e.key),
    ...bundle.tavernRumors.entries.map((e) => e.key),
    ...bundle.locationPlaques.entries.map((e) => e.key),
    ...Object.keys(bundle.barks),
    ...Object.keys(bundle.itemLore),
    ...Object.keys(bundle.spellFlavor),
  ];
  for (const keyDupe of collectDuplicateStrings(allKeys)) {
    errors.push(`cross-pack duplicate key across all 9 packs: ${keyDupe}`);
  }

  const allTexts = [
    ...bundle.bestiary.entries.map((e) => e.lore.trim()),
    ...bundle.achievements.entries.map((e) => e.desc.trim()),
    ...bundle.loadingTips.entries.map((e) => e.text.trim()),
    ...bundle.deathMessages.entries.map((e) => e.text.trim()),
    ...bundle.tavernRumors.entries.map((e) => e.text.trim()),
    ...bundle.locationPlaques.entries.map((e) => e.text.trim()),
    ...Object.values(bundle.barks).map((v) => v.trim()),
    ...Object.values(bundle.itemLore).map((v) => v.trim()),
    ...Object.values(bundle.spellFlavor).map((v) => v.trim()),
  ];
  for (const textDupe of collectDuplicateStrings(allTexts)) {
    errors.push(`cross-pack duplicate text across all 9 packs: ${textDupe.slice(0, 48)}`);
  }

  return errors;
}
