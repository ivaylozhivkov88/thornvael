# 00-EXECUTIVE-SUMMARY — Thornvael Full Audit & Master Plan (2026-11-24)

## 1. Overall State (~85% Complete)
- **Core Value Status:** **Working & Verified.** Real-time squad control, deterministic fixed-timestep combat (`< 1 ms` at 300 units), 4 classes, 46 campaign missions + 4 dedicated town hubs (Thornwick, Redmarsh, Oakhaven, Highcrest), and PWA offline support are all implemented and passing (`167/167` Vitest files, `1194/1195` tests, `typecheck` 0 errors, `validate-all: OK`).
- **Top 5 Strengths:**
  1. Deterministic simulation (`src/sim/*`) with `< 1 ms` step at 300 units and exact save/restore `sim.hash()`.
  2. Rich content depth: 50 campaign nodes (4 acts), 4 distinct town hubs, 112 quests, 219 dialogues, 1,138 `.m4a` voices.
  3. Zero viewport overflow (`overflowX: false`, `overflowY: false`) across desktop `1280×720`, mobile landscape `844×390`, and portrait `390×844`.
  4. Offline PWA architecture with `SAVE_VERSION = 7` migrations, IndexedDB, and export/import.
  5. Strong automated test coverage (167 test files including TTK, 100k loot audit, and town BFS reachability).
- **Top 5 Weaknesses / Blockers to "Ready for Friends":**
  1. **[S2]** 246/261 paperdoll item icons still pending on `gemini/item-images`.
  2. **[S2]** `main` precache is `12.42 MB` (cleanup branch `gemini/cleanup` cuts it to `7.37 MB`, not yet merged to `main`).
  3. **[S2]** 7 of 10 `tutorial.json` onboarding triggers unwired in `src/main.ts`.
  4. **[S2]** 11 content packs (`elite-affixes`, `merc-abilities`, `salvage-lines`, etc.) remain data-only.
  5. **[S2]** 10 sprite sheets in `public/sprites/*.png` exceed 2 MB (`check-repo.mjs` limit) & 2 audio cues (`amb_town_ironcamp`, `dog_bark`) missing.

## 2. Prioritized Backlog (40 Tasks across 3 Waves)

### Wave 1 — "Honest & Polished for 30 Minutes" (Gate: < 8 MB precache, 0 broken imgs, full Act 1 onboarding & icons)
| ID | Task | Area | Sev | Size | Owner | Deps |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Merge `gemini/cleanup` size cuts (<8 MB precache, WebP portraits, 5 orphan deletes) | Perf/Size | S2 | S | Claude/Git | — |
| T02 | Finish 246/261 item doll icons (`briefs/item-icons-brief.md`) + `assets.json` | Art | S2 | L | Gemini | — |
| T03 | Remove/hide `.tv-loading-bg-img` when loading screen closes (`src/loadingscreen.ts`) | UI | S3 | S | Gemini | — |
| T04 | Wire remaining 7 `tutorial.json` triggers in `src/main.ts` | Tutorial | S2 | S | Gemini | — |
| T05 | Synthesize `amb_town_ironcamp.m4a` & `dog_bark.m4a` (`briefs/audio-cues-brief.md`) | Audio | S2 | S | Gemini | — |
| T06 | Render reputation tier badge in `src/townui.ts` dialogue header | UI/UX | S2 | S | Gemini | — |
| T07 | Quantize/compress 10 `public/sprites/*.png` > 2 MB under `check-repo.mjs` limit | Perf/CI | S2 | M | Gemini | — |
| T08 | Verify live `onCollectItem` quest item names in Act 1 missions (`src/main.ts:3708`) | Quests | S2 | S | Claude | — |
| T09 | Run interactive Playwright walkthrough of Shop/Tavern/Spellbook/Inventory modals | E2E | S2 | M | Gemini | T01 |
| T10 | Clean/register untracked `.planning/e2e`, `.planning/evidence`, and `public/itemicons` for `check:repo` | CI | S2 | S | Gemini | T02 |
| T11 | Test on real iPhone Safari & Android Chrome (touch gestures + iOS Web Audio mute switch) | Mobile | S2 | M | User/Manual | T01 |
| T12 | Add Playwright E2E check for `editor.html` and `wiki.html` smoke load | E2E | S3 | S | Gemini | — |

