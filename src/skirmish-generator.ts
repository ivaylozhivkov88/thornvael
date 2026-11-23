/**
 * Random skirmish map generator: team 0 (the player) against 1-3 rival warbands from the other corners,
 * a neutral tavern and shop in the centre, shrines, neutral camps and guaranteed reachability.
 * Pure and seeded: the same options always give the same map. Only the idea (symmetric starts, a
 * contested middle) is borrowed from classic random-map generators; no assets or layouts are copied.
 */
import { bakeBlocked, ObjectKind, type MapObject } from './map';
import { BIOMES, floodFillReachable, mulberry32, smoothNoise, type ExpeditionOptions } from './map-generator';
import { MAP_FORMAT, MAP_VERSION, rleEncode, validate, type MapDoc, type Region, type ShrineDef, type UnitDef } from './mapdoc';
import { Kind } from './sim/combat';

export interface SkirmishOptions {
  seed: number;
  biome?: ExpeditionOptions['biome'];
  /** Number of warbands including yours: 2 (default), 3 or 4. */
  players?: 2 | 3 | 4;
  size?: 64 | 80;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function generateSkirmishMap(opts: SkirmishOptions): MapDoc {
  const seed = opts.seed >>> 0;
  const rng = mulberry32(seed);
  const randInt = (a: number, b: number): number => a + Math.floor(rng() * (b - a + 1));
  const biomeKey = opts.biome ?? 'forest';
  const biome = BIOMES[biomeKey] ?? BIOMES.forest;
  const w = opts.size === 80 ? 80 : 64;
  const h = w;
  const n = w * h;
  const count = opts.players === 4 ? 4 : opts.players === 3 ? 3 : 2;

  const terrain = new Uint8Array(n).fill(biome.ground);
  const height = new Uint8Array(n);
  const reserved = new Uint8Array(n);
  const inside = (x: number, y: number): boolean => x > 0 && y > 0 && x < w - 1 && y < h - 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const elev = smoothNoise(seed + 11, x, y, 14) * 0.7 + smoothNoise(seed + 23, x, y, 6) * 0.3;
      height[i] = elev < 0.4 ? 0 : elev < 0.65 ? 1 : 2;
      const moist = smoothNoise(seed + 37, x, y, 9);
      if (moist < 0.16) terrain[i] = biome.barrierWater;
      else if (moist > 0.8) terrain[i] = biome.barrierRock;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) terrain[i] = biome.barrierRock;
    }
  }

  const clear = (cx: number, cy: number, r: number, tile: number): void => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1 || !inside(cx + dx, cy + dy)) continue;
        const i = (cy + dy) * w + cx + dx;
        terrain[i] = tile;
        height[i] = 1;
        reserved[i] = 1;
      }
    }
  };
  const road = (x0: number, y0: number, x1: number, y1: number): void => {
    let x = x0;
    let y = y0;
    while (x !== x1 || y !== y1) {
      const dx = x1 - x;
      const dy = y1 - y;
      if (dx !== 0 && (dy === 0 || rng() < 0.5)) x += Math.sign(dx);
      else y += Math.sign(dy);
      for (let oy = 0; oy <= 1; oy++) {
        for (let ox = 0; ox <= 1; ox++) {
          if (!inside(x + ox, y + oy)) continue;
          const i = (y + oy) * w + x + ox;
          terrain[i] = biome.path;
          height[i] = 1;
          reserved[i] = 1;
        }
      }
    }
  };

  // Bases: you in a random corner, rivals in the others (opposite corner first).
  const m = 9;
  const corners: [number, number][] = [[m, m], [w - m - 1, h - m - 1], [w - m - 1, m], [m, h - m - 1]];
  const rot = randInt(0, 3);
  const spots = [0, 1, 2, 3].map((k) => corners[(k + rot) % 4]).slice(0, count);
  const mid = Math.floor(w / 2);
  const cx = mid + randInt(-2, 2);
  const cy = mid + randInt(-2, 2);

  for (const [bx, by] of spots) {
    clear(bx, by, 6, biome.ground);
    road(bx, by, cx, cy);
  }
  clear(cx, cy, 5, biome.path);

  const shrineDefs: ShrineDef[] = [
    { x: cx - 7, y: cy + 1, kind: 'healing', cooldown: 750 },
    { x: cx + 7, y: cy - 1, kind: 'combat', cooldown: 750 },
  ];
  for (const s of shrineDefs) {
    clear(s.x, s.y, 2, biome.path);
    road(s.x, s.y, cx, cy);
  }

  // Neutral camps halfway between each rival base and the middle.
  const camps: [number, number][] = spots.slice(1).map(([bx, by]) => [
    Math.round(bx + (cx - bx) * 0.5) + randInt(-2, 2),
    Math.round(by + (cy - by) * 0.5) + randInt(-2, 2),
  ]);
  for (const [px, py] of camps) clear(px, py, 3, biome.ground);

  // Buildings: one command hall per base, then the neutral tavern and shop (House index = array order).
  const objects: (MapObject & { owner?: number })[] = spots.map(([bx, by], k) => ({
    kind: ObjectKind.House, x: bx + 2, y: by - 4, owner: k === 0 ? 0 : 1, hp: 100,
  }));
  const tavern = objects.length;
  objects.push({ kind: ObjectKind.House, x: cx - 3, y: cy - 3, owner: 0, hp: 100 });
  const shop = objects.length;
  objects.push({ kind: ObjectKind.House, x: cx + 2, y: cy + 2, owner: 0, hp: 100 });
  for (const b of objects) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const i = (b.y + dy) * w + b.x + dx;
        reserved[i] = 1;
        terrain[i] = biome.ground;
      }
    }
  }

  const SKIRMISH_FRAMES: Record<string, readonly string[]> = {
    forest: ['highland/oak', 'rocks/boulder-m', 'highland/log'],
    marsh: ['ruins/column-broken', 'ruins/rubble', 'rocks/slab'],
    desert: ['desert/palm-a', 'desert/palm-b', 'desert/cactus', 'rocks/cluster'],
    oasis: ['desert/palm-a', 'desert/stump', 'rocks/cluster'],
    crypt: ['bones/tombstone', 'bones/sarcophagus', 'bones/skullspike'],
    highlands: ['highland/pine-a', 'highland/pine-b', 'highland/standing-stone'],
    volcanic: ['volcanic/dead-a', 'volcanic/dead-b', 'volcanic/obsidian', 'volcanic/vent'],
  };
  const frames = SKIRMISH_FRAMES[biomeKey];
  const trees = biome.hasTrees ? Math.round((w * w) / 32) : Math.round((w * w) / 140);
  for (let t = 0; t < trees; t++) {
    const x = randInt(2, w - 3);
    const y = randInt(2, h - 3);
    const i = y * w + x;
    if (!reserved[i] && terrain[i] !== biome.barrierWater && terrain[i] !== biome.barrierRock) {
      const useProp = frames && (!biome.hasTrees || t % 3 === 0);
      const frame = useProp ? frames[randInt(0, frames.length - 1)] : undefined;
      objects.push(frame ? { kind: ObjectKind.Tree, x, y, frame } : { kind: ObjectKind.Tree, x, y });
    }
  }

  // Units. Every rival warband has the same shape as yours, so the contest is fair.
  const units: UnitDef[] = [];
  let group = 1;
  let pack = 1;
  const shape: [number, number, number][] = [
    [Kind.Warrior, -1, -1], [Kind.Warrior, 0, -1], [Kind.Archer, 1, -1], [Kind.Warrior, -1, 0], [Kind.Archer, 1, 0], [Kind.Mage, 0, 1],
  ];
  const mercs: { unit: number; price: number }[] = [];
  spots.forEach(([bx, by], k) => {
    if (k === 0) {
      units.push({ kind: Kind.Hero, team: 0, x: bx, y: by, vip: true });
      for (const [kind, ox, oy] of shape.slice(0, 3)) units.push({ kind, team: 0, x: bx + ox, y: by + oy });
      const reserves: [number, number, number, number][] = [
        [Kind.Warrior, -1, 0, 60], [Kind.Archer, 1, 0, 70], [Kind.Mage, 0, 1, 110],
      ];
      for (const [kind, ox, oy, price] of reserves) {
        mercs.push({ unit: units.length, price });
        units.push({ kind, team: 0, x: bx + ox, y: by + oy, dormant: true });
      }
    } else {
      const g = group++;
      const p = pack++;
      for (const [kind, ox, oy] of shape) units.push({ kind, team: 1, x: bx + ox, y: by + oy, group: g, pack: p });
    }
  });
  camps.forEach(([px, py], c) => {
    const p = pack++;
    const family = biome.mobFamilies?.[c % biome.mobFamilies.length] ?? biome.mobFamily;
    for (const [kind, ox, oy] of [[Kind.Gnoll, 0, 0], [Kind.Gnoll, 1, 0], [Kind.Gnoll, 0, 1]] as const) {
      units.push({ kind, team: 1, x: px + ox, y: py + oy, pack: p, tier: 2, family });
    }
  });

  // Reachability: every landmark must be walkable from your start, else carve a corridor.
  const [sx, sy] = spots[0];
  const targets: [number, number][] = [...spots.slice(1), ...camps, [cx, cy], ...shrineDefs.map((s): [number, number] => [s.x, s.y])];
  for (const [tx, ty] of targets) {
    const blocked = bakeBlocked(w, h, terrain, objects);
    if (floodFillReachable(w, h, blocked, sx, sy)[ty * w + tx]) continue;
    road(sx, sy, tx, ty);
  }
  // Trees must not sit on units or in the cleared corridors.
  const occupied = new Set(units.map((u) => u.y * w + u.x));
  const finalObjects = objects.filter((o) => o.kind !== ObjectKind.Tree || (!occupied.has(o.y * w + o.x) && terrain[o.y * w + o.x] !== biome.path));

  const cond = (k: string, a: number[], v: number) => ({ a: { k, a }, op: 0, b: { k: 'constant', a: [v] } });
  const triggers = [
    { id: 'briefing', once: true, enabled: true, conds: [cond('yes', [], 1)], acts: [{ k: 'message', a: [1] }, { k: 'setSub', a: [0, 1] }] },
    { id: 'victory', once: true, enabled: true, conds: [cond('playerBuildings', [1], 0)], acts: [{ k: 'setSub', a: [0, 2] }, { k: 'win', a: [] }] },
    { id: 'base-lost', once: true, enabled: true, conds: [cond('playerBuildings', [0], 0)], acts: [{ k: 'lose', a: [1] }] },
    { id: 'hero-dead', once: true, enabled: true, conds: [cond('unitAlive', [0], 0)], acts: [{ k: 'lose', a: [2] }] },
  ];

  const title = `Skirmish: ${cap(biomeKey)} ${count === 2 ? 'Duel' : count === 3 ? 'Triangle' : 'Four Corners'} #${seed % 10000}`;
  const regions: Region[] = spots.map(([bx, by], k) => ({ name: `Base ${k + 1}`, x1: bx - 4, y1: by - 4, x2: bx + 4, y2: by + 4 }));
  const doc = {
    format: MAP_FORMAT,
    version: MAP_VERSION,
    name: title,
    w,
    h,
    terrain: rleEncode(terrain),
    height: rleEncode(height),
    objects: finalObjects,
    units,
    regions,
    players: ['Company', 'Rivals', 'Neutral', 'Allies'],
    triggers,
    text: {
      title,
      body: `A random ${biomeKey} battlefield. ${count - 1} rival warband${count > 2 ? 's' : ''} hold the other corners.`,
      'obj.0': 'Destroy every enemy command hall.',
      'msg.1': 'Take the neutral camps, hire mercenaries at the central tavern, then breach the enemy halls.',
      'msg.1.who': 'Herald',
      win: 'Every rival hall lies in ruins. The land is yours.',
      'fail.1': 'Your command hall has fallen.',
      'fail.2': 'Your champion has fallen.',
    },
    towns: [{ name: 'Crossroads', tavern, shop, tiers: [1, 3] as [number, number], mercs }],
    shrines: shrineDefs,
  } as unknown as MapDoc;
  const errs = validate(doc);
  if (errs.length > 0) throw new Error(`Generated skirmish map failed validation:\n${errs.join('\n')}`);
  return doc;
}

