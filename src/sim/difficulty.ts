import type { Sim } from './sim';

/**
 * Difficulty changes rules, not only numbers. The level is the hero's `diff` (0 easy, 1 medium, 2 hard), which is
 * already part of the snapshot and the state hash, so replays and saves match without any extra state.
 */
export interface Rules {
  corpse: number; // ticks a body can still be raised or burst
  foeHitPct: number; // damage foes deal to your side, percent
  friendlyPct: number; // damage your own area spells deal to your side, percent (0 = none)
  mercPct: number; // mercenary hire price, percent
  goldPct: number; // starting gold of a new hero, percent
  hunt: boolean; // foes pick the target with the weakest head and torso armour
}

export const RULES: readonly Rules[] = [
  { corpse: 2250, foeHitPct: 80, friendlyPct: 0, mercPct: 100, goldPct: 150, hunt: false },
  { corpse: 1500, foeHitPct: 100, friendlyPct: 0, mercPct: 100, goldPct: 100, hunt: false },
  { corpse: 750, foeHitPct: 100, friendlyPct: 25, mercPct: 125, goldPct: 100, hunt: true },
];

export const rulesOf = (sim: Sim): Rules => RULES[sim.hero?.diff ?? 1] ?? RULES[1];

/** Price of a mercenary after difficulty. */
export const mercPrice = (sim: Sim, base: number): number => Math.floor((base * rulesOf(sim).mercPct) / 100);
