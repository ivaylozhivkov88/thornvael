import { describe, expect, it } from 'vitest';
import {
  BOSS_PROFILES,
  BossPhaseController,
  DUNGEON_TILE,
  EliteDirector,
  generateSideDungeon,
  hashDungeonRun,
  isDungeonFloorConnected,
  type BossTickEvent,
  type CampaignBossId,
  type EliteTickEvent,
} from '../src/sim/ai';

describe('E3: EliteDirector & Loot Critter', () => {
  it('rolls identical affixes and produces identical hashes for identical seeds', () => {
    const d1 = new EliteDirector(424242);
    const d2 = new EliteDirector(424242);

    const p1 = d1.spawnPack([{ id: 10, x: 512, y: 512, maxHp: 300 }], 3);
    const p2 = d2.spawnPack([{ id: 10, x: 512, y: 512, maxHp: 300 }], 3);

    expect(p1.affixes).toEqual(p2.affixes);
    expect(d1.hash()).toBe(d2.hash());

    d1.spawnLootCritter(1024, 1024, 2, 100);
    d2.spawnLootCritter(1024, 1024, 2, 100);

    for (let t = 0; t < 150; t++) {
      d1.step(600, 600);
      d2.step(600, 600);
    }
    expect(d1.hash()).toBe(d2.hash());
  });

  it('exercises fast, shielded, vampiric, fire_aura, and teleporting affixes', () => {
    const dir = new EliteDirector(99);
    const pack = dir.spawnPack(
      [{ id: 1, x: 256, y: 256, maxHp: 200 }],
      5,
      ['fast', 'vampiric', 'shielded', 'teleporting', 'fire_aura'],
    );
    expect(dir.getSpeedPct(pack.packId)).toBe(135);
    expect(pack.shieldHp).toBe(100);

    // Shield absorbs first
    const hpDmg = dir.damageMember(pack.packId, 1, 140);
    expect(pack.shieldHp).toBe(0);
    expect(hpDmg).toBe(40);
    expect(pack.members[0].hp).toBe(160);

    // Vampiric heals 20% of dealt damage
    const healed = dir.onEliteDealDamage(pack.packId, 1, 50);
    expect(healed).toBe(10);
    expect(pack.members[0].hp).toBe(170);

    // Step emits fire_aura, shield_regen, teleport
    const events: EliteTickEvent[] = [];
    dir.step(256, 256, events); // fire_aura & shield_regen trigger on tick 1
    expect(events.some((e) => e.kind === 'fire_aura')).toBe(true);
    expect(events.some((e) => e.kind === 'shield_regen')).toBe(true);

    // Move hero far away to trigger teleport
    const tpEvents: EliteTickEvent[] = [];
    dir.step(3000, 3000, tpEvents);
    expect(tpEvents.some((e) => e.kind === 'teleport')).toBe(true);
  });

  it('preserves hash across snapshot and restore', () => {
    const dir = new EliteDirector(777);
    dir.spawnPack([{ id: 1, x: 512, y: 512, maxHp: 250 }], 3);
    dir.spawnLootCritter(900, 900, 1, 80);

    for (let t = 0; t < 50; t++) dir.step(512, 512);
    const snap = dir.snapshot();

    for (let t = 0; t < 60; t++) dir.step(700, 700);
    const expectedHash = dir.hash();

    const restored = new EliteDirector(1);
    restored.restore(snap);
    for (let t = 0; t < 60; t++) restored.step(700, 700);

    expect(restored.hash()).toBe(expectedHash);
  });

  it('escapes loot critter after escape timer expires', () => {
    const dir = new EliteDirector(123);
    const c = dir.spawnLootCritter(512, 512, 1, 100);
    for (let t = 0; t < 750; t++) dir.step(512, 512);
    expect(c.alive).toBe(false);
    expect(c.escaped).toBe(true);
  });
});

