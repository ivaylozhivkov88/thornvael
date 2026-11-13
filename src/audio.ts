import { VoiceLimiter, spatial, type Voice } from './audiologic';

/**
 * Web Audio engine: one context, three buses (sfx, music, ambience), a voice limit and pan by screen position.
 * Sound effects are short AAC files decoded once; music is streamed through an <audio> element so it never sits in memory as PCM.
 * Everything starts from a real user gesture (`unlock`). A silent media workaround needs real iOS verification.
 */
const SHOP_ENTRY_CUE = 'ledger_latch_01';
const SHOP_ENTRY_WINDOW_MS = 750;
const SFX_NAMES = [
  'hit', 'miss', 'death', 'bow', 'gold', 'nomana', 'cast_fire', 'cast_water', 'cast_air', 'cast_earth', 'cast_astral',
  'boom', 'heal', 'buff', 'curse', 'revive', 'click', 'step1', 'step2', SHOP_ENTRY_CUE, 'select_hero',
  'loot_normal', 'loot_magic', 'loot_rare', 'loot_set', 'loot_unique',
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
];
const base = (): string => import.meta.env.BASE_URL;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let ambBus: GainNode | null = null;
let silent: HTMLAudioElement | null = null;
const buffers = new Map<string, AudioBuffer>();
const pendingBuffers = new Map<string, Promise<void>>();
const running = new Map<Voice, AudioBufferSourceNode>();
let limiter = new VoiceLimiter();
let backgrounded = false;
let generation = 0;
let resuming: Promise<void> | null = null;
let suspending: Promise<void> | null = null;
let loading: Promise<void> | null = null;
export type MusicMode = 'explore' | 'battle' | 'town';
let sfxOn = true;
let musicWanted = false;
let musicMode: MusicMode = 'explore';
let ambSource: AudioBufferSourceNode | null = null;
let ambWanted = true;
let played = 0;
let pendingShopEntry: { deadline: number } | null = null;

let masterVol = 1.0;
let sfxVol = 1.0;
let musicVol = 1.0;
let ambVol = 1.0;

try {
  const mv = localStorage.getItem('thornvael.masterVol');
  if (mv !== null) masterVol = parseFloat(mv) || 0;
  const sv = localStorage.getItem('thornvael.sfxVol');
  if (sv !== null) sfxVol = parseFloat(sv) || 0;
  const muv = localStorage.getItem('thornvael.musicVol');
  if (muv !== null) musicVol = parseFloat(muv) || 0;
} catch { /* storage denied */ }

interface Track {
  el: HTMLAudioElement;
  gain: GainNode | null;
}
const tracks: Record<MusicMode, Track | null> = { explore: null, battle: null, town: null };

function silentWavUrl(): string {
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
}

function loadBuffer(name: string): Promise<void> {
  if (!ctx || buffers.has(name)) return Promise.resolve();
  const pending = pendingBuffers.get(name);
  if (pending) return pending;
  const context = ctx;
  const task = (async () => {
    try {
      // A distinct URL keeps existing chapter caches from serving the previous bow cue.
      const file = name === 'bow' ? 'yew_release_01' : name;
      const res = await fetch(`${base()}audio/${file}.m4a`);
      const data = await res.arrayBuffer();
      if (ctx !== context || context.state === 'closed') return;
      const buffer = await context.decodeAudioData(data);
      if (ctx === context && (context.state as string) !== 'closed') buffers.set(name, buffer);
    } catch {
      // a missing or undecodable file only loses that sound
    }
  })().finally(() => { if (pendingBuffers.get(name) === task) pendingBuffers.delete(name); });
  pendingBuffers.set(name, task);
  return task;
}

/** Call from a real user gesture. Safe to call repeatedly. */
export function unlock(): void {
  if (backgrounded) return;
  if (ctx?.state === 'closed') {
    // MediaElementSourceNodes belong to their original context: rebuild their elements too.
    generation++;
    stopAmbience();
    for (const source of running.values()) { try { source.stop(); } catch { /* ended */ } }
    running.clear();
    limiter = new VoiceLimiter();
    tracks.explore?.el.pause();
    tracks.battle?.el.pause();
    tracks.town?.el.pause();
    tracks.explore = tracks.battle = tracks.town = null;
    silent?.pause();
    if (silent) URL.revokeObjectURL(silent.src);
    silent = null;
    buffers.clear();
    pendingBuffers.clear();
    loading = null;
    resuming = suspending = null;
    ctx = null;
    master = sfxBus = musicBus = ambBus = null;
  }
  if (!ctx) {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9 * masterVol;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.8 * sfxVol;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.35 * musicVol;
    musicBus.connect(master);
    ambBus = ctx.createGain();
    ambBus.gain.value = 0.25 * ambVol;
    ambBus.connect(master);
    // Retain the existing iOS silent-media workaround; device behavior is not assumed.
    silent = new Audio(silentWavUrl());
    silent.loop = true;
    // Short buffer through the context inside the gesture: the iOS unlock trick.
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination);
    s.start(0);
    const context = ctx;
    loading = Promise.all(SFX_NAMES.map(loadBuffer)).then(() => { if (ctx === context) startAmbience(); });
  }
  restorePlayback();
  requestResume();
}

