/** Static scenery only: no Pixi objects, simulation RNG or frame-time work. */
import sheet from '../public/terrain/terrain.json';
import objSheet from '../public/objects/objects.json';
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

/** Biome skin: a 128x32 strip (4 tiles) that replaces the Dirt ground tiles. Set before the renderer bakes chunks. */
export const BIOME_SKINS: Record<string, string> = { desert: 'sand', crypt: 'crypt', highlands: 'highland' };
/** Feature zones: soft-edged patches of another ground (graveyard, ruined paving, snow...) that the map walks into. */
export const BIOME_ZONES: Record<string, string[]> = {
  forest: ['crypt', 'highland'],
  marsh: ['ruinstone'],
  desert: ['ruinstone', 'highland'],
  crypt: ['ruinstone'],
  highlands: ['crypt', 'snow'],
  volcanic: ['ruinstone'],
  oasis: ['sand'],
};
const skins = new Map<string, HTMLImageElement>();
let mainSkin: HTMLImageElement | null = null;
let zoneSkins: HTMLImageElement[] = [];
let zoneNames: string[] = [];
let objImage: HTMLImageElement | null = null;

/** Low ground props (baked into chunks, no collision) that belong to each zone ground. */
const ZONE_DECOR: Record<string, string[]> = {
  crypt: ['bones/tombstone', 'bones/tombstone', 'bones/tombstone', 'bones/pile', 'bones/ribcage', 'bones/skullspike', 'bones/sarcophagus', 'bones/candles', 'ruins/rubble'],
  ruinstone: ['ruins/rubble', 'ruins/rubble', 'ruins/column-broken', 'ruins/wall', 'ruins/statue', 'rocks/slab'],
  highland: ['rocks/cluster', 'rocks/boulder-m', 'highland/log', 'highland/gorse', 'highland/standing-stone'],
  sand: ['desert/stump', 'rocks/cluster', 'desert/thorn', 'bones/ribcage'],
  snow: ['rocks/cluster', 'rocks/boulder-m', 'highland/log'],
};
let zoneSeed = 0;

function loadSkin(name: string): Promise<HTMLImageElement | null> {
  const cached = skins.get(name);
  if (cached) return Promise.resolve(cached);
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      skins.set(name, image);
      resolve(image);
    };
    image.onerror = () => resolve(null); // fall back to the default atlas tiles
    image.src = `${import.meta.env.BASE_URL}terrain/skin-${name}.png`;
  });
}

/** Load the biome skin and its zone skins. Call before the renderer bakes chunks. */
export async function setTerrainTheme(biome: string, seed: number): Promise<void> {
  zoneSeed = seed >>> 0;
  const main = BIOME_SKINS[biome];
  mainSkin = main ? await loadSkin(main) : null;
  const loaded = await Promise.all((BIOME_ZONES[biome] ?? []).map(loadSkin));
  const names = BIOME_ZONES[biome] ?? [];
  zoneSkins = [];
  zoneNames = [];
  loaded.forEach((img, i) => {
    if (img) {
      zoneSkins.push(img);
      zoneNames.push(names[i]!);
    }
  });
  objImage = await new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `${import.meta.env.BASE_URL}objects/${objSheet.image}`;
  });
}

