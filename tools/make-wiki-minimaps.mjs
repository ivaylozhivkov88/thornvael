// Generates deterministic PNG minimaps for:
//   - all 7 skirmish biomes into public/wiki/minimaps/<biome>.png
//   - all 28 macro regions into public/wiki/minimaps/regions/<rid>.png
//   - all 46 campaign missions into public/wiki/minimaps/missions/<id>.png
// and registers them in assets.json with license "own" and source "tools/make-wiki-minimaps.mjs".
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => join(ROOT, ...a);

if (!process.argv.includes('--no-ts-hook') && !process.env.VITEST && !globalThis.__thornvaelWikiTsHook) {
  globalThis.__thornvaelWikiTsHook = true;
  const { transformSync } = await import('rolldown/experimental');
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) && context.parentURL?.startsWith('file:')) {
        const dir = dirname(fileURLToPath(context.parentURL));
        const ts = resolve(dir, specifier + '.ts');
        if (existsSync(ts)) return nextResolve(pathToFileURL(ts).href, context);
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url.startsWith('file:') && url.endsWith('.ts')) {
        const file = fileURLToPath(url);
        const out = transformSync(file, readFileSync(file, 'utf8'), { lang: 'ts' });
        return { format: 'module', source: out.code, shortCircuit: true };
      }
      return nextLoad(url, context);
    },
  });
}

