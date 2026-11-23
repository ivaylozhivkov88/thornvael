# Act 1 Content & Consistency Report (`gemini/act1-content`)

**Date:** 2026-11-23  
**Branch:** `gemini/act1-content` (branched from `main`; never pushed to `main`)  

## Unfinished / Deferred Notes (Top Summary)
- **Runtime `steps[]` & Reputation UI Wiring:** All 22 Act 1 quests now carry full `steps[]` chains in data (`side-quests*.json`) and all 8 Act 1 town/tavern/shop NPCs carry reputation-tiered greetings, topics, quest-aware lines, and idle barks in `npc-dialogues.json` / `town-barks.json`. Runtime UI execution in `src/sidequests.ts` and `src/townui.ts` was intentionally left untouched (data-only pass per Goal 2).
- **Pre-existing Untracked Art/Queue Files:** Untracked files in `public/itemicons/`, `.planning/gemini/doll-queue-state.json`, and working-tree files from other parallel processes were left untouched per Hard Rules.

---

## Summary of Changes by Goal

1. **Goal 1 — Act 1 Quest Steps (`f6da776`)**:
   - Added complete 3–6 step `steps[]` chains (`talk`, `fetch`, `kill`, `escort`, `choice`) with `trigger` conditions, per-step `journal` text, and `reward` payloads to all 22 Act 1 quests across `public/data/content/side-quests.json`, `side-quests-2.json`, `side-quests-3.json`, and `side-quests-4.json`.
   - Added `field-surveyor-hal` and `field-foreman-durn` to `public/data/content/field-npcs.json` so all Act 1 quest givers resolve to reachable NPCs.
   - Added `tests/act1-quests.test.ts` (4 tests) verifying step counts, all 5 step kinds, DAG completability (no dead steps, no cycles, terminal rewards), and NPC reachability.

2. **Goal 2 — Act 1 NPC Dialogue Pass (`00db99f`)**:
   - Added `npc-marlow-reeve`, `npc-edda-miller`, `npc-dunstan-innkeeper`, and `npc-vaelen-arcanist` to `public/data/content/npcs.json` alongside existing Thornwick NPCs (`npc-hobb-smith`, `npc-marta-alchemist`, `npc-garrick-captain`, `npc-fenwick-ferryman`).
   - Added reputation-based greetings (`greeting_low`, `greeting_neutral`, `greeting_high`), 2–4 topic choices, quest-aware lines (`quest_before`, `quest_during`, `quest_after`), and 3 idle barks per NPC in `public/data/content/npc-dialogues.json` and `public/data/content/town-barks.json`.
   - Added `tests/act1-dialogues.test.ts` (4 tests) verifying coverage, topic counts, link integrity, and idle barks.

3. **Goal 3 — Lore Consistency Audit & Fixes (`498f567`)**:
   - Cross-checked quests, dialogues, NPCs, bosses, wiki data, and `.planning/gemini/doll_prompts.json` (read-only; 135/135 weapon/helm/armor keys matched by display title).
   - Fixed 4 name collisions/locks: `Collector Vance` -> `Collector Harlon`, `Ferryman Hobb` -> `Ferryman Garren`, `Peddler Bram` -> `Peddler Merrin`, and `Vaelor, the Shattered Warden` -> `Valgor, the Shattered Warden`.
   - Documented all findings in `.planning/gemini/LORE-CONSISTENCY.md` and rebuilt wiki data (`0` placeholders).

4. **Goal 4 — Act 1 Wiki & Codex Entries (`e9d4634`)**:
   - Updated `tools/build-wiki-data.mjs` to emit `lore` entries for all town NPCs in `npcs.json` (using existing portraits) and cross-link quests, givers, towns, landmarks, and unique rewards (`2,250` entries, `0` placeholders).
   - Added `tests/act1-wiki.test.ts` (2 tests) verifying Act 1 NPC, location, monster, and unique coverage plus cross-link validity.

5. **Goal 5 — Act 1 Balance Table & Final Report**:
   - Compiled `.planning/gemini/ACT1-BALANCE.md` covering expected hero levels (`1–12` across `town` and `m01`–`m11`), base monster HP/damage ranges, all 22 quest gold/XP rewards, shop price bands (`30 * tier^2`), and flagged reward outliers.

---

## Verification Results
- `npx tsc --noEmit`: **0 errors**
- `npx vitest run --maxWorkers=2`: executed after Goal 5 edits (all new suites `act1-quests.test.ts`, `act1-dialogues.test.ts`, `act1-wiki.test.ts`, `wiki-data.test.ts` and full regression suite).
