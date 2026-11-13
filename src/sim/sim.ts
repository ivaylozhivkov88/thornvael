import { isBlockedAt, type GameMap } from '../map';
import type { ShrineDef } from '../mapdoc';
import { dayLight } from './daynight';
import { CombatState, DEFS, Ord, POOLS, enemyNear, lootPos, nearestLoot, think, toGuard, type CombatSnap } from './combat';
import { cloneHero, hashHero, heroCommand, type HeroCommand, type HeroState } from './hero';
import { NST, SPELLS, St, Tk } from './spelldata';
import { addStatus, knows, resolveTarget, statusSpeed } from './spells';
import { FP, Pather, dir16, lineClear, regionsOf, speedPct } from './path';
import { Rng } from './rng';
import type { ScriptRuntime, ScriptState } from './script';
import { buildTowns, checkQuests, cloneTown, hashTown, newTownState, townCommand, type TownCommand, type TownDef, type TownRt, type TownState } from './town';
import { DYNAMIC_ITEM_OFFSET, getItemDef, registerDynamicItem, unregisterDynamicItem, ITEMS, type ItemDef, type ItemInstance } from './items';

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
const COINC_DX = Int8Array.of(1, 1, 0, -1, -1, -1, 0, 1);
const COINC_DY = Int8Array.of(0, 1, 1, 1, 0, -1, -1, -1);

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
      spell?: number; // cast: spell id, default 0 (Fire Bolt)
    }
  | { type: 'autocast'; ids: number[]; spell: number } // spell id, or -1 to switch autocast off
  | HeroCommand
  | TownCommand;
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
  hero: HeroState | null;
  hidden: Uint8Array;
  peace: Uint8Array;
  script: ScriptState | null;
  team?: Uint8Array; // added in save version 2
  town?: TownState;
  shrineCd?: Uint16Array;
  instances?: ItemInstance[];
  nextInstanceId?: number;
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
  /** Monster palette tiers per unit (1..5). Default: all 1. */
  tiers?: number[];
  /** Monster catalog family ids per unit. Default: all ''. */
  families?: string[];
  /** Composable boss modifiers per unit. Default: none. */
  bossMods?: readonly (readonly string[])[];
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
  /** The player's hero (attributes, pack, gear), or null in games without one. Set up with createHero before the first tick. */
  hero: HeroState | null = null;
  /** 1 for a unit that is phased out by a mission script: not drawn, not targeted, not simulated. */
  hidden: Uint8Array;
  /** peace[a * 4 + b] = 1 when team a does not attack team b (set by mission scripts). */
  peace = new Uint8Array(16);
  /** Mission script, or null for free play. Attach with attachScript before the first tick. */
  script: ScriptRuntime | null = null;
  /** Towns of the map (static), and their changing state (stock, quests), which is saved. */
  towns: TownRt[] = [];
  town: TownState = newTownState(0);
  /** Interactive world shrines and their recharge countdowns in ticks. */
  shrines: ShrineDef[] = [];
  shrineCd: Uint16Array = new Uint16Array(0);
  private nextInstanceId = DYNAMIC_ITEM_OFFSET;
  readonly instances = new Map<number, ItemInstance>();

  createItemInstance(baseId: number, quality: 'magic' | 'rare' | string, def: ItemDef): ItemInstance {
    const id = this.nextInstanceId++;
    const inst: ItemInstance = {
      id,
      baseId,
      quality,
      name: def.name,
      def,
    };
    this.instances.set(id, inst);
    registerDynamicItem(id, def);
    return inst;
  }

  getItemDef(id: number): ItemDef | undefined {
    if (id < DYNAMIC_ITEM_OFFSET) return ITEMS[id];
    return this.instances.get(id)?.def ?? getItemDef(id);
  }

  destroyItemInstance(id: number): void {
    if (id >= DYNAMIC_ITEM_OFFSET) {
      this.instances.delete(id);
      unregisterDynamicItem(id);
    }
  }
  /** Uniform grid of living units, rebuilt every tick; used for collision and target search. */
  readonly cellStart: Int32Array;
  /** End (exclusive) of each cell's range in cellItems. Only cells in `occupied` are non-empty; all others stay 0/0. */
  readonly cellEnd: Int32Array;
  readonly cellItems: Int32Array;
  private readonly occupied: Int32Array;
  private occupiedN = 0;

  private paths = new Map<number, PathRec>();
  private nextPath = 1;
  private budget = 0;
  private dispatchBudget = 0;
  private readonly pather: Pather;
  private readonly region: Int32Array;
  private readonly ox: Int32Array;
  private readonly oy: Int32Array;
  private readonly ax: Int32Array;
  private readonly ay: Int32Array;
  private readonly fogSeen: Uint32Array;
  private readonly formUsed: Uint32Array;
  private formStamp = 0;
  private readonly formSlotX: Int32Array;
  private readonly formSlotY: Int32Array;
  private readonly formBad: Int32Array;
  private readonly formPf: Int32Array;
  private readonly formPr: Int32Array;
  private readonly formOrder: Int32Array;
  private readonly seenStamp: Uint32Array;
  private seenCounter = 0;

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
    this.hidden = new Uint8Array(n);
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
    this.cellEnd = new Int32Array(map.w * map.h + 1);
    this.cellItems = new Int32Array(n);
    this.occupied = new Int32Array(n);
    this.fogSeen = new Uint32Array(map.w * map.h);
    this.formUsed = new Uint32Array(map.w * map.h);
    this.formSlotX = new Int32Array(n);
    this.formSlotY = new Int32Array(n);
    this.formBad = new Int32Array(n);
    this.formPf = new Int32Array(n);
    this.formPr = new Int32Array(n);
    this.formOrder = new Int32Array(n);
    this.seenStamp = new Uint32Array(n);
    this.combat = opts.combat ?? false;
    this.cb = new CombatState(n, opts.kinds ?? Array(n).fill(0), this.team, opts.hpMul ?? 1, opts.tiers, opts.families, opts.bossMods);
  }

  /** Set up the map's towns. Before the first tick. */
  attachTowns(defs: readonly TownDef[]): void {
    this.towns = buildTowns(this, defs);
    this.town = newTownState(defs.length);
  }

  /** Set up interactive world shrines before the first tick. */
  attachShrines(defs: readonly ShrineDef[]): void {
    this.shrines = defs.map((d) => ({ ...d }));
    this.shrineCd = new Uint16Array(defs.length);
  }

  /**
   * Apply a town command at once (the game is paused inside a building). It is logged for the next
   * tick, and step runs town commands before anything else, so a replay gets the same result.
   */
  now(cmd: TownCommand): void {
    this.log.push({ tick: this.tick + 1, cmd });
    this.tick++;
    townCommand(this, cmd);
    this.tick--;
  }

  attachScript(rt: ScriptRuntime): void {
    this.script = rt;
    rt.setup(this);
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
    for (const cmd of cmds) {
      if (cmd.type !== 'town') continue;
      this.log.push({ tick: this.tick, cmd });
      townCommand(this, cmd);
    }
    this.budget = PATHS_PER_TICK;
    this.dispatchBudget = 3;
    if (this.combat) this.buildGrid();
    for (const cmd of cmds) {
      if (cmd.type === 'town') continue;
      this.log.push({ tick: this.tick, cmd });
      this.dispatch(cmd);
    }
    // Script commands are not logged: a replay runs the same script and produces them again.
    if (this.script) for (const cmd of this.script.run(this)) this.dispatch(cmd);
    if (this.dispatchBudget < 3) this.budget = Math.max(0, this.budget - (3 - this.dispatchBudget));
    this.ox.set(this.x);
    this.oy.set(this.y);
    if (this.combat) think(this);
    for (let i = 0; i < this.count; i++) if (this.moving[i]) this.steer(i);
    this.separate();
    for (let i = 0; i < this.count; i++) if (this.moving[i]) this.progress(i);
    if (this.tick === 1 || this.tick % 5 === 0) this.updateFog();
    if (this.towns.length) checkQuests(this);
    if (this.shrines.length) this.stepShrines();
    if (this.combat && this.tick % 25 === 0) this.stepBossAuras();
  }

  private stepBossAuras(): void {
    const cb = this.cb;
    const count = this.count;
    const hp = cb.hp;
    const team = this.team;
    const hidden = this.hidden;
    const x = this.x;
    const y = this.y;
    const auraR2 = (6.0 * FP) * (6.0 * FP);

    for (let b = 0; b < count; b++) {
      if (hp[b] <= 0 || hidden[b]) continue;
      const mods = cb.bossMods[b];
      if (!mods || !mods.includes('blessed_aura')) continue;
      const bx = x[b];
      const by = y[b];
      const bteam = team[b];
      for (let u = 0; u < count; u++) {
        if (hp[u] <= 0 || hidden[u] || team[u] !== bteam) continue;
        const dx = x[u] - bx;
        const dy = y[u] - by;
        if (dx * dx + dy * dy <= auraR2) {
          addStatus(this, u, St.Bless, 50, 0);
        }
      }
    }
  }

  private stepShrines(): void {
    const cb = this.cb;
    const hp = cb.hp;
    const x = this.x;
    const y = this.y;
    const team = this.team;
    const hidden = this.hidden;
    const trigR2 = (1.5 * FP) * (1.5 * FP);
    const areaR2 = (3.5 * FP) * (3.5 * FP);
    for (let s = 0; s < this.shrines.length; s++) {
      if (this.shrineCd[s] > 0) {
        this.shrineCd[s]--;
        continue;
      }
      const sh = this.shrines[s];
      const sx = (sh.x + 0.5) * FP;
      const sy = (sh.y + 0.5) * FP;
      let triggered = false;
      for (let i = 0; i < this.count; i++) {
        if (team[i] !== 0 || hp[i] <= 0 || hidden[i]) continue;
        const dx = x[i] - sx;
        const dy = y[i] - sy;
        if (dx * dx + dy * dy <= trigR2) {
          triggered = true;
          break;
        }
      }
      if (!triggered) continue;
      for (let u = 0; u < this.count; u++) {
        if (team[u] !== 0 || hp[u] <= 0 || hidden[u]) continue;
        const dx = x[u] - sx;
        const dy = y[u] - sy;
        if (dx * dx + dy * dy > areaR2) continue;
        switch (sh.kind) {
          case 'healing': {
            const healAmt = Math.max(20, Math.round(cb.hpMax[u] * 0.5));
            cb.hp[u] = Math.min(cb.hpMax[u], cb.hp[u] + healAmt);
            cb.emit(7, x[u], y[u], healAmt, 2);
            break;
          }
          case 'mana': {
            const manaAmt = Math.max(20, Math.round(cb.manaMax[u] * 0.6));
            if (cb.manaMax[u] > 0) cb.mana[u] = Math.min(cb.manaMax[u], cb.mana[u] + manaAmt);
            cb.emit(9, x[u], y[u], 0, 5);
            break;
          }
          case 'combat': {
            const idx = u * NST + St.Bless;
            cb.stMask[u] |= 1 << St.Bless;
            cb.stT[idx] = Math.max(cb.stT[idx], 300);
            cb.emit(8, x[u], y[u], St.Bless, 5);
            break;
          }
          case 'armor': {
            const idx = u * NST + St.Shield;
            cb.stMask[u] |= 1 << St.Shield;
            cb.stT[idx] = Math.max(cb.stT[idx], 300);
            cb.stV[idx] = Math.max(cb.stV[idx], 40);
            cb.emit(8, x[u], y[u], St.Shield, 4);
            break;
          }
          case 'haste': {
            const idx = u * NST + St.Haste;
            cb.stMask[u] |= 1 << St.Haste;
            cb.stT[idx] = Math.max(cb.stT[idx], 300);
            cb.emit(8, x[u], y[u], St.Haste, 3);
            break;
          }
          case 'ward': {
            const bIdx = u * NST + St.Bless;
            cb.stMask[u] |= 1 << St.Bless;
            cb.stT[bIdx] = Math.max(cb.stT[bIdx], 300);
            const sIdx = u * NST + St.Shield;
            cb.stMask[u] |= 1 << St.Shield;
            cb.stT[sIdx] = Math.max(cb.stT[sIdx], 300);
            cb.stV[sIdx] = Math.max(cb.stV[sIdx], 35);
            const healAmt = Math.max(10, Math.round(cb.hpMax[u] * 0.25));
            cb.hp[u] = Math.min(cb.hpMax[u], cb.hp[u] + healAmt);
            cb.emit(7, x[u], y[u], healAmt, 5);
            break;
          }
        }
      }
      this.shrineCd[s] = sh.cooldown ?? 750;
    }
  }

  private dispatch(cmd: Command): void {
    if (cmd.type === 'move') this.apply(cmd);
    else if (cmd.type === 'autocast') this.applyAutocast(cmd);
    else if (cmd.type === 'hero') heroCommand(this, cmd);
    else if (cmd.type === 'town') townCommand(this, cmd);
    else this.applyOrder(cmd);
  }

  // ---- orders: goal, formation, shared path ----

  private tileOf(i: number): number {
    return Math.floor(this.y[i] / FP) * this.map.w + Math.floor(this.x[i] / FP);
  }

  private liveIds(raw: readonly number[]): number[] {
    const stamp = ++this.seenCounter;
    const seen = this.seenStamp;
    const hp = this.cb.hp;
    const count = this.count;
    const out: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      const id = raw[i];
      if (id >= 0 && id < count && hp[id] > 0 && seen[id] !== stamp) {
        seen[id] = stamp;
        out.push(id);
      }
    }
    return out;
  }

  /** Switch autocast of one spell on (or off with -1) for every listed caster that knows it. */
  private applyAutocast(cmd: Extract<Command, { type: 'autocast' }>): void {
    if (!this.combat) return;
    for (const id of this.liveIds(cmd.ids)) {
      if (cmd.spell < 0) this.cb.auto[id] = 0;
      else if (knows(this, id, cmd.spell)) this.cb.auto[id] = cmd.spell + 1;
    }
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
        const sid = cmd.spell ?? 0;
        if (sid < 0 || sid >= SPELLS.length) return;
        const pxf = hasPoint ? Math.round(cmd.x! * FP) : 0;
        const pyf = hasPoint ? Math.round(cmd.y! * FP) : 0;
        const tk = SPELLS[sid].tk;
        for (const id of ids) {
          if (!knows(this, id, sid)) continue;
          let tt = -1;
          if (tk !== Tk.Ground && tk !== Tk.Self) {
            tt = resolveTarget(this, id, sid, t, pxf, pyf, hasPoint);
            if (tt < 0) continue;
          } else if (tk === Tk.Ground && !hasPoint) continue;
          cb.ord[id] = Ord.Cast;
          cb.tgt[id] = tt;
          cb.aux[id] = sid;
          cb.px[id] = pxf;
          cb.py[id] = pyf;
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
        const s = nearestLoot(this, Math.round(cmd.x! * FP), Math.round(cmd.y! * FP), 2 * FP);
        if (s < 0) return;
        const [lx, ly] = lootPos(this, s);
        // only the hero can carry an item bag
        const who = s >= POOLS.sacks ? ids.filter((id) => this.hero !== null && id === this.hero.id) : ids;
        for (const id of who) {
          cb.ord[id] = Ord.Pickup;
          cb.aux[id] = s;
          cb.tgt[id] = -1;
          this.goTo(id, lx, ly);
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
    else if (this.dispatchBudget > 0) {
      this.dispatchBudget--;
      shared = this.pather.find(Math.floor(lx / FP), Math.floor(ly / FP), gx, gy);
    } else shared = Int32Array.of(goalCx, goalCy);
    if (!shared) return;

    const loose = n === 1 || cmd.loose === true;
    const slotX = this.formSlotX;
    const slotY = this.formSlotY;
    if (loose) {
      for (let k = 0; k < n; k++) {
        slotX[k] = goalX;
        slotY[k] = goalY;
      }
    } else {
      this.formation(ids, leadReg, goalX, goalY, goalCx, goalCy);
    }
    const order = loose ? ids : this.assign(ids, goalX, goalY);
    const sharedId = this.addPath(shared, 0);
    let own = PATHS_PER_ORDER;
    for (let k = 0; k < n; k++) {
      const id = order[k];
      this.release(id);
      this.tx[id] = slotX[k];
      this.ty[id] = slotY[k];
      this.moving[id] = 1;
      this.cb.ord[id] = Ord.Move;
      this.cb.tgt[id] = -1;
      this.stuck[id] = 0;
      this.repaths[id] = 0;
      this.wp[id] = 0;
      let pid = sharedId;
      if (id !== lead && own > 0 && this.dispatchBudget > 0 && !lineClear(map, this.x[id], this.y[id], shared[0], shared[1])) {
        this.dispatchBudget--;
        const mine = this.pather.find(Math.floor(this.x[id] / FP), Math.floor(this.y[id] / FP), gx, gy);
        own--;
        if (mine) pid = this.addPath(mine, 0);
      }
      this.paths.get(pid)!.refs++;
      this.pathId[id] = pid;
    }
    if (this.paths.get(sharedId)!.refs === 0) this.paths.delete(sharedId);
  }

  /** Waypoints (x0,y0,x1,y1,... fixed point) of unit i's current path, or null. Read-only view for the debug overlay. */
  pathOf(i: number): Int32Array | null {
    const pid = this.pathId[i];
    return pid >= 0 ? (this.paths.get(pid)?.pts ?? null) : null;
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

  /** Nearest tile (by ring order) around (x, y) that passes `ok`, skipping tiles marked with `stamp` in `used`. */
  private nearestTile(x: number, y: number, ok: (idx: number) => boolean, used: Uint32Array | null, stamp = 0): number {
    const { w, h } = this.map;
    for (const [dx, dy] of RING) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const idx = py * w + px;
      if (this.map.blocked[idx] || (used && used[idx] === stamp) || !ok(idx)) continue;
      return idx;
    }
    return -1;
  }

  /** Slot positions (fixed point) for a rectangular formation facing the direction of travel, written into formSlotX/Y. */
  private formation(ids: number[], reg: number, goalX: number, goalY: number, goalCx: number, goalCy: number): void {
    const { map, region } = this;
    const w = map.w;
    const n = ids.length;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      const id = ids[i];
      sx += this.x[id];
      sy += this.y[id];
    }
    const { fx, fy } = this.facing(Math.floor(sx / n), Math.floor(sy / n), goalX, goalY);
    const rx = -fy;
    const ry = fx;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.5)));
    const rows = Math.ceil(n / cols);
    const slotX = this.formSlotX;
    const slotY = this.formSlotY;
    const used = this.formUsed;
    const stamp = ++this.formStamp;
    const bad = this.formBad;
    let badCount = 0;
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
      slotX[k] = px;
      slotY[k] = py;
      if (ok) used[ty * w + tx] = stamp;
      else bad[badCount++] = k;
    }
    for (let bi = 0; bi < badCount; bi++) {
      const k = bad[bi];
      const tx = Math.floor(slotX[k] / FP);
      const ty = Math.floor(slotY[k] / FP);
      const t = this.nearestTile(
        Math.min(map.w - 1, Math.max(0, tx)),
        Math.min(map.h - 1, Math.max(0, ty)),
        (idx) => region[idx] === reg && lineClear(map, goalCx, goalCy, (idx % w) * FP + FP / 2, Math.floor(idx / w) * FP + FP / 2),
        used,
        stamp,
      );
      if (t >= 0) {
        used[t] = stamp;
        slotX[k] = (t % w) * FP + FP / 2;
        slotY[k] = Math.floor(t / w) * FP + FP / 2;
      } else {
        slotX[k] = goalCx;
        slotY[k] = goalCy;
      }
    }
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
  private assign(ids: number[], goalX: number, goalY: number): Int32Array {
    const n = ids.length;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      const id = ids[i];
      sx += this.x[id];
      sy += this.y[id];
    }
    const cx = Math.floor(sx / n);
    const cy = Math.floor(sy / n);
    const { fx, fy } = this.facing(cx, cy, goalX, goalY);
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.5)));
    const pf = this.formPf;
    const pr = this.formPr;
    const out = this.formOrder;
    for (let i = 0; i < n; i++) {
      const id = ids[i];
      pf[id] = (this.x[id] - cx) * fx + (this.y[id] - cy) * fy;
      pr[id] = (this.x[id] - cx) * -fy + (this.y[id] - cy) * fx;
      out[i] = id;
    }
    for (let i = 1; i < n; i++) {
      const v = out[i];
      const pfv = pf[v];
      let j = i - 1;
      while (j >= 0) {
        const u = out[j];
        const d = pfv - pf[u];
        if (d > 0 || (d === 0 && v < u)) {
          out[j + 1] = u;
          j--;
        } else break;
      }
      out[j + 1] = v;
    }
    for (let r = 0; r * cols < n; r++) {
      const start = r * cols;
      const end = Math.min(n, start + cols);
      for (let i = start + 1; i < end; i++) {
        const v = out[i];
        const prv = pr[v];
        let j = i - 1;
        while (j >= start) {
          const u = out[j];
          const d = pr[u] - prv;
          if (d > 0 || (d === 0 && u > v)) {
            out[j + 1] = u;
            j--;
          } else break;
        }
        out[j + 1] = v;
      }
    }
    return out;
  }

  // ---- movement ----

  private steer(i: number): void {
    const map = this.map;
    const x = this.x[i];
    const y = this.y[i];
    const pct = Math.max(25, speedPct(map, Math.floor(x / FP), Math.floor(y / FP)));
    const st = this.cb.stMask[i] === 0 ? 100 : statusSpeed(this.cb.stMask[i]);
    const spd = Math.floor((UNIT_SPEED * pct * DEFS[this.cb.kind[i]].speed * st) / 1000000);
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
        if (this.budget > 0 && this.repaths[i] < 4 && !lineClear(map, x, y, tgx, tgy) && this.repath(i)) {
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

  /**
   * Bucket the living units by tile (sparse counting sort). Cost is O(units), not O(map tiles):
   * only the cells used last tick are cleared, so a 640x480 map steps as fast as a 64x48 one.
   * Within a cell units stay in ascending id order, exactly as before (determinism).
   */
  private buildGrid(): void {
    const { count, occupied } = this;
    const cs = this.cellStart;
    const ce = this.cellEnd;
    const hp = this.cb.hp;
    const hid = this.hidden;
    for (let k = 0; k < this.occupiedN; k++) {
      const c = occupied[k];
      cs[c] = 0;
      ce[c] = 0;
    }
    let m = 0;
    for (let i = 0; i < count; i++) {
      if (hp[i] <= 0 || hid[i]) continue;
      const c = this.cellOf(i);
      if (ce[c]++ === 0) occupied[m++] = c;
    }
    this.occupiedN = m;
    let run = 0;
    for (let k = 0; k < m; k++) {
      const c = occupied[k];
      const n = ce[c];
      cs[c] = run;
      ce[c] = run; // becomes the write cursor, ends up as the exclusive end
      run += n;
    }
    for (let i = 0; i < count; i++) {
      if (hp[i] <= 0 || hid[i]) continue;
      this.cellItems[ce[this.cellOf(i)]++] = i;
    }
  }

  private separate(): void {
    const { map, count } = this;
    const w = map.w;
    const h = map.h;
    const cs = this.cellStart;
    const ce = this.cellEnd;
    this.buildGrid();
    this.ax.fill(0);
    this.ay.fill(0);
    const hp = this.cb.hp;
    const x = this.x;
    const y = this.y;
    for (let i = 0; i < count; i++) {
      if (hp[i] <= 0) continue;
      const xi = x[i];
      const yi = y[i];
      const cx = Math.min(w - 1, Math.max(0, xi >> 8));
      const cy = Math.min(h - 1, Math.max(0, yi >> 8));
      const gy1 = Math.min(h - 1, cy + 1);
      const gx0 = Math.max(0, cx - 1);
      const gx1 = Math.min(w - 1, cx + 1);
      for (let gy = Math.max(0, cy - 1); gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const cc = gy * w + gx;
          for (let q = cs[cc]; q < ce[cc]; q++) {
            const j = this.cellItems[q];
            if (j <= i) continue;
            let dx = xi - x[j];
            let dy = yi - y[j];
            const d2 = dx * dx + dy * dy;
            if (d2 >= MIN_DIST * MIN_DIST) continue;
            let d = Math.sqrt(d2);
            if (d < 1) {
              // Coincident units: split along a direction that depends on the pair, so triples do not cancel out.
              const k = (i * 3 + j * 5) & 7;
              dx = COINC_DX[k];
              dy = COINC_DY[k];
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
    const { map, visible, explored, fogSeen } = this;
    const { w, h } = map;
    visible.fill(0);
    const stamp = this.fogVersion + 1;
    const r = this.daylight > 120 ? VISION_DAY : VISION_NIGHT;
    const r2 = r * r + r;
    const hp = this.cb.hp;
    const team = this.team;
    for (let i = 0; i < this.count; i++) {
      if (team[i] !== 0 || hp[i] <= 0) continue;
      const ux = this.x[i] >> 8;
      const uy = this.y[i] >> 8;
      if (ux < 0 || ux >= w || uy < 0 || uy >= h) continue;
      const ui = uy * w + ux;
      if (fogSeen[ui] === stamp) continue;
      fogSeen[ui] = stamp;
      const dyMin = Math.max(-r, -uy);
      const dyMax = Math.min(r, h - 1 - uy);
      for (let dy = dyMin; dy <= dyMax; dy++) {
        const rem = r2 - dy * dy;
        let maxDx = Math.floor(Math.sqrt(rem));
        if ((maxDx + 1) * (maxDx + 1) <= rem) maxDx++;
        while (maxDx * maxDx > rem) maxDx--;
        const x0 = Math.max(0, ux - maxDx);
        const x1 = Math.min(w - 1, ux + maxDx);
        let idx = (uy + dy) * w + x0;
        const end = idx + (x1 - x0);
        for (; idx <= end; idx++) {
          visible[idx] = 1;
          explored[idx] = 1;
        }
      }
    }
    this.fogVersion = stamp;
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
    hashHero(this.hero, mix);
    for (let i = 0; i < this.count; i++) if (this.hidden[i]) mix(i + 1);
    for (let i = 0; i < 16; i++) if (this.peace[i]) mix(100 + i);
    this.script?.hashInto(mix);
    for (let i = 0; i < this.count; i++) mix(this.team[i]);
    hashTown(this.town, mix);
    if (this.shrines.length) for (let s = 0; s < this.shrineCd.length; s++) mix(this.shrineCd[s]);
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
      hero: cloneHero(this.hero),
      hidden: this.hidden.slice(),
      peace: this.peace.slice(),
      script: this.script ? this.script.snapshot() : null,
      team: this.team.slice(),
      town: cloneTown(this.town),
      instances: [...this.instances.values()],
      nextInstanceId: this.nextInstanceId,
      ...(this.shrines.length ? { shrineCd: this.shrineCd.slice() } : {}),
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
    this.hero = cloneHero(s.hero);
    this.hidden = s.hidden.slice();
    this.peace = s.peace.slice();
    if (this.script && s.script) this.script.restore(s.script);
    if (s.team) this.team.set(s.team);
    this.town = s.town ? cloneTown(s.town) : newTownState(this.towns.length);
    if (s.shrineCd && this.shrines.length) this.shrineCd = s.shrineCd.slice();
    else this.shrineCd = new Uint16Array(this.shrines.length);
    this.instances.clear();
    if (s.instances) {
      for (const inst of s.instances) {
        this.instances.set(inst.id, inst);
        registerDynamicItem(inst.id, inst.def);
      }
    }
    if (s.nextInstanceId) this.nextInstanceId = s.nextInstanceId;
    this.cb.recount(this.team);
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
