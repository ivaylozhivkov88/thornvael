import { describe, expect, it } from 'vitest';
import { Terrain, generateMap, type GameMap } from '../src/map';
import { DAY_TICKS, dayLight } from '../src/sim/daynight';
import { Pather, dir16, lineClear, regionsOf } from '../src/sim/path';
import { setupCrowd } from '../src/sim/bot';
import { FP, Sim, UNIT_SPEED } from '../src/sim/sim';

/** Open field with optional blocked rectangles and marsh rectangles. */
function field(w: number, h: number, walls: [number, number, number, number][] = [], marsh: [number, number, number, number][] = []): GameMap {
  const blocked = new Uint8Array(w * h);
  const terrain = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of walls) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blocked[y * w + x] = 1;
  for (const [x0, y0, x1, y1] of marsh) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) terrain[y * w + x] = Terrain.Marsh;
  return { w, h, terrain, height: new Uint8Array(w * h), blocked, objects: [], light: new Uint8Array(w * h).fill(200) };
}

function minPairDistance(s: Sim): number {
  let best = Infinity;
  for (let i = 0; i < s.count; i++) {
    for (let j = i + 1; j < s.count; j++) best = Math.min(best, Math.hypot(s.x[i] - s.x[j], s.y[i] - s.y[j]));
  }
  return best;
}

describe('directions', () => {
  it('maps vectors to 16 facings, 0 = east, clockwise', () => {
    expect(dir16(10, 0)).toBe(0);
    expect(dir16(10, 10)).toBe(2);
    expect(dir16(0, 10)).toBe(4);
    expect(dir16(-10, 10)).toBe(6);
    expect(dir16(-10, 0)).toBe(8);
    expect(dir16(-10, -10)).toBe(10);
    expect(dir16(0, -10)).toBe(12);
    expect(dir16(10, -10)).toBe(14);
    expect(dir16(100, 40)).toBe(1); // about 22 degrees
    expect(dir16(100, -40)).toBe(15);
  });
});

describe('A*', () => {
  // Vertical wall at x=10 with a one-tile gap at y=12.
  const map = field(24, 24, [
    [10, 0, 10, 11],
    [10, 13, 10, 23],
  ]);
  it('finds a way around walls through the gap and keeps the first and last tile', () => {
    const path = new Pather(map).find(2, 3, 20, 4)!;
    expect(path).not.toBeNull();
    const n = path.length / 2;
    expect([path[0], path[1]]).toEqual([2 * FP + 128, 3 * FP + 128]);
    expect([path[2 * n - 2], path[2 * n - 1]]).toEqual([20 * FP + 128, 4 * FP + 128]);
    expect(n).toBeGreaterThan(2); // a corner at the gap
    for (let k = 0; k + 1 < n; k++) expect(lineClear(map, path[2 * k], path[2 * k + 1], path[2 * k + 2], path[2 * k + 3])).toBe(true);
  });
  it('returns null for an enclosed goal and reports regions', () => {
    const walled = field(12, 12, [[4, 4, 8, 4], [4, 8, 8, 8], [4, 4, 4, 8], [8, 4, 8, 8]]);
    expect(new Pather(walled).find(1, 1, 6, 6)).toBeNull();
    const reg = regionsOf(walled);
    expect(reg[1 * 12 + 1]).not.toBe(reg[6 * 12 + 6]);
  });
  it('is the same on repeated searches (scratch buffers are reset)', () => {
    const p = new Pather(map);
    const a = p.find(2, 3, 20, 4)!;
    p.find(1, 1, 5, 20);
    expect(Array.from(p.find(2, 3, 20, 4)!)).toEqual(Array.from(a));
  });
});

describe('walking', () => {
  it('a unit goes through the gap and never stands in a wall', () => {
    const map = field(24, 24, [[10, 0, 10, 11], [10, 13, 10, 23]]);
    const s = new Sim(map, 1, [0]);
    s.place(0, 2, 3);
    s.step([{ type: 'move', ids: [0], x: 20.5, y: 4.5 }]);
    for (let t = 0; t < 600 && s.moving[0]; t++) {
      s.step();
      expect(map.blocked[Math.floor(s.y[0] / FP) * map.w + Math.floor(s.x[0] / FP)]).toBe(0);
    }
    expect(s.moving[0]).toBe(0);
    expect(s.x[0]).toBe(Math.round(20.5 * FP));
    expect(s.y[0]).toBe(Math.round(4.5 * FP));
  });
  it('is slower on marsh than on open ground', () => {
    const open = field(30, 6);
    const rough = field(30, 6, [], [[5, 0, 24, 5]]);
    const run = (m: GameMap): number => {
      const s = new Sim(m, 1, [0]);
      s.place(0, 1, 2);
      s.step([{ type: 'move', ids: [0], x: 28.5, y: 2.5 }]);
      let t = 0;
      while (s.moving[0] && t < 2000) {
        s.step();
        t++;
      }
      return t;
    };
    const a = run(open);
    const b = run(rough);
    expect(Math.abs(a - (27 * FP) / UNIT_SPEED)).toBeLessThan(3);
    expect(b).toBeGreaterThan(a + 20);
  });
  it('faces the direction of travel', () => {
    const s = new Sim(field(20, 20), 1, [0]);
    s.place(0, 2, 2);
    s.step([{ type: 'move', ids: [0], x: 12.5, y: 12.5 }]);
    s.step();
    expect(s.dir[0]).toBe(2);
  });
});

