// Stitches Thornwick + Act 1 missions into ONE continuous map (Diablo 2 style zones joined by roads).
// Usage: node tools/build-act1-world.mjs   -> writes src/worlds/act1-world.map.json
// Originals are only read. Zone units start dormant and wake when the hero walks into the zone box.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MISSIONS = path.join(here, '..', 'src', 'missions');
const OUT = path.join(here, '..', 'src', 'worlds', 'act1-world.map.json');
const load = (f) => JSON.parse(fs.readFileSync(path.join(MISSIONS, `${f}.map.json`), 'utf8'));

const GRASS = 0, DIRT = 1, WATER = 2, ROCK = 3;
const HOUSE = 1;
const GAP = 10; // filler between zones (tiles)
const MAX_SIDE = 1024;
const MARGIN = 3; // terrain margin around m01 region crops

const rleDecode = (r, n) => {
  const out = new Uint8Array(n);
  let k = 0;
  for (let i = 0; i + 1 < r.length && k < n; i += 2) {
    const end = Math.min(n, k + r[i + 1]);
    out.fill(r[i], k, end);
    k = end;
  }
  return out;
};
const rleEncode = (a) => {
  const out = [];
  for (let i = 0; i < a.length; ) {
    let j = i + 1;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(a[i], j - i);
    i = j;
  }
  return out;
};

// ---- zone definitions, in campaign chain order ------------------------------------------------
const zones = [];
const town = load('thornwick-market');
zones.push({ id: 'town', name: 'Thornwick', src: 'thornwick-market', doc: town, box: [0, 0, town.w - 1, town.h - 1], isTown: true });

const ford = load('blood-at-the-ford');
const ids = ['m01-outskirts', 'm01-willows', 'm01-ford', 'm01-granary', 'm01-bluff', 'm01-warcamp'];
ford.regions.forEach((r, i) => {
  zones.push({
    id: ids[i],
    name: r.name,
    src: 'blood-at-the-ford',
    doc: ford,
    region: r,
    box: [Math.max(0, r.x1 - MARGIN), Math.max(0, r.y1 - MARGIN), Math.min(ford.w - 1, r.x2 + MARGIN), Math.min(ford.h - 1, r.y2 + MARGIN)],
  });
});
const rest = [
  ['m02', 'whispers-in-the-fen'],
  ['m03', 'nightfall-at-ravenwatch'],
  ['m04', 'the-sunken-sanctum'],
  ['m05', 'm05-lantern-passage'],
  ['m06', 'm06-greywood-supply'],
  ['m07', 'm07-split-vanguard'],
  ['m08', 'm08-alder-bridge'],
  ['m09', 'm09-ironhide-hunt'],
  ['m10', 'm10-undervault-links'],
  ['m11', 'm11-ashbrook-retreat'],
];
for (const [id, f] of rest) {
  const d = load(f);
  zones.push({ id, name: d.name, src: f, doc: d, box: [0, 0, d.w - 1, d.h - 1] });
}
zones.forEach((z) => {
  z.w = z.box[2] - z.box[0] + 1;
  z.h = z.box[3] - z.box[1] + 1;
});

// ---- layout: serpentine rows so consecutive zones touch ---------------------------------------
{
  let rowY = 0;
  let dir = 1;
  let cursor = 0; // forward: next free x; reverse: next right edge
  let rowH = 0;
  let prev = null;
  for (const z of zones) {
    const fits = dir === 1 ? cursor + z.w <= MAX_SIDE : cursor - z.w >= 0;
    if (!fits && prev) {
      // new row; keep the first zone under the last zone of the previous row
      rowY += rowH + GAP;
      rowH = 0;
      if (dir === 1) {
        dir = -1;
        cursor = Math.max(prev.x + prev.w, z.w);
      } else {
        dir = 1;
        cursor = Math.min(prev.x, MAX_SIDE - z.w);
      }
    }
    z.x = dir === 1 ? cursor : cursor - z.w;
    z.y = rowY;
    cursor = dir === 1 ? cursor + z.w + GAP : cursor - z.w - GAP;
    rowH = Math.max(rowH, z.h);
    prev = z;
  }
}
const W = Math.max(...zones.map((z) => z.x + z.w));
const H = Math.max(...zones.map((z) => z.y + z.h));
if (W > MAX_SIDE || H > MAX_SIDE) {
  console.error(`Layout too big: ${W}x${H} (max ${MAX_SIDE}).`);
  for (const z of zones) console.error(`  ${z.id} ${z.w}x${z.h} @ ${z.x},${z.y}`);
  process.exit(1);
}

