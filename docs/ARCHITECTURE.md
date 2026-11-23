# Thornvael Architecture

## 1. Layered Architecture

1. **Simulation Layer (`src/sim/`)**
   - Fixed-timestep deterministic engine (`src/sim/sim.ts`, `combat.ts`, `path.ts`, `hero.ts`, `items.ts`, `difficulty.ts`, `rng.ts`).
   - Zero PixiJS or DOM imports; uses seeded `Rng` so replays, state hashes, and headless Vitest runs are deterministic.
2. **Rendering Layer (`src/render/` & `src/doll.ts`)**
   - PixiJS v8 (`pixi.js ^8.22.0`) 2D orthogonal tile & sprite renderer with camera controls, particles, weather VFX, and paperdoll layering.
   - Reads simulation snapshots without mutating sim state.
3. **UI & Shell Layer (`src/*.ts`, `src/*.css`)**
   - Preact + DOM overlay for menus, HUD, town shops/taverns (`townui.ts`), hero sheet (`heroui.ts`), pause menu, and Codex/Wiki (`src/wiki/`).
   - Pure runtime helpers (e.g. `src/dialogue.ts`, `src/achievements.ts`, `src/sidequests.ts` stepped runtime) are decoupled from DOM rendering for headless testing.

## 2. Data Formats

- **Quests (`public/data/content/side-quests*.json`, `src/data/act{2,3}/quests.json`):**
  - Each quest has `id`, `act`, `giver`, `title`, `reward`, and `steps[]` (`id`, `kind`: `talk|fetch|kill|escort|choice`, `trigger: { type, ref, requires_step?, sets_flag? }`, `journal`, `next: string | string[] | null`).
- **Dialogue & Barks (`public/data/content/npc-dialogues.json`, `town-barks.json`):**
  - Dialogue nodes keyed by `npc` and `node` (`greeting_low|neutral|high`, `quest_before|during|after`, topic nodes) with `choices[]` supporting `requires_flag`, `sets_flag`, and `requires_quest`.
- **Maps (`public/maps/**/*.map.json`):**
  - Map format v2 (`MapDoc` in `src/mapdoc.ts`): dimensions, RLE-compressed terrain/height/blocked/light layers, entities, regions, and declarative triggers.
- **Items & Uniques (`src/sim/items.ts`, `src/sim/affixes.ts`, `src/sim/sets.ts`, `src/data/act{2,3}/uniques.json`):**
  - Typed item definitions (`ItemDef`), quality hierarchy (`normal -> magic -> rare -> set -> unique`), runes/gems, and set bonuses.

## 3. Asset & Build Pipeline

- **Atlases & Sprites:** Validated by `npm run check:atlases` (`tools/check-atlases.mjs`).
- **Wiki Generation:** `npm run wiki:data` (`tools/build-wiki-data.mjs`) compiles `src/wiki/data/*.json` directly from `src/sim/*` and `public/data/content/*`.
- **Offline Manifest & Bundle:** `npm run build` executes `tools/make-manifest.mjs`, runs `npm run typecheck`, and bundles static assets via Vite + `vite-plugin-pwa`.
