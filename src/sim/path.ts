import { TERRAIN_SPEED_PCT, isBlockedAt, type GameMap } from '../map';

export const FP = 256; // fixed point: 1 tile = 256 units (same as sim.ts; kept here to avoid an import cycle)
const CLEARANCE = 64; // 0.25 tile: side rays for line of sight, so paths keep off corners

/** Connected walkable regions (8 neighbours, no corner cutting). Cached per map. */
const regionCache = new WeakMap<GameMap, Int32Array>();
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

function rayClear(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(len / 64)); // a sample every quarter tile
  for (let s = 0; s <= steps; s++) {
    const x = x0 + Math.trunc((dx * s) / steps);
    const y = y0 + Math.trunc((dy * s) / steps);
    if (isBlockedAt(map, Math.floor(x / FP), Math.floor(y / FP))) return false;
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

const OCT_D: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
];

/** A* over the tile grid with 8 neighbours. Scratch buffers are reused between searches. */
export class Pather {
  private readonly g: Int32Array;
  private readonly parent: Int32Array;
  private readonly stamp: Int32Array;
  private readonly closed: Int32Array;
  private gen = 0;
  private heap: number[] = [];

  constructor(private readonly map: GameMap) {
    const n = map.w * map.h;
    this.g = new Int32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Int32Array(n);
    this.closed = new Int32Array(n);
  }

  private push(key: number): void {
    const h = this.heap;
    let i = h.length;
    h.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p] <= key) break;
      h[i] = h[p];
      i = p;
    }
    h[i] = key;
  }

  private pop(): number {
    const h = this.heap;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      let i = 0;
      const n = h.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && h[c + 1] < h[c]) c++;
        if (h[c] >= last) break;
        h[i] = h[c];
        i = c;
      }
      h[i] = last;
    }
    return top;
  }

  /**
   * Shortest path between two tiles as smoothed waypoints in fixed-point tile centres
   * (first = start tile, last = goal tile). Returns null when the goal cannot be reached.
   */
  find(sx: number, sy: number, gx: number, gy: number): Int32Array | null {
    const { map } = this;
    const w = map.w;
    if (isBlockedAt(map, sx, sy) || isBlockedAt(map, gx, gy)) return null;
    const start = sy * w + sx;
    const goal = gy * w + gx;
    const centre = (t: number): [number, number] => [(t % w) * FP + FP / 2, Math.floor(t / w) * FP + FP / 2];
    if (start === goal) return Int32Array.from(centre(start));
    const gen = ++this.gen;
    const SHIFT = 262144; // heap key = f * SHIFT + tile index, so ties break by index (deterministic)
    this.heap.length = 0;
    this.stamp[start] = gen;
    this.g[start] = 0;
    this.parent[start] = -1;
    this.push(this.h(sx, sy, gx, gy) * SHIFT + start);
    let found = false;
    while (this.heap.length) {
      const cur = this.pop() % SHIFT;
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      if (cur === goal) {
        found = true;
        break;
      }
      const cx = cur % w;
      const cy = (cur - cx) / w;
      for (const [dx, dy] of OCT_D) {
        if (!stepOk(map, cx, cy, dx, dy)) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        const n = ny * w + nx;
        if (this.closed[n] === gen) continue;
        const pct = TERRAIN_SPEED_PCT[map.terrain[n]] || 100;
        const base = Math.round(1000 / pct); // 10 on open ground, 18 on marsh
        const step = dx !== 0 && dy !== 0 ? Math.floor((base * 14) / 10) : base;
        const ng = this.g[cur] + step;
        if (this.stamp[n] !== gen || ng < this.g[n]) {
          this.stamp[n] = gen;
          this.g[n] = ng;
          this.parent[n] = cur;
          this.push((ng + this.h(nx, ny, gx, gy)) * SHIFT + n);
        }
      }
    }
    if (!found) return null;
    const tiles: number[] = [];
    for (let t = goal; t !== -1; t = this.parent[t]) tiles.push(t);
    tiles.reverse();
    return this.smooth(tiles, centre);
  }

  private h(x: number, y: number, gx: number, gy: number): number {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
  }

  /** Greedy string pulling: keep only the corners that line of sight needs. */
  private smooth(tiles: number[], centre: (t: number) => [number, number]): Int32Array {
    const out: number[] = [];
    let a = 0;
    out.push(...centre(tiles[0]));
    while (a < tiles.length - 1) {
      let b = a + 1;
      const [ax, ay] = centre(tiles[a]);
      while (b + 1 < tiles.length) {
        const [nx, ny] = centre(tiles[b + 1]);
        if (!lineClear(this.map, ax, ay, nx, ny)) break;
        b++;
      }
      out.push(...centre(tiles[b]));
      a = b;
    }
    return Int32Array.from(out);
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
