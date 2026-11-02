"""Render an original unit into 16 directions x (stand 4 + walk 8), colour and mask.

Run:  blender -b -P tools/render-unit.py -- <out_dir> [cell_px] [hero|archer|golem]
Then: python tools/pack-atlas.py <out_dir> public/sprites <unit>
Contract: docs/SPRITE-CONTRACT.md.  The model is built from primitives here, so no outside files are used.
STATUS: run in slice 10.1b with Blender 5.2.3 LTS: 384 frame files in about 15 s at 64 px.
"""
import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "render_out")
CELL = int(argv[1]) if len(argv) > 1 else 64
UNIT = argv[2] if len(argv) > 2 else "hero"
if UNIT not in ("hero", "archer", "golem"):
    raise SystemExit("unknown unit: " + UNIT)
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
cam_data.ortho_scale = 3.0
cam_data.shift_y = 0.12
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
cam.location = (0, -6.0, 5.2)
cam.rotation_euler = (math.radians(50), 0, 0)  # fixed 3/4 view
scene.camera = cam


def mat(name, rgb):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    return m


PALETTE = {"skin": (0.80, 0.62, 0.50), "team": (0.72, 0.72, 0.72), "armour": (0.62, 0.62, 0.62), "level": (0.68, 0.68, 0.68), "dark": (0.12, 0.10, 0.10)}
MASKS = {"skin": (0, 0, 0), "team": (1, 0, 0), "armour": (0, 1, 0), "level": (0, 0, 1), "dark": (0, 0, 0)}
mats = {k: mat(k, v) for k, v in PALETTE.items()}
mask_mats = {k: mat("m_" + k, v) for k, v in MASKS.items()}


def part(kind, name, loc, scale, role):
    opts = {"subdivisions": 1} if kind == "ico_sphere" else {}
    getattr(bpy.ops.mesh, "primitive_%s_add" % kind)(**opts)
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
armL = part("cube", "armL", (-0.42, 0, 1.14), (0.10, 0.13, 0.30), "armour")
armR = part("cube", "armR", (0.42, 0, 1.14), (0.10, 0.13, 0.30), "armour")
if UNIT == "hero":
    part("ico_sphere", "helm", (0, 0.01, 1.87), (0.27, 0.25, 0.22), "armour")
    part("cube", "crest", (0, 0.04, 2.09), (0.055, 0.20, 0.10), "team")
    part("cube", "visor", (0, -0.20, 1.84), (0.16, 0.04, 0.035), "dark")
    part("ico_sphere", "shield", (-0.49, -0.19, 1.05), (0.28, 0.12, 0.40), "team")
    part("cube", "shield_bar", (-0.49, -0.31, 1.05), (0.04, 0.02, 0.27), "armour")
    part("cube", "sword", (0.49, -0.15, 1.35), (0.035, 0.05, 0.56), "armour")
    part("cube", "guard", (0.49, -0.15, 0.96), (0.14, 0.07, 0.035), "dark")
elif UNIT == "archer":
    body.scale = (0.23, 0.18, 0.34)
    cape.scale = (0.24, 0.07, 0.44)
    part("ico_sphere", "hood", (0, 0.07, 1.83), (0.27, 0.23, 0.30), "team")
    part("cube", "quiver", (0.20, 0.26, 1.32), (0.10, 0.10, 0.38), "dark")
    for x in (0.15, 0.22, 0.28):
        part("cube", "arrow", (x, 0.26, 1.67), (0.015, 0.015, 0.30), "armour")
    for j in range(7):
        a = -math.pi / 2 + j * math.pi / 6
        p = part("cube", "bow", (0.52, -0.12 - 0.25 * math.cos(a), 1.15 + 0.53 * math.sin(a)), (0.035, 0.035, 0.13), "level")
        p.rotation_euler[0] = -a
    part("cube", "bowstring", (0.52, -0.12, 1.15), (0.012, 0.012, 0.53), "dark")
else:
    body.scale = (0.46, 0.30, 0.43)
    body.data.materials.clear()
    body["role"] = "level"
    head.scale = (0.30, 0.28, 0.23)
    head["role"] = "level"
    cape.scale = (0.31, 0.05, 0.21)
    for side in (-1, 1):
        part("ico_sphere", "shoulder", (side * 0.52, 0, 1.47), (0.31, 0.32, 0.31), "armour")
        part("ico_sphere", "fist", (side * 0.56, -0.08, 0.78), (0.24, 0.25, 0.28), "level")
        part("cube", "eye", (side * 0.12, -0.26, 1.82), (0.06, 0.03, 0.045), "team")
    legL.scale = legR.scale = (0.19, 0.20, 0.40)
    legL.location.x, legR.location.x = -0.23, 0.23
    legL["role"] = legR["role"] = "level"
parts = [o for o in scene.objects if o.type == "MESH"]
for p in parts:
    p.parent = root
rest_z = {p.name: p.location.z for p in parts}


def pose(anim, i, n):
    t = i / n
    swing = math.sin(t * 2 * math.pi) * 0.45 if anim == "walk" else 0.0
    bob = abs(math.sin(t * 2 * math.pi)) * 0.05 if anim == "walk" else math.sin(t * 2 * math.pi) * 0.015
    legL.rotation_euler[0], legR.rotation_euler[0] = swing, -swing
    armL.rotation_euler[0], armR.rotation_euler[0] = -swing * 0.6, swing * 0.6
    for p in parts:
        if p not in (legL, legR):
            p.location.z = rest_z[p.name] + bob


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
        root.rotation_euler[2] = math.radians(-d * 22.5)  # S, W, N, E in screen space
        for i in range(n):
            pose(anim, i, n)
            base = os.path.join(OUT, "%s_%02d_%02d" % (anim, d, i))
            render(base + ".png", False)
            render(base + "_m.png", True)
print("rendered", len(ANIMS), "animations to", OUT)
