# HANDNOTE - Campaign Deep Design (updated 2026-11-19)

Repo: `D:/ROM 2 clone/game` (branch `main`) & `D:/ROM 2 clone` (branch `codex/release-plan`).
Parallel safety rule: NEVER touch `src/characters.ts`, `src/shell.ts`, `src/main.ts`, `src/savedb.ts`, `src/terrain.ts`, `src/render.ts`, `tools/obj-cut.py`, `public/terrain`, `public/objects`, `src/sim/path.ts`, `tests/movement.test.ts`, `models/`, `tools/render-unit.py`.

## Completed Steps Log
- [x] **Step 0**: Read `tools/HANDOFF-ANTIGRAVITY.md`, `.claude/CLAUDE.md`, `PROGRESS.md`, `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `src/mapdoc.ts`, `src/missionui.ts`, `src/map-generator.ts`, `src/campaign.ts`, `src/story.ts`, `src/sim/data.ts`, `src/sim/script.ts`, `src/sim/super-uniques.ts`, `public/data/monsters.json`, `public/data/campaign.json`, `public/data/content/*`, and skills `declarative-mission-author` & `phase9-campaign-pwa`.
- [x] **Step 1 (`00-BIBLE.md`)**: Authored `.planning/campaign/00-BIBLE.md` covering world vision, thermodynamic & probate dark-fantasy tone, historical timeline (-412 YR to Year 0 Solstice), the 4 City Hubs (`town-thornwick`, `town-redmarsh`, `town-oakhaven`, `town-ironcamp`), overarching threat (Seven Anchor Seals & Caldera Schism), resolution across the 4 huge maps (Endings A & B), 8 key characters wired to existing `public/townart/` portraits and `public/sprites/` atlases, complete 52-sprite / 7-biome matrix, and glossary of terms.
- [x] **Step 2.1 (`map-1-border-fords.md`)**: Authored `.planning/campaign/map-1-border-fords.md` (192x192 tiles, Thornwick Market hub + 6 regions, full enemy & Super-Unique placement, Morvessa boss encounter, 12 quests [6 main + 6 side], Disco Elysium cognitive dialogues, lore books, procedural music specification, and carryover items to Map 2).
- [x] **Step 2.2 (`map-2-redmarsh-wastes.md`)**: Authored `.planning/campaign/map-2-redmarsh-wastes.md` (192x192 tiles, Redmarsh Outpost hub + 6 regions, full enemy & Super-Unique placement, Gorrathul boss encounter, 12 quests [6 main + 6 side], Disco Elysium cognitive dialogues, lore books, procedural music specification, and carryover items to Map 3).
- [x] **Step 2.3 (`map-3-iron-coast.md`)**: Authored `.planning/campaign/map-3-iron-coast.md` (192x192 tiles, Oakhaven Harbor hub + 6 regions, full enemy & Super-Unique placement, Vesperion boss encounter, 12 quests [6 main + 6 side], Disco Elysium cognitive dialogues, lore books, procedural music specification, and carryover items to Map 4).
- [x] **Step 2.4 (`map-4-obsidian-caldera.md`)**: Authored `.planning/campaign/map-4-obsidian-caldera.md` (192x192 tiles, Ironcamp Forge-Hold hub + 6 regions, full enemy & Super-Unique placement, Ashkarath boss encounter, 12 quests [6 main + 6 side], Disco Elysium cognitive dialogues, lore books, procedural music specification, and dual endings A/B).
- [x] **Step 3 (`03-GAPS.md` + declarative map data)**: Authored `.planning/campaign/03-GAPS.md` (6 prioritized engine gaps GAP-01..GAP-06 with exact LOC & file locations), `.planning/campaign/campaign-4maps.json` (4-hub + 4-macro-map `parseCampaign` schema), and `.planning/campaign/map1-border-fords.macro.map.json` (192x192 declarative `MapDoc` v2 prototype passing `loadDoc` & `validate` with 0 errors).
- [x] **Step 4 (`01-PROGRESSION.md`)**: Authored `.planning/campaign/01-PROGRESSION.md` (Lv 1–50 XP & item curve across the 4 huge maps, Warrior/Mage + 1 Mercenary balance, Skirmish carryover contract [items/XP saved, campaign progress untouched], and Character Roster v2 persistence schema with `furthestMapId`, `furthestRegion`, `completedQuests`, `bossesSlain`, `keyItems`).
- [x] **Step 5 (`02-PRODUCTION-PLAN.md`)**: Authored `.planning/campaign/02-PRODUCTION-PLAN.md` (16 atomic GSD tasks across Phases 15.1–15.5 with exact target files, dependency DAG, effort estimates, and verification gates).
- [x] **Task 1 (`P15.1-01..04` — Resolve Engine Gaps GAP-01..06)**: Extended `BOSS_MOD_IDS` with 5 Super-Unique modifiers, added `getSuperUniqueById` / `superUniqueAsFamilyDef` lookup in `src/mapdoc.ts` and `src/sim/data.ts`, expanded `ScriptState.sub` to 16 slots and added `giveXp` action in `src/sim/script.ts`, added declarative `obj.N.pos` / `obj.N.kind` and `msg.N.var` choice variable recording in `src/missionui.ts`, extended `Region` with `biome`/`zone`/`music`/`ambience`, raised `validate()` unit limit to 512 total (`<= 300` active non-dormant), and verified with `tests/macro-engine-gaps.test.ts`.

## Status
**ALL 5 CAMPAIGN DESIGN STEPS COMPLETE (100%)**:
- `00-BIBLE.md`
- `map-1-border-fords.md`
- `map-2-redmarsh-wastes.md`
- `map-3-iron-coast.md`
- `map-4-obsidian-caldera.md`
- `03-GAPS.md` + `campaign-4maps.json` + `map1-border-fords.macro.map.json`
- `01-PROGRESSION.md`
- `02-PRODUCTION-PLAN.md`
