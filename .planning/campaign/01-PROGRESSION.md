# CAMPAIGN PROGRESSION, BALANCE & ROSTER SCHEMA (`01-PROGRESSION`)

## 1. Experience & Level Curve Across the 4 Huge Maps (Levels 1–50)

### 1.1 Mathematical XP Formula (`src/sim/hero.ts`)
- **Level-Up Threshold**: `XP_to_Next(L) = Math.round(100 * Math.pow(L, 1.8))`
- **Per-Level Rewards**: `+5 Stat Points` (allocatable across `Body`, `Agility`, `Mind`, `Spirit`), full `HP/MP` restoration, and use-based skill rank cap scaling (`Rank = min(10, floor(Level / 4) + 2)`).
- **Monster XP Yield**: `BaseXP(tier, archetype) * (1 + 0.35 * (tier - 1))`, with `+150%` bonus for Champion packs, `+300%` for Super-Uniques, and `+600%` for Act Bosses.

### 1.2 Map-by-Map & Region-by-Region Progression Matrix

| Map & Act | City Hub (`tiers`) | Region 1 | Region 2 | Region 3 | Region 4 | Region 5 | Region 6 (Finale) | Target End Level |
|-----------|--------------------|----------|----------|----------|----------|----------|-------------------|------------------|
| **Map 1: Border Fords** (`Act I`) | **Thornwick Market** (`[1, 3]`) | Sunken Ford (`Lv 1–2`) | Fenwick Peat & Lantern (`Lv 2–4`) | Greywood & Kilns (`Lv 4–6`) | Craghorn & Alder Bridge (`Lv 6–8`) | Ravenwatch & Ossuary (`Lv 8–10`) | Undervault & Ashbrook (`Lv 10–12`) | **Lv 12** (~18,500 cumulative XP) |
| **Map 2: Redmarsh Wastes** (`Act II`) | **Redmarsh Outpost** (`[2, 4]`) | Ochre Ditch & Corduroy (`Lv 12–14`) | Twin Passes & Bracken (`Lv 14–16`) | Quartz Plateau & Oasis (`Lv 16–18`) | Third-Dynasty Salt-Vaults (`Lv 18–20`) | Deep Quarry Terraces (`Lv 20–22`) | Fork of Spears & Ironheart (`Lv 22–24`) | **Lv 24** (~92,000 cumulative XP) |
| **Map 3: Iron Coast** (`Act III`) | **Oakhaven Harbor** (`[3, 5]`) | Cinder Wards & Orchard (`Lv 24–26`) | Greywash & Riverlock (`Lv 26–28`) | Hourglass Spit & Caves (`Lv 28–30`) | Sunken Citadel & Choir (`Lv 30–32`) | Starved Bastion & Cliffs (`Lv 32–34`) | Burning Harborwatch (`Lv 34–36`) | **Lv 36** (~245,000 cumulative XP) |
| **Map 4: Obsidian Caldera** (`Act IV`) | **Ironcamp Forge-Hold** (`[4, 5]`) | Basalt Highway & Beacons (`Lv 36–38`) | Besieged Wall & Ashveil (`Lv 38–40`) | Magnetic Narrows & Barbican (`Lv 40–42`) | Gauntlet & Greystone (`Lv 42–44`) | Three-Roads & Threshold (`Lv 44–46`) | Colonnade & Obsidian Dais (`Lv 46–50`) | **Lv 48–50** (~480,000 cumulative XP) |

---

## 2. Itemization, Runes & Equipment Curve (Tiers 1–5)

