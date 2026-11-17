"""Validates and imports Gemini packs 4a/4b/4c/5a/5b into public/data/content/*.json.
Packs 2/3 are handled by import-content.py. Packs 6a/6b/7/8 are tooling inputs (read from .planning).
Usage: python tools/ingest.py [--write]   (dry run by default)"""
import json, sys, pathlib
R = pathlib.Path(__file__).resolve().parents[2]
P = R / '.planning'
D = R / 'game/public/data'
OUT = D / 'content'
L = lambda f: json.load(open(f, encoding='utf8'))
camp = {n['id'] for n in L(D / 'campaign.json')['nodes']}
items = {i['name'] for i in L(D / 'items.json')['items']}
bosses = {b['id'] for b in L(D / 'monsters.json')['bosses']}
bad = []
out = {}

# missions: 4a + 4b
ms = L(P / 'gemini-pack-4a.json')['missions'] + L(P / 'gemini-pack-4b.json')['missions']
ids = [m['id'] for m in ms]
if len(set(ids)) != len(ids): bad.append('duplicate mission ids')
for i in ids:
    if i not in camp: bad.append(('mission not in campaign', i))
for i in camp:
    if i.startswith('m') and i[1:3].isdigit() and i not in ids: bad.append(('campaign mission missing text', i))
out['missions'] = {m['id']: m for m in ms}

# 4c
c = L(P / 'gemini-pack-4c.json')
for b in c['bosses']:
    if b['id'] not in bosses: bad.append(('boss', b['id']))
out['bosses'] = {b['id']: b for b in c['bosses']}
out['act-endings'] = c['act_endings']
out['heroes'] = {h['class']: h for h in c['heroes']}

# 5a
fl = L(P / 'gemini-pack-5a.json')['item_flavor']
names = {f['name'] for f in fl}
for n in items - names: bad.append(('item without flavor', n))
for n in names - items: bad.append(('flavor for unknown item', n))
out['item-flavor'] = {f['name']: f for f in fl}

# 5b
for k, v in L(P / 'gemini-pack-5b.json').items():
    out[k.replace('_', '-')] = v
for ml in out.get('map-locations', []):
    nid = ml.get('node') or ml.get('id')
    if nid and nid not in camp: bad.append(('map-location node', nid))

print({k: len(v) for k, v in out.items()})
print('issues', len(bad), bad[:30])
if '--write' in sys.argv and not bad:
    for k, v in out.items():
        json.dump(v, open(OUT / (k + '.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print('written', len(out), 'files to', OUT)
