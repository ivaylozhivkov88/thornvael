import { describe, expect, it } from 'vitest';
import { loadDoc, type MapDoc } from '../src/mapdoc';
import { BUILT_IN, createMission, type MissionGame } from '../src/mission';
import { SAVE_VERSION, decodeSave, encodeSave, makeSave, migrateSave, resumeSave, type SaveFile } from '../src/save';
import { createHero } from '../src/sim/hero';
import { FP, type Command } from '../src/sim/sim';
import { Role } from '../src/sim/town';

function start(name: string, seed: number): MissionGame {
  const g = createMission(loadDoc(BUILT_IN[name]), seed);
  createHero(g.sim, 0, 1, true, 2);
  return g;
}
function tick(g: MissionGame, extra: Command[] = []): void {
  g.sim.step([...g.ai.commands(g.sim), ...extra]);
}
function save(g: MissionGame, name: string, seed: number): SaveFile {
  return makeSave('Test', 'label', { doc: BUILT_IN[name] as MapDoc, seed, snap: g.sim.snapshot(), ai: g.ai.snapshot(), ui: { cam: [0, 0, 1], groups: [], slots: [], selected: [] } }, 1);
}
const squad = (g: MissionGame): number[] => [...Array(g.sim.count).keys()].filter((i) => g.sim.team[i] === 0 && g.sim.hidden[i] === 0);

describe('saves', () => {
  for (const [name, seed] of [['ford', 5], ['market', 7]] as const) {
    it(`a ${name} save written to a file resumes exactly (same hash for 400 more ticks)`, () => {
      const a = start(name, seed);
      for (let t = 0; t < 120; t++) tick(a, t === 3 ? [{ type: 'order', order: 'attack', ids: squad(a), x: 40, y: 20 }] : []);
      if (name === 'market') {
        const [x, y] = a.sim.towns[0].door[Role.Tavern]!;
        a.sim.x[0] = a.sim.tx[0] = (x + 0.5) * FP;
        a.sim.y[0] = a.sim.ty[0] = (y + 0.5) * FP;
        a.sim.stop(0);
        a.sim.now({ type: 'town', op: 'enter', town: 0, v: Role.Tavern });
        a.sim.now({ type: 'town', op: 'hire', town: 0, v: 1 });
        a.sim.now({ type: 'town', op: 'accept', town: 0, v: 0 });
        a.sim.now({ type: 'town', op: 'leave', town: 0 });
        expect(a.sim.town.quests.length).toBe(1);
      }
      const text = encodeSave(save(a, name, seed));
      const b = resumeSave(decodeSave(text));
      expect(b.sim.hash()).toBe(a.sim.hash());
      for (let t = 0; t < 400; t++) {
        const order: Command[] = t === 50 ? [{ type: 'order', order: 'swarm', ids: [0], x: 20, y: 20 }] : [];
        tick(a, order);
        tick(b, order);
        if (t % 100 === 99) expect(b.sim.hash(), `tick ${a.sim.tick}`).toBe(a.sim.hash());
      }
    });
  }

  it('an IndexedDB-style structured clone resumes exactly too', () => {
    const a = start('market', 2);
    for (let t = 0; t < 60; t++) tick(a);
    const b = resumeSave(structuredClone(save(a, 'market', 2)));
    for (let t = 0; t < 200; t++) {
      tick(a);
      tick(b);
    }
    expect(b.sim.hash()).toBe(a.sim.hash());
  });

  it('a version 1 save (no teams, no towns in the snapshot) migrates and loads', () => {
    const a = start('market', 4);
    for (let t = 0; t < 30; t++) tick(a);
    const s = save(a, 'market', 4);
    s.saveVersion = 1;
    delete s.state.snap.team;
    delete s.state.snap.town;
    const m = migrateSave(decodeSave(encodeSave(s)));
    expect(m.saveVersion).toBe(SAVE_VERSION);
    const b = resumeSave(m);
    expect([...b.sim.team]).toEqual([...a.sim.team]);
    expect(b.sim.town.offers.length).toBe(1);
  });

  it('junk, newer and damaged files are refused with a readable reason', () => {
    expect(() => decodeSave('not json')).toThrow(/not a save/);
    expect(() => decodeSave('{"format":"other"}')).toThrow(/not a save/);
    expect(() => migrateSave({ format: 'thornvael-save', saveVersion: 99, gameVersion: '9' })).toThrow(/newer version/);
    expect(() => migrateSave({ format: 'thornvael-save', saveVersion: 2, state: {} })).toThrow(/damaged/);
  });
});
