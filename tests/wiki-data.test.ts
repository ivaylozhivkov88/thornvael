import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findIndexEntryForPin,
  GRAIL_PINS_STORAGE_KEY,
  GRAIL_STORAGE_KEY,
  getGrailSummary,
  LEGACY_CODEX_STORAGE_KEY,
  loadGrailPins,
  loadGrailSnapshot,
  lookupGrailStatus,
  MAX_GRAIL_PINS,
  toggleGrailPin,
  unpinGrailTarget,
} from '../src/wiki/grail-status';
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

  it('resolves art for 100% of all entries across all 19 categories and contains zero placeholder text', () => {
    const idx = out.index as WikiIndex;
    expect(idx.cats).toHaveLength(19);
    expect(idx.entries.length).toBeGreaterThanOrEqual(2219);
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

  it('includes Holy Grail, Gameplay Assists, High Ground, Veterancy, and Bounty articles plus Grail Tome/Drop Clues on gear', () => {
    const glossary = (out as Record<string, WikiEntry[]>).glossary;
    const tips = (out as Record<string, WikiEntry[]>).tips;
    const requiredGlossaryIds = [
      'auto-cast-spells',
      'auto-go-objective',
      'auto-fight-modes',
      'auto-loot-sweep',
      'auto-potion-threshold',
      'squad-stances',
      'regroup-to-hero',
      'high-ground-advantage',
      'mercenary-veterancy',
      'temple-resurrection',
      'mercenary-gear-slots',
      'holy-grail-tomes',
      'grail-target-pinning',
      'grail-roll-perfection',
      'holy-grail-boons',
      'tavern-bounties',
      'mystery-gamble',
    ];
    for (const id of requiredGlossaryIds) {
      const entry = glossary.find((g) => g.id === id);
      expect(entry, `missing glossary article ${id}`).toBeDefined();
      expect(entry!.img, `glossary/${id} missing img`).toBeTruthy();
      expect(existsSync(join(ROOT, 'public', entry!.img!.src)), `missing icon ${entry!.img!.src}`).toBe(true);
      const text = entry!.sections.flatMap((s) => [...(s.p ?? []), ...(s.list ?? [])]).join(' ');
      expect(text.length, `glossary/${id} too short`).toBeGreaterThan(40);
    }

    const requiredTipIds = [
      'tip-assist-auto-cast',
      'tip-assist-auto-go',
      'tip-assist-auto-fight',
      'tip-assist-loot-sweep',
      'tip-tactical-stances',
      'tip-tactical-high-ground',
      'tip-merc-veterancy',
      'tip-merc-sanctuary',
      'tip-holy-grail-hunt',
      'tip-holy-grail-pins',
      'tip-town-bounties',
      'tip-town-gamble',
    ];
    for (const id of requiredTipIds) {
      const entry = tips.find((t) => t.id === id);
      expect(entry, `missing tip ${id}`).toBeDefined();
      expect(entry!.img, `tip/${id} missing img`).toBeTruthy();
      expect(existsSync(join(ROOT, 'public', entry!.img!.src)), `missing tip icon ${entry!.img!.src}`).toBe(true);
      expect(entry!.summary.length, `tip/${id} summary too short`).toBeGreaterThan(40);
    }

    for (const cat of ['items', 'uniques', 'sets', 'gems']) {
      const list = (out as Record<string, WikiEntry[]>)[cat] ?? [];
      for (const entry of list) {
        const tomeRow = entry.infobox.find(([k]) => k === 'Grail Tome');
        const clueRow = entry.infobox.find(([k]) => k === 'Drop Clue');
        expect(tomeRow?.[1]?.length, `${cat}/${entry.id} missing Grail Tome infobox field`).toBeGreaterThan(0);
        expect(clueRow?.[1]?.length, `${cat}/${entry.id} missing Drop Clue infobox field`).toBeGreaterThan(10);
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

describe('live Holy Grail status helper', () => {
  const { out } = buildWikiData();
  const idx = out.index as WikiIndex;
  const origStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  const installMockStorage = (initial: Record<string, string> = {}) => {
    const map = new Map<string, string>(Object.entries(initial));
    const mock: Storage = {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k: string) => map.get(k) ?? null,
      key: (i: number) => [...map.keys()][i] ?? null,
      removeItem: (k: string) => {
        map.delete(k);
      },
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
    };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: mock });
    return map;
  };

  afterEach(() => {
    if (origStorage) {
      Object.defineProperty(globalThis, 'localStorage', origStorage);
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('reads thornvael_grail_v2 provenance, primal rolls, and legacy thornvael_codex_v1 fallback', () => {
    const rustItem = (out as Record<string, WikiEntry[]>).items[0];
    const codexId = rustItem.tags.codexId ?? 0;

    installMockStorage({
      [GRAIL_STORAGE_KEY]: JSON.stringify({
        entries: {
          'uniq-tollkeeper-bill': {
            discoveredByHero: 'Alden',
            heroClass: 'Warrior',
            heroLevel: 14,
            missionName: 'Blood at the Ford',
            droppedBy: 'Alder Gnoll Chief',
            rollPerfectionPct: 99,
          },
          'rw-stealth': { rollPerfectionPct: 84 },
        },
      }),
      [LEGACY_CODEX_STORAGE_KEY]: JSON.stringify([codexId]),
    });

    const snap = loadGrailSnapshot();
    const uniqStatus = lookupGrailStatus(snap, {
      id: 'uniq-tollkeeper-bill',
      type: 'unique',
      title: 'Tollkeeper Bill',
    });
    expect(uniqStatus.discovered).toBe(true);
    expect(uniqStatus.rollPerfectionPct).toBe(99);
    expect(uniqStatus.primal).toBe(true);
    expect(uniqStatus.discoveredByHero).toBe('Alden');
    expect(uniqStatus.missionName).toBe('Blood at the Ford');

    const rwStatus = lookupGrailStatus(snap, { id: 'rw-stealth', type: 'gem', title: 'Shadow Veil' });
    expect(rwStatus.discovered).toBe(true);
    expect(rwStatus.rollPerfectionPct).toBe(84);
    expect(rwStatus.primal).toBe(false);

    const legacyStatus = lookupGrailStatus(snap, {
      id: rustItem.id,
      type: 'item',
      title: rustItem.title,
      codexId: rustItem.tags.codexId,
    });
    expect(legacyStatus.discovered).toBe(true);
    expect(legacyStatus.source).toBe('codex_v1');

    const summary = getGrailSummary(idx.entries, snap);
    expect(summary.discoveredCount).toBeGreaterThanOrEqual(3);
    expect(summary.tomes.uniques.total).toBe(132);
    expect(summary.tomes.uniques.discovered).toBe(1);
    expect(summary.tomes.sets.total).toBe(28);
  });

  it('pins and unpins up to 3 Grail targets in thornvael_grail_pins_v1', () => {
    const store = installMockStorage();

    expect(toggleGrailPin('uniq-tollkeeper-bill')).toEqual({
      pinned: true,
      pins: ['uniq-tollkeeper-bill'],
      limitReached: false,
    });
    expect(toggleGrailPin('rw-stealth').pins).toHaveLength(2);
    expect(toggleGrailPin('set-thornwick-picket').pins).toHaveLength(3);

    const fourth = toggleGrailPin('ashkarath');
    expect(fourth.limitReached).toBe(true);
    expect(fourth.pinned).toBe(false);
    expect(fourth.pins).toHaveLength(MAX_GRAIL_PINS);
    expect(JSON.parse(store.get(GRAIL_PINS_STORAGE_KEY) ?? '[]')).toHaveLength(3);

    // Toggle an existing pin off, then pin the 4th
    expect(toggleGrailPin('rw-stealth').pinned).toBe(false);
    expect(toggleGrailPin('ashkarath')).toEqual({
      pinned: true,
      pins: ['uniq-tollkeeper-bill', 'set-thornwick-picket', 'ashkarath'],
      limitReached: false,
    });

    unpinGrailTarget('uniq-tollkeeper-bill');
    expect(loadGrailPins()).toEqual(['set-thornwick-picket', 'ashkarath']);
  });

  it('matches serialized GrailEntry arrays emitted by src/codex.ts across all 5 Tomes', () => {
    const rustItem = (out as Record<string, WikiEntry[]>).items[0];
    const codexId = rustItem.tags.codexId ?? 0;

    installMockStorage({
      [GRAIL_STORAGE_KEY]: JSON.stringify([
        {
          key: `armory:${codexId}`,
          tome: 'armory',
          name: rustItem.title,
          baseId: codexId,
          discoveredAt: 1700000000000,
          heroName: 'Lyra',
          heroClass: 'Mage',
          heroLevel: 20,
          missionName: 'Quartz Plateau',
          rollPerfectionPct: 91,
          isPrimalPerfect: false,
          count: 1,
        },
        {
          key: 'trophy:ashkarath',
          tome: 'trophies',
          name: 'Ashkarath, the Cinder King Trophy Seal',
          discoveredAt: 1700000001000,
          heroName: 'Lyra',
          heroClass: 'Mage',
          heroLevel: 40,
          missionName: 'Obsidian Dais',
          droppedBy: 'Ashkarath',
          rollPerfectionPct: 100,
          isPrimalPerfect: true,
          count: 1,
        },
        {
          key: 'runeword:shadow-veil',
          tome: 'runewords',
          name: 'Shadow Veil',
          discoveredAt: 1700000002000,
          heroName: 'Lyra',
          rollPerfectionPct: 98,
          isPrimalPerfect: true,
          count: 1,
        },
        {
          key: 'set:set-thornwick-picket:border-picket-broadsword',
          tome: 'sets',
          name: 'Border Picket Broadsword',
          setId: 'set-thornwick-picket',
          setName: 'Thornwick Border Guard',
          discoveredAt: 1700000003000,
          heroName: 'Lyra',
          rollPerfectionPct: 87,
          count: 1,
        },
      ]),
      [GRAIL_PINS_STORAGE_KEY]: JSON.stringify(['unique:uniq-tollkeeper-bill', 'runeword:shadow-veil']),
    });

    const snap = loadGrailSnapshot();
    const armoryHit = lookupGrailStatus(snap, {
      id: rustItem.id,
      type: 'item',
      title: rustItem.title,
      codexId: rustItem.tags.codexId,
    });
    expect(armoryHit.discovered).toBe(true);
    expect(armoryHit.rollPerfectionPct).toBe(91);

    const bossHit = lookupGrailStatus(snap, {
      id: 'ashkarath',
      type: 'bestiary',
      title: 'Ashkarath, the Cinder King',
    });
    expect(bossHit.discovered).toBe(true);
    expect(bossHit.primal).toBe(true);
    expect(bossHit.droppedBy).toBe('Ashkarath');

    const rwHit = lookupGrailStatus(snap, { id: 'rw-stealth', type: 'gem', title: 'Shadow Veil' });
    expect(rwHit.discovered).toBe(true);
    expect(rwHit.primal).toBe(true);

    const setHit = lookupGrailStatus(snap, {
      id: 'set-thornwick-picket',
      type: 'set',
      title: 'Thornwick Border Guard',
    });
    expect(setHit.discovered).toBe(true);
    expect(setHit.rollPerfectionPct).toBe(87);

    expect(findIndexEntryForPin('runeword:shadow-veil', idx.entries)?.id).toBe('rw-stealth');
    expect(findIndexEntryForPin('unique:uniq-tollkeeper-bill', idx.entries)?.id).toBe('uniq-tollkeeper-bill');
  });
});
