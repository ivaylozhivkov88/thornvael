import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDoc, migrate, validate, type MapDoc } from '../src/mapdoc';
import { createMission } from '../src/mission';
import { chunkSizeForMap, neededChunkCoords } from '../src/render/chunk-cache';
import { createHero } from '../src/sim/hero';

const ACT3_192_FILES = [
  'm24-pledge-at-oakhaven-192.map.json',
  'm25-cinder-wards-192.map.json',
  'm26-sundered-ranks-192.map.json',
  'm27-field-infirmary-192.map.json',
  'm28-sunken-citadel-192.map.json',
  'm29-hourglass-rescue-192.map.json',
  'm30-starved-bastion-192.map.json',
  'm31-riverlock-crossing-192.map.json',
  'm32-elder-juggernaut-192.map.json',
  'm33-high-stakes-gambit-192.map.json',
  'm34-clashing-banners-192.map.json',
  'm35-burning-harbor-192.map.json',
] as const;

describe('Act III 192x192 generated maps', () => {
  it.each(ACT3_192_FILES)('%s validates, loads cleanly, and keeps all units passable', (file) => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '..', 'src', 'missions', file), 'utf8'),
    ) as MapDoc;

    expect(raw.w).toBe(192);
    expect(raw.h).toBe(192);

    const doc = migrate(raw);
    expect(validate(doc)).toEqual([]);

    const loaded = loadDoc(raw);
    expect(loaded.map.w).toBe(192);
    expect(loaded.map.h).toBe(192);

    for (const u of doc.units) {
      expect(loaded.map.blocked[u.y * loaded.map.w + u.x], `Unit blocked at (${u.x},${u.y})`).toBe(0);
    }

    const acts = (doc.triggers ?? []).flatMap((t) => t.acts ?? []);
    expect(acts.some((a) => a.k === 'win')).toBe(true);
    expect(acts.some((a) => a.k === 'lose')).toBe(true);

    // Chunk streaming check: 192x192 streams in 32x32 chunks, bounded to <= 24 around camera
    const chunk = chunkSizeForMap(192, 192);
    expect(chunk).toBe(32);
    const ring = neededChunkCoords(192, 192, { x0: 0, y0: 0, x1: 24, y1: 16 }, chunk, 24);
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