### 2.1 Base Gear & Quality Progression
| Phase / Map | Shop & Drop Tiers | Expected Gear Quality | Gems & Runes (`src/sim/runes.ts`, `cube.ts`) | Target Resistances & Defense |
|-------------|-------------------|-----------------------|----------------------------------------------|------------------------------|
| **Map 1 (Lv 1–12)** | **Tier 1 -> Tier 2** (Boss drops **Tier 3**) | White / Superior -> Magic (Blue, 1–2 affixes) -> First Rare (Yellow) & Morvessa Unique Ring | Chipped & Flawed Gems; Runes `#1–#8` (`El`–`Ral` equivalents); 2-socket Runewords (`Steel`, `Stealth`, `Leaf`) | `20–35%` Poison (`Earth`) & Lightning (`Air`) Res; `12–25` Defense; `4–8` Armor Abs |
| **Map 2 (Lv 12–24)** | **Tier 2 -> Tier 3** (Boss drops **Tier 4**) | Magic / Rare -> First 2-piece Set bonus -> 3-socket Runewords (`Lore`, `Ancient's Pledge`, `Rhyme`) | Standard Gems; Runes `#9–#17` (`Ort`–`Lum` equivalents); Cube 3-to-1 gem & low-rune upgrades | `45–60%` Lightning (`Air`), Cold (`Water`) & Poison (`Earth`) Res; `30–50` Defense; `10–16` Abs |
| **Map 3 (Lv 24–36)** | **Tier 3 -> Tier 4** (Boss drops **Tier 4–5**) | Rare (4–6 affixes) -> 3-piece Set bonus -> 4-socket Runewords (`Spirit`, `Insight`, `Smoke`) | Flawless Gems; Runes `#18–#24` (`Ko`–`Ist` equivalents); Cube socket-punching recipes | `65–75%` Cold (`Water`), Lightning (`Air`) & Fire Res; `55–80` Defense; `18–26` Abs |
| **Map 4 (Lv 36–50)** | **Tier 4 -> Tier 5** (Endgame Masterworks) | Full 4-piece Class Sets, Tier 5 Uniques (*Cinder-Vein Greatsword*, *Thorn Staff*, *Obsidian Bulwark*), High Runewords (`Fortitude`, `Grief`, `Infinity`, `Enigma` equivalents) | Perfect Gems; High Runes `#25–#33` (`Gul`–`Zod` equivalents); Star-Iron Foundry tempering (`SQ4-01`) | `75%` Capped All Resistances (`80–85%` Fire Res with +Max Fire gear); `90–130` Defense; `30+` Abs |

### 2.2 Attribute Gating (`need` / `needv` in `public/data/items.json`)
- Every item tier enforces an attribute requirement (`Body` for Warrior weapons/plate/shields, `Mind` for Mage staves/robes/hats):
  - **Tier 1**: `needv: 3–5` (Base starting attributes)
  - **Tier 2**: `needv: 7–8` (~Lv 4–6)
  - **Tier 3**: `needv: 11–12` (~Lv 12–16)
  - **Tier 4**: `needv: 14–15` (~Lv 24–28)
  - **Tier 5**: `needv: 17–20` (~Lv 36–40)
- **Why This Matters for Skirmish Carryover**: Even if a low-level hero finds or trades a high-tier item in Skirmish, they cannot equip Tier 4–5 gear until their core attributes (`Body` or `Mind`) reach `14–17+` through legitimate leveling.

---

## 3. Hero Class Balance (`Warrior` vs. `Mage` + 1 Mercenary Companion)

### 3.1 Single-Hero + 1 Mercenary ARPG Paradigm
- The player controls **one Hero** (`Unit 0`, `Kind.Hero`) and may hire **at most one active Mercenary Companion** from the current City Hub Tavern (`Thornwick Levyman` / `Alder Poacher` in Act I; `Salt Mercenary` / `Tomb Notary` in Act II; `Oakhaven Marine` / `Storm Channeler` in Act III; `Ironcamp Halberdier` / `Ash Battlemage` in Act IV).
- **Mercenary Synergy**:
  - A **Warrior Hero** pairs naturally with an **Archer** (`Alder Poacher`, `Harbor Arbalest`, `Slag-Hound Sniper`) or **Support Mage** (`Lantern Novice`, `Tomb Notary`, `Storm Channeler`) who provides ranged elemental damage, `Blessing`, and `Healing`.
  - A **Mage Hero** pairs naturally with a **Heavy Frontline Mercenary** (`Thornwick Levyman`, `Salt Mercenary`, `Oakhaven Marine`, `Ironcamp Halberdier`) who holds chokepoints with `Defiance` / `Might` aura while the Mage casts from 6–8 tiles back.

