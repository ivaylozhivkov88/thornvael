# Diablo II Monster Taxonomy, Boss Affixes & Biome Matrix

## 1. Overview & Vision

**Thornvael** combines the orthogonal real-time tactical party controls and spellcasting of classic 1999 isometric fantasy RTS with the legendary dark fantasy enemy diversity, elite modifier system, and biome atmosphere of *Diablo II*.

Rather than facing monotonous enemies or solitary necromancers, players encounter distinct monster families, swarms, skirmishers, resurrection shamans, and SuperUnique bosses across procedurally generated expeditions and campaign missions. Every biome features tailored ecology, elemental affinities, visual terrain, and thematic boss pools.

---

## 2. Monster Archetypes & Behavioral Roles

Every creature family in RoM2 Web is mapped to a core simulation archetype (`Kind`) while exhibiting distinct tactical behaviors:

| Archetype | Sim Kind | D2 Parallels | Behavioral Role & Combat Profile |
|-----------|----------|--------------|-----------------------------------|
| **Swarm / Rusher** | `Gnoll` (4) | Fallen, Ruin Mites, Maggot Swarms | Light HP, high movement speed, swarms in packs, rushes squishy heroes or casters. |
| **Ambusher / Leaper** | `Gnoll` (4) | Sand Leapers, Dune Lurkers, Claw Vipers | Fast strike speeds, charges from fog of war, high burst physical or poison damage. |
| **Tank / Brute / Siege** | `Golem` (5) | Wendigos/Brutes, Thorn Hulks, Basalt Brutes | High base HP, heavy natural absorption, crushing melee damage, slow walking speed. |
| **Disciplined Vanguard** | `Warrior` (0) | Doom Knights, Sand Raiders, Hollow Knights | Moderate speed, balanced physical defense and offense, holds the line and kites melee targets. |
| **Skirmisher / Harrier** | `Imp` (6) | Glasswings, Dune Scarabs, Rift Moths | Fast hit-and-run fliers/strikers, evasive movement, elemental harrying attacks. |
| **Artillery / Sniper** | `Archer` (1) | Quill Fiends, Dark Rogues, Fetish Blowdarts | High-range physical or poisoned projectiles, attacks from behind frontline tanks. |
| **Elemental Caster** | `Mage` (3) / `Imp` (6) | Mire Wisps, Spore Matrons, Cinderlings, Ash Weavers | Long-range elemental magic (Fire, Cold, Lightning, Earth/Poison, Astral), status effects. |
| **Resurrector / Shaman** | `Mage` (3) | Fallen Shamans, Greater Mummies, Witch Doctors | Casts ranged spells and commands minion packs, acts as high-priority tactical target. |
| **SuperUnique / Boss** | `Golem` (5) / `Warrior` (0) | Treehead, Fangskin, Corpsefire, Hephasto, Stormtree | Elite leader units endowed with 2+ composable affixes, increased HP/damage, and minion escorts. |

---

## 3. Elemental Schools & Damage Affinities

Creatures and spells align with RoM2's 6 damage schools:

- **0: Physical**: Standard slashing, piercing, and crushing damage. Resisted by natural body armour (`pdef`) and absorption (`pabs`).
- **1: Fire**: Explosive offensive heat (Firebolt, Fire Wall). Deals intense burst; resisted by Fire resistance.
- **2: Water / Cold**: Chilling frost and ice (Ice Missile, Blizzard). High chilling and crowd-control utility; resisted by Water resistance.
- **3: Air / Lightning**: Crackling electrical arcs (Lightning, Prismatic Sparks). Fast projectile speeds, unpredictable damage spread; resisted by Air resistance.
- **4: Earth / Poison**: Acid, toxic bile, and crushing stone. Bypasses standard armor absorption; resisted by Earth resistance.
- **5: Astral / Arcane**: Raw magical energy and spirit drain. Drains mana and astral shields; resisted by Astral resistance.

---

## 4. Diablo II Elite Affixes & Modifier System

In Diablo II, Champion and Unique mobs roll procedural prefixes and suffixes that dramatically alter battle tactics. RoM2 Web implements composable boss modifiers (`bossMods`):

### Supported In-Sim Modifiers (`BOSS_MOD_IDS`)

