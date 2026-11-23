import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUNDLED_BESTIARY,
  discoverItem,
  getAllBestiaryLore,
  getAllItemLoreKeys,
  getBestiaryCount,
  getBestiaryLore,
  getCodexProgress,
  getItemLore,
  getItemLoreCount,
  getItemLoreLines,
  getSetLore,
  hydrateCodexBestiary,
  resetCodex,
  resetCodexBestiaryCache,
  searchBestiaryLore,
} from '../src/codex';
import {
  type AchievementsPack,
  type BestiaryPack,
  type DeathMessagesPack,
  type LoadingTipsPack,
  type LocationPlaquesPack,
  type TavernRumorsPack,
  BARKS_PACK,
  ITEM_LORE_PACK,
  SPELL_FLAVOR_PACK,
  containsBannedTerm,
  getBarkLine,
  getBarksByMerc,
  getItemLoreLine,
  getPlaqueByKey,
  getPlaquesByAct,
  getPlaquesByMap,
  getSpellFlavorLine,
  loadAllNineTextPacks,
  loadLocationPlaques,
  validateAllNineTextPacks,
  validateLocationPlaquesPack,
} from '../src/data/text/index';
import { ITEMS } from '../src/sim/items';
import { ALL_SETS } from '../src/sim/sets';
import {
  BUNDLED_DEATH_MESSAGES,
  BUNDLED_LOADING_TIPS,
  LOW_HP_TIP,
  Tips,
  getAllDeathMessages,
  getAllLoadingTips,
  getDeathMessage,
  getDeathMessageByKey,
  getDefeatFlavor,
  getLoadingTip,
  getLoadingTipByKey,
  hydrateCuratedTips,
  resetCuratedTipsCache,
} from '../src/tips';

const ROOT = resolve(import.meta.dirname, '..');
const PUB_TEXT_DIR = resolve(ROOT, 'public/data/text');
const SPRITES_DIR = resolve(ROOT, 'public/sprites');

function readPubJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(resolve(PUB_TEXT_DIR, fileName), 'utf8')) as T;
}

