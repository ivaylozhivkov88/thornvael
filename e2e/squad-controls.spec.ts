import { expect, test, type Page } from '@playwright/test';
import type { Command } from '../src/sim/sim';

interface ControlsGame {
  selected(): number[];
  unitScreen(id: number): [number, number] | null;
  posTiles(id: number): [number, number];
  tile(x: number, y: number): [number, number];
  groups: { get(n: number): readonly number[] };
  armed(): string | null;
  paused(): boolean;
  zoom(): number;
  sim: {
    map: { w: number; h: number; blocked: Uint8Array };
    tick: number; count: number; team: Uint8Array; hidden: Uint8Array;
    cb: { hp: Int32Array; kind: Uint8Array };
    log: { tick: number; cmd: Command }[];
  };
}
const sorted = (ids: readonly number[]) => [...ids].sort((a, b) => a - b);
const state = (page: Page) => page.evaluate(() => {
  const g = (window as unknown as { __game: ControlsGame }).__game;
  return { selected: [...g.selected()].sort((a, b) => a - b), tile: g.tile(12, 12),
    tick: g.sim.tick, log: g.sim.log.length, armed: g.armed(), paused: g.paused() };
});

async function boot(page: Page, query = 'crowd') {
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.goto(`/thornvael/?${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: ControlsGame }).__game);
  // A fixed future instant avoids a race with a slow browser/automation roundtrip.
  await page.clock.pauseAt(new Date('2030-01-01T01:00:00Z'));
  if (!(await state(page)).paused) await page.keyboard.press('Space');
}

async function units(page: Page, team = 0) {
  return page.evaluate((team) => {
    const g = (window as unknown as { __game: ControlsGame }).__game;
    return Array.from({ length: g.sim.count }, (_, id) => ({ id, p: g.unitScreen(id), team: g.sim.team[id],
      hp: g.sim.cb.hp[id], hidden: g.sim.hidden[id], kind: g.sim.cb.kind[id] }))
      .filter((u) => u.team === team && u.hp > 0 && !u.hidden && u.p && u.p[0] > 190 && u.p[0] < innerWidth - 190
        && u.p[1] > 130 && u.p[1] < innerHeight - 180 && document.elementFromPoint(...u.p)?.id === 'game')
      .map((u) => ({ id: u.id, p: u.p!, kind: u.kind }));
  }, team);
}

async function canvasPoint(page: Page, p: readonly number[]) {
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, p)).toBe('game');
}
async function clickUnit(page: Page, id: number, shift = false) {
  const p = await page.evaluate((id) => (window as unknown as { __game: ControlsGame }).__game.unitScreen(id), id);
  expect(p).not.toBeNull();
  await canvasPoint(page, p!);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(...p!);
  if (shift) await page.keyboard.up('Shift');
}
async function button(page: Page, selector: string) {
  const b = await page.locator(selector).boundingBox();
  expect(b).not.toBeNull();
  await page.mouse.click(b!.x + b!.width / 2, b!.y + b!.height / 2);
}
async function emptyPoint(page: Page): Promise<[number, number]> {
  return page.evaluate(() => {
    const g = (window as unknown as { __game: ControlsGame }).__game;
    for (let y = 150; y < innerHeight - 190; y += 30) for (let x = 210; x < innerWidth - 200; x += 30) {
      if (document.elementFromPoint(x, y)?.id !== 'game') continue;
      const origin = g.tile(0, 0), scale = 32 * g.zoom();
      const tx = Math.floor((x - origin[0]) / scale), ty = Math.floor((y - origin[1]) / scale);
      if (tx < 0 || ty < 0 || tx >= g.sim.map.w || ty >= g.sim.map.h || g.sim.map.blocked[ty * g.sim.map.w + tx]) continue;
      if (Array.from({ length: g.sim.count }, (_, i) => g.sim.cb.hp[i] > 0 && !g.sim.hidden[i] ? g.unitScreen(i) : null)
        .every((p) => !p || Math.hypot(p[0] - x, p[1] - y) > 48)) return [x, y];
    }
    throw new Error('No unobstructed open-ground fixture');
  });
}
async function box(page: Page, a: [number, number], b: [number, number], additive = false) {
  await canvasPoint(page, a); await canvasPoint(page, b);
  const expected = await page.evaluate(({ a, b }) => {
    const g = (window as unknown as { __game: ControlsGame }).__game;
    return Array.from({ length: g.sim.count }, (_, i) => i).filter((i) => {
      const p = g.unitScreen(i);
      return g.sim.team[i] === 0 && g.sim.cb.hp[i] > 0 && !g.sim.hidden[i] && p
        && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])
        && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
    });
  }, { a, b });
  if (additive) await page.keyboard.down('Shift');
  await page.mouse.move(...a); await page.mouse.down();
  await page.mouse.move(...b, { steps: 4 }); await page.mouse.up();
  if (additive) await page.keyboard.up('Shift');
  return expected;
}
async function playerDelta(page: Page, from: number) {
  return page.evaluate((from) => {
    const g = (window as unknown as { __game: ControlsGame }).__game;
    // Ownership alone filters AI; wrong verbs, duplicate orders and wrong targets stay visible.
    return g.sim.log.slice(from).map((e) => e.cmd).filter((cmd) => !('ids' in cmd)
      || cmd.ids.some((id) => g.sim.team[id] === 0));
  }, from);
}
async function tick(page: Page) {
  const before = await state(page);
  // Synthetic touch does not move DOM focus; Space may activate the last focused
  // command button instead of the game's pause shortcut. Use the real Pause UI.
  if (before.paused) await button(page, '#btn-pause');
  expect((await state(page)).paused).toBe(false);
  await page.clock.runFor(160);
  expect((await state(page)).tick).toBeGreaterThan(before.tick);
}
async function targetTile(page: Page, p: [number, number]) {
  return page.evaluate(([x, y]) => {
    const g = (window as unknown as { __game: ControlsGame }).__game;
    const origin = g.tile(0, 0), scale = 32 * g.zoom();
    return { x: (x - origin[0]) / scale, y: (y - origin[1]) / scale };
  }, p);
}
async function touch(page: Page, phase: 'down' | 'move' | 'up', p: [number, number]) {
  await canvasPoint(page, p);
  await page.locator('#game').dispatchEvent(`pointer${phase}`, {
    pointerId: 71, pointerType: 'touch', button: 0, buttons: phase === 'up' ? 0 : 1,
    clientX: p[0], clientY: p[1], bubbles: true,
  });
}
async function tap(page: Page, p: [number, number]) { await touch(page, 'down', p); await touch(page, 'up', p); }

test.use({ viewport: { width: 1200, height: 700 } });
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });
test('selection clicks replace, Shift toggles, empty ground preserves or clears without orders', async ({ page }) => {
  await boot(page);
  const [a, b] = await units(page); expect(a && b).toBeTruthy();
  await clickUnit(page, a.id);
  await page.keyboard.press('9'); // An unassigned group must preserve the current selection.
  expect((await state(page)).selected).toEqual([a.id]);
  const start = await state(page);
  await clickUnit(page, a.id); expect((await state(page)).selected).toEqual([a.id]);
  await clickUnit(page, b.id, true); expect((await state(page)).selected).toEqual(sorted([a.id, b.id]));
  await clickUnit(page, a.id, true); expect((await state(page)).selected).toEqual([b.id]);
  const p = await emptyPoint(page);
  await page.keyboard.down('Shift'); await page.mouse.click(...p); await page.keyboard.up('Shift');
  expect((await state(page)).selected).toEqual([b.id]);
  await page.mouse.click(...p); expect((await state(page)).selected).toEqual([]);
  await tick(page); expect(await playerDelta(page, start.log)).toEqual([]);
});

test('selection boxes work forward, reverse and singleton Shift union', async ({ page }) => {
  await boot(page);
  const us = await units(page); expect(us.length).toBeGreaterThan(3);
  const a: [number, number] = [us[0].p[0] - 8, us[0].p[1] - 8];
  const b: [number, number] = [us[3].p[0] + 8, us[3].p[1] + 8];
  const expected = await box(page, a, b);
  expect(expected.length).toBeGreaterThan(0);
  expect((await state(page)).selected).toEqual(expected);
  expect(await box(page, b, a)).toEqual(expected);
  expect((await state(page)).selected).toEqual(expected);
  const u = us[0]; await clickUnit(page, u.id);
  expect(await box(page, [u.p[0] - 8, u.p[1] - 8], [u.p[0] + 8, u.p[1] + 8], true)).toEqual([u.id]);
  expect((await state(page)).selected).toEqual([u.id]);
  const other = us[2];
  expect(await box(page, [other.p[0] - 8, other.p[1] - 8], [other.p[0] + 8, other.p[1] + 8], true)).toEqual([other.id]);
  expect((await state(page)).selected).toEqual(sorted([u.id, other.id]));
});

test('groups 1–9 assign, replace, add, deduplicate, recall and center only on a rapid second recall', async ({ page }) => {
  await boot(page);
  const [a, b] = await units(page); expect(a && b).toBeTruthy();
  for (let n = 1; n <= 9; n++) {
    await clickUnit(page, a.id); await page.keyboard.press(`Control+${n}`);
    await clickUnit(page, b.id); await page.keyboard.press(`Alt+${n}`);
    await clickUnit(page, a.id); await page.keyboard.press(`Shift+${n}`); await page.keyboard.press(`Shift+${n}`);
    expect(await page.evaluate((n) => (window as unknown as { __game: ControlsGame }).__game.groups.get(n), n)).toEqual(sorted([a.id, b.id]));
    await page.mouse.click(...await emptyPoint(page));
    const before = (await state(page)).tile;
    await page.keyboard.press(String(n));
    expect((await state(page)).selected).toEqual(sorted([a.id, b.id]));
    expect((await state(page)).tile).toEqual(before);
    await page.clock.runFor(100); await page.keyboard.press(String(n));
    const centroid = await page.evaluate((ids) => {
      const g = (window as unknown as { __game: ControlsGame }).__game;
      const ps = ids.map((i) => g.posTiles(i));
      const x = ps.reduce((s, p) => s + p[0], 0) / ps.length;
      const y = ps.reduce((s, p) => s + p[1], 0) / ps.length;
      const scale = 32 * g.zoom();
      const clamp = (p: number, extent: number, view: number) => extent <= view ? -Math.floor((view - extent) / 2)
        : Math.max(0, Math.min(extent - view, Math.round(p - view / 2)));
      return { actual: g.tile(x, y), expected: [Math.round(x * scale - clamp(x * scale, g.sim.map.w * scale, innerWidth)),
        Math.round(y * scale - clamp(y * scale, g.sim.map.h * scale, innerHeight))] };
    }, [a.id, b.id]);
    expect(centroid.actual).toEqual(centroid.expected);
    await page.clock.runFor(400);
    // Record a live first-press timestamp, then move away from the group. A
    // wrongly widened double-press window would visibly recenter the next press.
    await page.keyboard.press(String(n));
    const centered = (await state(page)).tile;
    const panKey = await page.evaluate(() => {
      const g = (window as unknown as { __game: ControlsGame }).__game;
      return -g.tile(0, 0)[0] < g.sim.map.w * 32 * g.zoom() - innerWidth - 8 ? 'ArrowRight' : 'ArrowLeft';
    });
    await page.keyboard.down(panKey); await page.clock.runFor(64); await page.keyboard.up(panKey);
    const after = (await state(page)).tile;
    expect(after).not.toEqual(centered);
    await page.clock.runFor(400);
    await page.keyboard.press(String(n));
    expect((await state(page)).tile).toEqual(after);
    expect((await state(page)).selected).toEqual(sorted([a.id, b.id]));
    await page.clock.runFor(400);
  }
});

test('orders: right-click, M and Move button dispatch exactly one move; cancellation dispatches none', async ({ page }) => {
  await boot(page, 'hero=warrior,m,medium');
  const [a] = await units(page); expect(a).toBeTruthy(); await clickUnit(page, a.id);
  for (const via of ['right', 'key', 'button']) {
    const p = await emptyPoint(page), tile = await targetTile(page, p);
    const before = await state(page);
    const pos = await page.evaluate((id) => (window as unknown as { __game: ControlsGame }).__game.posTiles(id), a.id);
    if (via === 'key') await page.keyboard.press('m');
    if (via === 'button') await button(page, '[data-ord="move"]');
    if (via !== 'right') {
      expect((await state(page)).armed).toBe('move'); await expect(page.locator('#armed')).toBeVisible();
    }
    await page.mouse.click(...p, { button: via === 'right' ? 'right' : 'left' });
    expect((await state(page)).armed).toBeNull();
    await tick(page);
    expect(await playerDelta(page, before.log)).toEqual([{ type: 'move', ids: [a.id], ...tile, loose: false }]);
    expect((await state(page)).selected).toEqual([a.id]);
    if (via === 'right') {
      await page.clock.runFor(1400);
      const now = await page.evaluate((id) => (window as unknown as { __game: ControlsGame }).__game.posTiles(id), a.id);
      expect(Math.hypot(now[0] - pos[0], now[1] - pos[1])).toBeGreaterThan(0.1);
    }
    for (const cancel of ['right', 'escape']) {
      const start = await state(page);
      await page.keyboard.press('m'); expect((await state(page)).armed).toBe('move');
      if (cancel === 'right') await page.mouse.click(...await emptyPoint(page), { button: 'right' });
      else await page.keyboard.press('Escape');
      expect((await state(page)).armed).toBeNull();
      await tick(page); expect(await playerDelta(page, start.log)).toEqual([]);
      expect((await state(page)).selected).toEqual([a.id]);
    }
  }
});

test('orders: smart enemy attack, Alt forced move and Ctrl friendly attack preserve selection', async ({ page }) => {
  await boot(page, 'hero=warrior,m,medium');
  const [a, ally] = await units(page); expect(a && ally).toBeTruthy(); await clickUnit(page, a.id);
  // Reveal the existing nearby pack by moving through real controls. Camera panning cannot reveal fog.
  await page.keyboard.press('Control+1');
  const approach = await page.evaluate(() => {
    const g = (window as unknown as { __game: ControlsGame }).__game;
    for (let x = 18; x <= 20; x++) for (let y = 34; y <= 36; y++) {
      if (!g.sim.map.blocked[y * g.sim.map.w + x]) return g.tile(x + 0.5, y + 0.5);
    }
    throw new Error('No approach tile near the existing pack');
  });
  await canvasPoint(page, approach); await page.mouse.click(...approach, { button: 'right' });
  await tick(page);
  for (let i = 0; i < 6 && (await units(page, 1)).length === 0; i++) await page.clock.runFor(1000);
  await page.keyboard.press('Space');
  const enemies = await units(page, 1); expect(enemies.length).toBeGreaterThan(0);
  const enemy = enemies[0]; await canvasPoint(page, enemy.p);
  const first = await state(page);
  await page.mouse.click(...enemy.p); expect((await state(page)).selected).toEqual([]);
  const expectedBox = await box(page, [enemy.p[0] - 8, enemy.p[1] - 8], [enemy.p[0] + 8, enemy.p[1] + 8]);
  expect(expectedBox).toEqual([]); expect((await state(page)).selected).toEqual([]);
  await page.keyboard.press('1');
  await tick(page); expect(await playerDelta(page, first.log)).toEqual([]);
  await page.keyboard.press('Space');
  const target = (await units(page, 1))[0]; expect(target).toBeTruthy();
  for (const forced of [false, true]) {
    const before = await state(page), tile = await targetTile(page, target.p);
    if (forced) await page.keyboard.down('Alt');
    await page.mouse.click(...target.p, { button: 'right' });
    if (forced) await page.keyboard.up('Alt');
    await tick(page);
    expect(await playerDelta(page, before.log)).toEqual(forced
      ? [{ type: 'move', ids: [a.id], ...tile, loose: false }]
      : [{ type: 'order', order: 'attack', ids: [a.id], target: target.id }]);
    expect((await state(page)).selected).toEqual([a.id]);
    await page.keyboard.press('Space');
  }
  const p = await page.evaluate((id) => (window as unknown as { __game: ControlsGame }).__game.unitScreen(id), ally.id);
  expect(p).not.toBeNull(); await canvasPoint(page, p!);
  const before = await state(page);
  await page.keyboard.down('Control'); await page.mouse.click(...p!, { button: 'right' }); await page.keyboard.up('Control');
  await tick(page);
  expect(await playerDelta(page, before.log)).toEqual([{ type: 'order', order: 'attack', ids: [a.id], target: ally.id }]);
  expect((await state(page)).selected).toEqual([a.id]);
});

test('orders: Defend rejects ground, accepts a friendly target; Hold and Still keys/buttons stay distinct', async ({ page }) => {
  await boot(page, 'hero=warrior,m,medium');
  const [a, ally] = await units(page); expect(a && ally).toBeTruthy(); await clickUnit(page, a.id);
  for (const via of ['key', 'button']) {
    const start = await state(page);
    if (via === 'key') await page.keyboard.press('d'); else await button(page, '[data-ord="defend"]');
    expect((await state(page)).armed).toBe('defend');
    await expect(page.locator('#armed')).toBeVisible();
    await page.mouse.click(...await emptyPoint(page));
    await tick(page); expect(await playerDelta(page, start.log)).toEqual([]);
    expect((await state(page)).armed).toBe('defend');
    const before = await state(page);
    const p = await page.evaluate((id) => (window as unknown as { __game: ControlsGame }).__game.unitScreen(id), ally.id);
    expect(p).not.toBeNull(); await canvasPoint(page, p!); await page.mouse.click(...p!);
    await tick(page);
    expect(await playerDelta(page, before.log)).toEqual([{ type: 'order', order: 'defend', ids: [a.id], target: ally.id }]);
    expect((await state(page)).armed).toBeNull();
    for (const [key, order] of [['h', 'hold'], ['s', 'still']]) {
      const before = await state(page);
      if (via === 'key') await page.keyboard.press(key); else await button(page, `[data-ord="${order}"]`);
      await tick(page);
      expect(await playerDelta(page, before.log)).toEqual([{ type: 'order', order, ids: [a.id] }]);
      expect((await state(page)).selected).toEqual([a.id]);
    }
  }
});

test('touch (synthetic Pointer Events): tap, move, pan, Box+Add, same-kind double tap and hold-release safety', async ({ page }) => {
  await boot(page);
  const [a] = await units(page); expect(a).toBeTruthy();
  await tap(page, a.p); expect((await state(page)).selected).toEqual([a.id]);
  const ground = await emptyPoint(page), tile = await targetTile(page, ground), before = await state(page);
  await tap(page, ground); await tick(page);
  expect(await playerDelta(page, before.log)).toEqual([{ type: 'move', ids: [a.id], ...tile, loose: false }]);
  await page.keyboard.press('Space');
  const pan = await state(page), end: [number, number] = [ground[0] - 70, ground[1] + 30];
  await touch(page, 'down', ground); await touch(page, 'move', end); await touch(page, 'up', end);
  expect((await state(page)).tile).not.toEqual(pan.tile);
  await tick(page); expect(await playerDelta(page, pan.log)).toEqual([]);
  await page.keyboard.press('Space');
  const [b] = await units(page); expect(b).toBeTruthy();
  await tap(page, b.p); expect((await state(page)).selected).toEqual([b.id]);
  await button(page, '#btn-box'); await button(page, '#btn-add');
  const lo: [number, number] = [b.p[0] - 8, b.p[1] - 8], hi: [number, number] = [b.p[0] + 8, b.p[1] + 8];
  await touch(page, 'down', lo); await touch(page, 'move', hi); await touch(page, 'up', hi);
  expect((await state(page)).selected).toEqual([b.id]);
  const other = (await units(page)).find((u) => u.id !== b.id)!;
  expect(other).toBeTruthy();
  const otherLo: [number, number] = [other.p[0] - 8, other.p[1] - 8];
  const otherHi: [number, number] = [other.p[0] + 8, other.p[1] + 8];
  await canvasPoint(page, otherLo); await canvasPoint(page, otherHi);
  await touch(page, 'down', otherLo); await touch(page, 'move', otherHi); await touch(page, 'up', otherHi);
  expect((await state(page)).selected).toEqual(sorted([b.id, other.id]));
  await button(page, '#btn-box'); await button(page, '#btn-add'); await page.clock.runFor(400);
  await tap(page, b.p); await page.clock.runFor(100); await tap(page, b.p);
  const sameKind = await page.evaluate((kind) => {
    const g = (window as unknown as { __game: ControlsGame }).__game;
    return Array.from({ length: g.sim.count }, (_, id) => id)
      .filter((id) => g.sim.team[id] === 0 && g.sim.cb.hp[id] > 0 && !g.sim.hidden[id] && g.sim.cb.kind[id] === kind);
  }, b.kind);
  expect((await state(page)).selected).toEqual(sameKind);
  const hold = await state(page), point = await emptyPoint(page);
  await touch(page, 'down', point); await page.clock.runFor(500);
  await expect(page.locator('.radial')).toBeVisible();
  const radialBoxes = await page.locator('.radial > button').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect(); return [r.width, r.height];
  }));
  expect(radialBoxes).toHaveLength(4);
  for (const [w, h] of radialBoxes) expect(Math.min(w, h), 'visible radial button').toBeGreaterThanOrEqual(44);
  await touch(page, 'up', point); await tick(page);
  expect(await playerDelta(page, hold.log)).toEqual([]);
  expect((await state(page)).selected).toEqual(hold.selected);
});

test('combat portraits, groups and commands have 44px width and height', async ({ page }) => {
  // The peaceful crowd scene intentionally has no combat command/portrait UI.
  await boot(page, 'hero=warrior,m,medium');
  for (const [selector, count] of [['.portraits > button', 6], ['#groups > button', 9], ['#cmds > button', 10]] as const) {
    const boxes = await page.locator(selector).evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect(); return [r.width, r.height];
    }));
    expect(boxes).toHaveLength(count);
    for (const [w, h] of boxes) expect(Math.min(w, h), selector).toBeGreaterThanOrEqual(44);
  }
});

test('group membership edits reset stale recall history for keyboard Set and button Add', async ({ page }) => {
  await boot(page);
  const [a, b] = await units(page); expect(a && b).toBeTruthy();
  for (const edit of ['set', 'add'] as const) {
    await clickUnit(page, a.id); await page.keyboard.press('Control+1');
    await page.keyboard.press('1'); await page.clock.runFor(100);
    await clickUnit(page, b.id);
    if (edit === 'set') await page.keyboard.press('Control+1');
    else {
      await button(page, '#btn-set'); await button(page, '#btn-add');
      await button(page, '#groups button:nth-child(1)');
      await button(page, '#btn-set'); await button(page, '#btn-add');
    }
    const before = (await state(page)).tile;
    await page.keyboard.press('1');
    expect.soft((await state(page)).selected, `${edit}: first recall selects edited membership`).toEqual(edit === 'set' ? [b.id] : sorted([a.id, b.id]));
    expect.soft((await state(page)).tile, `${edit}: first recall must not center`).toEqual(before);
    await page.clock.runFor(400);
  }
});
