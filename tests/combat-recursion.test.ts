import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { Elem, Kind, strike } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { Cls } from '../src/sim/items';
import { Sim } from '../src/sim/sim';

function openField(w = 16, h = 16): GameMap {
  return {
    w,
    h,
    terrain: new Uint8Array(w * h),
    height: new Uint8Array(w * h),
    blocked: new Uint8Array(w * h),
    objects: [],
    light: new Uint8Array(w * h).fill(200),
  };
}

describe('Combat strike recursion guard', () => {
  it('bounds reciprocal lightning_enchanted retaliatory strikes at depth < 4 without stack overflow', () => {
    const sim = new Sim(openField(), 42, [0, 1], {
      kinds: [Kind.Golem, Kind.Golem],
      bossMods: [['lightning_enchanted'], ['lightning_enchanted']],
      hpMul: 200,
      combat: true,
    });
    sim.place(0, 5, 5);
    sim.place(1, 6, 5);
    sim.cb.log = [];

    expect(() => {
      strike(sim, 1, 10, 10, Elem.Physical, 50, 0);
    }).not.toThrow();

    // Depth 0 (0 -> 1) -> Depth 1 (1 -> 0) -> Depth 2 (0 -> 1) -> Depth 3 (1 -> 0) -> Depth 4 stopped
    expect(sim.cb.log.length).toBeLessThanOrEqual(4);
    expect(sim.cb.log.length).toBeGreaterThanOrEqual(1);
    expect(sim.cb.hp[0]).toBeLessThan(sim.cb.hpMax[0]);
    expect(sim.cb.hp[1]).toBeLessThan(sim.cb.hpMax[1]);
  });

  it('bounds reciprocal thorns reflection between two thorns bearers without stack overflow', () => {
    const sim = new Sim(openField(), 77, [0, 1], {
      kinds: [Kind.Warrior, Kind.Golem],
      bossMods: [['thorns'], ['thorns']],
      hpMul: 200,
      combat: true,
    });
    sim.place(0, 5, 5);
    sim.place(1, 6, 5);
    sim.cb.log = [];

    expect(() => {
      for (let i = 0; i < 10; i++) {
        strike(sim, 1, 20, 20, Elem.Physical, 60, 0);
      }
    }).not.toThrow();

    expect(sim.cb.hp[0]).toBeLessThan(sim.cb.hpMax[0]);
    expect(sim.cb.hp[1]).toBeLessThan(sim.cb.hpMax[1]);
  });

  it('bounds reciprocal thorns + lightning_enchanted on Hero aura vs elite boss without stack overflow', () => {
    const sim = new Sim(openField(), 99, [0, 1], {
      kinds: [Kind.Hero, Kind.Golem],
      bossMods: [['lightning_enchanted'], ['thorns', 'lightning_enchanted']],
      hpMul: 200,
      combat: true,
    });
    sim.place(0, 5, 5);
    sim.place(1, 6, 5);
    createHero(sim, 0, Cls.Warrior, false, 1);
    sim.cb.hpMax[0] = 20000;
    sim.cb.hp[0] = 20000;
    sim.hero!.activeAura = 'thorns';
    sim.cb.log = [];

    expect(() => {
      for (let i = 0; i < 10; i++) {
        strike(sim, 1, 25, 25, Elem.Physical, 80, 0);
      }
    }).not.toThrow();

    // Every single top-level strike is bounded by depth < 4 (1 initial + up to 2 branches at depth 1..3)
    expect(sim.cb.log.length).toBeGreaterThan(0);
    expect(sim.cb.log.length).toBeLessThanOrEqual(150);
  });

  it('ignores strike calls when depth >= 4 directly', () => {
    const sim = new Sim(openField(), 123, [0, 1], {
      kinds: [Kind.Warrior, Kind.Gnoll],
      combat: true,
    });
    sim.place(0, 5, 5);
    sim.place(1, 6, 5);
    const hpBefore = sim.cb.hp[1];

    strike(sim, 1, 20, 20, Elem.Fire, 99, 0, 4);
    expect(sim.cb.hp[1]).toBe(hpBefore);
  });

  it('keeps combat deterministic across identical seeds and snapshot/restore', () => {
    const runBattle = (seed: number) => {
      const sim = new Sim(openField(), seed, [0, 1], {
        kinds: [Kind.Golem, Kind.Golem],
        bossMods: [['thorns', 'lightning_enchanted'], ['thorns', 'lightning_enchanted']],
        hpMul: 50,
        combat: true,
      });
      sim.place(0, 5, 5);
      sim.place(1, 6, 5);
      for (let t = 0; t < 30; t++) sim.step();
      const snap = sim.snapshot();
      for (let t = 0; t < 30; t++) sim.step();
      const finalHash = sim.hash();

      sim.restore(snap);
      for (let t = 0; t < 30; t++) sim.step();
      return { finalHash, restoredHash: sim.hash() };
    };

    const a = runBattle(555);
    const b = runBattle(555);
    expect(a.finalHash).toBe(a.restoredHash);
    expect(a.finalHash).toBe(b.finalHash);
  });
});
