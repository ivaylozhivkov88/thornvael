import { isBlockedAt, type GameMap } from '../map';
import { DEFS, Kind, Ord } from './combat';
import { monsterFamilyById } from './data';
import { Cls, Slot, getItemDef, kitCls } from './items';
import { heroSpeedPct } from './mechanics';
import { FP, dir16, isChokepoint, lineClear, speedPct } from './path';
import type { Sim } from './sim';
import { statusSpeed } from './spells';

export const UNIT_BODY_RADIUS = 77; // 0.30 tile
export const MIN_SEPARATION_DIST = UNIT_BODY_RADIUS * 2; // 154 FP (~0.60 tile)
export const MAX_SEPARATION_PUSH = 20;
export const MAX_COMBINED_SEPARATION = 28;
export const WALL_CLEARANCE_PAD = 64; // 0.25 tile: aligns with path lineClear side-ray clearance
export const STEER_LOOKAHEAD = Math.round(MIN_SEPARATION_DIST * 1.5); // 231 FP (~0.90 tile)
export const STEER_CLEAR_RADIUS = Math.round(MIN_SEPARATION_DIST * 0.96); // 148 FP
export const IDLE_SEPARATION_DEADBAND = 3;

const COINC_DX = Int8Array.of(1, 1, 0, -1, -1, -1, 0, 1);
const COINC_DY = Int8Array.of(0, 1, 1, 1, 0, -1, -1, -1);

export interface PathRecordView {
  pts: Int32Array;
  refs: number;
}

export interface SteeringContext {
  masses: Uint16Array;
  ax: Int32Array;
  ay: Int32Array;
  dirX: Int32Array;
  dirY: Int32Array;
  unitSpeed: number;
  buildGrid: () => void;
  getPath: (pid: number) => PathRecordView | undefined;
  repath: (i: number) => boolean;
  finish: (i: number) => void;
  hasBudget: () => boolean;
}

function kindBaseMass(kind: number): number {
  switch (kind) {
    case Kind.Golem:
      return 300;
    case Kind.Hero:
      return 240;
    case Kind.Warrior:
      return 165;
    case Kind.Gnoll:
      return 110;
    case Kind.Archer:
      return 75;
    case Kind.Mage:
    case Kind.Imp:
      return 60;
    default:
      return 100;
  }
}

/**
 * Deterministic push-resistance weight for unit `id`.
 * Larger/boss units and heavy warriors resist separation push; smaller/ranged units yield smoothly.
 */
export function unitPushMass(sim: Sim, id: number): number {
  if (sim.hero !== null && id === sim.hero.id) {
    return kitCls(sim.hero.cls) === Cls.Mage ? 150 : 240;
  }

  const cb = sim.cb;
  const kind = cb.kind[id];
  const tier = cb.tier[id] || 1;
  const bmods = cb.bossMods[id];
  const famId = cb.family[id];

  let mass = kindBaseMass(kind);
  if (famId) {
    const fam = monsterFamilyById(famId);
    if (fam) {
      if (famId === 'morvessa' || famId === 'gorrathul' || famId === 'vesperion' || famId === 'ashkarath') {
        mass = 420;
      } else if (fam.archetype === Kind.Golem || fam.baseHp >= 140) {
        mass = fam.caster ? 260 : 300;
      } else if (fam.caster) {
        mass = 60;
      } else if (fam.ranged) {
        mass = 75;
      } else if (fam.archetype === Kind.Warrior || fam.baseHp >= 80) {
        mass = 165;
      } else {
        mass = 110;
      }
    }
  }

  if (tier >= 4) mass = Math.max(mass, 340);
  else if (tier === 3) mass = Math.round(mass * 1.45);
  else if (tier === 2) mass = Math.round(mass * 1.15);

  if (bmods && bmods.length > 0) {
    mass = Math.max(mass + bmods.length * 65, 320);
  }
  return mass;
}

/** Populate a typed array with push weights for every unit in `sim`. */
export function computeUnitMasses(sim: Sim, out?: Uint16Array): Uint16Array {
  const arr = out && out.length >= sim.count ? out : new Uint16Array(sim.count);
  for (let i = 0; i < sim.count; i++) {
    arr[i] = unitPushMass(sim, i);
  }
  return arr;
}