describe('E4: BossPhaseController (morvessa, gorrathul, vesperion, ashkarath)', () => {
  const bosses: CampaignBossId[] = ['morvessa', 'gorrathul', 'vesperion', 'ashkarath'];

  it('transitions through phases 1 -> 2 -> 3, spawns adds, telegraphs hazards, and enrages deterministically', () => {
    for (const id of bosses) {
      const ctrl = new BossPhaseController(id, 1000, 555);
      const events: BossTickEvent[] = [];

      expect(ctrl.encounter.phase).toBe(1);
      ctrl.damageBoss(400, events); // 60% HP -> phase 2 for all except ashkarath (70%) and gorrathul (60%)
      expect(ctrl.encounter.phase).toBe(2);

      ctrl.damageBoss(400, events); // 20% HP -> phase 3 for all
      expect(ctrl.encounter.phase).toBe(3);

      // Step enough ticks for hazards + adds
      for (let t = 0; t < 300; t++) {
        ctrl.step(1024, 1024, events);
      }
      expect(events.some((e) => e.kind === 'telegraph_spawn')).toBe(true);
      expect(events.some((e) => e.kind === 'hazard_detonate')).toBe(true);
      expect(events.some((e) => e.kind === 'add_spawn')).toBe(true);
      expect(ctrl.encounter.activeAdds).toBeLessThanOrEqual(BOSS_PROFILES[id].maxAdds);

      // Fast-forward to enrage
      const remaining = BOSS_PROFILES[id].enrageTicks - ctrl.encounter.elapsedTicks;
      for (let t = 0; t < remaining; t++) ctrl.step(1024, 1024, events);
      expect(ctrl.encounter.enraged).toBe(true);
    }
  });

  it('matches snapshot/restore hashes mid-fight', () => {
    const a = new BossPhaseController('ashkarath', 2000, 888);
    a.damageBoss(700);
    for (let t = 0; t < 120; t++) a.step(512, 512);
    const snap = a.snapshot();

    for (let t = 0; t < 120; t++) a.step(640, 640);
    const targetHash = a.hash();

    const b = new BossPhaseController('ashkarath', 1, 1);
    b.restore(snap);
    for (let t = 0; t < 120; t++) b.step(640, 640);
    expect(b.hash()).toBe(targetHash);
  });
});

describe('E5: Deterministic Side Dungeon Generator', () => {
  it('generates identical 3-5 floor connected dungeons with miniboss and chest', () => {
    const runA = generateSideDungeon({ seed: 1337, biome: 'crypt' });
    const runB = generateSideDungeon({ seed: 1337, biome: 'crypt' });

    expect(runA.floorCount).toBeGreaterThanOrEqual(3);
    expect(runA.floorCount).toBeLessThanOrEqual(5);
    expect(hashDungeonRun(runA)).toBe(hashDungeonRun(runB));

    for (const floor of runA.floors) {
      expect(isDungeonFloorConnected(floor)).toBe(true);
      expect(floor.tiles[floor.stairsUp.y * floor.width + floor.stairsUp.x]).toBe(DUNGEON_TILE.STAIRS_UP);
    }

    const finalFloor = runA.floors[runA.floors.length - 1];
    expect(finalFloor.minibossRoomId).not.toBeNull();
    expect(finalFloor.chestRoomId).not.toBeNull();
  });
});

describe('Performance: 300-unit AI step budget', () => {
  it('keeps EliteDirector step under 1.0 ms mean with 300 active elite members', () => {
    const dir = new EliteDirector(2026);
    for (let p = 0; p < 75; p++) {
      const baseId = p * 4 + 1;
      dir.spawnPack(
        [
          { id: baseId, x: 512 + p * 32, y: 512, maxHp: 200 },
          { id: baseId + 1, x: 512 + p * 32, y: 544, maxHp: 200 },
          { id: baseId + 2, x: 512 + p * 32, y: 576, maxHp: 200 },
          { id: baseId + 3, x: 512 + p * 32, y: 608, maxHp: 200 },
        ],
        3,
      );
    }

    const t0 = performance.now();
    for (let tick = 0; tick < 200; tick++) {
      dir.step(1024, 512);
    }
    const elapsedMs = performance.now() - t0;
    const meanMs = elapsedMs / 200;
    expect(meanMs).toBeLessThan(1.0);
  });
});
