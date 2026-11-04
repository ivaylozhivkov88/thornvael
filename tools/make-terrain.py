"""Original Thornvael scenery. Python 3 + Pillow; no source images/downloads.

Run from any directory: python tools/make-terrain.py [--check] [--preview path.png]
--check renders in memory and compares shipped pixels/metadata, without writes.
"""
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import random

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "terrain"
SEED = 1032026
SIZE = (512, 512)
KINDS = ("grass", "dirt", "water", "rock", "marsh", "snow")
PALETTES = {
    "grass": (55, 73, 45), "dirt": (101, 79, 57),
    "water": (35, 63, 72), "rock": (78, 79, 77),
    "marsh": (64, 69, 43), "snow": (155, 170, 171),
}


def noise(x, y, seed):
    n = (x * 374761393 + y * 668265263 + seed * 2246822519) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffff) / 65535


def colour(base, shift):
    return tuple(max(0, min(255, round(c + shift))) for c in base)


def tile(kind, variant):
    """Periodic low-frequency grain + sparse authored marks. No tile border lines."""
    base = PALETTES[kind]
    seed = SEED + KINDS.index(kind) * 71 + variant
    rng = random.Random(seed)
    im = Image.new("RGBA", (32, 32))
    for y in range(32):
        for x in range(32):
            # Periodic coarse texture: variants share quiet, matching borders.
            wave = math.sin(x * math.tau / 32) * math.sin(y * math.tau / 32)
            coarse = wave * (5 + variant * 1.2)
            grain = (noise(x % 32, y % 32, seed) - .5) * 11
            if kind == "water":
                coarse = 4 * math.sin(y * math.tau / 8 + math.sin(x * math.tau / 32))
                grain *= .4
            im.putpixel((x, y), colour(base, coarse + grain) + (255,))
    d = ImageDraw.Draw(im)
    for _ in range(34 if kind in ("grass", "marsh") else 16):
        x, y = rng.randrange(3, 28), rng.randrange(3, 28)
        if kind in ("grass", "marsh"):
            c = colour(base, rng.choice((-13, 12, 19)))
            d.line([(x - 1, y), (x, y - 2), (x + 1, y + 1)], fill=c, width=1)
            if kind == "marsh" and rng.random() < .2:
                d.line((x - 2, y + 2, x + 3, y + 2), fill=(47, 64, 58))
        elif kind == "water":
            d.line((x, y, min(29, x + rng.randrange(2, 7)), y), fill=(58, 86, 91))
            d.point((x, y + 1), fill=(26, 49, 59))
        elif kind == "rock":
            d.line([(x - 3, y + 2), (x, y), (x + 4, y + 1)], fill=(48, 52, 51))
            d.line((x, y - 1, x + 3, y), fill=(103, 104, 94))
        else:
            c = colour(base, rng.choice((-22, 17)))
            d.line((x, y, x + 1, y), fill=c)
    return im


