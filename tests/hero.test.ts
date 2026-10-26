import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { Kind, M, MODN, POOLS } from '../src/sim/combat';
import { INV_MAX, addItem, createHero, derive, skillNeed, weightOf, capacityOf } from '../src/sim/hero';
import { Cls, ITEMS, ITEM_COUNT, Ik, Slot, itemId, rollLoot } from '../src/sim/items';
import { SPELLS } from '../src/sim/spelldata';
import { FP, Sim, replay, type Command } from '../src/sim/sim';
import { Rng } from '../src/sim/rng';

function field(w: number, h: number): GameMap {
  return { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h).fill(200) };
}

/** Hero at unit 0 plus foes: `foes` lists [kind, tileX, tileY]. */
function world(cls: number, diff = 1, foes: [number, number, number][] = [], seed = 3): Sim {
  const kinds = [Kind.Hero, ...foes.map((f) => f[0])];
  const sim = new Sim(field(40, 30), seed, [0, ...foes.map(() => 1)], { kinds, combat: true });
  sim.place(0, 5, 5);
  foes.forEach((f, n) => sim.place(n + 1, f[1], f[2]));
  createHero(sim, 0, cls, false, diff);
  return sim;
}
const cmd = (sim: Sim, c: Command): void => sim.step([c]);
const give = (sim: Sim, name: string, n = 1): void => {
  const id = itemId(name);
  for (let k = 0; k < n; k++) expect(addItem(sim.hero!, id)).toBe(0);
};

