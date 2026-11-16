# THORNVAEL: CLAUDE CODE LIVE CONTINUOUS HANDOFF
**Updated At:** 2026-11-16T08:15:00+02:00  
**Status:** In active development (Masterpiece Drive)  
**Git Branch:** `main`  
**Live Application URL:** https://ivaylozhivkov88.github.io/thornvael/

---

## 1. Quick Start for Resumption
```bash
# Verify local test baseline:
git status
npm run typecheck
npm test -- --maxWorkers=1
npm run check:repo
npm run build
```

---

## 2. Proven Verification Results (Hard Numbers, No Estimates)
Run at 2026-11-16:
- `npm run typecheck`: **PASSED (0 errors)**
- `npm test -- --maxWorkers=1`: **PASSED (77 test files, 632 passed, 1 skipped, 0 failed)** [duration: 85.89s]
- `npm run check:repo`: **PASSED (478 files)**
- `npm run build`: **PASSED (dist built in 1.05s, 116 precache entries in sw.js)**

---

## 3. Git Status & Repository Sync
- **Repository `game/`**:
  * Branch: `main`
  * Latest commit: `b14d044` (`feat(audio): 4-bus WebAudio architecture, acoustic level balance & biome soundscapes`)
  * Remote sync: Tracking `origin/main`
- **Carson Guard Constraint**:
  * `src/sim/path.ts` and `tests/movement.test.ts` **MUST NOT BE TOUCHED** unless explicitly requested by the user. Neither file has been modified since commit `d3421a2`.

---

## 4. Work Accomplished by Claude Code (Milestone Summary)
1. **Combat Feel**:
   - `95979bd`: Float texts migrated to pooled BitmapText (significant performance optimization).
   - `a7ab8d1`: Render-only hit recoil (struck units shove away from attacker and spring back over 170ms; larger on crits; sim-hash safe).
   - `d448559`: Death topple fallback (units without a 'die' clip topple sideways and darken instead of vanishing behind a bone mark).
2. **Deterministic Save & Monster AI**:
   - `607d861`: Persisted monster AI timers (resurrection cooldowns, raised minion counters, boss attack windups) in `SaveState.aix`.
3. **Legal Scrub & Neutrality**:
   - `6727c99`: Scrubbed third-party trademarks/names, renamed CSS classes to `relic-loot-*`, `check-repo.mjs` enforces name bans.
4. **Town Holdings / Campaign Metagame**:
   - `2ac3178`: Town building rules (`townbuild.ts`: Barracks, Forge, Shrine).
   - `f104069`: Shrine heals returning mercenaries (+20%/level) between nodes.
   - `4e01c11`: Forge lifts town shop stock by a tier.
   - `f69d00d`: Barracks discounts mercenary hire fees (-10%/level).
   - `e32c961` & `da1731d`: Holdings screen on global campaign map (`shell.ts`), two-column grid with 44px touch buy buttons.
   - **Campaign Holdings Integration Across All 4 Acts (`m01` to `m46`)**:
     * Verified `carryover.ts` propagates Barracks discount, Forge tier enhancement, and Shrine healing across all 46 campaign missions.
     * Extended `sim/town.ts` `makeQuest` (Fetch quests) to respect Forge tier bonuses and added `forge`/`barracks` to `hashTown`.
     * Added `tests/campaign-holdings-integration.test.ts` (8 comprehensive tests, 100% passing).
5. **Flagship Skirmish Maps Integrity**:
   - Verified `Kids Paradise III` (`glade`), `Red Hat` (`scarlet`), and `Turtle Beach` (`tidebreak`):
     * Objectives, triggers, and reward structures (`dropGold`, `dropAll`, `giveMoney`) are deterministic with zero dangling/unresolved references.
     * Validated map doc schemas, region bounds, shrine coordinates, town house indices, and merc unit references.
6. **Onboarding Tips**:
   - `5b20d14`: `src/tips.ts` — one-time contextual tips for low health (<35%), first loot pickup, first spell learned (saved in localStorage `thornvael.tips`).
7. **Portraits & Art Assets**:
   - `1385f01`: Added 8 new painted dark fantasy bust portraits (3:4 vertical bust with gilded gothic gold frame, Pillow resized to 384x512 q85, registered in `assets.json`):
     * Allies: `friend-archer.jpg`, `friend-imp.jpg` (wired into `main.ts` `unitPortraits`)
     * Monster families: `sand-raider.jpg`, `dune-scarab.jpg`, `claw-viper.jpg`, `doom-knight.jpg`, `quill-fiend.jpg`, `maggot-swarm.jpg`
   - Previous portraits: Sabik, Quillon, Aldren, Scout, Orlen, Groktar, Hale, Commander; Cinderhorn, Cinderling, Flintback, Glasswing, Ironbark, Rootbound, Stormtree; Friend Golem.
   - Paperdoll: tier tints on shared layers; female/mage base bodies; round shield layer.
   - Terrain: baked ground decals (tufts, flowers, pebbles, reeds).
   - Music: own soundtrack generator `tools/gen-soundtrack.py` (procedural town/explore/battle loops).
