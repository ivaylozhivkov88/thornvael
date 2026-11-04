"""Bounded original heavy-hero motion diagnostic; never a production atlas.

From the workspace root, with Blender 5.2:
  blender -b -t 8 --python-exit-code 1 -P game/tools/hero-motion.py -- --preflight
  blender -b -t 8 --python-exit-code 1 -P game/tools/hero-motion.py --
  blender -b -t 8 --python-exit-code 1 -P game/tools/hero-motion.py -- --verify
  python game/tools/hero-motion.py --previews

All pose angles below are right-handed local XYZ degrees, converted once to radians.
Facing is root Z = -direction * 22.5 degrees. Every pose starts at the exact snapshot.
Only 1 stand + 4 walk + 4 immediate-contact attack keys in four cardinal directions.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import runpy
import shutil
import struct
import sys
import time
import zlib

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parent
OUT = ROOT / '.planning/art-concepts/hero-motion'
STAGE = ROOT / '.planning/tooling/hero-motion'
GENERATOR = GAME / 'tools/hero-lookdev.py'
SCHEMA = GAME / 'docs/HERO-MOTION-SCHEMA.md'
DIRECTIONS = [0, 4, 8, 12]
CLIPS = {'stand': 1, 'walk': 4, 'attack': 4}
EPSILON = 1e-6


def require(test, message):
    if not test:
        raise RuntimeError(message)


def source_records():
    return [{'file': path.relative_to(ROOT).as_posix(),
             'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            for path in (GENERATOR, Path(__file__).resolve(), SCHEMA)]


def decode_rgba(path):
    """Decode PNG scanlines, not Blender's linear float image buffer or file hashes."""
    data = path.read_bytes()
    require(data[:8] == b'\x89PNG\r\n\x1a\n', f'{path.name}: invalid PNG')
    compressed = bytearray()
    offset = 8
    dimensions = None
    while offset < len(data):
        length = struct.unpack('>I', data[offset:offset+4])[0]
        kind = data[offset+4:offset+8]
        payload = data[offset+8:offset+8+length]
        crc = struct.unpack('>I', data[offset+8+length:offset+12+length])[0]
        require(zlib.crc32(kind+payload) & 0xffffffff == crc, 'PNG CRC mismatch')
        if kind == b'IHDR':
            dimensions = struct.unpack('>IIBBBBB', payload)
        elif kind == b'IDAT':
            compressed.extend(payload)
        offset += length+12
        if kind == b'IEND':
            break
    require(dimensions == (48, 48, 8, 6, 0, 0, 0), f'{path.name}: expected RGBA8/48x48')
    raw = zlib.decompress(compressed)
    require(len(raw) == 48*(1+48*4), 'Unexpected PNG scanline size')
    pixels = bytearray()
    prior = bytearray(192)
    for row in range(48):
        method = raw[row*193]
        scan = bytearray(raw[row*193+1:(row+1)*193])
        require(method in range(5), 'Unknown PNG filter')
        for i in range(192):
            a, b, c = (scan[i-4] if i >= 4 else 0), prior[i], (prior[i-4] if i >= 4 else 0)
            if method == 1:
                prediction = a
            elif method == 2:
                prediction = b
            elif method == 3:
                prediction = (a+b)//2
            elif method == 4:
                p = a+b-c
                distances = [abs(p-a), abs(p-b), abs(p-c)]
                prediction = (a, b, c)[distances.index(min(distances))]
            else:
                prediction = 0
            scan[i] = (scan[i]+prediction) & 255
        pixels.extend(scan)
        prior = scan
    return bytes(pixels)


