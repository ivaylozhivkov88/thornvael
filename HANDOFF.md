# THORNVAEL: LIVE CONTINUOUS HANDOFF & CAMPAIGN HARMONIZATION
**Updated At:** 2026-11-22T17:35:00+02:00  
**Status:** In active development (Act I–IV Narrative Harmonization & Full Voice Overhaul)  
**Git Branch:** `main` (game repo) / `codex/release-plan` (planning repo)  
**Live Application URL:** https://ivaylozhivkov88.github.io/thornvael/

---

## 1. Quick Start for Resumption
```bash
# Verify local baseline:
cd "d:\ROM 2 clone\game"
git status
npm run typecheck
npx biome check src/
npm run check:atlases
node tools/check-repo.mjs
npm run build
```

---

## 2. Latest Committed Milestones (Hard Numbers, No Estimates)
- **Commit `39478a9` (Audio & Voices Overhaul)**:
  * Removed typewriter `blip()` sound from `src/missionui.ts` and `src/townui.ts`.
  * Boosted dialogue music ducking from -4 dB to **-14 dB** (`DIALOGUE_SHOP_DUCK_DB = -14`, multiplier ~0.20) in `src/audio.ts`.
  * Boosted active voice gain to **1.6x** (`activeVoiceGain.gain.value = 1.6`).
  * Synthesized **1,138** neural voice clips (`.m4a` AAC-LC) via `tools/generate-all-voices.py` covering all 79 mission map texts, 264 mercenary barks, cutscenes, and town dialogues.
  * 54/54 Vitest audio & UI tests PASSED.
- **Commit `577c4fc` (Wiki Visual & Sprite Harmonization)**:
  * Updated `tools/build-wiki-data.mjs`, `ArticleView.tsx`, `WikiPicture.tsx`, `types.ts`, and `wiki.css`.
  * Harmonized dual visual representation (painted oil portrait + 16-direction animated sprite figure) across all 128 Bestiary creatures, 24 Mercenaries, and 8 Classes.
  * Added 28 new painted townart portraits in `public/townart/mon/*.jpg`.
  * Passed `check:atlases`, `tests/wiki-data.test.ts` (9/9 passed), and `check-repo.mjs` (3,148 files checked).
