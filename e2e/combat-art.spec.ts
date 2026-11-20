import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ALL_UNIT_ART } from '../src/sprites/units';

interface Art {
  unit: string; frame: string; requestedClip: string; resolvedClip: string; fallback: boolean;
  source: number; sources: number; filters: boolean; colors: number[];
}
interface Game {
  previewArt(): Art[];
  artMetrics(): { loadedFamilies: string[]; uniqueGpuSources: number; approxAtlasBytes: number };
}

const FAMILIES = ALL_UNIT_ART;

for (const [index, clip] of ['stand', 'walk', 'attack', 'cast', 'hurt', 'die'].entries()) {
  test(`shipped ${clip}: all unit and boss families and 16 facings retain palettes, anchors and shared sources`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/thornvael/?hero=warrior,m,medium&art=1');
    await page.waitForFunction(() => (window as unknown as { __game?: Game }).__game?.previewArt()?.[0]?.frame);
    await page.keyboard.press('Pause');
    const art = () => page.evaluate(() => (window as unknown as { __game: Game }).__game.previewArt());
    const original = await art();
    await page.getByLabel('Animation', { exact: true }).selectOption(String(index));
    await page.getByLabel('Team', { exact: true }).selectOption('2');
    await page.getByLabel('Armour', { exact: true }).selectOption('4');
    await page.getByLabel('Monster level', { exact: true }).selectOption('4');
    await expect.poll(async () => (await art()).map((a) => a.colors)).toEqual(
      Array.from({ length: FAMILIES.length }, () => [0xffffff, 0x8bd675, 0xe4bf69, 0x98a8df]));
    for (let dir = 0; dir < 16; dir++) {
      await page.getByLabel('Facing', { exact: true }).selectOption(String(dir));
      await expect.poll(async () => (await art()).map((a) => a.frame)).toEqual(
        FAMILIES.map((unit) => `${unit}/${clip}/${String((dir + 12) & 15).padStart(2, '0')}/00`));
      const current = await art();
      expect(current.map((a) => a.source)).toEqual(original.map((a) => a.source));
      for (const a of current) {
        expect(a).toMatchObject({ requestedClip: clip, resolvedClip: clip, fallback: false, sources: 1, filters: false });
        expect(a.colors).toEqual([0xffffff, 0x8bd675, 0xe4bf69, 0x98a8df]);
      }
    }
    const memory = await page.evaluate(() => (window as unknown as { __game: Game }).__game.artMetrics());
    expect(memory.loadedFamilies).toEqual([...FAMILIES]);
    expect(memory.uniqueGpuSources).toBe(FAMILIES.length);
    const atlasBytes = FAMILIES.reduce((bytes, name) => {
      const { w, h } = JSON.parse(readFileSync(`public/sprites/${name}.json`, 'utf8')).meta.size;
      return bytes + w * h * 4 * 4;
    }, 0);
    expect(memory.approxAtlasBytes).toBe(atlasBytes);
    if (clip === 'attack') await page.screenshot({ path: 'test-results/combat-art-attack.png' });
    expect(errors).toEqual([]);
  });
}
