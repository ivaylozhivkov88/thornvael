# Unit art: slice 10.2

The hero (crested helmet, shield, sword), archer (hood, bow, quiver), and golem
(wide stone body, faceted shoulders, fists) use original models built by our
script. Each now has 16 facings and six clips: stand4, walk8, attack4, cast4,
hurt2 and die4 (416 frames per family). Other
unit kinds retain their previous rendering until the full roster slice.

## Reproduce

Blender 5.2.3 LTS and Python 3.12 with Pillow were used. From the game root,
repeat for `hero`, `archer`, and `golem`:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b -P tools/render-unit.py -- .art-build/hero 48 hero
python tools/pack-atlas.py .art-build/hero public/sprites hero
npm run check:atlases
```

The script resolves output paths before rendering (Blender otherwise interprets
relative render paths against the blend file). Generated source frames and logs
are ignored; the packed colour, RGB mask and JSON are tracked with `own`
provenance in `assets.json`. No downloaded models or original game files are used.

## Runtime and verification

Normal gameplay uses these sheets for Hero, Archer and Golem. Simulation east-first
facing maps to the south-first sheet with `(dir + 12) & 15`. Animation advances
from simulation ticks, so pause freezes it. Red masks use team colour; green
uses equipped torso armour tier for the hero (zero when unequipped), tier 1 for
the other two. Blue uses monster-level colours 1–5. The existing sim has no
per-monster level field, so ordinary golems use level 1; the full roster will
supply this value. No simulation state or save format changed.

Open `/thornvael/?hero=warrior,m,medium&art=1` to inspect all three in-game models,
16 directions, all six animations and every palette. Controls have 44px targets;
keyboard input while focused in the preview does not trigger gameplay hotkeys.
The preview changes presentation only and is absent on ordinary URLs.

## Combat presentation bridge (P02.1)

The main loop observes every completed simulation step, including catch-up steps
before a draw. A presentation-only typed-array tracker recognizes cooldown edges,
fresh cast effects, net HP loss, death and revival. It never changes commands,
simulation snapshots, hashes or saves. Missing/ambiguous cast attribution is marked
unresolved instead of assigning the effect to a nearby unit. Capped/id-less effects
and damage cancelled by same-step healing are disclosed limits, not lossless events.

UnitSprite now dispatches optional attack/cast/hurt/die clips using atlas metadata.
P02.2 now ships all six clips. Diagnostics report requestedClip, resolvedClip and
fallback; generic older stand/walk-only packs retain the tested fallback path.
Missing death art keeps the existing corpse marker. Complete in-memory clip fixtures
test the dispatch, 16 facings, final death frame, palette sharing and stable 64px
logical size for 48px cells; these fixtures are not shipped art or GPU screenshots.

P02.2 uses one fixed camera3.0 and 48px cells in each1024px atlas. Weapons/bow/fists
follow articulated limbs; action frame0 is contact/release, followed by recovery,
matching the existing immediate combat resolution. Death clamps to a fallen pose.
Cast art for noncasters is inspectable in the preview and grants no new abilities.
The strict shipped profile checks all416 frames, explicit anchors/sequences, transparent
cell borders, visible neutral-subject size, masks and provenance. The first camera4.8
attempt was rejected for shrinking subjects; the corrected16-facing neutral heights
retain93–104% of the original apparent height, with no packed-frame clipping.
These remain original procedural PILOT models; final realistic visual acceptance
and actual phone/active-combat performance gates are still open.

The preview offers all six clips and Replay animation. One-shots stop at their last
frame; changing facing or palette preserves their phase. Its status explicitly
discloses missing-clip fallback. In debug/browser tests, __game.animation(id) observes
the tracker; __game.step(n) accepts only an explicit user pause and 1..125 steps,
drains normal queued commands through the same production step helper, and refuses
live/background stepping. Pause freezes clip time. Loading seeds a new baseline;
an in-place restore is detected by array identity or explicit reset.

At load time, CPU mask splitting places the unmasked pixels and the three
greyscale regions into four quadrants of ONE shared texture per family. Regions
are disjoint and preserve original alpha and shading. Four ordinary tinted Pixi
Sprites share it: no per-unit filter, custom shader, render pass, or palette
texture copies. See [Pixi texture sources](https://pixijs.com/8.x/guides/components/textures).
Each 1024px source produces one 2048px RGBA texture: 16 MiB per family, 48 MiB
for three, plus retained canvas backing and transient decode/split buffers.
Four sprite quads per unit are the tradeoff for standard batching. This is a
bounded pilot, not a claim that full-roster/mobile memory budgets are met.

`npm run check:repo` includes the atlas gate (therefore the existing deploy CI
also runs it). The gate checks metadata shape, safe local names, dimensions,
frame count, ordering, rectangles, overlap, anchor, RGBA PNG pixels, nonempty
frames, changing animation pixels, all RGB regions, orphan images and provenance.
The runtime checks the same metadata contract before loading images.

Browser tests cover all facings, shared texture sources across palette changes,
five monster colours, mouse movement, keyboard pause, mobile viewport controls,
and the existing offline reload smoke test. Use `PW_CHANNEL=chrome`; `PW_PORT`
can select a separate loopback port for concurrent runs (default 4173).

Real Android/iPhone GPU memory, FPS, art readability, context restoration and
visual acceptance remain the phase 10.5 device gate. Attack/cast/death sheets
and the full roster are outside this slice; existing combat effects remain.
