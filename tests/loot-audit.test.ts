import { describe, expect, it } from 'vitest';
import {
  calculateNoDropRate,
  evaluateQualityHierarchy,
  type MonsterRank,
} from '../src/sim/hero';
import { getItemDef, LOOT_RULES, rollLoot } from '../src/sim/items';
import { Rng } from '../src/sim/rng';

interface ZoneAuditSpec {
  zone: string;
  tier: number;
  lo: number;
  hi: number;
  baseDropChance: number;
  killsPerHour: number;
  rank: MonsterRank;
}

const ZONES: ZoneAuditSpec[] = [
  { zone: 'Act 1: Thornwick & Sunken Ford', tier: 1, lo: 1, hi: 2, baseDropChance: 35, killsPerHour: 240, rank: 'normal' },
  { zone: 'Act 2: Redmarsh & Salt-Vaults', tier: 2, lo: 2, hi: 3, baseDropChance: 42, killsPerHour: 210, rank: 'normal' },
  { zone: 'Act 3: Burning Harbor & Rampart', tier: 3, lo: 3, hi: 4, baseDropChance: 48, killsPerHour: 180, rank: 'normal' },
  { zone: 'Act 4: Ember Threshold & Caldera', tier: 4, lo: 4, hi: 5, baseDropChance: 55, killsPerHour: 150, rank: 'normal' },
];

describe('Loot Tables Integrity & 100k Drop Audit', () => {
  it('validates LOOT_RULES table integrity (valid tier bounds and drop chances)', () => {
    const entries = Object.entries(LOOT_RULES);
    expect(entries.length).toBeGreaterThan(0);

    for (const [_kind, rule] of entries) {
      const [chance, lo, hi] = rule;
      expect(chance).toBeGreaterThanOrEqual(0);
      expect(chance).toBeLessThanOrEqual(100);
      expect(lo).toBeGreaterThanOrEqual(1);
      expect(hi).toBeLessThanOrEqual(5);
      expect(lo).toBeLessThanOrEqual(hi);
    }
  });

  it('simulates 100,000 drops per zone with seeded Rng and produces sane rarity & gold/hr curves', () => {
    const N = 100_000;
    const goldPerHourByZone: number[] = [];

    for (let zIdx = 0; zIdx < ZONES.length; zIdx++) {
      const z = ZONES[zIdx];
      const rng = new Rng(1000 + zIdx);
      const noDropRate = calculateNoDropRate(z.baseDropChance, 1);

      const counts: Record<string, number> = {
        nodrop: 0,
        normal: 0,
        magic: 0,
        rare: 0,
        set: 0,
        unique: 0,
      };
      let totalGoldValue = 0;

      for (let i = 0; i < N; i++) {
        if (rng.int(100) < noDropRate) {
          counts.nodrop++;
          // Even on no-item drop, gold piles still drop ~40% of kills
          if (rng.int(100) < 40) totalGoldValue += 8 * z.tier + rng.int(12 * z.tier);
          continue;
        }
        const baseId = rollLoot((n) => rng.int(n), z.lo, z.hi);
        const drop = evaluateQualityHierarchy(baseId, z.tier, z.rank, 25, (n) => rng.int(n), 1);
        counts[drop.quality] = (counts[drop.quality] ?? 0) + 1;
        const def = getItemDef(drop.itemId);
        const baseVal = (def?.tier ?? z.tier) * 25;
        const mult =
          drop.quality === 'unique'
            ? 4
            : drop.quality === 'set'
              ? 3
              : drop.quality === 'rare'
                ? 2
                : drop.quality === 'magic'
                  ? 1.4
                  : 0.5;
        totalGoldValue += Math.round(baseVal * mult * 0.35);
      }

      const dropped = N - counts.nodrop;
      expect(dropped).toBeGreaterThan(20_000);
      expect(counts.normal).toBeGreaterThan(counts.magic);
      expect(counts.magic).toBeGreaterThan(counts.rare);
      expect(counts.unique).toBeGreaterThan(0);
      expect(counts.unique / N).toBeLessThan(0.05);

      const goldPerHour = Math.round((totalGoldValue / N) * z.killsPerHour);
      goldPerHourByZone.push(goldPerHour);
      console.log(
        `LOOT_AUDIT ${z.zone}: nodrop=${((counts.nodrop / N) * 100).toFixed(2)}% normal=${((counts.normal / N) * 100).toFixed(2)}% magic=${((counts.magic / N) * 100).toFixed(2)}% rare=${((counts.rare / N) * 100).toFixed(2)}% set=${((counts.set / N) * 100).toFixed(3)}% unique=${((counts.unique / N) * 100).toFixed(3)}% goldPerHr=${goldPerHour}`,
      );
    }

    // Later acts yield higher gold/hour than Act 1
    expect(goldPerHourByZone[3]).toBeGreaterThan(goldPerHourByZone[0]);
  });
});
