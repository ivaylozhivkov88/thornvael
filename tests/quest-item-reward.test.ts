import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyCarryover, extractCarryover } from '../src/carryover';
import type { GameMap } from '../src/map';
import { jsonUnique } from '../src/sim/affixes';
import { Kind } from '../src/sim/combat';
import { INV_MAX, createHero } from '../src/sim/hero';
import { getItemDef, itemId } from '../src/sim/items';
import { Sim } from '../src/sim/sim';

function field(w = 24, h = 24): GameMap {
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

const quests = JSON.parse(readFileSync('public/data/content/side-quests.json', 'utf8'));
const rewardIds: string[] = [JSON.stringify(quests).match(/uniq-[a-z0-9-]+/g) ?? []].flat();
const ID = 'uniq-tollkeeper-bill';

describe('quest unique rewards', () => {
  it('every item named by a side quest is a unique with a known base', () => {
    expect(rewardIds.length).toBeGreaterThan(0);
    for (const id of rewardIds) {
      const u = jsonUnique(id);
      expect(u, id).toBeDefined();
      expect(itemId(u!.base), `${id} base ${u!.base}`).toBeGreaterThanOrEqual(0);
    }
  });
});

function world(seed = 7): Sim {
  const sim = new Sim(field(), seed, [0, 1], { kinds: [Kind.Mage, Kind.Golem], combat: true });
  sim.place(0, 5, 5);
  sim.place(1, 20, 20);
  createHero(sim, 0, 1, false, 1);
  return sim;
}

const pay = (sim: Sim, items: string[]) => sim.step([{ type: 'reward', gold: 0, xp: 0, items }]);
const named = (sim: Sim) =>
  sim.hero!.inv.filter((s) => getItemDef(s.item)?.name === jsonUnique(ID)!.def.name).map((s) => s.item);

describe('the reward command grants uniques', () => {
  it('puts the item in the pack, deterministically', () => {
    const a = world();
    const b = world();
    pay(a, [ID, 'uniq-no-such-thing']);
    pay(b, [ID, 'uniq-no-such-thing']);
    expect(named(a)).toHaveLength(1);
    expect(a.hash()).toBe(b.hash());
    const c = world();
    c.restore(a.snapshot());
    expect(c.hash()).toBe(a.hash());
    expect(named(c)).toHaveLength(1);
  });

  it('drops a bag when the pack is full', () => {
    const sim = world();
    const filler = itemId(jsonUnique(ID)!.base);
    while (sim.hero!.inv.length < INV_MAX) sim.hero!.inv.push({ item: filler, n: 1 });
    pay(sim, [ID]);
    expect(named(sim)).toHaveLength(0);
    expect(sim.cb.bI.some((v) => v > 0 && getItemDef(v - 1)?.name === jsonUnique(ID)!.def.name)).toBe(true);
  });

  it('keeps ids apart after a map change', () => {
    const first = world();
    pay(first, [ID]);
    const next = world(8);
    applyCarryover(next, extractCarryover(first, { completed: [] } as never, 1));
    pay(next, ['uniq-bren-dry-boot']);
    const ids = next.hero!.inv.map((s) => s.item);
    expect(new Set(ids).size).toBe(ids.length);
    expect(named(next)).toHaveLength(1);
  });
});
