# MAP 2 DESIGN: THE REDMARSH WASTES & IRONHEART CISTERNS (`map-2-redmarsh-wastes`)

## 1. Macro Map Specification & Topology

- **Map ID**: `map2-redmarsh-wastes` (consolidating Act II nodes `m12`–`m23`, `town-redmarsh`, and `gullet-of-dunes` into one seamless huge desert-and-salt-flat map).
- **Dimensions**: `192 x 192` tiles (`36,864` tiles, 12x12 terrain chunks of 16x16 tiles), with inner boss sanctum **The Gullet of Dunes / Silted Cisterns** (`64 x 64` or seamless southeast caldera `x: 140..186, y: 148..186`).
- **Primary Biome & Theme**: `desert` (`setTerrainTheme('desert', seed)`, ground skin `public/terrain/skin-sand.png`), blending northern alkaline marsh (`Terrain.Marsh`), central palm oasis (`Terrain.Grass` + `Terrain.Water`), sunken Third-Dynasty probate tombs (`skin-crypt.png`), and the basalt escarpments of Ironheart (`skin-highland.png`). Feature zones use `BIOME_ZONES.desert` (`ruinstone`, `highland`) and `BIOME_ZONES.oasis` (`sand`).
- **Time of Day & Weather**: Merciless copper midday sun (`day: 600`) with drifting alkali dust-squalls that subside when the three Quartz Wardstones are re-attuned, shifting to cold high-altitude twilight along Ironheart's forked causeways.
- **City Hub Position**: **Redmarsh Outpost (`town-redmarsh`)** sits on limestone stilts and bleached leviathan ribcages in the North-West Salt Basin (`x: 14..46, y: 18..54`).

---

## 2. The City Hub & Six Named Regions

| # | Region Name | Bounds `(x1,y1)..(x2,y2)` | Req. Hero Level | Biome & Feature Zones (`BIOME_ZONES`) | Key Objects (`objects.json`), Shrines & Waypoints |
|---|-------------|---------------------------|-----------------|---------------------------------------|--------------------------------------------------|
| **0** | **Redmarsh Outpost (City Hub)** | `(14, 18)..(46, 54)` | **Lv 12** | `desert` / `marsh` stilt stockade; zone: `ruinstone` | Caravan Tavern (`House 0`), Alkali Armory (`House 1`, tiers `[2,4]`), Conclave & Probate Tent (`House 2`), Waypoint `wp-redmarsh`, `bones/ribcage`, `camp/palisade`, `camp/tent` |
| **1** | **Ochre Ditch & Corduroy Causeway** | `(47, 12)..(114, 68)` | **Lv 12–14** | `marsh` -> `desert`; zone: `ruinstone` | Tilted Iron Boundary Posts, Willow Skull-Poles, Bogged Supply Convoy (`camp/crates`), Stilt Granary (`House 3`), Healing Shrine `(78,42)`, Adventure `watermill` `(62,28)`, Waypoint `wp-corduroy` `(84,38)` |
| **2** | **Twin Passes & Bracken Basin** | `(115, 12)..(184, 78)` | **Lv 14–16** | `desert` (`skin-sand.png`); zone: `highland` | West & East Escarpment Passes + Middle Spire `(146,36)`, Highgate Watch Palisade (`House 4`, `camp/palisade`), Four-Faced Obelisk `(128,58)`, Combat Shrine `(152,48)`, Waypoint `wp-twin-passes` `(142,44)` |
| **3** | **Quartz Plateau & Wardstone Ring** | `(48, 69)..(128, 132)` | **Lv 16–18** | `desert` / `oasis`; zones: `ruinstone`, `sand` | 3 Primeval Quartz Wardstones `(66,88)`, `(98,78)`, `(112,114)` (`rocks/crystal`), Hexer Kaelen's Bog-Well `(84,106)`, Ward Shrine `(92,96)`, Adventure `fountain_of_youth` `(76,112)`, Waypoint `wp-wardstones` `(90,92)` |
| **4** | **Third-Dynasty Salt-Vaults** | `(12, 70)..(64, 148)` | **Lv 18–20** | `crypt` (`skin-crypt.png`); zone: `ruinstone` | Stranded Inland-Sea Port Piers, Redrock Assay Vault `(28,118)`, Canopic Bitumen Jars (`bones/sarcophagus`, `ruins/arch`), Mana Shrine `(36,98)`, Adventure `creature_bank` `(22,134)`, Waypoint `wp-salt-vaults` `(38,112)` |
| **5** | **Deep Quarry & Flooded Sluice** | `(129, 79)..(184, 144)` | **Lv 20–22** | `highlands` (`skin-highland.png`); zone: `ruinstone` | 3 Black-Ironstone Quarry Terraces, Chained Miner Ramps, Flooded Lower Gallery & Bronze Sluice `(168,122)`, Armor Shrine `(148,108)`, Waypoint `wp-deep-quarry` `(154,114)` |
| **6** | **Fork of Spears & Ironheart Bastion** | `(65, 145)..(186, 186)` | **Lv 22–24** | `highlands` / `desert`; zones: `ruinstone`, `snow` | Lean Garrison Blockhouse (`House 5`), Twin Causeways `(118,164)` & `(136,164)`, Ironheart Steam-Sluices & Gullet Sanctum `(164,172)`, Haste Shrine `(112,158)`, Waypoint `wp-ironheart` `(126,160)`, Exit `road` to Map 3 `(180,182)` |

