# MAP 3 DESIGN: THE IRON COAST & DROWNED CITADEL (`map-3-iron-coast`)

## 1. Macro Map Specification & Topology

- **Map ID**: `map3-iron-coast` (consolidating Act III nodes `m24`–`m35`, `town-oakhaven`, and `drowned-choir` into one huge coastal-estuary and drowned-fortress world map).
- **Dimensions**: `192 x 192` tiles (`36,864` tiles, 12x12 terrain chunks of 16x16 tiles), with inner boss sanctum **The Drowned Choir / Burning Flagship Quarterdeck** (`64 x 64` or seamless harbor-mouth basin `x: 140..186, y: 140..186`).
- **Primary Biome & Theme**: `highlands` (`setTerrainTheme('highlands', seed)`, ground skin `public/terrain/skin-highland.png`), blending wind-scoured chalk cliffs (`Terrain.Rock`), kelp-choked tidal marshes (`Terrain.Marsh`), crashing ocean surf (`Terrain.Water`), and submerged stone barbicans (`skin-crypt.png`). Feature zones use `BIOME_ZONES.highlands` (`crypt`, `snow`) and `BIOME_ZONES.marsh` (`ruinstone`).
- **Time of Day & Weather**: Equinoctial storm twilight (`day: 1200`) with driving coastal rain, lightning flashes over the outer mole, and black whale-oil smoke rising from Harborwatch bay.
- **City Hub Position**: **Oakhaven Harbor (`town-oakhaven`)** crowns the Walled Promontory where the Greywash Canal meets the sea (`x: 16..52, y: 74..116`).

---

## 2. The City Hub & Six Named Regions

| # | Region Name | Bounds `(x1,y1)..(x2,y2)` | Req. Hero Level | Biome & Feature Zones (`BIOME_ZONES`) | Key Objects (`objects.json`), Shrines & Waypoints |
|---|-------------|---------------------------|-----------------|---------------------------------------|--------------------------------------------------|
| **0** | **Oakhaven Harbor (City Hub)** | `(16, 74)..(52, 116)` | **Lv 24** | `highlands` walled port; zone: `ruinstone` | Fish-Market Tavern & Triage Square (`House 0`), Drydock Chandlery (`House 1`, tiers `[3,5]`), Conclave Galvanic Tower (`House 2`), Waypoint `wp-oakhaven`, `camp/palisade`, `camp/banner` |
| **1** | **Cinder Wards & Blighted Orchard** | `(53, 64)..(112, 122)` | **Lv 24–26** | `highlands` / `forest`; zone: `crypt` | Burned Tenements outside Tanner's Gate, Chapel Nave Infirmary (`House 3`), Blighted Cider-Orchard `(88,76)` (`bones/skullspike`, `highland/oak`), Healing Shrine `(72,92)`, Adventure `magic_well` `(64,82)`, Waypoint `wp-cinder-wards` `(78,96)` |
| **2** | **Greywash Canal & Riverlock** | `(48, 12)..(124, 63)` | **Lv 26–28** | `marsh`; zone: `ruinstone` | Twin Bronze Capstans & Floodgates `(86,36)`, Moorland Artillery Ridge `(68,28)`, Age-of-Chains Bedrock Pass `(112,24)`, Mana Shrine `(82,44)`, Adventure `watermill` `(94,32)`, Waypoint `wp-riverlock` `(88,38)` |
| **3** | **Hourglass Spit & Smuggler Caves** | `(12, 123)..(114, 184)` | **Lv 28–30** | `marsh` / coastal shingle; zone: `ruinstone` | Black Anchor-Rock & Flooding Shingle Bar `(64,158)`, Baron Vane's Counterweight Hoist & Sea-Caves `(28,164)`, Haste Shrine `(58,148)`, Waypoint `wp-hourglass-spit` `(62,152)` |
| **4** | **Sunken Citadel & Drowned Choir** | `(125, 12)..(186, 74)` | **Lv 30–32** | `crypt` (`skin-crypt.png`) + `Water`; zone: `ruinstone` | Submerged Barbican Galleries, Third Sea-Arch Spiral Stair `(158,38)`, Drowned Choir Nave `(172,24)` (`ruins/arch`, `ruins/column`), Ward Shrine `(146,48)`, Adventure `creature_bank` `(176,44)`, Waypoint `wp-sunken-citadel` `(148,52)` |
| **5** | **Starved Bastion & Cliff Batteries** | `(113, 75)..(186, 134)` | **Lv 32–34** | `highlands` (`skin-highland.png`); zones: `crypt`, `snow` | Ridge of Clashing Banners `(132,96)`, Starved Cliff-Watch Bastion (`House 4`), 3 Bronze Culverin Emplacements `(164,88)`, `(168,106)`, `(162,122)`, Combat Shrine `(144,102)`, Waypoint `wp-cliff-batteries` `(152,104)` |
| **6** | **Burning Harborwatch & Flagship** | `(115, 135)..(186, 186)` | **Lv 34–36** | `highlands` / burning quays; zone: `ruinstone` | Outer Mole & Boom-Chain Winch `(138,154)`, Great Prism Lighthouse (`House 5`, `(152,146)`), 6 Fire-Hulks & Vesperion's Flagship `(174,172)`, Armor Shrine `(146,162)`, Waypoint `wp-harborwatch` `(144,158)`, Exit `caravan` to Map 4 `(180,178)` |

