# MAP 4 DESIGN: THE OBSIDIAN CALDERA & CINDER THRONE (`map-4-obsidian-caldera`)

## 1. Macro Map Specification & Topology

- **Map ID**: `map4-obsidian-caldera` (consolidating Act IV nodes `m36`–`m46`, `town-ironcamp`, and `cinder-throne` into the final volcanic caldera world map with dual campaign endings).
- **Dimensions**: `192 x 192` tiles (`36,864` tiles, 12x12 terrain chunks of 16x16 tiles), culminating at the inner sanctum **The Obsidian Dais & Cinder Throne** (`x: 140..186, y: 140..186`).
- **Primary Biome & Theme**: `volcanic` (`setTerrainTheme('volcanic', seed)`), blending cracked basalt highways (`Terrain.Dirt` / volcanic ash ground), white-hot slag rivers (`Terrain.Water` / magma channels), jagged obsidian spires (`Terrain.Rock`), and ancient First-Watch masonry (`BIOME_ZONES.volcanic`: `ruinstone`).
- **Time of Day & Weather**: Solstice eclipse under choking crimson ash-clouds (`day: 1800`), with glowing embers rising from geothermal floor-fissures and magma light pulsing beneath the Obsidian Dais.
- **City Hub Position**: **Ironcamp Forge-Hold (`town-ironcamp`)** anchors the North-West Volcanic Foothills beside the geothermal quenching troughs (`x: 12..46, y: 14..52`).

---

## 2. The City Hub & Six Named Regions

| # | Region Name | Bounds `(x1,y1)..(x2,y2)` | Req. Hero Level | Biome & Feature Zones (`BIOME_ZONES`) | Key Objects (`objects.json`), Shrines & Waypoints |
|---|-------------|---------------------------|-----------------|---------------------------------------|--------------------------------------------------|
| **0** | **Ironcamp Forge-Hold (City Hub)** | `(12, 14)..(46, 52)` | **Lv 36** | `volcanic` siege foundry; zone: `ruinstone` | Penitent Cloister & Tavern (`House 0`), Caldera Fissure Foundry (`House 1`, tiers `[4,5]`), First Watch War-Room (`House 2`), Waypoint `wp-ironcamp`, `volcanic/vent`, `camp/palisade` |
| **1** | **Basalt Highway & Shattered Beacons** | `(47, 12)..(118, 66)` | **Lv 36–38** | `volcanic`; zone: `ruinstone` | Ember-Wheel Milestones, 3 Signal Beacon Towers (`House 3`, `(74,24)`, `(96,32)`, `(112,20)`), West Crag Focusing Prism `(106,48)` (`rocks/crystal`), Healing Shrine `(68,38)`, Waypoint `wp-basalt-highway` `(82,36)` |
| **2** | **Besieged Wall & Ashveil Summit** | `(119, 12)..(186, 76)` | **Lv 38–40** | `volcanic` / `highlands`; zone: `ruinstone` | Eastern Basalt Curtain Wall & Tower Four Sapper Tunnel `(142,44)`, Ashveil Summit Portal Stairs `(172,26)` (`ruins/arch`, `volcanic/obsidian`), Mana Shrine `(148,38)`, Adventure `magic_well` `(134,52)`, Waypoint `wp-ashveil` `(154,34)` |
| **3** | **Magnetic Narrows & Twofold Barbican** | `(12, 67)..(78, 136)` | **Lv 40–42** | `volcanic` / `highlands`; zone: `ruinstone` | 30-Pace Lodestone Defile `(34,96)`, East & West Barbican Winches `(58,114)` & `(72,114)`, Cinderforge Smelting Pit `(44,122)`, Combat Shrine `(52,102)`, Adventure `creature_bank` `(24,118)`, Waypoint `wp-barbican` `(62,110)` |
| **4** | **Gauntlet of Iron & Greystone Rampart** | `(79, 67)..(144, 136)` | **Lv 42–44** | `volcanic`; zone: `ruinstone` | 60-Degree Angled Trench-Maze `(104,94)` (`camp/palisade`, `camp/rack`), Sloped Basalt Glacis of Greystone Rampart `(128,116)`, Haste Shrine `(112,104)`, Waypoint `wp-gauntlet` `(116,108)` |
| **5** | **Three-Roads Watch & Headless Kings** | `(16, 137)..(118, 186)` | **Lv 44–46** | `volcanic` / `crypt`; zone: `ruinstone` | Three-Roads Star-Bastions `(54,158)`, Threshold Nave & Seventh Anchor Valve `(88,164)`, Crossroads of Headless Kings `(106,168)` (`ruins/statue`), Ward Shrine `(96,162)`, Waypoint `wp-threshold` `(102,166)` |
| **6** | **Colonnade of Crowns & Obsidian Dais** | `(119, 137)..(186, 186)` | **Lv 46–50** | `volcanic`; zone: `ruinstone` | Black Marble Colonnade & Twelve Chained Crowns `(142,164)` (`ruins/column`), Shattered Conduit Pillars, **Obsidian Dais & Cinder Throne** `(172,168)`, Armor Shrine `(136,164)`, Waypoint `wp-obsidian-dais` `(138,166)` |

