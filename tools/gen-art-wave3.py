"""Generate Wave 3 original dark-fantasy art assets for Thornvael.

Produces:
  1. Missing base item icons under public/itemicons/<slug>.png (189 icons; NEVER overwrites
     existing files listed in public/itemicons/manifest.json).
  2. public/art-wave3/env-anims.{png,json}       (WISHLIST C6: torches, banners, smoke, wheel, bonfire, cauldron)
  3. public/art-wave3/boss-telegraphs.{png,json} (WISHLIST B11: shared + 4 boss AoE decals & glyphs)
  4. public/art-wave3/city-buildings.{png,json}  (WISHLIST B5: 4-city building silhouettes x 5 roles)

Usage:
  python tools/gen-art-wave3.py
  python tools/gen-art-wave3.py --sync-assets
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ITEMICONS_DIR = PUBLIC / "itemicons"
WAVE3_DIR = PUBLIC / "art-wave3"
ASSETS_JSON = ROOT / "assets.json"
SEED = 202611193


# ---------------------------------------------------------------------------
# Shared Helpers
# ---------------------------------------------------------------------------

def slugify(s: str) -> str:
    s = str(s).lower().replace("'", "").replace("\u2019", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def stable_hash(key: str) -> int:
    digest = hashlib.sha256(f"{SEED}:{key}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "little")


def add_outline(im: Image.Image, outline_rgba: Tuple[int, int, int, int] = (16, 12, 16, 238)) -> Image.Image:
    """Add a crisp 1px dark outline around non-transparent pixels."""
    arr = np.asarray(im, dtype=np.uint8)
    alpha = arr[..., 3] > 36
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
    peak_alpha: int = 180,
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


def pack_pixi_atlas(
    frames: List[Tuple[str, Image.Image, Tuple[float, float]]],
    out_dir: Path,
    stem: str,
    max_width: int = 1024,
    pad: int = 2,
) -> dict:
    """Deterministic shelf-packer emitting RGBA8888 PNG + Pixi v8 JSON."""
    out_dir.mkdir(parents=True, exist_ok=True)
    ordered = sorted(frames, key=lambda item: (-item[1].height, -item[1].width, item[0]))

    x = pad
    y = pad
    row_h = 0
    placements: List[Tuple[str, Image.Image, Tuple[float, float], int, int]] = []
    used_w = 0

    for name, spr, anchor in ordered:
        w, h = spr.size
        if x + w + pad > max_width:
            x = pad
            y += row_h + pad
            row_h = 0
        placements.append((name, spr, anchor, x, y))
        used_w = max(used_w, x + w + pad)
        x += w + pad
        row_h = max(row_h, h)

    total_h = y + row_h + pad
    atlas_w = 1 << (max(64, used_w) - 1).bit_length()
    atlas_h = 1 << (max(64, total_h) - 1).bit_length()
    atlas_w = min(2048, atlas_w)
    atlas_h = min(2048, atlas_h)

    sheet = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    json_frames: Dict[str, dict] = {}

    for name, spr, (ax, ay), px, py in placements:
        sheet.paste(spr, (px, py))
        w, h = spr.size
        json_frames[name] = {
            "frame": {"x": px, "y": py, "w": w, "h": h},
            "sourceSize": {"w": w, "h": h},
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "rotated": False,
            "trimmed": False,
            "anchor": {"x": round(ax, 4), "y": round(ay, 4)},
        }

    png_path = out_dir / f"{stem}.png"
    json_path = out_dir / f"{stem}.json"
    sheet.save(png_path, "PNG", optimize=True)

    meta = {
        "frames": json_frames,
        "meta": {
            "app": "tools/gen-art-wave3.py",
            "version": "1.0",
            "image": f"{stem}.png",
            "format": "RGBA8888",
            "size": {"w": atlas_w, "h": atlas_h},
            "scale": 1,
        },
    }
    json_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return meta


# ---------------------------------------------------------------------------
# 1. Missing Base Item Icons (public/itemicons/<slug>.png)
# ---------------------------------------------------------------------------

TIER_METALS = [
    # (base, highlight, shadow, trim)
    ((146, 126, 108), (192, 168, 146), (86, 68, 56), (138, 104, 62)),   # T1: rusty / bog-iron / rawhide
    ((168, 178, 186), (222, 232, 240), (96, 106, 118), (168, 128, 72)),  # T2: forged iron / bronze
    ((194, 210, 224), (242, 250, 255), (108, 124, 142), (206, 166, 82)), # T3: tempered steel / silver
    ((228, 210, 152), (255, 246, 204), (138, 112, 64), (236, 194, 92)),  # T4: knightly gilt / electrum
    ((178, 198, 232), (236, 244, 255), (76, 86, 118), (244, 206, 108)),  # T5: star-iron / astral mithril
]

SCHOOL_COLORS = {
    "fire": ((255, 112, 34), (255, 224, 108), (132, 36, 18)),
    "water": ((74, 188, 255), (210, 246, 255), (26, 74, 136)),
    "air": ((164, 218, 255), (242, 252, 255), (66, 98, 148)),
    "earth": ((124, 214, 88), (218, 250, 168), (54, 98, 42)),
    "astral": ((188, 124, 255), (238, 214, 255), (84, 44, 134)),
    "bone": ((222, 214, 192), (250, 246, 232), (96, 88, 74)),
    "debt": ((214, 172, 74), (255, 232, 148), (94, 68, 28)),
    "grave": ((104, 228, 168), (206, 255, 226), (34, 86, 66)),
    "marksman": ((224, 194, 98), (255, 242, 176), (104, 82, 38)),
    "wild": ((118, 204, 92), (204, 246, 164), (48, 92, 36)),
}

ATTR_COLORS = {
    "body": ((224, 92, 54), (255, 186, 128)),
    "agility": ((132, 218, 86), (222, 255, 178)),
    "mind": ((156, 122, 255), (232, 216, 255)),
    "spirit": ((86, 226, 198), (206, 255, 242)),
}

DARK_OUTLINE = (24, 18, 18, 255)


def load_spell_school_map() -> Dict[str, str]:
    spells = json.loads((PUBLIC / "data" / "spells.json").read_text(encoding="utf-8")).get("spells", [])
    spells_new = json.loads((PUBLIC / "data" / "content" / "spells-new.json").read_text(encoding="utf-8"))
    return {sp["name"]: sp.get("school", "astral") for sp in spells + spells_new}


def infer_item_accent(it: dict, spell_schools: Dict[str, str]) -> Tuple[Tuple[int, int, int], Tuple[int, int, int]]:
    name = it.get("name", "").lower()
    if it.get("kind") == "learn":
        sc = spell_schools.get(it.get("spell", ""), "astral")
        c0, c1, _ = SCHOOL_COLORS.get(sc, SCHOOL_COLORS["astral"])
        return c0, c1
    if it.get("kind") == "potion":
        if "heal" in it or "healing" in name:
            return (218, 42, 52), (255, 158, 158)
        if "restore" in it or "mana" in name:
            return (44, 108, 228), (156, 222, 255)
        grow = it.get("grow", "body")
        return ATTR_COLORS.get(grow, ((236, 186, 68), (255, 242, 174)))
    if "ember" in name or "dragon" in name or "fire" in name or "blood" in name or "might" in name:
        return (232, 82, 42), (255, 198, 118)
    if "frost" in name or "ice" in name or "calm" in name:
        return (86, 198, 248), (218, 248, 255)
    if "storm" in name or "gale" in name or "wind" in name or "grace" in name:
        return (116, 222, 134), (220, 255, 196)
    if "stone" in name or "thorn" in name or "oak" in name or "ash" in name:
        return (126, 198, 86), (222, 246, 168)
    if "astral" in name or "star" in name or "cosmos" in name or "insight" in name or "archon" in name or "crystal" in name or "mystic" in name or "shadow" in name:
        return (176, 118, 248), (236, 212, 255)
    if it.get("cls") == "mage" or it.get("class_hint") == "mage":
        return (124, 144, 242), (214, 226, 255)
    if "res" in it:
        res = it["res"]
        if any(res):
            idx = res.index(max(res))
            key = ["fire", "water", "air", "earth", "astral"][min(4, idx)]
            c0, c1, _ = SCHOOL_COLORS[key]
            return c0, c1
    if "attr" in it and any(it["attr"]):
        idx = it["attr"].index(max(it["attr"]))
        key = ["body", "agility", "mind", "spirit"][min(3, idx)]
        return ATTR_COLORS[key]
    return (212, 168, 76), (255, 236, 164)


def draw_base_item_icon(it: dict, slug: str, spell_schools: Dict[str, str]) -> Image.Image:
    """Paint a crisp 64x64 RGBA item icon at 4x supersampling."""
    S = 4
    N = 64 * S
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    tier = max(1, min(5, int(it.get("tier", 1))))
    base_m, hi_m, sh_m, trim_m = TIER_METALS[tier - 1]
    acc, acc_hi = infer_item_accent(it, spell_schools)
    hval = stable_hash(slug)
    var = (hval % 5) - 2
    name = it.get("name", "").lower()
    kind = it.get("kind", "gear")
    slot = it.get("slot", "")
    cls = it.get("cls", it.get("class_hint", "both"))

    def sc(pts: Iterable[Tuple[float, float]]) -> List[Tuple[float, float]]:
        return [(x * S, y * S) for x, y in pts]

    def poly(pts, fill, outline=DARK_OUTLINE, width=1.6):
        d.polygon(sc(pts), fill=(*fill, 255) if len(fill) == 3 else fill, outline=outline, width=max(1, int(width * S)))

    def ell(box, fill, outline=DARK_OUTLINE, width=1.6):
        d.ellipse([c * S for c in box], fill=(*fill, 255) if len(fill) == 3 else fill, outline=outline, width=max(1, int(width * S)))

    def ln(pts, fill, width=1.5):
        d.line(sc(pts), fill=(*fill, 255) if len(fill) == 3 else fill, width=max(1, int(width * S)))

    def jewel(cx: float, cy: float, r: float = 4.0):
        ell((cx - r - 1.2, cy - r - 1.2, cx + r + 1.2, cy + r + 1.2), trim_m)
        ell((cx - r, cy - r, cx + r, cy + r), acc)
        ell((cx - r * 0.55, cy - r * 0.55, cx, cy), acc_hi, outline=None)

    # Subtle ground drop shadow
    ell((11, 51, 53, 59), (10, 8, 12, 115), outline=None)

    # --- CONSUMABLES ---
    if kind == "potion":
        if "elixir" in name:
            # Faceted apothecary elixir flask
            poly([(26, 12), (38, 12), (38, 22), (49, 36), (44, 54), (20, 54), (15, 36), (26, 22)], (188, 206, 214))
            poly([(19, 36), (45, 36), (41, 51), (23, 51)], acc, outline=None)
            poly([(25, 7), (39, 7), (37, 15), (27, 15)], trim_m)
            poly([(24, 19), (40, 19), (40, 23), (24, 23)], trim_m)
            poly([(32, 36), (38, 43), (32, 50), (26, 43)], acc_hi, outline=DARK_OUTLINE, width=1.0)
            ln([(26, 26), (20, 36), (23, 46)], (245, 250, 255), 1.6)
        elif "mana" in name:
            # Diamond-faceted sapphire flask
            neck_w = 5 if "greater" in name else 4
            poly([(32 - neck_w, 12), (32 + neck_w, 12), (32 + neck_w, 22), (48, 39), (42, 55), (22, 55), (16, 39), (32 - neck_w, 22)], (166, 194, 214))
            poly([(19, 38), (45, 38), (41, 52), (23, 52)], acc, outline=None)
            poly([(25, 7), (39, 7), (38, 14), (26, 14)], (124, 86, 52))
            poly([(25, 19), (39, 19), (39, 23), (25, 23)], trim_m)
            poly([(34, 38), (27, 45), (32, 45), (29, 51), (38, 42), (33, 42)], acc_hi, outline=None)
            ln([(26, 26), (21, 38)], (245, 252, 255), 1.8)
        else:
            # Round crimson healing draught flask
            r_x = 18 if "greater" in name else 15
            ell((32 - r_x, 22, 32 + r_x, 56), (192, 184, 174))
            ell((32 - r_x + 3, 30, 32 + r_x - 3, 53), acc, outline=None)
            poly([(26, 11), (38, 11), (38, 25), (26, 25)], (192, 184, 174))
            poly([(25, 6), (39, 6), (38, 13), (26, 13)], (134, 92, 54))
            poly([(25, 18), (39, 18), (39, 22), (25, 22)], trim_m)
            poly([(29, 36), (35, 36), (35, 40), (39, 40), (39, 45), (35, 45), (35, 49), (29, 49), (29, 45), (25, 45), (25, 40), (29, 40)], (255, 236, 206), outline=None)
            ln([(22, 28), (19, 38)], (255, 248, 235), 1.8)

    elif kind == "learn":
        is_tome = "tome" in name or int(it.get("w", 1)) > 1
        if is_tome:
            # Heavy leather-bound spell tome with school sigil & brass bosses
            poly([(13, 14), (42, 8), (54, 16), (50, 52), (22, 58), (12, 50)], (82, 52, 38))
            poly([(17, 16), (48, 11), (47, 48), (19, 54)], (232, 214, 176))
            poly([(21, 18), (51, 13), (49, 49), (20, 55)], acc)
            poly([(21, 18), (27, 17), (26, 54), (20, 55)], sh_m)
            ln([(28, 24), (45, 20), (44, 44), (28, 48), (28, 24)], trim_m, 1.2)
            jewel(36, 34, 5.5)
            poly([(45, 29), (53, 28), (53, 35), (45, 36)], trim_m)
        else:
            # Unrolled vellum spell scroll with colored ribbon & seal
            poly([(17, 12), (48, 12), (44, 28), (42, 48), (13, 48), (16, 29)], (232, 210, 166))
            ell((10, 10, 20, 20), (210, 184, 136))
            ell((40, 46, 52, 55), (210, 184, 136))
            poly([(26, 13), (33, 13), (31, 47), (24, 47)], acc, outline=DARK_OUTLINE, width=1.0)
            ln([(19, 22), (37, 22)], (126, 98, 64), 1.3)
            ln([(19, 27), (35, 27)], (126, 98, 64), 1.3)
            ln([(18, 39), (35, 39)], (126, 98, 64), 1.3)
            jewel(29, 33, 4.5)

    # --- WEAPONS ---
    elif slot == "weapon":
        if "bow" in name or "arbalest" in name:
            if "arbalest" in name:
                # Heavy crossbow / arbalest
                ln([(14, 50), (48, 16)], (104, 68, 42), 4.5)
                ln([(24, 14), (50, 40)], base_m, 3.2)
                ln([(24, 14), (16, 48)], (234, 228, 212), 1.3)
                ln([(50, 40), (16, 48)], (234, 228, 212), 1.3)
                poly([(42, 18), (52, 12), (46, 24)], hi_m)
                poly([(28, 32), (34, 38), (30, 42), (24, 36)], trim_m)
            else:
                # Curved wooden/composite bow + taut string + arrow
                bow_col = (146, 98, 54) if "ash" in name else (112, 68, 38) if "recurve" in name else trim_m
                d.arc([10 * S, 10 * S, 52 * S, 54 * S], 250, 110, fill=(*bow_col, 255), width=4 * S)
                ln([(22, 13), (22, 51)], (240, 234, 218), 1.3)
                ln([(16, 32), (52, 32)], (188, 152, 104), 1.8)
                poly([(48, 28), (57, 32), (48, 36)], hi_m)
                if tier >= 4:
                    jewel(42, 22, 2.5)
        elif "staff" in name:
            # Mage quarterstaff with ornate head & glowing orb/rune
            shaft = (122, 84, 52) if "oak" in name or "ash" in name else (92, 66, 46)
            ln([(16, 56), (42, 18)], shaft, 3.4)
            ln([(18, 54), (40, 21)], (176, 134, 92), 1.2)
            poly([(36, 18), (44, 9), (53, 14), (46, 25)], trim_m)
            jewel(44, 16, 4.8)
            if "thorn" in name:
                ln([(34, 28), (28, 24)], (82, 154, 68), 1.6)
                ln([(31, 36), (38, 40)], (82, 154, 68), 1.6)
        elif "wand" in name:
            # Sleek enchanted wand with glowing crystal focus tip
            shaft = (128, 92, 58) if "willow" in name or "yew" in name else (86, 54, 48)
            ln([(14, 52), (44, 20)], shaft, 2.8)
            ln([(24, 41), (28, 43)], trim_m, 1.4)
            ln([(32, 33), (36, 35)], trim_m, 1.4)
            poly([(41, 16), (48, 10), (54, 16), (47, 23)], trim_m)
            jewel(48, 16, 4.2)
        elif "axe" in name or "decapitator" in name:
            # Battleaxe / broadaxe / double-bit decapitator
            ln([(15, 56), (45, 16)], (118, 78, 46), 3.4)
            if "decapitator" in name or "crescent" in name:
                poly([(36, 12), (55, 10), (54, 28), (38, 25)], base_m)
                poly([(48, 11), (55, 10), (54, 28), (47, 26)], hi_m, outline=None)
            if "decapitator" in name:
                poly([(24, 16), (38, 25), (34, 34), (20, 26)], base_m)
            else:
                poly([(36, 14), (54, 14), (52, 31), (36, 26)], base_m)
                ln([(53, 14), (51, 31)], hi_m, 1.5)
            poly([(36, 21), (43, 15), (46, 18), (39, 25)], trim_m)
        elif any(w in name for w in ("cudgel", "mace", "morningstar", "warhammer", "greatmaul")):
            # Heavy blunt weapon
            ln([(16, 55), (41, 24)], (112, 74, 46) if "cudgel" in name else sh_m, 3.2)
            if "warhammer" in name or "greatmaul" in name:
                wcol = (54, 52, 64) if "obsidian" in name else base_m
                poly([(31, 14), (48, 6), (55, 17), (38, 25)], wcol)
                poly([(46, 8), (54, 15), (49, 19), (42, 12)], hi_m, outline=None)
                if "obsidian" in name:
                    jewel(43, 16, 3.2)
            else:
                ell((34, 10, 52, 28), base_m)
                for sx, sy in [(43, 6), (54, 18), (31, 18), (51, 9)]:
                    poly([(43, 19), (sx, sy), (46, 21)], hi_m, width=0.9)
                jewel(43, 19, 2.8)
        elif any(w in name for w in ("stiletto", "rondel", "poignard", "main-gauche", "dirk", "needle")):
            # Dagger / stiletto / rapier-needle
            poly([(18, 46), (48, 12), (53, 9), (49, 17), (22, 49)], hi_m)
            ln([(21, 45), (49, 13)], (255, 255, 255), 1.1)
            if "main-gauche" in name:
                d.arc([12 * S, 36 * S, 28 * S, 52 * S], 40, 230, fill=(*trim_m, 255), width=2 * S)
            poly([(14, 40), (27, 51), (24, 54), (11, 43)], trim_m)
            ln([(18, 46), (11, 55)], (86, 54, 36), 3.0)
            ell((8, 53, 14, 59), trim_m)
        elif any(w in name for w in ("claymore", "greatsword", "flamberge", "executioner", "zweihander")):
            # Two-handed greatsword (wavy flame-blade for flamberge)
            if "flamberge" in name:
                poly([(16, 46), (25, 33), (29, 31), (36, 21), (41, 19), (47, 10), (55, 6), (52, 16), (45, 22), (41, 27), (34, 34), (30, 39), (22, 51)], base_m)
                ln([(21, 44), (32, 30), (48, 11)], hi_m, 1.5)
            else:
                poly([(16, 46), (46, 8), (55, 6), (52, 16), (22, 51)], base_m)
                poly([(19, 44), (48, 9), (53, 8), (22, 47)], hi_m, outline=None)
            poly([(11, 37), (32, 52), (28, 55), (8, 40)], trim_m)
            ln([(19, 47), (9, 57)], (94, 58, 36), 3.4)
            ell((6, 54, 13, 60), trim_m)
            jewel(20, 44, 2.4)
        else:
            # Classic arming sword (Rusty / Iron / Steel / Knight / Thorn Blade)
            poly([(18, 43), (43, 11), (53, 7), (50, 18), (25, 48)], base_m)
            poly([(21, 41), (45, 12), (51, 9), (24, 45)], hi_m, outline=None)
            if "rusty" in name:
                ell((31, 23, 37, 29), (138, 72, 38), outline=None)
                ell((24, 33, 29, 38), (138, 72, 38), outline=None)
            poly([(14, 39), (30, 49), (27, 53), (11, 43)], trim_m)
            ln([(19, 46), (11, 56)], (104, 66, 40), 3.2)
            ell((8, 53, 14, 59), trim_m)
            if "thorn" in name or "knight" in name:
                jewel(21, 45, 2.6)

    # --- SHIELDS & FOCI ---
    elif slot == "shield":
        if any(w in name for w in ("focus", "sphere", "mirror", "cosmos")):
            if "mirror" in name:
                ell((14, 10, 50, 46), trim_m)
                ell((19, 15, 45, 41), (146, 212, 246))
                ln([(23, 22), (34, 34)], (255, 255, 255), 1.8)
                ln([(29, 46), (29, 57)], trim_m, 3.2)
            else:
                # Astral sphere / glass focus / Eye of the Cosmos
                ell((13, 13, 51, 51), trim_m, width=1.4)
                ell((16, 16, 48, 48), acc)
                ell((21, 20, 35, 32), acc_hi, outline=None)
                if "cosmos" in name or "sphere" in name:
                    d.arc([9 * S, 22 * S, 55 * S, 42 * S], 160, 20, fill=(*trim_m, 255), width=2 * S)
        elif "buckler" in name:
            # Round buckler with central iron boss
            b_col = (126, 86, 52) if "wooden" in name else base_m
            ell((12, 12, 52, 52), trim_m)
            ell((16, 16, 48, 48), b_col)
            ell((25, 25, 39, 39), hi_m)
            jewel(32, 32, 3.0)
        elif "tower" in name or "aegis" in name:
            # Tall tower / pavise shield
            poly([(13, 9), (51, 9), (49, 44), (32, 57), (15, 44)], trim_m)
            poly([(17, 13), (47, 13), (45, 42), (32, 52), (19, 42)], base_m)
            poly([(29, 14), (35, 14), (35, 48), (29, 48)], trim_m, outline=None)
            poly([(18, 26), (46, 26), (46, 32), (18, 32)], trim_m, outline=None)
            jewel(32, 29, 4.0)
        else:
            # Heater / kite shield
            poly([(12, 11), (52, 11), (48, 36), (32, 56), (16, 36)], trim_m)
            poly([(16, 15), (48, 15), (44, 34), (32, 50), (20, 34)], base_m)
            poly([(32, 15), (48, 15), (44, 34), (32, 50)], sh_m, outline=None)
            jewel(32, 30, 4.2)

    # --- HELMS ---
    elif slot == "helm":
        if "circlet" in name or "diadem" in name:
            poly([(13, 38), (18, 22), (25, 32), (32, 14), (39, 32), (46, 22), (51, 38), (32, 44)], trim_m)
            poly([(16, 36), (32, 41), (48, 36), (46, 31), (32, 35), (18, 31)], base_m, outline=None)
            jewel(32, 27, 4.2)
            jewel(21, 34, 2.4)
            jewel(43, 34, 2.4)
        elif "hat" in name:
            # Pointed wizard/scholar hat
            poly([(20, 40), (30, 8), (44, 17), (35, 22), (44, 40)], acc)
            ell((8, 38, 56, 52), acc)
            poly([(18, 38), (46, 38), (47, 43), (17, 43)], trim_m)
            jewel(32, 40, 2.8)
        elif "hood" in name or "cowl" in name or "mask" in name:
            col = (58, 50, 62) if "shadow" in name else (112, 82, 56) if "stalker" in name else acc
            poly([(15, 48), (16, 22), (32, 9), (48, 22), (49, 48), (32, 54)], col)
            ell((21, 20, 43, 42), (22, 18, 24))
            if "mask" in name:
                poly([(22, 29), (42, 29), (39, 43), (25, 43)], trim_m)
                ell((25, 31, 30, 35), acc_hi, outline=None)
                ell((34, 31, 39, 35), acc_hi, outline=None)
            else:
                ln([(20, 20), (32, 11), (44, 20)], trim_m, 1.5)
        elif "cap" in name:
            ell((14, 17, 50, 49), (124, 82, 48))
            poly([(13, 35), (51, 35), (49, 44), (15, 44)], (92, 58, 34))
            ln([(20, 24), (32, 18), (44, 24)], trim_m, 1.4)
        else:
            # Iron / Steel / Basinet / Dread Crest helm
            poly([(15, 48), (16, 26), (22, 12), (32, 9), (42, 12), (48, 26), (49, 48), (36, 53), (34, 39), (30, 39), (28, 53)], base_m)
            poly([(29, 10), (35, 10), (35, 38), (29, 38)], trim_m)
            poly([(19, 28), (28, 30), (27, 36), (19, 34)], (20, 18, 22), outline=None)
            poly([(36, 30), (45, 28), (45, 34), (37, 36)], (20, 18, 22), outline=None)
            if "dread" in name:
                poly([(26, 12), (32, 3), (38, 12)], acc)

    # --- ARMOR / ROBES ---
    elif slot == "armor":
        if "robe" in name or "mantle" in name:
            r_col = acc if ("star" in name or "mystic" in name or "mage" in name) else (106, 94, 82)
            poly([(22, 10), (42, 10), (54, 30), (45, 36), (41, 28), (46, 54), (18, 54), (23, 28), (19, 36), (10, 30)], r_col)
            poly([(25, 11), (32, 23), (39, 11), (36, 53), (28, 53)], (46, 38, 48))
            poly([(21, 31), (43, 31), (43, 36), (21, 36)], trim_m)
            jewel(32, 33, 3.0)
        elif "jerkin" in name or "studded" in name or "brigandine" in name or "dragon" in name:
            l_col = (128, 52, 38) if "dragon" in name else (112, 76, 46)
            poly([(16, 14), (25, 10), (39, 10), (48, 14), (53, 27), (44, 32), (43, 53), (21, 53), (20, 32), (11, 27)], l_col)
            poly([(28, 14), (36, 14), (36, 52), (28, 52)], trim_m)
            if "studded" in name or "brigandine" in name:
                for sx in (24, 40):
                    for sy in (22, 32, 42):
                        ell((sx - 1.5, sy - 1.5, sx + 1.5, sy + 1.5), hi_m, outline=None)
        else:
            # Chain mail / ring mail / plate armor / wyrmscale cuirass
            poly([(12, 15), (23, 10), (41, 10), (52, 15), (56, 29), (45, 34), (43, 53), (21, 53), (19, 34), (8, 29)], trim_m)
            poly([(22, 16), (42, 16), (44, 34), (40, 48), (24, 48), (20, 34)], base_m)
            poly([(32, 17), (42, 16), (44, 34), (40, 48), (32, 48)], sh_m, outline=None)
            poly([(20, 46), (44, 46), (43, 53), (21, 53)], trim_m)
            if "chain" in name or "ring" in name:
                for sy in range(21, 44, 6):
                    ln([(24, sy), (40, sy)], hi_m, 1.0)

    # --- BOOTS ---
    elif slot == "boots":
        if "sandals" in name or "slippers" in name or "walkers" in name:
            col = acc if "astral" in name or "scholar" in name else (136, 94, 58)
            poly([(14, 36), (32, 30), (48, 42), (48, 52), (14, 52)], col)
            poly([(13, 48), (49, 48), (49, 53), (13, 53)], (62, 44, 30))
            ln([(20, 34), (30, 42), (24, 48)], trim_m, 1.4)
        else:
            b_col = base_m if ("iron" in name or "steel" in name or "greaves" in name) else (116, 76, 46)
            poly([(15, 13), (30, 13), (28, 39), (34, 44), (34, 52), (10, 52), (11, 45), (17, 38)], b_col)
            poly([(35, 10), (50, 11), (47, 39), (55, 44), (55, 52), (32, 52), (33, 44), (38, 37)], b_col)
            poly([(15, 14), (30, 14), (29, 21), (16, 21)], trim_m)
            poly([(35, 12), (50, 13), (49, 20), (36, 19)], trim_m)
            if "swift" in name or "windrunner" in name:
                poly([(12, 24), (20, 18), (18, 30)], acc_hi)

    # --- GLOVES ---
    elif slot == "gloves":
        g_col = acc if ("silk" in name or "velvet" in name or "archon" in name or "wraps" in name) else base_m if ("gauntlet" in name or "vambrace" in name) else (122, 82, 48)
        poly([(16, 32), (46, 32), (47, 52), (15, 52)], g_col)
        for i in range(4):
            fx = 17 + i * 7.5
            fy = 13 + abs(i - 1.5) * 2
            poly([(fx, fy), (fx + 5.5, fy), (fx + 5.5, 33), (fx, 33)], g_col)
        poly([(15, 42), (47, 42), (47, 49), (15, 49)], trim_m)

    # --- RINGS ---
    elif slot == "ring":
        r_col = (196, 126, 72) if "copper" in name else (220, 212, 192) if "bone" in name else trim_m
        ell((14, 18, 50, 54), r_col)
        ell((22, 26, 42, 46), (0, 0, 0, 0), outline=DARK_OUTLINE, width=1.4)
        if "band" not in name or "signet" in name or tier >= 3:
            poly([(23, 14), (28, 9), (36, 9), (41, 14), (37, 23), (27, 23)], r_col)
            jewel(32, 16, 4.2)

    # --- AMULETS / CHARMS / BELTS ---
    elif slot == "belt":
        poly([(7, 25), (57, 25), (57, 39), (7, 39)], (114, 74, 44))
        poly([(24, 21), (40, 21), (40, 43), (24, 43)], trim_m)
        ell((28, 28, 36, 36), acc)
    else:
        # Amulets, charms, lockets, talismans, medallions
        ln([(17, 8), (32, 34), (47, 8)], trim_m, 2.2)
        if "choker" in name:
            d.arc([14 * S, 12 * S, 50 * S, 36 * S], 0, 180, fill=(*trim_m, 255), width=3 * S)
        poly([(32, 31), (46, 42), (41, 56), (23, 56), (18, 42)], trim_m)
        poly([(32, 35), (41, 43), (38, 52), (26, 52), (23, 43)], acc)
        jewel(32, 44, 3.6)

    # Subtle tier rivets along very bottom
    for i in range(tier):
        cx = 32 + (i - (tier - 1) / 2.0) * 5.2
        ell((cx - 1.3, 58.8, cx + 1.3, 61.4), (236, 200, 124), outline=(42, 32, 22, 230), width=0.5)

    # Small deterministic glint dot on higher tiers
    if tier >= 4:
        gx = 24 + (var * 3)
        gy = 22 - (var * 2)
        ln([(gx - 2, gy), (gx + 2, gy)], (255, 252, 235), 0.9)
        ln([(gx, gy - 2), (gx, gy + 2)], (255, 252, 235), 0.9)

    return im.resize((64, 64), Image.LANCZOS)


def build_missing_itemicons() -> List[str]:
    manifest_path = ITEMICONS_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    protected_files = {f"{item_id}.png" for item_id in manifest.get("ids", [])}
    protected_files.add("manifest.json")

    items_json = json.loads((PUBLIC / "data" / "items.json").read_text(encoding="utf-8")).get("items", [])
    base_items = json.loads((PUBLIC / "data" / "content" / "base-items.json").read_text(encoding="utf-8"))
    spell_schools = load_spell_school_map()

    targets: List[Tuple[str, dict]] = []
    seen_slugs = set()

    for it in items_json:
        sl = slugify(it["name"])
        fn = f"{sl}.png"
        if fn in protected_files or sl in seen_slugs:
            continue
        seen_slugs.add(sl)
        targets.append((sl, it))

    for b in base_items:
        sl = slugify(b["name"])
        fn = f"{sl}.png"
        if fn in protected_files or sl in seen_slugs:
            continue
        seen_slugs.add(sl)
        targets.append((sl, b))

    written: List[str] = []
    for sl, it in targets:
        out_path = ITEMICONS_DIR / f"{sl}.png"
        if out_path.name in protected_files:
            raise RuntimeError(f"Refusing to overwrite protected icon: {out_path.name}")
        icon_im = draw_base_item_icon(it, sl, spell_schools)
        icon_im.save(out_path, "PNG", optimize=True)
        written.append(f"public/itemicons/{sl}.png")

    return written


# ---------------------------------------------------------------------------
# 2. Environmental Animations (public/art-wave3/env-anims.{png,json})
# ---------------------------------------------------------------------------

def build_env_anims() -> Tuple[dict, List[str]]:
    frames: List[Tuple[str, Image.Image, Tuple[float, float]]] = []

    # A. Torch flicker (6 frames, 48x64)
    for i in range(6):
        phase = i / 6.0 * math.pi * 2
        sway = math.sin(phase) * 2.5
        tall = math.cos(phase * 2) * 2.5
        im = Image.new("RGBA", (48, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        # Iron post & torch sconce
        d.rectangle([22, 34, 26, 60], fill=(74, 52, 36, 255))
        d.rectangle([20, 30, 28, 35], fill=(64, 68, 76, 255))
        d.polygon([(19, 25), (29, 25), (27, 32), (21, 32)], fill=(86, 90, 98, 255))
        im = add_outline(im)
        # Animated flame & sparks
        im.alpha_composite(radial_glow((48, 64), (24 + sway * 0.4, 20), 20, (255, 130, 32), 145))
        fd = ImageDraw.Draw(im)
        fd.polygon(
            [(18, 26), (24 + sway, 9 - tall), (30, 26), (24, 30)],
            fill=(248, 108, 24, 245),
        )
        fd.polygon(
            [(20, 25), (24 + sway * 0.6, 14 - tall * 0.6), (28, 25), (24, 28)],
            fill=(255, 224, 96, 255),
        )
        # Rising ember spark
        sy = int(20 - ((i * 3) % 14))
        sx = int(24 + math.sin(phase + 1.2) * 5)
        fd.ellipse([sx - 1, sy - 1, sx + 1, sy + 1], fill=(255, 232, 120, 230))
        frames.append((f"torch-flicker/{i}", im, (0.5, 0.88)))

    # B. Faction banners (3 factions x 4 frames, 48x72)
    banner_specs = [
        ("thornwatch", (42, 114, 68), (64, 152, 92), (218, 196, 114)),
        ("ironbound", (148, 34, 38), (192, 54, 54), (222, 178, 76)),
        ("conclave", (54, 64, 136), (82, 96, 178), (94, 222, 246)),
    ]
    for faction, cloth_dark, cloth_hi, trim in banner_specs:
        for i in range(4):
            phase = (i / 4.0) * math.pi * 2
            im = Image.new("RGBA", (48, 72), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            # Pole + finial + crossbar
            d.rectangle([10, 6, 14, 68], fill=(104, 72, 44, 255))
            d.polygon([(9, 8), (12, 2), (15, 8)], fill=(*trim, 255))
            d.rectangle([10, 12, 38, 15], fill=(142, 112, 72, 255))
            # Rippling pennant body row by row
            for ry in range(15, 56):
                t = (ry - 15) / 41.0
                wave = math.sin(phase - t * 3.8) * (2.6 * t)
                left_x = int(14 + wave * 0.45)
                right_x = int(36 + wave)
                if ry > 46:
                    # Swallowtail notch
                    notch = (ry - 46) * 0.9
                    mid = (left_x + right_x) // 2
                    col = cloth_hi if math.sin(phase - t * 3.8 + 0.7) > 0 else cloth_dark
                    if mid - notch > left_x:
                        d.line([(left_x, ry), (int(mid - notch), ry)], fill=(*col, 255), width=1)
                    if right_x > mid + notch:
                        d.line([(int(mid + notch), ry), (right_x, ry)], fill=(*col, 255), width=1)
                else:
                    col = cloth_hi if math.sin(phase - t * 3.8 + 0.7) > 0 else cloth_dark
                    d.line([(left_x, ry), (right_x, ry)], fill=(*col, 255), width=1)
                    if 22 <= ry <= 34:
                        d.line([(left_x + 7, ry), (left_x + 11, ry)], fill=(*trim, 255), width=1)
            frames.append((f"banner/{faction}/{i}", add_outline(im), (0.5, 0.94)))

    # C. Smoke column (6 frames, 48x80)
    for i in range(6):
        im = Image.new("RGBA", (48, 80), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        for p in range(5):
            frac = ((p / 5.0) + (i / 6.0) / 5.0 * 5.0) % 1.0
            cy = 72 - frac * 62
            cx = 24 + math.sin(frac * math.pi * 2 + p) * (4 + frac * 4)
            rad = 5 + frac * 11
            alpha = int(max(0, min(195, math.sin(frac * math.pi) * 200)))
            shade = int(136 + frac * 54)
            d.ellipse(
                [cx - rad, cy - rad * 0.85, cx + rad, cy + rad * 0.85],
                fill=(shade, shade + 2, shade + 6, alpha),
            )
        im = im.filter(ImageFilter.GaussianBlur(0.8))
        frames.append((f"smoke-column/{i}", im, (0.5, 0.92)))

    # D. Water wheel (6 frames, 64x64)
    for i in range(6):
        ang_off = (i / 6.0) * (math.pi / 4.0)  # 45 deg spacing -> seamless 8-spoke loop
        im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        cx, cy = 32, 30
        # Stone axle bracket
        d.polygon([(12, 48), (18, 28), (24, 28), (22, 48)], fill=(96, 94, 98, 255))
        d.polygon([(40, 28), (46, 28), (52, 48), (42, 48)], fill=(84, 82, 86, 255))
        # Outer rim & paddles
        d.ellipse([10, 8, 54, 52], outline=(98, 66, 38, 255), width=5)
        for sp in range(8):
            a = ang_off + sp * (math.pi / 4.0)
            px = cx + math.cos(a) * 24
            py = cy + math.sin(a) * 24
            d.line([(cx, cy), (px, py)], fill=(122, 84, 48, 255), width=3)
            # Wooden paddle blade
            nx, ny = -math.sin(a) * 4, math.cos(a) * 4
            d.polygon(
                [
                    (px - nx, py - ny),
                    (px + nx, py + ny),
                    (px + nx - math.cos(a) * 5, py + ny - math.sin(a) * 5),
                    (px - nx - math.cos(a) * 5, py - ny - math.sin(a) * 5),
                ],
                fill=(146, 102, 62, 255),
            )
        d.ellipse([27, 25, 37, 35], fill=(138, 142, 150, 255))
        im = add_outline(im)
        # Water foam splash at base trough
        wd = ImageDraw.Draw(im)
        for sp in range(5):
            sx = 18 + sp * 7 + int(math.sin(ang_off * 2 + sp) * 2)
            sy = 52 + ((sp + i) % 3) * 2
            wd.ellipse([sx - 3, sy - 2, sx + 3, sy + 2], fill=(214, 242, 255, 200))
        frames.append((f"water-wheel/{i}", im, (0.5, 0.75)))

    # E. Bonfire (6 frames, 64x64)
    for i in range(6):
        phase = (i / 6.0) * math.pi * 2
        im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        for k in range(8):
            a = k * (math.pi / 4.0)
            rx = 32 + math.cos(a) * 19
            ry = 48 + math.sin(a) * 8
            d.ellipse([rx - 5, ry - 3, rx + 5, ry + 3], fill=(92, 90, 96, 255))
        d.line([(17, 50), (47, 36)], fill=(96, 58, 32, 255), width=5)
        d.line([(17, 36), (47, 50)], fill=(76, 46, 26, 255), width=5)
        im = add_outline(im)
        im.alpha_composite(radial_glow((64, 64), (32, 32), 26, (255, 136, 36), 140))
        fd = ImageDraw.Draw(im)
        s1 = math.sin(phase) * 3
        s2 = math.cos(phase + 1.1) * 3
        fd.polygon([(18, 42), (32 + s1, 10), (46, 42)], fill=(238, 86, 22, 240))
        fd.polygon([(22, 42), (27 + s2, 16), (35, 42)], fill=(255, 162, 36, 245))
        fd.polygon([(26, 42), (32 - s1 * 0.5, 22), (38, 42)], fill=(255, 232, 112, 255))
        for sp in range(3):
            ey = 30 - ((i * 4 + sp * 7) % 22)
            ex = 28 + sp * 4 + int(math.sin(phase + sp) * 4)
            fd.ellipse([ex - 1, ey - 1, ex + 1, ey + 1], fill=(255, 228, 108, 235))
        frames.append((f"bonfire/{i}", im, (0.5, 0.86)))

    # F. Cauldron (6 frames, 56x64)
    for i in range(6):
        phase = (i / 6.0) * math.pi * 2
        im = Image.new("RGBA", (56, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        # Ember coals below pot
        d.ellipse([18, 49, 38, 56], fill=(235, 78, 22, 210))
        # Tripod legs & iron pot
        d.line([(16, 42), (12, 57)], fill=(48, 50, 56, 255), width=3)
        d.line([(40, 42), (44, 57)], fill=(48, 50, 56, 255), width=3)
        d.ellipse([12, 24, 44, 52], fill=(56, 58, 66, 255))
        d.ellipse([14, 21, 42, 32], fill=(78, 82, 92, 255))
        im = add_outline(im)
        # Bubbling green brew + steam puffs
        im.alpha_composite(radial_glow((56, 64), (28, 24), 18, (88, 235, 112), 125))
        bd = ImageDraw.Draw(im)
        bd.ellipse([16, 23, 40, 30], fill=(76, 218, 96, 245))
        for b in range(3):
            bx = 21 + b * 7
            by = 25 - ((i + b * 2) % 4) * 2
            br = 2 + ((i + b) % 2)
            bd.ellipse([bx - br, by - br, bx + br, by + br], fill=(166, 255, 148, 230))
        sy = 16 - ((i * 2) % 10)
        sx = 28 + int(math.sin(phase) * 4)
        bd.ellipse([sx - 4, sy - 3, sx + 4, sy + 3], fill=(154, 248, 168, 125))
        frames.append((f"cauldron/{i}", im, (0.5, 0.88)))

    meta = pack_pixi_atlas(frames, WAVE3_DIR, "env-anims", max_width=512)
    return meta, ["public/art-wave3/env-anims.png"]


# ---------------------------------------------------------------------------
# 3. Boss AoE Telegraphs (public/art-wave3/boss-telegraphs.{png,json})
# ---------------------------------------------------------------------------

def draw_ring_decal(
    size: int,
    outer_col: Tuple[int, int, int],
    inner_col: Tuple[int, int, int],
    ticks: int = 16,
    spokes: int = 0,
    inner_poly: int = 0,
) -> Image.Image:
    S = 2
    N = size * S
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = N / 2.0
    rad = N * 0.45

    # Soft translucent fill
    d.ellipse([c - rad, c - rad, c + rad, c + rad], fill=(*outer_col, 34))
    # Outer crisp ring + inner ring
    d.ellipse([c - rad, c - rad, c + rad, c + rad], outline=(*outer_col, 235), width=3 * S)
    d.ellipse([c - rad * 0.86, c - rad * 0.86, c + rad * 0.86, c + rad * 0.86], outline=(*inner_col, 190), width=int(1.5 * S))

    for k in range(ticks):
        a = k * (math.pi * 2 / ticks)
        x0, y0 = c + math.cos(a) * rad * 0.86, c + math.sin(a) * rad * 0.86
        x1, y1 = c + math.cos(a) * rad, c + math.sin(a) * rad
        d.line([(x0, y0), (x1, y1)], fill=(*inner_col, 225), width=int(1.6 * S))

    if spokes > 0:
        for k in range(spokes):
            a = k * (math.pi * 2 / spokes)
            d.line([(c, c), (c + math.cos(a) * rad * 0.86, c + math.sin(a) * rad * 0.86)], fill=(*inner_col, 120), width=S)

    if inner_poly >= 3:
        pts = [(c + math.cos(k * math.pi * 2 / inner_poly) * rad * 0.68, c + math.sin(k * math.pi * 2 / inner_poly) * rad * 0.68) for k in range(inner_poly)]
        d.polygon(pts, outline=(*inner_col, 210), width=int(1.6 * S))

    return im.resize((size, size), Image.LANCZOS)


def draw_cone_decal(
    size: int,
    outer_col: Tuple[int, int, int],
    inner_col: Tuple[int, int, int],
    angle_deg: float = 60.0,
    rays: int = 3,
) -> Image.Image:
    S = 2
    N = size * S
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ox, oy = int(N * 0.08), int(N * 0.5)
    rad = N * 0.84
    half = math.radians(angle_deg * 0.5)

    pts = [(ox, oy)]
    for step in range(25):
        a = -half + (step / 24.0) * (half * 2)
        pts.append((ox + math.cos(a) * rad, oy + math.sin(a) * rad))

    d.polygon(pts, fill=(*outer_col, 68), outline=(*outer_col, 240), width=int(2.4 * S))
    for frac in (0.45, 0.72):
        box = [ox - rad * frac, oy - rad * frac, ox + rad * frac, oy + rad * frac]
        d.arc(box, -angle_deg * 0.5, angle_deg * 0.5, fill=(*inner_col, 185), width=int(1.5 * S))
    for r_idx in range(rays):
        a = -half * 0.6 + (r_idx / max(1, rays - 1)) * (half * 1.2) if rays > 1 else 0.0
        d.line([(ox, oy), (ox + math.cos(a) * rad * 0.94, oy + math.sin(a) * rad * 0.94)], fill=(*inner_col, 145), width=S)

    return im.resize((size, size), Image.LANCZOS)


def draw_line_decal(
    w: int,
    h: int,
    outer_col: Tuple[int, int, int],
    inner_col: Tuple[int, int, int],
    jagged: bool = False,
) -> Image.Image:
    S = 2
    W, H = w * S, h * S
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    margin_y = int(H * 0.16)
    d.rectangle([4 * S, margin_y, W - 8 * S, H - margin_y], fill=(*outer_col, 56), outline=(*outer_col, 235), width=2 * S)
    # Forward hazard chevrons >>>
    for cx in range(24 * S, W - 24 * S, 34 * S):
        d.line([(cx - 10 * S, margin_y + 6 * S), (cx + 8 * S, H // 2), (cx - 10 * S, H - margin_y - 6 * S)], fill=(*inner_col, 220), width=int(2.2 * S))
    if jagged:
        pts = []
        for idx, px in enumerate(range(8 * S, W - 8 * S, 16 * S)):
            off = (-6 if idx % 2 else 6) * S
            pts.append((px, H // 2 + off))
        d.line(pts, fill=(*inner_col, 235), width=int(2.0 * S))
    return im.resize((w, h), Image.LANCZOS)


def draw_boss_glyph(boss: str) -> Image.Image:
    size = 96
    S = 2
    N = size * S
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = N / 2.0

    if boss == "morvessa":
        col, hi = (92, 232, 86), (192, 255, 148)
        d.ellipse([c - 74, c - 74, c + 74, c + 74], outline=(*col, 235), width=3)
        # Silk web spokes + concentric octagon
        for k in range(8):
            a = k * (math.pi / 4.0)
            d.line([(c, c), (c + math.cos(a) * 70, c + math.sin(a) * 70)], fill=(*hi, 175), width=2)
        for rad in (28, 52):
            pts = [(c + math.cos(k * math.pi / 4.0) * rad, c + math.sin(k * math.pi / 4.0) * rad) for k in range(8)]
            d.polygon(pts, outline=(*hi, 220), width=2)
        d.ellipse([c - 10, c - 10, c + 10, c + 10], fill=(*col, 235))
    elif boss == "gorrathul":
        col, hi = (82, 206, 255), (214, 246, 255)
        # Forked cistern sluice gear + frost star
        d.ellipse([c - 72, c - 72, c + 72, c + 72], outline=(*col, 235), width=4)
        for k in range(6):
            a = k * (math.pi / 3.0)
            x1, y1 = c + math.cos(a) * 68, c + math.sin(a) * 68
            d.line([(c, c), (x1, y1)], fill=(*hi, 225), width=3)
            d.line([(c + math.cos(a) * 46, c + math.sin(a) * 46), (c + math.cos(a + 0.25) * 62, c + math.sin(a + 0.25) * 62)], fill=(*hi, 200), width=2)
            d.line([(c + math.cos(a) * 46, c + math.sin(a) * 46), (c + math.cos(a - 0.25) * 62, c + math.sin(a - 0.25) * 62)], fill=(*hi, 200), width=2)
        d.rectangle([c - 16, c - 16, c + 16, c + 16], outline=(240, 186, 94, 230), width=3)
    elif boss == "vesperion":
        col, hi = (94, 176, 255), (96, 248, 212)
        # Astrolabe compass star + wave arc
        d.ellipse([c - 74, c - 74, c + 74, c + 74], outline=(*col, 235), width=3)
        d.ellipse([c - 48, c - 48, c + 48, c + 48], outline=(*hi, 210), width=2)
        star = []
        for k in range(8):
            r = 68 if k % 2 == 0 else 24
            a = k * (math.pi / 4.0) - math.pi / 2.0
            star.append((c + math.cos(a) * r, c + math.sin(a) * r))
        d.polygon(star, outline=(*hi, 235), width=3)
        d.ellipse([c - 12, c - 12, c + 12, c + 12], fill=(*col, 220))
    else:  # ashkarath
        col, hi = (255, 108, 32), (255, 222, 128)
        # Seven-pointed Anchor Seal star & inner crown circle
        d.ellipse([c - 76, c - 76, c + 76, c + 76], outline=(255, 48, 48, 240), width=4)
        pts = [(c + math.cos(k * math.pi * 2 / 7.0 - math.pi / 2) * 70, c + math.sin(k * math.pi * 2 / 7.0 - math.pi / 2) * 70) for k in range(7)]
        for k in range(7):
            d.line([pts[k], pts[(k + 2) % 7]], fill=(*col, 235), width=3)
            d.line([pts[k], pts[(k + 3) % 7]], fill=(*hi, 215), width=2)
        d.ellipse([c - 22, c - 22, c + 22, c + 22], outline=(*hi, 245), width=3)

    return im.resize((size, size), Image.LANCZOS)


def build_boss_telegraphs() -> Tuple[dict, List[str]]:
    frames: List[Tuple[str, Image.Image, Tuple[float, float]]] = []

    # Shared ring, progressive fills, beam line, cone arc
    frames.append(("ring/outer", draw_ring_decal(128, (255, 168, 48), (255, 232, 136), ticks=16), (0.5, 0.5)))
    for idx, frac in enumerate((0.25, 0.50, 0.75, 0.96)):
        im = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        rad = int(58 * frac)
        d.ellipse([64 - rad, 64 - rad, 64 + rad, 64 + rad], fill=(255, 92, 32, 52 + idx * 18), outline=(255, 198, 72, 235), width=2)
        frames.append((f"ring/fill-{idx}", im, (0.5, 0.5)))

    frames.append(("line/beam", draw_line_decal(192, 64, (255, 146, 44), (255, 228, 124)), (0.0, 0.5)))
    frames.append(("cone/arc", draw_cone_decal(128, (255, 142, 42), (255, 226, 118), 60.0, rays=3), (0.08, 0.5)))

    boss_specs = [
        ("morvessa", (88, 228, 84), (186, 255, 142), 8, 8, False),
        ("gorrathul", (78, 204, 255), (218, 248, 255), 12, 6, False),
        ("vesperion", (92, 174, 255), (84, 246, 212), 16, 4, True),
        ("ashkarath", (255, 98, 28), (255, 220, 118), 14, 7, True),
    ]
    for boss, col, hi, ticks, poly_n, jagged in boss_specs:
        frames.append((f"{boss}/ring", draw_ring_decal(128, col, hi, ticks=ticks, spokes=poly_n, inner_poly=poly_n), (0.5, 0.5)))
        frames.append((f"{boss}/cone", draw_cone_decal(128, col, hi, angle_deg=64.0, rays=4), (0.08, 0.5)))
        frames.append((f"{boss}/line", draw_line_decal(192, 64, col, hi, jagged=jagged), (0.0, 0.5)))
        frames.append((f"{boss}/glyph", draw_boss_glyph(boss), (0.5, 0.5)))

    meta = pack_pixi_atlas(frames, WAVE3_DIR, "boss-telegraphs", max_width=1024)
    return meta, ["public/art-wave3/boss-telegraphs.png"]


# ---------------------------------------------------------------------------
# 4. City buildings: see tools/gen-city-buildings.py
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# 5. Append-only assets.json synchronization
# ---------------------------------------------------------------------------

def append_assets_manifest(new_paths: List[str], notes: Dict[str, str]) -> int:
    data = json.loads(ASSETS_JSON.read_text(encoding="utf-8"))
    existing = {entry["path"] for entry in data.get("assets", [])}
    added = 0
    for rel in sorted(new_paths):
        if rel in existing:
            continue
        data["assets"].append(
            {
                "path": rel,
                "license": "own",
                "source": "tools/gen-art-wave3.py",
                "note": notes.get(rel, "Wave 3 procedural dark-fantasy asset"),
            }
        )
        added += 1
    if added > 0:
        ASSETS_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return added


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Wave 3 art packs & missing base item icons.")
    parser.add_argument("--sync-assets", action="store_true", help="Append missing PNG entries to assets.json")
    args = parser.parse_args()

    item_paths = build_missing_itemicons()
    env_meta, env_bins = build_env_anims()
    tele_meta, tele_bins = build_boss_telegraphs()

    all_bins = item_paths + env_bins + tele_bins
    notes: Dict[str, str] = {
        p: "Wave 3 procedural 64x64 base item icon (fills missing items.json / base-items slug)"
        for p in item_paths
    }
    notes["public/art-wave3/env-anims.png"] = "Wave 3 environmental animation atlas (torches, banners, smoke, water-wheel, bonfire, cauldron)"
    notes["public/art-wave3/boss-telegraphs.png"] = "Wave 3 boss AoE telegraph decals & rune glyphs (shared + morvessa, gorrathul, vesperion, ashkarath)"

    added = append_assets_manifest(all_bins, notes) if args.sync_assets else 0

    print(
        f"Wave 3 art generated: itemicons_added={len(item_paths)}, "
        f"env-anims={len(env_meta['frames'])} frames, "
        f"boss-telegraphs={len(tele_meta['frames'])} frames, "
        f"assets.json_appended={added}"
    )


if __name__ == "__main__":
    main()