### 2.1 Road, Canal & Tidal Network
- **Tanner's Gate & The Moorland Road (West–North)**: Exits Oakhaven `(52, 88)` through the burned clearings of the **Cinder Wards** `(78, 96)` north to the bronze floodgates of **Riverlock Crossing** `(88, 38)`.
- **The Tidal Causeway to the Sunken Citadel (North-East)**: Turning the twin capstans at Riverlock lowers the water in the coastal basin, exposing the kelp-slick stone causeway into the **Sunken Citadel** `(148, 52)`.
- **The Shingle Bar of Hourglass Spit (South-West)**: A narrow gravel spit `(64, 158)` linking the southern sea-caves `(28, 164)` to the lower harbor wall.
- **The Cliff-Battery Trail (East)**: Switchback artillery haul-road climbing from the Cinder Wards past **Starved Bastion** (`House 4`) to the three bronze culverin batteries `(168, 106)` overlooking **Harborwatch Bay** `(174, 172)`.

---

## 3. Enemy Roster, Super-Uniques & Boss Balance

All enemies strictly reference existing sprite atlases in `public/sprites/` and families in `public/data/monsters.json`:

| Region | Regular Monster Families (`monsters.json`) | Palette Tiers | Mini-Boss / Super-Unique (`super-uniques.ts`) | Tactical AI & Affixes |
|--------|--------------------------------------------|---------------|-----------------------------------------------|-----------------------|
| **1. Cinder Wards & Cider-Orchard** | `spore-matron`, `maggot-swarm`, `night-orchard` (Dark ward weaver), `ash-weaver` | Tiers `3–4` (Copper / Cobalt) | **Ignisweb, the Burning Matron** (`cinderweb-arachna`, Tier 4 `spore-matron`) | `hexer_caster` AI: coats ground in Venomfire Web poison/burn clouds + `Weaken`, `fire_enchanted`, `extra_strong`, `cursed`, 5x `maggot-swarm` retinue |
| **2. Greywash Canal & Riverlock** | `witch-doctor` (Marsh hexer), `fetish-blowdart` (Poison dart sniper), `stormtree`, `silt-colossus` | Tiers `4` (Cobalt) | **Zulmar, High Hexer of the Mire** (`bog-hexer-zulmar`, Tier 5 `witch-doctor`) & **The Elder Juggernaut** (Tier 5 `silt-colossus`) | Zulmar: `shaman_reviver`, `fire_enchanted`, `magic_resistant`, `blessed_aura`, 6x `fetish-blowdart` snipers; Elder Juggernaut: Age-of-Chains bedrock construct (`stone_skin`, `extra_strong`) |
| **3. Hourglass Spit & Smuggler Caves** | `salt-crab` (Coastal shell blocker), `lantern-eel` (Bog arc striker), `glasswing`, `rift-moth` (Astral drain flyer) | Tiers `4` (Cobalt) | **Valkor, the Rimewing** (`rimewing-valkor`, Tier 4 `glasswing`) | `ranged_kiter` AI: `cold_enchanted`, `teleporting` Rift Blink, `extra_fast`, 4x `rift-moth` mana-draining escort |
| **4. Sunken Citadel & Drowned Choir** | `hollow-king` (Undead monarch), `hollow-knight`, `frost-bell` (Chilling astral bell), `lantern-eel` | Tiers `4–5` (Cobalt / Amethyst) | **Choir-Prelate Morcant** (Tier 5 `frost-bell`, `cold_enchanted`, `mana_burn`) | Sub-aquatic undead phalanxes backed by `frost-bell` chilling resonance and `lantern-eel` chain lightning |
| **5. Starved Bastion & Cliff Batteries** | `stormtree` (Lightning colossus), `rootbound`, `storm-kite`, `wendigo-bruiser` (Frosthorn Bruiser) | Tiers `4–5` (Cobalt / Amethyst) | **Elder Thunderbough** (`thunderbough-elder`, Tier 5 `stormtree`) | `juggernaut_tank` AI: `lightning_enchanted` Tempest Canopy, `extra_fast`, `stone_skin`, 4x `rootbound` retinue |
| **6. Burning Harborwatch & Flagship** | `doom-knight` (Black Fleet Marine), `ash-weaver`, `frost-bell`, `salt-crab` | Tiers `5` (Amethyst) | **Act Boss: Vesperion, the Hollow Choir / Lord Admiral of the Black Blockade** (`vesperion`, Tier 5, Base HP 580 x 2.9) | Vesperion: `Ball Lightning` piercing orb, `Soul Siphon` mana-to-HP drain, `Frost Nova` shockwave, Grapeshot & Pitch-Lantern deck hazards |

