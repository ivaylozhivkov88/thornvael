# Gameplay Depth & Simulation AI Design Plan (`WISHLIST E3–E7, E10–E15`)

## Architecture & Determinism Contract

All modules live under `src/sim/ai/` and are pure TypeScript with **zero** `Math.random()`, `Date.now()`, `performance.now()`, DOM, or PixiJS imports.

- **PRNG**: Every random roll uses `Rng` (`src/sim/rng.ts`, mulberry32) or a dedicated seeded `Rng` passed into the subsystem.
- **Fixed-Point & Integer State**: Coordinates, timers, radii, and percentages are integers (fixed-point `FP = 256` where world-space positions are tracked, or tile integers). No floating-point state is included in `hashState()`.
- **Iteration Order**: State is stored in sorted-ID arrays or fixed-size typed/record arrays; no unordered `Map`/`Set` iteration feeds any hash.
- **Snapshot & Hash**: Every subsystem exposes `snapshot()`, `restore(snap)`, and `hashInto(mix)` (FNV-1a 32-bit mix) so `Sim` or standalone harnesses verify identical hashes across seed+command replays and snapshot/restore cycles.
- **Performance Budget**: All per-tick updates run in $O(\text{active entities})$ with staggered AI decisions (every `N` ticks by `id % N`) and zero per-tick heap allocations on hot paths, keeping a 300-unit step well under `1.0 ms`.

---

## Module Breakdown

### 1. `E3`: Elite Packs, Champions & Loot Critters (`src/sim/ai/elite-director.ts`)
- **What & Why**: Gives overworld packs and rare encounters distinct tactical identity and high-value burst rewards without external assets.
- **Affixes**: `fast` (+35% move/attack cadence), `vampiric` (heals 20% of damage dealt), `shielded` (periodic regenerating ward HP), `teleporting` (blinks every 125 ticks when pressured), `fire_aura` (pulses integer fire damage in 2-tile radius every 25 ticks).
- **Loot Critter**: Deterministic roaming treasure-runner (`loot_critter`) spawned by seed/region; flees away from hero along walkable directions, drops tiered loot/gold on kill, and despawns after a fixed escape timer (750 ticks) if unkilled.
- **Deterministic State**: `packs[]` (sorted `packId`, `leaderId`, `memberIds[]`, `affixes[]`, `shieldHp`, `teleportCd`, `auraCd`) and `critters[]` (`id`, `x`, `y`, `hp`, `escapeTicks`, `alive`).
- **Tests**: Affix assignment determinism from seed, `teleporting` / `fire_aura` / `shielded` / `vampiric` tick behavior, loot critter flee + timeout despawn, snapshot/restore hash invariance.

### 2. `E4`: Boss Phase State Machines & Telegraphed Hazards (`src/sim/ai/boss-phases.ts`)
- **What & Why**: Transforms Act bosses (`morvessa`, `gorrathul`, `vesperion`, `ashkarath`) into multi-phase encounters with clear telegraph windows, add spawns, and enrage pressure.
- **Boss Specs**:
  - `morvessa` (Silk Widow): Phase 1 (`100%..65%` HP) venom cones; Phase 2 (`65%..30%`) web-snare rings + spiderling add waves; Phase 3 (`<30%`) brood frenzy. Enrage at `4500` ticks (180s).
  - `gorrathul` (Sand Glutton): Phase 1 (`100%..60%`) ground slam circles; Phase 2 (`60%..25%`) burrow-emerge + dune-worm adds; Phase 3 (`<25%`) sandstorm vortex hazards. Enrage at `5000` ticks.
  - `vesperion` (Lord Admiral): Phase 1 (`100%..65%`) broadside line barrages; Phase 2 (`65%..30%`) drowned-crew add spawns + tide surge; Phase 3 (`<30%`) tempest lightning rings. Enrage at `5500` ticks.
  - `ashkarath` (First Warden): Phase 1 (`100%..70%`) cinder cleave cones; Phase 2 (`70%..35%`) magma fissures + obsidian sentinel adds; Phase 3 (`<35%`) caldera collapse multi-ring telegraphs. Enrage at `6000` ticks.
