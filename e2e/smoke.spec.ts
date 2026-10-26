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

test('load, select, move, offline reload', async ({ page, context }) => {
  await page.goto('/thornvael/');
  await page.waitForFunction(() => window.__game);

  // select the hero by clicking it
  const [sx, sy] = (await page.evaluate(() => window.__game!.unitScreen(0)))!;
  await page.mouse.click(sx, sy);
  expect(await page.evaluate(() => window.__game!.selected())).toEqual([0]);

  // order a move with the right mouse button and wait for the sim to carry it out
  const before = await page.evaluate(() => window.__game!.posTiles(0));
  await page.mouse.click(sx + 90, sy - 60, { button: 'right' });
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
