import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_CATALOG_MUSIC_TRACKS,
  ALL_ON_DEMAND_SFX_IDS,
  MUSIC_ENDINGS,
  SFX_BOSS_ROARS,
  SFX_MERC_BARKS,
  SFX_MONSTER_VOICES,
  SFX_NPC_BARKS,
  WAVE2_MUSIC_TRACKS,
  WAVE2_SFX_IDS,
  getBossRoarSfx,
  getEndingMusic,
  getMercBarkSfx,
  getMonsterHitSfx,
  getNpcBarkSfx,
} from '../src/audio-catalog';

const AUDIO_DIR = join(process.cwd(), 'public', 'audio');
const MAX_BINARY_BYTES = 3 * 1024 * 1024;

const WAVE2_FILES = [
  'bark_smith',
  'bark_innkeeper',
  'bark_mage',
  'bark_priest',
  'bark_guard',
  'bark_merchant',
  'bark_merc_warrior',
  'bark_merc_archer',
  'bark_merc_mage',
  'mon_hit_beast',
  'mon_hit_undead',
  'mon_hit_caster',
  'mon_hit_construct',
  'mon_hit_insect',
  'boss_roar_morvessa',
  'boss_roar_gorrathul',
  'boss_roar_vesperion',
  'boss_roar_ashkarath',
  'music_ending_crown',
  'music_ending_ember',
] as const;

