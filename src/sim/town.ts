import { isBlockedAt } from '../map';
import { Did, SKILL_MAX, Why, addItem, blocker, recalc, takeItem } from './hero';
import { mercPrice } from './difficulty';
import { ITEMS, Ik } from './items';
import { FP } from './path';
import type { Sim } from './sim';

/**
 * Towns inside a mission: tavern (mercenaries, quests), shop (one trade screen) and school (spells,
 * skill training). The static part comes from the map file; the changing part (shop stock, quest
 * offers, active quests, who is inside) lives in the sim, is saved with it and only changes through
 * `town` commands, so a replay and a reloaded save play out exactly the same.
 */

export const Role = { Tavern: 0, Shop: 1, School: 2 } as const;
export const ROLE_COUNT = 3;
export const SHELF = 12; // shop shelf slots, 4 x 3
export const OFFERS = 3;
export const MAX_QUESTS = 3;
const REACH = 4.5; // tiles from a building's centre to enter it
const CHECK_EVERY = 25; // quests are checked once a second

export interface MercDef {
  unit: number; // a dormant team-0 unit of the map
  price: number;
}
export interface NpcDef {
  name: string;
  x: number;
  y: number;
  text: string; // key into the map text
}
export interface TownDef {
  name: string;
  tavern?: number; // index among the map's House objects
  shop?: number;
  school?: number;
  tiers?: [number, number]; // shop and quest item tiers, default 1..2
  spells?: number[]; // spells the school teaches
  mercs?: MercDef[];
  npcs?: NpcDef[];
}

/** A town with its buildings resolved to tiles. Built from the map, never saved. */
export interface TownRt {
  def: TownDef;
  centre: ([number, number] | null)[]; // by role, in tiles
  door: ([number, number] | null)[]; // free tile in front of each building
}

export const QuestType = { Slay: 0, Cull: 1, Clear: 2, Hunt: 3, Timed: 4, Scout: 5, Patrol: 6, Deliver: 7, Fetch: 8, Wealth: 9, Gather: 10, Practice: 11, Guard: 12 } as const;
export const QUEST_TYPES = 13;

export interface Quest {
  type: number;
  town: number;
  reward: number;
  a: number; // type-specific: target unit, kind, count, item, skill
  b: number; // type-specific: count, time limit in ticks, seconds needed
  base: number; // counter value when accepted
  start: number; // tick accepted
  ids: number[]; // Clear: the foes to kill
  pts: number[]; // x0, y0, x1, y1, ... tiles to reach
  prog: number; // Patrol: next point; Guard: ticks held
}

export interface TownState {
  stock: number[][]; // per town, item id per shelf slot (-1 empty)
  offers: Quest[][]; // per town
  quests: Quest[];
  inside: number; // town * ROLE_COUNT + role, or -1
  paid: number; // gold earned from quests, all told
}

export type TownOp = 'enter' | 'leave' | 'buy' | 'sell' | 'hire' | 'learn' | 'train' | 'accept';
/** `v`: role (enter), merc index (hire), spell (learn), skill (train), offer (accept). `list`: shelf slots (buy) or item ids (sell). */
export type TownCommand = { type: 'town'; op: TownOp; town: number; v?: number; list?: number[] };

/** Town fx (cb.emit types): 20 quest paid (v reward, el type), 21 quest failed (el type), 22 mercenary hired (v unit), 23 trade (v gold, el 0 bought 1 sold 2 learned 3 trained). */
export const Tfx = { Paid: 20, Failed: 21, Hired: 22, Trade: 23 } as const;

export function newTownState(towns: number): TownState {
  return { stock: Array.from({ length: towns }, () => Array<number>(SHELF).fill(-1)), offers: Array.from({ length: towns }, () => []), quests: [], inside: -1, paid: 0 };
}

export const cloneTown = (t: TownState): TownState => structuredClone(t);

// ---- prices ----

export function priceOf(id: number): number {
  const d = ITEMS[id];
  if (d.kind === Ik.Gear) return 30 * d.tier * d.tier;
  if (d.kind === Ik.Potion) return d.grow ? 150 * d.tier : 12 * d.tier;
  return 50 * d.tier * (d.w > 1 ? 2 : 1);
}
export const sellPrice = (id: number): number => priceOf(id) >> 1;

