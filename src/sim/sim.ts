import { PropKind, isBlockedAt, type GameMap } from '../map';
import type { ShrineDef } from '../mapdoc';
import { dayLight } from './daynight';
import type { BossPhaseController, BossTickEvent } from './ai/boss-phases';
import type { EliteDirector, EliteTickEvent } from './ai/elite-director';
import type { WorldEventsDirector } from './ai/shrines-events';
import type { SkirmishModeController } from './ai/skirmish-modes';
import { CombatState, DEFS, Elem, Ord, POOLS, enemyNear, lootPos, nearestLoot, strike, think, toGuard, type CombatSnap } from './combat';
import { Did, INV_MAX, addHeroXp, addItem, cloneHero, dropBag, hashHero, heroCommand, type HeroCommand, type HeroState } from './hero';
import { NST, SPELLS, St, Tk } from './spelldata';
import { isCorpse, knows, resolveTarget, revive } from './spells';
import { FP, Pather, invalidateRegions, isChokepoint, lineClear, regionsOf } from './path';
import { Rng } from './rng';
import { ADVENTURE_OBJECT_KINDS, interactAdventureObject, type ScriptRuntime, type ScriptState } from './script';
import { buildTowns, checkQuests, cloneTown, hashTown, newTownState, townCommand, type TownCommand, type TownDef, type TownRt, type TownState } from './town';
import { jsonUnique } from './affixes';
import { DYNAMIC_ITEM_OFFSET, getItemDef, itemId, registerDynamicItem, unregisterDynamicItem, type ItemDef, type ItemInstance } from './items';
import { stepAuraSystem } from './auras';
import { applyGroupFormation, type FormationScratch } from './formation';
import { FlatSpatialHash } from './spatial-hash';
import { hashSuperUniques } from './super-uniques';
import {
  UNIT_BODY_RADIUS,
  computeUnitMasses,
  prepareSteeringDirections,
  separateUnits,
  steerUnit,
  type SteeringContext,
} from './steering';

export { FP };
export const TICKS_PER_SECOND = 25;
export const UNIT_SPEED = Math.round((3.2 * FP) / TICKS_PER_SECOND); // 3.2 tiles per second
export const UNIT_RADIUS = UNIT_BODY_RADIUS; // 0.3 tile; two units never rest closer than 2 radii
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
      spell?: number; // cast: spell id, default 0 (Fire Bolt)
    }
  | { type: 'autocast'; ids: number[]; spell: number } // spell id, or -1 to switch autocast off
  | { type: 'repopulate'; id: number; x: number; y: number; cost?: number }
  | { type: 'smash_prop'; x: number; y: number }
  | { type: 'interact_object'; x: number; y: number }
  | { type: 'face'; id: number; dir?: number; stop?: boolean; swing?: boolean }
  | { type: 'reward'; gold: number; xp: number; items?: string[] } // quest payment to the player
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
  lootRng?: number;
  cosmeticRng?: number;
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
  destroyedProps?: number[];
  visitedAdv?: number[];
  ngPlusTier?: number;
  directors?: {
    elites: ReturnType<EliteDirector['snapshot']>;
    events: ReturnType<WorldEventsDirector['snapshot']>;
    bosses: ReturnType<BossPhaseController['snapshot']>[];
    skirmishMode: ReturnType<SkirmishModeController['snapshot']> | null;
    townOnly?: boolean;
  };
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
  /** Active New Game+ tier (0 = standard, 1+ = NG+ scaling). */
  ngPlusTier?: number;
}

// Tile offsets around a point, nearest first, used to find the closest valid tile.
const RING: [number, number][] = [];
for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) if (dx * dx + dy * dy <= 64) RING.push([dx, dy]);
RING.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);

const LOOT_RNG_SALT = 0x9e3779b9;
const COSMETIC_RNG_SALT = 0x85ebca6b;

/** Deterministic world state. No DOM, no renderer, no Math.random, no float state. */
export class Sim {
  tick = 0;
  readonly rng: Rng;
  readonly lootRng: Rng;
  readonly cosmeticRng: Rng;
  /** Semantic alias for the primary combat/AI simulation PRNG stream. */
  get simRng(): Rng {
    return this.rng;
  }
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
  ngPlusTier: number;
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
  /** Optional deterministic simulation directors (elites, shrines/roaming events, boss phases, skirmish modes). */
  directors: {
    elites: EliteDirector;
    events: WorldEventsDirector;
    bosses: BossPhaseController[];
    bossUnitIds?: number[];
    skirmishMode: SkirmishModeController | null;
    townOnly?: boolean;
  } | null = null;
  private bossPrevHp: number[] = [];
  private nextInstanceId = DYNAMIC_ITEM_OFFSET;
  readonly instances = new Map<number, ItemInstance>();
  private readonly usedSerials = new Set<number>();

