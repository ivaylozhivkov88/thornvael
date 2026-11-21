import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOSS_ROAR_DUCK_GAIN,
  COMBAT_CROSSFADE_DURATION_MS,
  COMBAT_HYSTERESIS_MS,
  DIALOGUE_SHOP_DUCK_DB,
  DIALOGUE_SHOP_DUCK_GAIN,
} from '../src/audio';

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
  decodeAudioData = vi.fn(async () => ({ duration: 0.5 }));

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
      type: 'lowpass',
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

describe('Adaptive Audio & Dynamic Combat Transitions', () => {
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
    vi.stubGlobal('window', { AudioContext: ContextMock, setTimeout, clearTimeout, localStorage: mockStorage });
    vi.stubGlobal('Audio', MediaMock);
    vi.stubGlobal('fetch', vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })));
    audio = await import('../src/audio');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('exports precise transition constants matching specifications', () => {
    expect(COMBAT_CROSSFADE_DURATION_MS).toBe(1600);
    expect(COMBAT_CROSSFADE_DURATION_MS).toBeGreaterThanOrEqual(1500);
    expect(COMBAT_CROSSFADE_DURATION_MS).toBeLessThanOrEqual(2000);

    expect(COMBAT_HYSTERESIS_MS).toBe(4000);
    expect(COMBAT_HYSTERESIS_MS).toBeGreaterThanOrEqual(4000);

    expect(DIALOGUE_SHOP_DUCK_DB).toBe(-4);
    expect(DIALOGUE_SHOP_DUCK_GAIN).toBeCloseTo(0.630957, 5);
    expect(BOSS_ROAR_DUCK_GAIN).toBe(0.25);
  });

  it('smoothly crossfades between exploration and combat music over 1.6s (1.5-2s range)', async () => {
    audio.unlock();
    await audio.whenLoaded();
    await settle();

    // Start in exploration
    audio.setMusicRegion(1, 'explore', 0);
    expect(audio.getAdaptiveDirector().getCurrentTrackId()).toBe('music_explore_act1_fords');
    const exploreMedia = MediaMock.all.find((m) => m.src.includes('music_explore_act1_fords.m4a'));
    expect(exploreMedia).toBeDefined();

    // Trigger combat transition
    audio.updateAdaptiveCombat(true, 1000);
    expect(audio.currentAdaptiveMode()).toBe('battle');
    expect(audio.getAdaptiveDirector().getCurrentTrackId()).toBe('music_battle_act1');
    expect(audio.getAdaptiveDirector().getOutgoingTrackId()).toBe('music_explore_act1_fords');

    // Halfway through 1600ms crossfade (800ms)
    const mid = audio.tickAudio(1800);
    expect(mid?.progress).toBeCloseTo(0.5, 2);
    expect(mid?.incomingGain).toBeCloseTo(0.5, 2);
    expect(mid?.outgoingGain).toBeCloseTo(0.5, 2);
    expect(exploreMedia?.paused).toBe(false);

    // Past 1600ms crossfade
    const done = audio.tickAudio(2600);
    expect(done?.progress).toBe(1);
    expect(done?.incomingGain).toBeCloseTo(1, 2);
    expect(done?.outgoingGain).toBeCloseTo(0, 2);
    expect(exploreMedia?.paused).toBe(true);
    expect(audio.getAdaptiveDirector().getOutgoingTrackId()).toBeNull();
  });

  it('triggers combat crossfade on enemy aggro, hero taking damage, or dealing damage', async () => {
    audio.unlock();
    await audio.whenLoaded();
    await settle();

    audio.setMusicRegion(2, 'explore', 0);
    expect(audio.currentAdaptiveMode()).toBe('explore');

    // 1. Enemy aggro via notifyCombatEvent
    audio.notifyCombatEvent('aggro', 1000);
    expect(audio.currentAdaptiveMode()).toBe('battle');
    expect(audio.getAdaptiveDirector().getCurrentTrackId()).toBe('music_battle_act2');
    expect(audio.isCombatActive(1000)).toBe(true);

    // 2. Aggro via monster aggro voice cue
    audio.playMonsterAggroVoice('briar-hound');
    expect(audio.currentAdaptiveMode()).toBe('battle');

    // 3. Hero deals damage via monster hit voice cue
    audio.playMonsterHitVoice('hollow-knight');
    expect(audio.currentAdaptiveMode()).toBe('battle');

    // 4. Hero takes damage via notifyCombatEvent
    audio.notifyCombatEvent('damage_taken', 2000);
    expect(audio.isCombatActive(2000)).toBe(true);

    // 5. Combat state update object
    audio.updateAdaptiveCombat({ heroDamaged: true }, 2500);
    expect(audio.currentAdaptiveMode()).toBe('battle');

    audio.updateAdaptiveCombat({ heroDealtDamage: true }, 3000);
    expect(audio.currentAdaptiveMode()).toBe('battle');
  });

  it('maintains combat music for 4+ seconds hysteresis after all enemies defeated before fading back', async () => {
    audio.unlock();
    await audio.whenLoaded();
    await settle();

    audio.setMusicRegion(1, 'explore', 0);

    // 3 nearby enemies in combat until t=2000
    audio.notifyNearbyEnemies(3, 1000);
    expect(audio.currentAdaptiveMode()).toBe('battle');
    expect(audio.isCombatActive(1000)).toBe(true);

    // Active combat continues until t=2000
    audio.updateAdaptiveCombat(true, 2000);

    // All nearby enemies defeated at t=2000
    audio.notifyNearbyEnemies(0, 2000);

    // 2.5 seconds later (t=4500): combat ended < 4s, still in battle
    expect(audio.updateAdaptiveCombat(false, 4500)).toBe('battle');
    expect(audio.currentAdaptiveMode()).toBe('battle');
    expect(audio.isCombatActive(4500)).toBe(true);

    // 3.9 seconds later (t=5900): still in battle
    expect(audio.updateAdaptiveCombat(false, 5900)).toBe('battle');
    expect(audio.currentAdaptiveMode()).toBe('battle');

    // 4.0+ seconds later (t=6000, 4000ms after t=2000): hysteresis expired, fades back to explore
    expect(audio.updateAdaptiveCombat(false, 6000)).toBe('explore');
    expect(audio.currentAdaptiveMode()).toBe('explore');
    expect(audio.getAdaptiveDirector().getCurrentTrackId()).toBe('music_explore_act1_fords');
    expect(audio.isCombatActive(6000)).toBe(false);
  });

  it('triggers boss theme with brief dramatic transition, roar stinger, and deep ducking', async () => {
    audio.unlock();
    await audio.whenLoaded();
    await settle();

    const [, , , musicBus] = ContextMock.all[0].gainNodes;
    audio.setBusVolume('music', 1.0);

    // Entering boss encounter: Morvessa
    audio.playBossMusic('morvessa', 1, 2000);
    await settle();

    expect(audio.currentAdaptiveMode()).toBe('boss');
    expect(audio.getAdaptiveDirector().getCurrentTrackId()).toBe('music_boss_morvessa');
    expect(audio.isMusicDucked()).toBe(true);
    expect(audio.getMusicDuckMultiplier()).toBeCloseTo(0.25, 4);
    expect(musicBus.gain.value).toBeCloseTo(0.32 * 0.25, 4);

    // Dramatic transition stinger cue fetched
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes('boss_roar_morvessa.m4a'))).toBe(true);

    // After dramatic roar transition finishes, ducking restores
    vi.advanceTimersByTime(2100);
    expect(audio.isMusicDucked()).toBe(false);
    expect(musicBus.gain.value).toBeCloseTo(0.32 * 1.0, 4);
  });

  it('slightly ducks background music (-4dB) when dialogs or town shops open and restores on close', async () => {
    audio.unlock();
    await audio.whenLoaded();
    await settle();

    const [, , , musicBus] = ContextMock.all[0].gainNodes;
    audio.setBusVolume('music', 1.0);
    expect(musicBus.gain.value).toBeCloseTo(0.32, 5);

    // 1. Dialogue opens
    audio.setDialogueDucking(true);
    expect(audio.isMusicDucked()).toBe(true);
    expect(audio.getMusicDuckMultiplier()).toBeCloseTo(DIALOGUE_SHOP_DUCK_GAIN, 4);
    expect(audio.getMusicDuckMultiplier()).toBeCloseTo(Math.pow(10, -4 / 20), 4);
    expect(musicBus.gain.value).toBeCloseTo(0.32 * DIALOGUE_SHOP_DUCK_GAIN, 4);

    // Dialogue closes
    audio.setDialogueDucking(false);
    expect(audio.isMusicDucked()).toBe(false);
    expect(audio.getMusicDuckMultiplier()).toBe(1.0);
    expect(musicBus.gain.value).toBeCloseTo(0.32, 5);

    // 2. Town shop opens via setShopDucking
    audio.setShopDucking(true);
    expect(audio.isMusicDucked()).toBe(true);
    expect(audio.getMusicDuckMultiplier()).toBeCloseTo(DIALOGUE_SHOP_DUCK_GAIN, 4);
    expect(musicBus.gain.value).toBeCloseTo(0.32 * DIALOGUE_SHOP_DUCK_GAIN, 4);

    audio.setShopDucking(false);
    expect(audio.isMusicDucked()).toBe(false);
    expect(musicBus.gain.value).toBeCloseTo(0.32, 5);

    // 3. Town shop entry cue ducks background music
    audio.playShopEntry(2000);
    expect(audio.isMusicDucked()).toBe(true);
    expect(audio.getMusicDuckMultiplier()).toBeCloseTo(DIALOGUE_SHOP_DUCK_GAIN, 4);

    vi.advanceTimersByTime(2100);
    expect(audio.isMusicDucked()).toBe(false);
    expect(musicBus.gain.value).toBeCloseTo(0.32, 5);
  });
});
