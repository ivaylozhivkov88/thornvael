import { VoiceLimiter, spatial, type Voice } from './audiologic';

/**
 * Web Audio engine: one context, three buses (sfx, music, ambience), a voice limit and pan by screen position.
 * Sound effects are short AAC files decoded once; music is streamed through an <audio> element so it never sits in memory as PCM.
 * Everything starts from a real user gesture (`unlock`) and survives the iOS mute switch with a looping silent element.
 */
const SFX_NAMES = [
  'hit', 'miss', 'death', 'bow', 'gold', 'nomana', 'cast_fire', 'cast_water', 'cast_air', 'cast_earth', 'cast_astral',
  'boom', 'heal', 'buff', 'curse', 'revive', 'click', 'step1', 'step2',
];
const base = (): string => import.meta.env.BASE_URL;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let ambBus: GainNode | null = null;
let silent: HTMLAudioElement | null = null;
const buffers = new Map<string, AudioBuffer>();
const running = new Map<Voice, AudioBufferSourceNode>();
const limiter = new VoiceLimiter();
let loading: Promise<void> | null = null;
let sfxOn = true;
let musicWanted = false;
let musicMode: 'explore' | 'battle' = 'explore';
let ambSource: AudioBufferSourceNode | null = null;
let ambWanted = true;
let played = 0;

interface Track {
  el: HTMLAudioElement;
  gain: GainNode | null;
}
const tracks: Record<'explore' | 'battle', Track | null> = { explore: null, battle: null };

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

async function loadBuffer(name: string): Promise<void> {
  if (!ctx || buffers.has(name)) return;
  try {
    const res = await fetch(`${base()}audio/${name}.m4a`);
    const data = await res.arrayBuffer();
    buffers.set(name, await ctx.decodeAudioData(data));
  } catch {
    // a missing or undecodable file only loses that sound
  }
}

/** Call from a real user gesture. Safe to call repeatedly. */
export function unlock(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.8;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.35;
    musicBus.connect(master);
    ambBus = ctx.createGain();
    ambBus.gain.value = 0.25;
    ambBus.connect(master);
    // A looping silent <audio> element moves iOS to the playback category so the mute switch does not silence Web Audio.
    silent = new Audio(silentWavUrl());
    silent.loop = true;
    void silent.play().catch(() => undefined);
    // Short buffer through the context inside the gesture: the iOS unlock trick.
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination);
    s.start(0);
    loading = Promise.all(SFX_NAMES.map(loadBuffer)).then(() => startAmbience());
  }
  if (ctx.state !== 'running') void ctx.resume();
}

function startAmbience(): void {
  if (!ctx || !ambBus || !ambWanted || ambSource) return;
  void loadBuffer('ambience').then(() => {
    const b = buffers.get('ambience');
    if (!ctx || !ambBus || !b || ambSource || !ambWanted) return;
    ambSource = ctx.createBufferSource();
    ambSource.buffer = b;
    ambSource.loop = true;
    ambSource.connect(ambBus);
    ambSource.start();
  });
}

export function setAmbience(on: boolean): void {
  ambWanted = on;
  if (!on) {
    try {
      ambSource?.stop();
    } catch {
      // already stopped
    }
    ambSource = null;
  } else startAmbience();
}

/** Play a sound effect. `x`, `y` is the screen point of the source (omit for UI sounds); w, h the view size. */
export function play(name: string, priority = 1, at?: { x: number; y: number; w: number; h: number }): void {
  if (!ctx || !sfxBus || !sfxOn || ctx.state !== 'running') return;
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

/** The UI click. */
export function blip(): void {
  unlock();
  play('click', 5);
}

export function setSfx(on: boolean): void {
  sfxOn = on;
}

function trackFor(mode: 'explore' | 'battle'): Track | null {
  if (!ctx || !musicBus) return null;
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
  if (!t || !ctx) return;
  if (t.gain) {
    t.gain.gain.cancelScheduledValues(ctx.currentTime);
    t.gain.gain.setValueAtTime(t.gain.gain.value, ctx.currentTime);
    t.gain.gain.linearRampToValueAtTime(to, ctx.currentTime + sec);
  } else t.el.volume = to;
  if (to > 0) void t.el.play().catch(() => undefined);
  else window.setTimeout(() => !musicWanted || tracks[musicMode] !== t ? t.el.pause() : undefined, sec * 1000 + 50);
}

/** Start or stop the music, and crossfade between the explore and battle tracks. */
export function setMusic(on: boolean, mode: 'explore' | 'battle' = musicMode): void {
  if (on) unlock();
  const prev = tracks[musicMode];
  musicWanted = on;
  const changed = mode !== musicMode;
  musicMode = mode;
  if (!ctx) return;
  if (!on) {
    fadeTrack(tracks.explore, 0, 0.6);
    fadeTrack(tracks.battle, 0, 0.6);
    return;
  }
  const next = trackFor(mode);
  if (changed) fadeTrack(prev, 0, 1.5);
  fadeTrack(next, 1, changed ? 1.5 : 1);
}

export function currentMusic(): 'off' | 'explore' | 'battle' {
  return musicWanted ? musicMode : 'off';
}

export function suspendAudio(): void {
  void ctx?.suspend();
  silent?.pause();
  tracks.explore?.el.pause();
  tracks.battle?.el.pause();
}

/** Back from the background: resume the context, and if the browser lost it (iOS), build a fresh one. */
export function resumeAudio(): void {
  if (!ctx) return;
  void ctx.resume().then(() => {
    if (ctx && (ctx.state as string) === 'interrupted') void ctx.close();
  });
  void silent?.play().catch(() => undefined);
  if (musicWanted) setMusic(true, musicMode);
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
