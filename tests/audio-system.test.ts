import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_MUSIC_TRACKS,
  DIALOGUE_VOICE_CLIPS,
  SFX_AMBIENT_WEATHER,
  SFX_FOOTSTEPS,
  SFX_LOOT_RARITY,
  SFX_MONSTER_VOICES,
  SFX_SPELLS,
  SFX_SPELL_SCHOOLS,
  SFX_UI,
  audioAssetPath,
  getBossMusic,
  getFootstepPool,
  getLootRaritySfx,
  getMonsterAggroSfx,
  getMonsterDeathSfx,
  getMusicForAct,
  getMusicForSkirmish,
  resolveDialogueVoiceClip,
} from '../src/audio-catalog';
import {
  AdaptiveAudioDirector,
  BusVoiceCap,
  computeSpatialAudio,
  type StreamingTrackHandle,
} from '../src/audio-adaptive';

const AUDIO_DIR = join(process.cwd(), 'public', 'audio');
const MAX_BINARY_BYTES = 3 * 1024 * 1024;

function assertAudioFileExists(id: string): void {
  const filePath = join(AUDIO_DIR, `${id}.m4a`);
  expect(existsSync(filePath), `Missing audio file: ${filePath}`).toBe(true);
  const size = statSync(filePath).size;
  expect(size, `Audio file ${id}.m4a is empty`).toBeGreaterThan(0);
  expect(size, `Audio file ${id}.m4a exceeds 3 MiB`).toBeLessThan(MAX_BINARY_BYTES);
}

describe('audio catalog integrity', () => {
  it('verifies every music track in ALL_MUSIC_TRACKS exists on disk and is < 3 MiB', () => {
    expect(ALL_MUSIC_TRACKS.length).toBe(41);
    const ids = new Set<string>();
    for (const track of ALL_MUSIC_TRACKS) {
      expect(ids.has(track.id), `Duplicate music track id: ${track.id}`).toBe(false);
      ids.add(track.id);
      assertAudioFileExists(track.id);
    }
  });

  it('verifies all UI, footstep, monster, spell, loot, and weather SFX exist on disk', () => {
    const sfxIds = new Set<string>();
    for (const id of Object.values(SFX_UI)) sfxIds.add(id);
    for (const pool of Object.values(SFX_FOOTSTEPS)) {
      for (const id of pool) sfxIds.add(id);
    }
    for (const id of Object.values(SFX_MONSTER_VOICES.aggro)) sfxIds.add(id);
    for (const id of Object.values(SFX_MONSTER_VOICES.death)) sfxIds.add(id);
    for (const id of Object.values(SFX_SPELL_SCHOOLS)) sfxIds.add(id);
    for (const pair of Object.values(SFX_SPELLS)) {
      sfxIds.add(pair.cast);
      sfxIds.add(pair.impact);
    }
    for (const id of Object.values(SFX_LOOT_RARITY)) sfxIds.add(id);
    for (const id of Object.values(SFX_AMBIENT_WEATHER)) sfxIds.add(id);

    for (const id of sfxIds) {
      assertAudioFileExists(id);
    }
  });

  it('maps acts, skirmish biomes, bosses, surfaces, monsters, and loot rarities', () => {
    expect(audioAssetPath('music_main_menu', '/thornvael/')).toBe('/thornvael/audio/music_main_menu.m4a');
    expect(getMusicForAct(1, 'explore', 2)).toBe('music_explore_act1_kilns');
    expect(getMusicForAct(2, 'explore', 2)).toBe('music_explore_act2_vaults');
    expect(getMusicForAct(3, 'explore', 2)).toBe('music_explore_act3_spit');
    expect(getMusicForAct(4, 'explore', 2)).toBe('music_explore_act4_caldera');
    expect(getMusicForAct(3, 'town')).toBe('music_town_oakhaven');
    expect(getMusicForAct(4, 'battle')).toBe('music_battle_act4');

    expect(getMusicForSkirmish('forest')).toBe('music_skirmish_forest');
    expect(getMusicForSkirmish('volcanic')).toBe('music_skirmish_volcanic');
    expect(getMusicForSkirmish('highlands')).toBe('music_skirmish_forest');

    expect(getBossMusic('ashkarath', 1)).toBe('music_boss_ashkarath');
    expect(getBossMusic('ashkarath', 2)).toBe('music_boss_ashkarath_phase2');
    expect(getBossMusic('morvessa', 1)).toBe('music_boss_morvessa');

    expect(getFootstepPool('snow')).toEqual(['step_snow_1', 'step_snow_2']);
    expect(getFootstepPool('volcanic_ash')).toEqual(['step_ash_1', 'step_ash_2']);

    expect(getMonsterAggroSfx('iron_golem')).toBe('mon_aggro_construct');
    expect(getMonsterAggroSfx('fallen_shaman')).toBe('mon_aggro_caster');
    expect(getMonsterDeathSfx('dune_scarab')).toBe('death_insect_1');
    expect(getMonsterDeathSfx('greater_mummy')).toBe('death_undead_1');

    expect(getLootRaritySfx('unique')).toBe('loot_unique');
    expect(getLootRaritySfx('rare')).toBe('loot_rare');
  });
});

