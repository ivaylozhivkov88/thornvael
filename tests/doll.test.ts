import { describe, expect, it } from 'vitest';
import { dollSet, lookFor, materialFilter, weaponKind } from '../src/doll';

describe('painted figure looks', () => {
  it('picks a weapon layer by item family for warriors', () => {
    const set = dollSet(0, false)!;
    expect(lookFor(set, 0, 1, 'Recurve Bow')).toBe('weapon-bow');
    expect(lookFor(set, 0, 1, 'Woodcutter Handaxe')).toBe('weapon-axe');
    expect(lookFor(set, 0, 1, 'Heavy Morningstar')).toBe('weapon-mace');
    expect(lookFor(set, 0, 1, 'Duelist Poignard')).toBe('weapon-dagger');
    expect(lookFor(set, 0, 1, 'Flamberge')).toBe('weapon');
  });

  it('keeps the staff for mages', () => {
    expect(lookFor(dollSet(1, true)!, 0, 1, 'Amber Focus Wand')).toBe('weapon');
    expect(weaponKind('Oak Staff')).toBeNull();
  });

  it('colours non-plate armour by material', () => {
    expect(materialFilter('Leather Jerkin')).not.toBe('');
    expect(materialFilter('Chain Mail')).not.toBe(materialFilter('Leather Jerkin'));
    expect(materialFilter('Plate Armor')).toBe('');
  });
});
