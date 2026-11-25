import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { zoneAnnouncer } from '../src/zonebanner';

const world = JSON.parse(readFileSync(new URL('../src/worlds/act1-world.map.json', import.meta.url), 'utf8'));

describe('zone banner', () => {
  const zones = [
    { id: 'a', name: 'A', x: 0, y: 0, w: 10, h: 10 },
    { id: 'b', name: 'B', x: 20, y: 0, w: 10, h: 10 },
  ];

  it('announces each new zone once, with lore only on the first visit', () => {
    const at = zoneAnnouncer(zones, { 'zone.a': 'first' });
    expect(at(1, 1)).toEqual({ name: 'A', lore: 'first' });
    expect(at(2, 2)).toBeNull();
    expect(at(15, 1)).toBeNull(); // road between zones
    expect(at(3, 3)).toBeNull(); // back into the same zone
    expect(at(21, 1)).toEqual({ name: 'B', lore: null });
    expect(at(1, 1)).toEqual({ name: 'A', lore: null });
  });

  it('every zone of the Act I world has lore', () => {
    for (const z of world.zones) expect(world.text[`zone.${z.id}`], z.id).toBeTruthy();
  });
});
