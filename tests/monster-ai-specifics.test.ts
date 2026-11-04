import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { monsterInfo } from '../src/monster-info';
import { Bot, MonsterAi } from '../src/sim/bot';
import { DEFS, Kind } from '../src/sim/combat';
import { Sim, replay, type Command } from '../src/sim/sim';

function field(): GameMap {
  const w = 40, h = 30;
  return { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h).fill(200) };
}

function squad(): Sim {
  const sim = new Sim(field(), 17, [1, 1, 1, 1, 1, 0]);
  for (let i = 0; i < sim.count; i++) sim.place(i, 8 + i * 2, 10);
  sim.cb.hp[0] = 0;
  sim.hidden[1] = 1;
  return sim;
}

describe('Bot living squad commands', () => {
  it('excludes dead, phased-out and other-team units before grouping, retaining stagger', () => {
    const sim = squad();
    const bot = new Bot(1, 2, 99);
    const seen: { tick: number; ids: number[] }[] = [];
    for (let n = 0; n < 130; n++) {
      const cmds = bot.commands(sim);
      for (const cmd of cmds) {
        expect(cmd.type).toBe('move');
        if ('ids' in cmd) seen.push({ tick: sim.tick, ids: cmd.ids });
      }
      sim.step(cmds);
    }
    expect(seen).toEqual([
      { tick: 1, ids: [2, 3] },
      { tick: 119, ids: [4] },
      { tick: 126, ids: [2, 3] },
    ]);
  });

  it('a wholly dead/hidden team emits nothing and consumes no random targets', () => {
    const sim = squad();
    const bot = new Bot(1, 2, 99);
    sim.cb.hp.fill(0, 2, 5);
    for (let n = 0; n < 130; n++) {
      expect(bot.commands(sim)).toEqual([]);
      sim.step();
    }
    sim.cb.hp[2] = DEFS[Kind.Warrior].hp;
    while (sim.tick < 251) sim.step();
    expect(bot.commands(sim)).toEqual(new Bot(1, 2, 99).commands(sim));
    expect(bot.commands(sim)).toHaveLength(1);
  });

  it('same seeded bots and recorded commands reproduce the Sim hash', () => {
    const a = squad(), b = squad(), logged = squad();
    const first = new Bot(1, 2, 99), second = new Bot(1, 2, 99);
    for (let n = 0; n < 300; n++) {
      const cmds = first.commands(a);
      expect(second.commands(b)).toEqual(cmds);
      a.step(cmds);
      b.step(cmds);
    }
    expect(a.log.length).toBeGreaterThan(0);
    replay(logged, a.log, a.tick);
    expect(b.hash()).toBe(a.hash());
    expect(logged.hash()).toBe(a.hash());
  });
});

function packGame(): { sim: Sim; ai: MonsterAi } {
  const sim = new Sim(field(), 23, [1, 1, 0], { kinds: [Kind.Gnoll, Kind.Golem, Kind.Warrior], combat: true, hpMul: 20 });
  sim.place(0, 10, 10);
  sim.place(1, 11, 10);
  sim.place(2, 14, 10);
  sim.cb.hp[2] = 1;
  return { sim, ai: new MonsterAi([{ ids: [0, 1], x: 10.5, y: 10.5, hunting: false, calm: 0 }]) };
}

describe('MonsterAi continuation', () => {
  it('restores hunting and calm time, then issues the same return-to-post command and replay', () => {
    const a = packGame();
    // Let real combat remove the intruder, then save during the calm countdown.
    a.sim.step([{ type: 'order', order: 'still', ids: [2] }]);
    while (a.sim.tick < 150 && a.ai.snapshot()[0][1] === 0) a.sim.step(a.ai.commands(a.sim));
    const snap = a.sim.snapshot(), aiSnap = a.ai.snapshot();
    expect(aiSnap[0][0]).toBe(true);
    expect(aiSnap[0][1]).toBeGreaterThan(0);
    expect(a.sim.cb.hp[2]).toBe(0);
    const b = packGame();
    b.sim.restore(snap);
    b.ai.restore(aiSnap);
    expect(b.sim.hash()).toBe(a.sim.hash());
    const continuation: Command[] = [];
    for (let n = 0; n < 200; n++) {
      const cmds = a.ai.commands(a.sim);
      expect(b.ai.commands(b.sim)).toEqual(cmds);
      continuation.push(...cmds);
      a.sim.step(cmds);
      b.sim.step(cmds);
    }
    expect(continuation.some((cmd) => cmd.type === 'order' && cmd.order === 'guard')).toBe(true);
    expect(b.ai.snapshot()).toEqual(a.ai.snapshot());
    expect(b.sim.hash()).toBe(a.sim.hash());
    const recorded = packGame();
    replay(recorded.sim, a.sim.log, a.sim.tick);
    expect(recorded.sim.hash()).toBe(a.sim.hash());
  });
});

describe('current enemy family descriptions', () => {
  it.each([Kind.Gnoll, Kind.Golem, Kind.Imp, Kind.Archer])('exposes detached, immutable DEFS values for kind %i', (kind) => {
    const before = structuredClone(DEFS[kind]);
    const info = monsterInfo(kind)!;
    expect(info.base).toEqual(before);
    expect(info.base).not.toBe(DEFS[kind]);
    expect(info.base.res).not.toBe(DEFS[kind].res);
    expect(Object.isFrozen(info.base.res)).toBe(true);
    expect(Object.isFrozen(info.base.pdef)).toBe(true);
    expect(Object.isFrozen(info.base.pabs)).toBe(true);
    expect(Object.isFrozen(info.base)).toBe(true);
    expect(DEFS[kind]).toEqual(before);
  });

  it('keeps vulnerabilities, ranged identity and caster flags distinct without invented abilities', () => {
    expect(monsterInfo(Kind.Gnoll)!.base.res[0]).toBe(-25);
    const imp = monsterInfo(Kind.Imp)!;
    expect(imp.base.ranged).toBe(true);
    expect(imp.base.caster).toBe(true);
    expect(imp.base.known).toBe(DEFS[Kind.Imp].known);
    expect(imp.base.auto).toBe(DEFS[Kind.Imp].auto);
    expect(imp.base.res[1]).toBe(-30);
    expect(imp.text).toContain('Fire attack');
    const archer = monsterInfo(Kind.Archer)!;
    expect(archer.base.ranged).toBe(true);
    expect(archer.base.caster).toBe(false);
    expect(archer.text).toContain('Physical attack');
    expect(monsterInfo(Kind.Hero)).toBeNull();
    expect(monsterInfo(999)).toBeNull();
  });
});
