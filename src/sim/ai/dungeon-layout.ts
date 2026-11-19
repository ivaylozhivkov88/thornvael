import { Rng } from '../rng';

export const DUNGEON_TILE = {
  WALL: 0,
  FLOOR: 1,
  STAIRS_UP: 2,
  STAIRS_DOWN: 3,
  CHEST: 4,
  MINIBOSS_SPAWN: 5,
} as const;

export interface DungeonRoom {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  kind: 'entrance' | 'normal' | 'miniboss' | 'chest' | 'exit';
}

export interface DungeonFloor {
  floorIndex: number; // 0-based
  width: number;
  height: number;
  tiles: Uint8Array;
  rooms: DungeonRoom[];
  stairsUp: { x: number; y: number };
  stairsDown: { x: number; y: number } | null;
  minibossRoomId: number | null;
  chestRoomId: number | null;
}

export interface DungeonRun {
  seed: number;
  biome: string;
  floorCount: number;
  floors: DungeonFloor[];
}

export interface DungeonGenerateOptions {
  seed: number;
  biome?: string;
  floorCount?: number; // clamped to 3..5
  width?: number; // default 48
  height?: number; // default 48
}

function carveRoom(tiles: Uint8Array, w: number, r: DungeonRoom): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      tiles[y * w + x] = DUNGEON_TILE.FLOOR;
    }
  }
}

function carveCorridor(tiles: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number, horizontalFirst: boolean): void {
  let x = x0;
  let y = y0;
  if (horizontalFirst) {
    while (x !== x1) {
      tiles[y * w + x] = DUNGEON_TILE.FLOOR;
      x += x < x1 ? 1 : -1;
    }
    while (y !== y1) {
      tiles[y * w + x] = DUNGEON_TILE.FLOOR;
      y += y < y1 ? 1 : -1;
    }
  } else {
    while (y !== y1) {
      tiles[y * w + x] = DUNGEON_TILE.FLOOR;
      y += y < y1 ? 1 : -1;
    }
    while (x !== x1) {
      tiles[y * w + x] = DUNGEON_TILE.FLOOR;
      x += x < x1 ? 1 : -1;
    }
  }
  tiles[y1 * w + x1] = DUNGEON_TILE.FLOOR;
}

function roomsOverlap(a: DungeonRoom, b: DungeonRoom, pad = 2): boolean {
  return (
    a.x - pad < b.x + b.w &&
    a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h &&
    a.y + a.h + pad > b.y
  );
}

/**
 * Deterministic Side Dungeon / Crypt Generator (E5).
 * Generates 3–5 connected floors with rooms, corridors, miniboss, and treasure chest.
 */
