import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bakeBlocked, Terrain } from '../src/map';
import { BIOMES, generateExpeditionMap, isPathReachable } from '../src/map-generator';
import { BOSS_MOD_IDS, loadDoc, rleDecode, validate, type BossModId } from '../src/mapdoc';
import { createMission } from '../src/mission';
import { BOSS_MOD_LABELS, monsterInfo, monsterInfoByFamily } from '../src/monster-info';
import { Kind } from '../src/sim/combat';
import { MONSTER_FAMILIES, MONSTER_PALETTES, monsterFamilyById, parseMonsters, setMonsters } from '../src/sim/data';
import { createHero } from '../src/sim/hero';

interface MonsterCatalog {
  version: number;
  palettes: { tier: number; label: string; hex: string; hpMult: number; dmgMult: number }[];
  families: {
    id: string;
    name: string;
    batch: string;
    archetype: number;
    elem: number;
    baseHp: number;
    baseMin: number;
    baseMax: number;
    speed: number;
    ranged: boolean;
    caster: boolean;
    role: string;
  }[];
}

describe('Monster Taxonomy & classic ARPG Biome Matrix Verification', () => {
  const catalog = JSON.parse(
    readFileSync(new URL('../public/data/monsters.json', import.meta.url), 'utf8'),
  ) as MonsterCatalog;

  if (MONSTER_FAMILIES.length === 0) {
    setMonsters(parseMonsters(catalog));
  }

  it('validates all 41 monster families in monsters.json with complete classic ARPG inspired taxonomy', () => {
    expect(catalog.families.length).toBe(41);
    expect(new Set(catalog.families.map((f) => f.id)).size).toBe(41);
    expect(new Set(catalog.families.map((f) => f.name)).size).toBe(41);

    // Verify key classic ARPG inspired families exist
    const requiredFamilies = [
      'sand-raider',
      'dune-scarab',
      'claw-viper',
      'greater-mummy',
      'quill-fiend',
      'wendigo-bruiser',
      'fetish-blowdart',
      'doom-knight',
      'cinderhorn',
      'fallen-shaman',
      'dune-beast',
      'maggot-swarm',
      'hollow-king',
      'witch-doctor',
      'stormtree',
      'anvilmaw-smith',
    ];

    for (const famId of requiredFamilies) {
      const fam = catalog.families.find((f) => f.id === famId);
      expect(fam, `Missing required family: ${famId}`).toBeDefined();
      expect(fam!.role.length).toBeGreaterThan(5);
      expect(fam!.baseHp).toBeGreaterThan(0);
      expect(fam!.baseMin).toBeLessThanOrEqual(fam!.baseMax);
      expect(fam!.speed).toBeGreaterThanOrEqual(60);
      expect(fam!.elem).toBeGreaterThanOrEqual(0);
      expect(fam!.elem).toBeLessThanOrEqual(5);
      expect(fam!.archetype).toBeGreaterThanOrEqual(0);
      expect(fam!.archetype).toBeLessThanOrEqual(6);
    }
  });

  it('supports all seven biomes generating valid MapDocs with full reachability and distinct ecology', () => {
    const allBiomes = ['forest', 'marsh', 'desert', 'oasis', 'crypt', 'highlands', 'volcanic'] as const;

    for (const biomeKey of allBiomes) {
      const biomeConfig = BIOMES[biomeKey];
      expect(biomeConfig).toBeDefined();

      const doc = generateExpeditionMap({ seed: 8881 + allBiomes.indexOf(biomeKey), biome: biomeKey, size: 64 });
      const errs = validate(doc);
      expect(errs).toEqual([]);

      // Check terrain decoding
      const terrain = rleDecode(doc.terrain, doc.w * doc.h);
      expect(terrain.length).toBe(64 * 64);
      const blocked = bakeBlocked(doc.w, doc.h, terrain, doc.objects);

      const hero = doc.units[0];
      expect(hero.kind).toBe(Kind.Hero);
      expect(hero.x).toBe(8);
      expect(hero.y).toBe(8);

      const boss = doc.units.find((u) => u.vip && u.team === 1);
      expect(boss).toBeDefined();
      expect(boss!.bossMods).toBeDefined();
      expect(boss!.bossMods!.length).toBe(2);

      // Boss modifiers must all be recognized by BOSS_MOD_IDS
      for (const mod of boss!.bossMods!) {
        expect(BOSS_MOD_IDS).toContain(mod as BossModId);
      }

      // Boss modifiers must come from the biome's theme-appropriate pool
      if (biomeConfig.eliteMods) {
        for (const mod of boss!.bossMods!) {
          expect(biomeConfig.eliteMods).toContain(mod as BossModId);
        }
      }

      // Boss family must belong to the biome's boss pool
      const validBossPool = biomeConfig.bossFamilies ?? [biomeConfig.bossFamily];
      expect(validBossPool).toContain(boss!.family);

      // Verify reachability from hero start to boss lair
      const reachable = isPathReachable(doc.w, doc.h, blocked, hero.x, hero.y, boss!.x, boss!.y);
      expect(reachable, `Boss unreachable in biome: ${biomeKey}`).toBe(true);

      // Verify reachability to all shrines
      for (const shrine of doc.shrines ?? []) {
        const shrineReachable = isPathReachable(doc.w, doc.h, blocked, hero.x, hero.y, shrine.x, shrine.y);
        expect(shrineReachable, `Shrine at (${shrine.x},${shrine.y}) unreachable in biome: ${biomeKey}`).toBe(true);
      }

      // Verify camp mob families belong to the biome's mob pool
      const validMobPool = biomeConfig.mobFamilies ?? [biomeConfig.mobFamily];
      const campUnits = doc.units.filter((u) => u.team === 1 && !u.vip);
      for (const cu of campUnits) {
        expect(validMobPool).toContain(cu.family);
      }
    }
  });

  it('guarantees strict deterministic reproduction across biomes with Mulberry32 PRNG', () => {
    const biomes = ['oasis', 'highlands', 'volcanic'] as const;

    for (const biome of biomes) {
      const seed = 94021;
      const doc1 = generateExpeditionMap({ seed, biome, difficulty: 1, size: 64 });
      const doc2 = generateExpeditionMap({ seed, biome, difficulty: 1, size: 64 });

      expect(JSON.stringify(doc1)).toBe(JSON.stringify(doc2));

      const game1 = createMission(loadDoc(doc1), seed);
      const game2 = createMission(loadDoc(doc2), seed);
      createHero(game1.sim, 0, 0, false, 1);
      createHero(game2.sim, 0, 0, false, 1);

      for (let t = 0; t < 50; t++) {
        game1.sim.step();
        game2.sim.step();
      }

      expect(game1.sim.hash()).toBe(game2.sim.hash());
    }
  });

  it('formats clean player inspection info via monsterInfo() and monsterInfoByFamily()', () => {
    // 1. Sand Raider inspection
    const sandRaiderInfo = monsterInfoByFamily('sand-raider', 2);
    expect(sandRaiderInfo).not.toBeNull();
    expect(sandRaiderInfo?.name).toContain('Sand Raider (Tier 2 Ochre)');
    expect(sandRaiderInfo?.role).toBe('Dual-scimitar desert speedster');
    expect(sandRaiderInfo?.element).toBe('Physical');
    expect(sandRaiderInfo?.base.hp).toBe(Math.round(86 * 1.35));
    expect(sandRaiderInfo?.text).toContain('Sand Raider (Tier 2 Ochre) — Dual-scimitar desert speedster');

    // 2. Dune Scarab with Lightning Enchanted
    const scarabInfo = monsterInfo(Kind.Imp, 3, 'dune-scarab', ['lightning_enchanted', 'extra_fast']);
    expect(scarabInfo).not.toBeNull();
    expect(scarabInfo?.mods).toEqual(['Lightning Enchanted', 'Extra Fast']);
    expect(scarabInfo?.element).toBe('Air');
    expect(scarabInfo?.text).toContain('Lightning Enchanted, Extra Fast Dune Scarab (Tier 3 Copper)');
    expect(scarabInfo?.text).toContain('Lightning discharge beetle');

    // 3. Greater Mummy with Stone Skin
    const mummyInfo = monsterInfoByFamily('greater-mummy', 4, ['stone_skin']);
    expect(mummyInfo).not.toBeNull();
    expect(mummyInfo?.mods).toEqual(['Stone Skin']);
    expect(mummyInfo?.element).toBe('Earth');
    expect(mummyInfo?.text).toContain('Stone Skin Greater Mummy (Tier 4 Cobalt)');
    expect(mummyInfo?.text).toContain('Ancient crypt embalmer & reviver');

    // 4. Cinderhorn with Fire Enchanted
    const cinderhornInfo = monsterInfoByFamily('cinderhorn', 5, ['fire_enchanted']);
    expect(cinderhornInfo).not.toBeNull();
    expect(cinderhornInfo?.mods).toEqual(['Fire Enchanted']);
    expect(cinderhornInfo?.element).toBe('Fire');
    expect(cinderhornInfo?.text).toContain('Inferno-breathing megademon');
  });

  it('runs an expedition game and triggers victory on slaying the SuperUnique boss', () => {
    const doc = generateExpeditionMap({ seed: 7123, biome: 'oasis', difficulty: 1 });
    const loaded = loadDoc(doc);
    const game = createMission(loaded, 7123);
    createHero(game.sim, 0, 0, false, 1);

    expect(game.sim.script?.st.status).toBe(0); // in progress

    // Slay the boss
    const bossIdx = doc.units.findIndex((u) => u.vip && u.team === 1);
    expect(bossIdx).toBeGreaterThan(0);
    game.sim.cb.hp[bossIdx] = 0;

    // Advance sim until victory trigger evaluates
    for (let i = 0; i < 15; i++) {
      game.sim.step();
    }

    expect(game.sim.script?.st.status).toBe(1); // won
  });
});
