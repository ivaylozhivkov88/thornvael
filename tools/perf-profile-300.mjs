#!/usr/bin/env node
/**
 * Performance profiler for 300 active units, src/sim/ai/ directors, spatial hash queries,
 * terrain chunk bake complexity, and texture atlas RGBA memory budget (WISHLIST F8).
 *
 * Usage:
 *   node tools/perf-profile-300.mjs [--ticks 250] [--warmup 40]
 */
import { readdir, readFile, stat } from 'node:fs/promises';
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
  const [simMod, botMod, combatMod, dataMod, spellMod, mapMod, skirmishMod, mapdocMod, aiMod] = await Promise.all([
    server.ssrLoadModule('/src/sim/sim.ts'),
    server.ssrLoadModule('/src/sim/bot.ts'),
    server.ssrLoadModule('/src/sim/combat.ts'),
    server.ssrLoadModule('/src/sim/data.ts'),
    server.ssrLoadModule('/src/sim/spelldata.ts'),
    server.ssrLoadModule('/src/map.ts'),
    server.ssrLoadModule('/src/skirmish-generator.ts'),
    server.ssrLoadModule('/src/mapdoc.ts'),
    server.ssrLoadModule('/src/sim/ai/index.ts'),
  ]);
  const [items, spells] = await Promise.all([
    readFile(path.join(ROOT, 'public/data/items.json'), 'utf8').then(JSON.parse),
    readFile(path.join(ROOT, 'public/data/spells.json'), 'utf8').then(JSON.parse),
  ]);
  dataMod.installData({ items, spells });
  return {
    ...simMod,
    ...botMod,
    ...combatMod,
    ...spellMod,
    ...mapMod,
    ...skirmishMod,
    ...mapdocMod,
    ...aiMod,
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
    sc.kinds = ids.map((i) =>
      traceName === 'spells' && i % 4 === 0 ? Kind.Mage : i % 3 === 0 ? Kind.Archer : Kind.Warrior,
    );
  }
  const sim = new Sim(map, SEED, sc.teams, { combat: true, hpMul: HP_MUL, kinds: sc.kinds });
  placeScenario(sim, sc);
  sim.settle();
  const packs = Array.from({ length: 10 }, (_, p) => {
    const members = ids.filter((i) => i % 2 === 1).slice(p * 15, p * 15 + 15);
    return { ids: members, x: sim.x[members[0]] / FP, y: sim.y[members[0]] / FP, hunting: false, calm: 0 };
  });
  const ai = traceName === 'movement' ? new Bot(0, 15, SEED + 1) : traceName === 'ai' ? new MonsterAi(packs) : null;
  const groups = Array.from({ length: 20 }, (_, g) => ids.slice(g * 15, g * 15 + 15));
  const mageIds = ids.filter((i) => sc.kinds[i] === Kind.Mage);
  const frostIdx = engine.SPELLS.findIndex((s) => s.name === 'Frost Bolt');
  return { sim, ai, sc, ids, groups, mageIds, frostIdx };
}

function stepCommands(world, traceName) {
  const { sim, sc, ids, groups, mageIds, frostIdx } = world;
  const out = world.ai ? world.ai.commands(sim) : [];
  if (traceName === 'movement' && sim.tick % 50 === 0) {
    const stepShift = Math.floor(sim.tick / 50) * 30;
    for (let g = 0; g < groups.length; g++) {
      const [x, y] = sc.tiles[(g * 15 + 150 + stepShift) % 300];
      out.push({ type: 'move', ids: groups[g], x: x + 0.5, y: y + 0.5 });
    }
  } else if (sim.tick === 0) {
    out.push({ type: 'order', order: 'swarm', ids });
    if (traceName === 'spells' && frostIdx >= 0) {
      out.push({ type: 'autocast', ids: mageIds, spell: frostIdx });
    }
  }
  return out;
}

