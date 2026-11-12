import { describe, expect, it } from 'vitest';
import { validate } from '../src/mapdoc';
import { createMission, missionFromName } from '../src/mission';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { FP, type Sim } from '../src/sim/sim';
import { Role } from '../src/sim/town';

function startGlade(seed = 1) {
  const game = createMission(missionFromName('glade'), seed);
  createHero(game.sim, 0, 0, false, 1);
  return game;
}

function walk(sim: Sim, x: number, y: number): void {
  sim.step([{ type: 'move', ids: [0], x: x + 0.5, y: y + 0.5 }]);
  for (let tick = 0; tick < 800; tick++) {
    if (Math.floor(sim.x[0] / FP) === x && Math.floor(sim.y[0] / FP) === y) return;
    sim.step();
  }
  throw new Error(`Hero could not walk to ${x}, ${y}`);
}

describe('Bracken Glade (T01)', () => {
  it('validates and exposes tavern, shop, mercenaries and NPC', () => {
    const { loaded, sim } = startGlade();
    expect(validate(loaded.doc)).toEqual([]);
    expect(loaded.doc.w).toBe(64);
    expect(loaded.doc.h).toBe(64);
    expect(sim.towns.length).toBe(1);
    expect(sim.towns[0].door[Role.Tavern]).not.toBeNull();
    expect(sim.towns[0].door[Role.Shop]).not.toBeNull();
    expect(sim.towns[0].def.mercs?.length).toBe(3);

    for (const role of [Role.Tavern, Role.Shop]) {
      const [dx, dy] = sim.towns[0].door[role]!;
      walk(sim, dx, dy);
      sim.now({ type: 'town', op: 'enter', town: 0, v: role });
      expect(sim.town.inside).toBe(role);
      sim.now({ type: 'town', op: 'leave', town: 0 });
    }
  });

  it('triggers boss lure, drops heavy satchel on boss death, and wins when raiders are cleared', () => {
    const { loaded, sim } = startGlade(7);
    for (let t = 0; t < 10; t++) sim.step();
    const st = sim.script!.st;
    expect(st.sub[0]).toBe(1);
    expect(st.sub[1]).toBe(1);
    expect(st.msgs).toContain(1);

    // Walk near the southern pine glade trigger box
    walk(sim, 34, 42);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.msgs).toContain(2);

    // Defeat boss (unit 22 in bracken-glade.map.json, VIP golem)
    const boss = loaded.def.vip[0];
    expect(sim.cb.kind[boss]).toBe(Kind.Golem);
    sim.cb.hp[boss] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[0]).toBe(2);
    expect(st.msgs).toContain(3);
    expect(sim.cb.sG.some((g) => g >= 350)).toBe(true);

    // Clear all raider groups (3, 4, 5)
    for (const g of [3, 4, 5]) {
      for (const u of loaded.def.groups[g] ?? []) sim.cb.hp[u] = 0;
    }
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('loses when hero dies and keeps deterministic state hash', () => {
    const a = startGlade(42);
    const b = startGlade(42);
    for (let t = 0; t < 30; t++) {
      a.sim.step(t === 5 ? [{ type: 'move', ids: [0], x: 34.5, y: 35.5 }] : undefined);
      b.sim.step(t === 5 ? [{ type: 'move', ids: [0], x: 34.5, y: 35.5 }] : undefined);
    }
    expect(a.sim.hash()).toBe(b.sim.hash());

    a.sim.cb.hp[0] = 0;
    a.sim.cb.recount(a.sim.team);
    for (let t = 0; t < 10; t++) a.sim.step();
    expect(a.sim.script!.st.status).toBe(2);
    expect(a.sim.script!.st.cause).toBe(1);
  });
});
