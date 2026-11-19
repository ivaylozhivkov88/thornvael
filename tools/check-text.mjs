// Text validation guard for BOTH src/data/text/*.json AND public/data/text/*.json.
// Checks: schema, exact entry counts, non-empty strings, length sanity, control-char/ASCII guards,
// intra-pack and cross-pack duplicate keys/texts, and banned original names.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC_TEXT_DIR = 'src/data/text';
const PUBLIC_TEXT_DIR = 'public/data/text';
const SPRITES_DIR = 'public/sprites';
const SRC_MAX_LEN = 90;

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

const EXPECTED_PUBLIC_PACKS = [
  'achievements-60.json',
  'bestiary-52.json',
  'death-messages-30.json',
  'loading-tips-50.json',
  'location-plaques-40.json',
  'tavern-rumors-40.json',
];

const MAP_BY_ACT = {
  1: 'map1-border-fords',
  2: 'map2-redmarsh-wastes',
  3: 'map3-iron-coast',
  4: 'map4-obsidian-caldera',
};

function hasBanned(text) {
  for (const re of BANNED) {
    if (re.test(text)) return re.source;
  }
  return null;
}

export function checkAllTextPacks(rootDir = process.cwd()) {
  const errors = [];
  const fail = (msg) => errors.push(msg);

  const globalKeys = new Map();
  const globalTexts = new Map();

  const recordKey = (key, location) => {
    if (typeof key !== 'string' || key.trim().length === 0) {
      fail(`${location}: key must be a non-empty string`);
      return;
    }
    const bannedHit = hasBanned(key);
    if (bannedHit) fail(`${location}: key "${key}" contains banned term (${bannedHit})`);
    const prev = globalKeys.get(key);
    if (prev) {
      fail(`${location}: duplicate key "${key}" (already seen in ${prev})`);
    } else {
      globalKeys.set(key, location);
    }
  };

  const recordText = (text, location, opts = {}) => {
    const { minLen = 1, maxLen = 420, asciiOnly = false } = opts;
    if (typeof text !== 'string') {
      fail(`${location}: expected string, got ${typeof text}`);
      return;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      fail(`${location}: empty string`);
      return;
    }
    if (text.length < minLen || text.length > maxLen) {
      fail(`${location}: length ${text.length} out of bounds [${minLen}..${maxLen}] ("${trimmed.slice(0, 48)}")`);
    }
    if (/[\x00-\x1F\x7F]/.test(text)) {
      fail(`${location}: contains control characters`);
    }
    if (asciiOnly && !/^[\x20-\x7E]+$/.test(text)) {
      fail(`${location}: contains non-ASCII characters ("${trimmed.slice(0, 48)}")`);
    }
    const bannedHit = hasBanned(text);
    if (bannedHit) fail(`${location}: contains banned term (${bannedHit})`);
    const prev = globalTexts.get(trimmed);
    if (prev) {
      fail(`${location}: duplicate text also in ${prev} ("${trimmed.slice(0, 48)}")`);
    } else {
      globalTexts.set(trimmed, location);
    }
  };

  // 1. Validate src/data/text/*.json (flat { key: string } dictionaries)
  const srcDir = resolve(rootDir, SRC_TEXT_DIR);
  let srcFiles = [];
  let srcKeys = 0;

  if (!existsSync(srcDir)) {
    fail(`${SRC_TEXT_DIR}: directory is missing`);
  } else {
    srcFiles = readdirSync(srcDir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    if (srcFiles.length === 0) {
      fail(`${SRC_TEXT_DIR}: expected JSON files, found 0`);
    }

    for (const file of srcFiles) {
      const relPath = join(SRC_TEXT_DIR, file).replace(/\\/g, '/');
      let data;
      try {
        data = JSON.parse(readFileSync(join(srcDir, file), 'utf8'));
      } catch (err) {
        fail(`${relPath}: invalid JSON (${err.message})`);
        continue;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        fail(`${relPath}: root must be a flat JSON object`);
        continue;
      }

      for (const [key, val] of Object.entries(data)) {
        srcKeys++;
        const loc = `${relPath}[${key}]`;
        recordKey(key, loc);
        recordText(val, loc, { minLen: 1, maxLen: SRC_MAX_LEN, asciiOnly: true });
      }
    }
  }

  // 2. Validate public/data/text/*.json (structured { version, entries } packs)
  const pubDir = resolve(rootDir, PUBLIC_TEXT_DIR);
  let pubFiles = [];
  let pubEntries = 0;
  let pubKeys = 0;

  if (!existsSync(pubDir)) {
    fail(`${PUBLIC_TEXT_DIR}: directory is missing`);
  } else {
    pubFiles = readdirSync(pubDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    for (const expected of EXPECTED_PUBLIC_PACKS) {
      if (!pubFiles.includes(expected)) {
        fail(`${PUBLIC_TEXT_DIR}: missing expected pack ${expected}`);
      }
    }

    for (const file of pubFiles) {
      const relPath = join(PUBLIC_TEXT_DIR, file).replace(/\\/g, '/');
      let pack;
      try {
        pack = JSON.parse(readFileSync(join(pubDir, file), 'utf8'));
      } catch (err) {
        fail(`${relPath}: invalid JSON (${err.message})`);
        continue;
      }

      if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
        fail(`${relPath}: root must be a JSON object`);
        continue;
      }
      if (typeof pack.version !== 'number') {
        fail(`${relPath}: missing numeric "version" field`);
      }
      if (!Array.isArray(pack.entries)) {
        fail(`${relPath}: "entries" must be an array`);
        continue;
      }

      pubEntries += pack.entries.length;
      const seenIds = new Set();

      if (file === 'bestiary-52.json') {
        if (pack.entries.length !== 52) {
          fail(`${relPath}: expected 52 entries, got ${pack.entries.length}`);
        }
        const spritesPath = resolve(rootDir, SPRITES_DIR);
        const expectedSpriteIds = existsSync(spritesPath)
          ? readdirSync(spritesPath)
              .filter((f) => f.endsWith('.json'))
              .map((f) => f.slice(0, -'.json'.length))
              .filter((id) => id !== 'hero')
          : null;

        for (const e of pack.entries) {
          const loc = `${relPath}#${e?.id ?? '?'}`;
          if (!e || typeof e !== 'object') {
            fail(`${loc}: entry must be an object`);
            continue;
          }
          if (typeof e.id !== 'string' || !e.id.trim()) fail(`${loc}: missing id`);
          else if (seenIds.has(e.id)) fail(`${loc}: duplicate id "${e.id}"`);
          else seenIds.add(e.id);
          if (hasBanned(String(e.id ?? ''))) fail(`${loc}: banned term in id`);

          recordKey(e.nameKey, `${loc}.nameKey`);
          recordKey(e.loreKey, `${loc}.loreKey`);
          pubKeys += 2;

          if (typeof e.name !== 'string' || e.name.trim().length < 2 || e.name.trim().length > 60) {
            fail(`${loc}.name: length out of bounds [2..60]`);
          } else if (hasBanned(e.name)) {
            fail(`${loc}.name: banned term`);
          }
          recordText(e.lore, `${loc}.lore`, { minLen: 40, maxLen: 420 });
          if (typeof e.weakness !== 'string' || e.weakness.trim().length < 10 || e.weakness.trim().length > 160) {
            fail(`${loc}.weakness: length out of bounds [10..160]`);
          } else if (hasBanned(e.weakness)) {
            fail(`${loc}.weakness: banned term`);
          }
        }

        if (expectedSpriteIds) {
          for (const unitId of expectedSpriteIds) {
            if (!seenIds.has(unitId)) fail(`${relPath}: missing sprite unit id "${unitId}"`);
          }
        }
      } else if (file === 'achievements-60.json') {
        if (pack.entries.length !== 60) {
          fail(`${relPath}: expected 60 entries, got ${pack.entries.length}`);
        }
        const seenTitles = new Set();
        for (const e of pack.entries) {
          const loc = `${relPath}#${e?.id ?? '?'}`;
          if (!e || typeof e !== 'object') {
            fail(`${loc}: entry must be an object`);
            continue;
          }
          if (typeof e.id !== 'string' || !e.id.trim()) fail(`${loc}: missing id`);
          else if (seenIds.has(e.id)) fail(`${loc}: duplicate id "${e.id}"`);
          else seenIds.add(e.id);
          if (hasBanned(String(e.id ?? ''))) fail(`${loc}: banned term in id`);

          recordKey(e.titleKey, `${loc}.titleKey`);
          recordKey(e.descKey, `${loc}.descKey`);
          pubKeys += 2;

          if (typeof e.title !== 'string' || e.title.trim().length < 3 || e.title.trim().length > 60) {
            fail(`${loc}.title: length out of bounds [3..60]`);
          } else {
            const t = e.title.trim();
            if (seenTitles.has(t)) fail(`${loc}.title: duplicate title "${t}"`);
            seenTitles.add(t);
            if (hasBanned(t)) fail(`${loc}.title: banned term`);
          }
          recordText(e.desc, `${loc}.desc`, { minLen: 15, maxLen: 180 });
          if (!e.condition || typeof e.condition.metric !== 'string' || !e.condition.metric.trim()) {
            fail(`${loc}.condition: missing metric`);
          }
        }
      } else if (file === 'loading-tips-50.json') {
        if (pack.entries.length !== 50) {
          fail(`${relPath}: expected 50 entries, got ${pack.entries.length}`);
        }
        for (const e of pack.entries) {
          const loc = `${relPath}[${e?.key ?? '?'}]`;
          recordKey(e?.key, loc);
          pubKeys++;
          recordText(e?.text, loc, { minLen: 25, maxLen: 220 });
        }
      } else if (file === 'death-messages-30.json') {
        if (pack.entries.length !== 30) {
          fail(`${relPath}: expected 30 entries, got ${pack.entries.length}`);
        }
        for (const e of pack.entries) {
          const loc = `${relPath}[${e?.key ?? '?'}]`;
          recordKey(e?.key, loc);
          pubKeys++;
          recordText(e?.text, loc, { minLen: 25, maxLen: 200 });
        }
      } else if (file === 'tavern-rumors-40.json') {
        if (pack.entries.length !== 40) {
          fail(`${relPath}: expected 40 entries, got ${pack.entries.length}`);
        }
        const stages = new Map([[1, 0], [2, 0], [3, 0], [4, 0]]);
        for (const e of pack.entries) {
          const loc = `${relPath}[${e?.key ?? '?'}]`;
          recordKey(e?.key, loc);
          pubKeys++;
          recordText(e?.text, loc, { minLen: 30, maxLen: 220 });
          stages.set(e?.stage, (stages.get(e?.stage) ?? 0) + 1);
        }
        for (const st of [1, 2, 3, 4]) {
          if (stages.get(st) !== 10) {
            fail(`${relPath}: stage ${st} expected 10 entries, got ${stages.get(st) ?? 0}`);
          }
        }
      } else if (file === 'location-plaques-40.json') {
        if (pack.entries.length !== 40) {
          fail(`${relPath}: expected 40 entries, got ${pack.entries.length}`);
        }
        const acts = new Map([[1, 0], [2, 0], [3, 0], [4, 0]]);
        const seenTitles = new Set();
        for (const e of pack.entries) {
          const loc = `${relPath}[${e?.key ?? '?'}]`;
          recordKey(e?.key, loc);
          pubKeys++;
          const m = /^plaque\.map([1-4])\.[a-z0-9_]+$/.exec(String(e?.key ?? ''));
          if (!m || Number(m[1]) !== e?.act) {
            fail(`${loc}: key must match plaque.map<act>.<slug>`);
          }
          if (e?.mapId !== MAP_BY_ACT[e?.act]) {
            fail(`${loc}: mapId "${e?.mapId}" does not match act ${e?.act}`);
          }
          acts.set(e?.act, (acts.get(e?.act) ?? 0) + 1);

          if (typeof e?.region !== 'string' || e.region.trim().length < 3 || e.region.trim().length > 60) {
            fail(`${loc}.region: length out of bounds [3..60]`);
          } else if (hasBanned(e.region) || !/^[\x20-\x7E]+$/.test(e.region)) {
            fail(`${loc}.region: invalid characters or banned term`);
          }

          if (typeof e?.title !== 'string' || e.title.trim().length < 5 || e.title.trim().length > 70) {
            fail(`${loc}.title: length out of bounds [5..70]`);
          } else {
            const t = e.title.trim();
            if (seenTitles.has(t)) fail(`${loc}.title: duplicate title "${t}"`);
            seenTitles.add(t);
            if (hasBanned(t) || !/^[\x20-\x7E]+$/.test(t)) {
              fail(`${loc}.title: invalid characters or banned term`);
            }
          }

          recordText(e?.text, loc, { minLen: 45, maxLen: 240, asciiOnly: true });
        }
        for (const act of [1, 2, 3, 4]) {
          if (acts.get(act) !== 10) {
            fail(`${relPath}: act ${act} expected 10 entries, got ${acts.get(act) ?? 0}`);
          }
        }
      } else {
        // Generic validation for any additional structured public text pack
        for (let i = 0; i < pack.entries.length; i++) {
          const e = pack.entries[i];
          const loc = `${relPath}[${i}]`;
          if (!e || typeof e !== 'object') {
            fail(`${loc}: entry must be an object`);
            continue;
          }
          if (e.key) {
            recordKey(e.key, loc);
            pubKeys++;
          }
          if (typeof e.text === 'string') {
            recordText(e.text, loc, { minLen: 5, maxLen: 420 });
          }
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      srcFiles: srcFiles.length,
      srcKeys,
      publicFiles: pubFiles.length,
      publicEntries: pubEntries,
      publicKeys: pubKeys,
      totalKeys: srcKeys + pubKeys,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const res = checkAllTextPacks();
  if (!res.ok) {
    console.error(
      `Text check FAILED (${res.errors.length} errors):\n` +
        res.errors.map((e) => ` - ${e}`).join('\n'),
    );
    process.exit(1);
  }
  const { srcFiles, srcKeys, publicFiles, publicEntries, publicKeys, totalKeys } = res.stats;
  console.log(
    `Text check passed (${srcFiles} src files [${srcKeys} keys], ${publicFiles} public files [${publicEntries} entries, ${publicKeys} keys], ${totalKeys} total keys, 0 errors).`,
  );
}
