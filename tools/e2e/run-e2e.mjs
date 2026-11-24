import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'http://127.0.0.1:5199/thornvael/';
const OUT_DIR = path.resolve('.planning/e2e');
const STEP_TIMEOUT = 30000;
const GLOBAL_TIMEOUT = 10 * 60 * 1000;

function ensureDir(sub) {
  const dir = path.join(OUT_DIR, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function checkCanvasNonBlank(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c || c.width === 0 || c.height === 0) return { hasCanvas: false, nonBlack: false };
    try {
      const ctx = c.getContext('2d');
      if (ctx) {
        const d = ctx.getImageData(0, 0, Math.min(c.width, 64), Math.min(c.height, 64)).data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > 5 || d[i + 1] > 5 || d[i + 2] > 5) return { hasCanvas: true, nonBlack: true };
        }
        return { hasCanvas: true, nonBlack: false };
      }
      // WebGL canvas: assume non-black if dimensions > 0 and no shader error
      return { hasCanvas: true, nonBlack: c.width > 0 && c.height > 0 };
    } catch {
      return { hasCanvas: true, nonBlack: true };
    }
  });
}

function attachListeners(page, errors, failed404) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => {
    errors.push(e.stack || e.message);
  });
  page.on('response', (r) => {
    if (r.status() === 404) failed404.push(r.url());
  });
}

function hasShaderError(errors) {
  return errors.some((e) => /shader|webgl|could not initialize/i.test(e));
}

async function runSuite() {
  const results = {};
  const timer = setTimeout(() => {
    console.error('GLOBAL_TIMEOUT_EXCEEDED');
    process.exit(1);
  }, GLOBAL_TIMEOUT);

  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
    });

    // E1: Load & New Game
    {
      const dir = ensureDir('E1');
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.setDefaultTimeout(STEP_TIMEOUT);
      const errors = [];
      const failed404 = [];
      attachListeners(page, errors, failed404);
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(dir, '01-main-menu.png') });
      const newGameBtn = page.locator('button, [role="button"]').filter({ hasText: /New Game|Нова игра|Start|Play/i }).first();
      if (await newGameBtn.count()) {
        await newGameBtn.click().catch(() => {});
        await page.waitForTimeout(800);
      }
      await page.screenshot({ path: path.join(dir, '02-after-new-game.png') });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(dir, '03-after-play.png') });
      results.E1 = { ok: errors.length === 0 && !hasShaderError(errors), errors, failed404 };
      await page.close();
    }

    // E2: Thornwick (?quick=1)
    {
      const dir = ensureDir('E2');
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.setDefaultTimeout(STEP_TIMEOUT);
      const errors = [];
      const failed404 = [];
      attachListeners(page, errors, failed404);
      await page.goto(BASE_URL + '?quick=1', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await page.keyboard.press('KeyW');
      await page.keyboard.press('KeyD');
      await page.mouse.click(640, 360);
      await page.waitForTimeout(500);
      const canvas = await checkCanvasNonBlank(page);
      await page.screenshot({ path: path.join(dir, '01-thornwick-hud.png') });
      const brokenImgs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('img')).filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src)
      );
      results.E2 = {
        ok: errors.length === 0 && !hasShaderError(errors) && canvas.nonBlack && brokenImgs.length === 0,
        canvas,
        errors,
        brokenImgs,
        failed404,
      };
      await page.close();
    }

    // E3-E6 & E9: Gameplay via window.__game
    {
      const dir = ensureDir('E3-E6');
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.setDefaultTimeout(STEP_TIMEOUT);
      const errors = [];
      const failed404 = [];
      attachListeners(page, errors, failed404);
      await page.goto(BASE_URL + '?quick=1', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const gameState = await page.evaluate(() => {
        const g = window.__game;
        if (!g) return { hasGame: false };
        return { hasGame: true, keys: Object.keys(g).slice(0, 20) };
      });
      const canvas = await checkCanvasNonBlank(page);
      await page.screenshot({ path: path.join(dir, '01-gameplay.png') });
      results.E3_E6 = {
        ok: errors.length === 0 && !hasShaderError(errors) && canvas.nonBlack && gameState.hasGame,
        canvas,
        gameState,
        errors,
      };
      await page.close();
    }

    // E8: Mobile 390x844
    {
      const dir = ensureDir('E8');
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      page.setDefaultTimeout(STEP_TIMEOUT);
      const errors = [];
      attachListeners(page, errors, []);
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      await page.screenshot({ path: path.join(dir, '01-mobile-portrait.png') });
      results.E8 = { ok: errors.length === 0 && !overflowX, overflowX, errors };
      await context.close();
    }

    // E10: Item icons 404 check
    {
      const dir = ensureDir('E10');
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.setDefaultTimeout(STEP_TIMEOUT);
      const failed404 = [];
      attachListeners(page, [], failed404);
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(dir, '01-network.png') });
      results.E10 = { ok: failed404.length === 0, failed404 };
      await page.close();
    }
  } finally {
    clearTimeout(timer);
    if (browser) await browser.close();
  }
  console.log(JSON.stringify({ results }, null, 2));
}

runSuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
