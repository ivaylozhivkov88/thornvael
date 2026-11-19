import {
  audioAssetPath,
  getBossMusic,
  getMusicForAct,
  getMusicForSkirmish,
  MUSIC_MENU,
} from './audio-catalog';

export type AudioBus = 'music' | 'sfx' | 'ambient' | 'ui';
export type MusicContextMode = 'menu' | 'char_select' | 'hub' | 'explore' | 'battle' | 'boss' | 'skirmish';
export type DuckReason = 'dialogue' | 'boss_roar' | 'cutscene';

export interface AdaptiveMusicConfig {
  fadeDurationMs: number;
  hysteresisMs: number;
  dialogueDuckGain: number;
  roarDuckGain: number;
  baseUrl: string;
}

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveMusicConfig = {
  fadeDurationMs: 1200,
  hysteresisMs: 6000,
  dialogueDuckGain: 0.35,
  roarDuckGain: 0.25,
  baseUrl: '/thornvael/',
};

export interface StreamingTrackHandle {
  src: string;
  loop: boolean;
  volume: number;
  paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
}

export type TrackFactory = (url: string, loop: boolean) => StreamingTrackHandle;

function defaultTrackFactory(url: string, loop: boolean): StreamingTrackHandle {
  const el = new Audio(url);
  el.loop = loop;
  el.preload = 'auto';
  el.volume = 0;
  return {
    get src() { return el.src; },
    get loop() { return el.loop; },
    set loop(v: boolean) { el.loop = v; },
    get volume() { return el.volume; },
    set volume(v: number) { el.volume = Math.max(0, Math.min(1, v)); },
    get paused() { return el.paused; },
    play: () => el.play(),
    pause: () => el.pause(),
  };
}

export interface SpatialAudioResult {
  /** Normalized stereo pan in [-1, +1] where -1 is left edge, 0 is center, +1 is right edge. */
  pan: number;
  /** Distance-attenuated gain in [0, 1]. */
  gain: number;
}

/**
 * Computes stereo pan by normalized screen X (-1..+1) and distance attenuation.
 * Sources inside the viewport have full gain (1); sources outside fall off linearly to 0
 * at one viewport extent away.
 */
export function computeSpatialAudio(
  screenX: number,
  screenY: number,
  viewWidth: number,
  viewHeight: number,
): SpatialAudioResult {
  const w = Math.max(1, viewWidth);
  const h = Math.max(1, viewHeight);
  const normX = (screenX / w) * 2 - 1;
  const pan = Math.max(-1, Math.min(1, normX));

  const dx = screenX < 0 ? -screenX : screenX > w ? screenX - w : 0;
  const dy = screenY < 0 ? -screenY : screenY > h ? screenY - h : 0;
  const distNorm = Math.hypot(dx / w, dy / h);
  const gain = distNorm >= 1 ? 0 : Math.max(0, 1 - distNorm);
  return { pan, gain };
}

export interface ActiveBusVoice {
  id: string;
  bus: AudioBus;
  priority: number;
  startedAt: number;
  endsAt: number;
}

export const DEFAULT_BUS_CAPS: Readonly<Record<AudioBus, number>> = {
  music: 2,
  sfx: 12,
  ambient: 4,
  ui: 6,
};

/** Per-bus voice cap with priority stealing and expiration. */
export class BusVoiceCap {
  private readonly pools: Record<AudioBus, ActiveBusVoice[]> = {
    music: [],
    sfx: [],
    ambient: [],
    ui: [],
  };

  constructor(private readonly caps: Readonly<Record<AudioBus, number>> = DEFAULT_BUS_CAPS) {}

  activeCount(bus: AudioBus): number {
    return this.pools[bus].length;
  }

  prune(nowMs: number): void {
    for (const bus of Object.keys(this.pools) as AudioBus[]) {
      this.pools[bus] = this.pools[bus].filter((v) => v.endsAt > nowMs);
    }
  }

  request(
    bus: AudioBus,
    id: string,
    priority: number,
    nowMs: number,
    durationMs: number,
  ): { allowed: boolean; stolen?: ActiveBusVoice } {
    this.prune(nowMs);
    const pool = this.pools[bus];
    const cap = this.caps[bus];
    if (pool.length < cap) {
      pool.push({ id, bus, priority, startedAt: nowMs, endsAt: nowMs + Math.max(1, durationMs) });
      return { allowed: true };
    }
    let victimIdx = 0;
    for (let i = 1; i < pool.length; i++) {
      const a = pool[i];
      const b = pool[victimIdx];
      if (a.priority < b.priority || (a.priority === b.priority && a.startedAt < b.startedAt)) {
        victimIdx = i;
      }
    }
    const victim = pool[victimIdx];
    if (victim.priority > priority) {
      return { allowed: false };
    }
    pool.splice(victimIdx, 1);
    pool.push({ id, bus, priority, startedAt: nowMs, endsAt: nowMs + Math.max(1, durationMs) });
    return { allowed: true, stolen: victim };
  }
}

