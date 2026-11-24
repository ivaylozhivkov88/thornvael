# 06-CODE-QUALITY — Code Quality, Tests, Saves & CI Audit (2026-11-24)

## 1. Architecture & Code Quality
- **Monolithic Entrypoints (`src/main.ts` ~4,390 lines, `src/townui.ts` ~1,560 lines):** Hard to navigate and test in isolation; future features (dialogue choices, tutorial triggers, town UI) should continue extracting pure modules like `src/sidequests-adapter.ts`, `src/dialogue.ts`, and `src/region-audio.ts`.
- **11 Unwired Content Packs (`WIRE-REPORT.md:11-24`):** `ambient-objects`, `challenge-rifts`, `class-skill-data`, `consumable-effects`, `cutscene-scripts`, `elite-affixes`, `hero-visuals`, `merc-abilities`, `merc-party-banter`, `rare-name-parts`, `salvage-lines` are validated in `public/data/content/` but lack runtime consumers.
- **`src/sim/d2-database.ts`:** Still used by `tests/d2-systems.test.ts:37` and `tools/build-wiki-data.mjs:46` (keep).
- **Sim Determinism:** `tests/combat-animation.test.ts` and `tests/save.test.ts` verify exact `sim.hash()` preservation across save/restore and 400+ ticks.

## 2. Saves, Tests & CI
- **Save System (`src/save.ts`):** `SAVE_VERSION = 7` with step-by-step `migrateSave` from v1..v7 (`steppedQuests` in v6, `reputation` in v7), IndexedDB (`src/savedb.ts`), and file export/import.
- **Test Suite (`npm test -- --maxWorkers=1`):** `167 passed (167)` files, `1194 passed | 1 skipped (1195)` tests.
- **CI Guard (`npm run check:repo`):**
  - **[S2, small]** Untracked local files in `.planning/` (e.g. `GEMINI-CLEANUP-PROMPT.md` containing `"Nival"`, `.planning/e2e/*.png`, `.planning/evidence/**`, and 20 `public/itemicons/*.png` without `assets.json` entries) cause `npm run check:repo` to fail locally if not cleaned or gitignored/registered.
  - **[S2, small]** `chapter1-manifest.json` must be regenerated (`node tools/make-manifest.mjs`, included in `npm run build`) whenever town/mission files change (`7c1702c`).
  - **[S3, small]** `tools/build-wiki-data.mjs` and `tools/extract-ref.py` have pre-existing uncommitted local modifications in the working tree.
