import { SPELL_CAST_SFX, VoiceLimiter, spatial, type Voice } from './audiologic';
import {
  AdaptiveAudioDirector,
  BusVoiceCap,
  type AudioBus,
  type BusVolumes,
  type CrossfadeSnapshot,
  type DuckReason,
  type MusicContextMode,
  type StreamingTrackHandle,
} from './audio-adaptive';
import {
  ALL_ON_DEMAND_SFX_IDS,
  getBossRoarSfx,
  getMercBarkSfx,
  getMonsterAggroSfx,
  getMonsterDeathSfx,
  getMonsterHitSfx,
  getNpcBarkSfx,
} from './audio-catalog';

/**
 * Web Audio engine: one context, four buses (sfx, ui, music, ambience), a voice limit and pan by screen position.
 * Sound effects are short AAC files decoded once; music is streamed through an <audio> element via AdaptiveAudioDirector so it never sits in memory as PCM.
 * Everything starts from a real user gesture (`unlock`). A silent media workaround needs real iOS verification.
 */
const SHOP_ENTRY_CUE = 'ledger_latch_01';
const SHOP_ENTRY_WINDOW_MS = 750;
const SFX_NAMES = [
  'hit', 'miss', 'death', 'bow', 'gold', 'nomana', 'cast_fire', 'cast_water', 'cast_air', 'cast_earth', 'cast_astral',
  'boom', 'heal', 'buff', 'curse', 'revive', 'click', 'step1', 'step2', SHOP_ENTRY_CUE, 'select_hero',
  'loot_normal', 'loot_magic', 'loot_rare', 'loot_set', 'loot_unique', 'rune_reveal',
  'spell_meteor', 'spell_inferno', 'spell_blizzard', 'spell_thunderstorm',
  'spell_iron_skin', 'spell_acid_rain', 'spell_mana_burn', 'spell_time_warp',
  'hit_sword_1', 'hit_sword_2', 'hit_sword_3', 'swing_sword_1', 'swing_sword_2',
  'hit_axe_1', 'hit_axe_2', 'hit_axe_3', 'swing_axe_1',
  'hit_blunt_1', 'hit_blunt_2', 'hit_blunt_3',
  'hit_pierce_1', 'hit_pierce_2', 'hit_dagger_1',
  'block_shield_1', 'block_shield_2',
  'armor_leather', 'armor_plate',
  'potion_drink_1', 'potion_drink_2',
  'step_grass_1', 'step_grass_2', 'step_grass_3',
  'step_dirt_1', 'step_dirt_2', 'step_dirt_3',
  'step_water_1', 'step_water_2',
  'step_stone_1', 'step_stone_2',
  'death_beast_1', 'death_skeleton_1',
  ...SPELL_CAST_SFX,
  'ui_button_click', 'ui_trade_buy', 'ui_trade_sell', 'ui_inv_pick', 'ui_inv_equip', 'ui_inv_drop', 'sfx_quest_accept', 'sfx_quest_complete', 'sfx_level_up',
];
const ON_DEMAND_SFX = new Set<string>(ALL_ON_DEMAND_SFX_IDS);
const CORE_SFX_SET = new Set<string>([...SFX_NAMES, 'ambience']);
const MAX_ON_DEMAND_BUFFERS = 48;
const base = (): string => import.meta.env.BASE_URL ?? '/thornvael/';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let uiBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let ambBus: GainNode | null = null;
let silent: HTMLAudioElement | null = null;
const buffers = new Map<string, AudioBuffer>();
const onDemandOrder: string[] = [];
const pendingBuffers = new Map<string, Promise<void>>();
const running = new Map<Voice, AudioBufferSourceNode>();
let limiter = new VoiceLimiter();
let busVoiceCap = new BusVoiceCap();
let backgrounded = false;
let generation = 0;
let resuming: Promise<void> | null = null;
let suspending: Promise<void> | null = null;
let loading: Promise<void> | null = null;
export type MusicMode = 'explore' | 'battle' | 'town';
export type SpatialPoint = { x: number; y: number; w: number; h: number };
let sfxOn = true;
let musicWanted = false;
let musicMode: MusicMode = 'explore';
let ambSource: AudioBufferSourceNode | null = null;
let ambWanted = true;
let played = 0;
let pendingShopEntry: { deadline: number } | null = null;

let masterVol = 1.0;
let sfxVol = 1.0;
let uiVol = 1.0;
let musicVol = 1.0;
let ambVol = 1.0;
let muteOnBlurPref = true;
let voiceActingPref = true;
let windowBlurred = false;

try {
  const mv = localStorage.getItem('thornvael.masterVol');
  if (mv !== null) masterVol = parseFloat(mv) || 0;
  const sv = localStorage.getItem('thornvael.sfxVol');
  if (sv !== null) sfxVol = parseFloat(sv) || 0;
  const uv = localStorage.getItem('thornvael.uiVol');
  if (uv !== null) uiVol = parseFloat(uv) || 0;
  const muv = localStorage.getItem('thornvael.musicVol');
  if (muv !== null) musicVol = parseFloat(muv) || 0;
  const av = localStorage.getItem('thornvael.ambVol');
  if (av !== null) ambVol = parseFloat(av) || 0;
  const vo = localStorage.getItem('thornvael.voiceActing');
  if (vo !== null) voiceActingPref = vo !== 'false';
  const mob = localStorage.getItem('thornvael.muteOnBlur');
  if (mob !== null) muteOnBlurPref = mob !== 'false';
} catch { /* storage denied */ }

interface LiveTrackHandle extends StreamingTrackHandle {
  el: HTMLAudioElement;
  gain: GainNode | null;
  sourceNode: MediaElementAudioSourceNode | null;
}

let crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
let stopMusicTimer: ReturnType<typeof setTimeout> | null = null;
let roarDuckTimer: ReturnType<typeof setTimeout> | null = null;
let dialogueDuckTimer: ReturnType<typeof setTimeout> | null = null;
let shopDuckTimer: ReturnType<typeof setTimeout> | null = null;
let lastCombatEventMs = -1e9;
let activeNearbyEnemyCount = 0;
let pageUnloading = false;
const inFlightFetches = new Set<AbortController>();
let unloadListenersAttached = false;

function ensureUnloadAbortListeners(): void {
  if (unloadListenersAttached || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  unloadListenersAttached = true;
  const abortAll = (): void => {
    pageUnloading = true;
    for (const ac of inFlightFetches) {
      try { ac.abort(); } catch { /* ignore */ }
    }
    inFlightFetches.clear();
  };
  window.addEventListener('pagehide', abortAll);
  window.addEventListener('beforeunload', abortAll);
  window.addEventListener('pageshow', () => { pageUnloading = false; });
}

function createLiveTrackHandle(url: string, loop: boolean): LiveTrackHandle {
  const el = new Audio(url);
  el.loop = loop;
  el.preload = 'auto';
  try {
    if (typeof location !== 'undefined' && /^https?:\/\//i.test(url) && new URL(url, location.href).origin !== location.origin) {
      el.crossOrigin = 'anonymous';
    }
  } catch { /* ignore invalid URL */ }
  // Prevent unhandled media load errors on iOS Safari when offline or missing track.
  if (typeof el.addEventListener === 'function') {
    el.addEventListener('error', () => { /* silent offline/missing media fallback */ });
  }
  let gain: GainNode | null = null;
  let sourceNode: MediaElementAudioSourceNode | null = null;
  if (ctx && ctx.state !== 'closed' && musicBus) {
    try {
      // Routing through a gain node gives volume control on iOS, where <audio>.volume is read-only.
      sourceNode = ctx.createMediaElementSource(el);
      gain = ctx.createGain();
      gain.gain.value = 0;
      sourceNode.connect(gain).connect(musicBus);
    } catch {
      el.volume = 0;
    }
  } else {
    el.volume = 0;
  }
  let trackVolume = 0;
  const handle: LiveTrackHandle = {
    el,
    gain,
    sourceNode,
    get src() { return el.src; },
    get loop() { return el.loop; },
    set loop(v: boolean) { el.loop = v; },
    get volume() { return trackVolume; },
    set volume(v: number) {
      const clamped = Math.max(0, Math.min(1, v));
      trackVolume = clamped;
      if (gain && ctx && ctx.state !== 'closed') {
        gain.gain.setValueAtTime(clamped, ctx.currentTime);
      } else {
        el.volume = clamped;
      }
    },
    get paused() { return el.paused; },
    play() {
      if (backgrounded || !musicWanted) return Promise.resolve();
      try {
        return Promise.resolve(el.play()).then(() => {
          if (backgrounded || !musicWanted || (director.getActiveHandle() !== handle && director.getOutgoingHandle() !== handle)) {
            try { el.pause(); } catch { /* ignore */ }
          }
        }).catch(() => undefined);
      } catch {
        return Promise.resolve();
      }
    },
    pause() {
      try { el.pause(); } catch { /* ignore */ }
    },
    dispose() {
      try { el.pause(); } catch { /* ignore */ }
      try { sourceNode?.disconnect(); } catch { /* ignore */ }
      try { gain?.disconnect(); } catch { /* ignore */ }
    },
    applyTrackFade(fadeGain: number, effectiveMusicVolume: number) {
      trackVolume = Math.max(0, Math.min(1, fadeGain * effectiveMusicVolume));
      syncMusicBusGain();
      if (gain && ctx && ctx.state !== 'closed') {
        gain.gain.setValueAtTime(Math.max(0, Math.min(1, fadeGain)), ctx.currentTime);
      } else {
        el.volume = trackVolume;
      }
    },
  };
  return handle;
}

/** Dynamic combat crossfade transition duration in milliseconds (1.5 - 2.0s). */
export const COMBAT_CROSSFADE_DURATION_MS = 1600;

/** Cooldown hysteresis in milliseconds before fading from battle back to exploration (4+ seconds). */
export const COMBAT_HYSTERESIS_MS = 4000;

/** Dialog and town shop ducking in decibels (-14 dB) to ensure voice clarity. */
export const DIALOGUE_SHOP_DUCK_DB = -14;

/** Linear gain multiplier corresponding to -14 dB: 10^(-14/20) ≈ 0.199526. */
export const DIALOGUE_SHOP_DUCK_GAIN = Math.pow(10, DIALOGUE_SHOP_DUCK_DB / 20);

/** Boss roar ducking multiplier: 0.25 (-12 dB) for dramatic impact. */
export const BOSS_ROAR_DUCK_GAIN = 0.25;

const director = new AdaptiveAudioDirector(
  {
    baseUrl: base(),
    initialAct: 0,
    fadeDurationMs: COMBAT_CROSSFADE_DURATION_MS,
    hysteresisMs: COMBAT_HYSTERESIS_MS,
    dialogueDuckGain: DIALOGUE_SHOP_DUCK_GAIN,
    roarDuckGain: BOSS_ROAR_DUCK_GAIN,
  },
  createLiveTrackHandle,
);
director.setBusVolume('music', musicVol);
director.setBusVolume('sfx', sfxVol);
director.setBusVolume('ambient', ambVol);
director.setBusVolume('ui', uiVol);
director.setMuteOnBlur(muteOnBlurPref);

function syncMasterGain(): void {
  if (!master || !ctx || ctx.state === 'closed') return;
  const mutedByBlur = muteOnBlurPref && windowBlurred;
  master.gain.setValueAtTime(mutedByBlur ? 0 : masterVol * 0.9, ctx.currentTime);
}

function syncMusicBusGain(): void {
  if (!musicBus || !ctx || ctx.state === 'closed') return;
  musicBus.gain.setValueAtTime(0.32 * director.getEffectiveMusicVolume(), ctx.currentTime);
}

function silentWavUrl(): string {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof Blob === 'undefined') {
    return '';
  }
  try {
    const n = 800;
    const b = new Uint8Array(44 + n * 2);
    const v = new DataView(b.buffer);
    const str = (o: number, s: string): void => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    v.setUint32(4, 36 + n * 2, true);
    str(8, 'WAVEfmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true);
    v.setUint32(28, 16000, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    str(36, 'data');
    v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
  } catch {
    return '';
  }
}

function recordDecodedBuffer(name: string, buffer: AudioBuffer): void {
  buffers.set(name, buffer);
  if (CORE_SFX_SET.has(name)) return;
  const idx = onDemandOrder.indexOf(name);
  if (idx !== -1) onDemandOrder.splice(idx, 1);
  onDemandOrder.push(name);
  while (onDemandOrder.length > MAX_ON_DEMAND_BUFFERS) {
    const oldest = onDemandOrder.shift();
    if (oldest !== undefined) buffers.delete(oldest);
  }
}

/** Evicts cached non-core on-demand SFX and biome ambience beds to bound decoded PCM memory. */
export function unloadOnDemandAudio(): number {
  let evicted = 0;
  while (onDemandOrder.length > 0) {
    const key = onDemandOrder.shift()!;
    if (buffers.delete(key)) evicted++;
  }
  return evicted;
}

function loadBuffer(name: string): Promise<void> {
  if (!ctx || buffers.has(name) || pageUnloading) return Promise.resolve();
  const pending = pendingBuffers.get(name);
  if (pending) return pending;
  ensureUnloadAbortListeners();
  const context = ctx;
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  if (ac) inFlightFetches.add(ac);
  const task = (async () => {
    try {
      // A distinct URL keeps existing chapter caches from serving the previous bow cue.
      const file = name === 'bow' ? 'yew_release_01' : name;
      const url = `${base()}audio/${file}.m4a`;
      const res = await (ac ? fetch(url, { signal: ac.signal }) : fetch(url));
      if (res.ok === false) return;
      const data = await res.arrayBuffer();
      if (ctx !== context || context.state === 'closed') return;
      const buffer = await context.decodeAudioData(data);
      if (ctx === context && (context.state as string) !== 'closed') recordDecodedBuffer(name, buffer);
    } catch {
      // a missing, offline, or undecodable file only loses that sound
    } finally {
      if (ac) inFlightFetches.delete(ac);
    }
  })().finally(() => { if (pendingBuffers.get(name) === task) pendingBuffers.delete(name); });
  pendingBuffers.set(name, task);
  return task;
}

function canAutoUnlock(): boolean {
  if (ctx && ctx.state !== 'closed') return true;
  if (typeof navigator === 'undefined') return false;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean; isActive?: boolean } }).userActivation;
  if (ua) return Boolean(ua.hasBeenActive || ua.isActive);
  return true;
}

