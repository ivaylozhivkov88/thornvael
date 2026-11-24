#!/usr/bin/env node
/**
 * Reproducibly builds Highcrest Citadel (src/missions/highcrest-citadel.map.json):
 * Granite citadel walls, ash/crater terrain, 9 buildings, 30+ props, 14+ ambient NPCs/guards,
 * waypoint, dusk/ash region metadata, and ironcamp audio.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_PATH = path.join(here, '..', 'src', 'missions', 'thornwick-market.map.json');
const OUT_PATH = path.join(here, '..', 'src', 'missions', 'highcrest-citadel.map.json');

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
terrain.fill(DIRT);

const setT = (x, y, val) => {
  if (x >= 0 && x < w && y >= 0 && y < h) terrain[y * w + x] = val;
};

// Granite courtyard & ash-crust ridges
for (let y = 2; y <= h - 3; y++) {
  for (let x = 2; x <= w - 3; x++) {
    if ((x < 7 || x > 48 || y < 5 || y > 35) && ((x * 5 + y * 11) % 4 === 0)) {
      setT(x, y, GRASS);
    }
  }
}

// 9 buildings (Tavern 0 = Ash-Cup Mess, Armory 1 = Elda's Forge, Academy 2 = Orla's Archive)
const houses = [
  { kind: 1, x: 10, y: 9, owner: 0, hp: 100 },  // 0: The Ash-Cup Mess (Tavern)
  { kind: 1, x: 16, y: 9, owner: 0, hp: 100 },  // 1: Elda's Obsidian Forge (Shop)
  { kind: 1, x: 22, y: 9, owner: 0, hp: 100 },  // 2: Orla's Caldera Archive (Academy)
  { kind: 1, x: 32, y: 9, owner: 0, hp: 100 },  // 3: Marshal Vance's Keep & Questboard
  { kind: 1, x: 38, y: 9, owner: 0, hp: 100 },  // 4: Veyra's Rearguard Post
  { kind: 1, x: 10, y: 25, owner: 0, hp: 100 }, // 5: Siege Magazine
  { kind: 1, x: 18, y: 25, owner: 0, hp: 100 }, // 6: Granite Bastion Barracks
  { kind: 1, x: 32, y: 25, owner: 0, hp: 100 }, // 7: Ash-Filter Cistern
  { kind: 1, x: 40, y: 25, owner: 0, hp: 100 }, // 8: South Caldera Watchhouse
];

const props = [];
const addProp = (x, y, frame) => {
  if (x <= 1 || x >= w - 2 || y <= 1 || y >= h - 2) return;
  props.push({ kind: 0, x, y, frame });
};

// Citadel walls with N gate (26..30, 4) and S gate (26..30, 34)
for (let x = 5; x <= 49; x += 2) {
  if (x < 25 || x > 31) addProp(x, 4, 'camp/palisade');
  if (x < 25 || x > 31) addProp(x, 34, 'camp/palisade');
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
  [25, 33, 'camp/banner'],
  [31, 33, 'camp/banner'],
  [12, 15, 'camp/rack'],
  [16, 15, 'camp/fire'],
  [21, 15, 'camp/crates'],
  [33, 15, 'camp/fire'],
  [39, 15, 'camp/rack'],
  [13, 21, 'camp/crates'],
  [19, 21, 'camp/fire'],
  [24, 21, 'camp/banner'],
  [32, 21, 'camp/crates'],
  [38, 21, 'camp/fire'],
  [43, 21, 'camp/rack'],
  [12, 30, 'bones/tombstone'],
  [16, 30, 'bones/candles'],
  [35, 30, 'camp/crates'],
  [42, 30, 'camp/fire'],
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
  y: idx < 7 ? 18 : 23,
})).filter((u) => !blocked.has(`${u.x},${u.y}`));

while (baseUnits.length < 14) {
  baseUnits.push({ kind: base.units?.[0]?.kind ?? 0, team: 0, x: 28, y: 18 });
}

const doc = {
  ...base,
  name: 'Highcrest Citadel',
  w,
  h,
  terrain: rleEncode(terrain),
  height: rleEncode(new Uint8Array(w * h)),
  day: 1,
  triggers: [],
  objects: [...houses, ...uniqueProps],
  units: baseUnits,
  waypoints: [{ id: 'wp-ironcamp', name: 'Highcrest Granite Court', x: 28, y: 18 }],
  shrines: [{ kind: 'healing', x: 22, y: 18 }],
  regions: [
    {
      name: 'town-ironcamp',
      x1: 5,
      y1: 4,
      x2: 49,
      y2: 34,
      biome: 'caldera',
      zone: 'obsidian-caldera',
      music: 'music_town_ironcamp',
      ambience: 'amb_town_oakhaven',
      light: 'dusk',
      weather: 'ash',
    },
  ],
  towns: [
    {
      ...(base.towns?.[0] || {}),
      name: 'Highcrest Citadel',
      x: 28,
      y: 18,
      npcs: [
        { name: 'Marshal Vance', x: 32, y: 12, text: 'npc.vance' },
        { name: 'Harbor Marshal Veyra', x: 38, y: 12, text: 'npc.veyra' },
        { name: 'Weaponsmith Elda', x: 16, y: 12, text: 'npc.elda' },
        { name: 'Archivist Orla', x: 22, y: 12, text: 'npc.orla' },
        { name: 'North Gate Sentinel', x: 26, y: 6, text: 'npc.gate_n1' },
        { name: 'North Gate Halberdier', x: 30, y: 6, text: 'npc.gate_n2' },
        { name: 'South Gate Bombardier', x: 26, y: 32, text: 'npc.gate_s1' },
        { name: 'South Gate Lookout', x: 30, y: 32, text: 'npc.gate_s2' },
        { name: 'Ash-Cup Mess Steward', x: 10, y: 12, text: 'npc.mess' },
        { name: 'Siege Powder-Sergeant', x: 10, y: 28, text: 'npc.powder' },
        { name: 'Granite Bastion Quartermaster', x: 18, y: 28, text: 'npc.bastion' },
        { name: 'Caldera Cistern-Tender', x: 32, y: 28, text: 'npc.cistern' },
      ],
    },
  ],
  text: {
    ...(base.text || {}),
    'npc.vance': 'Marshal Vance: Every rampart above the caldera holds on iron and grit.',
    'npc.veyra': 'Harbor Marshal Veyra: The evacuation fleet sailed west; now we finish the march.',
    'npc.elda': 'Weaponsmith Elda: Obsidian-quenched steel bites straight through cinder-plate.',
    'npc.orla': 'Archivist Orla: The crater records show three seals beneath the threshold.',
    'npc.gate_n1': 'North Gate Sentinel: Keep your visor down against the ashfall.',
    'npc.gate_n2': 'North Gate Halberdier: Cinder-drakes circle the outer spire at dusk.',
    'npc.gate_s1': 'South Gate Bombardier: Powder casks stay sealed till the breach signal.',
    'npc.gate_s2': 'South Gate Lookout: Red vents glow along the caldera rim.',
    'npc.mess': 'Ash-Cup Mess Steward: Filtered broth and iron rations, hot off the brazier.',
    'npc.powder': 'Siege Powder-Sergeant: Keep open flame ten paces from the magazine.',
    'npc.bastion': 'Granite Bastion Quartermaster: Fresh halberd hafts and spare bucklers ready.',
    'npc.cistern': 'Caldera Cistern-Tender: Boiled slate-water, clean of sulfur grit.',
  },
};

fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2) + '\n');
console.log(`Built Highcrest: ${houses.length} houses, ${uniqueProps.length} props, ${doc.units.length} units`);
