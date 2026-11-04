import { describe, expect, it } from 'vitest';
import { ANIMS, COMBAT_ANIMS, DIRECTIONS, checkSheet, checkCombatSheet, frameName, type UnitSheet } from '../src/sprites/contract';
import { animationFrame, palette, sheetDirection, splitMask } from '../src/sprites/palette';
import { execFileSync } from 'node:child_process';

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

describe('shipped combat profile', () => {
  function combatSheet(counts = { ...COMBAT_ANIMS }): UnitSheet {
    const sheet: UnitSheet = { frames: {}, animations: {}, meta: { image: 'u.png', size: { w: 1024, h: 1024 },
      thornvael: { contract: 1, unit: 'u', directions: 16, cell: [48, 48], anims: counts, mask: 'u-mask.png' } } };
    let k = 0;
    for (const [clip, n] of Object.entries(counts)) {
      sheet.animations![clip] = [];
      for (let d = 0; d < 16; d++) for (let i = 0; i < n; i++, k++) {
        const name = frameName('u', clip, d, i);
        sheet.frames[name] = { frame: { x: k % 21 * 48, y: Math.floor(k / 21) * 48, w: 48, h: 48 },
          sourceSize: { w: 48, h: 48 }, anchor: { x: 0.5, y: 0.85 } };
        sheet.animations![clip].push(name);
      }
    }
    return sheet;
  }
  it('accepts 416 complete frames while retaining generic legacy support', () => {
    const sheet = combatSheet();
    expect(Object.keys(sheet.frames)).toHaveLength(416);
    expect(checkCombatSheet(sheet)).toEqual([]);
    expect(checkSheet(goodSheet())).toEqual([]);
    expect(checkCombatSheet(goodSheet()).length).toBeGreaterThan(0);
  });
  it('rejects a self-consistent but incomplete combat set and a shortened action', () => {
    const counts = { ...COMBAT_ANIMS }; delete counts.die;
    expect(checkSheet(combatSheet(counts))).toEqual([]);
    expect(checkCombatSheet(combatSheet(counts)).join()).toContain('requires die=4');
    expect(checkCombatSheet(combatSheet({ ...COMBAT_ANIMS, attack: 3 })).join()).toContain('requires attack=4');
  });
  it('requires explicit feet anchors, sequence declarations and the memory budget', () => {
    const sheet = combatSheet();
    delete sheet.frames['u/stand/00/00'].anchor;
    delete sheet.animations;
    sheet.meta.size.w = 2048;
    const errors = checkCombatSheet(sheet).join();
    expect(errors).toContain('feet anchor');
    expect(errors).toContain('animation sequences');
    expect(errors).toContain('1024px');
  });
});

describe('rendered hero atlas', () => {
  it('conforms to the contract', async () => {
    const { readFileSync } = await import('node:fs');
    const sheet = JSON.parse(readFileSync('public/sprites/hero.json', 'utf8')) as UnitSheet;
    expect(checkSheet(sheet)).toEqual([]);
  });
});

describe('atlas CI gate', () => {
  it('rejects untrusted shapes, traversal, invalid dimensions, counts and rotated frames', () => {
    for (const input of [null, [], {}, { meta: { thornvael: {} } }]) expect(checkSheet(input).length).toBeGreaterThan(0);
    const s = goodSheet();
    s.meta.image = '../secret.png';
    expect(checkSheet(s).join()).toContain('basenames');
    s.meta.size.w = NaN;
    expect(checkSheet(s).join()).toContain('dimensions');
    const t = goodSheet();
    t.meta.thornvael!.anims.walk = Infinity;
    expect(checkSheet(t).join()).toContain('frame count');
    const u = goodSheet();
    u.frames['u/stand/00/00'].rotated = true;
    expect(checkSheet(u).join()).toContain('unrotated');
  });
  it('rejects an animation list that silently repeats a frame', () => {
    const s = goodSheet();
    s.animations = { stand: Array(64).fill('u/stand/00/00'), walk: [] };
    expect(checkSheet(s).join()).toContain('frame sequence');
  });
  it('validates every shipped atlas, decoded PNG and provenance entry through the CLI', () => {
    expect(execFileSync(process.execPath, ['tools/check-atlases.mjs'], { encoding: 'utf8' })).toContain('passed');
  });
});

describe('unit presentation', () => {
  it('maps all 16 simulation facings to the clockwise south-first sheet', () => {
    expect(Array.from({ length: 16 }, (_, i) => sheetDirection(i))).toEqual([12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
  it('walk and stand visit every frame, loop and remain stable on a paused tick', () => {
    expect(Array.from({ length: 9 }, (_, i) => animationFrame(i * 3, true))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
    expect(Array.from({ length: 5 }, (_, i) => animationFrame(i * 10, false))).toEqual([0, 1, 2, 3, 0]);
    expect(animationFrame(17, true)).toBe(animationFrame(17, true));
  });
  it('changes only the requested mask palette and clamps out-of-range tiers', () => {
    const p = palette(0, 1, 1);
    for (const [args, channel] of [[[1, 1, 1], 1], [[0, 2, 1], 2], [[0, 1, 2], 3]] as const) {
      const next = palette(args[0], args[1], args[2]);
      expect(next[channel]).not.toBe(p[channel]);
      expect(next.filter((_, i) => i !== channel)).toEqual(p.filter((_, i) => i !== channel));
    }
    expect(palette(0, 99, -5)).toEqual(palette(0, 5, 1));
    expect(new Set(Array.from({ length: 5 }, (_, i) => palette(0, 1, i + 1)[3])).size).toBe(5);
  });
  it('preserves source alpha exactly once, lighting and unmasked skin', () => {
    const color = new Uint8ClampedArray([180, 120, 90, 255, 90, 90, 90, 210, 180, 180, 180, 128, 50, 50, 50, 255]);
    const mask = new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    const layers = splitMask(color, mask);
    expect([...layers[0].slice(0, 4)]).toEqual([180, 120, 90, 255]);
    for (let p = 0; p < color.length; p += 4) {
      expect(layers.reduce((sum, layer) => sum + layer[p + 3], 0)).toBe(color[p + 3]);
      expect(layers[p / 4][p]).toBe(color[p]);
    }
    expect(() => splitMask(color, mask.slice(4))).toThrow('Mismatched');
  });
});