### 2.1 Road, Trench & Magma-Bridge Network
- **The Basalt Highway (North-West to East)**: Black paved imperial road running from Ironcamp `(46, 32)` past the three hilltop signal beacons `(96, 32)` to the **Eastern Curtain Wall** `(142, 44)` and the high steps of **Ashveil Summit** `(172, 26)`.
- **The Magnetic Narrows (West Flank)**: A raw lodestone gorge `(34, 96)` cutting south from Ironcamp to the **Twofold Barbican** `(62, 110)` and **Cinderforge Pit** `(44, 122)`.
- **The Gauntlet Traverse (Center)**: Zigzag 60-degree siege trenches `(104, 94)` connecting the Barbican bailey across the sloped glacis of **Greystone Rampart** `(128, 116)` down to **Three-Roads Star-Fortress** `(54, 158)`.
- **The Threshold & Colonnade of Conquered Crowns (South Spine)**: From Three-Roads Watch, the road passes the **Seventh Anchor Valve** `(88, 164)` and the **Crossroads of Headless Kings** `(106, 168)`, ascending the black marble **Colonnade** `(142, 164)` across the magma moat onto the **Obsidian Dais** `(172, 168)`.

---

## 3. Enemy Roster, Super-Uniques & Boss Balance

All enemies strictly reference existing sprite atlases in `public/sprites/` and families in `public/data/monsters.json`:

| Region | Regular Monster Families (`monsters.json`) | Palette Tiers | Mini-Boss / Super-Unique (`super-uniques.ts`) | Tactical AI & Affixes |
|--------|--------------------------------------------|---------------|-----------------------------------------------|-----------------------|
| **1. Basalt Highway & Beacons** | `cinderling`, `ash-weaver` (Flame curse caster), `crowned-maw` (Apex hunter), `redglass-drake` | Tiers `4–5` (Cobalt / Amethyst) | **Turncoat Captain Galt & Redglass Matriarch** (Tier 4 `redglass-drake`, `fire_enchanted`, `extra_fast`) | High-mobility fire drakes and `ash-weaver` packs guarding the doused beacon pyres and West Crag prism |
| **2. Besieged Wall & Ashveil Summit** | `doom-knight` (Dread Knight), `ash-weaver`, `hollow-king`, `cinderhorn` | Tiers `4–5` (Cobalt / Amethyst) | **Arch-Mage Malrik** (Tier 5 `ash-weaver` / `mage` VIP) & **Vaelor, the Shattered Warden** (`fallen-warden-azrael`, Tier 5 `hollow-king`) | Vaelor: `juggernaut_tank`, `cold_enchanted` Glacial Ward, `stone_skin`, `extra_strong`, 3x `doom-knight` retinue; Malrik flees up Ashveil stairs if not pinned |
| **3. Magnetic Narrows & Cinderforge** | `anvilmaw-smith` (Cinderforge titan), `basalt-brute`, `doom-knight`, `pale-burrower` | Tiers `5` (Amethyst) | **Kragg, the Cinderforge Overseer** (`hellforger-kragg`, Tier 5 `anvilmaw-smith`) | `berserker_charger` AI: `extra_strong`, `extra_fast`, `spectral_hit`, `magic_resistant`, 3x `basalt-brute` retinue |
| **4. Gauntlet of Iron & Greystone** | `cinderhorn` (Inferno megademon), `doom-knight`, `redglass-drake`, `anvilmaw-smith` | Tiers `5` (Amethyst) | **Gorgath, Harvester of Cinders** (`soulblight-archon`, Tier 5 `cinderhorn`) | `berserker_charger` AI: leads 5x `cinderhorn` Inferno Stampede, `extra_fast`, `fire_enchanted`, `spectral_hit` |
| **5. Three-Roads & Headless Kings** | `doom-knight`, `hollow-king`, `cinderhorn`, `silt-colossus` | Tiers `5` (Amethyst) | **Lord Varakh, the Seal Keeper** (`dreadlord-malakor`, Tier 5 `doom-knight`) | `hexer_caster` AI: casts `Weaken`/`Slow` from behind 5x `doom-knight` phalanx, `cursed`, `blessed_aura`, `extra_strong` |
| **6. Colonnade & Obsidian Dais** | `doom-knight`, `anvilmaw-smith`, `cinderhorn`, `redglass-drake` | Tiers `5` (Amethyst) | **Act IV Final Boss: Ashkarath, the Cinder King / First Warden of the Anchor Seals** (`ashkarath`, Tier 5, Base HP 980 x 2.9) | Ashkarath: `Hellfire Breath` cone, `Fire Ring` ground burn, `Bone Prison` cage, `Red Lightning` piercing beam; 4 phases (100% / 66% / 33% / 10% HP) |

