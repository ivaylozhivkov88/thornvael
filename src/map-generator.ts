import { bakeBlocked, ObjectKind, Terrain, type MapObject } from './map';
import {
  BOSS_MOD_IDS,
  MAP_FORMAT,
  MAP_VERSION,
  rleEncode,
  validate,
  type BossModId,
  type MapDoc,
  type Region,
  type ShrineDef,
  type ShrineKind,
  type UnitDef,
  type WaypointDef,
  type ZoneExitDef,
  type AdventureObjectDef,
} from './mapdoc';
import { Kind } from './sim/combat';

export interface ExpeditionOptions {
  seed: number;
  biome?: 'forest' | 'marsh' | 'desert' | 'crypt' | 'oasis' | 'highlands' | 'volcanic';
  difficulty?: number; // 0, 1, 2
  size?: number; // 64 (default) or 96
}

export interface BiomeConfig {
  ground: number;
  path: number;
  barrierWater: number;
  barrierRock: number;
  hasTrees: boolean;
  bossFamily: string;
  mobFamily: string;
  mobFamilies?: readonly string[];
  bossFamilies?: readonly string[];
  eliteMods?: readonly BossModId[];
}

export const BIOMES: Record<NonNullable<ExpeditionOptions['biome']>, BiomeConfig> = {
  forest: {
    ground: Terrain.Grass,
    path: Terrain.Dirt,
    barrierWater: Terrain.Water,
    barrierRock: Terrain.Rock,
    hasTrees: true,
    bossFamily: 'rootbound',
    mobFamily: 'briar-hound',
    mobFamilies: ['briar-hound', 'thorn-boar', 'quill-fiend', 'fallen-shaman'],
    bossFamilies: ['rootbound', 'wendigo-bruiser'],
    eliteMods: ['extra_fast', 'stone_skin', 'spectral_hit', 'blessed_aura'],
  },
  marsh: {
    ground: Terrain.Marsh,
    path: Terrain.Dirt,
    barrierWater: Terrain.Water,
    barrierRock: Terrain.Rock,
    hasTrees: true,
    bossFamily: 'flintback',
    mobFamily: 'mire-wisp',
    mobFamilies: ['mire-wisp', 'salt-crab', 'fetish-blowdart', 'spore-matron'],
    bossFamilies: ['flintback', 'witch-doctor'],
    eliteMods: ['cold_enchanted', 'magic_resistant', 'stone_skin', 'spectral_hit'],
  },
  desert: {
    ground: Terrain.Dirt,
    path: Terrain.Grass,
    barrierWater: Terrain.Water,
    barrierRock: Terrain.Rock,
    hasTrees: false,
    bossFamily: 'basalt-brute',
    mobFamily: 'dune-lurker',
    mobFamilies: ['dune-lurker', 'sand-raider', 'dune-scarab', 'claw-viper'],
    bossFamilies: ['basalt-brute', 'claw-viper'],
    eliteMods: ['extra_fast', 'fire_enchanted', 'spectral_hit', 'stone_skin'],
  },
  oasis: {
    ground: Terrain.Grass,
    path: Terrain.Dirt,
    barrierWater: Terrain.Water,
    barrierRock: Terrain.Rock,
    hasTrees: true,
    bossFamily: 'silt-colossus',
    mobFamily: 'dune-beast',
    mobFamilies: ['dune-beast', 'maggot-swarm', 'dune-lurker', 'dune-scarab'],
    bossFamilies: ['silt-colossus', 'dune-scarab'],
    eliteMods: ['blessed_aura', 'magic_resistant', 'cold_enchanted', 'extra_fast'],
  },
  crypt: {
    ground: Terrain.Dirt,
    path: Terrain.Marsh,
    barrierWater: Terrain.Water,
    barrierRock: Terrain.Rock,
    hasTrees: false,
    bossFamily: 'silt-colossus',
    mobFamily: 'ruin-mite',
    mobFamilies: ['ruin-mite', 'hollow-knight', 'greater-mummy', 'fallen-shaman'],
    bossFamilies: ['hollow-king', 'greater-mummy', 'silt-colossus'],
    eliteMods: ['cold_enchanted', 'stone_skin', 'spectral_hit', 'magic_resistant'],
  },
  highlands: {
    ground: Terrain.Dirt,
    path: Terrain.Grass,
    barrierWater: Terrain.Water,
    barrierRock: Terrain.Rock,
    hasTrees: false,
    bossFamily: 'crowned-maw',
    mobFamily: 'storm-kite',
    mobFamilies: ['storm-kite', 'wendigo-bruiser', 'basalt-brute', 'gloom-stag'],
    bossFamilies: ['stormtree', 'crowned-maw'],
    eliteMods: ['extra_fast', 'spectral_hit', 'blessed_aura', 'magic_resistant'],
  },
  volcanic: {
    ground: Terrain.Dirt,
    path: Terrain.Marsh,
    barrierWater: Terrain.Water,
    barrierRock: Terrain.Rock,
    hasTrees: false,
    bossFamily: 'redglass-drake',
    mobFamily: 'cinderling',
    mobFamilies: ['cinderling', 'ash-weaver', 'doom-knight', 'cinderhorn'],
    bossFamilies: ['redglass-drake', 'anvilmaw-smith', 'cinderhorn'],
    eliteMods: ['fire_enchanted', 'stone_skin', 'extra_fast', 'spectral_hit'],
  },
};