export function isAudioRunning(): boolean {
  return Boolean(ctx && ctx.state === 'running');
}

export function isMusicPlaying(): boolean {
  const h = director.getActiveHandle();
  return Boolean(musicWanted && ctx && ctx.state === 'running' && h && !h.paused);
}

/** Call from a real user gesture. Safe to call repeatedly. */
export function unlock(): void {
  if (backgrounded) return;
  if (ctx?.state === 'closed') {
    // MediaElementSourceNodes belong to their original context: rebuild their elements too.
    generation++;
    stopAmbience();
    stopTownAmbience();
    clearCrossfadeTimer();
    clearStopMusicTimer();
    for (const source of running.values()) { try { source.stop(); } catch { /* ended */ } }
    running.clear();
    limiter = new VoiceLimiter();
    busVoiceCap = new BusVoiceCap();
    director.resetHandles();
    silent?.pause();
    if (silent) {
      try { if (silent.src) URL.revokeObjectURL(silent.src); } catch { /* ignore */ }
    }
    silent = null;
    buffers.clear();
    onDemandOrder.length = 0;
    pendingBuffers.clear();
    loading = null;
    resuming = suspending = null;
    ctx = null;
    master = sfxBus = uiBus = musicBus = ambBus = null;
  }
  if (!ctx) {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = (muteOnBlurPref && windowBlurred) ? 0 : 0.9 * masterVol;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.8 * sfxVol;
    sfxBus.connect(master);
    uiBus = ctx.createGain();
    uiBus.gain.value = 0.85 * uiVol;
    uiBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.32 * director.getEffectiveMusicVolume();
    musicBus.connect(master);
    ambBus = ctx.createGain();
    ambBus.gain.value = 0.22 * ambVol;
    ambBus.connect(master);
    // Retain the existing iOS silent-media workaround; device behavior is not assumed.
    const silentUrl = silentWavUrl();
    silent = new Audio(silentUrl);
    silent.loop = true;
    // Short buffer through the context inside the gesture: the iOS unlock trick.
    try {
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      // ignore unlock pulse error
    }
    const context = ctx;
    loading = Promise.all(SFX_NAMES.map(loadBuffer))
      .then(() => { if (ctx === context) startAmbience(); })
      .catch(() => undefined);
    attachDefaultBlurListeners();
  }
  restorePlayback();
  requestResume();
}

let ambBed: string | null = null;
let ambEventTimer: ReturnType<typeof setTimeout> | null = null;
const AMB_ACT_BED = ['river_ford', 'redmarsh_swamp', 'harbor', 'forge_ironcamp'];
const AMB_TOWN_BED = ['town_thornwick', 'town_redmarsh', 'town_oakhaven', 'forge_ironcamp'];
/** Pick the pack 6a ambience bed for an act (1 to 4), or its town bed; 0 keeps the generic bed. */
export function setAmbienceAct(act: number, town = false): void {
  const bed = act >= 1 && act <= 4 ? 'amb_' + (town ? AMB_TOWN_BED : AMB_ACT_BED)[act - 1] : null;
  if (bed === ambBed) return;
  const prevBed = ambBed;
  ambBed = bed;
  stopAmbience();
  if (prevBed) {
    buffers.delete(prevBed);
    buffers.delete(`${prevBed}_ev0`);
  }
  startAmbience();
}
function scheduleAmbEvent(context: AudioContext, bed: string): void {
  const wait = 6000 + Math.random() * 12000;
  ambEventTimer = setTimeout(() => {
    ambEventTimer = null;
    if (ctx !== context || ambBed !== bed || !ambWanted || backgrounded || context.state !== 'running') return;
    const name = bed + '_ev0';
    void loadBuffer(name).then(() => {
      const b = buffers.get(name);
      if (!b || ctx !== context || ambBed !== bed || !ambBus || backgrounded) return;
      const src = context.createBufferSource();
      src.buffer = b;
      let node: AudioNode = src;
      if (typeof context.createStereoPanner === 'function') {
        const p = context.createStereoPanner();
        p.pan.value = Math.random() * 1.6 - 0.8;
        src.connect(p);
        node = p;
      }
      node.connect(ambBus);
      try { src.start(); } catch { /* ignore */ }
    }).catch(() => undefined).finally(() => { if (ctx === context && ambBed === bed) scheduleAmbEvent(context, bed); });
  }, wait);
}

function stopAmbience(): void {
  try { ambSource?.stop(); } catch { /* already stopped */ }
  try { ambSource?.disconnect(); } catch { /* ignore */ }
  ambSource = null;
  if (ambEventTimer) { clearTimeout(ambEventTimer); ambEventTimer = null; }
}

function playMedia(el: HTMLAudioElement, wanted: () => boolean): void {
  if (backgrounded || !wanted()) return;
  try {
    void Promise.resolve(el.play()).then(() => {
      if (backgrounded || !wanted()) {
        try { el.pause(); } catch { /* ignore */ }
      }
    }).catch(() => undefined);
  } catch {
    // iOS Safari / offline may throw synchronously on play()
  }
}

function restorePlayback(): void {
  if (!ctx || ctx.state === 'closed' || backgrounded) return;
  if (silent) {
    const current = silent;
    playMedia(current, () => silent === current);
  }
  if (musicWanted) {
    clearStopMusicTimer();
    if (director.getActiveHandle()) {
      director.resumeCurrent();
    } else if (specialFile) {
      director.setSpecialTrack(specialFile, specialLoop, Date.now());
    } else {
      director.setModeWithAct(musicMode === 'town' ? 'hub' : musicMode, musicAct, director.getRegionIndex(), Date.now());
    }
    syncMusicBusGain();
    scheduleCrossfadeTick();
  }
  startAmbience();
}

function requestResume(): void {
  const context = ctx;
  if (!context || backgrounded || context.state === 'closed' || resuming || suspending) return;
  if (context.state === 'running') return;
  const attempt = context.resume().then(() => {
    if (ctx !== context) return;
    if (backgrounded) suspendAudio();
    else if (context.state === 'running') restorePlayback();
    // Interrupted/rejected contexts remain retryable on the next gesture; never close them here.
  }).catch(() => undefined).finally(() => { if (resuming === attempt) resuming = null; });
  resuming = attempt;
}

function startAmbience(): void {
  if (!ctx || ctx.state !== 'running' || backgrounded || !ambBus || !ambWanted || ambSource) return;
  const context = ctx;
  const epoch = generation;
  const bed = ambBed ?? 'ambience';
  void loadBuffer(bed).then(() => {
    const b = buffers.get(bed);
    if (ctx !== context || generation !== epoch || backgrounded || context.state !== 'running' || !ambBus || !b || ambSource || !ambWanted) return;
    ambSource = ctx.createBufferSource();
    ambSource.buffer = b;
    ambSource.loop = true;
    ambSource.connect(ambBus);
    try {
      ambSource.start();
    } catch {
      ambSource = null;
      return;
    }
    if (ambBed && !ambEventTimer) scheduleAmbEvent(context, ambBed);
  }).catch(() => undefined);
}

export function setAmbience(on: boolean): void {
  ambWanted = on;
  generation++;
  if (!on) {
    stopAmbience();
  } else startAmbience();
}

function playDecodedBuffer(name: string, b: AudioBuffer, priority: number, at?: SpatialPoint): void {
  if (!ctx || !sfxBus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  let gain = 1;
  let pan = 0;
  if (at) {
    const s = spatial(at.x, at.y, at.w, at.h);
    gain = s.gain;
    pan = s.pan;
    if (gain <= 0.02) return;
  }
  const now = performance.now();
  const r = limiter.request(name, priority, now, b.duration * 1000);
  if (r.action === 'skip') return;
  const isUi =
    name.startsWith('ui_') ||
    name.startsWith('sfx_quest') ||
    name === 'click' ||
    name === 'select_hero' ||
    name === SHOP_ENTRY_CUE ||
    (name.startsWith('bark_') && !name.startsWith('bark_merc_'));
  const busKind: AudioBus = isUi ? 'ui' : 'sfx';
  busVoiceCap.request(busKind, name, priority, now, b.duration * 1000);
  if (r.action === 'steal' && r.victim) {
    const src = running.get(r.victim);
    try {
      src?.stop();
    } catch {
      // already ended
    }
    running.delete(r.victim);
  }
  const src = ctx.createBufferSource();
  src.buffer = b;
  const g = ctx.createGain();
  g.gain.value = gain;
  let node: AudioNode = g;
  src.connect(g);
  if (typeof ctx.createStereoPanner === 'function' && pan !== 0) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    node = p;
  }
  const destBus = (isUi && uiBus) ? uiBus : sfxBus;
  node.connect(destBus);
  if (r.voice) {
    const v = r.voice;
    running.set(v, src);
    src.onended = () => running.delete(v);
  }
  try {
    src.start();
    played++;
  } catch {
    if (r.voice) running.delete(r.voice);
  }
}

