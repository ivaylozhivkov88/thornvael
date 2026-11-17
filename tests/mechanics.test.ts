import { describe, expect, it } from 'vitest';
import { combineCritChance } from '../src/sim/mechanics';

describe('combineCritChance', () => {
  it('combines independent sources', () => {
    expect(combineCritChance(0, 0)).toBe(0);
    expect(combineCritChance(50, 50)).toBe(75);
    expect(combineCritChance(10)).toBe(10);
    expect(combineCritChance(100, 20)).toBe(100);
  });
});