function profileTrace(engine, traceName) {
  const warmWorld = makeWorld(engine, traceName);
  for (let i = 0; i < WARMUP_TICKS; i++) {
    warmWorld.sim.step(stepCommands(warmWorld, traceName));
  }

  const world = makeWorld(engine, traceName);
  const stepMs = new Array(MEASURED_TICKS);
  for (let i = 0; i < MEASURED_TICKS; i++) {
    const cmds = stepCommands(world, traceName);
    const t0 = process.hrtime.bigint();
    world.sim.step(cmds);
    stepMs[i] = Number(process.hrtime.bigint() - t0) / 1e6;
  }
  const stats = quantiles(stepMs);
  return {
    trace: traceName,
    ticks: MEASURED_TICKS,
    ...stats,
    withinTarget1ms: stats.meanMs < 1.0,
  };
}

function measureLatency(name, unitCount, warmupFn, stepFn) {
  for (let i = 0; i < WARMUP_TICKS; i++) warmupFn(i);
  const times = new Array(MEASURED_TICKS);
  for (let i = 0; i < MEASURED_TICKS; i++) {
    const t0 = process.hrtime.bigint();
    stepFn(i);
    times[i] = Number(process.hrtime.bigint() - t0) / 1e6;
  }
  const stats = quantiles(times);
  return {
    module: name,
    unitCount,
    ticks: MEASURED_TICKS,
    ...stats,
    withinTarget1ms: stats.meanMs < 1.0,
  };
}