---

## 4. Story Missions & Side Quests (12 Quests Total)

### 4.1 Main Story Campaign Chain (6 Quests)

1. **`MQ4-01: Heartland March & The Shattered Beacons`** (Region 1, Lv 36–38)
   - **Objective**: March down the scorching **Basalt Highway** `(82, 36)` from Ironcamp, purge Turncoat Watchman Galt's traitors at the three hilltop signal towers `(74, 24)`, `(96, 32)`, and `(112, 20)`, and re-ignite the signal pyres to guide the allied landing columns.
   - **Lore Item Found**: *Basalt Highway Mile-Log* (`book-heartland-road-survey`) & *Shattered Beacon Confession* (`book-beacon-treason-confession`).
2. **`MQ4-02: The Besieged Wall & Flight of Malrik`** (Region 2, Lv 38–40)
   - **Objective**: Cool the slag-cracked basalt courses of the Eastern Curtain Wall `(142, 44)` with quenching brine barrels, crush the sapper team beneath Tower Four, and pursue **Arch-Mage Malrik** up the **Ashveil Summit** portal stairs `(172, 26)`—slaying him and **Vaelor, the Shattered Warden** (`fallen-warden-azrael`) to reclaim the stolen Anchor cipher-keys.
   - **Lore Item Found**: *Outer Curtain Damage Log* (`book-besieged-wall-tally`) & *Malrik's Margin Notes* (`book-malrik-stolen-syllabus`).
3. **`MQ4-03: Twofold Assault & The Gauntlet of Iron`** (Regions 3–4, Lv 40–44)
   - **Objective**: Strike the East and West Barbicans `(58, 114)` & `(72, 114)` simultaneously at the third horn-blast to sever the portcullis winch-chains, fight through the 60-degree ballista trenches of the **Gauntlet of Iron** `(104, 94)`, slay **Gorgath, Harvester of Cinders** (`soulblight-archon`), and storm the sloped glacis of **Greystone Outer Rampart** `(128, 116)`.
   - **Lore Item Found**: *Twin-Gate Assault Orders* (`book-twofold-breach-plan`), *Trench-Maze Defenses* (`book-gauntlet-trench-diagram`), & *Glacis Watch Standing Orders* (`book-outer-rampart-soot-note`).
4. **`MQ4-04: Siege of Three-Roads Watch`** (Region 5 West, Lv 44–45)
   - **Objective**: Hold the star-bastions of **Three-Roads Watch** `(54, 158)` and defeat three converging Ember Court relief hosts in detail (Northern, Western, and Southern causeways) before they can reinforce the Infernal Citadel across the magma moat.
   - **Lore Item Found**: *Star-Fortress Siege Log* (`book-three-roads-dispatch`).
5. **`MQ4-05: The Threshold Choice (Crossroads of Headless Kings)`** (Region 5 East, Lv 45–46)
   - **Objective**: Defeat **Lord Varakh, the Seal Keeper** (`dreadlord-malakor`) before the **Threshold Nave** `(88, 164)`, inspect the **Seventh Meteoric Anchor Valve**, and stand between Brother Elias and Forgemaster Vok at the **Crossroads of Headless Kings** `(106, 168)` to make the irreversible campaign choice (`branch 1` or `branch 2`):
     - **Branch 1 (`The Crown of Order` — First Watch Compact)**: Use Malrik's cipher-keys and the Conclave grounding rod to stabilize the Seventh Anchor Valve, vowing to purge Ashkarath and vent the caldera pressure safely into the deep sea.
     - **Branch 2 (`Ember Reckoning` — The Living Furnace)**: Unbuckle the penitent seal and align the obsidian focusing prism to draw the Primordial Ember into the throne, vowing to claim Ashkarath's mantle as Dark Sovereign.
   - **Lore Item Found**: *Inscription of Headless Kings* (`book-threshold-headless-kings`) & *Seventh Anchor Valve Rubbing* (`book-anchor-seal-rubbing`).
