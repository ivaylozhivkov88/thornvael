// Capture a short, actual in-game pilot-animation preview for the project diary.
// Requires an already-built preview server and the shipped complete combat atlases.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const project = resolve(import.meta.dirname, '../..');
const out = join(project, '.planning/evidence', `combat-motion-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(out, { recursive: true });
const base = process.argv[2] ?? 'http://127.0.0.1:4187/thornvael/';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 900, height: 450 },
  recordVideo: { dir: out, size: { width: 900, height: 450 } } });
const page = await context.newPage();
const video = page.video();
const started = Date.now();
let from = 0;
try {
  await page.goto(`${base}?hero=warrior,m,medium&art=1`);
  await page.waitForFunction(() => window.__game?.previewArt()?.[0]?.frame);
  await page.getByLabel('Facing', { exact: true }).selectOption('0');
  await page.getByLabel('Animation', { exact: true }).selectOption('2');
  await page.waitForFunction(() => window.__game.previewArt().every((a) => a.requestedClip === 'attack' && !a.fallback));
  from = (Date.now() - started) / 1000;
  await page.getByLabel('Animation', { exact: true }).selectOption('1');
  await page.waitForTimeout(1100);
  for (const [clip, repeats] of [[2, 3], [3, 2]]) {
    await page.getByLabel('Animation', { exact: true }).selectOption(String(clip));
    for (let i = 0; i < repeats; i++) {
      await page.getByRole('button', { name: 'Replay animation', exact: true }).click();
      await page.waitForTimeout(400);
    }
  }
  await page.getByLabel('Animation', { exact: true }).selectOption('5');
  await page.waitForTimeout(1100);
  await page.screenshot({ path: join(out, 'terminal-death.png') });
} finally {
  await context.close();
  await browser.close();
}
const movie = await video.path();
const gif = join(out, 'pilot-combat-preview.gif');
const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(from), '-i', movie,
  '-t', '6', '-filter_complex',
  '[0:v]fps=12,crop=300:160:318:100,scale=600:320:flags=neighbor,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none',
  '-loop', '0', gif], { encoding: 'utf8' });
if (result.error || result.status !== 0) throw new Error(`Video preserved at ${movie}; GIF conversion failed: ${result.error ?? result.stderr}`);
console.log(JSON.stringify({ gif, movie, screenshot: join(out, 'terminal-death.png'),
  note: 'Actual UnitSprite game preview of pilot models; not final realistic art or new monster abilities.' }));
