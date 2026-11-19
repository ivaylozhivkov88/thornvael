# Thornvael — Loot, Crafting & Skill Trees Design Specification

> **Status:** Stage 1 Design Spec (Deterministic Core)  
> **Scope:** `src/items/*`, `src/skills/*`, `src/sim/*`  
> **Determinism:** All rolls use `Rng` (`mulberry32` in `src/sim/rng.ts`). Zero `Math.random()`.

---

## 1. Item Level (`ilvl`) & Tier Scaling (`ilvl 1..50`)

Every dropped or generated gear item carries an integer `ilvl` in `1..50`, derived from the monster level / zone level (`mlvl`) and difficulty modifier:

- **Camp / Border Fords (Act 1):** `ilvl 1..12`
- **Redmarsh Wastes (Act 2):** `ilvl 12..24`
- **Iron Coast (Act 3):** `ilvl 24..36`
- **Obsidian Caldera (Act 4):** `ilvl 36..50`
- **Skirmish / Difficulty Bonus:** Normal `+0`, Veteran `+4`, Doomed `+8` (clamped to `50`).

`ilvl` maps to the 5 equipment **Tiers** (`tier 1..5`) used in `public/data/items.json` and `src/sim/item-types.ts`:

| Tier | `ilvl` Range | Zone / Act | Base Stat Multiplier | Max Sockets (Gear) | Max Affixes (Rare) |
|:---:|:---:|---|:---:|:---:|:---:|
| **1** | `1–10` | Border Fords | `1.00×` | `1` (Weapon/Armor/Shield/Helm) | `3–4` |
| **2** | `11–20` | Redmarsh Wastes | `1.15×` | `2` (Weapon/Armor/Shield), `1` (Helm) | `4` |
| **3** | `21–30` | Iron Coast | `1.35×` | `2` (Helm/Shield), `3` (Weapon/Armor) | `4–5` |
| **4** | `31–40` | Obsidian Caldera | `1.60×` | `2` (Helm), `3` (Weapon/Armor/Shield) | `5–6` |
| **5** | `41–50` | Pinnacle / Endgame | `1.90×` | `3` (Weapon/Armor/Shield), `2` (Helm) | `6` |

---

## 2. Rarity Tiers & Deterministic Drop Weights

### 2.1 Rarity Tiers

| Rarity | Color | Affix Count | Name Format | Salvage Yield |
|---|---|---|---|---|
| `common` | `#ffffff` (White) | `0` | `<Base Name>` | `1× Ash Essence` |
| `magic` | `#4a9eff` (Cyan) | `1–2` (1 Prefix and/or 1 Suffix) | `[Prefix] <Base> [Suffix]` | `1–2× Glimmer Essence` |
| `rare` | `#e6c840` (Gold) | `3–6` (max 3 Prefix, max 3 Suffix) | `<RarePrefix> <RareSuffix>` | `1–2× Amber Essence` |
| `set` | `#00ff7f` (Emerald) | Fixed Set Piece + Set Bonuses | `<Set Piece Name>` | `1× Verdant Essence` |
| `unique` | `#ff9a1f` (Amber) | Fixed Artifact Stats + Lore | `<Unique Artifact Name>` | `1× Astral Essence` |

### 2.2 Base Drop Weights & Monster Rank Modifiers

When a gear drop is rolled, `effectiveMF` is computed with diminishing returns (compatible with `calculateMaxrollEffectiveMF` in `src/sim/mechanics.ts`):

```ts
effectiveMF(mf, factor) = Math.floor((mf * factor) / (mf + factor))
// Factors: Magic = 1000 (no cap), Rare = 600, Set = 500, Unique = 250
```

Rolls are evaluated top-down (`unique` → `set` → `rare` → `magic` → `common`) using `Rng.int(10000)` (basis points, `10000 = 100%`):

