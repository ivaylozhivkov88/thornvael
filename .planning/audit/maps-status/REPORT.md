# Одит: Състояние на карти, градове, мисии и chunking (Стъпка 0)

Клон: `gemini/maps-chunked` (локален, базиран на `HEAD` / `gemini/webkit-hang`, който вече съдържа `main` до `7c1702c`).

---

## 1. Градове (thornwick, redmarsh, oakhaven, ironcamp/highcrest)

Всички 4 главни града от `public/data/campaign.json` имат готови `.map.json` карти в `src/missions/`, `towns[]` метаданни (магазин, таверна, школа, NPC-та) и Vitest тестове за валидация и проходимост от вратите (`доказано`):

| Кампания ID | Карта (`src/missions/`) | Размер | Магазин / Таверна / Школа | NPC / Юнити | Врати / Waypoint | Тригъри | Тест (`tests/`) |
|---|---|---|---|---|---|---|---|
| `town-thornwick` | `thornwick-market.map.json` | 56x44 | `tavern:0, shop:1, school:2` (`tiers:[1,3]`, 4 mercs, 7 spells) | 14 NPC в `towns[0].npcs`, 34 юнита, 9 сгради (`kind:1`), 102 пропа (`kind:0`) | N-Gate `(28,4)`, E-Gate `(47,21..23)`, `wp-thornwick@(28,18)` | 4 (`briefing`, `purse`, `cleared`, `hero-dead`) | `thornwick-town.test.ts` |
| `town-redmarsh` | `redmarsh-outpost.map.json` | 56x44 | `tavern:0, shop:1, school:2` (`tiers:[1,3]`, 4 mercs, 7 spells) | 12 NPC в `towns[0].npcs`, 14 юнита, 9 сгради (`kind:1`), 87 пропа (`kind:0`) | N-Gate `(28,4)`, E-Gate `(46,18..20)`, `wp-redmarsh@(28,18)` | 0 | `redmarsh-town.test.ts` |
| `town-oakhaven` | `oakhaven-bastion.map.json` | 56x44 | `tavern:0, shop:1, school:2` (`tiers:[1,3]`, 4 mercs, 7 spells) | 12 NPC в `towns[0].npcs`, 14 юнити, 9 сгради (`kind:1`), 69 пропа (`kind:0`) | N-Gate `(28,4)`, West/East Pier, `wp-oakhaven@(28,18)` | 0 | `oakhaven-town.test.ts` |
| `town-ironcamp` | `highcrest-citadel.map.json` | 56x44 | `tavern:0, shop:1, school:2` (`tiers:[1,3]`, 4 mercs, 7 spells) | 12 NPC в `towns[0].npcs`, 14 юнити, 9 сгради (`kind:1`), 87 пропа (`kind:0`) | N-Gate `(28,4)`, S-Gate `(26..30,32)`, `wp-ironcamp@(28,18)` | 0 | `highcrest-town.test.ts` |

**Забележки (`доказано`):**
- В `redmarsh-outpost`, `oakhaven-bastion` и `highcrest-citadel` полето `towns[0].tiers` е `[1,3]` (в `campaign.json` е `[2,3]`, `[3,4]`, `[4,5]`), а `triggers` е празно `[]`.
- От дизайн документите (виж т. 3) вторичните градове (`town-highgate`, `town-brinewell`, `town-quarrycamp`, `town-burning-harbor`, `town-heartland`, `town-rampart`) нямат отделни `.map.json` файлове.

---

## 2. Мисии `m01..m46`

Проверени всички 46 мисии от `public/data/campaign.json` спрямо съответните `src/missions/*.map.json` (`доказано`):
- **Всички 46 мисии** имат валидни `win` (`k: "win"`), `lose` (`k: "lose"`), `setSub` (`k: "setSub"`) тригъри и `obj.*` текстове (`Potential stubs: []`). Няма празни заготовки без тригъри/цели.
- **Размери:**
  - `m01-blood-at-the-ford` (`blood-at-the-ford.map.json`): **640x480**, 116 юнита, 10 тригъра, 6 `obj.*` (`ford`).
  - `m02-whispers-in-the-fen` (`whispers-in-the-fen.map.json`): **80x56**, 40 юнита, 8 тригъра.
  - `m03-nightfall-at-ravenwatch` (`nightfall-at-ravenwatch.map.json`): **72x56**, 44 юнита, 9 тригъра.
  - **96x96** (кулминации/финали): `m11` (42 юнита, 9 тригъра), `m23` (60 юнита, 6 тригъра), `m28` (43 юнита, 6 тригъра), `m35` (52 юнита, 9 тригъра), `m41` (39 юнита, 7 тригъра), `m42` (37 юнита, 7 тригъра), `m43` (41 юнита, 6 тригъра), `m45` (37 юнита, 7 тригъра), `m46` (37 юнита, 8 тригъра).
  - **64x64** (останалите 34 мисии): `m04..m10`, `m12..m22`, `m24..m27`, `m29..m34`, `m36..m40`, `m44` — между 28 и 45 юнита, 4–8 тригъра.
  - Най-минимални по тригъри (4 тригъра, 1–2 цели): `m18-granary-raid`, `m19-hexer-capture`, `m20-deep-quarry`.
