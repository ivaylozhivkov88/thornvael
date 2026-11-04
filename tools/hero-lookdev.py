"""Original Thornvael heavy knight, a single procedural Blender lookdev study.

Run from repository root (Blender 5.2.3, no external assets or dependencies):
  blender -b -t 8 -P game/tools/hero-lookdev.py -- [--samples 48] [--size 1100]
Outputs stay in .planning/art-concepts/hero-lookdev; blend/cache in tooling.
Not an atlas generator, animation rig, or replacement for render-unit.py.
"""
import argparse
import json
import math
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
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
OUT.mkdir(parents=True, exist_ok=True)
STAGE.mkdir(parents=True, exist_ok=True)
random.seed(31103)
start = time.monotonic()
bpy.ops.wm.read_factory_settings(use_empty=True)
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
    ramp.color_ramp.elements[0].color = (*(c * .43 for c in base), 1)
    ramp.color_ramp.elements[1].position = .85
    ramp.color_ramp.elements[1].color = (*(min(1, c * 1.35) for c in base), 1)
    l.new(noise.outputs['Fac'], ramp.inputs[0])
    l.new(ramp.outputs[0], bs.inputs['Base Color'])
    remap = n.new('ShaderNodeMapRange')
    remap.inputs['To Min'].default_value = rough - .12
    remap.inputs['To Max'].default_value = min(.95, rough + .12)
    l.new(noise.outputs['Fac'], remap.inputs['Value'])
    l.new(remap.outputs['Result'], bs.inputs['Roughness'])
    bump = n.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .24
    bump.inputs['Distance'].default_value = .0009 if metal else .0013
    l.new(noise.outputs['Fac'], bump.inputs['Height'])
    l.new(bump.outputs['Normal'], bs.inputs['Normal'])
    return m


steel = material('01 / mottled forged steel', (.24, .275, .29), 1, .44, 85)
edge = material('02 / rubbed warm bronze', (.29, .205, .105), .88, .43, 110)
mail = material('03 / dark iron mail', (.095, .108, .113), .9, .52, 40)
leather = material('04 / worn oxhide', (.055, .031, .022), 0, .77, 125)
cloth = material('05 / charcoal olive wool', (.045, .052, .041), 0, .9, 180)
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
    return o


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
    return o


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
    o = mesh(name, vs, fs, mat, .002)
    mod = o.modifiers.new('real plate thickness', 'SOLIDIFY')
    mod.thickness = .006
    return o


def rivet(name, xyz, radius=.006, mat=edge):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=5, radius=radius, location=xyz)
    o = bpy.context.object
    o.name = name
    o.scale.y = .5
    o.data.materials.append(mat)
    return o


def band(name, x, y, z, rx, ry, height, mat=leather):
    return loft(name, [(x,y,z-height/2,rx,ry), (x,y,z+height/2,rx,ry)], mat)


# Core anatomy: roughly 7.4 heads tall, narrow waist and planted weight.
loft('padded torso under harness', [(0,0,1.04,.17,.115),(0,0,1.32,.195,.13),
     (0,.01,1.56,.24,.135),(0,.015,1.68,.19,.11)], cloth)
loft('high mail collar', [(0,0,1.59,.095,.085),(0,0,1.81,.088,.08)], mail)
loft('breastplate / tapered forged cuirass', [(0,-.006,1.12,.166,.126),
     (0,-.008,1.27,.18,.152),(0,-.008,1.46,.23,.174),(0,0,1.59,.235,.132),
     (0,0,1.65,.155,.095)], steel, 40, .003)
for s in (-1,1):
    tube('cuirass raised seam', [(s*.03,-.107,1.64),(s*.135,-.145,1.55),
         (s*.15,-.161,1.44),(s*.10,-.157,1.29),(s*.01,-.135,1.17)], .0035, edge)
    for z in (1.2,1.28,1.36):
        rivet('harness side pin', (s*.167,-.08,z), .005)
for i in range(3):
    z = 1.105 - i*.047
    loft('overlapping fauld %d' % i, [(0,0,z-.03,.18+i*.014,.132+i*.006),
         (0,0,z+.029,.168+i*.012,.126+i*.005)], steel, 36, .002)
    pts = [( (.18+i*.014)*math.sin(t), -(.132+i*.006)*math.cos(t), z-.029)
           for t in [j*math.tau/48 for j in range(49)]]
    tube('fauld rolled bronze hem', pts, .0025, edge)

