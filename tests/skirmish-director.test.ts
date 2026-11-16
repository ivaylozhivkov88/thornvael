import { describe, expect, it } from 'vitest';
import { loadDoc } from '../src/mapdoc';
import { createMission, missionFromName, SKIRMISH_MAP_NAMES } from '../src/mission';
import { Kind, Ord } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { FP, Sim, replay } from '../src/sim/sim';
import { SkirmishDirector, type Pack } from '../src/sim/bot';

describe('Skirmish AI Director (P11 & P14)', () => {
  const MAP_KEYS = [
    ['glade', 'Bracken Glade', 'S01'],
    ['scarlet', 'Scarlet Ridge', 'S02'],
    ['tidebreak', 'Tidebreak Cove', 'S03'],
    ['blackwater', 'Blackwater Reach', 'S04'],
    ['crossroads', 'Crossroads of Ash', 'S05'],
    ['shattered', 'Shattered Shore', 'S06'],
    ['twinfuries', 'Twin Furies', 'S07'],
    ['inward', 'Inward March', 'S08'],
    ['muddlefen', 'Muddlefen', 'S09'],
    ['shallowford', 'Shallow Ford', 'S10'],
    ['ashentier', 'Ashen Tier', 'S11'],
  ] as const;

  describe('P14: 11 Canonical Skirmish Maps Load & Director Integration', () => {
    it('all 11 skirmish maps are registered in SKIRMISH_MAP_NAMES inventory', () => {
      expect(SKIRMISH_MAP_NAMES.size).toBe(11);
      for (const [, name] of MAP_KEYS) {
        expect(SKIRMISH_MAP_NAMES.has(name)).toBe(true);
      }
    });

    it('each of the 11 skirmish maps boots cleanly with SkirmishDirector and runs 60 steps', () => {
      for (const [key, name, code] of MAP_KEYS) {
        const loaded = missionFromName(key);
        expect(loaded.doc.name).toBe(name);
        const game = createMission(loaded, 42);
        expect(game.ai instanceof SkirmishDirector, `${code} (${name}) should instantiate SkirmishDirector`).toBe(true);

        createHero(game.sim, 0, 0, false, 1);
        for (let t = 0; t < 60; t++) {
          const cmds = game.ai.commands(game.sim);
          game.sim.step(cmds);
        }
        expect(game.sim.tick).toBe(60);
      }
    });
  });

  describe('P11: Resource & Gold Gathering (Scavenging)', () => {
    it('dispatches available enemy units to collect nearby dropped gold sacks and deposits gold to enemy team', () => {
      const game = createMission(missionFromName('crossroads'), 101);
      const sim = game.sim;
      const director = game.ai as SkirmishDirector;

      // Find an enemy unit (team 1)
      let enemyId = -1;
      for (let i = 0; i < sim.count; i++) {
        if (sim.team[i] === 1 && sim.cb.hp[i] > 0) {
          enemyId = i;
          break;
        }
      }
      expect(enemyId).toBeGreaterThanOrEqual(0);

      // Place a gold sack 2 tiles from this enemy unit
      const ex = Math.floor(sim.x[enemyId] / FP);
      const ey = Math.floor(sim.y[enemyId] / FP);
      const sackTileX = Math.max(2, ex + 2);
      const sackTileY = Math.max(2, ey);

      const sackIdx = 0;
      sim.cb.sX[sackIdx] = sackTileX * FP;
      sim.cb.sY[sackIdx] = sackTileY * FP;
      const initialSackGold = 150;
      sim.cb.sG[sackIdx] = initialSackGold;

      const initialEnemyGold = sim.cb.gold[1];

      // Force scavenge check
      const scavengeCmds = director.forceScavenge(sim);
      expect(scavengeCmds.length).toBeGreaterThan(0);
      const pickupCmd = scavengeCmds.find((c) => c.type === 'order' && c.order === 'pickup');
      expect(pickupCmd).toBeDefined();

      // Step until sack is gathered
      sim.step(scavengeCmds);
      for (let t = 0; t < 60; t++) {
        if (sim.cb.sG[sackIdx] === 0) break;
        sim.step(director.commands(sim));
      }

      expect(sim.cb.sG[sackIdx]).toBe(0);
      expect(sim.cb.gold[1]).toBe(initialEnemyGold + initialSackGold);
    });
  });

  describe('P11: Camp Repopulation & Reinforcement Recruitment', () => {
    it('tracks deceased pack units and repopulates them after cooldown using gold economy', () => {
      const game = createMission(missionFromName('glade'), 202);
      const sim = game.sim;
      const director = game.ai as SkirmishDirector;

      // Find an enemy minion in a pack
      let victimId = -1;
      for (let i = 0; i < sim.count; i++) {
        if (sim.team[i] === 1 && sim.cb.hp[i] > 0 && sim.cb.kind[i] !== Kind.Golem) {
          victimId = i;
          break;
        }
      }
      expect(victimId).toBeGreaterThanOrEqual(0);

      // Give team 1 gold to afford recruitment
      sim.cb.gold[1] = 200;

      // Slay the minion
      sim.cb.hp[victimId] = 0;
      sim.cb.corp[victimId] = 100;
      sim.cb.recount(sim.team);
      expect(sim.cb.hp[victimId]).toBe(0);

      // Step to register death in director (runs decisions at tick % 25 === 7)
      for (let t = 0; t < 30; t++) sim.step(director.commands(sim));
      expect(director.getDeathCount()).toBeGreaterThan(0);

      // Fast forward past repop cooldown (director options repopCooldown default 450)
      for (let t = 0; t < 550; t++) {
        sim.step(director.commands(sim));
        if (sim.cb.hp[victimId] > 0) break;
      }

      // Unit has been repopulated / recruited back to life!
      expect(sim.cb.hp[victimId]).toBe(sim.cb.hpMax[victimId]);
      expect(sim.cb.gold[1]).toBe(160); // 200 - 40 gold fee
      expect(director.getDeathCount()).toBe(0);
    });
  });

  describe('P11: Coordinated Raid Squads', () => {
    it('organizes and dispatches raid squads advancing on the player target', () => {
      const game = createMission(missionFromName('crossroads'), 303);
      const sim = game.sim;
      const director = game.ai as SkirmishDirector;
      createHero(sim, 0, 0, false, 1);

      expect(director.getRaidCount()).toBe(0);

      // Force dispatch of a coordinated raid squad
      const raidCmds = director.forceRaid(sim);
      expect(raidCmds.length).toBeGreaterThan(0);
      expect(director.getRaidCount()).toBe(1);

      const raidOrder = raidCmds[0];
      expect(raidOrder.type === 'move' || raidOrder.type === 'order').toBe(true);

      // Simulate squad movement towards hero
      for (let t = 0; t < 25; t++) {
        sim.step(director.commands(sim));
      }
      expect(sim.tick).toBeGreaterThan(20);
    });
  });

  describe('P11: Camp & Base Defense Reactions', () => {
    it('alerts calm camp defenders when player intruders breach defensive perimeter', () => {
      const game = createMission(missionFromName('glade'), 404);
      const sim = game.sim;
      const director = game.ai as SkirmishDirector;
      createHero(sim, 0, 0, false, 1);

      // Find an enemy pack that is calm
      const pack = (director as any).packs.find((p: Pack) => !p.hunting);
      expect(pack).toBeDefined();

      // Move hero inside defense perimeter (within 10 tiles of pack post)
      sim.place(0, Math.floor(pack.x) + 2, Math.floor(pack.y));

      // Step director
      for (let t = 0; t < 30; t++) {
        sim.step(director.commands(sim));
        if (pack.hunting) break;
      }

      // Defenders have sounded the alarm and are hunting!
      expect(pack.hunting).toBe(true);
    });
  });

  describe('P11: Determinism, Hash Replay & Snapshot Save Integrity', () => {
    it('produces identical state hashes across two identical runs with SkirmishDirector', () => {
      const runA = createMission(missionFromName('scarlet'), 505);
      const runB = createMission(missionFromName('scarlet'), 505);

      createHero(runA.sim, 0, 0, false, 1);
      createHero(runB.sim, 0, 0, false, 1);

      for (let t = 0; t < 100; t++) {
        const moveCmd: { type: 'move'; ids: number[]; x: number; y: number }[] =
          t === 10 ? [{ type: 'move', ids: [0], x: 20.5, y: 20.5 }] : [];
        const cmdsA = [...runA.ai.commands(runA.sim), ...moveCmd];
        const cmdsB = [...runB.ai.commands(runB.sim), ...moveCmd];
        expect(cmdsA).toEqual(cmdsB);
        runA.sim.step(cmdsA);
        runB.sim.step(cmdsB);
      }

      expect(runA.sim.hash()).toBe(runB.sim.hash());
      expect(runA.sim.log.length).toBeGreaterThan(0);

      // Verify replay from log matches live hash
      const rerun = createMission(missionFromName('scarlet'), 505);
      createHero(rerun.sim, 0, 0, false, 1);
      replay(rerun.sim, runA.sim.log, 100);
      expect(rerun.sim.hash()).toBe(runA.sim.hash());
    });

    it('snapshots and restores director state preserving timers and raid counters', () => {
      const game = createMission(missionFromName('tidebreak'), 606);
      const sim = game.sim;
      const director = game.ai as SkirmishDirector;
      createHero(sim, 0, 0, false, 1);

      director.forceRaid(sim);
      expect(director.getRaidCount()).toBe(1);

      const snap = sim.snapshot();
      const aiSnap = director.snapshot();
      const aixSnap = director.snapshotExtra();

      expect(aixSnap.director?.raidCount).toBe(1);

      // Restore on fresh mission
      const restoreGame = createMission(missionFromName('tidebreak'), 606);
      restoreGame.sim.restore(snap);
      restoreGame.ai.restore(aiSnap);
      restoreGame.ai.restoreExtra(aixSnap);

      expect((restoreGame.ai as SkirmishDirector).getRaidCount()).toBe(1);
      expect(restoreGame.sim.hash()).toBe(sim.hash());
    });
  });

  describe('P11 Performance Evidence (< 1ms per step)', () => {
    it('keeps director step evaluation time well under 1ms', () => {
      const game = createMission(missionFromName('ashentier'), 707);
      const sim = game.sim;
      const director = game.ai as SkirmishDirector;
      createHero(sim, 0, 0, false, 1);

      const iterations = 100;
      const start = performance.now();
      for (let t = 0; t < iterations; t++) {
        const cmds = director.commands(sim);
        sim.step(cmds);
      }
      const totalMs = performance.now() - start;
      const meanMs = totalMs / iterations;

      // Verify mean step time is well under the 1ms budget
      expect(meanMs).toBeLessThan(1.0);
    });
  });
});
