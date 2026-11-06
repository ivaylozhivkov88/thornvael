import { describe, expect, it } from 'vitest';
import { equipmentLayers, equipmentPreview, skillProgress } from '../src/hero-presentation';
import type { GameMap } from '../src/map';
import { Kind } from '../src/sim/combat';
import { INV_MAX, Why, createHero, equipmentStamp, heroUse } from '../src/sim/hero';
import { Slot, itemId } from '../src/sim/items';
import { Sim } from '../src/sim/sim';

function world(): Sim {
  const w = 16, h = 16;
  const map: GameMap = { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h).fill(200) };
  const sim = new Sim(map, 3, [0], { kinds: [Kind.Hero], combat: true });
  sim.place(0, 5, 5);
  createHero(sim, 0, 0, false, 1);
  return sim;
}

describe('hero skill presentation follows simulation progression', () => {
  it('predicts the exact next level and resets only when the sim levels each skill', () => {
    const sim = world();
    const h = sim.hero!;
    for (let skill = 0; skill < 3; skill++) {
      while (h.skill[skill] < 10) {
        const before = structuredClone(h);
        const progress = skillProgress(h, skill);
        expect(h).toEqual(before); // Rendering must not consume uses or level a skill.
        expect(progress.needed).not.toBeNull();
        for (let n = 1; n < progress.remaining; n++) heroUse(sim, skill);
        expect(h.skill[skill]).toBe(progress.level);
        expect(skillProgress(h, skill).remaining).toBe(1);
        heroUse(sim, skill);
        expect(h.skill[skill]).toBe(progress.level + 1);
        expect(skillProgress(h, skill).used).toBe(0);
      }
    }
  });

  it('has no next level at the cap, including a restored save with leftover uses', () => {
    const sim = world();
    const h = sim.hero!;
    h.skill[1] = 10;
    h.use[1] = 7;
    const before = structuredClone(h);
    expect(skillProgress(h, 1)).toMatchObject({ needed: null, remaining: 0 });
    heroUse(sim, 1);
    expect(h).toEqual(before);
    expect(skillProgress(h, 1)).toMatchObject({ needed: null, remaining: 0 });
  });
});

describe('equipment presentation', () => {
  it('predicts replacement and only shows committed layers', () => {
    const sim = world();
    const h = sim.hero!;
    const old = itemId('Wooden Buckler');
    const item = itemId('Iron Shield');
    h.attr[0] = 8;
    h.eq[Slot.Shield] = old;
    h.inv = Array.from({ length: INV_MAX }, () => ({ item, n: 1 }));
    const source = { from: 'inv', item, slot: INV_MAX - 1 } as const;
    const before = structuredClone(h);
    const preview = equipmentPreview(h, true, source)!;
    expect(preview).toMatchObject({ target: 'eq1', replacement: old, why: 0 });
    expect(equipmentLayers(h)).toContainEqual({ slot: Slot.Shield, name: 'Shield', item: old });
    expect(h).toEqual(before);
    sim.step([{ type: 'hero', ...preview.action, expectedEquipment: equipmentStamp(h, preview.action) }]);
    expect(equipmentLayers(h)).toContainEqual({ slot: Slot.Shield, name: 'Shield', item });
    expect(h.inv).toHaveLength(INV_MAX);
    expect(h.inv.at(-1)).toEqual({ item: old, n: 1 });
    const worn = { from: 'eq', item, slot: Slot.Shield } as const;
    expect(equipmentPreview(h, true, worn)).toMatchObject({ target: 'pack', why: Why.Full });
    expect(equipmentPreview(h, false, worn)?.why).toBe(Why.Dead);
  });

  it('rejects requirements and a stale pack position and excludes non-gear', () => {
    const h = world().hero!;
    const item = itemId('Wizard Hat');
    h.inv.unshift({ item, n: 1 });
    expect(equipmentPreview(h, true, { from: 'inv', item, slot: 0 })?.why).toBe(Why.Class);
    expect(equipmentPreview(h, true, { from: 'inv', item, slot: 1 })?.why).toBe(Why.None);
    expect(equipmentPreview(h, true, { from: 'inv', item: h.inv[1].item, slot: 1 })).toBeNull();
  });
});
