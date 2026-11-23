# Diablo II — Skills, Monsters, Scaling & Charms

*Own-words structural and formula summary for reference design (no verbatim tables or original names copied).*

---

## 1. Skill Tree Structure (3 Tabs x 10 Skills per Class)
- **Layout:** Each class has `3` thematic trees (e.g., Martial/Weapon, Defensive/Aura, Elemental/Summon) arranged in `6` level-gated rows:
  - **Row 1:** Level `1`
  - **Row 2:** Level `6`
  - **Row 3:** Level `12`
  - **Row 4:** Level `18`
  - **Row 5:** Level `24`
  - **Row 6:** Level `30` (Capstone skills)
- **Prerequisites & Rank Cap:**
  - Skills require `1` point in 1–2 parent nodes connected by tree arrows before unlocking.
  - Hard skill point cap is `20` per skill; `+to Skills` on gear can push effective level past `20` (to `30–45+`).
- **Synergies (Hard-Point Scaling):**
  - Lower-tier skills grant `+5%..+15%` damage/duration per **hard point** invested to higher-tier skills in the same or adjacent branch, preventing Level 1 skills from becoming dead weight at endgame.

---

## 2. Mana & Cooldown Curves
- **Low-Tier Spammables (Lv 1–12):** `1.5–8` mana, zero casting delay (`0s`), scaling linearly or sub-linearly (`+0.5–1.0` mana/level) so basic attacks remain sustainable.
- **Mid-Tier Spells (Lv 12–24):** `10–25` mana; utility buffs/auras cost `0` mana (auras) or a single upfront cast (`15–35` mana for `60–300s` duration).
- **High-Tier AoEs & Summons (Lv 24–30):** `20–50+` mana and a **global/skill Casting Delay** (`0.6s–4.0s`) on screen-clearing meteors/blizzards/hydras to prevent mana-pot spamming from trivializing encounters.

---

## 3. Monster Scaling by Act & Difficulty
- **3 Difficulty Tiers (Normal -> Nightmare -> Hell):**
  - **Normal (Acts 1–5):** Monster levels `1–45`; single-element threats, minimal resistances (`0–33%`).
  - **Nightmare:** Monster levels `36–66`; `~3x–5x` HP, `~1.5x–2x` damage, `25–50%` elemental resistances, faster AI/movement.
  - **Hell:** Monster levels `67–85+`; `~10x–20x` HP vs Normal, `~2.5x–4x` damage, `50–100%+` resistances (**Immunities** at `>=100%` res), forcing dual-element builds, mercenary support, or resistance-breaking curses/auras.
- **Elite Rank Multipliers:**
  - **Champions:** `~2x–3x` HP, `+1–2` mlvl, `1` special trait (Berserk, Fanatic, Ghostly, Possessed).
  - **Unique Packs:** `~2x–4x` HP + `1–3` random boss mods (Extra Fast, Extra Strong, Cursed, Aura Enchanted, Cold/Fire/Lightning Enchanted) + `3–6` minions.

---

## 4. Resistance & Penalty Rules
- **Difficulty Resistance Penalties:**
  - **Normal:** `0%` penalty
  - **Nightmare:** `-40%` all elemental resistances
  - **Hell:** `-100%` all elemental resistances
- **Caps & Mitigation:** Default elemental resistance cap is `75%` (extendable up to `95%` via max-res gear); Physical Damage Reduction is capped at `50%`.
- **Death Penalty:** Loss of `0%` (Normal), `5%` (Nightmare), `10%` (Hell) of current level's XP bar (recovering corpse refunds `75%` of lost XP in Nightmare/Hell), plus gold drop from carried pouch.

---

## 5. Charms & Inventory Trade-Off
- **Charm Sizes:** `Small (1x1)`, `Large (2x1)`, `Grand (3x1)` stored directly in the `10x4` backpack to grant passive bonuses (`+HP`, `+Resist`, `+MaxDmg/AR`, `+1 Skill Tab`).
- **Design Trade-Off:** Every charm carried consumes loot-pickup space, creating a natural tension between raw combat power and looting convenience.
