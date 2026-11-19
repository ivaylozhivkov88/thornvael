# HANDNOTE - sprite redo via Canva (updated 2026-11-19 10:13)

Repo: D:/ROM 2 clone/game. Plan order: 1) ordinary monsters (5-view turnaround) 2) heroes+bosses (9 views, key-pose sheets, maybe 192 cell; test warrior first, show user) 3) map visuals 4) random-map skirmish generator (HoMM3 only as logic reference, never copy assets).
Rules: stop at weekly usage 98%; reply to user in Bulgarian, short; push after each step; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; never touch game/src/sim/path.ts, tests/movement.test.ts, models/, tools/render-unit.py.

## Per-unit protocol (one unit at a time, Canva has a cooldown ~400 s after each call)
1. `sleep 400` (cooldown), then Haiku agent step A: Canva generate-image LANDSCAPE_2_1, prompt from tools/canva-batch.py TPL with a good one-line creature description, magenta #ff00ff background; reply "COOLDOWN <MEDIA id>" (or none on quota -> wait 400 s, retry).
2. `sleep 400`, then Haiku agent step B: create-design with references [MEDIA id], brief "Place this image full-bleed as the only content, no text, no changes, landscape.", poll get-create-design-async-job, export-design png pro, curl -L to tools/.canva-sheets/<unit>.png.
3. `python tools/sheet-build.py tools/.canva-sheets/<unit>.png <unit>` ; `npm run check:atlases` ; `echo ok > tools/.canva-sheets/<unit>.done` ; `python tools/handnote.py`.
4. Every ~5 units: `npx tsc --noEmit; npm run check:repo; npm run check:atlases`, commit own files (public/sprites, assets.json, tools/canva-units.json, tools/HANDNOTE.md), push.
After 3 failures on one unit: pause it, continue, report DONE/REDO at the end.

## Status
DONE (52/52): briar-hound flintback mire-wisp ruin-mite thorn-boar quill-fiend fallen-shaman glasswing rootbound cinderling gloom-stag salt-crab fetish-blowdart witch-doctor hollow-knight spore-matron dune-lurker storm-kite basalt-brute sand-raider dune-scarab claw-viper dune-beast maggot-swarm lantern-eel ash-weaver pale-burrower ironbark rift-moth greater-mummy hollow-king wendigo-bruiser crowned-maw frost-bell silt-colossus redglass-drake night-orchard stormtree doom-knight cinderhorn anvilmaw-smith morvessa gorrathul vesperion ashkarath hero warrior archer mage gnoll golem imp

TODO (0): 

Missing descriptions in canva-units.json (write one first): gnoll golem imp mage hero warrior archer + bosses morvessa gorrathul vesperion ashkarath. Many existing ones are generic - a better one-liner gives better art.

## End of run
Tune FAMILY_VISUALS in src/render.ts (~line 121) via ?art=1 (dev server thornvael-dev port 5199), full vitest, update PROGRESS.md, final Bulgarian report with DONE/REDO.

## Campaign Deep Design Log (2026-11-19)
- [x] **Step 0**: Surveyed all existing campaign missions, monster families (`monsters.json`, `super-uniques.ts`), lore (`factions.json`, `timeline.json`, `bosses.json`, `lore-books.json`), biomes/zones (`terrain.ts`), and portrait/sprite assets (`assets.json`).
- [x] **Step 1 (`00-BIBLE.md`)**: Completed `.planning/campaign/00-BIBLE.md` (world, tone, 4 cities, overarching threat, 4-map resolution, 8 key characters with portrait paths, full monster/biome matrix, glossary).
- [x] **Step 2.1 (`map-1-border-fords.md`)**: Completed `.planning/campaign/map-1-border-fords.md` (192x192 map, Thornwick hub + 6 regions, enemies, 12 quests, dialogues, music brief, rewards).
- [x] **Step 2.2 (`map-2-redmarsh-wastes.md`)**: Completed `.planning/campaign/map-2-redmarsh-wastes.md` (192x192 map, Redmarsh hub + 6 regions, enemies, 12 quests, dialogues, music brief, rewards).
- [x] **Step 2.3 (`map-3-iron-coast.md`)**: Completed `.planning/campaign/map-3-iron-coast.md` (192x192 map, Oakhaven hub + 6 regions, enemies, 12 quests, dialogues, music brief, rewards).
- [x] **Step 2.4 (`map-4-obsidian-caldera.md`)**: Completed `.planning/campaign/map-4-obsidian-caldera.md` (192x192 map, Ironcamp hub + 6 regions, enemies, 12 quests, dialogues, music brief, dual endings A/B).
- [x] **Step 3 (`03-GAPS.md` + declarative `MapDoc` v2)**: Completed `.planning/campaign/03-GAPS.md`, `campaign-4maps.json`, and `map1-border-fords.macro.map.json` (validated 192x192 `MapDoc` v2 with Thornwick hub, 6 regions, 12 quests).
- [x] **Step 4 (`01-PROGRESSION.md`)**: Completed `.planning/campaign/01-PROGRESSION.md` (Lv 1–50 curve, Warrior/Mage balance, Skirmish carryover rule, Character Roster v2 fields).
- [x] **Step 5 (`02-PRODUCTION-PLAN.md`)**: Completed `.planning/campaign/02-PRODUCTION-PLAN.md` (16 atomic GSD tasks across Phases 15.1–15.5 with dependencies, effort estimates, and non-overlapping file ownership).
- [x] **Task 1 (`P15.1-01..04` — Resolve Engine Gaps GAP-01..06)**: Resolved GAP-01..06 in `src/mapdoc.ts`, `src/sim/data.ts`, `src/sim/script.ts`, `src/missionui.ts`, updated `tests/mission.test.ts`, and added `tests/macro-engine-gaps.test.ts` (all green).
- [x] **Task 2 (`P15.2-01` — Build Map 1 `192x192`: `The Border Fords & Weeping Ossuary`)**: Added `tools/make-macro-map1.mjs`, generated `src/missions/map1-border-fords.map.json`, and verified with `tests/macro-map1.test.ts` (all green).
- [x] **Task 3 (`P15.2-02` — Build Map 2 `192x192`: `The Redmarsh Wastes & Ironheart Cisterns`)**: Added `tools/make-macro-map2.mjs`, generated `src/missions/map2-redmarsh-wastes.map.json`, and verified with `tests/macro-map2.test.ts` (all green).
- [x] **Task 3 (`P15.2-03` — Build Map 3 `192x192`: `The Iron Coast & Drowned Citadel`)**: Added `tools/make-macro-map3.mjs`, generated `src/missions/map3-iron-coast.map.json`, and verified with `tests/macro-map3.test.ts` (all green).
- [x] **Task 4 (`P15.2-04` — Build Map 4 `192x192`: `The Obsidian Caldera & Cinder Throne`)**: Added `tools/make-macro-map4.mjs`, generated `src/missions/map4-obsidian-caldera.map.json`, and verified with `tests/macro-map4.test.ts` (all green).
- [x] **Task 5 (`P15.2-05` — Macro Campaign Wiring)**: Registered `map1-border-fords`..`map4-obsidian-caldera` in `src/mission.ts` (`BUILT_IN`), verified by `tests/macro-campaign-wiring.test.ts` (all green).
- [x] **Asset Consolidation (`D:/downloads` -> `tools/.canva-sheets/`)**: Moved and renamed all 35 raw Thornvael files from `D:/downloads` into `tools/.canva-sheets/` (`tile-*.jpg`, `obj-*.jpg`, 18 `npc-*-raw.jpg`, `portrait-prompts-complete.md`, `thornvael-notes.md`, `gemini-boss-extra-barks.json`, `gemini-merc-barks.json`), removed 4 identical `(1)` duplicates, and updated `tools/.canva-sheets/mkportraits.py`.
- [x] **Step 0 (`tools/INVENTORY.md` + `tools/WISHLIST-MAX.md` markup)**: Created `tools/gen-inventory.mjs` and generated `tools/INVENTORY.md` (233 audio, 53 sprite atlases, 68 portraits, 161 itemicons, 92 content JSONs, 98 src modules); marked baseline statuses in `tools/WISHLIST-MAX.md` before launching Orchestrator Waves (Agents A–F).

