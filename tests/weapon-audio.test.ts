import { existsSync, statSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_VOICES,
  MIN_GAP,
  VoiceLimiter,
  classifyWeapon,
  cueFor,
  pickArmorImpact,
  pickMonsterDeath,
  pickPotionDrink,
  pickShieldBlock,
  pickTerrainStep,
  pickWeaponHit,
  pickWeaponSwing,
  resetAudioLogicCounters,
  WEAPON_HITS,
  WEAPON_SWINGS,
  SHIELD_BLOCKS,
  POTION_DRINKS,
  TERRAIN_STEPS,
} from '../src/audiologic';

const EXPECTED_SFX = [
  'hit_sword_1.m4a', 'hit_sword_2.m4a', 'hit_sword_3.m4a', 'swing_sword_1.m4a', 'swing_sword_2.m4a',
  'hit_axe_1.m4a', 'hit_axe_2.m4a', 'hit_axe_3.m4a', 'swing_axe_1.m4a',
  'hit_blunt_1.m4a', 'hit_blunt_2.m4a', 'hit_blunt_3.m4a',
  'hit_pierce_1.m4a', 'hit_pierce_2.m4a', 'hit_dagger_1.m4a',
  'block_shield_1.m4a', 'block_shield_2.m4a',
  'armor_leather.m4a', 'armor_plate.m4a',
  'potion_drink_1.m4a', 'potion_drink_2.m4a',
  'step_grass_1.m4a', 'step_grass_2.m4a', 'step_grass_3.m4a',
  'step_dirt_1.m4a', 'step_dirt_2.m4a', 'step_dirt_3.m4a',
  'step_water_1.m4a', 'step_water_2.m4a',
  'step_stone_1.m4a', 'step_stone_2.m4a',
  'death_beast_1.m4a', 'death_skeleton_1.m4a',
];