---

## 4. Story Missions & Side Quests (12 Quests Total)

### 4.1 Main Story Campaign Chain (6 Quests)

1. **`MQ3-01: Pledge at Oakhaven & The Cinder Wards`** (Region 0–1, Lv 24–26)
   - **Objective**: Sign the *Articles of the Bailey Truce* with Guild Speaker Corvus and Kors the Shipwright, march out Tanner's Gate into the burning clearings of the **Cinder Wards** `(78, 96)`, and defend Surgeon Meris's Chapel Nave Infirmary (`House 3`) from Vesperion's landing parties.
   - **Lore Item Found**: *Oakhaven Harbor Tariff Roll* (`book-oakhaven-guild-tariff`), *Articles of the Bailey Truce* (`book-oakhaven-truce-articles`), & *Chapel Nave Surgical Log* (`book-infirmary-triage-notes`).
2. **`MQ3-02: Sundered Ranks & Riverlock Crossing`** (Region 2, Lv 26–28)
   - **Objective**: Recover the twenty-four locked shields of Captain Hale's third company on Moorland Ridge `(68, 28)`, slay **Zulmar, High Hexer of the Mire** (`bog-hexer-zulmar`), and turn both bronze capstans at **Riverlock Crossing** `(86, 36)` using Zahra's hydraulic charts to drain the outer tidal basin.
   - **Lore Item Found**: *Moorland Artillery Report* (`book-sundered-ranks-aftermath`) & *Canal Floodgate Operating Writ* (`book-riverlock-manual`).
3. **`MQ3-03: Rescue on Hourglass Spit`** (Region 3, Lv 28–30)
   - **Objective**: Race across the flooding gravel bar of **Hourglass Spit** `(64, 158)` before the white breakers cover the black anchor-rock, slay **Valkor, the Rimewing** (`rimewing-valkor`), and extract Pilot Bram's stranded vanguard from the sea-caves.
   - **Lore Item Found**: *Shingle Spit Crossing Rules* (`book-hourglass-spit-warning`).
4. **`MQ3-04: The Sunken Citadel & Drowned Choir`** (Region 4, Lv 30–32)
   - **Objective**: Wade the drained causeway into the kelp-choked barbican of the **Sunken Citadel** `(148, 52)`, fight up the spiral stair above the third sea-arch `(158, 38)`, and silence the necromantic resonance in the **Drowned Choir** nave `(172, 24)`.
   - **Lore Item Found**: *Citadel Tide & Flood Table* (`book-sunken-citadel-tide-table`).
5. **`MQ3-05: Starved Bastion & The Cliff Culverins`** (Region 5, Lv 32–34)
   - **Objective**: Break the naval siege of Castellan Vane's **Starved Bastion** (`House 4`), clear **Elder Thunderbough** (`thunderbough-elder`) from the cliff haul-road, and secure Master Gunner Tor's three 12-degree bronze culverin batteries `(164, 88)`, `(168, 106)`, and `(162, 122)` to bombard the Black Fleet below.
   - **Lore Item Found**: *Cliff-Watch Siege Rationing* (`book-starved-bastion-log`) & *Sea-Cliff Culverin Orders* (`book-cliff-battery-orders`).
