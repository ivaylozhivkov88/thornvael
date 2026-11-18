import json,pathlib,re,sys
R=pathlib.Path(__file__).resolve().parents[2]
G=R/'game'
P=[json.load(open(f'D:/downloads/gemini-pack-10-part{i}.json',encoding='utf8')) for i in (1,2,3,4)]
d={}
for x in P:
    for k,v in x.items():
        if k not in('_self_check','notes'): d[k]=v
FIX=lambda o:json.loads(json.dumps(o,ensure_ascii=False).replace("Gorrathul'sCistern","Gorrathul's Cistern"))
d={k:FIX(v) for k,v in d.items()}
kebab=lambda s:re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
items=json.load(open(G/'public/data/items.json',encoding='utf8'))['items']
inames={i['name'] for i in items}
spells=json.load(open(G/'public/data/spells.json',encoding='utf8'))
sp=spells['spells'] if isinstance(spells,dict) and 'spells' in spells else spells
snames={s['name'] for s in sp} if isinstance(sp,list) else set(sp)
bad=[]
def chk(c,m):
    if not c: bad.append(m)
def uniq(k,key='id'):
    ids=[e[key] for e in d[k]]
    chk(len(ids)==len(set(ids)),f'{k} dup ids {[i for i in set(ids) if ids.count(i)>1][:5]}')
    return set(ids)
exp={'spells_new':32,'skill_trees':96,'class_progression':4,'mercenaries':24,'npc_dialogues':140,'field_npcs':20,'uniques_2':48,'item_sets':10,'gems_runes':24,'affixes_2':60,'new_prices':112,'codex_entries':60,'random_events':30,'cutscenes':8,'map_locations_2':40}
for k,n in exp.items(): chk(len(d[k])==n,f'{k} count {len(d[k])}!={n}')
sk=uniq('skill_trees')
for e in d['skill_trees']:
    for r in e.get('requires',[]): chk(r in sk,f'skill {e["id"]} requires missing {r}')
uniq('mercenaries');uniq('uniques_2');uniq('gems_runes');uniq('affixes_2');uniq('codex_entries');uniq('random_events');uniq('cutscenes');uniq('map_locations_2');uniq('field_npcs');uniq('item_sets')
dn=uniq('npc_dialogues')
setf=set()
for e in d['npc_dialogues']:
    for c in e.get('choices',[]):
        if c.get('sets_flag'): setf.add(c['sets_flag'])
for e in d['npc_dialogues']:
    for c in e.get('choices',[]):
        chk(c['next'] in dn or c['next']=='end',f'dlg {e["id"]} next {c["next"]}')
        if c.get('requires_flag'): chk(c['requires_flag'] in setf,f'flag unset {c["requires_flag"]}')
# template check
txt={}
for e in d['npc_dialogues']: txt.setdefault((e['node'],e['text'].split(' ',3)[-1]),set()).add(e['npc'])
rep=sum(1 for v in txt.values() if len(v)>1)
print('dialogue nodes with identical text across NPCs:',rep,'of',len(txt))
snew={s['name'] for s in d['spells_new']}
for m in d['mercenaries']:
    for a in m['abilities']:
        if a not in snames|snew: print('merc ability not a spell (info):',m['id'],a)
codex=uniq('codex_entries')
for e in d['codex_entries']:
    for r in re.findall(r'cdx-[a-z0-9-]+',e['body']): chk(r in codex,f'codex ref {r}')
miss=set()
for e in d['uniques_2']:
    if e['base'] not in inames: miss.add(e['base'])
for s in d['item_sets']:
    for p in s['pieces']:
        if p['base'] not in inames: miss.add(p['base'])
print('base names not in items.json:',len(miss),sorted(miss)[:40])
for k,v in d.items():
    s=json.dumps(v,ensure_ascii=False)
    if '\ufffd' in s: bad.append(f'{k} has U+FFFD x{s.count(chr(0xfffd))}')
    if re.search(r"[a-z]'s[A-Z]",s): bad.append(f'{k} missing-space typo '+str(re.findall(r"\w+'s[A-Z]\w+",s)[:3]))
out=G/'public/data/content'
if '--write' in sys.argv:
    for k,v in d.items():
        json.dump(v,open(out/(k.replace('_','-')+'.json'),'w',encoding='utf8'),ensure_ascii=False,indent=1)
print({k:len(v) for k,v in d.items()})
print('issues',len(bad))
for b in bad[:40]: print(' -',b)
