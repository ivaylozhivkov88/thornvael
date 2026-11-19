import { describe, expect, it, vi } from 'vitest';
import {
  type Canvas2DLike,
  FxEngine,
  getLightingBiomeProfile,
  lerpRgbColor,
} from '../src/fx';

function createMockCtx(): Canvas2DLike & {
  ops: string[];
  fills: number;
} {
  const ops: string[] = [];
  let fills = 0;
  return {
    ops,
    get fills() {
      return fills;
    },
    fillStyle: '',
    globalCompositeOperation: 'source-over',
    clearRect: vi.fn(() => {
      ops.push('clearRect');
    }),
    fillRect: vi.fn(() => {
      ops.push('fillRect');
    }),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(() => {
      fills++;
      ops.push('fill');
    }),
    save: vi.fn(() => {
      ops.push('save');
    }),
    restore: vi.fn(() => {
      ops.push('restore');
    }),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
  };
}

describe('A5 — DynamicLightingSystem', () => {
  it('enforces mobile-safe light cap, culls off-screen lights, and prioritizes hero & spells', () => {
    const engine = new FxEngine({ quality: 'high', reducedMotion: false });
    const dl = engine.dynamicLighting;
    expect(dl.isEnabled()).toBe(true);
    const maxCap = dl.getMaxLights();
    expect(maxCap).toBeGreaterThan(0);
    expect(maxCap).toBeLessThanOrEqual(24);

    dl.beginFrame();
    dl.setHeroLight(400, 300, 180);
    dl.emitSpellLight(420, 310, 'fire', 120, 400);

    // Off-screen lights (should be culled)
    dl.addLight({ kind: 'torch', x: -500, y: -500, radius: 100 });
    dl.addLight({ kind: 'lava', x: 5000, y: 5000, radius: 120 });

    // Submit 40 on-screen torches & lava pools (exceeds mobile cap)
    for (let i = 0; i < 40; i++) {
      dl.addLight({
        kind: i % 2 === 0 ? 'lava' : 'torch',
        x: 100 + (i % 8) * 90,
        y: 100 + Math.floor(i / 8) * 90,
        radius: 90,
      });
    }

    const visible = dl.resolveVisibleLights(0, 0, 1, 1024, 768);
    expect(visible.length).toBe(maxCap);
    expect(visible.some((l) => l.kind === 'hero')).toBe(true);
    expect(visible.some((l) => l.kind === 'spell')).toBe(true);
  });

  it('turns completely off on low quality', () => {
    const engine = new FxEngine({ quality: 'low', reducedMotion: false });
    const dl = engine.dynamicLighting;

    expect(dl.isEnabled()).toBe(false);
    expect(dl.getMaxLights()).toBe(0);

    dl.setHeroLight(300, 300, 180);
    dl.addLight({ kind: 'campfire', x: 350, y: 300, radius: 140 });
    expect(dl.emitSpellLight(320, 300, 'frost', 100)).toBeNull();
    expect(dl.resolveVisibleLights(0, 0, 1, 800, 600)).toEqual([]);

    const mulCtx = createMockCtx();
    const addCtx = createMockCtx();
    const count = dl.renderToCanvases(mulCtx, addCtx, 384, 216, 0, 0, 1, 800, 600, 75);
    expect(count).toBe(0);
    expect(mulCtx.fills).toBe(0);
    expect(addCtx.fills).toBe(0);
  });

  it('produces darker ambient colors in night, crypt, and caldera biomes than daytime forest', () => {
    const engine = new FxEngine({ quality: 'high', reducedMotion: false });
    const dl = engine.dynamicLighting;

    const luma = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

    dl.setBiome('forest');
    const forestDay = luma(dl.computeAmbientColor(255));
    const forestNight = luma(dl.computeAmbientColor(75));

    dl.setBiome('crypt');
    const cryptDay = luma(dl.computeAmbientColor(255));
    const cryptNight = luma(dl.computeAmbientColor(75));

    dl.setBiome('caldera');
    const calderaDay = luma(dl.computeAmbientColor(255));

    expect(forestNight).toBeLessThan(forestDay * 0.5);
    expect(cryptDay).toBeLessThan(forestDay * 0.65);
    expect(calderaDay).toBeLessThan(forestDay * 0.65);
    expect(cryptNight).toBeLessThan(cryptDay);
    expect(getLightingBiomeProfile('volcanic').biome).toBe('caldera');
  });

  it('freezes flicker jitter under reducedMotion and renders multiply + additive canvases on high quality', () => {
    const engine = new FxEngine({ quality: 'high', reducedMotion: true });
    const dl = engine.dynamicLighting;
    dl.setBiome('crypt');
    dl.setHeroLight(250, 200, 180);
    dl.addLight({ kind: 'campfire', x: 320, y: 200, radius: 130 });

    const r1 = dl.resolveVisibleLights(0, 0, 1, 800, 600).map((l) => l.screenRadius);
    engine.update(250);
    const r2 = dl.resolveVisibleLights(0, 0, 1, 800, 600).map((l) => l.screenRadius);
    expect(r1).toEqual(r2);

    const mulCtx = createMockCtx();
    const addCtx = createMockCtx();
    const drawn = dl.renderToCanvases(mulCtx, addCtx, 384, 216, 0, 0, 1, 800, 600, 140);
    expect(drawn).toBe(2);
    expect(mulCtx.fills).toBe(2);
    expect(addCtx.fills).toBe(2);
  });
});

