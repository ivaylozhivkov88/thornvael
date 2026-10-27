import { FP, dir16 } from './path';
import type { Sim } from './sim';
import { rulesOf } from './difficulty';
import { ALL_SPELLS, MAGE_SPELLS, NST, SPELLS, St, Tk } from './spelldata';
import { autoCast, castSpell, clearAllStatuses, knows, spellHit, statusTick, validTarget } from './spells';
import { dropLoot, heroUse, pickBag } from './hero';
import { PART_COUNT, PART_DMG, PART_WEIGHT } from './items';

/** Per-unit stat bonuses (hero gear, attributes, skills), MODN entries per unit. Def and Abs count on every part; PDef and PAbs are four entries, one per body part. */
export const M = { Min: 0, Max: 1, Acc: 2, Def: 3, Abs: 4, Res: 5, Pow: 10, Regen: 11, PDef: 12, PAbs: 16 } as const;
export const MODN = 20;

/** One resolved blow or spell hit, for the debug overlay. Recorded only while `CombatState.log` is set; never part of sim state. */
export interface HitRec {
  tick: number;
  src: number; // attacker, or -1 (spell area, status, script)
  t: number;
  elem: number;
  part: number; // body part, or -1 for school damage
  chance: number; // percent to hit, 100 for school damage
  roll: number;
  raw: number; // damage rolled, after the head bonus
  cut: number; // absorbed or resisted
  dmg: number; // taken (after shields), -1 on a miss
}

/** Orders. Guard is the default stance. */
export const Ord = { Guard: 0, Move: 1, Attack: 2, Defend: 3, Cast: 4, Swarm: 5, Hold: 6, Retreat: 7, Still: 8, Pickup: 9 } as const;
export const Kind = { Warrior: 0, Archer: 1, Hero: 2, Mage: 3, Gnoll: 4, Golem: 5, Imp: 6 } as const;
/** Damage kinds: 0 physical, then the five schools. */
export const Elem = { Physical: 0, Fire: 1, Water: 2, Air: 3, Earth: 4, Astral: 5 } as const;

export interface KindDef {
  name: string;
  hp: number;
  mana: number;
  acc: number;
  def: number; // dodge, the same on every body part
  pdef: readonly [number, number, number, number]; // natural armour per part: head, torso, arms, legs
  pabs: readonly [number, number, number, number];
  res: readonly [number, number, number, number, number]; // percent: fire, water, air, earth, astral
  min: number;
  max: number;
  elem: number;
  reach: number; // fixed point
  ranged: boolean;
  cd: number; // ticks between attacks
  speed: number; // percent of base walking speed
  caster: boolean;
  known: number; // bit mask of spell ids
  auto: number; // default autocast: spell id + 1, or 0
}

const MELEE = Math.round(0.95 * FP);
const T = FP; // one tile
export const DEFS: readonly KindDef[] = [
  { name: 'Warrior', hp: 60, mana: 0, acc: 8, def: 4, pdef: [2, 3, 1, 1], pabs: [2, 3, 1, 1], res: [0, 0, 0, 0, 0], min: 6, max: 10, elem: 0, reach: MELEE, ranged: false, cd: 20, speed: 100, caster: false, known: 0, auto: 0 },
  { name: 'Archer', hp: 40, mana: 0, acc: 9, def: 2, pdef: [1, 1, 1, 1], pabs: [0, 0, 0, 0], res: [0, 0, 0, 0, 0], min: 5, max: 8, elem: 0, reach: 7 * T, ranged: true, cd: 30, speed: 100, caster: false, known: 0, auto: 0 },
  { name: 'Hero', hp: 140, mana: 100, acc: 11, def: 6, pdef: [3, 4, 2, 2], pabs: [3, 4, 2, 2], res: [20, 10, 10, 10, 10], min: 9, max: 14, elem: 0, reach: MELEE, ranged: false, cd: 18, speed: 105, caster: true, known: ALL_SPELLS, auto: 0 },
  { name: 'Mage', hp: 35, mana: 70, acc: 8, def: 2, pdef: [0, 0, 0, 0], pabs: [0, 0, 0, 0], res: [10, 10, 10, 10, 30], min: 7, max: 11, elem: Elem.Water, reach: 6 * T, ranged: true, cd: 40, speed: 100, caster: true, known: MAGE_SPELLS, auto: 0 },
  { name: 'Gnoll', hp: 45, mana: 0, acc: 6, def: 3, pdef: [1, 1, 1, 1], pabs: [1, 2, 0, 0], res: [-25, 0, 0, 0, 0], min: 4, max: 8, elem: 0, reach: MELEE, ranged: false, cd: 25, speed: 100, caster: false, known: 0, auto: 0 },
  { name: 'Golem', hp: 130, mana: 0, acc: 7, def: 7, pdef: [3, 4, 2, 2], pabs: [5, 6, 4, 4], res: [20, 0, 30, 60, 0], min: 10, max: 16, elem: 0, reach: MELEE, ranged: false, cd: 32, speed: 70, caster: false, known: 0, auto: 0 },
  { name: 'Imp', hp: 30, mana: 30, acc: 7, def: 5, pdef: [0, 0, 0, 0], pabs: [0, 0, 0, 0], res: [80, -30, 0, 0, 0], min: 6, max: 9, elem: Elem.Fire, reach: 6 * T, ranged: true, cd: 35, speed: 110, caster: true, known: 1 << 3, auto: 4 },
];
const AGGRO = 7 * T;
const SWARM_SIGHT = 14 * T;
const ATTACK_SIGHT = 8 * T;
const LEASH = 10 * T;
const DEFEND_SIGHT = 6 * T;
const DEFEND_LEASH = 8 * T;
const FOLLOW = 3 * T;
const NEAR_POST = Math.round(1.5 * T);
const MAXP = 256;
const MAXS = 128;
const MAXB = 64;
const PSPEED = Math.round((9 * FP) / 25);
const PROJ_SCAN = 4; // monsters and allies look for a new target every 4th tick

