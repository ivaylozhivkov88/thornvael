"""Generate Necromancer attack sprites for Thornvael.
Rage of Mages 2 / Allods 2 dark-fantasy top-down isometric style.

Features:
- Character: Necromancer in dark hooded cowl robe, skeletal pauldrons, bone-clasped stole,
  gnarlwood staff crowned with an ancient horned skull, and glowing green necrotic energy.
- 16 directions x 4 frames = 64 frames for the 'attack' animation.
- Frames:
  * 00: windup (замах) - staff drawn back, necrotic energy gathering
  * 01: apex (връх) - staff reared high, intense necrotic concentration
  * 02: impact (УДАР) - the strike! Explosive green necrotic burst/arc, maximum kinetic expression
  * 03: recovery (откат) - staff resetting, lingering green smoke dissipation
- Output files in game/public/sprites/:
  * necromancer.png: 2048x2048 RGBA atlas
  * necromancer.json: PixiJS spritesheet JSON
  * necromancer-mask.png: 2048x2048 4-quadrant palette mask (R=team, G=armour, B=level, A=alpha)
  * _necromancer-sheet-preview.png: 16 rows x 4 columns contact sheet preview
"""
import math
import os
import sys
import json
import numpy as np
from PIL import Image

DIRECTIONS = 16
LOGICAL = 48
CELL = 96
K = CELL // LOGICAL  # 2
SS = 8               # Supersampling factor: 384px canvas -> 96px cell (4x AA)
CELL_HI = LOGICAL * SS # 384
ATLAS_SIZE = 2048

ELEV = math.radians(35)
COS_ELEV = math.cos(ELEV)
SIN_ELEV = math.sin(ELEV)

PY_GRID, PX_GRID = np.mgrid[0:CELL_HI, 0:CELL_HI].astype(np.float32)

# Camera-fixed isometric lighting rig
L_KEY = np.array([-0.54, -0.60, 0.59], dtype=np.float32)
L_KEY /= np.linalg.norm(L_KEY)
L_FILL = np.array([0.48, -0.22, 0.45], dtype=np.float32)
L_FILL /= np.linalg.norm(L_FILL)
L_RIM = np.array([0.08, 0.65, 0.40], dtype=np.float32)
L_RIM /= np.linalg.norm(L_RIM)
H_KEY = L_KEY + np.array([0.0, 0.0, 1.0], dtype=np.float32)
H_KEY /= np.linalg.norm(H_KEY)

MASK_CODES = {
    "none": (0, 0, 0, 255),
    "skin": (0, 0, 0, 255),
    "team": (255, 0, 0, 255),      # Red = Team color
    "armour": (0, 255, 0, 255),    # Green = Armour tier tint
    "level": (0, 0, 255, 255),     # Blue = Level / rank accent
}


def project_3d_point(x: float, y: float, z: float, facing_angle: float):
    cos_a = math.cos(facing_angle)
    sin_a = math.sin(facing_angle)
    rx = x * cos_a - y * sin_a
    ry = x * sin_a + y * cos_a
    rz = z
    sx = rx
    sy = -rz * COS_ELEV + ry * SIN_ELEV
    depth = ry * COS_ELEV + rz * SIN_ELEV
    return sx, sy, depth


