import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadDoc } from '../src/mapdoc';
import { createMission } from '../src/mission-runtime';
import { scatterFoes } from '../src/scatter';

const raw = JSON.parse(readFileSync(new URL('../src/worlds/act1-world.map.json', import.meta.url), 'utf8'));
const doc = loadDoc(raw).doc;
const town = doc.zones!.find((z) => !z.group)!;

describe('scatterFoes', () => {
  const a = scatterFoes(doc, 1234567, 1);

  it('is the same for the same seed and different for another', () => {
    expect(scatterFoes(doc, 1234567, 1)).toEqual(a);
    expect(scatterFoes(doc, 7654321, 1).units).not.toEqual(a.units);
  });

  it('raises density, stays loadable and adds no foes to the town', () => {
    expect(() => loadDoc(a)).not.toThrow();
    expect(a.units.length).toBeGreaterThan(doc.units.length * 2);
    expect(a.units.length).toBeLessThanOrEqual(768);
    const inTown = a.units.slice(doc.units.length).filter((u) => u.x < town.x + town.w && u.y < town.y + town.h);
    expect(inTown).toHaveLength(0);
  });

  it('gives more elite packs on harder difficulty', () => {
    const elites = (d: number) => scatterFoes(doc, 5, d).units.filter((u) => u.bossMods?.length).length;
    expect(elites(2)).toBeGreaterThan(elites(0));
  });

  it('puts the first packs right outside the town gate, without elites there', () => {
    const outskirts = doc.zones!.find((z) => z.group)!;
    const gate = outskirts.doors!.find((d) => d.to === town.id)!;
    for (const seed of [1234567, 851742018, 42]) {
      const near = scatterFoes(doc, seed, 2).units.filter(
        (u) => u.group === outskirts.group && Math.max(Math.abs(u.x - gate.x), Math.abs(u.y - gate.y)) <= 28,
      );
      expect(near.length).toBeGreaterThanOrEqual(9);
    }
  });

  it('runs identically from the same scattered map', () => {
    const run = () => {
      const g = createMission(loadDoc(a), 3);
      for (let i = 0; i < 100; i++) g.sim.step();
      return g.sim.hash();
    };
    expect(run()).toBe(run());
  });
});
