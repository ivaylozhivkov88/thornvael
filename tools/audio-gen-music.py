"""Reproducibly synthesizes missing modal/chamber music tracks to public/audio/*.m4a (AAC 128k, loopable).

Usage:
  python tools/audio-gen-music.py                    # generate all 11 missing music tracks
  python tools/audio-gen-music.py music_char_select  # generate specific track(s)
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


def lp_filter(x: np.ndarray, cutoff_hz: float) -> np.ndarray:
    f = max(40.0, min(SR * 0.45, cutoff_hz))
    sos = butter(2, f, btype='lowpass', fs=SR, output='sos')
    return sosfilt(sos, x)


def synth_voice(wave_kind: str, midi: float, dur: float, gain: float, cutoff_hz: float) -> np.ndarray:
    n = max(int(SR * dur), 128)
    t = np.arange(n) / SR
    f0 = midi_to_hz(midi)
    p = TAU * f0 * t

    if wave_kind == 'pad':
        # Rich detuned string/choir ensemble
        x = (
            np.sin(p * 0.996) * 0.35
            + np.sin(p) * 0.40
            + np.sin(p * 1.004) * 0.35
            + 0.22 * np.sin(2.0 * p)
            + 0.08 * np.sin(3.0 * p)
        )
        atk = min(int(SR * 0.22), n // 3)
        rel = min(int(SR * 0.30), n // 3)
    elif wave_kind == 'lute':
        # Warm plucked chamber string
        x = (
            np.sin(p) * 0.55
            + np.sin(2.0 * p) * 0.30 * np.exp(-t * 4.5)
            + np.sin(3.0 * p) * 0.15 * np.exp(-t * 8.0)
            + np.sin(4.0 * p) * 0.07 * np.exp(-t * 12.0)
        ) * np.exp(-t * 3.4)
        atk = min(int(SR * 0.008), n // 4)
        rel = min(int(SR * 0.06), n // 4)
    elif wave_kind == 'bell':
        # Dark cathedral chime / bell
        x = (
            np.sin(p) * 0.50
            + np.sin(2.0 * p) * 0.25 * np.exp(-t * 2.0)
            + np.sin(2.756 * p) * 0.18 * np.exp(-t * 4.5)
            + np.sin(5.404 * p) * 0.08 * np.exp(-t * 7.5)
        ) * np.exp(-t * 1.8)
        atk = min(int(SR * 0.006), n // 4)
        rel = min(int(SR * 0.12), n // 4)
    elif wave_kind == 'brass':
        # Filtered warm horn / low brass
        saw = 2.0 * ((p / TAU) % 1.0) - 1.0
        sub = np.sin(p * 0.5) * 0.4
        x = saw * 0.65 + sub
        atk = min(int(SR * 0.06), n // 3)
        rel = min(int(SR * 0.10), n // 3)
    elif wave_kind == 'bass':
        # Deep cello/contrabass anchor
        tri = 2.0 / np.pi * np.arcsin(np.sin(p))
        x = np.sin(p) * 0.65 + tri * 0.35
        atk = min(int(SR * 0.025), n // 3)
        rel = min(int(SR * 0.08), n // 3)
    else:
        x = np.sin(p)
        atk = min(int(SR * 0.02), n // 3)
        rel = min(int(SR * 0.08), n // 3)

    env = np.ones(n)
    if atk > 1:
        env[:atk] = np.linspace(0.0, 1.0, atk)
    if rel > 1:
        env[-rel:] = np.linspace(1.0, 0.0, rel)
    return lp_filter(x * env, cutoff_hz) * gain


def synth_perc(rng: np.random.Generator, kind: str, gain: float) -> np.ndarray:
    if kind == 'timpani':
        n = int(SR * 0.36)
        t = np.arange(n) / SR
        f = np.geomspace(115.0, 52.0, n)
        x = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t * 8.5)
        return lp_filter(x, 380.0) * gain
    if kind == 'tom':
        n = int(SR * 0.22)
        t = np.arange(n) / SR
        f = np.geomspace(165.0, 78.0, n)
        x = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t * 14.0)
        return lp_filter(x, 600.0) * gain
    if kind == 'snare':
        n = int(SR * 0.14)
        t = np.arange(n) / SR
        body = np.sin(TAU * 185.0 * t) * np.exp(-t * 24.0) * 0.45
        noise = lp_filter(rng.standard_normal(n), 3200.0) * np.exp(-t * 28.0) * 0.7
        return (body + noise) * gain
    if kind == 'anvil':
        n = int(SR * 0.26)
        t = np.arange(n) / SR
        x = (np.sin(TAU * 620.0 * t) + 0.6 * np.sin(TAU * 985.0 * t) + 0.35 * np.sin(TAU * 1510.0 * t)) * np.exp(-t * 15.0)
        return lp_filter(x, 2600.0) * gain
    # shaker / frame tap
    n = int(SR * 0.06)
    t = np.arange(n) / SR
    x = lp_filter(rng.standard_normal(n), 4500.0) * np.exp(-t * 65.0)
    return x * gain * 0.45


def parse_chord(sym: str, octave: int = 3) -> list[int]:
    is_minor = sym.endswith('m')
    is_dim = sym.endswith('dim')
    root_name = sym[:-3] if is_dim else (sym[:-1] if is_minor else sym)
    root = 12 * (octave + 1) + NOTE_OFFSETS[root_name]
    if is_dim:
        return [root, root + 3, root + 6]
    return [root, root + (3 if is_minor else 4), root + 7]


def add_stereo(buf: np.ndarray, mono: np.ndarray, pos: int, pan: float = 0.0) -> None:
    if pos >= buf.shape[1]:
        return
    end = min(buf.shape[1], pos + len(mono))
    seg = mono[:end - pos]
    ang = (np.clip(pan, -1.0, 1.0) + 1.0) * (np.pi / 4.0)
    buf[0, pos:end] += seg * np.cos(ang)
    buf[1, pos:end] += seg * np.sin(ang)


def render_track(spec: dict, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    bpm = spec['bpm']
    bars = spec['bars']
    steps_per_bar = 16
    step_sec = 60.0 / bpm / 4.0
    loop_n = int(round(SR * step_sec * steps_per_bar * bars))
    tail_n = int(SR * 3.0)
    buf = np.zeros((2, loop_n + tail_n), dtype=np.float64)

    prog = spec['progression']
    lead_voice = spec.get('lead', 'lute')
    pad_cutoff = spec.get('pad_lp', 1100.0)
    lead_cutoff = spec.get('lead_lp', 2400.0)
    melody_bars = spec['melody']
    arp_pattern = spec.get('arp', [0, 1, 2, 1])
    perc_map = spec.get('perc', {})

    for b in range(bars):
        chord_sym = prog[b % len(prog)]
        triad = parse_chord(chord_sym, octave=3)
        bar_step0 = b * steps_per_bar
        bar_pos = int(round(bar_step0 * step_sec * SR))

        # Pad chord
        for idx, note in enumerate(triad):
            pan = -0.35 if idx == 0 else (0.35 if idx == 2 else 0.0)
            v = synth_voice('pad', note, step_sec * steps_per_bar * 1.12, 0.22, pad_cutoff)
            add_stereo(buf, v, bar_pos, pan)

        # Bass anchor on beats 1 and 3 (or driving 8ths if intense)
        bass_steps = spec.get('bass_steps', [0, 8])
        for bs in bass_steps:
            dur_steps = 6 if len(bass_steps) <= 2 else 2
            bv = synth_voice('bass', triad[0] - 12, step_sec * dur_steps, 0.34, 650.0)
            add_stereo(buf, bv, int(round((bar_step0 + bs) * step_sec * SR)), 0.0)

        # Optional lute/bell arpeggio
        if spec.get('use_arp', True):
            for s in range(0, steps_per_bar, 2):
                degree = arp_pattern[(s // 2) % len(arp_pattern)]
                note = triad[degree % len(triad)] + (12 if degree >= len(triad) else 0)
                av = synth_voice('lute', note, step_sec * 2.5, 0.16, lead_cutoff)
                pan = -0.25 if (s // 2) % 2 == 0 else 0.25
                add_stereo(buf, av, int(round((bar_step0 + s) * step_sec * SR)), pan)

        # Lead melody
        bar_mel = melody_bars[b % len(melody_bars)]
        for step_off, midi_note, dur_steps in bar_mel:
            mv = synth_voice(lead_voice, midi_note, step_sec * dur_steps * 1.15, 0.28, lead_cutoff)
            add_stereo(buf, mv, int(round((bar_step0 + step_off) * step_sec * SR)), 0.08)

        # Percussion
        for kind, steps in perc_map.items():
            for ps in steps:
                pv = synth_perc(rng, kind, spec.get('perc_gain', 0.32))
                add_stereo(buf, pv, int(round((bar_step0 + ps) * step_sec * SR)), -0.05 if kind == 'tom' else 0.05)

    # Fold reverb/release tail back into start for seamless loop
    out = buf[:, :loop_n].copy()
    tail = buf[:, loop_n:]
    fold_len = min(loop_n, tail.shape[1])
    out[:, :fold_len] += tail[:, :fold_len]

    # Gentle stereo normalization + tile to ~28-34s if short
    peak = float(np.max(np.abs(out))) or 1.0
    out = out / peak * 0.72
    dur_sec = loop_n / SR
    if dur_sec < 20.0:
        reps = max(1, int(round(28.0 / dur_sec)))
        out = np.tile(out, (1, reps))
    return out


TRACKS: dict[str, dict] = {
    'music_char_select': {
        'bpm': 76,
        'bars': 8,
        'progression': ['Dm', 'C', 'Bb', 'Am', 'Dm', 'F', 'C', 'Am'],
        'lead': 'lute',
        'pad_lp': 950.0,
        'lead_lp': 2200.0,
        'arp': [0, 1, 2, 1, 0, 2, 1, 2],
        'bass_steps': [0, 8],
        'perc': {'shaker': [4, 12]},
        'perc_gain': 0.14,
        'melody': [
            [(0, 62, 4), (4, 65, 4), (8, 69, 6)],
            [(0, 67, 4), (4, 64, 4), (8, 60, 6)],
            [(0, 65, 4), (4, 62, 4), (8, 58, 6)],
            [(0, 64, 6), (8, 60, 4), (12, 62, 4)],
            [(0, 62, 4), (4, 69, 4), (8, 67, 4), (12, 65, 4)],
            [(0, 65, 6), (8, 69, 4), (12, 65, 4)],
            [(0, 64, 4), (4, 67, 4), (8, 60, 6)],
            [(0, 64, 6), (8, 62, 8)],
        ],
    },
    'music_explore_act1_kilns': {
        'bpm': 82,
        'bars': 8,
        'progression': ['Em', 'F', 'Dm', 'Em', 'Em', 'G', 'F', 'Em'],
        'lead': 'lute',
        'pad_lp': 900.0,
        'lead_lp': 2100.0,
        'arp': [0, 2, 1, 2],
        'bass_steps': [0, 10],
        'perc': {'tom': [0, 10], 'shaker': [4, 12]},
        'perc_gain': 0.22,
        'melody': [
            [(0, 64, 6), (8, 65, 4), (12, 67, 4)],
            [(0, 69, 6), (8, 65, 4), (12, 64, 4)],
            [(0, 62, 6), (8, 65, 4), (12, 64, 4)],
            [(0, 64, 10)],
            [(0, 64, 4), (4, 71, 4), (8, 69, 4), (12, 67, 4)],
            [(0, 67, 6), (8, 71, 4), (12, 69, 4)],
            [(0, 65, 6), (8, 64, 4), (12, 62, 4)],
            [(0, 64, 12)],
        ],
    },
    'music_explore_act2_vaults': {
        'bpm': 72,
        'bars': 8,
        'progression': ['C#m', 'A', 'F#m', 'G#m', 'C#m', 'B', 'A', 'G#m'],
        'lead': 'bell',
        'pad_lp': 850.0,
        'lead_lp': 2600.0,
        'arp': [0, 1, 2, 3],
        'bass_steps': [0, 8],
        'perc': {'timpani': [0], 'shaker': [8]},
        'perc_gain': 0.20,
        'melody': [
            [(0, 61, 6), (8, 64, 6)],
            [(0, 69, 6), (8, 68, 6)],
            [(0, 66, 6), (8, 64, 4), (12, 61, 4)],
            [(0, 63, 10)],
            [(0, 61, 4), (4, 68, 4), (8, 66, 6)],
            [(0, 66, 6), (8, 63, 6)],
            [(0, 64, 6), (8, 61, 6)],
            [(0, 63, 12)],
        ],
    },
    'music_explore_act3_spit': {
        'bpm': 84,
        'bars': 8,
        'progression': ['Am', 'F', 'G', 'Em', 'Am', 'C', 'G', 'Em'],
        'lead': 'lute',
        'pad_lp': 1000.0,
        'lead_lp': 2300.0,
        'arp': [0, 2, 1, 0],
        'bass_steps': [0, 8],
        'perc': {'tom': [0, 6, 12]},
        'perc_gain': 0.22,
        'melody': [
            [(0, 69, 4), (4, 72, 4), (8, 71, 6)],
            [(0, 69, 6), (8, 65, 4), (12, 67, 4)],
            [(0, 67, 6), (8, 71, 4), (12, 69, 4)],
            [(0, 64, 10)],
            [(0, 69, 4), (4, 76, 4), (8, 74, 4), (12, 72, 4)],
            [(0, 72, 6), (8, 71, 6)],
            [(0, 67, 6), (8, 69, 4), (12, 67, 4)],
            [(0, 64, 12)],
        ],
    },
    'music_explore_act4_caldera': {
        'bpm': 78,
        'bars': 8,
        'progression': ['Dm', 'Eb', 'Cm', 'Dm', 'Dm', 'Bb', 'A', 'Dm'],
        'lead': 'brass',
        'pad_lp': 820.0,
        'lead_lp': 1750.0,
        'arp': [0, 1, 2, 0],
        'bass_steps': [0, 8],
        'perc': {'timpani': [0, 12], 'anvil': [8]},
        'perc_gain': 0.26,
        'melody': [
            [(0, 62, 6), (8, 65, 4), (12, 64, 4)],
            [(0, 63, 6), (8, 67, 6)],
            [(0, 60, 6), (8, 63, 4), (12, 62, 4)],
            [(0, 62, 10)],
            [(0, 62, 4), (4, 69, 6), (10, 68, 4)],
            [(0, 65, 6), (8, 62, 6)],
            [(0, 61, 6), (8, 64, 6)],
            [(0, 62, 12)],
        ],
    },
    'music_skirmish_forest': {
        'bpm': 108,
        'bars': 8,
        'progression': ['Gm', 'F', 'Eb', 'Dm', 'Gm', 'Bb', 'F', 'Gm'],
        'lead': 'brass',
        'pad_lp': 1150.0,
        'lead_lp': 2200.0,
        'arp': [0, 1, 2, 1],
        'bass_steps': [0, 4, 8, 12],
        'perc': {'tom': [0, 6, 8], 'snare': [4, 12], 'shaker': [2, 6, 10, 14]},
        'perc_gain': 0.30,
        'melody': [
            [(0, 67, 4), (4, 70, 4), (8, 74, 6)],
            [(0, 72, 4), (4, 69, 4), (8, 65, 6)],
            [(0, 67, 4), (4, 70, 4), (8, 67, 6)],
            [(0, 62, 6), (8, 66, 6)],
            [(0, 67, 4), (4, 74, 4), (8, 72, 4), (12, 70, 4)],
            [(0, 70, 6), (8, 74, 6)],
            [(0, 69, 4), (4, 67, 4), (8, 65, 6)],
            [(0, 67, 12)],
        ],
    },
    'music_skirmish_marsh': {
        'bpm': 98,
        'bars': 8,
        'progression': ['F#m', 'D', 'Bm', 'C#m', 'F#m', 'E', 'D', 'C#m'],
        'lead': 'bell',
        'pad_lp': 900.0,
        'lead_lp': 2100.0,
        'arp': [0, 2, 1, 2],
        'bass_steps': [0, 6, 10],
        'perc': {'timpani': [0, 10], 'tom': [6, 14], 'shaker': [4, 12]},
        'perc_gain': 0.28,
        'melody': [
            [(0, 66, 4), (4, 69, 4), (8, 68, 6)],
            [(0, 66, 6), (8, 62, 6)],
            [(0, 62, 4), (4, 66, 4), (8, 64, 6)],
            [(0, 61, 10)],
            [(0, 66, 4), (4, 73, 4), (8, 71, 6)],
            [(0, 71, 6), (8, 68, 6)],
            [(0, 69, 6), (8, 66, 6)],
            [(0, 64, 4), (4, 61, 8)],
        ],
    },
    'music_skirmish_desert': {
        'bpm': 112,
        'bars': 8,
        'progression': ['Em', 'F', 'G', 'F', 'Em', 'Dm', 'F', 'Em'],
        'lead': 'lute',
        'pad_lp': 1050.0,
        'lead_lp': 2600.0,
        'arp': [0, 1, 2, 3],
        'bass_steps': [0, 4, 8, 12],
        'perc': {'tom': [0, 3, 8, 11], 'snare': [4, 12], 'shaker': [2, 6, 10, 14]},
        'perc_gain': 0.30,
        'melody': [
            [(0, 64, 2), (2, 65, 2), (4, 68, 4), (8, 69, 4), (12, 68, 4)],
            [(0, 65, 4), (4, 64, 4), (8, 60, 6)],
            [(0, 67, 4), (4, 69, 4), (8, 71, 6)],
            [(0, 69, 4), (4, 65, 4), (8, 64, 6)],
            [(0, 64, 4), (4, 71, 4), (8, 72, 4), (12, 71, 4)],
            [(0, 69, 6), (8, 65, 6)],
            [(0, 65, 4), (4, 68, 4), (8, 65, 6)],
            [(0, 64, 12)],
        ],
    },
    'music_skirmish_crypt': {
        'bpm': 92,
        'bars': 8,
        'progression': ['Bm', 'G', 'Em', 'F#m', 'Bm', 'A', 'G', 'F#m'],
        'lead': 'bell',
        'pad_lp': 880.0,
        'lead_lp': 2400.0,
        'arp': [0, 1, 2, 1],
        'bass_steps': [0, 8],
        'perc': {'timpani': [0, 8], 'snare': [12]},
        'perc_gain': 0.28,
        'melody': [
            [(0, 71, 6), (8, 74, 4), (12, 73, 4)],
            [(0, 71, 6), (8, 67, 6)],
            [(0, 67, 4), (4, 71, 4), (8, 69, 6)],
            [(0, 66, 10)],
            [(0, 71, 4), (4, 78, 4), (8, 76, 6)],
            [(0, 76, 6), (8, 73, 6)],
            [(0, 71, 6), (8, 67, 6)],
            [(0, 66, 12)],
        ],
    },
    'music_skirmish_volcanic': {
        'bpm': 124,
        'bars': 8,
        'progression': ['Cm', 'Ab', 'Fm', 'Gm', 'Cm', 'Bb', 'Ab', 'Gm'],
        'lead': 'brass',
        'pad_lp': 1000.0,
        'lead_lp': 1950.0,
        'arp': [0, 2, 1, 2],
        'bass_steps': [0, 4, 8, 12],
        'perc': {'timpani': [0, 8], 'snare': [4, 12], 'anvil': [0, 8]},
        'perc_gain': 0.34,
        'melody': [
            [(0, 60, 4), (4, 63, 4), (8, 67, 6)],
            [(0, 68, 4), (4, 67, 4), (8, 63, 6)],
            [(0, 65, 4), (4, 68, 4), (8, 67, 6)],
            [(0, 62, 6), (8, 67, 6)],
            [(0, 72, 4), (4, 70, 4), (8, 68, 4), (12, 67, 4)],
            [(0, 70, 6), (8, 65, 6)],
            [(0, 68, 6), (8, 63, 6)],
            [(0, 62, 4), (4, 67, 8)],
        ],
    },
    'music_boss_ashkarath_phase2': {
        'bpm': 140,
        'bars': 8,
        'progression': ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'C', 'Bb', 'A'],
        'lead': 'brass',
        'pad_lp': 1250.0,
        'lead_lp': 2300.0,
        'arp': [0, 2, 1, 3],
        'bass_steps': [0, 2, 4, 6, 8, 10, 12, 14],
        'perc': {'timpani': [0, 4, 8, 12], 'snare': [4, 12, 14], 'anvil': [0, 8]},
        'perc_gain': 0.38,
        'melody': [
            [(0, 62, 2), (2, 65, 2), (4, 69, 4), (8, 74, 4), (12, 72, 4)],
            [(0, 70, 4), (4, 69, 4), (8, 65, 6)],
            [(0, 67, 4), (4, 70, 4), (8, 69, 6)],
            [(0, 64, 4), (4, 69, 4), (8, 68, 6)],
            [(0, 74, 4), (4, 77, 4), (8, 76, 4), (12, 74, 4)],
            [(0, 72, 4), (4, 76, 4), (8, 72, 6)],
            [(0, 70, 4), (4, 74, 4), (8, 70, 6)],
            [(0, 69, 6), (8, 64, 4), (12, 69, 4)],
        ],
    },
}


def write_m4a(name: str, stereo: np.ndarray) -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f'{name}.m4a')
    with tempfile.TemporaryDirectory() as td:
        wav_path = os.path.join(td, f'{name}.wav')
        interleaved = np.empty((stereo.shape[1] * 2,), dtype='<i2')
        interleaved[0::2] = (np.clip(stereo[0], -1.0, 1.0) * 32767.0).astype('<i2')
        interleaved[1::2] = (np.clip(stereo[1], -1.0, 1.0) * 32767.0).astype('<i2')
        with wave.open(wav_path, 'wb') as wf:
            wf.setnchannels(2)
            wf.setsampwidth(2)
            wf.setframerate(SR)
            wf.writeframes(interleaved.tobytes())
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out_path],
            check=True,
        )
    return out_path


def main() -> None:
    targets = sys.argv[1:] or list(TRACKS.keys())
    unknown = [t for t in targets if t not in TRACKS]
    if unknown:
        raise SystemExit(f'Unknown music target(s): {", ".join(unknown)}')
    for idx, name in enumerate(targets):
        stereo = render_track(TRACKS[name], seed=2000 + idx)
        path = write_m4a(name, stereo)
        size_kb = os.path.getsize(path) / 1024.0
        print(f'wrote {name}.m4a ({size_kb:.1f} KiB)')


if __name__ == '__main__':
    main()
