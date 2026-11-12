import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/map';
import { blankDoc, loadDoc, validate } from '../src/mapdoc';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { FP, Sim } from '../src/sim/sim';
import { St } from '../src/sim/spelldata';

describe('Interactive Tactical World Shrines (G2)', () => {
  it('validates shrine definitions on MapDoc', () => {
    const doc = blankDoc(32, 32, 'Shrine test');
    doc.shrines = [
      { x: 5, y: 5, kind: 'healing', cooldown: 300 },
      { x: 10, y: 10, kind: 'combat' },
    ];
    expect(validate(doc)).toEqual([]);

    const badDoc = blankDoc(32, 32, 'Bad shrine');
    badDoc.shrines = [
      { x: -1, y: 5, kind: 'healing' },
      { x: 5, y: 5, kind: 'unknown_shrine' as any, cooldown: -10 },
    ];
    const errs = validate(badDoc);
    expect(errs).toContain('Shrine 0: outside the map.');
    expect(errs).toContain('Shrine 1: unknown kind "unknown_shrine".');
    expect(errs).toContain('Shrine 1: cooldown must be a positive integer.');
  });

  it('triggers all six shrine effects when team 0 walks near', () => {
    const map = generateMap(1);
    const kinds = ['healing', 'mana', 'combat', 'armor', 'haste', 'ward'] as const;
    const shrines = kinds.map((kind, idx) => ({ x: 6 + idx * 4, y: 6, kind, cooldown: 100 }));

    const sim = new Sim(map, 1, [0], { combat: true, kinds: [Kind.Hero] });
    createHero(sim, 0, 0, false, 1);
    sim.attachShrines(shrines);
    expect(sim.shrines.length).toBe(6);
    expect(sim.shrineCd.length).toBe(6);

    // 1. Healing shrine
    sim.cb.hp[0] = 50;
    sim.place(0, 6, 6);
    sim.step();
    expect(sim.cb.hp[0]).toBeGreaterThan(50);
    expect(sim.shrineCd[0]).toBe(100);

    // 2. Mana shrine
    sim.cb.mana[0] = 10;
    sim.place(0, 10, 6);
    sim.step();
    expect(sim.cb.mana[0]).toBeGreaterThan(10);
    expect(sim.shrineCd[1]).toBe(100);

    // 3. Combat shrine (Bless)
    sim.place(0, 14, 6);
    sim.step();
    expect((sim.cb.stMask[0] & (1 << St.Bless)) !== 0).toBe(true);
    expect(sim.shrineCd[2]).toBe(100);

    // 4. Armor shrine (Shield)
    sim.place(0, 18, 6);
    sim.step();
    expect((sim.cb.stMask[0] & (1 << St.Shield)) !== 0).toBe(true);
    expect(sim.shrineCd[3]).toBe(100);

    // 5. Haste shrine
    sim.place(0, 22, 6);
    sim.step();
    expect((sim.cb.stMask[0] & (1 << St.Haste)) !== 0).toBe(true);
    expect(sim.shrineCd[4]).toBe(100);

    // 6. Ward shrine (Bless + Shield + heal)
    sim.cb.hp[0] = 40;
    sim.place(0, 26, 6);
    sim.step();
    expect((sim.cb.stMask[0] & (1 << St.Bless)) !== 0).toBe(true);
    expect((sim.cb.stMask[0] & (1 << St.Shield)) !== 0).toBe(true);
    expect(sim.cb.hp[0]).toBeGreaterThan(40);
    expect(sim.shrineCd[5]).toBe(100);
  });

  it('respects cooldown and counts down each tick', () => {
    const map = generateMap(1);
    const sim = new Sim(map, 1, [0], { combat: true, kinds: [Kind.Hero] });
    createHero(sim, 0, 0, false, 1);
    sim.attachShrines([{ x: 5, y: 5, kind: 'healing', cooldown: 10 }]);
    sim.cb.hp[0] = 30;
    sim.place(0, 5, 5);

    sim.step();
    expect(sim.shrineCd[0]).toBe(10);
    const hpAfter1 = sim.cb.hp[0];

    // step 5 ticks: shrine on cd, should not re-trigger
    sim.cb.hp[0] = 30;
    for (let t = 0; t < 5; t++) sim.step();
    expect(sim.shrineCd[0]).toBe(5);
    expect(sim.cb.hp[0]).toBe(30);

    // step 6 more ticks: cd reaches 0 and re-triggers
    for (let t = 0; t < 6; t++) sim.step();
    expect(sim.cb.hp[0]).toBeGreaterThan(30);
  });

  it('preserves replay determinism and snapshot / restore with shrines', () => {
    const map = generateMap(1);
    const defs = [
      { x: 5, y: 5, kind: 'combat' as const, cooldown: 50 },
      { x: 12, y: 12, kind: 'mana' as const, cooldown: 50 },
    ];
    const a = new Sim(map, 7, [0, 1], { combat: true, kinds: [Kind.Hero, Kind.Gnoll] });
    const b = new Sim(map, 7, [0, 1], { combat: true, kinds: [Kind.Hero, Kind.Gnoll] });
    createHero(a, 0, 0, false, 1);
    createHero(b, 0, 0, false, 1);
    a.attachShrines(defs);
    b.attachShrines(defs);
    a.place(0, 5, 5);
    b.place(0, 5, 5);
    a.place(1, 15, 15);
    b.place(1, 15, 15);
    a.settle();
    b.settle();

    for (let t = 0; t < 15; t++) {
      a.step();
      b.step();
    }
    expect(a.hash()).toBe(b.hash());

    const snap = a.snapshot();
    for (let t = 0; t < 20; t++) a.step();
    const futureHash = a.hash();

    a.restore(snap);
    for (let t = 0; t < 20; t++) a.step();
    expect(a.hash()).toBe(futureHash);
  });
});
