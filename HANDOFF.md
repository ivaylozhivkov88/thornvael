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