class VoxelCanvas:
    def __init__(self):
        self.color = np.zeros((CELL_HI, CELL_HI, 4), dtype=np.uint8)
        self.mask = np.zeros((CELL_HI, CELL_HI, 4), dtype=np.uint8)
        self.zbuf = np.full((CELL_HI, CELL_HI), -9999.0, dtype=np.float32)

    def draw_ground_shadow(self, radius_x: float = 10.5, radius_y: float = 5.2, cy: float = 39.0):
        scx = 24.0 * SS
        scy = cy * SS
        rx = radius_x * SS
        ry = radius_y * SS

        dx = (PX_GRID - scx) / max(1.0, rx)
        dy = (PY_GRID - scy) / max(1.0, ry)
        d2 = dx * dx + dy * dy
        valid = (d2 < 1.0) & (PX_GRID >= 2 * SS) & (PX_GRID <= CELL_HI - 2 * SS - 1) & (PY_GRID >= 2 * SS) & (PY_GRID <= CELL_HI - 2 * SS - 1) & (self.color[:, :, 3] == 0)
        alpha = (np.maximum(0.0, 1.0 - d2) ** 1.8 * 95.0).astype(np.uint8)

        self.color[valid, 0] = 8
        self.color[valid, 1] = 12
        self.color[valid, 2] = 10
        self.color[valid, 3] = alpha[valid]

    def draw_part(
        self,
        cx: float,
        cy: float,
        cz: float,
        rx: float,
        ry: float,
        rz: float,
        rgb: tuple[int, int, int],
        mask_type: str,
        facing_angle: float,
        alpha: int = 255,
        tex_mode: str = "smooth",
        spec_power: float = 18.0,
        spec_strength: float = 0.5,
        emissive: float = 0.0,
        ao_darken: float = 0.0,
        green_necrotic: bool = False,
    ):
        scx_rel, scy_rel, depth_c = project_3d_point(cx, cy, cz, facing_angle)
        scx = (24.0 + scx_rel) * SS
        scy = (39.0 + scy_rel) * SS

        cos_a = abs(math.cos(facing_angle))
        sin_a = abs(math.sin(facing_angle))
        eff_rx = max(1.0, (rx * cos_a + ry * sin_a) * SS)
        eff_ry = max(1.0, ((rx * sin_a + ry * cos_a) * SIN_ELEV + rz * COS_ELEV) * SS)

        x0 = max(2, int(math.floor(scx - eff_rx - 1.0)))
        x1 = min(CELL_HI - 3, int(math.ceil(scx + eff_rx + 1.0)))
        y0 = max(2, int(math.floor(scy - eff_ry - 1.0)))
        y1 = min(CELL_HI - 3, int(math.ceil(scy + eff_ry + 1.0)))
        if x0 > x1 or y0 > y1:
            return

        sub_px = PX_GRID[y0 : y1 + 1, x0 : x1 + 1]
        sub_py = PY_GRID[y0 : y1 + 1, x0 : x1 + 1]
        nx = (sub_px - scx) / eff_rx
        ny = (sub_py - scy) / eff_ry
        d2 = nx * nx + ny * ny
        inside = d2 <= 1.0
        if not np.any(inside):
            return

        nz = np.sqrt(np.maximum(0.0, 1.0 - d2))
        z_offset = nz * ((rz + ry) * 0.5 * SS)
        depth = depth_c * SS + z_offset

        sub_zbuf = self.zbuf[y0 : y1 + 1, x0 : x1 + 1]
        vis = inside & (depth > sub_zbuf)
        if not np.any(vis):
            return

        sub_zbuf[vis] = depth[vis]

        ny_p = ny
        nx_p = nx
        tex_mod = 1.0
        if tex_mode == "cloth":
            fold = np.sin(sub_py * 0.35 + sub_px * 0.15) * 0.16
            ny_p = np.clip(ny + fold, -1.0, 1.0)
            tex_mod = 1.0 + fold * 0.4
        elif tex_mode == "bone":
            ridges = np.cos(sub_px * 0.5) * 0.14
            nx_p = np.clip(nx + ridges, -1.0, 1.0)
            tex_mod = 1.0 + ridges * 0.35
        elif tex_mode == "wood":
            grain = (np.sin(sub_py * 0.8) + np.cos(sub_px * 0.2)) * 0.1
            tex_mod = 1.0 + grain

        diff_key = np.maximum(0.0, nx_p * L_KEY[0] + ny_p * L_KEY[1] + nz * L_KEY[2])
        diff_fill = np.maximum(0.0, nx_p * L_FILL[0] + ny_p * L_FILL[1] + nz * L_FILL[2]) * 0.32
        diff_rim = np.maximum(0.0, ny_p * L_RIM[1] + nz * L_RIM[2]) * 0.25
        spec = np.power(np.maximum(0.0, nx_p * H_KEY[0] + ny_p * H_KEY[1] + nz * H_KEY[2]), spec_power) * spec_strength
        rim = np.power(1.0 - nz, 2.2) * 0.35

        ambient = 0.34 * (1.0 - ao_darken * 0.4)
        lit = (ambient + diff_key * 0.72 + diff_fill + diff_rim + rim) * tex_mod + emissive

        if green_necrotic:
            spec_r, spec_g, spec_b = 140.0, 255.0, 160.0
            rim_r, rim_g, rim_b = 70.0, 240.0, 110.0
        else:
            spec_r, spec_g, spec_b = 230.0, 240.0, 245.0
            rim_r, rim_g, rim_b = 35.0, 45.0, 40.0

        cr = np.clip(rgb[0] * lit + spec * spec_r + rim * rim_r + emissive * 50.0, 0, 255).astype(np.uint8)
        cg = np.clip(rgb[1] * lit + spec * spec_g + rim * rim_g + emissive * 120.0, 0, 255).astype(np.uint8)
        cb = np.clip(rgb[2] * lit + spec * spec_b + rim * rim_b + emissive * 60.0, 0, 255).astype(np.uint8)

        sub_col = self.color[y0 : y1 + 1, x0 : x1 + 1]
        sub_col[vis, 0] = cr[vis]
        sub_col[vis, 1] = cg[vis]
        sub_col[vis, 2] = cb[vis]
        sub_col[vis, 3] = alpha

        m_rgba = MASK_CODES.get(mask_type, (0, 0, 0, 255))
        sub_msk = self.mask[y0 : y1 + 1, x0 : x1 + 1]
        sub_msk[vis, 0] = m_rgba[0]
        sub_msk[vis, 1] = m_rgba[1]
        sub_msk[vis, 2] = m_rgba[2]
        sub_msk[vis, 3] = m_rgba[3]

    def draw_capsule(
        self,
        p0: tuple[float, float, float],
        p1: tuple[float, float, float],
        r0: float,
        r1: float,
        rgb: tuple[int, int, int],
        mask_type: str,
        facing_angle: float,
        steps: int = 7,
        tex_mode: str = "smooth",
        spec_strength: float = 0.5,
        spec_power: float = 18.0,
        emissive: float = 0.0,
        ao_darken: float = 0.0,
        green_necrotic: bool = False,
    ):
        for s in range(steps + 1):
            f = s / max(1, steps)
            cx = p0[0] + (p1[0] - p0[0]) * f
            cy = p0[1] + (p1[1] - p0[1]) * f
            cz = p0[2] + (p1[2] - p0[2]) * f
            r = r0 + (r1 - r0) * f
            self.draw_part(
                cx, cy, cz, r, r, r, rgb, mask_type, facing_angle,
                tex_mode=tex_mode, spec_power=spec_power, spec_strength=spec_strength,
                emissive=emissive, ao_darken=ao_darken, green_necrotic=green_necrotic,
            )