export interface Fx {
  /** 0 hit, 1 miss, 2 death, 3 gold, 4 no mana, 5 area ring (v = radius x10 tiles), 6 spare, 7 heal, 8 status (v = id, +16 when it ends), 9 cast (v = spell), 10 corpse event (v: 0 burst, 1 raised, 2 mana), 11 blocked */
  type: number;
  x: number; // fixed point
  y: number;
  v: number;
  el: number;
}

export interface CombatSnap {
  hp: Int16Array;
  mana: Int16Array;
  ord: Uint8Array;
  tgt: Int32Array;
  aux: Int32Array;
  px: Int32Array;
  py: Int32Array;
  cd: Uint8Array;
  pAlive: Uint8Array;
  pX: Int32Array;
  pY: Int32Array;
  pT: Int32Array;
  pMin: Int16Array;
  pMax: Int16Array;
  pEl: Uint8Array;
  pAcc: Int8Array;
  sX: Int32Array;
  sY: Int32Array;
  sG: Int32Array;
  gold: Int32Array;
  pS: Uint8Array;
  pSrc: Int32Array;
  stMask: Uint16Array;
  stT: Int16Array;
  stV: Int16Array;
  corp: Int16Array;
  auto: Uint8Array;
  pPow: Int16Array;
  known: Uint32Array;
  manaMax: Int16Array;
  hpMax: Int16Array;
  mod: Int16Array;
  bX: Int32Array;
  bY: Int32Array;
  bI: Int16Array;
}

/** All combat state: structure of arrays, no objects, so it snapshots and hashes cheaply. */
export class CombatState {
  readonly kind: Uint8Array;
  hpMax: Int16Array;
  hp: Int16Array;
  manaMax: Int16Array;
  known: Uint32Array; // spell ids known, one bit each
  mod: Int16Array; // stat bonuses, see M
  pPow = new Int16Array(MAXP).fill(100); // spell power percent carried by a spell projectile
  bX = new Int32Array(MAXB); // item bags: position and item id + 1 (0 = free slot)
  bY = new Int32Array(MAXB);
  bI = new Int16Array(MAXB);
  mana: Int16Array;
  ord: Uint8Array;
  tgt: Int32Array;
  aux: Int32Array; // Defend: ward id; Pickup: sack index; Attack: 1 when the target is locked
  px: Int32Array; // post or goal point (fixed point)
  py: Int32Array;
  cd: Uint8Array;
  pAlive = new Uint8Array(MAXP);
  pX = new Int32Array(MAXP);
  pY = new Int32Array(MAXP);
  pT = new Int32Array(MAXP).fill(-1);
  pMin = new Int16Array(MAXP);
  pMax = new Int16Array(MAXP);
  pEl = new Uint8Array(MAXP);
  pAcc = new Int8Array(MAXP);
  pS = new Uint8Array(MAXP); // spell id + 1 carried by the projectile, 0 for a plain attack
  pSrc = new Int32Array(MAXP).fill(-1); // who shot it
  stMask: Uint16Array; // bit per active status; a unit with 0 costs nothing per tick
  stT: Int16Array; // ticks left, NST slots per unit
  stV: Int16Array; // shield points, poison stacks, burn damage
  corp: Int16Array; // ticks a dead unit's body can still be targeted
  auto: Uint8Array; // autocast spell id + 1, or 0
  sX = new Int32Array(MAXS);
  sY = new Int32Array(MAXS);
  sG = new Int32Array(MAXS); // gold in the sack; 0 = free slot
  gold = new Int32Array(4);
  alive = new Int32Array(4);
  /** Visual events for the renderer; not part of sim state. */
  fx: Fx[] = [];
  recordFx = false;
  /** Hit log for the debug overlay (newest last, at most LOG_MAX); null when off, so it costs nothing in play. */
  log: HitRec[] | null = null;

