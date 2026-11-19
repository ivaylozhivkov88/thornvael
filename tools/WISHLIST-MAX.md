# WISHLIST-MAX - everything we want to add or improve (Thornvael, 2026-11-19)

Purpose: a big backlog for other agents (Antigravity models) so Claude tokens are not spent. Every item says what, why it makes the game better, how to produce it with free/own tools, and where it plugs in. Agents: first INVENTORY what already exists (public/audio, public/sprites, public/townart, public/icons, src/*), mark items already done, then work top-down by value/effort. Rules: original assets only (no the original game/a classic ARPG/HoMM files or text), every binary has an `assets.json` entry, binaries < 3 MiB, English in-game text, deterministic sim, push after each step, never touch `src/sim/path.ts`, `tests/movement.test.ts`, `models/`, `tools/render-unit.py`.
Tags: [S] small <1h, [M] a few hours, [L] a day+. Value 1-5 in (v).

## A. FEEL / JUICE (cheapest way to make the game feel expensive)
1. [M] (5) [PARTIAL - base in `src/feel.ts`, modular `src/fx/` + family bursts missing] Hit feedback: hit-stop (2-4 frames freeze on big hits), screen shake scaled by damage, white flash on the struck sprite, directional blood/ash/spark particles per enemy family, crit "pop" number style. Plugs: `src/render.ts`, floating numbers.
2. [M] (5) [OPEN] Death animations/effects per family: skeleton collapses into bone pieces, beasts leave a short corpse decal, casters burst into motes, bosses get a slow-mo + shake + loot fountain. Corpse decals baked into chunk layer (fade after N sec, capped count for mobile).
3. [S] (4) [PARTIAL - audio in `src/audio.ts`, visual emitter missing] Footstep dust/splash by ground (sand puff, snow crunch, water ripple, ash flick) using the ground skins' biome.
4. [M] (4) [PARTIAL - base in `src/vfx.ts`, unified school palette/glow missing] Spell VFX polish: unique colour language per school (fire orange, frost cyan, arcane violet, shadow green-black), additive glow, light bursts that briefly light the ground.
5. [M] (4) [PARTIAL - torch flicker in `src/feel.ts`] Dynamic lighting layer: torches, campfires, lava, spell casts and the hero light a soft additive radial gradient on a low-res canvas; night/crypt biomes darker. Mobile safe: one low-res multiply overlay.
6. [M] (4) [OPEN] Atmosphere overlays per biome: drifting fog (marsh/crypt), embers (volcanic), dust motes (desert), snow/rain (highlands), fireflies (forest). Prompts already in `tools/GEMINI-OBJECTS-BRIEF.md`; renderer pass = 2-3 parallax layers, additive, per-biome config, off on low-end.
7. [S] (3) [PARTIAL - `src/sim/daynight.ts` exists] Day/night or weather tint per mission (data-driven colour grade per region).
8. [S] (3) [PARTIAL - `src/camera.ts` exists] Camera polish: smooth follow, edge-scroll, zoom limits, small recoil kick on spell cast, intro pan across the region name.
9. [S] (4) [PARTIAL - `src/loot-overlay.ts` exists] Cursor + target feedback: attack/pickup/talk/blocked cursors, ground click ripple, hover outline on enemies and loot with rarity colour.
10. [S] (3) [OPEN] Loot feel: items arc out with a bounce, rarity-coloured beam for rare/unique, short ping sound by rarity, filter toggle.

## B. VISUALS AND ART STILL MISSING (see `tools/INVENTORY.md`)
1. [M] (5) [LOCKED - parallel Map Art agent] Biome main objects with collision wired into generators (palms/cactus, charred trees, obsidian, pines/oak, camp props, ruins arches/columns). Atlas exists (`public/objects/objects.json`, 42 frames); needs ObjectKind extension + y-sorted drawing + reserved/blocked tiles in `src/map-generator.ts` and `src/skirmish-generator.ts`.
2. [M] (4) [OPEN] More object sheets (Gemini/Canva magenta-key pipeline, `tools/obj-cut.py`): graves variants, shrines/altars, braziers, bridges, fences, wells, wagons, signposts, banners per faction, cave mouths, dungeon doors, chests (3 rarities, open/closed), waystones, bonfires, tents per faction, siege remnants, giant bones, cocoons, mushrooms, reeds, lily pads, driftwood, ship wrecks (Iron Coast).
3. [M] (4) [LOCKED - parallel Map Art agent] Ash/volcanic main ground + lava river tiles with animated glow; snow main ground; swamp mud; road/cobble; bridge tiles; shoreline foam. (Gemini refused ash: do procedural in `tools/make-terrain.py`.)
4. [M] (4) [PARTIAL - foam in `src/aesthetic-vfx.ts`] Animated water + lava (2-4 frame tile cycle or a shader-free scrolling overlay), shore foam, reeds sway.
5. [L] (4) [PARTIAL - `public/townart/` has scenes & portraits] Building set for the 4 cities (houses, smithy, tavern, temple, gate, wall, tower) in a unified silhouette per city; town hub backdrop art (`public/townart` exists: inventory first).
6. [M] (4) [PARTIAL - 161 icons in `public/itemicons/`, base items need fill] Item icons coverage: every item base type and every unique has its own icon (`public/itemicons` exists: inventory gaps by comparing to item tables in `src/`). Rarity frames.
7. [M] (3) [PARTIAL - `src/gothic-hud.css` / `townstyle.css`] UI skin pass: consistent dark-fantasy panels (inventory, spellbook, shop, tavern, quest log, roster, pause), 9-slice frames, button states, tooltip style, scrollbars, minimap frame, health/mana orbs with liquid animation, XP bar, belt/hotkey slots. Pure CSS + a few small PNG/SVG pieces.
8. [S] (3) [OPEN] Loading screens and splash art per map (4 key paintings), title screen with animated embers, logo lockup.
9. [S] (3) [OPEN] Spell and skill icons for every spell, buff/debuff icons, status effect overlays on units (burning, frozen, poisoned, stunned).
10. [M] (3) [DONE - paperdoll layers in `public/townart/doll/` (26 files); world sprite armor tiers open] Hero armour tiers visual: at least 3 body tiers + weapon variants shown on the sprite (layering approach: base body + overlays), if the sprite pipeline allows; otherwise colour-tint tiers.
11. [M] (3) [OPEN] Boss telegraphs: ground decals for AoE (circle/line/cone), ring that fills, rune glyph styles per boss.
12. [S] (2) [PARTIAL - `src/minimap.ts` & `src/automap.ts`] Minimap polish: fog fade, region name labels, quest markers, ping.

## C. SPRITES / ANIMATION
1. [M] (4) [DONE 53/53 atlases exist; FAMILY_VISUALS tuning open] Inventory of 52 redone units: check every unit has idle/walk/attack/hit/death in all needed directions and consistent scale/anchor; re-do weak ones (list in `tools/HANDNOTE.md`: generic descriptions). Tune `FAMILY_VISUALS` in `src/render.ts` (~line 121) with `?art=1`.
2. [L] (4) [PARTIAL - affixes in `src/auras.ts` & `src/render.ts`] Elite/champion affixes visually: coloured aura, name tag colour, small crown icon; unique "mini-boss" tint palettes generated by palette swap (cheap: no new art).
3. [M] (3) [OPEN - portraits exist in `public/townart/portraits/`, overworld NPC anims missing] NPC sprites for towns: smith, innkeeper, mage, priest, guard, villager variants with idle loops; sitting/working poses.
4. [M] (3) [PARTIAL - `public/sprites/{warrior,archer,mage}.json` exist] Companion/mercenary sprites matching hire list.
5. [S] (3) [OPEN] Projectile sprites: arrow, bolt, fireball, frost shard, shadow orb, thrown axe, with trails.
6. [M] (3) [OPEN] Environmental animations: torch flicker, banner wave, smoke columns, water wheel, bonfire, cauldron.

## D. MUSIC AND AUDIO (see `tools/INVENTORY.md`: 233 `.m4a` files already exist)
Current: `public/audio` already has 30 `music_*` tracks (menu, 4 towns, 8 explore, 6 battle, 4 boss, 2 cutscene, victory, defeat, low_hp), 28 `amb_*` biome/ev0 loops, 16 `step_*` footsteps, 32+ spell cast/impact pairs, 12 `hit_*`, 5 `loot_*`, 9 `ui_*`, 4 `town_*`. Remaining gaps:
1. [L] (5) [PARTIAL - 30/41 tracks exist] Complete Music set (AAC .m4a, loopable, < 3 MiB): add missing 3rd explore region theme per map, skirmish biome themes (`music_skirmish_*`), character-select theme (`music_char_select`), and final-phase boss stingers; record full provenance in `assets.json`.
2. [M] (4) [OPEN - `src/audio.ts` exists, adaptive director missing] Adaptive music: exploration <-> combat layer crossfade, boss phase stingers, hub-to-field transitions, quiet when talking. Engine: streaming `<audio>`, never decode all (memory).
3. [M] (4) [PARTIAL - 203 SFX/amb files exist] SFX completeness pass: fill missing UI error buzz, snow/ash distinct footsteps, monster family voices (aggro, hit, caster/golem/construct deaths), town market crowd, weather loops.
4. [M] (3) [OPEN] Voice barks: short text-to-speech or recorded lines for NPC greetings and merc barks (Pack 20 content exists in Gemini briefs). Only if licence clean; else skip voices and use text bubbles + grunt SFX.
5. [S] (3) [OPEN] Spatial audio rules: pan by screen position, distance falloff, voice limit per bus, ducking music on boss roar/dialogue.
6. [S] (2) [PARTIAL] Settings: separate sliders for music/sfx/ambient/ui, mute-on-blur, iOS unlock + silent switch handling check on a real iPhone.

## E. GAMEPLAY DEPTH (the "coolest things")
1. [L] (5) [PARTIAL - `src/sim/{affixes,sets,runes,cube,d2-database}.ts` exist; unified design + deterministic `src/items/` pass open] Loot that excites: affix system (prefix/suffix), rarity tiers (common/magic/rare/unique/set), set bonuses, legendary effects with unique names and lore lines, socket + gems/runes, item level scaling, identified/unidentified, vendor refresh, gambling. Needs item table design doc first (+ tests, deterministic RNG).
2. [L] (5) [PARTIAL - `skill-trees.json` exists; deterministic `src/skills/` 3-branch trees open] Skill trees per class with 3 branches each and a clear build identity (Warrior: Berserker/Guardian/Warlord; Mage: Pyromancer/Cryomancer/Necromancer-lite), respec at town for gold, synergies, hotkey loadouts, 6-8 active skills + passives each.
3. [M] (4) [PARTIAL - elite affixes in `src/sim/mechanics.ts` & shrines in mapdata] Elite packs and champions with random affixes (fast, vampiric, shielded, teleporting, fire-aura...) + treasure goblin-like "loot critter" events; shrines in the world (haste, XP, mana, fortune, danger) with timers.
4. [L] (5) [PARTIAL - campaign bosses implemented in Map 1-4 macro maps] Boss fights with real mechanics per boss (phases, adds, telegraphed AoE, enrage timer, arena hazards) for morvessa, gorrathul, vesperion, ashkarath + 4 map bosses; each boss has lore intro and a signature drop.
5. [M] (4) [OPEN] Dungeons: procedurally generated side dungeons/crypts per region (rooms + corridors, 3-5 floors, one miniboss, a chest) entered from the overworld; reuse tiles/skins; deterministic by seed.
6. [M] (4) [PARTIAL - 12 quests per macro map] Quest variety: kill N, fetch, escort, defend (waves), explore region, hunt elite by name, find lore pages, timed delivery, choice-with-consequence; quest log UI with tracking arrows and minimap markers.
7. [M] (4) [PARTIAL - single companion hire in tavern] Companions/mercenaries: hire at tavern, own level/gear, 3 archetypes, resurrect, simple orders (follow/hold/attack).
8. [M] (4) [PARTIAL - `src/sim/cube.ts` exists] Crafting: salvage items into essences, upgrade at smith (+1..+5 with fail risk), reroll one affix, socket gems; sinks for gold.
9. [M] (3) [PARTIAL - `src/achievements.ts`, `src/codex.ts` exist] Achievements and codex: kill counts, bestiary entries with lore, found lore pages, item collection log; shows on character roster card (links to roster work).
10. [M] (4) [PARTIAL - `src/sim/difficulty.ts` exists] Difficulty tiers (Normal/Nightmare/Hell-like: names original, e.g. Wanderer/Veteran/Doomed) with scaling enemies, better drops, new affix pools; "New Game+" on roster.
11. [M] (3) [OPEN] Hardcore/ironman optional hero mode with different tombstone on roster.
12. [S] (3) [PARTIAL - waypoints on macro maps] Town portal / waypoint network across the 4 big maps; fast travel unlocks by exploring.
13. [M] (3) [OPEN] Events: roaming elite hunts, ambushes, caravans to protect, weather-related spawns (fog wraiths), rare spawns with unique drops.
14. [M] (3) [OPEN] Skirmish variety: objectives beyond kill-all (capture shrines, survive waves, escort, king of the hill), map modifiers (fog, plague, bloodmoon), 2-4 player teams, AI personalities, seed share code + daily seed leaderboard (local).
15. [S] (2) [OPEN] Photo mode / replay of last fight (sim is deterministic: replay is cheap).

## F. UX / SYSTEMS
1. [M] (5) [LOCKED - Hero/Roster agent active] Character roster (see HANDOFF-ANTIGRAVITY.md): cards with portrait, class, level, region reached, play time, rare finds, last played; delete/rename/duplicate; export/import file; cloud-free backup reminder.
2. [M] (4) [LOCKED - Hero/Roster agent active] Save/load robustness: autosave, multiple slots per hero, versioned envelope + migration tests, corrupt-save recovery, export/import (iOS eviction defence).
3. [M] (4) [PARTIAL - `src/keybinds.ts`, `src/gamepad.ts`, `src/virtualstick.ts` exist] Controls: touch-first RTS gestures (tap, long-press = right click, drag box, 2-finger pan/pinch), virtual hotbar, gamepad, rebinding screen (`src/keybinds.ts`, `src/gamepad.ts` exist).
4. [S] (3) [OPEN] Accessibility: text size, colour-blind safe rarity (icons not only colour), reduced motion (kills shake/particles), subtitles for barks.
5. [M] (3) [OPEN] Tutorial/onboarding: first mission teaches move/attack/loot/spells with contextual hints that dismiss for good.
6. [S] (3) [OPEN] Tooltips with compare against equipped, "better/worse" arrows, DPS number.
7. [S] (3) [OPEN] Localisation hooks even though English-only now (string keys).
8. [M] (3) [PARTIAL - `tools/benchmark-active300.mjs` exists, full `docs/perf.md` audit open] Performance: 300 units at 60 fps on mid phone; spatial hash audit, chunk bake cost, texture atlas memory, `?debug` stats overlay, offline pack sizes shown in Storage screen.
9. [S] (2) [PARTIAL - `.github/workflows/deploy.yml` exists, offline WebKit/Chromium Playwright test open] PWA polish: install hint on iOS, update prompt only from menu, offline test (Playwright) in CI.

## G. WRITING AND LORE
1. [M] (5) [DONE in `.planning/campaign/` (parallel campaign agent finishing maps 3-4)] World bible, 4 city bibles, villain arc (in `.planning/campaign/`, another agent is on it).
2. [L] (4) [PARTIAL - `content/*.json` raw slices exist; unified 52-unit bestiary + schema validation open] Item flavour text: every unique/set item 1-2 lines of lore; monster bestiary lines (all 52 units); location lore plaques/notes (10 per map); NPC dialogue trees with flags (dialogue-flags session exists); tavern rumours that change with progress.
3. [M] (3) [PARTIAL] Quest text for all missions, short and punchy, with 2-3 morally grey choices per map that affect later NPC lines and a shop.
4. [S] (3) [PARTIAL - raw quotes exist in `content/*.json`; unified i18n-keyed pack + schema open] Loading-screen tips (50), death messages (30), achievement names (60).

## H. TOOLING (to save tokens later)
1. [M] [OPEN] Batch scripts: one command that rebuilds all atlases, audio manifest, `assets.json` provenance stubs, and runs all checks.
2. [M] [OPEN] Playwright smoke test that boots each biome seed, the roster, one mission, goes offline.
3. [S] [DONE - `tools/gen-inventory.mjs` -> `tools/INVENTORY.md`] A `tools/INVENTORY.md` generator listing every asset by category with missing-vs-needed counts, so agents stop re-checking by hand.
4. [S] [OPEN] Seed gallery script: renders N seeds per biome to PNG contact sheets for quick visual review.

## Suggested waves
Wave 1 (max visible impact, low risk): A1-A6, B1, B3-B4, D3, E3, F1-F2.
Wave 2: D1-D2 (music), B2, B5-B7, C1-C2, E4, E6.
Wave 3: E1-E2, E5, E7-E10, G.
Wave 4: everything else, polish, performance, device tests.