def render_necromancer_attack_frame(facing_angle: float, frame_idx: int):
    vc = VoxelCanvas()
    vc.draw_ground_shadow(10.5, 5.2, 39.0)

    # 4-frame strike cycle:
    # 00: windup (замах)
    # 01: apex (връх)
    # 02: impact (УДАР)
    # 03: recovery (откат)
    if frame_idx == 0:
        torso_y = -0.5
        torso_z = 20.8
        torso_pitch = -0.15
        staff_rot_y = -2.2
        staff_rot_z = 1.0
        staff_reach = -1.2
        necrotic_glow = 0.45
        blast_size = 0.0
    elif frame_idx == 1:
        torso_y = -0.8
        torso_z = 21.8
        torso_pitch = -0.28
        staff_rot_y = -3.8
        staff_rot_z = 3.6
        staff_reach = -2.0
        necrotic_glow = 0.85
        blast_size = 0.0
    elif frame_idx == 2:
        # IMPACT! The strike hit
        torso_y = 1.8
        torso_z = 19.5
        torso_pitch = 0.35
        staff_rot_y = 4.2
        staff_rot_z = -3.2
        staff_reach = 4.8
        necrotic_glow = 1.0
        blast_size = 3.8
    else: # frame_idx == 3: recovery
        torso_y = 0.6
        torso_z = 20.5
        torso_pitch = 0.1
        staff_rot_y = 1.6
        staff_rot_z = -1.0
        staff_reach = 1.8
        necrotic_glow = 0.5
        blast_size = 1.2

    tz = torso_z
    ty = torso_y

    # 1. Dark flowing cultist robe lower hem & boots
    for side in (-1, 1):
        vc.draw_part(side * 1.7, ty + 0.3, 1.2, 1.1, 2.0, 1.1, (24, 22, 28), "none", facing_angle, tex_mode="cloth")

    # Cascading layered robe skirt (dark charcoal obsidian)
    vc.draw_part(0, ty, tz - 11.8, 4.4, 3.8, 2.9, (26, 28, 34), "none", facing_angle, tex_mode="cloth")
    vc.draw_part(0, ty, tz - 7.5, 4.1, 3.4, 3.6, (32, 34, 42), "none", facing_angle, tex_mode="cloth")
    vc.draw_part(0, ty, tz - 3.0, 3.7, 2.9, 3.2, (38, 40, 50), "none", facing_angle, tex_mode="cloth")

    # 2. Outer Robe Mantle Hem & Cowl Trim (TEAM COLOR = RED MASK)
    # Hood hem & cloak trim runs around shoulders and outer robe sides (visible from all 16 directions!)
    for side in (-1, 1):
        vc.draw_capsule((side * 2.8, ty, tz - 10.0), (side * 2.4, ty, tz + 3.0), 1.2, 1.4, (148, 36, 42), "team", facing_angle, steps=6, tex_mode="cloth")
        vc.draw_capsule((side * 1.8, ty - 1.2, tz - 9.0), (side * 1.4, ty - 1.2, tz + 2.0), 1.0, 1.2, (148, 36, 42), "team", facing_angle, steps=5, tex_mode="cloth")
    # Hood rear cloak border
    vc.draw_capsule((-2.2, ty - 1.8, tz - 4.0), (2.2, ty - 1.8, tz - 4.0), 1.1, 1.1, (148, 36, 42), "team", facing_angle, steps=5, tex_mode="cloth")
    vc.draw_part(0, ty + 1.2, tz - 8.5, 2.8, 1.8, 1.2, (148, 36, 42), "team", facing_angle, tex_mode="cloth")

    # 3. Skeletal Pauldrons & Armored Collar Stole (ARMOUR TIER = GREEN MASK)
    # Ceremonial vestment breastplate & bone collar
    vc.draw_part(0, ty + 0.5, tz + 0.5, 2.8, 2.4, 2.2, (168, 165, 155), "armour", facing_angle, tex_mode="bone", spec_power=24.0, spec_strength=0.7)
    # Skeletal pauldrons on both shoulders
    for side in (-1, 1):
        p_x = side * 3.4
        p_y = ty + (side * torso_pitch * 1.5)
        p_z = tz + 2.4
        vc.draw_part(p_x, p_y, p_z, 1.9, 2.3, 1.6, (175, 172, 160), "armour", facing_angle, tex_mode="bone", spec_power=22.0, spec_strength=0.75)
        vc.draw_part(p_x * 1.05, p_y - 0.2, p_z + 1.2, 0.8, 1.0, 1.3, (195, 192, 180), "armour", facing_angle, tex_mode="bone")

    # 4. Level / Rank Accent: Death Amulet, Belt Clasp & Silver Trim (LEVEL = BLUE MASK)
    # Death Amulet medallion hanging over chest
    vc.draw_part(0, ty + 2.2, tz + 0.8, 1.4, 1.3, 1.4, (190, 195, 220), "level", facing_angle, spec_power=26.0, spec_strength=0.85)
    vc.draw_part(0, ty - 1.8, tz + 1.2, 1.4, 1.3, 1.4, (190, 195, 220), "level", facing_angle, spec_power=26.0, spec_strength=0.85)
    # Girdle / skull reliquary buckle
    vc.draw_part(0, ty + 2.1, tz - 4.5, 1.4, 1.3, 1.3, (200, 205, 230), "level", facing_angle, spec_power=26.0, spec_strength=0.85)
    vc.draw_part(0, ty - 1.9, tz - 4.5, 1.4, 1.3, 1.3, (200, 205, 230), "level", facing_angle, spec_power=26.0, spec_strength=0.85)
    # Cowl crest talisman
    vc.draw_part(0, ty + 0.6, tz + 9.5, 1.1, 1.2, 1.1, (190, 195, 220), "level", facing_angle, spec_power=26.0, spec_strength=0.85)

    # 5. Cowl, Hood & Gaunt Skeletal Face (NEUTRAL/SKIN)
    head_z = tz + 6.8
    head_y = ty + 0.3
    # Deep pointed cowl outer hood
    vc.draw_part(0, head_y - 0.4, head_z + 0.9, 2.6, 2.7, 2.4, (30, 32, 40), "none", facing_angle, tex_mode="cloth")
    vc.draw_part(0, head_y + 0.4, head_z + 2.0, 2.1, 2.3, 1.5, (25, 27, 34), "none", facing_angle, tex_mode="cloth")
    vc.draw_part(0, head_y - 0.8, head_z + 2.8, 1.3, 1.6, 1.2, (22, 24, 30), "none", facing_angle)
    # Sunken gaunt face inside cowl
    vc.draw_part(0, head_y + 1.1, head_z - 0.3, 1.6, 1.5, 1.8, (175, 168, 155), "skin", facing_angle)
    # Glowing green necrotic eyes
    vc.draw_part(-0.5, head_y + 1.9, head_z, 0.35, 0.35, 0.35, (40, 230, 100), "none", facing_angle, emissive=necrotic_glow * 0.7)
    vc.draw_part(0.5, head_y + 1.9, head_z, 0.35, 0.35, 0.35, (40, 230, 100), "none", facing_angle, emissive=necrotic_glow * 0.7)

    # 6. Right Arm & Ancient Horned Skull Staff
    arm_x = 2.8
    arm_y = ty + 0.5 + staff_reach * 0.6
    arm_z = tz + 1.0 + staff_rot_z * 0.5
    vc.draw_capsule((arm_x, ty, tz + 2.0), (arm_x + 0.6, arm_y, arm_z), 1.2, 0.9, (32, 34, 42), "none", facing_angle, steps=4, tex_mode="cloth")
    vc.draw_part(arm_x + 0.6, arm_y, arm_z, 0.75, 0.8, 0.7, (180, 172, 160), "skin", facing_angle)

    staff_x = arm_x + 0.8
    staff_y_mid = arm_y
    staff_z_mid = arm_z

    bot_x = staff_x
    bot_y = staff_y_mid - staff_rot_y * 1.5
    bot_z = staff_z_mid - 11.5 - staff_rot_z * 0.8

    top_x = staff_x
    top_y = staff_y_mid + staff_rot_y * 2.2
    top_z = staff_z_mid + 11.2 + staff_rot_z * 1.2

    # Gnarlwood staff shaft
    vc.draw_capsule((bot_x, bot_y, bot_z), (top_x, top_y, top_z), 0.65, 0.65, (58, 42, 30), "none", facing_angle, steps=7, tex_mode="wood")
    # Staff bone rings (armour mask)
    band1 = (bot_x * 0.7 + top_x * 0.3, bot_y * 0.7 + top_y * 0.3, bot_z * 0.7 + top_z * 0.3)
    band2 = (bot_x * 0.3 + top_x * 0.7, bot_y * 0.3 + top_y * 0.7, bot_z * 0.3 + top_z * 0.7)
    vc.draw_part(band1[0], band1[1], band1[2], 0.85, 0.85, 0.85, (165, 170, 175), "armour", facing_angle, spec_power=26.0)
    vc.draw_part(band2[0], band2[1], band2[2], 0.85, 0.85, 0.85, (165, 170, 175), "armour", facing_angle, spec_power=26.0)

    # Ancient Horned Skull Staff Head
    skull_x = top_x
    skull_y = top_y + 0.3
    skull_z = top_z + 1.2
    vc.draw_part(skull_x, skull_y, skull_z, 1.7, 1.8, 1.8, (215, 210, 195), "none", facing_angle, tex_mode="bone", spec_power=24.0, spec_strength=0.7)
    vc.draw_part(skull_x, skull_y + 0.8, skull_z - 0.6, 1.4, 1.3, 1.2, (200, 195, 180), "none", facing_angle, tex_mode="bone")
    # Horns
    vc.draw_capsule((skull_x - 1.2, skull_y - 0.4, skull_z + 0.6), (skull_x - 2.4, skull_y - 0.2, skull_z + 2.2), 0.5, 0.25, (85, 68, 52), "none", facing_angle, steps=4)
    vc.draw_capsule((skull_x + 1.2, skull_y - 0.4, skull_z + 0.6), (skull_x + 2.4, skull_y - 0.2, skull_z + 2.2), 0.5, 0.25, (85, 68, 52), "none", facing_angle, steps=4)

    # Glowing Necrotic Orb & Fire in Skull (Green Necrotic magic)
    vc.draw_part(skull_x - 0.55, skull_y + 1.3, skull_z - 0.1, 0.45, 0.45, 0.45, (80, 255, 120), "none", facing_angle, emissive=necrotic_glow, green_necrotic=True)
    vc.draw_part(skull_x + 0.55, skull_y + 1.3, skull_z - 0.1, 0.45, 0.45, 0.45, (80, 255, 120), "none", facing_angle, emissive=necrotic_glow, green_necrotic=True)
    vc.draw_part(skull_x, skull_y, skull_z + 1.8, 1.3, 1.3, 1.3, (110, 255, 140), "none", facing_angle, emissive=necrotic_glow, green_necrotic=True)

    # IMPACT FRAME SPECIAL EFFECT: Frame 02 Necrotic Strike Explosion / Arc
    if blast_size > 0.5:
        arc_reach = blast_size
        for a_step in range(7):
            af = a_step / 6.0
            bx = skull_x + (af - 0.5) * 4.4
            by = skull_y + 1.2 + af * arc_reach * 1.5
            bz = skull_z - af * 3.8
            b_rad = 1.2 + math.sin(af * math.pi) * 1.0
            vc.draw_part(bx, by, bz, b_rad, b_rad * 1.3, b_rad, (140, 255, 160), "none", facing_angle, emissive=1.0, green_necrotic=True)

    return finalize_cell(vc)