function stopAmbience(): void {
  try { ambSource?.stop(); } catch { /* already stopped */ }
  ambSource?.disconnect();
  ambSource = null;
}

function playMedia(el: HTMLAudioElement, wanted: () => boolean): void {
  if (backgrounded || !wanted()) return;
  void el.play().then(() => {
    if (backgrounded || !wanted()) el.pause();
  }).catch(() => undefined);
}

function restorePlayback(): void {
  if (!ctx || ctx.state === 'closed' || backgrounded) return;
  if (silent) {
    const current = silent;
    playMedia(current, () => silent === current);
  }
  if (musicWanted) fadeTrack(trackFor(musicMode), 1, 0.15);
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
  void loadBuffer('ambience').then(() => {
    const b = buffers.get('ambience');
    if (ctx !== context || generation !== epoch || backgrounded || context.state !== 'running' || !ambBus || !b || ambSource || !ambWanted) return;
    ambSource = ctx.createBufferSource();
    ambSource.buffer = b;
    ambSource.loop = true;
    ambSource.connect(ambBus);
    ambSource.start();
  }).catch(() => undefined);
}

export function setAmbience(on: boolean): void {
  ambWanted = on;
  generation++;
  if (!on) {
    stopAmbience();
  } else startAmbience();
}

/** Play a sound effect. `x`, `y` is the screen point of the source (omit for UI sounds); w, h the view size. */
export function play(name: string, priority = 1, at?: { x: number; y: number; w: number; h: number }): void {
  if (!ctx || !sfxBus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  const b = buffers.get(name);
  if (!b) return;
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
  node.connect(sfxBus);
  if (r.voice) {
    const v = r.voice;
    running.set(v, src);
    src.onended = () => running.delete(v);
  }
  src.start();
  played++;
}

/** Play once when the first gesture has unlocked audio and decoded the shop cue. */
export function playShopEntry(): void {
  cancelShopEntry();
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
  const ready = suspending ? suspending.then(() => resuming) : resuming;
  void Promise.all([loadBuffer(SHOP_ENTRY_CUE), ready]).then(() => {
    if (pendingShopEntry !== request) return;
    pendingShopEntry = null;
    if (ctx === context && performance.now() < request.deadline) play(SHOP_ENTRY_CUE, 5);
  });
}

export function cancelShopEntry(): void {
  pendingShopEntry = null;
}

/** The UI click. */
export function blip(): void {
  unlock();
  play('click', 5);
}

export function setSfx(on: boolean): void {
  sfxOn = on;
  if (!on) cancelShopEntry();
}

/** Rustle grab sound for dragging/picking up items. */
export function playPickupRustle(): void {
  unlock();
  if (!ctx || !sfxBus || !sfxOn || backgrounded || ctx.state !== 'running') return;
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
    gain.gain.setValueAtTime(0.28 * sfxVol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    noise.start(now);
  } catch {
    // silent fallback
  }
}

/** Equip leather/metal placement sound. */
export function playEquipSfx(isMetal = true): void {
  unlock();
  if (!ctx || !sfxBus || !sfxOn || backgrounded || ctx.state !== 'running') return;
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

      gain.gain.setValueAtTime(0.35 * sfxVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(sfxBus);
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

      gain.gain.setValueAtTime(0.3 * sfxVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(sfxBus);
      osc.start(now);
      osc.stop(now + 0.12);
    }
  } catch {
    // silent fallback
  }
}

/** Distinct procedural trader speech barks & tones. */
export type TraderRole = 'blacksmith' | 'barkeep' | 'alchemist' | 'guildmaster';
export type TraderEvent = 'greet' | 'farewell' | 'buy';

export function playTraderBark(trader: TraderRole, event: TraderEvent): void {
  unlock();
  if (!ctx || !sfxBus || !sfxOn || backgrounded || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(sfxBus);

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

      gain.gain.setValueAtTime(0.25 * sfxVol, now);
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
        const amp = (0.22 / (k + 1)) * sfxVol;
        anvilGain.gain.setValueAtTime(amp, now + 0.04);
        anvilGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38 + k * 0.05);
        anvil.connect(anvilGain);
        anvilGain.connect(sfxBus);
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
      thudGain.gain.setValueAtTime(0.35 * sfxVol, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      thud.connect(thudGain);
      thudGain.connect(sfxBus);
      thud.start(now);
      thud.stop(now + 0.15);

      const chords = event === 'greet'
        ? [130.8, 164.8, 196.0, 261.6] // C major warm triad + octave
        : event === 'buy'
        ? [146.8, 174.6, 220.0, 293.7] // D minor warm triad + octave
        : [110.0, 138.6, 164.8, 220.0]; // A minor warm triad + octave
      gain.gain.setValueAtTime(0.18 * sfxVol, now);
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
        bGain.gain.setValueAtTime(0.12 * sfxVol, bStart);
        bGain.gain.exponentialRampToValueAtTime(0.0001, bStart + 0.048);
        bOsc.connect(bGain);
        bGain.connect(sfxBus);
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

        sGain.gain.setValueAtTime((0.15 / (s + 1)) * sfxVol, now + 0.08);
        sGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
        sOsc.connect(sGain);
        sGain.connect(sfxBus);
        sOsc.start(now + 0.08);
        sOsc.stop(now + 0.38);
      }

    } else {
      // Guildmaster: Regal fanfare brass flourish
      const freqs = event === 'greet' ? [220, 330] : event === 'buy' ? [330, 440] : [220, 165];
      gain.gain.setValueAtTime(0.25 * sfxVol, now);
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

export function stopTownAmbience(): void {
  if (activeTownHubInterval !== null) {
    clearInterval(activeTownHubInterval);
    activeTownHubInterval = null;
  }
}

export type BiomeAmbience = 'act1_marsh' | 'act2_desert' | 'act3_cavern' | 'act4_hell';

export function playTownAmbience(hub: 'blacksmith' | 'tavern' | 'forest' | 'dungeon' | 'town' | BiomeAmbience | null): void {
  stopTownAmbience();
  if (!hub || !sfxOn || backgrounded) return;

  const triggerSound = () => {
    if (!ctx || !sfxBus || !sfxOn || backgrounded || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      if (hub === 'blacksmith') {
        // Distant anvil clink: multi-frequency resonant iron/anvil strike
        const anvil = ctx.createOscillator();
        const gain = ctx.createGain();
        anvil.type = 'sine';
        anvil.frequency.setValueAtTime(1480 + (Math.random() * 200 - 100), now);
        gain.gain.setValueAtTime(0.12 * sfxVol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        anvil.connect(gain);
        gain.connect(sfxBus);
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
        gain.gain.setValueAtTime(0.08 * sfxVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        pop.connect(ftr);
        ftr.connect(gain);
        gain.connect(sfxBus);
        pop.start(now);
      } else if (hub === 'dungeon' || hub === 'act3_cavern') {
        // Dense subterranean cavern: echoing water drops + deep rumblings
        const drop = ctx.createOscillator();
        const gain = ctx.createGain();
        const f = 1200 + Math.random() * 400;
        drop.frequency.setValueAtTime(f, now);
        drop.frequency.exponentialRampToValueAtTime(f * 1.4, now + 0.05);
        gain.gain.setValueAtTime(0.1 * sfxVol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        drop.connect(gain);
        gain.connect(sfxBus);
        drop.start(now);
        drop.stop(now + 0.28);

        // Echoing reflection
        const echo = ctx.createOscillator();
        const echoGain = ctx.createGain();
        echo.frequency.setValueAtTime(f * 0.95, now + 0.12);
        echo.frequency.exponentialRampToValueAtTime(f * 1.3, now + 0.17);
        echoGain.gain.setValueAtTime(0.04 * sfxVol, now + 0.12);
        echoGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        echo.connect(echoGain);
        echoGain.connect(sfxBus);
        echo.start(now + 0.12);
        echo.stop(now + 0.35);

        if (hub === 'act3_cavern') {
          // Deep subterranean stone rumble
          const rumble = ctx.createOscillator();
          const rGain = ctx.createGain();
          rumble.type = 'triangle';
          rumble.frequency.setValueAtTime(48, now);
          rumble.frequency.exponentialRampToValueAtTime(42, now + 0.8);
          rGain.gain.setValueAtTime(0.09 * sfxVol, now);
          rGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
          rumble.connect(rGain);
          rGain.connect(sfxBus);
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
        gain.gain.setValueAtTime(0.08 * sfxVol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        drop.connect(gain);
        gain.connect(sfxBus);
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
          cGain.gain.setValueAtTime(0.05 * sfxVol, now + 0.1);
          cGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
          crow.connect(cFtr);
          cFtr.connect(cGain);
          cGain.connect(sfxBus);
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
        gain.gain.setValueAtTime(0.06 * sfxVol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        sand.connect(ftr);
        ftr.connect(gain);
        gain.connect(sfxBus);
        sand.start(now);

        // Desert cicada buzz
        const cicada = ctx.createOscillator();
        const cGain = ctx.createGain();
        cicada.type = 'sine';
        cicada.frequency.setValueAtTime(5200, now);
        const am = ctx.createOscillator();
        const amGain = ctx.createGain();
        am.frequency.setValueAtTime(18, now);
        amGain.gain.value = 0.05 * sfxVol;
        am.connect(cGain.gain);
        cicada.connect(cGain);
        cGain.connect(sfxBus);
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
        gain.gain.setValueAtTime(0.12 * sfxVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        ember.connect(ftr);
        ftr.connect(gain);
        gain.connect(sfxBus);
        ember.start(now);

        // Sub-bass infernal drone (beating terror frequencies 36Hz and 39Hz)
        const drone1 = ctx.createOscillator();
        const drone2 = ctx.createOscillator();
        const dGain = ctx.createGain();
        drone1.type = 'triangle';
        drone2.type = 'triangle';
        drone1.frequency.setValueAtTime(36, now);
        drone2.frequency.setValueAtTime(39, now);
        dGain.gain.setValueAtTime(0.1 * sfxVol, now);
        dGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
        drone1.connect(dGain);
        drone2.connect(dGain);
        dGain.connect(sfxBus);
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
  playTownAmbience(biome);
}

function trackFor(mode: MusicMode): Track | null {
  if (!ctx || ctx.state === 'closed' || !musicBus || backgrounded) return null;
  let t = tracks[mode];
  if (!t) {
    const el = new Audio(`${base()}audio/music_${mode}.m4a`);
    el.loop = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    let gain: GainNode | null = null;
    try {
      // Routing through a gain node gives volume control on iOS, where <audio>.volume is read-only.
      const src = ctx.createMediaElementSource(el);
      gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(musicBus);
    } catch {
      el.volume = 0;
    }
    t = { el, gain };
    tracks[mode] = t;
  }
  return t;
}

function fadeTrack(t: Track | null, to: number, sec: number): void {
  if (!t || !ctx || ctx.state === 'closed') return;
  if (t.gain) {
    t.gain.gain.cancelScheduledValues(ctx.currentTime);
    t.gain.gain.setValueAtTime(t.gain.gain.value, ctx.currentTime);
    t.gain.gain.linearRampToValueAtTime(to, ctx.currentTime + sec);
  } else t.el.volume = to;
  if (to > 0) playMedia(t.el, () => musicWanted && tracks[musicMode] === t);
  else setTimeout(() => !musicWanted || tracks[musicMode] !== t ? t.el.pause() : undefined, sec * 1000 + 50);
}

/** Start or stop the music, and crossfade between the explore, battle, and town tracks. */
export function setMusic(on: boolean, mode: MusicMode = musicMode): void {
  if (on) unlock();
  const prev = tracks[musicMode];
  musicWanted = on;
  const changed = mode !== musicMode;
  musicMode = mode;
  if (!ctx) return;
  if (!on) {
    fadeTrack(tracks.explore, 0, 0.6);
    fadeTrack(tracks.battle, 0, 0.6);
    fadeTrack(tracks.town, 0, 0.6);
    return;
  }
  const next = trackFor(mode);
  if (changed) fadeTrack(prev, 0, 1.5);
  fadeTrack(next, 1, changed ? 1.5 : 1);
}

export function currentMusic(): 'off' | MusicMode {
  return musicWanted ? musicMode : 'off';
}

export function suspendAudio(): void {
  cancelShopEntry();
  backgrounded = true;
  generation++;
  stopAmbience();
  silent?.pause();
  tracks.explore?.el.pause();
  tracks.battle?.el.pause();
  tracks.town?.el.pause();
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
  if (master && ctx && ctx.state !== 'closed') {
    master.gain.setValueAtTime(masterVol * 0.9, ctx.currentTime);
  }
}

export function getMasterVolume(): number {
  return masterVol;
}

export function setSfxVolume(v: number): void {
  sfxVol = Math.max(0, Math.min(1, v));
  if (sfxBus && ctx && ctx.state !== 'closed') {
    sfxBus.gain.setValueAtTime(sfxVol * 0.8, ctx.currentTime);
  }
}

export function getSfxVolume(): number {
  return sfxVol;
}

export function setMusicVolume(v: number): void {
  musicVol = Math.max(0, Math.min(1, v));
  if (musicBus && ctx && ctx.state !== 'closed') {
    musicBus.gain.setValueAtTime(musicVol * 0.35, ctx.currentTime);
  }
}

export function getMusicVolume(): number {
  return musicVol;
}

export function setAmbienceVolume(v: number): void {
  ambVol = Math.max(0, Math.min(1, v));
  if (ambBus && ctx && ctx.state !== 'closed') {
    ambBus.gain.setValueAtTime(ambVol * 0.25, ctx.currentTime);
  }
}

export function getAmbienceVolume(): number {
  return ambVol;
}