export function generateSideDungeon(opts: DungeonGenerateOptions): DungeonRun {
  const rng = new Rng(opts.seed);
  const floorCount = Math.max(3, Math.min(5, (opts.floorCount ?? (3 + rng.int(3))) | 0));
  const width = Math.max(32, (opts.width ?? 48) | 0);
  const height = Math.max(32, (opts.height ?? 48) | 0);
  const biome = opts.biome ?? 'crypt';

  const floors: DungeonFloor[] = [];

  for (let f = 0; f < floorCount; f++) {
    const tiles = new Uint8Array(width * height);
    const rooms: DungeonRoom[] = [];
    const targetRooms = 7 + rng.int(4); // 7..10 rooms

    for (let attempt = 0; attempt < 80 && rooms.length < targetRooms; attempt++) {
      const rw = 5 + rng.int(5); // 5..9
      const rh = 5 + rng.int(5);
      const rx = 2 + rng.int(Math.max(1, width - rw - 4));
      const ry = 2 + rng.int(Math.max(1, height - rh - 4));
      const candidate: DungeonRoom = {
        id: rooms.length,
        x: rx,
        y: ry,
        w: rw,
        h: rh,
        cx: rx + Math.floor(rw / 2),
        cy: ry + Math.floor(rh / 2),
        kind: rooms.length === 0 ? 'entrance' : 'normal',
      };
      if (!rooms.some((existing) => roomsOverlap(existing, candidate, 2))) {
        rooms.push(candidate);
        carveRoom(tiles, width, candidate);
      }
    }

    // Fallback guarantee: at least 3 rooms if tight map
    if (rooms.length < 3) {
      const fallback: DungeonRoom[] = [
        { id: 0, x: 3, y: 3, w: 6, h: 6, cx: 6, cy: 6, kind: 'entrance' },
        { id: 1, x: width - 12, y: 4, w: 6, h: 6, cx: width - 9, cy: 7, kind: 'normal' },
        { id: 2, x: width - 12, y: height - 12, w: 7, h: 7, cx: width - 9, cy: height - 9, kind: 'normal' },
      ];
      rooms.length = 0;
      tiles.fill(DUNGEON_TILE.WALL);
      for (const r of fallback) {
        rooms.push(r);
        carveRoom(tiles, width, r);
      }
    }

    // Connect rooms in sequence so the graph is 100% connected
    for (let i = 1; i < rooms.length; i++) {
      const prev = rooms[i - 1];
      const curr = rooms[i];
      carveCorridor(tiles, width, prev.cx, prev.cy, curr.cx, curr.cy, (rng.int(2) === 0));
    }

    // Sort non-entrance rooms by Manhattan distance from entrance
    const entrance = rooms[0];
    const byDist = rooms
      .slice(1)
      .map((r) => ({ r, dist: Math.abs(r.cx - entrance.cx) + Math.abs(r.cy - entrance.cy) }))
      .sort((a, b) => b.dist - a.dist || a.r.id - b.r.id);

    const stairsUp = { x: entrance.cx, y: entrance.cy };
    tiles[stairsUp.y * width + stairsUp.x] = DUNGEON_TILE.STAIRS_UP;

    const isFinalFloor = f === floorCount - 1;
    let stairsDown: { x: number; y: number } | null = null;
    let minibossRoomId: number | null = null;
    let chestRoomId: number | null = null;

    if (!isFinalFloor) {
      const exitRoom = byDist[0].r;
      exitRoom.kind = 'exit';
      stairsDown = { x: exitRoom.cx, y: exitRoom.cy };
      tiles[stairsDown.y * width + stairsDown.x] = DUNGEON_TILE.STAIRS_DOWN;

      if (byDist.length > 1) {
        const chestRoom = byDist[1].r;
        chestRoom.kind = 'chest';
        chestRoomId = chestRoom.id;
        tiles[chestRoom.cy * width + chestRoom.cx] = DUNGEON_TILE.CHEST;
      }
    } else {
      const bossRoom = byDist[0].r;
      bossRoom.kind = 'miniboss';
      minibossRoomId = bossRoom.id;
      tiles[bossRoom.cy * width + bossRoom.cx] = DUNGEON_TILE.MINIBOSS_SPAWN;

      const chestRoom = (byDist[1] ?? byDist[0]).r;
      if (chestRoom.id !== bossRoom.id) {
        chestRoom.kind = 'chest';
        chestRoomId = chestRoom.id;
        tiles[chestRoom.cy * width + chestRoom.cx] = DUNGEON_TILE.CHEST;
      } else {
        chestRoomId = bossRoom.id;
        tiles[bossRoom.cy * width + Math.min(width - 2, bossRoom.cx + 1)] = DUNGEON_TILE.CHEST;
      }
    }

    floors.push({
      floorIndex: f,
      width,
      height,
      tiles,
      rooms,
      stairsUp,
      stairsDown,
      minibossRoomId,
      chestRoomId,
    });
  }

  return {
    seed: opts.seed >>> 0,
    biome,
    floorCount,
    floors,
  };
}

/** Verify all walkable tiles and rooms on a floor are reachable from stairsUp via BFS. */
export function isDungeonFloorConnected(floor: DungeonFloor): boolean {
  const { width, height, tiles, stairsUp, rooms } = floor;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [stairsUp.y * width + stairsUp.x];
  visited[queue[0]] = 1;

  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const x = idx % width;
    const y = (idx / width) | 0;
    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x + 1 < width ? idx + 1 : -1,
      y > 0 ? idx - width : -1,
      y + 1 < height ? idx + width : -1,
    ];
    for (let i = 0; i < 4; i++) {
      const n = neighbors[i];
      if (n >= 0 && !visited[n] && tiles[n] !== DUNGEON_TILE.WALL) {
        visited[n] = 1;
        queue.push(n);
      }
    }
  }

  return rooms.every((r) => visited[r.cy * width + r.cx] === 1);
}

/** Deterministic 32-bit FNV-1a hash of an entire generated dungeon run. */
export function hashDungeonRun(run: DungeonRun): number {
  let h = 0x811c9dc5;
  const mix = (v: number): void => {
    h = Math.imul(h ^ (v & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193);
  };
  mix(run.seed);
  mix(run.floorCount);
  for (const f of run.floors) {
    mix(f.floorIndex);
    mix(f.width);
    mix(f.height);
    for (let i = 0; i < f.tiles.length; i++) mix(f.tiles[i]);
  }
  return h >>> 0;
}
