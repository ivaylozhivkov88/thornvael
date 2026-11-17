"""Warrior (and hero variant) built from a reference mesh plus a primitive weapon. Used by tools/render-mesh-unit.py.

API: build(bpy, models_dir, variant) returns a dict:
  obj (joined mesh, feet at z=0, centred), H, hip (z of hips), col/mask (per-vertex RGB lists),
  wA/wB (per-vertex arm group weights, A = weapon arm), pivA/pivB (shoulder pivots).
POSE holds per-frame angle overrides (rad) read by the renderer.
"""
import math
from mathutils import Vector, Quaternion

MESH = "diablo-ii-paladin20230315-90545-bnad2n/kaucukovnik/diablo-ii-paladin/Paladin_medium_01.stl"
POSE = {  # arm-group pitch about the shoulder (positive = tip forward and down)
    "attack_a": (2.2, 1.4, 0.6, 0.15),
    "cast_a": (-0.55, -0.35, -0.15, 0.0),
    "hurt_a": (-0.25, -0.05),
}


def sstep(a):
    a = max(0.0, min(1.0, a))
    return a * a * (3 - 2 * a)


def build(bpy, models_dir, variant="warrior"):
    bpy.ops.wm.stl_import(filepath=models_dir + "/" + MESH)
    o = bpy.context.selected_objects[0]
    me = o.data
    bb = [Vector(c) for c in o.bound_box]
    zmin = min(v.z for v in bb)
    H = max(v.z for v in bb) - zmin
    cx = (min(v.x for v in bb) + max(v.x for v in bb)) / 2
    cy = (min(v.y for v in bb) + max(v.y for v in bb)) / 2
    for v in me.vertices:
        v.co = Vector((v.co.x - cx, v.co.y - cy, v.co.z - zmin))
    o.location = (0, 0, 0)
    TARGET = {1: Vector((0.16, -0.30, 1.10)), -1: Vector((0.10, -0.30, 1.24))}
    REST = {1: Vector((0.36, 0.10, 1.08)), -1: Vector((-0.36, 0.10, 1.08))}
    SH = {1: Vector((0.30, 0.0, 1.62)), -1: Vector((-0.30, 0.0, 1.62))}
    restco = [v.co.copy() for v in me.vertices]
    armw = []
    for v in me.vertices:
        p = v.co.copy()
        wmax = 0.0
        for s in (1, -1):
            w = sstep((abs(p.x) - 0.24) / 0.10) * (1 if p.x * s > 0 else 0)
            w *= sstep((1.74 - p.z) / 0.18) * sstep((p.z - 0.70) / 0.15)
            if w > 0:
                a = (REST[s] - SH[s]).normalized()
                b = (TARGET[s] - SH[s]).normalized()
                q = Quaternion((1, 0, 0, 0)).slerp(a.rotation_difference(b), w)
                p = SH[s] + q @ (p - SH[s])
                wmax = max(wmax, w)
        v.co = p
        armw.append(wmax)
    parts = []

    def addpart(kind, loc, scale, col, rot=(0, 0, 0)):
        if kind == "cube":
            bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
        elif kind == "cyl":
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.5, depth=1, location=loc, rotation=rot)
        elif kind == "cone":
            bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.5, radius2=0, depth=1, location=loc, rotation=rot)
        elif kind == "sph":
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.5, location=loc, rotation=rot)
        b = bpy.context.object
        b.scale = scale
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        parts.append((b, col))

    SX, SY = 0.14, -0.31
    BLD = (0.80, 0.84, 0.90); DRK = (0.45, 0.48, 0.54); COP = (0.72, 0.42, 0.20); LEA = (0.28, 0.16, 0.08)
    addpart("cube", (SX, SY, 1.84), (0.14, 0.025, 1.0), BLD)
    addpart("cube", (SX, SY - 0.012, 1.80), (0.03, 0.012, 0.85), DRK)
    addpart("cone", (SX, SY, 2.39), (0.14, 0.025, 0.14), BLD)
    addpart("cube", (SX, SY, 1.34), (0.50, 0.07, 0.06), COP)
    addpart("cyl", (SX + 0.25, SY, 1.34), (0.07, 0.07, 0.07), COP, rot=(0, math.pi / 2, 0))
    addpart("cyl", (SX - 0.25, SY, 1.34), (0.07, 0.07, 0.07), COP, rot=(0, math.pi / 2, 0))
    addpart("cyl", (SX, SY, 1.17), (0.055, 0.055, 0.30), LEA)
    addpart("sph", (SX, SY, 0.99), (0.11, 0.11, 0.11), COP)
    n0 = len(me.vertices)
    cnts = [len(b.data.vertices) for b, c in parts]
    cols_p = [c for b, c in parts]
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    for b, c in parts:
        b.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.join()
    o = bpy.context.object
    me = o.data
    SK = (0.80, 0.58, 0.45); CU = COP; BR = (0.30, 0.18, 0.09)
    ST = (0.50, 0.53, 0.58); PL = (0.38, 0.41, 0.46); CH = (0.62, 0.64, 0.68); HR = (0.22, 0.14, 0.08); BD = (0.30, 0.20, 0.12)
    GR = (0.12, 0.36, 0.17) if variant == "warrior" else (0.55, 0.10, 0.12)  # hero: crimson tabard
    bounds, acc = [], n0
    for k, c in zip(cnts, cols_p):
        bounds.append((acc, acc + k, c))
        acc += k
    col, mask = [], []
    TEAM, ARM, LVL, NONE = (1, 0, 0), (0, 1, 0), (0, 0, 1), (0, 0, 0)
    for i in range(len(me.vertices)):
        if i >= n0:
            for k, (a, b_, c) in enumerate(bounds):
                if a <= i < b_:
                    cc, pk = c, k
            col.append(cc)
            mask.append(LVL if pk in (4, 5, 7) else (ARM if cc == CU else NONE))  # quillon ends + pommel = level tint
            continue
        x, y, z = restco[i]
        t = z / H
        m = NONE
        if t > 0.86:
            if abs(x) > 0.14: c, m = PL, ARM
            elif t > 0.955 or y > 0.04: c = HR
            elif t < 0.905 and y < 0.0: c = BD
            else: c = SK
        elif t > 0.66 and abs(x) > 0.2 and z > 1.45: c, m = CU, ARM
        elif t < 0.20: c = BR
        elif 0.40 < t < 0.66 and abs(x) < 0.2 and y < 0.0: c, m = GR, TEAM
        elif 0.44 < t < 0.50 and abs(x) < 0.3: c = BR
        elif 0.36 < t < 0.44 and abs(x) < 0.2 and y < 0: c, m = GR, TEAM
        elif t < 0.36 and abs(x) < 0.3 and (abs(t - 0.3) < 0.035 or abs(t - 0.17) < 0.02): c, m = CU, ARM
        elif abs(x) > 0.26 and 0.42 < t < 0.66: c, m = (CH if (int(z * 18) % 2 == 0) else ST), ARM
        elif t > 0.60: c, m = PL, ARM
        else: c, m = ST, ARM
        col.append(c)
        mask.append(m)
    wA = list(armw) + [1.0] * (len(me.vertices) - n0)
    wB = [0.0] * len(me.vertices)
    return dict(obj=o, H=H, hip=1.0, col=col, mask=mask, wA=wA, wB=wB,
                pivA=(0.15, -0.05, 1.60), pivB=(0.0, 0.0, 1.6))
