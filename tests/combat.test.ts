import { describe, expect, it } from 'vitest';
import { generateMap, type GameMap } from '../src/map';
import { MonsterAi, battleScenario, fightScenario, placeScenario } from '../src/sim/bot';
import { DEFS, Elem, Kind, Ord, strike } from '../src/sim/combat';
import { FP, Sim, replay, type Command } from '../src/sim/sim';

function field(w: number, h: number): GameMap {
  return { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h).fill(200) };
}

/** Two teams on an open field; `at` lists [team, kind, tileX, tileY]. */
function arena(at: [number, number, number, number][], seed = 1, hpMul = 1): Sim {
  const sim = new Sim(field(40, 30), seed, at.map((a) => a[0]), { kinds: at.map((a) => a[1]), combat: true, hpMul });
  at.forEach((a, i) => sim.place(i, a[2], a[3]));
  return sim;
}

function run(sim: Sim, ticks: number, cmds: Record<number, Command[]> = {}): void {
  for (let t = 0; t < ticks; t++) sim.step(cmds[sim.tick + 1] ?? []);
}

describe('damage model', () => {
  it('physical hits roll against defence and lose flat absorption', () => {
    const sim = arena([[0, Kind.Warrior, 5, 5], [1, Kind.Golem, 6, 5]], 1, 100);
    let hits = 0;
    let min = Infinity;
    for (let n = 0; n < 400; n++) {
      const before = sim.cb.hp[1];
      strike(sim, 1, 6, 10, Elem.Physical, DEFS[Kind.Warrior].acc);
      const d = before - sim.cb.hp[1];
      if (d > 0) {
        hits++;
        min = Math.min(min, d);
      }
    }
    // accuracy 8 vs defence 10: 64 percent; absorption 5 turns 6..10 into 1..5
    expect(hits).toBeGreaterThan(400 * 0.5);
    expect(hits).toBeLessThan(400 * 0.78);
    expect(min).toBeGreaterThanOrEqual(1);
  });

  it('schools never miss and are scaled by the five resistances', () => {
    const sim = arena([[0, Kind.Mage, 5, 5], [1, Kind.Imp, 6, 5], [1, Kind.Gnoll, 7, 5], [1, Kind.Golem, 8, 5]], 1, 100);
    const dealt = (t: number, el: number): number => {
      const b = sim.cb.hp[t];
      strike(sim, t, 20, 20, el, 0);
      return b - sim.cb.hp[t];
    };
    expect(dealt(1, Elem.Fire)).toBe(4); // imp resists fire 80
    expect(dealt(1, Elem.Water)).toBe(26); // imp weak to water
    expect(dealt(2, Elem.Fire)).toBe(25); // gnoll weak to fire
    expect(dealt(3, Elem.Earth)).toBe(8); // golem resists earth 60
    expect(dealt(3, Elem.Astral)).toBe(20);
    expect(dealt(3, Elem.Air)).toBe(14);
  });
});

describe('fighting', () => {
  it('melee units close in and the stronger side wins; the dead leave sacks', () => {
    const sim = arena([[0, Kind.Warrior, 5, 5], [0, Kind.Warrior, 5, 6], [1, Kind.Gnoll, 12, 5]]);
    run(sim, 25 * 30);
    expect(sim.cb.hp[2]).toBe(0);
    expect(sim.cb.hp[0] + sim.cb.hp[1]).toBeGreaterThan(0);
    expect(sim.cb.sG.some((g) => g > 0)).toBe(true);
  });

  it('archers shoot projectiles from range', () => {
    const sim = arena([[0, Kind.Archer, 5, 5], [1, Kind.Gnoll, 11, 5]]);
    run(sim, 60);
    expect(sim.cb.pAlive.some((a) => a === 1) || sim.cb.hp[1] < DEFS[Kind.Gnoll].hp).toBe(true);
    run(sim, 25 * 20);
    expect(sim.cb.hp[1]).toBeLessThan(DEFS[Kind.Gnoll].hp);
  });
});