- **Допълнителни макро-карти (извън `m01..m46` в `campaign.json`):** `src/missions/map1-border-fords.map.json`..`map4-obsidian-caldera.map.json` (192x192, 53–66 юнита, 14–17 тригъра) и `src/worlds/act1-world.map.json` (844x650, 307 юнита, 20 тригъра, 40 региона).

---

## 3. Какво от дизайн документите още не е във файловете

1. **`.planning/act2/ACT2-DESIGN.md` (`доказано`):**
   - `src/data/act2/` съдържа `towns.json`, `zones.json`, `bosses.json`, `quests.json`, `uniques.json`.
   - **Липсва в картите/кампанията:** 3 от 4-те града (`town-highgate`, `town-brinewell`, `town-quarrycamp`) нямат `.map.json` файлове и не са възли в `public/data/campaign.json`. `public/data/campaign.json` няма `steps[]` на нито един от 50-те възела (`0/50`), докато `steps[]` стоят само в `src/data/act2/quests.json`.
2. **`.planning/act3/ACT3-DESIGN.md` (`доказано`):**
   - `src/data/act3/` съдържа `towns.json`, `zones.json`, `bosses.json`, `quests.json`, `uniques.json`.
   - **Липсва в картите/кампанията:** 3 от 4-те града (`town-burning-harbor`, `town-heartland`, `town-rampart`) нямат `.map.json` файлове и не са в `campaign.json`.
   - *(Забележка: в `src/data/act4/` има само `towns.json` и `zones.json` — липсват `bosses.json`, `quests.json`, `uniques.json`.)*
3. **`.planning/LORE-QUEST-MAP.md` (`доказано`):**
   - Одитирано е покритието на `MQ`/`SQ` в `public/data/content/side-quests*.json` и `quest-specs.json` (верифицирано в `tests/campaign.test.ts`, `sidequests*.test.ts`).
   - Очакваните там `steps[]` за главната кампания не са пренесени в `public/data/campaign.json`.
4. **`.planning/campaign/*` (`00-BIBLE.md`, `01-PROGRESSION.md`, `02-PRODUCTION-PLAN.md`, `03-GAPS.md`, `campaign-4maps.json`, `map-1..4*.md`) (`доказано`):**
   - `map1..map4` (192x192) съществуват в `src/missions/`, но `public/data/campaign.json` все още ползва 50-възловия DAG (`m01..m46` + 4 града), а не 4-те макро-карти от `campaign-4maps.json`.
   - В `03-GAPS.md` са описани 6 неимплементирани/частични разширения (GAP-01..GAP-06, напр. `st.sub` да стане 16 вместо 8 в `src/sim/script.ts`, `giveXp` action, `musicNode` реално превключване, `doc.units` dormant pool до 512).
   - `src/worlds/act1-world.map.json` (844x650) съществува и има тест `tests/act1-world.test.ts`, но `src/mission.ts` реферира `map1-border-fords`, не `act1-world`.

---

## 4. Какво вече е правено за chunking (`git log --all --oneline -- src/terrain.ts src/render.ts src/worlds`)

Вече съществува работещ chunking за терена — **не трябва да се дублира** (`доказано`):
- **`de0852a`** (*lazy chunk baking to eliminate OOM*) и **`2b37b23`** (*modular decomposition*): изнесоха теренния кеш в **`src/render/chunk-cache.ts`** (`TerrainChunkCache`).
  - `TerrainChunkCache` пече парчета по `16x16` (или `32x32` при `max(w, h) > 128`) в **ограничен 24-слотов LRU/distance-evicted пул** с преизползване на `<canvas>` и `Texture` (`chunks.cullable = false`, зарежда видимия прозорец ± 1 парче около камерата).
- **`1e3f9e7`** (*Pixi v8 LRU VRAM*): добави **`src/render/vram-manager.ts`** (`LruVramManager`, 160 MB mobile / 220 MB desktop бюджет).
- **`e2fb575`** & **`e92eedd`**: lazy VRAM loader за 35 extended monster atlases.
- **Какво ОЩЕ НЕ Е направено (`доказано` в `src/render.ts` и `src/sprites/extra-atlases.ts`):**
  1. `src/render.ts:808` вика `Promise.all(ALL_UNIT_ART.map((unit) => UnitAtlas.load(unit)))` — паралелно декодиране на всичките атласи наведнъж без пул, без таймаут и без fallback текстура.
  2. `src/sprites/extra-atlases.ts:80` вика `Promise.all([...])` за 7 extra атласа без пул/таймаут.
  3. `TerrainChunkCache` пече с `chunk = 32` за големи карти (`>128`), но `prepareScenery()` и `loadTerrainArt()`/`zoneSkins` се подготвят предварително за цялата карта, а заспалите зони в `act1-world` не отлагат зареждането на арт на юнити/декор.

