"""Converts .planning/gemini-pack-8.json (ASCII skirmish layouts) to map format v2 files in src/missions/
and registers them in src/mission.ts (BUILT_IN + SKIRMISH_MAP_NAMES). Idempotent.
Usage: python tools/convert-maps.py [--dry]"""
import json, sys, re, pathlib, collections
R = pathlib.Path(__file__).resolve().parents[2]
G = R / 'game'
pack = json.load(open(R / '.planning/gemini-pack-8.json', encoding='utf8'))
mons = json.load(open(G / 'public/data/monsters.json', encoding='utf8'))
ARCH = {f['id']: f['archetype'] for f in mons['families'] + mons.get('bosses', [])}
TER = {'.': 0, ',': 1, '~': 2, '#': 3, '%': 4, 'T': 0, 'B': 0, 'S': 0, '=': 1}
WALK = set('.,%=SB')
KIND_WARRIOR, KIND_ARCHER, KIND_HERO, KIND_MAGE = 0, 1, 2, 3
MERC = {'melee': (KIND_WARRIOR, 60), 'ranged': (KIND_ARCHER, 70), 'caster': (KIND_MAGE, 110)}


def rle(a):
    out = []; i = 0
    while i < len(a):
        j = i + 1
        while j < len(a) and a[j] == a[i]: j += 1
        out += [a[i], j - i]; i = j
    return out


