import json, pathlib, sys
G = pathlib.Path(__file__).resolve().parents[1]
out = G / 'public/data/content'
D = 'D:/downloads/gemini-code-'
src = {'spell_text_2': '1794994073412', 'hero_voices_2': '1794994100905', 'act_epilogues': '1794994114091'}
bad, res = [], {}
for k, f in src.items():
    raw = open(D + f + '.json', encoding='utf8').read()
    if '\ufffd' in raw: bad.append(k + ' U+FFFD')
    res[k] = json.loads(raw)[k]
L = lambda fn: json.load(open(out / (fn + '.json'), encoding='utf8'))
st, hv = L('spell-text'), L('hero-voices')
s2, h2, ae = res['spell_text_2'], res['hero_voices_2'], res['act_epilogues']
if len(s2) != 40: bad.append('spell count')
if {e['name'] for e in s2} & {e['name'] for e in st}: bad.append('spell overlap')
if len({e['name'] for e in s2}) != 40: bad.append('spell dup')
if len(h2) != 8 or {e['hero_id'] for e in h2} != {e['hero_id'] for e in hv}: bad.append('voice ids')
if len(ae) != 4: bad.append('epilogue count')
print('problems:', bad)
if bad: sys.exit(1)
if '--write' in sys.argv:
    def w(fn, v): json.dump(v, open(out / (fn + '.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    w('spell-text', st + s2)
    m = {e['hero_id']: e for e in h2}
    for h in hv:
        for k, lines in m[h['hero_id']].items():
            if k == 'hero_id': continue
            cur = h['barks'].setdefault(k, [])
            cur += [x for x in lines if x not in cur]
    w('hero-voices', hv)
    w('act-epilogues', ae)
    print('written', len(st + s2), len(hv), len(ae))
