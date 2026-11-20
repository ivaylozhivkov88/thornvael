import { expect, test } from '@playwright/test';

test('menu choices reach gameplay, in-game settings changes survive navigation back to Settings', async ({ page }) => {
  await page.goto('/thornvael/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Sound effects: On', exact: true }).click();
  await page.getByRole('button', { name: 'Music: On', exact: true }).click();
  await page.getByRole('button', { name: 'Quality: High', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sound effects: Off', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Music: Off', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Quality: Low', exact: true })).toBeVisible();

  await page.goto('/thornvael/?hero=warrior,m,medium');
  await page.waitForFunction(() => window.__game);
  await page.locator('#btn-menu').click();
  await page.locator('#pause-menu').getByRole('button', { name: /Settings/i }).click();
  const sfxBtn = page.locator('#pause-menu .pause-setting-row').filter({ hasText: 'Sound Effects (SFX)' }).getByRole('button');
  const musicBtn = page.locator('#pause-menu .pause-setting-row').filter({ hasText: 'Ambient Music' }).getByRole('button');
  await expect(sfxBtn).toHaveText('Unmute');
  await expect(musicBtn).toHaveText('Unmute');
  await expect(page.locator('#pause-menu').getByRole('button', { name: 'Retro (Low)' })).toHaveClass(/active/);

  await sfxBtn.click();
  await musicBtn.click();
  await page.goto('/thornvael/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sound effects: On', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Music: On', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Quality: Low', exact: true })).toBeVisible();
});
