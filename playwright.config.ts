import { defineConfig } from '@playwright/test';

// CI installs Chromium; locally set PW_CHANNEL=chrome to use the installed Chrome.
const channel = process.env.PW_CHANNEL || undefined;
const port = Number(process.env.PW_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'e2e',
  // GPU scenes share the runner's software renderer; parallel browsers starve it.
  workers: 1,
  timeout: process.env.CI ? 120_000 : 60_000,
  use: { baseURL: origin, channel, viewport: { width: 900, height: 450 } },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${origin}/thornvael/`,
    reuseExistingServer: !process.env.CI,
  },
});
