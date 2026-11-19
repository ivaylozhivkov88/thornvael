// Generates deterministic PNG minimaps for all 7 skirmish biomes into public/wiki/minimaps/<biome>.png
// and registers them in assets.json with license "own" and source "tools/make-wiki-minimaps.mjs".
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => join(ROOT, ...a);

if (!process.env.VITEST && !globalThis.__thornvaelWikiTsHook) {
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

export function renderBiomeMinimapPng(biome, seed = 7) {
  const doc = generateSkirmishMap({ seed, biome, players: 2, size: 80 });
  const w = doc.w;
  const h = doc.h;
  const terrain = rleDecode(doc.terrain, w * h);
  const height = rleDecode(doc.height, w * h);
  const light = bakeLight(w, h, height);
  const pal = BIOME_PALETTE[biome] ?? BIOME_PALETTE.forest;

  const scale = 3;
  const outW = w * scale;
  const outH = h * scale;
  const rgba = Buffer.alloc(outW * outH * 4);

  const setTile = (tx, ty, rgb) => {
    for (let py = 0; py < scale; py++) {
      for (let px = 0; px < scale; px++) {
        const idx = ((ty * scale + py) * outW + tx * scale + px) * 4;
        rgba[idx] = rgb[0];
        rgba[idx + 1] = rgb[1];
        rgba[idx + 2] = rgb[2];
        rgba[idx + 3] = 255;
      }
    }
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const base = pal[terrain[i]] ?? pal[Terrain.Grass];
      const shade = 0.55 + (light[i] / 255) * 0.55;
      setTile(x, y, [
        Math.min(255, Math.round(base[0] * shade)),
        Math.min(255, Math.round(base[1] * shade)),
        Math.min(255, Math.round(base[2] * shade)),
      ]);
    }
  }

  for (const obj of doc.objects) {
    if (obj.kind === ObjectKind.Tree) {
      setTile(obj.x, obj.y, pal.tree);
    } else if (obj.kind === ObjectKind.House) {
      const color = obj.owner === 0 ? [120, 185, 255] : [228, 92, 78];
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (obj.x + dx < w && obj.y + dy < h) setTile(obj.x + dx, obj.y + dy, color);
        }
      }
    }
  }

  for (const sh of doc.shrines ?? []) {
    if (sh.x >= 0 && sh.y >= 0 && sh.x < w && sh.y < h) {
      setTile(sh.x, sh.y, [245, 212, 92]);
    }
  }

  // Thin bronze border
  for (let x = 0; x < outW; x++) {
    for (const y of [0, outH - 1]) {
      const idx = (y * outW + x) * 4;
      rgba[idx] = 138;
      rgba[idx + 1] = 107;
      rgba[idx + 2] = 58;
      rgba[idx + 3] = 255;
    }
  }
  for (let y = 0; y < outH; y++) {
    for (const x of [0, outW - 1]) {
      const idx = (y * outW + x) * 4;
      rgba[idx] = 138;
      rgba[idx + 1] = 107;
      rgba[idx + 2] = 58;
      rgba[idx + 3] = 255;
    }
  }

  return encodePngRgba(outW, outH, rgba);
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
  return { ...manifest, assets: [...byPath.values()] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = P('public', 'wiki', 'minimaps');
  mkdirSync(outDir, { recursive: true });
  for (const biome of BIOMES) {
    const png = renderBiomeMinimapPng(biome, 7);
    if (png.length >= 3 * 1024 * 1024) throw new Error(`Minimap ${biome}.png exceeds 3 MiB`);
    writeFileSync(join(outDir, `${biome}.png`), png);
  }
  const assetsPath = P('assets.json');
  const manifest = JSON.parse(readFileSync(assetsPath, 'utf8'));
  const updated = addMinimapAssetsEntries(manifest);
  writeFileSync(assetsPath, JSON.stringify(updated, null, 2) + '\n');
  console.log(`Generated ${BIOMES.length} wiki biome minimaps in public/wiki/minimaps/ and registered in assets.json`);
}
