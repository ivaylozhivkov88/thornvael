"""Generate the first batch of 20 high-standard 64x64 unique item icons for Thornvael.
Saved directly into public/itemicons/<id>.png.
Standard: 64x64 PNG, transparent background, dark retro outline (24, 18, 20, 255),
rich metallic/leather/wood/gem shading, high-contrast highlights, distinct silhouette.
"""
import os, math, json
from PIL import Image, ImageDraw
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'itemicons')

S = 4
N = 64 * S
DARK = (24, 18, 20, 255)

# Palettes
GOLD_BASE = (215, 170, 70)
GOLD_HI = (255, 240, 160)
GOLD_SHADE = (120, 85, 30)

IRON_BASE = (100, 105, 115)
IRON_HI = (185, 195, 205)
IRON_SHADE = (45, 48, 55)

STEEL_BASE = (175, 190, 205)
STEEL_HI = (240, 248, 255)
STEEL_SHADE = (85, 95, 110)

BRONZE_BASE = (165, 120, 65)
BRONZE_HI = (225, 180, 115)
BRONZE_SHADE = (85, 55, 25)

WOOD_BASE = (125, 85, 50)
WOOD_HI = (175, 130, 85)
WOOD_SHADE = (65, 40, 20)

RUBY_BASE = (215, 40, 50)
RUBY_HI = (255, 130, 140)
RUBY_SHADE = (95, 15, 20)

AZURE_BASE = (115, 195, 245)
AZURE_HI = (225, 250, 255)
AZURE_SHADE = (35, 75, 130)

OBSIDIAN_BASE = (40, 36, 42)
OBSIDIAN_HI = (120, 115, 130)
OBSIDIAN_SHADE = (18, 16, 20)

SLAG_ORANGE = (255, 110, 25)
SLAG_YELLOW = (255, 215, 80)

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

def ground_shadow(d, cx, cy, rx, ry):
    ell(d, (cx - rx, cy - ry, cx + rx, cy + ry), (12, 10, 14, 110), outline=None)

# 1. uniq-tollkeeper-bill: Woodcutter handaxe with bloodstained ledger scroll tied to haft
def draw_tollkeeper_bill():
    im, d = create_base()
    ground_shadow(d, 32, 54, 20, 5)
    # Ash axe haft
    ln(d, [(18, 54), (46, 14)], WOOD_BASE, 3.6)
    ln(d, [(19, 53), (45, 15)], WOOD_HI, 1.4)
    # Iron axe head (notched bearded blade)
    poly(d, [(42, 12), (54, 16), (56, 32), (48, 28), (40, 24)], IRON_BASE)
    poly(d, [(46, 15), (53, 18), (54, 30), (48, 26), (42, 23)], IRON_HI)
    # Notch in cutting edge
    poly(d, [(53, 23), (50, 24), (54, 26)], DARK)
    # Rolled parchment toll receipt tied to mid-haft with twine
    poly(d, [(22, 34), (34, 24), (38, 29), (26, 39)], (225, 210, 175))
    ln(d, [(24, 36), (36, 26)], (180, 50, 50), 1.6) # bloody entry line
    # Twine cord wrap
    ln(d, [(26, 31), (30, 36)], (150, 115, 65), 2.0)
    ln(d, [(29, 28), (33, 33)], (150, 115, 65), 2.0)
    return im

