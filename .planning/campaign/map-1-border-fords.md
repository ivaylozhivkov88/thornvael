# MAP 1 DESIGN: THE BORDER FORDS & WEEPING OSSUARY (`map-1-border-fords`)

## 1. Macro Map Specification & Topology

- **Map ID**: `map1-border-fords` (consolidating Act I nodes `m01`–`m11`, `town-thornwick`, and `weeping-ossuary` into one seamless huge world map with subterranean vault entrance).
- **Dimensions**: `192 x 192` tiles (`36,864` tiles, 12x12 terrain chunks of 16x16 tiles; validated within `MAX_SIDE = 1024` in `src/mapdoc.ts`). Subterranean vault `weeping-ossuary` is either a seamless corner cavern (`x: 140..186, y: 8..46`) or a linked `64 x 64` sub-map via `ZoneExitDef`.
- **Primary Biome & Theme**: `forest` (`setTerrainTheme('forest', seed)`), blending `Terrain.Grass` (0), `Terrain.Dirt` (1), `Terrain.Water` (2), `Terrain.Rock` (3), and `Terrain.Marsh` (4) with soft-edged feature zones from `BIOME_ZONES.forest` (`crypt`, `highland`) and `BIOME_ZONES.marsh` (`ruinstone`).
- **Time of Day & Weather**: Starts at `day: 0` (cold drizzle morning over Sunken Ford), cycling dynamically through dusk and nightfall as the hero pushes toward Ravenwatch and Ashbrook.
- **City Hub Position**: **Thornwick Market (`town-thornwick`)** sits inside the fortified timber palisade bend of the western Alder River (`x: 12..44, y: 76..112`).

---

## 2. The City Hub & Six Named Regions

| # | Region Name | Bounds `(x1,y1)..(x2,y2)` | Req. Hero Level | Biome & Feature Zones (`BIOME_ZONES`) | Key Objects (`objects.json`), Shrines & Waypoints |
|---|-------------|---------------------------|-----------------|---------------------------------------|--------------------------------------------------|
| **0** | **Thornwick Market (City Hub)** | `(12, 76)..(44, 112)` | **Lv 1** | `forest` (cleared dirt bailey, timber palisades) | Tavern (`House 0`), Armory Shop (`House 1`, tiers `[1,3]`), Runic Academy (`House 2`), Waypoint `wp-thornwick`, `camp/palisade`, `camp/banner`, `camp/fire` |
| **1** | **Sunken Ford & Willow Weirs** | `(45, 72)..(104, 128)` | **Lv 1–2** | `forest` + river shallows; zone: `highland` | Burned Tollhouse (`House 3`), Plundered Supply Wagons (`camp/crates`), Eel-Weir Stakes, Healing Shrine `(64,96)`, Adventure `watermill` `(54,82)`, Waypoint `wp-sunken-ford` `(74,98)` |
| **2** | **Fenwick's Peat & Lantern Passage** | `(45, 129)..(118, 184)` | **Lv 2–4** | `marsh`; zone: `ruinstone` | Plank Boardwalks, 5 Iron-Caged Oil Beacons (`camp/fire`), Keeper Soren's Hut (`House 4`), Mana Shrine `(82,154)`, Adventure `magic_well` `(70,146)`, Waypoint `wp-lantern-passage` `(96,162)` |
| **3** | **Greywood Canopy & Vitrified Kilns** | `(16, 12)..(108, 71)` | **Lv 4–6** | `forest`; zone: `highland` | Greywood Sawmill (`House 5`), 3 Raider Supply Depots (`camp/tent`, `camp/crates`, `camp/rack`), Burned Border Mint & Vitrified Slag Kilns `(32,28)`, Combat Shrine `(68,42)`, Adventure `windmill` `(40,52)`, Waypoint `wp-greywood` `(58,36)` |
| **4** | **Craghorn Defile & Alder Bridge** | `(105, 64)..(180, 132)` | **Lv 6–8** | `highlands` (`skin-highland.png`); zones: `crypt`, `snow` | Northern & Southern Ley-Cairns (`highland/standing-stone`, `rocks/crystal`), Three-Arch Alder Bridge `(138,96)`, Granite Quarry `(162,114)`, Armor Shrine `(132,88)`, Waypoint `wp-alder-bridge` `(128,96)` |
| **5** | **Ravenwatch Keep & Weeping Ossuary** | `(109, 12)..(186, 63)` | **Lv 8–10** | `crypt` (`skin-crypt.png`); zone: `ruinstone` | Ravenwatch Courtyard (`ruins/wall`, `ruins/arch`), 3 Bone Totems (`bones/skullspike`), Probate Scriptorium, Weeping Ossuary Sanctum (`bones/sarcophagus`, `bones/tombstone`), Ward Shrine `(144,44)`, Adventure `creature_bank` `(168,32)`, Waypoint `wp-ravenwatch` `(136,48)` |
| **6** | **Undervault Links & Ashbrook Gate** | `(119, 133)..(186, 186)` | **Lv 10–12** | `highlands` / `crypt`; zone: `ruinstone` | Dwarven Gallery Four Sluice-Gates `(134,152)`, Ashbrook Manor Granary (`House 6`), Southern Siege Gatehouse `(172,174)`, Haste Shrine `(154,160)`, Waypoint `wp-ashbrook` `(160,168)`, Exit `road` to Map 2 `(180,182)` |

