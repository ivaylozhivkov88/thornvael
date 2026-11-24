# 01-STATE — System Map & Completion Audit (2026-11-24)

**Branch:** `gemini/audit` (cut from `main` at `7c1702c`)  
**Baseline Checks (Executed):**
- `npm run typecheck`: PASS (`tsc --noEmit && tsc --noEmit -p tsconfig.sw.json`, 0 errors)
- `npm run validate`: PASS (`validate-all: OK (112 quests, 219 dialogues, all maps/wiki/act2/act3 valid)`)
- `npm test -- --maxWorkers=1`: PASS (`167 passed (167)` test files, `1194 passed | 1 skipped (1195)` tests in 148.01s)

## 1. Area-by-Area Status Table

| Area | Status | % Done | What is Wired in Runtime (`src/`) | What is Data/Files Only or Missing |
| --- | --- | --- | --- | --- |
| **Campaign Act 1–4** | Partial | 80% | `public/data/campaign.json` has 50 nodes (12 Act 1, 13 Act 2, 13 Act 3, 12 Act 4). Act 1 (`act1-world`) connected world + Acts 2–4 mission loaders wired in `src/mission-runtime.ts`. | `HANDOFF.md:61-62` notes Act 3/4 narrative alignment & cross-act thread verification; `cutscene-scripts.json` unwired (`src/main.ts`). |
| **Towns (4 Hubs)** | Done | 90% | `town-thornwick` (`thornwick-market.map.json`), `town-redmarsh` (`redmarsh-outpost.map.json`), `town-oakhaven` (`oakhaven-bastion.map.json`), `town-ironcamp` (`highcrest-citadel.map.json`) all have dedicated maps, 9+ buildings, NPCs, `src/townui.ts` shop/tavern/school. | `amb_town_ironcamp` audio missing (Highcrest uses `amb_town_oakhaven`); secondary Act 2/3 towns in `src/data/act{2,3}/towns.json` are data-only. |
| **Combat & Sim** | Done | 95% | Deterministic fixed-timestep sim (`src/sim/combat.ts`, `src/sim/mechanics.ts`), 300-unit perf verified `<1ms/step` (`tests/spells.test.ts`). | `elite-affixes.json` & `merc-abilities.json` not wired into `src/sim/combat.ts`. |
| **Hero & Classes** | Done | 90% | 8 hero specs (4 classes × M/F) in `src/herocreation.ts`, skill trees & leveling in `src/sim/hero.ts`, `src/heroui.ts`. | `class-skill-data.json` & `hero-visuals.json` are data-only (`WIRE-REPORT.md:17-18`). |
| **Inventory / Loot / Shops** | Done | 90% | Affix instances, sets, uniques, runewords, cube, paperdoll, shop buy/sell/gamble/identify (`src/townui.ts`, `src/heroui.ts`). | `salvage-lines.json`, `consumable-effects.json`, `rare-name-parts.json` unwired (`WIRE-REPORT.md:15-24`); 246/261 item doll icons still pending on `gemini/item-images`. |
| **Spells** | Done | 90% | Spellbook (`src/spellbookui.ts`), autocast (`src/sim/tactics.ts`), hotkey bar, mana/cooldowns. | `spells.test.ts` passes (24/24). |
| **Mercenaries** | Partial | 75% | Hiring in tavern (`src/townui.ts`), squad bar (`src/ui/squad-bar.ts`), AI stances. | `merc-abilities.json` & `merc-party-banter.json` unwired (`WIRE-REPORT.md:19-20`). |
| **AI & Skirmish** | Done | 85% | Skirmish director (`tests/skirmish-director.test.ts`), tactical AI (`tests/monster-tactical-ai.test.ts`), 13 skirmish map tests passing. | `challenge-rifts.json` unwired (`WIRE-REPORT.md:23`). |
| **Multiplayer Maps** | Partial | 70% | Recreated skirmish maps (`skirmish-pack6.test.ts`, `skirmish-maps.test.ts`) playable vs AI. | No live network multiplayer (static GitHub Pages hosting). |
| **Map Editor** | Done | 85% | Separate Vite entry `editor.html`, `src/editor.ts` (`npm run build` compiles cleanly). | Not covered by Playwright E2E yet. |
| **Audio & Voices** | Done | 85% | Web Audio wrapper (`src/audio.ts`), region crossfade (`src/region-audio.ts`), 1,138 `.m4a` clips, -14 dB ducking. | Missing cues: `dog_bark`, `amb_town_ironcamp`. |
| **Save / Offline PWA** | Done | 90% | `SAVE_VERSION = 7` (`src/save.ts`) with migrations, IndexedDB (`src/savedb.ts`), export/import, Workbox `injectManifest` (`src/sw.ts`). | `tests/offline.test.ts` passes (7/7); precache size optimization is on `gemini/cleanup` (not yet merged to `main`). |
| **UI / HUD** | Done | 85% | Preact/DOM overlays (`src/main.ts`, `src/townui.ts`, `src/heroui.ts`), minimap, automap, nameplate, floating tooltips. | Needs visual/mobile audit in Phase 2–3. |
| **Mobile Controls** | Partial | 80% | Pointer Events gesture recognizer (`src/input.ts`), touch tests (`tests/touch.test.ts`, `tests/mobile-touch-paperdoll.test.ts`). | Real-device iOS/Android check pending; Playwright WebKit not run here. |
| **Tutorial & Quests** | Partial | 80% | `SteppedQuestAdapter` wired to kill/collect/talk/choice (`src/main.ts`, `src/townui.ts`); `tutorial.json` wired for `selection_count`, `enemy_killed`, `loot_collected`. | 7 remaining triggers in `tutorial.json` (`order_issued`, `group_assigned`, `spell_cast`, `pause_toggled`, `unit_healed`, `town_entered`, `tutorial_complete`) unwired (`WIRE-REPORT.md:31`). |

## 2. Playable vs Entry-Only Summary
- **Campaign Nodes:** 50 total in `public/data/campaign.json` (46 missions + 4 town hubs). All 46 mission maps and 4 town hub maps exist in `src/missions/` and pass `validate-all.mjs` + `tests/campaign-act{1,2,3,4}.test.ts` (54 tests).
- **Act 1 Side Quests:** 22 Act 1 quests validated in `tests/act1-quests.test.ts`; 6 stepped quests in `public/data/content/side-quests.json` tested end-to-end through `SteppedQuestAdapter` (`tests/act1-quests-integration.test.ts`).
- **Unwired Data Packs:** 11 JSON packs in `public/data/content/` remain data-only (`WIRE-REPORT.md:11-24`).
