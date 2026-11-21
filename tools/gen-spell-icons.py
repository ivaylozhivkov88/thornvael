"""Generate 38 missing individual 64x64 spell icons for Thornvael.
Standard: 64x64 PNG, transparent background, dark retro outline (24, 18, 20, 255),
deep muted retro colors with school-specific magical glow accents:
- Air: electric-azure / cyan
- Marksman / Wild: warm ash wood, tempered steel, jade-green / amber
- Bone / Necromancer: calcified ivory, crypt slate, eerie cyan spirit rime
- Debt / Necromancer: imperial gold, royal amethyst / violet
- Grave / Necromancer: frost cyan, spectral silver, chilled tomb mist
"""
import os, math, json
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'spellicons')
ASSETS_JSON = os.path.join(ROOT, 'assets.json')

S = 4
N = 64 * S  # 256x256 working resolution
DARK = (24, 18, 20, 255)

# Color palettes
AIR_GLOW = (130, 215, 255)
AIR_CORE = (240, 252, 255)
AIR_DARK = (30, 70, 130)

MARK_WOOD = (125, 85, 50)
MARK_STEEL = (185, 200, 215)
MARK_HI = (240, 248, 255)
MARK_AMBER = (245, 180, 60)

WILD_GREEN = (95, 185, 75)
WILD_HI = (205, 250, 165)
WILD_DARK = (40, 80, 30)

BONE_IVORY = (225, 218, 195)
BONE_HI = (252, 250, 242)
BONE_SHADE = (110, 100, 80)
BONE_RIME = (130, 235, 220)

DEBT_GOLD = (225, 180, 65)
DEBT_GOLD_HI = (255, 240, 165)
DEBT_VIOLET = (175, 95, 245)
DEBT_VIOLET_HI = (235, 205, 255)
DEBT_DARK = (70, 25, 115)

GRAVE_CYAN = (95, 220, 210)
GRAVE_CYAN_HI = (215, 255, 250)
GRAVE_SLATE = (45, 60, 75)
GRAVE_SILVER = (195, 215, 230)

def create_base():
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    return img, d

def sc(pts):
    return [(x * S, y * S) for x, y in pts]

def poly(d, pts, fill, outline=DARK, width=1.8):
    d.polygon(sc(pts), fill=fill, outline=outline, width=max(1, int(width * S)))

def ell(d, box, fill, outline=DARK, width=1.8):
    d.ellipse([c * S for c in box], fill=fill, outline=outline, width=max(1, int(width * S)))

def ln(d, pts, fill, width=2.0):
    d.line(sc(pts), fill=fill, width=max(1, int(width * S)))

def radial_glow(img, cx, cy, radius, color, max_alpha=110):
    """Adds a soft atmospheric magical glow around a center point."""
    glow = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    steps = 14
    for r in range(steps, 0, -1):
        rad = (radius * r / steps) * S
        alpha = int(max_alpha * (1.0 - (r / steps) ** 1.6))
        gd.ellipse([(cx * S - rad, cy * S - rad), (cx * S + rad, cy * S + rad)], fill=(*color[:3], alpha))
    img.alpha_composite(glow)

# --- 38 SPELL IMPLEMENTATIONS ---

def draw_chain_lightning():
    im, d = create_base()
    radial_glow(im, 32, 32, 28, AIR_GLOW, 90)
    # Ground metal rods
    poly(d, [(8, 48), (14, 44), (16, 56), (10, 58)], (120, 100, 80))
    poly(d, [(50, 46), (56, 42), (58, 56), (52, 58)], (120, 100, 80))
    # Lightning branches
    ln(d, [(14, 10), (22, 20), (18, 28), (32, 34), (44, 26), (54, 46)], AIR_DARK, 4.0)
    ln(d, [(32, 34), (26, 44), (12, 48)], AIR_DARK, 3.5)
    ln(d, [(14, 10), (22, 20), (18, 28), (32, 34), (44, 26), (54, 46)], AIR_GLOW, 2.5)
    ln(d, [(32, 34), (26, 44), (12, 48)], AIR_GLOW, 2.2)
    ln(d, [(14, 10), (22, 20), (18, 28), (32, 34), (44, 26), (54, 46)], AIR_CORE, 1.2)
    ln(d, [(32, 34), (26, 44), (12, 48)], AIR_CORE, 1.0)
    # Spark nodes
    ell(d, (20, 18, 24, 22), AIR_CORE, AIR_GLOW, 1.0)
    ell(d, (30, 32, 34, 36), AIR_CORE, AIR_GLOW, 1.0)
    ell(d, (52, 44, 56, 48), AIR_CORE, AIR_GLOW, 1.0)
    return im

def draw_haste():
    im, d = create_base()
    radial_glow(im, 32, 34, 24, AIR_GLOW, 80)
    # Speed streak ribbons
    ln(d, [(6, 26), (26, 26)], AIR_GLOW, 2.2)
    ln(d, [(10, 34), (28, 34)], AIR_CORE, 1.8)
    ln(d, [(8, 44), (24, 44)], AIR_GLOW, 2.0)
    # Swift winged boot
    poly(d, [(26, 16), (36, 14), (38, 36), (48, 40), (54, 48), (52, 54), (24, 54), (24, 40)], (140, 100, 65))
    poly(d, [(24, 48), (52, 48), (50, 54), (24, 54)], (60, 45, 35))
    # Wing feathers on ankle
    poly(d, [(28, 26), (12, 14), (20, 24)], (230, 240, 250), outline=DARK)
    poly(d, [(30, 28), (14, 22), (24, 30)], (200, 225, 245), outline=DARK)
    poly(d, [(32, 32), (18, 30), (26, 36)], (160, 200, 235), outline=DARK)
    # Buckles and highlights
    ell(d, (34, 26, 38, 30), DEBT_GOLD)
    ln(d, [(28, 18), (34, 17), (36, 36)], (190, 150, 105), 1.2)
    return im

