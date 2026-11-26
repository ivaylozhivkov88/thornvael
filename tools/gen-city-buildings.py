#!/usr/bin/env python3
"""Town buildings (public/art-wave3/city-buildings.{png,json}): 4 cities x 5 roles.

Own procedural art, drawn at 4x and scaled down. Frame names, sizes and anchors
match the earlier atlas, so the game code does not change.

Usage: python tools/gen-city-buildings.py [--preview out.png]
"""

from __future__ import annotations

import argparse
import importlib.util
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("gen_art_wave3", HERE / "gen-art-wave3.py")
wave3 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(wave3)

CITIES = ("thornwick", "redmarsh", "oakhaven", "ironcamp")
ROLES = ("tavern", "smithy", "temple", "gate", "watchtower")
K = 4  # supersampling
INK = (22, 16, 18, 255)

STYLES = {
    "thornwick": {"wall": (150, 130, 104), "stone": (112, 106, 98), "roof": (82, 100, 88), "wood": (98, 66, 42), "accent": (60, 140, 82), "glow": (255, 190, 80), "wall_tex": "plaster"},
    "redmarsh": {"wall": (188, 156, 114), "stone": (158, 128, 94), "roof": (166, 86, 56), "wood": (122, 82, 50), "accent": (64, 186, 206), "glow": (255, 206, 110), "wall_tex": "brick"},
    "oakhaven": {"wall": (118, 124, 134), "stone": (96, 102, 112), "roof": (58, 110, 100), "wood": (106, 76, 52), "accent": (74, 148, 216), "glow": (176, 224, 255), "wall_tex": "stone"},
    "ironcamp": {"wall": (86, 78, 82), "stone": (70, 66, 74), "roof": (88, 88, 100), "wood": (92, 54, 40), "accent": (240, 100, 34), "glow": (255, 148, 48), "wall_tex": "stone"},
}


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c[:3]) + (255,)


