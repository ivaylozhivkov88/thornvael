import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { MonsterAi } from '../src/sim/bot';
import { Kind, Ord } from '../src/sim/combat';
import { FP, Sim, type Command } from '../src/sim/sim';

function flatField(w = 50, h = 50): GameMap {
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

function arena(at: [number, number, number, number][], seed = 1): Sim {
  const sim = new Sim(flatField(), seed, at.map((a) => a[0]), { kinds: at.map((a) => a[1]), combat: true });
  at.forEach((a, i) => sim.place(i, a[2], a[3]));
  return sim;
}

describe('Combat AI Leashing & Fleeing Controls (Classic ARPG Standard)', () => {
  it('fleeing unit suffers 25% movement speed penalty compared to normal movement', () => {
    // Place two identical warriors: unit 0 moving normally, unit 1 retreating
    const sim = arena([[0, Kind.Warrior, 10, 10], [0, Kind.Warrior, 10, 20]]);

    sim.step([{ type: 'move', ids: [0], x: 30, y: 10 }]);
    sim.step([{ type: 'order', order: 'retreat', ids: [1], x: 30, y: 20 }]);

    expect(sim.cb.ord[1]).toBe(Ord.Retreat);

    // Step 20 ticks
    for (let t = 0; t < 20; t++) sim.step();

    const distMovedNormal = (sim.x[0] / FP) - 10;
    const distMovedFlee = (sim.x[1] / FP) - 10;

    // Flee speed should be approximately 75% of normal speed
    expect(distMovedFlee).toBeLessThan(distMovedNormal);
    const speedRatio = distMovedFlee / distMovedNormal;
    expect(speedRatio).toBeGreaterThan(0.70);
    expect(speedRatio).toBeLessThan(0.78);
  });

  it('strict flee duration cap: retreat forcibly ends after 45 ticks (1.8s) and unit turns to guard', () => {
    const sim = arena([[1, Kind.Warrior, 10, 10]]);

    sim.step([{ type: 'order', order: 'retreat', ids: [0], x: 45, y: 10 }]);
    expect(sim.cb.ord[0]).toBe(Ord.Retreat);

    // Step 44 ticks: still retreating
    for (let t = 0; t < 44; t++) sim.step();
    expect(sim.cb.ord[0]).toBe(Ord.Retreat);

    // Step to tick 46: retreat cap triggers, stops unit and returns to Guard
    for (let t = 0; t < 2; t++) sim.step();
    expect(sim.cb.ord[0]).toBe(Ord.Guard);
    expect(sim.moving[0]).toBe(0);
  });

  it('ranged kiter backsteps once then stands ground during 5.4s cooldown', () => {
    // Team 0 has a warrior closing in, Team 1 has an archer kiter
    const sim = arena([[0, Kind.Warrior, 15, 15], [1, Kind.Archer, 17, 15]]);

    const pack = { ids: [1], x: 17, y: 15, hunting: true, calm: 0 };
    const ai = new MonsterAi([pack]);

    // Tick 3: AI evaluates and orders kiter retreat
    while (sim.tick < 3) sim.step();
    const cmds1 = ai.commands(sim);
    expect(cmds1.some((c) => c.type === 'order' && c.order === 'retreat')).toBe(true);
    sim.step(cmds1);

    // Advance 10 ticks: target is still close (< 3.2 tiles)
    while (sim.tick < 13) sim.step();
    // Simulate player closing in
    sim.place(0, sim.x[1] / FP - 2.0, sim.y[1] / FP);
    const cmds2 = ai.commands(sim);

    // While on cooldown, archer MUST NOT retreat again; archer must attack!
    expect(cmds2.some((c) => c.type === 'order' && c.order === 'retreat')).toBe(false);
    expect(cmds2.some((c) => c.type === 'order' && c.order === 'attack')).toBe(true);
  });

  it('pack leash: breaks pursuit when dragged more than 14 tiles away from post', () => {
    const sim = arena([[0, Kind.Warrior, 36, 20], [1, Kind.Gnoll, 35, 20]]);
    // Pack post is at (20, 20)
    const pack = { ids: [1], x: 20, y: 20, hunting: true, calm: 0 };
    const ai = new MonsterAi([pack]);

    while (sim.tick < 3) sim.step();
    const cmds = ai.commands(sim);

    // Pack should break pursuit, return to guard at post (20, 20)
    expect(pack.hunting).toBe(false);
    expect(cmds.some((c) => c.type === 'order' && c.order === 'guard' && c.x === 20 && c.y === 20)).toBe(true);
  });
});
