import { addItem, dropLoot } from './hero';
import { launch } from './combat';
import { SPELLS } from './spelldata';
import { FP } from './path';
import type { Command, Sim } from './sim';

/**
 * Mission scripting. A trigger is up to three comparisons (all must hold) and up to four actions.
 * Checks return a number; actions change the sim or the script state. The registry below is the
 * single list the engine and the map editor both read, so a new kind appears in the editor for free.
 * Positions are tiles. Everything here is deterministic: it reads sim state, writes sim state or
 * emits commands, and uses only the sim's own PRNG.
 */

export type ParamKind = 'num' | 'group' | 'player' | 'unit' | 'x' | 'y' | 'item' | 'building' | 'spell' | 'enum';
export interface Param {
  name: string;
  kind: ParamKind;
  options?: string[];
}
export interface Ref {
  k: string; // registry key
  a: number[]; // arguments, in the order of the registry's params
}
export const OPS = ['=', '≠', '>', '<', '≥', '≤'] as const;
export interface Cond {
  a: Ref;
  op: number; // index into OPS
  b: Ref;
}
export interface Trigger {
  id: string;
  once: boolean;
  enabled: boolean;
  conds: Cond[];
  acts: Ref[];
}

/** Static mission data, built from the map document and never changed while playing. */
export interface MissionDef {
  triggers: Trigger[];
  /** Unit ids per group id. */
  groups: Record<number, number[]>;
  vip: number[];
  /** Start tile per unit, used when a repopper brings a group back. */
  home: [number, number][];
  /** Units that start phased out. */
  dormant: number[];
  buildings: { x: number; y: number; owner: number; hp: number }[];
}

export interface ScriptState {
  stage: number;
  status: number; // 0 playing, 1 won, 2 lost
  cause: number;
  vars: number[];
  sv: number[]; // scenario variables (carry between missions)
  sub: number[]; // sub-objectives
  fired: number[];
  on: number[];
  timers: { at: number; k: string; a: number[] }[];
  msgs: number[]; // pairs: tick, message number
  music: number;
  form: number[];
  patrols: { g: number; x1: number; y1: number; x2: number; y2: number; leg: number }[];
  outposts: { g: number; x: number; y: number; r: number; delay: number; wait: number }[];
  traps: { sid: number; pow: number; tx: number; ty: number; sx: number; sy: number; ux: number; uy: number }[];
  bhp: number[];
  nodes: number[][];
  notes: number; // actions that are recorded but have no effect yet (see STUBS)
}

interface Ctx {
  sim: Sim;
  rt: ScriptRuntime;
  st: ScriptState;
  out: Command[];
}

const px = (sim: Sim, u: number): number => sim.x[u] / FP;
const py = (sim: Sim, u: number): number => sim.y[u] / FP;
const live = (sim: Sim, u: number): boolean => u >= 0 && u < sim.count && sim.cb.hp[u] > 0 && sim.hidden[u] === 0;
const dist = (ax: number, ay: number, bx: number, by: number): number => Math.floor(Math.hypot(ax - bx, ay - by));
const b = (v: boolean): number => (v ? 1 : 0);
const at = (sim: Sim, u: number, x: number, y: number): boolean => live(sim, u) && Math.floor(px(sim, u)) === x && Math.floor(py(sim, u)) === y;

const NUM = (name: string): Param => ({ name, kind: 'num' });
const GRP: Param = { name: 'Group', kind: 'group' };
const PLR = (name = 'Player'): Param => ({ name, kind: 'player' });
const UNIT = (name = 'Unit'): Param => ({ name, kind: 'unit' });
const X = (name = 'X'): Param => ({ name, kind: 'x' });
const Y = (name = 'Y'): Param => ({ name, kind: 'y' });
const ITEM: Param = { name: 'Item', kind: 'item' };
const SPELL: Param = { name: 'Spell', kind: 'spell' };
const UPARAM: Param = { name: 'Parameter', kind: 'enum', options: ['Health', 'Mana', 'Health percent'] };

