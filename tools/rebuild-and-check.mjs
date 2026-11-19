#!/usr/bin/env node
/**
 * Single-command batch verification & inventory rebuild script (WISHLIST H1).
 *
 * Runs:
 *  1. `node tools/gen-inventory.mjs`
 *  2. Parallel validation batch (unless `--serial`):
 *     - `assets.json` provenance completeness & < 3 MiB binary size check
 *     - `node tools/check-repo.mjs`
 *     - `node tools/check-atlases.mjs`
 *     - `npx tsc --noEmit` & `npx tsc --noEmit -p tsconfig.sw.json`
 *     - Optional `--biome`: `npx --yes @biomejs/biome lint` & `check`
 *  3. `npx vitest run --maxWorkers=1`
 *  4. Optional `--smoke` / `--smoke-all`: `npm run build` + `npx playwright test -c playwright.smoke.config.ts`
 *
 * Flags:
 *  --smoke             Build dist/ and run Playwright smoke tests (Chromium)
 *  --smoke-all         Build dist/ and run Playwright smoke tests (Chromium + WebKit)
 *  --biome             Include Biome lint + QA format checks in validation batch
 *  --serial            Run validation batch sequentially instead of in parallel
 *  --strict-untracked  Fail if untracked binaries lack assets.json provenance
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAX_BINARY_BYTES = 3 * 1024 * 1024; // 3 MiB
const BINARY_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.m4a',
  '.mp3',
  '.ogg',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
]);
const ALLOWED_LICENSES = new Set(['own', 'CC0', 'OFL-1.1']);

const args = new Set(process.argv.slice(2));
const runSmokeAll = args.has('--smoke-all');
const runSmoke = runSmokeAll || args.has('--smoke');
const runBiome = args.has('--biome');
const serial = args.has('--serial');
const strictUntracked = args.has('--strict-untracked');

const isWin = process.platform === 'win32';
const results = [];

function runStepSync(label, cmd, cmdArgs, extraEnv) {
  const t0 = performance.now();
  console.log(`\n=== [${label}] ${cmd} ${cmdArgs.join(' ')} ===`);
  try {
    execFileSync(cmd, cmdArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: isWin && (cmd === 'npx' || cmd === 'npm'),
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    });
    const ms = Math.round(performance.now() - t0);
    results.push({ label, ok: true, ms });
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    results.push({ label, ok: false, ms, error: err.message });
    throw err;
  }
}

function runStepAsync(label, cmd, cmdArgs, extraEnv) {
  const t0 = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: ROOT,
      shell: isWin && (cmd === 'npx' || cmd === 'npm'),
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    child.stdout?.on('data', (d) => chunks.push(d));
    child.stderr?.on('data', (d) => chunks.push(d));
    child.on('error', (err) => {
      const ms = Math.round(performance.now() - t0);
      results.push({ label, ok: false, ms, error: err.message });
      reject(err);
    });
    child.on('close', (code) => {
      const ms = Math.round(performance.now() - t0);
      const output = Buffer.concat(chunks).toString('utf8').trim();
      console.log(`\n=== [${label}] (${ms} ms) ===`);
      if (output) console.log(output);
      if (code === 0) {
        results.push({ label, ok: true, ms });
        resolve();
      } else {
        const err = new Error(`${label} exited with code ${code}`);
        results.push({ label, ok: false, ms, error: err.message });
        reject(err);
      }
    });
  });
}

function checkProvenanceAndSizes() {
  const t0 = performance.now();
  const label = 'Provenance & <3 MiB Binary Check';

  const manifestPath = `${ROOT}/assets.json`;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const listed = new Map();
  const errors = [];
  const warnings = [];

  for (const entry of manifest.assets ?? []) {
    if (!ALLOWED_LICENSES.has(entry.license)) {
      errors.push(`assets.json: ${entry.path} has disallowed license "${entry.license}"`);
    }
    if (!entry.source) {
      errors.push(`assets.json: ${entry.path} is missing "source"`);
    }
    if (!existsSync(`${ROOT}/${entry.path}`)) {
      errors.push(`assets.json: ${entry.path} does not exist on disk`);
    }
    listed.set(entry.path, entry);
  }

  const tracked = new Set(
    execFileSync('git', ['ls-files', '-z', '--cached'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean),
  );
  const allFiles = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .filter((f) => existsSync(`${ROOT}/${f}`));

  let checkedBinaries = 0;
  let oversized = 0;

  for (const f of allFiles) {
    const ext = extname(f).toLowerCase();
    if (!BINARY_EXT.has(ext)) continue;
    checkedBinaries++;
    const size = statSync(`${ROOT}/${f}`).size;
    if (size >= MAX_BINARY_BYTES) {
      oversized++;
      errors.push(`${f}: size ${(size / (1024 * 1024)).toFixed(2)} MiB exceeds 3 MiB limit`);
    }
    if (!listed.has(f)) {
      const msg = `${f}: missing provenance entry in assets.json`;
      if (tracked.has(f) || strictUntracked) errors.push(msg);
      else warnings.push(msg);
    }
  }

  const ms = Math.round(performance.now() - t0);
  console.log(`\n=== [${label}] (${ms} ms) ===`);
  if (warnings.length) {
    console.warn(`Warnings (${warnings.length} untracked binaries without provenance):`);
    for (const w of warnings.slice(0, 10)) console.warn(`  - ${w}`);
    if (warnings.length > 10) console.warn(`  ... and ${warnings.length - 10} more`);
  }

  if (errors.length) {
    for (const e of errors) console.error(`ERROR: ${e}`);
    results.push({ label, ok: false, ms });
    throw new Error(`${label} failed with ${errors.length} error(s)`);
  }

  console.log(
    `Passed: ${checkedBinaries} binaries checked, ${oversized} oversized, ${listed.size} provenance entries.`,
  );
  results.push({ label, ok: true, ms });
}

async function main() {
  const totalStart = performance.now();
  try {
    runStepSync('Inventory', 'node', ['tools/gen-inventory.mjs']);
    checkProvenanceAndSizes();

    const batchSpecs = [
      { label: 'Repo Guard', cmd: 'node', args: ['tools/check-repo.mjs'] },
      { label: 'Atlas Contract', cmd: 'node', args: ['tools/check-atlases.mjs'] },
      { label: 'Typecheck (app)', cmd: 'npx', args: ['tsc', '--noEmit'] },
      { label: 'Typecheck (sw)', cmd: 'npx', args: ['tsc', '--noEmit', '-p', 'tsconfig.sw.json'] },
    ];
    if (runBiome) {
      batchSpecs.push({
        label: 'Biome Lint',
        cmd: 'npx',
        args: ['--yes', '@biomejs/biome', 'lint', '--reporter=summary'],
      });
      batchSpecs.push({
        label: 'Biome QA Check',
        cmd: 'npx',
        args: [
          '--yes',
          '@biomejs/biome',
          'check',
          'biome.json',
          'playwright.smoke.config.ts',
          'tests/biome-seeds-all.test.ts',
          'tests/pwa-smoke.spec.ts',
          'tools/rebuild-and-check.mjs',
          'tools/perf-profile-300.mjs',
          'tools/seed-gallery.mjs',
        ],
      });
    }

    if (serial) {
      for (const s of batchSpecs) runStepSync(s.label, s.cmd, s.args);
    } else {
      await Promise.all(batchSpecs.map((s) => runStepAsync(s.label, s.cmd, s.args)));
    }

    runStepSync('Unit & Sim Tests', 'npx', ['vitest', 'run', '--maxWorkers=1']);

    if (runSmoke) {
      runStepSync('Production Build', 'npm', ['run', 'build'], { SITE_BASE: '/thornvael/' });
      const pwArgs = ['playwright', 'test', '-c', 'playwright.smoke.config.ts'];
      if (!runSmokeAll) pwArgs.push('--project=chromium');
      runStepSync('Playwright PWA Smoke', 'npx', pwArgs);
    }
  } catch (err) {
    console.error(`\n[rebuild-and-check] ABORTED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    const totalMs = Math.round(performance.now() - totalStart);
    console.log('\n--- Summary ---');
    for (const r of results) {
      console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.label} (${r.ms} ms)`);
    }
    console.log(`Total: ${totalMs} ms`);
  }
}

main();
