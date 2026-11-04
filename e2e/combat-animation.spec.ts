import { expect, test, type Page } from '@playwright/test';
import type { AnimationPose } from '../src/sprites/combat-animation';

interface Game {
  sim: { tick: number; count: number; team: Uint8Array; cb: { hp: Int16Array; mana: Int16Array; cd: Uint8Array } };
  paused(): boolean;
  step(n?: number): number;
  animation(id: number): AnimationPose;
  unitArt(id: number): { requestedClip: string; resolvedClip: string; fallback: boolean; finished: boolean };
  unitScreen(id: number): [number, number] | null;
  tile(x: number, y: number): [number, number];
  posTiles(id: number): [number, number];
  previewArt(): { requestedClip: string; fallback: boolean; finished: boolean; source: number }[];
}
const read = (page: Page) => page.evaluate(() => {
  const g = (window as unknown as { __game: Game }).__game;
  return { tick: g.sim.tick, mana: g.sim.cb.mana[0], cd: g.sim.cb.cd[0], pose: g.animation(0) };
});
const step = (page: Page, n = 1) => page.evaluate((n) => (window as unknown as { __game: Game }).__game.step(n), n);
async function boot(page: Page, hero = 'warrior', extra = '') {
  await page.goto(`/thornvael/?hero=${hero},m,medium${extra}`);
  await page.waitForFunction(() => (window as unknown as { __game?: Game }).__game?.unitArt(0));
  await page.locator('#btn-pause').click();
  expect(await page.evaluate(() => (window as unknown as { __game: Game }).__game.paused())).toBe(true);
}
async function selectHero(page: Page) {
  const p = await page.evaluate(() => (window as unknown as { __game: Game }).__game.unitScreen(0));
  expect(p).not.toBeNull(); await page.mouse.click(...p!);
}
test.use({ viewport: { width: 1200, height: 700 } });

test('real queued orders distinguish chase from strike; pause freezes the shipped attack clip', async ({ page }) => {
  await boot(page); await selectHero(page);
  const target = await page.evaluate(() => {
    const g = (window as unknown as { __game: Game }).__game;
    const origin = g.posTiles(0);
    return Array.from({ length: g.sim.count }, (_, id) => ({ id, point: g.unitScreen(id), pos: g.posTiles(id) }))
      .filter((u) => u.id > 0 && g.sim.team[u.id] === 0 && g.sim.cb.hp[u.id] > 0 && u.point
        && document.elementFromPoint(...u.point)?.id === 'game')
      .sort((a, b) => Math.hypot(...[b.pos[0] - origin[0], b.pos[1] - origin[1]])
        - Math.hypot(...[a.pos[0] - origin[0], a.pos[1] - origin[1]]))[0];
  });
  expect(target).toBeTruthy();
  await page.keyboard.down('Control'); await page.mouse.click(...target.point!, { button: 'right' }); await page.keyboard.up('Control');
  await step(page);
  expect((await read(page)).pose.clip).toBe('walk');
  let state = await read(page);
  for (let n = 0; n < 100 && state.pose.clip !== 'attack'; n++) { await step(page); state = await read(page); }
  expect(state.pose).toMatchObject({ clip: 'attack', age: 0, frame: 0 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: Game }).__game.unitArt(0)))
    .toMatchObject({ requestedClip: 'attack', resolvedClip: 'attack', fallback: false });
  const frozen = await read(page);
  await page.waitForTimeout(160);
  expect(await read(page)).toEqual(frozen);
  await step(page, 5);
  expect((await read(page)).pose).toMatchObject({ clip: 'attack', age: 5, frame: 2 });
  await page.locator('#btn-pause').click();
  const refused = await page.evaluate(() => {
    try { (window as unknown as { __game: Game }).__game.step(); return false; } catch { return true; }
  });
  expect(refused).toBe(true);
});

test('spellbook casts drive the observer; a real insufficient-mana refusal creates no cast edge', async ({ page }) => {
  await boot(page, 'mage'); await selectHero(page);
  const cast = async () => {
    await page.locator('#btn-spells').click();
    // Healing is learned by a fresh hero; Fireball is not.
    await page.locator('#book [data-spell="7"]').click();
    const point = await page.evaluate(() => {
      const g = (window as unknown as { __game: Game }).__game;
      return g.tile(...g.posTiles(0));
    });
    await page.mouse.click(...point); await step(page);
  };
  const before = await read(page);
  await cast();
  expect((await read(page)).mana).toBeLessThan(before.mana);
  expect((await read(page)).pose).toMatchObject({ clip: 'cast', age: 0, unresolved: false });
  // Spend mana only through actual spellbook commands; do not mutate the fixture.
  for (let i = 0; i < 20; i++) {
    await step(page, 30);
    if ((await read(page)).tick % 25 === 24) await step(page);
    if ((await read(page)).mana < 10) break;
    await cast();
  }
  const empty = await read(page);
  expect(empty.mana).toBeLessThan(10); expect(empty.cd).toBe(0);
  await cast();
  const after = await read(page);
  expect(after.cd).toBe(0);
  expect(after.mana).toBeGreaterThanOrEqual(empty.mana);
  expect(after.pose.clip).not.toBe('cast');
});

test('preview shipped one-shots clamp and replay without making more GPU sources', async ({ page }) => {
  await boot(page, 'warrior', '&art=1');
  const art = () => page.evaluate(() => (window as unknown as { __game: Game }).__game.previewArt());
  const sources = (await art()).map((a) => a.source);
  await page.getByLabel('Animation', { exact: true }).selectOption('5');
  await expect.poll(async () => (await art()).map((a) => a.requestedClip)).toEqual(['die', 'die', 'die']);
  await step(page, 20);
  await expect.poll(async () => (await art()).map((a) => a.finished)).toEqual([true, true, true]);
  expect((await art()).every((a) => !a.fallback)).toBe(true);
  await expect(page.getByRole('complementary', { name: 'Unit art preview' }).getByRole('status'))
    .toHaveText('die · finished');
  await page.getByLabel('Facing', { exact: true }).selectOption('4');
  expect((await art()).every((a) => a.finished)).toBe(true);
  await page.getByRole('button', { name: 'Replay animation', exact: true }).click();
  await expect.poll(async () => (await art()).map((a) => a.finished)).toEqual([false, false, false]);
  expect((await art()).map((a) => a.source)).toEqual(sources);
});
