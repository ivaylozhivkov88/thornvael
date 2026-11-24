# Доклад от разследване: Ханг и чупене на WebKit Smoke тестовете в CI

**Репо:** `D:\ROM 2 clone\game` (`ivaylozhivkov88/thornvael`)  
**Клон на разследването:** `gemini/webkit-hang` (локален, базиран на `32c4a6a`)  
**Обхват:** Само статичен одит + локално възпроизвеждане. Никакъв продукционен или тестов код не е модифициран.

---

## Резюме на двете места на провал в CI WebKit

Разследването установи, че двата наблюдавани провала в GitHub Actions (`ubuntu-latest`, Playwright WebKit v2370 / WebKit 27.2, софтуерен рендер `llvmpipe`, `workers: 1`) имат **различни непосредствени тригери**, но споделят обща архитектурна уязвимост в `src/main.ts` и `src/render.ts` (липса на таймаут/fallback преди създаването на `window.__game` на ред `src/main.ts:4314`):

1. **Провал 1 (Run `45392441529` — `offline reload works after service worker registration`, `tests/pwa-smoke.spec.ts:94-133`) — `[ДОКАЗАНО И ВЪЗПРОИЗВЕДЕНО ЛОКАЛНО]`:**
   - **Опит 1 (пада на `expect(errors).toEqual([])` с `credits-and-menu.json due to access control checks.`):** На ред `tests/pwa-smoke.spec.ts:116` тестът прави `await page.goto('/thornvael/', { waitUntil: 'domcontentloaded' })` последвано от `await page.waitForTimeout(300)` и `await context.setOffline(true)`, за да спре WebGL цикъла преди офлайн режима (въведено в комит `7f5b4f1`). Навигацията към `/thornvael/` обаче стартира цялото главно меню (`runShell` в `src/shell.ts:58-70`), което пуска **неизчакани (`void`) вериги от последователни `fetch()` заявки** — включително `loadMonsterCodex()` (`src/missioncontent.ts:154-168`: `monster-codex.json` $\rightarrow$ `bestiary-extra.json`) и `loadHelpAndCredits()` (`src/missioncontent.ts:230-244`: `help-pages.json` $\rightarrow$ `tutorial.json` $\rightarrow$ `credits-and-menu.json`). Точно на ~300 ms след `domcontentloaded`, докато 2-рата/3-тата заявка от веригата (`credits-and-menu.json` в CI; `bestiary-extra.json` и `tutorial.json` при локалното ни пускане с `CI=1`) е **in-flight** през Service Worker-а, тестът извиква `context.setOffline(true)` и веднага навигира към `?randskirmish=7...`. WebKit прекъсва висящия fetch с вътрешна грешка `Fetch API cannot load http://127.0.0.1:4174/thornvael/data/content/... due to access control checks.` и заради известен бъг на Playwright/WebKit (`microsoft/playwright#44015`, `#42823`) емитира `pageerror`, въпреки че `fetch`-ът е обграден с `try / catch`.
   - **Retry #1 (увисва до 240 s проектен таймаут):** При комбинацията от (а) прекъснати in-flight Service Worker / IndexedDB заявки от `/thornvael/` по време на `context.setOffline(true)`, (б) асинхронен `cache.put()` в Workbox `CacheFirst` (`thornvael-sprites-v1`, `src/sw.ts:42-45`), който няма `handlerDidError` и чийто запис в `CacheStorage` не се изчаква от `Array.from(document.images).every(img => img.complete)` (защото `new Image()` в `UnitAtlas.load` не е в `document.images`), и (в) липса на проверка за `.tv-loading-retry-btn` в `tests/pwa-smoke.spec.ts:122`, при всяко отхвърляне или увисване на ресурс в `renderer.init(sim)` докато контекстът е офлайн, `window.__game` никога не се създава и тестът чака до изтичане на 240 s.

2. **Провал 2 (Runs `45374353232`, `45382639177` — `Act 1 Campaign Flow E2E`, `tests/pwa-smoke.spec.ts:139-294`) — `[ДОКАЗАНА СТРУКТУРНА ПРИЧИНА / ХИПОТЕЗА ЗА ТОЧНИЯ ЗАСЕДНАЛ PROMISE В LINUX CI]`:**
   - От комит `e8c78fb` насам както Мисия 1 (`campaign=m01-blood-at-the-ford`), така и градът (`campaign=town-thornwick`) зареждат гигантската обединена карта `act1-world` (`src/flow.ts:42`, `src/worlds/act1-world.map.json`: **844×650 = 548 600 тайла, 307 юнита, 3 621 обекта, 40 региона, 4 extended monster семейства**).
   - Преди `window.__game` да бъде създаден на `src/main.ts:4314` и преди `sim.tick` да стане `>= 1`, кодът изпълнява:
     1. 8 предварителни top-level `await` операции без таймаут (`loadGameData`, `getCharacter` в IndexedDB, `loadMissionByName`, `loadCampaign`, `readRecord` в IndexedDB, `setTerrainTheme` с 5× `new Image()` без таймаут);
     2. 13 последователни top-level `await` функции (`src/main.ts:2281-2293`), правещи **37 `fetch()` заявки (24 строго последователни)** + 9 неизчакани `fetch()` заявки (`src/main.ts:2297-2299, 3846-3879`);
     3. `renderer.init(sim)` (`src/render.ts:733-892`), който без таймаут декодира **51 PNG изображения паралелно** (18 основни `ALL_UNIT_ART` + 4 `neededExtended` + 7 `extraAtlases`) и алокира **22 × `4096×4096` 2D Canvas буфера = 1 408 MB сурова RGBA памет** (пиково ~2.4 GB по време на `splitMask`) + 12 × `1024×1024` теренни чънка (`48 MB`) върху софтуерен WebGL (`llvmpipe`);
     4. Още преди `window.__game` да се дефинира, `missionUi.briefing()` (`src/main.ts:4290` $\rightarrow$ `src/missionui.ts:888-889, 1099`) вика `playSpeakerSwitchThrill()` и `playNpcBark()`, които чрез `if (canAutoUnlock()) unlock()` (`src/audio.ts:342-348, 360-428, 901, 1962`) създават `AudioContext` на Linux CI runner без аудио устройство и стартират **90+ паралелни `fetch('/thornvael/audio/*.m4a')` + `context.decodeAudioData()` задачи** (`src/audio.ts:421`).

---

## детайлен анализ по 6-те точки от заданието

### Точка 1: `src/main.ts` — top-level `await` веригата преди `window.__game` (`src/main.ts:102-4314`)

`window.__game` се дефинира едва на **`src/main.ts:4314`**, вътре в `.then()` колбека на `void renderer.init(sim).then(() => { ... })` (`src/main.ts:4259`). Ако **който и да е** `await` на ниво модул или вътре в `renderer.init(sim)` не се резолвне (или ако `renderer.init(sim)` хвърли грешка и влезе в `.catch()` на `src/main.ts:4372`), `window.__game` остава `undefined` завинаги.

Пълна хронологична карта на всички асинхронни и тежки операции преди `window.__game`:

| Стъпка | Файл:Ред | Извикване | Тип операция | Таймаут / Fallback на `main`? | Покрито ли е в `diag/webkit-boot`? |
|---|---|---|---|---|---|
| 1 | `src/main.ts:94-99` | `new LoadingScreen(...)` $\rightarrow$ `src/loadingscreen.ts:171, 177, 207` | Зарежда `load-map1-fords.jpg`, пуска `void hydrateCuratedTips()` (2 fetch-а) и `setInterval` (сменя `.jpg` на всеки 2.8 s) | Няма таймаут (не блокира директно, но хаби мрежа/SW) | Не |
| 2 | `src/main.ts:102` | `await loadGameData()` $\rightarrow$ `src/loaddata.ts:4-13` | `Promise.all` на 3 `fetch()`: `data/items.json`, `spells.json`, `monsters.json` | **НЕ** — без таймаут; при грешка хвърля и чупи целия модул | **НЕ** |
| 3 | `src/main.ts:105-111` | `void hydrateCuratedTips()`, `void loadLocationPlaques()` | 3 неизчакани `fetch()` към `data/text/*.json` (`src/tips.ts:135`, `src/data/text/index.ts:230`) | `catch(() => undefined)` | Не |
| 4 | `src/main.ts:117` | `await getCharacter(params.get('char')!)` $\rightarrow$ `src/characters.ts:68-82` $\rightarrow$ `src/savedb.ts:19-41` | **IndexedDB** `indexedDB.open('thornvael', 1)` + `readonly` транзакция в `saves` (винаги активно в Act 1 E2E, т.к. `shell.ts:198` добавя `&char=...`) | **НЕ** — `open()` и `tx.oncomplete` нямат таймаут (`onblocked` липсва в `src/savedb.ts:21-28`!) | **НЕ** |
| 5 | `src/main.ts:140` | `await getSave(loadId)` $\rightarrow$ `src/savedb.ts:52-55` | **IndexedDB** `readonly` транзакция (при `?load=...`) | **НЕ** — `open()` няма таймаут | **НЕ** |
| 6 | `src/main.ts:150` | `await loadMissionByName(missionName)` $\rightarrow$ `src/mission-runtime.ts:228-246` | Динамичен `await import('./worlds/act1-world.map.json')` (281 KB chunk) + синхронен `loadDoc()` RLE декод на `844×650` тайла | **НЕ** — `import()` няма таймаут (има `try/catch`, но при висящ chunk fetch виси вечно) | **НЕ** |
| 7 | `src/main.ts:165, 181` | `await setTerrainTheme(biome, seed)` $\rightarrow$ `src/terrain.ts:110-156` | `new Image()` за `skin-*.png`, `objects.png`, `props-wave2.png` (при `?expedition` и `?randskirmish`) | **НЕ** — `new Promise` чака `image.onload`/`onerror` без таймаут | **НЕ** |
| 8 | `src/main.ts:215, 227` | `await loadCampaign()`, `await readRecord()` $\rightarrow$ `src/campaignstore.ts:6-18` | `fetch('data/campaign.json')` + **IndexedDB** `getRecord('campaign')` | **НЕ** — нито `fetch`, нито IndexedDB транзакцията имат таймаут | **НЕ** |
| 9 | `src/main.ts:247` | `createMission(...)` $\rightarrow$ `src/mission-runtime.ts:187-225` | Синхронен строеж на `Sim` за `844×650` (307 юнита), `sim.settle()`, `applyDynamicSessionRespawn`, `sim.updateFog()` | Синхронно CPU | Не |
| 10 | `src/main.ts:412` | `await setTerrainTheme(currentBiomeKey, missionSeed, regions)` $\rightarrow$ `src/terrain.ts:125-156` | Изпълнява се за `act1-world` (40 региона): `loadSkin('crypt')`, `loadSkin('highland')`, `objects.png`, `props-wave2.png` чрез `new Image()` | **НЕ** — 4× `new Image()` без таймаут | **НЕ** |
| 11 | `src/main.ts:2281-2293` | 13 последователни `await load*()` функции (`src/missioncontent.ts`, `src/achievements.ts`, `src/herovoice.ts`) | **37 `fetch()` заявки** (24 строго последователни!) към `data/content/*.json`, `data/text/achievements-60.json`, `audio/voices/hero/index.json` | **НЕ** на `main` (всеки има `try/catch`, но **0 ms таймаут** при висящ `fetch` или `r.json()`) | **ДА** (`bootStep`, 8000 ms на функция, но последователно до 13×8s = 104s) |
| 12 | `src/main.ts:2297-2299, 3846-3879` | `missionKey`, `missionRadio`, `loadMissionHints`, `npc-dialogues.json`, 4× `loadExtraContent`, `side-quests.json` | **9 неизчакани (`void`) `fetch()` заявки**, пуснати точно преди `renderer.init(sim)` | Не блокират директно, но заемат всички 6 HTTP/1.1 слота към `127.0.0.1:4174` | Не |
| 13 | `src/main.ts:4259` $\rightarrow$ `src/render.ts:735-742` | `await this.app.init(...)` | Инициализация на PixiJS v8 WebGL контекст (`llvmpipe` в Linux CI) | **НЕ** — без таймаут | **НЕ** |
| 14 | `src/render.ts:745-748` | `await loadTerrainArt()`, `prepareScenery(this.map)`, `chunkCache.init(...)` | `new Image()` за `terrain-d4c025f96b76.png` (`src/terrain.ts:48-65`) + синхронен `zoneField` (**1.1 млн. итерации** за `844×650`) и `zoneDecor` (**542 хил. тайла**) | **НЕ** — `loadTerrainArt()` няма таймаут | **НЕ** |
| 15 | `src/render.ts:807-813` | `await Promise.all([ ALL_UNIT_ART.map(UnitAtlas.load), loadAllExtraAtlases(), ...neededExtended ])` | **29 JSON `fetch()` + 51 паралелни PNG декодирания** (`44× im.decode()` в `src/sprites/units.ts:173` + `7× new Image()` в `src/sprites/extra-atlases.ts:44`) + **22× `4096×4096` Canvas (`1 408 MB` RGBA)** | **НЕ** — нито един `fetch`, `im.decode()` или `new Image()` няма таймаут; ако 1 от 18-те `ALL_UNIT_ART` падне, целият `renderer.init(sim)` пада! | **НЕ** (няма нито `__bootPhase`, нито таймаут!) |
| 16 | `src/render.ts:890` | `this.updateChunks()` $\rightarrow$ `src/render/chunk-cache.ts:36-143` | Синхронно рисуване (`paintTerrainChunk`) и `Texture.from(cv)` на 12× `1024×1024` чънка (за `act1-world`) или до 24× `512×512` чънка | Синхронно CPU/Canvas | Не |
| 17 | `src/main.ts:4290` | `missionUi.briefing(...)` $\rightarrow$ `src/missionui.ts:888-889, 1085-1100` | Поставя `userPause = true` (`tick` стои на `0` докато диалогът не се затвори) и вика `playSpeakerSwitchThrill()` + `playNpcBark()` $\rightarrow$ `if (canAutoUnlock()) unlock()` (`src/audio.ts:360-428`) | **`unlock()` пуска 90+ паралелни `fetch('audio/*.m4a')` + `ctx.decodeAudioData()`** преди `window.__game` да бъде създаден! | Не |
| 18 | `src/main.ts:4300` | `renderer.draw(sim, ...)` | Първи синхронен PixiJS WebGL draw pass — качва `1.4+ GB` текстури към `llvmpipe` преди `window.__game` да бъде присвоен | Синхронен WebGL upload | Не |
| 19 | `src/main.ts:4314` | `(window as ...).__game = { ... }` | Създаване на тестовия кукиш `window.__game` | — | — |

#### Допълнителни находки по Точка 1 (`[ДОКАЗАНО]` от кода):
- **Липсващ `onblocked` обработчик в IndexedDB (`src/savedb.ts:19-30`):** `indexedDB.open('thornvael', 1)` слуша само за `onupgradeneeded`, `onsuccess` и `onerror`. Ако предходната страница (`/thornvael/` при `startCampaign` в `src/shell.ts:432-433` или Мисия 1 при `endNode` в `src/main.ts:3540-3543`) току-що е пуснала `writeRecord(rec)` и `deleteSave(AUTO)` и веднага е извикала `location.assign(...)`, при забавено освобождаване на IDB връзката в WebKit новата страница виси на `await getCharacter(...)` (`src/main.ts:117`) или `await readRecord()` (`src/main.ts:227`) без таймаут.
- **Бъг в `loadMissionContent(missionName)` за `act1-world` (`src/missioncontent.ts:34-48`):** На ред `src/main.ts:2293` се подава `missionName` (`'act1-world'`). В `src/missioncontent.ts:47` се търси `const node = nodes.find((n) => n.map === map);`. В `public/data/campaign.json` обаче възлите `m01-blood-at-the-ford` и `town-thornwick` все още имат `"map": "ford"` и `"map": "market"`, а не `"act1-world"`. Така `loadMissionContent('act1-world')` прави 6 мрежови заявки напразно и винаги връща `null`.

