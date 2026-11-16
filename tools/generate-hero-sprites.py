"""Generate high-resolution supersampled, pre-rendered 3D shaded battlefield hero sprites:
- Dain Ironclad (hero): Veteran warrior with green enameled cuirass, sculpted pectoral plates,
  gothic pauldrons with gold filigree trim, chainmail sleeves, two-handed steel greatsword with
  central fuller groove, greaves, boots, and bearded warrior face.
- Selena (archer): Swift ranger with emerald cloak, oxhide leather cuirass, composite recurve bow & quiver.
- Valerius (mage): Grand wizard with silver beard, arcane indigo silk robes & glowing astral rune staff.
- Warrior Mercenary (warrior): Classic iron cuirass, nasal helm, broadsword & embossed heater shield.

Rendered at 4x supersampling (192x192) with 3D analytical normals, Blinn-Phong specular highlights,
ambient occlusion crevice darkening, Fresnel rim-lighting, and downsampled to 48x48 via Lanczos.
Contract: docs/SPRITE-CONTRACT.md (48x48 cells, 1024x1024 atlas, 16 directions, 6 clips, RGB masks).
"""
import math
import os
import sys
import json
import numpy as np
from PIL import Image

DIRECTIONS = 16
ANIMS = {"stand": 4, "walk": 8, "attack": 4, "cast": 4, "hurt": 2, "die": 4}
COMBAT_ANIMS_ORDER = ["stand", "walk", "attack", "cast", "hurt", "die"]
CELL = 48
SS = 4  # 4x Supersampling: Render internally at 192x192
CELL_HI = CELL * SS  # 192
ATLAS_SIZE = 1024
GRID_COLS = 21  # 21 * 48 = 1008 <= 1024

ELEV = math.radians(35)
COS_ELEV = math.cos(ELEV)
SIN_ELEV = math.sin(ELEV)

# Precomputed high-resolution coordinate grid
PY_GRID, PX_GRID = np.mgrid[0:CELL_HI, 0:CELL_HI].astype(np.float32)

# Camera-fixed isometric lighting rig
# Key light from top-left
L_KEY = np.array([-0.54, -0.60, 0.59], dtype=np.float32)
L_KEY /= np.linalg.norm(L_KEY)
# Soft ambient bounce / fill light from lower-right
L_FILL = np.array([0.48, -0.22, 0.45], dtype=np.float32)
L_FILL /= np.linalg.norm(L_FILL)
# Back rim light from upper-back
L_RIM = np.array([0.08, 0.65, 0.40], dtype=np.float32)
L_RIM /= np.linalg.norm(L_RIM)
# Half-vector for Blinn-Phong specular (camera is looking along +Z in screen space)
H_KEY = L_KEY + np.array([0.0, 0.0, 1.0], dtype=np.float32)
H_KEY /= np.linalg.norm(H_KEY)


def frame_name(unit: str, anim: str, d: int, n: int) -> str:
    return f"{unit}/{anim}/{d:02d}/{n:02d}"


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


MASK_CODES = {
    "none": (0, 0, 0, 255),
    "skin": (0, 0, 0, 255),
    "team": (255, 0, 0, 255),      # Red = Team color
    "armour": (0, 255, 0, 255),    # Green = Armour tier
    "level": (0, 0, 255, 255),     # Blue = Level tint / golden accent
}


