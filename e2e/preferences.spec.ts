import { expect, test } from '@playwright/test';

test('menu choices reach gameplay, toolbar changes survive navigation back to Settings', async ({ page }) => {
  await page.goto('/thornvael/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Sound effects: On', exact: true }).click();
  await page.getByRole('button', { name: 'Music: Off', exact: true }).click();
  await page.getByRole('button', { name: 'Quality: High', exact: true }).click();
  await page.goto('/thornvael/?hero=warrior,m,medium');
  await page.waitForFunction(() => window.__game);
  await expect(page.locator('#btn-sound')).toHaveText('Sound: off');
  await expect(page.locator('#btn-music')).toHaveText('Music: on');
  await expect(page.locator('#btn-quality')).toHaveText('Quality: Low');
  await page.locator('#btn-sound').click();
  await page.locator('#btn-music').click();
  await page.goto('/thornvael/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sound effects: On', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Music: Off', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Quality: Low', exact: true })).toBeVisible();
});