class Canvas:
    def __init__(self, w: int, h: int, seed: str):
        self.w, self.h = w, h
        self.im = Image.new("RGBA", (w * K, h * K), (0, 0, 0, 0))
        self.rng = random.Random(wave3.stable_hash(seed))

    def poly(self, pts, fill, outline=INK, width=1.1):
        d = ImageDraw.Draw(self.im)
        p = [(x * K, y * K) for x, y in pts]
        d.polygon(p, fill=fill)
        if outline:
            d.line(p + [p[0]], fill=outline, width=int(width * K), joint="curve")

    def rect(self, x0, y0, x1, y1, fill, outline=INK, width=1.1):
        self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], fill, outline, width)

    def line(self, pts, fill, width=1.0):
        ImageDraw.Draw(self.im).line([(x * K, y * K) for x, y in pts], fill=fill, width=max(1, int(width * K)))

    def oval(self, x0, y0, x1, y1, fill, outline=None, width=1.0):
        ImageDraw.Draw(self.im).ellipse([x0 * K, y0 * K, x1 * K, y1 * K], fill=fill, outline=outline, width=int(width * K))

    def dome(self, x0, y0, x1, base, color):
        """Upper half of an ellipse standing on `base`, with a highlight on the left."""
        d = ImageDraw.Draw(self.im)
        d.pieslice([x0 * K, y0 * K, x1 * K, (2 * base - y0) * K], 180, 360, fill=shade(color, 1.0), outline=INK, width=int(1.1 * K))
        w = x1 - x0
        self.oval(x0 + w * 0.12, y0 + (base - y0) * 0.14, x0 + w * 0.42, y0 + (base - y0) * 0.78, shade(color, 1.22))

    def textured(self, pts, base, draw_texture):
        """Fill a polygon with a texture that is clipped to it, then outline it."""
        mask = Image.new("L", self.im.size, 0)
        ImageDraw.Draw(mask).polygon([(x * K, y * K) for x, y in pts], fill=255)
        layer = Canvas(self.w, self.h, "layer")
        layer.rng = self.rng
        layer.im.paste(base, (0, 0, *self.im.size))
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        draw_texture(layer, min(xs), min(ys), max(xs), max(ys))
        self.im.paste(layer.im, (0, 0), mask)
        self.poly(pts, None)

    def masonry(self, pts, color, kind="stone"):
        def tex(c, x0, y0, x1, y1):
            if kind == "plaster":
                for _ in range(int((x1 - x0) * (y1 - y0) / 9)):
                    x, y = c.rng.uniform(x0, x1), c.rng.uniform(y0, y1)
                    c.oval(x, y, x + c.rng.uniform(1, 3), y + c.rng.uniform(0.6, 1.8), shade(color, c.rng.uniform(0.88, 1.1)))
                return
            rh, bw = (4.0, 8.0) if kind == "brick" else (6.0, 11.0)
            y, row = y0, 0
            while y < y1:
                x = x0 - (bw / 2 if row % 2 else 0)
                while x < x1:
                    w = bw * c.rng.uniform(0.8, 1.2)
                    c.rect(x, y, x + w, y + rh, shade(color, c.rng.uniform(0.84, 1.14)), shade(color, 0.55), 0.7)
                    c.line([(x + 1, y + 1), (x + w - 1.5, y + 1)], shade(color, 1.28), 0.6)
                    x += w
                y += rh
                row += 1

        self.textured(pts, shade(color, 1.0), tex)

    def shingles(self, pts, color):
        def tex(c, x0, y0, x1, y1):
            y, row = y0, 0
            while y < y1:
                x = x0 - (3 if row % 2 else 0)
                while x < x1:
                    f = c.rng.uniform(0.82, 1.18)
                    c.rect(x, y, x + 6, y + 4.4, shade(color, f), None)
                    c.oval(x, y + 2.4, x + 6, y + 6, shade(color, f))
                    c.line([(x, y), (x, y + 5)], shade(color, 0.55), 0.6)
                    x += 6
                c.line([(x0, y + 5.6), (x1, y + 5.6)], shade(color, 0.62), 0.8)
                y += 5.6
                row += 1

        self.textured(pts, shade(color, 1.0), tex)

    def planks(self, pts, color, step=4.0):
        def tex(c, x0, y0, x1, y1):
            x = x0
            while x < x1:
                c.rect(x, y0, x + step, y1, shade(color, c.rng.uniform(0.85, 1.15)), shade(color, 0.5), 0.6)
                x += step

        self.textured(pts, shade(color, 1.0), tex)

    def beam(self, a, b, color, width=2.6):
        self.line([a, b], INK, width + 1.4)
        self.line([a, b], shade(color, 1.0), width)
        self.line([(a[0], a[1] - width * 0.22), (b[0], b[1] - width * 0.22)], shade(color, 1.3), width * 0.25)

    def window(self, x, y, w, h, glow, wood, arched=False):
        if arched:
            self.oval(x - 1.4, y - w / 2 - 1.4, x + w + 1.4, y + w / 2 + 1.4, shade(wood, 0.8), INK, 0.9)
            self.oval(x, y - w / 2, x + w, y + w / 2, glow + (255,))
        self.rect(x - 1.4, y - (0 if arched else 1.4), x + w + 1.4, y + h + 1.4, shade(wood, 0.8))
        self.rect(x, y, x + w, y + h, glow + (255,), None)
        self.rect(x, y + h * 0.55, x + w, y + h, shade(glow, 0.8), None)
        self.line([(x + w / 2, y), (x + w / 2, y + h)], shade(wood, 0.6), 0.9)
        self.line([(x, y + h * 0.5), (x + w, y + h * 0.5)], shade(wood, 0.6), 0.9)
        self.rect(x - 2.2, y + h + 1.4, x + w + 2.2, y + h + 3.2, shade(wood, 1.1))

    def door(self, x, y, w, h, wood, stone):
        self.oval(x - 2, y - w / 2 - 2, x + w + 2, y + w / 2 + 2, shade(stone, 1.15), INK, 0.9)
        self.rect(x - 2, y, x + w + 2, y + h, shade(stone, 1.15))
        self.oval(x, y - w / 2, x + w, y + w / 2, shade(wood, 0.72))
        self.planks([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], shade(wood, 0.8)[:3], w / 4)
        for by in (y + 3, y + h - 6):
            self.line([(x + 1, by), (x + w - 1, by)], (60, 62, 70, 255), 1.4)
        self.oval(x + w - 4.5, y + h * 0.45, x + w - 2, y + h * 0.45 + 2.5, (214, 180, 90, 255))

    def banner(self, x, y, w, h, color):
        self.line([(x - 2, y), (x + w + 2, y)], INK, 2)
        self.poly([(x, y), (x + w, y), (x + w, y + h), (x + w / 2, y + h - 4), (x, y + h)], shade(color, 1.0))
        self.rect(x + w * 0.62, y + 1, x + w - 0.6, y + h - 4, shade(color, 0.7), None)
        self.poly([(x + w / 2, y + 4), (x + w - 2, y + 8), (x + w / 2, y + 12), (x + 2, y + 8)], (232, 198, 110, 255), None)


