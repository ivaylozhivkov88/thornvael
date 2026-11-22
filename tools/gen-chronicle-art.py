"""Generate dark-fantasy oil portraits for the 5 canonical Act III-IV bosses
and 9 gothic landscape illustrations for campaign story slides.

Outputs:
  - public/townart/mon/{elder-juggernaut,lord-captain-korvus,arch-mage-malrik,
                        arch-warden-korrath,ember-overlord-vorak}.jpg (384x512)
  - public/art/slides/*.jpg (1280x720)
  - Registers all generated files in assets.json with license "own".
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Iterable, List, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MON_DIR = ROOT / "public" / "townart" / "mon"
SLIDES_DIR = ROOT / "public" / "art" / "slides"
ASSETS_JSON = ROOT / "assets.json"
SEED = 20261122


# ---------------------------------------------------------------------------
# Procedural Painterly Utilities (Deterministic Oil & Chiaroscuro Engine)
# ---------------------------------------------------------------------------

def rng_for(key: str) -> np.random.Generator:
    digest = hashlib.sha256(f"{SEED}:{key}".encode("utf-8")).digest()
    return np.random.default_rng(int.from_bytes(digest[:8], "little"))


def fbm_noise(h: int, w: int, key: str, octaves: Tuple[int, ...] = (4, 8, 16, 32, 64)) -> np.ndarray:
    rng = rng_for(key)
    acc = np.zeros((h, w), dtype=np.float32)
    weight_sum = 0.0
    for i, cells in enumerate(octaves):
        gh = max(2, cells)
        gw = max(2, int(round(cells * w / max(1, h))))
        grid = rng.random((gh, gw), dtype=np.float32)
        im = Image.fromarray((grid * 255).astype(np.uint8), "L").resize((w, h), Image.Resampling.BICUBIC)
        w_i = 0.5 ** i
        acc += (np.asarray(im, dtype=np.float32) / 255.0) * w_i
        weight_sum += w_i
    acc /= max(1e-5, weight_sum)
    return np.clip(acc, 0.0, 1.0)


def oil_canvas_finish(im: Image.Image, key: str, grain: float = 0.045, vignette: float = 0.42) -> Image.Image:
    """Apply subtle canvas weave, oil-impasto texture, and chiaroscuro edge vignette."""
    arr = np.asarray(im.convert("RGB"), dtype=np.float32) / 255.0
    h, w, _ = arr.shape

    # Multi-scale oil brush texture
    brush = fbm_noise(h, w, f"{key}:brush", (12, 28, 64))
    fine = rng_for(f"{key}:fine").normal(0.0, grain, (h, w, 1)).astype(np.float32)
    arr = arr * (0.91 + 0.18 * brush[..., None]) + fine

    # Chiaroscuro radial vignette
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    nx = (xx / max(1, w - 1)) * 2.0 - 1.0
    ny = (yy / max(1, h - 1)) * 2.0 - 1.0
    r2 = np.clip((nx * nx * 0.88 + ny * ny * 1.02) ** 0.85, 0.0, 1.5)
    vig = np.clip(1.0 - vignette * np.maximum(0.0, r2 - 0.35), 0.18, 1.0)
    arr *= vig[..., None]

    out = Image.fromarray(np.clip(arr * 255.0, 0, 255).astype(np.uint8), "RGB")
    return ImageEnhance.Contrast(out).enhance(1.08)


def radial_glow_layer(
    size: Tuple[int, int],
    center: Tuple[float, float],
    radius: float,
    color: Tuple[int, int, int],
    peak: float = 0.85,
    power: float = 2.0,
) -> Image.Image:
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt((xx - center[0]) ** 2 + (yy - center[1]) ** 2)
    t = (np.clip(1.0 - d / max(1.0, radius), 0.0, 1.0) ** power) * peak
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., 0] = color[0]
    rgba[..., 1] = color[1]
    rgba[..., 2] = color[2]
    rgba[..., 3] = np.clip(t * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def gradient_sky(
    w: int,
    h: int,
    top_rgb: Tuple[int, int, int],
    mid_rgb: Tuple[int, int, int],
    hor_rgb: Tuple[int, int, int],
    key: str,
    cloud_tint: Tuple[int, int, int],
) -> Image.Image:
    y = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    t1 = np.clip(y / 0.55, 0.0, 1.0)
    t2 = np.clip((y - 0.45) / 0.55, 0.0, 1.0)
    c_top = np.array(top_rgb, dtype=np.float32)[None, None, :]
    c_mid = np.array(mid_rgb, dtype=np.float32)[None, None, :]
    c_hor = np.array(hor_rgb, dtype=np.float32)[None, None, :]
    base = c_top * (1.0 - t1) + c_mid * t1
    base = base * (1.0 - t2) + c_hor * t2

    clouds = fbm_noise(h, w, f"{key}:clouds", (5, 10, 22, 48))
    cloud_mask = np.clip((clouds - 0.38) * 1.65, 0.0, 1.0) * (1.0 - 0.55 * y[..., 0])
    ct = np.array(cloud_tint, dtype=np.float32)[None, None, :]
    comp = base * (1.0 - 0.52 * cloud_mask[..., None]) + ct * (0.52 * cloud_mask[..., None])
    return Image.fromarray(np.clip(comp, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def add_sparks_or_rain(
    im: Image.Image,
    key: str,
    count: int,
    color: Tuple[int, int, int],
    kind: str = "embers",
) -> None:
    d = ImageDraw.Draw(im, "RGBA")
    rng = rng_for(key)
    w, h = im.size
    for _ in range(count):
        x = float(rng.uniform(0, w))
        y = float(rng.uniform(0, h))
        if kind == "rain":
            ln = float(rng.uniform(18, 42))
            al = int(rng.integers(45, 120))
            d.line([(x, y), (x - ln * 0.22, y + ln)], fill=(*color, al), width=1)
        elif kind == "snow":
            r = float(rng.uniform(1.0, 2.8))
            al = int(rng.integers(55, 150))
            d.ellipse((x - r, y - r, x + r, y + r), fill=(*color, al))
        else:
            r = float(rng.uniform(1.2, 3.6))
            dx = float(rng.uniform(-10, 10))
            dy = float(rng.uniform(-22, -6))
            al = int(rng.integers(120, 240))
            d.line([(x, y), (x + dx, y + dy)], fill=(*color, al // 2), width=max(1, int(r)))
            d.ellipse((x - r, y - r, x + r, y + r), fill=(*color, al))


def add_bronze_portrait_frame(im: Image.Image) -> Image.Image:
    """Apply the thin gilded bronze double-bevel border matching public/townart/mon/*.jpg."""
    w, h = im.size
    out = im.copy()
    d = ImageDraw.Draw(out)
    # Outer dark shadow edge
    d.rectangle((0, 0, w - 1, h - 1), outline=(14, 10, 7))
    # Bronze/gold rim matching existing portraits
    d.rectangle((2, 2, w - 3, h - 3), outline=(168, 126, 66), width=2)
    d.rectangle((4, 4, w - 5, h - 5), outline=(92, 66, 34), width=1)
    d.rectangle((5, 5, w - 6, h - 6), outline=(22, 16, 12), width=1)
    # Subtle corner rivets
    for rx, ry in [(7, 7), (w - 8, 7), (7, h - 8), (w - 8, h - 8)]:
        d.ellipse((rx - 2, ry - 2, rx + 2, ry + 2), fill=(196, 152, 82), outline=(48, 32, 16))
    return out


def shade_poly(
    im: Image.Image,
    pts: List[Tuple[float, float]],
    base_rgb: Tuple[int, int, int],
    hi_rgb: Tuple[int, int, int],
    sh_rgb: Tuple[int, int, int],
    outline_rgb: Tuple[int, int, int] = (14, 10, 10),
    rim_side: str = "left",
) -> None:
    d = ImageDraw.Draw(im, "RGBA")
    d.polygon(pts, fill=(*base_rgb, 255), outline=(*outline_rgb, 255), width=2)
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    # Inner bevel highlight / shadow
    hi_pts = [
        (p[0] * 0.84 + cx * 0.16 - (4 if rim_side == "left" else -4), p[1] * 0.84 + cy * 0.16 - 3)
        for p in pts
    ]
    sh_pts = [
        (p[0] * 0.88 + cx * 0.12 + (5 if rim_side == "left" else -5), p[1] * 0.88 + cy * 0.12 + 4)
        for p in pts
    ]
    d.polygon(sh_pts, fill=(*sh_rgb, 115))
    d.polygon(hi_pts, fill=(*hi_rgb, 95))
    d.line([pts[0], pts[1]], fill=(*hi_rgb, 180), width=2)


# ---------------------------------------------------------------------------
# Boss Portraits (384x512 dark-fantasy oil paintings matching townart/mon/*)
# ---------------------------------------------------------------------------

def paint_portrait_base(w: int, h: int, bg_dark: Tuple[int, int, int], bg_glow: Tuple[int, int, int], key: str) -> Image.Image:
    im = gradient_sky(w, h, bg_dark, bg_glow, (10, 8, 8), key, bg_glow)
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (w * 0.5, h * 0.36), w * 0.85, bg_glow, peak=0.65, power=1.6))
    return im


def build_elder_juggernaut() -> Image.Image:
    w, h = 384, 512
    im = paint_portrait_base(w, h, (20, 26, 28), (68, 56, 36), "elder-juggernaut")
    d = ImageDraw.Draw(im, "RGBA")

    # Highland granite ridges in mist
    d.polygon([(0, 420), (85, 290), (155, 340), (260, 265), (384, 385), (384, 512), (0, 512)], fill=(26, 32, 34, 235))
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (192, 315), 145, (255, 145, 42), peak=0.55, power=1.9))

    # Colossal stone shoulders & torso
    shade_poly(im, [(28, 512), (48, 255), (125, 195), (259, 195), (336, 255), (356, 512)],
               (72, 74, 70), (124, 128, 118), (34, 36, 36))
    # Left & right slab pauldrons
    shade_poly(im, [(24, 310), (36, 200), (105, 162), (146, 215), (128, 328)],
               (86, 88, 82), (146, 148, 134), (40, 42, 42), rim_side="left")
    shade_poly(im, [(360, 310), (348, 200), (279, 162), (238, 215), (256, 328)],
               (74, 76, 72), (122, 126, 116), (34, 36, 36), rim_side="right")

    # Craggy monolith head
    shade_poly(im, [(148, 222), (138, 135), (168, 92), (216, 92), (246, 135), (236, 222)],
               (90, 92, 86), (152, 154, 138), (42, 44, 42))
    # Moss patches
    d = ImageDraw.Draw(im, "RGBA")
    for mx, my, mr in [(84, 212, 22), (288, 226, 24), (176, 112, 16)]:
        d.ellipse((mx - mr, my - mr // 2, mx + mr, my + mr // 2), fill=(52, 78, 44, 175))

    # Glowing amber tectonic fissures & eyes
    fissures = [
        [(192, 245), (170, 290), (195, 330), (178, 390), (205, 455)],
        [(192, 295), (238, 312), (268, 360)],
        [(182, 315), (132, 342), (108, 390)],
        [(154, 165), (186, 178), (202, 178), (230, 165)],
    ]
    for path in fissures:
        d.line(path, fill=(255, 132, 28, 190), width=6)
        d.line(path, fill=(255, 220, 120, 245), width=2)
    # Glowing eyes
    for ex in (170, 214):
        d.ellipse((ex - 11, 142, ex + 11, 156), fill=(255, 140, 32, 240))
        d.ellipse((ex - 5, 145, ex + 5, 153), fill=(255, 245, 185, 255))

    add_sparks_or_rain(im, "elder-juggernaut:sparks", 28, (255, 165, 65), "embers")
    out = oil_canvas_finish(im, "elder-juggernaut")
    return add_bronze_portrait_frame(out)


def build_lord_captain_korvus() -> Image.Image:
    w, h = 384, 512
    im = paint_portrait_base(w, h, (28, 16, 16), (138, 52, 22), "lord-captain-korvus")
    d = ImageDraw.Draw(im, "RGBA")

    # Burning harbor masts & pier behind
    d.line([(55, 420), (75, 80)], fill=(26, 18, 16, 220), width=8)
    d.line([(20, 175), (145, 148)], fill=(26, 18, 16, 220), width=5)
    d.line([(325, 420), (305, 105)], fill=(26, 18, 16, 220), width=7)
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (78, 340), 150, (255, 105, 25), peak=0.55, power=1.7))

    # Heavy naval cloak & scorched steel plate
    shade_poly(im, [(32, 512), (56, 248), (135, 200), (249, 200), (328, 248), (352, 512)],
               (56, 58, 64), (108, 114, 124), (24, 24, 28))
    shade_poly(im, [(38, 265), (96, 196), (148, 232), (120, 336), (48, 332)],
               (72, 74, 80), (142, 138, 134), (28, 28, 32), rim_side="left")
    shade_poly(im, [(346, 265), (288, 196), (236, 232), (264, 336), (336, 332)],
               (64, 66, 72), (128, 126, 122), (26, 26, 30), rim_side="right")

    # Hooked anchor chains across chest + heavy iron anchors
    d = ImageDraw.Draw(im, "RGBA")
    for chain in [
        [(82, 248), (192, 342), (304, 252)],
        [(76, 326), (192, 410), (312, 326)],
    ]:
        d.line(chain, fill=(28, 24, 22, 255), width=11)
        d.line(chain, fill=(148, 134, 118, 235), width=4)
    # Left & right iron anchor flukes peeking by shoulders
    for ax, dirx in [(66, -1), (318, 1)]:
        d.line([(ax, 385), (ax + 12 * dirx, 190)], fill=(120, 122, 128, 255), width=9)
        d.arc((ax - 34, 158, ax + 34, 222), 180, 360, fill=(176, 174, 168, 255), width=7)

    # Crested naval war-helm with glowing ember visor
    shade_poly(im, [(144, 224), (142, 126), (192, 74), (242, 126), (240, 224), (192, 246)],
               (74, 76, 84), (154, 152, 150), (26, 28, 32))
    d = ImageDraw.Draw(im, "RGBA")
    # Helm crest & visor slit
    d.polygon([(184, 74), (192, 46), (200, 74), (200, 140), (184, 140)], fill=(146, 114, 68, 255))
    d.polygon([(156, 148), (192, 158), (228, 148), (222, 166), (192, 174), (162, 166)], fill=(16, 10, 10, 255))
    for ex in (174, 210):
        d.ellipse((ex - 7, 152, ex + 7, 162), fill=(255, 86, 24, 255))
        d.ellipse((ex - 3, 155, ex + 3, 159), fill=(255, 225, 130, 255))

    add_sparks_or_rain(im, "korvus:embers", 45, (255, 128, 42), "embers")
    out = oil_canvas_finish(im, "lord-captain-korvus")
    return add_bronze_portrait_frame(out)


def build_arch_mage_malrik() -> Image.Image:
    w, h = 384, 512
    im = paint_portrait_base(w, h, (16, 14, 34), (84, 42, 128), "arch-mage-malrik")
    d = ImageDraw.Draw(im, "RGBA")

    # Ashveil crags & violet lightning sky
    d.polygon([(0, 420), (90, 285), (175, 360), (290, 255), (384, 370), (384, 512), (0, 512)], fill=(20, 16, 30, 235))
    d.line([(68, 45), (96, 120), (76, 155), (118, 235)], fill=(196, 156, 255, 220), width=3)

    # Hooded conspirator cloak & gold-trimmed Iron Pact vestments
    shade_poly(im, [(48, 512), (76, 252), (144, 185), (240, 185), (308, 252), (336, 512)],
               (42, 28, 62), (96, 62, 132), (18, 12, 28))
    # Deep pointed hood
    shade_poly(im, [(126, 226), (132, 118), (192, 62), (252, 118), (258, 226)],
               (52, 34, 76), (118, 78, 164), (20, 14, 32))
    d = ImageDraw.Draw(im, "RGBA")
    # Hood shadow & gaunt scarred face
    d.polygon([(148, 214), (150, 126), (192, 94), (234, 126), (236, 214)], fill=(16, 10, 22, 255))
    d.polygon([(164, 198), (162, 134), (192, 118), (222, 134), (220, 198), (192, 218)], fill=(138, 124, 128, 255))
    d.polygon([(192, 118), (222, 134), (220, 198), (192, 218)], fill=(78, 68, 78, 190))
    # Blindfolded/glowing astral eyes & cipher runes on stole
    for ex in (176, 208):
        d.ellipse((ex - 7, 152, ex + 7, 162), fill=(195, 115, 255, 255))
        d.ellipse((ex - 3, 155, ex + 3, 159), fill=(250, 240, 255, 255))
    d.line([(162, 228), (168, 490)], fill=(198, 158, 78, 235), width=6)
    d.line([(222, 228), (216, 490)], fill=(198, 158, 78, 235), width=6)

    # Raised hand & crackling violet cipher-orb
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (294, 295), 95, (186, 98, 255), peak=0.85, power=1.7))
    d = ImageDraw.Draw(im, "RGBA")
    d.ellipse((274, 275, 314, 315), fill=(235, 195, 255, 230), outline=(156, 86, 255, 255), width=3)
    d.line([(294, 295), (252, 250), (272, 220)], fill=(228, 190, 255, 230), width=3)
    d.line([(294, 295), (332, 240), (318, 200)], fill=(228, 190, 255, 230), width=2)
    # Cipher staff in left hand
    d.line([(86, 495), (104, 118)], fill=(116, 94, 62, 255), width=7)
    d.polygon([(104, 82), (122, 114), (104, 146), (86, 114)], fill=(182, 134, 255, 245), outline=(245, 225, 255, 255))

    add_sparks_or_rain(im, "malrik:sparks", 32, (208, 150, 255), "embers")
    out = oil_canvas_finish(im, "arch-mage-malrik")
    return add_bronze_portrait_frame(out)


def build_arch_warden_korrath() -> Image.Image:
    w, h = 384, 512
    im = paint_portrait_base(w, h, (16, 24, 38), (56, 102, 142), "arch-warden-korrath")
    d = ImageDraw.Draw(im, "RGBA")

    # Frozen marble cathedral pillars behind
    for px in (46, 304):
        d.rectangle((px, 40, px + 34, 490), fill=(36, 48, 62, 200), outline=(74, 98, 122, 180))
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (192, 185), 160, (120, 210, 255), peak=0.58, power=1.7))

    # Towering white-granite plate & sculpted marble shoulders
    shade_poly(im, [(38, 512), (54, 246), (132, 194), (252, 194), (330, 246), (346, 512)],
               (144, 152, 162), (214, 224, 234), (62, 74, 88))
    shade_poly(im, [(28, 286), (48, 196), (120, 174), (148, 232), (112, 326)],
               (158, 166, 176), (226, 236, 244), (68, 80, 96), rim_side="left")
    shade_poly(im, [(356, 286), (336, 196), (264, 174), (236, 232), (272, 326)],
               (136, 144, 154), (202, 214, 226), (56, 68, 82), rim_side="right")

    # Twin white-granite greatswords framing chest
    d = ImageDraw.Draw(im, "RGBA")
    for sx1, sy1, sx2, sy2 in [(92, 485, 118, 130), (292, 485, 266, 130)]:
        d.line([(sx1, sy1), (sx2, sy2)], fill=(196, 212, 228, 255), width=11)
        d.line([(sx1, sy1), (sx2, sy2)], fill=(238, 248, 255, 255), width=3)
    # Azure Sigil of Order on breastplate
    d.polygon([(192, 246), (224, 300), (192, 354), (160, 300)], fill=(68, 154, 220, 220), outline=(186, 235, 255, 255), width=2)

    # Crowned petrified sentinel helm
    shade_poly(im, [(146, 216), (144, 114), (192, 62), (240, 114), (238, 216), (192, 238)],
               (162, 170, 180), (232, 240, 248), (68, 78, 92))
    d = ImageDraw.Draw(im, "RGBA")
    # Crown spikes
    for cx in (154, 174, 192, 210, 230):
        h_sp = 36 if cx == 192 else 26
        d.polygon([(cx - 7, 102), (cx, 102 - h_sp), (cx + 7, 102)], fill=(198, 210, 222, 255), outline=(66, 78, 92, 255))
    # Freezing azure visor eyes
    d.polygon([(158, 144), (192, 152), (226, 144), (222, 162), (192, 168), (162, 162)], fill=(24, 32, 44, 255))
    for ex in (174, 210):
        d.ellipse((ex - 7, 149, ex + 7, 159), fill=(110, 215, 255, 255))
        d.ellipse((ex - 3, 152, ex + 3, 156), fill=(240, 252, 255, 255))

    add_sparks_or_rain(im, "korrath:frost", 36, (175, 230, 255), "snow")
    out = oil_canvas_finish(im, "arch-warden-korrath")
    return add_bronze_portrait_frame(out)


def build_ember_overlord_vorak() -> Image.Image:
    w, h = 384, 512
    im = paint_portrait_base(w, h, (26, 10, 8), (178, 52, 16), "ember-overlord-vorak")
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (192, 300), 175, (255, 112, 24), peak=0.72, power=1.6))
    d = ImageDraw.Draw(im, "RGBA")

    # Volcanic obsidian spires behind
    d.polygon([(0, 440), (42, 120), (96, 280), (288, 270), (342, 110), (384, 440), (384, 512), (0, 512)], fill=(22, 12, 12, 230))

    # Massive jagged obsidian armor & horned pauldrons
    shade_poly(im, [(28, 512), (48, 242), (130, 186), (254, 186), (336, 242), (356, 512)],
               (42, 32, 32), (88, 56, 46), (16, 10, 10))
    shade_poly(im, [(18, 284), (36, 174), (112, 150), (146, 218), (114, 330)],
               (52, 38, 36), (118, 72, 52), (18, 12, 12), rim_side="left")
    shade_poly(im, [(366, 284), (348, 174), (272, 150), (238, 218), (270, 330)],
               (46, 34, 34), (104, 62, 46), (16, 10, 10), rim_side="right")

    # Open volcanic furnace ribs across chest
    d = ImageDraw.Draw(im, "RGBA")
    d.polygon([(148, 246), (236, 246), (222, 405), (162, 405)], fill=(255, 118, 24, 240))
    d.polygon([(164, 260), (220, 260), (210, 388), (174, 388)], fill=(255, 225, 115, 245))
    for ry in (272, 310, 348, 384):
        d.line([(136, ry), (248, ry)], fill=(38, 28, 28, 255), width=12)
        d.line([(136, ry), (248, ry)], fill=(96, 58, 44, 220), width=3)

    # Jagged Crown-Helm with curving magma horns
    d.polygon([(148, 130), (104, 72), (76, 36), (120, 56), (164, 112)], fill=(48, 34, 32, 255), outline=(146, 82, 44, 255))
    d.polygon([(236, 130), (280, 72), (308, 36), (264, 56), (220, 112)], fill=(48, 34, 32, 255), outline=(146, 82, 44, 255))
    shade_poly(im, [(146, 212), (144, 112), (192, 68), (240, 112), (238, 212), (192, 234)],
               (48, 36, 36), (112, 68, 52), (18, 12, 12))
    d = ImageDraw.Draw(im, "RGBA")
    for ex in (172, 212):
        d.ellipse((ex - 9, 142, ex + 9, 156), fill=(255, 110, 20, 255))
        d.ellipse((ex - 4, 145, ex + 4, 153), fill=(255, 244, 175, 255))

    add_sparks_or_rain(im, "vorak:embers", 58, (255, 154, 48), "embers")
    out = oil_canvas_finish(im, "ember-overlord-vorak")
    return add_bronze_portrait_frame(out)


# ---------------------------------------------------------------------------
# Story Slide Illustrations (1280x720 Gothic Chronicles)
# ---------------------------------------------------------------------------

def draw_hills(im: Image.Image, pts_list: List[Tuple[List[Tuple[float, float]], Tuple[int, int, int]]]) -> None:
    d = ImageDraw.Draw(im, "RGBA")
    for pts, rgb in pts_list:
        d.polygon(pts, fill=(*rgb, 255))


def draw_crow(d: ImageDraw.ImageDraw, x: float, y: float, s: float) -> None:
    d.line([(x - 14 * s, y + 3 * s), (x - 5 * s, y - 4 * s), (x, y), (x + 6 * s, y - 5 * s), (x + 15 * s, y + 2 * s)],
           fill=(14, 14, 18, 235), width=max(1, int(2.2 * s)))


def build_slide_act1_thornwick_rain() -> Image.Image:
    w, h = 1280, 720
    im = gradient_sky(w, h, (18, 24, 28), (34, 44, 44), (62, 58, 48), "s1_rain", (48, 58, 62))
    # Distant Greywood ridge & timber watchtower
    draw_hills(im, [
        ([(0, 440), (220, 320), (480, 385), (820, 295), (1120, 360), (1280, 330), (1280, 720), (0, 720)], (24, 30, 28)),
        ([(0, 470), (310, 415), (690, 445), (1040, 400), (1280, 435), (1280, 720), (0, 720)], (18, 24, 22)),
    ])
    # River shallows across lower foreground
    d = ImageDraw.Draw(im, "RGBA")
    d.polygon([(0, 505), (1280, 488), (1280, 720), (0, 720)], fill=(26, 36, 40, 255))
    # Burned watchtower silhouette & timber ford crossing
    d.polygon([(260, 485), (278, 240), (328, 240), (346, 485)], fill=(16, 14, 14, 255))
    d.polygon([(268, 242), (303, 195), (338, 242)], fill=(18, 14, 14, 255))
    for px in range(180, 1140, 62):
        d.line([(px, 535), (px + 4, 495)], fill=(38, 28, 22, 230), width=6)
    d.line([(160, 515), (1160, 505)], fill=(48, 36, 26, 235), width=8)
    # Funeral pyres reflecting in water
    for fx, fy in [(480, 480), (775, 472), (960, 482)]:
        im = Image.alpha_composite(im, radial_glow_layer((w, h), (fx, fy), 145, (255, 118, 34), peak=0.72, power=1.9))
        im = Image.alpha_composite(im, radial_glow_layer((w, h), (fx, fy + 85), 95, (235, 98, 28), peak=0.35, power=2.2))
        d = ImageDraw.Draw(im, "RGBA")
        d.polygon([(fx - 26, fy + 22), (fx, fy - 24), (fx + 28, fy + 22)], fill=(255, 152, 48, 220))
    for cx, cy, cs in [(420, 180, 1.3), (520, 150, 1.0), (630, 195, 1.2), (820, 145, 0.9)]:
        draw_crow(d, cx, cy, cs)
    add_sparks_or_rain(im, "s1_rain_drops", 260, (168, 184, 194), "rain")
    return oil_canvas_finish(im, "s1_rain")


def build_slide_act1_ashbrook_gate() -> Image.Image:
    w, h = 1280, 720
    im = gradient_sky(w, h, (26, 20, 22), (62, 34, 28), (112, 52, 32), "s1_gate", (84, 42, 34))
    draw_hills(im, [
        ([(0, 460), (260, 380), (620, 420), (980, 355), (1280, 415), (1280, 720), (0, 720)], (22, 18, 18)),
    ])
    d = ImageDraw.Draw(im, "RGBA")
    # Fortified Ashbrook gatehouse silhouette
    d.rectangle((420, 230, 560, 540), fill=(26, 22, 22, 255))
    d.rectangle((720, 230, 860, 540), fill=(26, 22, 22, 255))
    d.rectangle((540, 290, 740, 540), fill=(20, 16, 18, 255))
    # Battlements
    for bx in range(420, 860, 36):
        d.rectangle((bx, 208, bx + 20, 236), fill=(28, 22, 22, 255))
    # Open glowing gate arch
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (640, 445), 210, (255, 124, 38), peak=0.75, power=1.7))
    d = ImageDraw.Draw(im, "RGBA")
    d.chord((580, 370, 700, 560), 180, 360, fill=(255, 165, 68, 185))
    d.rectangle((580, 460, 700, 545), fill=(220, 108, 38, 165))
    # Muddy road & vanguard silhouettes with pikes
    d.polygon([(0, 540), (1280, 535), (1280, 720), (0, 720)], fill=(18, 14, 14, 255))
    for vx in [290, 340, 385, 895, 945, 995]:
        d.ellipse((vx - 12, 470, vx + 12, 496), fill=(12, 10, 12, 255))
        d.polygon([(vx - 16, 565), (vx - 10, 496), (vx + 10, 496), (vx + 16, 565)], fill=(12, 10, 12, 255))
        d.line([(vx + 10, 565), (vx + 22, 395)], fill=(38, 32, 30, 240), width=3)
    add_sparks_or_rain(im, "s1_gate_ash", 75, (255, 142, 56), "embers")
    return oil_canvas_finish(im, "s1_gate")


def build_slide_act2_redmarsh_stilts() -> Image.Image:
    w, h = 1280, 720
    im = gradient_sky(w, h, (42, 22, 14), (108, 52, 26), (176, 94, 42), "s2_stilts", (142, 74, 36))
    # Copper sun haze
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (920, 215), 240, (255, 166, 72), peak=0.72, power=1.8))
    d = ImageDraw.Draw(im, "RGBA")
    d.ellipse((875, 170, 965, 260), fill=(255, 212, 128, 215))
    # Cracked alkali brine flats
    d.polygon([(0, 465), (1280, 455), (1280, 720), (0, 720)], fill=(52, 34, 24, 255))
    d.polygon([(0, 520), (1280, 510), (1280, 720), (0, 720)], fill=(38, 24, 18, 255))
    # Prehistoric leviathan ribcage silhouettes
    for rx, rh in [(190, 260), (255, 290), (320, 270), (385, 240)]:
        d.arc((rx - 40, 480 - rh, rx + 65, 560), 170, 320, fill=(142, 126, 106, 220), width=11)
    # Stilt-town platforms & rope bridges
    for sx, sw, sy in [(470, 240, 355), (770, 220, 375)]:
        for leg in range(sx + 18, sx + sw - 10, 48):
            d.line([(leg, sy + 18), (leg - 12, 545)], fill=(28, 18, 14, 255), width=8)
        d.rectangle((sx, sy, sx + sw, sy + 20), fill=(36, 24, 18, 255))
        d.polygon([(sx + 20, sy), (sx + sw // 2, sy - 68), (sx + sw - 20, sy)], fill=(24, 16, 14, 255))
    d.arc((685, 345, 795, 415), 10, 170, fill=(44, 30, 22, 240), width=5)
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (590, 340), 70, (255, 160, 62), peak=0.6, power=1.8))
    add_sparks_or_rain(im, "s2_stilts_dust", 50, (226, 152, 86), "snow")
    return oil_canvas_finish(im, "s2_stilts")


def build_slide_act2_dry_cistern() -> Image.Image:
    w, h = 1280, 720
    im = gradient_sky(w, h, (26, 20, 22), (76, 48, 38), (128, 86, 56), "s2_cistern", (96, 62, 46))
    # Towering basalt canyon walls & Ironheart sluice arch
    draw_hills(im, [
        ([(0, 80), (260, 140), (390, 460), (0, 520)], (26, 22, 24)),
        ([(1280, 60), (1020, 130), (890, 460), (1280, 520)], (24, 20, 22)),
    ])
    d = ImageDraw.Draw(im, "RGBA")
    # Sluice gate monolith in center
    d.rectangle((420, 165, 860, 490), fill=(34, 30, 32, 255))
    d.chord((515, 225, 765, 515), 180, 360, fill=(14, 12, 14, 255))
    # Frost rim around sluice pipes
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (640, 315), 190, (132, 198, 232), peak=0.42, power=2.0))
    d = ImageDraw.Draw(im, "RGBA")
    # Cracked dry red silt floor
    d.polygon([(0, 485), (1280, 485), (1280, 720), (0, 720)], fill=(58, 36, 26, 255))
    rng = rng_for("s2_cistern_cracks")
    for _ in range(38):
        x1 = float(rng.uniform(40, 1240))
        y1 = float(rng.uniform(500, 705))
        d.line([(x1, y1), (x1 + float(rng.uniform(-90, 90)), y1 + float(rng.uniform(-18, 22)))],
               fill=(26, 16, 12, 210), width=2)
    add_sparks_or_rain(im, "s2_cistern_dust", 60, (196, 152, 114), "snow")
    return oil_canvas_finish(im, "s2_cistern")


def build_slide_act3_oakhaven_cliffs() -> Image.Image:
    w, h = 1280, 720
    im = gradient_sky(w, h, (12, 18, 28), (28, 44, 64), (56, 76, 94), "s3_cliffs", (44, 62, 82))
    # Stormy western sea
    d = ImageDraw.Draw(im, "RGBA")
    d.polygon([(0, 425), (1280, 425), (1280, 720), (0, 720)], fill=(18, 28, 38, 255))
    # White sea-foam streaks
    for wy in [460, 505, 560, 620]:
        d.line([(520, wy), (1220, wy + 8)], fill=(136, 162, 178, 85), width=3)
    # Towering sheer cliff & ironwood pines on left
    d.polygon([(0, 95), (360, 145), (560, 460), (620, 720), (0, 720)], fill=(16, 20, 24, 255))
    for tx, ty in [(95, 110), (165, 125), (245, 140)]:
        d.polygon([(tx, ty - 85), (tx - 38, ty + 20), (tx + 38, ty + 20)], fill=(10, 16, 18, 255))
    # Shipwright crane & evacuation caravel hull on slipway
    d.line([(480, 470), (545, 225)], fill=(22, 18, 16, 255), width=9)
    d.line([(545, 225), (690, 265)], fill=(22, 18, 16, 255), width=6)
    d.polygon([(580, 470), (880, 455), (840, 535), (610, 535)], fill=(26, 20, 18, 255))
    d.line([(725, 465), (725, 275)], fill=(22, 18, 16, 255), width=7)
    # Lighthouse silver-gold beacon
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (335, 168), 160, (242, 212, 132), peak=0.75, power=1.7))
    add_sparks_or_rain(im, "s3_cliffs_rain", 210, (158, 178, 196), "rain")
    return oil_canvas_finish(im, "s3_cliffs")


def build_slide_act3_burning_harbor() -> Image.Image:
    w, h = 1280, 720
    im = gradient_sky(w, h, (24, 12, 16), (78, 24, 22), (146, 52, 26), "s3_harbor", (112, 34, 24))
    d = ImageDraw.Draw(im, "RGBA")
    # Dark churning harbor surf
    d.polygon([(0, 455), (1280, 455), (1280, 720), (0, 720)], fill=(18, 18, 24, 255))
    # Distant white sails escaping beyond the horizon
    for sx, sy, sc in [(950, 395, 1.0), (1045, 405, 0.78), (1125, 412, 0.6)]:
        d.polygon([(sx, sy - 64 * sc), (sx - 26 * sc, sy + 12 * sc), (sx + 24 * sc, sy + 12 * sc)], fill=(214, 218, 226, 215))
        d.polygon([(sx - 28 * sc, sy + 16 * sc), (sx + 28 * sc, sy + 16 * sc), (sx + 18 * sc, sy + 28 * sc), (sx - 18 * sc, sy + 28 * sc)],
                  fill=(24, 20, 22, 255))
    # Burning eastern granite war pier in foreground
    d.polygon([(0, 490), (740, 465), (820, 720), (0, 720)], fill=(20, 16, 18, 255))
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (310, 415), 250, (255, 108, 26), peak=0.82, power=1.7))
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (580, 440), 175, (255, 145, 42), peak=0.68, power=1.8))
    d = ImageDraw.Draw(im, "RGBA")
    # Silhouettes of burning cranes & rearguard banner
    d.line([(245, 480), (245, 245)], fill=(12, 10, 12, 255), width=8)
    d.polygon([(245, 255), (345, 275), (245, 315)], fill=(138, 32, 24, 235))
    add_sparks_or_rain(im, "s3_harbor_embers", 120, (255, 146, 48), "embers")
    return oil_canvas_finish(im, "s3_harbor")


def build_slide_act4_highcrest_spire() -> Image.Image:
    w, h = 1280, 720
    im = gradient_sky(w, h, (18, 12, 28), (64, 24, 52), (146, 46, 32), "s4_highcrest", (92, 34, 58))
    # Magma glow from the Obsidian Caldera valley
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (860, 520), 340, (255, 92, 24), peak=0.72, power=1.8))
    # Jagged volcanic peaks & Infernal Citadel silhouette in distance
    draw_hills(im, [
        ([(0, 460), (210, 260), (430, 430), (690, 210), (920, 390), (1120, 180), (1280, 360), (1280, 720), (0, 720)], (18, 14, 20)),
    ])
    d = ImageDraw.Draw(im, "RGBA")
    # Infernal Sanctuary black monolith on right peak
    d.polygon([(825, 420), (855, 145), (905, 145), (935, 420)], fill=(12, 10, 14, 255))
    d.polygon([(855, 145), (880, 82), (905, 145)], fill=(12, 10, 14, 255))
    # Highcrest alpine citadel spine on left with glowing blue wardstones
    d.polygon([(0, 720), (0, 240), (185, 175), (365, 290), (490, 720)], fill=(20, 22, 28, 255))
    d.rectangle((140, 115, 230, 230), fill=(22, 24, 32, 255))
    for wx, wy in [(125, 215), (245, 225), (315, 280)]:
        im = Image.alpha_composite(im, radial_glow_layer((w, h), (wx, wy), 55, (92, 188, 255), peak=0.82, power=1.8))
        d = ImageDraw.Draw(im, "RGBA")
        d.polygon([(wx, wy - 20), (wx - 8, wy + 12), (wx + 8, wy + 12)], fill=(158, 228, 255, 245))
    # Molten rivers snaking across caldera floor
    d.line([(480, 680), (740, 560), (1040, 495), (1260, 595)], fill=(255, 128, 36, 220), width=12)
    d.line([(480, 680), (740, 560), (1040, 495), (1260, 595)], fill=(255, 224, 128, 245), width=4)
    add_sparks_or_rain(im, "s4_highcrest_ash", 85, (255, 152, 68), "embers")
    return oil_canvas_finish(im, "s4_highcrest")


def build_slide_ending_a_purging() -> Image.Image:
    w, h = 1280, 720
    im = gradient_sky(w, h, (26, 48, 78), (64, 108, 148), (206, 176, 124), "sea_purging", (148, 184, 212))
    # Golden-blue solar dawn shaft breaking through clouds
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (640, 215), 360, (255, 232, 168), peak=0.72, power=1.7))
    # Cooled black basalt peaks & emerald hills of Thornwick
    draw_hills(im, [
        ([(0, 450), (240, 310), (540, 395), (860, 285), (1280, 390), (1280, 720), (0, 720)], (36, 46, 56)),
        ([(0, 515), (380, 455), (780, 490), (1280, 445), (1280, 720), (0, 720)], (34, 52, 38)),
    ])
    d = ImageDraw.Draw(im, "RGBA")
    # Shattered marble pillars of the Crown Vault cooling in foreground
    for px, ph in [(135, 360), (245, 260), (1035, 290), (1145, 380)]:
        d.rectangle((px, 720 - ph, px + 44, 720), fill=(94, 104, 114, 245), outline=(172, 186, 198, 210))
    # Winding silver river toward returning sails on horizon
    d.polygon([(520, 720), (630, 495), (675, 495), (760, 720)], fill=(122, 164, 194, 220))
    add_sparks_or_rain(im, "sea_purging_motes", 48, (255, 240, 186), "snow")
    return oil_canvas_finish(im, "sea_purging", vignette=0.28)


def build_slide_ending_b_sovereign() -> Image.Image:
    w, h = 1280, 720
    im = gradient_sky(w, h, (16, 8, 10), (74, 18, 16), (168, 52, 22), "seb_sovereign", (118, 28, 20))
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (640, 330), 320, (255, 112, 28), peak=0.78, power=1.6))
    d = ImageDraw.Draw(im, "RGBA")
    # Obsidian cathedral steps & dark throne dais
    for step in range(5):
        y = 530 + step * 34
        inset = 380 - step * 55
        d.rectangle((inset, y, 1280 - inset, y + 34), fill=(24 + step * 3, 16, 18, 255), outline=(72, 36, 26, 200))
    # Jagged Obsidian Iron Throne
    d.polygon([(555, 530), (575, 240), (615, 290), (640, 190), (665, 290), (705, 240), (725, 530)],
              fill=(18, 14, 16, 255), outline=(146, 72, 38, 230), width=2)
    # Blazing Crown of Thorns and Cinder hovering above throne
    im = Image.alpha_composite(im, radial_glow_layer((w, h), (640, 235), 115, (255, 192, 72), peak=0.9, power=1.6))
    d = ImageDraw.Draw(im, "RGBA")
    d.polygon([(590, 260), (582, 205), (610, 232), (625, 185), (640, 225), (655, 185), (670, 232), (698, 205), (690, 260)],
              fill=(255, 186, 68, 245), outline=(92, 28, 14, 255), width=2)
    # Crimson velvet standards flanking throne
    for bx in (260, 390, 890, 1020):
        d.line([(bx, 560), (bx, 150)], fill=(48, 34, 28, 255), width=6)
        d.polygon([(bx - 28, 175), (bx + 28, 175), (bx + 28, 390), (bx, 425), (bx - 28, 390)],
                  fill=(116, 18, 22, 240), outline=(196, 142, 66, 220))
    add_sparks_or_rain(im, "seb_sovereign_embers", 110, (255, 152, 48), "embers")
    return oil_canvas_finish(im, "seb_sovereign")


# ---------------------------------------------------------------------------
# Provenance Sync & Entry Point
# ---------------------------------------------------------------------------

def register_assets(entries: List[Tuple[str, str]]) -> None:
    data = json.loads(ASSETS_JSON.read_text(encoding="utf-8"))
    by_path = {a["path"]: a for a in data["assets"]}
    for rel_path, note in entries:
        by_path[rel_path] = {
            "path": rel_path,
            "license": "own",
            "source": "tools/gen-chronicle-art.py",
            "note": note,
        }
    data["assets"] = list(by_path.values())
    ASSETS_JSON.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    MON_DIR.mkdir(parents=True, exist_ok=True)
    SLIDES_DIR.mkdir(parents=True, exist_ok=True)

    portraits = [
        ("elder-juggernaut.jpg", build_elder_juggernaut, "Painted chiaroscuro oil portrait for Act III boss Elder Juggernaut"),
        ("lord-captain-korvus.jpg", build_lord_captain_korvus, "Painted chiaroscuro oil portrait for Act III boss Lord-Captain Korvus"),
        ("arch-mage-malrik.jpg", build_arch_mage_malrik, "Painted chiaroscuro oil portrait for Act IV traitor Arch-Mage Malrik"),
        ("arch-warden-korrath.jpg", build_arch_warden_korrath, "Painted chiaroscuro oil portrait for Act IV Path of Order boss Arch-Warden Korrath"),
        ("ember-overlord-vorak.jpg", build_ember_overlord_vorak, "Painted chiaroscuro oil portrait for Act IV Path of Ember boss Ember Overlord Vorak"),
    ]

    slides = [
        ("slide_act1_thornwick_rain.jpg", build_slide_act1_thornwick_rain, "Act I gothic rain-swept Border Fords story slide backdrop (1280x720)"),
        ("slide_act1_ashbrook_gate.jpg", build_slide_act1_ashbrook_gate, "Act I Ashbrook Gatehouse twilight siege story slide backdrop (1280x720)"),
        ("slide_act2_redmarsh_stilts.jpg", build_slide_act2_redmarsh_stilts, "Act II Redmarsh stilt outpost and alkali flats story slide backdrop (1280x720)"),
        ("slide_act2_dry_cistern.jpg", build_slide_act2_dry_cistern, "Act II dry Ironheart cistern canyon story slide backdrop (1280x720)"),
        ("slide_act3_oakhaven_cliffs.jpg", build_slide_act3_oakhaven_cliffs, "Act III Oakhaven coastal cliffs and shipwright slipways story slide backdrop (1280x720)"),
        ("slide_act3_burning_harbor.jpg", build_slide_act3_burning_harbor, "Act III Burning Harbor pier and departing evacuation sails story slide backdrop (1280x720)"),
        ("slide_act4_highcrest_spire.jpg", build_slide_act4_highcrest_spire, "Act IV Highcrest Citadel and Obsidian Caldera story slide backdrop (1280x720)"),
        ("slide_ending_a_purging.jpg", build_slide_ending_a_purging, "Ending A Purging of Thornvael dawn story slide backdrop (1280x720)"),
        ("slide_ending_b_sovereign.jpg", build_slide_ending_b_sovereign, "Ending B Dark Sovereign Obsidian Throne story slide backdrop (1280x720)"),
    ]

    provenance: List[Tuple[str, str]] = []
    for fname, fn, note in portraits:
        out_path = MON_DIR / fname
        fn().save(out_path, format="JPEG", quality=92, optimize=True)
        provenance.append((f"public/townart/mon/{fname}", note))
        print(f"wrote {out_path.relative_to(ROOT)}")

    for fname, fn, note in slides:
        out_path = SLIDES_DIR / fname
        fn().save(out_path, format="JPEG", quality=90, optimize=True)
        provenance.append((f"public/art/slides/{fname}", note))
        print(f"wrote {out_path.relative_to(ROOT)}")

    register_assets(provenance)
    print(f"Registered {len(provenance)} assets in assets.json.")


if __name__ == "__main__":
    main()
