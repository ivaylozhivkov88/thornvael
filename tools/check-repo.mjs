// Repo guards (REPO-01..05). Run in CI before the build; exits non-zero on any violation.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const errors = [];
const fail = (m) => errors.push(m);

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((f) => existsSync(f));

// REPO-01: original-format files and oversized binaries
const FORBIDDEN_EXT = new Set(['.res', '.alm', '.256', '.smk', '.pak', '.bik']);
const MAX_BINARY = 1024 * 1024; // 1 MB
const TEXT_EXT = new Set(['.ts', '.js', '.mjs', '.json', '.md', '.html', '.css', '.yml', '.yaml', '.svg', '.txt', '.webmanifest']);
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.m4a', '.mp3', '.ogg', '.woff', '.woff2', '.ttf', '.otf']);

for (const f of files) {
  const ext = extname(f).toLowerCase();
  if (FORBIDDEN_EXT.has(ext)) fail(`${f}: original-format file type ${ext} is not allowed`);
  if (BINARY_EXT.has(ext) && statSync(f).size > MAX_BINARY) fail(`${f}: binary larger than 1 MB`);
}

// REPO-03: provenance manifest
const manifest = JSON.parse(readFileSync('assets.json', 'utf8'));
const ALLOWED = new Set(['own', 'CC0', 'OFL-1.1']);
const listed = new Map();
for (const a of manifest.assets) {
  if (!ALLOWED.has(a.license)) fail(`assets.json: ${a.path} has license "${a.license}" outside the allow-list`);
  if (!a.source) fail(`assets.json: ${a.path} has no source`);
  if (!existsSync(a.path)) fail(`assets.json: ${a.path} listed but missing (check letter case)`);
  listed.set(a.path, a);
}
for (const f of files) {
  if (BINARY_EXT.has(extname(f).toLowerCase()) && !listed.has(f)) fail(`${f}: no provenance entry in assets.json`);
}
const third = readFileSync('THIRD_PARTY.md', 'utf8');
for (const a of manifest.assets) {
  if (a.license !== 'own' && !third.includes(a.path)) fail(`THIRD_PARTY.md does not mention ${a.path}`);
}

// REPO-02/04: original names must not appear in any text file (words are built from parts so this file passes)
const banned = [['Rage of', ' Mages'], ['Allo', 'ds'], ['Niva', 'l'], ['Necromancer', "'s Rage"]].map(([a, b]) => new RegExp(a + b, 'i'));
for (const f of files) {
  if (f === 'package-lock.json' || !TEXT_EXT.has(extname(f).toLowerCase())) continue;
  const text = readFileSync(f, 'utf8');
  for (const re of banned) if (re.test(text)) fail(`${f}: contains a forbidden original name (${re.source})`);
}

// REPO-05: letter case. Case-insensitive duplicates, and manifest/index references must match the real path exactly.
const seen = new Map();
for (const f of files) {
  const k = f.toLowerCase();
  if (seen.has(k) && seen.get(k) !== f) fail(`${f} and ${seen.get(k)} differ only by letter case`);
  seen.set(k, f);
}
const tracked = new Set(files);
for (const f of files.filter((x) => /\.(html|css|ts|webmanifest)$/.test(x))) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/(?:src|href)="\.\/([^"#?]+)"|['"]\/?(icons\/[\w.-]+)['"]/g)) {
    const ref = m[1] ?? m[2];
    const candidates = [ref, `public/${ref}`];
    if (!candidates.some((c) => tracked.has(c))) fail(`${f}: reference "${ref}" matches no file with that exact letter case`);
  }
}

if (errors.length) {
  console.error('Repo check FAILED:\n' + errors.map((e) => ' - ' + e).join('\n'));
  process.exit(1);
}
console.log(`Repo check passed (${files.length} files).`);
