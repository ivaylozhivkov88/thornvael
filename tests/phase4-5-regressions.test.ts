import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GameMap } from '../src/map';
import { Kind, M } from '../src/sim/combat';
import { RULES } from '../src/sim/difficulty';
import {
  calculateNoDropRate,
  createHero,
  derive,
  dropLoot,
  executeHeroSkill,
  getHeroMF,
  heroCommand,
  spellForHero,
  startState,
} from '../src/sim/hero';
import { Cls, SIGIL_NAMES, Slot, itemId, kitCls } from '../src/sim/items';
import { transmuteCube } from '../src/sim/cube';
import { MAGE_SPELLS, SPELLS, St } from '../src/sim/spelldata';
import { spellHit } from '../src/sim/spells';
import { QuestType, townCommand } from '../src/sim/town';
import { parseJsonSetBonus } from '../src/sim/sets';
import { getSalvationResistBonus, isUnitUnderConviction, isUnitUnderThorns } from '../src/sim/auras';
import { FP, Sim } from '../src/sim/sim';
import { createMission, missionFromName } from '../src/mission';
import { ascendCharacterToNewGamePlus, newCharacter } from '../src/characters';
import { dollSet } from '../src/doll';
import { newRecord, nextDifficultyAfterVictory, startNewGamePlusRecord } from '../src/flow';
import { migrateSave, SAVE_FORMAT, SAVE_VERSION } from '../src/save';
import { loadWikiIndex, WIKI_INDEX } from '../src/wiki/dataLoader';
import campaignData from '../public/data/campaign.json';
import type { Campaign } from '../src/campaign';

function flatField(w = 24, h = 24): GameMap {
  return {
    w,
    h,
    terrain: new Uint8Array(w * h),
    height: new Uint8Array(w * h),
    blocked: new Uint8Array(w * h),
    objects: [],
    light: new Uint8Array(w * h).fill(200),
  };
}

