/** Phase 2 audio spike: synthesised blip and looping tune (no files). Phase 5 replaces this with the AAC engine. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let silent: HTMLAudioElement | null = null;
let musicTimer: number | null = null;
let nextNote = 0;
let step = 0;

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

/** Call from a real user gesture. Safe to call repeatedly. */
export function unlock(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
    // A looping silent <audio> element moves iOS to the playback category so the mute switch does not silence Web Audio.
    silent = new Audio(silentWavUrl());
    silent.loop = true;
    void silent.play().catch(() => undefined);
  }
  if (ctx.state !== 'running') void ctx.resume();
}

function tone(freq: number, at: number, dur: number, type: OscillatorType, gain: number): void {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export function blip(): void {
  unlock();
  if (ctx) {
    tone(660, ctx.currentTime, 0.12, 'square', 0.5);
    tone(990, ctx.currentTime + 0.08, 0.16, 'square', 0.4);
  }
}

const TUNE = [220, 261.6, 329.6, 261.6, 196, 246.9, 293.7, 246.9]; // original arpeggio, A minor / G major
export function setMusic(on: boolean): void {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  if (!on) return;
  unlock();
  if (!ctx) return;
  nextNote = ctx.currentTime + 0.05;
  musicTimer = window.setInterval(() => {
    if (!ctx) return;
    while (nextNote < ctx.currentTime + 0.5) {
      tone(TUNE[step % TUNE.length], nextNote, 0.4, 'triangle', 0.6);
      if (step % 8 === 0) tone(TUNE[0] / 2, nextNote, 1.4, 'sine', 0.5);
      nextNote += 0.3;
      step++;
    }
  }, 150);
}

export function suspendAudio(): void {
  void ctx?.suspend();
  silent?.pause();
}
export function resumeAudio(): void {
  if (!ctx) return;
  void ctx.resume();
  void silent?.play().catch(() => undefined);
}
export function audioState(): string {
  return ctx ? ctx.state : 'locked';
}
