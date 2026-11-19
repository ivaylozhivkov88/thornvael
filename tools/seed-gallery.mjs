#!/usr/bin/env node
/**
 * Headless biome seed contact-sheet generator (WISHLIST H4).
 *
 * Generates deterministic PNG contact sheets for all 7 biomes into
 * `tools/.canva-sheets/seed-gallery/` using pure Node (Vite SSR + Uint32Array + zlib PNG).
 *
 * Usage:
 *   node tools/seed-gallery.mjs [--seeds 7,42,101,777] [--mode skirmish|expedition|both] [--players 2]
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = path.join(ROOT, 'tools', '.canva-sheets', 'seed-gallery');
const BIOMES = ['forest', 'marsh', 'desert', 'crypt', 'highlands', 'volcanic', 'oasis'];

const args = process.argv.slice(2);
const option = (key, fallback) => {
  const idx = args.indexOf(key);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
};

const seeds = option('--seeds', '7,42,101,777')
  .split(',')
  .map((s) => Number.parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n));
const modeArg = option('--mode', 'skirmish');
const modes = modeArg === 'both' ? ['skirmish', 'expedition'] : [modeArg === 'expedition' ? 'expedition' : 'skirmish'];
const players = Math.min(4, Math.max(2, Number.parseInt(option('--players', '2'), 10) || 2));

const IS_LITTLE_ENDIAN = new Uint8Array(Uint32Array.of(1).buffer)[0] === 1;
function packRgb(r, g, b) {
  if (IS_LITTLE_ENDIAN) return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  return ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
}

// Pure-Node RGBA8 PNG encoder with reusable scanline scratch buffer
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
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length, 0);
  const tag = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tag, data])), 0);
  return Buffer.concat([len, tag, data, crcBuf]);
}
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_IEND = pngChunk('IEND', Buffer.alloc(0));

function encodePng(w, h, rgba, rawScratch) {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = w * 4;
  const raw = rawScratch ?? Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 6 });
  return Buffer.concat([PNG_SIG, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), PNG_IEND]);
}

// Tiny 3x5 bitmap font for seed labels
const GLYPHS = {
  0: [7, 5, 5, 5, 7],
  1: [2, 6, 2, 2, 7],
  2: [7, 1, 7, 4, 7],
  3: [7, 1, 7, 1, 7],
  4: [5, 5, 7, 1, 1],
  5: [7, 4, 7, 1, 7],
  6: [7, 4, 7, 5, 7],
  7: [7, 1, 1, 2, 2],
  8: [7, 5, 7, 5, 7],
  9: [7, 5, 7, 1, 7],
  '-': [0, 0, 7, 0, 0],
  '=': [0, 7, 0, 7, 0],
  ' ': [0, 0, 0, 0, 0],
  A: [2, 5, 7, 5, 5],
  B: [6, 5, 6, 5, 6],
  C: [7, 4, 4, 4, 7],
  D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4],
  G: [7, 4, 5, 5, 7],
  H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7],
  K: [5, 5, 6, 5, 5],
  L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5],
  N: [5, 7, 7, 7, 5],
  O: [7, 5, 5, 5, 7],
  P: [7, 5, 7, 4, 4],
  R: [7, 5, 6, 5, 5],
  S: [7, 4, 7, 1, 7],
  T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7],
  V: [5, 5, 5, 5, 2],
  W: [5, 5, 7, 7, 5],
  X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2],
};

function drawText(rgba32, bw, bh, x0, y0, text, packedColor, scale = 2) {
  const s = text.toUpperCase();
  let cx = x0;
  for (const ch of s) {
    const g = GLYPHS[ch];
    if (g) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if ((g[row] >> (2 - col)) & 1) {
            for (let sy = 0; sy < scale; sy++) {
              const py = y0 + row * scale + sy;
              if (py < 0 || py >= bh) continue;
              const rowOff = py * bw + cx + col * scale;
              for (let sx = 0; sx < scale; sx++) {
                const px = cx + col * scale + sx;
                if (px >= 0 && px < bw) rgba32[rowOff + sx] = packedColor;
              }
            }
          }
        }
      }
    }
    cx += 4 * scale;
  }
}

// Biome-aware terrain palette (Grass, Dirt, Water, Rock, Marsh) pre-packed by height shade 0..3
const RAW_PALETTES = {
  forest: [
    [64, 112, 48],
    [116, 86, 56],
    [42, 92, 140],
    [98, 98, 102],
    [58, 84, 52],
  ],
  marsh: [
    [62, 96, 54],
    [98, 82, 58],
    [38, 86, 102],
    [86, 90, 88],
    [48, 72, 46],
  ],
  desert: [
    [168, 146, 84],
    [198, 166, 106],
    [48, 112, 148],
    [132, 108, 82],
    [138, 116, 76],
  ],
  crypt: [
    [76, 82, 74],
    [92, 88, 96],
    [44, 62, 88],
    [66, 66, 74],
    [60, 56, 72],
  ],
  highlands: [
    [86, 118, 66],
    [136, 118, 88],
    [48, 98, 138],
    [122, 126, 132],
    [74, 92, 78],
  ],
  volcanic: [
    [72, 58, 52],
    [54, 44, 42],
    [196, 74, 24],
    [64, 58, 62],
    [96, 52, 36],
  ],
  oasis: [
    [74, 134, 58],
    [186, 158, 98],
    [44, 124, 162],
    [126, 106, 84],
    [64, 104, 66],
  ],
};

const PACKED_PALETTES = Object.fromEntries(
  Object.entries(RAW_PALETTES).map(([biome, cols]) => [
    biome,
    cols.map((base) =>
      Uint32Array.from([0, 1, 2, 3], (h) => {
        const shade = 0.85 + h * 0.1;
        return packRgb(
          Math.min(255, Math.round(base[0] * shade)),
          Math.min(255, Math.round(base[1] * shade)),
          Math.min(255, Math.round(base[2] * shade)),
        );
      }),
    ),
  ]),
);

const COL_BG = packRgb(20, 16, 14);
const COL_LABEL = packRgb(230, 224, 208);
const COL_TREE = packRgb(26, 54, 24);
const COL_HOUSE = packRgb(224, 188, 96);
const COL_SHRINE = packRgb(120, 224, 255);
const COL_ALLY = packRgb(80, 220, 120);
const COL_ENEMY = packRgb(230, 72, 72);

async function loadGenerators() {
  const server = await createServer({
    root: ROOT,
    configFile: false,
    server: { middlewareMode: true, ws: false, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
  });
  try {
    await server.ssrLoadModule('/src/sim/super-uniques.ts');
    const [{ generateSkirmishMap }, { generateExpeditionMap }, { loadDoc }, { ObjectKind }] = await Promise.all([
      server.ssrLoadModule('/src/skirmish-generator.ts'),
      server.ssrLoadModule('/src/map-generator.ts'),
      server.ssrLoadModule('/src/mapdoc.ts'),
      server.ssrLoadModule('/src/map.ts'),
    ]);
    return { generateSkirmishMap, generateExpeditionMap, loadDoc, ObjectKind, close: () => server.close() };
  } catch (err) {
    await server.close();
    throw err;
  }
}

function stampBlock32(rgba32, sheetW, x, y, tilePx, color) {
  for (let py = 0; py < tilePx; py++) {
    const row = (y + py) * sheetW + x;
    for (let px = 0; px < tilePx; px++) rgba32[row + px] = color;
  }
}

function renderCell(rgba32, sheetW, sheetH, cellX, cellY, tilePx, doc, loaded, biome, seed, ObjectKind) {
  const { map } = loaded;
  const pal = PACKED_PALETTES[biome] ?? PACKED_PALETTES.forest;

  drawText(rgba32, sheetW, sheetH, cellX, cellY - 14, `${biome} S=${seed}`, COL_LABEL, 2);

  for (let ty = 0; ty < map.h; ty++) {
    const rowBase = ty * map.w;
    const outY = cellY + ty * tilePx;
    for (let tx = 0; tx < map.w; tx++) {
      const idx = rowBase + tx;
      const t = map.terrain[idx] ?? 0;
      const h = Math.min(3, map.height[idx] ?? 1);
      const color = (pal[t] ?? pal[0])[h];
      stampBlock32(rgba32, sheetW, cellX + tx * tilePx, outY, tilePx, color);
    }
  }

  for (const obj of map.objects) {
    if (obj.x < 0 || obj.y < 0 || obj.x >= map.w || obj.y >= map.h) continue;
    if (obj.kind === ObjectKind.Tree) {
      stampBlock32(rgba32, sheetW, cellX + obj.x * tilePx, cellY + obj.y * tilePx, tilePx, COL_TREE);
    } else if (obj.kind === ObjectKind.House) {
      stampBlock32(rgba32, sheetW, cellX + obj.x * tilePx, cellY + obj.y * tilePx, tilePx, COL_HOUSE);
    }
  }
  for (const sh of doc.shrines ?? []) {
    if (sh.x >= 0 && sh.y >= 0 && sh.x < map.w && sh.y < map.h) {
      stampBlock32(rgba32, sheetW, cellX + sh.x * tilePx, cellY + sh.y * tilePx, tilePx, COL_SHRINE);
    }
  }
  for (const u of doc.units ?? []) {
    if (u.x >= 0 && u.y >= 0 && u.x < map.w && u.y < map.h) {
      stampBlock32(
        rgba32,
        sheetW,
        cellX + u.x * tilePx,
        cellY + u.y * tilePx,
        tilePx,
        u.team === 0 ? COL_ALLY : COL_ENEMY,
      );
    }
  }
}

async function main() {
  const t0 = performance.now();
  await mkdir(OUT_DIR, { recursive: true });
  const { generateSkirmishMap, generateExpeditionMap, loadDoc, ObjectKind, close } = await loadGenerators();
  try {
    const tilePx = 3;
    const mapPx = 64 * tilePx; // 192x192 per seed
    const pad = 16;
    const headerH = 22;
    const cols = Math.min(2, seeds.length);
    const rows = Math.ceil(seeds.length / cols);
    const sheetW = pad + cols * (mapPx + pad);
    const sheetH = pad + rows * (mapPx + headerH + pad);

    const rgba = Buffer.allocUnsafe(sheetW * sheetH * 4);
    const rgba32 = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.byteLength / 4);
    const rawScratch = Buffer.allocUnsafe((sheetW * 4 + 1) * sheetH);

    const summary = [];
    const writeTasks = [];

    for (const mode of modes) {
      for (const biome of BIOMES) {
        rgba32.fill(COL_BG);
        const hashes = [];
        for (let idx = 0; idx < seeds.length; idx++) {
          const seed = seeds[idx];
          const doc =
            mode === 'expedition'
              ? generateExpeditionMap({ seed, biome, size: 64 })
              : generateSkirmishMap({ seed, biome, players, size: 64 });
          const loaded = loadDoc(doc);
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const cellX = pad + col * (mapPx + pad);
          const cellY = pad + headerH + row * (mapPx + headerH + pad);
          renderCell(rgba32, sheetW, sheetH, cellX, cellY, tilePx, doc, loaded, biome, seed, ObjectKind);
          hashes.push(createHash('sha256').update(loaded.map.terrain).digest('hex').slice(0, 8));
        }

        const png = encodePng(sheetW, sheetH, rgba, rawScratch);
        const outFile = path.join(OUT_DIR, `${biome}-${mode}.png`);
        writeTasks.push(writeFile(outFile, png));
        summary.push({
          mode,
          biome,
          file: path.relative(ROOT, outFile).replaceAll('\\', '/'),
          bytes: png.length,
          hashes,
        });
      }
    }

    await Promise.all(writeTasks);
    const elapsedMs = Math.round(performance.now() - t0);
    console.log(JSON.stringify({ mode: modeArg, seeds, players, elapsedMs, sheets: summary }, null, 2));
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
