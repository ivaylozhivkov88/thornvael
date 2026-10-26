import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/map';
import { Bot, setupSquads } from '../src/sim/bot';
import { FP, Sim, replay, type Command } from '../src/sim/sim';
import { Rng } from '../src/sim/rng';

const map = generateMap(7);
const teams = [...Array(20).fill(0), ...Array(60).fill(1)];

function fresh(): Sim {
  const s = new Sim(map, 123, teams);
  setupSquads(s);
  return s;
}

/** Run a scenario where the player squad gets orders at fixed ticks and the bot plays too. */
function play(ticks: number): Sim {
  const s = fresh();
  const bot = new Bot(1, 10, 99);
  const mine = [...Array(20).keys()];
  for (let t = 0; t < ticks; t++) {
    const cmds = bot.commands(s);
    if (t === 5) cmds.push({ type: 'move', ids: mine, x: 20.5, y: 30.5 });
    if (t === 200) cmds.push({ type: 'move', ids: mine.slice(0, 7), x: 8.5, y: 36.5 });
    s.step(cmds);
  }
  return s;
}

describe('rng', () => {
  it('is reproducible', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    expect([a.nextU32(), a.nextU32()]).toEqual([b.nextU32(), b.nextU32()]);
  });
});

describe('sim', () => {
  it('same seed and commands give the same hash', () => {
    expect(play(400).hash()).toBe(play(400).hash());
  });
  it('replaying the command log on a fresh sim gives the same hash', () => {
    const a = play(400);
    const b = fresh();
    replay(b, a.log, 400);
    expect(b.hash()).toBe(a.hash());
  });
  it('bot and player commands end up in one log', () => {
    const a = play(400);
    const sizes = new Set(a.log.map((l) => l.cmd.ids.length));
    expect(sizes.has(20)).toBe(true); // player order
    expect(sizes.has(10)).toBe(true); // bot squad order
  });
  it('a snapshot restores to an identical hash and keeps running identically', () => {
    const a = play(150);
    const snap = a.snapshot();
    const h = a.hash();
    const b = fresh();
    b.restore(snap);
    expect(b.hash()).toBe(h);
    const move: Command = { type: 'move', ids: [0, 1, 2], x: 12.5, y: 40.5 };
    a.step([move]);
    b.step([move]);
    for (let i = 0; i < 100; i++) {
      a.step();
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
  });
  it('units reach their target and never stand on blocked tiles', () => {
    const s = fresh();
    s.step([{ type: 'move', ids: [0], x: 10.5, y: 38.5 }]);
    for (let i = 0; i < 200; i++) s.step();
    expect(s.moving[0]).toBe(0);
    expect(Math.abs(s.x[0] - Math.round(10.5 * FP))).toBeLessThan(FP * 2); // may stop short when crowded
    const s2 = play(500);
    for (let i = 0; i < s2.count; i++) {
      expect(map.blocked[Math.floor(s2.y[i] / FP) * map.w + Math.floor(s2.x[i] / FP)]).toBe(0);
    }
  });
  it('different command logs diverge', () => {
    const a = fresh();
    const b = fresh();
    a.step([{ type: 'move', ids: [0], x: 10.5, y: 38.5 }]);
    b.step([{ type: 'move', ids: [0], x: 11.5, y: 38.5 }]);
    for (let i = 0; i < 20; i++) {
      a.step();
      b.step();
    }
    expect(a.hash()).not.toBe(b.hash());
  });
});
