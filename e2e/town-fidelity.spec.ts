import { expect, test, type Page } from '@playwright/test';
import type { Sim } from '../src/sim/sim';
import { readFileSync } from 'node:fs';
const itemData = JSON.parse(readFileSync('public/data/items.json', 'utf8')) as { items: { kind: string; slot?: string }[] };

interface TownGame {
  sim: Sim;
  centerOn(x: number, y: number): void;
  tile(x: number, y: number): [number, number];
  townTap(x: number, y: number): boolean;
}

async function enter(page: Page, role = 1): Promise<void> {
  await page.evaluate((role) => {
    const g = (window as unknown as { __game: TownGame }).__game;
    const c = g.sim.towns[0].centre[role]!;
    g.centerOn(c[0], c[1]);
    const [x, y] = g.tile(c[0], c[1]);
    g.townTap(x, y); // Same walking/arrival command path as tapping the building.
  }, role);
  await expect(page.locator(role === 1 ? '.town--shop' : '.town--tavern')).toBeVisible({ timeout: 20_000 });
}

async function gold(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __game: TownGame }).__game.sim.cb.gold[0]);
}

async function boot(page: Page): Promise<void> {
  await page.goto('/thornvael/?mission=market&hero=warrior,m,medium');
  await page.waitForFunction(() => (window as unknown as { __game?: TownGame }).__game);
  await page.getByRole('button', { name: 'Begin the mission', exact: true }).click();
  await page.locator('#mission').getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('#mission')).toBeHidden();
}