describe('groups', () => {
  it('a group squeezes through a one-tile gap without jamming and ends in a spread formation', () => {
    const map = field(40, 30, [[15, 0, 15, 13], [15, 15, 15, 29]]);
    const teams = Array(60).fill(0);
    const s = new Sim(map, 1, teams);
    for (let i = 0; i < 60; i++) s.place(i, 3 + (i % 10), 4 + Math.floor(i / 10) * 3);
    s.step([{ type: 'move', ids: [...Array(60).keys()], x: 30.5, y: 14.5 }]);
    let t = 0;
    while (t < 1500 && [...s.moving].some(Boolean)) {
      s.step();
      t++;
    }
    expect([...s.moving].some(Boolean)).toBe(false);
    for (let i = 0; i < 60; i++) {
      expect(s.x[i] / FP).toBeGreaterThan(16); // everyone made it past the wall
      expect(Math.hypot(s.x[i] / FP - 30.5, s.y[i] / FP - 14.5)).toBeLessThan(8);
    }
    expect(minPairDistance(s)).toBeGreaterThan(90); // about 0.35 tile: bodies do not overlap
  });
  it('keeps a formation: units end spread over several rows, not on one point', () => {
    const map = field(40, 30);
    const s = new Sim(map, 1, Array(20).fill(0));
    for (let i = 0; i < 20; i++) s.place(i, 3 + (i % 5), 20 + Math.floor(i / 5));
    s.step([{ type: 'move', ids: [...Array(20).keys()], x: 25.5, y: 10.5 }]);
    for (let t = 0; t < 600 && [...s.moving].some(Boolean); t++) s.step();
    const xs = new Set([...s.x].map((v) => Math.floor(v / (FP / 2))));
    const ys = new Set([...s.y].map((v) => Math.floor(v / (FP / 2))));
    expect(xs.size).toBeGreaterThan(4);
    expect(ys.size).toBeGreaterThan(2);
  });
  it('300 units cross the real map without a long step and without overlapping', () => {
    const map = generateMap(7);
    const teams = Array(300).fill(0);
    const s = new Sim(map, 1, teams);
    setupCrowd(s, 300);
    s.step([{ type: 'move', ids: [...Array(300).keys()], x: 45.5, y: 40.5 }]);
    let worst = 0;
    let t = 0;
    while (t < 2500 && [...s.moving].some(Boolean)) {
      const t0 = performance.now();
      s.step();
      worst = Math.max(worst, performance.now() - t0);
      t++;
    }
    const arrived = [...Array(300).keys()].filter((i) => Math.hypot(s.x[i] / FP - 45.5, s.y[i] / FP - 40.5) < 16).length;
    expect(arrived).toBeGreaterThan(295);
    expect(worst).toBeLessThan(60); // ms in Node; a single order or repath burst must not hitch
    expect(minPairDistance(s)).toBeGreaterThan(60);
    for (let i = 0; i < 300; i++) expect(map.blocked[Math.floor(s.y[i] / FP) * map.w + Math.floor(s.x[i] / FP)]).toBe(0);
  });
  it('snapshot taken mid-walk restores and continues identically', () => {
    const map = generateMap(7);
    const mk = (): Sim => {
      const s = new Sim(map, 5, Array(40).fill(0));
      for (let i = 0; i < 40; i++) s.place(i, 2 + (i % 10), map.h - 10 + Math.floor(i / 10));
      return s;
    };
    const a = mk();
    a.step([{ type: 'move', ids: [...Array(40).keys()], x: 50.5, y: 10.5 }]);
    for (let i = 0; i < 120; i++) a.step();
    const b = mk();
    b.restore(a.snapshot());
    expect(b.hash()).toBe(a.hash());
    for (let i = 0; i < 200; i++) {
      a.step();
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
  });
});

describe('fog and day', () => {
  it('reveals ground around the squad, remembers it and hides what is far away', () => {
    const map = field(60, 20);
    const s = new Sim(map, 1, [0, 1]);
    s.place(0, 3, 10);
    s.place(1, 50, 10);
    s.step();
    const idx = (x: number, y: number): number => y * 60 + x;
    expect(s.visible[idx(3, 10)]).toBe(1);
    expect(s.visible[idx(8, 10)]).toBe(1);
    expect(s.visible[idx(50, 10)]).toBe(0);
    s.step([{ type: 'move', ids: [0], x: 30.5, y: 10.5 }]);
    for (let i = 0; i < 300; i++) s.step();
    expect(s.visible[idx(3, 10)]).toBe(0); // left behind
    expect(s.explored[idx(3, 10)]).toBe(1); // but remembered
    expect(s.explored[idx(20, 10)]).toBe(1);
    expect(s.explored[idx(55, 10)]).toBe(0);
  });
  it('sees less at night', () => {
    const count = (offset: number): number => {
      const s = new Sim(field(40, 40), 1, [0], { dayOffset: offset });
      s.place(0, 20, 20);
      s.step();
      return s.visible.reduce((a, b) => a + b, 0);
    };
    expect(count(0)).toBeGreaterThan(count(Math.floor(DAY_TICKS * 0.7)));
  });
  it('daylight goes from full day to night and back', () => {
    expect(dayLight(0)).toBe(255);
    expect(dayLight(Math.floor(DAY_TICKS * 0.7))).toBe(75);
    expect(dayLight(Math.floor(DAY_TICKS * 0.55))).toBeLessThan(255);
    expect(dayLight(Math.floor(DAY_TICKS * 0.55))).toBeGreaterThan(75);
    expect(dayLight(DAY_TICKS)).toBe(255);
  });
});
