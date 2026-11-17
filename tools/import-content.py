"""Splits .planning/gemini-content-merged.json into public/data/content/*.json and validates refs."""
import json,sys,pathlib
R=pathlib.Path(__file__).resolve().parents[2]
d=json.load(open(R/'.planning/gemini-content-merged.json',encoding='utf8'))
items={i['name'] for i in json.load(open(R/'game/public/data/items.json',encoding='utf8'))['items']}
spells=json.load(open(R/'game/public/data/spells.json',encoding='utf8'))['spells']
camp=json.load(open(R/'game/public/data/campaign.json',encoding='utf8'))
names=items
sp=spells if isinstance(spells,list) else spells.get('spells',list(spells.values()))
spn={s.get('name') for s in sp if isinstance(s,dict)}
ids={n['id'] for n in camp['nodes']}
des={e['id'] for e in json.load(open(R/'.planning/enemy-designs.json',encoding='utf8'))} if isinstance(json.load(open(R/'.planning/enemy-designs.json',encoding='utf8')),list) else set()
bad=[]
for u in d['uniques']:
    if u['base'] not in names:bad.append(('unique base',u['id'],u['base']))
for s in d['spell_text']:
    if s['name'] not in spn:bad.append(('spell',s['name']))
for q in d['side_quests']:
    if q['unlocks_after'] not in ids:bad.append(('mission',q['id']))
out=R/'game/public/data/content'
for k,v in d.items():
    json.dump(v,open(out/(k.replace('_','-')+'.json'),'w',encoding='utf8'),ensure_ascii=False,indent=1)
print({k:len(v) for k,v in d.items()});print('issues',len(bad),bad[:20])
