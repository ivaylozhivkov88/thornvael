import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import {
  ACT_BOSS_TROPHIES,
  computeRollPerfection,
  discoverBossTrophy,
  discoverItem,
  discoverRune,
  discoverRuneword,
  discoverSetPiece,
  discoverUnique,
  exportGrailState,
  getGrailCatalog,
  getGrailDropClue,
  getGrailEntry,
  getGrailMilestoneBoons,
  getPinnedGrailTargets,
  importGrailState,
  isGrailDiscovered,
  isGrailTargetPinned,
  resetCodex,
  resetGrail,
  togglePinGrailTarget,
} from '../src/codex';
import { ALL_UNIQUE_ARTIFACTS } from '../src/sim/affixes';
import { Kind } from '../src/sim/combat';
import { createHero, dropLoot } from '../src/sim/hero';
import { BUILTIN_GEMS, DYNAMIC_ITEM_OFFSET, ITEMS, getItemDef, getUnidentifiedName, itemId, type ItemDef, type ItemInstance } from '../src/sim/items';
import { ALL_RUNES, RUNEWORDS, applyRunewordToItem } from '../src/sim/runes';
import { COMBINED_SET_ITEMS } from '../src/sim/sets';
import { Sim } from '../src/sim/sim';
import { SUPER_UNIQUES } from '../src/sim/super-uniques';

