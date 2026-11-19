# Gemini / Canva Brief: Art Wave 3 (Thornvael)

One image per prompt, ~2 min pause between prompts.
- Sprite sheets (base item icons, environmental animations, city buildings) use a flat solid magenta (`#ff00ff`) background with generous gaps and zero background shadows so Python/Canva cutting scripts can key clean alpha.
- Boss AoE ground telegraphs use a pure solid black (`#000000`) background for clean additive / radial alpha extraction.
- Save raw sheets under `tools/.canva-sheets/wave3-<name>.jpg` (or regenerate reproducibly via `python tools/gen-art-wave3.py`).

Common rules (inside every prompt): painted classic dark-fantasy CRPG art, tarnished iron, aged bronze, oiled leather, weather-stained masonry, upper-left lighting, crisp dark silhouettes, no text, no numbers, no watermarks.

---

## Part 1: Missing Base Item Icons (`public/itemicons/*.png`, 64x64)

Each prompt generates a 4x4 grid (16 separate icons) on flat solid magenta (`#ff00ff`), top-left specular highlight, no text, no borders:

1. **wave3-icons-blades** — Generate an image, square 1:1. Dark-fantasy RPG inventory icon sheet on a flat solid magenta (`#ff00ff`) background, 4x4 grid of 16 separate weapons: rusty short sword, iron broadsword, steel arming sword, gilded knight sword, emerald thorn blade, two-handed claymore, bastard greatsword, wavy flamberge, wide executioner blade, monumental zweihander, flint stiletto, steel rondel dagger, duelist poignard, parrying main-gauche, shadow-steel dirk, slender adamantium needle. Clean silhouettes, no text, painted dark-fantasy RPG style.
2. **wave3-icons-axes-maces-bows** — Generate an image, square 1:1. Dark-fantasy RPG inventory icon sheet on a flat solid magenta (`#ff00ff`) background, 4x4 grid of 16 separate weapons: woodcutter handaxe, bearded battleaxe, tempered war axe, crescent broadaxe, twin-bit berserker decapitator, spiked wooden cudgel, flanged iron mace, chained heavy morningstar, steel warhammer, volcanic obsidian greatmaul, ash shortbow, horn recurve bow, composite war bow, heavy steel-prodded arbalest, rune-winged windpiercer greatbow, and a reinforced steel kite shield. Clean silhouettes, no text, painted dark-fantasy RPG style.
3. **wave3-icons-staves-wands-foci** — Generate an image, square 1:1. Dark-fantasy RPG inventory icon sheet on a flat solid magenta (`#ff00ff`) background, 4x4 grid of 16 separate arcane items: gnarled oak staff, pale ash staff, etched rune staff, sapphire star staff, living thorn staff, willow apprentice wand, polished yew wand, amber focus wand, crystal siphon wand, astral archon wand, novice glass focus orb, chiseled quartz focus, glowing astral sphere, gilded spell-mirror, cosmic eye orb, steel citadel aegis shield. Clean silhouettes, no text, painted dark-fantasy RPG style.
4. **wave3-icons-armor-helms-boots-gloves** — Generate an image, square 1:1. Dark-fantasy RPG inventory icon sheet on a flat solid magenta (`#ff00ff`) background, 4x4 grid of 16 separate armor pieces: boiled leather cap, iron pot helm, steel greathelm, scholar cloth hat, pointed wizard hat, gothic full plate cuirass, interlocking ring mail, studded leather armor, hardened brigandine, dragon-scale wyrm cuirass, steel war greaves, iron-shod boots, swift winged leather boots, silk caster gloves, heavy titan war gauntlets, shadowstrike leather grips. Clean silhouettes, no text, painted dark-fantasy RPG style.
5. **wave3-icons-jewelry-potions-scrolls** — Generate an image, square 1:1. Dark-fantasy RPG inventory icon sheet on a flat solid magenta (`#ff00ff`) background, 4x4 grid of 16 separate accessories and consumables: ruby ring of might, emerald ring of grace, sapphire ring of insight, ivory ring of calm, copper band, carved bone ring, bloodstone pendant, ember charm, frost charm, storm charm, ruby healing draught flask, sapphire mana draught flask, golden attribute elixir vial, crimson fire spell scroll, frost-blue spell scroll, leather-bound arcane spell tome with brass clasp. Clean silhouettes, no text, painted dark-fantasy RPG style.

---

## Part 2: Environmental Animations (`public/art-wave3/env-anims.{png,json}`, WISHLIST C6)