const [{ generateSkirmishMap }, { rleDecode }, { bakeLight, ObjectKind, Terrain }] = await Promise.all([
  import('../src/skirmish-generator.ts'),
  import('../src/mapdoc.ts'),
  import('../src/map.ts'),
]);

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// CRC32 table for PNG chunks
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}
function encodePngRgba(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter None
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const BIOME_PALETTE = {
  forest: {
    [Terrain.Grass]: [64, 104, 52],
    [Terrain.Dirt]: [128, 100, 68],
    [Terrain.Water]: [42, 82, 134],
    [Terrain.Rock]: [98, 100, 106],
    [Terrain.Marsh]: [74, 92, 58],
    tree: [32, 64, 28],
  },
  marsh: {
    [Terrain.Grass]: [72, 92, 56],
    [Terrain.Dirt]: [102, 88, 66],
    [Terrain.Water]: [38, 74, 78],
    [Terrain.Rock]: [88, 92, 88],
    [Terrain.Marsh]: [58, 78, 48],
    tree: [38, 56, 34],
  },
  desert: {
    [Terrain.Grass]: [188, 158, 98],
    [Terrain.Dirt]: [198, 166, 106],
    [Terrain.Water]: [56, 118, 146],
    [Terrain.Rock]: [136, 106, 74],
    [Terrain.Marsh]: [150, 128, 82],
    tree: [116, 102, 54],
  },
  crypt: {
    [Terrain.Grass]: [82, 82, 94],
    [Terrain.Dirt]: [98, 92, 102],
    [Terrain.Water]: [42, 52, 74],
    [Terrain.Rock]: [64, 62, 72],
    [Terrain.Marsh]: [70, 72, 84],
    tree: [50, 48, 60],
  },
  highlands: {
    [Terrain.Grass]: [104, 120, 78],
    [Terrain.Dirt]: [136, 122, 96],
    [Terrain.Water]: [48, 94, 140],
    [Terrain.Rock]: [122, 124, 130],
    [Terrain.Marsh]: [92, 104, 82],
    tree: [52, 76, 48],
  },
  volcanic: {
    [Terrain.Grass]: [72, 56, 52],
    [Terrain.Dirt]: [66, 52, 48],
    [Terrain.Water]: [206, 78, 28], // magma channels
    [Terrain.Rock]: [46, 40, 42],
    [Terrain.Marsh]: [96, 68, 52],
    tree: [38, 30, 30],
  },
  oasis: {
    [Terrain.Grass]: [94, 138, 72],
    [Terrain.Dirt]: [192, 164, 104],
    [Terrain.Water]: [52, 146, 176],
    [Terrain.Rock]: [144, 118, 86],
    [Terrain.Marsh]: [104, 128, 82],
    tree: [46, 98, 44],
  },
};

const BIOMES = ['forest', 'marsh', 'desert', 'crypt', 'highlands', 'volcanic', 'oasis'];

const MACRO_MAPS = [
  ['map1-border-fords', 1],
  ['map2-redmarsh-wastes', 2],
  ['map3-iron-coast', 3],
  ['map4-obsidian-caldera', 4],
];

const MISSION_FILE_ALIASES = {
  ford: 'blood-at-the-ford.map.json',
  fen: 'whispers-in-the-fen.map.json',
  ravenwatch: 'nightfall-at-ravenwatch.map.json',
  sanctum: 'the-sunken-sanctum.map.json',
};

function decodeDocLayers(doc) {
  const w = doc.w;
  const h = doc.h;
  const n = w * h;
  const terrain = rleDecode(doc.terrain ?? [], n);
  const height = rleDecode(doc.height ?? [], n);
  const light = bakeLight(w, h, height);
  return { w, h, terrain, height, light };
}

function drawMinimapFromLayers(
  doc,
  layers,
  { biome = 'forest', bounds = null, fixedScale = null, targetMax = 240, showUnits = false } = {},
) {
  const { w, h, terrain, light } = layers;
  const x1 = Math.max(0, Math.min(w - 1, bounds?.x1 ?? 0));
  const y1 = Math.max(0, Math.min(h - 1, bounds?.y1 ?? 0));
  const x2 = Math.max(x1, Math.min(w - 1, bounds?.x2 ?? w - 1));
  const y2 = Math.max(y1, Math.min(h - 1, bounds?.y2 ?? h - 1));
  const cropW = x2 - x1 + 1;
  const cropH = y2 - y1 + 1;

  const pal = BIOME_PALETTE[biome] ?? BIOME_PALETTE.forest;
  let outW;
  let outH;
  if (fixedScale) {
    outW = cropW * fixedScale;
    outH = cropH * fixedScale;
  } else {
    const maxCrop = Math.max(cropW, cropH);
    if (maxCrop <= targetMax) {
      const scale = Math.max(2, Math.min(4, Math.floor(targetMax / maxCrop)));
      outW = cropW * scale;
      outH = cropH * scale;
    } else {
      outW = Math.max(64, Math.round((cropW * targetMax) / maxCrop));
      outH = Math.max(64, Math.round((cropH * targetMax) / maxCrop));
    }
  }

  const rgba = Buffer.alloc(outW * outH * 4);
  const putPixel = (px, py, rgb) => {
    if (px < 0 || py < 0 || px >= outW || py >= outH) return;
    const idx = (py * outW + px) * 4;
    rgba[idx] = rgb[0];
    rgba[idx + 1] = rgb[1];
    rgba[idx + 2] = rgb[2];
    rgba[idx + 3] = 255;
  };
  const fillTileRect = (tx, ty, tw, th, rgb) => {
    if (tx + tw - 1 < x1 || tx > x2 || ty + th - 1 < y1 || ty > y2) return;
    const px0 = Math.max(0, Math.floor(((tx - x1) * outW) / cropW));
    const py0 = Math.max(0, Math.floor(((ty - y1) * outH) / cropH));
    const px1 = Math.min(outW - 1, Math.max(px0, Math.ceil(((tx + tw - x1) * outW) / cropW) - 1));
    const py1 = Math.min(outH - 1, Math.max(py0, Math.ceil(((ty + th - y1) * outH) / cropH) - 1));
    for (let py = py0; py <= py1; py++) {
      for (let px = px0; px <= px1; px++) {
        putPixel(px, py, rgb);
      }
    }
  };
  const drawMarker = (tx, ty, rgb, radius = 1) => {
    if (tx < x1 || tx > x2 || ty < y1 || ty > y2) return;
    const cx = Math.min(outW - 1, Math.max(0, Math.floor(((tx + 0.5 - x1) * outW) / cropW)));
    const cy = Math.min(outH - 1, Math.max(0, Math.floor(((ty + 0.5 - y1) * outH) / cropH)));
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= radius + (radius > 1 ? 0 : 1)) {
          putPixel(cx + dx, cy + dy, rgb);
        }
      }
    }
  };

  // Base terrain + slope hill-shading (supports both upscaling and downsampling)
  for (let py = 0; py < outH; py++) {
    const tyStart = y1 + Math.floor((py * cropH) / outH);
    const tyEnd = Math.min(y2, Math.max(tyStart, y1 + Math.floor(((py + 1) * cropH) / outH) - 1));
    for (let px = 0; px < outW; px++) {
      const txStart = x1 + Math.floor((px * cropW) / outW);
      const txEnd = Math.min(x2, Math.max(txStart, x1 + Math.floor(((px + 1) * cropW) / outW) - 1));
      let r = 0;
      let g = 0;
      let b = 0;
      let cnt = 0;
      for (let ty = tyStart; ty <= tyEnd; ty++) {
        for (let tx = txStart; tx <= txEnd; tx++) {
          const i = ty * w + tx;
          const base = pal[terrain[i]] ?? pal[Terrain.Grass];
          const shade = 0.55 + (light[i] / 255) * 0.55;
          r += Math.min(255, base[0] * shade);
          g += Math.min(255, base[1] * shade);
          b += Math.min(255, base[2] * shade);
          cnt++;
        }
      }
      putPixel(px, py, [Math.round(r / cnt), Math.round(g / cnt), Math.round(b / cnt)]);
    }
  }

  // Trees & structures
  for (const obj of doc.objects ?? []) {
    if (obj.kind === ObjectKind.Tree) {
      fillTileRect(obj.x, obj.y, 1, 1, pal.tree);
    } else if (obj.kind === ObjectKind.House) {
      const color =
        obj.owner === 0 ? [120, 185, 255] : obj.owner === 2 || obj.owner === 3 ? [220, 182, 102] : [228, 92, 78];
      fillTileRect(obj.x, obj.y, 2, 2, color);
    }
  }

  // Towns (extra bright amber/blue outline highlight for city hubs)
  for (const town of doc.towns ?? []) {
    if (typeof town.x === 'number' && typeof town.y === 'number') {
      drawMarker(town.x, town.y, [246, 206, 118], 2);
    }
  }

  // Optional units for mission tactical overview
  if (showUnits) {
    for (const u of doc.units ?? []) {
      if (u.dormant) continue;
      if (u.team === 0) drawMarker(u.x, u.y, [108, 224, 255], u.kind === 2 ? 2 : 1);
      else if (u.team === 1) drawMarker(u.x, u.y, [238, 86, 74], u.vip || u.bossMods?.length ? 2 : 0);
      else if (u.team === 3) drawMarker(u.x, u.y, [118, 232, 148], 1);
    }
  }

  // Shrines, waypoints, zone exits
  for (const sh of doc.shrines ?? []) {
    drawMarker(sh.x, sh.y, [245, 212, 92], 1);
  }
  for (const wp of doc.waypoints ?? []) {
    drawMarker(wp.x, wp.y, [104, 236, 255], 1);
  }
  for (const ex of doc.exits ?? []) {
    drawMarker(ex.x, ex.y, [110, 240, 152], 1);
  }

  // Thin bronze border
  for (let x = 0; x < outW; x++) {
    for (const y of [0, outH - 1]) putPixel(x, y, [138, 107, 58]);
  }
  for (let y = 0; y < outH; y++) {
    for (const x of [0, outW - 1]) putPixel(x, y, [138, 107, 58]);
  }

  return encodePngRgba(outW, outH, rgba);
}

