import { expect, test } from '@playwright/test';
import type { HeroUi } from '../src/heroui';
import type { Sim } from '../src/sim/sim';

interface HeroGame { sim: Sim; heroUi: HeroUi }

test.beforeEach(async ({ page }) => {
  await page.goto('/thornvael/?hero=warrior,m,medium');
  await page.waitForFunction(() => (window as unknown as { __game?: HeroGame }).__game);
  await page.keyboard.press('Space');
  await page.locator('#btn-hero').click();
});

test('named equipment keeps its icon and command action when moved into the pack', async ({ page }) => {
  // Orders intentionally wait during pause; resume through the existing control.
  await page.locator('#sheet [data-k="close"]').click();
  await page.locator('#btn-pause').click();
  await page.locator('#btn-hero').click();
  const equipped = page.locator('#sheet [data-k="eq0"]');
  const name = await equipped.evaluate((el) => [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)!.textContent!);
  const item = await page.evaluate(() => (window as unknown as { __game: HeroGame }).__game.sim.hero!.eq[0]);
  expect(item).toBeGreaterThanOrEqual(0);
  await expect(equipped).toHaveAccessibleName(new RegExp(name));
  await expect(equipped.locator('svg[aria-hidden="true"]')).toHaveCount(1);
  await equipped.click();
  await page.locator('#sheet [data-k="act-unequip"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: HeroGame }).__game.sim.hero!.eq[0])).toBe(-1);
  await expect(equipped.locator('svg')).toHaveAttribute('data-icon', 'empty');
  await page.locator('#sheet [data-k="tab1"]').click();
  const packed = page.locator('#sheet .items .hero-gear-cell > button[data-k^="inv"]').filter({ hasText: name });
  await expect(packed).toHaveAccessibleName(new RegExp(name));
  await expect(packed.locator('svg[aria-hidden="true"]')).toHaveCount(1);
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

test('skill thresholds and growth explanations are visible without hover, including the cap', async ({ page }) => {
  await page.evaluate(() => {
    const g = (window as unknown as { __game: HeroGame }).__game;
    g.sim.hero!.skill = [2, 10, 0];
    g.sim.hero!.use = [23, 0, 0];
    g.heroUi.refresh(true);
  });
  const blade = page.locator('#sheet [data-skill="0"]');
  await expect(blade.getByText('23 / 24 uses · 1 to level 3.', { exact: false })).toBeVisible();
  await expect(blade.getByText('Grows with blows struck.', { exact: false })).toBeVisible();
  await expect(blade.getByRole('progressbar', { name: 'Blade progress' })).toHaveAttribute('max', '24');
  await expect(blade.getByRole('progressbar')).toHaveAttribute('value', '23');
  const guard = page.locator('#sheet [data-skill="1"]');
  await expect(guard.getByText('Maximum level reached.', { exact: false })).toBeVisible();
  await expect(guard.getByText('+1 absorb per 3 levels.', { exact: false })).toBeVisible();
  await expect(page.locator('#sheet [data-skill="2"]').getByText('0 / 8 uses · 8 to level 1.', { exact: false })).toBeVisible();
  await expect(page.locator('#sheet [data-skill="2"]').getByText('Grows with spells cast.', { exact: false })).toBeVisible();
});
