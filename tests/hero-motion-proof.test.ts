import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

// Synthetic protocol fixtures test rejection of damaged proof data, not actual motion quality.
const game = resolve(import.meta.dirname, '..');
const workspace = resolve(game, '..');
const temporary = resolve(workspace, '.planning/tooling/motion-checker-tests');
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const pad = (n: number) => String(n).padStart(2, '0');

function chunk(name: string, bytes: Buffer): Buffer {
  const data = Buffer.concat([Buffer.from(name), bytes]);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, data, checksum]);
}

function png(phase: number, corruptReset = false, hiddenColor = 0): Buffer {
  const raw = Buffer.alloc((48 * 4 + 1) * 48);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const offset = y * 193 + 1 + x * 4;
    raw[offset] = hiddenColor;
    if (x < 19 || x > 28 + phase || y < 10 || y > 40) continue;
    raw[offset] = 90 + phase * 20; raw[offset + 1] = 120;
    raw[offset + 2] = 150; raw[offset + 3] = 255;
  }
  if (corruptReset) raw[24 * 193 + 1 + 24 * 4]++;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(48, 0); header.writeUInt32BE(48, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const attachmentMatrices = () => ['sword', 'shield'].map((object) => ({ object, local: [...identity] }));
function fixture(root: string) {
  const frames = Object.entries({ stand: 1, walk: 4, attack: 4 }).flatMap(([clip, count]) =>
    [0, 4, 8, 12].flatMap((direction) => Array.from({ length: count }, (_, frame) => {
      const file = `${clip}-${pad(direction)}-${pad(frame)}.png`;
      writeFileSync(resolve(root, file), png(direction / 4 + frame));
      return { clip, direction, frame, file, resetMaxDelta: 0, attachmentMatrices: attachmentMatrices() };
    })));
  const resets = [0, 4, 8, 12].map((direction) => {
    const file = `reset-${pad(direction)}.png`;
    writeFileSync(resolve(root, file), png(direction / 4));
    writeFileSync(resolve(root, `game-${pad(direction)}.png`), png(direction / 4));
    return { direction, file, maxMatrixDelta: 0, attachmentMatrices: attachmentMatrices() };
  });
  writeFileSync(resolve(root, 'render-report.json'), JSON.stringify({ game_proof: {
    cell: [48, 48], anchor: [0.5, 0.85], directions: [0, 4, 8, 12],
    camera: { location: [0, -6, 5.2], shift_y: 0.35, ortho_scale: 3 },
    files: [0, 4, 8, 12].map((direction) => `game-${pad(direction)}.png`),
  } }));
  return {
    version: 1, cell: [48, 48], anchor: [0.5, 0.85], directions: [0, 4, 8, 12], clips: { stand: 1, walk: 4, attack: 4 },
    camera: { location: [0, -6, 5.2], shift_y: 0.35, ortho_scale: 3 }, modelScale: 1.15, matrixOrder: 'row-major',
    jointIds: ['root', 'pelvis', 'chest', 'neck', 'head',
      ...['L', 'R'].flatMap((side) => ['upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot'].map((name) => `${name}.${side}`))],
    geometryOwners: [{ object: 'sword', owner: 'hand.L' }, { object: 'shield', owner: 'hand.R' }],
    geometryCount: 2, unboundCount: 0, multiplyBoundCount: 0,
    attachments: ['sword', 'shield'].map((object, index) => ({ object, parent: `hand.${index ? 'R' : 'L'}`, role: object, restLocal: [...identity] })),
    sources: ['tools/hero-lookdev.py', 'tools/hero-motion.py', 'docs/HERO-MOTION-SCHEMA.md'].map((name) => {
      const file = resolve(game, name);
      return { file, sha256: hash(readFileSync(file)) };
    }),
    checks: { binding: true, reset: true, attachments: true, coverage: true }, frames, resets,
  };
}

describe('articulated proof rejection gate', () => {
  let root: string;
  let report: ReturnType<typeof fixture>;
  beforeEach(() => {
    mkdirSync(temporary, { recursive: true });
    root = mkdtempSync(resolve(temporary, 'case-'));
    report = fixture(root);
  });
  afterEach(() => {
    if (root) {
      const target = resolve(root), allowed = resolve(temporary) + sep;
      if (!target.startsWith(allowed)) throw Error('Fixture cleanup escaped its workspace directory');
      rmSync(target, { recursive: true, force: true });
    }
  });
  const run = () => {
    writeFileSync(resolve(root, 'motion-report.json'), JSON.stringify(report));
    return spawnSync(process.execPath, [resolve(game, 'tools/check-hero-motion.mjs'), root], { encoding: 'utf8' });
  };
  it('accepts a complete synthetic protocol fixture', () => {
    const result = run();
    expect(result.stderr).toBe(''); expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).frames).toHaveLength(36);
  });
  it('accepts equivalent JSON clip keys in a different order', () => {
    report.clips = { attack: 4, stand: 1, walk: 4 };
    const result = run(); expect(result.status).toBe(0);
  });
  it('rejects a missing non-neutral attack frame', () => {
    unlinkSync(resolve(root, 'attack-04-02.png'));
    const result = run(); expect(result.status).toBe(1); expect(result.stderr).toContain('attack-04-02.png');
  });
  it('rejects a duplicate key even when the row count stays 36', () => {
    report.frames[7] = structuredClone(report.frames[6]);
    const result = run(); expect(result.status).toBe(1); expect(result.stderr).toContain('duplicate');
  });
  it('rejects a detached sword despite true verification flags', () => {
    report.frames[20].attachmentMatrices[0].local[3] = 0.02;
    const result = run(); expect(result.status).toBe(1); expect(result.stderr).toContain('weapon detached');
  });
  it('rejects changed neutral pixels despite zero reported matrix drift', () => {
    writeFileSync(resolve(root, 'reset-08.png'), png(2, true));
    const result = run(); expect(result.status).toBe(1); expect(result.stderr).toContain('neutral RGBA changed');
  });
  it('rejects reported unbound geometry', () => {
    report.unboundCount = 1;
    const result = run(); expect(result.status).toBe(1); expect(result.stderr).toContain('unbound');
  });
  it('ignores invisible RGB changes when checking distinct poses', () => {
    for (let frame = 0; frame < 4; frame++) writeFileSync(resolve(root, `walk-04-${pad(frame)}.png`), png(1, false, frame));
    const result = run(); expect(result.status).toBe(1); expect(result.stderr).toContain('fewer than three distinct visible poses');
  });
  it('rejects stale generator provenance', () => {
    report.sources[0].sha256 = '0'.repeat(64);
    const result = run(); expect(result.status).toBe(1); expect(result.stderr).toContain('Source changed after proof');
  });
  it('rejects neutral reference copies that do not match the actual motion stand', () => {
    writeFileSync(resolve(root, 'game-08.png'), png(2, true));
    const result = run(); expect(result.status).toBe(1); expect(result.stderr).toContain('neutral comparison copy differs');
  });
  it('rejects four identical cardinal views even if their neutral copies match', () => {
    for (const direction of [0, 4, 8, 12]) for (const file of [
      `stand-${pad(direction)}-00.png`, `reset-${pad(direction)}.png`, `game-${pad(direction)}.png`,
    ]) writeFileSync(resolve(root, file), png(0));
    const result = run(); expect(result.status).toBe(1); expect(result.stderr).toContain('Cardinal views must contain distinct');
  });
  it.skipIf(existsSync(resolve(game, 'tools/HERO-LOOKDEV.PY')))('rejects a differently cased impostor script on case-sensitive CI', () => {
    const impostor = resolve(game, 'tools/hero-motion.PY');
    if (existsSync(impostor)) throw Error('Refusing to overwrite an existing source file');
    writeFileSync(impostor, '# synthetic impostor, not the canonical generator\n');
    try {
      report.sources[1] = { file: impostor, sha256: hash(readFileSync(impostor)) };
      const result = run(); expect(result.status).toBe(1); expect(result.stderr).toContain('Missing source record');
    } finally {
      unlinkSync(impostor);
    }
  });
});

