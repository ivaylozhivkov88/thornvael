"""Kokoro hero-bark voices: 8 heroes x (barks + town greetings + refusals + intro). Resumable.
Out: .planning/evidence/hero-voices/<hero_id>/<key>-<n>.m4a  +  index.json (hero_id -> key -> [files])."""
import json, os, subprocess, sys
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, '.planning', 'evidence', 'hero-voices')
CAST = {  # voice, speed, lang
    'warrior-male': ('am_adam', 0.95, 'en-us'), 'warrior-female': ('af_nicole', 1.0, 'en-us'),
    'mage-male': ('bm_george', 0.98, 'en-gb'), 'mage-female': ('bf_emma', 1.0, 'en-gb'),
    'archer-male': ('am_puck', 1.05, 'en-us'), 'archer-female': ('af_bella', 1.05, 'en-us'),
    'necromancer-male': ('am_onyx', 0.85, 'en-us'), 'necromancer-female': ('af_nova', 0.92, 'en-us'),
}
only = set(sys.argv[1:])
heroes = json.load(open(os.path.join(ROOT, 'public/data/content/hero-voices.json'), encoding='utf8'))
kok = Kokoro(os.path.join(ROOT, 'tools/kokoro/kokoro-v1.0.onnx'), os.path.join(ROOT, 'tools/kokoro/voices-v1.0.bin'))
index = {}
for h in heroes:
    hid = h['hero_id']
    if only and hid not in only:
        continue
    voice, speed, lang = CAST[hid]
    os.makedirs(os.path.join(OUT, hid), exist_ok=True)
    groups = dict(h['barks'])
    groups['town_greeting'] = h.get('town_greeting', [])
    groups['refusal'] = h.get('refusal_lines', [])
    groups['intro'] = [h['intro_monologue']] if h.get('intro_monologue') else []
    index[hid] = {}
    for key, lines in groups.items():
        for n, text in enumerate(lines):
            rel = f'{hid}/{key}-{n}.m4a'
            m4a = os.path.join(OUT, rel)
            index[hid].setdefault(key, []).append(rel)
            if os.path.exists(m4a) and os.path.getsize(m4a) > 512:
                continue
            s, sr = kok.create(text, voice=voice, speed=speed, lang=lang)
            wav = m4a[:-4] + '.wav'
            sf.write(wav, np.asarray(s), sr)
            subprocess.run(['ffmpeg', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '56k', '-ac', '1', '-ar', '24000', m4a], capture_output=True, check=True)
            os.remove(wav)
    print('done', hid, flush=True)
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
