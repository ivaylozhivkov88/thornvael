# Thornvael Performance Audit (300 Units, `src/sim/ai/`, Spatial Hash, Terrain Chunks & Atlas Budget)

Measured with `node tools/perf-profile-300.mjs` on Node v24.12.0 (Windows x64 desktop, 250 measured ticks after 40 warmup ticks per trace, `seed=20261104`, `mapSeed=7`, `hpMul=200`).

---

## 1. Simulation Step Budget (300 Active Units vs `< 1.0 ms` Target)

| Trace | Warmup | Measured Ticks | Mean (ms) | p95 (ms) | p99 (ms) | Worst (ms) | Ticks >= 1.0 ms | Mean < 1.0 ms |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| `movement` | 40 | 250 | 0.5912 | 1.0210 | 1.5731 | 2.6743 | 14 | PASS |
| `combat` | 40 | 250 | 0.1631 | 0.3108 | 0.7331 | 1.0693 | 1 | PASS |
| `spells` | 40 | 250 | 0.1927 | 0.3564 | 0.7211 | 2.9003 | 1 | PASS |
| `ai` | 40 | 250 | 0.3879 | 0.6233 | 0.8275 | 0.9948 | 0 | PASS |

### Observations
- Mean step latency stays well under the `1.0 ms` budget (`0.16 ms` – `0.59 ms`) across all four 300-unit scenarios.
- `movement` still hits `1.02 ms` p95 / `2.67 ms` worst (`14/250` ticks >= `1.0 ms`) every 50 ticks when 20 groups (`300` units) issue simultaneous `move` orders, exhausting `dispatchBudget = 3` and executing 20 `formation()`/`assign()` passes in a single tick.

---

## 2. `src/sim/ai/` Director & Controller Latency (300-Unit Scale)

Measured across the deterministic Wave-2 AI modules (`EliteDirector`, `BossPhaseController`, `CompanionController`, `WorldEventsDirector`, `SkirmishModeController`) with reused event arrays:

| Module Benchmark | Entities / Scope | Mean (ms) | p95 (ms) | p99 (ms) | Worst (ms) | Ticks >= 1.0 ms | Target < 1.0 ms |
|---|---|---:|---:|---:|---:|---:|:---:|
| `elite_director_300` | 75 elite packs x 4 (300 elites) + 10 loot critters | 0.0140 | 0.0315 | 0.0924 | 0.1280 | 0 | PASS |
| `boss_phases_4` | 4 campaign bosses across Phases 1–3 + hazards + adds | 0.0046 | 0.0053 | 0.0570 | 0.0716 | 0 | PASS |
| `companion_party_3v300` | 3 party companions scanning 300 `CompanionEnemyView`s | 0.0136 | 0.0140 | 0.0536 | 0.1156 | 0 | PASS |
| `companion_controllers_300` | 300 active `CompanionController`s vs 16 nearby targets | 0.0339 | 0.0567 | 0.1245 | 0.3166 | 0 | PASS |
| `world_events_skirmish_300` | `WorldEventsDirector` + `SkirmishModeController` (300 units) | 0.0073 | 0.0094 | 0.0189 | 0.0381 | 0 | PASS |

All five `src/sim/ai/` paths add `< 0.08 ms` combined mean overhead per tick (`<= 0.32 ms` worst-case across 300 units) and require no structural rewrite before integrating into `Sim.step()`.

---

## 3. Spatial Hash Query Cost (`enemyNear` & Grid Rebuild)

`Sim` maintains a flat CSR-style uniform spatial hash (`cellStart`, `cellEnd`, `cellItems`, `occupied`) over `map.w * map.h` (`64 x 48 = 3,072` cells), clearing only `occupiedN` cells per tick.

| Query Radius | Queries Measured | Mean per Query (µs) | 300-Unit Sweep (ms) |
|---|---:|---:|---:|
| `6` tiles | 12,000 | 0.600 µs | 0.1799 ms |
| `12` tiles | 12,000 | 0.520 µs | 0.1560 ms |

*(Note: `12`-tile queries exit earlier in ring order because `enemyNear` stops as soon as `(ring - 1) * FP` exceeds the nearest enemy distance `bd`.)*

---

## 4. Terrain Chunk Bake Complexity & QA Tooling Batching

