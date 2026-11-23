#!/usr/bin/env node
/**
 * Deterministically enriches mission maps with:
 * - Region metadata (biome, zone, music, ambience, light, weather)
 * - Biome-appropriate landmarks & small details spaced across playable areas
 *   so no 10+ tile stretch is empty, without blocking units, shrines, waypoints, or roads.
 */
import fs from 'node:fs';
import path from 'node:path';

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

const BIOME_PROPS = {
  forest: ['highland/oak', 'highland/log', 'rocks/boulder-m', 'camp/crates', 'camp/fire'],
  marsh: ['ruins/rubble', 'ruins/column-broken', 'camp/fire', 'rocks/slab', 'bones/ribcage'],
  highlands: ['highland/pine-a', 'highland/standing-stone', 'rocks/crystal', 'rocks/spire', 'camp/banner'],
  crypt: ['bones/tombstone', 'bones/sarcophagus', 'bones/skullspike', 'bones/candles', 'ruins/arch', 'ruins/wall'],
  desert: ['desert/palm-a', 'desert/cactus', 'desert/thorn', 'rocks/cluster', 'bones/ribcage', 'camp/tent'],
  oasis: ['desert/palm-a', 'desert/palm-b', 'desert/stump', 'rocks/cluster', 'camp/fire'],
  volcanic: ['volcanic/dead-a', 'volcanic/dead-b', 'volcanic/obsidian', 'volcanic/vent', 'ruins/column-broken'],
};

export function enrichMissionMap(relPath, cfg) {
  const fullPath = path.resolve(relPath);
  const doc = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const w = doc.w;
  const h = doc.h;
  const terrain = rleDecode(doc.terrain, w * h);

  // 1. Update region metadata
  if (Array.isArray(doc.regions)) {
    for (const r of doc.regions) {
      if (cfg.biome && !r.biome) r.biome = cfg.biome;
      if (cfg.zone && !r.zone) r.zone = cfg.zone;
      if (cfg.music && !r.music) r.music = cfg.music;
      if (cfg.ambience && !r.ambience) r.ambience = cfg.ambience;
      if (cfg.light && !r.light) r.light = cfg.light;
      if (cfg.weather && !r.weather) r.weather = cfg.weather;
    }
  }
  if (cfg.day !== undefined && doc.day === undefined) {
    doc.day = cfg.day;
  }

  // 2. Build occupied/reserved set around units, shrines, waypoints, houses, and existing objects
  const blockedTiles = new Set();
  for (const u of doc.units || []) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        blockedTiles.add(`${u.x + dx},${u.y + dy}`);
      }
    }
  }
  for (const s of doc.shrines || []) blockedTiles.add(`${s.x},${s.y}`);
  for (const wp of doc.waypoints || []) blockedTiles.add(`${wp.x},${wp.y}`);
  for (const o of doc.objects || []) {
    if (o.kind === 1) {
      for (let dy = -1; dy <= 2; dy++) {
        for (let dx = -1; dx <= 2; dx++) {
          blockedTiles.add(`${o.x + dx},${o.y + dy}`);
        }
      }
    } else {
      blockedTiles.add(`${o.x},${o.y}`);
    }
  }

  // 3. Ensure landmarks / details across 14x14 grid cells if sparse
  const props = cfg.props || BIOME_PROPS[cfg.biome] || BIOME_PROPS.forest;
  const rng = mulberry32(cfg.seed || 1337);
  const cell = cfg.cell || 14;
  let added = 0;

  if (!cfg.metadataOnly) {
    const existing = doc.objects || [];
    for (let cy = 3; cy < h - 3; cy += cell) {
      for (let cx = 3; cx < w - 3; cx += cell) {
        const hasNearby = existing.some(
          (o) => Math.abs(o.x - (cx + cell / 2)) <= cell * 0.65 && Math.abs(o.y - (cy + cell / 2)) <= cell * 0.65,
        );
        if (hasNearby && !cfg.forceDetails) continue;

        for (let attempt = 0; attempt < 8; attempt++) {
          const tx = Math.min(w - 3, Math.max(2, cx + Math.floor(rng() * (cell - 2))));
          const ty = Math.min(h - 3, Math.max(2, cy + Math.floor(rng() * (cell - 2))));
          const t = terrain[ty * w + tx];
          // Avoid Water (2), Rock (3), and Dirt (1) roads so paths stay clear
          if (t === 2 || t === 3 || t === 1) continue;
          if (blockedTiles.has(`${tx},${ty}`)) continue;
          const frame = props[Math.floor(rng() * props.length)];
          existing.push({ kind: 0, x: tx, y: ty, frame });
          blockedTiles.add(`${tx},${ty}`);
          added++;
          break;
        }
      }
    }
    doc.objects = existing;
  }

  fs.writeFileSync(fullPath, JSON.stringify(doc, null, 2) + '\n');
  console.log(`Enriched ${path.basename(fullPath)}: objs=${doc.objects.length} (+${added}), units=${doc.units.length}, regs=${doc.regions.length}`);
}

if (process.argv[2]) {
  const cfg = JSON.parse(process.argv[3] || '{}');
  enrichMissionMap(process.argv[2], cfg);
}
