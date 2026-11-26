import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { Elem, Kind, strike } from '../src/sim/combat';
import { Sim } from '../src/sim/sim';
import { St } from '../src/sim/spelldata';

function field(w = 24, h = 24): GameMap {
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

function duel(attacker: string[], victim: string[] = []) {
  const sim = new Sim(field(), 7, [0, 1], {
    kinds: [Kind.Golem, Kind.Mage],
    bossMods: [attacker, victim],
    hpMul: 20,
    combat: true,
  });
  sim.place(0, 11, 12);
  sim.place(1, 12, 12);
  return sim;
}

/** Fire has no hit roll, so every blow lands. */
const hit = (sim: Sim, t: number, src: number, n = 1) => {
  for (let i = 0; i < n; i++) strike(sim, t, 4, 4, Elem.Fire, 50, src);
};

describe('elite modifiers that act in combat', () => {
  it('cursed blows weaken the target', () => {
    const sim = duel(['cursed']);
    hit(sim, 1, 0, 10);
    expect(sim.cb.stMask[1] & (1 << St.Weaken)).toBeTruthy();
    const plain = duel([]);
    hit(plain, 1, 0, 10);
    expect(plain.cb.stMask[1] & (1 << St.Weaken)).toBeFalsy();
  });

  it('mana burn drains mana and stops at zero', () => {
    const sim = duel(['mana_burn']);
    const before = sim.cb.mana[1];
    hit(sim, 1, 0);
    expect(sim.cb.mana[1]).toBe(before - 10);
    hit(sim, 1, 0, 20);
    expect(sim.cb.mana[1]).toBe(0);
  });

  it('teleporting blinks away once when it falls under a third of life', () => {
    const sim = duel([], ['teleporting']);
    const third = Math.floor(sim.cb.hpMax[1] / 3);
    sim.cb.hp[1] = third;
    const from = [sim.x[1], sim.y[1]];
    strike(sim, 1, 40, 40, Elem.Fire, 50, 0);
    expect([sim.x[1], sim.y[1]]).not.toEqual(from);
    expect(sim.cb.hp[1]).toBe(third - 1);
    const after = [sim.x[1], sim.y[1]];
    hit(sim, 1, 0);
    expect([sim.x[1], sim.y[1]]).toEqual(after);
  });

  it('is deterministic and survives snapshot/restore', () => {
    const run = (sim: Sim) => {
      for (let i = 0; i < 200; i++) sim.step();
      return sim.hash();
    };
    const mods = ['cursed', 'mana_burn', 'teleporting'];
    const a = duel(mods, mods);
    const b = duel(mods, mods);
    const snap = a.snapshot();
    const first = run(a);
    expect(run(b)).toBe(first);
    a.restore(snap);
    expect(run(a)).toBe(first);
  });
});
