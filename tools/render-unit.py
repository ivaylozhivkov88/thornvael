"""Render original PILOT motion models: six clips x 16 directions, colour/RGB mask.

Run:  blender -b -P tools/render-unit.py -- <out_dir> [cell_px] [hero|archer|golem|warrior|mage|gnoll|imp]
Then: python tools/pack-atlas.py <out_dir> public/sprites <unit>
Contract: docs/SPRITE-CONTRACT.md.  The model is built from primitives here, so no outside files are used.
No external assets. Combat frame zero is contact/release, then recovery.
"""
import math
import os
import sys
import json
import time

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "render_out")
CELL = int(argv[1]) if len(argv) > 1 else 48
UNIT = argv[2] if len(argv) > 2 else "hero"
if UNIT not in ("hero", "archer", "golem", "warrior", "mage", "gnoll", "imp"):
    raise SystemExit("unknown unit: " + UNIT)
DIRECTIONS, ANIMS = 16, {"stand": 4, "walk": 8, "attack": 4, "cast": 4, "hurt": 2, "die": 4}
START = time.perf_counter()

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
cam_data.ortho_scale = 3.0  # replaced by one shared, analytically fitted scale below
cam_data.shift_y = 0.35  # ground origin at the contract's (0.5, 0.85) feet anchor
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
cam.location = (0, -6.0, 5.2)
cam.rotation_euler = (-cam.location).to_track_quat('-Z', 'Y').to_euler()
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
elif UNIT == "warrior":
    body.scale = (0.34, 0.22, 0.43)
    part("ico_sphere", "helm", (0, 0, 1.86), (0.26, 0.25, 0.19), "armour")
    part("cube", "helm_brim", (0, -0.02, 1.80), (0.29, 0.28, 0.045), "level")
    part("cube", "visor", (0, -0.22, 1.79), (0.05, 0.04, 0.09), "dark")
    for side in (-1, 1):
        part("ico_sphere", "shoulder", (side * 0.44, 0, 1.46), (0.20, 0.21, 0.16), "level")
    part("ico_sphere", "shield", (-0.49, -0.18, 1.05), (0.23, 0.10, 0.30), "armour")
    part("ico_sphere", "shield_bar", (-0.49, -0.27, 1.05), (0.10, 0.05, 0.11), "team")
    part("cube", "sword", (0.49, -0.15, 1.32), (0.042, 0.05, 0.48), "armour")
    part("cube", "guard", (0.49, -0.15, 0.96), (0.15, 0.07, 0.035), "level")
elif UNIT == "mage":
    body.scale = (0.26, 0.20, 0.44)
    body["role"] = "team"
    cape.scale = (0.30, 0.06, 0.48)
    cape["role"] = "level"
    armL["role"] = armR["role"] = "team"
    legL["role"] = legR["role"] = "armour"
    part("cube", "apron", (0, -0.21, 0.72), (0.14, 0.03, 0.36), "level")
    for side in (-1, 1):
        part("ico_sphere", "shoulder", (side * 0.39, 0, 1.46), (0.16, 0.17, 0.12), "armour")
    part("cube", "hat_brim", (0, 0, 1.89), (0.32, 0.32, 0.035), "team")
    part("cone", "hat_cone", (0, 0.02, 2.02), (0.19, 0.19, 0.19), "level")
    part("cube", "staff", (0.49, -0.15, 1.24), (0.03, 0.03, 0.56), "dark")
    part("ico_sphere", "staff_orb", (0.49, -0.15, 1.84), (0.11, 0.11, 0.11), "level")
    part("cube", "staff_ring", (0.49, -0.15, 1.72), (0.065, 0.065, 0.035), "armour")
