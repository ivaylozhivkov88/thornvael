# FX Integration Notes (`src/fx/` A1–A10 + `src/render.ts`)

## 1. Live Integration Already Wired in `src/render.ts`

`Renderer` now owns `readonly fxEngine: FxEngine` and invokes all Wave 1 (`A1–A4`, `A9–A10`) and Wave 2 (`A5`, `A7`, `A8`) subsystems live inside `Renderer`:

- **Quality & Reduced-Motion Sync**: `setQuality(q)` and `draw(...)` keep `fxEngine` synchronized with `renderer.quality` (`0 -> 'low'`, `1|2 -> 'high'`) and `isReducedMotionActive()` (`src/atmosphere.ts`, kept intact).
- **A1 Hit Feedback (`fxEngine.hitFeedback`)**:
  - `runFx(...)` forwards damage events (`e.type === 0`) to `fxEngine.hitFeedback.onHit(...)` with attacker-to-target direction vector, crit flag, unit ID, and enemy `family`.
  - Unit render loop checks `fxEngine.hitFeedback.isFlashing(i)` to trigger crisp 80–110 ms white sprite flashes (safe for both `Sprite` and 4-layer `UnitSprite`).
  - `renderFxEngineLayers()` draws pooled directional material particles (`blood`, `bone`, `ash`, `spark`, `ichor`, `ectoplasm`) onto `fxWorldGfx`, and `draw()` folds `fxEngine.hitFeedback.getShake()` into `world.position`.
- **A2 Death FX (`fxEngine.deathFx`)**:
  - Alive-to-dead transition in `draw()` invokes `fxEngine.deathFx.onUnitDeath(x, y, family, isBoss)`.
  - `renderFxEngineLayers()` renders corpse decals & bouncing bone scatter onto `fxGroundGfx`, and rising caster/boss motes onto `fxWorldGfx`.
- **A3 Footsteps (`fxEngine.footsteps`)**:
  - Moving visible units feed displacement `(dx, dy)` and resolved tile terrain (`water`, `marsh`, or active biome surface) into `fxEngine.footsteps.recordMove(...)`; active ripples/puffs render onto `fxGroundGfx`.
- **A4 Spell VFX (`fxEngine.spellVfx`)**:
  - Spell cast (`e.type === 9`) and area impact (`e.type === 5`) events emit school-tinted `emitGroundLightBurst(...)` rendered onto additive `fxAddGfx`.
- **A5 Dynamic Lighting (`fxEngine.dynamicLighting`)**:
  - `draw()` submits hero torch, ready shrines, town torches/campfires, visible volcanic/caldera lava pools, and transient spell cast lights (`emitSpellLight`), painting a low-res (`384x216`) multiply darkness canvas (`dynLightMulSprite`) and radial additive glow canvas (`dynLightAddSprite`).
  - Completely disabled on `quality === 0` (`low`).
- **A6 Atmosphere (`src/atmosphere.ts`)**:
  - Existing 1-line `updateAtmosphere(...)` hook in `src/render.ts` preserved untouched.
- **A7 Region Color Grade (`fxEngine.regionGrade`)**:
  - `setBiome(...)` and `setRegionContext(...)` configure biome/region/weather presets; `draw()` feeds `sim.daylight` and draws the smoothly interpolated tint onto `gradeOverlay`.
- **A8 Camera Polish (`fxEngine.cameraPolish`)**:
  - `zoomBy(...)` delegates clamping and focal-point anchoring to `cameraPolish.solveZoomAroundPoint(...)`.
  - Hero casts in `runFx(...)` trigger directional `triggerSpellRecoil(...)`.
  - `triggerIntroPan(...)` is exposed on `Renderer`, and `cameraPolish.getTotalOffset()` is applied non-destructively to `world.position` (zeroed automatically when `reducedMotion: true`).
- **A9 Cursor & Target Feedback (`fxEngine.cursorTarget`)**:
  - `draw(..., v)` updates hover target rank/state (`normal`, `elite`, `boss`, `npc`, `casting`) and emits click ripples on new `v.ping` events, drawing hover outlines onto `rings` and click ripples onto `fxWorldGfx`.
- **A10 Loot Drop Feel (`fxEngine.lootDrop`)**:
  - `draw()` tracks `sim.cb.bI` loot bag slots, spawning parabolic bounce arcs on new drops, removing picked-up drops, lifting bag visuals by `arc.z`, and gating loot beams via `fxEngine.lootDrop.isRarityVisible(rarity)`.

---

## 2. Remaining Triggers for `src/main.ts` / `src/shell.ts` (Currently Locked)

When wiring `main.ts` and `shell.ts` in the integration pass:

1. **Named Region & Weather Updates (`renderer.setRegionContext`)**:
   - In `main.ts` (`checkVisit()` / mission load), pass `{ biome, region: activeRegionName, weather }` whenever the player enters a new `MapDoc.regions` zone.
2. **Region Intro Camera Pan (`renderer.triggerIntroPan`)**:
   - On mission start (after `renderer.init(sim)`), call `renderer.triggerIntroPan(focusTx, focusTy, heroTx, heroTy, regionTitle, 2200)` and call `renderer.fxEngine.cameraPolish.cancelIntroPan()` when the player drags/pans manually.
3. **Boss Slow-Mo & Hit-Stop Gate (`advanceStep` / accumulator in `main.ts`)**:
   - In `main.ts` (~line 3476), update frame gating to:
     ```ts
     const frozen = renderer.feel.isFrozen(now) || renderer.fxEngine.hitFeedback.stepHitStopFrame();
     if (!frozen) {
       acc += dt * SPEEDS[speedIdx] * renderer.fxEngine.deathFx.getTimeScale();
     }
     ```
4. **Smooth Follow & Edge-Scroll (`cameraPolish.stepFollow`, `solveEdgeScroll`)**:
   - Optionally route `cameraController.edgePan` / `followHero` in `main.ts` (~lines 3494–3530) through `renderer.fxEngine.cameraPolish.solveEdgeScroll(...)` and `stepFollow(...)` so damping and `reducedMotion` instant-snap stay unified.
5. **Loot Audio Pings & Filter Toggle (`fxEngine.lootDrop`)**:
   - In `main.ts` (`playFx()`), call `const pings = renderer.fxEngine.lootDrop.drainPingEvents()` and trigger rarity-matched drop audio (`loot_magic` / `loot_rare` / `loot_unique`).
   - Bind a hotkey / HUD button to `renderer.fxEngine.lootDrop.toggleFilter()` and toast the active filter mode (`'all' | 'magic+' | 'rare+' | 'unique+'`).
6. **DOM CSS Cursor Sync & Blocked Click Ripples (`fxEngine.cursorTarget`)**:
   - Sync `$('game').style.cursor = renderer.fxEngine.cursorTarget.getDescriptor().cssCursor` after hover updates, and emit `renderer.fxEngine.cursorTarget.emitClickRipple(tx * TILE, ty * TILE, 'blocked')` when the player clicks impassable terrain.
7. **Reduced Motion Setting (`shell.ts` / `preferences.ts`)**:
   - Expose a toggle writing `localStorage.setItem('thornvael.reducedMotion', String(enabled))`; `Renderer` and `atmosphere.ts` pick it up automatically via `isReducedMotionActive()`.