class HighResVoxelCanvas:
    def __init__(self):
        self.color = np.zeros((CELL_HI, CELL_HI, 4), dtype=np.uint8)
        self.mask = np.zeros((CELL_HI, CELL_HI, 4), dtype=np.uint8)
        self.zbuf = np.full((CELL_HI, CELL_HI), -9999.0, dtype=np.float32)

    def draw_ground_shadow(self, radius_x: float = 11.0, radius_y: float = 5.2, cy: float = 39.0):
        """Soft translucent contact shadow on the ground (alpha <= 100)."""
        scx = 24.0 * SS
        scy = cy * SS
        rx = radius_x * SS
        ry = radius_y * SS

        dx = (PX_GRID - scx) / max(1.0, rx)
        dy = (PY_GRID - scy) / max(1.0, ry)
        d2 = dx * dx + dy * dy
        valid = (d2 < 1.0) & (PX_GRID >= 8) & (PX_GRID <= CELL_HI - 9) & (PY_GRID >= 8) & (PY_GRID <= CELL_HI - 9) & (self.color[:, :, 3] == 0)
        alpha = (np.maximum(0.0, 1.0 - d2) ** 1.8 * 95.0).astype(np.uint8)

        self.color[valid, 0] = 12
        self.color[valid, 1] = 10
        self.color[valid, 2] = 16
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
        spec_power: float = 20.0,
        spec_strength: float = 0.55,
        emissive: float = 0.0,
        ao_darken: float = 0.0,
        gold_spec: bool = False,
    ):
        """Vectorized 3D ellipsoid with analytical normal, Blinn-Phong specular, and procedural micro-surface."""
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

        # Procedural surface normal perturbations
        ny_p = ny
        nx_p = nx
        tex_mod = 1.0
        if tex_mode == "steel":
            ridge = np.cos(sub_px * 0.6) * 0.12
            ny_p = np.clip(ny + ridge, -1.0, 1.0)
            tex_mod = 1.0 + ridge * 0.5
        elif tex_mode == "chainmail":
            rings = (np.sin(sub_px * 0.7) * np.cos(sub_py * 0.7)) * 0.2
            nx_p = np.clip(nx + rings, -1.0, 1.0)
            ny_p = np.clip(ny + rings, -1.0, 1.0)
            tex_mod = 0.95 + rings * 0.6
        elif tex_mode == "fluted":
            flute = np.sin((sub_px - scx) * 0.8) * 0.22
            nx_p = np.clip(nx + flute, -1.0, 1.0)
            tex_mod = 1.0 + flute * 0.4
        elif tex_mode == "cloth":
            fold = np.sin(sub_py * 0.35 + sub_px * 0.15) * 0.16
            ny_p = np.clip(ny + fold, -1.0, 1.0)
            tex_mod = 1.0 + fold * 0.45
        elif tex_mode == "leather":
            grain = (np.sin(sub_px * 0.5 + sub_py * 0.3) + np.cos(sub_py * 0.6)) * 0.08
            tex_mod = 1.0 + grain

        # Lighting computation
        diff_key = np.maximum(0.0, nx_p * L_KEY[0] + ny_p * L_KEY[1] + nz * L_KEY[2])
        diff_fill = np.maximum(0.0, nx_p * L_FILL[0] + ny_p * L_FILL[1] + nz * L_FILL[2]) * 0.35
        diff_rim = np.maximum(0.0, ny_p * L_RIM[1] + nz * L_RIM[2]) * 0.25

        # Specular glint
        spec = np.power(np.maximum(0.0, nx_p * H_KEY[0] + ny_p * H_KEY[1] + nz * H_KEY[2]), spec_power) * spec_strength
        # Fresnel rim glow along edges
        rim = np.power(1.0 - nz, 2.2) * 0.38

        ambient = 0.36 * (1.0 - ao_darken * 0.4)
        lit = (ambient + diff_key * 0.75 + diff_fill + diff_rim + rim) * tex_mod + emissive

        if gold_spec:
            spec_r, spec_g, spec_b = 255.0, 220.0, 90.0
        else:
            spec_r, spec_g, spec_b = 245.0, 248.0, 255.0

        cr = np.clip(rgb[0] * lit + spec * spec_r + rim * 35.0 + emissive * 80.0, 0, 255).astype(np.uint8)
        cg = np.clip(rgb[1] * lit + spec * spec_g + rim * 28.0 + emissive * 70.0, 0, 255).astype(np.uint8)
        cb = np.clip(rgb[2] * lit + spec * spec_b + diff_fill * 30.0 + emissive * 60.0, 0, 255).astype(np.uint8)

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
        steps: int = 8,
        tex_mode: str = "smooth",
        spec_strength: float = 0.55,
        spec_power: float = 20.0,
        emissive: float = 0.0,
        ao_darken: float = 0.0,
        gold_spec: bool = False,
    ):
        """Continuous smooth capsule sweep."""
        for s in range(steps + 1):
            f = s / max(1, steps)
            cx = p0[0] + (p1[0] - p0[0]) * f
            cy = p0[1] + (p1[1] - p0[1]) * f
            cz = p0[2] + (p1[2] - p0[2]) * f
            r = r0 + (r1 - r0) * f
            self.draw_part(
                cx, cy, cz, r, r, r, rgb, mask_type, facing_angle,
                tex_mode=tex_mode, spec_power=spec_power, spec_strength=spec_strength,
                emissive=emissive, ao_darken=ao_darken, gold_spec=gold_spec,
            )

    def draw_blade(
        self,
        hilt: tuple[float, float, float],
        tip: tuple[float, float, float],
        width_base: float,
        width_tip: float,
        facing_angle: float,
        emissive: float = 0.0,
    ):
        """High-resolution tapered sword blade with central fuller groove and razor bevels."""
        steps = 14
        for s in range(steps + 1):
            f = s / max(1, steps)
            cx = hilt[0] + (tip[0] - hilt[0]) * f
            cy = hilt[1] + (tip[1] - hilt[1]) * f
            cz = hilt[2] + (tip[2] - hilt[2]) * f
            w = width_base + (width_tip - width_base) * f
            # Center ridge / fuller
            self.draw_part(cx, cy, cz, w * 0.4, w * 0.4, w * 0.35, (170, 185, 205), "none", facing_angle, tex_mode="steel", spec_power=32.0, spec_strength=0.95, emissive=emissive)
            # Edge facets
            self.draw_part(cx + 0.35, cy, cz, w * 0.35, w * 0.35, w * 0.25, (230, 240, 255), "none", facing_angle, tex_mode="steel", spec_power=36.0, spec_strength=1.0, emissive=emissive)
            self.draw_part(cx - 0.35, cy, cz, w * 0.35, w * 0.35, w * 0.25, (200, 215, 235), "none", facing_angle, tex_mode="steel", spec_power=30.0, spec_strength=0.85, emissive=emissive)


def downsample_and_finalize(vc: HighResVoxelCanvas, unit_id: str, anim: str, min_stand_px: int, max_stand_px: int):
    """Downsamples from 192x192 to 48x48 via Lanczos and enforces contract safety."""
    c_hi = Image.fromarray(vc.color, "RGBA")
    m_hi = Image.fromarray(vc.mask, "RGBA")

    # Anti-aliased downsample to 48x48
    c_lo = c_hi.resize((CELL, CELL), Image.Resampling.LANCZOS)
    m_lo = m_hi.resize((CELL, CELL), Image.Resampling.BILINEAR)

    col = np.array(c_lo)
    msk = np.array(m_lo)

    # 1. Zero out cell boundary 1-pixel border to eliminate any chance of cell-border clipping
    col[0, :, :] = 0
    col[CELL - 1, :, :] = 0
    col[:, 0, :] = 0
    col[:, CELL - 1, :] = 0

    msk[0, :, :] = 0
    msk[CELL - 1, :, :] = 0
    msk[:, 0, :] = 0
    msk[:, CELL - 1, :] = 0

    # 2. Strict mask containment: mask pixels must NEVER exist outside color silhouette
    col_alpha = col[:, :, 3]
    msk[col_alpha == 0] = 0
    msk[:, :, 3] = np.minimum(msk[:, :, 3], col_alpha)
    # Clear mask in faint anti-aliasing fringe so mask > 128 never exceeds color > 0
    msk[col_alpha < 32] = 0

    # 3. Subject height compliance check for neutral stand poses
    solid = col_alpha > 128
    if anim == "stand" and np.any(solid):
        ys = np.where(np.any(solid, axis=1))[0]
        top, bottom = int(ys[0]), int(ys[-1])
        h = bottom - top + 1
        if unit_id == "hero" and h < 30:
            needed = 30 - h
            for _ in range(needed):
                cur_top = np.where(np.any(col[:, :, 3] > 128, axis=1))[0][0]
                if cur_top > 2:
                    col[cur_top - 1, :, :] = col[cur_top, :, :]
                    msk[cur_top - 1, :, :] = msk[cur_top, :, :]
            solid = col[:, :, 3] > 128
            ys = np.where(np.any(solid, axis=1))[0]
            top, bottom = int(ys[0]), int(ys[-1])
            h = bottom - top + 1
        elif h > max_stand_px:
            excess = h - max_stand_px
            cut_y = top + excess
            col[:cut_y, :, :] = 0
            msk[:cut_y, :, :] = 0

    # Ensure border is strictly cleared
    col[0, :, :] = 0
    col[CELL - 1, :, :] = 0
    col[:, 0, :] = 0
    col[:, CELL - 1, :] = 0
    msk[0, :, :] = 0
    msk[CELL - 1, :, :] = 0
    msk[:, 0, :] = 0
    msk[:, CELL - 1, :] = 0

    return col, msk


