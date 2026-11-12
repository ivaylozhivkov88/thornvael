import { describe, expect, it } from 'vitest';
import { loadDoc, migrate, validate } from '../src/mapdoc';
import { createMission, type MissionGame } from '../src/mission';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { FP, type Sim } from '../src/sim/sim';
import { Role } from '../src/sim/town';

import m36 from '../src/missions/m36-heartland-march.map.json';
import m37 from '../src/missions/m37-shattered-beacons.map.json';
import m38 from '../src/missions/m38-besieged-wall.map.json';
import m39 from '../src/missions/m39-flight-of-malrik.map.json';
import m40 from '../src/missions/m40-twofold-assault.map.json';
import m41 from '../src/missions/m41-gauntlet-of-iron.map.json';
import m42 from '../src/missions/m42-outer-rampart.map.json';
import m43 from '../src/missions/m43-three-roads-siege.map.json';
import m44 from '../src/missions/m44-threshold-choice.map.json';
import m45 from '../src/missions/m45-crown-of-order.map.json';
import m46 from '../src/missions/m46-ember-reckoning.map.json';

interface Act4Entry {
  id: string;
  w: number;
  h: number;
  raw: unknown;
}

const ACT4_MAPS: Act4Entry[] = [
  { id: 'm36-heartland-march', w: 64, h: 64, raw: m36 },
  { id: 'm37-shattered-beacons', w: 64, h: 64, raw: m37 },
  { id: 'm38-besieged-wall', w: 64, h: 64, raw: m38 },
  { id: 'm39-flight-of-malrik', w: 64, h: 64, raw: m39 },
  { id: 'm40-twofold-assault', w: 64, h: 64, raw: m40 },
  { id: 'm41-gauntlet-of-iron', w: 96, h: 96, raw: m41 },
  { id: 'm42-outer-rampart', w: 96, h: 96, raw: m42 },
  { id: 'm43-three-roads-siege', w: 96, h: 96, raw: m43 },
  { id: 'm44-threshold-choice', w: 64, h: 64, raw: m44 },
  { id: 'm45-crown-of-order', w: 96, h: 96, raw: m45 },
  { id: 'm46-ember-reckoning', w: 96, h: 96, raw: m46 },
];

function start(raw: unknown, seed = 1): MissionGame {
  const g = createMission(loadDoc(raw), seed);
  createHero(g.sim, 0, 0, false, 1);
  return g;
}

function run(g: MissionGame, ticks: number): void {
  for (let t = 0; t < ticks; t++) g.sim.step(g.ai.commands(g.sim));
}

function killGroup(g: MissionGame, groupId: number): void {
  for (const u of g.loaded.def.groups[groupId] ?? []) g.sim.cb.hp[u] = 0;
  g.sim.cb.recount(g.sim.team);
}

function killUnits(g: MissionGame, ids: number[]): void {
  for (const u of ids) g.sim.cb.hp[u] = 0;
  g.sim.cb.recount(g.sim.team);
}

const reservedCount = (g: MissionGame): number =>
  [...Array(g.sim.count).keys()].filter((u) => u !== 0 && g.sim.team[u] === 0 && g.sim.hidden[u] === 1).length;

function walk(sim: Sim, x: number, y: number): void {
  sim.step([{ type: 'move', ids: [0], x: x + 0.5, y: y + 0.5 }]);
  for (let tick = 0; tick < 800; tick++) {
    if (Math.floor(sim.x[0] / FP) === x && Math.floor(sim.y[0] / FP) === y) return;
    sim.step();
  }
  throw new Error(`Hero could not walk to ${x}, ${y}`);
}