| Monster Rank | `ilvl` Bonus | `unique` (bp) | `set` (bp) | `rare` (bp) | `magic` (bp) | `common` (bp / remainder) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Normal** | `+0` | `25` (`0.25%`) | `60` (`0.60%`) | `350` (`3.5%`) | `1800` (`18%`) | `7765` (`77.65%`) |
| **Champion** | `+2` | `120` (`1.20%`) | `260` (`2.60%`) | `1200` (`12%`) | `4200` (`42%`) | `4220` (`42.20%`) |
| **Elite / Named** | `+3` | `350` (`3.50%`) | `650` (`6.50%`) | `2500` (`25%`) | `5000` (`50%`) | `1500` (`15.00%`) |
| **Act / Map Boss** | `+5` | `1200` (`12.0%`) | `1600` (`16.0%`) | `4200` (`42%`) | `3000` (`30%`) | `0` (Bosses never drop common gear) |

- **Effective Chance Formula:**  
  `chance_bp = Math.min(10000, Math.floor(base_bp * (100 + effectiveMF) / 100))`
- **Difficulty Multiplier:** Veteran `+25%` to `unique`/`set`/`rare` weights; Doomed `+60%`.
- **Unidentified Rule:** `rare`, `set`, and `unique` items drop with `unidentified: true` and require a `Scroll of Identification` (or Town Identify) to reveal stats.

---

## 3. Prefix & Suffix Affix Pools (`ilvl 1..50`)

Compatible with `src/sim/affixes.ts` mutual exclusion groups (`group`). An item can never roll two affixes from the same `group`. Within each affix, stat values roll deterministically as integers `[rollMin..rollMax]` via `Rng.int(max - min + 1) + min`.

### 3.1 Prefix Pool

| Group | Affix Name | `ilvl` | Tier | Weight | Eligible Slots | Stat Ranges |
|:---:|---|:---:|:---:|:---:|---|---|
| **1** | `Jagged` | `1–14` | `1–2` | `10` | `Weapon` | `min: +1..2, max: +1..2` |
| **1** | `Serrated` | `11–26` | `2–3` | `8` | `Weapon` | `min: +2..4, max: +3..5, acc: +1` |
| **1** | `Keen` | `21–38` | `3–4` | `6` | `Weapon` | `min: +3..6, max: +5..8, acc: +2` |
| **1** | `Cruel` | `31–50` | `4–5` | `4` | `Weapon` | `min: +5..9, max: +8..13, acc: +3` |
| **2** | `Stout` | `1–14` | `1–2` | `10` | `Armor, Shield, Helm, Boots, Gloves` | `def: +1..2, abs: +1` |
| **2** | `Hardened` | `11–26` | `2–3` | `8` | `Armor, Shield, Helm, Boots, Gloves` | `def: +2..3, abs: +1..2` |
| **2** | `Tempered` | `21–38` | `3–4` | `6` | `Armor, Shield, Helm, Boots, Gloves` | `def: +2..4, abs: +2..3` |
| **2** | `Indomitable` | `31–50` | `4–5` | `4` | `Armor, Shield, Helm, Boots, Gloves` | `def: +3..6, abs: +3..5` |
| **3** | `Glowing` | `1–16` | `1–2` | `7` | `All Gear` | `fireRes: +8..12%, min: +1, max: +1` |
| **3** | `Fiery` | `15–36` | `2–4` | `5` | `All Gear` | `fireRes: +16..24%, min: +2..3, max: +3..4` |
| **3** | `Volcanic` | `32–50` | `4–5` | `3` | `All Gear` | `fireRes: +25..35%, min: +4..5, max: +6..8` |
| **4** | `Chilly` | `1–16` | `1–2` | `7` | `All Gear` | `waterRes: +8..12%, def: +1` |
| **4** | `Glacial` | `22–50` | `3–5` | `4` | `All Gear` | `waterRes: +20..30%, def: +2..3, abs: +1` |
| **5** | `Breezy` | `1–16` | `1–2` | `7` | `All Gear` | `airRes: +8..12%, acc: +1` |
| **5** | `Storming` | `22–50` | `3–5` | `4` | `All Gear` | `airRes: +20..30%, acc: +2..3, min: +2, max: +3..4` |
| **6** | `Earthen` | `1–16` | `1–2` | `7` | `All Gear` | `earthRes: +8..12%, abs: +1` |
| **6** | `Granite` | `22–50` | `3–5` | `4` | `All Gear` | `earthRes: +20..30%, abs: +2..3, def: +2` |
| **7** | `Glimmering` | `1–18` | `1–2` | `8` | `Weapon, Helm, Ring, Amulet` | `mana: +5..10, pow: +4..6%` |
| **7** | `Luminescent` | `19–38` | `3–4` | `5` | `Weapon, Helm, Ring, Amulet` | `mana: +12..20, pow: +8..12%` |
| **7** | `Celestial` | `34–50` | `4–5` | `3` | `Weapon, Helm, Ring, Amulet` | `mana: +22..34, pow: +14..20%` |
| **8** | `Lucky` | `5–25` | `1–3` | `5` | `Helm, Boots, Gloves, Ring, Amulet` | `mf: +8..15%` |
| **8** | `Fortunate` | `26–50` | `3–5` | `3` | `Helm, Boots, Gloves, Ring, Amulet` | `mf: +16..28%` |