def convert(m):
    w, h = m['size']; T = m['terrain']; H = m['height']
    terrain = [TER[c] for r in T for c in r]
    height = [min(3, max(0, int(c))) for r in H for c in r]
    walk = lambda x, y: 0 <= x < w and 0 <= y < h and T[y][x] in WALK
    free = lambda x, y: walk(x, y)

    def near(x, y, used):
        """nearest free walkable tile not in used (BFS rings)."""
        for rad in range(0, 8):
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    a, b = x + dx, y + dy
                    if max(abs(dx), abs(dy)) == rad and free(a, b) and (a, b) not in used:
                        used.add((a, b)); return a, b
        return x, y

    objects = [{'kind': 0, 'x': x, 'y': y} for y in range(h) for x in range(w) if T[y][x] == 'T']
    bld = []
    for b in m['buildings']:
        owner = 0 if b['owner'] in (0, 1) else 1
        bld.append({'kind': 1, 'x': b['x'], 'y': b['y'], 'owner': owner, 'hp': 100})
    bi = len(objects)
    objects += bld
    tavern = next((i for i, b in enumerate(m['buildings']) if b['role'] == 'tavern'), None)
    shop = next((i for i, b in enumerate(m['buildings']) if b['role'] == 'shop'), None)

    used = set(); units = []
    s1 = m['starts'][0]
    hx, hy = near(s1['x'], s1['y'], used)
    units.append({'kind': KIND_HERO, 'team': 0, 'x': hx, 'y': hy})
    for k in (KIND_WARRIOR, KIND_WARRIOR, KIND_ARCHER):
        x, y = near(s1['x'], s1['y'], used); units.append({'kind': k, 'team': 0, 'x': x, 'y': y})
    mercs = []
    for mm in m['mercs']:
        if mm['player'] != 1 or tavern is None: continue
        for t in mm['types']:
            k, price = MERC[t]
            x, y = near(s1['x'], s1['y'], used)
            units.append({'kind': k, 'team': 0, 'x': x, 'y': y, 'dormant': True})
            mercs.append({'unit': len(units) - 1, 'price': price})
    pk = 1
    for s in m['starts'][1:]:
        pk += 1
        for k in (0, 0, 0, 1, 1, 3):
            x, y = near(s['x'], s['y'], used)
            units.append({'kind': k, 'team': 1, 'x': x, 'y': y, 'group': 1, 'pack': pk})
    for c in m['neutral_camps']:
        pk += 1
        fam = c['family']
        if fam not in ARCH: raise SystemExit(f'unknown family {fam} in {m["id"]}')
        for _ in range(c['count']):
            x, y = near(c['x'], c['y'], used)
            units.append({'kind': ARCH[fam], 'team': 1, 'x': x, 'y': y, 'pack': pk,
                          'tier': min(5, max(1, c['tier'])), 'family': fam})
    if len(units) > 300: raise SystemExit(f'{m["id"]}: {len(units)} units > 300')

    shrines = []
    for s in m['shrines']:
        if walk(s['x'], s['y']):
            x, y = s['x'], s['y']
        else:
            x, y = near(s['x'], s['y'], set())
        shrines.append({'x': x, 'y': y, 'kind': s['kind'], 'cooldown': 750})

    tx = m['text']
    t = {'title': tx['title'], 'body': tx['body'], 'obj.0': tx['briefing'], 'msg.1': tx['briefing'],
         'msg.1.who': 'Herald', 'win': tx['win'], 'fail.1': tx['lose'], 'fail.2': 'Your champion has fallen.'}
    town = {'name': m['name'], 'tiers': [1, 3], 'mercs': mercs}
    if tavern is not None: town['tavern'] = tavern
    if shop is not None: town['shop'] = shop

    def trig(id_, a, op, bv, acts):
        return {'id': id_, 'once': True, 'enabled': True,
                'conds': [{'a': a, 'op': op, 'b': {'k': 'constant', 'a': [bv]}}], 'acts': acts}
    triggers = [
        trig('briefing', {'k': 'yes', 'a': []}, 0, 1, [{'k': 'message', 'a': [1]}, {'k': 'setSub', 'a': [0, 1]}]),
        trig('victory', {'k': 'playerBuildings', 'a': [1]}, 0, 0, [{'k': 'setSub', 'a': [0, 2]}, {'k': 'win', 'a': []}]),
        trig('base-lost', {'k': 'playerBuildings', 'a': [0]}, 0, 0, [{'k': 'lose', 'a': [1]}]),
        trig('hero-dead', {'k': 'unitAlive', 'a': [0]}, 0, 0, [{'k': 'lose', 'a': [2]}]),
    ]
    regions = [{'name': f'Base {s["player"]}', 'x1': s['base'][0], 'y1': s['base'][1], 'x2': s['base'][2], 'y2': s['base'][3]}
               for s in m['starts']]
    return {'format': 'thornvael-map', 'version': 2, 'name': tx['title'], 'w': w, 'h': h,
            'terrain': rle(terrain), 'height': rle(height), 'objects': objects, 'units': units,
            'regions': regions, 'players': ['Company', 'Rivals', 'Neutral', 'Allies'],
            'triggers': triggers, 'text': t, 'towns': [town], 'shrines': shrines}


dry = '--dry' in sys.argv
reg = []
for m in pack['maps']:
    doc = convert(m)
    fn = f'{m["id"]}.map.json'
    reg.append((m['id'], fn, doc['name']))
    print(m['id'], doc['w'], doc['h'], 'units', len(doc['units']), 'objects', len(doc['objects']), 'shrines', len(doc['shrines']))
    if not dry:
        json.dump(doc, open(G / 'src/missions' / fn, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))

if not dry:
    p = G / 'src/mission.ts'
    s = p.read_text(encoding='utf8')
    imp = ''; ent = ''; nm = ''
    for id_, fn, name in reg:
        var = 'sk_' + id_.replace('-', '_')
        if f"'./missions/{fn}'" not in s:
            imp += f"import {var} from './missions/{fn}';\n"
            ent += f"  '{id_}': {var},\n"
            nm += f"  '{name}',\n"
    if imp:
        s = s.replace("\n/** Missions that ship with the game", "\n" + imp + "\n/** Missions that ship with the game", 1)
        s = s.replace("  'cinder-throne': cinder,\n", "  'cinder-throne': cinder,\n" + ent, 1)
        s = s.replace("  'Ashen Tier',\n", "  'Ashen Tier',\n" + nm, 1)
        p.write_text(s, encoding='utf8')
        print('registered', len(reg))
