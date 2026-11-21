import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class NodeMock {
  gain = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn((v: number) => { this.gain.value = v; }),
    linearRampToValueAtTime: vi.fn((v: number) => { this.gain.value = v; }),
  };
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  connect = vi.fn(() => this);
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
  sampleRate = 44100;

  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  decodeAudioData = vi.fn(async () => ({ duration: 1 }));

  constructor() { ContextMock.all.push(this); }
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
  createMediaElementSource() { return new NodeMock(); }
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
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  constructor(public src: string) { MediaMock.all.push(this); }
}

const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

let audio: typeof import('../src/audio');

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  ContextMock.all = [];
  MediaMock.all = [];
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
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

describe('Acoustic Balance & Bus Architecture', () => {
  it('establishes a 4-bus hierarchy where combat and UI cues cut cleanly over music and ambience', () => {
    const levels = audio.getBusLevels();

    // Default bus levels check
    expect(levels.master).toBeCloseTo(0.9, 2);
    expect(levels.sfx).toBeCloseTo(0.8, 2);
    expect(levels.ui).toBeCloseTo(0.85, 2);
    expect(levels.music).toBeCloseTo(0.32, 2);
    expect(levels.ambience).toBeCloseTo(0.22, 2);

    // Audio engineering balance: UI and SFX must be significantly louder than music bed
    // to ensure combat clarity and trader voice audibility without drowning
    expect(levels.sfx / levels.music).toBeGreaterThan(2.0); // +8dB margin
    expect(levels.ui / levels.music).toBeGreaterThan(2.5);  // +9dB margin
    expect(levels.music).toBeGreaterThan(levels.ambience);  // Ambience is subtle background layer
  });

  it('adjusts volume levels with clamping and persists to localStorage', () => {
    audio.setMasterVolume(0.5);
    audio.setSfxVolume(0.7);
    audio.setUiVolume(0.6);
    audio.setMusicVolume(0.4);
    audio.setAmbienceVolume(0.3);

    expect(audio.getMasterVolume()).toBe(0.5);
    expect(audio.getSfxVolume()).toBe(0.7);
    expect(audio.getUiVolume()).toBe(0.6);
    expect(audio.getMusicVolume()).toBe(0.4);
    expect(audio.getAmbienceVolume()).toBe(0.3);

    const levels = audio.getBusLevels();
    expect(levels.master).toBeCloseTo(0.9 * 0.5, 3);
    expect(levels.sfx).toBeCloseTo(0.8 * 0.7, 3);
    expect(levels.ui).toBeCloseTo(0.85 * 0.6, 3);
    expect(levels.music).toBeCloseTo(0.32 * 0.4, 3);
    expect(levels.ambience).toBeCloseTo(0.22 * 0.3, 3);

    // Test bounds clamping
    audio.setMusicVolume(2.5);
    expect(audio.getMusicVolume()).toBe(1.0);
    audio.setMusicVolume(-0.5);
    expect(audio.getMusicVolume()).toBe(0.0);
  });
});

describe('Biome Ambience Soundscapes', () => {
  it('switches seamlessly between all four act biomes (Marsh, Desert, Cavern, Hell)', () => {
    audio.unlock();

    // Act 1: Murky Marshland
    audio.setBiomeAmbience('act1_marsh');
    expect(audio.currentBiomeAmbience()).toBe('act1_marsh');
    expect(audio.currentTownAmbience()).toBe('act1_marsh');

    // Fast forward periodic timer to trigger atmospheric sounds
    vi.advanceTimersByTime(400);

    // Act 2: Dry Desert
    audio.setBiomeAmbience('act2_desert');
    expect(audio.currentBiomeAmbience()).toBe('act2_desert');
    expect(audio.currentTownAmbience()).toBe('act2_desert');
    vi.advanceTimersByTime(400);

    // Act 3: Subterranean Cavern
    audio.setBiomeAmbience('act3_cavern');
    expect(audio.currentBiomeAmbience()).toBe('act3_cavern');
    expect(audio.currentTownAmbience()).toBe('act3_cavern');
    vi.advanceTimersByTime(400);

    // Act 4: Infernal Hellfire
    audio.setBiomeAmbience('act4_hell');
    expect(audio.currentBiomeAmbience()).toBe('act4_hell');
    expect(audio.currentTownAmbience()).toBe('act4_hell');
    vi.advanceTimersByTime(400);

    // Turn off biome ambience
    audio.setBiomeAmbience(null);
    expect(audio.currentBiomeAmbience()).toBeNull();
  });

  it('manages town hub atmospheric layers and clean cleanup', () => {
    audio.unlock();

    audio.playTownAmbience('blacksmith');
    expect(audio.currentTownAmbience()).toBe('blacksmith');
    vi.advanceTimersByTime(400);

    audio.playTownAmbience('tavern');
    expect(audio.currentTownAmbience()).toBe('tavern');
    vi.advanceTimersByTime(400);

    audio.stopTownAmbience();
    expect(audio.currentTownAmbience()).toBeNull();
  });
});

