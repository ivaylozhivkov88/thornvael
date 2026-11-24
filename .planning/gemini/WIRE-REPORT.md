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
