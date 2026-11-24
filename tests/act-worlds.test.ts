import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDoc, MAX_SIDE, migrate, rleDecode, validate, type MapDoc } from '../src/mapdoc';
import { chunkSizeForMap, neededChunkCoords } from '../src/render/chunk-cache';

const loadWorld = (file: string): MapDoc =>
  JSON.parse(readFileSync(resolve(__dirname, '..', 'src', 'worlds', file), 'utf8')) as MapDoc;

describe('stitched act worlds (Act 1 < Act 2 < Act 3 < Act 4)', () => {
  const w1 = loadWorld('act1-world.map.json');
  const w2 = loadWorld('act2-world.map.json');
  const w3 = loadWorld('act3-world.map.json');
  const w4 = loadWorld('act4-world.map.json');

  it('enforces strict size progression Act 1 < Act 2 < Act 3 < Act 4', () => {
    expect(w1.w).toBeLessThan(w2.w);
    expect(w2.w).toBeLessThan(w3.w);
    expect(w3.w).toBeLessThan(w4.w);

    expect(w1.h).toBeLessThan(w2.h);
    expect(w2.h).toBeLessThan(w3.h);
    expect(w3.h).toBeLessThan(w4.h);

    expect(w1.w * w1.h).toBeLessThan(w2.w * w2.h);
    expect(w2.w * w2.h).toBeLessThan(w3.w * w3.h);
    expect(w3.w * w3.h).toBeLessThan(w4.w * w4.h);
  });

  it.each([
    ['act2-world.map.json', w2],
    ['act3-world.map.json', w3],
    ['act4-world.map.json', w4],
  ])('%s validates, loads, keeps active<=300, and all waypoints reachable from hero', (_name, raw) => {
    const doc = migrate(raw);
    expect(validate(doc)).toEqual([]);
    expect(doc.w).toBeLessThanOrEqual(MAX_SIDE);
    expect(doc.h).toBeLessThanOrEqual(MAX_SIDE);
    expect(doc.units.filter((u) => !u.dormant).length).toBeLessThanOrEqual(300);
    expect(() => loadDoc(raw)).not.toThrow();

    // Chunk streaming check
    const chunk = chunkSizeForMap(doc.w, doc.h);
    expect(chunk).toBe(32);
    const ring = neededChunkCoords(doc.w, doc.h, { x0: 0, y0: 0, x1: 30, y1: 20 }, chunk, 24);
    expect(ring.length).toBeLessThanOrEqual(24);
    expect(ring.length).toBeGreaterThan(0);

    // BFS reachability from hero to every waypoint
    const { w, h } = doc;
    const t = rleDecode(doc.terrain, w * h);
    const blocked = new Uint8Array(w * h);
    for (let i = 0; i < t.length; i++) if (t[i] === 2 || t[i] === 3) blocked[i] = 1;
    for (const o of doc.objects) {
      const n = o.kind === 1 ? 2 : 1;
      for (let dy = 0; dy < n; dy++) {
        for (let dx = 0; dx < n; dx++) blocked[(o.y + dy) * w + o.x + dx] = 1;
      }
    }
    const hero = doc.units[0]!;
    const seen = new Uint8Array(w * h);
    const q = [hero.y * w + hero.x];
    seen[q[0]!] = 1;
    for (let i = 0; i < q.length; i++) {
      const c = q[i]!;
      const x = c % w;
      const y = (c / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (seen[k] || blocked[k]) continue;
        seen[k] = 1;
        q.push(k);
      }
    }
    const miss = (doc.waypoints ?? []).filter((p) => !seen[p.y * w + p.x]).map((p) => p.id);
    expect(miss).toEqual([]);
  });
});
