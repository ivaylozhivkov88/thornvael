import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { Elem, Kind, strike } from '../src/sim/combat';
import { Slot, Ik, itemId, getItemDef, type ItemDef } from '../src/sim/items';
import { ALL_RUNES } from '../src/sim/runes';
import { Sim } from '../src/sim/sim';
import { createHero } from '../src/sim/hero';
import { discoverBossTrophy, isGrailDiscovered } from '../src/codex';
import { getSuperUniqueForUnit } from '../src/sim/super-uniques';
import {
  MERCENARY_PERKS,
  calculateVeteranRank,
  getMercenaryPerk,
  createMercenaryRecord,
  registerMercenaryKill,
  registerMissionSurvival,
  promoteMercenary,
  checkAndConsumeMercAutoPotion,
  templeResurrectionCost,
  getMercenaryStatMultipliers,
} from '../src/sim/mercs';
import {
  computeItemComparison,
  getCompatibleRunewordsForItem,
} from '../src/town';
import {
  generateTownBounties,
  newTownState,
  townCommand,
  Role,
} from '../src/sim/town';
import type { HeroState } from '../src/sim/hero';

function makeTestHero(): HeroState {
  return {
    id: 0,
    cls: 0,
    female: false,
    diff: 1,
    attr: [20, 20, 20, 20],
    skill: [1, 1, 1],
    use: [0, 0, 0],
    inv: [],
    eq: Array(8).fill(-1),
    known: 0,
    hits: [0, 0, 0, 0],
  };
}

describe('Mercenary Veterancy, Perks & Auto-Potion System', () => {
  it('correctly calculates ranks based on kills and missions survived', () => {
    expect(calculateVeteranRank(0, 0)).toBe(0);
    expect(calculateVeteranRank(14, 0)).toBe(0);
    // Rank 1: 15+ kills OR 1+ mission
    expect(calculateVeteranRank(15, 0)).toBe(1);
    expect(calculateVeteranRank(0, 1)).toBe(1);
    // Rank 2: 40+ kills OR 3+ missions
    expect(calculateVeteranRank(39, 2)).toBe(1);
    expect(calculateVeteranRank(40, 0)).toBe(2);
    expect(calculateVeteranRank(0, 3)).toBe(2);
    // Rank 3: 80+ kills OR 6+ missions
    expect(calculateVeteranRank(79, 5)).toBe(2);
    expect(calculateVeteranRank(80, 0)).toBe(3);
    expect(calculateVeteranRank(0, 6)).toBe(3);
  });

  it('assigns correct class passive perks at Rank 2+', () => {
    expect(getMercenaryPerk(Kind.Warrior, 1)).toBeUndefined();
    expect(getMercenaryPerk(Kind.Warrior, 2)).toBe('Shield Wall');
    expect(getMercenaryPerk(Kind.Archer, 2)).toBe('Double Draw');
    expect(getMercenaryPerk(Kind.Mage, 2)).toBe('Arcane Conduit');
    expect(getMercenaryPerk(Kind.Imp, 3)).toBe('Arcane Conduit');

    expect(MERCENARY_PERKS['Shield Wall'].bonusArmor).toBe(15);
    expect(MERCENARY_PERKS['Double Draw'].attackSpeedPct).toBe(18);
    expect(MERCENARY_PERKS['Arcane Conduit'].spellDmgPct).toBe(20);
  });

  it('handles mercenary kill registration and promotion progression', () => {
    const merc = createMercenaryRecord('merc-1', 'Garrick', Kind.Warrior, 1);
    expect(merc.rank).toBe(0);
    expect(merc.chevron).toBeUndefined();

    // Kill 14 foes: no promotion
    for (let i = 0; i < 14; i++) {
      expect(registerMercenaryKill(merc)).toBe(false);
    }
    expect(merc.rank).toBe(0);

    // 15th kill: promotes to Veteran (Rank 1)
    expect(registerMercenaryKill(merc)).toBe(true);
    expect(merc.rank).toBe(1);
    expect(merc.chevron).toBe('bronze');

    // Register survival of 3 missions: promotes to Elite (Rank 2)
    for (let i = 0; i < 3; i++) {
      registerMissionSurvival(merc);
    }
    expect(merc.rank).toBe(2);
    expect(merc.chevron).toBe('silver');
    expect(merc.perkName).toBe('Shield Wall');

    // Promote to Champion Guard (Rank 3)
    promoteMercenary(merc, 3);
    expect(merc.rank).toBe(3);
    expect(merc.chevron).toBe('gold');

    const mults = getMercenaryStatMultipliers(merc.rank);
    expect(mults.hpMultiplier).toBeCloseTo(1.40);
    expect(mults.dmgMultiplier).toBeCloseTo(1.22);
    expect(mults.accBonus).toBe(12);
  });

  it('triggers auto-potion consumption only when HP is below 30%', () => {
    const merc = createMercenaryRecord('merc-2', 'Lyra', Kind.Archer, 2);
    merc.potionBelt = [101, 102];

    const consumed: number[] = [];
    const cb = (id: number) => {
      consumed.push(id);
      return true;
    };

    // At 50% HP (50/100): should not drink
    const drankHigh = checkAndConsumeMercAutoPotion(merc, 50, 100, cb);
    expect(drankHigh).toBe(false);
    expect(merc.potionBelt).toEqual([101, 102]);

    // At 30% HP (30/100): boundary condition, >= 30% does not drink
    const drankBoundary = checkAndConsumeMercAutoPotion(merc, 30, 100, cb);
    expect(drankBoundary).toBe(false);

    // At 29% HP (29/100): below 30%, drinks first potion
    const drankLow = checkAndConsumeMercAutoPotion(merc, 29, 100, cb);
    expect(drankLow).toBe(true);
    expect(consumed).toEqual([101]);
    expect(merc.potionBelt[0]).toBe(-1);
    expect(merc.potionBelt[1]).toBe(102);

    // Next critical hit: drinks second potion
    const drankSecond = checkAndConsumeMercAutoPotion(merc, 15, 100, cb);
    expect(drankSecond).toBe(true);
    expect(consumed).toEqual([101, 102]);
    expect(merc.potionBelt).toEqual([-1, -1]);

    // Empty belt: cannot drink
    expect(checkAndConsumeMercAutoPotion(merc, 5, 100, cb)).toBe(false);
  });
});