### 3.2 Suffix Pool

| Group | Affix Name | `ilvl` | Tier | Weight | Eligible Slots | Stat Ranges |
|:---:|---|:---:|:---:|:---:|---|---|
| **11** | `of Striking` | `1–16` | `1–2` | `10` | `Weapon, Gloves, Ring, Amulet` | `min: +1..2, max: +2..3` |
| **11** | `of Carnage` | `14–32` | `2–3` | `8` | `Weapon, Gloves, Ring, Amulet` | `min: +2..3, max: +4..6` |
| **11** | `of Slaughter` | `31–50` | `4–5` | `4` | `Weapon, Gloves, Ring, Amulet` | `min: +4..6, max: +7..10` |
| **12** | `of the Ox` | `1–16` | `1–2` | `10` | `All Gear` | `body: +1..2, hp: +8..14` |
| **12** | `of the Bear` | `15–36` | `2–4` | `7` | `All Gear` | `body: +2..3, hp: +18..28` |
| **12** | `of the Behemoth` | `33–50` | `4–5` | `4` | `All Gear` | `body: +3..5, hp: +32..48` |
| **13** | `of Dexterity` | `1–16` | `1–2` | `10` | `All Gear` | `agility: +1..2, acc: +1` |
| **13** | `of Grace` | `15–36` | `2–4` | `7` | `All Gear` | `agility: +2..3, acc: +2, def: +1` |
| **13** | `of Nirvana` | `33–50` | `4–5` | `4` | `All Gear` | `agility: +3..5, acc: +3..4, def: +2` |
| **14** | `of Thought` | `1–16` | `1–2` | `10` | `Weapon, Helm, Ring, Amulet` | `mind: +1..2, mana: +6..12` |
| **14** | `of Wisdom` | `15–36` | `2–4` | `7` | `Weapon, Helm, Ring, Amulet` | `mind: +2..3, mana: +14..24` |
| **14** | `of the Archmage` | `33–50` | `4–5` | `4` | `Weapon, Helm, Ring, Amulet` | `mind: +3..5, mana: +26..40, pow: +6..10%` |
| **15** | `of Health` | `1–16` | `1–2` | `8` | `Armor, Shield, Helm, Ring, Amulet` | `hp: +12..20, regen: +1` |
| **15** | `of Regeneration` | `15–36` | `2–4` | `6` | `Armor, Shield, Helm, Ring, Amulet` | `hp: +22..34, regen: +2` |
| **15** | `of Immortality` | `33–50` | `4–5` | `3` | `Armor, Shield, Helm, Ring, Amulet` | `hp: +38..55, regen: +3..4` |
| **16** | `of Protection` | `1–16` | `1–2` | `8` | `All Gear` | `allRes: +5..8%` |
| **16** | `of Warding` | `15–36` | `2–4` | `6` | `All Gear` | `allRes: +10..15%` |
| **16** | `of the Aegis` | `33–50` | `4–5` | `3` | `All Gear` | `allRes: +18..25%` |
| **17** | `of Alacrity` | `10–35` | `2–4` | `6` | `Weapon, Gloves` | `ias: +10..15%` |
| **17** | `of Quickness` | `28–50` | `4–5` | `3` | `Weapon, Gloves` | `ias: +18..25%` |
| **18** | `of the Apprentice` | `10–35` | `2–4` | `6` | `Weapon, Ring, Amulet` | `fcr: +10..15%` |
| **18** | `of the Magus` | `28–50` | `4–5` | `3` | `Weapon, Ring, Amulet` | `fcr: +18..25%` |
| **19** | `of the Leech` | `12–50` | `2–5` | `4` | `Weapon, Gloves, Ring` | `lifesteal: +3..7%` |
| **20** | `of Precision` | `15–50` | `2–5` | `4` | `Weapon, Gloves, Ring, Amulet` | `crit: +4..10%` |

