import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { Kind } from '../src/sim/combat';
import { createHero, heroKnowsSpell, learnSpell, spellForHero } from '../src/sim/hero';
import { Sim } from '../src/sim/sim';
import { MAX_SPELLS, SPELLS, maskHas } from '../src/sim/spelldata';
import { castSpell } from '../src/sim/spells';

const field = (w: number, h: number): GameMap => ({ w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h).fill(200) });
const sid = (name: string): number => SPELLS.findIndex((s) => s.name === name);

function mk(cls: number): Sim {
  const sim = new Sim(field(20, 20), 5, [0, 1, 1], { kinds: [Kind.Hero, Kind.Gnoll, Kind.Gnoll], combat: true, hpMul: 100 });
  sim.place(0, 3, 5);
  sim.place(1, 4, 5);
  sim.place(2, 5, 5);
  createHero(sim, 0, cls, false, 1);
  return sim;
}

describe('widened spell mask', () => {
  it('maskHas reads ids above 31 from the high words', () => {
    expect(maskHas(0, [0b100, 0], 0, 34)).toBe(true);
    expect(maskHas(0, [0b100, 0], 0, 33)).toBe(false);
    expect(maskHas(1 << 5, [0, 0], 0, 5)).toBe(true);
    expect(MAX_SPELLS).toBeGreaterThan(32);
  });
  it('learns a high id, keeps it across clone, and refuses the wrong class', () => {
    const sim = mk(0);
    const h = sim.hero!;
    const cleave = sid('Cleave Arc');
    const cinder = sid('Cinder Lance');
    expect(cleave).toBeGreaterThanOrEqual(32);
    expect(spellForHero(h, cleave)).toBe(true);
    expect(spellForHero(h, cinder)).toBe(false);
    learnSpell(h, cleave);
    expect(heroKnowsSpell(h, cleave)).toBe(true);
    expect(heroKnowsSpell(h, cinder)).toBe(false);
  });
});

describe('class skills in the sim', () => {
  it('Cleave Arc hits up to 3 foes and the run is deterministic', () => {
    const run = (): { hash: number; hp: number[] } => {
      const sim = mk(0);
      const c = sid('Cleave Arc');
      sim.cb.mana[0] = 100;
      castSpell(sim, 0, c, 1, 0, 0);
      for (let n = 0; n < 40; n++) sim.step([]);
      return { hash: sim.hash(), hp: [sim.cb.hp[1], sim.cb.hp[2]] };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
  });
  it('Grit Through Pain heals the caster; Whirlwind Maul spends mana', () => {
    const sim = mk(0);
    const g = sid('Grit Through Pain');
    sim.cb.hp[0] = 10;
    sim.cb.mana[0] = 100;
    castSpell(sim, 0, g, -1, 0, 0);
    expect(sim.cb.hp[0]).toBeGreaterThanOrEqual(10 + 28);
    const w = sid('Whirlwind Maul');
    const m = sim.cb.mana[0];
    castSpell(sim, 0, w, -1, 0, 0);
    expect(sim.cb.mana[0]).toBe(m - SPELLS[w].cost);
  });
  it('Executioner\'s Blow carries the execute bonus in val', () => {
    expect(SPELLS[sid('Executioner\'s Blow')].val).toBe(50);
    expect(SPELLS[sid('Executioner\'s Blow')].phys).toBe(true);
  });
});

describe('save compatibility', () => {
  it('snapshot round-trips knownHi and an old snapshot without it restores to zero', () => {
    const sim = mk(0);
    sim.cb.knownHi[0] = 0b1010;
    const snap = sim.snapshot();
    const sim2 = mk(0);
    sim2.restore(structuredClone(snap));
    expect(sim2.cb.knownHi[0]).toBe(0b1010);
    expect(sim2.hash()).toBe(sim.hash());
    const old = structuredClone(snap);
    delete (old.cb as { knownHi?: Uint32Array }).knownHi;
    sim2.restore(old);
    expect(sim2.cb.knownHi[0]).toBe(0);
  });
});