interface MockTrack extends StreamingTrackHandle {
  playCalls: number;
  pauseCalls: number;
}

function createMockFactory(): { factory: (url: string, loop: boolean) => MockTrack; created: MockTrack[] } {
  const created: MockTrack[] = [];
  const factory = (url: string, loop: boolean): MockTrack => {
    const handle: MockTrack = {
      src: url,
      loop,
      volume: 0,
      paused: true,
      playCalls: 0,
      pauseCalls: 0,
      play() {
        this.paused = false;
        this.playCalls++;
      },
      pause() {
        this.paused = true;
        this.pauseCalls++;
      },
    };
    created.push(handle);
    return handle;
  };
  return { factory, created };
}

describe('adaptive streaming music director', () => {
  it('streams tracks via HTMLAudioElement factory and crossfades explore <-> battle with hysteresis', () => {
    const { factory, created } = createMockFactory();
    const director = new AdaptiveAudioDirector({ fadeDurationMs: 1000, hysteresisMs: 5000 }, factory);

    director.transitionHubToField(1, 0, 0);
    expect(director.getMode()).toBe('explore');
    expect(director.getCurrentTrackId()).toBe('music_explore_act1_fords');
    expect(created[0].src).toBe('/thornvael/audio/music_explore_act1_fords.m4a');
    expect(created[0].loop).toBe(true);
    expect(created[0].volume).toBe(1);

    // Enemy enters view -> immediate switch to battle with crossfade
    expect(director.updateCombat(true, 1000)).toBe('battle');
    expect(director.getCurrentTrackId()).toBe('music_battle_act1');
    expect(director.getOutgoingTrackId()).toBe('music_explore_act1_fords');

    const mid = director.tick(1500);
    expect(mid?.progress).toBeCloseTo(0.5, 4);
    expect(mid?.incomingGain).toBeCloseTo(0.5, 4);
    expect(mid?.outgoingGain).toBeCloseTo(0.5, 4);

    const done = director.tick(2000);
    expect(done?.progress).toBe(1);
    expect(created[0].pauseCalls).toBeGreaterThan(0);

    // Enemy leaves view -> stays in battle during hysteresis window
    expect(director.updateCombat(false, 3000)).toBe('battle');
    expect(director.updateCombat(false, 5999)).toBe('battle');

    // Past hysteresisMs (1000 + 5000 = 6000) -> returns to explore
    expect(director.updateCombat(false, 6000)).toBe('explore');
    expect(director.getCurrentTrackId()).toBe('music_explore_act1_fords');
  });

  it('handles hub transitions, boss phase stingers, ducking, bus volumes, and muteOnBlur', () => {
    const { factory } = createMockFactory();
    const director = new AdaptiveAudioDirector({ fadeDurationMs: 500 }, factory);

    director.setCharSelect(0);
    expect(director.getCurrentTrackId()).toBe('music_char_select');

    director.transitionFieldToHub(2, 100);
    expect(director.getMode()).toBe('hub');
    expect(director.getCurrentTrackId()).toBe('music_town_redmarsh');

    director.triggerBossPhase('ashkarath', 2, 'stinger_ashkarath_p2', 500);
    expect(director.getMode()).toBe('boss');
    expect(director.getCurrentTrackId()).toBe('music_boss_ashkarath_phase2');
    expect(director.getStingerHistory()).toEqual(['stinger_ashkarath_p2']);
    director.tick(1000);

    // Bus volume + overlapping ducking
    director.setBusVolume('music', 0.8);
    expect(director.getEffectiveMusicVolume()).toBeCloseTo(0.8, 5);

    director.setDucking('dialogue', true);
    expect(director.getEffectiveMusicVolume()).toBeCloseTo(0.8 * 0.35, 5);

    director.setDucking('boss_roar', true);
    expect(director.getEffectiveMusicVolume()).toBeCloseTo(0.8 * 0.25, 5);

    director.setDucking('boss_roar', false);
    expect(director.isDucked()).toBe(true);
    expect(director.getEffectiveMusicVolume()).toBeCloseTo(0.8 * 0.35, 5);

    director.setDucking('dialogue', false);
    expect(director.isDucked()).toBe(false);
    expect(director.getEffectiveMusicVolume()).toBeCloseTo(0.8, 5);

    // Mute on blur
    director.handleVisibilityChange(true);
    expect(director.getEffectiveMusicVolume()).toBe(0);
    director.handleVisibilityChange(false);
    expect(director.getEffectiveMusicVolume()).toBeCloseTo(0.8, 5);

    director.setMuteOnBlur(false);
    director.handleVisibilityChange(true);
    expect(director.getEffectiveMusicVolume()).toBeCloseTo(0.8, 5);
  });
});