---

## 4. Item Sets (Compatible with `src/sim/sets.ts` & `public/data/items.json`)

All 8 sets defined in `src/sim/sets.ts` are preserved with exact `id` keys and piece definitions. Set pieces are gated by `tier` / `ilvl` (`tier 2` drops from `ilvl 11+`, `tier 3` from `ilvl 21+`, `tier 4` from `ilvl 31+`, `tier 5` from `ilvl 41+`):

| Set ID | Set Name | Class | Tier (`ilvl`) | Pieces | 2-Piece Bonus | 3-Piece Bonus | 4-Piece Bonus (Full) | 5-Piece Bonus |
|---|---|---|---|---|---|---|---|---|
| `iron_warden` | Iron Warden's Bastion | Warrior | T3 (`21+`) | Visor (Helm), Tower (Shield), Hauberk (Armor), Greaves (Boots) | `+15 HP, +2 Def` | `+15% Fire/Earth Res, +2 Body` | `+50 HP, +4 Abs, +3 Body, +15% All Res` | — |
| `pyromancer` | Pyromancer's Ember-Veil | Mage | T3 (`21+`) | Ember-Weaver's Focus (Weapon), Robe of the Blazing Core (Armor), Heart of Cinders (Amulet) | `+25 Mana, +15% Pow, +20% Fire Res` | `+40 Mana, +30% Pow, +3 Mind, +15% All Res` | — | — |
| `shadow_stalker` | Shadow-Stalker's Garb | Both | T3 (`21+`) | Mist-Strider Boots (Boots), Night-Hunter Grip (Gloves), Dusk Shroud (Armor) | `+2 Agility, +3 Acc` | `+25 HP, +4 Min/Max, +20% Astral Res` | — | — |
| `alder_vanguard` | Alder Vanguard | Warrior | T2 (`11+`) | 4 pieces (Helm, Shield, Armor, Boots) | `+20 HP, +2 Def` | `+10% All Res, +2 Body` | `+40 HP, +3 Abs, +3 Min/Max` | — |
| `redmarsh_reaver` | Redmarsh Reaver | Warrior | T3 (`21+`) | 4 pieces (Weapon, Helm, Armor, Gloves) | `+3 Min/Max, +2 Acc` | `+25 HP, +15% Fire Res` | `+6 Min/Max, +3 Body, +5% Lifesteal` | — |
| `boreal_frostweaver` | Boreal Frostweaver | Mage | T3 (`21+`) | 4 pieces (Weapon, Helm, Armor, Boots) | `+20 Mana, +12% Pow` | `+25% Water Res, +2 Mind` | `+45 Mana, +25% Pow, +15% All Res` | — |
| `crown_forged` | Crown-Forged Panoply | Warrior | T5 (`41+`) | 5 pieces (Weapon, Shield, Helm, Armor, Boots) | `+35 HP, +4 Def` | `+20% All Res, +3 Body` | `+8 Min/Max, +5 Abs` | `+90 HP, +4 All Attr, +25% All Res` |
| `astral_sovereign` | Astral Sovereign's Regalia | Mage | T5 (`41+`) | 5 pieces (Weapon, Helm, Armor, Amulet, Ring) | `+35 Mana, +18% Pow` | `+25% All Res, +3 Mind` | `+15% FCR, +30% Pow` | `+80 Mana, +4 All Attr, +25% All Res` |