export interface PairSeparationImpulse {
  ix: number;
  iy: number;
  jx: number;
  jy: number;
}

const PAIR_SCRATCH = new Int32Array(4);

function computePairSeparationInto(
  out: Int32Array,
  dx: number,
  dy: number,
  massI: number,
  massJ: number,
  movingI: boolean,
  movingJ: boolean,
  holdI: boolean,
  holdJ: boolean,
  sameDir: boolean,
  inChokepoint: boolean,
  pairSeed: number,
): boolean {
  const d2 = dx * dx + dy * dy;
  if (d2 >= MIN_SEPARATION_DIST * MIN_SEPARATION_DIST) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return false;
  }

  let rx = dx;
  let ry = dy;
  let d = Math.sqrt(d2);
  if (d < 1) {
    const k = pairSeed & 7;
    rx = COINC_DX[k];
    ry = COINC_DY[k];
    d = k & 1 ? Math.SQRT2 : 1;
  }

  const overlap = MIN_SEPARATION_DIST - d;
  if (!movingI && !movingJ && overlap <= IDLE_SEPARATION_DEADBAND) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return false;
  }

  // Smoothly damped overlap resolution prevents jitter/overshoot at resting separation,
  // while deep overlaps (< 1 body radius) push harder than outer grazing neighbors so corners don't crush pairs.
  const pushCap = d < UNIT_BODY_RADIUS ? MAX_COMBINED_SEPARATION : MAX_SEPARATION_PUSH;
  const push = Math.min(pushCap, Math.max(1, Math.round(overlap * 0.42)));
  const nx = rx / d;
  const ny = ry / d;

  const effMassI = holdI ? Math.round(massI * 1.5) : Math.max(1, massI);
  const effMassJ = holdJ ? Math.round(massJ * 1.5) : Math.max(1, massJ);
  const moveMulI = movingI === movingJ ? 1 : movingI ? 0.6 : 1.4;
  const moveMulJ = movingI === movingJ ? 1 : movingJ ? 0.6 : 1.4;
  const invI = moveMulI / effMassI;
  const invJ = moveMulJ / effMassJ;
  const invSum = invI + invJ;
  const wi = (2 * invI) / invSum;
  const wj = (2 * invJ) / invSum;

  // Right-hand swerve (clockwise in screen coords) for opposing/crossing walkers outside 1-tile chokepoints.
  const tan = movingI && movingJ && !sameDir && !inChokepoint ? 0.34 : 0;
  const fx = nx + tan * ny;
  const fy = ny - tan * nx;

  out[0] = Math.round(fx * push * wi);
  out[1] = Math.round(fy * push * wi);
  out[2] = -Math.round(fx * push * wj);
  out[3] = -Math.round(fy * push * wj);
  return true;
}

/**
 * Compute deterministic damped separation impulses between overlapping units `i` and `j`.
 * Ensures heavy/boss units hold their ground while lighter/ranged/idle units yield cleanly.
 */
export function computePairSeparation(
  dx: number,
  dy: number,
  massI: number,
  massJ: number,
  movingI: boolean,
  movingJ: boolean,
  holdI: boolean,
  holdJ: boolean,
  sameDir: boolean,
  inChokepoint: boolean,
  pairSeed: number,
): PairSeparationImpulse {
  computePairSeparationInto(
    PAIR_SCRATCH,
    dx,
    dy,
    massI,
    massJ,
    movingI,
    movingJ,
    holdI,
    holdJ,
    sameDir,
    inChokepoint,
    pairSeed,
  );
  return {
    ix: PAIR_SCRATCH[0],
    iy: PAIR_SCRATCH[1],
    jx: PAIR_SCRATCH[2],
    jy: PAIR_SCRATCH[3],
  };
}

/**
 * Snapshot intended travel unit vectors (scaled by 1024) for all active movers prior to steering/separation.
 */