export function renderBiomeMinimapPng(biome, seed = 7) {
  const doc = generateSkirmishMap({ seed, biome, players: 2, size: 80 });
  const layers = decodeDocLayers(doc);
  return drawMinimapFromLayers(doc, layers, { biome, fixedScale: 3 });
}

export function inferMissionBiome(mission) {
  const id = String(mission.id ?? '').toLowerCase();
  const act = Number(mission.act ?? 1);
  if (/sanctum|undervault|hexer|sunken-citadel/.test(id)) return 'crypt';
  if (/fen|redmarsh|mire|ochre|riverlock/.test(id)) return 'marsh';
  if (/wardstone/.test(id)) return 'oasis';
  if (/split-vanguard|alder-bridge|ironhide|quarry|fork-of-spears/.test(id)) return 'highlands';
  if (act === 1) return 'forest';
  if (act === 2) return 'desert';
  if (act === 3) return 'highlands';
  return 'volcanic';
}

export function resolveMissionMapFile(mapKey) {
  const dir = P('src', 'missions');
  if (MISSION_FILE_ALIASES[mapKey]) {
    const p = join(dir, MISSION_FILE_ALIASES[mapKey]);
    if (existsSync(p)) return p;
  }
  const files = readdirSync(dir);
  const exact = files.find((f) => f === `${mapKey}.map.json`);
  if (exact) return join(dir, exact);
  const prefixed = files.find((f) => f.startsWith(`${mapKey}-`) && f.endsWith('.map.json'));
  if (prefixed) return join(dir, prefixed);
  return null;
}

