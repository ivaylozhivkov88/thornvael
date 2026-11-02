import { expect, test, type Page } from '@playwright/test';

async function checkHud(page: Page): Promise<void> {
  const issues = await page.evaluate(() => {
    const issues: string[] = [];
    const selectors = '.bar button, .hud-dock button, #minimap, #hint, #stats, #clock';
    const elements = [...document.querySelectorAll<HTMLElement>(selectors)].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    });
    const label = (el: HTMLElement): string => el.id || el.getAttribute('aria-label') || el.textContent || el.tagName;
    for (const el of elements) {
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) issues.push(`${label(el)} outside viewport`);
      if (el.matches('button')) {
        if (r.width < 44 || r.height < 44) issues.push(`${label(el)} below 44px`);
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!hit || !el.contains(hit)) issues.push(`${label(el)} covered`);
      }
    }
    // Button rectangles can fit while a long item name spills over the next row.
    for (const button of document.querySelectorAll<HTMLElement>('#quick > button')) {
      const r = button.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (button.scrollHeight > button.clientHeight + 1 || button.scrollWidth > button.clientWidth + 1) issues.push(`${label(button)} content overflows`);
      for (const child of button.children) {
        const c = child.getBoundingClientRect();
        if (c.top < r.top + 1 || c.bottom > r.bottom - 1 || c.left < r.left + 1 || c.right > r.right - 1) issues.push(`${label(button)} child escapes button`);
      }
    }
    // All pairs, independent of DOM order; exclude genuinely hidden controls above.
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i].getBoundingClientRect();
        const b = elements[j].getBoundingClientRect();
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) issues.push(`${label(elements[i])} overlaps ${label(elements[j])}`);
      }
    }
    const bar = document.querySelector('.bar')!.getBoundingClientRect();
    const dock = document.querySelector('.hud-dock')!.getBoundingClientRect();
    if (dock.top - bar.bottom < 90) issues.push('less than 90px of vertical battlefield remains');
    // Check several points in the open field: no transparent wrapper may swallow input.
    const y = (bar.bottom + dock.top) / 2;
    for (const x of [innerWidth * .15, innerWidth * .35, innerWidth * .55]) {
      if (document.elementFromPoint(x, y)?.id !== 'game') issues.push(`canvas blocked at ${Math.round(x)},${Math.round(y)}`);
    }
    return issues;
  });
  expect(issues).toEqual([]);
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 900, height: 450 }, { width: 844, height: 390 }]) {
  test.describe(`HUD ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('commands fit without overlap and leave the battlefield interactive', async ({ page }) => {
      await page.goto('/thornvael/?hero=warrior,m,medium');
      await page.waitForFunction(() => window.__game);
      await expect(page.locator('#cmds')).toBeVisible();
      await expect(page.locator('#quick')).toBeVisible();
      await expect(page.locator('#stats')).not.toBeEmpty();
      const draught = page.locator('#quick > button').filter({ has: page.locator('.quick-label', { hasText: 'Healing Draught' }) });
      await expect(draught).toHaveAccessibleName(/Healing Draught/);
      await expect(draught).toHaveAttribute('title', /Healing Draught/);
      // Select through the actual portrait control: its location must also be usable.
      const hero = page.locator('.portraits > button.hero');
      await hero.click();
      await expect(hero).toHaveClass(/sel/);
      await checkHud(page);

      // Exercise longer dynamic labels (force mode and speed), not only initial text.
      await page.locator('#btn-force').click();
      await page.locator('#btn-force').click();
      await page.locator('#btn-speed').click();
      await page.locator('#btn-speed').click();
      await checkHud(page);

      // Overflow portraits are intentionally scrollable; each must remain reachable.
      const portraits = page.locator('.portraits > button');
      for (let i = 0; i < await portraits.count(); i++) {
        const portrait = portraits.nth(i);
        await portrait.scrollIntoViewIfNeeded();
        const accessible = await portrait.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return r.width >= 44 && r.height >= 44 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!hit && el.contains(hit);
        });
        expect(accessible, `portrait ${i} reachable`).toBe(true);
      }
      await page.screenshot({ path: `test-results/hud-${viewport.width}x${viewport.height}.png` });
    });
  });
}
