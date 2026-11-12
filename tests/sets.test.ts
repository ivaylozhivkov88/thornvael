import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { Kind, M, MODN } from '../src/sim/combat';
import { addItem, createHero, derive, totals } from '../src/sim/hero';
import { Cls, ITEMS, Part, Slot, itemId } from '../src/sim/items';
import {
  ALL_SETS,
  ALL_SET_ITEMS,
  SET_IRON_WARDEN,
  SET_PYROMANCER,
  SET_SHADOW_STALKER,
  calculateActiveSetBonuses,
  findSetByItemName,
  isSetItem,
} from '../src/sim/sets';
import { Sim, type Command } from '../src/sim/sim';

function field(w: number, h: number): GameMap {
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

function createTestWorld(cls: number, diff = 1, seed = 42): Sim {
  const kinds = [Kind.Hero, Kind.Gnoll];
  const sim = new Sim(field(30, 30), seed, [0, 1], { kinds, combat: true });
  sim.place(0, 5, 5);
  sim.place(1, 10, 10);
  createHero(sim, 0, cls, false, diff);
  return sim;
}

const cmd = (sim: Sim, c: Command): void => sim.step([c]);

const giveAndEquip = (sim: Sim, name: string): void => {
  const id = itemId(name);
  expect(id, `item "${name}" must exist in ITEMS`).toBeGreaterThanOrEqual(0);
  expect(addItem(sim.hero!, id)).toBe(0);
  cmd(sim, { type: 'hero', op: 'equip', item: id });
};

describe('Item Sets System definitions and lookups', () => {
  it('registers all 8 complete item sets with piece items', () => {
    expect(ALL_SETS).toHaveLength(8);
    expect(ALL_SET_ITEMS).toHaveLength(32);

    for (const piece of ALL_SET_ITEMS) {
      expect(isSetItem(piece.name)).toBe(true);
      const set = findSetByItemName(piece.name);
      expect(set).toBeDefined();
      expect(set!.pieces.some((p) => p.name === piece.name)).toBe(true);
      expect(itemId(piece.name)).toBeGreaterThanOrEqual(0);
    }

    expect(isSetItem('Rusty Sword')).toBe(false);
    expect(findSetByItemName('Rusty Sword')).toBeUndefined();
  });

  it('calculateActiveSetBonuses returns empty for 0 or 1 pieces and accumulates tiers', () => {
    expect(calculateActiveSetBonuses([])).toEqual([]);
    expect(calculateActiveSetBonuses(["Iron Warden's Visor"])).toEqual([]);

    // Pieces across different sets do not combine
    expect(
      calculateActiveSetBonuses(["Iron Warden's Visor", "Ember-Weaver's Focus"])
    ).toEqual([]);

    // 2 pieces of Iron Warden
    const bonuses2 = calculateActiveSetBonuses([
      "Iron Warden's Visor",
      "Iron Warden's Tower",
    ]);
    expect(bonuses2).toHaveLength(1);
    expect(bonuses2[0].pieces).toBe(2);
    expect(bonuses2[0].hp).toBe(15);
    expect(bonuses2[0].def).toBe(2);

    // 3 pieces of Iron Warden
    const bonuses3 = calculateActiveSetBonuses([
      "Iron Warden's Visor",
      "Iron Warden's Tower",
      "Iron Warden's Hauberk",
    ]);
    expect(bonuses3).toHaveLength(2);
    expect(bonuses3.map((b) => b.pieces)).toEqual([2, 3]);

    // 4 pieces (Full Set) of Iron Warden
    const bonuses4 = calculateActiveSetBonuses([
      "Iron Warden's Visor",
      "Iron Warden's Tower",
      "Iron Warden's Hauberk",
      "Iron Warden's Greaves",
    ]);
    expect(bonuses4).toHaveLength(3);
    expect(bonuses4.map((b) => b.pieces)).toEqual([2, 3, 4]);
  });
});

describe("Warrior Set: Iron Warden's Bastion (4 pieces)", () => {
  it('equipping 1 piece gives only base stats (no set bonus)', () => {
    const sim = createTestWorld(Cls.Warrior);
    const hero = sim.hero!;
    // Set base Body high enough to equip the tier 3 armor pieces
    hero.attr[0] = 18;

    const baseDerive = derive(hero);
    const baseTotals = totals(hero);

    giveAndEquip(sim, "Iron Warden's Visor");
    expect(hero.eq[Slot.Helm]).toBe(itemId("Iron Warden's Visor"));

    const equippedDerive = derive(hero);
    const equippedTotals = totals(hero);

    // Visor base: attr [1, 0, 0, 0] (Body +1), def 3 (Head), abs 4 (Head), hp 20, res [0,0,0,10,0]
    expect(equippedTotals[0]).toBe(baseTotals[0] + 1);
    expect(equippedTotals[1]).toBe(baseTotals[1]);
    expect(equippedTotals[2]).toBe(baseTotals[2]);
    expect(equippedTotals[3]).toBe(baseTotals[3]);

    // HP max increases by 20 from item base hp + 10 from Body +1
    expect(equippedDerive.hpMax).toBe(baseDerive.hpMax + 30);
    // Head armor gets base item def (3) and abs (4)
    expect(equippedDerive.pdef[Part.Head]).toBe(baseDerive.pdef[Part.Head] + 3);
    expect(equippedDerive.pabs[Part.Head]).toBe(baseDerive.pabs[Part.Head] + 4);
    // Other parts are unchanged
    expect(equippedDerive.pdef[Part.Torso]).toBe(baseDerive.pdef[Part.Torso]);
    expect(equippedDerive.pabs[Part.Torso]).toBe(baseDerive.pabs[Part.Torso]);
  });

  it('equipping 2 pieces activates 2-piece set bonus (hp +15, def +2)', () => {
    const sim = createTestWorld(Cls.Warrior);
    const hero = sim.hero!;
    hero.attr[0] = 18;

    giveAndEquip(sim, "Iron Warden's Visor");
    const onePieceDerive = derive(hero);

    giveAndEquip(sim, "Iron Warden's Tower");
    const twoPieceDerive = derive(hero);

    // Tower base stats: hp 15, def 4 (arms), abs 3 (arms), res [15,0,0,15,0], attr [0,0,0,0]
    // 2-piece set bonus: hp +15, def +2 (across all body parts)
    // Total hpMax difference = Tower hp (15) + set bonus hp (15) = +30
    expect(twoPieceDerive.hpMax).toBe(onePieceDerive.hpMax + 30);

    // Part Torso: 0 from tower base, +2 from set bonus def
    expect(twoPieceDerive.pdef[Part.Torso]).toBe(onePieceDerive.pdef[Part.Torso] + 2);
    // Part Head: Visor base (3) + 2 from set bonus = 5
    expect(twoPieceDerive.pdef[Part.Head]).toBe(onePieceDerive.pdef[Part.Head] + 2);
    // Part Arms: Tower base (4) + 2 from set bonus = +6
    expect(twoPieceDerive.pdef[Part.Arms]).toBe(onePieceDerive.pdef[Part.Arms] + 6);
  });

  it('equipping 3 pieces activates 2-piece AND 3-piece set bonuses', () => {
    const sim = createTestWorld(Cls.Warrior);
    const hero = sim.hero!;
    hero.attr[0] = 18;

    giveAndEquip(sim, "Iron Warden's Visor");
    giveAndEquip(sim, "Iron Warden's Tower");
    const twoPieceDerive = derive(hero);
    const twoPieceTotals = totals(hero);

    // Hauberk base stats: attr [1,0,0,0] (Body +1), def 2 (torso+arms), abs 5 (torso+arms), hp 35, res [0,0,0,10,0]
    // 3-piece set bonus: res [15,0,0,15,0], attr [2,0,0,0] (Body +2)
    giveAndEquip(sim, "Iron Warden's Hauberk");
    const threePieceDerive = derive(hero);
    const threePieceTotals = totals(hero);

    // Total Body gain = Hauberk base (+1) + set bonus (+2) = +3
    expect(threePieceTotals[0]).toBe(twoPieceTotals[0] + 3);

    // Earth resistance (index 3): Hauberk base (10) + set bonus (15) = +25
    expect(threePieceDerive.res[3]).toBe(twoPieceDerive.res[3] + 25);
    // Fire resistance (index 0): set bonus (15)
    expect(threePieceDerive.res[0]).toBe(twoPieceDerive.res[0] + 15);
  });

  it('equipping full set (4 pieces) activates all tiers including full set bonuses', () => {
    const sim = createTestWorld(Cls.Warrior);
    const hero = sim.hero!;
    hero.attr[0] = 18;

    giveAndEquip(sim, "Iron Warden's Visor");
    giveAndEquip(sim, "Iron Warden's Tower");
    giveAndEquip(sim, "Iron Warden's Hauberk");
    const threePieceDerive = derive(hero);

    // Greaves base stats: attr [0,0,0,1] (Spirit +1), def 2 (legs), abs 2 (legs), hp 15
    // Full set (4-piece) bonus: hp +50, abs +4 (all parts), attr [3,0,0,0] (Body +3), res [15,15,15,15,15]
    giveAndEquip(sim, "Iron Warden's Greaves");
    const fullSetDerive = derive(hero);
    const fullTotals = totals(hero);

    // Body gets +3 from full set bonus
    // Spirit gets +1 from Greaves
    expect(fullTotals[3]).toBeGreaterThan(threePieceDerive.attr[3]);

    // HP max gets: Greaves hp (15) + set bonus hp (50) + Body bonus hp (3 * 10 = 30) = +95
    expect(fullSetDerive.hpMax).toBe(threePieceDerive.hpMax + 95);

    // Absorption across all parts gets +4 from set bonus
    expect(fullSetDerive.pabs[Part.Head]).toBe(threePieceDerive.pabs[Part.Head] + 4);
    expect(fullSetDerive.pabs[Part.Torso]).toBe(threePieceDerive.pabs[Part.Torso] + 4);
  });
});

describe("Mage Set: Pyromancer's Ember-Veil (3 pieces)", () => {
  it('progressively activates mage mana, fire resistance, and spell power', () => {
    const sim = createTestWorld(Cls.Mage);
    const hero = sim.hero!;
    hero.eq.fill(-1); // Start unequipped
    hero.attr[2] = 18; // Mind
    hero.attr[3] = 15; // Spirit

    const bare = derive(hero);

    // 1 piece: Ember-Weaver's Focus
    giveAndEquip(sim, "Ember-Weaver's Focus");
    const p1 = derive(hero);
    expect(p1.manaMax).toBe(bare.manaMax + 25 + 7 * 1); // item mana (25) + Mind attr (+1 = 7 mana)
    expect(p1.pow).toBe(bare.pow + 18 + 3 * 1); // item pow (18) + Mind attr (+1 = 3 pow)
    expect(p1.res[0]).toBe(bare.res[0] + 15); // base fire res

    // 2 pieces: add Robe of the Blazing Core
    // Robe base: mana 20, pow 8, Mind +1 (+7 mana, +3 pow), def 1, abs 2, res [30,0,0,0,0]
    // 2-piece set bonus: mana +25, res [15,0,0,0,0], pow +10
    giveAndEquip(sim, 'Robe of the Blazing Core');
    const p2 = derive(hero);
    expect(p2.manaMax).toBe(p1.manaMax + 20 + 7 * 1 + 25);
    expect(p2.pow).toBe(p1.pow + 8 + 3 * 1 + 10);
    expect(p2.res[0]).toBe(p1.res[0] + 30 + 15);

    // 3 pieces (Full Set): add Heart of Cinders
    // Heart base: mana 15, pow 10, Spirit +1, res [25,0,0,0,0]
    // Full set bonus: mana +50, res [25,0,0,0,0], pow +20, attr [0,0,2,2] (Mind +2, Spirit +2)
    giveAndEquip(sim, 'Heart of Cinders');
    const p3 = derive(hero);
    const tot3 = totals(hero);

    // Mind includes +2 from set bonus + 1 Focus + 1 Robe
    expect(tot3[2]).toBe(hero.attr[2] + 1 + 1 + 2);
    // Spirit includes +2 from set bonus + 1 Heart
    expect(tot3[3]).toBe(hero.attr[3] + 1 + 2);

    // Mana max increase: item mana 15 + set bonus 50 + Mind attr bonus (2 * 7 = 14) = +79
    expect(p3.manaMax).toBe(p2.manaMax + 15 + 50 + 14);
    // Pow increase: item pow 10 + set bonus 20 + Mind attr bonus (2 * 3 = 6) = +36
    expect(p3.pow).toBe(p2.pow + 10 + 20 + 6);
  });
});

describe("Rogue/Both Set: Shadow-Stalker's Silent Walk (3 pieces)", () => {
  it('activates agility, accuracy, damage and hybrid stats', () => {
    const sim = createTestWorld(Cls.Warrior);
    const hero = sim.hero!;
    hero.attr[1] = 18; // Agility

    const bare = derive(hero);

    giveAndEquip(sim, "Shadow-Stalker's Cowl");
    const p1 = derive(hero);
    expect(p1.acc).toBe(bare.acc + 4); // base cowl acc 4

    giveAndEquip(sim, 'Boots of the Mist-Strider');
    const p2 = derive(hero);
    // Boots base acc 2 + set bonus acc 5 + Agility set bonus +2 (which gives +1 acc from agility >> 1)
    expect(p2.acc).toBeGreaterThanOrEqual(p1.acc + 7);
    expect(p2.hpMax).toBeGreaterThan(p1.hpMax + 15); // +10 item hp + 15 set bonus hp

    giveAndEquip(sim, 'Grip of the Night-Hunter');
    const p3 = derive(hero);
    // Full set adds: min +5, max +5, acc +10, hp +30, attr [0,4,0,0]
    expect(p3.min).toBeGreaterThanOrEqual(p2.min + 5);
    expect(p3.max).toBeGreaterThanOrEqual(p2.max + 5);
    expect(totals(hero)[1]).toBe(hero.attr[1] + 1 + 1 + 1 + 2 + 4); // 3 items + 2-pc bonus + 3-pc bonus
  });
});

describe('Simulation determinism and combat array sync', () => {
  it('recalc synchronizes derived stats into combat arrays (mod, hpMax, manaMax)', () => {
    const sim = createTestWorld(Cls.Warrior);
    const hero = sim.hero!;
    hero.attr[0] = 18;

    giveAndEquip(sim, "Iron Warden's Visor");
    giveAndEquip(sim, "Iron Warden's Tower");

    const d = derive(hero);
    const o = hero.id * MODN;

    expect(sim.cb.hpMax[hero.id]).toBe(d.hpMax);
    expect(sim.cb.manaMax[hero.id]).toBe(d.manaMax);
    expect(sim.cb.mod[o + M.Min]).toBe(d.min);
    expect(sim.cb.mod[o + M.Max]).toBe(d.max);
    expect(sim.cb.mod[o + M.Acc]).toBe(d.acc);
    expect(sim.cb.mod[o + M.Def]).toBe(d.def);
    expect(sim.cb.mod[o + M.Abs]).toBe(d.abs);
    for (let k = 0; k < 4; k++) {
      expect(sim.cb.mod[o + M.PDef + k]).toBe(d.pdef[k]);
      expect(sim.cb.mod[o + M.PAbs + k]).toBe(d.pabs[k]);
    }
    for (let k = 0; k < 5; k++) {
      expect(sim.cb.mod[o + M.Res + k]).toBe(d.res[k]);
    }
  });

  it('produces identical state hash across independent simulation runs with set equipment', () => {
    const runSim = (seed: number): { hash: number; sim: Sim } => {
      const sim = createTestWorld(Cls.Warrior, 1, seed);
      sim.hero!.attr[0] = 20;

      giveAndEquip(sim, "Iron Warden's Visor");
      giveAndEquip(sim, "Iron Warden's Tower");
      giveAndEquip(sim, "Iron Warden's Hauberk");
      giveAndEquip(sim, "Iron Warden's Greaves");

      // Run 50 simulation steps with orders
      for (let t = 0; t < 50; t++) {
        sim.step([]);
      }
      return { hash: sim.hash(), sim };
    };

    const runA = runSim(12345);
    const runB = runSim(12345);

    expect(runA.hash).toBe(runB.hash);
    expect(runA.hash).not.toBe(0);
  });

  it('preserves exact state hash on snapshot save and restore with active set bonuses', () => {
    const sim = createTestWorld(Cls.Warrior, 1, 999);
    sim.hero!.attr[0] = 20;

    giveAndEquip(sim, "Iron Warden's Visor");
    giveAndEquip(sim, "Iron Warden's Tower");

    for (let t = 0; t < 20; t++) sim.step([]);

    const beforeSnapHash = sim.hash();
    const snap = sim.snapshot();

    // Take more steps
    for (let t = 0; t < 30; t++) sim.step([]);
    expect(sim.hash()).not.toBe(beforeSnapHash);

    // Restore snapshot
    sim.restore(snap);
    expect(sim.hash()).toBe(beforeSnapHash);
  });
});
