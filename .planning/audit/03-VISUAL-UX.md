# 03-VISUAL-UX — Visual & UX Audit (2026-11-24)

## 1. Style Consistency & Assets
- **Towns Comparison:** Thornwick (`dusk/drizzle`, forest/river), Redmarsh (`noon/clear`, desert salt-flats/tents), Oakhaven (`night/fog`, coastal piers/water/ironwood), Highcrest (`dusk/ash`, granite caldera walls) now each have distinct layouts, biomes, lighting, and weather (`src/missions/*`, verified in `tests/*-town.test.ts`).
- **[S2] Incomplete Paperdoll / Item Icons (246/261 remaining on `gemini/item-images`):** Only 15/261 doll-layer item icons are ingested so far; remaining weapons, shields, offhands, gloves, and boots need generation via `doll_prompts.json` + `tools/ingest-item-image.mjs` (see `.planning/audit/briefs/item-icons-brief.md`).
- **[S2] Missing Town/Ambient Audio Cues:** `dog_bark` (Thornwick ambience) and `amb_town_ironcamp` (Highcrest Citadel falls back to `amb_town_oakhaven`) are missing (`WIRE-REPORT.md:7`, `TOWNS-REPORT.md:23`). **Fix (small):** Synthesize both `.m4a` clips via `tools/` audio pipeline + register in `assets.json` and `audio-manifest.json`.
- **[S3] `.tv-loading-bg-img` (`src/loadingscreen.ts`):** Leaves `src=null` `<img>` in DOM during gameplay. **Fix (small):** Clear or detach element on `hide()`.

## 2. HUD, Touch & Onboarding UX
- **Viewport Containment:** `overflowX: false` and `overflowY: false` verified at `1280×720`, `844×390`, and `390×844` (`02-PLAYTHROUGH.md`).
- **[S2] Tutorial Coverage (`src/main.ts` vs `src/data/tutorial.json`):** Only 3 of 10 tutorial triggers (`selection_count`, `enemy_killed`, `loot_collected`) are wired; `order_issued`, `group_assigned`, `spell_cast`, `pause_toggled`, `unit_healed`, `town_entered`, and `tutorial_complete` are not wired (`WIRE-REPORT.md:31`). **Fix (small):** Hook remaining 7 events in `src/main.ts` so new players get complete first-10-minute onboarding.
- **[S2] Reputation Display in Town UI (`src/townui.ts:1129`):** `dialogueFor` receives `reputation` and `npc-dialogues.json` nodes, and `this.bark` displays `tier: idleBark`, but there is no persistent reputation badge in the town header/dialogue modal. **Fix (small):** Render reputation tier pill in `loreModal` header.

## 3. Top Visual & UX Improvements (Prioritized)
1. **[S2, large]** Complete remaining 246/261 item doll icons (`gemini/item-images`) so every equipped piece renders cleanly.
2. **[S2, small]** Wire remaining 7 triggers from `src/data/tutorial.json` in `src/main.ts`.
3. **[S2, small]** Generate `amb_town_ironcamp.m4a` and `dog_bark.m4a` so Act 4 citadel and Thornwick sound distinct.
4. **[S2, small]** Add visible reputation tier badge in `src/townui.ts` dialogue header.
5. **[S3, small]** Remove/hide `.tv-loading-bg-img` when loading screen closes (`src/loadingscreen.ts`).
6. **[S2, medium]** Add dedicated `town-redmarsh` / `town-oakhaven` / `town-ironcamp` Act 2–4 town portraits/loading screens if reusing Thornwick's.
7. **[S3, medium]** Add party banter toast/bubble consumer for `merc-party-banter.json` (`src/main.ts`).
8. **[S3, medium]** Surface `salvage-lines.json` via a blacksmith "Salvage" button in `src/townui.ts`.
