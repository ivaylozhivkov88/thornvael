import { describe, expect, it } from 'vitest';
import { validate } from '../src/mapdoc';
import { createMission, missionFromName } from '../src/mission';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { Role } from '../src/sim/town';

function startTidebreak(seed = 1) {
  const game = createMission(missionFromName('tidebreak'), seed);
  createHero(game.sim, 0, 0, false, 1);
  return game;
}

describe('Tidebreak Cove (T03)', () => {
  it('validates 128x128 coast and exposes three harbor towns', () => {
    const { loaded, sim } = startTidebreak();
    expect(validate(loaded.doc)).toEqual([]);
    expect(loaded.doc.w).toBe(128);
    expect(loaded.doc.h).toBe(128);
    expect(sim.towns.length).toBe(3);
    for (const town of sim.towns) {
      expect(town.door[Role.Tavern]).not.toBeNull();
      expect(town.door[Role.Shop]).not.toBeNull();
    }
  });

  it('triggers drop-cache gold, warden defeat and victory', () => {
    const { loaded, sim } = startTidebreak(9);
    for (let t = 0; t < 10; t++) sim.step();
    const st = sim.script!.st;
    expect(st.sub[0]).toBe(1);
    expect(st.sub[1]).toBe(1);

    // Clear drop-cache group (group 3)
    for (const u of loaded.def.groups[3] ?? []) sim.cb.hp[u] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.msgs).toContain(3);
    expect(sim.cb.sG.some((g) => g >= 500)).toBe(true);

    // Clear swarm and beach patrol (groups 2 and 4)
    for (const g of [2, 4]) {
      for (const u of loaded.def.groups[g] ?? []) sim.cb.hp[u] = 0;
    }
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[0]).toBe(2);

    // Defeat Stone Warden (VIP golem)
    const warden = loaded.def.vip[0];
    expect(sim.cb.kind[warden]).toBe(Kind.Golem);
    sim.cb.hp[warden] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[1]).toBe(2);
    expect(st.msgs).toContain(4);
    expect(st.status).toBe(1);
  });

  it('loses on hero death', () => {
    const { sim } = startTidebreak();
    sim.cb.hp[0] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(sim.script!.st.status).toBe(2);
    expect(sim.script!.st.cause).toBe(1);
  });
});