# 2. uniq-mordred-tallow-wand: Bleached willow wand with iron candle cup holding black candle with flickering flame
def draw_mordred_tallow_wand():
    im, d = create_base()
    ground_shadow(d, 22, 56, 12, 4)
    # Bleached alder/willow wand shaft
    ln(d, [(18, 54), (44, 20)], (225, 220, 205), 3.4)
    ln(d, [(19, 53), (43, 21)], (252, 250, 245), 1.4)
    # Wrought iron candle cup
    poly(d, [(40, 22), (48, 16), (46, 26)], IRON_BASE)
    # Black tallow candle
    poly(d, [(43, 14), (49, 10), (47, 20), (41, 24)], (35, 30, 40))
    # Dripping wax beads
    ell(d, (41, 24, 44, 28), (55, 45, 60))
    # Dual-hue orange/violet flickering flame
    poly(d, [(48, 6), (54, 2), (56, 10), (48, 14)], (175, 75, 225))
    poly(d, [(49, 7), (53, 4), (54, 9), (50, 11)], SLAG_ORANGE)
    ell(d, (50, 5, 53, 8), (255, 240, 160))
    return im

# 3. uniq-ravenwatch-gate-door: Heavy iron-oak buckler with 3 broken arrowheads
def draw_ravenwatch_gate_door():
    im, d = create_base()
    ground_shadow(d, 32, 54, 22, 6)
    # Heavy rectangular iron-oak portcullis buckler
    poly(d, [(14, 14), (50, 14), (48, 48), (32, 54), (16, 48)], WOOD_BASE)
    poly(d, [(17, 17), (47, 17), (45, 45), (32, 50), (19, 45)], (95, 65, 35))
    # Vertical iron reinforcement bars
    for bx in [22, 32, 42]:
        poly(d, [(bx - 2, 15), (bx + 2, 15), (bx + 2, 47), (bx - 2, 47)], IRON_BASE)
        # Heavy square iron rivets
        for ry in [20, 31, 42]:
            poly(d, [(bx - 2, ry - 2), (bx + 2, ry - 2), (bx + 2, ry + 2), (bx - 2, ry + 2)], IRON_HI)
    # 3 broken arrowheads embedded
    poly(d, [(26, 26), (28, 22), (29, 27)], STEEL_HI)
    ln(d, [(28, 22), (24, 18)], WOOD_BASE, 1.6) # snapped splinter shaft
    poly(d, [(38, 35), (42, 34), (39, 39)], STEEL_HI)
    poly(d, [(31, 44), (33, 40), (35, 45)], STEEL_HI)
    return im

# 4. uniq-greywood-poacher-bow: Dark ash recurve bow bound with braided stag sinew
def draw_greywood_poacher_bow():
    im, d = create_base()
    ground_shadow(d, 32, 54, 20, 5)
    # Recurved ash bow stave
    d.arc([10 * S, 10 * S, 52 * S, 52 * S], 240, 120, fill=WOOD_SHADE, width=int(4.2 * S))
    d.arc([12 * S, 12 * S, 50 * S, 50 * S], 245, 115, fill=WOOD_BASE, width=int(2.2 * S))
    # Taut braided string
    ln(d, [(22, 13), (22, 49)], (235, 230, 215), 1.4)
    # Braided stag sinew wrap at handle
    poly(d, [(14, 27), (20, 27), (20, 35), (14, 35)], (205, 175, 135))
    for wy in [29, 31, 33]:
        ln(d, [(14, wy), (20, wy)], (140, 110, 75), 1.2)
    # Poacher tally notches
    ln(d, [(16, 21), (18, 21)], (40, 25, 15), 1.4)
    ln(d, [(17, 23), (19, 23)], (40, 25, 15), 1.4)
    ln(d, [(18, 25), (20, 25)], (40, 25, 15), 1.4)
    # Stag antler limb tips
    poly(d, [(22, 12), (25, 8), (20, 14)], (235, 225, 205))
    poly(d, [(22, 50), (25, 54), (20, 48)], (235, 225, 205))
    return im

