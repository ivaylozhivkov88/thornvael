import { describe, expect, it } from 'vitest';
import { characterCarry, cleanName, newCharacter, NAME_MAX } from '../src/characters';
import { createHero } from '../src/sim/hero';

describe('persistent characters', () => {
  it('cleans names and falls back to a default', () => {
    expect(cleanName('  Ka<b>ra   Vel!! ')).toBe('Kabra Vel');
    expect(cleanName('x'.repeat(40)).length).toBe(NAME_MAX);
    expect(newCharacter('###', 0, false, 1).name).toBe('Nameless');
  });

  it('a new hero brings nothing, a played hero brings its state', () => {
    const c = newCharacter('Ash', 1, true, 2, 1000);
    expect(c.level).toBe(1);
    expect(characterCarry(c, { progress: undefined as never, shopSeed: 1 })).toBeNull();
    expect(typeof createHero).toBe('function');
  });
});
