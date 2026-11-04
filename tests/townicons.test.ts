import { describe, expect, it } from 'vitest';
import { Ik, ITEMS, Slot } from '../src/sim/items';
import { SPELLS } from '../src/sim/spelldata';
import { classifyItemIcon, type ItemIconCategory } from '../src/townicons';

describe('original town item illustrations', () => {
  it('classifies every shipped item without a document or name matching', () => {
    expect(typeof document).toBe('undefined');
    const expected: ItemIconCategory[] = [
      ...Array<ItemIconCategory>(5).fill('sword'), ...Array<ItemIconCategory>(5).fill('staff'),
      ...Array<ItemIconCategory>(4).fill('shield'), 'helm', 'helm', 'helm', 'hat', 'hat',
      'armor', 'armor', 'armor', 'robe', 'robe', 'robe', 'boots', 'boots', 'boots', 'boots',
      ...Array<ItemIconCategory>(8).fill('ring'), ...Array<ItemIconCategory>(7).fill('amulet'),
      'healing', 'healing', 'mana', 'mana', 'elixir', 'elixir', 'elixir', 'elixir',
      'scroll', 'scroll', 'scroll', 'scroll', 'scroll', 'tome', 'scroll', 'scroll', 'tome',
      'scroll', 'tome', 'scroll', 'scroll', 'scroll', 'scroll', 'tome', 'scroll', 'scroll',
      'tome', 'scroll', 'scroll', 'tome', 'scroll', 'scroll', 'gloves', 'gloves', 'gloves', 'gloves',
    ];
    expect(ITEMS).toHaveLength(expected.length);
    ITEMS.forEach((item, id) => {
      expect(classifyItemIcon(id), `${id}: ${item.name}`).toMatchObject({ category: expected[id], tier: item.tier });
    });
    expect(new Set(expected).size).toBe(16);
  });

  it('rejects invalid, fractional, oversized and coercible IDs instead of selecting real goods', () => {
    const valueOf = (): never => { throw new Error('IDs must never be coerced'); };
    const invalid: unknown[] = [-1, -100, ITEMS.length, 1.5, Number.NaN, Infinity, -Infinity,
      Number.MAX_SAFE_INTEGER + 1, 2 ** 32, '0', 'constructor', '__proto__', '<svg onload=alert(1)>', null, undefined, [], { valueOf }];
    for (const id of invalid) {
      expect(classifyItemIcon(id as number)).toEqual({ category: 'empty', tier: 0, tone: 'neutral' });
    }
    expect(classifyItemIcon(0).category).toBe('sword');
    expect(classifyItemIcon(ITEMS.length - 1).category).toBe('gloves');
  });

  it('keeps healing, mana and the four permanent attribute elixirs distinct', () => {
    const expected = [
      ['Healing Draught', 'healing', 'healing'], ['Greater Healing Draught', 'healing', 'healing'],
      ['Mana Draught', 'mana', 'mana'], ['Greater Mana Draught', 'mana', 'mana'],
      ['Elixir of Body', 'elixir', 'body'], ['Elixir of Agility', 'elixir', 'agility'],
      ['Elixir of Mind', 'elixir', 'mind'], ['Elixir of Spirit', 'elixir', 'spirit'],
    ];
    for (const [name, category, tone] of expected) {
      const id = ITEMS.findIndex((item) => item.name === name);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(classifyItemIcon(id)).toMatchObject({ category, tone });
    }
  });

  it('colors every learning item by the school of its actual taught spell', () => {
    const tones = ['neutral', 'fire', 'water', 'air', 'earth', 'astral'];
    const seen = new Set<string>();
    ITEMS.forEach((item, id) => {
      if (item.kind !== Ik.Learn) return;
      const spell = SPELLS[item.spell];
      expect(spell, item.name).toBeDefined();
      const icon = classifyItemIcon(id);
      expect(icon.tone, item.name).toBe(tones[spell.school]);
      expect(icon.category).toBe(item.w > 1 ? 'tome' : 'scroll');
      seen.add(icon.tone);
    });
    expect([...seen].sort()).toEqual(['air', 'astral', 'earth', 'fire', 'water']);
  });

  it('uses resistance and attribute enamel for jewelry, consistently across repeated calls', () => {
    const cases = [
      ['Ember Charm', 'fire'], ['Frost Charm', 'water'], ['Storm Charm', 'air'], ['Stone Charm', 'earth'],
      ['Ring of Might', 'body'], ['Ring of Grace', 'agility'], ['Ring of Insight', 'mind'], ['Ring of Calm', 'spirit'],
    ];
    for (const [name, tone] of cases) {
      const id = ITEMS.findIndex((item) => item.name === name);
      expect(classifyItemIcon(id).tone, name).toBe(tone);
    }
    ITEMS.forEach((item, id) => {
      const before = structuredClone(item);
      const first = classifyItemIcon(id);
      expect(classifyItemIcon(id)).toEqual(first);
      expect(item).toEqual(before);
      if (item.kind === Ik.Gear && item.slot === Slot.Gloves) expect(first.category).toBe('gloves');
    });
  });
});
