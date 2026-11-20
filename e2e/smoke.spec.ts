import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __game?: {
      sim: { tick: number };
      selected(): number[];
      unitScreen(i: number): [number, number] | null;
      posTiles(i: number): [number, number];
    };
  }
}

for (const name of ['ford', 'market', 'fen', 'ravenwatch', 'sanctum']) {
  test(`mission ${name} opens and ticks`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/thornvael/?mission=${name}&hero=warrior,m,medium`);
    await page.waitForFunction(() => window.__game);
    const begin = page.getByRole('button', { name: /begin the mission/i });
    const next = page.locator('#gothic-dialogue').getByRole('button', { name: 'Next', exact: true });
    for (let i = 0; i < 12; i++) {
      if (await begin.isVisible().catch(() => false)) { await begin.click(); break; }
      if (await next.isVisible().catch(() => false)) await next.click();
      else await page.waitForTimeout(100);
    }
    if (await begin.isVisible().catch(() => false)) await begin.click();
    // The opening script message pauses the clock within a few ticks, so ticking at all proves the mission runs.
    await page.waitForFunction(() => window.__game!.sim.tick >= 1);
    expect(errors).toEqual([]);
  });
}

test('touch: hold on open ground opens the radial menu with 44 px buttons; portraits are listed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/thornvael/?hero=warrior,m,medium');
  await page.waitForFunction(() => window.__game);
  const [sx, sy] = (await page.evaluate(() => window.__game!.unitScreen(0)))!;
  await page.mouse.click(sx, sy); // select the hero
  const x = sx + 160;
  const y = sy + 20;
  await page.evaluate(([px, py]) => {
    const c = document.getElementById('game')!;
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: px, clientY: py, bubbles: true }));
  }, [x, y]);
  await page.waitForTimeout(700);
  const boxes = await page.locator('.radial > button').evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]));
  expect(boxes.length).toBe(4);
  for (const [w, h] of boxes) expect(Math.min(w, h)).toBeGreaterThanOrEqual(44);
  const chips = await page.locator('.squad-bar .squad-member').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  expect(chips.length).toBeGreaterThan(0);
  for (const w of chips) expect(w).toBeGreaterThanOrEqual(44);
  expect(errors).toEqual([]);
});

test('the menu shell opens on a bare address with single player reachable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/thornvael/');
  await expect(page.getByRole('button', { name: 'Single Player', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('load, select, move, offline reload', async ({ page, context }) => {
  await page.goto('/thornvael/?hero=warrior,m,medium');
  await page.waitForFunction(() => window.__game);
  await page.locator('#btn-controls').click();

  // select the hero by clicking it
  const [sx, sy] = (await page.evaluate(() => window.__game!.unitScreen(0)))!;
  await page.mouse.click(sx, sy);
  expect(await page.evaluate(() => window.__game!.selected())).toEqual([0]);

  // order a move with the right mouse button and wait for the sim to carry it out
  const before = await page.evaluate(() => window.__game!.posTiles(0));
  await page.mouse.click(sx + 90, sy + 20, { button: 'right' });
  await page.waitForFunction((x) => window.__game!.posTiles(0)[0] > x + 1, before[0]);

  // service worker takes control, then reload without a network
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__game);
  expect(await page.evaluate(() => window.__game!.sim.tick)).toBeGreaterThanOrEqual(0);
});
