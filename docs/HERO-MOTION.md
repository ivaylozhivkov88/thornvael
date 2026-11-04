# Articulated hero diagnostic

This tool demonstrates explicit ownership, joint binding and repeatable poses for the original heavy-knight study. It does not replace the shipped unit atlases. The proof contains stand1/walk4/attack4 keys in four cardinal directions: 36 direct 48×48 RGBA frames, four separately rendered neutral returns and four neutral comparison copies.

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

The diagnostic currently locks support-sole **height only**. Horizontal foot planting, full gait continuity, attack weight and cloth deformation are not accepted. Hanging cloth follows the pelvis. This is not a production rig, full 16-direction six-clip atlas, runtime integration or real-device approval. The contact sheet and loop are explicitly labeled diagnostic, not in-game captures.
