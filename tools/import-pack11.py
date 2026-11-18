import json,pathlib,re,sys
G=pathlib.Path(__file__).resolve().parents[1]
out=G/'public/data/content'
d={}
for i in (1,2,3,4):
    for k,v in json.load(open(f'D:/downloads/gemini-pack-11-part{i}.json',encoding='utf8')).items():
        if k not in('_self_check','notes'): d[k]=v
bad=[]
def chk(c,m):
    if not c: bad.append(m)
exp={'npc_dialogues':140,'hero_voices':8,'mission_texts':46,'boss_dialogue':4,'merc_abilities':19,'codex_missing':3,'ui_strings':80,'loading_screens':40}
for k,n in exp.items(): chk(len(d[k])==n,f'{k} count {len(d[k])}!={n}')
old={e['id'] for e in json.load(open(out/'npc-dialogues.json',encoding='utf8'))}
ids=[e['id'] for e in d['npc_dialogues']]
chk(len(ids)==len(set(ids)),'dlg dup ids')
print('dlg ids new vs old: +',len(set(ids)-old),'-',len(old-set(ids)))
flags={c['sets_flag'] for e in d['npc_dialogues'] for c in e.get('choices',[]) if c.get('sets_flag')}
for e in d['npc_dialogues']:
    for c in e.get('choices',[]):
        chk(c['next'] in ids or c['next']=='end',f'dlg {e["id"]} next {c["next"]}')
        if c.get('requires_flag'): chk(c['requires_flag'] in flags,f'flag {c["requires_flag"]}')
texts=[e['text'] for e in d['npc_dialogues']]; chk(len(set(texts))==len(texts),'duplicate dialogue texts')
mt=[m['mission_id'] for m in d['mission_texts']]; chk(len(set(mt))==46,'mission ids')
mdir=G/'public/data/missions'
if mdir.exists():
    have={p.stem for p in mdir.glob('*.json')}
    miss=[m for m in mt if m not in have]
    if miss: print('mission ids w/o file (info):',miss[:5],len(miss))
for h in d['hero_voices']:
    for k,v in h['barks'].items(): chk(len(v)>=3,f'{h["hero_id"]} bark {k}')
chk(len({h['hero_id'] for h in d['hero_voices']})==8,'hero ids')
chk(all(len(v)==12 for v in d['class_banter'].values()),'banter 12 each')
sp=json.load(open(G/'public/data/spells.json',encoding='utf8'));sp=sp['spells'] if isinstance(sp,dict) and 'spells' in sp else sp
sn={s['name'] for s in sp}
for a in d['merc_abilities']: chk(a['name'] not in sn,f'merc ability already a spell {a["name"]}')
cx={e['id'] for e in json.load(open(out/'codex-entries.json',encoding='utf8'))}
for e in d['codex_missing']: chk(e['id'] not in cx,f'codex dup {e["id"]}')
refs=set()
for e in json.load(open(out/'codex-entries.json',encoding='utf8')): refs|=set(re.findall(r'cdx-[a-z0-9-]+',e['body']))
chk(refs-cx<= {e['id'] for e in d['codex_missing']},'codex refs still dangling')
for k in('ui_strings','loading_screens'):
    key='key' if k=='ui_strings' else 'id'; v=[e[key] for e in d[k]]; chk(len(v)==len(set(v)),f'{k} dup')
for k,v in d.items():
    s=json.dumps(v,ensure_ascii=False)
    if '\ufffd' in s: bad.append(f'{k} U+FFFD')
    if re.search(r"[a-z]'s[A-Z]",s): bad.append(f'{k} space typo')
if '--write' in sys.argv and not bad:
    for k,v in d.items():
        json.dump(v,open(out/(k.replace('_','-')+'.json'),'w',encoding='utf8'),ensure_ascii=False,indent=1)
print({k:len(v) for k,v in d.items()});print('issues',len(bad))
for b in bad[:40]: print(' -',b)