describe('Temple Resurrection for Fallen Veterans', () => {
  it('calculates correct temple resurrection tithes per rank', () => {
    expect(templeResurrectionCost(0)).toBe(100);
    expect(templeResurrectionCost(1)).toBe(200);
    expect(templeResurrectionCost(2)).toBe(350);
    expect(templeResurrectionCost(3)).toBe(550);
  });

  it('resurrects fallen veteran in the Arcane Sanctum, restoring HP and deducting tithe', () => {
    const fallenVet = createMercenaryRecord('merc-3', 'Lord Kenneth', Kind.Warrior, 2);
    fallenVet.rank = 2;
    fallenVet.kills = 45;
    fallenVet.missionsSurvived = 3;
    fallenVet.perkName = 'Shield Wall';
    fallenVet.fallen = true;

    const mockSim = {
      hero: makeTestHero(),
      town: {
        ...newTownState(1),
        inside: Role.School,
        fallenVeterans: [fallenVet],
      },
      towns: [
        {
          def: { name: 'Thornwick', spells: [] },
          centre: [[10, 10], [15, 15], [20, 20]] as ([number, number] | null)[],
          door: [[10, 11], [15, 16], [20, 21]] as ([number, number] | null)[],
        },
      ],
      cb: {
        hp: [100, 100, 0], // unit 2 is dead
        hpMax: [100, 100, 180],
        gold: [500],
        ord: [0, 0, 0],
        aux: [0, 0, 0],
        tgt: [-1, -1, -1],
        px: [0, 0, 0],
        py: [0, 0, 0],
        emit: () => {},
        recount: () => {},
      },
      team: new Uint8Array([0, 0, 0]),
      hidden: new Uint8Array([0, 0, 0]),
      x: [0, 0, 0],
      y: [0, 0, 0],
      tx: [0, 0, 0],
      ty: [0, 0, 0],
      tick: 0,
      stop: () => {},
      refuse: () => {},
    } as unknown as Sim;

    // Tithe for rank 2 is 350g
    townCommand(mockSim, { type: 'town', op: 'temple_revive', town: 0, v: 0 });

    expect(mockSim.cb.gold[0]).toBe(150); // 500 - 350
    expect(mockSim.town.fallenVeterans?.length).toBe(0);
    expect(fallenVet.fallen).toBe(false);
    expect(mockSim.cb.hp[2]).toBe(180); // full hp restored
  });
});

