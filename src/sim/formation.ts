import { isBlockedAt } from '../map';
import { DEFS, Kind } from './combat';
import { monsterFamilyById } from './data';
import { Cls, kitCls } from './items';
import { FP, lineClear, regionsOf } from './path';
import type { Sim } from './sim';

/** Tactical formation rank tiers: melee frontline, ranged second line, casters/healers rear guard. */
export const FormationRole = {
  Vanguard: 0,
  Ranged: 1,
  Rearguard: 2,
} as const;
export type FormationRole = (typeof FormationRole)[keyof typeof FormationRole];

export interface FormationSlot {
  unitId: number;
  x: number;
  y: number;
  role: FormationRole;
  row: number;
  col: number;
}

export interface FormationScratch {
  slotX: Int32Array;
  slotY: Int32Array;
  bad: Int32Array;
  pf: Int32Array;
  pr: Int32Array;
  order: Int32Array;
  rawU: Int32Array;
  rawV: Int32Array;
  roles: Uint8Array;
  rowMeta: Int32Array;
  colMeta: Int32Array;
  used: Uint32Array;
  stamp: number;
}

export type NearestTileFn = (
  x: number,
  y: number,
  ok: (idx: number) => boolean,
  used: Uint32Array | null,
  stamp?: number,
) => number;

const COL_STEP = FP; // 1.0 tile lateral spacing between adjacent columns
const ROW_STEP = FP; // 1.0 tile depth spacing between rows in the same tier
const TIER_GAP = Math.round(1.25 * FP); // 1.25 tiles spacing between tactical role lines
const VANGUARD_ARC_PULL = Math.round(0.35 * FP); // 0.35 tile outer-flank crescent pullback on 3+ wide frontlines

/**
 * Classify a unit into its tactical formation line:
 * - Vanguard (0): melee warriors, golems, tanks, warrior hero
 * - Ranged (1): archers and non-caster ranged skirmishers
 * - Rearguard (2): mages, healers, shamans, and mage hero
 */
export function unitFormationRole(sim: Sim, id: number): FormationRole {
  if (sim.hero !== null && id === sim.hero.id) {
    return kitCls(sim.hero.cls) === Cls.Mage ? FormationRole.Rearguard : FormationRole.Vanguard;
  }

  const famId = sim.cb.family[id];
  if (famId) {
    const fam = monsterFamilyById(famId);
    if (fam) {
      if (fam.caster) return FormationRole.Rearguard;
      if (fam.ranged) return FormationRole.Ranged;
      return FormationRole.Vanguard;
    }
  }

  const kind = sim.cb.kind[id];
  if (kind === Kind.Mage || kind === Kind.Imp) return FormationRole.Rearguard;
  if (kind === Kind.Archer) return FormationRole.Ranged;

  const def = DEFS[kind];
  if (def?.caster) return FormationRole.Rearguard;
  if (def?.ranged) return FormationRole.Ranged;
  return FormationRole.Vanguard;
}

/**
 * Unit orientation vector (scaled by 1024) pointing from `from` towards `to`.
 * Falls back to north `(0, -1024)` when origin and goal coincide within 0.25 tile.
 */
export function formationFacing(fromX: number, fromY: number, toX: number, toY: number): { fx: number; fy: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 64) return { fx: 0, fy: -1024 };
  return { fx: Math.round((dx * 1024) / len), fy: Math.round((dy * 1024) / len) };
}

/**
 * Compute and assign deterministic tactical formation slots in-place using pre-allocated buffers.
 * Vanguard takes the frontline arc/line, ranged takes the second line, mages/healers take the rear guard.
 */