  constructor(
    readonly count: number,
    kinds: readonly number[],
    team: Uint8Array,
    hpMul: number,
  ) {
    this.kind = Uint8Array.from(kinds);
    this.hpMax = new Int16Array(count);
    for (let i = 0; i < count; i++) this.hpMax[i] = Math.min(32000, DEFS[this.kind[i]].hp * hpMul);
    this.hp = this.hpMax.slice();
    this.mana = new Int16Array(count);
    for (let i = 0; i < count; i++) this.mana[i] = DEFS[this.kind[i]].mana;
    this.manaMax = this.mana.slice();
    this.known = new Uint32Array(count);
    for (let i = 0; i < count; i++) this.known[i] = DEFS[this.kind[i]].known;
    this.mod = new Int16Array(count * MODN);
    this.ord = new Uint8Array(count);
    this.tgt = new Int32Array(count).fill(-1);
    this.aux = new Int32Array(count);
    this.px = new Int32Array(count);
    this.py = new Int32Array(count);
    this.cd = new Uint8Array(count);
    this.stMask = new Uint16Array(count);
    this.stT = new Int16Array(count * NST);
    this.stV = new Int16Array(count * NST);
    this.corp = new Int16Array(count);
    this.auto = new Uint8Array(count);
    for (let i = 0; i < count; i++) this.auto[i] = DEFS[this.kind[i]].auto;
    this.recount(team);
  }

  recount(team: Uint8Array): void {
    this.alive.fill(0);
    for (let i = 0; i < this.count; i++) if (this.hp[i] > 0) this.alive[team[i] & 3]++;
  }

  emit(type: number, x: number, y: number, v: number, el: number): void {
    if (this.recordFx && this.fx.length < 160) this.fx.push({ type, x, y, v, el });
  }

  hashInto(mix: (v: number) => void): void {
    for (let i = 0; i < this.count; i++) {
      mix(this.hp[i]);
      mix(this.mana[i]);
      mix(this.ord[i]);
      mix(this.tgt[i]);
      mix(this.aux[i]);
      mix(this.px[i]);
      mix(this.py[i]);
      mix(this.cd[i]);
      mix(this.corp[i]);
      mix(this.auto[i]);
      mix(this.hpMax[i]);
      mix(this.manaMax[i]);
      mix(this.known[i]);
      const m = this.stMask[i];
      if (m) {
        mix(m);
        for (let s = 0; s < NST; s++) if (m & (1 << s)) mix(this.stT[i * NST + s] * 31 + this.stV[i * NST + s]);
      }
    }
    for (let p = 0; p < MAXP; p++) {
      if (!this.pAlive[p]) continue;
      mix(p);
      mix(this.pX[p]);
      mix(this.pY[p]);
      mix(this.pT[p]);
      mix(this.pS[p]);
      mix(this.pPow[p]);
    }
    for (let s = 0; s < MAXS; s++) if (this.sG[s]) mix(this.sG[s] + s * 977);
    for (let b = 0; b < MAXB; b++) if (this.bI[b]) mix(this.bI[b] + b * 983);
    mix(this.gold[0]);
    mix(this.gold[1]);
  }

  snapshot(): CombatSnap {
    return {
      hp: this.hp.slice(), mana: this.mana.slice(), ord: this.ord.slice(), tgt: this.tgt.slice(), aux: this.aux.slice(),
      px: this.px.slice(), py: this.py.slice(), cd: this.cd.slice(),
      pAlive: this.pAlive.slice(), pX: this.pX.slice(), pY: this.pY.slice(), pT: this.pT.slice(),
      pMin: this.pMin.slice(), pMax: this.pMax.slice(), pEl: this.pEl.slice(), pAcc: this.pAcc.slice(),
      sX: this.sX.slice(), sY: this.sY.slice(), sG: this.sG.slice(), gold: this.gold.slice(),
      pS: this.pS.slice(), pSrc: this.pSrc.slice(), stMask: this.stMask.slice(), stT: this.stT.slice(), stV: this.stV.slice(), corp: this.corp.slice(), auto: this.auto.slice(),
      pPow: this.pPow.slice(), known: this.known.slice(), manaMax: this.manaMax.slice(), hpMax: this.hpMax.slice(), mod: this.mod.slice(),
      bX: this.bX.slice(), bY: this.bY.slice(), bI: this.bI.slice(),
    };
  }

