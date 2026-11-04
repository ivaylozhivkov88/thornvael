"""Pack rendered unit frames into a colour atlas, a mask atlas and a Pixi spritesheet JSON.

Input folder (written by tools/render-unit.py):  <in>/<anim>_<dd>_<nn>.png  and  <anim>_<dd>_<nn>_m.png
Usage:  python tools/pack-atlas.py <in_dir> <out_dir> <unit> [--selftest]
Contract: docs/SPRITE-CONTRACT.md.  Own code, MaxRects best-short-side-fit.
"""
import json
import os
import sys

from PIL import Image

DIRECTIONS = 16
ANIMS = {"stand": 4, "walk": 8, "attack": 4, "cast": 4, "hurt": 2, "die": 4}
MAX_ATLAS = 1024


class MaxRects:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.free = [(0, 0, w, h)]

    def insert(self, fw, fh):
        best = None
        for (x, y, w, h) in self.free:
            if fw <= w and fh <= h:
                score = (min(w - fw, h - fh), max(w - fw, h - fh))
                if best is None or score < best[0]:
                    best = (score, x, y)
        if best is None:
            return None
        _, px, py = best
        out = []
        for (x, y, w, h) in self.free:
            if px >= x + w or px + fw <= x or py >= y + h or py + fh <= y:
                out.append((x, y, w, h))
                continue
            if px > x:
                out.append((x, y, px - x, h))
            if px + fw < x + w:
                out.append((px + fw, y, x + w - px - fw, h))
            if py > y:
                out.append((x, y, w, py - y))
            if py + fh < y + h:
                out.append((x, py + fh, w, y + h - py - fh))
        self.free = [r for i, r in enumerate(out)
                     if not any(j != i and o[0] <= r[0] and o[1] <= r[1]
                                and o[0] + o[2] >= r[0] + r[2] and o[1] + o[3] >= r[1] + r[3]
                                for j, o in enumerate(out))]
        return px, py


def pack(in_dir, out_dir, unit):
    names = []
    for anim, n in ANIMS.items():
        for d in range(DIRECTIONS):
            for i in range(n):
                names.append((anim, d, i))
    first = Image.open(os.path.join(in_dir, "%s_%02d_%02d.png" % (names[0][0], names[0][1], names[0][2])))
    cw, ch = first.size
    if cw % 8 or ch % 8:
        raise SystemExit("cell %dx%d is not a multiple of 8" % (cw, ch))
    side = 256
    while True:
        if side > MAX_ATLAS:
            raise SystemExit("frames do not fit in %d x %d" % (MAX_ATLAS, MAX_ATLAS))
        mr = MaxRects(side, side)
        spots = []
        for _ in names:
            p = mr.insert(cw, ch)
            if p is None:
                break
            spots.append(p)
        if len(spots) == len(names):
            break
        side *= 2
    color = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    mask = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    frames, anims = {}, {a: [] for a in ANIMS}
    for (anim, d, i), (x, y) in zip(names, spots):
        base = "%s_%02d_%02d" % (anim, d, i)
        im = Image.open(os.path.join(in_dir, base + ".png")).convert("RGBA")
        mk = Image.open(os.path.join(in_dir, base + "_m.png")).convert("RGBA")
        if im.size != (cw, ch) or mk.size != (cw, ch):
            raise SystemExit("%s has a different size" % base)
        color.paste(im, (x, y))
        mask.paste(mk, (x, y))
        name = "%s/%s/%02d/%02d" % (unit, anim, d, i)
        frames[name] = {
            "frame": {"x": x, "y": y, "w": cw, "h": ch},
            "sourceSize": {"w": cw, "h": ch},
            "spriteSourceSize": {"x": 0, "y": 0, "w": cw, "h": ch},
            "rotated": False, "trimmed": False, "anchor": {"x": 0.5, "y": 0.85},
        }
        anims[anim].append(name)
    os.makedirs(out_dir, exist_ok=True)
    color.save(os.path.join(out_dir, unit + ".png"), optimize=True)
    mask.save(os.path.join(out_dir, unit + "-mask.png"), optimize=True)
    sheet = {
        "frames": frames,
        "animations": anims,
        "meta": {
            "image": unit + ".png", "format": "RGBA8888", "size": {"w": side, "h": side}, "scale": "1",
            "thornvael": {"contract": 1, "unit": unit, "directions": DIRECTIONS, "cell": [cw, ch],
                          "anims": ANIMS, "mask": unit + "-mask.png"},
        },
    }
    with open(os.path.join(out_dir, unit + ".json"), "w") as f:
        json.dump(sheet, f, separators=(",", ":"))
    return side, len(names)


def selftest(tmp):
    """Synthetic frames: a coloured block whose position encodes direction and frame."""
    os.makedirs(tmp, exist_ok=True)
    for anim, n in ANIMS.items():
        for d in range(DIRECTIONS):
            for i in range(n):
                im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
                mk = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
                for px in range(8, 24):
                    for py in range(8, 24):
                        im.putpixel((px, py), (d * 16, i * 30, 90, 255))
                        mk.putpixel((px, py), (255, 0, 0, 255))
                im.save(os.path.join(tmp, "%s_%02d_%02d.png" % (anim, d, i)))
                mk.save(os.path.join(tmp, "%s_%02d_%02d_m.png" % (anim, d, i)))


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[2] == "--selftest":
        selftest(sys.argv[1])
        print("synthetic frames written to", sys.argv[1])
    elif len(sys.argv) == 4:
        side, count = pack(sys.argv[1], sys.argv[2], sys.argv[3])
        print("packed %d frames into %dx%d" % (count, side, side))
    else:
        raise SystemExit(__doc__)
