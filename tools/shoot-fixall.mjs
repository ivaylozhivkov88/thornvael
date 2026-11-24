import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const outDir = path.resolve('.planning', 'fixall', 'task2');
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
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Preview server did not start in time');
}

async function bootAndShoot(page, url, outPath) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.__game?.sim), null, { timeout: 25000 });
  const begin = page.getByRole('button', { name: /^Begin the mission/ });
  for (let i = 0; i < 3 && (await begin.isVisible().catch(() => false)); i++) await begin.click();
  const cont = page.getByRole('button', { name: /^Continue \[/ });
  await cont.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
  for (let i = 0; i < 3 && (await cont.isVisible().catch(() => false)); i++) await cont.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: outPath });
}

const targets = [
  'market',
  'm01-blood-at-the-ford',
  'm12-redmarsh-border',
  'm24-pledge-at-oakhaven',
  'm38-besieged-wall',
  'skirmish-alder-weir',
  'skirmish-bracken-basin',
  'skirmish-four-cairns',
  'skirmish-greywood-crossroads',
  'skirmish-kiln-ashlands',
  'skirmish-salt-sieve',
];

try {
  const base = `http://localhost:${port}/thornvael/`;
  await waitReady(base);
  const browser = await chromium.launch();
  for (const [tag, vp] of [
    ['desktop', { width: 1280, height: 720 }],
    ['mobile', { width: 390, height: 844, hasTouch: true, isMobile: true }],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.hasTouch, isMobile: vp.isMobile });
    const page = await ctx.newPage();
    for (const m of targets) {
      try {
        await bootAndShoot(page, `${base}?mission=${encodeURIComponent(m)}&hero=warrior,m,medium`, path.join(outDir, `${m}-${tag}.png`));
      } catch (e) {
        console.log(`WARN ${m} (${tag}): ${e.message.slice(0, 80)}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`Captured Task 2 screenshots in ${outDir}`);
} finally {
  srv.kill();
}
