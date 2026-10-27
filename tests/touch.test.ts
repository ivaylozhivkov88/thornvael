import { describe, expect, it } from 'vitest';
import { DoubleTap, PORTRAITS, RADIAL_BTN, portraitIds, radialCentres, radialPick, unitsOfKind } from '../src/touchx';
import { upkeepFee } from '../src/sim/town';
import type { GameMap } from '../src/map';
import { Kind } from '../src/sim/combat';
import { ITEMS, Slot, itemId } from '../src/sim/items';
import { Sim } from '../src/sim/sim';
import { createHero, scribeFee } from '../src/sim/hero';

function world(cls: number): Sim {
  const w = 40;
  const h = 30;
  const map: GameMap = { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h).fill(200) };
  const sim = new Sim(map, 3, [0], { kinds: [Kind.Hero], combat: true });
  sim.place(0, 5, 5);
  createHero(sim, 0, cls, false, 1);
  return sim;
}
import { extractCarryover } from '../src/carryover';

describe('double tap', () => {
  it('fires on a quick second tap on the same unit only', () => {
    const d = new DoubleTap();
    expect(d.hit(1000, 100, 100, 3)).toBe(false);
    expect(d.hit(1200, 104, 100, 3)).toBe(true);
    expect(d.hit(1300, 104, 100, 3)).toBe(false); // a third tap starts over
    expect(d.hit(1400, 100, 100, 4)).toBe(false); // another unit
    expect(d.hit(2000, 100, 100, 4)).toBe(false); // too slow
  });
  it('selects all living units of the kind', () => {
    const kinds = [2, 0, 0, 1, 0];
    const mine = (i: number): boolean => i !== 2;
    expect(unitsOfKind(5, (i) => kinds[i], mine, 0)).toEqual([1, 4]);
  });
});

describe('radial menu and portraits', () => {
  it('keeps four buttons of at least 44 px inside the view and picks them', () => {
    expect(RADIAL_BTN).toBeGreaterThanOrEqual(44);
    const c = radialCentres(5, 5, 640, 360);
    for (const [x, y] of c) {
      expect(x - RADIAL_BTN / 2).toBeGreaterThanOrEqual(0);
      expect(y - RADIAL_BTN / 2).toBeGreaterThanOrEqual(0);
    }
    expect(radialPick(c, c[2][0], c[2][1])).toBe(2);
    expect(radialPick(c, 1000, 1000)).toBe(-1);
  });
  it('lists the hero first and caps the strip', () => {
    const ids = [4, 5, 6, 7, 8, 9, 10, 11];
    const out = portraitIds(ids, 7);
    expect(out[0]).toBe(7);
    expect(out.length).toBe(PORTRAITS);
  });
});

describe('economy', () => {
  it('upkeep follows the hits on each body part and the gear that covers it', () => {
    const armor = itemId('Padded Jerkin');
    const eq = Array<number>(8).fill(-1);
    eq[Slot.Armor] = armor;
    expect(upkeepFee([0, 0, 0, 0], eq)).toBe(0);
    const one = upkeepFee([0, 1, 0, 0], eq);
    expect(one).toBeGreaterThan(0);
    expect(upkeepFee([0, 4, 0, 0], eq)).toBe(one * 4);
    expect(upkeepFee([5, 0, 0, 5], Array<number>(8).fill(-1))).toBe(0); // bare parts cost nothing
    expect(ITEMS[armor].cover).not.toBe(0);
  });

  it('carry-over charges upkeep once, caps it at the purse and clears the hits', () => {
    const sim = world(0);
    sim.hero!.hits = [3, 10, 4, 4];
    sim.cb.gold[0] = 5000;
    const fee = upkeepFee(sim.hero!.hits, sim.hero!.eq);
    const co = extractCarryover(sim, { chapter: 1, visited: [], done: [], townVisits: 0, difficulty: 1 } as never, 1, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(co.upkeep).toBe(fee);
    expect(co.gold).toBe(5000 - fee);
    expect(co.hero.hits).toEqual([0, 0, 0, 0]);
    expect(co.slots).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    sim.cb.gold[0] = 1;
    expect(extractCarryover(sim, { chapter: 1 } as never, 1).gold).toBe(0);
  });

  it('copying a spell from a scroll costs gold, refused without it', () => {
    const sim = world(1);
    const scroll = itemId('Scroll of Fireball');
    sim.hero!.inv.push({ item: scroll, n: 1 });
    sim.cb.gold[0] = 0;
    sim.step([{ type: 'hero', op: 'use', item: scroll }]);
    expect((sim.hero!.known >>> ITEMS[scroll].spell) & 1).toBe(0);
    sim.cb.gold[0] = 1000;
    sim.step([{ type: 'hero', op: 'use', item: scroll }]);
    expect(sim.cb.gold[0]).toBe(1000 - scribeFee(ITEMS[scroll].tier));
    expect((sim.hero!.known >>> ITEMS[scroll].spell) & 1).toBe(1);
  });
});
