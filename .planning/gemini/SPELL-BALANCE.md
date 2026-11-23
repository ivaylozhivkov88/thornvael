# Spell & Skill 5-Tier Balance Audit (`gemini/big-pass`)

**Date:** 2026-11-23  
**Sources:** `public/data/spells.json` (55 spells), `public/data/content/spell-text.json` (77 entries), `public/spellicons/spellicons.json`, `src/skills/trees.ts`, `src/sim/spells.ts`

---

## 1. Gaps Found & Filled

| Class | Before | Gap Identified | Resolution |
|---|---|---|---|
| **Warrior** (`cls: 1`) | 7 spells, Tiers 1–4 skill tree | Missing Tier 5 skill tree capstone | Added Tier 5 capstone `Ironheart Reckoning` (`war_ber_6`) to `WARRIOR_SKILL_TREE`. |
| **Mage** (`cls: 2`) | 6 class spells + 32 shared spells, Tiers 1–4 skill tree | Missing Tier 5 skill tree capstone | Added Tier 5 capstone `Caldera Conduit` (`mag_pyr_6`) to `MAGE_SKILL_TREE`. |
| **Archer** (`cls: 4`) | 3 spells (`Bodkin Shot`, `Volley of Reeds`, `Heartseeker`), no skill tree | Missing Tier 2 & Tier 4 spells; no `ARCHER_SKILL_TREE` | Added `Barbed Shaft` (Tier 2, 13 mana, 30 cd, 16–24 dmg + poison) & `Gale Pin` (Tier 4, 20 mana, 46 cd, 26–36 dmg + slow); added 5-tier `ARCHER_SKILL_TREE`. |
| **Necromancer** (`cls: 8`) | 2 spells (`Marrow Dart`, `Grave Chill`), no skill tree | Missing Tiers 3, 4, 5 spells; no `NECROMANCER_SKILL_TREE` | Added `Quicklime Cloud` (Tier 3, 18 mana, 42 cd), `Bone Splinter` (Tier 4, 22 mana, 48 cd), & `Rite of Ash` (Tier 5, 28 mana, 60 cd); added 5-tier `NECROMANCER_SKILL_TREE`. |

---

## 2. 5-Tier Class Spell Curves (`public/data/spells.json`)

| Class | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|---|---|---|---|---|---|
| **Warrior** (`cls: 1`) | `Hamstring Cut` (9m / 28t / 12–18) | `Shield Bash` (10m / 25t / 14–20) | `Cleave Arc` (14m / 30t / 18–26) | `Sunder Plate` (15m / 35t / 20–28) | `Executioner's Blow` (24m / 60t / 34–46) |
| **Mage** (`cls: 2`) | `Siphon Ley` (6m / 32t / 14–20) | `Static Arc` (12m / 28t / 18–26) | `Cinder Lance` (14m / 30t / 20–28) | `Peat-Gas Blast` (19m / 42t / 22–30) | `Vitrify` (28m / 62t / 38–50) |
| **Archer** (`cls: 4`) | `Bodkin Shot` (10m / 25t / 18–25) | `Barbed Shaft` (13m / 30t / 16–24 + Poison) | `Volley of Reeds` (16m / 38t / 14–20 AoE) | `Gale Pin` (20m / 46t / 26–36 + Slow) | `Heartseeker` (24m / 58t / 36–48) |
| **Necromancer** (`cls: 8`) | `Marrow Dart` (10m / 24t / 15–22) | `Grave Chill` (14m / 35t / 14–20 + Slow) | `Quicklime Cloud` (18m / 42t / 16–24 + Weaken) | `Bone Splinter` (22m / 48t / 20–30 Multi) | `Rite of Ash` (28m / 60t / 36–52 + Burn) |

---

## 3. Handler, Icon & Description Audit
- **Effect Handlers (`src/sim/spells.ts`):** All 55 spells map to valid `Tk` dispatch paths (`Foe`, `Ally`, `Ground`, `Multi`, `Self`, `Corpse`).
- **Icon Keys (`public/spellicons/spellicons.json`):** Every spell resolves to a valid `school/*` icon (`fire`, `frost`, `arcane`, `earth`, `shadow`).
- **Descriptions (`public/data/content/spell-text.json`):** 100% of spells (55/55) have non-empty `tooltip` and `flavor` descriptions.
- **Verification:** `tests/spell-skill-audit.test.ts` + `tests/spells.test.ts` + `tests/class-skills.test.ts` all pass.
