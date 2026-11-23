import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const step = process.argv[2] || 'C3';
const mission = process.argv[3] || 'market';
const tag = process.argv[4] || 'after';
const outDir = path.resolve('.planning', 'world-visuals', step);
fs.mkdirSync(outDir, { recursive: true });

const port = 5199;
const srv = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], {
  stdio: 'ignore',
  detached: false,
});

async function waitReady(url, ms = 20000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Preview server did not start in time');
}

async function boot(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.__game?.sim), null, { timeout: 30000 });
  const begin = page.getByRole('button', { name: /^Begin the mission/ });
  for (let i = 0; i < 4 && (await begin.isVisible().catch(() => false)); i++) await begin.click();
  const cont = page.getByRole('button', { name: /^Continue \[/ });
  await cont.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  for (let i = 0; i < 4 && (await cont.isVisible().catch(() => false)); i++) await cont.click();
  await page.waitForTimeout(1000);
}

try {
  const base = `http://localhost:${port}/thornvael/`;
  await waitReady(base);
  const browser = await chromium.launch();
  const url = `${base}?mission=${encodeURIComponent(mission)}&hero=warrior,m,medium`;

  if (tag === 'before') {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await boot(page, url);
    await page.screenshot({ path: path.join(outDir, 'before.png') });
    await ctx.close();
  } else {
    for (const [label, vp] of [
      ['after-desktop.png', { width: 1280, height: 720 }],
      ['after-mobile.png', { width: 390, height: 844, hasTouch: true, isMobile: true }],
    ]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.hasTouch, isMobile: vp.isMobile });
      const page = await ctx.newPage();
      await boot(page, url);
      await page.screenshot({ path: path.join(outDir, label) });
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`Captured ${tag} screenshots in ${outDir}`);
} finally {
  srv.kill();
}
