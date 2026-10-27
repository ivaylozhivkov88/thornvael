import { Elem, M, MODN, enemyNear, launch, strike } from './combat';
import { heroUse } from './hero';
import { FP } from './path';
import type { Sim } from './sim';
import { rulesOf } from './difficulty';
import { CORPSE_TICKS, CURSES, NST, POISON_STACKS, SPELLS, St, Tk } from './spelldata';

/** Spell effects, statuses and autocast. Runs inside the sim, so everything here is integer and deterministic. */

const bit = (s: number): number => 1 << s;
const TICKS = 25;

export function knows(sim: Sim, i: number, sid: number): boolean {
  return sid >= 0 && sid < SPELLS.length && ((sim.cb.known[i] >>> sid) & 1) === 1;
}

export function isCorpse(sim: Sim, t: number): boolean {
  return t >= 0 && t < sim.count && sim.cb.hp[t] <= 0 && sim.cb.corp[t] > 0;
}

function dist2(sim: Sim, t: number, x: number, y: number): number {
  return (sim.x[t] - x) ** 2 + (sim.y[t] - y) ** 2;
}

// ---- statuses ----

export function hasStatus(sim: Sim, t: number, st: number): boolean {
  return (sim.cb.stMask[t] & bit(st)) !== 0;
}

function clearStatus(sim: Sim, t: number, st: number): void {
  const cb = sim.cb;
  cb.stMask[t] &= ~bit(st);
  cb.stT[t * NST + st] = 0;
  cb.stV[t * NST + st] = 0;
}

/**
 * Stacking rules: Bless, Haste, Slow, Burn, Weaken and Stone refresh to the longer timer and never stack. Shield keeps the larger
 * pool. Poison stacks up to three and every cast refreshes the timer. Haste and Slow cancel each other. A stone unit ignores every
 * new curse while it lasts.
 */
export function addStatus(sim: Sim, t: number, st: number, ticks: number, val: number): void {
  const cb = sim.cb;
  if (cb.hp[t] <= 0) return;
  const k = t * NST + st;
  const active = (cb.stMask[t] & bit(st)) !== 0;
  if (bit(st) & CURSES && cb.stMask[t] & bit(St.Stone)) return;
  if (st === St.Slow && hasStatus(sim, t, St.Haste)) {
    clearStatus(sim, t, St.Haste);
    cb.emit(8, sim.x[t], sim.y[t], St.Haste + 16, 0); // +16 marks "ended"
    return;
  }
  if (st === St.Haste && hasStatus(sim, t, St.Slow)) {
    clearStatus(sim, t, St.Slow);
    cb.emit(8, sim.x[t], sim.y[t], St.Slow + 16, 0);
    return;
  }
  cb.stMask[t] |= bit(st);
  if (st === St.Shield) {
    cb.stV[k] = Math.max(active ? cb.stV[k] : 0, val);
    cb.stT[k] = Math.max(active ? cb.stT[k] : 0, ticks);
  } else if (st === St.Poison) {
    cb.stV[k] = Math.min(POISON_STACKS, (active ? cb.stV[k] : 0) + Math.max(1, val));
    cb.stT[k] = ticks;
  } else {
    cb.stV[k] = Math.max(active ? cb.stV[k] : 0, val);
    cb.stT[k] = Math.max(active ? cb.stT[k] : 0, ticks);
  }
  if (!active) cb.emit(8, sim.x[t], sim.y[t], st, 0);
  if (st === St.Stone) sim.stop(t);
}

export function clearAllStatuses(sim: Sim, t: number): void {
  const cb = sim.cb;
  cb.stMask[t] = 0;
  for (let s = 0; s < NST; s++) {
    cb.stT[t * NST + s] = 0;
    cb.stV[t * NST + s] = 0;
  }
}

/** Per-tick upkeep for a unit with at least one status: timers run down, poison and burn hurt once a second. */
export function statusTick(sim: Sim, i: number): void {
  const cb = sim.cb;
  const pulse = (sim.tick + i) % TICKS === 0;
  for (let s = 0; s < NST; s++) {
    if (!(cb.stMask[i] & bit(s))) continue;
    const k = i * NST + s;
    if (pulse && (s === St.Poison || s === St.Burn) && cb.hp[i] > 0) {
      const dmg = s === St.Poison ? cb.stV[k] : cb.stV[k] || 2;
      strike(sim, i, dmg, dmg, s === St.Poison ? Elem.Earth : Elem.Fire, 99);
      if (cb.hp[i] <= 0) return;
    }
    if (--cb.stT[k] <= 0) {
      clearStatus(sim, i, s);
      cb.emit(8, sim.x[i], sim.y[i], s + 16, 0);
    }
  }
}

/** Speed in percent from statuses: 0 when turned to stone. */
export function statusSpeed(mask: number): number {
  if (mask & bit(St.Stone)) return 0;
  if (mask & bit(St.Haste)) return 140;
  if (mask & bit(St.Slow)) return 60;
  return 100;
}

// ---- effects ----

function roll(sim: Sim, min: number, max: number): number {
  return min + sim.rng.int(max - min + 1);
}

