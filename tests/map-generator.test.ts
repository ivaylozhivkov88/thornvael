import { describe, expect, it } from 'vitest';
import { generateExpeditionMap, isPathReachable } from '../src/map-generator';
import { bakeBlocked, ObjectKind, Terrain } from '../src/map';
import { loadDoc, rleDecode, validate } from '../src/mapdoc';
import { createMission } from '../src/mission';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { regionsOf } from '../src/sim/path';
import { Role } from '../src/sim/town';

describe('Procedural Expedition Map Generator (Task Z1)', () => {
  it('guarantees determinism: same seed produces identical MapDoc and Sim hash', () => {
    const seed = 42109;
    const docA = generateExpeditionMap({ seed, biome: 'forest', difficulty: 1, size: 64 });
    const docB = generateExpeditionMap({ seed, biome: 'forest', difficulty: 1, size: 64 });

    expect(JSON.stringify(docA)).toBe(JSON.stringify(docB));

    const loadedA = loadDoc(docA);
    const loadedB = loadDoc(docB);

    const gameA = createMission(loadedA, seed);
    const gameB = createMission(loadedB, seed);

    createHero(gameA.sim, 0, 0, false, 1);
    createHero(gameB.sim, 0, 0, false, 1);

    for (let tick = 0; tick < 100; tick++) {
      gameA.sim.step();
      gameB.sim.step();
    }

    expect(gameA.sim.hash()).toBe(gameB.sim.hash());
  });

  it('supports all four biomes with valid MapDoc structure and proper terrain types', () => {
    const biomes = ['forest', 'marsh', 'desert', 'crypt'] as const;

    for (const biome of biomes) {
      const doc = generateExpeditionMap({ seed: 777, biome, difficulty: 0, size: 64 });
      const errs = validate(doc);
      expect(errs).toEqual([]);

      expect(doc.w).toBe(64);
      expect(doc.h).toBe(64);
      expect(doc.name).toContain('Expedition');

      // Check terrain decoding
      const terrain = rleDecode(doc.terrain, doc.w * doc.h);
      const uniqueTiles = new Set(terrain);

      if (biome === 'forest') {
        expect(uniqueTiles.has(Terrain.Grass)).toBe(true);
        expect(uniqueTiles.has(Terrain.Dirt)).toBe(true);
      } else if (biome === 'marsh') {
        expect(uniqueTiles.has(Terrain.Marsh)).toBe(true);
      } else if (biome === 'desert') {
        expect(uniqueTiles.has(Terrain.Dirt)).toBe(true);
      } else if (biome === 'crypt') {
        expect(uniqueTiles.has(Terrain.Dirt)).toBe(true);
      }

      // Check layout features
      expect(doc.units[0].kind).toBe(Kind.Hero);
      expect(doc.units[0].x).toBe(8);
      expect(doc.units[0].y).toBe(8);

      // 2 companions
      expect(doc.units[1].team).toBe(0);
      expect(doc.units[2].team).toBe(0);

      // Shrines
      expect(doc.shrines?.length).toBe(3);
      const shrineKinds = doc.shrines?.map((s) => s.kind);
      expect(shrineKinds).toContain('healing');
      expect(shrineKinds).toContain('mana');
      expect(shrineKinds).toContain('combat');

      // Town with Inn and Shop
      expect(doc.towns?.length).toBe(1);
      expect(doc.towns?.[0].tavern).toBe(0);
      expect(doc.towns?.[0].shop).toBe(1);

      // SuperUnique Boss unit
      const boss = doc.units.find((u) => u.vip && u.team === 1);
      expect(boss).toBeDefined();
      expect(boss?.bossMods?.length).toBeGreaterThanOrEqual(1);
      expect(boss?.x).toBe(doc.w - 12);
      expect(boss?.y).toBe(doc.h - 12);
    }
  });

  it('generates 96x96 maps when requested', () => {
    const doc = generateExpeditionMap({ seed: 1234, biome: 'forest', size: 96 });
    expect(validate(doc)).toEqual([]);
    expect(doc.w).toBe(96);
    expect(doc.h).toBe(96);

    const boss = doc.units.find((u) => u.vip && u.team === 1);
    expect(boss?.x).toBe(96 - 12);
    expect(boss?.y).toBe(96 - 12);
  });

  it('ensures full BFS connectivity from hero start to boss lair and all shrines', () => {
    const seeds = [101, 202, 303, 404, 505];

    for (const seed of seeds) {
      const doc = generateExpeditionMap({ seed, biome: 'forest', size: 64 });
      const terrain = rleDecode(doc.terrain, doc.w * doc.h);
      const blocked = bakeBlocked(doc.w, doc.h, terrain, doc.objects);

      const hero = doc.units[0];
      const boss = doc.units.find((u) => u.vip && u.team === 1)!;

      // Connectivity to Boss Lair
      const bossReachable = isPathReachable(doc.w, doc.h, blocked, hero.x, hero.y, boss.x, boss.y);
      expect(bossReachable).toBe(true);

      // Connectivity to all 3 Shrines
      for (const shrine of doc.shrines ?? []) {
        const shrineReachable = isPathReachable(doc.w, doc.h, blocked, hero.x, hero.y, shrine.x, shrine.y);
        expect(shrineReachable).toBe(true);
      }

      // Connectivity through regionsOf
      const loaded = loadDoc(doc);
      const reg = regionsOf(loaded.map);
      const heroRegion = reg[hero.y * doc.w + hero.x];
      expect(heroRegion).toBeGreaterThanOrEqual(0);
      expect(reg[boss.y * doc.w + boss.x]).toBe(heroRegion);

      for (const shrine of doc.shrines ?? []) {
        expect(reg[shrine.y * doc.w + shrine.x]).toBe(heroRegion);
      }
    }
  });

  it('runs 100 ticks with Sim without errors and verifies triggers', () => {
    const doc = generateExpeditionMap({ seed: 999, biome: 'crypt', difficulty: 2 });
    const loaded = loadDoc(doc);
    const game = createMission(loaded, 999);
    createHero(game.sim, 0, 0, false, 1);

    // Initial state
    expect(game.sim.script?.st.status).toBe(0); // playing

    // Step 100 ticks
    for (let i = 0; i < 100; i++) {
      game.sim.step();
    }

    // Briefing trigger fired and gave money
    expect(game.sim.cb.gold[0]).toBeGreaterThanOrEqual(400);

    // Towns have active doors
    expect(game.sim.towns.length).toBe(1);
    expect(game.sim.towns[0].door[Role.Tavern]).not.toBeNull();
    expect(game.sim.towns[0].door[Role.Shop]).not.toBeNull();

    // Verify victory trigger on Boss death
    const bossUnitIdx = doc.units.findIndex((u) => u.vip && u.team === 1);
    expect(bossUnitIdx).toBeGreaterThan(0);

    // Slay the boss
    game.sim.cb.hp[bossUnitIdx] = 0;
    // Step until script runs (runs every 5 ticks)
    for (let i = 0; i < 10; i++) {
      game.sim.step();
    }
    expect(game.sim.script?.st.status).toBe(1); // won
  });

  it('verifies defeat trigger when Hero dies', () => {
    const doc = generateExpeditionMap({ seed: 555, biome: 'desert' });
    const loaded = loadDoc(doc);
    const game = createMission(loaded, 555);
    createHero(game.sim, 0, 0, false, 1);

    // Kill hero
    game.sim.cb.hp[0] = 0;
    for (let i = 0; i < 10; i++) {
      game.sim.step();
    }
    expect(game.sim.script?.st.status).toBe(2); // defeat
  });
});