elif UNIT == "gnoll":
    body.scale = (0.36, 0.24, 0.41)
    body["role"] = "level"
    head.scale = (0.22, 0.22, 0.21)
    head["role"] = "level"
    cape.scale = (0.26, 0.06, 0.34)
    cape["role"] = "armour"
    legL["role"] = legR["role"] = "level"
    armL["role"] = armR["role"] = "skin"
    part("cube", "snout", (0, -0.23, 1.72), (0.11, 0.13, 0.09), "skin")
    for side in (-1, 1):
        ear = part("cone", "ear", (side * 0.16, 0.02, 1.97), (0.06, 0.06, 0.14), "level")
        ear.rotation_euler[1] = side * 0.28
        part("cube", "eye", (side * 0.08, -0.21, 1.82), (0.038, 0.025, 0.032), "team")
        part("ico_sphere", "shoulder", (side * 0.44, 0, 1.44), (0.20, 0.20, 0.17), "armour")
    part("ico_sphere", "shield", (-0.49, -0.18, 1.04), (0.20, 0.09, 0.26), "team")
    part("cube", "shield_bar", (-0.49, -0.26, 1.04), (0.05, 0.03, 0.18), "armour")
    part("cube", "sword", (0.49, -0.15, 1.16), (0.035, 0.035, 0.34), "dark")
    part("ico_sphere", "guard", (0.49, -0.15, 1.54), (0.12, 0.12, 0.15), "armour")
elif UNIT == "imp":
    body.scale = (0.28, 0.19, 0.38)
    body["role"] = "team"
    head.scale = (0.20, 0.20, 0.20)
    head["role"] = "team"
    cape.scale = (0.18, 0.04, 0.22)
    cape["role"] = "armour"
    legL["role"] = legR["role"] = "level"
    armL["role"] = armR["role"] = "team"
    for side in (-1, 1):
        horn = part("cone", "horn", (side * 0.13, -0.02, 2.00), (0.055, 0.055, 0.16), "level")
        horn.rotation_euler[1] = side * 0.32
        part("cube", "eye", (side * 0.075, -0.19, 1.81), (0.04, 0.025, 0.03), "armour")
        wing = part("cube", "wing", (side * 0.34, 0.24, 1.46), (0.26, 0.025, 0.30), "armour")
        wing.rotation_euler[1] = -side * 0.38
        wing.rotation_euler[2] = side * 0.32
        part("ico_sphere", "fist", (side * 0.44, -0.06, 0.80), (0.14, 0.14, 0.16), "level")
elif UNIT == "golem":
    body.scale = (0.46, 0.30, 0.43)
    body.data.materials.clear()
    body["role"] = "level"
    head.scale = (0.30, 0.28, 0.23)
    head["role"] = "level"
    cape.scale = (0.31, 0.05, 0.21)
    # A visible original team rune: tiny eyes alone disappear into mask AA at 48px.
    part("cube", "chest_rune", (0, -0.32, 1.23), (0.13, 0.025, 0.18), "team")
    for side in (-1, 1):
        part("ico_sphere", "shoulder", (side * 0.52, 0, 1.47), (0.31, 0.32, 0.31), "armour")
        part("ico_sphere", "fist", (side * 0.56, -0.08, 0.78), (0.24, 0.25, 0.28), "level")
        part("cube", "eye", (side * 0.12, -0.26, 1.82), (0.06, 0.03, 0.045), "team")
    # Contain the planted feet around the unit point, including diagonal views.
    legL.scale = legR.scale = (0.15, 0.14, 0.40)
    legL.location.x, legR.location.x = -0.19, 0.19
    legL["role"] = legR["role"] = "level"
parts = [o for o in scene.objects if o.type == "MESH"]


def joint(name, loc, parent):
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    o.parent, o.location = parent, loc
    return o


def attach(obj, parent):
    """Preserve the model-space rest position when building the hinge hierarchy."""
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world
    bpy.context.view_layer.update()


# Hip, knee, shoulder, elbow and wrist hinges; all held objects inherit the hand.
torso = joint("spine_hinge", (0, 0, 0.9), root)
for p in parts:
    attach(p, torso)
arms, elbows, wrists, hips, knees = [], [], [], [], []
for side, arm, leg in ((-1, armL, legL), (1, armR, legR)):
    shoulder = joint("shoulder_hinge", (side * (0.52 if UNIT == "golem" else 0.42), 0, 0.55), torso)
    elbow = joint("elbow_hinge", (0, 0, -0.30), shoulder)
    wrist = joint("wrist_hinge", (0, 0, -0.30), elbow)
    attach(arm, shoulder)
    arm.location, arm.scale.z = (0, 0, -0.15), 0.15
    lower = part("cube", "forearm", (0, 0, 0), (0.10, 0.13, 0.15), "armour")
    lower.parent, lower.location = elbow, (0, 0, -0.15)
    hip = joint("hip_hinge", (leg.location.x, 0, 0.88), root)
    knee = joint("knee_hinge", (0, 0, -0.43), hip)
    attach(leg, hip)
    leg.location, leg.scale.z = (0, 0, -0.215), 0.215
    shin = part("cube", "shin", (0, 0, 0), (leg.scale.x, leg.scale.y, 0.215), leg["role"])
    shin.parent, shin.location = knee, (0, 0, -0.215)
    arms.append(shoulder)
    elbows.append(elbow)
    wrists.append(wrist)
    hips.append(hip)
    knees.append(knee)
