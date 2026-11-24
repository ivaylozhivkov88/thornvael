# WIRE-REPORT (gemini/fix-all)

## Unfinished Steps
- None (W1–W7 complete)

## Completed Steps
- **W1 (Regions):** Wired `resolveRegionAudio` and `computeAudioCrossfade` in `src/main.ts` alongside `regionAtTile` + `setRegionMusicIndex`; `src/render.ts` passes `atmoRegion` as 10th arg to `updateAtmosphere`. Missing audio cue noted: `dog_bark` (Thornwick town ambience).
- **W2 (Quests):** Wired `SteppedQuestAdapter` in `src/main.ts` (enemy `family` kills + `side-quests.json` load + `steppedQuests` in `saveUi.capture`) and `src/townui.ts` (`setSteppedQuests`, `onTalkNpc`). Bumped `SAVE_VERSION` to `6` in `src/save.ts` with `migrateSave` support. Added `tests/act1-quests-integration.test.ts`.
- **W3 (Dialogues & Reputation):** Wired `dialogueFor(context, { reputation: 0, nodes: [], barks: [] })` in `src/townui.ts` (`openLoreDialogue`) displaying tier + idle bark.
- **W4 (Tutorial):** Loaded `src/data/tutorial.json` in `src/main.ts`, wired `triggerTutorial('selection_count')` with `localStorage` seen tracking and `thornvael:tutorialDisabled` settings flag.
- **W5 (Extra Content):** Preloaded `vendor-stock`, `npc-reactions`, `merc-hire-dialogues`, and `ui-strings` via `loadExtraContent` in `src/main.ts`. Unhooked packs:
  | File | Where it would wire | Why not wired |
  | --- | --- | --- |
  | `elite-affixes.json` | `src/sim/combat.ts` elite spawn | Requires sim-level affix modifier mechanics |
  | `salvage-lines.json` | `src/townui.ts` blacksmith salvage | No salvage action UI exists yet |
  | `consumable-effects.json` | `src/sim/hero.ts` item use | Consumable pipeline is hardcoded |
  | `class-skill-data.json` | `src/heroui.ts` skill tree | Skill tree uses `src/sim/hero.ts` tables |
  | `hero-visuals.json` | `src/render.ts` hero sprite | Hero rendering uses atlas metadata |
  | `merc-abilities.json` | `src/sim/combat.ts` merc AI | Merc AI uses `DEFS` directly |
  | `merc-party-banter.json` | `src/main.ts` party banter | No party banter timer in `main.ts` |
  | `ambient-objects.json` | `src/render.ts` prop layer | Props come from `MapDoc.objects` |
  | `cutscene-scripts.json` | `src/main.ts` mission intro | No cutscene player in `main.ts` |
  | `challenge-rifts.json` | `src/missionui.ts` endgame | Challenge rifts mode not implemented |
  | `rare-name-parts.json` | `src/sim/town.ts` item gen | Rare names use `src/sim/town.ts` tables |
- **W6 (Playwright):** Verified `http://localhost:5199/thornvael/` at `1280x720` and `390x844`; `CONSOLE_ERRORS: []`; screenshots saved in `.planning/master/wire/desktop-1280x720.png` and `.planning/master/wire/mobile-390x844.png`.
- **W7 (Validation):** `npm run validate` -> `validate-all: OK (112 quests, 212 dialogues, all maps/wiki/act2/act3 valid)`; `npx tsc --noEmit` -> 0 errors; `npx vitest run --maxWorkers=2` -> 160/161 passed on full run (fixed `tests/affix-instance.test.ts` `SAVE_VERSION >= 5` and re-verified).
- **H1 (`df67e4d`):** Wired `steppedQuests.onCollectItem` on loot pickup in `src/main.ts` + `tests/h1-collect-item.test.ts`.
- **H2 (`0eba0eb`):** Wired `steppedQuests.onDialogueChoice(context, cIdx)` on choice click in `src/townui.ts` + `tests/h2-dialogue-choice.test.ts`.
- **H3 (`5b28c22`):** Bumped `SAVE_VERSION = 7` with `reputation` + `migrateSave` in `src/save.ts`, loaded `data/content/npc-dialogues.json` in `src/main.ts`, passed real `nodes` and `reputation` to `dialogueFor` in `src/townui.ts` + `tests/h3-save-reputation.test.ts`.
- **H4:** All 11 unhooked content packs (`ambient-objects`, `challenge-rifts`, `class-skill-data`, `consumable-effects`, `cutscene-scripts`, `elite-affixes`, `hero-visuals`, `merc-abilities`, `merc-party-banter`, `rare-name-parts`, `salvage-lines`) left unhooked ("няма ясно място, защото …" as documented in W5 table above).
- **H5 (`de1c519`):** Wired `enemy_killed` and `loot_collected` tutorial triggers in `src/main.ts` (remaining triggers `order_issued`, `group_assigned`, `spell_cast`, `pause_toggled`, `unit_healed`, `town_entered`, `tutorial_complete` left unwired where no matching single-hook event exists).
- **H6 (`2715bcc`):** Added `E11` Act 1 quest E2E scenario in `tools/e2e/run-e2e.mjs` (real Chrome, `headless: false`, `1280x720`) with screenshots in `.planning/master/wire/E11-quest-start.png` and `.planning/master/wire/E11-quest-end.png` (`ok: true`, `errors: []`).
