import { describe, expect, it } from 'vitest';
import { Terrain } from '../src/map';
import { loadDoc, validate } from '../src/mapdoc';
import { createMission } from '../src/mission';
import rawMuddlefen from '../src/missions/muddlefen.map.json';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { regionsOf } from '../src/sim/path';
import { FP, type Sim } from '../src/sim/sim';
import { Role } from '../src/sim/town';

function startMuddlefen(seed = 1) {
  const loaded = loadDoc(rawMuddlefen);
  const game = createMission(loaded, seed);
  createHero(game.sim, 0, 0, false, 1);
  return game;
}

function walk(sim: Sim, x: number, y: number, maxTicks = 1400): void {
  sim.step([{ type: 'move', ids: [0], x: x + 0.5, y: y + 0.5 }]);
  for (let tick = 0; tick < maxTicks; tick++) {
    if (Math.floor(sim.x[0] / FP) === x && Math.floor(sim.y[0] / FP) === y) return;
    sim.step();
  }
  throw new Error(`Hero could not walk to ${x}, ${y}`);
}

describe('Muddlefen (S09)', () => {
  it('validates 96x96 marsh corridors, dry islands, and town doors', () => {
    const { loaded, sim } = startMuddlefen();
    expect(validate(loaded.doc)).toEqual([]);
    expect(loaded.doc.w).toBe(96);
    expect(loaded.doc.h).toBe(96);
    expect(loaded.scenario.kinds[0]).toBe(Kind.Hero);
    expect(loaded.map.terrain.includes(Terrain.Marsh)).toBe(true);
    expect(sim.towns.length).toBe(2);

    const reg = regionsOf(loaded.map);
    const heroReg = reg[loaded.scenario.tiles[0][1] * loaded.map.w + loaded.scenario.tiles[0][0]];
    expect(heroReg).toBeGreaterThanOrEqual(0);

    for (const town of sim.towns) {
      expect(town.door[Role.Tavern]).not.toBeNull();
      expect(town.door[Role.Shop]).not.toBeNull();
      for (const role of [Role.Tavern, Role.Shop] as const) {
        const [dx, dy] = town.door[role]!;
        expect(reg[dy * loaded.map.w + dx]).toBe(heroReg);
      }
    }

    for (const role of [Role.Tavern, Role.Shop] as const) {
      const [dx, dy] = sim.towns[0].door[role]!;
      walk(sim, dx, dy);
      sim.now({ type: 'town', op: 'enter', town: 0, v: role });
      expect(sim.town.inside).toBe(role);
      sim.now({ type: 'town', op: 'leave', town: 0 });
      expect(sim.town.inside).toBe(-1);
    }
  });

  it('triggers ambush detour, mire clear bounty, VIP defeat, and victory', () => {
    const { loaded, sim } = startMuddlefen(9);
    for (let t = 0; t < 10; t++) sim.step();
    const st = sim.script!.st;
    expect(st.sub[0]).toBe(1);
    expect(st.sub[1]).toBe(1);
    expect(st.msgs).toContain(1);

    // Walk along the southern marsh trail into the ambush detour island (38..58, 60..76)
    walk(sim, 39, 74, 1500);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.msgs).toContain(2);

    // Clear marshland corridor and ambush groups (groups 2, 3, 4)
    for (const g of [2, 3, 4]) {
      for (const u of loaded.def.groups[g] ?? []) sim.cb.hp[u] = 0;
    }
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[0]).toBe(2);
    expect(st.msgs).toContain(3);
    expect(sim.cb.sG.some((g) => g >= 450)).toBe(true);

    // Defeat Mirestone Hulk (VIP Golem)
    const vip = loaded.def.vip[0];
    expect(sim.cb.kind[vip]).toBe(Kind.Golem);
    sim.cb.hp[vip] = 0;
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[1]).toBe(2);
    expect(st.msgs).toContain(4);
    expect(st.status).toBe(1);
  });

  it('loses on hero death and preserves deterministic state hash', () => {
    const a = startMuddlefen(42);
    const b = startMuddlefen(42);
    for (let t = 0; t < 30; t++) {
      const cmd = t === 5 ? [{ type: 'move' as const, ids: [0], x: 16.5, y: 78.5 }] : undefined;
      a.sim.step(cmd);
      b.sim.step(cmd);
    }
    expect(a.sim.hash()).toBe(b.sim.hash());

    a.sim.cb.hp[0] = 0;
    a.sim.cb.recount(a.sim.team);
    for (let t = 0; t < 10; t++) a.sim.step();
    expect(a.sim.script!.st.status).toBe(2);
    expect(a.sim.script!.st.cause).toBe(1);
  });
});