// Construct a geometric two-link gait, rather than storing expected checker results.
// Each leg has two 0.8-unit rigid segments. Stance travels backward relative
// to the sprite; virtual forward travel cancels it. Swing clears the ground.
function locomotionFixture(root: string) {
  const base = fixture(root);
  const rotate = (v: number[], d: number) => {
    const a = -d * Math.PI / 8;
    return [Math.cos(a) * v[0] - Math.sin(a) * v[1], Math.sin(a) * v[0] + Math.cos(a) * v[1], v[2]];
  };
  const matrixAt = (v: number[]) => { const m = [...identity]; m[3] = v[0]; m[7] = v[1]; m[11] = v[2]; return m; };
  const footAt = (side: string, phase: number, d: number) => {
    const x = side === 'L' ? -0.15 : 0.15;
    const stance = side === 'R' ? phase <= 4 : phase >= 4;
    const y = side === 'R' ? (phase <= 4 ? phase * 0.05 : (8 - phase) * 0.05) : (phase >= 4 ? (phase - 8) * 0.05 : -phase * 0.05);
    const z = stance ? 0 : 0.08 * Math.sin(Math.PI * (phase % 4) / 4);
    const hip = [x, 0, 1.2], ankle = [x, y, z];
    const axis = ankle.map((v, i) => v - hip[i]), length = Math.hypot(...axis), unit = axis.map((v) => v / length);
    const dot = -unit[1], projected = unit.map((v, i) => (i === 1 ? -1 : 0) - v * dot);
    const poleLength = Math.hypot(...projected), height = Math.sqrt(0.8 ** 2 - (length / 2) ** 2);
    const knee = hip.map((v, i) => v + axis[i] / 2 + projected[i] / poleLength * height);
    return { ankleWorld: rotate(ankle, d), soleZ: z, orientationWorld: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      hipWorld: rotate(hip, d), kneeWorld: rotate(knee, d), targetWorld: rotate(ankle, d), poleWorld: rotate([0, -1, 0], d) };
  };
  const frames = Object.entries({ stand: 1, walk: 8, attack: 4 }).flatMap(([clip, count]) =>
    [0, 4, 8, 12].flatMap((direction) => Array.from({ length: count }, (_, frame) => {
      const file = `${clip}-${pad(direction)}-${pad(frame)}.png`;
      writeFileSync(resolve(root, file), png(direction / 4 + frame));
      return { clip, direction, frame, file, resetMaxDelta: 0, attachmentMatrices: attachmentMatrices() };
    })));
  return { ...base, version: 2, clips: { stand: 1, walk: 8, attack: 4 }, frames,
    locomotion: { mode: 'rigid', forward: [0, -1, 0], stride: 0.4, liftThreshold: 0.04,
      stanceIntervals: { R: [0, 4], L: [4, 8] },
      restLegs: ['L', 'R'].map((side) => {
        const f = footAt(side, 0, 0);
        return { side, hipWorld: matrixAt(f.hipWorld), kneeWorld: matrixAt(f.kneeWorld), ankleWorld: matrixAt(f.ankleWorld) };
      }),
      samples: [0, 4, 8, 12].flatMap((direction) => Array.from({ length: 9 }, (_, phase) => ({
        direction, phase, virtualRoot: rotate([0, -0.4 * phase / 8, 0], direction),
        feet: { L: footAt('L', phase, direction), R: footAt('R', phase, direction) },
      }))),
    },
    cycles: [0, 4, 8, 12].map((direction) => {
      const file = `walk-cycle-${pad(direction)}.png`;
      writeFileSync(resolve(root, file), readFileSync(resolve(root, `walk-${pad(direction)}-00.png`)));
      return { direction, file,
        matrices: [...base.jointIds.map((id) => ({ kind: 'joint', id })), ...base.geometryOwners.map((g) => ({ kind: 'geometry', id: g.object }))]
          .map((key) => ({ ...key, start: [...identity], end: [...identity] })),
        vertices: base.geometryOwners.map(({ object }) => ({ object, startCount: 3, endCount: 3,
          startHash: hash(Buffer.alloc(72)), endHash: hash(Buffer.alloc(72)) })),
      };
    }),
  };
}

