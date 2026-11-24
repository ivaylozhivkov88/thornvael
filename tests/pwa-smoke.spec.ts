import { devices, expect, test } from '@playwright/test';

type GameWindow = Window & {
  __game?: {
    sim: { tick: number };
  };
};

const BIOMES = ['forest', 'marsh', 'desert', 'crypt', 'highlands', 'volcanic', 'oasis'] as const;

const { defaultBrowserType: _pixelBrowser, ...pixel5 } = devices['Pixel 5'];
const { defaultBrowserType: _iphoneBrowser, ...iphone13 } = devices['iPhone 13'];

test.afterEach(async ({ page }) => {
  await page.goto('about:blank', { timeout: 5_000, waitUntil: 'commit' }).catch(() => {});
});

test.describe('Biome seed skirmish smoke (H2)', () => {
  test.use({ serviceWorkers: 'block' });

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
  test.use({ serviceWorkers: 'block' });

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
    test.skip(
      ({ browserName }) => browserName === 'webkit' && label.includes('Android'),
      'Android Pixel 5 runs on Chromium; Safari WebKit targets iOS devices.',
    );

    test('menu shell, roster entry & debug skirmish load without errors', async ({ browser }) => {
      const context = await browser.newContext({ ...descriptor, serviceWorkers: 'block' });
      const page = await context.newPage();
      try {
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
      } finally {
        await page.goto('about:blank', { timeout: 5_000, waitUntil: 'commit' }).catch(() => {});
        await context.close();
      }
    });

    test('offline reload works after service worker registration', async ({ page, context }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));

      // Register & activate Service Worker on the lightweight menu first (no WebGL contention).
      await page.goto('/thornvael/');
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
        polling: 200,
        timeout: 30_000,
      });

      // Warm the runtime sprite/audio caches for the skirmish map once while online.
      await page.goto('/thornvael/?randskirmish=7&players=2&biome=forest&hero=warrior,m,medium');
      await page.waitForFunction(
        () => Boolean((window as GameWindow).__game) && Array.from(document.images).every((img) => img.complete),
        undefined,
        { polling: 250, timeout: process.env.CI ? 90_000 : 45_000 },
      );

      // Tear down the active WebGL loop before toggling WebKit offline mode so NetworkProcess IPC never stalls.
      await page.goto('/thornvael/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      await context.setOffline(true);
      try {
        await page.goto('/thornvael/?randskirmish=7&players=2&biome=forest&hero=warrior,m,medium');
        await page.waitForFunction(() => Boolean((window as GameWindow).__game), undefined, {
          polling: 250,
          timeout: process.env.CI ? 90_000 : 45_000,
        });
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
  test.use({ serviceWorkers: 'block' });

  test('Main Menu -> Hero Creation -> Act 1 Mission 1 -> Victory -> Thornwick Town -> World Map -> Mission 2', async ({
    page,
    browserName,
  }) => {
    if (browserName === 'webkit' && process.env.CI) {
      test.setTimeout(360_000);
    }
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

    await page.waitForURL(/\?mission=(?:ford|act1-world)&campaign=m01-blood-at-the-ford/);
    await page.waitForFunction(
      () => {
        const retry = document.querySelector('.tv-loading-retry-btn');
        if (retry) {
          const msg = document.querySelector('.tv-loading-err-msg')?.textContent || 'Load failed';
          throw new Error(`Mission 1 loading failed: ${msg}`);
        }
        const dlg = document.getElementById('gothic-dialogue');
        for (let clicks = 0; clicks < 4 && dlg && !dlg.hidden; clicks++) {
          dlg.querySelector<HTMLButtonElement>('.gothic-continue-btn')?.click();
        }
        if (dlg && !dlg.hidden) return false;
        const g = (window as GameWindow).__game;
        return Boolean(g && g.sim.tick >= 1);
      },
      undefined,
      { polling: 200 },
    );
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
        sim: {
          cb: { gold: number[]; hp: number[]; recount: (t: number[]) => void };
          team: number[];
          step?: (cmds?: unknown[]) => void;
          script?: { st: { status: number } };
        };
      };
      g.sim.cb.gold[0] += 250;
      // Act I is one stitched world: the real win needs the whole ruin-mite group cleared, so force the win state.
      if (g.sim.script) g.sim.script.st.status = 1;
      if (typeof g.sim.step === 'function') {
        for (let s = 0; s < 10; s++) g.sim.step([]);
      }
    });

    const townBtn = page.getByRole('button', { name: /return to thornwick market/i });
    await page.waitForFunction(
      () => {
        const dlg = document.getElementById('gothic-dialogue');
        for (let clicks = 0; clicks < 4 && dlg && !dlg.hidden; clicks++) {
          dlg.querySelector<HTMLButtonElement>('.gothic-continue-btn')?.click();
        }
        if (dlg && !dlg.hidden) return false;
        return Boolean(document.querySelector('.btn-victory-primary'));
      },
      undefined,
      { polling: 200 },
    );
    await expect(townBtn).toBeVisible({ timeout: 10000 });
    await townBtn.click({ force: true });

    await page.waitForURL(/\?mission=(?:market|act1-world)&campaign=town-thornwick/);
    await page.waitForFunction(
      () => {
        const retry = document.querySelector('.tv-loading-retry-btn');
        if (retry) {
          const msg = document.querySelector('.tv-loading-err-msg')?.textContent || 'Load failed';
          throw new Error(`Thornwick loading failed: ${msg}`);
        }
        const dlg = document.getElementById('gothic-dialogue');
        for (let clicks = 0; clicks < 4 && dlg && !dlg.hidden; clicks++) {
          dlg.querySelector<HTMLButtonElement>('.gothic-continue-btn')?.click();
        }
        if (dlg && !dlg.hidden) return false;
        const g = (window as GameWindow).__game as unknown as
          | { sim: { tick: number; script?: { st: { msgs: number[] } } }; paused?: () => boolean }
          | undefined;
        return Boolean(g && g.sim.tick >= 10 && !g.paused?.() && (g.sim.script?.st.msgs.length ?? 0) >= 2);
      },
      undefined,
      { polling: 200 },
    );

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
    await page.locator('.sheet.town button', { hasText: /exit/i }).first().click({ force: true });
    await expect(page.locator('.sheet.town')).toBeHidden();

    await page.locator('#btn-missions').click();
    await page.waitForURL(/\?menu=map/);
    const fenNode = page.locator('.sh-node', { hasText: /whispers in the fen/i });
    await expect(fenNode).toBeEnabled();
    await fenNode.click({ force: true });
    await page.getByRole('button', { name: /go/i }).click({ force: true });
    await page.waitForURL(/\?mission=fen&campaign=m02-whispers-in-the-fen/);
    await page.waitForFunction(() => Boolean((window as GameWindow).__game), undefined, { polling: 200 });

    expect(errors).toEqual([]);
  });
});