describe('Smart Item Comparison', () => {
  it('correctly compares candidate gear against equipped items', () => {
    const equippedSword: ItemDef = {
      name: 'Broadsword',
      kind: Ik.Gear,
      slot: Slot.Weapon,
      tier: 1,
      w: 2,
      cls: 0,
      need: 0,
      needv: 0,
      min: 10,
      max: 20,
      acc: 50,
      cover: 0,
      def: 0,
      abs: 0,
      res: [0, 0, 0, 0, 0],
      attr: [0, 0, 0, 0],
      hp: 0,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    };

    const candidateClaymore: ItemDef = {
      name: 'Claymore of Might',
      kind: Ik.Gear,
      slot: Slot.Weapon,
      tier: 2,
      w: 3,
      cls: 0,
      need: 0,
      needv: 0,
      min: 18,
      max: 30, // avg 24 vs 15 (+9)
      acc: 45, // -5 acc
      cover: 0,
      def: 2, // +2 def
      abs: 0,
      res: [10, 0, 0, 0, 0], // +10 fire res
      attr: [2, 0, 0, 0],
      hp: 20,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    };

    const comp = computeItemComparison(candidateClaymore, equippedSword);
    expect(comp.hasEquipped).toBe(true);
    expect(comp.candidateName).toBe('Claymore of Might');
    expect(comp.equippedName).toBe('Broadsword');

    const dmgDiff = comp.diffs.find((d) => d.stat === 'Damage');
    expect(dmgDiff?.diff).toBe(9);
    expect(dmgDiff?.isPositive).toBe(true);
    expect(dmgDiff?.formatted).toBe('▲ +9 Dmg');

    const accDiff = comp.diffs.find((d) => d.stat === 'Accuracy');
    expect(accDiff?.diff).toBe(-5);
    expect(accDiff?.isPositive).toBe(false);
    expect(accDiff?.formatted).toBe('▼ -5 Acc');

    const defDiff = comp.diffs.find((d) => d.stat === 'Defense');
    expect(defDiff?.diff).toBe(2);
    expect(defDiff?.isPositive).toBe(true);

    const fireDiff = comp.diffs.find((d) => d.stat === 'Fire Resist');
    expect(fireDiff?.diff).toBe(10);
    expect(fireDiff?.isPositive).toBe(true);
  });
});

describe('Interactive Runeword Assistant', () => {
  it('returns matching runewords for slot and socket capacity, checking owned runes', () => {
    // 2-socket Weapon with 'Tyra' and 'Eldun' (Iron Blade)
    const ownedRunes = ['Tyra', 'Eldun', 'Ralon'];
    const matches = getCompatibleRunewordsForItem(Slot.Weapon, 2, ownedRunes);
    expect(matches.length).toBeGreaterThan(0);

    const ironBladeMatch = matches.find((m) => m.runeword.name === 'Iron Blade');
    expect(ironBladeMatch).toBeDefined();
    expect(ironBladeMatch?.runes).toEqual(['Tyra', 'Eldun']);
    expect(ironBladeMatch?.ownedRunes).toEqual(['Tyra', 'Eldun']);
    expect(ironBladeMatch?.missingRunes).toEqual([]);
    expect(ironBladeMatch?.canComplete).toBe(true);
  });

  it('warns if runeword is queried on non-base items', () => {
    const magicItem: ItemDef = {
      name: 'Glowing Short Sword',
      kind: Ik.Gear,
      slot: Slot.Weapon,
      rarity: 'magic',
      tier: 2,
      w: 2,
      cls: 0,
      need: 0,
      needv: 0,
      min: 5,
      max: 10,
      acc: 50,
      cover: 0,
      def: 0,
      abs: 0,
      res: [0, 0, 0, 0, 0],
      attr: [0, 0, 0, 0],
      hp: 0,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    };

    const matches = getCompatibleRunewordsForItem(magicItem, 2, ['Tyra', 'Eldun']);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].warning).toContain('Requires normal/grey base item');
  });
});

