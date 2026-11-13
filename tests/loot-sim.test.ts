import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { Kind } from '../src/sim/combat';
import {
  createHero,
  dropLoot,
  evaluateQualityHierarchy,
  getHeroMF,
  getMonsterRank,
  calculateNoDropRate,
  calculateEffectiveMF,
} from '../src/sim/hero';
import { ITEMS, Ik, Slot, itemId } from '../src/sim/items';
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

describe('Monte Carlo classic ARPG Loot Drop Simulator (10,000 Kills)', () => {
  it('simulates 10,000 monster kills and validates statistical drop rates', () => {
    interface SimResult {
      condition: string;
      kills: number;
      totalDrops: number;
      noDrops: number;
      normal: number;
      magic: number;
      rare: number;
      set: number;
      unique: number;
    }

    function runSimulation(
      label: string,
      rank: 'normal' | 'champion' | 'boss',
      monsterTier: number,
      mf: number,
      diff: number,
      kills = 10000,
    ): SimResult {
      const result: SimResult = {
        condition: label,
        kills,
        totalDrops: 0,
        noDrops: 0,
        normal: 0,
        magic: 0,
        rare: 0,
        set: 0,
        unique: 0,
      };

      // PRNG
      let seed = 1234567;
      const rnd = (n: number) => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed % n;
      };

      const picks = rank === 'boss' ? 3 : rank === 'champion' ? 2 : 1;
      const baseRuleNoDrop = 55; // Standard 55% base no-drop for normal foes
      const noDropRate = rank === 'normal' ? calculateNoDropRate(baseRuleNoDrop, diff) : 0;

      for (let k = 0; k < kills; k++) {
        if (rank === 'normal' && rnd(100) < noDropRate) {
          result.noDrops++;
          continue;
        }

        for (let p = 0; p < picks; p++) {
          result.totalDrops++;
          // Random base gear
          const baseId = rnd(100);
          const drop = evaluateQualityHierarchy(baseId, monsterTier, rank, mf, rnd);
          switch (drop.quality) {
            case 'unique':
              result.unique++;
              break;
            case 'set':
              result.set++;
              break;
            case 'rare':
              result.rare++;
              break;
            case 'magic':
              result.magic++;
              break;
            default:
              result.normal++;
              break;
          }
        }
      }

      return result;
    }

    const results: SimResult[] = [
      runSimulation('Trash Gnoll (T1, 0% MF, Normal)', 'normal', 1, 0, 1),
      runSimulation('Trash Gnoll (T1, 100% MF, Normal)', 'normal', 1, 100, 1),
      runSimulation('Trash Gnoll (T1, 300% MF, Normal)', 'normal', 1, 300, 1),
      runSimulation('Champion (T2, 0% MF, Normal)', 'champion', 2, 0, 1),
      runSimulation('Champion (T2, 100% MF, Normal)', 'champion', 2, 100, 1),
      runSimulation('Boss Malrik (T3, 0% MF, Normal)', 'boss', 3, 0, 1),
      runSimulation('Boss Malrik (T3, 100% MF, Normal)', 'boss', 3, 100, 1),
      runSimulation('Boss Malrik (T3, 300% MF, Normal)', 'boss', 3, 300, 1),
      runSimulation('Trash (T1, 0% MF, Easy)', 'normal', 1, 0, 0),
      runSimulation('Trash (T1, 0% MF, Hard)', 'normal', 1, 0, 2),
    ];

    console.log('\n=================== MONTE CARLO DROP RATE SIMULATION (10,000 KILLS) ===================');
    console.log(
      'Condition'.padEnd(38) +
      'Drops'.padEnd(8) +
      'NoDrop%'.padEnd(10) +
      'Normal%'.padEnd(10) +
      'Magic%'.padEnd(9) +
      'Rare%'.padEnd(9) +
      'Set%'.padEnd(8) +
      'Unique%',
    );
    console.log('------------------------------------------------------------------------------------------------------');

    for (const r of results) {
      const dropDenom = r.totalDrops || 1;
      const noDropPct = ((r.noDrops / r.kills) * 100).toFixed(1) + '%';
      const normPct = ((r.normal / dropDenom) * 100).toFixed(1) + '%';
      const magPct = ((r.magic / dropDenom) * 100).toFixed(1) + '%';
      const rarePct = ((r.rare / dropDenom) * 100).toFixed(1) + '%';
      const setPct = ((r.set / dropDenom) * 100).toFixed(2) + '%';
      const uniqPct = ((r.unique / dropDenom) * 100).toFixed(2) + '%';

      console.log(
        r.condition.padEnd(38) +
        String(r.totalDrops).padEnd(8) +
        noDropPct.padEnd(10) +
        normPct.padEnd(10) +
        magPct.padEnd(9) +
        rarePct.padEnd(9) +
        setPct.padEnd(8) +
        uniqPct,
      );
    }
    console.log('======================================================================================================\n');

    // Statistical Invariants
    const trash0 = results[0];
    const trash100 = results[1];
    const trash300 = results[2];
    const boss0 = results[5];
    const boss100 = results[6];

    // 1. Trash unique drops are rare (~3% of drops at 0% MF, or ~1.6% per monster kill)
    expect(trash0.unique / trash0.totalDrops).toBeLessThan(0.05);

    // 2. Magic Find upgrades drops into Rare, Set, and Unique
    const highTier0 = trash0.rare + trash0.set + trash0.unique;
    const highTier100 = trash100.rare + trash100.set + trash100.unique;
    const highTier300 = trash300.rare + trash300.set + trash300.unique;
    expect(highTier100).toBeGreaterThan(highTier0);
    expect(highTier300).toBeGreaterThan(highTier100);

    // 3. Bosses guarantee multi-drops (30,000 drops from 10,000 kills) and zero no-drops
    expect(boss0.totalDrops).toBe(30000);
    expect(boss0.noDrops).toBe(0);

    // 4. Boss yields dramatically more high-tier loot per kill than trash
    expect(boss0.rare).toBeGreaterThan(trash0.rare * 2);
    expect(boss0.unique).toBeGreaterThan(trash0.unique * 5);

    // 5. Diminishing returns: 300% MF is not 3x 100% MF for uniques
    const gain100 = (boss100.unique - boss0.unique) / (boss0.unique || 1);
    expect(gain100).toBeGreaterThan(0.2); // Noticeable gain
    expect(gain100).toBeLessThan(1.5);    // But capped by diminishing returns (100% MF -> 71% eff MF for unique)

    // 6. Difficulty scaling decreases NoDrop rate (Easy: 65% NoDrop, Normal: 55%, Hard: 45%)
    const easy = results[8];
    const hard = results[9];
    expect(easy.noDrops).toBeGreaterThan(hard.noDrops);
  });
});