/** Play a sound effect. `x`, `y` is the screen point of the source (omit for UI sounds); w, h the view size. */
export function play(name: string, priority = 1, at?: SpatialPoint): void {
  if (!ctx || !sfxBus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  const b = buffers.get(name);
  if (!b) {
    if (ON_DEMAND_SFX.has(name)) {
      const context = ctx;
      void loadBuffer(name).then(() => {
        const loaded = buffers.get(name);
        if (loaded && ctx === context && sfxOn && !backgrounded && ctx.state === 'running') {
          playDecodedBuffer(name, loaded, priority, at);
        }
      }).catch(() => undefined);
      return;
    }
    // Visceral synthesized dark fantasy combat sound effects fallback
    if (name.startsWith('shield_block') || name === 'block') {
      playShieldBlock();
      return;
    }
    if (name === 'hit' || name.startsWith('hit_') || name === 'flesh_hit') {
      playFleshHit();
      return;
    }
    if (name === 'gold' || name === 'pickup_gold') {
      playGoldPickup();
      return;
    }
    if (name.startsWith('death') || name === 'monster_death') {
      playMonsterDeath();
      return;
    }
    if (name.startsWith('potion_drink') || name === 'potion_gulp') {
      playPotionGulp();
      return;
    }
    if (name.startsWith('step_') || name.startsWith('step')) {
      if (name.includes('water')) {
        playSurfaceFootstep('water', at);
        return;
      }
      if (name.includes('stone') || name.includes('rock')) {
        playSurfaceFootstep('stone', at);
        return;
      }
      if (name.includes('wood') || name.includes('bridge')) {
        playSurfaceFootstep('wood', at);
        return;
      }
      if (name.includes('dirt') || name.includes('mud')) {
        playSurfaceFootstep('mud', at);
        return;
      }
      playSurfaceFootstep('grass', at);
      return;
    }
    return;
  }
  playDecodedBuffer(name, b, priority, at);
}

/** Play once when the first gesture has unlocked audio and decoded the shop cue. Slightly ducks music (-4dB) for shop clarity. */
export function playShopEntry(duckMs = 3500): void {
  cancelShopEntry();
  if (duckMs > 0) {
    setShopDucking(true);
    if (shopDuckTimer !== null) clearTimeout(shopDuckTimer);
    shopDuckTimer = setTimeout(() => {
      shopDuckTimer = null;
      setShopDucking(false);
    }, duckMs);
  }
  const context = ctx;
  if (!context || !sfxOn || backgrounded) return;
  if (!suspending && context.state === 'running' && buffers.has(SHOP_ENTRY_CUE)) {
    play(SHOP_ENTRY_CUE, 5);
    return;
  }

  const request = { deadline: performance.now() + SHOP_ENTRY_WINDOW_MS };
  pendingShopEntry = request;
  requestResume();
  // The suspend finalizer starts the foreground resume before this continuation runs.
  const ready = (suspending ? suspending.then(() => resuming) : resuming) ?? Promise.resolve();
  void Promise.all([loadBuffer(SHOP_ENTRY_CUE), ready]).then(() => {
    if (pendingShopEntry !== request) return;
    pendingShopEntry = null;
    if (ctx === context && performance.now() < request.deadline) play(SHOP_ENTRY_CUE, 5);
  }).catch(() => undefined);
}

export function cancelShopEntry(): void {
  pendingShopEntry = null;
  if (shopDuckTimer !== null) {
    clearTimeout(shopDuckTimer);
    shopDuckTimer = null;
    setShopDucking(false);
  }
}

/** The UI click. */
export function blip(): void {
  unlock();
  play('ui_button_click', 5);
}

export function setSfx(on: boolean): void {
  sfxOn = on;
  if (!on) cancelShopEntry();
}

/** Rustle grab sound for dragging/picking up items. */
export function playPickupRustle(): void {
  unlock();
  const bus = uiBus ?? sfxBus;
  if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.08);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.08);
    filter.Q.value = 2.0;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32 * uiVol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    noise.start(now);
  } catch {
    // silent fallback
  }
}

/** Equip leather/metal placement sound. */
export function playEquipSfx(isMetal = true): void {
  unlock();
  const bus = uiBus ?? sfxBus;
  if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    if (isMetal) {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1600, now);
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(2400, now);
      osc2.frequency.exponentialRampToValueAtTime(1200, now + 0.08);

      gain.gain.setValueAtTime(0.38 * uiVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(bus);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.18);
      osc2.stop(now + 0.18);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);

      gain.gain.setValueAtTime(0.32 * uiVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(bus);
      osc.start(now);
      osc.stop(now + 0.12);
    }
  } catch {
    // silent fallback
  }
}

/** Procedural cue: Not enough mana (arcane fizzle / sputter). */
export function playNotEnoughMana(): void {
  unlock();
  const bus = uiBus ?? sfxBus;
  if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.16);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.16);
    gain.gain.setValueAtTime(0.28 * uiVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + 0.16);
  } catch {
    // silent fallback
  }
}

/** Procedural cue: Inventory full (heavy leather thud). */
export function playInventoryFull(): void {
  unlock();
  const bus = uiBus ?? sfxBus;
  if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.14);
    gain.gain.setValueAtTime(0.35 * uiVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + 0.14);
  } catch {
    // silent fallback
  }
}

