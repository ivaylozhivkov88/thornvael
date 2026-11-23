# Thornvael World Visuals — Final Report (`C0`–`C8`)

**Branch:** `gemini/world-visuals` (never pushed to `main`)

## 1. Summary of Completed Work
- **C0 (`50fbf18`):** Researched licence-clean tools & PixiJS 8 rendering/particle patterns in `.planning/world-visuals/TOOLS.md`.
- **C1 (`ee0ec14`, `3150e48`):** Generated `public/terrain/skin-ash.png` (`tools/make-skin-ash.py`), registered `volcanic: 'ash'` in `BIOME_SKINS` + `assets.json`, verified all 42 `00-BIBLE.md §5.1` biome props, wired collidable Y-sorted `frame` decor in `src/map.ts`, `src/terrain.ts`, `src/map-generator.ts`, `src/skirmish-generator.ts`, tuned `mainSkin` path tinting, and added `tests/world-decor.test.ts`.
- **C2 (`df2b754`):** Extended `Region` (`light`, `weather`) in `src/mapdoc.ts`, wired `region.zone` bias in `src/terrain.ts`, added `regionAtTile` / `resolveRegionAtmosphere` / border crossfade in `src/atmosphere.ts`, added pure `src/region-audio.ts`, and added `tests/region-metadata.test.ts`.
- **C3 (`013e761`):** Built reproducible `tools/build-thornwick.mjs` (9 buildings, 102 props, 46 units, N/E gates, waypoint, healing shrine, dusk/drizzle metadata, audio cues) + `tools/shoot-world.mjs` + `tests/thornwick-town.test.ts`, with before/after screenshots in `.planning/world-visuals/C3/`.
- **C4 (`64e964b`..`e5eadc7`):** Enriched Map 1 (Border Fords `m01`–`m11` + named maps) via `tools/enrich-map-regions.mjs` and rebuilt `src/worlds/act1-world.map.json`.
- **C5 (`668efce`, `0707a76`, `1aafe51`):** Enriched Map 2 Redmarsh (13 maps), Map 3 Iron Coast (16 maps), and Map 4 Obsidian Caldera (11 maps) with biome/zone/music/ambience/light/weather and deterministic props.
- **C6 (`ff83f9f`..`c8db91a`):** Cataloged hubs in `.planning/world-visuals/NODES.md` and enriched Act 1–4 hub maps (`map1`..`map4`).
- **C7 (`ae9802e`):** Enriched all 6 `public/maps/skirmish/*.map.json` maps with biome decor and atmosphere metadata; `tests/skirmish-pack6.test.ts` green.
- **C8:** Added `tools/empty-areas.mjs` and filled remaining sparse dirt/interior maps (`weeping-ossuary`, `gullet-of-dunes`, `drowned-choir`, `cinder-throne`, `map1`–`map4`, `m46`, `skirmish-*`), rebuilt `public/chapter1-manifest.json` (`npm run build`), and verified `tsc --noEmit` + full `vitest` suite.

## 2. Screenshots
- `C3`: [before.png](file:///d:/ROM%202%20clone/game/.planning/world-visuals/C3/before.png), [after-desktop.png](file:///d:/ROM%202%20clone/game/.planning/world-visuals/C3/after-desktop.png), [after-mobile.png](file:///d:/ROM%202%20clone/game/.planning/world-visuals/C3/after-mobile.png)

## 3. Items in `WORLD-NEEDS-CLAUDE.md` (Forbidden Files)
- `src/main.ts`: Wire `regionAtTile(currentMapDoc?.regions, heroTileX, heroTileY)` + `resolveRegionAudio` / `computeAudioCrossfade` into the main loop audio/theme update.
- Audio queue: missing `dog_bark` one-shot cue for Thornwick ambience (`C3.6`).
