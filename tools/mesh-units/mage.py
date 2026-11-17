"""Mage built from a reference mesh plus primitive robe, hat and staff. Used by tools/render-mesh-unit.py.

API: build(bpy, models_dir, variant) returns a dict:
  obj (joined mesh, feet at z=0, centred), H, hip (z of hips), col/mask (per-vertex RGB lists),
  wA/wB (per-vertex arm group weights, A = weapon arm), pivA/pivB (shoulder pivots).
POSE holds per-frame angle overrides (rad) read by the renderer.
"""
import math
from mathutils import Vector, Quaternion

MESH = "diablo-ii-paladin20230315-90545-bnad2n/kaucukovnik/diablo-ii-paladin/Paladin_light_01.stl"
POSE = {  # arm-group pitch about the shoulder (positive = tip forward and down)
    "die_lift": 0.42,
    "attack_a": (1.0, 0.6, 0.25, 0.05),
    "cast_a": (-0.7, -0.45, -0.2, 0.0),
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
    TARGET = {1: Vector((0.18, -0.34, 1.16)), -1: Vector((-0.22, -0.28, 1.10))}
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

    BLU = (0.18, 0.24, 0.62); COP = (0.72, 0.42, 0.20); WOOD = (0.40, 0.25, 0.11); ORB = (0.55, 0.85, 1.0)
    addpart("cone", (0, 0.0, 0.62), (0.80, 0.64, 1.12), BLU)             # 0 skirt+chest (team)
    addpart("cyl", (0, 0.0, 1.38), (0.46, 0.34, 0.70), BLU)              # 6 chest (team, index fixed below)
    addpart("cyl", (0, 0.0, 0.10), (0.78, 0.62, 0.06), COP)             # 1 hem trim (armour)
    addpart("cone", (0, 0.04, 2.22), (0.54, 0.54, 0.28), BLU)           # 3 hat base (team)
    addpart("cone", (0.04, 0.04, 2.38), (0.32, 0.32, 0.22), BLU, rot=(0, 0.55, 0))  # 4 hat middle, leaning (team)
    addpart("cone", (0.25, 0.04, 2.40), (0.16, 0.16, 0.34), BLU, rot=(0, 1.95, 0))  # 5 floppy tip bent sideways (team)
    addpart("cyl", (0, 0.04, 2.08), (0.70, 0.70, 0.05), BLU)            # 6 brim (team)
    addpart("cyl", (0.18, -0.34, 1.08), (0.07, 0.07, 1.96), WOOD)       # 7 staff
    addpart("sph", (0.18, -0.34, 2.06), (0.22, 0.22, 0.22), ORB)        # 8 orb (level)
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
    GR = (0.18, 0.24, 0.62)
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
            mask.append({0: TEAM, 1: TEAM, 2: ARM, 3: TEAM, 4: TEAM, 5: TEAM, 6: TEAM, 8: LVL}.get(pk, NONE))
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
    wA = list(armw) + [1.0 if k >= 7 else 0.0 for k in (kk for (a, b_, c), kk in ((bb, q) for q, bb in enumerate(bounds)) for _ in range(b_ - a))]  # staff + orb follow the arm
    wB = [0.0] * len(me.vertices)
    return dict(obj=o, H=H, hip=1.0, col=col, mask=mask, wA=wA, wB=wB,
                pivA=(0.15, -0.05, 1.60), pivB=(0.0, 0.0, 1.6))