export function prepareSteeringDirections(sim: Sim, ctx: SteeringContext): void {
  const { count, moving, x, y, tx, ty, pathId, wp } = sim;
  const { dirX, dirY, getPath } = ctx;
  for (let i = 0; i < count; i++) {
    if (!moving[i] || sim.cb.hp[i] <= 0 || sim.hidden[i]) {
      dirX[i] = 0;
      dirY[i] = 0;
      continue;
    }
    let gx = tx[i];
    let gy = ty[i];
    const pid = pathId[i];
    if (pid >= 0) {
      const rec = getPath(pid);
      if (rec) {
        const k = wp[i];
        const pts = rec.pts;
        if (k * 2 + 1 < pts.length) {
          gx = pts[2 * k];
          gy = pts[2 * k + 1];
        }
      }
    }
    const dx = gx - x[i];
    const dy = gy - y[i];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) {
      dirX[i] = 0;
      dirY[i] = 0;
    } else {
      dirX[i] = Math.round((dx * 1024) / d);
      dirY[i] = Math.round((dy * 1024) / d);
    }
  }
}

/**
 * Local steering for unit `i`: advances waypoints, applies deterministic weight-aware neighbor avoidance,
 * handles 1-tile chokepoint trailing without wall-slamming, and slides smoothly along walls.
 */
