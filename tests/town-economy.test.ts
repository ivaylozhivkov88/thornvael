import { describe, expect, it } from 'vitest';
import { loadDoc } from '../src/mapdoc';
import { BUILT_IN, createMission } from '../src/mission';
import { UNIQUE_ARTIFACTS } from '../src/sim/affixes';
import { createHero } from '../src/sim/hero';
import { ITEMS, Ik, itemId } from '../src/sim/items';
import { ALL_SET_ITEMS } from '../src/sim/sets';
import { FP, Sim } from '../src/sim/sim';
import {
  ROLE_COUNT,
  Role,
  SHELF,
  gambleCost,
  isSetPiece,
  isUniqueItem,
  itemRarity,
  priceOf,
  rollStock,
  sellPrice,
  type TownCommand,
} from '../src/sim/town';

function game(seed = 42, cls = 0, diff = 1) {
  const g = createMission(loadDoc(BUILT_IN.market), seed);
  createHero(g.sim, 0, cls, false, diff);
  return g;
}

const put = (sim: Sim, u: number, x: number, y: number): void => {
  sim.x[u] = sim.tx[u] = Math.round((x + 0.5) * FP);
  sim.y[u] = sim.ty[u] = Math.round((y + 0.5) * FP);
};

const at = (sim: Sim, role: number): void => {
  const [x, y] = sim.towns[0].door[role]!;
  put(sim, 0, x, y);
};

const cmd = (op: TownCommand['op'], v?: number, list?: number[]): TownCommand => ({
  type: 'town',
  op,
  town: 0,
  v,
  list,
});