describe('A7 — RegionGradeSystem', () => {
  it('interpolates RGB channels cleanly without overflow artifacts', () => {
    expect(lerpRgbColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(lerpRgbColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    const mid = lerpRgbColor(0x204080, 0x6080c0, 0.5);
    expect(mid).toBe(0x4060a0);
  });

  it('resolves distinct biome, region, daylight, and weather grades with smooth interpolation', () => {
    const engine = new FxEngine({ quality: 'high', reducedMotion: false });
    const rg = engine.regionGrade;

    rg.setContext({ biome: 'forest', region: 'Border Fords', weather: 'clear', daylight: 255 });
    rg.snapToTarget();
    const dayForest = rg.getCurrentGrade();

    // Switch to crypt + night + storm -> target changes dramatically while current interpolates smoothly
    rg.setContext({ biome: 'crypt', region: 'Weeping Ossuary', weather: 'storm', daylight: 75 });
    const targetCrypt = rg.getTargetGrade();
    expect(targetCrypt.tintAlpha).toBeGreaterThan(dayForest.tintAlpha);
    expect(targetCrypt.brightness).toBeLessThan(dayForest.brightness);
    expect(targetCrypt.id).toContain('weeping-ossuary');

    const beforeStep = rg.getCurrentGrade();
    expect(beforeStep.tintAlpha).toBeCloseTo(dayForest.tintAlpha, 5);

    // Partial update advances smoothly halfway without teleporting immediately
    engine.update(180);
    const midGrade = rg.getCurrentGrade();
    expect(midGrade.tintAlpha).toBeGreaterThan(dayForest.tintAlpha);
    expect(midGrade.tintAlpha).toBeLessThan(targetCrypt.tintAlpha);

    // Long settle converges to target
    for (let i = 0; i < 40; i++) engine.update(100);
    const finalGrade = rg.getCurrentGrade();
    expect(finalGrade.tintAlpha).toBeCloseTo(targetCrypt.tintAlpha, 2);
    expect(finalGrade.tintColor).toBe(targetCrypt.tintColor);
  });
});

describe('A8 — CameraPolishSystem', () => {
  it('damps camera follow smoothly, solves edge-scroll margins, and enforces zoom bounds', () => {
    const engine = new FxEngine({ quality: 'high', reducedMotion: false });
    const cp = engine.cameraPolish;

    // Clamped zoom bounds
    expect(cp.clampZoom(0.2)).toBe(cp.minZoom);
    expect(cp.clampZoom(8)).toBe(cp.maxZoom);
    expect(cp.clampZoom(Number.NaN)).toBe(cp.minZoom);

    // Zoom anchor conservation
    const zRes = cp.solveZoomAroundPoint(100, 100, 1, 2, 400, 300, 64, 64, 800, 600);
    expect(zRes.zoom).toBe(2);
    const worldXBefore = (400 + 100) / 1;
    const worldXAfter = (400 + zRes.camX) / zRes.zoom;
    expect(worldXAfter).toBeCloseTo(worldXBefore, 0);

    // Smooth follow damping
    const f1 = cp.stepFollow(0, 0, 500, 400, 1, 800, 600, 16);
    expect(f1.settled).toBe(false);
    expect(f1.camX).toBeGreaterThan(0);
    expect(f1.camX).toBeLessThan(100); // targetCamX = 500 - 400 = 100

    // Edge-scroll solver
    const centerEdge = cp.solveEdgeScroll(400, 300, 800, 600, 16);
    expect(centerEdge.active).toBe(false);
    expect(centerEdge.dx).toBe(0);

    const leftEdge = cp.solveEdgeScroll(2, 300, 800, 600, 16);
    expect(leftEdge.active).toBe(true);
    expect(leftEdge.dx).toBeLessThan(0);
    expect(leftEdge.dy).toBe(0);

    const outOfBounds = cp.solveEdgeScroll(-10, 300, 800, 600, 16);
    expect(outOfBounds.active).toBe(false);
  });

  it('triggers spell recoil and intro pan, and zeroes all motion under reducedMotion', () => {
    const engine = new FxEngine({ quality: 'high', reducedMotion: false });
    const cp = engine.cameraPolish;

    const kick = cp.triggerSpellRecoil(1, 0, 6);
    expect(kick.x).toBeLessThan(0);
    expect(Math.hypot(cp.getRecoilOffset().x, cp.getRecoilOffset().y)).toBeGreaterThan(1);

    const started = cp.startIntroPan(200, 200, 500, 400, 'Obsidian Caldera', 1000, 1);
    expect(started).toBe(true);
    expect(cp.getIntroState().active).toBe(true);
    expect(cp.getIntroState().regionName).toBe('Obsidian Caldera');
    expect(Math.hypot(cp.getTotalOffset().x, cp.getTotalOffset().y)).toBeGreaterThan(50);

    engine.update(600);
    expect(cp.getIntroState().progress).toBeGreaterThan(0.5);
    engine.update(600);
    expect(cp.getIntroState().active).toBe(false);
    expect(Math.hypot(cp.getTotalOffset().x, cp.getTotalOffset().y)).toBeLessThan(0.2);

    // Enabling reducedMotion must immediately zero recoil, intro pan, and follow lag
    cp.triggerSpellRecoil(0, 1, 8);
    cp.startIntroPan(100, 100, 600, 600, 'Cinder Throne', 1500, 1);
    engine.setReducedMotion(true);

    expect(cp.getRecoilOffset()).toEqual({ x: 0, y: 0 });
    expect(cp.getIntroState().active).toBe(false);
    expect(cp.getTotalOffset()).toEqual({ x: 0, y: 0 });
    expect(cp.startIntroPan(100, 100, 600, 600, 'Cinder Throne')).toBe(false);
    expect(cp.triggerSpellRecoil(1, 1, 8)).toEqual({ x: 0, y: 0 });
    expect(cp.solveEdgeScroll(1, 1, 800, 600, 16).active).toBe(false);

    const snapFollow = cp.stepFollow(0, 0, 500, 400, 1, 800, 600, 16);
    expect(snapFollow.settled).toBe(true);
    expect(snapFollow.camX).toBe(100);
    expect(snapFollow.camY).toBe(100);
  });
});

describe('FxEngine Wave 2 Facade Integration', () => {
  it('propagates quality, reducedMotion, update, clear, and reports unified stats across A1-A10', () => {
    const engine = new FxEngine({ quality: 'high', reducedMotion: false });

    engine.dynamicLighting.setHeroLight(300, 300);
    engine.dynamicLighting.emitSpellLight(320, 310, 'arcane', 120, 500);
    engine.regionGrade.setContext({ biome: 'volcanic', weather: 'ash', daylight: 120 });
    engine.cameraPolish.triggerSpellRecoil(1, 0, 5);
    engine.cameraPolish.startIntroPan(100, 100, 300, 300, 'Cinder Throne', 1000, 1);

    engine.update(100);
    const statsHigh = engine.getStats();
    expect(statsHigh.quality).toBe('high');
    expect(statsHigh.lightingEnabled).toBe(true);
    expect(statsHigh.spellLights).toBe(1);
    expect(statsHigh.maxLights).toBeGreaterThan(0);
    expect(statsHigh.gradeTintAlpha).toBeGreaterThan(0);
    expect(statsHigh.cameraRecoilActive).toBe(true);
    expect(statsHigh.introPanActive).toBe(true);

    engine.setQuality('low');
    const statsLow = engine.getStats();
    expect(statsLow.lightingEnabled).toBe(false);
    expect(statsLow.maxLights).toBe(0);

    engine.setReducedMotion(true);
    const statsRm = engine.getStats();
    expect(statsRm.reducedMotion).toBe(true);
    expect(statsRm.cameraRecoilActive).toBe(false);
    expect(statsRm.introPanActive).toBe(false);

    engine.clear();
    expect(engine.getStats().spellLights).toBe(0);
  });
});
