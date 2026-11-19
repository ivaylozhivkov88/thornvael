import { describe, expect, it } from 'vitest';
import { loadDoc, validate, type MapDoc } from '../src/mapdoc';
import { createMission } from '../src/mission';
import map4Raw from '../src/missions/map4-obsidian-caldera.map.json';

describe('Macro Map 4: The Obsidian Caldera & Cinder Throne (192x192)', () => {
  it('validates with 0 errors and meets all Map 4 design specifications', () => {
    const errs = validate(map4Raw as unknown as MapDoc);
    expect(errs).toEqual([]);

    const loaded = loadDoc(map4Raw);
    expect(loaded.doc.w).toBe(192);
    expect(loaded.doc.h).toBe(192);
    expect(loaded.doc.name).toBe('The Obsidian Caldera & Cinder Throne');
    expect(loaded.doc.regions).toHaveLength(7);
    expect(loaded.doc.waypoints).toHaveLength(7);
    expect(loaded.doc.shrines).toHaveLength(6);
    expect(loaded.doc.adventureObjects).toHaveLength(4);

    // Ironcamp Forge-Hold Town Hub
    expect(loaded.doc.towns).toHaveLength(1);
    const ironcamp = loaded.doc.towns![0];
    expect(ironcamp.name).toBe('Ironcamp Forge-Hold');
    expect(ironcamp.tavern).toBe(0);
    expect(ironcamp.shop).toBe(1);
    expect(ironcamp.school).toBe(2);
    expect(ironcamp.mercs).toHaveLength(4);
    expect(ironcamp.npcs).toHaveLength(5);

    // 12 Quests (obj.0..obj.11) with declarative coordinates
    for (let i = 0; i < 12; i++) {
      expect(loaded.doc.text[`obj.${i}`]).toBeTruthy();
      expect(loaded.doc.text[`obj.${i}.pos`]).toMatch(/^\d+,\d+$/);
      expect(loaded.doc.text[`obj.${i}.kind`]).toBe(i < 6 ? 'main' : 'side');
    }

    // Threshold Choice variable binding (msg.6.var = 14)
    expect(loaded.doc.text['msg.6.var']).toBe('14');

    // Act IV Final Boss Ashkarath is present as VIP
    const ashkarath = loaded.doc.units.find((u) => u.family === 'ashkarath');
    expect(ashkarath).toBeDefined();
    expect(ashkarath?.vip).toBe(true);
    expect(ashkarath?.tier).toBe(5);
  });

  it('simulates 100 ticks deterministically and resolves both Ending A and Ending B branches', () => {
    const runSim = (branchChoice: 1 | 2) => {
      const m = createMission(loadDoc(map4Raw), 404);
      for (let t = 0; t < 50; t++) {
        m.sim.step(m.ai.commands(m.sim));
      }
      // Set Threshold Choice variable (1 = Crown of Order, 2 = Ember Reckoning) and defeat Group 6 (Ashkarath)
      m.sim.script!.st.vars[14] = branchChoice;
      for (const uid of m.loaded.def.groups[6] ?? []) {
        m.sim.cb.hp[uid] = 0;
      }
      for (let t = 0; t < 50; t++) {
        m.sim.step(m.ai.commands(m.sim));
      }
      return {
        hash: m.sim.hash(),
        status: m.sim.script!.st.status,
        endingSv: m.sim.script!.st.sv[15],
      };
    };

    const endingA1 = runSim(1);
    const endingA2 = runSim(1);
    expect(endingA1.hash).toBe(endingA2.hash);
    expect(endingA1.status).toBe(1);
    expect(endingA1.endingSv).toBe(1); // Ending A: The Crown of Order

    const endingB = runSim(2);
    expect(endingB.status).toBe(1);
    expect(endingB.endingSv).toBe(2); // Ending B: Ember Reckoning
  });
});
