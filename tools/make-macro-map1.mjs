import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, '../src/missions/map1-border-fords.map.json');

const W = 192;
const H = 192;
const N = W * H;

// Terrain constants matching src/map.ts
const T_GRASS = 0;
const T_DIRT = 1;
const T_WATER = 2;
const T_ROCK = 3;
const T_MARSH = 4;

// Unit Kind constants matching src/sim/combat.ts
const K_WARRIOR = 0;
const K_ARCHER = 1;
const K_HERO = 2;
const K_MAGE = 3;
const K_GNOLL = 4;
const K_GOLEM = 5;
const K_IMP = 6;

function rleEncode(arr) {
  const out = [];
  for (let i = 0; i < arr.length; ) {
    let j = i + 1;
    while (j < arr.length && arr[j] === arr[i]) j++;
    out.push(arr[i], j - i);
    i = j;
  }
  return out;
}

function hash2(seed, x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function paintLine(terrain, height, x0, y0, x1, y1, radius, tVal, hVal) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let s = 0; s <= steps; s++) {
    const cx = Math.round(x0 + ((x1 - x0) * s) / steps);
    const cy = Math.round(y0 + ((y1 - y0) * s) / steps);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius + 1) {
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 1 && x < W - 1 && y >= 1 && y < H - 1) {
            terrain[y * W + x] = tVal;
            if (hVal !== undefined) height[y * W + x] = hVal;
          }
        }
      }
    }
  }
}

function paintRect(terrain, height, x1, y1, x2, y2, tVal, hVal) {
  for (let y = Math.max(0, y1); y <= Math.min(H - 1, y2); y++) {
    for (let x = Math.max(0, x1); x <= Math.min(W - 1, x2); x++) {
      terrain[y * W + x] = tVal;
      if (hVal !== undefined) height[y * W + x] = hVal;
    }
  }
}

function buildTerrainAndHeight() {
  const terrain = new Uint8Array(N).fill(T_GRASS);
  const height = new Uint8Array(N).fill(1);

  // Base regional terrain & elevation
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const n = hash2(101, x >> 2, y >> 2);

      // Outer border cliffs
      if (x < 2 || x >= W - 2 || y < 2 || y >= H - 2) {
        terrain[idx] = T_ROCK;
        height[idx] = 3;
        continue;
      }

      // Region 2: Fenwick's Peat & Lantern Passage (45..118, 129..184) -> Marsh & low ground
      if (x >= 45 && x <= 118 && y >= 129 && y <= 184) {
        terrain[idx] = n > 0.32 ? T_MARSH : T_GRASS;
        height[idx] = 0;
      }
      // Region 3: Greywood Canopy & Vitrified Kilns (16..108, 12..71) -> Forest uplands
      else if (x >= 16 && x <= 108 && y >= 12 && y <= 71) {
        terrain[idx] = n > 0.78 ? T_DIRT : T_GRASS;
        height[idx] = n > 0.45 ? 2 : 1;
      }
      // Region 4: Craghorn Defile & Alder Bridge (105..180, 64..132) -> Highland plateau
      else if (x >= 105 && x <= 180 && y >= 64 && y <= 132) {
        terrain[idx] = n > 0.65 ? T_DIRT : T_GRASS;
        height[idx] = 2;
      }
      // Region 5: Ravenwatch Keep & Weeping Ossuary (109..186, 12..63) -> Crypt stone & marshy sanctum
      else if (x >= 109 && x <= 186 && y >= 12 && y <= 63) {
        terrain[idx] = n > 0.55 ? T_DIRT : T_MARSH;
        height[idx] = x > 148 ? 0 : 2;
      }
      // Region 6: Undervault Links & Ashbrook Gate (119..186, 133..186) -> Southern rocky pass
      else if (x >= 119 && x <= 186 && y >= 133 && y <= 186) {
        terrain[idx] = n > 0.5 ? T_DIRT : T_GRASS;
        height[idx] = 2;
      }
    }
  }

  // Alder River running N-S through Sunken Ford (x ~ 72) and East Branch at Alder Bridge (x ~ 138)
  for (let y = 4; y < H - 4; y++) {
    const wx1 = 72 + Math.round(Math.sin(y / 14) * 3);
    for (let dx = -2; dx <= 2; dx++) {
      terrain[y * W + (wx1 + dx)] = T_WATER;
      height[y * W + (wx1 + dx)] = 0;
    }
    const wx2 = 138 + Math.round(Math.cos(y / 16) * 2);
    if (y >= 56 && y <= 136) {
      for (let dx = -2; dx <= 2; dx++) {
        terrain[y * W + (wx2 + dx)] = T_WATER;
        height[y * W + (wx2 + dx)] = 0;
      }
    }
  }

  // Region 0: Thornwick Market Bailey (14..42, 78..110)
  paintRect(terrain, height, 14, 78, 42, 110, T_DIRT, 1);

  // Major Roads & Ford Crossings (guaranteed walkable Dirt/Marsh paths connecting all regions)
  // 1. Alder Highway: Thornwick (26,94) -> Sunken Ford (74,98) -> Command Bluff (96,88) -> Alder Bridge (128,96..144,96) -> Craghorn Quarry (162,114)
  paintLine(terrain, height, 26, 94, 74, 98, 2, T_DIRT, 1);
  paintRect(terrain, height, 68, 95, 78, 101, T_DIRT, 0); // Sunken Ford shallow crossing
  paintLine(terrain, height, 74, 98, 96, 88, 2, T_DIRT, 1);
  paintLine(terrain, height, 96, 88, 128, 96, 2, T_DIRT, 2);
  paintRect(terrain, height, 133, 93, 143, 99, T_DIRT, 2); // Three-Arch Alder Bridge span
  paintLine(terrain, height, 138, 96, 162, 114, 2, T_DIRT, 2);

  // 2. Old Mint Road: Thornwick N-Gate (28,78) -> Burned Mint (32,28) -> Old Kilns (42,36) -> Greywood Sawmill (58,36) -> Sunken Ford
  paintLine(terrain, height, 28, 78, 32, 28, 2, T_DIRT, 1);
  paintLine(terrain, height, 32, 28, 58, 36, 2, T_DIRT, 2);
  paintLine(terrain, height, 58, 36, 74, 98, 2, T_DIRT, 1);

  // 3. Plank-Walk & Ravine Trail: Sunken Ford (74,98) -> Fenwick Boardwalks (70,146) -> Lantern Passage (96,162) -> Undervault Links (134,152) -> Ashbrook Gate (172,174) -> Map 2 Exit (180,182)
  paintLine(terrain, height, 74, 98, 70, 146, 2, T_DIRT, 0);
  paintLine(terrain, height, 70, 146, 96, 162, 2, T_DIRT, 0);
  paintLine(terrain, height, 96, 162, 134, 152, 2, T_DIRT, 1);
  paintLine(terrain, height, 134, 152, 172, 174, 2, T_DIRT, 2);
  paintLine(terrain, height, 172, 174, 180, 182, 2, T_DIRT, 2);

  // 4. Craghorn Switchbacks & Ravenwatch/Ossuary Approaches
  paintLine(terrain, height, 128, 96, 116, 68, 2, T_DIRT, 2);
  paintLine(terrain, height, 128, 96, 132, 68, 2, T_DIRT, 2);
  paintLine(terrain, height, 132, 68, 136, 48, 2, T_DIRT, 2);
  paintLine(terrain, height, 136, 48, 152, 32, 2, T_DIRT, 1);
  paintLine(terrain, height, 152, 32, 168, 20, 3, T_DIRT, 0);

  return { terrain, height };
}