6. **`MQ4-06A / MQ4-06B: The Obsidian Dais (Crown of Order / Ember Reckoning)`** (Region 6, Lv 46–50)
   - **Objective**: March down the black marble **Colonnade of Conquered Crowns** `(142, 164)` past the empty seventh iron hook stamped with Thornwick's crest, step onto the **Obsidian Dais** `(172, 168)`, and defeat **First Warden Ashkarath** across four elemental phases to trigger **Ending A** (`ending-a` slideshow) or **Ending B** (`ending-b` slideshow).
   - **Lore Item Found**: *Colonnade Conquest Roll* (`book-crown-colonnade-roll`) & *First Warden's Final Writ* (`book-caldera-heart-testament`).

### 4.2 Side Quests & Caldera Forge Contracts (6 Quests)

7. **`SQ4-01: Quenched in Four Heartbeats`** (Region 0/3 Foundry, Lv 37)
   - **Giver**: Forgemaster Vok in Ironcamp (`fac-ironcamp-smiths`).
   - **Objective**: Venture into the **Cinderforge Smelting Pit** `(44, 122)`, slay **Kragg, the Cinderforge Overseer** (`hellforger-kragg`), and recover 3 *Meteoric Star-Iron Billets* and a cask of sulfur caldera brine so Vok can forge a masterwork Tier 5 weapon.
   - **Lore Item Found**: *Ironcamp Smelting Ordinances* (`book-ironcamp-forge-rules`).
   - **Reward**: `2,500 Gold`, `3,500 XP`, player's choice of Tier 5 Unique/Masterwork weapon (*Cinder-Vein Greatsword*, *Caldera-Jaw Greataxe*, *Ash-Spire Warbow*, or *Thorn Staff*).
8. **`SQ4-02: The Violet Prism of West Crag`** (Region 1 South-East, Lv 39)
   - **Giver**: Adept Solis / Thermodynamic Conclave envoy.
   - **Objective**: Climb **West Beacon Crag** `(106, 48)` where Malrik's defectors aligned a violet capacitor prism to overload the Threshold Nave's silver containment doors; sever the glowing red copper grounding wires and claim the prism core.
   - **Lore Item Found**: *Focusing Crag Readings* (`book-west-beacon-prism-log`).
   - **Reward**: `3,800 XP`, *Astral Prism Medallion* (`astral-prism-medallion.png`, +30 Mana, +25% Spell Power, +25% All Resistances).
9. **`SQ4-03: The Lodestone Gorge (Magnetic Narrows)`** (Region 3 North, Lv 41)
   - **Giver**: Sapper Captain Orin.
   - **Objective**: Clear the thirty-pace raw lodestone defile of **Magnetic Narrows** `(34, 96)` where magnetic pull debuffs heavy metal armor and crossbows; disarm the jammed portcullis traps and rescue the pinned sapper squad.
   - **Lore Item Found**: *Magnetic Narrows Survey* (`book-magnetic-canyon-warning`).
   - **Reward**: `2,200 Gold`, `4,000 XP`, *Caldera Slag Signet* (`caldera-slag-signet.png`, immune to magnetic/slow movement penalties, +6 Body).
10. **`SQ4-04: Penance of the Iron Collar`** (Region 2/5, Lv 43)
    - **Giver**: Brother Elias (`fac-scorched-penitents`).
    - **Objective**: Recover the three ash-scrolls and iron penitent collars from the fallen confessors along the Basalt Highway and Ashveil Stairs, and witness the true history of the Year -15 Caldera Schism at the Penitent Cloister.
    - **Reward**: `4,200 XP`, *Ash-Urn Reliquary* (`ash-urn-reliquary.png`, +40 HP, +35% Fire Resistance, +5 HP/sec Regen).
