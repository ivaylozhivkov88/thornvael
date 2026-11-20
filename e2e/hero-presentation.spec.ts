import { expect, test } from '@playwright/test';
import type { HeroUi } from '../src/heroui';
import type { Sim } from '../src/sim/sim';

interface HeroGame { sim: Sim; heroUi: HeroUi }

test.beforeEach(async ({ page }) => {
  await page.goto('/thornvael/?hero=warrior,m,medium');
  await page.waitForFunction(() => (window as unknown as { __game?: HeroGame }).__game);
  await page.keyboard.press('Pause');
  await page.locator('#btn-inv').click();
});

test('named equipment keeps its icon and command action when moved into the pack', async ({ page }) => {
  // Orders intentionally wait during pause; resume through the Pause key.
  await page.locator('#sheet [data-k="close-inv"]').click();
  await page.keyboard.press('Pause');
  await page.locator('#btn-inv').click();
  const equipped = page.locator('#sheet [data-k="eq0"]');
  const name = await equipped.evaluate((el) => el.getAttribute('aria-label')!.split(': ').slice(1).join(': '));
  const item = await page.evaluate(() => (window as unknown as { __game: HeroGame }).__game.sim.hero!.eq[0]);
  expect(item).toBeGreaterThanOrEqual(0);
  await expect(equipped).toHaveAccessibleName(new RegExp(name));
  await expect(equipped.locator('img[aria-hidden="true"], svg[aria-hidden="true"]')).toHaveCount(1);
  await equipped.click();
  await page.locator('#sheet [data-k="act-unequip"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: HeroGame }).__game.sim.hero!.eq[0])).toBe(-1);
  await expect(equipped.locator('svg.hero-slot-watermark')).toHaveCount(1);
  const packed = page.locator(`#sheet .items .hero-gear-cell > button[data-k^="inv"][aria-label="${name}"]`);
  await expect(packed).toHaveAccessibleName(new RegExp(name));
  await expect(packed.locator('img[aria-hidden="true"], svg[aria-hidden="true"]')).toHaveCount(1);
  await expect(packed).toBeVisible();
  // The live hero sheet may replace its buttons when a queued action settles.
  // Re-resolve the locator and retry the visible geometry, not a detached node.
  await expect.poll(() => packed.evaluate((el) => {
    const r = el.getBoundingClientRect(); return Math.min(r.width, r.height);
  })).toBeGreaterThanOrEqual(44);
  await packed.click();
  await page.locator('#sheet [data-k="act-use"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: HeroGame }).__game.sim.hero!.eq[0])).toBe(item);
});

test('skill thresholds and growth explanations are visible in Character Stats, including the cap', async ({ page }) => {
  await page.locator('#btn-char').click();
  await page.evaluate(() => {
    const g = (window as unknown as { __game: HeroGame }).__game;
    g.sim.hero!.skill = [2, 10, 0];
    g.sim.hero!.use = [23, 0, 0];
    g.heroUi.refresh(true);
  });
  const blade = page.locator('#char-sheet [data-skill="0"]');
  await expect(blade).toContainText('Blade: Rank 2');
  await expect(blade).toHaveAttribute('aria-label', /23\/24 uses, 1 to Rank 3/);
  const guard = page.locator('#char-sheet [data-skill="1"]');
  await expect(guard).toContainText('Guard: Rank 10');
  await expect(guard).toHaveAttribute('aria-label', /Maximum Rank 10/);
  const sorcery = page.locator('#char-sheet [data-skill="2"]');
  await expect(sorcery).toContainText('Sorcery: Rank 0');
  await expect(sorcery).toHaveAttribute('aria-label', /0\/8 uses, 8 to Rank 1/);
});
