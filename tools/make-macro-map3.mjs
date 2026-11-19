import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, '../src/missions/map3-iron-coast.map.json');

const W = 192;
const H = 192;
const N = W * H;

// Terrain enum: Grass: 0, Dirt: 1, Water: 2, Rock: 3, Marsh: 4
const Terrain = { Grass: 0, Dirt: 1, Water: 2, Rock: 3, Marsh: 4 };
// ObjectKind: Tree: 0, House: 1, Barrel: 2, Urn: 3, Sarcophagus: 4
const ObjectKind = { Tree: 0, House: 1, Barrel: 2, Urn: 3, Sarcophagus: 4 };
// Unit Kind: Warrior: 0, Archer: 1, Hero: 2, Mage: 3, Gnoll: 4, Golem: 5, Imp: 6
const Kind = { Warrior: 0, Archer: 1, Hero: 2, Mage: 3, Gnoll: 4, Golem: 5, Imp: 6 };

function rleEncode(a) {
  const out = [];
  for (let i = 0; i < a.length; ) {
    let j = i + 1;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(a[i], j - i);
    i = j;
  }
  return out;
}

function buildTerrainAndHeight() {
  const terrain = new Uint8Array(N).fill(Terrain.Grass);
  const height = new Uint8Array(N).fill(1);

  const setTile = (x, y, t, h = 1) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = y * W + x;
    terrain[i] = t;
    height[i] = h;
  };

  const fillRect = (x1, y1, x2, y2, t, h = 1) => {
    for (let y = Math.max(0, y1); y <= Math.min(H - 1, y2); y++) {
      for (let x = Math.max(0, x1); x <= Math.min(W - 1, x2); x++) {
        setTile(x, y, t, h);
      }
    }
  };

  const drawRoad = (x1, y1, x2, y2, radius = 2, t = Terrain.Dirt, h = 1) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
    for (let s = 0; s <= steps; s++) {
      const cx = Math.round(x1 + ((x2 - x1) * s) / steps);
      const cy = Math.round(y1 + ((y2 - y1) * s) / steps);
      fillRect(cx - radius, cy - radius, cx + radius, cy + radius, t, h);
    }
  };

  // Base regional terrain character
  // Outer western sea margin (x: 0..10)
  fillRect(0, 0, 8, H - 1, Terrain.Water, 0);
  // Outer border cliff rims (top & bottom edges)
  fillRect(0, 0, W - 1, 5, Terrain.Rock, 3);
  fillRect(0, H - 5, W - 1, H - 1, Terrain.Rock, 3);
  fillRect(W - 5, 0, W - 1, H - 1, Terrain.Rock, 3);

  // Region 0: Oakhaven Harbor Promontory (16,74)..(52,116)
  fillRect(16, 74, 52, 116, Terrain.Grass, 2);
  fillRect(18, 82, 46, 106, Terrain.Dirt, 2);

  // Region 1: Cinder Wards & Blighted Orchard (53,64)..(112,122)
  fillRect(53, 64, 112, 122, Terrain.Grass, 1);
  fillRect(80, 68, 102, 86, Terrain.Marsh, 1); // Blighted Cider-Orchard boggy terrace

  // Region 2: Greywash Canal & Riverlock (48,12)..(124,63)
  fillRect(48, 12, 124, 63, Terrain.Marsh, 0);
  fillRect(56, 20, 118, 48, Terrain.Grass, 1);
  // Canal water channels on flanks of Riverlock (leaving center lock bridge walkable)
  fillRect(52, 34, 78, 37, Terrain.Water, 0);
  fillRect(96, 34, 120, 37, Terrain.Water, 0);

  // Region 3: Hourglass Spit & Smuggler Caves (12,123)..(114,184)
  fillRect(12, 123, 114, 184, Terrain.Marsh, 0);
  // Tidal ocean pockets around the shingle spit
  fillRect(12, 126, 46, 142, Terrain.Water, 0);
  fillRect(74, 166, 108, 180, Terrain.Water, 0);
  fillRect(20, 150, 96, 168, Terrain.Dirt, 1); // Shingle Spit and sea-cave approach

  // Region 4: Sunken Citadel & Drowned Choir (125,12)..(186,74)
  fillRect(125, 12, 186, 74, Terrain.Marsh, 0);
  fillRect(136, 18, 182, 62, Terrain.Dirt, 0);
  // Flooded nave decorative pools (away from unit/waypoint positions)
  fillRect(130, 14, 148, 22, Terrain.Water, 0);
  fillRect(160, 56, 180, 68, Terrain.Water, 0);

  // Region 5: Starved Bastion & Cliff Batteries (113,75)..(186,134)
  fillRect(113, 75, 186, 134, Terrain.Grass, 2);
  fillRect(126, 84, 176, 126, Terrain.Dirt, 3);

  // Region 6: Burning Harborwatch & Flagship (115,135)..(186,186)
  fillRect(115, 135, 186, 186, Terrain.Dirt, 1);
  // Harbor bay waters north-west of flagship quay
  fillRect(118, 168, 132, 182, Terrain.Water, 0);

  // Primary road, canal & causeway network connecting all 7 regions
  drawRoad(26, 96, 52, 88, 3, Terrain.Dirt, 2); // Oakhaven Tanner's Gate
  drawRoad(52, 88, 78, 96, 3, Terrain.Dirt, 1); // Tanner's Gate to Cinder Wards
  drawRoad(78, 96, 88, 38, 3, Terrain.Dirt, 1); // Cinder Wards to Riverlock Crossing
  drawRoad(88, 38, 68, 28, 2, Terrain.Dirt, 1); // Riverlock to Moorland Artillery Ridge
  drawRoad(88, 38, 112, 24, 2, Terrain.Dirt, 2); // Riverlock to Age-of-Chains Pass
  drawRoad(112, 24, 148, 52, 3, Terrain.Dirt, 1); // Drained Tidal Causeway to Sunken Citadel
  drawRoad(148, 52, 158, 38, 2, Terrain.Dirt, 1); // Citadel to Third Sea-Arch
  drawRoad(158, 38, 172, 24, 3, Terrain.Dirt, 1); // Sea-Arch to Drowned Choir Nave
  drawRoad(36, 112, 62, 152, 3, Terrain.Dirt, 1); // South postern to Hourglass Spit
  drawRoad(62, 152, 28, 164, 3, Terrain.Dirt, 1); // Hourglass Spit to Smuggler Caves
  drawRoad(78, 96, 132, 96, 3, Terrain.Dirt, 2); // Cinder Wards to Clashing Banners Ridge
  drawRoad(132, 96, 152, 104, 3, Terrain.Dirt, 3); // Ridge to Cliff Culverin Batteries
  drawRoad(152, 104, 168, 106, 3, Terrain.Dirt, 3); // Culverin battery terrace
  drawRoad(152, 104, 144, 158, 3, Terrain.Dirt, 2); // Cliff road down to Burning Harborwatch
  drawRoad(144, 158, 174, 172, 4, Terrain.Dirt, 1); // Harborwatch Quay to Vesperion's Flagship & Exit

  return { terrain, height };
}

