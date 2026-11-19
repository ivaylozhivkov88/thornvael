import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  AtmosphereSystem,
  getBiomeAtmosphereConfig,
  normalizeAtmosphereBiome,
  setAtmosphereReducedMotion,
} from '../src/atmosphere';
import { MinimapPingQueue, getPingColor } from '../src/ui-extra/minimap-pings';
import {
  SettingsPanel,
  getRarityBadge,
  loadUxSettings,
  saveUxSettings,
  type UxSettingsState,
} from '../src/ui-extra/settings-panel';
import { GESTURE_GUIDE_ITEMS } from '../src/ui-extra/mobile-controls-help';

describe('AtmosphereSystem', () => {
  afterEach(() => {
    setAtmosphereReducedMotion(null);
  });

  it('maps all 7 biomes and legacy weather aliases to expected effects', () => {
    expect(normalizeAtmosphereBiome('swamp')).toBe('marsh');
    expect(normalizeAtmosphereBiome('caves')).toBe('crypt');
    expect(normalizeAtmosphereBiome('hell')).toBe('volcanic');

    expect(getBiomeAtmosphereConfig('marsh').layers.map((l) => l.effect)).toEqual(['fog', 'spores']);
    expect(getBiomeAtmosphereConfig('crypt').layers.map((l) => l.effect)).toEqual(['fog', 'spores']);
    expect(getBiomeAtmosphereConfig('volcanic').layers.map((l) => l.effect)).toEqual(['embers', 'embers']);
    expect(getBiomeAtmosphereConfig('desert').layers.map((l) => l.effect)).toEqual(['dust', 'dust']);
    expect(getBiomeAtmosphereConfig('forest').layers.map((l) => l.effect)).toEqual(['leaves', 'fireflies']);
    expect(getBiomeAtmosphereConfig('oasis').layers.map((l) => l.effect)).toEqual(['leaves', 'fireflies']);
    expect(getBiomeAtmosphereConfig('highlands').layers.map((l) => l.effect)).toEqual(['snow', 'snow']);
  });

  it('enforces strict particle caps per biome and quality level', () => {
    const sys = new AtmosphereSystem({ headless: true, lowEnd: false, reducedMotion: false, quality: 2 });
    sys.setBiome('volcanic');
    sys.update(16, 0, 0, 1, 1280, 720);

    const highCap = getBiomeAtmosphereConfig('volcanic').totalCap;
    expect(sys.isActive()).toBe(true);
    expect(sys.getActiveCap()).toBe(highCap);
    expect(sys.getActiveCount()).toBe(highCap);

    sys.setQuality(1);
    sys.update(16, 10, 10, 1, 1280, 720);
    expect(sys.getActiveCap()).toBe(Math.floor(highCap * 0.5));
    expect(sys.getActiveCount()).toBeLessThanOrEqual(Math.floor(highCap * 0.5));
  });

  it('disables particles automatically on low-end devices', () => {
    const sys = new AtmosphereSystem({ headless: true, lowEnd: true, reducedMotion: false, quality: 2 });
    sys.setBiome('forest');
    sys.update(16, 0, 0, 1, 1280, 720);

    expect(sys.isActive()).toBe(false);
    expect(sys.getActiveCap()).toBe(0);
    expect(sys.getActiveCount()).toBe(0);
  });

  it('disables particles immediately when reducedMotion is enabled', () => {
    const sys = new AtmosphereSystem({ headless: true, lowEnd: false, reducedMotion: false, quality: 2 });
    sys.setBiome('highlands');
    sys.update(16, 0, 0, 1, 1280, 720);
    expect(sys.getActiveCount()).toBeGreaterThan(0);

    sys.setReducedMotion(true);
    sys.update(16, 20, 20, 1, 1280, 720);
    expect(sys.isActive()).toBe(false);
    expect(sys.getActiveCap()).toBe(0);
    expect(sys.getActiveCount()).toBe(0);
  });
});

describe('MinimapPingQueue', () => {
  it('enforces maxPings cap and computes fading pulse state', () => {
    const queue = new MinimapPingQueue({ maxPings: 3, defaultDurationMs: 2000, maxPulseRadius: 12 });
    queue.push(10, 10, 'alert', 1000);
    queue.push(20, 20, 'attack', 1100);
    queue.push(30, 30, 'defend', 1200);
    queue.push(40, 40, 'waypoint', 1300);

    expect(queue.size()).toBe(3);
    const activeAt1500 = queue.getActivePings(1500);
    expect(activeAt1500.map((p) => p.tileX)).toEqual([20, 30, 40]);
    expect(activeAt1500[0].progress).toBeCloseTo(0.2, 5);
    expect(activeAt1500[0].alpha).toBeGreaterThan(0.9);
    expect(activeAt1500[0].pulseRadius).toBeGreaterThan(3);

    const activeAt3150 = queue.getActivePings(3150);
    expect(activeAt3150.map((p) => p.tileX)).toEqual([30, 40]);
    expect(getPingColor('defend')).toBe('#58b4ff');

    expect(queue.getActivePings(3350)).toHaveLength(0);
    expect(queue.size()).toBe(0);
  });
});

describe('SettingsPanel & Accessibility Helpers', () => {
  beforeEach(() => {
    setAtmosphereReducedMotion(null);
  });

  it('provides distinct colorblind rarity symbols alongside colors', () => {
    const rare = getRarityBadge('rare', true);
    const unique = getRarityBadge('unique', true);
    const set = getRarityBadge('set', true);
    expect(rare.symbol).toBe('◆');
    expect(unique.symbol).toBe('★');
    expect(set.symbol).toBe('❖');
    expect(rare.symbol).not.toBe(unique.symbol);
    expect(getRarityBadge('rare', false).symbol).toBe('');
  });

  it('updates settings state and triggers quality/reducedMotion callbacks', () => {
    const qualityChanges: Array<0 | 2> = [];
    const motionChanges: boolean[] = [];

    const panel = new SettingsPanel({
      onQualityChange: (q) => qualityChanges.push(q),
      onReducedMotionChange: (r) => motionChanges.push(r),
    });

    const next = panel.updateSettings({
      musicVolume: 0.4,
      sfxVolume: 0.75,
      ambientVolume: 0.5,
      uiVolume: 0.65,
      graphicsQuality: 'low',
      reducedMotion: true,
      textScale: 1.15,
      colorblindRarityBadges: true,
    });

    expect(next.graphicsQuality).toBe('low');
    expect(next.reducedMotion).toBe(true);
    expect(next.textScale).toBe(1.15);
    expect(next.colorblindRarityBadges).toBe(true);
    expect(qualityChanges).toEqual([0]);
    expect(motionChanges).toEqual([true]);

    const defaults: UxSettingsState = loadUxSettings();
    saveUxSettings(defaults);
    panel.destroy();
  });
});

describe('MobileControlsHelp', () => {
  it('defines all 5 touch-first RTS gesture guide items', () => {
    expect(GESTURE_GUIDE_ITEMS.map((g) => g.id)).toEqual([
      'tap',
      'long-press',
      'drag-box',
      'pan-pinch',
      'virtual-stick',
    ]);
    for (const item of GESTURE_GUIDE_ITEMS) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.action.length).toBeGreaterThan(0);
    }
  });
});
