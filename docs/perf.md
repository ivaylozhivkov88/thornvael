# Thornvael Performance Audit (300 Units, Spatial Hash, Terrain Chunks & Atlas Budget)

Measured with `node tools/perf-profile-300.mjs` on Node v24.12.0 (Windows x64 desktop, 250 measured ticks after 40 warmup ticks per trace, `seed=20261104`, `mapSeed=7`, `hpMul=200`).

---

## 1. Simulation Step Budget (300 Active Units vs `< 1.0 ms` Target)

| Trace | Warmup | Measured Ticks | Mean (ms) | p95 (ms) | p99 (ms) | Worst (ms) | Ticks >= 1.0 ms | Mean < 1.0 ms |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| `movement` | 40 | 250 | 0.5344 | 0.8310 | 1.3094 | 2.5235 | 4 | PASS |
| `combat` | 40 | 250 | 0.1843 | 0.3338 | 0.8208 | 0.9228 | 0 | PASS |
| `spells` | 40 | 250 | 0.1902 | 0.3555 | 0.5985 | 0.8009 | 0 | PASS |
| `ai` | 40 | 250 | 0.4176 | 0.6503 | 0.8753 | 1.3977 | 1 | PASS |

### Observations
- All four traces stay well under the `1.0 ms` mean target (`0.18 ms` – `0.53 ms`) and `p95 < 1.0 ms` (`0.33 ms` – `0.83 ms`).
- The occasional `>= 1.0 ms` spikes in `movement` (4/250 ticks, worst `2.52 ms`) coincide with batch group `move` commands every 50 ticks (`20 groups x 15 units` issuing A* path searches simultaneously) and V8 GC pauses.

---

## 2. Spatial Hash Query Cost (`enemyNear` & Grid Rebuild)

`Sim` maintains a flat CSR-style uniform spatial hash (`cellStart`, `cellEnd`, `cellItems`, `occupied`) over `map.w * map.h` (`64 x 48 = 3,072` cells), clearing only `occupiedN` cells per tick.

| Query Radius | Queries Measured | Mean per Query (µs) | 300-Unit Sweep (ms) |
|---|---:|---:|---:|
| `6` tiles | 12,000 | 1.172 µs | 0.3517 ms |
| `12` tiles | 12,000 | 0.768 µs | 0.2303 ms |

*(Note: `12`-tile queries exit earlier in ring order because `enemyNear` stops as soon as `(ring - 1) * FP` exceeds the nearest enemy distance `bd`.)*

---

## 3. Terrain Chunk Bake Complexity (`src/terrain.ts`)

| Metric | Value | Notes |
|---|---:|---|
| Chunk tile dimensions | `16 x 16` tiles | `32 x 32` px/tile -> `512 x 512` px per chunk |
| Uncompressed chunk RGBA8 | `1.00 MiB` | `512 * 512 * 4 = 1,048,576` bytes |
| `64 x 64` skirmish map | `16` chunks (`16.00 MiB`) | If all chunks are baked |
| `192 x 192` macro campaign map | `144` chunks (`144.00 MiB`) | Must only bake/retain visible + margin chunks |
| `paintZones()` blend cost | `16` `drawImage()` calls/tile | 4x4 sub-cell alpha grid on zone-blended tiles |
| Map gen + RLE decode (`64x64`) | `2.71` – `4.46 ms` | Single-shot at mission load |

---

## 4. Texture Atlas Pixel & GPU RGBA8 Memory Budget

Scanned across all `54` atlases (`53` unit sheets in `public/sprites/*.json` + `1` world props sheet in `public/objects/objects.json`):

| Category | Count | Dimensions | Color Pixels | Mask Pixels | Color RGBA8 | Mask RGBA8 | Total RGBA8 | Disk PNG |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| Unit Atlases (`public/sprites/`) | 53 | `2048 x 2048` (416 frames) | 222,298,112 | 222,298,112 | 848.00 MiB | 848.00 MiB | 1,696.00 MiB | 93.3+ MiB |
| World Objects (`public/objects/`) | 1 | `512 x 512` (42 frames) | 262,144 | 0 | 1.00 MiB | 0.00 MiB | 1.00 MiB | ~0.15 MiB |
| **Total (if all loaded)** | **54** | — | **222,560,256** | **222,298,112** | **849.00 MiB** | **848.00 MiB** | **1,697.00 MiB** | **93.48 MiB** |

Each unit family currently consumes `32.00 MiB` of uncompressed GPU RGBA8 (`16 MiB` color + `16 MiB` RGB tint mask).

---

## 5. Actionable Optimization Proposals

1. **LRU Eviction for Terrain Chunks on `192x192` Macro Maps (High Impact, Low Effort)**
   - Baking all 144 chunks on a 192x192 map uses `144 MiB` of canvas/GPU memory. Keep an LRU cache capped at ~`24–32` chunks (`24–32 MiB`) around the camera viewport + 1-chunk prefetch ring.
2. **Staggered / Time-Sliced Batch Pathfinding (High Impact on `movement` Worst-Case)**
   - Spread large group `move` orders (e.g. 20 groups = 300 units) across `2–4` ticks via a per-tick A* budget queue so worst-case `movement` spikes drop from `2.52 ms` to `< 1.0 ms`.
3. **Skip `4x4` Sub-Cell Blending for Fully Interior Zone Tiles (Medium Impact on Chunk Bake)**
   - In `paintZones()`, when all 4 corners of a tile have zone weight `>= 0.99`, draw the zone skin once at `alpha = 1.0` instead of `16` sub-cell `drawImage()` calls (cuts interior zone bake draw calls by `16x`).
4. **Per-Mission Sprite Atlas Eviction & Mask Packing (Critical for Mobile / iOS Safari)**
   - Never keep unused unit atlases resident across missions (`53 * 32 MiB = 1.69 GiB` exceeds mobile WebGL limits). Evict non-present unit textures on mission unload, and consider packing the 3-channel tint mask at `0.5x` resolution (`1024x1024` -> `4 MiB` instead of `16 MiB`, saving `12 MiB` per unit family / `636 MiB` total).
