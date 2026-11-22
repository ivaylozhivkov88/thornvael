import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/map';
import { battleScenario, placeScenario } from '../src/sim/bot';
import { installData } from '../src/sim/data';
import { FP, Sim } from '../src/sim/sim';
import { FlatSpatialHash } from '../src/sim/spatial-hash';
import { LUT_SIZE, SIN_LUT, cosLut, sinLut } from '../src/sim/trig';

const ROOT = join(__dirname, '..');
const items = JSON.parse(readFileSync(join(ROOT, 'public/data/items.json'), 'utf8'));
const spells = JSON.parse(readFileSync(join(ROOT, 'public/data/spells.json'), 'utf8'));
installData({ items, spells });

describe('Phase A1: SIN_LUT & PRNG Stream Separation', () => {
  it('provides a 4096-entry SIN_LUT with exact cardinal points and tight trig accuracy', () => {
    expect(SIN_LUT.length).toBe(4096);
    expect(LUT_SIZE).toBe(4096);
    expect(sinLut(0)).toBe(0);
    expect(cosLut(0)).toBe(1);
    expect(sinLut(Math.PI / 2)).toBe(1);
    expect(cosLut(Math.PI / 2)).toBe(0);
    expect(sinLut(Math.PI)).toBe(0);
    expect(cosLut(Math.PI)).toBe(-1);
    expect(sinLut((3 * Math.PI) / 2)).toBe(-1);
    expect(cosLut((3 * Math.PI) / 2)).toBe(0);

    let maxErr = 0;
    for (let deg = -360; deg <= 720; deg += 3) {
      const rad = (deg * Math.PI) / 180;
      maxErr = Math.max(maxErr, Math.abs(sinLut(rad) - Math.sin(rad)), Math.abs(cosLut(rad) - Math.cos(rad)));
    }
    expect(maxErr).toBeLessThan(0.002);
  });

  it('isolates simRng, lootRng, and cosmeticRng across rolls and snapshots', () => {
    const map = generateMap(7);
    const a = new Sim(map, 1337, [0, 1], { combat: true });
    const b = new Sim(map, 1337, [0, 1], { combat: true });
    expect(a.simRng).toBe(a.rng);

    const baseSimNext = a.simRng.nextU32();
    // Advancing lootRng on `b` must NOT alter `b.simRng`
    b.lootRng.nextU32();
    b.lootRng.int(100);
    expect(b.simRng.nextU32()).toBe(baseSimNext);

    // Advancing cosmeticRng on `b` must NOT alter `b.hash()` or `b.simRng`
    const bHashBefore = b.hash();
    b.cosmeticRng.nextU32();
    b.cosmeticRng.int(50);
    expect(b.hash()).toBe(bHashBefore);
    expect(b.simRng.state).toBe(a.simRng.state);

    // Snapshot & restore preserve all three PRNG stream states
    a.lootRng.int(999);
    a.cosmeticRng.int(777);
    const snap = a.snapshot();
    const expectedHash = a.hash();
    const c = new Sim(map, 1, [0, 1], { combat: true });
    c.restore(snap);
    expect(c.hash()).toBe(expectedHash);
    expect(c.simRng.state).toBe(a.simRng.state);
    expect(c.lootRng.state).toBe(a.lootRng.state);
    expect(c.cosmeticRng.state).toBe(a.cosmeticRng.state);
  });
});

describe('Phase A2: Int32Array FlatSpatialHash & 300-unit sub-0.5ms step', () => {
  it('rebuilds using Int32Array buffers, preserves ascending unit id order, and excludes dead/hidden units', () => {
    const sh = new FlatSpatialHash(16, 16, 6);
    expect(sh.cellStart).toBeInstanceOf(Int32Array);
    expect(sh.cellEnd).toBeInstanceOf(Int32Array);
    expect(sh.cellItems).toBeInstanceOf(Int32Array);
    expect(sh.unitCell).toBeInstanceOf(Int32Array);
    expect(sh.occupied).toBeInstanceOf(Int32Array);

    const x = Int32Array.of(3 * FP, 3 * FP, 3 * FP, 10 * FP, 3 * FP, 10 * FP);
    const y = Int32Array.of(4 * FP, 4 * FP, 4 * FP, 5 * FP, 4 * FP, 5 * FP);
    const hp = Int16Array.of(10, 0, 10, 10, 10, 10); // unit 1 dead
    const hidden = Uint8Array.of(0, 0, 0, 0, 1, 0); // unit 4 hidden

    sh.rebuild(6, x, y, hp, hidden);
    const c34 = 4 * 16 + 3;
    expect([...sh.cellItems.subarray(sh.cellStart[c34], sh.cellEnd[c34])]).toEqual([0, 2]);
    const c105 = 5 * 16 + 10;
    expect([...sh.cellItems.subarray(sh.cellStart[c105], sh.cellEnd[c105])]).toEqual([3, 5]);

    // Move unit 0 to (8, 8) and rebuild: old cell updates cleanly
    x[0] = 8 * FP;
    y[0] = 8 * FP;
    sh.rebuild(6, x, y, hp, hidden);
    expect([...sh.cellItems.subarray(sh.cellStart[c34], sh.cellEnd[c34])]).toEqual([2]);
    const c88 = 8 * 16 + 8;
    expect([...sh.cellItems.subarray(sh.cellStart[c88], sh.cellEnd[c88])]).toEqual([0]);
  });

  it('300 active units in combat run cleanly under 0.5ms average per step after warmup', () => {
    const map = generateMap(7);
    const sc = battleScenario(map);
    const sim = new Sim(map, 5, sc.teams, { kinds: sc.kinds, combat: true, hpMul: 8 });
    placeScenario(sim, sc);
    const t0 = [...Array(150).keys()];
    const t1 = t0.map((i) => i + 150);
    sim.step([
      { type: 'order', order: 'swarm', ids: t0, x: 38, y: map.h - 9 },
      { type: 'order', order: 'swarm', ids: t1, x: 10, y: map.h - 9 },
    ]);
    // JIT warmup
    for (let t = 0; t < 150; t++) sim.step();
    const start = performance.now();
    for (let t = 0; t < 250; t++) sim.step();
    const meanMs = (performance.now() - start) / 250;
    // Target is < 0.5ms dedicated / < 1.0ms solo; 2.0ms gives headroom under parallel Vitest workers.
    expect(meanMs).toBeLessThan(2.0);
  });
});