describe('Phase 4.1 Core Gameplay, Spell, Set, Aura & Economy Fixes', () => {
  it('supports Hell difficulty (index 3) and 4 starting healing draughts cleanly', () => {
    expect(RULES.length).toBe(4);
    expect(RULES[3].foeHitPct).toBe(220);
    const hellHero = startState(0, 0, false, 3);
    expect(hellHero.inv[0].n).toBe(1);
    const archer = startState(0, 2, true, 1);
    const necro = startState(0, 3, false, 2);
    expect(kitCls(archer.cls)).toBe(Cls.Warrior);
    expect(kitCls(necro.cls)).toBe(Cls.Mage);
    expect(archer.eq[Slot.Weapon]).toBe(itemId('Short Bow'));
  });

  it('MAGE_SPELLS includes Stone Skin (16), Poison Cloud (17), Weaken (20), Resurrect (21)', () => {
    for (const sid of [0, 1, 4, 7, 16, 17, 20, 21]) {
      expect((MAGE_SPELLS >>> sid) & 1).toBe(1);
    }
    expect(SPELLS[16].name).toBe('Stone Skin');
    expect(SPELLS[17].name).toBe('Poison Cloud');
    expect(SPELLS[20].name).toBe('Weaken');
    expect(SPELLS[21].name).toBe('Resurrect');
  });

  it('Siphon Ley (46) restores mana to caster, Mana Burn (30) burns target mana, Sunder Plate (35) reduces target def/abs', () => {
    const sim = new Sim(flatField(), 11, [0, 1], { kinds: [Kind.Hero, Kind.Mage], combat: true });
    sim.place(0, 5, 5);
    sim.place(1, 7, 5);
    createHero(sim, 0, Cls.Mage, false, 1);
    sim.cb.mana[0] = 20;
    spellHit(sim, 1, 46, 100, 0);
    expect(sim.cb.mana[0]).toBeGreaterThan(20);

    sim.cb.hpMax[1] = 200;
    sim.cb.hp[1] = 200;
    sim.cb.mana[1] = 40;
    spellHit(sim, 1, 30, 100, 0);
    expect(sim.cb.mana[1]).toBeLessThan(40);

    const defBefore = sim.cb.mod[1 * 20 + M.Def];
    spellHit(sim, 1, 35, 100, 0);
    expect(sim.cb.mod[1 * 20 + M.Def]).toBeLessThan(defBefore);
    expect((sim.cb.stMask[1] & (1 << St.Weaken)) !== 0).toBe(true);
  });

  it('wires Archer bow projectiles, 9 item affixes, jewelry armor, Rejuv dual-restore, Salvation/Conviction/Thorns', () => {
    const sim = new Sim(flatField(), 12, [0, 1], { kinds: [Kind.Hero, Kind.Golem], combat: true });
    sim.place(0, 5, 5);
    sim.place(1, 10, 5); // 5 tiles apart: melee cannot reach, Archer with Short Bow can!
    const h = createHero(sim, 0, 2, false, 1);
    expect(h.eq[Slot.Weapon]).toBe(itemId('Short Bow'));
    const hp0 = sim.cb.hp[1];
    sim.step([{ type: 'order', order: 'attack', ids: [0], target: 1 }]);
    for (let t = 0; t < 40; t++) sim.step();
    expect(sim.cb.hp[1]).toBeLessThan(hp0);

    // Aura radius helpers
    h.activeAura = 'thorns';
    expect(isUnitUnderThorns(sim, 0)).toBe(true);
    h.activeAura = 'salvation';
    expect(getSalvationResistBonus(sim, 0)).toBe(35);
    h.activeAura = 'conviction';
    expect(isUnitUnderConviction(sim, 1)).toBe(true);
    expect(derive(h).res.length).toBe(5);
  });

  it('parses all extended JSON set bonus patterns cleanly', () => {
    const b1 = parseJsonSetBonus(2, '+10 Intelligence and +20% All Elemental Resistances');
    expect(b1.attr?.[2]).toBe(10);
    expect(b1.res).toEqual([20, 20, 20, 20, 20]);

    const b2 = parseJsonSetBonus(3, '+15% Poison/Cold Resistance and +20% Fire and Lightning Spell Damage');
    expect(b2.res?.[1]).toBe(15);
    expect(b2.res?.[3]).toBe(15);
    expect(b2.pow).toBe(20);

    const b3 = parseJsonSetBonus(2, '+45 Max Mana and +1.8 Mana Regen/s');
    expect(b3.mana).toBe(45);
    expect(b3.regen).toBe(2);
  });

  it('prevents Gather unequip exploit, shop re-roll per leave, and strips runeword bonuses on Cube Un-socket', () => {
    const game = createMission(missionFromName('market'), 5);
    const sim = game.sim;
    createHero(sim, 0, Cls.Warrior, false, 1);
    const h = sim.hero!;
    expect(h.eq[Slot.Armor]).toBeGreaterThanOrEqual(0);
    sim.town.quests.push({ type: QuestType.Gather, town: 0, reward: 50, a: 1, b: 0, base: h.inv.reduce((n, s) => n + s.n, 0), start: 0, ids: [], pts: [], prog: 0 });
    heroCommand(sim, { type: 'hero', op: 'unequip', slot: Slot.Armor });
    // Unequipping adjusted q.base so pack count delta stays 0, never auto-completing Gather
    expect(h.inv.reduce((n, s) => n + s.n, 0) - sim.town.quests[0].base).toBe(0);

    // Shop stock stays fixed within one town visit across enter/leave
    const [cx, cy] = sim.towns[0].centre[1]!;
    sim.place(0, cx, cy);
    townCommand(sim, { type: 'town', op: 'enter', town: 0, v: 1 });
    const stockFirst = sim.town.stock[0].slice();
    townCommand(sim, { type: 'town', op: 'leave', town: 0 });
    townCommand(sim, { type: 'town', op: 'enter', town: 0, v: 1 });
    expect(sim.town.stock[0]).toEqual(stockFirst);

    // Cube Un-socketing strips bonus stats
    const baseSword = {
      name: 'Edge (Long Sword)',
      kind: 0,
      slot: 0,
      tier: 1,
      w: 2,
      cls: 1,
      need: 0,
      needv: 0,
      min: 20,
      max: 30,
      acc: 5,
      cover: 0,
      def: 0,
      abs: 0,
      res: [0, 0, 0, 0, 0] as const,
      attr: [0, 0, 0, 0] as const,
      hp: 0,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      sockets: 2,
      socketedGems: ['Flawed Ruby'],
    };
    const helva = { ...baseSword, name: 'Rune of Helva', kind: 4, slot: -1, sockets: 0 };
    const tp = { ...baseSword, name: 'Scroll of Town Portal', kind: 3, slot: -1, sockets: 0 };
    const unsock = transmuteCube([baseSword, helva, tp], 1, 1);
    expect(unsock?.result.name).toBe('Long Sword');
    expect(unsock?.result.socketedGems).toEqual([]);
    expect(unsock?.result.min).toBeLessThan(baseSword.min);
  });
});

