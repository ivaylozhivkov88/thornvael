import { defineConfig } from '@playwright/test';

// CI installs Chromium; locally set PW_CHANNEL=chrome to use the installed Chrome.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173', channel, viewport: { width: 900, height: 450 } },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/thornvael/',
    reuseExistingServer: !process.env.CI,
  },
});
