import { expect, test, type Page } from '@playwright/test';

interface KeyboardGame {
  paused(): boolean;
  selected(): number[];
  tile(x: number, y: number): [number, number];
  unitScreen(id: number): [number, number];
  heroUi: { isOpen: boolean };
}

const game = (page: Page) => page.evaluate(() => {
  const g = (window as unknown as { __game: KeyboardGame }).__game;
  return { paused: g.paused(), selected: g.selected(), tile: g.tile(12, 12), heroOpen: g.heroUi.isOpen };
});

async function frames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/thornvael/?hero=warrior,m,medium');
  await page.waitForFunction(() => (window as unknown as { __game?: KeyboardGame }).__game);
});

test('typing i in the actual save name leaves Hero closed and the sheet open', async ({ page }) => {
  // Saving requires a loaded mission and a created hero, not the free-fight field.
  await page.goto('/thornvael/?mission=ford&hero=warrior,m,medium');
  await page.waitForFunction(() => (window as unknown as { __game?: KeyboardGame }).__game);
  await page.getByRole('button', { name: 'Begin the mission', exact: true }).click();
  await page.locator('#mission').getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('#mission')).toBeHidden();
  await page.locator('#btn-saves').click();
  const name = page.locator('.saves input:not([type=file])');
  await name.fill('');
  await name.pressSequentially('ivy');
  await expect(name).toHaveValue('ivy');
  await expect(page.locator('.saves')).toBeVisible();
  expect((await game(page)).heroOpen).toBe(false);
});

for (const kind of ['input', 'textarea', 'select', 'contenteditable', 'inherited-contenteditable']) {
  test(`${kind} owns letters, Space, arrows and group shortcuts`, async ({ page }) => {
    await page.evaluate((kind) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;z-index:9999;top:0;left:0';
      if (kind.includes('contenteditable')) {
        host.contentEditable = 'true';
        const target = document.createElement('span');
        target.id = 'keyboard-editor';
        target.tabIndex = 0;
        if (kind === 'contenteditable') target.contentEditable = 'true';
        host.append(target);
      } else {
        const target = document.createElement(kind);
        target.id = 'keyboard-editor';
        if (kind === 'select') target.innerHTML = '<option>ivy</option><option>oak</option>';
        host.append(target);
      }
      document.body.append(host);
      document.getElementById('keyboard-editor')!.focus();
    }, kind);
    const before = await game(page);
    // Keep focus on the editor even if a broken shortcut opens another panel.
    for (const key of ['i', ' ', 'q', 'ArrowRight', '1']) {
      await page.locator('#keyboard-editor').dispatchEvent('keydown', { key, code: key === '1' ? 'Digit1' : '', bubbles: true });
    }
    await frames(page);
    expect(await game(page)).toEqual(before);
  });
}

test('holding Space pauses once; a fresh press resumes; repeated I does not retoggle Hero', async ({ page }) => {
  await page.keyboard.down('Space');
  expect((await game(page)).paused).toBe(true);
  await page.keyboard.down('Space'); // Playwright marks a second down as repeat.
  expect((await game(page)).paused).toBe(true);
  await page.keyboard.up('Space');
  await page.keyboard.press('Space');
  expect((await game(page)).paused).toBe(false);
  await page.keyboard.down('i');
  expect((await game(page)).heroOpen).toBe(true);
  await page.keyboard.down('i');
  expect((await game(page)).heroOpen).toBe(true);
  await page.keyboard.up('i');
  await page.keyboard.press('i');
  expect((await game(page)).heroOpen).toBe(false);
});

for (const interruption of ['keyup', 'blur', 'hidden']) {
  test(`held arrows pan continuously and stop after ${interruption}`, async ({ page }) => {
    const before = (await game(page)).tile;
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await game(page)).tile[0]).toBeLessThan(before[0]);
    const moving = (await game(page)).tile[0];
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await game(page)).tile[0]).toBeLessThan(moving);
    if (interruption === 'keyup') await page.keyboard.up('ArrowRight');
    else if (interruption === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const stopped = (await game(page)).tile;
    await frames(page);
    await frames(page);
    expect((await game(page)).tile).toEqual(stopped);
    await page.keyboard.up('ArrowRight');
  });
}

for (const interruption of ['blur', 'hidden']) {
  test(`${interruption} cancels an unfinished mouse selection before its delayed pointerup`, async ({ page }) => {
    const [x, y] = await page.evaluate(() => (window as unknown as { __game: KeyboardGame }).__game.unitScreen(0));
    await page.mouse.click(x, y);
    expect((await game(page)).selected).toEqual([0]);
    const canvas = page.locator('#game');
    await canvas.dispatchEvent('pointerdown', { pointerId: 91, pointerType: 'mouse', button: 0, clientX: x + 80, clientY: y + 80, bubbles: true });
    await canvas.dispatchEvent('pointermove', { pointerId: 91, pointerType: 'mouse', clientX: x + 100, clientY: y + 100, bubbles: true });
    if (interruption === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // The stale box would clear selection; cancellation makes this up a no-op.
    await canvas.dispatchEvent('pointerup', { pointerId: 91, pointerType: 'mouse', bubbles: true });
    expect((await game(page)).selected).toEqual([0]);
    // A new click still works after cancellation.
    await page.mouse.click(x, y);
    expect((await game(page)).selected).toEqual([0]);
  });
}