/** Mulberry32 PRNG returning [0, 1) float. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(seed: number, x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothNoise(seed: number, x: number, y: number, cell: number): number {
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

/** Check if two coordinates are connected through unblocked tiles using 4-way BFS. */
export function isPathReachable(
  w: number,
  h: number,
  blocked: Uint8Array,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
): boolean {
  if (blocked[startY * w + startX] || blocked[targetY * w + targetX]) return false;
  if (startX === targetX && startY === targetY) return true;

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h * 2);
  let head = 0;
  let tail = 0;

  queue[tail++] = startX;
  queue[tail++] = startY;
  visited[startY * w + startX] = 1;

  const DIRS = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];

  while (head < tail) {
    const cx = queue[head++];
    const cy = queue[head++];

    if (cx === targetX && cy === targetY) return true;

    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const idx = ny * w + nx;
        if (!visited[idx] && !blocked[idx]) {
          visited[idx] = 1;
          queue[tail++] = nx;
          queue[tail++] = ny;
        }
      }
    }
  }

  return false;
}

/** Flood fill all reachable tiles from (startX, startY). */
export function floodFillReachable(
  w: number,
  h: number,
  blocked: Uint8Array,
  startX: number,
  startY: number,
): Uint8Array {
  const reachable = new Uint8Array(w * h);
  if (blocked[startY * w + startX]) return reachable;

  const queue = new Int32Array(w * h * 2);
  let head = 0;
  let tail = 0;

  queue[tail++] = startX;
  queue[tail++] = startY;
  reachable[startY * w + startX] = 1;

  const DIRS = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];

  while (head < tail) {
    const cx = queue[head++];
    const cy = queue[head++];

    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const idx = ny * w + nx;
        if (!reachable[idx] && !blocked[idx]) {
          reachable[idx] = 1;
          queue[tail++] = nx;
          queue[tail++] = ny;
        }
      }
    }
  }

  return reachable;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Generate a procedural expedition map with guaranteed reachability,
 * deterministic layout, biomes, shrines, camps, and boss lair.
 */
