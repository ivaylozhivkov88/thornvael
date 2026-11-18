import json, pathlib, sys
G = pathlib.Path(__file__).resolve().parents[1]
out = G / 'public/data/content'
D = 'D:/downloads/'
src = {'enemy_barks_2': 'gemini-code-1794993182801', 'town_barks_2': 'gemini-code-1794993215736',
       'boss_dialogue_2': 'gemini-code-1794993234760', 'death_quotes_2': 'gemini-code-1794993254366'}
tgt = {'enemy_barks_2': ('enemy-barks', 'enemy', 40), 'town_barks_2': ('town-barks', None, 120),
       'boss_dialogue_2': ('boss-dialogue', 'boss', 12), 'death_quotes_2': ('death-quotes', 'quote', 60)}
bad = []
new = {}
for k, f in src.items():
    raw = open(D + f + '.json', encoding='utf8').read()
    if '\ufffd' in raw: bad.append(k + ' U+FFFD')
    new[k] = json.loads(raw)[k]
for k, (fn, idk, n) in tgt.items():
    old = json.load(open(out / (fn + '.json'), encoding='utf8'))
    v = new[k]
    if len(v) != n: bad.append(f'{k} count {len(v)}!={n}')
    key = (lambda e: (e['town'], e['line'])) if idk is None else (lambda e: e[idk])
    ids = [key(e) for e in v]
    if len(ids) != len(set(ids)): bad.append(k + ' dup')
    if set(ids) & {key(e) for e in old}: bad.append(k + ' overlaps existing')
    if k == 'enemy_barks_2':
        for e in v:
            if len(e['aggro']) != 3 or len(e['hurt']) != 2 or len(e['death']) != 2: bad.append('shape ' + e['enemy'])
    if k == 'boss_dialogue_2':
        for e in v:
            if len(e['phase_lines']) != 3: bad.append('phases ' + e['boss'])
    tgt[k] = (fn, old + v)
print('problems:', bad)
if bad: sys.exit(1)
if '--write' in sys.argv:
    for k, (fn, merged) in tgt.items():
        json.dump(merged, open(out / (fn + '.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
        print(fn, len(merged))