const { terrain, height } = buildTerrainAndHeight();

// Buildings (Houses 0..5) and environmental props
const objects = [
  // Oakhaven Harbor Town Buildings (Houses 0, 1, 2)
  { kind: ObjectKind.House, x: 22, y: 88, owner: 0, hp: 350 }, // House 0: Fish-Market Tavern & Triage Square
  { kind: ObjectKind.House, x: 28, y: 88, owner: 0, hp: 350 }, // House 1: Drydock Chandlery (Shop)
  { kind: ObjectKind.House, x: 34, y: 88, owner: 0, hp: 350 }, // House 2: Conclave Galvanic Tower (School)
  // Regional Landmark Buildings (Houses 3, 4, 5)
  { kind: ObjectKind.House, x: 68, y: 86, owner: 0, hp: 300 }, // House 3: Chapel Nave Infirmary (Cinder Wards)
  { kind: ObjectKind.House, x: 138, y: 92, owner: 0, hp: 400 }, // House 4: Starved Cliff-Watch Bastion
  { kind: ObjectKind.House, x: 152, y: 146, owner: 0, hp: 450 }, // House 5: Great Prism Lighthouse (Harborwatch)
  // Trees & Props (placed safely away from units, houses, shrines, waypoints)
  { kind: ObjectKind.Tree, x: 56, y: 70 },
  { kind: ObjectKind.Tree, x: 60, y: 70 },
  { kind: ObjectKind.Tree, x: 96, y: 72 },
  { kind: ObjectKind.Tree, x: 100, y: 74 },
  { kind: ObjectKind.Tree, x: 54, y: 20 },
  { kind: ObjectKind.Tree, x: 120, y: 82 },
  { kind: ObjectKind.Tree, x: 124, y: 82 },
  { kind: ObjectKind.Barrel, x: 20, y: 92, hp: 1 },
  { kind: ObjectKind.Barrel, x: 140, y: 152, hp: 1 },
  { kind: ObjectKind.Urn, x: 154, y: 40, hp: 1 },
  { kind: ObjectKind.Sarcophagus, x: 168, y: 20, hp: 1 },
];