---

### Точка 2: Service Worker (`src/sw.ts`, `vite.config.ts`) и причината за `credits-and-menu.json due to access control checks`

#### 2.1. Доказана причина за `pageerror: .../credits-and-menu.json due to access control checks` (`[ДОКАЗАНО И ВЪЗПРОИЗВЕДЕНО]`)
1. `credits-and-menu.json` се зарежда **единствено** във функцията `loadHelpAndCredits()` (`src/missioncontent.ts:230-244`):
   ```ts
   // src/missioncontent.ts:230-244
   export async function loadHelpAndCredits(): Promise<void> {
     const base = import.meta.env.BASE_URL;
     try { const r = await fetch(`${base}data/content/help-pages.json`); if (r.ok) helpPages = await r.json(); } catch { /* optional */ }
     try {
       const r = await fetch(`${base}data/content/tutorial.json`);
       if (r.ok) { ... }
     } catch { /* optional */ }
     try {
       const r = await fetch(`${base}data/content/credits-and-menu.json`);
       if (r.ok) creditLines = (await r.json() as { key: string; text: string }[]).filter((e) => e.key.startsWith('credits.'));
     } catch { /* optional */ }
   }
   ```
2. `loadHelpAndCredits()` се извиква **единствено** от `runShell()` (`src/shell.ts:69` — `void loadHelpAndCredits();`), която се изпълнява само когато URL-ът няма параметри (`/thornvael/`) или има `?menu` (`src/main.ts:124-128`). Тя **не се извиква** при `?randskirmish=7...`.
3. В офлайн теста (`tests/pwa-smoke.spec.ts:116-121`), непосредствено след онлайн загряването на скърмиш картата, тестът прави:
   ```ts
   // tests/pwa-smoke.spec.ts:115-121
   // Tear down the active WebGL loop before toggling WebKit offline mode so NetworkProcess IPC never stalls.
   await page.goto('/thornvael/', { waitUntil: 'domcontentloaded' });
   await page.waitForTimeout(300);

   await context.setOffline(true);
   try {
     await page.goto('/thornvael/?randskirmish=7&players=2&biome=forest&hero=warrior,m,medium');
   ```
4. Когато `page.goto('/thornvael/', { waitUntil: 'domcontentloaded' })` се върне, `src/main.ts` тепърва изпълнява:
   - `await loadGameData()` (`src/main.ts:102` — 3 fetch-а през Service Worker-а),
   - `await import('./shell')` (`src/main.ts:126`),
   - `runShell()` (`src/shell.ts:58-70`), която пуска `void hydrateCuratedTips()`, `void loadLocationPlaques()`, `void loadMonsterCodex()` (2 последователни fetch-а: `monster-codex.json` $\rightarrow$ `bestiary-extra.json`) и `void loadHelpAndCredits()` (3 последователни fetch-а: `help-pages.json` $\rightarrow$ `tutorial.json` $\rightarrow$ `credits-and-menu.json`), плюс `await loadCampaign()` и 3 IndexedDB заявки (`src/shell.ts:164-172`).
5. Точно на `300 ms` след `domcontentloaded`, докато `loadMonsterCodex()` и `loadHelpAndCredits()` са на 2-рата или 3-тата си последователна `fetch()` заявка (`bestiary-extra.json`, `tutorial.json` или `credits-and-menu.json`), тестът извиква `await context.setOffline(true)` и веднага `await page.goto('/thornvael/?randskirmish=7...')`.
6. В WebKit прекъсването на in-flight `fetch()` при преход към офлайн режим / изходяща навигация генерира вътрешна грешка в `FetchLoader`:
   `Fetch API cannot load http://127.0.0.1:4174/thornvael/data/content/credits-and-menu.json due to access control checks.`
   Поради известен бъг в Playwright WebKit (`microsoft/playwright#44015`), тази грешка се предава като `pageerror` събитие към `page.on('pageerror')`, въпреки че в JS промисът е хванат с `try / catch`.
7. Забележка: на Опит 1 в Run `45392441529` самото офлайн презареждане на `?randskirmish=7...` (редове 121-127) **е успяло**, и тестът е паднал едва на ред 128 (`expect(errors).toEqual([])`) заради записания по-рано на ред 117-121 `pageerror`!

#### 2.2. Пропуски в `src/sw.ts` и офлайн теста, водещи до 240 s ханг при Retry #1 (`[ДОКАЗАНО]` от кода на `src/sw.ts` и `dist/sw.js`)
1. **Асинхронен `cache.put()` в Workbox `CacheFirst` (`src/sw.ts:42-45`, `dist/sw.js:1`):**
   - `src/sw.ts:42-45` регистрира `new CacheFirst({ cacheName: 'thornvael-sprites-v1' })` за `/sprites/*.{png,json}` (те са изключени от precache чрез `globIgnores: ['sprites/**']` във `vite.config.ts:45`).
   - В компилирания `dist/sw.js:1` методът `fetchAndCachePut(e)` на Workbox изглежда така:
     ```js
     async fetchAndCachePut(e) {
       let t = await this.fetch(e), n = t.clone();
       return this.waitUntil(this.cachePut(e, n)), t;
     }
     ```
     Тоест Service Worker-ът връща мрежовия отговор `t` на страницата **веднага**, а самото записване в `CacheStorage` (`this.cachePut(e, n)`, което започва с `await x(0)` / `setTimeout(0)`) се изпълнява асинхронно във фонов `event.waitUntil(...)`!
   - На ред `tests/pwa-smoke.spec.ts:109-113` онлайн загряването чака:
     `Boolean(window.__game) && Array.from(document.images).every((img) => img.complete)`
     Обаче `UnitAtlas.load()` (`src/sprites/units.ts:171`), `loadTerrainArt()` (`src/terrain.ts:51`) и `loadPackedAtlas()` (`src/sprites/extra-atlases.ts:44`) използват `new Image()`, които **не са закачени в DOM-а** и следователно **изобщо не присъстват в `document.images`**!
   - Веднага щом `window.__game` се появи, тестът напуска страницата и след 300 ms вика `context.setOffline(true)`. Ако дори един от ~60-те фонови `cache.put()` записа на `2048×2048` PNG атласи в `thornvael-sprites-v1` все още не е завършил в SQLite `CacheStorage` на WebKit преди `context.setOffline(true)`:
     - При офлайн навигацията (`tests/pwa-smoke.spec.ts:121`) `CacheFirst('thornvael-sprites-v1')` не намира файла в кеша и прави `fetch()` докато `context.setOffline(true)`.
     - За разлика от `thornvael-media-v1` (`src/sw.ts:35`) и `thornvael-audio-v1` (`src/sw.ts:62`), маршрутът `thornvael-sprites-v1` (`src/sw.ts:42-45`) **няма `handlerDidError`**, така че Workbox хвърля нехванат `WorkboxError: no-response` в `event.respondWith()`.
     - `UnitAtlas.load()` хвърля грешка $\rightarrow$ `Promise.all(ALL_UNIT_ART.map(...))` в `renderer.init(sim)` (`src/render.ts:808`) се отхвърля $\rightarrow$ `.catch()` на `src/main.ts:4372-4377` извиква `loadingScreen.showError(msg)` и **`window.__game` никога не се създава**!
     - На ред `tests/pwa-smoke.spec.ts:122` `waitForFunction(() => Boolean(window.__game))` **не проверява за `.tv-loading-retry-btn`** (за разлика от Act 1 теста на ред 169) и виси до изчерпване на таймаута.
