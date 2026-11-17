"""Synthesizes Gemini pack 6a music (27 tracks) and ambience (14 beds + one-shot events) to public/audio/*.m4a.
Usage: python tools/synth-pack6a-music.py [music|ambience]...  (default both)
Output: music_<id without mus- prefix, '-'->'_'>.m4a, amb_<id without amb- prefix>.m4a, amb_<id>_ev<N>.m4a
"""
import importlib.util, json, os, sys
import numpy as np
from scipy.signal import butter, sosfilt

_s = importlib.util.spec_from_file_location('s6a', os.path.join(os.path.dirname(__file__), 'synth-pack6a.py'))
s6a = importlib.util.module_from_spec(_s); _s.loader.exec_module(s6a)
SR = s6a.SR
rng = np.random.default_rng(66)
NOTE = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

def filt(x, kind, f):
    if f and f < SR / 2 - 100:
        return sosfilt(butter(2, f, btype=kind, fs=SR, output='sos'), x)
    return x

def tone(wave, m, dur, gain, lp):
    n = max(int(SR * dur), 64)
    t = np.arange(n) / SR
    p = 2 * np.pi * hz(m) * t
    if wave == 'triangle': x = 2 / np.pi * np.arcsin(np.sin(p))
    elif wave == 'saw': x = 2 * ((p / (2 * np.pi)) % 1) - 1
    elif wave == 'pluck':
        x = (np.sin(p) + 0.4 * np.sin(2 * p) + 0.2 * np.sin(3 * p)) * np.exp(-t * 5)
    elif wave == 'pad':
        x = sum(np.sin(p * (1 + d)) for d in (-0.004, 0, 0.004)) / 3
    else: x = np.sin(p)
    a = min(int(SR * 0.01), n // 2); r = min(int(SR * 0.08), n // 2)
    env = np.ones(n); env[:a] = np.linspace(0, 1, a); env[-r:] = np.linspace(1, 0, r)
    if wave == 'pad':
        a = min(int(SR * 0.25), n // 2); env[:a] = np.linspace(0, 1, a)
    return filt(x * env, 'lowpass', lp) * gain

def perc(kind, gain, lp):
    n = int(SR * (0.18 if kind == 'kick' else 0.12 if kind == 'snare' else 0.04))
    t = np.arange(n) / SR
    if kind == 'kick':
        x = np.sin(2 * np.pi * np.cumsum(np.geomspace(110, 45, n)) / SR) * np.exp(-t * 18)
    else:
        x = rng.standard_normal(n) * np.exp(-t * (30 if kind == 'snare' else 120))
        if kind == 'hat': x = filt(x, 'highpass', 5000) * 0.5
    return filt(x, 'lowpass', lp) * gain

def chord(name):
    root = NOTE[name[:-1] if name.endswith('m') else name]
    third = 3 if name.endswith('m') else 4
    base = 48 + root
    return [base, base + third, base + 7]

def add(buf, x, pos):
    if pos >= len(buf): return
    end = min(len(buf), pos + len(x)); buf[pos:end] += x[:end - pos]

def fold_loop(buf, n):
    out = buf[:n].copy(); tail = buf[n:]
    out[:len(tail)] += tail[:n]
    return out

def render_track(m):
    step = 60.0 / m['bpm'] / 4
    bars = m['length_bars']; per_bar = 16
    n = int(SR * step * per_bar * bars)
    buf = np.zeros(n + int(SR * 3))
    v = {x['role']: x for x in m['voices']}
    for b in range(bars):
        t0 = b * per_bar
        c = chord(m['progression'][b % len(m['progression'])])
        pv = v['pad']
        for k in c:
            add(buf, tone(pv['wave'], k, step * per_bar * 1.1, pv['gain'] * 0.35, pv['lowpass_hz']), int(SR * step * t0))
        bv = v['bass']
        for s, mi, ln in m['bass_pattern']:
            add(buf, tone(bv['wave'], mi, step * ln, bv['gain'], bv['lowpass_hz']), int(SR * step * (t0 + s)))
        mv = v['melody']
        for s, mi, ln in m['melody'][b]:
            add(buf, tone(mv['wave'], mi, step * max(ln, 2), mv['gain'], mv['lowpass_hz']), int(SR * step * (t0 + s)))
        pc = v['perc']; dr = m['drum_pattern']
        for kind in ('kick', 'snare', 'hat'):
            for s in dr.get(kind, []):
                add(buf, perc(kind, pc['gain'], pc['lowpass_hz']), int(SR * step * (t0 + s)))
    x = fold_loop(buf, n) if m.get('loop') else buf[:n + int(SR * 1.5)]
    x = x / (np.max(np.abs(x)) or 1) * 0.7
    if m.get('loop'):
        reps = max(1, int(round(24 / (n / SR))))
        x = np.tile(x, reps)
    else:
        x[-int(SR * 0.05):] *= np.linspace(1, 0, int(SR * 0.05))
    return x

def render_bed(layers, secs=10):
    n = int(SR * secs)
    out = np.zeros(n)
    for l in layers:
        w = l['wave']
        if w.startswith('noise'): x = s6a.noise(w, n)
        else:
            f = np.geomspace(max(l['hz_start'], 1), max(l['hz_end'], 1), n)
            x = np.sin(2 * np.pi * np.cumsum(f) / SR)
        x = filt(filt(x, 'highpass', l.get('highpass_hz')), 'lowpass', l.get('lowpass_hz'))
        out += x / (np.std(x) + 1e-9) * l['gain']
    # slow breathing so the bed is not static, then crossfade the ends for a seamless loop
    out *= 0.85 + 0.15 * np.sin(2 * np.pi * np.arange(n) / SR / 5)
    c = int(SR * 0.6)
    fade = np.linspace(0, 1, c)
    out[:c] = out[:c] * fade + out[-c:] * (1 - fade)
    out = out[:-c]
    return out / (np.max(np.abs(out)) or 1) * 0.6

if __name__ == '__main__':
    d = json.load(open(s6a.PACK, encoding='utf8'))
    what = sys.argv[1:] or ['music', 'ambience']
    n = 0
    if 'music' in what:
        for m in d['music']:
            s6a.write('music_' + s6a.slug(m['id'][4:]), render_track(m)); n += 1
    if 'ambience' in what:
        for a in d['ambience']:
            name = s6a.slug(a['id'][4:])
            s6a.write('amb_' + name, render_bed(a['layers'])); n += 1
            for i, ev in enumerate(a.get('random_events', [])):
                s6a.write(f'amb_{name}_ev{i}', s6a.render(ev['recipe'])); n += 1
    print('wrote', n)