# 5. uniq-krag-jawbone: Brutal granite cudgel with quarry chain and crystal teeth
def draw_krag_jawbone():
    im, d = create_base()
    ground_shadow(d, 32, 54, 20, 6)
    # Leather wrapped wooden grip
    ln(d, [(16, 52), (28, 40)], (95, 65, 40), 3.8)
    poly(d, [(14, 52), (18, 50), (16, 56)], BRONZE_BASE)
    # Fossilized beast jawbone / granite head
    poly(d, [(26, 42), (48, 14), (54, 18), (46, 38), (34, 46)], (130, 125, 120))
    poly(d, [(28, 40), (47, 16), (51, 19), (44, 36), (34, 43)], (175, 170, 165))
    # Jagged crystalline teeth along the ridge
    teeth = [
        [(36, 28), (42, 22), (38, 30)],
        [(42, 20), (48, 14), (44, 22)],
        [(48, 13), (53, 9), (51, 16)],
    ]
    for t in teeth:
        poly(d, t, AZURE_HI)
    # Rusty iron quarry chains wrapped around center
    poly(d, [(33, 37), (41, 29), (44, 33), (36, 41)], IRON_BASE)
    ln(d, [(34, 38), (42, 30)], IRON_HI, 1.6)
    return im

# 6. uniq-undervault-lantern-helm: Iron sallet with arched brass cage containing glowing wisp
def draw_undervault_lantern_helm():
    im, d = create_base()
    ground_shadow(d, 32, 54, 22, 6)
    # Heavy iron sallet skull & neckguard
    poly(d, [(16, 32), (22, 22), (42, 22), (48, 32), (52, 44), (44, 52), (20, 52), (14, 44)], IRON_BASE)
    poly(d, [(20, 24), (40, 24), (46, 32), (42, 48), (22, 48), (18, 38)], IRON_HI)
    # Visor ocular slit
    poly(d, [(22, 36), (44, 36), (42, 41), (22, 41)], DARK)
    # Arched brass miner's cage crest on top
    d.arc([22 * S, 8 * S, 42 * S, 26 * S], 180, 360, fill=BRONZE_BASE, width=int(2.2 * S))
    # Vertical cage bars
    ln(d, [(26, 14), (26, 23)], BRONZE_BASE, 1.8)
    ln(d, [(32, 10), (32, 23)], BRONZE_BASE, 1.8)
    ln(d, [(38, 14), (38, 23)], BRONZE_BASE, 1.8)
    # Bound glowing marsh wisp inside cage
    ell(d, (28, 12, 36, 20), (120, 240, 180))
    ell(d, (30, 14, 34, 18), (240, 255, 230))
    return im

# 7. uniq-morvessa-spindle: Bloodstone teardrop pendant in gossamer spider silk
def draw_morvessa_spindle():
    im, d = create_base()
    ground_shadow(d, 32, 54, 18, 5)
    # Braided spider silk neck cord
    d.arc([14 * S, 8 * S, 50 * S, 32 * S], 20, 160, fill=(230, 235, 245), width=int(1.8 * S))
    # Carved teardrop bloodstone pendant
    poly(d, [(32, 22), (44, 38), (38, 50), (26, 50), (20, 38)], RUBY_BASE)
    poly(d, [(32, 25), (41, 38), (36, 47), (28, 47), (23, 38)], (245, 65, 80))
    # Deep moss-green mineral inclusions in bloodstone
    poly(d, [(26, 36), (32, 34), (30, 42), (24, 40)], (45, 85, 55))
    poly(d, [(34, 38), (38, 42), (35, 45)], (45, 85, 55))
    # Wrapped silvery spider-silk webbing threads
    ln(d, [(21, 34), (43, 42)], (240, 245, 255), 1.2)
    ln(d, [(22, 44), (42, 32)], (240, 245, 255), 1.2)
    ln(d, [(28, 26), (36, 48)], (240, 245, 255), 1.2)
    ell(d, (30, 20, 34, 24), GOLD_BASE)
    return im

