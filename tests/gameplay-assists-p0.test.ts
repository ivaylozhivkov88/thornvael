import { describe, expect, it } from 'vitest';
import { type GameMap, Terrain } from '../src/map';
import {
  DEFAULT_GAMEPLAY_ASSISTS,
  DEFAULT_PREFERENCES,
  getGameplayAssists,
  type Preferences,
  readPreferences,
  writePreference,
} from '../src/preferences';
import { Kind } from '../src/sim/combat';
import { FP, Sim } from '../src/sim/sim';
import {
  computeHighGroundBonus,
  computeRegroupFormation,
  evaluateAutoCast,
  getChaseRadiusForStance,
  performLootSweep,
  stepAutoNavigate,
} from '../src/sim/tactics';

function createMockStore() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, val: string) => {
      map.set(key, val);
    },
  };
}

function createTestMap(w = 32, h = 32, heights?: number[]): GameMap {
  const terrain = new Uint8Array(w * h).fill(Terrain.Grass);
  const height = new Uint8Array(w * h).fill(0);
  if (heights) {
    for (let i = 0; i < heights.length && i < height.length; i++) {
      height[i] = heights[i]!;
    }
  }
  const light = new Uint8Array(w * h).fill(255);
  const blocked = new Uint8Array(w * h).fill(0);
  const objects: { id: number; kind: number; x: number; y: number }[] = [];
  return { w, h, terrain, height, light, blocked, objects };
}

describe('P0.0: Optional Gameplay Assists in Preferences', () => {
  it('reads correct default assists', () => {
    const store = createMockStore();
    const prefs = readPreferences(store);
    expect(prefs.autoCastMode).toBe('per-spell');
    expect(prefs.autoHealThresholdPct).toBe(65);
    expect(prefs.manaReservePct).toBe(15);
    expect(prefs.autoNavigateObjectives).toBe(false);
    expect(prefs.autoFightMode).toBe('off');
    expect(prefs.autoLootSweep).toBe(false);
    expect(prefs.autoPotionThresholdPct).toBe(0);

    const assists = getGameplayAssists(prefs);
    expect(assists).toEqual(DEFAULT_GAMEPLAY_ASSISTS);
  });

  it('persists and validates gameplay assist choices', () => {
    const store = createMockStore();

    // Auto-Cast Mode
    expect(writePreference('autoCastMode', 'smart', store)).toBe(true);
    expect(writePreference('autoCastMode', 'off', store)).toBe(true);
    expect(writePreference('autoCastMode', 'invalid' as unknown as 'off', store)).toBe(false);

    // Auto-Fight Mode
    expect(writePreference('autoFightMode', 'tactical', store)).toBe(true);
    expect(writePreference('autoFightMode', 'self-defense', store)).toBe(true);
    expect(writePreference('autoFightMode', 'berserk' as unknown as 'off', store)).toBe(false);

    // Auto-Go & Loot Sweep
    expect(writePreference('autoNavigateObjectives', true, store)).toBe(true);
    expect(writePreference('autoLootSweep', true, store)).toBe(true);

    // Clamped thresholds
    expect(writePreference('autoHealThresholdPct', 75, store)).toBe(true);
    expect(writePreference('autoHealThresholdPct', 10, store)).toBe(false); // below 25
    expect(writePreference('autoHealThresholdPct', 95, store)).toBe(false); // above 90

    expect(writePreference('manaReservePct', 25, store)).toBe(true);
    expect(writePreference('manaReservePct', -5, store)).toBe(false);
    expect(writePreference('manaReservePct', 60, store)).toBe(false); // above 50

    expect(writePreference('autoPotionThresholdPct', 30, store)).toBe(true);

    const readBack = readPreferences(store);
    expect(readBack.autoCastMode).toBe('off');
    expect(readBack.autoFightMode).toBe('self-defense');
    expect(readBack.autoNavigateObjectives).toBe(true);
    expect(readBack.autoLootSweep).toBe(true);
    expect(readBack.autoHealThresholdPct).toBe(75);
    expect(readBack.manaReservePct).toBe(25);
    expect(readBack.autoPotionThresholdPct).toBe(30);
  });
});