| Metric | Value | Notes |
|---|---:|---|
| Chunk tile dimensions (`64x64` / `<=128`) | `16 x 16` tiles | `32 x 32` px/tile -> `512 x 512` px (`1.00 MiB` RGBA8) |
| Chunk tile dimensions (`192x192` macro) | `32 x 32` tiles (`src/render.ts:185`) | `1024 x 1024` px (`4.00 MiB` RGBA8 per chunk; `24` slots = `96.00 MiB`) |
| `64 x 64` skirmish map | `16` chunks (`16.00 MiB`) | Fits inside `MAX_CHUNKS = 24` |
| `192 x 192` macro map (`16x16` equiv) | `144` chunks (`144.00 MiB`) | `Renderer` caps pool at `24` chunks (`MAX_CHUNKS = 24`) |
| `paintZones()` blend cost | `16` `drawImage()` calls/tile on edges | Interior tiles (`a,b,c,d > 0.995`) already take 1-call fast path (`src/terrain.ts:201`) |
| Map gen + RLE decode (`64x64`) | `3.670 ms` mean | Single-shot at mission load (`93` objects) |
| `seed-gallery.mjs --mode both` | `2,281 ms` (56 maps -> 14 PNGs) | Batched single Vite SSR load, `Uint32Array` pixel packing, buffer reuse |
| `perf-profile-300.mjs` | Precomputed `groups`/`mageIds` + `Promise.all` atlas stats | Removes benchmark harness allocation skew from tick timings |
| `rebuild-and-check.mjs` | Async `spawn` batch for read-only gates | Parallelizes `check-repo`, `check-atlases`, `tsc`, `tsconfig.sw`, `--biome` |

---

## 5. Texture Atlas Pixel & GPU RGBA8 Memory Budget

Scanned across all `54` atlases (`53` unit sheets in `public/sprites/*.json` + `1` world props sheet in `public/objects/objects.json`):

| Category | Count | Dimensions | Color Pixels | Mask Pixels | Color RGBA8 | Mask RGBA8 | Total RGBA8 | Disk PNG |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| Unit Atlases (`public/sprites/`) | 53 | `2048 x 2048` (416 frames) | 222,298,112 | 222,298,112 | 848.00 MiB | 848.00 MiB | 1,696.00 MiB | 93.3+ MiB |
| World Objects (`public/objects/`) | 1 | `512 x 512` (42 frames) | 262,144 | 0 | 1.00 MiB | 0.00 MiB | 1.00 MiB | ~0.15 MiB |
| **Total (if all loaded)** | **54** | — | **222,560,256** | **222,298,112** | **849.00 MiB** | **848.00 MiB** | **1,697.00 MiB** | **93.48 MiB** |

Each unit family consumes `32.00 MiB` of uncompressed GPU RGBA8 (`16 MiB` color + `16 MiB` RGB tint mask).

---

## 6. Optimization Audit & Exact Patch Specifications

### Audit of Existing Code (`src/render.ts`, `src/terrain.ts`, `src/sim/sim.ts`, `src/sim/path.ts`)
1. **Already live in baseline**:
   - `Renderer.updateChunks()` (`src/render.ts:802-918`) already maintains a `24`-slot pool (`MAX_CHUNKS = 24`) with distance + `lastUsed` victim selection.
   - `paintZones()` (`src/terrain.ts:201-204`) already skips `4x4` sub-cell blending when all four corner weights exceed `0.995`.
2. **Remaining bottlenecks identified**:
   - **Macro-map chunk size & synchronous bake spikes**: `chunkSide()` (`src/render.ts:185`) sets `chunk = 32` (`1024x1024` px = `4.00 MiB`/chunk) on maps `> 128`, inflating the `24`-chunk pool to `96.00 MiB` instead of `24.00 MiB` (`16x16` tiles), and `updateChunks()` bakes all newly visible chunks in one frame without a per-frame bake cap. Furthermore, `paintSmoothLight()` (`src/terrain.ts:386-405`) still draws `16` `fillRect` calls with per-cell `rgba(...)` string allocations even on uniformly lit tiles.
   - **Group pathfinding fallback & untyped heap**: In `Sim.apply()` (`src/sim/sim.ts:706-710`), once `dispatchBudget` (`3`) is exhausted in a multi-group move order, remaining groups fall back to a direct straight-line waypoint (`Int32Array.of(goalCx, goalCy)`) and later contend for `PATHS_PER_TICK = 3` repaths after hitting obstacles. `Pather` (`src/sim/path.ts:119`) also stores open-set keys in a dynamic `number[]` JS array and slices `Int32Array` on every `find()`.

---

### Patch Spec A — Byte-Bounded Terrain Chunk LRU, Frame Bake Budget & Uniform Light Fast Path
*Targets (currently locked — apply in Integration Wave): `src/terrain.ts`, `src/render.ts`*