// Units: Unit 0 is Player Hero; Units 1..4 are dormant mercenaries for Oakhaven Tavern
const units = [
  // 0: Hero
  { kind: Kind.Hero, team: 0, x: 26, y: 94 },
  // 1..4: Oakhaven Harbor Mercenaries (dormant, team 0)
  { kind: Kind.Warrior, team: 0, x: 18, y: 86, dormant: true }, // Oakhaven Marine Pikeman
  { kind: Kind.Archer, team: 0, x: 19, y: 86, dormant: true },  // Cliff-Wall Cranequinier
  { kind: Kind.Mage, team: 0, x: 20, y: 86, dormant: true },    // Conclave Galvanic Adept
  { kind: Kind.Golem, team: 0, x: 21, y: 86, dormant: true },   // Ironclad Turncoat Halberdier

  // ================= GROUP 1: MQ3-01 (Cinder Wards & Chapel Infirmary Siege) =================
  { kind: Kind.Mage, team: 1, x: 76, y: 94, group: 1, pack: 1, tier: 3, family: 'ash-weaver' },
  { kind: Kind.Mage, team: 1, x: 78, y: 94, group: 1, pack: 1, tier: 3, family: 'spore-matron' },
  { kind: Kind.Gnoll, team: 1, x: 80, y: 95, group: 1, pack: 1, tier: 3, family: 'maggot-swarm' },
  { kind: Kind.Gnoll, team: 1, x: 82, y: 95, group: 1, pack: 1, tier: 3, family: 'maggot-swarm' },
  { kind: Kind.Warrior, team: 1, x: 80, y: 98, group: 1, pack: 2, vip: true, tier: 4, family: 'doom-knight', bossMods: ['fire_enchanted', 'stone_skin'] },
  { kind: Kind.Mage, team: 1, x: 82, y: 98, group: 1, pack: 2, tier: 4, family: 'night-orchard' },

  // ================= GROUP 2: MQ3-02 (Sundered Ranks & Riverlock Crossing - Zulmar) =================
  { kind: Kind.Archer, team: 1, x: 66, y: 28, group: 2, pack: 3, tier: 4, family: 'fetish-blowdart' },
  { kind: Kind.Archer, team: 1, x: 68, y: 26, group: 2, pack: 3, tier: 4, family: 'fetish-blowdart' },
  { kind: Kind.Archer, team: 1, x: 70, y: 28, group: 2, pack: 3, tier: 4, family: 'fetish-blowdart' },
  { kind: Kind.Golem, team: 1, x: 84, y: 36, group: 2, pack: 4, tier: 4, family: 'stormtree' },
  { kind: Kind.Mage, team: 1, x: 86, y: 36, group: 2, pack: 4, vip: true, tier: 5, family: 'bog-hexer-zulmar', bossMods: ['fire_enchanted', 'magic_resistant', 'blessed_aura'] }, // Zulmar, High Hexer of the Mire
  { kind: Kind.Archer, team: 1, x: 88, y: 35, group: 2, pack: 4, tier: 4, family: 'fetish-blowdart' },
  { kind: Kind.Archer, team: 1, x: 88, y: 37, group: 2, pack: 4, tier: 4, family: 'fetish-blowdart' },
  { kind: Kind.Archer, team: 1, x: 90, y: 36, group: 2, pack: 4, tier: 4, family: 'fetish-blowdart' },

  // ================= GROUP 3: MQ3-03 (Rescue on Hourglass Spit - Valkor, the Rimewing) =================
  { kind: Kind.Golem, team: 1, x: 60, y: 156, group: 3, pack: 5, tier: 4, family: 'salt-crab' },
  { kind: Kind.Imp, team: 1, x: 62, y: 156, group: 3, pack: 5, tier: 4, family: 'lantern-eel' },
  { kind: Kind.Imp, team: 1, x: 64, y: 158, group: 3, pack: 6, vip: true, tier: 4, family: 'rimewing-valkor', bossMods: ['cold_enchanted', 'teleporting', 'extra_fast'] }, // Valkor, the Rimewing
  { kind: Kind.Imp, team: 1, x: 66, y: 157, group: 3, pack: 6, tier: 4, family: 'rift-moth' },
  { kind: Kind.Imp, team: 1, x: 66, y: 159, group: 3, pack: 6, tier: 4, family: 'rift-moth' },
  { kind: Kind.Imp, team: 1, x: 68, y: 158, group: 3, pack: 6, tier: 4, family: 'rift-moth' },
  { kind: Kind.Imp, team: 1, x: 68, y: 160, group: 3, pack: 6, tier: 4, family: 'rift-moth' },

  // ================= GROUP 4: MQ3-04 (The Sunken Citadel & Drowned Choir) =================
  { kind: Kind.Warrior, team: 1, x: 156, y: 38, group: 4, pack: 7, tier: 4, family: 'hollow-knight' },
  { kind: Kind.Warrior, team: 1, x: 158, y: 38, group: 4, pack: 7, tier: 5, family: 'hollow-king' },
  { kind: Kind.Imp, team: 1, x: 160, y: 38, group: 4, pack: 7, tier: 4, family: 'lantern-eel' },
  { kind: Kind.Mage, team: 1, x: 172, y: 24, group: 4, pack: 8, vip: true, tier: 5, family: 'frost-bell', bossMods: ['cold_enchanted', 'mana_burn'] }, // Choir-Prelate Morcant
  { kind: Kind.Warrior, team: 1, x: 170, y: 25, group: 4, pack: 8, tier: 5, family: 'hollow-king' },
  { kind: Kind.Mage, team: 1, x: 174, y: 25, group: 4, pack: 8, tier: 4, family: 'frost-bell' },

  // ================= GROUP 5: MQ3-05 (Starved Bastion & Cliff Culverins - Elder Thunderbough) =================
  { kind: Kind.Golem, team: 1, x: 164, y: 88, group: 5, pack: 9, tier: 4, family: 'rootbound' },
  { kind: Kind.Imp, team: 1, x: 166, y: 88, group: 5, pack: 9, tier: 4, family: 'storm-kite' },
  { kind: Kind.Golem, team: 1, x: 168, y: 106, group: 5, pack: 10, vip: true, tier: 5, family: 'thunderbough-elder', bossMods: ['lightning_enchanted', 'extra_fast', 'stone_skin'] }, // Elder Thunderbough
  { kind: Kind.Golem, team: 1, x: 166, y: 105, group: 5, pack: 10, tier: 4, family: 'rootbound' },
  { kind: Kind.Golem, team: 1, x: 170, y: 105, group: 5, pack: 10, tier: 4, family: 'rootbound' },
  { kind: Kind.Golem, team: 1, x: 162, y: 122, group: 5, pack: 11, tier: 5, family: 'wendigo-bruiser' },
  { kind: Kind.Golem, team: 1, x: 164, y: 122, group: 5, pack: 11, tier: 4, family: 'rootbound' },

  // ================= GROUP 6: MQ3-06 (Burning Harborwatch & Flagship - Act III Boss Vesperion) =================
  { kind: Kind.Golem, team: 1, x: 174, y: 172, group: 6, pack: 12, vip: true, tier: 5, family: 'vesperion', bossMods: ['cold_enchanted', 'magic_resistant', 'blessed_aura'] }, // Act III Boss: Vesperion
  { kind: Kind.Warrior, team: 1, x: 172, y: 170, group: 6, pack: 12, tier: 5, family: 'doom-knight' },
  { kind: Kind.Warrior, team: 1, x: 176, y: 170, group: 6, pack: 12, tier: 5, family: 'doom-knight' },
  { kind: Kind.Mage, team: 1, x: 172, y: 174, group: 6, pack: 12, tier: 5, family: 'frost-bell' },
  { kind: Kind.Mage, team: 1, x: 176, y: 174, group: 6, pack: 12, tier: 5, family: 'ash-weaver' },
  { kind: Kind.Golem, team: 1, x: 170, y: 172, group: 6, pack: 12, tier: 5, family: 'salt-crab' },

  // ================= GROUP 7: SQ3-01 (The Blighted Cider-Orchard - Ignisweb) =================
  { kind: Kind.Mage, team: 1, x: 88, y: 76, group: 7, pack: 13, vip: true, tier: 4, family: 'cinderweb-arachna', bossMods: ['fire_enchanted', 'extra_strong', 'cursed'] }, // Ignisweb, the Burning Matron
  { kind: Kind.Gnoll, team: 1, x: 86, y: 75, group: 7, pack: 13, tier: 3, family: 'maggot-swarm' },
  { kind: Kind.Gnoll, team: 1, x: 90, y: 75, group: 7, pack: 13, tier: 3, family: 'maggot-swarm' },
  { kind: Kind.Gnoll, team: 1, x: 86, y: 77, group: 7, pack: 13, tier: 3, family: 'maggot-swarm' },
  { kind: Kind.Gnoll, team: 1, x: 90, y: 77, group: 7, pack: 13, tier: 3, family: 'maggot-swarm' },
  { kind: Kind.Mage, team: 1, x: 88, y: 74, group: 7, pack: 13, tier: 4, family: 'night-orchard' },

  // ================= GROUP 8: SQ3-02 (Baron Vane's Counterweight Hoist) =================
  { kind: Kind.Warrior, team: 1, x: 28, y: 164, group: 8, pack: 14, vip: true, tier: 4, family: 'hollow-knight', bossMods: ['cold_enchanted', 'extra_fast'] },
  { kind: Kind.Golem, team: 1, x: 26, y: 164, group: 8, pack: 14, tier: 4, family: 'salt-crab' },
  { kind: Kind.Imp, team: 1, x: 30, y: 164, group: 8, pack: 14, tier: 4, family: 'lantern-eel' },

  // ================= GROUP 9: SQ3-03 (The Age-of-Chains Juggernaut - Elder Juggernaut) =================
  { kind: Kind.Golem, team: 1, x: 112, y: 24, group: 9, pack: 15, vip: true, tier: 5, family: 'silt-colossus', bossMods: ['stone_skin', 'extra_strong', 'magic_resistant'] }, // The Elder Juggernaut
  { kind: Kind.Golem, team: 1, x: 110, y: 25, group: 9, pack: 15, tier: 4, family: 'stormtree' },
  { kind: Kind.Golem, team: 1, x: 114, y: 25, group: 9, pack: 15, tier: 4, family: 'stormtree' },

  // ================= GROUP 10: SQ3-04 (Clashing Banners on the Ridge) =================
  { kind: Kind.Warrior, team: 1, x: 132, y: 96, group: 10, pack: 16, vip: true, tier: 4, family: 'doom-knight', bossMods: ['fire_enchanted', 'spectral_hit'] },
  { kind: Kind.Warrior, team: 1, x: 130, y: 96, group: 10, pack: 16, tier: 4, family: 'hollow-knight' },
  { kind: Kind.Mage, team: 1, x: 134, y: 96, group: 10, pack: 16, tier: 4, family: 'ash-weaver' },

  // ================= GROUP 11: SQ3-05 (The Cracked Prism of Harborwatch) =================
  { kind: Kind.Mage, team: 1, x: 150, y: 148, group: 11, pack: 17, vip: true, tier: 5, family: 'frost-bell', bossMods: ['cold_enchanted', 'extra_fast'] },
  { kind: Kind.Warrior, team: 1, x: 152, y: 150, group: 11, pack: 17, tier: 5, family: 'doom-knight' },
  { kind: Kind.Imp, team: 1, x: 154, y: 148, group: 11, pack: 17, tier: 4, family: 'storm-kite' },

  // ================= GROUP 12: SQ3-06 (Mudlark Salvage in the Bilge) =================
  { kind: Kind.Golem, team: 1, x: 138, y: 154, group: 12, pack: 18, vip: true, tier: 5, family: 'salt-crab', bossMods: ['stone_skin'] },
  { kind: Kind.Imp, team: 1, x: 136, y: 154, group: 12, pack: 18, tier: 5, family: 'lantern-eel' },
  { kind: Kind.Imp, team: 1, x: 140, y: 154, group: 12, pack: 18, tier: 4, family: 'rift-moth' },
];

