#!/usr/bin/env node
/**
 * Performance profiler for 300 active units, spatial hash queries,
 * terrain chunk bake complexity, and texture atlas RGBA memory budget (WISHLIST F8).
 *
 * Usage:
 *   node tools/perf-profile-300.mjs [--ticks 250] [--warmup 40]
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const option = (key, fallback) => {
  const idx = args.indexOf(key);
  return idx >= 0 && idx + 1 < args.length ? Number.parseInt(args[idx + 1], 10) : fallback;
};

const WARMUP_TICKS = option('--warmup', 40);
const MEASURED_TICKS = option('--ticks', 250);
const SEED = 20261104;
const MAP_SEED = 7;
const HP_MUL = 200;

function quantiles(values) {
  const a = [...values].sort((x, y) => x - y);
  const sum = a.reduce((s, v) => s + v, 0);
  return {
    count: a.length,
    meanMs: Number((sum / a.length).toFixed(4)),
    p95Ms: Number(a[Math.ceil(a.length * 0.95) - 1].toFixed(4)),
    p99Ms: Number(a[Math.ceil(a.length * 0.99) - 1].toFixed(4)),
    worstMs: Number(a.at(-1).toFixed(4)),
    ticksAtLeast1ms: a.filter((v) => v >= 1.0).length,
  };
}

async function loadEngine() {
  const server = await createServer({
    root: ROOT,
    configFile: false,
    server: { middlewareMode: true, ws: false, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
  });
  await server.ssrLoadModule('/src/sim/super-uniques.ts');
  const [simMod, botMod, combatMod, dataMod, spellMod, mapMod, skirmishMod, mapdocMod] = await Promise.all([
    server.ssrLoadModule('/src/sim/sim.ts'),
    server.ssrLoadModule('/src/sim/bot.ts'),
    server.ssrLoadModule('/src/sim/combat.ts'),
    server.ssrLoadModule('/src/sim/data.ts'),
    server.ssrLoadModule('/src/sim/spelldata.ts'),
    server.ssrLoadModule('/src/map.ts'),
    server.ssrLoadModule('/src/skirmish-generator.ts'),
    server.ssrLoadModule('/src/mapdoc.ts'),
  ]);
  const data = {};
  for (const name of ['items', 'spells']) {
    data[name] = JSON.parse(await readFile(path.join(ROOT, `public/data/${name}.json`), 'utf8'));
  }
  dataMod.installData(data);
  return {
    ...simMod,
    ...botMod,
    ...combatMod,
    ...spellMod,
    ...mapMod,
    ...skirmishMod,
    ...mapdocMod,
    close: () => server.close(),
  };
}

function makeWorld(engine, traceName) {
  const { Sim, FP, generateMap, battleScenario, placeScenario, Bot, MonsterAi, Kind } = engine;
  const ids = Array.from({ length: 300 }, (_, i) => i);
  const map = generateMap(MAP_SEED);
  const sc = battleScenario(map);
  if (traceName === 'movement') {
    sc.teams.fill(0);
    sc.kinds.fill(Kind.Warrior);
  } else {
    sc.teams = ids.map((i) => i % 2);
    sc.kinds = ids.map((i) => (traceName === 'spells' && i % 4 === 0 ? Kind.Mage : i % 3 === 0 ? Kind.Archer : Kind.Warrior));
  }
  const sim = new Sim(map, SEED, sc.teams, { combat: true, hpMul: HP_MUL, kinds: sc.kinds });
  placeScenario(sim, sc);
  sim.settle();
  const packs = Array.from({ length: 10 }, (_, p) => {
    const members = ids.filter((i) => i % 2 === 1).slice(p * 15, p * 15 + 15);
    return { ids: members, x: sim.x[members[0]] / FP, y: sim.y[members[0]] / FP, hunting: false, calm: 0 };
  });
  const ai = traceName === 'movement' ? new Bot(0, 15, SEED + 1) : traceName === 'ai' ? new MonsterAi(packs) : null;
  return { sim, ai, sc, ids };
}

function stepCommands(engine, world, traceName) {
  const { sim, sc, ids } = world;
  const groups = Array.from({ length: 20 }, (_, g) => ids.slice(g * 15, g * 15 + 15));
  const out = world.ai ? world.ai.commands(sim) : [];
  if (traceName === 'movement' && sim.tick % 50 === 0) {
    for (let g = 0; g < groups.length; g++) {
      const [x, y] = sc.tiles[(g * 15 + 150 + Math.floor(sim.tick / 50) * 30) % 300];
      out.push({ type: 'move', ids: groups[g], x: x + 0.5, y: y + 0.5 });
    }
  } else if (sim.tick === 0) {
    out.push({ type: 'order', order: 'swarm', ids });
    if (traceName === 'spells') {
      const frostIdx = engine.SPELLS.findIndex((s) => s.name === 'Frost Bolt');
      out.push({ type: 'autocast', ids: ids.filter((i) => sc.kinds[i] === engine.Kind.Mage), spell: frostIdx });
    }
  }
  return out;
}

function profileTrace(engine, traceName) {
  const warmWorld = makeWorld(engine, traceName);
  for (let i = 0; i < WARMUP_TICKS; i++) {
    warmWorld.sim.step(stepCommands(engine, warmWorld, traceName));
  }

  const world = makeWorld(engine, traceName);
  const stepMs = [];
  for (let i = 0; i < MEASURED_TICKS; i++) {
    const cmds = stepCommands(engine, world, traceName);
    const t0 = process.hrtime.bigint();
    world.sim.step(cmds);
    stepMs.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  return {
    trace: traceName,
    ticks: MEASURED_TICKS,
    ...quantiles(stepMs),
    withinTarget1ms: quantiles(stepMs).meanMs < 1.0,
  };
}

function profileSpatialHash(engine) {
  const { enemyNear, FP } = engine;
  const world = makeWorld(engine, 'combat');
  world.sim.step(stepCommands(engine, world, 'combat'));

  const rounds = 40;
  const benchRadius = (tiles) => {
    const range = tiles * FP;
    let hits = 0;
    const t0 = process.hrtime.bigint();
    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < 300; i++) {
        if (enemyNear(world.sim, i, range, 0, 0, 0) >= 0) hits++;
      }
    }
    const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
    const queries = rounds * 300;
    return {
      radiusTiles: tiles,
      queries,
      hits,
      totalMs: Number(totalMs.toFixed(3)),
      meanUsPerQuery: Number(((totalMs * 1000) / queries).toFixed(3)),
      per300UnitsMs: Number((totalMs / rounds).toFixed(4)),
    };
  };

  return {
    gridCells: world.sim.map.w * world.sim.map.h,
    unitCount: world.sim.count,
    queries: [benchRadius(6), benchRadius(12)],
  };
}

async function profileTerrainChunks(engine) {
  const { generateSkirmishMap, loadDoc } = engine;
  const doc = generateSkirmishMap({ seed: MAP_SEED, biome: 'forest', players: 2, size: 64 });
  const loaded = loadDoc(doc);
  const { map } = loaded;
  const chunkTiles = 16;
  const chunksX = Math.ceil(map.w / chunkTiles);
  const chunksY = Math.ceil(map.h / chunkTiles);
  const totalChunks = chunksX * chunksY;
  const chunkPx = chunkTiles * 32; // 512x512
  const chunkRgbaBytes = chunkPx * chunkPx * 4; // 1 MiB

  // Benchmark deterministic map generation + RLE decode + light/blocked bake
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 10; i++) {
    loadDoc(generateSkirmishMap({ seed: MAP_SEED + i, biome: 'forest', players: 2, size: 64 }));
  }
  const genAndLoadMs = Number(process.hrtime.bigint() - t0) / 1e6 / 10;

  return {
    sampleMapSize: `${map.w}x${map.h}`,
    chunkSizeTiles: `${chunkTiles}x${chunkTiles}`,
    chunkSizePx: `${chunkPx}x${chunkPx}`,
    totalChunks64x64: totalChunks,
    chunkRgbaMiB: Number((chunkRgbaBytes / (1024 * 1024)).toFixed(2)),
    totalChunkCache64x64MiB: Number(((totalChunks * chunkRgbaBytes) / (1024 * 1024)).toFixed(2)),
    totalChunkCache192x192MiB: Number(((144 * chunkRgbaBytes) / (1024 * 1024)).toFixed(2)),
    genAndDecodeMeanMs: Number(genAndLoadMs.toFixed(3)),
    objectCount: map.objects.length,
    subCellBlendDrawsPerZoneTile: 16, // 4x4 sub-cell alpha grid in paintZones()
  };
}

async function profileAtlasMemory() {
  const dirs = [
    { kind: 'sprites', dir: path.join(ROOT, 'public/sprites') },
    { kind: 'objects', dir: path.join(ROOT, 'public/objects') },
  ];

  let totalColorPx = 0;
  let totalMaskPx = 0;
  let totalDiskBytes = 0;
  const entries = [];

  for (const { kind, dir } of dirs) {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
      const sheet = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
      const w = sheet.meta?.size?.w ?? (Array.isArray(sheet.size) ? sheet.size[0] : 0);
      const h = sheet.meta?.size?.h ?? (Array.isArray(sheet.size) ? sheet.size[1] : 0);
      const px = w * h;
      const colorRgba = px * 4;
      const imageFile = sheet.meta?.image ?? sheet.image;
      const maskFile = sheet.meta?.thornvael?.mask;

      let diskBytes = 0;
      if (imageFile) {
        diskBytes += (await stat(path.join(dir, imageFile))).size;
      }
      let maskRgba = 0;
      if (maskFile) {
        maskRgba = px * 4;
        totalMaskPx += px;
        diskBytes += (await stat(path.join(dir, maskFile))).size;
      }

      totalColorPx += px;
      totalDiskBytes += diskBytes;
      entries.push({
        id: `${kind}/${file.replace(/\.json$/, '')}`,
        dimensions: `${w}x${h}`,
        frames: Object.keys(sheet.frames ?? {}).length,
        colorRgbaMB: Number((colorRgba / (1024 * 1024)).toFixed(2)),
        maskRgbaMB: Number((maskRgba / (1024 * 1024)).toFixed(2)),
        totalRgbaMB: Number(((colorRgba + maskRgba) / (1024 * 1024)).toFixed(2)),
        diskKB: Number((diskBytes / 1024).toFixed(1)),
      });
    }
  }

  entries.sort((a, b) => b.totalRgbaMB - a.totalRgbaMB);
  const colorBytes = totalColorPx * 4;
  const maskBytes = totalMaskPx * 4;
  const totalBytes = colorBytes + maskBytes;

  return {
    atlasCount: entries.length,
    totalColorPixels: totalColorPx,
    totalMaskPixels: totalMaskPx,
    colorRgbaMiB: Number((colorBytes / (1024 * 1024)).toFixed(2)),
    maskRgbaMiB: Number((maskBytes / (1024 * 1024)).toFixed(2)),
    totalRgbaMiB: Number((totalBytes / (1024 * 1024)).toFixed(2)),
    totalDiskMiB: Number((totalDiskBytes / (1024 * 1024)).toFixed(2)),
    top10ByRgba: entries.slice(0, 10),
  };
}

async function main() {
  const engine = await loadEngine();
  try {
    const traces = ['movement', 'combat', 'spells', 'ai'].map((t) => profileTrace(engine, t));
    const spatialHash = profileSpatialHash(engine);
    const terrainChunks = await profileTerrainChunks(engine);
    const atlasMemory = await profileAtlasMemory();

    console.log(JSON.stringify({
      unitCount: 300,
      targetTickMs: 1.0,
      traces,
      spatialHash,
      terrainChunks,
      atlasMemory,
    }, null, 2));
  } finally {
    await engine.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