def body(c, st, x0, x1, top, base, side=14):
    """Front wall and a darker right side wall on a stone plinth."""
    wall = st["wall"]
    c.masonry([(x0, top), (x1 - side, top), (x1 - side, base), (x0, base)], wall, st["wall_tex"])
    c.masonry([(x1 - side, top), (x1, top - 4), (x1, base - 5), (x1 - side, base)], shade(wall, 0.66)[:3], st["wall_tex"])
    c.masonry([(x0 - 2, base - 8), (x1 - side, base - 8), (x1 - side, base + 1), (x0 - 2, base + 1)], st["stone"])
    c.masonry([(x1 - side, base - 8), (x1 + 1, base - 12), (x1 + 1, base - 4), (x1 - side, base + 1)], shade(st["stone"], 0.66)[:3])


def roof(c, st, city, x0, x1, top, peak):
    """City-specific roof above the wall line `top`, from x0 to x1."""
    color, mid = st["roof"], (x0 + x1) / 2
    eave = top + 3
    if city == "redmarsh":  # flat roof, parapet and a low dome
        h = (top - peak) * 0.8
        c.dome(mid - 22, top - h, mid + 22, top, color)
        c.masonry([(x0 - 3, top - 5), (x1 + 3, top - 5), (x1 + 3, eave), (x0 - 3, eave)], st["stone"], "brick")
        for bx in range(int(x0) - 3, int(x1), 10):
            c.rect(bx, top - 10, bx + 6, top - 5, shade(st["stone"], 1.1))
        return
    if city == "oakhaven":
        pts = [(x0 - 6, eave), (x0 + 6, (top + peak) / 2), (mid, peak), (x1 - 6, (top + peak) / 2), (x1 + 6, eave)]
    elif city == "ironcamp":
        pts = [(x0 - 5, eave), (x0 + 12, peak + 6), (x1 - 12, peak + 6), (x1 + 5, eave)]
    else:
        pts = [(x0 - 7, eave), (mid - 4, peak), (mid + 8, peak), (x1 + 7, eave)]
    c.shingles(pts, color)
    c.poly([(mid + 8, peak + (6 if city == "ironcamp" else 0)), pts[-1], (mid + 18, eave)], (14, 10, 16, 80), None)
    for a, b in zip(pts, pts[1:]):
        c.beam(a, b, st["wood"], 2.2)
    c.beam((x0 - 6, eave), (x1 + 6, eave), st["wood"], 3)
    if city == "ironcamp":
        for rx in (x0 + 16, mid, x1 - 16):
            c.beam((rx, peak + 6), (rx, eave), (60, 62, 72), 2)
            c.oval(rx - 1.5, eave - 3, rx + 1.5, eave, (190, 190, 200, 255))


