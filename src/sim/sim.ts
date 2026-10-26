import { isBlockedAt, type GameMap } from '../map';
import { dayLight } from './daynight';
import { CombatState, DEFS, Ord, enemyNear, nearestSack, think, toGuard, type CombatSnap } from './combat';
import { FP, Pather, dir16, lineClear, regionsOf, speedPct } from './path';
import { Rng } from './rng';

export { FP };
export const TICKS_PER_SECOND = 25;
export const UNIT_SPEED = Math.round((3.2 * FP) / TICKS_PER_SECOND); // 3.2 tiles per second
export const UNIT_RADIUS = 77; // 0.3 tile; two units never rest closer than 2 radii
const MIN_DIST = UNIT_RADIUS * 2;
const MAX_PUSH = 20;
const VISION_DAY = 8;
const VISION_NIGHT = 6;
const STUCK_REPATH = 25; // ticks of no progress before a unit asks for a new path
const STUCK_GIVE_UP = 200; // 8 seconds of no progress after all repaths
const PATHS_PER_TICK = 3; // time-slice: at most this many A* searches during unit steering
const PATHS_PER_ORDER = 6; // extra individual searches a single order may start

/** Order verbs of the `order` command. */
export type OrderName = 'attack' | 'guard' | 'defend' | 'cast' | 'swarm' | 'hold' | 'retreat' | 'still' | 'pickup';

export type Command =
  | { type: 'move'; ids: number[]; x: number; y: number; loose?: boolean } // x, y in tiles (may be fractional)
  | {
      type: 'order';
      order: OrderName;
      ids: number[];
      x?: number; // point in tiles
      y?: number;
      target?: number; // unit id (attack, defend, cast)
    };
export interface LoggedCommand {
  tick: number;
  cmd: Command;
}

interface PathRec {
  pts: Int32Array; // x0,y0,x1,y1,... fixed-point waypoints
  refs: number;
}

export interface Snapshot {
  tick: number;
  rng: number;
  x: Int32Array;
  y: Int32Array;
  tx: Int32Array;
  ty: Int32Array;
  moving: Uint8Array;
  pathId: Int32Array;
  wp: Int32Array;
  stuck: Uint16Array;
  repaths: Uint8Array;
  dir: Uint8Array;
  visible: Uint8Array;
  explored: Uint8Array;
  paths: [number, Int32Array, number][];
  nextPath: number;
  cb: CombatSnap;
}

export interface SimOptions {
  /** Ticks added to the day clock so a game can start at any time of day. */
  dayOffset?: number;
  /** Unit kinds (index into the combat table). Default: all warriors. */
  kinds?: number[];
  /** Turn on combat and orders. Off by default so movement-only sims stay peaceful. */
  combat?: boolean;
  /** Multiplier on every unit's hit points (benchmark battles). */
  hpMul?: number;
}

// Tile offsets around a point, nearest first, used to find the closest valid tile.
const RING: [number, number][] = [];
for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) if (dx * dx + dy * dy <= 64) RING.push([dx, dy]);
RING.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);

/** Deterministic world state. No DOM, no renderer, no Math.random, no float state. */
export class Sim {
  tick = 0;
  readonly rng: Rng;
  readonly count: number;
  readonly team: Uint8Array;
  x: Int32Array;
  y: Int32Array;
  tx: Int32Array;
  ty: Int32Array;
  moving: Uint8Array;
  pathId: Int32Array;
  wp: Int32Array;
  stuck: Uint16Array;
  repaths: Uint8Array;
  dir: Uint8Array;
  visible: Uint8Array;
  explored: Uint8Array;
  /** Bumped whenever fog changes; the renderer redraws its fog texture on a new value. */
  fogVersion = 0;
  readonly log: LoggedCommand[] = [];
  readonly dayOffset: number;
  readonly combat: boolean;
  readonly cb: CombatState;
  /** Uniform grid of living units, rebuilt every tick; used for collision and target search. */
  readonly cellStart: Int32Array;
  readonly cellItems: Int32Array;

  private paths = new Map<number, PathRec>();
  private nextPath = 1;
  private budget = 0;
  private readonly pather: Pather;
  private readonly region: Int32Array;
  private readonly ox: Int32Array;
  private readonly oy: Int32Array;
  private readonly ax: Int32Array;
  private readonly ay: Int32Array;
  private readonly cursor: Int32Array;