11. **`SQ4-05: Oath of the Seven Pillars`** (Region 5 Threshold Nave, Lv 45)
    - **Giver**: Spectral Pillar-Warden (`fac-first-watch-remnant`).
    - **Objective**: Touch the seven ancestral rune-plinths encircling the Threshold Nave in chronological order of the First Compact (`-412` to `-129`) while defending the circle against waves of `doom-knight` oath-breakers.
    - **Reward**: `4,800 XP`, *First Watch Oath Ring* (`first-watch-oath-ring.png`, +5 All Attributes, +20% Armor Absorption) & *Threshold Ward Mirror* (`threshold-ward-mirror.png`, Tier 5 Shield).
12. **`SQ4-06: The Seventh Hook of Thornwick`** (Region 6 Colonnade, Lv 47)
    - **Giver**: Sir Aldren the Iron-Willed.
    - **Objective**: Before ascending the Obsidian Dais, locate the empty seventh iron hook stamped with Thornwick's crest beneath the black marble pillars of the **Colonnade of Conquered Crowns** `(142, 164)` and shatter the chain with your weapon—declaring Thornwick forever free of imperial tribute.
    - **Reward**: `5,500 XP`, permanent `+25%` All Damage & morale aura (`Fanaticism` / `Salvation` resonance) for the final battle against Ashkarath.

---

## 5. Draft Dialogues (Disco Elysium Cognitive Format)

### 5.1 Forgemaster Vok & Brother Elias — Ironcamp Forge-Hold (`MQ4-01` / `SQ4-01`)
> **[VETERAN FLESH - Challenging: Success]**
> *(Heat rises through the iron floor-grates of the foundry, smelling of sulfur brine and scorched tallow. Forgemaster Vok lowers his smoked-quartz goggles with keloid-scarred fingers, while sightless Brother Elias rests a hand on the heavy iron collar around his own throat.)*
> **Vok**: "Put on the goggles before you look into the trench, Commander. Meteoric star-iron has to be drawn at white heat and quenched in four heartbeats; hesitate on the fifth and your blade shatters like dry glass."
> **Elias**: "And listen to the tremor beneath the anvil. Malrik stole the cipher-keys to crack the seventh Anchor Valve. He thinks he is bringing summer back to the north—he does not hear the mountain preparing to inhale us all."
> - **1. `[Quartermaster's Eye]`** "Tell me where to find clean star-iron billets, Vok. My vanguard needs blades that won't bend against caldera plate."
> - **2. `[Astral Shiver]`** "The bedrock is humming at the same frequency as the ruptured wardstones in Redmarsh. All seven seals are straining."
> - **3. `[Iron Will]`** "First we relight the hilltop beacons and run Malrik down on the Ashveil stairs. Nobody opens that valve while I'm breathing."

### 5.2 The Crossroads of Headless Kings — The Threshold Choice (`MQ4-05`)
> **[PRIMORDIAL RECKONING - Formidable: Success]**
> *(Three headless basalt kings tower over the crossroads fork. At their feet, the Seventh Anchor Valve glows dull cherry-red, venting rhythmic sighs of superheated steam.)*
> **Commander Rowan**: "The cipher-key fits the bronze rim, Commander. Turn it counter-clockwise with the Conclave grounding rod, and we lock the valve down—venting the magma into the abyss and saving the old realm, cold winters and all."
> **Brother Elias**: "Or leave the valve unlatched, step onto the Obsidian Dais, and take the living Ember into your own breast. The winter famine ends forever... though nothing mortal ever rises from that throne unchanged."
> - **1. `[War Logic — Branch 1: The Crown of Order]`** "Lock the valve and ground the current. We marched four hundred leagues to save Thornvael, not to become its next tyrant."
> - **2. `[Primordial Reckoning — Branch 2: Ember Reckoning]`** "The old compact starved the north and rotted in its own debt ledgers. Unlatch the seal—I will bear the Ember myself."
> - **3. `[Tactical Calculus]`** "Whichever road we take, Ashkarath waits at the top of the Colonnade. Ready your weapons."

### 5.3 First Warden Ashkarath — The Obsidian Dais (`MQ4-06`)
> **[PRIMORDIAL RECKONING - Heroic: Success]**
> *(Shattered conduit pillars weep liquid gold across the Obsidian Dais. Ashkarath rises from the Cinder Throne, his blackened meteoric armor stitched together by veins of pulsing solar fire.)*
> "Four provinces burned to bring you to my steps, and now you stand where seven kings lost their crowns! A cold hearth is still a house, mortal. Unbind the primordial fire and you do not rule the world—you become its kindling! Step onto the Dais and prove your flesh can hold a sun!"
> - **1. `[Iron Will — Ending A]`** "The Anchor Seals are grounded, Ashkarath. Your watch is over, and the furnace goes dark tonight!"
> - **2. `[Primordial Reckoning — Ending B]`** "You spent four hundred years guarding a fire you were too afraid to wield. Step down from my throne!"
> - **3. `[Cohort Memory]`** "For every soldier left in the mud of the Alder, the salt of Redmarsh, and the surf of Oakhaven—charge!"