# 8. uniq-quarry-overseer-maul: Spiked morningstar wrapped in snapped quarry chains
def draw_quarry_overseer_maul():
    im, d = create_base()
    ground_shadow(d, 32, 54, 20, 6)
    # Heavy iron haft
    ln(d, [(16, 52), (44, 20)], IRON_BASE, 3.8)
    ln(d, [(17, 51), (43, 21)], IRON_HI, 1.4)
    # Flanged spiked morningstar head
    poly(d, [(38, 16), (48, 12), (52, 22), (44, 26)], STEEL_BASE)
    # Spikes protruding in 4 directions
    poly(d, [(48, 12), (56, 8), (51, 16)], STEEL_HI)
    poly(d, [(52, 22), (58, 26), (49, 27)], STEEL_HI)
    poly(d, [(44, 26), (46, 34), (39, 28)], STEEL_HI)
    poly(d, [(38, 16), (32, 12), (41, 10)], STEEL_HI)
    # Snapped heavy quarry chains dangling from neck
    poly(d, [(34, 26), (38, 28), (36, 34), (32, 32)], IRON_HI)
    poly(d, [(31, 33), (35, 35), (32, 41), (28, 39)], IRON_HI)
    poly(d, [(27, 40), (31, 42), (28, 48), (24, 46)], IRON_HI)
    return im

# 9. uniq-wardstone-shard-focus: Chiseled quartz monolith in brass armature pulsing with azure ley
def draw_wardstone_shard_focus():
    im, d = create_base()
    ground_shadow(d, 32, 54, 18, 5)
    # Hexagonal chiseled quartz crystal
    poly(d, [(32, 8), (44, 20), (44, 42), (32, 52), (20, 42), (20, 20)], AZURE_BASE)
    poly(d, [(32, 11), (41, 21), (41, 40), (32, 48), (23, 40), (23, 21)], AZURE_HI)
    ln(d, [(32, 10), (32, 50)], (255, 255, 255), 1.8)
    # Brass filigree cage mounting
    poly(d, [(18, 28), (46, 28), (44, 34), (20, 34)], GOLD_BASE)
    poly(d, [(26, 42), (38, 42), (36, 48), (28, 48)], GOLD_BASE)
    # Brass prongs
    ln(d, [(18, 28), (26, 42)], GOLD_HI, 2.0)
    ln(d, [(46, 28), (38, 42)], GOLD_HI, 2.0)
    # Ley-energy pulse flare
    ell(d, (29, 25, 35, 31), (255, 255, 255))
    return im

# 10. uniq-bram-axle-shield: Wooden wagon wheel shield with heavy iron rim & axle hub boss
def draw_bram_axle_shield():
    im, d = create_base()
    ground_shadow(d, 32, 54, 22, 6)
    # Outer heavy iron tyre rim
    ell(d, (12, 12, 52, 52), IRON_BASE)
    ell(d, (14, 14, 50, 50), (135, 145, 155), outline=None)
    # Inner wooden circle
    ell(d, (16, 16, 48, 48), WOOD_BASE)
    ell(d, (18, 18, 46, 46), (105, 75, 45))
    # 8 sturdy wooden wagon spokes
    for angle in range(0, 360, 45):
        rad = math.radians(angle)
        x1 = 32 + int(8 * math.cos(rad))
        y1 = 32 + int(8 * math.sin(rad))
        x2 = 32 + int(16 * math.cos(rad))
        y2 = 32 + int(16 * math.sin(rad))
        ln(d, [(x1, y1), (x2, y2)], WOOD_HI, 2.4)
    # Center heavy iron axle hub boss
    ell(d, (24, 24, 40, 40), IRON_BASE)
    ell(d, (26, 26, 38, 38), IRON_HI)
    ell(d, (29, 29, 35, 35), DARK) # axle grease hole
    return im

