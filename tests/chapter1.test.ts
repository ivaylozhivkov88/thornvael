import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { completeNode, newProgress, parseCampaign, townSeed, visitTown } from '../src/campaign';
import { applyCarryover, extractCarryover, waivePurse, type CarryoverState } from '../src/carryover';
import { loadDoc, migrate, validate } from '../src/mapdoc';
import { BUILT_IN, createMission, type MissionGame } from '../src/mission';
import { createHero } from '../src/sim/hero';
import { itemId } from '../src/sim/items';
import type { Command } from '../src/sim/sim';
import { Role, type TownCommand } from '../src/sim/town';

const campaign = parseCampaign(JSON.parse(readFileSync(new URL('../public/data/campaign.json', import.meta.url), 'utf8')));
const NAMES = ['ford', 'market', 'fen', 'ravenwatch', 'sanctum'];

function start(name: string, co?: CarryoverState, seed = 1): { g: MissionGame; placed: number } {
  const g = createMission(loadDoc(BUILT_IN[name]), seed);
  createHero(g.sim, 0, 0, false, 1);
  return { g, placed: co ? applyCarryover(g.sim, co) : 0 };
}
function run(g: MissionGame, ticks: number, cmds: Command[] = []): void {
  for (let t = 0; t < ticks; t++) g.sim.step([...g.ai.commands(g.sim), ...(t === 0 ? cmds : [])]);
}
const foes = (g: MissionGame): number[] => [...Array(g.sim.count).keys()].filter((u) => g.sim.team[u] === 1);
function killAll(g: MissionGame, ids: number[]): void {
  for (const u of ids) g.sim.cb.hp[u] = 0;
  g.sim.cb.recount(g.sim.team);
}
const reserved = (g: MissionGame): number => [...Array(g.sim.count).keys()].filter((u) => u !== 0 && g.sim.team[u] === 0 && g.sim.hidden[u]).length;

describe('chapter 1 maps', () => {
  it('all five built-in maps validate and every message they show has its text', () => {
    for (const n of NAMES) {
      const doc = migrate(BUILT_IN[n]);
      expect(validate(doc), n).toEqual([]);
      expect(doc.units.length).toBeLessThanOrEqual(300);
      for (const t of doc.triggers) for (const a of t.acts) if (a.k === 'message') expect(doc.text[`msg.${a.a[0]}`], `${n} ${t.id}`).toBeTruthy();
    }
  });

  it('every campaign node points at a shipped map, and each later map reserves room for the whole squad', () => {
    for (const node of campaign.nodes) expect(BUILT_IN[node.map], node.id).toBeTruthy();
    for (const n of ['market', 'fen', 'ravenwatch', 'sanctum']) {
      const { g } = start(n);
      const forHire = new Set(g.sim.towns.flatMap((t) => (t.def.mercs ?? []).map((m) => m.unit)));
      expect(reserved(g) - forHire.size, n).toBe(18);
    }
  });

  it('is deterministic: two runs of each new mission end on the same hash', () => {
    for (const n of ['fen', 'ravenwatch', 'sanctum']) {
      const a = start(n).g;
      const b = start(n).g;
      run(a, 300);
      run(b, 300);
      expect(a.sim.hash(), n).toBe(b.sim.hash());
    }
  });
});

describe('mission scripts', () => {
  it('fen: nests pay a scroll and gold, the scout dying loses, hero and scout at the post wins', () => {
    const a = start('fen').g;
    const gold = a.sim.cb.gold[0];
    killAll(a, [...a.loaded.def.groups[6], ...a.loaded.def.groups[7]]);
    run(a, 20);
    expect(a.sim.script!.st.sub[1]).toBe(2);
    expect(a.sim.cb.gold[0]).toBe(gold + 150);
    expect(a.sim.hero!.inv.some((s) => s.item === itemId('Scroll of Fireball'))).toBe(true);

    const b = start('fen').g;
    killAll(b, [1]);
    run(b, 10);
    expect([b.sim.script!.st.status, b.sim.script!.st.cause]).toEqual([2, 2]);

    const c = start('fen').g;
    c.sim.place(0, 70, 9);
    run(c, 3);
    expect(c.sim.script!.st.status).toBe(0); // the scout is not there yet
    c.sim.place(1, 71, 9);
    run(c, 10);
    expect(c.sim.script!.st.status).toBe(1);
  });

  it('ravenwatch: three waves come one after another, then dawn, then the totems end it', () => {
    const g = start('ravenwatch').g;
    const st = g.sim.script!.st;
    const hid = (id: number): number => g.loaded.def.groups[id].filter((u) => g.sim.hidden[u]).length;
    run(g, 10);
    expect([hid(10), hid(11), hid(12)]).toEqual([0, 6, 5]);
    killAll(g, g.loaded.def.groups[10]);
    run(g, 10);
    expect(hid(11)).toBe(0); // the west wave is out, the east one is not
    expect(hid(12)).toBe(5);
    killAll(g, g.loaded.def.groups[11]);
    run(g, 10);
    expect(hid(12)).toBe(0);
    expect(st.vars[1]).toBe(0); // no dawn while the east wave lives
    killAll(g, g.loaded.def.groups[12]);
    run(g, 20);
    expect(st.vars[1]).toBe(1);
    expect(st.status).toBe(0); // the totems still stand
    killAll(g, g.loaded.def.groups[23]);
    run(g, 10);
    expect(st.status).toBe(1);
  });

  it('sanctum: below 35% health Mordred retreats to the back hall, reinforcements and the ambush appear', () => {
    const g = start('sanctum').g;
    const boss = g.loaded.def.groups[8][0];
    expect(g.loaded.def.vip).toContain(boss);
    run(g, 10);
    expect(g.sim.script!.st.sub[1]).toBe(0);
    expect(g.loaded.def.groups[9].every((u) => g.sim.hidden[u])).toBe(true);
    g.sim.cb.hp[boss] = Math.floor(g.sim.cb.hpMax[boss] * 0.34);
    run(g, 10);
    expect(g.sim.script!.st.sub[1]).toBe(1);
    for (const id of [9, 10]) expect(g.loaded.def.groups[id].every((u) => !g.sim.hidden[u]), `group ${id}`).toBe(true);
    expect(g.sim.script!.st.status).toBe(0);
    killAll(g, [boss]);
    run(g, 10);
    expect(g.sim.script!.st.status).toBe(1);
  });
});

