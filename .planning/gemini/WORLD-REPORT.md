# Thornvael World Visuals Report (`gemini/world-visuals`)

**Branch:** `gemini/world-visuals` (never pushed to `main`)  
**Current Step:** `C1.1`

## Unfinished Steps
- **C1** (`C1.1`..`C1.5`): Terrain + Decor Foundation
- **C2** (`C2.1`..`C2.4`): Region Metadata & Atmosphere/Audio Crossfade
- **C3** (`C3.1`..`C3.7`): Thornwick as a Real Town
- **C4** (`C4.1`..`C4.6`): Map 1 Regions (Border Fords)
- **C5** (`C5.1`..`C5.3`): Maps 2, 3, 4 Regions
- **C6** (`C6.1`..`C6.2`): Other Towns, Hubs & Camps
- **C7**: Skirmish Maps Decor & Atmosphere
- **C8** (`C8.1`..`C8.4`): Polish, Empty-Areas Audit, Mobile, Offline & `FINAL.md`

## Completed Steps
- **C0 (`50fbf18`):** Researched free, licence-clean tools & PixiJS 8 patterns; recorded verdicts in `.planning/world-visuals/TOOLS.md`.
- **C1.1–C1.2 (`ee0ec14`):** Generated `public/terrain/skin-ash.png` via `tools/make-skin-ash.py`, registered in `assets.json` & `BIOME_SKINS` (`src/terrain.ts`), and verified all 42 `00-BIBLE.md §5.1` props exist in `public/objects/objects.json`.
- **C1.3–C1.5:** Added optional `frame` to `MapObject` (`src/map.ts`), Y-sorted `prepareScenery` + `mainSkin`-aware path tinting in `src/terrain.ts`, biome-specific collidable decor placement in `src/map-generator.ts` & `src/skirmish-generator.ts`, and `tests/world-decor.test.ts` (2/2 green).