const { terrain, height } = buildTerrainAndHeight();

// Houses (2x2 footprint each) & Trees (1x1 footprint)
// Houses 0..2 are Thornwick Tavern, Armory Shop, Runic Academy. Houses 3..6 are regional landmarks.
const objects = [
  { kind: 1, x: 20, y: 86, owner: 0, hp: 300 }, // House 0: Thornwick Tavern
  { kind: 1, x: 26, y: 86, owner: 0, hp: 300 }, // House 1: Thornwick Armory Shop
  { kind: 1, x: 32, y: 86, owner: 0, hp: 300 }, // House 2: Thornwick Runic Academy
  { kind: 1, x: 68, y: 90, owner: 0, hp: 180 }, // House 3: Sunken Ford Burned Tollhouse
  { kind: 1, x: 90, y: 156, owner: 0, hp: 180 }, // House 4: Keeper Soren's Lantern Hut
  { kind: 1, x: 52, y: 30, owner: 0, hp: 220 }, // House 5: Greywood Sawmill
  { kind: 1, x: 166, y: 168, owner: 0, hp: 350 }, // House 6: Ashbrook Manor Granary
];

// Track blocked tiles so no tree, shrine, or unit ever overlaps blocked terrain or another unit
const blocked = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  if (terrain[i] === T_WATER || terrain[i] === T_ROCK) blocked[i] = 1;
}
for (const o of objects) {
  const sz = o.kind === 1 ? 2 : 1;
  for (let dy = 0; dy < sz; dy++) {
    for (let dx = 0; dx < sz; dx++) {
      blocked[(o.y + dy) * W + (o.x + dx)] = 1;
    }
  }
}

const waypoints = [
  { id: 'wp-thornwick', name: 'Thornwick Market Square', x: 24, y: 94, activated: true },
  { id: 'wp-sunken-ford', name: 'Sunken Ford Crossing', x: 74, y: 98 },
  { id: 'wp-lantern-passage', name: 'Lantern Passage Ravine', x: 96, y: 162 },
  { id: 'wp-greywood', name: 'Greywood Sawmill', x: 58, y: 36 },
  { id: 'wp-alder-bridge', name: 'Alder Bridge Cutwater', x: 128, y: 96 },
  { id: 'wp-ravenwatch', name: 'Ravenwatch Crypt Stairs', x: 136, y: 48 },
  { id: 'wp-ashbrook', name: 'Ashbrook Southern Gate', x: 160, y: 168 },
];