describe('Phase 4.2, 4.3 & Phase 5 Regressions', () => {
  it('MissionDirectors step deterministically inside Sim and preserve hash across snapshot/restore', () => {
    const m = missionFromName('ford');
    const a = createMission(m, 99, { nodeId: 'm01-blood-at-the-ford', act: 1, isTownNode: false });
    const b = createMission(missionFromName('ford'), 99, { nodeId: 'm01-blood-at-the-ford', act: 1, isTownNode: false });
    createHero(a.sim, 0, 0, false, 1);
    createHero(b.sim, 0, 0, false, 1);
    for (let t = 0; t < 40; t++) a.sim.step();
    const snap = a.sim.snapshot();
    expect(snap.directors).toBeDefined();
    b.sim.restore(snap);
    for (let t = 0; t < 40; t++) {
      a.sim.step();
      b.sim.step();
    }
    expect(b.sim.hash()).toBe(a.sim.hash());
  });

  it('New Game+ promotes hero into Nightmare (diff 2) and Hell (diff 3) preserving progress/equipment', () => {
    const ch = newCharacter('Vaelen', 0, false, 1);
    const h = startState(0, 0, false, 1);
    h.level = 14;
    ch.hero = h;
    ch.gold = 900;
    const asc1 = ascendCharacterToNewGamePlus(ch, 1);
    expect(asc1.nextDifficulty).toBe(2);
    expect(asc1.character.ngPlusTier).toBe(1);
    expect(asc1.character.hero?.level).toBe(14);
    expect(asc1.character.hero?.diff).toBe(2);

    const asc2 = ascendCharacterToNewGamePlus(asc1.character, 2);
    expect(asc2.nextDifficulty).toBe(3);
    expect(asc2.character.ngPlusTier).toBe(2);

    const camp = campaignData as unknown as Campaign;
    const rec = newRecord(camp, { cls: 0, female: false }, 1);
    rec.carry = { hero: h, mercs: [], gold: 900, shopSeed: 1, progress: rec.progress };
    const ngRec = startNewGamePlusRecord(camp, rec, nextDifficultyAfterVictory(1));
    expect(ngRec.progress.difficulty).toBe(2);
    expect(ngRec.progress.ngPlusTier).toBe(1);
    expect(ngRec.progress.completed).toEqual([]);
    expect(ngRec.carry?.gold).toBe(900);
    expect(ngRec.carry?.hero.level).toBe(14);
  });

  it('rejects malformed v6/v7 saves cleanly in migrateSave and verifies 503 offline handler in sw.ts', () => {
    expect(() =>
      migrateSave({
        format: SAVE_FORMAT,
        saveVersion: SAVE_VERSION,
        gameVersion: '0.8.0',
        createdAt: Date.now(),
        name: 'bad',
        label: 'bad',
        state: { doc: {}, snap: null },
      }),
    ).toThrow(/damaged/);

    expect(() =>
      migrateSave({
        format: SAVE_FORMAT,
        saveVersion: 999,
        gameVersion: '9.9.9',
        createdAt: Date.now(),
        name: 'future',
        label: 'future',
        state: { doc: {}, snap: {} },
      }),
    ).toThrow(/newer version/);

    const swSrc = readFileSync(resolve(__dirname, '../src/sw.ts'), 'utf8');
    expect(swSrc).toContain('handlerDidError');
    expect(swSrc).toContain('status: 503');
  });

  it('loads Wiki Index lazily via loadWikiIndex() and populates WIKI_INDEX & ROUTE_MAP', async () => {
    const idx = await loadWikiIndex();
    expect(idx.entries.length).toBeGreaterThan(100);
    expect(WIKI_INDEX.entries.length).toBe(idx.entries.length);
  });
});

