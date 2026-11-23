import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type AchievementsPack,
  type BestiaryPack,
  type DeathMessagesPack,
  type LoadingTipsPack,
  type TavernRumorsPack,
  type TextPacksBundle,
  getAchievementById,
  getAchievementsByCategory,
  getBestiaryEntry,
  getRandomDeathMessage,
  getRandomTip,
  getRumorsByHub,
  getRumorsByStage,
  loadAllTextPacks,
  validateAllTextPacks,
} from '../src/data/text/index';

const ROOT = resolve(import.meta.dirname, '..');
const TEXT_DIR = resolve(ROOT, 'public/data/text');
const SPRITES_DIR = resolve(ROOT, 'public/sprites');

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(resolve(TEXT_DIR, fileName), 'utf8')) as T;
}

function getSpriteUnitIds(): string[] {
  return readdirSync(SPRITES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .filter((id) => id !== 'hero' && id !== 'necromancer')
    .sort();
}

describe('Core Text & Lore Packs', () => {
  const bestiary = readJson<BestiaryPack>('bestiary-52.json');
  const achievements = readJson<AchievementsPack>('achievements-60.json');
  const loadingTips = readJson<LoadingTipsPack>('loading-tips-50.json');
  const deathMessages = readJson<DeathMessagesPack>('death-messages-30.json');
  const tavernRumors = readJson<TavernRumorsPack>('tavern-rumors-40.json');

  const bundle: TextPacksBundle = {
    bestiary,
    achievements,
    loadingTips,
    deathMessages,
    tavernRumors,
  };

  it('has exact required entry counts across all 5 packs', () => {
    expect(bestiary.entries).toHaveLength(52);
    expect(achievements.entries).toHaveLength(60);
    expect(loadingTips.entries).toHaveLength(50);
    expect(deathMessages.entries).toHaveLength(30);
    expect(tavernRumors.entries).toHaveLength(40);
  });

  it('covers all 52 non-hero unit sprite families in bestiary-52.json', () => {
    const spriteIds = getSpriteUnitIds();
    expect(spriteIds).toHaveLength(52);
    const bestiaryIds = bestiary.entries.map((e) => e.id).sort();
    expect(bestiaryIds).toEqual(spriteIds);
  });

  it('has 10 tavern rumors per act stage (1..4) mapped to the 4 hubs', () => {
    expect(getRumorsByStage(tavernRumors.entries, 1)).toHaveLength(10);
    expect(getRumorsByStage(tavernRumors.entries, 2)).toHaveLength(10);
    expect(getRumorsByStage(tavernRumors.entries, 3)).toHaveLength(10);
    expect(getRumorsByStage(tavernRumors.entries, 4)).toHaveLength(10);

    expect(getRumorsByHub(tavernRumors.entries, 'town-thornwick')).toHaveLength(10);
    expect(getRumorsByHub(tavernRumors.entries, 'town-redmarsh')).toHaveLength(10);
    expect(getRumorsByHub(tavernRumors.entries, 'town-oakhaven')).toHaveLength(10);
    expect(getRumorsByHub(tavernRumors.entries, 'town-ironcamp')).toHaveLength(10);
  });

  it('passes schema, duplicate key, duplicate text, length bounds, and banned-term checks', () => {
    const spriteIds = getSpriteUnitIds();
    const errors = validateAllTextPacks(bundle, spriteIds);
    expect(errors).toEqual([]);
  });

  it('supports typed loaders and deterministic lookup helpers', async () => {
    const fileMap: Record<string, unknown> = {
      '/thornvael/data/text/bestiary-52.json': bestiary,
      '/thornvael/data/text/achievements-60.json': achievements,
      '/thornvael/data/text/loading-tips-50.json': loadingTips,
      '/thornvael/data/text/death-messages-30.json': deathMessages,
      '/thornvael/data/text/tavern-rumors-40.json': tavernRumors,
    };

    const loaded = await loadAllTextPacks('/thornvael/', async (url) => {
      if (!(url in fileMap)) throw new Error(`Unexpected URL: ${url}`);
      return fileMap[url];
    });

    expect(getBestiaryEntry(loaded.bestiary.entries, 'morvessa')?.name).toBe(
      'Morvessa, the Silk Widow',
    );
    expect(getAchievementById(loaded.achievements.entries, 'act4_complete')?.category).toBe(
      'campaign',
    );
    expect(getAchievementsByCategory(loaded.achievements.entries, 'combat')).toHaveLength(10);
    expect(getRandomTip(loaded.loadingTips.entries, () => 0)?.key).toBe('tip.01');
    expect(getRandomDeathMessage(loaded.deathMessages.entries, () => 0.99)?.key).toBe('death.30');
  });
});