def crenels(c, st, x0, x1, y):
    c.masonry([(x0 - 2, y), (x1 + 2, y), (x1 + 2, y + 7), (x0 - 2, y + 7)], st["stone"])
    x = x0 - 2
    while x + 6 <= x1 + 2:
        c.masonry([(x, y - 7), (x + 6, y - 7), (x + 6, y), (x, y)], st["stone"])
        x += 10


def spike_roof(c, st, x0, x1, base, peak):
    mid = (x0 + x1) / 2
    c.shingles([(x0 - 4, base), (mid, peak), (x1 + 4, base)], st["roof"])
    c.poly([(mid, peak), (x1 + 4, base), (mid + 3, base)], (14, 10, 16, 90), None)
    c.line([(mid, peak - 8), (mid, peak)], INK, 1.8)
    c.poly([(mid, peak - 8), (mid + 10, peak - 5), (mid, peak - 2)], shade(st["accent"], 1.0), INK, 0.7)


def paint(city: str, role: str) -> Image.Image:
    st = STYLES[city]
    w, h = (128, 112) if role == "gate" else (88, 128) if role == "watchtower" else (112, 120) if role == "temple" else (112, 112)
    c = Canvas(w, h, f"{city}/{role}")
    c.oval(6, h - 22, w - 4, h - 3, (14, 12, 16, 110))
    wood, glow, accent = st["wood"], st["glow"], st["accent"]

    if role == "tavern":
        c.masonry([(76, 14), (88, 14), (88, 46), (76, 46)], st["stone"])
        c.rect(74, 10, 90, 15, shade(st["stone"], 1.15))
        body(c, st, 16, 98, 52, 98)
        if city in ("thornwick", "oakhaven"):
            for a, b in (((16, 54), (84, 54)), ((16, 74), (84, 74)), ((17, 52), (17, 96)), ((44, 52), (44, 96)), ((83, 52), (83, 96)), ((17, 74), (32, 54))):
                c.beam(a, b, wood)
        roof(c, st, city, 16, 98, 52, 20)
        c.window(23, 62, 13, 11, glow, wood)
        c.window(68, 62, 11, 11, glow, wood)
        c.door(45, 76, 17, 21, wood, st["stone"])
        c.beam((12, 64), (12, 96), wood, 2.4)
        c.beam((4, 66), (18, 66), wood, 1.8)
        c.rect(3, 69, 17, 81, shade(wood, 1.2))
        c.oval(6.5, 71.5, 12.5, 79, (235, 196, 100, 255), INK, 0.8)
        c.oval(12, 73, 15, 77.5, None, (235, 196, 100, 255), 1.1)
        for bx, by in ((88, 84), (96, 88)):
            c.planks([(bx, by), (bx + 10, by), (bx + 10, by + 14), (bx, by + 14)], wood, 2.5)
            c.line([(bx, by + 3), (bx + 10, by + 3)], (66, 66, 74, 255), 1.4)
            c.line([(bx, by + 11), (bx + 10, by + 11)], (66, 66, 74, 255), 1.4)
            c.oval(bx, by - 2.5, bx + 10, by + 2.5, shade(wood, 1.25), INK, 0.8)

    elif role == "smithy":
        c.masonry([(72, 10), (88, 10), (90, 56), (70, 56)], st["stone"], "brick")
        c.rect(69, 7, 91, 13, shade(st["stone"], 1.15))
        body(c, st, 16, 96, 56, 98)
        roof(c, st, city, 16, 96, 56, 28)
        # open forge with a fire
        c.oval(20, 62, 54, 92, shade(st["stone"], 1.15), INK, 1.1)
        c.rect(20, 77, 54, 97, shade(st["stone"], 1.15))
        c.oval(24, 66, 50, 90, (30, 18, 18, 255))
        c.rect(24, 78, 50, 97, (30, 18, 18, 255), None)
        c.poly([(28, 96), (30, 84), (34, 90), (37, 76), (41, 88), (45, 82), (47, 96)], (240, 104, 24, 255), None)
        c.poly([(32, 96), (36, 86), (39, 92), (41, 87), (43, 96)], (255, 214, 96, 255), None)
        c.window(62, 66, 10, 10, glow, wood)
        # anvil on a stump, hammer
        c.planks([(66, 90), (80, 90), (80, 102), (66, 102)], wood, 3.5)
        c.poly([(60, 80), (86, 80), (88, 83), (78, 85), (77, 90), (68, 90), (69, 85), (64, 84)], (112, 118, 130, 255))
        c.line([(62, 81), (84, 81)], (196, 202, 214, 255), 1)
        c.beam((90, 102), (96, 82), wood, 2)
        c.rect(92, 78, 101, 84, (104, 108, 118, 255))

    elif role == "temple":
        for ox in (14, 88):
            c.masonry([(ox, 52), (ox + 10, 52), (ox + 10, 104), (ox, 104)], st["stone"])
            spike_roof(c, st, ox, ox + 10, 52, 28)
        body(c, st, 24, 90, 56, 104, side=12)
        if city == "redmarsh":
            roof(c, st, city, 24, 90, 56, 18)
        else:
            c.shingles([(19, 59), (56, 14), (95, 59)], st["roof"])
            c.poly([(56, 14), (95, 59), (68, 59)], (14, 10, 16, 80), None)
            c.beam((19, 59), (56, 14), wood, 2.6)
            c.beam((56, 14), (95, 59), wood, 2.6)
            c.beam((20, 59), (94, 59), wood, 3)
        foot = 28 if city == "redmarsh" else 15
        c.line([(56, 2), (56, foot)], INK, 3.2)
        c.line([(56, 2), (56, foot)], (232, 198, 110, 255), 1.6)
        c.line([(51, 6), (61, 6)], (232, 198, 110, 255), 1.6)
        c.oval(46, 56, 66, 76, shade(st["stone"], 1.2), INK, 1.1)
        c.oval(49, 59, 63, 73, shade(accent, 1.05))
        for a, b in (((56, 59), (56, 73)), ((49, 66), (63, 66)), ((51, 61), (61, 71)), ((61, 61), (51, 71))):
            c.line([a, b], INK, 0.8)
        c.oval(53.5, 63.5, 58.5, 68.5, glow + (255,))
        c.door(47, 88, 18, 16, wood, st["stone"])
        c.window(30, 72, 7, 16, glow, wood, arched=True)
        c.window(68, 72, 7, 16, glow, wood, arched=True)
        for i, sw in enumerate((26, 34)):
            c.rect(56 - sw / 2, 104 + i * 3.5, 56 + sw / 2, 107.5 + i * 3.5, shade(st["stone"], 1.2 - i * 0.12))

    elif role == "gate":
        c.masonry([(36, 46), (92, 46), (92, 98), (36, 98)], st["wall"], "stone")
        crenels(c, st, 38, 90, 44)
        for x0, x1 in ((10, 42), (86, 118)):
            c.masonry([(x0, 38), (x1 - 8, 38), (x1 - 8, 100), (x0, 100)], st["wall"], "stone")
            c.masonry([(x1 - 8, 38), (x1, 36), (x1, 96), (x1 - 8, 100)], shade(st["wall"], 0.66)[:3], "stone")
            if city == "redmarsh":
                crenels(c, st, x0, x1, 36)
            else:
                c.rect(x0 - 2, 34, x1 + 2, 40, shade(st["stone"], 1.1))
                spike_roof(c, st, x0, x1, 35, 12)
            c.rect(x0 + 10, 50, x0 + 14, 62, (24, 18, 22, 255))
        c.oval(44, 56, 84, 96, shade(st["stone"], 1.2), INK, 1.1)
        c.rect(44, 76, 84, 99, shade(st["stone"], 1.2))
        c.oval(48, 60, 80, 92, (20, 16, 22, 255))
        c.rect(48, 76, 80, 99, (20, 16, 22, 255), None)
        for gx in range(52, 80, 7):
            c.line([(gx, 62), (gx, 90)], (134, 138, 150, 255), 1.8)
            c.poly([(gx - 2, 89), (gx + 2, 89), (gx, 94)], (134, 138, 150, 255), None)
        for gy in (72, 82):
            c.line([(49, gy), (79, gy)], (110, 114, 126, 255), 1.8)
        c.banner(18, 66, 12, 22, accent)
        c.banner(96, 66, 12, 22, accent)
        for fx in (40, 88):
            c.beam((fx, 78), (fx, 90), wood, 2)
            c.poly([(fx - 3.5, 78), (fx, 68), (fx + 3.5, 78)], (255, 132, 36, 255), INK, 0.7)
            c.poly([(fx - 1.8, 78), (fx, 72), (fx + 1.8, 78)], (255, 220, 110, 255), None)

    else:  # watchtower
        c.masonry([(22, 114), (28, 42), (52, 42), (54, 114)], st["wall"], "stone")
        c.masonry([(52, 42), (62, 40), (68, 110), (54, 114)], shade(st["wall"], 0.66)[:3], "stone")
        c.masonry([(19, 114), (21, 104), (54, 104), (54, 117), (20, 117)], st["stone"])
        c.masonry([(54, 104), (68, 101), (70, 112), (54, 117)], shade(st["stone"], 0.66)[:3])
        c.planks([(18, 36), (70, 36), (68, 44), (20, 44)], wood)
        for bx in (23, 37, 51, 65):
            c.beam((bx, 24), (bx, 36), wood, 2.4)
        c.rect(32, 26, 50, 36, shade(glow, 0.95))
        c.beam((19, 31), (69, 31), wood, 1.6)
        if city == "redmarsh":
            c.shingles([(18, 25), (26, 16), (44, 11), (62, 16), (70, 25)], st["roof"])
            c.line([(44, 3), (44, 12)], INK, 2)
            c.oval(41, 1, 47, 7, (232, 198, 110, 255), INK, 0.8)
        else:
            spike_roof(c, st, 20, 68, 25, 9 if city != "oakhaven" else 12)
        c.window(37, 60, 7, 11, glow, wood, arched=True)
        c.banner(27, 76, 11, 20, accent)
        c.door(40, 100, 11, 16, wood, st["stone"])

    return finish(c.im, w, h, role, st)


