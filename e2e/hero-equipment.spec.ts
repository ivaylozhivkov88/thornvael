import { expect, test, type Locator, type Page } from '@playwright/test';
import type { HeroUi } from '../src/heroui';
import { Slot } from '../src/sim/items';
import type { Sim } from '../src/sim/sim';
import { readFileSync } from 'node:fs';

const itemData = JSON.parse(readFileSync(new URL('../public/data/items.json', import.meta.url), 'utf8')) as {
  items: { name: string }[];
};

interface HeroGame { sim: Sim; heroUi: HeroUi; paused: () => boolean; step: () => number }
type GameWindow = { __game: HeroGame };

const helm = itemData.items.findIndex((item) => item.name === 'Leather Cap');
const shield = itemData.items.findIndex((item) => item.name === 'Wooden Buckler');

async function setup(page: Page) {
  await page.goto('/thornvael/?hero=warrior,m,medium');
  await page.waitForFunction(() => (window as unknown as GameWindow).__game);
  if (!await page.evaluate(() => (window as unknown as GameWindow).__game.paused())) await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => (window as unknown as GameWindow).__game.paused())).toBe(true);
  await page.evaluate(({ helm, shield }) => {
    const { sim } = (window as unknown as GameWindow).__game;
    sim.hero!.inv.unshift({ item: helm, n: 1 }, { item: shield, n: 1 });
  }, { helm, shield });
  await page.locator('#btn-hero').click();
}

const snapshot = (page: Page) => page.evaluate(() => {
  const { sim } = (window as unknown as GameWindow).__game;
  return { eq: [...sim.hero!.eq], inv: sim.hero!.inv, mod: Array.from(sim.cb.mod), log: sim.log.filter(({ cmd }) => cmd.type === 'hero') };
});

const step = (page: Page) => page.evaluate(() => {
  (window as unknown as GameWindow).__game.step();
  (window as unknown as GameWindow).__game.heroUi.refresh();
});

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Missing drag endpoint');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

function control(page: Page, key: string) {
  return page.locator(`#sheet [data-k="${key}"]`);
}

async function startMouse(page: Page, key: string) {
  const start = await center(control(page, key));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y);
  await expect(page.locator('.hero-drag-ghost')).toBeVisible();
}

test('mouse equip and keyboard fallback use one guarded command after a paused reopen', async ({ page }) => {
  await setup(page);
  const before = await snapshot(page);
  const target = await center(control(page, 'eq2'));
  await startMouse(page, 'inv0');
  await page.mouse.move(target.x, target.y);
  await expect(page.locator('[data-equipment-target="eq2"]')).toHaveAttribute('data-drop-state', 'valid');
  await page.mouse.up();
  await expect(page.getByRole('status').filter({ hasText: 'Equipment order queued.' })).toBeVisible();
  await expect(page.locator('.hero-figure [data-layer="2"]')).toHaveCount(before.eq[Slot.Helm] < 0 ? 0 : 1);
  await control(page, 'close').click();
  await page.locator('#btn-hero').click();
  await control(page, 'inv0').press('Enter');
  await expect(control(page, 'act-use')).toBeDisabled();
  expect(await snapshot(page)).toEqual(before);
  await step(page);
  const after = await snapshot(page);
  expect(after.eq[Slot.Helm]).toBe(helm);
  expect(after.mod).not.toEqual(before.mod);
  expect(after.inv.filter((entry) => entry.item === helm)).toHaveLength(0);
  expect(after.log.slice(before.log.length)).toEqual([{ tick: expect.any(Number), cmd: { type: 'hero', op: 'equip', item: helm, expectedEquipment: expect.any(String) } }]);
  await expect(page.locator('.hero-figure [data-layer="2"]')).toHaveAttribute('data-item', String(helm));
  await control(page, 'eq2').press('Enter');
  await control(page, 'act-unequip').press('Space');
  await step(page);
  expect((await snapshot(page)).inv.at(-1)).toEqual({ item: helm, n: 1 });
  await expect(page.locator('.hero-figure [data-layer="2"]')).toHaveCount(0);
});

