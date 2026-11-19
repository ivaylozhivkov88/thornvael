import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWikiData, renderMissing, serialise } from '../tools/build-wiki-data.mjs';
import type { WikiEntry, WikiIndex } from '../src/wiki/types';

const ROOT = join(import.meta.dirname, '..');
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

describe('wiki data pipeline', () => {
  const { out, missing } = buildWikiData();
  const expectedFiles = serialise(out);

  it('src/wiki/data/*.json matches live buildWikiData() output (staleness guard)', () => {
    for (const [name, expectedText] of Object.entries(expectedFiles)) {
      const actualText = readFileSync(join(ROOT, 'src', 'wiki', 'data', name), 'utf8').replace(/\r\n/g, '\n');
      expect(actualText, `${name} is stale — run npm run wiki:data`).toBe(expectedText);
    }
    const missingMd = readFileSync(join(ROOT, 'tools', 'WIKI-MISSING-IMAGES.md'), 'utf8').replace(/\r\n/g, '\n');
    expect(missingMd, 'WIKI-MISSING-IMAGES.md is stale — run npm run wiki:data').toBe(renderMissing(missing));
  });

  it('has zero duplicate IDs per category and zero duplicate routes in index', () => {
    const idx = out.index as WikiIndex;
    const routes = new Set<string>();
    for (const e of idx.entries) {
      expect(routes.has(e.r), `duplicate route ${e.r}`).toBe(false);
      routes.add(e.r);
    }
    for (const cat of idx.cats) {
      const list = (out as Record<string, WikiEntry[]>)[cat] ?? [];
      const ids = new Set<string>();
      for (const entry of list) {
        expect(ids.has(entry.id), `duplicate id ${entry.id} in ${cat}`).toBe(false);
        ids.add(entry.id);
        expect(entry.infobox.length, `empty infobox in ${cat}/${entry.id}`).toBeGreaterThan(0);
        expect(entry.sections.length, `empty sections in ${cat}/${entry.id}`).toBeGreaterThan(0);
        for (const rel of entry.related) {
          expect(routes.has(rel), `broken related link "${rel}" in ${cat}/${entry.id}`).toBe(true);
        }
      }
    }
  });

  it('contains all required core coverage (52 creatures, 4 maps, 7 biomes, 4 classes)', () => {
    const bestiary = (out as Record<string, WikiEntry[]>).bestiary;
    expect(bestiary.filter((b) => b.tags.core)).toHaveLength(52);
    expect((out as Record<string, WikiEntry[]>).maps).toHaveLength(4);
    expect((out as Record<string, WikiEntry[]>).biomes).toHaveLength(7);
    expect((out as Record<string, WikiEntry[]>).cities).toHaveLength(4);
    expect((out as Record<string, WikiEntry[]>).classes.filter((c) => !c.id.startsWith('hero-'))).toHaveLength(4);
    expect((out as Record<string, WikiEntry[]>).uniques.length).toBeGreaterThanOrEqual(132);
  });

  it('resolves art for all 132+ unique items and all bestiary entries on disk', () => {
    const uniques = (out as Record<string, WikiEntry[]>).uniques;
    for (const u of uniques) {
      expect(u.img, `unique ${u.id} missing icon`).toBeTruthy();
      expect(existsSync(join(ROOT, 'public', u.img!.src)), `missing file ${u.img!.src} for ${u.id}`).toBe(true);
    }
    const bestiary = (out as Record<string, WikiEntry[]>).bestiary;
    for (const b of bestiary) {
      expect(b.img, `bestiary ${b.id} missing image`).toBeTruthy();
      expect(existsSync(join(ROOT, 'public', b.img!.src)), `missing file ${b.img!.src} for ${b.id}`).toBe(true);
      if (b.sprite) {
        expect(existsSync(join(ROOT, 'public', b.sprite.src)), `missing sprite ${b.sprite.src} for ${b.id}`).toBe(true);
      }
    }
  });

  it('contains zero banned reference names in generated files', () => {
    for (const [name, text] of Object.entries(expectedFiles)) {
      for (const re of BANNED) {
        expect(re.test(text), `${name} matched banned pattern ${re.source}`).toBe(false);
      }
    }
    const missingText = renderMissing(missing);
    for (const re of BANNED) {
      expect(re.test(missingText), `WIKI-MISSING-IMAGES.md matched banned pattern ${re.source}`).toBe(false);
    }
  });
});