function profileSimAi(engine) {
  const { EliteDirector, BossPhaseController, CompanionController, WorldEventsDirector, SkirmishModeController, FP } =
    engine;

  // 1. EliteDirector: 75 packs x 4 members = 300 active elites + 10 loot critters
  const setupElite = () => {
    const dir = new EliteDirector(SEED);
    for (let p = 0; p < 75; p++) {
      const baseId = p * 4 + 1;
      const pack = dir.spawnPack(
        [
          { id: baseId, x: (8 + (p % 20)) * FP, y: (8 + Math.floor(p / 20) * 4) * FP, maxHp: 300 },
          { id: baseId + 1, x: (8 + (p % 20)) * FP + 128, y: (8 + Math.floor(p / 20) * 4) * FP, maxHp: 300 },
          { id: baseId + 2, x: (8 + (p % 20)) * FP, y: (8 + Math.floor(p / 20) * 4) * FP + 128, maxHp: 300 },
          { id: baseId + 3, x: (8 + (p % 20)) * FP + 128, y: (8 + Math.floor(p / 20) * 4) * FP + 128, maxHp: 300 },
        ],
        3,
      );
      dir.damageMember(pack.packId, baseId, 20);
    }
    for (let c = 0; c < 10; c++) dir.spawnLootCritter((12 + c * 3) * FP, 20 * FP, 2, 120);
    return dir;
  };
  const eliteWarm = setupElite();
  const eliteDir = setupElite();
  const eliteEvents = [];
  const eliteMetric = measureLatency(
    'elite_director_300',
    300,
    (t) => {
      eliteEvents.length = 0;
      eliteWarm.step(16 * FP + (t % 10) * 64, 16 * FP, eliteEvents);
    },
    (t) => {
      eliteEvents.length = 0;
      eliteDir.step(16 * FP + (t % 10) * 64, 16 * FP, eliteEvents);
    },
  );

  // 2. BossPhaseController: all 4 campaign bosses ticking across Phases 1->2->3 with active hazards & adds
  const setupBosses = () => {
    const bosses = ['morvessa', 'gorrathul', 'vesperion', 'ashkarath'].map(
      (id, idx) => new BossPhaseController(id, 2000, SEED + idx),
    );
    for (const b of bosses) b.damageBoss(800); // enter Phase 2
    return bosses;
  };
  const warmBosses = setupBosses();
  const liveBosses = setupBosses();
  const bossEvents = [];
  const bossMetric = measureLatency(
    'boss_phases_4',
    4,
    (t) => {
      bossEvents.length = 0;
      for (let i = 0; i < warmBosses.length; i++) {
        warmBosses[i].step(20 * FP + (t % 8) * 64, 20 * FP, bossEvents);
      }
    },
    (t) => {
      bossEvents.length = 0;
      if (t === 60) {
        for (let i = 0; i < liveBosses.length; i++) liveBosses[i].damageBoss(650, bossEvents); // enter Phase 3
      }
      for (let i = 0; i < liveBosses.length; i++) {
        liveBosses[i].step(20 * FP + (t % 8) * 64, 20 * FP, bossEvents);
      }
    },
  );

  // 3. CompanionController (3 party companions vs 300 active enemy views)
  const enemyViews300 = Array.from({ length: 300 }, (_, i) => ({
    id: i + 1,
    x: (6 + (i % 25) * 2) * FP,
    y: (6 + Math.floor(i / 25) * 2) * FP,
    alive: true,
  }));
  const party = [
    new CompanionController(1, 'warrior', 14 * FP, 14 * FP, 220, 5),
    new CompanionController(2, 'archer', 15 * FP, 14 * FP, 160, 5),
    new CompanionController(3, 'mage', 14 * FP, 15 * FP, 140, 5),
  ];
  party[1].setOrder('attack');
  party[2].setOrder('hold', 14 * FP, 15 * FP);
  const companionPartyMetric = measureLatency(
    'companion_party_3v300',
    300,
    (t) => {
      const hx = 14 * FP + (t % 4) * 64;
      for (let i = 0; i < party.length; i++) party[i].step(hx, 14 * FP, enemyViews300);
    },
    (t) => {
      const hx = 14 * FP + (t % 4) * 64;
      for (let i = 0; i < party.length; i++) party[i].step(hx, 14 * FP, enemyViews300);
    },
  );

  // 4. CompanionController at 300 active companion controllers vs 16 nearby targets
  const localEnemies16 = enemyViews300.slice(0, 16);
  const companions300 = Array.from({ length: 300 }, (_, i) => {
    const c = new CompanionController(
      i + 1,
      ['warrior', 'archer', 'mage'][i % 3],
      (10 + (i % 20)) * FP,
      14 * FP,
      180,
      3,
    );
    if (i % 3 === 1) c.setOrder('attack');
    else if (i % 3 === 2) c.setOrder('hold', (10 + (i % 20)) * FP, 14 * FP);
    return c;
  });
  const companion300Metric = measureLatency(
    'companion_controllers_300',
    300,
    (t) => {
      const hx = 14 * FP + (t % 4) * 32;
      for (let i = 0; i < companions300.length; i++) companions300[i].step(hx, 14 * FP, localEnemies16);
    },
    (t) => {
      const hx = 14 * FP + (t % 4) * 32;
      for (let i = 0; i < companions300.length; i++) companions300[i].step(hx, 14 * FP, localEnemies16);
    },
  );

  // 5. WorldEventsDirector + SkirmishModeController (300 active units across 4 control points)
  const setupWorldAndSkirmish = () => {
    const worldDir = new WorldEventsDirector(SEED);
    for (const [idx, kind] of ['haste', 'xp', 'mana', 'fortune', 'danger'].entries()) {
      const s = worldDir.addShrine(kind, (10 + idx * 8) * FP, 20 * FP);
      if (idx < 3) worldDir.activateShrine(s.id);
    }
    worldDir.startWaveDefense(5, 500, 12);
    worldDir.startEscort(4, 300);
    worldDir.startHunt('Grok-Champion', 999);
    const skirmish = new SkirmishModeController(
      'capture_shrines',
      [
        { x: 16 * FP, y: 16 * FP },
        { x: 48 * FP, y: 16 * FP },
        { x: 16 * FP, y: 48 * FP },
        { x: 48 * FP, y: 48 * FP },
      ],
      10000,
    );
    const presence = Array.from({ length: 300 }, (_, i) => ({
      team: i % 2,
      x: (16 + (i % 4 < 2 ? 0 : 32)) * FP,
      y: (16 + (i % 2 === 0 ? 0 : 32)) * FP,
      alive: true,
    }));
    return { worldDir, skirmish, presence };
  };
  const wsWarm = setupWorldAndSkirmish();
  const wsLive = setupWorldAndSkirmish();
  const worldSkirmishMetric = measureLatency(
    'world_events_skirmish_300',
    300,
    () => {
      wsWarm.worldDir.step(16 * FP, 16 * FP, true);
      wsWarm.skirmish.step(wsWarm.presence);
    },
    () => {
      wsLive.worldDir.step(16 * FP, 16 * FP, true);
      wsLive.skirmish.step(wsLive.presence);
    },
  );

  return [eliteMetric, bossMetric, companionPartyMetric, companion300Metric, worldSkirmishMetric];
}

