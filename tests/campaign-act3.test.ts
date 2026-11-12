import { describe, expect, it } from 'vitest';
import { loadDoc, migrate, validate } from '../src/mapdoc';
import { createMission, type MissionGame } from '../src/mission';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { itemId } from '../src/sim/items';
import { regionsOf } from '../src/sim/path';
import { FP, type Sim } from '../src/sim/sim';
import { Role } from '../src/sim/town';

import m24 from '../src/missions/m24-pledge-at-oakhaven.map.json';
import m25 from '../src/missions/m25-cinder-wards.map.json';
import m26 from '../src/missions/m26-sundered-ranks.map.json';
import m27 from '../src/missions/m27-field-infirmary.map.json';
import m28 from '../src/missions/m28-sunken-citadel.map.json';
import m29 from '../src/missions/m29-hourglass-rescue.map.json';
import m30 from '../src/missions/m30-starved-bastion.map.json';
import m31 from '../src/missions/m31-riverlock-crossing.map.json';
import m32 from '../src/missions/m32-elder-juggernaut.map.json';
import m33 from '../src/missions/m33-high-stakes-gambit.map.json';
import m34 from '../src/missions/m34-clashing-banners.map.json';
import m35 from '../src/missions/m35-burning-harbor.map.json';

const ACT3_MAPS: { id: string; raw: unknown; size: number }[] = [
  { id: 'm24-pledge-at-oakhaven', raw: m24, size: 64 },
  { id: 'm25-cinder-wards', raw: m25, size: 64 },
  { id: 'm26-sundered-ranks', raw: m26, size: 64 },
  { id: 'm27-field-infirmary', raw: m27, size: 64 },
  { id: 'm28-sunken-citadel', raw: m28, size: 96 },
  { id: 'm29-hourglass-rescue', raw: m29, size: 64 },
  { id: 'm30-starved-bastion', raw: m30, size: 64 },
  { id: 'm31-riverlock-crossing', raw: m31, size: 64 },
  { id: 'm32-elder-juggernaut', raw: m32, size: 64 },
  { id: 'm33-high-stakes-gambit', raw: m33, size: 64 },
  { id: 'm34-clashing-banners', raw: m34, size: 64 },
  { id: 'm35-burning-harbor', raw: m35, size: 96 },
];

function start(raw: unknown, seed = 1): MissionGame {
  const loaded = loadDoc(raw);
  const g = createMission(loaded, seed);
  createHero(g.sim, 0, 0, false, 1);
  return g;
}

function step(g: MissionGame, ticks: number): void {
  for (let t = 0; t < ticks; t++) g.sim.step(g.ai.commands(g.sim));
}

function killUnits(sim: Sim, ids: number[]): void {
  for (const u of ids) sim.cb.hp[u] = 0;
  sim.cb.recount(sim.team);
}

function killGroups(g: MissionGame, groups: number[]): void {
  for (const grp of groups) killUnits(g.sim, g.loaded.def.groups[grp] ?? []);
}

function walk(sim: Sim, x: number, y: number, maxTicks = 2400): void {
  sim.step([{ type: 'move', ids: [0], x: x + 0.5, y: y + 0.5 }]);
  for (let t = 0; t < maxTicks; t++) {
    if (Math.floor(sim.x[0] / FP) === x && Math.floor(sim.y[0] / FP) === y) return;
    sim.step();
  }
  throw new Error(`Hero could not walk to (${x}, ${y})`);
}

const dormantCarryoverCount = (g: MissionGame): number => {
  const forHire = new Set(g.sim.towns.flatMap((t) => (t.def.mercs ?? []).map((m) => m.unit)));
  let count = 0;
  for (let u = 1; u < g.sim.count; u++) {
    if (g.sim.team[u] === 0 && g.sim.hidden[u] === 1 && !forHire.has(u)) count++;
  }
  return count;
};

