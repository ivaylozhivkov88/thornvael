import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W, generateMap, isBlockedAt } from '../src/map';

describe('map', () => {
  const map = generateMap(7);
  it('is deterministic', () => {
    const again = generateMap(7);
    expect(again.terrain).toEqual(map.terrain);
    expect(again.objects).toEqual(map.objects);
    expect(map.terrain).toHaveLength(MAP_W * MAP_H);
  });
  it('has heights, obstacles and objects', () => {
    expect(new Set(map.height).size).toBeGreaterThan(1);
    expect(map.blocked.some((b) => b === 1)).toBe(true);
    expect(map.objects.length).toBeGreaterThan(50);
  });
  it('keeps the start meadow open and treats outside as blocked', () => {
    expect(isBlockedAt(map, 5, MAP_H - 6)).toBe(false);
    expect(isBlockedAt(map, -1, 0)).toBe(true);
    expect(isBlockedAt(map, MAP_W, 0)).toBe(true);
  });
});
