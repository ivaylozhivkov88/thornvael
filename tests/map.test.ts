import { describe, expect, it } from 'vitest';
import { H, W, findPath, makeMap } from '../src/map';

describe('map', () => {
  const map = makeMap();
  it('is deterministic', () => {
    expect(makeMap()).toEqual(map);
    expect(map).toHaveLength(W * H);
  });
  it('finds a path ending on the target', () => {
    const p = findPath(map, 2, 9, 10, 9);
    expect(p.at(-1)).toEqual([10, 9]);
  });
  it('refuses water', () => {
    const water = map.findIndex((t) => t === 2);
    expect(findPath(map, 2, 9, water % W, (water / W) | 0)).toEqual([]);
  });
});
