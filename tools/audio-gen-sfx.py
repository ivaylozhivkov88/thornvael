"""Reproducibly synthesizes missing SFX and weather/town ambient beds to public/audio/*.m4a (AAC 96k).

Usage:
  python tools/audio-gen-sfx.py           # generate all 16 missing SFX/ambient files
  python tools/audio-gen-sfx.py ui_error  # generate only matching cue(s)
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import wave
import numpy as np
from scipy.signal import butter, sosfilt

SR = 44100
TAU = 2.0 * np.pi
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT_DIR = os.path.join(ROOT, 'public', 'audio')


def _filt(x: np.ndarray, kind: str, freq: float | tuple[float, float]) -> np.ndarray:
    if isinstance(freq, tuple):
        lo, hi = max(20.0, freq[0]), min(SR * 0.48, freq[1])
        if lo >= hi:
            return x
        sos = butter(2, [lo, hi], btype='bandpass', fs=SR, output='sos')
    else:
        f = max(20.0, min(SR * 0.48, freq))
        sos = butter(2, f, btype=kind, fs=SR, output='sos')
    return sosfilt(sos, x)


def _pink_noise(rng: np.random.Generator, n: int) -> np.ndarray:
    w = rng.standard_normal(n)
    f = np.fft.rfft(w)
    k = np.arange(len(f), dtype=np.float64)
    k[0] = 1.0
    f /= np.sqrt(k)
    x = np.fft.irfft(f, n)
    return x / (np.std(x) + 1e-9)


def _normalize(x: np.ndarray, peak: float = 0.82) -> np.ndarray:
    m = float(np.max(np.abs(x)))
    return (x / m * peak) if m > 1e-9 else x


def _fade_edges(x: np.ndarray, fade_ms: float = 12.0) -> np.ndarray:
    n = min(int(SR * fade_ms / 1000.0), len(x) // 4)
    if n > 1:
        x = x.copy()
        x[:n] *= np.linspace(0.0, 1.0, n)
        x[-n:] *= np.linspace(1.0, 0.0, n)
    return x


def _seamless_loop(x: np.ndarray, crossfade_sec: float = 0.6) -> np.ndarray:
    c = int(SR * crossfade_sec)
    if c <= 0 or c * 2 >= len(x):
        return x
    fade = np.linspace(0.0, 1.0, c)
    out = x[:-c].copy()
    out[:c] = out[:c] * fade + x[-c:] * (1.0 - fade)
    return out


def gen_ui_error(rng: np.random.Generator) -> np.ndarray:
    sec = 0.24
    n = int(SR * sec)
    out = np.zeros(n)
    for idx, (start_s, dur_s, f0, f1) in enumerate([(0.0, 0.085, 165.0, 130.0), (0.10, 0.125, 135.0, 95.0)]):
        i0 = int(start_s * SR)
        m = min(int(dur_s * SR), n - i0)
        t = np.arange(m) / SR
        freq = np.linspace(f0, f1, m)
        phase = TAU * np.cumsum(freq) / SR
        tri = 2.0 / np.pi * np.arcsin(np.sin(phase))
        saw = 2.0 * ((phase / TAU) % 1.0) - 1.0
        tone = 0.65 * tri + 0.35 * saw
        tone = _filt(tone, 'bandpass', (120.0, 720.0))
        env = np.exp(-t * 16.0) * np.minimum(1.0, t / 0.008)
        out[i0:i0 + m] += tone * env * (0.9 if idx == 0 else 1.0)
    return _normalize(_fade_edges(out, 6.0), 0.78)


def _gen_step_snow(rng: np.random.Generator, pitch_bias: float) -> np.ndarray:
    sec = 0.21
    n = int(SR * sec)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    crunch_hi = _filt(noise, 'bandpass', (1400.0 * pitch_bias, 4200.0 * pitch_bias))
    crunch_lo = _filt(noise, 'bandpass', (180.0, 520.0))
    # Granular micro-bursts for snow crystal compression
    gran = np.zeros(n)
    for k in range(18):
        pos = int((0.015 + 0.13 * (k / 18.0) + rng.uniform(-0.004, 0.004)) * SR)
        if 0 <= pos < n - 120:
            w = np.exp(-np.arange(120) / 28.0) * rng.uniform(0.4, 1.0)
            gran[pos:pos + 120] += rng.standard_normal(120) * w
    gran = _filt(gran, 'highpass', 1800.0)
    env = np.exp(-((t - 0.06) ** 2) / (2 * 0.038 ** 2)) + 0.4 * np.exp(-((t - 0.12) ** 2) / (2 * 0.025 ** 2))
    out = (crunch_hi * 0.55 + crunch_lo * 0.35) * env + gran * 0.55
    return _normalize(_fade_edges(out, 8.0), 0.76)


def _gen_step_ash(rng: np.random.Generator, pitch_bias: float) -> np.ndarray:
    sec = 0.20
    n = int(SR * sec)
    t = np.arange(n) / SR
    pink = _pink_noise(rng, n)
    white = rng.standard_normal(n)
    powdery = _filt(pink, 'bandpass', (220.0, 950.0)) * np.exp(-t * 18.0)
    cinder = _filt(white, 'bandpass', (2400.0 * pitch_bias, 6200.0 * pitch_bias)) * np.exp(-t * 26.0)
    thud = np.sin(TAU * np.cumsum(np.linspace(115.0 * pitch_bias, 52.0, n)) / SR) * np.exp(-t * 32.0) * 0.4
    out = powdery * 0.65 + cinder * 0.45 + thud
    return _normalize(_fade_edges(out, 8.0), 0.76)


def gen_mon_aggro_beast(rng: np.random.Generator) -> np.ndarray:
    sec = 0.58
    n = int(SR * sec)
    t = np.arange(n) / SR
    f0 = np.interp(t, [0.0, 0.14, 0.45, sec], [95.0, 145.0, 82.0, 62.0])
    fm = 18.0 * np.sin(TAU * 28.0 * t)
    phase = TAU * np.cumsum(f0 + fm) / SR
    saw = 2.0 * ((phase / TAU) % 1.0) - 1.0
    snarl = _filt(saw, 'bandpass', (160.0, 680.0))
    breath = _filt(_pink_noise(rng, n), 'bandpass', (450.0, 1650.0)) * 0.55
    env = np.minimum(1.0, t / 0.04) * np.exp(-np.maximum(0.0, t - 0.18) * 4.2)
    out = (snarl * 0.8 + breath) * env
    return _normalize(_fade_edges(out), 0.84)


def gen_mon_aggro_undead(rng: np.random.Generator) -> np.ndarray:
    sec = 0.56
    n = int(SR * sec)
    t = np.arange(n) / SR
    hiss = _filt(_pink_noise(rng, n), 'bandpass', (700.0, 2600.0))
    hollow = np.sin(TAU * np.cumsum(np.linspace(210.0, 130.0, n)) / SR) * 0.35
    rattle = np.zeros(n)
    for k in range(9):
        pos = int((0.03 + k * 0.048 + rng.uniform(-0.008, 0.008)) * SR)
        if 0 <= pos < n - 300:
            rt = np.arange(300) / SR
            rattle[pos:pos + 300] += np.sin(TAU * rng.uniform(950, 1650) * rt) * np.exp(-rt * 45.0)
    env = np.minimum(1.0, t / 0.05) * np.exp(-np.maximum(0.0, t - 0.15) * 3.8)
    out = (hiss * 0.7 + hollow) * env + rattle * 0.45
    return _normalize(_fade_edges(out), 0.82)


def gen_mon_aggro_caster(rng: np.random.Generator) -> np.ndarray:
    sec = 0.62
    n = int(SR * sec)
    t = np.arange(n) / SR
    chord = (
        np.sin(TAU * 220.0 * t) * 0.4
        + np.sin(TAU * 233.1 * t) * 0.35
        + np.sin(TAU * 329.6 * t) * 0.3
        + np.sin(TAU * 466.2 * t) * 0.2
    )
    sweep = _filt(_pink_noise(rng, n), 'bandpass', (500.0, 2200.0)) * 0.35
    trem = 0.75 + 0.25 * np.sin(TAU * 9.5 * t)
    env = np.minimum(1.0, t / 0.08) * np.exp(-np.maximum(0.0, t - 0.2) * 3.4)
    out = (chord * trem + sweep) * env
    return _normalize(_fade_edges(out), 0.82)


def gen_mon_aggro_construct(rng: np.random.Generator) -> np.ndarray:
    sec = 0.68
    n = int(SR * sec)
    t = np.arange(n) / SR
    sub = np.sin(TAU * np.cumsum(np.linspace(78.0, 48.0, n)) / SR) * 0.75
    scrape = _filt(_pink_noise(rng, n), 'bandpass', (120.0, 480.0)) * 0.65
    clang = (np.sin(TAU * 310.0 * t) + 0.5 * np.sin(TAU * 487.0 * t)) * np.exp(-t * 9.0) * 0.4
    env = np.minimum(1.0, t / 0.06) * np.exp(-np.maximum(0.0, t - 0.22) * 3.2)
    out = (sub + scrape) * env + clang
    return _normalize(_fade_edges(out), 0.85)


def gen_death_caster_1(rng: np.random.Generator) -> np.ndarray:
    sec = 0.70
    n = int(SR * sec)
    t = np.arange(n) / SR
    f = np.geomspace(740.0, 145.0, n)
    wail = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t * 3.8) * 0.55
    dissolve = _filt(_pink_noise(rng, n), 'bandpass', (400.0, 3200.0)) * np.exp(-t * 4.5) * 0.5
    pulse = np.sin(TAU * 110.0 * t) * np.exp(-t * 14.0) * 0.45
    return _normalize(_fade_edges(wail + dissolve + pulse), 0.82)


def gen_death_construct_1(rng: np.random.Generator) -> np.ndarray:
    sec = 0.78
    n = int(SR * sec)
    t = np.arange(n) / SR
    thud = np.sin(TAU * np.cumsum(np.linspace(110.0, 34.0, n)) / SR) * np.exp(-t * 6.5) * 0.75
    rubble = np.zeros(n)
    for k in range(10):
        pos = int((0.04 + k * 0.062 + rng.uniform(-0.012, 0.012)) * SR)
        if 0 <= pos < n - 800:
            rt = np.arange(800) / SR
            chunk = _filt(rng.standard_normal(800), 'bandpass', (160.0, 900.0)) * np.exp(-rt * 18.0)
            rubble[pos:pos + 800] += chunk * (1.0 - k * 0.07)
    return _normalize(_fade_edges(thud + rubble * 0.85), 0.85)


def gen_death_undead_1(rng: np.random.Generator) -> np.ndarray:
    sec = 0.65
    n = int(SR * sec)
    t = np.arange(n) / SR
    exhale = _filt(_pink_noise(rng, n), 'bandpass', (240.0, 1100.0)) * np.exp(-t * 4.2) * 0.55
    bones = np.zeros(n)
    for k in range(7):
        pos = int((0.02 + k * 0.075 + rng.uniform(-0.01, 0.01)) * SR)
        if 0 <= pos < n - 600:
            rt = np.arange(600) / SR
            f_bone = rng.uniform(750.0, 1450.0)
            clack = (np.sin(TAU * f_bone * rt) + 0.5 * np.sin(TAU * f_bone * 1.62 * rt)) * np.exp(-rt * 35.0)
            bones[pos:pos + 600] += clack * (0.9 - k * 0.08)
    return _normalize(_fade_edges(exhale + bones * 0.75), 0.82)


def gen_death_insect_1(rng: np.random.Generator) -> np.ndarray:
    sec = 0.52
    n = int(SR * sec)
    t = np.arange(n) / SR
    f = np.geomspace(2200.0, 340.0, n)
    screech = np.sin(TAU * np.cumsum(f + 65.0 * np.sin(TAU * 42.0 * t)) / SR) * np.exp(-t * 5.8) * 0.5
    crunch = _filt(rng.standard_normal(n), 'bandpass', (1200.0, 4800.0)) * np.exp(-t * 14.0) * 0.65
    return _normalize(_fade_edges(screech + crunch), 0.82)


def gen_amb_weather_rain(rng: np.random.Generator) -> np.ndarray:
    sec = 10.6
    n = int(SR * sec)
    t = np.arange(n) / SR
    pink = _pink_noise(rng, n)
    white = rng.standard_normal(n)
    steady = _filt(pink, 'bandpass', (280.0, 3400.0)) * 0.65
    sheen = _filt(white, 'bandpass', (3600.0, 8200.0)) * 0.22
    sway = 0.82 + 0.18 * np.sin(TAU * t / 4.5)
    drops = np.zeros(n)
    for _ in range(45):
        pos = int(rng.uniform(0.1, sec - 0.8) * SR)
        m = 1200
        rt = np.arange(m) / SR
        df = rng.uniform(900.0, 2200.0)
        drops[pos:pos + m] += np.sin(TAU * df * rt) * np.exp(-rt * 38.0) * 0.14
    bed = _seamless_loop((steady + sheen) * sway + drops, 0.6)
    return _normalize(bed, 0.58)


def gen_amb_weather_embers(rng: np.random.Generator) -> np.ndarray:
    sec = 10.6
    n = int(SR * sec)
    t = np.arange(n) / SR
    rumble = _filt(_pink_noise(rng, n), 'bandpass', (45.0, 220.0)) * 0.75
    breeze = _filt(_pink_noise(rng, n), 'bandpass', (260.0, 900.0)) * (0.4 + 0.2 * np.sin(TAU * t / 3.8))
    crackles = np.zeros(n)
    for _ in range(70):
        pos = int(rng.uniform(0.05, sec - 0.7) * SR)
        m = 360
        rt = np.arange(m) / SR
        snap = _filt(rng.standard_normal(m), 'bandpass', (1600.0, 5600.0)) * np.exp(-rt * 55.0)
        crackles[pos:pos + m] += snap * rng.uniform(0.25, 0.75)
    bed = _seamless_loop(rumble + breeze * 0.45 + crackles * 0.55, 0.6)
    return _normalize(bed, 0.58)


def gen_town_market_crowd(rng: np.random.Generator) -> np.ndarray:
    sec = 10.6
    n = int(SR * sec)
    t = np.arange(n) / SR
    murmur = np.zeros(n)
    for lo, hi, rate in [(180.0, 480.0, 0.7), (450.0, 1100.0, 1.3), (850.0, 1900.0, 2.1)]:
        layer = _filt(_pink_noise(rng, n), 'bandpass', (lo, hi))
        mod = 0.65 + 0.35 * np.sin(TAU * rate * t + rng.uniform(0, TAU))
        murmur += layer * mod
    clatter = np.zeros(n)
    for _ in range(16):
        pos = int(rng.uniform(0.2, sec - 0.8) * SR)
        m = 900
        rt = np.arange(m) / SR
        clatter[pos:pos + m] += _filt(rng.standard_normal(m), 'bandpass', (500.0, 1800.0)) * np.exp(-rt * 28.0) * 0.22
    bed = _seamless_loop(murmur * 0.55 + clatter, 0.6)
    return _normalize(bed, 0.55)


GENERATORS = {
    'ui_error': gen_ui_error,
    'step_snow_1': lambda r: _gen_step_snow(r, 1.0),
    'step_snow_2': lambda r: _gen_step_snow(r, 1.12),
    'step_ash_1': lambda r: _gen_step_ash(r, 1.0),
    'step_ash_2': lambda r: _gen_step_ash(r, 0.91),
    'mon_aggro_beast': gen_mon_aggro_beast,
    'mon_aggro_undead': gen_mon_aggro_undead,
    'mon_aggro_caster': gen_mon_aggro_caster,
    'mon_aggro_construct': gen_mon_aggro_construct,
    'death_caster_1': gen_death_caster_1,
    'death_construct_1': gen_death_construct_1,
    'death_undead_1': gen_death_undead_1,
    'death_insect_1': gen_death_insect_1,
    'amb_weather_rain': gen_amb_weather_rain,
    'amb_weather_embers': gen_amb_weather_embers,
    'town_market_crowd': gen_town_market_crowd,
}


def write_m4a(name: str, samples: np.ndarray) -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f'{name}.m4a')
    with tempfile.TemporaryDirectory() as td:
        wav_path = os.path.join(td, f'{name}.wav')
        with wave.open(wav_path, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SR)
            pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype('<i2')
            wf.writeframes(pcm.tobytes())
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path, '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out_path],
            check=True,
        )
    return out_path


def main() -> None:
    targets = sys.argv[1:] or list(GENERATORS.keys())
    unknown = [t for t in targets if t not in GENERATORS]
    if unknown:
        raise SystemExit(f'Unknown SFX target(s): {", ".join(unknown)}')
    for idx, name in enumerate(targets):
        rng = np.random.default_rng(1000 + idx)
        samples = GENERATORS[name](rng)
        path = write_m4a(name, samples)
        size_kb = os.path.getsize(path) / 1024.0
        print(f'wrote {name}.m4a ({size_kb:.1f} KiB)')


if __name__ == '__main__':
    main()