- **Commit `07e5800` (Planning Repo)**:
  * Created all four canonical narrative chronicles:
    - [ACT-1-COMPLETE-CHRONICLE.md](file:///d:/ROM%202%20clone/ACT-1-COMPLETE-CHRONICLE.md) (*"The Ledger of Salt and Ash"*)
    - [ACT-2-COMPLETE-CHRONICLE.md](file:///d:/ROM%202%20clone/ACT-2-COMPLETE-CHRONICLE.md) (*"The Mirage of the Silted Well"*)
    - [ACT-3-COMPLETE-CHRONICLE.md](file:///d:/ROM%202%20clone/ACT-3-COMPLETE-CHRONICLE.md) (*"The Iron Coast & The Drowned Citadel"*)
    - [ACT-4-COMPLETE-CHRONICLE.md](file:///d:/ROM%202%20clone/ACT-4-COMPLETE-CHRONICLE.md) (*"Gates of the Infernal Sanctuary"*)

---

## 3. Active Background Subagents
- **Subagent `f4da5afb-e01f-4129-9bf8-e1ae7a6b0a9f`**:
  * **Role:** *Act 3 & 4 Overhaul & Audio Lead* (Model: `flash`)
  * **Scope:**
    1. Overhauling all 12 mission map JSON files in Act III (`m24` to `m35`).
    2. Overhauling all 11 mission map JSON files in Act IV (`m36` to `m46`).
    3. Weaving the 7 persistent campaign threads (Morvessa's Signet Ring, Ravenwatch traitor, Deep Quarry miners, Thornwick refugees, Zahra's harmonics, Marshal Veyra's rearguard, Threshold Choice).
    4. Regenerating neural voice clips via `tools/generate-all-voices.py` for updated lines.
    5. Story slides in `src/story.ts` for Act 3, Act 4, and the dual endings (Ending A: The Purging vs Ending B: Dark Sovereign).

---

## 4. Master Harmonization Plan Checklist
Detailed in [.planning/MASTER-CAMPAIGN-ACTS-HARMONIZATION-PLAN.md](file:///d:/ROM%202%20clone/.planning/MASTER-CAMPAIGN-ACTS-HARMONIZATION-PLAN.md):
- [x] Canonical Acts I, II, III, IV written and saved.
- [x] Audio engine silenced typewriter blip, adjusted -14 dB ducking and 1.6x voice volume.
- [x] Wiki dual presentation (portrait + 16-direction animated figure) deployed.
- [ ] Act III missions m24–m35 dialogue and objectives aligned with chronicle.
- [ ] Act IV missions m36–m46 dialogue, Threshold Choice, and dual endings aligned.
- [ ] Cross-act thread verification (items, dialogue flags, characters).
- [ ] Full voice generation for all newly scripted dialogues.
- [ ] Vitest test suite 100% green & production build verified.
- [ ] Git commit and push to `main` for automatic GitHub Pages deployment.

---

## 5. Strict Guardrails & Safety Policy
- **Forbidden Files**: Never touch `src/sim/path.ts`, `tests/movement.test.ts`, `models/`, `tools/render-unit.py`, `src/terrain.ts`.
- **Subagent Model Policy**: All subagents must run on `Model: "flash"`.
- **UI Containment**: Strict `100dvh` containment without unwanted scrollbars on 720p/1080p and mobile landscape.
- **Git Protocol**: Clean commits, rebase before push, no `git add -A`.

## Incoming Tasks
- [x] 2026-11-25 · Minimap showed sleeping (hidden) enemies; zones wake dynamically (tested: tsc clean, act1-world wake test). · high
- [x] 2026-11-25 · Hero/mage/archer sprites face movement direction (verified atlas directions, check:atlases; unpublished). · high
- [ ] 2026-11-25 · Classic ARPG quest loop: town start, quest pickup from NPC `!`, journal shows accepted quests only, return for reward, next act unlock. Act I ready in feat/act1-quests (e505d6e; merged PR #3, 73fdd3b); item rewards uniq-* published (PR #9). Remaining: quests for Acts II–IV. · high
- [ ] 2026-11-25 · Paperdoll: front-view armor layers (.planning/gemini/BRIEF-DOLL-ARMOR-FRONT.md); weapons/gloves/helms/jewelry aligned in gemini/item-images branch. · high
- [ ] 2026-11-24 · Paperdoll bases: unclothed/underlayer bases (warrior/mage m/f) with per-slot anchor alignment. · high
- [ ] 2026-11-24 · In-world sprites reflecting equipped gear variants (armor tint/silhouette, helm, weapon). · high
- [ ] 2026-11-24 · CI 45485808559 (gemini/maps-chunked): Chromium failing on pwa-smoke.spec.ts:199 (status 1 instead of 0, Act 1 E2E); WebKit incomplete. · high

## Open Tasks
- [ ] 2026-11-25 · Seamless stitched regional worlds: simulate active sectors around the squad with zone banners; caves and upper/lower vaults as separate transition levels to keep runtime light, profiled under WebKit. · high
- [ ] 2026-11-25 · Per-act sub-level transitions (2–3 caves/crypts/vaults per Act 1–4) loaded on transition to reduce open-world footprint. · high
- [ ] 2026-11-25 · Act I visual and gameplay polish (quiet town, quest tracker, right-click move, pack spacing, Save & Exit quest persistence, first objective proximity, zone lore banners, elite affixes wired, quest item rewards, town villagers/buildings, doll weapon/material display) recorded in docs/ACT-POLISH-PLAYBOOK.md (PRs #4–#11). Remaining: mobile verification, remaining item icons and armor layers, distinct villager appearances. · high
