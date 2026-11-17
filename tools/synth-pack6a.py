"""Synthesizes Gemini pack 6a SFX recipes (spells, UI/world) to public/audio/*.m4a.
Usage: python tools/synth-pack6a.py [spells|ui|monsters]...  (default spells ui)
Output names: sfx_spell_<slug>_cast / _impact, ui: id with '-' -> '_', monsters: mon_<enemy>_<event>.
"""
import json, os, subprocess, sys, tempfile, wave
import numpy as np
from scipy.signal import butter, sosfilt

SR = 44100
ROOT = os.path.join(os.path.dirname(__file__), '..')
PACK = os.path.join(ROOT, '..', '.planning', 'gemini-pack-6a.json')
OUT = os.path.join(ROOT, 'public', 'audio')
rng = np.random.default_rng(6)

def noise(kind, n):
    w = rng.standard_normal(n)
    if kind == 'noise_white':
        return w
    f = np.fft.rfft(w)
    k = np.arange(len(f)); k[0] = 1
    f = f / (np.sqrt(k) if kind == 'noise_pink' else k)
    x = np.fft.irfft(f, n)
    return x / (np.std(x) + 1e-9)

def layer(l, total_n):
    n = int(SR * (l['attack_ms'] + l['decay_ms'] + l['release_ms'] + 60) / 1000)
    n = max(n, 64)
    t = np.arange(n) / SR
    wv = l['wave']
    if wv.startswith('noise'):
        x = noise(wv, n)
    else:
        f = np.geomspace(max(l['hz_start'], 1), max(l['hz_end'], 1), n)
        ph = 2 * np.pi * np.cumsum(f) / SR
        x = {'sine': np.sin, 'triangle': lambda p: 2 / np.pi * np.arcsin(np.sin(p)),
             'saw': lambda p: 2 * ((p / (2 * np.pi)) % 1) - 1,
             'square': lambda p: np.sign(np.sin(p))}[wv](ph)
    a, d, r = (int(SR * l[k] / 1000) for k in ('attack_ms', 'decay_ms', 'release_ms'))
    s = l['sustain']
    env = np.concatenate([np.linspace(0, 1, max(a, 1)), np.linspace(1, s, max(d, 1)),
                          np.full(max(n - a - d - r, 0), s), np.linspace(s, 0, max(r, 1))])[:n]
    env = np.pad(env, (0, n - len(env)))
    x = x * env
    if wv.startswith('noise') or True:
        for kind, hz in (('highpass', l.get('highpass_hz')), ('lowpass', l.get('lowpass_hz'))):
            if hz and hz < SR / 2 - 100:
                x = sosfilt(butter(2, hz, btype=kind, fs=SR, output='sos'), x)
    return x * l['gain']

def render(recipe):
    dur = int(SR * recipe['duration_ms'] / 1000)
    layers = recipe['layers']
    tail = int(SR * 0.05)
    out = np.zeros(dur + tail + int(SR * 0.5))
    for l in layers:
        x = layer(l, dur)
        o = int(SR * l.get('delay_ms', 0) / 1000)
        out[o:o + len(x)] += x[:len(out) - o]
    out = out[:dur + tail]
    fade = int(SR * 0.02)
    out[-fade:] *= np.linspace(1, 0, fade)
    peak = np.max(np.abs(out)) or 1
    return out / peak * 0.8

def write(name, x):
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, 'a.wav')
        with wave.open(p, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p, '-c:a', 'aac', '-b:a', '64k',
                        os.path.join(OUT, name + '.m4a')], check=True)

def slug(s): return s.replace('-', '_')

if __name__ == '__main__':
    d = json.load(open(PACK, encoding='utf8'))
    what = sys.argv[1:] or ['spells', 'ui']
    n = 0
    if 'spells' in what:
        for s in d['sfx_spells']:
            for ev in ('cast', 'impact'):
                if s.get(ev): write(slug(s['id']) + '_' + ev, render(s[ev])); n += 1
    if 'ui' in what:
        for s in d['sfx_ui_and_world']:
            write(slug(s['id']), render(s['recipe'])); n += 1
    if 'monsters' in what:
        for s in d['sfx_monsters']:
            for ev in ('aggro', 'attack', 'hurt', 'death', 'idle'):
                if s.get(ev): write('mon_' + slug(s['enemy']) + '_' + ev, render(s[ev])); n += 1
    print('wrote', n)