### 2.1 Road & Chokepoint Network
- **The Corduroy Salt-Road (North-West to East)**: Elevated log causeway crossing the sucking alkali mire from Redmarsh Outpost `(46, 36)` past the bogged wagons `(84, 38)` to the granite cliff wall of **Twin Passes** `(142, 44)`.
- **The Twin Escarpment Defiles**: Two parallel canyon ledges (`x: 136` and `x: 156`) split by a central sandstone chimney (`(146, 36)`) where Sand-Clan hornbows drop crossfire onto both tracks.
- **The Obelisk Crossroads (`(128, 58)`)**: Connects Twin Passes south-west to the **Quartz Plateau** `(90, 92)` and **Third-Dynasty Salt-Vaults** `(38, 112)`, or south-east into the stepped pit of **Deep Quarry** `(154, 114)`.
- **The Fork of Spears (`(118, 164)` & `(136, 164)`)**: Twin elevated basalt causeways converging on the steam-sluice gatehouse of **Ironheart Bastion** `(164, 172)`.

---

## 3. Enemy Roster, Super-Uniques & Boss Balance

All enemies use existing sprite atlases in `public/sprites/` and families in `public/data/monsters.json`:

| Region | Regular Monster Families (`monsters.json`) | Palette Tiers | Mini-Boss / Super-Unique (`super-uniques.ts`) | Tactical AI & Affixes |
|--------|--------------------------------------------|---------------|-----------------------------------------------|-----------------------|
| **1. Ochre Ditch & Corduroy Road** | `mire-wisp`, `dune-lurker` (Ambush striker), `maggot-swarm` (Toxic burrower), `spore-matron` | Tiers `2–3` (Ochre / Copper) | **Hexer Kaelen's Vanguard** (Tier 3 `spore-matron`, `cold_enchanted`) | Ambushes from reed walls around bogged wagons; poison clouds & slow hexes |
| **2. Twin Passes & Bracken Basin** | `sand-raider` (Dual-scimitar speedster), `dune-lurker`, `dune-beast` (Leaper), `basalt-brute` | Tiers `3` (Copper) | **Zara, the Crimson Prowler** (`crimson-prowler-zara`, Tier 4 `dune-lurker`) | `berserker_charger` AI: enters frenzy below 40% HP, `extra_strong`, `cursed`, `fire_enchanted`, 4x `sand-raider` retinue |
| **3. Quartz Plateau & Oasis** | `dune-scarab` (Lightning beetle), `claw-viper` (Venom lunger), `dune-beast`, `witch-doctor` | Tiers `3–4` (Copper / Cobalt) | **Vekor, the Arc Carapace** (`arc-carapace-vekor`, Tier 4 `dune-scarab`) & **Ssorath, the Venom Patriarch** (`venomscale-ssorath`, Tier 5 `claw-viper`) | Vekor: `ranged_kiter`, `lightning_enchanted` sparks, `stone_skin`; Ssorath: `ambush_lunger`, `extra_fast`, `lightning_enchanted`, `spectral_hit` |
| **4. Third-Dynasty Salt-Vaults** | `greater-mummy` (Crypt Embalmer), `hollow-knight`, `hollow-king`, `ruin-mite` | Tiers `4` (Cobalt) | **Khepri, the Sunken Embalmer** (`ash-embalmer-khepri`, Tier 5 `greater-mummy`) | `shaman_reviver` AI: continuously resurrects 4x `hollow-knight` retinue, casts poison decay & `mana_burn`, `extra_fast`, `cursed` |
| **5. Deep Quarry Terraces** | `pale-burrower`, `basalt-brute` (Siege giant), `silt-colossus`, `sand-raider` | Tiers `4` (Cobalt) | **Overseer Drak & Silt Juggernaut** (Tier 4 `silt-colossus`, `stone_skin`, `extra_strong`) | Heavy physical frontliners guarding the winch chains and flooded Third-Dynasty bronze sluice |
| **6. Fork of Spears & Ironheart Bastion** | `basalt-brute`, `silt-colossus`, `hollow-king`, `storm-kite` (Cliff lightning kite) | Tiers `4–5` (Cobalt / Amethyst) | **Act Boss: Gorrathul, the Sand Glutton / Warden of the Forked Cisterns** (`gorrathul`, Tier 5, Base HP 720 x 2.9) | Gorrathul: `Holy Freeze Aura` slowing melee/movement, `Subterranean Charge` burrow slam, `Acid Cleave` armor shred, steam-vent hazards |

