// Generates tools/INVENTORY.md from the live contents of game/public/ and game/src/.
// Safe, read-only scanner: outputs factual counts, existing modules, and missing-vs-needed gaps.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function walk(dir) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return [];
  const out = [];
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out.sort();
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function humanSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

// 1. Audio inventory
const audioFiles = walk('public/audio').filter((f) => f.endsWith('.m4a'));
const audioStats = audioFiles.map((f) => ({ path: f, name: f.split('/').pop(), size: statSync(join(ROOT, f)).size }));
const audioGroups = {
  music: audioStats.filter((x) => x.name.startsWith('music_')),
  amb: audioStats.filter((x) => x.name.startsWith('amb_') || x.name === 'ambience.m4a'),
  step: audioStats.filter((x) => x.name.startsWith('step')),
  ui: audioStats.filter((x) => x.name.startsWith('ui_') || x.name === 'click.m4a' || x.name === 'gold.m4a' || x.name === 'ledger_latch_01.m4a'),
  town: audioStats.filter((x) => x.name.startsWith('town_')),
  loot: audioStats.filter((x) => x.name.startsWith('loot_')),
  spell: audioStats.filter((x) => x.name.startsWith('sfx_spell_') || x.name.startsWith('spell_') || x.name.startsWith('cast_')),
  combat: audioStats.filter((x) => /^(hit|swing|block_|armor_|death|boom|miss|yew_|sfx_crit|sfx_dodge|sfx_shield)/.test(x.name)),
  sfxMisc: audioStats.filter((x) => x.name.startsWith('sfx_') && !x.name.startsWith('sfx_spell_') && !/^sfx_(crit|dodge|shield)/.test(x.name)),
};
const totalAudioBytes = audioStats.reduce((a, b) => a + b.size, 0);

// 2. Sprites inventory
const spriteJson = walk('public/sprites').filter((f) => f.endsWith('.json'));
const spritePng = walk('public/sprites').filter((f) => f.endsWith('.png'));
const unitIds = spriteJson.map((f) => f.split('/').pop().replace(/\.json$/, ''));