  restore(s: CombatSnap, team: Uint8Array): void {
    this.hp = s.hp.slice(); this.mana = s.mana.slice(); this.ord = s.ord.slice(); this.tgt = s.tgt.slice(); this.aux = s.aux.slice();
    this.px = s.px.slice(); this.py = s.py.slice(); this.cd = s.cd.slice();
    this.pAlive = s.pAlive.slice(); this.pX = s.pX.slice(); this.pY = s.pY.slice(); this.pT = s.pT.slice();
    this.pMin = s.pMin.slice(); this.pMax = s.pMax.slice(); this.pEl = s.pEl.slice(); this.pAcc = s.pAcc.slice();
    this.sX = s.sX.slice(); this.sY = s.sY.slice(); this.sG = s.sG.slice(); this.gold = s.gold.slice();
    this.pS = s.pS.slice(); this.pSrc = s.pSrc.slice(); this.stMask = s.stMask.slice(); this.stT = s.stT.slice(); this.stV = s.stV.slice(); this.corp = s.corp.slice(); this.auto = s.auto.slice();
    this.pPow = s.pPow.slice(); this.known = s.known.slice(); this.manaMax = s.manaMax.slice(); this.hpMax = s.hpMax.slice(); this.mod = s.mod.slice();
    this.bX = s.bX.slice(); this.bY = s.bY.slice(); this.bI = s.bI.slice();
    this.recount(team);
  }
}

// ---- helpers ----

function dist(sim: Sim, i: number, x: number, y: number): number {
  const dx = sim.x[i] - x;
  const dy = sim.y[i] - y;
  return Math.sqrt(dx * dx + dy * dy);
}

function valid(sim: Sim, t: number): boolean {
  return t >= 0 && t < sim.count && sim.cb.hp[t] > 0;
}

/** Nearest living enemy within `range` of unit i (and within `leash` of the point cx, cy when leash > 0), or -1. */
export function enemyNear(sim: Sim, i: number, range: number, cx: number, cy: number, leash: number): number {
  const { w, h } = sim.map;
  const cs = sim.cellStart;
  const ci = sim.cellItems;
  const x = sim.x[i];
  const y = sim.y[i];
  const me = sim.team[i];
  const r = Math.ceil(range / FP);
  const tx = Math.floor(x / FP);
  const ty = Math.floor(y / FP);
  const hp = sim.cb.hp;
  let best = -1;
  let bd = range * range + 1;
  let bw = 1 << 30; // armour score of the best pick; only foes on hard hunt the weakest armour
  const hunt = me !== 0 && rulesOf(sim).hunt;
  const l2 = leash * leash;
  for (let gy = Math.max(0, ty - r); gy <= Math.min(h - 1, ty + r); gy++) {
    for (let gx = Math.max(0, tx - r); gx <= Math.min(w - 1, tx + r); gx++) {
      const c = gy * w + gx;
      for (let q = cs[c]; q < cs[c + 1]; q++) {
        const j = ci[q];
        if (sim.team[j] === me || hp[j] <= 0 || sim.peace[me * 4 + sim.team[j]]) continue;
        const dx = sim.x[j] - x;
        const dy = sim.y[j] - y;
        const d2 = dx * dx + dy * dy;
        if (d2 > range * range) continue;
        if (leash > 0 && (sim.x[j] - cx) ** 2 + (sim.y[j] - cy) ** 2 > l2) continue;
        const w = hunt ? partAbs(sim, j, 0) + partAbs(sim, j, 1) : 0;
        if (w > bw || (w === bw && (d2 > bd || (d2 === bd && j > best && best >= 0)))) continue;
        bw = w;
        bd = d2;
        best = j;
      }
    }
  }
  return best;
}

export function nearestSack(sim: Sim, x: number, y: number, maxDist: number): number {
  const cb = sim.cb;
  let best = -1;
  let bd = maxDist * maxDist;
  for (let s = 0; s < MAXS; s++) {
    if (!cb.sG[s]) continue;
    const d2 = (cb.sX[s] - x) ** 2 + (cb.sY[s] - y) ** 2;
    if (d2 <= bd) {
      bd = d2;
      best = s;
    }
  }
  return best;
}

