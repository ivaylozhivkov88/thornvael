# Cross-Game Synthesis for Thornvael

*Actionable design proposals synthesizing Rage of Mages II, Diablo II, and Heroes of Might and Magic III against Thornvael's current implementation in `src/data/**`, `src/skills/**`, and `src/sim/**`.*

---

## 1. Current Baseline vs. Gaps

| Area | What Thornvael Already Has | What Is Lacking / Opportunity |
|---|---|---|
| **Item Affixes & Uniques** | `src/sim/items.ts`, `affixes.ts`, `sets.ts`, `runes.ts`, `src/data/act2/uniques.json` (40), `src/data/act3/uniques.json` (40), `src/data/text/item-lore.json` | Formal `alvl` / `group` mutual-exclusion on rare affixes (preventing duplicate stat-family rolls) and explicit Magic Capacity (`MagCap`) caps per item tier. |
| **Skill Trees** | `src/skills/trees.ts` & `types.ts` (4 classes x 5 tiers), `spells-new.json` (55 spells) | Hard-point **synergies** between Tier 1–2 skills and Tier 4–5 capstones, plus a `Casting Delay` tag on screen-clearing Tier 5 spells. |
| **Monster Scaling** | `src/sim/difficulty.ts` (`RULES[0..2]`), `src/data/difficulty-curve.json`, `src/data/act{2,3}/bosses.json` | Resistance penalties on Nightmare/Hell (`-40%` / `-100%` analog) and elemental immunity/counter-play tags in `bestiary-extra.json`. |
| **Economy & Loot** | `LOOT_RULES` in `src/sim/items.ts`, `evaluateQualityHierarchy` in `src/sim/hero.ts`, `mercPrice` in `difficulty.ts` | Town **Silo / Reputation** passive gold/discount tie-ins (`src/data/hub-evolution.ts` exists for visuals; economy hooks can mirror HoMM3's Capitol/Marketplace curve). |
| **Quest / Trigger Vocabulary** | `src/sidequests.ts` (`talk_npc`, `collect_item`, `kill_count`, `escort_safe`, `dialogue_choice`), `src/data/act{2,3}/quests.json` | Timed wave/repop triggers (`Outpost Repopper`), `Health of building` siege checks, and `Set Subobjective` / `Teleport unit` from RoM2's 27/49 vocabulary. |
| **Map Objects** | Shrines, gold sacks, crates, regions in `MapDoc` v2 (`src/mapdoc.ts`) | HoMM3-style **Monster Banks** (guard wave -> guaranteed relic/gold cache) and **Keymaster Tents / Colored Gates** for non-linear map shortcuts. |
| **UI & Onboarding** | `src/data/tutorial.json`, `src/data/achievements.json`, `src/dialogue.ts`, `public/data/content/tavern-rumors.json` | Wiring `dialogue.ts` reputation tiers + `tavern-rumors.json` into `townui.ts`, and wiring `tutorial.json` popups for first-10-minute onboarding. |

---

## 2. Ranked Proposals (Value / Effort)

### Priority 1 — High Value / Low Effort
1. **Wire `dialogue.ts`, `tavern-rumors.json`, and `tutorial.json` into UI** (`Value: High | Effort: Low`): All data and pure helpers already exist; surfacing reputation-tier greetings, true/false tavern rumors, and 10-minute onboarding hints immediately deepens town/first-mission feel.
2. **Add `group` Mutual-Exclusion & `alvl` Gates to Rare Affix Rolls** (`Value: High | Effort: Low`): Borrowing D2's affix `group` ID prevents awkward double-rolls on Rare drops and makes itemization cleaner.
3. **Hard-Point Skill Synergies (`+8%` per rank)** (`Value: High | Effort: Low`): Adding a `synergies: [{ sourceSkillId, bonusPct }]` field to `src/skills/trees.ts` makes early Tier 1–2 investments meaningful at Level 25+.

### Priority 2 — High Value / Medium Effort
4. **Monster Banks & Colored Gate Shortcuts on Skirmish/Campaign Maps** (`Value: High | Effort: Medium`): Adopting HoMM3's guarded reward caches (`CrBanks`) and Keymaster Gates gives players meaningful risk-reward detours on 128x128+ maps.
5. **Expand Trigger Vocabulary with Siege & Repopper Primitives** (`Value: Medium-High | Effort: Medium`): Adding `building_hp_below`, `timer_elapsed`, and `outpost_repop` to `MapDoc` triggers enables richer Act 2–3 defense missions.
6. **Difficulty Resistance Penalties & Casting Delays** (`Value: Medium-High | Effort: Medium`): Applying `-25% / -50%` elemental resistance penalties on Hard/Nightmare and `1.5s–3.0s` cooldowns on Tier 5 AoEs curbs late-game mana-pot spam.

### Priority 3 — Medium Value / Higher Effort
7. **Inventory Charms (`1x1` / `2x1` Trade-Off)** (`Value: Medium | Effort: High`): Allowing small passive charms in backpack slots creates D2's classic power-vs-loot-space tension, though it requires inventory grid UX updates.
8. **Town Economy Evolution (Marketplace Rate + Daily Stipend)** (`Value: Medium | Effort: Medium-High`): Tying `src/data/hub-evolution.ts` tiers to shop sell-back rates (`25% -> 35%`) and militia upkeep discounts.