describe('orders', () => {
  it('Still ignores enemies; Hold only strikes what is in reach and never moves', () => {
    const sim = arena([[0, Kind.Warrior, 5, 5], [0, Kind.Warrior, 5, 12], [1, Kind.Gnoll, 8, 5], [1, Kind.Gnoll, 5, 13]]);
    run(sim, 1, { 1: [{ type: 'order', order: 'still', ids: [0] }, { type: 'order', order: 'hold', ids: [1] }] });
    const p0 = sim.x[0];
    const p1 = sim.x[1];
    run(sim, 100);
    expect(sim.x[0]).toBe(p0);
    expect(sim.x[1]).toBe(p1);
    expect(sim.cb.ord[0]).toBe(Ord.Still);
    expect(sim.cb.hp[3]).toBeLessThan(DEFS[Kind.Gnoll].hp); // the gnoll that walked up to the holder got hit
  });

  it('Attack on a target chases it; Attack on a point engages what it meets', () => {
    const sim = arena([[0, Kind.Warrior, 3, 3], [0, Kind.Warrior, 3, 5], [1, Kind.Gnoll, 30, 20], [1, Kind.Gnoll, 20, 4]]);
    run(sim, 1, { 1: [{ type: 'order', order: 'attack', ids: [0], target: 2 }, { type: 'order', order: 'attack', ids: [1], x: 33, y: 5 }] });
    run(sim, 25 * 40);
    expect(sim.cb.hp[2]).toBeLessThan(DEFS[Kind.Gnoll].hp);
    expect(sim.cb.hp[3]).toBe(0); // met on the way
  });

  it('Cast spends mana and hits for fire damage; non-casters ignore it', () => {
    const sim = arena([[0, Kind.Hero, 5, 5], [0, Kind.Warrior, 5, 6], [1, Kind.Gnoll, 10, 5]]);
    const mana = sim.cb.mana[0];
    run(sim, 1, { 1: [{ type: 'order', order: 'cast', ids: [0, 1], target: 2 }] });
    expect(sim.cb.ord[1]).toBe(Ord.Guard);
    run(sim, 60);
    expect(sim.cb.mana[0]).toBeLessThanOrEqual(mana - 8 + 3);
    expect(sim.cb.hp[2]).toBeLessThan(DEFS[Kind.Gnoll].hp);
  });

  it('Defend follows the ward and fights what attacks it', () => {
    const sim = arena([[0, Kind.Warrior, 5, 5], [0, Kind.Warrior, 6, 5], [1, Kind.Gnoll, 12, 5]]);
    run(sim, 1, { 1: [{ type: 'order', order: 'defend', ids: [1], target: 0 }, { type: 'move', ids: [0], x: 15, y: 15 }] });
    run(sim, 25 * 12);
    expect(Math.hypot(sim.x[1] - sim.x[0], sim.y[1] - sim.y[0])).toBeLessThan(6 * FP);
    expect(sim.cb.hp[2]).toBeLessThan(DEFS[Kind.Gnoll].hp);
  });

  it('Retreat runs without fighting back and ends in a guard; Swarm engages far targets', () => {
    const sim = arena([[0, Kind.Warrior, 20, 15], [1, Kind.Gnoll, 22, 15], [0, Kind.Warrior, 2, 2], [1, Kind.Gnoll, 14, 2]]);
    run(sim, 1, { 1: [{ type: 'order', order: 'retreat', ids: [0] }, { type: 'order', order: 'swarm', ids: [2] }] });
    expect(sim.cb.ord[0]).toBe(Ord.Retreat);
    run(sim, 25 * 3);
    expect(sim.x[0] / FP).toBeLessThan(18); // moved away from the gnoll
    run(sim, 25 * 15);
    expect(sim.cb.hp[3]).toBeLessThan(DEFS[Kind.Gnoll].hp); // 12 tiles is beyond guard sight, swarm still went for it
  });

  it('Pickup collects a sack and pays the team', () => {
    const sim = arena([[0, Kind.Warrior, 5, 5], [0, Kind.Warrior, 5, 6], [1, Kind.Gnoll, 7, 5]]);
    run(sim, 25 * 15);
    const s = sim.cb.sG.findIndex((g) => g > 0);
    expect(s).toBeGreaterThanOrEqual(0);
    const gold = sim.cb.sG[s];
    run(sim, 1, { [sim.tick + 1]: [{ type: 'order', order: 'pickup', ids: [0], x: sim.cb.sX[s] / FP, y: sim.cb.sY[s] / FP }] });
    run(sim, 25 * 8);
    expect(sim.cb.sG[s]).toBe(0);
    expect(sim.cb.gold[0]).toBe(gold);
  });

  it('forced stance: a unit told to move walks past enemies without attacking', () => {
    const sim = arena([[0, Kind.Warrior, 5, 5], [1, Kind.Gnoll, 9, 5]]);
    run(sim, 1, { 1: [{ type: 'move', ids: [0], x: 20, y: 5 }] });
    run(sim, 25 * 4);
    expect(sim.cb.hp[1]).toBe(DEFS[Kind.Gnoll].hp);
    expect(sim.x[0] / FP).toBeGreaterThan(12);
  });
});

