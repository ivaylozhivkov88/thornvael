import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { Kind, M, MODN, POOLS } from '../src/sim/combat';
import { INV_MAX, Why, addItem, createHero, derive, equipmentStamp, skillNeed, weightOf, capacityOf, type EquipmentAction, type HeroCommand, type HeroState } from '../src/sim/hero';
import { Cls, ITEMS, Ik, LOOT_RULES, Slot, itemId, rollLoot } from '../src/sim/items';
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
    expect(ITEMS.length).toBeGreaterThan(60);
    expect(new Set(ITEMS.map((d) => d.name)).size).toBe(ITEMS.length);
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

  it('rare material gear is selectable through existing tiered monster loot pools', () => {
    const cases = [
      ['Mithril Gale Buckler', 3, [Kind.Mage, Kind.Golem, Kind.Imp]],
      ['Adamantium Needle', 4, [Kind.Mage, Kind.Golem]],
      ['Dragon Leather Mantle', 4, [Kind.Mage, Kind.Golem]],
    ] as const;
    for (const [name, tier, sources] of cases) {
      const id = itemId(name);
      expect(id, name).toBeGreaterThanOrEqual(0);
      const pool = ITEMS.filter((item) => item.kind === Ik.Gear && item.tier === tier);
      const poolIndex = pool.findIndex((item) => item.name === name);
      expect(poolIndex, name).toBeGreaterThanOrEqual(0);
      for (const source of sources) {
        const [chance, lo, hi] = LOOT_RULES[source];
        expect(chance, `${name} source ${source}`).toBeGreaterThan(0);
        expect(lo).toBeLessThanOrEqual(tier);
        expect(hi).toBeGreaterThanOrEqual(tier);
        const draws = [0, tier - lo, poolIndex];
        let draw = 0;
        expect(rollLoot((n) => draws[draw++] % n, lo, hi), name).toBe(id);
      }
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

describe('queued equipment preconditions', () => {
  const guarded = (h: HeroState, action: EquipmentAction): Extract<HeroCommand, { expectedEquipment?: string }> => ({ type: 'hero', ...action, expectedEquipment: equipmentStamp(h, action) });
  const owned = (h: HeroState): number[] => {
    const counts = Array<number>(ITEMS.length).fill(0);
    for (const stack of h.inv) counts[stack.item] += stack.n;
    for (const id of h.eq) if (id >= 0) counts[id]++;
    return counts;
  };
  const armed = (): Sim => {
    const sim = world(Cls.Warrior);
    sim.hero!.attr[0] = 40;
    give(sim, 'Steel Sword', 2);
    give(sim, 'Iron Sword');
    sim.cb.recordFx = true;
    return sim;
  };
  const expectRefusal = (sim: Sim, why: number): void => {
    expect(sim.cb.fx.some((f) => f.type === 15 && f.v === why)).toBe(true);
  };

  it.each(['equip', 'unequip'] as const)('rejects stale queued %s after an earlier command changes its slot, without partial mutation', (op) => {
    const sim = armed(), control = armed();
    const action: EquipmentAction = op === 'equip' ? { op, item: itemId('Steel Sword') } : { op, slot: Slot.Weapon };
    const queued = guarded(sim.hero!, action);
    const before = structuredClone(sim.hero!);
    const first: HeroCommand = { type: 'hero', op: 'equip', item: itemId('Iron Sword') };
    // Merely constructing/holding the pending command does nothing.
    expect(sim.hero).toEqual(before);
    expect(sim.log).toHaveLength(0);
    sim.step([first, queued]);
    control.step([first]);
    expect(sim.hero).toEqual(control.hero);
    expect(sim.hash()).toBe(control.hash()); // includes derived combat state, not just inventory
    expect(owned(sim.hero!)).toEqual(owned(before));
    expectRefusal(sim, Why.None);
    expect(sim.log.map((entry) => entry.cmd)).toEqual([first, queued]);
  });

  it('rejects a stale incoming duplicate count and a repeated unequip from an emptied slot', () => {
    const sim = armed(), control = armed();
    const steel = itemId('Steel Sword');
    const queued = guarded(sim.hero!, { op: 'equip', item: steel });
    const first: HeroCommand = { type: 'hero', op: 'drop', item: steel };
    sim.step([first, queued]);
    control.step([first]);
    expect(sim.hash()).toBe(control.hash());
    expect(sim.hero!.inv.filter((s) => s.item === steel)).toEqual([{ item: steel, n: 1 }]);
    expectRefusal(sim, Why.None);
    const unequip = guarded(sim.hero!, { op: 'unequip', slot: Slot.Weapon });
    const counts = owned(sim.hero!);
    sim.step([unequip, unequip]);
    expect(sim.hero!.eq[Slot.Weapon]).toBe(-1);
    expect(owned(sim.hero!)).toEqual(counts);
    expect(sim.cb.fx.filter((f) => f.type === 14 && f.el === 5)).toHaveLength(1);
    expectRefusal(sim, Why.None);
  });

  it('ignores unrelated pack/slot changes and reordering, and conserves identical gear copies', () => {
    const sim = armed();
    const h = sim.hero!;
    const steel = itemId('Steel Sword');
    const action: EquipmentAction = { op: 'equip', item: steel };
    const queued = guarded(h, action);
    const before = structuredClone(h);
    expect(equipmentStamp(h, action)).toBe(queued.expectedEquipment);
    expect(h).toEqual(before); // the stamp is a pure read
    give(sim, 'Wooden Buckler');
    cmd(sim, { type: 'hero', op: 'equip', item: itemId('Wooden Buckler') });
    h.inv.reverse();
    const counts = owned(h);
    expect(equipmentStamp(h, action)).toBe(queued.expectedEquipment);
    cmd(sim, queued);
    expect(h.eq[Slot.Weapon]).toBe(steel);
    expect(h.inv.filter((s) => s.item === steel)).toEqual([{ item: steel, n: 1 }]);
    expect(owned(h)).toEqual(counts);
    const unwear = guarded(h, { op: 'unequip', slot: Slot.Weapon });
    give(sim, 'Healing Draught');
    const withPotion = owned(h);
    cmd(sim, unwear);
    expect(h.eq[Slot.Weapon]).toBe(-1);
    expect(h.inv.filter((s) => s.item === steel)).toHaveLength(2);
    expect(owned(h)).toEqual(withPotion);
  });

  it('replaces gear with a full 24-entry pack but refuses full-pack unequip without loss', () => {
    const sim = armed();
    const h = sim.hero!;
    h.inv = [];
    give(sim, 'Steel Sword');
    give(sim, 'Wooden Buckler', INV_MAX - 1);
    expect(h.inv).toHaveLength(INV_MAX);
    const counts = owned(h);
    cmd(sim, guarded(h, { op: 'equip', item: itemId('Steel Sword') }));
    expect(h.eq[Slot.Weapon]).toBe(itemId('Steel Sword'));
    expect(h.inv).toHaveLength(INV_MAX);
    expect(owned(h)).toEqual(counts);
    const before = structuredClone(h);
    const stats = derive(h);
    cmd(sim, guarded(h, { op: 'unequip', slot: Slot.Weapon }));
    expect(h).toEqual(before);
    expect(derive(h)).toEqual(stats);
    expect(owned(h)).toEqual(counts);
    expectRefusal(sim, Why.Full);
  });

  it.each(['class', 'attribute', 'dead'] as const)('still enforces live %s validation with a matching stamp', (reason) => {
    const sim = world(reason === 'class' ? Cls.Mage : Cls.Warrior);
    const item = itemId(reason === 'attribute' ? 'Plate Armor' : 'Iron Sword');
    expect(addItem(sim.hero!, item)).toBe(0);
    sim.cb.recordFx = true;
    if (reason === 'attribute') sim.hero!.attr[0] = 14;
    const queued = guarded(sim.hero!, { op: 'equip', item });
    if (reason === 'attribute') sim.hero!.attr[0] = 8;
    if (reason === 'dead') sim.cb.hp[0] = 0;
    expect(equipmentStamp(sim.hero!, { op: 'equip', item })).toBe(queued.expectedEquipment);
    const before = structuredClone(sim.hero!);
    cmd(sim, queued);
    expect(sim.hero).toEqual(before);
    expectRefusal(sim, reason === 'class' ? Why.Class : reason === 'attribute' ? Why.Need : Why.Dead);
  });

  it('omitting the guard preserves legacy equip/use/unequip behavior after a slot change', () => {
    const sim = armed();
    const counts = owned(sim.hero!);
    sim.step([
      { type: 'hero', op: 'equip', item: itemId('Iron Sword') },
      { type: 'hero', op: 'equip', item: itemId('Steel Sword') },
      { type: 'hero', op: 'unequip', slot: Slot.Weapon },
      { type: 'hero', op: 'use', item: itemId('Iron Sword') },
    ]);
    expect(sim.hero!.eq[Slot.Weapon]).toBe(itemId('Iron Sword'));
    expect(owned(sim.hero!)).toEqual(counts);
    expect(sim.cb.fx.filter((f) => f.type === 14)).toHaveLength(4);
    expect(sim.cb.fx.some((f) => f.type === 15)).toBe(false);
  });

  it('replays serialized guarded commands and continues snapshots with identical hashes', () => {
    const a = armed();
    const steel = itemId('Steel Sword');
    const stale = guarded(a.hero!, { op: 'unequip', slot: Slot.Weapon });
    a.step([guarded(a.hero!, { op: 'equip', item: steel }), stale]);
    const saved = a.snapshot();
    const c = armed();
    c.restore(saved);
    expect(c.hash()).toBe(a.hash());
    expect(equipmentStamp(c.hero!, { op: 'unequip', slot: Slot.Weapon })).toBe(equipmentStamp(a.hero!, { op: 'unequip', slot: Slot.Weapon }));
    const counts = owned(a.hero!);
    const unwear = guarded(a.hero!, { op: 'unequip', slot: Slot.Weapon });
    const wear = guarded(a.hero!, { op: 'equip', item: steel });
    // First command changes the second command's target and incoming count.
    const continuation = JSON.parse(JSON.stringify([unwear, wear])) as Command[];
    a.step(continuation);
    c.step(continuation);
    for (let tick = 0; tick < 100; tick++) { a.step(); c.step(); }
    expect(c.hash()).toBe(a.hash());
    expect(owned(a.hero!)).toEqual(counts);
    const b = armed();
    replay(b, JSON.parse(JSON.stringify(a.log)), a.tick);
    expect(b.hash()).toBe(a.hash());
    expect(b.hero).toEqual(a.hero);
    expect(b.log).toEqual(a.log);
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
    expect((sim.cb.known[0] >>> fireball) & 1).toBe(0); // copying a spell costs gold, and the purse is empty
    sim.cb.gold[0] = 100;
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
    expect(MODN).toBe(20);
  });
});
