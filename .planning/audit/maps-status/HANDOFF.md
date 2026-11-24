# Handoff — `gemini/maps-chunked` (след Акт IV)

**Дата:** 2026-11-24  
**Клон:** `gemini/maps-chunked` (само локални комити, **без push**, **без CI**).  
**Пазени ограничения:** `src/sim/path.ts`, `tests/movement.test.ts`, `game-item-images/` и оригиналните `src/missions/*.map.json` НЕ са пипани/презаписвани. Пре-съществуващите некомитнати промени от `gemini/webkit-hang` (`.github/workflows/ci.yml`, `e2e/combat-animation.spec.ts`, `tools/build-wiki-data.mjs`, `tools/extract-ref.py`, `public/itemicons/*` и др.) са оставени недокоснати в working tree.

---

## 1. Какво е завършено и комитнато

### Стъпка 0 — Одит
- [REPORT.md](file:///D:/ROM%202%20clone/game/.planning/audit/maps-status/REPORT.md): пълен одит на 4-те града (`thornwick`, `redmarsh`, `oakhaven`, `highcrest`), всички 46 мисии (`m01..m46`), липсите спрямо `.planning/act2/`, `act3/`, `LORE-QUEST-MAP.md`, `campaign/*`, и съществуващия `TerrainChunkCache` + `LruVramManager`.

### Стъпка 1 — Зареждане на части, пул и отлагане (`8f5dd8e`)
- `src/sprites/load-pool.ts`: `runWithPool(..., 3)`, `withTimeout`, `fetchWithTimeout` (`15 000 ms`).
- `src/sprites/units.ts`: `UnitAtlas.load` и `pixels()` ползват 15 s таймаут и последователно декодиране `color -> mask` (пик `<= 3` едновременни декодирани изображения).
- `src/sprites/extra-atlases.ts`: `loadPackedAtlas` с 15 s таймаут + `null` при отказ; `loadAllExtraAtlases` през 3-слотов пул.
- `src/render.ts`:
  - `ALL_UNIT_ART` зарежда през пул от 3 с `PromiseSettledResult` (падане към `fallbackUnitTex` при отказ).
  - `createUnitSprite()` ползва `atlasByArt.get(...)` вместо позиционни индекси.
  - Пропуска разширени атласи за скрити юнити (`sim.hidden[i] === 1`) при boot (`act1-world`: от 8 фамилии -> **0** при boot) и в `draw()` до `phaseIn`.
- `src/render/chunk-cache.ts`: изнесени `neededChunkCoords()` и `chunkSizeForMap()` (без дублиране на 24-слотовия кеш).
- `tests/chunk-loading.test.ts`: 4 Vitest теста за +1 пръстена, пул `<= 3`, 15 s таймаут и `act1-world` заспали фамилии.

### Стъпка 2 — Нови по-големи карти за Акт II < Акт III < Акт IV
- **Акт II (`128x128`, комит `8af2faf`):**
  - `tools/build-act2-maps.mjs` -> генерира `src/missions/m12-redmarsh-border-128.map.json` .. `m23-fork-of-spears-128.map.json` (12 карти, `chunk=16`).
  - Вързани в `src/mission.ts` (`'m12-128'`..`'m23-128'`) и `public/data/campaign.json`.
  - `tests/act2-large-maps.test.ts` (12 теста).
- **Акт III (`192x192`, комит `b6bdf67`):**
  - `tools/lib/scale-map.mjs` (споделен helper) + `tools/build-act3-maps.mjs` -> генерира `src/missions/m24-pledge-at-oakhaven-192.map.json` .. `m35-burning-harbor-192.map.json` (12 карти, `chunk=32`).
  - Вързани в `src/mission.ts` (`'m24-192'`..`'m35-192'`) и `public/data/campaign.json`.
  - `tests/act3-large-maps.test.ts` (12 теста).
- **Акт IV (`256x256`, текущ комит):**
  - `tools/build-act4-maps.mjs` -> генерира `src/missions/m36-heartland-march-256.map.json` .. `m46-ember-reckoning-256.map.json` (11 карти, `chunk=32`).
  - Вързани в `src/mission.ts` (`'m36-256'`..`'m46-256'`) и `public/data/campaign.json`.
  - `tests/act4-large-maps.test.ts` (11 теста).

---

## 2. Какво НЕ е проверено (за следващия агент/човек)
1. **Linux WebKit (CI) и реален браузър:** не са пускани Playwright тестове нито CI; реалното време в ms за boot на `128/192/256` и `act1-world` под WebKit софтуерен GL не е измерено.
2. **Пълен Vitest suite:** пуснати са целевите тестове за рендер/терен/парчета, кампания и Акт II/III/IV (вкл. `tests/campaign.test.ts`, `tests/campaign-act2..4.test.ts`, `tests/redmarsh-town.test.ts`, `tests/oakhaven-town.test.ts`, `tests/highcrest-town.test.ts`). Пълният `npx vitest run` (вкл. `tests/playthrough` и `e2e`) не е пускан.
3. **Offline / chapter1 manifest:** ако PWA offline кешът (`public/data/chapter1*` или `sw.ts`) пакетира мисии/данни, провери дали манифестът трябва да се регенерира след промяната в `campaign.json`.

---

## 3. Какво остава по желание / следващи стъпки
1. **Сливане / push:** след преглед на `git diff main..gemini/maps-chunked` и локален Playwright smoke тест (или CI на клона), merge към `main` и `git push`.
2. **Акт I свят (`act1-world.map.json`):** все още не е вързан към `campaign.json` / `src/mission.ts` (беше извън обхвата на Акт II–IV).
3. **Вторични градове и `steps[]`:** 6-те вторични града от `ACT2-DESIGN.md`/`ACT3-DESIGN.md` нямат `.map.json` файлове, а `campaign.json` все още няма `steps[]` (данните са в `src/data/act2/quests.json` и `act3/quests.json`).
4. **Почистване на `tools/build-act2-maps.mjs`:** може по желание да се сведе до 15-редов скрипт, ползващ `tools/lib/scale-map.mjs` като Акт III и IV.
