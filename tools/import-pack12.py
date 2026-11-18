import json,pathlib,re,sys
G=pathlib.Path(__file__).resolve().parents[1]
out=G/'public/data/content'
D='D:/downloads/'
files=['gemini-pack-12-01-items','gemini-pack-12-02-world','gemini-code-1794990320920','gemini-code-1794990366513','gemini-code-1794990443463','gemini-code-1794990588354','gemini-pack-12-04-mercs','gemini-pack-12-05-systems','gemini-pack-12-06-story']
d={}
for f in files:
    for k,v in json.load(open(D+f+'.json',encoding='utf8')).items():
        if k not in('_self_check','notes'): d[k]=v
bad=[]
def chk(c,m):
    if not c: bad.append(m)
def load(n):
    p=out/n
    return json.load(open(p,encoding='utf8')) if p.exists() else []
exp={'base_items':160,'crafting_recipes':70,'vendor_stock':12,'consumable_effects':40,'salvage_lines':40,'lore_books':60,'bestiary_extra':60,'factions':8,'promotion_lines':10,'ambient_objects':120,'region_flavor':40,'timeline':40,'side_quests_3':40,'bounties':60,'npc_reactions':100,'challenge_rifts':24,'merc_hire_dialogues':24,'merc_backstories':24,'merc_party_banter':80,'elite_affixes':40,'help_pages':30,'achievements_3':60,'credits_and_menu':60,'difficulty_flavor':4,'cutscene_scripts':24,'class_endings':8}
for k,n in exp.items():
    chk(k in d and len(d[k])==n,f'{k} count {len(d.get(k,[]))}!={n}')
print('extra keys:',[k for k in d if k not in exp])
def uniq(k,key='id'):
    v=[e[key] for e in d.get(k,[])]
    chk(len(v)==len(set(v)),f'{k} dup {key}')
    return set(v)
bi=uniq('base_items')
for k in('crafting_recipes','vendor_stock','consumable_effects','salvage_lines','lore_books','bestiary_extra','ambient_objects','region_flavor','timeline','side_quests_3','bounties','npc_reactions','challenge_rifts','elite_affixes','help_pages','achievements_3','cutscene_scripts'):
    if d.get(k) and isinstance(d[k][0],dict) and 'id' in d[k][0]: uniq(k)
uniq('credits_and_menu','key')
# print sample shapes for refs
for k in('crafting_recipes','vendor_stock','consumable_effects','salvage_lines','bestiary_extra','merc_hire_dialogues','merc_backstories','merc_party_banter','factions','promotion_lines'):
    print(k,json.dumps(d[k][0],ensure_ascii=False)[:300])
# crafting/vendor refs to base items
allitems=set(bi)
for fn in('uniques.json','uniques-2.json','item-sets.json','item-flavor.json','new-prices.json','gear-prices.json'):
    try:
        v=load(fn)
        if isinstance(v,list):
            for e in v:
                if isinstance(e,dict) and 'id' in e: allitems.add(e['id'])
    except Exception as ex: print('skip',fn,ex)
def refs(obj,acc):
    if isinstance(obj,dict):
        for k,v in obj.items():
            if k in('inputs','output','result','item','items','stock','ingredients','requires','materials') : acc.append((k,v))
            refs(v,acc)
    elif isinstance(obj,list):
        for x in obj: refs(x,acc)
for k in('crafting_recipes','vendor_stock'):
    miss=set()
    for e in d[k]:
        for kk,v in e.items():
            vals=[]
            if isinstance(v,str): vals=[v]
            elif isinstance(v,list): vals=[x if isinstance(x,str) else (x.get('id') or x.get('item') if isinstance(x,dict) else None) for x in v]
            elif isinstance(v,dict): vals=list(v.keys())
            for x in vals:
                if x and re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)+',x) and x not in allitems and kk not in('id',): miss.add((kk,x))
    print(k,'unresolved id-like refs:',len(miss),sorted(miss)[:12])
# overlaps with existing
for key,fn,idk in(('side_quests_3','side-quests-2.json','id'),('side_quests_3','side-quests.json','id'),('achievements_3','achievements-2.json','id'),('achievements_3','achievements.json','id')):
    old={e[idk] for e in load(fn) if isinstance(e,dict)}
    new={e['id'] for e in d[key]}
    chk(not(old&new),f'{key} overlaps {fn}: {sorted(old&new)[:5]}')
# monster refs
mons=set()
for fn in('monster-codex.json','bosses.json'):
    v=load(fn)
    for e in (v if isinstance(v,list) else v.get('monsters',[])):
        if isinstance(e,dict) and 'id' in e: mons.add(e['id'])
print('monster ids known',len(mons),sorted(mons)[:8])
bm=[b['target'] if 'target' in b else b.get('monster') for b in d['bounties']]
print('bounty targets unknown:',sorted({m for m in bm if m not in mons})[:20])
print('rift bosses unknown:',sorted({r['boss'] for r in d['challenge_rifts'] if r['boss'] not in mons})[:20])
print('bestiary_extra ids overlapping codex:',len({e['id'] for e in d['bestiary_extra']}&mons))
# mercs
mer=load('mercenaries.json'); mer=mer if isinstance(mer,list) else mer.get('mercenaries',[])
mids={m['id'] for m in mer if isinstance(m,dict)}
print('merc ids',len(mids),sorted(mids)[:6])
for k in('merc_hire_dialogues','merc_backstories'):
    ks=[e.get('merc') for e in d[k]]
    print(k,'unknown merc ids:',sorted({x for x in ks if x not in mids})[:10])
# npc_reactions requires flags
flags=set()
for e in load('npc-dialogues.json'):
    for c in e.get('choices',[]):
        if c.get('sets_flag'): flags.add(c['sets_flag'])
rf={e['requires'] for e in d['npc_reactions'] if e.get('requires')}
print('npc_reactions flags not in dialogues:',sorted(rf-flags)[:15])
# cutscene speakers
sp=set()
for c in d['cutscene_scripts']:
    for l in c['lines']: sp.add(l['speaker'])
print('cutscene speakers',sorted(sp))
for k,v in d.items():
    s=json.dumps(v,ensure_ascii=False)
    if '\ufffd' in s: bad.append(f'{k} U+FFFD')
    if re.search(r"[a-z]'s[A-Z]",s): bad.append(f'{k} space typo')
if '--write' in sys.argv and not bad:
    for k,v in d.items():
        json.dump(v,open(out/(k.replace('_','-')+'.json'),'w',encoding='utf8'),ensure_ascii=False,indent=1)
    print('written')
print({k:len(v) for k,v in d.items()});print('issues',len(bad))
for b in bad[:40]: print(' -',b)