export interface BusVolumes {
  music: number;
  sfx: number;
  ambient: number;
  ui: number;
}

export interface CrossfadeSnapshot {
  outgoingTrackId: string | null;
  incomingTrackId: string;
  progress: number; // 0..1
  outgoingGain: number;
  incomingGain: number;
}

/**
 * Streaming <audio> music director with exploration <-> combat crossfade,
 * hysteresis cooldown, boss phase stingers, hub-to-field transitions,
 * automatic ducking, bus volumes, and mute-on-blur support.
 *
 * Music tracks are ALWAYS streamed via HTMLAudioElement (never decodeAudioData).
 */
export class AdaptiveAudioDirector {
  private readonly cfg: AdaptiveMusicConfig;
  private readonly factory: TrackFactory;
  private readonly busVolumes: BusVolumes = {
    music: 1,
    sfx: 1,
    ambient: 1,
    ui: 1,
  };
  private readonly duckReasons = new Set<DuckReason>();

  private mode: MusicContextMode = 'menu';
  private act = 1;
  private regionIndex = 0;
  private skirmishBiome: string | null = null;
  private bossId: string | null = null;
  private bossPhase: 1 | 2 = 1;
  private lastEnemySeenMs = -1e9;

  private currentTrackId: string | null = null;
  private currentHandle: StreamingTrackHandle | null = null;
  private outgoingTrackId: string | null = null;
  private outgoingHandle: StreamingTrackHandle | null = null;
  private fadeStartMs = 0;
  private fadeProgress = 1;

  private muteOnBlur = true;
  private blurred = false;
  private stingerHistory: string[] = [];

  constructor(config: Partial<AdaptiveMusicConfig> = {}, factory?: TrackFactory) {
    this.cfg = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
    this.factory = factory ?? defaultTrackFactory;
  }

  getMode(): MusicContextMode {
    return this.mode;
  }

  getCurrentTrackId(): string | null {
    return this.currentTrackId;
  }

  getOutgoingTrackId(): string | null {
    return this.outgoingTrackId;
  }

  getStingerHistory(): readonly string[] {
    return this.stingerHistory;
  }

  setBusVolume(bus: AudioBus, volume: number): void {
    this.busVolumes[bus] = Math.max(0, Math.min(1, volume));
    this.applyTrackVolumes();
  }

  getBusVolume(bus: AudioBus): number {
    return this.busVolumes[bus];
  }

  getAllBusVolumes(): Readonly<BusVolumes> {
    return { ...this.busVolumes };
  }

  setDucking(reason: DuckReason, active: boolean): void {
    if (active) this.duckReasons.add(reason);
    else this.duckReasons.delete(reason);
    this.applyTrackVolumes();
  }

  isDucked(): boolean {
    return this.duckReasons.size > 0;
  }

  getDuckMultiplier(): number {
    if (this.duckReasons.has('boss_roar')) return this.cfg.roarDuckGain;
    if (this.duckReasons.has('dialogue') || this.duckReasons.has('cutscene')) return this.cfg.dialogueDuckGain;
    return 1;
  }

  getEffectiveMusicVolume(): number {
    if (this.muteOnBlur && this.blurred) return 0;
    return this.busVolumes.music * this.getDuckMultiplier();
  }

  setMuteOnBlur(enabled: boolean): void {
    this.muteOnBlur = enabled;
    this.applyTrackVolumes();
  }

  isMutedOnBlur(): boolean {
    return this.muteOnBlur;
  }

  handleVisibilityChange(hidden: boolean): void {
    this.blurred = hidden;
    this.applyTrackVolumes();
  }

  attachVisibilityListener(doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>): () => void {
    const onVis = () => this.handleVisibilityChange(Boolean(doc.hidden));
    doc.addEventListener('visibilitychange', onVis);
    onVis();
    return () => doc.removeEventListener('visibilitychange', onVis);
  }

  setMenu(nowMs = 0): void {
    this.mode = 'menu';
    this.skirmishBiome = null;
    this.bossId = null;
    this.crossfadeTo(MUSIC_MENU.mainMenu, true, nowMs);
  }

  setCharSelect(nowMs = 0): void {
    this.mode = 'char_select';
    this.skirmishBiome = null;
    this.bossId = null;
    this.crossfadeTo(MUSIC_MENU.charSelect, true, nowMs);
  }