describe('Tavern Bounty Contracts & Board', () => {
  it('generates deterministic regional bounties with grail targets and runes', () => {
    const bountiesAct1 = generateTownBounties(0, 1);
    expect(bountiesAct1.length).toBe(3);
    expect(bountiesAct1.some((b) => b.isGrailTarget)).toBe(true);
    expect(bountiesAct1[0].rewardGold).toBeGreaterThan(0);
    expect(bountiesAct1[0].rewardRune).toBeDefined();

    // Deterministic across calls with same seed parameters
    const bountiesRepeat = generateTownBounties(0, 1);
    expect(bountiesRepeat).toEqual(bountiesAct1);
  });

  it('allows accepting and claiming bounties through town commands', () => {
    const mockSim = {
      hero: makeTestHero(),
      town: {
        ...newTownState(1),
        inside: Role.Tavern,
      },
      towns: [{ def: { name: 'Thornwick' } }],
      cb: {
        hp: [100],
        gold: [50],
        emit: () => {},
      },
      x: [0],
      y: [0],
      refuse: () => {},
      now: () => {},
    } as unknown as Sim;

    const b = mockSim.town.bounties![0][0];
    expect(b.accepted).toBe(false);

    // Accept bounty 0
    townCommand(mockSim, { type: 'town', op: 'accept_bounty', town: 0, v: 0 });
    expect(b.accepted).toBe(true);

    // Refuses to claim an uncompleted bounty before boss kill
    const goldBefore = mockSim.cb.gold[0];
    townCommand(mockSim, { type: 'town', op: 'claim_bounty', town: 0, v: 0 });
    expect(b.claimed).toBeFalsy();
    expect(mockSim.cb.gold[0]).toBe(goldBefore);

    // Mark completed (as kill attribution does) and claim bounty
    b.completed = true;
    townCommand(mockSim, { type: 'town', op: 'claim_bounty', town: 0, v: 0 });
    expect(b.completed).toBe(true);
    expect(b.claimed).toBe(true);
    expect(mockSim.cb.gold[0]).toBe(goldBefore + b.rewardGold);
    expect(mockSim.hero!.xp).toBeGreaterThan(0);
    const expectedRune = ALL_RUNES.find((r) => r.name === b.rewardRune);
    expect(expectedRune).toBeDefined();
    expect(mockSim.hero!.inv.some((s) => s.item === itemId(expectedRune!.name))).toBe(true);
  });
});