## Supervisor Dashboard (Updated 2026-11-19 15:03)
| Agent | Task | Status | Last Commit | Time | Issue / Note |
|---|---|---|---|---|---|
| Campaign Map 1–4 | Macro campaign maps + `src/mission.ts` wiring | **INTEGRATED** | `02cf75e` | 12:45Z | `5a648ab` circular `Kind.Mage` init fixed by Supervisor |
| Agent A | Modular FX (`src/fx/*`) | **FILE-ONLY** (14/14 PASS) | `ee3afcc` | 12:43Z | Awaiting render/main hook; commit index shared with E |
| Agent B | 27 `.m4a` + catalog + streaming adaptive audio | **FILE-ONLY** (7/7 PASS) | `4fde3a9` | 12:46Z | Awaiting audio.ts/main wiring |
| Agent C | 6 wave-2 art packs + 3 Gemini briefs + notes | **FILE-ONLY** (6/6 PASS) | `fc5f169` | 12:44Z | Awaiting integration (`tools/INTEGRATION-NOTES.md`) |
| Agent D | `docs/design/loot-and-skills.md` + `src/items/*` + `src/skills/*` | **FILE-ONLY** (14/14 PASS) | `f03280d` | 12:51Z | Awaiting `savedb.ts`/hero/UI hook |
| Agent E | `public/data/text/*` (52/60/50/30/40) + `src/data/text/index.ts` | **FILE-ONLY** (5/5 PASS) | `6ce0b3e` | 12:43Z | Consumed by Wiki; commit message had FX title |
| Agent Text-2 | `src/data/text/{barks,item-lore,spell-flavor}.json` + `check-text.mjs` | **FILE-ONLY** (587 keys PASS) | `68c352e` | 12:50Z | Ready for Wiki & localization wiring |
| Agent Atmo-UX | `src/atmosphere.ts` (`render.ts` hooked) + `src/ui-extra/*` | **PARTIAL-INTEGRATED** (8/8 PASS) | `9161447` | 12:44Z | Atmosphere live in `render.ts`; `ui-extra` awaits `shell.ts` |
| Agent F | QA rebuild, seed gallery, `perf-profile-300`, `ci.yml`, `pwa-smoke.spec.ts` | **NEEDS-FIX** (CI path) | `477cd5a` | 12:55Z | `playwright.config.ts` `testDir: 'e2e'` skips `tests/pwa-smoke.spec.ts` |
| Gameplay-AI (Gemini) | `src/sim/ai/*` (E3–E7, E10–E15) + `tests/gameplay-*.test.ts` | **FILE-ONLY / PUSHED** (16/16 + 118/118 PASS) | `f5d5b13` | 13:04Z | Verified 0 `Math.random`/DOM/time; awaits sim/hero hook |
| Wiki Builder (Gemini) | `wiki.html`, `src/wiki/*`, `build-wiki-data.mjs`, minimaps, offline SW, smoke | **IN PROGRESS** | — | 13:00Z | Reassigned after `429` quota on Sonnet |
