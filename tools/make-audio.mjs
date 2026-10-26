// Generates every shipped sound from scratch (own synthesis, no samples) and encodes it as AAC .m4a with ffmpeg.
// Usage: node tools/make-audio.mjs    Output: public/audio/*.m4a    Listed in assets.json as own work.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const OUT = fileURLToPath(new URL('../public/audio/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'thornvael-audio-'));

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const TAU = Math.PI * 2;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

const buf = (sec) => new Float32Array(Math.round(sec * SR));
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
const lp = (x, fc) => {
  const a = 1 - Math.exp((-TAU * fc) / SR);
  let y = 0;
  return x.map((v) => (y += a * (v - y)));
};
const hp = (x, fc) => {
  const l = lp(x, fc);
  return x.map((v, i) => v - l[i]);
};
const noise = (sec) => buf(sec).map(() => rnd());
const osc = (type, f0, f1, sec, phase0 = 0) => {
  const out = buf(sec);
  let ph = phase0;
  for (let i = 0; i < out.length; i++) {
    const f = f0 + ((f1 - f0) * i) / out.length;
    ph += (TAU * f) / SR;
    const s = Math.sin(ph);
    out[i] = type === 'sine' ? s : type === 'square' ? (s >= 0 ? 0.6 : -0.6) : type === 'saw' ? 2 * ((ph / TAU) % 1) - 1 : (2 / Math.PI) * Math.asin(s);
  }
  return out;
};
const shape = (x, a, d, g = 1) => x.map((v, i) => v * env(i / SR, a, d) * g);
const mix = (...parts) => {
  const full = parts.map((p) => ({ at: 0, g: 1, ...p }));
  const n = Math.max(...full.map((p) => Math.round(p.at * SR) + p.x.length));
  const out = new Float32Array(n);
  for (const { x, at, g } of full) {
    const o = Math.round(at * SR);
    for (let i = 0; i < x.length; i++) out[o + i] += x[i] * g;
  }
  return out;
};
const fade = (x, ms = 12) => {
  const n = Math.round((ms / 1000) * SR);
  for (let i = 0; i < n && i < x.length; i++) {
    x[i] *= i / n;
    x[x.length - 1 - i] *= i / n;
  }
  return x;
};
const peak = (x, level = 0.8) => {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return x.map((v) => (v / (m || 1)) * level);
};
const echo = (x, delay, fb, tail) => {
  const d = Math.round(delay * SR);
  const out = new Float32Array(x.length + Math.round(tail * SR));
  out.set(x);
  for (let i = d; i < out.length; i++) out[i] += out[i - d] * fb;
  return out;
};
const sweepNoise = (sec, f0, f1) => {
  // noise through a low pass whose cutoff glides from f0 to f1
  const n = noise(sec);
  let y = 0;
  return n.map((v, i) => {
    const fc = f0 + ((f1 - f0) * i) / n.length;
    y += (1 - Math.exp((-TAU * fc) / SR)) * (v - y);
    return y * 3;
  });
};

