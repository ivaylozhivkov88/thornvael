# Articulated hero diagnostic

This tool demonstrates explicit ownership, joint binding and repeatable poses for the original heavy-knight study. It does not replace the shipped unit atlases. The version 1 proof contains stand1/walk4/attack4 keys in four cardinal directions: 36 direct 48×48 RGBA frames, four separately rendered neutral returns and four neutral comparison copies. Version 2 defines a separate rigid locomotion proof with stand1/walk8/attack4 (52 frames), four neutral returns, four cycle-end renders and four neutral comparison copies.

Use Blender 5.2.3 LTS and Python 3.12; Pillow is needed only for the optional contact sheet/GIF. These examples assume the repository checkout is named `game` inside a workspace. The scripts derive the real checkout path, so the folder can be renamed when adjusting the command paths. Outputs/cache stay in that workspace's `.planning/` folder. The public [protocol](HERO-MOTION-SCHEMA.md) is sufficient; private planning documents and references are not required.

From the workspace parent:

```powershell
blender -b -t 8 --python-exit-code 1 -P game/tools/hero-motion.py -- --preflight
blender -b -t 8 --python-exit-code 1 -P game/tools/hero-motion.py --
blender -b -t 8 --python-exit-code 1 -P game/tools/hero-motion.py -- --verify
node game/tools/check-hero-motion.mjs .planning/art-concepts/hero-motion
python game/tools/hero-motion.py --previews
```

The Blender verifier measures actual scene matrices, geometry ownership and elbow/knee coverage. Mail and trousers are partitioned at their articulated joints. Every pose restores its rest snapshot; all sword/shield parts retain their local relationship to their hand/forearm. Attack frame zero is contact, matching the current immediate-hit presentation contract.

The Node gate checks all 36 frame keys, dimensions, alpha borders, distinct visible poses, canonical source/protocol hashes, weapon matrices and four exact decoded-RGBA neutral returns. It also runs the existing neutral-size comparison against the shipped pilot and requires neutral copies to match the corresponding motion frames. PNG file hashes are not a substitute for pixel equality.

These real-scene corruption probes must exit **1**:

```powershell
blender -b -t 8 --python-exit-code 1 -P game/tools/hero-motion.py -- --preflight --probe-coverage
blender -b -t 8 --python-exit-code 1 -P game/tools/hero-motion.py -- --preflight --probe-partial-seam
```

The second probe retains the cuff and most of the seam. Checking every authored boundary sample prevents a closed cuff or one nearby vertex from hiding the displaced section. Finite samples cannot certify all possible gaps or intersections; visual review remains necessary.

`tests/hero-motion-proof.test.ts` contains synthetic protocol corruption cases. Those tests validate rejection behavior, not the quality of the Blender model or animation. The case-sensitive filename test skips on a case-insensitive filesystem.

The version 1 diagnostic locks support-sole **height only**. Its evidence does not establish horizontal foot planting. It remains supported with its original frame profile and checks.

Version 2's complete field contract is in [HERO-MOTION-SCHEMA.md](HERO-MOTION-SCHEMA.md). Generate its evidence separately in `hero-locomotion`, retaining the earlier `hero-motion` outputs. Check that directory from the workspace parent:

```powershell
node game/tools/check-hero-motion.mjs .planning/art-concepts/hero-locomotion
```

An in-place sprite must move its stance foot backward as the virtual gameplay root moves forward. The checker adds the declared phase-dependent virtual travel to actual evaluated ankle positions before checking plant. It requires nine samples per direction (phases 0 through 8), right-foot stance 0–4 and left-foot stance 4–8 inclusive. It recomputes stance XY, sole-height and orientation drift, derives fixed segment lengths from rest matrices, and checks posed lengths, requested-target residual/reach and knee bend against the rotated forward pole. Both feet must clear the declared lift threshold during swing. A reported zero maximum drift cannot override damaged raw samples.

Cycle return requires independently evaluated local matrix pairs for every joint and geometry object, paired evaluated local vertex counts/hashes for every geometry object, and exact decoded RGBA equality between separately rendered phase8 and walk frame00. It retains fixed camera/scale/anchor, attachment, reset, neutral comparison and canonical generator/protocol source-hash gates. The Node result includes recomputed numeric errors, lengths, plant traces and cycle measurements. A synthetic protocol PASS alone does not establish that a generator collected evaluated scene data: generator/source inspection and a real displaced-stance-foot failure probe remain required before accepting Blender evidence.

The synthetic tests exercise valid geometry and damaged measurements independently, including wrong travel, plant, IK, matrix/vertex cycle state and PNGs. Run `npx vitest run tests/hero-motion-proof.test.ts` inside the game checkout. The original version 1 corruption cases remain intact.

Version 2 checker support does not itself accept a Blender render or weighted gait. Attack weight and cloth deformation remain open; hanging cloth follows the pelvis. This is not a production rig, full 16-direction six-clip atlas, runtime integration or real-device approval. The contact sheet and loop are explicitly labeled diagnostic, not in-game captures. Production atlases and simulation remain unchanged by this protocol work.
