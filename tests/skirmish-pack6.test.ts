import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDoc, validate } from '../src/mapdoc';

const SKIRMISH_DIR = resolve(__dirname, '..', 'public', 'maps', 'skirmish');

function isReachable(blocked: Uint8Array, w: number, h: number, sx: number, sy: number, tx: number, ty: number): boolean {
  const startIdx = sy * w + sx;
  const targetIdx = ty * w + tx;
  if (blocked[startIdx] || blocked[targetIdx]) return false;
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  queue[tail++] = startIdx;
  visited[startIdx] = 1;

  while (head < tail) {
    const cur = queue[head++];
    if (cur === targetIdx) return true;
    const x = cur % w;
    const y = (cur - x) / w;
    const neighbors = [
      x > 0 ? cur - 1 : -1,
      x + 1 < w ? cur + 1 : -1,
      y > 0 ? cur - w : -1,
      y + 1 < h ? cur + w : -1,
    ];
    for (const next of neighbors) {
      if (next >= 0 && !visited[next] && !blocked[next]) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
  }
  return false;
}

describe('6 Original Skirmish Maps (public/maps/skirmish)', () => {
  const files = readdirSync(SKIRMISH_DIR).filter((f) => f.endsWith('.map.json')).sort();

  it('contains exactly 6 skirmish map files', () => {
    expect(files).toHaveLength(6);
  });

  for (const file of files) {
    it(`${file} passes validateDoc, loadDoc, has designNote/resources/chokes/camps, and connects all starts`, () => {
      const raw = JSON.parse(readFileSync(resolve(SKIRMISH_DIR, file), 'utf8'));
      const errs = validate(raw);
      expect(errs, `${file} validate errors: ${errs.join('; ')}`).toEqual([]);

      const loaded = loadDoc(raw);
      const { map } = loaded;
      expect(raw.text?.designNote?.trim().length ?? 0).toBeGreaterThan(40);
      expect(raw.shrines?.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(raw.adventureObjects?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(raw.units.some((u: any) => u.team === 3)).toBe(true); // Neutral camp

      const baseRegions = (raw.regions ?? []).filter((r: any) => /^Base \d+$/.test(r.name));
      expect(baseRegions.length).toBeGreaterThanOrEqual(2);
      expect(baseRegions.length).toBeLessThanOrEqual(4);

      const chokes = (raw.regions ?? []).filter((r: any) => /^Choke \d+$/.test(r.name));
      expect(chokes.length).toBeGreaterThanOrEqual(2);

      const starts = baseRegions.map((r: any) => ({
        name: r.name,
        x: Math.floor((r.x1 + r.x2) / 2),
        y: Math.floor((r.y1 + r.y2) / 2),
      }));

      for (let i = 0; i < starts.length; i++) {
        for (let j = i + 1; j < starts.length; j++) {
          const ok = isReachable(map.blocked, map.w, map.h, starts[i].x, starts[i].y, starts[j].x, starts[j].y);
          expect(ok, `${file}: ${starts[i].name} -> ${starts[j].name} not reachable`).toBe(true);
        }
      }
    });
  }
});