const SFX = {
  hit: () => mix({ x: shape(lp(noise(0.14), 2200), 0.001, 0.035) }, { x: shape(osc('sine', 140, 55, 0.14), 0.002, 0.05), g: 0.9 }),
  miss: () => shape(hp(sweepNoise(0.22, 600, 3200), 500), 0.04, 0.07, 0.6),
  death: () => shape(lp(osc('saw', 260, 70, 0.6), 900), 0.01, 0.22),
  bow: () => mix({ x: shape(osc('triangle', 720, 260, 0.18), 0.001, 0.05) }, { x: shape(hp(noise(0.06), 3000), 0.001, 0.012), g: 0.5 }),
  gold: () => mix({ x: shape(osc('sine', 1320, 1320, 0.25), 0.002, 0.07) }, { x: shape(osc('sine', 1760, 1760, 0.3), 0.002, 0.1), at: 0.07, g: 0.8 }),
  nomana: () => mix({ x: shape(osc('square', 150, 130, 0.14), 0.005, 0.05), g: 0.6 }, { x: shape(osc('square', 130, 110, 0.18), 0.005, 0.06), at: 0.16, g: 0.6 }),
  cast_fire: () => mix({ x: shape(sweepNoise(0.5, 300, 2600), 0.12, 0.2) }, { x: shape(hp(noise(0.5), 4000), 0.3, 0.1), g: 0.25 }),
  cast_water: () => {
    const parts = [0, 1, 2, 3].map((k) => ({ x: shape(osc('sine', 500 + k * 130, 900 + k * 220, 0.14), 0.01, 0.05), at: k * 0.08, g: 0.7 }));
    return mix(...parts, { x: shape(lp(noise(0.4), 900), 0.1, 0.12), g: 0.3 });
  },
  cast_air: () => mix({ x: shape(hp(sweepNoise(0.45, 900, 4200), 700), 0.1, 0.16), g: 0.8 }, { x: shape(osc('sine', 1500, 2400, 0.4), 0.15, 0.1), g: 0.18 }),
  cast_earth: () => mix({ x: shape(osc('sine', 75, 50, 0.5), 0.005, 0.2) }, { x: shape(lp(noise(0.5), 500), 0.003, 0.14), g: 0.9 }),
  cast_astral: () => {
    const tone = (f, g) => {
      const o = osc('sine', f, f * 1.02, 0.7);
      return { x: shape(o.map((v, i) => v * (0.6 + 0.4 * Math.sin((TAU * 7 * i) / SR))), 0.08, 0.28), g };
    };
    return mix(tone(520, 0.5), tone(780, 0.4), tone(1040, 0.3));
  },
  boom: () => mix({ x: shape(lp(noise(0.7), 700), 0.002, 0.2) }, { x: shape(osc('sine', 70, 38, 0.7), 0.003, 0.25), g: 0.9 }),
  heal: () => mix(...[523.3, 659.3, 784, 1046.5].map((f, k) => ({ x: shape(osc('sine', f, f, 0.4), 0.005, 0.12), at: k * 0.09, g: 0.55 }))),
  buff: () => mix({ x: shape(osc('triangle', 440, 880, 0.35), 0.01, 0.12) }, { x: shape(osc('sine', 880, 1320, 0.3), 0.01, 0.1), at: 0.12, g: 0.5 }),
  curse: () => mix({ x: shape(lp(osc('saw', 330, 110, 0.5), 700), 0.01, 0.18) }, { x: shape(lp(osc('saw', 335, 112, 0.5), 700), 0.01, 0.18), g: 0.8 }),
  revive: () => mix(...[392, 523.3, 659.3, 784].map((f, k) => ({ x: shape(osc('sine', f, f * 1.01, 0.6), 0.02, 0.25), at: k * 0.12, g: 0.5 }))),
  click: () => shape(osc('triangle', 900, 700, 0.06), 0.002, 0.02, 0.8),
  step1: () => shape(lp(noise(0.09), 700), 0.004, 0.025, 1),
  step2: () => shape(lp(noise(0.09), 520), 0.004, 0.03, 1),
};

function ambience() {
  // Wind: slowly breathing low-passed noise; the last 0.6 s fades into the first so the loop has no seam.
  const sec = 8;
  const n = noise(sec + 0.6);
  const l = lp(lp(n, 420), 600);
  const out = l.map((v, i) => v * (0.5 + 0.5 * Math.sin((TAU * i) / (SR * 4))) * 4);
  const body = out.slice(0, Math.round(sec * SR));
  const x = Math.round(0.6 * SR);
  for (let i = 0; i < x; i++) {
    const w = i / x;
    body[i] = body[i] * w + out[body.length + i] * (1 - w);
  }
  return body;
}

