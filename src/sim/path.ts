import { TERRAIN_SPEED_PCT, isBlockedAt, type GameMap } from '../map';

export const FP = 256; // fixed point: 1 tile = 256 units (same as sim.ts; kept here to avoid an import cycle)
const CLEARANCE = 64; // 0.25 tile: side rays for line of sight, so paths keep off corners

/** Connected walkable regions (8 neighbours, no corner cutting). Cached per map. */
const regionCache = new WeakMap<GameMap, Int32Array>();
export function invalidateRegions(map: GameMap): void {
  regionCache.delete(map);
}

/** Slide from `(fromX, fromY)` toward `(toX, toY)` stopping before blocked tiles and clamping inside walkable map bounds. */
export function safeSlideTo(map: GameMap, fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number } {
  const minX = map.w > 2 ? FP : 0;
  const minY = map.h > 2 ? FP : 0;
  const maxX = map.w > 2 ? (map.w - 1) * FP - 1 : map.w * FP - 1;
  const maxY = map.h > 2 ? (map.h - 1) * FP - 1 : map.h * FP - 1;
  const cx = Math.max(minX, Math.min(maxX, Math.round(toX)));
  const cy = Math.max(minY, Math.min(maxY, Math.round(toY)));
  const dx = cx - fromX;
  const dy = cy - fromY;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 64));
  let lastX = Math.max(minX, Math.min(maxX, Math.round(fromX)));
  let lastY = Math.max(minY, Math.min(maxY, Math.round(fromY)));
  let prevTx = lastX >> 8;
  let prevTy = lastY >> 8;
  for (let s = 1; s <= steps; s++) {
    const nx = Math.round(fromX + (dx * s) / steps);
    const ny = Math.round(fromY + (dy * s) / steps);
    const tx = nx >> 8;
    const ty = ny >> 8;
    if (isBlockedAt(map, tx, ty)) break;
    if (tx !== prevTx && ty !== prevTy && (isBlockedAt(map, tx, prevTy) || isBlockedAt(map, prevTx, ty))) break;
    lastX = nx;
    lastY = ny;
    prevTx = tx;
    prevTy = ty;
  }
  return { x: lastX, y: lastY };
}

export function regionsOf(map: GameMap): Int32Array {
  const hit = regionCache.get(map);
  if (hit) return hit;
  const { w, h } = map;
  const reg = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];
  let next = 0;
  for (let s = 0; s < w * h; s++) {
    if (reg[s] !== -1 || map.blocked[s]) continue;
    reg[s] = next;
    stack.push(s);
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % w;
      const cy = (c - cx) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx === 0 && dy === 0) || !stepOk(map, cx, cy, dx, dy)) continue;
          const n = (cy + dy) * w + cx + dx;
          if (reg[n] === -1) {
            reg[n] = next;
            stack.push(n);
          }
        }
      }
    }
    next++;
  }
  regionCache.set(map, reg);
  return reg;
}

/** A single step is allowed when the target is open and a diagonal does not cut a blocked corner. */
function stepOk(map: GameMap, x: number, y: number, dx: number, dy: number): boolean {
  if (isBlockedAt(map, x + dx, y + dy)) return false;
  return dx === 0 || dy === 0 || (!isBlockedAt(map, x + dx, y) && !isBlockedAt(map, x, y + dy));
}

/** Terrain speed percent at a tile (0 = impassable). */
export function speedPct(map: GameMap, tx: number, ty: number): number {
  return isBlockedAt(map, tx, ty) ? 0 : TERRAIN_SPEED_PCT[map.terrain[ty * map.w + tx]] || 100;
}

/**
 * Detects whether a tile is in a narrow passage or bottleneck (corridor, bridge, door).
 * Walkable tile bordered by opposing impassable walls (north & south, or east & west).
 */
export function isChokepoint(map: GameMap, tx: number, ty: number): boolean {
  if (isBlockedAt(map, tx, ty)) return false;
  const n = isBlockedAt(map, tx, ty - 1);
  const s = isBlockedAt(map, tx, ty + 1);
  const w = isBlockedAt(map, tx - 1, ty);
  const e = isBlockedAt(map, tx + 1, ty);
  return (n && s) || (w && e);
}

