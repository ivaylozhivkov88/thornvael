import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDoc, migrate, validate, type MapDoc } from '../src/mapdoc';
import { createMission } from '../src/mission';
import { chunkSizeForMap, neededChunkCoords } from '../src/render/chunk-cache';
import { createHero } from '../src/sim/hero';

const ACT2_128_FILES = [
  'm12-redmarsh-border-128.map.json',
  'm13-twin-passes-128.map.json',
  'm14-scattered-scouts-128.map.json',
  'm15-outpost-palisade-128.map.json',
  'm16-wardstone-rupture-128.map.json',
  'm17-mire-convoy-128.map.json',
  'm18-granary-raid-128.map.json',
  'm19-hexer-capture-128.map.json',
  'm20-deep-quarry-128.map.json',
  'm21-lean-garrison-128.map.json',
  'm22-fleeing-column-128.map.json',
  'm23-fork-of-spears-128.map.json',
] as const;

describe('Act II 128x128 generated maps', () => {
  it.each(ACT2_128_FILES)('%s validates, loads cleanly, and keeps all units passable', (file) => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '..', 'src', 'missions', file), 'utf8'),
    ) as MapDoc;

    expect(raw.w).toBe(128);
    expect(raw.h).toBe(128);

    const doc = migrate(raw);
    expect(validate(doc)).toEqual([]);

    const loaded = loadDoc(raw);
    expect(loaded.map.w).toBe(128);
    expect(loaded.map.h).toBe(128);

    for (const u of doc.units) {
      expect(loaded.map.blocked[u.y * loaded.map.w + u.x], `Unit blocked at (${u.x},${u.y})`).toBe(0);
    }

    const acts = (doc.triggers ?? []).flatMap((t) => t.acts ?? []);
    expect(acts.some((a) => a.k === 'win')).toBe(true);
    expect(acts.some((a) => a.k === 'lose')).toBe(true);

    // Chunk streaming check: 128x128 streams in 16x16 chunks, bounded to <= 24 around camera
    const chunk = chunkSizeForMap(128, 128);
    expect(chunk).toBe(16);
    const ring = neededChunkCoords(128, 128, { x0: 0, y0: 0, x1: 24, y1: 16 }, chunk, 24);
    expect(ring.length).toBeLessThanOrEqual(24);
    expect(ring.length).toBeGreaterThan(0);

    // Smoke-step the sim for 5 ticks
    const game = createMission(loaded, 1);
    createHero(game.sim, 0, 0, false, 1);
    for (let t = 0; t < 5; t++) {
      game.sim.step(game.ai.commands(game.sim));
    }
    expect(game.sim.tick).toBe(5);
  });
});
