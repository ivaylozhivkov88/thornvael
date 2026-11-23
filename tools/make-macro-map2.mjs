import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, '../src/missions/map2-redmarsh-wastes.map.json');

const W = 192;
const H = 192;
const N = W * H;

const T_GRASS = 0;
const T_DIRT = 1;
const T_WATER = 2;
const T_ROCK = 3;
const T_MARSH = 4;

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
  const terrain = new Uint8Array(N).fill(T_DIRT);
  const height = new Uint8Array(N).fill(1);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const n = hash2(202, x >> 2, y >> 2);

      // Outer border cliffs
      if (x < 2 || x >= W - 2 || y < 2 || y >= H - 2) {
        terrain[idx] = T_ROCK;
        height[idx] = 3;
        continue;
      }

      // Region 1: Ochre Ditch & Corduroy Causeway (47..114, 12..68) -> Alkaline marsh & log road
      if (x >= 47 && x <= 114 && y >= 12 && y <= 68) {
        terrain[idx] = n > 0.38 ? T_MARSH : T_DIRT;
        height[idx] = 0;
      }
      // Region 2: Twin Passes & Bracken Basin (115..184, 12..78) -> Desert canyon escarpments
      else if (x >= 115 && x <= 184 && y >= 12 && y <= 78) {
        terrain[idx] = n > 0.72 ? T_GRASS : T_DIRT;
        height[idx] = 2;
      }
      // Region 3: Quartz Plateau & Wardstone Ring (48..128, 69..132) -> Desert plateau with palm oasis center
      else if (x >= 48 && x <= 128 && y >= 69 && y <= 132) {
        const dOasis = Math.hypot(x - 84, y - 106);
        if (dOasis < 6) {
          terrain[idx] = T_WATER;
          height[idx] = 0;
        } else if (dOasis < 18) {
          terrain[idx] = T_GRASS;
          height[idx] = 1;
        } else {
          terrain[idx] = T_DIRT;
          height[idx] = 1;
        }
      }
      // Region 4: Third-Dynasty Salt-Vaults (12..64, 70..148) -> Sunken crypt & salt piers
      else if (x >= 12 && x <= 64 && y >= 70 && y <= 148) {
        terrain[idx] = n > 0.55 ? T_DIRT : T_MARSH;
        height[idx] = 0;
      }
      // Region 5: Deep Quarry & Flooded Sluice (129..184, 79..144) -> Stepped black-ironstone terraces
      else if (x >= 129 && x <= 184 && y >= 79 && y <= 144) {
        terrain[idx] = T_DIRT;
        height[idx] = x > 158 ? 0 : 2;
      }
      // Region 6: Fork of Spears & Ironheart Bastion (65..186, 145..186) -> High basalt ridge & silted cisterns
      else if (x >= 65 && x <= 186 && y >= 145 && y <= 186) {
        terrain[idx] = n > 0.7 ? T_GRASS : T_DIRT;
        height[idx] = 2;
      }
    }
  }

  // Region 0: Redmarsh Outpost stilt stockade (14..46, 18..54)
  paintRect(terrain, height, 14, 18, 46, 54, T_DIRT, 1);

  // Major Roads & Causeways
  // 1. Corduroy Salt-Road: Redmarsh Outpost (28,36) -> Corduroy Waypoint (84,38) -> Twin Passes (142,44)
  paintLine(terrain, height, 28, 36, 84, 38, 2, T_DIRT, 1);
  paintLine(terrain, height, 84, 38, 142, 44, 2, T_DIRT, 2);
  paintLine(terrain, height, 128, 58, 146, 36, 2, T_DIRT, 2);

  // 2. Obelisk Crossroads (128,58) -> Quartz Plateau (90,92) -> Salt-Vaults (38,112) & Assay Vault (28,118)
  paintLine(terrain, height, 128, 58, 90, 92, 2, T_DIRT, 1);
  paintLine(terrain, height, 90, 92, 66, 88, 2, T_DIRT, 1);
  paintLine(terrain, height, 90, 92, 98, 78, 2, T_DIRT, 1);
  paintLine(terrain, height, 90, 92, 112, 114, 2, T_DIRT, 1);
  paintLine(terrain, height, 90, 92, 84, 106, 2, T_GRASS, 1);
  paintLine(terrain, height, 66, 88, 38, 112, 2, T_DIRT, 0);
  paintLine(terrain, height, 38, 112, 28, 118, 2, T_DIRT, 0);

  // 3. Eastern Descent: Obelisk Crossroads (128,58) -> Deep Quarry (154,114) -> Bronze Sluice (168,122)
  paintLine(terrain, height, 128, 58, 154, 114, 2, T_DIRT, 2);
  paintLine(terrain, height, 154, 114, 168, 122, 2, T_DIRT, 0);

  // 4. Southern Ascent: Twin Causeways (118,164) & (136,164) -> Ironheart Bastion (164,172) -> Map 3 Exit (180,182)
  paintLine(terrain, height, 90, 92, 118, 164, 2, T_DIRT, 2);
  paintLine(terrain, height, 154, 114, 136, 164, 2, T_DIRT, 2);
  paintLine(terrain, height, 118, 164, 126, 160, 2, T_DIRT, 2);
  paintLine(terrain, height, 136, 164, 126, 160, 2, T_DIRT, 2);
  paintLine(terrain, height, 126, 160, 164, 172, 3, T_DIRT, 2);
  paintLine(terrain, height, 164, 172, 180, 182, 2, T_DIRT, 2);

  return { terrain, height };
}