/** The scroll or tome that teaches spell `s` (lowest tier), or -1. */
export function teacherOf(s: number): number {
  let best = -1;
  ITEMS.forEach((d, id) => {
    if (d.kind === Ik.Learn && d.spell === s && (best < 0 || d.tier < ITEMS[best].tier)) best = id;
  });
  return best;
}
export function spellPrice(s: number): number {
  const t = teacherOf(s);
  return t < 0 ? 80 : 100 * ITEMS[t].tier;
}
export const trainPrice = (level: number): number => 60 * (level + 1) * (level + 1);

// ---- setup ----

/** Resolve the towns of a map: building centres and a free tile in front of each. */
export function buildTowns(sim: Sim, defs: readonly TownDef[]): TownRt[] {
  const houses = sim.map.objects.filter((o) => o.kind === 1);
  return defs.map((def) => {
    const centre: TownRt['centre'] = [];
    const door: TownRt['door'] = [];
    [def.tavern, def.shop, def.school].forEach((b, role) => {
      const h = b === undefined ? undefined : houses[b];
      centre[role] = h ? [h.x + 1, h.y + 1] : null;
      door[role] = h ? freeNear(sim, h.x, h.y + 2) : null;
    });
    return { def, centre, door };
  });
}

function freeNear(sim: Sim, x: number, y: number): [number, number] {
  for (let r = 0; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!isBlockedAt(sim.map, x + dx, y + dy)) return [x + dx, y + dy];
      }
    }
  }
  return [x, y];
}

// ---- helpers ----

const heroTile = (sim: Sim): [number, number] => [sim.x[sim.hero!.id] / FP, sim.y[sim.hero!.id] / FP];
const near = (sim: Sim, x: number, y: number, r: number): boolean => {
  const [hx, hy] = heroTile(sim);
  return Math.abs(hx - x - 0.5) <= r && Math.abs(hy - y - 0.5) <= r;
};
const foe = (sim: Sim, u: number): boolean => sim.team[u] !== 0 && sim.cb.hp[u] > 0 && sim.hidden[u] === 0;
function deadFoes(sim: Sim, kind: number): number {
  let n = 0;
  for (let u = 0; u < sim.count; u++) if (sim.team[u] !== 0 && sim.cb.hp[u] <= 0 && (kind < 0 || sim.cb.kind[u] === kind)) n++;
  return n;
}
const packCount = (sim: Sim): number => sim.hero!.inv.reduce((n, s) => n + s.n, 0);

function emit(sim: Sim, type: number, v: number, el: number): void {
  const i = sim.hero ? sim.hero.id : 0;
  sim.cb.emit(type, sim.x[i], sim.y[i], v, el);
}
function refuse(sim: Sim, why: number): void {
  emit(sim, 15, why, 0);
}

// ---- commands ----