# 11. uniq-sera-bone-saw: Flamberge wave-blade with serrated saw teeth and surgical chalice pommel
def draw_sera_bone_saw():
    im, d = create_base()
    ground_shadow(d, 32, 54, 18, 5)
    # Surgical brass pommel (chalice shape)
    poly(d, [(14, 50), (20, 46), (18, 54)], GOLD_BASE)
    # Black grip wrap
    ln(d, [(18, 48), (26, 40)], (40, 35, 35), 3.2)
    # Brass surgical crossguard
    poly(d, [(22, 44), (32, 34), (28, 30), (18, 40)], GOLD_BASE)
    # Flamberge undulating wave-blade with saw teeth on spine
    # Points along blade from hilt (28, 32) to tip (52, 8)
    blade_pts = [
        (26, 34), (30, 26), (36, 28), (40, 20), (46, 22), (52, 10),
        (50, 8), (44, 16), (40, 14), (34, 22), (30, 20), (24, 30)
    ]
    poly(d, blade_pts, STEEL_BASE)
    # Saw serrations along lower edge
    for sx, sy in [(28, 30), (34, 24), (40, 18), (46, 12)]:
        poly(d, [(sx, sy), (sx + 2, sy - 1), (sx + 1, sy + 2)], STEEL_HI)
    ln(d, [(25, 32), (51, 9)], STEEL_HI, 1.4)
    return im

# 12. uniq-sunken-castellan-plate: Barnacle-crusted leather/steel brigandine with verdigris bronze plates
def draw_sunken_castellan_plate():
    im, d = create_base()
    ground_shadow(d, 32, 54, 22, 6)
    # Dark sea-soaked cuirass silhouette
    poly(d, [(18, 14), (28, 12), (36, 12), (46, 14), (50, 26), (44, 52), (20, 52), (14, 26)], (45, 55, 60))
    poly(d, [(20, 16), (44, 16), (42, 50), (22, 50)], (35, 45, 50))
    # Riveted bronze plates with verdigris patina
    for py in [22, 30, 38, 46]:
        poly(d, [(22, py), (42, py), (40, py + 6), (24, py + 6)], (105, 145, 115))
        for rx in [26, 32, 38]:
            ell(d, (rx - 1.5, py + 1.5, rx + 1.5, py + 4.5), BRONZE_HI)
    # White crusted barnacles clinging to shoulder & flank
    for bx, by in [(16, 22), (18, 25), (46, 24), (48, 27), (20, 44), (44, 46)]:
        poly(d, [(bx, by), (bx + 3, by - 2), (bx + 4, by + 2), (bx + 1, by + 3)], (225, 230, 225))
        ell(d, (bx + 1, by, bx + 3, by + 2), (50, 60, 65))
    return im

# 13. uniq-lyra-last-arbalest: Siege arbalest with steel prod and iron gatekeeper turnkey mechanism
def draw_lyra_last_arbalest():
    im, d = create_base()
    ground_shadow(d, 32, 54, 22, 6)
    # Heavy carved walnut stock
    ln(d, [(14, 52), (48, 18)], WOOD_BASE, 4.4)
    ln(d, [(15, 51), (47, 19)], WOOD_HI, 1.6)
    # Composite steel bow prod
    ln(d, [(22, 14), (52, 44)], STEEL_BASE, 3.6)
    ln(d, [(23, 15), (51, 43)], STEEL_HI, 1.4)
    # Steel bowstring
    ln(d, [(22, 14), (16, 48)], (225, 230, 235), 1.2)
    ln(d, [(52, 44), (16, 48)], (225, 230, 235), 1.2)
    # Cranequin iron portcullis turnkey crank
    poly(d, [(28, 32), (36, 24), (38, 28), (30, 36)], IRON_BASE)
    # Turnkey key ring handle
    ell(d, (34, 20, 42, 28), None, outline=IRON_HI, width=2.0)
    poly(d, [(44, 14), (54, 10), (50, 20)], STEEL_HI) # stirrup at front
    return im