class NodeMock {
  gain = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn((v: number) => {
      this.gain.value = v;
    }),
    linearRampToValueAtTime: vi.fn((v: number) => {
      this.gain.value = v;
    }),
  };
  pan = { value: 0 };
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  connectedTo: NodeMock[] = [];
  connect = vi.fn((dest: NodeMock) => {
    this.connectedTo.push(dest);
    return dest;
  });
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class ContextMock {
  static all: ContextMock[] = [];
  state = 'suspended';
  destination = new NodeMock();
  currentTime = 0;
  sources: NodeMock[] = [];
  gainNodes: NodeMock[] = [];
  panners: NodeMock[] = [];
  sampleRate = 44100;

  resume = vi.fn(async () => {
    this.state = 'running';
  });
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  decodeAudioData = vi.fn(async () => ({ duration: 0.45 }));

  constructor() {
    ContextMock.all.push(this);
  }
  createGain() {
    const n = new NodeMock();
    this.gainNodes.push(n);
    return n;
  }
  createBufferSource() {
    const n = new NodeMock();
    this.sources.push(n);
    return n;
  }
  createBuffer() {
    return {
      duration: 1,
      getChannelData: () => new Float32Array(100),
    };
  }
  createMediaElementSource() {
    return new NodeMock();
  }
  createStereoPanner() {
    const n = new NodeMock();
    this.panners.push(n);
    return n;
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  createBiquadFilter() {
    return {
      type: 'bandpass',
      frequency: { value: 1000, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      Q: { value: 1 },
      connect: vi.fn(),
    };
  }
}

class MediaMock {
  static all: MediaMock[] = [];
  paused = true;
  loop = false;
  preload = '';
  crossOrigin = '';
  volume = 1;
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  constructor(public src: string) {
    MediaMock.all.push(this);
  }
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('Wave 2 Audio Assets & Catalog Provenance', () => {
  it('verifies all 20 Wave 2 .m4a assets and all on-demand catalog SFX exist on disk under 3 MiB', () => {
    expect(WAVE2_FILES).toHaveLength(20);
    for (const id of WAVE2_FILES) {
      const p = join(AUDIO_DIR, `${id}.m4a`);
      expect(existsSync(p), `Missing Wave 2 audio file: ${p}`).toBe(true);
      const size = statSync(p).size;
      expect(size, `${id}.m4a is too small`).toBeGreaterThan(1000);
      expect(size, `${id}.m4a exceeds 3 MiB`).toBeLessThan(MAX_BINARY_BYTES);
    }

    for (const id of ALL_ON_DEMAND_SFX_IDS) {
      const p = join(AUDIO_DIR, `${id}.m4a`);
      expect(existsSync(p), `Missing on-demand SFX file: ${p}`).toBe(true);
    }

    expect(WAVE2_SFX_IDS).toHaveLength(18);
    expect(WAVE2_MUSIC_TRACKS.map((t) => t.id)).toEqual([
      MUSIC_ENDINGS.crown,
      MUSIC_ENDINGS.ember,
    ]);
    expect(ALL_CATALOG_MUSIC_TRACKS.length).toBe(43);
  });

  it('verifies all 20 Wave 2 assets are registered in assets.json with license own', () => {
    const raw = readFileSync(resolve(process.cwd(), 'assets.json'), 'utf8');
    const parsed = JSON.parse(raw) as {
      assets: Array<{ path: string; license: string; source: string; note: string }>;
    };
    const byPath = new Map(parsed.assets.map((a) => [a.path, a]));
    for (const id of WAVE2_FILES) {
      const entry = byPath.get(`public/audio/${id}.m4a`);
      expect(entry, `assets.json missing public/audio/${id}.m4a`).toBeDefined();
      expect(entry?.license).toBe('own');
      expect(entry?.source).toBe('tools/audio-gen-wave2.py');
    }
  });

  it('maps NPC barks, mercenary archetypes, monster hit voices, boss roars, and endings', () => {
    expect(SFX_NPC_BARKS.smith).toBe('bark_smith');
    expect(SFX_MERC_BARKS.archer).toBe('bark_merc_archer');
    expect(SFX_MONSTER_VOICES.hit.construct).toBe('mon_hit_construct');
    expect(SFX_BOSS_ROARS.vesperion).toBe('boss_roar_vesperion');

    expect(getNpcBarkSfx('Hobb Smith')).toBe('bark_smith');
    expect(getNpcBarkSfx('Tavern Barkeep')).toBe('bark_innkeeper');
    expect(getNpcBarkSfx('Alchemist Marta')).toBe('bark_mage');
    expect(getNpcBarkSfx('Elias Penitent Priest')).toBe('bark_priest');
    expect(getNpcBarkSfx('Captain Garrick')).toBe('bark_guard');
    expect(getNpcBarkSfx('Quartermaster Bram')).toBe('bark_merchant');

    expect(getMercBarkSfx('Thornwick Levyman Warrior')).toBe('bark_merc_warrior');
    expect(getMercBarkSfx('Alder Poacher Archer')).toBe('bark_merc_archer');
    expect(getMercBarkSfx('Storm Channeler Mage')).toBe('bark_merc_mage');

    expect(getMonsterHitSfx('briar-hound')).toBe('mon_hit_beast');
    expect(getMonsterHitSfx('hollow-knight')).toBe('mon_hit_undead');
    expect(getMonsterHitSfx('ash-weaver')).toBe('mon_hit_caster');
    expect(getMonsterHitSfx('basalt-brute')).toBe('mon_hit_construct');
    expect(getMonsterHitSfx('dune-scarab')).toBe('mon_hit_insect');

    expect(getBossRoarSfx('morvessa')).toBe('boss_roar_morvessa');
    expect(getBossRoarSfx('gorrathul')).toBe('boss_roar_gorrathul');
    expect(getBossRoarSfx('vesperion')).toBe('boss_roar_vesperion');
    expect(getBossRoarSfx('ashkarath')).toBe('boss_roar_ashkarath');
    expect(getBossRoarSfx('gnoll')).toBeNull();

    expect(getEndingMusic('crown')).toBe('music_ending_crown');
    expect(getEndingMusic('ember')).toBe('music_ending_ember');
    expect(getEndingMusic('a')).toBe('music_ending_crown');
    expect(getEndingMusic('b')).toBe('music_ending_ember');
  });
});

describe('Wave 2 Live Integration in src/audio.ts', () => {
  let audio: typeof import('../src/audio');
  let store: Map<string, string>;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    ContextMock.all = [];
    MediaMock.all = [];
    store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    };
    vi.stubGlobal('localStorage', mockStorage);
    vi.stubGlobal('window', { AudioContext: ContextMock, setTimeout, localStorage: mockStorage });
    vi.stubGlobal('Audio', MediaMock);
    vi.stubGlobal('fetch', vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })));
    audio = await import('../src/audio');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('streams music exclusively via <audio> through AdaptiveAudioDirector (never decodeAudioData)', async () => {
    audio.unlock();
    await audio.whenLoaded();
    await settle();

    const fetchBeforeMusic = vi.mocked(fetch).mock.calls.length;
    const decodeBeforeMusic = ContextMock.all[0].decodeAudioData.mock.calls.length;

    audio.setMusicRegion(1, 'explore', 2);
    expect(audio.getAdaptiveDirector().getCurrentTrackId()).toBe('music_explore_act1_kilns');
    expect(MediaMock.all.some((m) => m.src.includes('music_explore_act1_kilns.m4a'))).toBe(true);

    audio.setSkirmishMusic('volcanic');
    expect(audio.getAdaptiveDirector().getCurrentTrackId()).toBe('music_skirmish_volcanic');
    vi.advanceTimersByTime(1400);

    const kilnsEl = MediaMock.all.find((m) => m.src.includes('music_explore_act1_kilns.m4a'));
    expect(kilnsEl?.paused).toBe(true);

    // Combat hysteresis wired via AdaptiveAudioDirector
    expect(audio.updateAdaptiveCombat(true, 5000)).toBe('battle');
    expect(audio.getAdaptiveDirector().getCurrentTrackId()).toBe('music_battle');
    expect(audio.updateAdaptiveCombat(false, 8000)).toBe('battle');
    expect(audio.updateAdaptiveCombat(false, 11000)).toBe('skirmish');
    expect(audio.getAdaptiveDirector().getCurrentTrackId()).toBe('music_skirmish_volcanic');

    audio.playEndingMusic('ember');
    expect(audio.currentAdaptiveMode()).toBe('ending');
    expect(audio.getAdaptiveDirector().getCurrentTrackId()).toBe('music_ending_ember');
    expect(MediaMock.all.some((m) => m.src.includes('music_ending_ember.m4a'))).toBe(true);

    // Zero music files passed through fetch() or decodeAudioData()
    expect(vi.mocked(fetch).mock.calls.length).toBe(fetchBeforeMusic);
    expect(ContextMock.all[0].decodeAudioData.mock.calls.length).toBe(decodeBeforeMusic);
  });

  it('wires bus volume sliders (music, sfx, ambient, ui) and persists values', async () => {
    audio.unlock();
    await audio.whenLoaded();
    await settle();

    const c = ContextMock.all[0];
    // Gain creation order in unlock(): master(0), sfxBus(1), uiBus(2), musicBus(3), ambBus(4)
    const [, sfxBus, uiBus, musicBus, ambBus] = c.gainNodes;

    audio.setBusVolume('music', 0.5);
    audio.setBusVolume('sfx', 0.6);
    audio.setBusVolume('ambient', 0.4);
    audio.setBusVolume('ui', 0.7);

    expect(audio.getBusVolume('music')).toBe(0.5);
    expect(audio.getBusVolume('sfx')).toBe(0.6);
    expect(audio.getBusVolume('ambient')).toBe(0.4);
    expect(audio.getBusVolume('ui')).toBe(0.7);

    expect(audio.getBusVolumes()).toEqual({
      music: 0.5,
      sfx: 0.6,
      ambient: 0.4,
      ui: 0.7,
    });
    expect(audio.getAdaptiveDirector().getAllBusVolumes()).toEqual({
      music: 0.5,
      sfx: 0.6,
      ambient: 0.4,
      ui: 0.7,
    });

    expect(musicBus.gain.value).toBeCloseTo(0.32 * 0.5, 5);
    expect(sfxBus.gain.value).toBeCloseTo(0.8 * 0.6, 5);
    expect(ambBus.gain.value).toBeCloseTo(0.22 * 0.4, 5);
    expect(uiBus.gain.value).toBeCloseTo(0.85 * 0.7, 5);

    expect(store.get('thornvael.musicVol')).toBe('0.5');
    expect(store.get('thornvael.sfxVol')).toBe('0.6');
    expect(store.get('thornvael.ambVol')).toBe('0.4');
    expect(store.get('thornvael.uiVol')).toBe('0.7');
  });

  it('applies dialogue and boss roar ducking to musicBus and auto-restores after stinger duration', async () => {
    audio.unlock();
    await audio.whenLoaded();
    await settle();

    const [, , , musicBus] = ContextMock.all[0].gainNodes;
    audio.setBusVolume('music', 0.8);
    expect(audio.getEffectiveMusicGain()).toBeCloseTo(0.32 * 0.8, 5);
    expect(musicBus.gain.value).toBeCloseTo(0.32 * 0.8, 5);

    audio.setDialogueDucking(true);
    expect(audio.isMusicDucked()).toBe(true);
    expect(audio.getMusicDuckMultiplier()).toBeCloseTo(0.35, 5);
    expect(musicBus.gain.value).toBeCloseTo(0.32 * 0.8 * 0.35, 5);

    // Boss roar overrides dialogue duck with deeper 0.25 multiplier and triggers roar stinger
    audio.playBossRoar('ashkarath', 2000);
    await settle();
    expect(audio.getMusicDuckMultiplier()).toBeCloseTo(0.25, 5);
    expect(musicBus.gain.value).toBeCloseTo(0.32 * 0.8 * 0.25, 5);
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes('boss_roar_ashkarath.m4a'))).toBe(true);

    // After boss roar finishes, dialogue ducking remains active until dismissed
    vi.advanceTimersByTime(2100);
    expect(audio.isMusicDucked()).toBe(true);
    expect(audio.getMusicDuckMultiplier()).toBeCloseTo(0.35, 5);
    expect(musicBus.gain.value).toBeCloseTo(0.32 * 0.8 * 0.35, 5);

    audio.setDialogueDucking(false);
    expect(audio.isMusicDucked()).toBe(false);
    expect(musicBus.gain.value).toBeCloseTo(0.32 * 0.8, 5);
  });

  it('handles muteOnBlur on visibilitychange/blur/focus and persists preference', async () => {
    audio.unlock();
    await audio.whenLoaded();
    await settle();

    const [master, , , musicBus] = ContextMock.all[0].gainNodes;
    audio.setMasterVolume(0.9);
    audio.setMusicVolume(0.75);

    const listeners = new Map<string, Set<() => void>>();
    const mockDoc = {
      hidden: false,
      addEventListener: (ev: string, fn: () => void) => {
        if (!listeners.has(ev)) listeners.set(ev, new Set());
        listeners.get(ev)!.add(fn);
      },
      removeEventListener: (ev: string, fn: () => void) => {
        listeners.get(ev)?.delete(fn);
      },
    };
    const mockWin = {
      addEventListener: mockDoc.addEventListener,
      removeEventListener: mockDoc.removeEventListener,
    };

    const detach = audio.attachBlurMuteListeners(mockDoc, mockWin);
    expect(audio.isMuteOnBlur()).toBe(true);

    // Simulate window blur
    for (const fn of listeners.get('blur') ?? []) fn();
    expect(master.gain.value).toBe(0);
    expect(musicBus.gain.value).toBe(0);
    expect(audio.getEffectiveMusicGain()).toBe(0);

    // Simulate window focus back
    for (const fn of listeners.get('focus') ?? []) fn();
    expect(master.gain.value).toBeCloseTo(0.9 * 0.9, 5);
    expect(musicBus.gain.value).toBeCloseTo(0.32 * 0.75, 5);

    // Disable muteOnBlur -> visibility hidden keeps audio unmuted
    audio.setMuteOnBlur(false);
    expect(audio.isMuteOnBlur()).toBe(false);
    expect(store.get('thornvael.muteOnBlur')).toBe('false');
    mockDoc.hidden = true;
    for (const fn of listeners.get('visibilitychange') ?? []) fn();
    expect(master.gain.value).toBeCloseTo(0.9 * 0.9, 5);
    expect(musicBus.gain.value).toBeCloseTo(0.32 * 0.75, 5);

    detach();
  });

  it('lazy-loads Wave 2 barks, monster hits, and UI error cues on demand and routes to proper buses', async () => {
    audio.unlock();
    await audio.whenLoaded();
    await settle();

    const c = ContextMock.all[0];
    const [, sfxBus, uiBus] = c.gainNodes;

    audio.playNpcBark('smith');
    audio.playMercBark('archer');
    audio.playMonsterHitVoice('construct', { x: 1100, y: 360, w: 1280, h: 720 });
    audio.playUiError();
    await settle();

    const urls = vi.mocked(fetch).mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.includes('bark_smith.m4a'))).toBe(true);
    expect(urls.some((u) => u.includes('bark_merc_archer.m4a'))).toBe(true);
    expect(urls.some((u) => u.includes('mon_hit_construct.m4a'))).toBe(true);
    expect(urls.some((u) => u.includes('ui_error.m4a'))).toBe(true);

    // NPC bark & UI error route through uiBus; monster hit uses stereo panner into sfxBus
    const connectedTargets = c.gainNodes.flatMap((g) => g.connectedTo);
    expect(connectedTargets).toContain(uiBus);
    expect(c.panners.some((p) => p.pan.value > 0.5 && p.connectedTo.includes(sfxBus))).toBe(true);
  });
});
