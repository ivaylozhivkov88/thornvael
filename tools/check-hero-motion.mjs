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
  fail([1, 2].includes(report.version) && exact(report.cell, [48, 48]) && exact(report.anchor, [0.5, 0.85]), 'Wrong motion proof version/cell/anchor');
  const profile = report.version === 2 ? { stand: 1, walk: 8, attack: 4 } : clips;
  fail(exact(report.directions, directions) && sameFields(report.clips, profile), 'Wrong motion directions or clip counts');
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
  for (const [clip, count] of Object.entries(profile)) for (const direction of directions) for (let frame = 0; frame < count; frame++)
    expected.set(`${clip}/${direction}/${frame}`, `${clip}-${pad(direction)}-${pad(frame)}.png`);
  fail(Array.isArray(report.frames) && report.frames.length === expected.size, `Expected exactly ${expected.size} motion frames`);
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
  const locomotion = report.version === 2 ? checkLocomotion(report, png, joints, owners) : undefined;
  return { status: 'PASS', scope: `${expected.size}-frame articulated proof and 4 exact neutral returns; not visual/runtime acceptance`,
    geometryCount: owners.size, jointCount: joints.size, attachmentCount: attachments.size, neutralComparison, frames,
    ...(locomotion ? { locomotion } : {}) };
}