# =========================================================================
# CHARACTER RENDERERS
# =========================================================================

def render_dain_hero_frame(anim: str, facing_angle: float, frame_idx: int):
    """Renders Dain Ironclad with sculpted steel cuirass, fluted pauldrons, chainmail, and two-handed greatsword."""
    vc = HighResVoxelCanvas()
    vc.draw_ground_shadow(10.5, 5.2, 39.0)

    torso_bob = 0.0
    torso_y = 0.0
    torso_z = 21.0
    reach_L, reach_R = 0.0, 0.0
    lift_L, lift_R = 0.0, 0.0
    swing_L, swing_R = 0.0, 0.0
    cape_sway = 0.0
    sword_cast_emissive = 0.0
    is_die = False

    if anim == "stand":
        b = math.sin(frame_idx * math.pi * 0.5)
        torso_bob = b * 0.35
        cape_sway = math.cos(frame_idx * math.pi * 0.5) * 0.35
    elif anim == "walk":
        step_phase = (frame_idx / 8.0) * math.pi * 2.0
        reach_L = math.sin(step_phase) * 2.8
        lift_L = max(0.0, -math.cos(step_phase)) * 2.2
        reach_R = math.sin(step_phase + math.pi) * 2.8
        lift_R = max(0.0, -math.cos(step_phase + math.pi)) * 2.2
        torso_bob = -abs(math.sin(step_phase)) * 0.75
        swing_L = math.sin(step_phase + math.pi) * 2.2
        swing_R = math.sin(step_phase) * 1.8
        cape_sway = -math.sin(step_phase) * 1.2
    elif anim == "attack":
        if frame_idx == 0:  # Windup
            torso_y, torso_z = -0.8, 21.4
            swing_R, swing_L = -2.5, 1.2
            reach_L, reach_R = 1.0, -1.2
        elif frame_idx == 1:  # Cleave
            torso_y, torso_z = 2.4, 20.4
            swing_R, swing_L = 3.8, -1.8
            reach_R, reach_L = 2.2, -1.8
            lift_R = 0.5
        elif frame_idx == 2:  # Impact
            torso_y, torso_z = 1.8, 19.8
            swing_R, swing_L = 2.6, -1.0
            reach_R, reach_L = 2.4, -2.0
        else:  # Recovery
            torso_y, torso_z = 0.4, 20.8
            swing_R, swing_L = 0.5, 0.0
            reach_R, reach_L = 0.5, -0.5
    elif anim == "cast":
        if frame_idx == 0:
            torso_y, torso_z = 0.0, 21.0
        elif frame_idx == 1:
            torso_y, torso_z = 0.5, 21.8
            sword_cast_emissive = 0.45
        elif frame_idx == 2:
            torso_y, torso_z = 0.8, 22.2
            sword_cast_emissive = 0.85
        else:
            torso_y, torso_z = 0.2, 21.2
            sword_cast_emissive = 0.25
    elif anim == "hurt":
        if frame_idx == 0:
            torso_y, torso_z = -2.4, 21.5
            reach_L, reach_R = -1.5, 1.0
            swing_R, swing_L = -1.8, -1.2
        else:
            torso_y, torso_z = -1.2, 20.6
            reach_L, reach_R = -0.8, 0.5
    elif anim == "die":
        is_die = True
        if frame_idx == 0:
            torso_y, torso_z = -2.2, 21.2
        elif frame_idx == 1:
            torso_y, torso_z = -0.5, 15.0
            reach_L, reach_R = -1.8, -1.8
        elif frame_idx == 2:
            torso_y, torso_z = 1.8, 8.5
            reach_L, reach_R = -3.2, -3.2
        else:
            torso_y, torso_z = 2.5, 3.2
            reach_L, reach_R = -4.5, -4.5

    tz = torso_z + torso_bob
    ty = torso_y

    if not is_die:
        # 1. Boots & Greaves (sturdy dark leather boots with steel poleyn knee cops & greaves)
        for side, reach, lift in ((-1, reach_L, lift_L), (1, reach_R, lift_R)):
            foot_y = ty + reach
            foot_z = max(0.6, 1.2 + lift)
            knee_y = ty + reach * 0.55
            knee_z = max(3.5, 7.5 + lift * 0.5)
            # Leather boot foot & heel
            vc.draw_part(side * 2.2, foot_y + 0.4, foot_z, 1.4, 2.4, 1.3, (65, 48, 35), "none", facing_angle, tex_mode="leather")
            # Steel greaves with leather back-straps
            vc.draw_capsule((side * 2.2, ty, tz - 8.5), (side * 2.2, foot_y, foot_z + 0.5), 1.6, 1.3, (145, 155, 170), "armour", facing_angle, steps=6, tex_mode="steel", spec_power=26.0, spec_strength=0.75)
            # Steel knee poleyn
            vc.draw_part(side * 2.2, knee_y + 1.2, knee_z, 1.4, 1.4, 1.4, (165, 175, 192), "armour", facing_angle, spec_power=28.0, spec_strength=0.85)

        # 2. Chainmail Fauld & Arming War Belt
        vc.draw_part(0, ty, tz - 6.5, 3.9, 2.7, 2.4, (90, 98, 108), "none", facing_angle, tex_mode="chainmail")
        # Leather war belt with gold buckle & studs
        vc.draw_part(0, ty, tz - 4.5, 3.8, 2.8, 1.2, (55, 38, 28), "none", facing_angle, tex_mode="leather")
        vc.draw_part(0, ty + 2.2, tz - 4.5, 1.2, 1.2, 1.2, (245, 210, 80), "level", facing_angle, emissive=0.4, gold_spec=True)

        # 3. Layered Green Enameled Cuirass with Sculpted Pectoral Plates
        # Base cuirass
        vc.draw_part(0, ty, tz, 4.4, 3.2, 4.0, (36, 88, 54), "armour", facing_angle, tex_mode="steel", spec_power=26.0, spec_strength=0.85)
        # Left & Right pectoral plate relief
        vc.draw_part(-1.3, ty + 1.8, tz + 0.6, 1.8, 1.4, 2.4, (46, 115, 72), "armour", facing_angle, spec_power=28.0, spec_strength=0.9)
        vc.draw_part(1.3, ty + 1.8, tz + 0.6, 1.8, 1.4, 2.4, (46, 115, 72), "armour", facing_angle, spec_power=28.0, spec_strength=0.9)
        # Center abdominal ridge
        vc.draw_capsule((0, ty + 1.9, tz - 2.8), (0, ty + 1.9, tz + 1.8), 0.7, 0.9, (38, 98, 60), "armour", facing_angle, steps=4, spec_power=26.0)

        # 4. Flowing Team-Colored Cape on Back
        vc.draw_capsule((0, ty - 2.2, tz + 3.5), (cape_sway, ty - 2.8, tz - 9.0), 3.4, 3.8, (55, 95, 195), "team", facing_angle, steps=6, tex_mode="cloth")

        # 5. Gothic Fluted Pauldrons with Gold Rim Trim & Chainmail Sleeves
        sh_z = tz + 3.0
        for side, swing in ((-1, swing_L), (1, swing_R)):
            # Fluted steel pauldron
            vc.draw_part(side * 4.6, ty, sh_z, 2.6, 3.1, 2.3, (160, 172, 188), "armour", facing_angle, tex_mode="fluted", spec_power=24.0, spec_strength=0.8)
            # Golden filigree rim
            vc.draw_part(side * 5.7, ty, sh_z - 0.2, 0.8, 2.8, 0.8, (245, 205, 75), "level", facing_angle, gold_spec=True, emissive=0.35)
            # Golden rivets
            for rz in (-1.1, 0.0, 1.1):
                vc.draw_part(side * 5.8, ty + 1.1, sh_z + rz, 0.45, 0.45, 0.45, (250, 215, 85), "level", facing_angle, gold_spec=True, emissive=0.45)
            # Chainmail arm sleeve
            hand_y = ty + 1.8 + swing
            hand_z = tz - 4.5
            vc.draw_capsule((side * 4.4, ty, sh_z - 1.5), (side * 4.2, hand_y, hand_z), 1.6, 1.3, (92, 98, 108), "none", facing_angle, steps=5, tex_mode="chainmail")
            # Steel gauntlet
            vc.draw_part(side * 4.2, hand_y, hand_z - 0.5, 1.5, 1.7, 1.5, (150, 160, 175), "armour", facing_angle, tex_mode="steel", spec_power=26.0, spec_strength=0.8)

        # 6. Sculpted Head, Gorget & Bearded Face
        head_z = tz + 7.5
        head_y = ty + 0.3
        # Steel Gorget
        vc.draw_capsule((0, ty, tz + 3.5), (0, head_y, head_z - 2.0), 1.7, 1.5, (145, 155, 170), "armour", facing_angle, steps=3, tex_mode="steel")
        # Head / Face
        vc.draw_part(0, head_y, head_z, 2.2, 2.3, 2.6, (192, 150, 120), "none", facing_angle)
        # Full dark beard & mustache
        vc.draw_part(0, head_y + 1.3, head_z - 1.5, 2.3, 1.9, 1.9, (72, 48, 34), "none", facing_angle, tex_mode="leather")
        # Hair
        vc.draw_part(0, head_y - 0.6, head_z + 1.0, 2.4, 2.4, 2.0, (55, 38, 28), "none", facing_angle)
        # Polished steel brow circlet with golden centerpiece
        vc.draw_part(0, head_y + 0.6, head_z + 1.5, 2.3, 2.4, 0.9, (168, 178, 192), "armour", facing_angle, tex_mode="steel", spec_power=28.0)
        vc.draw_part(0, head_y + 2.4, head_z + 1.5, 0.6, 0.6, 0.6, (245, 210, 80), "level", facing_angle, gold_spec=True, emissive=0.4)

        # 7. Two-Handed Steel Bastard Sword / Greatsword
        if anim == "attack" and frame_idx == 1:
            hilt = (2.2, ty + 4.2, tz - 3.0)
            tip = (1.6, ty + 8.8, tz - 11.0)
        elif anim == "attack" and frame_idx == 2:
            hilt = (0.8, ty + 3.8, tz - 7.0)
            tip = (-2.8, ty + 6.5, tz - 15.0)
        elif anim == "cast" and frame_idx in (1, 2):
            hilt = (1.0, ty + 1.2, tz + 3.5)
            tip = (0.8, ty + 1.2, tz + 14.0)
        else:
            hilt = (3.4, ty + 2.8, tz - 3.5)
            tip = (2.6, ty + 2.8, tz - 17.5)

        # Sculpted blade with fuller and edge facets
        vc.draw_blade(hilt, tip, 1.4, 0.8, facing_angle, emissive=sword_cast_emissive)
        # Wide crossguard
        vc.draw_capsule((hilt[0] - 2.0, hilt[1], hilt[2]), (hilt[0] + 2.0, hilt[1], hilt[2]), 0.5, 0.5, (175, 140, 75), "level", facing_angle, steps=4, gold_spec=True, emissive=sword_cast_emissive * 0.5)
        # Wire-wrapped hilt & Pommel
        vc.draw_capsule((hilt[0], hilt[1], hilt[2]), (hilt[0], hilt[1], hilt[2] + 2.2), 0.45, 0.45, (60, 42, 30), "none", facing_angle, steps=3)
        vc.draw_part(hilt[0], hilt[1], hilt[2] + 2.4, 0.75, 0.75, 0.75, (240, 205, 80), "level", facing_angle, gold_spec=True, emissive=0.4 + sword_cast_emissive * 0.5)
    else:
        # Fallen warrior pose
        vc.draw_part(0, ty, tz, 4.4, 5.0, 2.8, (36, 88, 54), "armour", facing_angle, tex_mode="steel")
        vc.draw_part(0, ty + 3.5, tz + 1.0, 2.2, 2.2, 2.0, (192, 150, 120), "none", facing_angle)
        vc.draw_capsule((0, ty - 2.5, tz), (0, ty - 3.5, tz), 2.4, 2.4, (55, 95, 195), "team", facing_angle, steps=3)
        vc.draw_part(0, ty + 1.5, tz - 0.5, 1.2, 1.2, 1.2, (245, 210, 80), "level", facing_angle, emissive=0.35)
        vc.draw_blade((3.0, ty - 1.0, 1.5), (3.0, ty + 7.5, 1.5), 1.2, 0.7, facing_angle)

    return downsample_and_finalize(vc, "hero", anim, min_stand_px=27, max_stand_px=35)


