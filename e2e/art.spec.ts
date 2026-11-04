import { expect, test } from '@playwright/test';

interface Art {
  unit: string; frame: string; colors: number[]; sources: number; source: number; filters: boolean; visible: boolean;
}
interface ArtGame {
  unitArt(id: number): Art | null;
  previewArt(): Art[];
  unitScreen(id: number): [number, number];
}

test('three in-game models, all facings, independent palettes and shared batch sources', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/thornvael/?hero=warrior,m,medium&art=1');
  await page.waitForFunction(() => (window as unknown as { __game?: ArtGame }).__game?.previewArt()?.[0]?.frame);
  const art = () => page.evaluate(() => (window as unknown as { __game: ArtGame }).__game.previewArt());
  const first = await art();
  expect(first.map((a) => a.unit)).toEqual(['hero', 'archer', 'golem']);
  expect(new Set(first.map((a) => a.source)).size).toBe(3);
  for (const a of first) { expect(a.sources).toBe(1); expect(a.filters).toBe(false); }
  for (let d = 0; d < 16; d++) {
    await page.getByLabel('Facing', { exact: true }).selectOption(String(d));
    await expect.poll(async () => (await art()).map((a) => a.frame.split('/')[2])).toEqual(Array(3).fill(String((d + 12) % 16).padStart(2, '0')));
  }
  await page.getByLabel('Animation', { exact: true }).selectOption('1');
  await expect.poll(async () => (await art())[0].frame).toContain('/walk/');
  const frames = new Set<string>();
  for (let n = 0; n < 12; n++) { frames.add((await art())[0].frame); await page.waitForTimeout(90); }
  expect(frames.size).toBeGreaterThan(3);
  await page.getByLabel('Facing', { exact: true }).selectOption('4');
  await page.getByLabel('Animation', { exact: true }).selectOption('0');
  await page.getByLabel('Armour', { exact: true }).selectOption('4');
  await page.getByLabel('Team', { exact: true }).selectOption('1');
  const levels = new Set<number>();
  const levelColors = [0x8fbc83, 0xc1ad74, 0xcd8461, 0x98a8df, 0xd68bc8];
  for (let level = 0; level < 5; level++) {
    await page.getByLabel('Monster level', { exact: true }).selectOption({ value: String(level) });
    await expect.poll(async () => ({
      color: (await art())[2].colors[3],
      heroColors: (await art())[0].colors.slice(0, 3),
      selected: await page.getByLabel('Monster level', { exact: true }).inputValue(),
      errors,
    })).toEqual({ color: levelColors[level], heroColors: [0xffffff, 0xf16b59, 0xe4bf69], selected: String(level), errors: [] });
    const current = await art();
    expect(current.map((a) => a.source)).toEqual(first.map((a) => a.source));
    expect(current[0].colors.slice(0, 3)).toEqual([0xffffff, 0xf16b59, 0xe4bf69]);
    levels.add(current[2].colors[3]);
  }
  expect(levels.size).toBe(5);
  await page.screenshot({ path: 'test-results/unit-art-desktop.png' });
  expect(errors).toEqual([]);
});

test('normal hero animates after a mouse order and freezes on keyboard pause', async ({ page }) => {
  await page.goto('/thornvael/?hero=warrior,m,medium');
  await page.waitForFunction(() => (window as unknown as { __game?: ArtGame }).__game?.unitArt(0)?.frame);
  const [x, y] = await page.evaluate(() => (window as unknown as { __game: ArtGame }).__game.unitScreen(0));
  await page.mouse.click(x, y);
  await page.mouse.click(x + 130, y - 60, { button: 'right' });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: ArtGame }).__game.unitArt(0)?.frame)).toContain('/walk/');
  await page.keyboard.press('Space');
  const frozen = await page.evaluate(() => (window as unknown as { __game: ArtGame }).__game.unitArt(0)?.frame);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as unknown as { __game: ArtGame }).__game.unitArt(0)?.frame)).toBe(frozen);
});

test('mobile viewport: art controls have touch targets and palette changes reach rendered sprites', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/thornvael/?hero=warrior,m,medium&art=1');
  await page.waitForFunction(() => (window as unknown as { __game?: ArtGame }).__game?.previewArt()?.[0]?.frame);
  const controls = page.getByRole('complementary', { name: 'Unit art preview' });
  for (const box of await controls.locator('select').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
  await page.getByLabel('Team', { exact: true }).selectOption('2');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: ArtGame }).__game.previewArt()[0].colors[1])).toBe(0x8bd675);
  await page.screenshot({ path: 'test-results/unit-art-mobile.png' });
});
