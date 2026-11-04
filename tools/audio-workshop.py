"""Private original audio candidates; never writes runtime assets. Python + numpy + FFmpeg.
Run from checkout: python game/tools/audio-workshop.py --sfx (then --music / --verify).
All stochastic layers have per-cue SHA-derived seeds. No recordings or sample libraries.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.planning/audio-workshop'
SR = 48000
TAU = 2 * np.pi
MASTER_SEED = 20261104

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

def seed_for(name):
    return int.from_bytes(hashlib.sha256(f'{MASTER_SEED}:{name}'.encode()).digest()[:8], 'little')

def rng_for(name):
    return np.random.Generator(np.random.PCG64(seed_for(name)))

def db(x):
    return float(20 * np.log10(max(float(x), 1e-12)))

def filtered_noise(rng, n, low=80, high=5000):
    x = rng.standard_normal(n)
    f = np.fft.rfftfreq(n, 1 / SR)
    # Smooth spectral slopes avoid brickwall ringing; independent seeded excitation.
    shape = (f / np.maximum(f, low)) ** 2 / np.sqrt(1 + (f / high) ** 8)
    x = np.fft.irfft(np.fft.rfft(x) * shape, n)
    return x / max(np.std(x), 1e-8)

def edge(x, ms=4):
    x = x.copy()
    n = min(round(ms * SR / 1000), len(x) // 2)
    w = np.sin(np.linspace(0, np.pi / 2, n)) ** 2
    x[:n] *= w.reshape((-1,) + (1,) * (x.ndim - 1))
    x[-n:] *= w[::-1].reshape((-1,) + (1,) * (x.ndim - 1))
    return x

def modal(t, fundamental, ratios, decay, rng):
    out = np.zeros(len(t))
    for k, ratio in enumerate(ratios):
        freq = fundamental * ratio * rng.uniform(.985, 1.015)
        out += np.sin(TAU * freq * t + rng.uniform(-.12, .12)) * np.exp(-t * (1 + k * .4) / decay) / (1 + k * .8)
    return out

def normalize(x, rms_db, ceiling_db=-7):
    x = x - np.mean(x, axis=0)
    rms = np.sqrt(np.mean(x*x))
    gain = min(10**(rms_db/20) / max(rms, 1e-10), 10**(ceiling_db/20) / max(np.max(np.abs(x)), 1e-10))
    return x * gain, db(gain)

def pcm(x):
    if not np.all(np.isfinite(x)) or np.max(np.abs(x)) >= 1:
        raise ValueError('Nonfinite or clipping output; no hard-clip rescue allowed')
    return np.rint(x * 32767).astype('<i2').tobytes()

def wav(path, x):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1 if x.ndim == 1 else x.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm(x))

def read_wav(path):
    with wave.open(str(path), 'rb') as w:
        assert w.getframerate() == SR and w.getsampwidth() == 2
        return np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float).reshape(-1, w.getnchannels()) / 32768

def run(args):
    return subprocess.run(args, check=True, capture_output=True).stdout

def encode(source, dest, rate='112k'):
    dest.parent.mkdir(parents=True, exist_ok=True)
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(source), '-map_metadata', '-1', '-c:a', 'aac', '-b:a', rate, '-movflags', '+faststart', str(dest)])

def metrics(x):
    if x.ndim == 1: x = x[:, None]
    return {'frames': len(x), 'seconds': len(x)/SR, 'sampleRate': SR, 'channels': x.shape[1],
            'peakDbfs': db(np.max(np.abs(x))), 'rmsDbfs': db(np.sqrt(np.mean(x*x))),
            'dc': np.mean(x, axis=0).tolist(), 'clippedSamples': int(np.sum(np.abs(x) >= .9999)),
            'silenceFractionBelowMinus70': float(np.mean(np.max(np.abs(x), axis=1) < 10**(-70/20)))}

# Original material names; target RMS deliberately lower for high-rate footsteps/UI.
SFX = []
def cues(stem, kind, count, duration, event, target):
    for v in range(count):
        SFX.append(dict(id=f'{stem}_{v+1:02d}', kind=kind, variant=v, duration=duration,
                        event=event, targetRmsDbfs=target))

cues('flint_path', 'gravel', 3, .24, 'step1 / gravel surface (future selector)', -28)
cues('meadow_tread', 'grass', 3, .23, 'step2 / grass surface (future selector)', -29)
cues('mail_shift', 'armor', 2, .36, 'movement armor layer (future event)', -30)
cues('iron_rebuff', 'sword', 3, .48, 'hit / weapon-contact variant', -24)
cues('oak_guard', 'shield', 2, .42, 'hit / shield-contact variant (future selector)', -25)
cues('yew_release', 'bow', 2, .32, 'bow', -26)
cues('blade_air', 'whoosh', 2, .30, 'miss', -29)
cues('anvil_tine', 'metal', 1, .70, 'metal object contact (future event)', -27)
cues('ashwood_knock', 'wood', 1, .20, 'wood object contact (future event)', -28)
cues('linen_fold', 'cloth', 1, .28, 'inventory cloth (future event)', -31)
cues('copper_find', 'gold', 1, .46, 'gold', -29)
cues('ledger_latch', 'ui', 1, .065, 'click', -32)
cues('satchel_take', 'bag', 1, .38, 'item pickup type14 (future distinct cue)', -29)
for kind, name in [('fire', 'ember_unfurl'), ('water', 'rill_crown'), ('air', 'reed_gale'), ('earth', 'loam_pulse'), ('astral', 'star_lattice')]:
    cues(name, kind, 1, .95, f'cast_{kind}', -27)
cues('oath_weave', 'buff', 1, .85, 'buff', -28)
cues('spring_mend', 'heal', 1, 1.15, 'heal', -28)
cues('fallen_harness', 'death', 1, 1.20, 'death / nonvocal body + equipment fall', -25)

def sfx(c):
    rng = rng_for(c['id'])
    n = round(c['duration'] * SR)
    t = np.arange(n) / SR
    kind = c['kind']
    def noise(lo, hi): return filtered_noise(rng, n, lo, hi)
    def ring(f, ratios, decay): return modal(t, f * rng.uniform(.91, 1.09), ratios, decay, rng)
    def burst(at, d):
        z = np.maximum(0, t-at)
        return (t >= at) * (1 - np.exp(-z/.0015)) * np.exp(-z/d)
    if kind in ('gravel', 'grass'):
        x = .28 * noise(45, 520) * burst(.012, .042)
        x += .12 * noise(950 if kind == 'gravel' else 1600, 6500 if kind == 'gravel' else 3800) * burst(.008, .065)
        for _ in range(13 if kind == 'gravel' else 6):
            at = rng.uniform(.018, .12)
            x += rng.uniform(.035, .09) * noise(600, 4500) * burst(at, rng.uniform(.002, .008))
    elif kind in ('metal', 'sword', 'armor'):
        x = .38 * ring(720 if kind == 'sword' else 1150, [1, 1.43, 2.71, 3.89, 5.12, 6.37], .18 if kind == 'sword' else .25)
        x += .5 * noise(450, 6000) * burst(.002, .009)
        if kind == 'sword': x += .30 * ring(140, [1, 2.3, 4.6], .035)
        if kind == 'armor':
            x *= .18
            for at in [.034, .079, .13]:
                x += .1 * noise(1300, 7000) * burst(at+rng.uniform(-.01, .01), .015)
    elif kind in ('wood', 'shield', 'ui'):
        x = .65 * ring(170 if kind == 'shield' else 390, [1, 2.76, 5.4, 8.93], .06)
        x += .4 * noise(180, 2600) * burst(.001, .008)
        if kind == 'shield': x += .13 * ring(1250, [1, 1.7, 3.23], .11)
    elif kind in ('cloth', 'bag', 'death'):
        x = .23 * noise(300, 2400) * (burst(.015, .05) + .7*burst(.11, .065))
        if kind in ('bag', 'death'):
            at = .08 if kind == 'bag' else .26
            x += .6 * noise(35, 500) * burst(at, .09)
            x += .15 * ring(180, [1, 2.53, 4.1], .1) * burst(at, .1)
        if kind == 'death': x += .08 * noise(1300, 5600) * burst(.43, .15)
    elif kind == 'bow':
        # Plucked string modes, falling string tension and short limb resonance.
        phase = TAU * (350*t + 100*.025*(1-np.exp(-t/.025)))
        x = sum(np.sin(k*phase) * np.exp(-t*(1+k*.6)/.10)/k**1.3 for k in range(1, 7))
        x += .3 * noise(800, 4200) * burst(.003, .015)
        x += .12 * ring(150, [1, 2.76, 5.4], .045)
    elif kind in ('whoosh', 'air', 'fire'):
        length = c['duration']
        env = np.sin(np.pi*t/length) ** (2.5 if kind == 'whoosh' else 1.7)
        x = noise(350 if kind != 'fire' else 70, 3500 if kind != 'fire' else 2100) * env
        if kind == 'fire':
            for _ in range(15): x += .3 * noise(1300, 6000) * burst(rng.uniform(.10, .6), .008)
        if kind == 'air': x += .08 * ring(780, [1, 1.5, 2.5], .55) * env
    elif kind == 'earth':
        x = .7 * noise(30, 340) * burst(.03, .19)
        x += .5 * ring(64, [1, 1.6, 2.8], .22)
        for at in [.08, .17, .3]: x += .14 * noise(650, 2500) * burst(at, .024)
    elif kind == 'water':
        x = .12 * noise(180, 1800) * np.sin(np.pi*t/c['duration'])**2
        for at in [.02, .10, .23, .37, .54]:
            z = np.maximum(0, t-at)
            f = rng.uniform(500, 1350)
            x += .35 * np.sin(TAU*f*(z+.022*(1-np.exp(-z/.022)))) * burst(at, .06)
    else:  # little modal chimes, never a rectangular-wave UI beep
        pitches = {'gold': [1730, 2190, 2640], 'astral': [493.88, 739.99, 1108.73, 1479.98],
                   'buff': [293.66, 440, 587.33], 'heal': [392, 493.88, 587.33, 783.99]}[kind]
        x = np.zeros(n)
        for k, f in enumerate(pitches):
            at = k * (.035 if kind == 'gold' else .085)
            z = np.maximum(0, t-at)
            env = burst(at, .10 if kind == 'gold' else .20)
            x += (np.sin(TAU*f*z) + .16*np.sin(TAU*f*2.76*z)*np.exp(-z/.06))*env/(1+k*.22)
        if kind == 'astral': x += .055 * noise(700, 3500)*np.sin(np.pi*t/c['duration'])**2
    x = edge(x, 2 if kind == 'ui' else 5)
    return normalize(x, c['targetRmsDbfs'])[0]

def save_candidate(cid, x, category, extra):
    source = OUT / 'source-wav' / category / f'{cid}.wav'
    final = OUT / 'candidates-aac' / category / f'{cid}.m4a'
    wav(source, x)
    encode(source, final, '192k' if category == 'music' else '112k')
    return dict(id=cid, status='audition-candidate-not-runtime-accepted', license='own',
                source=source.relative_to(ROOT).as_posix(), aac=final.relative_to(ROOT).as_posix(),
                wavSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                aacSha256=hashlib.sha256(final.read_bytes()).hexdigest(), seed=str(seed_for(cid)),
                metrics=metrics(read_wav(source)), **extra)

def make_sfx():
    entries = []
    samples = []
    for c in SFX:
        x = sfx(c)
        same = pcm(x) == pcm(sfx(c))
        assert same
        entries.append(save_candidate(c['id'], x, 'sfx', dict(event=c['event'], category=c['kind'],
                      targetRmsDbfs=c['targetRmsDbfs'], pcmRegenerationIdentical=same)))
        samples.append(x)
    dump(OUT/'catalog-sfx.json', entries)
    # Cue spacing intentionally preserves material contrasts; montage is not a gameplay mix.
    sheet = []
    for seconds, indices, filename in [(10, [0,1,2,3,4,5,8,9,10,11,13,15,20,21,23,24,25,26,27,28,29,30], 'sfx-first-audition-10s'),
                                       (18, list(range(len(SFX))), 'sfx-materials-and-magic-18s')]:
        y = np.zeros((seconds*SR, 2))
        for j, idx in enumerate(indices):
            at = .12 + j*(seconds-1.45)/max(1,len(indices)-1)
            pan = [-.32,0,.32][j%3]
            x = samples[idx]
            start = round(at*SR)
            count = min(len(x),len(y)-start)
            y[start:start+count,0] += x[:count]*math.sqrt((1-pan)/2)
            y[start:start+count,1] += x[:count]*math.sqrt((1+pan)/2)
            sheet.append(dict(preview=filename, timeSeconds=round(at,4), id=SFX[idx]['id']))
        y, _ = normalize(edge(y), -25, -6)
        path = OUT/'previews'/f'{filename}.wav'
        wav(path,y)
        encode(path,path.with_suffix('.m4a'),'160k')
    dump(OUT/'previews/sfx-cue-sheet.json',sheet)
    dump(OUT/'sfx-checkpoint.json',dict(status='SFX rendered before music', count=len(entries),
         seed=MASTER_SEED, notes='Original procedural synthesis; not natural recordings. Awaiting human audition.'))
    print(f'SFX CHECKPOINT: {len(entries)} candidates; {OUT / "previews/sfx-first-audition-10s.wav"}', flush=True)

def hz(m): return 440 * 2**((m-69)/12)

def instrument(kind, midi, duration, rng):
    """Own additive/modal timbres. Expressive synthetic approximations, not orchestra samples."""
    tail = .8 if kind in ('strings', 'flute', 'horn') else .65
    t = np.arange(round((duration+tail)*SR))/SR
    f = hz(midi)
    vib = .0025 * f / 5.1 * (1-np.exp(-t/.22)) * np.sin(TAU*5.1*t)
    phase = TAU*f*t + vib
    if kind == 'strings':
        x = np.zeros(len(t))
        # Three independently phased bows, softened harmonic slope; no saw discontinuities.
        for cents, weight in [(-5,.28),(1,.44),(6,.28)]:
            for h in range(1,10):
                x += weight/h**1.55 * np.sin(h*phase*2**(cents/1200)+rng.uniform(0,TAU))*np.exp(-h*f/6500)
        x += .025*filtered_noise(rng,len(t),700,3500)
        attack, release = .13, .26
        env = (1-np.exp(-t/attack)) * np.exp(-np.maximum(0,t-duration)/release)
        env *= .88 + .08*np.sin(TAU*t/2.3+rng.uniform(0,TAU))
    elif kind == 'flute':
        x = np.sin(phase)+.23*np.sin(2*phase)+.07*np.sin(3*phase)
        x += .045*filtered_noise(rng,len(t),1100,4500)
        env = (1-np.exp(-t/.055))*np.exp(-np.maximum(0,t-duration)/.09)
        env *= .93 + .07*np.sin(TAU*1.3*t)
    elif kind == 'horn':
        x = sum((1/h**1.45)*np.sin(h*phase)*np.exp(-((h*f-1050)/2400)**2) for h in range(1,9))
        env = (1-np.exp(-t/.075))*np.exp(-np.maximum(0,t-duration)/.14)
        env *= .9+.1*np.sin(np.pi*np.minimum(t/duration,1))
    elif kind in ('pizz', 'mallet'):
        if kind == 'pizz':
            x = sum(np.sin(h*phase+rng.uniform(-.15,.15))*np.exp(-t*(1+h*.34)/.60)/h**1.45 for h in range(1,9))
            x += .025*filtered_noise(rng,len(t),800,4000)*np.exp(-t/.013)
        else:
            x = sum(np.sin(phase*r)*np.exp(-t*(1+k)/.6)*g for k,(r,g) in enumerate([(1,1),(2.76,.17),(5.4,.06)]))
        env = 1-np.exp(-t/.0025)
    elif kind == 'drum':
        x = np.sin(TAU*(f*t+60*.026*(1-np.exp(-t/.026))))*np.exp(-t/.12)
        x += .25*filtered_noise(rng,len(t),100,2200)*np.exp(-t/.038)
        env = 1-np.exp(-t/.001)
    elif kind == 'brush':
        x = filtered_noise(rng,len(t),1100,4400)*np.exp(-t/.045)
        env = 1-np.exp(-t/.003)
    else: raise ValueError(kind)
    return edge(x*env,4)

# 16 bars per study. Four explicitly authored phrases with answers/variation, not random leads.
# Each bar: (beat offset, MIDI pitch, duration in beats). Harmony is separately scored.
STUDIES = [
 dict(id='lanterns_beyond_the_ford', mood='exploration', bpm=90, lead='flute',
      chords=[(50,'m'),(55,'M'),(48,'M'),(57,'m'),(50,'m'),(53,'M'),(55,'M'),(50,'m'),
              (53,'M'),(48,'M'),(55,'M'),(57,'m'),(50,'m'),(55,'M'),(48,'M'),(50,'m')],
      melody=[[(.2,74,1),(1.8,69,.6),(2.7,72,1)],[(.3,71,1.2),(2,74,.8),(3,76,.7)],
              [(0,79,1.4),(2,76,.7),(3,74,.7)],[(.5,72,1),(2,69,1.4)],
              [(0,74,.8),(1,76,.5),(2,77,1.3)],[(.4,76,1),(2,72,1.2)],
              [(0,71,.7),(1.2,74,.8),(2.6,69,.8)],[(0,74,2.6)],
              [(.5,77,.8),(1.8,81,.7),(3,79,.7)],[(0,76,1.4),(2,79,1.2)],
              [(.2,74,.8),(1.4,71,.7),(2.6,69,.9)],[(0,72,1),(2,76,1.3)],
              [(0,77,.7),(1,76,.7),(2,74,1.4)],[(.4,71,1),(2,69,1)],
              [(0,72,1.4),(2,76,.8),(3,72,.6)],[(0,69,1),(1.6,72,.8),(3,76,.7)]]),
 dict(id='copper_roofs_at_market', mood='town', bpm=100, lead='mallet',
      chords=[(53,'M'),(48,'M'),(50,'m'),(46,'M'),(43,'m'),(48,'M'),(53,'M'),(48,'M'),
              (50,'m'),(46,'M'),(53,'M'),(48,'M'),(43,'m'),(48,'M'),(46,'M'),(48,'M')],
      melody=[[(0,69,.6),(.9,72,.5),(1.6,77,1),(3,76,.5)],[(.4,76,.6),(1.3,72,.6),(2.6,67,.8)],
              [(0,69,.5),(.75,74,.8),(2,77,.5),(3,76,.7)],[(0,74,1),(1.6,70,.6),(2.7,65,.8)],
              [(.3,67,.6),(1.3,70,.5),(2,74,1)],[(0,72,.5),(.8,76,.6),(2,74,.6),(3,67,.6)],
              [(0,69,1),(1.5,72,.5),(2.5,77,1)],[(0,76,1),(2,72,1)],
              [(0,77,.5),(.8,81,.5),(1.7,79,.8),(3,77,.5)],[(0,74,.7),(1,77,.6),(2.3,70,1)],
              [(.2,72,.5),(1,69,.6),(2,65,.6),(3,69,.6)],[(0,67,.5),(1,72,.6),(2.5,76,1)],
              [(0,74,.8),(1.3,70,.6),(2.5,67,1)],[(.1,72,.5),(1,74,.5),(2,76,1.3)],
              [(0,77,1),(1.5,74,.8),(3,70,.5)],[(0,67,.6),(1,72,.8),(2.5,76,1)]]),
 dict(id='reeds_before_the_watchfire', mood='tension', bpm=96, lead='horn',
      chords=[(52,'m'),(53,'M'),(50,'m'),(52,'m'),(57,'m'),(53,'M'),(50,'m'),(52,'m'),
              (52,'m'),(53,'M'),(57,'m'),(55,'M'),(50,'m'),(53,'M'),(50,'m'),(52,'m')],
      melody=[[(.4,64,1.5),(2.7,65,.7)],[(.2,65,1),(2,72,1.4)],[(1,69,1),(2.6,65,.8)],[(.2,64,2.8)],
              [(.6,69,1),(2,71,.7),(3,72,.6)],[(0,72,1.7),(2.5,65,1)],[(.8,69,1),(2.2,65,1)],[(0,64,2.5)],
              [(0,76,1.4),(2,71,1)],[(.4,77,1),(2,72,1.4)],[(0,76,1),(1.8,72,.8),(3,69,.7)],[(.5,71,1),(2,67,1.3)],
              [(0,69,1.5),(2,65,1.2)],[(0,65,1),(1.6,69,.8),(2.8,72,.8)],[(.4,69,1),(2,65,1)],[(0,64,2.2),(3,71,.6)]]),
 dict(id='standard_at_stonebridge', mood='battle', bpm=112, lead='horn',
      chords=[(50,'m'),(46,'M'),(53,'M'),(48,'M'),(43,'m'),(46,'M'),(45,'M'),(50,'m'),
              (50,'m'),(48,'M'),(46,'M'),(53,'M'),(43,'m'),(46,'M'),(45,'M'),(45,'M')],
      melody=[[(0,74,.65),(1,74,.4),(1.7,77,.8),(3,76,.6)],[(0,74,1),(1.5,70,.6),(2.5,77,1)],
              [(0,76,.65),(1,77,.4),(2,81,1.3)],[(0,79,1),(1.5,76,.7),(3,72,.7)],
              [(0,74,.7),(1,79,.7),(2,77,.6),(3,74,.6)],[(0,77,1.4),(2,74,.7),(3,70,.6)],
              [(0,73,.6),(1,76,.7),(2,81,1.4)],[(0,77,1),(1.5,76,.6),(2.5,74,1.2)],
              [(0,81,.6),(1,77,.6),(2,74,.6),(3,77,.6)],[(0,79,.7),(1,76,.6),(2,72,1.4)],
              [(0,77,.7),(1,74,.6),(2,70,.6),(3,74,.6)],[(0,76,.6),(1,77,.6),(2,81,1.4)],
              [(0,79,.7),(1,77,.6),(2,74,1.3)],[(0,77,1),(1.5,74,.6),(2.5,70,1.1)],
              [(0,73,.6),(1,76,.6),(2,81,.7),(3,79,.6)],[(0,76,1),(1.5,73,.7),(3,69,.7)]])
]

def music(study):
    beat = 60/study['bpm']
    n = round(16*4*beat*SR)
    y = np.zeros((n,2))
    score = []
    rng = rng_for(study['id'])
    def add(kind, pitch, at, duration, gain, pan):
        jitter = rng.uniform(-.012,.012) if kind not in ('strings',) else rng.uniform(-.018,.018)
        velocity = gain*rng.uniform(.91,1.07)
        phase_seed = int(rng.integers(0,2**32))
        x = instrument(kind,pitch,duration*beat,np.random.default_rng(phase_seed))
        start = round((at*beat+jitter)*SR)
        indices = (np.arange(len(x))+start)%n
        y[indices,0] += x*velocity*math.sqrt((1-pan)/2)
        y[indices,1] += x*velocity*math.sqrt((1+pan)/2)
        score.append(dict(instrument=kind,midi=pitch,beat=at,durationBeats=duration,
                          gain=round(velocity,6),pan=pan,jitterSeconds=round(jitter,6),seed=phase_seed))
    mood = study['mood']
    for bar,(root,mode) in enumerate(study['chords']):
        triad = [root,root+(3 if mode=='m' else 4),root+7]
        pos = bar*4
        phrase = [.82,.88,.96,.78][(bar//4)%4]
        if mood == 'battle': phrase *= 1.1
        # Legato inner voices and separate cello foundation, with a little inversion movement.
        for k,pitch in enumerate(triad):
            add('strings',pitch+12,pos,3.8,.048*phrase,[-.48,.05,.42][k])
        add('strings',root-12,pos,3.6,.065*phrase,-.12)
        # Structured plucked accompaniment changes pattern at phrase answers.
        pattern = [0,2,1,2] if bar%4 < 2 else [1,2,0,2]
        times = [0,1.5,2,3.5] if mood!='town' else [0,.75,2,2.75]
        if mood == 'tension': times=[.5,2.5]
        for k,at in enumerate(times):
            add('pizz',triad[pattern[k]]+12,pos+at,.7,.075*phrase,-.4)
        if mood == 'battle':
            for k in range(8):
                add('pizz',triad[[0,0,2,1,0,2,1,2][k]],pos+k*.5,.4,.075*(1 if k%2==0 else .72),-.25)
        # Melodic phrase in front, with space for the answer voice.
        for at,pitch,dur in study['melody'][bar]:
            lead = study['lead']
            add(lead,pitch,pos+at,dur,.105*phrase if lead!='mallet' else .16*phrase,.16)
        if bar%4 in (1,3):
            add('flute' if mood in ('town','battle') else 'mallet',triad[1]+12,pos+2.5,1.0,.052*phrase,.38)
        if mood == 'exploration' and bar%2 == 0:
            add('mallet',triad[2]+24,pos+1.5,.5,.05,.45)
        # Hand percussion instead of a modern kick/snare/hat groove.
        if mood == 'battle':
            for at in [0,1.5,2,3.25]: add('drum',38 if at in (0,2) else 43,pos+at,.35,.21 if at in (0,2) else .11,-.08)
            for at in [.75,1.75,2.75,3.5]: add('brush',65,pos+at,.13,.027,.5)
        elif mood == 'town':
            for at in [0,2]: add('drum',45,pos+at,.25,.075,-.1)
            for at in [1,3]: add('brush',67,pos+at,.15,.026,.4)
        elif mood == 'tension':
            add('drum',33,pos,.4,.15,-.15)
            if bar%2: add('drum',38,pos+2.75,.3,.06,.05)
        elif bar%2 == 1: add('brush',60,pos+3,.15,.018,.3)
    # Circular room impulse, with low-pass damping. No delay or reverb is chopped at the seam.
    # Every wrapped tail belongs to the same 16-bar arrangement on the preceding cycle.
    f = np.fft.rfftfreq(n,1/SR)
    kernel = np.zeros(n)
    for k in range(20):
        delay = .037+k*.0391+(k%3)*.007
        kernel[round(delay*SR)] += .07*math.exp(-delay/.30)*(-1 if k%7==0 else 1)
    spectrum = np.fft.rfft(kernel)/(1+(f/3800)**2)
    wet = np.column_stack([np.fft.irfft(np.fft.rfft(y[:,1-ch])*spectrum,n) for ch in range(2)])
    y += wet
    # Remove subsonic/DC drift with a periodic spectral filter, preserving the loop.
    for ch in range(2):
        y[:,ch] = np.fft.irfft(np.fft.rfft(y[:,ch])*(f*f/(f*f+28**2)),n)
    y,gain = normalize(y,-23 if mood!='battle' else -22,-6)
    return y,score,gain

def make_music():
    if not (OUT/'sfx-checkpoint.json').exists(): raise RuntimeError('SFX checkpoint required first')
    entries=[]
    for study in STUDIES:
        x,score,gain = music(study)
        # Full second render verifies jitter, voices, wet tails and quantization determinism.
        again,_,_ = music(study)
        same=pcm(x)==pcm(again)
        assert same
        record=save_candidate(study['id'],x,'music',dict(event='music_'+study['mood'], mood=study['mood'],
                    bpm=study['bpm'],bars=16,beatsPerBar=4,masterGainDb=gain,
                    pcmRegenerationIdentical=same,loopStartFrame=0,loopEndFrame=len(x),
                    loopSeconds=len(x)/SR,tailMethod='Exact circular note/reverb overlap-add; phase-compatible tails wrap within the first bar; no global fade or arbitrary-phase splice',
                    instrumentation=sorted(set(e['instrument'] for e in score))))
        entries.append(record)
        dump(OUT/'scores'/f'{study["id"]}.json',dict(composition=study,events=score))
        if len(entries)==1:
            excerpt=edge(x[:SR*12],20)
            preview=OUT/'previews/first-theme-lanterns-12s.wav'
            wav(preview,excerpt); encode(preview,preview.with_suffix('.m4a'),'192k')
        dump(OUT/'catalog-music.json',entries)
        print(f'MUSIC: {study["id"]} {len(x)/SR:.3f}s; PCM reproducible={same}',flush=True)

def decode(path, sample_rate=SR):
    data=run(['ffmpeg','-v','error','-i',str(path),'-ar',str(sample_rate),'-ac','2','-f','f32le','-'])
    return np.frombuffer(data,dtype='<f4').reshape(-1,2).astype(float)

def seam(x):
    window=min(round(.020*SR),len(x)//4)
    pre,post=x[-window:],x[:window]
    jump=np.abs(x[0]-x[-1])
    # Compare the join derivative to normal waveform motion, not to zero.
    differences=np.abs(np.diff(x,axis=0))
    p99=np.percentile(differences,99,axis=0)
    before=np.sqrt(np.mean(pre*pre,axis=0))
    after=np.sqrt(np.mean(post*post,axis=0))
    return dict(jumpDbfs=[db(z) for z in jump],jumpAbsolute=jump.tolist(),
                derivativeP99=p99.tolist(),jumpOverDerivativeP99=(jump/np.maximum(p99,1e-12)).tolist(),
                rmsBefore20msDbfs=[db(z) for z in before],rmsAfter20msDbfs=[db(z) for z in after],
                rmsChange20msDb=(20*np.log10(np.maximum(after,1e-12)/np.maximum(before,1e-12))).tolist(),
                bothSidesNonSilent=bool(np.all(before>10**(-65/20)) and np.all(after>10**(-65/20))))

def verify():
    entries=json.loads((OUT/'catalog-sfx.json').read_text(encoding='utf-8'))
    music_catalog=OUT/'catalog-music.json'
    if music_catalog.exists(): entries+=json.loads(music_catalog.read_text(encoding='utf-8'))
    report=[]
    for e in entries:
        source=ROOT/e['source']; final=ROOT/e['aac']
        assert hashlib.sha256(source.read_bytes()).hexdigest()==e['wavSha256']
        assert hashlib.sha256(final.read_bytes()).hexdigest()==e['aacSha256']
        raw=read_wav(source)
        oversampled=decode(source,SR*4)
        true_peak=db(np.max(np.abs(oversampled)))
        decoded=decode(final)
        aac_true_peak=db(np.max(np.abs(decode(final,SR*4))))
        item=dict(id=e['id'],pcm=metrics(raw),truePeak4xDbtp=true_peak,
                  decodedAac=metrics(decoded),aacTruePeak4xDbtp=aac_true_peak,
                  hashesMatch=True,pcmReproducibleAtRender=e['pcmRegenerationIdentical'])
        if e.get('category'):
            cue=next(c for c in SFX if c['id']==e['id'])
            expected=pcm(sfx(cue))
            with wave.open(str(source),'rb') as w: actual=w.readframes(w.getnframes())
            item['pcmRegenerationIdentical']=actual==expected
            assert item['pcmRegenerationIdentical']
            item['targetRmsDbfs']=cue['targetRmsDbfs']
        else:
            n=len(raw)
            valid=decoded[:n]
            packet_info=json.loads(run(['ffprobe','-v','error','-select_streams','a:0','-show_packets','-show_streams','-of','json',str(final)]))
            packets=packet_info['packets']
            item['loop']=dict(startFrame=0,endFrame=n,seconds=n/SR,
                             decodedFrames=len(decoded),decodedExtraFrames=len(decoded)-n,
                             encoderFrameSize=1024,expectedAacEncoderPrimingFrames=1024,
                             firstPacket=packets[0],lastPacket=packets[-1],stream=packet_info['streams'][0],
                             rawSeam=seam(raw),decodedFullFileSeam=seam(decoded),
                             decodedTrimmedToPcmSeam=seam(valid),
                             decodedAlignment='FFmpeg default honors MP4 edit list/skip_samples; no manual leading trim applied',
                             decodedPcmComparisonRmsErrorDbfs=db(np.sqrt(np.mean((valid-raw[:len(valid)])**2))),
                             realBrowserLoopTested=False)
            lp=item['loop']
            lp['pcmJoinWithinInternalDerivativeP99']=bool(max(lp['rawSeam']['jumpOverDerivativeP99'])<=1)
            lp['aacSeamReviewRequired']=bool(len(decoded)!=n or max(lp['decodedFullFileSeam']['jumpDbfs'])>-40)
            lp['aacReviewReason']='Codec edge distortion and/or decoded padding; listening/browser decision required' if lp['aacSeamReviewRequired'] else 'No numeric edge flag; listening/browser decision still required'
            # Exact wrap audition: final one second + initial one second, no join fades.
            for label,x in [('pcm',raw),('aac-full',decoded),('aac-valid-window',valid)]:
                wav(OUT/'previews'/f'{e["id"]}-{label}-seam.wav',np.concatenate([x[-SR:],x[:SR]]))
        assert item['pcm']['clippedSamples']==0
        assert true_peak < -3 and aac_true_peak < -3
        report.append(item)
        print(f'VERIFIED {e["id"]}: PCM TP {true_peak:.2f}, AAC TP {aac_true_peak:.2f} dBTP',flush=True)
    for stem in ['flint_path','meadow_tread','mail_shift','iron_rebuff','oak_guard','yew_release','blade_air']:
        variants=[e['wavSha256'] for e in entries if e['id'].startswith(stem)]
        assert len(variants)==len(set(variants))
    dump(OUT/'catalog.json',entries)
    preview_records=[]
    for path in sorted((OUT/'previews').glob('*.wav')):
        preview_record=dict(path=path.relative_to(ROOT).as_posix(),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),metrics=metrics(read_wav(path)))
        if 'seam' not in path.name:
            preview_record['truePeak4xDbtp']=db(np.max(np.abs(decode(path,SR*4))))
        assert preview_record['metrics']['clippedSamples']==0
        preview_records.append(preview_record)
    result=dict(status='technical-candidate-checks-complete; human/browser acceptance open',
                sampleRate=SR,pcmBitDepth=16,masterSeed=MASTER_SEED,
                oversampling='FFmpeg libswresample 4x sinc interpolation; numerical true-peak estimate, not certified hardware measurement',
                allHashesMatch=True,allPcmRegenerationIdentical=True,
                maximumPcmTruePeakDbtp=max(x['truePeak4xDbtp'] for x in report),
                maximumAacTruePeakDbtp=max(x['aacTruePeak4xDbtp'] for x in report),
                clippingSamples=sum(x['pcm']['clippedSamples']+x['decodedAac']['clippedSamples'] for x in report),
                candidates=report,previews=preview_records,limitations=['No human audition by this agent',
                'No reference recording played/analyzed; linked YouTube pages could not be fetched',
                'No real browser, iOS or HTMLAudioElement AAC loop test',
                'PCM determinism is verified on this numpy/FFmpeg host; cross-platform bit identity not promised',
                'True peak and RMS do not establish perceptual quality or fatigue safety',
                'AAC decoded padded frames must not be assumed to match browser media looping'])
    dump(OUT/'technical-report.json',result)
    music_rows=[]
    for item in report:
        if 'loop' in item:
            lp=item['loop']
            music_rows.append(f'| {item["id"]} | {lp["seconds"]:.6f} | {lp["endFrame"]} | {lp["decodedExtraFrames"]} | {max(lp["rawSeam"]["jumpDbfs"]):.2f} | {max(lp["decodedFullFileSeam"]["jumpDbfs"]):.2f} | {max(lp["decodedTrimmedToPcmSeam"]["jumpDbfs"]):.2f} |')
    text='# Audio workshop technical report\n\nAudition candidates only; no runtime acceptance.\n\n'
    text+=f'{len(entries)} candidates: {sum("category" in e for e in entries)} SFX and {sum("mood" in e for e in entries)} music studies. 48 kHz, 16-bit PCM; mono SFX / stereo music. All candidate hashes match; deterministic PCM regeneration verified. Zero clipped samples in PCM and AAC decode. Maximum 4x peak: PCM {result["maximumPcmTruePeakDbtp"]:.2f} dBTP, AAC {result["maximumAacTruePeakDbtp"]:.2f} dBTP.\n\n'
    text+='## Loop measurements\n\n| Study | PCM seconds | Loop end frame (exclusive) | AAC decoded extra frames | PCM join dBFS | Full AAC join dBFS | Trimmed AAC join dBFS |\n|---|---:|---:|---:|---:|---:|---:|\n'+'\n'.join(music_rows)+'\n\n'
    text+='Joins are maximum channel absolute first differences. The JSON also records internal derivative p99 and join/p99 ratio, 20 ms RMS before/after, actual first/last AAC packets including skip_samples, stream edit-list duration and oversampled peaks. Small PCM first differences are consistent with smooth waveform motion; they are not listening proof.\n\n'
    text+='All four PCM joins are below their own internal derivative p99. Conservative AAC review flags are set for town, tension and battle (join above -40 dBFS and/or decoded padding). Town has a -32.63 dBFS join and about 1.49 times its internal derivative p99; battle adds 878 decoded frames (18.29 ms). These are open codec-edge issues, not accepted seamless loops. The 20 ms RMS increases include intended first-downbeat attacks, so they do not alone establish a click.\n\n'
    text+='## Loop construction and codec caveat\n\nEach note and finite room response is summed at its exact cyclic sample position. Previous-cycle note/reverb tails overlap the first bar with their original phase; there is no arbitrary-phase bar splice and no fade to silence on each cycle. This implements periodic tail overlap-add rather than a global equal-power waveform crossfade. Standalone SFX have short envelope tapers; only the 12-second music excerpt has presentation fades. Full studies do not.\n\n'
    text+='AAC uses 1024-sample frames and the encoder writes 1024 priming samples, signalled by the first negative-PTS packet and skip_samples/edit metadata. FFmpeg applies the leading skip by default, but its decoded output can include final partial-frame padding. The measured extra frames above are the observed decode remainder, not an assumed browser gap. `*-pcm-seam.wav`, `*-aac-full-seam.wav` and `*-aac-valid-window-seam.wav` expose the exact joins at t=1 s. Preserve PCM loop end metadata; do not declare HTMLAudioElement.loop gapless from these tests. Real-browser looping remains UNTESTED.\n\n'
    text+='## Levels and limits\n\nCategory RMS aims range from -32 dBFS for UI to -24 for impacts; peak-limited gain may leave a transient below its RMS aim. No hard clipping, saturation or limiter is used. Repeated material variants use separate seeds and have different hashes. UI/steps are quieter by design, but fatigue and simultaneous 12-voice mixes require human/gameplay audition. RMS is unweighted and is not LUFS. No natural-recording, live-orchestral, production-quality, reference-listening or mobile acceptance claim is made.\n\n'
    text+='Full measurements: `technical-report.json`. Composition scores: `scores/`. SFX montage timing: `previews/sfx-cue-sheet.json`. Generated asset licensing/provenance: `provenance.json`.\n'
    (OUT/'technical-report.md').write_text(text,encoding='utf-8')
    provenance=dict(license='own',status='Original procedural audition candidates; not runtime approved',
                    authoring='Original local Python synthesis and authored note-event scores; no recordings, samples, MIDI imports, soundfonts or downloaded instruments',
                    generator='game/tools/audio-workshop.py',generatorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                    numpy=np.__version__,python=__import__('sys').version,
                    ffmpeg=run(['ffmpeg','-version']).decode(errors='replace').splitlines()[0],
                    ffprobe=run(['ffprobe','-version']).decode(errors='replace').splitlines()[0],
                    seedDerivation='first 64 bits little-endian of SHA256(20261104:meaningful_id), numpy PCG64',
                    referenceStatus='Mood/instrumentation brief only. Official portfolio page read; no reference audio played or analyzed. All supplied YouTube fetches failed.',
                    references=['https://dynamedion.com/portfolio/anno-1404/',
                    'https://www.youtube.com/watch?v=vH6pSIgYhek','https://www.youtube.com/watch?v=h8ooHa09GAY',
                    'https://www.youtube.com/watch?v=6v9f98Z7MQU','https://www.youtube.com/watch?v=zNg7e1N7ZZo'],
                    fanReference='zNg7e1N7ZZo was user-labelled fan orchestration, not original Tzar soundtrack',
                    optionalSoundfont='Not used; no third-party audio/tool downloads in this batch',
                    melodicOriginality='Note/rhythm/harmony scores authored locally; no source melody transcribed. No exhaustive external similarity search.',
                    renderReproducibility='PCM regenerated identically; AAC hashes identify actual outputs, cross-encoder-version bit identity not promised')
    provenance['binaryInventory']=[dict(path=p.relative_to(ROOT).as_posix(),bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in sorted(OUT.rglob('*')) if p.is_file() and p.suffix in ('.wav','.m4a')]
    dump(OUT/'provenance.json',provenance)
    print(f'REPORT: {OUT / "technical-report.md"}',flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sfx', action='store_true')
    parser.add_argument('--music', action='store_true')
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.sfx: make_sfx()
    if args.music: make_music()
    if args.verify: verify()
