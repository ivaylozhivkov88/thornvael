import { describe, expect, it } from 'vitest';
import { bakeBlocked, ObjectKind } from '../src/map';
import { floodFillReachable } from '../src/map-generator';
import { rleDecode, validate } from '../src/mapdoc';
import { generateSkirmishMap } from '../src/skirmish-generator';

describe('random skirmish generator', () => {
  it('is deterministic and valid for every size, player count and biome', () => {
    for (const biome of ['forest', 'marsh', 'desert', 'highlands'] as const) {
      for (const players of [2, 3, 4] as const) {
        const size = players === 4 ? 80 : 64;
        const a = generateSkirmishMap({ seed: 5, biome, players, size });
        expect(a).toEqual(generateSkirmishMap({ seed: 5, biome, players, size }));
        expect(validate(a)).toEqual([]);
      }
    }
    expect(generateSkirmishMap({ seed: 1 })).not.toEqual(generateSkirmishMap({ seed: 2 }));
  });

  it('keeps every rival unit reachable from your hero', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const players = ([2, 3, 4] as const)[seed % 3];
      const d = generateSkirmishMap({ seed, players, biome: 'highlands' });
      const blocked = bakeBlocked(d.w, d.h, rleDecode(d.terrain, d.w * d.h), d.objects);
      const hero = d.units.find((u) => u.vip)!;
      const reach = floodFillReachable(d.w, d.h, blocked, hero.x, hero.y);
      for (const u of d.units.filter((x) => x.team === 1)) expect(reach[u.y * d.w + u.x], `seed ${seed} ${u.x},${u.y}`).toBe(1);
      expect(d.objects.filter((o) => o.kind === ObjectKind.House && o.owner === 1)).toHaveLength(players - 1);
    }
  });
});