const shrines = [
  { x: 64, y: 96, kind: 'healing', cooldown: 1500 },
  { x: 82, y: 154, kind: 'mana', cooldown: 1500 },
  { x: 68, y: 42, kind: 'combat', cooldown: 1800 },
  { x: 132, y: 88, kind: 'armor', cooldown: 1800 },
  { x: 144, y: 44, kind: 'ward', cooldown: 1800 },
  { x: 154, y: 160, kind: 'haste', cooldown: 1500 },
];

const adventureObjects = [
  { x: 54, y: 82, kind: 'watermill', rewardGold: 150 },
  { x: 70, y: 146, kind: 'magic_well' },
  { x: 40, y: 52, kind: 'windmill', rewardGold: 200 },
  { x: 168, y: 32, kind: 'creature_bank', rewardGold: 500, rewardArtifact: true },
];

const exits = [
  {
    x: 180,
    y: 182,
    targetMap: 'map2-redmarsh-wastes',
    targetX: 28,
    targetY: 36,
    label: 'Southern Salt-Road to Redmarsh Outpost',
    kind: 'road',
  },
];

// Ensure all shrines, waypoints, adventureObjects, and exits sit on walkable Dirt/Grass
for (const pt of [...waypoints, ...shrines, ...adventureObjects, ...exits]) {
  const idx = pt.y * W + pt.x;
  if (terrain[idx] === T_WATER || terrain[idx] === T_ROCK) terrain[idx] = T_DIRT;
  blocked[idx] = 0;
}

const taken = new Set();
for (const pt of [...waypoints, ...shrines, ...adventureObjects, ...exits]) {
  taken.add(pt.y * W + pt.x);
}

const units = [];
function addUnit(u) {
  let { x, y } = u;
  // Find nearest unblocked, untaken tile if (x,y) is occupied
  if (blocked[y * W + x] || taken.has(y * W + x)) {
    let found = false;
    for (let r = 1; r <= 8 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 2 && nx < W - 2 && ny >= 2 && ny < H - 2) {
            const nIdx = ny * W + nx;
            if (!blocked[nIdx] && !taken.has(nIdx)) {
              x = nx;
              y = ny;
              found = true;
            }
          }
        }
      }
    }
  }
  const idx = y * W + x;
  if (terrain[idx] === T_WATER || terrain[idx] === T_ROCK) {
    terrain[idx] = T_DIRT;
    blocked[idx] = 0;
  }
  taken.add(idx);
  const id = units.length;
  units.push({ ...u, x, y });
  return id;
}

// Unit 0: Player Hero inside Thornwick Market
addUnit({ kind: K_HERO, team: 0, x: 26, y: 94 });

// Units 1..4: 4 Dormant Mercenaries for Thornwick Tavern
addUnit({ kind: K_WARRIOR, team: 0, x: 18, y: 84, dormant: true });
addUnit({ kind: K_ARCHER, team: 0, x: 19, y: 84, dormant: true });
addUnit({ kind: K_MAGE, team: 0, x: 20, y: 84, dormant: true });
addUnit({ kind: K_WARRIOR, team: 0, x: 21, y: 84, dormant: true });

// Region 1: Sunken Ford & Willow Weirs (Group 1, Packs 1..3) + Chieftain Grok'tar
addUnit({ kind: K_GNOLL, team: 1, x: 76, y: 98, group: 1, pack: 1, tier: 1, family: 'briar-hound' });
addUnit({ kind: K_GNOLL, team: 1, x: 78, y: 99, group: 1, pack: 1, tier: 1, family: 'briar-hound' });
addUnit({ kind: K_ARCHER, team: 1, x: 82, y: 96, group: 1, pack: 1, tier: 1, family: 'quill-fiend' });
addUnit({ kind: K_GNOLL, team: 1, x: 86, y: 92, group: 1, pack: 2, tier: 2, family: 'briar-hound' });
addUnit({ kind: K_ARCHER, team: 1, x: 88, y: 90, group: 1, pack: 2, tier: 2, family: 'quill-fiend' });
const groktarId = addUnit({
  kind: K_GNOLL,
  team: 1,
  x: 96,
  y: 88,
  group: 1,
  pack: 3,
  vip: true,
  tier: 3,
  family: 'thorn-boar',
  bossMods: ['extra_strong', 'stone_skin'],
});
addUnit({ kind: K_GNOLL, team: 1, x: 94, y: 89, group: 1, pack: 3, tier: 2, family: 'briar-hound' });
addUnit({ kind: K_ARCHER, team: 1, x: 98, y: 87, group: 1, pack: 3, tier: 2, family: 'quill-fiend' });