---

## 6. Procedural Music & Ambience Specification

Ready for synthesis via `tools/synth-pack6a-music.py` / `tools/gen-soundtrack.py`:

| Cue Role | Existing File (`public/audio/`) | Key & Scale | Tempo & Meter | Instrumentation (Physical Modeling) | Mood & Dynamic Layering |
|----------|---------------------------------|-------------|---------------|-------------------------------------|-------------------------|
| **City Hub (Ironcamp)** | `music_town_ironcamp.m4a` + `amb_forge_ironcamp.m4a` | D Phrygian (`D-Eb-F-G-A-Bb-C`) | `62 BPM`, `4/4` rhythmic smithy cadence | Trip-hammer anvil transient every 2 bars, low cello/baryton drone, male penitent chant fifths, hissing steam & bellows | Grim industrial sanctuary on the lip of hell; glowing coals and iron discipline |
| **Region Explore (Basalt Highway & Narrows)** | `music_explore_act4_heartland.m4a` | Bb Minor / Octatonic | `74 BPM`, `4/4` inexorable heavy march | Low trombones & Wagner tubas, bowed metallic saw/cymbal scrape, deep sub-bass magma thrum | Crushing tectonic dread, falling grey ash, magnetic tension |
| **Region Explore (Gauntlet & Colonnade)** | `music_explore_act4_rampart.m4a` + `amb_throne_hall.m4a` | F# Minor / Phrygian Dominant | `84 BPM`, `5/4` (`3+2`) ritual processional | Cathedral brass choir, tubular iron bells, timpani heartbeats, crackling ember-vent ambience | Monumental tragedy of the Headless Kings and the Colonnade of Conquered Crowns |
| **Standard Combat** | `music_battle_act4.m4a` + `music_battle_elite.m4a` | D Harmonic Minor | `140 BPM`, `4/4` relentless siege assault | Double-kick war drums, screaming brass clusters, rapid string ostinatos, anvil-strike accents | All-out war in the volcanic trenches against Dread Knights and Cinderhorns |
| **Final Boss (Ashkarath)** | `music_boss_ashkarath.m4a` + `music_cutscene_crown.m4a` | C# Phrygian Dominant -> D Minor Apotheosis | `148 BPM`, `7/4` (`4+3`) -> `4/4` grand finale | Full low-brass choir, pipe-organ pedal thunder, dual anvil & taiko battery, soaring tragic cello/choir leitmotif | The ultimate reckoning for Thornvael's soul on the Obsidian Dais |

---

## 7. Final Rewards & Post-Campaign Sovereign Loop

### 7.1 Region Level & End-Game Equipment Curve
- **Regions 1–3 (Lv 36–42)**: Hero completes transition to Tier 5 base items (`Thorn Blade`, `Thorn Staff`, `Cinder-Vein Greatsword`, `Caldera-Jaw Greataxe`, `Ash-Spire Warbow`, `Slag-Spring Repeater`, `Obsidian Bulwark`, `Threshold Ward Mirror`).
- **Regions 4–6 (Lv 42–50)**: Hero sockets Perfect Gems and High Runes (`Lo`–`Zod` equivalents), completing endgame Runewords (`Grief`, `Fortitude`, `Infinity`, `Enigma` equivalents) and 4-piece class Item Sets.

### 7.2 Campaign Completion & Roster Trophies
- **Ending A Trophy (`Crown of Star-Iron`)**: Recorded on the hero's Character Roster card (`furthest: "Map 4: Obsidian Dais (Purged)"`), granting `+10% All Resistances` and unlocking **Nightmare / Hell Difficulty** and **Skirmish Sovereign Carryover**.
- **Ending B Trophy (`Mantle of the Living Ember`)**: Recorded on the hero's Character Roster card (`furthest: "Map 4: Cinder Throne (Sovereign)"`), granting `+15% Fire/Astral Damage` and unlocking **Nightmare / Hell Difficulty** and **Skirmish Sovereign Carryover**.