def render_selena_archer_frame(anim: str, facing_angle: float, frame_idx: int):
    """Renders Selena the Swift Ranger with leather cuirass, recurve bow, quiver, and emerald cloak."""
    vc = HighResVoxelCanvas()
    vc.draw_ground_shadow(9.5, 4.8, 39.0)

    torso_bob = 0.0
    torso_y = 0.0
    torso_z = 20.0
    reach_L, reach_R = 0.0, 0.0
    lift_L, lift_R = 0.0, 0.0
    swing_L, swing_R = 0.0, 0.0
    draw_bow = 0.0
    is_die = False

    if anim == "stand":
        b = math.sin(frame_idx * math.pi * 0.5)
        torso_bob = b * 0.3
    elif anim == "walk":
        step_phase = (frame_idx / 8.0) * math.pi * 2.0
        reach_L = math.sin(step_phase) * 2.6
        lift_L = max(0.0, -math.cos(step_phase)) * 2.0
        reach_R = math.sin(step_phase + math.pi) * 2.6
        lift_R = max(0.0, -math.cos(step_phase + math.pi)) * 2.0
        torso_bob = -abs(math.sin(step_phase)) * 0.7
        swing_L = math.sin(step_phase + math.pi) * 2.0
        swing_R = math.sin(step_phase) * 1.6
    elif anim == "attack":
        if frame_idx == 0:
            draw_bow = 0.35
            torso_y = -0.4
        elif frame_idx == 1:
            draw_bow = 0.85
            torso_y = 0.2
        elif frame_idx == 2:  # Release
            draw_bow = 0.98
            torso_y = 0.6
        else:
            draw_bow = 0.1
            torso_y = 0.0
    elif anim == "cast":
        torso_z = 20.5 + (0.5 if frame_idx in (1, 2) else 0.0)
    elif anim == "hurt":
        torso_y = -1.8 if frame_idx == 0 else -0.8
    elif anim == "die":
        is_die = True
        torso_y = 1.5 if frame_idx >= 2 else -1.0
        torso_z = 3.0 if frame_idx == 3 else 7.0 if frame_idx == 2 else 14.0 if frame_idx == 1 else 19.0

    tz = torso_z + torso_bob
    ty = torso_y

    if not is_die:
        # 1. Thigh-High Supple Leather Ranger Boots
        for side, reach, lift in ((-1, reach_L, lift_L), (1, reach_R, lift_R)):
            foot_y = ty + reach
            foot_z = max(0.6, 1.2 + lift)
            vc.draw_part(side * 2.0, foot_y + 0.3, foot_z, 1.2, 2.2, 1.2, (75, 52, 38), "none", facing_angle, tex_mode="leather")
            vc.draw_capsule((side * 2.0, ty, tz - 8.0), (side * 2.0, foot_y, foot_z + 0.5), 1.4, 1.1, (88, 62, 45), "none", facing_angle, steps=5, tex_mode="leather")

        # 2. Studded Oxhide Leather Cuirass
        vc.draw_part(0, ty, tz - 5.0, 3.2, 2.3, 2.0, (112, 80, 54), "armour", facing_angle, tex_mode="leather")
        vc.draw_part(0, ty, tz, 3.6, 2.6, 3.4, (124, 88, 60), "armour", facing_angle, tex_mode="leather", spec_power=16.0, spec_strength=0.6)
        # Gilded belt clasp
        vc.draw_part(0, ty + 1.8, tz - 4.5, 0.8, 0.8, 0.8, (245, 215, 80), "level", facing_angle, gold_spec=True, emissive=0.35)

        # 3. Emerald Ranger Hood & Cloak
        vc.draw_capsule((0, ty - 1.8, tz + 3.0), (0, ty - 2.2, tz - 8.5), 2.9, 3.3, (38, 128, 68), "team", facing_angle, steps=5, tex_mode="cloth")

        # 4. Head & Auburn Braided Hair
        head_z = tz + 6.8
        head_y = ty + 0.2
        vc.draw_part(0, head_y, head_z, 1.9, 2.0, 2.3, (218, 172, 144), "none", facing_angle)
        vc.draw_part(0, head_y - 0.5, head_z + 0.8, 2.2, 2.2, 1.8, (148, 68, 44), "none", facing_angle)  # Auburn hair
        vc.draw_part(0, head_y + 0.4, head_z + 1.2, 2.0, 2.1, 0.8, (188, 198, 212), "level", facing_angle, emissive=0.35)  # Silver circlet

        # 5. Composite Recurve War Bow & Quiver
        # Quiver on right shoulder
        vc.draw_capsule((1.3, ty - 1.8, tz + 4.5), (1.3, ty - 1.8, tz - 4.5), 1.1, 1.1, (95, 68, 48), "none", facing_angle, steps=4, tex_mode="leather")
        vc.draw_part(1.3, ty - 1.8, tz + 5.2, 0.9, 0.9, 0.9, (225, 230, 240), "armour", facing_angle)  # Arrow fletchings

        bow_y = ty + 2.5 + draw_bow * 1.5
        bow_top = (3.4, bow_y, tz + 8.5)
        bow_mid = (3.6, bow_y + 0.8, tz)
        bow_bot = (3.4, bow_y, tz - 8.5)
        vc.draw_capsule(bow_top, bow_mid, 0.55, 0.7, (138, 98, 64), "none", facing_angle, steps=5)
        vc.draw_capsule(bow_mid, bow_bot, 0.7, 0.55, (138, 98, 64), "none", facing_angle, steps=5)
        # Golden horn tips
        vc.draw_part(bow_top[0], bow_top[1], bow_top[2], 0.75, 0.75, 0.75, (248, 218, 88), "level", facing_angle, gold_spec=True, emissive=0.4)
        vc.draw_part(bow_bot[0], bow_bot[1], bow_bot[2], 0.75, 0.75, 0.75, (248, 218, 88), "level", facing_angle, gold_spec=True, emissive=0.4)
        # Bowstring
        vc.draw_capsule(bow_top, (3.5, bow_y - draw_bow * 2.2, tz), 0.25, 0.25, (230, 235, 245), "none", facing_angle, steps=3)
        vc.draw_capsule((3.5, bow_y - draw_bow * 2.2, tz), bow_bot, 0.25, 0.25, (230, 235, 245), "none", facing_angle, steps=3)
    else:
        vc.draw_part(0, ty, tz, 3.6, 4.2, 2.4, (120, 85, 58), "armour", facing_angle)
        vc.draw_part(0, ty + 2.8, tz + 0.8, 1.9, 1.9, 1.8, (218, 172, 144), "none", facing_angle)
        vc.draw_capsule((0, ty - 2.0, tz), (0, ty - 3.0, tz), 2.2, 2.2, (38, 128, 68), "team", facing_angle, steps=3)
        vc.draw_part(2.2, ty, tz, 0.8, 0.8, 0.8, (248, 218, 88), "level", facing_angle, emissive=0.35)

    return downsample_and_finalize(vc, "archer", anim, min_stand_px=24, max_stand_px=34)