// Region 2: Fenwick's Peat & Lantern Passage (Group 2, Packs 4..6) + Super-Unique pyre-chanter-malgath
addUnit({ kind: K_IMP, team: 1, x: 72, y: 148, group: 2, pack: 4, tier: 2, family: 'mire-wisp' });
addUnit({ kind: K_IMP, team: 1, x: 74, y: 150, group: 2, pack: 4, tier: 2, family: 'mire-wisp' });
addUnit({ kind: K_GOLEM, team: 1, x: 84, y: 156, group: 2, pack: 5, tier: 2, family: 'flintback' });
addUnit({ kind: K_GOLEM, team: 1, x: 86, y: 158, group: 2, pack: 5, tier: 3, family: 'flintback' });
const malgathId = addUnit({
  kind: K_MAGE,
  team: 1,
  x: 98,
  y: 164,
  group: 2,
  pack: 6,
  vip: true,
  tier: 4,
  family: 'pyre-chanter-malgath',
  bossMods: ['fire_enchanted', 'magic_resistant'],
});
addUnit({ kind: K_IMP, team: 1, x: 96, y: 165, group: 2, pack: 6, tier: 2, family: 'cinderling' });
addUnit({ kind: K_IMP, team: 1, x: 97, y: 166, group: 2, pack: 6, tier: 2, family: 'cinderling' });
addUnit({ kind: K_IMP, team: 1, x: 99, y: 166, group: 2, pack: 6, tier: 2, family: 'cinderling' });

// Region 3: Greywood Canopy & Vitrified Kilns
// SQ1-01 Burned Border Mint (Group 7, Pack 7)
addUnit({ kind: K_WARRIOR, team: 1, x: 32, y: 28, group: 7, pack: 7, tier: 2, family: 'hollow-knight' });
addUnit({ kind: K_WARRIOR, team: 1, x: 34, y: 30, group: 7, pack: 7, tier: 3, family: 'hollow-knight' });
addUnit({ kind: K_MAGE, team: 1, x: 33, y: 27, group: 7, pack: 7, tier: 2, family: 'fallen-shaman' });

// SQ1-02 Vitrified Kilns (Group 8, Pack 8) + Super-Unique volt-stalker-krazak
const krazakId = addUnit({
  kind: K_GNOLL,
  team: 1,
  x: 42,
  y: 36,
  group: 8,
  pack: 8,
  vip: true,
  tier: 4,
  family: 'volt-stalker-krazak',
  bossMods: ['lightning_enchanted', 'extra_fast'],
});
addUnit({ kind: K_GNOLL, team: 1, x: 40, y: 37, group: 8, pack: 8, tier: 2, family: 'briar-hound' });
addUnit({ kind: K_GNOLL, team: 1, x: 44, y: 37, group: 8, pack: 8, tier: 2, family: 'briar-hound' });
addUnit({ kind: K_GNOLL, team: 1, x: 42, y: 39, group: 8, pack: 8, tier: 2, family: 'thorn-boar' });

// SQ1-03 Greywood Sawmill (Group 9, Pack 9) + Super-Unique frostquill-skara
const skaraId = addUnit({
  kind: K_ARCHER,
  team: 1,
  x: 62,
  y: 38,
  group: 9,
  pack: 9,
  vip: true,
  tier: 4,
  family: 'frostquill-skara',
  bossMods: ['cold_enchanted', 'extra_strong'],
});
addUnit({ kind: K_ARCHER, team: 1, x: 60, y: 39, group: 9, pack: 9, tier: 2, family: 'quill-fiend' });
addUnit({ kind: K_ARCHER, team: 1, x: 64, y: 39, group: 9, pack: 9, tier: 2, family: 'quill-fiend' });
addUnit({ kind: K_GNOLL, team: 1, x: 63, y: 41, group: 9, pack: 9, tier: 3, family: 'gloom-stag' });

// Region 4: Craghorn Defile & Alder Bridge
// MQ1-05 Alder Bridge Defense (Group 5, Pack 10..11)
addUnit({ kind: K_GOLEM, team: 1, x: 116, y: 68, group: 5, pack: 10, tier: 3, family: 'rootbound' });
addUnit({ kind: K_GOLEM, team: 1, x: 132, y: 68, group: 5, pack: 10, tier: 3, family: 'rootbound' });
addUnit({ kind: K_GOLEM, team: 1, x: 138, y: 96, group: 5, pack: 11, tier: 3, family: 'rootbound' });
addUnit({ kind: K_GNOLL, team: 1, x: 140, y: 98, group: 5, pack: 11, tier: 3, family: 'pale-burrower' });
addUnit({ kind: K_GOLEM, team: 1, x: 142, y: 95, group: 5, pack: 11, tier: 4, family: 'ironbark' });

// SQ1-04 Craghorn Granite Quarry (Group 10, Pack 12) + Super-Unique bramblefist-oakhulk
const thornmawId = addUnit({
  kind: K_GOLEM,
  team: 1,
  x: 162,
  y: 114,
  group: 10,
  pack: 12,
  vip: true,
  tier: 5,
  family: 'bramblefist-oakhulk',
  bossMods: ['extra_strong', 'stone_skin', 'cursed'],
});
addUnit({ kind: K_GOLEM, team: 1, x: 160, y: 115, group: 10, pack: 12, tier: 3, family: 'rootbound' });
addUnit({ kind: K_GOLEM, team: 1, x: 164, y: 115, group: 10, pack: 12, tier: 3, family: 'rootbound' });
addUnit({ kind: K_GNOLL, team: 1, x: 162, y: 117, group: 10, pack: 12, tier: 3, family: 'pale-burrower' });

