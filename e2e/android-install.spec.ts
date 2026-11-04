import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __installTest: {
      calls: number;
      offer(): void;
      choose(): void;
      mode(value: boolean): void;
    };
  }
}

// Synthetic events test our UI wiring; they do not test Chrome's native install UI.
for (const viewport of [{ width: 844, height: 390 }, { width: 1180, height: 820 }]) {
  test.describe(`install wiring ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true });
    test('one-shot prompt, busy choice, fallback, display mode and appinstalled', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        const original = window.matchMedia.bind(window);
        const media = Object.assign(new EventTarget(), { matches: false });
        window.matchMedia = (query) => query === '(display-mode: standalone)' ? media as unknown as MediaQueryList : original(query);
        let choose: () => void = () => {};
        window.__installTest = {
          calls: 0,
          offer() {
            const event = new Event('beforeinstallprompt', { cancelable: true });
            Object.assign(event, {
              prompt: async () => { window.__installTest.calls++; },
              userChoice: new Promise((resolve) => { choose = () => resolve({ outcome: 'dismissed' }); }),
            });
            window.dispatchEvent(event);
          },
          choose: () => choose(),
          mode(value) { media.matches = value; media.dispatchEvent(new Event('change')); },
        };
      });
      await page.goto('/thornvael/?hero=warrior,m,medium');
      await page.waitForFunction(() => window.__game);
      const button = page.locator('#btn-install');
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      await page.evaluate(() => window.__installTest.offer());
      await button.tap();
      await expect(button).toBeDisabled();
      expect(await page.evaluate(() => window.__installTest.calls)).toBe(1);
      await page.evaluate(() => window.__installTest.choose());
      await expect(button).toBeEnabled();
      await button.tap();
      await expect(page.locator('#panel')).toBeVisible();
      expect(await page.evaluate(() => window.__installTest.calls)).toBe(1);
      await page.locator('#panel-close').tap();
      await page.evaluate(() => window.__installTest.mode(true));
      await expect(button).toBeHidden();
      await page.evaluate(() => window.__installTest.mode(false));
      await expect(button).toBeVisible();
      await page.evaluate(() => window.__installTest.offer());
      await button.tap();
      await page.evaluate(() => {
        window.dispatchEvent(new Event('appinstalled'));
        window.__installTest.choose();
      });
      await expect(button).toBeHidden();
      expect(await page.evaluate(() => window.__installTest.calls)).toBe(2);
      expect(errors).toEqual([]);
    });
  });
}
