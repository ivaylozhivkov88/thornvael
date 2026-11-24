import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { migrate, validate, loadDoc, rleDecode } from '../src/mapdoc';

const raw = JSON.parse(readFileSync(new URL('../src/worlds/act1-world.map.json', import.meta.url), 'utf8'));

describe('act1 stitched world', () => {
  it('validates', () => {
    const doc = migrate(raw);
    expect(validate(doc)).toEqual([]);
  });
  it('loads with hero first and small active set', () => {
    const doc = migrate(raw);
    expect(doc.w).toBeLessThanOrEqual(1024);
    expect(doc.h).toBeLessThanOrEqual(1024);
    expect(doc.units.filter((u) => !u.dormant).length).toBeLessThanOrEqual(300);
    expect(() => loadDoc(raw)).not.toThrow();
  });
  it('every waypoint is reachable from the hero', () => {
    const doc = migrate(raw);
    const { w, h } = doc;
    const t = rleDecode(doc.terrain, w * h);
    const blocked = new Uint8Array(w * h);
    for (let i = 0; i < t.length; i++) if (t[i] === 2 || t[i] === 3) blocked[i] = 1;
    for (const o of doc.objects) {
      const n = o.kind === 1 ? 2 : 1;
      for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) blocked[(o.y + dy) * w + o.x + dx] = 1;
    }
    const hero = doc.units[0];
    const seen = new Uint8Array(w * h);
    const q = [hero.y * w + hero.x];
    seen[q[0]] = 1;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % w, y = (c / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
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

describe('act1 world victory gate', () => {
  it('does not win or lose on entry (act1-cleared waits for enter-m11)', async () => {
    const { createMission } = await import('../src/mission');
    const { loadDoc } = await import('../src/mapdoc');
    const { createHero } = await import('../src/sim/hero');
    const game = createMission(loadDoc(raw), 1);
    createHero(game.sim, 0, 0, false, 1);
    for (let t = 0; t < 40; t++) game.sim.step();
    expect(game.sim.script!.st.status).toBe(0);
  });
});
