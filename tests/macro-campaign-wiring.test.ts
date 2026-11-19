import { describe, expect, it } from 'vitest';
import { validate } from '../src/mapdoc';
import { BUILT_IN, createMission, missionFromName } from '../src/mission';

const MACRO_MAP_IDS = [
  'map1-border-fords',
  'map2-redmarsh-wastes',
  'map3-iron-coast',
  'map4-obsidian-caldera',
] as const;

describe('Macro Campaign Wiring (Maps 1–4 in BUILT_IN & missionFromName)', () => {
  it('registers all four 192x192 macro maps in BUILT_IN and loads them via missionFromName', () => {
    for (const id of MACRO_MAP_IDS) {
      expect(BUILT_IN[id], `${id} missing from BUILT_IN`).toBeDefined();
      const loaded = missionFromName(id);
      expect(validate(loaded.doc), `${id} validation errors`).toEqual([]);
      expect(loaded.doc.w).toBe(192);
      expect(loaded.doc.h).toBe(192);
      expect(loaded.doc.regions).toHaveLength(7);
      expect(loaded.doc.waypoints).toHaveLength(7);
      expect(loaded.doc.shrines).toHaveLength(6);
      expect(loaded.doc.adventureObjects).toHaveLength(4);
      expect(loaded.doc.towns).toHaveLength(1);
      for (let i = 0; i < 12; i++) {
        expect(loaded.doc.text[`obj.${i}`]).toBeTruthy();
        expect(loaded.doc.text[`obj.${i}.pos`]).toMatch(/^\d+,\d+$/);
        expect(loaded.doc.text[`obj.${i}.kind`]).toBe(i < 6 ? 'main' : 'side');
      }
    }
  });

  it('chains map exits cleanly from Map 1 -> Map 2 -> Map 3 -> Map 4', () => {
    const m1 = missionFromName('map1-border-fords');
    const m2 = missionFromName('map2-redmarsh-wastes');
    const m3 = missionFromName('map3-iron-coast');
    const m4 = missionFromName('map4-obsidian-caldera');

    expect(m1.doc.exits?.[0]?.targetMap).toBe('map2-redmarsh-wastes');
    expect(m2.doc.exits?.[0]?.targetMap).toBe('map3-iron-coast');
    expect(m3.doc.exits?.[0]?.targetMap).toBe('map4-obsidian-caldera');
    expect(m4.doc.exits ?? []).toHaveLength(0);

    for (const exitTarget of [m1.doc.exits![0].targetMap, m2.doc.exits![0].targetMap, m3.doc.exits![0].targetMap]) {
      expect(() => missionFromName(exitTarget)).not.toThrow();
    }
  });

  it('creates and steps each macro map deterministically through createMission', () => {
    for (let idx = 0; idx < MACRO_MAP_IDS.length; idx++) {
      const id = MACRO_MAP_IDS[idx];
      const run = () => {
        const g = createMission(missionFromName(id), 100 + idx);
        for (let t = 0; t < 10; t++) {
          g.sim.step(g.ai.commands(g.sim));
        }
        return g.sim.hash();
      };
      expect(run()).toBe(run());
    }
  });
});
