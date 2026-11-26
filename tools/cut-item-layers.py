"""Cut generated item renders into transparent, bbox-trimmed PNG layers.
Handles both flat near-white and chroma-green (#00FF00) backgrounds, plus files that already have alpha.
Usage: python tools/cut-item-layers.py <srcDir> <outDir>"""
import sys, os
from collections import deque
from PIL import Image, ImageFilter

def is_bg(p):
    r, g, b = p[:3]
    if min(r, g, b) >= 225: return 'white'
    if g > 150 and g > r * 1.5 and g > b * 1.5: return 'green'
    return None

def cut(im):
    im = im.convert('RGBA'); w, h = im.size
    a = im.getchannel('A')
    if a.getextrema()[0] < 250:  # already has real transparency
        return im
    px = im.load(); mask = Image.new('L', (w, h), 255); mp = mask.load()
    seeds = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    kind = next((k for k in (is_bg(px[x, y]) for x, y in seeds) if k), None)
    if kind is None: return im
    q = deque(); seen = set()
    for s in seeds:
        if is_bg(px[s]) == kind: q.append(s); seen.add(s)
    while q:
        x, y = q.popleft(); mp[x, y] = 0
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if 0 <= n[0] < w and 0 <= n[1] < h and n not in seen and is_bg(px[n]) == kind:
                seen.add(n); q.append(n)
    if kind == 'white':  # enclosed holes (cage, damage): drop near-pure-white pixels not reached from the border
        for y in range(h):
            for x in range(w):
                if (x, y) not in seen and min(px[x, y][:3]) >= 244: mp[x, y] = 0
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))  # trim fringe, soften edge
    if kind == 'green':  # despill
        for y in range(h):
            for x in range(w):
                r, g, b, al = px[x, y]
                if g > max(r, b): px[x, y] = (r, max(r, b), b, al)
    im.putalpha(mask); return im

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.lower().endswith('.png'): continue
    im = cut(Image.open(os.path.join(src, f)))
    bb = im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
    if not bb: print('EMPTY', f); continue
    im.crop(bb).save(os.path.join(out, f), optimize=True)
    print('ok', f, im.crop(bb).size)
