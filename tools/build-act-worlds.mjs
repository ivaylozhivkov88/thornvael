// Reproducible stitched-world generator for Acts II, III, and IV.
// Mirrors tools/build-act1-world.mjs: each act is one continuous world map with
// town + mission zones linked by roads, dormant enemy groups per zone, and waypoints.
// Progression (+10% linear per act):
//   Act I   (existing): 844 x 650  (548,600 tiles)
//   Act II  (target):   936 x 695  (650,520 tiles)
//   Act III (target):  1016 x 785  (797,560 tiles)
//   Act IV  (target):  1136 x 860  (976,960 tiles)
// Usage: node tools/build-act-worlds.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MISSIONS = path.join(here, '..', 'src', 'missions');
const WORLDS = path.join(here, '..', 'src', 'worlds');
const load = (f) => JSON.parse(fs.readFileSync(path.join(MISSIONS, `${f}.map.json`), 'utf8'));

const DIRT = 1;
const WATER = 2;
const ROCK = 3;
const HOUSE = 1;
const GAP = 10;
const MAX_SIDE = 1280;

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

const clamp = (v, max) => Math.max(0, Math.min(max - 1, Math.round(v)));

/** Scale a mission doc in-memory to (tw x th) for stitching without touching files on disk. */
function scaleDocInMemory(src, tw, th) {
  const sw = src.w;
  const sh = src.h;
  const sx = (x) => clamp((x * tw) / sw, tw);
  const sy = (y) => clamp((y * th) / sh, th);

  const srcT = rleDecode(src.terrain, sw * sh);
  const srcH = rleDecode(src.height, sw * sh);
  const dstT = new Uint8Array(tw * th);
  const dstH = new Uint8Array(tw * th);

  for (let y = 0; y < th; y++) {
    const oy = Math.min(sh - 1, Math.floor((y * sh) / th));
    for (let x = 0; x < tw; x++) {
      const ox = Math.min(sw - 1, Math.floor((x * sw) / tw));
      dstT[y * tw + x] = srcT[oy * sw + ox];
      dstH[y * tw + x] = srcH[oy * sw + ox];
    }
  }

  const findPassable = (tx, ty) => {
    for (let r = 0; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = clamp(tx + dx, tw);
          const ny = clamp(ty + dy, th);
          const t = dstT[ny * tw + nx];
          if (t !== WATER && t !== ROCK) return [nx, ny];
        }
      }
    }
    return [tx, ty];
  };

  const unitOccupied = new Set();
  const units = (src.units || []).map((u) => {
    const [ux, uy] = findPassable(sx(u.x), sy(u.y));
    unitOccupied.add(`${ux},${uy}`);
    return { ...u, x: ux, y: uy };
  });

  const objOccupied = new Set();
  const objects = [];
  for (const o of src.objects || []) {
    const ox = sx(o.x);
    const oy = sy(o.y);
    const k = `${ox},${oy}`;
    if (objOccupied.has(k) || unitOccupied.has(k)) continue;
    if (o.kind === HOUSE) {
      let conflict = false;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (unitOccupied.has(`${ox + dx},${oy + dy}`)) conflict = true;
        }
      }
      if (conflict) continue;
    }
    objOccupied.add(k);
    objects.push({ ...o, x: ox, y: oy });
  }

  const shrines = (src.shrines || []).map((s) => {
    const [shx, shy] = findPassable(sx(s.x), sy(s.y));
    return { ...s, x: shx, y: shy };
  });

  const regions = (src.regions || []).map((r) => ({
    ...r,
    x1: sx(r.x1),
    y1: sy(r.y1),
    x2: sx(r.x2),
    y2: sy(r.y2),
  }));

  return {
    ...src,
    w: tw,
    h: th,
    terrain: rleEncode(dstT),
    height: rleEncode(dstH),
    objects,
    units,
    shrines,
    regions,
  };
}