function cellHash01(x: number, y: number, k: number): number {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 144665, 2246822519) ^ Math.imul(k + 1, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, cell: number, k: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = cellHash01(x0, y0, k);
  const b = cellHash01(x0 + 1, y0, k);
  const c = cellHash01(x0, y0 + 1, k);
  const d = cellHash01(x0 + 1, y0 + 1, k);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

/** Per-vertex zone weights (0..1), (w+1)*(h+1) per zone. Derived from the seed only, never stored in map data. */
const zoneFields = new WeakMap<GameMap, Float32Array[]>();
function zoneField(map: GameMap): Float32Array[] {
  let fields = zoneFields.get(map);
  if (fields) return fields;
  fields = [];
  const vw = map.w + 1;
  const size = Math.min(map.w, map.h);
  for (let z = 0; z < zoneSkins.length; z++) {
    const f = new Float32Array(vw * (map.h + 1));
    // Centre away from the start corner and the outer border; larger maps get bigger patches.
    let cx = 0;
    let cy = 0;
    for (let t = 0; t < 12; t++) {
      cx = size * (0.25 + 0.55 * cellHash01(zoneSeed, z, 10 + t * 2));
      cy = size * (0.25 + 0.55 * cellHash01(zoneSeed, z, 11 + t * 2));
      if (Math.hypot(cx - 8, cy - 8) > 16) break;
    }
    const r = size * (0.12 + 0.08 * cellHash01(zoneSeed, z, 3));
    for (let vy = 0; vy <= map.h; vy++) {
      for (let vx = 0; vx <= map.w; vx++) {
        const wob = valueNoise(vx, vy, 5, zoneSeed + z * 7) - 0.5; // ragged outline
        const d = Math.hypot(vx - cx, vy - cy) + wob * r * 0.9;
        const t = Math.max(0, Math.min(1, (r - d) / 4)); // ~4-tile soft transition
        f[vy * vw + vx] = t * t * (3 - 2 * t);
      }
    }
    fields.push(f);
  }
  zoneFields.set(map, fields);
  return fields;
}

function paintZones(g: CanvasRenderingContext2D, map: GameMap, x: number, y: number, px: number, py: number): number {
  if (!zoneSkins.length) return 0;
  const fields = zoneField(map);
  const vw = map.w + 1;
  let strongest = 0;
  for (let z = 0; z < fields.length; z++) {
    const f = fields[z]!;
    const a = f[y * vw + x]!;
    const b = f[y * vw + x + 1]!;
    const c = f[(y + 1) * vw + x]!;
    const d = f[(y + 1) * vw + x + 1]!;
    if (a + b + c + d < 0.004) continue;
    const img = zoneSkins[z]!;
    const sx = terrainVariant(x, y, 9 + z) * 32;
    const mean = (a + b + c + d) / 4;
    strongest = Math.max(strongest, mean);
    if (a > 0.995 && b > 0.995 && c > 0.995 && d > 0.995) {
      g.drawImage(img, sx, 0, 32, 32, px, py, TILE, TILE);
      continue;
    }
    const N = 4;
    const cell = TILE / N;
    for (let j = 0; j < N; j++) {
      const v = (j + 0.5) / N;
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N;
        const l = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
        if (l < 0.01) continue;
        g.globalAlpha = l;
        g.drawImage(img, sx + i * 8, j * 8, 8, 8, px + i * cell, py + j * cell, cell, cell);
      }
    }
    g.globalAlpha = 1;
  }
  return strongest;
}

function draw(g: CanvasRenderingContext2D, art: CanvasImageSource, name: string, x: number, y: number): void {
  const f = TERRAIN_SHEET.frames[name];
  g.drawImage(art, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
}

export interface SceneryPlacement {
  frame: string;
  /** Frame lives in the object atlas instead of the terrain atlas. */
  obj?: boolean;
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
  const list = [...map.objects]
    .sort((a, b) => a.y - b.y || a.x - b.x || a.kind - b.kind)
    .map((o) => sceneryPlacement(map, o))
    .filter((p): p is SceneryPlacement => p !== null);
  return [...list, ...zoneDecor(map)];
}

/** Seed-derived props inside the feature zones (gravestones, bones, rubble...). Visual only. */
function zoneDecor(map: GameMap): SceneryPlacement[] {
  if (!objImage || !zoneSkins.length) return [];
  const fields = zoneField(map);
  const vw = map.w + 1;
  const taken = new Set<number>();
  for (const o of map.objects) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) taken.add((o.y + dy) * map.w + o.x + dx);
  const out: SceneryPlacement[] = [];
  for (let y = 2; y < map.h - 2; y++) {
    for (let x = 2; x < map.w - 2; x++) {
      const kind = map.terrain[y * map.w + x];
      if (kind === Terrain.Water || kind === Terrain.Rock || taken.has(y * map.w + x)) continue;
      if (Math.hypot(x - 8, y - 8) < 7) continue;
      for (let z = 0; z < fields.length; z++) {
        const wgt = fields[z]![y * vw + x]!;
        if (wgt < 0.15) continue;
        const chance = wgt > 0.55 ? 0.09 : 0.02;
        if (cellHash01(x, y, 40 + z + zoneSeed) > chance) continue;
        const set = ZONE_DECOR[zoneNames[z]!];
        if (!set) continue;
        const name = set[Math.floor(cellHash01(x, y, 60 + z) * set.length)]!;
        const f = objSheet.frames[name as keyof typeof objSheet.frames] as TerrainFrame | undefined;
        if (!f) continue;
        taken.add(y * map.w + x);
        out.push({ frame: name, obj: true, x: x * TILE + TILE / 2 - f.anchor![0], y: y * TILE + TILE - f.anchor![1], w: f.w, h: f.h });
        break;
      }
    }
  }
  return out.sort((a, b) => a.y + a.h - (b.y + b.h));
}