### 3.2 Warrior Balance Curve (`CLS_WARRIOR`)
- **Primary Attributes**: `Body` (+HP, +Melee Min/Max Damage, +Armor Weight Capacity, +Shield Block) & `Agility` (+Attack Rating `Acc`, +Dodge `Def`, +Attack Speed IAS / Hit Recovery FHR).
- **Use-Based Skills**: `Blade` / Melee weapon proficiency (+% Blow Damage & Attack Rating per rank) and `Guard` (+Defense & +Armor Absorption per rank).
- **Active Combat Kit (`spells.json` `cls: 1` & `cls: 4`)**:
  - *Gap-Closer & Crowd Control*: `Shield Bash` (stun `St.Stone`), `Hamstring Cut` (`St.Slow`).
  - *AoE Wave Clear*: `Cleave Arc` (3-target frontal arc) and `Whirlwind Maul` (360° 2-tile spin).
  - *Sustain & Boss Single-Target*: `Grit Through Pain` (self-heal scaling with `Body`), `Sunder Plate`, and `Executioner's Blow` (+Crushing Blow / Deadly Strike synergy).
- **Map Challenge Checks for Warrior**:
  - Must stack `Lightning Resistance` against `Krazak` (Map 1) and `Vekor` (Map 2) Charged Bolt Novas when striking in melee.
  - Must use `Shield Bash` / `Iron Skin` and `Life Leech` to survive `Gorrathul's` `Holy Freeze` aura (Map 2) and `Ashkarath's` `Hellfire Breath` (Map 4).

### 3.3 Mage Balance Curve (`CLS_MAGE`)
- **Primary Attributes**: `Mind` (+Spell Power `Pow` %, +Max Mana, +Spell Accuracy) & `Spirit` (+Mana Regeneration/sec, +Astral/Curse Resistance, +Buff/Debuff Duration).
- **Use-Based Skills**: Five Elemental Schools (`Fire`, `Water`, `Air`, `Earth`, `Astral`)—each rises with cast count, reducing mana cost and increasing school damage/duration by `+4%` per rank.
- **Active Combat Kit (`spells.json` `cls: 2` & shared schools)**:
  - *Single-Target Burst*: `Fire Bolt`, `Cinder Lance`, `Lightning`, `Vitrify`.
  - *AoE & Control*: `Frost Bolt` / `Ice Storm` / `Blizzard` (`St.Slow` chill), `Chain Lightning` (4-target bounce), `Meteor`, `Acid Rain` (`St.Poison`), `Stone Curse` (`St.Stone`).
  - *Defensive & Utility*: `Wind Ward` / `Stone Skin` / `Iron Skin` (damage-absorbing `St.Shield`), `Time Warp` / `Haste`, `Meditation` (rapid mana recovery), `Corpse Burst` (denies enemy `shaman_reviver` resurrection!).
- **Map Challenge Checks for Mage**:
  - Enemies with `magic_resistant` (e.g., `Morvessa`, `Malgath`, `Zulmar`, `Kragg`) and Nightmare/Hell elemental immunities require the Mage to weave **dual-school spells** (e.g., `Water` + `Air` or `Fire` + `Earth` + `Corpse Burst`) and rely on their frontline Mercenary for physical damage.

---

## 4. Skirmish Integration & Carryover Rules

### 4.1 Skirmish Hero Selection Flow (`src/shell.ts` -> `?randskirmish=...&char=<id>`)
1. When opening the **Skirmish Setup Modal** in `src/shell.ts`, the player sees a **Hero Picker** populated from `listCharacters()` (`src/characters.ts`).
2. Each selectable hero shows their **Name, Class, Level, Difficulty tier, and Equipped Power / Key Items**, alongside an option to play with a temporary default template if no saved heroes exist.
3. Launching the random skirmish map passes `?randskirmish=<seed>&biome=<biome>&players=<n>&char=<id>`, loading the chosen hero's attributes, skills, inventory, equipment, known spells, and gold via `characterCarry(char)`.

### 4.2 Authoritative Write-Back Rule (Recorded in `PROGRESS.md`)
When a Skirmish match finishes (`finish()` in `src/main.ts`):
- **SAVED BACK TO HERO (`YES`)**:
  - **Experience & Level (`level`, `xp`, `statPoints`, `attrs`, `skills`)**: Any XP and skill-use ranks earned during the skirmish battle persist.
  - **Inventory, Equipment & Learned Spells (`inv`, `eq`, `known`, `knownHi`)**: Any loot drops picked up, items crafted/socketed, or spells learned from scrolls persist in the hero's pack.
  - **Gold (`gold`) & Games Played (`played`)**: Net gold earned (capped at `+2,500 Gold` net gain per skirmish run to prevent infinite passive gold-mine farming from breaking town shop progression) and `played + 1` persist.
