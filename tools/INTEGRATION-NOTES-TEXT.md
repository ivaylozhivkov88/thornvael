# Text & Lore Integration Notes (Wave 2 — Agent E2)

All 9 text packs are now wired through `src/data/text/index.ts`, validated by `node tools/check-text.mjs` (`971` total keys, `0` errors), and surfaced synchronously through `src/tips.ts` and `src/codex.ts` with runtime `fetch` hydration.

---

## 1. Completed Live Module Integrations

### `src/data/text/index.ts` (All 9 Packs)
- **Public runtime packs (`public/data/text/*.json`)**:
  - `bestiary-52.json` (`loadBestiary`, `getBestiaryEntry`, `validateBestiaryPack`)
  - `achievements-60.json` (`loadAchievements`, `getAchievementById`, `getAchievementsByCategory`, `validateAchievementsPack`)
  - `loading-tips-50.json` (`loadLoadingTips`, `getRandomTip`, `validateLoadingTipsPack`)
  - `death-messages-30.json` (`loadDeathMessages`, `getRandomDeathMessage`, `validateDeathMessagesPack`)
  - `tavern-rumors-40.json` (`loadTavernRumors`, `getRumorsByStage`, `getRumorsByHub`, `validateTavernRumorsPack`)
  - `location-plaques-40.json` (`loadLocationPlaques`, `getPlaqueByKey`, `getPlaquesByMap`, `getPlaquesByAct`, `validateLocationPlaquesPack`)
- **Bundled dictionaries (`src/data/text/*.json`)**:
  - `BARKS_PACK` (`getBarkLine`, `getBarksByMerc`)
  - `ITEM_LORE_PACK` (`getItemLoreLine`)
  - `SPELL_FLAVOR_PACK` (`getSpellFlavorLine`)
- **Combined loader & validator**: `loadAllNineTextPacks(baseUrl?, fetcher?)` and `validateAllNineTextPacks(bundle, expectedBestiaryIds?)`.

### `src/tips.ts` (50 Loading Tips + 30 Death Epitaphs)
- Preserves `Tips`, `TipId`, and `LOW_HP_TIP` unchanged.
- Embeds synchronous bundled fallbacks (`BUNDLED_LOADING_TIPS` [50], `BUNDLED_DEATH_MESSAGES` [30]) plus optional runtime refresh `hydrateCuratedTips(baseUrl?, fetcher?)`.
- Exposed sync accessors:
  - `getLoadingTip(rng?)`, `getLoadingTipEntry(rng?)`, `getLoadingTipByKey(key)`, `getAllLoadingTips()`
  - `getDeathMessage(rng?)`, `getDeathMessageEntry(rng?)`, `getDeathMessageByKey(key)`, `getAllDeathMessages()`
  - `getDefeatFlavor(rng?)` -> `{ deathMessage, loadingTip, formatted }`

### `src/codex.ts` (52 Bestiary Entries + 273 Item Lore Keys)
- Preserves all Hall of Relics discovery state/progress functions (`CODEX_STORAGE_KEY`, `loadDiscovered`, `saveDiscovered`, `onDiscovery`, `discoverItem`, `isDiscovered`, `getCodexProgress`, `resetCodex`).
- Embeds synchronous bundled fallback `BUNDLED_BESTIARY` [52] plus optional runtime refresh `hydrateCodexBestiary(baseUrl?, fetcher?)`.
- Exposed sync accessors:
  - `getBestiaryLore(unitIdOrName)`, `getAllBestiaryLore()`, `getBestiaryCount()`, `searchBestiaryLore(query)`
  - `getItemLore(idOrKeyOrName)`, `getItemLoreLines(idOrKeyOrName)`, `getSetLore(setIdOrName)`, `getAllItemLoreKeys()`, `getItemLoreCount()`

---

## 2. Remaining UI Hook Points (For Shell / Mission / Codex UI Integrator)