const { terrain, height } = buildTerrainAndHeight();

// Houses 0..2 are Redmarsh Outpost Caravan Tavern, Alkali Armory, Conclave & Probate Tent. Houses 3..5 are regional structures.
const objects = [
  { kind: 1, x: 20, y: 26, owner: 0, hp: 300 }, // House 0: Caravan Tavern
  { kind: 1, x: 26, y: 26, owner: 0, hp: 300 }, // House 1: Alkali Armory
  { kind: 1, x: 32, y: 26, owner: 0, hp: 300 }, // House 2: Conclave & Probate Tent
  { kind: 1, x: 92, y: 34, owner: 0, hp: 200 }, // House 3: Redmarsh Stilt Granary
  { kind: 1, x: 148, y: 40, owner: 0, hp: 240 }, // House 4: Highgate Watch Palisade
  { kind: 1, x: 104, y: 156, owner: 0, hp: 280 }, // House 5: Lean Garrison Blockhouse
];

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
  { id: 'wp-redmarsh', name: 'Redmarsh Outpost Stilts', x: 26, y: 36, activated: true },
  { id: 'wp-corduroy', name: 'Corduroy Causeway Convoy', x: 84, y: 38 },
  { id: 'wp-twin-passes', name: 'Twin Passes Highgate', x: 142, y: 44 },
  { id: 'wp-wardstones', name: 'Quartz Wardstone Ring', x: 90, y: 92 },
  { id: 'wp-salt-vaults', name: 'Third-Dynasty Salt-Vaults', x: 38, y: 112 },
  { id: 'wp-deep-quarry', name: 'Deep Quarry Terraces', x: 154, y: 114 },
  { id: 'wp-ironheart', name: 'Ironheart Twin Causeways', x: 126, y: 160 },
];

const shrines = [
  { x: 78, y: 42, kind: 'healing', cooldown: 1500 },
  { x: 152, y: 48, kind: 'combat', cooldown: 1800 },
  { x: 92, y: 96, kind: 'ward', cooldown: 1800 },
  { x: 36, y: 98, kind: 'mana', cooldown: 1500 },
  { x: 148, y: 108, kind: 'armor', cooldown: 1800 },
  { x: 112, y: 158, kind: 'haste', cooldown: 1500 },
];

const adventureObjects = [
  { x: 62, y: 28, kind: 'watermill', rewardGold: 175 },
  { x: 76, y: 112, kind: 'fountain_of_youth' },
  { x: 22, y: 134, kind: 'creature_bank', rewardGold: 650, rewardArtifact: true },
  { x: 140, y: 90, kind: 'windmill', rewardGold: 225 },
];

const exits = [
  {
    x: 180,
    y: 182,
    targetMap: 'map3-iron-coast',
    targetX: 24,
    targetY: 32,
    label: 'Mountain Sluice Descent to Oakhaven Harbor',
    kind: 'road',
  },
];

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

// Unit 0: Player Hero inside Redmarsh Outpost
addUnit({ kind: K_HERO, team: 0, x: 28, y: 36 });

// Units 1..4: 4 Dormant Mercenaries in Redmarsh Caravan Tavern
addUnit({ kind: K_WARRIOR, team: 0, x: 18, y: 24, dormant: true });
addUnit({ kind: K_ARCHER, team: 0, x: 19, y: 24, dormant: true });
addUnit({ kind: K_MAGE, team: 0, x: 20, y: 24, dormant: true });
addUnit({ kind: K_GOLEM, team: 0, x: 21, y: 24, dormant: true });