| Mod Identifier | Display Name | Sim Stat & Combat Effect |
|----------------|--------------|--------------------------|
| `fire_enchanted` | Fire Enchanted | +4 Min / +6 Max Damage, +50% Fire Resistance, +15% Maximum HP. Fiery glowing aura. |
| `cold_enchanted` | Cold Enchanted | +3 Min / +5 Max Damage, +50% Water Resistance, +15% Maximum HP. Frost chill on hit. |
| `extra_fast` | Extra Fast | +3 Accuracy, +3 Dodge, +10% Maximum HP, increased chase frequency. |
| `stone_skin` | Stone Skin | +4 Dodge, +3 Natural Absorption, +25% Maximum HP. Highly resilient to physical attacks. |
| `magic_resistant` | Magic Resistant | +30% Resistance across all 5 elemental schools (Fire, Water, Air, Earth, Astral), +15% HP. |
| `spectral_hit` | Spectral Hit | +5 Accuracy, +3 Min / +5 Max Damage, +40% Astral Resistance, random elemental bonus. |
| `blessed_aura` | Blessed Aura | Radiates a divine aura every 25 ticks, applying Bless (+15% dmg/accuracy) to nearby same-team minions; +4 Min / +4 Max Damage, +2 Dodge, +2 HP Regeneration. |

### Extended Diablo II Affix Design Matrix

| Mod Identifier | Display Name | Tactical Concept & Diablo II Origin |
|----------------|--------------|--------------------------------------|
| `lightning_enchanted` | Lightning Enchanted | Discharges charged bolts upon taking damage; +50% Air resistance. |
| `extra_strong` | Extra Strong | +100% Physical damage multiplier; brutal on critical strikes. |
| `mana_burn` | Mana Burn | Depletes hero's mana pool on melee hit; +20% magic resistance. |
| `cursed` | Cursed | Applies Amplify Damage / Vulnerability status on hit for 100 ticks. |
| `teleporting` | Teleporting | Blinks away to a nearby unblocked tile when HP drops below 33%. |

---

## 5. Expedition & Campaign Biomes

RoM2 Web features 7 distinct visual and ecological biomes:

### 1. Forest Wilds (`'forest'`)
- **Theme**: Verdant groves, dirt paths, ancient woodland canopies, river streams.
- **Diablo II Echo**: Blood Moor, Cold Plains, Dark Wood (Act 1).
- **Terrain**: `Grass` (Ground), `Dirt` (Path), `Water` (River barrier), `Rock` (Boulders), Dense `Trees`.
- **Ecology**:
  - Regulars: `briar-hound` (pack rusher), `thorn-boar` (charging bruiser), `quill-fiend` (rapid quill sniper), `fallen-shaman` (fire chanter).
  - Boss Pool: `rootbound` (Treehead Woodfist equivalent), `wendigo-bruiser`.
  - Elite Affixes: `extra_fast`, `stone_skin`, `spectral_hit`, `blessed_aura`.

### 2. Marsh Bog (`'marsh'`)
- **Theme**: Stagnant peat bogs, mud crossings, murky ponds, ancient ruins.
- **Diablo II Echo**: Flayer Jungle, Great Marsh, Kurast Docks (Act 3).
- **Terrain**: `Marsh` (Ground, slowing movement), `Dirt` (Path), `Water` (Swamp ponds), `Rock` (Crags), `Trees`.
- **Ecology**:
  - Regulars: `mire-wisp` (cold caster), `salt-crab` (coastal blocker), `fetish-blowdart` (jungle poison sniper), `spore-matron` (earth hexer).
  - Boss Pool: `flintback` (armoured leviathan), `witch-doctor` (Witch Doctor Endugu equivalent).
  - Elite Affixes: `cold_enchanted`, `magic_resistant`, `stone_skin`, `spectral_hit`.