describe('P0.1: Authentic Spell Auto-Cast Engine (src/sim/tactics.ts)', () => {
  it('returns null if autoCastMode is off', () => {
    const map = createTestMap();
    const sim = new Sim(map, 10, [0, 0, 1], { combat: true, kinds: [Kind.Hero, Kind.Warrior, Kind.Gnoll] });
    const prefs: Preferences = { ...DEFAULT_PREFERENCES, autoCastMode: 'off' };
    const action = evaluateAutoCast(sim, 0, prefs);
    expect(action).toBeNull();
  });

  it('auto-casts healing when ally HP is below threshold and prioritizes hero', () => {
    const map = createTestMap();
    // 0: Mage caster (team 0), 1: Warrior (team 0), 2: Hero (team 0), 3: Enemy (team 1)
    const sim = new Sim(map, 11, [0, 0, 0, 1], {
      combat: true,
      kinds: [Kind.Mage, Kind.Warrior, Kind.Hero, Kind.Gnoll],
    });
    sim.hero = { id: 2 } as unknown as typeof sim.hero;

    // Both warrior and hero are wounded
    sim.cb.hp[1] = 20; // 20 / 100 = 20%
    sim.cb.hpMax[1] = 100;

    sim.cb.hp[2] = 40; // 40 / 100 = 40% (both <= 65%)
    sim.cb.hpMax[2] = 100;

    sim.cb.mana[0] = 50;
    sim.cb.manaMax[0] = 50;

    const prefs: Preferences = { ...DEFAULT_PREFERENCES, autoCastMode: 'smart', autoHealThresholdPct: 65 };

    // Should prioritize Hero (id 2) for emergency healing
    const action = evaluateAutoCast(sim, 0, prefs);
    expect(action).not.toBeNull();
    expect(action!.reason).toBe('emergency_heal');
    expect(action!.targetId).toBe(2); // Hero
  });

  it('respects mana reserve percentage for offensive spells', () => {
    const map = createTestMap();
    // 0: Mage, 1: Enemy
    const sim = new Sim(map, 12, [0, 1], { combat: true, kinds: [Kind.Mage, Kind.Gnoll] });

    // Target the enemy
    sim.cb.tgt[0] = 1;
    sim.cb.hp[1] = 100;
    sim.cb.hpMax[1] = 100;

    // Set low mana: max 100, current 18, manaReservePct 15% -> reserve is 15.
    // An offensive spell costing 10 would leave 8 < 15, violating reserve!
    sim.cb.manaMax[0] = 100;
    sim.cb.mana[0] = 18;

    const prefs: Preferences = { ...DEFAULT_PREFERENCES, autoCastMode: 'smart', manaReservePct: 15 };

    // Fire bolt costs ~12. 18 - 12 = 6 (< 15 reserve). Should NOT cast offensive spell!
    const actionBlocked = evaluateAutoCast(sim, 0, prefs, [0]); // spell 0 = Fire Bolt
    expect(actionBlocked).toBeNull();

    // Increase mana to 40. 40 - 12 = 28 (>= 15 reserve). Should cast!
    sim.cb.mana[0] = 40;
    const actionAllowed = evaluateAutoCast(sim, 0, prefs, [0]);
    expect(actionAllowed).not.toBeNull();
    expect(actionAllowed!.reason).toBe('offensive_cast');
    expect(actionAllowed!.targetId).toBe(1);
  });
});

describe('P0.2: Squad Stances & Regroup Formation (src/sim/tactics.ts)', () => {
  it('returns authentic chase radius per stance', () => {
    // Hold: 0 for melee (bridge/choke blocking), ranged can attack from spot
    expect(getChaseRadiusForStance('hold', false)).toBe(0.0);
    expect(getChaseRadiusForStance('hold', true)).toBe(7.0);

    // Guard: 3-tile defensive leash
    expect(getChaseRadiusForStance('guard', false)).toBe(3.0);
    expect(getChaseRadiusForStance('guard', true)).toBe(3.0);

    // Aggressive: 9-tile pursuit
    expect(getChaseRadiusForStance('aggressive', false)).toBe(9.0);
    expect(getChaseRadiusForStance('aggressive', true)).toBe(9.0);
  });

  it('computes 2-rank regroup formation around the hero', () => {
    const map = createTestMap();
    // 0: Hero, 1: Warrior (melee), 2: Archer (ranged), 3: Mage (ranged)
    const sim = new Sim(map, 15, [0, 0, 0, 0], {
      combat: true,
      kinds: [Kind.Hero, Kind.Warrior, Kind.Archer, Kind.Mage],
    });
    sim.x[0] = Math.round(15 * FP);
    sim.y[0] = Math.round(15 * FP);
    sim.dir[0] = 0; // facing East (angle 0)

    const formation = computeRegroupFormation(sim, 0, [1, 2, 3], 0);
    expect(formation.length).toBe(3);

    // Melee unit (id 1) placed in front rank (X > 15)
    const meleePos = formation.find((p) => p.id === 1);
    expect(meleePos).toBeDefined();
    expect(meleePos!.targetX).toBeGreaterThanOrEqual(16);

    // Ranged units (ids 2, 3) placed in back rank (X < 15)
    const archerPos = formation.find((p) => p.id === 2);
    const magePos = formation.find((p) => p.id === 3);
    expect(archerPos).toBeDefined();
    expect(magePos).toBeDefined();
    expect(archerPos!.targetX).toBeLessThanOrEqual(14);
    expect(magePos!.targetX).toBeLessThanOrEqual(14);
  });
});

