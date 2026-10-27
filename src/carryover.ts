import type { CampaignProgress } from './campaign';
import { FP, type Sim } from './sim/sim';
import { cloneHero, recalc, type HeroState } from './sim/hero';

/**
 * What a hero takes from one mission or town to the next. Plain JSON, so it goes into saves and exported files unchanged.
 * Mercenaries come back only if they are alive: a body that was not raised in time stays behind.
 */
export interface Merc {
  kind: number;
  hpPct: number; // health at the end, percent of the maximum
}

export interface CarryoverState {
  hero: HeroState; // attributes, skills, pack, equipment by body part, known spells
  mercs: Merc[];
  gold: number;
  shopSeed: number;
  progress: CampaignProgress;
}

export function extractCarryover(sim: Sim, progress: CampaignProgress, shopSeed: number): CarryoverState {
  const h = cloneHero(sim.hero);
  if (!h) throw new Error('There is no hero to carry over.');
  const mercs: Merc[] = [];
  for (let j = 0; j < sim.count; j++) {
    if (j === h.id || sim.team[j] !== 0 || sim.hidden[j] || sim.cb.hp[j] <= 0) continue;
    mercs.push({ kind: sim.cb.kind[j], hpPct: Math.max(1, Math.floor((sim.cb.hp[j] * 100) / Math.max(1, sim.cb.hpMax[j]))) });
  }
  return { hero: h, mercs, gold: sim.cb.gold[0], shopSeed, progress: structuredClone(progress) };
}

/**
 * Put the hero, gold and living mercenaries into a freshly built mission (call before the first tick).
 * Mercenaries fill the mission's reserved team-0 units of the same kind, in unit order; each one is placed beside the hero.
 * Reserved units that nobody fills stay hidden. Returns how many mercenaries came along.
 */
export function applyCarryover(sim: Sim, co: CarryoverState): number {
  const hero = cloneHero(co.hero)!;
  const id = sim.hero?.id ?? hero.id;
  hero.id = id;
  sim.hero = hero;
  sim.cb.gold[0] = co.gold;
  const reserve: number[] = [];
  for (let j = 0; j < sim.count; j++) if (j !== id && sim.team[j] === 0 && sim.hidden[j]) reserve.push(j);
  let placed = 0;
  for (const m of co.mercs) {
    const at = reserve.findIndex((j) => sim.cb.kind[j] === m.kind);
    if (at < 0) continue;
    const [u] = reserve.splice(at, 1);
    const a = (placed * 2.4) % (Math.PI * 2);
    sim.x[u] = sim.tx[u] = sim.cb.px[u] = sim.x[id] + Math.round(Math.cos(a) * 1.2 * FP);
    sim.y[u] = sim.ty[u] = sim.cb.py[u] = sim.y[id] + Math.round(Math.sin(a) * 1.2 * FP);
    sim.stop(u);
    sim.hidden[u] = 0;
    sim.cb.hp[u] = Math.max(1, Math.floor((sim.cb.hpMax[u] * m.hpPct) / 100));
    placed++;
  }
  sim.cb.recount(sim.team);
  recalc(sim);
  return placed;
}