describe('Procedural Weapon & Movement SFX Files on Disk', () => {
  const audioDir = resolve(__dirname, '../public/audio');

  it('all 29 newly synthesized audio files exist on disk with valid file sizes', () => {
    for (const filename of EXPECTED_SFX) {
      const fullPath = resolve(audioDir, filename);
      expect(existsSync(fullPath), `Missing audio file: ${filename}`).toBe(true);
      const size = statSync(fullPath).size;
      expect(size).toBeGreaterThan(500); // Not empty, valid header and payload
      expect(size).toBeLessThan(100 * 1024); // Lightweight AAC budget < 100 KB
    }
  });

  it('every new SFX is registered in assets.json with valid license, source and sha256', () => {
    const assetsRaw = readFileSync(resolve(__dirname, '../assets.json'), 'utf8');
    const assets = JSON.parse(assetsRaw).assets as Array<{ path: string; license: string; source: string; sha256?: string }>;
    const registered = new Map(assets.map((a) => [a.path, a]));

    for (const filename of EXPECTED_SFX) {
      const relPath = `public/audio/${filename}`;
      const entry = registered.get(relPath);
      expect(entry, `assets.json missing entry for ${relPath}`).toBeDefined();
      expect(entry?.license).toBe('own');
      expect(entry?.source).toBe('tools/gen-combat-weapon-sfx.py');
      expect(typeof entry?.sha256).toBe('string');
      expect(entry?.sha256?.length).toBe(64);
    }
  });

  it('chapter1-manifest.json includes all new SFX files', () => {
    const manifestRaw = readFileSync(resolve(__dirname, '../public/chapter1-manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestRaw);
    const inManifest = new Set(manifest.files.map((f: { path: string }) => f.path));

    for (const filename of EXPECTED_SFX) {
      expect(inManifest.has(`audio/${filename}`), `chapter1-manifest missing audio/${filename}`).toBe(true);
    }
  });
});

describe('Weapon Classification & Sound Picking', () => {
  it('correctly classifies weapons by name', () => {
    expect(classifyWeapon('Rusty Sword')).toBe('sword');
    expect(classifyWeapon('Steel Sword')).toBe('sword');
    expect(classifyWeapon('Dreadnought Zweihander')).toBe('sword');
    expect(classifyWeapon('Woodcutter Handaxe')).toBe('axe');
    expect(classifyWeapon('Berserker Decapitator')).toBe('axe');
    expect(classifyWeapon('Flanged Mace')).toBe('blunt');
    expect(classifyWeapon('Heavy Morningstar')).toBe('blunt');
    expect(classifyWeapon('Steel Warhammer')).toBe('blunt');
    expect(classifyWeapon('Flint Stiletto')).toBe('dagger');
    expect(classifyWeapon('Shadow Dirk')).toBe('dagger');
    expect(classifyWeapon('Composite War Bow')).toBe('pierce');
    expect(classifyWeapon('Heavy Arbalest')).toBe('pierce');
  });

  it('picks weapon hit variations cycling and deterministic variants', () => {
    resetAudioLogicCounters();
    const hits = [pickWeaponHit('sword'), pickWeaponHit('sword'), pickWeaponHit('sword')];
    expect(hits).toEqual(['hit_sword_1', 'hit_sword_2', 'hit_sword_3']);

    expect(pickWeaponHit('sword', 0)).toBe('hit_sword_1');
    expect(pickWeaponHit('sword', 1)).toBe('hit_sword_2');
    expect(pickWeaponHit('sword', 2)).toBe('hit_sword_3');

    expect(pickWeaponHit('axe', 0)).toBe('hit_axe_1');
    expect(pickWeaponHit('axe', 1)).toBe('hit_axe_2');
    expect(pickWeaponHit('axe', 2)).toBe('hit_axe_3');

    expect(pickWeaponHit('blunt', 0)).toBe('hit_blunt_1');
    expect(pickWeaponHit('blunt', 1)).toBe('hit_blunt_2');
    expect(pickWeaponHit('blunt', 2)).toBe('hit_blunt_3');

    expect(pickWeaponHit('dagger', 0)).toBe('hit_dagger_1');
  });

  it('picks weapon swing variations', () => {
    resetAudioLogicCounters();
    expect(pickWeaponSwing('sword', 0)).toBe('swing_sword_1');
    expect(pickWeaponSwing('sword', 1)).toBe('swing_sword_2');
    expect(pickWeaponSwing('axe', 0)).toBe('swing_axe_1');
  });

  it('picks shield blocks and armor impacts', () => {
    expect(pickShieldBlock(0)).toBe('block_shield_1');
    expect(pickShieldBlock(1)).toBe('block_shield_2');
    expect(pickArmorImpact('Plate Armor')).toBe('armor_plate');
    expect(pickArmorImpact('Studded Leather')).toBe('armor_leather');
  });

  it('picks potion drinking variations', () => {
    resetAudioLogicCounters();
    expect(pickPotionDrink()).toBe('potion_drink_1');
    expect(pickPotionDrink()).toBe('potion_drink_2');
    expect(pickPotionDrink(0)).toBe('potion_drink_1');
    expect(pickPotionDrink(1)).toBe('potion_drink_2');
  });

  it('picks surface-appropriate footsteps', () => {
    // Terrain: 0 Grass, 1 Dirt, 2 Water, 3 Rock, 4 Marsh
    expect(pickTerrainStep(0, 0)).toBe('step_grass_1');
    expect(pickTerrainStep(0, 1)).toBe('step_grass_2');
    expect(pickTerrainStep(0, 2)).toBe('step_grass_3');

    expect(pickTerrainStep(1, 0)).toBe('step_dirt_1');
    expect(pickTerrainStep(1, 1)).toBe('step_dirt_2');
    expect(pickTerrainStep(1, 2)).toBe('step_dirt_3');

    expect(pickTerrainStep(2, 0)).toBe('step_water_1');
    expect(pickTerrainStep(2, 1)).toBe('step_water_2');
    expect(pickTerrainStep(4, 0)).toBe('step_water_1'); // marsh -> water squelch

    expect(pickTerrainStep(3, 0)).toBe('step_stone_1');
    expect(pickTerrainStep(3, 1)).toBe('step_stone_2');

    // String labels
    expect(pickTerrainStep('grass', 0)).toBe('step_grass_1');
    expect(pickTerrainStep('earth', 0)).toBe('step_dirt_1');
    expect(pickTerrainStep('bog', 0)).toBe('step_water_1');
    expect(pickTerrainStep('dungeon', 0)).toBe('step_stone_1');
  });

  it('picks monster death sound based on kind', () => {
    expect(pickMonsterDeath('skeleton')).toBe('death_skeleton_1');
    expect(pickMonsterDeath('undead_warrior')).toBe('death_skeleton_1');
    expect(pickMonsterDeath('dire_wolf')).toBe('death_beast_1');
    expect(pickMonsterDeath('gnoll_scout')).toBe('death_beast_1');
    expect(pickMonsterDeath('goblin')).toBe('death');
  });
});

describe('cueFor Combat Event Mapping & Priorities', () => {
  it('maps physical weapon hits to specific weapon cues with priority 1', () => {
    const swordCue = cueFor({ type: 0, v: 12, el: 0 }, { weapon: 'sword', variant: 0 });
    expect(swordCue).toEqual({ name: 'hit_sword_1', priority: 1 });

    const axeCue = cueFor({ type: 0, v: 18, el: 0 }, { weapon: 'axe', variant: 1 });
    expect(axeCue).toEqual({ name: 'hit_axe_2', priority: 1 });

    const bluntCue = cueFor({ type: 0, v: 24, el: 0 }, { weapon: 'blunt', variant: 2 });
    expect(bluntCue).toEqual({ name: 'hit_blunt_3', priority: 1 });

    const daggerCue = cueFor({ type: 0, v: 8, el: 0 }, { weapon: 'dagger', variant: 0 });
    expect(daggerCue).toEqual({ name: 'hit_dagger_1', priority: 1 });

    const plateCue = cueFor({ type: 0, v: 10, el: 0 }, { armor: 'plate' });
    expect(plateCue).toEqual({ name: 'armor_plate', priority: 1 });

    // Legacy / fallback hit without context
    const defaultCue = cueFor({ type: 0, v: 5, el: 0 });
    expect(defaultCue).toEqual({ name: 'hit', priority: 1 });
  });

  it('maps shield blocks (type 11) to block_shield with priority 2', () => {
    const block1 = cueFor({ type: 11, v: 10, el: 0 }, { variant: 0 });
    expect(block1).toEqual({ name: 'block_shield_1', priority: 2 });

    const block2 = cueFor({ type: 11, v: 15, el: 0 }, { variant: 1 });
    expect(block2).toEqual({ name: 'block_shield_2', priority: 2 });
  });

  it('maps potion consumption (type 14, did = 2) to potion_drink with priority 4', () => {
    const potCue = cueFor({ type: 14, v: 45, el: 2 }, { isPotion: true, variant: 0 });
    expect(potCue).toEqual({ name: 'potion_drink_1', priority: 4 });

    const potCue2 = cueFor({ type: 14, v: 45, el: 2 }, { isPotion: true, variant: 1 });
    expect(potCue2).toEqual({ name: 'potion_drink_2', priority: 4 });
  });

  it('maps monster deaths (type 2) to specific death sounds with priority 3', () => {
    const skelDeath = cueFor({ type: 2, v: 0, el: 0 }, { targetKind: 'skeleton' });
    expect(skelDeath).toEqual({ name: 'death_skeleton_1', priority: 3 });

    const beastDeath = cueFor({ type: 2, v: 0, el: 0 }, { targetKind: 'beast' });
    expect(beastDeath).toEqual({ name: 'death_beast_1', priority: 3 });

    const defaultDeath = cueFor({ type: 2, v: 0, el: 0 });
    expect(defaultDeath).toEqual({ name: 'death', priority: 3 });
  });
});

describe('Voice Limiter & Gap Rate-Limiting During Combat Bursts', () => {
  it('enforces MIN_GAP for rapid sword strikes', () => {
    const limiter = new VoiceLimiter();
    // hit_sword_1 gap is 45 ms
    expect(limiter.request('hit_sword_1', 1, 0, 300).action).toBe('play');
    expect(limiter.request('hit_sword_1', 1, 20, 300).action).toBe('skip'); // too soon (< 45 ms)
    expect(limiter.request('hit_sword_1', 1, 50, 300).action).toBe('play'); // >= 45 ms passes
  });

  it('enforces MIN_GAP for rapid potion drinking', () => {
    const limiter = new VoiceLimiter();
    // potion_drink_1 gap is 80 ms
    expect(limiter.request('potion_drink_1', 4, 0, 400).action).toBe('play');
    expect(limiter.request('potion_drink_1', 4, 50, 400).action).toBe('skip');
    expect(limiter.request('potion_drink_1', 4, 85, 400).action).toBe('play');
  });

  it('enforces MIN_GAP for footsteps', () => {
    const limiter = new VoiceLimiter();
    // step_grass_1 gap is 100 ms
    expect(limiter.request('step_grass_1', 0, 0, 150).action).toBe('play');
    expect(limiter.request('step_grass_1', 0, 60, 150).action).toBe('skip');
    expect(limiter.request('step_grass_1', 0, 105, 150).action).toBe('play');
  });

  it('higher priority sounds (shield blocks, potion, death) steal voices from low priority weapon hits under heavy bursts', () => {
    const limiter = new VoiceLimiter(MAX_VOICES);
    // Fill all 12 voices with sword hits (priority 1)
    for (let i = 0; i < MAX_VOICES; i++) {
      expect(limiter.request(`hit_sword_${(i % 3) + 1}`, 1, i * 60, 5000).action).toBe('play');
    }
    expect(limiter.active).toBe(MAX_VOICES);

    // Incoming footstep (priority 0) is skipped
    expect(limiter.request('step_grass_1', 0, 1000, 100).action).toBe('skip');

    // Incoming shield block (priority 2) steals a voice from a priority 1 hit
    const blockReq = limiter.request('block_shield_1', 2, 1000, 300);
    expect(blockReq.action).toBe('steal');
    expect(blockReq.victim?.priority).toBe(1);
    expect(limiter.active).toBe(MAX_VOICES);
    expect(limiter.stolen).toBe(1);

    // Incoming potion drink (priority 4) steals a voice
    const potReq = limiter.request('potion_drink_1', 4, 1100, 400);
    expect(potReq.action).toBe('steal');
    expect(limiter.active).toBe(MAX_VOICES);
    expect(limiter.stolen).toBe(2);
  });
});