---

## 5. Sockets, Gems, Runes, Salvage & Smith Upgrades (`+1..+5`)

### 5.1 Sockets, Gems & Runes

- **Socket Generation:** Normal/Magic/Rare/Set/Unique items in `Weapon`, `Armor`, `Shield`, or `Helm` may roll `0..maxSockets(tier)` deterministically (`35%` chance for 1+ socket on common/magic/rare drops; `1` socket guaranteed on socket-capable Unique/Set items that define `sockets`).
- **Gems (`BUILTIN_GEMS` in `src/sim/item-types.ts`):** 5 gem families (`ruby`, `sapphire`, `topaz`, `emerald`, `skull`) × 5 qualities (`chipped`, `flawed`, `regular`, `flawless`, `perfect`).
- **Runes & Runewords (`src/sim/runes.ts`):** All 33 Runes (`id 1..33`, `Rune of Eldun` .. `Rune of Zodar`) and Runewords apply when inserted in exact sequence into `common` socketed gear with exact socket count.
- **Socket Punch (Smith / Cube):** Adding a socket to an unsocketed `Weapon`, `Armor`, `Shield`, or `Helm` costs `250 × tier` Gold + `2× Amber Essence`.

### 5.2 Salvage into Essences

Players can salvage unwanted gear at the Smithy (or via Camp Salvage) into deterministic **Essences**:

| Item Rarity | Essence Type | Quantity Formula | Gold Refund |
|---|---|---|:---:|
| `common` | `ash` (Ash Essence) | `1 + Math.floor(tier / 3)` | `5 × tier` |
| `magic` | `glimmer` (Glimmer Essence) | `1 + (affixCount >= 2 ? 1 : 0)` | `15 × tier` |
| `rare` | `amber` (Amber Essence) | `1 + Math.floor(tier / 2)` | `35 × tier` |
| `set` | `verdant` (Verdant Essence) | `1 + Math.floor(tier / 3)` | `60 × tier` |
| `unique` | `astral` (Astral Essence) | `1 + Math.floor(tier / 3)` | `100 × tier` |

### 5.3 Smith Upgrade (`+1..+5` with Deterministic Roll & Fail-Safe)

Any equipped or carried `Gear` item can be reinforced at the Smithy from `+0` up to `+5`:

- **Stat Gain per Upgrade Rank (`+1..+5`):**
  - **Weapons:** `+8%` base `min`/`max` damage (minimum `+1` per rank) and `+1 acc` at `+3` and `+5`.
  - **Armor / Shield / Helm / Boots / Gloves:** `+10%` base `def`/`abs` (minimum `+1` per rank) and `+5 hp` at `+2`, `+4`, `+5`.
  - **Rings / Amulets:** `+10%` base `pow`/`hp`/`mana` (minimum `+1` per rank).

- **Upgrade Table & Fail-Safe Pity:**

| Target Rank | Base Success | Gold Cost | Essence Cost | Pity Bonus per Fail | Fail Outcome |
|:---:|:---:|---|---|:---:|---|
| **`+0 → +1`** | `100%` | `100 × tier` | `2× Ash` | — | N/A |
| **`+1 → +2`** | `85%` | `250 × tier` | `2× Glimmer` | `+15%` | Item stays `+1` (no break, no downgrade) |
| **`+2 → +3`** | `70%` | `500 × tier` | `2× Amber` | `+15%` | Item stays `+2` (no break, no downgrade) |
| **`+3 → +4`** | `50%` | `1000 × tier` | `1× Verdant` | `+20%` | Item stays `+3` (no break, no downgrade) |
| **`+4 → +5`** | `30%` | `2000 × tier` | `1× Astral` | `+25%` | Item stays `+4` (no break, no downgrade) |

