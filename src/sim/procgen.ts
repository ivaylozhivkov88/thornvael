import { type MapObject, Terrain } from '../map';
import { BOSS_MOD_IDS, MAP_FORMAT, MAP_VERSION, type MapDoc, type Region, type ShrineDef, type UnitDef, rleEncode, validate } from '../mapdoc';
import { Kind } from './combat';
import { Rng } from './rng';

/**
 * Endless Depths: a seeded level of rooms and corridors. Same seed, same level, every time.
 * Output is an ordinary v2 map document, so the loader, validator and scripts treat it like any mission.
 * Uses only the sim Rng (no Math.random), so generation is replay safe.
 */
export interface DepthsOptions {
  seed: number;
  /** Depth 1 and up; raises monster tiers. */
  depth?: number;
  size?: 48 | 64 | 96;
}

const DEPTH_FAMILIES = ['ruin-mite', 'hollow-knight', 'greater-mummy', 'fallen-shaman'] as const;
const DEPTH_BOSS_FAMILIES = ['hollow-king', 'greater-mummy', 'silt-colossus'] as const;

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

const cx = (r: Room): number => r.x + (r.w >> 1);
const cy = (r: Room): number => r.y + (r.h >> 1);
const near = (a: Room, b: Room): boolean => a.x < b.x + b.w + 3 && b.x < a.x + a.w + 3 && a.y < b.y + b.h + 3 && b.y < a.y + a.h + 3;

