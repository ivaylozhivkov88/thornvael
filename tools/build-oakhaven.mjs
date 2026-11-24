#!/usr/bin/env node
/**
 * Reproducibly builds Oakhaven Bastion (src/missions/oakhaven-bastion.map.json):
 * Coastal harbor bastion with seawall, wooden piers over water, ironwood trees,
 * 9 buildings, 30+ props, 14+ ambient NPCs/guards, waypoint, night/fog metadata, and Oakhaven audio.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_PATH = path.join(here, '..', 'src', 'missions', 'thornwick-market.map.json');
const OUT_PATH = path.join(here, '..', 'src', 'missions', 'oakhaven-bastion.map.json');

const GRASS = 0;
const DIRT = 1;
const WATER = 2;

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
terrain.fill(GRASS);

const setT = (x, y, val) => {
  if (x >= 0 && x < w && y >= 0 && y < h) terrain[y * w + x] = val;
};

// Harbor water along south edge (y >= 34) with two wooden/stone piers
for (let y = 34; y < h; y++) {
  for (let x = 2; x < w - 2; x++) {
    setT(x, y, WATER);
  }
}
for (let y = 34; y <= 40; y++) {
  for (const px of [18, 19, 20, 34, 35, 36]) setT(px, y, DIRT);
}

// North Gate road (x=27..29, y=3..33) & coastal quay promenade (x=8..47, y=28..33)
for (let y = 3; y <= 33; y++) {
  setT(27, y, DIRT);
  setT(28, y, DIRT);
  setT(29, y, DIRT);
}
for (let y = 28; y <= 33; y++) {
  for (let x = 8; x <= 47; x++) setT(x, y, DIRT);
}
for (let y = 14; y <= 22; y++) {
  for (let x = 12; x <= 42; x++) setT(x, y, DIRT);
}

// 9 buildings (Tavern 0 = The Cinder Ward, Armory 1 = Brecht's Royal Armory, Academy 2 = Elowen's Ward-Study)
const houses = [
  { kind: 1, x: 10, y: 10, owner: 0, hp: 100 }, // 0: The Cinder Ward (Tavern)
  { kind: 1, x: 16, y: 10, owner: 0, hp: 100 }, // 1: Brecht's Royal Armory (Shop)
  { kind: 1, x: 22, y: 10, owner: 0, hp: 100 }, // 2: Elowen's Ward-Study (Academy)
  { kind: 1, x: 32, y: 10, owner: 0, hp: 100 }, // 3: Bailiff Hall & Questboard
  { kind: 1, x: 38, y: 10, owner: 0, hp: 100 }, // 4: Chief Healer Sera's Infirmary
  { kind: 1, x: 10, y: 24, owner: 0, hp: 100 }, // 5: Harbor Warehouse
  { kind: 1, x: 18, y: 24, owner: 0, hp: 100 }, // 6: Master-at-Arms Garrison
  { kind: 1, x: 32, y: 24, owner: 0, hp: 100 }, // 7: Shipwright Yard
  { kind: 1, x: 40, y: 24, owner: 0, hp: 100 }, // 8: Sea-Beacon Gatehouse
];

const props = [];
const addProp = (x, y, frame) => {
  if (x <= 1 || x >= w - 2 || y <= 1 || y >= h - 2) return;
  if (terrain[y * w + x] === WATER) return;
  props.push({ kind: 0, x, y, frame });
};

// Bastion perimeter seawall & ironwood trees
for (let x = 5; x <= 49; x += 2) {
  if (x < 25 || x > 31) addProp(x, 4, 'camp/palisade');
}
for (let y = 6; y <= 32; y += 2) {
  addProp(5, y, 'camp/palisade');
  addProp(49, y, 'camp/palisade');
}

const dressing = [
  [25, 5, 'camp/banner'],
  [31, 5, 'camp/banner'],
  [25, 7, 'camp/fire'],
  [31, 7, 'camp/fire'],
  [12, 16, 'camp/crates'],
  [15, 16, 'camp/fire'],
  [21, 16, 'camp/rack'],
  [33, 16, 'camp/crates'],
  [39, 16, 'camp/fire'],
  [14, 29, 'camp/crates'],
  [24, 29, 'camp/fire'],
  [31, 29, 'camp/crates'],
  [38, 29, 'camp/rack'],
  [44, 29, 'camp/fire'],
  // Ironwood trees along outer flanks
  [3, 8, 'highland/oak'],
  [3, 16, 'highland/oak'],
  [3, 24, 'highland/pine-a'],
  [52, 8, 'highland/oak'],
  [52, 16, 'highland/pine-b'],
  [52, 24, 'highland/oak'],
  [8, 7, 'highland/oak'],
  [45, 7, 'highland/oak'],
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
const baseUnits = (base.units || []).slice(0, 14).map((u, idx) => ({
  ...u,
  x: 12 + (idx % 7) * 5,
  y: idx < 7 ? 18 : 30,
})).filter((u) => !blocked.has(`${u.x},${u.y}`));

while (baseUnits.length < 14) {
  baseUnits.push({ kind: base.units?.[0]?.kind ?? 0, team: 0, x: 28, y: 18 });
}

const doc = {
  ...base,
  name: 'Oakhaven Bastion',
  w,
  h,
  terrain: rleEncode(terrain),
  height: rleEncode(new Uint8Array(w * h)),
  day: 2,
  triggers: [],
  objects: [...houses, ...uniqueProps],
  units: baseUnits,
  waypoints: [{ id: 'wp-oakhaven', name: 'Oakhaven Quay Plaza', x: 28, y: 18 }],
  shrines: [{ kind: 'healing', x: 38, y: 13 }],
  regions: [
    {
      name: 'town-oakhaven',
      x1: 5,
      y1: 4,
      x2: 49,
      y2: 34,
      biome: 'coast',
      zone: 'iron-coast',
      music: 'music_town_oakhaven',
      ambience: 'amb_town_oakhaven',
      light: 'night',
      weather: 'fog',
    },
  ],
  towns: [
    {
      ...(base.towns?.[0] || {}),
      name: 'Oakhaven Bastion',
      x: 28,
      y: 18,
      npcs: [
        { name: 'Bailiff Aldric', x: 32, y: 13, text: 'npc.aldric' },
        { name: 'Ward-Scholar Elowen', x: 22, y: 13, text: 'npc.elowen' },
        { name: 'Master-at-Arms Toren', x: 18, y: 27, text: 'npc.toren' },
        { name: 'Chief Healer Sera', x: 38, y: 14, text: 'npc.sera' },
        { name: 'Armorer Brecht', x: 16, y: 13, text: 'npc.brecht' },
        { name: 'Quartermistress Ysolde', x: 10, y: 13, text: 'npc.ysolde' },
        { name: 'North Gate Halberdier', x: 26, y: 6, text: 'npc.gate_n1' },
        { name: 'North Gate Arbalest', x: 30, y: 6, text: 'npc.gate_n2' },
        { name: 'West Pier Watchman', x: 19, y: 36, text: 'npc.pier_w' },
        { name: 'East Pier Bosun', x: 35, y: 36, text: 'npc.pier_e' },
        { name: 'Seawall Lantern-Keeper', x: 14, y: 31, text: 'npc.lantern' },
        { name: 'Ironwood Shipwright', x: 32, y: 27, text: 'npc.shipwright' },
      ],
    },
  ],
  text: {
    ...(base.text || {}),
    'npc.aldric': 'Bailiff Aldric: Every berth along the Iron Coast is accounted for.',
    'npc.elowen': 'Ward-Scholar Elowen: The sea-fog carries harmonic drift from the shattered beacons.',
    'npc.toren': 'Master-at-Arms Toren: Oakhaven holds the coast because we drill in the dark.',
    'npc.sera': 'Chief Healer Sera: Saltwater festers shrapnel wounds in hours. Keep bandages dry.',
    'npc.brecht': 'Armorer Brecht: Royal mail tempered against sea-spray and pike-thrust.',
    'npc.ysolde': 'Quartermistress Ysolde: Hot salt-beef and dry powder in the Cinder Ward.',
    'npc.gate_n1': 'North Gate Halberdier: Keep your lantern hooded past the seawall.',
    'npc.gate_n2': 'North Gate Arbalest: Fog banks roll in thick off the shoals tonight.',
    'npc.pier_w': 'West Pier Watchman: Supply caravels anchor outside the reef.',
    'npc.pier_e': 'East Pier Bosun: Tarred oak holds even when the tide surges.',
    'npc.lantern': 'Seawall Lantern-Keeper: Oil burns blue when prism-ships pass.',
    'npc.shipwright': 'Ironwood Shipwright: Nothing splits ironwood planks save fire.',
  },
};

fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2) + '\n');
console.log(`Built Oakhaven: ${houses.length} houses, ${uniqueProps.length} props, ${doc.units.length} units`);
