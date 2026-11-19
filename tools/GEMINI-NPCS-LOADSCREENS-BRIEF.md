# Gemini / Canva Brief: Town NPCs & Map Loading Screens (Thornvael)

One image per prompt, ~2 min pause between prompts.
- Town NPC sprite sheets use a flat solid magenta (`#ff00ff`) background in a 3x2 grid (6 NPCs or 2x3 idle frames), saved as `tools/.canva-sheets/npc-<name>.jpg`.
- Loading screen paintings are full-bleed 16:9 widescreen illustrations (no magenta, no text, no UI logos), saved as `tools/.canva-sheets/load-<name>.jpg` and exported under `public/loadscreens/*.jpg` (< 3 MiB each).

## Part 1: Town NPC Idle Sprites (Magenta Keyed)

**town-npcs-idle** — Generate an image, landscape 3:2. Game sprite sheet on a flat solid magenta (`#ff00ff`) background: 6 separate dark-fantasy town NPCs standing in a 3x2 grid facing 3/4 toward the camera: burly blacksmith in leather apron holding a hammer, stout innkeeper with wooden tankard and apron, hooded arcane mage in indigo robes with runed staff, solemn temple priest in white-and-gold vestments, armored town guard in iron half-plate with halberd, weathered peasant villager in wool cloak with lantern. Top-down 3/4 RPG view, every character fully separated by magenta gaps, identical scale, light from the upper left, no text, no ground, no background shadows, painted dark-fantasy style.

## Part 2: 4 Campaign Map Loading Screen Key Paintings (16:9, Full Bleed)

**load-map1-fords** — Generate an image, landscape 16:9. Sweeping dark-fantasy oil painting of Oakhaven and the Border Fords at dusk: a fortified timber-and-stone river crossing guarded by glowing watchtower braziers, misty pine ridges in the distance, muddy cart tracks winding past weathered waystones, moody amber-and-slate sky. Painterly classic CRPG loading screen art, atmospheric depth, no text, no UI, no characters in foreground.

**load-map2-redmarsh** — Generate an image, landscape 16:9. Sweeping dark-fantasy oil painting of the Redmarsh Fen and sunken crypt vaults: twisted dead cypress trees rising from crimson-tinted peat bogs, glowing pale green marsh wisps drifting over drowned stone ruins and mossy monoliths, heavy mist under a bruised violet sky. Painterly classic CRPG loading screen art, atmospheric depth, no text, no UI.

**load-map3-coast** — Generate an image, landscape 16:9. Sweeping dark-fantasy oil painting of the Iron Coast and shattered sea-cliffs: jagged basalt headlands pounded by storm-grey surf, half-buried wooden shipwrecks on dark shingle beaches, a distant iron-spired fortress silhouetted against lightning-lit storm clouds. Painterly classic CRPG loading screen art, atmospheric depth, no text, no UI.

**load-map4-caldera** — Generate an image, landscape 16:9. Sweeping dark-fantasy oil painting of the Obsidian Caldera and Ashkarath's volcanic heartland: rivers of molten orange lava cutting through black basalt plains, towering obsidian spires and smoking fissures, drifting glowing embers against an ash-choked crimson sky. Painterly classic CRPG loading screen art, atmospheric depth, no text, no UI.
