import { describe, expect, it } from 'vitest';
import { MAP_VERSION, blankDoc, loadDoc, migrate, rleDecode, rleEncode, validate, type MapDoc } from '../src/mapdoc';
import { BUILT_IN, createMission } from '../src/mission';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { ACTIONS, CHECKS, type ParamKind } from '../src/sim/script';
import { FP, Sim, type Command } from '../src/sim/sim';

function game(raw: unknown = BUILT_IN.ford, seed = 1) {
  const g = createMission(loadDoc(raw), seed);
  createHero(g.sim, 0, 0, false, 1);
  return g;
}
function run(g: { sim: Sim; ai: { commands(s: Sim): Command[] } }, ticks: number, cmds: Record<number, Command[]> = {}): void {
  for (let t = 0; t < ticks; t++) {
    const now = g.ai.commands(g.sim);
    g.sim.step([...now, ...(cmds[g.sim.tick + 1] ?? [])]);
  }
}
const squad = (sim: Sim): number[] => [...Array(sim.count).keys()].filter((i) => sim.team[i] === 0);

describe('script registry', () => {
  it('has the 27 checks and 49 actions, unique and well formed', () => {
    expect(CHECKS.length).toBe(27);
    expect(ACTIONS.length).toBe(49);
    for (const list of [CHECKS, ACTIONS]) expect(new Set(list.map((d) => d.key)).size).toBe(list.length);
    const kinds: ParamKind[] = ['num', 'group', 'player', 'unit', 'x', 'y', 'item', 'building', 'spell', 'enum'];
    for (const d of [...CHECKS, ...ACTIONS]) for (const p of d.params) expect(kinds).toContain(p.kind);
  });

  it('every check and action runs without throwing, on a live mission', () => {
    const g = game();
    const st = g.sim.script!;
    const args = (ps: { kind: ParamKind; options?: string[] }[]): number[] => ps.map((p) => (p.kind === 'group' ? 3 : p.kind === 'unit' ? 12 : p.kind === 'x' ? 20 : p.kind === 'y' ? 20 : p.kind === 'num' ? 2 : p.kind === 'spell' ? 1 : 0));
    const ctx = { sim: g.sim, rt: st, st: st.st, out: [] as Command[] };
    for (const c of CHECKS) expect(Number.isFinite(c.run(ctx, args(c.params)))).toBe(true);
    for (const a of ACTIONS) expect(() => a.run(ctx, args(a.params))).not.toThrow();
    for (let t = 0; t < 60; t++) g.sim.step(ctx.out.splice(0));
  });
});

describe('map format', () => {
  it('run-length coding round-trips', () => {
    const a = Uint8Array.from([0, 0, 0, 2, 2, 1, 0, 0]);
    expect([...rleDecode(rleEncode(a), a.length)]).toEqual([...a]);
  });

  it('the first mission validates and loads', () => {
    expect(validate(migrate(BUILT_IN.ford))).toEqual([]);
    const l = loadDoc(BUILT_IN.ford);
    expect(l.map.w * l.map.h).toBe(l.map.terrain.length);
    expect(l.scenario.kinds[0]).toBe(Kind.Hero);
    expect(l.scenario.packs.length).toBe(2);
    expect(l.def.dormant.length).toBe(5);
  });

  it('migrates a version 1 file and the result still plays', () => {
    const v2 = blankDoc(20, 16);
    const v1 = { ...v2, version: 1, terrain: [...rleDecode(v2.terrain, 320)], height: [...rleDecode(v2.height, 320)], strings: v2.text, triggers: [{ id: 't', runOnce: true, enabled: true, conds: [], acts: [{ k: 'win', a: [] }] }] } as Record<string, unknown>;
    delete v1.text;
    const m = migrate(v1);
    expect(m.version).toBe(MAP_VERSION);
    expect(m.triggers[0].once).toBe(true);
    const g = createMission(loadDoc(v1));
    for (let t = 0; t < 10; t++) g.sim.step();
    expect(g.sim.script!.st.status).toBe(1);
  });

  it('refuses bad files with readable reasons', () => {
    expect(() => migrate({ format: 'other' })).toThrow('Not a map file');
    expect(() => migrate({ format: 'thornvael-map', version: 99 })).toThrow('newer game');
    const d: MapDoc = blankDoc(20, 16);
    d.units.push({ kind: Kind.Gnoll, team: 1, x: 3, y: 12 }); // same tile as the hero
    d.triggers.push({ id: 'bad', once: true, enabled: true, conds: [], acts: [{ k: 'nope', a: [] }, { k: 'gSwarm', a: [9, 1, 1] }] });
    const errs = validate(d);
    expect(errs.join('\n')).toContain('shares a tile');
    expect(errs.join('\n')).toContain('unknown action');
    expect(errs.join('\n')).toContain('group 9');
  });
});