### 2.1 Road & Chokepoint Network
- **The Old Mint Road (West–North)**: Connects Thornwick N-Gate `(28, 76)` to the Vitrified Kilns `(32, 28)` and Greywood Sawmill `(58, 36)`.
- **The Alder Highway (West–East Spine)**: Runs from Thornwick E-Gate `(44, 94)` across Sunken Ford `(74, 98)` to the triple-arched stone bottleneck of **Alder Bridge** `(138, 96)`.
- **The Plank-Walk & Ravine Trail (South)**: Branches south from Sunken Ford into Fenwick's Peat boardwalks `(70, 146)`, threading through the narrow cliff walls of **Lantern Passage** `(96, 162)` and the subterranean **Undervault Links** `(134, 152)` to **Ashbrook Gatehouse** `(172, 174)`.
- **The Craghorn Switchbacks (North-East)**: Twin mountain passes (`x: 116, y: 68` and `x: 132, y: 68`) leading from Greywood and Alder Bridge up to **Ravenwatch Keep** and the **Weeping Ossuary** `(164, 24)`.

---

## 3. Enemy Roster, Super-Uniques & Boss Balance

All enemies strictly reference existing sprite atlases in `public/sprites/` and families in `public/data/monsters.json`:

| Region | Regular Monster Families (`monsters.json`) | Palette Tiers | Mini-Boss / Super-Unique (`super-uniques.ts`) | Tactical AI & Affixes |
|--------|--------------------------------------------|---------------|-----------------------------------------------|-----------------------|
| **1. Sunken Ford** | `briar-hound` (Fast rusher), `gnoll` (Raider), `quill-fiend` (Quill sniper) | Tiers `1–2` (Verdant / Ochre) | **Chieftain Grok'tar** (`gnoll` VIP, Tier 3, HP 165) | Frontline hound swarm + ridge snipers; Grok'tar has 15-tick windup cleave + `extra_strong` |
| **2. Fenwick's Peat & Lantern Passage** | `mire-wisp` (Water caster), `flintback` (Armoured shell), `fallen-shaman` (`cinder-shaman`), `cinderling` | Tiers `2–3` (Ochre / Copper) | **Malgath, Chanter of the Pyre** (`pyre-chanter-malgath`, Tier 4 `fallen-shaman`) | `shaman_reviver` AI: casts `Resurrect` (15s CD) on 5x `cinderling` retinue + `Fire Bolt` + `Weaken`; `fire_enchanted`, `magic_resistant` |
| **3. Greywood & Vitrified Kilns** | `thorn-boar` (Charger), `briar-hound`, `quill-fiend`, `gloom-stag` (Astral flanker), `rootbound` | Tiers `2–3` (Ochre / Copper) | **Krazak, the Volt Stalker** (`volt-stalker-krazak`, Tier 4 `briar-hound`) & **Skara, Matron of Frostquills** (`frostquill-skara`, Tier 4 `quill-fiend`) | Krazak: `berserker_charger`, `lightning_enchanted` Charged Bolt Nova, `extra_fast`; Skara: `ranged_kiter`, `cold_enchanted`, `extra_strong` |
| **4. Craghorn & Alder Bridge** | `rootbound` (Earth sentinel), `ironbark` (Ward treant), `pale-burrower` (Quarry tunneler), `golem` | Tiers `3–4` (Copper / Cobalt) | **Thornmaw the Ironroot / Krag Ironhide** (`bramblefist-oakhulk`, Tier 5 `ironbark`) | `juggernaut_tank` AI: bodyblocks chokepoints, `extra_strong`, `stone_skin`, `cursed`, 3x `rootbound` retinue |
| **5. Ravenwatch & Weeping Ossuary** | `ruin-mite` (Burrower swarm), `hollow-knight` (Undead blade), `fallen-shaman`, `quill-fiend` | Tiers `3–4` (Copper / Cobalt) | **Mordred the Ashen** (Tier 4 `hollow-knight` coven prelate) & **Act Boss: Morvessa, the Silk Widow** (`morvessa`, Tier 5, Base HP 460 x 2.9) | Morvessa: `Poison Spray` cone DoT, `Spine Lash` knockback/slow, `Brood Hatch` summons `ruin-mite` waves at 66%/33% HP; `extra_fast`, `magic_resistant` |
| **6. Undervault & Ashbrook Gate** | `hollow-knight`, `pale-burrower`, `flintback`, `ash-weaver` (Flame hexer) | Tiers `4` (Cobalt) | **Siege Commander Vaelen** (Tier 4 `hollow-knight`, `blessed_aura`, `stone_skin`) | Coordinated 3-wave gatehouse assault with `ash-weaver` backline and `flintback` rams |