def edge(im, side):
    """Jagged 5px feather, cardinal N/E/S/W, alpha zero away from the edge."""
    out = im.copy()
    for y in range(32):
        for x in range(32):
            distance = (y, 31 - x, 31 - y, x)[side]
            along = x if side % 2 == 0 else y
            reach = 4 + int(noise(along // 2, 0, SEED) * 3)
            alpha = round(210 * max(0, 1 - distance / reach))
            out.putpixel((x, y), im.getpixel((x, y))[:3] + (alpha,))
    return out


def tree(variant):
    im = Image.new("RGBA", (64, 96))
    d = ImageDraw.Draw(im)
    rng = random.Random(SEED + 200 + variant)
    d.ellipse((8, 80, 60, 94), fill=(10, 17, 15, 85))
    d.polygon([(27, 86), (30, 38), (35, 38), (38, 85), (33, 90)], fill=(34, 29, 23))
    d.line([(29, 83), (32, 46)], fill=(105, 87, 58), width=2)
    d.line([(23, 91), (30, 83), (42, 90)], fill=(62, 53, 36), width=2)
    if variant == 2:  # leafless bog tree, still a Tree footprint
        for pts in ([(32, 63), (19, 48), (13, 26), (8, 22)],
                    [(32, 55), (42, 40), (48, 15)],
                    [(32, 44), (27, 28), (31, 10)],
                    [(20, 47), (10, 45), (5, 38)],
                    [(41, 41), (56, 35), (59, 25)]):
            d.line(pts, fill=(35, 33, 27), width=5)
            d.line([(x - 1, y) for x, y in pts], fill=(102, 95, 71), width=1)
        d.ellipse((22, 68, 28, 73), fill=(86, 110, 66))
        return im
    if variant == 0:  # layered fir, north-west light
        for y, radius in ((70, 25), (57, 23), (44, 18), (31, 13)):
            d.polygon([(32, y - 24), (32 + radius, y + 7), (43, y + 4),
                       (35, y + 11), (23, y + 8), (32 - radius, y + 9)], fill=(20, 34, 29))
            d.polygon([(31, y - 22), (35, y - 4), (49, y + 3), (22, y + 3),
                       (32 - radius + 3, y + 6)], fill=(44, 65, 47))
            d.line([(30, y - 12), (25, y - 2), (18, y + 1)], fill=(71, 88, 55))
    else:  # knotted broadleaf clusters, hand-shaped silhouette
        for x, y, r in ((22, 59, 16), (43, 55, 17), (16, 40, 13),
                        (43, 34, 15), (30, 24, 17), (29, 44, 20)):
            d.ellipse((x-r, y-r, x+r, y+r), fill=(21, 35, 26))
            d.ellipse((x-r+1, y-r+1, x+r-4, y+r-7), fill=(47, 66, 38))
            d.arc((x-r+3, y-r+3, x+r-7, y+r-9), 190, 285, fill=(83, 96, 53), width=2)
    for _ in range(110):
        x, y = rng.randrange(5, 59), rng.randrange(9, 76)
        if im.getpixel((x, y))[1] > 40:
            d.point((x, y), fill=rng.choice(((77, 92, 53), (36, 52, 34), (58, 78, 44))))
    return im


def building(variant):
    im = Image.new("RGBA", (96, 96))
    d = ImageDraw.Draw(im)
    d.ellipse((4, 72, 94, 94), fill=(10, 15, 15, 85))
    # 2x2 tile footprint; low roof in a consistent three-quarter view.
    d.polygon([(14, 38), (61, 38), (80, 51), (80, 84), (60, 91), (14, 78)], fill=(78, 74, 61))
    d.polygon([(14, 38), (60, 48), (60, 90), (14, 78)], fill=(128, 116, 86))
    for y in range(51, 82, 8):
        d.line((15, y, 59, y + 11), fill=(79, 77, 65))
        for x in range(20 + (y % 3) * 4, 58, 13):
            d.line((x, y + (x-14)//4, x, y + 6 + (x-14)//4), fill=(91, 87, 70))
    # Main roof and narrow side, slate or rusted tiles.
    roof = (69, 77, 80) if variant == 0 else (98, 57, 44)
    d.polygon([(7, 41), (28, 13), (72, 24), (87, 56), (59, 54)], fill=(28, 32, 31))
    d.polygon([(9, 39), (28, 15), (71, 26), (59, 51)], fill=roof)
    d.polygon([(71, 26), (84, 53), (59, 51)], fill=colour(roof, -19))
    for row in range(4):
        y = 22 + row * 7
        d.line((25-row*5, y, 68-row*3, y+10), fill=colour(roof, 16))
        for x in range(29-row*4, 65-row*2, 10):
            d.line((x, y+2, x-2, y+6), fill=colour(roof, -15))
    d.line((28, 14, 72, 25), fill=(150, 143, 116), width=2)
    d.polygon([(61, 29), (61, 9), (69, 6), (76, 9), (76, 34)], fill=(71, 72, 64))
    d.polygon([(61, 9), (69, 6), (76, 9), (68, 12)], fill=(135, 131, 109))
    d.line((68, 13, 68, 29), fill=(110, 108, 90))
    d.polygon([(31, 65), (42, 68), (42, 85), (31, 82)], fill=(32, 29, 25))
    d.line((33, 68, 33, 81), fill=(95, 71, 44), width=2)
    d.point((39, 77), fill=(191, 147, 71))
    for x, y in ((19, 57), (48, 65), (67, 62)):
        d.rectangle((x, y, x+6, y+9), fill=(31, 38, 36))
        d.rectangle((x+1, y+2, x+3, y+7), fill=(177, 134, 67) if variant else (101, 125, 119))
        d.line((x-1, y+10, x+7, y+10), fill=(164, 146, 107))
    if variant == 1:
        for x in (15, 58):
            d.line((x, 51, x, 78 if x == 15 else 88), fill=(49, 39, 27), width=3)
        d.line((15, 54, 58, 84), fill=(58, 43, 29), width=2)
    return im


def ruin():
    im = Image.new("RGBA", (96, 96))
    d = ImageDraw.Draw(im)
    d.ellipse((6, 71, 92, 94), fill=(10, 15, 15, 80))
    d.polygon([(14, 77), (14, 24), (25, 20), (25, 29), (34, 32), (34, 58),
               (60, 64), (60, 34), (70, 29), (80, 39), (80, 83), (60, 91)], fill=(65, 72, 66))
    d.polygon([(14, 24), (24, 22), (24, 77), (14, 77)], fill=(130, 132, 108))
    d.polygon([(60, 64), (60, 35), (70, 32), (70, 85), (60, 89)], fill=(116, 121, 102))
    for y in range(34, 78, 9):
        d.line((14, y, 24, y-2), fill=(52, 61, 53))
        d.line((61, y+1, 69, y-2), fill=(53, 64, 56))
    for i in range(16):
        x, y = 20 + int(noise(i, 1, SEED)*56), 70 + int(noise(i, 2, SEED)*16)
        d.polygon([(x, y), (x+5, y-4), (x+10, y), (x+7, y+4)], fill=(107, 114, 94))
        d.line((x, y, x+6, y-2), fill=(152, 153, 124))
    d.line([(17, 72), (19, 56), (16, 49)], fill=(69, 91, 48), width=2)
    return im


def generate():
    atlas = Image.new("RGBA", SIZE)
    frames = {}

    def add(name, im, x, y, anchor=None):
        atlas.paste(im, (x, y))
        frames[name] = {"x": x, "y": y, "w": im.width, "h": im.height}
        if anchor is not None:
            frames[name]["anchor"] = list(anchor)

    slot = 0
    for kind in KINDS:
        for variant in range(4):
            im = tile(kind, variant)
            add(f"{kind}/{variant}", im, slot % 16 * 32, slot // 16 * 32)
            slot += 1
    for kind in KINDS:
        for side in range(4):
            for variant in range(4):
                add(f"edge/{kind}/{side}/{variant}", edge(tile(kind, variant), side),
                    slot % 16 * 32, slot // 16 * 32)
                slot += 1
    for variant in range(3):
        add(f"tree/{variant}", tree(variant), variant * 64, 256, (16, 64))
    for variant in range(2):
        add(f"house/{variant}", building(variant), 192 + variant * 96, 256, (16, 32))
    add("ruin/0", ruin(), 384, 256, (16, 32))
    data = {"version": 1, "seed": SEED, "tile": 32, "size": list(SIZE),
            "unused": ["snow", "ruin"], "frames": frames,
            "pixelSha256": hashlib.sha256(atlas.tobytes()).hexdigest()}
    buf = io.BytesIO()
    atlas.save(buf, format="PNG", optimize=True)
    payload = buf.getvalue()
    data["pngSha256"] = hashlib.sha256(payload).hexdigest()
    data["image"] = f"terrain-{data['pngSha256'][:12]}.png"
    return atlas, data, payload


def validate(atlas, data):
    assert atlas.size == SIZE and atlas.mode == "RGBA"
    assert len(data["frames"]) == 126
    rects = []
    for name, f in data["frames"].items():
        x, y, w, h = (f[k] for k in ("x", "y", "w", "h"))
        assert 0 <= x < x+w <= SIZE[0] and 0 <= y < y+h <= SIZE[1], name
        for other, (a, b, c, e) in rects:
            assert x+w <= a or a+c <= x or y+h <= b or b+e <= y, (name, other)
        rects.append((name, (x, y, w, h)))
        alpha = atlas.crop((x, y, x+w, y+h)).getchannel("A")
        if name.startswith(("tree/", "house/", "ruin/", "edge/")):
            assert alpha.getextrema()[0] == 0 and alpha.getextrema()[1] > 0, name
        else:
            assert alpha.getextrema() == (255, 255), name
    for kind in KINDS:
        # All four variants must actually differ, rather than renamed duplicates.
        samples = []
        for v in range(4):
            f = data["frames"][f"{kind}/{v}"]
            samples.append(atlas.crop((f["x"], f["y"], f["x"]+32, f["y"]+32)).tobytes())
        assert len(set(samples)) == 4, kind


def preview(atlas, data):
    """Contact sheet with a small repeated scene; generated only on request."""
    scene = Image.new("RGBA", (512, 384), (23, 28, 24, 255))

    def paste(name, x, y):
        f = data["frames"][name]
        im = atlas.crop((f["x"], f["y"], f["x"]+f["w"], f["y"]+f["h"]))
        scene.alpha_composite(im, (x, y))

    d = ImageDraw.Draw(scene)
    for k, kind in enumerate(KINDS):
        d.text((k*84+3, 2), kind, fill=(210, 203, 173))
        for y in range(3):
            for x in range(2):
                paste(f"{kind}/{(x+y*2)%4}", k*84+x*32+3, 18+y*32)
    for y in range(8):
        for x in range(16):
            kind = "water" if x > 12 else "marsh" if x > 10 else "dirt" if 5 < x < 9 else "grass"
            paste(f"{kind}/{(x*7+y*3)%4}", x*32, 128+y*32)
            if x == 10:
                paste(f"edge/marsh/1/{y%4}", x*32, 128+y*32)
            if x == 12:
                paste(f"edge/water/1/{y%4}", x*32, 128+y*32)
    for i in range(3):
        paste(f"tree/{i}", 18+i*63, 144 + i%2*48)
    paste("house/0", 204, 168)
    paste("house/1", 250, 266)
    paste("ruin/0", 344, 201)
    return scene.resize((1024, 768), Image.Resampling.NEAREST)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()
    atlas, data, payload = generate()
    validate(atlas, data)
    # A second independent pass catches accidental process-global RNG use.
    again, repeat, _ = generate()
    assert data == repeat and atlas.tobytes() == again.tobytes(), "non-deterministic generator"
    if args.check:
        shipped = json.loads((OUT / "terrain.json").read_text(encoding="utf-8"))
        assert shipped == data, "metadata differs; regenerate terrain"
        image_path = OUT / data["image"]
        assert hashlib.sha256(image_path.read_bytes()).hexdigest() == data["pngSha256"], "PNG hash mismatch"
        with Image.open(image_path) as actual:
            assert actual.convert("RGBA").tobytes() == atlas.tobytes(), "shipped pixels differ"
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / data["image"]).write_bytes(payload)
        (OUT / "terrain.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    if args.preview:
        preview(atlas, data).save(args.preview)
    print(f"Terrain {'checked' if args.check else 'generated'}: {len(data['frames'])} frames, "
          f"{len(payload)} bytes PNG, {SIZE[0]*SIZE[1]*4//1024} KiB decoded; {data['image']}")


if __name__ == "__main__":
    main()