/** Procedural cue: Low HP heartbeat (sub-bass lub-dub pulse). */
export function playLowHpHeartbeat(): void {
  if (canAutoUnlock()) unlock();
  const bus = sfxBus ?? uiBus;
  if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    // Lub (first pulse)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(62, now);
    osc1.frequency.exponentialRampToValueAtTime(42, now + 0.12);
    gain1.gain.setValueAtTime(0.42 * sfxVol, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(bus);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // Dub (second slightly quieter pulse)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(54, now + 0.14);
    osc2.frequency.exponentialRampToValueAtTime(36, now + 0.28);
    gain2.gain.setValueAtTime(0.32 * sfxVol, now + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc2.connect(gain2);
    gain2.connect(bus);
    osc2.start(now + 0.14);
    osc2.stop(now + 0.28);
  } catch {
    // silent fallback
  }
}

/**
 * Procedural cue: Dramatic dialogue speaker shift thrill ("тръпка").
 * Resonant, deep cinematic audio cue: low atmospheric sub-bass shudder paired with
 * a dark resonant iron bell / bass pulse when the speaker changes or enters.
 */
export function playSpeakerSwitchThrill(): void {
  if (canAutoUnlock()) unlock();
  const bus = uiBus ?? sfxBus;
  if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;

    // Sub-bass atmospheric shudder (rumble)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    const subFilter = ctx.createBiquadFilter();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(68, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.45);

    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(140, now);
    subFilter.frequency.exponentialRampToValueAtTime(50, now + 0.45);

    subGain.gain.setValueAtTime(0.48 * uiVol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    subOsc.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(bus);
    subOsc.start(now);
    subOsc.stop(now + 0.48);

    // Resonant dark metallic bell / gong chime (F3 174.6 Hz + C4 261.6 Hz harmonic)
    const bellOsc1 = ctx.createOscillator();
    const bellOsc2 = ctx.createOscillator();
    const bellFilter = ctx.createBiquadFilter();
    const bellGain = ctx.createGain();

    bellOsc1.type = 'triangle';
    bellOsc1.frequency.setValueAtTime(174.6, now);
    bellOsc1.frequency.exponentialRampToValueAtTime(164, now + 0.55);

    bellOsc2.type = 'sine';
    bellOsc2.frequency.setValueAtTime(261.6, now);
    bellOsc2.frequency.exponentialRampToValueAtTime(245, now + 0.55);

    bellFilter.type = 'bandpass';
    bellFilter.frequency.setValueAtTime(220, now);
    bellFilter.Q.value = 3.5;

    bellGain.gain.setValueAtTime(0.38 * uiVol, now);
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    bellOsc1.connect(bellFilter);
    bellOsc2.connect(bellFilter);
    bellFilter.connect(bellGain);
    bellGain.connect(bus);

    bellOsc1.start(now);
    bellOsc2.start(now);
    bellOsc1.stop(now + 0.55);
    bellOsc2.stop(now + 0.55);
  } catch {
    // silent fallback
  }
}

/** Distinct procedural trader speech barks & tones. */
export type TraderRole = 'blacksmith' | 'barkeep' | 'alchemist' | 'guildmaster';
export type TraderEvent = 'greet' | 'farewell' | 'buy';

export function playTraderBark(trader: TraderRole, event: TraderEvent): void {
  unlock();
  const bus = uiBus ?? sfxBus;
  if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  if (event === 'greet') {
    playNpcBark(trader);
  }
  try {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(bus);

    if (trader === 'blacksmith') {
      // Deep gruff vocal formant + multi-frequency resonant iron/anvil strikes
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const f0 = event === 'greet' ? 120 : event === 'buy' ? 140 : 100;
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.85, now + 0.22);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(450, now);
      filter.Q.value = 3.5;

      gain.gain.setValueAtTime(0.30 * uiVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(filter);
      filter.connect(gain);
      osc.start(now);
      osc.stop(now + 0.25);

      // Multi-frequency resonant iron / anvil strikes
      const strikeFreqs = event === 'buy' ? [1760, 2480, 880] : [1240, 1960, 620];
      for (let k = 0; k < strikeFreqs.length; k++) {
        const anvil = ctx.createOscillator();
        const anvilGain = ctx.createGain();
        anvil.type = k === 0 ? 'sine' : 'triangle';
        const freq = strikeFreqs[k];
        anvil.frequency.setValueAtTime(freq, now + 0.04);
        anvil.frequency.exponentialRampToValueAtTime(freq * 0.98, now + 0.38);
        const amp = (0.24 / (k + 1)) * uiVol;
        anvilGain.gain.setValueAtTime(amp, now + 0.04);
        anvilGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38 + k * 0.05);
        anvil.connect(anvilGain);
        anvilGain.connect(bus);
        anvil.start(now + 0.04);
        anvil.stop(now + 0.45);
      }

    } else if (trader === 'barkeep') {
      // Heavy wooden mug thud + warm tavern polyphony
      const thud = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(120, now);
      thud.frequency.exponentialRampToValueAtTime(45, now + 0.12);
      thudGain.gain.setValueAtTime(0.38 * uiVol, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      thud.connect(thudGain);
      thudGain.connect(bus);
      thud.start(now);
      thud.stop(now + 0.15);

      const chords = event === 'greet'
        ? [130.8, 164.8, 196.0, 261.6] // C major warm triad + octave
        : event === 'buy'
        ? [146.8, 174.6, 220.0, 293.7] // D minor warm triad + octave
        : [110.0, 138.6, 164.8, 220.0]; // A minor warm triad + octave
      gain.gain.setValueAtTime(0.22 * uiVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

      for (const freq of chords) {
        const hOsc = ctx.createOscillator();
        hOsc.type = 'triangle';
        hOsc.frequency.setValueAtTime(freq, now + 0.02);
        hOsc.connect(gain);
        hOsc.start(now + 0.02);
        hOsc.stop(now + 0.36);
      }

    } else if (trader === 'alchemist') {
      // Glass bubbling and mystical harmonic shimmer
      const bubbleCount = 4;
      for (let b = 0; b < bubbleCount; b++) {
        const bStart = now + b * 0.055;
        const bOsc = ctx.createOscillator();
        const bGain = ctx.createGain();
        bOsc.type = 'sine';
        const bF = 750 + b * 140 + Math.random() * 80;
        bOsc.frequency.setValueAtTime(bF, bStart);
        bOsc.frequency.exponentialRampToValueAtTime(bF * 1.45, bStart + 0.045);
        bGain.gain.setValueAtTime(0.16 * uiVol, bStart);
        bGain.gain.exponentialRampToValueAtTime(0.0001, bStart + 0.048);
        bOsc.connect(bGain);
        bGain.connect(bus);
        bOsc.start(bStart);
        bOsc.stop(bStart + 0.05);
      }

      const shimmerFreqs = event === 'greet' ? [880, 1320, 1760] : event === 'buy' ? [660, 990, 1485] : [1175, 1760, 2350];
      for (let s = 0; s < shimmerFreqs.length; s++) {
        const sOsc = ctx.createOscillator();
        const sGain = ctx.createGain();
        sOsc.type = 'sine';
        const sf = shimmerFreqs[s];
        sOsc.frequency.setValueAtTime(sf, now + 0.08);
        sOsc.frequency.exponentialRampToValueAtTime(sf * 1.15, now + 0.38);

        const vib = ctx.createOscillator();
        const vibG = ctx.createGain();
        vib.frequency.value = 14;
        vibG.gain.value = 18;
        vib.connect(sOsc.frequency);
        vib.start(now + 0.08);
        vib.stop(now + 0.38);

        sGain.gain.setValueAtTime((0.18 / (s + 1)) * uiVol, now + 0.08);
        sGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
        sOsc.connect(sGain);
        sGain.connect(bus);
        sOsc.start(now + 0.08);
        sOsc.stop(now + 0.38);
      }

    } else {
      // Guildmaster: Regal fanfare brass flourish
      const freqs = event === 'greet' ? [220, 330] : event === 'buy' ? [330, 440] : [220, 165];
      gain.gain.setValueAtTime(0.28 * uiVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      for (const f of freqs) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now);
        const ftr = ctx.createBiquadFilter();
        ftr.type = 'lowpass';
        ftr.frequency.setValueAtTime(900, now);
        osc.connect(ftr);
        ftr.connect(gain);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    }
  } catch {
    // silent fallback
  }
}

/** Town hub environmental audio layers. */
let activeTownHubInterval: number | null = null;

export type BiomeAmbience = 'act1_marsh' | 'act2_desert' | 'act3_cavern' | 'act4_hell';
export type TownHub = 'blacksmith' | 'tavern' | 'forest' | 'dungeon' | 'town' | BiomeAmbience;

let currentTownHubLocation: TownHub | null = null;
let suspendedTownHub: TownHub | null = null;
let currentBiome: BiomeAmbience | null = null;

export function stopTownAmbience(): void {
  if (activeTownHubInterval !== null) {
    clearInterval(activeTownHubInterval);
    activeTownHubInterval = null;
  }
  currentTownHubLocation = null;
}

export function playTownAmbience(hub: TownHub | null): void {
  stopTownAmbience();
  currentTownHubLocation = hub;
  if (!hub || !sfxOn || backgrounded) return;

  const triggerSound = () => {
    const bus = ambBus ?? sfxBus;
    if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      if (hub === 'blacksmith') {
        // Distant anvil clink: multi-frequency resonant iron/anvil strike
        const anvil = ctx.createOscillator();
        const gain = ctx.createGain();
        anvil.type = 'sine';
        anvil.frequency.setValueAtTime(1480 + (Math.random() * 200 - 100), now);
        gain.gain.setValueAtTime(0.14 * ambVol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        anvil.connect(gain);
        gain.connect(bus);
        anvil.start(now);
        anvil.stop(now + 0.5);
      } else if (hub === 'tavern') {
        // Hearth fire pop / crackle
        const bufferSize = Math.floor(ctx.sampleRate * 0.04);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
        const pop = ctx.createBufferSource();
        pop.buffer = buffer;
        const ftr = ctx.createBiquadFilter();
        ftr.type = 'bandpass';
        ftr.frequency.value = 1200 + Math.random() * 800;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.10 * ambVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        pop.connect(ftr);
        ftr.connect(gain);
        gain.connect(bus);
        pop.start(now);
      } else if (hub === 'dungeon' || hub === 'act3_cavern') {
        // Dense subterranean cavern: echoing water drops + deep rumblings
        const drop = ctx.createOscillator();
        const gain = ctx.createGain();
        const f = 1200 + Math.random() * 400;
        drop.frequency.setValueAtTime(f, now);
        drop.frequency.exponentialRampToValueAtTime(f * 1.4, now + 0.05);
        gain.gain.setValueAtTime(0.12 * ambVol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        drop.connect(gain);
        gain.connect(bus);
        drop.start(now);
        drop.stop(now + 0.28);

        // Echoing reflection
        const echo = ctx.createOscillator();
        const echoGain = ctx.createGain();
        echo.frequency.setValueAtTime(f * 0.95, now + 0.12);
        echo.frequency.exponentialRampToValueAtTime(f * 1.3, now + 0.17);
        echoGain.gain.setValueAtTime(0.05 * ambVol, now + 0.12);
        echoGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        echo.connect(echoGain);
        echoGain.connect(bus);
        echo.start(now + 0.12);
        echo.stop(now + 0.35);

        if (hub === 'act3_cavern') {
          // Deep subterranean stone rumble
          const rumble = ctx.createOscillator();
          const rGain = ctx.createGain();
          rumble.type = 'triangle';
          rumble.frequency.setValueAtTime(48, now);
          rumble.frequency.exponentialRampToValueAtTime(42, now + 0.8);
          rGain.gain.setValueAtTime(0.11 * ambVol, now);
          rGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
          rumble.connect(rGain);
          rGain.connect(bus);
          rumble.start(now);
          rumble.stop(now + 0.85);
        }
      } else if (hub === 'act1_marsh') {
        // Act 1: Murky marshland wind, distant crows, rain trickles
        // Rain trickle ping
        const drop = ctx.createOscillator();
        const gain = ctx.createGain();
        const f = 1350 + Math.random() * 300;
        drop.frequency.setValueAtTime(f, now);
        drop.frequency.exponentialRampToValueAtTime(f * 0.7, now + 0.06);
        gain.gain.setValueAtTime(0.10 * ambVol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        drop.connect(gain);
        gain.connect(bus);
        drop.start(now);
        drop.stop(now + 0.18);

        // Distant marsh crow cry (sporadic)
        if (Math.random() < 0.35) {
          const crow = ctx.createOscillator();
          const cGain = ctx.createGain();
          crow.type = 'sawtooth';
          crow.frequency.setValueAtTime(540, now + 0.1);
          crow.frequency.exponentialRampToValueAtTime(460, now + 0.32);
          const cFtr = ctx.createBiquadFilter();
          cFtr.type = 'bandpass';
          cFtr.frequency.setValueAtTime(650, now + 0.1);
          cGain.gain.setValueAtTime(0.06 * ambVol, now + 0.1);
          cGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
          crow.connect(cFtr);
          cFtr.connect(cGain);
          cGain.connect(bus);
          crow.start(now + 0.1);
          crow.stop(now + 0.35);
        }
      } else if (hub === 'act2_desert') {
        // Act 2: Dry desert breeze, shifting sands, cicadas
        // Shifting sands breeze
        const bufferSize = Math.floor(ctx.sampleRate * 0.08);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
        const sand = ctx.createBufferSource();
        sand.buffer = buffer;
        const ftr = ctx.createBiquadFilter();
        ftr.type = 'bandpass';
        ftr.frequency.value = 2800 + Math.random() * 600;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.08 * ambVol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        sand.connect(ftr);
        ftr.connect(gain);
        gain.connect(bus);
        sand.start(now);

        // Desert cicada buzz
        const cicada = ctx.createOscillator();
        const cGain = ctx.createGain();
        cicada.type = 'sine';
        cicada.frequency.setValueAtTime(5200, now);
        const am = ctx.createOscillator();
        const amGain = ctx.createGain();
        am.frequency.setValueAtTime(18, now);
        amGain.gain.value = 0.06 * ambVol;
        am.connect(cGain.gain);
        cicada.connect(cGain);
        cGain.connect(bus);
        am.start(now);
        cicada.start(now);
        am.stop(now + 0.25);
        cicada.stop(now + 0.25);
      } else if (hub === 'act4_hell') {
        // Act 4: Crackling hellfire embers, infernal wind, low sub-bass drones
        // Hellfire ember crackle
        const bufferSize = Math.floor(ctx.sampleRate * 0.03);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
        const ember = ctx.createBufferSource();
        ember.buffer = buffer;
        const ftr = ctx.createBiquadFilter();
        ftr.type = 'bandpass';
        ftr.frequency.value = 2200 + Math.random() * 1200;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.14 * ambVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        ember.connect(ftr);
        ftr.connect(gain);
        gain.connect(bus);
        ember.start(now);

        // Sub-bass infernal drone (beating terror frequencies 36Hz and 39Hz)
        const drone1 = ctx.createOscillator();
        const drone2 = ctx.createOscillator();
        const dGain = ctx.createGain();
        drone1.type = 'triangle';
        drone2.type = 'triangle';
        drone1.frequency.setValueAtTime(36, now);
        drone2.frequency.setValueAtTime(39, now);
        dGain.gain.setValueAtTime(0.12 * ambVol, now);
        dGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
        drone1.connect(dGain);
        drone2.connect(dGain);
        dGain.connect(bus);
        drone1.start(now);
        drone2.start(now);
        drone1.stop(now + 0.9);
        drone2.stop(now + 0.9);
      }
    } catch {
      // silent fallback
    }
  };

  const period = hub === 'blacksmith' ? 3200 : hub === 'tavern' ? 1800 : hub === 'act4_hell' ? 2200 : 3800;
  activeTownHubInterval = setInterval(triggerSound, period) as unknown as number;
  setTimeout(triggerSound, 400);
}

export function setBiomeAmbience(biome: BiomeAmbience | null): void {
  currentBiome = biome;
  playTownAmbience(biome);
}

export function currentTownAmbience(): TownHub | null {
  return currentTownHubLocation;
}

export function currentBiomeAmbience(): BiomeAmbience | null {
  return currentBiome;
}

let musicAct = 0;
let specialFile: string | null = null;
let specialLoop = true;
let blurListenersAttached = false;
let detachBlurListeners: (() => void) | null = null;

function clearCrossfadeTimer(): void {
  if (crossfadeTimer !== null) {
    clearTimeout(crossfadeTimer);
    crossfadeTimer = null;
  }
}

function clearStopMusicTimer(): void {
  if (stopMusicTimer !== null) {
    clearTimeout(stopMusicTimer);
    stopMusicTimer = null;
  }
}

function scheduleCrossfadeTick(): void {
  clearCrossfadeTimer();
  if (!director.getOutgoingHandle()) return;
  crossfadeTimer = setTimeout(() => {
    crossfadeTimer = null;
    const snap = director.tick(Date.now());
    syncMusicBusGain();
    if (snap && snap.progress < 1 && director.getOutgoingHandle()) {
      scheduleCrossfadeTick();
    }
  }, 100);
}

function rampHandleGainTo(handle: StreamingTrackHandle | null, target: number, sec: number): void {
  const live = handle as LiveTrackHandle | null;
  if (!live) return;
  if (live.gain && ctx && ctx.state !== 'closed') {
    live.gain.gain.cancelScheduledValues(ctx.currentTime);
    live.gain.gain.setValueAtTime(live.gain.gain.value, ctx.currentTime);
    live.gain.gain.linearRampToValueAtTime(target, ctx.currentTime + sec);
  } else {
    live.el.volume = target;
  }
}

/** Pick the act-specific tracks from pack 6a (1 to 4); 0 keeps the generic ones. Call before the music starts. */
export function setMusicAct(act: number): void {
  const a = act >= 1 && act <= 4 ? act : 0;
  if (a === musicAct) return;
  musicAct = a;
  clearCrossfadeTimer();
  clearStopMusicTimer();
  director.setAct(a);
  director.resetHandles();
}

/** Take over the music with a named track (e.g. music_boss_morvessa); null returns to the mode tracks. */
export function setSpecialMusic(file: string | null, loop = true): void {
  if (file === specialFile) return;
  specialFile = file;
  specialLoop = loop;
  if (!ctx || !musicWanted) {
    if (!file) {
      clearCrossfadeTimer();
      director.pauseAll();
    }
    return;
  }
  clearStopMusicTimer();
  if (file) {
    director.setSpecialTrack(file, loop, Date.now());
  } else {
    director.setSpecialTrack(null, true, Date.now());
    director.setModeWithAct(musicMode === 'town' ? 'hub' : musicMode, musicAct, director.getRegionIndex(), Date.now());
  }
  syncMusicBusGain();
  scheduleCrossfadeTick();
}

/** Start or stop the music, and crossfade between the explore, battle, and town tracks via streaming <audio>. */
export function setMusic(on: boolean, mode: MusicMode = musicMode): void {
  if (on) unlock();
  musicWanted = on;
  musicMode = mode;
  if (!ctx) return;
  if (!on) {
    clearCrossfadeTimer();
    clearStopMusicTimer();
    rampHandleGainTo(director.getActiveHandle(), 0, 0.6);
    rampHandleGainTo(director.getOutgoingHandle(), 0, 0.6);
    stopMusicTimer = setTimeout(() => {
      stopMusicTimer = null;
      if (!musicWanted) director.pauseAll();
    }, 650);
    stopDarkFantasyAtmosphere();
    return;
  }
  clearStopMusicTimer();
  if (specialFile) {
    director.setSpecialTrack(specialFile, specialLoop, Date.now());
    syncMusicBusGain();
    scheduleCrossfadeTick();
    return;
  }
  director.setModeWithAct(mode === 'town' ? 'hub' : mode, musicAct, director.getRegionIndex(), Date.now());
  syncMusicBusGain();
  scheduleCrossfadeTick();
  if (mode !== 'town') {
    startDarkFantasyAtmosphere();
  } else {
    stopDarkFantasyAtmosphere();
  }
}

export function currentMusic(): 'off' | MusicMode {
  return musicWanted ? musicMode : 'off';
}

export function currentAdaptiveMode(): MusicContextMode {
  return director.getMode();
}

export function getAdaptiveDirector(): AdaptiveAudioDirector {
  return director;
}

export function tickAudio(nowMs = Date.now()): CrossfadeSnapshot | null {
  const snap = director.tick(nowMs);
  syncMusicBusGain();
  return snap;
}

/** Switch to a specific act/region exploration, battle, or town track via streaming <audio>. */
/** Swap the explore track variant when the hero crosses into another region (no-op outside explore mode). */
export function setRegionMusicIndex(regionIndex: number): void {
  if (!ctx || !musicWanted || musicMode !== 'explore' || musicAct === 0) return;
  if (regionIndex === director.getRegionIndex()) return;
  director.setModeWithAct('explore', musicAct, regionIndex, Date.now());
}

export function setMusicRegion(act: number, mode: MusicMode = 'explore', regionIndex = 0): void {
  unlock();
  musicAct = act >= 1 && act <= 4 ? act : 0;
  musicWanted = true;
  musicMode = mode;
  specialFile = null;
  if (!ctx) return;
  clearStopMusicTimer();
  director.setModeWithAct(mode === 'town' ? 'hub' : mode, musicAct, regionIndex, Date.now());
  syncMusicBusGain();
  scheduleCrossfadeTick();
}

/** Stream skirmish biome music via AdaptiveAudioDirector. */
export function setSkirmishMusic(biome: string): void {
  unlock();
  musicWanted = true;
  musicMode = 'explore';
  specialFile = null;
  if (!ctx) return;
  clearStopMusicTimer();
  director.startSkirmish(biome, Date.now());
  syncMusicBusGain();
  scheduleCrossfadeTick();
}

/** Stream character selection campfire theme via AdaptiveAudioDirector. */
export function setCharSelectMusic(): void {
  unlock();
  musicWanted = true;
  musicMode = 'town';
  specialFile = null;
  if (!ctx) return;
  clearStopMusicTimer();
  director.setCharSelect(Date.now());
  syncMusicBusGain();
  scheduleCrossfadeTick();
}

/** Stream main menu theme via AdaptiveAudioDirector. */
export function setMainMenuMusic(): void {
  unlock();
  musicWanted = true;
  musicMode = 'town';
  specialFile = null;
  if (!ctx) return;
  clearStopMusicTimer();
  director.setMenu(Date.now());
  syncMusicBusGain();
  scheduleCrossfadeTick();
}

/** Synthesizes a brief dramatic dark-fantasy cinematic impact boom for boss encounters. */
export function playBossDramaticImpact(): void {
  unlock();
  const bus = musicBus ?? sfxBus;
  if (!ctx || !bus || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(110, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.8);
    subGain.gain.setValueAtTime(0.55 * masterVol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    subOsc.connect(subGain);
    subGain.connect(bus);
    subOsc.start(now);
    subOsc.stop(now + 1.2);

    const brassOsc = ctx.createOscillator();
    const brassFilter = ctx.createBiquadFilter();
    const brassGain = ctx.createGain();
    brassOsc.type = 'sawtooth';
    brassOsc.frequency.setValueAtTime(55, now);
    brassFilter.type = 'lowpass';
    brassFilter.frequency.setValueAtTime(380, now);
    brassFilter.frequency.exponentialRampToValueAtTime(120, now + 0.9);
    brassGain.gain.setValueAtTime(0.38 * masterVol, now);
    brassGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    brassOsc.connect(brassFilter);
    brassFilter.connect(brassGain);
    brassGain.connect(bus);
    brassOsc.start(now);
    brassOsc.stop(now + 1.0);
  } catch {
    // silent fallback
  }
}

/** Trigger boss phase streaming music and brief dramatic transition with automatic music ducking. */
export function playBossMusic(bossId: string, phase: 1 | 2 = 1, roarDurationMs = 2200): void {
  unlock();
  musicWanted = true;
  musicMode = 'battle';
  lastCombatEventMs = Date.now();
  playBossDramaticImpact();
  const roarId = getBossRoarSfx(bossId) ?? undefined;
  if (roarId) {
    playBossRoar(bossId, roarDurationMs);
  } else {
    // Duck music during brief dramatic entrance even without pre-rendered roar file
    setMusicDucking('boss_roar', true);
    if (roarDuckTimer !== null) clearTimeout(roarDuckTimer);
    roarDuckTimer = setTimeout(() => {
      roarDuckTimer = null;
      setMusicDucking('boss_roar', false);
    }, roarDurationMs);
  }
  if (!ctx) return;
  clearStopMusicTimer();
  director.triggerBossPhase(bossId, phase, roarId, Date.now());
  specialFile = director.getSpecialTrackId();
  specialLoop = true;
  syncMusicBusGain();
  scheduleCrossfadeTick();
}

/** Stream Map 4 ending theme ('crown' | 'ember' | 'a' | 'b'). */
export function playEndingMusic(ending: 'crown' | 'ember' | 'a' | 'b'): void {
  unlock();
  musicWanted = true;
  musicMode = 'town';
  if (!ctx) return;
  clearStopMusicTimer();
  director.playEnding(ending, Date.now());
  specialFile = director.getSpecialTrackId();
  specialLoop = true;
  syncMusicBusGain();
  scheduleCrossfadeTick();
}

export type CombatEventType = 'aggro' | 'damage_taken' | 'damage_dealt' | 'enemy_spotted';

export interface CombatStateUpdate {
  enemyInView?: boolean;
  enemiesAggro?: boolean;
  heroDamaged?: boolean;
  heroDealtDamage?: boolean;
  nearbyEnemies?: number;
}

/**
 * Triggers or updates adaptive combat music crossfade.
 * When combat starts (enemies aggro / hero takes or deals damage), smoothly crossfades (1.5 - 2s) to combat music (music_battle_*).
 * When all nearby enemies are defeated or combat ends for 4+ seconds, smoothly fades back to exploration music.
 */
export function updateAdaptiveCombat(
  stateOrEnemyInView: boolean | number | CombatStateUpdate,
  nowMs = Date.now(),
): MusicContextMode {
  let inCombat = false;
  if (typeof stateOrEnemyInView === 'boolean') {
    inCombat = stateOrEnemyInView;
    if (inCombat) {
      lastCombatEventMs = nowMs;
    }
  } else if (typeof stateOrEnemyInView === 'number') {
    activeNearbyEnemyCount = Math.max(0, stateOrEnemyInView);
    inCombat = activeNearbyEnemyCount > 0;
    if (inCombat) {
      lastCombatEventMs = nowMs;
    }
  } else if (stateOrEnemyInView && typeof stateOrEnemyInView === 'object') {
    if (typeof stateOrEnemyInView.nearbyEnemies === 'number') {
      activeNearbyEnemyCount = Math.max(0, stateOrEnemyInView.nearbyEnemies);
    }
    inCombat = Boolean(
      stateOrEnemyInView.enemyInView ||
      stateOrEnemyInView.enemiesAggro ||
      stateOrEnemyInView.heroDamaged ||
      stateOrEnemyInView.heroDealtDamage ||
      activeNearbyEnemyCount > 0,
    );
    if (inCombat) {
      lastCombatEventMs = nowMs;
    }
  }

  const prevTrack = director.getCurrentTrackId();
  const mode = director.updateCombat(inCombat, nowMs);
  if (mode === 'battle') musicMode = 'battle';
  else if (mode === 'explore' || mode === 'skirmish') musicMode = 'explore';
  if (director.getCurrentTrackId() !== prevTrack) {
    syncMusicBusGain();
    scheduleCrossfadeTick();
  }
  return mode;
}

/** Explicit combat event notifier (e.g. enemy aggro, hero deals or takes damage). */
export function notifyCombatEvent(event: CombatEventType, nowMs = Date.now()): MusicContextMode {
  lastCombatEventMs = nowMs;
  return updateAdaptiveCombat(true, nowMs);
}

/** Updates nearby enemy count; when 0, starts the 4+ second hysteresis countdown. */
export function notifyNearbyEnemies(count: number, nowMs = Date.now()): MusicContextMode {
  activeNearbyEnemyCount = Math.max(0, count);
  return updateAdaptiveCombat(activeNearbyEnemyCount > 0, nowMs);
}

/** Returns whether the player is currently considered in combat. */
export function isCombatActive(nowMs = Date.now()): boolean {
  return director.getMode() === 'battle' || (nowMs - lastCombatEventMs < COMBAT_HYSTERESIS_MS);
}

export function suspendAudio(): void {
  cancelShopEntry();
  stopDialogueVoice();
  backgrounded = true;
  generation++;
  clearCrossfadeTimer();
  clearStopMusicTimer();
  stopAmbience();
  stopDarkFantasyAtmosphere();
  suspendedTownHub = currentTownHubLocation;
  stopTownAmbience();
  silent?.pause();
  director.getActiveHandle()?.pause();
  director.getOutgoingHandle()?.pause();
  const context = ctx;
  if (!context || context.state === 'closed' || suspending) return;
  const attempt = context.suspend().catch(() => undefined).finally(() => {
    if (suspending !== attempt) return;
    suspending = null;
    if (ctx === context && !backgrounded) { restorePlayback(); requestResume(); }
  });
  suspending = attempt;
}

/** Best-effort foreground recovery. A closed context is rebuilt only by the next unlock gesture. */
export function resumeAudio(): void {
  backgrounded = false;
  restorePlayback();
  if (suspendedTownHub) {
    const hub = suspendedTownHub;
    suspendedTownHub = null;
    playTownAmbience(hub);
  }
  requestResume();
}

export function audioState(): string {
  return ctx ? `${ctx.state}, ${buffers.size} sounds, ${limiter.active} voices, music ${currentMusic()}` : 'locked';
}

export function audioStats(): { state: string; loaded: number; played: number; rejected: number; stolen: number; voices: number } {
  return { state: ctx ? ctx.state : 'locked', loaded: buffers.size, played, rejected: limiter.rejected, stolen: limiter.stolen, voices: limiter.active };
}

export function whenLoaded(): Promise<void> {
  return loading ?? Promise.resolve();
}

export function setMasterVolume(v: number): void {
  masterVol = Math.max(0, Math.min(1, v));
  try { localStorage.setItem('thornvael.masterVol', String(masterVol)); } catch { /* storage denied */ }
  syncMasterGain();
}

export function getMasterVolume(): number {
  return masterVol;
}

export function setSfxVolume(v: number): void {
  sfxVol = Math.max(0, Math.min(1, v));
  director.setBusVolume('sfx', sfxVol);
  try { localStorage.setItem('thornvael.sfxVol', String(sfxVol)); } catch { /* storage denied */ }
  if (sfxBus && ctx && ctx.state !== 'closed') {
    sfxBus.gain.setValueAtTime(sfxVol * 0.8, ctx.currentTime);
  }
}

export function getSfxVolume(): number {
  return sfxVol;
}

export function setUiVolume(v: number): void {
  uiVol = Math.max(0, Math.min(1, v));
  director.setBusVolume('ui', uiVol);
  try { localStorage.setItem('thornvael.uiVol', String(uiVol)); } catch { /* storage denied */ }
  if (uiBus && ctx && ctx.state !== 'closed') {
    uiBus.gain.setValueAtTime(uiVol * 0.85, ctx.currentTime);
  }
}

export function getUiVolume(): number {
  return uiVol;
}

export function setMusicVolume(v: number): void {
  musicVol = Math.max(0, Math.min(1, v));
  director.setBusVolume('music', musicVol);
  try { localStorage.setItem('thornvael.musicVol', String(musicVol)); } catch { /* storage denied */ }
  syncMusicBusGain();
}

export function getMusicVolume(): number {
  return musicVol;
}

export function setAmbienceVolume(v: number): void {
  ambVol = Math.max(0, Math.min(1, v));
  director.setBusVolume('ambient', ambVol);
  try { localStorage.setItem('thornvael.ambVol', String(ambVol)); } catch { /* storage denied */ }
  if (ambBus && ctx && ctx.state !== 'closed') {
    ambBus.gain.setValueAtTime(ambVol * 0.22, ctx.currentTime);
  }
}

export function getAmbienceVolume(): number {
  return ambVol;
}

export function setBusVolume(bus: AudioBus, v: number): void {
  if (bus === 'music') setMusicVolume(v);
  else if (bus === 'sfx') setSfxVolume(v);
  else if (bus === 'ambient') setAmbienceVolume(v);
  else setUiVolume(v);
}

export function getBusVolume(bus: AudioBus): number {
  if (bus === 'music') return musicVol;
  if (bus === 'sfx') return sfxVol;
  if (bus === 'ambient') return ambVol;
  return uiVol;
}

export function getBusVolumes(): Readonly<BusVolumes> {
  return director.getAllBusVolumes();
}

export function setMusicDucking(reason: DuckReason, active: boolean): void {
  director.setDucking(reason, active);
  syncMusicBusGain();
}

export function setDialogueDucking(active: boolean): void {
  if (dialogueDuckTimer !== null && !active) {
    clearTimeout(dialogueDuckTimer);
    dialogueDuckTimer = null;
  }
  setMusicDucking('dialogue', active);
}

/** Ducks background music (-14dB) when dialogues or town shops open. */
export function setShopDucking(active: boolean): void {
  if (shopDuckTimer !== null && !active) {
    clearTimeout(shopDuckTimer);
    shopDuckTimer = null;
  }
  setMusicDucking('dialogue', active);
}

export function isMusicDucked(): boolean {
  return director.isDucked();
}

export function getMusicDuckMultiplier(): number {
  return director.getDuckMultiplier();
}

export function getEffectiveMusicGain(): number {
  return 0.32 * director.getEffectiveMusicVolume();
}

/** Voice Acting on/off: spoken dialogue lines only (text and other sound stay as they are). */
export function setVoiceActing(enabled: boolean): void {
  voiceActingPref = Boolean(enabled);
  try { localStorage.setItem('thornvael.voiceActing', String(voiceActingPref)); } catch { /* storage denied */ }
  if (!voiceActingPref) stopDialogueVoice();
}

export function isVoiceActing(): boolean {
  return voiceActingPref;
}

export function setMuteOnBlur(enabled: boolean): void {
  muteOnBlurPref = Boolean(enabled);
  try { localStorage.setItem('thornvael.muteOnBlur', String(muteOnBlurPref)); } catch { /* storage denied */ }
  director.setMuteOnBlur(muteOnBlurPref);
  syncMasterGain();
  syncMusicBusGain();
}

export function isMuteOnBlur(): boolean {
  return muteOnBlurPref;
}

export function setWindowBlurMuted(blurred: boolean): void {
  windowBlurred = Boolean(blurred);
  director.handleVisibilityChange(windowBlurred);
  syncMasterGain();
  syncMusicBusGain();
}

export interface BlurEventTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export function attachBlurMuteListeners(
  doc?: BlurEventTarget & { hidden?: boolean },
  win?: BlurEventTarget,
): () => void {
  const targetDoc = doc ?? (typeof document !== 'undefined' && typeof document.addEventListener === 'function' ? document : undefined);
  const targetWin = win ?? (typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : undefined);
  const onVis = () => setWindowBlurMuted(Boolean(targetDoc?.hidden));
  const onBlur = () => setWindowBlurMuted(true);
  const onFocus = () => setWindowBlurMuted(Boolean(targetDoc?.hidden));

  targetDoc?.addEventListener('visibilitychange', onVis);
  targetWin?.addEventListener('blur', onBlur);
  targetWin?.addEventListener('focus', onFocus);
  if (targetDoc) onVis();

  return () => {
    targetDoc?.removeEventListener('visibilitychange', onVis);
    targetWin?.removeEventListener('blur', onBlur);
    targetWin?.removeEventListener('focus', onFocus);
  };
}

function attachDefaultBlurListeners(): void {
  if (blurListenersAttached) return;
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  blurListenersAttached = true;
  detachBlurListeners = attachBlurMuteListeners(document, typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : undefined);
  void detachBlurListeners;
}

export function getBusLevels(): { master: number; sfx: number; ui: number; music: number; ambience: number } {
  return {
    master: 0.9 * masterVol,
    sfx: 0.8 * sfxVol,
    ui: 0.85 * uiVol,
    music: 0.32 * musicVol,
    ambience: 0.22 * ambVol,
  };
}

/** Preloads Wave 2 or mission-specific SFX cues on demand without bloating initial boot decode. */
export function preloadAudioCues(names: readonly string[]): Promise<void> {
  if (!ctx) return Promise.resolve();
  return Promise.all(names.map(loadBuffer)).then(() => undefined).catch(() => undefined);
}

let activeVoiceEl: HTMLAudioElement | null = null;
let activeVoiceSource: MediaElementAudioSourceNode | null = null;
let activeVoiceGain: GainNode | null = null;

/** Stops any currently playing human dialogue voiceover stream cleanly. */
export function stopDialogueVoice(): void {
  if (activeVoiceEl) {
    try {
      activeVoiceEl.pause();
      activeVoiceEl.removeAttribute('src');
      activeVoiceEl.load();
    } catch { /* ignore */ }
    activeVoiceEl = null;
  }
  if (activeVoiceSource) {
    try { activeVoiceSource.disconnect(); } catch { /* ignore */ }
    activeVoiceSource = null;
  }
  if (activeVoiceGain) {
    try { activeVoiceGain.disconnect(); } catch { /* ignore */ }
    activeVoiceGain = null;
  }
}

/** Streams a neural human voiceover line from `public/audio/voices/<clipId>.m4a` on the UI/dialogue bus. */
export function playDialogueVoice(clipId: string): void {
  stopDialogueVoice();
  if (!clipId || !sfxOn || !voiceActingPref || backgrounded || typeof Audio === 'undefined') return;
  if (canAutoUnlock()) unlock();
  try {
    const url = `${base()}audio/voices/${clipId}.m4a`;
    const el = new Audio(url);
    el.preload = 'auto';
    activeVoiceEl = el;
    const cleanup = (): void => {
      if (activeVoiceEl === el) stopDialogueVoice();
    };
    if (typeof el.addEventListener === 'function') {
      el.addEventListener('error', cleanup, { once: true });
      el.addEventListener('ended', cleanup, { once: true });
    }
    if (ctx && ctx.state !== 'closed' && uiBus) {
      try {
        activeVoiceSource = ctx.createMediaElementSource(el);
        activeVoiceGain = ctx.createGain();
        activeVoiceGain.gain.value = 1.6;
        activeVoiceSource.connect(activeVoiceGain).connect(uiBus);
      } catch {
        el.volume = Math.max(0, Math.min(1, masterVol * uiVol));
      }
    } else {
      el.volume = Math.max(0, Math.min(1, masterVol * uiVol));
    }
    void Promise.resolve(el.play()).catch(() => undefined);
  } catch {
    stopDialogueVoice();
  }
}

/** Plays a D4 dark-fantasy NPC bark cue and optionally ducks music during dialogue. */
export function playNpcBark(role: string, duckMs = 0, at?: SpatialPoint): void {
  const cue = getNpcBarkSfx(role);
  play(cue, 5, at);
  if (duckMs > 0) {
    if (dialogueDuckTimer !== null) clearTimeout(dialogueDuckTimer);
    setMusicDucking('dialogue', true);
    dialogueDuckTimer = setTimeout(() => {
      dialogueDuckTimer = null;
      setMusicDucking('dialogue', false);
    }, duckMs);
  }
}

/** Plays a D4 mercenary voice/grunt bark for the given archetype ('warrior' | 'archer' | 'mage'). */
export function playMercBark(archetype: string, at?: SpatialPoint): void {
  play(getMercBarkSfx(archetype), 4, at);
}

/** Plays a per-family monster hurt voice cue with spatial pan and starts adaptive combat transition. */
export function playMonsterHitVoice(family: string, at?: SpatialPoint): void {
  notifyCombatEvent('damage_dealt');
  play(getMonsterHitSfx(family), 2, at);
}

/** Plays a per-family monster aggro roar cue and starts adaptive combat transition. */
export function playMonsterAggroVoice(family: string, at?: SpatialPoint): void {
  notifyCombatEvent('aggro');
  play(getMonsterAggroSfx(family), 3, at);
}

/** Plays a per-family monster death voice cue. */
export function playMonsterDeathVoice(family: string, at?: SpatialPoint): void {
  play(getMonsterDeathSfx(family), 3, at);
}

/** Plays a boss roar stinger and temporarily ducks music for dramatic impact. */
export function playBossRoar(bossId: string, duckMs = 2200, at?: SpatialPoint): void {
  const cue = getBossRoarSfx(bossId);
  if (duckMs > 0) {
    if (roarDuckTimer !== null) clearTimeout(roarDuckTimer);
    setMusicDucking('boss_roar', true);
    roarDuckTimer = setTimeout(() => {
      roarDuckTimer = null;
      setMusicDucking('boss_roar', false);
    }, duckMs);
  }
  if (cue) play(cue, 6, at);
}

/** Plays the UI invalid/error buzz cue. */
export function playUiError(): void {
  play('ui_error', 5);
}

/**
 * Phase 10: Visceral ARPG Audio & Dark Fantasy Soundscape Synthesis
 */

/** Sharp metallic sword clash on shield with high resonant ring and heavy iron thud. */
export function playShieldBlock(): void {
  unlock();
  const bus = sfxBus;
  if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const vol = sfxVol * masterVol;

    // 1. Steel scrape / transient burst
    const noiseLen = Math.floor(ctx.sampleRate * 0.04);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
    const scrape = ctx.createBufferSource();
    scrape.buffer = noiseBuf;
    const scrapeFtr = ctx.createBiquadFilter();
    scrapeFtr.type = 'bandpass';
    scrapeFtr.frequency.setValueAtTime(2100, now);
    scrapeFtr.Q.value = 4.0;
    const scrapeGain = ctx.createGain();
    scrapeGain.gain.setValueAtTime(0.35 * vol, now);
    scrapeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    scrape.connect(scrapeFtr);
    scrapeFtr.connect(scrapeGain);
    scrapeGain.connect(bus);
    scrape.start(now);

    // 2. High resonant ringing blade harmonics (2240 Hz and 3360 Hz)
    const ring1 = ctx.createOscillator();
    const ring1Gain = ctx.createGain();
    ring1.type = 'sine';
    ring1.frequency.setValueAtTime(2240, now);
    ring1.frequency.exponentialRampToValueAtTime(2160, now + 0.35);
    ring1Gain.gain.setValueAtTime(0.40 * vol, now);
    ring1Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    ring1.connect(ring1Gain);
    ring1Gain.connect(bus);
    ring1.start(now);
    ring1.stop(now + 0.38);

    const ring2 = ctx.createOscillator();
    const ring2Gain = ctx.createGain();
    ring2.type = 'triangle';
    ring2.frequency.setValueAtTime(3360, now);
    ring2Gain.gain.setValueAtTime(0.22 * vol, now);
    ring2Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    ring2.connect(ring2Gain);
    ring2Gain.connect(bus);
    ring2.start(now);
    ring2.stop(now + 0.24);

    // 3. Heavy shield boss wooden / iron impact thud
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(175, now);
    thud.frequency.exponentialRampToValueAtTime(50, now + 0.12);
    thudGain.gain.setValueAtTime(0.55 * vol, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    thud.connect(thudGain);
    thudGain.connect(bus);
    thud.start(now);
    thud.stop(now + 0.15);
  } catch {
    // silent fallback
  }
}

/** Heavy fleshy blade slash: deep impactful low thud, wet squelch cut, and high blade whistle. */
export function playFleshHit(): void {
  unlock();
  const bus = sfxBus;
  if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const vol = sfxVol * masterVol;

    // 1. Sub-bass blunt body impact
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(95, now);
    thud.frequency.exponentialRampToValueAtTime(36, now + 0.11);
    thudGain.gain.setValueAtTime(0.48 * vol, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    thud.connect(thudGain);
    thudGain.connect(bus);
    thud.start(now);
    thud.stop(now + 0.14);

    // 2. Wet flesh laceration (downward sliding filtered sawtooth)
    const cut = ctx.createOscillator();
    const cutFtr = ctx.createBiquadFilter();
    const cutGain = ctx.createGain();
    cut.type = 'sawtooth';
    cut.frequency.setValueAtTime(460, now);
    cut.frequency.exponentialRampToValueAtTime(110, now + 0.09);
    cutFtr.type = 'bandpass';
    cutFtr.frequency.setValueAtTime(580, now);
    cutFtr.frequency.exponentialRampToValueAtTime(180, now + 0.09);
    cutFtr.Q.value = 2.8;
    cutGain.gain.setValueAtTime(0.42 * vol, now);
    cutGain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
    cut.connect(cutFtr);
    cutFtr.connect(cutGain);
    cutGain.connect(bus);
    cut.start(now);
    cut.stop(now + 0.11);

    // 3. High steel blade snick transient
    const snick = ctx.createOscillator();
    const snickGain = ctx.createGain();
    snick.type = 'triangle';
    snick.frequency.setValueAtTime(1380, now);
    snick.frequency.exponentialRampToValueAtTime(950, now + 0.04);
    snickGain.gain.setValueAtTime(0.25 * vol, now);
    snickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    snick.connect(snickGain);
    snickGain.connect(bus);
    snick.start(now);
    snick.stop(now + 0.05);
  } catch {
    // silent fallback
  }
}

/** Crisp ringing coin drop chime with shimmering harmonics for gold pickups. */
export function playGoldPickup(): void {
  unlock();
  const bus = uiBus ?? sfxBus;
  if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const vol = uiVol * masterVol;

    // Coin 1 (E7: ~2637 Hz with harmonic at ~5274 Hz)
    const c1 = ctx.createOscillator();
    const c1Gain = ctx.createGain();
    c1.type = 'sine';
    c1.frequency.setValueAtTime(2637, now);
    c1.frequency.exponentialRampToValueAtTime(2620, now + 0.38);
    c1Gain.gain.setValueAtTime(0.38 * vol, now);
    c1Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.40);
    c1.connect(c1Gain);
    c1Gain.connect(bus);
    c1.start(now);
    c1.stop(now + 0.42);

    // Coin 2 (A7: ~3520 Hz with slight delay 0.038s)
    const t2 = now + 0.038;
    const c2 = ctx.createOscillator();
    const c2Gain = ctx.createGain();
    c2.type = 'sine';
    c2.frequency.setValueAtTime(3520, t2);
    c2.frequency.exponentialRampToValueAtTime(3495, t2 + 0.44);
    c2Gain.gain.setValueAtTime(0.32 * vol, t2);
    c2Gain.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.45);
    c2.connect(c2Gain);
    c2Gain.connect(bus);
    c2.start(t2);
    c2.stop(t2 + 0.48);

    // Metallic coin contact click
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(4200, now);
    click.frequency.exponentialRampToValueAtTime(1800, now + 0.02);
    clickGain.gain.setValueAtTime(0.30 * vol, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    click.connect(clickGain);
    clickGain.connect(bus);
    click.start(now);
    click.stop(now + 0.03);
  } catch {
    // silent fallback
  }
}

/** Monster death roar and guttural dying gurgle. */
export function playMonsterDeath(): void {
  unlock();
  const bus = sfxBus;
  if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const vol = sfxVol * masterVol;

    // Guttural growl / low vocal cords pitch sweep
    const roar = ctx.createOscillator();
    const roarFtr = ctx.createBiquadFilter();
    const roarGain = ctx.createGain();

    roar.type = 'sawtooth';
    roar.frequency.setValueAtTime(165, now);
    roar.frequency.exponentialRampToValueAtTime(44, now + 0.55);

    roarFtr.type = 'bandpass';
    roarFtr.frequency.setValueAtTime(450, now);
    roarFtr.frequency.exponentialRampToValueAtTime(180, now + 0.55);
    roarFtr.Q.value = 3.2;

    // AM modulation for ragged gurgle
    const gurgle = ctx.createOscillator();
    const gurgleGain = ctx.createGain();
    gurgle.type = 'sine';
    gurgle.frequency.setValueAtTime(24, now);
    gurgle.frequency.linearRampToValueAtTime(12, now + 0.55);
    gurgleGain.gain.value = 0.25;
    gurgle.connect(roarGain.gain);

    roarGain.gain.setValueAtTime(0.45 * vol, now);
    roarGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);

    roar.connect(roarFtr);
    roarFtr.connect(roarGain);
    roarGain.connect(bus);

    gurgle.start(now);
    roar.start(now);
    gurgle.stop(now + 0.60);
    roar.stop(now + 0.60);
  } catch {
    // silent fallback
  }
}

/** Glass potion cork uncork squeak and resonant swallow gulp. */
export function playPotionGulp(): void {
  unlock();
  const bus = uiBus ?? sfxBus;
  if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const vol = uiVol * masterVol;

    // 1. Friction cork uncork pop
    const cork = ctx.createOscillator();
    const corkGain = ctx.createGain();
    cork.type = 'sine';
    cork.frequency.setValueAtTime(640, now);
    cork.frequency.exponentialRampToValueAtTime(1580, now + 0.04);
    corkGain.gain.setValueAtTime(0.38 * vol, now);
    corkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    cork.connect(corkGain);
    corkGain.connect(bus);
    cork.start(now);
    cork.stop(now + 0.05);

    // Glass chime ring
    const glass = ctx.createOscillator();
    const glassGain = ctx.createGain();
    glass.type = 'sine';
    glass.frequency.setValueAtTime(1860, now + 0.02);
    glassGain.gain.setValueAtTime(0.20 * vol, now + 0.02);
    glassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);
    glass.connect(glassGain);
    glassGain.connect(bus);
    glass.start(now + 0.02);
    glass.stop(now + 0.22);

    // 2. Liquid swallow / gulp bubbles (t = +0.07s and +0.22s)
    const swallowTimes = [now + 0.07, now + 0.22];
    for (let s = 0; s < swallowTimes.length; s++) {
      const st = swallowTimes[s];
      const gulp = ctx.createOscillator();
      const gulpGain = ctx.createGain();
      gulp.type = 'sine';
      const fStart = s === 0 ? 380 : 340;
      gulp.frequency.setValueAtTime(fStart, st);
      gulp.frequency.exponentialRampToValueAtTime(fStart * 0.55, st + 0.08);
      gulpGain.gain.setValueAtTime(0.34 * vol, st);
      gulpGain.gain.exponentialRampToValueAtTime(0.001, st + 0.09);
      gulp.connect(gulpGain);
      gulpGain.connect(bus);
      gulp.start(st);
      gulp.stop(st + 0.10);
    }
  } catch {
    // silent fallback
  }
}