  transitionFieldToHub(act: number, nowMs = 0): void {
    this.act = act;
    this.mode = 'hub';
    this.skirmishBiome = null;
    this.bossId = null;
    this.crossfadeTo(getMusicForAct(act, 'town'), true, nowMs);
  }

  transitionHubToField(act: number, regionIndex = 0, nowMs = 0): void {
    this.act = act;
    this.regionIndex = regionIndex;
    this.mode = 'explore';
    this.skirmishBiome = null;
    this.bossId = null;
    this.crossfadeTo(getMusicForAct(act, 'explore', regionIndex), true, nowMs);
  }

  startSkirmish(biome: string, nowMs = 0): void {
    this.skirmishBiome = biome;
    this.mode = 'skirmish';
    this.bossId = null;
    this.crossfadeTo(getMusicForSkirmish(biome), true, nowMs);
  }

  triggerBossPhase(bossId: string, phase: 1 | 2 = 1, stingerId?: string, nowMs = 0): void {
    this.bossId = bossId;
    this.bossPhase = phase;
    this.mode = 'boss';
    if (stingerId) {
      this.stingerHistory.push(stingerId);
    }
    this.crossfadeTo(getBossMusic(bossId, phase), true, nowMs);
  }

  /**
   * Updates exploration <-> combat state with hysteresis cooldown.
   * Returns the resolved mode.
   */
  updateCombat(enemyInView: boolean, nowMs: number): MusicContextMode {
    if (this.mode === 'boss' || this.mode === 'hub' || this.mode === 'menu' || this.mode === 'char_select') {
      return this.mode;
    }
    if (enemyInView) {
      this.lastEnemySeenMs = nowMs;
      if (this.mode !== 'battle') {
        this.mode = 'battle';
        const track = this.skirmishBiome
          ? getMusicForAct(0, 'battle')
          : getMusicForAct(this.act, 'battle');
        this.crossfadeTo(track, true, nowMs);
      }
      return this.mode;
    }

    if (this.mode === 'battle' && nowMs - this.lastEnemySeenMs >= this.cfg.hysteresisMs) {
      if (this.skirmishBiome) {
        this.mode = 'skirmish';
        this.crossfadeTo(getMusicForSkirmish(this.skirmishBiome), true, nowMs);
      } else {
        this.mode = 'explore';
        this.crossfadeTo(getMusicForAct(this.act, 'explore', this.regionIndex), true, nowMs);
      }
    }
    return this.mode;
  }

  /**
   * Advances active crossfade by timestamp `nowMs`.
   * Returns a snapshot of current fade gains for testing/inspection.
   */
  tick(nowMs: number): CrossfadeSnapshot | null {
    if (!this.currentTrackId) return null;
    if (this.fadeProgress < 1) {
      const elapsed = Math.max(0, nowMs - this.fadeStartMs);
      this.fadeProgress = this.cfg.fadeDurationMs <= 0 ? 1 : Math.min(1, elapsed / this.cfg.fadeDurationMs);
      this.applyTrackVolumes();
      if (this.fadeProgress >= 1 && this.outgoingHandle) {
        this.outgoingHandle.pause();
        this.outgoingHandle = null;
        this.outgoingTrackId = null;
      }
    }
    const eff = this.getEffectiveMusicVolume();
    return {
      outgoingTrackId: this.outgoingTrackId,
      incomingTrackId: this.currentTrackId,
      progress: this.fadeProgress,
      outgoingGain: (1 - this.fadeProgress) * eff,
      incomingGain: this.fadeProgress * eff,
    };
  }

  private crossfadeTo(trackId: string, loop: boolean, nowMs: number): void {
    if (this.currentTrackId === trackId) return;
    if (this.outgoingHandle) {
      this.outgoingHandle.pause();
    }
    this.outgoingHandle = this.currentHandle;
    this.outgoingTrackId = this.currentTrackId;

    this.currentTrackId = trackId;
    const url = audioAssetPath(trackId, this.cfg.baseUrl);
    const handle = this.factory(url, loop);
    this.currentHandle = handle;
    this.fadeStartMs = nowMs;
    this.fadeProgress = this.outgoingHandle ? 0 : 1;
    this.applyTrackVolumes();
    void Promise.resolve(handle.play()).catch(() => undefined);
  }

  private applyTrackVolumes(): void {
    const eff = this.getEffectiveMusicVolume();
    if (this.currentHandle) {
      this.currentHandle.volume = this.fadeProgress * eff;
    }
    if (this.outgoingHandle) {
      this.outgoingHandle.volume = (1 - this.fadeProgress) * eff;
    }
  }
}
