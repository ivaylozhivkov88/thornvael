import { describe, expect, it } from 'vitest';
import { bakeBlocked, ObjectKind } from '../src/map';
import { BIOMES, floodFillReachable, generateExpeditionMap } from '../src/map-generator';
import { loadDoc, rleDecode, validate } from '../src/mapdoc';
import { createMission } from '../src/mission';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { generateSkirmishMap } from '../src/skirmish-generator';

const ALL_BIOMES = ['forest', 'marsh', 'desert', 'crypt', 'highlands', 'volcanic', 'oasis'] as const;
const SEEDS = [7, 42, 777] as const;

const BIOME_SEED_CASES = ALL_BIOMES.flatMap((biome) => SEEDS.map((seed) => ({ biome, seed })));

function fnv1aBytes(data: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h = Math.imul(h ^ data[i], 0x01000193);
  }
  return h >>> 0;
}

describe('All 7 biome seeds deterministic verification (21 biome x seed pairs)', () => {
  it.each(BIOME_SEED_CASES)(
    'generates deterministic valid skirmish & expedition maps for $biome seed=$seed',
    ({ biome, seed }) => {
      // 1. Skirmish generator determinism, schema & reachability
      const skirmishA = generateSkirmishMap({ seed, biome, players: 2, size: 64 });
      const skirmishB = generateSkirmishMap({ seed, biome, players: 2, size: 64 });
      expect(skirmishA).toEqual(skirmishB);
      expect(validate(skirmishA)).toEqual([]);

      const skirmishLoadedA = loadDoc(skirmishA);
      const skirmishLoadedB = loadDoc(skirmishB);
      expect(skirmishLoadedA.map.terrain).toEqual(skirmishLoadedB.map.terrain);
      expect(skirmishLoadedA.map.height).toEqual(skirmishLoadedB.map.height);

      const sTerrain = rleDecode(skirmishA.terrain, skirmishA.w * skirmishA.h);
      const sBlocked = bakeBlocked(skirmishA.w, skirmishA.h, sTerrain, skirmishA.objects);
      const sHero = skirmishA.units.find((u) => u.vip && u.team === 0);
      expect(sHero).toBeDefined();

      const sReach = floodFillReachable(skirmishA.w, skirmishA.h, sBlocked, sHero!.x, sHero!.y);
      for (const u of skirmishA.units.filter((x) => x.team === 1)) {
        expect(sReach[u.y * skirmishA.w + u.x]).toBe(1);
      }
      for (const sh of skirmishA.shrines ?? []) {
        expect(sReach[sh.y * skirmishA.w + sh.x]).toBe(1);
      }
      expect(skirmishA.objects.filter((o) => o.kind === ObjectKind.House && o.owner === 1)).toHaveLength(1);
      expect(skirmishA.towns?.length).toBe(1);

      const sGameA = createMission(skirmishLoadedA, seed);
      const sGameB = createMission(skirmishLoadedB, seed);
      createHero(sGameA.sim, 0, 0, false, 1);
      createHero(sGameB.sim, 0, 0, false, 1);
      for (let t = 0; t < 10; t++) {
        sGameA.sim.step();
        sGameB.sim.step();
      }
      expect(sGameA.sim.hash()).toBe(sGameB.sim.hash());

      // 2. Expedition generator determinism, schema & reachability
      const expA = generateExpeditionMap({ seed, biome, difficulty: 1, size: 64 });
      const expB = generateExpeditionMap({ seed, biome, difficulty: 1, size: 64 });
      expect(expA).toEqual(expB);
      expect(validate(expA)).toEqual([]);

      const expLoadedA = loadDoc(expA);
      const expLoadedB = loadDoc(expB);
      const eTerrain = rleDecode(expA.terrain, expA.w * expA.h);
      const eBlocked = bakeBlocked(expA.w, expA.h, eTerrain, expA.objects);
      const eHero = expA.units[0];
      const eBoss = expA.units.find((u) => u.vip && u.team === 1);
      expect(eHero.kind).toBe(Kind.Hero);
      expect(eBoss).toBeDefined();
      expect(eBoss!.bossMods?.length).toBeGreaterThanOrEqual(1);

      const eReach = floodFillReachable(expA.w, expA.h, eBlocked, eHero.x, eHero.y);
      expect(eReach[eBoss!.y * expA.w + eBoss!.x]).toBe(1);
      expect(expA.shrines?.length).toBe(3);
      for (const sh of expA.shrines ?? []) {
        expect(eReach[sh.y * expA.w + sh.x]).toBe(1);
      }
      for (const wp of expA.waypoints ?? []) {
        expect(eReach[wp.y * expA.w + wp.x]).toBe(1);
      }

      const eGameA = createMission(expLoadedA, seed);
      const eGameB = createMission(expLoadedB, seed);
      createHero(eGameA.sim, 0, 0, false, 1);
      createHero(eGameB.sim, 0, 0, false, 1);
      for (let t = 0; t < 10; t++) {
        eGameA.sim.step();
        eGameB.sim.step();
      }
      expect(eGameA.sim.hash()).toBe(eGameB.sim.hash());
    },
  );

  it('registers all 7 biomes in BIOMES and varies terrain hashes across distinct seeds', () => {
    expect(Object.keys(BIOMES).sort()).toEqual([...ALL_BIOMES].sort());
    for (const biome of ALL_BIOMES) {
      const hashes = new Set(
        SEEDS.map((seed) => {
          const doc = generateSkirmishMap({ seed, biome, players: 2, size: 64 });
          return fnv1aBytes(rleDecode(doc.terrain, doc.w * doc.h));
        }),
      );
      expect(hashes.size).toBe(SEEDS.length);
    }
  });
});