- **NEVER MODIFIED BY SKIRMISH (`NO`)**:
  - **Campaign Node & Unlock Graph (`CampaignProgress.unlocked`, `completed`, `node`, `waypoints`, `townPortal`)**: Untouched.
  - **Campaign Roster Progress Fields (`furthestMapId`, `furthestMapTitle`, `furthestRegion`, `actReached`, `completedQuests`, `bossesSlain`, `endingUnlocked`)**: Untouched.
  - **Campaign Scenario Variables (`st.sv`)**: Untouched.

---

## 5. Character Roster Persistence Schema (`src/characters.ts` v2 Migration)

### 5.1 How Heroes Appear in the Character Selector (Roster Screen)
The Character Selector displays up to **8 Hero Cards** (`MAX_CHARS = 8`) plus a **"Create New Hero"** card (with a visible `N / 8 Heroes` counter). Each hero card displays at a glance:
1. **Visual Portrait & Class Crest**: Full-body or framed class portrait (`hero-dain.png`, `hero-selena.png`, `hero-valerius.png`, `hero-morrigan.png`), Name, Class (`Warrior` / `Mage`), Level (`Lv 1..50`), and Difficulty Badge (`Easy` / `Normal` / `Hard` / `Nightmare` / `Hell`).
2. **Where They Reached (`Campaign Progress`)**:
   - **Act & Furthest Map**: e.g., `"Act II · The Redmarsh Wastes"`
   - **Furthest Region / Landmark**: e.g., `"Quartz Plateau & Wardstone Ring"` (or `"freshly mustered at Thornwick"` for a brand-new hero).
   - **Quest & Boss Tally**: e.g., `"19 / 48 Quests · Slain: Morvessa"` (or Sovereign crown badge if `endingUnlocked !== 'none'`).
3. **What They Found (`Key Items Showcase`)**:
   - Up to **4 Key Item Badges** (`keyItems`) showing the highest-tier Unique, Set, Runeword, or Boss Trophy items currently equipped or held by that hero (e.g., *Morvessa's Brass Seal Ring*, *Cinder-Vein Greatsword*, *Galvanic Copper Aegis*), with custom gothic hover tooltips (`tipOn`, zero native `.title`).

### 5.2 Exact TypeScript Fields for `Character` (`v: 2` Envelope)

```ts
export interface KeyItemSummary {
  name: string;        // e.g. "Morvessa's Brass Seal Ring"
  tier: number;        // 1..5
  rarity: 'normal' | 'magic' | 'rare' | 'set' | 'unique' | 'runeword' | 'quest';
  slot?: string;       // e.g. "ring", "weapon", "shield", "trophy"
  icon?: string;       // optional slug in public/itemicons/<slug>.png
}

export interface CharacterProgressSummary {
  actReached: 1 | 2 | 3 | 4;
  furthestMapId: string;       // e.g. "map1-border-fords" or "m16-wardstone-rupture"
  furthestMapTitle: string;    // e.g. "Map I: The Border Fords"
  furthestRegion: string;      // e.g. "Ravenwatch Keep & Weeping Ossuary"
  completedQuests: number;     // count of completed campaign nodes / objectives
  totalQuests: number;         // default 48 (12 quests x 4 huge maps)
  bossesSlain: string[];       // subset of ['morvessa', 'gorrathul', 'vesperion', 'ashkarath']
  endingUnlocked: 'none' | 'crown-of-order' | 'ember-reckoning';
  keyItems: KeyItemSummary[];  // top 4..6 notable items equipped/carried, sorted by rarity & tier
  updatedAt: number;           // epoch ms of last save
}
```

### 5.3 Save Migration Rule (`v: 1` -> `v: 2`)
- When loading an existing `v: 1` roster from `localStorage` / IndexedDB (`src/savedb.ts` / `src/characters.ts`), any `v: 1` character record without `progress` is automatically migrated in-place to `v: 2` with safe defaults derived from its existing `carry` inventory:
  - `actReached: 1`
  - `furthestMapId: 'm01-blood-at-the-ford'`
  - `furthestMapTitle: 'Act I: The Border Fords'`
  - `furthestRegion: 'Thornwick Frontier'`
  - `completedQuests: char.played ?? 0`
  - `bossesSlain: []`
  - `endingUnlocked: 'none'`
  - `keyItems`: extracted automatically by scanning the hero's equipped (`eq`) and inventory (`inv`) items for the highest-tier items (`tier >= 2` or unique/set names).