---

## 4. Story Missions & Side Quests (12 Quests Total)

### 4.1 Main Story Campaign Chain (6 Quests)

1. **`MQ2-01: The Corduroy Convoy & Stilt Granary`** (Region 1, Lv 12–14)
   - **Objective**: March east from Redmarsh Outpost along the log causeway `(84, 38)`, relieve Wagon-Master Durn's six bogged supply wagons, and extinguish the brush-fires piled beneath the limestone stilts of Redmarsh Granary (`House 3`).
   - **Lore Item Found**: *Corduroy Road Waybill* (`book-mire-convoy-manifest`) & *Redmarsh Granary Tally* (`book-granary-stilt-accounts`).
2. **`MQ2-02: Crossfire at Twin Passes & Highgate Watch`** (Region 2, Lv 14–16)
   - **Objective**: Scale the middle sandstone spire `(146, 36)` to silence the Sand-Clan hornbow blinds overlooking Twin Passes, rescue Outrider Joren's surrounded scouts in Bracken Basin, and hold Highgate Watch Palisade (`House 4`) against **Zara, the Crimson Prowler**.
   - **Lore Item Found**: *Canyon Crossfire Report* (`book-twin-passes-ambush`) & *Blood-Stained Signal Code* (`book-scattered-scout-scrap`).
3. **`MQ2-03: Rupture of the Quartz Wardstones`** (Region 3, Lv 16–18)
   - **Objective**: Escort Chronicler Zahra to the three fractured primeval Quartz Wardstones `(66, 88)`, `(98, 78)`, and `(112, 114)`, slay **Vekor, the Arc Carapace**, chisel out the reverse blood-wards, and ground the harmonic lattice with copper wire to stop the toxic sandstorms.
   - **Lore Item Found**: *Wardstone Rupture Notes* (`book-wardstone-fracture-study`).
4. **`MQ2-04: Revolt in the Deep Quarry`** (Region 5, Lv 20–22)
   - **Objective**: Descend the three hundred-foot black ironstone terraces of Deep Quarry `(154, 114)`, strike the overseers' winch-chains to arm Miner Gorin's prisoner revolt, and open the flooded lower gallery to cut Ironheart Bastion's ore supply.
   - **Lore Item Found**: *Smuggled Quarry Tally* (`book-quarry-slave-petition`).
5. **`MQ2-05: The Fork of Spears`** (Region 6 Outer Approach, Lv 22–23)
   - **Objective**: Cover Magistrate Orin's fleeing civilian column along the raised causeway, relieve Lieutenant Corin's starved garrison at the blockhouse (`House 5`), and storm both eastern and western causeways of the Forked Peak `(118, 164)` & `(136, 164)`.
   - **Lore Item Found**: *Blockhouse Siege Journal* (`book-lean-garrison-diary`) & *Magistrate's Evacuation Order* (`book-refugee-column-writ`).
