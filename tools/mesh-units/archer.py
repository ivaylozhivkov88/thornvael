"""Archer built from a reference mesh plus primitive bow, quiver and hood. Used by tools/render-mesh-unit.py.

API: build(bpy, models_dir, variant) returns a dict:
  obj (joined mesh, feet at z=0, centred), H, hip (z of hips), col/mask (per-vertex RGB lists),
  wA/wB (per-vertex arm group weights, A = weapon arm), pivA/pivB (shoulder pivots).
POSE holds per-frame angle overrides (rad) read by the renderer.
"""
import math
from mathutils import Vector, Quaternion

MESH = "diablo-ii-paladin20230315-90545-bnad2n/kaucukovnik/diablo-ii-paladin/Paladin_light_01.stl"
POSE = {  # arm-group pitch about the shoulder (positive = tip forward and down)
    "die_lift": 0.40,
    "attack_a": (-0.12, -0.32, -0.18, 0.04),  # small draw: hand stays clear of the bow arm
    "cast_a": (-0.45, -0.3, -0.15, 0.0),
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
    TARGET = {1: Vector((0.12, -0.22, 1.36)), -1: Vector((-0.14, -0.62, 1.38))}
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

    BX, BY, BZ = -0.14, -0.64, 1.38
    WOOD = (0.45, 0.28, 0.12); COP = (0.72, 0.42, 0.20); LEA = (0.30, 0.18, 0.08); STR = (0.90, 0.88, 0.80)
    GRN = (0.14, 0.34, 0.16); FLT = (0.85, 0.85, 0.78); STLC = (0.55, 0.57, 0.60)

    def bar(p, q, t, col, kind="cyl"):
        p = Vector(p); q = Vector(q); d = q - p
        e = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
        addpart(kind, (p + q) / 2, (t, t, d.length), col, rot=e)

    pts = [(BX, BY + 0.16, BZ + 0.78), (BX, BY + 0.03, BZ + 0.40), (BX, BY - 0.07, BZ), (BX, BY + 0.03, BZ - 0.40), (BX, BY + 0.16, BZ - 0.78)]
    for p, q in zip(pts, pts[1:]):
        bar(p, q, 0.07, WOOD)                      # 0-3 limbs
    addpart("sph", pts[0], (0.09, 0.09, 0.09), COP)  # 4 tip (level)
    addpart("sph", pts[-1], (0.09, 0.09, 0.09), COP) # 5 tip (level)
    bar(pts[0], pts[-1], 0.012, STR)                 # 6 string
    bar((BX, BY - 0.07, BZ + 0.06), (BX, BY - 0.07, BZ - 0.06), 0.13, LEA)  # 7 grip
    # quiver on back with arrows
    qa = Vector((0.20, 0.30, 1.30)); qb = Vector((-0.10, 0.34, 1.72))
    bar(qa, qb, 0.19, LEA)                           # 8
    for dx in (-0.06, 0.0, 0.06):
        bar(qb + Vector((dx, 0, 0)), qb + Vector((dx - 0.04, 0, 0.30)), 0.025, WOOD)
        addpart("cube", qb + Vector((dx - 0.045, 0, 0.34)), (0.06, 0.015, 0.11), FLT)
    addpart("cone", (0, 0.10, 2.16), (0.32, 0.36, 0.30), GRN, rot=(0.35, 0, 0))  # hood peak (team)
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
    GR = (0.14, 0.34, 0.16)
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
            mask.append(LVL if pk in (4, 5) else (TEAM if pk == len(bounds) - 1 else (ARM if pk in (7, 8) else NONE)))  # bow tips = level, hood = team, grip/quiver = armour
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
    wA = list(armw) + [0.0] * (len(me.vertices) - n0)  # bow, quiver, hood stay put
    wB = [0.0] * len(me.vertices)
    return dict(obj=o, H=H, hip=1.0, col=col, mask=mask, wA=wA, wB=wB,
                pivA=(0.15, -0.05, 1.60), pivB=(0.0, 0.0, 1.6))
