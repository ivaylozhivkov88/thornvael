"""Generate original dark-fantasy procedural/painterly art packs for Thornvael.

Produces:
  - public/props-wave2/props-wave2.{png,json}
  - public/spellicons/spellicons.{png,json}
  - public/uiskin/{uiskin.css,panel-frame.png,btn-dark.png,orb-health.png,orb-mana.png,rarity-frames.png}
  - public/projectiles/projectiles.{png,json}
  - public/townnpcs/townnpcs.{png,json}
  - public/loadscreens/load-map{1-fords,2-redmarsh,3-coast,4-caldera}.jpg

Usage:
  python tools/gen-new-art-packs.py
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SEED = 20261119


# ---------------------------------------------------------------------------
# Helpers: packing, Pixi JSON, drawing primitives
# ---------------------------------------------------------------------------

def pack_pixi_atlas(
    frames: List[Tuple[str, Image.Image, Tuple[float, float]]],
    out_dir: Path,
    stem: str,
    max_width: int = 512,
    pad: int = 2,
) -> dict:
    """Shelf-pack RGBA sprites into a compact power-of-two/aligned PNG + Pixi v8 JSON."""
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
    atlas_w = min(2048, max(atlas_w, max_width if used_w > max_width // 2 else atlas_w))

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
            "app": "tools/gen-new-art-packs.py",
            "version": "1.0",
            "image": f"{stem}.png",
            "format": "RGBA8888",
            "size": {"w": atlas_w, "h": atlas_h},
            "scale": 1,
        },
    }
    json_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return meta


def add_outline(im: Image.Image, outline_rgba=(14, 12, 16, 235)) -> Image.Image:
    """Add a crisp 1px dark-fantasy silhouette outline around opaque pixels."""
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


def radial_glow(size: Tuple[int, int], center: Tuple[float, float], radius: float, color: Tuple[int, int, int], peak_alpha: int = 180) -> Image.Image:
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.sqrt((xx - center[0]) ** 2 + (yy - center[1]) ** 2)
    t = np.clip(1.0 - dist / max(1.0, radius), 0.0, 1.0) ** 2.0
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[..., 0] = color[0]
    arr[..., 1] = color[1]
    arr[..., 2] = color[2]
    arr[..., 3] = (t * peak_alpha).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def shaded_stone_poly(draw: ImageDraw.ImageDraw, pts: List[Tuple[int, int]], base=(92, 90, 96), hi=(134, 132, 138), lo=(52, 50, 56)) -> None:
    draw.polygon(pts, fill=(*base, 255))
    if len(pts) >= 3:
        draw.line([pts[0], pts[1]], fill=(*hi, 255), width=1)
        draw.line([pts[-2], pts[-1]], fill=(*lo, 255), width=1)


# ---------------------------------------------------------------------------
# 1. Props Wave 2 (public/props-wave2/)
# ---------------------------------------------------------------------------

def build_props_wave2() -> dict:
    rng = random.Random(SEED + 1)
    frames: List[Tuple[str, Image.Image, Tuple[float, float]]] = []

    def make_prop(w: int, h: int, fn, anchor=(0.5, 0.92), outline=True) -> Image.Image:
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        fn(im, d)
        return add_outline(im) if outline else im

    # --- Shrines ---
    def draw_shrine(im, d, glow_col, crystal_col, style):
        # Stepped stone plinth
        shaded_stone_poly(d, [(12, 54), (44, 54), (48, 60), (8, 60)], (82, 80, 86), (118, 116, 124), (44, 42, 48))
        shaded_stone_poly(d, [(16, 46), (40, 46), (44, 54), (12, 54)], (94, 92, 98), (134, 132, 140), (50, 48, 56))
        if style == "healing":
            d.rectangle([20, 26, 36, 46], fill=(96, 98, 102, 255))
            d.ellipse([16, 20, 40, 30], fill=(116, 120, 126, 255), outline=(60, 62, 68, 255))
            d.ellipse([19, 22, 37, 28], fill=(*glow_col, 240))
            d.ellipse([25, 10, 31, 22], fill=(*crystal_col, 255))
        elif style == "war":
            d.polygon([(20, 46), (22, 18), (34, 18), (36, 46)], fill=(78, 72, 74, 255))
            d.rectangle([22, 22, 34, 30], fill=(140, 28, 28, 220))
            d.ellipse([22, 11, 34, 21], fill=(214, 204, 186, 255))
            d.rectangle([25, 16, 27, 18], fill=(30, 16, 18, 255))
            d.rectangle([29, 16, 31, 18], fill=(30, 16, 18, 255))
        else:  # mana obelisk
            d.polygon([(28, 8), (36, 24), (34, 46), (22, 46), (20, 24)], fill=(58, 74, 110, 255))
            d.polygon([(28, 8), (28, 46), (22, 46), (20, 24)], fill=(86, 128, 198, 255))
            d.line([(28, 14), (28, 40)], fill=(170, 236, 255, 255), width=2)
        g = radial_glow(im.size, (28, 22), 20, glow_col, 115)
        im.alpha_composite(g)

    frames.append(("shrines/healing", make_prop(56, 64, lambda im, d: draw_shrine(im, d, (80, 235, 175), (175, 255, 220), "healing")), (0.5, 0.92)))
    frames.append(("shrines/war", make_prop(56, 64, lambda im, d: draw_shrine(im, d, (235, 65, 45), (255, 140, 90), "war")), (0.5, 0.92)))
    frames.append(("shrines/mana", make_prop(56, 64, lambda im, d: draw_shrine(im, d, (75, 170, 255), (170, 235, 255), "mana")), (0.5, 0.92)))

    # --- 3-rarity chests (open & closed) ---
    chest_specs = [
        ("common", (104, 70, 42), (138, 142, 150), (220, 182, 72)),
        ("rare", (56, 78, 118), (180, 194, 214), (90, 200, 255)),
        ("unique", (76, 32, 28), (218, 172, 68), (255, 145, 45)),
    ]
    for rarity, wood, trim, glow in chest_specs:
        def draw_chest(im, d, is_open: bool, wcol=wood, tcol=trim, gcol=glow):
            # Base box
            d.rectangle([10, 24, 38, 42], fill=(*wcol, 255), outline=(*tcol, 255), width=2)
            d.line([(16, 24), (16, 42)], fill=(*tcol, 255), width=2)
            d.line([(32, 24), (32, 42)], fill=(*tcol, 255), width=2)
            if not is_open:
                d.pieslice([10, 12, 38, 34], 180, 360, fill=(min(255, wcol[0] + 22), min(255, wcol[1] + 18), min(255, wcol[2] + 14), 255), outline=(*tcol, 255), width=2)
                d.rectangle([22, 22, 26, 28], fill=(*gcol, 255))
            else:
                # Open lid tilted back + treasure glow
                d.polygon([(11, 24), (14, 11), (34, 11), (37, 24)], fill=(max(0, wcol[0] - 18), max(0, wcol[1] - 14), max(0, wcol[2] - 10), 255), outline=(*tcol, 255))
                d.rectangle([13, 21, 35, 26], fill=(*gcol, 255))
                im.alpha_composite(radial_glow(im.size, (24, 22), 16, gcol, 135))

        frames.append((f"chests/{rarity}-closed", make_prop(48, 48, lambda im, d, fn=draw_chest: fn(im, d, False)), (0.5, 0.90)))
        frames.append((f"chests/{rarity}-open", make_prop(48, 48, lambda im, d, fn=draw_chest: fn(im, d, True)), (0.5, 0.90)))

    # --- Bridges ---
    def draw_bridge_wood(im, d):
        d.rectangle([4, 10, 76, 54], fill=(92, 62, 38, 255))
        for px in range(6, 74, 8):
            shade = rng.randint(-10, 10)
            c = (98 + shade, 66 + shade, 40 + shade, 255)
            d.rectangle([px, 12, px + 6, 52], fill=c, outline=(52, 34, 20, 255))
        d.rectangle([2, 8, 78, 13], fill=(124, 88, 54, 255))
        d.rectangle([2, 51, 78, 56], fill=(74, 50, 30, 255))

    def draw_bridge_stone(im, d):
        d.rectangle([10, 4, 54, 76], fill=(96, 94, 100, 255))
        for py in range(6, 74, 10):
            d.rectangle([14, py, 50, py + 8], fill=(108, 106, 112, 255), outline=(60, 58, 64, 255))
        d.rectangle([8, 2, 14, 78], fill=(134, 132, 138, 255))
        d.rectangle([50, 2, 56, 78], fill=(76, 74, 80, 255))

    frames.append(("bridges/wood-h", make_prop(80, 64, draw_bridge_wood), (0.5, 0.5)))
    frames.append(("bridges/stone-v", make_prop(64, 80, draw_bridge_stone), (0.5, 0.5)))

    # --- Lights & Waystones ---
    def draw_brazier(im, d):
        d.rectangle([18, 26, 22, 52], fill=(56, 58, 64, 255))
        d.polygon([(12, 52), (28, 52), (25, 48), (15, 48)], fill=(68, 70, 76, 255))
        d.polygon([(10, 22), (30, 22), (26, 30), (14, 30)], fill=(78, 76, 82, 255))
        d.polygon([(14, 22), (20, 7), (26, 22)], fill=(255, 130, 30, 255))
        d.polygon([(17, 22), (20, 12), (23, 22)], fill=(255, 224, 95, 255))
        im.alpha_composite(radial_glow(im.size, (20, 16), 16, (255, 150, 45), 145))

    def draw_bonfire(im, d):
        for ang in range(0, 360, 45):
            rx = 28 + int(math.cos(math.radians(ang)) * 16)
            ry = 44 + int(math.sin(math.radians(ang)) * 7)
            d.ellipse([rx - 4, ry - 3, rx + 4, ry + 3], fill=(96, 94, 98, 255))
        d.line([(16, 46), (40, 34)], fill=(86, 52, 30, 255), width=5)
        d.line([(16, 34), (40, 46)], fill=(72, 44, 24, 255), width=5)
        d.polygon([(16, 38), (28, 10), (40, 38)], fill=(245, 104, 24, 255))
        d.polygon([(21, 38), (28, 17), (35, 38)], fill=(255, 215, 80, 255))
        im.alpha_composite(radial_glow(im.size, (28, 26), 22, (255, 140, 40), 140))

    def draw_waystone(im, d):
        d.polygon([(14, 58), (42, 58), (38, 48), (18, 48)], fill=(78, 82, 88, 255))
        d.polygon([(18, 50), (20, 16), (28, 8), (36, 16), (38, 50)], fill=(96, 102, 112, 255))
        d.polygon([(18, 50), (20, 16), (28, 8), (28, 50)], fill=(118, 126, 138, 255))
        d.line([(28, 18), (28, 42)], fill=(88, 228, 255, 255), width=2)
        d.line([(23, 26), (33, 26)], fill=(88, 228, 255, 255), width=2)
        im.alpha_composite(radial_glow(im.size, (28, 28), 18, (70, 215, 255), 120))

    frames.append(("lights/brazier", make_prop(40, 58, draw_brazier), (0.5, 0.92)))
    frames.append(("lights/bonfire", make_prop(56, 56, draw_bonfire), (0.5, 0.88)))
    frames.append(("lights/waystone", make_prop(56, 64, draw_waystone), (0.5, 0.92)))

    # --- Banners ---
    def draw_banner(im, d, cloth_col, trim_col):
        d.rectangle([18, 6, 21, 62], fill=(110, 82, 54, 255))
        d.rectangle([12, 10, 28, 13], fill=(154, 136, 92, 255))
        d.polygon([(13, 13), (27, 13), (27, 46), (20, 52), (13, 46)], fill=(*cloth_col, 255))
        d.rectangle([18, 18, 22, 36], fill=(*trim_col, 255))

    frames.append(("banners/ironbound", make_prop(40, 66, lambda im, d: draw_banner(im, d, (148, 32, 34), (218, 178, 72))), (0.5, 0.94)))
    frames.append(("banners/thornwatch", make_prop(40, 66, lambda im, d: draw_banner(im, d, (42, 106, 64), (212, 198, 128))), (0.5, 0.94)))

    # --- Shipwreck (Iron Coast) ---
    def draw_shipwreck(im, d):
        d.polygon([(10, 52), (24, 24), (78, 18), (90, 44), (66, 58), (18, 58)], fill=(86, 58, 38, 255))
        d.polygon([(16, 48), (28, 28), (74, 22), (82, 40), (62, 52)], fill=(54, 36, 24, 255))
        for rx in range(28, 76, 10):
            d.line([(rx, 24), (rx - 4, 52)], fill=(112, 78, 50, 255), width=3)
        # Broken mast
        d.line([(46, 38), (34, 8)], fill=(122, 88, 58, 255), width=4)
        d.polygon([(36, 12), (56, 18), (44, 26)], fill=(184, 174, 152, 210))

    frames.append(("coast/shipwreck", make_prop(96, 68, draw_shipwreck), (0.5, 0.88)))

    # --- Flora (mushrooms, reeds, lilypads, driftwood) ---
    def draw_mushrooms(im, d):
        for sx, sy, r, col in [(16, 34, 8, (86, 220, 178)), (28, 28, 10, (112, 242, 200)), (36, 36, 6, (76, 196, 165))]:
            d.rectangle([sx - 2, sy, sx + 2, 44], fill=(198, 190, 174, 255))
            d.pieslice([sx - r, sy - r, sx + r, sy + r // 2], 180, 360, fill=(*col, 255))
        im.alpha_composite(radial_glow(im.size, (26, 28), 16, (90, 235, 190), 95))

    def draw_reeds(im, d):
        for rx, h in [(12, 34), (18, 42), (24, 38), (30, 44), (36, 32)]:
            d.line([(24, 48), (rx, 48 - h)], fill=(78, 114, 54, 255), width=2)
            d.line([(rx, 48 - h), (rx, 48 - h + 8)], fill=(96, 62, 36, 255), width=4)

    def draw_lilypads(im, d):
        for lx, ly, r in [(14, 20, 9), (30, 16, 8), (24, 30, 10)]:
            d.pieslice([lx - r, ly - r // 2 - 2, lx + r, ly + r // 2 + 2], 20, 330, fill=(56, 118, 58, 255), outline=(36, 78, 38, 255))
        d.ellipse([21, 24, 27, 29], fill=(242, 226, 234, 255))

    def draw_driftwood(im, d):
        d.polygon([(6, 24), (24, 16), (52, 18), (58, 26), (36, 30), (10, 30)], fill=(158, 148, 134, 255))
        d.line([(10, 22), (48, 20)], fill=(192, 182, 166, 255), width=2)

    frames.append(("flora/mushrooms", make_prop(48, 48, draw_mushrooms), (0.5, 0.90)))
    frames.append(("flora/reeds", make_prop(48, 52, draw_reeds), (0.5, 0.92)))
    frames.append(("flora/lilypads", make_prop(44, 40, draw_lilypads), (0.5, 0.50)))
    frames.append(("flora/driftwood", make_prop(64, 36, draw_driftwood), (0.5, 0.78)))

    # --- Graves & Remaining Wave 2 Props ---
    def draw_tombstone(im, d):
        shaded_stone_poly(d, [(12, 46), (36, 46), (38, 52), (10, 52)], (74, 76, 80))
        d.pieslice([14, 10, 34, 30], 180, 360, fill=(106, 108, 114, 255))
        d.rectangle([14, 20, 34, 46], fill=(106, 108, 114, 255))
        d.line([(24, 18), (24, 34)], fill=(58, 60, 66, 255), width=2)
        d.line([(19, 24), (29, 24)], fill=(58, 60, 66, 255), width=2)

    def draw_grave_cross(im, d):
        d.rectangle([21, 10, 27, 48], fill=(96, 68, 44, 255))
        d.rectangle([12, 18, 36, 24], fill=(112, 80, 52, 255))
        d.ellipse([28, 24, 36, 33], fill=(245, 185, 70, 255))

    def draw_grave_slab(im, d):
        shaded_stone_poly(d, [(10, 18), (38, 14), (42, 34), (14, 38)], (92, 94, 98))
        d.line([(16, 24), (32, 22)], fill=(54, 56, 60, 255), width=2)

    def draw_fence_iron(im, d):
        d.rectangle([4, 20, 52, 24], fill=(64, 68, 76, 255))
        d.rectangle([4, 34, 52, 38], fill=(64, 68, 76, 255))
        for fx in range(8, 52, 8):
            d.rectangle([fx - 1, 12, fx + 2, 44], fill=(86, 90, 98, 255))
            d.polygon([(fx - 2, 12), (fx + 1, 6), (fx + 3, 12)], fill=(122, 126, 134, 255))

    def draw_fence_wood(im, d):
        d.rectangle([4, 20, 52, 25], fill=(112, 78, 48, 255))
        d.rectangle([4, 32, 52, 37], fill=(96, 66, 40, 255))
        for fx in (10, 28, 46):
            d.rectangle([fx - 3, 14, fx + 3, 44], fill=(128, 90, 56, 255))

    def draw_well(im, d):
        d.ellipse([12, 32, 48, 52], fill=(94, 96, 102, 255))
        d.ellipse([16, 34, 44, 46], fill=(26, 44, 62, 255))
        d.rectangle([14, 16, 18, 38], fill=(108, 74, 46, 255))
        d.rectangle([42, 16, 46, 38], fill=(108, 74, 46, 255))
        d.polygon([(8, 20), (30, 6), (52, 20)], fill=(122, 68, 44, 255))

    def draw_wagon(im, d):
        d.polygon([(12, 24), (54, 16), (62, 36), (18, 44)], fill=(114, 78, 46, 255))
        d.ellipse([14, 36, 28, 50], fill=(78, 52, 30, 255), outline=(146, 148, 154, 255), width=2)
        d.ellipse([44, 30, 58, 44], fill=(78, 52, 30, 255), outline=(146, 148, 154, 255), width=2)

    def draw_signpost(im, d):
        d.rectangle([18, 12, 22, 50], fill=(98, 68, 42, 255))
        d.polygon([(14, 14), (36, 14), (40, 18), (36, 22), (14, 22)], fill=(134, 96, 60, 255))
        d.polygon([(26, 24), (6, 24), (2, 28), (6, 32), (26, 32)], fill=(118, 84, 52, 255))

    def draw_cave(im, d):
        d.polygon([(6, 58), (18, 14), (42, 8), (66, 16), (74, 58)], fill=(86, 84, 90, 255))
        d.pieslice([18, 22, 62, 68], 180, 360, fill=(14, 12, 18, 255))

    def draw_door(im, d):
        d.polygon([(10, 60), (14, 12), (46, 12), (50, 60)], fill=(96, 94, 100, 255))
        d.pieslice([16, 18, 44, 44], 180, 360, fill=(84, 52, 32, 255))
        d.rectangle([16, 30, 44, 60], fill=(84, 52, 32, 255), outline=(130, 134, 140, 255), width=2)

    def draw_catapult(im, d):
        d.rectangle([14, 34, 62, 46], fill=(104, 70, 40, 255))
        d.line([(28, 38), (58, 12)], fill=(128, 88, 52, 255), width=5)
        d.ellipse([52, 8, 64, 18], fill=(84, 86, 92, 255))
        d.ellipse([16, 38, 28, 50], fill=(72, 48, 28, 255))
        d.ellipse([48, 38, 60, 50], fill=(72, 48, 28, 255))

    def draw_giant_bones(im, d):
        for off in range(0, 40, 10):
            d.arc([14 + off, 14, 30 + off, 46], 200, 20, fill=(212, 202, 182, 255), width=4)
        d.ellipse([8, 22, 24, 38], fill=(222, 212, 192, 255))

    def draw_cocoon(im, d):
        d.ellipse([14, 10, 34, 46], fill=(208, 206, 198, 255), outline=(140, 138, 132, 255))
        for y in range(16, 42, 6):
            d.line([(16, y), (32, y + 3)], fill=(166, 164, 158, 255), width=1)

    frames.extend([
        ("graves/tombstone", make_prop(48, 56, draw_tombstone), (0.5, 0.92)),
        ("graves/cross", make_prop(48, 54, draw_grave_cross), (0.5, 0.92)),
        ("graves/slab", make_prop(52, 46, draw_grave_slab), (0.5, 0.85)),
        ("props/fence-iron", make_prop(56, 48, draw_fence_iron), (0.5, 0.90)),
        ("props/fence-wood", make_prop(56, 48, draw_fence_wood), (0.5, 0.90)),
        ("props/well", make_prop(60, 58, draw_well), (0.5, 0.90)),
        ("props/wagon", make_prop(72, 54, draw_wagon), (0.5, 0.90)),
        ("props/signpost", make_prop(44, 56, draw_signpost), (0.5, 0.92)),
        ("props/cave-mouth", make_prop(80, 64, draw_cave), (0.5, 0.94)),
        ("props/dungeon-door", make_prop(60, 66, draw_door), (0.5, 0.94)),
        ("props/siege-catapult", make_prop(74, 56, draw_catapult), (0.5, 0.90)),
        ("props/giant-bones", make_prop(68, 52, draw_giant_bones), (0.5, 0.88)),
        ("props/cocoon", make_prop(48, 52, draw_cocoon), (0.5, 0.90)),
    ])

    return pack_pixi_atlas(frames, PUBLIC / "props-wave2", "props-wave2", max_width=512)


# ---------------------------------------------------------------------------
# 2. Spell & Status Icons (public/spellicons/)
# ---------------------------------------------------------------------------

def build_spellicons() -> dict:
    frames: List[Tuple[str, Image.Image, Tuple[float, float]]] = []

    def make_icon(bg: Tuple[int, int, int], rim: Tuple[int, int, int], painter) -> Image.Image:
        im = Image.new("RGBA", (48, 48), (*bg, 255))
        im.alpha_composite(radial_glow((48, 48), (24, 24), 22, rim, 95))
        d = ImageDraw.Draw(im)
        painter(d, im)
        # Dark-fantasy beveled frame
        d.rectangle([0, 0, 47, 47], outline=(24, 20, 22, 255), width=2)
        d.rectangle([2, 2, 45, 45], outline=(*rim, 230), width=1)
        return im

    def p_fire(d, im):
        d.polygon([(24, 8), (35, 24), (30, 38), (18, 38), (13, 24)], fill=(255, 118, 28, 255))
        d.polygon([(24, 15), (30, 26), (26, 36), (20, 36), (18, 26)], fill=(255, 222, 92, 255))

    def p_frost(d, im):
        for ang in range(0, 180, 60):
            rad = math.radians(ang)
            dx, dy = int(math.cos(rad) * 14), int(math.sin(rad) * 14)
            d.line([(24 - dx, 24 - dy), (24 + dx, 24 + dy)], fill=(160, 238, 255, 255), width=3)
        d.ellipse([19, 19, 29, 29], fill=(225, 252, 255, 255))

    def p_arcane(d, im):
        d.ellipse([11, 11, 37, 37], outline=(196, 132, 255, 255), width=2)
        d.polygon([(24, 10), (34, 30), (14, 30)], outline=(228, 188, 255, 255), width=2)
        d.ellipse([21, 21, 27, 27], fill=(242, 222, 255, 255))

    def p_shadow(d, im):
        d.pieslice([12, 10, 38, 38], 40, 310, fill=(116, 224, 136, 255))
        d.ellipse([18, 16, 36, 34], fill=(18, 24, 22, 255))

    def p_holy(d, im):
        d.rectangle([21, 9, 27, 39], fill=(255, 232, 138, 255))
        d.rectangle([11, 18, 37, 24], fill=(255, 232, 138, 255))
        d.ellipse([20, 17, 28, 25], fill=(255, 252, 220, 255))

    def p_earth(d, im):
        d.polygon([(10, 35), (18, 16), (26, 22), (32, 12), (39, 35)], fill=(154, 118, 74, 255))
        d.polygon([(18, 16), (26, 22), (22, 35), (10, 35)], fill=(192, 152, 98, 255))

    def p_lightning(d, im):
        d.polygon([(27, 8), (15, 25), (23, 25), (19, 40), (33, 21), (25, 21)], fill=(188, 228, 255, 255))

    def p_poison(d, im):
        d.ellipse([16, 12, 32, 27], fill=(120, 224, 86, 255))
        d.rectangle([20, 26, 28, 32], fill=(120, 224, 86, 255))
        d.ellipse([19, 17, 23, 21], fill=(20, 36, 18, 255))
        d.ellipse([25, 17, 29, 21], fill=(20, 36, 18, 255))
        d.ellipse([14, 33, 20, 39], fill=(142, 248, 102, 255))
        d.ellipse([29, 31, 35, 37], fill=(142, 248, 102, 255))

    def p_stun(d, im):
        for sx, sy in [(16, 16), (32, 18), (24, 30)]:
            d.line([(sx - 5, sy), (sx + 5, sy)], fill=(255, 224, 88, 255), width=2)
            d.line([(sx, sy - 5), (sx, sy + 5)], fill=(255, 224, 88, 255), width=2)

    def p_shield(d, im):
        d.polygon([(14, 11), (34, 11), (34, 25), (24, 38), (14, 25)], fill=(138, 168, 206, 255), outline=(228, 238, 250, 255), width=2)

    specs = [
        ("school/fire", (46, 18, 14), (240, 128, 48), p_fire),
        ("school/frost", (16, 34, 52), (104, 210, 255), p_frost),
        ("school/arcane", (34, 18, 52), (186, 120, 255), p_arcane),
        ("school/shadow", (18, 28, 22), (96, 204, 122), p_shadow),
        ("school/holy", (48, 38, 16), (255, 214, 102), p_holy),
        ("school/earth", (38, 28, 18), (178, 134, 78), p_earth),
        ("status/burning", (52, 18, 12), (255, 112, 36), p_fire),
        ("status/frozen", (14, 36, 56), (120, 228, 255), p_frost),
        ("status/poisoned", (18, 38, 18), (112, 222, 82), p_poison),
        ("status/stunned", (44, 36, 14), (245, 206, 72), p_stun),
        ("status/shield", (22, 32, 46), (156, 198, 240), p_shield),
        ("status/haste", (22, 34, 48), (168, 222, 255), p_lightning),
        ("spell/fireball", (52, 20, 12), (255, 132, 42), p_fire),
        ("spell/frost-bolt", (16, 36, 54), (110, 218, 255), p_frost),
        ("spell/lightning", (18, 26, 48), (146, 208, 255), p_lightning),
        ("spell/healing", (44, 36, 18), (255, 222, 118), p_holy),
        ("spell/poison-cloud", (18, 36, 18), (118, 226, 84), p_poison),
        ("spell/stone-skin", (36, 28, 20), (186, 146, 94), p_shield),
    ]
    for name, bg, rim, fn in specs:
        frames.append((name, make_icon(bg, rim, fn), (0.5, 0.5)))

    return pack_pixi_atlas(frames, PUBLIC / "spellicons", "spellicons", max_width=256)


# ---------------------------------------------------------------------------
# 3. UI Skin (public/uiskin/)
# ---------------------------------------------------------------------------

def build_uiskin() -> None:
    out = PUBLIC / "uiskin"
    out.mkdir(parents=True, exist_ok=True)

    # 1. panel-frame.png (96x96 9-slice dark-iron + bronze rivets)
    panel = Image.new("RGBA", (96, 96), (18, 15, 20, 236))
    d = ImageDraw.Draw(panel)
    d.rectangle([0, 0, 95, 95], outline=(14, 12, 16, 255), width=2)
    d.rectangle([2, 2, 93, 93], outline=(138, 104, 58, 255), width=3)
    d.rectangle([6, 6, 89, 89], outline=(58, 48, 38, 255), width=2)
    for cx, cy in [(6, 6), (89, 6), (6, 89), (89, 89)]:
        d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=(176, 134, 72, 255), outline=(44, 32, 20, 255))
        d.point((cx - 1, cy - 1), fill=(242, 214, 148, 255))
    panel.save(out / "panel-frame.png", "PNG", optimize=True)

    # 2. btn-dark.png (128x144: 3 stacked 48px states: normal, hover, pressed)
    btn = Image.new("RGBA", (128, 144), (0, 0, 0, 0))
    bd = ImageDraw.Draw(btn)
    states = [
        (0, (34, 30, 36, 245), (132, 98, 54, 255), (72, 58, 44, 255)),
        (48, (54, 42, 34, 250), (212, 168, 84, 255), (120, 92, 54, 255)),
        (96, (22, 18, 24, 250), (96, 72, 40, 255), (38, 30, 24, 255)),
    ]
    for y0, fill, rim, inner in states:
        bd.rectangle([2, y0 + 2, 125, y0 + 45], fill=fill, outline=rim, width=2)
        bd.rectangle([5, y0 + 5, 122, y0 + 42], outline=inner, width=1)
    btn.save(out / "btn-dark.png", "PNG", optimize=True)

    # 3. orb-health.png & orb-mana.png (128x128)
    def make_orb(liquid: Tuple[int, int, int], hi: Tuple[int, int, int], rim: Tuple[int, int, int]) -> Image.Image:
        orb = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        od = ImageDraw.Draw(orb)
        od.ellipse([8, 8, 119, 119], fill=(18, 16, 20, 255), outline=rim, width=5)
        od.ellipse([14, 14, 113, 113], fill=(*liquid, 245))
        orb.alpha_composite(radial_glow((128, 128), (52, 46), 44, hi, 150))
        od = ImageDraw.Draw(orb)
        od.ellipse([10, 10, 117, 117], outline=(42, 34, 28, 255), width=2)
        od.arc([22, 22, 106, 106], 200, 255, fill=(255, 255, 255, 175), width=4)
        return orb

    make_orb((156, 22, 30), (255, 110, 96), (146, 110, 62)).save(out / "orb-health.png", "PNG", optimize=True)
    make_orb((26, 68, 168), (110, 198, 255), (140, 152, 174)).save(out / "orb-mana.png", "PNG", optimize=True)

    # 4. rarity-frames.png (5x 48x48 frames in 240x48 strip)
    rarity = Image.new("RGBA", (240, 48), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rarity)
    rar_cols = [
        (134, 138, 146),  # common
        (78, 148, 245),   # magic
        (228, 186, 64),   # rare
        (236, 114, 44),   # unique
        (72, 206, 108),   # set
    ]
    for i, col in enumerate(rar_cols):
        x0 = i * 48
        rd.rectangle([x0 + 1, 1, x0 + 46, 46], outline=(20, 18, 22, 255), width=2)
        rd.rectangle([x0 + 3, 3, x0 + 44, 44], outline=(*col, 255), width=2)
        rd.rectangle([x0 + 6, 6, x0 + 41, 41], outline=(col[0] // 2, col[1] // 2, col[2] // 2, 200), width=1)
    rarity.save(out / "rarity-frames.png", "PNG", optimize=True)

    # 5. uiskin.css
    css = """/* Thornvael Dark-Fantasy UI Skin (public/uiskin/uiskin.css) */