# 14. uniq-stormtree-amber-staff: Charred lightning-split oak staff holding crackling raw amber nodule
def draw_stormtree_amber_staff():
    im, d = create_base()
    ground_shadow(d, 22, 56, 14, 4)
    # Charred ancient oak staff with scorched cracks
    ln(d, [(18, 54), (44, 18)], (45, 38, 35), 4.2)
    ln(d, [(19, 53), (43, 19)], (75, 60, 55), 1.6)
    # Lightning scorch seam
    ln(d, [(22, 48), (28, 40), (34, 30), (42, 20)], (225, 140, 45), 1.2)
    # Forked gnarled crown branches clutching amber
    poly(d, [(40, 22), (42, 14), (46, 18)], (60, 48, 40))
    poly(d, [(44, 20), (52, 16), (48, 22)], (60, 48, 40))
    # Raw fist-sized amber chunk
    poly(d, [(42, 14), (52, 10), (54, 20), (46, 24)], (235, 165, 45))
    poly(d, [(44, 13), (50, 11), (52, 18), (47, 21)], (255, 220, 105))
    # Lightning spark arcs dancing across amber
    ln(d, [(42, 12), (48, 16), (46, 22)], AZURE_HI, 1.4)
    ell(d, (47, 14, 50, 17), (255, 255, 255))
    return im

# 15. uniq-drowned-choir-bell: Sunken bronze bell clapper hung as heavy talisman with aquamarine patina
def draw_drowned_choir_bell():
    im, d = create_base()
    ground_shadow(d, 32, 54, 18, 5)
    # Braided sailor's cord
    d.arc([16 * S, 10 * S, 48 * S, 32 * S], 20, 160, fill=(145, 115, 75), width=int(2.0 * S))
    # Heavy oceanic bronze clapper talisman (spherical knob + fluted shaft)
    poly(d, [(30, 20), (34, 20), (36, 36), (28, 36)], (145, 110, 60))
    poly(d, [(31, 21), (33, 21), (35, 35), (29, 35)], BRONZE_HI)
    # Large rounded striker ball at bottom
    ell(d, (22, 34, 42, 50), (135, 100, 55))
    ell(d, (24, 36, 40, 48), BRONZE_HI)
    # Aquamarine verdigris patina patches
    poly(d, [(26, 38), (32, 36), (30, 42), (24, 40)], (95, 195, 175))
    poly(d, [(34, 40), (38, 42), (36, 46)], (95, 195, 175))
    ell(d, (31, 41, 35, 45), (180, 255, 240))
    return im

# 16. uniq-vesperion-organ-pipe: Slender gothic metal fluted pipe wand with amethyst crystal tip
def draw_vesperion_organ_pipe():
    im, d = create_base()
    ground_shadow(d, 22, 56, 12, 4)
    # Slender gothic pipe wand shaft (dark pewter / iron)
    ln(d, [(18, 54), (44, 18)], STEEL_SHADE, 4.0)
    ln(d, [(19, 53), (43, 19)], STEEL_HI, 1.4)
    # Fluted organ sound vent mouth (languid notch)
    poly(d, [(26, 44), (32, 38), (30, 36), (24, 42)], DARK)
    # Cut amethyst harmonic crystal tip
    poly(d, [(42, 20), (52, 10), (56, 14), (46, 24)], (165, 85, 235))
    poly(d, [(44, 19), (51, 12), (54, 15), (47, 22)], (225, 175, 255))
    ln(d, [(43, 20), (55, 12)], (255, 240, 255), 1.6)
    return im

# 17. uniq-anvilmaw-slag-maul: Obsidian greatmaul with glowing molten orange slag seams
def draw_anvilmaw_slag_maul():
    im, d = create_base()
    ground_shadow(d, 32, 54, 22, 6)
    # Heavy iron haft
    ln(d, [(16, 52), (42, 22)], IRON_BASE, 4.4)
    ln(d, [(17, 51), (41, 23)], IRON_HI, 1.6)
    # Enormous volcanic obsidian hammer head
    poly(d, [(32, 20), (48, 8), (56, 20), (40, 32)], OBSIDIAN_BASE)
    poly(d, [(34, 21), (47, 10), (53, 19), (41, 30)], OBSIDIAN_HI)
    # Molten slag fracture veins glowing orange/yellow
    ln(d, [(36, 22), (44, 18), (48, 24), (52, 18)], SLAG_ORANGE, 2.2)
    ln(d, [(38, 22), (44, 19), (47, 23)], SLAG_YELLOW, 1.2)
    # Smoldering slag drips
    ell(d, (38, 28, 41, 32), SLAG_ORANGE)
    ell(d, (46, 26, 48, 29), SLAG_YELLOW)
    return im

