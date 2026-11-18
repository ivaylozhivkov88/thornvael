import json, pathlib, sys
G = pathlib.Path(__file__).resolve().parents[1]
out = G / 'public/data/content'
D = 'D:/downloads/'
src = {'uniques_3': ('gemini-code-1794993680660', 48), 'item_sets_2': ('gemini-code-1794993697903', 10),
       'item_flavor_2': ('gemini-code-1794993724125', 80)}
bad = []
res = {}
for k, (f, n) in src.items():
    raw = open(D + f + '.json', encoding='utf8').read()
    if '\ufffd' in raw: bad.append(k + ' U+FFFD')
    v = json.loads(raw)[k]
    if len(v) != n: bad.append(f'{k} count {len(v)}')
    if isinstance(v, list):
        ids = [e['id'] for e in v]
        if len(ids) != len(set(ids)): bad.append(k + ' dup')
    res[k] = v
L = lambda fn: json.load(open(out / (fn + '.json'), encoding='utf8'))
old_u = {e['id'] for fn in ('uniques-2',) for e in L(fn)}
old_s = {e['id'] for e in L('item-sets')}
old_f = L('item-flavor')
if {e['id'] for e in res['uniques_3']} & old_u: bad.append('uniq overlap')
if {e['id'] for e in res['item_sets_2']} & old_s: bad.append('set overlap')
if set(res['item_flavor_2']) & set(old_f): bad.append('flavor overlap')
print('problems:', bad)
if bad: sys.exit(1)
if '--write' in sys.argv:
    def w(fn, v): json.dump(v, open(out / (fn + '.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    w('uniques-3', res['uniques_3'])
    w('item-sets-2', res['item_sets_2'])
    old_f.update(res['item_flavor_2'])
    w('item-flavor', old_f)
    print('written', len(res['uniques_3']), len(res['item_sets_2']), len(old_f))
