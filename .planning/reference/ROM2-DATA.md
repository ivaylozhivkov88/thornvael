# Rage of Mages II — Data Formats & Numeric Bands

*Source: Read-only structural analysis of `world.res/data/data.bin`, `main.res/text/*`, `graphics.res`, `sfx.res`, `speech.res`, and `scenario.res/*.alm` extracted to `_extract/rom2/` (no original text, names, or raw tables copied).*

---

## 1. Archive & Binary Formats
- **`.res` Container:** Little-endian `0x31415926` magic, 24-byte header (`magic`, `rootIndex`, `rootCount`, `flags`, `fatOffset`, `fatCount`), followed by 32-byte FAT records (`junk`, `offset`, `size`, `nodeType`, `name[16]`). Recursive directory tree.
- **`data.bin` Database (`149,971` bytes):** Sequence of typed tables, each starting with `uint16 colCount`, `colCount` 1-byte length-prefixed column headers, `uint32 rowCount`, and rows of length-prefixed strings + `float64` values.
- **`.alm` Mission Maps (`46` maps in `scenario.res`):** `"M7R\0"` magic, 20-byte header (`magic`, `hdrSize`, `fileSize`, `sectionCount`, `seed`, `flags`). Sections store orthogonal 32x32 tile terrain, height map, passability, lighting, units, buildings, item sacks, regions, and declarative trigger scripts.
- **Sprite Layout (`graphics.res`, `4,049` files):**
  - `.256` (`1,929`), `.16a` (`623`), `.16` (`3`) indexed/alpha sprite sheets with `.pal` (`159`) palettes; `.bmp` (`1,325`) UI/backgrounds.
  - Organized by `interface` (`1,162`), `equipment` (`1,104`), `inventory` (`491`), `units` (`337`), `structures` (`327`), `objects` (`271`), `infowindow` (`185`), `terrain` (`53`), `projectiles` (`46`), `cursors` (`46`).

---

## 2. Classes, Stats & XP Curve (Bands & Formulas)
- **Four Core Archetypes:** Two martial (Heavy Melee, Ranged/Scout) and two arcane (Elemental Mage, Dark/Summoner Mage), plus male/female variants.
- **Primary Attributes (4):** Physical/Vitality (`Body`), Finesse/Speed (`Reaction`/`Agility`), Intellect/Power (`Mind`), Will/Mana (`Spirit`).
  - Starting attribute pools sit in the `10–25` band per stat, with class-biased caps (`30–50` base before gear).
  - **HP Scaling:** Base HP (`~50–120` at Lv 1) scales linearly with Vitality (`~+8–12 HP` per point) and class tier (`~+12–25 HP` per level band).
  - **Mana Scaling:** Base Mana (`~15–40` at Lv 1 for casters) scales with Will/Spirit (`~+4–6 Mana` per point).
- **XP Curve:** Super-linear / near-cubic progression across levels `1..50+`, where early levels (`1–10`) require `100–2,500` XP increments and mid-to-late levels (`15–35`) scale steeply (`10,000–120,000+` per level) so quests and elite kills drive late progression.

---

## 3. Spells (`24` Core Spell Slots / `5` Schools)
- **Schools (5):** Fire, Water/Ice, Air/Lightning, Earth/Stone, Astral/Spirit (plus dark/necromantic variants).
- **Cost & Damage Bands:**
  - **Tier 1 (Cantrip/Bolt):** `4–10` mana, `8–20` base damage, `0s` cooldown, instant or short projectile.
  - **Tier 2 (Arc/Area):** `12–22` mana, `20–45` damage or `15–30s` buff/debuff duration.
  - **Tier 3 (AoE/Control):** `25–45` mana, `45–90` damage, `3x3`–`5x5` tile radius or `20–45s` ward/shield.
  - **Tier 4–5 (Master/Summon):** `50–100+` mana, `90–200+` burst or multi-tick hazard (`6–12s` duration), high cast-time or mana-burn.
- **Skill-Weighted Scaling:** Casting effectiveness scales with both Mind/Astral attribute and school skill rank (`0–100`), increasing damage, duration, and AoE radius.

---

## 4. Items, Slots, Materials & Shop Pricing
- **Equipment Slots (`12`):** Weapon, Shield, Helm, Cuirass/Armor, Gauntlets/Bracers, Boots, Cloak, Amulet, Ring x2, Belt/Quick-slots.
- **Material & Shape Matrix (`Table 0` in `data.bin`):** `7` material/quality tiers multiplying base `Price`, `weight`, `@.damage`, `@.toHit`, `#.defence`, `#.absorption`, and `MagCap` (magic capacity for enchantments).
  - *Low tiers (Leather/Wood/Iron):* `1.0x` price, low weight, low magic capacity.
  - *Mid tiers (Steel/Silver/Mithril-equivalent):* `2x–8x` price, higher defense/damage, moderate magic capacity.
  - *High tiers (Crystal/Obsidian/Meteor-equivalent):* `15x–50x+` price, high `MagCap` allowing multi-affix enchantments.
- **Affixes & Ratios:**
  - `49` stat/modifier entries (`stats.txt`) across flat bonuses (`+1..+5` attributes, `+5..+50` HP/Mana, `+2..+15` damage/defense), percentage resistances (`+10%..+50%`), and proc/aura effects.
  - **Shop Pricing Logic:** Item buy price = `BaseShapePrice * MaterialMult * (1 + EnchantmentSumFactor)`; sell-back price = `~25%–35%` of buy price, modified by charisma/town reputation (`±15%`).

---

## 5. Monster Stat Bands by Zone
- **Early Frontier (Zones 1–2):** `30–90 HP`, `4–12` dmg, `0–2` armor, `15–60 XP`.
- **Mid Borderlands (Zones 3–5):** `100–280 HP`, `14–30` dmg, `3–7` armor, `80–250 XP`.
- **Late / Siege / Volcanic (Zones 6–9):** `300–900+ HP`, `32–75` dmg, `8–16` armor, `300–1,200+ XP` (bosses `1,500–4,000+ HP` with elemental immunities).
