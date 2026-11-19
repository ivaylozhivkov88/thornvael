#!/usr/bin/env node
/**
 * Headless biome seed contact-sheet generator (WISHLIST H4).
 *
 * Generates deterministic PNG contact sheets for all 7 biomes into
 * `tools/.canva-sheets/seed-gallery/` using pure Node (rolldown + zlib PNG).
 *
 * Usage:
 *   node tools/seed-gallery.mjs [--seeds 7,42,101,777] [--mode skirmish|expedition] [--players 2]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
const mode = option('--mode', 'skirmish') === 'expedition' ? 'expedition' : 'skirmish';
const players = Math.min(4, Math.max(2, Number.parseInt(option('--players', '2'), 10) || 2));

// Pure-Node RGBA8 PNG encoder
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
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
  const tag = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tag, data])), 0);
  return Buffer.concat([len, tag, data, crcBuf]);
}
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 6 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Tiny 3x5 bitmap font for seed labels
const GLYPHS = {
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7], '3': [7, 1, 7, 1, 7],
  '4': [5, 5, 7, 1, 1], '5': [7, 4, 7, 1, 7], '6': [7, 4, 7, 5, 7], '7': [7, 1, 1, 2, 2],
  '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 7], '-': [0, 0, 7, 0, 0], '=': [0, 7, 0, 7, 0],
  ' ': [0, 0, 0, 0, 0], 'A': [2, 5, 7, 5, 5], 'B': [6, 5, 6, 5, 6], 'C': [7, 4, 4, 4, 7],
  'D': [6, 5, 5, 5, 6], 'E': [7, 4, 6, 4, 7], 'F': [7, 4, 6, 4, 4], 'G': [7, 4, 5, 5, 7],
  'H': [5, 5, 7, 5, 5], 'I': [7, 2, 2, 2, 7], 'K': [5, 5, 6, 5, 5], 'L': [4, 4, 4, 4, 7],
  'M': [5, 7, 7, 5, 5], 'N': [5, 7, 7, 7, 5], 'O': [7, 5, 5, 5, 7], 'P': [7, 5, 7, 4, 4],
  'R': [7, 5, 6, 5, 5], 'S': [7, 4, 7, 1, 7], 'T': [7, 2, 2, 2, 2], 'U': [5, 5, 5, 5, 7],
  'V': [5, 5, 5, 5, 2], 'W': [5, 5, 7, 7, 5], 'X': [5, 5, 2, 5, 5], 'Y': [5, 5, 2, 2, 2],
};

function drawText(buf, bw, x0, y0, text, rgb, scale = 2) {
  const s = text.toUpperCase();
  let cx = x0;
  for (const ch of s) {
    const g = GLYPHS[ch];
    if (g) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if ((g[row] >> (2 - col)) & 1) {
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                const px = cx + col * scale + sx;
                const py = y0 + row * scale + sy;
                if (px >= 0 && px < bw) {
                  const i = (py * bw + px) * 4;
                  if (i >= 0 && i + 3 < buf.length) {
                    buf[i] = rgb[0];
                    buf[i + 1] = rgb[1];
                    buf[i + 2] = rgb[2];
                    buf[i + 3] = 255;
                  }
                }
              }
            }
          }
        }
      }
    }
    cx += 4 * scale;
  }
}

// Biome-aware terrain palette (Grass, Dirt, Water, Rock, Marsh)
const PALETTES = {
  forest:    [[64, 112, 48], [116, 86, 56], [42, 92, 140], [98, 98, 102], [58, 84, 52]],
  marsh:     [[62, 96, 54],  [98, 82, 58],  [38, 86, 102], [86, 90, 88],  [48, 72, 46]],
  desert:    [[168, 146, 84],[198, 166, 106],[48, 112, 148],[132, 108, 82],[138, 116, 76]],
  crypt:     [[76, 82, 74],  [92, 88, 96],  [44, 62, 88],  [66, 66, 74],  [60, 56, 72]],
  highlands: [[86, 118, 66], [136, 118, 88],[48, 98, 138], [122, 126, 132],[74, 92, 78]],
  volcanic:  [[72, 58, 52],  [54, 44, 42],  [196, 74, 24], [64, 58, 62],  [96, 52, 36]],
  oasis:     [[74, 134, 58], [186, 158, 98],[44, 124, 162],[126, 106, 84],[64, 104, 66]],
};

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

function renderCell(rgba, sheetW, cellX, cellY, tilePx, doc, loaded, biome, seed, ObjectKind) {
  const { map } = loaded;
  const pal = PALETTES[biome] ?? PALETTES.forest;

  // Header label above map cell
  drawText(rgba, sheetW, cellX, cellY - 14, `${biome} S=${seed}`, [230, 224, 208], 2);

  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const idx = ty * map.w + tx;
      const t = map.terrain[idx] ?? 0;
      const h = map.height[idx] ?? 1;
      const base = pal[t] ?? pal[0];
      const shade = 0.85 + h * 0.1;
      const r = Math.min(255, Math.round(base[0] * shade));
      const g = Math.min(255, Math.round(base[1] * shade));
      const b = Math.min(255, Math.round(base[2] * shade));

      for (let py = 0; py < tilePx; py++) {
        for (let px = 0; px < tilePx; px++) {
          const outI = ((cellY + ty * tilePx + py) * sheetW + (cellX + tx * tilePx + px)) * 4;
          rgba[outI] = r;
          rgba[outI + 1] = g;
          rgba[outI + 2] = b;
          rgba[outI + 3] = 255;
        }
      }
    }
  }

  const plotDot = (tx, ty, rgb) => {
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return;
    for (let py = 0; py < tilePx; py++) {
      for (let px = 0; px < tilePx; px++) {
        const outI = ((cellY + ty * tilePx + py) * sheetW + (cellX + tx * tilePx + px)) * 4;
        rgba[outI] = rgb[0];
        rgba[outI + 1] = rgb[1];
        rgba[outI + 2] = rgb[2];
        rgba[outI + 3] = 255;
      }
    }
  };

  for (const obj of map.objects) {
    if (obj.kind === ObjectKind.Tree) plotDot(obj.x, obj.y, [26, 54, 24]);
    else if (obj.kind === ObjectKind.House) plotDot(obj.x, obj.y, [224, 188, 96]);
  }
  for (const sh of doc.shrines ?? []) plotDot(sh.x, sh.y, [120, 224, 255]);
  for (const u of doc.units ?? []) {
    const rgb = u.team === 0 ? [80, 220, 120] : [230, 72, 72];
    plotDot(u.x, u.y, rgb);
  }
}

async function main() {
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

    const summary = [];
    for (const biome of BIOMES) {
      const rgba = Buffer.alloc(sheetW * sheetH * 4);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 20; rgba[i + 1] = 16; rgba[i + 2] = 14; rgba[i + 3] = 255;
      }

      const hashes = [];
      for (let idx = 0; idx < seeds.length; idx++) {
        const seed = seeds[idx];
        const doc = mode === 'expedition'
          ? generateExpeditionMap({ seed, biome, size: 64 })
          : generateSkirmishMap({ seed, biome, players, size: 64 });
        const loaded = loadDoc(doc);
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cellX = pad + col * (mapPx + pad);
        const cellY = pad + headerH + row * (mapPx + headerH + pad);
        renderCell(rgba, sheetW, cellX, cellY, tilePx, doc, loaded, biome, seed, ObjectKind);
        hashes.push(createHash('sha256').update(loaded.map.terrain).digest('hex').slice(0, 8));
      }

      const png = encodePng(sheetW, sheetH, rgba);
      const outFile = path.join(OUT_DIR, `${biome}-${mode}.png`);
      await writeFile(outFile, png);
      summary.push({ biome, file: path.relative(ROOT, outFile).replaceAll('\\', '/'), bytes: png.length, hashes });
    }

    console.log(JSON.stringify({ mode, seeds, players, sheets: summary }, null, 2));
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
