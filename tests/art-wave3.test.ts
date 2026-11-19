import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MAX_BINARY_BYTES = 3 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

interface PixiAtlas {
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number };
      sourceSize: { w: number; h: number };
      spriteSourceSize: { x: number; y: number; w: number; h: number };
      rotated: boolean;
      trimmed: boolean;
      anchor: { x: number; y: number };
    }
  >;
  meta: {
    app: string;
    image: string;
    format: string;
    size: { w: number; h: number };
  };
}

interface Manifest {
  assets: Array<{ path: string; license: string; source: string; note: string }>;
}

const manifest: Manifest = JSON.parse(readFileSync(resolve(ROOT, 'assets.json'), 'utf8'));
const assetByPath = new Map(manifest.assets.map((entry) => [entry.path, entry]));

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function assertRegisteredPng(relPath: string): void {
  const full = resolve(ROOT, relPath);
  expect(existsSync(full), `Missing PNG: ${relPath}`).toBe(true);
  const size = statSync(full).size;
  expect(size, `Empty PNG: ${relPath}`).toBeGreaterThan(0);
  expect(size, `PNG exceeds 3 MiB: ${relPath}`).toBeLessThan(MAX_BINARY_BYTES);

  const header = readFileSync(full).subarray(0, 8);
  expect(header.equals(PNG_MAGIC), `Invalid PNG signature: ${relPath}`).toBe(true);

  const entry = assetByPath.get(relPath);
  expect(entry, `Missing assets.json entry for ${relPath}`).toBeDefined();
  expect(entry?.license).toBe('own');
  expect(entry?.source.length).toBeGreaterThan(0);
  expect(entry?.note.length).toBeGreaterThan(0);
}

function validateWave3Atlas(stem: string, expectedFrames: string[]): void {
  const jsonRel = `public/art-wave3/${stem}.json`;
  const pngRel = `public/art-wave3/${stem}.png`;
  assertRegisteredPng(pngRel);

  const raw = readFileSync(resolve(ROOT, jsonRel), 'utf8');
  const atlas = JSON.parse(raw) as PixiAtlas;
  expect(atlas.meta.image).toBe(`${stem}.png`);
  expect(atlas.meta.format).toBe('RGBA8888');
  expect(atlas.meta.size.w).toBeGreaterThan(0);
  expect(atlas.meta.size.h).toBeGreaterThan(0);

  for (const key of expectedFrames) {
    expect(atlas.frames[key], `Missing frame "${key}" in ${jsonRel}`).toBeDefined();
  }

  const rects: Array<{ key: string; x: number; y: number; w: number; h: number }> = [];
  for (const [key, entry] of Object.entries(atlas.frames)) {
    const { x, y, w, h } = entry.frame;
    expect(w, `${key} width`).toBeGreaterThan(0);
    expect(h, `${key} height`).toBeGreaterThan(0);
    expect(x, `${key} x`).toBeGreaterThanOrEqual(0);
    expect(y, `${key} y`).toBeGreaterThanOrEqual(0);
    expect(x + w, `${key} exceeds atlas width`).toBeLessThanOrEqual(atlas.meta.size.w);
    expect(y + h, `${key} exceeds atlas height`).toBeLessThanOrEqual(atlas.meta.size.h);
    expect(entry.rotated, `${key} rotated`).toBe(false);
    expect(entry.trimmed, `${key} trimmed`).toBe(false);
    expect(entry.anchor, `${key} missing anchor`).toBeDefined();
    expect(entry.anchor.x).toBeGreaterThanOrEqual(0);
    expect(entry.anchor.x).toBeLessThanOrEqual(1);
    expect(entry.anchor.y).toBeGreaterThanOrEqual(0);
    expect(entry.anchor.y).toBeLessThanOrEqual(1);
    rects.push({ key, x, y, w, h });
  }

  // Ensure shelf packing has zero overlapping frames.
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i];
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j];
      const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlaps, `Overlapping frames ${a.key} and ${b.key} in ${jsonRel}`).toBe(false);
    }
  }
}