test('wrong target, Escape and structural refresh return gear without a command', async ({ page }) => {
  await setup(page);
  const before = await snapshot(page);
  const wrong = await center(control(page, 'eq1'));
  await startMouse(page, 'inv0');
  await page.mouse.move(wrong.x, wrong.y);
  await expect(page.locator('[data-equipment-target="eq1"]')).toHaveAttribute('data-drop-state', 'invalid');
  await page.mouse.up();
  await startMouse(page, 'inv0');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeVisible();
  await page.mouse.up();
  await startMouse(page, 'inv0');
  await page.evaluate(() => (window as unknown as GameWindow).__game.heroUi.refresh(true));
  await page.mouse.up();
  await expect(page.locator('.hero-drag-ghost')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Item returned to its source.' })).toBeVisible();
  await step(page);
  expect(await snapshot(page)).toEqual(before);
});

test('a replaced drag source cannot enqueue an otherwise valid drop', async ({ page }) => {
  await setup(page);
  const before = await snapshot(page);
  const target = await center(control(page, 'eq2'));
  await startMouse(page, 'inv0');
  const changed = await page.evaluate(() => {
    const { sim } = (window as unknown as GameWindow).__game;
    sim.hero!.inv.reverse();
    return sim.hero!.inv;
  });
  await page.mouse.move(target.x, target.y);
  await page.mouse.up();
  await step(page);
  expect(await snapshot(page)).toEqual({ ...before, inv: changed });
});

test.describe('finger input', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('a swipe on a gear face scrolls the sheet without dragging', async ({ page, context }) => {
    await setup(page);
    await page.locator('#sheet').evaluate((sheet) => {
      sheet.querySelector<HTMLDetailsElement>('.hero-stats')!.open = true;
      sheet.scrollTop = 0;
    });
    const from = await center(control(page, 'inv0'));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (const delta of [20, 50, 90, 140]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: from.y - delta }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.locator('#sheet').evaluate((sheet) => sheet.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator('.hero-drag-ghost')).toHaveCount(0);
    await expect(control(page, 'act-use')).toHaveCount(0);
  });

  test('a held finger can reach a slot above the pack in a short viewport', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 480 });
    await setup(page);
    const source = control(page, 'drag-inv0');
    await source.scrollIntoViewIfNeeded();
    const sheet = page.locator('#sheet');
    const sheetBox = (await sheet.boundingBox())!;
    const initialScroll = await sheet.evaluate((element) => element.scrollTop);
    expect(initialScroll).toBeGreaterThan(0);
    const from = await center(source);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: Math.ceil(sheetBox.y) + 8 }] });
    await expect.poll(() => sheet.evaluate((element) => element.scrollTop)).toBe(0);
    const to = await center(control(page, 'eq2'));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
    await expect(page.locator('[data-equipment-target="eq2"]')).toHaveAttribute('data-drop-state', 'valid');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await step(page);
    expect((await snapshot(page)).eq[Slot.Helm]).toBe(helm);
  });

  test('touch handle equips and returns shield through real pointer capture', async ({ page, context }) => {
    await setup(page);
    const cdp = await context.newCDPSession(page);
    async function drag(source: Locator, destination: Locator, cancel = false) {
      const from = await center(source);
      const to = await center(destination);
      const box = (await source.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
      await expect(page.locator('.hero-drag-ghost')).toBeVisible();
      await expect(page.locator('[data-drop-state="valid"]')).toHaveCount(1);
      await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      await expect(page.locator('.hero-drag-ghost')).toHaveCount(0);
    }

    const before = await snapshot(page);
    await drag(control(page, 'drag-inv1'), control(page, 'eq1'), true);
    await step(page);
    expect(await snapshot(page)).toEqual(before);
    await drag(control(page, 'drag-inv1'), control(page, 'eq1'));
    expect(await snapshot(page)).toEqual(before);
    await step(page);
    await expect(page.locator('.hero-figure [data-layer="1"]')).toHaveAttribute('data-item', String(shield));
    await drag(control(page, 'drag-eq1'), page.locator('#sheet .hero-return'));
    await step(page);
    await expect(page.locator('.hero-figure [data-layer="1"]')).toHaveCount(0);
    const after = await snapshot(page);
    expect(after.inv.at(-1)).toEqual({ item: shield, n: 1 });
    expect(after.mod).toEqual(before.mod);
    expect(after.log.slice(before.log.length).map(({ cmd }) => cmd)).toEqual([
      { type: 'hero', op: 'equip', item: shield, expectedEquipment: expect.any(String) },
      { type: 'hero', op: 'unequip', slot: Slot.Shield, expectedEquipment: expect.any(String) },
    ]);
  });
});