// Region 1: Ochre Ditch & Corduroy Causeway
// MQ2-01 Corduroy Convoy & Stilt Granary (Group 1, Pack 1..2)
addUnit({ kind: K_IMP, team: 1, x: 82, y: 37, group: 1, pack: 1, tier: 2, family: 'mire-wisp' });
addUnit({ kind: K_GNOLL, team: 1, x: 86, y: 39, group: 1, pack: 1, tier: 2, family: 'dune-lurker' });
addUnit({ kind: K_GNOLL, team: 1, x: 88, y: 36, group: 1, pack: 2, tier: 3, family: 'maggot-swarm' });
addUnit({
  kind: K_MAGE,
  team: 1,
  x: 90,
  y: 35,
  group: 1,
  pack: 2,
  vip: true,
  tier: 3,
  family: 'spore-matron',
  bossMods: ['cold_enchanted'],
});

// SQ2-01 Skulls on the Ochre Ditch (Group 7, Pack 3)
addUnit({ kind: K_GNOLL, team: 1, x: 64, y: 48, group: 7, pack: 3, tier: 2, family: 'dune-lurker' });
addUnit({ kind: K_GNOLL, team: 1, x: 66, y: 49, group: 7, pack: 3, tier: 3, family: 'maggot-swarm' });
addUnit({ kind: K_IMP, team: 1, x: 65, y: 46, group: 7, pack: 3, tier: 3, family: 'mire-wisp' });

// Region 2: Twin Passes & Bracken Basin
// MQ2-02 Crossfire at Twin Passes & Highgate Watch (Group 2, Pack 4..5) + Super-Unique crimson-prowler-zara
addUnit({ kind: K_WARRIOR, team: 1, x: 144, y: 36, group: 2, pack: 4, tier: 3, family: 'sand-raider' });
addUnit({ kind: K_GNOLL, team: 1, x: 146, y: 38, group: 2, pack: 4, tier: 3, family: 'dune-beast' });
const zaraId = addUnit({
  kind: K_GNOLL,
  team: 1,
  x: 146,
  y: 36,
  group: 2,
  pack: 5,
  vip: true,
  tier: 4,
  family: 'crimson-prowler-zara',
  bossMods: ['extra_strong', 'cursed', 'fire_enchanted'],
});
addUnit({ kind: K_WARRIOR, team: 1, x: 144, y: 35, group: 2, pack: 5, tier: 3, family: 'sand-raider' });
addUnit({ kind: K_WARRIOR, team: 1, x: 148, y: 35, group: 2, pack: 5, tier: 3, family: 'sand-raider' });
addUnit({ kind: K_WARRIOR, team: 1, x: 146, y: 34, group: 2, pack: 5, tier: 3, family: 'sand-raider' });

// SQ2-02 The Four-Faced Milestone Trap (Group 8, Pack 6)
addUnit({ kind: K_GNOLL, team: 1, x: 128, y: 58, group: 8, pack: 6, tier: 3, family: 'dune-lurker' });
addUnit({ kind: K_GNOLL, team: 1, x: 130, y: 59, group: 8, pack: 6, tier: 3, family: 'dune-lurker' });
addUnit({ kind: K_GOLEM, team: 1, x: 127, y: 60, group: 8, pack: 6, tier: 3, family: 'basalt-brute' });

// SQ2-06 Timber & Pitch for the Stockade (Group 12, Pack 7)
addUnit({ kind: K_WARRIOR, team: 1, x: 162, y: 52, group: 12, pack: 7, tier: 3, family: 'sand-raider' });
addUnit({ kind: K_GOLEM, team: 1, x: 164, y: 53, group: 12, pack: 7, tier: 3, family: 'basalt-brute' });
addUnit({ kind: K_GNOLL, team: 1, x: 160, y: 54, group: 12, pack: 7, tier: 3, family: 'dune-beast' });

