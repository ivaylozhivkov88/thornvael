import { describe, expect, it } from 'vitest';
import { validate } from '../src/mapdoc';
import { BUILT_IN, createMission, missionFromName } from '../src/mission';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { FP, type Sim } from '../src/sim/sim';
import { Role } from '../src/sim/town';

const key = 'kids-paradise-opening';

function opening() {
  const game = createMission(missionFromName(key));
  createHero(game.sim, 0, 0, false, 1);
  return game;
}

function walk(sim: Sim, x: number, y: number): void {
  sim.step([{ type: 'move', ids: [0], x: x + 0.5, y: y + 0.5 }]);
  for (let tick = 0; tick < 750; tick++) {
    if (Math.floor(sim.x[0] / FP) === x && Math.floor(sim.y[0] / FP) === y) return;
    sim.step();
  }
  throw new Error(`Hero could not walk to ${x}, ${y}`);
}

describe('internal opening slice', () => {
  it('validates, starts active, and lets the hero walk into both shops and reach the trail exit', () => {
    const { loaded, sim } = opening();
    expect(BUILT_IN).not.toHaveProperty(key);
    expect(validate(loaded.doc)).toEqual([]);
    expect(sim.cb.kind[0]).toBe(Kind.Hero);
    expect(sim.team[0]).toBe(0);
    const script = sim.script!.st;
    for (let tick = 0; tick < 10; tick++) sim.step();
    expect(script.status).toBe(0);
    expect(script.sub[0]).toBe(1);

    for (const role of [Role.Shop, Role.Tavern]) {
      const [x, y] = sim.towns[0].door[role]!;
      expect(sim.map.blocked[y * sim.map.w + x]).toBe(0);
      walk(sim, x, y);
      sim.now({ type: 'town', op: 'enter', town: 0, v: role });
      expect(sim.town.inside).toBe(role);
      sim.now({ type: 'town', op: 'leave', town: 0 });
    }
    expect(script.status).toBe(0);
    const [{ x1, y1 }] = loaded.doc.regions;
    walk(sim, x1, y1);
    for (let tick = 0; tick < 10; tick++) sim.step();
    expect(script.status).toBe(1);
    expect(script.sub[0]).toBe(2);
  });

  it('loses when the hero dies', () => {
    const { sim } = opening();
    sim.cb.hp[0] = 0;
    sim.cb.recount(sim.team);
    for (let tick = 0; tick < 10; tick++) sim.step();
    expect(sim.script!.st.status).toBe(2);
    expect(sim.script!.st.cause).toBe(1);
  });
});
