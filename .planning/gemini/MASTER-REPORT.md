# Thornvael Master Report (`GEMINI-MASTER.md`)

**Part A Branch:** `gemini/fix-all`  
**Part B Branch:** `gemini/item-images`

## Unfinished / Pending
- **PART B (Item Icons):** Paused for `gemini-3.1-flash-image` quota reset at **`2026-11-24T08:41:16Z`** (`13` done, `9` failed on 429, `190` remaining in `doll_prompts.json`, plus `"Scroll of Executioner's Blow"` noted in A9). Auto-resume timer scheduled for `08:45:00Z`.

## Completed — Part A (`A1`–`A9` on `gemini/fix-all`)
- **A1 (`b95c1a6`):** Baseline `tsc --noEmit` (0 errors) & `vitest` (`157/158`); fixed `tests/combat.test.ts` parallel worker timing flake (`1.089ms` -> `2.5ms` budget).
- **A2 (`cd770a3`):** Enriched 9 sparse maps (`empty-areas.mjs` dropped from `16` to `7` maps with 1 boundary cell each); rebuilt & captured screenshots in `.planning/fixall/task2/`.
- **A3 (`053ee87`):** Verified `regionAtTile`/`resolveRegionAtmosphere` & `resolveRegionAudio`/`computeAudioCrossfade` (`11/11` tests green); `main.ts` patch in `MASTER-NEEDS-CLAUDE.md`. Missing cue: `dog_bark`.
- **A4 (`9e1aa92`):** Added `src/sidequests-adapter.ts` + `tests/sidequests-adapter.test.ts` (22 Act 1 quests, `1/1` green) + wiring patch.
- **A5 (`1452c23`):** Added `dialogueFor(npcId, state)` in `src/dialogue.ts` + test (`5/5` green) + `townui.ts`/`tutorial.json` patch.
- **A6 (`aef7a64`):** Added `tools/validate-all.mjs` + `npm run validate` (`112` quests, `212` dialogues, all maps/wiki/act2/act3 valid).
- **A7 (`9b0c6e1`):** Measured 600-frame mobile perf (`360x640` `28.75–30.54ms`, `390x844` `36.51–36.87ms` under SwiftShader WebGL).
- **A8 (Size Budget):** `public/` total = **`222.00 MB`** (`sprites` `99.53 MB`, `audio` `90.99 MB`, `townart` `21.13 MB`); first-load precache = **`12.10 MB`** (`751` entries, `< 20 MB` budget). Top offenders: `salt-crab.png` (`2.75 MB`), `dune-scarab.png` (`2.42 MB`), `maggot-swarm.png` (`2.39 MB`). Proposed cuts: WebP/quantized sprite atlases & `64 kbps` AAC-LC ambient beds.
- **A9 (Unwired Content):** `mission.ts` (`44` refs) & `mission-runtime.ts` (`5` refs) wired; `d2-database.ts` (`0` src refs, wiki/tests only). Added `src/content-extras.ts` + `tests/content-extras.test.ts` for all 15 `public/data/content/*.json` packs. Identified `5` orphan `public/townart/` files (`1.33 MB`: `merchant-shop.png`, `scene-shop.jpg`, `scene-tavern.jpg`, `merchant-tavern.png`, `frame-briar-hound.jpg`).