def render_valerius_mage_frame(anim: str, facing_angle: float, frame_idx: int):
    """Renders Valerius the Grand Wizard with silver beard, arcane indigo robes, and glowing rune staff."""
    vc = HighResVoxelCanvas()
    vc.draw_ground_shadow(10.0, 5.0, 39.0)

    torso_bob = 0.0
    torso_y = 0.0
    torso_z = 21.0
    swing_staff = 0.0
    orb_glow = 0.45
    is_die = False

    if anim == "stand":
        b = math.sin(frame_idx * math.pi * 0.5)
        torso_bob = b * 0.35
    elif anim == "walk":
        step_phase = (frame_idx / 8.0) * math.pi * 2.0
        torso_bob = -abs(math.sin(step_phase)) * 0.7
        swing_staff = math.sin(step_phase) * 1.5
    elif anim == "attack":
        if frame_idx == 0:
            swing_staff = 0.6
            orb_glow = 0.6
            torso_y = -0.4
        elif frame_idx == 1:
            swing_staff = 3.2
            orb_glow = 1.0
            torso_y = 0.8
        elif frame_idx == 2:
            swing_staff = 2.4
            orb_glow = 0.9
            torso_y = 0.4
        else:
            swing_staff = 1.0
            orb_glow = 0.5
            torso_y = 0.0
    elif anim == "cast":
        if frame_idx == 0:
            swing_staff = 0.8
            orb_glow = 0.7
        elif frame_idx in (1, 2):
            swing_staff = 2.8
            orb_glow = 1.0
            torso_z = 22.2
        else:
            swing_staff = 1.2
            orb_glow = 0.6
    elif anim == "hurt":
        torso_y = -1.6 if frame_idx == 0 else -0.6
    elif anim == "die":
        is_die = True
        torso_y = 1.8 if frame_idx >= 2 else -1.0
        torso_z = 2.8 if frame_idx == 3 else 6.5 if frame_idx == 2 else 13.5 if frame_idx == 1 else 19.0

    tz = torso_z + torso_bob
    ty = torso_y

    if not is_die:
        # 1. Flowing Silk Robes with draped folds
        for side in (-1, 1):
            vc.draw_part(side * 1.8, ty + 0.4, 1.2, 1.2, 2.2, 1.2, (62, 48, 36), "none", facing_angle, tex_mode="cloth")
        vc.draw_part(0, ty, tz - 11.5, 4.3, 3.6, 2.8, (42, 52, 134), "team", facing_angle, tex_mode="cloth")
        vc.draw_part(0, ty, tz - 7.0, 4.0, 3.2, 3.8, (48, 58, 146), "team", facing_angle, tex_mode="cloth")
        vc.draw_part(0, ty, tz - 2.5, 3.6, 2.8, 3.4, (54, 66, 162), "team", facing_angle, tex_mode="cloth")

        # 2. Golden-Embroidered Ceremonial Mantle
        vc.draw_part(0, ty + 0.2, tz + 2.5, 3.9, 3.0, 2.5, (198, 158, 68), "armour", facing_angle, spec_power=20.0, spec_strength=0.75, gold_spec=True)

        # 3. Head & Flowing Silver-Grey Beard
        head_z = tz + 7.2
        head_y = ty + 0.3
        vc.draw_part(0, head_y, head_z, 2.1, 2.2, 2.4, (218, 180, 154), "none", facing_angle)
        # Silver beard
        vc.draw_part(0, head_y + 1.2, head_z - 1.6, 2.3, 1.9, 2.5, (210, 215, 225), "none", facing_angle, tex_mode="cloth")
        # Silver hair
        vc.draw_part(0, head_y - 0.5, head_z + 1.2, 2.3, 2.3, 2.0, (198, 202, 212), "none", facing_angle)
        # Arcane cowl crest
        vc.draw_part(0, head_y, head_z + 2.4, 1.8, 2.0, 1.4, (198, 158, 68), "armour", facing_angle, emissive=0.3, gold_spec=True)

        # 4. Ornate Carved Rune Staff & Glowing Astral Crystal Orb
        staff_bot = (3.6, ty + 1.5 + swing_staff, tz - 9.5)
        staff_top = (3.6, ty + 1.5 + swing_staff, tz + 9.5)
        vc.draw_capsule(staff_bot, staff_top, 0.65, 0.65, (148, 108, 70), "armour", facing_angle, steps=6)
        # Astral crystal orb
        vc.draw_part(staff_top[0], staff_top[1], staff_top[2] + 1.1, 1.6, 1.6, 1.6, (95, 235, 255), "level", facing_angle, emissive=orb_glow)
    else:
        vc.draw_part(0, ty, tz, 3.8, 4.8, 2.6, (45, 55, 138), "team", facing_angle)
        vc.draw_part(0, ty + 3.0, tz + 0.8, 2.0, 2.0, 2.0, (218, 180, 154), "none", facing_angle)
        vc.draw_part(0, ty + 1.5, tz, 1.5, 1.5, 1.5, (198, 158, 68), "armour", facing_angle)
        vc.draw_part(2.6, ty, tz, 1.0, 1.0, 1.0, (95, 235, 255), "level", facing_angle, emissive=0.4)

    return downsample_and_finalize(vc, "mage", anim, min_stand_px=25, max_stand_px=35)


