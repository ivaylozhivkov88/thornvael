import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

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

async function measure600(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.__game?.sim), null, { timeout: 25000 });
  const begin = page.getByRole('button', { name: /^Begin the mission/ });
  for (let i = 0; i < 3 && (await begin.isVisible().catch(() => false)); i++) await begin.click();
  const cont = page.getByRole('button', { name: /^Continue \[/ });
  await cont.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
  for (let i = 0; i < 3 && (await cont.isVisible().catch(() => false)); i++) await cont.click();

  return await page.evaluate(
    () =>
      new Promise((resolve) => {
        const deltas = [];
        let last = performance.now();
        function step(now) {
          deltas.push(now - last);
          last = now;
          if (deltas.length >= 600) {
            const sum = deltas.reduce((a, b) => a + b, 0);
            const sorted = [...deltas].sort((a, b) => a - b);
            resolve({
              meanMs: Number((sum / deltas.length).toFixed(2)),
              p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
            });
            return;
          }
          requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }),
  );
}

try {
  const base = `http://localhost:${port}/thornvael/`;
  await waitReady(base);
  const browser = await chromium.launch();
  for (const vp of [
    { name: '360x640', width: 360, height: 640 },
    { name: '390x844', width: 390, height: 844 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    for (const m of ['market', 'm01-blood-at-the-ford']) {
      const res = await measure600(page, `${base}?mission=${m}&hero=warrior,m,medium`);
      console.log(`PERF ${vp.name} ${m}: mean=${res.meanMs}ms p95=${res.p95Ms}ms`);
    }
    await ctx.close();
  }
  await browser.close();
} finally {
  srv.kill();
}