describe('monster packs', () => {
  it('a pack guards, answers an intruder together, then returns to its post', () => {
    const map = generateMap(7);
    const sc = fightScenario(map);
    const sim = new Sim(map, 3, sc.teams, { kinds: sc.kinds, combat: true });
    placeScenario(sim, sc);
    const ai = new MonsterAi(sc.packs);
    const pack = sc.packs[0];
    const home = pack.ids.map((id) => [sim.x[id], sim.y[id]]);
    // Park the whole player squad next to pack 0 and let them fight.
    const near = pack.ids[0];
    for (let i = 0; i < 12; i++) sim.place(i, Math.floor(sim.x[near] / FP) - 4 + (i % 4), Math.floor(sim.y[near] / FP) + Math.floor(i / 4));
    let hunted = false;
    for (let t = 0; t < 25 * 60; t++) {
      sim.step(ai.commands(sim));
      if (pack.hunting) hunted = true;
    }
    expect(hunted).toBe(true);
    expect(pack.ids.some((id) => sim.cb.hp[id] <= 0)).toBe(true);
    void home;
  });

  it('with the intruder gone, a surviving pack walks back to its post', () => {
    const map = generateMap(7);
    const sc = fightScenario(map);
    const sim = new Sim(map, 3, sc.teams, { kinds: sc.kinds, combat: true });
    placeScenario(sim, sc);
    const ai = new MonsterAi(sc.packs);
    const pack = sc.packs[1];
    const id = pack.ids[0];
    const [hx, hy] = [sim.x[id], sim.y[id]];
    // Pull the pack away as if it had chased someone, then let it be.
    run(sim, 1, { 1: [{ type: 'order', order: 'attack', ids: pack.ids, x: Math.floor(hx / FP) + 6, y: Math.floor(hy / FP) }] });
    pack.hunting = true;
    for (let t = 0; t < 25 * 25; t++) sim.step(ai.commands(sim));
    expect(Math.hypot(sim.x[id] - hx, sim.y[id] - hy)).toBeLessThan(4 * FP);
    expect(pack.hunting).toBe(false);
  });
});

describe('determinism', () => {
  it('replaying the command log gives the same hash, and a snapshot restores exactly', () => {
    const map = generateMap(7);
    const sc = fightScenario(map);
    const make = (): Sim => {
      const s = new Sim(map, 9, sc.teams, { kinds: sc.kinds, combat: true });
      placeScenario(s, sc);
      return s;
    };
    const a = make();
    const ai = new MonsterAi(sc.packs.map((p) => ({ ...p })));
    const mine = [...Array(12).keys()];
    let snap = null as ReturnType<Sim['snapshot']> | null;
    let snapHash = 0;
    for (let t = 0; t < 25 * 40; t++) {
      const cmds = ai.commands(a);
      if (t === 5) cmds.push({ type: 'order', order: 'attack', ids: mine, x: 24, y: map.h - 14 });
      if (t === 400) cmds.push({ type: 'order', order: 'swarm', ids: mine });
      a.step(cmds);
      if (t === 300) {
        snap = a.snapshot();
        snapHash = a.hash();
      }
    }
    const b = make();
    replay(b, a.log, a.tick);
    expect(b.hash()).toBe(a.hash());
    const c = make();
    c.restore(snap!);
    expect(c.hash()).toBe(snapHash);
  });

  it('300 units in battle: sim step stays far below the 1 ms budget', () => {
    const map = generateMap(7);
    const sc = battleScenario(map);
    const sim = new Sim(map, 5, sc.teams, { kinds: sc.kinds, combat: true, hpMul: 8 });
    placeScenario(sim, sc);
    const t0 = [...Array(150).keys()];
    const t1 = t0.map((i) => i + 150);
    sim.step([
      { type: 'order', order: 'swarm', ids: t0, x: 38, y: map.h - 9 },
      { type: 'order', order: 'swarm', ids: t1, x: 10, y: map.h - 9 },
    ]);
    for (let t = 0; t < 100; t++) sim.step();
    const start = performance.now();
    let worst = 0;
    for (let t = 0; t < 250; t++) {
      const s = performance.now();
      sim.step();
      worst = Math.max(worst, performance.now() - s);
    }
    const mean = (performance.now() - start) / 250;
    expect(sim.cb.alive[0] + sim.cb.alive[1]).toBeGreaterThan(100); // still a real battle
    expect(mean).toBeLessThan(1);
    expect(worst).toBeLessThan(8);
  });
});
