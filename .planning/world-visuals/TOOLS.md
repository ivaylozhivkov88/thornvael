# World Visuals & Audio Tools Research (`C0`)

| Category | Candidate | URL / Source | Licence | What It Gives Us | Plug into `tools/` | Verdict |
|---|---|---|---|---|---|---|
| **Terrain & Noise** | Pillow + Hash/Simplex Noise (`tools/make-terrain.py`) | In-repo (`PIL`, Python 3.12) | Original / MIT-style | Deterministic 512x512 terrain atlases & `skin-*.png` biome overlays | Already in `tools/make-terrain.py` | **Adopt** (primary) |
| **Terrain & Noise** | `open-simplex-noise` (JS/TS) | `github.com/joshforisha/open-simplex-noise` | MIT / Unlicense | Smooth 2D multi-octave fBm height/biome blending | Optional inline helper in `tools/` | **Adopt** (inline if needed) |
| **Procedural Decor** | Python Pillow / Sharp procedural sprites | In-repo (`PIL`, `sharp`) | Original | Original biome trees, rocks, ruins, houses, stumps, crates matching Thornvael palette | `tools/make-objects.py` / `make-terrain.py` | **Adopt** (primary) |
| **CC0 Reference Art** | Kenney RPG / Nature Packs | `https://kenney.nl/assets` | CC0 1.0 | Reference silhouettes for props/houses | Skip import to keep 100% Thornvael painterly style | **Skip** |
| **Atlas Packing** | `maxrects-packer` + `sharp` | `github.com/soimy/maxrects-packer`, `sharp` | MIT / Apache-2.0 | Fast 2D bin packing + PNG/JSON spritesheet emission | `tools/pack-objects.mjs` or Pillow packer | **Adopt** |
| **PixiJS 8 Lighting/Fog/VFX** | Native `ParticleContainer` + `TilingSprite` | `pixijs.com` (`pixi.js ^8.22.0`) | MIT | GPU-batched rain/ash/spores/embers + `multiply`/`screen` fog & light | `src/atmosphere.ts`, `src/aesthetic-vfx.ts` | **Adopt** |
| **PixiJS 8 Emitter** | `@spd789562/particle-emitter` | `github.com/spd789562/particle-emitter` | MIT | Emitter config wrapper if needed | Not needed; custom lightweight loop is smaller | **Skip** |
| **Ambient & SFX Audio** | `zzfx` / `jsfxr` + FFmpeg 8 | `github.com/KilledByAPixel/ZzFX` | MIT | Offline procedural SFX & filtered noise wind/river beds encoded to `.m4a` | `tools/make-audio.py` / `ffmpeg` | **Adopt** |
| **Map Validator** | `src/mapdoc.ts` `validate()` + `tools/empty-areas.mjs` | In-repo | Original | Enforces `<=300` units, reachability, and `<10`-tile prop density | `tools/empty-areas.mjs` (C8.1) | **Adopt** |