describe('Campaign Act IV maps (m36-m46)', () => {
  it('all 11 maps validate, use format v2, hold <= 300 units, >= 18 dormant slots, and complete text', () => {
    for (const entry of ACT4_MAPS) {
      const doc = migrate(entry.raw);
      expect(doc.format, entry.id).toBe('thornvael-map');
      expect(doc.version, entry.id).toBe(2);
      expect(doc.w, entry.id).toBe(entry.w);
      expect(doc.h, entry.id).toBe(entry.h);
      expect(validate(doc), entry.id).toEqual([]);
      expect(doc.units.length, entry.id).toBeLessThanOrEqual(300);
      expect(doc.units[0].kind, entry.id).toBe(Kind.Hero);
      expect(doc.units[0].team, entry.id).toBe(0);

      expect(doc.text.title, entry.id).toBeTruthy();
      expect(doc.text.body, entry.id).toBeTruthy();
      expect(doc.text['obj.0'], entry.id).toBeTruthy();
      expect(doc.text.win, entry.id).toBeTruthy();
      expect(doc.text['fail.1'], entry.id).toBeTruthy();

      for (const trig of doc.triggers) {
        for (const act of trig.acts) {
          if (act.k === 'message') expect(doc.text[`msg.${act.a[0]}`], `${entry.id} ${trig.id}`).toBeTruthy();
          if (act.k === 'lose') expect(doc.text[`fail.${act.a[0]}`], `${entry.id} ${trig.id}`).toBeTruthy();
        }
      }

      const g = start(entry.raw);
      const forHire = new Set(g.sim.towns.flatMap((t) => (t.def.mercs ?? []).map((m) => m.unit)));
      expect(reservedCount(g) - forHire.size, entry.id).toBeGreaterThanOrEqual(18);
    }
  });

  it('every Act IV map produces a deterministic sim.hash() and loses on hero death', () => {
    for (const entry of ACT4_MAPS) {
      const a = start(entry.raw, 77);
      const b = start(entry.raw, 77);
      run(a, 60);
      run(b, 60);
      expect(a.sim.hash(), entry.id).toBe(b.sim.hash());

      killUnits(a, [0]);
      run(a, 10);
      expect(a.sim.script!.st.status, entry.id).toBe(2);
      expect(a.sim.script!.st.cause, entry.id).toBe(1);
    }
  });

  it('m36 Heartland March: exposes Highcrest town hub and wins after clearing pass', () => {
    const g = start(m36);
    expect(g.sim.towns.length).toBe(1);
    for (const role of [Role.Tavern, Role.Shop, Role.School]) {
      const door = g.sim.towns[0].door[role]!;
      expect(door).not.toBeNull();
      walk(g.sim, door[0], door[1]);
      g.sim.now({ type: 'town', op: 'enter', town: 0, v: role });
      expect(g.sim.town.inside).toBe(role);
      g.sim.now({ type: 'town', op: 'leave', town: 0 });
    }

    run(g, 10);
    const st = g.sim.script!.st;
    killGroup(g, 2);
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(g.sim.cb.sG.some((gold) => gold >= 400)).toBe(true);

    g.sim.place(0, 32, 24);
    run(g, 10);
    expect(st.msgs).toContain(3);

    killGroup(g, 3);
    killGroup(g, 4);
    run(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m37 Shattered Beacons: breaks all three beacons, triggers counter-strike, and wins', () => {
    const g = start(m37);
    run(g, 10);
    const st = g.sim.script!.st;

    killGroup(g, 2);
    killGroup(g, 3);
    run(g, 10);
    expect(st.bhp[0]).toBe(0);
    expect(st.bhp[1]).toBe(0);
    expect(st.msgs).toContain(5);
    expect(g.loaded.def.groups[5].every((u) => g.sim.hidden[u] === 0)).toBe(true);

    killGroup(g, 4);
    run(g, 10);
    expect(st.bhp[2]).toBe(0);
    expect(st.status).toBe(1);
  });

  it('m38 Besieged Wall: allies hold peace, repels three siege waves for victory, loses if garrison falls', () => {
    const g = start(m38);
    run(g, 10);
    expect(g.sim.peace[0 * 4 + 3]).toBe(1);
    const st = g.sim.script!.st;

    killGroup(g, 2);
    run(g, 10);
    expect(st.vars[0]).toBe(1);
    expect(g.loaded.def.groups[3].every((u) => g.sim.hidden[u] === 0)).toBe(true);

    killGroup(g, 3);
    run(g, 10);
    expect(st.vars[0]).toBe(2);
    expect(g.loaded.def.groups[4].every((u) => g.sim.hidden[u] === 0)).toBe(true);

    killGroup(g, 4);
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.status).toBe(1);

    const gLose = start(m38);
    run(gLose, 10);
    killGroup(gLose, 1);
    run(gLose, 10);
    expect(gLose.sim.script!.st.status).toBe(2);
    expect(gLose.sim.script!.st.cause).toBe(2);
  });

  it('m39 Flight of Malrik: flees in stages, loses if Malrik escapes, wins if Malrik is slain', () => {
    const g = start(m39);
    run(g, 10);
    const malrik = g.loaded.def.vip[0];
    expect(malrik).toBe(19);

    g.sim.cb.hp[malrik] = Math.floor(g.sim.cb.hpMax[malrik] * 0.7);
    run(g, 10);
    expect(g.sim.script!.st.msgs).toContain(2);
    expect(g.loaded.def.groups[4].every((u) => g.sim.hidden[u] === 0)).toBe(true);

    g.sim.cb.hp[malrik] = Math.floor(g.sim.cb.hpMax[malrik] * 0.35);
    run(g, 10);
    expect(g.sim.script!.st.msgs).toContain(3);
    expect(g.loaded.def.groups[5].every((u) => g.sim.hidden[u] === 0)).toBe(true);

    killUnits(g, [malrik]);
    run(g, 10);
    expect(g.sim.script!.st.status).toBe(1);

    const gEscape = start(m39);
    run(gEscape, 10);
    gEscape.sim.place(19, 52, 10);
    run(gEscape, 10);
    expect(gEscape.sim.script!.st.status).toBe(2);
    expect(gEscape.sim.script!.st.cause).toBe(2);
  });

  it('m40 Twofold Assault: deploys relief column after first bastion and wins when both fall', () => {
    const g = start(m40);
    run(g, 10);
    const st = g.sim.script!.st;

    killGroup(g, 2);
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.bhp[0]).toBe(0);
    expect(g.loaded.def.groups[5].every((u) => g.sim.hidden[u] === 0)).toBe(true);

    killGroup(g, 3);
    run(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.bhp[1]).toBe(0);
    expect(st.status).toBe(1);
  });

  it('m41 Gauntlet of Iron: advances through checkpoints and wins on commander defeat', () => {
    const g = start(m41);
    run(g, 10);
    const st = g.sim.script!.st;

    killGroup(g, 2);
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(g.sim.cb.sG.some((gold) => gold >= 350)).toBe(true);

    g.sim.place(0, 48, 48);
    run(g, 10);
    expect(st.msgs).toContain(3);

    killGroup(g, 3);
    killGroup(g, 4);
    killGroup(g, 5);
    run(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.sub[2]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m42 Outer Rampart: breaching two gates summons Inner Bailey garrison and wins on defeat', () => {
    const g = start(m42);
    run(g, 10);
    const st = g.sim.script!.st;

    killGroup(g, 2);
    killGroup(g, 3);
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.bhp[0]).toBe(0);
    expect(st.bhp[1]).toBe(0);
    expect(g.loaded.def.groups[5].every((u) => g.sim.hidden[u] === 0)).toBe(true);

    killGroup(g, 5);
    run(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m43 Three-Roads Siege: repels three columns, triggers counter-push, and loses if camp falls', () => {
    const g = start(m43);
    run(g, 10);
    expect(g.sim.peace[0 * 4 + 3]).toBe(1);
    const st = g.sim.script!.st;

    killGroup(g, 2);
    killGroup(g, 3);
    killGroup(g, 4);
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(g.loaded.def.groups[5].every((u) => g.sim.hidden[u] === 0)).toBe(true);

    killGroup(g, 5);
    run(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);

    const gLose = start(m43);
    run(gLose, 10);
    killGroup(gLose, 1);
    run(gLose, 10);
    expect(gLose.sim.script!.st.status).toBe(2);
    expect(gLose.sim.script!.st.cause).toBe(2);
  });

  it('m44 Threshold Choice: unlocks either Branch A (sv[0]=1) or Branch B (sv[0]=2) after clearing chamber', () => {
    const gA = start(m44);
    run(gA, 10);
    killGroup(gA, 2);
    killGroup(gA, 3);
    run(gA, 10);
    expect(gA.sim.script!.st.sub[0]).toBe(2);
    gA.sim.place(0, 16, 14);
    run(gA, 10);
    expect(gA.sim.script!.st.sv[0]).toBe(1);
    expect(gA.sim.script!.st.status).toBe(1);

    const gB = start(m44);
    run(gB, 10);
    killGroup(gB, 2);
    killGroup(gB, 3);
    run(gB, 10);
    gB.sim.place(0, 48, 14);
    run(gB, 10);
    expect(gB.sim.script!.st.sv[0]).toBe(2);
    expect(gB.sim.script!.st.status).toBe(1);
  });

  it('m45 Crown of Order: binds anchor seals and wins on Arch-Warden Korrath defeat', () => {
    const g = start(m45);
    run(g, 10);
    const st = g.sim.script!.st;
    const archWarden = g.loaded.def.vip[0];
    expect(archWarden).toBe(27);

    killGroup(g, 2);
    killGroup(g, 3);
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.bhp[0]).toBe(0);
    expect(st.bhp[1]).toBe(0);
    expect(g.loaded.def.groups[5].every((u) => g.sim.hidden[u] === 0)).toBe(true);

    killUnits(g, [archWarden]);
    run(g, 10);
    expect(st.bhp[2]).toBe(0);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m46 Ember Reckoning: shatters conduit pillars, enrages Vorak, and wins on Overlord defeat', () => {
    const g = start(m46);
    run(g, 10);
    const st = g.sim.script!.st;
    const overlord = g.loaded.def.vip[0];
    expect(overlord).toBe(27);

    killGroup(g, 2);
    killGroup(g, 3);
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(st.bhp[0]).toBe(0);
    expect(st.bhp[1]).toBe(0);
    expect(g.loaded.def.groups[5].every((u) => g.sim.hidden[u] === 0)).toBe(true);

    g.sim.cb.hp[overlord] = Math.floor(g.sim.cb.hpMax[overlord] * 0.45);
    run(g, 10);
    expect(st.msgs).toContain(5);

    killUnits(g, [overlord]);
    run(g, 10);
    expect(st.bhp[2]).toBe(0);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });
});
