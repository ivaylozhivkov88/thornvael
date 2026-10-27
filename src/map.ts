import { Rng } from './sim/rng';

export const MAP_W = 64;
export const MAP_H = 48;
export const TILE = 32; // source pixels per tile
export const Terrain = { Grass: 0, Dirt: 1, Water: 2, Rock: 3, Marsh: 4 } as const;
/** Walking speed in percent per terrain; Marsh is the rough ground that slows units. */
export const TERRAIN_SPEED_PCT = [100, 100, 0, 0, 55] as const;
export const ObjectKind = { Tree: 0, House: 1 } as const;

export interface MapObject {
  kind: number;
  x: number;
  y: number;
}

export interface GameMap {
  w: number;
  h: number;
  terrain: Uint8Array;
  height: Uint8Array; // 0..3
  blocked: Uint8Array; // 1 = units cannot enter
  objects: MapObject[];
  light: Uint8Array; // 0..255 brightness baked from height slope
}

function hash2(seed: number, x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1) on a coarse grid of cell size `cell`. */
function noise(seed: number, x: number, y: number, cell: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(seed, gx, gy);
  const b = hash2(seed, gx + 1, gy);
  const c = hash2(seed, gx, gy + 1);
  const d = hash2(seed, gx + 1, gy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function generateMap(seed = 7): GameMap {
  const w = MAP_W;
  const h = MAP_H;
  const terrain = new Uint8Array(w * h);
  const height = new Uint8Array(w * h);
  const blocked = new Uint8Array(w * h);
  const light = new Uint8Array(w * h);
  const objects: MapObject[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const e = noise(seed, x, y, 12) * 0.75 + noise(seed + 1, x, y, 5) * 0.25;
      height[i] = e < 0.4 ? 0 : e < 0.55 ? 1 : e < 0.68 ? 2 : 3;
      if (e < 0.3) terrain[i] = Terrain.Water;
      else if (e < 0.36) terrain[i] = Terrain.Marsh;
      else if (e > 0.72) terrain[i] = Terrain.Rock;
      else terrain[i] = noise(seed + 2, x, y, 4) > 0.62 ? Terrain.Dirt : Terrain.Grass;
      if (terrain[i] === Terrain.Water || terrain[i] === Terrain.Rock) blocked[i] = 1;
    }
  }
  // Keep a clear start meadow in the south-west corner.
  for (let y = h - 12; y < h - 2; y++) {
    for (let x = 2; x < 14; x++) {
      const i = y * w + x;
      terrain[i] = Terrain.Grass;
      height[i] = 1;
      blocked[i] = 0;
    }
  }
  const rng = new Rng(seed * 977);
  for (let n = 0; n < 5; n++) {
    const x = 18 + rng.int(w - 22);
    const y = 4 + rng.int(h - 10);
    const i = y * w + x;
    if (blocked[i] || blocked[i + 1] || blocked[i + w] || blocked[i + w + 1]) continue;
    objects.push({ kind: ObjectKind.House, x, y });
    for (const j of [i, i + 1, i + w, i + w + 1]) blocked[j] = 1;
  }
  for (let n = 0; n < 320; n++) {
    const x = rng.int(w);
    const y = rng.int(h);
    const i = y * w + x;
    if (blocked[i] || terrain[i] === Terrain.Dirt) continue;
    if (x < 14 && y > h - 13) continue; // start meadow stays open
    objects.push({ kind: ObjectKind.Tree, x, y });
    blocked[i] = 1;
  }
  light.set(bakeLight(w, h, height));
  return { w, h, terrain, height, blocked, objects, light };
}

/** Brightness from the height step towards the north-west neighbour. */
export function bakeLight(w: number, h: number, height: Uint8Array): Uint8Array {
  const light = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const here = height[y * w + x];
      const nw = height[Math.max(0, y - 1) * w + Math.max(0, x - 1)];
      light[y * w + x] = Math.max(110, Math.min(255, 190 + (here - nw) * 36));
    }
  }
  return light;
}

/** Blocked tiles from terrain and objects: water and rock, one tile per tree, a 2 by 2 footprint per house. */
export function bakeBlocked(w: number, h: number, terrain: Uint8Array, objects: readonly MapObject[]): Uint8Array {
  const blocked = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (terrain[i] === Terrain.Water || terrain[i] === Terrain.Rock) blocked[i] = 1;
  for (const o of objects) {
    const size = o.kind === ObjectKind.House ? 2 : 1;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (o.x + dx < w && o.y + dy < h) blocked[(o.y + dy) * w + o.x + dx] = 1;
  }
  return blocked;
}

export function isBlockedAt(map: GameMap, tx: number, ty: number): boolean {
  return tx < 0 || ty < 0 || tx >= map.w || ty >= map.h || map.blocked[ty * map.w + tx] === 1;
}
