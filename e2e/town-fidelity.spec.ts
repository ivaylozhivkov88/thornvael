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
  // The first click only finishes the typewriter line; click until the briefing closes.
  const begin = page.getByRole('button', { name: /^Begin the mission/ });
  for (let i = 0; i < 4 && (await begin.isVisible()); i++) await begin.click();
  const cont = page.getByRole('button', { name: /^Continue \[/ });
  await cont.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
  for (let i = 0; i < 4 && (await cont.isVisible()); i++) await cont.click();
  await expect(page.locator('#mission')).toBeHidden();
}

test('shop lists the whole stock and pack in scroll boxes, with layered shop art and the tray actions', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' }); // Measure layer placement at rest.
  await boot(page);
  await enter(page);
  const shop = page.locator('.town--shop');
  expect(await shop.locator('.shelf > *').count()).toBeGreaterThan(6);
  expect(await shop.locator('.pack > *').count()).toBe(await page.evaluate(() => (window as unknown as { __game: TownGame }).__game.sim.hero!.inv.length));
  await expect(shop.locator('.trade-actions > button')).toHaveCount(5);
  await expect(shop.locator('.scroll-btn')).toHaveCount(4);
  await expect(shop.locator('.tray-buy')).toBeVisible();
  await expect(shop.locator('.tray-sell')).toBeVisible();
  const columns = await shop.locator('.shelf').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(2);
  for (const image of await shop.locator('img:not([hidden])').all()) await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const scene = shop.locator('.scene-art');
  const backdrop = scene.locator('img.town-backdrop');
  const merchant = scene.locator('img.merchant-actor');
  await expect(backdrop).toBeVisible();
  await expect(merchant).toBeVisible(); // animated merchant cutout overlays the counter since 0cf40d8
  await expect(backdrop).toHaveCSS('object-fit', 'contain');
  const backdropRatio = await backdrop.evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight);
  expect(backdropRatio).toBeCloseTo(4 / 3, 3);

  const frame = (await scene.boundingBox())!;
  const background = (await backdrop.boundingBox())!;
  expect(frame.width / frame.height).toBeCloseTo(4 / 3, 3);
  for (const edge of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(background[edge] - frame[edge]), `backdrop ${edge}`).toBeLessThan(1);
  }

  await expect(page.locator('#toast')).toBeHidden({ timeout: 6_000 });
  await page.screenshot({ path: 'test-results/town-shop-desktop.png' });
  const box = shop.locator('.scroll-box').first();
  await shop.getByRole('button', { name: 'Scroll down: Shelf', exact: true }).click();
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/town-shop-scrolled.png' });
});

