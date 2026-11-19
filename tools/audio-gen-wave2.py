"""Reproducibly synthesizes Audio Wave 2 assets to public/audio/*.m4a (AAC 96k/128k, < 3 MiB).

Synthesizes 20 assets:
  - 6 NPC barks:     bark_{smith,innkeeper,mage,priest,guard,merchant}
  - 3 Merc barks:    bark_merc_{warrior,archer,mage}
  - 5 Monster hits:  mon_hit_{beast,undead,caster,construct,insect}
  - 4 Boss roars:    boss_roar_{morvessa,gorrathul,vesperion,ashkarath}
  - 2 Ending themes: music_ending_{crown,ember}

Usage:
  python tools/audio-gen-wave2.py                  # generate all 20 Wave 2 assets
  python tools/audio-gen-wave2.py bark_smith       # generate specific target(s)
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

NOTE_OFFSETS = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
}


def midi_to_hz(midi: float) -> float:
    return 440.0 * (2.0 ** ((midi - 69.0) / 12.0))


def _filt(x: np.ndarray, kind: str, freq: float | tuple[float, float], order: int = 2) -> np.ndarray:
    if isinstance(freq, tuple):
        lo, hi = max(25.0, freq[0]), min(SR * 0.47, freq[1])
        if lo >= hi:
            return x
        sos = butter(order, [lo, hi], btype='bandpass', fs=SR, output='sos')
    else:
        f = max(25.0, min(SR * 0.47, freq))
        sos = butter(order, f, btype=kind, fs=SR, output='sos')
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


def _fade_edges(x: np.ndarray, fade_ms: float = 10.0) -> np.ndarray:
    n = min(int(SR * fade_ms / 1000.0), x.shape[-1] // 4)
    if n <= 1:
        return x
    y = x.copy()
    ramp_in = np.linspace(0.0, 1.0, n)
    ramp_out = np.linspace(1.0, 0.0, n)
    if y.ndim == 1:
        y[:n] *= ramp_in
        y[-n:] *= ramp_out
    else:
        y[:, :n] *= ramp_in
        y[:, -n:] *= ramp_out
    return y


def synth_formant_voice(
    rng: np.random.Generator,
    dur: float,
    f0_points: list[tuple[float, float]],
    formants: tuple[tuple[float, float], tuple[float, float], tuple[float, float]],
    breathiness: float = 0.22,
    gravel_hz: float = 0.0,
    atk_s: float = 0.025,
    rel_s: float = 0.10,
) -> np.ndarray:
    """Synthesizes a stylized glottal-pulse vocal grunt/murmur through 3 parallel formants."""
    n = max(int(SR * dur), 256)
    t = np.arange(n) / SR
    times = [p[0] * dur for p in f0_points]
    freqs = [p[1] for p in f0_points]
    f0 = np.interp(t, times, freqs)
    if gravel_hz > 0.0:
        f0 = f0 * (1.0 + 0.045 * np.sin(TAU * gravel_hz * t) + 0.015 * rng.standard_normal(n))
    phase = (np.cumsum(f0) / SR) % 1.0
    # Asymmetric glottal pulse + soft saw harmonic roll-off
    glottal = np.where(phase < 0.42, np.sin(np.pi * phase / 0.42), -0.35 * np.sin(np.pi * (phase - 0.42) / 0.58))
    glottal += 0.25 * np.sin(TAU * phase)
    breath = _pink_noise(rng, n) * breathiness
    source = glottal + breath

    voiced = np.zeros(n)
    weights = (0.58, 0.28, 0.14)
    for (f_lo, f_hi), w in zip(formants, weights):
        voiced += _filt(source, 'bandpass', (f_lo, f_hi)) * w

    env = np.minimum(1.0, t / max(0.004, atk_s)) * np.minimum(1.0, (dur - t) / max(0.01, rel_s))
    env = np.clip(env, 0.0, 1.0)
    return voiced * env


# ---------------------------------------------------------------------------
# D4 Dark-Fantasy NPC & Mercenary Stylized Voice / Grunt Cues
# ---------------------------------------------------------------------------

def gen_bark_smith(rng: np.random.Generator) -> np.ndarray:
    # Gruff baritone throat-clear + iron anvil tap
    dur = 0.48
    n = int(SR * dur)
    t = np.arange(n) / SR
    voice = synth_formant_voice(
        rng, dur,
        [(0.0, 98.0), (0.35, 92.0), (0.7, 82.0), (1.0, 74.0)],
        ((380.0, 680.0), (920.0, 1380.0), (2100.0, 2800.0)),
        breathiness=0.25, gravel_hz=26.0, atk_s=0.025, rel_s=0.12,
    )
    anvil = np.zeros(n)
    pos = int(0.06 * SR)
    m = n - pos
    at = np.arange(m) / SR
    anvil[pos:] = (
        np.sin(TAU * 1340.0 * at) * 0.45
        + np.sin(TAU * 2120.0 * at) * 0.25
        + np.sin(TAU * 3190.0 * at) * 0.12
    ) * np.exp(-at * 16.0)
    return _normalize(_fade_edges(voice * 0.9 + anvil * 0.26, 8.0), 0.80)


def gen_bark_innkeeper(rng: np.random.Generator) -> np.ndarray:
    # Warm gravelly chesty chuckle/hum + wooden mug thump
    dur = 0.52
    n = int(SR * dur)
    voice = synth_formant_voice(
        rng, dur,
        [(0.0, 112.0), (0.28, 134.0), (0.55, 118.0), (0.8, 128.0), (1.0, 98.0)],
        ((420.0, 760.0), (980.0, 1480.0), (2000.0, 2650.0)),
        breathiness=0.20, gravel_hz=18.0, atk_s=0.03, rel_s=0.14,
    )
    thump = np.zeros(n)
    m = int(0.14 * SR)
    tt = np.arange(m) / SR
    thump[:m] = np.sin(TAU * np.cumsum(np.linspace(125.0, 48.0, m)) / SR) * np.exp(-tt * 24.0) * 0.35
    return _normalize(_fade_edges(voice + thump, 8.0), 0.80)


def gen_bark_mage(rng: np.random.Generator) -> np.ndarray:
    # Hushed scholarly murmur + faint arcane crystal harmonic
    dur = 0.54
    n = int(SR * dur)
    t = np.arange(n) / SR
    voice = synth_formant_voice(
        rng, dur,
        [(0.0, 148.0), (0.4, 136.0), (0.75, 142.0), (1.0, 124.0)],
        ((320.0, 580.0), (1250.0, 1850.0), (2400.0, 3200.0)),
        breathiness=0.38, gravel_hz=0.0, atk_s=0.045, rel_s=0.16,
    )
    chime = (np.sin(TAU * 880.0 * t) * 0.5 + np.sin(TAU * 1318.5 * t) * 0.3) * np.exp(-t * 6.5) * 0.18
    return _normalize(_fade_edges(voice + chime, 10.0), 0.78)


def gen_bark_priest(rng: np.random.Generator) -> np.ndarray:
    # Solemn penitent hum + distant censer bell fifth
    dur = 0.58
    n = int(SR * dur)
    t = np.arange(n) / SR
    voice = synth_formant_voice(
        rng, dur,
        [(0.0, 110.0), (0.5, 108.0), (1.0, 102.0)],
        ((310.0, 560.0), (760.0, 1180.0), (1950.0, 2550.0)),
        breathiness=0.18, gravel_hz=0.0, atk_s=0.06, rel_s=0.18,
    )
    bell = (np.sin(TAU * 440.0 * t) * 0.5 + np.sin(TAU * 659.3 * t) * 0.35) * np.exp(-t * 5.0) * 0.22
    return _normalize(_fade_edges(voice * 0.9 + bell, 10.0), 0.78)


def gen_bark_guard(rng: np.random.Generator) -> np.ndarray:
    # Clipped disciplined iron-helm acknowledgement + mail rattle
    dur = 0.38
    n = int(SR * dur)
    t = np.arange(n) / SR
    voice = synth_formant_voice(
        rng, dur,
        [(0.0, 138.0), (0.25, 118.0), (1.0, 88.0)],
        ((460.0, 780.0), (1080.0, 1580.0), (2200.0, 2900.0)),
        breathiness=0.22, gravel_hz=22.0, atk_s=0.014, rel_s=0.10,
    )
    mail = _filt(rng.standard_normal(n), 'bandpass', (2600.0, 6200.0)) * np.exp(-t * 22.0) * 0.20
    return _normalize(_fade_edges(voice + mail, 6.0), 0.80)


def gen_bark_merchant(rng: np.random.Generator) -> np.ndarray:
    # Shrewd questioning "hm?" inflection + brass scale/coin clink
    dur = 0.44
    n = int(SR * dur)
    t = np.arange(n) / SR
    voice = synth_formant_voice(
        rng, dur,
        [(0.0, 142.0), (0.35, 168.0), (0.7, 152.0), (1.0, 174.0)],
        ((440.0, 740.0), (1320.0, 1920.0), (2350.0, 3100.0)),
        breathiness=0.24, gravel_hz=12.0, atk_s=0.02, rel_s=0.10,
    )
    coin = (np.sin(TAU * 2637.0 * t) + 0.6 * np.sin(TAU * 3520.0 * t)) * np.exp(-t * 14.0) * 0.16
    return _normalize(_fade_edges(voice + coin, 8.0), 0.78)


def gen_bark_merc_warrior(rng: np.random.Generator) -> np.ndarray:
    # Hardened mercenary battle-grunt + steel scabbard whisper
    dur = 0.40
    n = int(SR * dur)
    t = np.arange(n) / SR
    voice = synth_formant_voice(
        rng, dur,
        [(0.0, 118.0), (0.2, 102.0), (0.7, 84.0), (1.0, 68.0)],
        ((480.0, 820.0), (960.0, 1440.0), (2100.0, 2750.0)),
        breathiness=0.28, gravel_hz=32.0, atk_s=0.012, rel_s=0.09,
    )
    steel = _filt(rng.standard_normal(n), 'bandpass', (2200.0, 5400.0)) * np.exp(-t * 19.0) * 0.22
    return _normalize(_fade_edges(voice + steel, 6.0), 0.82)


def gen_bark_merc_archer(rng: np.random.Generator) -> np.ndarray:
    # Sharp focused exhalation + dry yew wood creak
    dur = 0.36
    n = int(SR * dur)
    t = np.arange(n) / SR
    voice = synth_formant_voice(
        rng, dur,
        [(0.0, 176.0), (0.3, 152.0), (1.0, 118.0)],
        ((380.0, 680.0), (1450.0, 2100.0), (2600.0, 3500.0)),
        breathiness=0.45, gravel_hz=0.0, atk_s=0.012, rel_s=0.08,
    )
    creak = _filt(np.sin(TAU * (190.0 + 40.0 * np.sin(TAU * 18.0 * t)) * t), 'bandpass', (300.0, 1100.0)) * np.exp(-t * 12.0) * 0.20
    return _normalize(_fade_edges(voice + creak, 6.0), 0.78)


def gen_bark_merc_mage(rng: np.random.Generator) -> np.ndarray:
    # Focused spell-ready murmur + crisp copper-prism arc spark
    dur = 0.44
    n = int(SR * dur)
    t = np.arange(n) / SR
    voice = synth_formant_voice(
        rng, dur,
        [(0.0, 162.0), (0.4, 184.0), (0.8, 166.0), (1.0, 146.0)],
        ((350.0, 640.0), (1380.0, 1980.0), (2450.0, 3250.0)),
        breathiness=0.34, gravel_hz=0.0, atk_s=0.02, rel_s=0.11,
    )
    spark = _filt(rng.standard_normal(n), 'bandpass', (3200.0, 7400.0)) * np.exp(-t * 24.0) * 0.24
    tone = np.sin(TAU * 660.0 * t) * np.exp(-t * 10.0) * 0.16
    return _normalize(_fade_edges(voice + spark + tone, 8.0), 0.78)


# ---------------------------------------------------------------------------
# Per-Family Monster Hit Voices
# ---------------------------------------------------------------------------

def gen_mon_hit_beast(rng: np.random.Generator) -> np.ndarray:
    dur = 0.34
    n = int(SR * dur)
    t = np.arange(n) / SR
    f0 = np.interp(t, [0.0, 0.08, 0.22, dur], [245.0, 190.0, 115.0, 72.0])
    fm = 22.0 * np.sin(TAU * 36.0 * t)
    phase = TAU * np.cumsum(f0 + fm) / SR
    saw = 2.0 * ((phase / TAU) % 1.0) - 1.0
    yelp = _filt(saw, 'bandpass', (220.0, 1150.0))
    breath = _filt(_pink_noise(rng, n), 'bandpass', (500.0, 2100.0)) * 0.5
    env = np.minimum(1.0, t / 0.015) * np.exp(-t * 8.5)
    return _normalize(_fade_edges((yelp + breath) * env, 6.0), 0.84)


def gen_mon_hit_undead(rng: np.random.Generator) -> np.ndarray:
    dur = 0.36
    n = int(SR * dur)
    t = np.arange(n) / SR
    rasp = _filt(_pink_noise(rng, n), 'bandpass', (550.0, 2400.0)) * np.exp(-t * 9.0) * 0.65
    hollow = np.sin(TAU * np.cumsum(np.linspace(195.0, 108.0, n)) / SR) * np.exp(-t * 10.0) * 0.4
    bones = np.zeros(n)
    for k in range(4):
        pos = int((0.01 + k * 0.045) * SR)
        m = min(380, n - pos)
        if m > 10:
            bt = np.arange(m) / SR
            bf = rng.uniform(900.0, 1650.0)
            bones[pos:pos + m] += (np.sin(TAU * bf * bt) + 0.5 * np.sin(TAU * bf * 1.58 * bt)) * np.exp(-bt * 40.0) * 0.65
    return _normalize(_fade_edges(rasp + hollow + bones, 6.0), 0.82)


def gen_mon_hit_caster(rng: np.random.Generator) -> np.ndarray:
    dur = 0.38
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = np.geomspace(540.0, 195.0, n)
    shriek = (np.sin(TAU * np.cumsum(f) / SR) * 0.6 + np.sin(TAU * np.cumsum(f * 1.498) / SR) * 0.35) * np.exp(-t * 8.0)
    shatter = _filt(rng.standard_normal(n), 'bandpass', (1400.0, 5200.0)) * np.exp(-t * 16.0) * 0.45
    return _normalize(_fade_edges(shriek + shatter, 6.0), 0.82)


def gen_mon_hit_construct(rng: np.random.Generator) -> np.ndarray:
    dur = 0.42
    n = int(SR * dur)
    t = np.arange(n) / SR
    thud = np.sin(TAU * np.cumsum(np.linspace(92.0, 38.0, n)) / SR) * np.exp(-t * 11.0) * 0.8
    clang = (np.sin(TAU * 360.0 * t) + 0.6 * np.sin(TAU * 574.0 * t) + 0.35 * np.sin(TAU * 912.0 * t)) * np.exp(-t * 13.0) * 0.45
    grit = _filt(_pink_noise(rng, n), 'bandpass', (160.0, 680.0)) * np.exp(-t * 12.0) * 0.55
    return _normalize(_fade_edges(thud + clang + grit, 6.0), 0.85)


def gen_mon_hit_insect(rng: np.random.Generator) -> np.ndarray:
    dur = 0.30
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = np.geomspace(2150.0, 720.0, n) + 140.0 * np.sin(TAU * 48.0 * t)
    chirp = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t * 11.0) * 0.55
    snap = _filt(rng.standard_normal(n), 'bandpass', (1800.0, 6400.0)) * np.exp(-t * 28.0) * 0.75
    return _normalize(_fade_edges(chirp + snap, 5.0), 0.82)


# ---------------------------------------------------------------------------
# 4 Boss Roar Stingers (Stereo, 128k AAC)
# ---------------------------------------------------------------------------

def gen_boss_roar_morvessa(rng: np.random.Generator) -> np.ndarray:
    # F# Phrygian Dominant arachnid matriarch shriek + mandible clicks + sub drop
    dur = 1.75
    n = int(SR * dur)
    t = np.arange(n) / SR
    f_shriek = np.geomspace(680.0, 195.0, n) + 32.0 * np.sin(TAU * 34.0 * t)
    shriek = _filt(2.0 * (((np.cumsum(f_shriek) / SR) % 1.0)) - 1.0, 'bandpass', (240.0, 2600.0))
    sub = np.sin(TAU * np.cumsum(np.linspace(92.5, 46.25, n)) / SR) * 0.75
    clicks = np.zeros(n)
    for k in range(14):
        pos = int((0.05 + k * 0.085) * SR)
        if pos < n - 300:
            ct = np.arange(300) / SR
            cf = 1700.0 + (k % 3) * 420.0
            clicks[pos:pos + 300] += np.sin(TAU * cf * ct) * np.exp(-ct * 48.0) * 0.55
    env = np.minimum(1.0, t / 0.08) * np.exp(-np.maximum(0.0, t - 0.55) * 2.2)
    mono = (shriek * 0.6 + sub) * env + clicks * np.exp(-t * 1.1)
    left = _fade_edges(mono + 0.15 * np.roll(clicks, 180), 14.0)
    right = _fade_edges(mono - 0.12 * np.roll(clicks, 90), 14.0)
    return _normalize(np.vstack([left, right]), 0.86)


def gen_boss_roar_gorrathul(rng: np.random.Generator) -> np.ndarray:
    # C Locrian colossal basalt titan bellow + pressurized steam hiss + anvil slam
    dur = 1.90
    n = int(SR * dur)
    t = np.arange(n) / SR
    f0 = np.interp(t, [0.0, 0.25, 1.1, dur], [78.0, 65.4, 54.0, 42.0])
    saw = 2.0 * (((np.cumsum(f0) / SR) % 1.0)) - 1.0
    bellow = _filt(saw, 'lowpass', 380.0) * 0.85 + np.sin(TAU * np.cumsum(f0 * 0.5) / SR) * 0.65
    steam = _filt(_pink_noise(rng, n), 'bandpass', (1200.0, 4800.0)) * np.exp(-np.maximum(0.0, t - 0.18) * 2.6) * 0.42
    anvil = (np.sin(TAU * 392.0 * t) + 0.55 * np.sin(TAU * 622.3 * t)) * np.exp(-t * 4.5) * 0.45
    env = np.minimum(1.0, t / 0.10) * np.exp(-np.maximum(0.0, t - 0.70) * 2.1)
    core = bellow * env + steam + anvil
    left = _fade_edges(core + steam * 0.15, 15.0)
    right = _fade_edges(core - steam * 0.15, 15.0)
    return _normalize(np.vstack([left, right]), 0.88)


def gen_boss_roar_vesperion(rng: np.random.Generator) -> np.ndarray:
    # B Diminished drowned admiral foghorn + Tesla-coil crackle + organ dissonance
    dur = 1.85
    n = int(SR * dur)
    t = np.arange(n) / SR
    # B1 (61.74 Hz), F2 (87.31 Hz tritone), B2 (123.47 Hz), D3 (146.83 Hz)
    horn = (
        np.sin(TAU * 61.74 * t) * 0.55
        + np.sin(TAU * 87.31 * t) * 0.45
        + np.sin(TAU * 123.47 * t) * 0.35
        + np.sin(TAU * 146.83 * t) * 0.25
    )
    horn = _filt(horn, 'lowpass', 650.0)
    crackle = _filt(rng.standard_normal(n), 'bandpass', (2400.0, 7200.0)) * (0.5 + 0.5 * np.sin(TAU * 19.0 * t)) * 0.28
    surge = _filt(_pink_noise(rng, n), 'bandpass', (180.0, 820.0)) * 0.42
    env = np.minimum(1.0, t / 0.12) * np.exp(-np.maximum(0.0, t - 0.65) * 2.0)
    left = _fade_edges((horn + surge + crackle) * env, 15.0)
    right = _fade_edges((horn + surge - crackle * 0.85) * env, 15.0)
    return _normalize(np.vstack([left, right]), 0.86)


def gen_boss_roar_ashkarath(rng: np.random.Generator) -> np.ndarray:
    # C# Phrygian Dominant volcanic sovereign roar + magma rumble + dual anvil
    dur = 2.00
    n = int(SR * dur)
    t = np.arange(n) / SR
    f0 = np.interp(t, [0.0, 0.22, 0.9, dur], [138.6, 110.0, 73.4, 52.0])
    fm = 16.0 * np.sin(TAU * 22.0 * t)
    saw = 2.0 * (((np.cumsum(f0 + fm) / SR) % 1.0)) - 1.0
    brass = _filt(saw, 'lowpass', 720.0) * 0.78
    tritone = np.sin(TAU * 69.3 * t) * 0.55 + np.sin(TAU * 98.0 * t) * 0.40
    rumble = _filt(_pink_noise(rng, n), 'bandpass', (45.0, 260.0)) * 0.70
    anvil = (np.sin(TAU * 554.4 * t) + 0.6 * np.sin(TAU * 880.0 * t)) * np.exp(-t * 5.2) * 0.40
    env = np.minimum(1.0, t / 0.08) * np.exp(-np.maximum(0.0, t - 0.75) * 2.0)
    left = _fade_edges((brass + tritone + rumble) * env + anvil, 16.0)
    right = _fade_edges((brass + tritone * 0.9 - rumble * 0.1 + anvil * 0.85) * env + anvil * 0.8, 16.0)
    return _normalize(np.vstack([left, right]), 0.88)


# ---------------------------------------------------------------------------
# 2 Ending Themes (Stereo Loopable, 128k AAC)
# ---------------------------------------------------------------------------

def _lp(x: np.ndarray, cutoff_hz: float) -> np.ndarray:
    return _filt(x, 'lowpass', cutoff_hz)


def _synth_chamber(wave_kind: str, midi: float, dur: float, gain: float, cutoff_hz: float) -> np.ndarray:
    n = max(int(SR * dur), 128)
    t = np.arange(n) / SR
    f0 = midi_to_hz(midi)
    p = TAU * f0 * t
    if wave_kind == 'choir':
        x = (
            np.sin(p * 0.996) * 0.34
            + np.sin(p) * 0.40
            + np.sin(p * 1.004) * 0.34
            + 0.24 * np.sin(2.0 * p)
            + 0.10 * np.sin(3.0 * p)
        )
        atk, rel = min(int(SR * 0.28), n // 3), min(int(SR * 0.36), n // 3)
    elif wave_kind == 'cello':
        saw = 2.0 * ((p / TAU) % 1.0) - 1.0
        x = (saw * 0.55 + np.sin(p) * 0.45) * (1.0 + 0.015 * np.sin(TAU * 5.2 * t))
        atk, rel = min(int(SR * 0.09), n // 3), min(int(SR * 0.18), n // 3)
    elif wave_kind == 'organ':
        x = np.sin(p * 0.5) * 0.35 + np.sin(p) * 0.45 + np.sin(2.0 * p) * 0.25 + np.sin(3.0 * p) * 0.12
        atk, rel = min(int(SR * 0.08), n // 3), min(int(SR * 0.22), n // 3)
    elif wave_kind == 'harp':
        x = (np.sin(p) * 0.6 + np.sin(2.0 * p) * 0.28 * np.exp(-t * 3.5) + np.sin(3.0 * p) * 0.12 * np.exp(-t * 6.0)) * np.exp(-t * 2.4)
        atk, rel = min(int(SR * 0.008), n // 4), min(int(SR * 0.08), n // 4)
    elif wave_kind == 'brass':
        saw = 2.0 * ((p / TAU) % 1.0) - 1.0
        x = saw * 0.65 + np.sin(p * 0.5) * 0.40
        atk, rel = min(int(SR * 0.07), n // 3), min(int(SR * 0.14), n // 3)
    else:  # chime / bell
        x = (np.sin(p) * 0.5 + np.sin(2.0 * p) * 0.25 * np.exp(-t * 2.0) + np.sin(2.756 * p) * 0.16 * np.exp(-t * 4.5)) * np.exp(-t * 1.6)
        atk, rel = min(int(SR * 0.006), n // 4), min(int(SR * 0.12), n // 4)

    env = np.ones(n)
    if atk > 1:
        env[:atk] = np.linspace(0.0, 1.0, atk)
    if rel > 1:
        env[-rel:] = np.linspace(1.0, 0.0, rel)
    return _lp(x * env, cutoff_hz) * gain


def _parse_chord(sym: str, octave: int = 3) -> list[int]:
    is_minor = sym.endswith('m')
    root_name = sym[:-1] if is_minor else sym
    root = 12 * (octave + 1) + NOTE_OFFSETS[root_name]
    return [root, root + (3 if is_minor else 4), root + 7]


def _add_stereo(buf: np.ndarray, mono: np.ndarray, pos: int, pan: float = 0.0) -> None:
    if pos >= buf.shape[1]:
        return
    end = min(buf.shape[1], pos + len(mono))
    seg = mono[:end - pos]
    ang = (np.clip(pan, -1.0, 1.0) + 1.0) * (np.pi / 4.0)
    buf[0, pos:end] += seg * np.cos(ang)
    buf[1, pos:end] += seg * np.sin(ang)


def _render_ending_theme(spec: dict, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    bpm = spec['bpm']
    bars = spec['bars']
    steps_per_bar = 16
    step_sec = 60.0 / bpm / 4.0
    loop_n = int(round(SR * step_sec * steps_per_bar * bars))
    tail_n = int(SR * 3.0)
    buf = np.zeros((2, loop_n + tail_n), dtype=np.float64)

    prog = spec['progression']
    lead_voice = spec['lead']
    pad_voice = spec['pad']
    melody_bars = spec['melody']

    for b in range(bars):
        triad = _parse_chord(prog[b % len(prog)], octave=3)
        bar_step0 = b * steps_per_bar
        bar_pos = int(round(bar_step0 * step_sec * SR))

        # Lush pad / organ / choir chord
        for idx, note in enumerate(triad):
            pan = -0.38 if idx == 0 else (0.38 if idx == 2 else 0.0)
            v = _synth_chamber(pad_voice, note, step_sec * steps_per_bar * 1.15, 0.24, spec['pad_lp'])
            _add_stereo(buf, v, bar_pos, pan)

        # Deep contrabass / organ pedal anchor
        for bs in spec['bass_steps']:
            bv = _synth_chamber('organ', triad[0] - 12, step_sec * 8, 0.30, 420.0)
            _add_stereo(buf, bv, int(round((bar_step0 + bs) * step_sec * SR)), 0.0)

        # Arpeggiated harp / bell shimmer
        for s in range(0, steps_per_bar, 2):
            deg = [0, 1, 2, 1][(s // 2) % 4]
            note = triad[deg % 3] + (12 if (s // 2) >= 4 else 0)
            av = _synth_chamber(spec['arp_voice'], note, step_sec * 3.0, 0.14, spec['lead_lp'])
            _add_stereo(buf, av, int(round((bar_step0 + s) * step_sec * SR)), -0.25 if (s // 2) % 2 == 0 else 0.25)

        # Lead melody
        for step_off, midi_note, dur_steps in melody_bars[b % len(melody_bars)]:
            mv = _synth_chamber(lead_voice, midi_note, step_sec * dur_steps * 1.18, 0.30, spec['lead_lp'])
            _add_stereo(buf, mv, int(round((bar_step0 + step_off) * step_sec * SR)), 0.06)

        # Ceremonial timpani / anvil accents
        for kind, steps in spec['perc'].items():
            for ps in steps:
                pos = int(round((bar_step0 + ps) * step_sec * SR))
                if kind == 'anvil':
                    pn = int(SR * 0.32)
                    pt = np.arange(pn) / SR
                    pv = (np.sin(TAU * 554.0 * pt) + 0.6 * np.sin(TAU * 880.0 * pt)) * np.exp(-pt * 12.0) * 0.20
                else:
                    pn = int(SR * 0.42)
                    pt = np.arange(pn) / SR
                    pv = np.sin(TAU * np.cumsum(np.geomspace(105.0, 48.0, pn)) / SR) * np.exp(-pt * 7.5) * 0.32
                _add_stereo(buf, _lp(pv, 2400.0), pos, 0.0)

    out = buf[:, :loop_n].copy()
    tail = buf[:, loop_n:]
    fold_len = min(loop_n, tail.shape[1])
    out[:, :fold_len] += tail[:, :fold_len]
    # Add tiny air room noise at -60 dB to prevent digital zero artifacts
    out += rng.standard_normal(out.shape) * 1e-4
    peak = float(np.max(np.abs(out))) or 1.0
    return out / peak * 0.76


def gen_music_ending_crown(_rng: np.random.Generator) -> np.ndarray:
    # Ending A: Crown of Star-Iron — D Minor Apotheosis, solemn cathedral choir, cello & star-chimes
    spec = {
        'bpm': 72,
        'bars': 8,
        'progression': ['Dm', 'Bb', 'C', 'Am', 'Dm', 'F', 'C', 'Dm'],
        'pad': 'choir',
        'lead': 'cello',
        'arp_voice': 'harp',
        'pad_lp': 1150.0,
        'lead_lp': 2500.0,
        'bass_steps': [0, 8],
        'perc': {'timpani': [0, 8]},
        'melody': [
            [(0, 62, 6), (6, 65, 4), (10, 69, 6)],
            [(0, 70, 6), (6, 69, 4), (10, 65, 6)],
            [(0, 67, 6), (6, 64, 4), (10, 60, 6)],
            [(0, 64, 8), (8, 62, 8)],
            [(0, 62, 4), (4, 69, 6), (10, 74, 6)],
            [(0, 72, 6), (6, 69, 4), (10, 65, 6)],
            [(0, 67, 6), (6, 64, 4), (10, 67, 6)],
            [(0, 69, 6), (6, 62, 10)],
        ],
    }
    return _render_ending_theme(spec, seed=3101)


def gen_music_ending_ember(_rng: np.random.Generator) -> np.ndarray:
    # Ending B: Mantle of the Living Ember — C# Phrygian Dominant, volcanic brass choir & anvil heartbeat
    spec = {
        'bpm': 80,
        'bars': 8,
        'progression': ['C#m', 'D', 'Bm', 'C#m', 'C#m', 'A', 'G#m', 'C#m'],
        'pad': 'organ',
        'lead': 'brass',
        'arp_voice': 'chime',
        'pad_lp': 1050.0,
        'lead_lp': 2050.0,
        'bass_steps': [0, 8],
        'perc': {'timpani': [0, 8], 'anvil': [4, 12]},
        'melody': [
            [(0, 61, 6), (6, 62, 4), (10, 65, 6)],
            [(0, 66, 6), (6, 65, 4), (10, 62, 6)],
            [(0, 62, 6), (6, 59, 4), (10, 61, 6)],
            [(0, 61, 10), (10, 64, 6)],
            [(0, 61, 4), (4, 68, 6), (10, 73, 6)],
            [(0, 69, 6), (6, 68, 4), (10, 64, 6)],
            [(0, 63, 6), (6, 61, 4), (10, 60, 6)],
            [(0, 61, 16)],
        ],
    }
    return _render_ending_theme(spec, seed=3202)


TARGETS: dict[str, tuple[callable, str, int]] = {
    # NPC barks (mono 96k)
    'bark_smith': (gen_bark_smith, '96k', 1),
    'bark_innkeeper': (gen_bark_innkeeper, '96k', 1),
    'bark_mage': (gen_bark_mage, '96k', 1),
    'bark_priest': (gen_bark_priest, '96k', 1),
    'bark_guard': (gen_bark_guard, '96k', 1),
    'bark_merchant': (gen_bark_merchant, '96k', 1),
    # Merc barks (mono 96k)
    'bark_merc_warrior': (gen_bark_merc_warrior, '96k', 1),
    'bark_merc_archer': (gen_bark_merc_archer, '96k', 1),
    'bark_merc_mage': (gen_bark_merc_mage, '96k', 1),
    # Monster family hit voices (mono 96k)
    'mon_hit_beast': (gen_mon_hit_beast, '96k', 1),
    'mon_hit_undead': (gen_mon_hit_undead, '96k', 1),
    'mon_hit_caster': (gen_mon_hit_caster, '96k', 1),
    'mon_hit_construct': (gen_mon_hit_construct, '96k', 1),
    'mon_hit_insect': (gen_mon_hit_insect, '96k', 1),
    # Boss roar stingers (stereo 128k)
    'boss_roar_morvessa': (gen_boss_roar_morvessa, '128k', 2),
    'boss_roar_gorrathul': (gen_boss_roar_gorrathul, '128k', 2),
    'boss_roar_vesperion': (gen_boss_roar_vesperion, '128k', 2),
    'boss_roar_ashkarath': (gen_boss_roar_ashkarath, '128k', 2),
    # Ending themes (stereo 128k)
    'music_ending_crown': (gen_music_ending_crown, '128k', 2),
    'music_ending_ember': (gen_music_ending_ember, '128k', 2),
}


def write_m4a(name: str, data: np.ndarray, bitrate: str, channels: int) -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f'{name}.m4a')
    with tempfile.TemporaryDirectory() as td:
        wav_path = os.path.join(td, f'{name}.wav')
        if channels == 2:
            if data.ndim == 1:
                data = np.vstack([data, data])
            interleaved = np.empty((data.shape[1] * 2,), dtype='<i2')
            interleaved[0::2] = (np.clip(data[0], -1.0, 1.0) * 32767.0).astype('<i2')
            interleaved[1::2] = (np.clip(data[1], -1.0, 1.0) * 32767.0).astype('<i2')
            pcm_bytes = interleaved.tobytes()
        else:
            pcm = (np.clip(data, -1.0, 1.0) * 32767.0).astype('<i2')
            pcm_bytes = pcm.tobytes()

        with wave.open(wav_path, 'wb') as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(2)
            wf.setframerate(SR)
            wf.writeframes(pcm_bytes)

        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path, '-c:a', 'aac', '-b:a', bitrate, '-movflags', '+faststart', out_path],
            check=True,
        )
    return out_path


def main() -> None:
    targets = sys.argv[1:] or list(TARGETS.keys())
    unknown = [t for t in targets if t not in TARGETS]
    if unknown:
        raise SystemExit(f'Unknown Wave 2 audio target(s): {", ".join(unknown)}')
    for idx, name in enumerate(targets):
        gen_fn, bitrate, channels = TARGETS[name]
        rng = np.random.default_rng(4000 + idx)
        samples = gen_fn(rng)
        path = write_m4a(name, samples, bitrate, channels)
        size_kb = os.path.getsize(path) / 1024.0
        print(f'wrote {name}.m4a ({size_kb:.1f} KiB)')


if __name__ == '__main__':
    main()