// V2 evidence is independently recomputed; summaries/verification booleans are not inputs.
function checkLocomotion(report, png, joints, owners) {
  const vec = (v, n = 3) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const norm = (a) => Math.hypot(...a);
  const distance = (a, b) => norm(sub(a, b));
  const near = (a, b) => distance(a, b) <= epsilon;
  const affine = (m) => matrix(m) && exact(m.slice(12), [0, 0, 0, 1]);
  const translation = (m) => [m[3], m[7], m[11]];
  const forward = (d) => {
    const angle = -d * Math.PI / 8;
    return [Math.sin(angle), -Math.cos(angle), 0];
  };
  const rotation = (m) => {
    if (!vec(m, 9)) return false;
    const rows = [m.slice(0, 3), m.slice(3, 6), m.slice(6, 9)];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      if (Math.abs(dot(rows[i], rows[j]) - (i === j ? 1 : 0)) > epsilon) return false;
    const determinant = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    return Math.abs(determinant - 1) <= epsilon;
  };
  const data = report.locomotion;
  fail(data?.mode === 'rigid' && exact(data.forward, [0, -1, 0]), 'Locomotion requires rigid mode and declared model forward');
  fail(Number.isFinite(data.stride) && data.stride > 0 && Number.isFinite(data.liftThreshold) && data.liftThreshold >= 0.01,
    'Locomotion requires positive stride and liftThreshold >= 0.01');
  fail(data.stanceIntervals && Object.keys(data.stanceIntervals).length === 2 && exact(data.stanceIntervals.R, [0, 4]) && exact(data.stanceIntervals.L, [4, 8]),
    'Wrong stance intervals');
  fail(Array.isArray(data.restLegs) && data.restLegs.length === 2, 'Missing rest leg matrices');
  const lengths = new Map();
  for (const rest of data.restLegs) {
    fail(['L', 'R'].includes(rest.side) && !lengths.has(rest.side) && [rest.hipWorld, rest.kneeWorld, rest.ankleWorld].every(affine), 'Invalid rest leg matrices');
    const l1 = distance(translation(rest.hipWorld), translation(rest.kneeWorld));
    const l2 = distance(translation(rest.kneeWorld), translation(rest.ankleWorld));
    fail(l1 > epsilon && l2 > epsilon, 'Degenerate rest leg length');
    lengths.set(rest.side, [l1, l2]);
  }
  fail(Array.isArray(data.samples) && data.samples.length === 36, 'Expected 36 locomotion samples');
  const samples = new Map();
  let maxLengthError = 0, maxResidual = 0;
  for (const sample of data.samples) {
    const { direction, phase } = sample, key = `${direction}/${phase}`;
    fail(directions.includes(direction) && Number.isInteger(phase) && phase >= 0 && phase <= 8 && !samples.has(key), 'Invalid or duplicate locomotion sample');
    samples.set(key, sample);
    const pole = forward(direction), travel = pole.map((v) => v * data.stride * phase / 8);
    fail(vec(sample.virtualRoot) && near(sample.virtualRoot, travel), `${key}: wrong virtual root travel`);
    fail(sample.feet && exact(Object.keys(sample.feet).sort(), ['L', 'R']), `${key}: incomplete feet`);
    for (const side of ['L', 'R']) {
      const foot = sample.feet[side], context = `${key}/${side}`;
      fail(foot && ['ankleWorld', 'hipWorld', 'kneeWorld', 'targetWorld', 'poleWorld'].every((field) => vec(foot[field])) &&
        Number.isFinite(foot.soleZ) && rotation(foot.orientationWorld), `${context}: invalid evaluated foot data`);
      fail(near(foot.poleWorld, pole), `${context}: wrong forward pole`);
      const [l1, l2] = lengths.get(side);
      const errors = [Math.abs(distance(foot.hipWorld, foot.kneeWorld) - l1), Math.abs(distance(foot.kneeWorld, foot.ankleWorld) - l2)];
      maxLengthError = Math.max(maxLengthError, ...errors);
      fail(errors.every((v) => v <= epsilon), `${context}: IK segment length differs from rest`);
      const reach = distance(foot.hipWorld, foot.targetWorld);
      fail(reach >= Math.abs(l1 - l2) - epsilon && reach <= l1 + l2 + epsilon, `${context}: IK target outside reach`);
      const residual = distance(foot.ankleWorld, foot.targetWorld);
      maxResidual = Math.max(maxResidual, residual);
      fail(residual <= epsilon, `${context}: IK target residual`);
      const axis = sub(foot.ankleWorld, foot.hipWorld), axisLength = norm(axis);
      fail(axisLength > epsilon, `${context}: folded IK singularity`);
      const unit = axis.map((v) => v / axisLength);
      const perpendicular = (v) => sub(v, unit.map((c) => c * dot(v, unit)));
      const kneeOffset = perpendicular(sub(foot.kneeWorld, foot.hipWorld)), offsetLength = norm(kneeOffset);
      const projectedPole = perpendicular(pole), poleLength = norm(projectedPole);
      if (offsetLength > epsilon) {
        fail(poleLength > epsilon, `${context}: IK pole singularity`);
        fail(dot(kneeOffset, projectedPole.map((v) => v / poleLength)) >= -epsilon, `${context}: wrong knee bend`);
      }
    }
  }
  // Raw evaluated endpoints must repeat before virtual travel. Cycle-local
  // matrices/PNGs alone cannot establish consistency with the foot sample rows.
  for (const direction of directions) for (const side of ['L', 'R']) {
    const start = samples.get(`${direction}/0`).feet[side];
    const end = samples.get(`${direction}/8`).feet[side];
    for (const field of ['ankleWorld', 'hipWorld', 'kneeWorld', 'targetWorld', 'soleZ', 'orientationWorld', 'poleWorld']) {
      const equal = field === 'soleZ' ? Math.abs(start[field] - end[field]) <= epsilon :
        start[field].every((value, index) => Math.abs(value - end[field][index]) <= epsilon);
      fail(equal, `${direction}/${side}: cycle endpoint ${field} mismatch`);
    }
  }
  const traces = [];
  let maxPlantDrift = 0, maxSoleDrift = 0, maxOrientationDrift = 0;
  for (const direction of directions) for (const side of ['L', 'R']) {
    const [start, end] = data.stanceIntervals[side];
    const base = samples.get(`${direction}/${start}`), baseFoot = base.feet[side];
    const worldXY = (sample) => sample.feet[side].ankleWorld.slice(0, 2).map((v, i) => v + sample.virtualRoot[i]);
    for (let phase = start; phase <= end; phase++) {
      const sample = samples.get(`${direction}/${phase}`), foot = sample.feet[side];
      const drift = distance(worldXY(sample), worldXY(base));
      const soleDrift = Math.abs(foot.soleZ - baseFoot.soleZ);
      const angularDrift = Math.max(...foot.orientationWorld.map((v, i) => Math.abs(v - baseFoot.orientationWorld[i])));
      maxPlantDrift = Math.max(maxPlantDrift, drift); maxSoleDrift = Math.max(maxSoleDrift, soleDrift);
      maxOrientationDrift = Math.max(maxOrientationDrift, angularDrift);
      fail(drift <= epsilon, `${direction}/${phase}/${side}: stance ankle drift`);
      fail(soleDrift <= epsilon, `${direction}/${phase}/${side}: stance sole drift`);
      fail(angularDrift <= epsilon, `${direction}/${phase}/${side}: stance orientation drift`);
      traces.push({ direction, phase, side, virtualAnkleXY: worldXY(sample), soleZ: foot.soleZ, drift });
    }
    const swing = side === 'L' ? [1, 2, 3] : [5, 6, 7];
    const lift = Math.max(...swing.map((phase) => samples.get(`${direction}/${phase}`).feet[side].soleZ - baseFoot.soleZ));
    fail(lift >= data.liftThreshold, `${direction}/${side}: insufficient swing lift`);
  }
  fail(Array.isArray(report.cycles) && report.cycles.length === 4, 'Expected four cycle records');
  const cycleSeen = new Set(), cycleEvidence = [];
  const expectedKeys = new Set([...joints].map((id) => `joint/${id}`).concat([...owners.keys()].map((id) => `geometry/${id}`)));
  for (const cycle of report.cycles) {
    fail(directions.includes(cycle.direction) && !cycleSeen.has(cycle.direction) && cycle.file === `walk-cycle-${pad(cycle.direction)}.png`, 'Invalid or duplicate cycle record');
    cycleSeen.add(cycle.direction);
    fail(Array.isArray(cycle.matrices) && cycle.matrices.length === expectedKeys.size, 'Incomplete cycle matrix keyset');
    const seen = new Set(); let maxMatrixDelta = 0;
    for (const pair of cycle.matrices) {
      const key = `${pair.kind}/${pair.id}`;
      fail(expectedKeys.has(key) && !seen.has(key) && affine(pair.start) && affine(pair.end), 'Invalid cycle matrix keyset or raw matrix');
      seen.add(key);
      maxMatrixDelta = Math.max(maxMatrixDelta, ...pair.start.map((v, i) => Math.abs(v - pair.end[i])));
    }
    fail(maxMatrixDelta <= epsilon, 'Cycle raw local matrix mismatch');
    fail(Array.isArray(cycle.vertices) && cycle.vertices.length === owners.size, 'Incomplete cycle vertex keyset');
    const vertexSeen = new Set();
    for (const pair of cycle.vertices) {
      fail(owners.has(pair.object) && !vertexSeen.has(pair.object), 'Invalid cycle vertex keyset'); vertexSeen.add(pair.object);
      fail(Number.isInteger(pair.startCount) && pair.startCount > 0 && pair.startCount === pair.endCount &&
        typeof pair.startHash === 'string' && /^[a-f0-9]{64}$/.test(pair.startHash) && pair.startHash === pair.endHash, 'Cycle evaluated vertex mismatch');
    }
    const decoded = png(cycle.file), start = png(`walk-${pad(cycle.direction)}-00.png`);
    fail(decoded.pixels.every((v, i) => v === start.pixels[i]), `${cycle.file}: cycle RGBA changed`);
    cycleEvidence.push({ direction: cycle.direction, maxMatrixDelta, pixelHash: decoded.pixelHash, matrixCount: seen.size, geometryCount: vertexSeen.size });
  }
  return { stride: data.stride, liftThreshold: data.liftThreshold, restLengths: Object.fromEntries(lengths),
    maxPlantDrift, maxSoleDrift, maxOrientationDrift, maxLengthError, maxResidual, traces, cycles: cycleEvidence };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(checkHeroMotion(process.argv[2] ?? resolve(workspace, '.planning/art-concepts/hero-motion')), null, 2));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