export function generateExpeditionMap(opts: ExpeditionOptions): MapDoc {
  const seed = opts.seed >>> 0;
  const rng = mulberry32(seed);

  const randInt = (min: number, max: number): number => {
    return Math.floor(rng() * (max - min + 1)) + min;
  };

  const biomeKey: NonNullable<ExpeditionOptions['biome']> = opts.biome ?? 'forest';
  const biome = BIOMES[biomeKey] ?? BIOMES.forest;
  const difficulty = Math.max(0, Math.min(2, opts.difficulty ?? 0));
  const w = opts.size === 96 ? 96 : 64;
  const h = w;
  const n = w * h;

  const terrain = new Uint8Array(n);
  const height = new Uint8Array(n);
  const reserved = new Uint8Array(n); // 1 = reserved for paths/units/clearing, no trees/rocks

  // 1. Organic Base Terrain & Height
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const elev = smoothNoise(seed + 11, x, y, 14) * 0.7 + smoothNoise(seed + 23, x, y, 6) * 0.3;
      height[idx] = elev < 0.35 ? 0 : elev < 0.6 ? 1 : elev < 0.8 ? 2 : 3;

      const moist = smoothNoise(seed + 37, x, y, 10);
      if (biomeKey === 'forest') {
        if (moist < 0.18) terrain[idx] = biome.barrierWater;
        else if (moist > 0.82) terrain[idx] = biome.barrierRock;
        else if (moist > 0.65) terrain[idx] = Terrain.Dirt;
        else terrain[idx] = Terrain.Grass;
      } else if (biomeKey === 'marsh') {
        if (moist < 0.28) terrain[idx] = biome.barrierWater;
        else if (moist > 0.85) terrain[idx] = biome.barrierRock;
        else if (moist > 0.6) terrain[idx] = Terrain.Dirt;
        else terrain[idx] = Terrain.Marsh;
      } else if (biomeKey === 'desert') {
        if (moist < 0.08) terrain[idx] = biome.barrierWater;
        else if (moist > 0.76) terrain[idx] = biome.barrierRock;
        else if (moist > 0.55) terrain[idx] = Terrain.Grass;
        else terrain[idx] = Terrain.Dirt;
      } else if (biomeKey === 'oasis') {
        if (moist < 0.22) terrain[idx] = biome.barrierWater;
        else if (moist > 0.82) terrain[idx] = biome.barrierRock;
        else if (moist > 0.5) terrain[idx] = Terrain.Dirt;
        else terrain[idx] = Terrain.Grass;
      } else if (biomeKey === 'highlands') {
        if (moist < 0.12) terrain[idx] = biome.barrierWater;
        else if (moist > 0.72) terrain[idx] = biome.barrierRock;
        else if (moist > 0.45) terrain[idx] = Terrain.Grass;
        else terrain[idx] = Terrain.Dirt;
      } else if (biomeKey === 'volcanic') {
        if (moist < 0.2) terrain[idx] = biome.barrierWater;
        else if (moist > 0.7) terrain[idx] = biome.barrierRock;
        else if (moist > 0.5) terrain[idx] = Terrain.Marsh;
        else terrain[idx] = Terrain.Dirt;
      } else {
        // crypt
        if (moist < 0.12) terrain[idx] = biome.barrierWater;
        else if (moist > 0.78) terrain[idx] = biome.barrierRock;
        else if (moist > 0.6) terrain[idx] = Terrain.Marsh;
        else terrain[idx] = Terrain.Dirt;
      }

      // Outer map border is impassable rock or water
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        terrain[idx] = biome.barrierRock;
      }
    }
  }

  // 2. Define Key Landmarks
  // Start Camp at (8, 8)
  const startX = 8;
  const startY = 8;

  // Boss Lair in opposite quadrant (w - 12, h - 12)
  const bossX = w - 12;
  const bossY = h - 12;

  // 3-4 Monster Camps along the route
  const campCoords: [number, number][] = [
    [Math.round(w * 0.3) + randInt(-2, 2), Math.round(h * 0.25) + randInt(-2, 2)],
    [Math.round(w * 0.5) + randInt(-2, 2), Math.round(h * 0.45) + randInt(-2, 2)],
    [Math.round(w * 0.4) + randInt(-2, 2), Math.round(h * 0.65) + randInt(-2, 2)],
    [Math.round(w * 0.68) + randInt(-2, 2), Math.round(h * 0.62) + randInt(-2, 2)],
  ];

  // Shrines (3 along paths)
  const shrineDefs: ShrineDef[] = [
    { x: Math.round(w * 0.22), y: Math.round(h * 0.15), kind: 'healing', cooldown: 750 },
    { x: Math.round(w * 0.54), y: Math.round(h * 0.35), kind: 'mana', cooldown: 750 },
    { x: Math.round(w * 0.6), y: Math.round(h * 0.75), kind: 'combat', cooldown: 750 },
  ];

  // Connected Act System: Waypoints & Boundary Exits
  const waypointDefs: WaypointDef[] = [
    { id: `wp_${biomeKey}_outpost`, name: `${capitalize(biomeKey)} Outpost Waypoint`, x: Math.round(w * 0.16), y: Math.round(h * 0.12) },
  ];

  const exitDefs: ZoneExitDef[] = [
    { x: bossX + 2, y: bossY + 2, targetMap: `${biomeKey}_depths`, targetX: 4, targetY: 4, label: 'Descent into Deeper Lair', kind: 'cave' },
  ];

  // HoMM III Adventure Objects
  const adventureObjectDefs: AdventureObjectDef[] = [
    { x: Math.round(w * 0.35), y: Math.round(h * 0.26), kind: 'watermill', rewardGold: 150 },
    { x: Math.round(w * 0.46), y: Math.round(h * 0.52), kind: 'magic_well' },
    { x: Math.round(w * 0.68), y: Math.round(h * 0.42), kind: 'creature_bank', rewardGold: 400, guardPower: 3, rewardArtifact: true },
  ];

  // Helper to carve a circular clearing
  const carveClearing = (cx: number, cy: number, radius: number, groundTile: number) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius + 1) {
          const px = cx + dx;
          const py = cy + dy;
          if (px > 0 && px < w - 1 && py > 0 && py < h - 1) {
            const idx = py * w + px;
            terrain[idx] = groundTile;
            height[idx] = 1;
            reserved[idx] = 1;
          }
        }
      }
    }
  };

  // Carve Start Clearing (radius 5)
  carveClearing(startX, startY, 5, biome.ground);

  // Carve Boss Lair Clearing (radius 6)
  carveClearing(bossX, bossY, 6, biome.path);

  // Carve Monster Camps (radius 3)
  for (const [cx, cy] of campCoords) {
    carveClearing(cx, cy, 3, biome.ground);
  }

  // Carve Shrines clearings (radius 2)
  for (const s of shrineDefs) {
    carveClearing(s.x, s.y, 2, biome.path);
  }

  // Carve Adventure Objects clearings (radius 2)
  for (const o of adventureObjectDefs) {
    carveClearing(o.x, o.y, 2, biome.path);
  }
  for (const wp of waypointDefs) {
    carveClearing(wp.x, wp.y, 2, biome.path);
  }

  // Helper to carve connecting path with variable width
  const carvePath = (x0: number, y0: number, x1: number, y1: number, pathWidth = 1, isChokepoint = false) => {
    let currX = x0;
    let currY = y0;

    const points: [number, number][] = [[currX, currY]];
    while (currX !== x1 || currY !== y1) {
      const dx = x1 - currX;
      const dy = y1 - currY;

      // Deterministic slight meander
      const stepX = dx !== 0 && (dy === 0 || rng() < 0.5);
      if (stepX) {
        currX += Math.sign(dx);
      } else {
        currY += Math.sign(dy);
      }
      points.push([currX, currY]);
    }

    const midIdx = Math.floor(points.length / 2);

    for (let pIdx = 0; pIdx < points.length; pIdx++) {
      const [px, py] = points[pIdx];
      // At chokepoint halfway, narrow the width to 0 (single tile)
      const isNarrow = isChokepoint && Math.abs(pIdx - midIdx) <= 2;
      const curWidth = isNarrow ? 0 : pathWidth;

      for (let dy = -curWidth; dy <= curWidth; dy++) {
        for (let dx = -curWidth; dx <= curWidth; dx++) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1) {
            const idx = ny * w + nx;
            terrain[idx] = biome.path;
            height[idx] = 1;
            reserved[idx] = 1;
          }
        }
      }

      // If chokepoint, place barrier flanking the single tile
      if (isNarrow) {
        const flanks = [
          [px + 1, py],
          [px - 1, py],
          [px, py + 1],
          [px, py - 1],
        ];
        for (const [fx, fy] of flanks) {
          if (fx > 0 && fx < w - 1 && fy > 0 && fy < h - 1 && (fx !== px || fy !== py)) {
            const fIdx = fy * w + fx;
            if (!reserved[fIdx]) {
              terrain[fIdx] = biome.barrierRock;
            }
          }
        }
      }
    }
  };

  // Connect paths:
  // Start -> Camp 0
  carvePath(startX, startY, campCoords[0][0], campCoords[0][1], 1, false);
  // Camp 0 -> Camp 1 (with chokepoint)
  carvePath(campCoords[0][0], campCoords[0][1], campCoords[1][0], campCoords[1][1], 1, true);
  // Camp 1 -> Camp 2
  carvePath(campCoords[1][0], campCoords[1][1], campCoords[2][0], campCoords[2][1], 1, false);
  // Camp 1 -> Camp 3 (with chokepoint)
  carvePath(campCoords[1][0], campCoords[1][1], campCoords[3][0], campCoords[3][1], 1, true);
  // Camp 2 -> Camp 3
  carvePath(campCoords[2][0], campCoords[2][1], campCoords[3][0], campCoords[3][1], 1, false);
  // Camp 3 -> Boss Lair
  carvePath(campCoords[3][0], campCoords[3][1], bossX, bossY, 1, true);

  // Connect Shrines to nearest camp / path
  carvePath(shrineDefs[0].x, shrineDefs[0].y, campCoords[0][0], campCoords[0][1], 1, false);
  carvePath(shrineDefs[1].x, shrineDefs[1].y, campCoords[1][0], campCoords[1][1], 1, false);
  carvePath(shrineDefs[2].x, shrineDefs[2].y, campCoords[3][0], campCoords[3][1], 1, false);

  // Connect Adventure Objects & Waypoints
  for (const o of adventureObjectDefs) {
    carvePath(o.x, o.y, startX, startY, 1, false);
  }
  for (const wp of waypointDefs) {
    carvePath(wp.x, wp.y, startX, startY, 1, false);
  }

  // 3. Buildings (Start Camp)
  // Inn (Tavern) at (5, 5), Shop at (10, 5) -> 2x2 footprint each
  const innX = 5;
  const innY = 5;
  const shopX = 10;
  const shopY = 5;

  const objects: (MapObject & { owner?: number; hp?: number })[] = [
    { kind: ObjectKind.House, x: innX, y: innY, owner: 0, hp: 100 },
    { kind: ObjectKind.House, x: shopX, y: shopY, owner: 0, hp: 100 },
  ];

  // Mark building footprints as reserved so units or trees are not placed inside
  for (const b of objects) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        reserved[(b.y + dy) * w + (b.x + dx)] = 1;
      }
    }
  }

  // 4. Place Scenery Trees / Pillars / Obstacles outside reserved paths
  const treeDensity = biome.hasTrees ? (w === 96 ? 240 : 120) : (w === 96 ? 60 : 30);
  for (let i = 0; i < treeDensity; i++) {
    const tx = randInt(2, w - 3);
    const ty = randInt(2, h - 3);
    const idx = ty * w + tx;
    if (!reserved[idx] && terrain[idx] !== biome.barrierWater && terrain[idx] !== biome.barrierRock) {
      objects.push({ kind: ObjectKind.Tree, x: tx, y: ty });
    }
  }

  // 5. Units
  const units: UnitDef[] = [];

  // Hero at (8, 8)
  units.push({ kind: Kind.Hero, team: 0, x: startX, y: startY, vip: true });

  // 2 Companion units (team 0)
  units.push({ kind: Kind.Warrior, team: 0, x: startX - 1, y: startY });
  units.push({ kind: Kind.Archer, team: 0, x: startX, y: startY - 1 });

  // Monster Camps (team 1)
  let unitGroup = 2;
  let packId = 1;
  const mobPool = biome.mobFamilies && biome.mobFamilies.length > 0 ? biome.mobFamilies : [biome.mobFamily];

  for (let c = 0; c < campCoords.length; c++) {
    const [cx, cy] = campCoords[c];
    const grp = unitGroup++;
    const pck = packId++;
    const campMob = mobPool[c % mobPool.length];

    // Camp Leader
    const leaderKind = c % 2 === 0 ? Kind.Gnoll : Kind.Archer;
    units.push({
      kind: leaderKind,
      team: 1,
      x: cx,
      y: cy,
      group: grp,
      pack: pck,
      tier: Math.min(5, 2 + difficulty),
      family: campMob,
    });

    // 2 Minions
    const offsets = [
      [1, 0],
      [0, 1],
    ];
    for (const [ox, oy] of offsets) {
      units.push({
        kind: Kind.Imp,
        team: 1,
        x: cx + ox,
        y: cy + oy,
        group: grp,
        pack: pck,
        tier: Math.min(5, 1 + difficulty),
        family: campMob,
      });
    }
  }

  // Boss Unit & Escort in Boss Lair
  const bossGroup = unitGroup++;
  const bossPack = packId++;

  // Deterministic boss modifiers from theme-appropriate pool
  const candidateMods: BossModId[] = biome.eliteMods && biome.eliteMods.length >= 2 ? [...biome.eliteMods] : [...BOSS_MOD_IDS];
  const mod1Idx = randInt(0, candidateMods.length - 1);
  const mod1 = candidateMods.splice(mod1Idx, 1)[0];
  const mod2Idx = randInt(0, candidateMods.length - 1);
  const mod2 = candidateMods.splice(mod2Idx, 1)[0];
  const bossMods: string[] = [mod1, mod2];

  const bossPool = biome.bossFamilies && biome.bossFamilies.length > 0 ? biome.bossFamilies : [biome.bossFamily];
  const chosenBossFamily = bossPool[randInt(0, bossPool.length - 1)];

  const bossIdx = units.length;
  units.push({
    kind: Kind.Golem,
    team: 1,
    x: bossX,
    y: bossY,
    group: bossGroup,
    pack: bossPack,
    vip: true,
    tier: Math.min(5, 3 + difficulty),
    family: chosenBossFamily,
    bossMods,
  });

  // Boss Minion Escort (3 units)
  const escortMob = mobPool[campCoords.length % mobPool.length];
  const escortOffsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
  ];
  for (const [ox, oy] of escortOffsets) {
    units.push({
      kind: Kind.Gnoll,
      team: 1,
      x: bossX + ox,
      y: bossY + oy,
      group: bossGroup,
      pack: bossPack,
      tier: Math.min(5, 2 + difficulty),
      family: escortMob,
    });
  }

  // 6. Ensure Pathability & Unblock Critical Tiles
  // Clear any accidental blocking objects at unit positions or shrines
  for (const u of units) {
    const idx = u.y * w + u.x;
    terrain[idx] = biome.path;
  }
  for (const s of shrineDefs) {
    const idx = s.y * w + s.x;
    terrain[idx] = biome.path;
  }

  // Remove any Tree objects sharing tile with units, shrines, or buildings
  const criticalTiles = new Set<number>();
  for (const u of units) criticalTiles.add(u.y * w + u.x);
  for (const s of shrineDefs) criticalTiles.add(s.y * w + s.x);
  for (const o of adventureObjectDefs) criticalTiles.add(o.y * w + o.x);
  for (const wp of waypointDefs) criticalTiles.add(wp.y * w + wp.x);
  for (const ex of exitDefs) criticalTiles.add(ex.y * w + ex.x);
  for (const b of objects) {
    if (b.kind === ObjectKind.House) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          criticalTiles.add((b.y + dy) * w + (b.x + dx));
        }
      }
    }
  }

  const filteredObjects = objects.filter((o) => {
    if (o.kind === ObjectKind.Tree && criticalTiles.has(o.y * w + o.x)) {
      return false;
    }
    return true;
  });

  // Validate BFS Connectivity from Hero to Boss and Shrines
  let currentBlocked = bakeBlocked(w, h, terrain, filteredObjects);
  const reachable = floodFillReachable(w, h, currentBlocked, startX, startY);

  const targetsToCheck: [number, number][] = [
    [bossX, bossY],
    ...shrineDefs.map((s): [number, number] => [s.x, s.y]),
    ...adventureObjectDefs.map((o): [number, number] => [o.x, o.y]),
    ...waypointDefs.map((w): [number, number] => [w.x, w.y]),
    ...campCoords,
  ];

  for (const [tx, ty] of targetsToCheck) {
    if (!reachable[ty * w + tx]) {
      // Auto-heal path: carve direct corridor from start to target
      let cx = startX;
      let cy = startY;
      while (cx !== tx || cy !== ty) {
        const dx = tx - cx;
        const dy = ty - cy;
        if (dx !== 0 && (dy === 0 || rng() < 0.5)) cx += Math.sign(dx);
        else cy += Math.sign(dy);

        const idx = cy * w + cx;
        terrain[idx] = biome.path;
      }
    }
  }

  // Final blocked recalculation
  currentBlocked = bakeBlocked(w, h, terrain, filteredObjects);

  // 7. Declarative Triggers
  const triggers = [
    {
      id: 'briefing',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'yes', a: [] }, op: 0, b: { k: 'constant', a: [1] } }],
      acts: [
        { k: 'message', a: [1] },
        { k: 'giveMoney', a: [0, 400] },
      ],
    },
    {
      id: 'boss-slain',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'unitAlive', a: [bossIdx] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [{ k: 'win', a: [] }],
    },
    {
      id: 'hero-fallen',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'unitAlive', a: [0] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [{ k: 'lose', a: [1] }],
    },
  ];

  // 8. Text Table
  const title = `Expedition: ${capitalize(biomeKey)} Wilds`;
  const text: Record<string, string> = {
    title,
    body: `Venture forth into the untamed ${biomeKey}. Seek out ancient shrines, breach the chokepoints, and slay the elite boss in its lair.`,
    'obj.0': 'Slay the elite boss in the distant lair',
    'msg.1': `Welcome to the ${biomeKey} expedition outpost. Secure the roads and destroy the beast in its lair.`,
    'msg.1.who': 'Outpost Scout',
    win: 'The boss is slain and the expedition is a triumph!',
    'fail.1': 'Your hero has fallen in the wilderness.',
  };

  // 9. Regions & Towns
  const regions: Region[] = [
    { name: 'Start Camp', x1: 4, y1: 4, x2: 12, y2: 12 },
    { name: 'Boss Lair', x1: bossX - 5, y1: bossY - 5, x2: bossX + 5, y2: bossY + 5 },
  ];

  const towns = [
    {
      name: 'Expedition Outpost',
      tavern: 0,
      shop: 1,
      tiers: [1, Math.min(5, 2 + difficulty)] as [number, number],
    },
  ];

  // 10. Assemble MapDoc with RLE arrays
  const doc: MapDoc = {
    format: MAP_FORMAT,
    version: MAP_VERSION,
    name: title,
    w,
    h,
    terrain: rleEncode(terrain),
    height: rleEncode(height),
    objects: filteredObjects,
    units,
    regions,
    players: ['Wayfarers', 'Monsters', 'Neutral', 'Allies'],
    triggers,
    text,
    towns,
    shrines: shrineDefs,
    waypoints: waypointDefs,
    exits: exitDefs,
    adventureObjects: adventureObjectDefs,
  };

  // Validate the generated document
  const errs = validate(doc);
  if (errs.length > 0) {
    throw new Error(`Generated expedition map failed validation:\n${errs.join('\n')}`);
  }

  return doc;
}