export function steerUnit(sim: Sim, i: number, ctx: SteeringContext): void {
  const map = sim.map;
  const x = sim.x[i];
  const y = sim.y[i];

  if (sim.cb.ord[i] === Ord.Retreat && sim.tick - sim.cb.aux[i] >= 45) {
    sim.cb.ord[i] = Ord.Guard;
    sim.moving[i] = 0;
    return;
  }

  const pct = Math.max(25, speedPct(map, Math.floor(x / FP), Math.floor(y / FP)));
  const st = sim.cb.stMask[i] === 0 ? 100 : statusSpeed(sim.cb.stMask[i]);
  const extraFastMult = sim.cb.bossMods[i]?.includes('extra_fast') ? 130 : 100;
  const baseSpd = Math.floor((ctx.unitSpeed * pct * DEFS[sim.cb.kind[i]].speed * st * extraFastMult) / 100000000);
  let spd = sim.cb.ord[i] === Ord.Retreat ? Math.floor((baseSpd * 75) / 100) : baseSpd;
  if (sim.hero !== null && i === sim.hero.id && sim.hero.running) {
    const armour = getItemDef(sim.hero.eq[Slot.Armor]);
    spd = Math.floor((spd * heroSpeedPct(true, armour?.tier ?? 0)) / 100);
  }

  let tgx = sim.tx[i];
  let tgy = sim.ty[i];
  const pid = sim.pathId[i];
  let rec = pid >= 0 ? ctx.getPath(pid) : undefined;
  if (rec) {
    let k = sim.wp[i];
    let pts = rec.pts;
    const n = pts.length / 2;
    for (let guard = 0; guard < 3 && k < n; guard++) {
      const wx = pts[2 * k];
      const wy = pts[2 * k + 1];
      if (k + 1 < n) {
        if (lineClear(map, x, y, pts[2 * k + 2], pts[2 * k + 3])) k++;
        else break;
      } else if ((wx - x) ** 2 + (wy - y) ** 2 <= 102 * 102 && lineClear(map, x, y, sim.tx[i], sim.ty[i])) {
        k++;
      } else {
        break;
      }
    }
    sim.wp[i] = k;
    if (k < n) {
      tgx = pts[2 * k];
      tgy = pts[2 * k + 1];
      if (!lineClear(map, x, y, tgx, tgy)) {
        const sameStartTile = k === 0 || ((x >> 8) === pts[0] >> 8 && (y >> 8) === pts[1] >> 8);
        if (!sameStartTile && ctx.hasBudget() && sim.repaths[i] < 4 && ctx.repath(i)) {
          rec = ctx.getPath(sim.pathId[i]);
          if (rec) {
            pts = rec.pts;
            tgx = pts[0];
            tgy = pts[1];
          }
        }
      }
    }
  }

  const dx = tgx - x;
  const dy = tgy - y;
  const d2 = dx * dx + dy * dy;
  const atSlot = tgx === sim.tx[i] && tgy === sim.ty[i];
  if (d2 <= spd * spd) {
    if (atSlot) {
      if (!isBlockedAt(map, Math.floor(tgx / FP), Math.floor(tgy / FP))) {
        if (d2 > 0) sim.dir[i] = dir16(dx, dy);
        sim.x[i] = tgx;
        sim.y[i] = tgy;
      }
      ctx.finish(i);
    } else {
      sim.x[i] = tgx;
      sim.y[i] = tgy;
    }
    return;
  }

  const d = Math.sqrt(d2);
  const ux = dx / d;
  const uy = dy / d;
  ctx.dirX[i] = Math.round(ux * 1024);
  ctx.dirY[i] = Math.round(uy * 1024);
  sim.dir[i] = dir16(dx, dy);

  let latSteer = 0;
  let speedScale = 1;

  if (d > spd * 1.5 && spd > 0) {
    const w = map.w;
    const h = map.h;
    const cx = Math.min(w - 1, Math.max(0, x >> 8));
    const cy = Math.min(h - 1, Math.max(0, y >> 8));
    const inChoke = isChokepoint(map, cx, cy);
    const cs = sim.cellStart;
    const ce = sim.cellEnd;
    const ci = sim.cellItems;
    const masses = ctx.masses;
    const massI = masses[i] || 100;
    const perpX = -uy;
    const perpY = ux;
    const look2 = STEER_LOOKAHEAD * STEER_LOOKAHEAD;

    const gy0 = Math.max(0, cy - 1);
    const gy1 = Math.min(h - 1, cy + 1);
    const gx0 = Math.max(0, cx - 1);
    const gx1 = Math.min(w - 1, cx + 1);
    const rc = sim.spatialHash.rowCount;

    for (let gy = gy0; gy <= gy1; gy++) {
      if (rc[gy] === 0) continue;
      const row = gy * w;
      for (let gx = gx0; gx <= gx1; gx++) {
        const cc = row + gx;
        for (let q = cs[cc]; q < ce[cc]; q++) {
          const j = ci[q];
          if (j === i) continue;
          const rx = sim.x[j] - x;
          const ry = sim.y[j] - y;
          const dist2 = rx * rx + ry * ry;
          if (dist2 > look2 || dist2 < 1) continue;

          const fwd = rx * ux + ry * uy;
          if (fwd <= 0) continue;

          const lat = -rx * uy + ry * ux;
          const absLat = Math.abs(lat);
          if (absLat >= STEER_CLEAR_RADIUS) continue;

          const mj = sim.moving[j] !== 0;
          const dotDir = mj ? (ctx.dirX[j] * ux + ctx.dirY[j] * uy) / 1024 : 0;

          // Inside a 1-tile chokepoint, queue cleanly behind peers moving the same way rather than hitting walls.
          if (inChoke && mj && dotDir > 0.45) {
            if (fwd < MIN_SEPARATION_DIST * 0.58) {
              speedScale = Math.min(speedScale, 0.85);
            }
            continue;
          }

          // Preserve cohesive formation rows & funnel smoothly without plowing into same-dir queues.
          if (mj && dotDir > 0.55) {
            if (fwd < MIN_SEPARATION_DIST * 0.65) {
              speedScale = Math.min(speedScale, 0.8);
            }
            continue;
          }

          const urg = (1 - fwd / STEER_LOOKAHEAD) * (1 - absLat / STEER_CLEAR_RADIUS);
          const massJ = masses[j] || 100;
          const wRatio = Math.min(1.75, Math.max(0.3, (2 * massJ) / (massI + massJ)));

          let side: number;
          if (absLat > 18) {
            side = lat > 0 ? -1 : 1;
          } else if (mj && dotDir < -0.25) {
            side = 1; // right-hand rule for head-on walkers
          } else {
            side = ((i + j) & 1) === 0 ? 1 : -1;
          }

          const probeX = x + Math.round(side * perpX * 160);
          const probeY = y + Math.round(side * perpY * 160);
          if (isBlockedAt(map, probeX >> 8, probeY >> 8)) {
            const altX = x - Math.round(side * perpX * 160);
            const altY = y - Math.round(side * perpY * 160);
            side = !isBlockedAt(map, altX >> 8, altY >> 8) ? -side : 0;
          }

          latSteer += side * urg * wRatio * 0.95;
        }
      }
    }
  }

  let sx: number;
  let sy: number;
  const effSpd = spd > 0 ? Math.max(1, Math.round(spd * speedScale)) : 0;
  if (latSteer !== 0) {
    if (latSteer > 0.85) latSteer = 0.85;
    else if (latSteer < -0.85) latSteer = -0.85;
    const vx = ux - uy * latSteer;
    const vy = uy + ux * latSteer;
    const vLen = Math.sqrt(vx * vx + vy * vy) || 1;
    sx = Math.round((vx * effSpd) / vLen);
    sy = Math.round((vy * effSpd) / vLen);
  } else {
    sx = Math.round(ux * effSpd);
    sy = Math.round(uy * effSpd);
  }

  const nx = x + sx;
  const ny = y + sy;
  if (!isBlockedAt(map, Math.floor(nx / FP), Math.floor(ny / FP))) {
    sim.x[i] = nx;
    sim.y[i] = ny;
    return;
  }

  // If steered vector clipped a wall, fall back to direct heading before axis-sliding.
  if (latSteer !== 0) {
    const uxStep = Math.round(ux * effSpd);
    const uyStep = Math.round(uy * effSpd);
    const dnx = x + uxStep;
    const dny = y + uyStep;
    if (!isBlockedAt(map, Math.floor(dnx / FP), Math.floor(dny / FP))) {
      sim.x[i] = dnx;
      sim.y[i] = dny;
      return;
    }
    if (!isBlockedAt(map, Math.floor(dnx / FP), Math.floor(y / FP))) {
      sim.x[i] = dnx;
      return;
    }
    if (!isBlockedAt(map, Math.floor(x / FP), Math.floor(dny / FP))) {
      sim.y[i] = dny;
      return;
    }
  }

  if (!isBlockedAt(map, Math.floor(nx / FP), Math.floor(y / FP))) sim.x[i] = nx;
  else if (!isBlockedAt(map, Math.floor(x / FP), Math.floor(ny / FP))) sim.y[i] = ny;
}

