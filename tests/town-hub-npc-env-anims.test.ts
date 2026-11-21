import { describe, expect, it } from 'vitest';
import { loadDoc } from '../src/mapdoc';
import { BUILT_IN, createMission } from '../src/mission';
import { buildTowns, generateTownHubNpcs, type TownDef } from '../src/sim/town';
import {
  getTorchFlickerFrame,
  getBonfireFrame,
  getBannerFrame,
  getWaterWheelFrame,
  getCauldronFrame,
  getSmokeColumnFrame,
  isDungeonBiome,
} from '../src/art-wave3';
import { TOWN_NPC_POSE_DESCRIPTIONS, TOWN_NPC_ROLE_TITLES } from '../src/town';
import type { Sim } from '../src/sim/sim';

function createMockSim(): Sim {
  const g = createMission(loadDoc(BUILT_IN.market), 42);
  return g.sim;
}

describe('Town Hub NPC Idle Animations & Ambient Poses', () => {
  it('generates town hub characters with proper roles, poses, and frame offsets', () => {
    const sim = createMockSim();
    const townDef: TownDef = {
      name: 'Thornwick',
      tavern: 0,
      shop: 1,
      school: 2,
      tiers: [1, 2],
      mercs: [],
    };

    const towns = buildTowns(sim, [townDef]);
    expect(towns).toHaveLength(1);
    const town = towns[0]!;
    expect(town.hubNpcs).toBeDefined();
    const npcs = town.hubNpcs!;

    // Must generate at least smith, innkeeper, patron, priest, gate guards
    expect(npcs.length).toBeGreaterThanOrEqual(5);

    const smith = npcs.find((n) => n.role === 'smith');
    expect(smith).toBeDefined();
    expect(smith?.pose).toBe('anvil');
    expect(smith?.name).toContain('Blacksmith');
    expect(smith?.ambientBark).toBeDefined();

    const innkeeper = npcs.find((n) => n.role === 'innkeeper');
    expect(innkeeper).toBeDefined();
    expect(innkeeper?.pose).toBe('counter');
    expect(innkeeper?.name).toContain('Innkeeper');

    const patron = npcs.find((n) => n.role === 'villager');
    expect(patron).toBeDefined();
    expect(patron?.pose).toBe('patron');

    const priest = npcs.find((n) => n.role === 'priest');
    expect(priest).toBeDefined();
    expect(priest?.pose).toBe('altar');
    expect(priest?.name).toContain('Priest');

    const guards = npcs.filter((n) => n.role === 'guard');
    expect(guards.length).toBeGreaterThanOrEqual(2);
    for (const guard of guards) {
      expect(guard.pose).toBe('gate_vigil');
      expect(guard.ambientBark).toBeDefined();
    }

    // Ensure non-overlapping tiles among generated NPCs
    const coords = new Set(npcs.map((n) => `${n.x},${n.y}`));
    expect(coords.size).toBe(npcs.length);
  });

  it('exposes pose descriptions and role titles in src/town.ts', () => {
    expect(TOWN_NPC_ROLE_TITLES.smith).toBe('Master Blacksmith');
    expect(TOWN_NPC_ROLE_TITLES.innkeeper).toBe('Tavern Keeper');
    expect(TOWN_NPC_ROLE_TITLES.priest).toBe('Temple Priest');
    expect(TOWN_NPC_ROLE_TITLES.guard).toBe('Town Gate Guard');

    expect(TOWN_NPC_POSE_DESCRIPTIONS.anvil).toContain('anvil');
    expect(TOWN_NPC_POSE_DESCRIPTIONS.counter).toContain('bar');
    expect(TOWN_NPC_POSE_DESCRIPTIONS.patron).toContain('ale');
    expect(TOWN_NPC_POSE_DESCRIPTIONS.altar).toContain('astral');
    expect(TOWN_NPC_POSE_DESCRIPTIONS.gate_vigil).toContain('halberd');
  });

  it('is completely deterministic across repeated invocations', () => {
    const sim1 = createMockSim();
    const sim2 = createMockSim();
    const townDef: TownDef = {
      name: 'Oakhaven',
      tavern: 0,
      shop: 1,
      school: 2,
    };

    const npcs1 = generateTownHubNpcs(sim1, 0, townDef, [[9, 9], [17, 9], [25, 9]]);
    const npcs2 = generateTownHubNpcs(sim2, 0, townDef, [[9, 9], [17, 9], [25, 9]]);

    expect(npcs1).toEqual(npcs2);
  });
});

describe('Environmental Animations in World (art-wave3)', () => {
  it('correctly calculates 6-frame loop indices for torch, bonfire, water wheel, cauldron, smoke', () => {
    // 6-frame animations tick every 4 sim ticks
    for (let tick = 0; tick < 24; tick += 4) {
      const frameExpected = (tick >> 2) % 6;
      expect(getTorchFlickerFrame(tick)).toBe(`torch-flicker/${frameExpected}`);
      expect(getBonfireFrame(tick)).toBe(`bonfire/${frameExpected}`);
      expect(getWaterWheelFrame(tick)).toBe(`water-wheel/${frameExpected}`);
      expect(getCauldronFrame(tick)).toBe(`cauldron/${frameExpected}`);
      expect(getSmokeColumnFrame(tick)).toBe(`smoke-column/${frameExpected}`);
    }
  });

  it('correctly calculates 4-frame loop indices for faction banners', () => {
    for (let tick = 0; tick < 16; tick += 4) {
      const frameExpected = (tick >> 2) % 4;
      expect(getBannerFrame('thornwatch', tick)).toBe(`banner/thornwatch/${frameExpected}`);
      expect(getBannerFrame('ironbound', tick)).toBe(`banner/ironbound/${frameExpected}`);
      expect(getBannerFrame('conclave', tick)).toBe(`banner/conclave/${frameExpected}`);
    }
  });

  it('supports frame offsets for de-synchronized natural looping', () => {
    expect(getTorchFlickerFrame(0, 3)).toBe('torch-flicker/3');
    expect(getBonfireFrame(0, 1)).toBe('bonfire/1');
    expect(getBannerFrame('conclave', 0, 2)).toBe('banner/conclave/2');
  });

  it('correctly identifies dungeon / cave / crypt biomes', () => {
    expect(isDungeonBiome('caves')).toBe(true);
    expect(isDungeonBiome('ancient-crypt')).toBe(true);
    expect(isDungeonBiome('catacombs-of-ash')).toBe(true);
    expect(isDungeonBiome('undervault')).toBe(true);
    expect(isDungeonBiome('swamp')).toBe(false);
    expect(isDungeonBiome('desert')).toBe(false);
  });
});