- **Deterministic Roll:**  
  `effectiveChance = Math.min(100, baseSuccess + upgradePity * pityBonusPerFail)`  
  Roll `Rng.int(100) < effectiveChance`.  
  - On **Success**: `upgradeLevel += 1`, `upgradePity = 0`.  
  - On **Fail**: `upgradePity += 1` (at `100%` effective chance, next attempt is guaranteed). Items are **never destroyed or downgraded**.

---

## 6. Class Skill Trees (3 Branches Each, Synergies & Gold Respec)

Each class has **3 specialized branches**, **7–8 Active Skills**, **Passives**, **Cross-Skill Synergies** (`+6%` effectiveness per rank in synergy skills), and **Hotkey Loadout** (`Q`, `W`, `E`, `R`, `T`, `RMB`). Heroes earn `1` Skill Point per level (`Lv 2..50` = `49` points total).

### 6.1 Warrior Skill Trees (`Berserker`, `Guardian`, `Warlord`)

**Existing `HeroSkillId` Mapping:** `whirlwind` → *Berserker (Whirlwind)*, `shield_charge` → *Guardian (Shield Charge)*, `iron_bulwark` → *Guardian (Iron Bulwark)*.

#### Branch A: `Berserker` (Offense, Bleed, Cleave)

| ID | Name | Type | Tier | Max Rank | Prereq | Effect & Scaling | Synergy From |
|---|---|:---:|:---:|:---:|---|---|---|
| `war_ber_1` | **Heavy Edge** | Passive | 1 | 5 | — | `+4%` melee damage per rank (`+20%` at 5) | — |
| `war_ber_2` | **Cleaving Arc** | **Active** | 1 | 5 | — | Sweeps `120°` arc, `115% + 12%/rank` weapon dmg; CD `3s`, Cost `8` Stamina | `war_ber_3` (`+6%/rank`) |
| `war_ber_3` | **Bloodlust** | Passive | 2 | 5 | `war_ber_1` | `+2%` lifesteal & `+4%` attack speed per rank | — |
| `war_ber_4` | **Whirlwind** | **Active** | 3 | 5 | `war_ber_2` | 360° spin (`2.5` tiles), `125% + 15%/rank` dmg; CD `6s`, Cost `18` Mana | `war_ber_2`, `war_ber_5` |
| `war_ber_5` | **Executioner's Blow** | **Active** | 4 | 5 | `war_ber_3`, `war_ber_4` | Heavy strike (`180% + 20%/rank` dmg; `+50%` vs `<35% HP`); CD `8s`, Cost `20` Mana | `war_ber_4` |

#### Branch B: `Guardian` (Defense, Shield, Crowd Control)

| ID | Name | Type | Tier | Max Rank | Prereq | Effect & Scaling | Synergy From |
|---|---|:---:|:---:|:---:|---|---|---|
| `war_grd_1` | **Riveted Plate** | Passive | 1 | 5 | — | `+2` Def and `+1` Abs per rank | — |
| `war_grd_2` | **Shield Charge** | **Active** | 1 | 5 | — | Dash up to `7` tiles, `90% + 10%/rank` dmg + `1.5s + 0.3s/rank` stun; CD `7s`, Cost `14` Mana | `war_grd_3` |
| `war_grd_3` | **Brace the Line** | Passive | 2 | 5 | `war_grd_1` | `+6%` block/missile reduction & `+15` max HP per rank | — |
| `war_grd_4` | **Iron Bulwark** | **Active** | 3 | 5 | `war_grd_2` | Grants `St.Shield` (`30 + 15/rank` absorb + Body scaling) & `+20%` All Res for `8s`; CD `14s`, Cost `22` Mana | `war_grd_1`, `war_grd_3` |
| `war_grd_5` | **Unbreakable** | Passive | 4 | 3 | `war_grd_3`, `war_grd_4` | Survive lethal blow once per battle at `15% + 10%/rank` HP (CD `90s`) | — |

