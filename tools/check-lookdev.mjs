// Geometry-readability evidence for an isolated model study, not an atlas or art-quality approval.
import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { decodePng } from './check-atlases.mjs';

const workspace = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const inside = (path) => {
  const rel = relative(workspace, path);
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel))
    throw Error('Lookdev evidence must remain in the project workspace');
  return path;
};

export function checkLookdev(directory) {
  const root = inside(resolve(directory));
  const report = JSON.parse(readFileSync(resolve(root, 'render-report.json'), 'utf8'));
  const proof = report.game_proof;
  const expectedDirections = [0, 4, 8, 12];
  const names = expectedDirections.map((dir) => `game-${String(dir).padStart(2, '0')}.png`);
  const exact = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!proof || !exact(proof.cell, [48, 48]) || !exact(proof.anchor, [0.5, 0.85]) ||
      !exact(proof.directions, expectedDirections) || !exact(proof.files, names))
    throw Error('Expected four direct 48px cardinal renders with the feet anchor');
  if (!exact(proof.camera?.location, [0, -6, 5.2]) || proof.camera.shift_y !== 0.35 || proof.camera.ortho_scale !== 3)
    throw Error('Game proof must use the production camera convention');
  const frames = names.map((name) => {
    if (basename(name) !== name) throw Error('Invalid proof basename');
    const bytes = readFileSync(inside(resolve(root, name)));
    const { w, h, pixels } = decodePng(bytes);
    if (w !== 48 || h !== 48) throw Error(`${name}: expected 48x48 RGBA`);
    let left = w, right = -1, top = h, bottom = -1, count = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const alpha = pixels[(y * w + x) * 4 + 3];
      if (alpha && (x === 0 || x === w - 1 || y === 0 || y === h - 1))
        throw Error(`${name}: silhouette touches frame edge`);
      if (alpha <= 128) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
    }
    if (count < 100 || bottom - top + 1 < 24 || bottom - top + 1 > 36)
      throw Error(`${name}: empty or unreadable subject (${count} solid pixels, height ${bottom - top + 1})`);
    return { name, bytes: bytes.length, bbox: [left, top, right, bottom], solidPixels: count,
      logicalHeightAt64: (bottom - top + 1) * 64 / h,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      pixelHash: createHash('sha256').update(pixels).digest('hex') };
  });
  if (new Set(frames.map((frame) => frame.pixelHash)).size !== 4)
    throw Error('Cardinal views must contain distinct rendered pixels');
  return { status: 'PASS', scope: 'Four static game-size readability proofs; not rig/atlas/final-art acceptance', frames };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(checkLookdev(process.argv[2] ?? resolve(workspace, '.planning/art-concepts/hero-lookdev-v2')), null, 2));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
