import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { createHero, derive, totals, pickBag, addItem, heroCommand } from '../src/sim/hero';
import { Slot, Ik, ITEMS, getItemDef, DYNAMIC_ITEM_OFFSET, type ItemInstance, type ItemDef } from '../src/sim/items';
import { rollMagicItem, rollRareItem } from '../src/sim/affixes';
import { extractCarryover, applyCarryover } from '../src/carryover';
import { makeSave, decodeSave, encodeSave, migrateSave, SAVE_VERSION } from '../src/save';
import { blankDoc } from '../src/mapdoc';
import type { GameMap } from '../src/map';

function field(w: number, h: number): GameMap {
  return { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h).fill(200) };
}

const dummyMap: GameMap = field(16, 16);

describe('Procedural Affix Instances Architecture', () => {
  it('generates dynamic item instances with IDs >= 1000 and registers them', () => {
    const sim = new Sim(dummyMap, 42, [0], { combat: true });
    const base = ITEMS.find((d) => d.kind === Ik.Gear && d.slot === Slot.Weapon)!;
    expect(base).toBeDefined();

    const magicDef = rollMagicItem(base, base.tier, (n) => 0, 'magic');
    const inst = sim.createItemInstance(ITEMS.indexOf(base), 'magic', magicDef);

    expect(inst.id).toBeGreaterThanOrEqual(DYNAMIC_ITEM_OFFSET);
    expect(inst.quality).toBe('magic');
    expect(inst.def.name).toContain(base.name);

    // Resolves both via sim and via global getItemDef
    expect(sim.getItemDef(inst.id)).toBe(inst.def);
    expect(getItemDef(inst.id)).toBe(inst.def);
  });

  it('rolls 2-word rare items with distinct naming and multiple affixes', () => {
    const base = ITEMS.find((d) => d.kind === Ik.Gear && d.slot === Slot.Armor)!;
    expect(base).toBeDefined();

    const rareDef = rollRareItem(base, 3, (n) => n % 5);
    expect(rareDef.rarity).toBe('rare');
    expect(rareDef.name).toContain(base.name);
    // Rare name has 2 prefix/suffix words before/around base name
    const words = rareDef.name.split(' ');
    expect(words.length).toBeGreaterThan(base.name.split(' ').length);
  });

  it('supports ground loot bag with dynamic instance ID in Int32Array bI', () => {
    const sim = new Sim(dummyMap, 1337, [0], { combat: true });
    createHero(sim, 0, 0, false, 1);

    const base = ITEMS.find((d) => d.kind === Ik.Gear && d.slot === Slot.Weapon)!;
    const rareDef = rollRareItem(base, 4, (n) => 0);
    const inst = sim.createItemInstance(ITEMS.indexOf(base), 'rare', rareDef);

    // Place on ground bag
    sim.cb.bI[0] = inst.id + 1;
    sim.cb.bX[0] = 500;
    sim.cb.bY[0] = 500;

    expect(sim.cb.bI[0]).toBe(inst.id + 1);
    expect(sim.cb.bI[0] - 1).toBe(inst.id);

    // Hero picks it up
    pickBag(sim, 0);
    expect(sim.cb.bI[0]).toBe(0);
    expect(sim.hero!.inv.some((s) => s.item === inst.id)).toBe(true);
  });

  it('equips dynamic instance and reflects rolled stats in derive()', () => {
    const sim = new Sim(dummyMap, 777, [0], { combat: true });
    createHero(sim, 0, 0, false, 1);
    const h = sim.hero!;

    const base = ITEMS.find((d) => d.kind === Ik.Gear && d.slot === Slot.Weapon)!;
    const baseStats = derive(h);

    const customDef: ItemDef = {
      ...base,
      name: 'Mighty Dragon Glaive',
      min: base.min + 25,
      max: base.max + 35,
      acc: base.acc + 15,
      hp: 50,
      rarity: 'rare',
    };
    const inst = sim.createItemInstance(ITEMS.indexOf(base), 'rare', customDef);

    addItem(h, inst.id);
    expect(h.inv.some((s) => s.item === inst.id)).toBe(true);

    heroCommand(sim, { type: 'hero', op: 'equip', item: inst.id });
    expect(h.eq[Slot.Weapon]).toBe(inst.id);

    const equippedStats = derive(h);
    expect(equippedStats.min).toBe(baseStats.min + 25);
    expect(equippedStats.max).toBe(baseStats.max + 35);
    expect(equippedStats.acc).toBe(baseStats.acc + 15);
  });

  it('preserves dynamic instances across snapshot and restore', () => {
    const sim = new Sim(dummyMap, 999, [0], { combat: true });
    createHero(sim, 0, 0, false, 1);
    const h = sim.hero!;

    const base = ITEMS.find((d) => d.kind === Ik.Gear && d.slot === Slot.Shield)!;
    const inst = sim.createItemInstance(ITEMS.indexOf(base), 'magic', { ...base, def: base.def + 10, name: 'Reinforced Shield' });
    addItem(h, inst.id);

    const snap = sim.snapshot();
    expect(snap.instances).toBeDefined();
    expect(snap.instances!.some((i) => i.id === inst.id)).toBe(true);

    const restoredSim = new Sim(dummyMap, 999, [0], { combat: true });
    restoredSim.restore(snap);

    expect(restoredSim.getItemDef(inst.id)).toBeDefined();
    expect(restoredSim.getItemDef(inst.id)!.name).toBe('Reinforced Shield');
    expect(restoredSim.hero!.inv.some((s) => s.item === inst.id)).toBe(true);
  });

  it('carries dynamic instances across campaign nodes via CarryoverState', () => {
    const sim = new Sim(dummyMap, 101, [0], { combat: true });
    createHero(sim, 0, 0, false, 1);
    const h = sim.hero!;

    const base = ITEMS.find((d) => d.kind === Ik.Gear && d.slot === Slot.Helm)!;
    const inst = sim.createItemInstance(ITEMS.indexOf(base), 'rare', { ...base, hp: 40, name: 'Crown of Radiance' });
    addItem(h, inst.id);

    const progress = { difficulty: 1, unlocked: ['m01', 'm02'], completed: ['m01'], node: 'm02', townVisits: 1 };
    const co = extractCarryover(sim, progress, 12345);

    expect(co.items).toBeDefined();
    expect(co.items!.some((i) => i.id === inst.id)).toBe(true);

    // Apply into fresh sim
    const nextSim = new Sim(dummyMap, 102, [0], { combat: true });
    createHero(nextSim, 0, 0, false, 1);
    applyCarryover(nextSim, co);

    expect(nextSim.getItemDef(inst.id)).toBeDefined();
    expect(nextSim.getItemDef(inst.id)!.name).toBe('Crown of Radiance');
    expect(nextSim.hero!.inv.some((s) => s.item === inst.id)).toBe(true);
  });

  it('migrates saves up to SAVE_VERSION 5 seamlessly', () => {
    const sim = new Sim(dummyMap, 303, [0], { combat: true });
    createHero(sim, 0, 0, false, 1);

    const saveFile = makeSave('Test Slot', 'M01', {
      doc: blankDoc(16, 16, 't'),
      seed: 303,
      snap: sim.snapshot(),
      ai: [],
      ui: { cam: [0, 0, 1], groups: [], slots: [], selected: [] },
    });

    expect(saveFile.saveVersion).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(5);

    // Test JSON encode/decode
    const encoded = encodeSave(saveFile);
    const decoded = decodeSave(encoded);
    expect(decoded.saveVersion).toBe(5);

    // Test legacy migration from v4
    const legacyV4 = { ...saveFile, saveVersion: 4 };
    const migrated = migrateSave(legacyV4);
    expect(migrated.saveVersion).toBe(5);
  });

  it('guarantees identical sim.hash() across identical seeds with dynamic item drops', () => {
    function runSim(seed: number): number {
      const sim = new Sim(field(20, 20), seed, [0, 1], { kinds: [2, 4], combat: true });
      createHero(sim, 0, 0, false, 1);
      const base = ITEMS.find((d) => d.kind === Ik.Gear && d.slot === Slot.Weapon)!;
      const rareDef = rollRareItem(base, 2, (n) => (n * 13) % 100);
      const inst = sim.createItemInstance(ITEMS.indexOf(base), 'rare', rareDef);
      sim.cb.bI[0] = inst.id + 1;
      sim.cb.bX[0] = 300;
      sim.cb.bY[0] = 300;
      for (let t = 0; t < 100; t++) sim.step();
      return sim.hash();
    }

    const h1 = runSim(4242);
    const h2 = runSim(4242);
    expect(h1).toBe(h2);
  });
});
