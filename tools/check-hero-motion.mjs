// Validate a workspace-only articulated model proof. Not a production atlas or visual approval.
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { decodePng } from './check-atlases.mjs';
import { checkLookdev } from './check-lookdev.mjs';

const gameRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspace = resolve(gameRoot, '..');
const directions = [0, 4, 8, 12];
const clips = { stand: 1, walk: 4, attack: 4 };
const epsilon = 1e-6;
const inside = (path) => {
  const rel = relative(workspace, path);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\'))
    throw Error('Motion evidence and sources must stay inside the workspace');
  return path;
};
const fail = (condition, message) => { if (!condition) throw Error(message); };
const exact = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameFields = (value, expected) => !!value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === Object.keys(expected).length && Object.entries(expected).every(([key, wanted]) => value[key] === wanted);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pad = (n) => String(n).padStart(2, '0');
const label = (value) => typeof value === 'string' && value.trim().length > 0;
const boundedDelta = (value) => Number.isFinite(value) && value >= 0 && value <= epsilon;
const matrix = (value) => Array.isArray(value) && value.length === 16 && value.every(Number.isFinite);

export function checkHeroMotion(directory) {
  const root = inside(resolve(directory));
  const report = JSON.parse(readFileSync(resolve(root, 'motion-report.json'), 'utf8'));
  fail(report.version === 1 && exact(report.cell, [48, 48]) && exact(report.anchor, [0.5, 0.85]), 'Wrong motion proof version/cell/anchor');
  fail(exact(report.directions, directions) && sameFields(report.clips, clips), 'Wrong motion directions or clip counts');
  fail(exact(report.camera?.location, [0, -6, 5.2]) && report.camera.shift_y === 0.35 && report.camera.ortho_scale === 3 &&
    report.modelScale === 1.15, 'Motion camera or physical scale changed');
  fail(report.matrixOrder === 'row-major', 'Matrices must declare row-major order');
  for (const check of ['binding', 'reset', 'attachments', 'coverage'])
    fail(report.checks?.[check] === true, `Blender ${check} verification failed or missing`);

  const requiredJoints = ['root', 'pelvis', 'chest', 'neck', 'head',
    ...['L', 'R'].flatMap((side) => ['upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot'].map((name) => `${name}.${side}`))];
  fail(Array.isArray(report.jointIds) && report.jointIds.every(label) && new Set(report.jointIds).size === report.jointIds.length &&
    requiredJoints.every((name) => report.jointIds.includes(name)), 'Missing or duplicate joints');
  const joints = new Set(report.jointIds);
  fail(Array.isArray(report.geometryOwners) && report.geometryOwners.length > 0 &&
    report.geometryCount === report.geometryOwners.length && report.unboundCount === 0 && report.multiplyBoundCount === 0,
  'Missing, unbound or multiply bound geometry');
  const owners = new Map();
  for (const row of report.geometryOwners) {
    fail(label(row.object) && joints.has(row.owner) && !owners.has(row.object), 'Invalid or duplicate geometry ownership');
    owners.set(row.object, row.owner);
  }
  fail(Array.isArray(report.attachments) && report.attachments.length >= 2, 'Weapon attachments missing');
  const attachments = new Map();
  for (const row of report.attachments) {
    fail(owners.has(row.object) && !attachments.has(row.object) && owners.get(row.object) === row.parent &&
      /^(hand|forearm)\.[LR]$/.test(row.parent) && matrix(row.restLocal), 'Invalid weapon rest attachment');
    attachments.set(row.object, row);
  }
  for (const role of ['sword', 'shield'])
    fail(report.attachments.some((row) => row.role === role), `Missing ${role} attachment role`);
  const verifyAttachments = (rows, context) => {
    fail(Array.isArray(rows) && rows.length === attachments.size, `${context}: incomplete attachment matrices`);
    const seen = new Set();
    for (const row of rows) {
      const rest = attachments.get(row.object);
      fail(rest && !seen.has(row.object) && matrix(row.local), `${context}: invalid attachment matrix`);
      seen.add(row.object);
      fail(row.local.every((value, index) => Math.abs(value - rest.restLocal[index]) <= epsilon), `${context}: weapon detached from joint`);
    }
  };

  fail(Array.isArray(report.sources) && report.sources.length >= 3, 'Generator and protocol source hashes missing');
  const sourceNames = new Set();
  for (const source of report.sources) {
    fail(label(source.file) && typeof source.sha256 === 'string' && /^[a-f0-9]{64}$/.test(source.sha256), 'Invalid source hash record');
    const path = inside(realpathSync(inside(resolve(workspace, source.file))));
    const name = relative(workspace, path).replaceAll('\\', '/');
    fail(!sourceNames.has(path), 'Duplicate source record');
    sourceNames.add(path);
    fail(hash(readFileSync(path)) === source.sha256, `Source changed after proof: ${name}`);
  }
  for (const file of ['tools/hero-lookdev.py', 'tools/hero-motion.py', 'docs/HERO-MOTION-SCHEMA.md']) {
    const canonical = inside(realpathSync(resolve(gameRoot, file)));
    fail(sourceNames.has(canonical), `Missing source record: ${relative(workspace, canonical)}`);
  }

  const png = (file) => {
    const bytes = readFileSync(resolve(root, file));
    const decoded = decodePng(bytes);
    fail(decoded.w === 48 && decoded.h === 48, `${file}: expected direct 48px RGBA`);
    let occupied = 0;
    const visible = Uint8Array.from(decoded.pixels);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const offset = (y * 48 + x) * 4;
      if (!decoded.pixels[offset + 3]) { visible.fill(0, offset, offset + 4); continue; }
      occupied++;
      fail(x > 0 && x < 47 && y > 0 && y < 47, `${file}: silhouette touches frame border`);
    }
    fail(occupied > 0, `${file}: empty silhouette`);
    return { pixels: decoded.pixels, pixelHash: hash(decoded.pixels), visibleHash: hash(visible), bytes: bytes.length, sha256: hash(bytes) };
  };
  const expected = new Map();
  for (const [clip, count] of Object.entries(clips)) for (const direction of directions) for (let frame = 0; frame < count; frame++)
    expected.set(`${clip}/${direction}/${frame}`, `${clip}-${pad(direction)}-${pad(frame)}.png`);
  fail(Array.isArray(report.frames) && report.frames.length === expected.size, 'Expected exactly 36 motion frames');
  const seen = new Set(), frames = [], neutral = new Map(), animated = new Map();
  for (const row of report.frames) {
    const key = `${row.clip}/${row.direction}/${row.frame}`;
    fail(typeof row.clip === 'string' && typeof row.direction === 'number' && typeof row.frame === 'number' && expected.has(key) && !seen.has(key) &&
      row.file === expected.get(key), 'Missing, duplicate or invalid motion frame key/file');
    seen.add(key);
    fail(boundedDelta(row.resetMaxDelta), `${row.file}: reset transform drift`);
    verifyAttachments(row.attachmentMatrices, row.file);
    const decoded = png(row.file);
    if (row.clip === 'stand') neutral.set(row.direction, decoded.pixels);
    else {
      const group = `${row.clip}/${row.direction}`;
      if (!animated.has(group)) animated.set(group, new Set());
      animated.get(group).add(decoded.visibleHash);
    }
    frames.push({ file: row.file, pixelHash: decoded.pixelHash, visibleHash: decoded.visibleHash, bytes: decoded.bytes, sha256: decoded.sha256 });
  }
  for (const [group, hashes] of animated) fail(hashes.size >= 3, `${group}: fewer than three distinct visible poses`);
  fail(Array.isArray(report.resets) && report.resets.length === 4, 'Expected four neutral reset frames');
  const resetSeen = new Set();
  for (const row of report.resets) {
    fail(directions.includes(row.direction) && !resetSeen.has(row.direction) && row.file === `reset-${pad(row.direction)}.png`,
      'Missing, duplicate or invalid reset frame');
    resetSeen.add(row.direction);
    fail(boundedDelta(row.maxMatrixDelta), `${row.file}: neutral matrix drift`);
    verifyAttachments(row.attachmentMatrices, row.file);
    const decoded = png(row.file), baseline = neutral.get(row.direction);
    fail(decoded.pixels.every((value, index) => value === baseline[index]), `${row.file}: neutral RGBA changed after motion`);
  }
  const neutralComparison = checkLookdev(root, true);
  for (const direction of directions) {
    const file = `game-${pad(direction)}.png`, decoded = png(file), baseline = neutral.get(direction);
    fail(decoded.pixels.every((value, index) => value === baseline[index]), `${file}: neutral comparison copy differs from motion stand`);
  }
  return { status: 'PASS', scope: '36-frame articulated proof and 4 exact neutral returns; not visual/runtime acceptance',
    geometryCount: owners.size, jointCount: joints.size, attachmentCount: attachments.size, neutralComparison, frames };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(checkHeroMotion(process.argv[2] ?? resolve(workspace, '.planning/art-concepts/hero-motion')), null, 2));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