function buildWorld(cfg) {
  const town = load(cfg.townFile);
  const zones = [
    {
      id: 'town',
      name: cfg.townName,
      src: cfg.townFile,
      doc: town,
      box: [0, 0, town.w - 1, town.h - 1],
      isTown: true,
    },
  ];

  for (const [id, file] of cfg.missions) {
    const raw = load(file);
    const scaled = scaleDocInMemory(raw, cfg.zoneW, cfg.zoneH);
    zones.push({
      id,
      name: raw.name,
      src: file,
      doc: scaled,
      box: [0, 0, scaled.w - 1, scaled.h - 1],
    });
  }

  for (const z of zones) {
    z.w = z.box[2] - z.box[0] + 1;
    z.h = z.box[3] - z.box[1] + 1;
  }

  // Serpentine layout bounded by cfg.rowMaxW
  {
    let rowY = 0;
    let dir = 1;
    let cursor = 0;
    let rowH = 0;
    let prev = null;
    for (const z of zones) {
      const fits = dir === 1 ? cursor + z.w <= cfg.rowMaxW : cursor - z.w >= 0;
      if (!fits && prev) {
        rowY += rowH + GAP;
        rowH = 0;
        if (dir === 1) {
          dir = -1;
          cursor = Math.max(prev.x + prev.w, z.w);
        } else {
          dir = 1;
          cursor = Math.min(prev.x, cfg.rowMaxW - z.w);
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
    throw new Error(`${cfg.outFile}: layout ${W}x${H} exceeds MAX_SIDE ${MAX_SIDE}`);
  }

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
      if (o.kind === HOUSE) {
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) houseTiles.add(key(n.x + dx, n.y + dy));
        }
      }
    });
  }

  const objAt = new Map();
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

  const removeObjs = new Set();
  function carve(x, y) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = x + dx;
        const cy = y + dy;
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
    const sx = Math.sign(x2 - x1);
    const sy = Math.sign(y2 - y1);
    let x = x1;
    let y = y1;
    for (;;) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (houseTiles.has(key(x + dx, y + dy))) return false;
        }
      }
      if (x === x2 && y === y2) return true;
      x += sx;
      y += sy;
    }
  };

  function zoneTiles(z) {
    const out = [];
    for (let y = z.y; y < z.y + z.h; y++) {
      for (let x = z.x; x < z.x + z.w; x++) out.push([x, y]);
    }
    return out;
  }

  function pickDoor(z, edge, target, axis) {
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
    const A = zones[i];
    const B = zones[i + 1];
    const ox1 = Math.max(A.x, B.x);
    const ox2 = Math.min(A.x + A.w - 1, B.x + B.w - 1);
    const oy1 = Math.max(A.y, B.y);
    const oy2 = Math.min(A.y + A.h - 1, B.y + B.h - 1);
    let axis;
    if (oy1 <= oy2 && (A.x + A.w <= B.x || B.x + B.w <= A.x)) axis = 'h';
    else if (ox1 <= ox2) axis = 'v';
    else throw new Error(`Zones ${A.id} and ${B.id} do not touch.`);
    const cx = (ox1 + ox2) >> 1;
    const cy = (oy1 + oy2) >> 1;
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
      const sx = Math.sign(x2 - x1);
      const sy = Math.sign(y2 - y1);
      let x = x1;
      let y = y1;
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
    (A.doors ??= []).push({ to: B.id, x: pa.x, y: pa.y });
    (B.doors ??= []).push({ to: A.id, x: pb.x, y: pb.y });
  }

  const finalObjects = objects.filter((_, i) => !removeObjs.has(i));
  objAt.clear();
  finalObjects.forEach((o, i) => {
    if (o.kind !== HOUSE) objAt.set(key(o.x, o.y), i);
  });

  // Ensure every zone's entry door connects to its exit door (carve a narrow pass if a river/cliff splits a zone)
  const bfsReachable = (sx, sy) => {
    const seen = new Uint8Array(W * H);
    if (!walkable(sx, sy)) return seen;
    const q = [key(sx, sy)];
    seen[q[0]] = 1;
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      const x = c % W;
      const y = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = key(nx, ny);
        if (seen[k] || !walkable(nx, ny)) continue;
        seen[k] = 1;
        q.push(k);
      }
    }
    return seen;
  };

  for (const z of zones) {
    if (!z.doors || z.doors.length < 2) continue;
    const d0 = z.doors[0];
    const d1 = z.doors[1];
    const seen = bfsReachable(d0.x, d0.y);
    if (!seen[key(d1.x, d1.y)]) {
      // Carve an L-shaped pass inside the zone between its two doors
      const sx = Math.sign(d1.x - d0.x);
      const sy = Math.sign(d1.y - d0.y);
      let x = d0.x;
      let y = d0.y;
      while (x !== d1.x) {
        carve(x, y);
        x += sx;
      }
      while (y !== d1.y) {
        carve(x, y);
        y += sy;
      }
      carve(d1.x, d1.y);
    }
  }

  const finalObjects2 = finalObjects.filter((_, i) => !removeObjs.has(i));
  objAt.clear();
  finalObjects2.forEach((o, i) => {
    if (o.kind !== HOUSE) objAt.set(key(o.x, o.y), i);
  });

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
      if (u.team === 0) return;
      const x = u.x - z.box[0] + z.x;
      const y = u.y - z.box[1] + z.y;
      if (!walkable(x, y) || occupied.has(key(x, y))) return;
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
      const x1 = Math.max(0, z.x - 2);
      const y1 = Math.max(0, z.y - 2);
      const x2 = Math.min(W - 1, z.x + z.w + 1);
      const y2 = Math.min(H - 1, z.y + z.h + 1);
      triggers.push({
        id: `enter-${z.id}`,
        once: true,
        enabled: true,
        conds: [{ a: { k: 'unitInBox', a: [0, x1, y1, x2, y2] }, op: 0, b: { k: 'constant', a: [1] } }],
        acts: [{ k: 'phaseInGroup', a: [gid] }],
      });
    }
  }

  // Hero-dead lose trigger
  triggers.unshift({
    id: 'hero-dead',
    once: true,
    enabled: true,
    conds: [{ a: { k: 'unitAlive', a: [0] }, op: 0, b: { k: 'constant', a: [0] } }],
    acts: [{ k: 'lose', a: [1] }],
  });

  // Victory: last zone entered AND cleared
  const last = zones[zones.length - 1];
  if (last.group) {
    const x1 = Math.max(0, last.x - 2);
    const y1 = Math.max(0, last.y - 2);
    const x2 = Math.min(W - 1, last.x + last.w + 1);
    const y2 = Math.min(H - 1, last.y + last.h + 1);
    triggers.push({
      id: `${cfg.id}-cleared`,
      once: true,
      enabled: true,
      conds: [
        { a: { k: 'unitInBox', a: [0, x1, y1, x2, y2] }, op: 0, b: { k: 'constant', a: [1] } },
        { a: { k: 'groupSize', a: [last.group] }, op: 0, b: { k: 'constant', a: [0] } },
      ],
      acts: [{ k: 'win', a: [] }],
    });
  }

  const shrines = [];
  const regions = [];
  for (const z of zones) {
    for (const s of z.doc.shrines ?? []) {
      const sx = s.x - z.box[0] + z.x;
      const sy = s.y - z.box[1] + z.y;
      if (walkable(sx, sy)) shrines.push({ ...s, x: sx, y: sy });
    }
    const baseReg = z.isTown ? (z.doc.regions?.[0] ?? {}) : {};
    regions.push({
      ...baseReg,
      name: z.name,
      x1: z.x,
      y1: z.y,
      x2: z.x + z.w - 1,
      y2: z.y + z.h - 1,
      zone: z.id,
    });
  }

  const towns = (town.towns ?? []).map((t) => ({
    ...t,
    npcs: (t.npcs ?? []).map((n) => ({ ...n, x: n.x + zones[0].x, y: n.y + zones[0].y })),
  }));

  const unitTiles = new Set(units.map((u) => key(u.x, u.y)));
  const hero = units[0];
  const heroSeen = hero ? bfsReachable(hero.x, hero.y) : new Uint8Array(W * H);
  const waypoints = [];
  zones.forEach((z, i) => {
    if (i % 2 !== 0) return;
    const cx = z.x + (z.w >> 1);
    const cy = z.y + (z.h >> 1);
    let best = null;
    for (const [x, y] of zoneTiles(z)) {
      if (!walkable(x, y) || unitTiles.has(key(x, y)) || !heroSeen[key(x, y)]) continue;
      const dd = Math.hypot(x - cx, y - cy);
      if (!best || dd < best.dd) best = { x, y, dd };
    }
    if (best) waypoints.push({ id: `wp-${z.id}`, name: z.name, x: best.x, y: best.y, activated: i === 0 });
  });

  const text = {
    ...town.text,
    title: cfg.title,
    body: cfg.body,
  };

  const world = {
    format: 'thornvael-map',
    version: 2,
    name: cfg.title,
    w: W,
    h: H,
    terrain: rleEncode(terrain),
    height: rleEncode(height),
    objects: finalObjects2,
    units,
    regions,
    players: town.players,
    triggers,
    text,
    towns,
    shrines,
    waypoints,
    exits: [],
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      source: z.src,
      x: z.x,
      y: z.y,
      w: z.w,
      h: z.h,
      units: z.units ?? 0,
      group: z.group ?? 0,
      doors: z.doors ?? [],
    })),
  };

  const outPath = path.join(WORLDS, cfg.outFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(world));
  const dormant = units.filter((u) => u.dormant).length;
  console.log(
    `${cfg.outFile}: ${W}x${H} (${W * H} tiles), ${zones.length} zones, ${units.length} units (${units.length - dormant} active), ${waypoints.length} waypoints, ${triggers.length} triggers`,
  );
  return { file: cfg.outFile, w: W, h: H, area: W * H, units: units.length };
}

