"""Thornvael soundtrack generator (own synthesis, no samples, no external material).

Renders three seamless loops (town, explore, battle) with numpy and encodes them
as AAC .m4a through FFmpeg. Deterministic: fixed seeds, so reruns give the same audio.

Usage (from game/):  python tools/gen-soundtrack.py [town|explore|battle ...]
Output: public/audio/music_<mode>.m4a   (listed in assets.json as own work)
"""
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
from scipy.signal import lfilter

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "public" / "audio"


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


class Mix:
    """Stereo buffer that wraps note tails back to the start so the loop is seamless."""

    def __init__(self, seconds):
        self.n = int(round(seconds * SR))
        self.buf = np.zeros((2, self.n), dtype=np.float64)

    def add(self, sig, t, pan=0.0, gain=1.0):
        start = int(round(t * SR)) % self.n
        l = gain * np.sqrt(0.5 * (1 - pan))
        r = gain * np.sqrt(0.5 * (1 + pan))
        idx = (start + np.arange(len(sig))) % self.n
        np.add.at(self.buf[0], idx, sig * l)
        np.add.at(self.buf[1], idx, sig * r)


def lowpass(x, fc):
    a = 1 - np.exp(-2 * np.pi * fc / SR)
    return lfilter([a], [1, a - 1], x)


def adsr(n, a, d, s, r):
    t = np.arange(n) / SR
    dur = n / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = np.clip((dur - t) / max(r, 1e-4), 0, 1)
    return e * rel


def pluck(rng, f, sec, bright=0.5):
    """Karplus-Strong string (lute / harp)."""
    n = int(sec * SR)
    p = max(2, int(SR / f))
    ring = rng.uniform(-1, 1, p)
    out = np.empty(n)
    damp = 0.4985 + 0.0013 * bright
    for i in range(n):
        j = i % p
        out[i] = ring[j]
        ring[j] = damp * (ring[j] + ring[(j + 1) % p])
    return out * adsr(n, 0.002, 9, 1, 0.05)


def pad(f, sec, detune=0.004, bright=1200):
    n = int(sec * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for k, d in enumerate((-detune, 0, detune)):
        ph = 2 * np.pi * f * (1 + d) * t + k
        s += 2 * ((ph / (2 * np.pi)) % 1) - 1
    s = lowpass(s / 3, bright)
    return s * adsr(n, sec * 0.3, 1, 1, sec * 0.35)


def bell(f, sec):
    n = int(sec * SR)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * np.exp(-t * 3)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 1.6)


def drum(rng, f0, sec, noise=0.3):
    n = int(sec * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + 1.6 * np.exp(-t * 28))
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7)
    hit = lowpass(rng.uniform(-1, 1, n), 2500) * np.exp(-t * 40) * noise
    return body + hit