  /** An instance carried over from an earlier map: keep its id and serial from being issued again. */
  adoptInstance(inst: ItemInstance): void {
    this.instances.set(inst.id, inst);
    registerDynamicItem(inst.id, inst.def);
    if (inst.serial !== undefined) this.usedSerials.add(inst.serial);
    this.nextInstanceId = Math.max(this.nextInstanceId, inst.id + 1);
  }

  createItemInstance(baseId: number, quality: 'magic' | 'rare' | string, def: ItemDef): ItemInstance {
    const id = this.nextInstanceId++;
    // Serial: uint32 mixed from the lootRng state and the id. Reads the stream without advancing it.
    let serial = Math.imul(this.lootRng.state ^ Math.imul(id, 0x9e3779b1), 0x85ebca6b) >>> 0;
    while (this.usedSerials.has(serial)) serial = (serial + 0x6d2b79f5) >>> 0;
    this.usedSerials.add(serial);
    const inst: ItemInstance = {
      id,
      serial,
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
    if (id < DYNAMIC_ITEM_OFFSET) return getItemDef(id);
    return this.instances.get(id)?.def ?? getItemDef(id);
  }

  destroyItemInstance(id: number): void {
    if (id >= DYNAMIC_ITEM_OFFSET) {
      const existing = this.instances.get(id);
      if (existing?.serial !== undefined) this.usedSerials.delete(existing.serial);
      this.instances.delete(id);
      unregisterDynamicItem(id);
    }
  }
  /** Flat Int32Array spatial hash of living units, rebuilt each tick for collision and target search. */
  readonly spatialHash: FlatSpatialHash;
  readonly cellStart: Int32Array;
  /** End (exclusive) of each cell's range in cellItems. Only occupied cells are non-empty; all others stay 0/0. */
  readonly cellEnd: Int32Array;
  readonly cellItems: Int32Array;

  private paths = new Map<number, PathRec>();
  private nextPath = 1;
  private budget = 0;
  private dispatchBudget = 0;
  private readonly pather: Pather;
  private region: Int32Array;
  private gridDirty = true;
  private readonly ox: Int32Array;
  private readonly oy: Int32Array;
  private readonly ax: Int32Array;
  private readonly ay: Int32Array;
  private readonly fogSeen: Uint32Array;
  private readonly formScratch: FormationScratch;
  private readonly unitMasses: Uint16Array;
  private massesHeroCls = -2;
  private readonly steerCtx: SteeringContext;
  private readonly seenStamp: Uint32Array;
  private seenCounter = 0;

  constructor(
    readonly map: GameMap,
    seed: number,
    teams: number[],
    opts: SimOptions = {},
  ) {
    this.rng = new Rng(seed);
    this.lootRng = new Rng(((seed ^ LOOT_RNG_SALT) >>> 0) || 1);
    this.cosmeticRng = new Rng(((seed ^ COSMETIC_RNG_SALT) >>> 0) || 1);
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
    this.spatialHash = new FlatSpatialHash(map.w, map.h, n);
    this.cellStart = this.spatialHash.cellStart;
    this.cellEnd = this.spatialHash.cellEnd;
    this.cellItems = this.spatialHash.cellItems;
    this.fogSeen = new Uint32Array(map.w * map.h);
    this.formScratch = {
      slotX: new Int32Array(n),
      slotY: new Int32Array(n),
      bad: new Int32Array(n),
      pf: new Int32Array(n),
      pr: new Int32Array(n),
      order: new Int32Array(n),
      rawU: new Int32Array(n),
      rawV: new Int32Array(n),
      roles: new Uint8Array(n),
      rowMeta: new Int32Array(n),
      colMeta: new Int32Array(n),
      used: new Uint32Array(map.w * map.h),
      stamp: 0,
    };
    this.unitMasses = new Uint16Array(n);
    this.steerCtx = {
      masses: this.unitMasses,
      ax: this.ax,
      ay: this.ay,
      dirX: new Int32Array(n),
      dirY: new Int32Array(n),
      unitSpeed: UNIT_SPEED,
      buildGrid: () => this.ensureGrid(),
      getPath: (pid) => this.paths.get(pid),
      repath: (i) => this.repath(i),
      finish: (i) => this.finish(i),
      hasBudget: () => this.budget > 0,
    };
    this.seenStamp = new Uint32Array(n);
    this.combat = opts.combat ?? false;
    this.ngPlusTier = Math.max(0, Math.floor(opts.ngPlusTier ?? 0));
    this.cb = new CombatState(n, opts.kinds ?? Array(n).fill(0), this.team, opts.hpMul ?? 1, opts.tiers, opts.families, opts.bossMods);
    if (this.ngPlusTier > 0) {
      const hpScale = 1 + 0.35 * this.ngPlusTier;
      for (let i = 0; i < n; i++) {
        if (this.team[i] === 0) continue;
        this.cb.hpMax[i] = Math.min(32000, Math.round(this.cb.hpMax[i] * hpScale));
        this.cb.hp[i] = this.cb.hpMax[i];
      }
    }
  }

  /** Set up the map's towns. Before the first tick. */
  attachTowns(defs: readonly TownDef[], act?: number): void {
    this.towns = buildTowns(this, defs);
    let resolvedAct = act ?? 1;
    if (act === undefined && defs.length > 0) {
      const name = defs[0].name.toLowerCase();
      if (name.includes('redmarsh')) resolvedAct = 2;
      else if (name.includes('oakhaven')) resolvedAct = 3;
      else if (name.includes('highcrest')) resolvedAct = 4;
    }
    this.town = newTownState(defs.length, resolvedAct);
  }

  /** Set up interactive world shrines before the first tick. */
  attachShrines(defs: readonly ShrineDef[]): void {
    this.shrines = defs.map((d) => ({ ...d }));
    this.shrineCd = new Uint16Array(defs.length);
  }

  /** Attach deterministic AI directors so they step, hash, and snapshot inside the sim. */
  attachDirectors(
    directors: {
      elites: EliteDirector;
      events: WorldEventsDirector;
      bosses: BossPhaseController[];
      bossUnitIds?: number[];
      skirmishMode: SkirmishModeController | null;
    },
    townOnly = false,
  ): void {
    this.directors = { ...directors, townOnly };
    this.bossPrevHp = (directors.bossUnitIds ?? []).map((u) => (u >= 0 && u < this.count ? this.cb.hp[u] : 0));
  }

  /**
   * Apply a town or hero command at once (the game is paused inside a building). It is logged for the next
   * tick, and step runs town commands before anything else, so a replay gets the same result.
   */
  now(cmd: TownCommand | HeroCommand): void {
    this.log.push({ tick: this.tick + 1, cmd });
    this.tick++;
    if (cmd.type === 'town') townCommand(this, cmd);
    else if (cmd.type === 'hero') heroCommand(this, cmd);
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
    this.gridDirty = true;
  }

  /** Recompute walkable region connectivity after map obstacles change (e.g. smashing a prop). */
  refreshRegions(): void {
    invalidateRegions(this.map);
    this.region = regionsOf(this.map);
  }

  /** Mark the unit spatial hash dirty so the next query rebuilds it. */
  markGridDirty(): void {
    this.gridDirty = true;
  }

  /** Rebuild the spatial hash only if unit positions or living states changed. */
  ensureGrid(): void {
    if (this.gridDirty) this.buildGrid();
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
    const stx = Math.floor(this.x[i] / FP);
    const sty = Math.floor(this.y[i] / FP);
    const gtx = Math.floor(gx / FP);
    const gty = Math.floor(gy / FP);
    const w = this.map.w;
    const h = this.map.h;
    if (stx < 0 || sty < 0 || stx >= w || sty >= h || gtx < 0 || gty < 0 || gtx >= w || gty >= h) {
      this.finish(i);
      return;
    }
    const sr = this.region[sty * w + stx];
    const gr = this.region[gty * w + gtx];
    if (sr < 0 || sr !== gr) {
      this.finish(i);
      return;
    }
    this.release(i);
    this.tx[i] = gx;
    this.ty[i] = gy;
    this.moving[i] = 1;
    this.stuck[i] = 0;
    this.repaths[i] = 0;
    this.wp[i] = 0;
    if (!lineClear(this.map, this.x[i], this.y[i], gx, gy) && this.budget > 0) {
      this.budget--;
      const pts = this.pather.find(stx, sty, gtx, gty);
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
      if (cmd.type !== 'town' && cmd.type !== 'hero') continue;
      this.log.push({ tick: this.tick, cmd });
      if (cmd.type === 'town') townCommand(this, cmd);
      else heroCommand(this, cmd);
      this.gridDirty = true;
    }
    this.budget = PATHS_PER_TICK;
    this.dispatchBudget = 3;
    if (this.combat) this.ensureGrid();
    for (const cmd of cmds) {
      if (cmd.type === 'town' || cmd.type === 'hero') continue;
      this.log.push({ tick: this.tick, cmd });
      this.dispatch(cmd);
    }
    // Script commands are not logged: a replay runs the same script and produces them again.
    if (this.script) for (const cmd of this.script.run(this)) this.dispatch(cmd);
    if (this.dispatchBudget < 3) this.budget = Math.max(0, this.budget - (3 - this.dispatchBudget));
    this.ox.set(this.x);
    this.oy.set(this.y);
    this.ensureUnitMasses();
    if (this.combat) think(this);
    this.ensureGrid();
    prepareSteeringDirections(this, this.steerCtx);
    for (let i = 0; i < this.count; i++) {
      if (this.moving[i]) {
        steerUnit(this, i, this.steerCtx);
        if (this.x[i] !== this.ox[i] || this.y[i] !== this.oy[i]) this.gridDirty = true;
      }
    }
    separateUnits(this, this.steerCtx);
    for (let i = 0; i < this.count; i++) if (this.moving[i]) this.progress(i);
    if (this.tick === 1 || this.tick % 5 === 0) this.updateFog();
    if (this.towns.length) checkQuests(this);
    if (this.shrines.length) this.stepShrines();
    if (this.combat && this.tick % 25 === 0) this.stepBossAuras();
    if (this.combat && this.directors && !this.directors.townOnly) this.stepDirectors();
  }

  private stepDirectors(): void {
    const dir = this.directors;
    if (!dir) return;
    const hId = this.hero?.id ?? 0;
    const hx = hId >= 0 && hId < this.count ? this.x[hId] : 0;
    const hy = hId >= 0 && hId < this.count ? this.y[hId] : 0;
    dir.events.step(hx, hy, this.daylight < 100);

    const eliteEvents: EliteTickEvent[] = [];
    dir.elites.step(hx, hy, eliteEvents);
    for (const ev of eliteEvents) {
      if (ev.kind === 'fire_aura') {
        this.cb.emit(6, ev.x, ev.y, 3, Elem.Fire);
        if (hId >= 0 && this.cb.hp[hId] > 0) strike(this, hId, 2, Math.max(2, ev.amount), Elem.Fire, 12, ev.actorId);
      } else if (ev.kind === 'teleport') {
        this.cb.emit(9, ev.x, ev.y, 0, Elem.Astral);
      } else if (ev.kind === 'shield_regen') {
        this.cb.emit(8, ev.x, ev.y, 1, 0);
      }
    }

    const bossIds = dir.bossUnitIds ?? [];
    for (let k = 0; k < dir.bosses.length; k++) {
      const uid = bossIds[k] ?? -1;
      const ctrl = dir.bosses[k];
      if (uid < 0 || uid >= this.count || this.hidden[uid]) continue;
      const curHp = Math.max(0, this.cb.hp[uid]);
      const prevHp = this.bossPrevHp[k] ?? curHp;
      if (curHp < prevHp) ctrl.damageBoss(prevHp - curHp);
      this.bossPrevHp[k] = curHp;
      if (curHp <= 0) continue;
      // Engage boss phase machine once hero is within 14 tiles or boss has taken damage
      const dx = this.x[uid] - hx;
      const dy = this.y[uid] - hy;
      if (dx * dx + dy * dy > (14 * FP) ** 2 && curHp === this.cb.hpMax[uid]) continue;
      const bossEvents: BossTickEvent[] = [];
      ctrl.step(hx, hy, bossEvents);
      for (const bev of bossEvents) {
        if (bev.kind === 'telegraph_spawn') {
          this.cb.emit(5, bev.x ?? hx, bev.y ?? hy, 20, Elem.Fire);
        } else if (bev.kind === 'hazard_detonate' && hId >= 0 && this.cb.hp[hId] > 0) {
          const tx = bev.x ?? hx;
          const ty = bev.y ?? hy;
          const dist2 = (this.x[hId] - tx) ** 2 + (this.y[hId] - ty) ** 2;
          if (dist2 <= (2.5 * FP) ** 2) {
            const d = Math.max(4, Math.floor(bev.value * 0.4));
            strike(this, hId, d, Math.max(d, Math.floor(bev.value * 0.65)), Elem.Fire, 14, uid);
          }
          this.cb.emit(5, tx, ty, 25, Elem.Fire);
        } else if (bev.kind === 'phase_change' || bev.kind === 'enrage') {
          this.cb.emit(6, this.x[uid], this.y[uid], bev.value, Elem.Astral);
        }
      }
    }
  }

  private stepBossAuras(): void {
    stepAuraSystem(this);
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
    else if (cmd.type === 'repopulate') {
      this.applyRepopulate(cmd);
      this.gridDirty = true;
    } else if (cmd.type === 'smash_prop') this.applySmashProp(cmd);
    else if (cmd.type === 'interact_object') this.applyInteractObject(cmd);
    else if (cmd.type === 'face') this.applyFace(cmd);
    else if (cmd.type === 'hero') {
      heroCommand(this, cmd);
      this.gridDirty = true;
    } else if (cmd.type === 'town') {
      townCommand(this, cmd);
      this.gridDirty = true;
    } else if (cmd.type === 'reward') this.applyReward(cmd);
    else this.applyOrder(cmd);
  }

  private dropPropBagAt(tx: number, ty: number, finalItemId: number): void {
    const cb = this.cb;
    for (let b = 0; b < cb.bI.length; b++) {
      if (cb.bI[b]) continue;
      cb.bX[b] = Math.round((tx + 0.5) * FP);
      cb.bY[b] = Math.round((ty + 0.5) * FP);
      cb.bI[b] = finalItemId + 1;
      break;
    }
  }

  private applySmashProp(cmd: Extract<Command, { type: 'smash_prop' }>): void {
    const obj = this.map.objects.find(
      (o) => !o.destroyed && o.x === cmd.x && o.y === cmd.y && (o.kind === PropKind.Barrel || o.kind === PropKind.Urn || o.kind === PropKind.Sarcophagus),
    );
    if (!obj) return;
    obj.destroyed = true;
    if (obj.x >= 0 && obj.x < this.map.w && obj.y >= 0 && obj.y < this.map.h) {
      this.map.blocked[obj.y * this.map.w + obj.x] = 0;
      this.refreshRegions();
    }
    const px = (obj.x + 0.5) * FP;
    const py = (obj.y + 0.5) * FP;
    if (obj.kind === PropKind.Barrel) {
      this.cb.emit(1, px, py, 0, 0);
      const roll = this.rng.int(100);
      if (roll < 55) {
        const g = 10 + this.rng.int(20);
        this.cb.gold[0] = (this.cb.gold[0] ?? 0) + g;
        this.cb.emit(16, px, py, PropKind.Barrel, g);
      } else if (roll < 85) {
        const potId = this.rng.int(2) === 0 ? itemId('Healing Draught') : itemId('Mana Draught');
        const finalId = potId >= 0 ? potId : 1;
        this.dropPropBagAt(obj.x, obj.y, finalId);
        this.cb.emit(16, px, py, PropKind.Barrel, -(finalId + 1));
      } else {
        const dropId = itemId('Iron Dagger');
        const finalId = dropId >= 0 ? dropId : 1;
        this.dropPropBagAt(obj.x, obj.y, finalId);
        this.cb.emit(16, px, py, PropKind.Barrel, -(finalId + 1));
      }
    } else if (obj.kind === PropKind.Urn) {
      this.cb.emit(1, px, py, 0, 0);
      const roll = this.rng.int(100);
      if (roll < 70) {
        const g = 15 + this.rng.int(35);
        this.cb.gold[0] = (this.cb.gold[0] ?? 0) + g;
        this.cb.emit(16, px, py, PropKind.Urn, g);
      } else {
        const potId = itemId('Healing Draught');
        const finalId = potId >= 0 ? potId : 1;
        this.dropPropBagAt(obj.x, obj.y, finalId);
        this.cb.emit(16, px, py, PropKind.Urn, -(finalId + 1));
      }
    } else if (obj.kind === PropKind.Sarcophagus) {
      this.cb.emit(6, px, py, 0, 0);
      const g = 50 + this.rng.int(60);
      this.cb.gold[0] = (this.cb.gold[0] ?? 0) + g;
      const relicId = itemId('Tempered Plate');
      const finalId = relicId >= 0 ? relicId : 1;
      this.dropPropBagAt(obj.x, obj.y, finalId);
      this.cb.emit(16, px, py, PropKind.Sarcophagus, g);
    }
  }

  private applyInteractObject(cmd: Extract<Command, { type: 'interact_object' }>): void {
    const list = this.script?.def.adventureObjects;
    if (!list) return;
    const obj = list.find((o) => !o.visited && o.x === cmd.x && o.y === cmd.y);
    if (!obj) return;
    const res = interactAdventureObject(this, obj);
    if (res.triggered) {
      this.cb.emit(17, (obj.x + 0.5) * FP, (obj.y + 0.5) * FP, ADVENTURE_OBJECT_KINDS.indexOf(obj.kind), res.goldReward ?? 0);
    }
  }

  private applyFace(cmd: Extract<Command, { type: 'face' }>): void {
    const id = cmd.id;
    if (id < 0 || id >= this.count || this.cb.hp[id] <= 0) return;
    if (cmd.stop) this.stop(id);
    if (cmd.dir !== undefined) this.dir[id] = cmd.dir & 15;
    if (cmd.swing && this.cb.cd[id] === 0) {
      this.cb.cd[id] = DEFS[this.cb.kind[id]].cd;
      this.cb.emit(12, this.x[id], this.y[id], 0, 0);
    }
  }

  private applyReward(cmd: Extract<Command, { type: 'reward' }>): void {
    if (cmd.gold > 0) this.cb.gold[0] += Math.floor(cmd.gold);
    if (cmd.xp > 0) addHeroXp(this, Math.floor(cmd.xp));
    for (const id of cmd.items ?? []) this.grantUnique(id);
  }

  /** A quest unique goes to the pack even when too heavy; with a full pack it lies at the hero's feet. */
  private grantUnique(uniqueId: string): void {
    const h = this.hero;
    const u = jsonUnique(uniqueId);
    if (!h || !u) return;
    const inst = this.createItemInstance(Math.max(0, itemId(u.base)), 'unique', u.def);
    let did: number = Did.Pick;
    if (addItem(h, inst.id) !== 0) {
      if (h.inv.length >= INV_MAX && dropBag(this, inst.id)) did = Did.Drop;
      else h.inv.push({ item: inst.id, n: 1 });
    }
    this.cb.emit(14, this.x[h.id], this.y[h.id], inst.id, did);
  }

  private applyRepopulate(cmd: Extract<Command, { type: 'repopulate' }>): void {
    const { id, x, y, cost } = cmd;
    if (id < 0 || id >= this.count) return;
    if (this.cb.hp[id] > 0) return;
    const team = this.team[id] & 3;
    if (cost && cost > 0) {
      if (this.cb.gold[team] < cost) return;
      this.cb.gold[team] -= cost;
    }
    const cb = this.cb;
    cb.hp[id] = cb.hpMax[id];
    cb.mana[id] = cb.manaMax[id];
    cb.corp[id] = 0;
    cb.ord[id] = 0;
    cb.tgt[id] = -1;
    cb.aux[id] = 0;
    cb.cd[id] = 0;
    this.x[id] = this.tx[id] = cb.px[id] = Math.round((x + 0.5) * FP);
    this.y[id] = this.ty[id] = cb.py[id] = Math.round((y + 0.5) * FP);
    this.stop(id);
    this.hidden[id] = 0;
    cb.recount(this.team);
    cb.emit(10, this.x[id], this.y[id], 1, 5);
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
        if (sid === 24 && !hasPoint && isCorpse(this, t)) {
          for (const id of ids) {
            if (!knows(this, id, 24) && !knows(this, id, 21)) continue;
            if (cb.mana[id] < 30) continue;
            cb.mana[id] -= 30;
            cb.cd[id] = 75;
            revive(this, t);
            break;
          }
          return;
        }
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
          cb.aux[id] = this.tick;
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
    const scratch = this.formScratch;
    const slotX = scratch.slotX;
    const slotY = scratch.slotY;
    let order: Int32Array | number[];
    if (loose) {
      for (let k = 0; k < n; k++) {
        slotX[k] = goalX;
        slotY[k] = goalY;
      }
      order = ids;
    } else {
      applyGroupFormation(
        this,
        ids,
        leadReg,
        goalX,
        goalY,
        goalCx,
        goalCy,
        scratch,
        (x, y, ok, used, stamp) => this.nearestTile(x, y, ok, used, stamp),
      );
      order = scratch.order;
    }
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

  private ensureUnitMasses(): void {
    const cls = this.hero?.cls ?? -1;
    if (this.massesHeroCls === cls) return;
    computeUnitMasses(this, this.unitMasses);
    this.massesHeroCls = cls;
  }

  /** New individual path from the unit's tile to its slot tile. Time-sliced by a per-tick budget. */
  private repath(i: number): boolean {
    if (this.budget <= 0 || this.repaths[i] >= 4) return false;
    const stx = Math.floor(this.x[i] / FP);
    const sty = Math.floor(this.y[i] / FP);
    const gtx = Math.floor(this.tx[i] / FP);
    const gty = Math.floor(this.ty[i] / FP);
    const { w, h } = this.map;
    if (stx < 0 || sty < 0 || stx >= w || sty >= h || gtx < 0 || gty < 0 || gtx >= w || gty >= h) {
      this.finish(i);
      return false;
    }
    const sr = this.region[sty * w + stx];
    const gr = this.region[gty * w + gtx];
    if (sr < 0 || sr !== gr) {
      this.finish(i);
      return false;
    }
    this.budget--;
    this.repaths[i]++;
    const pts = this.pather.find(stx, sty, gtx, gty);
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

  /**
   * Bucket the living units by tile (flat Int32Array sparse counting sort). Cost is O(units), not O(map tiles).
   * Within a cell units stay in ascending id order for determinism.
   */
  private buildGrid(): void {
    this.spatialHash.rebuild(this.count, this.x, this.y, this.cb.hp, this.hidden);
    this.gridDirty = false;
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
    } else if (s >= STUCK_GIVE_UP) {
      // Never give up while occupying a narrow bottleneck or chokepoint
      // Capped grace (repaths 4..8, no new state) so a truly blocked chokepoint still finishes.
      if (this.repaths[i] < 8 && isChokepoint(this.map, this.x[i] >> 8, this.y[i] >> 8)) {
        this.stuck[i] = 0;
        this.repaths[i] = Math.max(4, this.repaths[i] + 1);
      } else {
        this.finish(i);
      }
    }
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
    mix(this.lootRng.state);
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
    hashSuperUniques(this, mix);
    mix(this.nextPath);
    if (this.paths.size > 0) {
      const pids = [...this.paths.keys()].sort((a, b) => a - b);
      for (const pid of pids) {
        const rec = this.paths.get(pid)!;
        mix(pid);
        mix(rec.refs);
        mix(rec.pts.length);
        for (let k = 0; k < rec.pts.length; k++) mix(rec.pts[k]);
      }
    }
    mix(this.nextInstanceId);
    if (this.instances.size > 0) {
      const iids = [...this.instances.keys()].sort((a, b) => a - b);
      for (const iid of iids) {
        const inst = this.instances.get(iid)!;
        mix(inst.id);
        mix(inst.serial ?? 0);
        mix(inst.baseId);
        mix(inst.def.unidentified ? 1 : 0);
      }
    }
    for (let i = 0; i < this.count; i++) if (this.hidden[i]) mix(i + 1);
    for (let i = 0; i < 16; i++) if (this.peace[i]) mix(100 + i);
    this.script?.hashInto(mix, this);
    if (!this.script && this.map.objects.length > 0) {
      let word = 0;
      for (let i = 0; i < this.map.objects.length; i++) {
        if (this.map.objects[i].destroyed) word |= 1 << (i & 31);
        if ((i & 31) === 31 || i === this.map.objects.length - 1) {
          mix(word);
          word = 0;
        }
      }
    }
    for (let i = 0; i < this.count; i++) mix(this.team[i]);
    hashTown(this.town, mix);
    if (this.shrines.length) for (let s = 0; s < this.shrineCd.length; s++) mix(this.shrineCd[s]);
    if (this.directors) {
      mix(this.directors.townOnly ? 1 : 0);
      this.directors.elites.hashInto(mix);
      this.directors.events.hashInto(mix);
      for (const b of this.directors.bosses) b.hashInto(mix);
      this.directors.skirmishMode?.hashInto(mix);
    }
    if (this.ngPlusTier > 0) mix(0x4e470000 + this.ngPlusTier);
    return h >>> 0;
  }

  snapshot(): Snapshot {
    const destroyedProps: number[] = [];
    for (let i = 0; i < this.map.objects.length; i++) if (this.map.objects[i].destroyed) destroyedProps.push(i);
    const visitedAdv: number[] = [];
    const adv = this.script?.def.adventureObjects;
    if (adv) for (let i = 0; i < adv.length; i++) if (adv[i].visited) visitedAdv.push(i);
    return {
      tick: this.tick,
      rng: this.rng.state,
      lootRng: this.lootRng.state,
      cosmeticRng: this.cosmeticRng.state,
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
      ...(destroyedProps.length ? { destroyedProps } : {}),
      ...(visitedAdv.length ? { visitedAdv } : {}),
      ...(this.ngPlusTier > 0 ? { ngPlusTier: this.ngPlusTier } : {}),
      ...(this.shrines.length ? { shrineCd: this.shrineCd.slice() } : {}),
      ...(this.directors
        ? {
            directors: {
              elites: this.directors.elites.snapshot(),
              events: this.directors.events.snapshot(),
              bosses: this.directors.bosses.map((b) => b.snapshot()),
              skirmishMode: this.directors.skirmishMode ? this.directors.skirmishMode.snapshot() : null,
              townOnly: this.directors.townOnly,
            },
          }
        : {}),
    };
  }

  restore(s: Snapshot): void {
    this.tick = s.tick;
    this.ngPlusTier = Math.max(0, Math.floor(s.ngPlusTier ?? 0));
    this.rng.state = s.rng;
    this.lootRng.state = (s.lootRng ?? (s.rng ^ LOOT_RNG_SALT)) >>> 0 || 1;
    this.cosmeticRng.state = (s.cosmeticRng ?? (s.rng ^ COSMETIC_RNG_SALT)) >>> 0 || 1;
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
    if (s.destroyedProps) {
      const dset = new Set(s.destroyedProps);
      let blockedChanged = false;
      for (let i = 0; i < this.map.objects.length; i++) {
        const obj = this.map.objects[i];
        if (dset.has(i) && !obj.destroyed) {
          obj.destroyed = true;
          if (obj.x >= 0 && obj.x < this.map.w && obj.y >= 0 && obj.y < this.map.h) {
            this.map.blocked[obj.y * this.map.w + obj.x] = 0;
            blockedChanged = true;
          }
        }
      }
      if (blockedChanged) this.refreshRegions();
    }
    if (s.visitedAdv && this.script?.def.adventureObjects) {
      const vset = new Set(s.visitedAdv);
      const adv = this.script.def.adventureObjects;
      for (let i = 0; i < adv.length; i++) if (vset.has(i)) adv[i].visited = true;
    }
    if (s.team) this.team.set(s.team);
    this.town = s.town ? cloneTown(s.town) : newTownState(this.towns.length);
    if (s.shrineCd && this.shrines.length) this.shrineCd = s.shrineCd.slice();
    else this.shrineCd = new Uint16Array(this.shrines.length);
    this.instances.clear();
    this.usedSerials.clear();
    if (s.instances) {
      for (const inst of s.instances) {
        this.instances.set(inst.id, inst);
        if (inst.serial !== undefined) this.usedSerials.add(inst.serial);
        registerDynamicItem(inst.id, inst.def);
      }
    }
    if (s.nextInstanceId) this.nextInstanceId = s.nextInstanceId;
    if (this.directors && s.directors) {
      this.directors.townOnly = s.directors.townOnly;
      this.directors.elites.restore(s.directors.elites);
      this.directors.events.restore(s.directors.events);
      for (let i = 0; i < this.directors.bosses.length && i < s.directors.bosses.length; i++) {
        this.directors.bosses[i].restore(s.directors.bosses[i]);
      }
      if (this.directors.skirmishMode && s.directors.skirmishMode) {
        this.directors.skirmishMode.restore(s.directors.skirmishMode);
      }
      this.bossPrevHp = (this.directors.bossUnitIds ?? []).map((u) => (u >= 0 && u < this.count ? this.cb.hp[u] : 0));
    }
    this.cb.recount(this.team);
    this.massesHeroCls = -2;
    this.gridDirty = true;
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
