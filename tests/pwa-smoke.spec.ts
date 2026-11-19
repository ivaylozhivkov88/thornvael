import { devices, expect, test } from '@playwright/test';

type GameWindow = Window & {
  __game?: {
    sim: { tick: number };
  };
};

const BIOMES = ['forest', 'marsh', 'desert', 'crypt', 'highlands', 'volcanic', 'oasis'] as const;

const { defaultBrowserType: _pixelBrowser, ...pixel5 } = devices['Pixel 5'];
const { defaultBrowserType: _iphoneBrowser, ...iphone13 } = devices['iPhone 13'];

test.describe('Biome seed skirmish smoke (H2)', () => {
  for (const biome of BIOMES) {
    test(`boots biome seed ${biome} cleanly`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`/thornvael/?randskirmish=7&players=2&biome=${biome}&hero=warrior,m,medium`);
      await page.waitForFunction(() => Boolean((window as GameWindow).__game));
      await expect(page.locator('#game')).toBeVisible();
      const tick = await page.evaluate(() => (window as GameWindow).__game!.sim.tick);
      expect(tick).toBeGreaterThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('Expedition & debug overlay smoke', () => {
  test('boots expedition map with ?debug=1 telemetry and advances ticks', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/thornvael/?expedition=1&biome=forest&hero=warrior,m,medium&debug=1');
    await page.waitForFunction(() => Boolean((window as GameWindow).__game));
    const contBtn = page.locator('.gothic-continue-btn');
    for (let i = 0; i < 4; i++) {
      if (!(await contBtn.isVisible())) break;
      await contBtn.click();
      await page.waitForTimeout(80);
    }
    await page.waitForFunction(() => ((window as GameWindow).__game?.sim.tick ?? 0) >= 1);
    const dbg = page.locator('#debug');
    await expect(dbg).toBeVisible();
    await expect(dbg).toContainText(/units \d+.*tick \d+.*hash/s);
    expect(errors).toEqual([]);
  });
});

for (const [label, descriptor] of [
  ['Pixel 5 (Android)', pixel5],
  ['iPhone 13 (iOS)', iphone13],
] as const) {
  test.describe(`Mobile PWA smoke: ${label} (F9)`, () => {
    test.use({ ...descriptor });

    test('menu shell, roster entry & debug skirmish load without errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));

      await page.goto('/thornvael/');
      await expect(page.getByRole('heading', { name: /thornvael/i })).toBeVisible();
      const singlePlayer = page.getByRole('button', { name: /single player/i });
      await expect(singlePlayer).toBeVisible();
      await singlePlayer.click();
      await expect(page.getByRole('heading', { name: /select hero/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /create new hero/i })).toBeVisible();

      await page.goto('/thornvael/?randskirmish=7&players=2&biome=forest&hero=warrior,m,medium&debug=1');
      await page.waitForFunction(() => Boolean((window as GameWindow).__game));
      await expect(page.locator('#debug')).toBeVisible();
      expect(await page.evaluate(() => (window as GameWindow).__game!.sim.tick)).toBeGreaterThanOrEqual(0);
      expect(errors).toEqual([]);
    });

    test('offline reload works after service worker registration', async ({ page, context }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));

      await page.goto('/thornvael/?randskirmish=7&players=2&biome=forest&hero=warrior,m,medium');
      await page.waitForFunction(() => Boolean((window as GameWindow).__game));

      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null && Boolean((window as GameWindow).__game));

      await context.setOffline(true);
      try {
        await page.reload();
        await page.waitForFunction(() => Boolean((window as GameWindow).__game));
        await expect(page.locator('#game')).toBeVisible();
        expect(await page.evaluate(() => (window as GameWindow).__game!.sim.tick)).toBeGreaterThanOrEqual(0);
        expect(errors).toEqual([]);
      } finally {
        await context.setOffline(false);
      }
    });
  });
}
