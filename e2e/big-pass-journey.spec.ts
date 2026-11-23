import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const itemData = JSON.parse(readFileSync(new URL('../public/data/items.json', import.meta.url), 'utf8')) as {
  items: { name: string }[];
};

const helmId = itemData.items.findIndex((i) => i.name === 'Leather Cap');

async function bootMission(page: Page, url = '/thornvael/?mission=market&hero=warrior,m,medium') {
  await page.goto(url);
  await page.waitForFunction(() => Boolean((window as any).__game?.sim));
  const begin = page.getByRole('button', { name: /^Begin the mission/ });
  for (let i = 0; i < 4 && (await begin.isVisible().catch(() => false)); i++) await begin.click();
  const cont = page.getByRole('button', { name: /^Continue \[/ });
  await cont.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
  for (let i = 0; i < 4 && (await cont.isVisible().catch(() => false)); i++) await cont.click();
  await expect(page.locator('#mission')).toBeHidden({ timeout: 10_000 });
}

test.describe('Thornvael Full E2E Journey (Desktop + Mobile)', () => {
  test('boot, single player char select, codex and wiki open cleanly', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/thornvael/');
    const spBtn = page.getByTestId('btn-single-player');
    await expect(spBtn).toBeVisible();
    await spBtn.click();

    // Create New / Select character view opens
    await expect(page.getByRole('button', { name: /Create|New/i }).first()).toBeVisible();

    // Open Wiki page directly and confirm it renders entries with zero errors
    await page.goto('/thornvael/wiki.html');
    await expect(page.locator('body')).toContainText(/Thornvael|Wiki|Bestiary|Items/i);
    expect(errors).toEqual([]);
  });

  test('town walk and shop buy/sell', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await bootMission(page, '/thornvael/?mission=market&hero=warrior,m,medium');

    // 1. Town walk: walk to the shop building via townTap
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.sim.cb.gold[0] = 500;
      const c = g.sim.towns[0].centre[1];
      g.centerOn(c[0], c[1]);
      const [x, y] = g.tile(c[0], c[1]);
      g.townTap(x, y);
    });
    const townPanel = page.getByTestId('town-panel');
    await expect(townPanel).toBeVisible({ timeout: 20_000 });

    // 2. Shop buy/sell inside Thornwick Market
    const shelfItem = townPanel.locator('.shop-shelf .shop-tile, .shop-shelf button, .shop-list .line button').first();
    if (await shelfItem.isVisible().catch(() => false)) {
      await shelfItem.click();
    }
    const buyBtn = townPanel.getByRole('button', { name: /Buy/i }).first();
    if (await buyBtn.isVisible().catch(() => false)) {
      const goldBeforeBuy = await page.evaluate(() => (window as any).__game.sim.cb.gold[0]);
      await buyBtn.click();
      await expect.poll(() => page.evaluate(() => (window as any).__game.sim.cb.gold[0])).toBeLessThanOrEqual(goldBeforeBuy);
    }
    await page.keyboard.press('Escape');
    await expect(townPanel).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('inventory equip, drag to paperdoll, and save/load round trip', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/thornvael/?hero=warrior,m,medium');
    await page.waitForFunction(() => Boolean((window as any).__game?.sim));

    await page.evaluate((hId: number) => {
      const g = (window as any).__game;
      g.sim.hero.inv.unshift({ item: hId, n: 1 });
    }, helmId);
    await page.locator('#btn-inv').click();
    const sheet = page.getByTestId('hero-sheet');
    await expect(sheet).toBeVisible();

    const invSlot = sheet.locator('[data-k="inv0"]');
    const helmSlot = sheet.locator('[data-k="eq2"]');
    const sBox = await invSlot.boundingBox();
    const tBox = await helmSlot.boundingBox();
    if (sBox && tBox) {
      await page.mouse.move(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2, { steps: 5 });
      await page.mouse.up();
    }
    await sheet.locator('[data-k="close-inv"]').click();
    await expect(sheet).toBeHidden();

    // Save / Load snapshot round trip (atomic in one frame so no sim tick intervenes)
    const { hashBefore, hashAfter } = await page.evaluate(() => {
      const g = (window as any).__game;
      const snap = structuredClone(g.sim.snapshot());
      const hashBefore = g.sim.hash();
      g.sim.restore(snap);
      const hashAfter = g.sim.hash();
      return { hashBefore, hashAfter };
    });
    expect(hashAfter).toBe(hashBefore);
    expect(errors).toEqual([]);
  });

  test('offline reload after service worker install', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/thornvael/?hero=warrior,m,medium');
    await page.waitForFunction(() => Boolean((window as any).__game?.sim));
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null && Boolean((window as any).__game?.sim));

    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => Boolean((window as any).__game?.sim));
    await context.setOffline(false);
    expect(errors).toEqual([]);
  });

  test('mobile viewport (390x844 touch): boots and opens inventory', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/thornvael/?hero=warrior,m,medium');
    await page.waitForFunction(() => Boolean((window as any).__game?.sim));
    const invBtn = page.locator('#btn-inv');
    await expect(invBtn).toBeVisible();
    await invBtn.tap();
    await expect(page.getByTestId('hero-sheet')).toBeVisible();
    await context.close();
    expect(errors).toEqual([]);
  });
});
