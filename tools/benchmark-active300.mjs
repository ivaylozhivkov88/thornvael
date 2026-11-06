// Opt-in diagnostic; deliberately absent from package scripts and CI.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus, totalmem, platform, release, arch, loadavg } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { rolldown } from 'rolldown';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scratch = path.join(root, '.planning/tooling/active300-baseline');
const evidence = path.join(root, '.planning/evidence/active300-baseline-2026-11-04');
const args = process.argv.slice(2);
const check = args.includes('--check');
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const names = ['movement', 'combat', 'spells', 'ai'];
const selected = option('--trace', 'movement');
if ((!check && !args.includes('--run')) || !names.includes(selected)) {
  throw new Error('Use --check (untimed all traces), or --run --trace movement|combat|spells|ai after GO.');
}
const seed = 20261104, mapSeed = 7, hpMul = 200;
const measuredCount = check ? 40 : 250;
const warmupCount = check ? 0 : 40;
const sha = (data) => createHash('sha256').update(data).digest('hex');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trimEnd();
const quantiles = (values) => {
  const a = [...values].sort((x, y) => x - y);
  return { count: a.length, meanMs: a.reduce((s, n) => s + n, 0) / a.length,
    p95Ms: a[Math.ceil(a.length * .95) - 1], p99Ms: a[Math.ceil(a.length * .99) - 1],
    worstMs: a.at(-1), ticksAtLeast1ms: a.filter((v) => v >= 1).length };
};

await mkdir(scratch, { recursive: true });
await mkdir(evidence, { recursive: true });
const exports = { sim: ['Sim', 'FP', 'replay'], bot: ['battleScenario', 'placeScenario', 'Bot', 'MonsterAi'],
  combat: ['Kind'], data: ['installData'], spelldata: ['SPELLS'], path: ['lineClear'] };
const virtual = Object.entries(exports).map(([file, symbols]) =>
  `export { ${symbols.join(',')} } from ${JSON.stringify(path.join(root, `game/src/sim/${file}.ts`).replaceAll('\\', '/'))};`).join('\n') +
  `\nexport {generateMap, isBlockedAt} from ${JSON.stringify(path.join(root, 'game/src/map.ts').replaceAll('\\', '/'))};`;
const sourceFiles = new Map();
const bundle = await rolldown({ input: 'active300:entry', platform: 'node',
  plugins: [{ name: 'active300-entry', resolveId(id) { if (id === 'active300:entry') return '\0active300'; },
    load(id) { if (id === '\0active300') return virtual; },
    transform(code, id) { if (!id.startsWith('\0')) sourceFiles.set(path.relative(root, id).replaceAll('\\', '/'), sha(code)); } }] });