  constructor(
    readonly map: GameMap,
    seed: number,
    teams: number[],
    opts: SimOptions = {},
  ) {
    this.rng = new Rng(seed);
    this.dayOffset = opts.dayOffset ?? 0;
    this.count = teams.length;
    const n = this.count;
    this.team = Uint8Array.from(teams);
    this.x = new Int32Array(n);
    this.y = new Int32Array(n);
    this.tx = new Int32Array(n);
    this.ty = new Int32Array(n);
    this.moving = new Uint8Array(n);
    this.pathId = new Int32Array(n).fill(-1);
    this.wp = new Int32Array(n);
    this.stuck = new Uint16Array(n);
    this.repaths = new Uint8Array(n);
    this.dir = new Uint8Array(n);
    this.visible = new Uint8Array(map.w * map.h);
    this.explored = new Uint8Array(map.w * map.h);
    this.pather = new Pather(map);
    this.region = regionsOf(map);
    this.ox = new Int32Array(n);
    this.oy = new Int32Array(n);
    this.ax = new Int32Array(n);
    this.ay = new Int32Array(n);
    this.cellStart = new Int32Array(map.w * map.h + 1);
    this.cellItems = new Int32Array(n);
    this.cursor = new Int32Array(map.w * map.h);
    this.combat = opts.combat ?? false;
    this.cb = new CombatState(n, opts.kinds ?? Array(n).fill(0), this.team, opts.hpMul ?? 1);
  }

  /** Place unit `id` at a tile centre. Only for setup before the first tick. */
  place(id: number, tileX: number, tileY: number): void {
    this.x[id] = this.tx[id] = this.cb.px[id] = Math.round((tileX + 0.5) * FP);
    this.y[id] = this.ty[id] = this.cb.py[id] = Math.round((tileY + 0.5) * FP);
  }

  /** Set the guard post of every unit to where it stands. Call after custom placement. */
  settle(): void {
    for (let i = 0; i < this.count; i++) {
      this.cb.px[i] = this.x[i];
      this.cb.py[i] = this.y[i];
    }
  }

  alive(i: number): boolean {
    return this.cb.hp[i] > 0;
  }

  /** Stop a unit where it is. */
  stop(i: number): void {
    if (this.moving[i]) this.finish(i);
  }

  /** Send one unit towards a fixed-point position on its own path. Time-sliced like every other search. */
  goTo(i: number, gx: number, gy: number): void {
    this.release(i);
    this.tx[i] = gx;
    this.ty[i] = gy;
    this.moving[i] = 1;
    this.stuck[i] = 0;
    this.repaths[i] = 0;
    this.wp[i] = 0;
    if (!lineClear(this.map, this.x[i], this.y[i], gx, gy) && this.budget > 0) {
      this.budget--;
      const pts = this.pather.find(Math.floor(this.x[i] / FP), Math.floor(this.y[i] / FP), Math.floor(gx / FP), Math.floor(gy / FP));
      if (pts) this.pathId[i] = this.addPath(pts, 1);
    }
  }

  /** Daylight 0..255 right now. */
  get daylight(): number {
    return dayLight(this.tick + this.dayOffset);
  }

  /** Advance one tick. Commands are applied first, in order, and appended to the log. */
  step(cmds: readonly Command[] = []): void {
    this.tick++;
    this.budget = PATHS_PER_TICK;
    if (this.combat) this.buildGrid();
    for (const cmd of cmds) {
      this.log.push({ tick: this.tick, cmd });
      if (cmd.type === 'move') this.apply(cmd);
      else this.applyOrder(cmd);
    }
    this.ox.set(this.x);
    this.oy.set(this.y);
    if (this.combat) think(this);
    for (let i = 0; i < this.count; i++) if (this.moving[i]) this.steer(i);
    this.separate();
    for (let i = 0; i < this.count; i++) if (this.moving[i]) this.progress(i);
    if (this.tick === 1 || this.tick % 5 === 0) this.updateFog();
  }

  // ---- orders: goal, formation, shared path ----

