"""Render a mesh-based unit: 6 clips x 16 directions, colour + RGB mask, no rig (weighted rigid transforms).

Run:  blender -b -P tools/render-mesh-unit.py -- <out_dir> <unit> [cell_px=96] [models_dir] [--only=stand,attack]
Then: python tools/pack-atlas.py <out_dir> public/sprites <unit>   (contract: docs/SPRITE-CONTRACT.md)
Unit module: tools/mesh-units/<module>.py (see warrior.py for the API); UNITS maps unit id -> (module, variant).
"""
import importlib.util
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
flags = [a for a in argv if a.startswith("--")]
argv = [a for a in argv if not a.startswith("--")]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(argv[0])
UNIT = argv[1]
CELL = int(argv[2]) if len(argv) > 2 else 96
MODELS = argv[3] if len(argv) > 3 else os.path.join(HERE, "..", "..", "models")
UNITS = {"warrior": ("warrior", "warrior"), "hero": ("warrior", "hero"), "archer": ("archer", "archer"), "mage": ("mage", "mage")}
mod_name, variant = UNITS[UNIT]
spec = importlib.util.spec_from_file_location(mod_name, os.path.join(HERE, "mesh-units", mod_name + ".py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
DIRECTIONS, ANIMS = 16, {"stand": 4, "walk": 8, "attack": 4, "cast": 4, "hurt": 2, "die": 4}

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.render.resolution_x = sc.render.resolution_y = CELL
sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sh = sc.display.shading
sh.color_type = "VERTEX"
sc.view_settings.view_transform = "Standard"
info = mod.build(bpy, os.path.abspath(MODELS), variant)
o, H = info["obj"], info["H"]
me = o.data
REST = np.array([tuple(v.co) for v in me.vertices], dtype=np.float64)
for name, data in (("c", info["col"]), ("m", info["mask"])):
    ca = me.color_attributes.new(name, "BYTE_COLOR", "POINT")
    ca.data.foreach_set("color", np.array([(*c, 1.0) for c in data], dtype=np.float32).ravel())
wA = np.array(info["wA"])
wB = np.array(info["wB"])
hip = np.array([0, 0, info["hip"]])
x, z = REST[:, 0], REST[:, 2]
legw = np.clip((info["hip"] + 0.12 - z) / 0.25, 0, 1)
legw = legw * legw * (3 - 2 * legw)
side = np.clip(x / 0.07, -1, 1)  # +1 leg A, -1 leg B
wLA = legw * np.clip(side, 0, 1) + legw * (1 - np.abs(side)) * 0.5
wLB = legw * np.clip(-side, 0, 1) + legw * (1 - np.abs(side)) * 0.5
upw = np.clip((z - (info["hip"] - 0.15)) / 0.3, 0, 1)
upw = upw * upw * (3 - 2 * upw)
SC = H * 1.55
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = "ORTHO"
cam.data.ortho_scale = SC
cam.location = (0, -60, 50)
EL = math.atan2(50, 60)
cz = (0.35 * SC) / math.cos(EL)  # puts z=0 at 85% of the cell height
cam.rotation_euler = (-cam.location + Vector((0, 0, cz))).to_track_quat("-Z", "Y").to_euler()
pivot = bpy.data.objects.new("p", None)
sc.collection.objects.link(pivot)
o.parent = pivot


def rot(axis, a):
    return np.array(Matrix.Rotation(a, 3, axis))


def apply(P, w, R, c):
    return P + w[:, None] * ((P - c) @ R.T + c - P)


def pose(anim, i, n):
    t = i / n
    P = REST.copy()
    armA = 0.0
    twist = lean = bob = swing = die = 0.0
    if anim == "stand":
        bob = (0, 0.02, 0, -0.012)[i]
        armA = (0, 0.03, 0, -0.02)[i]
    elif anim == "walk":
        s = math.sin(t * 2 * math.pi)
        swing = s * 0.55
        bob = abs(s) * 0.04
        twist = math.cos(t * 2 * math.pi) * 0.07
        armA = s * 0.05
    elif anim == "attack":
        armA = mod.POSE["attack_a"][i]
        lean = (0.30, 0.18, 0.06, 0)[i]
        twist = (-0.25, -0.10, 0.10, 0)[i]
    elif anim == "cast":
        armA = mod.POSE["cast_a"][i]
        lean = (-0.12, -0.06, 0.04, 0)[i]
    elif anim == "hurt":
        lean = (-0.35, -0.10)[i]
        armA = mod.POSE["hurt_a"][i]
    elif anim == "die":
        die = (0.15, 0.45, 0.8, 1.0)[i]
    P = apply(P, wA, rot("X", armA), np.array(info["pivA"]))
    P = apply(P, wLA, rot("X", swing), hip)
    P = apply(P, wLB, rot("X", -swing), hip)
    P = apply(P, upw, rot("Z", twist) @ rot("X", lean), hip)
    P[:, 2] += upw * bob
    if die:
        P[:, 2] *= 1 - 0.5 * die  # collapse: shorter corpse stays inside the cell
        P[:, 1] *= 1 - 0.25 * die
        P = P @ rot("X", -math.pi / 2 * die).T
        P[:, 1] -= 0.5 * die
        P[:, 2] += mod.POSE.get("die_lift", 0.28) * die
    return P


def render(path, masked):
    key = "m" if masked else "c"
    me.color_attributes.active_color = me.color_attributes[key]
    me.color_attributes.render_color_index = list(me.color_attributes.keys()).index(key)
    sh.light = "FLAT" if masked else "STUDIO"
    sh.show_object_outline = not masked
    sh.show_shadows = not masked
    sh.show_cavity = not masked
    sh.show_specular_highlight = not masked
    if not masked:
        sh.object_outline_color = (0.02, 0.02, 0.03)
        sh.cavity_type = "BOTH"
        sh.cavity_ridge_factor = 1.0
        sh.cavity_valley_factor = 1.4
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


os.makedirs(OUT, exist_ok=True)
only = [f[7:].split(",") for f in flags if f.startswith("--only=")]
for anim, n in ANIMS.items():
    if only and anim not in only[0]:
        continue
    for i in range(n):
        me.vertices.foreach_set("co", pose(anim, i, n).astype(np.float32).ravel())
        me.update()
        for d in range(DIRECTIONS):
            pivot.rotation_euler = (0, 0, math.radians(-d * 22.5))
            bpy.context.view_layer.update()
            base = os.path.join(OUT, "%s_%02d_%02d" % (anim, d, i))
            render(base + ".png", False)
            render(base + "_m.png", True)
json.dump({"unit": UNIT, "cell": CELL, "clips": ANIMS, "directions": 16}, open(os.path.join(OUT, "render-report.json"), "w"))
print("done", UNIT)