describe('Campaign Act III maps (m24-m35)', () => {
  it('validates all 12 maps, text keys, unit limits, and >=18 dormant carryover slots', () => {
    for (const entry of ACT3_MAPS) {
      const doc = migrate(entry.raw);
      expect(validate(doc), entry.id).toEqual([]);
      expect(doc.w, entry.id).toBe(entry.size);
      expect(doc.h, entry.id).toBe(entry.size);
      expect(doc.units[0].kind, entry.id).toBe(Kind.Hero);
      expect(doc.units[0].team, entry.id).toBe(0);
      expect(doc.units.length, entry.id).toBeLessThanOrEqual(300);

      expect(doc.text.title, `${entry.id} title`).toBeTruthy();
      expect(doc.text.body, `${entry.id} body`).toBeTruthy();
      expect(doc.text['obj.0'], `${entry.id} obj.0`).toBeTruthy();
      expect(doc.text.win, `${entry.id} win`).toBeTruthy();
      expect(doc.text['fail.1'], `${entry.id} fail.1`).toBeTruthy();

      for (const tr of doc.triggers) {
        for (const a of tr.acts) {
          if (a.k === 'message') {
            expect(doc.text[`msg.${a.a[0]}`], `${entry.id} ${tr.id} msg.${a.a[0]}`).toBeTruthy();
          }
        }
      }

      const g = start(entry.raw);
      expect(dormantCarryoverCount(g), `${entry.id} dormant carryover`).toBeGreaterThanOrEqual(18);
    }
  });

  it('produces deterministic sim.hash() across two 300-tick runs for every map', () => {
    for (const entry of ACT3_MAPS) {
      const a = start(entry.raw, 33);
      const b = start(entry.raw, 33);
      step(a, 300);
      step(b, 300);
      expect(a.sim.hash(), entry.id).toBe(b.sim.hash());
      expect(a.sim.script!.st.status, `${entry.id} idle status`).toBe(0);
    }
  });

  it('loses (status 2, cause 1) on hero death for all 12 maps', () => {
    for (const entry of ACT3_MAPS) {
      const g = start(entry.raw, 1);
      killUnits(g.sim, [0]);
      step(g, 10);
      expect(g.sim.script!.st.status, entry.id).toBe(2);
      expect(g.sim.script!.st.cause, entry.id).toBe(1);
    }
  });

  it('supports town doors and entry on town maps (m24, m28, m35)', () => {
    for (const entry of [ACT3_MAPS[0], ACT3_MAPS[4], ACT3_MAPS[11]]) {
      const g = start(entry.raw, 7);
      const reg = regionsOf(g.loaded.map);
      const heroReg = reg[g.loaded.scenario.tiles[0][1] * g.loaded.map.w + g.loaded.scenario.tiles[0][0]];
      expect(g.sim.towns.length, entry.id).toBeGreaterThanOrEqual(1);
      const town = g.sim.towns[0];
      for (const role of [Role.Tavern, Role.Shop, Role.School] as const) {
        const door = town.door[role];
        if (!door) continue;
        expect(reg[door[1] * g.loaded.map.w + door[0]], `${entry.id} door ${role}`).toBe(heroReg);
        walk(g.sim, door[0], door[1], 1000);
        g.sim.now({ type: 'town', op: 'enter', town: 0, v: role });
        expect(g.sim.town.inside, `${entry.id} inside ${role}`).toBe(role);
        g.sim.now({ type: 'town', op: 'leave', town: 0 });
        expect(g.sim.town.inside).toBe(-1);
      }
    }
  });

  it('m24-pledge-at-oakhaven: relieves ally post for victory and loses if Captain Bram dies', () => {
    const g = start(m24);
    step(g, 10);
    const st = g.sim.script!.st;
    expect(st.msgs).toContain(1);
    expect(g.sim.peace[0 * 4 + 3]).toBe(1);

    killGroups(g, [4]);
    step(g, 10);
    expect(st.msgs).toContain(3);
    expect(g.sim.cb.sG.some((x) => x >= 500)).toBe(true);

    killGroups(g, [2, 3]);
    step(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.msgs).toContain(4);

    g.sim.place(0, 49, 17);
    step(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);

    const loseRun = start(m24);
    killUnits(loseRun.sim, loseRun.loaded.def.vip);
    step(loseRun, 10);
    expect([loseRun.sim.script!.st.status, loseRun.sim.script!.st.cause]).toEqual([2, 2]);
  });

  it('m25-cinder-wards: breaks three outer rune wards then central altar warden to win', () => {
    const g = start(m25);
    step(g, 10);
    const st = g.sim.script!.st;
    killGroups(g, [2, 3, 4]);
    step(g, 10);
    expect(st.vars[0]).toBe(3);
    expect(st.sub[0]).toBe(2);
    expect(st.msgs).toContain(5);
    expect(st.status).toBe(0);

    killGroups(g, [5]);
    step(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m26-sundered-ranks: cleaves west and east flanks then defeats northern command to win', () => {
    const g = start(m26);
    step(g, 10);
    const st = g.sim.script!.st;
    expect(st.patrols.length).toBe(1);

    killGroups(g, [2]);
    step(g, 10);
    expect(st.sub[0]).toBe(2);

    killGroups(g, [3]);
    step(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.msgs).toContain(4);

    killGroups(g, [5]);
    step(g, 10);
    expect(st.sub[2]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m27-field-infirmary: survives three sequential waves to win and loses if Chief Healer Sera dies', () => {
    const g = start(m27);
    step(g, 60); // advance wave clock >= 10 (50+ ticks)
    const st = g.sim.script!.st;
    expect(st.msgs).toContain(2);
    expect(g.loaded.def.groups[3].every((u) => g.sim.hidden[u] === 1)).toBe(true);

    killGroups(g, [2]);
    step(g, 10);
    expect(st.msgs).toContain(3);
    expect(g.loaded.def.groups[3].every((u) => g.sim.hidden[u] === 0)).toBe(true);

    killGroups(g, [3]);
    step(g, 10);
    expect(st.msgs).toContain(4);
    expect(g.loaded.def.groups[4].every((u) => g.sim.hidden[u] === 0)).toBe(true);

    killGroups(g, [4]);
    step(g, 10);
    expect(st.status).toBe(1);

    const loseRun = start(m27);
    killUnits(loseRun.sim, loseRun.loaded.def.vip);
    step(loseRun, 10);
    expect([loseRun.sim.script!.st.status, loseRun.sim.script!.st.cause]).toEqual([2, 2]);
  });

  it('m28-sunken-citadel: breaches outer wall, triggers courtyard alarm, and defeats Citadel Warden', () => {
    const g = start(m28);
    step(g, 10);
    const st = g.sim.script!.st;

    killGroups(g, [2]);
    step(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(g.sim.cb.sG.some((x) => x >= 800)).toBe(true);

    g.sim.place(0, 48, 46);
    step(g, 10);
    expect(st.msgs).toContain(3);

    killGroups(g, [5]);
    step(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m29-hourglass-rescue: wins on swift rescue and loses on hourglass expiry or warden death', () => {
    const g = start(m29);
    step(g, 10);
    killGroups(g, [3]);
    g.sim.place(0, 32, 16);
    step(g, 10);
    expect(g.sim.script!.st.status).toBe(1);

    const timeoutRun = start(m29);
    step(timeoutRun, 3050);
    expect([timeoutRun.sim.script!.st.status, timeoutRun.sim.script!.st.cause]).toEqual([2, 2]);

    const wardenDead = start(m29);
    killUnits(wardenDead.sim, wardenDead.loaded.def.vip);
    step(wardenDead, 10);
    expect([wardenDead.sim.script!.st.status, wardenDead.sim.script!.st.cause]).toEqual([2, 3]);
  });

  it('m30-starved-bastion: cuts supply escorts and breaks valley redoubt commander to win', () => {
    const g = start(m30);
    step(g, 10);
    const st = g.sim.script!.st;
    killGroups(g, [2, 3]);
    step(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(g.sim.cb.sG.some((x) => x >= 600)).toBe(true);

    killGroups(g, [4]);
    step(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m31-riverlock-crossing: captures west and east riverlock banks and defeats Lockmaster', () => {
    const g = start(m31);
    step(g, 10);
    const st = g.sim.script!.st;

    killGroups(g, [2]);
    step(g, 10);
    expect(st.sub[0]).toBe(2);

    killGroups(g, [3]);
    step(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(0);

    killGroups(g, [4]);
    step(g, 10);
    expect(st.sub[2]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m32-elder-juggernaut: triggers retainer swarm, slays Elder Juggernaut VIP and wardens to win', () => {
    const g = start(m32);
    step(g, 10);
    const st = g.sim.script!.st;
    g.sim.place(0, 32, 26);
    step(g, 10);
    expect(st.msgs).toContain(2);

    const vip = g.loaded.def.vip[0];
    expect(g.sim.cb.kind[vip]).toBe(Kind.Golem);
    killUnits(g.sim, [vip]);
    step(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(g.sim.cb.sG.some((x) => x >= 1000)).toBe(true);
    expect(st.status).toBe(0);

    killGroups(g, [4]);
    step(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m33-high-stakes-gambit: grants vault relics on side gambits and wins on central keep collapse', () => {
    const g = start(m33);
    step(g, 10);
    const st = g.sim.script!.st;

    killGroups(g, [2, 3]);
    step(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.sub[2]).toBe(2);
    expect(g.sim.hero!.inv.some((s) => s.item === itemId('Elixir of Mind'))).toBe(true);
    expect(g.sim.hero!.inv.some((s) => s.item === itemId('Knight Sword'))).toBe(true);
    expect(st.status).toBe(0);

    killGroups(g, [5]);
    step(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m34-clashing-banners: triggers central clash and shatters both rival banners to win', () => {
    const g = start(m34);
    step(g, 10);
    const st = g.sim.script!.st;

    g.sim.place(0, 32, 38);
    step(g, 10);
    expect(st.msgs).toContain(2);

    killGroups(g, [2, 4]);
    step(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.status).toBe(0);

    killGroups(g, [3, 5]);
    step(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m35-burning-harbor: secures evacuation pier, slays Dock Commander VIP for victory, and loses if Marshal falls', () => {
    const g = start(m35);
    step(g, 10);
    const st = g.sim.script!.st;
    expect(g.sim.peace[0 * 4 + 3]).toBe(1);

    g.sim.place(0, 48, 38);
    step(g, 10);
    expect(st.msgs).toContain(2);

    killGroups(g, [2, 3, 4]);
    step(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.sub[2]).toBe(2);
    expect(g.sim.cb.sG.some((x) => x >= 1000)).toBe(true);

    const dockVip = g.loaded.def.vip[1];
    expect(g.sim.cb.kind[dockVip]).toBe(Kind.Golem);
    killUnits(g.sim, [dockVip]);
    step(g, 10);
    expect(st.msgs).toContain(4);
    expect(st.status).toBe(0);

    killGroups(g, [5]);
    step(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);

    const loseRun = start(m35);
    const marshalVip = loseRun.loaded.def.vip[0];
    killUnits(loseRun.sim, [marshalVip]);
    step(loseRun, 10);
    expect([loseRun.sim.script!.st.status, loseRun.sim.script!.st.cause]).toEqual([2, 2]);
  });
});