describe('the whole chain', () => {
  it('carries the whole squad from mission 1 through the town to missions 2, 3 and 4', () => {
    let p = newProgress(campaign, 1);

    // Mission 1: the chief falls; all eleven units come along.
    const m1 = start('ford').g;
    run(m1, 30);
    killAll(m1, [12]);
    run(m1, 12);
    expect(m1.sim.script!.st.status).toBe(1);
    let co = extractCarryover(m1.sim, p, townSeed(1, p.townVisits));
    expect(co.mercs.length).toBe(11);
    p = completeNode(campaign, p, 'm01-blood-at-the-ford');

    // Thornwick, first visit: a 300 gold purse, then one warrior hired at the tavern.
    const t1 = start('market', { ...co, progress: p }, townSeed(1, p.townVisits));
    expect(t1.placed).toBe(11);
    waivePurse(t1.g.sim, p.townVisits);
    run(t1.g, 10);
    expect(t1.g.sim.cb.gold[0]).toBe(co.gold + 300);
    const [dx, dy] = t1.g.sim.towns[0].door[Role.Tavern]!;
    t1.g.sim.place(0, dx, dy);
    const town = (op: TownCommand['op'], v?: number): TownCommand => ({ type: 'town', op, town: 0, v });
    t1.g.sim.now(town('enter', Role.Tavern));
    t1.g.sim.now(town('hire', 0));
    t1.g.sim.now(town('leave'));
    p = visitTown(p, 'town-thornwick');
    co = extractCarryover(t1.g.sim, p, townSeed(1, p.townVisits));
    expect(co.mercs.length).toBe(12);

    // Second visit: no second purse, and nobody is lost on the way in.
    const t2 = start('market', co, townSeed(1, p.townVisits));
    expect(t2.placed).toBe(12);
    waivePurse(t2.g.sim, p.townVisits);
    run(t2.g, 10);
    expect(t2.g.sim.cb.gold[0]).toBe(co.gold);

    // Mission 2: hero and scout reach the post; the scout joins the company.
    const m2 = start('fen', co);
    expect(m2.placed).toBe(12);
    m2.g.sim.place(0, 70, 9);
    m2.g.sim.place(1, 71, 9);
    run(m2.g, 10);
    expect(m2.g.sim.script!.st.status).toBe(1);
    co = extractCarryover(m2.g.sim, p, 1);
    expect(co.mercs.length).toBe(13);
    p = completeNode(campaign, p, 'm02-whispers-in-the-fen');

    // Mission 3: everything hostile is dead; the script runs wave, dawn and totems to the win.
    const m3 = start('ravenwatch', co);
    expect(m3.placed).toBe(13);
    killAll(m3.g, foes(m3.g));
    run(m3.g, 80);
    expect(m3.g.sim.script!.st.status).toBe(1);
    co = extractCarryover(m3.g.sim, p, 1);
    expect(co.mercs.length).toBe(13);
    p = completeNode(campaign, p, 'm03-nightfall-at-ravenwatch');

    // Mission 4: the boss falls; chapter 1 is complete.
    const m4 = start('sanctum', co);
    expect(m4.placed).toBe(13);
    killAll(m4.g, foes(m4.g));
    run(m4.g, 20);
    expect(m4.g.sim.script!.st.status).toBe(1);
    p = completeNode(campaign, p, 'm04-the-sunken-sanctum');
    expect(p.completed).toEqual(['m01-blood-at-the-ford', 'm02-whispers-in-the-fen', 'm03-nightfall-at-ravenwatch', 'm04-the-sunken-sanctum']);
    expect(p.townVisits).toBe(1);
  });
});