describe('wave-3 art packs & base itemicon coverage', () => {
  it('validates env-anims atlas (torches, 3 faction banners, smoke, water-wheel, bonfire, cauldron)', () => {
    const expected: string[] = [];
    for (let i = 0; i < 6; i++) expected.push(`torch-flicker/${i}`);
    for (const faction of ['thornwatch', 'ironbound', 'conclave']) {
      for (let i = 0; i < 4; i++) expected.push(`banner/${faction}/${i}`);
    }
    for (let i = 0; i < 6; i++) expected.push(`smoke-column/${i}`);
    for (let i = 0; i < 6; i++) expected.push(`water-wheel/${i}`);
    for (let i = 0; i < 6; i++) expected.push(`bonfire/${i}`);
    for (let i = 0; i < 6; i++) expected.push(`cauldron/${i}`);
    validateWave3Atlas('env-anims', expected);
  });

  it('validates boss-telegraphs atlas (shared + morvessa, gorrathul, vesperion, ashkarath)', () => {
    const expected = [
      'ring/outer',
      'ring/fill-0',
      'ring/fill-1',
      'ring/fill-2',
      'ring/fill-3',
      'line/beam',
      'cone/arc',
    ];
    for (const boss of ['morvessa', 'gorrathul', 'vesperion', 'ashkarath']) {
      for (const shape of ['ring', 'cone', 'line', 'glyph']) {
        expected.push(`${boss}/${shape}`);
      }
    }
    validateWave3Atlas('boss-telegraphs', expected);
  });

  it('validates city-buildings atlas (4 cities x 5 building roles)', () => {
    const expected: string[] = [];
    for (const city of ['thornwick', 'redmarsh', 'oakhaven', 'ironcamp']) {
      for (const role of ['tavern', 'smithy', 'temple', 'gate', 'watchtower']) {
        expected.push(`${city}/${role}`);
      }
    }
    validateWave3Atlas('city-buildings', expected);
  });

  it('achieves 100% slug icon coverage for public/data/items.json & base-items.json without dropping baseline icons', () => {
    const itemIconsDir = resolve(ROOT, 'public/itemicons');
    const existingManifest = JSON.parse(readFileSync(resolve(itemIconsDir, 'manifest.json'), 'utf8')) as {
      count: number;
      ids: string[];
    };
    expect(existingManifest.count).toBe(160);
    for (const id of existingManifest.ids) {
      assertRegisteredPng(`public/itemicons/${id}.png`);
    }

    const itemsData = JSON.parse(readFileSync(resolve(ROOT, 'public/data/items.json'), 'utf8')) as {
      items: Array<{ name: string }>;
    };
    expect(itemsData.items.length).toBeGreaterThanOrEqual(187);
    for (const item of itemsData.items) {
      const slug = slugify(item.name);
      assertRegisteredPng(`public/itemicons/${slug}.png`);
    }

    const baseItems = JSON.parse(
      readFileSync(resolve(ROOT, 'public/data/content/base-items.json'), 'utf8'),
    ) as Array<{ id: string; name: string }>;
    for (const base of baseItems) {
      assertRegisteredPng(`public/itemicons/${base.id}.png`);
      assertRegisteredPng(`public/itemicons/${slugify(base.name)}.png`);
    }

    const pngCount = readdirSync(itemIconsDir).filter((f) => f.endsWith('.png')).length;
    expect(pngCount).toBeGreaterThanOrEqual(349);
  });

  it('verifies brief and integration docs exist and contain no banned names', () => {
    const brief = readFileSync(resolve(ROOT, 'tools/GEMINI-WAVE3-BRIEF.md'), 'utf8');
    const notes = readFileSync(resolve(ROOT, 'tools/INTEGRATION-NOTES-ART3.md'), 'utf8');
    expect(brief.length).toBeGreaterThan(500);
    expect(notes.length).toBeGreaterThan(500);
    const banned = [
      ['Rage of', ' Mages'],
      ['Allo', 'ds'],
      ['Niva', 'l'],
      ['Dia', 'blo'],
      ['Kur', 'ast'],
      ['Tal Ra', 'sha'],
    ].map(([a, b]) => new RegExp(a + b, 'i'));
    for (const re of banned) {
      expect(re.test(brief)).toBe(false);
      expect(re.test(notes)).toBe(false);
    }
  });
});