describe('P0.3: High Ground Tactical Advantage (src/sim/tactics.ts)', () => {
  it('calculates +15% Acc and +1.5 Range for high ground (dh >= 2)', () => {
    const map = createTestMap(16, 16);
    // Attacker at (4, 4) height 5; Target at (8, 4) height 2 -> dh = 3
    map.height[4 * map.w + 4] = 5;
    map.height[4 * map.w + 8] = 2;

    const bonus = computeHighGroundBonus(map, 4, 4, 8, 4);
    expect(bonus.rangeBonus).toBe(1.5);
    expect(bonus.accuracyMult).toBe(1.15);
    expect(bonus.critBonusPct).toBe(10);
    expect(bonus.label).toContain('High Ground');
  });

  it('calculates -15% Acc penalty for low ground (dh <= -2)', () => {
    const map = createTestMap(16, 16);
    // Attacker at (4, 4) height 1; Target at (8, 4) height 4 -> dh = -3
    map.height[4 * map.w + 4] = 1;
    map.height[4 * map.w + 8] = 4;

    const bonus = computeHighGroundBonus(map, 4, 4, 8, 4);
    expect(bonus.rangeBonus).toBe(0);
    expect(bonus.accuracyMult).toBe(0.85);
    expect(bonus.critBonusPct).toBe(0);
    expect(bonus.label).toContain('Low Ground');
  });

  it('returns neutral modifiers for level elevation (-1 <= dh <= 1)', () => {
    const map = createTestMap(16, 16);
    map.height[4 * map.w + 4] = 2;
    map.height[4 * map.w + 8] = 3; // dh = -1

    const bonus = computeHighGroundBonus(map, 4, 4, 8, 4);
    expect(bonus.rangeBonus).toBe(0);
    expect(bonus.accuracyMult).toBe(1.0);
    expect(bonus.critBonusPct).toBe(0);
    expect(bonus.label).toBe('Neutral Elevation');
  });
});

describe('Auto-Go with Ambush Guard & Auto-Loot Sweep (src/sim/tactics.ts)', () => {
  it('halts auto-navigation instantly when enemy enters visual range (8 tiles)', () => {
    const map = createTestMap();
    // 0: Hero, 1: Enemy
    const sim = new Sim(map, 20, [0, 1], { combat: true, kinds: [Kind.Hero, Kind.Gnoll] });
    sim.x[0] = Math.round(10 * FP);
    sim.y[0] = Math.round(10 * FP);

    // Enemy is 6 tiles away (within 8 tile ambush radius)
    sim.x[1] = Math.round(16 * FP);
    sim.y[1] = Math.round(10 * FP);
    sim.cb.hp[1] = 50;

    const result = stepAutoNavigate(sim, 0, [], 30, 10, 8);
    expect(result.haltedByEnemy).toBe(true);
    expect(result.enemyId).toBe(1);
    expect(result.arrived).toBe(false);
  });

  it('advances toward goal when path is safe', () => {
    const map = createTestMap();
    // 0: Hero, 1: Enemy far away (25 tiles)
    const sim = new Sim(map, 21, [0, 1], { combat: true, kinds: [Kind.Hero, Kind.Gnoll] });
    sim.x[0] = Math.round(5 * FP);
    sim.y[0] = Math.round(5 * FP);
    sim.x[1] = Math.round(30 * FP);
    sim.y[1] = Math.round(30 * FP);

    const result = stepAutoNavigate(sim, 0, [], 10, 5, 8);
    expect(result.haltedByEnemy).toBe(false);
    expect(result.nextX).toBeGreaterThan(5);
    expect(result.arrived).toBe(false);
  });

  it('refuses loot sweep if living enemies are nearby', () => {
    const map = createTestMap();
    const sim = new Sim(map, 22, [0, 1], { combat: true, kinds: [Kind.Hero, Kind.Gnoll] });
    sim.x[0] = Math.round(10 * FP);
    sim.y[0] = Math.round(10 * FP);
    sim.x[1] = Math.round(14 * FP);
    sim.y[1] = Math.round(10 * FP);
    sim.cb.hp[1] = 40;

    const sweep = performLootSweep(sim, 0, 8);
    expect(sweep.canLoot).toBe(false);
    expect(sweep.reason).toBe('enemies_nearby');
  });

  it('gathers nearby gold piles when combat is cleared', () => {
    const map = createTestMap();
    const sim = new Sim(map, 23, [0, 1], { combat: true, kinds: [Kind.Hero, Kind.Gnoll] });
    sim.x[0] = Math.round(10 * FP);
    sim.y[0] = Math.round(10 * FP);
    sim.cb.hp[1] = 0; // enemy dead!

    // Place gold sack 3 tiles away
    sim.cb.sX[0] = Math.round(13 * FP);
    sim.cb.sY[0] = Math.round(10 * FP);
    sim.cb.sG[0] = 75;

    const sweep = performLootSweep(sim, 0, 8);
    expect(sweep.canLoot).toBe(true);
    expect(sweep.collectedGold).toBe(75);
    expect(sweep.targets.length).toBe(1);
    expect(sweep.targets[0]!.kind).toBe('gold');
  });
});
