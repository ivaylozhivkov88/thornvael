# Thornvael Big Pass Report (`gemini/big-pass`)

**Date:** 2026-11-23  
**Branch:** `gemini/big-pass` (never pushed to `main`)  

## Unfinished / Deferred
- **None of Tasks 1–10, A, or B remain unfinished.**
- **Deferred runtime hookups (outside current scope):**
  - Act 1 reputation-tier UI wiring in `src/townui.ts` (pure helpers ready in `src/dialogue.ts`; `src/townui.ts` untouched per forbidden-file rule).
  - Act 2 design & data (`src/data/act2/**`, `.planning/act2/**`) are design/data-only per Task 10 (no engine code modified).

---

## Completed Tasks (One Commit per Task)
1. **Task 1 — Act 1 Quest Steps (`f6da776`):** Added 3–6 step `steps[]` chains (`talk`, `fetch`, `kill`, `escort`, `choice`) to all 22 Act 1 quests + `field-surveyor-hal` / `field-foreman-durn` + `tests/act1-quests.test.ts` (4/4 green).
2. **Task 2 — Act 1 NPC Dialogues (`00db99f`):** Added reputation greetings (`low`/`neutral`/`high`), 2–4 topics, quest-aware (`before`/`during`/`after`) nodes, and 3 idle barks per Act 1 NPC (`8` NPCs) + `tests/act1-dialogues.test.ts` (4/4 green).
3. **Task 3 — Lore Consistency (`498f567`):** Audited quests, dialogues, wiki, and `.planning/gemini/doll_prompts.json` (read-only; `135/135` items matched). Fixed `Collector Vance` → `Collector Harlon`, `Ferryman Hobb` → `Ferryman Garren`, `Peddler Bram` → `Peddler Merrin`, `Vaelor` → `Valgor`. Wrote `.planning/gemini/LORE-CONSISTENCY.md`.
4. **Task 4 — Wiki & Codex Coverage (`e9d4634`):** Updated `tools/build-wiki-data.mjs` to emit town NPC lore entries and cross-links (`2,250` entries, `0` placeholders) + `tests/act1-wiki.test.ts` (2/2 green).
5. **Task 5 — Act 1 Balance Table (`84517d5`):** Wrote `.planning/gemini/ACT1-BALANCE.md` (zone levels, monster HP/dmg, quest gold/XP, shop price bands, flagged outliers) and `.planning/gemini/ACT1-REPORT.md`.
6. **Task 6 — Spells & Skills 5-Tier Audit (`1dc14b0`):** Filled missing Archer (`Barbed Shaft` T2, `Gale Pin` T4) and Necromancer (`Quicklime Cloud` T3, `Bone Splinter` T4, `Rite of Ash` T5) spells (`55` spells total); expanded `src/skills/trees.ts` & `src/skills/types.ts` to 4 classes × 5 tiers; added `tests/spell-skill-audit.test.ts` (3/3) and `.planning/gemini/SPELL-BALANCE.md`.
7. **Task 7 — Playwright E2E Suite (`0312f71`):** Added `e2e/big-pass-journey.spec.ts` (5/5 green across desktop + `390x844` mobile) and `data-testid` hooks (`src/shell.ts`: `btn-single-player`, `btn-wiki`, `btn-codex`, `btn-map-codex`; `src/heroui.ts`: `hero-sheet`; `src/townui.ts`: `town-panel`).
8. **Task 8 — 6 Original Skirmish Maps (`872c205`):** Generated 6 `MapDoc` v2 maps (2–4 players) under `public/maps/skirmish/**` + `tests/skirmish-pack6.test.ts` (7/7 green) validating `validate()`, `loadDoc()`, and BFS start-to-start reachability.
9. **Task 9 — Mobile UI Audit & CSS Fixes (`7c4caec`):** Audited `360x640` & `390x844` in `.planning/gemini/MOBILE-AUDIT.md`; fixed `44px` touch targets, `touch-action: none` on inventory/paperdoll drag, and Codex touch scrolling across `src/gothic-hud.css`, `src/townstyle.css`, and `src/style.css`.
10. **Task 10 — Act 2 Design, Data & Art Prompts (`f2bdca1`):** Authored `.planning/act2/ACT2-DESIGN.md`, `src/data/act2/zones.json` (7 zones, Lv 12–24), `towns.json` (4 towns), `bosses.json` (3 bosses with multi-phase mechanics), `quests.json` (26 quests with `steps[]`), `uniques.json` (40 items), and `.planning/act2/act2_item_prompts.json` (40 `{key, prompt}` entries in `doll_prompts.json` painterly style).
11. **Task A — Stepped Side-Quest Runtime (`a9420d2`):** Implemented headless `steps[]` state machine in `src/sidequests.ts` (`createQuestRuntimeState`, `advanceQuestStep`, `getQuestJournalText`, `serializeQuestSave`, `migrateQuestSave` v1→v2, `deserializeQuestSave`) with one-time reward claiming; added `tests/sidequests-runtime.test.ts` (4/4 green) simulating all 22 Act 1 quests start-to-finish, mid-quest save/load, and v1→v2 migration.
12. **Task B — Pure Dialogue Runtime Helpers (`900ddfe`):** Implemented pure functions in `src/dialogue.ts` (`reputationTier`, `pickGreetingNode`, `pickQuestNode`, `mulberry32`, `pickIdleBark`) with zero UI/DOM wiring; added `tests/dialogue-runtime.test.ts` (4/4 green) covering all 8 Act 1 NPCs.
13. **Task H — Act 3 Design, Data & Art Prompts (`fb9b874`):** Authored `.planning/act3/ACT3-DESIGN.md` (resolving the main plot through Burning Harbor, Gauntlet of Iron, and Ember Threshold / Arch-Mage Malrik), `src/data/act3/{zones,towns,bosses,quests,uniques}.json` (7 zones Lv 24–36, 4 towns, 3 bosses, 26 quests with `steps[]`, 40 uniques), and `.planning/act3/act3_item_prompts.json` (40 painterly paperdoll prompts).
14. **Task I — Bestiary Lore & Wiki Rebuild (`980948d`):** Expanded all 60 `public/data/content/bestiary-extra.json` entries to 3-sentence original lore with weakness/resistance notes and added `resistance` + tactical notes to all 45 `public/data/content/monster-codex.json` entries; rebuilt `src/wiki/data/` via `node tools/build-wiki-data.mjs` (`2,255` entries, `0` placeholders).
15. **Task J — Tavern Rumors & Loading Tips (`7415ebf`):** Authored 60 Act 1 & Act 2 tavern rumors (with true & false leads) in `public/data/content/tavern-rumors.json` and 40 short loading tips in `public/data/content/loading-tips.json`, plus `tests/rumors-tips.test.ts` (2/2 green).
16. **Task K — 60 Achievements & Pure Evaluator:** Authored 60 achievements (including 10 hidden) in `src/data/achievements.json`, pure evaluator `src/achievements.ts` (`matchesCondition`, `evaluateAchievements`, `formatAchievementForDisplay`), and `tests/achievements.test.ts` (3/3 green).
