# Sprite contract (version 1)

Every unit sprite set in Thornvael follows this contract. It is produced by `tools/render-unit.py` (Blender, headless), packed by `tools/pack-atlas.py` and checked by `src/sprites/contract.ts` (runtime, Vitest and `tools/check-atlases.mjs`, included in the CI repo check). Runtime palette details and reproduction are in `UNIT-ART.md`.

## Layout

- 16 directions, index 0 = facing the camera (south), then clockwise in 22.5 degree steps: 0 S, 4 W, 8 N, 12 E.
- Generic v1 accepts `stand` (4 frames, loop) and `walk` (8 frames, loop), plus optional combat clips. The strict shipped combat profile requires `attack`4, `cast`4, `hurt`2 and `die`4 as well:416 frames per family across16 directions.
- Shipped combat frames use48×48px cells in1024×1024 atlases; runtime child scaling preserves a64px logical cell. Generic older sets retain their recorded cell size. The explicit feet anchor is(0.5,0.85), identical across clips/facings.
- Camera: orthographic, 3/4 view, fixed light from the top left, so shading is identical for every unit.

## Frame names

`<unit>/<anim>/<dir>/<frame>` with `dir` two digits (00 to 15) and `frame` two digits (00 and up). Example: `hero/walk/04/03`.

## Files per unit

- `<unit>.png` colour atlas, `<unit>.json` Pixi spritesheet (frames, animations, meta).
- `<unit>-mask.png` mask atlas, same frame rectangles. Channels: red = team colour area, green = armour tier area, blue = monster level tint area. Value 255 inside the area, 0 elsewhere. Pixi swaps palettes from these masks, so there are no extra colour sprites.
- `meta.thornvael` in the JSON records: contract version, unit id, direction count, cell size, frames per animation, mask file name.

## Budgets

- Atlas at most 2048 x 2048 px, one file at most 1 MB (repo guard), mask atlas the same size.
- Cell size is a multiple of 8.
- The strict combat profile fixes source dimensions to1024² so the four palette-layer quadrants produce one2048² RGBA GPU source per family (16MiB). Three loaded families remain48MiB, excluding CPU/decode/other textures. CI rejects border-touching silhouettes and gross neutral-subject shrink; a large pose must be corrected instead of shrinking all clips.

## Provenance

The renderer script, the model script and the packer are our own. Every atlas file needs an entry in `assets.json` with license `own` and the generating script as source.