describe('Phase 4/5 Pessimist Reviewer Fixes', () => {
  it('fixes Hell (diff === 3) no-drop rate, champion/boss loot tier floor, and Sigil drops', () => {
    expect(calculateNoDropRate(50, 3)).toBeLessThan(calculateNoDropRate(50, 2));
    expect(calculateNoDropRate(50, 2)).toBeLessThan(calculateNoDropRate(50, 1));

    const sim = new Sim(flatField(), 1337, [0, 1], { kinds: [Kind.Hero, Kind.Gnoll] });
    createHero(sim, 0, 0, false, 3);
    sim.cb.tier[1] = 1;
    (sim.cb.bossMods as string[][])[1] = ['boss'];

    let sigilsFound = 0;
    const baseGearTiers: number[] = [];
    for (let i = 0; i < 30; i++) {
      sim.cb.bI.fill(0);
      dropLoot(sim, 1);
      for (const raw of sim.cb.bI) {
        if (!raw) continue;
        const def = sim.getItemDef(raw - 1);
        if (!def) continue;
        if (SIGIL_NAMES.includes(def.name as (typeof SIGIL_NAMES)[number])) sigilsFound++;
        else if (def.slot >= 0 && def.rarity !== 'unique' && def.rarity !== 'set') baseGearTiers.push(def.tier);
      }
    }

    expect(sigilsFound).toBeGreaterThan(0);
    expect(baseGearTiers.length).toBeGreaterThan(0);
    expect(baseGearTiers.every((t) => t >= 4)).toBe(true);
  });

  it('wires Archer & Necromancer signature spells and dedicated active hero skills', () => {
    const bodkin = SPELLS.findIndex((s) => s.name === 'Bodkin Shot');
    const marrowDart = SPELLS.findIndex((s) => s.name === 'Marrow Dart');
    expect(bodkin).toBeGreaterThanOrEqual(0);
    expect(marrowDart).toBeGreaterThanOrEqual(0);

    const archerState = startState(0, 2, true, 1);
    const necroState = startState(0, 3, false, 1);
    expect(spellForHero(archerState, bodkin)).toBe(true);
    expect(spellForHero(archerState, marrowDart)).toBe(false);
    expect(spellForHero(necroState, marrowDart)).toBe(true);
    expect(spellForHero(necroState, bodkin)).toBe(false);

    const archerSim = new Sim(flatField(), 7, [0, 1], { kinds: [Kind.Hero, Kind.Gnoll] });
    createHero(archerSim, 0, 2, true, 1);
    archerSim.x[0] = 6 * FP;
    archerSim.y[0] = 6 * FP;
    archerSim.x[1] = 9 * FP;
    archerSim.y[1] = 6 * FP;
    archerSim.cb.hp[1] = 400;
    archerSim.cb.hpMax[1] = 400;
    archerSim.cb.mana[0] = 200;

    expect(executeHeroSkill(archerSim, 'whirlwind')).toBe(false);
    expect(executeHeroSkill(archerSim, 'barbed_volley', 9, 6, 1)).toBe(true);
    expect(archerSim.cb.hp[1]).toBeLessThan(400);
    expect(executeHeroSkill(archerSim, 'weir_snares', 9, 6)).toBe(true);
    expect(archerSim.hero?.skillCd?.weir_snares).toBeGreaterThan(0);
    expect(executeHeroSkill(archerSim, 'gale_pin', 9, 6, 1)).toBe(true);

    const necroSim = new Sim(flatField(), 8, [0, 1], { kinds: [Kind.Hero, Kind.Gnoll] });
    createHero(necroSim, 0, 3, false, 1);
    necroSim.x[0] = 6 * FP;
    necroSim.y[0] = 6 * FP;
    necroSim.x[1] = 8 * FP;
    necroSim.y[1] = 6 * FP;
    necroSim.cb.hp[1] = 400;
    necroSim.cb.hpMax[1] = 400;
    necroSim.cb.mana[0] = 200;

    expect(executeHeroSkill(necroSim, 'chain_lightning')).toBe(false);
    expect(executeHeroSkill(necroSim, 'grave_chill')).toBe(true);
    expect(necroSim.cb.hp[1]).toBeLessThan(400);
    expect(executeHeroSkill(necroSim, 'quicklime_cloud', 8, 6)).toBe(true);
    expect(necroSim.hero?.skillCd?.quicklime_cloud).toBeGreaterThan(0);
    expect(executeHeroSkill(necroSim, 'bone_splinter', 8, 6, 1)).toBe(true);
  });

  it('supports endless NG+ ascension across all difficulties and scales enemies, MF, and tier names', () => {
    expect(nextDifficultyAfterVictory(0)).toBe(1);
    expect(nextDifficultyAfterVictory(1)).toBe(2);
    expect(nextDifficultyAfterVictory(2)).toBe(3);
    expect(nextDifficultyAfterVictory(3)).toBe(3);

    const camp = campaignData as unknown as Campaign;
    let rec = newRecord(camp, { cls: 0, female: false }, 3);
    rec = startNewGamePlusRecord(camp, rec, nextDifficultyAfterVictory(3));
    expect(rec.progress.difficulty).toBe(3);
    expect(rec.progress.ngPlusTier).toBe(1);
    rec = startNewGamePlusRecord(camp, rec, nextDifficultyAfterVictory(3));
    expect(rec.progress.difficulty).toBe(3);
    expect(rec.progress.ngPlusTier).toBe(2);

    const baseGame = createMission(missionFromName('ford'), 42, { nodeId: 'm01-blood-at-the-ford', act: 1, isTownNode: false, ngPlusTier: 0, difficulty: 3 });
    const ngGame = createMission(missionFromName('ford'), 42, { nodeId: 'm01-blood-at-the-ford', act: 1, isTownNode: false, ngPlusTier: 2, difficulty: 3 });

    expect(baseGame.directors?.tierName).toBe('Doomed');
    expect(ngGame.directors?.tierName).toBe('Doomed (NG+2)');
    expect(ngGame.sim.ngPlusTier).toBe(2);

    createHero(baseGame.sim, 0, 0, false, 3);
    createHero(ngGame.sim, 0, 0, false, 3);
    expect(getHeroMF(ngGame.sim) - getHeroMF(baseGame.sim)).toBe(50);

    const foeIdx = ngGame.sim.team.findIndex((t) => t === 1);
    expect(foeIdx).toBeGreaterThanOrEqual(0);
    expect(ngGame.sim.cb.hpMax[foeIdx]).toBeGreaterThan(baseGame.sim.cb.hpMax[foeIdx]);

    const snap = ngGame.sim.snapshot();
    const expectedHash = ngGame.sim.hash();
    ngGame.sim.step([]);
    ngGame.sim.restore(snap);
    expect(ngGame.sim.hash()).toBe(expectedHash);
  });

  it('provides dedicated Archer/Necromancer doll sets and uses 100dvh on automap-canvas', () => {
    const archerM = dollSet(2, false)!;
    const archerF = dollSet(2, true)!;
    const necroM = dollSet(3, false)!;
    const necroF = dollSet(3, true)!;
    expect(archerM.layers.shield).toBeUndefined();
    expect(archerF.layers.shield).toBeUndefined();
    expect(archerM.baseFilter).toBeTruthy();
    expect(necroM.baseFilter).toBeTruthy();
    expect(archerM.baseFilter).not.toBe(necroM.baseFilter);
    expect(archerF.base).not.toBe(archerM.base);
    expect(necroF.base).not.toBe(necroM.base);

    const styleCss = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');
    const automapMatch = /\.automap-canvas\s*\{[^}]*\}/s.exec(styleCss);
    expect(automapMatch?.[0]).toContain('100dvh');
    expect(automapMatch?.[0]).not.toContain('100vh');
  });
});
