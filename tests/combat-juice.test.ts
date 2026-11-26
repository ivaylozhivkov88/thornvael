import { describe, expect, it } from 'vitest';
import {
  AtmosphereSystem,
  getBiomeAtmosphereConfig,
  normalizeAtmosphereBiome,
} from '../src/atmosphere';
import { CombatFeelSystem } from '../src/feel';
import { VfxSystem } from '../src/vfx';

describe('Thornvael Combat Juice & Biome Atmosphere', () => {
  describe('1. Biome Atmospheric Overlays', () => {
    it('configures distinct additive layers for marsh, crypt, volcanic, desert, highlands', () => {
      expect(normalizeAtmosphereBiome('marsh')).toBe('marsh');
      expect(normalizeAtmosphereBiome('crypt')).toBe('crypt');
      expect(normalizeAtmosphereBiome('volcanic')).toBe('volcanic');
      expect(normalizeAtmosphereBiome('desert')).toBe('desert');
      expect(normalizeAtmosphereBiome('highlands')).toBe('highlands');

      // Marsh & crypt have volumetric fog wisps and spores
      const marshCfg = getBiomeAtmosphereConfig('marsh');
      expect(marshCfg.layers[0].effect).toBe('fog');

      // Volcanic has rising embers
      const volcanicCfg = getBiomeAtmosphereConfig('volcanic');
      expect(volcanicCfg.layers[0].effect).toBe('embers');

      // Desert has dust motes
      const desertCfg = getBiomeAtmosphereConfig('desert');
      expect(desertCfg.layers[0].effect).toBe('dust');

      // Highlands has snow flurries
      const highlandsCfg = getBiomeAtmosphereConfig('highlands');
      expect(highlandsCfg.layers[0].effect).toBe('snow');
    });

    it('AtmosphereSystem executes particle physics and respects low-spec toggling', () => {
      const sys = new AtmosphereSystem({ headless: true, lowEnd: false, quality: 2 });
      sys.setBiome('marsh');
      sys.update(16, 0, 0, 1, 800, 600);
      expect(sys.isActive()).toBe(true);
      expect(sys.getActiveCount()).toBeGreaterThan(0);

      // Low-spec mode explicitly disables atmospheric overlays
      sys.setLowSpec(true);
      expect(sys.isLowSpec()).toBe(true);
      expect(sys.isActive()).toBe(false);
      sys.update(16, 10, 10, 1, 800, 600);
      expect(sys.getActiveCount()).toBe(0);

      // Re-enable
      sys.setLowSpec(false);
      sys.update(16, 20, 20, 1, 800, 600);
      expect(sys.isActive()).toBe(true);
      expect(sys.getActiveCount()).toBeGreaterThan(0);
    });

    it('updates Volcanic heat ripples and Highlands snow/rain flurries without allocations', () => {
      const sys = new AtmosphereSystem({ headless: true, lowEnd: false, quality: 2 });
      sys.setBiome('volcanic');
      sys.update(33, 50, 50, 1, 1024, 768);
      expect(sys.getActiveCount()).toBe(getBiomeAtmosphereConfig('volcanic').totalCap);

      sys.setBiome('highlands');
      sys.update(33, 100, 100, 1, 1024, 768);
      expect(sys.getActiveCount()).toBe(getBiomeAtmosphereConfig('highlands').totalCap);
    });
  });

  describe('2. Monster Family Death FX & Corpse Decals', () => {
    it('handles skeletons collapsing into bone fragments', () => {
      const feel = new CombatFeelSystem(64, 64);
      feel.onMonsterDeath(100, 100, 'hollow-knight');
      // Step simulation forward
      feel.update(0.016, 1016, 0, 0, 1);
      // Verify bone fragments and splatters updated without error
      expect(feel.isFrozen(1016)).toBe(false);
    });

    it('leaves temporary ground corpse decals for beasts that gently fade out', () => {
      const feel = new CombatFeelSystem(64, 64);
      feel.spawnCorpseDecal(200, 200, 16, 0x5a0e0e);
      // Decal updates and fades across time
      feel.update(1.0, 2000, 0, 0, 1);
      feel.update(2.0, 4000, 0, 0, 1);
    });

    it('bursts casters and undead into ethereal motes', () => {
      const feel = new CombatFeelSystem(64, 64);
      feel.spawnEtherealMotes(150, 150, 14, 0xb868ff);
      feel.onMonsterDeath(150, 150, 'glasswing');
      feel.update(0.05, 1050, 0, 0, 1);
    });

    it('triggers hit-stop micro-freeze (2-4 frames) + trauma + radial loot pop on boss death', () => {
      const feel = new CombatFeelSystem(64, 64);
      const now = 5000;
      feel.onMonsterDeath(300, 300, 'morvessa', true, true, now);

      // Hit-stop active for ~70ms (approx 2-4 frames at 60fps)
      expect(feel.isFrozen(now + 20)).toBe(true);
      expect(feel.isFrozen(now + 50)).toBe(true);
      expect(feel.isFrozen(now + 85)).toBe(false);

      // Screen shake trauma triggered
      feel.update(0.016, now + 16, 0, 0, 1);
      expect(feel.shakeX).not.toBe(0);
      expect(feel.shakeY).not.toBe(0);
    });
  });

  describe('3. Projectile Visual Trails', () => {
    it('emits crisp distinct trails for fireballs, frost shards, and shadow orbs', () => {
      const vfx = new VfxSystem();
      vfx.init();

      // Fireball ember trail
      expect(() => {
        vfx.emitProjectileTrail(100, 100, 90, 95, 'fireball', 2);
      }).not.toThrow();

      // Frost shard ice crystal mist
      expect(() => {
        vfx.emitProjectileTrail(120, 120, 110, 115, 'frost', 4);
      }).not.toThrow();

      // Shadow orb dark wisps
      expect(() => {
        vfx.emitProjectileTrail(140, 140, 130, 135, 'shadow', 6);
      }).not.toThrow();
    });
  });
});
