import { expect, test, type Page } from '@playwright/test';

async function checkHud(page: Page): Promise<void> {
  const issues = await page.evaluate(() => {
    const issues: string[] = [];
    const selectors = '.bar button, #minimap, #btn-alt, .squad-bar button, #gothic-hud .belt-slot, #gothic-hud .skill-slot, #gothic-hud .utility-buttons button, #hint, #stats';
    const elements = [...document.querySelectorAll<HTMLElement>(selectors)].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    });
    const label = (el: HTMLElement): string => el.id || el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName;
    for (const el of elements) {
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) issues.push(`${label(el)} outside viewport`);
      if (el.matches('.squad-bar button, #btn-run')) {
        if (r.width < 44 || r.height < 44) issues.push(`${label(el)} below 44px (${Math.round(r.width)}x${Math.round(r.height)})`);
      }
      if (el.matches('button, [role="button"]')) {
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!hit || !el.contains(hit)) issues.push(`${label(el)} covered`);
      }
    }
    // Check non-overlap across elements (excluding parent/child containment).
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        if (elements[i].contains(elements[j]) || elements[j].contains(elements[i])) continue;
        const a = elements[i].getBoundingClientRect();
        const b = elements[j].getBoundingClientRect();
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) {
          issues.push(`${label(elements[i])} overlaps ${label(elements[j])}`);
        }
      }
    }
    const bar = document.querySelector('.bar')!.getBoundingClientRect();
    const hud = document.querySelector('#gothic-hud .hud-center')!.getBoundingClientRect();
    if (hud.top - bar.bottom < 90) issues.push('less than 90px of vertical battlefield remains');
    // Check center-field points avoid left squad-bar and right minimap: no transparent wrapper may swallow input.
    const y = (bar.bottom + hud.top) / 2;
    for (const x of [innerWidth * 0.4, innerWidth * 0.5, innerWidth * 0.6]) {
      if (document.elementFromPoint(x, y)?.id !== 'game') issues.push(`canvas blocked at ${Math.round(x)},${Math.round(y)}`);
    }
    return issues;
  });
  expect(issues).toEqual([]);
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 900, height: 450 }, { width: 844, height: 390 }]) {
  test.describe(`HUD ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('HUD panels fit without overlap and leave the battlefield interactive', async ({ page }) => {
      await page.goto('/thornvael/?hero=warrior,m,medium');
      await page.waitForFunction(() => window.__game);
      await expect(page.locator('#gothic-hud')).toBeVisible();
      await expect(page.locator('#minimap')).toBeVisible();
      await expect(page.locator('.squad-bar')).toBeVisible();
      await expect(page.locator('#stats')).not.toBeEmpty();
      // Select through the actual squad-bar hero button: its location must also be usable.
      const hero = page.locator('.squad-bar .squad-member.is-hero');
      await hero.click();
      await expect(hero).toHaveClass(/is-selected/);
      await checkHud(page);

      // Exercise dynamic toggles (Walk/Run and Loot highlight), not only initial text.
      await page.locator('#btn-run').click();
      await page.locator('#btn-run').click();
      await page.locator('#btn-alt').click();
      await page.locator('#btn-alt').click();
      await checkHud(page);

      // Squad member buttons must remain accessible >= 44px targets.
      const members = page.locator('.squad-bar .squad-member');
      for (let i = 0; i < await members.count(); i++) {
        const member = members.nth(i);
        const accessible = await member.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return r.width >= 44 && r.height >= 44 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!hit && el.contains(hit);
        });
        expect(accessible, `squad member ${i} reachable`).toBe(true);
      }
      await page.screenshot({ path: `test-results/hud-${viewport.width}x${viewport.height}.png` });
    });
  });
}
