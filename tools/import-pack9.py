"""Validates Gemini pack 9 parts 1-4 and writes public/data/content/*.json."""
import json,pathlib,re,sys
R=pathlib.Path(__file__).resolve().parents[2]
G=R/'game'
P=[json.load(open(f'D:/downloads/gemini-pack-9-part{i}.json',encoding='utf8')) for i in (1,2,3,4)]
d={}
for x in P:
    for k,v in x.items():
        if k not in('_self_check','notes'): d[k]=v
kebab=lambda s:re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
items=json.load(open(G/'public/data/items.json',encoding='utf8'))['items']
inames={kebab(i['name']) for i in items}
camp={n['id'] for n in json.load(open(G/'public/data/campaign.json',encoding='utf8'))['nodes']}
mon=json.load(open(G/'public/data/monsters.json',encoding='utf8'))
mids=set()
def walk(o):
    if isinstance(o,dict):
        for k in('id','kind','name'):
            if isinstance(o.get(k),str):mids.add(kebab(o[k]))
        for v in o.values():walk(v)
    elif isinstance(o,list):
        for v in o:walk(v)
walk(mon)
bad=[]
def lim(sec,idv,s,n):
    if len(s)>n:bad.append((sec,idv,len(s),n))
for h in d['hero_visuals']:
    lim('vis',h['id'],h['silhouette'],120);lim('vis',h['id'],h['outfit'],200);lim('vis',h['id'],h['face_and_hair'],160);lim('vis',h['id'],h['signature_prop'],80)
for m,l in d['objective_hints'].items():
    if m not in camp:bad.append(('mission?',m))
    for o in l:lim('obj',o['id'],o['label'],48);lim('obj',o['id'],o['where'],60)
for t in d['tips_2']:lim('tip',t['id'],t['text'],110)
for a in d['achievements_2']:lim('ach',a['id'],a['name'],28);lim('ach',a['id'],a['description'],90)
for e in d['enemy_barks']:
    if kebab(e['enemy']) not in mids:bad.append(('enemy?',e['enemy']))
    for k in('aggro','hurt','death'):
        for s in e[k]:lim('bark',e['enemy'],s,40)
for g in d['gear_prices']:
    if g['item_id'] not in inames:bad.append(('item?',g['item_id']))
for q in d['side_quests_2']:
    if q['unlocks_after'] not in camp:bad.append(('unlock?',q['id'],q['unlocks_after']))
out=G/'public/data/content'
if '--write' in sys.argv:
    for k,v in d.items():json.dump(v,open(out/(k.replace('_','-')+'.json'),'w',encoding='utf8'),ensure_ascii=False,indent=1)
print({k:len(v) for k,v in d.items()});print('issues',len(bad));[print(b) for b in bad[:40]]