1. **wave3-env-torches-bonfire** — Generate an image, landscape 3:2. Top-down 3/4 RPG sprite sheet on a flat solid magenta (`#ff00ff`) background, 2 rows of 6 frames: top row shows 6 sequential animation frames of a wrought-iron sconce torch with flickering amber-orange flame and rising sparks; bottom row shows 6 sequential animation frames of a stone-ringed log bonfire leaping from low coals to tall bright flames. Identical anchor positions across frames, no ground patches, no text, painted dark-fantasy style.
2. **wave3-env-banners** — Generate an image, landscape 3:2. Top-down 3/4 RPG sprite sheet on a flat solid magenta (`#ff00ff`) background, 3 rows of 4 frames: row 1 shows 4 animation frames of a green-and-gold Thornwatch war banner rippling in wind; row 2 shows 4 animation frames of a crimson-and-brass Ironbound banner waving; row 3 shows 4 animation frames of an indigo-and-copper Conclave banner fluttering. Fixed wooden pole base across frames, no text, painted dark-fantasy style.
3. **wave3-env-smoke-wheel-cauldron** — Generate an image, landscape 3:2. Top-down 3/4 RPG sprite sheet on a flat solid magenta (`#ff00ff`) background, 3 rows of 6 frames: row 1 shows 6 rising smoke column plume frames drifting upward; row 2 shows 6 rotation phases of a mossy wooden water mill wheel with white foam droplets; row 3 shows 6 bubbling iron tripod cauldron frames glowing toxic emerald-amber inside. Identical scale, no text, painted dark-fantasy style.

Target atlas keys: `torch-flicker/0..5`, `banner/thornwatch/0..3`, `banner/ironbound/0..3`, `banner/conclave/0..3`, `smoke-column/0..5`, `water-wheel/0..5`, `bonfire/0..5`, `cauldron/0..5`.

---

## Part 3: Boss AoE Telegraphs (`public/art-wave3/boss-telegraphs.{png,json}`, WISHLIST B11)

1. **wave3-telegraphs-shared** — Generate an image, landscape 3:2. Top-down game VFX decal sheet on a pure solid black (`#000000`) background for additive ground projection: crisp outer warning rune ring, 4 progressive inner fill rings (25%, 50%, 75%, 100%), a horizontal directional beam telegraph lane with hazard chevrons, and a 60-degree frontal cone telegraph arc. Luminous amber-gold lines, clean geometric precision, no text.
2. **wave3-telegraphs-bosses** — Generate an image, landscape 3:2. Top-down game VFX decal sheet on a pure solid black (`#000000`) background, 4 rows of 4 decals (ring, cone, line, glyph):
   - Row 1 (`morvessa`): venomous acid-green spider-web ring, toxic spray cone, spine-lash line, and Salt-Tithe spider-ledger glyph.
   - Row 2 (`gorrathul`): glacial ice-cyan freeze ring, stone-acid cleave arc, subterranean earth-fissure charge lane, and Forked-Cistern sluice-key glyph.
   - Row 3 (`vesperion`): storm-azure frost-nova ring, grapeshot scatter cone, ball-lightning arc lane, and Drowned Choir broken-astrolabe glyph.
   - Row 4 (`ashkarath`): molten cinder-orange fire ring, hellfire breath cone, crimson red-lightning beam lane, and Seven-Seal star-iron crown glyph.

Target atlas keys: `ring/outer`, `ring/fill-0..3`, `line/beam`, `cone/arc`, and `{morvessa,gorrathul,vesperion,ashkarath}/{ring,cone,line,glyph}`.

---

## Part 4: Four-City Building Silhouettes (`public/art-wave3/city-buildings.{png,json}`, WISHLIST B5)

Top-down 3/4 isometric-orthogonal CRPG buildings on flat solid magenta (`#ff00ff`), unified architectural silhouette per city, upper-left lighting, no ground tiles, no text:

1. **wave3-city-thornwick** — Generate an image, landscape 3:2. Five separate dark-fantasy frontier timber-and-granite buildings for **Thornwick Market** arranged in a row on `#ff00ff`: timber gable tavern with warm windows and ale kegs, stone-chimney smithy with outdoor anvil, steep slate-spired border temple, twin-turret timber-and-stone gatehouse, and wooden-hoarded stone watchtower with roof brazier.
2. **wave3-city-redmarsh** — Generate an image, landscape 3:2. Five separate desert-salt limestone buildings for **Redmarsh Outpost** arranged in a row on `#ff00ff`: tiered caravanserai tavern with ochre awning, domed salt-brick smelter smithy, twin-obelisk quartz ward temple, spiked sandstone canyon bastion gate, and tapered limestone signal watchtower with copper lightning rod.
3. **wave3-city-oakhaven** — Generate an image, landscape 3:2. Five separate storm-slate maritime buildings for **Oakhaven Harbor** arranged in a row on `#ff00ff`: gambrel-roofed port tavern with ship lantern, riveted-brick naval anchor foundry, copper-domed Conclave observatory temple, sea-wall chain-winch harbor gatehouse, and stone cliff lighthouse watchtower with whale-oil prism lamp.
4. **wave3-city-ironcamp** — Generate an image, landscape 3:2. Five separate volcanic basalt-and-iron fortress buildings for **Ironcamp Forge-Hold** arranged in a row on `#ff00ff`: iron-ribbed basalt tavern bunker, twin-smokestack blast foundry smithy with glowing magma sluice, spiked obsidian Anchor-Seal temple, jagged obsidian fortress gatehouse with glowing lava vents, and iron-crowned volcanic watchtower.

Target atlas keys: `{thornwick,redmarsh,oakhaven,ironcamp}/{tavern,smithy,temple,gate,watchtower}`.
