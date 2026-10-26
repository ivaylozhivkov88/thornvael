import { describe, expect, it } from 'vitest';
import { ControlGroups } from '../src/groups';

describe('control groups', () => {
  it('saves, replaces, adds without duplicates and clears', () => {
    const g = new ControlGroups();
    g.set(1, [5, 2, 9]);
    expect(g.get(1)).toEqual([2, 5, 9]);
    g.add(1, [9, 3]);
    expect(g.get(1)).toEqual([2, 3, 5, 9]);
    g.set(1, [7]);
    expect(g.get(1)).toEqual([7]);
    g.set(1, []);
    expect(g.size(1)).toBe(0);
  });
  it('keeps groups separate', () => {
    const g = new ControlGroups();
    g.set(1, [1, 2]);
    g.set(9, [3]);
    expect(g.get(1)).toEqual([1, 2]);
    expect(g.get(9)).toEqual([3]);
    expect(g.get(4)).toEqual([]);
  });
  it('recalls on the first press and centres on a quick second press', () => {
    const g = new ControlGroups();
    expect(g.press(2, 1000)).toBe('recall');
    expect(g.press(2, 1200)).toBe('center');
    expect(g.press(2, 1300)).toBe('recall'); // the double press was consumed
    expect(g.press(2, 2000)).toBe('recall'); // too slow
    expect(g.press(3, 2100)).toBe('recall'); // another group
  });
});