// ---- terrain / height / objects ----------------------------------------------------------------
const terrain = new Uint8Array(W * H).fill(ROCK);
const height = new Uint8Array(W * H).fill(1);
const objects = [];
const houseTiles = new Set();
const key = (x, y) => y * W + x;

for (const z of zones) {
  const d = z.doc;
  const t = rleDecode(d.terrain, d.w * d.h);
  const hh = rleDecode(d.height, d.w * d.h);
  for (let y = 0; y < z.h; y++) {
    for (let x = 0; x < z.w; x++) {
      const si = (z.box[1] + y) * d.w + z.box[0] + x;
      const di = (z.y + y) * W + z.x + x;
      terrain[di] = t[si];
      height[di] = hh[si];
    }
  }
}

const claimed = new Set();
// Town first so house indices stay the same as in the original map.
for (const z of zones) {
  const d = z.doc;
  d.objects.forEach((o, oi) => {
    const size = o.kind === HOUSE ? 2 : 1;
    if (o.x < z.box[0] || o.y < z.box[1] || o.x + size - 1 > z.box[2] || o.y + size - 1 > z.box[3]) return;
    const ck = `${z.src}:${oi}`;
    if (claimed.has(ck)) return;
    claimed.add(ck);
    const n = { ...o, x: o.x - z.box[0] + z.x, y: o.y - z.box[1] + z.y };
    objects.push(n);
    if (o.kind === HOUSE) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) houseTiles.add(key(n.x + dx, n.y + dy));
  });
}

const objAt = new Map(); // tile -> object index (non-house blockers)
objects.forEach((o, i) => {
  if (o.kind !== HOUSE) objAt.set(key(o.x, o.y), i);
});

const walkable = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  const k = key(x, y);
  if (terrain[k] === WATER || terrain[k] === ROCK) return false;
  if (houseTiles.has(k) || objAt.has(k)) return false;
  return true;
};

