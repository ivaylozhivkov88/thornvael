"""Generate high-resolution, beautifully shaded battlefield hero sprites:
- Dain Ironclad (hero): Rebuilt to match Picture 2 (veteran warrior with green enameled cuirass,
  bronze pauldrons with gold rivets, chainmail sleeves, two-handed steel bastard sword, brown boots,
  and bearded warrior face).
- Selena (archer): Swift ranger with emerald cloak, oxhide leather cuirass, composite recurve bow & quiver.
- Valerius (mage): Grand wizard with silver beard, arcane indigo silk robes & glowing astral rune staff.
- Warrior Mercenary (warrior): Classic iron cuirass, nasal helm, broadsword & heater shield.

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
ATLAS_SIZE = 1024
GRID_COLS = 21  # 21 * 48 = 1008 <= 1024

ELEV = math.radians(35)
COS_ELEV = math.cos(ELEV)
SIN_ELEV = math.sin(ELEV)

PY_GRID, PX_GRID = np.mgrid[0:CELL, 0:CELL].astype(np.float32)


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
    "team": (255, 0, 0, 255),
    "armour": (0, 255, 0, 255),
    "level": (0, 0, 255, 255),
}


class VoxelCanvas:
    def __init__(self):
        self.color = np.zeros((CELL, CELL, 4), dtype=np.uint8)
        self.mask = np.zeros((CELL, CELL, 4), dtype=np.uint8)
        self.zbuf = np.full((CELL, CELL), -9999.0, dtype=np.float32)

    def draw_ground_shadow(self, radius_x: float = 10.0, radius_y: float = 5.0, cy: float = 39.0):
        dx = (PX_GRID - 24.0) / max(1.0, radius_x)
        dy = (PY_GRID - cy) / max(1.0, radius_y)
        d2 = dx * dx + dy * dy
        valid = (d2 < 1.0) & (PX_GRID >= 3) & (PX_GRID <= 44) & (PY_GRID >= 3) & (PY_GRID <= 44) & (self.color[:, :, 3] == 0)
        alpha = (np.maximum(0.0, 1.0 - d2) ** 1.6 * 95.0).astype(np.uint8)
        self.color[valid, 0] = 12
        self.color[valid, 1] = 10
        self.color[valid, 2] = 15
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
        spec_power: float = 16.0,
        spec_strength: float = 0.45,
        emissive: float = 0.0,
    ):
        scx_rel, scy_rel, depth_c = project_3d_point(cx, cy, cz, facing_angle)
        scx = 24.0 + scx_rel
        scy = 39.0 + scy_rel

        cos_a = abs(math.cos(facing_angle))
        sin_a = abs(math.sin(facing_angle))
        eff_rx = max(0.65, rx * cos_a + ry * sin_a)
        eff_ry = max(0.65, (rx * sin_a + ry * cos_a) * SIN_ELEV + rz * COS_ELEV)

        x0 = max(2, int(math.floor(scx - eff_rx - 0.5)))
        x1 = min(45, int(math.ceil(scx + eff_rx + 0.5)))
        y0 = max(2, int(math.floor(scy - eff_ry - 0.5)))
        y1 = min(45, int(math.ceil(scy + eff_ry + 0.5)))
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
        z_offset = nz * ((rz + ry) * 0.5)
        depth = depth_c + z_offset

        sub_zbuf = self.zbuf[y0 : y1 + 1, x0 : x1 + 1]
        vis = inside & (depth > sub_zbuf)
        if not np.any(vis):
            return

        sub_zbuf[vis] = depth[vis]

        # Procedural 3D micro-normal perturbation & material texture modulation
        if tex_mode == "chitin" or tex_mode == "enamel":
            band = np.sin(sub_py * 1.5 + sub_px * 0.6) * 0.12
            ny_p = np.clip(ny + band, -1.0, 1.0)
            tex_mod = 1.0 + band * 0.7
        elif tex_mode == "cloth":
            fold = np.sin(sub_px * 1.4 + sub_py * 0.7) * 0.14
            ny_p = ny
            tex_mod = 1.0 + fold * 0.65
        elif tex_mode == "steel":
            ridge = np.cos(sub_px * 2.2) * 0.15
            ny_p = np.clip(ny + ridge, -1.0, 1.0)
            tex_mod = 1.0 + ridge * 0.8
        else:
            ny_p = ny
            tex_mod = 1.0

        # Camera-fixed 3-point isometric lighting rig
        lx, ly, lz = -0.52, -0.58, 0.63
        diff_key = np.maximum(0.0, nx * lx + ny_p * ly + nz * lz)
        diff_fill = np.maximum(0.0, nx * 0.58 + ny_p * (-0.25) + nz * 0.45) * 0.35
        diff_back = np.maximum(0.0, ny_p * 0.72 + nz * 0.35) * 0.25
        hx, hy, hz = -0.30, -0.34, 0.89
        spec = np.power(np.maximum(0.0, nx * hx + ny_p * hy + nz * hz), spec_power) * spec_strength
        rim = np.power(1.0 - nz, 2.0) * 0.34

        lit = (0.35 + diff_key * 0.72 + diff_fill + diff_back + rim) * tex_mod + emissive
        cr = np.clip(rgb[0] * lit + spec * 255.0 + rim * 40.0 + emissive * 70.0, 0, 255).astype(np.uint8)
        cg = np.clip(rgb[1] * lit + spec * 240.0 + rim * 28.0 + emissive * 60.0, 0, 255).astype(np.uint8)
        cb = np.clip(rgb[2] * lit + spec * 225.0 + diff_fill * 35.0 + emissive * 50.0, 0, 255).astype(np.uint8)

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
        steps: int = 5,
        tex_mode: str = "smooth",
        spec_strength: float = 0.45,
        spec_power: float = 16.0,
        emissive: float = 0.0,
    ):
        for s in range(steps + 1):
            f = s / max(1, steps)
            cx = p0[0] + (p1[0] - p0[0]) * f
            cy = p0[1] + (p1[1] - p0[1]) * f
            cz = p0[2] + (p1[2] - p0[2]) * f
            r = r0 + (r1 - r0) * f
            self.draw_part(
                cx, cy, cz, r, r, r, rgb, mask_type, facing_angle,
                tex_mode=tex_mode, spec_power=spec_power, spec_strength=spec_strength, emissive=emissive,
            )

    def finalize_frame(self, is_stand: bool = False, min_stand_px: int = 27, max_stand_px: int = 35):
        self.color[0, :, :] = 0
        self.color[CELL - 1, :, :] = 0
        self.color[:, 0, :] = 0
        self.color[:, CELL - 1, :] = 0
        self.mask[0, :, :] = 0
        self.mask[CELL - 1, :, :] = 0
        self.mask[:, 0, :] = 0
        self.mask[:, CELL - 1, :] = 0

        solid = self.color[:, :, 3] > 128
        if is_stand and np.any(solid):
            ys = np.where(np.any(solid, axis=1))[0]
            top, bottom = int(ys[0]), int(ys[-1])
            h = bottom - top + 1
            if h > max_stand_px:
                cut_y = bottom - (max_stand_px - 1)
                self.color[:cut_y, :, :] = 0
                self.mask[:cut_y, :, :] = 0
                solid = self.color[:, :, 3] > 128
            elif h < min_stand_px:
                # Pad slightly upward if needed
                pass

        if np.any(solid):
            eroded = (
                solid
                & np.roll(solid, 1, axis=0)
                & np.roll(solid, -1, axis=0)
                & np.roll(solid, 1, axis=1)
                & np.roll(solid, -1, axis=1)
            )
            outline = solid & (~eroded)
            self.color[outline, 0] = (self.color[outline, 0].astype(np.float32) * 0.48).astype(np.uint8)
            self.color[outline, 1] = (self.color[outline, 1].astype(np.float32) * 0.48).astype(np.uint8)
            self.color[outline, 2] = (self.color[outline, 2].astype(np.float32) * 0.52).astype(np.uint8)


def render_dain_hero_frame(anim: str, facing_angle: float, frame_idx: int) -> VoxelCanvas:
    """Renders Dain Ironclad matching Picture 2 with genuine dark-fantasy depth."""
    vc = VoxelCanvas()
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
            sword_cast_emissive = 0.75
        else:
            torso_y, torso_z = 0.2, 21.2
            sword_cast_emissive = 0.2
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
        # 1. Boots & Legs (dark oiled leather with steel knee cops)
        for side, reach, lift in ((-1, reach_L, lift_L), (1, reach_R, lift_R)):
            foot_y = ty + reach
            foot_z = max(0.6, 1.2 + lift)
            knee_y = ty + reach * 0.55
            knee_z = max(3.5, 7.5 + lift * 0.5)
            # Foot
            vc.draw_part(side * 2.2, foot_y + 0.4, foot_z, 1.4, 2.4, 1.3, (68, 50, 36), "none", facing_angle, tex_mode="cloth")
            # Shin greaves
            vc.draw_capsule((side * 2.2, ty, tz - 8.5), (side * 2.2, foot_y, foot_z + 0.5), 1.6, 1.3, (78, 60, 44), "none", facing_angle, steps=4, tex_mode="cloth")
            # Steel knee cop
            vc.draw_part(side * 2.2, knee_y + 1.2, knee_z, 1.3, 1.3, 1.3, (155, 165, 180), "armour", facing_angle, tex_mode="enamel", spec_strength=0.7)

        # 2. Pelvis & Chainmail Fauld
        vc.draw_part(0, ty, tz - 6.5, 3.8, 2.6, 2.2, (85, 92, 102), "none", facing_angle, tex_mode="enamel")
        # Leather war belt with gold buckle
        vc.draw_part(0, ty, tz - 4.5, 3.7, 2.7, 1.1, (55, 38, 28), "none", facing_angle, tex_mode="cloth")
        vc.draw_part(0, ty + 2.2, tz - 4.5, 1.1, 1.1, 1.1, (245, 205, 75), "level", facing_angle, emissive=0.35)

        # 3. Green Enameled Cuirass
        vc.draw_part(0, ty, tz, 4.4, 3.2, 4.0, (38, 85, 52), "armour", facing_angle, tex_mode="enamel", spec_power=22.0, spec_strength=0.75)
        vc.draw_part(0, ty + 1.8, tz + 0.5, 2.8, 1.6, 2.8, (48, 112, 68), "armour", facing_angle, tex_mode="enamel", spec_power=26.0, spec_strength=0.85)

        # 4. Heraldic Cloak / Mantle on Back (Team Color)
        vc.draw_capsule((0, ty - 2.2, tz + 3.5), (cape_sway, ty - 2.6, tz - 9.0), 3.2, 3.6, (55, 95, 185), "team", facing_angle, steps=4, tex_mode="cloth")

        # 5. Shoulders, Pauldrons & Arms
        sh_z = tz + 3.0
        for side, swing in ((-1, swing_L), (1, swing_R)):
            # Antique bronze pauldron
            vc.draw_part(side * 4.6, ty, sh_z, 2.5, 3.0, 2.2, (175, 130, 65), "none", facing_angle, spec_power=18.0, spec_strength=0.65)
            # Gold rivets along rim
            for rz in (-1.1, 0.0, 1.1):
                vc.draw_part(side * 5.8, ty + 1.1, sh_z + rz, 0.45, 0.45, 0.45, (245, 210, 80), "level", facing_angle, emissive=0.45)
            # Chainmail sleeve
            hand_y = ty + 1.8 + swing
            hand_z = tz - 4.5
            vc.draw_capsule((side * 4.4, ty, sh_z - 1.5), (side * 4.2, hand_y, hand_z), 1.6, 1.3, (90, 96, 106), "none", facing_angle, steps=4, tex_mode="enamel")
            # Steel/leather gauntlet
            vc.draw_part(side * 4.2, hand_y, hand_z - 0.5, 1.4, 1.6, 1.4, (140, 148, 160), "armour", facing_angle, spec_strength=0.6)

        # 6. Head, Gorget & Bearded Face
        head_z = tz + 7.5
        head_y = ty + 0.3
        # Gorget
        vc.draw_capsule((0, ty, tz + 3.5), (0, head_y, head_z - 2.0), 1.6, 1.5, (140, 150, 165), "armour", facing_angle, steps=2)
        # Face (warm weathered skin)
        vc.draw_part(0, head_y, head_z, 2.2, 2.3, 2.6, (190, 148, 118), "none", facing_angle)
        # Full beard & mustache
        vc.draw_part(0, head_y + 1.3, head_z - 1.5, 2.2, 1.8, 1.8, (75, 52, 38), "none", facing_angle)
        # Hair
        vc.draw_part(0, head_y - 0.6, head_z + 1.0, 2.4, 2.4, 2.0, (58, 40, 30), "none", facing_angle)
        # Steel brow circlet / headband
        vc.draw_part(0, head_y + 0.6, head_z + 1.5, 2.3, 2.4, 0.9, (165, 175, 190), "armour", facing_angle, spec_strength=0.7)

        # 7. Two-Handed Steel Bastard Sword
        if anim == "attack" and frame_idx == 1:
            hilt = (2.2, ty + 4.2, tz - 3.0)
            tip = (1.6, ty + 8.8, tz - 11.0)
        elif anim == "attack" and frame_idx == 2:
            hilt = (0.8, ty + 3.8, tz - 7.0)
            tip = (-2.8, ty + 6.5, tz - 15.0)
        elif anim == "cast" and frame_idx in (1, 2):
            hilt = (1.0, ty + 1.2, tz + 3.5)
            tip = (0.8, ty + 1.2, tz + 13.5)
        else:
            hilt = (3.4, ty + 2.8, tz - 3.5)
            tip = (2.6, ty + 2.8, tz - 17.0)

        vc.draw_capsule(hilt, tip, 0.85, 0.55, (220, 230, 248), "none", facing_angle, steps=7, tex_mode="steel", spec_power=28.0, spec_strength=0.92, emissive=sword_cast_emissive)
        # Crossguard
        vc.draw_capsule((hilt[0] - 1.8, hilt[1], hilt[2]), (hilt[0] + 1.8, hilt[1], hilt[2]), 0.45, 0.45, (175, 135, 68), "level", facing_angle, steps=3, emissive=sword_cast_emissive * 0.5)
        # Pommel
        vc.draw_part(hilt[0], hilt[1], hilt[2] + 2.0, 0.65, 0.65, 0.65, (235, 195, 75), "level", facing_angle, emissive=0.4 + sword_cast_emissive * 0.5)
    else:
        # Death pose
        vc.draw_part(0, ty, tz, 4.4, 5.0, 2.8, (38, 85, 52), "armour", facing_angle, tex_mode="enamel")
        vc.draw_part(0, ty + 3.5, tz + 1.0, 2.2, 2.2, 2.0, (190, 148, 118), "none", facing_angle)
        vc.draw_capsule((0, ty - 2.5, tz), (0, ty - 3.5, tz), 2.2, 2.2, (55, 95, 185), "team", facing_angle, steps=2)
        vc.draw_part(0, ty + 1.5, tz - 0.5, 1.2, 1.2, 1.2, (245, 205, 75), "level", facing_angle, emissive=0.35)
        vc.draw_capsule((3.0, ty - 1.0, 1.5), (3.0, ty + 7.0, 1.5), 0.7, 0.5, (215, 225, 240), "none", facing_angle, steps=5, tex_mode="steel")

    vc.finalize_frame(is_stand=(anim == "stand"), min_stand_px=27, max_stand_px=35)
    return vc


def render_selena_archer_frame(anim: str, facing_angle: float, frame_idx: int) -> VoxelCanvas:
    """Renders Selena the Swift Ranger matching her portrait hero-selena.png."""
    vc = VoxelCanvas()
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
            draw_bow = 0.3
            torso_y = -0.4
        elif frame_idx == 1:
            draw_bow = 0.8
            torso_y = 0.2
        elif frame_idx == 2:  # Release
            draw_bow = 0.95
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
        # 1. Thigh-high supple brown ranger boots
        for side, reach, lift in ((-1, reach_L, lift_L), (1, reach_R, lift_R)):
            foot_y = ty + reach
            foot_z = max(0.6, 1.2 + lift)
            vc.draw_part(side * 2.0, foot_y + 0.3, foot_z, 1.2, 2.2, 1.2, (75, 52, 38), "none", facing_angle, tex_mode="cloth")
            vc.draw_capsule((side * 2.0, ty, tz - 8.0), (side * 2.0, foot_y, foot_z + 0.5), 1.4, 1.1, (85, 60, 44), "none", facing_angle, steps=4, tex_mode="cloth")

        # 2. Studded Oxhide Leather Cuirass with Laced Front
        vc.draw_part(0, ty, tz - 5.0, 3.2, 2.3, 2.0, (110, 78, 52), "armour", facing_angle, tex_mode="cloth")
        vc.draw_part(0, ty, tz, 3.6, 2.6, 3.4, (120, 85, 58), "armour", facing_angle, tex_mode="cloth", spec_power=14.0, spec_strength=0.5)

        # 3. Emerald Ranger Hood & Cloak
        vc.draw_capsule((0, ty - 1.8, tz + 3.0), (0, ty - 2.2, tz - 8.5), 2.8, 3.2, (38, 125, 68), "team", facing_angle, steps=4, tex_mode="cloth")

        # 4. Head & Auburn Braided Hair
        head_z = tz + 6.8
        head_y = ty + 0.2
        vc.draw_part(0, head_y, head_z, 1.9, 2.0, 2.3, (215, 170, 142), "none", facing_angle)
        vc.draw_part(0, head_y - 0.5, head_z + 0.8, 2.2, 2.2, 1.8, (145, 65, 42), "none", facing_angle)  # Auburn hair
        vc.draw_part(0, head_y + 0.4, head_z + 1.2, 2.0, 2.1, 0.8, (185, 195, 210), "level", facing_angle, emissive=0.3)  # Circlet

        # 5. Composite Recurve War Bow & Quiver
        vc.draw_capsule((1.2, ty - 1.8, tz + 4.5), (1.2, ty - 1.8, tz - 4.5), 1.1, 1.1, (95, 68, 48), "none", facing_angle, steps=3)  # Quiver
        vc.draw_part(1.2, ty - 1.8, tz + 5.2, 0.9, 0.9, 0.9, (220, 225, 235), "armour", facing_angle)  # Arrow fletchings

        bow_y = ty + 2.5 + draw_bow * 1.5
        bow_top = (3.4, bow_y, tz + 8.5)
        bow_mid = (3.6, bow_y + 0.8, tz)
        bow_bot = (3.4, bow_y, tz - 8.5)
        vc.draw_capsule(bow_top, bow_mid, 0.55, 0.7, (135, 95, 62), "none", facing_angle, steps=4)
        vc.draw_capsule(bow_mid, bow_bot, 0.7, 0.55, (135, 95, 62), "none", facing_angle, steps=4)
        vc.draw_part(bow_top[0], bow_top[1], bow_top[2], 0.7, 0.7, 0.7, (245, 215, 85), "level", facing_angle, emissive=0.4)
        vc.draw_part(bow_bot[0], bow_bot[1], bow_bot[2], 0.7, 0.7, 0.7, (245, 215, 85), "level", facing_angle, emissive=0.4)
    else:
        vc.draw_part(0, ty, tz, 3.6, 4.2, 2.4, (120, 85, 58), "armour", facing_angle)
        vc.draw_part(0, ty + 2.8, tz + 0.8, 1.9, 1.9, 1.8, (215, 170, 142), "none", facing_angle)
        vc.draw_capsule((0, ty - 2.0, tz), (0, ty - 3.0, tz), 2.0, 2.0, (38, 125, 68), "team", facing_angle, steps=2)
        vc.draw_part(2.2, ty, tz, 0.8, 0.8, 0.8, (245, 215, 85), "level", facing_angle, emissive=0.35)

    vc.finalize_frame(is_stand=(anim == "stand"), min_stand_px=24, max_stand_px=34)
    return vc


def render_valerius_mage_frame(anim: str, facing_angle: float, frame_idx: int) -> VoxelCanvas:
    """Renders Valerius the Grand Wizard matching his portrait hero-valerius.png."""
    vc = VoxelCanvas()
    vc.draw_ground_shadow(10.0, 5.0, 39.0)

    torso_bob = 0.0
    torso_y = 0.0
    torso_z = 21.0
    swing_staff = 0.0
    orb_glow = 0.35
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
            orb_glow = 0.5
            torso_y = -0.4
        elif frame_idx == 1:
            swing_staff = 3.2
            orb_glow = 0.95
            torso_y = 0.8
        elif frame_idx == 2:
            swing_staff = 2.4
            orb_glow = 0.85
            torso_y = 0.4
        else:
            swing_staff = 1.0
            orb_glow = 0.45
            torso_y = 0.0
    elif anim == "cast":
        if frame_idx == 0:
            swing_staff = 0.8
            orb_glow = 0.6
        elif frame_idx in (1, 2):
            swing_staff = 2.8
            orb_glow = 1.0
            torso_z = 22.2
        else:
            swing_staff = 1.2
            orb_glow = 0.5
    elif anim == "hurt":
        torso_y = -1.6 if frame_idx == 0 else -0.6
    elif anim == "die":
        is_die = True
        torso_y = 1.8 if frame_idx >= 2 else -1.0
        torso_z = 2.8 if frame_idx == 3 else 6.5 if frame_idx == 2 else 13.5 if frame_idx == 1 else 19.0

    tz = torso_z + torso_bob
    ty = torso_y

    if not is_die:
        # 1. Soft Leather Shoes & Flowing Silk Robes touching the ground (z ~ 1.0 to 18.0)
        for side in (-1, 1):
            vc.draw_part(side * 1.8, ty + 0.4, 1.2, 1.2, 2.2, 1.2, (62, 48, 36), "none", facing_angle, tex_mode="cloth")
        vc.draw_part(0, ty, tz - 11.5, 4.2, 3.6, 2.8, (42, 52, 130), "team", facing_angle, tex_mode="cloth")
        vc.draw_part(0, ty, tz - 7.0, 4.0, 3.2, 3.8, (48, 58, 142), "team", facing_angle, tex_mode="cloth")
        vc.draw_part(0, ty, tz - 2.5, 3.6, 2.8, 3.4, (54, 66, 158), "team", facing_angle, tex_mode="cloth")

        # 2. Golden-Embroidered Mantle & Raised Cowl
        vc.draw_part(0, ty + 0.2, tz + 2.5, 3.8, 3.0, 2.4, (195, 155, 65), "armour", facing_angle, spec_power=18.0, spec_strength=0.6)

        # 3. Head & Flowing Silver-Grey Beard
        head_z = tz + 7.2
        head_y = ty + 0.3
        vc.draw_part(0, head_y, head_z, 2.1, 2.2, 2.4, (215, 178, 152), "none", facing_angle)
        vc.draw_part(0, head_y + 1.2, head_z - 1.6, 2.2, 1.8, 2.4, (205, 210, 220), "none", facing_angle)  # Silver beard
        vc.draw_part(0, head_y - 0.5, head_z + 1.2, 2.3, 2.3, 2.0, (195, 200, 210), "none", facing_angle)  # Silver hair
        # Wizard cowl crest / astral crown
        vc.draw_part(0, head_y, head_z + 2.4, 1.8, 2.0, 1.4, (195, 155, 65), "armour", facing_angle, emissive=0.25)

        # 4. Ornate Carved Rune Staff & Glowing Astral Crystal Orb
        staff_bot = (3.6, ty + 1.5 + swing_staff, tz - 9.5)
        staff_top = (3.6, ty + 1.5 + swing_staff, tz + 9.5)
        vc.draw_capsule(staff_bot, staff_top, 0.65, 0.65, (145, 105, 68), "armour", facing_angle, steps=5)
        # Astral orb
        vc.draw_part(staff_top[0], staff_top[1], staff_top[2] + 1.1, 1.5, 1.5, 1.5, (95, 235, 255), "level", facing_angle, emissive=orb_glow)
    else:
        vc.draw_part(0, ty, tz, 3.8, 4.8, 2.6, (45, 55, 135), "team", facing_angle)
        vc.draw_part(0, ty + 3.0, tz + 0.8, 2.0, 2.0, 2.0, (215, 178, 152), "none", facing_angle)
        vc.draw_part(0, ty + 1.5, tz, 1.5, 1.5, 1.5, (195, 155, 65), "armour", facing_angle)
        vc.draw_part(2.6, ty, tz, 1.0, 1.0, 1.0, (95, 235, 255), "level", facing_angle, emissive=0.4)

    vc.finalize_frame(is_stand=(anim == "stand"), min_stand_px=25, max_stand_px=35)
    return vc


def render_mercenary_warrior_frame(anim: str, facing_angle: float, frame_idx: int) -> VoxelCanvas:
    """Renders the classic Warrior Mercenary: polished iron cuirass, chainmail, nasal helm, heater shield & broadsword."""
    vc = VoxelCanvas()
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
        # Legs & Boots
        for side, reach, lift in ((-1, reach_L, lift_L), (1, reach_R, lift_R)):
            foot_y = ty + reach
            foot_z = max(0.6, 1.2 + lift)
            vc.draw_part(side * 2.2, foot_y + 0.3, foot_z, 1.3, 2.2, 1.2, (60, 48, 38), "none", facing_angle, tex_mode="cloth")
            vc.draw_capsule((side * 2.2, ty, tz - 8.0), (side * 2.2, foot_y, foot_z + 0.5), 1.5, 1.2, (135, 145, 158), "armour", facing_angle, steps=4, tex_mode="steel")

        # Chainmail hauberk & Iron Cuirass
        vc.draw_part(0, ty, tz - 6.0, 3.8, 2.6, 2.2, (88, 95, 105), "none", facing_angle, tex_mode="enamel")
        vc.draw_part(0, ty, tz, 4.2, 3.0, 3.8, (165, 175, 190), "armour", facing_angle, tex_mode="steel", spec_power=24.0, spec_strength=0.85)

        # Steel Pauldrons & Arms
        sh_z = tz + 2.8
        for side, swing in ((-1, swing_L), (1, swing_R)):
            vc.draw_part(side * 4.4, ty, sh_z, 2.2, 2.8, 2.0, (175, 185, 200), "armour", facing_angle, spec_strength=0.7)
            hand_y = ty + 1.6 + swing
            vc.draw_capsule((side * 4.2, ty, sh_z - 1.2), (side * 4.0, hand_y, tz - 4.5), 1.5, 1.2, (92, 98, 108), "none", facing_angle, steps=4)

        # Heater Shield on left arm
        vc.draw_part(-4.8, ty + 1.8 + swing_L, tz, 1.2, 3.4, 4.2, (55, 95, 185), "team", facing_angle, tex_mode="cloth")
        vc.draw_part(-4.8, ty + 2.0 + swing_L, tz, 0.8, 1.2, 1.2, (245, 205, 75), "level", facing_angle, emissive=0.35)  # Boss

        # Steel Nasal Helm & Head
        head_z = tz + 7.2
        head_y = ty + 0.2
        vc.draw_part(0, head_y, head_z, 2.0, 2.1, 2.4, (210, 168, 138), "none", facing_angle)
        vc.draw_part(0, head_y, head_z + 0.8, 2.3, 2.4, 2.2, (180, 190, 205), "armour", facing_angle, tex_mode="steel", spec_strength=0.8)

        # Steel Broadsword in right hand
        if anim == "cast" and frame_idx in (1, 2):
            hilt = (1.5, ty + 1.2, tz + 2.5)
            tip = (1.2, ty + 1.2, tz + 13.5)
        elif anim == "attack" and frame_idx == 1:
            hilt = (2.2, ty + 3.8, tz - 2.0)
            tip = (1.6, ty + 8.2, tz - 10.0)
        else:
            hilt = (3.4, ty + 2.4 + swing_R, tz - 3.5)
            tip = (2.6, ty + 2.4 + swing_R, tz - 16.0)
        vc.draw_capsule(hilt, tip, 0.8, 0.5, (225, 235, 250), "none", facing_angle, steps=6, tex_mode="steel", spec_power=26.0, spec_strength=0.9)
        vc.draw_capsule((hilt[0] - 1.5, hilt[1], hilt[2]), (hilt[0] + 1.5, hilt[1], hilt[2]), 0.4, 0.4, (185, 145, 75), "level", facing_angle, steps=3)
    else:
        vc.draw_part(0, ty, tz, 4.2, 4.8, 2.6, (165, 175, 190), "armour", facing_angle)
        vc.draw_part(0, ty + 3.0, tz + 0.8, 2.1, 2.1, 2.0, (210, 168, 138), "none", facing_angle)
        vc.draw_part(-2.5, ty, tz, 1.8, 1.8, 1.8, (55, 95, 185), "team", facing_angle)
        vc.draw_part(0, ty, tz, 1.0, 1.0, 1.0, (245, 205, 75), "level", facing_angle, emissive=0.35)
        vc.draw_capsule((2.8, ty - 1.0, 1.5), (2.8, ty + 6.0, 1.5), 0.7, 0.5, (220, 230, 245), "none", facing_angle, steps=4)

    vc.finalize_frame(is_stand=(anim == "stand"), min_stand_px=26, max_stand_px=35)
    return vc


HERO_RENDERERS = {
    "hero": render_dain_hero_frame,
    "archer": render_selena_archer_frame,
    "mage": render_valerius_mage_frame,
    "warrior": render_mercenary_warrior_frame,
}


def generate_hero_unit_atlas(unit_id: str, out_sprites_dir: str):
    print(f"Generating high-resolution authentic character atlas: {unit_id}...")
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

                vc = renderer(anim, facing_angle, f)

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

                c_img = Image.fromarray(vc.color, "RGBA")
                m_img = Image.fromarray(vc.mask, "RGBA")

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
    print("Hero character sprite atlases generated successfully!")


if __name__ == "__main__":
    main()
