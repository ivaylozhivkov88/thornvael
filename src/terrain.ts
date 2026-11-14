/** Static scenery only: no Pixi objects, simulation RNG or frame-time work. */
import sheet from '../public/terrain/terrain.json';
import { ObjectKind, TILE, Terrain, type GameMap, type MapObject } from './map';

export interface TerrainFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Pixel offset from the object's map tile origin to the image top-left. */
  anchor?: number[];
}

export const TERRAIN_SHEET = sheet as {
  image: string;
  size: number[];
  frames: Record<string, TerrainFrame>;
};
const NAMES = ['grass', 'dirt', 'water', 'rock', 'marsh'] as const;
// Higher-priority neighbours feather into the lower-priority tile. Never change map data.
const PRIORITY = [1, 0, 4, 3, 2];
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** Coordinate-only variation: independent of map seed/RNG, traversal and chunk size. */
export function terrainVariant(x: number, y: number, kind: number, count = 4): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(kind + 1, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % count;
}

/** N/E/S/W overlay source kind, or -1. Read neighbours in world space across chunks. */
export function terrainEdge(map: GameMap, x: number, y: number, side: number): number {
  const nx = x + DX[side];
  const ny = y + DY[side];
  if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) return -1;
  const here = map.terrain[y * map.w + x];
  const next = map.terrain[ny * map.w + nx];
  return PRIORITY[next] > PRIORITY[here] ? next : -1;
}

let pending: Promise<HTMLImageElement> | undefined;

/** One decoded atlas shared by renderer instances. A failed request can be retried. */
export function loadTerrainArt(): Promise<HTMLImageElement> {
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth !== sheet.size[0] || image.naturalHeight !== sheet.size[1]) {
          reject(new Error('Terrain atlas dimensions do not match terrain.json'));
        } else resolve(image);
      };
      image.onerror = () => reject(new Error(`Could not load terrain atlas: ${sheet.image}`));
      image.src = `${import.meta.env.BASE_URL}terrain/${sheet.image}`;
    }).catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  }
  return pending;
}