export function townCommand(sim: Sim, cmd: TownCommand): void {
  const h = sim.hero;
  const st = sim.town;
  const rt = sim.towns[cmd.town];
  if (h === null || rt === undefined) return;
  if (sim.cb.hp[h.id] <= 0) return refuse(sim, Why.Dead);
  if (cmd.op === 'enter') {
    const role = cmd.v ?? -1;
    const c = rt.centre[role];
    if (!c) return;
    if (!near(sim, c[0] - 0.5, c[1] - 0.5, REACH)) return refuse(sim, Why.Far);
    st.inside = cmd.town * ROLE_COUNT + role;
    if (role === Role.Shop) rollStock(sim, cmd.town);
    if (role === Role.Tavern) {
      handIn(sim, cmd.town);
      rollOffers(sim, cmd.town);
    }
    return;
  }
  if (cmd.op === 'leave') {
    st.inside = -1;
    return;
  }
  const role = { buy: Role.Shop, sell: Role.Shop, hire: Role.Tavern, accept: Role.Tavern, learn: Role.School, train: Role.School }[cmd.op];
  if (st.inside !== cmd.town * ROLE_COUNT + role) return;
  const gold = sim.cb.gold;
  const v = cmd.v ?? -1;
  switch (cmd.op) {
    case 'buy': {
      const shelf = st.stock[cmd.town];
      const slots = [...new Set(cmd.list ?? [])].filter((k) => k >= 0 && k < SHELF && shelf[k] >= 0);
      const cost = slots.reduce((s, k) => s + priceOf(shelf[k]), 0);
      if (cost > gold[0]) return refuse(sim, Why.Gold);
      let spent = 0;
      for (const k of slots) {
        const why = addItem(h, shelf[k]);
        if (why) {
          refuse(sim, why);
          break;
        }
        spent += priceOf(shelf[k]);
        shelf[k] = -1;
      }
      gold[0] -= spent;
      if (spent) {
        recalc(sim);
        emit(sim, Tfx.Trade, spent, 0);
      }
      return;
    }
    case 'sell': {
      let got = 0;
      for (const id of cmd.list ?? []) {
        if (id < 0 || id >= ITEMS.length || !takeItem(h, id)) continue;
        got += sellPrice(id);
      }
      gold[0] += got;
      if (got) {
        recalc(sim);
        emit(sim, Tfx.Trade, got, 1);
      }
      return;
    }
    case 'hire': {
      const m = rt.def.mercs?.[v];
      if (!m || sim.hidden[m.unit] === 0 || sim.cb.hp[m.unit] <= 0) return;
      const fee = mercPrice(sim, m.price);
      if (fee > gold[0]) return refuse(sim, Why.Gold);
      gold[0] -= fee;
      const [dx, dy] = rt.door[Role.Tavern]!;
      const u = m.unit;
      sim.x[u] = sim.tx[u] = sim.cb.px[u] = Math.round((dx + 0.5) * FP);
      sim.y[u] = sim.ty[u] = sim.cb.py[u] = Math.round((dy + 0.5) * FP);
      sim.stop(u);
      sim.hidden[u] = 0;
      sim.cb.recount(sim.team);
      emit(sim, Tfx.Hired, u, 0);
      return;
    }
    case 'learn': {
      if (!(rt.def.spells ?? []).includes(v)) return;
      if ((h.known >>> v) & 1) return refuse(sim, Why.Known);
      const t = teacherOf(v);
      if (t >= 0 && blocker(h, t) === Why.Need) return refuse(sim, Why.Need);
      const p = spellPrice(v);
      if (p > gold[0]) return refuse(sim, Why.Gold);
      gold[0] -= p;
      h.known |= 1 << v;
      recalc(sim);
      emit(sim, Tfx.Trade, p, 2);
      if (t >= 0) emit(sim, 14, t, Did.Learn);
      return;
    }
    case 'train': {
      if (v < 0 || v > 2) return;
      if (h.skill[v] >= SKILL_MAX) return refuse(sim, Why.NoEffect);
      const p = trainPrice(h.skill[v]);
      if (p > gold[0]) return refuse(sim, Why.Gold);
      gold[0] -= p;
      h.skill[v]++;
      h.use[v] = 0;
      recalc(sim);
      emit(sim, Tfx.Trade, p, 3);
      emit(sim, 6, v, h.skill[v]);
      return;
    }
    case 'accept': {
      const offers = st.offers[cmd.town];
      if (v < 0 || v >= offers.length) return;
      if (st.quests.length >= MAX_QUESTS) return refuse(sim, Why.Busy);
      const q = offers.splice(v, 1)[0];
      q.start = sim.tick;
      q.base = baseOf(sim, q);
      st.quests.push(q);
      return;
    }
  }
}

// ---- shop ----

function rollStock(sim: Sim, town: number): void {
  const [lo, hi] = sim.towns[town].def.tiers ?? [1, 2];
  const pool: number[] = [];
  ITEMS.forEach((d, id) => {
    if (d.tier >= lo && d.tier <= hi) pool.push(id);
  });
  const shelf = Array<number>(SHELF).fill(-1);
  let k = 0;
  for (const name of ['Healing Draught', 'Mana Draught']) {
    const id = ITEMS.findIndex((d) => d.name === name);
    if (id >= 0) shelf[k++] = id;
  }
  const n = Math.min(SHELF, k + 6 + sim.rng.int(5));
  while (k < n && pool.length > 0) shelf[k++] = pool[sim.rng.int(pool.length)];
  sim.town.stock[town] = shelf;
}

// ---- quests ----

function farPoint(sim: Sim, from: [number, number], min: number): [number, number] | null {
  for (let tries = 0; tries < 30; tries++) {
    const x = sim.rng.int(sim.map.w);
    const y = sim.rng.int(sim.map.h);
    if (isBlockedAt(sim.map, x, y)) continue;
    if (Math.hypot(x - from[0], y - from[1]) >= min) return [x, y];
  }
  return null;
}