test('tray: tap, Undo, and only Confirm deal moves gold; stock refreshes on return', async ({ page }) => {
  await boot(page);
  await enter(page);
  const shop = page.locator('.town--shop');
  const stock = shop.locator('.shelf button');
  for (const n of [0, 1, 2]) await stock.nth(n).click();
  await shop.locator('.trade-actions button').nth(1).click(); // Undo takes back slot 2 only.
  await expect(stock.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(stock.nth(2)).toHaveAttribute('aria-pressed', 'false');
  const p0 = parseInt((await stock.nth(0).locator('small').textContent())!, 10);
  const p1 = parseInt((await stock.nth(1).locator('small').textContent())!, 10);
  const before = await gold(page);
  expect(await gold(page)).toBe(before); // Picking alone never charges.
  await stock.nth(0).click(); // Potions are unlimited: a second tap adds another one.
  await shop.locator('.deal-btn').click();
  expect(await gold(page)).toBe(before - 2 * p0 - p1);
  await expect(shop.locator('.keeper')).toHaveClass(/pleased/);
  await expect(stock.nth(0)).toBeVisible(); // Potions never leave the shelf.
  const item = shop.locator('.pack button').first();
  const sale = Number((await item.locator('small').textContent())!.split(' ')[0]);
  await item.click();
  const beforeSale = await gold(page);
  await shop.locator('.deal-btn').click();
  expect(await gold(page)).toBe(beforeSale + sale);
  const stockBefore = await page.evaluate(() => [...(window as unknown as { __game: TownGame }).__game.sim.town.stock[0]]);
  await shop.locator('.trade-actions button').nth(4).click();
  await expect(shop).toBeHidden();
  await enter(page);
  const stockAfter = await page.evaluate(() => [...(window as unknown as { __game: TownGame }).__game.sim.town.stock[0]]);
  expect(stockAfter).not.toEqual(stockBefore);
});

test('unaffordable basket is refused without a charge and gives merchant feedback', async ({ page }) => {
  await boot(page);
  await enter(page);
  const shop = page.locator('.town--shop');
  for (let n = 0; n < await shop.locator('.shelf button').count(); n++) await shop.locator('.shelf button').nth(n).click();
  const before = await gold(page);
  const total = Math.abs(Number(await shop.locator('.deal-btn small').textContent()));
  expect(total).toBeGreaterThan(before);
  await expect(shop.locator('.deal-btn')).toBeDisabled();
  expect(await gold(page)).toBe(before);
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
  await shop.locator('.trade-actions button').nth(4).click();
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

test('duplicate gear slots stay independent in one scrolling pack; Undo and Confirm keep quantities', async ({ page }) => {
  await boot(page);
  // Controlled inventory fixture, not a claim that these copies were earned in gameplay.
  await page.evaluate(() => {
    const h = (window as unknown as { __game: TownGame }).__game.sim.hero!;
    h.inv = Array.from({ length: 11 }, () => ({ item: h.eq[0], n: 1 }));
  });
  await enter(page);
  const shop = page.locator('.town--shop');
  const pack = shop.locator('.pack button');
  await expect(pack).toHaveCount(11);
  const fee = Number(await pack.nth(0).locator('small').textContent());
  await pack.nth(0).click();
  await expect(pack.nth(1)).toHaveAttribute('aria-pressed', 'false');
  await pack.nth(1).click();
  await pack.nth(10).click();
  await shop.locator('.trade-actions button').nth(1).click(); // Undo only slot 10.
  await expect(pack.nth(10)).toHaveAttribute('aria-pressed', 'false');
  const before = await gold(page);
  await shop.locator('.deal-btn').click();
  expect(await gold(page)).toBe(before + fee * 2);
  expect(await page.evaluate(() => (window as unknown as { __game: TownGame }).__game.sim.hero!.inv.length)).toBe(9);
  await expect(shop.locator('.sheet-head .gold')).toHaveText(`Gold ${before + fee * 2}`);
  await shop.locator('.trade-actions button').nth(4).click();
  await expect(shop).toBeHidden();
  expect(await gold(page)).toBe(before + fee * 2);
});

test('partial pack-capacity purchase retains only the unbought selection', async ({ page }) => {
  await boot(page);
  await enter(page);
  const ring = itemData.items.findIndex((item) => item.kind === 'gear' && item.slot === 'ring');
  await page.evaluate((ring) => {
    const h = (window as unknown as { __game: TownGame }).__game.sim.hero!;
    h.inv = Array.from({ length: 23 }, () => ({ item: ring, n: 1 }));
    (window as unknown as { __game: TownGame }).__game.sim.cb.gold[0] = 1_000_000;
  }, ring);
  const shop = page.locator('.town--shop');
  const stock = shop.locator('.shelf button');
  await stock.nth(2).click();
  await stock.nth(3).click(); // Two one-off items, only one pack slot free.
  await shop.locator('.deal-btn').click();
  expect(await page.evaluate(() => (window as unknown as { __game: TownGame }).__game.sim.hero!.inv.length)).toBe(24);
  await expect(shop.locator('.keeper .say')).toContainText('Only part');
  await expect(shop.locator('.tray-buy .tray-row')).toHaveCount(1);
});
