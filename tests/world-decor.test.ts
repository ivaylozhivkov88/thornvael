import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateExpeditionMap } from '../src/map-generator';
import { generateSkirmishMap } from '../src/skirmish-generator';

const OBJECTS_JSON = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'public', 'objects', 'objects.json'), 'utf8'),
) as { frames: Record<string, unknown> };

const ALL_BIOMES = ['forest', 'marsh', 'desert', 'oasis', 'crypt', 'highlands', 'volcanic'] as const;

describe('World Decor & Deterministic Placement (C1.5)', () => {
  it('places deterministic biome decor in expeditions without blocking start, exit, waypoint, or shrine tiles', () => {
    for (const biome of ALL_BIOMES) {
      const docA = generateExpeditionMap({ seed: 777, biome, size: 64 });
      const docB = generateExpeditionMap({ seed: 777, biome, size: 64 });
      expect(docA.objects).toEqual(docB.objects);

      const propFrames = (docA.objects as { frame?: string }[])
        .map((o) => o.frame)
        .filter((f): f is string => Boolean(f));
      expect(propFrames.length).toBeGreaterThan(0);
      for (const f of propFrames) {
        expect(OBJECTS_JSON.frames[f]).toBeDefined();
      }

      const objTiles = new Set(docA.objects.map((o: { x: number; y: number }) => `${o.x},${o.y}`));
      for (const u of docA.units) {
        expect(objTiles.has(`${u.x},${u.y}`)).toBe(false);
      }
      if (docA.shrines) {
        for (const s of docA.shrines) {
          expect(objTiles.has(`${s.x},${s.y}`)).toBe(false);
        }
      }
      for (const r of docA.regions ?? []) {
        if (r.name === 'exit' || r.name === 'waypoint') {
          const cx = Math.floor((r.x1 + r.x2) / 2);
          const cy = Math.floor((r.y1 + r.y2) / 2);
          expect(objTiles.has(`${cx},${cy}`)).toBe(false);
        }
      }
    }
  });

  it('places deterministic biome decor in skirmish maps without blocking unit starts', () => {
    for (const biome of ALL_BIOMES) {
      const sA = generateSkirmishMap({ seed: 999, biome, size: 64, players: 2 });
      const sB = generateSkirmishMap({ seed: 999, biome, size: 64, players: 2 });
      expect(sA.objects).toEqual(sB.objects);

      const objTiles = new Set(sA.objects.map((o: { x: number; y: number }) => `${o.x},${o.y}`));
      for (const u of sA.units) {
        expect(objTiles.has(`${u.x},${u.y}`)).toBe(false);
      }
    }
  });
});
