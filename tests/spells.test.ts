import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { DEFS, Kind, Ord } from '../src/sim/combat';
import { FP, Sim, replay, type Command } from '../src/sim/sim';
import { SPELLS, St, Tk } from '../src/sim/spelldata';
import { addStatus, hasStatus } from '../src/sim/spells';

function field(w: number, h: number): GameMap {
  return { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h).fill(200) };
}
function arena(at: [number, number, number, number][], seed = 1, hpMul = 1): Sim {
  const sim = new Sim(field(40, 30), seed, at.map((a) => a[0]), { kinds: at.map((a) => a[1]), combat: true, hpMul });
  at.forEach((a, i) => sim.place(i, a[2], a[3]));
  return sim;
}
function run(sim: Sim, ticks: number, cmds: Record<number, Command[]> = {}): void {
  for (let t = 0; t < ticks; t++) sim.step(cmds[sim.tick + 1] ?? []);
}
const id = (name: string): number => SPELLS.findIndex((s) => s.name === name);
const cast = (ids: number[], spell: string, extra: Partial<Extract<Command, { type: 'order' }>> = {}): Command => ({ type: 'order', order: 'cast', ids, spell: id(spell), ...extra });
const still = (sim: Sim, ...ids: number[]): void => ids.forEach((i) => (sim.cb.ord[i] = Ord.Still)); // targets that do not fight back

