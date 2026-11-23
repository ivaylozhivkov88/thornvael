import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateAchievements,
  formatAchievementForDisplay,
  matchesCondition,
  type AchievementDef,
} from '../src/achievements';

const DATA_PATH = resolve(__dirname, '..', 'src', 'data', 'achievements.json');

describe('Achievements Data & Pure Evaluator', () => {
  const achievements = JSON.parse(readFileSync(DATA_PATH, 'utf8')) as AchievementDef[];

  it('defines exactly 60 unique achievements with valid condition specs and hidden flags', () => {
    expect(achievements).toHaveLength(60);
    const ids = new Set(achievements.map((a) => a.id));
    expect(ids.size).toBe(60);

    const hiddenCount = achievements.filter((a) => a.hidden === true).length;
    expect(hiddenCount).toBeGreaterThanOrEqual(5);

    for (const a of achievements) {
      expect(a.name.trim().length).toBeGreaterThan(2);
      expect(a.description.trim().length).toBeGreaterThan(10);
      expect(typeof a.hidden).toBe('boolean');
      expect(['>=', '<=', '==', 'in']).toContain(a.condition.op);
      expect(a.condition.metric.length).toBeGreaterThan(0);
    }
  });

  it('evaluates conditions purely and grants each achievement at most once', () => {
    const first = evaluateAchievements(achievements, {
      kills: 150,
      crits: 60,
      mission_m01_win: true,
      m01_best_seconds: 195,
    });

    expect(first.unlockedIds).toContain('ach-first-blood');
    expect(first.unlockedIds).toContain('ach-slayer-100');
    expect(first.unlockedIds).not.toContain('ach-slayer-500');
    expect(first.unlockedIds).toContain('ach-crit-50');
    expect(first.unlockedIds).toContain('ach-ford-cleared');
    expect(first.unlockedIds).toContain('ach-speedrun-m01');
    expect(first.newlyUnlocked.length).toBe(first.unlockedIds.length);

    // Re-evaluating with the same metrics and unlocked list produces zero newlyUnlocked
    const second = evaluateAchievements(
      achievements,
      { kills: 150, crits: 60, mission_m01_win: true, m01_best_seconds: 195 },
      first.unlockedIds,
    );
    expect(second.newlyUnlocked).toHaveLength(0);
    expect(second.unlockedIds).toEqual(first.unlockedIds);
  });

  it('handles <= zero-guard and masks locked hidden achievements', () => {
    expect(matchesCondition({ metric: 'm01_best_seconds', op: '<=', target: 240 }, { m01_best_seconds: 0 })).toBe(false);
    expect(matchesCondition({ metric: 'm01_best_seconds', op: '<=', target: 240 }, { m01_best_seconds: 240 })).toBe(true);

    const hiddenAch = achievements.find((a) => a.hidden)!;
    const lockedView = formatAchievementForDisplay(hiddenAch, false);
    expect(lockedView.name).toBe('Hidden Achievement');
    const unlockedView = formatAchievementForDisplay(hiddenAch, true);
    expect(unlockedView.name).toBe(hiddenAch.name);
  });
});
