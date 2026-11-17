import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { Kind } from '../src/sim/combat';
import { createHero, MAX_SPELL_RANK, spellRankOf, cloneHero, hashHero } from '../src/sim/hero';
import { Sim } from '../src/sim/sim';

function field(w: number, h: number): GameMap {
  return { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h).fill(200) };
}
function mk(): Sim {
  const sim = new Sim(field(20, 20), 3, [0, 1], { kinds: [Kind.Hero, Kind.Gnoll], combat: true, hpMul: 100 });
  sim.place(0, 3, 5);
  sim.place(1, 4, 5);
  createHero(sim, 0, 0, false, 1);
  return sim;
}

describe('spell rank', () => {
  it('spends skill points and caps at max', () => {
    const sim = mk();
    const h = sim.hero!;
    h.skillPoints = 12;
    h.known |= 1;
    for (let n = 0; n < 12; n++) sim.step([{ type: 'hero', op: 'rank', spell: 0 }]);
    expect(spellRankOf(h, 0)).toBe(MAX_SPELL_RANK);
    expect(h.skillPoints).toBe(2);
    expect(cloneHero(h)!.spellRank![0]).toBe(MAX_SPELL_RANK);
    const a: number[] = [];
    hashHero(h, (v) => a.push(v));
    expect(a).toContain(MAX_SPELL_RANK);
  });
  it('refuses unknown spells and zero points', () => {
    const sim = mk();
    const h = sim.hero!;
    h.skillPoints = 1;
    h.known = 0;
    sim.step([{ type: 'hero', op: 'rank', spell: 5 }]);
    expect(spellRankOf(h, 5)).toBe(0);
    h.known = 1;
    h.skillPoints = 0;
    sim.step([{ type: 'hero', op: 'rank', spell: 0 }]);
    expect(spellRankOf(h, 0)).toBe(0);
  });
});

describe('spell prerequisites and synergy', () => {
  it('needs the prerequisite at rank 1; synergies add power', async () => {
    const { spellSynergy } = await import('../src/sim/hero');
    const sim = mk();
    const h = sim.hero!;
    h.skillPoints = 5;
    h.known |= 0b11;
    sim.step([{ type: 'hero', op: 'rank', spell: 1 }]);
    expect(spellRankOf(h, 1)).toBe(0); // Fireball needs Fire Bolt rank 1
    sim.step([{ type: 'hero', op: 'rank', spell: 0 }, { type: 'hero', op: 'rank', spell: 1 }]);
    expect(spellRankOf(h, 1)).toBe(1);
    expect(spellSynergy(h, 0)).toBe(4); // Fire Bolt gains from Fireball rank 1
    expect(spellSynergy(h, 1)).toBe(4);
  });
});