for p in parts:
    name = p.name.split('.')[0]
    if name in ("shield", "shield_bar"):
        attach(p, wrists[0])
    elif name in ("sword", "guard", "bow", "bowstring", "staff", "staff_orb", "staff_ring"):
        attach(p, wrists[1])
    elif name == "fist":
        attach(p, wrists[0 if p.matrix_world.translation.x < 0 else 1])
    elif name == "shoulder":
        attach(p, arms[0 if p.matrix_world.translation.x < 0 else 1])
parts = [o for o in scene.objects if o.type == "MESH"]
rig = [o for o in scene.objects if o != cam]
rest = {o.name: (o.location.copy(), o.rotation_euler.copy(), o.scale.copy()) for o in rig}


def pose(anim, i, n):
    for o in rig:
        loc, rot, scale = rest[o.name]
        o.location, o.rotation_euler, o.scale = loc.copy(), rot.copy(), scale.copy()
    t = i / n
    wave = math.sin(t * 2 * math.pi)
    if anim == "stand":
        torso.location.z += (0, 0.055, 0, -0.035)[i]
        arms[1].rotation_euler.x = (0, 0.10, 0, -0.08)[i]
    elif anim == "walk":
        swing = wave * 0.65
        hips[0].rotation_euler.x, hips[1].rotation_euler.x = swing, -swing
        knees[0].rotation_euler.x = -max(0, -wave) * 0.65
        knees[1].rotation_euler.x = -max(0, wave) * 0.65
        arms[0].rotation_euler.x, arms[1].rotation_euler.x = -swing * 0.55, swing * 0.55
        torso.location.z += abs(wave) * 0.075
        torso.rotation_euler.z = math.cos(t * 2 * math.pi) * 0.09
    elif anim == "attack":
        # Downward-pointing arms rotate toward forward (-Y); frame 0 is extended.
        if UNIT == "archer":
            arms[1].rotation_euler.x = (-1.55, -1.35, -0.80, -0.25)[i]
            arms[0].rotation_euler.x = (-1.30, -0.95, -0.55, -0.20)[i]
            arms[0].rotation_euler.z = (0.65, 0.40, 0.15, 0)[i]
            elbows[0].rotation_euler.x = (-0.10, -0.70, -0.45, -0.10)[i]
        else:
            arms[1].rotation_euler.x = (-1.45, -0.85, -0.40, -0.10)[i]
            arms[1].rotation_euler.y = (-0.55, -0.10, 0.25, 0)[i]
            elbows[1].rotation_euler.x = (-0.10, -0.60, -0.80, -0.10)[i]
            arms[0].rotation_euler.x = (-0.80, -0.55, -0.30, -0.05)[i]
            if UNIT in ("hero", "warrior"):
                # Contact points down/forward; don't extend the blade horizontally
                # beyond a 48px cell and force every other clip to shrink.
                wrists[1].rotation_euler.x = (4.90, 1.50, 0.30, 0)[i]
            elif UNIT == "mage":
                wrists[1].rotation_euler.x = (0.70, 0.45, 0.20, 0)[i]
        torso.rotation_euler.z = (-0.24, -0.10, 0.13, 0)[i]
    elif anim == "cast":
        for j in (0, 1):
            arms[j].rotation_euler.x = (-1.80, -1.35, -0.85, -0.20)[i]
            arms[j].rotation_euler.y = (-1 if j == 0 else 1) * (0.45, 0.35, 0.20, 0.05)[i]
            elbows[j].rotation_euler.x = (-0.20, -0.45, -0.65, -0.15)[i]
        torso.rotation_euler.x = (-0.12, -0.06, 0.06, 0)[i]
    elif anim == "hurt":
        torso.rotation_euler.x = (-0.40, -0.10)[i]
        torso.rotation_euler.y = (0.18, 0.04)[i]
        arms[0].rotation_euler.x = (-0.65, -0.15)[i]
        elbows[1].rotation_euler.x = (-0.80, -0.20)[i]
    elif anim == "die":
        # Collapse about the hips. Terminal body is horizontal, never reset to standing.
        root.location.z = (0, -0.10, -0.35, -0.55)[i]
        torso.rotation_euler.x = (-0.20, -0.65, -1.15, -math.pi / 2)[i]
        hips[0].rotation_euler.x = (0.10, 0.40, 0.80, 1.35)[i]
        hips[1].rotation_euler.x = (-0.10, 0.15, 0.65, 1.20)[i]
        knees[0].rotation_euler.x = (-0.20, -0.65, -0.90, -0.70)[i]
        knees[1].rotation_euler.x = (-0.10, -0.35, -0.65, -0.45)[i]
        arms[0].rotation_euler.y = (-0.10, -0.40, -0.75, -1.10)[i]
        arms[1].rotation_euler.y = (0.10, 0.35, 0.60, 0.90)[i]
        # Lift the projected corpse footprint away from the low feet anchor.
        root.location.y += (0, 0.05, 0.15, 0.35)[i]
        root.location.z += (0, 0.05, 0.25, 0.60)[i]


