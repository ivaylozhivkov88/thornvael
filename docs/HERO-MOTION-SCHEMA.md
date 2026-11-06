# Parent/executor motion proof interface v1 and v2

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

## Version 2: rigid stride-relative locomotion

V1 above remains supported unchanged. V2 retains every v1 field and gate, except
`version:2`, `clips:{stand:1,walk:8,attack:4}` and exactly **52** frame rows.
Use a separate `hero-locomotion` evidence directory. Four resets and four neutral
copies remain mandatory; add four separately rendered `walk-cycle-00.png`,
`walk-cycle-04.png`, `walk-cycle-08.png`, `walk-cycle-12.png` images.
Do not overwrite v1 evidence. Attack frame zero remains contact.

All numbers below are finite JSON numbers (no null, strings, NaN or missing
values). Vec3 means exactly three numbers. Mat4 means exactly 16 numbers flattened
**row-major**, with translation at indices 3,7,11, affine last row [0,0,0,1].
Matrices map column vectors. World is Blender scene world in world units, after
modelScale 1.15 and cardinal root rotation, before adding virtual travel. Root
stays at the origin. Model forward is [0,-1,0], up is [0,0,1]. A direction is an
integer 16-way index, restricted here to 0,4,8,12, and root Z rotation is
`-direction * 22.5` degrees (right-handed). Camera/anchor/scale remain fixed above.
Lengths and sole heights use world units; rotation matrix elements are unitless.
No optional/null alternatives are defined for v2 fields. Unknown extra metadata
is allowed but never supplies verification evidence.

Add `locomotion` with these fields:

- `mode:"rigid"`, `forward:[0,-1,0]`, `stride`: positive number,
  `liftThreshold`: number >=0.01 world units. No skinned/cloth/deformed geometry.
- `stanceIntervals:{R:[0,4],L:[4,8]}`: inclusive integer phase endpoints.
- `restLegs`: exactly two rows `{side,hipWorld,kneeWorld,ankleWorld}` where side
  is "L" or "R" once each and the other fields are Mat4, actual evaluated rest
  joint world matrices at direction 0. Hip=thigh pivot, knee=shin pivot,
  ankle=foot pivot. Segment lengths come from their translation distances,
  never authored nominal lengths. Rest matrices include modelScale.
- `samples`: exactly 36 rows `{direction,phase,virtualRoot,feet}` containing every
  cardinal × integer phase 0..8 exactly once. `virtualRoot` is Vec3 and must equal
  `rotateZ(-direction*PI/8, forward) * stride * phase/8`. It is declared synthetic
  gameplay travel, never an actual scene-root transform. Phase 8 repeats phase
  0's local pose after a full virtual stride. Phase p<8 corresponds exactly to
  `walk-<direction2>-<p2>.png`; phase8 corresponds to `walk-cycle-<direction2>.png`.
- Each sample's `feet` has **exactly keys L,R**. Each foot is
  `{ankleWorld,soleZ,orientationWorld,hipWorld,kneeWorld,targetWorld,poleWorld}`.
  All except soleZ and orientationWorld are Vec3; soleZ is a number and
  orientationWorld is exactly nine row-major numbers, the evaluated world foot
  rotation with scale removed (orthonormal, determinant +1). `ankleWorld` is
  actual evaluated ankle pivot, not requested target. `soleZ` is actual minimum
  evaluated sole surface world Z. `hipWorld`,`kneeWorld` are evaluated pivots;
  `targetWorld` is the requested ankle IK target BEFORE solve, all BEFORE virtual
  travel. `poleWorld` equals the cardinal-rotated model forward vector.
  No report field named maxDrift, residual, reach, or PASS substitutes for these.

Node adds virtualRoot XY to actual ankleWorld XY and checks each inclusive stance
interval against its first sample (Euclidean drift <=1e-6); soleZ and every
orientation element must stay within 1e-6. Each foot must lift at least
liftThreshold above its own stance soleZ at an interior swing sample (L:1..3,
R:5..7). Recompute both posed segment lengths from actual pivots (absolute
error <=1e-6), target residual norm <=1e-6, and requested hip-target distance
within [abs(L1-L2),L1+L2] allowing 1e-6. Project knee offset and pole perpendicular
to hip→ankle: nonstraight knee must bend toward the normalized projected pole
(dot >=-1e-6). A zero projected pole or zero hip→ankle distance fails unless
the chain is straight with knee offset <=1e-6 and valid lengths/reach. Folded
chains and nonstraight pole singularities fail. Scene/source review independently
confirms these are evaluated measurements and coverage remains enforced.

### Exact closed-solid radial coverage (v1 and v2)

