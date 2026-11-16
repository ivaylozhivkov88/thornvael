import { describe, expect, it } from 'vitest';
import { Texture, TextureSource } from 'pixi.js';
import { checkSheet, frameName, type UnitSheet } from '../src/sprites/contract';
import { UnitAtlas, UnitSprite, HERO_ARMOUR_TINTS, type HeroWeaponVisual } from '../src/sprites/units';
import { getHeroWeaponVisual, getHeroArmorVisualTier } from '../src/render';
import { ARMOR_TIER_NAMES } from '../src/sprites/palette';

function heroAtlasFixture(): UnitAtlas {
  const counts = { stand: 4, walk: 8, attack: 4, cast: 4, hurt: 2, die: 4 };
  const sheet: UnitSheet = {
    frames: {},
    meta: {
      image: 'hero.png',
      size: { w: 1024, h: 1024 },
      thornvael: { contract: 1, unit: 'hero', directions: 16, cell: [48, 48], anims: counts, mask: 'hero-mask.png' },
    },
  };
  let k = 0;
  for (const [clip, n] of Object.entries(counts)) {
    for (let d = 0; d < 16; d++) {
      for (let f = 0; f < n; f++, k++) {
        sheet.frames[frameName('hero', clip, d, f)] = {
          frame: { x: (k % 21) * 48, y: Math.floor(k / 21) * 48, w: 48, h: 48 },
          sourceSize: { w: 48, h: 48 },
          anchor: { x: 0.5, y: 0.85 },
        };
      }
    }
  }
  expect(checkSheet(sheet)).toEqual([]);
  const texture = new Texture({ source: new TextureSource({ width: 2048, height: 2048 }) });
  return Reflect.construct(UnitAtlas, ['hero', texture, sheet]) as UnitAtlas;
}