/** Nearest loot within maxDist of a fixed-point point: a gold sack gives its index, an item bag gives MAXS + index; -1 when none. */
export function nearestLoot(sim: Sim, x: number, y: number, maxDist: number): number {
  const cb = sim.cb;
  const s = nearestSack(sim, x, y, maxDist);
  let best = -1;
  let bd = maxDist * maxDist;
  if (s >= 0) bd = (cb.sX[s] - x) ** 2 + (cb.sY[s] - y) ** 2;
  for (let b = 0; b < MAXB; b++) {
    if (!cb.bI[b]) continue;
    const d2 = (cb.bX[b] - x) ** 2 + (cb.bY[b] - y) ** 2;
    if (d2 <= bd && (s < 0 || d2 < bd)) {
      bd = d2;
      best = b;
    }
  }
  return best >= 0 ? MAXS + best : s;
}

export function lootPos(sim: Sim, code: number): [number, number] {
  const cb = sim.cb;
  return code >= MAXS ? [cb.bX[code - MAXS], cb.bY[code - MAXS]] : [cb.sX[code], cb.sY[code]];
}

export function toGuard(sim: Sim, i: number): void {
  const cb = sim.cb;
  cb.ord[i] = Ord.Guard;
  cb.tgt[i] = -1;
  cb.aux[i] = 0;
  cb.px[i] = sim.x[i];
  cb.py[i] = sim.y[i];
  if (sim.moving[i]) sim.stop(i);
}

// ---- damage ----

/** Defence of unit i on body part k: dodge plus the armour on that part. */
export function partDef(sim: Sim, i: number, k: number): number {
  const mo = i * MODN;
  return DEFS[sim.cb.kind[i]].def + sim.cb.mod[mo + M.Def] + DEFS[sim.cb.kind[i]].pdef[k] + sim.cb.mod[mo + M.PDef + k];
}

/** Absorption of unit i on body part k. */
export function partAbs(sim: Sim, i: number, k: number): number {
  const mo = i * MODN;
  return sim.cb.mod[mo + M.Abs] + DEFS[sim.cb.kind[i]].pabs[k] + sim.cb.mod[mo + M.PAbs + k];
}

/** Which body part a roll in 0..99 lands on. */
export function partOf(roll: number): number {
  for (let k = 0; k < PART_COUNT - 1; k++) {
    if (roll < PART_WEIGHT[k]) return k;
    roll -= PART_WEIGHT[k];
  }
  return PART_COUNT - 1;
}

const LOG_MAX = 200;
function logHit(sim: Sim, src: number, t: number, elem: number, part: number, chance: number, roll: number, raw: number, cut: number, dmg: number): void {
  const log = sim.cb.log!;
  if (log.length >= LOG_MAX) log.shift();
  log.push({ tick: sim.tick, src, t, elem, part, chance, roll, raw, cut, dmg });
}

/**
 * Resolve one attack or spell on `t`. A physical blow lands on a body part (head, torso, arms, legs), rolls to hit
 * against that part's defence and loses that part's absorption; the head takes half again. Schools cannot miss but are
 * scaled by resistance.
 */
export function strike(sim: Sim, t: number, min: number, max: number, elem: number, acc: number, src = -1): void {
  const cb = sim.cb;
  if (cb.hp[t] <= 0) return;
  const d = DEFS[cb.kind[t]];
  const mo = t * MODN;
  let dmg = min + sim.rng.int(max - min + 1);
  let part = -1;
  let chance = 100;
  let roll = 0;
  let raw = dmg;
  if (elem === Elem.Physical) {
    part = partOf(sim.rng.int(100));
    chance = Math.max(15, Math.min(95, 70 + (acc - partDef(sim, t, part)) * 3));
    roll = sim.rng.int(100);
    if (roll >= chance) {
      if (cb.log) logHit(sim, src, t, elem, part, chance, roll, raw, 0, -1);
      cb.emit(1, sim.x[t], sim.y[t], 0, 0);
      return;
    }
    raw = Math.floor((dmg * PART_DMG[part]) / 100);
    dmg = Math.max(1, raw - partAbs(sim, t, part));
    if (cb.stMask[t] & (1 << St.Stone)) dmg = Math.max(1, dmg >> 1); // stone halves blows
    if (sim.hero !== null && t === sim.hero.id) heroUse(sim, 1); // Guard grows with blows taken
  } else {
    const res = Math.min(90, d.res[elem - 1] + cb.mod[mo + M.Res + elem - 1]);
    dmg = Math.max(0, Math.floor((dmg * (100 - res)) / 100));
  }
  if (src >= 0 && sim.team[t] === 0 && sim.team[src] !== 0) {
    const pct = rulesOf(sim).foeHitPct;
    if (pct !== 100 && dmg > 0) dmg = Math.max(1, Math.floor((dmg * pct) / 100));
  }
  const cut = raw - dmg;
  if (cb.stMask[t] & (1 << St.Shield)) {
    const k = t * NST + St.Shield;
    const soak = Math.min(cb.stV[k], dmg);
    cb.stV[k] -= soak;
    dmg -= soak;
    if (cb.stV[k] <= 0) {
      cb.stMask[t] &= ~(1 << St.Shield);
      cb.stT[k] = 0;
      cb.emit(8, sim.x[t], sim.y[t], St.Shield + 16, 0);
    }
    if (dmg === 0) cb.emit(11, sim.x[t], sim.y[t], soak, 0);
  }
  cb.hp[t] -= dmg;
  if (cb.log) logHit(sim, src, t, elem, part, chance, roll, raw, cut, dmg);
  if (dmg > 0 || !(cb.stMask[t] & (1 << St.Shield))) cb.emit(0, sim.x[t], sim.y[t], dmg, elem);
  if (cb.hp[t] <= 0) die(sim, t);
}

