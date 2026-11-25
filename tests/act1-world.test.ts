import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { migrate, validate, loadDoc, rleDecode } from '../src/mapdoc';
import { createMission } from '../src/mission-runtime';
import { zoneHunt } from '../src/missionui';

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

it('stitched world does not win at start and wakes a zone when the hero enters it', () => {
  const g = createMission(loadDoc(raw), 1);
  const s = g.sim;
  const asleep = () => s.hidden.slice(0, s.count).filter((h) => h).length;
  for (let i = 0; i < 20; i++) s.step([]);
  expect(g.sim.script?.st.status).toBe(0);
  const before = asleep();
  s.place(0, 140, 70); // inside m01-outskirts
  for (let i = 0; i < 20; i++) s.step([]);
  expect(asleep()).toBeLessThan(before);
});

describe('act1 town is safe and the task is clear', () => {
  const doc = migrate(raw);
  const town = doc.zones![0];
  const inTown = (x: number, y: number) => x < town.x + town.w && y < town.y + town.h;

  it('has no active enemies inside the town', () => {
    expect(doc.units.filter((u) => u.team !== 0 && !u.dormant && inTown(u.x, u.y))).toEqual([]);
  });

  it('leaves an idle hero alone', () => {
    const g = createMission(loadDoc(raw), 1);
    const hp = g.sim.cb.hp[0];
    const x = g.sim.x[0], y = g.sim.y[0];
    for (let i = 0; i < 3000; i++) g.sim.step(g.ai.commands(g.sim));
    expect(g.sim.cb.hp[0]).toBe(hp);
    expect([g.sim.x[0], g.sim.y[0]]).toEqual([x, y]);
  });

  it('lets the hero walk out of town unharmed', () => {
    const g = createMission(loadDoc(raw), 1);
    const s = g.sim;
    const hp = s.cb.hp[0];
    s.step([{ type: 'move', ids: [0], x: 189, y: 81 }]);
    for (let i = 0; i < 3000 && inTown(s.x[0] / 256, s.y[0] / 256); i++) s.step(g.ai.commands(s));
    expect(inTown(s.x[0] / 256, s.y[0] / 256)).toBe(false);
    expect(s.cb.hp[0]).toBe(hp);
  });

  it('names the first hunting ground as the task', () => {
    const task = zoneHunt(loadDoc(raw).doc, () => true)!;
    expect(task.text).toContain('hunt the foes in');
    expect(inTown(task.targetX!, task.targetY!)).toBe(false);
  });
});
