import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import type { Renderer } from '../src/render';

type Metrics = ReturnType<Renderer['artMetrics']>;
interface BudgetGame {
  sim: { count: number; tick: number; cb: { kind: ArrayLike<number> } };
  artMetrics(): Metrics;
  unitArt(id: number): { frame: string; source: number; sources: number; filters: boolean; visible: boolean } | null;
  stats(): { fps: number; drawMs: number; stepMs: number; worstMs: number; reportAtMs: number;
    quality: number; resolution: number; paused: boolean };
}
test('desktop budget: 300 real animated units, three shared atlas sources, bounded timings', async ({ page }, testInfo) => {
  // Fits the entire 64x48 world at zoom 1: a count of 300 isn't sufficient if most are culled.
  await page.setViewportSize({ width: 2304, height: 1728 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/thornvael/?crowd');
  await page.waitForFunction(() => (window as unknown as { __game?: BudgetGame }).__game?.sim.count === 300);
  const baselineKinds = await page.evaluate(() => Array.from((window as unknown as { __game: BudgetGame }).__game.sim.cb.kind).slice(0, 300));
  expect(await page.evaluate(() => (window as unknown as { __game: BudgetGame }).__game.artMetrics().stress)).toBe(false);

  await page.goto('/thornvael/?crowd&artstress=1');
  await page.waitForFunction(() => {
    const g = (window as unknown as { __game?: BudgetGame }).__game;
    return g?.artMetrics().onScreenArtSprites === 300 && !!g.unitArt(299)?.frame;
  });
  const snapshot = () => page.evaluate(() => {
    const g = (window as unknown as { __game: BudgetGame }).__game;
    return { art: g.artMetrics(), stats: g.stats(), tick: g.sim.tick,
      frames: Array.from({ length: 300 }, (_, i) => g.unitArt(i)!.frame) };
  });
  const initial = await snapshot();
  expect(initial.art).toMatchObject({ stress: true, totalSprites: 300, artSprites: 300,
    visibleArtSprites: 300, onScreenArtSprites: 300, uniqueGpuSources: 3, filteredArtSprites: 0,
    families: { hero: 100, archer: 100, golem: 100 }, layersPerArtSprite: 4 });
  const atlasBytes = ['hero', 'archer', 'golem'].reduce((bytes, name) => {
    const { w, h } = JSON.parse(readFileSync(`public/sprites/${name}.json`, 'utf8')).meta.size;
    return bytes + w * h * 4 * 4; // four RGBA mask layers packed into one source per family
  }, 0);
  expect(initial.art.approxAtlasBytes).toBe(atlasBytes);
  const details = await page.evaluate(() => {
    const g = (window as unknown as { __game: BudgetGame }).__game;
    return Array.from({ length: 300 }, (_, i) => g.unitArt(i)!);
  });
  expect(new Set(details.map((d) => d.source)).size).toBe(3);
  expect(details.every((d) => d.sources === 1 && !d.filters && d.visible && d.frame)).toBe(true);
  expect(await page.evaluate(() => Array.from((window as unknown as { __game: BudgetGame }).__game.sim.cb.kind).slice(0, 300))).toEqual(baselineKinds);

  // Brief warmup + four DISTINCT existing one-second live reports. No headless FPS gate.
  await page.waitForFunction(() => (window as unknown as { __game: BudgetGame }).__game.stats().fps > 0);
  const samples: Awaited<ReturnType<typeof snapshot>>[] = [];
  let previousReport = -1;
  for (let i = 0; i < 4; i++) {
    await page.waitForFunction((previous) => (window as unknown as { __game: BudgetGame }).__game.stats().reportAtMs > previous, previousReport);
    const sample = await snapshot();
    samples.push(sample);
    previousReport = sample.stats.reportAtMs;
    expect(sample.art.onScreenArtSprites).toBe(300);
    expect(sample.art.filteredArtSprites).toBe(0);
    expect(sample.art.uniqueGpuSources).toBe(3);
    expect(sample.stats.paused).toBe(false);
    for (const value of [sample.stats.fps, sample.stats.drawMs, sample.stats.stepMs, sample.stats.worstMs]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  }
  expect(samples.at(-1)!.tick).toBeGreaterThan(initial.tick);
  // Every sprite has actually received changing frames through normal draw/update, not merely been allocated.
  const allFrames = [initial.frames, ...samples.map((s) => s.frames)];
  expect(initial.frames.every((_, i) => new Set(allFrames.map((f) => f[i])).size > 1)).toBe(true);
  expect(errors).toEqual([]);

  const environment = await page.evaluate(() => ({ userAgent: navigator.userAgent, dpr: devicePixelRatio,
    viewport: { width: innerWidth, height: innerHeight }, visibility: document.visibilityState }));
  const report = { mode: 'desktop-crowd-artstress', url: page.url(), environment,
    art: initial.art, observedSeconds: (samples.at(-1)!.stats.reportAtMs - samples[0].stats.reportAtMs) / 1000,
    samples: samples.map(({ frames: _frames, ...s }) => s),
    note: 'FPS is observational, not a device gate. drawMs is existing main-loop presentation CPU cost including effects, audio and periodic HUD/minimap work; it is not GPU time or draw-call count. Atlas bytes estimate RGBA source storage only, excluding chunks, framebuffer, mipmaps, driver copies, retained CPU images and process memory. Adaptive quality is recorded for each sample. Phone acceptance and mass-roster go/no-go remain pending.' };
  const reportPath = testInfo.outputPath('desktop-art-budget.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach('desktop-art-budget.json', { path: reportPath, contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('desktop-art-budget.png') });
  console.log('Desktop art budget:', JSON.stringify(report));
});