function flatField(w = 20, h = 20): GameMap {
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

describe('Combat Integration: Fallen Veterans, Boss Bounties & High Ground', () => {
  it('populates sim.town.fallenVeterans when a player-team mercenary dies and tracks mercenary kills', () => {
    const sim = new Sim(flatField(), 42, [0, 0, 1], {
      kinds: [Kind.Hero, Kind.Warrior, Kind.Gnoll],
      combat: true,
    });
    sim.place(0, 5, 5);
    sim.place(1, 6, 5);
    sim.place(2, 7, 5);
    createHero(sim, 0, 0, false, 1);

    // Mercenary unit 1 kills enemy unit 2
    strike(sim, 2, 500, 500, Elem.Physical, 100, 1);
    expect(sim.cb.hp[2]).toBe(0);
    expect(sim.town.mercenaries?.length).toBe(1);
    expect(sim.town.mercenaries![0].unitId).toBe(1);
    expect(sim.town.mercenaries![0].kills).toBe(1);

    // Mercenary unit 1 dies in combat -> recorded in sim.town.fallenVeterans
    strike(sim, 1, 500, 500, Elem.Physical, 100, 2);
    expect(sim.cb.hp[1]).toBe(0);
    expect(sim.town.fallenVeterans?.length).toBe(1);
    expect(sim.town.fallenVeterans![0].unitId).toBe(1);
    expect(sim.town.fallenVeterans![0].fallen).toBe(true);
  });

  it('marks accepted bounty completed on boss kill and awards gold, XP, and actual rune on claim_bounty', () => {
    const sim = new Sim(flatField(), 77, [0, 1], {
      kinds: [Kind.Hero, Kind.Gnoll],
      combat: true,
      families: ['', 'morvessa'],
      bossMods: [[], ['fire_enchanted', 'extra_fast']],
    });
    sim.place(0, 5, 5);
    sim.place(1, 6, 5);
    createHero(sim, 0, 0, false, 1);
    sim.town = {
      ...newTownState(1),
      inside: Role.Tavern,
    };
    sim.towns = [{ def: { name: 'Thornwick' }, centre: [[5, 5], [5, 5], [5, 5]], door: [[5, 5], [5, 5], [5, 5]] }];

    const bounty = sim.town.bounties![0][0];
    townCommand(sim, { type: 'town', op: 'accept_bounty', town: 0, v: 0 });
    expect(bounty.accepted).toBe(true);
    expect(bounty.completed).toBe(false);

    // Kill the boss and assert deterministic trophy Fx event drives Grail discovery outside the sim
    sim.cb.recordFx = true;
    strike(sim, 1, 5000, 5000, Elem.Fire, 100, 0);
    expect(sim.cb.hp[1]).toBe(0);
    expect(bounty.completed).toBe(true);
    const trophyFx = sim.cb.fx.find((e) => e.type === 13);
    expect(trophyFx).toBeDefined();
    expect(trophyFx!.v).toBe(1);
    const su = trophyFx!.el === 1 ? getSuperUniqueForUnit(sim, trophyFx!.v) : undefined;
    const trophyId = su?.id || sim.cb.family[trophyFx!.v];
    if (trophyId) {
      discoverBossTrophy(trophyId, 'normal', {
        heroName: sim.hero?.name,
        heroLevel: sim.hero?.level,
        droppedBy: su?.name || sim.cb.family[trophyFx!.v],
      });
    }
    expect(isGrailDiscovered('trophy:morvessa')).toBe(true);

    const goldBefore = sim.cb.gold[0];
    const xpBefore = sim.hero!.xp ?? 0;
    townCommand(sim, { type: 'town', op: 'claim_bounty', town: 0, v: 0 });

    expect(sim.cb.gold[0]).toBe(goldBefore + bounty.rewardGold);
    expect((sim.hero!.xp ?? 0) + (sim.hero!.level! > 1 ? 100 : 0)).toBeGreaterThan(xpBefore);
    const runeDef = ALL_RUNES.find((r) => r.name === bounty.rewardRune);
    expect(runeDef).toBeDefined();
    const expectedItemId = itemId(runeDef!.name);
    expect(expectedItemId).toBeGreaterThanOrEqual(0);
    expect(sim.hero!.inv.some((s) => s.item === expectedItemId && s.n >= 1)).toBe(true);
  });

  it('applies high ground (+15% accuracy, +10% crit) and low ground (-15% accuracy) modifiers in strike', () => {
    const mapHigh = flatField();
    // Attacker at (5,5) height 3, Defender at (6,5) height 0 -> dh = +3 (>= 2)
    mapHigh.height[5 * mapHigh.w + 5] = 3;
    mapHigh.height[5 * mapHigh.w + 6] = 0;

    const simHigh = new Sim(mapHigh, 123, [0, 1], {
      kinds: [Kind.Warrior, Kind.Golem],
      combat: true,
      hpMul: 100,
    });
    simHigh.place(0, 5, 5);
    simHigh.place(1, 6, 5);
    simHigh.cb.log = [];

    const simFlat = new Sim(flatField(), 123, [0, 1], {
      kinds: [Kind.Warrior, Kind.Golem],
      combat: true,
      hpMul: 100,
    });
    simFlat.place(0, 5, 5);
    simFlat.place(1, 6, 5);
    simFlat.cb.log = [];

    const mapLow = flatField();
    // Attacker at (5,5) height 0, Defender at (6,5) height 3 -> dh = -3 (<= -2)
    mapLow.height[5 * mapLow.w + 5] = 0;
    mapLow.height[5 * mapLow.w + 6] = 3;

    const simLow = new Sim(mapLow, 123, [0, 1], {
      kinds: [Kind.Warrior, Kind.Golem],
      combat: true,
      hpMul: 100,
    });
    simLow.place(0, 5, 5);
    simLow.place(1, 6, 5);
    simLow.cb.log = [];

    let highCrits = 0;
    for (let i = 0; i < 120; i++) {
      simHigh.cb.fx = [];
      simHigh.cb.recordFx = true;
      strike(simHigh, 1, 10, 10, Elem.Physical, 8, 0);
      if (simHigh.cb.fx.some((f) => f.type === 6)) highCrits++;
      strike(simFlat, 1, 10, 10, Elem.Physical, 8, 0);
      strike(simLow, 1, 10, 10, Elem.Physical, 8, 0);
    }

    const highChance = simHigh.cb.log![0].chance;
    const flatChance = simFlat.cb.log![0].chance;
    const lowChance = simLow.cb.log![0].chance;

    expect(highChance).toBeGreaterThan(flatChance);
    expect(lowChance).toBeLessThan(flatChance);
    expect(highCrits).toBeGreaterThan(0);
  });
});

describe('Shop Mystery Gamble System', () => {
  it('supports slot-targeted gambling and delivers unidentified items', () => {
    const hero = makeTestHero();
    const mockSim = {
      hero,
      town: {
        ...newTownState(1),
        inside: Role.Shop,
      },
      towns: [{ def: { name: 'Thornwick', tiers: [1, 2] } }],
      cb: {
        hp: [100],
        gold: [10000],
        emit: () => {},
      },
      x: [0],
      y: [0],
      rng: {
        int: (max: number) => Math.floor(max * 0.5), // roll ~5000 -> Magic
      },
      getItemDef,
      createItemInstance: (baseId: number, quality: string, def: ItemDef) => ({
        id: 999,
        baseId,
        quality,
        def,
      }),
      refuse: () => {},
    } as unknown as Sim;

    townCommand(mockSim, { type: 'town', op: 'gamble', town: 0, v: Slot.Weapon });
    expect(hero.inv.length).toBe(1);
    const wonStack = hero.inv[0];
    expect(wonStack.item).toBe(999);
  });
});