### 3. Aranoch Desert (`'desert'`)
- **Theme**: Sun-scorched dunes, baked dirt paths, rocky outcrops, ancient sandstone.
- **Diablo II Echo**: Rocky Waste, Dry Hills, Far Oasis (Act 2).
- **Terrain**: `Dirt` (Ground), `Grass` (Scrub/Oasis path), `Water` (Dry salt beds / small springs), `Rock` (Sandstone cliffs), No trees.
- **Ecology**:
  - Regulars: `dune-lurker` (ambush striker), `sand-raider` (dual-scimitar speedster), `dune-scarab` (lightning beetle), `claw-viper` (venomous lunger).
  - Boss Pool: `basalt-brute` (siege titan), `claw-viper` (Fangskin equivalent).
  - Elite Affixes: `extra_fast`, `fire_enchanted`, `spectral_hit`, `stone_skin`.

### 4. Lush Oasis (`'oasis'`)
- **Theme**: Vibrant desert springs, palm foliage, fertile sand basins, hidden water sources.
- **Diablo II Echo**: Far Oasis, Maggot Lair outskirts (Act 2).
- **Terrain**: `Grass` (Ground), `Dirt` (Path), `Water` (Deep oasis springs), `Rock` (Basalt bluffs), `Trees` (Palms/verdant scrub).
- **Ecology**:
  - Regulars: `dune-beast` (oasis prowler), `maggot-swarm` (toxic burrowing larvae), `dune-lurker` (sand stalker), `dune-scarab` (charged beetle).
  - Boss Pool: `silt-colossus` (monolithic guardian), `dune-scarab` (Beetleburst equivalent).
  - Elite Affixes: `blessed_aura`, `magic_resistant`, `cold_enchanted`, `extra_fast`.

### 5. Ancient Crypt (`'crypt'`)
- **Theme**: Cobblestone tomb floors, rotten burial chambers, dark necromantic mires.
- **Diablo II Echo**: Crypt, Mausoleum, Catacombs, Tal Rasha's Tombs (Acts 1 & 2).
- **Terrain**: `Dirt` (Ground), `Marsh` (Rotten damp flagstones), `Water` (Underground pools), `Rock` (Catacomb walls), No trees.
- **Ecology**:
  - Regulars: `ruin-mite` (swarming burrower), `hollow-knight` (disciplined skeletal blade), `greater-mummy` (embalmed reviver / Radament equivalent), `fallen-shaman` (cult chanter).
  - Boss Pool: `hollow-king` (Corpsefire / Leoric equivalent), `greater-mummy`, `silt-colossus`.
  - Elite Affixes: `cold_enchanted`, `stone_skin`, `spectral_hit`, `magic_resistant`.

### 6. Frigid Highlands (`'highlands'`)
- **Theme**: Windswept crags, alpine dirt plateaus, glacial winds, basalt peaks.
- **Diablo II Echo**: Frigid Highlands, Arreat Plateau, Ancient's Way (Act 5).
- **Terrain**: `Dirt` (Ground), `Grass` (Tundra turf), `Water` (Mountain tarns), `Rock` (Sheer granite cliffs), No trees.
- **Ecology**:
  - Regulars: `storm-kite` (lightning arc kite), `wendigo-bruiser` (freezing yeti), `basalt-brute` (mountain giant), `gloom-stag` (highland flanker).
  - Boss Pool: `stormtree` (charged lightning colossus / Stormtree equivalent), `crowned-maw` (Apex predator).
  - Elite Affixes: `extra_fast`, `spectral_hit`, `blessed_aura`, `magic_resistant`.

### 7. Volcanic Wastes (`'volcanic'`)
- **Theme**: Ash plains, scalding slag paths, lava rivers, demonic basalt pillars.
- **Diablo II Echo**: Plains of Despair, River of Flame, Chaos Sanctuary (Act 4).
- **Terrain**: `Dirt` (Ash ground), `Marsh` (Scalding slag / slow crust), `Water` (Molten lava rivers), `Rock` (Obsidian cliffs), No trees.
- **Ecology**:
  - Regulars: `cinderling` (flame bolt harrier), `ash-weaver` (flame curse caster), `doom-knight` (armored hell blade), `balrog` (inferno megademon).
  - Boss Pool: `redglass-drake` (fire drake), `hephasto-smith` (Hephasto the Armorer equivalent), `balrog`.
  - Elite Affixes: `fire_enchanted`, `stone_skin`, `extra_fast`, `spectral_hit`.

---

## 6. Full Catalog of 41 Monster Families