export function getRegionTargets() {
  const out = [];
  for (const [file, act] of MACRO_MAPS) {
    const path = P('src', 'missions', `${file}.map.json`);
    if (!existsSync(path)) continue;
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    for (const r of doc.regions ?? []) {
      const rid = `map${act}-${slug(r.name)}`;
      out.push({ rid, act, mapFile: file, doc, region: r });
    }
  }
  return out;
}

export function getMissionTargets() {
  const camp = JSON.parse(readFileSync(P('public', 'data', 'campaign.json'), 'utf8'));
  return (camp.nodes ?? [])
    .filter((n) => n.kind === 'mission')
    .map((n) => ({ node: n, mapPath: resolveMissionMapFile(n.map) }));
}

export function renderRegionMinimapPng(doc, layers, region) {
  return drawMinimapFromLayers(doc, layers, {
    biome: region.biome ?? 'forest',
    bounds: { x1: region.x1, y1: region.y1, x2: region.x2, y2: region.y2 },
    targetMax: 240,
    showUnits: false,
  });
}

export function renderMissionMinimapPng(missionNode, mapDoc) {
  const biome = inferMissionBiome(missionNode);
  const doc = mapDoc ?? generateSkirmishMap({ seed: 11 + (missionNode.act ?? 1) * 17, biome, players: 2, size: 64 });
  const layers = decodeDocLayers(doc);
  return drawMinimapFromLayers(doc, layers, {
    biome,
    targetMax: 240,
    showUnits: true,
  });
}

export function addMinimapAssetsEntries(manifest) {
  const byPath = new Map(manifest.assets.map((a) => [a.path, a]));
  for (const biome of BIOMES) {
    const rel = `public/wiki/minimaps/${biome}.png`;
    byPath.set(rel, {
      path: rel,
      license: 'own',
      source: 'tools/make-wiki-minimaps.mjs',
      note: `Generated seeded skirmish minimap for the ${biome} biome`,
    });
  }
  for (const { rid, region } of getRegionTargets()) {
    const rel = `public/wiki/minimaps/regions/${rid}.png`;
    byPath.set(rel, {
      path: rel,
      license: 'own',
      source: 'tools/make-wiki-minimaps.mjs',
      note: `Generated macro region minimap crop for ${region.name}`,
    });
  }
  for (const { node } of getMissionTargets()) {
    const rel = `public/wiki/minimaps/missions/${node.id}.png`;
    byPath.set(rel, {
      path: rel,
      license: 'own',
      source: 'tools/make-wiki-minimaps.mjs',
      note: `Generated campaign mission minimap for ${node.title}`,
    });
  }
  return { ...manifest, assets: [...byPath.values()] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = P('public', 'wiki', 'minimaps');
  const regDir = join(outDir, 'regions');
  const misDir = join(outDir, 'missions');
  mkdirSync(outDir, { recursive: true });
  mkdirSync(regDir, { recursive: true });
  mkdirSync(misDir, { recursive: true });

  for (const biome of BIOMES) {
    const png = renderBiomeMinimapPng(biome, 7);
    if (png.length >= 3 * 1024 * 1024) throw new Error(`Minimap ${biome}.png exceeds 3 MiB`);
    writeFileSync(join(outDir, `${biome}.png`), png);
  }

  const regions = getRegionTargets();
  const layerCache = new Map();
  for (const { rid, mapFile, doc, region } of regions) {
    let layers = layerCache.get(mapFile);
    if (!layers) {
      layers = decodeDocLayers(doc);
      layerCache.set(mapFile, layers);
    }
    const png = renderRegionMinimapPng(doc, layers, region);
    if (png.length >= 3 * 1024 * 1024) throw new Error(`Region minimap ${rid}.png exceeds 3 MiB`);
    writeFileSync(join(regDir, `${rid}.png`), png);
  }

  const missions = getMissionTargets();
  for (const { node, mapPath } of missions) {
    const doc = mapPath && existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf8')) : null;
    const png = renderMissionMinimapPng(node, doc);
    if (png.length >= 3 * 1024 * 1024) throw new Error(`Mission minimap ${node.id}.png exceeds 3 MiB`);
    writeFileSync(join(misDir, `${node.id}.png`), png);
  }

  const assetsPath = P('assets.json');
  const manifest = JSON.parse(readFileSync(assetsPath, 'utf8'));
  const updated = addMinimapAssetsEntries(manifest);
  writeFileSync(assetsPath, JSON.stringify(updated, null, 2) + '\n');
  console.log(
    `Generated ${BIOMES.length} biome, ${regions.length} region, and ${missions.length} mission minimaps in public/wiki/minimaps/ and registered in assets.json`,
  );
}
