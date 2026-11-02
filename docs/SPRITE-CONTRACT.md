# Sprite contract (version 1)

Every unit sprite set in Thornvael follows this contract. It is produced by `tools/render-unit.py` (Blender, headless), packed by `tools/pack-atlas.py` and checked by `src/sprites/contract.ts` (runtime, Vitest and `tools/check-atlases.mjs`, included in the CI repo check). Runtime palette details and reproduction are in `UNIT-ART.md`.

## Layout

- 16 directions, index 0 = facing the camera (south), then clockwise in 22.5 degree steps: 0 S, 4 W, 8 N, 12 E.
- Animations: `stand` (4 frames, loop) and `walk` (8 frames, loop). Later slices may add `attack`, `cast`, `hurt`, `die`; the contract lists the allowed names.
- All frames of one unit have the same cell size (default 64 x 64 px, large monsters 96 x 96). The anchor is the feet point, (0.5, 0.85) of the cell.
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

## Provenance

The renderer script, the model script and the packer are our own. Every atlas file needs an entry in `assets.json` with license `own` and the generating script as source.