def pixel_record(path):
    pixels = decode_rgba(path)
    occupied = [(i % 48, i // 48) for i, a in enumerate(pixels[3::4]) if a]
    solid = [(i % 48, i // 48) for i, a in enumerate(pixels[3::4]) if a > 128]
    require(occupied and solid, f'{path.name}: empty image')
    require(all(0 < x < 47 and 0 < y < 47 for x, y in occupied), f'{path.name}: alpha touches border')
    def box(points):
        return [min(p[0] for p in points), min(p[1] for p in points),
                max(p[0] for p in points)+1, max(p[1] for p in points)+1]
    # Visible motion hash masks fully transparent RGB; reset equality never masks it.
    visible = bytes(c if pixels[i//4*4+3] else 0 for i, c in enumerate(pixels))
    return {'file': path.name, 'resolution': [48, 48], 'alpha_bbox': box(occupied),
            'solid_alpha_bbox': box(solid), 'solid_alpha_height': box(solid)[3]-box(solid)[1],
            'nonzero_alpha_pixels': len(occupied), 'solidPixels': len(solid),
            'alphaBorderClear': True,
            'decodedRgbaSha256': hashlib.sha256(pixels).hexdigest(),
            'visibleRgbaSha256': hashlib.sha256(visible).hexdigest(),
            'pngFileSha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def previews():
    from PIL import Image, ImageDraw
    if CLIPS['walk'] == 8 and not (OUT / 'motion-report.json').exists():
        evidence = json.loads((STAGE / 'failed-pose.json').read_text())
        require(evidence['sources'] == source_records(), 'Stale failure preview sources')
        phase, direction = evidence['frame'], evidence['direction']
        old = ROOT / '.planning/art-concepts/hero-motion' / f'walk-{direction:02}-{phase//2:02}.png'
        sources = [('OLD v1 - four-key reference', old),
                   ('NEW v2 - FAILED knee coverage', OUT / 'FAILED-diagnostic-pose.png')]
        sheet = Image.new('RGB', (1000, 340), '#242a26')
        draw = ImageDraw.Draw(sheet)
        draw.text((12, 10), 'DIAGNOSTIC FAILURE COMPARISON - NOT IN-GAME - NOT PRODUCTION', fill='white')
        draw.text((12, 28), f'Cardinal {direction:02}; new phase {phase}/8. Single failed pose; no approved new gait loop.', fill='#ffce80')
        gif = []
        for column, (label, path) in enumerate(sources):
            original = Image.open(path).convert('RGBA')
            enlarged = original.resize((192, 192), Image.Resampling.NEAREST)
            x = 20+column*490
            draw.text((x, 60), label, fill='white')
            sheet.paste(enlarged, (x, 90), enlarged)
            sheet.paste(original, (x+230, 200), original)
            draw.text((x+225, 255), 'native 48px', fill='white')
            panel = Image.new('RGB', (650, 320), '#242a26')
            text = ImageDraw.Draw(panel)
            text.text((12, 8), 'DIAGNOSTIC - NOT IN-GAME - NOT PRODUCTION', fill='white')
            text.text((12, 28), label, fill='#ffce80')
            text.text((12, 47), 'Alternating OLD/NEW stills, not a completed locomotion loop', fill='white')
            panel.paste(enlarged, (220, 90), enlarged)
            gif.append(panel)
        draw.text((20, 306), '4x nearest preview; native PNGs unchanged. Actual scene failure preserved; no image alignment.', fill='white')
        sheet.save(OUT / 'diagnostic-contact-sheet.png')
        gif[0].save(OUT / 'diagnostic-loop.gif', save_all=True, append_images=gif[1:],
                    duration=1000, loop=0, disposal=2)
        print('PREVIEWS_NOT_READY single failed pose old/new comparison only')
        return
    report = json.loads((OUT / 'motion-report.json').read_text())
    require(report['sources'] == source_records(), 'Stale sources: regenerate before previews')
    if report['version'] == 2:
        old = ROOT / '.planning/art-concepts/hero-motion'
        sheet = Image.new('RGB', (1450, 1080), '#242a26')
        draw = ImageDraw.Draw(sheet)
        draw.text((12, 8), 'DIAGNOSTIC ONLY - NOT IN-GAME - NOT PRODUCTION | native 48px / nearest 2x | attack0 CONTACT', fill='white')
        for block, (folder, title, count) in enumerate([(OUT, 'NEW v2 / 8 walk keys', 8), (old, 'OLD v1 / 4 walk keys', 4)]):
            top = 35+block*520
            draw.text((12, top), title, fill='#ffce80')
            keys = [('stand', 0)]+[('walk', i) for i in range(count)]+[('attack', i) for i in range(4)]
            for row, direction in enumerate(DIRECTIONS):
                y = top+38+row*116
                draw.text((5, y+30), f'{direction:02}', fill='white')
                for column, (clip, key) in enumerate(keys):
                    x = 34+column*107
                    sprite = Image.open(folder / f'{clip}-{direction:02}-{key:02}.png').convert('RGBA')
                    enlarged = sprite.resize((96, 96), Image.Resampling.NEAREST)
                    sheet.paste(enlarged, (x, y), enlarged)
                    if row == 0:
                        draw.text((x, top+20), f'{clip} {key}', fill='white')
                neutral = Image.open(folder / f'stand-{direction:02}-00.png').convert('RGBA')
                sheet.paste(neutral, (1390, y+25), neutral)
        sheet.save(OUT / 'diagnostic-contact-sheet.png')
        frames = []
        sequence = [('stand', 0)]*2+[('walk', i) for i in range(8)]*2+[('attack', i) for i in range(4)]+[('stand', 0)]*2
        for clip, key in sequence:
            canvas = Image.new('RGB', (650, 352), '#242a26')
            text = ImageDraw.Draw(canvas)
            text.text((10, 8), 'DIAGNOSTIC ONLY - NOT IN-GAME - NOT PRODUCTION', fill='white')
            text.text((10, 26), f'{clip} / new key {key}' + (' CONTACT' if (clip, key) == ('attack', 0) else ''), fill='#ffce80')
            for row, (folder, title) in enumerate([(old, 'OLD v1'), (OUT, 'NEW v2')]):
                text.text((10, 90+row*140), title, fill='white')
                source_key = key//2 if row == 0 and clip == 'walk' else key
                for column, direction in enumerate(DIRECTIONS):
                    x, y = 100+column*130, 63+row*140
                    sprite = Image.open(folder / f'{clip}-{direction:02}-{source_key:02}.png').convert('RGBA')
                    enlarged = sprite.resize((96, 96), Image.Resampling.NEAREST)
                    canvas.paste(enlarged, (x, y), enlarged)
                    text.text((x+35, y+100), f'{direction:02}', fill='white')
            text.text((10, 330), '2x NEAREST; fixed camera/root; no image alignment. Old walk keys held twice.', fill='white')
            frames.append(canvas)
        frames[0].save(OUT / 'diagnostic-loop.gif', save_all=True, append_images=frames[1:], duration=150, loop=0, disposal=2)
        print('PREVIEWS_OK new v2 vs old v1 direct-pose diagnostic')
        return
    # Original native cells are retained; only this explicitly labelled diagnostic is magnified.
    walk_count = report['clips']['walk']
    sheet = Image.new('RGB', (1064+(walk_count-4)*107, 520), '#242a26')
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 8), 'DIAGNOSTIC ONLY - NOT IN-GAME | native 48px + nearest 2x | attack 0 = CONTACT', fill='white')
    draw.text((1008, 28), 'native', fill='#eee8cb')
    keys = [('stand', 0)] + [('walk', i) for i in range(walk_count)] + [('attack', i) for i in range(4)]
    for row, direction in enumerate(DIRECTIONS):
        y = 46+row*116
        draw.text((8, y+24), f'{direction:02}', fill='white')
        for column, (clip, frame) in enumerate(keys):
            image = Image.open(OUT / f'{clip}-{direction:02}-{frame:02}.png').convert('RGBA')
            x = 32+column*107
            sheet.paste(image.resize((96, 96), Image.Resampling.NEAREST), (x, y),
                        image.resize((96, 96), Image.Resampling.NEAREST))
            # Small native-size view alongside each enlarged frame, without changing outputs.
            if row == 0:
                draw.text((x, 28), f'{clip} {frame}', fill='#eee8cb')
        native = Image.open(OUT / f'stand-{direction:02}-00.png').convert('RGBA')
        sheet.paste(native, (1008+(walk_count-4)*107, y+32), native)
    sheet.save(OUT / 'diagnostic-contact-sheet.png')
    frames = []
    sequence = [('stand', 0)]*2 + [('walk', i) for i in range(walk_count)]*2 + [('attack', i) for i in range(4)] + [('stand', 0)]*2
    for clip, frame in sequence:
        canvas = Image.new('RGB', (488, 180), '#242a26')
        text = ImageDraw.Draw(canvas)
        text.text((8, 7), 'DIAGNOSTIC ONLY - NOT IN-GAME / 2x NEAREST', fill='white')
        text.text((8, 23), f'{clip} {frame}' + (' CONTACT' if (clip, frame) == ('attack', 0) else ''), fill='#eee8cb')
        for column, direction in enumerate(DIRECTIONS):
            image = Image.open(OUT / f'{clip}-{direction:02}-{frame:02}.png').convert('RGBA')
            canvas.paste(image.resize((96, 96), Image.Resampling.NEAREST), (10+column*120, 54),
                         image.resize((96, 96), Image.Resampling.NEAREST))
            text.text((42+column*120, 156), f'{direction:02}', fill='white')
        frames.append(canvas)
    frames[0].save(OUT / 'diagnostic-loop.gif', save_all=True, append_images=frames[1:],
                   duration=180, loop=0, disposal=2)
    print('PREVIEWS_OK diagnostic-contact-sheet.png diagnostic-loop.gif')


def main():
    argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preflight', action='store_true')
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--previews', action='store_true')
    parser.add_argument('--profile', choices=['v1', 'v2'], default='v1')
    parser.add_argument('--out-dir', help='Explicit workspace-only evidence directory; default profile paths retained')
    parser.add_argument('--stage-dir', help='Explicit workspace-only cache/proof directory')
    parser.add_argument('--probe-internal-caps', action='store_true',
                        help='V2 negative: restore the former buried trouser cap endpoints in actual mesh')
    parser.add_argument('--probe-stance', action='store_true',
                        help='V2 evaluated-scene negative: translate the full R leg at stance phase 2')
    parser.add_argument('--probe-coverage', action='store_true',
                        help='Negative test: detach an actual elbow cuff mesh; must fail preflight')
    parser.add_argument('--probe-partial-seam', action='store_true',
                        help='Negative test: detach a quarter sleeve seam, retaining the closed cuff')
    options = parser.parse_args(argv)
    global OUT, STAGE, CLIPS
    if options.profile == 'v2':
        OUT = ROOT / '.planning/art-concepts/hero-locomotion'
        STAGE = ROOT / '.planning/tooling/hero-locomotion'
        CLIPS = {'stand': 1, 'walk': 8, 'attack': 4}
    def bounded_folder(value):
        folder = Path(value)
        folder = (ROOT / folder).resolve() if not folder.is_absolute() else folder.resolve()
        require(folder != ROOT and folder.is_relative_to(ROOT), 'Evidence/cache must stay inside workspace')
        return folder
    if options.out_dir:
        OUT = bounded_folder(options.out_dir)
    if options.stage_dir:
        STAGE = bounded_folder(options.stage_dir)
    require(OUT != STAGE and not OUT.is_relative_to(STAGE) and not STAGE.is_relative_to(OUT),
            'Evidence and cache directories must be separate')
    require(not options.probe_internal_caps or options.profile == 'v2', '--probe-internal-caps requires v2')
    require(not options.probe_stance or options.profile == 'v2', '--probe-stance requires v2')
    if options.previews:
        previews()
        return
    import bpy
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Matrix, Vector
    from mathutils.bvhtree import BVHTree
    started = time.monotonic()
    sources = source_records()
    OUT.mkdir(parents=True, exist_ok=True)
    STAGE.mkdir(parents=True, exist_ok=True)
    # Import the complete existing own-source builder, without portrait renders or v4 writes.
    saved_argv = sys.argv[:]
    sys.argv = [str(GENERATOR), '--', '--motion-build', '--model-scale', '1.15',
                '--samples', '32', '--size', '96', '--out-dir', str(OUT), '--stage-dir', str(STAGE)]
    if options.profile == 'v2':
        sys.argv.append('--locomotion-build')
    try:
        built = runpy.run_path(str(GENERATOR), run_name='hero_motion_builder')
    finally:
        sys.argv = saved_argv
    scene, root, geometry = built['scene'], built['root'], built['model']
    scene.cycles.use_animated_seed = False
    scene.render.image_settings.color_depth = '8'
    scene.render.resolution_x = scene.render.resolution_y = 48
    scene.render.use_file_extension = True
    data = bpy.data.cameras.new('fixed production convention / motion diagnostic')
    data.type, data.ortho_scale, data.shift_y = 'ORTHO', 3.0, .35
    camera = bpy.data.objects.new('motion game camera', data)
    scene.collection.objects.link(camera)
    camera.location = (0, -6, 5.2)
    camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    scene['scope'] = 'Articulated cardinal diagnostic, not production animation or final art acceptance'
    scene['motion_sources'] = json.dumps(sources)
    scene['attack_timing'] = '0 CONTACT, 1 followthrough, 2 recovery, 3 ready; no pre-hit windup'
    # Pivots in unscaled original model coordinates. Root alone carries uniform 1.15 scale.
    specs = [('pelvis', 'root', (0, 0, 1.02)),
             ('chest', 'pelvis', (0, 0, 1.20)),
             ('neck', 'chest', (0, 0, 1.66)), ('head', 'neck', (0, 0, 1.76))]
    for side, sign in [('L', 1), ('R', -1)]:
        specs.extend([(f'upperarm.{side}', 'chest', (sign*.24, .005, 1.60)),
                      (f'forearm.{side}', f'upperarm.{side}', (sign*.37, -.005, 1.30)),
                      (f'hand.{side}', f'forearm.{side}', (sign*.465, -.055, 1.0)),
                      (f'thigh.{side}', 'pelvis', (sign*.125, 0, .96)),
                      (f'shin.{side}', f'thigh.{side}', (sign*.125, 0, .58)),
                      (f'foot.{side}', f'shin.{side}', (sign*.125, 0, .17))])
    joints, pivots = {'root': root}, {'root': Vector((0, 0, 0))}
    root['joint_id'] = 'root'
    for name, parent, position in specs:
        joint = bpy.data.objects.new('joint / '+name, None)
        scene.collection.objects.link(joint)
        joint['joint_id'] = name
        joint.parent = joints[parent]
        pivots[name] = Vector(position)
        joint.matrix_parent_inverse = Matrix.Identity(4)
        joint.matrix_basis = Matrix.Translation(pivots[name]-pivots[parent])
        joints[name] = joint
    bpy.context.view_layer.update()

    def flatten(matrix):
        values = [float(matrix[row][column]) for row in range(4) for column in range(4)]
        require(all(math.isfinite(v) for v in values), 'Nonfinite transform')
        return values

    def delta(a, b):
        return max(abs(x-y) for x, y in zip(flatten(a), flatten(b)))

    binding_deltas = []
    for obj in geometry:
        owner = obj.get('motion_owner')
        require(owner in joints, 'Unbound geometry: '+obj.name)
        world = obj.matrix_world.copy()
        obj.parent = joints[owner]
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_world = world
        bpy.context.view_layer.update()
        binding_deltas.append(delta(world, obj.matrix_world))
    actual_geometry = [o for o in scene.objects if o.type in ('MESH', 'CURVE')]
    unbound = [o.name for o in actual_geometry if o.get('motion_owner') not in joints or o.parent != joints.get(o.get('motion_owner'))]
    # Modifiers/constraints could introduce a second binding despite a correct parent.
    multiple = [o.name for o in actual_geometry if o.constraints or any(m.type == 'ARMATURE' for m in o.modifiers)]
    require(set(actual_geometry) == set(geometry) and not unbound and not multiple, 'Binding coverage mismatch')
    require(max(binding_deltas) <= EPSILON, 'Binding changed world transform')
    animated = list(joints.values())+geometry
    snapshots = {o.name: {'location': o.location.copy(), 'rotation': o.rotation_euler.copy(),
                         'scale': o.scale.copy(), 'inverse': o.matrix_parent_inverse.copy(),
                         'basis': o.matrix_basis.copy(), 'world': o.matrix_world.copy()}
                 for o in animated}
    weapons = [o for o in geometry if o.get('motion_role') in ('sword', 'shield')]
    require({o['motion_role'] for o in weapons} == {'sword', 'shield'}, 'Missing weapon geometry')

    def local_matrix(obj):
        return obj.parent.matrix_world.inverted() @ obj.matrix_world

    attachments = [{'object': o.name, 'parent': o['motion_owner'], 'role': o['motion_role'],
                    'restLocal': flatten(local_matrix(o))} for o in weapons]
    require(all(a['parent'].startswith(('hand.', 'forearm.')) for a in attachments), 'Weapon not wrist-bound')

    def attachment_rows():
        rows = [{'object': o.name, 'local': flatten(local_matrix(o))} for o in weapons]
        for row, rest in zip(rows, attachments):
            require(max(abs(x-y) for x, y in zip(row['local'], rest['restLocal'])) <= EPSILON,
                    'Weapon detached: '+row['object'])
        return rows

    def reset():
        scene.frame_set(0)
        for obj in animated:
            saved = snapshots[obj.name]
            obj.location, obj.rotation_euler, obj.scale = saved['location'], saved['rotation'], saved['scale']
            obj.matrix_parent_inverse = saved['inverse']
        bpy.context.view_layer.update()
        measured = max(max(delta(o.matrix_basis, snapshots[o.name]['basis']),
                           delta(o.matrix_world, snapshots[o.name]['world'])) for o in animated)
        require(measured <= EPSILON, f'Reset drift {measured}')
        attachment_rows()
        return measured

    def evaluated_vertices(objects):
        graph = bpy.context.evaluated_depsgraph_get()
        points = []
        for obj in objects:
            evaluated = obj.evaluated_get(graph)
            mesh = evaluated.to_mesh()
            try:
                points.extend(evaluated.matrix_world @ v.co for v in mesh.vertices)
            finally:
                evaluated.to_mesh_clear()
        return points

    rest_points = evaluated_vertices(geometry)
    rest_bounds = [[min(v[i] for v in rest_points) for i in range(3)],
                   [max(v[i] for v in rest_points) for i in range(3)]]
    feet = {side: [o for o in geometry if o['motion_owner'] == 'foot.'+side] for side in ('L', 'R')}
    rest_sole = {side: min(v.z for v in evaluated_vertices(objects)) for side, objects in feet.items()}
    v2 = options.profile == 'v2'
    stride, lift, pelvis_drop = .24, .025, .012
    rest_legs = [{'side': side, **{field: flatten(joints[prefix+side].evaluated_get(
        bpy.context.evaluated_depsgraph_get()).matrix_world) for field, prefix in
        [('hipWorld', 'thigh.'), ('kneeWorld', 'shin.'), ('ankleWorld', 'foot.')]}}
        for side in ('L', 'R')]
    lengths = {row['side']: tuple((Vector([row[b][i] for i in (3, 7, 11)])-
                                  Vector([row[a][i] for i in (3, 7, 11)])).length
                    for a, b in [('hipWorld', 'kneeWorld'), ('kneeWorld', 'ankleWorld')])
               for row in rest_legs}
    targets = {}

    def locomotion_pose(index, direction):
        # Analytic two-bone solution, forward knee branch. Rest geometry is vertical;
        # solve its YZ plane using measured world lengths, then rotate by cardinal.
        phase = index % 8
        joints['pelvis'].location.z -= pelvis_drop/1.15
        root.rotation_euler.z = math.radians(-direction*22.5)
        bpy.context.view_layer.update()
        for side in ('L', 'R'):
            progress = phase/4 if side == 'R' else (phase-4)/4
            if 0 <= progress <= 1:
                y, height = stride*(progress-.5)/2, 0.0
            else:
                swing = (phase/4 if side == 'L' else (phase-4)/4)
                # Smooth swing takes the rear foot forward; endpoints double support.
                y = stride*(.5-swing)/2
                height = lift*math.sin(math.pi*swing)**2
            target_model = pivots['foot.'+side].copy()
            target_model.y += y/1.15
            target_model.z += height/1.15
            targets[side] = root.matrix_world @ target_model
            hip = joints['thigh.'+side].matrix_world.translation
            diff = targets[side]-hip
            distance = diff.length
            l1, l2 = lengths[side]
            require(abs(l1-l2) <= distance <= l1+l2, 'Unreachable IK target '+side)
            # Back-rotate world displacement to the original sagittal plane.
            local = root.matrix_world.to_3x3().normalized().inverted() @ diff
            hip_angle = math.atan2(local.y, -local.z)-math.acos(
                (l1*l1+distance*distance-l2*l2)/(2*l1*distance))
            knee_angle = math.acos((distance*distance-l1*l1-l2*l2)/(2*l1*l2))
            joints['thigh.'+side].rotation_euler.x = hip_angle
            joints['shin.'+side].rotation_euler.x = knee_angle
            joints['foot.'+side].rotation_euler.x = -hip_angle-knee_angle
            rotate('upperarm.'+side, -math.degrees(hip_angle)*.35)
        bpy.context.view_layer.update()
        if options.probe_stance and direction == 0 and index == 2:
            # Rigidly translate the ENTIRE actual leg and its requested target: segment
            # lengths, target residual/reach, pole, sole and orientation stay normal.
            # This cannot be caught just by JSON alteration or a length-only gate.
            shift = Vector((.004, 0, 0))
            joints['thigh.R'].location += shift/1.15
            targets['R'] += shift
            bpy.context.view_layer.update()

    def sample_locomotion(direction, phase):
        graph = bpy.context.evaluated_depsgraph_get()
        rotation = Matrix.Rotation(math.radians(-direction*22.5), 3, 'Z')
        pole = rotation @ Vector((0, -1, 0))
        result = {'direction': direction, 'phase': phase,
                  'virtualRoot': list(pole*(stride*phase/8)), 'feet': {}}
        for side in ('L', 'R'):
            foot = joints['foot.'+side].evaluated_get(graph).matrix_world
            orientation = foot.to_3x3().normalized()
            result['feet'][side] = {
                'ankleWorld': list(foot.translation),
                'hipWorld': list(joints['thigh.'+side].evaluated_get(graph).matrix_world.translation),
                'kneeWorld': list(joints['shin.'+side].evaluated_get(graph).matrix_world.translation),
                'targetWorld': list(targets[side]), 'poleWorld': list(pole),
                'soleZ': min(v.z for v in evaluated_vertices(feet[side])),
                'orientationWorld': [float(orientation[r][c]) for r in range(3) for c in range(3)]}
        return result

    def cycle_state():
        # Read independently from the current dependency graph at each posed endpoint.
        graph = bpy.context.evaluated_depsgraph_get()
        matrices, vertices = {}, {}
        for kind, objects in [('joint', list(joints.values())), ('geometry', geometry)]:
            for obj in objects:
                evaluated = obj.evaluated_get(graph)
                local = (evaluated.parent.matrix_world.inverted() @ evaluated.matrix_world
                         if evaluated.parent else evaluated.matrix_world)
                key = obj['joint_id'] if kind == 'joint' else obj.name
                matrices[(kind, key)] = flatten(local)
                if kind == 'geometry':
                    mesh = evaluated.to_mesh()
                    try:
                        raw = b''.join(struct.pack('<ddd', *vertex.co) for vertex in mesh.vertices)
                        vertices[key] = (len(mesh.vertices), hashlib.sha256(raw).hexdigest())
                    finally:
                        evaluated.to_mesh_clear()
        return matrices, vertices

    def check_locomotion(samples):
        maximum = {'length': 0., 'residual': 0., 'plant': 0., 'sole': 0., 'orientation': 0.}
        for row in samples:
            for side, foot in row['feet'].items():
                hip, knee, ankle, target, pole = [Vector(foot[k]) for k in
                    ('hipWorld', 'kneeWorld', 'ankleWorld', 'targetWorld', 'poleWorld')]
                l1, l2 = lengths[side]
                error = max(abs((hip-knee).length-l1), abs((knee-ankle).length-l2))
                residual, reach = (ankle-target).length, (hip-target).length
                maximum['length'] = max(maximum['length'], error)
                maximum['residual'] = max(maximum['residual'], residual)
                require(error <= EPSILON, 'Evaluated IK segment length failed')
                require(residual <= EPSILON, 'Evaluated IK target residual failed')
                require(abs(l1-l2)-EPSILON <= reach <= l1+l2+EPSILON, 'Evaluated IK reach failed')
                axis = ankle-hip
                require(axis.length > EPSILON, 'Folded IK singularity')
                axis.normalize()
                offset = knee-hip-axis*(knee-hip).dot(axis)
                projected = pole-axis*pole.dot(axis)
                if offset.length > EPSILON:
                    require(projected.length > EPSILON, 'IK pole singularity')
                    require(offset.dot(projected.normalized()) >= -EPSILON, 'Inverted evaluated knee bend')
        lookup = {(row['direction'], row['phase']): row for row in samples}
        for direction in DIRECTIONS:
            for side, (start, end) in {'R': (0, 4), 'L': (4, 8)}.items():
                base = lookup[(direction, start)]
                def position(row):
                    return Vector([row['feet'][side]['ankleWorld'][i]+row['virtualRoot'][i]
                                   for i in range(2)])
                for phase in range(start, end+1):
                    row = lookup[(direction, phase)]
                    drift = (position(row)-position(base)).length
                    sole = abs(row['feet'][side]['soleZ']-base['feet'][side]['soleZ'])
                    angular = max(abs(a-b) for a, b in zip(row['feet'][side]['orientationWorld'],
                                                          base['feet'][side]['orientationWorld']))
                    for key, value in [('plant', drift), ('sole', sole), ('orientation', angular)]:
                        maximum[key] = max(maximum[key], value)
                    require(drift <= EPSILON, f'Evaluated stance ankle drift {direction}/{phase}/{side}: {drift}')
                    require(sole <= EPSILON and angular <= EPSILON, 'Stance sole/orientation drift')
                swing = range(1, 4) if side == 'L' else range(5, 8)
                require(max(lookup[(direction, p)]['feet'][side]['soleZ']-base['feet'][side]['soleZ']
                            for p in swing) >= .01, 'Insufficient evaluated swing lift')
        return maximum

    def rotate(name, x=0, y=0, z=0):
        joints[name].rotation_euler = tuple(math.radians(value) for value in (x, y, z))

    def pose(clip, index, direction):
        before = reset()
        support = None
        if clip == 'walk' and v2:
            locomotion_pose(index, direction)
        elif clip == 'walk':
            # Four diagnostic phases, paired arms/hips; pelvis bobs over grounded support foot.
            hips = [(-14, 10), (-2, 2), (10, -14), (2, -2)][index]
            knees = [(22, 0), (8, 0), (0, 22), (0, 8)][index]
            support = ['R', 'R', 'L', 'L'][index]
            for side, hip, knee in zip(('L', 'R'), hips, knees):
                rotate('thigh.'+side, hip)
                rotate('shin.'+side, knee)
                rotate('foot.'+side, -hip-knee)
                rotate('upperarm.'+side, -hip*.72, 0, (-1 if side == 'L' else 1)*2)
                rotate('forearm.'+side, -5 if side != support else 3)
                rotate('hand.'+side, 4 if side != support else -2)
            rotate('chest', 0, 0, [3, 0, -3, 0][index])
        elif clip == 'attack':
            # Frame zero IS impact: a downward-forward contact cut, no windup key.
            shoulder, elbow, wrist, twist = [(-28, -24, -7, -5),
                                               (-12, -12, 5, 9),
                                               (-10, -40, 15, 3),
                                               (-3, -5, 0, 0)][index]
            rotate('upperarm.R', shoulder, 0, twist)
            rotate('forearm.R', elbow)
            rotate('hand.R', wrist, [0, 12, -6, 0][index])
            rotate('upperarm.L', [-9, -6, -4, 0][index])
            rotate('forearm.L', [-8, -4, -2, 0][index])
            rotate('chest', [3, 2, 1, 0][index], 0, [-5, 5, 2, 0][index])
        root.rotation_euler.z = math.radians(-direction*22.5)
        bpy.context.view_layer.update()
        contact = None
        if support:
            lowest = min(v.z for v in evaluated_vertices(feet[support]))
            # Root/ground never moves. Correct only pelvis height in root-local units.
            joints['pelvis'].location.z += (rest_sole[support]-lowest)/1.15
            bpy.context.view_layer.update()
            sole_points = evaluated_vertices(feet[support])
            final = min(v.z for v in sole_points)
            require(abs(final-rest_sole[support]) <= EPSILON, 'Support foot not grounded')
            contact = {'side': support, 'soleZ': final, 'restSoleZ': rest_sole[support],
                       'groundDelta': abs(final-rest_sole[support]),
                       'ankleWorld': list(joints['foot.'+support].matrix_world.translation)}
        require(max(abs(v) for v in root.location) == 0 and
                max(abs(v-1.15) for v in root.scale) < EPSILON, 'Root scale/origin changed')
        return before, contact

    def surface(objects):
        graph = bpy.context.evaluated_depsgraph_get()
        vertices, faces = [], []
        for obj in objects:
            evaluated = obj.evaluated_get(graph)
            mesh = evaluated.to_mesh()
            try:
                offset = len(vertices)
                vertices.extend(evaluated.matrix_world @ v.co for v in mesh.vertices)
                faces.extend(tuple(offset+i for i in face.vertices) for face in mesh.polygons)
            finally:
                evaluated.to_mesh_clear()
        return vertices, BVHTree.FromPolygons(vertices, faces)

    coverage_joints = ['forearm.L', 'forearm.R', 'shin.L', 'shin.R']
    def coverage():
        # Actual evaluated triangle surfaces, not a flag deduced from object ownership.
        # At each pivot: 5 axial cross-sections x 24 radial rays; require skin all around.
        # Independently check EVERY authored seam vertex around BOTH adjoining rings.
        # Read live base-mesh vertices (not stored rest coordinates) through the evaluated
        # object transform, and query evaluated cuff triangles. Bevel/normal modifiers
        # only refine these rigid surfaces; no inferred evaluated-vertex numbering.
        rows = []
        for joint_id in coverage_joints:
            cuff = [o for o in geometry if o.get('motion_coverage_joint') == joint_id]
            spans = [o for o in geometry if o.get('motion_span_joint') == joint_id]
            require(len(cuff) == 1 and len(spans) == 2 and
                    {o.get('motion_span_side') for o in spans} == {'proximal', 'distal'},
                    'Missing coverage surfaces: '+joint_id)
            _, tree = surface(cuff+spans)
            _, cuff_tree = surface(cuff)
            center = joints[joint_id].matrix_world.translation
            child_axis = joints[joint_id].matrix_world.to_3x3().normalized()
            parent_axis = joints[joint_id].parent.matrix_world.to_3x3().normalized()
            hits, misses, radii = 0, [], []
            for offset in (-.06, -.03, 0, .03, .06):
                axes = child_axis if offset <= 0 else parent_axis
                origin = center + axes @ Vector((0, 0, offset*1.15))
                for angle in range(24):
                    theta = angle*math.tau/24
                    ray = (axes @ Vector((math.cos(theta), math.sin(theta), 0))).normalized()
                    location, normal, face, distance = tree.ray_cast(origin, ray, .14*1.15)
                    if location is None or distance < .025*1.15:
                        misses.append([offset, angle, distance])
                    else:
                        hits += 1
                        radii.append(distance)
            seams = []
            for span in spans:
                indices = list(span.get('motion_seam_vertices', []))
                require(len(indices) >= 24 and len(indices) == len(set(indices)) and
                        all(0 <= i < len(span.data.vertices) for i in indices),
                        'Missing/invalid authored seam ring: '+span.name)
                graph = bpy.context.evaluated_depsgraph_get()
                world = span.evaluated_get(graph).matrix_world
                points = [world @ span.data.vertices[i].co for i in indices]
                nearest = [cuff_tree.find_nearest(v) for v in points]
                # The underlap is a closed convex loft with outward normals. A seam
                # inside it is physically covered, not a gap to its outer surface.
                # Outside points retain their full Euclidean distance and unchanged limit.
                signed = [hit[3] if (point-hit[0]).dot(hit[1]) > 1e-8 else -hit[3]
                          for point, hit in zip(points, nearest)]
                distances = [max(0.0, distance) for distance in signed]
                seams.append({'object': span.name, 'side': span['motion_span_side'],
                              'authoredBoundaryIndices': indices,
                              'boundaryWorld': [list(v) for v in points],
                              'cuffDistances': distances,
                              'signedCuffDistances': signed,
                              'insideCuffSamples': sum(distance <= 0 for distance in signed),
                              'maxCuffDistance': max(distances),
                              'limitWorld': .025*1.15})
            passed = not misses and all(row['maxCuffDistance'] <= .025*1.15 for row in seams)
            rows.append({'joint': joint_id, 'radialHits': hits, 'expectedHits': 120,
                         'misses': misses, 'radiusRange': [min(radii), max(radii)] if radii else [],
                         'seams': seams, 'pass': passed})
        if not all(row['pass'] for row in rows):
            (STAGE / 'coverage-failure.json').write_text(json.dumps(rows, indent=2)+'\n')
            require(False, 'Anatomical coverage failed; raw evaluated boundaries in coverage-failure.json: '+
                    ', '.join(row['joint'] for row in rows if not row['pass']))
        return rows

    def inspect_pose(clip, frame, direction):
        reset_delta, contact = pose(clip, frame, direction)
        for obj in animated:
            flatten(obj.matrix_basis)
            flatten(obj.matrix_world)
        points = evaluated_vertices(geometry)
        projected = [world_to_camera_view(scene, camera, v) for v in points]
        bounds = [min(v.x for v in projected)*48, (1-max(v.y for v in projected))*48,
                  max(v.x for v in projected)*48, (1-min(v.y for v in projected))*48]
        require(bounds[0] > 1.5 and bounds[1] > 1.5 and bounds[2] < 46.5 and bounds[3] < 46.5,
                f'Preflight clipping {clip}/{direction}/{frame}: {bounds}; reduce pose, never fit camera')
        try:
            coverage_rows = coverage()
        except RuntimeError as error:
            if v2:
                evidence = {'status': 'NOT READY', 'error': str(error), 'sources': sources,
                            'clip': clip, 'frame': frame, 'direction': direction,
                            'parameters': {'strideWorld': stride, 'pelvisDropWorld': pelvis_drop,
                                           'swingHeightWorld': lift},
                            'sample': sample_locomotion(direction, frame) if clip == 'walk' else None}
                (STAGE / 'failed-pose.json').write_text(json.dumps(evidence, indent=2)+'\n')
                scene['failed_pose_evidence'] = json.dumps(evidence)
                bpy.ops.wm.save_as_mainfile(filepath=str(STAGE / 'failed-pose.blend'))
                # One explicitly failed, unapproved pose for inspection; never a frame manifest.
                scene.render.filepath = str(OUT / 'FAILED-diagnostic-pose.png')
                bpy.ops.render.render(write_still=True)
            raise
        return {'clip': clip, 'direction': direction, 'frame': frame,
                'file': f'{clip}-{direction:02}-{frame:02}.png', 'resetMaxDelta': reset_delta,
                'attachmentMatrices': attachment_rows(), 'projectedBounds': bounds,
                'worldBounds': [[min(v[i] for v in points) for i in range(3)],
                                [max(v[i] for v in points) for i in range(3)]],
                'coverage': coverage_rows, 'supportContact': contact}

    if options.probe_coverage:
        damaged = next(o for o in geometry if o.get('motion_coverage_joint') == 'forearm.L')
        # Corrupt actual mesh coordinates, so reset cannot silently undo this negative test.
        for vertex in damaged.data.vertices:
            vertex.co.x += .5
        damaged.data.update()
    if options.probe_partial_seam:
        damaged = next(o for o in geometry if o.get('motion_span_joint') == 'forearm.L'
                       and o.get('motion_span_side') == 'proximal')
        indices = list(damaged['motion_seam_vertices'])
        # Leave three quarters, including the formerly sufficient nearest vertex,
        # unchanged. The closed cuff is still present and still covers all radial rays.
        for index in indices[:len(indices)//4]:
            damaged.data.vertices[index].co.x += .20
        damaged.data.update()
    if options.probe_internal_caps:
        for obj in geometry:
            if obj.get('motion_span_joint') not in ('shin.L', 'shin.R'):
                continue
            z = .54 if obj['motion_span_side'] == 'proximal' else .62
            t = (z-.17)/.43 if z <= .60 else (z-.60)/.36
            a, b = ((.062,.067),(.085,.085)) if z <= .60 else ((.085,.085),(.095,.09))
            rx, ry = [a[i]+(b[i]-a[i])*t for i in (0, 1)]
            center_x = pivots['shin.'+obj['motion_span_joint'][-1]].x
            # Restore the exact old ring, in original base-mesh vertex index order.
            for j, index in enumerate(obj['motion_seam_vertices']):
                theta = j*math.tau/24
                obj.data.vertices[index].co = (center_x+rx*math.sin(theta), -ry*math.cos(theta), z)
            obj.data.update()

    # Complete all evaluated-geometry preflight checks BEFORE the first expensive render.
    preflight = []
    samples, cycles = [], []
    if v2:
        for direction in DIRECTIONS:
            for phase in range(9):
                pose('walk', phase, direction)
                samples.append(sample_locomotion(direction, phase))
                if phase == 0:
                    start_matrices, start_vertices = cycle_state()
            # End is a separate evaluated phase8, after eight other scene poses.
            end_matrices, end_vertices = cycle_state()
            pairs = [{'kind': kind, 'id': key, 'start': start_matrices[(kind, key)], 'end': values}
                     for (kind, key), values in end_matrices.items()]
            vertex_pairs = [{'object': key, 'startCount': start_vertices[key][0], 'endCount': value[0],
                             'startHash': start_vertices[key][1], 'endHash': value[1]}
                            for key, value in end_vertices.items()]
            require(all(max(abs(a-b) for a, b in zip(pair['start'], pair['end'])) <= EPSILON
                        for pair in pairs), 'Cycle evaluated local matrix mismatch')
            require(all(pair['startCount'] == pair['endCount'] > 0 and pair['startHash'] == pair['endHash']
                        for pair in vertex_pairs), 'Cycle evaluated local vertices mismatch')
            cycles.append({'direction': direction, 'file': f'walk-cycle-{direction:02}.png',
                           'matrices': pairs, 'vertices': vertex_pairs})
    locomotion = None
    if v2:
        locomotion = {'mode': 'rigid', 'forward': [0, -1, 0], 'stride': stride,
                      'liftThreshold': .01, 'stanceIntervals': {'R': [0, 4], 'L': [4, 8]},
                      'restLegs': rest_legs, 'samples': samples}
        probe_file = 'negative-stance-source-probe.json' if options.probe_stance else 'source-probe.json'
        (STAGE / probe_file).write_text(json.dumps({'sources': sources, 'locomotion': locomotion,
            'cycles': cycles, 'parameters': {'pelvisDropWorld': pelvis_drop, 'swingHeightWorld': lift},
            'measurement': 'Evaluated dependency graph, world scaled units before virtual travel; row-major'}, indent=2)+'\n')
        if options.probe_stance:
            pose('walk', 2, 0)
            scene['negative_probe'] = 'Actual thigh.R +0.004 world X, target shifted equally; other IK invariants preserved'
            bpy.ops.wm.save_as_mainfile(filepath=str(STAGE / 'negative-stance-scene.blend'))
        maxima = check_locomotion(samples)
    for direction in DIRECTIONS:
        for clip, count in CLIPS.items():
            for frame in range(count):
                preflight.append(inspect_pose(clip, frame, direction))
        if v2:
            inspect_pose('walk', 8, direction)
    reset()
    require(source_records() == sources, 'Sources changed during preflight')
    (STAGE / 'preflight.json').write_text(json.dumps({'sources': sources, 'frames': preflight}, indent=2)+'\n')
    print(f'MOTION_PREFLIGHT_OK {len(preflight)} evaluated poses; all joint spans and projected bounds checked', flush=True)
    if options.preflight:
        return

    report = {'version': 2 if v2 else 1, 'cell': [48, 48], 'anchor': [.5, .85], 'directions': DIRECTIONS,
              'clips': CLIPS, 'camera': {'location': [0, -6, 5.2], 'shift_y': .35, 'ortho_scale': 3},
              'modelScale': 1.15, 'matrixOrder': 'row-major', 'jointIds': list(joints),
              'geometryOwners': [{'object': o.name, 'owner': o['motion_owner']} for o in geometry],
              'geometryCount': len(geometry), 'unboundCount': len(unbound), 'multiplyBoundCount': len(multiple),
              'attachments': attachments, 'frames': [], 'resets': [], 'sources': sources,
              'restBounds': rest_bounds, 'bindingMaxWorldDelta': max(binding_deltas),
              'restJoints': [{'joint': name, 'parent': joint.parent.get('joint_id') if joint.parent else None,
                              'pivotModel': list(pivots[name]), 'restLocal': flatten(joint.matrix_local),
                              'restWorld': flatten(joint.matrix_world)} for name, joint in joints.items()],
              'render': {'blender': bpy.app.version_string, 'engine': scene.render.engine,
                         'samples': scene.cycles.samples, 'seed': scene.cycles.seed,
                         'useAnimatedSeed': scene.cycles.use_animated_seed, 'sceneFrame': 0,
                         'denoising': scene.cycles.use_denoising, 'adaptiveThreshold': scene.cycles.adaptive_threshold,
                         'viewTransform': scene.view_settings.view_transform},
              'attackPhases': ['CONTACT / immediate hit', 'followthrough', 'recovery', 'ready'],
              'coverageMethod': 'Evaluated skin/cuff triangles: 5 axial sections x 24 radial rays per elbow/knee. Independently, EVERY live authored seam-ring vertex of both adjoining segments must be inside the closed convex cuff or <= 0.025 model units outside its evaluated triangles; report signed distances, outside gaps and their maximum. Explicit seam indices authored during construction, never inferred from object suffixes. Does not replace critic inspection.',
              'limitations': ['Four diagnostic keys per movement, not a production clip or all 16 directions.',
                              'Support sole height is enforced; horizontal foot motion is measured, not a claim of zero sliding.',
                              'Wool skirt panels are rigid pelvis children; full cloth deformation is outside this proof.',
                              'Visual acceptance, independent critic and parent Node checker remain separate.'],
              'preflight': preflight}
    if v2:
        report.update(locomotion=locomotion, cycles=cycles)
        report['limitations'] = ['Rigid diagnostic locomotion, not production integration or artistic approval.',
            'Virtual stride is synthetic; no gameplay speed/terrain acceptance.',
            'Pelvis-owned rigid cloth; no deformation solver. Four cardinals only.']

    def render(name):
        require(source_records() == sources, 'Sources/schema changed: abort stale render')
        scene.frame_set(0)
        scene.render.filepath = str(OUT / name)
        bpy.ops.render.render(write_still=True)
        return pixel_record(OUT / name)

    if not options.verify:
        neutral_worlds = {}
        for direction in DIRECTIONS:
            for clip, count in CLIPS.items():
                for frame in range(count):
                    row = inspect_pose(clip, frame, direction)
                    if clip == 'stand':
                        neutral_worlds[direction] = {o.name: o.matrix_world.copy() for o in animated}
                    row['pixels'] = render(row['file'])
                    report['frames'].append(row)
                    if clip == 'stand':
                        shutil.copyfile(OUT / row['file'], OUT / f'game-{direction:02}.png')
            reset_delta, _ = pose('stand', 0, direction)
            measured = max(delta(o.matrix_world, neutral_worlds[direction][o.name]) for o in animated)
            require(measured <= EPSILON, 'Cardinal neutral restoration drift')
            row = {'direction': direction, 'file': f'reset-{direction:02}.png',
                   'maxMatrixDelta': max(measured, reset_delta), 'attachmentMatrices': attachment_rows()}
            row['pixels'] = render(row['file'])
            report['resets'].append(row)
            if v2:
                pose('walk', 8, direction)
                render(f'walk-cycle-{direction:02}.png')
        reset()
        scene['motion_verified_sources'] = json.dumps(sources)
        bpy.ops.wm.save_as_mainfile(filepath=str(STAGE / 'heavy-hero-motion.blend'))
        report['checks'] = {
            'binding': not unbound and not multiple and max(binding_deltas) <= EPSILON,
            'reset': all(row['resetMaxDelta'] <= EPSILON for row in report['frames']) and
                     all(row['maxMatrixDelta'] <= EPSILON for row in report['resets']),
            'attachments': all(max(abs(x-y) for x, y in zip(row['local'], rest['restLocal'])) <= EPSILON
                               for frame in report['frames']+report['resets']
                               for row, rest in zip(frame['attachmentMatrices'], attachments)),
            'coverage': all(check['pass'] for row in report['frames'] for check in row['coverage'])}
        require(all(report['checks'].values()), 'Measured invariant failed')
        require(source_records() == sources, 'Sources changed during rendering')
        report['elapsedSeconds'] = round(time.monotonic()-started, 2)
        (OUT / 'motion-report.json').write_text(json.dumps(report, indent=2)+'\n')
        neutrals = [pixel_record(OUT / f'game-{d:02}.png') for d in DIRECTIONS]
        study = {'blender': bpy.app.version_string, 'samples': 32, 'model_scale': 1.15,
                 'model_height': rest_bounds[1][2]-rest_bounds[0][2], 'model_z_bounds': [rest_bounds[0][2], rest_bounds[1][2]],
                 'materials': built['material_recipe'], 'scope': scene['scope'], 'sources': sources,
                 'game_proof': {'cell': [48, 48], 'anchor': [.5, .85], 'directions': DIRECTIONS,
                                'camera': report['camera'], 'files': [row['file'] for row in neutrals],
                                'frames': neutrals, 'method': 'Direct 48x48 Cycles renders; fixed camera, no resizing.'}}
        (OUT / 'render-report.json').write_text(json.dumps(study, indent=2)+'\n')
    else:
        report = json.loads((OUT / 'motion-report.json').read_text())

    # Independently re-read output files and reported matrices. Corrupted report rows fail here too.
    require(report['sources'] == source_records() == sources, 'Stale source/schema hashes')
    require(report['jointIds'] == list(joints) and report['geometryOwners'] ==
            [{'object': o.name, 'owner': o['motion_owner']} for o in geometry], 'Reported scene ownership differs')
    require(report['geometryCount'] == len(geometry) and report['unboundCount'] == report['multiplyBoundCount'] == 0,
            'Reported binding counts differ')
    require(report['attachments'] == attachments, 'Reported rest attachments differ from evaluated scene')
    require(all(report['checks'].get(key) is True for key in ('binding', 'reset', 'attachments', 'coverage')), 'Failed report checks')
    expected = {(clip, direction, frame) for clip, count in CLIPS.items() for direction in DIRECTIONS for frame in range(count)}
    actual = [(r['clip'], r['direction'], r['frame']) for r in report['frames']]
    require(len(actual) == sum(CLIPS.values())*4 and set(actual) == expected, 'Wrong/duplicate/missing pose keys')
    if v2:
        require(report['locomotion'] == locomotion and report['cycles'] == cycles,
                'Reported v2 evidence differs from freshly evaluated scene')
    require(len(report['resets']) == 4 and {r['direction'] for r in report['resets']} == set(DIRECTIONS), 'Wrong reset keys')
    for row in report['frames']+report['resets']:
        expected_name = (f"{row['clip']}-{row['direction']:02}-{row['frame']:02}.png" if 'clip' in row else f"reset-{row['direction']:02}.png")
        require(row['file'] == expected_name, 'Unsafe or incorrect filename')
        rows = row['attachmentMatrices']
        require(len(rows) == len(attachments) and {r['object'] for r in rows} == {a['object'] for a in attachments}, 'Missing/duplicate attachments')
        by_name = {a['object']: a for a in attachments}
        for attached in rows:
            values = attached['local']
            require(len(values) == 16 and all(math.isfinite(v) for v in values) and
                    max(abs(x-y) for x, y in zip(values, by_name[attached['object']]['restLocal'])) <= EPSILON,
                    'Reported weapon matrix failed')
        measured = row.get('resetMaxDelta', row.get('maxMatrixDelta'))
        require(isinstance(measured, (float, int)) and math.isfinite(measured) and 0 <= measured <= EPSILON,
                'Reported reset delta failed')
        pixel_record(OUT / row['file'])
    for direction in DIRECTIONS:
        if v2:
            require(decode_rgba(OUT / f'walk-cycle-{direction:02}.png') ==
                    decode_rgba(OUT / f'walk-{direction:02}-00.png'), 'Cycle decoded RGBA mismatch')
        require(decode_rgba(OUT / f'stand-{direction:02}-00.png') == decode_rgba(OUT / f'reset-{direction:02}.png'),
                f'Exact stand/reset decoded RGBA differs in direction {direction}')
        for clip in ('walk', 'attack'):
            hashes = {pixel_record(OUT / f'{clip}-{direction:02}-{frame:02}.png')['visibleRgbaSha256'] for frame in range(CLIPS[clip])}
            require(len(hashes) >= 3, f'{clip}/{direction}: fewer than three visible distinct keys')
        info = pixel_record(OUT / f'game-{direction:02}.png')
        require(24 <= info['solid_alpha_height'] <= 36 and info['solidPixels'] >= 100,
                'Neutral size/readability gate failed')
    result = {'status': 'PASS', 'scope': 'Blender scene invariants + decoded pixel proof only; critic/parent acceptance pending',
              'sources': sources, 'poses': sum(CLIPS.values())*4, 'resets': 4, 'geometry': len(geometry),
              'bindingMaxDelta': max(binding_deltas), 'samples': 32,
              'exactDecodedRgbaReset': True, 'coverageRaysPerPose': 480,
              'elapsedSeconds': round(time.monotonic()-started, 2)}
    if v2:
        result.update(locomotionMaxima= maxima, cycleCount=4)
    (STAGE / 'verify-results.json').write_text(json.dumps(result, indent=2)+'\n')
    print('HERO_MOTION_OK '+json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
