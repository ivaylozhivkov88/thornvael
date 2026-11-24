import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDoc, migrate, validate, type MapDoc } from '../src/mapdoc';
import { createMission } from '../src/mission';
import { chunkSizeForMap, neededChunkCoords } from '../src/render/chunk-cache';
import { createHero } from '../src/sim/hero';

const ACT4_256_FILES = [
  'm36-heartland-march-256.map.json',
  'm37-shattered-beacons-256.map.json',
  'm38-besieged-wall-256.map.json',
  'm39-flight-of-malrik-256.map.json',
  'm40-twofold-assault-256.map.json',
  'm41-gauntlet-of-iron-256.map.json',
  'm42-outer-rampart-256.map.json',
  'm43-three-roads-siege-256.map.json',
  'm44-threshold-choice-256.map.json',
  'm45-crown-of-order-256.map.json',
  'm46-ember-reckoning-256.map.json',
] as const;

describe('Act IV 256x256 generated maps', () => {
  it.each(ACT4_256_FILES)('%s validates, loads cleanly, and keeps all units passable', (file) => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '..', 'src', 'missions', file), 'utf8'),
    ) as MapDoc;

    expect(raw.w).toBe(256);
    expect(raw.h).toBe(256);

    const doc = migrate(raw);
    expect(validate(doc)).toEqual([]);

    const loaded = loadDoc(raw);
    expect(loaded.map.w).toBe(256);
    expect(loaded.map.h).toBe(256);

    for (const u of doc.units) {
      expect(loaded.map.blocked[u.y * loaded.map.w + u.x], `Unit blocked at (${u.x},${u.y})`).toBe(0);
    }

    const acts = (doc.triggers ?? []).flatMap((t) => t.acts ?? []);
    expect(acts.some((a) => a.k === 'win')).toBe(true);
    expect(acts.some((a) => a.k === 'lose')).toBe(true);

    // Chunk streaming check: 256x256 streams in 32x32 chunks, bounded to <= 24 around camera
    const chunk = chunkSizeForMap(256, 256);
    expect(chunk).toBe(32);
    const ring = neededChunkCoords(256, 256, { x0: 0, y0: 0, x1: 24, y1: 16 }, chunk, 24);
    expect(ring.length).toBeLessThanOrEqual(24);
    expect(ring.length).toBeGreaterThan(0);

    const game = createMission(loaded, 1);
    createHero(game.sim, 0, 0, false, 1);
    for (let t = 0; t < 5; t++) {
      game.sim.step(game.ai.commands(game.sim));
    }
    expect(game.sim.tick).toBe(5);
  });
});