### A. `src/shell.ts` (Loading Banners, Tavern Rumors & Credits/Lore)
1. **Campaign / Skirmish Launch Overlay (`go(...)` / loading transition)**:
   - Import `{ getLoadingTip, hydrateCuratedTips } from './tips'`.
   - Call `void hydrateCuratedTips()` during `runShell()` initialization alongside `loadMonsterCodex()`.
   - Render `getLoadingTip()` inside the transition / loading screen footer (e.g., paired with `public/loadscreens/load-map<N>-*.jpg` from `tools/INTEGRATION-NOTES.md`).
2. **Global Map / Act Region Lore Preview**:
   - Call `loadLocationPlaques(import.meta.env.BASE_URL)` when opening the campaign map and use `getPlaquesByAct(pack.entries, currentAct)` to display discovered landmark plaque cards or tooltips on hover.

### B. `src/main.ts` (Defeat Screen & Loading Overlay)
1. **Defeat Screen (`finish('lose', text)` around line 3204)**:
   - Import `{ getDefeatFlavor, hydrateCuratedTips } from './tips'`.
   - Warm `void hydrateCuratedTips()` during boot (`loadFlavorLists()` phase around line 2073).
   - In `finish('lose', text)`, combine `getDefeatFlavor().formatted` with (or use as fallback when `defeatFlavor()` from `missioncontent.ts` is empty/offline) so every defeat screen always shows a curated dark-fantasy epitaph and survival tip even without prior network fetches.
2. **Mercenary Barks & Spell Tooltips**:
   - Use `getBarksByMerc(mercId, 'combat' | 'select' | 'hurt')` and `getSpellFlavorLine(spell.name)` from `./data/text/index` as synchronous fallbacks alongside `missioncontent.ts` (`mercBark`, `getSpellText`).

### C. `src/missionui.ts` (Location Plaques & Journal Lore)
1. **In-Mission Region Plaques (`MissionUi`)**:
   - Load `loadLocationPlaques(import.meta.env.BASE_URL)` once per macro map (`map1-border-fords`..`map4-obsidian-caldera`) and filter via `getPlaquesByMap(pack.entries, mapId)`.
   - Trigger a non-blocking gothic plaque banner / toast (`title` + `text`) when the hero enters a region trigger or interacts with a signpost/waystone (`plaque.map1.*`..`plaque.map4.*`), and archive viewed plaques into a "Field Plaques" section inside `#quest-journal` (`renderQuestJournal()`).

### D. `src/codexui.ts` & `src/heroui.ts` (Bestiary & Item Lore)
1. **`src/codexui.ts` Bestiary Tab (`this.filter === 'bestiary'`)**:
   - Import `{ getAllBestiaryLore, hydrateCodexBestiary } from './codex'`.
   - Merge or fall back to `getAllBestiaryLore()` when `getMonsterCodex()` is incomplete/offline so all 52 unit & boss entries (with `name`, `weakness`, and `lore`) render immediately in the Bestiary tab.
2. **`src/heroui.ts` Item Card Tooltip (`buildItemCard` / `formatItemTooltip`)**:
   - Import `{ getItemLore } from './codex'`.
   - Use `getItemLore(itemId)` / `getItemLore(d.name)` when `getItemFlavor(d.name)?.flavor` is missing, surfacing all 132 unique + 28 set + 111 set-piece lore lines synchronously on item hover.

### E. `src/townui.ts` / `src/achievements.ts`
- **Tavern Rumors**: Call `loadTavernRumors(import.meta.env.BASE_URL)` and cycle `getRumorsByStage(pack.entries, act)` or `getRumorsByHub(pack.entries, hubId)` in the town tavern UI.
- **Achievements**: Call `loadAchievements(import.meta.env.BASE_URL)` from `./data/text/index` to provide canonical `title`, `desc`, `category`, and `condition` metadata for all 60 achievements in `public/data/text/achievements-60.json`.