describe('stride-relative v2 proof rejection gate', () => {
  let root: string, report: ReturnType<typeof locomotionFixture>;
  beforeEach(() => {
    mkdirSync(temporary, { recursive: true }); root = mkdtempSync(resolve(temporary, 'v2-'));
    report = locomotionFixture(root);
  });
  afterEach(() => {
    if (!resolve(root).startsWith(resolve(temporary) + sep)) throw Error('Fixture cleanup escaped its workspace directory');
    rmSync(root, { recursive: true, force: true });
  });
  const run = () => {
    writeFileSync(resolve(root, 'motion-report.json'), JSON.stringify(report));
    return spawnSync(process.execPath, [resolve(game, 'tools/check-hero-motion.mjs'), root], { encoding: 'utf8' });
  };
  const rejected = (message: string) => { const result = run(); expect(result.status, result.stdout).toBe(1); expect(result.stderr).toContain(message); };
  const moveStance = () => {
    const f = report.locomotion.samples[2].feet.R;
    for (const key of ['ankleWorld', 'targetWorld', 'hipWorld', 'kneeWorld'] as const) f[key][0] += 0.02;
  };
  it('accepts a complete gait and reports recomputed plant traces and lengths', () => {
    const result = run(); expect(result.stderr).toBe(''); expect(result.status).toBe(0);
    const evidence = JSON.parse(result.stdout);
    expect(evidence.frames).toHaveLength(52); expect(evidence.locomotion.traces).toHaveLength(40);
    expect(evidence.locomotion.restLengths.L[0]).toBeCloseTo(0.8, 12);
    expect(evidence.locomotion.maxPlantDrift).toBeLessThan(1e-12);
  });
  it('rejects a displaced stance ankle with valid segment lengths and targets', () => { moveStance(); rejected('stance ankle drift'); });
  it('rejects displacement despite a forged zero drift summary', () => {
    moveStance(); Object.assign(report.locomotion, { maxDrift: 0, maxPlantDrift: 0 }); rejected('stance ankle drift');
  });
  it('rejects direction00 phase8 right-leg translation despite unchanged cycle matrices and PNGs', () => {
    const endpoint = report.locomotion.samples.find((sample) => sample.direction === 0 && sample.phase === 8)!;
    for (const key of ['hipWorld', 'kneeWorld', 'ankleWorld', 'targetWorld'] as const) endpoint.feet.R[key][0] += 0.004;
    // No cycle/PNG/travel edits: lengths, reach, residual and R stance0..4 remain valid.
    rejected('0/R: cycle endpoint ankleWorld mismatch');
  });
  it('rejects direction12 phase0 left-leg translation outside its stance interval', () => {
    const endpoint = report.locomotion.samples.find((sample) => sample.direction === 12 && sample.phase === 0)!;
    for (const key of ['hipWorld', 'kneeWorld', 'ankleWorld', 'targetWorld'] as const) endpoint.feet.L[key][0] += 0.004;
    rejected('12/L: cycle endpoint ankleWorld mismatch');
  });
  it('rejects phase8 sole height mismatch outside the right-foot stance interval', () => {
    report.locomotion.samples[8].feet.R.soleZ += 0.004;
    rejected('0/R: cycle endpoint soleZ mismatch');
  });
  it('rejects phase8 foot orientation mismatch outside the right-foot stance interval', () => {
    const a = 0.004;
    report.locomotion.samples[8].feet.R.orientationWorld = [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
    rejected('0/R: cycle endpoint orientationWorld mismatch');
  });
  it('rejects virtual travel with the wrong direction', () => { report.locomotion.samples[2].virtualRoot[1] *= -1; rejected('wrong virtual root travel'); });
  it('rejects virtual travel with the wrong phase magnitude', () => { report.locomotion.samples[2].virtualRoot[1] *= 0.5; rejected('wrong virtual root travel'); });
  it('requires a separately rendered cycle PNG', () => { unlinkSync(resolve(root, 'walk-cycle-04.png')); rejected('walk-cycle-04.png'); });
  it('rejects changed cycle RGBA including hidden RGB', () => { writeFileSync(resolve(root, 'walk-cycle-04.png'), png(1, false, 19)); rejected('cycle RGBA changed'); });
  it('rejects a v1 clip profile declared as v2', () => { report.clips.walk = 4; rejected('clip counts'); });
  it('rejects missing v2 frame rows', () => { report.frames.pop(); rejected('52 motion frames'); });
  it('rejects stretched posed segments', () => { report.locomotion.samples[2].feet.R.kneeWorld[2] += 0.02; rejected('IK segment length'); });
  it('derives lengths from rest matrices instead of accepting reported lengths', () => {
    report.locomotion.restLegs[0].hipWorld[11] += 0.03;
    Object.assign(report.locomotion, { lengths: { L: [0.8, 0.8] } }); rejected('IK segment length');
  });
  it('rejects a wrong bend with exact segment lengths and a reachable target', () => {
    const f = report.locomotion.samples[0].feet.R; f.kneeWorld[1] *= -1; rejected('wrong knee bend');
  });
  it('rejects the wrong pole declaration', () => { report.locomotion.samples[0].feet.R.poleWorld[1] = 1; rejected('wrong forward pole'); });
  it('rejects target residual even with valid actual chain lengths', () => { report.locomotion.samples[2].feet.R.targetWorld[0] += 0.02; rejected('IK target residual'); });
  it('rejects a nonstraight chain parallel to the pole despite valid lengths', () => {
    const f = report.locomotion.samples[2].feet.R, a = f.ankleWorld;
    f.hipWorld = [a[0], a[1] + 1.2, a[2]];
    f.kneeWorld = [a[0] + Math.sqrt(0.8 ** 2 - 0.6 ** 2), a[1] + 0.6, a[2]];
    rejected('IK pole singularity');
  });
  it('rejects folded chains even though their lengths and zero target residual pass', () => {
    const f = report.locomotion.samples[2].feet.R, a = f.ankleWorld;
    f.hipWorld = [...a]; f.kneeWorld = [a[0], a[1], a[2] + 0.8]; rejected('folded IK singularity');
  });
  it('allows a straight chain when lengths and reach are valid', () => {
    const f = report.locomotion.samples[2].feet.R, a = f.ankleWorld;
    f.hipWorld = [a[0], a[1], a[2] + 1.6]; f.kneeWorld = [a[0], a[1], a[2] + 0.8];
    const result = run(); expect(result.stderr).toBe(''); expect(result.status).toBe(0);
  });
  it('rejects unreachable targets', () => { report.locomotion.samples[2].feet.R.targetWorld[2] = 5; rejected('outside reach'); });
  it('rejects zero stride', () => { report.locomotion.stride = 0; rejected('positive stride'); });
  it('rejects null raw coordinates', () => { Object.assign(report.locomotion.samples[0].feet.R, { ankleWorld: null }); rejected('invalid evaluated foot'); });
  it('rejects absent lifted swing samples', () => {
    for (const sample of report.locomotion.samples) if ([1, 2, 3].includes(sample.phase)) sample.feet.L.soleZ = 0;
    rejected('insufficient swing lift');
  });
  it('rejects a nonzero local cycle delta even with an identical tiny PNG', () => { report.cycles[0].matrices[0].end[3] = 0.02; rejected('raw local matrix mismatch'); });
  it('requires all joints and geometry in the cycle matrix keyset', () => { report.cycles[0].matrices.pop(); rejected('matrix keyset'); });
  it('rejects duplicate cycle matrix keys', () => { report.cycles[0].matrices[1] = structuredClone(report.cycles[0].matrices[0]); rejected('matrix keyset'); });
  it('rejects changed evaluated vertex hashes', () => { report.cycles[0].vertices[0].endHash = '1'.repeat(64); rejected('evaluated vertex mismatch'); });
  it('requires the complete evaluated geometry vertex keyset', () => { report.cycles[0].vertices.pop(); rejected('vertex keyset'); });
  it('rejects changed evaluated vertex counts', () => { report.cycles[0].vertices[0].endCount++; rejected('evaluated vertex mismatch'); });
  it('rejects missing phases even if a duplicate keeps the count unchanged', () => {
    report.locomotion.samples[1] = structuredClone(report.locomotion.samples[0]); rejected('duplicate locomotion sample');
  });
  it('rejects a stale public protocol hash', () => { report.sources[2].sha256 = '0'.repeat(64); rejected('Source changed after proof'); });
  it('requires actual protocol identity even when another current file hashes correctly', () => {
    const file = resolve(game, 'docs/HERO-MOTION.md');
    report.sources[2] = { file, sha256: hash(readFileSync(file)) }; rejected('Missing source record');
  });
  it('rejects stance sole drift', () => { report.locomotion.samples[2].feet.R.soleZ += 0.02; rejected('stance sole drift'); });
  it('rejects stance foot rotation despite a fixed ankle', () => {
    report.locomotion.samples[2].feet.R.orientationWorld = [0, -1, 0, 1, 0, 0, 0, 0, 1]; rejected('stance orientation drift');
  });
});