test('reference shop has six stock slots, ten pack slots, aligned original art and four monetary actions', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' }); // Compare camera bounds at rest, not the intentional cutout motion.
  await boot(page);
  await enter(page);
  const shop = page.locator('.town--shop');
  await expect(shop.locator('.shelf > *')).toHaveCount(6);
  await expect(shop.locator('.pack > *')).toHaveCount(10);
  await expect(shop.locator('.trade-actions > button')).toHaveCount(4);
  const columns = await shop.locator('.shelf').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(2);
  for (const image of await shop.locator('img').all()) await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const alignment = await shop.locator('.scene-art').evaluate((el) => {
    const [a, b] = [...el.querySelectorAll('img')].map((im) => im.getBoundingClientRect());
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height);
  });
  expect(alignment).toBeLessThan(1);
  await expect(page.locator('#toast')).toBeHidden({ timeout: 6_000 });
  await page.screenshot({ path: 'test-results/town-shop-desktop.png' });
  await shop.getByRole('button', { name: 'Next page: Shelf', exact: true }).click();
  expect(await shop.locator('.shelf button').first().getAttribute('data-slot')).toBe('6');
  await shop.getByRole('button', { name: 'Next page: Your pack', exact: true }).click();
  await shop.getByRole('button', { name: 'Next page: Your pack', exact: true }).click();
  await expect(shop.getByRole('button', { name: 'Next page: Your pack', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/town-shop-last-page.png' });
});

test('deselect then Undo removes the actual last pick; buy/sell changes gold and stock refreshes on return', async ({ page }) => {
  await boot(page);
  await enter(page);
  const shop = page.locator('.town--shop');
  const stock = shop.locator('.shelf button');
  for (const n of [0, 1, 2, 1]) await stock.nth(n).click();
  await shop.locator('.trade-actions button').nth(0).click();
  await expect(stock.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(stock.nth(2)).toHaveAttribute('aria-pressed', 'false');
  const price = Number(await stock.nth(0).locator('small').textContent());
  const before = await gold(page);
  await shop.locator('.trade-actions button').nth(1).click();
  expect(await gold(page)).toBe(before - price);
  await expect(shop.locator('.keeper')).toHaveClass(/pleased/);
  const item = shop.locator('.pack button').first();
  const sale = Number((await item.locator('small').textContent())!.split(' ')[0]);
  await item.click();
  const beforeSale = await gold(page);
  await shop.locator('.trade-actions button').nth(2).click();
  expect(await gold(page)).toBe(beforeSale + sale);
  const stockBefore = await page.evaluate(() => [...(window as unknown as { __game: TownGame }).__game.sim.town.stock[0]]);
  await shop.locator('.trade-actions button').nth(3).click();
  await expect(shop).toBeHidden();
  await enter(page);
  const stockAfter = await page.evaluate(() => [...(window as unknown as { __game: TownGame }).__game.sim.town.stock[0]]);
  expect(stockAfter).not.toEqual(stockBefore);
});

test('unaffordable basket is refused without a charge and gives merchant feedback', async ({ page }) => {
  await boot(page);
  await enter(page);
  const shop = page.locator('.town--shop');
  for (const index of [0, 1]) {
    if (index) await shop.getByRole('button', { name: 'Next page: Shelf', exact: true }).click();
    for (let n = 0; n < await shop.locator('.shelf button').count(); n++) await shop.locator('.shelf button').nth(n).click();
  }
  const before = await gold(page);
  const total = Math.abs(Number(await shop.locator('.trade-actions button').nth(1).locator('small').textContent()));
  expect(total).toBeGreaterThan(before);
  await shop.locator('.trade-actions button').nth(1).click();
  expect(await gold(page)).toBe(before);
  await expect(shop.locator('.keeper')).toHaveClass(/sorry/);
});

test('landscape phone can reach every shop control and tavern hiring/quests', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await boot(page);
  await enter(page);
  const shop = page.locator('.town--shop');
  for (const b of await shop.locator('button').all()) {
    await b.scrollIntoViewIfNeeded();
    const rect = await b.boundingBox();
    expect(rect!.width).toBeGreaterThanOrEqual(44);
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(845);
  }
  await shop.locator('.trade-actions button').nth(3).click();
  await expect(shop).toBeHidden();
  await enter(page, 0);
  const tavern = page.locator('.town--tavern');
  await expect(page.locator('#toast')).toBeHidden({ timeout: 6_000 });
  await page.screenshot({ path: 'test-results/town-tavern-mobile-top.png' });
  await expect(tavern.locator('.merc-panel .items button')).toHaveCount(4);
  await expect(tavern.locator('.quest-panel')).toContainText('Work on offer');
  const before = await gold(page);
  const hire = tavern.locator('.tavern-controls button').first();
  const price = Number(await hire.locator('small').textContent());
  await hire.click();
  expect(await gold(page)).toBe(before - price);
  await expect(tavern.locator('.tavern-controls button').first()).toBeDisabled();
  for (const b of await tavern.locator('button').all()) {
    await b.scrollIntoViewIfNeeded();
    const rect = await b.boundingBox();
    expect(rect!.width).toBeGreaterThanOrEqual(44);
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(391);
  }
  await tavern.locator('.quest-panel').scrollIntoViewIfNeeded();
  await expect(page.locator('#toast')).toBeHidden({ timeout: 6_000 });
  await page.screenshot({ path: 'test-results/town-tavern-mobile.png' });
});

test('narrow viewport keeps shelf, pack and monetary controls reachable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await enter(page);
  const shop = page.locator('.town--shop');
  for (const button of await shop.locator('button').all()) {
    await button.scrollIntoViewIfNeeded();
    const r = await button.boundingBox();
    expect(r!.width).toBeGreaterThanOrEqual(44);
    expect(r!.height).toBeGreaterThanOrEqual(44);
    expect(r!.x).toBeGreaterThanOrEqual(0);
    expect(r!.x + r!.width).toBeLessThanOrEqual(391);
    expect(r!.y).toBeGreaterThanOrEqual(0);
    expect(r!.y + r!.height).toBeLessThanOrEqual(845);
  }
  await shop.evaluate((el) => { el.scrollTop = 0; });
  await expect(page.locator('#toast')).toBeHidden({ timeout: 6_000 });
  await page.screenshot({ path: 'test-results/town-shop-narrow-top.png' });
});