6. **`MQ2-06: The Dry Cisterns of Gorrathul`** (Region 6 Sanctum, Lv 23–24)
   - **Objective**: Breach the steam-sluice gates of **Ironheart Bastion** `(164, 172)`, slay **Gorrathul, the Sand Glutton**, and force open the rusted sluice-wheels—discovering Engineer Vesper's secret audit proving the mountain reservoirs silted dry years ago.
   - **Lore Item Found**: *Ironheart Water Audit* (`book-ironheart-cistern-audit`) & *Notched Meteoric Shield-Core*.

### 4.2 Side Quests & Caravan Contracts (6 Quests)

7. **`SQ2-01: Skulls on the Ochre Ditch`** (Region 1, Lv 13)
   - **Giver**: Surveyor Lyra at Redmarsh Outpost.
   - **Objective**: Follow the hidden dry path marked by bleached sheep-skulls through the sucking bog, intercept the contraband iron wagons, and recover the *Ochre Ditch Survey* (`book-boundary-stone-oath`).
   - **Reward**: `500 Gold`, `800 XP`, *Brine-Vial Pendant* (`brine-vial-pendant.png`, +25% Water/Cold Resistance, +15 HP).
8. **`SQ2-02: The Four-Faced Milestone Trap`** (Region 2, Lv 15)
   - **Giver**: Sabik the Sand-Walker `(32, 42)`.
   - **Objective**: Inspect the defaced crossroads obelisk `(128, 58)` whose chiseling was altered to lure northern relief columns into alkali sinkholes, clear the buried clay firepots, and defeat the `dune-lurker` ambush pack.
   - **Lore Item Found**: *Four-Faced Obelisk Rubbing* (`book-milestone-defacement`).
   - **Reward**: `650 Gold`, `1,000 XP`, *Alkali-Etched Band* (`alkali-etched-band.png`, +3 Agility, +20% Fire Resistance).
9. **`SQ2-03: Kaelen's Bog-Curse Cauldron`** (Region 3 Oasis, Lv 17)
   - **Giver**: Water-Seller Tull.
   - **Objective**: Track **Hexer Kaelen** and **Ssorath, the Venom Patriarch** (`venomscale-ssorath`) to the poisoned oasis well `(84, 106)`, retrieve the debtor's knuckle-bone talisman from the copper-green cauldron, and purify the aquifer with slaked lime.
   - **Lore Item Found**: *Kaelen's Bog-Curse Formula* (`book-hexer-cauldron-notes`).
   - **Reward**: `1,200 XP`, *Viper Antivenom Phial* recipe & *Salt-Crystal Pendulum* (`salt-crystal-pendulum.png`, +18 Mana, +30% Earth/Poison Resistance).
10. **`SQ2-04: The Redrock Probate Redemption`** (Region 4 Salt-Vaults, Lv 19)
    - **Giver**: Tomb-Notary in Redmarsh Outpost (`fac-probate-scriptorium`).
    - **Objective**: Descend into the stranded Third-Dynasty port vaults `(28, 118)`, defeat **Khepri, the Sunken Embalmer** (`ash-embalmer-khepri`), and stamp three *Weighed Silver Tally-Tablets* onto the bitumen canopic altars to release the copper-wired Hollow Knights from their posthumous debt liens.
    - **Lore Item Found**: *Third-Dynasty Canopic Writ* (`book-embalmer-jar-ritual`).
    - **Reward**: `950 Gold`, `1,500 XP`, *Probate Bailiff's Band* (`probate-bailiffs-band.png`, +15% Spell Power, +25% Astral Resistance) + unlocks **Catacomb Bailiff** elite mercenary tier.
11. **`SQ2-05: Behind the Bronze Sluice`** (Region 5 Deep Quarry, Lv 21)
    - **Giver**: Miner Tomas / Miner Gorin.
    - **Objective**: Pump the dark water from the lowest ironstone gallery `(168, 122)`, unseal the submerged Third-Dynasty bronze sluice door that knocked in the dark, and recover the cache of unminted Border Mint silver bars hidden there by Morvessa's drivers.
    - **Reward**: `1,200 Gold`, `1,800 XP`, *Salt-Tempered Falchion* or *Brine-Etched Spire Rod* (Tier 3 Rare/Unique).