export function applyGroupFormation(
  sim: Sim,
  ids: readonly number[],
  reg: number,
  goalX: number,
  goalY: number,
  goalCx: number,
  goalCy: number,
  scratch: FormationScratch,
  nearestTileFn: NearestTileFn,
): number {
  const n = ids.length;
  if (n === 0) return scratch.stamp;

  const { map } = sim;
  const region = regionsOf(map);
  const w = map.w;

  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    const id = ids[i];
    sx += sim.x[id];
    sy += sim.y[id];
  }
  const cx = Math.floor(sx / n);
  const cy = Math.floor(sy / n);
  const { fx, fy } = formationFacing(cx, cy, goalX, goalY);
  const rx = -fy;
  const ry = fx;

  const pf = scratch.pf;
  const pr = scratch.pr;
  const order = scratch.order;
  const roles = scratch.roles;
  const counts = [0, 0, 0];

  for (let i = 0; i < n; i++) {
    const id = ids[i];
    const role = unitFormationRole(sim, id);
    roles[id] = role;
    counts[role]++;
    pf[id] = (sim.x[id] - cx) * fx + (sim.y[id] - cy) * fy;
    pr[id] = (sim.x[id] - cx) * rx + (sim.y[id] - cy) * ry;
    order[i] = id;
  }

  // Primary sort: tactical role ascending (Vanguard -> Ranged -> Rearguard),
  // secondary: forward projection descending (closer to front first), tertiary: unit id ascending.
  for (let i = 1; i < n; i++) {
    const v = order[i];
    const rv = roles[v];
    const pfv = pf[v];
    let j = i - 1;
    while (j >= 0) {
      const u = order[j];
      const dr = rv - roles[u];
      if (dr < 0 || (dr === 0 && (pfv > pf[u] || (pfv === pf[u] && v < u)))) {
        order[j + 1] = u;
        j--;
      } else break;
    }
    order[j + 1] = v;
  }

  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.5)));
  const rawU = scratch.rawU;
  const rawV = scratch.rawV;
  const rowMeta = scratch.rowMeta;
  const colMeta = scratch.colMeta;

  let slotIdx = 0;
  let globalRow = 0;
  let cursorV = 0;
  let placedAnyTier = false;
  let sumV = 0;

  for (let role = 0; role < 3; role++) {
    const tCount = counts[role];
    if (tCount === 0) continue;
    if (placedAnyTier) {
      cursorV -= TIER_GAP - ROW_STEP;
    }
    const tRows = Math.ceil(tCount / cols);
    for (let r = 0; r < tRows; r++) {
      const inRow = r < tRows - 1 ? cols : tCount - (tRows - 1) * cols;
      const rowStart = slotIdx;
      const rowEnd = rowStart + inRow;

      // Sort units inside this row left-to-right along the lateral axis (tie-break by id).
      for (let i = rowStart + 1; i < rowEnd; i++) {
        const v = order[i];
        const prv = pr[v];
        let j = i - 1;
        while (j >= rowStart) {
          const u = order[j];
          const d = pr[u] - prv;
          if (d > 0 || (d === 0 && u > v)) {
            order[j + 1] = u;
            j--;
          } else break;
        }
        order[j + 1] = v;
      }

      const denom = inRow - 1;
      for (let c = 0; c < inRow; c++) {
        const u = Math.round(((2 * c - denom) * COL_STEP) / 2);
        let arcPull = 0;
        if (role === FormationRole.Vanguard && inRow >= 3) {
          const num = 2 * c - denom;
          arcPull = Math.round((VANGUARD_ARC_PULL * num * num) / (denom * denom));
        }
        const v = cursorV - arcPull;
        rawU[slotIdx] = u;
        rawV[slotIdx] = v;
        rowMeta[slotIdx] = globalRow;
        colMeta[slotIdx] = c;
        sumV += v;
        slotIdx++;
      }

      cursorV -= ROW_STEP;
      globalRow++;
    }
    placedAnyTier = true;
  }

  const meanV = Math.round(sumV / n);
  const slotX = scratch.slotX;
  const slotY = scratch.slotY;
  const used = scratch.used;
  const stamp = ++scratch.stamp;
  const bad = scratch.bad;
  let badCount = 0;

  for (let k = 0; k < n; k++) {
    const u = rawU[k];
    const v = rawV[k] - meanV;
    const px = goalX + Math.round((u * rx + v * fx) / 1024);
    const py = goalY + Math.round((u * ry + v * fy) / 1024);
    const tx = Math.floor(px / FP);
    const ty = Math.floor(py / FP);
    const ok =
      tx >= 0 &&
      ty >= 0 &&
      tx < w &&
      ty < map.h &&
      !isBlockedAt(map, tx, ty) &&
      region[ty * w + tx] === reg &&
      lineClear(map, goalCx, goalCy, px, py);
    slotX[k] = px;
    slotY[k] = py;
    if (ok) used[ty * w + tx] = stamp;
    else bad[badCount++] = k;
  }

  for (let bi = 0; bi < badCount; bi++) {
    const k = bad[bi];
    const tx = Math.floor(slotX[k] / FP);
    const ty = Math.floor(slotY[k] / FP);
    const t = nearestTileFn(
      Math.min(w - 1, Math.max(0, tx)),
      Math.min(map.h - 1, Math.max(0, ty)),
      (idx) =>
        region[idx] === reg &&
        lineClear(map, goalCx, goalCy, (idx % w) * FP + FP / 2, Math.floor(idx / w) * FP + FP / 2),
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

  return stamp;
}

const STANDALONE_RING: [number, number][] = [];
for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) if (dx * dx + dy * dy <= 64) STANDALONE_RING.push([dx, dy]);
STANDALONE_RING.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);

