"""Original town-art pilot, authored entirely from procedural geometry/materials.

Blender 5.2.3: blender -b -t 6 -P tools/render-town.py -- [--only shop|tavern|portraits]
Outputs are anchored to this script's project, never the caller's working directory.
No reference images, downloaded models, fonts, or textures are read.
"""
import argparse
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "townart"
ARGS = argparse.ArgumentParser(description=__doc__)
ARGS.add_argument("--only", choices=("shop", "tavern", "portraits"))
ARGS.add_argument("--samples", type=int, default=32)
args = ARGS.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
OUT.mkdir(parents=True, exist_ok=True)
RNG = random.Random(10317)
M = {}


def material(name, color, metal=0, rough=.58, grain=None, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    n = m.node_tree.nodes
    p = n.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    if emission:
        p.inputs["Emission Color"].default_value = (*color, 1)
        p.inputs["Emission Strength"].default_value = emission
    if grain:
        tex = n.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 5
        tex.inputs["Detail"].default_value = 3
        coord = n.new("ShaderNodeTexCoord")
        mapping = n.new("ShaderNodeVectorMath")
        mapping.operation = "MULTIPLY"
        mapping.inputs[1].default_value = grain
        m.node_tree.links.new(coord.outputs["Generated"], mapping.inputs[0])
        m.node_tree.links.new(mapping.outputs[0], tex.inputs["Vector"])
        ramp = n.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (*(c * .5 for c in color), 1)
        ramp.color_ramp.elements[1].color = (*(min(c * 1.3, 1) for c in color), 1)
        m.node_tree.links.new(tex.outputs["Fac"], ramp.inputs[0])
        m.node_tree.links.new(ramp.outputs[0], p.inputs["Base Color"])
        bump = n.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = .22
        bump.inputs["Distance"].default_value = .045
        m.node_tree.links.new(tex.outputs["Fac"], bump.inputs["Height"])
        m.node_tree.links.new(bump.outputs[0], p.inputs["Normal"])
    M[name] = m
    return m


def mesh(name, verts, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    o = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(M[mat])
    return o


def finish(o, name, pos, scale, mat, bevel=0, smooth=False):
    o.name = name
    o.location = pos
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(M[mat])
    if bevel:
        b = o.modifiers.new("soft worn edges", "BEVEL")
        b.width, b.segments = bevel, 2
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return o


def box(name, pos, size, mat="oak", bevel=.025):
    bpy.ops.mesh.primitive_cube_add()
    return finish(bpy.context.object, name, pos, tuple(v / 2 for v in size), mat, bevel)


def ell(name, pos, size, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12)
    return finish(bpy.context.object, name, pos, size, mat, smooth=True)


def cyl(name, pos, radius, depth, mat="iron", vertices=20, top=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius,
                                   radius2=radius if top is None else top, depth=depth)
    return finish(bpy.context.object, name, pos, (1, 1, 1), mat, .008, smooth=True)


def rod(name, a, b, r, mat="iron", top=None):
    a, b = Vector(a), Vector(b)
    o = cyl(name, (a + b) / 2, r, (b - a).length, mat, top=top)
    o.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()
    return o


def ring(name, pos, major, minor, mat="brass", rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=32, minor_segments=8,
                                   major_radius=major, minor_radius=minor)
    o = finish(bpy.context.object, name, pos, (1, 1, 1), mat, smooth=True)
    o.rotation_euler = rotation
    return o


def lathe(name, pos, profile, mat, sides=32):
    verts = [(pos[0] + r * math.cos(i * math.tau / sides),
              pos[1] + r * math.sin(i * math.tau / sides), pos[2] + z)
             for z, r in profile for i in range(sides)]
    faces = [tuple(reversed(range(sides)))]
    for j in range(len(profile) - 1):
        for i in range(sides):
            a, b = j * sides + i, j * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple((len(profile) - 1) * sides + i for i in range(sides)))
    o = mesh(name, verts, faces, mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def light(name, pos, energy, color, size=3, target=(0, 0, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.color, data.shape, data.size = energy, color, "DISK", size
    o = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(o)
    o.location = pos
    o.rotation_euler = (Vector(target) - o.location).to_track_quat("-Z", "Y").to_euler()


def setup(portrait=False):
    RNG.seed(10317)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M.clear()
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.cycles.seed = 10317
    scene.render.resolution_x, scene.render.resolution_y = (160, 256) if portrait else (640, 480)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA" if portrait else "RGB"
    scene.render.image_settings.compression = 65
    scene.render.film_transparent = portrait
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = -.45 if portrait else -.8
    scene.world = bpy.data.worlds.new("warm bounce")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.18, .22, .3, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = .18
    data = bpy.data.cameras.new("fixed three-quarter camera")
    data.type = "ORTHO"
    data.ortho_scale = 3.55 if portrait else 6.35
    cam = bpy.data.objects.new("camera", data)
    bpy.context.collection.objects.link(cam)
    cam.location = (2.4, -10, 3.8) if portrait else (1.5, -10, 4.5)
    target = Vector((0, 0, 1.52) if portrait else (0, .35, 1.65))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    material("oak", (.24, .105, .043), grain=(1, 1, 18))
    material("darkwood", (.095, .038, .019), grain=(1, 1, 12))
    material("walnut", (.38, .19, .075), grain=(1, 12, 1))
    material("stone", (.34, .32, .26), grain=(3, 3, 3))
    material("mortar", (.12, .115, .10))
    material("iron", (.12, .15, .17), .75, .34)
    material("steel", (.47, .54, .58), .78, .28)
    material("brass", (.53, .31, .085), .72, .32)
    material("linen", (.58, .47, .28), grain=(8, 8, 8))
    material("red", (.27, .035, .028), grain=(7, 7, 7))
    material("blue", (.035, .09, .19), grain=(8, 8, 8))
    material("green", (.055, .17, .09), grain=(7, 7, 7))
    material("skin", (.56, .31, .18), rough=.61)
    material("skinlight", (.65, .39, .24), rough=.61)
    material("hair", (.085, .043, .023), rough=.8)
    material("greyhair", (.25, .22, .16), rough=.8)
    material("black", (.025, .017, .012))
    material("eye", (.76, .69, .52), rough=.35)
    material("paper", (.63, .49, .28), grain=(3, 3, 3))
    material("amber", (.43, .16, .025), .15, .23)
    material("bottlegreen", (.026, .19, .11), .23, .22)
    material("bottleblue", (.025, .10, .25), .23, .22)
    material("flame", (1, .27, .018), emission=5)
    material("gem", (.08, .45, .72), .3, .18, emission=.6)
    light("window key", (-3, -4, 6), 700 if portrait else 1050, (1, .77, .49), 4)
    light("cool fill", (4, -1, 5), 450, (.55, .69, 1), 4)
    light("warm rim", (-1, 3, 4), 650, (1, .49, .20), 3)
    return scene


def bottle(x, y, z, k=1, tint="bottlegreen"):
    lathe("hand-thrown bottle", (x, y, z),
          [(0, .10*k), (.035*k, .14*k), (.26*k, .14*k), (.34*k, .06*k),
           (.49*k, .055*k), (.51*k, .07*k)], tint)
    cyl("cork", (x, y, z + .52*k), .048*k, .06*k, "oak")
    box("bottle label", (x, y - .142*k, z + .18*k), (.15*k, .012, .12*k), "paper", .002)


def barrel(x, y, z=0, scale=1):
    profile = [(0, .33), (.10, .38), (.4, .44), (.72, .40), (.86, .34)]
    lathe("coopered barrel", (x, y, z), [(h*scale, r*scale) for h, r in profile], "oak")
    for h, r in ((.08, .375), (.23, .416), (.64, .416), (.79, .375)):
        ring("barrel iron hoop", (x, y, z + h*scale), r*scale, .026*scale, "iron")
    cyl("barrel lid", (x, y, z + .86*scale), .34*scale, .035, "walnut")
    for i in range(16):
        a = i * math.tau / 16
        rod("stave seam", (x+.385*scale*math.cos(a), y+.385*scale*math.sin(a), z+.13*scale),
            (x+.403*scale*math.cos(a), y+.403*scale*math.sin(a), z+.71*scale), .006*scale, "darkwood")


def mug(x, y, z):
    lathe("pewter tankard", (x, y, z), [(0,.09),(.02,.105),(.23,.10),(.24,.115)], "iron")
    cyl("ale surface", (x,y,z+.241), .087,.005,"amber")
    ring("mug handle", (x+.13,y,z+.13), .075,.017,"iron", (math.pi/2,0,0))


def sword(x,y,z,scale=1):
    box("forged blade", (x,y,z+.65*scale), (.075*scale,.035*scale,1.05*scale),"steel", .008)
    cyl("blade point", (x,y,z+1.23*scale), .045*scale,.18*scale,"steel",4,top=0)
    box("brass quillons", (x,y,z+.12*scale), (.36*scale,.07*scale,.05*scale),"brass")
    rod("leather grip",(x,y,z-.12*scale),(x,y,z+.12*scale),.045*scale,"darkwood")
    ell("pommel",(x,y,z-.17*scale),(.065*scale,)*3,"brass")


def shield(x,y,z,scale=1):
    ell("shield iron rim",(x,y,z),(.43*scale,.08*scale,.57*scale),"iron")
    ell("shield enamel",(x,y-.06*scale,z),(.385*scale,.055*scale,.52*scale),"red")
    box("shield pale",(x,y-.12*scale,z),(.085*scale,.018,.83*scale),"brass")
    ell("shield boss",(x,y-.14*scale,z),(.12*scale,.07*scale,.12*scale),"steel")
    for dx,dz in ((-.24,.22),(.24,.22),(-.16,-.32),(.16,-.32)):
        ell("shield rivet",(x+dx*scale,y-.12*scale,z+dz*scale),(.024,)*3,"brass")


def lantern(x,y,z):
    box("lantern base",(x,y,z),(.3,.27,.055),"iron")
    for dx in (-.12,.12):
        for dy in (-.10,.10):
            rod("lantern cage",(x+dx,y+dy,z),(x+dx,y+dy,z+.40),.015)
    ell("lantern flame",(x,y,z+.17),(.045,.045,.11),"flame")
    cyl("lantern hood",(x,y,z+.43),.23,.16,"iron",4,top=.04)
    ring("hanging loop",(x,y,z+.57),.065,.013,"iron",(math.pi/2,0,0))
    light("lantern pool",(x,y-.15,z+.2),65,(1,.31,.055),.6,(x,y-1,z-.3))


def room(tavern):
    box("floor foundation",(0,0,-.15),(7,5,.25),"darkwood")
    for i in range(17):
        for j in range(3):
            x=-3.3+i*.40
            y=-1.9+j*1.58+(.12 if i%2 else 0)
            box("floorboard",(x,y,0),(.387,1.56,.09),"walnut",.012)
            for dy in (-.67,.67):
                cyl("floor nail",(x+.12,y+dy,.051),.012,.012,"iron",8)
    box("back mortar",(0,2.25,2.2),(8,.24,4.4),"mortar")
    for row in range(11):
        for col in range(9):
            x=-3.4+col*.84+(.42 if row%2 else 0)
            o=box("rough ashlar",(x,2.08+RNG.uniform(-.025,.025),row*.43+.20),(.80,.23,.39),"stone",.03)
            o.rotation_euler[1]=RNG.uniform(-.02,.02)
    for x in (-3.32,3.32):
        box("carved corner upright",(x,1.85,2.15),(.20,.35,4.4),"darkwood")
    for z in (.3,3.48):
        box("crossbeam",(0,1.83,z),(6.8,.33,.22),"darkwood")
    # Original arch proportions, deliberately independent of any reference geometry.
    archx = -1.65 if tavern else .10
    box("unlit alcove",(archx,1.85,1.25),(1.85,.10,2.45),"black")
    for side in (-1,1):
        for j in range(4):
            box("arch jamb",(archx+side*.99,1.67,.24+j*.42),(.26,.40,.39),"stone")
    for i in range(11):
        a=(i+.5)*math.pi/11
        o=box("arch wedge",(archx+1.0*math.cos(a),1.67,1.63+1.0*math.sin(a)),(.30,.43,.29),"stone")
        o.rotation_euler[1]=a-math.pi/2
    if tavern:
        box("hearth stone",(archx,1.15,.16),(2,.9,.26),"stone")
        for dx in (-.33,.13,.45):
            rod("firewood",(archx+dx-.2,1.5,.31),(archx+dx+.3,1.14,.35),.12,"darkwood")
            ell("fire tongue",(archx+dx,1.43,.50),(.11,.1,.29),"flame")
        light("hearth glow",(archx,1.1,.8),140,(1,.19,.02),1,(0,0,1))
        rod("kettle bail",(archx-.38,1.45,1.3),(archx+.38,1.45,1.3),.025)
        lathe("hanging cauldron",(archx,1.4,.66),[(0,.22),(.10,.34),(.38,.30),(.43,.32)],"iron")
    else:
        for i in range(6):
            box("alcove door planks",(archx-.7+i*.28,1.77,1.12),(.27,.08,2.2),"darkwood")
        ring("door knocker",(archx+.53,1.69,1.15),.10,.023,"brass",(math.pi/2,0,0))
    lantern(-2.8,.9,2.2)
    lantern(2.75,1.2,2.27)


def shelving(x):
    for side in (-.68,.68):
        box("shelf upright",(x+side,1.62,1.65),(.10,.43,2.8),"darkwood")
    for j,z in enumerate((.45,1.10,1.77,2.47,3.10)):
        box("shelf board",(x,1.53,z),(1.5,.62,.095),"walnut")
        if j==4:
            continue
        for k in range(5):
            xx=x-.52+k*.25
            if (j+k)%3:
                bottle(xx,1.45,z+.06,.65+RNG.random()*.24,("bottlegreen","bottleblue","amber")[(j+k)%3])
            else:
                b=box("bound ledger",(xx,1.48,z+.23),(.13,.30,.36),"red" if j%2 else "blue")
                b.rotation_euler[1]=.08
                for zz in (z+.12,z+.33):
                    box("book spine tooling",(xx,1.318,zz),(.13,.013,.025),"brass",.002)


def counter(tavern):
    x=.7 if tavern else 0
    width=3.2 if tavern else 3.8
    box("counter body",(x,-.42,.60),(width,.85,1.08),"oak")
    for i in range(7):
        xx=x-width/2+.30+i*(width-.6)/6
        box("counter inset panel",(xx,-.863,.58),(.40,.035,.77),"darkwood")
        box("panel bevel",(xx,-.893,.58),(.33,.04,.68),"oak")
        ell("counter brass stud",(xx,-.92,.80),(.025,.015,.025),"brass")
    for z in (.13,1.06):
        box("counter moulding",(x,-.91,z),(width+.08,.09,.095),"walnut")
    for j in range(4):
        box("counter top plank",(x,-.77+j*.26,1.18),(width+.22,.25,.13),"walnut",.025)
    rod("brass foot rail",(x-width/2,-1.05,.25),(x+width/2,-1.05,.25),.035,"brass")
    if tavern:
        for dx in (-.6,.1,.65):
            mug(x+dx,-.51,1.25)
        bottle(x+1.1,-.28,1.25,.86,"amber")
        ell("loaf",(x-.95,-.5,1.32),(.25,.15,.10),"paper")
        box("folded serving cloth",(x+.5,-.86,1.27),(.43,.4,.035),"linen")
    else:
        box("ledger leather",(-.83,-.41,1.27),(.55,.36,.055),"red")
        box("ledger pages",(-.83,-.43,1.306),(.51,.31,.018),"paper")
        for i in range(5):
            box("ledger ink",(-.83,-.53+i*.04,1.319),(.31,.008,.002),"hair",0)
        for i in range(12):
            cyl("loose coin",(.25+RNG.random()*.55,-.61+RNG.random()*.25,1.265+i%3*.012),.04,.012,"brass",16)
        # Balance scale with suspended pans.
        rod("scale upright",(.93,-.35,1.3),(.93,-.35,1.99),.028,"brass")
        cyl("scale foot",(.93,-.35,1.27),.17,.04,"brass")
        rod("scale beam",(.56,-.35,1.91),(1.3,-.35,1.91),.02,"brass")
        for xx in (.58,1.28):
            for dx in (-.11,.11):
                rod("pan cord",(xx,-.35,1.89),(xx+dx,-.35,1.56),.007,"brass")
            lathe("scale pan",(xx,-.35,1.52),[(0,.03),(.045,.16),(.06,.17)],"brass")


def person(kind, female=False, tavern=False):
    """Return only this actor's meshes so overlays cannot capture room objects."""
    before=set(bpy.context.scene.objects)
    merchant=kind=="merchant"
    mage=kind=="mage"
    x,y=(.28,.53) if merchant else (0,0)
    zscale=.88 if merchant else 1
    cloth="green" if merchant and tavern else "red" if merchant else "blue"
    skin="skinlight" if female else "skin"
    hair="greyhair" if merchant else "hair"
    def E(name,p,s,m):
        return ell(name,(x+p[0],y+p[1],p[2]),s,m)
    def B(name,p,s,m):
        return box(name,(x+p[0],y+p[1],p[2]),s,m)
    def R(name,a,b,r,m,top=None):
        return rod(name,(x+a[0],y+a[1],a[2]),(x+b[0],y+b[1],b[2]),r,m,top)
    if not merchant:
        # Draped travel cloak, with authored folds and an uneven weighted hem.
        verts=[]
        for row in range(10):
            t=row/9
            for col in range(13):
                u=(col-6)/6
                verts.append((x+u*(.31+.17*t), y+.13+.12*t+.055*math.cos(col*2.1),
                              2.10-1.65*t-.045*t*math.cos(col*1.6)))
        faces=[(j*13+i,j*13+i+1,(j+1)*13+i+1,(j+1)*13+i) for j in range(9) for i in range(12)]
        cape=mesh("folded travelling cloak",verts,faces,"blue" if mage else "red")
        solid=cape.modifiers.new("cloth thickness","SOLIDIFY")
        solid.thickness=.016
    # Tall, grounded proportions with articulated limbs and layered clothing.
    for side in (-1,1):
        E("leather boot",(side*.17,-.09,.16),(.13,.24,.15),"darkwood")
        R("fitted leggings",(side*.17,0,.25),(side*.18,0,1.14),.12, "darkwood")
        if not mage:
            R("boot cuff",(side*.17,0,.25),(side*.17,0,.61),.14,"oak")
            E("knee guard",(side*.18,-.115,.73),(.12,.065,.17),"steel" if not merchant else "linen")
            if not merchant:
                for zz in (.32,.48):
                    B("boot leather strap",(side*.17,-.13,zz),(.24,.035,.035),"darkwood")
                    B("boot buckle",(side*.22,-.154,zz),(.045,.015,.05),"brass")
                R("steel greave ridge",(side*.17,-.13,.31),(side*.18,-.13,.60),.022,"steel")
    if mage:
        lathe("heavy travelling robe",(x,y,.15),[(0,.43),(.08,.45),(.40,.39),(1,.29),(1.36,.25)],cloth)
        for zz,rr in ((.24,.445),(.31,.435),(1.25,.29)):
            ring("robe embroidered hem",(x,y,zz),rr,.018,"brass")
        for side in (-1,1):
            R("robe front piping",(side*.12,-.40,.3),(side*.08,-.26,1.5),.014,"brass")
    else:
        lathe("split tunic skirt",(x,y,1.0),[(0,.32),(.1,.35),(.49,.26)],cloth)
    E("fitted torso",(0,0,1.72),(.31 if female else .36,.22,.47),cloth)
    if not merchant and not mage:
        E("forged cuirass",(0,-.10,1.77),(.32 if female else .35,.20,.38),"steel")
        R("cuirass ridge",(0,-.31,1.44),(0,-.31,2.02),.018,"brass")
        for side in (-1,1):
            E("pauldron",(side*.37,0,2),(.24,.27,.17),"steel")
            for zz in (1.79,1.88,1.97):
                R("breastplate chased chevron",(side*.035,-.307,zz-.06),(side*.21,-.264,zz),.008,"brass")
            for dx in (.25,.35,.45):
                E("pauldron rivet",(side*dx,-.225,2.04),(.017,.012,.017),"brass")
            for zz in (1.46,1.53,1.60):
                B("articulated waist plate",(side*.19,-.20,zz),(.21,.12,.08),"steel")
    else:
        # Vest lapels sit over the shirt, giving more definition than a capsule body.
        for side in (-1,1):
            o=B("embroidered vest",(side*.19,-.19,1.83),(.19,.09,.65),"oak" if merchant else "blue")
            o.rotation_euler[1]=side*.12
            R("lapel piping",(side*.09,-.255,1.51),(side*.13,-.255,2.12),.016,"brass")
        if merchant:
            B("linen apron",(0,-.26,1.2),(.53,.045,.79),"linen")
            for zz in (1.73,1.86,1.99):
                E("vest button",(0,-.245,zz),(.025,.018,.025),"brass")
    belt=ring("leather belt",(x,y,1.43),.29,.055,"darkwood")
    belt.scale.y=.8
    B("belt buckle",(0,-.286,1.43),(.16,.045,.12),"brass")
    B("buckle inset",(0,-.313,1.43),(.10,.012,.065),"black")
    E("belt pouch",(.29,.01,1.26),(.13,.11,.18),"oak")
    R("neck",(0,0,2.04),(0,0,2.25),.11,skin)
    # Arms face the camera; the merchant keeps both hands near the countertop.
    for side in (-1,1):
        elbow=(side*.48,-.025,1.61)
        hand=(side*.37,-.41,1.31) if merchant else (side*.48,-.16,1.13)
        R("tailored sleeve",(side*.34,0,2.02),elbow,.14,cloth,top=.11)
        R("forearm",elbow,hand,.095,skin if merchant else cloth,top=.075)
        E("hand",hand,(.095,.075,.12),skin)
        for digit in range(4):
            xx=hand[0]-.055+digit*.035
            R("fingers",(xx,hand[1]-.04,hand[2]),(xx,hand[1]-.055,hand[2]-.11),.017,skin)
        E("thumb",(hand[0]-side*.08,hand[1]-.055,hand[2]+.015),(.035,.045,.065),skin)
        if not merchant:
            R("bracer",(side*.475,-.12,1.27),(side*.48,-.10,1.5),.11,"brass" if mage else "steel")
    face_before=set(bpy.context.scene.objects)
    E("head",(0,-.015,2.44),(.205 if female else .23,.205,.285),skin)
    E("jaw",(0,-.05,2.29),(.155,.155,.13),skin)
    E("hair cap",(0,.04,2.60),(.22,.205,.16),hair)
    for side in (-1,1):
        E("ear",(side*.22,-.005,2.43),(.045,.045,.085),skin)
        E("cheekbone",(side*.12,-.163,2.39),(.075,.04,.07),skin)
        E("eye socket",(side*.087,-.185,2.47),(.062,.025,.035),"hair")
        E("eye white",(side*.087,-.205,2.473),(.032,.012,.012),"eye")
        E("iris",(side*.084,-.216,2.473),(.012,.007,.011),"green" if female else "blue")
        E("pupil",(side*.084,-.222,2.473),(.006,.005,.009),"black")
        R("eyebrow",(side*.035,-.209,2.515),(side*.145,-.191,2.52),.014,hair)
        if female:
            E("long swept hair",(side*.20,.07,2.34),(.10,.15,.38),hair)
            ring("earring",(x+side*.235,y-.02,2.36),.036,.009,"brass",(math.pi/2,0,0))
        else:
            E("sideburn",(side*.205,-.02,2.43),(.035,.12,.11),hair)
    E("nose bridge",(0,-.208,2.425),(.038,.065,.087),skin)
    E("nose tip",(0,-.256,2.39),(.056,.048,.035),skin)
    E("lower lip",(0,-.198,2.313),(.067,.017,.016),"red")
    if not female:
        for side in (-1,1):
            E("moustache",(side*.049,-.211,2.338),(.065,.027,.023),hair)
        for i in range(11):
            xx=(i-5)*.025
            E("combed beard locks",(xx,-.135- .04*(1-abs(xx)*4),2.23+abs(xx)*.5),(.032,.072,.13-abs(xx)*.3),hair)
    if not merchant:
        for o in bpy.context.scene.objects:
            if o not in face_before:
                pivot=Vector((x,y,2.44))
                o.location=pivot+(o.location-pivot)*.86
                o.scale*=.86
    if merchant:
        E("merchant cloth cap",(0,.005,2.72),(.25,.23,.12),"red" if tavern else "green")
        cap=ring("cap woven brim",(x,y,2.675),.224,.035,"linen")
        cap.scale.y=.88
    elif mage:
        # Soft hood framing the face, with visible hair and forehead.
        for side in (-1,1):
            E("hood drape",(side*.24,.09,2.50),(.105,.20,.29),"blue")
        E("hood crown",(0,.10,2.73),(.29,.24,.17),"blue")
        rod("ash staff",(x+.59,y-.1,.12),(x+.59,y-.1,2.82),.035,"walnut")
        for zz in (2.55,2.65,2.77):
            ring("staff filigree",(x+.59,y-.1,zz),.065,.013,"brass")
        E("staff crystal",(.59,-.1,2.96),(.10,.09,.19),"gem")
        B("traveller spellbook",(-.33,-.03,1.09),(.22,.19,.30),"red")
        B("book clasp",(-.33,-.135,1.09),(.12,.03,.07),"brass")
    else:
        B("circlet",(0,-.164,2.59),(.31,.045,.045),"brass")
        E("circlet jewel",(0,-.195,2.592),(.025,.014,.03),"gem")
        sword(x+.50,y-.16,.65,.79)
        shield(x-.53,y-.19,1.15,.74)
    actor=[o for o in bpy.context.scene.objects if o not in before]
    if merchant:
        for o in actor:
            # Scaling around origin keeps the actor seated within the same room.
            o.location.z *= zscale
            o.scale.z *= zscale
    return actor


def scenery(tavern):
    room(tavern)
    if tavern:
        shelving(2.15)
        barrel(2.65,.10,0,1.1)
        barrel(-2.6,.6,0,.9)
        barrel(-2.6,.6,.78,.8)
        cyl("round oak table",(-2.0,-1.1,.82),.72,.12,"walnut")
        for dx,dy in ((-.4,-.3),(.4,-.3),(0,.4)):
            rod("table legs",(-2+dx,-1.1+dy,.05),(-2+dx,-1.1+dy,.8),.055,"darkwood")
        mug(-2.2,-1.0,.89)
        mug(-1.7,-1.17,.89)
        cyl("bread plate",(-2,-1.35,.9),.20,.025,"linen")
        ell("rustic bread",(-2,-1.35,.96),(.17,.11,.06),"paper")
        # Draped cloth, its folds are geometry rather than a flat CSS silhouette.
        verts=[(2.4+i*.12,1.60,3.1-j*.24-.05*math.cos(i*1.8)) for j in range(6) for i in range(7)]
        faces=[(j*7+i,j*7+i+1,(j+1)*7+i+1,(j+1)*7+i) for j in range(5) for i in range(6)]
        mesh("tavern wall cloth",verts,faces,"red")
        for i in range(4):
            ring("hanging chain",(.78,1.8,3.1-i*.15),.07,.013,"iron",(math.pi/2,0,i%2*math.pi/2))
    else:
        shelving(-2.05)
        shelving(2.15)
        barrel(-2.65,-.6,0,1.0)
        barrel(2.75,.25,0,.9)
        for xx in (-1.6,-1.3,1.52):
            sword(xx,1.09,1.05,.94)
        shield(2.55,1.01,2.1,.73)
        # Display armour on a wooden stand beside the counter.
        rod("armour stand",(2.25,-.8,.05),(2.25,-.8,1.85),.045,"darkwood")
        ell("display breastplate",(2.25,-.88,1.4),(.34,.18,.39),"steel")
        for dx in (-.34,.34):
            ell("display shoulder",(2.25+dx,-.8,1.66),(.20,.20,.13),"steel")
        ell("display helm",(2.25,-.8,2.0),(.23,.22,.24),"steel")
        box("helmet visor",(2.25,-1.01,2.0),(.29,.02,.045),"black")
        shield(2.42,-1.1,.61,.72)
        for i in range(3):
            cyl("rolled parchment",(-2.3+i*.16,1.2,2.65),.07,.3,"paper")
    counter(tavern)


def render(name):
    bpy.context.scene.render.filepath=str(OUT / (name+".png"))
    bpy.ops.render.render(write_still=True)
    print("TOWN_ART",name,flush=True)


def town(tavern):
    setup()
    scenery(tavern)
    actor=person("merchant",tavern=tavern)
    name="tavern" if tavern else "shop"
    for o in actor:
        o.hide_render=True
    render(name)
    for o in actor:
        o.hide_render=False
    # Holdouts retain the fixed camera and genuine counter/prop occlusion.
    # No image compositing or reference-pixel operations are involved.
    hold=bpy.data.materials.new("background alpha holdout")
    hold.use_nodes=True
    nodes=hold.node_tree.nodes
    nodes.clear()
    out=nodes.new("ShaderNodeOutputMaterial")
    h=nodes.new("ShaderNodeHoldout")
    hold.node_tree.links.new(h.outputs[0],out.inputs["Surface"])
    for o in bpy.context.scene.objects:
        if o.type=="MESH" and o not in actor:
            for slot in o.material_slots:
                slot.material=hold
    scene=bpy.context.scene
    scene.render.film_transparent=True
    scene.render.image_settings.color_mode="RGBA"
    render("merchant-"+name)


if args.only in (None,"shop"):
    town(False)
if args.only in (None,"tavern"):
    town(True)
if args.only in (None,"portraits"):
    for kind in ("warrior","mage"):
        for female in (False,True):
            setup(True)
            person(kind,female)
            render("portrait-"+kind+("-f" if female else "-m"))
