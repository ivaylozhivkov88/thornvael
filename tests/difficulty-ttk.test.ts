import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RULES } from '../src/sim/difficulty';

interface DiffEntry {
  id: 'easy' | 'normal' | 'hard';
  diffIndex: number;
  label: string;
  enemyHpMult: number;
  enemyDamageMult: number;
  xpMult: number;
  goldMult: number;
  dropRateMult: number;
}

interface ZoneCurve {
  id: string;
  name: string;
  enemyBaseHp: number;
  enemyBaseArmor: number;
  heroDps: number;
}

interface DifficultyCurveDoc {
  difficulties: DiffEntry[];
  zones: ZoneCurve[];
}

const DATA_PATH = resolve(__dirname, '..', 'src', 'data', 'difficulty-curve.json');

/** Headless fixed-tick (20 Hz) combat TTK simulator for one enemy encounter. */
function simulateTtkSeconds(hp: number, armor: number, heroDps: number): number {
  const tickRate = 20;
  const dt = 1 / tickRate;
  const effectiveDps = Math.max(1, heroDps - armor * 0.65);
  let remaining = hp;
  let ticks = 0;
  while (remaining > 0 && ticks < 10_000) {
    remaining -= effectiveDps * dt;
    ticks++;
  }
  return Number((ticks * dt).toFixed(2));
}

describe('Difficulty Curve & Headless TTK Simulation', () => {
  const doc = JSON.parse(readFileSync(DATA_PATH, 'utf8')) as DifficultyCurveDoc;

  it('defines Easy, Normal, and Hard multipliers aligned with sim RULES indices', () => {
    expect(doc.difficulties).toHaveLength(3);
    expect(doc.difficulties.map((d) => d.id)).toEqual(['easy', 'normal', 'hard']);
    for (const d of doc.difficulties) {
      expect(RULES[d.diffIndex]).toBeDefined();
      expect(d.enemyHpMult).toBeGreaterThan(0);
      expect(d.enemyDamageMult).toBeGreaterThan(0);
      expect(d.xpMult).toBeGreaterThan(0);
      expect(d.goldMult).toBeGreaterThan(0);
      expect(d.dropRateMult).toBeGreaterThan(0);
    }
    expect(doc.difficulties[0].enemyHpMult).toBeLessThan(doc.difficulties[1].enemyHpMult);
    expect(doc.difficulties[1].enemyHpMult).toBeLessThan(doc.difficulties[2].enemyHpMult);
  });

  it('simulates headless TTK per zone across Easy, Normal, and Hard', () => {
    expect(doc.zones).toHaveLength(4);
    for (const z of doc.zones) {
      const ttkEasy = simulateTtkSeconds(z.enemyBaseHp * doc.difficulties[0].enemyHpMult, z.enemyBaseArmor, z.heroDps);
      const ttkNorm = simulateTtkSeconds(z.enemyBaseHp * doc.difficulties[1].enemyHpMult, z.enemyBaseArmor, z.heroDps);
      const ttkHard = simulateTtkSeconds(z.enemyBaseHp * doc.difficulties[2].enemyHpMult, z.enemyBaseArmor, z.heroDps);

      expect(ttkEasy).toBeLessThan(ttkNorm);
      expect(ttkNorm).toBeLessThan(ttkHard);
      // Keep normal encounter TTK brisk (2s..10s)
      expect(ttkNorm).toBeGreaterThanOrEqual(2);
      expect(ttkNorm).toBeLessThanOrEqual(10);

      console.log(`TTK ${z.name}: Easy=${ttkEasy}s Normal=${ttkNorm}s Hard=${ttkHard}s`);
    }
  });
});