// Region 3: Quartz Plateau & Wardstone Ring
// MQ2-03 Rupture of the Quartz Wardstones (Group 3, Pack 8..9) + Super-Unique arc-carapace-vekor
addUnit({ kind: K_IMP, team: 1, x: 66, y: 88, group: 3, pack: 8, tier: 3, family: 'dune-scarab' });
addUnit({ kind: K_IMP, team: 1, x: 112, y: 114, group: 3, pack: 8, tier: 3, family: 'dune-scarab' });
const vekorId = addUnit({
  kind: K_IMP,
  team: 1,
  x: 98,
  y: 78,
  group: 3,
  pack: 9,
  vip: true,
  tier: 4,
  family: 'arc-carapace-vekor',
  bossMods: ['lightning_enchanted', 'stone_skin'],
});
addUnit({ kind: K_IMP, team: 1, x: 96, y: 79, group: 3, pack: 9, tier: 3, family: 'dune-scarab' });
addUnit({ kind: K_IMP, team: 1, x: 100, y: 79, group: 3, pack: 9, tier: 3, family: 'dune-scarab' });
addUnit({ kind: K_MAGE, team: 1, x: 98, y: 81, group: 3, pack: 9, tier: 3, family: 'witch-doctor' });

// SQ2-03 Saelen's Bog-Curse Cauldron (Group 9, Pack 10) + Super-Unique venomscale-ssorath
const ssorathId = addUnit({
  kind: K_GNOLL,
  team: 1,
  x: 84,
  y: 100,
  group: 9,
  pack: 10,
  vip: true,
  tier: 5,
  family: 'venomscale-ssorath',
  bossMods: ['extra_fast', 'lightning_enchanted', 'spectral_hit'],
});
addUnit({ kind: K_GNOLL, team: 1, x: 82, y: 99, group: 9, pack: 10, tier: 3, family: 'claw-viper' });
addUnit({ kind: K_GNOLL, team: 1, x: 86, y: 99, group: 9, pack: 10, tier: 3, family: 'claw-viper' });
addUnit({ kind: K_MAGE, team: 1, x: 84, y: 98, group: 9, pack: 10, tier: 4, family: 'witch-doctor' });

// Region 4: Third-Dynasty Salt-Vaults
// SQ2-04 The Redrock Probate Redemption (Group 10, Pack 11) + Super-Unique ash-embalmer-khepri
const khepriId = addUnit({
  kind: K_MAGE,
  team: 1,
  x: 28,
  y: 118,
  group: 10,
  pack: 11,
  vip: true,
  tier: 5,
  family: 'ash-embalmer-khepri',
  bossMods: ['extra_fast', 'cursed', 'mana_burn'],
});
addUnit({ kind: K_WARRIOR, team: 1, x: 26, y: 119, group: 10, pack: 11, tier: 3, family: 'hollow-knight' });
addUnit({ kind: K_WARRIOR, team: 1, x: 30, y: 119, group: 10, pack: 11, tier: 3, family: 'hollow-knight' });
addUnit({ kind: K_WARRIOR, team: 1, x: 28, y: 121, group: 10, pack: 11, tier: 4, family: 'hollow-king' });

// Region 5: Deep Quarry & Flooded Sluice
// MQ2-04 Revolt in the Deep Quarry (Group 4, Pack 12)
addUnit({
  kind: K_GOLEM,
  team: 1,
  x: 154,
  y: 116,
  group: 4,
  pack: 12,
  vip: true,
  tier: 4,
  family: 'silt-colossus',
  bossMods: ['stone_skin', 'extra_strong'],
});
addUnit({ kind: K_GOLEM, team: 1, x: 152, y: 117, group: 4, pack: 12, tier: 4, family: 'basalt-brute' });
addUnit({ kind: K_GNOLL, team: 1, x: 156, y: 117, group: 4, pack: 12, tier: 4, family: 'pale-burrower' });
addUnit({ kind: K_WARRIOR, team: 1, x: 154, y: 119, group: 4, pack: 12, tier: 4, family: 'sand-raider' });

// SQ2-05 Behind the Bronze Sluice (Group 11, Pack 13)
addUnit({ kind: K_GOLEM, team: 1, x: 168, y: 122, group: 11, pack: 13, tier: 4, family: 'silt-colossus' });
addUnit({ kind: K_GNOLL, team: 1, x: 166, y: 123, group: 11, pack: 13, tier: 4, family: 'pale-burrower' });
addUnit({ kind: K_GNOLL, team: 1, x: 170, y: 123, group: 11, pack: 13, tier: 4, family: 'pale-burrower' });

// Region 6: Fork of Spears & Ironheart Bastion
// MQ2-05 The Fork of Spears (Group 5, Pack 14)
addUnit({ kind: K_GOLEM, team: 1, x: 118, y: 164, group: 5, pack: 14, tier: 4, family: 'basalt-brute' });
addUnit({ kind: K_WARRIOR, team: 1, x: 120, y: 165, group: 5, pack: 14, tier: 4, family: 'hollow-king' });
addUnit({ kind: K_GOLEM, team: 1, x: 136, y: 164, group: 5, pack: 14, tier: 4, family: 'basalt-brute' });
addUnit({ kind: K_IMP, team: 1, x: 134, y: 165, group: 5, pack: 14, tier: 4, family: 'storm-kite' });

