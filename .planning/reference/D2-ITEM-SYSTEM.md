# Diablo II — Item System Design Notes

*Source: Structural inspection of `d2data.mpq` (`83` `.txt` table structure), `d2char.mpq`, and the `1,708`-file `.d2i` archive extracted to `_extract/zip/` (own-words synthesis of mechanics, bands, and formulas; no original names or raw tables copied).*

---

## 1. Three-Tier Base Item Architecture
- Every weapon and armor base belongs to one of three progressive tiers:
  1. **Normal (Tier 1, qlvl `1–30`):** Low Str/Dex requirements (`0–80`), base defense `5–180`, 1H weapon damage `2–25`.
  2. **Exceptional (Tier 2, qlvl `31–60`):** Mid requirements (`45–160`), ~2.2x–3.0x base armor/damage over Tier 1.
  3. **Elite (Tier 3, qlvl `61–85+`):** High requirements (`85–230+`), ~1.8x–2.5x over Tier 2 (armor `400–600+` before affixes, 2H weapon damage `50–130+`).
- **Class-Specific & Ethereal Bases:** Dedicated class items (helms, shields, wands, bows) roll `+1..+3` staff-mods; **Ethereal** bases gain `+50%` base defense or damage at the cost of being unrepairable (unless self-repairing or Indestructible).

---

## 2. Quality Hierarchy & Rarity Formula
Drops evaluate quality sequentially from rarest to most common using a **divisor formula** attenuated by **Magic Find (MF)** with diminishing returns:
- **Order of Checks:** `Unique -> Set -> Rare -> Magic -> Superior -> Normal -> Low Quality`.
- **Diminishing MF Effective Bonus:**
  - `EffectiveMF_Unique = floor((MF * 250) / (MF + 250))`
  - `EffectiveMF_Set    = floor((MF * 500) / (MF + 500))`
  - `EffectiveMF_Rare   = floor((MF * 600) / (MF + 600))`
  - `EffectiveMF_Magic  = MF` (uncapped)
- **Quality Chance Divisor:**
  - `FinalDivisor = BaseDivisor - floor((BaseDivisor * (ilvl - qlvl)) / DivisorStep)`
  - `AdjustedDivisor = max(MinDivisor, floor((FinalDivisor * 100) / (100 + EffectiveMF)))`
  - Succeeds if `rng(AdjustedDivisor) < 128`, multiplied by Treasure Class `Unique`/`Set`/`Rare`/`Magic` bonus factors (`0..1024`).

---

## 3. Affix Groups, Level Gates & Magic/Rare Structure
- **Affix Level (`alvl`) Gate:** Determined by `ilvl` and the base item's `magic_lvl` / `qlvl`:
  - `alvl` filters which Prefix and Suffix groups can roll (`min_alvl <= alvl <= max_alvl`).
  - **Mutual Exclusion (`group` ID):** At most one affix from a given `group` can roll on an item (e.g., two `% Enhanced Damage` prefixes cannot stack on Magic/Rare).
- **Rarity Affix Budgets:**
  - **Magic:** `1` prefix and/or `1` suffix (up to 2 affixes, higher individual roll ceilings on some groups).
  - **Rare:** `3–6` affixes (max 3 prefixes + max 3 suffixes, drawn from distinct groups).
  - **Crafted:** Fixed recipe affixes (`3–4` guaranteed base stats) + `1–4` random rare affixes.
  - **Set:** Fixed curated stats + **partial/full set bonuses** unlocked by equipping `2..6` pieces.
  - **Unique:** Fixed curated stats with tight min/max roll ranges; often breaks normal affix rules (e.g., skill procs, cross-class skills, flat elemental absorb).

---

## 4. Treasure Class (TC) & Drop Logic
- Monsters map to a **Treasure Class** (`TC3`..`TC87` in bands of 3 qlvls).
- **No-Drop Scaling:** `NoDrop` weight decreases as party/player count rises; bosses and champions bypass `NoDrop` and roll `2–6` picks.
- **Recursive Picks:** A TC entry can point to a lower TC (`downgrade`), a specific item type (`weapXX`/`armoXX`), a `Gold` pile, or a `Junk/Potion` sub-table.

---

## 5. Sockets, Gems, Jewels & Runewords
- **Sockets (`1–6`):** Capped by item slot (`2` helms, `3` shields/body early, `4` elite shields/armors, `6` large 2H weapons) and `ilvl` bands (`1–25`, `26–40`, `41+`).
- **Socketables:**
  - **Gems (`5` grades):** Chipped -> Flawed -> Standard -> Flawless -> Perfect; socket effect depends on slot (Weapon = elemental/leech, Armor/Helm = life/mana/MF, Shield = resistance).
  - **Jewels:** Roll Magic/Rare affixes independent of slot.
  - **Runes (`33` tiers):** Individual slot-dependent bonuses; **Runewords** activate ONLY when exact runes are socketed in exact order into a **non-magic (grey) socketed** item of the matching base class with exact socket count.
