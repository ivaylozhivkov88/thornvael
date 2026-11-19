#!/usr/bin/env node
/**
 * Single-command batch verification & inventory rebuild script (WISHLIST H1).
 *
 * Runs:
 *  1. `node tools/gen-inventory.mjs`
 *  2. `assets.json` provenance completeness & < 3 MiB binary size check
 *  3. `node tools/check-atlases.mjs`
 *  4. `npx tsc --noEmit` (+ `tsconfig.sw.json`)
 *  5. `npx vitest run`
 *  6. Optional `--smoke`: `npx playwright test` (or `tests/pwa-smoke.spec.ts` if present)
 *
 * Flags:
 *  --smoke       Also run Playwright smoke tests after unit tests
 *  --strict-untracked  Fail if untracked binaries lack assets.json provenance (default: warn on untracked, fail on tracked)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAX_BINARY_BYTES = 3 * 1024 * 1024; // 3 MiB
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.m4a', '.mp3', '.ogg',
  '.woff', '.woff2', '.ttf', '.otf',
]);
const ALLOWED_LICENSES = new Set(['own', 'CC0', 'OFL-1.1']);

const args = new Set(process.argv.slice(2));
const runSmoke = args.has('--smoke');
const strictUntracked = args.has('--strict-untracked');

const isWin = process.platform === 'win32';
const results = [];

function runStep(label, cmd, cmdArgs) {
  const t0 = performance.now();
  console.log(`\n=== [${label}] ${cmd} ${cmdArgs.join(' ')} ===`);
  try {
    execFileSync(cmd, cmdArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: isWin && (cmd === 'npx' || cmd === 'npm'),
    });
    const ms = Math.round(performance.now() - t0);
    results.push({ label, ok: true, ms });
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    results.push({ label, ok: false, ms, error: err.message });
    throw err;
  }
}

function checkProvenanceAndSizes() {
  const t0 = performance.now();
  const label = 'Provenance & <3 MiB Binary Check';
  console.log(`\n=== [${label}] ===`);

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
    execFileSync('git', ['ls-files', '-z', '--cached'], { cwd: ROOT, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
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

  if (warnings.length) {
    console.warn(`Warnings (${warnings.length} untracked binaries without provenance):`);
    for (const w of warnings.slice(0, 10)) console.warn(`  - ${w}`);
    if (warnings.length > 10) console.warn(`  ... and ${warnings.length - 10} more`);
  }

  const ms = Math.round(performance.now() - t0);
  if (errors.length) {
    for (const e of errors) console.error(`ERROR: ${e}`);
    results.push({ label, ok: false, ms });
    throw new Error(`${label} failed with ${errors.length} error(s)`);
  }

  console.log(`Passed: ${checkedBinaries} binaries checked, ${oversized} oversized, ${listed.size} provenance entries.`);
  results.push({ label, ok: true, ms });
}

async function main() {
  const totalStart = performance.now();
  try {
    runStep('Inventory', 'node', ['tools/gen-inventory.mjs']);
    checkProvenanceAndSizes();
    runStep('Atlas Contract', 'node', ['tools/check-atlases.mjs']);
    runStep('Typecheck (app)', 'npx', ['tsc', '--noEmit']);
    runStep('Typecheck (sw)', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.sw.json']);
    runStep('Unit & Sim Tests', 'npx', ['vitest', 'run', '--maxWorkers=1']);

    if (runSmoke) {
      const tmpCfg = `${ROOT}/node_modules/.pw-smoke-check.config.mjs`;
      writeFileSync(
        tmpCfg,
        `import base from '../playwright.config.ts';\nexport default { ...base, testDir: '../tests', testMatch: /pwa-smoke\\.spec\\.ts/ };\n`
      );
      try {
        runStep('Playwright PWA Smoke', 'npx', ['playwright', 'test', '-c', tmpCfg, '--browser=chromium']);
      } finally {
        rmSync(tmpCfg, { force: true });
      }
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