function cellHash(x: number, y: number, k: number): number {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 144665, 2246822519) ^ Math.imul(k + 1, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Sparse ground clutter (cobblestones, shaded pebbles, multi-blade grass tufts, marsh reeds), deterministic per tile and baked into the chunk. */
function paintDecals(g: CanvasRenderingContext2D, kind: number, x: number, y: number, px: number, py: number): void {
  if (kind === Terrain.Water) return;
  const roll = cellHash(x, y, 0) % 100;
  if (roll >= 34) return;
  const n = 1 + (cellHash(x, y, 1) % 3);
  for (let k = 0; k < n; k++) {
    const h = cellHash(x, y, 2 + k);
    const dx = px + 4 + (h % 22);
    const dy = py + 5 + ((h >>> 8) % 20);
    if (kind === Terrain.Grass) {
      const flower = (h >>> 16) % 8 === 0;
      if (flower) {
        // Shaded wildflower with stem, leaf, petal cluster and bright center pip
        g.fillStyle = 'rgba(22,74,28,.72)';
        g.fillRect(dx, dy + 1, 1, 3);
        g.fillRect(dx - 1, dy + 2, 2, 1);
        const petals = ['rgba(232,214,244,.88)', 'rgba(244,210,88,.88)', 'rgba(228,116,116,.88)'][(h >>> 20) % 3]!;
        g.fillStyle = petals;
        g.fillRect(dx - 1, dy, 3, 1);
        g.fillRect(dx, dy - 1, 1, 3);
        g.fillStyle = 'rgba(255,245,170,.95)';
        g.fillRect(dx, dy, 1, 1);
      } else {
        // Layered 3-tone grass tuft with root shadow, emerald blades and sunlit tips
        g.fillStyle = 'rgba(14,42,18,.55)';
        g.fillRect(dx - 2, dy + 2, 5, 1);
        g.fillStyle = 'rgba(26,98,36,.78)';
        g.fillRect(dx, dy - 1, 1, 3);
        g.fillRect(dx - 2, dy, 1, 2);
        g.fillRect(dx + 2, dy, 1, 2);
        g.fillStyle = 'rgba(88,162,58,.72)';
        g.fillRect(dx, dy - 2, 1, 1);
        g.fillRect(dx - 2, dy - 1, 1, 1);
        g.fillRect(dx + 2, dy - 1, 1, 1);
      }
    } else if (kind === Terrain.Dirt || kind === Terrain.Rock) {
      const isSlab = (h >>> 16) % 3 !== 0;
      if (isSlab) {
        // Bevelled road flagstone / paving slab with mortar joint, stone body and NW highlight
        const sw = 4 + ((h >>> 19) % 3);
        const sh = 2 + ((h >>> 22) % 2);
        g.fillStyle = 'rgba(28,22,16,.42)';
        g.fillRect(dx - 1, dy, sw + 1, sh + 1);
        g.fillStyle = kind === Terrain.Dirt ? 'rgba(142,126,104,.46)' : 'rgba(116,118,114,.48)';
        g.fillRect(dx, dy, sw, sh);
        g.fillStyle = 'rgba(212,198,174,.52)';
        g.fillRect(dx, dy, sw - 1, 1);
        g.fillRect(dx, dy, 1, sh - 1);
      } else {
        // Shaded 3D pebble with drop shadow, midtone and specular glint
        g.fillStyle = 'rgba(24,18,12,.45)';
        g.fillRect(dx, dy + 1, 3, 2);
        g.fillStyle = 'rgba(136,124,108,.65)';
        g.fillRect(dx, dy, 3, 2);
        g.fillStyle = 'rgba(220,210,192,.75)';
        g.fillRect(dx, dy, 1, 1);
      }
    } else if (kind === Terrain.Marsh) {
      // Swamp reeds and cattails with dark water ripple at base
      g.fillStyle = 'rgba(20,36,30,.48)';
      g.fillRect(dx - 2, dy + 3, 6, 1);
      g.fillStyle = 'rgba(38,68,24,.82)';
      g.fillRect(dx, dy - 3, 1, 6);
      g.fillRect(dx + 2, dy - 1, 1, 4);
      g.fillRect(dx - 2, dy, 1, 3);
      g.fillStyle = 'rgba(84,118,46,.72)';
      g.fillRect(dx, dy - 3, 1, 2);
      g.fillRect(dx + 2, dy - 1, 1, 1);
      // Cattail brown seed cylinder on main stalk
      if ((h >>> 17) & 1) {
        g.fillStyle = 'rgba(72,42,20,.92)';
        g.fillRect(dx, dy - 2, 1, 2);
      }
    }
  }
}

/** Corner light = mean of the 4 tiles around the vertex, bilinear over 8px cells: soft relief, no tile steps. */
function cornerLight(map: GameMap, vx: number, vy: number): number {
  let sum = 0;
  for (let k = 0; k < 4; k++) {
    const x = Math.max(0, Math.min(map.w - 1, vx - 1 + (k & 1)));
    const y = Math.max(0, Math.min(map.h - 1, vy - 1 + (k >> 1)));
    sum += map.light[y * map.w + x];
  }
  return sum / 4;
}

function paintSmoothLight(g: CanvasRenderingContext2D, map: GameMap, x: number, y: number, px: number, py: number): void {
  const a = cornerLight(map, x, y);
  const b = cornerLight(map, x + 1, y);
  const c = cornerLight(map, x, y + 1);
  const d = cornerLight(map, x + 1, y + 1);
  if (a >= 254.5 && b >= 254.5 && c >= 254.5 && d >= 254.5) return;
  const N = 4;
  const cell = TILE / N;
  for (let j = 0; j < N; j++) {
    const v = (j + 0.5) / N;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const l = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
      const alpha = 1 - l / 255;
      if (alpha < 0.004) continue;
      g.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
      g.fillRect(px + i * cell, py + j * cell, cell, cell);
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
      if (mainSkin && kind === Terrain.Dirt) g.drawImage(mainSkin, terrainVariant(x, y, kind) * 32, 0, 32, 32, px, py, TILE, TILE);
      else draw(g, art, `${NAMES[kind]}/${terrainVariant(x, y, kind)}`, px, py);
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
      const zoneMix = kind === Terrain.Water || kind === Terrain.Rock ? 0 : paintZones(g, map, x, y, px, py);
      if (zoneMix < 0.5) paintDecals(g, kind, x, y, px, py);
      // Preserve map slope lighting and height brightening; all applied at bake time.
      paintSmoothLight(g, map, x, y, px, py);
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
    if (p.obj) {
      const f = objSheet.frames[p.frame as keyof typeof objSheet.frames];
      if (objImage) g.drawImage(objImage, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
    } else draw(g, art, p.frame, x, y);
  }
  g.restore();
}