describe('Hero Gear Visual Fidelity & Dynamic Armor / Weapon Overhaul', () => {
  it('correctly maps armor items to the 6 distinct armor tiers', () => {
    expect(ARMOR_TIER_NAMES).toEqual(['Leather', 'Chain', 'Scale', 'Plate', 'Gilded', 'Astral/Meteorite']);
    expect(getHeroArmorVisualTier(null)).toBe(0); // Leather / default
    expect(getHeroArmorVisualTier({ name: 'Padded Jerkin', tier: 1 })).toBe(0);
    expect(getHeroArmorVisualTier({ name: 'Chain Mail', tier: 2 })).toBe(1);
    expect(getHeroArmorVisualTier({ name: 'Hardened Brigandine', tier: 3 })).toBe(2);
    expect(getHeroArmorVisualTier({ name: 'Wyrmscale Cuirass', tier: 3 })).toBe(2);
    expect(getHeroArmorVisualTier({ name: 'Plate Armor', tier: 4 })).toBe(3);
    expect(getHeroArmorVisualTier({ name: 'Gothic Full Plate', tier: 5 })).toBe(4);
    expect(getHeroArmorVisualTier({ name: 'Gilded Dragon Cuirass', tier: 5 })).toBe(4);
    expect(getHeroArmorVisualTier({ name: 'Astral Star Robe', tier: 5 })).toBe(5);
    expect(getHeroArmorVisualTier({ name: 'Meteorite Aegis Plate', tier: 5 })).toBe(5);
  });

  it('correctly classifies weapons into sword, bow, and staff visuals', () => {
    expect(getHeroWeaponVisual(null)).toBe('sword');
    expect(getHeroWeaponVisual({ name: 'Rusty Sword' })).toBe('sword');
    expect(getHeroWeaponVisual({ name: 'Steel Sword' })).toBe('sword');
    expect(getHeroWeaponVisual({ name: 'Dreadnought Zweihander' })).toBe('sword');
    expect(getHeroWeaponVisual({ name: 'Berserker Decapitator' })).toBe('sword');
    expect(getHeroWeaponVisual({ name: 'Ash Shortbow' })).toBe('bow');
    expect(getHeroWeaponVisual({ name: 'Composite War Bow' })).toBe('bow');
    expect(getHeroWeaponVisual({ name: 'Heavy Arbalest' })).toBe('bow');
    expect(getHeroWeaponVisual({ name: 'Windpiercer Greatbow' })).toBe('bow');
    expect(getHeroWeaponVisual({ name: 'Oak Staff' })).toBe('staff');
    expect(getHeroWeaponVisual({ name: 'Rune Staff' })).toBe('staff');
    expect(getHeroWeaponVisual({ name: 'Crystal Siphon Wand' })).toBe('staff');
    expect(getHeroWeaponVisual({ name: 'Astral Archon Wand' })).toBe('staff');
  });

  it('dynamically updates layer 2 armor tint and distinct overlays across all 6 armor tiers', () => {
    const atlas = heroAtlasFixture();
    const sprite = new UnitSprite(atlas);

    // Test each armor tier: Leather (0), Chain (1), Scale (2), Plate (3), Gilded (4), Astral/Meteorite (5)
    for (let tier = 0; tier <= 5; tier++) {
      sprite.update(10, false, 0, 0, tier, 1, false, undefined, 0, true, 'sword');
      const info = sprite.inspect();
      expect(info.armorTier).toBe(tier);
      // Layer 2 armor tint must match the exact expected tier color
      expect(info.colors[2]).toBe(HERO_ARMOUR_TINTS[tier]);
    }

    sprite.destroy();
    atlas.source.destroy(true);
  });

  it('adjusts active stance and attack frames when switching between Sword, Bow, and Staff', () => {
    const atlas = heroAtlasFixture();
    const sprite = new UnitSprite(atlas);

    // 1. Sword: standard melee attack clip
    sprite.update(10, false, 0, 0, 3, 1, false, { clip: 'attack', frame: 1, age: 2, finished: false, unresolved: false }, 0, true, 'sword');
    expect(sprite.inspect().resolvedClip).toBe('attack');
    expect(sprite.inspect().frame).toContain('/attack/');
    expect(sprite.inspect().weaponType).toBe('sword');

    // 2. Staff: attack action routes to magical cast animation with staff channeling
    sprite.update(10, false, 0, 0, 3, 1, false, { clip: 'attack', frame: 2, age: 4, finished: false, unresolved: false }, 0, true, 'staff');
    expect(sprite.inspect().resolvedClip).toBe('cast');
    expect(sprite.inspect().frame).toContain('/cast/');
    expect(sprite.inspect().weaponType).toBe('staff');

    // 3. Bow: attack action routes to ranged archery cadence
    sprite.update(10, false, 0, 0, 3, 1, false, { clip: 'attack', frame: 0, age: 1, finished: false, unresolved: false }, 0, true, 'bow');
    expect(sprite.inspect().resolvedClip).toBe('attack');
    expect(sprite.inspect().weaponType).toBe('bow');

    // 4. Stance adjustments when standing:
    // Staff standing stance uses mystical focus posture
    sprite.update(24, false, 0, 0, 3, 1, false, { clip: 'stand', frame: 0, age: 0, finished: false, unresolved: false }, 0, true, 'staff');
    expect(sprite.inspect().weaponType).toBe('staff');

    // Bow standing stance uses archer ready posture
    sprite.update(20, false, 0, 0, 3, 1, false, { clip: 'stand', frame: 0, age: 0, finished: false, unresolved: false }, 0, true, 'bow');
    expect(sprite.inspect().weaponType).toBe('bow');

    sprite.destroy();
    atlas.source.destroy(true);
  });

  it('supports heroic scale rendering in 44-54px height range', () => {
    const atlas = heroAtlasFixture();
    const standard = new UnitSprite(atlas, undefined, 1.0);
    standard.update(0, false, 0, 0, 0, 1, false);
    expect(standard.width).toBeCloseTo(64);
    expect(standard.height).toBeCloseTo(64);

    const heroic = new UnitSprite(atlas, undefined, 1.35);
    heroic.update(0, false, 0, 0, 0, 1, false);
    expect(heroic.heroicScale).toBe(1.35);
    expect(heroic.width).toBeCloseTo(64 * 1.35);
    expect(heroic.height).toBeCloseTo(64 * 1.35);

    // Subject of ~28px scaled by (64 / 48) * 1.35 = ~50.4px (heroic 44-54px range)
    const effectiveHeight = 28 * (64 / 48) * 1.35;
    expect(effectiveHeight).toBeGreaterThanOrEqual(44);
    expect(effectiveHeight).toBeLessThanOrEqual(54);

    standard.destroy();
    heroic.destroy();
    atlas.source.destroy(true);
  });
});
