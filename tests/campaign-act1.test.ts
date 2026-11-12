import { describe, expect, it } from 'vitest';
import { applyCarryover, type CarryoverState } from '../src/carryover';
import { loadDoc, migrate, validate } from '../src/mapdoc';
import { createMission, type MissionGame } from '../src/mission';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import type { Command } from '../src/sim/sim';

import m05 from '../src/missions/m05-lantern-passage.map.json';
import m06 from '../src/missions/m06-greywood-supply.map.json';
import m07 from '../src/missions/m07-split-vanguard.map.json';
import m08 from '../src/missions/m08-alder-bridge.map.json';
import m09 from '../src/missions/m09-ironhide-hunt.map.json';
import m10 from '../src/missions/m10-undervault-links.map.json';
import m11 from '../src/missions/m11-ashbrook-retreat.map.json';

const MISSIONS = [
  { id: 'm05', raw: m05, w: 64, h: 64 },
  { id: 'm06', raw: m06, w: 64, h: 64 },
  { id: 'm07', raw: m07, w: 64, h: 64 },
  { id: 'm08', raw: m08, w: 64, h: 64 },
  { id: 'm09', raw: m09, w: 64, h: 64 },
  { id: 'm10', raw: m10, w: 64, h: 64 },
  { id: 'm11', raw: m11, w: 96, h: 96 },
] as const;

function start(raw: unknown, seed = 1, co?: CarryoverState): { g: MissionGame; placed: number } {
  const g = createMission(loadDoc(raw), seed);
  createHero(g.sim, 0, 0, false, 1);
  return { g, placed: co ? applyCarryover(g.sim, co) : 0 };
}

function run(g: MissionGame, ticks: number, cmds: Command[] = []): void {
  for (let t = 0; t < ticks; t++) g.sim.step([...g.ai.commands(g.sim), ...(t === 0 ? cmds : [])]);
}

function kill(g: MissionGame, ids: number[]): void {
  for (const u of ids) g.sim.cb.hp[u] = 0;
  g.sim.cb.recount(g.sim.team);
}

const reserved = (g: MissionGame): number =>
  [...Array(g.sim.count).keys()].filter((u) => u !== 0 && g.sim.team[u] === 0 && g.sim.hidden[u]).length;

