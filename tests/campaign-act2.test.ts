import { describe, expect, it } from 'vitest';
import { applyCarryover, extractCarryover } from '../src/carryover';
import { loadDoc, migrate, validate } from '../src/mapdoc';
import { createMission, type MissionGame } from '../src/mission';
import rawM12 from '../src/missions/m12-redmarsh-border.map.json';
import rawM13 from '../src/missions/m13-twin-passes.map.json';
import rawM14 from '../src/missions/m14-scattered-scouts.map.json';
import rawM15 from '../src/missions/m15-outpost-palisade.map.json';
import rawM16 from '../src/missions/m16-wardstone-rupture.map.json';
import rawM17 from '../src/missions/m17-mire-convoy.map.json';
import rawM18 from '../src/missions/m18-granary-raid.map.json';
import rawM19 from '../src/missions/m19-hexer-capture.map.json';
import rawM20 from '../src/missions/m20-deep-quarry.map.json';
import rawM21 from '../src/missions/m21-lean-garrison.map.json';
import rawM22 from '../src/missions/m22-fleeing-column.map.json';
import rawM23 from '../src/missions/m23-fork-of-spears.map.json';
import { newProgress, parseCampaign } from '../src/campaign';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { itemId } from '../src/sim/items';
import { regionsOf } from '../src/sim/path';
import type { Command } from '../src/sim/sim';
import { readFileSync } from 'node:fs';

interface MapEntry {
  id: string;
  raw: unknown;
  w: number;
  h: number;
}

const ACT2_MAPS: MapEntry[] = [
  { id: 'm12-redmarsh-border', raw: rawM12, w: 64, h: 64 },
  { id: 'm13-twin-passes', raw: rawM13, w: 64, h: 64 },
  { id: 'm14-scattered-scouts', raw: rawM14, w: 64, h: 64 },
  { id: 'm15-outpost-palisade', raw: rawM15, w: 64, h: 64 },
  { id: 'm16-wardstone-rupture', raw: rawM16, w: 64, h: 64 },
  { id: 'm17-mire-convoy', raw: rawM17, w: 64, h: 64 },
  { id: 'm18-granary-raid', raw: rawM18, w: 64, h: 64 },
  { id: 'm19-hexer-capture', raw: rawM19, w: 64, h: 64 },
  { id: 'm20-deep-quarry', raw: rawM20, w: 64, h: 64 },
  { id: 'm21-lean-garrison', raw: rawM21, w: 64, h: 64 },
  { id: 'm22-fleeing-column', raw: rawM22, w: 64, h: 64 },
  { id: 'm23-fork-of-spears', raw: rawM23, w: 96, h: 96 },
];

function start(raw: unknown, seed = 1): MissionGame {
  const loaded = loadDoc(raw);
  const g = createMission(loaded, seed);
  createHero(g.sim, 0, 0, false, 1);
  return g;
}

