"""Generate dedicated, high-detail procedural voxel/raster sprite atlases for the 4 Act Bosses:
1. Act 1: Morvessa (Silk Widow) - multi-appendaged arachnid demon queen
2. Act 2: Gorrathul (Sand Glutton) - massive segmented burrowing grub with mandibles
3. Act 3: Vesperion (The Hollow Choir) - multi-armed floating skeletal tormentor with astral storm tendrils
4. Act 4: Ashkarath (Cinder King) - massive horned demonic terror titan with hellfire spikes

Contract: docs/SPRITE-CONTRACT.md (48x48 cells, 1024x1024 atlas, 16 directions, 6 clips, RGB masks).
Output: public/sprites/{boss}.png, public/sprites/{boss}-mask.png, public/sprites/{boss}.json
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

def frame_name(unit: str, anim: str, d: int, n: int) -> str:
    return f"{unit}/{anim}/{d:02d}/{n:02d}"

# Camera: isometric / top-down 3/4 view: pitch 35 degrees from vertical
ELEV = math.radians(35)
COS_ELEV = math.cos(ELEV)
SIN_ELEV = math.sin(ELEV)

def project_3d_point(x, y, z, facing_angle):
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
        self.color = np.zeros((CELL, CELL, 4), dtype=np.uint8)
        self.mask = np.zeros((CELL, CELL, 4), dtype=np.uint8)
        self.zbuf = np.full((CELL, CELL), -9999.0, dtype=np.float32)

    def draw_part(self, cx, cy, cz, rx, ry, rz, rgb, mask_type, facing_angle, alpha=255):
        """Draw 3D ellipsoid directly projected onto 2D pixel bounding box with shading."""
        scx_rel, scy_rel, depth_c = project_3d_point(cx, cy, cz, facing_angle)
        scx = 24.0 + scx_rel
        scy = 39.0 + scy_rel

        cos_a = abs(math.cos(facing_angle))
        sin_a = abs(math.sin(facing_angle))
        eff_rx = rx * cos_a + ry * sin_a
        eff_ry = (rx * sin_a + ry * cos_a) * SIN_ELEV + rz * COS_ELEV
        
        # Screen bounds strictly within [2, 45] to avoid cell border
        x0 = max(2, int(math.floor(scx - eff_rx - 0.5)))
        x1 = min(45, int(math.ceil(scx + eff_rx + 0.5)))
        y0 = max(2, int(math.floor(scy - eff_ry - 0.5)))
        y1 = min(45, int(math.ceil(scy + eff_ry + 0.5)))

        if x0 > x1 or y0 > y1:
            return

        inv_rx2 = 1.0 / (max(0.5, eff_rx) ** 2)
        inv_ry2 = 1.0 / (max(0.5, eff_ry) ** 2)

        lx, ly, lz = -0.55, -0.6, 0.75

        for py in range(y0, y1 + 1):
            dy = py - scy
            dy2 = dy * dy * inv_ry2
            if dy2 > 1.0:
                continue
            max_dx = math.sqrt(1.0 - dy2) * eff_rx
            px_start = max(x0, int(math.ceil(scx - max_dx)))
            px_end = min(x1, int(math.floor(scx + max_dx)))
            for px in range(px_start, px_end + 1):
                dx = px - scx
                d2 = dx * dx * inv_rx2 + dy2
                if d2 <= 1.0:
                    z_offset = math.sqrt(1.0 - d2) * ((rz + ry) * 0.5)
                    depth = depth_c + z_offset
                    if depth > self.zbuf[py, px]:
                        self.zbuf[py, px] = depth
                        
                        nx = dx / eff_rx
                        ny = dy / eff_ry
                        nz = math.sqrt(max(0.0, 1.0 - nx*nx - ny*ny))
                        
                        diff = max(0.15, (nx * lx + ny * ly + nz * lz))
                        lit = min(1.35, diff * 0.9 + 0.3)
                        
                        cr = int(min(255, rgb[0] * lit))
                        cg = int(min(255, rgb[1] * lit))
                        cb = int(min(255, rgb[2] * lit))
                        
                        self.color[py, px] = [cr, cg, cb, alpha]
                        
                        if mask_type == "team":
                            self.mask[py, px] = [255, 0, 0, 255]
                        elif mask_type == "armour":
                            self.mask[py, px] = [0, 255, 0, 255]
                        elif mask_type == "level":
                            self.mask[py, px] = [0, 0, 255, 255]
                        else:
                            self.mask[py, px] = [0, 0, 0, 255]


def render_morvessa_frame(anim: str, facing_angle: float, frame_idx: int) -> VoxelCanvas:
    vc = VoxelCanvas()
    t = frame_idx / max(1, ANIMS[anim] - 1)
    
    bob = math.sin(t * math.pi * 2) * 0.8 if anim in ("walk", "stand") else 0
    death_fall = t * 10.0 if anim == "die" else 0
    hurt_kick = (2.6 if frame_idx == 0 else 0.4) if anim == "hurt" else 0
    attack_lunge = math.sin(t * math.pi) * 3.2 if anim == "attack" else 0
    cast_float = math.sin(t * math.pi) * 1.8 if anim == "cast" else 0
    
    base_z = max(2.0, 10.5 + bob + cast_float - death_fall)
    fwd_y = attack_lunge - hurt_kick

    # Lower Body: Giant arachnid abdomen
    ab_z = base_z + 2.0
    ab_y = fwd_y - 4.2
    vc.draw_part(0, ab_y, ab_z, 5.8, 6.8, 5.2, (42, 24, 53), "armour", facing_angle)
    vc.draw_part(0, ab_y - 1.2, ab_z + 3.0, 3.2, 4.0, 2.0, (69, 208, 101), "level", facing_angle)
    vc.draw_part(0, ab_y + 0.8, ab_z - 2.2, 3.8, 4.2, 1.6, (32, 128, 53), "level", facing_angle)

    # 6 Arachnid Spidery Legs reaching ground at z ~ 0 (py ~ 39)
    for leg_i in range(6):
        side = -1 if leg_i % 2 == 0 else 1
        pos = leg_i // 2
        leg_y_off = (pos - 1) * 3.4
        step_phase = (t * math.pi * 2 + (leg_i * math.pi / 3)) if anim == "walk" else 0
        leg_lift = max(0.0, math.sin(step_phase)) * 2.5 if anim == "walk" else 0
        leg_reach = math.cos(step_phase) * 2.0 if anim == "walk" else 0
        
        ux = side * (5.4 + pos * 0.5)
        uy = fwd_y + leg_y_off + leg_reach * 0.5
        uz = base_z + 4.0 + leg_lift
        vc.draw_part(ux * 0.5, uy * 0.5, (base_z + uz)*0.5, 1.4, 1.4, 2.6, (28, 16, 36), "armour", facing_angle)
        
        lx = side * (8.0 + pos * 0.8)
        ly = fwd_y + leg_y_off + leg_reach
        lz = max(0.5, base_z - 7.5 + leg_lift)
        vc.draw_part(lx, ly, lz, 1.0, 1.0, 3.4, (18, 10, 24), "armour", facing_angle)
        vc.draw_part(lx * 1.05, ly, max(0.0, lz - 2.2), 0.8, 0.8, 1.2, (69, 208, 101), "level", facing_angle)

    # Upper Body: Slender Demonic Queen Torso
    torso_z = base_z + 8.5
    torso_y = fwd_y + 0.8
    vc.draw_part(0, torso_y, torso_z, 3.2, 2.5, 4.0, (184, 164, 164), "skin", facing_angle)
    vc.draw_part(0, torso_y + 0.4, torso_z - 0.5, 3.4, 2.6, 2.5, (60, 35, 75), "armour", facing_angle)

    # Crown of Horns & Head (height reaches z ~ 27-28 -> py ~ 13)
    head_z = torso_z + 5.8
    head_y = torso_y + 0.5
    vc.draw_part(0, head_y, head_z, 2.2, 2.2, 2.4, (200, 180, 180), "skin", facing_angle)
    vc.draw_part(0, head_y - 0.5, head_z + 2.0, 2.8, 1.6, 1.5, (160, 20, 40), "team", facing_angle)
    vc.draw_part(-2.4, head_y - 0.2, head_z + 3.2, 0.8, 0.8, 2.2, (140, 15, 30), "team", facing_angle)
    vc.draw_part(2.4, head_y - 0.2, head_z + 3.2, 0.8, 0.8, 2.2, (140, 15, 30), "team", facing_angle)
    vc.draw_part(-0.8, head_y + 1.8, head_z + 0.2, 0.5, 0.5, 0.5, (255, 30, 60), "level", facing_angle)
    vc.draw_part(0.8, head_y + 1.8, head_z + 0.2, 0.5, 0.5, 0.5, (255, 30, 60), "level", facing_angle)

    # Clawed Arms
    arm_swing = math.sin(t * math.pi * 2) * 1.8 if anim == "walk" else 0
    arm_reach = math.sin(t * math.pi) * 4.0 if anim == "attack" else math.sin(t * math.pi) * 2.5 if anim == "cast" else 0
    for side in (-1, 1):
        ax = side * 4.4
        ay = torso_y + (arm_reach if anim in ("attack", "cast") else side * arm_swing)
        az = torso_z + (2.0 if anim == "cast" else -0.8)
        vc.draw_part(ax, ay, az, 1.1, 1.3, 2.6, (170, 150, 150), "skin", facing_angle)
        vc.draw_part(ax + side * 0.4, ay + 1.0, az - 2.4, 1.1, 1.5, 1.1, (69, 208, 101), "level", facing_angle)

    return vc


def render_gorrathul_frame(anim: str, facing_angle: float, frame_idx: int) -> VoxelCanvas:
    vc = VoxelCanvas()
    t = frame_idx / max(1, ANIMS[anim] - 1)
    
    death_sink = t * 8.5 if anim == "die" else 0
    mandible_clamp = math.sin(t * math.pi) * 2.8 if anim == "attack" else 0.4
    spit_recoil = math.sin(t * math.pi) * 2.0 if anim == "cast" else 0
    hurt_shake = (2.5 if frame_idx == 0 else 0.4) if anim == "hurt" else 0
    stand_breath = math.sin(t * math.pi * 2) * 0.8 if anim == "stand" else 0
    
    base_z = max(1.5, 7.5 - death_sink - hurt_shake * 0.5 + stand_breath)

    # Central subterranean core (anchors bottom to py ~ 39 for all facings)
    vc.draw_part(0, 0, base_z - 3.2, 3.8, 3.8, 2.6, (80, 75, 70), "armour", facing_angle)
    # Central dorsal crest (anchors top to py ~ 12 for all facings)
    vc.draw_part(0, 0, base_z + 16.0, 2.2, 2.2, 3.2, (38, 95, 160), "team", facing_angle)

    num_segments = 5
    for s in range(num_segments - 1, -1, -1):
        seg_wave = math.sin(t * math.pi * 2 - s * 0.8) * 1.2 if anim == "walk" else 0
        seg_x = -(s - 1.5) * 3.4 - (spit_recoil if s == 0 else 0)
        seg_y = 0.0
        reared_z = (4 - s) * 3.6
        seg_z = base_z + seg_wave + reared_z
        
        scale_factor = 1.0 - (s * 0.10)
        rx = 4.8 * scale_factor
        ry = 5.6 * scale_factor
        rz = 5.2 * scale_factor
        
        color = (196 - s*10, 191 - s*8, 176 - s*8)
        vc.draw_part(seg_x, seg_y, seg_z, rx, ry, rz, color, "skin", facing_angle)
        vc.draw_part(seg_x, seg_y, seg_z + rz * 0.55, rx * 0.8, ry * 0.85, rz * 0.5, (50, 75, 100), "armour", facing_angle)
        # Glacial Spine Crystals
        vc.draw_part(seg_x, seg_y, seg_z + rz * 0.95, rx * 0.35, ry * 0.35, 2.8, (96, 200, 255), "level", facing_angle)
        
        if s in (1, 2, 3):
            for side in (-1, 1):
                cx = seg_x
                cy = side * (ry + 1.0)
                cz = max(0.5, seg_z - 2.2)
                vc.draw_part(cx, cy, cz, 1.4, 1.6, 1.2, (30, 62, 85), "team", facing_angle)

    # Rearing Head & Circular Maw
    head_x = 6.2 - spit_recoil
    head_y = 0.0
    head_z = base_z + 15.5
    vc.draw_part(head_x, head_y, head_z, 4.0, 4.6, 4.5, (40, 25, 25), "skin", facing_angle)
    vc.draw_part(head_x + 1.0, head_y, head_z, 2.0, 3.8, 3.5, (163, 192, 37), "level", facing_angle)
    # Head crest plate & horn spikes (team mask)
    vc.draw_part(head_x - 0.8, head_y, head_z + 4.0, 2.6, 4.0, 2.6, (28, 65, 120), "team", facing_angle)
    vc.draw_part(head_x - 1.2, head_y, head_z + 6.8, 1.4, 2.0, 2.8, (38, 95, 160), "team", facing_angle)

    # Giant Crushing Mandibles
    for side in (-1, 1):
        mx = head_x + 1.8 + mandible_clamp
        my = side * (4.8 - mandible_clamp * 0.5)
        mz = head_z
        vc.draw_part(mx, my, mz, 3.0, 1.8, 1.8, (45, 65, 88), "armour", facing_angle)
        vc.draw_part(mx + 2.5, my - side * 1.0, mz, 2.6, 1.2, 1.4, (96, 200, 255), "level", facing_angle)

    return vc


def render_vesperion_frame(anim: str, facing_angle: float, frame_idx: int) -> VoxelCanvas:
    vc = VoxelCanvas()
    t = frame_idx / max(1, ANIMS[anim] - 1)
    
    hover_float = math.sin(t * math.pi * 2) * 1.5
    cast_surge = math.sin(t * math.pi) * 3.0 if anim == "cast" else 0
    death_crumble = t * 12.0 if anim == "die" else 0
    hurt_recoil = (2.6 if frame_idx == 0 else 0.4) if anim == "hurt" else 0
    attack_slash = math.sin(t * math.pi) * 2.8 if anim == "attack" else 0

    base_z = max(2.0, 12.0 + hover_float + cast_surge - death_crumble)
    fwd_y = attack_slash - hurt_recoil

    # Tormented Skull
    head_z = base_z + 8.8
    head_y = fwd_y + 0.4
    vc.draw_part(0, head_y, head_z, 2.5, 2.5, 3.0, (216, 207, 184), "skin", facing_angle)
    # Burning astral eye sockets
    vc.draw_part(-0.9, head_y + 1.8, head_z + 0.4, 0.5, 0.5, 0.5, (168, 112, 255), "level", facing_angle)
    vc.draw_part(0.9, head_y + 1.8, head_z + 0.4, 0.5, 0.5, 0.5, (168, 112, 255), "level", facing_angle)
    # Horned Soul Crown (team mask)
    vc.draw_part(0, head_y - 0.4, head_z + 3.0, 3.0, 2.0, 1.5, (120, 45, 180), "team", facing_angle)
    vc.draw_part(-2.4, head_y - 0.4, head_z + 4.4, 0.7, 0.7, 2.4, (147, 112, 219), "team", facing_angle)
    vc.draw_part(2.4, head_y - 0.4, head_z + 4.4, 0.7, 0.7, 2.4, (147, 112, 219), "team", facing_angle)

    # Ancient Skeletal Ribcage & Torso
    torso_z = base_z + 2.8
    torso_y = fwd_y
    vc.draw_part(0, torso_y, torso_z, 3.5, 2.5, 4.0, (75, 40, 110), "armour", facing_angle)
    vc.draw_part(0, torso_y + 1.0, torso_z, 3.2, 1.8, 3.2, (210, 200, 175), "skin", facing_angle)
    vc.draw_part(0, torso_y + 0.7, torso_z - 0.4, 1.8, 1.5, 1.8, (128, 240, 255), "level", facing_angle)

    # Tattered Astral Robes & Tendrils
    robe_z = base_z - 4.5
    robe_rx = 4.0 + math.sin(t * math.pi * 2) * 0.5
    vc.draw_part(0, fwd_y - 0.8, robe_z, robe_rx, 3.0, 4.8, (45, 25, 75), "team", facing_angle)
    for angle_i in range(4):
        a = angle_i * (math.pi / 2) + t * math.pi * 2
        tx = math.cos(a) * 4.4
        ty = fwd_y + math.sin(a) * 3.0
        tz = max(0.2, robe_z - 5.0 + math.sin(a * 2) * 1.2)
        vc.draw_part(tx, ty, tz, 1.2, 1.2, 3.2, (168, 112, 255), "level", facing_angle)

    # 4 Skeletal Arms
    for side in (-1, 1):
        u_ax = side * 4.8
        u_ay = fwd_y + (attack_slash * 1.4 if side == 1 else 0)
        u_az = torso_z + 3.0 + (cast_surge if anim == "cast" else 0)
        vc.draw_part(u_ax, u_ay, u_az, 1.1, 1.2, 2.6, (200, 190, 170), "skin", facing_angle)
        if side == 1:
            vc.draw_part(u_ax + 1.4, u_ay + 3.2, u_az + 2.2, 0.8, 4.2, 1.4, (128, 240, 255), "level", facing_angle)
        
        l_ax = side * 4.2
        l_ay = fwd_y + 1.3
        l_az = torso_z - 2.4
        vc.draw_part(l_ax, l_ay, l_az, 1.0, 1.2, 2.2, (190, 180, 160), "skin", facing_angle)
        vc.draw_part(l_ax + side * 0.4, l_ay + 1.9, l_az - 1.3, 1.2, 1.5, 1.0, (147, 112, 219), "armour", facing_angle)

    return vc


def render_ashkarath_frame(anim: str, facing_angle: float, frame_idx: int) -> VoxelCanvas:
    vc = VoxelCanvas()
    t = frame_idx / max(1, ANIMS[anim] - 1)
    
    stride = math.sin(t * math.pi * 2) * 1.5 if anim == "walk" else math.sin(t * math.pi) * 0.4
    death_fall = t * 12.0 if anim == "die" else 0
    slam_attack = math.sin(t * math.pi) * 4.0 if anim == "attack" else 0
    roar_cast = math.sin(t * math.pi) * 2.6 if anim == "cast" else 0
    hurt_flinch = (2.6 if frame_idx == 0 else 0.4) if anim == "hurt" else 0

    base_z = max(2.0, 10.5 + stride - death_fall)
    fwd_y = slam_attack - hurt_flinch

    # Demonic Legs & Hooves
    for side in (-1, 1):
        step_phase = (t * math.pi * 2 + (0 if side == -1 else math.pi)) if anim == "walk" else 0
        leg_lift = max(0.0, math.sin(step_phase)) * 3.0 if anim == "walk" else 0
        leg_reach = math.cos(step_phase) * 2.2 if anim == "walk" else 0
        
        lx = side * 4.0
        ly = fwd_y + leg_reach
        lz = max(1.0, base_z - 6.0 + leg_lift)
        vc.draw_part(lx, ly, lz + 2.5, 2.2, 2.4, 3.2, (45, 25, 25), "armour", facing_angle)
        vc.draw_part(lx, ly + 0.7, lz - 1.5, 2.0, 2.4, 1.5, (30, 15, 15), "armour", facing_angle)

    # Hulking Volcanic Torso
    torso_z = base_z + 4.5
    torso_y = fwd_y
    vc.draw_part(0, torso_y, torso_z, 5.2, 3.8, 5.2, (54, 36, 36), "skin", facing_angle)
    # Molten Core fissures
    vc.draw_part(0, torso_y + 1.0, torso_z + 0.4, 4.0, 2.4, 3.8, (255, 69, 0), "level", facing_angle)
    vc.draw_part(0, torso_y + 1.5, torso_z + 0.4, 2.4, 1.4, 2.4, (255, 215, 0), "level", facing_angle)

    # Spine Spikes
    for spike_i in range(4):
        sz = torso_z - 1.8 + spike_i * 2.4
        sy = torso_y - 3.4 - spike_i * 0.3
        vc.draw_part(0, sy, sz, 1.2, 1.8, 2.2, (220, 20, 60), "team", facing_angle)

    # Demon Bull Head & Sweeping Horns
    head_z = torso_z + 6.0
    head_y = torso_y + 1.4 + roar_cast
    vc.draw_part(0, head_y, head_z, 3.0, 3.2, 3.2, (48, 28, 28), "skin", facing_angle)
    vc.draw_part(0, head_y + 2.2, head_z - 0.8, 2.2, 1.4, 1.2, (255, 140, 0), "level", facing_angle)
    vc.draw_part(-1.0, head_y + 1.9, head_z + 0.8, 0.5, 0.5, 0.5, (255, 220, 0), "level", facing_angle)
    vc.draw_part(1.0, head_y + 1.9, head_z + 0.8, 0.5, 0.5, 0.5, (255, 220, 0), "level", facing_angle)

    # Sweeping Horns (team mask)
    for side in (-1, 1):
        hx = side * 3.6
        hy = head_y - 0.4
        hz = head_z + 2.4
        vc.draw_part(hx, hy, hz, 1.5, 1.5, 2.0, (180, 20, 20), "team", facing_angle)
        vc.draw_part(hx + side * 1.8, hy + 0.4, hz + 3.2, 1.0, 1.0, 2.8, (220, 40, 20), "team", facing_angle)

    # Massive Titan Arms
    for side in (-1, 1):
        arm_fwd = slam_attack * 2.0 if side == 1 else 0
        arm_swing = math.sin(t * math.pi * 2 + (0 if side == -1 else math.pi)) * 2.0 if anim == "walk" else 0
        ax = side * 6.0
        ay = torso_y + arm_fwd + arm_swing
        az = torso_z + 2.0 + (roar_cast if anim == "cast" else 0)
        vc.draw_part(ax * 0.8, ay, az + 1.4, 2.4, 2.6, 2.4, (40, 20, 20), "armour", facing_angle)
        vc.draw_part(ax, ay + 0.4, az - 1.4, 2.0, 2.2, 3.0, (60, 35, 35), "skin", facing_angle)
        vc.draw_part(ax + side * 0.5, ay + 2.0, az - 4.0, 2.2, 2.4, 2.2, (255, 69, 0), "level", facing_angle)

    return vc


RENDERERS = {
    "morvessa": render_morvessa_frame,
    "gorrathul": render_gorrathul_frame,
    "vesperion": render_vesperion_frame,
    "ashkarath": render_ashkarath_frame,
}


def generate_boss_atlas(boss_id: str, out_sprites_dir: str):
    print(f"Generating dedicated boss atlas: {boss_id}...")
    renderer = RENDERERS[boss_id]
    
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
                    "anchor": {"x": 0.5, "y": 0.85}
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
                "mask": f"{boss_id}-mask.png"
            }
        }
    }

    png_path = os.path.join(out_sprites_dir, f"{boss_id}.png")
    mask_path = os.path.join(out_sprites_dir, f"{boss_id}-mask.png")
    json_path = os.path.join(out_sprites_dir, f"{boss_id}.json")
    
    color_atlas.save(png_path, "PNG")
    mask_atlas.save(mask_path, "PNG")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(sheet_json, f, separators=(",", ":"))
    
    print(f"  Saved {png_path}")
    print(f"  Saved {mask_path}")
    print(f"  Saved {json_path}")


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "public/sprites"
    os.makedirs(out_dir, exist_ok=True)
    for boss_id in ["morvessa", "gorrathul", "vesperion", "ashkarath"]:
        generate_boss_atlas(boss_id, out_dir)
    print("All 4 Boss Sprite Atlases generated successfully!")

if __name__ == "__main__":
    main()