// Region 5: Ravenwatch Keep & Weeping Ossuary
// MQ1-03 Ravenwatch Outer Courtyard (Group 3, Pack 13)
addUnit({ kind: K_WARRIOR, team: 1, x: 134, y: 46, group: 3, pack: 13, tier: 3, family: 'hollow-knight' });
addUnit({ kind: K_WARRIOR, team: 1, x: 138, y: 46, group: 3, pack: 13, tier: 3, family: 'hollow-knight' });
addUnit({ kind: K_MAGE, team: 1, x: 136, y: 44, group: 3, pack: 13, tier: 3, family: 'fallen-shaman' });
addUnit({ kind: K_ARCHER, team: 1, x: 140, y: 48, group: 3, pack: 13, tier: 3, family: 'quill-fiend' });

// SQ1-05 Sunken Scriptorium (Group 11, Pack 14) + Mordred the Ashen
addUnit({
  kind: K_WARRIOR,
  team: 1,
  x: 152,
  y: 32,
  group: 11,
  pack: 14,
  vip: true,
  tier: 4,
  family: 'hollow-knight',
  bossMods: ['cold_enchanted', 'cursed'],
});
addUnit({ kind: K_GNOLL, team: 1, x: 150, y: 33, group: 11, pack: 14, tier: 3, family: 'ruin-mite' });
addUnit({ kind: K_GNOLL, team: 1, x: 154, y: 33, group: 11, pack: 14, tier: 3, family: 'ruin-mite' });

// MQ1-04 Weeping Ossuary Sanctum (Group 4, Pack 15) + Act Boss morvessa
const morvessaId = addUnit({
  kind: K_MAGE,
  team: 1,
  x: 168,
  y: 20,
  group: 4,
  pack: 15,
  vip: true,
  tier: 5,
  family: 'morvessa',
  bossMods: ['extra_fast', 'magic_resistant', 'cursed'],
});
addUnit({ kind: K_GNOLL, team: 1, x: 166, y: 22, group: 4, pack: 15, tier: 4, family: 'ruin-mite' });
addUnit({ kind: K_GNOLL, team: 1, x: 170, y: 22, group: 4, pack: 15, tier: 4, family: 'ruin-mite' });
addUnit({ kind: K_WARRIOR, team: 1, x: 168, y: 23, group: 4, pack: 15, tier: 4, family: 'hollow-knight' });

// Region 6: Undervault Links & Ashbrook Gate
// SQ1-06 Undervault Gallery Four (Group 12, Pack 16)
addUnit({ kind: K_GNOLL, team: 1, x: 134, y: 152, group: 12, pack: 16, tier: 4, family: 'pale-burrower' });
addUnit({ kind: K_GNOLL, team: 1, x: 136, y: 153, group: 12, pack: 16, tier: 4, family: 'pale-burrower' });
addUnit({ kind: K_GOLEM, team: 1, x: 133, y: 154, group: 12, pack: 16, tier: 4, family: 'flintback' });

// MQ1-06 Ashbrook Gatehouse Siege (Group 6, Pack 17) + Siege Commander Velen
const vaelenId = addUnit({
  kind: K_WARRIOR,
  team: 1,
  x: 172,
  y: 174,
  group: 6,
  pack: 17,
  vip: true,
  tier: 4,
  family: 'hollow-knight',
  bossMods: ['blessed_aura', 'stone_skin', 'extra_strong'],
});
addUnit({ kind: K_MAGE, team: 1, x: 174, y: 176, group: 6, pack: 17, tier: 4, family: 'ash-weaver' });
addUnit({ kind: K_MAGE, team: 1, x: 170, y: 176, group: 6, pack: 17, tier: 4, family: 'ash-weaver' });
addUnit({ kind: K_GOLEM, team: 1, x: 172, y: 172, group: 6, pack: 17, tier: 4, family: 'flintback' });

// Scatter decorative forest trees outside roads, buildings, and unit tiles
for (let i = 0; i < 180; i++) {
  const tx = 6 + ((i * 37) % (W - 12));
  const ty = 6 + ((i * 53) % (H - 12));
  const idx = ty * W + tx;
  if (
    terrain[idx] === T_GRASS &&
    !blocked[idx] &&
    !taken.has(idx) &&
    (tx < 12 || tx > 46 || ty < 74 || ty > 114) // Keep Thornwick Market clear
  ) {
    objects.push({ kind: 0, x: tx, y: ty });
    blocked[idx] = 1;
  }
}

