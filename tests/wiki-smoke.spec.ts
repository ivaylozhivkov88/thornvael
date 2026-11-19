import { expect, test } from '@playwright/test';

test.describe('Thornvael Wiki smoke & offline PWA', () => {
  test('opens wiki.html, searches skeleton/hollow, opens article with infobox & minimap', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/thornvael/wiki.html');
    await expect(page.getByRole('heading', { name: 'Thornvael Compendium' })).toBeVisible();

    const searchInput = page.getByRole('searchbox', { name: /search thornvael wiki/i });
    await searchInput.fill('skeleton');
    const suggestions = page.getByRole('listbox', { name: /search suggestions/i });
    await expect(suggestions).toBeVisible();
    await expect(suggestions.getByRole('option').first()).toBeVisible();

    await searchInput.press('Enter');
    await expect(page.getByRole('heading', { name: /search results/i })).toBeVisible();

    await searchInput.fill('hollow');
    await searchInput.press('Enter');
    await page.locator('.wiki-card', { hasText: 'Hollow Knight' }).first().click();

    await expect(page.getByRole('heading', { name: 'Hollow Knight' })).toBeVisible();
    await expect(page.getByLabel('Article infobox')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'See also' })).toBeVisible();

    await page.goto('/thornvael/wiki.html#/biomes');
    await expect(page.locator('.wiki-card img').first()).toBeVisible();
    const imgLoaded = await page.locator('.wiki-card img').first().evaluate((el) => {
      const img = el as HTMLImageElement;
      return img.complete && img.naturalWidth > 0;
    });
    expect(imgLoaded).toBe(true);
    expect(errors).toEqual([]);
  });

  test('offline reload works on wiki.html after service worker activates', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/thornvael/wiki.html');
    await expect(page.getByRole('heading', { name: 'Thornvael Compendium' })).toBeVisible();

    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Thornvael Compendium' })).toBeVisible();
    await page.goto('/thornvael/wiki.html#/bestiary/gnoll');
    await expect(page.getByRole('heading', { name: 'Border Gnoll' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