def draw_gale():
    im, d = create_base()
    radial_glow(im, 32, 32, 26, AIR_GLOW, 90)
    # Whirling vortex funnel
    for i, (w, y, th) in enumerate([(38, 14, 2.8), (30, 24, 2.5), (22, 34, 2.2), (14, 44, 2.0), (8, 52, 1.6)]):
        x0 = 32 - w // 2
        d.arc([x0 * S, (y - 5) * S, (x0 + w) * S, (y + 5) * S], 190, 350, fill=AIR_GLOW, width=int(th * S))
        d.arc([(x0 + 2) * S, (y - 3) * S, (x0 + w - 2) * S, (y + 3) * S], 190, 350, fill=AIR_CORE, width=max(1, int((th - 1) * S)))
    # Debris / wind leaves
    poly(d, [(44, 18), (48, 16), (46, 22)], (175, 120, 60))
    poly(d, [(16, 28), (20, 26), (18, 32)], (140, 160, 70))
    poly(d, [(40, 38), (44, 36), (42, 42)], (175, 120, 60))
    poly(d, [(24, 46), (27, 44), (25, 49)], (160, 110, 50))
    return im

def draw_wind_ward():
    im, d = create_base()
    radial_glow(im, 32, 32, 28, AIR_GLOW, 100)
    # Outer wind bubble
    ell(d, (10, 10, 54, 54), (160, 225, 255, 40), outline=AIR_GLOW, width=2.4)
    ell(d, (14, 14, 50, 50), (210, 245, 255, 50), outline=AIR_CORE, width=1.6)
    # Inner silver shield
    poly(d, [(20, 20), (44, 20), (42, 38), (32, 48), (22, 38)], (170, 190, 210))
    poly(d, [(24, 23), (40, 23), (39, 36), (32, 44), (25, 36)], (215, 235, 250))
    # Wind runes on shield
    ln(d, [(27, 30), (37, 30)], AIR_DARK, 1.8)
    ln(d, [(32, 25), (32, 39)], AIR_DARK, 1.8)
    ell(d, (30, 28, 34, 32), DEBT_GOLD)
    return im

def draw_thunderstorm():
    im, d = create_base()
    radial_glow(im, 32, 40, 22, AIR_GLOW, 90)
    # Rain streaks
    for x, y0, y1 in [(14, 38, 52), (24, 42, 58), (34, 44, 60), (46, 38, 54), (54, 42, 56)]:
        ln(d, [(x, y0), (x - 4, y1)], (140, 200, 240, 140), 1.4)
    # Dark storm clouds
    ell(d, (8, 12, 32, 32), (65, 75, 95))
    ell(d, (24, 8, 48, 30), (80, 92, 115))
    ell(d, (36, 14, 58, 34), (60, 70, 90))
    ell(d, (16, 16, 48, 36), (95, 108, 130))
    # Cloud silver lining highlight
    d.arc([24 * S, 8 * S, 48 * S, 30 * S], 200, 340, fill=AIR_CORE, width=int(1.8 * S))
    # Forked lightning bolt
    ln(d, [(32, 28), (28, 38), (34, 40), (26, 56)], AIR_DARK, 3.6)
    ln(d, [(32, 28), (28, 38), (34, 40), (26, 56)], AIR_GLOW, 2.2)
    ln(d, [(32, 28), (28, 38), (34, 40), (26, 56)], AIR_CORE, 1.2)
    # Second small branch
    ln(d, [(28, 38), (36, 44), (32, 52)], AIR_GLOW, 1.8)
    ln(d, [(28, 38), (36, 44), (32, 52)], AIR_CORE, 1.0)
    return im

def draw_static_arc():
    im, d = create_base()
    radial_glow(im, 32, 32, 24, AIR_GLOW, 100)
    # Copper conductor electrodes
    poly(d, [(8, 22), (18, 26), (18, 38), (8, 42)], (195, 125, 75))
    poly(d, [(12, 26), (18, 28), (18, 36), (12, 38)], (235, 175, 115))
    poly(d, [(56, 22), (46, 26), (46, 38), (56, 42)], (195, 125, 75))
    poly(d, [(52, 26), (46, 28), (46, 36), (52, 38)], (235, 175, 115))
    # Buzzing arcs bridging the gap
    pts1 = [(18, 32), (24, 25), (28, 37), (36, 27), (40, 35), (46, 32)]
    ln(d, pts1, AIR_DARK, 3.8)
    ln(d, pts1, AIR_GLOW, 2.4)
    ln(d, pts1, AIR_CORE, 1.2)
    pts2 = [(18, 30), (26, 36), (32, 29), (38, 38), (46, 30)]
    ln(d, pts2, AIR_GLOW, 1.8)
    ln(d, pts2, AIR_CORE, 0.9)
    # Spark flares
    ell(d, (26, 30, 30, 34), AIR_CORE)
    ell(d, (34, 28, 38, 32), AIR_CORE)
    return im

def draw_pinning_bodkin():
    im, d = create_base()
    radial_glow(im, 32, 32, 20, MARK_AMBER, 75)
    # Split turf peg / leather boot heel
    poly(d, [(16, 42), (48, 42), (46, 56), (18, 56)], (115, 80, 50))
    poly(d, [(20, 44), (44, 44), (42, 52), (22, 52)], (80, 55, 35))
    # Cracks in turf
    ln(d, [(32, 48), (22, 52)], (50, 35, 20), 1.8)
    ln(d, [(32, 48), (42, 53)], (50, 35, 20), 1.8)
    # Four-sided bodkin head driven in
    poly(d, [(32, 48), (24, 18), (32, 22)], (160, 175, 190))
    poly(d, [(32, 48), (32, 22), (40, 18)], (215, 230, 245))
    ln(d, [(32, 22), (32, 48)], MARK_HI, 1.8)
    # Shaft
    poly(d, [(29, 6), (35, 6), (35, 20), (29, 20)], MARK_WOOD)
    # Amber impact sparks
    poly(d, [(26, 44), (22, 40), (27, 41)], MARK_AMBER)
    poly(d, [(38, 44), (42, 40), (37, 41)], MARK_AMBER)
    return im

def draw_visor_split():
    im, d = create_base()
    radial_glow(im, 30, 30, 22, DEBT_GOLD_HI, 85)
    # Knightly closed sallet helm profile
    poly(d, [(16, 14), (42, 14), (48, 26), (42, 48), (22, 48), (14, 36)], MARK_STEEL)
    poly(d, [(18, 16), (40, 16), (44, 26), (38, 44), (24, 44), (16, 34)], (130, 145, 160))
    # Visor ocular eye slit
    poly(d, [(22, 28), (44, 28), (42, 34), (22, 34)], (30, 25, 25))
    # Arrow piercing through slit
    poly(d, [(8, 31), (28, 31), (30, 29), (34, 31), (30, 33), (28, 31)], (225, 235, 245))
    ln(d, [(2, 31), (24, 31)], MARK_WOOD, 2.4)
    # Critical impact starburst
    for dx, dy in [(0, -7), (0, 7), (-7, 0), (7, 0), (5, 5), (-5, -5)]:
        ln(d, [(32, 31), (32 + dx, 31 + dy)], DEBT_GOLD_HI, 1.8)
    ell(d, (30, 29, 34, 33), (255, 255, 255))
    return im

