# Changes Needed in Forbidden Files (`WORLD-NEEDS-CLAUDE.md`)

Per Rule A2, `src/main.ts`, `src/townui.ts`, `src/doll.ts`, `src/sim/path.ts`, and `tests/movement.test.ts` are untouched by `gemini/world-visuals`.

## 1. `src/main.ts` — Region Audio & Atmosphere Hookup (C2.4)
- **Where:** Main game loop / render tick where the hero's tile `(hx, hy)` and `doc.regions` are known.
- **Exact patch:**
  ```ts
  import { regionAtTile } from './atmosphere';
  import { resolveRegionAudio, computeAudioCrossfade } from './region-audio';

  // On hero tile change:
  const activeRegion = regionAtTile(currentMapDoc?.regions, heroTileX, heroTileY);
  const { music, ambience } = resolveRegionAudio(activeRegion, defaultMusic, defaultAmbience);
  // Crossfade audio buses when `music` or `ambience` changes, using computeAudioCrossfade(...)
  ```
- **Why:** `src/main.ts` owns the active `AudioEngine` / music-bus crossfade calls and `setTerrainTheme(biome, seed, doc.regions)` invocation; `src/region-audio.ts` and `src/atmosphere.ts` already export the pure functions and tests.