  private tileOf(i: number): number {
    return Math.floor(this.y[i] / FP) * this.map.w + Math.floor(this.x[i] / FP);
  }

  private liveIds(raw: readonly number[]): number[] {
    const seen = new Set<number>();
    return raw.filter((id) => id >= 0 && id < this.count && this.cb.hp[id] > 0 && !seen.has(id) && seen.add(id));
  }

  /** Orders other than a plain move. A point makes the group walk there in formation first, then the order is set. */
  private applyOrder(cmd: Extract<Command, { type: 'order' }>): void {
    if (!this.combat) return;
    const cb = this.cb;
    const ids = this.liveIds(cmd.ids);
    if (ids.length === 0) return;
    const hasPoint = cmd.x !== undefined && cmd.y !== undefined;
    const withPoint = (ord: number): void => {
      this.apply({ type: 'move', ids, x: cmd.x!, y: cmd.y! });
      for (const id of ids) {
        cb.ord[id] = ord;
        cb.tgt[id] = -1;
        cb.aux[id] = 0;
        cb.px[id] = this.tx[id];
        cb.py[id] = this.ty[id];
      }
    };
    const t = cmd.target ?? -1;
    switch (cmd.order) {
      case 'still':
      case 'hold':
        for (const id of ids) {
          this.stop(id);
          cb.ord[id] = cmd.order === 'still' ? Ord.Still : Ord.Hold;
          cb.tgt[id] = -1;
        }
        return;
      case 'guard':
        if (hasPoint) withPoint(Ord.Guard);
        else for (const id of ids) toGuard(this, id);
        return;
      case 'swarm':
        if (hasPoint) withPoint(Ord.Swarm);
        else
          for (const id of ids) {
            cb.ord[id] = Ord.Swarm;
            cb.tgt[id] = -1;
            cb.px[id] = this.x[id];
            cb.py[id] = this.y[id];
          }
        return;
      case 'attack':
        if (t >= 0 && t < this.count && cb.hp[t] > 0) {
          for (const id of ids) {
            if (id === t) continue;
            cb.ord[id] = Ord.Attack;
            cb.tgt[id] = t;
            cb.aux[id] = 1;
          }
        } else if (hasPoint) withPoint(Ord.Attack);
        return;
      case 'defend':
        if (t >= 0 && t < this.count && cb.hp[t] > 0 && this.team[t] === this.team[ids[0]]) {
          for (const id of ids) {
            if (id === t) continue;
            cb.ord[id] = Ord.Defend;
            cb.aux[id] = t;
            cb.tgt[id] = -1;
          }
        }
        return;
      case 'cast': {
        let tt = t;
        if ((tt < 0 || cb.hp[tt] <= 0) && hasPoint) {
          const probe = ids[0];
          const ox = this.x[probe];
          const oy = this.y[probe];
          this.x[probe] = Math.round(cmd.x! * FP);
          this.y[probe] = Math.round(cmd.y! * FP);
          tt = enemyNear(this, probe, 2 * FP, 0, 0, 0);
          this.x[probe] = ox;
          this.y[probe] = oy;
        }
        if (tt < 0 || cb.hp[tt] <= 0) return;
        for (const id of ids) {
          if (!DEFS[cb.kind[id]].caster) continue;
          cb.ord[id] = Ord.Cast;
          cb.tgt[id] = tt;
        }
        return;
      }
      case 'retreat': {
        let gx = cmd.x;
        let gy = cmd.y;
        if (!hasPoint) {
          // fall back: 12 tiles directly away from the enemy nearest to the group
          let cx = 0;
          let cy = 0;
          for (const id of ids) {
            cx += this.x[id];
            cy += this.y[id];
          }
          cx = Math.floor(cx / ids.length);
          cy = Math.floor(cy / ids.length);
          const probe = ids[0];
          const ox = this.x[probe];
          const oy = this.y[probe];
          this.x[probe] = cx;
          this.y[probe] = cy;
          const e = enemyNear(this, probe, 14 * FP, 0, 0, 0);
          this.x[probe] = ox;
          this.y[probe] = oy;
          if (e < 0) return;
          const dx = cx - this.x[e];
          const dy = cy - this.y[e];
          const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          gx = Math.max(1, Math.min(this.map.w - 2, (cx + (dx / len) * 12 * FP) / FP));
          gy = Math.max(1, Math.min(this.map.h - 2, (cy + (dy / len) * 12 * FP) / FP));
        }
        this.apply({ type: 'move', ids, x: gx!, y: gy!, loose: true });
        for (const id of ids) {
          cb.ord[id] = Ord.Retreat;
          cb.tgt[id] = -1;
        }
        return;
      }
      case 'pickup': {
        if (!hasPoint) return;
        const s = nearestSack(this, Math.round(cmd.x! * FP), Math.round(cmd.y! * FP), 2 * FP);
        if (s < 0) return;
        for (const id of ids) {
          cb.ord[id] = Ord.Pickup;
          cb.aux[id] = s;
          cb.tgt[id] = -1;
          this.goTo(id, cb.sX[s], cb.sY[s]);
        }
      }
    }
  }

