# Unit art: slice 10.2

The hero (crested helmet, shield, sword), archer (hood, bow, quiver), and golem
(wide stone body, faceted shoulders, fists) use original models built by our
script. Each has 16 facings, four idle frames and eight walking frames. Other
unit kinds retain their previous rendering until the full roster slice.

## Reproduce

Blender 5.2.3 LTS and Python 3.12 with Pillow were used. From the game root,
repeat for `hero`, `archer`, and `golem`:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b -P tools/render-unit.py -- .art-build/hero 64 hero
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
16 directions, both animations and every palette. Controls have 44px targets;
keyboard input while focused in the preview does not trigger gameplay hotkeys.
The preview changes presentation only and is absent on ordinary URLs.

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