export function healUnit(sim: Sim, t: number, amount: number): void {
  const cb = sim.cb;
  if (cb.hp[t] <= 0) return;
  const gain = Math.min(amount, cb.hpMax[t] - cb.hp[t]);
  cb.hp[t] += gain;
  cb.emit(7, sim.x[t], sim.y[t], gain, 0);
}

/** A homing spell lands on `t` (or an area or multi spell picks `t` as one of its victims). */
export function spellHit(sim: Sim, t: number, sid: number, pow = 100): void {
  const sp = SPELLS[sid];
  const cb = sim.cb;
  if (cb.hp[t] <= 0) return;
  if (sp.heal) {
    healUnit(sim, t, Math.floor((roll(sim, sp.min, sp.max) * pow) / 100));
    return;
  }
  if (sp.max > 0) strike(sim, t, Math.floor((sp.min * pow) / 100), Math.floor((sp.max * pow) / 100), sp.school, 99);
  if (sp.st >= 0 && cb.hp[t] > 0) addStatus(sim, t, sp.st, sp.dur * TICKS, sp.val);
}

function area(sim: Sim, caster: number, sid: number, px: number, py: number, pow: number): void {
  const sp = SPELLS[sid];
  const r2 = (sp.radius * FP) ** 2;
  const team = sim.team[caster];
  sim.cb.emit(5, px, py, Math.round(sp.radius * 10), sp.school);
  const fire = team === 0 && !sp.heal ? rulesOf(sim).friendlyPct : 0; // hard: your own area spells hurt your side too
  for (let j = 0; j < sim.count; j++) {
    if (sim.cb.hp[j] <= 0) continue;
    const own = sim.team[j] === team;
    if (own !== sp.heal) {
      if (fire && own && j !== caster && !sim.hidden[j] && dist2(sim, j, px, py) <= r2) spellHit(sim, j, sid, Math.floor((pow * fire) / 100));
      continue;
    }
    if (dist2(sim, j, px, py) <= r2) spellHit(sim, j, sid, pow);
  }
}

/** The target plus the nearest other enemies within the spell's radius of it, nearest first. */
function chain(sim: Sim, t: number, sid: number, team: number): number[] {
  const sp = SPELLS[sid];
  const r2 = (sp.radius * FP) ** 2;
  const best: [number, number][] = [];
  for (let j = 0; j < sim.count; j++) {
    if (j === t || sim.cb.hp[j] <= 0 || sim.team[j] === team) continue;
    const d2 = dist2(sim, j, sim.x[t], sim.y[t]);
    if (d2 > r2) continue;
    best.push([d2, j]);
  }
  best.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return [t, ...best.slice(0, sp.count - 1).map((b) => b[1])];
}

export function revive(sim: Sim, t: number): void {
  const cb = sim.cb;
  cb.hp[t] = Math.max(1, Math.floor((cb.hpMax[t] * 40) / 100));
  cb.corp[t] = 0;
  cb.ord[t] = 0;
  cb.tgt[t] = -1;
  cb.aux[t] = 0;
  cb.cd[t] = 0;
  cb.px[t] = sim.x[t];
  cb.py[t] = sim.y[t];
  clearAllStatuses(sim, t);
  cb.alive[sim.team[t] & 3]++;
  cb.emit(10, sim.x[t], sim.y[t], 1, 5);
}

/** Cast spell `sid` from unit i. The caller has checked range, mana and cooldown. */
export function castSpell(sim: Sim, i: number, sid: number, t: number, px: number, py: number): void {
  const cb = sim.cb;
  const sp = SPELLS[sid];
  cb.mana[i] -= sp.cost;
  cb.cd[i] = sp.cd;
  cb.emit(9, sim.x[i], sim.y[i], sid, sp.school);
  const pow = Math.max(0, 100 + cb.mod[i * MODN + M.Pow]);
  if (sim.hero !== null && i === sim.hero.id) heroUse(sim, 2); // Sorcery grows with casting
  switch (sp.tk) {
    case Tk.Foe:
    case Tk.Ally:
      launch(sim, sim.x[i], sim.y[i], t, sp.min, sp.max, sp.school, 99, sid, pow);
      return;
    case Tk.Multi: {
      const ids = chain(sim, t, sid, sim.team[i]);
      ids.forEach((id, n) => launch(sim, n === 0 ? sim.x[i] : sim.x[t], n === 0 ? sim.y[i] : sim.y[t], id, sp.min, sp.max, sp.school, 99, sid, pow));
      return;
    }
    case Tk.Ground:
      area(sim, i, sid, px, py, pow);
      return;
    case Tk.Self:
      if (sp.st >= 0) addStatus(sim, i, sp.st, sp.dur * TICKS, sp.val);
      else {
        cb.mana[i] = Math.min(cb.manaMax[i], cb.mana[i] + sp.val);
        cb.emit(10, sim.x[i], sim.y[i], 2, 5);
      }
      return;
    case Tk.Corpse:
      if (sid === 21) revive(sim, t);
      else {
        cb.corp[t] = 0;
        cb.emit(10, sim.x[t], sim.y[t], 0, 5);
        area(sim, i, sid, sim.x[t], sim.y[t], pow);
      }
  }
}

