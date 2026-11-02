"""Render one placeholder unit into 16 directions x (stand 4 + walk 8) frames, colour and mask.

Run:  blender -b -P tools/render-unit.py -- <out_dir> [cell_px]
Then: python tools/pack-atlas.py <out_dir> public/sprites <unit>
Contract: docs/SPRITE-CONTRACT.md.  The model is built from primitives here, so no outside files are used.
STATUS: written in slice 10.1, NOT yet run (Blender 5.2 not installed on the dev machine); first run in 10.1b.
"""
import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "render_out"
CELL = int(argv[1]) if len(argv) > 1 else 64
DIRECTIONS, ANIMS = 16, {"stand": 4, "walk": 8}

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = scene.render.resolution_y = CELL
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_object_outline = True
scene.display.shading.object_outline_color = (0.02, 0.02, 0.03)
scene.view_settings.view_transform = "Standard"

cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 2.6
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
cam.location = (0, -6.0, 5.2)
cam.rotation_euler = (math.radians(50), 0, 0)  # fixed 3/4 view
scene.camera = cam


def mat(name, rgb):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    return m


PALETTE = {"skin": (0.80, 0.62, 0.50), "team": (0.75, 0.10, 0.10), "armour": (0.55, 0.57, 0.62), "level": (0.30, 0.55, 0.30), "dark": (0.12, 0.10, 0.10)}
MASKS = {"skin": (0, 0, 0), "team": (1, 0, 0), "armour": (0, 1, 0), "level": (0, 0, 1), "dark": (0, 0, 0)}
mats = {k: mat(k, v) for k, v in PALETTE.items()}
mask_mats = {k: mat("m_" + k, v) for k, v in MASKS.items()}


def part(kind, name, loc, scale, role):
    getattr(bpy.ops.mesh, "primitive_%s_add" % kind)()
    o = bpy.context.active_object
    o.name, o.location, o.scale = name, loc, scale
    o.data.materials.append(mats[role])
    o["role"] = role
    return o


root = bpy.data.objects.new("root", None)
scene.collection.objects.link(root)
body = part("cube", "torso", (0, 0, 1.15), (0.32, 0.20, 0.42), "armour")
head = part("uv_sphere", "head", (0, 0, 1.78), (0.20, 0.20, 0.22), "skin")
cape = part("cube", "cape", (0, 0.2, 1.1), (0.28, 0.04, 0.4), "team")
badge = part("cube", "badge", (0, -0.21, 1.3), (0.10, 0.02, 0.10), "level")
legL = part("cube", "legL", (-0.12, 0, 0.45), (0.10, 0.10, 0.45), "dark")
legR = part("cube", "legR", (0.12, 0, 0.45), (0.10, 0.10, 0.45), "dark")
parts = [body, head, cape, badge, legL, legR]
for p in parts:
    p.parent = root


def pose(anim, i, n):
    t = i / n
    swing = math.sin(t * 2 * math.pi) * 0.45 if anim == "walk" else 0.0
    bob = abs(math.sin(t * 2 * math.pi)) * 0.05 if anim == "walk" else math.sin(t * 2 * math.pi) * 0.015
    legL.rotation_euler[0], legR.rotation_euler[0] = swing, -swing
    body.location.z, head.location.z = 1.15 + bob, 1.78 + bob


def render(path, masked):
    for p in parts:
        p.data.materials.clear()
        p.data.materials.append((mask_mats if masked else mats)[p["role"]])
    scene.display.shading.light = "FLAT" if masked else "STUDIO"
    scene.display.shading.show_object_outline = not masked
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


os.makedirs(OUT, exist_ok=True)
for anim, n in ANIMS.items():
    for d in range(DIRECTIONS):
        root.rotation_euler[2] = math.radians(d * 22.5)  # 0 faces the camera, then clockwise
        for i in range(n):
            pose(anim, i, n)
            base = os.path.join(OUT, "%s_%02d_%02d" % (anim, d, i))
            render(base + ".png", False)
            render(base + "_m.png", True)
print("rendered", len(ANIMS), "animations to", OUT)
