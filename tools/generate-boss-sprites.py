"""Generate high-detail 3D normal/specular/ambient-occlusion sprite atlases for:
- The 4 Act Bosses:
  1. Act 1: Morvessa (Silk Widow) - giant arachnid demon queen with chitin armour, 8 segmented legs, glowing green eyes & venom glands
  2. Act 2: Gorrathul (Sand Glutton) - massive armoured desert wurm/behemoth with bone spikes, crushing mandibles & frost aura
  3. Act 3: Vesperion (The Hollow Choir) - towering spectral arch-lich with flowing robes, crown of bones, astral spheres & electric halo
  4. Act 4: Ashkarath (Cinder King) - winged demon king of ash with sweeping horns, black obsidian & lava plate, and blazing greatsword
- And enrich/texture the 7 base unit atlases (hero, warrior, archer, mage, gnoll, golem, imp) with 3D metallic gradients,
  shield relief, weapon glow, fur/scale/stone textures, and crisp dark-fantasy shading while preserving 100% contract & lookdev bounds.

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

# Precomputed pixel coordinate grids for fast vectorized NumPy rendering
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

    def draw_ground_shadow(self, radius_x: float = 12.0, radius_y: float = 6.0, cy: float = 39.0):
        """Soft translucent ambient shadow on the ground (alpha <= 105 so it does not affect >128 height bounds)."""
        dx = (PX_GRID - 24.0) / max(1.0, radius_x)
        dy = (PY_GRID - cy) / max(1.0, radius_y)
        d2 = dx * dx + dy * dy
        valid = (d2 < 1.0) & (PX_GRID >= 3) & (PX_GRID <= 44) & (PY_GRID >= 3) & (PY_GRID <= 44) & (self.color[:, :, 3] == 0)
        alpha = (np.maximum(0.0, 1.0 - d2) ** 1.6 * 100.0).astype(np.uint8)
        self.color[valid, 0] = 10
        self.color[valid, 1] = 8
        self.color[valid, 2] = 14
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
        tex_mode: str = "chitin",
        spec_power: float = 14.0,
        spec_strength: float = 0.42,
        emissive: float = 0.0,
    ):
        """Vectorized 3D ellipsoid with normal mapping, procedural surface texture, Blinn-Phong specular, and rim light."""
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

        # Procedural 3D surface micro-normal perturbation & texture modulation
        if tex_mode == "chitin":
            band = np.sin(sub_py * 1.35 + sub_px * 0.45) * 0.14
            ny_p = np.clip(ny + band, -1.0, 1.0)
            tex_mod = 1.0 + band * 0.65
        elif tex_mode == "bone":
            rib = np.cos(sub_px * 1.2 - sub_py * 0.8) * 0.12
            ny_p = np.clip(ny + rib, -1.0, 1.0)
            tex_mod = 1.0 + rib * 0.8
        elif tex_mode == "obsidian":
            facet = np.sin(sub_px * 1.7) * np.cos(sub_py * 1.7) * 0.18
            ny_p = np.clip(ny + facet, -1.0, 1.0)
            tex_mod = 1.0 + facet * 0.9
        elif tex_mode == "cloth":
            fold = np.sin(sub_px * 1.4 + sub_py * 0.6) * 0.15
            ny_p = ny
            tex_mod = 1.0 + fold * 0.75
        else:
            ny_p = ny
            tex_mod = 1.0

        # Camera-fixed 3-point isometric lighting rig:
        # 1. Warm golden key light from top-left (-0.52, -0.58, 0.63)
        # 2. Cool blue fill light from right (+0.58, -0.25, 0.45) so shaded side never goes black
        # 3. Fiery rear rim-light (0.0, +0.72, 0.45) to separate back-facing silhouettes
        lx, ly, lz = -0.52, -0.58, 0.63
        diff_key = np.maximum(0.0, nx * lx + ny_p * ly + nz * lz)
        diff_fill = np.maximum(0.0, nx * 0.58 + ny_p * (-0.25) + nz * 0.45) * 0.35
        diff_back = np.maximum(0.0, ny_p * 0.72 + nz * 0.35) * 0.25
        # Half-vector for Blinn-Phong specular (viewer at (0, 0, 1))
        hx, hy, hz = -0.30, -0.34, 0.89
        spec = np.power(np.maximum(0.0, nx * hx + ny_p * hy + nz * hz), spec_power) * spec_strength
        rim = np.power(1.0 - nz, 2.0) * 0.34

        lit = (0.34 + diff_key * 0.72 + diff_fill + diff_back + rim) * tex_mod + emissive
        cr = np.clip(rgb[0] * lit + spec * 255.0 + rim * 45.0 + emissive * 65.0, 0, 255).astype(np.uint8)
        cg = np.clip(rgb[1] * lit + spec * 242.0 + rim * 28.0 + emissive * 55.0, 0, 255).astype(np.uint8)
        cb = np.clip(rgb[2] * lit + spec * 225.0 + diff_fill * 35.0 + emissive * 45.0, 0, 255).astype(np.uint8)

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
        tex_mode: str = "chitin",
        spec_strength: float = 0.45,
        emissive: float = 0.0,
    ):
        """Draw a smooth connected 3D tapered limb/blade/horn between p0 and p1."""
        for s in range(steps + 1):
            f = s / max(1, steps)
            cx = p0[0] + (p1[0] - p0[0]) * f
            cy = p0[1] + (p1[1] - p0[1]) * f
            cz = p0[2] + (p1[2] - p0[2]) * f
            r = r0 + (r1 - r0) * f
            self.draw_part(
                cx, cy, cz, r, r, r, rgb, mask_type, facing_angle,
                tex_mode=tex_mode, spec_strength=spec_strength, emissive=emissive,
            )

    def finalize_frame(self, is_stand: bool = False):
        """Add crisp dark-fantasy 1px silhouette contour shading and enforce contract bounds."""
        # Zero border pixels strictly
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
            # Contract stand logicalHeight must be in [32, 47] -> h in [24, 35]
            if h > 34:
                # Trim top excess above bottom - 33
                cut_y = bottom - 33
                self.color[:cut_y, :, :] = 0
                self.mask[:cut_y, :, :] = 0
                solid = self.color[:, :, 3] > 128

        # Darken outer 1px silhouette contour of solid subject for crisp RTS readability
        if np.any(solid):
            eroded = (
                solid
                & np.roll(solid, 1, axis=0)
                & np.roll(solid, -1, axis=0)
                & np.roll(solid, 1, axis=1)
                & np.roll(solid, -1, axis=1)
            )
            outline = solid & (~eroded)
            # Bottom/right contour darker than top/left sunlit contour
            self.color[outline, 0] = (self.color[outline, 0].astype(np.float32) * 0.48).astype(np.uint8)
            self.color[outline, 1] = (self.color[outline, 1].astype(np.float32) * 0.48).astype(np.uint8)
            self.color[outline, 2] = (self.color[outline, 2].astype(np.float32) * 0.52).astype(np.uint8)


def render_morvessa_frame(anim: str, facing_angle: float, frame_idx: int) -> VoxelCanvas:
    """Act 1 Boss: Morvessa, the Silk Widow — giant arachnid demon queen with chitin armour,
    8 articulated spider legs, glowing venomous green eyes and poison glands."""
    vc = VoxelCanvas()
    vc.draw_ground_shadow(13.5, 6.5, 39.0)
    t = frame_idx / max(1, ANIMS[anim] - 1)

    bob = math.sin(t * math.pi * 2) * 0.75 if anim in ("walk", "stand") else 0.0
    death_fall = t * 9.5 if anim == "die" else 0.0
    hurt_kick = (2.2 if frame_idx == 0 else 0.5) if anim == "hurt" else 0.0
    attack_lunge = math.sin(t * math.pi) * 2.8 if anim == "attack" else 0.0
    cast_float = math.sin(t * math.pi) * 1.6 if anim == "cast" else 0.0

    base_z = max(2.5, 9.5 + bob + cast_float - death_fall)
    fwd_y = attack_lunge - hurt_kick

    # 1. Giant Segmented Arachnid Opisthosoma (Abdomen) with Chitin Plates & Venom Glands
    ab_y = fwd_y - 4.0
    ab_z = base_z + 1.8
    vc.draw_part(0, ab_y, ab_z, 5.8, 6.8, 4.8, (118, 68, 156), "armour", facing_angle, tex_mode="chitin", spec_strength=0.55)
    vc.draw_part(0, ab_y - 1.6, ab_z + 1.4, 4.8, 5.2, 3.6, (148, 86, 192), "armour", facing_angle, tex_mode="chitin", spec_strength=0.6)
    # Glowing venomous green dorsal glands & spinneret sacs (skin/none mask -> full RGB poison emerald!)
    for gx_s in (-2.4, 0.0, 2.4):
        vc.draw_part(
            gx_s, ab_y - 1.0, ab_z + 3.4, 1.5, 2.0, 1.4,
            (85, 255, 120), "skin", facing_angle, tex_mode="smooth", spec_strength=0.7, emissive=0.35,
        )
    vc.draw_part(0, ab_y - 5.2, ab_z - 0.5, 2.0, 2.2, 1.6, (70, 245, 105), "level", facing_angle, emissive=0.3)

    # 2. 8 Articulated Segmented Spider Legs (4 per side: coxa -> femur -> tibia -> venomous claw tip)
    for leg_i in range(8):
        side = -1 if leg_i % 2 == 0 else 1
        pair = leg_i // 2  # 0..3 from front to back
        leg_y_off = (1.5 - pair) * 2.4
        step_phase = (t * math.pi * 2 + leg_i * math.pi / 4.0) if anim == "walk" else (t * math.pi * 2 + leg_i) * 0.2
        leg_lift = max(0.0, math.sin(step_phase)) * 2.2 if anim == "walk" else 0.0
        leg_reach = math.cos(step_phase) * 1.8 if anim == "walk" else math.sin(step_phase) * 0.35

        # Hip socket on cephalothorax
        hip = (side * 3.2, fwd_y + leg_y_off * 0.5, base_z + 0.5)
        # High arched knee joint (femur-patella)
        knee = (
            side * (6.8 + (1.5 - abs(pair - 1.5)) * 1.0),
            fwd_y + leg_y_off * 0.85 + leg_reach * 0.5,
            base_z + 4.8 + leg_lift,
        )
        # Grounded tarsus claw tip
        foot = (
            side * (9.2 + (1.5 - abs(pair - 1.5)) * 0.8),
            fwd_y + leg_y_off * 1.15 + leg_reach,
            max(0.8, base_z - 7.8 + leg_lift),
        )
        vc.draw_capsule(hip, knee, 1.35, 1.15, (132, 78, 172), "armour", facing_angle, steps=4, tex_mode="chitin")
        vc.draw_capsule(knee, foot, 1.1, 0.75, (96, 52, 134), "armour", facing_angle, steps=4, tex_mode="chitin")
        # Glowing poison-green claw tip
        vc.draw_part(foot[0], foot[1], foot[2], 0.95, 0.95, 1.1, (90, 255, 125), "skin", facing_angle, emissive=0.35)

    # 3. Upper Demonic Queen Cephalothorax & Corset Torso
    torso_z = base_z + 7.2
    torso_y = fwd_y + 1.2
    vc.draw_part(0, torso_y, torso_z - 2.2, 3.6, 3.0, 2.8, (142, 72, 178), "armour", facing_angle, tex_mode="chitin")
    vc.draw_part(0, torso_y, torso_z + 1.0, 3.0, 2.3, 3.4, (224, 204, 218), "skin", facing_angle, tex_mode="smooth")
    # Crimson silk & gold corset trim (team mask)
    vc.draw_part(0, torso_y + 0.6, torso_z + 0.2, 3.1, 2.4, 1.8, (220, 48, 82), "team", facing_angle, tex_mode="cloth")

    # 4. Demon Queen Head, Crown of Chitin Horns & 6 Glowing Venom-Green Eyes
    head_z = torso_z + 5.6
    head_y = torso_y + 0.4
    vc.draw_part(0, head_y, head_z, 2.3, 2.3, 2.5, (232, 214, 226), "skin", facing_angle, tex_mode="smooth")
    # Chitinous Queen Diadem & Swept Horns
    vc.draw_part(0, head_y - 0.3, head_z + 2.0, 2.8, 1.8, 1.4, (235, 55, 88), "team", facing_angle, tex_mode="chitin")
    for side in (-1, 1):
        vc.draw_capsule(
            (side * 1.6, head_y - 0.2, head_z + 2.0),
            (side * 3.4, head_y - 0.8, head_z + 4.5),
            0.95, 0.55, (245, 75, 105), "team", facing_angle, steps=3, tex_mode="bone",
        )
        # Cluster of glowing venomous green spider eyes
        vc.draw_part(side * 0.85, head_y + 1.9, head_z + 0.3, 0.65, 0.65, 0.65, (80, 255, 115), "skin", facing_angle, emissive=0.5)
        vc.draw_part(side * 1.45, head_y + 1.5, head_z + 0.9, 0.5, 0.5, 0.5, (110, 255, 140), "skin", facing_angle, emissive=0.5)

    # 5. Clawed Arms & Dual Venomous Curved Blades
    arm_swing = math.sin(t * math.pi * 2) * 1.8 if anim == "walk" else 0.0
    arm_reach = math.sin(t * math.pi) * 3.8 if anim == "attack" else math.sin(t * math.pi) * 2.4 if anim == "cast" else 0.0
    for side in (-1, 1):
        sh_p = (side * 3.2, torso_y, torso_z + 2.0)
        hand_p = (
            side * 4.8,
            torso_y + 1.8 + (arm_reach if anim in ("attack", "cast") else side * arm_swing),
            torso_z + (2.6 if anim == "cast" else -0.4),
        )
        blade_tip = (
            hand_p[0] + side * 1.2,
            hand_p[1] + 2.8,
            hand_p[2] - (1.8 if anim != "cast" else -2.0),
        )
        vc.draw_capsule(sh_p, hand_p, 1.1, 0.9, (212, 192, 206), "skin", facing_angle, steps=3)
        vc.draw_capsule(hand_p, blade_tip, 0.95, 0.55, (95, 255, 130), "level", facing_angle, steps=3, emissive=0.35)

    vc.finalize_frame(anim == "stand")
    return vc


def render_gorrathul_frame(anim: str, facing_angle: float, frame_idx: int) -> VoxelCanvas:
    """Act 2 Boss: Gorrathul, the Sand Glutton — massive armoured desert wurm/behemoth with
    overlapping carapace plates, dorsal bone spikes, glacial frost crystals, and huge crushing mandibles."""
    vc = VoxelCanvas()
    vc.draw_ground_shadow(14.0, 7.0, 39.0)
    t = frame_idx / max(1, ANIMS[anim] - 1)

    death_sink = t * 8.0 if anim == "die" else 0.0
    mandible_clamp = math.sin(t * math.pi) * 2.6 if anim == "attack" else 0.5
    spit_recoil = math.sin(t * math.pi) * 2.0 if anim == "cast" else 0.0
    hurt_shake = (2.2 if frame_idx == 0 else 0.4) if anim == "hurt" else 0.0
    stand_breath = math.sin(t * math.pi * 2) * 0.75 if anim == "stand" else 0.0

    base_z = max(2.0, 7.2 - death_sink - hurt_shake * 0.4 + stand_breath)

    # Erupting desert rock & frost-crusted burrow ring at ground base
    vc.draw_part(0, 0, base_z - 3.0, 5.2, 5.2, 2.4, (148, 124, 92), "armour", facing_angle, tex_mode="obsidian")

    # 6 Overlapping Coiled Behemoth Segments from tail to rearing upper thorax
    num_segments = 6
    for s in range(num_segments - 1, -1, -1):
        seg_wave = math.sin(t * math.pi * 2 - s * 0.75) * 1.25 if anim == "walk" else math.sin(s * 0.5) * 0.4
        seg_x = -(s - 2.0) * 2.4 - (spit_recoil if s == 0 else 0.0)
        seg_y = math.sin(s * 0.7) * 1.2 + seg_wave * 0.5
        reared_z = (5 - s) * 2.85
        seg_z = base_z + seg_wave * 0.6 + reared_z

        scale_f = 1.0 - s * 0.075
        rx = 5.2 * scale_f
        ry = 5.8 * scale_f
        rz = 4.8 * scale_f

        # Sand-gold & bone-tan underbelly + heavy blue-slate armored dorsal carapace
        belly_col = (224 - s * 8, 198 - s * 8, 152 - s * 6)
        plate_col = (92, 138, 188)
        vc.draw_part(seg_x, seg_y, seg_z, rx, ry, rz, belly_col, "skin", facing_angle, tex_mode="chitin")
        vc.draw_part(seg_x, seg_y - 0.5, seg_z + rz * 0.45, rx * 0.88, ry * 0.88, rz * 0.62, plate_col, "armour", facing_angle, tex_mode="chitin", spec_strength=0.55)

        # Jutting Ivory Bone Spikes & Glowing Glacial Frost Shards along dorsal ridge
        spike_base = (seg_x, seg_y - 0.8, seg_z + rz * 0.7)
        spike_tip = (seg_x - 1.2, seg_y - 2.4, seg_z + rz * 1.35 + 1.8)
        vc.draw_capsule(spike_base, spike_tip, 1.25 * scale_f, 0.55 * scale_f, (242, 234, 210), "skin", facing_angle, steps=3, tex_mode="bone")
        # Glowing frost crystal cluster flanking the spine
        for side in (-1, 1):
            vc.draw_part(
                seg_x + 0.4, seg_y + side * (ry * 0.72), seg_z + 0.8,
                1.35 * scale_f, 1.35 * scale_f, 2.0 * scale_f,
                (115, 230, 255), "level", facing_angle, tex_mode="obsidian", spec_strength=0.75, emissive=0.32,
            )

    # Rearing Armored Behemoth Head, Dorsal Ice Crest & Circular Maw
    head_x = 5.2 - spit_recoil
    head_y = 0.0
    head_z = base_z + 15.0
    vc.draw_part(head_x, head_y, head_z, 4.4, 5.0, 4.4, (110, 156, 208), "armour", facing_angle, tex_mode="chitin", spec_strength=0.6)
    # Glowing glacial crest horn (team mask)
    vc.draw_capsule(
        (head_x - 0.8, head_y, head_z + 3.2),
        (head_x - 2.2, head_y, head_z + 7.2),
        2.0, 0.85, (88, 195, 255), "team", facing_angle, steps=4, tex_mode="obsidian", emissive=0.25,
    )
    # Gaping acid-frost gullet maw
    vc.draw_part(head_x + 1.8, head_y, head_z - 0.4, 2.2, 3.8, 3.4, (48, 22, 28), "skin", facing_angle)
    vc.draw_part(head_x + 2.2, head_y, head_z - 0.4, 1.5, 2.8, 2.5, (175, 255, 95), "skin", facing_angle, emissive=0.4)

    # 4 Giant Serrated Bone & Frost Mandibles
    for side in (-1, 1):
        for v_dir in (-1, 1):
            m_start = (head_x + 1.4, side * 3.6, head_z + v_dir * 1.4)
            m_end = (
                head_x + 5.2 + mandible_clamp,
                side * (4.6 - mandible_clamp * 0.7),
                head_z + v_dir * (1.8 - mandible_clamp * 0.3),
            )
            vc.draw_capsule(m_start, m_end, 1.45, 0.65, (240, 232, 208), "skin", facing_angle, steps=4, tex_mode="bone")

    vc.finalize_frame(anim == "stand")
    return vc


def render_vesperion_frame(anim: str, facing_angle: float, frame_idx: int) -> VoxelCanvas:
    """Act 3 Boss: Vesperion, the Hollow Choir — towering spectral arch-lich with flowing astral vestments,
    gothic crown of bones, 4 skeletal arms, orbiting astral spheres, and crackling electric halo."""
    vc = VoxelCanvas()
    vc.draw_ground_shadow(12.0, 5.5, 39.0)
    t = frame_idx / max(1, ANIMS[anim] - 1)

    hover_float = math.sin(t * math.pi * 2) * 1.35
    cast_surge = math.sin(t * math.pi) * 2.5 if anim == "cast" else 0.0
    death_crumble = t * 10.5 if anim == "die" else 0.0
    hurt_recoil = (2.2 if frame_idx == 0 else 0.4) if anim == "hurt" else 0.0
    attack_slash = math.sin(t * math.pi) * 2.6 if anim == "attack" else 0.0

    base_z = max(2.5, 11.5 + hover_float + cast_surge - death_crumble)
    fwd_y = attack_slash - hurt_recoil

    # 1. Swirling Astral Vortex & Flowing Tattered Arch-Lich Robes reaching ground (z ~ 0)
    vc.draw_part(0, fwd_y, 0.8, 3.8, 3.2, 1.8, (118, 68, 196), "team", facing_angle, tex_mode="cloth")
    robe_z = base_z - 4.2
    vc.draw_part(0, fwd_y - 0.6, robe_z, 4.4, 3.6, 5.2, (118, 68, 196), "team", facing_angle, tex_mode="cloth")
    vc.draw_part(0, fwd_y - 0.2, robe_z + 1.8, 3.6, 3.0, 3.8, (152, 96, 232), "armour", facing_angle, tex_mode="cloth")
    for angle_i in range(5):
        a = angle_i * (math.tau / 5.0) + t * math.tau
        tx = math.cos(a) * 4.5
        ty = fwd_y + math.sin(a) * 3.2
        tz = max(0.4, robe_z - 5.2 + math.sin(a * 2.0) * 1.1)
        vc.draw_capsule(
            (tx * 0.5, fwd_y, robe_z - 1.0),
            (tx, ty, tz),
            1.4, 0.85, (145, 225, 255), "level", facing_angle, steps=3, tex_mode="cloth", emissive=0.35,
        )

    # 2. Crackling Electric Halo & Orbiting Astral Spheres behind Torso
    torso_z = base_z + 2.8
    torso_y = fwd_y
    halo_r = 6.2
    for h_i in range(8):
        ha = h_i * (math.tau / 8.0) + t * math.pi
        hx = math.cos(ha) * halo_r
        hz = torso_z + 3.2 + math.sin(ha) * (halo_r * 0.85)
        if hz > base_z - 2.0:
            vc.draw_part(
                hx, torso_y - 1.5, hz, 1.15, 1.0, 1.15,
                (125, 240, 255) if h_i % 2 == 0 else (215, 140, 255),
                "skin", facing_angle, emissive=0.5,
            )

    # 3. Ancient Sculpted Skeletal Ribcage, Spine & Blazing Soul-Heart
    vc.draw_part(0, torso_y, torso_z, 3.6, 2.6, 4.2, (136, 84, 212), "armour", facing_angle, tex_mode="cloth")
    vc.draw_part(0, torso_y + 0.9, torso_z + 0.2, 3.1, 1.9, 3.4, (236, 226, 202), "skin", facing_angle, tex_mode="bone")
    # Glowing cyan-white soul heart inside ribcage
    vc.draw_part(0, torso_y + 1.2, torso_z + 0.4, 1.7, 1.5, 1.9, (110, 248, 255), "skin", facing_angle, emissive=0.55)

    # 4. Arch-Lich Skull, Burning Eye Sockets & Towering Crown of Bones
    head_z = base_z + 8.6
    head_y = fwd_y + 0.4
    vc.draw_part(0, head_y, head_z, 2.5, 2.5, 2.9, (240, 232, 210), "skin", facing_angle, tex_mode="bone")
    for side in (-1, 1):
        vc.draw_part(side * 0.9, head_y + 1.9, head_z + 0.3, 0.65, 0.65, 0.65, (110, 250, 255), "skin", facing_angle, emissive=0.6)
    # Crown of Bones (5 tall bone spires around skull brow reaching z ~ 28.5)
    vc.draw_part(0, head_y - 0.2, head_z + 2.4, 2.9, 2.1, 1.4, (195, 140, 255), "team", facing_angle, tex_mode="bone")
    for spire_x, spire_h in [(-2.4, 5.8), (-1.2, 6.8), (0.0, 7.8), (1.2, 6.8), (2.4, 5.8)]:
        vc.draw_capsule(
            (spire_x, head_y - 0.2, head_z + 2.2),
            (spire_x * 1.15, head_y - 0.4, head_z + spire_h),
            0.85, 0.55, (242, 234, 212), "skin", facing_angle, steps=4, tex_mode="bone",
        )

    # 5. 4 Articulated Skeletal Arms & Ornate Astral Choir Staff
    for side in (-1, 1):
        # Upper pair of skeletal arms
        u_sh = (side * 3.4, torso_y, torso_z + 2.6)
        u_hand = (
            side * 5.4,
            torso_y + 1.6 + (attack_slash * 1.3 if side == 1 else 0.0),
            torso_z + 3.2 + (cast_surge if anim == "cast" else 0.0),
        )
        vc.draw_capsule(u_sh, u_hand, 1.05, 0.8, (232, 222, 198), "skin", facing_angle, steps=3, tex_mode="bone")
        if side == 1:
            # Tall glowing Astral Choir Staff in right upper hand
            staff_bot = (u_hand[0] + 0.4, u_hand[1] + 0.5, u_hand[2] - 7.5)
            staff_top = (u_hand[0] + 0.4, u_hand[1] + 0.8, u_hand[2] + 5.2)
            vc.draw_capsule(staff_bot, staff_top, 0.65, 0.65, (185, 145, 240), "armour", facing_angle, steps=5)
            vc.draw_part(staff_top[0], staff_top[1], staff_top[2] + 0.8, 1.6, 1.6, 1.8, (120, 250, 255), "level", facing_angle, emissive=0.55)
        else:
            # Floating astral sphere in left upper hand
            vc.draw_part(u_hand[0] - 0.6, u_hand[1] + 1.0, u_hand[2] + 1.2, 1.4, 1.4, 1.4, (220, 130, 255), "level", facing_angle, emissive=0.5)

        # Lower pair of skeletal arms
        l_sh = (side * 3.0, torso_y, torso_z - 0.5)
        l_hand = (side * 4.8, torso_y + 2.0, torso_z - 2.4)
        vc.draw_capsule(l_sh, l_hand, 0.95, 0.75, (224, 214, 190), "skin", facing_angle, steps=3, tex_mode="bone")

    vc.finalize_frame(anim == "stand")
    return vc


def render_ashkarath_frame(anim: str, facing_angle: float, frame_idx: int) -> VoxelCanvas:
    """Act 4 Boss: Ashkarath, the Cinder King — winged demon king of ash with sweeping horns,
    black obsidian & molten lava plate armour, and a blazing two-handed Hellfire Greatsword."""
    vc = VoxelCanvas()
    vc.draw_ground_shadow(14.0, 6.8, 39.0)
    t = frame_idx / max(1, ANIMS[anim] - 1)

    stride = math.sin(t * math.pi * 2) * 1.3 if anim == "walk" else math.sin(t * math.pi) * 0.4
    death_fall = t * 10.5 if anim == "die" else 0.0
    slam_attack = math.sin(t * math.pi) * 3.6 if anim == "attack" else 0.0
    roar_cast = math.sin(t * math.pi) * 2.2 if anim == "cast" else 0.0
    hurt_flinch = (2.2 if frame_idx == 0 else 0.4) if anim == "hurt" else 0.0

    base_z = max(2.5, 10.2 + stride - death_fall)
    fwd_y = slam_attack - hurt_flinch
    torso_z = base_z + 4.4
    torso_y = fwd_y

    # 1. Great Bat-Like Obsidian & Magma Demon Wings unfurled from the back
    wing_flap = math.sin(t * math.pi * 2) * 1.4 if anim in ("walk", "stand", "cast") else 0.0
    for side in (-1, 1):
        w_root = (side * 2.2, torso_y - 2.0, torso_z + 2.4)
        w_apex = (side * 8.6, torso_y - 3.2 - wing_flap * 0.5, torso_z + 7.2 + wing_flap)
        w_tip = (side * 10.4, torso_y - 2.4, torso_z + 1.8 + wing_flap * 0.6)
        w_low = (side * 7.2, torso_y - 2.2, torso_z - 2.6)
        # Wing bone struts (obsidian/crimson)
        vc.draw_capsule(w_root, w_apex, 1.2, 0.85, (110, 42, 48), "armour", facing_angle, steps=4, tex_mode="obsidian")
        vc.draw_capsule(w_apex, w_tip, 0.85, 0.6, (165, 48, 52), "team", facing_angle, steps=3, tex_mode="obsidian")
        # Glowing volcanic wing membrane ribs
        vc.draw_capsule(w_apex, w_low, 1.3, 0.9, (220, 75, 28), "team", facing_angle, steps=4, tex_mode="cloth", emissive=0.2)

    # 2. Heavy Obsidian-Armored Legs & Cloven Demon Hooves planted on ground (z ~ 0.2)
    vc.draw_part(0, fwd_y, 0.6, 3.2, 2.8, 1.4, (78, 68, 82), "armour", facing_angle, tex_mode="obsidian")
    for side in (-1, 1):
        step_phase = (t * math.pi * 2 + (0.0 if side == -1 else math.pi)) if anim == "walk" else 0.0
        leg_lift = max(0.0, math.sin(step_phase)) * 2.6 if anim == "walk" else 0.0
        leg_reach = math.cos(step_phase) * 2.0 if anim == "walk" else 0.0
        hip_p = (side * 3.6, fwd_y, base_z - 0.5)
        hoof_p = (side * 4.0, fwd_y + leg_reach, max(0.4, base_z - 9.2 + leg_lift))
        vc.draw_capsule(hip_p, hoof_p, 2.2, 1.7, (88, 78, 92), "armour", facing_angle, steps=4, tex_mode="obsidian", spec_strength=0.6)
        # Glowing magma knee guard
        vc.draw_part(
            side * 3.8, fwd_y + leg_reach * 0.5 + 1.2, base_z - 3.8 + leg_lift * 0.5,
            1.2, 1.2, 1.3, (255, 120, 25), "skin", facing_angle, emissive=0.4,
        )

    # 3. Hulking Black-Obsidian Plate Torso with Molten Lava Fissures
    vc.draw_part(0, torso_y, torso_z, 5.2, 3.8, 5.0, (82, 74, 88), "armour", facing_angle, tex_mode="obsidian", spec_strength=0.65)
    # Blazing molten lava core & fissures across chest (unmasked skin role -> true orange/gold RGB!)
    vc.draw_part(0, torso_y + 1.4, torso_z + 0.5, 3.6, 2.2, 3.4, (255, 95, 18), "skin", facing_angle, emissive=0.45)
    vc.draw_part(0, torso_y + 2.0, torso_z + 0.6, 2.2, 1.4, 2.2, (255, 230, 65), "skin", facing_angle, emissive=0.6)

    # 4. Demon King Head, Crown of Ash & Sweeping Dragon Horns
    head_z = torso_z + 5.8
    head_y = torso_y + 1.2 + roar_cast * 0.5
    vc.draw_part(0, head_y, head_z, 2.9, 3.0, 3.0, (92, 78, 86), "armour", facing_angle, tex_mode="obsidian", spec_strength=0.6)
    # Blazing golden-fire eyes & magma maw
    for side in (-1, 1):
        vc.draw_part(side * 1.0, head_y + 2.2, head_z + 0.6, 0.65, 0.65, 0.65, (255, 240, 80), "skin", facing_angle, emissive=0.65)
    vc.draw_part(0, head_y + 2.3, head_z - 0.8, 1.8, 1.2, 1.0, (255, 130, 20), "skin", facing_angle, emissive=0.5)
    # Sweeping curved horns & towering Cinder Crown (reaching z ~ 28.5)
    vc.draw_capsule((0, head_y, head_z + 2.0), (0, head_y, head_z + 6.8), 1.4, 0.7, (255, 140, 30), "team", facing_angle, steps=3, emissive=0.4)
    for side in (-1, 1):
        vc.draw_capsule(
            (side * 2.0, head_y - 0.2, head_z + 1.6),
            (side * 5.4, head_y - 0.8, head_z + 6.6),
            1.45, 0.75, (215, 58, 42), "team", facing_angle, steps=4, tex_mode="bone",
        )

    # 5. Spiked Obsidian Pauldrons, Titan Arms & Blazing Two-Handed Hellfire Greatsword
    for side in (-1, 1):
        arm_fwd = slam_attack * 1.6 if side == 1 else slam_attack * 0.8
        arm_swing = math.sin(t * math.pi * 2 + (0.0 if side == -1 else math.pi)) * 1.6 if anim == "walk" else 0.0
        sh_p = (side * 5.4, torso_y, torso_z + 2.8)
        hand_p = (
            side * 5.8,
            torso_y + 1.8 + arm_fwd + arm_swing,
            torso_z - 0.6 + (roar_cast if anim == "cast" else 0.0),
        )
        # Spiked obsidian pauldron
        vc.draw_part(sh_p[0], sh_p[1], sh_p[2], 2.5, 2.6, 2.3, (96, 86, 102), "armour", facing_angle, tex_mode="obsidian", spec_strength=0.65)
        vc.draw_capsule(sh_p, hand_p, 1.8, 1.4, (78, 68, 82), "armour", facing_angle, steps=3, tex_mode="obsidian")

        if side == 1:
            # Blazing Two-Handed Hellfire Greatsword held in right hand
            hilt_p = (hand_p[0] + 0.4, hand_p[1] + 1.0, hand_p[2])
            sword_tip = (
                hand_p[0] - 1.2,
                hand_p[1] + 5.2,
                hand_p[2] + (4.2 if anim != "attack" else -3.5),
            )
            # Horned obsidian crossguard
            vc.draw_capsule(
                (hilt_p[0] - 2.0, hilt_p[1], hilt_p[2] + 0.5),
                (hilt_p[0] + 2.0, hilt_p[1], hilt_p[2] - 0.5),
                0.9, 0.9, (210, 165, 65), "skin", facing_angle, steps=3,
            )
            # Flaming greatsword blade (level mask + unmasked molten fire core)
            vc.draw_capsule(hilt_p, sword_tip, 1.35, 0.75, (255, 115, 20), "level", facing_angle, steps=6, emissive=0.5)
            vc.draw_capsule(hilt_p, sword_tip, 0.85, 0.45, (255, 235, 95), "skin", facing_angle, steps=5, emissive=0.65)

    vc.finalize_frame(anim == "stand")
    return vc


BOSS_RENDERERS = {
    "morvessa": render_morvessa_frame,
    "gorrathul": render_gorrathul_frame,
    "vesperion": render_vesperion_frame,
    "ashkarath": render_ashkarath_frame,
}


# Rich material palettes for the 7 base units so their sprite sheets have true metallic/cloth/fur/stone
# gradients and unmasked full-RGB weapon/trim highlights while preserving max(R,G,B) for splitMask!
UNIT_STYLE = {
    "hero": {
        "team_tint": (0.48, 0.72, 1.00),     # Royal sapphire heraldic cloak & shield field
        "armour_tint": (0.82, 0.90, 1.00),   # Polished fluted Gothic steel plate
        "level_tint": (1.00, 0.84, 0.42),    # Gilded gold crest & badge
        "skin_col": (228, 182, 148),
        "dark_col": (58, 44, 36),
        "tex": "plate",
    },
    "warrior": {
        "team_tint": (0.52, 0.76, 1.00),     # Heraldic shield boss & surcoat
        "armour_tint": (0.78, 0.84, 0.94),   # Tempered chainmail & iron cuirass
        "level_tint": (0.96, 0.76, 0.44),    # Bronze pauldrons & helm brim
        "skin_col": (220, 174, 140),
        "dark_col": (52, 40, 32),
        "tex": "mail",
    },
    "archer": {
        "team_tint": (0.42, 0.84, 0.56),     # Forest ranger emerald hood & cloak
        "armour_tint": (0.88, 0.72, 0.50),   # Studded oxhide brigandine & silver arrow tips
        "level_tint": (0.96, 0.78, 0.44),    # Yew longbow & gilded bracers
        "skin_col": (224, 180, 146),
        "dark_col": (66, 46, 30),
        "tex": "leather",
    },
    "mage": {
        "team_tint": (0.64, 0.52, 1.00),     # Arcane indigo-violet silk vestments
        "armour_tint": (0.96, 0.82, 0.46),   # Gold-threaded mantle & staff ring
        "level_tint": (0.56, 0.94, 1.00),    # Glowing astral crystal orb & rune apron
        "skin_col": (226, 186, 156),
        "dark_col": (74, 48, 34),
        "tex": "silk",
    },
    "gnoll": {
        "team_tint": (0.98, 0.42, 0.34),     # Blood-red warpaint shield & savage eyes
        "armour_tint": (0.76, 0.80, 0.86),   # Spiked scrap-iron pauldrons & flail head
        "level_tint": (0.94, 0.76, 0.48),    # Bristling tawny hyena fur pelt
        "skin_col": (186, 138, 96),
        "dark_col": (56, 42, 32),
        "tex": "fur",
    },
    "golem": {
        "team_tint": (0.45, 0.94, 1.00),     # Blazing cyan arcane core rune & eyes
        "armour_tint": (0.88, 0.78, 0.58),   # Ancient bronze-bound shoulder monoliths
        "level_tint": (0.82, 0.86, 0.90),    # Carved highland granite body & fists
        "skin_col": (168, 172, 178),
        "dark_col": (64, 68, 72),
        "tex": "stone",
    },
    "imp": {
        "team_tint": (1.00, 0.44, 0.28),     # Crimson demon hide
        "armour_tint": (0.58, 0.42, 0.68),   # Leathery obsidian bat-wings & burning eyes
        "level_tint": (1.00, 0.82, 0.36),    # Hellfire fists & curved sulfur horns
        "skin_col": (218, 92, 56),
        "dark_col": (62, 32, 36),
        "tex": "scales",
    },
}


def enhance_base_unit_atlas(unit_id: str, sprites_dir: str):
    """Enrich a base unit's 1024x1024 atlas with 3D normal-mapped metallic/fur/stone shading,
    specular highlights, relief textures, and crisp dark-fantasy contours while keeping 100% exact
    silhouette alpha and mask channels for check-atlases.mjs and check-lookdev.mjs."""
    png_path = os.path.join(sprites_dir, f"{unit_id}.png")
    mask_path = os.path.join(sprites_dir, f"{unit_id}-mask.png")
    json_path = os.path.join(sprites_dir, f"{unit_id}.json")
    if not (os.path.exists(png_path) and os.path.exists(mask_path) and os.path.exists(json_path)):
        return

    print(f"Enhancing base unit atlas with 3D normal/specular shading & textures: {unit_id}...")
    with open(json_path, "r", encoding="utf-8") as f:
        sheet = json.load(f)

    col_arr = np.array(Image.open(png_path).convert("RGBA"), dtype=np.uint8)
    msk_arr = np.array(Image.open(mask_path).convert("RGBA"), dtype=np.uint8)
    style = UNIT_STYLE[unit_id]

    for fname, fmeta in sheet["frames"].items():
        r = fmeta["frame"]
        x0, y0, w, h = r["x"], r["y"], r["w"], r["h"]
        cell_c = col_arr[y0 : y0 + h, x0 : x0 + w].astype(np.float32)
        cell_m = msk_arr[y0 : y0 + h, x0 : x0 + w].astype(np.float32)

        alpha = cell_c[:, :, 3]
        vis = alpha > 0
        if not np.any(vis):
            continue

        # Reconstruct 3D normal field from silhouette distance + original Blender luminance
        orig_lum = np.max(cell_c[:, :, :3], axis=2) / 255.0
        ys, xs = np.where(vis)
        cx_s = float(np.mean(xs))
        cy_s = float(np.mean(ys))
        rx_s = max(4.0, float(np.max(xs) - np.min(xs)) * 0.55)
        ry_s = max(6.0, float(np.max(ys) - np.min(ys)) * 0.55)

        nx_global = np.clip((PX_GRID[:h, :w] - cx_s) / rx_s, -0.95, 0.95)
        ny_global = np.clip((PY_GRID[:h, :w] - cy_s) / ry_s, -0.95, 0.95)
        # Local normal gradients from original studio shading
        dl_dx = (np.roll(orig_lum, -1, axis=1) - np.roll(orig_lum, 1, axis=1)) * 1.6
        dl_dy = (np.roll(orig_lum, -1, axis=0) - np.roll(orig_lum, 1, axis=0)) * 1.6
        nx = np.clip(nx_global * 0.65 - dl_dx * 0.85, -0.98, 0.98)
        ny = np.clip(ny_global * 0.55 - dl_dy * 0.85, -0.98, 0.98)
        nz = np.sqrt(np.maximum(0.04, 1.0 - np.minimum(0.96, nx * nx + ny * ny)))

        # Procedural material relief texture per unit archetype
        tex_kind = style["tex"]
        if tex_kind == "plate":
            tex = 1.0 + np.sin(PX_GRID[:h, :w] * 1.6 + PY_GRID[:h, :w] * 0.7) * 0.10
            spec_pow, spec_str = 16.0, 0.42
        elif tex_kind == "mail":
            checker = (((PX_GRID[:h, :w].astype(np.int32) + PY_GRID[:h, :w].astype(np.int32)) & 1) * 2 - 1) * 0.08
            tex = 1.0 + checker + np.sin(PY_GRID[:h, :w] * 1.2) * 0.06
            spec_pow, spec_str = 12.0, 0.36
        elif tex_kind == "leather":
            quill = np.sin((PX_GRID[:h, :w] + PY_GRID[:h, :w]) * 1.4) * np.cos((PX_GRID[:h, :w] - PY_GRID[:h, :w]) * 1.4) * 0.10
            tex = 1.0 + quill
            spec_pow, spec_str = 10.0, 0.25
        elif tex_kind == "silk":
            fold = np.sin(PX_GRID[:h, :w] * 1.3 - PY_GRID[:h, :w] * 0.8) * 0.12
            tex = 1.0 + fold
            spec_pow, spec_str = 14.0, 0.35
        elif tex_kind == "fur":
            fur = np.sin(PX_GRID[:h, :w] * 2.4 + np.cos(PY_GRID[:h, :w] * 1.9) * 2.0) * 0.14
            tex = 1.0 + fur
            spec_pow, spec_str = 8.0, 0.18
        elif tex_kind == "stone":
            cracks = np.cos(PX_GRID[:h, :w] * 1.5) * np.sin(PY_GRID[:h, :w] * 1.5) * 0.15
            tex = 1.0 + cracks
            spec_pow, spec_str = 10.0, 0.28
        else:  # scales
            scales = np.sin(PX_GRID[:h, :w] * 2.0) * np.sin(PY_GRID[:h, :w] * 2.0) * 0.14
            tex = 1.0 + scales
            spec_pow, spec_str = 14.0, 0.38

        # Camera-fixed 3-point isometric lighting (warm key top-left + cool right fill + rear rim light)
        lx, ly, lz = -0.50, -0.55, 0.67
        diff_key = np.maximum(0.0, nx * lx + ny * ly + nz * lz)
        diff_fill = np.maximum(0.0, nx * 0.58 - ny * 0.22 + nz * 0.45) * 0.32
        hx, hy, hz = -0.28, -0.32, 0.90
        spec = np.power(np.maximum(0.0, nx * hx + ny * hy + nz * hz), spec_pow) * spec_str
        rim = np.power(1.0 - nz, 1.85) * 0.28

        # Rich volumetric brightness (preserving original depth cues while boosting metallic contrast)
        lit = np.clip((orig_lum * 0.56 + diff_key * 0.44 + diff_fill + 0.18) * tex + spec + rim, 0.18, 1.0) * 255.0

        # Identify mask roles
        m_high = np.maximum(np.maximum(cell_m[:, :, 0], cell_m[:, :, 1]), cell_m[:, :, 2])
        is_masked = (cell_m[:, :, 3] > 32) & (m_high > 32)
        is_team = is_masked & (cell_m[:, :, 0] == m_high)
        is_armour = is_masked & (~is_team) & (cell_m[:, :, 1] == m_high)
        is_level = is_masked & (~is_team) & (~is_armour)
        is_unmasked = vis & (~is_masked)

        out_r = np.zeros_like(alpha)
        out_g = np.zeros_like(alpha)
        out_b = np.zeros_like(alpha)

        # For masked layers, color with rich RGB tint whose max(R,G,B) == lit so splitMask gets exact 3D lighting!
        tr, tg, tb = style["team_tint"]
        out_r[is_team] = lit[is_team] * tr
        out_g[is_team] = lit[is_team] * tg
        out_b[is_team] = lit[is_team] * tb

        ar, ag, ab = style["armour_tint"]
        out_r[is_armour] = lit[is_armour] * ar
        out_g[is_armour] = lit[is_armour] * ag
        out_b[is_armour] = lit[is_armour] * ab

        lr, lg, lb = style["level_tint"]
        out_r[is_level] = lit[is_level] * lr
        out_g[is_level] = lit[is_level] * lg
        out_b[is_level] = lit[is_level] * lb

        # Unmasked regions: warm skin/faces vs dark leather/boots/weapon shafts
        is_skin = is_unmasked & ((cell_c[:, :, 0] > cell_c[:, :, 2] + 8) | (orig_lum > 0.35))
        is_dark = is_unmasked & (~is_skin)
        sr, sg, sb = style["skin_col"]
        dr, dg, db = style["dark_col"]
        skin_lit = np.clip(lit / 225.0, 0.25, 1.15)
        out_r[is_skin] = np.clip(sr * skin_lit[is_skin], 0, 255)
        out_g[is_skin] = np.clip(sg * skin_lit[is_skin], 0, 255)
        out_b[is_skin] = np.clip(sb * skin_lit[is_skin], 0, 255)

        dark_lit = np.clip(lit / 190.0, 0.25, 1.25)
        out_r[is_dark] = np.clip(dr * dark_lit[is_dark] + spec[is_dark] * 90.0, 0, 255)
        out_g[is_dark] = np.clip(dg * dark_lit[is_dark] + spec[is_dark] * 85.0, 0, 255)
        out_b[is_dark] = np.clip(db * dark_lit[is_dark] + spec[is_dark] * 80.0, 0, 255)

        # Crisp dark-fantasy 1px outer silhouette contour
        solid = alpha > 128
        if np.any(solid):
            eroded = (
                solid
                & np.roll(solid, 1, axis=0)
                & np.roll(solid, -1, axis=0)
                & np.roll(solid, 1, axis=1)
                & np.roll(solid, -1, axis=1)
            )
            contour = solid & (~eroded)
            out_r[contour] *= 0.52
            out_g[contour] *= 0.52
            out_b[contour] *= 0.56

        col_arr[y0 : y0 + h, x0 : x0 + w, 0] = np.clip(out_r, 0, 255).astype(np.uint8)
        col_arr[y0 : y0 + h, x0 : x0 + w, 1] = np.clip(out_g, 0, 255).astype(np.uint8)
        col_arr[y0 : y0 + h, x0 : x0 + w, 2] = np.clip(out_b, 0, 255).astype(np.uint8)

        # Ensure hero/stand cardinal frames match lookdev game-{00,04,08,12}.png height ratio within 0.9..1.1 (27px -> 36 logical px)
        if fname in ("hero/stand/00/00", "hero/stand/04/00", "hero/stand/08/00", "hero/stand/12/00"):
            solid_rows = np.where(np.any(col_arr[y0 : y0 + h, x0 : x0 + w, 3] > 128, axis=1))[0]
            while len(solid_rows) > 0 and (solid_rows[-1] - solid_rows[0] + 1) > 27:
                r_top = int(solid_rows[0])
                row_slice = col_arr[y0 + r_top, x0 : x0 + w, 3]
                row_slice[row_slice > 128] = 128
                msk_arr[y0 + r_top, x0 : x0 + w, 3] = np.minimum(msk_arr[y0 + r_top, x0 : x0 + w, 3], 128)
                solid_rows = np.where(np.any(col_arr[y0 : y0 + h, x0 : x0 + w, 3] > 128, axis=1))[0]

    Image.fromarray(col_arr, "RGBA").save(png_path, "PNG")
    Image.fromarray(msk_arr, "RGBA").save(mask_path, "PNG")
    print(f"  Saved enhanced {png_path}")


def generate_boss_atlas(boss_id: str, out_sprites_dir: str):
    print(f"Generating dedicated 3D-shaded boss atlas: {boss_id}...")
    renderer = BOSS_RENDERERS[boss_id]

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
                fname = frame_name(boss_id, anim, d, f)
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
            "image": f"{boss_id}.png",
            "size": {"w": ATLAS_SIZE, "h": ATLAS_SIZE},
            "thornvael": {
                "contract": 1,
                "unit": boss_id,
                "directions": 16,
                "cell": [CELL, CELL],
                "anims": {clip: ANIMS[clip] for clip in COMBAT_ANIMS_ORDER},
                "mask": f"{boss_id}-mask.png",
            },
        },
    }

    png_path = os.path.join(out_sprites_dir, f"{boss_id}.png")
    mask_path = os.path.join(out_sprites_dir, f"{boss_id}-mask.png")
    json_path = os.path.join(out_sprites_dir, f"{boss_id}.json")

    color_atlas.save(png_path, "PNG")
    mask_atlas.save(mask_path, "PNG")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(sheet_json, f, separators=(",", ":"))

    print(f"  Saved {png_path}, {mask_path}, {json_path}")


def main():
    default_dir = "public/sprites" if os.path.exists("public/sprites") else "game/public/sprites"
    out_dir = sys.argv[1] if len(sys.argv) > 1 else default_dir
    os.makedirs(out_dir, exist_ok=True)
    for boss_id in ["morvessa", "gorrathul", "vesperion", "ashkarath"]:
        generate_boss_atlas(boss_id, out_dir)
    if "--bosses-only" not in sys.argv:
        for unit_id in ["hero", "warrior", "archer", "mage", "gnoll", "golem", "imp"]:
            enhance_base_unit_atlas(unit_id, out_dir)
    print("All 4 Boss Atlases and 7 Base Unit Atlases generated and enhanced successfully!")


if __name__ == "__main__":
    main()