/** True when the unit can pick target `t` (or the point) for spell `sid`. */
export function validTarget(sim: Sim, caster: number, sid: number, t: number): boolean {
  const sp = SPELLS[sid];
  const cb = sim.cb;
  switch (sp.tk) {
    case Tk.Foe:
    case Tk.Multi:
      return t >= 0 && t < sim.count && cb.hp[t] > 0 && sim.team[t] !== sim.team[caster];
    case Tk.Ally:
      return t >= 0 && t < sim.count && cb.hp[t] > 0 && sim.team[t] === sim.team[caster];
    case Tk.Corpse:
      return isCorpse(sim, t) && (sid !== 21 || sim.team[t] === sim.team[caster]);
    default:
      return true;
  }
}

/** Turn a click (unit id or tile point) into a target id for the spell, or -1 when nothing fits. Fixed-point point. */
export function resolveTarget(sim: Sim, caster: number, sid: number, t: number, px: number, py: number, hasPoint: boolean): number {
  if (validTarget(sim, caster, sid, t) && SPELLS[sid].tk !== Tk.Ground && SPELLS[sid].tk !== Tk.Self) return t;
  if (!hasPoint) return -1;
  const tk = SPELLS[sid].tk;
  if (tk === Tk.Ground || tk === Tk.Self) return -1;
  const radius2 = (tk === Tk.Corpse ? 1.5 * FP : 2 * FP) ** 2;
  let best = -1;
  let bd = radius2;
  for (let j = 0; j < sim.count; j++) {
    if (!validTarget(sim, caster, sid, j)) continue;
    const d2 = dist2(sim, j, px, py);
    if (d2 <= bd) {
      bd = d2;
      best = j;
    }
  }
  return best;
}

// ---- autocast ----

function hurtAlly(sim: Sim, i: number, range: number): number {
  const cb = sim.cb;
  let best = -1;
  let low = 70;
  for (let j = 0; j < sim.count; j++) {
    if (cb.hp[j] <= 0 || sim.team[j] !== sim.team[i]) continue;
    const pct = Math.floor((cb.hp[j] * 100) / cb.hpMax[j]);
    if (pct >= low || dist2(sim, j, sim.x[i], sim.y[i]) > range * range) continue;
    low = pct;
    best = j;
  }
  return best;
}

/** One autocast decision. Returns true when a spell was cast. Casters never walk for an autocast. */
export function autoCast(sim: Sim, i: number): boolean {
  const cb = sim.cb;
  const sid = cb.auto[i] - 1;
  if (sid < 0 || !knows(sim, i, sid) || cb.cd[i] > 0) return false;
  const sp = SPELLS[sid];
  if (cb.mana[i] < sp.cost) return false;
  const reach = sp.reach * FP;
  switch (sp.tk) {
    case Tk.Foe:
    case Tk.Multi: {
      const t = enemyNear(sim, i, reach, 0, 0, 0);
      if (t < 0) return false;
      if (sp.st >= 0 && sp.max === 0 && hasStatus(sim, t, sp.st)) return false; // do not recast a pure curse
      castSpell(sim, i, sid, t, 0, 0);
      return true;
    }
    case Tk.Ground: {
      if (sp.heal) {
        const t = hurtAlly(sim, i, reach);
        if (t < 0) return false;
        castSpell(sim, i, sid, -1, sim.x[t], sim.y[t]);
        return true;
      }
      const t = enemyNear(sim, i, reach, 0, 0, 0);
      if (t < 0) return false;
      castSpell(sim, i, sid, -1, sim.x[t], sim.y[t]);
      return true;
    }
    case Tk.Ally: {
      if (sp.heal) {
        const t = hurtAlly(sim, i, reach);
        if (t < 0) return false;
        castSpell(sim, i, sid, t, 0, 0);
        return true;
      }
      if (enemyNear(sim, i, 9 * FP, 0, 0, 0) < 0 || (sp.st >= 0 && hasStatus(sim, i, sp.st))) return false;
      castSpell(sim, i, sid, i, 0, 0); // buffs go on the caster first
      return true;
    }
    case Tk.Self: {
      if (sp.st >= 0) {
        if (hasStatus(sim, i, sp.st) || enemyNear(sim, i, 9 * FP, 0, 0, 0) < 0) return false;
      } else if (cb.mana[i] * 2 >= cb.manaMax[i]) return false;
      castSpell(sim, i, sid, -1, 0, 0);
      return true;
    }
    default: {
      if (sid !== 21) return false;
      let best = -1;
      let bd = reach * reach;
      for (let j = 0; j < sim.count; j++) {
        if (!isCorpse(sim, j) || sim.team[j] !== sim.team[i]) continue;
        const d2 = dist2(sim, j, sim.x[i], sim.y[i]);
        if (d2 <= bd) {
          bd = d2;
          best = j;
        }
      }
      if (best < 0) return false;
      castSpell(sim, i, sid, best, 0, 0);
      return true;
    }
  }
}

export { CORPSE_TICKS };
