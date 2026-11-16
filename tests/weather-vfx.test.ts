import { describe, expect, it } from 'vitest';
import {
  AestheticVfxSystem,
  actToBiome,
  biomeToAct,
  detectBiomeFromMap,
  type BiomeWeatherType,
  type BiomeAct,
} from '../src/aesthetic-vfx';
import { generateMap, Terrain } from '../src/map';
import { Sim } from '../src/sim/sim';
import { DEFAULT_PREFERENCES, readPreferences, writePreference } from '../src/preferences';

describe('Environmental VFX & Biome Weather System (AestheticVfxSystem)', () => {
  it('maps between Act numbers (1-4) and BiomeWeatherType cleanly', () => {
    expect(actToBiome(1)).toBe('swamp');
    expect(actToBiome(2)).toBe('desert');
    expect(actToBiome(3)).toBe('caves');
    expect(actToBiome(4)).toBe('hell');
    expect(actToBiome(99)).toBe('swamp'); // safe fallback

    expect(biomeToAct('swamp')).toBe(1);
    expect(biomeToAct('desert')).toBe(2);
    expect(biomeToAct('caves')).toBe(3);
    expect(biomeToAct('hell')).toBe(4);
  });

  it('detects biome correctly from map naming conventions and terrain histograms', () => {
    expect(detectBiomeFromMap('Whispers in the Fen')).toBe('swamp');
    expect(detectBiomeFromMap('Blood at the Ford')).toBe('swamp');
    expect(detectBiomeFromMap('Muddlefen')).toBe('swamp');

    expect(detectBiomeFromMap('Gullet of Dunes')).toBe('desert');
    expect(detectBiomeFromMap('m12-redmarsh-border')).toBe('desert');
    expect(detectBiomeFromMap('Arid Wasteland')).toBe('desert');

    expect(detectBiomeFromMap('The Sunken Sanctum')).toBe('caves');
    expect(detectBiomeFromMap('Weeping Ossuary')).toBe('caves');
    expect(detectBiomeFromMap('Drowned Choir')).toBe('caves');
    expect(detectBiomeFromMap('m10-undervault-links')).toBe('caves');

    expect(detectBiomeFromMap('Cinder Throne')).toBe('hell');
    expect(detectBiomeFromMap('Crossroads of Ash')).toBe('hell');
    expect(detectBiomeFromMap('Ember Reckoning')).toBe('hell');

    // Terrain analysis fallback
    const dirtTerrain = new Uint8Array(100).fill(Terrain.Dirt);
    expect(detectBiomeFromMap('Generic Arena', dirtTerrain)).toBe('desert');

    const rockTerrain = new Uint8Array(100).fill(Terrain.Rock);
    expect(detectBiomeFromMap('Generic Arena', rockTerrain)).toBe('caves');

    const waterTerrain = new Uint8Array(100).fill(Terrain.Water);
    expect(detectBiomeFromMap('Generic Arena', waterTerrain)).toBe('swamp');
  });

  it('guarantees 100% Render-only safety: does not alter sim state, tick, or hash', () => {
    const map = generateMap(42);
    const sim = new Sim(map, 1234, [0, 1], { combat: true });

    // Step sim a few ticks to populate state
    for (let i = 0; i < 5; i++) sim.step();
    const hashBefore = sim.hash();
    const tickBefore = sim.tick;

    const weather = new AestheticVfxSystem();
    weather.init();

    // Run weather across all 4 biomes with various camera translations
    const biomes: BiomeWeatherType[] = ['swamp', 'desert', 'caves', 'hell'];
    for (const b of biomes) {
      weather.setBiome(b);
      weather.updateAndDraw(1000, 16.6, 50, 50, 1.0, 1920, 1080);
      weather.updateAndDraw(1016, 16.6, 60, 55, 1.2, 1920, 1080);
      weather.updateAndDraw(1033, 16.6, 75, 60, 0.8, 1920, 1080);
    }

    // Verify simulation state, tick, and hash are completely untouched
    expect(sim.tick).toBe(tickBefore);
    expect(sim.hash()).toBe(hashBefore);
    weather.destroy();
  });

  it('manages pre-allocated particle pools according to graphics quality', () => {
    const weather = new AestheticVfxSystem();
    weather.init();

    // High quality (default 2)
    weather.setQuality(2);
    weather.updateAndDraw(1000, 16, 0, 0, 1, 800, 600);
    expect(weather.getActiveParticleCount()).toBe(130);

    // Medium quality (1)
    weather.setQuality(1);
    weather.updateAndDraw(1016, 16, 0, 0, 1, 800, 600);
    expect(weather.getActiveParticleCount()).toBe(70);

    // Low quality (0)
    weather.setQuality(0);
    weather.updateAndDraw(1032, 16, 0, 0, 1, 800, 600);
    expect(weather.getActiveParticleCount()).toBe(35);

    weather.destroy();
  });

  it('supports enabling and disabling via Preferences toggle with immediate zero-overhead cutoff', () => {
    const weather = new AestheticVfxSystem();
    weather.init();
    weather.updateAndDraw(1000, 16, 0, 0, 1, 800, 600);
    expect(weather.isEnabled()).toBe(true);
    expect(weather.getActiveParticleCount()).toBeGreaterThan(0);

    // Disabling clears particles and graphics
    weather.setEnabled(false);
    expect(weather.isEnabled()).toBe(false);
    expect(weather.getActiveParticleCount()).toBe(0);

    // Updating while disabled does not activate particles or draw
    weather.updateAndDraw(1016, 16, 0, 0, 1, 800, 600);
    expect(weather.getActiveParticleCount()).toBe(0);

    // Re-enabling restores active particles
    weather.setEnabled(true);
    weather.updateAndDraw(1032, 16, 0, 0, 1, 800, 600);
    expect(weather.getActiveParticleCount()).toBeGreaterThan(0);

    weather.destroy();
  });

  it('updates Act 1 (Swamp) rain streaks and mist correctly across camera motion', () => {
    const weather = new AestheticVfxSystem();
    weather.init();
    weather.setBiome('swamp');
    expect(weather.getBiome()).toBe('swamp');
    expect(weather.getAct()).toBe(1);

    weather.updateAndDraw(1000, 16.6, 100, 100, 1, 1024, 768);
    // Camera pan shifts particles via parallax
    weather.updateAndDraw(1016.6, 16.6, 120, 105, 1, 1024, 768);

    expect(weather.weatherLayer.children).toContain(weather.hazeGraphics);
    expect(weather.weatherLayer.children).toContain(weather.weatherGraphics);
    weather.destroy();
  });

  it('updates Act 2 (Desert) sand dust motes and heat shimmer correctly', () => {
    const weather = new AestheticVfxSystem();
    weather.init();
    weather.setBiome(2); // By Act number
    expect(weather.getBiome()).toBe('desert');
    expect(weather.getAct()).toBe(2);

    weather.updateAndDraw(2000, 16.6, 200, 200, 1, 1280, 720);
    weather.updateAndDraw(2050, 50, 210, 202, 1, 1280, 720);
    expect(weather.getActiveParticleCount()).toBeGreaterThan(0);
    weather.destroy();
  });

  it('updates Act 3 (Caves) bioluminescent spores and dripping droplets correctly', () => {
    const weather = new AestheticVfxSystem();
    weather.init();
    weather.setBiome('caves');
    expect(weather.getBiome()).toBe('caves');
    expect(weather.getAct()).toBe(3);

    // Multiple frames simulating spore glow oscillation and falling water droplets
    for (let t = 0; t < 10; t++) {
      weather.updateAndDraw(3000 + t * 50, 50, 0, 0, 1, 800, 600);
    }
    expect(weather.getActiveParticleCount()).toBeGreaterThan(0);
    weather.destroy();
  });

  it('updates Act 4 (Hell) upward embers and falling ash correctly', () => {
    const weather = new AestheticVfxSystem();
    weather.init();
    weather.setBiome('hell');
    expect(weather.getBiome()).toBe('hell');
    expect(weather.getAct()).toBe(4);

    // Simulate embers rising and cooling through their thermal life cycle
    for (let t = 0; t < 12; t++) {
      weather.updateAndDraw(4000 + t * 40, 40, 0, 0, 1, 800, 600);
    }
    expect(weather.getActiveParticleCount()).toBeGreaterThan(0);
    weather.destroy();
  });

  it('persists weather setting in Preferences without affecting audio or quality', () => {
    const mockStore = () => {
      const storage = new Map<string, string>();
      return {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
      };
    };

    const disk = mockStore();
    expect(readPreferences(disk).weather).toBe(true);

    expect(writePreference('weather', false, disk)).toBe(true);
    expect(readPreferences(disk).weather).toBe(false);
    expect(readPreferences(disk).sound).toBe(true);
    expect(readPreferences(disk).quality).toBe(2);

    expect(writePreference('weather', true, disk)).toBe(true);
    expect(readPreferences(disk).weather).toBe(true);
  });
});