// ---- music ----
const bassOf = (m) => m - 24;
function triad(root, minor) {
  return [root, root + (minor ? 3 : 4), root + 7];
}
function exploreTrack() {
  const bpm = 72;
  const beat = 60 / bpm;
  const bars = 12;
  const total = bars * 4 * beat;
  const out = new Float32Array(Math.round((total + 2.5) * SR));
  const prog = [[57, true], [53, false], [60, false], [55, false], [57, true], [53, false], [60, false], [55, false], [50, true], [57, true], [52, false], [57, true]];
  const add = (x, at, g) => {
    const o = Math.round(at * SR);
    for (let i = 0; i < x.length && o + i < out.length; i++) out[o + i] += x[i] * g;
  };
  prog.forEach(([root, minor], b) => {
    const t0 = b * 4 * beat;
    for (const m of triad(root, minor)) add(shape(osc('triangle', hz(m), hz(m), 4 * beat + 1.2), 0.9, 1.6), t0, 0.16);
    add(shape(osc('sine', hz(bassOf(root)), hz(bassOf(root)), 2 * beat + 0.6), 0.02, 0.9), t0, 0.5);
    add(shape(osc('sine', hz(bassOf(root)), hz(bassOf(root)), 2 * beat + 0.6), 0.02, 0.9), t0 + 2 * beat, 0.4);
    const tones = [...triad(root, minor), root + 12];
    for (let k = 0; k < 8; k++) {
      const m = tones[[0, 1, 2, 3, 2, 1, 3, 2][k]] + 12;
      add(shape(osc('triangle', hz(m), hz(m), 0.9), 0.004, 0.22), t0 + k * 0.5 * beat, 0.2);
    }
    const pent = [69, 72, 74, 76, 79, 81];
    if (b % 2 === 1 || b === 0) {
      const m = pent[Math.floor(Math.abs(rnd()) * pent.length)];
      add(shape(osc('sine', hz(m), hz(m), 1.6), 0.03, 0.5), t0 + beat, 0.25);
    }
  });
  const wet = echo(out, 0.37, 0.38, 0);
  return wet.slice(0, Math.round(total * SR)).map((v, i) => v + (i < Math.round(2.5 * SR) ? wet[Math.round(total * SR) + i] : 0));
}
function battleTrack() {
  const bpm = 132;
  const beat = 60 / bpm;
  const bars = 12;
  const total = bars * 4 * beat;
  const out = new Float32Array(Math.round((total + 1.5) * SR));
  const add = (x, at, g) => {
    const o = Math.round(at * SR);
    for (let i = 0; i < x.length && o + i < out.length; i++) out[o + i] += x[i] * g;
  };
  const prog = [[50, true], [46, false], [48, false], [50, true], [50, true], [46, false], [43, true], [45, false], [50, true], [46, false], [48, false], [45, false]];
  const kick = shape(osc('sine', 130, 42, 0.3), 0.002, 0.09);
  const snare = mix({ x: shape(hp(noise(0.25), 1200), 0.001, 0.06) }, { x: shape(osc('triangle', 220, 160, 0.2), 0.001, 0.04), g: 0.5 });
  const hat = shape(hp(noise(0.08), 6000), 0.001, 0.015);
  prog.forEach(([root, minor], b) => {
    const t0 = b * 4 * beat;
    for (let k = 0; k < 4; k++) {
      add(kick, t0 + k * beat, 0.9);
      if (k % 2 === 1) add(snare, t0 + k * beat, 0.55);
    }
    for (let k = 0; k < 8; k++) add(hat, t0 + k * 0.5 * beat, k % 2 ? 0.2 : 0.12);
    for (let k = 0; k < 8; k++) {
      const m = bassOf(root) + 12 + (k === 3 || k === 6 ? 7 : 0);
      add(shape(lp(osc('saw', hz(m), hz(m), 0.5 * beat), 520), 0.004, 0.18), t0 + k * 0.5 * beat, 0.4);
    }
    for (const at of [0, 2.5]) {
      for (const m of triad(root + 12, minor)) add(shape(lp(osc('saw', hz(m), hz(m), beat), 1800), 0.004, 0.2), t0 + at * beat, 0.12);
    }
    const lead = [root + 24, root + 27, root + 31, root + 26];
    add(shape(osc('square', hz(lead[b % 4]), hz(lead[b % 4]), 0.7), 0.01, 0.2), t0 + 3 * beat, 0.1);
  });
  const wet = echo(out, 0.23, 0.3, 0);
  return wet.slice(0, Math.round(total * SR)).map((v, i) => v + (i < Math.round(1.5 * SR) ? wet[Math.round(total * SR) + i] : 0));
}

function save(name, samples, kbps) {
  const x = fade(peak(samples), 8);
  const pcm = Buffer.alloc(44 + x.length * 2);
  pcm.write('RIFF', 0);
  pcm.writeUInt32LE(36 + x.length * 2, 4);
  pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(SR, 24);
  pcm.writeUInt32LE(SR * 2, 28);
  pcm.writeUInt16LE(2, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36);
  pcm.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  const wav = join(tmp, `${name}.wav`);
  writeFileSync(wav, pcm);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', `${kbps}k`, '-movflags', '+faststart', join(OUT, `${name}.m4a`)], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${name}`);
  console.log(`${name}.m4a  ${(x.length / SR).toFixed(1)} s`);
}

for (const [name, fn] of Object.entries(SFX)) save(name, fn(), 48);
save('ambience', ambience(), 40);
save('music_explore', exploreTrack(), 64);
save('music_battle', battleTrack(), 64);
rmSync(tmp, { recursive: true, force: true });
