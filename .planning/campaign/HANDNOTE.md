# HANDNOTE - Campaign Deep Design (updated 2026-11-19)

Repo: `D:/ROM 2 clone/game` (branch `main`) & `D:/ROM 2 clone` (branch `codex/release-plan`).
Parallel safety rule: NEVER touch `src/characters.ts`, `src/shell.ts`, `src/main.ts`, `src/savedb.ts`, `src/terrain.ts`, `src/render.ts`, `tools/obj-cut.py`, `public/terrain`, `public/objects`, `src/sim/path.ts`, `tests/movement.test.ts`, `models/`, `tools/render-unit.py`.

## Completed Steps Log
- [x] **Step 0**: Read `tools/HANDOFF-ANTIGRAVITY.md`, `.claude/CLAUDE.md`, `PROGRESS.md`, `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `src/mapdoc.ts`, `src/missionui.ts`, `src/map-generator.ts`, `src/campaign.ts`, `src/story.ts`, `src/sim/data.ts`, `src/sim/script.ts`, `src/sim/super-uniques.ts`, `public/data/monsters.json`, `public/data/campaign.json`, `public/data/content/*`, and skills `declarative-mission-author` & `phase9-campaign-pwa`.
- [x] **Step 1 (`00-BIBLE.md`)**: Authored `.planning/campaign/00-BIBLE.md` covering world vision, thermodynamic & probate dark-fantasy tone, historical timeline (-412 YR to Year 0 Solstice), the 4 City Hubs (`town-thornwick`, `town-redmarsh`, `town-oakhaven`, `town-ironcamp`), overarching threat (Seven Anchor Seals & Caldera Schism), resolution across the 4 huge maps (Endings A & B), 8 key characters wired to existing `public/townart/` portraits and `public/sprites/` atlases, complete 52-sprite / 7-biome matrix, and glossary of terms.
- [x] **Step 2.1 (`map-1-border-fords.md`)**: Authored `.planning/campaign/map-1-border-fords.md` (192x192 tiles, Thornwick Market hub + 6 regions, full enemy & Super-Unique placement, Morvessa boss encounter, 12 quests [6 main + 6 side], Disco Elysium cognitive dialogues, lore books, procedural music specification, and carryover items to Map 2).
- [x] **Step 2.2 (`map-2-redmarsh-wastes.md`)**: Authored `.planning/campaign/map-2-redmarsh-wastes.md` (192x192 tiles, Redmarsh Outpost hub + 6 regions, full enemy & Super-Unique placement, Gorrathul boss encounter, 12 quests [6 main + 6 side], Disco Elysium cognitive dialogues, lore books, procedural music specification, and carryover items to Map 3).

## Next Pending Steps
- [ ] **Step 2.3 (`map-3-iron-coast.md`)**: Deep design of Map 3 (The Iron Coast & Drowned Citadel, 192x192 / 6 macro regions, Oakhaven Harbor hub, enemies, 12 quests, dialogues, lore books, procedural music brief, rewards & level curve).
- [ ] **Step 2.4 (`map-4-obsidian-caldera.md`)**: Deep design of Map 4 (The Obsidian Caldera & Cinder Throne, 192x192 / 6 macro regions, Ironcamp Forge-Hold hub, enemies, 10 quests, dialogues, lore books, procedural music brief, rewards & level curve).
- [ ] **Step 3 (`03-GAPS.md` + declarative map data)**: Declarative `MapDoc` v2 prototype for `loadDoc` validation + engine gap analysis sorted by priority & effort.
- [ ] **Checkpoint before Steps 4 & 5**: Show concise summary of `00-BIBLE` and the 4 maps to the user before committing `01-PROGRESSION.md` and `02-PRODUCTION-PLAN.md`.
