// Text validation guard for src/data/text/*.json.
// Checks: flat {key: string} JSON, non-empty values, length <= 90,
// printable ASCII only, no duplicate values, and no banned words.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TEXT_DIR = 'src/data/text';
const MAX_LEN = 90;

const BANNED = [
  ['Rage of', ' Mages'],
  ['Allo', 'ds'],
  ['Niva', 'l'],
  ['Necromancer', "'s Rage"],
  ['Dia', 'blo'],
  ['Kur', 'ast'],
  ['Tal Ra', 'sha'],
  ['Bishi', 'bosh'],
  ['Raka', 'nishu'],
  ['Rada', 'ment'],
  ['Heph', 'asto'],
  ['Izu', 'al'],
  ['Endu', 'gu'],
  ['De ', 'Seis'],
].map(([a, b]) => new RegExp(a + b, 'i'));

const errors = [];
const fail = (msg) => errors.push(msg);

if (!existsSync(TEXT_DIR)) {
  console.log(`check-text: ${TEXT_DIR} does not exist yet (0 files).`);
  process.exit(0);
}

const files = readdirSync(TEXT_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

const globalSeen = new Map();
let totalKeys = 0;

for (const file of files) {
  const fullPath = join(TEXT_DIR, file);
  let data;
  try {
    data = JSON.parse(readFileSync(fullPath, 'utf8'));
  } catch (err) {
    fail(`${fullPath}: invalid JSON (${err.message})`);
    continue;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail(`${fullPath}: root must be a flat JSON object`);
    continue;
  }

  for (const [key, val] of Object.entries(data)) {
    totalKeys++;
    if (typeof val !== 'string') {
      fail(`${fullPath}[${key}]: value must be a string`);
      continue;
    }
    if (val.trim().length === 0) {
      fail(`${fullPath}[${key}]: empty value`);
      continue;
    }
    if (val.length > MAX_LEN) {
      fail(`${fullPath}[${key}]: length ${val.length} > ${MAX_LEN} ("${val}")`);
    }
    if (!/^[\x20-\x7E]+$/.test(val)) {
      fail(`${fullPath}[${key}]: contains non-ASCII or control characters ("${val}")`);
    }
    for (const re of BANNED) {
      if (re.test(val) || re.test(key)) {
        fail(`${fullPath}[${key}]: contains banned term (${re.source})`);
      }
    }
    const prev = globalSeen.get(val);
    if (prev) {
      fail(`${fullPath}[${key}]: duplicate value also in ${prev} ("${val}")`);
    } else {
      globalSeen.set(val, `${fullPath}[${key}]`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Text check FAILED (${errors.length} errors):\n` + errors.map((e) => ` - ${e}`).join('\n'));
  process.exit(1);
}

console.log(`Text check passed (${files.length} files, ${totalKeys} keys, 0 errors).`);