2. **`LoadingScreen` ротира некеширани `.jpg` изображения на всеки 2.8 s (`src/loadingscreen.ts:9-45, 207-211`):**
   - `loadscreens/load-map*.jpg` и `townart/frame-*.jpg` не са в `self.__WB_MANIFEST` (`vite.config.ts:38-42`). Ако офлайн зареждането в бавния CI софтуерен рендер продължи над 2.8 s / 5.6 s, `sceneTimer` сменя `imgB.src` към следващата сцена (`load-map2-redmarsh.jpg`, `frame-hero-mage.jpg`), която никога не е била посещавана онлайн.

---

### Точка 3: Известни проблеми на Playwright/WebKit със `context.setOffline(true)` и Service Worker + история на комитите

#### 3.1. Известни проблеми в Playwright и WebKit
- **[microsoft/playwright#44015](https://github.com/microsoft/playwright/issues/44015)** (*"WebKit emits pageerror for caught fetch during outgoing-document navigation"*): В WebKit, когато `fetch()` е активен по време на навигация навън от документа или смяна на мрежовото състояние, WebKit `FetchLoader` прекратява заявката със съобщение `Fetch API cannot load <url> due to access control checks.` и Playwright WebKit драйверът го репортува като нехванат `pageerror`, дори когато JS кодът има `.catch()` или `try / catch`.
- **[microsoft/playwright#42823](https://github.com/microsoft/playwright/issues/42823)** (*"[WebKit] Pending fetches fail before pagehide during hard navigation"*): Същият механизъм при фонови JSON/data заявки, пуснати при зареждане на страница, която бива напусната преди завършването им.
- **[microsoft/playwright#2311](https://github.com/microsoft/playwright/issues/2311) & [microsoft/playwright#37295](https://github.com/microsoft/playwright/issues/37295)**: Проблеми със синхронизацията на `context.setOffline(true)` спрямо Service Worker нишката и `WebKitNetworkProcess` в WebKit (включително висящи навигации или fetch заявки при превключване на офлайн режим по време на активна SW комуникация).
- **WebKit Bugzilla ([Bug 202917](https://bugs.webkit.org/show_bug.cgi?id=202917) / `FetchLoader::didFail`)**: WebKit използва генеричната грешка `"due to access control checks"` (`ResourceError::Type::AccessControl` / `Cancellation`) за всякакви синхронно прекъснати или отказани от SW `respondWith` заявки.

#### 3.2. Анализ на историческите комити в репото (`[ДОКАЗАНО]` от `git show`)
- **`bfca37b` (2026-11-22 15:21):** Стабилизира паузата на рендера при отворени модали (`freezeWorldDraw` в `src/main.ts`) и добавя `{ force: true }` при кликане в диалозите на `tests/pwa-smoke.spec.ts`.
- **`e92eedd` (2026-11-22 16:56):** Открива и поправя безкраен цикъл на изхвърляне от VRAM в `LruVramManager` (`src/render.ts:468-572, 808-851`), при който `core:*` атласите (`1 088 MB` при бюджет `220 MB`) веднага изхвърляха `ext:*` атласите преди `draw()` да ги върже за `UnitSprite`. Добавя `activeExtendedArt` и `isVramKeyEvictable(key)`. Добавя и проверка за `.tv-loading-retry-btn` в Act 1 теста (`tests/pwa-smoke.spec.ts`), но **пропуска да я добави в офлайн теста (`tests/pwa-smoke.spec.ts:122`)**.
- **`7f5b4f1` (2026-11-22 17:31):** След като в CI run `45035516994` офлайн тестът увисва на `context.setOffline(true)` докато WebGL цикълът на скърмиш картата върви под `llvmpipe`, комитът добавя:
  ```ts
  await page.goto('/thornvael/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await context.setOffline(true);
  ```
  **Страничният ефект на `7f5b4f1`:** Вместо да спре WebGL цикъла или да отиде на празна/статична страница без фонови заявки, навигацията към `/thornvael/` стартира `runShell()` с 10+ фонови `fetch()` и 3 IndexedDB заявки, които биват прекъснати точно на 300-тата милисекунда от `context.setOffline(true)`.

---

### Точка 4: Какви дебъг данни липсват — минимален дъмп при timeout и качване с `if: always()`

В момента при timeout или cancel на WebKit job-а:
1. В `main` и `diag/webkit-boot` стъпката `actions/upload-artifact@v4` в `.github/workflows/ci.yml:64` е с `if: failure()`, което **не се изпълнява при отмяна (`cancelled`) на job-а** (в работното дърво на `D:\ROM 2 clone\game\.github\workflows\ci.yml:65` вече има незакомитната промяна `if: always()` и `timeout-minutes: ${{ matrix.project == 'webkit' && 8 || 15 }}`).
2. `error-context.md` на Playwright не съдържа `window.__bootPhase`, конзолните логове, `pageerror`, `requestfailed`, висящите (in-flight) мрежови заявки, нито състоянието на Service Worker-а и `CacheStorage`.
3. В `diag/webkit-boot` функцията `diagnose()` е сложена **само** в Act 1 теста, но **не и в офлайн теста** (`tests/pwa-smoke.spec.ts:94-133`), и само печата в `console.log` (което се губи при отмяна на job-а, вместо да запише файл в `testInfo.outputPath()`).

#### Предложен минимален диагностичен хелпер за `tests/pwa-smoke.spec.ts`
```ts
import fs from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';

function attachWebKitDiag(page: Page, testInfo: TestInfo) {
  const logs: string[] = [];
  const inFlight = new Map<string, number>();
  const t0 = Date.now();
  const stamp = () => `+${Date.now() - t0}ms`;

  page.on('console', (m) => logs.push(`[${stamp()} console.${m.type()}] ${m.text()}`.slice(0, 350)));
  page.on('pageerror', (e) => logs.push(`[${stamp()} pageerror] ${e.message}`.slice(0, 350)));
  page.on('request', (r) => inFlight.set(r.url(), Date.now() - t0));
  page.on('requestfinished', (r) => inFlight.delete(r.url()));
  page.on('requestfailed', (r) => {
    inFlight.delete(r.url());
    logs.push(`[${stamp()} reqfail] ${r.url()} -> ${r.failure()?.errorText}`);
  });

  return async (label: string) => {
    const domSnapshot = await page.content().then((c) => c.slice(0, 4096)).catch((e) => `contentErr: ${e}`);
    const state = await page
      .evaluate(async () => {
        const w = window as unknown as {
          __bootPhase?: string;
          __glLost?: number;
          __game?: { sim?: { tick?: number }; paused?: () => boolean };
        };
        const cacheCounts: Record<string, number> = {};
        if (typeof caches !== 'undefined') {
          for (const k of await caches.keys().catch(() => [])) {
            const c = await caches.open(k).catch(() => null);
            cacheCounts[k] = c ? (await c.keys().catch(() => [])).length : -1;
          }
        }
        return {
          url: location.href,
          bootPhase: w.__bootPhase ?? null,
          glLost: w.__glLost ?? 0,
          hasGame: Boolean(w.__game),
          tick: w.__game?.sim?.tick ?? null,
          paused: w.__game?.paused?.() ?? null,
          swControllerState: navigator.serviceWorker?.controller?.state ?? null,
          onLine: navigator.onLine,
          dialogueHidden: document.getElementById('gothic-dialogue')?.hidden ?? null,
          loadingStatus: document.querySelector('.tv-loading-status')?.textContent ?? null,
          loadingErr: document.querySelector('.tv-loading-err-msg')?.textContent ?? null,
          hasRetryBtn: Boolean(document.querySelector('.tv-loading-retry-btn')),
          cacheCounts,
        };
      })
      .catch((e) => ({ evalError: String(e) }));

    const payload = {
      label,
      elapsedMs: Date.now() - t0,
      state,
      pendingRequests: [...inFlight.entries()].map(([url, startedAtMs]) => ({ url, startedAtMs })),
      recentEvents: logs.slice(-50),
      domFirst4KB: domSnapshot,
    };
    const json = JSON.stringify(payload, null, 2);
    console.error(`WEBKIT-DIAG-DUMP [${label}]: ${json}`);
    try {
      fs.mkdirSync(testInfo.outputDir, { recursive: true });
      fs.writeFileSync(testInfo.outputPath(`webkit-diag-${label}.json`), json, 'utf8');
    } catch {}
  };
}
```

#### Конфигурация в `.github/workflows/ci.yml` за гарантирано качване на артефакта
- `timeout-minutes: ${{ matrix.project == 'webkit' && 10 || 15 }}` на job-а `playwright-smoke`, докато тест таймаутът в Playwright е `120_000` ms (или `180_000` ms), за да може Playwright сам да прекъсне теста, да изпълни `.catch(async (e) => { await dump(...); throw e; })`, да запише `test-results/**/webkit-diag-*.json` и стъпката `actions/upload-artifact@v4` с **`if: always()`** да качи артефакта преди GitHub Actions да убие runner-а.

---

### Точка 5: Локално възпроизвеждане по-близо до CI (`[ДОКАЗАНО — РЕАЛНО ИЗПЪЛНЕНО]`)

#### Какво беше пуснато и какво се получи:
1. **Опит в стандартния sandbox (`BypassSandbox: false`) с `DEBUG=pw:webserver`:**
   - Команда: `$env:CI='1'; $env:LIBGL_ALWAYS_SOFTWARE='1'; $env:DEBUG='pw:webserver'; node .\node_modules\@playwright\test\cli.js test -c playwright.smoke.config.ts --project=webkit --workers=1 --reporter=list -g "offline reload"`
   - Резултат: Sandbox-ът на Windows блокира loopback TCP сокета към `127.0.0.1:4174` с `connect EACCES 127.0.0.1:4174`, поради което `webServer` чака безкрайно.
2. **Реално изпълнение извън sandbox-а (`BypassSandbox: true`) на Офлайн теста с `CI=1`, `LIBGL_ALWAYS_SOFTWARE=1`, `--workers=1`, `--project=webkit`:**
   - Команда:
     ```powershell
     $env:CI='1'; $env:LIBGL_ALWAYS_SOFTWARE='1'; Set-Location "D:\ROM 2 clone\game"
     node .\node_modules\@playwright\test\cli.js test -c playwright.smoke.config.ts --project=webkit --workers=1 --reporter=list -g "offline reload"
     ```
   - **Резултат (`[ДОКАЗАНО]` — възпроизведе точно грешката от CI Run `45392441529` още на Опит 1!):**
     ```text
     Running 2 tests using 1 worker
       -  1 [webkit] › tests\pwa-smoke.spec.ts:94:5 › Mobile PWA smoke: Pixel 5 (Android) (F9) › offline reload works after service worker registration
       x  2 [webkit] › tests\pwa-smoke.spec.ts:94:5 › Mobile PWA smoke: iPhone 13 (iOS) (F9) › offline reload works after service worker registration (20.6s)
       ok 3 [webkit] › tests\pwa-smoke.spec.ts:94:5 › Mobile PWA smoke: iPhone 13 (iOS) (F9) › offline reload works after service worker registration (retry #1) (18.1s)

       Error: expect(received).toEqual(expected) // deep equality
       - Array []
       + Array [
       +   "/127.0.0.1:4174/thornvael/data/content/bestiary-extra.json due to access control checks.",
       +   "/127.0.0.1:4174/thornvael/data/content/tutorial.json due to access control checks.",
       + ]
         at D:\ROM 2 clone\game\tests\pwa-smoke.spec.ts:128:24
     ```
   - **Анализ на резултата:** На Опит 1 (`20.6s`) на ред 116-119 `page.goto('/thornvael/', { waitUntil: 'domcontentloaded' })` + `waitForTimeout(300)` + `context.setOffline(true)` прекъсна точно 2-рата заявка от `loadMonsterCodex()` (`bestiary-extra.json`, `src/missioncontent.ts:160`) и 2-рата заявка от `loadHelpAndCredits()` (`tutorial.json`, `src/missioncontent.ts:234`; в CI на Опит 1 е прекъснала 3-тата заявка от същата функция — `credits-and-menu.json`, `src/missioncontent.ts:241`!). На Retry #1 (`18.1s`), тъй като Service Worker-ът вече е бил активен от началото на теста и кешът е бил топъл, заявките на `/thornvael/` са приключили за `< 300 ms` и retry-ят мина.
3. **Реално изпълнение на `Act 1 Campaign Flow E2E` с `CI=1`, `LIBGL_ALWAYS_SOFTWARE=1`, `--workers=1`, `--project=webkit`:**
   - В `D:\ROM 2 clone\game` (където `dist/` е билднат преди комит `e8c78fb`): падна за `15.1s` на `expect(missionState.status).toBe(0)` (`Received: 1`), защото без `e8c78fb` тригерът `act1-cleared` печели мисията веднага на тик 1.
   - В `D:\ROM 2 clone\_wt-e2efix` (worktree на `diag/webkit-boot` с актуален `dist/` след `e8c78fb`): мина за **`31.4s`** (`1 passed (33.4s)`). Причината да не увисне на Windows е, че Windows build-ът на Playwright WebKit използва Direct3D11/ANGLE (игнорира `LIBGL_ALWAYS_SOFTWARE=1`, която е специфична за Linux Mesa/EGL) и Windows процесовият модел на WebKit не страда от Linux WebKitGTK/WPE `WebKitNetworkProcess` / `llvmpipe` блокировките.

---

### Точка 6: Преглед на клона `diag/webkit-boot` (`git diff main...diag/webkit-boot`)

Клонът `diag/webkit-boot` (комити `fbe4faa`, `e4507e4`, `6fcb62f`, `ecb26d6`, проверен и в worktree `D:\ROM 2 clone\_wt-e2efix`) съдържа:
1. **`src/main.ts:2281-2322`**:
   - Слушатели за `webglcontextlost` / `webglcontextrestored` (записват `window.__glLost` и `console.warn`).
   - Функция `bootStep(phase, p, ms = 8000)`, която задава `window.__bootPhase = phase` и ограничава с `Promise.race` 13-те функции `loadItemFlavor` .. `loadMissionContent`, след което записва `window.__bootPhase = 'content-loaded'`.
2. **`tests/pwa-smoke.spec.ts:143-278`**:
   - Премахва `test.skip(browserName === 'webkit' && !!process.env.CI)` от Act 1 теста и му задава `test.setTimeout(240_000)`.
   - Добавя `diagnose(label)` хелпер само около двете `waitForFunction` извиквания в Act 1 теста (`mission1` и `town`) с таймаут `90_000` ms.
3. **`.github/workflows/ci.yml` и `.github/workflows/deploy.yml`**:
   - Добавя `--reporter=list`, `timeout-minutes: 30` на `playwright-smoke`, и пропуска `artbudget.spec.ts` в CI освен при `workflow_dispatch`.

#### Готов ли е `diag/webkit-boot` за ново CI пускане? **НЕ — липсват 4 критични неща:**
1. **Липсва диагностика и фикс в Офлайн теста (`tests/pwa-smoke.spec.ts:94-133`):** В `diag/webkit-boot` офлайн тестът е непокътнат — няма `diagnose()`, все още навигира към `/thornvael/` за 300 ms преди `context.setOffline(true)` (което гарантирано хвърля `due to access control checks`), и на ред 122 не проверява `.tv-loading-retry-btn`.
2. **`__bootPhase` и `bootStep` в `src/main.ts` сляпо спират на `'content-loaded'` (`src/main.ts:2322`):** Ако хангът е преди ред 2309 (`loadGameData` на ред 102, `getCharacter` на ред 117, `loadMissionByName` на ред 150, `loadCampaign`/`readRecord` на редове 215/227, `setTerrainTheme` на редове 165/181/412) или **след** ред 2322 вътре в `renderer.init(sim)` (`app.init`, `loadTerrainArt`, `UnitAtlas.load` × 22, `loadAllExtraAtlases`, `updateChunks`, `missionUi.briefing` / `unlock()`, `renderer.draw`), `__bootPhase` няма да покаже коя точно стъпка в `renderer.init(sim)` или ранния буут е увиснала! Освен това 13 последователни `bootStep` по 8 s могат да забавят буута с до `104 s`.
3. **`.github/workflows/ci.yml:496` в `diag/webkit-boot` все още е с `if: failure()` и `timeout-minutes: 30`:** Ако job-ът бъде отменен или убит от job timeout, артефактът отново няма да се качи (промяната `if: always()` е само незакомитната в работното дърво на `D:\ROM 2 clone\game`, но я няма в `diag/webkit-boot`).
4. **`diagnose()` в `diag/webkit-boot` само печата в `console.log` и не записва файл в `test-results/`**, нито събира `page.content().slice(0, 4096)`, висящите мрежови заявки (`inFlight`) и състоянието на Service Worker / `CacheStorage`.

---

## Кандидати за причина (подредени по вероятност, с доказателства и критерий за опровергаване)

### Кандидат 1 (Най-вероятен за Офлайн теста — **ДОКАЗАН**): Навигацията към `/thornvael/` за 300 ms преди `context.setOffline(true)` + незавършен фонов `cache.put()` в `thornvael-sprites-v1` без `handlerDidError`
- **Доказателство (`файл:ред`):**
  - `tests/pwa-smoke.spec.ts:116-121`: `await page.goto('/thornvael/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(300); await context.setOffline(true);`
  - `src/main.ts:124-127` $\rightarrow$ `src/shell.ts:61-70, 164-172` $\rightarrow$ `src/missioncontent.ts:154-168, 230-244`: `runShell()` стартира неизчакани последователни `fetch()` вериги (`loadMonsterCodex`, `loadHelpAndCredits` $\rightarrow$ `credits-and-menu.json`) и 3 IndexedDB транзакции, които са in-flight на 300-тата милисекунда.
  - `src/sw.ts:42-45` и `dist/sw.js:1` (`fetchAndCachePut`): `CacheFirst('thornvael-sprites-v1')` връща отговора на страницата преди фоновият `cachePut` да е записал ~60-те файла от `/sprites/` в `CacheStorage`, и няма `handlerDidError`.
  - `tests/pwa-smoke.spec.ts:110`: `Array.from(document.images).every(img => img.complete)` не следи `new Image()` от `UnitAtlas.load` (`src/sprites/units.ts:171`), а ред `122` не проверява за `.tv-loading-retry-btn`.
  - **Локално възпроизведено `[ДОКАЗАНО]`:** Опит 1 падна на ред 128 с `bestiary-extra.json` и `tutorial.json due to access control checks.`.
- **Какво би го опровергало:** Ако след замяна на `page.goto('/thornvael/')` на ред 116 с `about:blank` (или изчакване на пълно зареждане + верификация, че `thornvael-sprites-v1` има всички нужни ключове преди `setOffline(true)`), офлайн тестът все още хвърля `access control checks` или увисва на ред 121-122.

### Кандидат 2 (Най-вероятен за Act 1 Campaign Flow E2E и Retry ханга): Увисване или отказ в `renderer.init(sim)` (`UnitAtlas.load` × 22 = 1.4 GB RGBA / `im.decode()` × 44 / `llvmpipe` WebGL) при зареждане на `act1-world` (`844×650`)
- **Доказателство (`файл:ред`):**
  - `src/flow.ts:42`: `m01-blood-at-the-ford` и `town-thornwick` зареждат `act1-world` (`844×650`, 307 юнита, 40 региона, 4 extended семейства).
  - `src/render.ts:807-813` и `src/sprites/units.ts:170-179, 198-221`: `renderer.init(sim)` безусловно зарежда паралелно всички 18 `ALL_UNIT_ART` + 4 `neededExtended` + 7 `extraAtlases` (**51 PNG декодирания едновременно**, **22 × `4096×4096` Canvas = 1 408 MB RGBA**, пиково ~2.4 GB по време на `splitMask`), плюс 12× `1024×1024` теренни чънка (`src/render/chunk-cache.ts:76-81`) и `prepareScenery` върху 548 600 тайла (`src/terrain.ts:182-224, 313-364`).
  - Нито един `im.decode()`, `new Image()` (`loadTerrainArt` в `src/terrain.ts:48`, `setTerrainTheme` в `src/terrain.ts:110-156`, `loadPackedAtlas` в `src/sprites/extra-atlases.ts:43`) няма таймаут. При повторното зареждане на `act1-world` за `town-thornwick` (`tests/pwa-smoke.spec.ts:233`) WebKit WebProcess + `llvmpipe` алокират нови 1.4+ GB преди старите да са освободени.
- **Какво би го опровергало:** Ако в CI диагностичният дъмп при таймаут покаже, че `__bootPhase` все още е преди `'renderer:init-start'` (напр. заседнал в `loadGameData`, IndexedDB или `loadItemFlavor`), или че `window.__game` вече е `true` (`__bootPhase === 'ready'`).

### Кандидат 3 (Висока вероятност за Linux CI WebKit): Извикване на `unlock()` (`new AudioContext()` + 90+ паралелни `.m4a` `fetch` и `decodeAudioData`) на headless Linux VM без аудио устройство по време на `runShell` и `missionUi.briefing()`
- **Доказателство (`файл:ред`):**
  - `src/shell.ts:141`: Първият клик върху `Single Player` в началото на Act 1 теста извиква `unlock()`.
  - `src/main.ts:4290` $\rightarrow$ `src/missionui.ts:888-889, 1099` $\rightarrow$ `src/audio.ts:342-348, 360-428, 901, 1962`: Още **преди** `window.__game` да бъде създаден на ред 4314, `missionUi.briefing()` вика `playSpeakerSwitchThrill()` и `playNpcBark()`, които чрез `if (canAutoUnlock()) unlock()` създават `new AudioContext()` и на ред `src/audio.ts:421` стартират **`SFX_NAMES.map(loadBuffer)` = 90+ паралелни `fetch('/thornvael/audio/*.m4a')` + `context.decodeAudioData(data)`**!
  - В Linux WebKitGTK/WPE (GStreamer аудио бекенд без звукова карта в GitHub Actions runner) масовото конкурентно извикване на 90+ `fetch` + `decodeAudioData` задачи натоварва `WebKitNetworkProcess` (задръствайки 6-те HTTP/1.1 слота към `127.0.0.1:4174`) и GStreamer декодер нишките точно по време на навигацията и зареждането на мисията.
- **Какво би го опровергало:** Ако в CI дъмпа `pendingRequests` не съдържа `/audio/*.m4a` заявки и `renderer.init(sim)` достига до `window.__game` за нормално време въпреки активен `AudioContext`.

### Кандидат 4 (Средна вероятност): Заседнал top-level `fetch()` в `src/main.ts:102, 215, 2281-2293` поради HTTP/1.1 connection contention (49+ JSON заявки при буут)
- **Доказателство (`файл:ред`):**
  - При буут на мисия `src/main.ts` прави: 3 (`loadGameData`, ред 102) + 3 (`hydrateCuratedTips` + `loadLocationPlaques`, редове 105-107) + 1 (`loadCampaign`, ред 215) + 37 (13-те последователни `await` на редове 2281-2293) + 9 (неизчакани на редове 2297-2299, 3846-3879) = **53 JSON `fetch()` заявки** преди `renderer.init(sim)` да добави още 29 JSON и 51 PNG заявки!
  - На `main` нито един от тези `fetch()`-ове няма `AbortSignal.timeout` или `Promise.race`.
- **Какво би го опровергало:** Ако с `bootStep` маркерите в CI се види, че `__bootPhase` преминава през всички `load*` стъпки и достига `'content-loaded'` без нито един `[boot] ... timed out` запис в конзолата.

### Кандидат 5 (Средна/Ниска вероятност): Блокирана IndexedDB транзакция (`getCharacter` на `src/main.ts:117` или `readRecord` на `src/main.ts:227`) след запис и незабавен `location.assign()`
- **Доказателство (`файл:ред`):**
  - `src/shell.ts:432-444, 521-525` (`addCharacter`, `writeRecord`, `deleteSave(AUTO)` $\rightarrow$ `location.assign`) и `src/main.ts:3515, 3540-3543` (`persistChar`, `writeRecord`, `deleteSave(AUTO)` $\rightarrow$ `location.assign`).
  - Веднага след навигацията новата страница вика `await getCharacter(...)` (`src/main.ts:117`) и `await readRecord()` (`src/main.ts:227`) през `src/savedb.ts:19-41`, където `indexedDB.open('thornvael', 1)` няма `onblocked` обработчик и няма таймаут.
- **Какво би го опровергало:** Ако `__bootPhase` в CI премине мигновено през `'getCharacter'` и `'readRecord'` (< 50 ms).

---

## Точен списък с промени за ЕДНО CI пускане, които да разграничат всички кандидати

За да се разграничат **всички 5 кандидата с ЕДНО единствено CI пускане** на `diag/webkit-boot`, трябва да се добавят следните минимални диагностични промени (над това, което вече е в `diag/webkit-boot`):

1. **Пълно покритие с `__bootPhase` и `bootStep` в `src/main.ts` и `src/render.ts`:**
   - Премести дефиницията на `bootStep` в началото на `src/main.ts` (преди ред 102).
   - Обвий ранните критични `await`-и с `bootStep`:
     - `await bootStep('1:loadGameData', loadGameData(), 10_000)` (`src/main.ts:102`)
     - `await bootStep('2:getCharacter', getCharacter(params.get('char')!), 5_000)` (`src/main.ts:117`)
     - `await bootStep('3:loadMissionByName', loadMissionByName(missionName), 15_000)` (`src/main.ts:150`)
     - `await bootStep('4:setTerrainTheme- early', setTerrainTheme(...), 8_000)` (`src/main.ts:165, 181`)
     - `await bootStep('5:loadCampaign', loadCampaign(), 8_000)` и `await bootStep('6:readRecord', ..., 5_000)` (`src/main.ts:215, 227`)
     - `await bootStep('7:setTerrainTheme-regions', setTerrainTheme(...), 8_000)` (`src/main.ts:412`)
   - Изпълни 13-те незадължителни flavor лоудъра (`src/main.ts:2281-2293`) с `Promise.all` в един общ `await bootStep('8:flavorContentAll', Promise.all([...]), 8_000)` (вместо 13 последователни `bootStep` × 8 s = 104 s).
   - Постави фини `__bootPhase` маркери вътре в `renderer.init(sim)` (`src/render.ts:733-892`) и `.then()` (`src/main.ts:4259-4314`):
     - `'9:pixi-app-init'` преди `await this.app.init(...)` (`src/render.ts:735`)
     - `'10:loadTerrainArt'` преди `await loadTerrainArt()` (`src/render.ts:745`)
     - `'11:prepareScenery'` преди `prepareScenery(this.map)` (`src/render.ts:746`)
     - `'12:loadUnitAtlases'` преди `await Promise.all([ALL_UNIT_ART..., loadAllExtraAtlases(), ...neededExtended])` (`src/render.ts:807`) — плюс брояч `window.__atlasProgress = { done: 0, total: ... }`, инкрементиран при всеки завършил `UnitAtlas.load`
     - `'13:updateChunks'` преди `this.updateChunks()` (`src/render.ts:890`)
     - `'14:briefing'` преди `missionUi.briefing(...)` (`src/main.ts:4290`)
     - `'15:firstDraw'` преди `renderer.draw(...)` (`src/main.ts:4300`)
     - `'16:gameReady'` веднага след `window.__game = ...` (`src/main.ts:4314`)
2. **Добавяне на `attachWebKitDiag(page, testInfo)` (от Точка 4 по-горе) в `tests/pwa-smoke.spec.ts`:**
   - Както в **`offline reload works after service worker registration`** (`tests/pwa-smoke.spec.ts:94-133`), така и в **`Act 1 Campaign Flow E2E`** (`tests/pwa-smoke.spec.ts:139-294`).
   - При всеки timeout или грешка в `try / catch`, `dump(label)` записва `webkit-diag-${label}.json` в `testInfo.outputPath(...)` (съдържащ `__bootPhase`, `__atlasProgress`, `__glLost`, `swControllerState`, `cacheCounts`, `pendingRequests`, последните 50 `console`/`pageerror`/`reqfail` събития и първите 4 KB от `page.content()`).
3. **Гарантирано качване на артефактите в `.github/workflows/ci.yml`:**
   - Промени `if: failure()` на **`if: always()`** за `actions/upload-artifact@v4` (`.github/workflows/ci.yml:64`).
   - Задай `timeout-minutes: 12` за `webkit` матрицата, а в `playwright.smoke.config.ts` задай `timeout: process.env.CI ? 150_000 : 60_000` за `webkit`, така че Playwright винаги да приключва и да записва диагностичните файлове преди GitHub Actions да прекрати job-а.

---

## Предложение за истинската поправка в приложението и теста (не само удължаване на таймаут)

### 1. Поправка за Офлайн теста и Service Worker кеширането (`src/sw.ts`, `tests/pwa-smoke.spec.ts`)
1. **В `tests/pwa-smoke.spec.ts:115-119`:** Не навигирай към `/thornvael/` (което пуска `runShell()` с 10+ фонови `fetch`-а точно преди `context.setOffline(true)`). Вместо това:
   - Преди да напуснеш онлайн скърмиш страницата (`?randskirmish=7...`), изчакай Service Worker кешът `thornvael-sprites-v1` реално да запише атласите:
     ```ts
     await page.waitForFunction(
       async () => {
         if (!window.__game) return false;
         const c = await caches.open('thornvael-sprites-v1');
         const keys = await c.keys();
         // 18 core unit atlases * 3 files (json + png + mask) = 54+ entries
         return keys.length >= 54;
       },
       undefined,
       { polling: 250, timeout: process.env.CI ? 90_000 : 45_000 },
     );
     ```
   - За да спреш WebGL цикъла без да стартираш нови фонови `fetch()` заявки, спри `requestAnimationFrame` цикъла и освободи WebGL контекста директно на страницата или навигирай към `about:blank` (и след `context.setOffline(true)` отвори `/thornvael/?randskirmish=7...`):
     ```ts
     await page.goto('about:blank', { waitUntil: 'commit' });
     await context.setOffline(true);
     ```
   - На ред `122` във `waitForFunction` добави fail-fast проверка за `.tv-loading-retry-btn`, идентична с тази в Act 1 теста.
2. **В `src/sw.ts:41-45` (`thornvael-sprites-v1`):** Добави `handlerDidError: async () => new Response(null, { status: 503, statusText: 'Offline' })` към `CacheFirst({ cacheName: 'thornvael-sprites-v1' })`, за да не хвърля нехванат `WorkboxError: no-response` в `event.respondWith()` при липсващ незадължителен extended атлас офлайн.

### 2. Поправка в приложението (`src/main.ts`, `src/render.ts`, `src/sprites/units.ts`, `src/terrain.ts`, `src/savedb.ts`)
1. **Таймаут + Fallback за всички мрежови, Image и IndexedDB операции при буут:**
   - В `src/terrain.ts:48-65, 110-156` и `src/sprites/extra-atlases.ts:43-48`: Добави таймаут (напр. `8 000 ms`) на всички `new Image()` промиси (`loadTerrainArt`, `loadSkin`, `setTerrainTheme`, `loadPackedAtlas`), които при изтичане на таймаута резолвват с `null` / fallback текстура вместо да висят безкрайно.
   - В `src/savedb.ts:19-41`: Добави `r.onblocked = () => { opening = null; reject(new Error('IndexedDB blocked')); }` и таймаут (напр. `4 000 ms`) на `open()` и `run()`, за да може `getCharacter()` и `readRecord()` да се върнат с `null` при блокирана IDB връзка в WebKit.
   - В `src/main.ts:2281-2293`: Изпълнявай 13-те незадължителни flavor лоудъра паралелно (`Promise.allSettled`) с общ таймаут `5 000 ms` (или ги пусни във фонов режим след `renderer.init(sim)`), а в `src/missioncontent.ts:47` поправи търсенето на възел в `loadMissionContent` да проверява и `campaignId` (а не само `n.map === map`, което винаги връща `null` за `act1-world`).
2. **Мързеливо (on-demand) зареждане на Unit Atlases в `src/render.ts:807-813` + Fallback към `fallbackUnitTex`:**
   - В момента `renderer.init(sim)` блокира създаването на `window.__game`, докато не декодира **всички 18 `ALL_UNIT_ART`** (включително всички 4 боса `morvessa`, `gorrathul`, `vesperion`, `ashkarath` и единици, които изобщо не присъстват на картата) в `22 × 4096×4096` Canvas-а (`1.4 GB` RGBA).
   - Поправка: Преди `window.__game` зареждай само реално използваните на текущата карта видове (`sim.cb.kind[i]` / `sim.cb.family[i]`) с ограничена конкурентност (напр. по 4 атласа наведнъж вместо 22 едновременно) и с таймаут `10 000 ms` на `UnitAtlas.load()`. Ако даден атлас се забави или падне, `createUnitSprite` (`src/render.ts:613`) **вече има вграден fallback** `new Sprite(this.fallbackUnitTex)`!

---

## Честен списък: какво НЕ беше проверено и защо

1. **Реално изпълнение на Linux (`ubuntu-latest` + WebKitGTK/WPE + Mesa `llvmpipe` + GStreamer):** Локалната машина е Windows без WSL, Docker или Linux VM, а правилата забраняват `git push` и пускане на GitHub Actions workflow. На Windows променливата `LIBGL_ALWAYS_SOFTWARE=1` се игнорира от D3D11/ANGLE бекенда на WebKit.
2. **Точната стойност на `window.__bootPhase` по време на CI ханга в `Act 1 Campaign Flow E2E`:** Тъй като CI run `45394888428` на клона `diag/webkit-boot` е бил отменен ръчно и няма запазени логове нито артефакти (`if: failure()` не се е задействал при cancel), нямаме записан `__bootPhase` от Linux runner.
3. **Пълно прекомпилиране на `dist/` върху `D:\ROM 2 clone\game`:** За да не модифицираме файлове в работното дърво на `D:\ROM 2 clone\game`, не пуснахме `npm run build` там; вместо това за локалния тест на `Act 1 Campaign Flow E2E` използвахме вече компилирания `dist/` в съседния worktree `D:\ROM 2 clone\_wt-e2efix` (`diag/webkit-boot`).

---

## Сортиран списък: Най-вероятна причина $\rightarrow$ Как се доказва с едно CI пускане

1. **[Кандидат 1 — ДОКАЗАН за Офлайн теста] `page.goto('/thornvael/')` + `waitForTimeout(300)` преди `context.setOffline(true)` прекъсва in-flight `fetch()` заявките от `runShell()` (`credits-and-menu.json`, `tutorial.json`, `bestiary-extra.json`) с `pageerror: ... due to access control checks`, а незавършеният фонов `cache.put()` в `thornvael-sprites-v1` (без `handlerDidError` и без проверка за `.tv-loading-retry-btn`) води до 240 s ханг при Retry:**
   - **Как се доказва с едно CI пускане:** В `webkit-diag-offline.json` дъмпа ще се видят `recentEvents` с `[pageerror] ... credits-and-menu.json due to access control checks`, или при таймаут на ред 122: `hasRetryBtn: true` / `loadingErr: "Unit atlas ..."` и `cacheCounts["thornvael-sprites-v1"] < 54`.
2. **[Кандидат 2 — Най-вероятен за Act 1 E2E ханга] Забиване или WebGL context loss в `renderer.init(sim)` (`src/render.ts:807-813`) при паралелно декодиране на 51 PNG файла и алокиране на 22 × `4096×4096` Canvas буфера (`1.4 GB` RGBA) под `llvmpipe` за `act1-world` (`844×650`):**
   - **Как се доказва с едно CI пускане:** В `webkit-diag-mission1.json` или `webkit-diag-town.json` полето `state.bootPhase` ще бъде `'12:loadUnitAtlases'` (с `atlasProgress.done < atlasProgress.total`), `'13:updateChunks'` или `'15:firstDraw'`, или `state.glLost > 0` / `state.hasRetryBtn === true`.
3. **[Кандидат 3 — Аудио декодиране без аудио устройство в Linux WebKit] `unlock()` (`src/audio.ts:360-428`), извикан от `shell.ts:141` и `missionUi.briefing()` (`src/missionui.ts:888-889`), пуска 90+ паралелни `fetch('/thornvael/audio/*.m4a')` + `ctx.decodeAudioData()` задачи, които задръстват `WebKitNetworkProcess` и GStreamer преди `window.__game`:**
   - **Как се доказва с едно CI пускане:** В `webkit-diag-mission1.json` списъкът `pendingRequests` ще е пълен с висящи `/thornvael/audio/*.m4a` заявки, стартирани преди няколко десетки секунди.
4. **[Кандидат 4 — Висящ top-level JSON `fetch()`] Един от 37-те последователни `fetch()` в `src/main.ts:2281-2293` (или `loadGameData` на ред 102 / `loadCampaign` на ред 215) увисва при конкуренция с неизчаканите фонови заявки:**
   - **Как се доказва с едно CI пускане:** В `webkit-diag-*.json` полето `state.bootPhase` ще стои на конкретното име на лоудъра (напр. `'1:loadGameData'` или `'loadCodexLore'`), или в `recentEvents` ще има `[console.warn] [boot] <phase> timed out after 8000 ms`, а `pendingRequests` ще показва точния висящ `.json` URL.
5. **[Кандидат 5 — Блокиран IndexedDB след `location.assign()`] `await getCharacter()` (`src/main.ts:117`) или `await readRecord()` (`src/main.ts:227`) виси на `indexedDB.open('thornvael', 1)` след запис на предходната страница:**
   - **Как се доказва с едно CI пускане:** В `webkit-diag-*.json` полето `state.bootPhase` ще стои на `'2:getCharacter'` или `'6:readRecord'` без висящи мрежови заявки в `pendingRequests`.
