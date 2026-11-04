import { describe, expect, it } from 'vitest';
import { skillProgress } from '../src/hero-presentation';
import type { GameMap } from '../src/map';
import { Kind } from '../src/sim/combat';
import { createHero, heroUse } from '../src/sim/hero';
import { Sim } from '../src/sim/sim';

function world(): Sim {
  const w = 16, h = 16;
  const map: GameMap = { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h).fill(200) };
  const sim = new Sim(map, 3, [0], { kinds: [Kind.Hero], combat: true });
  sim.place(0, 5, 5);
  createHero(sim, 0, 0, false, 1);
  return sim;
}

describe('hero skill presentation follows simulation progression', () => {
  it('predicts the exact next level and resets only when the sim levels each skill', () => {
    const sim = world();
    const h = sim.hero!;
    for (let skill = 0; skill < 3; skill++) {
      while (h.skill[skill] < 10) {
        const before = structuredClone(h);
        const progress = skillProgress(h, skill);
        expect(h).toEqual(before); // Rendering must not consume uses or level a skill.
        expect(progress.needed).not.toBeNull();
        for (let n = 1; n < progress.remaining; n++) heroUse(sim, skill);
        expect(h.skill[skill]).toBe(progress.level);
        expect(skillProgress(h, skill).remaining).toBe(1);
        heroUse(sim, skill);
        expect(h.skill[skill]).toBe(progress.level + 1);
        expect(skillProgress(h, skill).used).toBe(0);
      }
    }
  });

  it('has no next level at the cap, including a restored save with leftover uses', () => {
    const sim = world();
    const h = sim.hero!;
    h.skill[1] = 10;
    h.use[1] = 7;
    const before = structuredClone(h);
    expect(skillProgress(h, 1)).toMatchObject({ needed: null, remaining: 0 });
    heroUse(sim, 1);
    expect(h).toEqual(before);
    expect(skillProgress(h, 1)).toMatchObject({ needed: null, remaining: 0 });
  });
});