const vesperionIdx = units.findIndex((u) => u.family === 'vesperion');
if (vesperionIdx < 0) throw new Error('Vesperion unit missing!');

const regions = [
  { name: 'Oakhaven Harbor (City Hub)', x1: 16, y1: 74, x2: 52, y2: 116, biome: 'highlands', zone: 'ruinstone', music: 'music_town_oakhaven', ambience: 'amb_town_oakhaven' },
  { name: 'Cinder Wards & Blighted Orchard', x1: 53, y1: 64, x2: 112, y2: 122, biome: 'highlands', zone: 'crypt', music: 'music_explore_act3_coast', ambience: 'amb_harbor' },
  { name: 'Greywash Canal & Riverlock', x1: 48, y1: 12, x2: 124, y2: 63, biome: 'marsh', zone: 'ruinstone', music: 'music_explore_act3_coast', ambience: 'amb_harbor' },
  { name: 'Hourglass Spit & Smuggler Caves', x1: 12, y1: 123, x2: 114, y2: 184, biome: 'marsh', zone: 'ruinstone', music: 'music_explore_act3_coast', ambience: 'amb_harbor' },
  { name: 'Sunken Citadel & Drowned Choir', x1: 125, y1: 12, x2: 186, y2: 74, biome: 'crypt', zone: 'ruinstone', music: 'music_explore_act3_citadel', ambience: 'amb_sunken_citadel' },
  { name: 'Starved Bastion & Cliff Batteries', x1: 113, y1: 75, x2: 186, y2: 134, biome: 'highlands', zone: 'snow', music: 'music_explore_act3_coast', ambience: 'amb_harbor' },
  { name: 'Burning Harborwatch & Flagship', x1: 115, y1: 135, x2: 186, y2: 186, biome: 'highlands', zone: 'ruinstone', music: 'music_boss_vesperion', ambience: 'amb_harbor' },
];