  private apply(cmd: Extract<Command, { type: 'move' }>): void {
    const { map, region } = this;
    const w = map.w;
    let ids = this.liveIds(cmd.ids);
    if (ids.length === 0) return;
    const cxp = Math.round(cmd.x * FP);
    const cyp = Math.round(cmd.y * FP);
    // The unit nearest the click leads and decides the walkable region of the goal.
    let lead = ids[0];
    let best = Infinity;
    for (const id of ids) {
      const d = (this.x[id] - cxp) ** 2 + (this.y[id] - cyp) ** 2;
      if (d < best) {
        best = d;
        lead = id;
      }
    }
    const leadReg = region[this.tileOf(lead)];
    if (leadReg < 0) return;
    ids = ids.filter((id) => region[this.tileOf(id)] === leadReg);
    const n = ids.length;
    let gx = Math.floor(cmd.x);
    let gy = Math.floor(cmd.y);
    let exact = true;
    if (isBlockedAt(map, gx, gy) || region[gy * w + gx] !== leadReg) {
      exact = false;
      const t = this.nearestTile(gx, gy, (idx) => region[idx] === leadReg, null);
      if (t < 0) return;
      gx = t % w;
      gy = Math.floor(t / w);
    }
    const goalX = exact ? cxp : gx * FP + FP / 2;
    const goalY = exact ? cyp : gy * FP + FP / 2;
    const goalCx = gx * FP + FP / 2;
    const goalCy = gy * FP + FP / 2;

    // Shared path from the leader.
    const lx = this.x[lead];
    const ly = this.y[lead];
    let shared: Int32Array | null;
    if (lineClear(map, lx, ly, goalCx, goalCy)) shared = Int32Array.of(goalCx, goalCy);
    else shared = this.pather.find(Math.floor(lx / FP), Math.floor(ly / FP), gx, gy);
    if (!shared) return;

    const loose = n === 1 || cmd.loose === true;
    const slots = n === 1 ? [[goalX, goalY]] : loose ? ids.map(() => [goalX, goalY]) : this.formation(ids, leadReg, goalX, goalY, goalCx, goalCy);
    const order = loose ? ids : this.assign(ids, goalX, goalY);
    const sharedId = this.addPath(shared, 0);
    let own = PATHS_PER_ORDER;
    for (let k = 0; k < n; k++) {
      const id = order[k];
      this.release(id);
      this.tx[id] = slots[k][0];
      this.ty[id] = slots[k][1];
      this.moving[id] = 1;
      this.cb.ord[id] = Ord.Move;
      this.cb.tgt[id] = -1;
      this.stuck[id] = 0;
      this.repaths[id] = 0;
      this.wp[id] = 0;
      let pid = sharedId;
      if (id !== lead && !lineClear(map, this.x[id], this.y[id], shared[0], shared[1]) && own > 0) {
        const mine = this.pather.find(Math.floor(this.x[id] / FP), Math.floor(this.y[id] / FP), gx, gy);
        own--;
        if (mine) pid = this.addPath(mine, 0);
      }
      this.paths.get(pid)!.refs++;
      this.pathId[id] = pid;
    }
    if (this.paths.get(sharedId)!.refs === 0) this.paths.delete(sharedId);
  }