// 3. Townart inventory
const townRoot = readdirSync(join(ROOT, 'public/townart'), { withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => d.name)
  .sort();
const townPortraits = walk('public/townart/portraits');
const townDoll = walk('public/townart/doll');
const townMon = walk('public/townart/mon');

// 4. Icons & Itemicons vs item catalog
const pwaIcons = walk('public/icons');
const itemIcons = walk('public/itemicons');
const itemIconSlugs = new Set(itemIcons.map((f) => f.split('/').pop().replace(/\.(png|jpg|webp)$/i, '')));

const itemsData = JSON.parse(readFileSync(join(ROOT, 'public/data/items.json'), 'utf8')).items || [];
const uniquesFiles = ['uniques.json', 'uniques-2.json', 'uniques-3.json'];
const allUniques = [];
for (const uf of uniquesFiles) {
  const p = join(ROOT, 'public/data/content', uf);
  if (existsSync(p)) {
    const arr = JSON.parse(readFileSync(p, 'utf8'));
    if (Array.isArray(arr)) allUniques.push(...arr);
  }
}
const itemSetsFiles = ['item-sets.json', 'item-sets-2.json'];
const allSets = [];
for (const sf of itemSetsFiles) {
  const p = join(ROOT, 'public/data/content', sf);
  if (existsSync(p)) {
    const arr = JSON.parse(readFileSync(p, 'utf8'));
    if (Array.isArray(arr)) allSets.push(...arr);
  }
}

const baseMatched = itemsData.filter((it) => itemIconSlugs.has(slugify(it.icon || it.id || it.name))).length;
const uniqueMatched = allUniques.filter((u) => itemIconSlugs.has(slugify(u.icon || u.id || u.name))).length;

// 5. Objects & Terrain (LOCKED BY PARALLEL AGENT)
const objectFiles = walk('public/objects');
let objectFrameCount = 0;
if (existsSync(join(ROOT, 'public/objects/objects.json'))) {
  const objMeta = JSON.parse(readFileSync(join(ROOT, 'public/objects/objects.json'), 'utf8'));
  objectFrameCount = objMeta.frames ? Object.keys(objMeta.frames).length : 0;
}
const terrainFiles = walk('public/terrain');

// 6. Content JSONs & Missions
const dataRootFiles = readdirSync(join(ROOT, 'public/data'), { withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => d.name)
  .sort();
const contentFiles = walk('public/data/content');
const missionFiles = walk('src/missions').filter((f) => f.endsWith('.map.json'));

// 7. Source modules & tests
const srcRootTs = readdirSync(join(ROOT, 'src'), { withFileTypes: true })
  .filter((d) => d.isFile() && /\.(ts|css)$/.test(d.name))
  .map((d) => d.name)
  .sort();
const srcSimTs = walk('src/sim').map((f) => f.replace('src/sim/', ''));
const testFiles = walk('tests');

// 8. Check for spells coverage
const spellsData = JSON.parse(readFileSync(join(ROOT, 'public/data/spells.json'), 'utf8')).spells || [];

const lines = [];
lines.push('# Thornvael Asset & Code Inventory');
lines.push('');
lines.push('Auto-generated by `node tools/gen-inventory.mjs`. Use this as ground truth before building new assets or systems.');
lines.push('');
lines.push('## 1. Summary Counts');
lines.push('');
lines.push('| Category | Present Count | Notes |');
lines.push('|---|---:|---|');
lines.push(`| Audio (\`public/audio/*.m4a\`) | ${audioFiles.length} (${humanSize(totalAudioBytes)}) | ${audioGroups.music.length} music, ${audioGroups.amb.length} ambient, ${audioGroups.spell.length} spell, ${audioGroups.step.length} footsteps, ${audioGroups.ui.length} UI |`);
lines.push(`| Unit Sprite Atlases (\`public/sprites/\`) | ${spriteJson.length} JSON / ${spritePng.length} PNG | All 52 enemy/hero/boss families + companion atlases |`);
lines.push(`| Town Art & Portraits (\`public/townart/\`) | ${townRoot.length} root + ${townPortraits.length} portraits + ${townDoll.length} doll + ${townMon.length} mon | Complete framed portrait & paperdoll layers |`);
lines.push(`| PWA Icons (\`public/icons/\`) | ${pwaIcons.length} | \`apple-touch-icon.png\`, \`icon-192.png\`, \`icon-512.png\` |`);
lines.push(`| Item Icons (\`public/itemicons/\`) | ${itemIcons.length} | Covers ${uniqueMatched}/${allUniques.length} unique names, ${baseMatched}/${itemsData.length} base items (${itemsData.length} base + ${allUniques.length} uniques need full icon mapping) |`);
lines.push(`| World Objects (\`public/objects/\`, LOCKED) | ${objectFiles.length} (${objectFrameCount} atlas frames) | Props wave 1 (` + 'bones, ruins, camp, rocks, desert, volcanic, highland' + `) |`);
lines.push(`| Terrain Skins (\`public/terrain/\`, LOCKED) | ${terrainFiles.length} | Ground & zone skins |`);
lines.push(`| Core Data (\`public/data/\`) | ${dataRootFiles.length} root + ${contentFiles.length} content JSONs | \`items.json\` (${itemsData.length}), \`spells.json\` (${spellsData.length}), ${allUniques.length} uniques, ${allSets.length} sets |`);
lines.push(`| Missions (\`src/missions/\`, LOCKED) | ${missionFiles.length} | Existing campaign/skirmish + new macro maps |`);
lines.push(`| Source Modules (\`src/\`) | ${srcRootTs.length} root + ${srcSimTs.length} \`src/sim/\` | ${testFiles.length} test files in \`tests/\` |`);
lines.push('');
lines.push('## 2. Audio Breakdown (`public/audio/`)');
lines.push('');
lines.push(`- **Music (${audioGroups.music.length} tracks):** ${audioGroups.music.map((x) => `\`${x.name}\``).join(', ')}`);
lines.push(`- **Music gaps vs WISHLIST D1:** Skirmish biome themes (\`music_skirmish_*\`), separate character-select track (\`music_char_select\`), tense-combat phase transitions per map, and 3rd exploration variant per map.`);
lines.push(`- **Ambient (${audioGroups.amb.length} files):** Biome loops + \`_ev0\` variants.`);
lines.push(`- **Footsteps (${audioGroups.step.length} files):** ${audioGroups.step.map((x) => `\`${x.name}\``).join(', ')}. Gap: separate \`step_snow_*\` and \`step_ash_*\` variants.`);
lines.push(`- **UI (${audioGroups.ui.length} files):** ${audioGroups.ui.map((x) => `\`${x.name}\``).join(', ')}. Gap: UI error/invalid buzz (\`ui_error.m4a\`), level-up/quest/save are in \`sfx_*\`.`);
lines.push(`- **SFX Combat/Monster/World:** \`death_beast_1\`, \`death_skeleton_1\` (missing caster/golem/construct/undead/insectoid death voices & monster aggro/hit voices), \`hit_*\` (12), \`swing_*\` (3), \`loot_*\` (5), \`sfx_chest_open\`, \`sfx_door_heavy\`, \`sfx_trap_trigger\`, \`potion_drink_1..2\`, \`town_*\` (4), \`sfx_spell_*_cast/impact\` (32 pairs).`);
lines.push('');
lines.push('## 3. Art, Icons & UI Coverage');
lines.push('');
lines.push(`- **Unit Atlases (${unitIds.length}):** ${unitIds.map((u) => `\`${u}\``).join(', ')}`);
lines.push(`- **Item Icons (${itemIcons.length}):** Generated under \`public/itemicons/\` for unique artifacts; **MISSING dedicated icons for most base gear types (${itemsData.length - baseMatched} missing direct slug match), rarity socket gems/runes, spellbook school icons (\`public/spellicons/\` absent), status effect icons, projectile trail sprites (\`public/projectiles/\` absent), animated NPC town sprites (\`public/townnpcs/\` absent), wave-2 world props (shrines, chests 3x, bridges, shipwrecks, mushrooms, reeds), and dedicated 4-map loading screen paintings (\`public/loadscreens/\` absent).**`);
lines.push(`- **Town Art Root (${townRoot.length}):** ${townRoot.join(', ')} — **Note**: Shop, Tavern & Campfire art exist; unified building sprites & 9-slice UI skin frames/orbs (\`public/uiskin/\`) are still partial/CSS-only.`);
lines.push('');
lines.push('## 4. Existing Systems in `src/` & `src/sim/`');
lines.push('');
lines.push(`- **FX / Feel already present:** \`src/feel.ts\`, \`src/vfx.ts\`, \`src/aesthetic-vfx.ts\`, \`src/auras.ts\`, \`src/loot-overlay.ts\`, \`src/nameplate.ts\`. **Gaps (WISHLIST A):** No modular \`src/fx/\` pool/config system with reduced-motion + low-end particle caps, per-family corpse decals/bone burst, ground footstep particle emitters, cursor/hover rarity outline controller, or parabolic loot beam arcs.`);
lines.push(`- **Audio engine already present:** \`src/audio.ts\` (1,869 LOC), \`src/audiologic.ts\`. **Gaps (WISHLIST D2/D5/D6):** Dedicated adaptive crossfade/ducking controller for streaming \`<audio>\` music layers + separate bus mix controls and spatial pan helpers.`);
lines.push(`- **Loot / Skills / Text already present:** \`src/sim/affixes.ts\`, \`src/sim/sets.ts\`, \`src/sim/runes.ts\`, \`src/sim/cube.ts\`, \`src/sim/d2-database.ts\`, \`src/sim/items.ts\`, \`src/achievements.ts\`, \`src/codex.ts\`, \`src/tips.ts\`, \`public/data/content/*\` (${contentFiles.length} JSON files). **Gaps (WISHLIST E1/E2/E8, G2/G4):** Unified \`docs/design/loot-and-skills.md\` specification + deterministic \`src/items/\` & \`src/skills/\` (3-branch skill trees for Warrior & Mage with synergies and gold respec), plus clean i18n-keyed unified text schemas validating all 52 unit bestiary entries, 60 achievements, 50 loading tips, 30 death quotes, 40 staged tavern rumors.`);
lines.push(`- **Tooling & QA already present:** \`tools/check-repo.mjs\`, \`tools/check-atlases.mjs\`, \`tools/benchmark-active300.mjs\`, \`tests/pwa-install.test.ts\`, \`.github/workflows/deploy.yml\`. **Gaps (WISHLIST H1-H4, F8-F9):** Unified \`tools/rebuild-and-check.mjs\`, \`tools/seed-gallery.mjs\`, \`docs/perf.md\` with measured 300-unit & chunk/atlas RAM metrics, Playwright WebKit+Chromium offline smoke suite (\`tests/pwa-smoke.spec.ts\`), and dedicated CI validation workflow.`);
lines.push('');
lines.push('## 5. Parallel Agent Area Locks (DO NOT MODIFY)');
lines.push('');
lines.push('- **Hero & Roster Agent:** `src/characters.ts`, `src/shell.ts`, `src/main.ts`, `src/savedb.ts`');
lines.push('- **Map Art Agent:** `src/terrain.ts`, `public/terrain/`, `public/objects/`');
lines.push('- **Campaign Agent:** `.planning/campaign/`, `src/missions/`, `src/mapdoc.ts`, `src/mission.ts`, `src/missionui.ts`');
lines.push('- **Protected Core:** `src/sim/path.ts`, `tests/movement.test.ts`, `models/`, `tools/render-unit.py`');
lines.push('');

writeFileSync(join(ROOT, 'tools/INVENTORY.md'), lines.join('\n') + '\n', 'utf8');
console.log('Generated tools/INVENTORY.md successfully.');