const waypoints = [
  { id: 'wp-oakhaven', name: 'Oakhaven Drydock Square', x: 26, y: 96, activated: true },
  { id: 'wp-cinder-wards', name: 'Cinder Wards Crossroads', x: 78, y: 96 },
  { id: 'wp-riverlock', name: 'Riverlock Floodgate Capstans', x: 88, y: 38 },
  { id: 'wp-hourglass-spit', name: 'Hourglass Shingle Bar', x: 62, y: 152 },
  { id: 'wp-sunken-citadel', name: 'Sunken Citadel Causeway', x: 148, y: 52 },
  { id: 'wp-cliff-batteries', name: 'Cliff Culverin Emplacement', x: 152, y: 104 },
  { id: 'wp-harborwatch', name: 'Burning Harborwatch Quay', x: 144, y: 158 },
];

const shrines = [
  { x: 72, y: 92, kind: 'healing', cooldown: 1500 },
  { x: 82, y: 44, kind: 'mana', cooldown: 1500 },
  { x: 58, y: 148, kind: 'haste', cooldown: 1500 },
  { x: 146, y: 48, kind: 'ward', cooldown: 1800 },
  { x: 144, y: 102, kind: 'combat', cooldown: 1800 },
  { x: 146, y: 162, kind: 'armor', cooldown: 1800 },
];

const adventureObjects = [
  { x: 64, y: 82, kind: 'magic_well' },
  { x: 94, y: 32, kind: 'watermill', rewardGold: 250 },
  { x: 36, y: 156, kind: 'windmill', rewardGold: 300 },
  { x: 176, y: 44, kind: 'creature_bank', rewardGold: 800, rewardArtifact: true },
];

const exits = [
  {
    x: 180,
    y: 178,
    targetMap: 'map4-obsidian-caldera',
    targetX: 24,
    targetY: 32,
    label: 'Patched Transport Carracks to Ironcamp Forge-Hold',
    kind: 'caravan',
  },
];

const towns = [
  {
    name: 'Oakhaven Harbor',
    tavern: 0,
    shop: 1,
    school: 2,
    tiers: [3, 5],
    spells: [0, 1, 2, 4, 7, 9, 11, 14, 18, 19],
    mercs: [
      { unit: 1, price: 180 },
      { unit: 2, price: 180 },
      { unit: 3, price: 220 },
      { unit: 4, price: 320 },
    ],
    npcs: [
      { name: 'Kors the Shipwright', x: 24, y: 92, text: 'npc.kors' },
      { name: 'Surgeon Sera', x: 28, y: 94, text: 'npc.sera' },
      { name: 'Warden Lyra', x: 36, y: 92, text: 'npc.lyra' },
      { name: 'Harbor-Master Tavin', x: 32, y: 98, text: 'npc.tavin' },
      { name: 'Sage Quillon', x: 40, y: 90, text: 'npc.quillon' },
    ],
  },
];

