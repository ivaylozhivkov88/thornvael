import json, pathlib, sys
G = pathlib.Path(__file__).resolve().parents[1]
out = G / 'public/data/content'
D = 'D:/downloads/'
src = {'map_locations_3': ('gemini-code-1794993560092', 40), 'field_npcs_2': ('gemini-code-1794993588855', 24),
       'random_events_2': ('gemini-code-1794993624456', 30)}
bad = []
res = {}
for k, (f, n) in src.items():
    raw = open(D + f + '.json', encoding='utf8').read()
    if '\ufffd' in raw: bad.append(k + ' U+FFFD')
    v = json.loads(raw)[k]
    if len(v) != n: bad.append(f'{k} count {len(v)}')
    ids = [e['id'] for e in v]
    if len(ids) != len(set(ids)): bad.append(k + ' dup')
    res[k] = v
old_loc = {e['id'] for fn in ('map-locations-2',) for e in json.load(open(out / (fn + '.json'), encoding='utf8'))}
old_npc = json.load(open(out / 'field-npcs.json', encoding='utf8'))
old_evt = json.load(open(out / 'random-events.json', encoding='utf8'))
if {e['id'] for e in res['map_locations_3']} & old_loc: bad.append('loc overlap')
if {e['id'] for e in res['field_npcs_2']} & {e['id'] for e in old_npc}: bad.append('npc overlap')
if {e['id'] for e in res['random_events_2']} & {e['id'] for e in old_evt}: bad.append('evt overlap')
for e in res['field_npcs_2']:
    e['line_return'] = e['line_repeat']  # match existing schema, keep both
print('problems:', bad)
if bad: sys.exit(1)
if '--write' in sys.argv:
    def w(fn, v): json.dump(v, open(out / (fn + '.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    w('map-locations-3', res['map_locations_3'])
    w('field-npcs', old_npc + res['field_npcs_2'])
    w('random-events', old_evt + res['random_events_2'])
    print('written', len(res['map_locations_3']), len(old_npc) + 24, len(old_evt) + 30)