function applySafeSlideSeparation(
  map: GameMap,
  x: Int32Array,
  y: Int32Array,
  i: number,
  sx: number,
  sy: number,
): void {
  const x0 = x[i];
  const y0 = y[i];
  const maxX = map.w * FP - 1;
  const maxY = map.h * FP - 1;
  let nx = Math.min(maxX, Math.max(0, x0 + sx));
  let ny = Math.min(maxY, Math.max(0, y0 + sy));

  const ntx = nx >> 8;
  const nty = ny >> 8;

  // Keep separation forces from pushing units into the 64-FP wall-scrape margin.
  if (sx < 0 && isBlockedAt(map, ntx - 1, nty)) {
    const limit = (ntx << 8) + WALL_CLEARANCE_PAD;
    if (nx < limit) nx = x0 >= limit ? limit : Math.max(x0, nx);
  } else if (sx > 0 && isBlockedAt(map, ntx + 1, nty)) {
    const limit = (ntx << 8) + (FP - 1 - WALL_CLEARANCE_PAD);
    if (nx > limit) nx = x0 <= limit ? limit : Math.min(x0, nx);
  }

  if (sy < 0 && isBlockedAt(map, ntx, nty - 1)) {
    const limit = (nty << 8) + WALL_CLEARANCE_PAD;
    if (ny < limit) ny = y0 >= limit ? limit : Math.max(y0, ny);
  } else if (sy > 0 && isBlockedAt(map, ntx, nty + 1)) {
    const limit = (nty << 8) + (FP - 1 - WALL_CLEARANCE_PAD);
    if (ny > limit) ny = y0 <= limit ? limit : Math.min(y0, ny);
  }

  const nxTile = Math.floor(nx / FP);
  const nyTile = Math.floor(ny / FP);
  if (!isBlockedAt(map, nxTile, nyTile)) {
    x[i] = nx;
    y[i] = ny;
    return;
  }
  const y0Tile = Math.floor(y0 / FP);
  if (!isBlockedAt(map, nxTile, y0Tile)) {
    x[i] = nx;
    return;
  }
  const x0Tile = Math.floor(x0 / FP);
  if (!isBlockedAt(map, x0Tile, nyTile)) {
    y[i] = ny;
  }
}

