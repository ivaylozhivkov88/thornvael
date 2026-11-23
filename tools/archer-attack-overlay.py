"""Own code. Add a procedural bow draw / loose / arrow to the 'attack' frames of the archer hero.

Usage: python tools/archer-attack-overlay.py        (then: python tools/pack-atlas.py tools/.mesh-out/archer public/sprites archer with MAX_ATLAS=2048)
Reads the untouched frames from tools/.mesh-out/archer-base (copied once from tools/.mesh-out/archer),
draws bow + string + arrow per direction and writes tools/.mesh-out/archer/attack_dd_nn.png.
Frames: 0 nock+half draw, 1 full draw, 2 release (arrow flies, IMPACT), 3 recovery.
"""
import math
import os
import shutil

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, ".mesh-out", "archer")
BASE = os.path.join(HERE, ".mesh-out", "archer-base")
S = 4  # supersample
CELL = 96


def overlay(d, n):
    th = math.radians(d * 22.5)
    fx, fy = -math.sin(th), math.cos(th)  # screen facing (0 S, 4 W, 8 N, 12 E)
    cx, cy = 48 + fx * 11 + abs(fy) * 9, 50 + fy * 4
    draw_amt = (0.45, 1.0, 0.0, 0.0)[n]
    im = Image.new("RGBA", (CELL * S, CELL * S), (0, 0, 0, 0))
    g = ImageDraw.Draw(im)

    def P(x, y):
        return (x * S, y * S)

    half = 13.0
    bulge = 3.0 + (1.5 if draw_amt == 0 else 0)
    tipx = cx - fx * bulge * (0.6 + draw_amt * 0.6)
    top = (tipx, cy - half)
    bot = (tipx, cy + half)
    mid = (cx + fx * bulge, cy)
    nock = (cx - fx * draw_amt * 10, cy - fy * draw_amt * 3 + 0.0)
    if n == 3:
        nock = (cx, cy)
    # string
    g.line([P(*top), P(*nock), P(*bot)], fill=(238, 236, 224, 255), width=int(0.9 * S))
    # arrow (nocked or in flight)
    if n in (0, 1):
        tail = nock
        head = (cx + fx * 9, cy + fy * 3)
    elif n == 2:
        tail = (cx + fx * 10, cy + fy * 3.5)
        head = (cx + fx * 22, cy + fy * 8)
        # speed streak
        g.line([P(cx + fx * 4, cy + fy * 1.3), P(*tail)], fill=(255, 255, 255, 110), width=int(1.4 * S))
    else:
        tail = head = None
    # bow limbs (drawn as two segments through the grip)
    g.line([P(*top), P(*mid), P(*bot)], fill=(120, 80, 44, 255), width=int(2.0 * S), joint="curve")
    g.line([P(top[0] + 0.5, top[1]), P(mid[0] + 0.5, mid[1]), P(bot[0] + 0.5, bot[1])], fill=(176, 128, 78, 255), width=int(0.8 * S))
    g.ellipse([P(mid[0] - 1.4, mid[1] - 2.2), P(mid[0] + 1.4, mid[1] + 2.2)], fill=(70, 46, 30, 255))
    if tail and head:
        g.line([P(*tail), P(*head)], fill=(214, 186, 128, 255), width=int(1.0 * S))
        # head
        hx, hy = head
        g.polygon([P(hx + fx * 2.6, hy + fy * 0.9), P(hx - fy * 0.9, hy + fx * 0.9 - 0.2), P(hx + fy * 0.9, hy - fx * 0.9 + 0.2)], fill=(214, 220, 230, 255))
        # fletching
        tx, ty = tail
        g.line([P(tx, ty), P(tx + fx * 2.5, ty + fy * 0.8)], fill=(190, 64, 52, 255), width=int(1.8 * S))
    return im.resize((CELL, CELL), Image.LANCZOS)


def main():
    if not os.path.isdir(BASE):
        shutil.copytree(OUT, BASE)
    for d in range(16):
        for n in range(4):
            name = "attack_%02d_%02d" % (d, n)
            base = Image.open(os.path.join(BASE, name + ".png")).convert("RGBA")
            ov = overlay(d, n)
            res = Image.alpha_composite(base, ov)
            res.save(os.path.join(OUT, name + ".png"))
            m = Image.open(os.path.join(BASE, name + "_m.png")).convert("RGBA")
            m.save(os.path.join(OUT, name + "_m.png"))
    print("attack overlay done")


if __name__ == "__main__":
    main()