// ---- roads between chain neighbours ------------------------------------------------------------
const doors = [];
const removeObjs = new Set();
function carve(x, y) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = x + dx, cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const k = key(cx, cy);
      if (houseTiles.has(k)) continue;
      terrain[k] = DIRT;
      const oi = objAt.get(k);
      if (oi !== undefined) removeObjs.add(oi);
    }
  }
}
const lineClear = (x1, y1, x2, y2) => {
  // straight horizontal or vertical segment must not touch houses (width 3)
  const sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1);
  let x = x1, y = y1;
  for (;;) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (houseTiles.has(key(x + dx, y + dy))) return false;
    if (x === x2 && y === y2) return true;
    x += sx;
    y += sy;
  }
};
function zoneTiles(z) {
  const out = [];
  for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) out.push([x, y]);
  return out;
}
function pickDoor(z, edge, target, axis) {
  // best walkable tile near the facing edge; the straight run to the edge must be house-free
  const [tx, ty] = target;
  for (const band of [14, 40, 100000]) {
    let best = null;
    for (const [x, y] of zoneTiles(z)) {
      const dEdge = axis === 'h' ? Math.abs(x - edge) : Math.abs(y - edge);
      if (dEdge > band || !walkable(x, y)) continue;
      const score = dEdge + (axis === 'h' ? Math.abs(y - ty) : Math.abs(x - tx)) * 1.5;
      if (best && score >= best.score) continue;
      const ex = axis === 'h' ? edge : x;
      const ey = axis === 'h' ? y : edge;
      if (!lineClear(x, y, ex, ey)) continue;
      best = { x, y, score };
    }
    if (best) return best;
  }
  return null;
}
for (let i = 0; i + 1 < zones.length; i++) {
  const A = zones[i], B = zones[i + 1];
  const ox1 = Math.max(A.x, B.x), ox2 = Math.min(A.x + A.w - 1, B.x + B.w - 1);
  const oy1 = Math.max(A.y, B.y), oy2 = Math.min(A.y + A.h - 1, B.y + B.h - 1);
  let axis;
  if (oy1 <= oy2 && (A.x + A.w <= B.x || B.x + B.w <= A.x)) axis = 'h';
  else if (ox1 <= ox2) axis = 'v';
  else throw new Error(`Zones ${A.id} and ${B.id} do not touch.`);
  const cx = (ox1 + ox2) >> 1, cy = (oy1 + oy2) >> 1;
  let edgeA, edgeB;
  if (axis === 'h') {
    [edgeA, edgeB] = A.x < B.x ? [A.x + A.w - 1, B.x] : [A.x, B.x + B.w - 1];
  } else {
    [edgeA, edgeB] = A.y < B.y ? [A.y + A.h - 1, B.y] : [A.y, B.y + B.h - 1];
  }
  const pa = pickDoor(A, edgeA, [cx, cy], axis);
  const pb = pickDoor(B, edgeB, [cx, cy], axis);
  if (!pa || !pb) throw new Error(`No door found between ${A.id} and ${B.id}.`);
  const mid = Math.round((edgeA + edgeB) / 2);
  const seg = (x1, y1, x2, y2) => {
    const sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1);
    let x = x1, y = y1;
    for (;;) {
      carve(x, y);
      if (x === x2 && y === y2) break;
      x += sx;
      y += sy;
    }
  };
  if (axis === 'h') {
    seg(pa.x, pa.y, mid, pa.y);
    seg(mid, pa.y, mid, pb.y);
    seg(mid, pb.y, pb.x, pb.y);
  } else {
    seg(pa.x, pa.y, pa.x, mid);
    seg(pa.x, mid, pb.x, mid);
    seg(pb.x, mid, pb.x, pb.y);
  }
  doors.push({ from: A.id, to: B.id, a: [pa.x, pa.y], b: [pb.x, pb.y] });
  (A.doors ??= []).push({ to: B.id, x: pa.x, y: pa.y });
  (B.doors ??= []).push({ to: A.id, x: pb.x, y: pb.y });
}
// drop trees removed by roads; rebuild the (non-house) lookup
const finalObjects = objects.filter((_, i) => !removeObjs.has(i));
objAt.clear();
finalObjects.forEach((o, i) => {
  if (o.kind !== HOUSE) objAt.set(key(o.x, o.y), i);
});

// ---- units -------------------------------------------------------------------------------------
const units = [];
const triggers = [];
let zi = 0;
for (const z of zones) {
  zi++;
  const d = z.doc;
  const gid = 1000 + zi;
  const occupied = new Set();
  let added = 0;
  d.units.forEach((u) => {
    if (z.isTown) {
      units.push({ ...u, x: u.x + z.x, y: u.y + z.y });
      return;
    }
    if (u.team === 0) return; // starting squad / allies belong to the original missions only
    const inBox = z.region
      ? u.x >= z.region.x1 && u.x <= z.region.x2 && u.y >= z.region.y1 && u.y <= z.region.y2
      : true;
    if (!inBox) return;
    const x = u.x - z.box[0] + z.x, y = u.y - z.box[1] + z.y;
    if (occupied.has(key(x, y))) return;
    occupied.add(key(x, y));
    const nu = { ...u, x, y, dormant: true, group: gid };
    if (u.pack) nu.pack = zi * 1000 + u.pack;
    delete nu.vip;
    units.push(nu);
    added++;
  });
  z.units = added;
  z.group = added ? gid : 0;
  if (added) {
    const x1 = Math.max(0, z.x - 2), y1 = Math.max(0, z.y - 2);
    const x2 = Math.min(W - 1, z.x + z.w + 1), y2 = Math.min(H - 1, z.y + z.h + 1);
    triggers.push({
      id: `enter-${z.id}`,
      once: true,
      enabled: true,
      conds: [{ a: { k: 'unitInBox', a: [0, x1, y1, x2, y2] }, op: 0, b: { k: 'constant', a: [1] } }],
      acts: [{ k: 'phaseInGroup', a: [gid] }],
    });
  }
}
// town: keep its opening beats (briefing, purse, hero-dead)
for (const t of town.triggers) if (['briefing', 'purse', 'hero-dead'].includes(t.id)) triggers.unshift(t);