function rayClear(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const { w, h, blocked } = map;
  const tx0 = x0 >> 8;
  const ty0 = y0 >> 8;
  const tx1 = x1 >> 8;
  const ty1 = y1 >> 8;
  if (tx0 === tx1 && ty0 === ty1) {
    return tx0 >= 0 && ty0 >= 0 && tx0 < w && ty0 < h && blocked[ty0 * w + tx0] === 0;
  }
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(len / 64)); // a sample every quarter tile
  // Remember only the last clear tile on this ray.
  let previousX = -999999;
  let previousY = -999999;
  for (let s = 0; s <= steps; s++) {
    const x = x0 + Math.trunc((dx * s) / steps);
    const y = y0 + Math.trunc((dy * s) / steps);
    const tx = x >> 8;
    const ty = y >> 8;
    if (tx === previousX && ty === previousY) continue;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h || blocked[ty * w + tx]) return false;
    previousX = tx;
    previousY = ty;
  }
  return true;
}

/** Line of sight between two fixed-point positions for a body of 0.25 tile half-width. */
export function lineClear(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  if (!rayClear(map, x0, y0, x1, y1)) return false;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 32) return true;
  const ox = Math.round((-dy * CLEARANCE) / len);
  const oy = Math.round((dx * CLEARANCE) / len);
  return rayClear(map, x0 + ox, y0 + oy, x1 + ox, y1 + oy) && rayClear(map, x0 - ox, y0 - oy, x1 - ox, y1 - oy);
}

const OCT_DX = new Int8Array([1, -1, 0, 0, 1, -1, 1, -1]);
const OCT_DY = new Int8Array([0, 0, 1, -1, 1, 1, -1, -1]);

/** A* over the tile grid with 8 neighbours. Scratch buffers are reused between searches. */
export class Pather {
  private readonly g: Int32Array;
  private readonly parent: Int32Array;
  private readonly stamp: Int32Array;
  private readonly closed: Int32Array;
  private readonly tiles: Int32Array;
  private readonly smoothBuf: Int32Array;
  private readonly cardCost: Uint8Array;
  private readonly diagCost: Uint8Array;
  private gen = 0;
  private heapF = new Int32Array(1024);
  private heapIdx = new Int32Array(1024);
  private heapLen = 0;

  constructor(private readonly map: GameMap) {
    const n = map.w * map.h;
    this.g = new Int32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Int32Array(n);
    this.closed = new Int32Array(n);
    this.tiles = new Int32Array(n);
    this.smoothBuf = new Int32Array(n * 2);
    const maxT = Math.max(8, TERRAIN_SPEED_PCT.length);
    this.cardCost = new Uint8Array(maxT);
    this.diagCost = new Uint8Array(maxT);
    for (let t = 0; t < maxT; t++) {
      const pct = TERRAIN_SPEED_PCT[t] || 100;
      const base = Math.round(1000 / pct);
      this.cardCost[t] = base;
      this.diagCost[t] = Math.floor((base * 14) / 10);
    }
  }

