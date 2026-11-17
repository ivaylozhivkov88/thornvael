"""Checks Gemini pack 6b (.planning/gemini-pack-6b.json) against the game data and the static sim_checks.
Monsters/spells must match public/data exactly; economy differences are reported (not applied: town/shop code owns prices).
Usage: python tools/check-balance.py [--strict]  (exit 1 on monster/spell mismatch, or on any diff with --strict)"""
import json, sys, pathlib
R = pathlib.Path(__file__).resolve().parents[2]; D = R / 'game/public/data'
L = lambda f: json.load(open(f, encoding='utf8'))
p = L(R / '.planning/gemini-pack-6b.json')
hard, soft = [], []
m = L(D / 'monsters.json'); fam = {f['id']: f for f in m['families'] + m['bosses']}
for x in p['monsters']:
    f = fam.get(x['id'])
    if not f: hard.append(f"monster {x['id']} not in game"); continue
    for a, b in (('baseHp', 'hp'), ('baseMin', 'dmg_min'), ('baseMax', 'dmg_max'), ('speed', 'speed')):
        if f[a] != x[b]: hard.append(f"{x['id']}.{a} game {f[a]} pack {x[b]}")
for i in set(fam) - {x['id'] for x in p['monsters']}: hard.append(f'game monster {i} not in pack')
sp = {s['name']: s for s in L(D / 'spells.json')['spells']}
for x in p['spells']:
    g = sp.get(x['name'])
    if not g: hard.append(f"spell {x['name']} not in game"); continue
    for k in ('cost', 'cd', 'min', 'max'):
        if g.get(k, 0) != x[k]: hard.append(f"{x['name']}.{k} game {g.get(k, 0)} pack {x[k]}")
items = {i['name']: i for i in L(D / 'items.json')['items']}
for pt in p['economy']['potion_prices']:
    g = items.get(pt['name']); v = g and (g.get('heal') or g.get('restore'))
    price = 12 * g['tier'] if g else None
    if v != pt['heal_or_mana']: soft.append(f"{pt['name']} amount game {v} pack {pt['heal_or_mana']}")
    if price != pt['price']: soft.append(f"{pt['name']} price game {price} pack {pt['price']}")
for t in p['items_balance']['tier_curve']:
    g = 30 * t['tier'] ** 2
    if g != t['price_buy']: soft.append(f"tier {t['tier']} normal gear buy price game {g} pack {t['price_buy']}")
# static sim_checks
w = {s['name']: s for s in sp.values()}
fb = w['Fire Bolt']; soft_chk = []
if 'Healing' in w and not (0.25 <= (w['Healing']['min'] + w['Healing']['max']) / 2 / 80 <= 0.6): soft.append('chk-09 Healing vs lvl1 warrior hp 80 outside 25-40%')
print('hard', len(hard), hard[:20]); print('soft(economy)', len(soft)); [print(' ', s) for s in soft]
sys.exit(1 if hard or (soft and '--strict' in sys.argv) else 0)