export interface CheckDef {
  key: string;
  label: string;
  params: Param[];
  run: (c: Ctx, a: number[]) => number;
}
export interface ActionDef {
  key: string;
  label: string;
  params: Param[];
  run: (c: Ctx, a: number[]) => void;
}

const members = (c: Ctx, g: number): number[] => (c.rt.def.groups[g] ?? []).filter((u) => live(c.sim, u));
const centre = (c: Ctx, ids: number[]): [number, number] => {
  let x = 0;
  let y = 0;
  for (const u of ids) {
    x += px(c.sim, u);
    y += py(c.sim, u);
  }
  return [x / ids.length, y / ids.length];
};
const teamUnits = (c: Ctx, p: number): number[] => {
  const o: number[] = [];
  for (let u = 0; u < c.sim.count; u++) if (c.sim.team[u] === p && live(c.sim, u)) o.push(u);
  return o;
};

export const CHECKS: CheckDef[] = [
  { key: 'groupSize', label: 'Units alive in a group', params: [GRP], run: (c, [g]) => members(c, g).length },
  { key: 'unitInBox', label: 'Unit inside a box', params: [UNIT(), X('X left'), Y('Y top'), X('X right'), Y('Y bottom')], run: (c, [u, x1, y1, x2, y2]) => b(live(c.sim, u) && px(c.sim, u) >= x1 && px(c.sim, u) < x2 + 1 && py(c.sim, u) >= y1 && py(c.sim, u) < y2 + 1) },
  { key: 'unitInCircle', label: 'Unit inside a circle', params: [UNIT(), X(), Y(), NUM('Radius')], run: (c, [u, x, y, r]) => b(live(c.sim, u) && Math.hypot(px(c.sim, u) - x - 0.5, py(c.sim, u) - y - 0.5) <= r) },
  { key: 'unitParam', label: 'Unit parameter', params: [UNIT(), UPARAM], run: (c, [u, p]) => (u < 0 || u >= c.sim.count ? 0 : p === 0 ? c.sim.cb.hp[u] : p === 1 ? c.sim.cb.mana[u] : Math.floor((100 * c.sim.cb.hp[u]) / Math.max(1, c.sim.cb.hpMax[u]))) },
  { key: 'unitAlive', label: 'Unit is alive', params: [UNIT()], run: (c, [u]) => b(u >= 0 && u < c.sim.count && c.sim.cb.hp[u] > 0) },
  { key: 'unitDistance', label: 'Distance between two units', params: [UNIT('First unit'), UNIT('Second unit')], run: (c, [u, v]) => (live(c.sim, u) && live(c.sim, v) ? dist(px(c.sim, u), py(c.sim, u), px(c.sim, v), py(c.sim, v)) : 9999) },
  { key: 'pointDistance', label: 'Distance from a point to a unit', params: [UNIT(), X(), Y()], run: (c, [u, x, y]) => (live(c.sim, u) ? dist(px(c.sim, u), py(c.sim, u), x + 0.5, y + 0.5) : 9999) },
  { key: 'playerUnits', label: 'Units a player has', params: [PLR()], run: (c, [p]) => teamUnits(c, p).length },
  { key: 'constant', label: 'Constant value', params: [NUM('Value')], run: (_c, [v]) => v },
  {
    key: 'nearestOfPlayer',
    label: 'Distance to the nearest unit of a player',
    params: [PLR(), X(), Y()],
    run: (c, [p, x, y]) => {
      let best = 9999;
      for (const u of teamUnits(c, p)) best = Math.min(best, dist(px(c.sim, u), py(c.sim, u), x + 0.5, y + 0.5));
      return best;
    },
  },
  { key: 'yes', label: 'TRUE', params: [], run: () => 1 },
  { key: 'no', label: 'FALSE', params: [], run: () => 0 },
  { key: 'unitFighting', label: 'Unit is fighting', params: [UNIT()], run: (c, [u]) => b(live(c.sim, u) && c.sim.cb.tgt[u] >= 0 && c.sim.cb.hp[c.sim.cb.tgt[u]] > 0) },
  { key: 'diplomacy', label: 'Diplomacy between two players (0 hostile, 1 peace)', params: [PLR('First player'), PLR('Second player')], run: (c, [p, q]) => c.sim.peace[(p & 3) * 4 + (q & 3)] },
  {
    key: 'sackAt',
    label: 'Gold in a sack on a tile',
    params: [X(), Y()],
    run: (c, [x, y]) => {
      const cb = c.sim.cb;
      let g = 0;
      for (let s = 0; s < cb.sG.length; s++) if (cb.sG[s] > 0 && Math.floor(cb.sX[s] / FP) === x && Math.floor(cb.sY[s] / FP) === y) g += cb.sG[s];
      return g;
    },
  },
  { key: 'carriedAt', label: 'Unit carries an item and stands on a tile', params: [UNIT(), ITEM, X(), Y()], run: (c, [u, i, x, y]) => b(at(c.sim, u, x, y) && hasItem(c.sim, u, i)) },
  { key: 'hasItem', label: 'Unit has an item', params: [UNIT(), ITEM], run: (c, [u, i]) => b(hasItem(c.sim, u, i)) },
  { key: 'isVip', label: 'Unit is a VIP and alive', params: [UNIT()], run: (c, [u]) => b(c.rt.def.vip.includes(u) && live(c.sim, u)) },
  { key: 'variable', label: 'Mission variable', params: [NUM('Variable')], run: (c, [n]) => c.st.vars[n] ?? 0 },
  { key: 'playerBuildings', label: 'Buildings a player has', params: [PLR()], run: (c, [p]) => c.st.bhp.filter((h, i) => h > 0 && c.rt.def.buildings[i].owner === p).length },
  { key: 'buildingHealth', label: 'Health of a building', params: [{ name: 'Building', kind: 'building' }], run: (c, [n]) => c.st.bhp[n] ?? 0 },
  { key: 'portalReady', label: 'Portal ready (a unit at the entrance, open ground at the exit)', params: [X('From X'), Y('From Y'), X('To X'), Y('To Y')], run: (c, [fx, fy, tx, ty]) => b(!c.sim.map.blocked[ty * c.sim.map.w + tx] && teamUnits(c, 0).some((u) => at(c.sim, u, fx, fy))) },
  { key: 'scenarioVar', label: 'Campaign variable', params: [NUM('Variable')], run: (c, [n]) => c.st.sv[n] ?? 0 },
  { key: 'subobjective', label: 'Sub-objective state', params: [NUM('Sub-objective')], run: (c, [n]) => c.st.sub[n] ?? 0 },
  { key: 'spellOnTile', label: 'Spell effect on a tile (none in this version)', params: [X(), Y(), NUM('Layer')], run: () => 0 },
  { key: 'spellOnUnit', label: 'Spell effect on a unit', params: [UNIT(), SPELL], run: (c, [u, s]) => b(u >= 0 && u < c.sim.count && s >= 0 && s < SPELLS.length && SPELLS[s].st >= 0 && (c.sim.cb.stMask[u] & (1 << SPELLS[s].st)) !== 0) },
  { key: 'onTile', label: 'Unit is on a tile', params: [UNIT(), X(), Y()], run: (c, [u, x, y]) => b(at(c.sim, u, x, y)) },
];