- **Telegraphed Hazards**: `{ id, kind: 'circle' | 'line' | 'cone' | 'ring', x, y, radius, windupTicks, activeTicks, damage, triggered }`. Windup counts down deterministically and fires exact damage on `windupTicks === 0`.
- **Tests**: Phase transitions at exact HP thresholds, telegraph windup-to-detonation timing, add-spawn caps, enrage activation, snapshot/restore hash invariance.

### 3. `E5`: Deterministic Side Dungeon / Crypt Generator (`src/sim/ai/dungeon-layout.ts`)
- **What & Why**: Generates 3–5 floor side crypts/dungeons from `(seed, biome, floorCount)` with connected rooms, corridors, stairs, a guaranteed miniboss room, and a treasure chest room.
- **Algorithm**: BSP / non-overlapping room placement on a `48x48`–`64x64` grid using `Rng`, L-shaped corridor carving, BFS connectivity guarantee, furthest-room placement for stairs/miniboss/chest.
- **Deterministic State**: Pure data `DungeonRun` (`seed`, `floors[]` with `tiles` `Uint8Array`, `rooms[]`, `minibossRoomId`, `chestRoomId`, `stairsDown`, `stairsUp`).
- **Tests**: Same seed produces byte-identical layouts, all rooms reachable from entrance, 3–5 floors, miniboss + chest present on final/designated rooms, zero `Math.random`.

### 4. `E3` (Shrines), `E6`, `E7`, `E10–E14`: Quests, Companions, Shrines, Events, Tiers & Skirmish (`src/sim/ai/shrines-events.ts`, `src/sim/ai/companion-orders.ts`, `src/sim/ai/skirmish-modes.ts`)
- **Shrines (`shrines-events.ts`)**: `haste`, `xp`, `mana`, `fortune`, `danger` shrines with activation cooldowns and timed buff durations (`tickBuffs`, `activateShrine`), plus deterministic **Roaming Events** (`ambush`, `caravan`, `fog_wraiths`) and **Waypoint Registry** (unlock by proximity/flag, deterministic fast-travel validation).
- **Quests (`shrines-events.ts`)**: State machines for `wave_defense` (wave index, spawn timer, remaining foes, fail on objective destruction), `escort` (escort HP, waypoint index, arrival check), and `hunt` (named elite target id, kill verification).
- **Companion Orders (`companion-orders.ts`)**: Deterministic mercenary stance state machine (`follow` | `hold` | `attack`) with leash radius, target acquisition, and resurrect cooldown.
- **Difficulty & Hardcore (`skirmish-modes.ts`)**: Tier definitions `Wanderer` (0), `Veteran` (1), `Doomed` (2) with HP/damage/drop/affix-pool modifiers + `hardcore` flag (permanent death lock on `hp <= 0`).
- **Skirmish Mode Variants (`skirmish-modes.ts`)**: State machines for `capture_shrines` (control points + score ticks), `survive_waves` (escalating waves + timer), and `king_of_the_hill` (hill capture progress + contested pause).
- **Tests**: All mode win/loss transitions, shrine buff expiry, waypoint unlock/travel, companion stance behavior, hardcore death lock, difficulty tier scaling.

### 5. `E15`: Command-Log Replay Verifier (`src/sim/ai/replay-check.ts`)
- **What & Why**: Lightweight deterministic verification utility that records `(tick, cmd)` entries, runs two fresh simulations with identical seed + commands, and asserts identical per-tick/final FNV-1a hashes as well as mid-run `snapshot()` -> `restore()` hash equivalence.
- **Tests**: Verifies 300-unit AI step benchmark `< 1.0 ms` per tick and full replay/snapshot invariance across all `src/sim/ai/` modules.
