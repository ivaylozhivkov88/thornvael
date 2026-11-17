import { describe, expect, it } from 'vitest';
import { BUILT_IN, createMission, missionFromName } from '../src/mission';

const IDS = Object.keys(BUILT_IN).filter((k) => k.startsWith('skirmish-'));

describe('pack-8 skirmish maps', () => {
  it('registers 12 maps', () => expect(IDS.length).toBe(12));
  for (const id of IDS) {
    it(`${id} loads, steps 200 ticks and steps without errors`, () => {
      const g = createMission(missionFromName(id), 7);
      expect(g.sim.cb.hp[0]).toBeGreaterThan(0);
      for (let i = 0; i < 200; i++) g.sim.step(); // unattended hero may die to a close camp: balance, not a load error
      expect(g.loaded.doc.w).toBeGreaterThanOrEqual(48);
    });
  }
});