---

## 4. Story Missions & Side Quests (12 Quests Total)

### 4.1 Main Story Campaign Chain (6 Quests)

1. **`MQ1-01: Blood at the Ford`** (Region 1, Lv 1–2)
   - **Objective**: Relieve Ford-Scout Bren at Sunken Ford `(74, 98)`, reclaim the burned tollhouse ledger, and slay **Chieftain Grok'tar** on the eastern command bluff `(96, 88)`.
   - **Lore Item Found**: *Alder Ford Toll Daybook* (`book-ford-toll-daybook`) & *Waterlogged Courier Tube* (`book-weir-courier-note`), proving Grok'tar was paid in stamped Border Mint copper to destroy tax records.
2. **`MQ1-02: Whispers in the Fen & Lantern Passage`** (Region 2, Lv 2–4)
   - **Objective**: Escort Courier Corin along the rotting boardwalks of Fenwick's Peat, relight the 3 extinguished whale-oil cages in Lantern Passage `(96, 162)`, and slay **Malgath, Chanter of the Pyre**.
   - **Lore Item Found**: *Peat-Cutter's Warning* (`book-fen-boardwalk-notice`) & *Lantern-Keeper's Almanac* (`book-hermit-wick-ledger`).
3. **`MQ1-03: Nightfall at Ravenwatch`** (Region 5 Outer Courtyard, Lv 6–8)
   - **Objective**: Hold Ravenwatch Keep's broken portcullis `(136, 48)` against the midnight assault, execute the four traitorous pickets who pulled the ditch stakes, and shatter the 3 Bone Totems channeling witchfire into the bailey.
   - **Lore Item Found**: *Ravenwatch Relief Roster* (`book-ravenwatch-duty-roster`).
4. **`MQ1-04: The Sunken Sanctum & Weeping Ossuary`** (Region 5 Vault, Lv 8–10)
   - **Objective**: Descend the subterranean stairs beneath Ravenwatch `(156, 24)`, cross the narrow probate bridges over black water to slay **Mordred the Ashen**, and purge **Morvessa, the Silk Widow** inside the Weeping Ossuary `(168, 20)`.
   - **Lore Item Found**: *Sunken Sanctum Lien-Roll* (`book-abbey-probate-register`) & *Morvessa's Brass Seal Ring* (Unique Tier 3 Ring).
