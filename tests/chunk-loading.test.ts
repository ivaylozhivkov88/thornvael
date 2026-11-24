import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { chunkSizeForMap, neededChunkCoords } from '../src/render/chunk-cache';
import { runWithPool, withTimeout } from '../src/sprites/load-pool';
import { EXTENDED_FAMILY_ART } from '../src/sprites/units';

describe('chunk ring & bounded atlas loading', () => {
  it('computes +1 chunk ring around camera and caps at maxChunks for act1-world (844x650)', () => {
    expect(chunkSizeForMap(64, 64)).toBe(16);
    expect(chunkSizeForMap(192, 192)).toBe(32);
    expect(chunkSizeForMap(844, 650)).toBe(32);

    // Camera near origin: only chunks (0..1, 0..1) should be requested, not 27x21=567 chunks.
    const nearOrigin = neededChunkCoords(844, 650, { x0: 2, y0: 2, x1: 26, y1: 18 }, 32, 24);
    expect(nearOrigin.map((c) => c.key)).toEqual(['0,0', '1,0', '0,1', '1,1']);

    // Camera in mid-world: ring around chunk (12, 9) sorted closest-first.
    const mid = neededChunkCoords(844, 650, { x0: 384, y0: 288, x1: 416, y1: 312 }, 32, 24);
    expect(mid[0]?.key).toBe('12,9');
    expect(mid.every((c) => c.cx >= 11 && c.cx <= 14 && c.cy >= 8 && c.cy <= 10)).toBe(true);
    expect(mid.length).toBeLessThanOrEqual(24);

    // Huge zoomed-out viewport still respects maxChunks = 24 cap.
    const huge = neededChunkCoords(844, 650, { x0: 0, y0: 0, x1: 844, y1: 650 }, 32, 24);
    expect(huge.length).toBe(24);
  });

  it('bounds concurrent atlas tasks to pool limit (3) and isolates failures', async () => {
    let inFlight = 0;
    let peakInFlight = 0;

    const tasks = Array.from({ length: 18 }, (_, i) => async () => {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 4));
      inFlight--;
      if (i === 5) throw new Error('simulated decode error');
      return i;
    });

    const settled = await runWithPool(tasks, 3);
    expect(peakInFlight).toBeLessThanOrEqual(3);
    expect(peakInFlight).toBeGreaterThan(1);
    expect(settled).toHaveLength(18);
    expect(settled[5]?.status).toBe('rejected');
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(17);
  });

  it('rejects stalled loads with withTimeout', async () => {
    vi.useFakeTimers();
    const stalled = new Promise<string>(() => {});
    const p = withTimeout(stalled, 15_000, 'atlas.png');
    const assertion = expect(p).rejects.toThrow('Timeout after 15000ms: atlas.png');
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    vi.useRealTimers();
  });

  it('defers extended monster atlases for dormant units in act1-world', () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '..', 'src', 'worlds', 'act1-world.map.json'), 'utf8'),
    ) as { units: Array<{ dormant?: boolean; family?: string }> };

    const allExt = new Set(
      raw.units.map((u) => u.family).filter((f): f is string => Boolean(f && EXTENDED_FAMILY_ART[f])),
    );
    const activeExt = new Set(
      raw.units
        .filter((u) => !u.dormant)
        .map((u) => u.family)
        .filter((f): f is string => Boolean(f && EXTENDED_FAMILY_ART[f])),
    );

    expect(allExt.size).toBeGreaterThan(0);
    expect(activeExt.size).toBe(0);
  });
});