// victory: the last zone (m11) is cleared
{
  const last = zones[zones.length - 1];
  if (last.group) {
    triggers.push({
      id: 'act1-cleared',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [last.group] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [{ k: 'win', a: [] }],
    });
  }
}

// ---- shrines / regions / towns / waypoints ---------------------------------------------------
const shrines = [];
const regions = [];
for (const z of zones) {
  for (const s of z.doc.shrines ?? []) {
    if (s.x < z.box[0] || s.y < z.box[1] || s.x > z.box[2] || s.y > z.box[3]) continue;
    shrines.push({ ...s, x: s.x - z.box[0] + z.x, y: s.y - z.box[1] + z.y });
  }
  regions.push({ name: z.name, x1: z.x, y1: z.y, x2: z.x + z.w - 1, y2: z.y + z.h - 1, zone: z.id });
  if (!z.region) {
    for (const r of z.doc.regions) {
      regions.push({
        name: `${z.id}/${r.name}`,
        x1: r.x1 + z.x - z.box[0],
        y1: r.y1 + z.y - z.box[1],
        x2: r.x2 + z.x - z.box[0],
        y2: r.y2 + z.y - z.box[1],
        zone: z.id,
      });
    }
  }
}
const towns = (town.towns ?? []).map((t) => ({
  ...t,
  npcs: (t.npcs ?? []).map((n) => ({ ...n, x: n.x + zones[0].x, y: n.y + zones[0].y })),
}));

const unitTiles = new Set(units.map((u) => key(u.x, u.y)));
const waypoints = [];
zones.forEach((z, i) => {
  if (i % 2 !== 0) return;
  const cx = z.x + (z.w >> 1), cy = z.y + (z.h >> 1);
  let best = null;
  for (const [x, y] of zoneTiles(z)) {
    if (!walkable(x, y) || unitTiles.has(key(x, y))) continue;
    const dd = Math.hypot(x - cx, y - cy);
    if (!best || dd < best.dd) best = { x, y, dd };
  }
  if (best) waypoints.push({ id: `wp-${z.id}`, name: z.name, x: best.x, y: best.y, activated: i === 0 });
});

// ---- write -------------------------------------------------------------------------------------
const text = { ...town.text, title: 'Act I — The Border', body: 'One continuous march from Thornwick to Ashbrook. Roads link every zone; waypoints let you return.' };
const world = {
  format: 'thornvael-map',
  version: 2,
  name: 'Act I — The Border',
  w: W,
  h: H,
  terrain: rleEncode(terrain),
  height: rleEncode(height),
  objects: finalObjects,
  units,
  regions,
  players: town.players,
  triggers,
  text,
  towns,
  shrines,
  waypoints,
  exits: [],
  zones: zones.map((z) => ({ id: z.id, name: z.name, source: z.src, x: z.x, y: z.y, w: z.w, h: z.h, units: z.units ?? 0, group: z.group ?? 0, doors: z.doors ?? [] })),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(world));
const dormant = units.filter((u) => u.dormant).length;
console.log(`world ${W}x${H}, ${zones.length} zones, ${units.length} units (${units.length - dormant} active), ${finalObjects.length} objects, ${waypoints.length} waypoints, ${triggers.length} triggers`);
for (const z of zones) console.log(`  ${z.id.padEnd(15)} ${String(z.w).padStart(3)}x${String(z.h).padEnd(3)} @ ${z.x},${z.y}  units ${z.units ?? '-'}`);
