#!/usr/bin/env node
/**
 * Reproducibly builds Redmarsh Outpost (src/missions/redmarsh-outpost.map.json):
 * Salt-flats caravan outpost with palisade, N/E gates, 9 buildings, 30+ tent/caravan props,
 * 12+ ambient NPCs/guards, waypoint, noon/clear region metadata, and Redmarsh audio cues.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_PATH = path.join(here, '..', 'src', 'missions', 'thornwick-market.map.json');
const OUT_PATH = path.join(here, '..', 'src', 'missions', 'redmarsh-outpost.map.json');

const GRASS = 0;
const DIRT = 1;

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

const base = JSON.parse(fs.readFileSync(BASE_PATH, 'utf8'));
const w = 56;
const h = 44;
const terrain = new Uint8Array(w * h);
terrain.fill(DIRT); // Dry ochre salt-flats & packed caravan earth

const setT = (x, y, val) => {
  if (x >= 0 && x < w && y >= 0 && y < h) terrain[y * w + x] = val;
};

// Salt-crust & scrub patches outside the main caravan avenues
for (let y = 2; y <= h - 3; y++) {
  for (let x = 2; x <= w - 3; x++) {
    if ((x < 8 || x > 47 || y < 6 || y > 34) && ((x * 7 + y * 13) % 5 === 0)) {
      setT(x, y, GRASS);
    }
  }
}
// Central caravan plaza
for (let y = 14; y <= 23; y++) {
  for (let x = 10; x <= 44; x++) {
    setT(x, y, DIRT);
  }
}

// 9 buildings (Tavern 0 = The Brine-Cask, Armory 1 = Bram's Salt-Scale Depot, Academy 2 = Zahra's Archive)
const houses = [
  { kind: 1, x: 10, y: 10, owner: 0, hp: 100 }, // 0: The Brine-Cask (Tavern)
  { kind: 1, x: 16, y: 10, owner: 0, hp: 100 }, // 1: Bram's Salt-Scale Depot (Shop)
  { kind: 1, x: 22, y: 10, owner: 0, hp: 100 }, // 2: Zahra's Harmonic Tent (Academy)
  { kind: 1, x: 32, y: 10, owner: 0, hp: 100 }, // 3: Outpost Questboard & Marshal Post
  { kind: 1, x: 38, y: 10, owner: 0, hp: 100 }, // 4: Alkali Cistern House
  { kind: 1, x: 10, y: 25, owner: 0, hp: 100 }, // 5: Caravan Harness Yard
  { kind: 1, x: 18, y: 25, owner: 0, hp: 100 }, // 6: Salt-Slinger Barracks
  { kind: 1, x: 32, y: 25, owner: 0, hp: 100 }, // 7: Tannery & Hide Store
  { kind: 1, x: 40, y: 25, owner: 0, hp: 100 }, // 8: East Watchhouse
];

const props = [];
const addProp = (x, y, frame) => {
  if (x <= 1 || x >= w - 2 || y <= 1 || y >= h - 2) return;
  props.push({ kind: 0, x, y, frame });
};

// Timber & rope perimeter palisade with N gate (26..30, 4) and E gate (49, 17..21)
for (let x = 6; x <= 48; x += 2) {
  if (x < 25 || x > 31) addProp(x, 4, 'camp/palisade');
  if (x < 26 || x > 30) addProp(x, 34, 'camp/palisade');
}
for (let y = 6; y <= 32; y += 2) {
  addProp(6, y, 'camp/palisade');
  if (y < 16 || y > 22) addProp(48, y, 'camp/palisade');
}

// Gate banners, braziers & caravan tents/crates (35+ props)
const dressing = [
  [25, 5, 'camp/banner'],
  [31, 5, 'camp/banner'],
  [25, 7, 'camp/fire'],
  [31, 7, 'camp/fire'],
  [47, 16, 'camp/banner'],
  [47, 22, 'camp/banner'],
  [12, 15, 'camp/tent'],
  [15, 15, 'camp/crates'],
  [20, 15, 'camp/fire'],
  [24, 15, 'camp/rack'],
  [31, 15, 'camp/tent'],
  [35, 15, 'camp/crates'],
  [41, 15, 'camp/fire'],
  [13, 21, 'camp/crates'],
  [17, 21, 'camp/tent'],
  [21, 21, 'camp/rack'],
  [26, 21, 'camp/fire'],
  [33, 21, 'camp/tent'],
  [37, 21, 'camp/crates'],
  [42, 21, 'camp/rack'],
  [14, 30, 'camp/tent'],
  [20, 30, 'camp/crates'],
  [26, 30, 'camp/fire'],
  [35, 30, 'camp/crates'],
  [42, 30, 'camp/tent'],
];
for (const [x, y, frame] of dressing) addProp(x, y, frame);

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

const blocked = new Set([...houseTiles, ...seenProp]);
const baseUnits = (base.units || []).slice(0, 12).map((u, idx) => ({
  ...u,
  x: 12 + (idx % 6) * 5,
  y: idx < 6 ? 18 : 23,
})).filter((u) => !blocked.has(`${u.x},${u.y}`));

// Ensure >= 12 ambient units
while (baseUnits.length < 14) {
  const idx = baseUnits.length;
  const ux = 14 + (idx % 7) * 4;
  const uy = idx < 7 ? 17 : 22;
  if (!blocked.has(`${ux},${uy}`)) {
    baseUnits.push({ kind: base.units?.[0]?.kind ?? 0, team: 0, x: ux, y: uy });
  } else {
    baseUnits.push({ kind: base.units?.[0]?.kind ?? 0, team: 0, x: 28, y: 17 });
  }
}

const doc = {
  ...base,
  name: 'Redmarsh Outpost',
  w,
  h,
  terrain: rleEncode(terrain),
  height: rleEncode(new Uint8Array(w * h)),
  day: 0,
  triggers: [],
  objects: [...houses, ...uniqueProps],
  units: baseUnits,
  waypoints: [{ id: 'wp-redmarsh', name: 'Redmarsh Caravan Plaza', x: 28, y: 18 }],
  shrines: [{ kind: 'healing', x: 22, y: 18 }],
  regions: [
    {
      name: 'town-redmarsh',
      x1: 6,
      y1: 4,
      x2: 48,
      y2: 34,
      biome: 'desert',
      zone: 'salt-flats',
      music: 'music_town_redmarsh',
      ambience: 'amb_town_redmarsh',
      light: 'noon',
      weather: 'clear',
    },
  ],
  towns: [
    {
      ...(base.towns?.[0] || {}),
      name: 'Redmarsh Outpost',
      x: 28,
      y: 18,
      npcs: [
        { name: 'Quartermaster Bram', x: 16, y: 13, text: 'npc.bram' },
        { name: 'Cask-Master Tull', x: 10, y: 13, text: 'npc.tull' },
        { name: 'Chronicler Zahra', x: 22, y: 13, text: 'npc.zahra' },
        { name: 'North Gate Salt-Guard', x: 26, y: 6, text: 'npc.gate_n1' },
        { name: 'North Gate Lookout', x: 30, y: 6, text: 'npc.gate_n2' },
        { name: 'East Gate Caravan-Sentry', x: 46, y: 18, text: 'npc.gate_e1' },
        { name: 'East Gate Dune-Slinger', x: 46, y: 20, text: 'npc.gate_e2' },
        { name: 'Caravan Drover', x: 14, y: 19, text: 'npc.drover' },
        { name: 'Cistern Water-Bearer', x: 38, y: 13, text: 'npc.cistern' },
        { name: 'Salt-Scale Apprentice', x: 19, y: 19, text: 'npc.apprentice' },
        { name: 'Outpost Outrider', x: 34, y: 19, text: 'npc.outrider' },
        { name: 'Mule-Train Handler', x: 40, y: 23, text: 'npc.handler' },
      ],
    },
  ],
  text: {
    ...(base.text || {}),
    'npc.bram': 'Quartermaster Bram: Water is four silver a gill, shade is two silver an hour.',
    'npc.tull': 'Cask-Master Tull: Boiled the scorpions out of the cistern before dawn.',
    'npc.zahra': 'Chronicler Zahra: First-Empire wardstones still hum beneath the ochre crust.',
    'npc.gate_n1': 'North Gate Salt-Guard: Keep your canteen capped past the alkali ditch.',
    'npc.gate_n2': 'North Gate Lookout: Dust devils mean dune-runners on the ridge.',
    'npc.gate_e1': 'East Gate Caravan-Sentry: Wagons roll at first light for Brine-Well.',
    'npc.gate_e2': 'East Gate Dune-Slinger: Watch the salt-pans for burrower tremors.',
    'npc.drover': 'Caravan Drover: Grease the axles twice in this grit.',
    'npc.cistern': 'Cistern Water-Bearer: Every drop hauled from the deep limestone seam.',
    'npc.apprentice': 'Salt-Scale Apprentice: Counting brass weights and dried jerky.',
    'npc.outrider': 'Outpost Outrider: The Twin Passes shimmer by noon.',
    'npc.handler': 'Mule-Train Handler: Pack-beasts hate the sulfur smell near the quarry.',
  },
};

fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2) + '\n');
console.log(`Built Redmarsh: ${houses.length} houses, ${uniqueProps.length} props, ${doc.units.length} units`);