/**
 * Spatial-grid soft collision separation across all living non-hidden units.
 * Respects pushing weights, suppresses settled idle jitter, and prevents wall-pinning in chokepoints.
 */
export function separateUnits(sim: Sim, ctx: SteeringContext): void {
  const { map, count } = sim;
  const w = map.w;
  const h = map.h;
  const cs = sim.cellStart;
  const ce = sim.cellEnd;
  const ci = sim.cellItems;
  const rc = sim.spatialHash.rowCount;
  ctx.buildGrid();

  const ax = ctx.ax;
  const ay = ctx.ay;
  ax.fill(0);
  ay.fill(0);

  const hp = sim.cb.hp;
  const hid = sim.hidden;
  const ord = sim.cb.ord;
  const moving = sim.moving;
  const x = sim.x;
  const y = sim.y;
  const masses = ctx.masses;
  const dirX = ctx.dirX;
  const dirY = ctx.dirY;
  const minD2 = MIN_SEPARATION_DIST * MIN_SEPARATION_DIST;

  for (let i = 0; i < count; i++) {
    if (hp[i] <= 0 || hid[i]) continue;
    const xi = x[i];
    const yi = y[i];
    const cx = Math.min(w - 1, Math.max(0, xi >> 8));
    const cy = Math.min(h - 1, Math.max(0, yi >> 8));
    const gy0 = Math.max(0, cy - 1);
    const gy1 = Math.min(h - 1, cy + 1);
    const gx0 = Math.max(0, cx - 1);
    const gx1 = Math.min(w - 1, cx + 1);
    const mi = moving[i] !== 0;
    const holdI = !mi && (ord[i] === Ord.Hold || ord[i] === Ord.Still);
    const massI = masses[i] || 100;
    let chokeCached = -1;

    for (let gy = gy0; gy <= gy1; gy++) {
      if (rc[gy] === 0) continue;
      const row = gy * w;
      for (let gx = gx0; gx <= gx1; gx++) {
        const cc = row + gx;
        const end = ce[cc];
        for (let q = cs[cc]; q < end; q++) {
          const j = ci[q];
          if (j <= i) continue;
          const dx = xi - x[j];
          const dy = yi - y[j];
          if (dx * dx + dy * dy >= minD2) continue;

          const mj = moving[j] !== 0;
          const holdJ = !mj && (ord[j] === Ord.Hold || ord[j] === Ord.Still);
          const sameDir = mi && mj ? dirX[i] * dirX[j] + dirY[i] * dirY[j] > 524288 : false;
          let chokePair = false;
          if (mi && mj && !sameDir) {
            if (chokeCached < 0) chokeCached = isChokepoint(map, cx, cy) ? 1 : 0;
            chokePair =
              chokeCached === 1 ||
              isChokepoint(map, Math.min(w - 1, Math.max(0, x[j] >> 8)), Math.min(h - 1, Math.max(0, y[j] >> 8)));
          }

          if (
            computePairSeparationInto(
              PAIR_SCRATCH,
              dx,
              dy,
              massI,
              masses[j] || 100,
              mi,
              mj,
              holdI,
              holdJ,
              sameDir,
              chokePair,
              i * 3 + j * 5,
            )
          ) {
            ax[i] += PAIR_SCRATCH[0];
            ay[i] += PAIR_SCRATCH[1];
            ax[j] += PAIR_SCRATCH[2];
            ay[j] += PAIR_SCRATCH[3];
          }
        }
      }
    }
  }

  for (let i = 0; i < count; i++) {
    let sx = ax[i];
    let sy = ay[i];
    if (sx === 0 && sy === 0) continue;
    const mag2 = sx * sx + sy * sy;
    if (mag2 > MAX_COMBINED_SEPARATION * MAX_COMBINED_SEPARATION) {
      const mag = Math.sqrt(mag2);
      sx = Math.round((sx * MAX_COMBINED_SEPARATION) / mag);
      sy = Math.round((sy * MAX_COMBINED_SEPARATION) / mag);
    }
    applySafeSlideSeparation(map, x, y, i, sx, sy);
  }
}
