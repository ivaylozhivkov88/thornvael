import { describe, expect, it } from 'vitest';
import { loadDoc, validate } from '../src/mapdoc';
import { createMission } from '../src/mission';
import rawAshenTier from '../src/missions/ashen-tier.map.json';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { regionsOf } from '../src/sim/path';
import { FP, type Sim } from '../src/sim/sim';
import { Role } from '../src/sim/town';

function startAshenTier(seed = 1) {
  const loaded = loadDoc(rawAshenTier);
  const game = createMission(loaded, seed);
  createHero(game.sim, 0, 0, false, 1);
  return game;
}

function walk(sim: Sim, x: number, y: number, maxTicks = 2200): void {
  sim.step([{ type: 'move', ids: [0], x: x + 0.5, y: y + 0.5 }]);
  for (let tick = 0; tick < maxTicks; tick++) {
    if (Math.floor(sim.x[0] / FP) === x && Math.floor(sim.y[0] / FP) === y) return;
    sim.step();
  }
  throw new Error(`Hero could not walk to ${x}, ${y}`);
}

describe('Ashen Tier (S11)', () => {
  it('validates 128x128 tiered plateaus, three towns, and door access', () => {
    const { loaded, sim } = startAshenTier();
    expect(validate(loaded.doc)).toEqual([]);
    expect(loaded.doc.w).toBe(128);
    expect(loaded.doc.h).toBe(128);
    expect(loaded.scenario.kinds[0]).toBe(Kind.Hero);
    expect(sim.towns.length).toBe(3);

    const reg = regionsOf(loaded.map);
    const heroReg = reg[loaded.scenario.tiles[0][1] * loaded.map.w + loaded.scenario.tiles[0][0]];
    expect(heroReg).toBeGreaterThanOrEqual(0);

    for (const town of sim.towns) {
      expect(town.door[Role.Tavern]).not.toBeNull();
      expect(town.door[Role.Shop]).not.toBeNull();
      for (const role of [Role.Tavern, Role.Shop, Role.School] as const) {
        const door = town.door[role];
        if (!door) continue;
        expect(reg[door[1] * loaded.map.w + door[0]]).toBe(heroReg);
      }
    }
    expect(sim.towns[1].door[Role.School]).not.toBeNull();

    for (const role of [Role.Tavern, Role.Shop] as const) {
      const [dx, dy] = sim.towns[0].door[role]!;
      walk(sim, dx, dy);
      sim.now({ type: 'town', op: 'enter', town: 0, v: role });
      expect(sim.town.inside).toBe(role);
      sim.now({ type: 'town', op: 'leave', town: 0 });
      expect(sim.town.inside).toBe(-1);
    }
  });

  it('triggers plateau assault, pass-clear bounty, VIP colossus defeat, and victory', () => {
    const { loaded, sim } = startAshenTier(11);
    for (let t = 0; t < 10; t++) sim.step();
    const st = sim.script!.st;
    expect(st.sub[0]).toBe(1);
    expect(st.sub[1]).toBe(1);
    expect(st.msgs).toContain(1);

    // Clear the three highland pass guards (groups 2, 3, 4) -> passes-secured + 800 gold
    for (const g of [2, 3, 4]) {
      for (const u of loaded.def.groups[g] ?? []) sim.cb.hp[u] = 0;
    }
    sim.cb.recount(sim.team);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.sub[0]).toBe(2);
    expect(st.msgs).toContain(3);
    expect(sim.cb.sG.some((g) => g >= 800)).toBe(true);

    // Ascend the central ramp onto the Upper Ashen Plateau trigger box (30..104, 12..38)
    walk(sim, 63, 37, 2400);
    for (let t = 0; t < 10; t++) sim.step();
    expect(st.msgs).toContain(2);

    // Defeat Ashen Colossus (VIP Golem) -> win
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
    const a = startAshenTier(42);
    const b = startAshenTier(42);
    for (let t = 0; t < 30; t++) {
      const cmd = t === 5 ? [{ type: 'move' as const, ids: [0], x: 20.5, y: 106.5 }] : undefined;
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