#### Branch C: `Warlord` (Auras, Shouts, Mercenary Command)

| ID | Name | Type | Tier | Max Rank | Prereq | Effect & Scaling | Synergy From |
|---|---|:---:|:---:|:---:|---|---|---|
| `war_wrl_1` | **Battle Cry** | **Active** | 1 | 5 | — | AoE shout (`5` tiles): weakens enemy dmg by `10% + 3%/rank` for `8s`; CD `10s`, Cost `12` Mana | `war_wrl_3` |
| `war_wrl_2` | **Commander's Presence** | Passive | 2 | 5 | `war_wrl_1` | Hero & Mercenary gain `+3%` crit & `+2` Acc per rank | — |
| `war_wrl_3` | **War Banner** | **Active** | 3 | 5 | `war_wrl_1` | Plants banner (`6` tiles, `10s`): `+12% + 4%/rank` attack dmg & `+10%` IAS to allies; CD `18s`, Cost `25` Mana | `war_wrl_1`, `war_wrl_4` |
| `war_wrl_4` | **Rallying Roar** | **Active** | 4 | 5 | `war_wrl_2`, `war_wrl_3` | Restores `15% + 5%/rank` HP to Hero & Mercenary and cleanses slow/poison; CD `20s`, Cost `28` Mana | `war_wrl_3` |

**Warrior Totals:** `8` Active Skills (`Cleaving Arc`, `Whirlwind`, `Executioner's Blow`, `Shield Charge`, `Iron Bulwark`, `Battle Cry`, `War Banner`, `Rallying Roar`) + `6` Passives.

---

### 6.2 Mage Skill Trees (`Pyromancer`, `Cryomancer`, `Shadowcaller`)

**Existing `HeroSkillId` Mapping:** `chain_lightning` / `frost_nova` / `teleport` map cleanly (`frost_nova` → *Cryomancer (Frost Nova)*, `teleport` → *Shadowcaller (Phase Blink)*, `chain_lightning` supported as an arcane/storm legacy or `Pyromancer`/`Shadowcaller` bridge).

#### Branch A: `Pyromancer` (Fire AoE, Burn DoT, Explosive Burst)

| ID | Name | Type | Tier | Max Rank | Prereq | Effect & Scaling | Synergy From |
|---|---|:---:|:---:|:---:|---|---|---|
| `mag_pyr_1` | **Kindled Mastery** | Passive | 1 | 5 | — | `+5%` Fire Spell Power & `+4%` Fire Res per rank | — |
| `mag_pyr_2` | **Cinder Bolt** | **Active** | 1 | 5 | — | Fast fire projectile (`18 + 8/rank` dmg + `4/rank` burn over `3s`); CD `1.2s`, Cost `8` Mana | `mag_pyr_3` |
| `mag_pyr_3` | **Searing Heat** | Passive | 2 | 5 | `mag_pyr_1` | Burning targets take `+6%` dmg per rank from all sources | — |
| `mag_pyr_4` | **Fireball Volley** | **Active** | 3 | 5 | `mag_pyr_2` | Explosive orb (`2.5` tile radius, `32 + 12/rank` fire dmg); CD `4s`, Cost `20` Mana | `mag_pyr_2`, `mag_pyr_5` |
| `mag_pyr_5` | **Meteor Shower** | **Active** | 4 | 5 | `mag_pyr_3`, `mag_pyr_4` | Calls 3 meteors (`4` tile zone, `50 + 18/rank` fire dmg + scorched ground); CD `10s`, Cost `36` Mana | `mag_pyr_4` |

#### Branch B: `Cryomancer` (Frost Control, Chill/Freeze, Mana Efficiency)