describe('Act I continuation maps (m05-m11)', () => {
  it('validates all seven maps, checks text keys, unit limits, and 18 dormant carryover slots', () => {
    for (const m of MISSIONS) {
      const doc = migrate(m.raw);
      expect(validate(doc), m.id).toEqual([]);
      expect(doc.w, m.id).toBe(m.w);
      expect(doc.h, m.id).toBe(m.h);
      expect(doc.units.length, m.id).toBeLessThanOrEqual(300);
      expect(doc.units[0].kind, m.id).toBe(Kind.Hero);
      expect(doc.units[0].team, m.id).toBe(0);

      // Required briefing/outcome keys and matching msg.N keys
      expect(doc.text.title, m.id).toBeTruthy();
      expect(doc.text.body, m.id).toBeTruthy();
      expect(doc.text['obj.0'], m.id).toBeTruthy();
      expect(doc.text.win, m.id).toBeTruthy();
      expect(doc.text['fail.1'], m.id).toBeTruthy();
      for (const trig of doc.triggers) {
        for (const act of trig.acts) {
          if (act.k === 'message') expect(doc.text[`msg.${act.a[0]}`], `${m.id} ${trig.id}`).toBeTruthy();
        }
      }

      // Exactly 18 dormant team-0 carryover slots (8 Warrior, 6 Archer, 4 Mage)
      const { g } = start(m.raw);
      const forHire = new Set(g.sim.towns.flatMap((t) => (t.def.mercs ?? []).map((x) => x.unit)));
      expect(reserved(g) - forHire.size, m.id).toBe(18);
      const dormantKinds = doc.units
        .filter((u, idx) => idx > 0 && u.team === 0 && u.dormant && !forHire.has(idx))
        .map((u) => u.kind);
      expect(dormantKinds.filter((k) => k === Kind.Warrior).length, `${m.id} warriors`).toBe(8);
      expect(dormantKinds.filter((k) => k === Kind.Archer).length, `${m.id} archers`).toBe(6);
      expect(dormantKinds.filter((k) => k === Kind.Mage).length, `${m.id} mages`).toBe(4);

      const fullSquad: CarryoverState = {
        hero: g.sim.hero!,
        gold: 500,
        shopSeed: 1,
        progress: { node: 'm05-road-to-thornwick', completed: [], unlocked: [], townVisits: 0, difficulty: 1 },
        mercs: [
          ...Array(8).fill({ kind: Kind.Warrior, hpPct: 100 }),
          ...Array(6).fill({ kind: Kind.Archer, hpPct: 100 }),
          ...Array(4).fill({ kind: Kind.Mage, hpPct: 100 }),
        ],
      };
      const coRun = start(m.raw, 1, fullSquad);
      expect(coRun.placed, `${m.id} carryover placed`).toBe(18);
    }
  });

  it('produces deterministic sim hashes across identical runs for all seven missions', () => {
    for (const m of MISSIONS) {
      const a = start(m.raw, 17).g;
      const b = start(m.raw, 17).g;
      const hx = Math.floor(a.sim.x[0] / 256);
      const hy = Math.floor(a.sim.y[0] / 256);
      const cmd: Command = { type: 'move', ids: [0], x: hx + 1.5, y: hy + 0.5 };
      run(a, 60, [cmd]);
      run(b, 60, [cmd]);
      expect(a.sim.hash(), m.id).toBe(b.sim.hash());
    }
  });

  it('loses with cause 1 on hero death in all seven missions', () => {
    for (const m of MISSIONS) {
      const { g } = start(m.raw);
      kill(g, [0]);
      run(g, 10);
      expect([g.sim.script!.st.status, g.sim.script!.st.cause], m.id).toEqual([2, 1]);
    }
  });

  it('m05 Lantern Passage: rescues captive, defeats Ravine Warden VIP, wins at exit, loses if captive dies', () => {
    const { g } = start(m05);
    const st = g.sim.script!.st;
    run(g, 10);
    expect(g.sim.peace[0 * 4 + 2]).toBe(1);
    expect(g.sim.peace[1 * 4 + 2]).toBe(1);

    // Defeat jailers -> captive joins team 0
    kill(g, g.loaded.def.groups[2]);
    run(g, 10);
    expect(g.sim.team[19]).toBe(0);
    expect(st.msgs).toContain(2);

    // Defeat Ravine Warden VIP group
    kill(g, g.loaded.def.groups[5]);
    run(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.msgs).toContain(4);
    expect(st.status).toBe(0);

    // Escort hero & captive into north-east exit
    g.sim.place(0, 53, 10);
    g.sim.place(19, 54, 10);
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.status).toBe(1);

    // Captive death triggers cause 2 defeat
    const fail = start(m05).g;
    kill(fail, [19]);
    run(fail, 10);
    expect([fail.sim.script!.st.status, fail.sim.script!.st.cause]).toEqual([2, 2]);
  });

  it('m06 Greywood Supply: clears all three supply depots and Quartermaster Tarn VIP to win', () => {
    const { g } = start(m06);
    const st = g.sim.script!.st;
    run(g, 10);

    kill(g, g.loaded.def.groups[2]);
    kill(g, g.loaded.def.groups[3]);
    kill(g, g.loaded.def.groups[4]);
    run(g, 10);
    expect(st.vars[0]).toBe(3);
    expect(st.sub[0]).toBe(2);
    expect(st.status).toBe(0);

    const boss = g.loaded.def.vip[0];
    kill(g, [boss]);
    run(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m07 Split Vanguard: clears both cairn guards and reaches northern & southern cairns with split units', () => {
    const { g } = start(m07);
    const st = g.sim.script!.st;
    run(g, 10);

    kill(g, [...g.loaded.def.groups[3], ...g.loaded.def.groups[5]]);
    g.sim.place(0, 48, 10); // Hero at Northern Cairn
    g.sim.place(19, 48, 52); // Vanguard Archer at Southern Cairn
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m08 Alder Bridge: survives all three bridge waves to win, and loses if raiders reach western road', () => {
    const { g } = start(m08);
    const st = g.sim.script!.st;
    run(g, 10);

    kill(g, g.loaded.def.groups[2]);
    run(g, 10);
    expect(g.loaded.def.groups[3].every((u) => !g.sim.hidden[u])).toBe(true);

    kill(g, g.loaded.def.groups[3]);
    run(g, 10);
    expect(g.loaded.def.groups[4].every((u) => !g.sim.hidden[u])).toBe(true);
    expect(st.status).toBe(0);

    kill(g, g.loaded.def.groups[4]);
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.status).toBe(1);

    const fail = start(m08).g;
    const raider = fail.loaded.def.groups[2][0];
    fail.sim.place(raider, 10, 31);
    run(fail, 10);
    expect([fail.sim.script!.st.status, fail.sim.script!.st.cause]).toEqual([2, 2]);
  });

  it('m09 Ironhide Hunt: phases in quarry reserve below 50% HP and wins when Krag Ironhide falls', () => {
    const { g } = start(m09);
    const st = g.sim.script!.st;
    const boss = g.loaded.def.vip[0];
    expect(g.sim.cb.kind[boss]).toBe(Kind.Golem);

    g.sim.place(0, 46, 16);
    g.sim.cb.hp[boss] = Math.floor(g.sim.cb.hpMax[boss] * 0.45);
    run(g, 10);
    expect(st.msgs).toContain(2);
    expect(st.msgs).toContain(3);
    expect(g.loaded.def.groups[6].every((u) => !g.sim.hidden[u])).toBe(true);
    expect(st.status).toBe(0);

    kill(g, [boss]);
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m10 Undervault Links: clears West Torch Hall, survives central ambush, and breaks East Seal Chamber', () => {
    const { g } = start(m10);
    const st = g.sim.script!.st;
    run(g, 10);

    kill(g, g.loaded.def.groups[2]);
    run(g, 10);
    expect(st.sub[0]).toBe(2);

    g.sim.place(0, 36, 32);
    run(g, 10);
    expect(st.msgs).toContain(3);
    expect(g.loaded.def.groups[4].every((u) => !g.sim.hidden[u])).toBe(true);

    kill(g, [...g.loaded.def.groups[5], ...g.loaded.def.groups[6]]);
    run(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m11 Ashbrook Retreat: holds gate waves, defeats Siege Commander Vaelen, and loses if courtyard falls', () => {
    const { g } = start(m11);
    const st = g.sim.script!.st;
    run(g, 10);

    kill(g, g.loaded.def.groups[2]);
    run(g, 10);
    expect(g.loaded.def.groups[3].every((u) => !g.sim.hidden[u])).toBe(true);

    kill(g, g.loaded.def.groups[3]);
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.status).toBe(0);

    g.sim.place(0, 72, 22);
    run(g, 10);
    expect(g.loaded.def.groups[7].every((u) => !g.sim.hidden[u])).toBe(true);

    const commander = g.loaded.def.vip[0];
    kill(g, [commander]);
    run(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);

    const fail = start(m11).g;
    const foe = fail.loaded.def.groups[2][0];
    fail.sim.place(foe, 24, 70);
    run(fail, 10);
    expect([fail.sim.script!.st.status, fail.sim.script!.st.cause]).toEqual([2, 2]);
  });
});