function getSpriteUnitIds(): string[] {
  return readdirSync(SPRITES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .filter((id) => id !== 'hero' && id !== 'necromancer')
    .sort();
}

describe('Text & Lore Wave 2 Integration', () => {
  const bestiary = readPubJson<BestiaryPack>('bestiary-52.json');
  const achievements = readPubJson<AchievementsPack>('achievements-60.json');
  const loadingTips = readPubJson<LoadingTipsPack>('loading-tips-50.json');
  const deathMessages = readPubJson<DeathMessagesPack>('death-messages-30.json');
  const tavernRumors = readPubJson<TavernRumorsPack>('tavern-rumors-40.json');
  const locationPlaques = readPubJson<LocationPlaquesPack>('location-plaques-40.json');

  beforeEach(() => {
    resetCuratedTipsCache();
    resetCodexBestiaryCache();
    resetCodex();
  });

  afterEach(() => {
    resetCuratedTipsCache();
    resetCodexBestiaryCache();
  });

  it('validates all 40 location lore plaques across Maps 1-4 (10 per map, zero banned words)', () => {
    expect(locationPlaques.version).toBe(1);
    expect(locationPlaques.entries).toHaveLength(40);
    expect(validateLocationPlaquesPack(locationPlaques)).toEqual([]);

    expect(getPlaquesByMap(locationPlaques.entries, 'map1-border-fords')).toHaveLength(10);
    expect(getPlaquesByMap(locationPlaques.entries, 'map2-redmarsh-wastes')).toHaveLength(10);
    expect(getPlaquesByMap(locationPlaques.entries, 'map3-iron-coast')).toHaveLength(10);
    expect(getPlaquesByMap(locationPlaques.entries, 'map4-obsidian-caldera')).toHaveLength(10);

    for (const act of [1, 2, 3, 4] as const) {
      const entries = getPlaquesByAct(locationPlaques.entries, act);
      expect(entries).toHaveLength(10);
      for (const plaque of entries) {
        expect(plaque.key).toMatch(new RegExp(`^plaque\\.map${act}\\.[a-z0-9_]+$`));
        expect(containsBannedTerm(plaque.title)).toBeNull();
        expect(containsBannedTerm(plaque.text)).toBeNull();
        expect(containsBannedTerm(plaque.region)).toBeNull();
      }
    }

    expect(getPlaqueByKey(locationPlaques.entries, 'plaque.map1.alder_bridge_cutwater')?.region).toBe(
      'Alder Bridge',
    );
    expect(getPlaqueByKey(locationPlaques.entries, 'plaque.map4.colonnade_obsidian_dais')?.act).toBe(4);
  });

  it('covers and validates all 9 text packs via src/data/text/index.ts', async () => {
    const fileMap: Record<string, unknown> = {
      '/thornvael/data/text/bestiary-52.json': bestiary,
      '/thornvael/data/text/achievements-60.json': achievements,
      '/thornvael/data/text/loading-tips-50.json': loadingTips,
      '/thornvael/data/text/death-messages-30.json': deathMessages,
      '/thornvael/data/text/tavern-rumors-40.json': tavernRumors,
      '/thornvael/data/text/location-plaques-40.json': locationPlaques,
    };

    const singlePlaquePack = await loadLocationPlaques('/thornvael/', async (url) => fileMap[url]);
    expect(singlePlaquePack.entries).toHaveLength(40);

    const bundle = await loadAllNineTextPacks('/thornvael/', async (url) => {
      if (!(url in fileMap)) throw new Error(`Unexpected URL: ${url}`);
      return fileMap[url];
    });

    expect(Object.keys(bundle.barks)).toHaveLength(264);
    expect(Object.keys(bundle.itemLore)).toHaveLength(273);
    expect(Object.keys(bundle.spellFlavor)).toHaveLength(50);
    expect(bundle.barks).toBe(BARKS_PACK);
    expect(bundle.itemLore).toBe(ITEM_LORE_PACK);
    expect(bundle.spellFlavor).toBe(SPELL_FLAVOR_PACK);

    expect(validateAllNineTextPacks(bundle, getSpriteUnitIds())).toEqual([]);

    expect(getBarkLine('merc.thornwick_levyman.select.1')).toContain('Pike');
    expect(getBarksByMerc('thornwick_levyman', 'select')).toHaveLength(2);
    expect(getItemLoreLine('item.unique.uniq-morvessa-spindle.lore')).toContain('silk-gland');
    expect(getSpellFlavorLine('Fire Bolt')).toContain('copper-bound ley-line');
    expect(getSpellFlavorLine('spell.meteor.flavor')).toContain('caldera slag');
  });

  it('passes tools/check-text.mjs across both src/data/text and public/data/text', () => {
    const jsonOut = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { checkAllTextPacks } from './tools/check-text.mjs'; console.log(JSON.stringify(checkAllTextPacks()));",
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    const result = JSON.parse(jsonOut) as {
      ok: boolean;
      errors: string[];
      stats: {
        srcFiles: number;
        srcKeys: number;
        publicFiles: number;
        publicEntries: number;
        publicKeys: number;
        totalKeys: number;
      };
    };
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.stats.srcFiles).toBe(3);
    expect(result.stats.srcKeys).toBe(587);
    expect(result.stats.publicFiles).toBe(6);
    expect(result.stats.publicEntries).toBe(272);
    expect(result.stats.publicKeys).toBe(384);
    expect(result.stats.totalKeys).toBe(971);

    const stdout = execFileSync(process.execPath, ['tools/check-text.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(stdout).toContain('Text check passed');
    expect(stdout).toContain('0 errors');
  });

  it('integrates loading-tips-50 and death-messages-30 live in src/tips.ts with sync fallback', async () => {
    expect(BUNDLED_LOADING_TIPS).toEqual(loadingTips.entries);
    expect(BUNDLED_DEATH_MESSAGES).toEqual(deathMessages.entries);
    expect(getAllLoadingTips()).toHaveLength(50);
    expect(getAllDeathMessages()).toHaveLength(30);
    expect(LOW_HP_TIP).toBe(35);

    expect(getLoadingTip(() => 0)).toBe(loadingTips.entries[0].text);
    expect(getLoadingTip(() => 0.999)).toBe(loadingTips.entries[49].text);
    expect(getLoadingTipByKey('tip.25')?.text).toContain('Export your save file');

    expect(getDeathMessage(() => 0)).toBe(deathMessages.entries[0].text);
    expect(getDeathMessage(() => 0.999)).toBe(deathMessages.entries[29].text);
    expect(getDeathMessageByKey('death.15')?.text).toContain('vitrified glass');

    const defeat = getDefeatFlavor(() => 0);
    expect(defeat.deathMessage).toBe(deathMessages.entries[0].text);
    expect(defeat.loadingTip).toBe(loadingTips.entries[0].text);
    expect(defeat.formatted).toContain(defeat.deathMessage);
    expect(defeat.formatted).toContain(`Tip: ${defeat.loadingTip}`);

    // Contextual first-time tip persistence still works unchanged
    const tipTracker = new Tips(null);
    expect(tipTracker.once('lowHp')).toBe(true);
    expect(tipTracker.once('lowHp')).toBe(false);

    // Offline hydration preserves bundled fallback
    const offlineCounts = await hydrateCuratedTips('/thornvael/', async () => {
      throw new Error('offline');
    });
    expect(offlineCounts).toEqual({ tipsCount: 50, deathsCount: 30 });

    // Custom runtime override hydration works
    const customCounts = await hydrateCuratedTips('/thornvael/', async (url) => {
      if (url.endsWith('loading-tips-50.json')) {
        return { version: 1, entries: [{ key: 'tip.override', text: 'Custom tip override for hydration verification.' }] };
      }
      return { version: 1, entries: [{ key: 'death.override', text: 'Custom death epitaph for hydration verification.' }] };
    });
    expect(customCounts).toEqual({ tipsCount: 1, deathsCount: 1 });
    expect(getLoadingTip()).toBe('Custom tip override for hydration verification.');
    expect(getDeathMessage()).toBe('Custom death epitaph for hydration verification.');
  });

  it('integrates bestiary-52 and item-lore live in src/codex.ts without breaking relic tracking', async () => {
    expect(BUNDLED_BESTIARY).toEqual(bestiary.entries);
    expect(getBestiaryCount()).toBe(52);
    expect(getAllBestiaryLore()).toHaveLength(52);

    const morvessa = getBestiaryLore('morvessa');
    expect(morvessa?.name).toBe('Morvessa, the Silk Widow');
    expect(morvessa?.weakness).toContain('Fire magic');

    expect(getBestiaryLore('beast-gloom-stag')?.id).toBe('gloom-stag');
    expect(getBestiaryLore('Ashkarath, the Cinder King')?.id).toBe('ashkarath');
    expect(searchBestiaryLore('Salt Tithe').some((e) => e.id === 'morvessa')).toBe(true);

    expect(getItemLoreCount()).toBe(273);
    expect(getAllItemLoreKeys()).toHaveLength(273);

    // Lookup by key, multi-part unique id, set id, piece name, and numeric ITEMS id
    expect(getItemLore('item.unique.uniq-morvessa-spindle.lore')).toContain('calcified silk-gland');
    const tollLines = getItemLoreLines('uniq-tollkeeper-bill');
    expect(tollLines).toHaveLength(2);
    expect(getItemLore('uniq-tollkeeper-bill')).toContain('Sunken Ford');

    expect(getSetLore('iron_warden')).toContain('forty waves');
    expect(getSetLore('set-thornwick-picket')).toContain('pay-wagons stopped');

    // Sim set piece with NO inline .lore field on Set item resolves live from item-lore.json
    const pyroSet = ALL_SETS.find((s) => s.id === 'pyromancer')!;
    const emberFocusId = ITEMS.findIndex((it) => it.name === pyroSet.pieces[0].name);
    expect(emberFocusId).toBeGreaterThanOrEqual(0);
    expect(getItemLore(emberFocusId)).toContain('hearth-heat');

    // Relic discovery remains intact
    expect(discoverItem(emberFocusId)).toBe(true);
    expect(getCodexProgress().discovered).toBe(1);

    // Offline bestiary hydration keeps bundled 52 entries
    const count = await hydrateCodexBestiary('/thornvael/', async () => {
      throw new Error('offline');
    });
    expect(count).toBe(52);
  });
});
