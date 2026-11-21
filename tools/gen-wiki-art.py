"""Generate deterministic dark-fantasy portraits and compendium icons for Thornvael Wiki.

Produces:
  1. public/townart/portrait-necromancer.png         (dedicated full-body Necromancer class portrait)
  2. public/wiki/icons/rw-*.png                      (25 distinct Runeword plates)
  3. public/wiki/icons/affix-*.png                   (22 prefix/suffix runic seals by domain)
  4. public/wiki/icons/achievement-*.png             (30 heraldic crests by category & tier)
  5. public/wiki/icons/faction-*.png & lore-*.png    (37 faction banners, chronicles, codex, quests, landmarks)
  6. public/wiki/icons/tip-*.png                     (10 tip & manual emblem plates)
  7. public/wiki/icons/glossary-*.png                (41 lexicon plates for schools, rarities, mods, cube)

Registers every generated PNG in assets.json with license "own" and source "tools/gen-wiki-art.py".

Usage:
  python tools/gen-wiki-art.py
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
TOWNART_DIR = PUBLIC / "townart"
WIKI_ICONS_DIR = PUBLIC / "wiki" / "icons"
ASSETS_JSON = ROOT / "assets.json"
SEED = 20261121

DARK_OUTLINE = (18, 13, 15, 250)


# ---------------------------------------------------------------------------
# Deterministic Helpers & Compositing Primitives
# ---------------------------------------------------------------------------

def stable_hash(key: str) -> int:
    digest = hashlib.sha256(f"{SEED}:{key}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "little")


def add_outline(im: Image.Image, outline_rgba: Tuple[int, int, int, int] = DARK_OUTLINE) -> Image.Image:
    """Add a crisp 1px dark outline around non-transparent pixels."""
    arr = np.asarray(im, dtype=np.uint8)
    alpha = arr[..., 3] > 32
    h, w = alpha.shape
    dilated = np.zeros_like(alpha)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            ys = slice(max(0, dy), h + min(0, dy))
            xs = slice(max(0, dx), w + min(0, dx))
            yd = slice(max(0, -dy), h + min(0, -dy))
            xd = slice(max(0, -dx), w + min(0, -dx))
            dilated[ys, xs] |= alpha[yd, xd]
    border = dilated & (~alpha)
    out = arr.copy()
    out[border] = outline_rgba
    return Image.fromarray(out, "RGBA")


def radial_glow(
    size: Tuple[int, int],
    center: Tuple[float, float],
    radius: float,
    color: Tuple[int, int, int],
    peak_alpha: int = 190,
    power: float = 2.0,
) -> Image.Image:
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.sqrt((xx - center[0]) ** 2 + (yy - center[1]) ** 2)
    t = np.clip(1.0 - dist / max(1.0, radius), 0.0, 1.0) ** power
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[..., 0] = color[0]
    arr[..., 1] = color[1]
    arr[..., 2] = color[2]
    arr[..., 3] = (t * peak_alpha).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def lerp_rgb(a: Tuple[int, int, int], b: Tuple[int, int, int], t: float) -> Tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return (
        int(round(a[0] + (b[0] - a[0]) * t)),
        int(round(a[1] + (b[1] - a[1]) * t)),
        int(round(a[2] + (b[2] - a[2]) * t)),
    )


def add_subtle_grain(im: Image.Image, key: str, strength: int = 7) -> Image.Image:
    rng = np.random.default_rng(stable_hash(key))
    arr = np.asarray(im, dtype=np.int16)
    noise = rng.integers(-strength, strength + 1, size=(arr.shape[0], arr.shape[1], 1), dtype=np.int16)
    mask = arr[..., 3:4] > 20
    arr[..., :3] = np.where(mask, np.clip(arr[..., :3] + noise, 0, 255), arr[..., :3])
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def regular_poly(cx: float, cy: float, r: float, sides: int, rot_deg: float = -90.0) -> List[Tuple[float, float]]:
    pts = []
    for i in range(sides):
        ang = math.radians(rot_deg + (360.0 * i) / sides)
        pts.append((cx + math.cos(ang) * r, cy + math.sin(ang) * r))
    return pts


def star_poly(cx: float, cy: float, r_out: float, r_in: float, points: int, rot_deg: float = -90.0) -> List[Tuple[float, float]]:
    pts = []
    for i in range(points * 2):
        r = r_out if i % 2 == 0 else r_in
        ang = math.radians(rot_deg + (180.0 * i) / points)
        pts.append((cx + math.cos(ang) * r, cy + math.sin(ang) * r))
    return pts


# ---------------------------------------------------------------------------
# Icon Canvas Helper (96x96 output painted at 4x supersampling -> 384x384)
# ---------------------------------------------------------------------------

class IconPainter:
    S = 4
    LOGICAL = 96
    N = LOGICAL * S

    def __init__(self, key: str, frame_kind: str, metal: Tuple[Tuple[int, int, int], Tuple[int, int, int], Tuple[int, int, int]], glow_rgb: Tuple[int, int, int]):
        self.key = key
        self.base_c, self.hi_c, self.sh_c = metal
        self.glow_rgb = glow_rgb
        self.im = Image.new("RGBA", (self.N, self.N), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
        # Soft ambient radial glow behind medallion
        self.im.alpha_composite(radial_glow((self.N, self.N), (self.N * 0.5, self.N * 0.5), self.N * 0.48, glow_rgb, peak_alpha=115, power=1.7))
        self.d = ImageDraw.Draw(self.im)
        self._draw_frame(frame_kind)

    def sc(self, pts: Iterable[Tuple[float, float]]) -> List[Tuple[float, float]]:
        return [(x * self.S, y * self.S) for x, y in pts]

    def poly(self, pts, fill, outline=DARK_OUTLINE, width=1.6):
        f = (*fill, 255) if len(fill) == 3 else fill
        self.d.polygon(self.sc(pts), fill=f, outline=outline, width=max(1, int(width * self.S)))

    def ell(self, box, fill, outline=DARK_OUTLINE, width=1.6):
        f = (*fill, 255) if len(fill) == 3 else fill
        self.d.ellipse([c * self.S for c in box], fill=f, outline=outline, width=max(1, int(width * self.S)))

    def rect(self, box, fill, outline=DARK_OUTLINE, width=1.5):
        f = (*fill, 255) if len(fill) == 3 else fill
        self.d.rectangle([c * self.S for c in box], fill=f, outline=outline, width=max(1, int(width * self.S)))

    def ln(self, pts, fill, width=1.6):
        f = (*fill, 255) if len(fill) == 3 else fill
        self.d.line(self.sc(pts), fill=f, width=max(1, int(width * self.S)))

    def glow(self, cx: float, cy: float, r: float, color: Tuple[int, int, int], alpha: int = 160, power: float = 2.0):
        self.im.alpha_composite(radial_glow((self.N, self.N), (cx * self.S, cy * self.S), r * self.S, color, peak_alpha=alpha, power=power))
        self.d = ImageDraw.Draw(self.im)

    def jewel(self, cx: float, cy: float, r: float, color: Tuple[int, int, int], hi: Tuple[int, int, int]):
        self.ell((cx - r - 1.1, cy - r - 1.1, cx + r + 1.1, cy + r + 1.1), self.sh_c)
        self.ell((cx - r, cy - r, cx + r, cy + r), color)
        self.ell((cx - r * 0.55, cy - r * 0.55, cx + r * 0.1, cy + r * 0.1), hi, outline=None)

    def _draw_frame(self, kind: str):
        cx, cy = 48.0, 48.0
        inner_bg = (24, 18, 17)
        inner_bg2 = (36, 28, 26)
        if kind == "circle":
            self.ell((6, 6, 90, 90), self.base_c, width=1.8)
            self.ell((9, 9, 87, 87), self.hi_c, outline=None)
            self.ell((11, 11, 85, 85), self.sh_c, outline=None)
            self.ell((13, 13, 83, 83), inner_bg, outline=DARK_OUTLINE, width=1.2)
            self.ell((18, 18, 78, 78), inner_bg2, outline=None)
        elif kind == "oct":
            self.poly(regular_poly(cx, cy, 43, 8, 22.5), self.base_c, width=1.8)
            self.poly(regular_poly(cx, cy, 38, 8, 22.5), self.hi_c, outline=None)
            self.poly(regular_poly(cx, cy, 35, 8, 22.5), inner_bg, width=1.2)
        elif kind == "hex":
            self.poly(regular_poly(cx, cy, 42, 6, -90), self.base_c, width=1.8)
            self.poly(regular_poly(cx, cy, 37, 6, -90), self.hi_c, outline=None)
            self.poly(regular_poly(cx, cy, 34, 6, -90), inner_bg, width=1.2)
        elif kind == "diamond":
            self.poly([(48, 4), (91, 48), (48, 92), (5, 48)], self.base_c, width=1.8)
            self.poly([(48, 9), (86, 48), (48, 87), (10, 48)], self.hi_c, outline=None)
            self.poly([(48, 13), (82, 48), (48, 83), (14, 48)], inner_bg, width=1.2)
        elif kind == "shield":
            pts_o = [(14, 10), (82, 10), (80, 52), (48, 89), (16, 52)]
            pts_m = [(18, 14), (78, 14), (76, 50), (48, 84), (20, 50)]
            pts_i = [(21, 17), (75, 17), (73, 49), (48, 80), (23, 49)]
            self.poly(pts_o, self.base_c, width=1.8)
            self.poly(pts_m, self.hi_c, outline=None)
            self.poly(pts_i, inner_bg, width=1.2)
        elif kind == "tablet":
            pts_o = [(16, 8), (80, 8), (84, 16), (84, 80), (76, 88), (20, 88), (12, 80), (12, 16)]
            pts_i = [(20, 14), (76, 14), (78, 78), (72, 82), (24, 82), (18, 78)]
            self.poly(pts_o, self.base_c, width=1.8)
            self.poly(pts_i, inner_bg, width=1.2)
            for rx, ry in [(22, 16), (74, 16), (22, 80), (74, 80)]:
                self.ell((rx - 2, ry - 2, rx + 2, ry + 2), self.hi_c)
        elif kind == "banner":
            pts_o = [(16, 10), (80, 10), (80, 72), (48, 88), (16, 72)]
            pts_i = [(21, 16), (75, 16), (75, 68), (48, 82), (21, 68)]
            self.poly(pts_o, self.base_c, width=1.8)
            self.poly(pts_i, inner_bg, width=1.2)
            self.rect((12, 7, 84, 13), self.hi_c)
        elif kind == "plate":
            pts_o = [(12, 12), (84, 12), (84, 84), (12, 84)]
            pts_i = [(17, 17), (79, 17), (79, 79), (17, 79)]
            self.poly(pts_o, self.base_c, width=1.8)
            self.poly(pts_i, inner_bg, width=1.2)
            for rx, ry in [(15, 15), (81, 15), (15, 81), (81, 81)]:
                self.ell((rx - 3, ry - 3, rx + 3, ry + 3), self.hi_c)
        self.glow(cx, cy, 28, self.glow_rgb, alpha=85, power=1.8)

    def draw_rune_glyph(self, cx: float, cy: float, size: float, idx: int, color: Tuple[int, int, int]):
        """Draws a crisp angular runic glyph deterministically."""
        s = size
        strokes = [
            [(0, -s), (0, s), (-s * 0.65, -s * 0.25), (s * 0.65, s * 0.25)],
            [(-s * 0.55, -s), (s * 0.55, 0), (-s * 0.55, s), (-s * 0.55, -s)],
            [(-s * 0.6, s), (0, -s), (s * 0.6, s), (-s * 0.4, s * 0.2), (s * 0.4, s * 0.2)],
            [(-s * 0.5, -s), (s * 0.5, -s * 0.35), (-s * 0.5, s * 0.2), (s * 0.5, s)],
            [(0, -s), (0, s), (-s * 0.6, -s * 0.5), (0, -s * 0.1), (s * 0.6, -s * 0.5)],
            [(-s * 0.6, -s * 0.6), (s * 0.6, s * 0.6), (s * 0.6, -s * 0.6), (-s * 0.6, s * 0.6)],
            [(0, -s), (s * 0.6, 0), (0, s), (-s * 0.6, 0), (0, -s)],
        ][idx % 7]
        pts = [(cx + dx, cy + dy) for dx, dy in strokes]
        self.ln(pts, color, 2.0)

    def draw_motif(self, motif: str, accent: Tuple[int, int, int], accent_hi: Tuple[int, int, int]):
        cx, cy = 48.0, 48.0
        if motif == "crescent":
            self.glow(48, 48, 22, accent, 165)
            # Crescent moon blade + lightning arc
            self.poly([(58, 20), (39, 27), (30, 48), (39, 69), (58, 76), (47, 61), (44, 48), (47, 35)], self.hi_c)
            self.ln([(42, 30), (58, 46), (48, 50), (62, 68)], accent_hi, 2.2)
        elif motif == "oak_leaf":
            self.glow(48, 48, 22, accent, 165)
            self.poly([(48, 18), (60, 30), (68, 36), (62, 48), (66, 58), (52, 64), (48, 76), (44, 64), (30, 58), (34, 48), (28, 36), (36, 30)], accent)
            self.ln([(48, 24), (48, 74)], accent_hi, 2.0)
            self.ln([(48, 42), (60, 35)], accent_hi, 1.3)
            self.ln([(48, 52), (35, 45)], accent_hi, 1.3)
        elif motif == "cloak":
            self.glow(48, 44, 22, accent, 155)
            self.poly([(48, 18), (62, 28), (74, 70), (56, 66), (48, 74), (40, 66), (22, 70), (34, 28)], (44, 38, 58))
            self.poly([(48, 20), (58, 30), (54, 44), (42, 44), (38, 30)], (18, 14, 24))
            self.ell((41, 31, 45, 35), accent_hi, outline=None)
            self.ell((51, 31, 55, 35), accent_hi, outline=None)
            self.ln([(34, 44), (62, 44)], accent, 2.0)
        elif motif == "plume":
            self.glow(48, 46, 22, accent, 145)
            for px, py, pr, col in [(42, 58, 13, (96, 102, 118)), (54, 52, 12, (124, 132, 148)), (46, 40, 14, (154, 162, 182)), (54, 29, 10, accent_hi)]:
                self.ell((px - pr, py - pr, px + pr, py + pr), col)
            self.ln([(32, 70), (64, 70)], accent, 2.4)
        elif motif == "spiked_plate":
            self.poly([(26, 28), (36, 22), (60, 22), (70, 28), (74, 44), (62, 49), (60, 70), (36, 70), (34, 49), (22, 44)], self.base_c)
            for sx, sy, tx, ty in [(28, 28, 18, 20), (68, 28, 78, 20), (34, 48, 24, 54), (62, 48, 72, 54)]:
                self.poly([(sx, sy - 4), (tx, ty), (sx, sy + 4)], accent_hi)
            self.jewel(48, 44, 5.0, accent, accent_hi)
        elif motif == "winged_armor":
            self.glow(48, 44, 24, accent, 165)
            for dir_x in (-1, 1):
                self.poly([(48 + 10 * dir_x, 42), (48 + 30 * dir_x, 22), (48 + 26 * dir_x, 40), (48 + 22 * dir_x, 54), (48 + 10 * dir_x, 54)], accent)
            self.poly([(36, 26), (60, 26), (58, 68), (38, 68)], self.hi_c)
            self.jewel(48, 42, 4.8, accent, accent_hi)
        elif motif == "bastion":
            self.poly([(24, 28), (34, 28), (34, 34), (42, 34), (42, 28), (54, 28), (54, 34), (62, 34), (62, 28), (72, 28), (72, 72), (24, 72)], self.base_c)
            self.poly([(40, 72), (40, 50), (48, 43), (56, 50), (56, 72)], (20, 16, 18))
            self.ln([(26, 40), (70, 40)], accent, 2.0)
            self.jewel(48, 56, 4.2, accent, accent_hi)
        elif motif == "halberd":
            self.ln([(30, 74), (62, 22)], (118, 84, 52), 3.2)
            self.poly([(56, 18), (68, 16), (64, 34)], self.hi_c)
            self.poly([(46, 26), (74, 28), (70, 50), (50, 42)], accent)
            self.jewel(52, 34, 3.6, accent_hi, (255, 252, 235))
        elif motif == "scythe":
            self.ln([(34, 74), (58, 22)], (96, 68, 48), 3.4)
            self.poly([(56, 20), (30, 22), (20, 38), (34, 34), (54, 32)], self.hi_c)
            self.ln([(24, 32), (52, 24)], accent_hi, 1.8)
            self.jewel(56, 26, 3.6, accent, accent_hi)
        elif motif == "war_horn":
            self.glow(48, 48, 22, accent, 155)
            self.poly([(26, 56), (34, 42), (48, 32), (68, 24), (74, 36), (52, 50), (38, 64), (24, 62)], accent)
            self.ln([(40, 38), (46, 48)], self.hi_c, 2.4)
            self.ln([(54, 30), (60, 42)], self.hi_c, 2.4)
            self.ln([(28, 24), (66, 68)], self.base_c, 2.8)
        elif motif == "chains":
            self.glow(48, 48, 22, accent, 150)
            for idx_c, (cx0, cy0) in enumerate([(34, 34), (48, 44), (62, 54), (34, 58), (62, 30)]):
                self.ell((cx0 - 10, cy0 - 7, cx0 + 10, cy0 + 7), accent if idx_c % 2 == 0 else self.hi_c, width=1.6)
                self.ell((cx0 - 5, cy0 - 3, cx0 + 5, cy0 + 3), (24, 18, 17), width=1.0)
            self.jewel(48, 44, 4.5, accent_hi, (255, 252, 235))
        elif motif == "flail":
            self.ln([(26, 72), (52, 34)], (114, 78, 46), 3.2)
            self.ln([(52, 34), (64, 42), (66, 58)], self.hi_c, 1.8)
            self.ell((56, 50, 74, 68), accent)
            for sx, sy in [(65, 45), (78, 59), (65, 72), (52, 59)]:
                self.poly([(65, 59), (sx, sy), (67, 61)], self.hi_c, width=0.9)
            self.jewel(65, 59, 3.5, accent_hi, (255, 252, 235))
        elif motif == "sunburst":
            self.glow(48, 48, 25, accent, 175)
            self.poly([(28, 24), (68, 24), (65, 52), (48, 74), (31, 52)], self.base_c)
            self.poly(star_poly(cx, cy, 17, 7, 8, 0), accent)
            self.jewel(cx, cy, 4.5, accent_hi, (255, 252, 235))
        elif motif == "sword":
            self.poly([(28, 66), (62, 22), (71, 18), (67, 29), (33, 71)], self.base_c)
            self.poly([(31, 64), (64, 23), (69, 20), (34, 68)], self.hi_c, outline=None)
            self.poly([(24, 57), (41, 70), (38, 74), (21, 61)], accent)
            self.ln([(29, 68), (21, 77)], self.sh_c, 3.0)
            self.ell((18, 74, 24, 80), accent_hi)
        elif motif == "crossed_swords":
            for dir_x in (-1, 1):
                p = [(cx - 22 * dir_x, 68), (cx + 20 * dir_x, 22), (cx + 25 * dir_x, 19), (cx + 22 * dir_x, 27), (cx - 17 * dir_x, 72)]
                self.poly(p, self.hi_c if dir_x == 1 else self.base_c)
                self.ln([(cx - 24 * dir_x, 60), (cx - 12 * dir_x, 71)], accent, 2.6)
                self.ln([(cx - 19 * dir_x, 68), (cx - 26 * dir_x, 76)], self.sh_c, 2.8)
            self.jewel(cx, 48, 4.5, accent, accent_hi)
        elif motif == "axe":
            self.ln([(28, 74), (60, 24)], (118, 82, 52), 3.4)
            self.poly([(48, 22), (72, 20), (70, 44), (48, 38)], self.base_c)
            self.poly([(64, 21), (72, 20), (70, 44), (62, 40)], self.hi_c, outline=None)
            self.poly([(30, 26), (48, 31), (45, 40), (27, 34)], self.base_c)
            self.jewel(50, 32, 3.5, accent, accent_hi)
        elif motif == "shield":
            self.poly([(28, 24), (68, 24), (65, 52), (48, 74), (31, 52)], self.base_c)
            self.poly([(48, 25), (67, 25), (64, 51), (48, 72)], self.sh_c, outline=None)
            self.ln([(48, 26), (48, 70)], accent, 2.2)
            self.ln([(31, 44), (65, 44)], accent, 2.2)
            self.jewel(48, 44, 5.2, accent, accent_hi)
        elif motif == "flame":
            self.glow(48, 48, 24, accent, 175)
            self.poly([(48, 18), (64, 42), (60, 66), (48, 74), (36, 66), (32, 42)], accent)
            self.poly([(48, 28), (57, 46), (54, 64), (48, 70), (42, 64), (39, 46)], accent_hi, outline=None)
            self.poly([(48, 40), (53, 53), (48, 66), (43, 53)], (255, 246, 206), outline=None)
        elif motif == "frost":
            self.glow(48, 48, 24, accent, 160)
            for deg in range(0, 180, 30):
                rad = math.radians(deg)
                dx, dy = math.cos(rad) * 24, math.sin(rad) * 24
                self.ln([(cx - dx, cy - dy), (cx + dx, cy + dy)], accent_hi, 2.2)
            self.poly(regular_poly(cx, cy, 11, 6, 0), accent)
            self.poly(regular_poly(cx, cy, 6, 6, 30), (236, 252, 255), outline=None)
        elif motif == "lightning":
            self.glow(48, 48, 24, accent, 170)
            self.poly([(54, 18), (34, 48), (47, 48), (38, 77), (64, 43), (50, 43)], accent)
            self.poly([(52, 23), (39, 46), (49, 46), (43, 69), (59, 45), (49, 45)], accent_hi, outline=None)
        elif motif == "poison":
            self.glow(48, 48, 24, accent, 155)
            self.poly([(48, 20), (64, 48), (61, 67), (48, 74), (35, 67), (32, 48)], accent)
            self.poly([(48, 29), (57, 50), (54, 65), (48, 69), (42, 65)], accent_hi, outline=None)
            self.ell((35, 25, 42, 32), accent_hi)
            self.ell((56, 29, 62, 35), accent)
        elif motif == "astral_eye":
            self.glow(48, 48, 25, accent, 175)
            self.poly([(18, 48), (34, 30), (48, 26), (62, 30), (78, 48), (62, 66), (48, 70), (34, 66)], accent)
            self.ell((34, 34, 62, 62), (24, 18, 36))
            self.ell((38, 38, 58, 58), accent_hi)
            self.poly([(48, 37), (52, 48), (48, 59), (44, 48)], (18, 12, 24), outline=None)
        elif motif == "skull":
            self.glow(48, 46, 24, accent, 145)
            self.ell((28, 22, 68, 58), (220, 212, 192))
            self.poly([(36, 52), (60, 52), (57, 70), (39, 70)], (206, 196, 174))
            self.ell((35, 36, 44, 45), (22, 16, 20))
            self.ell((52, 36, 61, 45), (22, 16, 20))
            self.ell((38, 39, 41, 42), accent_hi, outline=None)
            self.ell((55, 39, 58, 42), accent_hi, outline=None)
            self.poly([(48, 46), (51, 53), (45, 53)], (24, 18, 22), outline=None)
            for tx in (42, 46, 50, 54):
                self.ln([(tx, 60), (tx, 69)], (72, 64, 54), 1.1)
        elif motif == "bow":
            self.d.arc([24 * self.S, 18 * self.S, 74 * self.S, 78 * self.S], 255, 105, fill=(*accent, 255), width=4 * self.S)
            self.ln([(42, 20), (42, 76)], (236, 228, 210), 1.4)
            self.ln([(26, 48), (74, 48)], self.base_c, 2.0)
            self.poly([(68, 43), (79, 48), (68, 53)], accent_hi)
        elif motif == "staff":
            self.ln([(28, 75), (60, 25)], (118, 82, 50), 3.4)
            self.poly([(52, 24), (62, 15), (72, 23), (62, 34)], self.hi_c)
            self.jewel(62, 24, 5.2, accent, accent_hi)
        elif motif == "wand":
            self.ln([(26, 72), (62, 26)], (216, 208, 188), 3.0)
            self.jewel(64, 24, 5.2, accent, accent_hi)
            self.glow(64, 24, 18, accent, 160)
        elif motif == "book":
            self.poly([(24, 24), (58, 19), (74, 27), (70, 72), (34, 77), (22, 68)], (92, 54, 40))
            self.poly([(31, 27), (68, 22), (66, 68), (29, 73)], accent)
            self.poly([(31, 27), (37, 26), (35, 72), (29, 73)], self.sh_c)
            self.jewel(50, 48, 5.5, accent_hi, (255, 250, 230))
        elif motif == "scroll":
            self.poly([(30, 22), (66, 22), (63, 72), (27, 72)], (228, 208, 168))
            self.ell((22, 18, 34, 30), (206, 182, 136))
            self.ell((60, 66, 72, 78), (206, 182, 136))
            for ly in (32, 39, 46):
                self.ln([(35, ly), (56, ly)], (114, 86, 56), 1.4)
            self.jewel(48, 58, 5.5, accent, accent_hi)
        elif motif == "crown":
            self.glow(48, 46, 24, accent, 145)
            self.poly([(22, 64), (24, 34), (36, 46), (48, 24), (60, 46), (72, 34), (74, 64)], accent)
            self.poly([(22, 58), (74, 58), (74, 66), (22, 66)], self.hi_c)
            self.jewel(48, 45, 4.2, accent_hi, (255, 252, 232))
            self.jewel(32, 53, 2.8, accent_hi, (255, 252, 232))
            self.jewel(64, 53, 2.8, accent_hi, (255, 252, 232))
        elif motif == "compass":
            self.ell((24, 24, 72, 72), (42, 34, 26), outline=self.hi_c, width=1.8)
            self.poly(star_poly(cx, cy, 24, 6, 4, -90), accent)
            self.poly([(cx, cy - 24), (cx + 5, cy), (cx, cy)], accent_hi, outline=None)
            self.jewel(cx, cy, 4.0, accent_hi, (255, 252, 235))
        elif motif == "anvil":
            self.poly([(24, 42), (74, 42), (68, 52), (56, 52), (60, 68), (34, 68), (38, 52), (24, 48)], self.base_c)
            self.poly([(26, 42), (72, 42), (70, 46), (26, 46)], self.hi_c, outline=None)
            self.ln([(54, 22), (46, 36)], (126, 86, 52), 3.0)
            self.poly([(40, 20), (54, 26), (50, 34), (36, 28)], accent)
        elif motif == "coins":
            self.poly([(26, 32), (70, 32)], self.hi_c)
            self.ln([(48, 22), (48, 70)], self.hi_c, 2.2)
            self.ln([(26, 32), (70, 32)], self.hi_c, 2.2)
            self.ln([(28, 32), (22, 50)], self.base_c, 1.3)
            self.ln([(28, 32), (34, 50)], self.base_c, 1.3)
            self.ln([(68, 32), (62, 50)], self.base_c, 1.3)
            self.ln([(68, 32), (74, 50)], self.base_c, 1.3)
            self.poly([(20, 50), (36, 50), (32, 56), (24, 56)], accent)
            self.poly([(60, 50), (76, 50), (72, 56), (64, 56)], accent)
            self.ell((42, 60, 54, 72), accent_hi)
        elif motif == "helm":
            self.poly([(28, 68), (30, 34), (40, 22), (56, 22), (66, 34), (68, 68), (52, 74), (50, 54), (46, 54), (44, 74)], self.base_c)
            self.poly([(45, 23), (51, 23), (51, 52), (45, 52)], accent)
            self.poly([(33, 42), (44, 44), (43, 50), (33, 48)], (18, 14, 18), outline=None)
            self.poly([(52, 44), (63, 42), (63, 48), (53, 50)], (18, 14, 18), outline=None)
        elif motif == "lantern":
            self.glow(48, 50, 22, accent, 175)
            self.ln([(48, 18), (48, 28)], self.hi_c, 2.2)
            self.poly([(36, 28), (60, 28), (64, 34), (32, 34)], self.base_c)
            self.poly([(34, 34), (62, 34), (59, 66), (37, 66)], accent)
            self.poly([(41, 38), (55, 38), (53, 62), (43, 62)], accent_hi, outline=None)
            self.ln([(48, 34), (48, 66)], self.sh_c, 1.4)
            self.poly([(34, 66), (62, 66), (60, 74), (36, 74)], self.base_c)
        elif motif == "hourglass":
            self.poly([(30, 22), (66, 22), (66, 27), (30, 27)], self.hi_c)
            self.poly([(30, 69), (66, 69), (66, 74), (30, 74)], self.hi_c)
            self.poly([(34, 27), (62, 27), (50, 48), (62, 69), (34, 69), (46, 48)], (134, 168, 192))
            self.poly([(38, 69), (58, 69), (48, 56)], accent, outline=None)
            self.poly([(40, 31), (56, 31), (48, 43)], accent_hi, outline=None)
        elif motif == "anchor":
            self.ell((41, 20, 55, 34), self.hi_c)
            self.ell((44, 23, 52, 31), (22, 18, 18))
            self.ln([(48, 34), (48, 72)], self.base_c, 3.6)
            self.ln([(34, 38), (62, 38)], self.hi_c, 3.0)
            self.d.arc([24 * self.S, 38 * self.S, 72 * self.S, 74 * self.S], 15, 165, fill=(*accent, 255), width=4 * self.S)
            self.poly([(22, 54), (32, 48), (30, 59)], accent_hi)
            self.poly([(74, 54), (64, 48), (66, 59)], accent_hi)
        elif motif == "cube":
            self.glow(48, 48, 28, accent, 175)
            # Isometric cube faces
            self.poly([(48, 20), (74, 35), (48, 50), (22, 35)], self.hi_c)
            self.poly([(22, 35), (48, 50), (48, 78), (22, 63)], self.base_c)
            self.poly([(74, 35), (74, 63), (48, 78), (48, 50)], self.sh_c)
            self.ln([(48, 20), (48, 50), (22, 63)], accent_hi, 1.8)
            self.ln([(48, 50), (74, 63)], accent, 1.8)
            self.jewel(48, 35, 4.5, accent, accent_hi)
        elif motif == "obelisk":
            self.glow(48, 42, 22, accent, 130)
            self.poly([(48, 18), (58, 32), (62, 74), (34, 74), (38, 32)], self.base_c)
            self.poly([(48, 18), (58, 32), (62, 74), (48, 74)], self.sh_c, outline=None)
            self.draw_rune_glyph(48, 48, 9, 0, accent_hi)
        elif motif == "armor":
            self.poly([(24, 28), (36, 22), (60, 22), (72, 28), (76, 44), (64, 49), (62, 72), (34, 72), (32, 49), (20, 44)], self.base_c)
            self.poly([(48, 23), (60, 22), (72, 28), (76, 44), (64, 49), (62, 72), (48, 72)], self.sh_c, outline=None)
            self.jewel(48, 44, 4.5, accent, accent_hi)
        elif motif == "wing":
            self.glow(48, 48, 22, accent, 145)
            self.poly([(24, 64), (32, 38), (52, 22), (72, 20), (62, 36), (70, 44), (54, 52), (60, 62), (40, 68)], accent)
            self.ln([(30, 58), (58, 26)], accent_hi, 2.0)
            self.ln([(34, 62), (60, 38)], accent_hi, 1.5)
        elif motif == "gauntlet":
            self.poly([(32, 46), (64, 46), (66, 70), (30, 70)], self.base_c)
            for i in range(4):
                fx = 33 + i * 7.8
                fy = 24 + abs(i - 1.5) * 2.5
                self.poly([(fx, fy), (fx + 6, fy), (fx + 6, 47), (fx, 47)], self.hi_c if i < 2 else self.base_c)
            self.poly([(30, 56), (66, 56), (66, 63), (30, 63)], accent)
        elif motif == "gravestone":
            self.poly([(30, 74), (30, 38), (38, 24), (58, 24), (66, 38), (66, 74)], (96, 94, 102))
            self.poly([(24, 70), (72, 70), (74, 78), (22, 78)], (72, 70, 78))
            self.ln([(48, 34), (48, 56)], accent, 2.2)
            self.ln([(39, 42), (57, 42)], accent, 2.2)
        else:  # star / heraldic crest
            self.glow(48, 48, 24, accent, 155)
            self.poly(star_poly(cx, cy, 26, 11, 6, -90), accent)
            self.poly(star_poly(cx, cy, 17, 7, 6, -60), accent_hi, outline=None)
            self.jewel(cx, cy, 5.0, accent, (255, 250, 230))

    def finish(self, out_size: int = 96) -> Image.Image:
        out = self.im.resize((out_size, out_size), Image.LANCZOS)
        out = add_subtle_grain(out, self.key, strength=5)
        return add_outline(out)


# Palettes
BRONZE_METAL = ((156, 110, 62), (206, 156, 94), (92, 62, 34))
SILVER_METAL = ((164, 174, 188), (224, 234, 246), (86, 96, 112))
GOLD_METAL = ((212, 168, 72), (252, 224, 128), (124, 92, 34))
IRON_METAL = ((118, 124, 134), (176, 184, 196), (62, 66, 74))
OBSIDIAN_METAL = ((78, 74, 94), (132, 126, 156), (38, 36, 48))


# ---------------------------------------------------------------------------
# 1. Necromancer Class Portrait (public/townart/portrait-necromancer.png)
# ---------------------------------------------------------------------------

def generate_necromancer_portrait() -> Image.Image:
    """Paint a dramatic 512x684 transparent-background Necromancer class portrait at 2x supersampling."""
    W, H = 512 * 2, 684 * 2
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # Subtle ground shadow matching portrait-mage-m.png
    d.ellipse([260, 1244, 774, 1316], fill=(20, 18, 24, 115))

    # --- Staff (left side) ---
    # Gnarled bleached bone & dark ashwood shaft with rib segments
    shaft_pts = [(246, 332), (266, 332), (272, 680), (265, 1238), (243, 1238), (248, 680)]
    d.polygon(shaft_pts, fill=(134, 124, 108, 255), outline=(22, 16, 18, 255), width=5)
    d.line([(256, 342), (253, 1228)], fill=(192, 182, 162, 230), width=5)
    for ky in range(420, 1180, 120):
        d.line([(245, ky), (269, ky + 6)], fill=(68, 60, 52, 220), width=4)
    # Ribbed bone prong cradle at top
    d.polygon([(198, 236), (218, 202), (240, 294), (258, 334), (233, 342)], fill=(198, 188, 166, 255), outline=(22, 18, 20, 255), width=4)
    d.polygon([(316, 232), (294, 198), (274, 292), (256, 334), (282, 342)], fill=(172, 162, 144, 255), outline=(22, 18, 20, 255), width=4)
    # Suspended crystal lantern core
    d.ellipse([222, 224, 292, 294], fill=(44, 174, 130, 255), outline=(22, 34, 30, 255), width=4)
    d.ellipse([236, 238, 278, 280], fill=(124, 248, 200, 255))

    # --- Boots ---
    d.polygon([(404, 1186), (464, 1186), (470, 1260), (380, 1266), (374, 1244)], fill=(42, 36, 42, 255), outline=(20, 16, 20, 255), width=4)
    d.polygon([(580, 1186), (644, 1186), (676, 1248), (666, 1266), (576, 1260)], fill=(36, 30, 36, 255), outline=(20, 16, 20, 255), width=4)

    # --- Under-robe & Trailing Probate Cloak ---
    # Deep violet-charcoal inner cassock with fold shading
    d.polygon([(392, 390), (654, 390), (754, 1222), (318, 1222)], fill=(34, 30, 44, 255), outline=(18, 14, 20, 255), width=5)
    d.polygon([(392, 390), (476, 440), (468, 1220), (318, 1222)], fill=(46, 40, 58, 255))
    d.polygon([(576, 440), (654, 390), (754, 1222), (590, 1220)], fill=(24, 21, 32, 255))
    # Vertical embroidered parchment/silver probate stole down front
    d.polygon([(488, 460), (558, 460), (576, 1220), (470, 1220)], fill=(54, 46, 66, 255), outline=(168, 144, 92, 255), width=4)
    for ry in range(520, 1180, 56):
        d.line([(500, ry), (546, ry)], fill=(204, 180, 114, 220), width=4)
        d.line([(523, ry - 14), (523, ry + 14)], fill=(104, 224, 182, 205), width=3)

    # Sweeping outer ash-grey & tarnished obsidian cape with ragged weathered hem
    d.polygon(
        [(378, 380), (464, 410), (434, 1196), (394, 1172), (356, 1192), (324, 1166), (294, 1174)],
        fill=(60, 58, 68, 255),
        outline=(20, 18, 22, 255),
        width=5,
    )
    d.polygon(
        [(666, 380), (582, 410), (618, 1206), (664, 1178), (706, 1198), (742, 1168), (768, 1176)],
        fill=(46, 44, 54, 255),
        outline=(20, 18, 22, 255),
        width=5,
    )
    # Cape shading folds
    d.line([(396, 440), (354, 1160)], fill=(42, 40, 48, 220), width=8)
    d.line([(422, 460), (404, 1160)], fill=(80, 78, 90, 190), width=5)
    d.line([(638, 450), (674, 1164)], fill=(30, 28, 36, 220), width=8)
    d.line([(608, 460), (638, 1170)], fill=(68, 66, 78, 180), width=5)

    # --- Arms & Hands ---
    d.polygon([(388, 410), (424, 456), (324, 578), (272, 558)], fill=(44, 40, 54, 255), outline=(20, 16, 22, 255), width=5)
    d.polygon([(270, 545), (326, 568), (312, 594), (258, 570)], fill=(176, 154, 98, 255), outline=(22, 18, 20, 255), width=4)
    d.ellipse([236, 542, 286, 596], fill=(184, 178, 166, 255), outline=(24, 20, 22, 255), width=4)

    d.polygon([(656, 410), (722, 596), (682, 634), (620, 470)], fill=(38, 34, 48, 255), outline=(20, 16, 22, 255), width=5)
    d.polygon([(674, 608), (726, 590), (736, 616), (684, 636)], fill=(176, 154, 98, 255), outline=(22, 18, 20, 255), width=4)
    d.ellipse([686, 622, 738, 686], fill=(176, 170, 158, 255), outline=(24, 20, 22, 255), width=4)

    # --- Shoulder Mantle & Ribbed Bone Collar ---
    d.polygon([(354, 392), (470, 344), (576, 344), (692, 392), (656, 488), (523, 524), (390, 488)], fill=(68, 64, 76, 255), outline=(20, 18, 22, 255), width=5)
    d.polygon([(523, 346), (576, 344), (692, 392), (656, 488), (523, 524)], fill=(52, 48, 60, 255))
    # Bone clavicle clasps & skull brooch
    for dx in (-1, 1):
        d.polygon([(523 + 18 * dx, 412), (523 + 88 * dx, 376), (523 + 98 * dx, 398), (523 + 22 * dx, 434)], fill=(212, 202, 180, 255), outline=(24, 20, 22, 255), width=4)
    d.ellipse([496, 396, 550, 452], fill=(218, 208, 184, 255), outline=(24, 20, 22, 255), width=4)
    d.ellipse([508, 412, 518, 422], fill=(32, 28, 30, 255))
    d.ellipse([528, 412, 538, 422], fill=(32, 28, 30, 255))
    # Belt & hanging probate seal
    d.polygon([(412, 668), (634, 668), (642, 706), (404, 706)], fill=(78, 56, 42, 255), outline=(22, 16, 18, 255), width=4)
    d.ellipse([502, 664, 544, 710], fill=(192, 162, 86, 255), outline=(24, 18, 18, 255), width=4)
    d.ellipse([513, 676, 533, 698], fill=(74, 214, 168, 255))

    # --- Hooded Head & Gaunt Face ---
    d.polygon([(426, 350), (442, 200), (523, 124), (604, 200), (620, 350), (523, 388)], fill=(56, 52, 66, 255), outline=(18, 14, 20, 255), width=5)
    d.polygon([(523, 128), (604, 200), (620, 350), (523, 388)], fill=(42, 38, 50, 255))
    d.line([(444, 336), (456, 212), (523, 146), (590, 212), (602, 336)], fill=(198, 174, 110, 255), width=6)
    d.ellipse([458, 198, 588, 356], fill=(20, 16, 24, 255))
    d.polygon([(484, 240), (562, 240), (558, 302), (538, 340), (508, 340), (488, 302)], fill=(184, 180, 170, 255), outline=(36, 30, 34, 255), width=3)
    d.polygon([(490, 276), (506, 290), (496, 318)], fill=(116, 112, 110, 210))
    d.polygon([(556, 276), (540, 290), (550, 318)], fill=(116, 112, 110, 210))
    d.polygon([(498, 312), (548, 312), (536, 368), (523, 382), (510, 368)], fill=(64, 62, 68, 255), outline=(24, 20, 24, 255), width=3)

    # Apply grain and crisp 1px silhouette outline BEFORE compositing soft un-outlined glows!
    base_out = im.resize((512, 684), Image.LANCZOS)
    base_out = add_subtle_grain(base_out, "portrait-necromancer", strength=6)
    base_out = add_outline(base_out, (18, 14, 18, 240))

    # Composite soft soul-lantern glow, palm wisp, and glowing jade eyes on top without outline rings
    glow_layer = Image.new("RGBA", (512, 684), (0, 0, 0, 0))
    glow_layer.alpha_composite(radial_glow((512, 684), (128, 130), 108, (56, 228, 172), peak_alpha=155, power=1.9))
    glow_layer.alpha_composite(radial_glow((512, 684), (128, 130), 48, (196, 255, 232), peak_alpha=180, power=2.1))
    glow_layer.alpha_composite(radial_glow((512, 684), (356, 302), 52, (72, 232, 182), peak_alpha=165, power=2.0))
    glow_layer.alpha_composite(radial_glow((512, 684), (253, 134), 14, (92, 255, 202), peak_alpha=175, power=2.0))
    glow_layer.alpha_composite(radial_glow((512, 684), (270, 134), 14, (92, 255, 202), peak_alpha=175, power=2.0))

    gd = ImageDraw.Draw(glow_layer)
    # Soul-flame hovering above right palm
    gd.polygon([(356, 268), (369, 298), (356, 314), (343, 298)], fill=(104, 240, 194, 225))
    gd.polygon([(356, 279), (363, 299), (356, 309), (349, 299)], fill=(224, 255, 242, 248))
    # Lantern core highlight
    gd.ellipse([120, 121, 134, 135], fill=(230, 255, 246, 235))
    # Glowing jade eyes
    gd.ellipse([249, 131, 257, 137], fill=(176, 255, 228, 255))
    gd.ellipse([266, 131, 274, 137], fill=(176, 255, 228, 255))

    base_out.alpha_composite(glow_layer)
    return base_out


# ---------------------------------------------------------------------------
# 2. Runeword Plates (25 Runewords)
# ---------------------------------------------------------------------------

RUNEWORD_SPECS: List[Tuple[str, int, str, Tuple[int, int, int], Tuple[int, int, int], Tuple]] = [
    ("rw-stealth", 2, "cloak", (142, 92, 212), (218, 178, 255), OBSIDIAN_METAL),
    ("rw-steel", 2, "sword", (184, 198, 214), (240, 248, 255), IRON_METAL),
    ("rw-lore", 2, "helm", (166, 142, 246), (232, 218, 255), SILVER_METAL),
    ("rw-spirit-sword", 4, "crossed_swords", (88, 172, 255), (206, 242, 255), SILVER_METAL),
    ("rw-insight", 4, "halberd", (82, 214, 246), (218, 252, 255), GOLD_METAL),
    ("rw-ancients-pledge", 3, "shield", (214, 168, 72), (255, 232, 152), BRONZE_METAL),
    ("rw-rhyme", 2, "frost", (92, 198, 255), (222, 248, 255), SILVER_METAL),
    ("rw-smoke", 2, "plume", (134, 144, 168), (212, 220, 238), OBSIDIAN_METAL),
    ("rw-leaf", 2, "oak_leaf", (255, 114, 38), (255, 214, 108), BRONZE_METAL),
    ("rw-white", 2, "wand", (218, 212, 196), (118, 244, 196), SILVER_METAL),
    ("rw-treachery", 3, "poison", (96, 214, 108), (198, 255, 186), OBSIDIAN_METAL),
    ("rw-duress", 3, "spiked_plate", (112, 184, 244), (216, 244, 255), IRON_METAL),
    ("rw-sanctuary", 3, "sunburst", (242, 196, 86), (255, 244, 188), GOLD_METAL),
    ("rw-crescent-moon", 3, "crescent", (118, 212, 255), (236, 252, 255), SILVER_METAL),
    ("rw-call-to-arms", 5, "war_horn", (232, 76, 56), (255, 198, 128), GOLD_METAL),
    ("rw-enigma", 3, "winged_armor", (184, 106, 255), (242, 206, 255), GOLD_METAL),
    ("rw-infinity", 4, "lightning", (234, 186, 62), (255, 244, 174), OBSIDIAN_METAL),
    ("rw-fortitude", 4, "bastion", (218, 176, 84), (255, 238, 178), GOLD_METAL),
    ("rw-grief", 5, "astral_eye", (74, 218, 144), (196, 255, 218), OBSIDIAN_METAL),
    ("rw-heart-of-the-oak", 4, "flail", (114, 214, 92), (216, 252, 178), GOLD_METAL),
    ("rw-breath-of-the-dying", 6, "skull", (82, 236, 152), (208, 255, 224), OBSIDIAN_METAL),
    ("rw-faith", 4, "bow", (248, 202, 86), (255, 246, 194), GOLD_METAL),
    ("rw-chains-of-honor", 4, "chains", (226, 172, 74), (255, 234, 158), GOLD_METAL),
    ("rw-beast", 5, "axe", (232, 86, 52), (255, 188, 126), BRONZE_METAL),
    ("rw-death", 5, "scythe", (148, 122, 255), (222, 214, 255), OBSIDIAN_METAL),
]


def draw_runeword_icon(rw_id: str, rune_count: int, motif: str, acc: Tuple[int, int, int], acc_hi: Tuple[int, int, int], metal) -> Image.Image:
    p = IconPainter(rw_id, "tablet", metal, acc)
    p.draw_motif(motif, acc, acc_hi)
    # Render exact rune socket medallions along the bottom arc
    spacing = min(11.0, 54.0 / max(1, rune_count))
    start_x = 48.0 - (rune_count - 1) * spacing * 0.5
    h = stable_hash(rw_id)
    for idx in range(rune_count):
        rx = start_x + idx * spacing
        ry = 77.0 - abs(idx - (rune_count - 1) * 0.5) * 1.4
        p.ell((rx - 4.5, ry - 4.5, rx + 4.5, ry + 4.5), (34, 28, 32), outline=metal[1], width=1.0)
        p.draw_rune_glyph(rx, ry, 2.3, (h + idx) % 7, acc_hi)
    return p.finish(96)


# ---------------------------------------------------------------------------
# 3. Affix Seals (22 domain seals: prefix vs suffix)
# ---------------------------------------------------------------------------

AFFIX_DOMAINS: Dict[str, Tuple[str, Tuple[int, int, int], Tuple[int, int, int]]] = {
    "fire": ("flame", (246, 98, 38), (255, 212, 114)),
    "cold": ("frost", (78, 192, 255), (218, 248, 255)),
    "lightning": ("lightning", (128, 214, 255), (242, 252, 255)),
    "poison": ("poison", (102, 212, 88), (214, 252, 168)),
    "astral": ("astral_eye", (176, 112, 255), (238, 214, 255)),
    "physical": ("sword", (214, 174, 92), (255, 236, 178)),
    "defense": ("shield", (174, 194, 218), (238, 246, 255)),
    "vitality": ("crown", (222, 68, 72), (255, 176, 168)),
    "agility": ("wing", (124, 218, 128), (220, 255, 198)),
    "minion": ("skull", (112, 228, 176), (214, 255, 236)),
    "fortune": ("coins", (236, 192, 74), (255, 242, 178)),
}


def draw_affix_icon(kind: str, domain: str) -> Image.Image:
    motif, acc, acc_hi = AFFIX_DOMAINS[domain]
    frame = "hex" if kind == "prefix" else "diamond"
    metal = GOLD_METAL if kind == "prefix" else SILVER_METAL
    p = IconPainter(f"affix-{kind}-{domain}", frame, metal, acc)
    p.draw_motif(motif, acc, acc_hi)
    # Prefix indicator: twin upward forge chevrons at top; Suffix: twin seal ribbons at bottom
    if kind == "prefix":
        p.ln([(38, 22), (48, 15), (58, 22)], acc_hi, 2.0)
    else:
        p.ln([(38, 74), (48, 81), (58, 74)], acc_hi, 2.0)
    return p.finish(96)


# ---------------------------------------------------------------------------
# 4. Achievement Crests (categories x bronze/silver/gold)
# ---------------------------------------------------------------------------

ACH_CATEGORIES: Dict[str, Tuple[str, Tuple[int, int, int], Tuple[int, int, int]]] = {
    "combat": ("crossed_swords", (226, 86, 62), (255, 192, 148)),
    "campaign": ("shield", (218, 172, 76), (255, 236, 166)),
    "exploration": ("compass", (96, 198, 232), (212, 246, 255)),
    "economy": ("coins", (238, 194, 72), (255, 244, 176)),
    "codex": ("book", (166, 122, 242), (232, 214, 255)),
    "mastery": ("star", (248, 206, 92), (255, 248, 202)),
    "classes": ("helm", (184, 196, 214), (240, 248, 255)),
    "mercenaries": ("gauntlet", (196, 152, 86), (252, 226, 162)),
    "gear": ("anvil", (234, 134, 62), (255, 218, 148)),
    "secret": ("astral_eye", (178, 108, 248), (238, 214, 255)),
}

TIER_METALS = {
    "bronze": BRONZE_METAL,
    "silver": SILVER_METAL,
    "gold": GOLD_METAL,
}


def draw_achievement_icon(cat: str, tier: str) -> Image.Image:
    motif, acc, acc_hi = ACH_CATEGORIES[cat]
    metal = TIER_METALS[tier]
    p = IconPainter(f"ach-{cat}-{tier}", "circle", metal, acc)
    p.draw_motif(motif, acc, acc_hi)
    # Tier pips at top
    pip_count = 1 if tier == "bronze" else 2 if tier == "silver" else 3
    for i in range(pip_count):
        px = 48.0 + (i - (pip_count - 1) * 0.5) * 8.5
        p.jewel(px, 16.5, 2.3, acc_hi, (255, 252, 238))
    return p.finish(96)


# ---------------------------------------------------------------------------
# 5. Lore Emblems (8 Factions + Books, Codex, Quests, Landmarks, Endings)
# ---------------------------------------------------------------------------

FACTION_SPECS: Dict[str, Tuple[str, Tuple[int, int, int], Tuple[int, int, int], Tuple]] = {
    "fac-border-wardens": ("shield", (92, 186, 98), (214, 246, 168), BRONZE_METAL),
    "fac-redmarsh-caravaneers": ("coins", (226, 168, 68), (255, 232, 154), BRONZE_METAL),
    "fac-probate-scriptorium": ("skull", (182, 214, 188), (236, 248, 226), SILVER_METAL),
    "fac-oakhaven-maritime": ("anchor", (78, 178, 244), (208, 244, 255), GOLD_METAL),
    "fac-expelled-collegium": ("lightning", (118, 168, 255), (222, 242, 255), SILVER_METAL),
    "fac-ironcamp-smiths": ("anvil", (246, 118, 44), (255, 214, 128), IRON_METAL),
    "fac-scorched-penitents": ("flame", (236, 72, 48), (255, 194, 126), OBSIDIAN_METAL),
    "fac-first-watch-remnant": ("astral_eye", (196, 134, 255), (246, 226, 255), GOLD_METAL),
}

ACT_COLORS = {
    1: ((84, 176, 92), (204, 244, 172), BRONZE_METAL),
    2: ((226, 164, 68), (255, 230, 152), BRONZE_METAL),
    3: ((78, 182, 242), (212, 244, 255), SILVER_METAL),
    4: ((242, 92, 44), (255, 206, 122), GOLD_METAL),
}


def draw_lore_icons() -> List[Tuple[Path, Image.Image, str]]:
    out: List[Tuple[Path, Image.Image, str]] = []

    # 8 Faction banners
    for fid, (motif, acc, acc_hi, metal) in FACTION_SPECS.items():
        p = IconPainter(f"faction-{fid}", "banner", metal, acc)
        p.draw_motif(motif, acc, acc_hi)
        out.append((WIKI_ICONS_DIR / f"faction-{fid}.png", p.finish(96), f"Faction heraldry crest for {fid}"))

    # Special singletons
    for fname, frame, metal, motif, acc, acc_hi, note in [
        ("lore-timeline.png", "oct", GOLD_METAL, "hourglass", (226, 184, 84), (255, 242, 184), "Timeline chronicle hourglass crest"),
        ("lore-rumors.png", "circle", BRONZE_METAL, "lantern", (238, 164, 68), (255, 232, 162), "Tavern rumors lantern crest"),
        ("lore-ng-plus.png", "oct", OBSIDIAN_METAL, "crown", (224, 108, 255), (255, 222, 186), "Second Cycle endgame crest"),
    ]:
        p = IconPainter(fname, frame, metal, acc)
        p.draw_motif(motif, acc, acc_hi)
        out.append((WIKI_ICONS_DIR / fname, p.finish(96), note))

    # Act-keyed Lore Books, Side Quests, Landmarks, Act Endings, Act Epilogues
    # Distinct per-Act motifs so Act 1..4 emblems are recognizable by silhouette as well as hue.
    act_book_motif = {1: "oak_leaf", 2: "sunburst", 3: "anchor", 4: "flame"}
    act_quest_motif = {1: "scroll", 2: "compass", 3: "war_horn", 4: "crossed_swords"}
    act_landmark_motif = {1: "bastion", 2: "obelisk", 3: "lantern", 4: "crown"}
    for act, (acc, acc_hi, metal) in ACT_COLORS.items():
        for kind, fkind, motif, desc in [
            ("book", "tablet", act_book_motif[act], f"Act {act} illuminated lore book"),
            ("quest", "banner", act_quest_motif[act], f"Act {act} side quest writ"),
            ("landmark", "oct", act_landmark_motif[act], f"Act {act} weathered landmark obelisk"),
            ("act-ending", "shield", "crown", f"Act {act} chronicle ending banner"),
            ("act-epilogue", "circle", "star", f"Act {act} epilogue medallion"),
        ]:
            p = IconPainter(f"lore-{kind}-{act}", fkind, metal, acc)
            p.draw_motif(motif, acc, acc_hi)
            # Act numeral pips at bottom
            for i in range(act):
                px = 48.0 + (i - (act - 1) * 0.5) * 7.5
                p.jewel(px, 80.5, 2.0, acc_hi, (255, 252, 238))
            fname = f"lore-{kind}-act{act}.png" if kind in ("book", "quest", "landmark") else f"lore-{kind}-{act}.png"
            out.append((WIKI_ICONS_DIR / fname, p.finish(96), desc))

    # Codex entries by category
    codex_specs = {
        "lore": ("book", (196, 152, 246), (242, 224, 255), SILVER_METAL),
        "place": ("compass", (86, 194, 232), (212, 246, 255), BRONZE_METAL),
        "faction": ("shield", (218, 174, 78), (255, 238, 172), GOLD_METAL),
        "creature": ("skull", (228, 92, 74), (255, 194, 168), IRON_METAL),
        "event": ("hourglass", (236, 152, 64), (255, 226, 162), BRONZE_METAL),
        "relic": ("cube", (176, 124, 255), (242, 222, 255), GOLD_METAL),
    }
    for cat, (motif, acc, acc_hi, metal) in codex_specs.items():
        p = IconPainter(f"lore-codex-{cat}", "hex", metal, acc)
        p.draw_motif(motif, acc, acc_hi)
        out.append((WIKI_ICONS_DIR / f"lore-codex-{cat}.png", p.finish(96), f"Codex emblem for {cat}"))

    # Campaign Endings by class
    for cls, motif, acc, acc_hi, metal in [
        ("warrior", "crossed_swords", (226, 168, 72), (255, 234, 166), GOLD_METAL),
        ("archer", "bow", (118, 212, 108), (218, 252, 184), SILVER_METAL),
        ("mage", "staff", (112, 178, 255), (218, 244, 255), GOLD_METAL),
        ("necromancer", "skull", (102, 232, 182), (216, 255, 238), OBSIDIAN_METAL),
    ]:
        p = IconPainter(f"lore-ending-{cls}", "shield", metal, acc)
        p.draw_motif(motif, acc, acc_hi)
        out.append((WIKI_ICONS_DIR / f"lore-ending-{cls}.png", p.finish(96), f"Campaign finale crest for {cls}"))

    return out


# ---------------------------------------------------------------------------
# 6. Tip & Guide Plates (10 Categories)
# ---------------------------------------------------------------------------

TIP_SPECS: Dict[str, Tuple[str, str, Tuple[int, int, int], Tuple[int, int, int], Tuple]] = {
    "loading": ("circle", "hourglass", (218, 172, 84), (255, 236, 172), BRONZE_METAL),
    "combat": ("oct", "crossed_swords", (228, 86, 64), (255, 198, 148), IRON_METAL),
    "town": ("shield", "lantern", (236, 182, 78), (255, 236, 166), BRONZE_METAL),
    "hero": ("shield", "helm", (176, 196, 222), (238, 248, 255), SILVER_METAL),
    "items": ("oct", "coins", (238, 194, 72), (255, 244, 176), GOLD_METAL),
    "spells": ("hex", "staff", (142, 148, 255), (224, 232, 255), SILVER_METAL),
    "map": ("circle", "compass", (96, 198, 228), (214, 246, 255), BRONZE_METAL),
    "general": ("circle", "scroll", (214, 178, 112), (252, 234, 188), BRONZE_METAL),
    "guide": ("tablet", "book", (206, 166, 86), (252, 232, 174), GOLD_METAL),
    "epitaph": ("tablet", "gravestone", (142, 212, 168), (216, 248, 226), OBSIDIAN_METAL),
}


# ---------------------------------------------------------------------------
# 7. Glossary Lexicon Plates (All 41 Entries)
# ---------------------------------------------------------------------------

GLOSSARY_SPECS: List[Tuple[str, str, str, Tuple[int, int, int], Tuple[int, int, int], Tuple]] = [
    # 10 Spell schools
    ("school-fire", "circle", "flame", (255, 108, 36), (255, 218, 114), BRONZE_METAL),
    ("school-water", "circle", "frost", (78, 192, 255), (218, 248, 255), SILVER_METAL),
    ("school-air", "circle", "lightning", (148, 218, 255), (242, 252, 255), SILVER_METAL),
    ("school-earth", "circle", "obelisk", (124, 206, 88), (218, 250, 168), BRONZE_METAL),
    ("school-astral", "circle", "astral_eye", (186, 118, 255), (242, 218, 255), GOLD_METAL),
    ("school-marksman", "circle", "bow", (226, 188, 86), (255, 242, 178), BRONZE_METAL),
    ("school-wild", "circle", "wing", (104, 214, 112), (214, 252, 184), BRONZE_METAL),
    ("school-bone", "circle", "wand", (224, 216, 194), (252, 248, 236), OBSIDIAN_METAL),
    ("school-debt", "circle", "coins", (214, 172, 74), (255, 232, 148), GOLD_METAL),
    ("school-grave", "circle", "skull", (96, 228, 172), (214, 255, 234), OBSIDIAN_METAL),
    # 7 Rarities
    ("rarity-common", "diamond", "sword", (194, 194, 198), (242, 242, 246), IRON_METAL),
    ("rarity-magic", "diamond", "staff", (88, 152, 255), (208, 234, 255), SILVER_METAL),
    ("rarity-unique", "diamond", "crown", (236, 186, 68), (255, 242, 178), GOLD_METAL),
    ("rarity-set", "diamond", "armor", (88, 216, 102), (206, 255, 198), SILVER_METAL),
    ("rarity-base", "diamond", "anvil", (156, 148, 142), (214, 206, 198), IRON_METAL),
    ("rarity-socket", "diamond", "cube", (176, 124, 255), (238, 216, 255), SILVER_METAL),
    ("rarity-runeword", "diamond", "scroll", (242, 156, 56), (255, 226, 146), GOLD_METAL),
    # 2 Affix classes
    ("affix-prefix", "hex", "sword", (226, 184, 82), (255, 238, 176), GOLD_METAL),
    ("affix-suffix", "diamond", "scroll", (156, 188, 236), (228, 242, 255), SILVER_METAL),
    # 4 Difficulties
    ("difficulty-easy", "shield", "shield", (134, 198, 118), (218, 248, 196), BRONZE_METAL),
    ("difficulty-normal", "shield", "crossed_swords", (184, 198, 218), (238, 246, 255), SILVER_METAL),
    ("difficulty-hard", "shield", "flame", (236, 134, 54), (255, 218, 138), GOLD_METAL),
    ("difficulty-nightmare", "shield", "skull", (214, 62, 74), (255, 176, 182), OBSIDIAN_METAL),
    # 5 Champions
    ("champion-champion", "oct", "crown", (112, 176, 255), (216, 240, 255), SILVER_METAL),
    ("champion-berserker", "oct", "axe", (238, 76, 54), (255, 188, 136), IRON_METAL),
    ("champion-possessed", "oct", "astral_eye", (178, 96, 255), (236, 206, 255), OBSIDIAN_METAL),
    ("champion-fanatic", "oct", "wing", (246, 182, 58), (255, 238, 168), GOLD_METAL),
    ("champion-ghostly", "oct", "frost", (134, 228, 248), (226, 252, 255), SILVER_METAL),
    # 12 Elite Boss Affixes
    ("boss-mod-lightning-enchanted", "hex", "lightning", (104, 208, 255), (236, 252, 255), SILVER_METAL),
    ("boss-mod-cold-enchanted", "hex", "frost", (78, 192, 255), (222, 248, 255), SILVER_METAL),
    ("boss-mod-fire-enchanted", "hex", "flame", (255, 102, 36), (255, 214, 108), BRONZE_METAL),
    ("boss-mod-stone-skin", "hex", "obelisk", (156, 152, 146), (218, 214, 208), IRON_METAL),
    ("boss-mod-extra-fast", "hex", "wing", (128, 226, 142), (222, 255, 212), SILVER_METAL),
    ("boss-mod-extra-strong", "hex", "axe", (232, 88, 56), (255, 196, 142), BRONZE_METAL),
    ("boss-mod-mana-burn", "hex", "astral_eye", (88, 148, 255), (206, 234, 255), OBSIDIAN_METAL),
    ("boss-mod-cursed", "hex", "skull", (196, 98, 236), (242, 204, 255), OBSIDIAN_METAL),
    ("boss-mod-teleporting", "hex", "star", (166, 118, 255), (236, 216, 255), GOLD_METAL),
    ("boss-mod-spectral-hit", "hex", "wand", (112, 234, 214), (222, 255, 246), SILVER_METAL),
    ("boss-mod-multi-shot", "hex", "bow", (236, 184, 76), (255, 238, 172), BRONZE_METAL),
    ("boss-mod-aura-enchanted", "hex", "crown", (248, 206, 78), (255, 248, 196), GOLD_METAL),
    # 1 Cube
    ("crafting-cube", "plate", "cube", (226, 174, 78), (118, 224, 255), GOLD_METAL),
]


def register_assets(entries: List[Tuple[str, str]]) -> None:
    manifest = json.loads(ASSETS_JSON.read_text(encoding="utf-8"))
    by_path = {a["path"]: a for a in manifest["assets"]}
    for rel, note in entries:
        by_path[rel] = {
            "path": rel,
            "license": "own",
            "source": "tools/gen-wiki-art.py",
            "note": note,
        }
    manifest["assets"] = list(by_path.values())
    ASSETS_JSON.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def build_contact_sheets(out_dir: Path) -> List[Path]:
    """Build contact sheets pairing 8 reference itemicons with generated icon batches."""
    from PIL import ImageFont

    out_dir.mkdir(parents=True, exist_ok=True)
    refs = [
        "iron-sword.png",
        "star-staff.png",
        "aegis-of-the-citadel.png",
        "scroll-of-fire-bolt.png",
        "ossuary-seal-ring.png",
        "caldera-forged-armet.png",
        "ember-charm.png",
        "void-glass-shard.png",
    ]
    ref_ims = [(r[:-4], Image.open(PUBLIC / "itemicons" / r).convert("RGBA").resize((96, 96), Image.LANCZOS)) for r in refs]
    batches = {
        "runewords": sorted(WIKI_ICONS_DIR.glob("rw-*.png")),
        "affixes": sorted(WIKI_ICONS_DIR.glob("affix-*.png")),
        "achievements": sorted(WIKI_ICONS_DIR.glob("achievement-*.png")),
        "lore": sorted(WIKI_ICONS_DIR.glob("faction-*.png")) + sorted(WIKI_ICONS_DIR.glob("lore-*.png")),
        "tips": sorted(WIKI_ICONS_DIR.glob("tip-*.png")),
        "glossary": sorted(WIKI_ICONS_DIR.glob("glossary-*.png")),
    }
    font = ImageFont.load_default()
    written: List[Path] = []
    cols = 8
    cell_w, cell_h = 116, 126
    for name, paths in batches.items():
        items = [("REF:" + k, im) for k, im in ref_ims] + [(p.stem, Image.open(p).convert("RGBA").resize((96, 96), Image.LANCZOS)) for p in paths]
        rows = math.ceil(len(items) / cols)
        sheet = Image.new("RGBA", (cols * cell_w + 20, rows * cell_h + 20), (24, 19, 15, 255))
        draw = ImageDraw.Draw(sheet)
        for idx, (label, im) in enumerate(items):
            r, c = divmod(idx, cols)
            x0, y0 = 10 + c * cell_w + 10, 10 + r * cell_h + 4
            bg_col = (44, 34, 22, 255) if label.startswith("REF:") else (32, 26, 20, 255)
            draw.rectangle([x0 - 4, y0 - 2, x0 + 100, y0 + 114], fill=bg_col, outline=(110, 84, 48, 255))
            sheet.alpha_composite(im, (x0, y0))
            draw.text((x0, y0 + 98), label[:16], fill=(232, 216, 184, 255), font=font)
        dest = out_dir / f"contact-sheet-{name}.png"
        sheet.save(dest, "PNG")
        written.append(dest)
    return written


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--with-portrait", action="store_true", help="Also regenerate procedural portrait-necromancer.png")
    ap.add_argument("--contact-sheets", type=Path, default=None, help="Output directory for visual contact sheets")
    args = ap.parse_args()

    TOWNART_DIR.mkdir(parents=True, exist_ok=True)
    WIKI_ICONS_DIR.mkdir(parents=True, exist_ok=True)

    registered: List[Tuple[str, str]] = []

    if args.with_portrait:
        necro_path = TOWNART_DIR / "portrait-necromancer.png"
        generate_necromancer_portrait().save(necro_path, "PNG", optimize=True)
        registered.append(("public/townart/portrait-necromancer.png", "Dedicated full-body Necromancer class portrait"))

    # 2. Runeword plates
    for rw_id, r_cnt, motif, acc, acc_hi, metal in RUNEWORD_SPECS:
        p = WIKI_ICONS_DIR / f"{rw_id}.png"
        draw_runeword_icon(rw_id, r_cnt, motif, acc, acc_hi, metal).save(p, "PNG", optimize=True)
        registered.append((f"public/wiki/icons/{rw_id}.png", f"Runeword plate icon for {rw_id}"))

    # 3. Affix seals
    for kind in ("prefix", "suffix"):
        for domain in AFFIX_DOMAINS:
            fname = f"affix-{kind}-{domain}.png"
            draw_affix_icon(kind, domain).save(WIKI_ICONS_DIR / fname, "PNG", optimize=True)
            registered.append((f"public/wiki/icons/{fname}", f"Runic {kind} seal for {domain} affixes"))

    # 4. Achievement crests
    for cat in ACH_CATEGORIES:
        for tier in TIER_METALS:
            fname = f"achievement-{cat}-{tier}.png"
            draw_achievement_icon(cat, tier).save(WIKI_ICONS_DIR / fname, "PNG", optimize=True)
            registered.append((f"public/wiki/icons/{fname}", f"{tier.title()} achievement crest for {cat}"))

    # 5. Lore emblems
    for path, im, note in draw_lore_icons():
        im.save(path, "PNG", optimize=True)
        registered.append((f"public/wiki/icons/{path.name}", note))

    # 6. Tip & manual plates
    for cat, (frame, motif, acc, acc_hi, metal) in TIP_SPECS.items():
        fname = f"tip-{cat}.png"
        p = IconPainter(fname, frame, metal, acc)
        p.draw_motif(motif, acc, acc_hi)
        p.finish(96).save(WIKI_ICONS_DIR / fname, "PNG", optimize=True)
        registered.append((f"public/wiki/icons/{fname}", f"Compendium tip emblem for {cat}"))

    # 7. Glossary lexicon plates
    for gid, frame, motif, acc, acc_hi, metal in GLOSSARY_SPECS:
        fname = f"glossary-{gid}.png"
        p = IconPainter(fname, frame, metal, acc)
        p.draw_motif(motif, acc, acc_hi)
        p.finish(96).save(WIKI_ICONS_DIR / fname, "PNG", optimize=True)
        registered.append((f"public/wiki/icons/{fname}", f"Glossary lexicon plate for {gid}"))

    register_assets(registered)
    print(f"Generated and registered {len(registered)} wiki art assets (seed={SEED}).")
    if args.contact_sheets is not None:
        sheets = build_contact_sheets(args.contact_sheets)
        print(f"Saved {len(sheets)} contact sheets to {args.contact_sheets}")


if __name__ == "__main__":
    main()
