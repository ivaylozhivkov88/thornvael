import { defineConfig } from '@playwright/test';

// Dedicated smoke config for tests/pwa-smoke.spec.ts (all 7 biomes + expedition + ?debug=1 + mobile PWA offline).
// CI installs Chromium and WebKit; locally set PW_CHANNEL=chrome to test against Chrome.
const channel = process.env.PW_CHANNEL || undefined;
const port = Number(process.env.PW_PORT || 4174);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'tests',
  testMatch: /pwa-smoke\.spec\.ts/,
  // GPU scenes & SW caches share one origin/software renderer; keep serial.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: process.env.CI ? 120_000 : 60_000,
  use: {
    baseURL: origin,
    channel,
    viewport: { width: 900, height: 450 },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', channel },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' },
    },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${origin}/thornvael/`,
    reuseExistingServer: !process.env.CI,
  },
});
