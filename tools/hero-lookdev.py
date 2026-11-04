"""Original Thornvael heavy knight, a single procedural Blender lookdev study.

Run from repository root (Blender 5.2.3, no external assets or dependencies):
  blender -b -t 8 -P game/tools/hero-lookdev.py -- [--samples 48] [--size 1100]
Legacy output paths/defaults are retained. To preserve the first study, use:
  --out-dir .planning/art-concepts/hero-lookdev-v2
  --stage-dir .planning/tooling/hero-lookdev-v2 --game-proof
For the material/physical-scale study, use new v3 directories and --model-scale 1.15.
Not an atlas generator, animation rig, or replacement for render-unit.py.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import random
import sys
import time

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.planning/art-concepts/hero-lookdev'
STAGE = ROOT / '.planning/tooling/hero-lookdev'
parser = argparse.ArgumentParser()
parser.add_argument('--samples', type=int, default=48)
parser.add_argument('--size', type=int, default=1100)
parser.add_argument('--out-dir', default=str(OUT))
parser.add_argument('--stage-dir', default=str(STAGE))
parser.add_argument('--game-proof', action='store_true')
parser.add_argument('--model-scale', type=float, default=1.0)
parser.add_argument('--motion-build', action='store_true',
                    help='Build explicit joint partitions for hero-motion.py; skip study renders')
parser.add_argument('--locomotion-build', action='store_true',
                    help='Motion v2 only: extend buried knee underlap for solved forward flexion')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def workspace_dir(value):
    path = Path(value)
    path = (ROOT / path).resolve() if not path.is_absolute() else path.resolve()
    if path == ROOT or not path.is_relative_to(ROOT):
        parser.error('output/cache directory must be a descendant of the workspace')
    return path


if not math.isfinite(args.model_scale) or not .5 <= args.model_scale <= 1.5:
    parser.error('model-scale must be finite and between 0.5 and 1.5 inclusive')
OUT, STAGE = workspace_dir(args.out_dir), workspace_dir(args.stage_dir)
if OUT == STAGE or OUT.is_relative_to(STAGE) or STAGE.is_relative_to(OUT):
    parser.error('output and stage directories must be separate')
if args.samples < 1 or args.size < 64:
    parser.error('samples must be positive and portrait width at least 64')
OUT.mkdir(parents=True, exist_ok=True)
STAGE.mkdir(parents=True, exist_ok=True)
# Blender extension discovery also writes on shutdown; keep its user cache local.
for variable, leaf in (('BLENDER_USER_RESOURCES','blender-user'),
                       ('BLENDER_USER_CONFIG','blender-user/config'),
                       ('BLENDER_USER_SCRIPTS','blender-user/scripts'),
                       ('BLENDER_USER_EXTENSIONS','blender-user/extensions'),
                       ('BLENDER_USER_DATAFILES','blender-user/datafiles')):
    folder=STAGE/leaf
    folder.mkdir(parents=True,exist_ok=True)
    os.environ[variable]=str(folder)
os.environ['TEMP']=os.environ['TMP']=str(STAGE)
random.seed(31103)
start = time.monotonic()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.temporary_directory = str(STAGE)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.cycles.adaptive_threshold = .045
scene.cycles.seed = 31103
scene.render.resolution_x = args.size
scene.render.resolution_y = round(args.size * 1.2)
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
scene.world = bpy.data.worlds.new('soft neutral studio world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.19,.19,.19,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35


material_recipe = []
attachment_owner = 'chest'
attachment_role = ''


def tag_geometry(obj):
    # Authored before Blender chooses numeric name suffixes; never infer ownership.
    obj['motion_owner'] = attachment_owner
    if attachment_role:
        obj['motion_role'] = attachment_role
    return obj


def material(name, base, metal=0, rough=.6, grain=100):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*base, 1)
    m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links
    bs = n.get('Principled BSDF')
    bs.inputs['Metallic'].default_value = metal
    noise = n.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = grain
    noise.inputs['Detail'].default_value = 3
    coord = n.new('ShaderNodeTexCoord')
    l.new(coord.outputs['Generated'], noise.inputs['Vector'])
    ramp = n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .15
    ramp.color_ramp.elements[0].color = (*(c * .88 for c in base), 1)
    ramp.color_ramp.elements[1].position = .85
    ramp.color_ramp.elements[1].color = (*(min(1, c * 1.06) for c in base), 1)
    l.new(noise.outputs['Fac'], ramp.inputs[0])
    l.new(ramp.outputs[0], bs.inputs['Base Color'])
    remap = n.new('ShaderNodeMapRange')
    remap.inputs['To Min'].default_value = rough - .055
    remap.inputs['To Max'].default_value = min(.98, rough + .07)
    l.new(noise.outputs['Fac'], remap.inputs['Value'])
    l.new(remap.outputs['Result'], bs.inputs['Roughness'])
    bump = n.new('ShaderNodeBump')
    # Object-space stretched grain: fine directional abrasion, not cast pebbling.
    stretch = n.new('ShaderNodeVectorMath')
    stretch.operation = 'MULTIPLY'
    stretch.inputs[1].default_value = (1, 1, .075) if metal else (1, 1, .6)
    l.new(coord.outputs['Object'], stretch.inputs[0])
    fine = n.new('ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = 420 if metal else 260
    fine.inputs['Detail'].default_value = 2
    l.new(stretch.outputs['Vector'], fine.inputs['Vector'])
    bump.inputs['Strength'].default_value = .14 if metal else .22
    bump.inputs['Distance'].default_value = .00035 if metal else .0007
    l.new(fine.outputs['Fac'], bump.inputs['Height'])
    l.new(bump.outputs['Normal'], bs.inputs['Normal'])
    material_recipe.append({'name': name, 'base_linear': list(base), 'metallic': metal,
                            'roughness': rough, 'macro_noise_scale': grain,
                            'color_multipliers': [.88, 1.06],
                            'roughness_range': [rough-.055, min(.98, rough+.07)],
                            'grain_space': 'Object', 'grain_scale': fine.inputs['Scale'].default_value,
                            'grain_stretch': list(stretch.inputs[1].default_value),
                            'bump_distance': bump.inputs['Distance'].default_value,
                            'bump_strength': bump.inputs['Strength'].default_value})
    return m


# Broad value/hue blocks carry at 48px; reduce mottling instead of adding detail.
steel = material('01 / abraded forged steel', (.28, .32, .35), .82, .43, 9)
edge = material('02 / aged bronze narrow edges', (.18, .135, .079), .8, .57, 18)
mail = material('03 / dark iron mail', (.025, .033, .04), .65, .82, 40)
leather = material('04 / worn oxhide', (.14, .055, .022), 0, .82, 125)
cloth = material('05 / muted olive wool', (.08, .12, .035), 0, .91, 180)
black = material('06 / visor shadow', (.006, .007, .008), .1, .8)
heraldry = material('07 / old ivory inlay', (.44, .39, .25), .55, .56)


def mesh(name, vs, fs, mat, bevel=0, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vs, [], fs)
    data.update()
    o = bpy.data.objects.new(name, data)
    scene.collection.objects.link(o)
    o.data.materials.append(mat)
    for p in data.polygons:
        p.use_smooth = smooth
    if bevel:
        mod = o.modifiers.new('small forged edge', 'BEVEL')
        mod.width, mod.segments = bevel, 2
        norm = o.modifiers.new('weighted plate normals', 'WEIGHTED_NORMAL')
        norm.keep_sharp = True
    return tag_geometry(o)


def tube(name, points, radius, mat):
    c = bpy.data.curves.new(name, 'CURVE')
    c.dimensions, c.resolution_u = '3D', 2
    c.bevel_depth, c.bevel_resolution = radius, 2
    s = c.splines.new('POLY')
    s.points.add(len(points) - 1)
    for p, co in zip(s.points, points):
        p.co = (*co, 1)
    o = bpy.data.objects.new(name, c)
    scene.collection.objects.link(o)
    o.data.materials.append(mat)
    return tag_geometry(o)


def loft(name, rows, mat, n=32, bevel=0):
    # rows: center x/y, height, horizontal radius, depth radius.
    vs = [(x + rx * math.sin(i * math.tau / n), y - ry * math.cos(i * math.tau / n), z)
          for x, y, z, rx, ry in rows for i in range(n)]
    fs = [(j*n+i, j*n+(i+1)%n, (j+1)*n+(i+1)%n, (j+1)*n+i)
          for j in range(len(rows)-1) for i in range(n)]
    fs += [tuple(range(n-1, -1, -1)), tuple((len(rows)-1)*n+i for i in range(n))]
    return mesh(name, vs, fs, mat, bevel)


def plate(name, outline, mat=steel, bulge=.025):
    # Shaped front-facing thick plate, with a central crown rather than a cube.
    center = tuple(sum(v[i] for v in outline)/len(outline) for i in range(3))
    vs = [*outline, (center[0], center[1]-bulge, center[2])]
    n = len(outline)
    fs = [(i, (i+1)%n, n) for i in range(n)]
    o = mesh(name, vs, fs, mat, .002, smooth=False)
    mod = o.modifiers.new('real plate thickness', 'SOLIDIFY')
    mod.thickness = .006
    return o


def rivet(name, xyz, radius=.006, mat=edge):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=5, radius=radius, location=xyz)
    o = bpy.context.object
    o.name = name
    o.scale.y = .5
    o.data.materials.append(mat)
    return tag_geometry(o)


def band(name, x, y, z, rx, ry, height, mat=leather):
    return loft(name, [(x,y,z-height/2,rx,ry), (x,y,z+height/2,rx,ry)], mat)


# Core anatomy: roughly 7.4 heads tall, narrow waist and planted weight.
loft('padded torso under harness', [(0,0,1.04,.17,.115),(0,0,1.32,.195,.13),
     (0,.01,1.56,.24,.135),(0,.015,1.68,.19,.11)], cloth)
attachment_owner = 'neck'
loft('high mail collar', [(0,0,1.59,.095,.085),(0,0,1.81,.088,.08)], mail)
attachment_owner = 'chest'
loft('breastplate / tapered forged cuirass', [(0,-.006,1.12,.166,.126),
     (0,-.008,1.27,.18,.152),(0,-.008,1.46,.23,.174),(0,0,1.59,.235,.132),
     (0,0,1.65,.155,.095)], steel, 40, .003)
for s in (-1,1):
    tube('cuirass raised seam', [(s*.03,-.107,1.64),(s*.135,-.145,1.55),
         (s*.15,-.161,1.44),(s*.10,-.157,1.29),(s*.01,-.135,1.17)], .0035, edge)
    for z in (1.2,1.28,1.36):
        rivet('harness side pin', (s*.167,-.08,z), .005)
attachment_owner = 'pelvis'
for i in range(3):
    z = 1.105 - i*.047
    loft('overlapping fauld %d' % i, [(0,0,z-.03,.18+i*.014,.132+i*.006),
         (0,0,z+.029,.168+i*.012,.126+i*.005)], steel, 36, .002)
    pts = [( (.18+i*.014)*math.sin(t), -(.132+i*.006)*math.cos(t), z-.029)
           for t in [j*math.tau/48 for j in range(49)]]
    tube('fauld rolled bronze hem', pts, .0025, edge)

# Separate hanging wool panels, with weighted vertical folds and staggered hems.
# The open front exposes mail, tassets and knees instead of a rigid bell skirt.
for panel, (a0,a1,hem) in enumerate(((.72,2.35,.48),(-2.35,-.72,.54),
                                   (2.15,4.13,.43))):
    vs=[]
    rows, cols = 9, 23
    for j in range(rows):
        q=j/(rows-1)
        for i in range(cols):
            t=a0+(a1-a0)*i/(cols-1)
            fold=math.sin(i/(cols-1)*math.pi*7+panel*.7)
            radius=.19+q*.055+fold*(.006+.018*q)
            z=1.07*(1-q)+hem*q+.014*math.sin(i*.8)*q*q
            vs.append((radius*math.sin(t),-radius*.82*math.cos(t)+q*q*.025,z))
    fs=[(j*cols+i,j*cols+i+1,(j+1)*cols+i+1,(j+1)*cols+i)
        for j in range(rows-1) for i in range(cols-1)]
    o=mesh('weighted split wool panel %d'%panel,vs,fs,cloth)
    mod=o.modifiers.new('wool thickness','SOLIDIFY'); mod.thickness=.004
    tube('subtle leather-bound uneven hem',vs[-cols:],.002,leather)

# Thousands of real interlocked wire rings, combined into one mesh (no textures).
mail_v,mail_f=[],[]
mail_parts = {}
def ring(center, radius=.009, tilt=0, owner='pelvis'):
    base=len(mail_v)
    for a in range(10):
        u=a*math.tau/10
        for b in range(4):
            v=b*math.tau/4
            rr=radius+.00165*math.cos(v)
            px,pz=rr*math.cos(u),rr*math.sin(u)
            mail_v.append((center[0]+px,center[1]+.00165*math.sin(v)+pz*math.sin(tilt),
                           center[2]+pz*math.cos(tilt)))
    for a in range(10):
        for b in range(4):
            mail_f.append((base+a*4+b,base+((a+1)%10)*4+b,
                           base+((a+1)%10)*4+(b+1)%4,base+a*4+(b+1)%4))
    vertices, faces = mail_parts.setdefault(owner, ([], []))
    offset = len(vertices)
    vertices.extend(mail_v[base:])
    faces.extend(tuple(i-base+offset for i in face) for face in mail_f[-40:])
for j in range(21):
    z=1.08-j*.013
    for i in range(28):
        x=(i-13.5)*.012+(j%2)*.006
        if abs(x)<.026 and z<.83:
            continue
        y=-.156+.026*(x/.18)**2
        ring((x,y,z),tilt=(.42 if (i+j)%2 else -.42))
for s in (-1,1):
    for j in range(31):
        z=1.6-j*.014
        x=s*(.286+(1.6-z)*.25)
        for k in range(11):
            t=-1.8+k*.33
            ring((x+math.sin(t)*.07,-.008-.085*math.cos(t),z),.0085,
                 .4*(-1 if j%2 else 1),
                 ('upperarm.' if z >= 1.30 else 'forearm.')+('R' if s < 0 else 'L'))
if args.motion_build:
    for owner, (vertices, faces) in mail_parts.items():
        attachment_owner = owner
        mesh('hand-woven iron mail / '+owner,vertices,faces,mail)
else:
    attachment_owner = 'pelvis'
    mesh('hand-woven iron mail / exposed skirt and sleeves',mail_v,mail_f,mail)


def flexion_underlap(name, center, radii, mat):
    # Buried closed anatomical gusset, using the existing cloth/leather material.
    rows = []
    for j in range(17):
        a = -.499*math.pi + j/16*.998*math.pi
        rows.append((center[0], center[1], center[2]+radii[2]*math.sin(a),
                     radii[0]*math.cos(a), radii[1]*math.cos(a)))
    obj = loft(name, rows, mat, 32)
    obj['motion_coverage_joint'] = attachment_owner
    return obj

# Layered shoulder plates: curved saddle shells with overlapping scalloped hems.
for s in (-1,1):
    side = 'R' if s < 0 else 'L'
    attachment_owner = 'upperarm.'+side
    for layer in range(4):
        vs=[]
        for j in range(5):
            q=j/4
            x=s*(.22+layer*.033+q*.115)
            for i in range(19):
                a=-math.pi*.62+i/18*math.pi*1.24
                y=math.sin(a)*(.142-layer*.008)
                z=1.66-layer*.065+math.cos(a)*.095-q*.07
                vs.append((x,y,z))
        fs=[(j*19+i,j*19+i+1,(j+1)*19+i+1,(j+1)*19+i) for j in range(4) for i in range(18)]
        o=mesh('laminated shoulder %s/%s'%(s,layer),vs,fs,steel,.001)
        sol=o.modifiers.new('plate gauge','SOLIDIFY');sol.thickness=.006
        tube('shoulder rolled rim',vs[-19:],.0035,edge)
        for idx in (2,16):
            rivet('pauldron pin',vs[-19+idx],.005)
    # Upper arms and articulated forearms are tapered, never exposed ball joints.
    x=s*.345
    sleeve=loft('upper leather sleeve',[(x,0,1.32,.073,.078),(s*.29,.005,1.57,.077,.08)],leather)
    sleeve['motion_span_joint'] = 'forearm.'+side
    sleeve['motion_span_side'] = 'proximal'
    sleeve['motion_seam_vertices'] = list(range(32))
    ex=s*.39
    attachment_owner = 'forearm.'+side
    if args.motion_build:
        flexion_underlap('underlapping leather elbow gusset '+side,
                         (s*.37,-.005,1.30),(.081,.085,.091),leather)
    plate('elbow wing',[(ex-.072,-.094,1.32),(ex,-.115,1.38),
          (ex+.075,-.09,1.30),(ex+.065,-.09,1.23),(ex-.058,-.096,1.24)],bulge=.018)
    sleeve=loft('tapered vambrace',[(s*.448,-.045,1.04,.056,.065),
         (s*.416,-.015,1.22,.073,.077),(s*.397,-.005,1.29,.075,.078)],steel,24,.002)
    sleeve['motion_span_joint'] = 'forearm.'+side
    sleeve['motion_span_side'] = 'distal'
    sleeve['motion_seam_vertices'] = list(range(48,72))
    for z,x in ((1.23,.409),(1.07,.443)):
        band('forearm leather securing strap',s*x,-.025,z,.076 if z>1.1 else .061,.083 if z>1.1 else .071,.022)
        rivet('strap stud',(s*x,-.11,z),.006)
    attachment_owner = 'hand.'+side
    loft('gauntlet cuff',[(s*.455,-.049,1.035,.068,.072),(s*.465,-.055,.99,.053,.055)],steel,20,.002)
    loft('curled leather palm',[(s*.47,-.06,1.0,.043,.049),(s*.47,-.066,.92,.045,.043),
         (s*.467,-.06,.89,.035,.034)],leather,16)
    plate('gauntlet metacarpal shield',[(s*.47-.045,-.113,.994),
          (s*.47+.045,-.113,.994),(s*.47+.041,-.12,.949),
          (s*.47,-.13,.936),(s*.47-.041,-.12,.949)],bulge=.009)
    for finger in range(4):
        xx=s*.47+(finger-1.5)*.021
        rivet('individual knuckle boss',(xx,-.123,.946),.009,steel)
        for seg in range(3):
            yy=-.123+seg*.008
            z=.939-seg*.015
            plate('overlapping curled finger lame',[(xx-.009,yy,z),
                (xx+.009,yy,z),(xx+.008,yy-.002,z-.014),
                (xx-.008,yy-.002,z-.014)],bulge=.003)
    loft('opposed articulated thumb',[(s*.421,-.073,.969,.018,.024),
         (s*.415,-.096,.94,.02,.021),(s*.428,-.11,.916,.017,.017)],steel,12,.001)
    # Leg: cuisse, shield-like poleyn, long greave, leather ankle, articulated foot.
    lx=s*.125
    attachment_owner = 'thigh.'+side
    if args.motion_build:
        # Original linear taper with an 8cm overlap beneath the knee plate.
        def trouser_row(z):
            t=(z-.17)/.43 if z <= .60 else (z-.60)/.36
            a,b=((.062,.067),(.085,.085)) if z <= .60 else ((.085,.085),(.095,.09))
            return (lx,0,z,a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)
        # Authored cap endpoints; buried surfaces are resolved by closed-solid union.
        thigh_end = .54
        shin_end = .62
        trouser=loft('quilted trouser / thigh '+side,[trouser_row(z) for z in (thigh_end,.60,.96)],cloth,24)
        trouser['motion_span_joint'], trouser['motion_span_side'] = 'shin.'+side, 'proximal'
        trouser['motion_seam_vertices'] = list(range(24))
        attachment_owner = 'shin.'+side
        trouser=loft('quilted trouser / shin '+side,[trouser_row(z) for z in (.17,.60,shin_end)],cloth,24)
        trouser['motion_span_joint'], trouser['motion_span_side'] = 'shin.'+side, 'distal'
        trouser['motion_seam_vertices'] = list(range(48,72))
        flexion_underlap('underlapping quilted knee cuff '+side,
                         (lx,0,.58),(.082,.084,.115 if args.locomotion_build else .085),cloth)
        attachment_owner = 'thigh.'+side
    else:
        loft('quilted trouser',[(lx,0,.17,.062,.067),(lx,0,.60,.085,.085),
             (lx,0,.96,.095,.09)],cloth,24)
    plate('thigh cuisse',[(lx-.079,-.095,.94),(lx+.079,-.095,.94),
         (lx+.069,-.107,.65),(lx,-.13,.61),(lx-.069,-.107,.65)],bulge=.022)
    for i in range(3):
        z=.99-i*.066
        outline=[(s*.035,-.151,z+.037),(s*.195,-.132,z+.024),
                 (s*.222,-.138,z-.047),(s*.045,-.17,z-.065)]
        plate('overlapping thigh tasset',outline,bulge=.012)
        tube('tasset warm rim',outline[2:],.0025,edge)
    attachment_owner = 'shin.'+side
    plate('angular knee poleyn',[(lx-.072,-.09,.615),(lx,-.125,.65),
        (lx+.073,-.09,.61),(lx+.067,-.102,.546),(lx,-.132,.515),
        (lx-.067,-.102,.546)],bulge=.024)
    band('knee strap',lx,0,.575,.088,.091,.026)
    loft('long fitted greave',[(lx,-.004,.19,.056,.063),(lx,0,.38,.064,.08),
        (lx,0,.51,.071,.078)],steel,24,.002)
    tube('greave medial ridge',[(lx,-.068,.19),(lx,-.087,.37),(lx,-.084,.51)],.003,edge)
    band('ankle leather',lx,0,.145,.058,.065,.095)
    attachment_owner = 'foot.'+side
    # Boot lasts have a flat outsole, distinct heel, narrow ankle and forward toe.
    footprint=[(-.041,-.218),(.041,-.218),(.059,-.18),(.058,-.05),
               (.047,.06),(-.047,.06),(-.058,-.05),(-.059,-.18)]
    vs=[(lx+x,y,z) for z in (.012,.027) for x,y in footprint]
    fs=[tuple(range(7,-1,-1)),tuple(range(8,16))]
    fs += [(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    mesh('flat stitched boot outsole',vs,fs,leather,.003,False)
    loft('fitted leather ankle and vamp',[(lx,-.062,.04,.06,.131),
        (lx,-.058,.08,.06,.128),(lx,-.018,.12,.054,.079),
        (lx,.008,.19,.049,.055)],leather,24,.002)
    # Continuous closed steel toe/vamp beneath the moving lames: no toe aperture,
    # no leather showing between instep segments, no wide projecting sandal sole.
    rows=[(-.225,.018,.049),(-.211,.044,.079),(-.188,.056,.095),
          (-.151,.062,.113),(-.114,.062,.137),(-.077,.059,.158),
          (-.04,.055,.182),(.006,.051,.188),(.05,.049,.14)]
    vs=[]
    segments=13
    for y,w,h in rows:
        for k in range(segments):
            a=-math.pi/2+k*math.pi/(segments-1)
            vs.append((lx+w*math.sin(a),y,.029+(h-.029)*math.cos(a)))
    fs=[(j*segments+k,j*segments+k+1,(j+1)*segments+k+1,(j+1)*segments+k)
        for j in range(len(rows)-1) for k in range(segments-1)]
    fs += [tuple(range(segments-1,-1,-1)),
           tuple((len(rows)-1)*segments+k for k in range(segments))]
    fs += [(j*segments,(j+1)*segments,(j+2)*segments-1,(j+1)*segments-1)
           for j in range(len(rows)-1)]
    mesh('closed steel toe cap and continuous underlapping vamp',vs,fs,steel,.001)
    # These are horizontal curved shells, not vertical plates buried in leather.
    for i,(y,w,h) in enumerate(((-.19,.052,.082),(-.153,.061,.105),
                               (-.116,.061,.129),(-.079,.058,.151),
                               (-.042,.054,.174))):
        vs=[]
        for q in (0,1):
            for k in range(9):
                a=-math.pi/2+k*math.pi/8
                vs.append((lx+(w+.003)*math.sin(a),y+q*.05,
                           .033+(h+.009-.033)*math.cos(a)+q*.016))
        fs=[(k,k+1,10+k,9+k) for k in range(8)]
        o=mesh('raised sabaton articulated shell %d'%i,vs,fs,steel,.001)
        sol=o.modifiers.new('sabatons steel gauge','SOLIDIFY');sol.thickness=.004
        tube('sabatons narrow rolled steel leading edge',vs[:9],.0014,steel)

# Belt, buckle, a practical hanging pouch; no borrowed heraldic motifs.
attachment_owner = 'pelvis'
band('waist oxhide belt',0,0,1.123,.186,.145,.044)
tube('cast bronze buckle',[(-.038,-.157,1.148),(.035,-.157,1.148),
    (.035,-.157,1.1),(-.038,-.157,1.1),(-.038,-.157,1.148)],.006,edge)
tube('buckle tongue',[(0,-.164,1.125),(.039,-.164,1.125)],.003,edge)
for x in (.064,.086,.108):
    rivet('belt punched hole',(x,-.145,1.125),.003,black)
loft('saddle leather pouch',[(-.226,-.015,.905,.067,.052),(-.226,-.015,1.055,.071,.05)],leather,16,.006)
plate('pouch flap',[(-.29,-.072,1.057),(-.16,-.072,1.057),
      (-.173,-.078,.989),(-.225,-.085,.973),(-.28,-.078,.99)],leather,.004)
rivet('pouch bronze button',(-.225,-.092,.995),.008)

# Original closed helm: separately forged skull, brow, folded visor, breathing slots.
attachment_owner = 'head'
loft('black recessed helm lining',[(0,0,1.75,.073,.085),(0,0,1.90,.09,.09)],black)
loft('continuous ogival helmet dome',[(0,.018,1.895,.123,.119),
    (0,.018,1.915,.122,.12),(0,.022,1.95,.113,.114),
    (0,.022,2.003,.078,.083),(0,.017,2.04,.025,.035),
    (0,.014,2.047,.006,.009)],steel,48,.001)
# Rear and side cheek shell joins the dome without crossing the front eye slit.
vs=[]
for z,rx,ry in ((1.755,.085,.09),(1.82,.108,.105),(1.897,.123,.119)):
    for k in range(33):
        a=1.36+k/32*(math.tau-2*1.36)
        vs.append((rx*math.sin(a),.018-ry*math.cos(a),z))
fs=[(j*33+k,j*33+k+1,(j+1)*33+k+1,(j+1)*33+k)
    for j in range(2) for k in range(32)]
o=mesh('connected helmet rear and cheek shell',vs,fs,steel,.001)
sol=o.modifiers.new('helmet shell thickness','SOLIDIFY');sol.thickness=.004
# Visor is a partial elliptical shell; two true open vertical ventilation gaps per side.
vs=[]; fs=[]
N=40
for row,z in enumerate((1.756,1.80,1.839,1.878)):
    for i in range(N+1):
        a=-1.58+i/N*3.16
        rx=(.077,.097,.115,.122)[row]
        ry=(.122,.166,.165,.148)[row]
        # Two folded cheeks converge on an angular prow and a tapered chin.
        vs.append((rx*math.sin(a),.002-ry*max(0,math.cos(a))**.62,
                   z+(.019*abs(math.sin(a)) if row==0 else 0)))
for row in range(3):
    for i in range(N):
        if row==1 and i in (8,12,27,31):
            continue
        fs.append((row*(N+1)+i,row*(N+1)+i+1,(row+1)*(N+1)+i+1,(row+1)*(N+1)+i))
o=mesh('continuous tapered visor / actual ventilation slots',vs,fs,steel,.0007)
mod=o.modifiers.new('visor sheet thickness','SOLIDIFY'); mod.thickness=.004
tube('visor central keel',[(0,-.12,1.756),(0,-.164,1.8),
    (0,-.163,1.839),(0,-.146,1.878)],.0012,steel)
for row in (0,3):
    tube('visor narrow rolled steel rim',vs[row*(N+1):(row+1)*(N+1)],.0012,steel)
# One continuous curved brow with a level lower edge. The actual empty sight slit
# is 1.8792..1.889, backed by recessed black lining, never a jagged split plate.
vs=[]
for z in (1.889,1.904):
    for k in range(N+1):
        a=-1.58+k/N*3.16
        vs.append((.124*math.sin(a),.002-.153*max(0,math.cos(a))**.62,z))
fs=[(k,k+1,N+2+k,N+1+k) for k in range(N)]
for k in range(N+1):
    a=-1.58+k/N*3.16
    vs.append((.122*math.sin(a),.018-.12*math.cos(a),1.915))
fs += [(N+1+k,N+2+k,2*(N+1)+k+1,2*(N+1)+k) for k in range(N)]
o=mesh('single continuous steel brow above narrow sight slit',vs,fs,steel,.0005)
sol=o.modifiers.new('brow forged thickness','SOLIDIFY');sol.thickness=.005
for s in (-1,1):
    rivet('visor bronze hinge',(s*.12,-.012,1.877),.014)
    tube('skull reinforcing strip',[(s*.014,.115,1.91),(s*.014,.084,2.008),
        (s*.014,.012,2.044),(s*.014,-.071,2.008),(s*.014,-.105,1.944)],.0035,edge)
    for z in (1.78,1.85):
        rivet('visor cheek rivet',(s*.104,-.064,z),.0045)
attachment_owner = 'neck'
loft('gorget / flared steel neck protection',[(0,0,1.64,.143,.124),
     (0,0,1.705,.113,.099),(0,0,1.75,.101,.092)],steel,32,.002)
for i in range(2):
    # Slung collar folds sag asymmetrically; avoid stacked rigid neck cylinders.
    pts=[]
    for j in range(49):
        a=j*math.tau/48
        pts.append(((.12-i*.006)*math.sin(a),-(.112-i*.005)*math.cos(a),
                    1.715+i*.025-.025*math.cos(a)+.008*math.sin(a*2)))
    tube('soft draped wool collar fold',pts,.016,cloth)

# A leaf-point sword held low in the right gauntlet; diamond blade section.
attachment_owner, attachment_role = 'hand.R', 'sword'
sx,sy=-.472,-.069
loft('leather wrapped sword grip',[(sx,sy,.845,.018,.019),(sx,sy,.967,.018,.019)],leather,12)
for i in range(9):
    z=.854+i*.012
    tube('grip diagonal binding',[(sx-.016,sy-.011,z),(sx,sy-.02,z+.006),
         (sx+.016,sy-.011,z+.011)],.0018,edge)
rivet('sword disc pommel',(sx,sy,.988),.027,edge)
plate('swept sword crossguard',[(sx-.104,sy-.012,.846),(sx-.083,sy-.013,.862),
     (sx,sy-.015,.838),(sx+.083,sy-.013,.862),(sx+.104,sy-.012,.846),
     (sx+.065,sy-.012,.828),(sx,sy-.012,.824),(sx-.065,sy-.012,.828)],edge,.003)
blade_v=[]
for z,w in ((.828,.03),(.71,.029),(.19,.021),(.075,.0006)):
    blade_v.extend([(sx-w,sy,z),(sx,sy-.008,z),(sx+w,sy,z),(sx,sy+.008,z)])
blade_f=[(r*4+i,r*4+(i+1)%4,(r+1)*4+(i+1)%4,(r+1)*4+i) for r in range(3) for i in range(4)]
mesh('forged diamond-section blade',blade_v,blade_f,steel,.0007,False)

# Moderate heater shield, own split thorn-and-seed motif; bronze rim is geometry.
attachment_owner, attachment_role = 'hand.L', 'shield'
cx,cy,cz=.526,-.153,1.063
shield_outline=[(-.198,.325),(.152,.35),(.224,.205),(.174,-.151),(.018,-.394),(-.159,-.196)]
def shield_point(x,z,front=0):
    return (cx+x,cy-.055*(1-(x/.23)**2)+front,cz+z)
outline=[shield_point(x,z) for x,z in shield_outline]
plate('heater shield / dark painted hide',outline,leather,.027)
tube('forged shield perimeter',outline+[outline[0]],.011,edge)
for i in range(len(outline)):
    a,b=Vector(outline[i]),Vector(outline[(i+1)%len(outline)])
    for t in (.18,.5,.82):
        p=a.lerp(b,t); p.y-=.012
        rivet('shield perimeter rivet',p,.006)
# Forked rising thorn, intentionally distinct from reference wreath heraldry.
for branch in ([(-.04,-.245),(.01,-.04),(-.018,.09),(.047,.255)],
               [(.002,-.07),(.102,.05),(.118,.144)],
               [(-.01,.02),(-.109,.11),(-.127,.213)]):
    tube('ivory thorn inlay',[shield_point(x,z,-.035) for x,z in branch],.007,heraldry)
for x,z,s in ((.085,.032,1),(-.079,.135,-1),(.028,.193,1),(-.027,-.133,-1)):
    plate('thorn inlay barb',[shield_point(x,z,-.04),shield_point(x+s*.045,z+.033,-.04),
         shield_point(x,z-.023,-.04)],heraldry,.001)

# Product-style light rig; transparent output permits inspection against any ground.
def area(name,pos,power,color,size,target=(0,0,1.1)):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('large warm key',(-3,-4,5),600,(1,.86,.70),3)
area('cool soft fill',(3,-1,3),380,(.70,.82,1),2.5)
area('warm rear edge',(-1,3,4),850,(1,.78,.51),2)
cam=bpy.data.cameras.new('slightly elevated orthographic portrait')
cam.type='ORTHO';cam.ortho_scale=2.46*args.model_scale
o=bpy.data.objects.new('camera',cam);scene.collection.objects.link(o)
# Keep the portrait composition; the separate 48px camera never scales or fits.
o.location=Vector((3.0,-6.5,3.15))*args.model_scale
o.rotation_euler=(Vector((0,0,1.05*args.model_scale))-o.location).to_track_quat('-Z','Y').to_euler()
scene.camera=o
scene['provenance']='Original procedural mesh and shaders; no external models/textures. Seed 31103.'
scene['scope']='Single-pose lookdev only. Not rigged, not an atlas or P03 acceptance.'
portrait_camera=o
model=[obj for obj in scene.objects if obj.type in ('MESH','CURVE')]
root=bpy.data.objects.new('lookdev orientation root',None)
scene.collection.objects.link(root)
for obj in model:
    obj.parent=root  # identity parent; keep every mesh, ring and curve together
root.scale=(args.model_scale,)*3  # ground origin stays (0,0,0), including weapons
bpy.context.view_layer.update()
def render_study():
    depsgraph=bpy.context.evaluated_depsgraph_get()
    world_z=[]
    for obj in model:
        evaluated=obj.evaluated_get(depsgraph)
        surface=evaluated.to_mesh()
        try:
            world_z.extend((evaluated.matrix_world @ vertex.co).z for vertex in surface.vertices)
        finally:
            evaluated.to_mesh_clear()
    model_z_bounds=[min(world_z),max(world_z)]
    blend_path=STAGE/'thornvael-heavy-knight.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    scene.render.filepath=str(OUT/'hero-lookdev.png')
    bpy.ops.render.render(write_still=True)


    def camera_record(camera):
        return {'location':list(camera.location),'rotation_euler':list(camera.rotation_euler),
                'type':camera.data.type,'shift_y':camera.data.shift_y,
                'shift_x':camera.data.shift_x,'ortho_scale':camera.data.ortho_scale}


    def image_record(path):
        # Decode the written PNG with Blender itself: no image package or resize step.
        img=bpy.data.images.load(str(path),check_existing=False)
        w,h=img.size
        pixels=list(img.pixels)
        occupied=[(i%w,h-1-i//w) for i,a in enumerate(pixels[3::4]) if a>0]
        box=([min(p[0] for p in occupied),min(p[1] for p in occupied),
              max(p[0] for p in occupied)+1,max(p[1] for p in occupied)+1]
             if occupied else None)
        solid=[(i%w,h-1-i//w) for i,a in enumerate(pixels[3::4]) if a>128/255]
        solid_box=([min(p[0] for p in solid),min(p[1] for p in solid),
                    max(p[0] for p in solid)+1,max(p[1] for p in solid)+1]
                   if solid else None)
        raw=path.read_bytes()
        result={'file':path.name,'resolution':[w,h],'bytes':len(raw),
                'sha256':hashlib.sha256(raw).hexdigest(),'alpha_bbox':box,
                'nonzero_alpha_pixels':len(occupied),
                'solid_alpha_threshold':'alpha > 128/255 (8-bit alpha > 128)',
                'solid_alpha_bbox':solid_box,
                'solid_alpha_height':solid_box[3]-solid_box[1] if solid_box else 0,
                'alpha_range':[min(pixels[3::4]),max(pixels[3::4])]}
        bpy.data.images.remove(img)
        return result


    report={'blender':bpy.app.version_string,'seed':31103,'samples':args.samples,
            'resolution':[scene.render.resolution_x,scene.render.resolution_y],
            'objects':len(scene.objects),'mail_rings':len(mail_v)//40,
            'mesh_vertices':sum(len(o.data.vertices) for o in scene.objects if o.type=='MESH'),
            'image':str(scene.render.filepath),'blend':str(blend_path),
            'scope':'Single-pose procedural study; no atlas, rig, animation or final visual acceptance.',
            'geometry_revision':'Closed steel toe/vamp under continuous overlapping lames; contained sole; connected dome/brow and narrow level sight slit.',
            'generation':'Original Python meshes, real mail rings and node materials; no external assets.',
            'model_scale':args.model_scale,'model_height':model_z_bounds[1]-model_z_bounds[0],
            'model_z_bounds':model_z_bounds,'model_root_origin':list(root.location),
            'model_root_scale':list(root.scale),'model_geometry_objects':len(model),
            'scale_note':'Uniform complete-geometry root scale about unchanged ground origin, including weapons. Fixed pilot proof camera; portrait camera scales with model to retain framing. No per-facing fitting or image resize.',
            'material_revision':'V4: raised muted olive wool value against unchanged dark rough mail; broad light steel / warm oxhide unchanged. No geometry, rig, camera or detail changes; closed boots and helm preserved.',
            'stage_dir':str(STAGE),'blender_user_resources':os.environ['BLENDER_USER_RESOURCES'],
            'materials':material_recipe,'engine':scene.render.engine,'view_transform':scene.view_settings.view_transform,
            'cycles':{'seed':scene.cycles.seed,'samples':scene.cycles.samples,
                      'denoising':scene.cycles.use_denoising,
                      'adaptive_threshold':scene.cycles.adaptive_threshold},
            'portrait_camera':camera_record(portrait_camera),
            'lights':[{'name':obj.name,'location':list(obj.location),
                       'rotation_euler':list(obj.rotation_euler),
                       'energy':obj.data.energy,'color':list(obj.data.color),'size':obj.data.size}
                      for obj in scene.objects if obj.type=='LIGHT'],
            'world':{'color_linear':[.19,.19,.19,1],'strength':.35},
            'outputs':[image_record(OUT/'hero-lookdev.png')]}
    if args.game_proof:
        data=bpy.data.cameras.new('pilot-contract orthographic game camera')
        data.type='ORTHO'
        data.ortho_scale=3.0
        data.shift_y=.35
        camera=bpy.data.objects.new('game proof camera',data)
        scene.collection.objects.link(camera)
        camera.location=(0,-6,5.2)
        camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.camera=camera
        scene.render.resolution_x=scene.render.resolution_y=48
        names=[]
        facings=[]
        for direction,label in ((0,'S'),(4,'W'),(8,'N'),(12,'E')):
            root.rotation_euler.z=math.radians(-direction*22.5)
            bpy.context.view_layer.update()
            name='game-%02d.png'%direction
            scene.render.filepath=str(OUT/name)
            bpy.ops.render.render(write_still=True)
            info=image_record(OUT/name)
            info.update({'direction':direction,'facing':label,
                         'rotation_z_degrees':-direction*22.5})
            names.append(name)
            facings.append(info)
        report['game_proof']={'cell':[48,48],'anchor':[.5,.85],
            'directions':[0,4,8,12],
            'camera':{'location':[0,-6,5.2],'shift_y':.35,'ortho_scale':3.0},
            'camera_exact':camera_record(camera),
            'files':names,'frames':facings,
            'method':'Direct Cycles 48x48 RGBA renders, no resizing, same material/light rig as portrait.',
            'direction_convention':'0 S, 4 W, 8 N, 12 E; root Z = -index * 22.5 degrees',
            'anchor_origin':'Model ground origin (0,0,0) projects to (24,40.8), top-left pixel coordinates.',
            'pilot_match':'render-unit.py camera pose/scale/anchor only; Cycles material study differs from pilot Workbench shading.'}
        # Leave the saved study in the portrait pose, with both cameras available.
        root.rotation_euler.z=0
        scene.camera=portrait_camera
        scene.render.resolution_x=args.size
        scene.render.resolution_y=round(args.size*1.2)
        scene.render.filepath=str(OUT/'hero-lookdev.png')
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        for info in facings:
            box=info['alpha_bbox']
            if (not box or box[0]<=0 or box[1]<=0 or box[2]>=48 or box[3]>=48
                    or not 24<=box[3]-box[1]<=36):
                raise RuntimeError('game proof empty, clipped or outside 24..36px height: '+str(info))
        if len({info['sha256'] for info in facings})!=4:
            raise RuntimeError('game proof directions must be distinct')
    report['blend_bytes']=blend_path.stat().st_size
    report['generator_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    report['elapsed_seconds']=round(time.monotonic()-start,2)
    (OUT/'render-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('HERO_LOOKDEV_OK '+json.dumps(report))


if not args.motion_build:
    render_study()