def draw_serrated_broadhead():
    im, d = create_base()
    radial_glow(im, 32, 30, 20, (200, 40, 40), 80)
    # Ash shaft
    poly(d, [(29, 36), (35, 36), (35, 58), (29, 58)], MARK_WOOD)
    poly(d, [(28, 34), (36, 34), (36, 38), (28, 38)], (150, 110, 60))
    # Serrated triangular broadhead
    pts = [
        (32, 8), (44, 24), (40, 25), (45, 31), (39, 32), (42, 38), (35, 35),
        (32, 36),
        (29, 35), (22, 38), (25, 32), (19, 31), (24, 25), (20, 24)
    ]
    poly(d, pts, MARK_STEEL)
    # Bevel highlight
    ln(d, [(32, 9), (32, 35)], MARK_HI, 2.0)
    # Blood drips on barbs
    poly(d, [(42, 38), (44, 44), (41, 44)], (195, 30, 35))
    poly(d, [(22, 38), (20, 44), (23, 44)], (195, 30, 35))
    ell(d, (31, 40, 34, 45), (210, 35, 40))
    return im

def draw_crippling_tendon():
    im, d = create_base()
    radial_glow(im, 32, 32, 22, GRAVE_CYAN, 80)
    # Curved sinew / ankle tendon band
    pts_tendon = [(14, 20), (30, 28), (48, 20), (52, 28), (30, 38), (12, 28)]
    poly(d, pts_tendon, (215, 175, 175), outline=DARK)
    ln(d, [(14, 24), (30, 32), (48, 24)], (240, 210, 210), 2.2)
    # Slicing broadhead severance
    poly(d, [(26, 12), (38, 12), (32, 44)], (180, 195, 210))
    ln(d, [(32, 12), (32, 44)], MARK_HI, 1.8)
    # Frost-teal rime cracking overlay
    ln(d, [(24, 28), (30, 34), (28, 42)], GRAVE_CYAN, 2.2)
    ln(d, [(36, 28), (32, 34), (38, 42)], GRAVE_CYAN, 2.2)
    ell(d, (30, 32, 34, 36), GRAVE_CYAN_HI)
    return im

def draw_raking_volley():
    im, d = create_base()
    radial_glow(im, 32, 28, 24, MARK_AMBER, 70)
    # Three arrows flying in a fan
    for angle, (ox, oy) in [(-22, (20, 34)), (0, (32, 30)), (22, (44, 34))]:
        # Arrow shaft
        ln(d, [(ox, oy + 22), (ox + int(angle * 0.4), oy - 14)], MARK_WOOD, 2.4)
        # Arrow head
        hx = ox + int(angle * 0.4)
        hy = oy - 14
        poly(d, [(hx, hy - 6), (hx + 4, hy + 2), (hx - 4, hy + 2)], MARK_STEEL)
        # Fletching
        fx = ox
        fy = oy + 16
        poly(d, [(fx - 4, fy), (fx, fy - 6), (fx + 4, fy), (fx, fy + 4)], (225, 60, 60))
    # Wind streak arcs
    d.arc([12 * S, 18 * S, 52 * S, 48 * S], 210, 330, fill=AIR_GLOW, width=int(1.6 * S))
    return im

def draw_suppressive_arc():
    im, d = create_base()
    radial_glow(im, 32, 44, 20, (230, 90, 60), 80)
    # High ballistic arc curve
    d.arc([8 * S, 10 * S, 56 * S, 58 * S], 200, 340, fill=MARK_AMBER, width=int(2.2 * S))
    # Multiple descending arrows
    for x, y, dx, dy in [(20, 24, 3, 6), (32, 16, 0, 7), (44, 24, -3, 6), (50, 38, -4, 5)]:
        ln(d, [(x - dx, y - dy), (x + dx, y + dy)], MARK_STEEL, 2.2)
        poly(d, [(x + dx, y + dy), (x + dx - 2, y + dy - 3), (x + dx + 2, y + dy - 3)], MARK_HI)
    # Ground impact zone markers
    ln(d, [(16, 52), (48, 52)], (220, 60, 50), 2.4)
    for px in [20, 28, 36, 44]:
        ell(d, (px - 2, 50, px + 2, 54), (255, 210, 100))
    return im

def draw_heartseeker():
    im, d = create_base()
    radial_glow(im, 32, 32, 26, (235, 60, 75), 90)
    # Crosshair reticle rings
    ell(d, (12, 12, 52, 52), None, outline=MARK_AMBER, width=1.8)
    ell(d, (20, 20, 44, 44), None, outline=WILD_GREEN, width=1.4)
    ln(d, [(32, 6), (32, 20)], MARK_AMBER, 1.8)
    ln(d, [(32, 44), (32, 58)], MARK_AMBER, 1.8)
    ln(d, [(6, 32), (20, 32)], MARK_AMBER, 1.8)
    ln(d, [(44, 32), (58, 32)], MARK_AMBER, 1.8)
    # Anatomical crystal heart in center
    poly(d, [(32, 42), (22, 30), (24, 22), (32, 26), (40, 22), (42, 30)], (215, 35, 55))
    poly(d, [(32, 40), (25, 30), (26, 24), (32, 27)], (255, 110, 125))
    # Piercing center bead
    ell(d, (30, 29, 34, 33), (255, 255, 255))
    return im

def draw_hail_of_yew():
    im, d = create_base()
    radial_glow(im, 32, 32, 26, (90, 120, 150), 80)
    # Dense parallel storm of raining arrows
    arrows = [
        (12, 10), (22, 8), (32, 6), (42, 9), (52, 12),
        (16, 26), (26, 24), (36, 22), (46, 25),
        (20, 42), (30, 40), (40, 38)
    ]
    for ax, ay in arrows:
        ln(d, [(ax, ay), (ax - 6, ay + 14)], MARK_WOOD, 1.8)
        poly(d, [(ax - 6, ay + 14), (ax - 9, ay + 11), (ax - 4, ay + 11)], MARK_STEEL)
    # Ground pins
    ln(d, [(10, 56), (54, 56)], (70, 55, 40), 2.2)
    poly(d, [(18, 54), (16, 46), (20, 46)], MARK_STEEL)
    poly(d, [(34, 54), (32, 44), (36, 44)], MARK_STEEL)
    poly(d, [(46, 54), (44, 48), (48, 48)], MARK_STEEL)
    return im