export type SurfaceType = 'water' | 'stone' | 'grass' | 'mud' | 'wood';

/**
 * Surface-Aware Audio Footstep Synthesis (Phase 11):
 * - water / ford / river: soft splash with liquid droplet resonance.
 * - stone / dungeon floor: crisp hard heel click with short transient slap.
 * - mud / grass: muffled soft thud with low damped rumble.
 * - wood bridge / floor: hollow resonant wooden tap with cavity body response.
 */
export function playSurfaceFootstep(surface: SurfaceType, at?: { x: number; y: number; w: number; h: number }): void {
  unlock();
  const bus = sfxBus;
  if (!ctx || !bus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  try {
    let spatialGain = 1.0;
    let spatialPan = 0;
    if (at) {
      const s = spatial(at.x, at.y, at.w, at.h);
      spatialGain = s.gain;
      spatialPan = s.pan;
      if (spatialGain <= 0.02) return;
    }
    const now = ctx.currentTime;
    const vol = sfxVol * masterVol * spatialGain * 0.45;

    // Connect node to bus via stereo panner if available
    const outputGain = ctx.createGain();
    outputGain.gain.value = 1.0;
    let targetDest: AudioNode = outputGain;
    if (typeof ctx.createStereoPanner === 'function' && spatialPan !== 0) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = spatialPan;
      outputGain.connect(panner);
      panner.connect(bus);
    } else {
      outputGain.connect(bus);
    }

    if (surface === 'water') {
      // Shallow water / river: soft splash with liquid resonance
      // 1. Filtered white noise splash
      const noiseLen = Math.floor(ctx.sampleRate * 0.065);
      const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
      const splash = ctx.createBufferSource();
      splash.buffer = noiseBuf;
      const splashFtr = ctx.createBiquadFilter();
      splashFtr.type = 'bandpass';
      splashFtr.frequency.setValueAtTime(1450, now);
      splashFtr.Q.value = 2.4;
      const splashGain = ctx.createGain();
      splashGain.gain.setValueAtTime(0.28 * vol, now);
      splashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      splash.connect(splashFtr);
      splashFtr.connect(splashGain);
      splashGain.connect(targetDest);
      splash.start(now);

      // 2. Liquid droplet bubble resonance (480 Hz sliding down to 240 Hz)
      const drop = ctx.createOscillator();
      const dropGain = ctx.createGain();
      drop.type = 'sine';
      drop.frequency.setValueAtTime(480, now);
      drop.frequency.exponentialRampToValueAtTime(240, now + 0.08);
      dropGain.gain.setValueAtTime(0.35 * vol, now);
      dropGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
      drop.connect(dropGain);
      dropGain.connect(targetDest);
      drop.start(now);
      drop.stop(now + 0.09);
    } else if (surface === 'stone') {
      // Stone / dungeon floor: crisp hard heel click
      // 1. High transient contact click (3400 Hz -> 1600 Hz)
      const click = ctx.createOscillator();
      const clickGain = ctx.createGain();
      click.type = 'triangle';
      click.frequency.setValueAtTime(3400, now);
      click.frequency.exponentialRampToValueAtTime(1400, now + 0.025);
      clickGain.gain.setValueAtTime(0.40 * vol, now);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      click.connect(clickGain);
      clickGain.connect(targetDest);
      click.start(now);
      click.stop(now + 0.035);

      // 2. Short masonry body impact
      const body = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      body.type = 'sine';
      body.frequency.setValueAtTime(280, now);
      body.frequency.exponentialRampToValueAtTime(80, now + 0.04);
      bodyGain.gain.setValueAtTime(0.30 * vol, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      body.connect(bodyGain);
      bodyGain.connect(targetDest);
      body.start(now);
      body.stop(now + 0.05);
    } else if (surface === 'wood') {
      // Wood bridge / floor: hollow resonant wooden tap
      // 1. Hollow acoustic cavity resonance (~420 Hz -> ~260 Hz)
      const wood = ctx.createOscillator();
      const woodGain = ctx.createGain();
      wood.type = 'triangle';
      wood.frequency.setValueAtTime(420, now);
      wood.frequency.exponentialRampToValueAtTime(260, now + 0.06);
      woodGain.gain.setValueAtTime(0.42 * vol, now);
      woodGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
      wood.connect(woodGain);
      woodGain.connect(targetDest);
      wood.start(now);
      wood.stop(now + 0.07);

      // 2. Low wooden beam thud
      const thud = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(160, now);
      thud.frequency.exponentialRampToValueAtTime(65, now + 0.07);
      thudGain.gain.setValueAtTime(0.36 * vol, now);
      thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
      thud.connect(thudGain);
      thudGain.connect(targetDest);
      thud.start(now);
      thud.stop(now + 0.08);
    } else {
      // Mud / grass: muffled soft thud
      // 1. Soft damped sine thud (90 Hz -> 42 Hz)
      const thud = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(surface === 'mud' ? 80 : 95, now);
      thud.frequency.exponentialRampToValueAtTime(38, now + 0.07);
      thudGain.gain.setValueAtTime(0.32 * vol, now);
      thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
      thud.connect(thudGain);
      thudGain.connect(targetDest);
      thud.start(now);
      thud.stop(now + 0.08);

      // 2. Soft foliage / mud squelch rustle
      const rustle = ctx.createOscillator();
      const rustleFtr = ctx.createBiquadFilter();
      const rustleGain = ctx.createGain();
      rustle.type = 'sawtooth';
      rustle.frequency.setValueAtTime(240, now);
      rustle.frequency.exponentialRampToValueAtTime(90, now + 0.04);
      rustleFtr.type = 'lowpass';
      rustleFtr.frequency.setValueAtTime(surface === 'mud' ? 320 : 480, now);
      rustleGain.gain.setValueAtTime(0.18 * vol, now);
      rustleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      rustle.connect(rustleFtr);
      rustleFtr.connect(rustleGain);
      rustleGain.connect(targetDest);
      rustle.start(now);
      rustle.stop(now + 0.05);
    }
  } catch {
    // silent fallback
  }
}

/** Atmospheric Dark Fantasy Guitar & Sub-Drone Music Synthesis Layer */
let darkFantasyInterval: number | null = null;
let darkFantasyDroneOscs: OscillatorNode[] = [];
let darkFantasyDroneGain: GainNode | null = null;
let darkFantasyActive = false;

// Dark fantasy Dorian/Phrygian acoustic lute/guitar scale notes in Hz (D3 to A4)
const DARK_GUITAR_NOTES = [
  146.83, // D3
  174.61, // F3
  196.00, // G3
  207.65, // G#3 / Ab3
  220.00, // A3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  349.23, // F4
  440.00, // A4
];

export function startDarkFantasyAtmosphere(): void {
  if (darkFantasyActive) return;
  darkFantasyActive = true;
  unlock();
  const bus = musicBus ?? master;
  if (!ctx || !bus || !musicWanted || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const vol = musicVol * masterVol * 0.45;

    // 1. Deep sub-drone layer (D2 73.4 Hz + A1 55 Hz)
    darkFantasyDroneGain = ctx.createGain();
    darkFantasyDroneGain.gain.setValueAtTime(0.001, now);
    darkFantasyDroneGain.gain.linearRampToValueAtTime(0.18 * vol, now + 2.5);
    darkFantasyDroneGain.connect(bus);

    const ftr = ctx.createBiquadFilter();
    ftr.type = 'lowpass';
    ftr.frequency.setValueAtTime(140, now);
    ftr.Q.value = 2.0;
    ftr.connect(darkFantasyDroneGain);

    const drone1 = ctx.createOscillator();
    drone1.type = 'triangle';
    drone1.frequency.setValueAtTime(73.42, now); // D2
    drone1.connect(ftr);
    drone1.start(now);

    const drone2 = ctx.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.setValueAtTime(55.0, now); // A1
    drone2.connect(ftr);
    drone2.start(now);

    darkFantasyDroneOscs = [drone1, drone2];

    // 2. Periodic acoustic dark guitar arpeggio plucks
    const playGuitarNote = () => {
      if (!darkFantasyActive || !ctx || ctx.state !== 'running') return;
      try {
        const t = ctx.currentTime;
        const gVol = musicVol * masterVol * 0.32;
        // Select 1-2 melancholic notes
        const noteIdx = Math.floor(Math.random() * DARK_GUITAR_NOTES.length);
        const freq = DARK_GUITAR_NOTES[noteIdx];

        // Plucked acoustic string synthesis (dual harmonics with percussive attack and warm decay)
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        // String tone filter (warm wooden acoustic body)
        const bodyFtr = ctx.createBiquadFilter();
        bodyFtr.type = 'lowpass';
        bodyFtr.frequency.setValueAtTime(freq * 3.5, t);
        bodyFtr.frequency.exponentialRampToValueAtTime(freq * 1.2, t + 0.9);

        // Percussive pluck envelope (fast attack 4ms, decay over 1.2s)
        oscGain.gain.setValueAtTime(0.001, t);
        oscGain.gain.linearRampToValueAtTime(gVol, t + 0.006);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);

        osc.connect(bodyFtr);
        bodyFtr.connect(oscGain);
        oscGain.connect(bus);

        osc.start(t);
        osc.stop(t + 1.5);
      } catch {
        // silent fallback
      }
    };

    darkFantasyInterval = setInterval(playGuitarNote, 3200) as unknown as number;
    setTimeout(playGuitarNote, 800);
  } catch {
    // silent fallback
  }
}

export function stopDarkFantasyAtmosphere(): void {
  darkFantasyActive = false;
  if (darkFantasyInterval !== null) {
    clearInterval(darkFantasyInterval);
    darkFantasyInterval = null;
  }
  for (const osc of darkFantasyDroneOscs) {
    try { osc.stop(); osc.disconnect(); } catch { /* ignore */ }
  }
  darkFantasyDroneOscs = [];
  if (darkFantasyDroneGain) {
    try { darkFantasyDroneGain.disconnect(); } catch { /* ignore */ }
    darkFantasyDroneGain = null;
  }
}

export function isDarkFantasyAtmosphereActive(): boolean {
  return darkFantasyActive;
}