function run(g: MissionGame, ticks: number, cmds: Command[] = []): void {
  for (let t = 0; t < ticks; t++) {
    g.sim.step([...g.ai.commands(g.sim), ...(t === 0 ? cmds : [])]);
  }
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
  [...Array(g.sim.count).keys()].filter((u) => u !== 0 && g.sim.team[u] === 0 && g.sim.hidden[u]).length;

describe('campaign Act II maps (m12-m23)', () => {
  it('all 12 maps validate, match dimensions, have 18 dormant carryover slots, valid text, and full reachability', () => {
    for (const entry of ACT2_MAPS) {
      const doc = migrate(entry.raw);
      expect(validate(doc), entry.id).toEqual([]);
      expect(doc.w, `${entry.id} width`).toBe(entry.w);
      expect(doc.h, `${entry.id} height`).toBe(entry.h);
      expect(doc.units.length, `${entry.id} unit cap`).toBeLessThanOrEqual(300);
      expect(doc.units[0].kind, `${entry.id} hero kind`).toBe(Kind.Hero);
      expect(doc.units[0].team, `${entry.id} hero team`).toBe(0);

      // Text completeness
      expect(doc.text.title, `${entry.id} title`).toBeTruthy();
      expect(doc.text.body, `${entry.id} body`).toBeTruthy();
      expect(doc.text['obj.0'], `${entry.id} obj.0`).toBeTruthy();
      expect(doc.text.win, `${entry.id} win`).toBeTruthy();
      expect(doc.text['fail.1'], `${entry.id} fail.1`).toBeTruthy();

      for (const t of doc.triggers) {
        for (const a of t.acts) {
          if (a.k === 'message') {
            expect(doc.text[`msg.${a.a[0]}`], `${entry.id} ${t.id} msg.${a.a[0]}`).toBeTruthy();
            expect(doc.text[`msg.${a.a[0]}.who`], `${entry.id} ${t.id} msg.${a.a[0]}.who`).toBeTruthy();
          }
          if (a.k === 'lose') {
            expect(doc.text[`fail.${a.a[0]}`], `${entry.id} ${t.id} fail.${a.a[0]}`).toBeTruthy();
          }
        }
      }

      // 18 dormant team-0 slots for carryover compatibility
      const g = start(entry.raw);
      const forHire = new Set(g.sim.towns.flatMap((t) => (t.def.mercs ?? []).map((m) => m.unit)));
      expect(reservedCount(g) - forHire.size, `${entry.id} dormant carryover slots`).toBe(18);

      // Reachability of all placed units from hero spawn
      const reg = regionsOf(g.loaded.map);
      const heroReg = reg[g.loaded.scenario.tiles[0][1] * g.loaded.map.w + g.loaded.scenario.tiles[0][0]];
      expect(heroReg, `${entry.id} hero region`).toBeGreaterThanOrEqual(0);
      g.loaded.scenario.tiles.forEach(([ux, uy], i) => {
        expect(reg[uy * g.loaded.map.w + ux], `${entry.id} unit ${i} reachable`).toBe(heroReg);
      });
    }
  });

  it('every Act II map preserves deterministic sim.hash() and loses on hero death', () => {
    for (const entry of ACT2_MAPS) {
      const a = start(entry.raw, 7);
      const b = start(entry.raw, 7);
      run(a, 60);
      run(b, 60);
      expect(a.sim.hash(), `${entry.id} deterministic hash`).toBe(b.sim.hash());

      const d = start(entry.raw, 7);
      killUnits(d, [0]);
      run(d, 10);
      expect(d.sim.script!.st.status, `${entry.id} hero death status`).toBe(2);
      expect(d.sim.script!.st.cause, `${entry.id} hero death cause`).toBe(1);
    }
  });

  it('carryover places a full 18-mercenary squad cleanly into Act II maps', () => {
    const campaign = parseCampaign(
      JSON.parse(readFileSync(new URL('../public/data/campaign.json', import.meta.url), 'utf8')),
    );
    const p = newProgress(campaign, 1);
    const source = start(rawM12);
    // Activate the 18 dormant team-0 units in source to simulate a full 18-merc company
    for (let u = 1; u <= 18; u++) source.sim.hidden[u] = 0;
    const co = extractCarryover(source.sim, p, 1);
    expect(co.mercs.length).toBe(18);

    for (const entry of ACT2_MAPS) {
      const g = start(entry.raw);
      const placed = applyCarryover(g.sim, co);
      expect(placed, `${entry.id} carryover placed`).toBe(18);
    }
  });
});

describe('campaign Act II mission scripts', () => {
  it('m12-redmarsh-border: borderland entry spawns ambush, clearing 3 scout packs wins', () => {
    const g = start(rawM12);
    run(g, 10);
    const st = g.sim.script!.st;
    expect(st.sub[0]).toBe(1);
    expect(st.sub[1]).toBe(1);
    expect(g.loaded.def.groups[4].every((u) => g.sim.hidden[u])).toBe(true);

    g.sim.place(0, 40, 16);
    run(g, 10);
    expect(st.sub[0]).toBe(2);
    expect(g.loaded.def.groups[4].every((u) => !g.sim.hidden[u])).toBe(true);
    expect(st.status).toBe(0);

    const gold0 = g.sim.cb.gold[0];
    killGroup(g, 1);
    killGroup(g, 2);
    killGroup(g, 3);
    run(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(g.sim.cb.gold[0]).toBe(gold0 + 350);
    expect(st.status).toBe(1);
  });

  it('m13-twin-passes: clearing both passes spawns ridge ambush, clearing summit wins', () => {
    const g = start(rawM13);
    run(g, 10);
    const st = g.sim.script!.st;
    killGroup(g, 1);
    run(g, 10);
    expect(st.vars[0]).toBe(1);
    expect(g.loaded.def.groups[4].every((u) => g.sim.hidden[u])).toBe(true);

    killGroup(g, 2);
    run(g, 10);
    expect(st.vars[0]).toBe(2);
    expect(st.sub[0]).toBe(2);
    expect(g.loaded.def.groups[4].every((u) => !g.sim.hidden[u])).toBe(true);
    expect(st.status).toBe(0);

    killGroup(g, 3);
    run(g, 10);
    expect(st.sub[1]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m14-scattered-scouts: clearing each post and arriving rescues scouts to team 0 and wins', () => {
    const g = start(rawM14);
    run(g, 10);
    const st = g.sim.script!.st;

    killGroup(g, 1);
    g.sim.place(0, 14, 15);
    run(g, 10);
    expect(st.vars[0]).toBe(1);
    for (const u of g.loaded.def.groups[10]) {
      expect(g.sim.hidden[u]).toBe(0);
      expect(g.sim.team[u]).toBe(0);
    }

    killGroup(g, 2);
    g.sim.place(0, 49, 17);
    run(g, 10);
    expect(st.vars[0]).toBe(2);

    killGroup(g, 3);
    g.sim.place(0, 48, 45);
    run(g, 10);
    expect(st.vars[0]).toBe(3);
    expect(st.sub[0]).toBe(2);
    expect(st.status).toBe(1);
  });

  it('m15-outpost-palisade: wave progression wins, destroying both halls loses', () => {
    const g = start(rawM15);
    run(g, 10);
    const st = g.sim.script!.st;
    expect(g.loaded.def.groups[2].every((u) => g.sim.hidden[u])).toBe(true);

    killGroup(g, 1);
    run(g, 10);
    expect(g.loaded.def.groups[2].every((u) => !g.sim.hidden[u])).toBe(true);
    expect(g.loaded.def.groups[3].every((u) => g.sim.hidden[u])).toBe(true);

    killGroup(g, 2);
    run(g, 10);
    expect(g.loaded.def.groups[3].every((u) => !g.sim.hidden[u])).toBe(true);
    expect(st.status).toBe(0);

    killGroup(g, 3);
    run(g, 10);
    expect(st.status).toBe(1);

    // Building destruction defeat
    const b = start(rawM15);
    run(b, 10);
    b.sim.script!.st.bhp[0] = 0;
    b.sim.script!.st.bhp[1] = 0;
    run(b, 10);
    expect(b.sim.script!.st.status).toBe(2);
    expect(b.sim.script!.st.cause).toBe(2);
  });

  it('m16-wardstone-rupture: clearing all 3 ward guardian packs grants scroll and wins', () => {
    const g = start(rawM16);
    run(g, 10);
    killGroup(g, 1);
    run(g, 10);
    expect(g.sim.hero!.inv.some((s) => s.item === itemId('Scroll of Healing'))).toBe(true);
    killGroup(g, 2);
    killGroup(g, 3);
    run(g, 10);
    expect(g.sim.script!.st.status).toBe(1);
  });

  it('m17-mire-convoy: bog ambush fires, escorting convoy VIP to depot wins, VIP death loses', () => {
    const g = start(rawM17);
    run(g, 10);
    expect(g.loaded.def.groups[5].every((u) => g.sim.hidden[u])).toBe(true);
    g.sim.place(0, 30, 34);
    run(g, 10);
    expect(g.loaded.def.groups[5].every((u) => !g.sim.hidden[u])).toBe(true);

    g.sim.place(0, 52, 11);
    run(g, 10);
    expect(g.sim.script!.st.status).toBe(0); // convoy bearer still behind

    g.sim.place(1, 53, 11);
    run(g, 10);
    expect(g.sim.script!.st.status).toBe(1);

    const fail = start(rawM17);
    killUnits(fail, [1]);
    run(fail, 10);
    expect(fail.sim.script!.st.status).toBe(2);
    expect(fail.sim.script!.st.cause).toBe(2);
  });

  it('m18-granary-raid: clearing sentries and depot guards wins', () => {
    const g = start(rawM18);
    run(g, 10);
    killGroup(g, 1);
    run(g, 10);
    expect(g.sim.script!.st.sub[0]).toBe(2);
    expect(g.sim.script!.st.status).toBe(0);

    killGroup(g, 2);
    killGroup(g, 3);
    killGroup(g, 4);
    run(g, 10);
    expect(g.sim.script!.st.sub[1]).toBe(2);
    expect(g.sim.script!.st.status).toBe(1);
  });

  it('m19-hexer-capture: wounding VIP Mage spawns coven reserves, slaying VIP wins', () => {
    const g = start(rawM19);
    const vip = g.loaded.def.vip[0];
    expect(g.sim.cb.kind[vip]).toBe(Kind.Mage);
    run(g, 10);
    expect(g.loaded.def.groups[5].every((u) => g.sim.hidden[u])).toBe(true);

    g.sim.cb.hp[vip] = Math.floor(g.sim.cb.hpMax[vip] * 0.4);
    run(g, 10);
    expect(g.loaded.def.groups[5].every((u) => !g.sim.hidden[u])).toBe(true);
    expect(g.sim.script!.st.status).toBe(0);

    killUnits(g, [vip]);
    run(g, 10);
    expect(g.sim.script!.st.status).toBe(1);
  });

  it('m20-deep-quarry: entering middle terrace updates objective and clearing quarry guards wins', () => {
    const g = start(rawM20);
    run(g, 10);
    g.sim.place(0, 34, 30);
    run(g, 10);
    expect(g.sim.script!.st.sub[0]).toBe(2);

    killGroup(g, 1);
    killGroup(g, 2);
    killGroup(g, 3);
    run(g, 10);
    expect(g.sim.script!.st.sub[1]).toBe(2);
    expect(g.sim.script!.st.status).toBe(1);
  });

  it('m21-lean-garrison: 3 converging waves win, losing both halls loses', () => {
    const g = start(rawM21);
    run(g, 10);
    killGroup(g, 1);
    run(g, 10);
    expect(g.loaded.def.groups[2].every((u) => !g.sim.hidden[u])).toBe(true);
    killGroup(g, 2);
    run(g, 10);
    expect(g.loaded.def.groups[3].every((u) => !g.sim.hidden[u])).toBe(true);
    killGroup(g, 3);
    run(g, 10);
    expect(g.sim.script!.st.status).toBe(1);

    const b = start(rawM21);
    run(b, 10);
    b.sim.script!.st.bhp[0] = 0;
    b.sim.script!.st.bhp[1] = 0;
    run(b, 10);
    expect(b.sim.script!.st.status).toBe(2);
    expect(b.sim.script!.st.cause).toBe(2);
  });

  it('m22-fleeing-column: slaying VIP officer wins, officer reaching escape gate loses', () => {
    const g = start(rawM22);
    const vip = g.loaded.def.vip[0];
    run(g, 10);
    g.sim.place(0, 30, 32);
    run(g, 10);
    expect(g.sim.script!.st.vars[0]).toBe(1);
    expect(g.sim.script!.st.msgs).toContain(2);

    killUnits(g, [vip]);
    run(g, 10);
    expect(g.sim.script!.st.status).toBe(1);

    const esc = start(rawM22);
    const escVip = esc.loaded.def.vip[0];
    esc.sim.place(escVip, 55, 10);
    run(esc, 10);
    expect(esc.sim.script!.st.status).toBe(2);
    expect(esc.sim.script!.st.cause).toBe(2);
  });

  it('m23-fork-of-spears: 96x96 finale triggers route & courtyard events and wins on VIP Golem defeat', () => {
    const g = start(rawM23);
    const vip = g.loaded.def.vip[0];
    expect(g.sim.cb.kind[vip]).toBe(Kind.Golem);
    run(g, 10);
    expect(g.loaded.def.groups[6].every((u) => g.sim.hidden[u])).toBe(true);

    killGroup(g, 1);
    run(g, 10);
    expect(g.sim.script!.st.vars[0]).toBe(1);

    g.sim.place(0, 48, 24);
    run(g, 10);
    expect(g.sim.script!.st.sub[0]).toBe(2);
    expect(g.loaded.def.groups[6].every((u) => !g.sim.hidden[u])).toBe(true);
    expect(g.sim.script!.st.status).toBe(0);

    killUnits(g, [vip]);
    run(g, 10);
    expect(g.sim.script!.st.sub[1]).toBe(2);
    expect(g.sim.script!.st.status).toBe(1);
  });
});
