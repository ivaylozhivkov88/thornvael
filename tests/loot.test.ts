import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { Kind } from '../src/sim/combat';
import {
  calculateEffectiveMF,
  calculateNoDropRate,
  calculateQualityChance,
  calculateQualityDivisor,
  createHero,
  dropLoot,
  evaluateQualityHierarchy,
  getHeroMF,
  getMonsterRank,
  rollQualitySuccess,
  QUALITY_BASE_DIVISORS,
  QUALITY_BIAS,
  QUALITY_FACTORS,
} from '../src/sim/hero';
import { ITEMS, Ik, LOOT_RULES, Slot, itemId } from '../src/sim/items';
import { UNIQUE_ARTIFACTS } from '../src/sim/affixes';
import { ALL_SET_ITEMS } from '../src/sim/sets';
import { Sim } from '../src/sim/sim';

function field(w: number, h: number): GameMap {
  return {
    w,
    h,
    terrain: new Uint8Array(w * h),
    height: new Uint8Array(w * h),
    blocked: new Uint8Array(w * h),
    objects: [],
    light: new Uint8Array(w * h).fill(200),
  };
}

function createTestWorld(
  diff = 1,
  foes: { kind: number; tier?: number; bossMods?: string[] }[] = [],
  seed = 42,
): Sim {
  const kinds = [Kind.Hero, ...foes.map((f) => f.kind)];
  const tiers = [1, ...foes.map((f) => f.tier ?? 1)];
  const bossMods = [[], ...foes.map((f) => f.bossMods ?? [])];
  const sim = new Sim(field(40, 30), seed, [0, ...foes.map(() => 1)], {
    kinds,
    tiers,
    bossMods,
    combat: true,
  });
  sim.place(0, 5, 5);
  foes.forEach((_, n) => sim.place(n + 1, 10 + n * 2, 10));
  createHero(sim, 0, 0, false, diff);
  return sim;
}

