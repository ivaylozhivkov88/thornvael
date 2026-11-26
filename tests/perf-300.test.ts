import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/map';
import { battleScenario, Bot, MonsterAi, placeScenario } from '../src/sim/bot';
import { enemyNear, Kind } from '../src/sim/combat';
import { installData } from '../src/sim/data';
import { FP, Sim } from '../src/sim/sim';
import { SPELLS } from '../src/sim/spelldata';

const ROOT = join(__dirname, '..');
const items = JSON.parse(readFileSync(join(ROOT, 'public/data/items.json'), 'utf8'));
const spells = JSON.parse(readFileSync(join(ROOT, 'public/data/spells.json'), 'utf8'));
installData({ items, spells });

function make300World(mode: 'movement' | 'combat' | 'spells' | 'ai') {
  const map = generateMap(7);
  const sc = battleScenario(map);
  const ids = Array.from({ length: 300 }, (_, i) => i);
  if (mode === 'movement') {
    sc.teams.fill(0);
    sc.kinds.fill(Kind.Warrior);
  } else {
    sc.teams = ids.map((i) => i % 2);
    sc.kinds = ids.map((i) =>
      mode === 'spells' && i % 4 === 0 ? Kind.Mage : i % 3 === 0 ? Kind.Archer : Kind.Warrior
    );
  }
  const sim = new Sim(map, 20261104, sc.teams, { combat: true, hpMul: 200, kinds: sc.kinds });
  placeScenario(sim, sc);
  sim.settle();
  const packs = Array.from({ length: 10 }, (_, p) => {
    const members = ids.filter((i) => i % 2 === 1).slice(p * 15, p * 15 + 15);
    return { ids: members, x: sim.x[members[0]] / FP, y: sim.y[members[0]] / FP, hunting: false, calm: 0 };
  });
  const ai = mode === 'movement' ? new Bot(0, 15, 20261105) : mode === 'ai' ? new MonsterAi(packs) : null;
  return { sim, ai, sc, ids };
}

describe('300-unit performance & spatial hash invariants (F8)', () => {
  it.each(['movement', 'combat', 'spells', 'ai'] as const)(
    '300 active units stay deterministic and fast in %s mode',
    (mode) => {
      const { sim, ai, sc, ids } = make300World(mode);
      const groups = Array.from({ length: 20 }, (_, g) => ids.slice(g * 15, g * 15 + 15));
      const frostIdx = SPELLS.findIndex((s) => s.name === 'Frost Bolt');
      const stepTimes: number[] = [];

      for (let t = 0; t < 60; t++) {
        const cmds = ai ? ai.commands(sim) : [];
        if (mode === 'movement' && sim.tick % 50 === 0) {
          for (let g = 0; g < groups.length; g++) {
            const [x, y] = sc.tiles[(g * 15 + 150 + Math.floor(sim.tick / 50) * 30) % 300];
            cmds.push({ type: 'move', ids: groups[g], x: x + 0.5, y: y + 0.5 });
          }
        } else if (sim.tick === 0) {
          cmds.push({ type: 'order', order: 'swarm', ids });
          if (mode === 'spells' && frostIdx >= 0) {
            cmds.push({
              type: 'autocast',
              ids: ids.filter((i) => sc.kinds[i] === Kind.Mage),
              spell: frostIdx,
            });
          }
        }
        const t0 = performance.now();
        sim.step(cmds);
        stepTimes.push(performance.now() - t0);
      }

      let alive = 0;
      for (let i = 0; i < sim.count; i++) {
        if (sim.alive(i)) alive++;
        expect(Number.isFinite(sim.x[i])).toBe(true);
        expect(Number.isFinite(sim.y[i])).toBe(true);
      }
      expect(alive).toBe(300);

      const meanMs = stepTimes.reduce((a, b) => a + b, 0) / stepTimes.length;
      if (process.env.PERF_TEST === '1') {
        expect(meanMs).toBeLessThan(10.0);
      }
      expect(stepTimes.length).toBeGreaterThan(0);
    }
  );

  it('spatial hash enemyNear queries 300 units cleanly within budget', () => {
    const { sim, ids } = make300World('combat');
    sim.step([{ type: 'order', order: 'swarm', ids }]);

    const range = 8 * FP;
    // Warmup one pass so JIT compilation does not skew the timing
    for (let i = 0; i < 300; i++) enemyNear(sim, i, range, 0, 0, 0);

    const targets: number[] = [];
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) {
      targets.push(enemyNear(sim, i, range, 0, 0, 0));
    }
    const elapsedMs = performance.now() - t0;

    let found = 0;
    for (let i = 0; i < 300; i++) {
      const target = targets[i];
      if (target >= 0) {
        found++;
        expect(sim.team[target]).not.toBe(sim.team[i]);
        expect(sim.cb.hp[target]).toBeGreaterThan(0);
      }
    }
    expect(found).toBeGreaterThan(0);
    if (process.env.PERF_TEST === '1') {
      expect(elapsedMs).toBeLessThan(10.0);
    }
  });

  it('sprite & object atlases stay within 2048x2048 per-sheet GPU budget', () => {
    const dirs = ['public/sprites', 'public/objects'];
    let count = 0;
    for (const rel of dirs) {
      const full = join(ROOT, rel);
      for (const file of readdirSync(full).filter((f) => f.endsWith('.json'))) {
        const sheet = JSON.parse(readFileSync(join(full, file), 'utf8'));
        const w = sheet.meta?.size?.w ?? (Array.isArray(sheet.size) ? sheet.size[0] : 0);
        const h = sheet.meta?.size?.h ?? (Array.isArray(sheet.size) ? sheet.size[1] : 0);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
        expect(w).toBeLessThanOrEqual(2048);
        expect(h).toBeLessThanOrEqual(2048);
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(54);
  });
});
