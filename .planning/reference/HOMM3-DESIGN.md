# Heroes of Might and Magic III — Design & Mechanics Notes

*Source: Structural inspection of `H3bitmap.lod` (`71` `.txt` tables extracted to `_extract/homm3/H3bitmap.lod/`). Written in own words, numeric bands, and formulas; no original names or tables copied.*

---

## 1. Creature Tier Stat Bands & Weekly Growth (`CRTRAITS.TXT`, `169` entries)
Units span **7 Tiers**, each with a **Base** and **Upgraded** form (`+15–35%` stats, higher speed, extra ability):
- **Tier 1:** `4–10 HP`, `1–3` dmg, `3–6` speed, weekly growth `12–16` (cheap swarm/fodder).
- **Tier 2:** `10–25 HP`, `2–5` dmg, `4–7` speed, weekly growth `8–12`.
- **Tier 3:** `20–40 HP`, `4–8` dmg, `4–8` speed, weekly growth `6–8`.
- **Tier 4:** `30–60 HP`, `6–12` dmg, `5–9` speed, weekly growth `4–6` (core mid-game anchor).
- **Tier 5:** `50–90 HP`, `10–18` dmg, `6–11` speed, weekly growth `3–4`.
- **Tier 6:** `80–150 HP`, `15–30` dmg, `7–12` speed, weekly growth `2`.
- **Tier 7 (Apex):** `150–300 HP`, `25–60` dmg, `9–19` speed, weekly growth `1` (modified by Citadel `+50%` and Castle `+100%` growth buildings, plus external dwellings `+1/wk`).

---

## 2. Resource Economy (`7` Resources, `Building.txt`)
- **2 Common Materials:** Wood, Ore (used for early dwellings, walls, marketplaces).
- **4 Rare / Precious Resources:** Mercury, Sulfur, Crystal, Gems (aligned by faction to gate Tier 5–7 dwellings and Mage Guilds).
- **1 Universal Currency:** Gold (`500–4,000/day` from Town Hall -> City Hall -> Capitol, plus mines and map pickups).
- **Design Pattern:** Every faction needs Wood/Ore early, then 1–2 primary rare resources and 1 secondary rare resource, forcing map control over specific mines or Marketplace trading (which improves with more owned towns).

---

## 3. Town Building Trees (Structure Only)
- **Core Spine:** `Village Hall -> Town Hall -> City Hall -> Capitol` (gold income progression).
- **Defense & Growth Spine:** `Fort -> Citadel (+50% growth, moat) -> Castle (+100% growth, double towers)`.
- **Magic & Utility:** `Mage Guild Levels 1–5` (unlocking Spell Levels 1–5), `Tavern` (hero hire + rumors), `Blacksmith` (war machine), `Marketplace + Silo` (+1 resource/day), `Unique Faction Buildings` (2–3 per town, e.g., training/treasury/portal).
- **Creature Dwellings:** Tiers `1–7` with prerequisite links + **Upgrade** tier per dwelling.

---

## 4. Hero Primary & Secondary Skills
- **4 Primary Stats:** Attack, Defense, Spell Power, Knowledge (`Max Mana = Knowledge * 10`).
- **Secondary Skills (`28` skills x `3` Tiers = Basic / Advanced / Expert, max `8` slots per hero):**
  - Offered on level-up as a binary choice (`Skill A` or `Skill B`), creating build variety.
  - **Magic Schools (4):** Mastery reduces spell mana cost (`-20% to -25%`) and upgrades single-target buffs/curses into **mass-cast** versions at Expert rank.
  - **Economy/Map Skills:** Logistics (`+10–30%` move), Scouting, Estates (`+125–500` gold/day), Wisdom (gates Spell Levels `3/4/5`).

---

## 5. Spell Levels & Mana (`SPTRAITS.TXT`)
- **5 Spell Levels** across 4 Elemental Schools + Adventure Map spells:
  - **Level 1:** `4–6` mana (single-target bolt, basic haste/slow/bless).
  - **Level 2:** `6–10` mana (blind, lightning, dispel, stone skin).
  - **Level 3:** `10–16` mana (fireball, animate dead, teleport, mass-prep buffs).
  - **Level 4:** `16–24` mana (chain lightning, resurrection, town portal, meteor).
  - **Level 5:** `20–35` mana (implosion, dimension door, fly, summon elemental).
- Damage spells scale linearly as `Base + (SpellPower * Multiplier)`.

---

## 6. Map Objects, Scripting Events & AI
- **Map Object Categories (`Objects.txt`, `1,326` templates):** Resource mines, external dwellings, artifact pickups, Pandora's Boxes / Seer's Huts (`SeerHut.txt`), Monster Banks (`CrBanks.txt`: guard wave -> gold/creature/artifact reward), Keymaster Tents & Border Gates (`TentColr.txt`), Monolith Two-Way Portals (`Monolith.txt`), Shrines & Stat-Boosters.
- **Adventure Scripting (`advevent.txt`, `artevent.txt`):** Timed global/town events (by day/week), localized encounter popups with optional guard fights, Seer's Hut fetch/kill/artifact quests, and Pandora's Box conditional rewards.
- **AI Behavior:** Evaluates map targets using an `AI Value` heuristic (comparing army strength ratio vs guard value, prioritizing mines, unguarded towns, and weak heroes before retreating or defending).

---

## 7. Battle Formulas (Damage, Morale & Luck)
- **Attack vs Defense Modifier:**
  - If `Atk > Def`: `DamageMult = 1 + min(3.0, 0.05 * (Atk - Def))` (`+5%` per point, capped at `+300%`).
  - If `Def > Atk`: `DamageMult = max(0.30, 1 - 0.025 * (Def - Atk))` (`-2.5%` per point, floor at `30%` damage).
  - Total stack damage = `StackCount * Random(MinDmg, MaxDmg) * DamageMult * SkillMods`.
- **Morale & Luck (`-3 .. +3` scale):**
  - Positive Morale (`~4.17%` per point, max `12.5%`) grants an **extra immediate turn**; negative Morale skips a turn.
  - Positive Luck (`~4.17%` per point, max `12.5%`) doubles base damage on a hit.
