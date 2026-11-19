import { describe, expect, it } from 'vitest';
import map2Raw from '../src/missions/map2-redmarsh-wastes.map.json';
import { loadDoc, migrate, validate } from '../src/mapdoc';
import { createMission } from '../src/mission';
import { createHero } from '../src/sim/hero';
import type { Command } from '../src/sim/sim';

describe('Macro Map 2: The Redmarsh Wastes & Ironheart Cisterns (192x192)', () => {
  it('validates with 0 errors and contains Redmarsh Outpost hub, 7 regions, 7 waypoints, 6 shrines, 4 Super-Uniques, Boss Gorrathul, and 12 quests', () => {
    const doc = migrate(map2Raw);
    expect(validate(doc)).toEqual([]);
    expect(doc.w).toBe(192);
    expect(doc.h).toBe(192);
    expect(doc.regions.length).toBe(7);
    expect(doc.waypoints?.length).toBe(7);
    expect(doc.shrines?.length).toBe(6);
    expect(doc.adventureObjects?.length).toBe(4);
    expect(doc.exits?.length).toBe(1);
    expect(doc.towns?.length).toBe(1);
    expect(doc.towns?.[0].mercs?.length).toBe(4);
    expect(doc.towns?.[0].npcs?.length).toBe(5);

    const families = new Set(doc.units.map((u) => u.family).filter(Boolean));
    expect(families.has('crimson-prowler-zara')).toBe(true);
    expect(families.has('arc-carapace-vekor')).toBe(true);
    expect(families.has('venomscale-ssorath')).toBe(true);
    expect(families.has('ash-embalmer-khepri')).toBe(true);
    expect(families.has('gorrathul')).toBe(true);

    for (let i = 0; i < 12; i++) {
      expect(doc.text[`obj.${i}`]).toBeDefined();
      expect(doc.text[`obj.${i}.pos`]).toMatch(/^\d+,\d+$/);
      expect(doc.text[`obj.${i}.kind`]).toMatch(/^(main|side)$/);
    }
  });

  it('simulates 100 ticks deterministically and fires main and side quest triggers cleanly', () => {
    const loaded1 = loadDoc(map2Raw);
    const g1 = createMission(loaded1, 202);
    createHero(g1.sim, 0, 0, false, 1);

    const loaded2 = loadDoc(map2Raw);
    const g2 = createMission(loaded2, 202);
    createHero(g2.sim, 0, 0, false, 1);

    for (let t = 0; t < 100; t++) {
      const c1: Command[] = g1.ai.commands(g1.sim);
      const c2: Command[] = g2.ai.commands(g2.sim);
      g1.sim.step(c1);
      g2.sim.step(c2);
    }

    expect(g1.sim.hash()).toBe(g2.sim.hash());
    const st = g1.sim.script!.st;
    expect(st.sub[0]).toBe(1);
    expect(st.sub[6]).toBe(1);
    expect(g1.sim.cb.gold[0]).toBeGreaterThanOrEqual(450);

    // Clear Group 1 (Corduroy Convoy) and Group 10 (Probate Salt-Vaults / Khepri)
    for (const u of [...(loaded1.def.groups[1] ?? []), ...(loaded1.def.groups[10] ?? [])]) {
      g1.sim.cb.hp[u] = 0;
    }
    g1.sim.cb.recount(g1.sim.team);
    for (let t = 0; t < 10; t++) {
      g1.sim.step(g1.ai.commands(g1.sim));
    }
    expect(st.sub[0]).toBe(2);
    expect(st.sub[1]).toBe(1);
    expect(st.sub[9]).toBe(2);

    // Defeat Gorrathul and Group 6 (Ironheart Bastion) -> Victory!
    for (const u of loaded1.def.groups[6] ?? []) {
      g1.sim.cb.hp[u] = 0;
    }
    g1.sim.cb.recount(g1.sim.team);
    for (let t = 0; t < 10; t++) {
      g1.sim.step(g1.ai.commands(g1.sim));
    }
    expect(st.sub[5]).toBe(2);
    expect(st.status).toBe(1);
  });
});