function hasItem(sim: Sim, u: number, item: number): boolean {
  const h = sim.hero;
  if (!h || h.id !== u) return false;
  return h.inv.some((s) => s.item === item && s.n > 0) || h.eq.includes(item);
}

function removeItem(sim: Sim, u: number, item: number): void {
  const h = sim.hero;
  if (!h || h.id !== u) return;
  const k = h.inv.findIndex((s) => s.item === item);
  if (k >= 0 && --h.inv[k].n <= 0) h.inv.splice(k, 1);
  const e = h.eq.indexOf(item);
  if (k < 0 && e >= 0) h.eq[e] = -1;
}

function groupOrder(c: Ctx, g: number, make: (ids: number[], cx: number, cy: number) => Command | null): void {
  const ids = members(c, g);
  if (!ids.length) return;
  const [cx, cy] = centre(c, ids);
  const cmd = make(ids, cx, cy);
  if (cmd) c.out.push(cmd);
}

function phase(c: Ctx, u: number, out: boolean): void {
  if (u < 0 || u >= c.sim.count) return;
  c.sim.hidden[u] = b(out);
  if (out) c.sim.stop(u);
}

function teleport(c: Ctx, u: number, x: number, y: number): void {
  const s = c.sim;
  if (u < 0 || u >= s.count) return;
  s.stop(u);
  s.x[u] = s.tx[u] = s.cb.px[u] = Math.round((x + 0.5) * FP);
  s.y[u] = s.ty[u] = s.cb.py[u] = Math.round((y + 0.5) * FP);
}