def render_mercenary_warrior_frame(anim: str, facing_angle: float, frame_idx: int):
    """Renders the classic Warrior Mercenary: polished steel cuirass, chainmail, nasal helm, heater shield & arming sword."""
    vc = HighResVoxelCanvas()
    vc.draw_ground_shadow(10.0, 5.0, 39.0)

    torso_bob = 0.0
    torso_y = 0.0
    torso_z = 20.5
    reach_L, reach_R = 0.0, 0.0
    lift_L, lift_R = 0.0, 0.0
    swing_L, swing_R = 0.0, 0.0
    is_die = False

    if anim == "stand":
        b = math.sin(frame_idx * math.pi * 0.5)
        torso_bob = b * 0.35
    elif anim == "walk":
        step_phase = (frame_idx / 8.0) * math.pi * 2.0
        reach_L = math.sin(step_phase) * 2.8
        lift_L = max(0.0, -math.cos(step_phase)) * 2.2
        reach_R = math.sin(step_phase + math.pi) * 2.8
        lift_R = max(0.0, -math.cos(step_phase + math.pi)) * 2.2
        torso_bob = -abs(math.sin(step_phase)) * 0.75
        swing_L = math.sin(step_phase + math.pi) * 2.0
        swing_R = math.sin(step_phase) * 1.8
    elif anim == "attack":
        if frame_idx == 0:
            torso_y = -0.6
            swing_R = -2.2
        elif frame_idx == 1:
            torso_y = 2.2
            swing_R = 3.6
        elif frame_idx == 2:
            torso_y = 1.6
            swing_R = 2.4
        else:
            torso_y = 0.2
    elif anim == "cast":
        if frame_idx == 0:
            torso_y, torso_z = 0.0, 20.5
            swing_R = -1.5
        elif frame_idx in (1, 2):
            torso_y, torso_z = 0.4, 21.6
            swing_R = 2.8
        else:
            torso_y, torso_z = 0.2, 20.8
            swing_R = 0.5
    elif anim == "hurt":
        torso_y = -2.0 if frame_idx == 0 else -0.8
    elif anim == "die":
        is_die = True
        torso_y = 2.2 if frame_idx >= 2 else -1.2
        torso_z = 3.0 if frame_idx == 3 else 7.0 if frame_idx == 2 else 14.0 if frame_idx == 1 else 19.5

    tz = torso_z + torso_bob
    ty = torso_y

    if not is_die:
        # 1. Legs & Boots (leather boots & steel greaves)
        for side, reach, lift in ((-1, reach_L, lift_L), (1, reach_R, lift_R)):
            foot_y = ty + reach
            foot_z = max(0.6, 1.2 + lift)
            vc.draw_part(side * 2.2, foot_y + 0.3, foot_z, 1.3, 2.2, 1.2, (62, 48, 38), "none", facing_angle, tex_mode="leather")
            vc.draw_capsule((side * 2.2, ty, tz - 8.0), (side * 2.2, foot_y, foot_z + 0.5), 1.5, 1.2, (138, 148, 162), "armour", facing_angle, steps=5, tex_mode="steel", spec_power=26.0)

        # 2. Chainmail Hauberk & Polished Steel Cuirass
        vc.draw_part(0, ty, tz - 6.0, 3.8, 2.6, 2.2, (90, 96, 106), "none", facing_angle, tex_mode="chainmail")
        vc.draw_part(0, ty, tz, 4.3, 3.1, 3.9, (168, 178, 192), "armour", facing_angle, tex_mode="steel", spec_power=26.0, spec_strength=0.9)

        # 3. Steel Pauldrons & Arms
        sh_z = tz + 2.8
        for side, swing in ((-1, swing_L), (1, swing_R)):
            vc.draw_part(side * 4.4, ty, sh_z, 2.3, 2.9, 2.1, (178, 188, 202), "armour", facing_angle, tex_mode="steel", spec_power=24.0, spec_strength=0.85)
            hand_y = ty + 1.6 + swing
            vc.draw_capsule((side * 4.2, ty, sh_z - 1.2), (side * 4.0, hand_y, tz - 4.5), 1.5, 1.2, (94, 100, 110), "none", facing_angle, steps=5, tex_mode="chainmail")

        # 4. Heater Shield on left arm with central steel umbo (boss)
        vc.draw_part(-4.8, ty + 1.8 + swing_L, tz, 1.2, 3.5, 4.3, (55, 95, 195), "team", facing_angle, tex_mode="cloth")
        # Steel rim
        vc.draw_part(-4.9, ty + 1.8 + swing_L, tz, 1.3, 3.7, 4.5, (165, 175, 188), "armour", facing_angle, tex_mode="steel", spec_power=28.0)
        # Steel umbo / boss
        vc.draw_part(-5.1, ty + 2.0 + swing_L, tz, 0.9, 1.4, 1.4, (245, 210, 80), "level", facing_angle, gold_spec=True, emissive=0.4)

        # 5. Conical Steel Nasal Helm & Head
        head_z = tz + 7.2
        head_y = ty + 0.2
        vc.draw_part(0, head_y, head_z, 2.0, 2.1, 2.4, (212, 170, 140), "none", facing_angle)
        vc.draw_part(0, head_y, head_z + 0.8, 2.4, 2.5, 2.3, (182, 192, 208), "armour", facing_angle, tex_mode="steel", spec_power=28.0, spec_strength=0.9)

        # 6. Steel Arming Sword in right hand
        if anim == "cast" and frame_idx in (1, 2):
            hilt = (1.5, ty + 1.2, tz + 2.5)
            tip = (1.2, ty + 1.2, tz + 13.5)
        elif anim == "attack" and frame_idx == 1:
            hilt = (2.2, ty + 3.8, tz - 2.0)
            tip = (1.6, ty + 8.2, tz - 10.0)
        else:
            hilt = (3.4, ty + 2.4 + swing_R, tz - 3.5)
            tip = (2.6, ty + 2.4 + swing_R, tz - 16.5)

        vc.draw_blade(hilt, tip, 1.2, 0.65, facing_angle)
        vc.draw_capsule((hilt[0] - 1.6, hilt[1], hilt[2]), (hilt[0] + 1.6, hilt[1], hilt[2]), 0.45, 0.45, (188, 148, 78), "level", facing_angle, steps=3, gold_spec=True)
    else:
        vc.draw_part(0, ty, tz, 4.2, 4.8, 2.6, (168, 178, 192), "armour", facing_angle, tex_mode="steel")
        vc.draw_part(0, ty + 3.0, tz + 0.8, 2.1, 2.1, 2.0, (212, 170, 140), "none", facing_angle)
        vc.draw_part(-2.5, ty, tz, 1.8, 1.8, 1.8, (55, 95, 195), "team", facing_angle)
        vc.draw_part(0, ty, tz, 1.0, 1.0, 1.0, (245, 210, 80), "level", facing_angle, emissive=0.35)
        vc.draw_blade((2.8, ty - 1.0, 1.5), (2.8, ty + 6.5, 1.5), 1.0, 0.6, facing_angle)

    return downsample_and_finalize(vc, "warrior", anim, min_stand_px=25, max_stand_px=35)


