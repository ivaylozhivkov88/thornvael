# Town interior art pilot

Original procedural interiors and full-body hero portraits for Thornvael. Generated
with **Blender 5.2.3 LTS** from the geometry and materials in
`tools/render-town.py`. No external models, textures, source-game pixels, or fonts
are loaded. Composition references remain outside this game repository.

## Image contract

All paths below are relative to `public/townart/`. Prefix runtime URLs with the
application base URL, for example `${import.meta.env.BASE_URL}townart/shop.png`.

| File | Size | Purpose |
| --- | --- | --- |
| `shop.png` | 640 × 480 RGB | Empty medieval shop interior |
| `tavern.png` | 640 × 480 RGB | Empty tavern interior |
| `merchant-shop.png` | 640 × 480 RGBA | Shop merchant, transparent, camera aligned |
| `merchant-tavern.png` | 640 × 480 RGBA | Tavern merchant, transparent, camera aligned |
| `portrait-warrior-m.png` | 160 × 256 RGBA | Full-body male warrior |
| `portrait-warrior-f.png` | 160 × 256 RGBA | Full-body female warrior |
| `portrait-mage-m.png` | 160 × 256 RGBA | Full-body male mage |
| `portrait-mage-f.png` | 160 × 256 RGBA | Full-body female mage |

Place each background and merchant overlay inside the **same aspect-ratio 4 / 3
box**, at identical bounds. Use `object-fit: contain` for both. Do not independently
crop or scale the actor. The transparent actor includes foreground occlusion from
the counter and props, baked by Blender holdout materials. The actor has no image
frame or room background. Portraits include no pedestal or background and can sit
inside an independently styled portrait frame.

The parent UI owns subtle merchant-only CSS nod/shake feedback and accessible mood
text. These assets are one neutral pose per merchant, **not skeletal animation or
three distinct facial reactions**. Keep transforms small: large motion also moves
the baked counter occlusion edge and can reveal the cut. No JavaScript image module
or simulation changes are needed.

## Reproduce

From `game/` in PowerShell:

```powershell
$env:BLENDER_USER_RESOURCES = Join-Path (Get-Location) '../.planning/tooling/blender-town'
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b -t 6 -P tools/render-town.py
```

For a bounded rerender, append `-- --only shop`, `-- --only tavern`, or
`-- --only portraits`. The default is 32 Cycles samples with denoising, fixed seed
10317, AgX color management, warm key and rim lights, and a cooler fill. `--samples`
can raise quality without changing dimensions or filenames. Output is always
anchored to the script's own `public/townart/` directory. No `.blend` or intermediate
frame files are required. Each delivered PNG must remain below 1 MiB.
The environment setting keeps Blender extension/cache writes inside the local
project tooling area rather than its global user profile.

The source uses authored mesh primitives, turned profiles, layered armour/clothing,
individual facial features, procedural wood/stone/cloth materials, bevelled edges,
warm lamps, shelves, bottles, ledgers, a balance scale, weapon displays, barrel
hoops, tankards, and a tavern hearth. Alpha layers use holdout occlusion; because
holdout materials replace the room's diffuse shaders, actor indirect lighting is
an approximation, with the same explicit lights and camera as the background.

## Acceptance boundaries

This is a bounded asset pilot. It does not establish final art approval, exact
historical fidelity, all trader variants, photorealistic faces, facial animation,
or real-phone quality. Primitive-based modelling remains visible on close zoom;
assess the images at their intended UI size. Parent integration owns layout,
merchant feedback timing, base-path loading, browser checks, and mobile review.
The static filenames also require the parent asset-pack/cache strategy to handle
revisions; this generator does not change the service worker.

## Verified pilot outputs (2026-11-02)

All eight PNGs decoded successfully. Both backgrounds are RGB at 640 × 480; the
two actor layers are RGBA at 640 × 480; all four portraits are RGBA at 160 × 256.
Every cutout has fully transparent margins and fully opaque subject pixels, with
its nonzero alpha bounds strictly inside the canvas (no clipped extremities).
Combined background/actor contact sheets were visually inspected for alignment
and foreground occlusion. Every file has exactly one `own` manifest entry pointing
to `tools/render-town.py`. Total payload: 1,139,926 bytes; largest file:
`shop.png`, 418,057 bytes. Full build and browser verification belong to the parent
integration pass and were not run concurrently by this asset worker.
