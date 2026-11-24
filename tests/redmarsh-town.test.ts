import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDoc, validate, type MapDoc } from '../src/mapdoc';

const MAP_PATH = resolve(__dirname, '..', 'src', 'missions', 'redmarsh-outpost.map.json');

describe('Redmarsh Outpost Town Build & Reachability', () => {
  const raw = JSON.parse(readFileSync(MAP_PATH, 'utf8')) as MapDoc;

  it('validates Redmarsh MapDoc with >=25 props, >=9 buildings, >=12 units, and town metadata', () => {
    expect(validate(raw)).toEqual([]);
    const houses = raw.objects.filter((o) => o.kind === 1);
    const props = raw.objects.filter((o) => o.kind === 0);
    expect(houses.length).toBeGreaterThanOrEqual(9);
    expect(props.length).toBeGreaterThanOrEqual(25);
    expect(raw.units.length).toBeGreaterThanOrEqual(12);
    expect(raw.units.length).toBeLessThanOrEqual(300);

    const reg = raw.regions[0];
    expect(reg.music).toBe('music_town_redmarsh');
    expect(reg.ambience).toBe('amb_town_redmarsh');
    expect(reg.light).toBe('noon');
    expect(reg.weather).toBe('clear');
  });

  it('ensures no overlapping building footprints, no units inside obstacles, and every building door reachable from N-Gate', () => {
    const { map } = loadDoc(raw);
    const houses = raw.objects.filter((o) => o.kind === 1);

    const houseTiles = new Set<string>();
    for (const h of houses) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const k = `${h.x + dx},${h.y + dy}`;
          expect(houseTiles.has(k), `Overlapping house tile ${k}`).toBe(false);
          houseTiles.add(k);
        }
      }
    }

    for (const u of raw.units) {
      expect(map.blocked[u.y * map.w + u.x], `Unit stuck at (${u.x},${u.y})`).toBe(0);
    }

    const startX = 28;
    const startY = 4;
    expect(map.blocked[startY * map.w + startX]).toBe(0);

    const visited = new Uint8Array(map.w * map.h);
    const queue: number[] = [startY * map.w + startX];
    visited[startY * map.w + startX] = 1;
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const cx = cur % map.w;
      const cy = Math.floor(cur / map.w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= map.w || ny < 0 || ny >= map.h) continue;
        const ni = ny * map.w + nx;
        if (visited[ni] || map.blocked[ni]) continue;
        visited[ni] = 1;
        queue.push(ni);
      }
    }

    for (const h of houses) {
      const doorIdx = (h.y + 2) * map.w + h.x;
      expect(visited[doorIdx], `Building at (${h.x},${h.y}) door unreachable`).toBe(1);
    }
  });
});