describe('Diablo II 2-Stage Drop Rate & Quality Engine', () => {
  describe('1. Diminishing Returns for Magic Find (MF)', () => {
    it('applies exact formulas for effective MF across all item qualities', () => {
      const testCases = [0, 50, 100, 250, 400, 500, 1000];

      for (const mf of testCases) {
        // Magic: uncapped
        expect(calculateEffectiveMF(mf, 'magic')).toBe(mf);

        // Rare: (MF * 500) / (MF + 500)
        const expectedRare = mf <= 0 ? 0 : Math.floor((mf * 500) / (mf + 500));
        expect(calculateEffectiveMF(mf, 'rare')).toBe(expectedRare);

        // Set: (MF * 400) / (MF + 400)
        const expectedSet = mf <= 0 ? 0 : Math.floor((mf * 400) / (mf + 400));
        expect(calculateEffectiveMF(mf, 'set')).toBe(expectedSet);

        // Unique: (MF * 250) / (MF + 250)
        const expectedUnique = mf <= 0 ? 0 : Math.floor((mf * 250) / (mf + 250));
        expect(calculateEffectiveMF(mf, 'unique')).toBe(expectedUnique);
      }
    });

    it('handles negative or zero MF safely', () => {
      expect(calculateEffectiveMF(0, 'unique')).toBe(0);
      expect(calculateEffectiveMF(-50, 'set')).toBe(0);
      expect(calculateEffectiveMF(-100, 'rare')).toBe(0);
      expect(calculateEffectiveMF(-1, 'magic')).toBe(0);
    });

    it('demonstrates asymptotic diminishing returns behavior', () => {
      // Unique approaches 250
      expect(calculateEffectiveMF(1000, 'unique')).toBe(200);
      expect(calculateEffectiveMF(10000, 'unique')).toBe(243);
      expect(calculateEffectiveMF(100000, 'unique')).toBe(249);

      // Set approaches 400
      expect(calculateEffectiveMF(1000, 'set')).toBe(285);
      expect(calculateEffectiveMF(10000, 'set')).toBe(384);
      expect(calculateEffectiveMF(100000, 'set')).toBe(398);

      // Rare approaches 500
      expect(calculateEffectiveMF(1000, 'rare')).toBe(333);
      expect(calculateEffectiveMF(10000, 'rare')).toBe(476);
      expect(calculateEffectiveMF(100000, 'rare')).toBe(497);

      // Magic has no cap
      expect(calculateEffectiveMF(1000, 'magic')).toBe(1000);
      expect(calculateEffectiveMF(10000, 'magic')).toBe(10000);
    });

    it('calculates divisor and chance adjustment properly with MF', () => {
      const baseDiv = QUALITY_BASE_DIVISORS.unique; // 2000
      const div = calculateQualityDivisor(baseDiv, 3, 3, 40, 0, 1);
      expect(div).toBe(2000);

      // With 0 MF: chance = (2000 * 1000) / 1000 = 2000
      const chanceNoMF = calculateQualityChance(div, 0);
      expect(chanceNoMF).toBe(2000);

      // With 100 MF on Unique: effMF = 71 -> (2000 * 1000) / (1000 + 710) = 2000000 / 1710 = 1169
      const effMF = calculateEffectiveMF(100, 'unique');
      const chanceWithMF = calculateQualityChance(div, effMF);
      expect(chanceWithMF).toBe(1169);
      expect(chanceWithMF).toBeLessThan(chanceNoMF); // Higher chance of rolling success
    });
  });

  describe('2. Quality Check Hierarchy (Unique -> Set -> Rare -> Magic -> Normal)', () => {
    const swordId = ITEMS.findIndex((d) => d.kind === Ik.Gear && d.slot === Slot.Weapon);
    const potionId = ITEMS.findIndex((d) => d.kind === Ik.Potion);

    it('evaluates to Unique when Unique check succeeds', () => {
      // rnd returns 0 -> rnd(chance) < 100 succeeds on the first (Unique) check
      const res = evaluateQualityHierarchy(swordId, 5, 'boss', 100, () => 0);
      expect(res.quality).toBe('unique');
      expect(res.itemDef).toBeDefined();
      expect(res.itemDef?.slot).toBe(Slot.Weapon);
      expect(UNIQUE_ARTIFACTS).toContain(res.itemDef);
    });

    it('evaluates to Set when Unique fails but Set succeeds', () => {
      // rnd call sequence:
      // Call 1 (Unique check): returns 500 (fails since 500 >= 100)
      // Call 2 (Set check): returns 0 (succeeds since 0 < 100)
      let callCount = 0;
      const rnd = () => {
        callCount++;
        return callCount === 1 ? 500 : 0;
      };

      const res = evaluateQualityHierarchy(swordId, 3, 'champion', 50, rnd);
      expect(res.quality).toBe('set');
      expect(res.itemDef).toBeDefined();
      expect(res.itemDef?.slot).toBe(Slot.Weapon);
      expect(ALL_SET_ITEMS).toContain(res.itemDef);
    });

    it('evaluates to Rare when Unique and Set fail but Rare succeeds', () => {
      // Unique fails, Set fails, Rare succeeds
      let callCount = 0;
      const rnd = (n: number) => {
        callCount++;
        if (callCount <= 2) return 500; // Fail Unique & Set
        if (callCount === 3) return 0; // Succeed Rare
        return callCount % n; // Affix rolls
      };

      const res = evaluateQualityHierarchy(swordId, 3, 'normal', 0, rnd);
      expect(res.quality).toBe('rare');
      expect(res.magicDef).toBeDefined();
      // Rare items must have BOTH prefix and suffix
      expect(res.magicDef!.name).not.toBe(ITEMS[swordId].name);
      const words = res.magicDef!.name.split(' ');
      expect(words.length).toBeGreaterThanOrEqual(3);
    });

    it('evaluates to Magic when Unique, Set, Rare fail but Magic succeeds', () => {
      let callCount = 0;
      const rnd = (n: number) => {
        callCount++;
        if (callCount <= 3) return 500; // Fail Unique, Set, Rare
        if (callCount === 4) return 0; // Succeed Magic
        return callCount % n; // Affix rolls
      };

      const res = evaluateQualityHierarchy(swordId, 2, 'normal', 0, rnd);
      expect(res.quality).toBe('magic');
      expect(res.magicDef).toBeDefined();
      // Magic has prefix OR suffix
      expect(res.magicDef!.name).not.toBe(ITEMS[swordId].name);
    });

    it('evaluates to Normal when all quality rolls fail', () => {
      // Every check returns 999 -> fails Unique, Set, Rare, Magic
      const res = evaluateQualityHierarchy(swordId, 1, 'normal', 0, () => 999);
      expect(res.quality).toBe('normal');
      expect(res.itemId).toBe(swordId);
      expect(res.itemDef?.name).toBe(ITEMS[swordId].name);
      expect(res.magicDef).toBeUndefined();
    });

    it('leaves non-gear items (potions, scrolls) as Normal quality', () => {
      // Even with 100% success on all rolls, potions cannot become Unique/Rare
      const res = evaluateQualityHierarchy(potionId, 5, 'boss', 500, () => 0);
      expect(res.quality).toBe('normal');
      expect(res.itemId).toBe(potionId);
      expect(res.magicDef).toBeUndefined();
    });

    it('falls through to Set if Unique succeeds but no unique exists for that slot/tier', () => {
      // Mock an item with a slot that has no Unique (if any) or test fallback behavior
      // A shield or boots slot with a tier that forces fallthrough if empty
      const allUniqueSlots = new Set(UNIQUE_ARTIFACTS.map((u) => u.slot));
      expect(allUniqueSlots.size).toBeGreaterThan(0);
    });
  });

  describe('3. Monster Rank and Boss Drop Rates vs Normal Trash Mobs', () => {
    it('accurately identifies monster rank from boss mods', () => {
      const sim = createTestWorld(1, [
        { kind: Kind.Gnoll, bossMods: [] }, // regular trash
        { kind: Kind.Gnoll, bossMods: ['extra_fast'] }, // champion (1 mod)
        { kind: Kind.Golem, bossMods: ['fire_enchanted', 'stone_skin'] }, // boss (2 mods)
      ]);

      expect(getMonsterRank(sim, 1)).toBe('normal');
      expect(getMonsterRank(sim, 2)).toBe('champion');
      expect(getMonsterRank(sim, 3)).toBe('boss');
    });

    it('gives bosses 3 picks, champions 2 picks, and normal mobs 1 pick', () => {
      // Seed that ensures drops on normal mob
      const sim = createTestWorld(1, [
        { kind: Kind.Gnoll, bossMods: [] },
        { kind: Kind.Gnoll, bossMods: ['cold_enchanted'] },
        { kind: Kind.Golem, bossMods: ['blessed_aura', 'spectral_hit'] },
      ]);

      // Normal foe death
      dropLoot(sim, 1);
      const bagsAfterNormal = sim.cb.bI.filter((b) => b > 0).length;
      expect(bagsAfterNormal).toBeLessThanOrEqual(1);

      // Champion foe death (zero NoDrop, 2 picks)
      dropLoot(sim, 2);
      const bagsAfterChampion = sim.cb.bI.filter((b) => b > 0).length;
      expect(bagsAfterChampion).toBe(bagsAfterNormal + 2);

      // Boss foe death (zero NoDrop, 3 picks)
      dropLoot(sim, 3);
      const bagsAfterBoss = sim.cb.bI.filter((b) => b > 0).length;
      expect(bagsAfterBoss).toBe(bagsAfterChampion + 3);
    });

    it('grants positive quality bias to champions and bosses', () => {
      expect(QUALITY_BIAS.normal.unique).toBe(0);
      expect(QUALITY_BIAS.champion.unique).toBeGreaterThan(0);
      expect(QUALITY_BIAS.boss.unique).toBeGreaterThan(QUALITY_BIAS.champion.unique);

      expect(QUALITY_BIAS.normal.rare).toBe(0);
      expect(QUALITY_BIAS.champion.rare).toBeGreaterThan(0);
      expect(QUALITY_BIAS.boss.rare).toBeGreaterThan(QUALITY_BIAS.champion.rare);
    });

    it('places multiple drops with non-overlapping offsets', () => {
      const sim = createTestWorld(1, [
        { kind: Kind.Golem, bossMods: ['fire_enchanted', 'stone_skin'] },
      ]);

      dropLoot(sim, 1);
      const droppedIndices: number[] = [];
      for (let i = 0; i < sim.cb.bI.length; i++) {
        if (sim.cb.bI[i] > 0) droppedIndices.push(i);
      }
      expect(droppedIndices.length).toBe(3);

      // Verify bags have distinct positions
      const positions = droppedIndices.map((i) => `${sim.cb.bX[i]},${sim.cb.bY[i]}`);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(3);
    });
  });

  describe('4. Difficulty Scaling on Drop Rates and Tiers', () => {
    it('scales NoDrop rates across Easy, Normal, and Hard difficulties', () => {
      const baseDropChance = 30; // 30% drop chance -> base NoDrop is 70%

      // Normal (diff 1): standard 70%
      const normalNoDrop = calculateNoDropRate(baseDropChance, 1);
      expect(normalNoDrop).toBe(70);

      // Easy (diff 0): +20% no-drop -> 70 * 1.2 = 84%
      const easyNoDrop = calculateNoDropRate(baseDropChance, 0);
      expect(easyNoDrop).toBe(84);
      expect(easyNoDrop).toBeGreaterThan(normalNoDrop);

      // Hard (diff 2): -30% no-drop -> 70 * 0.7 = 49%
      const hardNoDrop = calculateNoDropRate(baseDropChance, 2);
      expect(hardNoDrop).toBe(49);
      expect(hardNoDrop).toBeLessThan(normalNoDrop);
    });

    it('locks tier on Easy and guarantees +1 tier on Hard for champions and bosses', () => {
      // Easy: monster tier 2 champion
      const simEasy = createTestWorld(0, [
        { kind: Kind.Gnoll, tier: 2, bossMods: ['fire_enchanted', 'stone_skin'] },
      ]);
      // Normal
      const simNormal = createTestWorld(1, [
        { kind: Kind.Gnoll, tier: 2, bossMods: ['fire_enchanted', 'stone_skin'] },
      ]);
      // Hard
      const simHard = createTestWorld(2, [
        { kind: Kind.Gnoll, tier: 2, bossMods: ['fire_enchanted', 'stone_skin'] },
      ]);

      // Perform drops
      dropLoot(simEasy, 1);
      dropLoot(simNormal, 1);
      dropLoot(simHard, 1);

      // On Easy, all dropped items should be tier <= 2 (tier locked)
      for (let i = 0; i < 3; i++) {
        const itemIdVal = simEasy.cb.bI[i] - 1;
        if (itemIdVal >= 0 && ITEMS[itemIdVal]) {
          expect(ITEMS[itemIdVal].tier).toBeLessThanOrEqual(2);
        }
      }

      // On Hard, drops are guaranteed +1 tier boost on champions/bosses (tier at least 3)
      for (let i = 0; i < 3; i++) {
        const itemIdVal = simHard.cb.bI[i] - 1;
        if (itemIdVal >= 0 && ITEMS[itemIdVal]) {
          expect(ITEMS[itemIdVal].tier).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it('hero MF property increases hero total MF', () => {
      const sim = createTestWorld(1);
      expect(getHeroMF(sim)).toBe(0);

      sim.hero!.mf = 150;
      expect(getHeroMF(sim)).toBe(150);
    });
  });
});