function die(sim: Sim, t: number): void {
  dropLoot(sim, t);
  const cb = sim.cb;
  cb.hp[t] = 0;
  cb.alive[sim.team[t] & 3]--;
  cb.ord[t] = Ord.Still;
  cb.tgt[t] = -1;
  cb.corp[t] = rulesOf(sim).corpse;
  clearAllStatuses(sim, t);
  sim.stop(t);
  cb.emit(2, sim.x[t], sim.y[t], 0, 0);
  if (sim.team[t] !== 0) {
    for (let s = 0; s < MAXS; s++) {
      if (cb.sG[s]) continue;
      cb.sX[s] = sim.x[t];
      cb.sY[s] = sim.y[t];
      cb.sG[s] = 4 + sim.rng.int(9) + (cb.kind[t] === Kind.Golem ? 20 : 0);
      break;
    }
  }
}

/** Start a projectile at a fixed-point point. `sid` >= 0 makes it a spell: it casts that spell's effect on arrival. */
export function launch(sim: Sim, ox: number, oy: number, t: number, min: number, max: number, elem: number, acc: number, sid = -1, pow = 100, src = -1): void {
  const cb = sim.cb;
  for (let p = 0; p < MAXP; p++) {
    if (cb.pAlive[p]) continue;
    cb.pAlive[p] = 1;
    cb.pSrc[p] = src;
    cb.pPow[p] = pow;
    cb.pX[p] = ox;
    cb.pY[p] = oy;
    cb.pT[p] = t;
    cb.pMin[p] = min;
    cb.pMax[p] = max;
    cb.pEl[p] = elem;
    cb.pAcc[p] = acc;
    cb.pS[p] = sid + 1;
    return;
  }
  if (sid >= 0) spellHit(sim, t, sid, pow);
  else strike(sim, t, min, max, elem, acc, src); // pool full: hit at once
}

function attack(sim: Sim, i: number, t: number): void {
  const cb = sim.cb;
  const d = DEFS[cb.kind[i]];
  const m = cb.stMask[i];
  let cd = d.cd;
  const mo = i * MODN;
  let min = d.min + cb.mod[mo + M.Min];
  let max = d.max + cb.mod[mo + M.Max];
  let acc = d.acc + cb.mod[mo + M.Acc];
  if (sim.hero !== null && i === sim.hero.id) heroUse(sim, 0); // Blade grows with blows struck
  if (m) {
    if (m & (1 << St.Haste)) cd = Math.round(cd * 0.7);
    else if (m & (1 << St.Slow)) cd = Math.round(cd * 1.4);
    if (m & (1 << St.Bless)) {
      min = Math.floor((min * 125) / 100);
      max = Math.floor((max * 125) / 100);
      acc += 3;
    }
    if (m & (1 << St.Weaken)) {
      min = Math.max(1, Math.floor((min * 70) / 100));
      max = Math.max(1, Math.floor((max * 70) / 100));
    }
  }
  cb.cd[i] = cd;
  if (d.ranged) {
    if (d.elem === 0) cb.emit(12, sim.x[i], sim.y[i], 0, 0);
    launch(sim, sim.x[i], sim.y[i], t, min, max, d.elem, acc, -1, 100, i);
  }
  else strike(sim, t, min, max, d.elem, acc, i);
}

function stepProjectiles(sim: Sim): void {
  const cb = sim.cb;
  for (let p = 0; p < MAXP; p++) {
    if (!cb.pAlive[p]) continue;
    const t = cb.pT[p];
    if (cb.hp[t] <= 0) {
      cb.pAlive[p] = 0;
      continue;
    }
    const dx = sim.x[t] - cb.pX[p];
    const dy = sim.y[t] - cb.pY[p];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= PSPEED + 40) {
      cb.pAlive[p] = 0;
      if (cb.pS[p] > 0) spellHit(sim, t, cb.pS[p] - 1, cb.pPow[p]);
      else strike(sim, t, cb.pMin[p], cb.pMax[p], cb.pEl[p], cb.pAcc[p], cb.pSrc[p]);
    } else {
      cb.pX[p] += Math.round((dx * PSPEED) / d);
      cb.pY[p] += Math.round((dy * PSPEED) / d);
    }
  }
}

