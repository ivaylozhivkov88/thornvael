import { describe, expect, it } from 'vitest';
import { applyAffixes, MAGIC_PREFIXES, MAGIC_SUFFIXES, rollAffix, rollMagicItem, UNIQUE_ARTIFACTS } from '../src/sim/affixes';
import { Ik, ItemDef, Slot } from '../src/sim/items';

function dummySword(): ItemDef {
  return {
    name: 'Iron Sword',
    kind: Ik.Gear,
    slot: Slot.Weapon,
    tier: 2,
    w: 6,
    cls: 1,
    need: 0,
    needv: 8,
    min: 4,
    max: 6,
    acc: 1,
    cover: 0,
    def: 0,
    abs: 0,
    res: [0, 0, 0, 0, 0],
    attr: [0, 0, 0, 0],
    hp: 0,
    mana: 0,
    pow: 0,
    heal: 0,
    restore: 0,
    grow: 0,
    spell: -1,
  };
}

describe('magic affixes model (classic ARPG MagicPrefix / MagicSuffix)', () => {
  it('rollAffix filters by tier, gear slot, and mutual exclusion group', () => {
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % n;
    };

    // Tier 1 weapon prefix
    const p1 = rollAffix(MAGIC_PREFIXES, 1, Slot.Weapon, 0, rnd);
    expect(p1).not.toBeNull();
    expect(p1!.tierMin).toBeLessThanOrEqual(1);
    expect(p1!.tierMax).toBeGreaterThanOrEqual(1);
    if (p1!.slots) expect(p1!.slots).toContain(Slot.Weapon);

    // Mutual exclusion: exclude group of p1
    const p2 = rollAffix(MAGIC_PREFIXES, 1, Slot.Weapon, p1!.group, rnd);
    if (p2) expect(p2.group).not.toBe(p1!.group);

    // Armor slot cannot receive weapon-only prefix (group 1)
    for (let i = 0; i < 20; i++) {
      const pArmor = rollAffix(MAGIC_PREFIXES, 2, Slot.Armor, 0, rnd);
      if (pArmor && pArmor.slots) {
        expect(pArmor.slots).toContain(Slot.Armor);
      }
    }
  });

  it('applyAffixes generates enriched item name and aggregates stats deterministically', () => {
    const base = dummySword();
    const prefix = MAGIC_PREFIXES.find((p) => p.name === 'Serrated')!;
    const suffix = MAGIC_SUFFIXES.find((s) => s.name === 'of Carnage')!;

    const magic = applyAffixes(base, prefix, suffix);
    expect(magic.name).toBe('Serrated Iron Sword of Carnage');
    expect(magic.min).toBe(base.min + prefix.min! + suffix.min!);
    expect(magic.max).toBe(base.max + prefix.max! + suffix.max!);
    expect(magic.acc).toBe(base.acc + (prefix.acc ?? 0));
  });

  it('rollMagicItem generates valid magic items with prefix and/or suffix', () => {
    const base = dummySword();
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };

    for (let i = 0; i < 25; i++) {
      const item = rollMagicItem(base, 2, rnd);
      expect(item.name).toContain('Iron Sword');
      expect(item.tier).toBe(2);
      expect(item.min).toBeGreaterThanOrEqual(base.min);
      expect(item.max).toBeGreaterThanOrEqual(base.max);
    }
  });

  it('contains 48 unique artifacts with distinct names, high tiers and socket architectural hooks', () => {
    expect(UNIQUE_ARTIFACTS).toHaveLength(48);
    const names = new Set(UNIQUE_ARTIFACTS.map((u) => u.name));
    expect(names.size).toBe(48);
    for (const art of UNIQUE_ARTIFACTS) {
      expect(art.tier).toBeGreaterThanOrEqual(2);
      expect(art.kind).toBe(Ik.Gear);
      expect(art.slot).toBeGreaterThanOrEqual(0);
      expect(art.slot).toBeLessThan(8);
    }
    const withSockets = UNIQUE_ARTIFACTS.filter((u) => u.sockets !== undefined && u.sockets > 0);
    expect(withSockets.length).toBeGreaterThan(5);
  });
});