  private push(f: number, idx: number): void {
    let i = this.heapLen++;
    if (i >= this.heapF.length) {
      const nextF = new Int32Array(this.heapF.length * 2);
      const nextIdx = new Int32Array(this.heapIdx.length * 2);
      nextF.set(this.heapF);
      nextIdx.set(this.heapIdx);
      this.heapF = nextF;
      this.heapIdx = nextIdx;
    }
    const hf = this.heapF;
    const hi = this.heapIdx;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pf = hf[p];
      if (pf < f || (pf === f && hi[p] <= idx)) break;
      hf[i] = pf;
      hi[i] = hi[p];
      i = p;
    }
    hf[i] = f;
    hi[i] = idx;
  }

  private pop(): number {
    const hf = this.heapF;
    const hi = this.heapIdx;
    const top = hi[0];
    const n = --this.heapLen;
    if (n > 0) {
      const lastF = hf[n];
      const lastIdx = hi[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n) {
          const cf = hf[c];
          const rf = hf[c + 1];
          if (rf < cf || (rf === cf && hi[c + 1] < hi[c])) c++;
        }
        const cf = hf[c];
        if (cf > lastF || (cf === lastF && hi[c] >= lastIdx)) break;
        hf[i] = cf;
        hi[i] = hi[c];
        i = c;
      }
      hf[i] = lastF;
      hi[i] = lastIdx;
    }
    return top;
  }

  /**
   * Shortest path between two tiles as smoothed waypoints in fixed-point tile centres
   * (first = start tile, last = goal tile). Returns null when the goal cannot be reached.
   * Caps search expansions at `maxExpanded` and returns the closest partial path if reached.
   */
  find(sx: number, sy: number, gx: number, gy: number, maxExpanded = 4096): Int32Array | null {
    const { map, cardCost, diagCost } = this;
    const { w, h, blocked, terrain } = map;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h || blocked[sy * w + sx]) return null;
    if (gx < 0 || gy < 0 || gx >= w || gy >= h || blocked[gy * w + gx]) return null;
    const start = sy * w + sx;
    const goal = gy * w + gx;
    if (start === goal) return Int32Array.of((sx << 8) + 128, (sy << 8) + 128);
    const gen = ++this.gen;
    this.heapLen = 0;
    this.stamp[start] = gen;
    this.g[start] = 0;
    this.parent[start] = -1;
    const startH = this.h(sx, sy, gx, gy);
    this.push(startH, start);
    let found = false;
    let budgetHit = false;
    let bestNode = start;
    let bestH = startH;
    let bestG = 0;
    let expanded = 0;
    while (this.heapLen > 0) {
      const cur = this.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      if (cur === goal) {
        found = true;
        break;
      }
      if (++expanded > maxExpanded) {
        budgetHit = true;
        break;
      }
      const cx = cur % w;
      const cy = (cur - cx) / w;
      const curG = this.g[cur];
      for (let d = 0; d < 8; d++) {
        const dx = OCT_DX[d];
        const dy = OCT_DY[d];
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (blocked[n]) continue;
        if (dx !== 0 && dy !== 0 && (blocked[cy * w + nx] || blocked[ny * w + cx])) continue;
        if (this.closed[n] === gen) continue;
        const tid = terrain[n];
        const step = dx !== 0 && dy !== 0 ? (tid < diagCost.length ? diagCost[tid] : 14) : (tid < cardCost.length ? cardCost[tid] : 10);
        const ng = curG + step;
        if (this.stamp[n] !== gen || ng < this.g[n]) {
          this.stamp[n] = gen;
          this.g[n] = ng;
          this.parent[n] = cur;
          const nh = this.h(nx, ny, gx, gy);
          if (nh < bestH || (nh === bestH && (ng < bestG || (ng === bestG && n < bestNode)))) {
            bestNode = n;
            bestH = nh;
            bestG = ng;
          }
          this.push(ng + nh, n);
        }
      }
    }
    const endNode = found ? goal : budgetHit && bestNode !== start ? bestNode : -1;
    if (endNode < 0) return null;
    let count = 0;
    for (let t = endNode; t !== -1; t = this.parent[t]) this.tiles[count++] = t;
    // Reverse in-place
    for (let l = 0, r = count - 1; l < r; l++, r--) {
      const tmp = this.tiles[l];
      this.tiles[l] = this.tiles[r];
      this.tiles[r] = tmp;
    }
    return this.smooth(count, w);
  }

  private h(x: number, y: number, gx: number, gy: number): number {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
  }

  /** Greedy string pulling: keep only the corners that line of sight needs. */
  private smooth(count: number, w: number): Int32Array {
    const tiles = this.tiles;
    const buf = this.smoothBuf;
    let len = 0;
    let a = 0;
    const t0 = tiles[0];
    buf[len++] = ((t0 % w) << 8) + 128;
    buf[len++] = (Math.floor(t0 / w) << 8) + 128;
    while (a < count - 1) {
      let b = a + 1;
      const ta = tiles[a];
      const ax = ((ta % w) << 8) + 128;
      const ay = (Math.floor(ta / w) << 8) + 128;
      while (b + 1 < count) {
        const tn = tiles[b + 1];
        const nx = ((tn % w) << 8) + 128;
        const ny = (Math.floor(tn / w) << 8) + 128;
        if (!lineClear(this.map, ax, ay, nx, ny)) break;
        b++;
      }
      const tb = tiles[b];
      buf[len++] = ((tb % w) << 8) + 128;
      buf[len++] = (Math.floor(tb / w) << 8) + 128;
      a = b;
    }
    return buf.slice(0, len);
  }
}

/** Sixteen facing directions (0 = east, clockwise on screen) from an integer vector; no floats. */
export function dir16(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === 0 && ay === 0) return 0;
  const a1024 = ay * 1024;
  const s = a1024 < ax * 204 ? 0 : a1024 < ax * 684 ? 1 : a1024 < ax * 1532 ? 2 : a1024 < ax * 5148 ? 3 : 4;
  if (dx >= 0 && dy >= 0) return s;
  if (dx < 0 && dy >= 0) return 8 - s;
  if (dx < 0) return 8 + s;
  return (16 - s) % 16;
}