// ---- unit behaviour ----

/** Close in on `t` and attack when in reach. */
function fight(sim: Sim, i: number, t: number): void {
  const cb = sim.cb;
  const d = DEFS[cb.kind[i]];
  const dd = dist(sim, i, sim.x[t], sim.y[t]);
  if (dd <= d.reach) {
    if (sim.moving[i]) sim.stop(i);
    sim.dir[i] = dir16(sim.x[t] - sim.x[i], sim.y[t] - sim.y[i]);
    if (cb.cd[i] === 0) attack(sim, i, t);
    return;
  }
  const same = Math.floor(sim.tx[i] / FP) === Math.floor(sim.x[t] / FP) && Math.floor(sim.ty[i] / FP) === Math.floor(sim.y[t] / FP);
  if (!sim.moving[i] || (!same && ((sim.tick + i) & 7) === 0)) sim.goTo(i, sim.x[t], sim.y[t]);
}

function returnTo(sim: Sim, i: number, x: number, y: number, slack: number): void {
  if (dist(sim, i, x, y) <= slack) {
    if (sim.moving[i] && sim.tx[i] === x && sim.ty[i] === y) return;
    if (sim.moving[i]) sim.stop(i);
    return;
  }
  if (!sim.moving[i] || sim.tx[i] !== x || sim.ty[i] !== y) sim.goTo(i, x, y);
}