# Flexible split wool skirt; individual folds retain the long adult leg silhouette.
for s in (-1,1):
    vs=[]
    for j,z in enumerate((1.065,.86,.65,.48)):
        for i in range(15):
            t = -.1 + i/14*2.8
            flare = .18+j*.032
            vs.append((s*(.033+flare*math.sin(t)), -.02-flare*.78*math.cos(t),
                       z + (.018*math.sin(i*1.4) if j==3 else 0)))
    fs=[(j*15+i,j*15+i+1,(j+1)*15+i+1,(j+1)*15+i) for j in range(3) for i in range(14)]
    o=mesh('split wool skirt',vs,fs,cloth)
    mod=o.modifiers.new('wool thickness','SOLIDIFY'); mod.thickness=.005

# Thousands of real interlocked wire rings, combined into one mesh (no textures).
mail_v,mail_f=[],[]
def ring(center, radius=.009, tilt=0):
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
            ring((x+math.sin(t)*.07,-.008-.085*math.cos(t),z),.0085,.4*(-1 if j%2 else 1))
mesh('hand-woven iron mail / exposed skirt and sleeves',mail_v,mail_f,mail)

# Layered shoulder plates: curved saddle shells with overlapping scalloped hems.
for s in (-1,1):
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
    loft('upper leather sleeve',[(x,0,1.32,.073,.078),(s*.29,.005,1.57,.077,.08)],leather)
    ex=s*.39
    plate('elbow wing',[(ex-.072,-.094,1.32),(ex,-.115,1.38),
          (ex+.075,-.09,1.30),(ex+.065,-.09,1.23),(ex-.058,-.096,1.24)],bulge=.018)
    loft('tapered vambrace',[(s*.448,-.045,1.04,.056,.065),
         (s*.416,-.015,1.22,.073,.077),(s*.397,-.005,1.29,.075,.078)],steel,24,.002)
    for z,x in ((1.23,.409),(1.07,.443)):
        band('forearm leather securing strap',s*x,-.025,z,.076 if z>1.1 else .061,.083 if z>1.1 else .071,.022)
        rivet('strap stud',(s*x,-.11,z),.006)
    loft('gauntlet cuff',[(s*.455,-.049,1.035,.068,.072),(s*.465,-.055,.99,.053,.055)],steel,20,.002)
    loft('closed gauntlet',[(s*.47,-.06,1.0,.047,.054),(s*.47,-.066,.9,.05,.048),
         (s*.467,-.06,.875,.039,.04)],leather,16)
    for finger in range(4):
        xx=s*.47+(finger-1.5)*.021
        for seg in range(3):
            plate('finger plate',[(xx-.009,-.111,.982-seg*.024),
                (xx+.009,-.111,.982-seg*.024),(xx+.009,-.117,.958-seg*.024),
                (xx-.009,-.117,.958-seg*.024)],bulge=.004)
    # Leg: cuisse, shield-like poleyn, long greave, leather ankle, articulated foot.
    lx=s*.125
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
    plate('angular knee poleyn',[(lx-.072,-.09,.615),(lx,-.125,.65),
        (lx+.073,-.09,.61),(lx+.067,-.102,.546),(lx,-.132,.515),
        (lx-.067,-.102,.546)],bulge=.024)
    band('knee strap',lx,0,.575,.088,.091,.026)
    loft('long fitted greave',[(lx,-.004,.19,.056,.063),(lx,0,.38,.064,.08),
        (lx,0,.51,.071,.078)],steel,24,.002)
    tube('greave medial ridge',[(lx,-.068,.19),(lx,-.087,.37),(lx,-.084,.51)],.003,edge)
    band('ankle leather',lx,0,.145,.058,.065,.095)
    # Foot points toward -Y and sits flat, with a low sole rather than a sphere.
    loft('broad leather boot',[(lx,-.049,.047,.071,.145),(lx,-.05,.079,.073,.142),
        (lx,-.035,.125,.066,.123),(lx,.015,.19,.053,.058)],leather,28,.003)
    for i in range(4):
        y=-.15+i*.041
        plate('sabatons / articulated instep',[(lx-.06,y-.021,.086+i*.016),
            (lx+.06,y-.021,.086+i*.016),(lx+.057,y+.025,.105+i*.016),
            (lx-.057,y+.025,.105+i*.016)],bulge=.008)