12. **`SQ2-06: Timber & Pitch for the Stockade`** (Region 2/5, Lv 18)
    - **Giver**: Carpenter Vane at Highgate Watch.
    - **Objective**: Deliver 4 bundles of Deep Quarry iron plating and bitumen sealant jars to reinforce the salt-rotted oak stakes of Highgate Watch before the second night raid.
    - **Lore Item Found**: *Stockade Timber Ledger* (`book-palisade-repair-tally`).
    - **Reward**: `800 Gold`, `1,300 XP`, *Cured Fen-Hide Armor* (Tier 3).

---

## 5. Draft Dialogues (Disco Elysium Cognitive Format)

### 5.1 Quartermaster Bram & Chronicler Zahra — Redmarsh Arrival (`MQ2-01` / `MQ2-03`)
> **[QUARTERMASTER'S EYE - Medium: Success]**
> *(Bram measures half a pint of boiled, rusty rainwater into a tin dipper, his thumb guarding the rim as if it were melted gold. Behind him, Zahra wipes red alkali grit from a cracked quartz lens.)*
> "Read the ration board before you unbuckle your harness, Commander. Half a pint at sunrise, a gill of vinegar-brine at dusk. The moat water out there turns boot-leather green in three days. And if Zahra is right about those humming quartz pillars on the plateau, we'll be breathing powdered glass before the week is out."
> - **1. `[Astral Shiver]`** "I felt the static in the air three miles north. Someone chiseled reverse blood-wards into the grounding grooves of the Wardstones."
> - **2. `[War Logic]`** "First we pull Durn's supply wagons out of the corduroy mud. An army without salt pork and antivenom doesn't march anywhere."
> - **3. `[Frontier Skepticism]`** "Morvessa bled Thornwick's silver south into this salt-pan. Where did the bullion wagons go, Bram?"

### 5.2 Tomb-Notary Seti — The Third-Dynasty Salt-Vaults (`SQ2-04`)
> **[CHILL OF THE VEIL - Formidable: Success]**
> *(He adjusts spectacles wired with tarnished brass, tapping a ledger bound in cured ray-skin. Down in the sunken pier-vault, armored skeletons rattle their copper rib-bindings in rhythmic cadence.)*
> "Do not mistake them for wild revenants, Commander. Every Hollow Knight in Vault Four died owing grain or silver to the Third-Dynasty Crown. Under Probate Debt Law, their viscera were sealed in bitumen jars and their ribs woven with copper wire until their arrears are discharged. Pay the tally-altar in weighed silver, or shatter Khepri's embalming rod—the law recognizes either settlement."
> - **1. `[Frontier Skepticism]`** "The Third Dynasty evaporated with the inland sea two hundred years ago, clerk. Who's collecting the interest—the sand?"
> - **2. `[Tactical Calculus]`** "Khepri raises four knights every fifteen seconds. We rush the embalmer first and smash the canopic jars."
> - **3. `[Iron Will]`** "No man owes a debt after the grave. We break the seals and give them peace."

### 5.3 Gorrathul, Warden of the Forked Cisterns — Ironheart Bastion (`MQ2-06`)
> **[VISCERAL DREAD - Heroic: Success]**
> *(Steam hisses from the rusted boiler-valves above the twin causeways, crusting Gorrathul's massive basalt plate in white salt-rime. The air around his gauntlets drops below freezing.)*
> "Two causeways, two thousand corpses, and still you climb toward my cisterns with dry canteens! You think I locked the sluices out of malice? Open these gates to your thirsty mob and the whole basin dies by autumn! If you want the keys to the mountain, mercenary, pry them from my cold iron!"
> - **1. `[Tactical Calculus]`** "Look at the open sluice-arches behind him—there's dry dust blowing straight through the reservoir. The cisterns are empty!"
> - **2. `[War Logic]`** "You enslaved three hundred miners and starved a province to guard a silted hole in the rock. Step aside, Gorrathul."
> - **3. `[Iron Will]`** "The road to the Iron Coast goes through your bastion. Brace the vanguard!"

---

## 6. Procedural Music & Ambience Specification

Ready for synthesis via `tools/synth-pack6a-music.py` / `tools/gen-soundtrack.py`:

| Cue Role | Existing File (`public/audio/`) | Key & Scale | Tempo & Meter | Instrumentation (Physical Modeling) | Mood & Dynamic Layering |
|----------|---------------------------------|-------------|---------------|-------------------------------------|-------------------------|
| **City Hub (Redmarsh)** | `music_town_redmarsh.m4a` + `amb_town_redmarsh.m4a` | E Phrygian Dominant (`Hijaz: E-F-G#-A-B-C-D`) | `64 BPM`, `4/4` slow caravan sway | Plucked oud/cittern, dry frame-drum heartbeat, breathy bone-flute, creaking stilt-ropes & alkali wind | Parched endurance, salt-crusted refuge, ancient inland-sea melancholy |
| **Region Explore (Corduroy & Plateau)** | `music_explore_act2_marsh.m4a` + `amb_redmarsh_swamp.m4a` | G Hungarian Minor (`G-A-Bb-C#-D-Eb-F#`) | `72 BPM`, `5/4` (`3+2`) limping trek | Bowed rebab/viola, metallic quartz-chime shimmer, low brass swell, bubbling brine & static crackle | Blistering sun over bleached ribcages, humming fractured wardstones |
| **Region Explore (Twin Passes & Quarry)** | `music_explore_act2_canyon.m4a` + `amb_canyon_wind.m4a` / `amb_quarry.m4a` | C# Phrygian | `80 BPM`, `4/4` heavy work-cadence | Deep anvil/pickaxe metallic clank on beat 3, low duduk drone, taut timpani roll, echoing canyon wind | Vertical claustrophobia, chained quarry labor, ambush tension on high ledges |
| **Standard Combat** | `music_battle_act2.m4a` | E Phrygian Dominant | `132 BPM`, `4/4` with `3+3+2` darbuka/taiko accents | Rapid frame-drums, biting brass fanfares, tremolando strings, scimitar-clink transients | Relentless desert blitz, venomous vipers and arcing scarab bolts |
| **Act Boss (Gorrathul)** | `music_boss_gorrathul.m4a` | C Locrian / C Minor | `116 BPM`, `4/4` crushing industrial march | Steam-valve hiss percussion, sub-bass bronze tuba blasts, icy high-register celesta shards, anvil slams | Colossal weight of basalt and freezing brine; tragic guardian of an empty well |

---

## 7. Progression, Rewards & Bridge Items to Map 3

### 7.1 Region Level & Equipment Gate Curve
- **Regions 1–2 (Lv 12–16)**: Player transitions from Tier 2–3 gear into full Tier 3 (`Steel Sword` / `Rune Staff`, `Tower Shield`, `Salt-Tempered Falchion`, `Salt-Backed Horn-Bow`).
- **Regions 3–4 (Lv 16–20)**: High Lightning (`Air`) and Poison (`Earth`) resistance gear is required to survive the ruptured Wardstones and Probate Salt-Vaults. Player unlocks mid-tier Runewords (`Lore`, `Ancient's Pledge`, `Stealth`, `Rhyme`) and Flawless Gems.
- **Regions 5–6 (Lv 20–24)**: Redmarsh Armory unlocks Tier 4 weapons/armor (`Knight Sword`, `Star Staff`, `Knight Shield`, `Steel Helm`). Defeating Gorrathul drops guaranteed Tier 4 Unique/Set artifacts.

### 7.2 Key Items Carrying Forward into Map 3 (`The Iron Coast`)
1. **Gorrathul's Notched Tower-Shield Core** (Unique Shield / Focus Component, Tier 4): `+5 Def`, `+4 Abs`, `+30% Water/Cold Resistance`, `"Forged from meteoric slag and pitted by forty years of siege-stone."`
2. **Third-Dynasty Hydraulic Charts** (Copied by Chronicler Zahra in Ironheart Bastion): Required in Map 3 (`MQ3-04`) to equalize the bronze capstans at **Riverlock Crossing** and drain the tidal galleries of the **Sunken Citadel**.
3. **Conclave Calibrated Quartz Prism** (Reward from `MQ2-03`): Grants the hero access to the **Thermodynamic Conclave** laboratory in Oakhaven Harbor (`fac-expelled-collegium`), unlocking galvanic copper armor upgrades and high-tier Air/Fire invocations.
