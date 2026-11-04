import { SKILL_MAX, skillNeed, type HeroState } from './sim/hero';

/** Read-only progress for the current level; capped skills have no next threshold. */
export function skillProgress(h: Pick<HeroState, 'skill' | 'use'>, skill: number): { level: number; used: number; needed: number | null; remaining: number } {
  const level = h.skill[skill];
  const used = h.use[skill];
  const needed = level >= SKILL_MAX ? null : skillNeed(level);
  return { level, used, needed, remaining: needed === null ? 0 : Math.max(0, needed - used) };
}
