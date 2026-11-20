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

test.describe('Act 1 Campaign Flow E2E', () => {
  test('Main Menu -> Hero Creation -> Act 1 Mission 1 -> Victory -> Thornwick Town -> World Map -> Mission 2', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/thornvael/');
    await page.getByRole('button', { name: /single player/i }).click();
    await page.getByRole('button', { name: /create new hero/i }).click();
    await page.locator('input.sh-input').fill('Aldric');
    await page.getByRole('button', { name: /^next$/i }).click();

    await page.getByRole('button', { name: /mage/i }).click();
    await page.getByRole('button', { name: /female/i }).click();
    await page.getByRole('button', { name: /begin campaign/i }).click();

    const skipStory = page.getByRole('button', { name: /skip/i });
    await expect(skipStory).toBeVisible();
    await skipStory.click();

    await page.waitForURL(/\?mission=ford&campaign=m01-blood-at-the-ford/);
    await page.waitForFunction(() => Boolean((window as GameWindow).__game));

    const contBtn = page.locator('.gothic-continue-btn');
    for (let i = 0; i < 80; i++) {
      const ticked = await page.evaluate(() => ((window as GameWindow).__game?.sim.tick ?? 0) >= 1);
      if (ticked && !(await contBtn.isVisible())) break;
      if (await contBtn.isVisible()) {
        await contBtn.click();
        await page.waitForTimeout(40);
      } else {
        await page.waitForTimeout(80);
      }
    }

    await page.waitForFunction(() => ((window as GameWindow).__game?.sim.tick ?? 0) >= 1);
    const missionState = await page.evaluate(() => {
      const g = (window as GameWindow).__game as unknown as {
        sim: { hero: { cls: number; female: boolean } | null; count: number; script?: { st: { status: number } } };
      };
      return {
        heroCls: g.sim.hero?.cls,
        heroFemale: g.sim.hero?.female,
        unitCount: g.sim.count,
        status: g.sim.script?.st.status,
      };
    });
    expect(missionState.heroCls).toBe(1);
    expect(missionState.heroFemale).toBe(true);
    expect(missionState.unitCount).toBeGreaterThan(20);
    expect(missionState.status).toBe(0);

    await page.evaluate(() => {
      const g = (window as GameWindow).__game as unknown as {
        sim: { cb: { gold: number[]; hp: number[]; recount: (t: number[]) => void }; team: number[] };
      };
      g.sim.cb.gold[0] += 250;
      g.sim.cb.hp[12] = 0;
      g.sim.cb.recount(g.sim.team);
    });

    const townBtn = page.getByRole('button', { name: /return to thornwick market/i });
    for (let i = 0; i < 40; i++) {
      if (await townBtn.isVisible()) break;
      if (await contBtn.isVisible()) {
        await contBtn.click();
        await page.waitForTimeout(40);
      } else {
        await page.waitForTimeout(100);
      }
    }
    await expect(townBtn).toBeVisible({ timeout: 10000 });
    await townBtn.click();

    await page.waitForURL(/\?mission=market&campaign=town-thornwick/);
    await page.waitForFunction(() => Boolean((window as GameWindow).__game));
    for (let i = 0; i < 40; i++) {
      const ticked = await page.evaluate(() => ((window as GameWindow).__game?.sim.tick ?? 0) >= 1);
      if (ticked && !(await contBtn.isVisible())) break;
      if (await contBtn.isVisible()) {
        await contBtn.click();
        await page.waitForTimeout(40);
      } else {
        await page.waitForTimeout(80);
      }
    }
    await page.waitForFunction(() => ((window as GameWindow).__game?.sim.tick ?? 0) >= 1);

    const townState = await page.evaluate(() => {
      const g = (window as GameWindow).__game as unknown as {
        sim: { hero: { cls: number } | null; cb: { gold: number[] }; towns: { def: { npcs?: { name: string }[] } }[] };
      };
      return {
        cls: g.sim.hero?.cls,
        gold: g.sim.cb.gold[0],
        towns: g.sim.towns.length,
        npcs: g.sim.towns[0]?.def.npcs?.map((n) => n.name) ?? [],
      };
    });
    expect(townState.cls).toBe(1);
    expect(townState.gold).toBeGreaterThanOrEqual(250);
    expect(townState.towns).toBe(1);
    expect(townState.npcs).toContain('Reeve Marlow');

    await page.evaluate(() => {
      const g = (window as GameWindow).__game as unknown as {
        sim: { x: number[]; y: number[] };
        townUi: { enter: (town: number, role: number) => boolean };
      };
      g.sim.x[0] = 15 * 256;
      g.sim.y[0] = 9 * 256;
      g.townUi.enter(0, 1);
    });
    await expect(page.locator('.sheet.town')).toBeVisible();
    await page.locator('.sheet.town button', { hasText: /exit/i }).first().click();

    await page.locator('#btn-missions').click();
    await page.waitForURL(/\?menu=map/);
    const fenNode = page.locator('.sh-node', { hasText: /whispers in the fen/i });
    await expect(fenNode).toBeEnabled();
    await fenNode.click();
    await page.getByRole('button', { name: /go/i }).click();
    await page.waitForURL(/\?mission=fen&campaign=m02-whispers-in-the-fen/);
    await page.waitForFunction(() => Boolean((window as GameWindow).__game));

    expect(errors).toEqual([]);
  });
});
