import { describe, expect, it } from 'vitest';
import './setup';
import type { GameMap } from '../src/map';
import { monsterInfoByFamily } from '../src/monster-info';
import { classifyMonsterRole, MonsterAi, type Pack, type Scenario } from '../src/sim/bot';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { applyDynamicSessionRespawn } from '../src/sim/respawn';
import { Sim } from '../src/sim/sim';
import { St } from '../src/sim/spelldata';
import {
  SUPER_UNIQUES,
  getSuperUniqueById,
  getSuperUniqueForUnit,
  getSuperUniquesForAct,
  spawnSuperUniqueInPack,
} from '../src/sim/super-uniques';

function createTestMap(w = 48, h = 48): GameMap {
  return {
    w,
    h,
    terrain: new Uint8Array(w * h),
    height: new Uint8Array(w * h),
    blocked: new Uint8Array(w * h),
    objects: [],
    light: new Uint8Array(w * h).fill(220),
  };
}

describe('Thornvael Super-Unique Monsters & Tactical Enemy AI', () => {
  describe('Catalog of 16 Super-Unique Named Bosses (Acts I–IV)', () => {
    it('defines all 16 iconic Super-Unique bosses with 4 per Act, unique affixes, visuals, and retinues', () => {
      expect(SUPER_UNIQUES.length).toBe(16);
      const ids = new Set(SUPER_UNIQUES.map((s) => s.id));
      expect(ids.size).toBe(16);

      const expectedIds = [
        // Act I
        'pyre-chanter-malgath',
        'volt-stalker-krazak',
        'frostquill-skara',
        'bramblefist-oakhulk',
        // Act II
        'arc-carapace-vekor',
        'venomscale-ssorath',
        'ash-embalmer-khepri',
        'crimson-prowler-zara',
        // Act III
        'bog-hexer-zulmar',
        'thunderbough-elder',
        'cinderweb-arachna',
        'rimewing-valkor',
        // Act IV
        'fallen-warden-azrael',
        'hellforger-kragg',
        'dreadlord-malakor',
        'soulblight-archon',
      ];
      for (const id of expectedIds) {
        const su = getSuperUniqueById(id);
        expect(su, `Missing Super-Unique: ${id}`).toBeDefined();
        expect(su!.mods.length).toBeGreaterThanOrEqual(2);
        expect(su!.tier).toBeGreaterThanOrEqual(4);
        expect(su!.visual.scale).toBeGreaterThan(1.3);
        expect(su!.visual.tint).toBeGreaterThan(0);
        expect(su!.visual.auraColor).toBeGreaterThan(0);
        expect(su!.retinue.count).toBeGreaterThanOrEqual(3);
        expect(su!.retinue.family.length).toBeGreaterThan(0);

        const info = monsterInfoByFamily(id);
        expect(info).not.toBeNull();
        expect(info!.superUnique).toBe(true);
        expect(info!.visual).toEqual(su!.visual);
        expect(info!.aiRole).toBe(su!.ai);
        expect(info!.retinue).toEqual(su!.retinue);
        expect(info!.name).toContain(su!.name);
      }

      expect(getSuperUniquesForAct(1).length).toBe(4);
      expect(getSuperUniquesForAct(2).length).toBe(4);
      expect(getSuperUniquesForAct(3).length).toBe(4);
      expect(getSuperUniquesForAct(4).length).toBe(4);
    });

    it('spawns a Super-Unique boss with its full minion retinue in a pack via spawnSuperUniqueInPack', () => {
      const map = createTestMap();
      const teams = [0, 1, 1, 1, 1, 1, 1];
      const kinds = [Kind.Hero, Kind.Gnoll, Kind.Gnoll, Kind.Gnoll, Kind.Gnoll, Kind.Gnoll, Kind.Gnoll];
      const sim = new Sim(map, 42, teams, { kinds, combat: true });
      for (let i = 0; i < teams.length; i++) sim.place(i, 10 + i, 10);

      const pack: Pack = { ids: [1, 2, 3, 4, 5, 6], x: 12, y: 10, hunting: true, calm: 0 };
      const res = spawnSuperUniqueInPack(sim, pack, 'pyre-chanter-malgath');

      expect(res).not.toBeNull();
      expect(res!.leaderId).toBe(1);
      expect(res!.retinueIds).toEqual([2, 3, 4, 5, 6]);
      expect(sim.cb.family[1]).toBe('pyre-chanter-malgath');
      expect(sim.cb.tier[1]).toBe(4);
      expect(sim.cb.bossMods[1]).toEqual(['fire_enchanted', 'magic_resistant']);
      expect(getSuperUniqueForUnit(sim, 1)?.id).toBe('pyre-chanter-malgath');
      expect(classifyMonsterRole(sim, 1)).toBe('shaman_reviver');

      // Retinue minions configured as cinderlings (coward_swarm)
      for (const mId of res!.retinueIds) {
        expect(sim.cb.family[mId]).toBe('cinderling');
        expect(classifyMonsterRole(sim, mId)).toBe('coward_swarm');
      }
    });

    it('spawns 1–2 Super-Uniques deterministically during applyDynamicSessionRespawn', () => {
      const map = createTestMap();
      const teams = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1];
      const kinds = [
        Kind.Hero,
        Kind.Gnoll,
        Kind.Gnoll,
        Kind.Gnoll,
        Kind.Gnoll,
        Kind.Gnoll,
        Kind.Gnoll,
        Kind.Gnoll,
        Kind.Gnoll,
        Kind.Gnoll,
      ];
      const sim = new Sim(map, 1, teams, { kinds, combat: true });
      createHero(sim, 0, 0, false, 1);
      const scenario: Scenario = {
        teams,
        kinds,
        tiles: teams.map((_, idx) => [5 + idx * 2, 10] as [number, number]),
        packs: [
          { ids: [1, 2, 3], x: 8, y: 10, hunting: false, calm: 0 },
          { ids: [4, 5, 6], x: 14, y: 10, hunting: false, calm: 0 },
          { ids: [7, 8, 9], x: 20, y: 10, hunting: false, calm: 0 },
        ],
      };
      scenario.tiles.forEach(([x, y], i) => sim.place(i, x, y));

      const respawn = applyDynamicSessionRespawn(sim, scenario, 77777, 'm02-whispers-in-the-fen', 1);
      expect(respawn.superUniquesCount).toBe(2);
      expect(respawn.superUniques.length).toBe(2);
      for (const suId of respawn.superUniques) {
        expect(getSuperUniqueById(suId)?.act).toBe(1);
      }
    });
  });

  describe('Tactical Role 1: ranged_kiter (Hit-and-Run & Kiting)', () => {
    it('retreats 3.5 tiles away when hero gets closer than 3.2 tiles and shoots from standing range without swarming', () => {
      const map = createTestMap();
      const sim = new Sim(map, 10, [0, 1], {
        kinds: [Kind.Hero, Kind.Archer],
        families: ['', 'quill-fiend'],
        combat: true,
      });
      // Place Hero at (10, 10) and Quill Fiend at (12, 10) -> dist = 2.0 (< 3.2)
      sim.place(0, 10, 10);
      sim.place(1, 12, 10);

      expect(classifyMonsterRole(sim, 1)).toBe('ranged_kiter');
      const ai = new MonsterAi([{ ids: [1], x: 12, y: 10, hunting: true, calm: 0 }]);
      sim.cb.tgt[1] = 0;

      sim.tick = 3;
      const closeCmds = ai.commands(sim);
      expect(closeCmds.some((c) => c.type === 'order' && c.order === 'swarm')).toBe(false);
      const retreatCmd = closeCmds.find((c) => c.type === 'order' && c.order === 'retreat');
      expect(retreatCmd).toBeDefined();
      if (retreatCmd && retreatCmd.type === 'order') {
        expect(retreatCmd.x).toBeGreaterThanOrEqual(15); // Retreats ~3.5 tiles away from x=10 (from 12.5 -> 16)
      }

      // Now place Quill Fiend at comfortable shooting range: (15, 10) -> dist = 5.0 (between 3.2 and reach 7)
      sim.place(1, 15, 10);
      sim.tick = 13;
      const rangeCmds = ai.commands(sim);
      expect(rangeCmds.some((c) => c.type === 'order' && c.order === 'swarm')).toBe(false);
      const attackCmd = rangeCmds.find((c) => c.type === 'order' && c.order === 'attack');
      expect(attackCmd).toBeDefined();
      if (attackCmd && attackCmd.type === 'order') {
        expect(attackCmd.target).toBe(0);
        // No ground walk point needed when already in ranged reach so it shoots immediately from its spot
        expect(attackCmd.x).toBeUndefined();
      }
    });
  });

  describe('Tactical Role 2: coward_swarm (Cinderling Panic Retreat)', () => {
    it('flees in panic for 60 ticks (3 seconds) when the pack Shaman/Super-Unique dies, then rallies back to attack', () => {
      const map = createTestMap();
      // 0 = Hero, 1 = Malgath (Shaman leader), 2 & 3 = Cinderlings (coward_swarm)
      const sim = new Sim(map, 15, [0, 1, 1, 1], {
        kinds: [Kind.Hero, Kind.Mage, Kind.Imp, Kind.Imp],
        families: ['', 'fallen-shaman', 'cinderling', 'cinderling'],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 15, 10);
      sim.place(2, 13, 10);
      sim.place(3, 13, 11);

      const pack: Pack = { ids: [1, 2, 3], x: 14, y: 10, hunting: true, calm: 0 };
      spawnSuperUniqueInPack(sim, pack, 'pyre-chanter-malgath');
      const ai = new MonsterAi([pack]);
      sim.cb.tgt[2] = 0;

      // Slay Malgath (unit 1)
      sim.cb.hp[1] = 0;

      // At tick 3, cinderlings see their leader died and panic retreat for 60 ticks (until tick 63)
      sim.tick = 3;
      const panicCmds = ai.commands(sim);
      const retreats = panicCmds.filter((c) => c.type === 'order' && c.order === 'retreat');
      expect(retreats.length).toBe(2);

      // Still panicking at tick 33
      sim.tick = 33;
      const midPanicCmds = ai.commands(sim);
      expect(midPanicCmds.filter((c) => c.type === 'order' && c.order === 'retreat').length).toBe(2);

      // At tick 63 (60 ticks later), panic expires and cinderlings rally to swarm again
      sim.tick = 63;
      const rallyCmds = ai.commands(sim);
      const swarmCmd = rallyCmds.find((c) => c.type === 'order' && c.order === 'swarm');
      expect(swarmCmd).toBeDefined();
      if (swarmCmd && swarmCmd.type === 'order') {
        expect(swarmCmd.ids).toEqual([2, 3]);
      }
    });

    it('flees when a coward_swarm unit drops to <= 25% HP even if no leader died', () => {
      const map = createTestMap();
      const sim = new Sim(map, 15, [0, 1], {
        kinds: [Kind.Hero, Kind.Gnoll],
        families: ['', 'ruin-mite'],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 12, 10);
      sim.cb.hp[1] = Math.floor(sim.cb.hpMax[1] * 0.2); // 20% HP

      const ai = new MonsterAi([{ ids: [1], x: 12, y: 10, hunting: true, calm: 0 }]);
      sim.cb.tgt[1] = 0;

      sim.tick = 3;
      const cmds = ai.commands(sim);
      expect(cmds.some((c) => c.type === 'order' && c.order === 'retreat')).toBe(true);
    });
  });

  describe('Tactical Role 3: shaman_reviver & hexer_caster (Resurrection, Healing & Curses)', () => {
    it('resurrects fallen corpses (spell 24), heals wounded elites (spell 7), and casts Weaken/Frost/Fire bolts from backline', () => {
      const map = createTestMap();
      // 0 = Hero, 1 = Shaman, 2 = Dead Gnoll corpse, 3 = Wounded Elite Tank
      const sim = new Sim(map, 20, [0, 1, 1, 1], {
        kinds: [Kind.Hero, Kind.Mage, Kind.Gnoll, Kind.Golem],
        families: ['', 'fallen-shaman', 'briar-hound', 'ironbark'],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 16, 10); // 6 tiles from Hero (>= 3.5 safe distance)
      sim.place(2, 15, 10); // Corpse 1 tile from Shaman
      sim.place(3, 13, 10); // Tank between Shaman and Hero

      // Make unit 2 a fresh corpse
      sim.cb.hp[2] = 0;
      sim.cb.corp[2] = 800;

      const ai = new MonsterAi([{ ids: [1, 2, 3], x: 15, y: 10, hunting: true, calm: 0 }]);
      sim.cb.tgt[1] = 0;

      // 1. Tick 3: Shaman casts Resurrect (spell 24) on corpse 2, and sim.step revives unit 2!
      sim.tick = 2;
      const resCmds = ai.commands({ ...sim, tick: 3 } as Sim);
      const resOrder = resCmds.find((c) => c.type === 'order' && c.order === 'cast' && c.spell === 24);
      expect(resOrder).toBeDefined();
      sim.step(resCmds);
      expect(sim.cb.hp[2]).toBeGreaterThan(0); // Corpse 2 is alive again!

      // 2. Wounded Tank (unit 3 at 40% HP): Shaman casts Healing (spell 7) on unit 3
      sim.cb.hp[3] = Math.floor(sim.cb.hpMax[3] * 0.4);
      sim.cb.mana[1] = 70;
      sim.tick = 13;
      const healCmds = ai.commands(sim);
      const healOrder = healCmds.find((c) => c.type === 'order' && c.order === 'cast' && c.spell === 7);
      expect(healOrder).toBeDefined();
      if (healOrder && healOrder.type === 'order') {
        expect(healOrder.target).toBe(3);
      }

      // 3. Full HP allies: Shaman casts Weaken curse (spell 20) on Hero
      sim.cb.hp[2] = sim.cb.hpMax[2];
      sim.cb.hp[3] = sim.cb.hpMax[3];
      sim.tick = 23;
      const curseCmds = ai.commands(sim);
      const curseOrder = curseCmds.find((c) => c.type === 'order' && c.order === 'cast' && (c.spell === 20 || c.spell === 23));
      expect(curseOrder).toBeDefined();

      // 4. Once Hero has Weaken, Shaman casts Frost Bolt (spell 4) for Slow
      sim.cb.stMask[0] |= 1 << St.Weaken;
      sim.tick = 33;
      const slowCmds = ai.commands(sim);
      const slowOrder = slowCmds.find((c) => c.type === 'order' && c.order === 'cast' && c.spell === 4);
      expect(slowOrder).toBeDefined();
    });
  });

  describe('Tactical Role 4: juggernaut_tank (Bodyblocking Interception & Heavy Windup)', () => {
    it('positions itself on the line between the Shaman and the Hero to bodyblock incoming attacks', () => {
      const map = createTestMap();
      // 0 = Hero at (10, 10), 1 = Shaman at (18, 10), 2 = Ironbark Tank off to the side at (18, 15)
      const sim = new Sim(map, 25, [0, 1, 1], {
        kinds: [Kind.Hero, Kind.Mage, Kind.Golem],
        families: ['', 'fallen-shaman', 'ironbark'],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 18, 10);
      sim.place(2, 18, 15);

      expect(classifyMonsterRole(sim, 2)).toBe('juggernaut_tank');
      const ai = new MonsterAi([{ ids: [1, 2], x: 18, y: 12, hunting: true, calm: 0 }]);
      sim.cb.tgt[1] = 0;

      sim.tick = 3;
      const cmds = ai.commands(sim);
      // Tank (unit 2) receives a move order to intercept the line y = 10.5 between Shaman (18.5, 10.5) and Hero (10.5, 10.5)
      const tankMove = cmds.find((c) => c.type === 'move' && c.ids.includes(2));
      expect(tankMove).toBeDefined();
      if (tankMove && tankMove.type === 'move') {
        expect(tankMove.x).toBeGreaterThan(10.5);
        expect(tankMove.x).toBeLessThan(18.5);
        expect(Math.abs(tankMove.y - 10.5)).toBeLessThan(0.5);
      }
    });
  });

  describe('Tactical Role 5: ambush_lunger & berserker_charger (Weakest Armor Priority & Berserk)', () => {
    it('prioritizes lightly armored Mage over heavily armored Golem and flanks, then enters Berserk below 40% HP', () => {
      const map = createTestMap();
      // Team 0: 0 = Heavily armored Golem at (11, 10), 1 = Unarmored Mage at (12, 12)
      // Team 1: 2 = Scale Viper (ambush_lunger) at (16, 11)
      const sim = new Sim(map, 30, [0, 0, 1], {
        kinds: [Kind.Golem, Kind.Mage, Kind.Gnoll],
        families: ['', '', 'claw-viper'],
        combat: true,
      });
      sim.place(0, 11, 10);
      sim.place(1, 12, 12);
      sim.place(2, 16, 11);

      expect(classifyMonsterRole(sim, 2)).toBe('ambush_lunger');
      const ai = new MonsterAi([{ ids: [2], x: 16, y: 11, hunting: true, calm: 0 }]);
      sim.cb.tgt[2] = 0;

      sim.tick = 3;
      const cmds = ai.commands(sim);
      const lungeCmd = cmds.find((c) => c.type === 'order' && c.order === 'attack' && c.ids.includes(2));
      expect(lungeCmd).toBeDefined();
      if (lungeCmd && lungeCmd.type === 'order') {
        // Prioritizes fragile Mage (id 1) over Golem (id 0)
        expect(lungeCmd.target).toBe(1);
      }

      // Drop Scale Viper below 40% HP -> enters Berserk and attacks nearest enemy directly
      sim.cb.hp[2] = Math.floor(sim.cb.hpMax[2] * 0.3);
      sim.place(0, 15, 11); // Golem is now right next to Scale Viper (1 tile away)
      sim.tick = 13;
      const berserkCmds = ai.commands(sim);
      const berserkAttack = berserkCmds.find((c) => c.type === 'order' && c.order === 'attack' && c.ids.includes(2));
      expect(berserkAttack).toBeDefined();
      if (berserkAttack && berserkAttack.type === 'order') {
        expect(berserkAttack.target).toBe(0); // Nearest enemy in Berserk rage
      }
    });
  });

  describe('Simulation Determinism Guard', () => {
    it('maintains identical state hashes across replays and snapshot/restore with Super-Uniques and tactical AI', () => {
      const buildBattle = () => {
        const map = createTestMap();
        const teams = [0, 0, 1, 1, 1, 1, 1];
        const kinds = [Kind.Hero, Kind.Mage, Kind.Mage, Kind.Imp, Kind.Imp, Kind.Archer, Kind.Golem];
        const families = ['', '', 'fallen-shaman', 'cinderling', 'cinderling', 'quill-fiend', 'ironbark'];
        const sim = new Sim(map, 99, teams, { kinds, families, combat: true });
        createHero(sim, 0, 0, false, 1);
        teams.forEach((_, idx) => sim.place(idx, 8 + idx * 2, 12 + (idx % 3)));
        sim.settle();
        const pack: Pack = { ids: [2, 3, 4, 5, 6], x: 16, y: 12, hunting: true, calm: 0 };
        spawnSuperUniqueInPack(sim, pack, 'pyre-chanter-malgath');
        const ai = new MonsterAi([pack]);
        return { sim, ai };
      };

      const run1 = buildBattle();
      const run2 = buildBattle();

      for (let t = 0; t < 40; t++) {
        const c1 = run1.ai.commands(run1.sim);
        const c2 = run2.ai.commands(run2.sim);
        expect(c1).toEqual(c2);
        run1.sim.step(c1);
        run2.sim.step(c2);
      }

      expect(run1.sim.hash()).toBe(run2.sim.hash());

      const snap = run1.sim.snapshot();
      const aiSnap = run1.ai.snapshot();
      const aiExtra = run1.ai.snapshotExtra();

      for (let t = 0; t < 40; t++) {
        run1.sim.step(run1.ai.commands(run1.sim));
      }
      const finalHash = run1.sim.hash();

      run2.sim.restore(snap);
      run2.ai.restore(aiSnap);
      run2.ai.restoreExtra(aiExtra);
      for (let t = 0; t < 40; t++) {
        run2.sim.step(run2.ai.commands(run2.sim));
      }
      expect(run2.sim.hash()).toBe(finalHash);
    });
  });
});
