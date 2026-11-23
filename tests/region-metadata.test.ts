import { describe, expect, it } from 'vitest';
import { regionAtTile, resolveRegionAtmosphere } from '../src/atmosphere';
import { computeAudioCrossfade, resolveRegionAudio } from '../src/region-audio';
import { MAP_FORMAT, MAP_VERSION, validate, type MapDoc, type Region } from '../src/mapdoc';

describe('Region Metadata, Atmosphere & Audio Crossfade (C2)', () => {
  const regions: Region[] = [
    {
      name: 'town-thornwick',
      x1: 12,
      y1: 76,
      x2: 44,
      y2: 112,
      biome: 'forest',
      zone: 'highland',
      music: 'mus-town-thornwick',
      ambience: 'amb_town_thornwick',
      light: 'dusk',
      weather: 'drizzle',
    },
    {
      name: 'sunken-ford',
      x1: 45,
      y1: 60,
      x2: 90,
      y2: 100,
      biome: 'marsh',
      zone: 'ruinstone',
      music: 'mus-act1-march',
      ambience: 'amb_marsh_fog',
      light: 'overcast',
      weather: 'fog',
    },
  ];

  it('validates MapDoc with extended Region metadata (light, weather, biome, zone, music, ambience)', () => {
    const doc: MapDoc = {
      format: MAP_FORMAT,
      version: MAP_VERSION,
      name: 'region-meta-test',
      w: 128,
      h: 128,
      terrain: [0, 128 * 128],
      height: [0, 128 * 128],
      objects: [],
      units: [{ kind: 0, team: 0, x: 20, y: 80 }],
      regions,
      players: ['Vanguard', 'Foes'],
      triggers: [],
      text: {},
    };
    expect(() => validate(doc)).not.toThrow();
  });

  it('resolves hero region and weather/biome atmosphere overrides', () => {
    const rTown = regionAtTile(regions, 20, 80);
    expect(rTown?.name).toBe('town-thornwick');
    expect(resolveRegionAtmosphere(rTown, 'forest').biome).toBe('forest');

    const rFord = regionAtTile(regions, 60, 75);
    expect(rFord?.name).toBe('sunken-ford');
    expect(resolveRegionAtmosphere(rFord, 'forest').biome).toBe('marsh');
    expect(resolveRegionAtmosphere(undefined, 'volcanic').biome).toBe('volcanic');
  });

  it('resolves region audio cues and computes equal-power crossfades', () => {
    const aTown = resolveRegionAudio(regions[0]);
    const aFord = resolveRegionAudio(regions[1]);
    expect(aTown).toEqual({ music: 'mus-town-thornwick', ambience: 'amb_town_thornwick' });
    expect(aFord).toEqual({ music: 'mus-act1-march', ambience: 'amb_marsh_fog' });

    const same = computeAudioCrossfade(aTown.music, aTown.music, 0.5);
    expect(same).toEqual({ prevGain: 1, nextGain: 1, switched: false });

    const mid = computeAudioCrossfade(aTown.music, aFord.music, 0.5);
    expect(mid.switched).toBe(true);
    expect(mid.prevGain).toBeCloseTo(Math.SQRT1_2, 3);
    expect(mid.nextGain).toBeCloseTo(Math.SQRT1_2, 3);
  });
});
