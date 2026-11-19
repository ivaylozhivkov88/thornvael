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
      const tick = await page.evaluate(() => (window as GameWindow).__game!.sim.tick);
      expect(tick).toBeGreaterThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }
});

for (const [label, descriptor] of [
  ['Pixel 5 (Android)', pixel5],
  ['iPhone 13 (iOS)', iphone13],
] as const) {
  test.describe(`Mobile PWA smoke: ${label} (F9)`, () => {
    test.use({ ...descriptor });

    test('menu shell & skirmish entry load without errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));

      await page.goto('/thornvael/');
      await expect(page.getByRole('button', { name: /new game/i })).toBeVisible();

      await page.goto('/thornvael/?randskirmish=7&players=2&biome=forest&hero=warrior,m,medium');
      await page.waitForFunction(() => Boolean((window as GameWindow).__game));
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
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

      await context.setOffline(true);
      await page.reload();
      await page.waitForFunction(() => Boolean((window as GameWindow).__game));
      expect(await page.evaluate(() => (window as GameWindow).__game!.sim.tick)).toBeGreaterThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  });
}
