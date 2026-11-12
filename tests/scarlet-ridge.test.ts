import { describe, expect, it } from 'vitest';
import { validate } from '../src/mapdoc';
import { createMission, missionFromName } from '../src/mission';
import { createHero } from '../src/sim/hero';
import { Role } from '../src/sim/town';

function startScarlet(seed = 1) {
  const game = createMission(missionFromName('scarlet'), seed);
  createHero(game.sim, 0, 0, false, 1);
  return game;
}

describe('Scarlet Ridge (T02)', () => {
  it('validates and exposes three towns with taverns and shops', () => {
    const { loaded, sim } = startScarlet();
    expect(validate(loaded.doc)).toEqual([]);
    expect(loaded.doc.w).toBe(64);
    expect(loaded.doc.h).toBe(64);
    expect(sim.towns.length).toBe(3);
    for (const town of sim.towns) {
      expect(town.door[Role.Tavern]).not.toBeNull();
      expect(town.door[Role.Shop]).not.toBeNull();
    }
  });

  it('drops 1000 gold purse on eastern stash defeat and wins when objectives are met', () => {
    const { loaded, sim } = startScarlet(5);
    for (let t = 0; t < 10; t++) sim.step();
    const st = sim.script!.st;
    expect(st.sub[0]).toBe(1);
    expect(st.sub[1]).toBe(1);

    // Clear dry passage (group 2)
    for (const u of loaded.def.groups[2] ?? []) sim.cb.hp[u] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[0]).toBe(2);
    expect(st.msgs).toContain(2);

    // Clear eastern edge stash raiders (group 4)
    for (const u of loaded.def.groups[4] ?? []) sim.cb.hp[u] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[1]).toBe(2);
    expect(st.msgs).toContain(3);
    expect(sim.cb.sG.some((g) => g >= 1000)).toBe(true);

    // Clear northern plateau warband (group 3) -> win
    for (const u of loaded.def.groups[3] ?? []) sim.cb.hp[u] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.status).toBe(1);
  });

  it('loses on hero death', () => {
    const { sim } = startScarlet();
    sim.cb.hp[0] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(sim.script!.st.status).toBe(2);
    expect(sim.script!.st.cause).toBe(1);
  });
});
