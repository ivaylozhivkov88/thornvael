import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MAX_BINARY_BYTES = 3 * 1024 * 1024;

interface PixiAtlas {
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number };
      sourceSize: { w: number; h: number };
      anchor?: { x: number; y: number };
    }
  >;
  meta: {
    image: string;
    size: { w: number; h: number };
  };
}

interface Manifest {
  assets: Array<{ path: string; license: string; source: string; note: string }>;
}

const manifest: Manifest = JSON.parse(readFileSync(resolve(ROOT, 'assets.json'), 'utf8'));

function assertRegisteredBinary(relPath: string) {
  const full = resolve(ROOT, relPath);
  expect(existsSync(full), `Missing binary: ${relPath}`).toBe(true);
  const size = statSync(full).size;
  expect(size, `Empty binary: ${relPath}`).toBeGreaterThan(0);
  expect(size, `Binary exceeds 3 MiB: ${relPath}`).toBeLessThan(MAX_BINARY_BYTES);

  const entry = manifest.assets.find((a) => a.path === relPath);
  expect(entry, `Missing assets.json entry for ${relPath}`).toBeDefined();
  expect(entry?.license).toBe('own');
  expect(entry?.source.length).toBeGreaterThan(0);
  expect(entry?.note.length).toBeGreaterThan(0);
}

function validatePixiAtlas(dir: string, stem: string, expectedFrames: string[]) {
  const jsonRel = `public/${dir}/${stem}.json`;
  const pngRel = `public/${dir}/${stem}.png`;
  assertRegisteredBinary(pngRel);

  const raw = readFileSync(resolve(ROOT, jsonRel), 'utf8');
  const atlas = JSON.parse(raw) as PixiAtlas;
  expect(atlas.meta.image).toBe(`${stem}.png`);
  expect(atlas.meta.size.w).toBeGreaterThan(0);
  expect(atlas.meta.size.h).toBeGreaterThan(0);

  for (const key of expectedFrames) {
    expect(atlas.frames[key], `Missing frame "${key}" in ${jsonRel}`).toBeDefined();
  }

  for (const [key, entry] of Object.entries(atlas.frames)) {
    const { x, y, w, h } = entry.frame;
    expect(w, `${key} width`).toBeGreaterThan(0);
    expect(h, `${key} height`).toBeGreaterThan(0);
    expect(x + w, `${key} exceeds atlas width`).toBeLessThanOrEqual(atlas.meta.size.w);
    expect(y + h, `${key} exceeds atlas height`).toBeLessThanOrEqual(atlas.meta.size.h);
    expect(entry.anchor, `${key} missing anchor`).toBeDefined();
  }
}

describe('wave-2 art packs', () => {
  it('validates props-wave2 atlas and required frames', () => {
    validatePixiAtlas('props-wave2', 'props-wave2', [
      'shrines/healing',
      'shrines/war',
      'shrines/mana',
      'chests/common-closed',
      'chests/common-open',
      'chests/rare-closed',
      'chests/rare-open',
      'chests/unique-closed',
      'chests/unique-open',
      'bridges/wood-h',
      'bridges/stone-v',
      'lights/brazier',
      'lights/waystone',
      'banners/ironbound',
      'banners/thornwatch',
      'coast/shipwreck',
      'flora/mushrooms',
      'flora/reeds',
    ]);
  });

  it('validates spellicons atlas (schools + status icons)', () => {
    validatePixiAtlas('spellicons', 'spellicons', [
      'school/fire',
      'school/frost',
      'school/arcane',
      'school/shadow',
      'school/holy',
      'school/earth',
      'status/burning',
      'status/frozen',
      'status/poisoned',
      'status/stunned',
    ]);
  });

  it('validates projectiles atlas + trail frames', () => {
    validatePixiAtlas('projectiles', 'projectiles', [
      'arrow/0',
      'arrow/trail-0',
      'bolt/0',
      'fireball/0',
      'fireball/trail-0',
      'frost-shard/0',
      'frost-shard/trail-0',
      'shadow-orb/0',
      'shadow-orb/trail-0',
      'thrown-axe/0',
      'thrown-axe/3',
    ]);
  });

  it('validates townnpcs atlas (6 NPCs x 4 idle frames)', () => {
    const required: string[] = [];
    for (const npc of ['smith', 'innkeeper', 'mage', 'priest', 'guard', 'villager']) {
      for (let i = 0; i < 4; i++) required.push(`${npc}/idle/${i}`);
    }
    validatePixiAtlas('townnpcs', 'townnpcs', required);
  });

  it('validates uiskin CSS and 9-slice / orb PNGs', () => {
    expect(existsSync(resolve(ROOT, 'public/uiskin/uiskin.css'))).toBe(true);
    for (const png of [
      'public/uiskin/panel-frame.png',
      'public/uiskin/btn-dark.png',
      'public/uiskin/orb-health.png',
      'public/uiskin/orb-mana.png',
      'public/uiskin/rarity-frames.png',
    ]) {
      assertRegisteredBinary(png);
    }
  });

  it('validates 4 campaign map loading screens under 3 MiB', () => {
    for (const jpg of [
      'public/loadscreens/load-map1-fords.jpg',
      'public/loadscreens/load-map2-redmarsh.jpg',
      'public/loadscreens/load-map3-coast.jpg',
      'public/loadscreens/load-map4-caldera.jpg',
    ]) {
      assertRegisteredBinary(jpg);
    }
  });
});
