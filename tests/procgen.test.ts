import { describe, expect, it } from 'vitest';
import { isPathReachable } from '../src/map-generator';
import { bakeBlocked } from '../src/map';
import { loadDoc, rleDecode, validate } from '../src/mapdoc';
import { generateDepthsLevel } from '../src/sim/procgen';
import { createMission } from '../src/mission';
import { createHero } from '../src/sim/hero';

describe('Endless Depths generator', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = JSON.stringify(generateDepthsLevel({ seed: 4242 }));
    expect(JSON.stringify(generateDepthsLevel({ seed: 4242 }))).toBe(a);
    expect(JSON.stringify(generateDepthsLevel({ seed: 4243 }))).not.toBe(a);
    const ga = createMission(loadDoc(generateDepthsLevel({ seed: 4242 })), 4242);
    const gb = createMission(loadDoc(generateDepthsLevel({ seed: 4242 })), 4242);
    createHero(ga.sim, 0, 0, false, 1);
    createHero(gb.sim, 0, 0, false, 1);
    for (let i = 0; i < 60; i++) {
      ga.sim.step();
      gb.sim.step();
    }
    expect(ga.sim.hash()).toBe(gb.sim.hash());
  });

  it('validates, links every pack and the warden to the hero, and has exactly one super-unique', () => {
    for (const seed of [1, 7, 99, 31337, 424242, 0xdeadbeef]) {
      for (const size of [48, 64, 96] as const) {
        const doc = generateDepthsLevel({ seed, size, depth: 1 + (seed % 5) });
        expect(validate(doc)).toEqual([]);
        const blocked = bakeBlocked(doc.w, doc.h, rleDecode(doc.terrain, doc.w * doc.h), doc.objects);
        const hero = doc.units[0];
        for (const u of doc.units) expect(isPathReachable(doc.w, doc.h, blocked, hero.x, hero.y, u.x, u.y)).toBe(true);
        expect(doc.units.filter((u) => u.bossMods && u.bossMods.length === 2).length).toBe(1);
        expect(doc.units.filter((u) => u.team === 1 && u.pack !== undefined).length).toBeGreaterThanOrEqual(6);
        const win = doc.triggers.find((t) => t.id === 'unique-slain');
        expect(win).toBeTruthy();
      }
    }
  });

  it('scales monster tiers with depth', () => {
    const top = (d: number): number => Math.max(...generateDepthsLevel({ seed: 5, depth: d }).units.map((u) => u.tier ?? 0));
    expect(top(7)).toBeGreaterThan(top(1));
  });
});