// MQ2-06 The Dry Cisterns of Gorrathul (Group 6, Pack 15) + Act Boss gorrathul
const gorrathulId = addUnit({
  kind: K_GOLEM,
  team: 1,
  x: 164,
  y: 172,
  group: 6,
  pack: 15,
  vip: true,
  tier: 5,
  family: 'gorrathul',
  bossMods: ['cold_enchanted', 'stone_skin', 'extra_strong'],
});
addUnit({ kind: K_GOLEM, team: 1, x: 162, y: 174, group: 6, pack: 15, tier: 4, family: 'silt-colossus' });
addUnit({ kind: K_WARRIOR, team: 1, x: 166, y: 174, group: 6, pack: 15, tier: 4, family: 'hollow-king' });
addUnit({ kind: K_IMP, team: 1, x: 164, y: 175, group: 6, pack: 15, tier: 4, family: 'storm-kite' });

// Scatter desert palms / scrub trees on open tiles away from roads and Redmarsh Outpost
for (let i = 0; i < 140; i++) {
  const tx = 8 + ((i * 41) % (W - 16));
  const ty = 8 + ((i * 59) % (H - 16));
  const idx = ty * W + tx;
  if (
    (terrain[idx] === T_GRASS || (terrain[idx] === T_DIRT && i % 3 === 0)) &&
    !blocked[idx] &&
    !taken.has(idx) &&
    (tx < 12 || tx > 50 || ty < 14 || ty > 58)
  ) {
    objects.push({ kind: 0, x: tx, y: ty });
    blocked[idx] = 1;
  }
}

