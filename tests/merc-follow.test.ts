import { describe, expect, it } from 'vitest';
import { applyCarryover, type CarryoverState } from '../src/carryover';
import type { GameMap } from '../src/map';
import { Kind, Ord } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { FP, Sim } from '../src/sim/sim';

function makeFlatMap(w: number, h: number): GameMap {
  return {
    w,
    h,
    terrain: new Uint8Array(w * h),
    height: new Uint8Array(w * h),
    blocked: new Uint8Array(w * h),
    light: new Uint8Array(w * h).fill(255),
    objects: [],
  };
}

describe('Mercenary follow behaviour', () => {
  it('sets Ord.Defend on carried-over mercenaries so they follow the hero when only the hero moves', () => {
    const map = makeFlatMap(40, 40);
    // Unit 0: Hero, Unit 1: Dormant Warrior carryover slot, Unit 2: Dormant Archer carryover slot
    const sim = new Sim(map, 42, [0, 0, 0], {
      combat: true,
      kinds: [Kind.Hero, Kind.Warrior, Kind.Archer],
    });
    sim.place(0, 5, 5);
    sim.place(1, 5, 5);
    sim.place(2, 5, 5);
    sim.hidden[1] = 1;
    sim.hidden[2] = 1;
    createHero(sim, 0, 0, false, 1);

    const co: CarryoverState = {
      hero: sim.hero!,
      mercs: [
        { kind: Kind.Warrior, hpPct: 100 },
        { kind: Kind.Archer, hpPct: 100 },
      ],
      gold: 200,
      shopSeed: 1,
      progress: {} as CarryoverState['progress'],
    };

    const placed = applyCarryover(sim, co);
    expect(placed).toBe(2);
    expect(sim.hidden[1]).toBe(0);
    expect(sim.hidden[2]).toBe(0);
    expect(sim.cb.ord[1]).toBe(Ord.Defend);
    expect(sim.cb.aux[1]).toBe(0);
    expect(sim.cb.ord[2]).toBe(Ord.Defend);
    expect(sim.cb.aux[2]).toBe(0);

    const startMercX = sim.x[1];
    const startMercY = sim.y[1];

    // Move ONLY the hero (like WASD or single-hero click) 10 tiles away
    sim.step([{ type: 'move', ids: [0], x: 15.5, y: 15.5 }]);
    for (let t = 0; t < 160; t++) sim.step();

    // Hero reached destination and both mercenaries followed within follow range
    expect(Math.hypot((sim.x[0] - 15.5 * FP) / FP, (sim.y[0] - 15.5 * FP) / FP)).toBeLessThan(1.5);
    expect(sim.x[1]).toBeGreaterThan(startMercX + 4 * FP);
    expect(sim.y[1]).toBeGreaterThan(startMercY + 4 * FP);
    expect(Math.hypot((sim.x[1] - sim.x[0]) / FP, (sim.y[1] - sim.y[0]) / FP)).toBeLessThanOrEqual(4.0);
    expect(Math.hypot((sim.x[2] - sim.x[0]) / FP, (sim.y[2] - sim.y[0]) / FP)).toBeLessThanOrEqual(4.0);
  });

  it('respects explicit hold/guard orders on a mercenary without forcing follow', () => {
    const map = makeFlatMap(40, 40);
    const sim = new Sim(map, 7, [0, 0], {
      combat: true,
      kinds: [Kind.Hero, Kind.Warrior],
    });
    sim.place(0, 5, 5);
    sim.place(1, 6, 5);
    createHero(sim, 0, 0, false, 1);
    sim.cb.ord[1] = Ord.Defend;
    sim.cb.aux[1] = 0;

    // Player explicitly orders the mercenary to Hold Ground
    sim.step([{ type: 'order', order: 'hold', ids: [1] }]);
    expect(sim.cb.ord[1]).toBe(Ord.Hold);

    const holdX = sim.x[1];
    const holdY = sim.y[1];

    // Move hero far away
    sim.step([{ type: 'move', ids: [0], x: 20.5, y: 20.5 }]);
    for (let t = 0; t < 120; t++) sim.step();

    expect(sim.x[1]).toBe(holdX);
    expect(sim.y[1]).toBe(holdY);
  });

  it('preserves determinism and snapshot/restore hash when mercenaries follow the hero', () => {
    const run = () => {
      const map = makeFlatMap(32, 32);
      const sim = new Sim(map, 99, [0, 0], {
        combat: true,
        kinds: [Kind.Hero, Kind.Warrior],
      });
      sim.place(0, 4, 4);
      sim.place(1, 4, 4);
      sim.hidden[1] = 1;
      createHero(sim, 0, 0, false, 1);
      applyCarryover(sim, {
        hero: sim.hero!,
        mercs: [{ kind: Kind.Warrior, hpPct: 100 }],
        gold: 100,
        shopSeed: 1,
        progress: {} as CarryoverState['progress'],
      });
      sim.step([{ type: 'move', ids: [0], x: 14.5, y: 14.5 }]);
      for (let t = 0; t < 40; t++) sim.step();
      const snap = sim.snapshot();
      const hMid = sim.hash();
      for (let t = 0; t < 40; t++) sim.step();
      const hEnd = sim.hash();
      sim.restore(snap);
      expect(sim.hash()).toBe(hMid);
      for (let t = 0; t < 40; t++) sim.step();
      expect(sim.hash()).toBe(hEnd);
      return hEnd;
    };

    expect(run()).toBe(run());
  });
});
