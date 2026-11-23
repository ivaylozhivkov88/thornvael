#!/usr/bin/env node
/**
 * Reproducibly builds/enriches Thornwick Market (src/missions/thornwick-market.map.json)
 * per C3.1..C3.7: palisade walls, N/E gates, 9 buildings, 30+ dressing props,
 * 12+ ambient NPCs/guards, waypoint, dusk/drizzle region metadata, and audio cues.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAP_PATH = path.join(here, '..', 'src', 'missions', 'thornwick-market.map.json');

const GRASS = 0;
const DIRT = 1;
const WATER = 2;

function rleDecode(r, n) {
  const out = new Uint8Array(n);
  let k = 0;
  for (let i = 0; i + 1 < r.length && k < n; i += 2) {
    const end = Math.min(n, k + r[i + 1]);
    out.fill(r[i], k, end);
    k = end;
  }
  return out;
}

function rleEncode(a) {
  const out = [];
  for (let i = 0; i < a.length;) {
    let j = i + 1;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(a[i], j - i);
    i = j;
  }
  return out;
}

const doc = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const w = doc.w;
const h = doc.h;
const terrain = rleDecode(doc.terrain, w * h);

const setT = (x, y, val) => {
  if (x >= 0 && x < w && y >= 0 && y < h) terrain[y * w + x] = val;
};

// C3.1: Main street, market square, N-gate road (28, 4..20), E-gate road (28..52, 22), river bend on SE edge
for (let y = 6; y <= 36; y++) {
  for (let x = 6; x <= 46; x++) {
    if (terrain[y * w + x] === WATER) terrain[y * w + x] = GRASS;
  }
}
for (let y = 3; y <= 30; y++) {
  setT(27, y, DIRT);
  setT(28, y, DIRT);
  setT(29, y, DIRT);
}
for (let x = 8; x <= 53; x++) {
  setT(x, 21, DIRT);
  setT(x, 22, DIRT);
  setT(x, 23, DIRT);
}
for (let y = 12; y <= 21; y++) {
  for (let x = 10; x <= 32; x++) {
    setT(x, y, DIRT);
  }
}
// River bend in the south-east with a dirt bridge/ford at x=40..42
for (let y = 35; y <= 41; y++) {
  for (let x = 34; x <= 52; x++) {
    if (x >= 40 && x <= 42) setT(x, y, DIRT);
    else if (y >= 37) setT(x, y, WATER);
  }
}

doc.terrain = rleEncode(terrain);
doc.day = 1; // C3.5 dusk lighting

// C3.2: 9 buildings (Tavern 0, Armory 1, Academy 2 preserved at exact indices, plus Smithy, Granary & 4 cottages)
const houses = [
  { kind: 1, x: 9, y: 8, owner: 0, hp: 100 },   // 0: Tavern
  { kind: 1, x: 15, y: 8, owner: 0, hp: 100 },  // 1: Armory
  { kind: 1, x: 21, y: 8, owner: 0, hp: 100 },  // 2: Runic Academy
  { kind: 1, x: 33, y: 8, owner: 0, hp: 100 },  // 3: Smithy
  { kind: 1, x: 39, y: 8, owner: 0, hp: 100 },  // 4: Granary
  { kind: 1, x: 9, y: 26, owner: 0, hp: 100 },  // 5: Cottage SW
  { kind: 1, x: 16, y: 26, owner: 0, hp: 100 }, // 6: Cottage S
  { kind: 1, x: 34, y: 26, owner: 0, hp: 100 }, // 7: Watchhouse SE
  { kind: 1, x: 40, y: 26, owner: 0, hp: 100 }, // 8: River Dockhouse
];

// C3.1 + C3.3: Timber palisade perimeter (with N gate at x=26..30, y=4 and E gate at x=50, y=20..24) + dressing props
const props = [];
const addProp = (x, y, frame) => {
  if (x <= 1 || x >= w - 2 || y <= 1 || y >= h - 2) return;
  if (terrain[y * w + x] === WATER) return;
  props.push({ kind: 0, x, y, frame });
};

// Palisade walls
for (let x = 5; x <= 49; x += 2) {
  if (x < 25 || x > 31) addProp(x, 4, 'camp/palisade');
  if (x < 39 || x > 43) addProp(x, 34, 'camp/palisade');
}
for (let y = 6; y <= 32; y += 2) {
  addProp(5, y, 'camp/palisade');
  if (y < 19 || y > 25) addProp(49, y, 'camp/palisade');
}

// Gate banners & braziers
addProp(25, 5, 'camp/banner');
addProp(31, 5, 'camp/banner');
addProp(25, 7, 'camp/fire');
addProp(31, 7, 'camp/fire');
addProp(48, 19, 'camp/banner');
addProp(48, 25, 'camp/banner');
addProp(47, 19, 'camp/fire');
addProp(47, 25, 'camp/fire');

// Market square, smithy, granary, and graveyard corner dressing (30+ props)
const dressing = [
  [12, 11, 'camp/crates'],
  [14, 11, 'camp/fire'],
  [18, 11, 'camp/tent'],
  [24, 11, 'camp/crates'],
  [25, 16, 'camp/fire'],
  [32, 12, 'camp/rack'],
  [35, 12, 'camp/fire'],
  [36, 11, 'camp/crates'],
  [41, 12, 'camp/crates'],
  [42, 14, 'highland/log'],
  [11, 19, 'camp/crates'],
  [15, 19, 'camp/tent'],
  [19, 19, 'camp/fire'],
  [22, 19, 'camp/banner'],
  [12, 30, 'highland/gorse'],
  [18, 30, 'highland/log'],
  [23, 30, 'camp/crates'],
  [33, 30, 'camp/rack'],
  [37, 30, 'camp/fire'],
  [43, 31, 'camp/crates'],
  // Small graveyard corner (SW inside walls)
  [7, 30, 'bones/tombstone'],
  [9, 30, 'bones/tombstone'],
  [7, 32, 'bones/candles'],
  [9, 32, 'bones/tombstone'],
  // Outer trees
  [3, 10, 'highland/oak'],
  [3, 20, 'highland/pine-a'],
  [3, 30, 'highland/oak'],
  [52, 8, 'highland/pine-b'],
  [52, 14, 'highland/oak'],
  [52, 30, 'highland/pine-a'],
];
for (const [x, y, frame] of dressing) addProp(x, y, frame);

// Filter out props overlapping any house 2x2 footprint
const houseTiles = new Set();
for (const b of houses) {
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      houseTiles.add(`${b.x + dx},${b.y + dy}`);
    }
  }
}
const seenProp = new Set();
const uniqueProps = props.filter((p) => {
  const k = `${p.x},${p.y}`;
  if (houseTiles.has(k) || seenProp.has(k)) return false;
  seenProp.add(k);
  return true;
});

doc.objects = [...houses, ...uniqueProps];

// C3.2 Waypoint & Shrine
doc.waypoints = [{ id: 'wp-thornwick', name: 'Thornwick Square', x: 28, y: 18 }];
doc.shrines = [{ kind: 'healing', x: 24, y: 14 }];

// C3.5 + C3.6 Region metadata (dusk, drizzle, Thornwick music & ambience)
doc.regions = [
  {
    name: 'town-thornwick',
    x1: 5,
    y1: 4,
    x2: 49,
    y2: 34,
    biome: 'forest',
    zone: 'highland',
    music: 'music_town_thornwick',
    ambience: 'amb_town_thornwick',
    light: 'dusk',
    weather: 'drizzle',
  },
];

// C3.4 Life: preserve original units not colliding with buildings/props, and populate 12+ ambient town NPCs/guards
const blocked = new Set([...houseTiles, ...seenProp]);
doc.units = (doc.units || []).filter((u) => !blocked.has(`${u.x},${u.y}`));

const baseNpcs = (doc.towns?.[0]?.npcs || []).slice(0, 2);
const ambientNpcs = [
  { name: 'North Gate Watchman', x: 26, y: 6, text: 'npc.gate_n1' },
  { name: 'North Gate Pikeman', x: 30, y: 6, text: 'npc.gate_n2' },
  { name: 'East Gate Watchman', x: 47, y: 21, text: 'npc.gate_e1' },
  { name: 'East Gate Lookout', x: 47, y: 23, text: 'npc.gate_e2' },
  { name: 'Market Tanner', x: 13, y: 15, text: 'npc.tanner' },
  { name: 'Cooper Apprentice', x: 17, y: 15, text: 'npc.cooper' },
  { name: 'Academy Scribe', x: 22, y: 14, text: 'npc.scribe' },
  { name: 'Smithy Bellows-Boy', x: 34, y: 14, text: 'npc.bellows' },
  { name: 'Granary Carter', x: 40, y: 15, text: 'npc.carter' },
  { name: 'Orlen the Grave-Tender', x: 14, y: 24, text: 'npc.grave' },
  { name: 'Stable Hound', x: 35, y: 24, text: 'npc.hound' },
  { name: 'Dockside Fisher', x: 41, y: 31, text: 'npc.fisher' },
];
if (doc.towns?.[0]) {
  doc.towns[0].npcs = [...baseNpcs, ...ambientNpcs];
}
doc.text = doc.text || {};
const npcLines = {
  'npc.gate_n1': 'North Gate Watchman: Keep your steel dry on the Mint Road.',
  'npc.gate_n2': 'North Gate Pikeman: Hound packs prowl past the third milestone.',
  'npc.gate_e1': 'East Gate Watchman: The Sunken Ford bridge holds, barely.',
  'npc.gate_e2': 'East Gate Lookout: Smoke rises from the alder reeds at dusk.',
  'npc.tanner': 'Market Tanner: Boiled hides keep peat-leeches off your shins.',
  'npc.cooper': 'Cooper Apprentice: Casks for salt pork and lantern oil, stacked fresh.',
  'npc.scribe': 'Academy Scribe: High Arcanist Vaelen inspects every vitrified shard.',
  'npc.bellows': 'Smithy Bellows-Boy: Master Kaelen keeps the coals white-hot till midnight.',
  'npc.carter': 'Granary Carter: Axle grease costs less than a broken wain in the mud.',
  'npc.grave': 'Orlen the Grave-Tender: Keep the tallow lit by the parish stones.',
  'npc.hound': 'Stable Hound: *Low bark, ears perked toward the east palisade.*',
  'npc.fisher': 'Dockside Fisher: Weir-pikes bite near the old pilings after rain.',
};
for (const [k, v] of Object.entries(npcLines)) {
  doc.text[k] = v;
}

fs.writeFileSync(MAP_PATH, JSON.stringify(doc, null, 2) + '\n');
console.log(`Built Thornwick: ${houses.length} houses, ${uniqueProps.length} props, ${doc.units.length} units`);
