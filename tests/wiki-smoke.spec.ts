import { expect, type Page, test } from '@playwright/test';

interface RouteCheck {
  route: string;
  heading: string | RegExp;
  tab?: string;
}

async function assertRouteRenderedWithImages(page: Page, check: RouteCheck) {
  await page.goto(`/thornvael/wiki.html${check.route}`);
  await expect(page.getByRole('heading', { level: 1, name: check.heading })).toBeVisible();
  if (check.tab) {
    await expect(page.locator('.wiki-tab[aria-current="page"]')).toHaveText(check.tab);
  }
  await expect(page.locator('.wiki-loading')).toHaveCount(0);

  const firstImg = page.locator('.wiki-card img, .infobox-media img').first();
  await expect(firstImg).toBeVisible();
  await firstImg.scrollIntoViewIfNeeded();
  await expect
    .poll(async () =>
      firstImg.evaluate((el) => {
        const img = el as HTMLImageElement;
        return img.complete && img.naturalWidth > 0;
      }),
    )
    .toBe(true);

  await expect(page.locator('.wiki-placeholder')).toHaveCount(0);
  const bodyText = (await page.locator('main').textContent()) ?? '';
  expect(bodyText).not.toContain('No lore yet.');
  expect(bodyText).not.toContain('No art yet');
}

const ROUTE_CHECKS: RouteCheck[] = [
  { route: '#/biomes', heading: /Regions & Maps/, tab: 'Skirmish Biomes' },
  { route: '#/regions', heading: /Regions & Maps/, tab: 'Regions' },
  { route: '#/missions', heading: /Regions & Maps/, tab: 'Missions' },
  { route: '#/affixes', heading: /Items/, tab: 'Affixes' },
  { route: '#/achievements', heading: /Achievements/ },
  { route: '#/lore', heading: /Story & Lore/ },
  { route: '#/tips', heading: /Tips/ },
  { route: '#/glossary', heading: /Glossary/ },
  { route: '#/classes/necromancer', heading: 'Necromancer' },
  { route: '#/gems/rw-stealth', heading: 'Shadow Veil' },
  { route: '#/regions/map1-thornwick-market-city-hub', heading: 'Thornwick Market (City Hub)' },
  { route: '#/missions/m01-blood-at-the-ford', heading: 'Blood at the Ford' },
];

test.describe('Thornvael Wiki smoke & offline PWA', () => {
  test('opens wiki.html, searches skeleton/hollow, opens articles & verifies images across categories', async ({
    page,
  }) => {
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

    for (const check of ROUTE_CHECKS) {
      await assertRouteRenderedWithImages(page, check);
    }

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

    // Prime runtime media cache for minimaps, wiki icons & Necromancer portrait while online
    const offlinePrimedChecks: RouteCheck[] = [
      { route: '#/missions/m01-blood-at-the-ford', heading: 'Blood at the Ford' },
      { route: '#/classes/necromancer', heading: 'Necromancer' },
      { route: '#/gems/rw-stealth', heading: 'Shadow Veil' },
      { route: '#/bestiary/gnoll', heading: 'Border Gnoll' },
    ];
    for (const check of offlinePrimedChecks) {
      await assertRouteRenderedWithImages(page, check);
    }

    // Return to home shell before cutting network so reload tests the offline root shell
    await page.goto('/thornvael/wiki.html#/home');
    await expect(page.getByRole('heading', { name: 'Thornvael Compendium' })).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Thornvael Compendium' })).toBeVisible();

    for (const check of offlinePrimedChecks) {
      await assertRouteRenderedWithImages(page, check);
    }
    expect(errors).toEqual([]);
  });
});