HERO_RENDERERS = {
    "hero": render_dain_hero_frame,
    "archer": render_selena_archer_frame,
    "mage": render_valerius_mage_frame,
    "warrior": render_mercenary_warrior_frame,
}


def generate_hero_unit_atlas(unit_id: str, out_sprites_dir: str):
    print(f"Generating supersampled 4x anti-aliased character atlas: {unit_id}...")
    renderer = HERO_RENDERERS[unit_id]

    color_atlas = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))
    mask_atlas = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))

    frames_json = {}
    animations_json = {}

    current_col = 0
    current_row = 0

    for anim in COMBAT_ANIMS_ORDER:
        num_frames = ANIMS[anim]
        anim_seq = []
        for d in range(DIRECTIONS):
            facing_angle = d * (2.0 * math.pi / 16.0)
            for f in range(num_frames):
                fname = frame_name(unit_id, anim, d, f)
                anim_seq.append(fname)

                col_arr, msk_arr = renderer(anim, facing_angle, f)

                x = current_col * CELL
                y = current_row * CELL

                frames_json[fname] = {
                    "frame": {"x": x, "y": y, "w": CELL, "h": CELL},
                    "sourceSize": {"w": CELL, "h": CELL},
                    "spriteSourceSize": {"x": 0, "y": 0, "w": CELL, "h": CELL},
                    "rotated": False,
                    "trimmed": False,
                    "anchor": {"x": 0.5, "y": 0.85},
                }

                c_img = Image.fromarray(col_arr, "RGBA")
                m_img = Image.fromarray(msk_arr, "RGBA")

                color_atlas.paste(c_img, (x, y))
                mask_atlas.paste(m_img, (x, y))

                current_col += 1
                if current_col >= GRID_COLS:
                    current_col = 0
                    current_row += 1

        animations_json[anim] = anim_seq

    sheet_json = {
        "frames": frames_json,
        "animations": animations_json,
        "meta": {
            "image": f"{unit_id}.png",
            "size": {"w": ATLAS_SIZE, "h": ATLAS_SIZE},
            "thornvael": {
                "contract": 1,
                "unit": unit_id,
                "directions": 16,
                "cell": [CELL, CELL],
                "anims": {clip: ANIMS[clip] for clip in COMBAT_ANIMS_ORDER},
                "mask": f"{unit_id}-mask.png",
            },
        },
    }

    png_path = os.path.join(out_sprites_dir, f"{unit_id}.png")
    mask_path = os.path.join(out_sprites_dir, f"{unit_id}-mask.png")
    json_path = os.path.join(out_sprites_dir, f"{unit_id}.json")

    color_atlas.save(png_path, "PNG")
    mask_atlas.save(mask_path, "PNG")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(sheet_json, f, separators=(",", ":"))

    print(f"  Successfully saved {png_path}, {mask_path}, {json_path}")


def main():
    default_dir = "public/sprites" if os.path.exists("public/sprites") else "game/public/sprites"
    out_dir = default_dir
    targets = []
    for arg in sys.argv[1:]:
        if arg in HERO_RENDERERS:
            targets.append(arg)
        elif os.path.isdir(arg) or "/" in arg or "\\" in arg:
            out_dir = arg
    if not targets:
        targets = ["hero", "archer", "mage", "warrior"]
    os.makedirs(out_dir, exist_ok=True)
    for unit_id in targets:
        generate_hero_unit_atlas(unit_id, out_dir)
    print("All character sprite atlases generated successfully!")


if __name__ == "__main__":
    main()