### Wave 2 — "Full Campaign Polish" (Gate: Acts 1–4 narrative, elite/merc depth, E2E playthrough)
| ID | Task | Area | Sev | Size | Owner | Deps |
| --- | --- | --- | --- | --- | --- | --- |
| T13 | Wire `elite-affixes.json` into `src/sim/combat.ts` + determinism test | Combat/Sim | S2 | M | Claude | — |
| T14 | Wire `merc-abilities.json` into merc AI (`src/sim/combat.ts`) | Mercs/Sim | S2 | M | Claude | — |
| T15 | Wire `merc-party-banter.json` party banter bubbles in `src/main.ts` | Mercs/UI | S3 | S | Gemini | — |
| T16 | Wire `salvage-lines.json` blacksmith Salvage button in `src/townui.ts` | Town/UI | S3 | M | Gemini | — |
| T17 | Wire `consumable-effects.json` into `src/sim/hero.ts` | Hero/Sim | S3 | M | Claude | — |
| T18 | Wire `rare-name-parts.json` into `src/sim/town.ts` item naming | Loot/Sim | S3 | S | Claude | — |
| T19 | Wire `cutscene-scripts.json` mission intro/outro overlay in `src/main.ts` | Campaign | S3 | M | Claude | — |
| T20 | Align Act 3 & Act 4 mission dialogues/objectives (`HANDOFF.md:61-62`) | Campaign | S2 | L | Gemini | — |
| T21 | Cross-act thread verification (flags, items, characters across Acts 1–4) | Campaign | S2 | M | Gemini | T20 |
| T22 | Generate dedicated Act 2–4 town backdrop art for Redmarsh/Oakhaven/Highcrest | Art | S3 | M | Gemini | — |
| T23 | Add Playwright E2E playthrough for Act 2/3/4 town shop + tavern + exit to world map | E2E | S2 | M | Gemini | T09 |
| T24 | Add unit tests for `SAVE_VERSION` v1..v7 backward compatibility with real snapshots | Saves | S2 | S | Gemini | — |
| T25 | Measure live browser FPS (`?debug` + `stats-gl`) with 300 active units on mobile viewport | Perf | S2 | M | Gemini | — |
| T26 | Code-split `src/main.ts` (`643 kB` chunk) into lazy UI/modal chunks | Perf | S3 | M | Claude | — |

### Wave 3 — "Polish, Endgame & Editor/Multiplayer" (Gate: Challenge rifts, refactored UI, skirmish polish)
| ID | Task | Area | Sev | Size | Owner | Deps |
| --- | --- | --- | --- | --- | --- | --- |
| T27 | Wire `challenge-rifts.json` endgame mode in `src/missionui.ts` | Endgame | S3 | L | Claude | — |
| T28 | Wire `class-skill-data.json` & `hero-visuals.json` into `src/heroui.ts` / `src/render.ts` | Hero/UI | S3 | M | Claude | — |
| T29 | Wire `ambient-objects.json` decorative prop metadata in `src/render.ts` | World | S3 | S | Claude | — |
| T30 | Extract town/quest/dialogue controllers out of 4.3k-line `src/main.ts` | Arch | S3 | L | Claude | — |
| T31 | Extract shop/tavern/school sub-panels out of 1.5k-line `src/townui.ts` | Arch | S3 | M | Claude | — |
| T32 | Add 300-unit WebGL memory & texture eviction stress test for iOS Safari | Perf | S2 | M | Claude | T07 |
| T33 | Add full keyboard/gamepad accessibility pass on `townui.ts` & `heroui.ts` | UX | S3 | M | Gemini | — |
| T34 | Add skirmish map preview thumbnails in `missionui.ts` | UI | S3 | S | Gemini | — |
| T35 | Add audio volume sliders & tutorial reset toggle in Pause/Settings modal | Settings | S3 | S | Gemini | T04 |
| T36 | Add `offline.test.ts` check that `chapter1-manifest.json` matches `git diff` in CI | CI | S2 | S | Gemini | — |
| T37 | Convert remaining `hero-*.png` / `portrait-*.png` to WebP (after syncing `build-wiki-data.mjs`) | Perf | S3 | S | Gemini | T01 |
| T38 | Add automated broken-`<img>` assertion to `tools/e2e/run-e2e.mjs` (0 allowed) | E2E | S3 | S | Gemini | T03 |
| T39 | Add WebKit Playwright CI job (non-Windows runner) for Safari regression checks | CI | S3 | M | Claude | — |
| T40 | Final release tag & GitHub Pages deploy smoke test (`https://ivaylozhivkov88.github.io/thornvael/`) | Release | S2 | S | User/CI | T01..T26 |

## 3. Questions for the User (Decisions Only You Can Make)
1. Should `gemini/cleanup` (`03e7398`, precache `< 8 MB`) and `gemini/towns-2-3-4` (`7c1702c`, already on `main`) be merged together now?
2. For `public/sprites/*.png` (> 2 MB, 10 files): do you approve lossy 8-bit RGBA quantization (`pngquant`) to pass `check-repo.mjs` `<= 2 MB`, or should `check-repo.mjs` allow > 2 MB for multi-direction sprite atlases?
3. Do you want Wave 2's 11 unwired content packs (`elite-affixes`, `merc-abilities`, `salvage-lines`, etc.) prioritized before sharing with friends, or only Wave 1?

## 4. Index of Audit Reports
- [01-STATE.md](file:///d:/ROM%202%20clone/game/.planning/audit/01-STATE.md)
- [02-PLAYTHROUGH.md](file:///d:/ROM%202%20clone/game/.planning/audit/02-PLAYTHROUGH.md)
- [03-VISUAL-UX.md](file:///d:/ROM%202%20clone/game/.planning/audit/03-VISUAL-UX.md)
- [04-GAMEPLAY.md](file:///d:/ROM%202%20clone/game/.planning/audit/04-GAMEPLAY.md)
- [05-PERF-SIZE.md](file:///d:/ROM%202%20clone/game/.planning/audit/05-PERF-SIZE.md)
- [06-CODE-QUALITY.md](file:///d:/ROM%202%20clone/game/.planning/audit/06-CODE-QUALITY.md)
- [briefs/item-icons-brief.md](file:///d:/ROM%202%20clone/game/.planning/audit/briefs/item-icons-brief.md)
- [briefs/audio-cues-brief.md](file:///d:/ROM%202%20clone/game/.planning/audit/briefs/audio-cues-brief.md)
