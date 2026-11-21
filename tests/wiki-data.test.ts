import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WikiEntry, WikiIndex } from '../src/wiki/types';
import { buildWikiData, renderMissing, serialise } from '../tools/build-wiki-data.mjs';

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

  it('resolves art for 100% of all 2,190 entries across all 19 categories and contains zero placeholder text', () => {
    const idx = out.index as WikiIndex;
    expect(idx.cats).toHaveLength(19);
    expect(idx.entries.length).toBeGreaterThanOrEqual(2190);
    expect(missing, `expected 0 missing images, found ${missing.length}`).toHaveLength(0);

    for (const cat of idx.cats) {
      const list = (out as Record<string, WikiEntry[]>)[cat] ?? [];
      for (const entry of list) {
        expect(entry.img, `${cat}/${entry.id} missing img`).toBeTruthy();
        expect(
          existsSync(join(ROOT, 'public', entry.img!.src)),
          `missing file ${entry.img!.src} for ${cat}/${entry.id}`,
        ).toBe(true);
        if (entry.sprite) {
          expect(
            existsSync(join(ROOT, 'public', entry.sprite.src)),
            `missing sprite ${entry.sprite.src} for ${cat}/${entry.id}`,
          ).toBe(true);
        }
        const blob = JSON.stringify({
          title: entry.title,
          summary: entry.summary,
          infobox: entry.infobox,
          sections: entry.sections,
        });
        expect(blob, `${cat}/${entry.id} contains "No lore yet."`).not.toContain('No lore yet.');
        expect(blob, `${cat}/${entry.id} contains "No art yet"`).not.toContain('No art yet');
        expect(blob, `${cat}/${entry.id} contains banned placeholder token`).not.toMatch(
          /\b(todo|lorem|placeholder)\b/i,
        );
      }
    }

    for (const cat of ['bestiary', 'items', 'affixes', 'regions']) {
      const list = (out as Record<string, WikiEntry[]>)[cat] ?? [];
      const seenDesc = new Map<string, string>();
      for (const entry of list) {
        const descSec =
          entry.sections.find((s) => ['Description', 'Lore', 'Enter line', 'Survey notes'].includes(s.h)) ??
          entry.sections[0];
        const txt = [...(descSec?.p ?? []), ...(descSec?.list ?? [])].join(' ').trim();
        expect(txt.length, `${cat}/${entry.id} description too short (${txt.length} chars)`).toBeGreaterThanOrEqual(40);
        expect(seenDesc.has(txt), `${cat}/${entry.id} duplicates description of ${seenDesc.get(txt)}`).toBe(false);
        seenDesc.set(txt, entry.id);
      }
    }

    const classes = (out as Record<string, WikiEntry[]>).classes;
    const necro = classes.find((c) => c.id === 'necromancer');
    expect(necro?.img?.src).toBe('townart/portrait-necromancer.png');
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
