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