test('modal owns keyboard and background focus, then restores gameplay on Escape', async ({ page }) => {
  await boot(page);
  await enter(page);
  const shop = page.locator('.town--shop');
  await expect(shop).toBeFocused();
  const before = await page.evaluate(() => {
    const g = (window as unknown as { __game: TownGame }).__game;
    return g.sim.log.length;
  });
  await page.keyboard.press('Space');
  await page.keyboard.press('i');
  await page.keyboard.press('m');
  expect(await page.evaluate(() => (window as unknown as { __game: TownGame }).__game.sim.log.length)).toBe(before);
  await expect(shop).toBeVisible();
  await page.locator('#btn-hero').evaluate((el) => (el as HTMLElement).focus());
  await expect(shop).toBeFocused();
  await expect(page.locator('#game')).toHaveAttribute('inert', '');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.town--shop'))).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.town--shop'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(shop).toBeHidden();
  await expect(page.locator('#game')).not.toHaveAttribute('inert', '');
});

test('duplicate gear slots remain independent across pack pages; inspection and Undo preserve quantities', async ({ page }) => {
  await boot(page);
  await enter(page);
  // Controlled inventory fixture, not a claim that these copies were earned in gameplay.
  await page.evaluate(() => {
    const h = (window as unknown as { __game: TownGame }).__game.sim.hero!;
    h.inv = Array.from({ length: 11 }, () => ({ item: h.eq[0], n: 1 }));
  });
  const shop = page.locator('.town--shop');
  await shop.getByRole('button', { name: 'Next page: Your pack', exact: true }).click();
  await shop.getByRole('button', { name: 'Previous page: Your pack', exact: true }).click();
  const pack = shop.locator('.pack button');
  const name = await pack.nth(0).locator('.item-name').textContent();
  const fee = Number(await pack.nth(0).locator('small').textContent());
  await pack.nth(0).click();
  await expect(pack.nth(1)).toHaveAttribute('aria-pressed', 'false');
  await pack.nth(1).click();
  await shop.locator('.shelf button').first().click();
  await pack.nth(0).click(); // Fully selected: inspect again without adding another sale.
  await expect(shop.locator('.selected-item')).toContainText(name!);
  await shop.getByRole('button', { name: 'Next page: Your pack', exact: true }).click();
  await shop.locator('.pack button').first().click();
  await shop.locator('.trade-actions button').nth(0).click(); // Undo only slot10.
  await expect(shop.locator('.pack button').first()).toHaveAttribute('aria-pressed', 'false');
  const before = await gold(page);
  await shop.locator('.trade-actions button').nth(2).click();
  expect(await gold(page)).toBe(before + fee * 2);
  expect(await page.evaluate(() => (window as unknown as { __game: TownGame }).__game.sim.hero!.inv.length)).toBe(9);
  await expect(shop.locator('.trade-actions button').nth(3).locator('small')).toHaveText(String(before + fee * 2));
  await shop.locator('.trade-actions button').nth(3).click();
  await expect(shop).toBeHidden();
  expect(await gold(page)).toBe(before + fee * 2); // Unsettled purchase never charged by Exit.
});

test('partial pack-capacity purchase retains only the unbought selection', async ({ page }) => {
  await boot(page);
  await enter(page);
  const ring = itemData.items.findIndex((item) => item.kind === 'gear' && item.slot === 'ring');
  await page.evaluate((ring) => {
    const h = (window as unknown as { __game: TownGame }).__game.sim.hero!;
    h.inv = Array.from({ length: 23 }, () => ({ item: ring, n: 1 }));
  }, ring);
  const shop = page.locator('.town--shop');
  await shop.getByRole('button', { name: 'Next page: Shelf', exact: true }).click();
  const stock = shop.locator('.shelf button');
  await stock.nth(0).click();
  await stock.nth(1).click(); // Production seed, page2: two gear slots, total300, only one pack slot free.
  await shop.locator('.trade-actions button').nth(1).click();
  expect(await page.evaluate(() => (window as unknown as { __game: TownGame }).__game.sim.hero!.inv.length)).toBe(24);
  await expect(shop.locator('.keeper .say')).toContainText('Only part');
  await expect(shop.locator('.shelf button[aria-pressed=true]')).toHaveCount(1);
});