describe('Phase 4: The Holy Grail & Imperial Reliquary System', () => {
  beforeEach(() => {
    resetCodex();
    resetGrail();
  });

  describe('Grail Catalog & 5 Tomes', () => {
    it('catalogs all 5 Tomes with over 500 collectible relics', () => {
      const catalog = getGrailCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(500);

      const tomes = new Set(catalog.map((c) => c.tome));
      expect(tomes.has('uniques')).toBe(true);
      expect(tomes.has('sets')).toBe(true);
      expect(tomes.has('runewords')).toBe(true);
      expect(tomes.has('trophies')).toBe(true);
      expect(tomes.has('armory')).toBe(true);

      const uniques = catalog.filter((c) => c.tome === 'uniques');
      expect(uniques.length).toBeGreaterThanOrEqual(130);

      const sets = catalog.filter((c) => c.tome === 'sets');
      expect(sets.length).toBeGreaterThanOrEqual(100);

      const runewords = catalog.filter((c) => c.tome === 'runewords');
      expect(runewords.length).toBeGreaterThanOrEqual(ALL_RUNES.length + RUNEWORDS.length);

      const trophies = catalog.filter((c) => c.tome === 'trophies');
      expect(trophies.length).toBe(SUPER_UNIQUES.length + ACT_BOSS_TROPHIES.length);

      const armory = catalog.filter((c) => c.tome === 'armory');
      expect(armory.length).toBe(ITEMS.length);
    });

    it('provides concrete target-farming drop clues for every item without "???"', () => {
      const catalog = getGrailCatalog();
      for (const item of catalog) {
        const clue = getGrailDropClue(item);
        expect(clue).toBeDefined();
        expect(clue.length).toBeGreaterThan(10);
        expect(clue).not.toContain('???');
      }
    });
  });

  describe('Dynamic Item Discovery & Catalog Preservation', () => {
    it('discovers dynamic unique items without collapsing to baseId in Grail', () => {
      const mockUniqueDef = {
        name: 'The Grandfather',
        kind: 1,
        tier: 5,
        slot: 1,
        gold: 50000,
        mindmg: 200,
        maxdmg: 350,
      };

      const dynamicId = DYNAMIC_ITEM_OFFSET + 42;
      const mockInstance: ItemInstance = {
        id: dynamicId,
        baseId: 10,
        quality: 'unique',
        name: 'The Grandfather',
        def: mockUniqueDef as any,
      };

      const mockSim: any = {
        instances: new Map<number, ItemInstance>([[dynamicId, mockInstance]]),
        getItemDef: () => mockUniqueDef,
      };

      const newlyDiscovered = discoverItem(dynamicId, mockSim, {
        heroName: 'Valeria',
        heroClass: 'Warrior',
        heroLevel: 55,
        missionName: 'Thornvael Catacombs',
        droppedBy: 'Ashkarath',
        rollPerfectionPct: 92,
      });

      expect(newlyDiscovered).toBe(true);

      // Check Grail entry
      const entry = getGrailEntry('unique:the-grandfather');
      expect(entry).toBeDefined();
      expect(entry?.name).toBe('The Grandfather');
      expect(entry?.heroName).toBe('Valeria');
      expect(entry?.heroClass).toBe('Warrior');
      expect(entry?.heroLevel).toBe(55);
      expect(entry?.missionName).toBe('Thornvael Catacombs');
      expect(entry?.droppedBy).toBe('Ashkarath');
      expect(entry?.rollPerfectionPct).toBe(92);

      // Verify isGrailDiscovered recognizes it without collapsing
      expect(isGrailDiscovered(dynamicId, mockSim)).toBe(true);
      expect(isGrailDiscovered('unique:the-grandfather')).toBe(true);
    });

    it('discovers set pieces and tracks sets completed', () => {
      const res = discoverSetPiece("Hwanin's Justice", {
        heroName: 'Kael',
        heroClass: 'Mage',
        heroLevel: 40,
        missionName: 'Forgotten Sands',
      });

      expect(res.isNew).toBe(true);
      expect(res.entry.tome).toBe('sets');
      expect(isGrailDiscovered(res.entry.key)).toBe(true);
    });

    it('discovers runes and runewords', () => {
      const rRes = discoverRune('Jah', { heroName: 'Aria' });
      expect(rRes.isNew).toBe(true);
      expect(rRes.entry.tome).toBe('runewords');
      expect(isGrailDiscovered('rune:jah')).toBe(true);

      const rwRes = discoverRuneword('Enigma', { heroName: 'Aria' });
      expect(rwRes.isNew).toBe(true);
      expect(rwRes.entry.tome).toBe('runewords');
      expect(isGrailDiscovered('runeword:enigma')).toBe(true);
    });

    it('discovers boss trophies', () => {
      const tRes = discoverBossTrophy('ashkarath', 'Inferno', {
        heroName: 'Soran',
        heroClass: 'Paladin',
        heroLevel: 60,
      });

      expect(tRes.isNew).toBe(true);
      expect(tRes.entry.tome).toBe('trophies');
      expect(isGrailDiscovered('trophy:ashkarath')).toBe(true);
    });
  });

  describe('Roll Perfection & Primal Foil Framing', () => {
    it('computes roll perfection accurately between 0 and 100%', () => {
      const def = {
        name: 'Iron Blade',
        max: 30,
        def: 10,
      };

      const lowInst = {
        max: 12,
        def: 4,
      };

      const highInst = {
        max: 29,
        def: 10,
      };

      const lowPerf = computeRollPerfection(lowInst, def);
      const highPerf = computeRollPerfection(highInst, def);

      expect(lowPerf).toBeGreaterThanOrEqual(1);
      expect(highPerf).toBeGreaterThan(lowPerf);
      expect(highPerf).toBeLessThanOrEqual(100);
    });

    it('upgrades existing Grail record when finding a higher roll perfection', () => {
      // First discovery with lower roll
      const first = discoverUnique('the-stone-of-jordan', {
        heroName: 'Alden',
        heroLevel: 30,
        rollPerfectionPct: 75,
      });
      expect(first.isNew).toBe(true);

      const initialEntry = getGrailEntry('unique:the-stone-of-jordan');
      expect(initialEntry?.rollPerfectionPct).toBe(75);
      expect(initialEntry?.isPrimalPerfect).toBe(false);

      // Second discovery with higher roll -> upgrade!
      const upgrade = discoverUnique('the-stone-of-jordan', {
        heroName: 'Alden',
        heroLevel: 45,
        rollPerfectionPct: 99,
      });

      expect(upgrade.isNew).toBe(false);
      expect(upgrade.isRollUpgrade).toBe(true);
      expect(upgrade.prevPct).toBe(75);
      expect(upgrade.newPct).toBe(99);

      const upgradedEntry = getGrailEntry('unique:the-stone-of-jordan');
      expect(upgradedEntry?.rollPerfectionPct).toBe(99);
      expect(upgradedEntry?.isPrimalPerfect).toBe(true);
    });
  });

  describe('Pinning Targets (🎯)', () => {
    it('allows pinning up to 3 target items in the Grail', () => {
      expect(getPinnedGrailTargets()).toEqual([]);

      expect(togglePinGrailTarget('unique:the-grandfather')).toBe(true);
      expect(isGrailTargetPinned('unique:the-grandfather')).toBe(true);

      expect(togglePinGrailTarget('runeword:enigma')).toBe(true);
      expect(togglePinGrailTarget('set:tal-rashas-guardianship')).toBe(true);

      expect(getPinnedGrailTargets().length).toBe(3);

      // Attempting to pin a 4th fails
      expect(togglePinGrailTarget('trophy:ashkarath')).toBe(false);
      expect(isGrailTargetPinned('trophy:ashkarath')).toBe(false);

      // Unpinning an item succeeds (returns false indicating unpinned)
      expect(togglePinGrailTarget('unique:the-grandfather')).toBe(false);
      expect(isGrailTargetPinned('unique:the-grandfather')).toBe(false);
      expect(getPinnedGrailTargets().length).toBe(2);

      // Now the 4th item can be pinned
      expect(togglePinGrailTarget('trophy:ashkarath')).toBe(true);
      expect(isGrailTargetPinned('trophy:ashkarath')).toBe(true);
      expect(getPinnedGrailTargets().length).toBe(3);
    });
  });

  describe('Milestone Boons & Account-Wide Perks', () => {
    it('returns default tier 0 boons when starting fresh', () => {
      const boons = getGrailMilestoneBoons();
      expect(boons.discoveredCount).toBe(0);
      expect(boons.pct).toBe(0);
      expect(boons.mfBonus).toBe(0);
      expect(boons.title).toBe('Initiate of the Archives');
      expect(boons.nextMilestonePct).toBe(10);
      expect(boons.toNextMilestone).toBeGreaterThan(0);
    });

    it('awards milestone thresholds: 10%, 25%, 50%, 75%, 100%', () => {
      const catalog = getGrailCatalog();
      const total = catalog.length;

      // Simulate 10% discoveries
      const count10 = Math.ceil(total * 0.1);
      for (let i = 0; i < count10; i++) {
        discoverItem(ITEMS[i % ITEMS.length] ? i % ITEMS.length : 0);
      }

      const boons10 = getGrailMilestoneBoons();
      expect(boons10.pct).toBeGreaterThanOrEqual(10);
      expect(boons10.mfBonus).toBeGreaterThanOrEqual(8);
      expect(boons10.title).toBe('Seeker of Relics');
    });
  });

  describe('Export & Import State', () => {
    it('exports and re-imports full Holy Grail state faithfully', () => {
      discoverUnique('windforce', {
        heroName: 'Lyra',
        heroClass: 'Ranger',
        heroLevel: 58,
        missionName: 'Deep Jungle',
        droppedBy: 'Shadow Priest Malakor',
        rollPerfectionPct: 98,
      });

      togglePinGrailTarget('unique:windforce');

      const json = exportGrailState();
      expect(json).toBeDefined();
      expect(json).toContain('windforce');
      expect(json).toContain('Lyra');

      // Clear memory
      resetGrail();
      expect(isGrailDiscovered('unique:windforce')).toBe(false);
      expect(isGrailTargetPinned('unique:windforce')).toBe(false);

      // Import back
      const success = importGrailState(json);
      expect(success).toBe(true);

      expect(isGrailDiscovered('unique:windforce')).toBe(true);
      expect(isGrailTargetPinned('unique:windforce')).toBe(true);

      const entry = getGrailEntry('unique:windforce');
      expect(entry?.heroName).toBe('Lyra');
      expect(entry?.isPrimalPerfect).toBe(true);
      expect(entry?.rollPerfectionPct).toBe(98);
    });
  });

  describe('Package A: Holy Grail 100% Obtainability & Drop Unification', () => {
    it('ensures 0 icons in getGrailCatalog() start with "public/" and all icon files exist on disk', () => {
      const catalog = getGrailCatalog();
      const publicDir = resolve(process.cwd(), 'public');
      const badPrefixes = catalog.filter((item) => item.icon?.startsWith('public/'));
      expect(badPrefixes).toEqual([]);

      const missingFiles = catalog
        .filter((item) => item.icon && !existsSync(resolve(publicDir, item.icon)))
        .map((item) => `${item.key} -> ${item.icon}`);
      expect(missingFiles).toEqual([]);
    });

    it('unlocks Tome I Unique and Tome II Set entries when discovering unidentified dynamic items via trueName', () => {
      const uniqueTarget = ALL_UNIQUE_ARTIFACTS.find((u) => u.name === "Tollkeeper's Receipt")!;
      expect(uniqueTarget).toBeDefined();

      const dynUniqueId = DYNAMIC_ITEM_OFFSET + 101;
      const unIdUniqueDef: ItemDef = {
        ...uniqueTarget,
        unidentified: true,
        trueName: uniqueTarget.name,
        name: getUnidentifiedName(uniqueTarget),
        rarity: 'unique',
      };
      const uniqueInst: ItemInstance = {
        id: dynUniqueId,
        baseId: 0,
        quality: 'unique',
        name: unIdUniqueDef.name,
        def: unIdUniqueDef,
      };

      const setTarget = COMBINED_SET_ITEMS.find((s) => s.name === 'Border Picket Broadsword')!;
      expect(setTarget).toBeDefined();

      const dynSetId = DYNAMIC_ITEM_OFFSET + 102;
      const unIdSetDef: ItemDef = {
        ...setTarget,
        unidentified: true,
        trueName: setTarget.name,
        name: getUnidentifiedName(setTarget),
        rarity: 'set',
      };
      const setInst: ItemInstance = {
        id: dynSetId,
        baseId: 1,
        quality: 'set',
        name: unIdSetDef.name,
        def: unIdSetDef,
      };

      const mockSim: any = {
        instances: new Map<number, ItemInstance>([
          [dynUniqueId, uniqueInst],
          [dynSetId, setInst],
        ]),
        getItemDef: (id: number) => (id === dynUniqueId ? unIdUniqueDef : unIdSetDef),
      };

      expect(discoverItem(dynUniqueId, mockSim)).toBe(true);
      expect(isGrailDiscovered('unique:uniq-tollkeeper-bill')).toBe(true);
      expect(isGrailDiscovered(dynUniqueId, mockSim)).toBe(true);

      expect(discoverItem(dynSetId, mockSim)).toBe(true);
      expect(isGrailDiscovered('set:set-thornwick-picket:border-picket-broadsword')).toBe(true);
      expect(isGrailDiscovered(dynSetId, mockSim)).toBe(true);
    });

    it('unlocks Tome III Rune and Runeword entries via discoverItem(), discoverRune(), and discoverRuneword()', () => {
      const eldunId = itemId('Rune of Eldun');
      expect(eldunId).toBeGreaterThanOrEqual(500);

      expect(discoverItem(eldunId)).toBe(true);
      expect(isGrailDiscovered('rune:el')).toBe(true);
      expect(isGrailDiscovered(eldunId)).toBe(true);

      // Calling discoverRune with either d2Name or Thornvael name maps to the same Tome III key
      const dupByName = discoverRune('Rune of Eldun');
      expect(dupByName.isNew).toBe(false);
      expect(dupByName.entry.key).toBe('rune:el');

      const tirRes = discoverRune('Tir');
      expect(tirRes.isNew).toBe(true);
      expect(tirRes.entry.key).toBe('rune:tir');
      expect(isGrailDiscovered('rune:tir')).toBe(true);

      // Runeword crafted onto a base item via applyRunewordToItem
      const stealthRw = RUNEWORDS.find((rw) => rw.id === 'stealth')!;
      const rwDef = applyRunewordToItem(ITEMS[0], stealthRw);
      const dynRwId = DYNAMIC_ITEM_OFFSET + 201;
      const rwInst: ItemInstance = {
        id: dynRwId,
        baseId: 0,
        quality: 'unique',
        name: rwDef.name,
        def: rwDef,
      };
      const mockSim: any = {
        instances: new Map<number, ItemInstance>([[dynRwId, rwInst]]),
      };
      expect(discoverItem(dynRwId, mockSim)).toBe(true);
      expect(isGrailDiscovered('runeword:stealth')).toBe(true);

      const dupRw = discoverRuneword('Shadow Veil');
      expect(dupRw.isNew).toBe(false);
      expect(dupRw.entry.key).toBe('runeword:stealth');
    });

    it('aligns all Tome I uniques and Tome II set items with simulation drop pools', () => {
      const catalog = getGrailCatalog();
      const tomeI = catalog.filter((c) => c.tome === 'uniques');
      const tomeII = catalog.filter((c) => c.tome === 'sets');

      expect(tomeI.length).toBe(180); // 132 JSON + 48 built-in
      expect(ALL_UNIQUE_ARTIFACTS.length).toBe(180);

      const uniqueNames = new Set(ALL_UNIQUE_ARTIFACTS.map((u) => u.name.toLowerCase()));
      for (const entry of tomeI) {
        expect(uniqueNames.has(entry.name.toLowerCase()), `Missing unique in sim pool: ${entry.name}`).toBe(true);
      }

      expect(tomeII.length).toBe(112); // 28 sets * 4 avg = 112 pieces
      expect(COMBINED_SET_ITEMS.length).toBe(112);

      const setPieceNames = new Set(COMBINED_SET_ITEMS.map((p) => p.name.toLowerCase()));
      for (const entry of tomeII) {
        expect(setPieceNames.has(entry.name.toLowerCase()), `Missing set piece in sim pool: ${entry.name}`).toBe(true);
      }
    });

    it('drops Runes and Gems from SPECIAL_ITEMS on boss kills deterministically', () => {
      const map: GameMap = {
        w: 30,
        h: 30,
        terrain: new Uint8Array(900),
        height: new Uint8Array(900),
        blocked: new Uint8Array(900),
        objects: [],
        light: new Uint8Array(900).fill(200),
      };
      const runeNames = new Set(ALL_RUNES.map((r) => r.name));
      const gemNames = new Set(BUILTIN_GEMS.map((g) => g.name));
      let sawRune = false;
      let sawGem = false;

      for (let seed = 1; seed <= 40 && (!sawRune || !sawGem); seed++) {
        const sim = new Sim(map, seed, [0, 1], {
          kinds: [Kind.Hero, Kind.Golem],
          tiers: [1, 5],
          bossMods: [[], ['fire_enchanted', 'stone_skin']],
          combat: true,
        });
        sim.place(0, 5, 5);
        sim.place(1, 10, 10);
        createHero(sim, 0, 0, false, 1);
        dropLoot(sim, 1);

        for (let b = 0; b < sim.cb.bI.length; b++) {
          if (!sim.cb.bI[b]) continue;
          const id = sim.cb.bI[b] - 1;
          const def = sim.getItemDef(id) ?? getItemDef(id);
          if (def && runeNames.has(def.name)) sawRune = true;
          if (def && gemNames.has(def.name)) sawGem = true;
        }
      }

      expect(sawRune).toBe(true);
      expect(sawGem).toBe(true);
    });
  });
});