6. **`MQ3-06: Cinders on the Tide (Burning Harborwatch)`** (Region 6, Lv 34–36)
   - **Objective**: Descend into smoke-choked **Harborwatch** `(144, 158)` where six black fire-hulks have rammed the grain-sloops, cut the boom-chain winch `(138, 154)`, board the tilting flagship quarterdeck `(174, 172)`, and slay **Lord Admiral Vesperion** before the powder magazine detonates.
   - **Lore Item Found**: *Final Lighthouse Entry* (`book-harborwatch-lighthouse-log`) & *Vesperion's Salt-Corroded Astrolabe*.

### 4.2 Side Quests & Maritime Guild Contracts (6 Quests)

7. **`SQ3-01: The Blighted Cider-Orchard`** (Region 1, Lv 25)
   - **Giver**: Herbalist Maren / Warden Lyra.
   - **Objective**: Purge the terraced apple orchard below the chalk watchtower `(88, 76)` where hanged deserters were buried among the roots, slay **Ignisweb, the Burning Matron** (`cinderweb-arachna`), and burn the violet-sweating `night-orchard` trees.
   - **Lore Item Found**: *Clearance Fire Order* (`book-cinder-wards-eviction`) & *Cider-Orchard Blight Report* (`book-night-orchard-herbal`).
   - **Reward**: `1,100 Gold`, `2,000 XP`, *Oakhaven Aqua Vitae* & *Smoked-Quartz Monocle* (`smoked-quartz-monocle.png`, +4 Mind, +15% Crit/Accuracy).
8. **`SQ3-02: Baron Vane's Counterweight Hoist`** (Region 3, Lv 29)
   - **Giver**: Harbor-Master Tavin.
   - **Objective**: Uncover the greased counterweight lift inside the sea-caves `(28, 164)` where Baron Vane smuggled Deep Quarry iron and Conclave copper wire to Vesperion's agents in exchange for leaving the sea-gate unbarred.
   - **Lore Item Found**: *Baron Vane's Smuggling Ledger* (`book-vane-vault-inventory`).
   - **Reward**: `1,500 Gold`, `2,400 XP`, *Harbor-Chain Ring* (`harbor-chain-ring.png`, +5 Body, +25% Physical/Cold Resistance).
9. **`SQ3-03: The Age-of-Chains Juggernaut`** (Region 2 North-East Pass, Lv 28)
   - **Giver**: Sage Quillon (`fac-expelled-collegium`).
   - **Objective**: Confront the awakened **Elder Juggernaut** blocking the coastal mountain pass `(112, 24)`, strike the glowing rune-seams between its bedrock shoulder plates with cold arcane fire, and recover its lead-lined binding tablet.
   - **Lore Item Found**: *Age of Chains Rune-Tablet* (`book-juggernaut-binding-scroll`).
   - **Reward**: `2,600 XP`, *Galvanic Copper Aegis* (`galvanic-copper-aegis.png`, Tier 4 Shield, +35% Air/Lightning Resistance) & *Conclave Tuning Fork* (`conclave-tuning-fork.png`).
10. **`SQ3-04: Clashing Banners on the Ridge`** (Region 5, Lv 32)
    - **Giver**: Paymaster Krell in Oakhaven Tavern.
    - **Objective**: March to the storm-swept ridge `(132, 96)` where the rival *Ironclad Banner* and *Ashen Company* mercenaries have deployed pikemen over conflicting salvage charters; defeat the turncoat Ashen instigators and press both surviving cohorts into the Harborwatch relief force.
    - **Lore Item Found**: *Ironclad & Ashen Writ* (`book-mercenary-contract-dispute`).
    - **Reward**: `1,400 Gold`, `2,800 XP`, unlocks **Ironclad Turncoat** & **Oakhaven Marine** veteran mercenaries at half hiring cost.