---

## 5. Стъпка 1 — Измервания преди / след и промени

### Промени (локален клон `gemini/maps-chunked`)
- `src/sprites/load-pool.ts`: добавен пул с ограничен паралелизъм (`runWithPool`, по подразбиране `3`), `withTimeout` и `fetchWithTimeout` (`15 000 ms`).
- `src/sprites/units.ts`: `UnitAtlas.load` и `pixels()` ползват 15 s таймаут; `color` и `mask` се декодират последователно на работник, така че пиковият брой едновременни декодирания е `<= 3`.
- `src/sprites/extra-atlases.ts`: `loadPackedAtlas` ползва 15 s таймаут и връща `null` при отказ; `loadAllExtraAtlases` ползва `runWithPool(..., 3)` вместо `Promise.all` на 7 атласа наведнъж.
- `src/render.ts`:
  - `init()` зарежда `ALL_UNIT_ART` през пул от 3 с `PromiseSettledResult` (неуспешните падат към `fallbackUnitTex`), после `loadAllExtraAtlases(3)`, после само **активните** (`!sim.hidden[i]`) разширени атласи.
  - `createUnitSprite()` търси в `atlasByArt` по име вместо по позиционен индекс в `loadedAtlases`.
  - `draw()` не зарежда разширен арт за скрити (`sim.hidden[i] === 1`) юнити; зарежда го мързеливо едва след `phaseIn`.
- `src/render/chunk-cache.ts`: изнесена чиста функция `neededChunkCoords()` и `chunkSizeForMap()` за Vitest покритие на +1 пръстена без браузър.
- `tests/chunk-loading.test.ts`: Vitest тестове за пръстена парчета (вкл. `act1-world` 844x650), лимит `<= 3` на пула, `15 s` таймаут и отлагане на разширените атласи за заспали юнити.

### Измервания Преди / След

| Метрика | Преди | След | Източник / Метод |
|---|---|---|---|
| Пиков брой едновременни декодирани изображения при boot (`ALL_UNIT_ART` + `extraAtlases`) | **43+** едновременно (`18 × 2` PNG в `UnitAtlas.load` + `7` в `loadAllExtraAtlases`, плюс разширени) | **<= 3** едновременно (3-слотов пул + последователно `color -> mask`) | Код анализ + `tests/chunk-loading.test.ts` (`peakInFlight <= 3`) |
| Разширени монстър атласи при boot на `act1-world` (307 юнита, 295 `dormant`) | Всички активни + заспали (8 фамилии на картата) | **0** разширени атласа при boot (`families active: 0`) | `act1-world.map.json` + `src/render.ts` (`!sim.hidden[i]`) |
| Теренни парчета при старт на `act1-world` (844x650, `chunk=32`, общо 567 парчета) | Зареждат се само парчетата в `vt ± 1` (напр. **4** при старт около `(0,0)`, макс **24** слота) | Без дублиране: същият `TerrainChunkCache` (4 при старт, макс 24), тестван с `neededChunkCoords` | `src/render/chunk-cache.ts` + `tests/chunk-loading.test.ts` |
| Таймаут и изолация при провал на атлас | Няма таймаут; `Promise.all` проваля целия boot | **15 000 ms** таймаут + `fallbackUnitTex` / `null` без срив | `src/sprites/load-pool.ts`, `src/render.ts` |

### Проверки (след финалната редакция)
- `npm run typecheck`: **PASS** (`tsc --noEmit && tsc --noEmit -p tsconfig.sw.json`).
- `npx vitest run tests/chunk-loading.test.ts tests/terrain.test.ts tests/render-webgl-context.test.ts tests/act1-world.test.ts tests/arch-decomposition.test.ts`: **5/5 файла, 21/21 теста PASS** (6.84s).
- `src/sim/path.ts` и `tests/movement.test.ts`: **непроменени**.

### Какво НЕ е проверено (честен списък)
- **Linux WebKit (CI) и реален браузър:** нямаме Linux WebKit локално и не сме пускали Playwright/CI по инструкция; реалното време в ms за boot в WebKit с софтуерен GL не е измерено тук.
- **Пълен Vitest suite:** пуснати са целевите 5 тестови файла за рендер/терен/парчета (плюс `tests/sprites.test.ts` 16/16 преди финалния 2-редов фикс `sim.hidden`).