function profileSpatialHash(engine) {
  const { enemyNear, FP } = engine;
  const world = makeWorld(engine, 'combat');
  world.sim.step(stepCommands(world, 'combat'));

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
    activeLruCapChunks: 24,
    activeLruCacheMiB: Number(((24 * chunkRgbaBytes) / (1024 * 1024)).toFixed(2)),
    genAndDecodeMeanMs: Number(genAndLoadMs.toFixed(3)),
    objectCount: map.objects.length,
    subCellBlendDrawsPerZoneTile: 16,
  };
}

async function profileAtlasMemory() {
  const dirs = [
    { kind: 'sprites', dir: path.join(ROOT, 'public/sprites') },
    { kind: 'objects', dir: path.join(ROOT, 'public/objects') },
  ];

  const fileTasks = [];
  for (const { kind, dir } of dirs) {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
      fileTasks.push(
        readFile(path.join(dir, file), 'utf8').then(async (raw) => {
          const sheet = JSON.parse(raw);
          const w = sheet.meta?.size?.w ?? (Array.isArray(sheet.size) ? sheet.size[0] : 0);
          const h = sheet.meta?.size?.h ?? (Array.isArray(sheet.size) ? sheet.size[1] : 0);
          const px = w * h;
          const colorRgba = px * 4;
          const imageFile = sheet.meta?.image ?? sheet.image;
          const maskFile = sheet.meta?.thornvael?.mask;

          const [imgStat, maskStat] = await Promise.all([
            imageFile ? stat(path.join(dir, imageFile)) : Promise.resolve(null),
            maskFile ? stat(path.join(dir, maskFile)) : Promise.resolve(null),
          ]);

          const maskPx = maskFile ? px : 0;
          const maskRgba = maskPx * 4;
          const diskBytes = (imgStat?.size ?? 0) + (maskStat?.size ?? 0);

          return {
            px,
            maskPx,
            diskBytes,
            entry: {
              id: `${kind}/${file.replace(/\.json$/, '')}`,
              dimensions: `${w}x${h}`,
              frames: Object.keys(sheet.frames ?? {}).length,
              colorRgbaMB: Number((colorRgba / (1024 * 1024)).toFixed(2)),
              maskRgbaMB: Number((maskRgba / (1024 * 1024)).toFixed(2)),
              totalRgbaMB: Number(((colorRgba + maskRgba) / (1024 * 1024)).toFixed(2)),
              diskKB: Number((diskBytes / 1024).toFixed(1)),
            },
          };
        }),
      );
    }
  }

  const resolved = await Promise.all(fileTasks);
  let totalColorPx = 0;
  let totalMaskPx = 0;
  let totalDiskBytes = 0;
  const entries = [];
  for (const r of resolved) {
    totalColorPx += r.px;
    totalMaskPx += r.maskPx;
    totalDiskBytes += r.diskBytes;
    entries.push(r.entry);
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
    const aiModules = profileSimAi(engine);
    const spatialHash = profileSpatialHash(engine);
    const [terrainChunks, atlasMemory] = await Promise.all([profileTerrainChunks(engine), profileAtlasMemory()]);

    console.log(
      JSON.stringify(
        {
          unitCount: 300,
          targetTickMs: 1.0,
          traces,
          aiModules,
          spatialHash,
          terrainChunks,
          atlasMemory,
        },
        null,
        2,
      ),
    );
  } finally {
    await engine.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