11. **`SQ3-05: The Cracked Prism of Harborwatch`** (Region 6 Lighthouse, Lv 35)
    - **Giver**: Keeper Aldous's Apprentice.
    - **Objective**: Breach the bronze spiral door of the Great Prism Lighthouse (`House 5`, `(152, 146)`) amidst the oil-smoke, replace the heat-cracked lens with a Conclave quartz prism, and relight the beacon to guide the twelve patched transport carracks clear of the harbor bar.
    - **Reward**: `3,000 XP`, *Beacon-Lens Signet* (`beacon-lens-signet.png`, +20% Spell Power, +25% Fire Resistance).
12. **`SQ3-06: Mudlark Salvage in the Bilge`** (Region 6 Bay, Lv 34)
    - **Giver**: Kors the Shipwright.
    - **Objective**: Protect Pip's mudlarks and wreck-divers along the shallow harbor mud while they strip brass fittings, refined harbor steel bars, and intact grape-shot canisters from sunken blockading sloops.
    - **Reward**: `1,800 Gold`, `2,500 XP`, *Harbor-Guard Estoc* or *Cranequin Sea-Arbalest* (Tier 4 Superior/Rare).

---

## 5. Draft Dialogues (Disco Elysium Cognitive Format)

### 5.1 Kors the Shipwright & Surgeon Sera — The Bailey Truce (`MQ3-01`)
> **[QUARTERMASTER'S EYE - Challenging: Success]**
> *(Kors wipes pine pitch and soot from his forearms with oakum tow. Across the fish-market square, Sera's triage tents reek sharply of boiled vinegar, cauterized flesh, and wet wool.)*
> "The Merchant Council bolted the upper gates while Vesperion's fire-hulks turned my drydocks into charcoal, Commander. Here is the Bailey Truce in plain carpenter's terms: you clear the sunken sea-gates and range Tor's bronze culverins on the cliff wall, and I'll patch twelve carrack hulls strong enough to cross the volcanic straits."
> - **1. `[War Logic]`** "Twelve carracks won't clear the harbor mouth while Vesperion's flagship holds the boom-chain. We take the cliff batteries first."
> - **2. `[Frontier Skepticism]`** "Your Guild Council hoarded whale-oil behind bolted doors until the fire reached their own warehouses. Make sure the armory stays open."
> - **3. `[Veteran Flesh]`** "Get Sera's surgeons the clean linen and vinegar brine they need. Every soldier she saves is another blade on the sea-wall."

### 5.2 Sage Quillon — Thermodynamic Grounding at Riverlock (`MQ3-02` / `SQ3-03`)
> **[ASTRAL SHIVER - Formidable: Success]**
> *(Blue static arcs between the copper coils braided into Quillon's hem and the wet flagstones of the canal lock. He sights through a smoked-quartz monocle toward the submerged barbican.)*
> "The priests in the capital still pray to the tide-saints, as if water and lightning were moody aristocrats! Look at the bronze capstans, Commander: third-dynasty hydraulic engineering paired with galvanic grounding rods. Equalize the canal head, and the Sunken Citadel drains in twenty minutes. Hesitate when the spring swell hits, and fourteen feet of kelp-water crushes your breastplates."
> - **1. `[Tactical Calculus]`** "Two teams on the bronze capstans, heavy shields facing the moorland ridge. We drain the barbican at low ebb."
> - **2. `[Astral Shiver]`** "Something inside that drowned cathedral is singing through the water—a cold, metallic harmony that drains the mana straight from my palms."
> - **3. `[Iron Will]`** "Law or liturgy, if it bleeds or shatters under iron, we'll clear the nave."

### 5.3 Lord Admiral Vesperion — The Burning Flagship (`MQ3-06`)
> **[VISCERAL DREAD - Heroic: Success]**
> *(Burning pitch hisses into black tidewater as the flagship's main deck tilts beneath torn rigging. Vesperion stands by the brass binnacle, his admiral's coat crusted with salt-rime and crackling azure ball-lightning.)*
> "Every keel in Harborwatch was timber waiting to ferry fools to the Ember Core! You think breaking my blockade saves Oakhaven, land-rat? The moment your boots strike the Obsidian Dais, you will crack the seventh Anchor Seal and turn the whole continent into a furnace! I burned a harbor to save a world!"
> - **1. `[War Logic]`** "You burned fishermen and wounded soldiers on wooden piers, Vesperion. The sea doesn't absolve arson."
> - **2. `[Primordial Reckoning]`** "The Anchor Seals are already fracturing. Locking the world in a drowned cellar won't stop the caldera from waking."
> - **3. `[Iron Will]`** "Boarders—watch the roll of the swell and cut the halyards! We take the helm before the powder magazine catches!"

---

## 6. Procedural Music & Ambience Specification

Ready for synthesis via `tools/synth-pack6a-music.py` / `tools/gen-soundtrack.py`:

| Cue Role | Existing File (`public/audio/`) | Key & Scale | Tempo & Meter | Instrumentation (Physical Modeling) | Mood & Dynamic Layering |
|----------|---------------------------------|-------------|---------------|-------------------------------------|-------------------------|
| **City Hub (Oakhaven)** | `music_town_oakhaven.m4a` + `amb_town_oakhaven.m4a` | G Dorian / G Minor | `66 BPM`, `6/8` slow maritime barcarolle | Concertina/reed organ drone, plucked harp/lute, distant harbor curfew bell, creaking halyards & gull cries | Salt-stained port under siege; smell of pine pitch, vinegar, and wet ash |
| **Region Explore (Coast &Cliff Batteries)** | `music_explore_act3_coast.m4a` + `amb_harbor.m4a` | C Aeolian (`C natural minor`) | `78 BPM`, `12/8` rolling ocean swell | Low brass swells, solo oboe/shawm melody, crashing surf white-noise filter, distant naval cannon booms | Storm-lashed chalk cliffs, wet gunpowder, desperate coastal defense |
| **Region Explore (Sunken Citadel & Choir)** | `music_explore_act3_citadel.m4a` + `amb_sunken_citadel.m4a` | F# Locrian / Whole-Tone clusters | `54 BPM`, `4/4` submerged cathedral pulse | Bowed waterphone/bronze bell harmonics, deep pipe-organ pedal point, echoing tidal drips | Sunless underwater gothic ruin; eerie hollow choir resonating through flooded stone |
| **Standard Combat** | `music_battle_act3.m4a` | C Harmonic Minor | `128 BPM`, `6/8` aggressive naval boarding jig/march | Heavy deck-stomp timpani, brass culverin blasts, rapid fiddle/viola arpeggios, cutlass steel clashes | Slippery blood-and-oil decks, lightning arcs, close-quarters boarding fury |
| **Act Boss (Vesperion)** | `music_boss_vesperion.m4a` | B Diminished / B Harmonic Minor | `142 BPM`, `4/4` with syncopated broadside accents | Pipe-organ & spectral choir dissonance, crackling Tesla-coil synth transient, booming bronze cannon hits | Tragic admiral of the drowned fleet; burning tar, ball-lightning, and sinking oak |

---

## 7. Progression, Rewards & Bridge Items to Map 4

### 7.1 Region Level & Equipment Gate Curve
- **Regions 1–3 (Lv 24–30)**: Player equips Tier 4 base items (`Knight Sword`, `Star Staff`, `Knight Shield`, `Steel Helm`, `Wizard Hat`, `Harbor-Guard Estoc`, `Cliff-Gale Selfbow`). High Cold (`Water`) and Lightning (`Air`) resistance is mandatory for Hourglass Spit and the Sunken Citadel.
- **Regions 4–6 (Lv 30–36)**: Oakhaven Chandlery & Conclave Tower unlock Tier 4–5 items and high Runewords (`Spirit`, `Insight`, `Smoke`, `Fortitude`). Defeating Vesperion drops guaranteed Tier 4–5 Unique/Set gear.

### 7.2 Key Items Carrying Forward into Map 4 (`The Obsidian Caldera`)
1. **Vesperion's Salt-Corroded Astrolabe** (Unique Astral Focus / Charm, Tier 4): `+25 Mana`, `+20% Spell Power`, `+25% All Elemental Resistances`, `"Its brass rings spin wildly and lock due south toward the volcanic plume of Crown and Ember."`
2. **Forty Casks of Refined Whale-Oil & Twelve Patched Carracks** (Story Unlock): Enables the naval crossing across the boiling straits to **Ironcamp Forge-Hold** (`town-ironcamp`).
3. **Age-of-Chains Lead-Lined Rune-Tablet** (Reward from `SQ3-03`): Deciphers the seven meteoric valve inscriptions in Map 4 (`MQ4-05`), enabling the Star-Iron grounding sequence at the **Threshold Nave**.