5. **`MQ1-05: Three Waves at Alder Bridge`** (Region 4, Lv 8–10)
   - **Objective**: Rekindle the Northern and Southern Ley-Cairns in Craghorn Defile `(116, 68)` and `(132, 68)` to wake the frontier wards, then hold the western cutwater of **Alder Bridge** `(138, 96)` through three raider assault waves while three thousand parish refugees cross south.
   - **Lore Item Found**: *Alder Bridge Survey Notes* (`book-alder-mason-plaque`) & *Split Column Dispatch* (`book-vanguard-march-orders`).
6. **`MQ1-06: Ash on the Southern Road`** (Region 6, Lv 10–12)
   - **Objective**: Breach the lead-sealed drainage galleries of the **Undervault Links** `(134, 152)`, relieve Captain Garrick at **Ashbrook Gatehouse** `(172, 174)`, defeat **Siege Commander Vaelen** and Morvessa's tax-levy rearguard, and open the southern road into Redmarsh.
   - **Lore Item Found**: *Unsent Letter from Ashbrook* (`book-ashbrook-steward-letter`).

### 4.2 Side Quests & Frontier Contracts (6 Quests)

7. **`SQ1-01: The Burned Mint Assay`** (Region 3, Lv 4)
   - **Giver**: Reeve Marlow in Thornwick Market.
   - **Objective**: Search the charred ruins of the Border Mint `(32, 28)`, defeat the probate bailiff ambush, and recover Assayer Pell's hidden scale-weights and *Clipped Coin Investigation* (`book-border-mint-assay`).
   - **Reward**: `350 Gold`, `400 XP`, *Toll-Warden's Signet* (`toll-wardens-signet.png`, +2 Def, +15% Gold Find).
8. **`SQ1-02: Vitrified Slag of the Old Kilns`** (Region 3, Lv 5)
   - **Giver**: High Arcanist Vaelen at Thornwick Academy.
   - **Objective**: Harvest 3 shards of translucent green *Vitrified Slag* from the waste heaps behind the Greywood kilns while fending off **Krazak, the Volt Stalker**.
   - **Lore Item Found**: *Vitrified Slag Observations* (`book-quarry-kiln-formula`).
   - **Reward**: `450 XP`, teaches spell `Static Arc` / `Chain Lightning` scroll, and crafts *Copper-Coil Grounding Ring* (`copper-coil-ring.png`, +25% Air/Lightning Resistance).
9. **`SQ1-03: Wedged Wheel at Greywood Mill`** (Region 3, Lv 5–6)
   - **Giver**: Edda the Miller / Factor Merrick.
   - **Objective**: Infiltrate Greywood Canopy `(58, 36)`, slay **Skara, Matron of Frostquills**, burn the 3 raider supply depots, and recover the iron crowbars wedged in the sawmill wheel.
   - **Lore Item Found**: *Sawmill Haulage Manifest* (`book-greywood-tally-slate`).
   - **Reward**: `400 Gold`, `500 XP`, *Alder-Limb Flatbow* or *Warden's Arming Blade* (Tier 2 Superior).
10. **`SQ1-04: Hunt for the Ironroot Colossus`** (Region 4 Quarry, Lv 7–8)
    - **Giver**: Garrison Bounty Board in Thornwick Tavern.
    - **Objective**: Track **Thornmaw the Ironroot / Krag Ironhide** (`bramblefist-oakhulk`) into the boggy granite quarry `(162, 114)` and shatter his stone carapace before he rallies the scattered moorland packs.
    - **Lore Item Found**: *Ironhide Spoor Notes* (`book-trapper-boar-journal`).
    - **Reward**: `600 Gold`, `750 XP`, *Chipped Flint Gorget* (`chipped-flint-gorget.png`, +4 Armor Absorption, +15% Earth Resistance).
11. **`SQ1-05: Cancel the Dead Man's Lien`** (Region 5 Scriptorium, Lv 9)
    - **Giver**: Orlen the Grave-Tender `(28, 104)`.
    - **Objective**: Enter the flooded scriptorium of the Sunken Sanctum, locate Miller Tobin's gall-ink anointed corpse bound to the north pier, and burn the *Lower-Parish Probate Ledger* so the risen villagers can rest.
    - **Reward**: `650 XP`, *Leaden Parish Token* (`leaden-parish-token.png`, +20 HP, +25% Astral/Curse Resistance) + permanent `+15` Thornwick Warden reputation.