def draw_briar_snare():
    im, d = create_base()
    radial_glow(im, 32, 32, 24, WILD_GREEN, 85)
    # Coiled thorny vine loop
    ell(d, (12, 14, 52, 50), None, outline=WILD_DARK, width=4.5)
    ell(d, (13, 15, 51, 49), None, outline=(90, 135, 60), width=2.6)
    # Curved thorns bursting along the circle
    thorns = [
        [(20, 16), (16, 10), (22, 14)],
        [(34, 14), (36, 8), (38, 14)],
        [(46, 18), (52, 14), (48, 22)],
        [(50, 34), (58, 36), (49, 38)],
        [(44, 46), (48, 52), (42, 48)],
        [(28, 48), (26, 56), (30, 49)],
        [(16, 42), (10, 46), (15, 40)],
        [(13, 28), (6, 26), (14, 30)],
    ]
    for t in thorns:
        poly(d, t, (160, 210, 90))
    # Center snap teeth / iron barbs
    poly(d, [(26, 32), (32, 24), (38, 32), (32, 40)], (160, 175, 185))
    ell(d, (30, 30, 34, 34), WILD_HI)
    return im

def draw_marsh_adder_venom():
    im, d = create_base()
    radial_glow(im, 32, 36, 24, WILD_GREEN, 100)
    # Steel arrowhead below
    poly(d, [(32, 28), (44, 46), (32, 42), (20, 46)], MARK_STEEL)
    ln(d, [(32, 42), (32, 58)], MARK_WOOD, 3.2)
    # Curved viper fangs dripping
    poly(d, [(24, 12), (28, 12), (27, 26), (23, 28)], (235, 235, 220))
    poly(d, [(40, 12), (36, 12), (37, 26), (41, 28)], (235, 235, 220))
    # Fleshy gum ridge
    poly(d, [(20, 10), (44, 10), (42, 16), (22, 16)], (165, 60, 70))
    # Glowing jade venom droplets
    ell(d, (25, 29, 29, 35), WILD_GREEN)
    ell(d, (35, 29, 39, 35), WILD_GREEN)
    ell(d, (30, 38, 34, 44), WILD_HI)
    return im

def draw_reed_smoke_screen():
    im, d = create_base()
    radial_glow(im, 32, 30, 26, (140, 180, 160), 90)
    # Billowing peat smoke clouds
    ell(d, (10, 14, 34, 38), (115, 135, 125, 180), outline=(50, 65, 55))
    ell(d, (28, 10, 54, 36), (135, 155, 145, 190), outline=(50, 65, 55))
    ell(d, (18, 22, 46, 46), (155, 175, 165, 200), outline=(50, 65, 55))
    # Smoke wisps
    d.arc([16 * S, 12 * S, 48 * S, 42 * S], 180, 340, fill=(210, 230, 220), width=int(2.0 * S))
    # Bundled marsh reeds at base
    for rx in [24, 28, 32, 36, 40]:
        ln(d, [(rx, 56), (rx - 2, 42)], (110, 135, 75), 2.4)
    poly(d, [(22, 48), (42, 48), (42, 52), (22, 52)], (80, 55, 35))
    return im

def draw_carrion_mark():
    im, d = create_base()
    radial_glow(im, 32, 32, 24, MARK_AMBER, 85)
    # Crossed black-fletched arrows behind skull
    ln(d, [(14, 14), (50, 50)], MARK_WOOD, 2.6)
    ln(d, [(50, 14), (14, 50)], MARK_WOOD, 2.6)
    # Bleached raven skull
    poly(d, [(24, 18), (40, 18), (42, 32), (36, 44), (32, 54), (28, 44), (22, 32)], BONE_IVORY)
    poly(d, [(26, 20), (38, 20), (38, 30), (34, 42), (32, 50), (30, 42), (26, 30)], BONE_HI)
    # Eye sockets
    ell(d, (25, 26, 30, 33), (25, 20, 20))
    ell(d, (34, 26, 39, 33), (25, 20, 20))
    # Glowing amber hunter's mark brand on forehead
    ln(d, [(32, 19), (32, 27)], MARK_AMBER, 2.0)
    ln(d, [(28, 23), (36, 23)], MARK_AMBER, 2.0)
    ell(d, (30, 21, 34, 25), DEBT_GOLD_HI)
    return im

def draw_gale_step():
    im, d = create_base()
    radial_glow(im, 32, 34, 22, AIR_GLOW, 85)
    # Broken bramble root vines
    ln(d, [(14, 48), (24, 42)], (90, 65, 45), 2.8)
    ln(d, [(40, 46), (50, 50)], (90, 65, 45), 2.8)
    poly(d, [(23, 40), (26, 42), (24, 45)], (120, 180, 80))
    # Swift leaping greave boot
    poly(d, [(24, 16), (36, 18), (42, 36), (48, 40), (46, 48), (28, 42), (20, 28)], MARK_STEEL)
    poly(d, [(26, 18), (34, 20), (38, 34), (44, 38), (42, 44), (28, 38), (22, 28)], MARK_HI)
    # Swirling green-azure tailwind ribbons
    for rad, y in [(14, 28), (20, 34), (25, 40)]:
        d.arc([(32 - rad) * S, (y - 7) * S, (32 + rad) * S, (y + 7) * S], 140, 320, fill=AIR_GLOW, width=int(1.8 * S))
    return im

def draw_spore_pod_shot():
    im, d = create_base()
    radial_glow(im, 32, 32, 26, (140, 220, 80), 95)
    # Ruptured fungal puffball pod
    poly(d, [(22, 34), (20, 48), (44, 48), (42, 34), (36, 30), (32, 36), (28, 30)], (120, 95, 65))
    poly(d, [(24, 36), (22, 46), (42, 46), (40, 36)], (85, 65, 45))
    # Toxic yellow-green spore cloud bursting upward
    for cx, cy, r in [(32, 18, 12), (20, 22, 8), (44, 22, 8), (26, 12, 7), (38, 12, 7)]:
        ell(d, (cx - r, cy - r, cx + r, cy + r), (145, 215, 60, 160), outline=WILD_DARK, width=1.0)
    # Spore specks
    for px, py in [(28, 16), (34, 14), (36, 20), (24, 24), (40, 24), (32, 26)]:
        ell(d, (px - 1.5, py - 1.5, px + 1.5, py + 1.5), (240, 255, 140))
    return im

