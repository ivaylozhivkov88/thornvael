"""Procedural 64x64 icons for content/base-items.json (160 items). Own art, no external sources.
Usage: python tools/gen-item-icons.py  -> public/itemicons/<id>.png + public/itemicons/manifest.json"""
import json, hashlib, os, math
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'public/data/content/base-items.json')
OUT = os.path.join(ROOT, 'public/itemicons')
S = 4  # supersample
N = 64 * S
METAL = [(168, 128, 80), (176, 184, 180), (200, 214, 222), (232, 220, 160), (210, 190, 245)]
CLS = {'warrior': (200, 70, 50), 'archer': (90, 160, 70), 'mage': (110, 120, 230), 'necromancer': (150, 90, 190)}
DARK = (40, 30, 24)

def seed(i):
    return int(hashlib.md5(i.encode()).hexdigest()[:8], 16)

def draw(item):
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    t = max(1, min(5, item['tier']))
    m = METAL[t - 1]
    acc = CLS.get(item.get('class_hint'), (200, 170, 90))
    rnd = seed(item['id'])
    k = (rnd % 7) - 3  # per-item shape variation
    def P(pts, fill):
        d.polygon([(x * S, y * S) for x, y in pts], fill=fill, outline=DARK)
    def E(box, fill):
        d.ellipse([c * S for c in box], fill=fill, outline=DARK, width=S)
    s = item['slot']
    if s == 'weapon':
        w = 3 + (rnd >> 3) % 3
        P([(32 - w, 8 + k // 2), (32 + w, 8 + k // 2), (32 + w, 44), (32 - w, 44)], m)
        P([(32 - w, 8 + k // 2), (32, 3), (32 + w, 8 + k // 2)], m)
        P([(18, 44), (46, 44), (46, 48), (18, 48)], acc)
        P([(30, 48), (34, 48), (34, 58), (30, 58)], (110, 70, 40))
    elif s == 'helmet':
        E((14, 12, 50, 52), m)
        P([(14, 34), (50, 34), (50, 40), (14, 40)], DARK)
        P([(30, 12 - k // 2), (34, 12 - k // 2), (34, 30), (30, 30)], acc)
    elif s == 'chest':
        P([(12, 14), (22, 10), (42, 10), (52, 14), (56, 28), (46, 30), (44, 54), (20, 54), (18, 30), (8, 28)], m)
        P([(28, 14), (36, 14), (36, 50), (28, 50)], acc)
    elif s == 'gloves':
        P([(18, 30), (46, 30), (48, 54), (16, 54)], m)
        for i in range(4):
            x = 17 + i * 8
            P([(x, 12 + abs(i - 1) * 2), (x + 6, 12 + abs(i - 1) * 2), (x + 6, 32), (x, 32)], m)
        P([(16, 44), (48, 44), (48, 50), (16, 50)], acc)
    elif s == 'boots':
        P([(20, 8), (36, 8), (36, 40), (54, 46), (54, 56), (14, 56), (14, 40)], m)
        P([(14, 50), (54, 50), (54, 56), (14, 56)], DARK)
        P([(20, 14), (36, 14), (36, 20), (20, 20)], acc)
    elif s == 'belt':
        P([(6, 26), (58, 26), (58, 38), (6, 38)], (110, 70, 40))
        P([(24, 22), (40, 22), (40, 42), (24, 42)], m)
        E((28, 27, 36, 37), acc)
    elif s == 'shield':
        P([(10, 10), (54, 10), (52, 34), (32, 58), (12, 34)], m)
        P([(28, 12), (36, 12), (36, 50), (28, 50)], acc)
        P([(14, 26), (50, 26), (50, 32), (14, 32)], acc)
    elif s == 'ring':
        E((14, 20, 50, 56), m)
        E((22, 28, 42, 48), (0, 0, 0, 0))
        E((26, 10, 38, 22), acc)
    elif s == 'amulet':
        d.line([(14 * S, 6 * S), (32 * S, 36 * S), (50 * S, 6 * S)], fill=m, width=2 * S)
        P([(32, 32), (46, 44), (40, 58), (24, 58), (18, 44)], m)
        P([(32, 38), (40, 46), (36, 54), (28, 54), (24, 46)], acc)
    else:  # consumable
        P([(26, 6), (38, 6), (38, 20), (50, 38), (44, 58), (20, 58), (14, 38), (26, 20)], (190, 210, 220))
        P([(18, 38), (46, 38), (42, 56), (22, 56)], acc)
        P([(26, 4), (38, 4), (38, 10), (26, 10)], (130, 90, 55))
    # tier pips
    for i in range(t):
        cx = 32 + (i - (t - 1) / 2) * 5
        d.ellipse([(cx - 1.3) * S, 60 * S, (cx + 1.3) * S, 62.6 * S], fill=(236, 200, 120))
    return img.resize((64, 64), Image.LANCZOS)

def main():
    data = json.load(open(SRC, encoding='utf-8'))
    items = data if isinstance(data, list) else next(v for v in data.values() if isinstance(v, list))
    os.makedirs(OUT, exist_ok=True)
    ids = []
    for it in items:
        draw(it).save(os.path.join(OUT, it['id'] + '.png'), optimize=True)
        ids.append(it['id'])
    json.dump({'count': len(ids), 'ids': ids}, open(os.path.join(OUT, 'manifest.json'), 'w'))
    print(len(ids), 'icons')

main()