function unitThink(sim: Sim, i: number): void {
  const cb = sim.cb;
  const d = DEFS[cb.kind[i]];
  const scan = ((sim.tick + i) & (PROJ_SCAN - 1)) === 0;
  let t = cb.tgt[i];
  const o = cb.ord[i];
  if (scan && cb.auto[i] && (o === Ord.Guard || o === Ord.Hold || o === Ord.Swarm || o === Ord.Attack || o === Ord.Defend) && autoCast(sim, i)) return;
  switch (o) {
    case Ord.Still:
      return;
    case Ord.Move:
    case Ord.Retreat:
      if (!sim.moving[i]) toGuard(sim, i);
      return;
    case Ord.Guard: {
      if (valid(sim, t) && (sim.x[t] - cb.px[i]) ** 2 + (sim.y[t] - cb.py[i]) ** 2 > LEASH * LEASH) t = -1;
      if (!valid(sim, t)) t = scan ? enemyNear(sim, i, AGGRO, cb.px[i], cb.py[i], LEASH) : -1;
      cb.tgt[i] = t;
      if (t >= 0) fight(sim, i, t);
      else returnTo(sim, i, cb.px[i], cb.py[i], NEAR_POST);
      return;
    }
    case Ord.Hold: {
      if (!valid(sim, t) || dist(sim, i, sim.x[t], sim.y[t]) > d.reach) t = (sim.tick + i) & 1 ? -1 : enemyNear(sim, i, d.reach, 0, 0, 0);
      cb.tgt[i] = t;
      if (t >= 0) {
        sim.dir[i] = dir16(sim.x[t] - sim.x[i], sim.y[t] - sim.y[i]);
        if (cb.cd[i] === 0) attack(sim, i, t);
      }
      return;
    }
    case Ord.Attack: {
      if (cb.aux[i] === 1) {
        if (valid(sim, t)) fight(sim, i, t);
        else toGuard(sim, i);
        return;
      }
      if (!valid(sim, t)) t = scan ? enemyNear(sim, i, ATTACK_SIGHT, 0, 0, 0) : -1;
      cb.tgt[i] = t;
      if (t >= 0) fight(sim, i, t);
      else if (dist(sim, i, cb.px[i], cb.py[i]) <= NEAR_POST && !sim.moving[i]) toGuard(sim, i);
      else if (!sim.moving[i] || sim.tx[i] !== cb.px[i]) sim.goTo(i, cb.px[i], cb.py[i]);
      return;
    }
    case Ord.Swarm: {
      if (!valid(sim, t)) t = scan ? enemyNear(sim, i, SWARM_SIGHT, 0, 0, 0) : -1;
      cb.tgt[i] = t;
      if (t >= 0) fight(sim, i, t);
      else if (dist(sim, i, cb.px[i], cb.py[i]) > NEAR_POST) returnTo(sim, i, cb.px[i], cb.py[i], NEAR_POST);
      return;
    }
    case Ord.Defend: {
      const w = cb.aux[i];
      if (!valid(sim, w)) {
        toGuard(sim, i);
        return;
      }
      const wx = sim.x[w];
      const wy = sim.y[w];
      if (valid(sim, t) && (sim.x[t] - wx) ** 2 + (sim.y[t] - wy) ** 2 > DEFEND_LEASH * DEFEND_LEASH) t = -1;
      if (!valid(sim, t)) t = scan ? enemyNear(sim, i, DEFEND_SIGHT, wx, wy, DEFEND_LEASH) : -1;
      cb.tgt[i] = t;
      if (t >= 0) fight(sim, i, t);
      else if (dist(sim, i, wx, wy) > FOLLOW) {
        if (!sim.moving[i] || ((sim.tick + i) & 7) === 0) sim.goTo(i, wx, wy);
      } else if (sim.moving[i]) sim.stop(i);
      return;
    }
    case Ord.Cast: {
      const sid = cb.aux[i];
      if (!d.caster || !knows(sim, i, sid)) {
        toGuard(sim, i);
        return;
      }
      const sp = SPELLS[sid];
      let gx = sim.x[i];
      let gy = sim.y[i];
      if (sp.tk === Tk.Ground) {
        gx = cb.px[i];
        gy = cb.py[i];
      } else if (sp.tk !== Tk.Self) {
        if (!validTarget(sim, i, sid, t)) {
          toGuard(sim, i);
          return;
        }
        gx = sim.x[t];
        gy = sim.y[t];
      }
      if (sp.tk !== Tk.Self && dist(sim, i, gx, gy) > sp.reach * FP) {
        if (!sim.moving[i] || ((sim.tick + i) & 7) === 0) sim.goTo(i, gx, gy);
        return;
      }
      if (sim.moving[i]) sim.stop(i);
      if (sp.tk !== Tk.Self) sim.dir[i] = dir16(gx - sim.x[i], gy - sim.y[i]);
      if (cb.cd[i] > 0) return;
      if (cb.mana[i] < sp.cost) {
        cb.emit(4, sim.x[i], sim.y[i], 0, 0);
        toGuard(sim, i);
        return;
      }
      castSpell(sim, i, sid, t, gx, gy);
      toGuard(sim, i);
      return;
    }
    case Ord.Pickup: {
      const s = cb.aux[i];
      if (s >= MAXS) {
        const b = s - MAXS;
        if (b >= MAXB || !cb.bI[b] || sim.hero === null || sim.hero.id !== i) {
          toGuard(sim, i);
          return;
        }
        if (dist(sim, i, cb.bX[b], cb.bY[b]) <= Math.round(0.8 * FP)) {
          pickBag(sim, b);
          toGuard(sim, i);
          return;
        }
        if (!sim.moving[i]) sim.goTo(i, cb.bX[b], cb.bY[b]);
        return;
      }
      if (s < 0 || !cb.sG[s] || s >= MAXS) {
        toGuard(sim, i);
        return;
      }
      if (dist(sim, i, cb.sX[s], cb.sY[s]) <= Math.round(0.8 * FP)) {
        cb.gold[sim.team[i] & 3] += cb.sG[s];
        cb.emit(3, cb.sX[s], cb.sY[s], cb.sG[s], 0);
        cb.sG[s] = 0;
        toGuard(sim, i);
        return;
      }
      if (!sim.moving[i]) sim.goTo(i, cb.sX[s], cb.sY[s]);
    }
  }
}

/** One combat tick: mana, unit decisions, projectiles. Runs after commands and before steering. */
export function think(sim: Sim): void {
  const cb = sim.cb;
  const regen = sim.tick % 25 === 0;
  for (let i = 0; i < sim.count; i++) {
    if (cb.hp[i] <= 0) {
      if (cb.corp[i] > 0) cb.corp[i]--;
      continue;
    }
    if (sim.hidden[i]) continue;
    if (regen && cb.mana[i] < cb.manaMax[i]) cb.mana[i] = Math.min(cb.manaMax[i], cb.mana[i] + 1 + cb.mod[i * MODN + M.Regen]);
    if (cb.cd[i] > 0) cb.cd[i]--;
    const m = cb.stMask[i];
    if (m) {
      statusTick(sim, i);
      if (cb.hp[i] <= 0) continue;
      if (cb.stMask[i] & (1 << St.Stone)) {
        if (sim.moving[i]) sim.stop(i);
        continue;
      }
    }
    unitThink(sim, i);
  }
  stepProjectiles(sim);
}

export const POOLS = { projectiles: MAXP, sacks: MAXS, bags: MAXB };