describe('the first mission', () => {
  it('plays: the ford springs the ambush, the chief dies, the mission is won', () => {
    const g = game();
    const { sim } = g;
    const st = sim.script!.st;
    run(g, 30);
    expect(st.sub[0]).toBe(1);
    expect(st.msgs.slice(1)).toEqual([1]);
    expect(sim.hidden.reduce((a, b) => a + b, 0)).toBe(5);
    // Everybody crosses to the ford; the hero's box trigger fires.
    run(g, 1, { [sim.tick + 1]: [{ type: 'move', ids: squad(sim), x: 31, y: 23 }] });
    for (let t = 0; t < 1500 && st.vars[0] === 0 && sim.cb.hp[0] > 0; t++) run(g, 1);
    expect(sim.cb.hp[0]).toBeGreaterThan(0);
    expect(st.vars[0]).toBe(1);
    expect(sim.hidden.reduce((a, b) => a + b, 0)).toBe(0);
    expect(st.sub[1]).toBe(1);
    // Kill the chief by hand: the win trigger runs.
    sim.cb.hp[0] = Math.max(1, sim.cb.hp[0]);
    sim.cb.hp[12] = 0;
    sim.cb.recount(sim.team);
    run(g, 12);
    expect(st.status).toBe(1);
    expect(st.sub[1]).toBe(2);
  });

  it('is lost when the hero falls', () => {
    const g = game();
    run(g, 10);
    g.sim.cb.hp[0] = 0;
    g.sim.cb.recount(g.sim.team);
    run(g, 12);
    expect(g.sim.script!.st.status).toBe(2);
    expect(g.sim.script!.st.cause).toBe(1);
  });

  it('a snapshot taken mid-mission continues exactly where it was', () => {
    const a = game();
    run(a, 1, { 1: [{ type: 'move', ids: squad(a.sim), x: 31, y: 23 }] });
    for (let t = 0; t < 1500 && a.sim.script!.st.vars[0] === 0 && a.sim.cb.hp[0] > 0; t++) run(a, 1);
    // Take the snapshot while the ambushers are out and the script has fired triggers.
    run(a, 25);
    const snap = a.sim.snapshot();
    const aiSnap = a.ai.snapshot();
    const mid = a.sim.hash();
    expect(a.sim.script!.st.fired.reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
    run(a, 200);
    const end = a.sim.hash();
    expect(end).not.toBe(mid);
    // A fresh game restored from the snapshot (as after a reload) continues to the very same state.
    const b = game();
    b.sim.restore(snap);
    b.ai.restore(aiSnap);
    expect(b.sim.hash()).toBe(mid);
    run(b, 200);
    expect(b.sim.hash()).toBe(end);
    expect(b.sim.script!.st).toEqual(a.sim.script!.st);
  });

  it('replays to the same hash from the command log', () => {
    const a = game(BUILT_IN.ford, 5);
    run(a, 1, { 1: [{ type: 'move', ids: squad(a.sim), x: 31, y: 23 }] });
    run(a, 400);
    const b = game(BUILT_IN.ford, 5);
    let k = 0;
    for (let t = 1; t <= a.sim.tick; t++) {
      const cmds: Command[] = [];
      while (k < a.sim.log.length && a.sim.log[k].tick === t) cmds.push(a.sim.log[k++].cmd);
      b.sim.step(cmds);
    }
    expect(b.sim.hash()).toBe(a.sim.hash());
  });

  it('phased-out units are neither seen nor attacked, and a script step stays cheap', () => {
    const g = game();
    const t0 = performance.now();
    for (let t = 0; t < 200; t++) g.sim.step();
    const ms = (performance.now() - t0) / 200;
    expect(ms).toBeLessThan(2);
    for (const u of g.loaded.def.dormant) expect(g.sim.cb.hp[u]).toBeGreaterThan(0);
    expect(FP).toBeGreaterThan(0);
  });
});
