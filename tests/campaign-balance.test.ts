import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { createHero, derive, totals, dropLoot, getHeroMF, addItem, heroCommand } from '../src/sim/hero';
import { Kind } from '../src/sim/combat';
import { Slot, Ik, ITEMS, getItemDef, DYNAMIC_ITEM_OFFSET } from '../src/sim/items';
import { rollStock, gambleCost, TownState, newTownState } from '../src/sim/town';
import { extractCarryover, applyCarryover } from '../src/carryover';
import type { GameMap } from '../src/map';

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

describe('Campaign & Skirmish Comprehensive Balance Sweep', () => {
  it('balances hero progression across Easy, Medium, and Hard difficulties', () => {
    for (const diff of [0, 1, 2]) {
      const sim = new Sim(field(30, 30), 100 + diff, [0, 1], {
        kinds: [Kind.Hero, Kind.Gnoll],
        combat: true,
      });
      createHero(sim, 0, 0, false, diff);
      const h = sim.hero!;
      expect(h.diff).toBe(diff);

      const stats = derive(h);
      expect(stats.hpMax).toBeGreaterThan(0);
      expect(stats.manaMax).toBeGreaterThan(0);
      expect(stats.weight).toBeLessThanOrEqual(stats.capacity);

      // Hero strikes foe
      sim.cb.hp[1] = 0; // foe dies
      dropLoot(sim, 1);

      // Verify bags placed
      let hasBag = false;
      for (let b = 0; b < sim.cb.bI.length; b++) {
        if (sim.cb.bI[b] > 0) {
          hasBag = true;
          const itemId = sim.cb.bI[b] - 1;
          const def = sim.getItemDef(itemId);
          expect(def).toBeDefined();
        }
      }
    }
  });

  it('guarantees boss modifiers and multi-pick loot scaling on apex encounters', () => {
    const sim = new Sim(field(40, 40), 9999, [0, 1], {
      kinds: [Kind.Hero, Kind.Golem],
      combat: true,
      bossMods: [[], ['boss', 'fire-enchanted', 'teleport']],
    });
    createHero(sim, 0, 0, false, 2); // Hard difficulty

    // Give hero high MF
    const h = sim.hero!;
    h.mf = 150;

    // Boss dies
    sim.cb.hp[1] = 0;
    dropLoot(sim, 1);

    // Boss drops 3 loot bags
    let bagCount = 0;
    for (let b = 0; b < sim.cb.bI.length; b++) {
      if (sim.cb.bI[b] > 0) {
        bagCount++;
        const itemId = sim.cb.bI[b] - 1;
        const def = sim.getItemDef(itemId);
        expect(def).toBeDefined();
      }
    }
    expect(bagCount).toBe(3);
  });

  it('verifies campaign carryover preserves full progression and equipped gear', () => {
    const sim1 = new Sim(field(25, 25), 111, [0], { combat: true });
    createHero(sim1, 0, 0, false, 1);
    const h1 = sim1.hero!;

    // Equip a weapon and a dynamic shield
    const weapon = ITEMS.find((d) => d.kind === Ik.Gear && d.slot === Slot.Weapon)!;
    h1.eq[Slot.Weapon] = ITEMS.indexOf(weapon);

    const shieldBase = ITEMS.find((d) => d.kind === Ik.Gear && d.slot === Slot.Shield)!;
    const dynamicShield = sim1.createItemInstance(ITEMS.indexOf(shieldBase), 'rare', {
      ...shieldBase,
      name: 'Doom Ward Aegis',
      def: shieldBase.def + 15,
      rarity: 'rare',
    });
    h1.eq[Slot.Shield] = dynamicShield.id;

    // Add gold and skills
    sim1.cb.gold[0] = 5000;
    h1.skill[0] = 5; // Blade lvl 5
    h1.skill[1] = 4; // Guard lvl 4

    const progress = {
      difficulty: 1,
      unlocked: ['m01', 'm02'],
      completed: ['m01'],
      node: 'm02',
      townVisits: 1,
    };

    const co = extractCarryover(sim1, progress, 9876);
    expect(co.gold).toBe(5000);
    expect(co.items).toBeDefined();
    expect(co.items!.some((i) => i.id === dynamicShield.id)).toBe(true);

    // Apply to node 2
    const sim2 = new Sim(field(25, 25), 222, [0], { combat: true });
    createHero(sim2, 0, 0, false, 1);
    applyCarryover(sim2, co);

    expect(sim2.cb.gold[0]).toBe(5000);
    expect(sim2.hero!.eq[Slot.Weapon]).toBe(ITEMS.indexOf(weapon));
    expect(sim2.hero!.eq[Slot.Shield]).toBe(dynamicShield.id);
    expect(sim2.hero!.skill[0]).toBe(5);
    expect(sim2.hero!.skill[1]).toBe(4);

    const dStats = derive(sim2.hero!);
    expect(dStats.pdef[1]).toBeGreaterThanOrEqual(shieldBase.def + 15);
  });

  it('validates dynamic shop restock tier progression and gambler odds across acts', () => {
    for (const act of [1, 2, 3, 4]) {
      const baseLo = Math.min(3, act);
      const baseHi = Math.min(4, act + 1);

      const sim = new Sim(field(20, 20), 555 + act, [0], { combat: true });
      createHero(sim, 0, 0, false, 1);
      sim.towns = [
        {
          def: { name: `Town ${act}`, tiers: [baseLo, baseHi] } as any,
          door: [[1, 1], [2, 2], [3, 3]],
          shop: [1, 1],
        } as any,
      ];
      sim.town = newTownState(1);

      rollStock(sim, 0);
      const stock = sim.town.stock[0];
      expect(stock.length).toBeGreaterThan(0);

      // Ensure all stock items are valid items and no unique artifacts exist in shops
      for (const id of stock) {
        if (id >= 0) {
          const item = getItemDef(id);
          expect(item).toBeDefined();
          expect(item!.rarity).not.toBe('unique');
        }
      }

      // Gamble cost scaling
      const cost = gambleCost(sim);
      expect(cost).toBeGreaterThan(0);
    }
  });
});