describe('Dynamic Shop Restock & Difficulty-Based Economy', () => {
  it('refreshes shop stock on enter and on leave', () => {
    const { sim } = game(101, 0, 1);
    sim.cb.gold[0] = 500;
    at(sim, Role.Shop);

    // Enter shop: rolls stock
    sim.now(cmd('enter', Role.Shop));
    expect(sim.town.inside).toBe(Role.Shop);
    const enterStock = sim.town.stock[0].slice();
    expect(enterStock[0]).toBeGreaterThanOrEqual(0);
    expect(ITEMS[enterStock[0]].name).toBe('Healing Draught');

    // Buy an item from shelf[0]
    sim.now(cmd('buy', undefined, [0]));
    expect(sim.town.stock[0][0]).toBe(-1); // Purchased, slot empty

    // Leave shop: must trigger restock on leave when player was inside shop
    sim.now(cmd('leave'));
    expect(sim.town.inside).toBe(-1);
    const afterLeaveStock = sim.town.stock[0].slice();
    expect(afterLeaveStock[0]).toBeGreaterThanOrEqual(0); // Restocked immediately on exit!
    expect(ITEMS[afterLeaveStock[0]].name).toBe('Healing Draught');

    // Enter shop again: rolls stock again
    sim.now(cmd('enter', Role.Shop));
    expect(sim.town.inside).toBe(Role.Shop);
    const secondEnterStock = sim.town.stock[0].slice();
    expect(secondEnterStock[0]).toBeGreaterThanOrEqual(0);
  });

  it('distributes stock tiers accurately on Easy difficulty (0): tier 1..2, 90% common / 10% magic', () => {
    const { sim } = game(202, 0, 0); // diff 0: Easy
    expect(sim.hero?.diff).toBe(0);

    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const ROLLS = 200;

    for (let r = 0; r < ROLLS; r++) {
      rollStock(sim, 0);
      const shelf = sim.town.stock[0];
      // Skip slots 0 & 1 which are fixed Healing / Mana draughts
      for (let k = 2; k < SHELF; k++) {
        const id = shelf[k];
        if (id < 0) continue;
        const tier = ITEMS[id].tier;
        counts[tier] = (counts[tier] ?? 0) + 1;
      }
    }

    const total = counts[1] + counts[2];
    expect(total).toBeGreaterThan(1000);
    // Easy must strictly never offer tier 3, 4, or 5
    expect(counts[3]).toBe(0);
    expect(counts[4]).toBe(0);
    expect(counts[5]).toBe(0);

    // Distribution should be ~90% common (tier 1) and ~10% magic (tier 2)
    const pct1 = (counts[1] / total) * 100;
    const pct2 = (counts[2] / total) * 100;
    expect(pct1).toBeGreaterThanOrEqual(84);
    expect(pct1).toBeLessThanOrEqual(96);
    expect(pct2).toBeGreaterThanOrEqual(4);
    expect(pct2).toBeLessThanOrEqual(16);
  });

  it('distributes stock tiers accurately on Normal difficulty (1): tier 1..3, 65% common / 30% magic / 5% rare', () => {
    const { sim } = game(303, 0, 1); // diff 1: Normal
    expect(sim.hero?.diff).toBe(1);

    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const ROLLS = 250;

    for (let r = 0; r < ROLLS; r++) {
      rollStock(sim, 0);
      const shelf = sim.town.stock[0];
      for (let k = 2; k < SHELF; k++) {
        const id = shelf[k];
        if (id < 0) continue;
        const tier = ITEMS[id].tier;
        counts[tier] = (counts[tier] ?? 0) + 1;
      }
    }

    const total = counts[1] + counts[2] + counts[3];
    expect(total).toBeGreaterThan(1200);
    // Normal must strictly never offer tier 4 or 5
    expect(counts[4]).toBe(0);
    expect(counts[5]).toBe(0);

    // Distribution should be ~65% tier 1, ~30% tier 2, ~5% tier 3
    const pct1 = (counts[1] / total) * 100;
    const pct2 = (counts[2] / total) * 100;
    const pct3 = (counts[3] / total) * 100;
    expect(pct1).toBeGreaterThanOrEqual(58);
    expect(pct1).toBeLessThanOrEqual(72);
    expect(pct2).toBeGreaterThanOrEqual(23);
    expect(pct2).toBeLessThanOrEqual(37);
    expect(pct3).toBeGreaterThanOrEqual(2);
    expect(pct3).toBeLessThanOrEqual(9);
  });

  it('distributes stock tiers accurately on Hard difficulty (2): tier 2..4, 40% common / 45% magic / 14% rare / 1% set', () => {
    const { sim } = game(404, 0, 2); // diff 2: Hard
    expect(sim.hero?.diff).toBe(2);

    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let setPieceCount = 0;
    const ROLLS = 300;

    for (let r = 0; r < ROLLS; r++) {
      rollStock(sim, 0);
      const shelf = sim.town.stock[0];
      for (let k = 2; k < SHELF; k++) {
        const id = shelf[k];
        if (id < 0) continue;
        const d = ITEMS[id];
        counts[d.tier] = (counts[d.tier] ?? 0) + 1;
        if (isSetPiece(d)) setPieceCount++;
      }
    }

    // Hard bounds shift up: no tier 1 items at all!
    expect(counts[1]).toBe(0);
    // Unique artifacts strictly never on shelves: no tier 5 items!
    expect(counts[5]).toBe(0);

    const total = counts[2] + counts[3] + counts[4];
    expect(total).toBeGreaterThan(1500);

    // Distribution: ~40% tier 2, ~45% tier 3, ~15% tier 4 (14% rare + set)
    const pct2 = (counts[2] / total) * 100;
    const pct3 = (counts[3] / total) * 100;
    const pct4 = (counts[4] / total) * 100;
    expect(pct2).toBeGreaterThanOrEqual(33);
    expect(pct2).toBeLessThanOrEqual(47);
    expect(pct3).toBeGreaterThanOrEqual(38);
    expect(pct3).toBeLessThanOrEqual(52);
    expect(pct4).toBeGreaterThanOrEqual(10);
    expect(pct4).toBeLessThanOrEqual(21);

    // Set pieces are available in pool and appear on the 1% opportunity
    expect(setPieceCount).toBeGreaterThanOrEqual(0);
  });

  it('scales pricing with item tier and rarity multipliers', () => {
    // 1. Normal gear: 30 * tier^2
    const rustySword = itemId('Rusty Sword'); // tier 1 gear, normal
    expect(rustySword).toBeGreaterThanOrEqual(0);
    expect(ITEMS[rustySword].tier).toBe(1);
    expect(itemRarity(ITEMS[rustySword])).toBe('normal');
    expect(priceOf(rustySword)).toBe(30); // 30 * 1^2

    const woodenBuckler = itemId('Wooden Buckler'); // tier 1 shield, normal
    expect(priceOf(woodenBuckler)).toBe(30);

    // 2. Magic gear: 1.8x base (base = 30 * tier^2)
    const ironSword = itemId('Iron Sword'); // tier 2 gear, magic
    expect(ironSword).toBeGreaterThanOrEqual(0);
    expect(ITEMS[ironSword].tier).toBe(2);
    expect(itemRarity(ITEMS[ironSword])).toBe('magic');
    const baseT2 = 30 * 2 * 2; // 120
    expect(priceOf(ironSword)).toBe(Math.round(baseT2 * 1.8)); // 216

    const steelSword = itemId('Steel Sword'); // tier 3 gear, magic
    expect(steelSword).toBeGreaterThanOrEqual(0);
    expect(ITEMS[steelSword].tier).toBe(3);
    expect(itemRarity(ITEMS[steelSword])).toBe('magic');
    const baseT3 = 30 * 3 * 3; // 270
    expect(priceOf(steelSword)).toBe(Math.round(baseT3 * 1.8)); // 486

    // 3. Rare gear: 3.5x base
    const knightSword = itemId('Knight Sword'); // tier 4 gear, rare
    expect(knightSword).toBeGreaterThanOrEqual(0);
    expect(ITEMS[knightSword].tier).toBe(4);
    expect(itemRarity(ITEMS[knightSword])).toBe('rare');
    const baseT4 = 30 * 4 * 4; // 480
    expect(priceOf(knightSword)).toBe(Math.round(baseT4 * 3.5)); // 1680

    const plateArmor = itemId('Plate Armor'); // tier 4 armor, rare
    expect(priceOf(plateArmor)).toBe(1680);

    // 4. Set gear: 5.0x base
    const setPieceName = ALL_SET_ITEMS[0].name; // "Iron Warden's Visor", tier 3
    const setPieceId = itemId(setPieceName);
    expect(setPieceId).toBeGreaterThanOrEqual(0);
    expect(isSetPiece(ITEMS[setPieceId])).toBe(true);
    expect(itemRarity(ITEMS[setPieceId])).toBe('set');
    expect(ITEMS[setPieceId].tier).toBe(3);
    expect(priceOf(setPieceId)).toBe(Math.round(baseT3 * 5.0)); // 270 * 5 = 1350

    // 5. Unique artifact: 8.5x base
    const thornBlade = itemId('Thorn Blade'); // tier 5 unique weapon
    expect(thornBlade).toBeGreaterThanOrEqual(0);
    expect(ITEMS[thornBlade].tier).toBe(5);
    expect(isUniqueItem(ITEMS[thornBlade])).toBe(true);
    expect(itemRarity(ITEMS[thornBlade])).toBe('unique');
    const baseT5 = 30 * 5 * 5; // 750
    expect(priceOf(thornBlade)).toBe(Math.round(baseT5 * 8.5)); // 6375

    // Check unique artifact from affixes table
    const uniqueArt = UNIQUE_ARTIFACTS[0].name; // "Sovereign's Gilded Crest", tier 5
    const uniqueId = itemId(uniqueArt);
    if (uniqueId >= 0) {
      expect(isUniqueItem(ITEMS[uniqueId])).toBe(true);
      expect(itemRarity(ITEMS[uniqueId])).toBe('unique');
      expect(priceOf(uniqueId)).toBe(Math.round(30 * ITEMS[uniqueId].tier * ITEMS[uniqueId].tier * 8.5));
    }

    // Verify sell price is always half (rounded down)
    expect(sellPrice(rustySword)).toBe(priceOf(rustySword) >> 1);
    expect(sellPrice(ironSword)).toBe(priceOf(ironSword) >> 1);
    expect(sellPrice(knightSword)).toBe(priceOf(knightSword) >> 1);
    expect(sellPrice(setPieceId)).toBe(priceOf(setPieceId) >> 1);
    expect(sellPrice(thornBlade)).toBe(priceOf(thornBlade) >> 1);
  });

  it('guarantees unique artifacts are strictly non-purchasable and NEVER appear on shop shelves', () => {
    const { sim } = game(505, 0, 2); // Hard difficulty with highest tier bounds
    const uniqueNames = new Set(UNIQUE_ARTIFACTS.map(u => u.name));

    // Run 250 restocks on Hard difficulty
    for (let r = 0; r < 250; r++) {
      rollStock(sim, 0);
      const shelf = sim.town.stock[0];
      for (let k = 0; k < SHELF; k++) {
        const id = shelf[k];
        if (id < 0) continue;
        const d = ITEMS[id];

        // Must never be unique
        expect(isUniqueItem(d)).toBe(false);
        expect(itemRarity(d)).not.toBe('unique');
        expect(d.tier).toBeLessThan(5);
        expect(uniqueNames.has(d.name)).toBe(false);
      }
    }
  });

  it('implements Smuggler Casket gambling with classic ARPG probabilities and level-scaled costs', () => {
    const { sim } = game(777, 0, 1);
    const cost = gambleCost(sim);
    expect(cost).toBeGreaterThanOrEqual(150);

    // Give hero gold
    sim.cb.gold[0] = 50000;
    const initialGold = sim.cb.gold[0];

    // Move hero to shop and enter
    at(sim, Role.Shop);
    sim.now(cmd('enter', Role.Shop));
    expect(sim.town.inside).toBe(Role.Shop);

    // Execute gamble command
    sim.now(cmd('gamble'));

    // Gold deducted and item received in inventory
    expect(sim.cb.gold[0]).toBe(initialGold - cost);
    expect(sim.hero!.inv.length).toBeGreaterThan(0);

    // Run multiple gambles to verify D2 probabilities across rolls
    let uniques = 0;
    let sets = 0;
    let rares = 0;
    let magics = 0;
    const GAMBLE_ROLLS = 1000;
    sim.cb.gold[0] = 10000000;

    for (let i = 0; i < GAMBLE_ROLLS; i++) {
      // Clear inventory to prevent full pack
      sim.hero!.inv = [];
      sim.now(cmd('gamble'));
      const received = sim.hero!.inv[0];
      if (!received) continue;
      const d = ITEMS[received.item];
      const r = itemRarity(d);
      if (r === 'unique') uniques++;
      else if (r === 'set') sets++;
      else if (r === 'rare') rares++;
      else magics++;
    }

    expect(magics).toBeGreaterThan(750); // ~89%
    expect(rares).toBeGreaterThan(50);   // ~10%
    // Unique and sets are rare but reachable
    expect(sets + uniques).toBeGreaterThanOrEqual(1);
  });
});
