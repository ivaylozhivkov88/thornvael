export const W = 28;
export const H = 18;
export type Tile = 0 | 1 | 2 | 3; // grass, dirt, water, tree
export const WALKABLE: Record<Tile, boolean> = { 0: true, 1: true, 2: false, 3: false };

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function makeMap(): Tile[] {
  const t: Tile[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = hash(x, y);
      let v: Tile = 0;
      if (y === 9 + Math.round(Math.sin(x / 3) * 2)) v = 1; // winding path
      else if (x > 18 && x < 25 && y > 2 && y < 7) v = 2; // pond
      else if (r > 0.9) v = 3;
      else if (r > 0.8) v = 1;
      t.push(v);
    }
  }
  t[9 * W + 2] = 1; // hero start is always open
  return t;
}

/** Breadth-first path over 4-neighbours. Returns tiles after the start, or [] if unreachable. */
export function findPath(map: Tile[], sx: number, sy: number, tx: number, ty: number): [number, number][] {
  if (tx < 0 || ty < 0 || tx >= W || ty >= H || !WALKABLE[map[ty * W + tx]]) return [];
  const start = sy * W + sx;
  const goal = ty * W + tx;
  const prev = new Int32Array(W * H).fill(-1);
  const q = [start];
  prev[start] = start;
  for (let i = 0; i < q.length && prev[goal] === -1; i++) {
    const c = q[i];
    const cx = c % W;
    const cy = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (prev[n] !== -1 || !WALKABLE[map[n]]) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  if (prev[goal] === -1) return [];
  const path: [number, number][] = [];
  for (let c = goal; c !== start; c = prev[c]) path.push([c % W, (c / W) | 0]);
  return path.reverse();
}