/**
 * Pure standalone computation of tactical formation slots for inspection, tests, or UI previews.
 */
export function computeGroupFormation(
  sim: Sim,
  ids: readonly number[],
  goalX: number,
  goalY: number,
  reg?: number,
): FormationSlot[] {
  const n = ids.length;
  if (n === 0) return [];
  const { map } = sim;
  const region = regionsOf(map);
  const w = map.w;
  const leadId = ids[0];
  const ltx = Math.min(w - 1, Math.max(0, Math.floor(sim.x[leadId] / FP)));
  const lty = Math.min(map.h - 1, Math.max(0, Math.floor(sim.y[leadId] / FP)));
  const resolvedReg = reg ?? region[lty * w + ltx];
  if (resolvedReg < 0) return [];

  let gx = Math.min(w - 1, Math.max(0, Math.floor(goalX / FP)));
  let gy = Math.min(map.h - 1, Math.max(0, Math.floor(goalY / FP)));
  let exact = !isBlockedAt(map, gx, gy) && region[gy * w + gx] === resolvedReg;
  const nearest: NearestTileFn = (x, y, ok, used, stamp = 0) => {
    for (const [dx, dy] of STANDALONE_RING) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= w || py >= map.h) continue;
      const idx = py * w + px;
      if (map.blocked[idx] || (used && used[idx] === stamp) || !ok(idx)) continue;
      return idx;
    }
    return -1;
  };
  if (!exact) {
    const t = nearest(gx, gy, (idx) => region[idx] === resolvedReg, null);
    if (t >= 0) {
      gx = t % w;
      gy = Math.floor(t / w);
    }
  }
  const resolvedGoalX = exact ? goalX : gx * FP + FP / 2;
  const resolvedGoalY = exact ? goalY : gy * FP + FP / 2;
  const goalCx = gx * FP + FP / 2;
  const goalCy = gy * FP + FP / 2;

  const cap = sim.count;
  const scratch: FormationScratch = {
    slotX: new Int32Array(n),
    slotY: new Int32Array(n),
    bad: new Int32Array(n),
    pf: new Int32Array(cap),
    pr: new Int32Array(cap),
    order: new Int32Array(n),
    rawU: new Int32Array(n),
    rawV: new Int32Array(n),
    roles: new Uint8Array(cap),
    rowMeta: new Int32Array(n),
    colMeta: new Int32Array(n),
    used: new Uint32Array(w * map.h),
    stamp: 0,
  };

  applyGroupFormation(sim, ids, resolvedReg, resolvedGoalX, resolvedGoalY, goalCx, goalCy, scratch, nearest);

  const out: FormationSlot[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const unitId = scratch.order[k];
    out[k] = {
      unitId,
      x: scratch.slotX[k],
      y: scratch.slotY[k],
      role: scratch.roles[unitId] as FormationRole,
      row: scratch.rowMeta[k],
      col: scratch.colMeta[k],
    };
  }
  return out;
}
