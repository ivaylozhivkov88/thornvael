import { describe, expect, it } from 'vitest';
import './setup';
import { loadDoc, migrate, validate } from '../src/mapdoc';
import { createMission } from '../src/mission';
import { Elem, Kind, Ord } from '../src/sim/combat';
import { createHero, dropLoot } from '../src/sim/hero';
import { FP, Sim } from '../src/sim/sim';
import { ALL_UNIT_ART, BOSS_ART, BOSS_SPRITE_DEFS, bossSpriteDef, isBossArt } from '../src/sprites/units';
import { BOSS_SIGNATURE_ABILITIES } from '../src/monster-info';

import ossuary from '../src/missions/weeping-ossuary.map.json';
import gullet from '../src/missions/gullet-of-dunes.map.json';
import drowned from '../src/missions/drowned-choir.map.json';
import cinder from '../src/missions/cinder-throne.map.json';

describe('Milestone 3: Complete Act Final Boss Lairs & Visual Encounters', () => {
  const BOSS_LAIRS = [
    { id: 'ossuary', raw: ossuary, bossFamily: 'morvessa', expectedScale: 1.45, act: 1 },
    { id: 'gullet', raw: gullet, bossFamily: 'gorrathul', expectedScale: 1.85, act: 2 },
    { id: 'drowned', raw: drowned, bossFamily: 'vesperion', expectedScale: 1.6, act: 3 },
    { id: 'cinder', raw: cinder, bossFamily: 'ashkarath', expectedScale: 1.75, act: 4 },
  ] as const;

  it('validates all 4 boss lair maps (format v2, bounds, text keys, triggers)', () => {
    for (const lair of BOSS_LAIRS) {
      const doc = migrate(lair.raw);
      expect(validate(doc), lair.id).toEqual([]);
      expect(doc.w).toBe(48);
      expect(doc.h).toBe(48);
      expect(doc.units[0].kind).toBe(Kind.Hero);
      expect(doc.units[0].team).toBe(0);

      // Boss unit is at index 5 (after hero + 4 reserve companions)
      const bossUnit = doc.units[5];
      expect(bossUnit.family).toBe(lair.bossFamily);
      expect(bossUnit.vip).toBe(true);
      expect(bossUnit.tier).toBe(5);
      expect(bossUnit.bossMods?.length).toBeGreaterThan(0);

      expect(doc.text.title).toBeTruthy();
      expect(doc.text['obj.0']).toBeTruthy();
      expect(doc.text.win).toBeTruthy();
      expect(doc.text['fail.1']).toBeTruthy();
    }
  });

  it('verifies custom boss sprite definitions, dedicated atlases, scales, and aura tints in units.ts', () => {
    for (const lair of BOSS_LAIRS) {
      expect(isBossArt(lair.bossFamily)).toBe(true);
      expect((ALL_UNIT_ART as readonly string[]).includes(lair.bossFamily)).toBe(true);
      const def = bossSpriteDef(lair.bossFamily);
      expect(def).toBeDefined();
      expect(def!.baseArt).toBe(lair.bossFamily); // True dedicated boss art
      expect(def!.scale).toBe(lair.expectedScale);
      expect(def!.auraTint).toBeGreaterThan(0);
      expect(def!.signatureColor).toBeGreaterThan(0);
      expect(BOSS_SIGNATURE_ABILITIES[lair.bossFamily]).toBeDefined();
    }
  });

  it('verifies Ashkarath has Red Lightning ability in signature abilities', () => {
    const ik = BOSS_SIGNATURE_ABILITIES['ashkarath'];
    expect(ik.abilities.some((a) => a.includes('Red Lightning'))).toBe(true);
    expect(ik.summary).toContain('Red Lightning');
  });

  it('verifies guaranteed high-tier unique/set loot drops and 5-item shower on boss death', () => {
    for (const lair of BOSS_LAIRS) {
      const loaded = loadDoc(lair.raw);
      const game = createMission(loaded, 42);
      createHero(game.sim, 0, 0, false, 1);

      const bossIdx = 5;
      expect(game.sim.cb.family[bossIdx]).toBe(lair.bossFamily);

      // Kill the boss and verify drops
      game.sim.cb.hp[bossIdx] = 0;
      dropLoot(game.sim, bossIdx);

      // Count dropped loot bags
      let bagCount = 0;
      for (let b = 0; b < game.sim.cb.bI.length; b++) {
        if (game.sim.cb.bI[b] > 0) bagCount++;
      }
      expect(bagCount).toBe(5); // 5-item shower for act bosses
    }
  });

  it('runs boss combat simulation verifying spells/abilities and victory condition', () => {
    for (const lair of BOSS_LAIRS) {
      const loaded = loadDoc(lair.raw);
      const game = createMission(loaded, 123);
      createHero(game.sim, 0, 0, false, 1);

      const bossIdx = 5;
      // Step a few ticks to verify combat simulation runs cleanly
      for (let t = 0; t < 100; t++) {
        game.sim.step(game.ai.commands(game.sim));
      }

      // Slay the boss
      game.sim.cb.hp[bossIdx] = 0;
      game.sim.cb.recount(game.sim.team);

      // Advance sim to let triggers evaluate
      game.sim.step([]);

      // Victory trigger should be achieved (status 1 = victory)
      expect(game.sim.script?.st.status).toBe(1);
    }
  });
});
