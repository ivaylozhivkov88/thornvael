import { describe, expect, it } from 'vitest';
import { loadDoc, validate } from '../src/mapdoc';
import { createMission } from '../src/mission';
import doc from '../src/missions/shattered-shore.map.json';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { FP, type Sim } from '../src/sim/sim';
import { Role } from '../src/sim/town';

function startShore(seed = 1) {
  const loaded = loadDoc(doc);
  const game = createMission(loaded, seed);
  createHero(game.sim, 0, 0, false, 1);
  return game;
}

function walk(sim: Sim, x: number, y: number, maxTicks = 2400): void {
  sim.step([{ type: 'move', ids: [0], x: x + 0.5, y: y + 0.5 }]);
  for (let tick = 0; tick < maxTicks; tick++) {
    if (Math.floor(sim.x[0] / FP) === x && Math.floor(sim.y[0] / FP) === y) return;
    sim.step();
  }
  throw new Error(`Hero could not walk to ${x}, ${y}`);
}

describe('Shattered Shore (S06)', () => {
  it('validates 96x96 coastal bays and exposes three harbor towns across causeways', () => {
    const { loaded, sim } = startShore();
    expect(validate(loaded.doc)).toEqual([]);
    expect(loaded.doc.w).toBe(96);
    expect(loaded.doc.h).toBe(96);
    expect(loaded.doc.units[0].kind).toBe(Kind.Hero);
    expect(loaded.doc.units.length).toBeLessThanOrEqual(300);
    expect(sim.towns.length).toBe(3);

    // Visit Saltwind Quay (town 0) tavern, shop, school
    for (const role of [Role.Tavern, Role.Shop, Role.School]) {
      const door = sim.towns[0].door[role];
      expect(door).not.toBeNull();
      walk(sim, door![0], door![1]);
      sim.now({ type: 'town', op: 'enter', town: 0, v: role });
      expect(sim.town.inside).toBe(role);
      sim.now({ type: 'town', op: 'leave', town: 0 });
    }

    // Clear causeway raiders & patrol so hero crosses causeways to Driftwood Haven (town 1) and Beacon Point (town 2)
    for (const g of [2, 5]) {
      for (const u of loaded.def.groups[g] ?? []) sim.cb.hp[u] = 0;
    }
    sim.cb.recount(sim.team);

    for (const townIdx of [1, 2]) {
      for (const role of [Role.Tavern, Role.Shop]) {
        const door = sim.towns[townIdx].door[role];
        expect(door).not.toBeNull();
        walk(sim, door![0], door![1]);
        sim.now({ type: 'town', op: 'enter', town: townIdx, v: role });
        expect(sim.town.inside).toBe(townIdx * 3 + role);
        sim.now({ type: 'town', op: 'leave', town: townIdx });
      }
    }
  });

  it('completes causeway and wharf objectives, defeats VIP warden, and wins', () => {
    const { loaded, sim } = startShore(15);
    for (let t = 0; t < 10; t++) sim.step();
    const st = sim.script!.st;
    expect(st.sub[0]).toBe(1);
    expect(st.sub[1]).toBe(1);
    expect(st.sub[2]).toBe(1);
    expect(st.msgs).toContain(1);
    expect(st.patrols.length).toBe(1);

    // Clear Southern Causeway raiders (group 2)
    for (const u of loaded.def.groups[2] ?? []) sim.cb.hp[u] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[0]).toBe(2);
    expect(st.msgs).toContain(2);

    // Purge Sunken Wharf plunderers (group 3) -> drops 900 gold
    for (const u of loaded.def.groups[3] ?? []) sim.cb.hp[u] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[1]).toBe(2);
    expect(st.msgs).toContain(3);
    expect(sim.cb.sG.some((g) => g >= 900)).toBe(true);

    // Defeat Tide-Forged Warden (VIP golem) -> drops 1200 gold and wins
    const vip = loaded.def.vip[0];
    expect(sim.cb.kind[vip]).toBe(Kind.Golem);
    sim.cb.hp[vip] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[2]).toBe(2);
    expect(st.msgs).toContain(4);
    expect(sim.cb.sG.some((g) => g >= 1200)).toBe(true);
    expect(st.status).toBe(1);
  });

  it('loses on hero death and preserves deterministic state hash', () => {
    const a = startShore(27);
    const b = startShore(27);
    for (let t = 0; t < 40; t++) {
      const cmds = t === 5 ? [{ type: 'move' as const, ids: [0], x: 22.5, y: 77.5 }] : undefined;
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