function nearUnit(c: Ctx, x: number, y: number): number {
  let best = -1;
  let bd = 2.25;
  for (let u = 0; u < c.sim.count; u++) {
    if (!live(c.sim, u)) continue;
    const d = (px(c.sim, u) - x - 0.5) ** 2 + (py(c.sim, u) - y - 0.5) ** 2;
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

function zap(c: Ctx, fx: number, fy: number, t: number, sid: number, pow: number): void {
  if (!live(c.sim, t) || sid < 0 || sid >= SPELLS.length) return;
  launch(c.sim, Math.round((fx + 0.5) * FP), Math.round((fy + 0.5) * FP), t, 0, 0, SPELLS[sid].school, 100, sid, pow);
}

function note(c: Ctx): void {
  c.st.notes++;
}

export const ACTIONS: ActionDef[] = [
  { key: 'nextStage', label: 'Next mission stage', params: [], run: (c) => void c.st.stage++ },
  { key: 'message', label: 'Show a message', params: [NUM('Message number')], run: (c, [n]) => void c.st.msgs.push(c.sim.tick, n) },
  { key: 'setVar', label: 'Set a variable', params: [NUM('Variable'), NUM('Value')], run: (c, [n, v]) => void (c.st.vars[n] = v) },
  { key: 'win', label: 'Mission complete', params: [], run: (c) => void (c.st.status = c.st.status || 1) },
  { key: 'lose', label: 'Mission failed', params: [NUM('Cause number')], run: (c, [n]) => void (c.st.status ? 0 : ((c.st.status = 2), (c.st.cause = n))) },
  { key: 'formation', label: 'Set a player formation (recorded only)', params: [PLR(), NUM('Formation')], run: (c, [p, f]) => void ((c.st.form[p & 3] = f), note(c)) },
  { key: 'incVar', label: 'Add 1 to a variable', params: [NUM('Variable')], run: (c, [n]) => void (c.st.vars[n] = (c.st.vars[n] ?? 0) + 1) },
  { key: 'setDiplomacy', label: 'Change diplomacy', params: [PLR('First player'), PLR('Second player'), { name: 'Relation', kind: 'enum', options: ['Hostile', 'Peace'] }], run: (c, [p, q, d]) => void (c.sim.peace[(p & 3) * 4 + (q & 3)] = c.sim.peace[(q & 3) * 4 + (p & 3)] = d) },
  { key: 'gGuard', label: 'Group: guard where it stands', params: [GRP, NUM('Range')], run: (c, [g]) => groupOrder(c, g, (ids, x, y) => ({ type: 'order', order: 'guard', ids, x, y })) },
  { key: 'gSwarm', label: 'Group: swarm to a point', params: [GRP, X(), Y()], run: (c, [g, x, y]) => groupOrder(c, g, (ids) => ({ type: 'order', order: 'swarm', ids, x: x + 0.5, y: y + 0.5 })) },
  { key: 'gHold', label: 'Group: hold ground', params: [GRP], run: (c, [g]) => groupOrder(c, g, (ids) => ({ type: 'order', order: 'hold', ids })) },
  { key: 'gMove', label: 'Group: move to a point', params: [GRP, X(), Y()], run: (c, [g, x, y]) => groupOrder(c, g, (ids) => ({ type: 'move', ids, x: x + 0.5, y: y + 0.5 })) },
  { key: 'gAttackMove', label: 'Group: attack-move to a point', params: [GRP, X(), Y()], run: (c, [g, x, y]) => groupOrder(c, g, (ids) => ({ type: 'order', order: 'attack', ids, x: x + 0.5, y: y + 0.5 })) },
  { key: 'gAttack', label: 'Group: attack a unit', params: [GRP, UNIT('Victim')], run: (c, [g, t]) => live(c.sim, t) && groupOrder(c, g, (ids) => ({ type: 'order', order: 'attack', ids, target: t })) },
  { key: 'gDefend', label: 'Group: defend a unit', params: [GRP, UNIT('Unit to defend'), NUM('Range')], run: (c, [g, t]) => live(c.sim, t) && groupOrder(c, g, (ids) => ({ type: 'order', order: 'defend', ids, target: t })) },
  { key: 'gPatrol', label: 'Group: patrol to a point and back', params: [GRP, X(), Y()], run: (c, [g, x, y]) => groupOrder(c, g, (ids, cx, cy) => (c.st.patrols.push({ g, x1: Math.floor(cx), y1: Math.floor(cy), x2: x, y2: y, leg: 0 }), { type: 'move', ids, x: x + 0.5, y: y + 0.5 })) },
  {
    key: 'dropGold',
    label: 'Drop a gold sack on a tile',
    params: [X(), Y(), NUM('Gold')],
    run: (c, [x, y, g]) => {
      const cb = c.sim.cb;
      const s = cb.sG.indexOf(0);
      if (s < 0 || g <= 0) return;
      cb.sX[s] = Math.round((x + 0.5) * FP);
      cb.sY[s] = Math.round((y + 0.5) * FP);
      cb.sG[s] = g;
    },
  },
  { key: 'outpost', label: 'Repopper: bring a group back after a delay', params: [X(), Y(), NUM('Radius'), NUM('Delay (seconds)'), GRP], run: (c, [x, y, r, d, g]) => void c.st.outposts.push({ g, x, y, r, delay: d * 25, wait: 0 }) },
  { key: 'unitOwner', label: 'Change a unit owner', params: [UNIT(), PLR('New owner')], run: (c, [u, p]) => void (u >= 0 && u < c.sim.count && ((c.sim.team[u] = p & 3), c.sim.cb.recount(c.sim.team))) },
  { key: 'dropAll', label: 'Unit drops its loot', params: [UNIT()], run: (c, [u]) => void (u >= 0 && u < c.sim.count && dropLoot(c.sim, u)) },
  { key: 'spellEffect', label: 'Spell from a point to a unit near a point', params: [X('From X'), Y('From Y'), X('To X'), Y('To Y'), SPELL, NUM('Power %')], run: (c, [fx, fy, tx, ty, s, p]) => zap(c, fx, fy, nearUnit(c, tx, ty), s, p) },
  {
    key: 'groupOwner',
    label: 'Change a group owner',
    params: [GRP, PLR('New owner')],
    run: (c, [g, p]) => {
      for (const u of members(c, g)) c.sim.team[u] = p & 3;
      c.sim.cb.recount(c.sim.team);
    },
  },
  { key: 'gFollow', label: 'Group: follow a unit', params: [GRP, UNIT('Unit to follow'), NUM('Range')], run: (c, [g, t]) => live(c.sim, t) && groupOrder(c, g, (ids) => ({ type: 'order', order: 'defend', ids, target: t })) },
  { key: 'addItem', label: 'Give an item to the hero', params: [UNIT(), ITEM], run: (c, [u, i]) => void (c.sim.hero && c.sim.hero.id === u && addItem(c.sim.hero, i)) },
  { key: 'removeItem', label: 'Take an item from the hero', params: [UNIT(), ITEM], run: (c, [u, i]) => removeItem(c.sim, u, i) },
  {
    key: 'giveItem',
    label: 'Move an item from one unit to another',
    params: [UNIT('From unit'), UNIT('To unit'), ITEM],
    run: (c, [u, v, i]) => {
      if (!hasItem(c.sim, u, i)) return;
      removeItem(c.sim, u, i);
      if (c.sim.hero && c.sim.hero.id === v) addItem(c.sim.hero, i);
    },
  },
  { key: 'phaseIn', label: 'Phase a unit in', params: [UNIT()], run: (c, [u]) => phase(c, u, false) },
  { key: 'phaseOut', label: 'Phase a unit out', params: [UNIT()], run: (c, [u]) => phase(c, u, true) },
  {
    key: 'polymorph',
    label: 'Replace a unit by another one',
    params: [UNIT('Old form'), UNIT('New form')],
    run: (c, [u, v]) => {
      if (u < 0 || u >= c.sim.count || v < 0 || v >= c.sim.count) return;
      const x = Math.floor(px(c.sim, u));
      const y = Math.floor(py(c.sim, u));
      phase(c, u, true);
      teleport(c, v, x, y);
      phase(c, v, false);
    },
  },
  { key: 'giveMoney', label: 'Give gold to a player', params: [PLR(), NUM('Gold')], run: (c, [p, g]) => void (c.sim.cb.gold[p & 3] += g) },
  { key: 'castAtUnit', label: 'Cast a spell from a point at a unit', params: [X('From X'), Y('From Y'), UNIT(), SPELL, NUM('Power %')], run: (c, [fx, fy, u, s, p]) => zap(c, fx, fy, u, s, p) },
  { key: 'setTrap', label: 'Set a spell trap', params: [SPELL, NUM('Power %'), X('Trigger X'), Y('Trigger Y'), X('Source X'), Y('Source Y'), X('Target X'), Y('Target Y')], run: (c, [sid, pow, tx, ty, sx, sy, ux, uy]) => void c.st.traps.push({ sid, pow, tx, ty, sx, sy, ux, uy }) },
  { key: 'setBuildingHealth', label: 'Set building health', params: [{ name: 'Building', kind: 'building' }, NUM('Health')], run: (c, [n, h]) => void (n >= 0 && n < c.st.bhp.length && (c.st.bhp[n] = Math.max(0, h))) },
  { key: 'teleport', label: 'Teleport a unit', params: [UNIT(), X(), Y()], run: (c, [u, x, y]) => teleport(c, u, x, y) },
  {
    key: 'gRoam',
    label: 'Group: wander a few tiles',
    params: [GRP],
    run: (c, [g]) => {
      for (const u of members(c, g)) {
        const x = Math.max(1, Math.min(c.sim.map.w - 2, Math.floor(px(c.sim, u)) + c.sim.rng.int(9) - 4));
        const y = Math.max(1, Math.min(c.sim.map.h - 2, Math.floor(py(c.sim, u)) + c.sim.rng.int(9) - 4));
        c.out.push({ type: 'move', ids: [u], x: x + 0.5, y: y + 0.5 });
      }
    },
  },
  { key: 'giveAll', label: 'Give everything to another unit (recorded only)', params: [UNIT('Giving unit'), UNIT('Taking unit')], run: note },
  { key: 'tileSpellTime', label: 'Tile spell duration (recorded only)', params: [X(), Y(), SPELL, NUM('Duration')], run: note },
  { key: 'unitSpellTime', label: 'Unit spell duration (recorded only)', params: [UNIT(), SPELL, NUM('Duration')], run: note },
  {
    key: 'repopDelay',
    label: 'Change the repop delay of a group',
    params: [GRP, NUM('Delay (seconds)')],
    run: (c, [g, d]) => {
      for (const o of c.st.outposts) if (o.g === g) o.delay = d * 25;
    },
  },
  { key: 'phaseOutGroup', label: 'Phase a group out', params: [GRP], run: (c, [g]) => void (c.rt.def.groups[g] ?? []).forEach((u) => phase(c, u, true)) },
  { key: 'phaseInGroup', label: 'Phase a group in', params: [GRP], run: (c, [g]) => void (c.rt.def.groups[g] ?? []).forEach((u) => phase(c, u, false)) },
  {
    key: 'setUnitParam',
    label: 'Set a unit parameter',
    params: [UNIT(), UPARAM, NUM('New value')],
    run: (c, [u, p, v]) => {
      if (u < 0 || u >= c.sim.count) return;
      const cb = c.sim.cb;
      if (p === 0) cb.hp[u] = Math.max(1, Math.min(cb.hpMax[u], v));
      else if (p === 1) cb.mana[u] = Math.max(0, Math.min(cb.manaMax[u], v));
      else cb.hp[u] = Math.max(1, Math.min(cb.hpMax[u], Math.floor((cb.hpMax[u] * v) / 100)));
    },
  },
  { key: 'music', label: 'Change the music theme', params: [NUM('Theme')], run: (c, [n]) => void (c.st.music = n) },
  { key: 'setScenarioVar', label: 'Set a campaign variable', params: [NUM('Variable'), NUM('Value')], run: (c, [n, v]) => void (c.st.sv[n] = v) },
  { key: 'gDwell', label: 'Group: dwell here', params: [GRP, NUM('Range')], run: (c, [g]) => groupOrder(c, g, (ids, x, y) => ({ type: 'order', order: 'guard', ids, x, y })) },
  { key: 'setSub', label: 'Set a sub-objective', params: [NUM('Sub-objective'), NUM('Value')], run: (c, [n, v]) => void (c.st.sub[n] = v) },
  { key: 'musicNode', label: 'Music node (recorded only)', params: [X(), Y(), NUM('Theme 1'), NUM('Theme 2'), NUM('Theme 3'), NUM('Theme 4'), NUM('Theme 5'), NUM('Theme 6')], run: (c, a) => void (c.st.nodes.push(a.slice()), note(c)) },
  {
    key: 'removeItemAll',
    label: 'Remove an item from everybody',
    params: [ITEM],
    run: (c, [i]) => {
      if (c.sim.hero) removeItem(c.sim, c.sim.hero.id, i);
    },
  },
  { key: 'gSuspend', label: 'Group: stand down', params: [GRP], run: (c, [g]) => groupOrder(c, g, (ids) => ({ type: 'order', order: 'still', ids })) },
];

const CHECK_BY = new Map(CHECKS.map((d) => [d.key, d]));
const ACTION_BY = new Map(ACTIONS.map((d) => [d.key, d]));
export const checkDef = (k: string): CheckDef | undefined => CHECK_BY.get(k);
export const actionDef = (k: string): ActionDef | undefined => ACTION_BY.get(k);

const OP_TEST: ((x: number, y: number) => boolean)[] = [(x, y) => x === y, (x, y) => x !== y, (x, y) => x > y, (x, y) => x < y, (x, y) => x >= y, (x, y) => x <= y];

export function newState(def: MissionDef): ScriptState {
  return {
    stage: 0,
    status: 0,
    cause: 0,
    vars: Array(32).fill(0),
    sv: Array(16).fill(0),
    sub: Array(8).fill(0),
    fired: Array(def.triggers.length).fill(0),
    on: def.triggers.map((t) => (t.enabled ? 1 : 0)),
    timers: [],
    msgs: [],
    music: 0,
    form: [0, 0, 0, 0],
    patrols: [],
    outposts: [],
    traps: [],
    bhp: def.buildings.map((x) => x.hp),
    nodes: [],
    notes: 0,
  };
}

/** The script of one mission. `st` is all the changing state; `def` never changes. */
export class ScriptRuntime {
  st: ScriptState;
  constructor(readonly def: MissionDef) {
    this.st = newState(def);
  }

  /** Called once before the first tick: phases the dormant units out. */
  setup(sim: Sim): void {
    for (const u of this.def.dormant) sim.hidden[u] = 1;
  }

  /** Runs every fifth tick. Returns the commands the script wants applied this tick. */
  run(sim: Sim): Command[] {
    const out: Command[] = [];
    const st = this.st;
    if (st.status !== 0 || sim.tick % 5 !== 1) return out;
    const c: Ctx = { sim, rt: this, st, out };
    // Pending timers first, then standing behaviours, then triggers.
    if (st.timers.length) {
      const due = st.timers.filter((t) => t.at <= sim.tick);
      st.timers = st.timers.filter((t) => t.at > sim.tick);
      for (const t of due) this.exec(c, t.k, t.a);
    }
    this.standing(c);
    const trig = this.def.triggers;
    for (let i = 0; i < trig.length; i++) {
      if (!st.on[i] || (trig[i].once && st.fired[i])) continue;
      if (!trig[i].conds.every((q) => this.holds(c, q))) continue;
      st.fired[i]++;
      for (const a of trig[i].acts) this.exec(c, a.k, a.a);
      if (st.status !== 0) break;
    }
    return out;
  }

  private holds(c: Ctx, q: Cond): boolean {
    const x = checkDef(q.a.k)?.run(c, q.a.a) ?? 0;
    const y = checkDef(q.b.k)?.run(c, q.b.a) ?? 0;
    return (OP_TEST[q.op] ?? OP_TEST[0])(x, y);
  }

  private exec(c: Ctx, k: string, a: number[]): void {
    actionDef(k)?.run(c, a);
  }

  private standing(c: Ctx): void {
    const { sim, st } = c;
    for (const p of st.patrols) {
      const ids = members(c, p.g);
      if (!ids.length) continue;
      const [cx, cy] = centre(c, ids);
      const gx = p.leg === 0 ? p.x2 : p.x1;
      const gy = p.leg === 0 ? p.y2 : p.y1;
      if (Math.hypot(cx - gx - 0.5, cy - gy - 0.5) < 2) {
        p.leg ^= 1;
        c.out.push({ type: 'move', ids, x: (p.leg === 0 ? p.x2 : p.x1) + 0.5, y: (p.leg === 0 ? p.y2 : p.y1) + 0.5 });
      }
    }
    for (let i = st.traps.length - 1; i >= 0; i--) {
      const t = st.traps[i];
      let hit = false;
      for (let u = 0; u < sim.count && !hit; u++) hit = live(sim, u) && Math.hypot(px(sim, u) - t.tx - 0.5, py(sim, u) - t.ty - 0.5) < 1.2;
      if (!hit) continue;
      st.traps.splice(i, 1);
      zap(c, t.sx, t.sy, nearUnit(c, t.ux, t.uy), t.sid, t.pow);
    }
    for (const o of st.outposts) {
      const ids = this.def.groups[o.g] ?? [];
      const empty = ids.length > 0 && ids.every((u) => sim.cb.hp[u] <= 0 || sim.hidden[u]);
      if (!empty || o.wait) {
        if (o.wait && sim.tick >= o.wait) {
          o.wait = 0;
          const blocked = teamUnits(c, 0).some((u) => Math.hypot(px(sim, u) - o.x - 0.5, py(sim, u) - o.y - 0.5) <= o.r);
          if (blocked) {
            o.wait = sim.tick + 25;
            continue;
          }
          for (const u of ids) {
            sim.cb.hp[u] = sim.cb.hpMax[u];
            sim.cb.mana[u] = sim.cb.manaMax[u];
            const [hx, hy] = this.def.home[u];
            teleport(c, u, hx, hy);
            sim.hidden[u] = 0;
          }
          sim.cb.recount(sim.team);
        }
        continue;
      }
      o.wait = sim.tick + o.delay;
    }
  }

  snapshot(): ScriptState {
    return structuredClone(this.st);
  }

  restore(s: ScriptState): void {
    this.st = structuredClone(s);
  }

  hashInto(mix: (v: number) => void): void {
    const st = this.st;
    mix(st.stage);
    mix(st.status);
    mix(st.cause);
    mix(st.music);
    mix(st.notes);
    for (const v of st.vars) mix(v);
    for (const v of st.sub) mix(v);
    for (const v of st.fired) mix(v);
    for (const v of st.bhp) mix(v);
    for (const t of st.timers) mix(t.at);
    for (const o of st.outposts) mix(o.wait);
    for (const p of st.patrols) mix(p.leg);
    mix(st.traps.length);
    mix(st.msgs.length);
  }
}
