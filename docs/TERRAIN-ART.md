# Procedural terrain and scenery

Slice 10.3 adds original muted dark-fantasy pixel art generated entirely by our own Python drawing code. No source images, copied art, AI image service or additional installed tooling. Desktop browser is primary; the same static Canvas2D baking works on Android/iOS.

From `game/`, using Python 3 and the existing Pillow 12.3.0:

```text
python tools/make-terrain.py
python tools/make-terrain.py --check
python tools/make-terrain.py --check --preview ../.planning/phases/10-generated-art/10-03-preview.png
npm test -- --run tests/terrain.test.ts
npm run typecheck
```

The optional preview is a private contact sheet, not a shipped dependency. The script resolves outputs against its own location, so regeneration also works from another working directory. `--check` renders twice in memory, validates bounds, overlap, alpha, distinct variants and determinism, then compares shipped metadata, PNG hash and exact decoded pixels. It doesn't rewrite shipped assets. Pillow/PNG compression changes can alter the content hash; use the recorded Pillow version for exact byte reproduction.

`public/terrain/terrain.json` describes a single 512×512 RGBA atlas: 24 base tiles (four variants each of grass, dirt, water, rock, marsh and snow), 96 cardinal feather overlays, three trees (fir, broadleaf, dead bog tree), two cottages and one ruin. The PNG is **105,992 bytes**, **1 MiB decoded**. Its filename contains the first 12 characters of its SHA-256. Metadata includes both PNG and decoded-pixel SHA-256. All authored frames use `license: own` in `assets.json`.

After changing art, regenerate, update only the terrain PNG path in `assets.json`, and remove only the superseded terrain PNG if it is no longer referenced. The generator intentionally does not rewrite the shared provenance manifest or delete existing files. Existing sprite/audio/icon entries must remain intact.

`src/terrain.ts` imports metadata and loads the PNG through `import.meta.env.BASE_URL`. `Renderer.init` awaits that image before baking any chunks; one decoded image is shared, with explicit load/dimension failures and retry on the next load call. It is a Canvas2D source, not an extra uploaded Pixi atlas. The existing Workbox `**/*.{js,css,html,png,svg,json}` glob includes both generated files; no service-worker/update-gate changes are needed. Parent owns production build/offline browser verification.

Variants depend only on world coordinates and kind, without consuming simulation randomness. Higher-priority cardinal neighbours feather a few pixels across terrain boundaries. Slope brightness, height brightening and the south-facing cliff band remain baked. Trees and cottages are drawn in stable world order using full image bounds so roofs, canopy and shadows continue across chunk edges, including corners. Map object order, collision footprints, movement costs and saves are unchanged.

Performance stays with the existing 16×16-tile chunks: one 512×512 canvas/texture and one Pixi sprite per chunk. New work happens during initialization only: base blits, up to four edge blits, lighting and scenery. Scenery is sorted/prepared once per renderer; each chunk scans the prepared list as before. No per-tile Pixi objects, texture filters, animation or frame-time terrain processing.

Limits: snow and ruins are generated art only; the existing map enums have no corresponding kinds, and this slice adds none. There are four variants per terrain and only cardinal feathers, without diagonal autotiling or animated water. Scenery remains baked under units, as in the previous renderer; no new occlusion system. The prototype's canopy/roof overhang can cover nearby ground visually, while navigation uses existing footprints. Real-phone memory/FPS/art acceptance remains the Phase 10.5 gate; this slice does not claim mobile performance validation. Parent owns gameplay screenshots, full build/Playwright and commits/push.