The source helper `game/tools/hero_coverage.py` is included in source hashes.
Only the explicitly tagged cuff and proximal/distal spans of the tested joint
participate, using evaluated triangulated world meshes, with separate object,
original polygon and triangle identities. Each object is validated once per pose:
nonzero triangles, no duplicates, one connected shell, opposite edge incidence,
single-cycle vertex links, positive outward signed volume, and exact triangle-pair
embedding checks (including coplanar overlap and extra self-contact). Singular
transforms and nonfinite input fail. No repair, welding or rounding is permitted.

Finite binary input coordinates become `Fraction.from_float(float(value))`.
Point classification rejects boundary origins, then uses deterministic auxiliary
rays `(1,k,k*k)`, k=1..32; only transverse face-interior crossings are accepted.
Exhaustion is diagnostic FAIL. At least one object must strictly contain the
origin, and no participating object may have the origin on its boundary.
All primary-ray triangle intersections are collected without stepping, to exact
`T=(W+1)/D`, where W is the maximum coordinate distance from origin across all
participating vertices and D is the maximum absolute direction component.
Equal rational event parameters retain all incident identities; unequal values
remain distinct. Positive-length coplanar travel fails. Exact midpoint
classification supplies occupied closed intervals and tangent singletons.

Sort those intervals by start/end/object and return the end of the contiguous
union component containing zero. Exact touching connects; every positive gap
terminates the component. Neither the nearest triangle nor the furthest hit is
the coverage radius. Compare `exit^2 * dot(direction,direction)` exactly against
`(2875/100000)^2` and `(161/1000)^2`, inclusively, with no tolerance. Directions
are not renormalized inside the exact kernel. Floating radius is report-only.

Keep offsets [-.06,-.03,0,.03,.06], 24 directions, modelScale 1.15 and existing
parent/child frames: **120/120 rays per joint per pose**, both elbows and knees.
Every live authored vertex on BOTH seam rings retains the independent signed
cuff-distance test and maximum outside distance .02875 world. All stance, IK,
attachment, reset and cycle gates retain their existing 1e-6 tolerances.
V2 trouser cap endpoints are .54/.62 model Z with the original taper; cuff axial
radius remains .115. `--probe-internal-caps` is a positive regression.

Failure reports retain joint/pose/offset/angle, exact origin/direction/T, origin
classifications, event face identities, occupied intervals, reach/nextStart and
reason where evaluation reached those stages. Invalid solid validation precedes
ray construction and reports object/face IDs instead. Reasons distinguish
INVALID_SOLID, ORIGIN_BOUNDARY, ORIGIN_OUTSIDE, COPLANAR_RAY,
CLASSIFICATION_AMBIGUOUS, RADIUS_OUT_OF_RANGE and RESOURCE_EXHAUSTED.
`--coverage-budget-seconds` defaults to 120 for the whole invocation; exhaustion
fails with its checkpoint, never partial PASS. Numerical failures occur before
any render. A preflight PASS does not certify visual/art acceptance; native 48px
normal-zoom critic and parent review remain separate.

Add `cycles`: exactly four rows, one per cardinal, with fields
`{direction,file,matrices,vertices}`. `file` must be the exact walk-cycle filename
above; decoded RGBA (including invisible RGB) equals walk frame00 exactly.

- `matrices`: one row `{kind,id,start,end}` for EVERY jointIds entry (kind="joint")
  and EVERY geometryOwners.object (kind="geometry"), no duplicates/extras/omissions.
  start/end are raw evaluated **local-to-parent Mat4**, sampled independently
  at phases0/8. Do not serialize rounded deltas or cached rest snapshots. Node
  recomputes maximum element delta <=1e-6 over the entire paired keyset.
- `vertices`: exactly one row per geometryOwners.object,
  `{object,startCount,endCount,startHash,endHash}`. Counts are positive integers
  and equal; hashes are lowercase 64-character SHA256 hex and equal. Hash actual
  current evaluated object-local mesh vertex coordinates at phases0/8, in vertex
  index order, XYZ per vertex, IEEE754 float64 **little-endian** concatenated
  bytes, no rounding. Curves must be evaluated to mesh. No cached rest vertices.
  Geometry is rigid-only; a future deformation protocol needs raw vertex equality.

Source records use the existing `sources:[{file,sha256}]`: resolve file inside the
workspace and require real canonical files `game/tools/hero-lookdev.py`,
`game/tools/hero-motion.py`, `game/docs/HERO-MOTION-SCHEMA.md` (or their actual
renamed checkout root). Identity is the canonical real file, not basename or
case-folded spelling. Hash current file bytes after final generation. A stale
protocol/generator, missing canonical entry, forged drift summary, incomplete
sample/cycle evidence, or mismatched image fails nonzero.
