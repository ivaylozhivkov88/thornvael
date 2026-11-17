import { describe, expect, it } from 'vitest';
import { loadDoc, type MapDoc } from '../src/mapdoc';
import { BUILT_IN, createMission } from '../src/mission';
import { decodeSave, encodeSave, makeSave } from '../src/save';
import { createHero } from '../src/sim/hero';
import { ITEMS } from '../src/sim/items';

function saveWith(dup: boolean) {
  const g = createMission(loadDoc(BUILT_IN.fen), 7);
  createHero(g.sim, 0, 1, true, 2);
  const base = ITEMS.findIndex((d) => d.kind === 0);
  const a = g.sim.createItemInstance(base, 'magic', { ...ITEMS[base], name: 'Test A' });
  const b = g.sim.createItemInstance(base, 'magic', { ...ITEMS[base], name: 'Test B' });
  const snap = g.sim.snapshot();
  if (dup) snap.instances = snap.instances!.map((i) => (i.id === b.id ? { ...i, serial: a.serial } : i));
  return { a, b, text: encodeSave(makeSave('A', 'A', { doc: BUILT_IN.fen as MapDoc, seed: 7, snap, ai: g.ai.snapshot(), ui: { cam: [0, 0, 1], groups: [], slots: [], selected: [0] }, node: 'm02-whispers-in-the-fen' }, 1)) };
}

describe('item serial numbers', () => {
  it('are uint32, distinct and deterministic', () => {
    const one = saveWith(false);
    const two = saveWith(false);
    expect(one.a.serial).toBe(two.a.serial);
    expect(one.a.serial).not.toBe(one.b.serial);
    for (const n of [one.a.serial!, one.b.serial!]) {
      expect(Number.isInteger(n) && n >= 0 && n <= 0xffffffff).toBe(true);
    }
  });

  it('survive a save round trip and import rejects a copied serial', () => {
    const ok = saveWith(false);
    const back = decodeSave(ok.text);
    expect(back.state.snap.instances!.map((i) => i.serial)).toEqual([ok.a.serial, ok.b.serial]);
    expect(() => decodeSave(saveWith(true).text)).toThrow(/duplicated items/);
  });
});