const bundleFile = path.join(scratch, 'sim.mjs');
await bundle.write({ file: bundleFile, format: 'es', sourcemap: false });
await bundle.close();
if ([...sourceFiles.keys()].some((p) => /pixi|renderer|node_modules/.test(p))) throw new Error('Non-headless dependency in bundle');
const engine = await import(pathToFileURL(bundleFile).href);
const { Sim, FP, replay, generateMap, battleScenario, placeScenario, Bot, MonsterAi, Kind, SPELLS, isBlockedAt } = engine;
const data = {};
for (const name of ['items', 'spells']) {
  const bytes = await readFile(path.join(root, `game/public/data/${name}.json`));
  sourceFiles.set(`game/public/data/${name}.json`, sha(bytes));
  data[name] = JSON.parse(bytes);
}
engine.installData(data);
const ids = Array.from({ length: 300 }, (_, i) => i);
const groups = Array.from({ length: 20 }, (_, g) => ids.slice(g * 15, g * 15 + 15));
const state = (sim) => {
  let active = 0, alive = 0, moving = 0, engaged = 0, hp = 0, mana = 0, projectiles = 0, spellProjectiles = 0, statuses = 0;
  for (let i = 0; i < sim.count; i++) {
    if (sim.alive(i)) { alive++; if (!sim.hidden[i]) active++; }
    moving += Number(sim.moving[i] !== 0);
    engaged += Number(sim.cb.tgt[i] >= 0);
    hp += sim.cb.hp[i]; mana += sim.cb.mana[i]; statuses += Number(sim.cb.stMask[i] !== 0);
  }
  for (let p = 0; p < sim.cb.pAlive.length; p++) if (sim.cb.pAlive[p]) {
    projectiles++; spellProjectiles += Number(sim.cb.pS[p] > 0);
  }
  return { active, alive, moving, engaged, hp, mana, projectiles, spellProjectiles, statuses };
};
function fresh(name) {
  const map = generateMap(mapSeed);
  const sc = battleScenario(map);
  // Reuse the scenario's 300 unique valid tiles. Interleave opposing teams so
  // combat starts promptly rather than measuring only a long approach march.
  if (name === 'movement') { sc.teams.fill(0); sc.kinds.fill(Kind.Warrior); }
  else {
    sc.teams = ids.map((i) => i % 2);
    sc.kinds = ids.map((i) => name === 'spells' && i % 4 === 0 ? Kind.Mage : i % 3 === 0 ? Kind.Archer : Kind.Warrior);
  }
  const sim = new Sim(map, seed, sc.teams, { combat: true, hpMul, kinds: sc.kinds });
  placeScenario(sim, sc); sim.settle();
  const tiles = sc.tiles.map(([x, y]) => y * map.w + x);
  if (new Set(tiles).size !== 300 || sc.tiles.some(([x, y]) => isBlockedAt(map, x, y))) throw new Error('Invalid placement');
  const packs = Array.from({ length: 10 }, (_, p) => {
    const members = ids.filter((i) => i % 2 === 1).slice(p * 15, p * 15 + 15);
    return { ids: members, x: sim.x[members[0]] / FP, y: sim.y[members[0]] / FP, hunting: false, calm: 0 };
  });
  const ai = name === 'movement' ? new Bot(0, 15, seed + 1) : name === 'ai' ? new MonsterAi(packs) : null;
  return { sim, ai, sc };
}
function commands(world, name) {
  const { sim, sc } = world;
  // Same published frame ordering: AI commands, then queued player commands;
  // Sim.step dispatches all commands internally, including their pathfinding.
  const out = world.ai ? world.ai.commands(sim) : [];
  const aiCommands = out.length;
  const pending = [];
  if (name === 'movement' && sim.tick % 50 === 0) {
    for (let g = 0; g < groups.length; g++) {
      const [x, y] = sc.tiles[(g * 15 + 150 + Math.floor(sim.tick / 50) * 30) % 300];
      pending.push({ type: 'move', ids: groups[g], x: x + .5, y: y + .5 });
    }
  } else if (sim.tick === 0) {
    pending.push({ type: 'order', order: 'swarm', ids });
    if (name === 'spells') pending.push({ type: 'autocast', ids: ids.filter((i) => sc.kinds[i] === Kind.Mage), spell: SPELLS.findIndex((s) => s.name === 'Frost Bolt') });
  }
  out.push(...pending.splice(0));
  return { out, aiCommands };
}
function trace(name, ticks, timed) {
  const world = fresh(name), { sim } = world;
  const initialHash = sim.hash();
  const rows = [], faults = [];
  const totals = { commands: 0, aiCommands: 0, movedUnitTicks: 0, damage: 0, manaSpent: 0,
    projectileTicks: 0, spellProjectileTicks: 0, statusUnitTicks: 0, createdPaths: 0, bentPathObservations: 0 };
  let snap, snapHash;
  for (let n = 0; n < ticks; n++) {
    const before = state(sim), x = sim.x.slice(), y = sim.y.slice();
    const beforePaths = sim.snapshot().nextPath;
    let prepared, commandMs = null, stepMs = null;
    if (timed) {
      const c0 = process.hrtime.bigint(); prepared = commands(world, name);
      commandMs = Number(process.hrtime.bigint() - c0) / 1e6;
      const t0 = process.hrtime.bigint();
      sim.step(prepared.out);
      stepMs = Number(process.hrtime.bigint() - t0) / 1e6;
    } else { prepared = commands(world, name); sim.step(prepared.out); }
    const after = state(sim), s = sim.snapshot();
    const moved = ids.filter((i) => x[i] !== sim.x[i] || y[i] !== sim.y[i]).length;
    const createdPaths = s.nextPath - beforePaths;
    const bentPaths = s.paths.filter(([, points]) => points.length > 4).length;
    const damage = before.hp - after.hp, manaSpent = Math.max(0, before.mana - after.mana);
    if (before.active !== 300 || after.active !== 300 || before.alive !== 300 || after.alive !== 300 || sim.count !== 300) faults.push(`active/alive count at tick ${sim.tick}`);
    totals.commands += prepared.out.length; totals.aiCommands += prepared.aiCommands;
    totals.movedUnitTicks += moved; totals.damage += damage; totals.manaSpent += manaSpent;
    totals.projectileTicks += after.projectiles; totals.spellProjectileTicks += after.spellProjectiles;
    totals.statusUnitTicks += after.statuses; totals.createdPaths += createdPaths; totals.bentPathObservations += bentPaths;
    rows.push({ tick: sim.tick, stepMs, commandMs, frameComputeMs: timed ? stepMs + commandMs : null,
      before, after, moved, damage, manaSpent, commands: prepared.out, aiCommands: prepared.aiCommands, createdPaths, bentPaths });
    if (n === Math.floor(ticks / 2)) { snap = s; snapHash = sim.hash(); }
  }
  const finalHash = sim.hash();
  const r = fresh(name).sim; replay(r, sim.log, sim.tick);
  const replayHash = r.hash();
  const restored = fresh(name).sim; restored.restore(snap);
  const restoreHash = restored.hash();
  // replay() starts its command clock at 1; continue an existing snapshot using
  // absolute logged ticks instead of feeding it that fresh-world helper.
  for (let tick = snap.tick + 1; tick <= sim.tick; tick++) {
    restored.step(sim.log.filter((c) => c.tick === tick).map((c) => c.cmd));
  }
  const continuationHash = restored.hash();
  if (replayHash !== finalHash || restoreHash !== snapHash || continuationHash !== finalHash) faults.push('replay/restore hash mismatch');
  if (!totals.movedUnitTicks) faults.push('no real movement');
  if (name === 'movement' && (!totals.createdPaths || !totals.bentPathObservations)) faults.push('no routed path evidence');
  if (name !== 'movement' && totals.damage <= 0) faults.push('no real damage');
  if (name === 'spells' && (!totals.manaSpent || !totals.spellProjectileTicks || !totals.statusUnitTicks)) faults.push('spell activity missing');
  if (name === 'ai' && !totals.aiCommands) faults.push('no monster AI commands');
  const step = timed ? quantiles(rows.map((v) => v.stepMs)) : null;
  return { name, ticks, initialHash, finalHash, replayHash, snapHash, restoreHash, continuationHash,
    finalRng: sim.rng.state, totals, faults, step,
    commandGeneration: timed ? quantiles(rows.map((v) => v.commandMs)) : null,
    combinedCompute: timed ? quantiles(rows.map((v) => v.frameComputeMs)) : null,
    status: faults.length ? 'VALIDITY_FAIL' : !timed ? 'FUNCTIONAL_PASS_ONLY' : step.ticksAtLeast1ms ? 'PERFORMANCE_FAIL' : 'DESKTOP_TRACE_PASS', rows };
}
const startedAt = new Date().toISOString();
const trackedDiff = git('diff', '--binary', 'HEAD', '--', '.');
const sourceIdentity = [...sourceFiles].sort(([a], [b]) => a.localeCompare(b));
const report = { mode: check ? 'FUNCTIONAL_ONLY_NO_TIMINGS' : 'TIMED_DESKTOP_DIAGNOSTIC', startedAt,
  seed, mapSeed, hpMul, trials: 1, warmupCount, measuredCount,
  methodology: { active: 'hp > 0 and hidden == 0; not a claim that all 300 move/attack every tick',
    timer: 'process.hrtime.bigint monotonic nanoseconds, converted to milliseconds',
    interval: 'entire actual sim.step(commands), including dispatch/pathfinding; command generation separately timed',
    excluded: 'setup, bundle, state scans, snapshots, hashes, counters, serialization, replay verification, rendering',
    overhead: 'outside-clock scans/snapshots allocate and can affect later GC/cache; GC pauses inside step retained',
    paths: 'nextPath delta = allocated shared/individual paths, not an A* call count; bent path observations are nonstraight retained paths',
    warmup: 'separate fresh world; no warmup rows included in measured statistics; measured world starts at tick 0',
    acceptance: 'any measured actual step >=1ms is PERFORMANCE_FAIL; no outliers removed; active/workload/hash faults fail validity',
    limitations: 'desktop headless only; no WebGL/render/audio. Not Android/iPhone V5 acceptance. Background CPU, thermal, GC and scheduler uncontrolled. Windows loadavg may be zero.',
    context: option('--context', 'Parent reports Blender idle after failed preflight; other Node/browser background processes may remain; not isolated.') },
  source: { commit: git('rev-parse', 'HEAD'), trackedWorkingDiffSha256: sha(trackedDiff),
    status: git('status', '--porcelain=v1'), sourceIdentity, sourceSha256: sha(JSON.stringify(sourceIdentity)),
    bundleSha256: sha(await readFile(bundleFile)), harnessSha256: sha(await readFile(fileURLToPath(import.meta.url))),
    rolldownVersion: JSON.parse(await readFile(new URL('../node_modules/rolldown/package.json', import.meta.url))).version },
  machine: { node: process.version, versions: process.versions, platform: platform(), release: release(), arch: arch(),
    cpuModel: cpus()[0]?.model, logicalCpuCount: cpus().length, totalMemoryBytes: totalmem(), loadavg: loadavg() },
  warmups: [], traces: [] };
try {
  for (const name of check ? names : [selected]) {
    if (warmupCount) report.warmups.push(trace(name, warmupCount, false));
    report.traces.push(trace(name, measuredCount, !check));
  }
  report.status = report.traces.some((t) => t.faults.length) ? 'VALIDITY_FAIL' : check ? 'FUNCTIONAL_PASS_ONLY' :
    report.traces.some((t) => t.step.ticksAtLeast1ms) ? 'PERFORMANCE_FAIL' : 'DESKTOP_TRACE_PASS';
} catch (error) { report.status = 'ERROR'; report.error = error.stack; }
report.finishedAt = new Date().toISOString();
report.source.endCommit = git('rev-parse', 'HEAD');
report.source.endTrackedWorkingDiffSha256 = sha(git('diff', '--binary', 'HEAD', '--', '.'));
const output = path.join(evidence, `${check ? 'functional' : selected}-${startedAt.replaceAll(':', '-')}.json`);
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, output, traces: report.traces.map(({ name, ticks, status, totals, faults, step }) => ({ name, ticks, status, totals, faults, step })) }, null, 2));
if (['ERROR', 'VALIDITY_FAIL', 'PERFORMANCE_FAIL'].includes(report.status)) process.exitCode = 1;