def finish(big: Image.Image, w: int, h: int, role: str, st) -> Image.Image:
    # light from the upper left, shade towards the ground
    grad = Image.linear_gradient("L").resize(big.size)
    light = Image.merge("RGB", [grad.point(lambda v: 255 - int(v * 0.24))] * 3)
    rgb = ImageChops.multiply(big.convert("RGB"), light)
    im = Image.merge("RGBA", (*rgb.split(), big.getchannel("A"))).resize((w, h), Image.LANCZOS)
    im = wave3.add_outline(im)
    if role in ("smithy", "watchtower", "temple", "tavern"):
        gx, gy = {"watchtower": (w * 0.47, 30), "smithy": (w * 0.33, 86), "temple": (w * 0.5, 66), "tavern": (w * 0.27, 68)}[role]
        halo = wave3.radial_glow((w, h), (gx, gy), 22, st["glow"], 70)
        halo.putalpha(ImageChops.multiply(halo.getchannel("A"), im.getchannel("A").filter(ImageFilter.MaxFilter(3))))
        im.alpha_composite(halo)
    return im


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", help="write only an enlarged contact sheet to this path")
    args = parser.parse_args()
    frames = [(f"{city}/{role}", paint(city, role), (0.5, 0.90)) for city in CITIES for role in ROLES]
    if args.preview:
        sheet = Image.new("RGBA", (5 * 132, 4 * 132), (72, 84, 56, 255))
        for i, (_, spr, _) in enumerate(frames):
            sheet.alpha_composite(spr, ((i % 5) * 132 + (132 - spr.width) // 2, (i // 5) * 132 + 130 - spr.height))
        sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(args.preview)
        return
    wave3.pack_pixi_atlas(frames, wave3.WAVE3_DIR, "city-buildings", max_width=1024)
    print(f"city buildings written: {len(frames)} frames")


if __name__ == "__main__":
    main()