# 18. uniq-redglass-fletched-bow: Volcanic glass composite bow with crimson obsidian tips
def draw_redglass_fletched_bow():
    im, d = create_base()
    ground_shadow(d, 32, 54, 20, 5)
    # Black volcanic glass (obsidian) bow stave
    d.arc([10 * S, 10 * S, 52 * S, 52 * S], 240, 120, fill=OBSIDIAN_BASE, width=int(4.4 * S))
    d.arc([12 * S, 12 * S, 50 * S, 50 * S], 245, 115, fill=OBSIDIAN_HI, width=int(2.0 * S))
    # Crimson obsidian tips
    poly(d, [(22, 12), (26, 8), (19, 14)], RUBY_BASE)
    poly(d, [(22, 50), (26, 54), (19, 48)], RUBY_BASE)
    # Bowstring
    ln(d, [(22, 12), (22, 50)], (235, 225, 215), 1.3)
    # Ember-fletched arrow nocked
    ln(d, [(16, 31), (48, 31)], (140, 95, 60), 2.2)
    poly(d, [(48, 28), (56, 31), (48, 34)], RUBY_HI)
    poly(d, [(16, 28), (12, 31), (16, 34)], SLAG_ORANGE)
    return im

# 19. uniq-hollow-monarch-blade: Tarnished silver zweihander with cracked royal crown crossguard
def draw_hollow_monarch_blade():
    im, d = create_base()
    ground_shadow(d, 32, 54, 20, 5)
    # Fluted royal pommel
    poly(d, [(12, 52), (18, 48), (16, 56)], GOLD_BASE)
    # Two-handed black leather wrapped hilt
    ln(d, [(16, 50), (26, 40)], (45, 40, 45), 3.4)
    # Cracked fluted crown crossguard
    poly(d, [(20, 46), (32, 34), (28, 30), (16, 42)], GOLD_BASE)
    # Crown fleur-de-lis points on guard
    poly(d, [(16, 42), (12, 38), (18, 38)], GOLD_HI)
    poly(d, [(32, 34), (36, 30), (32, 28)], GOLD_HI)
    # Long straight zweihander blade with central fuller
    blade_pts = [(24, 38), (52, 10), (54, 12), (26, 40)]
    poly(d, [(24, 38), (52, 10), (55, 13), (27, 41)], STEEL_BASE)
    ln(d, [(25, 39), (53, 11)], STEEL_HI, 2.0)
    ln(d, [(26, 38), (50, 14)], (60, 65, 75), 1.2) # dark fuller groove
    return im

# 20. uniq-ashkarath-crown-shard: Curved demonic obsidian horn-blade medallion inlaid with ruby embers
def draw_ashkarath_crown_shard():
    im, d = create_base()
    ground_shadow(d, 32, 54, 20, 5)
    # Heavy twisted iron chain necklace
    d.arc([14 * S, 10 * S, 50 * S, 34 * S], 20, 160, fill=IRON_HI, width=int(2.2 * S))
    # Curved demonic obsidian horn
    horn_pts = [
        (30, 20), (44, 26), (48, 38), (42, 50), (32, 52), (36, 42), (28, 32), (24, 22)
    ]
    poly(d, horn_pts, OBSIDIAN_BASE)
    poly(d, [(31, 22), (42, 27), (45, 38), (40, 48), (32, 50), (35, 42), (29, 33)], (75, 68, 80))
    # Inlaid blazing ruby embers along the ridge
    for rx, ry in [(30, 24), (36, 28), (42, 34), (43, 42)]:
        ell(d, (rx - 2.5, ry - 2.5, rx + 2.5, ry + 2.5), RUBY_BASE)
        ell(d, (rx - 1, ry - 1, rx + 1, ry + 1), RUBY_HI)
    # Fiery cinder glow at the severed base
    poly(d, [(24, 22), (30, 20), (28, 26)], SLAG_ORANGE)
    ell(d, (26, 21, 29, 24), SLAG_YELLOW)
    return im