All 41 families are codified in `game/public/data/monsters.json` (and `game/dist/data/monsters.json`) across batches A through E with 5 ascending power tiers (Verdant, Ochre, Copper, Cobalt, Amethyst):

| Family ID | Name | Batch | Archetype (`Kind`) | Elem | HP | Min-Max | Speed | Ranged | Caster | Primary Habitat | Role Description |
|-----------|------|-------|-------------------|------|----|---------|-------|--------|--------|-----------------|------------------|
| `briar-hound` | Briar Hound | A | Gnoll (4) | Physical (0) | 42 | 4–8 | 115% | No | No | Forest | Fast pack rusher |
| `flintback` | Flintback | A | Golem (5) | Physical (0) | 95 | 7–12 | 80% | No | No | Marsh | Armoured frontliner |
| `mire-wisp` | Mire Wisp | A | Imp (6) | Water/Cold (2) | 32 | 5–9 | 110% | Yes | Yes | Marsh | Marsh ranged caster |
| `ruin-mite` | Ruin Mite | A | Gnoll (4) | Physical (0) | 36 | 3–7 | 105% | No | No | Crypt | Swarming burrower |
| `thorn-boar` | Thorn Boar | A | Gnoll (4) | Physical (0) | 64 | 6–11 | 108% | No | No | Forest | Charging bruiser |
| `quill-fiend` | Quill Fiend | A | Archer (1) | Physical (0) | 38 | 5–9 | 105% | Yes | No | Forest | Rapid quill sniper |
| `fallen-shaman` | Fallen Shaman | A | Mage (3) | Fire (1) | 46 | 5–9 | 95% | Yes | Yes | Forest, Crypt | Firebolt chanter & reviver |
| `glasswing` | Glasswing | B | Imp (6) | Air/Lightning (3) | 34 | 6–10 | 125% | Yes | No | Highlands | Swift air skirmisher |
| `rootbound` | Rootbound | B | Golem (5) | Earth/Poison (4) | 120 | 8–14 | 70% | No | No | Forest | Heavy earth sentinel |
| `cinderling` | Cinderling | B | Imp (6) | Fire (1) | 30 | 6–9 | 112% | Yes | Yes | Volcanic | Fire bolt harrier |
| `gloom-stag` | Gloom Stag | B | Gnoll (4) | Astral (5) | 76 | 7–12 | 115% | No | No | Forest, Highlands | Forest flanker |
| `salt-crab` | Salt Crab | B | Golem (5) | Water/Cold (2) | 88 | 6–11 | 85% | No | No | Marsh, Coast | Coastal shell blocker |
| `fetish-blowdart` | Fetish Blowdart | B | Archer (1) | Earth/Poison (4) | 35 | 5–10 | 125% | Yes | No | Marsh | Jungle poison dart skirmisher |
| `witch-doctor` | Witch Doctor | B | Mage (3) | Earth/Poison (4) | 70 | 8–13 | 100% | Yes | Yes | Marsh | Marsh hexer & tribal elder |
| `hollow-knight` | Hollow Knight | C | Warrior (0) | Physical (0) | 92 | 8–13 | 95% | No | No | Crypt | Disciplined blade |
| `spore-matron` | Spore Matron | C | Mage (3) | Earth/Poison (4) | 58 | 6–10 | 88% | Yes | Yes | Marsh | Earth poison hexer |
| `dune-lurker` | Dune Lurker | C | Gnoll (4) | Physical (0) | 54 | 7–11 | 118% | No | No | Desert, Oasis | Ambush striker |
| `storm-kite` | Storm Kite | C | Imp (6) | Air/Lightning (3) | 44 | 7–12 | 128% | Yes | Yes | Highlands | Lightning ranged kite |
| `basalt-brute` | Basalt Brute | C | Golem (5) | Earth/Poison (4) | 145 | 11–17 | 68% | No | No | Desert, Highlands | Siege breaker giant |
| `sand-raider` | Sand Raider | C | Warrior (0) | Physical (0) | 86 | 9–14 | 120% | No | No | Desert | Dual-scimitar desert speedster |
| `dune-scarab` | Dune Scarab | C | Imp (6) | Air/Lightning (3) | 68 | 7–12 | 105% | Yes | Yes | Desert, Oasis | Lightning discharge beetle |
| `claw-viper` | Claw Viper | C | Gnoll (4) | Earth/Poison (4) | 98 | 10–15 | 122% | No | No | Desert, Oasis | Venomous desert lunger |
| `dune-beast` | Dune Beast | C | Gnoll (4) | Physical (0) | 75 | 8–13 | 114% | No | No | Oasis | Oasis leaper & pack prowler |
| `maggot-swarm` | Maggot Swarm | C | Gnoll (4) | Earth/Poison (4) | 50 | 6–10 | 98% | No | No | Oasis | Toxic burrowing larva swarm |
| `lantern-eel` | Lantern Eel | D | Imp (6) | Air/Lightning (3) | 52 | 7–13 | 112% | Yes | Yes | Marsh | Bog arc striker |
| `ash-weaver` | Ash Weaver | D | Mage (3) | Fire (1) | 60 | 8–13 | 96% | Yes | Yes | Volcanic | Flame curse caster |
| `pale-burrower` | Pale Burrower | D | Gnoll (4) | Earth/Poison (4) | 72 | 8–14 | 102% | No | No | Crypt, Desert | Quarry tunneler |
| `ironbark` | Ironbark | D | Golem (5) | Earth/Poison (4) | 160 | 10–16 | 72% | No | No | Forest | Ancient ward treant |
| `rift-moth` | Rift Moth | D | Imp (6) | Astral (5) | 48 | 8–13 | 122% | Yes | Yes | Highlands, Crypt | Astral drain flyer |
| `greater-mummy` | Greater Mummy | D | Mage (3) | Earth/Poison (4) | 110 | 9–15 | 82% | Yes | Yes | Crypt | Ancient crypt embalmer & reviver |
| `hollow-king` | Hollow King | D | Warrior (0) | Water/Cold (2) | 165 | 12–18 | 88% | No | No | Crypt | Undead monarch lord |
| `wendigo-bruiser` | Wendigo Bruiser | D | Golem (5) | Water/Cold (2) | 155 | 11–18 | 74% | No | No | Highlands, Forest | Heavy freezing yeti brawler |
| `crowned-maw` | Crowned Maw | E | Gnoll (4) | Physical (0) | 115 | 11–17 | 108% | No | No | Highlands | Apex pack hunter |
| `frost-bell` | Frost Bell | E | Mage (3) | Water/Cold (2) | 78 | 9–14 | 92% | Yes | Yes | Highlands | Chilling astral bell |
| `silt-colossus` | Silt Colossus | E | Golem (5) | Earth/Poison (4) | 210 | 14–22 | 66% | No | No | Oasis, Crypt | Titanic citadel guardian |
| `redglass-drake` | Redglass Drake | E | Imp (6) | Fire (1) | 125 | 12–19 | 118% | Yes | Yes | Volcanic | Highland fire drake |
| `night-orchard` | Night Orchard | E | Mage (3) | Astral (5) | 96 | 10–16 | 90% | Yes | Yes | Crypt, Volcanic | Dark ward weaver |
| `stormtree` | Stormtree | E | Golem (5) | Air/Lightning (3) | 175 | 12–19 | 75% | No | No | Highlands | Charged lightning colossus |
| `doom-knight` | Doom Knight | E | Warrior (0) | Physical (0) | 135 | 12–18 | 96% | No | No | Volcanic | Heavy armored hell vanguard |
| `balrog` | Balrog | E | Imp (6) | Fire (1) | 140 | 13–20 | 112% | Yes | Yes | Volcanic | Inferno-breathing megademon |
| `hephasto-smith` | Hephasto Smith | E | Golem (5) | Fire (1) | 190 | 14–22 | 76% | No | No | Volcanic | Hellforge anvil titan |

---

## 7. Determinism & Seeded PRNG Execution

In accordance with RoM2's simulation architecture:
1. All procedural map generation uses the Mulberry32 PRNG initialized solely with the caller's seed (`opts.seed >>> 0`).
2. Native `Math.random()` is strictly prohibited across the simulation and map generator.
3. Every generated `MapDoc` is validated against `MAP_FORMAT = 'thornvael-map'` and `MAP_VERSION = 2`.
4. Replay hashes and Sim snapshots are guaranteed to be byte-for-byte deterministic across all 7 biomes.