export function generateDepthsLevel(opts: DepthsOptions): MapDoc {
  const rng = new Rng((opts.seed ^ 0x9e3779b9) >>> 0);
  const ri = (min: number, max: number): number => min + rng.int(max - min + 1);
  const depth = Math.max(1, Math.floor(opts.depth ?? 1));
  const w = opts.size ?? 64;
  const h = w;
  const n = w * h;
  const terrain = new Uint8Array(n).fill(Terrain.Rock);
  const height = new Uint8Array(n).fill(1);

  // Rooms: random non-touching rectangles, sorted left to right so the chain reads as a route.
  const rooms: Room[] = [];
  const target = w === 96 ? 14 : w === 64 ? 9 : 6;
  for (let a = 0; a < 200 && rooms.length < target; a++) {
    const rw = ri(6, 10);
    const rh = ri(6, 10);
    const r: Room = { x: ri(2, w - rw - 3), y: ri(2, h - rh - 3), w: rw, h: rh };
    if (!rooms.some((o) => near(r, o))) rooms.push(r);
  }
  // Fallback corners so a degenerate roll can never leave fewer than four rooms.
  const corners: Room[] = [
    { x: 3, y: 3, w: 8, h: 8 },
    { x: w - 12, y: 3, w: 8, h: 8 },
    { x: 3, y: h - 12, w: 8, h: 8 },
    { x: w - 12, y: h - 12, w: 8, h: 8 },
  ];
  for (const c of corners) if (rooms.length < 4 && !rooms.some((o) => near(c, o))) rooms.push(c);
  rooms.sort((a, b) => a.x - b.x || a.y - b.y);

  const floorTile = depth % 2 === 0 ? Terrain.Marsh : Terrain.Dirt;
  const carve = (x: number, y: number): void => {
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) terrain[y * w + x] = floorTile;
  };
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y);
  const corridor = (a: Room, b: Room): void => {
    let x = cx(a);
    let y = cy(a);
    const tx = cx(b);
    const ty = cy(b);
    const legs: ['x' | 'y', number][] = rng.int(2) === 0 ? [['x', tx], ['y', ty]] : [['y', ty], ['x', tx]];
    for (const [axis, to] of legs) {
      while ((axis === 'x' ? x : y) !== to) {
        if (axis === 'x') x += Math.sign(to - x);
        else y += Math.sign(to - y);
        carve(x, y);
        carve(x + 1, y);
        carve(x, y + 1);
      }
    }
  };
  for (let i = 1; i < rooms.length; i++) corridor(rooms[i - 1], rooms[i]);
  if (rooms.length > 4) corridor(rooms[0], rooms[2 + rng.int(rooms.length - 3)]); // a loop, so the level is not one line

  // Units: hero and two companions in the first room, a pack per middle room, the super-unique in the last.
  const units: UnitDef[] = [];
  const taken = new Set<number>();
  const put = (u: UnitDef): number => {
    let { x, y } = u;
    for (let k = 0; k < 40 && taken.has(y * w + x); k++) {
      if (k % 2 === 0) x++;
      else y++;
    }
    taken.add(y * w + x);
    units.push({ ...u, x, y });
    return units.length - 1;
  };
  const start = rooms[0];
  put({ kind: Kind.Hero, team: 0, x: cx(start), y: cy(start), vip: true });
  put({ kind: Kind.Warrior, team: 0, x: cx(start) - 1, y: cy(start) });
  put({ kind: Kind.Archer, team: 0, x: cx(start), y: cy(start) - 1 });

  const tierBase = Math.min(4, 1 + Math.floor((depth - 1) / 2));
  let group = 2;
  let pack = 1;
  for (let i = 1; i < rooms.length - 1; i++) {
    const r = rooms[i];
    const family = DEPTH_FAMILIES[rng.int(DEPTH_FAMILIES.length)];
    const g = group++;
    const p = pack++;
    put({ kind: i % 2 === 0 ? Kind.Gnoll : Kind.Archer, team: 1, x: cx(r), y: cy(r), group: g, pack: p, tier: Math.min(5, tierBase + 1), family });
    const minions = 2 + (rng.int(3) === 0 ? 1 : 0);
    for (let m = 0; m < minions; m++) put({ kind: Kind.Imp, team: 1, x: cx(r) + 1 + (m & 1), y: cy(r) + (m >> 1), group: g, pack: p, tier: tierBase, family });
  }

  const lair = rooms[rooms.length - 1];
  const bossGroup = group++;
  const bossPack = pack++;
  const mods: string[] = [...BOSS_MOD_IDS];
  const m1 = mods.splice(rng.int(mods.length), 1)[0];
  const m2 = mods.splice(rng.int(mods.length), 1)[0];
  const bossFamily = DEPTH_BOSS_FAMILIES[rng.int(DEPTH_BOSS_FAMILIES.length)];
  const bossIdx = put({ kind: Kind.Golem, team: 1, x: cx(lair), y: cy(lair), group: bossGroup, pack: bossPack, vip: true, tier: Math.min(5, tierBase + 2), family: bossFamily, bossMods: [m1, m2] });
  const escortFamily = DEPTH_FAMILIES[rng.int(DEPTH_FAMILIES.length)];
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1]]) {
    put({ kind: Kind.Gnoll, team: 1, x: cx(lair) + ox, y: cy(lair) + oy, group: bossGroup, pack: bossPack, tier: Math.min(5, tierBase + 1), family: escortFamily });
  }

  const shrineRoom = rooms[Math.max(1, rooms.length >> 1)];
  const shrines: ShrineDef[] = [{ x: shrineRoom.x + 1, y: shrineRoom.y + 1, kind: rng.int(2) === 0 ? 'healing' : 'mana', cooldown: 750 }];

  const objects: MapObject[] = [];
  const triggers = [
    {
      id: 'briefing',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'yes', a: [] }, op: 0, b: { k: 'constant', a: [1] } }],
      acts: [{ k: 'message', a: [1] }],
    },
    {
      id: 'unique-slain',
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
  const title = `Endless Depths ${depth}`;
  const text: Record<string, string> = {
    title,
    body: 'The stair winds down into a vault no one has walked before. Find its warden and end it.',
    'obj.0': 'Slay the warden of the depths',
    'msg.1': 'Cold air, old stone. Something large is waiting at the far end.',
    'msg.1.who': 'Your Own Thoughts',
    win: 'The warden falls. The way down is open.',
    'fail.1': 'Your hero has fallen in the dark.',
  };
  const regions: Region[] = [
    { name: 'Stair', x1: start.x, y1: start.y, x2: start.x + start.w, y2: start.y + start.h },
    { name: 'Warden Vault', x1: lair.x, y1: lair.y, x2: lair.x + lair.w, y2: lair.y + lair.h },
  ];
  const doc: MapDoc = {
    format: MAP_FORMAT,
    version: MAP_VERSION,
    name: title,
    w,
    h,
    terrain: rleEncode(terrain),
    height: rleEncode(height),
    objects,
    units,
    regions,
    players: ['Delvers', 'Monsters', 'Neutral', 'Allies'],
    triggers,
    text,
    shrines,
  };
  const errs = validate(doc);
  if (errs.length > 0) throw new Error(`Generated depths level failed validation:\n${errs.join('\n')}`);
  return doc;
}