/** Roll one offer of type `type`, or null when the map cannot support it now. */
export function makeQuest(sim: Sim, town: number, type: number): Quest | null {
  const rt = sim.towns[town];
  const home = rt.door[Role.Tavern] ?? rt.centre.find((c) => c) ?? [0, 0];
  const q: Quest = { type, town, reward: 0, a: 0, b: 0, base: 0, start: 0, ids: [], pts: [], prog: 0 };
  const foes: number[] = [];
  for (let u = 0; u < sim.count; u++) if (foe(sim, u)) foes.push(u);
  const pickFoe = (): number => foes[sim.rng.int(foes.length)];
  switch (type) {
    case QuestType.Slay: {
      if (!foes.length) return null;
      q.a = pickFoe();
      q.pts = [Math.floor(sim.x[q.a] / FP), Math.floor(sim.y[q.a] / FP)];
      q.reward = 40 + (sim.cb.hpMax[q.a] >> 1);
      break;
    }
    case QuestType.Cull: {
      if (!foes.length) return null;
      q.a = sim.cb.kind[pickFoe()];
      const left = foes.filter((u) => sim.cb.kind[u] === q.a).length;
      q.b = Math.min(left, 2 + sim.rng.int(3));
      q.reward = 25 * q.b;
      break;
    }
    case QuestType.Clear: {
      if (!foes.length) return null;
      const c = pickFoe();
      q.ids = foes.filter((u) => Math.abs(sim.x[u] - sim.x[c]) <= 5 * FP && Math.abs(sim.y[u] - sim.y[c]) <= 5 * FP).slice(0, 8);
      q.pts = [Math.floor(sim.x[c] / FP), Math.floor(sim.y[c] / FP)];
      q.reward = 30 + 20 * q.ids.length;
      break;
    }
    case QuestType.Hunt:
    case QuestType.Timed: {
      if (foes.length < 2) return null;
      q.a = Math.min(foes.length, type === QuestType.Hunt ? 4 + sim.rng.int(5) : 3 + sim.rng.int(3));
      if (type === QuestType.Timed) q.b = 90 * 25;
      q.reward = (type === QuestType.Hunt ? 15 : 30) * q.a;
      break;
    }
    case QuestType.Scout:
    case QuestType.Patrol:
    case QuestType.Guard: {
      const n = type === QuestType.Patrol ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const p = farPoint(sim, home, type === QuestType.Guard ? 8 : 12);
        if (!p) return null;
        q.pts.push(...p);
      }
      if (type === QuestType.Guard) q.b = 30 * 25;
      q.reward = type === QuestType.Patrol ? 70 : type === QuestType.Guard ? 50 : 40;
      break;
    }
    case QuestType.Deliver: {
      const spots: [number, number, number][] = []; // x, y, town index (npc) or -1
      sim.towns.forEach((t, ti) => {
        for (const n of t.def.npcs ?? []) spots.push([n.x, n.y, ti]);
        if (ti !== town) for (const c of t.centre) if (c) spots.push([c[0], c[1] + 1, ti]);
      });
      const far = spots.filter(([x, y]) => Math.hypot(x - home[0], y - home[1]) >= 6);
      if (far.length) {
        const s = far[sim.rng.int(far.length)];
        q.pts = [s[0], s[1]];
      } else {
        const p = farPoint(sim, home, 12);
        if (!p) return null;
        q.pts = p;
      }
      q.reward = 35;
      break;
    }
    case QuestType.Fetch: {
      const [lo, hi] = rt.def.tiers ?? [1, 2];
      const pool: number[] = [];
      ITEMS.forEach((d, id) => {
        if (d.kind !== Ik.Learn && d.tier >= lo && d.tier <= hi) pool.push(id);
      });
      if (!pool.length) return null;
      q.a = pool[sim.rng.int(pool.length)];
      q.reward = priceOf(q.a) + 30;
      break;
    }
    case QuestType.Wealth:
      q.a = 50 + 25 * sim.rng.int(4);
      q.reward = q.a >> 1;
      break;
    case QuestType.Gather:
      q.a = 2 + sim.rng.int(3);
      q.reward = 20 * q.a;
      break;
    case QuestType.Practice: {
      const open = [0, 1, 2].filter((s) => sim.hero!.skill[s] < SKILL_MAX);
      if (!open.length) return null;
      q.a = open[sim.rng.int(open.length)];
      q.reward = 60;
      break;
    }
    default:
      return null;
  }
  return q;
}