def draw_falcons_bearing():
    im, d = create_base()
    radial_glow(im, 36, 30, 22, MARK_AMBER, 85)
    # Regal falcon head in profile facing right
    pts = [
        (16, 36), (18, 20), (28, 14), (40, 16), (48, 26), (56, 30),
        (48, 36), (42, 34), (38, 48), (22, 46)
    ]
    poly(d, pts, (105, 80, 55))
    # White/cream neck and brow plumage
    poly(d, [(24, 18), (38, 18), (44, 24), (36, 28), (28, 26)], (235, 230, 215))
    # Hooked steel beak
    poly(d, [(44, 26), (56, 30), (48, 36), (44, 32)], (225, 175, 60))
    poly(d, [(48, 30), (56, 30), (48, 36)], (70, 50, 30))
    # Intense golden eye
    ell(d, (34, 20, 42, 28), DEBT_GOLD)
    ell(d, (36, 22, 40, 26), (20, 15, 15))
    ell(d, (37, 23, 38.5, 24.5), (255, 255, 255))
    # Sightline rays
    ln(d, [(44, 24), (58, 18)], MARK_AMBER, 1.6)
    ln(d, [(48, 26), (60, 24)], DEBT_GOLD_HI, 1.8)
    return im

def draw_thornwood_ambush():
    im, d = create_base()
    radial_glow(im, 32, 34, 24, WILD_GREEN, 80)
    # Torn turf mounds
    poly(d, [(8, 48), (26, 44), (38, 46), (56, 44), (58, 56), (6, 56)], (75, 55, 35))
    poly(d, [(10, 46), (24, 43), (36, 44), (54, 43)], (110, 150, 60))
    # Cluster of vicious pointed wooden stakes bursting upward
    stakes = [
        [(16, 46), (20, 18), (25, 44)],
        [(26, 44), (32, 12), (37, 44)],
        [(36, 44), (44, 16), (49, 46)],
        [(44, 46), (50, 24), (54, 48)],
    ]
    for s in stakes:
        poly(d, s, (135, 95, 60))
        # Bevel line
        ln(d, [s[1], ((s[0][0] + s[2][0]) // 2, s[0][1])], (190, 145, 95), 1.6)
    # Thorn barbs on stakes
    poly(d, [(21, 26), (16, 22), (22, 23)], WILD_GREEN)
    poly(d, [(34, 22), (39, 18), (35, 19)], WILD_GREEN)
    poly(d, [(46, 26), (50, 22), (47, 24)], WILD_GREEN)
    return im

def draw_splinter_writ():
    im, d = create_base()
    radial_glow(im, 32, 32, 22, (200, 50, 60), 85)
    # Vellum slab tablet
    poly(d, [(14, 12), (48, 10), (52, 52), (18, 56)], (225, 210, 175))
    poly(d, [(17, 15), (46, 13), (49, 49), (20, 52)], (245, 235, 205))
    # Etched bloody bone runes on vellum
    for y in [22, 28, 34, 40]:
        ln(d, [(22, y), (44, y)], (165, 45, 55), 1.8)
    # Sharpened rib stylus pen
    poly(d, [(36, 8), (44, 12), (28, 46), (26, 44)], BONE_IVORY)
    poly(d, [(28, 46), (26, 44), (24, 50)], (185, 30, 40))  # bloody tip
    ln(d, [(38, 10), (27, 45)], BONE_HI, 1.4)
    return im

def draw_raise_indentured():
    im, d = create_base()
    radial_glow(im, 32, 28, 24, BONE_RIME, 95)
    # Dark grave earth mound
    poly(d, [(10, 46), (32, 40), (54, 46), (58, 58), (6, 58)], (50, 45, 45))
    poly(d, [(14, 48), (32, 42), (50, 48)], (80, 70, 65))
    # Skeletal arm forearm reaching up
    poly(d, [(30, 26), (34, 26), (36, 48), (28, 48)], BONE_IVORY)
    ln(d, [(32, 26), (32, 48)], BONE_SHADE, 1.4)
    # Skeletal hand with clawing fingers
    ell(d, (29, 21, 35, 27), BONE_IVORY)
    fingers = [
        [(29, 22), (22, 14), (20, 16)],
        [(31, 21), (28, 10), (26, 12)],
        [(33, 21), (36, 9), (38, 11)],
        [(35, 22), (42, 14), (44, 16)],
        [(35, 25), (42, 24), (40, 26)],
    ]
    for f in fingers:
        ln(d, f, BONE_HI, 2.4)
    # Spectral soul mist wisps
    d.arc([16 * S, 18 * S, 48 * S, 44 * S], 200, 340, fill=BONE_RIME, width=int(1.8 * S))
    return im

def draw_ribcage_bulwark():
    im, d = create_base()
    radial_glow(im, 32, 32, 26, BONE_RIME, 90)
    # Central spine column
    poly(d, [(30, 10), (34, 10), (34, 52), (30, 52)], BONE_IVORY)
    for vy in range(12, 50, 6):
        ell(d, (29, vy, 35, vy + 4), BONE_HI)
    # Symmetrical curved rib bones forming a shield
    for y, w, h in [(16, 22, 8), (24, 26, 10), (32, 24, 9), (40, 18, 7)]:
        d.arc([(32 - w) * S, (y - h // 2) * S, (32 + w) * S, (y + h // 2) * S], 20, 160, fill=BONE_IVORY, width=int(3.0 * S))
        d.arc([(32 - w) * S, (y - h // 2) * S, (32 + w) * S, (y + h // 2) * S], 25, 155, fill=BONE_HI, width=int(1.4 * S))
    # Eerie green-cyan soul fire in heart of ribcage
    ell(d, (28, 26, 36, 34), BONE_RIME)
    ell(d, (30, 28, 34, 32), (255, 255, 255))
    return im

def draw_marrow_shrapnel():
    im, d = create_base()
    radial_glow(im, 32, 32, 28, DEBT_VIOLET_HI, 100)
    # Shockwave blast rings
    ell(d, (10, 10, 54, 54), None, outline=DEBT_VIOLET, width=1.8)
    ell(d, (18, 18, 46, 46), None, outline=BONE_RIME, width=1.4)
    # Shattered skull pieces in center
    poly(d, [(26, 26), (36, 24), (38, 32), (28, 36)], BONE_IVORY)
    # Flying bone shards bursting outward
    shards = [
        [(14, 16), (22, 22), (18, 24)],
        [(44, 14), (52, 20), (46, 24)],
        [(10, 36), (18, 34), (16, 40)],
        [(46, 38), (54, 36), (50, 42)],
        [(22, 46), (28, 52), (24, 54)],
        [(38, 46), (44, 52), (40, 54)],
    ]
    for sh in shards:
        poly(d, sh, BONE_HI)
    # Concussive center spark
    ell(d, (29, 29, 35, 35), (255, 255, 255))
    return im

def draw_ossuary_cage():
    im, d = create_base()
    radial_glow(im, 32, 32, 24, GRAVE_CYAN, 85)
    # Top and bottom bone crossbars
    poly(d, [(12, 14), (52, 14), (52, 20), (12, 20)], BONE_IVORY)
    poly(d, [(12, 44), (52, 44), (52, 50), (12, 50)], BONE_IVORY)
    # Vertical bone bars (femurs)
    for bx in [16, 24, 32, 40, 48]:
        poly(d, [(bx - 2, 16), (bx + 2, 16), (bx + 2, 48), (bx - 2, 48)], BONE_IVORY)
        ell(d, (bx - 3, 14, bx + 3, 18), BONE_HI)
        ell(d, (bx - 3, 46, bx + 3, 50), BONE_HI)
    # Imprisoned skull grinning through center bars
    ell(d, (26, 24, 38, 36), (200, 190, 170))
    ell(d, (28, 28, 31, 32), (30, 25, 25))
    ell(d, (33, 28, 36, 32), (30, 25, 25))
    poly(d, [(29, 36), (35, 36), (33, 40), (31, 40)], (180, 170, 150))
    return im

def draw_phalanx_of_arrears():
    im, d = create_base()
    radial_glow(im, 32, 30, 24, DEBT_VIOLET, 85)
    # Three upright spears in background
    for sx in [18, 32, 46]:
        ln(d, [(sx, 6), (sx, 56)], MARK_WOOD, 2.4)
        poly(d, [(sx, 4), (sx + 3, 14), (sx - 3, 14)], MARK_STEEL)
    # Three bone legionnaire heads in line
    for hx, hy in [(20, 32), (32, 28), (44, 32)]:
        # Bronze sallet helmet
        poly(d, [(hx - 8, hy - 8), (hx + 8, hy - 8), (hx + 7, hy + 4), (hx - 7, hy + 4)], (175, 125, 60))
        # Skull face beneath rim
        ell(d, (hx - 5, hy + 2, hx + 5, hy + 12), BONE_IVORY)
        ell(d, (hx - 3, hy + 5, hx - 1, hy + 8), (20, 15, 25))
        ell(d, (hx + 1, hy + 5, hx + 3, hy + 8), (20, 15, 25))
    # Front shield wall rim
    poly(d, [(10, 44), (54, 44), (52, 56), (12, 56)], (130, 95, 55))
    poly(d, [(14, 46), (50, 46), (48, 54), (16, 54)], (165, 120, 65))
    return im

def draw_exact_tithe():
    im, d = create_base()
    radial_glow(im, 32, 32, 26, DEBT_GOLD, 95)
    # Balance scales central brass beam and pillar
    ln(d, [(32, 12), (32, 52)], DEBT_GOLD, 3.2)
    poly(d, [(22, 52), (42, 52), (38, 56), (26, 56)], DEBT_GOLD)
    # Crossbeam tilted (left pan lower with coins)
    ln(d, [(12, 24), (52, 18)], DEBT_GOLD, 2.4)
    # Left pan with coins
    ln(d, [(12, 24), (8, 36)], DEBT_GOLD, 1.4)
    ln(d, [(12, 24), (20, 36)], DEBT_GOLD, 1.4)
    poly(d, [(6, 36), (22, 36), (18, 42), (10, 42)], DEBT_GOLD)
    # Gold coins in left pan
    for cx, cy in [(10, 34), (14, 32), (18, 34), (12, 30), (16, 29)]:
        ell(d, (cx - 2.5, cy - 1.5, cx + 2.5, cy + 1.5), DEBT_GOLD_HI)
    # Right pan holding glowing soul flame
    ln(d, [(52, 18), (46, 30)], DEBT_GOLD, 1.4)
    ln(d, [(52, 18), (58, 30)], DEBT_GOLD, 1.4)
    poly(d, [(44, 30), (60, 30), (56, 36), (48, 36)], DEBT_GOLD)
    poly(d, [(52, 20), (48, 27), (56, 27)], (225, 75, 120))
    ell(d, (50, 23, 54, 27), (255, 220, 240))
    return im

def draw_compound_interest():
    im, d = create_base()
    radial_glow(im, 32, 32, 24, DEBT_VIOLET_HI, 90)
    # Rolled vellum ledger scroll
    poly(d, [(14, 12), (48, 12), (44, 52), (10, 52)], (235, 220, 180))
    ell(d, (8, 10, 16, 16), (205, 185, 145))
    ell(d, (42, 48, 50, 54), (205, 185, 145))
    # Glowing violet tally lines multiplying
    for y in [20, 26, 32, 38, 44]:
        ln(d, [(18, y), (38, y)], DEBT_VIOLET, 1.8)
    # Red wax seal with dangling ribbon
    ell(d, (36, 38, 48, 50), (195, 35, 45))
    ell(d, (38, 40, 46, 48), (235, 70, 80))
    poly(d, [(40, 48), (44, 58), (42, 48)], (175, 30, 40))
    return im

def draw_garnish_vigor():
    im, d = create_base()
    radial_glow(im, 32, 30, 26, DEBT_VIOLET, 100)
    # Pulsing cyan-violet soul orb
    ell(d, (22, 18, 42, 38), GRAVE_CYAN)
    ell(d, (26, 22, 38, 34), GRAVE_CYAN_HI)
    # Skeletal amethyst claw wrapping around orb
    poly(d, [(16, 48), (24, 48), (28, 34), (20, 36)], DEBT_VIOLET)
    fingers = [
        [(22, 32), (24, 20), (30, 18)],
        [(25, 30), (32, 16), (38, 17)],
        [(28, 31), (38, 22), (44, 24)],
        [(24, 38), (34, 38), (40, 36)],
    ]
    for f in fingers:
        ln(d, f, DEBT_VIOLET_HI, 2.4)
    # Siphon energy tendril flowing down wrist
    ln(d, [(26, 36), (18, 52)], GRAVE_CYAN, 2.0)
    return im

def draw_lien_of_blood():
    im, d = create_base()
    radial_glow(im, 32, 32, 22, (215, 45, 55), 90)
    # Ancient contract parchment
    poly(d, [(12, 10), (46, 8), (50, 52), (16, 54)], (230, 215, 175))
    poly(d, [(15, 13), (43, 11), (47, 49), (19, 51)], (245, 235, 205))
    # Crimson contract text lines
    for y in [18, 24, 30, 36]:
        ln(d, [(20, y), (42, y)], (175, 40, 50), 1.6)
    # Bloody thumbprint seal at bottom
    ell(d, (24, 40, 34, 48), (195, 35, 45))
    # Blood quill pen poised over parchment
    poly(d, [(48, 6), (54, 10), (36, 42), (34, 40)], (225, 220, 210))
    poly(d, [(36, 42), (34, 40), (32, 46)], (195, 30, 40))  # red nib
    return im

def draw_foreclosure():
    im, d = create_base()
    radial_glow(im, 32, 36, 26, (215, 50, 50), 95)
    # Executioner's heavy block / anvil below
    poly(d, [(12, 44), (52, 44), (48, 56), (16, 56)], (65, 60, 65))
    poly(d, [(14, 46), (50, 46), (46, 52), (18, 52)], (95, 90, 95))
    # Massive executioner's guillotine blade / gavel slamming down
    poly(d, [(16, 14), (46, 8), (48, 38), (18, 44)], (175, 185, 195))
    poly(d, [(18, 16), (44, 11), (45, 36), (20, 41)], MARK_HI)
    ln(d, [(18, 44), (48, 38)], (240, 245, 255), 2.2)
    # Shattering gold coins into red sparks
    for px, py in [(18, 42), (26, 40), (38, 38), (46, 36)]:
        ell(d, (px - 2, py - 2, px + 2, py + 2), DEBT_GOLD_HI)
    poly(d, [(28, 38), (32, 32), (34, 38)], (235, 60, 60))
    return im

def draw_cold_ledger():
    im, d = create_base()
    radial_glow(im, 32, 32, 26, GRAVE_CYAN, 95)
    # Open tombstone book bound in crypt iron
    poly(d, [(10, 16), (30, 20), (32, 50), (12, 46)], (65, 75, 85))
    poly(d, [(32, 20), (54, 16), (52, 46), (32, 50)], (65, 75, 85))
    # Pale frost-covered pages
    poly(d, [(13, 19), (30, 22), (30, 47), (14, 44)], (195, 225, 235))
    poly(d, [(33, 22), (50, 19), (49, 44), (33, 47)], (195, 225, 235))
    # Cyan rime runes
    for y in [26, 32, 38]:
        ln(d, [(16, y), (27, y + 1)], GRAVE_CYAN, 1.8)
        ln(d, [(36, y + 1), (47, y)], GRAVE_CYAN, 1.8)
    # Hanging icicles from lower covers
    for ix in [16, 24, 38, 46]:
        poly(d, [(ix - 2, 45), (ix + 2, 45), (ix, 53)], GRAVE_CYAN_HI)
    return im

def draw_witness_the_fallen():
    im, d = create_base()
    radial_glow(im, 32, 28, 24, GRAVE_CYAN, 90)
    # Ornate hooded funerary lantern
    poly(d, [(22, 16), (42, 16), (44, 20), (20, 20)], (85, 75, 65))
    poly(d, [(20, 20), (44, 20), (40, 44), (24, 44)], (180, 225, 235, 120))
    poly(d, [(22, 44), (42, 44), (40, 48), (24, 48)], (85, 75, 65))
    # Hanging chain loop
    d.arc([26 * S, 8 * S, 38 * S, 18 * S], 180, 360, fill=DEBT_GOLD, width=int(1.8 * S))
    # Spectral cyan memory flame inside
    ell(d, (28, 26, 36, 36), GRAVE_CYAN)
    ell(d, (30, 28, 34, 33), (255, 255, 255))
    # Beams of ghost light shining down on recumbent draped corpse
    ln(d, [(24, 44), (14, 56)], (160, 230, 240, 140), 2.2)
    ln(d, [(40, 44), (50, 56)], (160, 230, 240, 140), 2.2)
    poly(d, [(12, 54), (52, 54), (48, 58), (14, 58)], (70, 75, 85))
    return im

def draw_grave_quiet():
    im, d = create_base()
    radial_glow(im, 32, 32, 24, GRAVE_CYAN, 90)
    # Chilled lips in profile / mask
    poly(d, [(18, 26), (28, 28), (28, 36), (18, 38)], (120, 140, 160))
    ln(d, [(18, 32), (28, 32)], (60, 70, 85), 1.8)
    # Pale skeletal finger held vertically across lips in hush gesture
    poly(d, [(30, 14), (36, 14), (36, 48), (30, 48)], BONE_IVORY)
    ell(d, (29, 12, 37, 18), BONE_HI)  # fingertip
    # Finger knuckle joints
    for ky in [24, 34, 42]:
        ln(d, [(30, ky), (36, ky)], BONE_SHADE, 1.4)
    # Icy blue silence runes and snow crystals
    for rx, ry in [(44, 20), (48, 34), (42, 46)]:
        ln(d, [(rx - 3, ry), (rx + 3, ry)], GRAVE_CYAN_HI, 1.4)
        ln(d, [(rx, ry - 3), (rx, ry + 3)], GRAVE_CYAN_HI, 1.4)
        ell(d, (rx - 1, ry - 1, rx + 1, ry + 1), (255, 255, 255))
    return im

def draw_toll_of_the_pale():
    im, d = create_base()
    radial_glow(im, 32, 32, 26, GRAVE_CYAN, 95)
    # Timber beam belfry frame
    poly(d, [(12, 10), (52, 10), (52, 16), (12, 16)], (95, 65, 45))
    ln(d, [(16, 16), (16, 56)], (95, 65, 45), 3.0)
    ln(d, [(48, 16), (48, 56)], (95, 65, 45), 3.0)
    # Heavy cracked funeral iron bell
    poly(d, [(24, 18), (40, 18), (44, 40), (48, 44), (16, 44), (20, 40)], GRAVE_SLATE)
    poly(d, [(26, 20), (38, 20), (41, 38), (44, 42), (20, 42), (23, 38)], (85, 105, 120))
    # Bell clapper striking rim
    ell(d, (30, 42, 36, 48), (50, 45, 50))
    # Concentric ghostly soundwaves spreading out
    d.arc([8 * S, 24 * S, 56 * S, 58 * S], 140, 220, fill=GRAVE_CYAN, width=int(2.2 * S))
    d.arc([8 * S, 24 * S, 56 * S, 58 * S], 320, 40, fill=GRAVE_CYAN, width=int(2.2 * S))
    d.arc([4 * S, 18 * S, 60 * S, 62 * S], 140, 220, fill=GRAVE_CYAN_HI, width=int(1.4 * S))
    d.arc([4 * S, 18 * S, 60 * S, 62 * S], 320, 40, fill=GRAVE_CYAN_HI, width=int(1.4 * S))
    return im

def draw_forgive_the_oath():
    im, d = create_base()
    radial_glow(im, 32, 32, 26, (240, 245, 255), 100)
    # Snapped heavy iron neck shackle collar
    poly(d, [(12, 36), (24, 30), (22, 42), (10, 44)], (75, 75, 80))
    poly(d, [(40, 30), (52, 36), (54, 44), (42, 42)], (75, 75, 80))
    # Broken chain links falling away
    poly(d, [(14, 46), (18, 46), (18, 54), (14, 54)], (105, 105, 115))
    poly(d, [(46, 46), (50, 46), (50, 54), (46, 54)], (105, 105, 115))
    # Ascending radiant spirit butterflies / soul sparks
    butterflies = [(32, 16), (24, 22), (40, 22), (32, 30)]
    for bx, by in butterflies:
        poly(d, [(bx, by), (bx - 5, by - 4), (bx - 4, by + 2)], (225, 240, 255))
        poly(d, [(bx, by), (bx + 5, by - 4), (bx + 4, by + 2)], (225, 240, 255))
        ell(d, (bx - 1, by - 1, bx + 1, by + 1), DEBT_GOLD_HI)
    # Radiant aura beams
    for angle in range(0, 360, 45):
        rad = math.radians(angle)
        x1 = 32 + int(10 * math.cos(rad))
        y1 = 30 + int(10 * math.sin(rad))
        x2 = 32 + int(24 * math.cos(rad))
        y2 = 30 + int(24 * math.sin(rad))
        ln(d, [(x1, y1), (x2, y2)], (255, 245, 200, 150), 1.6)
    return im

SPELL_DRAWERS = {
    'chain-lightning': draw_chain_lightning,
    'haste': draw_haste,
    'gale': draw_gale,
    'wind-ward': draw_wind_ward,
    'thunderstorm': draw_thunderstorm,
    'static-arc': draw_static_arc,
    'pinning-bodkin': draw_pinning_bodkin,
    'visor-split': draw_visor_split,
    'serrated-broadhead': draw_serrated_broadhead,
    'crippling-tendon': draw_crippling_tendon,
    'raking-volley': draw_raking_volley,
    'suppressive-arc': draw_suppressive_arc,
    'heartseeker': draw_heartseeker,
    'hail-of-yew': draw_hail_of_yew,
    'briar-snare': draw_briar_snare,
    'marsh-adder-venom': draw_marsh_adder_venom,
    'reed-smoke-screen': draw_reed_smoke_screen,
    'carrion-mark': draw_carrion_mark,
    'gale-step': draw_gale_step,
    'spore-pod-shot': draw_spore_pod_shot,
    'falcons-bearing': draw_falcons_bearing,
    'thornwood-ambush': draw_thornwood_ambush,
    'splinter-writ': draw_splinter_writ,
    'raise-indentured': draw_raise_indentured,
    'ribcage-bulwark': draw_ribcage_bulwark,
    'marrow-shrapnel': draw_marrow_shrapnel,
    'ossuary-cage': draw_ossuary_cage,
    'phalanx-of-arrears': draw_phalanx_of_arrears,
    'exact-tithe': draw_exact_tithe,
    'compound-interest': draw_compound_interest,
    'garnish-vigor': draw_garnish_vigor,
    'lien-of-blood': draw_lien_of_blood,
    'foreclosure': draw_foreclosure,
    'cold-ledger': draw_cold_ledger,
    'witness-the-fallen': draw_witness_the_fallen,
    'grave-quiet': draw_grave_quiet,
    'toll-of-the-pale': draw_toll_of_the_pale,
    'forgive-the-oath': draw_forgive_the_oath,
}

def main():
    os.makedirs(OUT, exist_ok=True)
    generated = []

    print(f"Generating {len(SPELL_DRAWERS)} spell icons...")
    for spell_id, drawer in SPELL_DRAWERS.items():
        high_res = drawer()
        # Downsample with Lanczos to exactly 64x64
        icon = high_res.resize((64, 64), Image.LANCZOS)
        out_path = os.path.join(OUT, f"{spell_id}.png")
        icon.save(out_path, format="PNG", optimize=True)
        generated.append(spell_id)

        # Verification check: transparent borders
        arr = np.array(icon)
        assert arr.shape == (64, 64, 4), f"Bad shape for {spell_id}: {arr.shape}"
        edge_alpha = np.concatenate([arr[0, :, 3], arr[-1, :, 3], arr[:, 0, 3], arr[:, -1, 3]])
        assert edge_alpha.max() <= 10, f"Opaque edge in {spell_id}: {edge_alpha.max()}"

    print(f"Successfully generated {len(generated)} spell icons in {OUT}")

    # Build contact sheet (8 columns x 5 rows)
    cols = 8
    rows = (len(generated) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * 68, rows * 68), (30, 25, 35, 255))
    for idx, sid in enumerate(generated):
        r = idx // cols
        c = idx % cols
        ic = Image.open(os.path.join(OUT, f"{sid}.png"))
        sheet.paste(ic, (c * 68 + 2, r * 68 + 2), ic)
    contact_path = os.path.join(ROOT, ".art-build", "spell-icons-contact.png")
    sheet.save(contact_path)
    print(f"Contact sheet saved to {contact_path}")

if __name__ == '__main__':
    main()