def finalize_cell(vc: VoxelCanvas):
    c_hi = Image.fromarray(vc.color, "RGBA")
    m_hi = Image.fromarray(vc.mask, "RGBA")

    c_lo = c_hi.resize((CELL, CELL), Image.Resampling.LANCZOS)
    m_lo = m_hi.resize((CELL, CELL), Image.Resampling.BILINEAR)

    col = np.array(c_lo)
    msk = np.array(m_lo)

    # Enforce strict 1-pixel transparent cell boundary (no clipping)
    col[0, :, :] = 0
    col[CELL - 1, :, :] = 0
    col[:, 0, :] = 0
    col[:, CELL - 1, :] = 0

    msk[0, :, :] = 0
    msk[CELL - 1, :, :] = 0
    msk[:, 0, :] = 0
    msk[:, CELL - 1, :] = 0

    # Strict mask containment: mask pixels must NEVER exist outside color silhouette
    col_alpha = col[:, :, 3]
    msk[col_alpha == 0] = 0
    msk[:, :, 3] = np.minimum(msk[:, :, 3], col_alpha)
    msk[col_alpha < 32] = 0

    return col, msk


def build_necromancer_attack_atlas():
    out_sprites_dir = "game/public/sprites" if os.path.exists("game/public/sprites") else "public/sprites"
    os.makedirs(out_sprites_dir, exist_ok=True)

    color_atlas = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))
    mask_atlas = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))

    # Contact sheet preview: 16 rows (directions 00..15) x 4 columns (frames 00..03)
    preview_w = 4 * CELL
    preview_h = DIRECTIONS * CELL
    preview_sheet = Image.new("RGBA", (preview_w, preview_h), (18, 20, 24, 255))

    frames_json = {}
    attack_anim_seq = []

    print(f"Generating Necromancer 16-direction attack animation (64 frames)...")

    for d in range(DIRECTIONS):
        facing_angle = d * (2.0 * math.pi / 16.0)

        for f in range(4):
            fname = f"necromancer/attack/{d:02d}/{f:02d}"
            attack_anim_seq.append(fname)

            col_arr, msk_arr = render_necromancer_attack_frame(facing_angle, f)

            c_img = Image.fromarray(col_arr, "RGBA")
            m_img = Image.fromarray(msk_arr, "RGBA")

            x = f * CELL
            y = d * CELL

            color_atlas.paste(c_img, (x, y))
            mask_atlas.paste(m_img, (x, y))

            preview_sheet.paste(c_img, (x, y), c_img)

            frames_json[fname] = {
                "frame": {"x": x, "y": y, "w": CELL, "h": CELL},
                "sourceSize": {"w": CELL, "h": CELL},
                "spriteSourceSize": {"x": 0, "y": 0, "w": CELL, "h": CELL},
                "rotated": False,
                "trimmed": False,
                "anchor": {"x": 0.5, "y": 0.85},
            }

    sheet_json = {
        "frames": frames_json,
        "animations": {
            "attack": attack_anim_seq,
        },
        "meta": {
            "image": "necromancer.png",
            "format": "RGBA8888",
            "size": {"w": ATLAS_SIZE, "h": ATLAS_SIZE},
            "scale": "1",
            "thornvael": {
                "contract": 1,
                "unit": "necromancer",
                "directions": DIRECTIONS,
                "cell": [CELL, CELL],
                "anims": {"attack": 4},
                "mask": "necromancer-mask.png",
            },
        },
    }

    png_path = os.path.join(out_sprites_dir, "necromancer.png")
    mask_path = os.path.join(out_sprites_dir, "necromancer-mask.png")
    json_path = os.path.join(out_sprites_dir, "necromancer.json")
    preview_path = os.path.join(out_sprites_dir, "_necromancer-sheet-preview.png")

    color_atlas.save(png_path, "PNG", optimize=True)
    mask_atlas.save(mask_path, "PNG", optimize=True)
    preview_sheet.save(preview_path, "PNG", optimize=True)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(sheet_json, f, separators=(",", ":"))

    print(f"Generated:")
    print(f"  - {png_path} ({os.path.getsize(png_path)} bytes)")
    print(f"  - {mask_path} ({os.path.getsize(mask_path)} bytes)")
    print(f"  - {json_path} ({len(frames_json)} frames, {os.path.getsize(json_path)} bytes)")
    print(f"  - {preview_path} ({os.path.getsize(preview_path)} bytes)")

    # Update assets.json
    assets_path = "game/assets.json" if os.path.exists("game/assets.json") else "assets.json"
    with open(assets_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    note = "Original necromancer attack sprite atlas; 96px, 16 directions, attack4, RGB masks."
    for ext in (".png", "-mask.png", ".json"):
        entry_path = f"public/sprites/necromancer{ext}"
        new_entry = {
            "path": entry_path,
            "license": "own",
            "source": "tools/gen-necromancer-sprites.py",
            "note": note,
        }
        for idx, item in enumerate(manifest["assets"]):
            if item["path"] == entry_path:
                manifest["assets"][idx] = new_entry
                break
        else:
            manifest["assets"].append(new_entry)

    with open(assets_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"Updated {assets_path} with necromancer entries.")


if __name__ == "__main__":
    build_necromancer_attack_atlas()