function rollOffers(sim: Sim, town: number): void {
  const out: Quest[] = [];
  for (let tries = 0; tries < 12 && out.length < OFFERS; tries++) {
    const type = sim.rng.int(QUEST_TYPES);
    if (out.some((q) => q.type === type)) continue;
    const q = makeQuest(sim, town, type);
    if (q) out.push(q);
  }
  sim.town.offers[town] = out;
}

function baseOf(sim: Sim, q: Quest): number {
  switch (q.type) {
    case QuestType.Cull:
      return deadFoes(sim, q.a);
    case QuestType.Hunt:
    case QuestType.Timed:
      return deadFoes(sim, -1);
    case QuestType.Wealth:
      return sim.cb.gold[0];
    case QuestType.Gather:
      return packCount(sim);
    case QuestType.Practice:
      return sim.hero!.skill[q.a];
    default:
      return 0;
  }
}

function pay(sim: Sim, k: number): void {
  const q = sim.town.quests[k];
  sim.cb.gold[0] += q.reward;
  sim.town.paid += q.reward;
  sim.town.quests.splice(k, 1);
  emit(sim, Tfx.Paid, q.reward, q.type);
}

/** Fetch quests are handed in at their own tavern. */
function handIn(sim: Sim, town: number): void {
  const qs = sim.town.quests;
  for (let k = qs.length - 1; k >= 0; k--) {
    const q = qs[k];
    if (q.type !== QuestType.Fetch || q.town !== town) continue;
    if (!takeItem(sim.hero!, q.a)) continue;
    recalc(sim);
    pay(sim, k);
  }
}

/** Is quest `q` fulfilled now? May advance its progress. */
function fulfilled(sim: Sim, q: Quest): boolean {
  switch (q.type) {
    case QuestType.Slay:
      return sim.cb.hp[q.a] <= 0;
    case QuestType.Cull:
      return deadFoes(sim, q.a) - q.base >= q.b;
    case QuestType.Clear:
      return q.ids.every((u) => sim.cb.hp[u] <= 0);
    case QuestType.Hunt:
    case QuestType.Timed:
      return deadFoes(sim, -1) - q.base >= q.a;
    case QuestType.Scout:
    case QuestType.Deliver:
      return near(sim, q.pts[0], q.pts[1], 2);
    case QuestType.Patrol:
      if (near(sim, q.pts[q.prog * 2], q.pts[q.prog * 2 + 1], 2)) q.prog++;
      return q.prog >= 3;
    case QuestType.Wealth:
      return sim.cb.gold[0] - q.base >= q.a;
    case QuestType.Gather:
      return packCount(sim) - q.base >= q.a;
    case QuestType.Practice:
      return sim.hero!.skill[q.a] > q.base;
    case QuestType.Guard:
      if (near(sim, q.pts[0], q.pts[1], 3)) q.prog += CHECK_EVERY;
      return q.prog >= q.b;
    default:
      return false;
  }
}

/** Once a second: pay finished quests and drop expired ones. */
export function checkQuests(sim: Sim): void {
  const h = sim.hero;
  if (h === null || sim.cb.hp[h.id] <= 0 || sim.tick % CHECK_EVERY !== 12) return;
  const qs = sim.town.quests;
  for (let k = qs.length - 1; k >= 0; k--) {
    const q = qs[k];
    if (fulfilled(sim, q)) pay(sim, k);
    else if (q.type === QuestType.Timed && sim.tick - q.start > q.b) {
      qs.splice(k, 1);
      emit(sim, Tfx.Failed, 0, q.type);
    }
  }
}

export function hashTown(t: TownState, mix: (v: number) => void): void {
  mix(t.inside + 1);
  mix(t.paid);
  for (const s of t.stock) for (const v of s) mix(v + 1);
  for (const q of [...t.offers.flat(), ...t.quests]) {
    mix(q.type);
    mix(q.town);
    mix(q.a);
    mix(q.b);
    mix(q.base);
    mix(q.start);
    mix(q.prog);
    mix(q.reward);
    for (const v of q.ids) mix(v);
    for (const v of q.pts) mix(v);
  }
}