12. **`SQ1-06: Pressure Behind Gallery Four`** (Region 6 Undervault, Lv 10)
    - **Giver**: Bridge-Tinker at Alder Bridge.
    - **Objective**: Clear the bricked-up inspection shafts in the **Undervault Links** `(134, 152)` where tax-clerks hid confiscated silver bars, turn the dwarven bronze pressure wheel to prevent a tunnel collapse, and recover the *Undervault Drainage Writ* (`book-undervault-seal-writ`).
    - **Reward**: `800 Gold`, `900 XP`, *Ossuary Bone Ward* Shield (`ossuary-bone-ward.png`, Tier 3).

---

## 5. Draft Dialogues (Disco Elysium Cognitive Format)

### 5.1 Warden Hale — Sunken Ford Briefing (`MQ1-01`)
> **[WAR LOGIC - Medium: Success]**
> *(A damp mountain gale rattles the tarnished plates of his gorget. He exhales a gray plume smelling of bitter chicory and cold tallow.)*
> "Look at the driftwood wedged against the weir, Commander. Those aren't peasant hay-carts—those are Border Mint bullion wagons burned down to the iron axle-trees. Grok'tar's gnolls didn't wade the Alder for turnips. Someone paid them in stamped copper to butcher the night-watch and sink the assay ledgers before the auditors rode in from Oakhaven."
> - **1. `[Tactical Calculus]`** "Where is Grok'tar's reserve? If we wade the gravel bar, his horn-bows on the bluff will pin us in waist-deep water."
> - **2. `[Frontier Skepticism]`** "Morvessa taxes the iron out of our pikes, then hires beasts to burn the receipts. Typical southern bookkeeping."
> - **3. `[Iron Will]`** "Lock shields and sound the advance. We take the bluff before the river rises another cubit."

### 5.2 Orlen the Grave-Tender — Weeping Ossuary Threshold (`MQ1-04`)
> **[ASTRAL SHIVER - Challenging: Success]**
> *(He holds a smoldering bundle of bog-myrtle and vinegar-soaked rags to his nose. Beneath the trapdoor, thousands of wet silk threads vibrate like plucked harp strings.)*
> "Do not touch the white webbing on the archstones with bare skin. Morvessa's clerks didn't just lock the tax-debtors in the crypt—they fed the unpaid parish rolls to the Silk Widow. Every corpse down there still wears a lead probate tag around its ankle, marching in step to the click of her brass abacus."
> - **1. `[Quartermaster's Eye]`** "If she's keeping the stolen mint silver in the inner vault, we cut through the web and balance the ledger in cold steel."
> - **2. `[Visceral Dread]`** "The air coming up that stair smells like sheep tallow boiled in bile. Keep the fire-flasks ready."
> - **3. `[Iron Will]`** "The dead of Thornwick owe nothing to a southern bailiff. Torch the cocoons and move in."

### 5.3 High Quartermaster Morvessa — Pre-Fight Confrontation (`MQ1-04` / `MQ1-06`)
> **[PRIMORDIAL RECKONING - Formidable: Success]**
> *(She slides three brass beads across her abacus with a sharp, metallic click. Her cloak is immaculate despite the mud and ash swirling around the gatehouse.)*
> "You march with steel forged from Crown ore, eating rations salted with Redmarsh brine, yet you call the Salt Tithe theft. Seven hundred leagues south, the caldera seals are cracking like dry pottery. Without northern bullion and timber to shore up the coastal forts, the mountain will cremate your precious river parishes before midwinter."
> - **1. `[War Logic]`** "You starved three parishes and hired gnolls to slaughter your own watchmen. That isn't logistics, Morvessa—it's treason."
> - **2. `[Frontier Skepticism]`** "Every tyrant in history has promised to save the world right after emptying its granaries."
> - **3. `[Veteran Flesh]`** "Put down the abacus and draw your ward-rod. We're settling Thornwick's arrears here and now."

---

## 6. Procedural Music & Ambience Specification