function draw(g: CanvasRenderingContext2D, art: CanvasImageSource, name: string, x: number, y: number): void {
  const f = TERRAIN_SHEET.frames[name];
  g.drawImage(art, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
}

export interface SceneryPlacement {
  frame: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** World pixel bounds, including canopy/roof/shadow overhang on every side. */
export function sceneryPlacement(map: GameMap, o: MapObject): SceneryPlacement | null {
  let name: string;
  if (o.kind === ObjectKind.Tree) {
    const marsh = map.terrain[o.y * map.w + o.x] === Terrain.Marsh;
    name = `tree/${marsh ? 2 : terrainVariant(o.x, o.y, o.kind, 2)}`;
  } else if (o.kind === ObjectKind.House) {
    name = `house/${terrainVariant(o.x, o.y, o.kind, 2)}`;
  } else return null;
  const f = TERRAIN_SHEET.frames[name];
  return { frame: name, x: o.x * TILE - f.anchor![0], y: o.y * TILE - f.anchor![1], w: f.w, h: f.h };
}

/** Prepare once per map, without sorting/mutating the gameplay object array. */
export function prepareScenery(map: GameMap): SceneryPlacement[] {
  return [...map.objects]
    .sort((a, b) => a.y - b.y || a.x - b.x || a.kind - b.kind)
    .map((o) => sceneryPlacement(map, o))
    .filter((p): p is SceneryPlacement => p !== null);
}

function cellHash(x: number, y: number, k: number): number {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 144665, 2246822519) ^ Math.imul(k + 1, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Sparse ground clutter (tufts, pebbles, reeds), deterministic per tile and baked into the chunk. */
function paintDecals(g: CanvasRenderingContext2D, kind: number, x: number, y: number, px: number, py: number): void {
  if (kind === Terrain.Water) return;
  const roll = cellHash(x, y, 0) % 100;
  if (roll >= 28) return;
  const n = 1 + (cellHash(x, y, 1) % 3);
  for (let k = 0; k < n; k++) {
    const h = cellHash(x, y, 2 + k);
    const dx = px + 3 + (h % 26);
    const dy = py + 4 + ((h >>> 8) % 24);
    if (kind === Terrain.Grass) {
      const flower = (h >>> 16) % 9 === 0;
      g.fillStyle = flower ? ['#e8d8f0', '#f0d060', '#e07878'][(h >>> 20) % 3]! : 'rgba(20,110,35,.75)';
      if (flower) g.fillRect(dx, dy, 2, 2);
      else {
        g.fillRect(dx, dy, 1, 3);
        g.fillRect(dx + 2, dy + 1, 1, 2);
        g.fillRect(dx - 2, dy + 1, 1, 2);
      }
    } else if (kind === Terrain.Dirt || kind === Terrain.Rock) {
      g.fillStyle = 'rgba(40,30,22,.35)';
      g.fillRect(dx, dy + 1, 4, 2);
      g.fillStyle = 'rgba(190,175,150,.55)';
      g.fillRect(dx, dy, 3, 2);
    } else if (kind === Terrain.Marsh) {
      g.fillStyle = 'rgba(40,70,20,.8)';
      g.fillRect(dx, dy - 2, 1, 5);
      g.fillRect(dx + 2, dy - 1, 1, 4);
    }
  }
}

/** Called only while baking a chunk. Canvas clips shared overhangs at chunk boundaries. */
export function paintTerrainChunk(
  g: CanvasRenderingContext2D,
  map: GameMap,
  cx: number,
  cy: number,
  art: CanvasImageSource,
  scenery: readonly SceneryPlacement[],
  chunk = 16,
): void {
  g.save();
  g.imageSmoothingEnabled = false;
  const startX = cx * chunk;
  const startY = cy * chunk;
  for (let ty = 0; ty < chunk; ty++) {
    for (let tx = 0; tx < chunk; tx++) {
      const x = startX + tx;
      const y = startY + ty;
      if (x >= map.w || y >= map.h) continue;
      const i = y * map.w + x;
      const kind = map.terrain[i];
      const px = tx * TILE;
      const py = ty * TILE;
      draw(g, art, `${NAMES[kind]}/${terrainVariant(x, y, kind)}`, px, py);
      for (let side = 0; side < 4; side++) {
        const next = terrainEdge(map, x, y, side);
        if (next < 0) continue;
        const variant = terrainVariant(x + DX[side], y + DY[side], next);
        draw(g, art, `edge/${NAMES[next]}/${side}/${variant}`, px, py);
      }
      // Vibrant HOMM III color balance: emerald grass, warm sunlit trails, deep sapphire water, murky marsh
      switch (kind) {
        case Terrain.Grass:
          g.fillStyle = 'rgba(35, 175, 55, 0.08)';
          g.fillRect(px, py, TILE, TILE);
          break;
        case Terrain.Dirt:
          g.fillStyle = 'rgba(235, 170, 70, 0.09)';
          g.fillRect(px, py, TILE, TILE);
          break;
        case Terrain.Water:
          g.fillStyle = 'rgba(20, 75, 190, 0.14)';
          g.fillRect(px, py, TILE, TILE);
          break;
        case Terrain.Marsh:
          g.fillStyle = 'rgba(70, 95, 30, 0.08)';
          g.fillRect(px, py, TILE, TILE);
          break;
      }
      paintDecals(g, kind, x, y, px, py);
      // Preserve map slope lighting and height brightening; all applied at bake time.
      if (map.light[i] < 255) {
        g.fillStyle = `rgba(0,0,0,${1 - map.light[i] / 255})`;
        g.fillRect(px, py, TILE, TILE);
      }
      if (map.height[i]) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = `rgba(255,255,255,${map.height[i] * 4 / 255})`;
        g.fillRect(px, py, TILE, TILE);
        g.globalCompositeOperation = 'source-over';
      }
      if (y + 1 < map.h && map.height[(y + 1) * map.w + x] < map.height[i] && kind !== Terrain.Water) {
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(px, py + TILE - 5, TILE, 5);
      }
    }
  }
  const originX = startX * TILE;
  const originY = startY * TILE;
  const size = chunk * TILE;
  for (const p of scenery) {
    const x = p.x - originX;
    const y = p.y - originY;
    if (x + p.w <= 0 || y + p.h <= 0 || x >= size || y >= size) continue;
    draw(g, art, p.frame, x, y);
  }
  g.restore();
}
