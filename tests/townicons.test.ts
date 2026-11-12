import { describe, expect, it } from 'vitest';
import { Ik, ITEMS, Slot } from '../src/sim/items';
import { SPELLS } from '../src/sim/spelldata';
import { classifyItemIcon, type ItemIconCategory } from '../src/townicons';

describe('original town item illustrations', () => {
  it('classifies every shipped item without a document or name matching', () => {
    expect(typeof document).toBe('undefined');
    const expected: ItemIconCategory[] = [
      'sword', 'sword', 'sword', 'sword', 'sword', 'staff', 'staff', 'staff', 'staff', 'staff', 'shield', 'shield',
      'shield', 'shield', 'helm', 'helm', 'helm', 'hat', 'hat', 'armor', 'armor', 'armor', 'robe', 'robe',
      'robe', 'boots', 'boots', 'boots', 'boots', 'ring', 'ring', 'ring', 'ring', 'ring', 'ring', 'ring',
      'ring', 'amulet', 'amulet', 'amulet', 'amulet', 'amulet', 'amulet', 'amulet', 'healing', 'healing', 'mana', 'mana',
      'elixir', 'elixir', 'elixir', 'elixir', 'scroll', 'scroll', 'scroll', 'scroll', 'scroll', 'tome', 'scroll', 'scroll',
      'tome', 'scroll', 'tome', 'scroll', 'scroll', 'scroll', 'scroll', 'tome', 'scroll', 'scroll', 'tome', 'scroll',
      'scroll', 'tome', 'scroll', 'scroll', 'gloves', 'gloves', 'gloves', 'gloves', 'shield', 'sword', 'armor', 'tome',
      'scroll', 'tome', 'tome', 'scroll', 'scroll', 'scroll', 'tome', 'axe', 'axe', 'axe', 'axe', 'sword',
      'sword', 'mace', 'mace', 'mace', 'mace', 'sword', 'sword', 'sword', 'sword', 'sword', 'sword', 'sword',
      'sword', 'sword', 'sword', 'wand', 'wand', 'wand', 'wand', 'wand', 'bow', 'bow', 'bow', 'sword',
      'bow', 'shield', 'shield', 'shield', 'shield', 'shield', 'shield', 'shield', 'helm', 'helm', 'crown', 'hat',
      'crown', 'helm', 'helm', 'armor', 'armor', 'armor', 'armor', 'armor', 'robe', 'robe', 'boots', 'boots',
      'boots', 'boots', 'boots', 'boots', 'gloves', 'gloves', 'gloves', 'gloves', 'gloves', 'gloves', 'gloves', 'ring',
      'ring', 'ring', 'ring', 'ring', 'ring', 'ring', 'amulet', 'amulet', 'amulet', 'amulet', 'amulet', 'amulet',
      'amulet', 'helm', 'shield', 'armor', 'boots', 'staff', 'robe', 'amulet', 'helm', 'boots', 'gloves', 'helm',
      'armor', 'gloves', 'boots', 'sword', 'helm', 'armor', 'gloves', 'wand', 'crown', 'robe', 'ring', 'mace',
      'crown', 'armor', 'boots', 'gloves', 'staff', 'crown', 'robe', 'amulet', 'gloves', 'helm', 'shield', 'ring',
      'sword', 'gloves', 'sword', 'helm', 'robe', 'boots', 'staff', 'staff', 'amulet', 'crown', 'sword', 'mace',
      'shield', 'boots', 'armor', 'sword', 'staff', 'helm', 'ring', 'shield', 'armor', 'gloves', 'shield', 'sword',
      'amulet', 'helm', 'shield', 'boots', 'ring', 'crown', 'robe', 'gloves', 'amulet', 'amulet', 'armor', 'gloves',
      'mace', 'armor', 'gloves', 'amulet', 'staff', 'ring', 'boots', 'boots', 'ring',
    ];
    expect(ITEMS).toHaveLength(expected.length);
    ITEMS.forEach((item, id) => {
      expect(classifyItemIcon(id), `${id}: ${item.name}`).toMatchObject({ category: expected[id], tier: item.tier });
    });
    expect(new Set(expected).size).toBe(21);
  });

  it('routes rare material gear through the existing original icon variants', () => {
    const cases = [
      ['Mithril Gale Buckler', { category: 'shield', tier: 3, tone: 'air' }],
      ['Adamantium Needle', { category: 'sword', tier: 4, tone: 'agility' }],
      ['Dragon Leather Mantle', { category: 'armor', tier: 4, tone: 'fire' }],
    ] as const;
    for (const [name, expectedIcon] of cases) {
      const id = ITEMS.findIndex((item) => item.name === name);
      expect(id, name).toBeGreaterThanOrEqual(0);
      expect(classifyItemIcon(id), name).toEqual(expectedIcon);
    }
  });

  it('rejects invalid, fractional, oversized and coercible IDs instead of selecting real goods', () => {
    const valueOf = (): never => { throw new Error('IDs must never be coerced'); };
    const invalid: unknown[] = [-1, -100, ITEMS.length, 1.5, Number.NaN, Infinity, -Infinity,
      Number.MAX_SAFE_INTEGER + 1, 2 ** 32, '0', 'constructor', '__proto__', '<svg onload=alert(1)>', null, undefined, [], { valueOf }];
    for (const id of invalid) {
      expect(classifyItemIcon(id as number)).toEqual({ category: 'empty', tier: 0, tone: 'neutral' });
    }
    expect(classifyItemIcon(0).category).toBe('sword');
    const silkGloves = ITEMS.findIndex((item) => item.name === 'Silk Gloves');
    expect(classifyItemIcon(silkGloves).category).toBe('gloves');
    expect(classifyItemIcon(ITEMS.length - 1).category).not.toBe('empty');
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

  it('assigns appropriate weapon, armor, shield, helm, and gear icons to all set items', async () => {
    const { ALL_SET_ITEMS } = await import('../src/sim/sets');
    const expectedCategories: Record<string, ItemIconCategory> = {
      "Iron Warden's Visor": 'helm',
      "Iron Warden's Tower": 'shield',
      "Iron Warden's Hauberk": 'armor',
      "Iron Warden's Greaves": 'boots',
      "Ember-Weaver's Focus": 'staff',
      'Robe of the Blazing Core': 'robe',
      'Heart of Cinders': 'amulet',
      "Shadow-Stalker's Cowl": 'helm',
      'Boots of the Mist-Strider': 'boots',
      'Grip of the Night-Hunter': 'gloves',
      "Alder Vanguard's Sallet": 'helm',
      "Alder Vanguard's Brigandine": 'armor',
      "Alder Vanguard's Grips": 'gloves',
      "Alder Vanguard's Striders": 'boots',
      "Redmarsh Reaver's Cleaver": 'sword',
      "Redmarsh Reaver's Visage": 'helm',
      "Redmarsh Reaver's Hauberk": 'armor',
      "Redmarsh Reaver's Claws": 'gloves',
      "Boreal Frost-Weaver's Wand": 'wand',
      "Boreal Frost-Weaver's Circlet": 'crown',
      "Boreal Frost-Weaver's Robe": 'robe',
      "Boreal Frost-Weaver's Band": 'ring',
      'Crown-Forged Greatmaul': 'mace',
      'Crown-Forged Great-Helm': 'crown',
      'Crown-Forged Full Plate': 'armor',
      'Crown-Forged Greaves': 'boots',
      'Crown-Forged Gauntlets': 'gloves',
      "Astral Sovereign's Spire": 'staff',
      "Astral Sovereign's Diadem": 'crown',
      "Astral Sovereign's Robes": 'robe',
      "Astral Sovereign's Eye": 'amulet',
      "Astral Sovereign's Handwraps": 'gloves',
    };
    for (const piece of ALL_SET_ITEMS) {
      const icon = classifyItemIcon(piece);
      expect(icon.category, piece.name).toBe(expectedCategories[piece.name]);
      expect(icon.tier, piece.name).toBe(piece.tier);
    }
  });
});