  private addPath(pts: Int32Array, refs: number): number {
    const id = this.nextPath++;
    this.paths.set(id, { pts, refs });
    return id;
  }

  private release(i: number): void {
    const pid = this.pathId[i];
    if (pid < 0) return;
    const p = this.paths.get(pid);
    if (p && --p.refs <= 0) this.paths.delete(pid);
    this.pathId[i] = -1;
  }

  private finish(i: number): void {
    this.moving[i] = 0;
    this.stuck[i] = 0;
    this.release(i);
  }

  /** Nearest tile (by ring order) around (x, y) that passes `ok`, skipping tiles marked in `used`. */
  private nearestTile(x: number, y: number, ok: (idx: number) => boolean, used: Uint8Array | null): number {
    const { w, h } = this.map;
    for (const [dx, dy] of RING) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const idx = py * w + px;
      if (this.map.blocked[idx] || (used && used[idx]) || !ok(idx)) continue;
      return idx;
    }
    return -1;
  }

  /** Slot positions (fixed point) for a rectangular formation facing the direction of travel. */
  private formation(ids: number[], reg: number, goalX: number, goalY: number, goalCx: number, goalCy: number): number[][] {
    const { map, region } = this;
    const w = map.w;
    const n = ids.length;
    let sx = 0;
    let sy = 0;
    for (const id of ids) {
      sx += this.x[id];
      sy += this.y[id];
    }
    const { fx, fy } = this.facing(Math.floor(sx / n), Math.floor(sy / n), goalX, goalY);
    const rx = -fy;
    const ry = fx;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.5)));
    const rows = Math.ceil(n / cols);
    const slots: number[][] = [];
    const used = new Uint8Array(map.w * map.h);
    const bad: number[] = [];
    for (let k = 0; k < n; k++) {
      const r = Math.floor(k / cols);
      const c = k % cols;
      const inRow = r < rows - 1 ? cols : n - (rows - 1) * cols;
      const u2 = 2 * c - (inRow - 1);
      const v2 = rows - 1 - 2 * r;
      const px = goalX + Math.round(((u2 * rx + v2 * fx) * FP) / 2048);
      const py = goalY + Math.round(((u2 * ry + v2 * fy) * FP) / 2048);
      const tx = Math.floor(px / FP);
      const ty = Math.floor(py / FP);
      const ok = !isBlockedAt(map, tx, ty) && region[ty * w + tx] === reg && lineClear(map, goalCx, goalCy, px, py);
      slots.push([px, py]);
      if (ok) used[ty * w + tx] = 1;
      else bad.push(k);
    }
    for (const k of bad) {
      const tx = Math.floor(slots[k][0] / FP);
      const ty = Math.floor(slots[k][1] / FP);
      const t = this.nearestTile(
        Math.min(map.w - 1, Math.max(0, tx)),
        Math.min(map.h - 1, Math.max(0, ty)),
        (idx) => region[idx] === reg && lineClear(map, goalCx, goalCy, (idx % w) * FP + FP / 2, Math.floor(idx / w) * FP + FP / 2),
        used,
      );
      if (t >= 0) {
        used[t] = 1;
        slots[k] = [(t % w) * FP + FP / 2, Math.floor(t / w) * FP + FP / 2];
      } else slots[k] = [goalCx, goalCy];
    }
    return slots;
  }

  /** Unit vector (scaled by 1024) from a point towards the goal; east when they coincide. */
  private facing(fromX: number, fromY: number, toX: number, toY: number): { fx: number; fy: number } {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 64) return { fx: 0, fy: -1024 };
    return { fx: Math.round((dx * 1024) / len), fy: Math.round((dy * 1024) / len) };
  }

  /** Order units so the front of the group takes the front of the formation, left to right inside a row. */
  private assign(ids: number[], goalX: number, goalY: number): number[] {
    const n = ids.length;
    let sx = 0;
    let sy = 0;
    for (const id of ids) {
      sx += this.x[id];
      sy += this.y[id];
    }
    const cx = Math.floor(sx / n);
    const cy = Math.floor(sy / n);
    const { fx, fy } = this.facing(cx, cy, goalX, goalY);
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.5)));
    const pf = (id: number): number => (this.x[id] - cx) * fx + (this.y[id] - cy) * fy;
    const pr = (id: number): number => (this.x[id] - cx) * -fy + (this.y[id] - cy) * fx;
    const sorted = ids.slice().sort((a, b) => pf(b) - pf(a) || a - b);
    const out: number[] = [];
    for (let r = 0; r * cols < n; r++) {
      const row = sorted.slice(r * cols, (r + 1) * cols).sort((a, b) => pr(a) - pr(b) || a - b);
      out.push(...row);
    }
    return out;
  }

  // ---- movement ----

  private steer(i: number): void {
    const map = this.map;
    const x = this.x[i];
    const y = this.y[i];
    const pct = Math.max(25, speedPct(map, Math.floor(x / FP), Math.floor(y / FP)));
    const spd = Math.floor((UNIT_SPEED * pct * DEFS[this.cb.kind[i]].speed) / 10000);
    let tgx = this.tx[i];
    let tgy = this.ty[i];
    const pid = this.pathId[i];
    let rec = pid >= 0 ? this.paths.get(pid) : undefined;
    if (rec) {
      let k = this.wp[i];
      let pts = rec.pts;
      const n = pts.length / 2;
      for (let guard = 0; guard < 3 && k < n; guard++) {
        const wx = pts[2 * k];
        const wy = pts[2 * k + 1];
        if ((wx - x) ** 2 + (wy - y) ** 2 <= 102 * 102) k++;
        else if (k + 1 < n && lineClear(map, x, y, pts[2 * k + 2], pts[2 * k + 3])) k++;
        else break;
      }
      this.wp[i] = k;
      if (k < n) {
        tgx = pts[2 * k];
        tgy = pts[2 * k + 1];
        if (!lineClear(map, x, y, tgx, tgy) && this.repath(i)) {
          rec = this.paths.get(this.pathId[i]);
          if (rec) {
            pts = rec.pts;
            tgx = pts[0];
            tgy = pts[1];
          }
        }
      }
    }
    const dx = tgx - x;
    const dy = tgy - y;
    const d2 = dx * dx + dy * dy;
    const atSlot = tgx === this.tx[i] && tgy === this.ty[i];
    if (d2 <= spd * spd) {
      if (atSlot) {
        if (!isBlockedAt(map, Math.floor(tgx / FP), Math.floor(tgy / FP))) {
          if (d2 > 0) this.dir[i] = dir16(dx, dy);
          this.x[i] = tgx;
          this.y[i] = tgy;
        }
        this.finish(i);
      } else {
        this.x[i] = tgx;
        this.y[i] = tgy;
      }
      return;
    }
    const d = Math.sqrt(d2);
    const sx = Math.round((dx * spd) / d);
    const sy = Math.round((dy * spd) / d);
    this.dir[i] = dir16(dx, dy);
    const nx = x + sx;
    const ny = y + sy;
    if (!this.blockedAt(nx, ny)) {
      this.x[i] = nx;
      this.y[i] = ny;
    } else if (!this.blockedAt(nx, y)) this.x[i] = nx;
    else if (!this.blockedAt(x, ny)) this.y[i] = ny;
  }

  /** New individual path from the unit's tile to its slot tile. Time-sliced by a per-tick budget. */
  private repath(i: number): boolean {
    if (this.budget <= 0 || this.repaths[i] >= 4) return false;
    this.budget--;
    this.repaths[i]++;
    const pts = this.pather.find(
      Math.floor(this.x[i] / FP),
      Math.floor(this.y[i] / FP),
      Math.floor(this.tx[i] / FP),
      Math.floor(this.ty[i] / FP),
    );
    if (!pts) {
      this.finish(i);
      return false;
    }
    this.release(i);
    const pid = this.addPath(pts, 1);
    this.pathId[i] = pid;
    this.wp[i] = 0;
    return true;
  }

  /** Soft collision: overlapping units push each other apart. Idle units yield more than walkers. */
  private cellOf(i: number): number {
    const { w, h } = this.map;
    return Math.min(h - 1, Math.max(0, Math.floor(this.y[i] / FP))) * w + Math.min(w - 1, Math.max(0, Math.floor(this.x[i] / FP)));
  }

  /** Bucket the living units by tile (counting sort). */
  private buildGrid(): void {
    const { map, count } = this;
    const cs = this.cellStart;
    const hp = this.cb.hp;
    cs.fill(0);
    for (let i = 0; i < count; i++) if (hp[i] > 0) cs[this.cellOf(i) + 1]++;
    for (let c = 0; c < map.w * map.h; c++) cs[c + 1] += cs[c];
    const cursor = this.cursor;
    cursor.fill(0);
    for (let i = 0; i < count; i++) {
      if (hp[i] <= 0) continue;
      const c = this.cellOf(i);
      this.cellItems[cs[c] + cursor[c]++] = i;
    }
  }

  private separate(): void {
    const { map, count } = this;
    const w = map.w;
    const cs = this.cellStart;
    this.buildGrid();
    const cell = (i: number): number => this.cellOf(i);
    this.ax.fill(0);
    this.ay.fill(0);
    for (let i = 0; i < count; i++) {
      if (this.cb.hp[i] <= 0) continue;
      const xi = this.x[i];
      const yi = this.y[i];
      const c = cell(i);
      const cx = c % w;
      const cy = (c - cx) / w;
      for (let gy = Math.max(0, cy - 1); gy <= Math.min(map.h - 1, cy + 1); gy++) {
        for (let gx = Math.max(0, cx - 1); gx <= Math.min(w - 1, cx + 1); gx++) {
          const cc = gy * w + gx;
          for (let q = cs[cc]; q < cs[cc + 1]; q++) {
            const j = this.cellItems[q];
            if (j <= i) continue;
            let dx = xi - this.x[j];
            let dy = yi - this.y[j];
            const d2 = dx * dx + dy * dy;
            if (d2 >= MIN_DIST * MIN_DIST) continue;
            let d = Math.sqrt(d2);
            if (d < 1) {
              // Coincident units: split along a direction that depends on the pair, so triples do not cancel out.
              const k = (i * 3 + j * 5) & 7;
              dx = [1, 1, 0, -1, -1, -1, 0, 1][k];
              dy = [0, 1, 1, 1, 0, -1, -1, -1][k];
              d = k & 1 ? Math.SQRT2 : 1;
            }
            const push = Math.min(MAX_PUSH, Math.ceil((MIN_DIST - d) / 2) + 1);
            const nx = dx / d;
            const ny = dy / d;
            // Idle units yield more; two walkers also swerve to the right so head-on pairs do not lock.
            const mi = this.moving[i];
            const mj = this.moving[j];
            const wi = mi === mj ? 1 : mi ? 0.6 : 1.4;
            const wj = mi === mj ? 1 : mj ? 0.6 : 1.4;
            const tan = mi && mj ? 0.35 : 0;
            this.ax[i] += Math.round((nx - tan * ny) * push * wi);
            this.ay[i] += Math.round((ny + tan * nx) * push * wi);
            this.ax[j] -= Math.round((nx - tan * ny) * push * wj);
            this.ay[j] -= Math.round((ny + tan * nx) * push * wj);
          }
        }
      }
    }
    for (let i = 0; i < count; i++) {
      const sx = this.ax[i];
      const sy = this.ay[i];
      if (sx === 0 && sy === 0) continue;
      const nx = this.x[i] + sx;
      const ny = this.y[i] + sy;
      if (!this.blockedAt(nx, ny)) {
        this.x[i] = nx;
        this.y[i] = ny;
      } else if (!this.blockedAt(nx, this.y[i])) this.x[i] = nx;
      else if (!this.blockedAt(this.x[i], ny)) this.y[i] = ny;
    }
  }

  /** Stuck handling: ask for a new path, accept a crowded arrival, or give up. */
  private progress(i: number): void {
    const moved = (this.x[i] - this.ox[i]) ** 2 + (this.y[i] - this.oy[i]) ** 2;
    if (moved >= 36) {
      this.stuck[i] = Math.max(0, this.stuck[i] - 2);
      return;
    }
    const s = ++this.stuck[i];
    const near = (this.x[i] - this.tx[i]) ** 2 + (this.y[i] - this.ty[i]) ** 2 <= 2 * FP * 2 * FP;
    if (near && s >= 12) this.finish(i);
    else if (s >= STUCK_REPATH && this.pathId[i] >= 0 && this.repaths[i] < 4 && this.budget > 0) {
      this.repath(i);
      this.stuck[i] = 0;
    } else if (s >= STUCK_GIVE_UP) this.finish(i);
  }

  private blockedAt(fx: number, fy: number): boolean {
    return isBlockedAt(this.map, Math.floor(fx / FP), Math.floor(fy / FP));
  }

  // ---- fog of war ----

  /** Recompute what the local team (team 0) sees; vision shrinks at night. */
  updateFog(): void {
    const { map, visible, explored } = this;
    const { w, h } = map;
    visible.fill(0);
    const r = this.daylight > 120 ? VISION_DAY : VISION_NIGHT;
    const r2 = r * r + r;
    for (let i = 0; i < this.count; i++) {
      if (this.team[i] !== 0 || this.cb.hp[i] <= 0) continue;
      const ux = Math.floor(this.x[i] / FP);
      const uy = Math.floor(this.y[i] / FP);
      for (let dy = -r; dy <= r; dy++) {
        const py = uy + dy;
        if (py < 0 || py >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const px = ux + dx;
          if (px < 0 || px >= w || dx * dx + dy * dy > r2) continue;
          visible[py * w + px] = explored[py * w + px] = 1;
        }
      }
    }
    this.fogVersion++;
  }

  /** FNV-1a over tick, rng state, every per-unit array and the explored map. */
  hash(): number {
    let h = 0x811c9dc5;
    const mix = (v: number): void => {
      h = Math.imul(h ^ (v & 0xff), 0x01000193);
      h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193);
      h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193);
      h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193);
    };
    mix(this.tick);
    mix(this.rng.state);
    for (let i = 0; i < this.count; i++) {
      mix(this.x[i]);
      mix(this.y[i]);
      mix(this.tx[i]);
      mix(this.ty[i]);
      mix(this.moving[i]);
      mix(this.pathId[i]);
      mix(this.wp[i]);
      mix(this.stuck[i]);
      mix(this.repaths[i]);
      mix(this.dir[i]);
    }
    for (let t = 0; t < this.explored.length; t++) if (this.explored[t]) mix(t);
    this.cb.hashInto(mix);
    return h >>> 0;
  }

  snapshot(): Snapshot {
    return {
      tick: this.tick,
      rng: this.rng.state,
      x: this.x.slice(),
      y: this.y.slice(),
      tx: this.tx.slice(),
      ty: this.ty.slice(),
      moving: this.moving.slice(),
      pathId: this.pathId.slice(),
      wp: this.wp.slice(),
      stuck: this.stuck.slice(),
      repaths: this.repaths.slice(),
      dir: this.dir.slice(),
      visible: this.visible.slice(),
      explored: this.explored.slice(),
      paths: [...this.paths].map(([id, p]) => [id, p.pts.slice(), p.refs]),
      nextPath: this.nextPath,
      cb: this.cb.snapshot(),
    };
  }

  restore(s: Snapshot): void {
    this.tick = s.tick;
    this.rng.state = s.rng;
    this.x = s.x.slice();
    this.y = s.y.slice();
    this.tx = s.tx.slice();
    this.ty = s.ty.slice();
    this.moving = s.moving.slice();
    this.pathId = s.pathId.slice();
    this.wp = s.wp.slice();
    this.stuck = s.stuck.slice();
    this.repaths = s.repaths.slice();
    this.dir = s.dir.slice();
    this.visible = s.visible.slice();
    this.explored = s.explored.slice();
    this.paths = new Map(s.paths.map(([id, pts, refs]) => [id, { pts: pts.slice(), refs }]));
    this.nextPath = s.nextPath;
    this.cb.restore(s.cb, this.team);
    this.fogVersion++;
  }
}

/** Replay a command log on a fresh sim for `ticks` ticks. */
export function replay(sim: Sim, log: readonly LoggedCommand[], ticks: number): void {
  let k = 0;
  for (let t = 1; t <= ticks; t++) {
    const cmds: Command[] = [];
    while (k < log.length && log[k].tick === t) cmds.push(log[k++].cmd);
    sim.step(cmds);
  }
}
