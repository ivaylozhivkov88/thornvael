# 04-GAMEPLAY — Gameplay, Balance & Core Loop Audit (2026-11-24)

## 1. Core Value Assessment (Real-Time Squad + Hero + Mercs)
- **Simulation & Determinism (Verified via `npm test -- --maxWorkers=1`):**
  - `tests/spells.test.ts`: 300-unit battle full of casts and statuses steps `< 1 ms` on average (`453ms` total test).
  - `tests/movement.test.ts`: 300 units cross real map without long step or overlapping (`534ms`).
  - `tests/combat-animation.test.ts`: CombatAnimation leaves `sim.hash()`, snapshots, log, and Fx untouched across restore (`685ms`).
  - `tests/ford-playability.test.ts`: Command-only medium warrior traverses Sunken Ford and defeats chief (`7861` ticks, `minHeroHp: 5`).

## 2. Difficulty, TTK & Loot Progression (Observed Test Outputs)
- **Difficulty TTK (`tests/difficulty-ttk.test.ts`):**
  - Act 1 (Thornwick & Sunken Ford): Easy `2.95s`, Normal `3.9s`, Hard `5.3s`
  - Act 2 (Redmarsh & Salt-Vaults): Easy `3.8s`, Normal `5.05s`, Hard `6.85s`
  - Act 3 (Burning Harbor & Rampart): Easy `4.65s`, Normal `6.15s`, Hard `8.3s`
  - Act 4 (Ember Threshold & Caldera): Easy `5.6s`, Normal `7.45s`, Hard `10.05s`
- **Loot Economy (`tests/loot-audit.test.ts`, 100k drops/zone):**
  - Act 1: nodrop `65.20%`, rare `4.77%`, set `2.264%`, unique `1.161%`, `2329` gold/hr
  - Act 2: nodrop `58.08%`, rare `5.89%`, set `2.658%`, unique `1.428%`, `3843` gold/hr
  - Act 3: nodrop `51.68%`, rare `6.67%`, set `3.102%`, unique `1.610%`, `4920` gold/hr
  - Act 4: nodrop `44.87%`, rare `7.63%`, set `3.460%`, unique `1.918%`, `5536` gold/hr

## 3. Weaknesses & Cheap High-Fun Additions
1. **[S2, medium] Unwired `elite-affixes.json` & `merc-abilities.json` (`src/sim/combat.ts`):** Elite packs and mercenaries have rich data packs in `public/data/content/` that are not yet wired into combat.
2. **[S2, medium] `SteppedQuestAdapter` `onCollectItem` matching (`src/main.ts:3708`):** Passes `(d2Action.interactable as { name?: string }).name`; should be verified against `public/data/content/side-quests.json` `collect_item` item drops during live missions so every quest drop name matches 1:1.
3. **[S3, medium] Merc Party Banter (`merc-party-banter.json`):** Adding a low-frequency idle banter toast between hired mercenaries would boost squad personality cheaply.
4. **[S3, medium] Blacksmith Salvage (`salvage-lines.json`):** Adding a "Salvage" button in `src/townui.ts` turns unwanted magic/rare drops into gold/materials.
