import { describe, expect, it } from 'vitest';
import { GestureRecognizer, pickUnit, unitsInBox } from '../src/input';

function make(box = false, add = false) {
  const state = { box, add };
  return { state, g: new GestureRecognizer({ boxMode: () => state.box, additive: () => state.add }) };
}

describe('gestures', () => {
  it('mouse: click, shift-click, right click, drag box', () => {
    const { g } = make();
    g.down(1, 10, 10, false, 0);
    expect(g.up(1)).toEqual([{ type: 'click', x: 10, y: 10, additive: false }]);
    g.down(1, 10, 10, false, 0, true);
    expect(g.up(1)).toEqual([{ type: 'click', x: 10, y: 10, additive: true }]);
    expect(g.down(1, 50, 60, false, 2)).toEqual([{ type: 'move-to', x: 50, y: 60 }]);
    g.up(1);
    g.down(1, 10, 10, false, 0);
    expect(g.move(1, 40, 40)[0].type).toBe('box-preview');
    expect(g.up(1).at(-1)).toEqual({ type: 'box', x0: 10, y0: 10, x1: 40, y1: 40, additive: false });
  });
  it('touch: tap, small jitter is still a tap', () => {
    const { g } = make();
    g.down(1, 100, 100, true);
    expect(g.move(1, 103, 102)).toEqual([]);
    expect(g.up(1)).toEqual([{ type: 'tap', x: 103, y: 102, additive: false }]);
  });
  it('touch: one-finger drag pans, never box-selects, unless box mode is on', () => {
    const { g, state } = make();
    g.down(1, 100, 100, true);
    expect(g.move(1, 130, 100)).toEqual([{ type: 'pan', dx: 30, dy: 0 }]);
    expect(g.up(1)).toEqual([]);
    state.box = true;
    g.down(1, 100, 100, true);
    expect(g.move(1, 160, 150)[0].type).toBe('box-preview');
    expect(g.up(1).at(-1)?.type).toBe('box');
  });
  it('touch: Add toggle makes taps additive', () => {
    const { g } = make(false, true);
    g.down(1, 5, 5, true);
    expect(g.up(1)).toEqual([{ type: 'tap', x: 5, y: 5, additive: true }]);
  });
  it('touch: pinch zooms in and out in whole steps and does not tap', () => {
    const { g } = make();
    g.down(1, 100, 100, true);
    g.down(2, 140, 100, true);
    expect(g.move(2, 190, 100)).toEqual([{ type: 'zoom', dir: 1, x: 145, y: 100 }]);
    expect(g.move(2, 150, 100)).toEqual([{ type: 'zoom', dir: -1, x: 125, y: 100 }]);
    expect(g.up(2)).toEqual([]);
    expect(g.up(1)).toEqual([]);
  });
  it('wheel zooms', () => {
    const { g } = make();
    expect(g.wheel(-100, 1, 2)).toEqual([{ type: 'zoom', dir: 1, x: 1, y: 2 }]);
    expect(g.wheel(100, 1, 2)[0]).toMatchObject({ dir: -1 });
  });
});

describe('picking', () => {
  const pts: [number, number][] = [[10, 10], [100, 100], [104, 100]];
  const pos = (i: number): [number, number] => pts[i];
  it('box selects units inside, in any drag direction', () => {
    expect(unitsInBox(3, pos, { x0: 120, y0: 120, x1: 90, y1: 90 })).toEqual([1, 2]);
  });
  it('pick takes the nearest unit within the radius', () => {
    expect(pickUnit(3, pos, 103, 100, 22)).toBe(2);
    expect(pickUnit(3, pos, 60, 60, 22)).toBe(-1);
  });
});