UNIQUE_DRAWERS = {
    'uniq-tollkeeper-bill': draw_tollkeeper_bill,
    'uniq-mordred-tallow-wand': draw_mordred_tallow_wand,
    'uniq-ravenwatch-gate-door': draw_ravenwatch_gate_door,
    'uniq-greywood-poacher-bow': draw_greywood_poacher_bow,
    'uniq-krag-jawbone': draw_krag_jawbone,
    'uniq-undervault-lantern-helm': draw_undervault_lantern_helm,
    'uniq-morvessa-spindle': draw_morvessa_spindle,
    'uniq-quarry-overseer-maul': draw_quarry_overseer_maul,
    'uniq-wardstone-shard-focus': draw_wardstone_shard_focus,
    'uniq-bram-axle-shield': draw_bram_axle_shield,
    'uniq-sera-bone-saw': draw_sera_bone_saw,
    'uniq-sunken-castellan-plate': draw_sunken_castellan_plate,
    'uniq-lyra-last-arbalest': draw_lyra_last_arbalest,
    'uniq-stormtree-amber-staff': draw_stormtree_amber_staff,
    'uniq-drowned-choir-bell': draw_drowned_choir_bell,
    'uniq-vesperion-organ-pipe': draw_vesperion_organ_pipe,
    'uniq-anvilmaw-slag-maul': draw_anvilmaw_slag_maul,
    'uniq-redglass-fletched-bow': draw_redglass_fletched_bow,
    'uniq-hollow-monarch-blade': draw_hollow_monarch_blade,
    'uniq-ashkarath-crown-shard': draw_ashkarath_crown_shard,
}

def main():
    os.makedirs(OUT, exist_ok=True)
    generated = []

    print(f"Generating {len(UNIQUE_DRAWERS)} unique item icons...")
    for uid, drawer in UNIQUE_DRAWERS.items():
        high_res = drawer()
        icon = high_res.resize((64, 64), Image.LANCZOS)
        out_path = os.path.join(OUT, f"{uid}.png")
        icon.save(out_path, format="PNG", optimize=True)
        generated.append(uid)

        # Verification check
        arr = np.array(icon)
        assert arr.shape == (64, 64, 4), f"Bad shape for {uid}: {arr.shape}"
        edge_alpha = np.concatenate([arr[0, :, 3], arr[-1, :, 3], arr[:, 0, 3], arr[:, -1, 3]])
        assert edge_alpha.max() <= 10, f"Opaque edge in {uid}: {edge_alpha.max()}"

    print(f"Successfully generated {len(generated)} unique icons in {OUT}")

    # Build contact sheet (5 columns x 4 rows)
    cols = 5
    rows = (len(generated) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * 68, rows * 68), (30, 25, 35, 255))
    for idx, uid in enumerate(generated):
        r = idx // cols
        c = idx % cols
        ic = Image.open(os.path.join(OUT, f"{uid}.png"))
        sheet.paste(ic, (c * 68 + 2, r * 68 + 2), ic)
    contact_path = os.path.join(ROOT, ".art-build", "unique-icons-contact.png")
    sheet.save(contact_path)
    print(f"Contact sheet saved to {contact_path}")

if __name__ == '__main__':
    main()
