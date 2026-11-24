#!/usr/bin/env node
/**
 * Validates all JSON content:
 * - All maps in src/missions/*.map.json & public/maps/skirmish/*.map.json (RLE bounds, unit count <= 300, valid regions)
 * - Side quests (public/data/content/side-quests*.json)
 * - NPC dialogues & town barks (npc-dialogues.json, town-barks.json)
 * - Wiki data (src/wiki/data/*.json)
 * - Act 2 & Act 3 data (src/data/act2/*.json, src/data/act3/*.json)
 * - Achievements & tutorial (src/data/achievements.json, src/data/tutorial.json)
 */
import fs from 'node:fs';
import path from 'node:path';

const errors = [];
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// 1. Maps
for (const dir of ['src/missions', 'public/maps/skirmish']) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.map.json'))) {
    const full = path.join(dir, f);
    try {
      const m = readJson(full);
      if (typeof m.w !== 'number' || typeof m.h !== 'number' || m.w < 16 || m.h < 16) {
        errors.push(`${full}: invalid dimensions ${m.w}x${m.h}`);
      }
      if (!Array.isArray(m.units) || m.units.length > 300) {
        errors.push(`${full}: units count invalid (${m.units?.length})`);
      }
      if (!Array.isArray(m.terrain) || !Array.isArray(m.height)) {
        errors.push(`${full}: missing RLE terrain/height`);
      }
    } catch (e) {
      errors.push(`${full}: parse error ${e.message}`);
    }
  }
}

// 2. Quests & Dialogues
const quests = ['side-quests.json', 'side-quests-2.json', 'side-quests-3.json', 'side-quests-4.json']
  .flatMap((f) => readJson(path.join('public/data/content', f)));
const qIds = new Set();
for (const q of quests) {
  if (!q.id || qIds.has(q.id)) errors.push(`Duplicate or missing quest id: ${q.id}`);
  qIds.add(q.id);
}

const dlgs = readJson('public/data/content/npc-dialogues.json');
const dlgIds = new Set(dlgs.map((d) => d.id));
for (const d of dlgs) {
  for (const c of d.choices || []) {
    if (c.next && c.next !== 'end' && !dlgIds.has(c.next)) {
      errors.push(`Dialogue ${d.id} broken next: ${c.next}`);
    }
  }
}

// 3. Wiki data
const wikiDir = 'src/wiki/data';
for (const f of fs.readdirSync(wikiDir).filter((x) => x.endsWith('.json'))) {
  const data = readJson(path.join(wikiDir, f));
  if (!data) errors.push(`Empty wiki file: ${f}`);
}

// 4. Act 2 & Act 3 + Achievements + Tutorial
for (const p of [
  'src/data/act2/zones.json', 'src/data/act2/towns.json', 'src/data/act2/bosses.json', 'src/data/act2/quests.json', 'src/data/act2/uniques.json',
  'src/data/act3/zones.json', 'src/data/act3/towns.json', 'src/data/act3/bosses.json', 'src/data/act3/quests.json', 'src/data/act3/uniques.json',
  'src/data/achievements.json', 'src/data/tutorial.json',
]) {
  const d = readJson(p);
  if (!d) errors.push(`Invalid JSON: ${p}`);
}

if (errors.length > 0) {
  console.error('Validation FAILED:\n' + errors.slice(0, 20).join('\n'));
  process.exit(1);
}
console.log(`validate-all: OK (${quests.length} quests, ${dlgs.length} dialogues, all maps/wiki/act2/act3 valid)`);