describe('item table', () => {
  it('has gear for every slot, potions and a learn item per spell', () => {
    for (let s = 0; s < 7; s++) expect(ITEMS.some((d) => d.kind === Ik.Gear && d.slot === s)).toBe(true);
    SPELLS.forEach((_, sid) => expect(ITEMS.some((d) => d.kind === Ik.Learn && d.spell === sid)).toBe(true));
    expect(ITEM_COUNT).toBeGreaterThan(60);
    expect(new Set(ITEMS.map((d) => d.name)).size).toBe(ITEM_COUNT);
    for (const d of ITEMS) expect(d.tier).toBeGreaterThanOrEqual(1);
  });
  it('loot rolls stay inside the tier range', () => {
    const r = new Rng(9);
    for (let n = 0; n < 300; n++) {
      const id = rollLoot((k) => r.int(k), 3, 5);
      expect(ITEMS[id].tier).toBeLessThanOrEqual(5);
      expect(ITEMS[id].tier).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('hero creation', () => {
  it('warrior and mage start with class-appropriate stats and spells', () => {
    const w = world(Cls.Warrior);
    const m = world(Cls.Mage);
    expect(w.cb.hpMax[0]).toBeGreaterThan(m.cb.hpMax[0]);
    expect(m.cb.manaMax[0]).toBeGreaterThan(w.cb.manaMax[0]);
    expect(w.cb.known[0]).toBe(1 << 7);
    expect(m.cb.known[0]).toBe((1 << 0) | (1 << 4) | (1 << 7));
    expect(w.cb.hp[0]).toBe(w.cb.hpMax[0]);
    expect(derive(m.hero!).pow).toBeGreaterThan(derive(w.hero!).pow);
  });
  it('difficulty scales foe hit points and the first kit', () => {
    const e = world(Cls.Warrior, 0, [[Kind.Gnoll, 20, 5]]);
    const m = world(Cls.Warrior, 1, [[Kind.Gnoll, 20, 5]]);
    const h = world(Cls.Warrior, 2, [[Kind.Gnoll, 20, 5]]);
    expect(e.cb.hpMax[1]).toBeLessThan(m.cb.hpMax[1]);
    expect(h.cb.hpMax[1]).toBeGreaterThan(m.cb.hpMax[1]);
    expect(e.hero!.inv[0].n).toBeGreaterThan(h.hero!.inv[0].n);
  });
});

describe('equipment', () => {
  it('equipping loot changes the hero stats, unequipping puts them back', () => {
    const sim = world(Cls.Warrior);
    const before = derive(sim.hero!);
    give(sim, 'Steel Sword');
    sim.hero!.attr[0] = 12; // Body for the sword
    cmd(sim, { type: 'hero', op: 'equip', item: itemId('Steel Sword') });
    expect(sim.hero!.eq[Slot.Weapon]).toBe(itemId('Steel Sword'));
    expect(sim.hero!.inv.some((s) => s.item === itemId('Rusty Sword'))).toBe(true);
    expect(sim.cb.mod[M.Max]).toBeGreaterThan(before.max);
    expect(sim.cb.mod[M.Acc]).toBeGreaterThan(before.acc);
    cmd(sim, { type: 'hero', op: 'unequip', slot: Slot.Weapon });
    expect(sim.hero!.eq[Slot.Weapon]).toBe(-1);
    expect(sim.cb.mod[M.Max]).toBeLessThan(derive(sim.hero!).max + 1);
  });
  it('refuses wrong class and missing attribute', () => {
    const sim = world(Cls.Mage);
    sim.cb.recordFx = true;
    give(sim, 'Iron Sword');
    cmd(sim, { type: 'hero', op: 'equip', item: itemId('Iron Sword') });
    expect(sim.hero!.eq[Slot.Weapon]).toBe(itemId('Oak Staff'));
    expect(sim.cb.fx.some((f) => f.type === 15 && f.v === 1)).toBe(true);
    const w = world(Cls.Warrior);
    give(w, 'Plate Armor');
    cmd(w, { type: 'hero', op: 'equip', item: itemId('Plate Armor') }); // needs Body 14, warrior has 8
    expect(w.hero!.eq[Slot.Armor]).toBe(itemId('Padded Jerkin'));
  });
  it('gear bonuses to attributes raise hit points', () => {
    const sim = world(Cls.Warrior);
    sim.hero!.attr[3] = 11;
    give(sim, 'Great Ring of Might');
    const hp = sim.cb.hpMax[0];
    cmd(sim, { type: 'hero', op: 'equip', item: itemId('Great Ring of Might') });
    expect(sim.cb.hpMax[0]).toBe(hp + 20);
  });
  it('weight is limited by Body and the pack by 24 stacks', () => {
    const sim = world(Cls.Mage);
    const h = sim.hero!;
    expect(capacityOf(h.attr[0])).toBe(36);
    let why = 0;
    for (let n = 0; n < 10 && why === 0; n++) why = addItem(h, itemId('Chain Mail')); // 14 each
    expect(why).toBe(5);
    expect(weightOf(h)).toBeLessThanOrEqual(capacityOf(h.attr[0]));
    const w = world(Cls.Warrior);
    w.hero!.attr[0] = 40;
    for (let n = 0; n < INV_MAX; n++) addItem(w.hero!, itemId('Wooden Buckler'));
    expect(w.hero!.inv.length).toBe(INV_MAX);
    expect(addItem(w.hero!, itemId('Wooden Buckler'))).toBe(4);
  });
});

describe('potions, elixirs and spells from scrolls', () => {
  it('a draught heals, an elixir raises an attribute for good', () => {
    const sim = world(Cls.Warrior);
    sim.cb.hp[0] = 10;
    cmd(sim, { type: 'hero', op: 'use', item: itemId('Healing Draught') });
    expect(sim.cb.hp[0]).toBe(60);
    give(sim, 'Elixir of Body');
    const max = sim.cb.hpMax[0];
    cmd(sim, { type: 'hero', op: 'use', item: itemId('Elixir of Body') });
    expect(sim.hero!.attr[0]).toBe(9);
    expect(sim.cb.hpMax[0]).toBe(max + 10);
    expect(sim.hero!.inv.some((s) => s.item === itemId('Elixir of Body'))).toBe(false);
  });
  it('a full-health hero keeps the draught', () => {
    const sim = world(Cls.Warrior);
    const n = sim.hero!.inv[0].n;
    cmd(sim, { type: 'hero', op: 'use', item: itemId('Healing Draught') });
    expect(sim.hero!.inv[0].n).toBe(n);
  });
  it('a scroll teaches a spell when Mind is high enough, once', () => {
    const sim = world(Cls.Mage);
    const fireball = 1;
    expect((sim.cb.known[0] >>> fireball) & 1).toBe(0);
    give(sim, 'Scroll of Fireball', 2);
    cmd(sim, { type: 'hero', op: 'use', item: itemId('Scroll of Fireball') });
    expect((sim.cb.known[0] >>> fireball) & 1).toBe(1);
    cmd(sim, { type: 'hero', op: 'use', item: itemId('Scroll of Fireball') }); // already known: kept
    expect(sim.hero!.inv.find((s) => s.item === itemId('Scroll of Fireball'))?.n).toBe(1);
    const w = world(Cls.Warrior);
    give(w, 'Scroll of Fireball');
    cmd(w, { type: 'hero', op: 'use', item: itemId('Scroll of Fireball') }); // Mind 3 is too low
    expect((w.cb.known[0] >>> fireball) & 1).toBe(0);
  });
  it('spell power from Mind and staves scales spell damage', () => {
    const sim = world(Cls.Mage, 1, [[Kind.Golem, 8, 5]]);
    expect(sim.cb.mod[M.Pow]).toBeGreaterThan(0);
    sim.cb.hpMax[1] = 3000;
    sim.cb.hp[1] = 3000;
    sim.cb.mana[0] = sim.cb.manaMax[0];
    for (let t = 0; t < 120; t++) sim.step(t === 0 ? [{ type: 'order', order: 'cast', ids: [0], spell: 0, target: 1 }] : []);
    const dealt = 3000 - sim.cb.hp[1];
    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeGreaterThanOrEqual(Math.floor(16 * (100 + sim.cb.mod[M.Pow]) / 100) * 0.4); // resist and pow both applied
  });
});

describe('skills grow with use', () => {
  it('Blade rises after enough blows, Sorcery after casts', () => {
    const sim = world(Cls.Warrior, 1, [[Kind.Golem, 6, 5]]);
    sim.cb.hpMax[1] = 30000;
    sim.cb.hp[1] = 30000;
    for (let t = 0; t < 700; t++) sim.step(t === 0 ? [{ type: 'order', order: 'attack', ids: [0], target: 1 }] : []);
    expect(sim.hero!.skill[0]).toBeGreaterThanOrEqual(1);
    expect(sim.hero!.use[0]).toBeLessThan(skillNeed(sim.hero!.skill[0]));
    const m = world(Cls.Mage, 1, [[Kind.Golem, 8, 5]]);
    m.cb.hpMax[1] = 30000;
    m.cb.hp[1] = 30000;
    let casts = 0;
    for (let t = 0; t < 4000 && m.hero!.skill[2] < 1; t++) {
      m.cb.mana[0] = m.cb.manaMax[0];
      m.step(t % 40 === 0 ? [{ type: 'order', order: 'cast', ids: [0], spell: 0, target: 1 }] : []);
      casts++;
    }
    expect(m.hero!.skill[2]).toBe(1);
    expect(casts).toBeLessThan(4000);
  });
});

describe('loot', () => {
  it('foes leave item bags and the hero picks one up with a pickup order', () => {
    const sim = world(Cls.Warrior, 1, [[Kind.Golem, 7, 5], [Kind.Golem, 7, 6], [Kind.Golem, 8, 5], [Kind.Golem, 8, 6], [Kind.Golem, 9, 5], [Kind.Golem, 9, 6]]);
    for (let j = 1; j < sim.count; j++) {
      sim.cb.hp[j] = 1;
      sim.cb.ord[j] = 8;
    }
    sim.cb.recordFx = true;
    sim.step([{ type: 'order', order: 'attack', ids: [0], x: 8, y: 5 }]);
    for (let t = 0; t < 800 && sim.cb.alive[1] > 0; t++) sim.step();
    expect(sim.cb.alive[1]).toBe(0);
    let bags = 0;
    for (let b = 0; b < POOLS.bags; b++) if (sim.cb.bI[b]) bags++;
    expect(bags).toBeGreaterThan(0); // golems drop 85 percent of the time
    const b = [...Array(POOLS.bags).keys()].find((k) => sim.cb.bI[k])!;
    const item = sim.cb.bI[b] - 1;
    const before = sim.hero!.inv.reduce((n, s) => n + s.n, 0);
    sim.hero!.attr[0] = 40; // room for anything
    sim.step([{ type: 'order', order: 'pickup', ids: [0, 0], x: sim.cb.bX[b] / FP, y: sim.cb.bY[b] / FP }]);
    for (let t = 0; t < 400 && sim.cb.bI[b]; t++) sim.step();
    expect(sim.cb.bI[b]).toBe(0);
    expect(sim.hero!.inv.reduce((n, s) => n + s.n, 0)).toBe(before + 1);
    expect(sim.hero!.inv.some((s) => s.item === item)).toBe(true);
  });
  it('dropping puts the item on the ground again', () => {
    const sim = world(Cls.Warrior);
    cmd(sim, { type: 'hero', op: 'drop', item: itemId('Healing Draught') });
    expect(sim.cb.bI.some((v) => v === itemId('Healing Draught') + 1)).toBe(true);
    expect(sim.hero!.inv[0].n).toBe(1);
  });
});

describe('determinism', () => {
  it('replays and snapshots stay exact with hero commands', () => {
    const make = (): Sim => world(Cls.Warrior, 1, [[Kind.Gnoll, 9, 5], [Kind.Gnoll, 9, 6], [Kind.Imp, 11, 5]], 5);
    const a = make();
    const script: Record<number, Command[]> = {
      5: [{ type: 'order', order: 'attack', ids: [0], x: 9, y: 5 }],
      200: [{ type: 'hero', op: 'use', item: itemId('Healing Draught') }],
      260: [{ type: 'hero', op: 'drop', item: itemId('Healing Draught') }],
    };
    for (let t = 0; t < 500; t++) a.step(script[a.tick + 1] ?? []);
    const b = make();
    replay(b, a.log, 500);
    expect(b.hash()).toBe(a.hash());
    const snap = a.snapshot();
    const c = make();
    c.restore(snap);
    expect(c.hash()).toBe(a.hash());
    for (let t = 0; t < 100; t++) {
      a.step();
      c.step();
    }
    expect(c.hash()).toBe(a.hash());
    expect(MODN).toBe(12);
  });
});