8. **Audio Architecture & Acoustic Balance (Items 5 & 6)**:
   - 4-bus WebAudio gain architecture: `masterBus` (0.9), `sfxBus` (0.8), `uiBus` (0.85), `musicBus` (0.32), `ambBus` (0.22).
   - Acoustic Level Balance: Combat SFX (0.80) and UI trader speech barks (0.85) provide a +8 to +9 dB margin above the music bed (0.32), preventing music from drowning out combat effects, spells, and trader dialogue.
   - Biome Ambience routing: Act 1-4 environmental soundscapes (`act1_marsh`, `act2_desert`, `act3_cavern`, `act4_hell`) and town hub layers rerouted to dedicated `ambBus` with `ambVol` control.
   - Clean Crossfades & Music Looping: `setMusic()` guarantees all non-selected modes ramp to 0 and pause, preventing overlapping or orphaned audio streams.
   - Mobile / iOS Lifecycle: `suspendAudio()` stops timers, pauses tracks, and frees context; `resumeAudio()` and touch `unlock()` seamlessly recover playback, re-arm AudioContext, and restore active biome ambiances.
   - Automated Verification: New test suite `tests/audio-balance.test.ts` (7 comprehensive tests passing).
9. **UI & Ergonomics: Holdings Modal Viewport Containment, HUD Quest Tracker & Minimap (Items 2 & 5)**:
   - Holdings Modal 100dvh Containment: Enforced `max-height: calc(100dvh - 16px)` and `overflow: hidden` on `#shell .sh-holdings-modal` and `#shell .sh-holdings-box`, guaranteeing zero vertical page scroll on standard 1080p, 720p, and mobile viewports.
   - Mobile Landscape Two-Column Grid: Activated `@media (max-height: 520px) and (min-width: 540px)` transforming holdings buildings into a compact 2-column grid with 44px-48px touch buy buttons.
   - Gothic HUD Quest Tracker (#objectives / .gothic-hud-tracker): Eliminated legacy conflicting ID selector rules that stretched across the top bar. Anchored to `left: calc(10px + env(safe-area-inset-left))` with `right: auto !important;`, bounded expanded height to prevent covering bottom globes and action dock.
   - Minimap Smooth Toggle & Readability: Added smooth CSS width/height/shadow transition, `#minimap.large` state (expands from compact 140-200px to 250-380px), dedicated toggle button (`.btn-minimap-toggle`) with $\ge 44\times 44$px touch hitbox, 'M' hotkey binding, and minimap double-click support. Shrines rendered on minimap as gold indicators.
   - Mobile Paperdoll Ergonomics: Ensured gear buttons in compact landscape viewports ($\le 500$px) have $\ge 44$px touch hitboxes without overflowing.
   - Automated Verification: New test suite `tests/holdings-ui.test.ts` (9 comprehensive tests passing).

---

## 5. What Remains To Be Done (Step-by-Step)
- **Item 5 Polish**:
   1. Visual inspection of Holdings modal, hit recoil, death topple, and damage floaters in live browser.
   2. Mobile paperdoll & HUD inspection on touch viewports ($\le 650$px).
   3. Phone performance audit (ensuring 60 FPS on real mobile hardware).

---

## 6. Known Issues and Risks
- **Slow Tests**:
  * `tests/hero-motion-proof.test.ts` takes ~16.2s.
  * `tests/ford-playability.test.ts` runs 8006 simulation ticks (~15-20s).
- **Procedural Soundtrack Provenance**:
  * Music is generated via `tools/gen-soundtrack.py`, but has not been human-audited for acoustic balance yet.
- **Unattended Visuals**:
  * Recent visual additions (recoil, topple, floaters, Holdings modal) passed automated Vitest and build gates, but were built in unattended runs and need live visual review.

---

## 7. What Is EXPLICITLY NOT VERIFIED (Do NOT Mark as Done)
- **Physical Phone / Mobile Testing**: Not tested on real Android/iPhone devices yet.
- **Acoustic Listening**: New AAC soundtrack loops generated by `tools/gen-soundtrack.py` have not been listened to by human ear.
- **Live User Playtest**: Live site playtest with user present is pending.

---

## 8. Next Concrete Step
- **Action**: Run `npm run preview` on `http://127.0.0.1:4173/thornvael/` and visually inspect the **Holdings modal** on the global map and the **combat hit recoil/topple** in mission 1.
- **Verification of Done**: Holdings modal opens without CSS overflow, rows align cleanly in 2 columns, buy buttons are easily clickable ($\ge 44$px), and hit recoil animates smoothly without visual glitching.

---

## 9. Inviolable Rules
1. **Simulation Determinism**: No `Math.random()` in `src/sim/`. Must use mulberry32 seeded PRNG.
2. **Zero Copied Art / Audio**: All assets must be procedurally generated or licensed, tracked in `assets.json`.
3. **No New Features Until Verified**: Do not add new features until current step is verified.
4. **Do Not Touch Carson Files**: `src/sim/path.ts` and `tests/movement.test.ts` remain untouched.
