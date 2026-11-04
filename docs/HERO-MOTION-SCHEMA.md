# Parent/executor motion proof interface v1

Workspace-only motion-report.json, generated from actual evaluated Blender scene. Node checker is parent-owned game/tools/check-hero-motion.mjs. No production atlas/runtime changes. All input PNGs are direct RGBA8/48×48.

Required top-level fields:
- version:1; cell:[48,48]; anchor:[0.5,0.85]; directions:[0,4,8,12]; clips:{stand:1,walk:4,attack:4}.
- camera:{location:[0,-6,5.2],shift_y:0.35,ortho_scale:3}; modelScale:1.15.
- jointIds: unique IDs including root,pelvis,chest,neck,head,upperarm.L,forearm.L,hand.L,thigh.L,shin.L,foot.L and corresponding six .R limb IDs.
- geometryOwners: [{object:unique_nonempty_name,owner:joint_id}], covers every modelmesh/curve exactly once. geometryCount equals length; unboundCount:0; multiplyBoundCount:0.
- attachments: [{object:geometry_name,parent:joint_id,restLocal:[16finite numbers]}], including at least sword and shield objects (identify explicit role:'sword'/'shield'; additional weaponparts share role), all attached to hand/forearm joint. Sameobject once.
- frames:36rows exactly {clip,direction,frame,file,resetMaxDelta,attachmentMatrices:[{object,local:[16numbers]}]}. Safe filenames <clip>-<direction2>-<frame2>.png. resetMaxDelta is measured AFTER reset and BEFORE new pose. Eachrow contains ALL attachment objects, comparing local-to-attachment-joint matrix with attachments.restLocal (maxelementdelta<=1e-6). A source-only verifier asserts those actualcomputed invariants and fails if violated.
- resets:4rows {direction,file:'reset-<direction2>.png',maxMatrixDelta,attachmentMatrices:[same]}, maxMatrixDelta<=1e-6 measured AFTER neutral restoration; exact decodedRGBA equals matching stand PNG.
- checks:{binding:true,reset:true,attachments:true,coverage:true}; fail nonzero if anyfalse. Coverage is Blender anatomical jointspan check plus critic bentknee/sleeve review; document actual test, not a hardcodedflag.
- sources: [{file,sha256}] must identify the canonical hero-lookdev.py, hero-motion.py and this public docs/HERO-MOTION-SCHEMA.md file; extra rig/pivot/coverage/preflight metadata encouraged.

Checker rejects wrong keysets/duplicates, missing or additional pose rows, absentgeometry/unknownjoints/attachmentrows, nonfinite or out-of-tolerance matrices, any failed checks. For everyPNG: direct48square, occupiedalpha, noalpha>0outerborder. Walk/attack have >=3distinct decodedpixelhashes perclip/direction. ResetRGBA exact byteequality; PNGfilemetadata ignored. Matrix arrays must use the SAME flattening convention (declare matrixOrder:'row-major').

Keep four neutral copies game-00/04/08/12.png plus render-report.json compatible with check-lookdev. Their decodedRGBA must exactly match corresponding motion stand files; the motion checker runs existing --compare-pilot without weakening. Additional preview/contactsheet/proof files do not replace the exact36+4motion PNG manifest. Report stage is art-concepts/hero-motion, cache/blend/log in tooling/hero-motion. Actual meshownership/coverage and renderer code are reviewed separately from self-reported JSON. This public protocol is sufficient for reproduction; no private planning document is required by the generator.