describe('Soundtrack Looping & Crossfading', () => {
  it('ensures music tracks loop seamlessly and crossfade without orphaned overlapping tracks', async () => {
    audio.unlock();
    await audio.whenLoaded();
    await settle();

    // Start with explore track
    audio.setMusic(true, 'explore');
    expect(audio.currentMusic()).toBe('explore');

    // Find the media elements created for music
    const exploreMedia = MediaMock.all.find(m => m.src.includes('music_explore.m4a'));
    expect(exploreMedia).toBeDefined();
    expect(exploreMedia?.loop).toBe(true);

    // Crossfade to battle track
    audio.setMusic(true, 'battle');
    expect(audio.currentMusic()).toBe('battle');

    const battleMedia = MediaMock.all.find(m => m.src.includes('music_battle.m4a'));
    expect(battleMedia).toBeDefined();
    expect(battleMedia?.loop).toBe(true);

    // Advance time past the crossfade window (1.6s + 200ms)
    vi.advanceTimersByTime(1800);

    // The old explore track must be paused
    expect(exploreMedia?.paused).toBe(true);

    // Crossfade to town track
    audio.setMusic(true, 'town');
    expect(audio.currentMusic()).toBe('town');
    const townMedia = MediaMock.all.find(m => m.src.includes('music_town.m4a'));
    expect(townMedia).toBeDefined();
    expect(townMedia?.loop).toBe(true);

    vi.advanceTimersByTime(1800);
    expect(battleMedia?.paused).toBe(true);

    // Turning off music fades out and pauses all tracks
    audio.setMusic(false);
    expect(audio.currentMusic()).toBe('off');
    vi.advanceTimersByTime(1000);
    expect(townMedia?.paused).toBe(true);
  });
});

describe('Mobile & iOS Lifecycle Integration', () => {
  it('suspends all audio playback, intervals, and media on visibility hidden', () => {
    audio.unlock();
    audio.setMusic(true, 'explore');
    audio.setBiomeAmbience('act1_marsh');

    expect(audio.currentBiomeAmbience()).toBe('act1_marsh');

    // Simulate page backgrounding (visibilitychange)
    audio.suspendAudio();

    // All media elements must be paused
    expect(MediaMock.all.every(m => m.paused)).toBe(true);

    // Resume when coming back to foreground
    audio.resumeAudio();

    // Biome ambience is preserved and restored
    expect(audio.currentBiomeAmbience()).toBe('act1_marsh');
  });

  it('restores audio upon user touch unlock', async () => {
    audio.unlock();
    await audio.whenLoaded();
    await settle();

    const ctx = ContextMock.all[0];
    expect(ctx).toBeDefined();
    expect(ctx.state).toBe('running');

    // Play procedural trader bark without error
    expect(() => {
      audio.playTraderBark('blacksmith', 'greet');
      audio.playTraderBark('barkeep', 'buy');
      audio.playTraderBark('alchemist', 'farewell');
      audio.playTraderBark('guildmaster', 'greet');
    }).not.toThrow();

    // Play UI click and inventory sounds
    expect(() => {
      audio.blip();
      audio.playPickupRustle();
      audio.playEquipSfx(true);
      audio.playEquipSfx(false);
    }).not.toThrow();
  });
});
