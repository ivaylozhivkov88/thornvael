# Integration Notes: Wave 2 Art & Visual Packs (Thornvael)

All packs below are generated reproducibly by `tools/gen-new-art-packs.py`, registered in `assets.json` (`license: "own"`), and validated by `tests/art-packs.test.ts`. When upgrading any pack with Gemini/Canva art, follow the matching `tools/GEMINI-*-BRIEF.md` and re-pack to the same frame keys and atlas filenames so no game code needs to change.

---

## 1. `public/props-wave2/` -> `src/terrain.ts` & `src/render.ts`

- **Files**: `public/props-wave2/props-wave2.png` + `public/props-wave2/props-wave2.json` (Pixi v8 spritesheet format, 34 frames with `anchor: { x, y }`).
- **Frame keys**:
  - `shrines/healing`, `shrines/war`, `shrines/mana`
  - `chests/common-closed`, `chests/common-open`, `chests/rare-closed`, `chests/rare-open`, `chests/unique-closed`, `chests/unique-open`
  - `bridges/wood-h`, `bridges/stone-v`
  - `lights/brazier`, `lights/bonfire`, `lights/waystone`
  - `banners/ironbound`, `banners/thornwatch`
  - `coast/shipwreck`
  - `flora/mushrooms`, `flora/reeds`, `flora/lilypads`, `flora/driftwood`
  - `graves/tombstone`, `graves/cross`, `graves/slab`
  - `props/fence-iron`, `props/fence-wood`, `props/well`, `props/wagon`, `props/signpost`, `props/cave-mouth`, `props/dungeon-door`, `props/siege-catapult`, `props/giant-bones`, `props/cocoon`
- **Drop-in wiring**:
  1. In `src/terrain.ts` (`loadTerrainArt()`), fetch `/thornvael/props-wave2/props-wave2.json` alongside `objects.json` (or load via `PIXI.Assets.load('/thornvael/props-wave2/props-wave2.json')` in `src/render.ts`).
  2. Extend `ZONE_DECOR` in `src/terrain.ts` to reference `flora/mushrooms`, `flora/reeds`, `flora/lilypads` (marsh/water edges), `graves/*` (crypt), `coast/shipwreck` & `flora/driftwood` (Iron Coast).
  3. For interactive props (`shrines/*`, `chests/*`, `lights/waystone`, `props/dungeon-door`, `props/cave-mouth`), render as Y-sorted `PIXI.Sprite`s using `frame.anchor` (`0.5, 0.92`) so units can pass behind tall tops and chests can swap `*-closed` -> `*-open` on interaction.

---

## 2. `public/spellicons/` -> `src/render.ts` / HUD / `src/shell.ts`

- **Files**: `public/spellicons/spellicons.png` + `public/spellicons/spellicons.json` (18 48x48 frames).
- **Frame keys**:
  - Schools: `school/fire`, `school/frost`, `school/arcane`, `school/shadow`, `school/holy`, `school/earth`
  - Status effects: `status/burning`, `status/frozen`, `status/poisoned`, `status/stunned`, `status/shield`, `status/haste`
  - Core spells: `spell/fireball`, `spell/frost-bolt`, `spell/lightning`, `spell/healing`, `spell/poison-cloud`, `spell/stone-skin`
- **Drop-in wiring**:
  - In Pixi unit status overlays (`src/render.ts` / `src/nameplate.ts`), draw the unit's active debuff/buff texture from `sheet.textures['status/' + statusKey]` above the nameplate.
  - In DOM spellbook/hotbar (`src/shell.ts` or HUD), slice via CSS `background-image: url('/thornvael/spellicons/spellicons.png')` using `frame.x`, `frame.y`, `frame.w`, `frame.h` from `spellicons.json`.

---

## 3. `public/uiskin/` -> `src/shell.ts` & `src/gothic-hud.css`

- **Files**: `uiskin.css`, `panel-frame.png`, `btn-dark.png`, `orb-health.png`, `orb-mana.png`, `rarity-frames.png`.
- **Drop-in wiring**:
  1. Import or link `/thornvael/uiskin/uiskin.css` in `index.html` or `src/shell.ts`.
  2. Apply `.tv-panel` to modal/roster/inventory/shop containers, `.tv-btn` to action buttons, `.tv-orb-hp` / `.tv-orb-mp` to HUD resource orbs, and `.tv-rarity-<tier>` (`common`, `magic`, `rare`, `unique`, `set`) to item slot wrappers.

---

## 4. `public/projectiles/` -> `src/render.ts`

- **Files**: `public/projectiles/projectiles.png` + `public/projectiles/projectiles.json` (21 frames, `anchor: { x: 0.5, y: 0.5 }`).
- **Frame keys**: `arrow/0`, `arrow/trail-0`, `bolt/0`, `bolt/trail-0`, `fireball/0..1`, `fireball/trail-0..1`, `frost-shard/0..1`, `frost-shard/trail-0..1`, `shadow-orb/0..1`, `shadow-orb/trail-0..1`, `thrown-axe/0..3`, `thrown-axe/trail-0`.
- **Drop-in wiring**:
  - Load `PIXI.Assets.load('/thornvael/projectiles/projectiles.json')` at boot in `src/render.ts`.
  - Orient projectile sprite by `Math.atan2(vy, vx)` (`rotation`), cycle `0..1` (or `0..3` for `thrown-axe`), and emit `*/trail-*` sprites into the additive FX pool behind the projectile.

---

## 5. `public/townnpcs/` -> `src/render.ts` / Town Hub

- **Files**: `public/townnpcs/townnpcs.png` + `public/townnpcs/townnpcs.json` (24 frames: 6 NPCs x 4 idle frames, `anchor: { x: 0.5, y: 0.88 }`).
- **Frame keys**: `{smith,innkeeper,mage,priest,guard,villager}/idle/{0..3}`.
- **Drop-in wiring**:
  - Load `/thornvael/townnpcs/townnpcs.json` in `src/render.ts` when entering a town hub or spawning friendly NPC entities; step frame `Math.floor(time * 4) % 4` for gentle idle motion.

---

## 6. `public/loadscreens/` -> `src/shell.ts` / Mission Loader

- **Files**:
  - `public/loadscreens/load-map1-fords.jpg` (Oakhaven & Border Fords)
  - `public/loadscreens/load-map2-redmarsh.jpg` (Redmarsh Fen)
  - `public/loadscreens/load-map3-coast.jpg` (Iron Coast)
  - `public/loadscreens/load-map4-caldera.jpg` (Obsidian Caldera)
- **Drop-in wiring**:
  - Map `mapId` / `act` to `/thornvael/loadscreens/load-map<N>-<slug>.jpg` as the loading overlay `background-image` (`background-size: cover; background-position: center`) while chunks/assets initialize.