.tv-panel {
  border-style: solid;
  border-width: 16px;
  border-image-source: url('./panel-frame.png');
  border-image-slice: 16 fill;
  border-image-repeat: stretch;
  color: #e8dcc4;
}

.tv-btn {
  background-image: url('./btn-dark.png');
  background-size: 100% 300%;
  background-position: 0 0;
  color: #f0dfb8;
  border: none;
  cursor: pointer;
}
.tv-btn:hover { background-position: 0 50%; }
.tv-btn:active { background-position: 0 100%; }

.tv-orb-hp {
  background: url('./orb-health.png') center/contain no-repeat;
}
.tv-orb-mp {
  background: url('./orb-mana.png') center/contain no-repeat;
}

.tv-rarity-common,
.tv-rarity-magic,
.tv-rarity-rare,
.tv-rarity-unique,
.tv-rarity-set {
  background-image: url('./rarity-frames.png');
  background-size: 500% 100%;
}
.tv-rarity-common { background-position: 0% 0; }
.tv-rarity-magic  { background-position: 25% 0; }
.tv-rarity-rare   { background-position: 50% 0; }
.tv-rarity-unique { background-position: 75% 0; }
.tv-rarity-set    { background-position: 100% 0; }
"""
    (out / "uiskin.css").write_text(css, encoding="utf-8")


# ---------------------------------------------------------------------------
# 4. Projectiles (public/projectiles/)
# ---------------------------------------------------------------------------

def build_projectiles() -> dict:
    frames: List[Tuple[str, Image.Image, Tuple[float, float]]] = []

    def make_proj(w: int, h: int, fn) -> Image.Image:
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        fn(im, ImageDraw.Draw(im))
        return im

    # Arrow
    def d_arrow(im, d):
        d.line([(4, 8), (24, 8)], fill=(154, 110, 68, 255), width=2)
        d.polygon([(22, 4), (30, 8), (22, 12)], fill=(200, 210, 224, 255))
        d.polygon([(3, 4), (9, 8), (3, 12)], fill=(214, 206, 188, 255))

    def d_bolt(im, d):
        d.line([(6, 8), (22, 8)], fill=(134, 102, 72, 255), width=3)
        d.polygon([(20, 4), (28, 8), (20, 12)], fill=(184, 194, 206, 255))

    frames.append(("arrow/0", make_proj(32, 16, d_arrow), (0.5, 0.5)))
    frames.append(("bolt/0", make_proj(30, 16, d_bolt), (0.5, 0.5)))

    # Trails helper
    def add_orb_and_trails(name: str, core: Tuple[int, int, int], mid: Tuple[int, int, int]):
        for idx, r in enumerate((10, 12)):
            def fn(im, d, rad=r, c1=core, c2=mid):
                im.alpha_composite(radial_glow(im.size, (16, 16), rad + 4, c2, 180))
                d.ellipse([16 - rad // 2, 16 - rad // 2, 16 + rad // 2, 16 + rad // 2], fill=(*c1, 255))
            frames.append((f"{name}/{idx}", make_proj(32, 32, fn), (0.5, 0.5)))
        for tidx, alpha in enumerate((170, 95)):
            frames.append((f"{name}/trail-{tidx}", make_proj(24, 24, lambda im, d, a=alpha, c=mid: im.alpha_composite(radial_glow((24, 24), (12, 12), 10, c, a))), (0.5, 0.5)))

    add_orb_and_trails("fireball", (255, 232, 142), (255, 110, 30))
    add_orb_and_trails("frost-shard", (228, 252, 255), (84, 196, 255))
    add_orb_and_trails("shadow-orb", (204, 255, 178), (74, 176, 98))

    frames.append(("arrow/trail-0", make_proj(24, 12, lambda im, d: d.line([(2, 6), (22, 6)], fill=(225, 225, 235, 140), width=2)), (0.5, 0.5)))
    frames.append(("bolt/trail-0", make_proj(24, 12, lambda im, d: d.line([(2, 6), (22, 6)], fill=(200, 210, 224, 150), width=2)), (0.5, 0.5)))

    # Thrown axe (4 spin frames + trail)
    base_axe = make_proj(28, 28, lambda im, d: (
        d.line([(14, 5), (14, 23)], fill=(128, 86, 52, 255), width=3),
        d.polygon([(14, 6), (24, 9), (22, 16), (14, 14)], fill=(192, 200, 212, 255)),
    ))
    for i in range(4):
        frames.append((f"thrown-axe/{i}", base_axe.rotate(i * 90), (0.5, 0.5)))
    frames.append(("thrown-axe/trail-0", make_proj(24, 24, lambda im, d: d.arc([3, 3, 21, 21], 0, 240, fill=(210, 216, 224, 130), width=2)), (0.5, 0.5)))

    return pack_pixi_atlas(frames, PUBLIC / "projectiles", "projectiles", max_width=256)


# ---------------------------------------------------------------------------
# 5. Town NPCs (public/townnpcs/)
# ---------------------------------------------------------------------------

def build_townnpcs() -> dict:
    frames: List[Tuple[str, Image.Image, Tuple[float, float]]] = []

    npc_specs = [
        ("smith", (128, 72, 44), (176, 156, 136), "hammer"),
        ("innkeeper", (142, 92, 56), (218, 206, 184), "tankard"),
        ("mage", (54, 62, 132), (108, 198, 255), "staff"),
        ("priest", (214, 206, 188), (244, 202, 96), "censer"),
        ("guard", (118, 126, 138), (168, 44, 44), "halberd"),
        ("villager", (96, 108, 72), (240, 186, 86), "lantern"),
    ]

    for npc, body_col, accent_col, prop in npc_specs:
        for fidx in range(4):
            bob = [0, -1, -2, -1][fidx]
            im = Image.new("RGBA", (48, 64), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            # Shadow
            d.ellipse([14, 53, 34, 60], fill=(12, 10, 14, 120))
            # Boots
            d.rectangle([17, 46, 22, 56], fill=(54, 42, 32, 255))
            d.rectangle([26, 46, 31, 56], fill=(54, 42, 32, 255))
            # Torso
            d.polygon([(14, 48 + bob), (17, 25 + bob), (31, 25 + bob), (34, 48 + bob)], fill=(*body_col, 255))
            # Head
            d.ellipse([18, 12 + bob, 30, 24 + bob], fill=(214, 178, 148, 255))
            if npc == "mage":
                d.polygon([(16, 18 + bob), (24, 6 + bob), (32, 18 + bob)], fill=(*body_col, 255))
            elif npc == "guard":
                d.pieslice([17, 10 + bob, 31, 22 + bob], 180, 360, fill=(148, 156, 168, 255))
            # Prop
            if prop == "hammer":
                d.line([(33, 34 + bob), (39, 22 + bob * 2)], fill=(120, 82, 50, 255), width=2)
                d.rectangle([36, 18 + bob * 2, 43, 24 + bob * 2], fill=(154, 160, 170, 255))
            elif prop == "tankard":
                d.rectangle([33, 30 + bob, 39, 38 + bob], fill=(154, 110, 62, 255))
            elif prop in ("staff", "halberd"):
                d.line([(36, 54), (36, 10 + bob)], fill=(138, 102, 64, 255), width=2)
                d.ellipse([33, 6 + bob, 39, 13 + bob], fill=(*accent_col, 255))
            else:
                d.ellipse([33, 28 + bob, 40, 37 + bob], fill=(*accent_col, 255))
            frames.append((f"{npc}/idle/{fidx}", add_outline(im), (0.5, 0.88)))

    return pack_pixi_atlas(frames, PUBLIC / "townnpcs", "townnpcs", max_width=512)


# ---------------------------------------------------------------------------
# 6. 4 Campaign Loading Screens (public/loadscreens/*.jpg)
# ---------------------------------------------------------------------------

def build_loadscreens() -> None:
    out = PUBLIC / "loadscreens"
    out.mkdir(parents=True, exist_ok=True)
    w, h = 1280, 720

    def paint_sky(top_col, bot_col, noise_amp=8, seed_off=0) -> np.ndarray:
        r = np.random.default_rng(SEED + seed_off)
        t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
        sky = (1 - t) * np.array(top_col, dtype=np.float32) + t * np.array(bot_col, dtype=np.float32)
        sky = np.broadcast_to(sky, (h, w, 3)).copy()
        grain = r.normal(0, noise_amp, (h, w, 1)).astype(np.float32)
        return np.clip(sky + grain, 0, 255).astype(np.uint8)

    def add_ridges(im: Image.Image, base_y: int, amp: int, col: Tuple[int, int, int], freq: float, phase: float) -> None:
        d = ImageDraw.Draw(im)
        pts = [(0, h)]
        for x in range(0, w + 16, 16):
            y = base_y + int(math.sin(x * freq + phase) * amp + math.cos(x * freq * 2.3 + phase) * (amp * 0.45))
            pts.append((x, y))
        pts.append((w, h))
        d.polygon(pts, fill=col)

    # Map 1: Oakhaven & Border Fords (dusk amber & misty pine ridges)
    m1 = Image.fromarray(paint_sky((28, 34, 52), (146, 98, 62), seed_off=10), "RGB")
    add_ridges(m1, 340, 48, (46, 52, 62), 0.004, 0.5)
    add_ridges(m1, 420, 34, (32, 38, 44), 0.006, 1.8)
    d1 = ImageDraw.Draw(m1)
    d1.polygon([(0, 490), (w, 460), (w, h), (0, h)], fill=(42, 48, 38))
    d1.polygon([(220, 560), (920, 500), (1120, 720), (140, 720)], fill=(54, 72, 86))  # river ford
    d1.rectangle([520, 488, 640, 560], fill=(82, 58, 38))  # bridge
    d1.rectangle([470, 380, 515, 510], fill=(44, 36, 32))  # watchtower
    d1.polygon([(462, 382), (492, 340), (522, 382)], fill=(62, 44, 34))
    m1 = m1.convert("RGBA")
    m1.alpha_composite(radial_glow((w, h), (492, 396), 110, (255, 165, 64), 175))
    m1.convert("RGB").filter(ImageFilter.GaussianBlur(0.5)).save(out / "load-map1-fords.jpg", "JPEG", quality=88)

    # Map 2: Redmarsh Fen (bruised violet sky, dead cypress, glowing wisps)
    m2 = Image.fromarray(paint_sky((34, 24, 48), (94, 58, 72), seed_off=20), "RGB")
    add_ridges(m2, 380, 36, (38, 28, 40), 0.005, 0.9)
    d2 = ImageDraw.Draw(m2)
    d2.polygon([(0, 450), (w, 450), (w, h), (0, h)], fill=(42, 24, 28))
    for tx in (180, 340, 780, 1040):
        d2.rectangle([tx - 10, 260, tx + 10, 540], fill=(24, 18, 22))
        d2.line([(tx, 300), (tx - 65, 230)], fill=(24, 18, 22), width=6)
        d2.line([(tx, 330), (tx + 72, 260)], fill=(24, 18, 22), width=5)
    m2 = m2.convert("RGBA")
    for wx, wy in [(420, 480), (620, 430), (880, 510)]:
        m2.alpha_composite(radial_glow((w, h), (wx, wy), 90, (128, 248, 178), 160))
    m2.convert("RGB").filter(ImageFilter.GaussianBlur(0.5)).save(out / "load-map2-redmarsh.jpg", "JPEG", quality=88)

    # Map 3: Iron Coast (storm-grey surf, basalt cliffs, shipwreck, distant fortress)
    m3 = Image.fromarray(paint_sky((20, 28, 40), (68, 86, 102), seed_off=30), "RGB")
    add_ridges(m3, 350, 62, (28, 32, 38), 0.005, 2.2)
    d3 = ImageDraw.Draw(m3)
    d3.polygon([(0, 450), (w, 430), (w, h), (0, h)], fill=(42, 56, 68))  # sea
    d3.polygon([(0, 550), (540, 590), (820, 720), (0, 720)], fill=(38, 36, 40))  # shingle beach
    d3.polygon([(140, 620), (260, 510), (420, 540), (350, 650)], fill=(64, 44, 30))  # shipwreck
    d3.line([(290, 540), (250, 390)], fill=(78, 54, 38), width=8)
    d3.rectangle([940, 230, 1020, 410], fill=(24, 26, 32))  # iron fortress
    d3.line([(820, 20), (860, 150), (835, 165), (885, 290)], fill=(215, 236, 255), width=3)
    m3.filter(ImageFilter.GaussianBlur(0.4)).save(out / "load-map3-coast.jpg", "JPEG", quality=88)

    # Map 4: Obsidian Caldera (ash-choked crimson sky, lava rivers, obsidian spires)
    m4 = Image.fromarray(paint_sky((36, 14, 16), (126, 38, 22), seed_off=40), "RGB")
    add_ridges(m4, 340, 75, (24, 18, 22), 0.007, 1.1)
    d4 = ImageDraw.Draw(m4)
    d4.polygon([(0, 440), (w, 440), (w, h), (0, h)], fill=(20, 16, 18))
    d4.polygon([(540, 440), (620, 440), (860, 720), (360, 720)], fill=(235, 88, 24))  # lava river
    d4.polygon([(570, 440), (600, 440), (740, 720), (480, 720)], fill=(255, 198, 72))
    for sx, top_y in [(240, 180), (420, 250), (920, 160), (1080, 240)]:
        d4.polygon([(sx - 45, 520), (sx, top_y), (sx + 45, 520)], fill=(16, 14, 20))
    m4 = m4.convert("RGBA")
    m4.alpha_composite(radial_glow((w, h), (600, 560), 260, (255, 110, 32), 115))
    m4.convert("RGB").filter(ImageFilter.GaussianBlur(0.5)).save(out / "load-map4-caldera.jpg", "JPEG", quality=88)


def main() -> None:
    p2 = build_props_wave2()
    si = build_spellicons()
    build_uiskin()
    pr = build_projectiles()
    npcs = build_townnpcs()
    build_loadscreens()
    print(
        "Generated packs:",
        f"props-wave2={len(p2['frames'])}",
        f"spellicons={len(si['frames'])}",
        "uiskin=5 PNG + uiskin.css",
        f"projectiles={len(pr['frames'])}",
        f"townnpcs={len(npcs['frames'])}",
        "loadscreens=4 JPG",
    )


if __name__ == "__main__":
    main()
