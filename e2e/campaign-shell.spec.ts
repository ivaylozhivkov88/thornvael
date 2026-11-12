import { expect, test } from '@playwright/test';

test.describe('campaign shell, skirmish list, and story slideshows', () => {
  test('opens 11-map skirmish selector and launches Blackwater Reach cleanly', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('/thornvael/');
    await page.getByRole('button', { name: 'Skirmish (11 Maps)' }).click();
    await expect(page.getByRole('heading', { name: 'Skirmish Maps' })).toBeVisible();

    await expect(page.locator('.sh-skirmish-opts button')).toHaveCount(7);
    const mapButtons = page.locator('.sh-col > button');
    // 11 skirmish map buttons + Back button = 12 buttons
    await expect(mapButtons).toHaveCount(12);

    await page.getByRole('button', { name: /Blackwater/i }).click();
    await page.waitForFunction(() => Boolean((window as unknown as { __game?: { step: (n: number) => void } }).__game));
    await expect(page.locator('canvas').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('plays story slideshow controls and story replay in credits on mobile viewport', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/thornvael/');

    await page.locator('#shell').getByRole('button', { name: 'Credits' }).click();
    await expect(page.getByRole('heading', { name: 'Story Replay' })).toBeVisible();
    await page.getByRole('button', { name: /act i —/i }).click();

    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
    const nextBox = await page.getByRole('button', { name: 'Next' }).boundingBox();
    expect(nextBox?.height ?? 0).toBeGreaterThanOrEqual(40);

    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Replay' }).click();
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByRole('heading', { name: 'Story Replay' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('renders non-overlapping global map nodes across Acts 1-4 on 844x390 mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/thornvael/');
    await page.locator('#shell').getByRole('button', { name: 'New game' }).click();
    await page.locator('#shell').getByRole('button', { name: /^(Start|Begin)$/i }).click();

    for (const act of [1, 2, 3, 4]) {
      await page.locator('#shell .sh-bar').getByRole('button', { name: new RegExp(`^Act ${act}`) }).click();
      const boxes = await page.locator('#shell .sh-map .sh-node').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { id: el.textContent ?? '', x1: r.left, y1: r.top, x2: r.right, y2: r.bottom };
        }),
      );
      expect(boxes.length).toBeGreaterThanOrEqual(11);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const overlapX = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
          const overlapY = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
          expect(overlapX * overlapY, `Act ${act} overlap between "${a.id}" and "${b.id}"`).toBe(0);
        }
      }
    }
  });
});