const WORLDS_CFG = [
  {
    id: 'act2',
    outFile: 'act2-world.map.json',
    title: 'Act II — Into the Redmarsh',
    body: 'One continuous march from Redmarsh Outpost to the Fork of Spears. Roads link every zone; waypoints let you return.',
    townFile: 'redmarsh-outpost',
    townName: 'Redmarsh Outpost',
    zoneW: 210,
    zoneH: 225,
    rowMaxW: 940,
    missions: [
      ['m12', 'm12-redmarsh-border'],
      ['m13', 'm13-twin-passes'],
      ['m14', 'm14-scattered-scouts'],
      ['m15', 'm15-outpost-palisade'],
      ['m16', 'm16-wardstone-rupture'],
      ['m17', 'm17-mire-convoy'],
      ['m18', 'm18-granary-raid'],
      ['m19', 'm19-hexer-capture'],
      ['m20', 'm20-deep-quarry'],
      ['m21', 'm21-lean-garrison'],
      ['m22', 'm22-fleeing-column'],
      ['m23', 'm23-fork-of-spears'],
    ],
  },
  {
    id: 'act3',
    outFile: 'act3-world.map.json',
    title: 'Act III — The Iron Coast',
    body: 'One continuous march from Oakhaven Bastion to Burning Harbor. Roads link every zone; waypoints let you return.',
    townFile: 'oakhaven-bastion',
    townName: 'Oakhaven Bastion',
    zoneW: 230,
    zoneH: 255,
    rowMaxW: 1024,
    missions: [
      ['m24', 'm24-pledge-at-oakhaven'],
      ['m25', 'm25-cinder-wards'],
      ['m26', 'm26-sundered-ranks'],
      ['m27', 'm27-field-infirmary'],
      ['m28', 'm28-sunken-citadel'],
      ['m29', 'm29-hourglass-rescue'],
      ['m30', 'm30-starved-bastion'],
      ['m31', 'm31-riverlock-crossing'],
      ['m32', 'm32-elder-juggernaut'],
      ['m33', 'm33-high-stakes-gambit'],
      ['m34', 'm34-clashing-banners'],
      ['m35', 'm35-burning-harbor'],
    ],
  },
  {
    id: 'act4',
    outFile: 'act4-world.map.json',
    title: 'Act IV — Crown and Ember',
    body: 'One continuous march from Highcrest Citadel to the Ember Reckoning. Roads link every zone; waypoints let you return.',
    townFile: 'highcrest-citadel',
    townName: 'Highcrest Citadel',
    zoneW: 260,
    zoneH: 280,
    rowMaxW: 1140,
    missions: [
      ['m36', 'm36-heartland-march'],
      ['m37', 'm37-shattered-beacons'],
      ['m38', 'm38-besieged-wall'],
      ['m39', 'm39-flight-of-malrik'],
      ['m40', 'm40-twofold-assault'],
      ['m41', 'm41-gauntlet-of-iron'],
      ['m42', 'm42-outer-rampart'],
      ['m43', 'm43-three-roads-siege'],
      ['m44', 'm44-threshold-choice'],
      ['m45', 'm45-crown-of-order'],
      ['m46', 'm46-ember-reckoning'],
    ],
  },
];

for (const cfg of WORLDS_CFG) {
  buildWorld(cfg);
}