describe('spell table', () => {
  it('has 24 spells, five schools and all five targeting kinds', () => {
    expect(SPELLS.length).toBe(24);
    expect(new Set(SPELLS.map((s) => s.school))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(new Set(SPELLS.map((s) => s.tk))).toEqual(new Set([Tk.Foe, Tk.Ally, Tk.Ground, Tk.Multi, Tk.Self, Tk.Corpse]));
    for (const s of SPELLS) expect(s.cd).toBeLessThanOrEqual(255);
  });
  it('only the right units know a spell', () => {
    const sim = arena([[0, Kind.Warrior, 5, 5], [0, Kind.Mage, 5, 6], [0, Kind.Hero, 5, 7], [1, Kind.Gnoll, 9, 6]]);
    run(sim, 1, { 1: [cast([0, 1, 2], 'Lightning', { target: 3 })] });
    run(sim, 30);
    expect(sim.cb.mana[0]).toBe(0); // a warrior knows nothing
    expect(sim.cb.mana[1]).toBe(DEFS[Kind.Mage].mana); // a mage does not know Lightning
    expect(sim.cb.mana[2]).toBeLessThan(DEFS[Kind.Hero].mana);
  });
});

describe('homing and statuses', () => {
  it('Frost Bolt hurts, slows and the slow runs out', () => {
    const sim = arena([[0, Kind.Hero, 5, 5], [1, Kind.Gnoll, 10, 5]], 1, 5);
    still(sim, 1);
    run(sim, 1, { 1: [cast([0], 'Frost Bolt', { target: 1 })] });
    run(sim, 40);
    expect(sim.cb.hp[1]).toBeLessThan(sim.cb.hpMax[1]);
    expect(hasStatus(sim, 1, St.Slow)).toBe(true);
    expect(sim.cb.mana[0]).toBeLessThanOrEqual(DEFS[Kind.Hero].mana - 8 + 2);
    run(sim, 25 * 9);
    expect(hasStatus(sim, 1, St.Slow)).toBe(false);
  });

  it('a slowed unit walks slower and a hasted one faster', () => {
    const sim = arena([[0, Kind.Warrior, 2, 5], [0, Kind.Warrior, 2, 8], [0, Kind.Warrior, 2, 11]]);
    addStatus(sim, 0, St.Slow, 500, 0);
    addStatus(sim, 1, St.Haste, 500, 0);
    run(sim, 1, { 1: [{ type: 'move', ids: [0, 1, 2], x: 30, y: 8, loose: true }] });
    run(sim, 50);
    expect(sim.x[0]).toBeLessThan(sim.x[2]);
    expect(sim.x[1]).toBeGreaterThan(sim.x[2]);
  });

  it('stacking: poison stacks to three, haste and slow cancel, stone ignores curses, bless and shield do not stack', () => {
    const sim = arena([[0, Kind.Warrior, 5, 5], [1, Kind.Gnoll, 9, 5]]);
    for (let n = 0; n < 5; n++) addStatus(sim, 1, St.Poison, 100, 1);
    expect(sim.cb.stV[1 * 8 + St.Poison]).toBe(3);
    addStatus(sim, 0, St.Haste, 100, 0);
    addStatus(sim, 0, St.Slow, 100, 0);
    expect(hasStatus(sim, 0, St.Haste)).toBe(false);
    expect(hasStatus(sim, 0, St.Slow)).toBe(false); // they cancelled out
    addStatus(sim, 0, St.Slow, 100, 0);
    expect(hasStatus(sim, 0, St.Slow)).toBe(true);
    addStatus(sim, 0, St.Haste, 100, 0);
    expect(hasStatus(sim, 0, St.Slow)).toBe(false);
    addStatus(sim, 1, St.Stone, 100, 0);
    addStatus(sim, 1, St.Weaken, 100, 0);
    addStatus(sim, 1, St.Burn, 100, 2);
    expect(hasStatus(sim, 1, St.Weaken)).toBe(false);
    expect(hasStatus(sim, 1, St.Burn)).toBe(false);
    addStatus(sim, 0, St.Bless, 100, 0);
    addStatus(sim, 0, St.Bless, 400, 0);
    expect(sim.cb.stT[0 * 8 + St.Bless]).toBe(400); // refresh to the longer timer, never stronger
    addStatus(sim, 0, St.Shield, 100, 50);
    addStatus(sim, 0, St.Shield, 100, 20);
    expect(sim.cb.stV[0 * 8 + St.Shield]).toBe(50);
  });

  it('poison hurts once a second, burn too, and every status expires', () => {
    const sim = arena([[0, Kind.Warrior, 5, 5], [1, Kind.Gnoll, 30, 25]], 1, 10);
    addStatus(sim, 1, St.Poison, 75, 1);
    addStatus(sim, 1, St.Poison, 75, 1);
    addStatus(sim, 1, St.Burn, 50, 2);
    still(sim, 1);
    const before = sim.cb.hp[1];
    run(sim, 80);
    expect(before - sim.cb.hp[1]).toBeGreaterThanOrEqual(5);
    expect(sim.cb.stMask[1]).toBe(0);
  });

  it('Stone Curse freezes a unit and halves what it takes; it wears off', () => {
    const sim = arena([[0, Kind.Hero, 5, 5], [1, Kind.Gnoll, 10, 5]], 1, 5);
    run(sim, 1, { 1: [cast([0], 'Stone Curse', { target: 1 })] });
    run(sim, 40);
    expect(hasStatus(sim, 1, St.Stone)).toBe(true);
    const x = sim.x[1];
    run(sim, 20);
    expect(sim.x[1]).toBe(x);
    run(sim, 25 * 6);
    expect(hasStatus(sim, 1, St.Stone)).toBe(false);
  });

  it('Bless and Weaken change melee damage', () => {
    const dmg = (st: number): number => {
      const sim = arena([[0, Kind.Warrior, 5, 5], [1, Kind.Golem, 6, 5]], 3, 1000);
      if (st >= 0) addStatus(sim, 0, st, 2000, 0);
      sim.cb.ord[1] = Ord.Still;
      run(sim, 25 * 20);
      return sim.cb.hpMax[1] - sim.cb.hp[1];
    };
    const plain = dmg(-1);
    expect(dmg(St.Bless)).toBeGreaterThan(plain);
    expect(dmg(St.Weaken)).toBeLessThan(plain);
  });
});

describe('area, multi, self, corpse', () => {
  it('Fireball hits every enemy in its radius and nobody outside or on your side', () => {
    const sim = arena([[0, Kind.Hero, 5, 5], [0, Kind.Warrior, 11, 5], [1, Kind.Golem, 11, 6], [1, Kind.Golem, 12, 5], [1, Kind.Golem, 11, 4], [1, Kind.Golem, 11, 12]], 1, 5);
    still(sim, 2, 3, 4, 5);
    run(sim, 1, { 1: [cast([0], 'Fireball', { x: 11.5, y: 5.5 })] });
    run(sim, 40);
    for (const t of [2, 3, 4]) expect(sim.cb.hp[t]).toBeLessThan(sim.cb.hpMax[t]);
    expect(sim.cb.hp[5]).toBe(sim.cb.hpMax[5]);
    expect(sim.cb.hp[1]).toBe(sim.cb.hpMax[1]);
    expect(sim.cb.mana[0]).toBeLessThan(DEFS[Kind.Hero].mana);
  });

  it('Healing Rain heals allies in the area', () => {
    const sim = arena([[0, Kind.Hero, 5, 5], [0, Kind.Warrior, 8, 5], [0, Kind.Warrior, 8, 6], [1, Kind.Gnoll, 30, 25]]);
    sim.cb.hp[1] = 10;
    sim.cb.hp[2] = 10;
    run(sim, 1, { 1: [cast([0], 'Healing Rain', { x: 8.5, y: 5.5 })] });
    run(sim, 30);
    expect(sim.cb.hp[1]).toBeGreaterThan(10);
    expect(sim.cb.hp[2]).toBeGreaterThan(10);
  });

  it('Chain Lightning strikes the target and up to three neighbours', () => {
    const sim = arena([[0, Kind.Hero, 5, 5], [1, Kind.Golem, 11, 5], [1, Kind.Golem, 12, 5], [1, Kind.Golem, 11, 6], [1, Kind.Golem, 12, 6], [1, Kind.Golem, 13, 6]], 1, 5);
    still(sim, 1, 2, 3, 4, 5);
    run(sim, 1, { 1: [cast([0], 'Chain Lightning', { target: 1 })] });
    run(sim, 90);
    const hit = [1, 2, 3, 4, 5].filter((t) => sim.cb.hp[t] < sim.cb.hpMax[t]).length;
    expect(hit).toBe(4);
  });

  it('Wind Ward shields the caster and the shield soaks damage, then breaks; Meditation restores mana', () => {
    const sim = arena([[0, Kind.Hero, 5, 5], [1, Kind.Gnoll, 30, 25]]);
    run(sim, 1, { 1: [cast([0], 'Wind Ward')] });
    run(sim, 2);
    expect(sim.cb.stV[0 * 8 + St.Shield]).toBe(35);
    sim.cb.mana[0] = 10;
    const hp = sim.cb.hp[0];
    run(sim, 1, { [sim.tick + 1]: [cast([0], 'Meditation')] });
    run(sim, 40);
    expect(sim.cb.mana[0]).toBeGreaterThanOrEqual(21);
    expect(sim.cb.hp[0]).toBe(hp);
  });

  it('Resurrect raises a fallen friend; Corpse Burst consumes a body and hurts enemies near it; bodies rot', () => {
    const sim = arena([[0, Kind.Hero, 5, 5], [0, Kind.Warrior, 8, 5], [1, Kind.Golem, 9, 6], [1, Kind.Gnoll, 30, 25]], 1, 5);
    still(sim, 2, 3);
    run(sim, 1);
    const cb = sim.cb;
    cb.hp[1] = 0;
    cb.corp[1] = 1500;
    cb.alive[0]--;
    cb.ord[1] = Ord.Still;
    run(sim, 1, { [sim.tick + 1]: [cast([0], 'Resurrect', { target: 1 })] });
    run(sim, 20);
    expect(cb.hp[1]).toBe(Math.floor((cb.hpMax[1] * 40) / 100));
    expect(cb.alive[0]).toBe(2);
    // burst a second body next to the golem
    cb.hp[1] = 0;
    cb.corp[1] = 1500;
    cb.alive[0]--;
    sim.x[1] = sim.x[2];
    sim.y[1] = sim.y[2];
    const g = cb.hp[2];
    run(sim, 1, { [sim.tick + 1]: [cast([0], 'Corpse Burst', { target: 1 })] });
    run(sim, 100);
    expect(cb.corp[1]).toBe(0);
    expect(cb.hp[2]).toBeLessThan(g);
    // an old body cannot be raised
    cb.hp[1] = 0;
    cb.corp[1] = 3;
    run(sim, 5);
    expect(cb.corp[1]).toBe(0);
  });

  it('a spell without mana does not cast and says so', () => {
    const sim = arena([[0, Kind.Hero, 5, 5], [1, Kind.Gnoll, 10, 5]]);
    sim.cb.mana[0] = 3;
    sim.cb.recordFx = true;
    run(sim, 1, { 1: [cast([0], 'Lightning', { target: 1 })] });
    run(sim, 20);
    expect(sim.cb.mana[0]).toBe(3);
    expect(sim.cb.pS.every((v) => v === 0)).toBe(true);
  });
});

describe('autocast', () => {
  it('a mage with Frost Bolt on autocast shoots enemies in range by itself; switching it off stops it', () => {
    const sim = arena([[0, Kind.Mage, 5, 5], [1, Kind.Golem, 10, 5]], 1, 5);
    still(sim, 1);
    run(sim, 1, { 1: [{ type: 'autocast', ids: [0], spell: id('Frost Bolt') }] });
    run(sim, 100);
    expect(sim.cb.mana[0]).toBeLessThan(DEFS[Kind.Mage].mana);
    expect(hasStatus(sim, 1, St.Slow)).toBe(true);
    run(sim, 1, { [sim.tick + 1]: [{ type: 'autocast', ids: [0], spell: -1 }] });
    expect(sim.cb.auto[0]).toBe(0);
  });

  it('autocast Healing mends a hurt friend, and a warrior cannot switch autocast on', () => {
    const sim = arena([[0, Kind.Hero, 5, 5], [0, Kind.Warrior, 7, 5], [1, Kind.Gnoll, 30, 25]]);
    sim.cb.hp[1] = 12;
    run(sim, 1, { 1: [{ type: 'autocast', ids: [0, 1], spell: id('Healing') }] });
    expect(sim.cb.auto[1]).toBe(0);
    run(sim, 60);
    expect(sim.cb.hp[1]).toBeGreaterThan(12);
  });

  it('imps ignite by default', () => {
    const sim = arena([[0, Kind.Warrior, 5, 5], [1, Kind.Imp, 9, 5]], 2, 10);
    run(sim, 100);
    expect(sim.cb.mana[1]).toBeLessThan(DEFS[Kind.Imp].mana);
  });
});

describe('determinism', () => {
  it('replay and snapshot restore give identical hashes with spells in flight', () => {
    const mk = (): Sim => arena([[0, Kind.Hero, 5, 5], [0, Kind.Mage, 5, 7], [0, Kind.Warrior, 6, 6], [1, Kind.Golem, 11, 5], [1, Kind.Imp, 12, 7], [1, Kind.Gnoll, 12, 5]], 4, 4);
    const cmds: Record<number, Command[]> = {
      2: [cast([0], 'Fireball', { x: 11.5, y: 5.5 }), { type: 'autocast', ids: [1], spell: id('Frost Bolt') }],
      30: [cast([0], 'Chain Lightning', { target: 3 })],
      60: [cast([0], 'Poison Cloud', { x: 12, y: 6 }), cast([0], 'Stone Curse', { target: 3 })],
    };
    const a = mk();
    run(a, 120, cmds);
    const snap = a.snapshot();
    run(a, 120);
    const b = mk();
    run(b, 120, cmds);
    b.restore(b.snapshot());
    run(b, 120);
    expect(b.hash()).toBe(a.hash());
    const c = mk();
    c.restore(snap);
    run(c, 120);
    expect(c.hash()).toBe(a.hash());
    const r = mk();
    replay(r, a.log, 240);
    expect(r.hash()).toBe(a.hash());
  });
});

describe('performance', () => {
  it('a 300-unit battle full of casts and statuses still steps well under a millisecond on average', async () => {
    const { generateMap } = await import('../src/map');
    const { battleScenario, placeScenario } = await import('../src/sim/bot');
    const map = generateMap(7);
    const sc = battleScenario(map);
    const sim = new Sim(map, 1, sc.teams, { kinds: sc.kinds, combat: true, hpMul: 8 });
    placeScenario(sim, sc);
    const mages = sc.kinds.map((k, i) => (k === Kind.Mage ? i : -1)).filter((i) => i >= 0);
    const all = [...Array(150).keys()];
    const swarm = (ids: number[], x: number): Command => ({ type: 'order', order: 'swarm', ids, x, y: map.h - 9 });
    sim.step([swarm(all, 38), swarm(all.map((i) => i + 150), 10), { type: 'autocast', ids: mages, spell: id('Fireball') }]);
    let sum = 0;
    let worst = 0;
    const N = 25 * 40;
    for (let t = 0; t < N; t++) {
      const t0 = performance.now();
      sim.step();
      const d = performance.now() - t0;
      sum += d;
      worst = Math.max(worst, d);
    }
    expect(sum / N).toBeLessThan(1);
    expect(worst).toBeLessThan(12);
    expect(sim.cb.mana.some((m, i) => sc.kinds[i] === Kind.Mage && m < DEFS[Kind.Mage].mana)).toBe(true);
  });
});
