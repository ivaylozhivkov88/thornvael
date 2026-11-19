import { describe, expect, it } from 'vitest';
import { loadDoc, validate, type MapDoc } from '../src/mapdoc';
import { createMission } from '../src/mission';
import map3Raw from '../src/missions/map3-iron-coast.map.json';

describe('Macro Map 3: The Iron Coast & Drowned Citadel (192x192)', () => {
  it('validates with 0 errors and meets all Map 3 design specifications', () => {
    const errs = validate(map3Raw as unknown as MapDoc);
    expect(errs).toEqual([]);

    const loaded = loadDoc(map3Raw);
    expect(loaded.doc.w).toBe(192);
    expect(loaded.doc.h).toBe(192);
    expect(loaded.doc.name).toBe('The Iron Coast & Drowned Citadel');
    expect(loaded.doc.regions).toHaveLength(7);
    expect(loaded.doc.waypoints).toHaveLength(7);
    expect(loaded.doc.shrines).toHaveLength(6);
    expect(loaded.doc.adventureObjects).toHaveLength(4);
    expect(loaded.doc.exits).toHaveLength(1);
    expect(loaded.doc.exits?.[0].targetMap).toBe('map4-obsidian-caldera');

    // Oakhaven Harbor Town Hub
    expect(loaded.doc.towns).toHaveLength(1);
    const oakhaven = loaded.doc.towns![0];
    expect(oakhaven.name).toBe('Oakhaven Harbor');
    expect(oakhaven.tavern).toBe(0);
    expect(oakhaven.shop).toBe(1);
    expect(oakhaven.school).toBe(2);
    expect(oakhaven.mercs).toHaveLength(4);
    expect(oakhaven.npcs).toHaveLength(5);

    // 12 Quests (obj.0..obj.11) with declarative coordinates
    for (let i = 0; i < 12; i++) {
      expect(loaded.doc.text[`obj.${i}`]).toBeTruthy();
      expect(loaded.doc.text[`obj.${i}.pos`]).toMatch(/^\d+,\d+$/);
      expect(loaded.doc.text[`obj.${i}.kind`]).toBe(i < 6 ? 'main' : 'side');
    }

    // Act III Boss Vesperion is present as VIP
    const vesperion = loaded.doc.units.find((u) => u.family === 'vesperion');
    expect(vesperion).toBeDefined();
    expect(vesperion?.vip).toBe(true);
    expect(vesperion?.tier).toBe(5);
  });

  it('simulates 100 ticks deterministically with identical state hash', () => {
    const runSim = () => {
      const m = createMission(loadDoc(map3Raw), 303);
      for (let t = 0; t < 100; t++) {
        const cmds = m.ai.commands(m.sim);
        m.sim.step(cmds);
      }
      return {
        hash: m.sim.hash(),
        gold: m.sim.cb.gold[0],
        sub0: m.sim.script?.st.sub[0],
      };
    };

    const a = runSim();
    const b = runSim();
    expect(a.hash).toBe(b.hash);
    expect(a.gold).toBeGreaterThanOrEqual(600);
    expect(a.sub0).toBe(1);
  });
});