const doc = {
  format: 'thornvael-map',
  version: 2,
  name: 'The Border Fords & Weeping Ossuary',
  w: W,
  h: H,
  day: 0,
  terrain: rleEncode(terrain),
  height: rleEncode(height),
  objects,
  units,
  regions: [
    {
      name: 'Thornwick Market (City Hub)',
      x1: 12,
      y1: 76,
      x2: 44,
      y2: 112,
      biome: 'forest',
      zone: 'highland',
      music: 'music_town_thornwick',
      ambience: 'amb_town_thornwick',
    },
    {
      name: 'Sunken Ford & Willow Weirs',
      x1: 45,
      y1: 72,
      x2: 104,
      y2: 128,
      biome: 'forest',
      zone: 'highland',
      music: 'music_explore_act1_fords',
      ambience: 'amb_river_ford',
    },
    {
      name: 'Fenwick Peat & Lantern Passage',
      x1: 45,
      y1: 129,
      x2: 118,
      y2: 184,
      biome: 'marsh',
      zone: 'ruinstone',
      music: 'music_explore_act1_fen',
      ambience: 'amb_fen',
    },
    {
      name: 'Greywood Canopy & Vitrified Kilns',
      x1: 16,
      y1: 12,
      x2: 108,
      y2: 71,
      biome: 'forest',
      zone: 'highland',
      music: 'music_explore_act1_fords',
      ambience: 'amb_greywood',
    },
    {
      name: 'Craghorn Defile & Alder Bridge',
      x1: 105,
      y1: 64,
      x2: 180,
      y2: 132,
      biome: 'highlands',
      zone: 'crypt',
      music: 'music_explore_act1_fords',
      ambience: 'amb_river_ford',
    },
    {
      name: 'Ravenwatch Keep & Weeping Ossuary',
      x1: 109,
      y1: 12,
      x2: 186,
      y2: 63,
      biome: 'crypt',
      zone: 'ruinstone',
      music: 'music_explore_act1_fen',
      ambience: 'amb_ruined_sanctum',
    },
    {
      name: 'Undervault Links & Ashbrook Gate',
      x1: 119,
      y1: 133,
      x2: 186,
      y2: 186,
      biome: 'highlands',
      zone: 'ruinstone',
      music: 'music_explore_act1_fen',
      ambience: 'amb_ruined_sanctum',
    },
  ],
  players: ['Vanguard Company', 'Salt-Tithe Host', 'Neutral', 'Frontier Wardens'],
  waypoints,
  shrines,
  adventureObjects,
  exits,
  towns: [
    {
      name: 'Thornwick',
      tavern: 0,
      shop: 1,
      school: 2,
      tiers: [1, 3],
      spells: [0, 1, 4, 7, 9, 11, 19],
      mercs: [
        { unit: 1, price: 60 },
        { unit: 2, price: 60 },
        { unit: 3, price: 80 },
        { unit: 4, price: 140 },
      ],
      npcs: [
        { name: 'Warden Hale', x: 18, y: 90, text: 'npc.hale' },
        { name: 'Reeve Marlow', x: 22, y: 92, text: 'npc.marlow' },
        { name: 'Edda the Miller', x: 32, y: 95, text: 'npc.miller' },
        { name: 'Ford-Scout Bren', x: 38, y: 88, text: 'npc.bren' },
        { name: 'Orlen the Grave-Tender', x: 28, y: 104, text: 'npc.orlen' },
      ],
    },
  ],
  triggers: [
    {
      id: 'init-briefing',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'yes', a: [] }, op: 0, b: { k: 'constant', a: [1] } }],
      acts: [
        { k: 'giveMoney', a: [0, 300] },
        { k: 'setSub', a: [0, 1] },
        { k: 'setSub', a: [6, 1] },
        { k: 'message', a: [1] },
      ],
    },
    {
      id: 'mq1-01-ford-cleared',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [1] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [0, 2] },
        { k: 'setSub', a: [1, 1] },
        { k: 'giveXp', a: [0, 350] },
        { k: 'message', a: [2] },
      ],
    },
    {
      id: 'mq1-02-lantern-cleared',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [2] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [1, 2] },
        { k: 'setSub', a: [2, 1] },
        { k: 'giveXp', a: [0, 450] },
        { k: 'message', a: [3] },
      ],
    },
    {
      id: 'mq1-03-ravenwatch-cleared',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [3] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [2, 2] },
        { k: 'setSub', a: [3, 1] },
        { k: 'giveXp', a: [0, 600] },
        { k: 'message', a: [4] },
      ],
    },
    {
      id: 'mq1-04-morvessa-slain',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'isVip', a: [morvessaId] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [3, 2] },
        { k: 'setSub', a: [4, 1] },
        { k: 'giveXp', a: [0, 1200] },
        { k: 'message', a: [5] },
      ],
    },
    {
      id: 'mq1-05-alder-bridge-held',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [5] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [4, 2] },
        { k: 'setSub', a: [5, 1] },
        { k: 'giveXp', a: [0, 900] },
        { k: 'message', a: [6] },
      ],
    },
    {
      id: 'mq1-06-ashbrook-victory',
      once: true,
      enabled: true,
      conds: [
        { a: { k: 'groupSize', a: [6] }, op: 0, b: { k: 'constant', a: [0] } },
        { a: { k: 'isVip', a: [morvessaId] }, op: 0, b: { k: 'constant', a: [0] } },
      ],
      acts: [
        { k: 'setSub', a: [5, 2] },
        { k: 'giveXp', a: [0, 1500] },
        { k: 'message', a: [7] },
        { k: 'win', a: [] },
      ],
    },
    {
      id: 'sq1-01-burned-mint',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [7] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [6, 2] },
        { k: 'giveMoney', a: [0, 350] },
        { k: 'giveXp', a: [0, 400] },
        { k: 'message', a: [8] },
      ],
    },
    {
      id: 'sq1-02-vitrified-kilns',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [8] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [7, 2] },
        { k: 'giveMoney', a: [0, 400] },
        { k: 'giveXp', a: [0, 450] },
        { k: 'message', a: [9] },
      ],
    },
    {
      id: 'sq1-03-greywood-mill',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [9] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [8, 2] },
        { k: 'giveMoney', a: [0, 400] },
        { k: 'giveXp', a: [0, 500] },
        { k: 'message', a: [10] },
      ],
    },
    {
      id: 'sq1-04-ironroot-quarry',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [10] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [9, 2] },
        { k: 'giveMoney', a: [0, 600] },
        { k: 'giveXp', a: [0, 750] },
        { k: 'message', a: [11] },
      ],
    },
    {
      id: 'sq1-05-probate-lien',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [11] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [10, 2] },
        { k: 'giveMoney', a: [0, 550] },
        { k: 'giveXp', a: [0, 650] },
        { k: 'message', a: [12] },
      ],
    },
    {
      id: 'sq1-06-undervault-sluice',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [12] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [11, 2] },
        { k: 'giveMoney', a: [0, 800] },
        { k: 'giveXp', a: [0, 900] },
        { k: 'message', a: [13] },
      ],
    },
    {
      id: 'hero-dead',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'unitAlive', a: [0] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [{ k: 'lose', a: [1] }],
    },
  ],
  text: {
    title: 'Map I: The Border Fords & Weeping Ossuary',
    body: 'From the fortified timber palisades of Thornwick Market, march across six interconnected frontier regions to break High Quartermaster Morvessa\'s Salt-Tithe cordon, purge the Weeping Ossuary beneath Ravenwatch Keep, and open the southern road to Redmarsh.',
    'obj.0': 'Main: Clear Sunken Ford and execute Chieftain Grok\'tar',
    'obj.0.pos': '74,98',
    'obj.0.kind': 'main',
    'obj.1': 'Main: Relight Lantern Passage and slay Malgath, Chanter of the Pyre',
    'obj.1.pos': '96,162',
    'obj.1.kind': 'main',
    'obj.2': 'Main: Break the siege of Ravenwatch Keep\'s outer bailey',
    'obj.2.pos': '136,48',
    'obj.2.kind': 'main',
    'obj.3': 'Main: Descend into the Weeping Ossuary and slay Morvessa, the Silk Widow',
    'obj.3.pos': '168,20',
    'obj.3.kind': 'main',
    'obj.4': 'Main: Hold Alder Bridge cutwater against the eastern host',
    'obj.4.pos': '138,96',
    'obj.4.kind': 'main',
    'obj.5': 'Main: Breach Ashbrook Southern Gatehouse and defeat Commander Velen',
    'obj.5.pos': '172,174',
    'obj.5.kind': 'main',
    'obj.6': 'Side: Audit the Burned Border Mint ruins for Assayer Pell\'s scales',
    'obj.6.pos': '34,30',
    'obj.6.kind': 'side',
    'obj.7': 'Side: Harvest Vitrified Slag shards from the Old Kilns and slay Krazak',
    'obj.7.pos': '42,36',
    'obj.7.kind': 'side',
    'obj.8': 'Side: Liberate Greywood Sawmill and slay Skara, Matron of Frostquills',
    'obj.8.pos': '62,38',
    'obj.8.kind': 'side',
    'obj.9': 'Side: Hunt Thornmaw the Ironroot in the Craghorn Granite Quarry',
    'obj.9.pos': '162,114',
    'obj.9.kind': 'side',
    'obj.10': 'Side: Burn the Lower-Parish Probate Lien-Roll in the Sunken Scriptorium',
    'obj.10.pos': '152,32',
    'obj.10.kind': 'side',
    'obj.11': 'Side: Relieve water pressure behind Gallery Four in the Undervault Links',
    'obj.11.pos': '134,152',
    'obj.11.kind': 'side',
    'msg.1': '[WAR LOGIC - Medium: Success] *(A damp mountain gale rattles the tarnished plates of his gorget. He exhales a gray plume smelling of bitter chicory and cold tallow.)* Look at the driftwood wedged against the weir, Commander. Those aren\'t peasant hay-carts—those are Border Mint bullion wagons burned down to the iron axle-trees. Secure Sunken Ford first, then push into the marsh and the northern timber depots.',
    'msg.1.who': 'Warden Hale',
    'msg.2': '[TACTICAL CALCULUS - Easy: Success] *(Mud cakes his brow as he holds up a lead-sealed ledger tube pried from the burned tollhouse.)* Sunken Ford is held! Recovered toll ledgers confirm Grok\'tar was paid in stamped Border Mint copper to destroy tax records before Oakhaven auditors arrived.',
    'msg.2.who': 'Ford-Scout Bren',
    'msg.3': '[WAR LOGIC - Medium: Success] *(The whale-oil beacons flare bright blue above the peat sinks, driving back the marsh mist.)* Malgath\'s pyre-chanters lie broken in Lantern Passage. The southern ravine trail is open.',
    'msg.3.who': 'Warden Hale',
    'msg.4': '[ASTRAL SHIVER - Challenging: Success] *(He holds a smoldering bundle of bog-myrtle and vinegar-soaked rags to his nose.)* Ravenwatch Keep\'s outer courtyard is secured and the bone totems lie shattered. The subterranean stair into the Weeping Ossuary yawns open before us.',
    'msg.4.who': 'Orlen',
    'msg.5': '[PRIMORDIAL RECKONING - Formidable: Success] *(Morvessa\'s brass abacus clatters into the ash of the Ossuary as the white silk cocoons shrivel.)* The Silk Widow has fallen! We have recovered her Border Mint Seal Ring and the stolen southern bullion waybills pointing straight into Redmarsh.',
    'msg.5.who': 'Orlen',
    'msg.6': '[COHORT MEMORY - Easy: Success] *(Iron-shod wagon wheels rumble across the wet granite arches while your vanguard holds the western cutwater.)* Alder Bridge stands unbroken! Three thousand river-parish refugees have safely crossed toward the southern road.',
    'msg.6.who': 'Warden Hale',
    'msg.7': '[WAR LOGIC - Heroic: Success] *(The southern portcullis groans open, revealing the alkali dust-haze of the Redmarsh depression beyond.)* Ashbrook Gatehouse is ours and Siege Commander Velen has fallen! The southern road into Redmarsh Outpost lies open.',
    'msg.7.who': 'Warden Hale',
    'msg.8': '[QUARTERMASTER\'S EYE - Medium: Success] *(He weighs a clipped silver groat against Assayer Pell\'s recovered brass balance.)* Pell\'s assay scales and the Clipped Coin Investigation ledger have been recovered from the burned Border Mint vaults.',
    'msg.8.who': 'Reeve Marlow',
    'msg.9': '[ASTRAL SHIVER - Challenging: Success] *(Sparks dance along the translucent green glass pried from the slag-heaps.)* Krazak the Volt Stalker is slain! Three shards of high-capacitance Vitrified Slag have been harvested to ground our wards.',
    'msg.9.who': 'High Arcanist Vaelen',
    'msg.10': '[QUARTERMASTER\'S EYE - Easy: Success] *(The great timber water-wheel groans back into motion as the wedged iron bars come free.)* Skara lies dead among the sawdust and Greywood Sawmill is cutting siege-timber for Thornwick once more!',
    'msg.10.who': 'Captain Merrick',
    'msg.11': '[VISCERAL DREAD - Challenging: Success] *(The ancient ironbark colossus crashes into the quarry mud, its stone carapace splitting in two.)* Thornmaw the Ironroot has crumbled into inert granite! The moorland packs scatter into the crags.',
    'msg.11.who': 'Ford-Scout Bren',
    'msg.12': '[CHILL OF THE VEIL - Formidable: Success] *(Acidic gall-ink curls into black smoke upon the scriptorium lectern.)* The Lower-Parish Probate Lien-Roll burns to cinders. Miller Tobin and the indebted dead of Thornwick are finally released from posthumous service.',
    'msg.12.who': 'Orlen',
    'msg.13': '[QUARTERMASTER\'S EYE - Challenging: Success] *(Cold mountain water roars down the spillway as the dwarven bronze wheel locks into place.)* Undervault Gallery Four is drained, exposing the bricked-up tax-commission silver bars!',
    'msg.13.who': 'Warden Hale',
    'npc.hale': 'Hold the river crossings and keep your powder dry, Commander. If Alder Bridge falls, three northern parishes die in the mud.',
    'npc.marlow': 'Someone burned the Border Mint six winters ago to hide shaved silver groats. Bring me Assayer Pell\'s ledger from the northern ruins and Thornwick\'s treasury will reward you.',
    'npc.miller': 'Morvessa\'s irregulars hamstrung our draft-oxen and wedged iron crowbars into the Greywood sawmill wheel. Clear the canopy and free the mill!',
    'npc.bren': 'Grok\'tar holds the eastern gravel bar at Sunken Ford, and green marsh-lights are luring turf-cutters off the boardwalks in Fenwick\'s Peat.',
    'npc.orlen': 'Beneath Ravenwatch Keep lies the Weeping Ossuary. Morvessa\'s probate clerks bound the dead in gall-ink and fed the unpaid tax-rolls to the Silk Widow.',
    win: 'The Border Fords and the Weeping Ossuary are cleansed. Your vanguard marches south toward Redmarsh Outpost.',
    'fail.1': 'Your hero has fallen in the mud of the northern frontier.',
  },
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`Generated ${OUT_PATH} (${doc.w}x${doc.h}, ${doc.units.length} units [groktar=${groktarId}, malgath=${malgathId}, krazak=${krazakId}, skara=${skaraId}, thornmaw=${thornmawId}, morvessa=${morvessaId}, vaelen=${vaelenId}], ${doc.triggers.length} triggers).`);