1. **`src/terrain.ts` — Add `TerrainChunkLRU` & optimize `paintSmoothLight()`**:
```ts
// Add in src/terrain.ts
export interface CachedTerrainChunk<T> {
  key: string;
  cx: number;
  cy: number;
  bytes: number;
  lastUsed: number;
  payload: T;
}

export class TerrainChunkLRU<T> {
  private readonly entries = new Map<string, CachedTerrainChunk<T>>();
  private totalBytes = 0;
  private seq = 0;

  constructor(private readonly maxBytes = 24 * 1024 * 1024) {}

  get(key: string): CachedTerrainChunk<T> | undefined {
    const hit = this.entries.get(key);
    if (hit) hit.lastUsed = ++this.seq;
    return hit;
  }

  insert(
    cx: number,
    cy: number,
    bytes: number,
    payload: T,
    protectedKeys: ReadonlySet<string>,
    onEvict: (victim: CachedTerrainChunk<T>) => void,
  ): CachedTerrainChunk<T> {
    const key = `${cx},${cy}`;
    while (this.totalBytes + bytes > this.maxBytes && this.entries.size > 0) {
      let oldest: CachedTerrainChunk<T> | null = null;
      for (const e of this.entries.values()) {
        if (!protectedKeys.has(e.key) && (!oldest || e.lastUsed < oldest.lastUsed)) oldest = e;
      }
      if (!oldest) break;
      this.entries.delete(oldest.key);
      this.totalBytes -= oldest.bytes;
      onEvict(oldest);
    }
    const rec: CachedTerrainChunk<T> = { key, cx, cy, bytes, lastUsed: ++this.seq, payload };
    this.entries.set(key, rec);
    this.totalBytes += bytes;
    return rec;
  }

  clear(onEvict: (entry: CachedTerrainChunk<T>) => void): void {
    for (const e of this.entries.values()) onEvict(e);
    this.entries.clear();
    this.totalBytes = 0;
  }
}

// Precomputed quantized dark overlay strings (0..255) to eliminate per-subcell string allocs
const LIGHT_RGBA = Array.from({ length: 256 }, (_, i) => `rgba(0,0,0,${(1 - i / 255).toFixed(3)})`);

// Replace inner loop in paintSmoothLight() (`src/terrain.ts:386-405`):
function paintSmoothLightFast(g: CanvasRenderingContext2D, map: GameMap, x: number, y: number, px: number, py: number): void {
  const a = cornerLight(map, x, y);
  const b = cornerLight(map, x + 1, y);
  const c = cornerLight(map, x, y + 1);
  const d = cornerLight(map, x + 1, y + 1);
  const minL = Math.min(a, b, c, d);
  const maxL = Math.max(a, b, c, d);
  if (minL >= 254.5) return;
  if (maxL - minL < 2) {
    const idx = Math.max(0, Math.min(254, Math.round((a + b + c + d) * 0.25)));
    g.fillStyle = LIGHT_RGBA[idx]!;
    g.fillRect(px, py, TILE, TILE);
    return;
  }
  const N = 4;
  const cell = TILE / N;
  for (let j = 0; j < N; j++) {
    const v = (j + 0.5) / N;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const l = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
      const idx = Math.max(0, Math.min(255, Math.round(l)));
      if (idx >= 254) continue;
      g.fillStyle = LIGHT_RGBA[idx]!;
      g.fillRect(px + i * cell, py + j * cell, cell, cell);
    }
  }
}
```

2. **`src/render.ts` — Keep `16x16` chunks (`1 MiB` each) and cap synchronous bakes to `2`/frame**:
```ts
// In src/render.ts:185 & updateChunks():
function chunkSide(_map: GameMap): number {
  return 16; // Keep 512x512 px (1 MiB RGBA8) even on 192x192 macro maps -> 24 MiB hard cap
}

const MAX_BAKES_PER_FRAME = 2; // Spread camera-jump chunk bakes across frames (< 2 ms/frame)
// Inside Renderer.updateChunks():
let bakesThisFrame = 0;
for (const req of toBake) {
  const existing = this.chunkMap.get(req.key);
  if (existing) {
    existing.lastUsed = seq;
    existing.sprite.visible = true;
    continue;
  }
  if (bakesThisFrame >= MAX_BAKES_PER_FRAME) break;
  bakesThisFrame++;
  // ...bake into pool or evict oldest non-active entry via TerrainChunkLRU
}
```
*Expected impact*: Drops `192x192` terrain chunk cache ceiling from `96.00 MiB` (`32x32` chunks x `24`) to `24.00 MiB` (`16x16` chunks x `24`), eliminates multi-chunk camera pan frame spikes (`<= 2` bakes/frame), and cuts `paintSmoothLight()` draw calls by up to `16x` on uniform-lit tiles.