Ready for synthesis via `tools/synth-pack6a-music.py` / `tools/gen-soundtrack.py`:

| Cue Role | Existing File (`public/audio/`) | Key & Scale | Tempo & Meter | Instrumentation (Physical Modeling) | Mood & Dynamic Layering |
|----------|---------------------------------|-------------|---------------|-------------------------------------|-------------------------|
| **City Hub (Thornwick)** | `music_town_thornwick.m4a` + `amb_town_thornwick.m4a` | D Dorian (`D-E-F-G-A-B-C`) | `68 BPM`, `3/4` slow ballad | Acoustic lute/gut-string pluck, low wooden flute, distant anvil clink, crackling brazier & rain on timber | Weary sanctuary, wet wool, fragile warmth behind timber walls |
| **Region Explore (Fords & Greywood)** | `music_explore_act1_fords.m4a` + `amb_river_ford.m4a` / `amb_greywood.m4a` | A Aeolian (`A natural minor`) | `76 BPM`, `4/4` steady march | Bowed cello drone, muted French horn fifths, pizzicato bass, river current & crow calls | Cold frontier vigilance, mist over swollen rapids, distant war-horns |
| **Region Explore (Peat & Ossuary)** | `music_explore_act1_fen.m4a` + `amb_fen.m4a` / `amb_ruined_sanctum.m4a` | E Phrygian (`E-F-G-A-B-C-D`) | `58 BPM`, `6/8` creeping pulse | Sub-bass bowed contrabass, glass harmonica / wet chime harmonics, dripping vault water | Claustrophobic rot, probate dread, marsh-lights flickering over peat sinks |
| **Standard Combat** | `music_battle_act1.m4a` | D Minor (`D harmonic minor`) | `124 BPM`, `4/4` driving ostinato | War-frame drums, staccato brass stabs, rapid spiccato strings, iron-on-oak percussion | Desperate shield-wall clash in mud and rain |
| **Act Boss (Morvessa)** | `music_boss_morvessa.m4a` | F# Phrygian Dominant | `138 BPM`, `7/8` (`2+2+3`) asymmetric meter | Clicking brass abacus percussion, screeching sul-ponticello violins, deep choir drone, war-tubas | Calculated bureaucratic horror meets chittering arachnid frenzy |

---

## 7. Progression, Rewards & Bridge Items to Map 2

### 7.1 Region Level & Equipment Gate Curve
- **Regions 1–2 (Lv 1–4)**: Player upgrades from Tier 1 (`Rusty Sword` / `Oak Staff`, `Padded Jerkin`, `Wooden Buckler`) to Tier 2 (`Iron Sword` / `Ash Staff`, `Chain Mail`, `Iron Shield`, `Iron Helm`).
- **Regions 3–4 (Lv 4–8)**: Player acquires Tier 2–3 Magic/Rare gear, sockets first chipped/flawed gems and low runes (`El`–`Tal`), and crafts lightning/earth resistance rings for Krazak and Thornmaw.
- **Regions 5–6 (Lv 8–12)**: Thornwick Shop unlocks Tier 3 stock (`Steel Sword`, `Rune Staff`, `Tower Shield`). Defeating Morvessa and Vaelen yields guaranteed Tier 3–4 Unique/Set drops.

### 7.2 Key Items Carrying Forward into Map 2 (`Redmarsh Wastes`)
1. **Morvessa's Brass Seal Ring** (Unique Ring, Tier 3): `+15 Mana`, `+20% Poison/Earth Resistance`, `+15% Gold Find`, `"Stamped with the crest of the Border Mint; grants passage past southern toll-barriers."`
2. **Vitrified Slag Focus / Grounding Band** (Quest Reward `SQ1-02`): `+25% Air/Lightning Resistance` — essential counter against the static discharges of Redmarsh's ruptured Quartz Wardstones (`MQ2-03`) and **Vekor, the Arc Carapace** (`arc-carapace-vekor`).
3. **Border Mint Bullion Ledger** (Key Quest Dossier): Unlocks the **Lower-Parish Scriptorium** dialogue branch in Redmarsh Outpost, revealing the locations of the Third-Dynasty canopic debt vaults.