def render(path, masked):
    for p in parts:
        p.data.materials.clear()
        p.data.materials.append((mask_mats if masked else mats)[p["role"]])
    scene.display.shading.light = "FLAT" if masked else "STUDIO"
    scene.display.shading.show_object_outline = not masked
    scene.display.shading.show_shadows = not masked
    scene.display.shading.show_cavity = False
    scene.display.shading.show_specular_highlight = not masked
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


os.makedirs(OUT, exist_ok=True)
# Preflight evaluated geometry with fixed camera size. Never zoom out to fit a
# combat pose: the 3.0 camera preserves the shipped neutral model's logical size.
required_scale = 0
clip_bounds = {}
camera_inverse = cam.rotation_euler.to_matrix().transposed()
for anim, n in ANIMS.items():
    bounds = [float('inf'), float('inf'), -float('inf'), -float('inf')]
    for d in range(DIRECTIONS):
        for i in range(n):
            pose(anim, i, n)
            root.rotation_euler.z = math.radians(-d * 22.5)
            bpy.context.view_layer.update()
            for p in parts:
                for vertex in p.bound_box:
                    point = camera_inverse @ (p.matrix_world @ Vector(vertex))
                    bounds = [min(bounds[0], point.x), min(bounds[1], point.y),
                              max(bounds[2], point.x), max(bounds[3], point.y)]
                    required_scale = max(required_scale, abs(point.x) / 0.44,
                                         point.y / 0.79, -point.y / 0.105)
    clip_bounds[anim] = bounds
if '--bounds-only' in argv:
    with open(os.path.join(OUT, 'bounds.json'), 'w') as f:
        json.dump(clip_bounds, f, indent=2)
    print('BOUNDS', UNIT, clip_bounds)
    raise SystemExit(0)
# Shared value must cover all three rigs; refuse drift if a model exceeds it.
SHARED_SCALE = 3.0
if required_scale > SHARED_SCALE:
    raise RuntimeError("pose bounds exceed shared camera: %.4f > %.4f" % (required_scale, SHARED_SCALE))
cam_data.ortho_scale = SHARED_SCALE
for anim, n in ANIMS.items():
    for d in range(DIRECTIONS):
        for i in range(n):
            pose(anim, i, n)
            root.rotation_euler[2] = math.radians(-d * 22.5)  # S, W, N, E
            base = os.path.join(OUT, "%s_%02d_%02d" % (anim, d, i))
            render(base + ".png", False)
            render(base + "_m.png", True)
report = {"unit": UNIT, "clips": ANIMS, "directions": DIRECTIONS, "frames": sum(ANIMS.values()) * DIRECTIONS,
          "cell": CELL, "orthoScale": SHARED_SCALE, "requiredScale": required_scale,
          "elapsedSeconds": time.perf_counter() - START, "source": "own procedural pilot primitives; no external assets",
          "blender": bpy.app.version_string, "contact": "attack/cast frame 0 is contact/release; remaining frames recover"}
with open(os.path.join(OUT, "render-report.json"), "w") as f:
    json.dump(report, f, indent=2)
print("rendered", report)
