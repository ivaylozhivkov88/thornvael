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
  aggroTiles: number; // Authentic detection / aggro range in tiles
  leashTiles: number; // leash distance from guard post in tiles
}

export const RULES: readonly Rules[] = [
  { corpse: 2250, foeHitPct: 80, friendlyPct: 0, mercPct: 100, goldPct: 150, hunt: false, aggroTiles: 8, leashTiles: 11 },
  { corpse: 1500, foeHitPct: 100, friendlyPct: 0, mercPct: 100, goldPct: 100, hunt: false, aggroTiles: 11, leashTiles: 14 },
  { corpse: 750, foeHitPct: 100, friendlyPct: 25, mercPct: 125, goldPct: 100, hunt: true, aggroTiles: 14, leashTiles: 18 },
  { corpse: 600, foeHitPct: 220, friendlyPct: 35, mercPct: 140, goldPct: 100, hunt: true, aggroTiles: 16, leashTiles: 22 },
];

export const rulesOf = (sim: Sim): Rules => RULES[sim.hero?.diff ?? 1] ?? RULES[1];

/** Price of a mercenary after difficulty. */
export const mercPrice = (sim: Sim, base: number): number => {
  const fee = Math.floor((base * rulesOf(sim).mercPct) / 100);
  const off = sim.town?.barracks ?? 0; // campaign barracks discount, percent
  return off ? Math.floor((fee * (100 - off)) / 100) : fee;
};
