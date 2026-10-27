import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { DEFS, Elem, Kind, M, MODN, partAbs, partDef, partOf, strike, type HitRec } from '../src/sim/combat';
import { parseItems, parseSpells } from '../src/sim/data';
import { createHero, derive } from '../src/sim/hero';
import { ITEMS, Part, PART_WEIGHT, Slot, itemId } from '../src/sim/items';
import { SPELLS } from '../src/sim/spelldata';
import { Sim } from '../src/sim/sim';

function field(w: number, h: number): GameMap {
  return { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h).fill(200) };
}

function arena(kinds: number[], hpMul = 100): Sim {
  const sim = new Sim(field(20, 20), 3, kinds.map((_, i) => (i === 0 ? 0 : 1)), { kinds, combat: true, hpMul });
  kinds.forEach((_, i) => sim.place(i, 3 + i, 5));
  return sim;
}

describe('data tables', () => {
  it('loads every spell and item from public/data, scrolls name their spell', () => {
    expect(SPELLS.length).toBe(24);
    expect(SPELLS[0].name).toBe('Fire Bolt');
    expect(ITEMS.length).toBe(80);
    const scroll = ITEMS[itemId('Scroll of Fire Bolt')];
    expect(scroll.spell).toBe(0);
    expect(ITEMS[itemId('Iron Gauntlets')].slot).toBe(Slot.Gloves);
    expect(ITEMS[itemId('Plate Armor')].cover).toBe((1 << Part.Torso) | (1 << Part.Arms));
  });

  it('fails loudly on an unknown word, naming the entry', () => {
    expect(() => parseSpells({ version: 1, spells: [{ name: 'Oops', school: 'mud', target: 'foe' }] })).toThrow(/Oops: unknown school "mud"/);
    expect(() => parseItems({ version: 1, items: [{ name: 'Hat', kind: 'gear', slot: 'helm', cover: ['tail'] }] })).toThrow(/Hat: unknown body part "tail"/);
    expect(() => parseItems({ version: 1, items: [{ name: 'Scroll', kind: 'learn', spell: 'Nope' }] })).toThrow(/no spell named/);
    expect(() => parseItems({ items: [] })).toThrow(/version: 1/);
  });
});

describe('body-part armour', () => {
  it('blows land on parts by weight', () => {
    const n = [0, 0, 0, 0];
    for (let r = 0; r < 100; r++) n[partOf(r)]++;
    expect(n).toEqual([...PART_WEIGHT]);
  });

  it('each part has its own defence and absorption; the log records the numbers', () => {
    const sim = arena([Kind.Warrior, Kind.Golem]);
    expect(partDef(sim, 1, Part.Torso)).toBe(DEFS[Kind.Golem].def + DEFS[Kind.Golem].pdef[Part.Torso]);
    expect(partAbs(sim, 1, Part.Legs)).toBe(DEFS[Kind.Golem].pabs[Part.Legs]);
    sim.cb.log = [];
    for (let k = 0; k < 600; k++) strike(sim, 1, 10, 10, Elem.Physical, 8, 0);
    const log = sim.cb.log as HitRec[];
    expect(log.length).toBe(200); // capped
    const seen = new Set(log.map((h) => h.part));
    expect(seen.size).toBe(4);
    for (const h of log) {
      expect(h.src).toBe(0);
      if (h.dmg < 0) {
        expect(h.roll).toBeGreaterThanOrEqual(h.chance);
        continue;
      }
      expect(h.raw).toBe(h.part === Part.Head ? 15 : 10);
      expect(h.dmg).toBe(Math.max(1, h.raw - partAbs(sim, 1, h.part)));
      expect(h.cut).toBe(h.raw - h.dmg);
    }
  });

  it('a helm only guards the head, gauntlets only the arms', () => {
    const sim = arena([Kind.Hero, Kind.Gnoll]);
    const h = createHero(sim, 0, 0, false, 1);
    const bare = derive(h);
    h.eq[Slot.Helm] = itemId('Iron Helm');
    h.eq[Slot.Gloves] = itemId('Iron Gauntlets');
    const d = derive(h);
    expect(d.pabs[Part.Head] - bare.pabs[Part.Head]).toBe(3);
    expect(d.pabs[Part.Arms] - bare.pabs[Part.Arms]).toBe(3);
    expect(d.pabs[Part.Torso]).toBe(bare.pabs[Part.Torso]);
    expect(d.pabs[Part.Legs]).toBe(bare.pabs[Part.Legs]);
    expect(d.pdef[Part.Head] - bare.pdef[Part.Head]).toBe(2);
  });

  it('the hero mod array carries the per-part numbers', () => {
    const sim = arena([Kind.Hero, Kind.Gnoll]);
    const h = createHero(sim, 0, 0, false, 1);
    h.inv.push({ item: itemId('Iron Helm'), n: 1 });
    h.attr[0] = 10;
    sim.step([{ type: 'hero', op: 'equip', item: itemId('Iron Helm') }]);
    expect(sim.cb.mod[0 * MODN + M.PAbs + Part.Head]).toBe(3);
    expect(partAbs(sim, 0, Part.Head)).toBe(DEFS[Kind.Hero].pabs[Part.Head] + 3);
  });

  it('school damage ignores armour and logs no part', () => {
    const sim = arena([Kind.Mage, Kind.Golem]);
    sim.cb.log = [];
    strike(sim, 1, 20, 20, Elem.Astral, 0, 0);
    expect(sim.cb.log[0].part).toBe(-1);
    expect(sim.cb.log[0].dmg).toBe(20);
  });
});