const triggers = [
  {
    id: 'init-briefing',
    once: true,
    enabled: true,
    conds: [{ a: { k: 'yes', a: [] }, op: 0, b: { k: 'constant', a: [1] } }],
    acts: [
      { k: 'giveMoney', a: [0, 600] },
      { k: 'setSub', a: [0, 1] },
      { k: 'setSub', a: [1, 1] },
      { k: 'message', a: [1] },
    ],
  },
  {
    id: 'mq3-01-cinder-wards-cleared',
    once: true,
    enabled: true,
    conds: [{ a: { k: 'groupSize', a: [1] }, op: 0, b: { k: 'constant', a: [0] } }],
    acts: [
      { k: 'setSub', a: [0, 2] },
      { k: 'dropGold', a: [80, 98, 700] },
      { k: 'incVar', a: [0] },
      { k: 'message', a: [2] },
    ],
  },
  {
    id: 'mq3-02-riverlock-drained',
    once: true,
    enabled: true,
    conds: [{ a: { k: 'groupSize', a: [2] }, op: 0, b: { k: 'constant', a: [0] } }],
    acts: [
      { k: 'setSub', a: [1, 2] },
      { k: 'setSub', a: [2, 1] },
      { k: 'dropGold', a: [86, 36, 900] },
      { k: 'message', a: [3] },
    ],
  },
  {
    id: 'mq3-03-hourglass-rescued',
    once: true,
    enabled: true,
    conds: [{ a: { k: 'groupSize', a: [3] }, op: 0, b: { k: 'constant', a: [0] } }],
    acts: [
      { k: 'setSub', a: [2, 2] },
      { k: 'setSub', a: [3, 1] },
      { k: 'dropGold', a: [64, 158, 1000] },
      { k: 'message', a: [4] },
    ],
  },
  {
    id: 'mq3-04-drowned-choir-silenced',
    once: true,
    enabled: true,
    conds: [{ a: { k: 'groupSize', a: [4] }, op: 0, b: { k: 'constant', a: [0] } }],
    acts: [
      { k: 'setSub', a: [3, 2] },
      { k: 'setSub', a: [4, 1] },
      { k: 'dropGold', a: [172, 24, 1250] },
      { k: 'message', a: [5] },
    ],
  },
  {
    id: 'mq3-05-cliff-culverins-ranged',
    once: true,
    enabled: true,
    conds: [{ a: { k: 'groupSize', a: [5] }, op: 0, b: { k: 'constant', a: [0] } }],
    acts: [
      { k: 'setSub', a: [4, 2] },
      { k: 'setSub', a: [5, 1] },
      { k: 'dropGold', a: [168, 106, 1400] },
      { k: 'message', a: [6] },
    ],
  },
  {
    id: 'mq3-06-vesperion-slain-victory',
    once: true,
    enabled: true,
    conds: [
      { a: { k: 'groupSize', a: [6] }, op: 0, b: { k: 'constant', a: [0] } },
      { a: { k: 'isVip', a: [vesperionIdx] }, op: 0, b: { k: 'constant', a: [0] } },
    ],
    acts: [
      { k: 'setSub', a: [5, 2] },
      { k: 'dropGold', a: [174, 172, 2500] },
      { k: 'message', a: [7] },
      { k: 'win', a: [] },
    ],
  },
  {
    id: 'sq3-01-blighted-orchard',
    once: true,
    enabled: true,
    conds: [{ a: { k: 'groupSize', a: [7] }, op: 0, b: { k: 'constant', a: [0] } }],
    acts: [
      { k: 'setSub', a: [6, 2] },
      { k: 'giveMoney', a: [0, 1100] },
      { k: 'message', a: [8] },
    ],
  },
  {
    id: 'sq3-02-vane-counterweight-hoist',
    once: true,
    enabled: true,
    conds: [{ a: { k: 'groupSize', a: [8] }, op: 0, b: { k: 'constant', a: [0] } }],
    acts: [
      { k: 'setSub', a: [7, 2] },
      { k: 'giveMoney', a: [0, 1500] },
      { k: 'message', a: [9] },
    ],
  },
  {
    id: 'sq3-03-age-of-chains-juggernaut',
    once: true,
    enabled: true,
    conds: [{ a: { k: 'groupSize', a: [9] }, op: 0, b: { k: 'constant', a: [0] } }],
    acts: [
      { k: 'setSub', a: [8, 2] },
      { k: 'giveMoney', a: [0, 1300] },
      { k: 'message', a: [10] },
    ],
  },
  {
    id: 'sq3-04-clashing-banners',
    once: true,
    enabled: true,
    conds: [{ a: { k: 'groupSize', a: [10] }, op: 0, b: { k: 'constant', a: [0] } }],
    acts: [
      { k: 'setSub', a: [9, 2] },
      { k: 'giveMoney', a: [0, 1400] },
      { k: 'message', a: [11] },
    ],
  },
  {
    id: 'sq3-05-cracked-prism-lighthouse',
    once: true,
    enabled: true,
    conds: [{ a: { k: 'groupSize', a: [11] }, op: 0, b: { k: 'constant', a: [0] } }],
    acts: [
      { k: 'setSub', a: [10, 2] },
      { k: 'giveMoney', a: [0, 1600] },
      { k: 'message', a: [12] },
    ],
  },
  {
    id: 'sq3-06-mudlark-salvage',
    once: true,
    enabled: true,
    conds: [{ a: { k: 'groupSize', a: [12] }, op: 0, b: { k: 'constant', a: [0] } }],
    acts: [
      { k: 'setSub', a: [11, 2] },
      { k: 'giveMoney', a: [0, 1800] },
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
];

const text = {
  title: 'Map III: The Iron Coast & Drowned Citadel',
  body: 'From the storm-lashed drydocks of Oakhaven Harbor, enforce the Bailey Truce across six coastal regions: drain the Greywash Canal locks, extract the stranded vanguard on Hourglass Spit, silence the Drowned Choir inside the Sunken Citadel, range the cliffside bronze culverins, and board Lord Admiral Vesperion\'s burning flagship at Harborwatch.',
  'obj.0': 'Main: Defend the Cinder Wards and Surgeon Sera\'s Chapel Nave Infirmary (78, 96)',
  'obj.0.pos': '78,96',
  'obj.0.kind': 'main',
  'obj.1': 'Main: Slay Zulmar, High Hexer of the Mire, and turn the Riverlock floodgate capstans (86, 36)',
  'obj.1.pos': '86,36',
  'obj.1.kind': 'main',
  'obj.2': 'Main: Race across Hourglass Spit and slay Valkor, the Rimewing (64, 158)',
  'obj.2.pos': '64,158',
  'obj.2.kind': 'main',
  'obj.3': 'Main: Wade into the Sunken Citadel and silence Choir-Prelate Morcant in the Drowned Choir (172, 24)',
  'obj.3.pos': '172,24',
  'obj.3.kind': 'main',
  'obj.4': 'Main: Clear Elder Thunderbough and range the three bronze cliff culverins (168, 106)',
  'obj.4.pos': '168,106',
  'obj.4.kind': 'main',
  'obj.5': 'Main: Board the burning flagship in Harborwatch and slay Lord Admiral Vesperion (174, 172)',
  'obj.5.pos': '174,172',
  'obj.5.kind': 'main',
  'obj.6': 'Side: Purge the Blighted Cider-Orchard and slay Ignisweb, the Burning Matron (88, 76)',
  'obj.6.pos': '88,76',
  'obj.6.kind': 'side',
  'obj.7': 'Side: Uncover Baron Vane\'s smuggling counterweight hoist in the sea-caves (28, 164)',
  'obj.7.pos': '28,164',
  'obj.7.kind': 'side',
  'obj.8': 'Side: Shatter the Age-of-Chains Elder Juggernaut in the northern bedrock pass (112, 24)',
  'obj.8.pos': '112,24',
  'obj.8.kind': 'side',
  'obj.9': 'Side: Quell the Clashing Banners mercenary dispute on the storm ridge (132, 96)',
  'obj.9.pos': '132,96',
  'obj.9.kind': 'side',
  'obj.10': 'Side: Relight the Cracked Prism of Harborwatch Lighthouse with a Conclave lens (152, 146)',
  'obj.10.pos': '152,146',
  'obj.10.kind': 'side',
  'obj.11': 'Side: Guard Pip\'s mudlark wreck-divers along the outer mole winch (138, 154)',
  'obj.11.pos': '138,154',
  'obj.11.kind': 'side',
  'msg.1': '[QUARTERMASTER\'S EYE] *(Kors wipes pine pitch and soot from his forearms with oakum tow while Sera\'s triage tents reek of boiled vinegar and wet wool.)* "The Merchant Council bolted the upper gates while Vesperion\'s fire-hulks turned my drydocks into charcoal, Commander. Here is the Bailey Truce in plain carpenter\'s terms: clear the Cinder Wards, drain the sunken sea-gates, and range Tor\'s bronze culverins on the cliff wall—and I\'ll patch twelve carrack hulls strong enough to cross the volcanic straits."\n1. [War Logic] "Twelve carracks won\'t clear the harbor mouth while Vesperion holds the boom-chain. We take the wards and cliff batteries first."\n2. [Frontier Skepticism] "Your Guild Council hoarded whale-oil behind bolted doors. Make sure the armory stays open."\n3. [Veteran Flesh] "Get Sera\'s surgeons clean linen and vinegar brine. Every soldier she saves is another blade on the sea-wall."',
  'msg.1.who': 'Kors the Shipwright',
  'msg.2': '[VETERAN FLESH] *(Surgeon Sera binds a marine\'s scalded forearm with vinegar-soaked linen as the last Black Fleet landing party collapses outside the Chapel Nave.)* "The infirmary roof holds, Commander! The wounded can breathe again—and the road north toward the Greywash Canal locks is open."',
  'msg.2.who': 'Surgeon Sera',
  'msg.3': '[ASTRAL SHIVER] *(Blue static arcs between Sage Quillon\'s copper coils and the wet flagstones as Zulmar falls and the twin bronze capstans groan open.)* "Third-Dynasty hydraulic engineering paired with galvanic grounding rods! The coastal basin is draining fast—twenty minutes and the kelp-choked causeway into the Sunken Citadel lies bare!"',
  'msg.3.who': 'Sage Quillon',
  'msg.4': '[TACTICAL CALCULUS] *(White breakers smash over the black anchor-rock as Valkor\'s rime-crusted wings shatter on the shingle bar.)* "Pilot Bram\'s stranded vanguard is clear of the sea-caves! With their harbor charts in hand, we can navigate the outer shoals without ripping our keels open."',
  'msg.4.who': 'Warden Lyra',
  'msg.5': '[ASTRAL SHIVER] *(The chilling bronze resonance dies inside the flooded cathedral nave as Choir-Prelate Morcant shatters into salt-rime.)* "The Drowned Choir is silent. No more spectral singers will drag our lookouts over the sea-wall in the midnight fog."',
  'msg.5.who': 'Sage Quillon',
  'msg.6': '[WAR LOGIC] *(Elder Thunderbough crashes down the chalk cliffside as Master Gunner Tor locks the three twelve-degree bronze culverins onto the bay below.)* "Elevation twelve degrees, double-shotted with heated iron! Fire at will—Vesperion\'s blockading line is splitting apart in the smoke!"',
  'msg.6.who': 'Warden Lyra',
  'msg.7': '[VISCERAL DREAD] *(Burning pitch hisses into black tidewater as Vesperion collapses beside the brass binnacle, his salt-corroded astrolabe spinning due south toward the volcanic plume.)* "You think breaking my blockade saves Oakhaven? The moment your boots strike the Obsidian Dais, you will crack the seventh Anchor Seal! Take the astrolabe... and see what waits in the ash!"',
  'msg.7.who': 'Lord Admiral Vesperion',
  'msg.8': '[QUARTERMASTER\'S EYE] *(Ignisweb curls into charred chitin among the terraced apple roots as the violet-sweating orchard trees burn clean.)* "The orchard blight is purged. Herbalist Maren has distilled Oakhaven Aqua Vitae and fitted a Smoked-Quartz Monocle from the watchtower cache."',
  'msg.8.who': 'Warden Lyra',
  'msg.9': '[FRONTIER SKEPTICISM] *(Inside the sea-cave, greased iron chains dangle above crates stamped with Baron Vane\'s private seal.)* "Deep Quarry ironstone and Conclave copper wire—Vane was selling siege metal straight to Vesperion\'s blockaders in exchange for safe passage!"',
  'msg.9.who': 'Harbor-Master Tavin',
  'msg.10': '[ASTRAL SHIVER] *(Cold arcane fire cracks the bedrock shoulder plates of the Elder Juggernaut, exposing a lead-lined Age-of-Chains rune-tablet inside its chest cavity.)* "Magnificent! This tablet records the exact counter-clockwise grounding sequence for the seven meteoric Anchor Valves in the southern caldera!"',
  'msg.10.who': 'Sage Quillon',
  'msg.11': '[COHORT MEMORY] *(With the turncoat Ashen instigators cut down on the ridge, the rival Ironclad and Oakhaven pikemen lower their halberds and salute your banner.)* "Salvage charters be damned—both companies march under your command now, Commander!"',
  'msg.11.who': 'Kors the Shipwright',
  'msg.12': '[ASTRAL SHIVER] *(A clean white beam stabs through the black whale-oil smoke from the top of the Great Prism Lighthouse.)* "The Conclave quartz lens holds the focal arc! All twelve patched transport carracks have a clear bearing past the harbor bar!"',
  'msg.12.who': 'Sage Quillon',
  'msg.13': '[QUARTERMASTER\'S EYE] *(Pip\'s mudlarks haul dripping brass fittings, harbor steel bars, and sealed grape-shot canisters onto the mole.)* "Enough salvaged bronze and seasoned oak to sheet every bow in our expeditionary flotilla!"',
  'msg.13.who': 'Kors the Shipwright',
  'npc.kors': 'Give me dry oakum, forty casks of refined whale-oil, and clear cliff batteries, Commander. I will have twelve sea-going carracks ready to cross the boiling straits before the tide turns.',
  'npc.sera': 'Vinegar brine and hot iron are all keeping the gangrene out of the Chapel Nave. Clear the Cinder Wards outside Tanner\'s Gate before the smoke chokes my patients.',
  'npc.lyra': 'Three bronze culverin batteries sit silent above Starved Bastion while Vesperion\'s fire-hulks shell our sea-walls. Help us retake the cliff road and we will rain hot iron on his quarterdeck.',
  'npc.tavin': 'Someone left the lower sea-gate unbarred on the night the Black Fleet arrived—and Baron Vane\'s coastal caves at Hourglass Spit have been humming with counterweight winches after dark.',
  'npc.quillon': 'Magic is merely telluric pressure and capacitance, Commander! Turn the bronze floodgate capstans at Riverlock to drain the Sunken Citadel, and bring me the lead-lined rune-tablet from the Age-of-Chains Juggernaut in the northern pass.',
  win: 'Lord Admiral Vesperion has fallen on his burning quarterdeck, the Great Prism Lighthouse pierces the storm, and twelve patched carracks weigh anchor for the Obsidian Caldera.',
  'fail.1': 'Your commander has fallen beneath the cold iron surf of Oakhaven.',
};

const doc = {
  format: 'thornvael-map',
  version: 2,
  name: 'The Iron Coast & Drowned Citadel',
  w: W,
  h: H,
  day: 1200,
  terrain: rleEncode(terrain),
  height: rleEncode(height),
  objects,
  units,
  regions,
  players: ['Expeditionary Vanguard', 'Black Fleet Blockade', 'Neutral', 'Oakhaven Maritime Guild'],
  waypoints,
  shrines,
  adventureObjects,
  exits,
  towns,
  triggers,
  text,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`Wrote ${OUT_PATH} (${units.length} units, ${triggers.length} triggers, ${regions.length} regions).`);