def string_saw(f, sec, bright=900):
    n = int(sec * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * f * t
    s = (2 * ((ph / (2 * np.pi)) % 1) - 1) + 0.5 * (2 * ((ph * 1.003 / (2 * np.pi)) % 1) - 1)
    return lowpass(s / 1.5, bright) * adsr(n, 0.01, 0.15, 0.6, 0.04)


def wind(rng, sec):
    n = int(sec * SR)
    w = lowpass(rng.uniform(-1, 1, n), 400)
    t = np.arange(n) / SR
    return w * (0.6 + 0.4 * np.sin(2 * np.pi * t / sec * 3))


def reverb(buf, wet=0.25):
    """Cheap feedback-comb reverb applied circularly (keeps the loop seamless)."""
    out = buf.copy()
    for ch in range(2):
        x = buf[ch]
        for k, (dly, g) in enumerate(((1557, 0.5), (1617, 0.48), (1491, 0.46), (1422, 0.44))):
            d = dly + 23 * ch
            y = np.zeros_like(x)
            # three passes over the circular buffer approximate the infinite tail
            for _ in range(6):
                y = x + g * np.roll(y, d)
            out[ch] += wet * 0.25 * (y - x)
    return out


def chord_tones(root, quality):
    return [root, root + (3 if quality == "m" else 4), root + 7]


def render_town():
    rng = np.random.default_rng(7101)
    bpm, beats = 72, 60
    sec = beats * 60 / bpm  # 50 s
    m = Mix(sec)
    beat = 60 / bpm
    prog = [(50, "m"), (48, "M"), (46, "M"), (45, "M"), (50, "m"), (53, "M"), (48, "M"), (45, "M")]
    bar = sec / len(prog)
    melody = [62, 65, 64, 62, 60, 62, 57, 0, 62, 65, 67, 69, 67, 65, 64, 62]
    for i, (r, q) in enumerate(prog):
        t0 = i * bar
        for k, note in enumerate(chord_tones(r + 12, q)):
            m.add(pad(hz(note), bar * 1.2, bright=900), t0, pan=(k - 1) * 0.5, gain=0.07)
        m.add(pad(hz(r - 12), bar * 1.1, bright=300), t0, gain=0.12)
        tones = chord_tones(r + 12, q) + [r + 24]
        for s in range(int(bar / (beat / 2))):
            if rng.random() < 0.82:
                n = tones[(s * 2 + i) % len(tones)]
                m.add(pluck(rng, hz(n), 1.6), t0 + s * beat / 2 + rng.uniform(0, 0.012), pan=-0.3, gain=0.22)
    for j, note in enumerate(melody * 2):
        if note:
            m.add(bell(hz(note + 12), 2.0), j * beat * 1.875, pan=0.35, gain=0.08)
    return reverb(m.buf, 0.35)


def render_explore():
    rng = np.random.default_rng(7202)
    bpm, beats = 70, 64
    sec = beats * 60 / bpm  # ~54.9 s
    m = Mix(sec)
    beat = 60 / bpm
    prog = [(45, "m"), (41, "M"), (43, "M"), (40, "m")]
    bar = sec / (len(prog) * 2)
    for i in range(len(prog) * 2):
        r, q = prog[i % len(prog)]
        t0 = i * bar
        for k, note in enumerate(chord_tones(r + 12, q) + [r + 19]):
            m.add(pad(hz(note), bar * 1.3, detune=0.006, bright=700), t0, pan=(k - 1.5) * 0.4, gain=0.06)
        m.add(pad(hz(r - 12), bar * 1.2, bright=220), t0, gain=0.14)
        arp = chord_tones(r + 24, q) + [r + 31, r + 36]
        for s in range(8):
            if rng.random() < 0.6:
                m.add(pluck(rng, hz(arp[(s * 3 + i) % len(arp)]), 2.5, bright=0.9), t0 + s * beat / 2, pan=0.45, gain=0.12)
    m.add(wind(rng, sec), 0, pan=-0.2, gain=0.05)
    for _ in range(6):
        m.add(bell(hz(rng.choice([69, 72, 76, 81])), 3.0), rng.uniform(0, sec), pan=rng.uniform(-0.7, 0.7), gain=0.05)
    return reverb(m.buf, 0.45)


def render_battle():
    rng = np.random.default_rng(7303)
    bpm, beats = 124, 80
    sec = beats * 60 / bpm  # ~38.7 s
    m = Mix(sec)
    beat = 60 / bpm
    # D phrygian ostinato
    ost = [38, 38, 50, 38, 39, 38, 50, 41]
    prog = [38, 39, 36, 38, 38, 41, 39, 36, 38, 39]
    for b in range(beats):
        t = b * beat
        m.add(drum(rng, 55, 0.6, 0.25), t, gain=0.45 if b % 4 in (0, 3) else 0.25)
        if b % 2 == 1:
            m.add(drum(rng, 140, 0.25, 0.8), t, pan=0.25, gain=0.18)
        if b % 8 == 7:
            m.add(drum(rng, 90, 0.4, 0.5), t + beat / 2, pan=-0.25, gain=0.2)
        root = prog[(b // 8) % len(prog)] - 38
        for h in range(2):
            n = ost[(b * 2 + h) % len(ost)] + root
            m.add(string_saw(hz(n), beat / 2 * 0.95), t + h * beat / 2, pan=-0.3, gain=0.12)
    for bar in range(beats // 8):
        r = prog[bar % len(prog)] + 12
        for k, note in enumerate([r, r + 3, r + 7]):
            m.add(string_saw(hz(note), beat * 1.5, bright=1600), bar * 8 * beat, pan=(k - 1) * 0.5, gain=0.07)
            m.add(pad(hz(note + 12), beat * 8, bright=1100), bar * 8 * beat, pan=(1 - k) * 0.4, gain=0.04)
    return reverb(m.buf, 0.2)


TRACKS = {"town": render_town, "explore": render_explore, "battle": render_battle}


def encode(buf, path):
    peak = np.max(np.abs(buf)) or 1.0
    buf = np.tanh(buf / peak * 1.3) * 0.89
    pcm = (buf.T * 32767).astype("<i2")
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "t.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "aac", "-b:a", "112k",
             "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", str(path)],
            check=True,
        )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    names = sys.argv[1:] or list(TRACKS)
    for name in names:
        buf = TRACKS[name]()
        encode(buf, OUT / f"music_{name}.m4a")
        print(f"music_{name}.m4a  {buf.shape[1] / SR:.1f}s")


if __name__ == "__main__":
    main()