# Belt, buckle, a practical hanging pouch; no borrowed heraldic motifs.
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
loft('black recessed helm lining',[(0,0,1.75,.105,.10),(0,0,1.97,.105,.10)],black)
loft('domed helmet skull',[(0,.008,1.888,.119,.118),(0,.011,1.935,.119,.116),
    (0,.012,1.99,.096,.098),(0,.012,2.026,.058,.065),(0,.012,2.04,.009,.016)],steel,40,.002)
# Visor is a partial elliptical shell; two true open vertical ventilation gaps per side.
vs=[]; fs=[]
N=28
for row,z in enumerate((1.756,1.80,1.839,1.867)):
    for i in range(N+1):
        a=-1.58+i/N*3.16
        rx=(.102,.115,.122,.122)[row]
        ry=(.107,.132,.14,.137)[row]
        vs.append((rx*math.sin(a),.002-ry*math.cos(a),z+(.009*abs(math.sin(a)) if row==0 else 0)))
for row in range(3):
    for i in range(N):
        if row==1 and i in (5,8,19,22):
            continue
        fs.append((row*(N+1)+i,row*(N+1)+i+1,(row+1)*(N+1)+i+1,(row+1)*(N+1)+i))
o=mesh('closed folded visor / actual ventilation slots',vs,fs,steel,.0015)
mod=o.modifiers.new('visor sheet thickness','SOLIDIFY'); mod.thickness=.004
tube('visor central keel',[(0,-.107,1.756),(0,-.132,1.8),(0,-.14,1.84),(0,-.137,1.867)],.0027,edge)
for row in (0,3):
    tube('visor rolled rim',vs[row*(N+1):(row+1)*(N+1)],.003,edge)
# Horizontal sight slit remains empty between 1.867 and 1.888.
for s in (-1,1):
    rivet('visor bronze hinge',(s*.12,-.012,1.877),.014)
    tube('skull reinforcing strip',[(s*.014,.115,1.91),(s*.014,.084,2.008),
        (s*.014,.012,2.044),(s*.014,-.071,2.008),(s*.014,-.105,1.944)],.0035,edge)
    for z in (1.78,1.85):
        rivet('visor cheek rivet',(s*.104,-.064,z),.0045)
loft('gorget / flared steel neck protection',[(0,0,1.64,.143,.124),
     (0,0,1.705,.113,.099),(0,0,1.75,.101,.092)],steel,32,.002)
for i in range(2):
    band('wool collar fold',0,-.003,1.714+i*.026,.112-i*.005,.105-i*.004,.027,cloth)

# A leaf-point sword held low in the right gauntlet; diamond blade section.
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
cam.type='ORTHO';cam.ortho_scale=2.46
o=bpy.data.objects.new('camera',cam);scene.collection.objects.link(o)
o.location=(3.0,-6.5,3.15)
o.rotation_euler=(Vector((0,0,1.05))-o.location).to_track_quat('-Z','Y').to_euler()
scene.camera=o
scene['provenance']='Original procedural mesh and shaders; no external models/textures. Seed 31103.'
scene['scope']='Single-pose lookdev only. Not rigged, not an atlas or P03 acceptance.'
bpy.ops.wm.save_as_mainfile(filepath=str(STAGE/'thornvael-heavy-knight.blend'))
scene.render.filepath=str(OUT/'hero-lookdev.png')
bpy.ops.render.render(write_still=True)
report={'blender':bpy.app.version_string,'seed':31103,'samples':args.samples,
        'resolution':[scene.render.resolution_x,scene.render.resolution_y],
        'objects':len(scene.objects),'mail_rings':len(mail_v)//40,
        'mesh_vertices':sum(len(o.data.vertices) for o in scene.objects if o.type=='MESH'),
        'elapsed_seconds':round(time.monotonic()-start,2),
        'image':str(scene.render.filepath),'blend':str(STAGE/'thornvael-heavy-knight.blend')}
(OUT/'render-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('HERO_LOOKDEV_OK '+json.dumps(report))
