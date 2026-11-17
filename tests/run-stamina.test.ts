import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { Kind } from '../src/sim/combat';
import { cloneHero, createHero, hashHero, heroRunning } from '../src/sim/hero';
import { armourRunPenalty, calculateBlockChance, heroSpeedPct, staminaMax } from '../src/sim/mechanics';
import { Sim } from '../src/sim/sim';

function field(w: number, h: number): GameMap {
  return { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h).fill(200) };
}
function mk(): Sim {
  const sim = new Sim(field(120, 20), 3, [0, 1], { kinds: [Kind.Hero, Kind.Gnoll], combat: true, hpMul: 100 });
  sim.place(0, 3, 5);
  sim.place(1, 110, 15);
  createHero(sim, 0, 0, false, 1);
  return sim;
}
function dist(run: boolean, ticks: number): { d: number; sim: Sim } {
  const sim = mk();
  if (run) sim.step([{ type: 'hero', op: 'run', on: true }]);
  sim.step([{ type: 'move', ids: [0], x: 100, y: 5, loose: false }]);
  const x0 = sim.x[0];
  for (let i = 0; i < ticks; i++) sim.step([]);
  return { d: sim.x[0] - x0, sim };
}

describe('run and stamina', () => {
  it('running is faster than walking and drains stamina', () => {
    const w = dist(false, 40);
    const r = dist(true, 40);
    expect(r.d).toBeGreaterThan(w.d * 1.3);
    expect(r.sim.hero!.stamina!).toBeLessThan(staminaMax(r.sim.hero!.attr[0]));
    expect(heroRunning(r.sim)).toBe(true);
  });
  it('falls back to walking when stamina runs out and refuses an early rerun', () => {
    const sim = mk();
    sim.step([{ type: 'hero', op: 'run', on: true }]);
    sim.step([{ type: 'move', ids: [0], x: 110, y: 5, loose: false }]);
    for (let i = 0; i < 400 && sim.hero!.running; i++) sim.step([]);
    expect(sim.hero!.running).toBeFalsy();
    expect(sim.hero!.stamina).toBe(0);
    sim.step([{ type: 'hero', op: 'run', on: true }]);
    expect(sim.hero!.running).toBeFalsy();
  });
  it('armour weight slows running; block is a third while running', () => {
    expect(armourRunPenalty(1)).toBe(0);
    expect(armourRunPenalty(3)).toBe(-5);
    expect(armourRunPenalty(5)).toBe(-10);
    expect(heroSpeedPct(true, 5)).toBe(140);
    expect(heroSpeedPct(false, 5)).toBe(100);
    expect(calculateBlockChance(40, 0, 45, 5, true)).toBe(Math.floor(calculateBlockChance(40, 0, 45, 5) / 3));
  });
  it('is deterministic and hashes only when non-default', () => {
    const a = dist(true, 30);
    const b = dist(true, 30);
    expect(a.sim.hash()).toBe(b.sim.hash());
    const base = mk();
    const v: number[] = [];
    hashHero(base.hero, (x) => v.push(x));
    const h2 = cloneHero(base.hero)!;
    const v2: number[] = [];
    hashHero(h2, (x) => v2.push(x));
    expect(v2).toEqual(v);
    h2.running = true;
    const v3: number[] = [];
    hashHero(h2, (x) => v3.push(x));
    expect(v3.length).toBe(v.length + 1);
  });
});
