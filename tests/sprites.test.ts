import { describe, expect, it } from 'vitest';
import { ANIMS, DIRECTIONS, checkSheet, frameName, type UnitSheet } from '../src/sprites/contract';

function goodSheet(): UnitSheet {
  const frames: UnitSheet['frames'] = {};
  let k = 0;
  for (const [a, n] of Object.entries(ANIMS))
    for (let d = 0; d < DIRECTIONS; d++)
      for (let i = 0; i < n; i++, k++)
        frames[frameName('u', a, d, i)] = { frame: { x: (k % 16) * 32, y: Math.floor(k / 16) * 32, w: 32, h: 32 } };
  return {
    frames,
    meta: { image: 'u.png', size: { w: 512, h: 512 }, thornvael: { contract: 1, unit: 'u', directions: 16, cell: [32, 32], anims: { ...ANIMS }, mask: 'u-mask.png' } },
  };
}

describe('sprite contract', () => {
  it('accepts a conforming sheet', () => {
    expect(checkSheet(goodSheet())).toEqual([]);
  });
  it('names frames with two digits', () => {
    expect(frameName('hero', 'walk', 4, 3)).toBe('hero/walk/04/03');
  });
  it('rejects a missing frame', () => {
    const s = goodSheet();
    delete s.frames[frameName('u', 'walk', 7, 2)];
    expect(checkSheet(s).join()).toContain('missing frame u/walk/07/02');
  });
  it('rejects a wrong cell size and an oversized atlas', () => {
    const s = goodSheet();
    s.frames[frameName('u', 'stand', 0, 0)].frame.w = 30;
    s.meta.size = { w: 4096, h: 512 };
    const e = checkSheet(s).join();
    expect(e).toContain('cell is 32x32');
    expect(e).toContain('exceeds 2048');
  });
  it('rejects overlapping frames and missing meta', () => {
    const s = goodSheet();
    s.frames[frameName('u', 'stand', 0, 1)].frame = { x: 0, y: 0, w: 32, h: 32 };
    expect(checkSheet(s).join()).toContain('overlap');
    expect(checkSheet({ frames: {}, meta: { image: 'x', size: { w: 8, h: 8 } } })).toEqual(['meta.thornvael is missing']);
  });
});

describe('rendered hero atlas', () => {
  it('conforms to the contract', async () => {
    const { readFileSync } = await import('node:fs');
    const sheet = JSON.parse(readFileSync('public/sprites/hero.json', 'utf8')) as UnitSheet;
    expect(checkSheet(sheet)).toEqual([]);
  });
});