| ID | Name | Type | Tier | Max Rank | Prereq | Effect & Scaling | Synergy From |
|---|---|:---:|:---:|:---:|---|---|---|
| `mag_cry_1` | **Permafrost** | Passive | 1 | 5 | — | `+5%` Water/Cold Power & `+10%` chill duration per rank | — |
| `mag_cry_2` | **Frost Nova** | **Active** | 1 | 5 | — | 360° ice pulse (`3.5` tiles, `20 + 8/rank` cold dmg + `4s + 0.5s/rank` slow); CD `6s`, Cost `16` Mana | `mag_cry_3` |
| `mag_cry_3` | **Ice Armor** | **Active** | 2 | 5 | `mag_cry_1` | Grants `+3 + 2/rank` Def, `+15%` Cold Res & chills attackers for `20s`; CD `12s`, Cost `18` Mana | `mag_cry_1` |
| `mag_cry_4` | **Glacial Spike** | **Active** | 3 | 5 | `mag_cry_2` | Piercing lance (`36 + 13/rank` cold dmg, `1.5s` freeze on primary); CD `4.5s`, Cost `22` Mana | `mag_cry_2`, `mag_cry_5` |
| `mag_cry_5` | **Shatter Mastery** | Passive | 4 | 3 | `mag_cry_3`, `mag_cry_4` | `+10%` crit chance per rank against chilled/frozen enemies | — |

#### Branch C: `Shadowcaller` (Astral/Shadow Bolts, Mobility, Drain & Summon)

| ID | Name | Type | Tier | Max Rank | Prereq | Effect & Scaling | Synergy From |
|---|---|:---:|:---:|:---:|---|---|---|
| `mag_shd_1` | **Astral Conduit** | Passive | 1 | 5 | — | `+12` Max Mana & `+4%` Faster Cast Rate per rank | — |
| `mag_shd_2` | **Phase Blink** | **Active** | 1 | 5 | — | Instant teleport up to `7 + 0.5/rank` tiles, drops aggro; CD `7s - 0.5s/rank`, Cost `16` Mana | `mag_shd_1` |
| `mag_shd_3` | **Soul Siphon** | **Active** | 2 | 5 | `mag_shd_1` | Drains `24 + 9/rank` astral dmg, restores `35%` as HP/Mana; CD `6s`, Cost `18` Mana | `mag_shd_4` |
| `mag_shd_4` | **Chain Arc** | **Active** | 3 | 5 | `mag_shd_2`, `mag_shd_3` | Lightning/Astral arc hitting up to `5` foes (`28 + 10/rank` dmg); CD `5s`, Cost `24` Mana | `mag_shd_3` |
| `mag_shd_5` | **Shade Pact** | Passive | 4 | 3 | `mag_shd_3`, `mag_shd_4` | Kills restore `4 + 3/rank` Mana and reduce active cooldowns by `0.5s` | — |

**Mage Totals:** `8` Active Skills (`Cinder Bolt`, `Fireball Volley`, `Meteor Shower`, `Frost Nova`, `Ice Armor`, `Glacial Spike`, `Phase Blink`, `Soul Siphon`, `Chain Arc` — 9 actives / 6 passives if counting `Chain Arc`, or `8` core actives + `6` passives) — all deterministic and cooldown-tracked in integer sim ticks (`25 ticks/sec`).

### 6.3 Gold Respec Formula (Town Alchemist / Guildmaster)

At any Town hub, the hero can reset all allocated `skillRanks` and refund all `Skill Points`:

```ts
respecCost(level: number, respecCount: number): number {
  const base = 100 * Math.max(1, level);
  const mult = Math.min(8, 1 + respecCount); // 1x, 2x, 3x ... capped at 8x
  return base * mult;
}
```
- **Deterministic:** Respec executes as a sim/town command, deducts `gold`, zeroes `skillRanks`, clears `skillLoadout` to defaults, increments `respecCount += 1`, and restores `skillPoints = Math.max(0, level - 1)`.