const doc = {
  format: 'thornvael-map',
  version: 2,
  name: 'The Redmarsh Wastes & Ironheart Cisterns',
  w: W,
  h: H,
  day: 600,
  terrain: rleEncode(terrain),
  height: rleEncode(height),
  objects,
  units,
  regions: [
    {
      name: 'Redmarsh Outpost (City Hub)',
      x1: 14,
      y1: 18,
      x2: 46,
      y2: 54,
      biome: 'desert',
      zone: 'ruinstone',
      music: 'music_town_redmarsh',
      ambience: 'amb_town_redmarsh',
    },
    {
      name: 'Ochre Ditch & Corduroy Causeway',
      x1: 47,
      y1: 12,
      x2: 114,
      y2: 68,
      biome: 'marsh',
      zone: 'ruinstone',
      music: 'music_explore_act2_marsh',
      ambience: 'amb_redmarsh_swamp',
    },
    {
      name: 'Twin Passes & Bracken Basin',
      x1: 115,
      y1: 12,
      x2: 184,
      y2: 78,
      biome: 'desert',
      zone: 'highland',
      music: 'music_explore_act2_canyon',
      ambience: 'amb_canyon_wind',
    },
    {
      name: 'Quartz Plateau & Wardstone Ring',
      x1: 48,
      y1: 69,
      x2: 128,
      y2: 132,
      biome: 'oasis',
      zone: 'sand',
      music: 'music_explore_act2_marsh',
      ambience: 'amb_redmarsh_swamp',
    },
    {
      name: 'Third-Dynasty Salt-Vaults',
      x1: 12,
      y1: 70,
      x2: 64,
      y2: 148,
      biome: 'crypt',
      zone: 'ruinstone',
      music: 'music_explore_act2_marsh',
      ambience: 'amb_ruined_sanctum',
    },
    {
      name: 'Deep Quarry & Flooded Sluice',
      x1: 129,
      y1: 79,
      x2: 184,
      y2: 144,
      biome: 'highlands',
      zone: 'ruinstone',
      music: 'music_explore_act2_canyon',
      ambience: 'amb_quarry',
    },
    {
      name: 'Fork of Spears & Ironheart Bastion',
      x1: 65,
      y1: 145,
      x2: 186,
      y2: 186,
      biome: 'highlands',
      zone: 'snow',
      music: 'music_explore_act2_canyon',
      ambience: 'amb_canyon_wind',
    },
  ],
  players: ['Vanguard Company', 'Ironheart & Salt-Coven Host', 'Neutral', 'Redmarsh Caravaneers'],
  waypoints,
  shrines,
  adventureObjects,
  exits,
  towns: [
    {
      name: 'Redmarsh Outpost',
      tavern: 0,
      shop: 1,
      school: 2,
      tiers: [2, 4],
      spells: [0, 1, 2, 4, 5, 7, 9, 10, 14, 17, 19],
      mercs: [
        { unit: 1, price: 110 },
        { unit: 2, price: 110 },
        { unit: 3, price: 140 },
        { unit: 4, price: 220 },
      ],
      npcs: [
        { name: 'Quartermaster Bram', x: 20, y: 32, text: 'npc.bram' },
        { name: 'Water-Seller Tull', x: 26, y: 32, text: 'npc.tull' },
        { name: 'Chronicler Zahra', x: 34, y: 32, text: 'npc.zahra' },
        { name: 'Sabik the Sand-Walker', x: 32, y: 42, text: 'npc.sabik' },
        { name: 'Miner Tomas', x: 22, y: 42, text: 'npc.tomas' },
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
        { k: 'giveMoney', a: [0, 450] },
        { k: 'setSub', a: [0, 1] },
        { k: 'setSub', a: [6, 1] },
        { k: 'message', a: [1] },
      ],
    },
    {
      id: 'mq2-01-corduroy-convoy',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [1] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [0, 2] },
        { k: 'setSub', a: [1, 1] },
        { k: 'giveXp', a: [0, 700] },
        { k: 'message', a: [2] },
      ],
    },
    {
      id: 'mq2-02-twin-passes',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [2] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [1, 2] },
        { k: 'setSub', a: [2, 1] },
        { k: 'giveXp', a: [0, 950] },
        { k: 'message', a: [3] },
      ],
    },
    {
      id: 'mq2-03-quartz-wardstones',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [3] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [2, 2] },
        { k: 'setSub', a: [3, 1] },
        { k: 'giveXp', a: [0, 1200] },
        { k: 'message', a: [4] },
      ],
    },
    {
      id: 'mq2-04-deep-quarry-revolt',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [4] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [3, 2] },
        { k: 'setSub', a: [4, 1] },
        { k: 'giveXp', a: [0, 1500] },
        { k: 'message', a: [5] },
      ],
    },
    {
      id: 'mq2-05-fork-of-spears',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [5] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [4, 2] },
        { k: 'setSub', a: [5, 1] },
        { k: 'giveXp', a: [0, 1800] },
        { k: 'message', a: [6] },
      ],
    },
    {
      id: 'mq2-06-gorrathul-slain',
      once: true,
      enabled: true,
      conds: [
        { a: { k: 'isVip', a: [gorrathulId] }, op: 0, b: { k: 'constant', a: [0] } },
        { a: { k: 'groupSize', a: [6] }, op: 0, b: { k: 'constant', a: [0] } },
      ],
      acts: [
        { k: 'setSub', a: [5, 2] },
        { k: 'giveXp', a: [0, 2500] },
        { k: 'message', a: [7] },
        { k: 'win', a: [] },
      ],
    },
    {
      id: 'sq2-01-ochre-ditch',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [7] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [6, 2] },
        { k: 'giveMoney', a: [0, 500] },
        { k: 'giveXp', a: [0, 800] },
        { k: 'message', a: [8] },
      ],
    },
    {
      id: 'sq2-02-four-faced-obelisk',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [8] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [7, 2] },
        { k: 'giveMoney', a: [0, 650] },
        { k: 'giveXp', a: [0, 1000] },
        { k: 'message', a: [9] },
      ],
    },
    {
      id: 'sq2-03-kaelen-cauldron',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [9] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [8, 2] },
        { k: 'giveMoney', a: [0, 750] },
        { k: 'giveXp', a: [0, 1200] },
        { k: 'message', a: [10] },
      ],
    },
    {
      id: 'sq2-04-probate-redemption',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [10] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [9, 2] },
        { k: 'giveMoney', a: [0, 950] },
        { k: 'giveXp', a: [0, 1500] },
        { k: 'message', a: [11] },
      ],
    },
    {
      id: 'sq2-05-bronze-sluice',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [11] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [10, 2] },
        { k: 'giveMoney', a: [0, 1200] },
        { k: 'giveXp', a: [0, 1800] },
        { k: 'message', a: [12] },
      ],
    },
    {
      id: 'sq2-06-stockade-timber',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'groupSize', a: [12] }, op: 0, b: { k: 'constant', a: [0] } }],
      acts: [
        { k: 'setSub', a: [11, 2] },
        { k: 'giveMoney', a: [0, 800] },
        { k: 'giveXp', a: [0, 1300] },
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
    title: 'Map II: The Redmarsh Wastes & Ironheart Cisterns',
    body: 'Operating from the limestone stilt-stockade of Redmarsh Outpost, rescue the bogged supply convoy, silence the crossfire at Twin Passes, ground the three ruptured Quartz Wardstones, spark the Deep Quarry prisoner revolt, and storm the twin causeways of Ironheart Bastion to confront Gorrathul.',
    'obj.0': 'Main: Relieve the Corduroy Convoy and save the Stilt Granary',
    'obj.0.pos': '84,38',
    'obj.0.kind': 'main',
    'obj.1': 'Main: Break the Twin Passes crossfire and slay Zara, the Crimson Prowler',
    'obj.1.pos': '146,36',
    'obj.1.kind': 'main',
    'obj.2': 'Main: Ground the 3 Quartz Wardstones and slay Vekor, the Arc Carapace',
    'obj.2.pos': '98,78',
    'obj.2.kind': 'main',
    'obj.3': 'Main: Liberate the Deep Quarry ironstone terraces from the Silt Juggernaut',
    'obj.3.pos': '154,114',
    'obj.3.kind': 'main',
    'obj.4': 'Main: Storm the twin causeways at the Fork of Spears',
    'obj.4.pos': '126,160',
    'obj.4.kind': 'main',
    'obj.5': 'Main: Breach Ironheart Bastion and slay Gorrathul, Warden of the Forked Cisterns',
    'obj.5.pos': '164,172',
    'obj.5.kind': 'main',
    'obj.6': 'Side: Follow the skull-markers along Ochre Ditch to recover the boundary survey',
    'obj.6.pos': '64,48',
    'obj.6.kind': 'side',
    'obj.7': 'Side: Disarm the Four-Faced Obelisk ambush at the canyon crossroads',
    'obj.7.pos': '128,58',
    'obj.7.kind': 'side',
    'obj.8': 'Side: Purify Saelen\'s Bog-Curse Cauldron and slay Ssorath, the Venom Patriarch',
    'obj.8.pos': '84,100',
    'obj.8.kind': 'side',
    'obj.9': 'Side: Redeem the Third-Dynasty Salt-Vault liens and slay Khepri, the Sunken Embalmer',
    'obj.9.pos': '28,118',
    'obj.9.kind': 'side',
    'obj.10': 'Side: Unseal the submerged Third-Dynasty Bronze Sluice in the lower quarry',
    'obj.10.pos': '168,122',
    'obj.10.kind': 'side',
    'obj.11': 'Side: Secure iron plating and bitumen pitch for Highgate Watch Stockade',
    'obj.11.pos': '162,52',
    'obj.11.kind': 'side',
    'msg.1': '[QUARTERMASTER\'S EYE - Medium: Success] *(Bram measures half a pint of boiled, rusty rainwater into a tin dipper, his thumb guarding the rim as if it were melted gold.)* Read the ration board before you unbuckle your harness, Commander. Half a pint at sunrise, a gill of vinegar-brine at dusk. Pull Wagon-Master Durn\'s convoy out of the corduroy mud first, then help Zahra ground those humming Quartz Wardstones on the plateau.',
    'msg.1.who': 'Quartermaster Bram',
    'msg.2': '[WAR LOGIC - Easy: Success] *(Wet brush-fires hiss out beneath the limestone stilts as the convoy drivers lash their mules onto dry planks.)* The Corduroy Road is clear and Redmarsh Granary stands intact! Our salt-pork and antivenom reserves are secure.',
    'msg.2.who': 'Quartermaster Bram',
    'msg.3': '[TACTICAL CALCULUS - Challenging: Success] *(Zara\'s crimson cloak flutters from the central sandstone chimney as the Sand-Clan hornbows fall silent.)* Twin Passes and Highgate Watch are secured! The road onto the central Quartz Plateau lies open.',
    'msg.3.who': 'Sabik',
    'msg.4': '[ASTRAL SHIVER - Formidable: Success] *(Copper grounding wire bites into the fractured quartz grooves, bleeding the static storm into the bedrock.)* Vekor\'s chitinous shell lies cracked and all three Quartz Wardstones are re-attuned! The alkali dust-squalls are subsiding across the basin.',
    'msg.4.who': 'Chronicler Zahra',
    'msg.5': '[COHORT MEMORY - Challenging: Success] *(Three hundred freed miners hammer their pickaxes against the ironstone winch-drums in a deafening cadence.)* Deep Quarry is liberated! Miner Gorin\'s crews have cut the ore lift feeding Gorrathul\'s bastion.',
    'msg.5.who': 'Miner Tomas',
    'msg.6': '[WAR LOGIC - Formidable: Success] *(Both basalt causeways at the Fork of Spears are cleared of siege giants, and the starved blockhouse garrison cheers from the parapet.)* The twin causeways are ours! Only the steam-sluice gatehouse of Ironheart Bastion remains.',
    'msg.6.who': 'Sabik',
    'msg.7': '[VISCERAL DREAD - Heroic: Success] *(Gorrathul crashes onto the salt-crusted stones. As the rusted sluice-wheels turn open, only dry red dust blows through the mountain reservoir arches.)* Gorrathul has fallen—and Engineer Vesper\'s audit tells the terrible truth: Ironheart\'s cisterns silted dry years ago. We have the Forked Sluice Key and the Third-Dynasty Hydraulic Charts. The descent to Oakhaven Harbor is open!',
    'msg.7.who': 'Chronicler Zahra',
    'msg.8': '[TACTICAL CALCULUS - Easy: Success] *(Bleached sheep-skulls mark the firm limestone shelf beneath the bog.)* The Ochre Ditch contraband wagons and boundary survey have been recovered!',
    'msg.8.who': 'Sabik',
    'msg.9': '[FRONTIER SKEPTICISM - Medium: Success] *(He chips the false directional plaster from the Four-Faced Obelisk, exposing the true Third-Dynasty road carvings.)* The milestone trap is disarmed and the ambush pack is dead.',
    'msg.9.who': 'Sabik',
    'msg.10': '[ASTRAL SHIVER - Challenging: Success] *(Slaked lime boils inside the copper cauldron as Ssorath\'s venomous coils go limp around the oasis wellhead.)* The oasis aquifer is purified and the bog-curse talisman is destroyed!',
    'msg.10.who': 'Water-Seller Tull',
    'msg.11': '[CHILL OF THE VEIL - Formidable: Success] *(Weighed silver tally-tablets strike the bitumen canopic altars, and the copper-wired Hollow Knights lower their blades in unison.)* Khepri the Sunken Embalmer is destroyed and the Third-Dynasty probate debt is discharged!',
    'msg.11.who': 'Chronicler Zahra',
    'msg.12': '[QUARTERMASTER\'S EYE - Challenging: Success] *(The submerged bronze sluice-door swings open, revealing crates of unminted Border Mint silver bars hidden by Morvessa\'s drivers.)* The lower quarry vault is unsealed and the stolen northern bullion is ours!',
    'msg.12.who': 'Miner Tomas',
    'msg.13': '[WAR LOGIC - Medium: Success] *(Fresh Deep Quarry iron plates and boiling bitumen seal the salt-rotted oak palisades of Highgate Watch.)* The stockade walls are reinforced against any desert raid!',
    'msg.13.who': 'Sabik',
    'npc.bram': 'Half a pint of boiled rainwater at sunrise, a gill of vinegar-brine at dusk. Guard the Corduroy Convoy or this outpost dies of thirst before a blade is drawn.',
    'npc.tull': 'Hexer Saelen and the Venom Patriarch Ssorath have poisoned the central oasis well. Bring me the knuckle-bone talisman from their cauldron and I\'ll share our purest cistern reserves.',
    'npc.zahra': 'Someone chiseled reverse blood-wards into the twelve primeval Quartz Wardstones. Ground the three main monoliths on the plateau and redeem the Third-Dynasty Salt-Vaults!',
    'npc.sabik': 'Watch the middle sandstone spire at Twin Passes, Commander—Zara\'s raiders drop crossfire onto both canyon tracks, and the Four-Faced Obelisk has been altered to lure columns into alkali sinkholes.',
    'npc.tomas': 'Gorrathul holds three hundred ironstone miners in chains on the Deep Quarry terraces. Strike the winch-chains and pump the lower gallery to open the submerged bronze sluice!',
    win: 'The Redmarsh Wastes and Ironheart Cisterns are secured. Armed with the Third-Dynasty Hydraulic Charts, your vanguard descends the coastal switchbacks toward Oakhaven Harbor.',
    'fail.1': 'Your hero has perished beneath the copper sun of the Redmarsh Wastes.',
  },
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`Generated ${OUT_PATH} (${doc.w}x${doc.h}, ${doc.units.length} units [zara=${zaraId}, vekor=${vekorId}, ssorath=${ssorathId}, khepri=${khepriId}, gorrathul=${gorrathulId}], ${doc.triggers.length} triggers).`);