---

### Patch Spec B — Typed Binary Heap & Deterministic Time-Sliced Group Pathfinding
*Targets (currently locked — apply in Integration Wave): `src/sim/path.ts`, `src/sim/sim.ts`*

1. **`src/sim/path.ts` — Replace `number[]` heap with fixed `Float64Array` / `Int32Array` typed heap**:
```ts
// In Pather (`src/sim/path.ts:119`):
// `f * 262144 + idx` exceeds 32-bit signed int on large f, so use Float64Array of length `n` (zero GC)
private readonly heap: Float64Array;
private heapLen = 0;

constructor(private readonly map: GameMap) {
  const n = map.w * map.h;
  this.heap = new Float64Array(n);
  // ...existing typed arrays
}

private push(key: number): void {
  const h = this.heap;
  let i = this.heapLen++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p] <= key) break;
    h[i] = h[p];
    i = p;
  }
  h[i] = key;
}

private pop(): number {
  const h = this.heap;
  const top = h[0];
  const last = h[--this.heapLen];
  if (this.heapLen > 0) {
    let i = 0;
    const n = this.heapLen;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && h[c + 1] < h[c]) c++;
      if (h[c] >= last) break;
      h[i] = h[c];
      i = c;
    }
    h[i] = last;
  }
  return top;
}
```

2. **`src/sim/sim.ts` — Replace straight-line `dispatchBudget` fallback with deterministic FIFO `PendingGroupPath` queue**:
```ts
// In src/sim/sim.ts:
interface PendingGroupPath {
  ids: number[];
  sx: number;
  sy: number;
  gx: number;
  gy: number;
  goalCx: number;
  goalCy: number;
  pathId: number; // provisional direct-line PathRec id updated in place once A* resolves
}

const MAX_GROUP_ASTAR_PER_TICK = 2; // At most 2 group A* searches per tick (20 groups finish in <= 10 ticks)
private pendingGroupPaths: PendingGroupPath[] = [];

// In Sim.step(), before think(this):
private drainGroupPathQueue(): void {
  let runs = 0;
  while (runs < MAX_GROUP_ASTAR_PER_TICK && this.pendingGroupPaths.length > 0) {
    const job = this.pendingGroupPaths.shift()!;
    const rec = this.paths.get(job.pathId);
    if (!rec || rec.refs === 0) continue; // group already stopped or reassigned
    runs++;
    const pts = this.pather.find(job.sx, job.sy, job.gx, job.gy);
    if (pts) {
      rec.pts = pts; // live units sharing job.pathId smoothly adopt A* waypoints
      for (const id of job.ids) {
        if (this.pathId[id] === job.pathId) this.wp[id] = 0;
      }
    }
  }
}

// In Sim.apply(cmd) (`src/sim/sim.ts:706-710`):
if (lineClear(map, lx, ly, goalCx, goalCy)) {
  shared = Int32Array.of(goalCx, goalCy);
} else if (this.dispatchBudget > 0) {
  this.dispatchBudget--;
  shared = this.pather.find(Math.floor(lx / FP), Math.floor(ly / FP), gx, gy);
} else {
  // Queue deferred group A* rather than abandoning units to wall collisions
  shared = Int32Array.of(goalCx, goalCy);
  deferredGroupJob = true;
}
```
*Determinism note*: `pendingGroupPaths` is processed in strict FIFO command order during `Sim.step()` and must be included in `Snapshot` (`snapshot()` / `restore()`) and `Sim.hash()` so save/load and replays remain bit-identical.
*Expected impact*: Eliminates the `20`-group simultaneous A* spike in `movement` (bringing worst-case spikes from `2.67 ms` down below `< 1.0 ms` p99) without letting units walk blindly into walls after `dispatchBudget` runs out.

---

### Patch Spec C — Per-Mission Sprite Atlas Eviction & `0.5x` Mask Packing
*Targets: `src/render.ts`, `tools/sheet-to-unit.py`*

1. On mission teardown (`Renderer.destroy()` / mission switch), destroy and clear `Texture` entries in `unitTextures` for monster families absent from the next mission's `units` roster (`53 * 32 MiB = 1,696 MiB` total -> `<= 256 MiB` active mission roster, preventing iOS Safari WebGL memory eviction).
2. Downscale RGB tint masks (`*-mask.png`) to `0.5x` (`1024 x 1024` instead of `2048 x 2048`), saving `12.00 MiB` GPU RGBA8 per unit sheet (`636.00 MiB` across all 53 units) with negligible visual difference when linearly sampled.
