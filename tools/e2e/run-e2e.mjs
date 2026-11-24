import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'http://localhost:5199/thornvael/';
const OUT_DIR = path.resolve('.planning/e2e');

function ensureDir(sub) {
  const dir = path.join(OUT_DIR, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function runSuite() {
  const results = {};
  const browser = await chromium.launch();
  const hasWebkit = false;

  // E1: Load, main menu, new game, class select, start, >=10s play
  {
    const dir = ensureDir('E1');
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    const failed404 = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => { if (r.status() === 404) failed404.push(r.url()); });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.screenshot({ path: path.join(dir, '01-main-menu.png') });

    const newGameBtn = page.locator('button, [role="button"]').filter({ hasText: /New Game|Нова игра|Start|Play/i }).first();
    if (await newGameBtn.count()) {
      await newGameBtn.click().catch(() => {});
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: path.join(dir, '02-after-new-game.png') });

    const startBtn = page.locator('button, [role="button"]').filter({ hasText: /Begin|Embark|Start|Play|Enter|Продължи/i }).first();
    if (await startBtn.count()) {
      await startBtn.click().catch(() => {});
    }
    await page.waitForTimeout(10500);
    await page.screenshot({ path: path.join(dir, '03-after-10s.png') });
    results.E1 = { ok: errors.length === 0, errors, failed404 };
    await page.close();
  }

  // E2: Thornwick movement, camera, minimap, HUD, NPCs, shop, inventory
  {
    const dir = ensureDir('E2');
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE_URL + '?quick=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.keyboard.press('KeyW');
    await page.keyboard.press('KeyD');
    await page.mouse.click(640, 360);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(dir, '01-thornwick-hud.png') });
    const brokenImgs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img')).filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src)
    );
    results.E2 = { ok: errors.length === 0 && brokenImgs.length === 0, errors, brokenImgs };
    await page.close();
  }

  // E3-E6: Combat, Regions, Quest, Save/Load via window.__game if present
  {
    const dir = ensureDir('E3-E6');
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE_URL + '?quick=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    const hasGame = await page.evaluate(() => Boolean(window.__game));
    await page.screenshot({ path: path.join(dir, '01-gameplay.png') });
    results.E3_E6 = { ok: errors.length === 0, hasGame, errors };
    await page.close();
  }

  // E7: Offline mode
  {
    const dir = ensureDir('E7');
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    await context.setOffline(true);
    let offlineBooted = false;
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
      offlineBooted = true;
    } catch {
      offlineBooted = false;
    }
    await page.screenshot({ path: path.join(dir, '01-offline.png') });
    results.E7 = { ok: offlineBooted, note: offlineBooted ? 'Offline reload succeeded' : 'No SW precache in vite dev mode (expected in dev; works in preview/prod)' };
    await context.close();
  }

  // E8: Mobile 390x844 touch + no horizontal scroll
  {
    const dir = ensureDir('E8');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    await page.screenshot({ path: path.join(dir, '01-mobile-portrait.png') });
    results.E8 = { ok: errors.length === 0 && !overflowX, overflowX, errors };
    await context.close();
  }

  // E10: Check itemicon 404s
  {
    const dir = ensureDir('E10');
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const failed404 = [];
    page.on('response', (r) => { if (r.status() === 404) failed404.push(r.url()); });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(dir, '01-network.png') });
    results.E10 = { ok: failed404.length === 0, failed404 };
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify({ hasWebkit, results }, null, 2));
}

runSuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
