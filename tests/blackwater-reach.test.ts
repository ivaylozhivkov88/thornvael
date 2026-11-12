import { describe, expect, it } from 'vitest';
import { loadDoc, validate } from '../src/mapdoc';
import { createMission } from '../src/mission';
import doc from '../src/missions/blackwater-reach.map.json';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { FP, type Sim } from '../src/sim/sim';
import { Role } from '../src/sim/town';

function startBlackwater(seed = 1) {
  const loaded = loadDoc(doc);
  const game = createMission(loaded, seed);
  createHero(game.sim, 0, 0, false, 1);
  return game;
}

function walk(sim: Sim, x: number, y: number, maxTicks = 1600): void {
  sim.step([{ type: 'move', ids: [0], x: x + 0.5, y: y + 0.5 }]);
  for (let tick = 0; tick < maxTicks; tick++) {
    if (Math.floor(sim.x[0] / FP) === x && Math.floor(sim.y[0] / FP) === y) return;
    sim.step();
  }
  throw new Error(`Hero could not walk to ${x}, ${y}`);
}

describe('Blackwater Reach (S04)', () => {
  it('validates 64x64 river crossings and exposes two towns with taverns and shops', () => {
    const { loaded, sim } = startBlackwater();
    expect(validate(loaded.doc)).toEqual([]);
    expect(loaded.doc.w).toBe(64);
    expect(loaded.doc.h).toBe(64);
    expect(loaded.doc.units[0].kind).toBe(Kind.Hero);
    expect(loaded.doc.units.length).toBeLessThanOrEqual(300);
    expect(sim.towns.length).toBe(2);

    // Visit Reedford (town 0) tavern, shop, and school
    for (const role of [Role.Tavern, Role.Shop, Role.School]) {
      const door = sim.towns[0].door[role];
      expect(door).not.toBeNull();
      walk(sim, door![0], door![1]);
      sim.now({ type: 'town', op: 'enter', town: 0, v: role });
      expect(sim.town.inside).toBe(role);
      sim.now({ type: 'town', op: 'leave', town: 0 });
    }

    // Clear enemy guards on the southern causeway & riverbank so hero can cross cleanly to Millwatch (town 1)
    for (const g of [3, 5]) {
      for (const u of loaded.def.groups[g] ?? []) sim.cb.hp[u] = 0;
    }
    sim.cb.recount(sim.team);
    for (const role of [Role.Tavern, Role.Shop]) {
      const door = sim.towns[1].door[role];
      expect(door).not.toBeNull();
      walk(sim, door![0], door![1]);
      sim.now({ type: 'town', op: 'enter', town: 1, v: role });
      expect(sim.town.inside).toBe(3 + role);
      sim.now({ type: 'town', op: 'leave', town: 1 });
    }
  });

  it('completes bridge/causeway objectives, defeats VIP stone guardian, drops gold, and wins', () => {
    const { loaded, sim } = startBlackwater(11);
    for (let t = 0; t < 10; t++) sim.step();
    const st = sim.script!.st;
    expect(st.sub[0]).toBe(1);
    expect(st.sub[1]).toBe(1);
    expect(st.sub[2]).toBe(1);
    expect(st.msgs).toContain(1);
    expect(st.patrols.length).toBe(1);

    // Clear Northern Bridge toll-watch (group 2)
    for (const u of loaded.def.groups[2] ?? []) sim.cb.hp[u] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[0]).toBe(2);
    expect(st.msgs).toContain(2);

    // Clear Southern Causeway raiders (group 3) -> drops 600 gold
    for (const u of loaded.def.groups[3] ?? []) sim.cb.hp[u] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[1]).toBe(2);
    expect(st.msgs).toContain(3);
    expect(sim.cb.sG.some((g) => g >= 600)).toBe(true);

    // Defeat Eastern Headland VIP stone guardian -> drops 800 gold and triggers win
    const vip = loaded.def.vip[0];
    expect(sim.cb.kind[vip]).toBe(Kind.Golem);
    sim.cb.hp[vip] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[2]).toBe(2);
    expect(st.msgs).toContain(4);
    expect(sim.cb.sG.some((g) => g >= 800)).toBe(true);
    expect(st.status).toBe(1);
  });

  it('loses on hero death and preserves deterministic state hash', () => {
    const a = startBlackwater(33);
    const b = startBlackwater(33);
    for (let t = 0; t < 40; t++) {
      const cmds = t === 5 ? [{ type: 'move' as const, ids: [0], x: 16.5, y: 15.5 }] : undefined;
      a.sim.step(cmds);
      b.sim.step(cmds);
    }
    expect(a.sim.hash()).toBe(b.sim.hash());

    a.sim.cb.hp[0] = 0;
    a.sim.cb.recount(a.sim.team);
    for (let t = 0; t < 10; t++) a.sim.step();
    expect(a.sim.script!.st.status).toBe(2);
    expect(a.sim.script!.st.cause).toBe(1);
  });
});