describe('spatial audio and per-bus voice cap', () => {
  it('computes normalized stereo pan (-1..+1) and distance attenuation', () => {
    expect(computeSpatialAudio(0, 360, 1280, 720)).toEqual({ pan: -1, gain: 1 });
    expect(computeSpatialAudio(640, 360, 1280, 720)).toEqual({ pan: 0, gain: 1 });
    expect(computeSpatialAudio(1280, 360, 1280, 720)).toEqual({ pan: 1, gain: 1 });

    const halfOff = computeSpatialAudio(1920, 360, 1280, 720);
    expect(halfOff.pan).toBe(1);
    expect(halfOff.gain).toBeCloseTo(0.5, 4);

    const farOff = computeSpatialAudio(2560, 360, 1280, 720);
    expect(farOff.gain).toBe(0);
  });

  it('enforces per-bus voice cap with priority stealing and expiration', () => {
    const cap = new BusVoiceCap({ music: 2, sfx: 2, ambient: 1, ui: 1 });
    expect(cap.request('sfx', 'hit1', 1, 0, 200).allowed).toBe(true);
    expect(cap.request('sfx', 'hit2', 2, 10, 200).allowed).toBe(true);
    expect(cap.activeCount('sfx')).toBe(2);

    // Lower priority rejected when full
    expect(cap.request('sfx', 'step1', 0, 20, 100).allowed).toBe(false);

    // Higher priority steals oldest lowest-priority voice (hit1)
    const steal = cap.request('sfx', 'crit1', 4, 30, 200);
    expect(steal.allowed).toBe(true);
    expect(steal.stolen?.id).toBe('hit1');

    // After expiration, pool is free again
    cap.prune(300);
    expect(cap.activeCount('sfx')).toBe(0);
  });

  it('ships Mission 1 neural dialogue voiceovers on disk and resolves speakers cleanly', () => {
    for (const clipId of DIALOGUE_VOICE_CLIPS) {
      const voicePath = join(AUDIO_DIR, 'voices', `${clipId}.m4a`);
      expect(existsSync(voicePath), `Missing dialogue voice file: ${voicePath}`).toBe(true);
      expect(statSync(voicePath).size).toBeGreaterThan(0);
    }

    expect(
      resolveDialogueVoiceClip(
        'Warden Hale',
        'Blood at the Ford: The gnoll horde has breached the river border.',
        'Blood at the Ford',
      ),
    ).toBe('m01_briefing_hale');
    expect(
      resolveDialogueVoiceClip(
        'Narrator',
        "Cold drizzle turns Thornwick's market square into churned ochre paste.",
        'Blood at the Ford',
      ),
    ).toBe('cs_act1_start_01_narrator');
    expect(
      resolveDialogueVoiceClip(
        'Garrick Captain',
        'Three patrols overdue from Sunken Ford, and now smoke is rising.',
        'Blood at the Ford',
      ),
    ).toBe('cs_act1_start_02_garrick');
    expect(
      resolveDialogueVoiceClip(
        'Garrick Captain',
        'You heard the commander. Check your cinch-straps—nobody gets buried on company time.',
        'Blood at the Ford',
      ),
    ).toBe('cs_act1_start_03_garrick');
    expect(resolveDialogueVoiceClip('Warden Hale', 'Some later mission line.', 'Thornwick Market')).toBeNull();
  });
});
