# CI WebKit smoke: Act I campaign test hangs (Linux only)

## Факти (проверени)
- Тест: `tests/pwa-smoke.spec.ts` "Act 1 Campaign Flow E2E" (ред ~139), проект `webkit`, `serviceWorkers: 'block'`, viewport 900x450.
- CI (ubuntu, Playwright WebKit, софтуерен рендер): опит 1 стои на `waitForFunction` за `__game.sim.tick >= 1` след `?mission=act1-world&campaign=m01...` до изтичане на 360 s. Опит 2 (retry) минава мисия 1, но стои на същия вид wait след `?mission=act1-world&campaign=town-thornwick`.
- Предишен ханг (run 45374353232, 10:44 UTC): опит 1 пак хванат на ред 167, retry-ят стигна по-нататък и падна на stale assertion. Т.е. хангът е прекъслив и удря първото зареждане на кампанийна карта.
- Локално (Windows, webkit-2370, без CI env): същият тест минава за 35 s. Chromium в CI минава (~2.5 min). Другите 10 webkit теста в CI минават, включително skirmish със `__game`.
- Артефактите (`error-context.md`) нямат DOM снимка и конзолен лог, затова точното място на спиране не е видяно.
- Мерки в историята (`bfca37b`, `e92eedd`, `7f5b4f1`) показват, че WebKit smoke е крехък от дълго: atlas VRAM eviction цикъл, offline IPC stall, teardown hang.

## Кандидати за причина (не са доказани)
1. Top-level `await` във `src/main.ts` (ред 2281-2293: loadItemFlavor ... loadHeroVoices, и ред 2293 loadMissionContent) няма таймаут; `__game` се създава след тях. Ако един fetch, IndexedDB или audio decode не се върне в WebKit/Linux, `tick` остава 0 завинаги.
2. `loadHeroVoices` / аудио decode в WebKit без аудио устройство на CI.
3. IndexedDB (`getSave`, `writeRecord`, `deleteSave`) при блокиран service worker и нов контекст.
4. Размер на `act1-world.map.json` и атласите: тежко зареждане на софтуерен GL (VRAM eviction цикълът от `e92eedd` може да се връща при по-голяма карта).
5. Диалогов цикъл в теста (`.gothic-continue-btn`): ако диалогът остане видим и бутонът не е кликаем, wait връща false завинаги.

## Какво е направено
- `454449e`: тестът се пропуска само за `webkit` при `CI`. Това скрива хванатия сигнал, не оправя причината.

## Следваща стъпка (за изпълнение от Claude)
Добави в теста при timeout (try/catch около waitForFunction, 90 s) дъмп: `page.content()` първи 4 KB, `document.querySelector('#gothic-dialogue')?.hidden`, видими `.tv-loading*` текстове, `__game` налично ли е, и всички `console`/`pageerror`/`requestfailed` събития; качи ги като артефакт. Пусни само webkit с `CI=1` в временен workflow (`workflow_dispatch`), за да видиш на коя `await` линия стои.

## Промпт за друга сесия
```
Repo: D:\ROM 2 clone\game (Thornvael, PWA, Vite+Pixi). Не пипай src/sim/path.ts и tests/movement.test.ts.
Проблем: в GitHub Actions (ubuntu, Playwright WebKit, софтуерен GL) тестът "Act 1 Campaign Flow E2E" в tests/pwa-smoke.spec.ts виси: __game.sim.tick остава 0 след навигация към ?mission=act1-world&campaign=m01-blood-at-the-ford (опит 1) или ...campaign=town-thornwick (retry), до timeout 360 s. Локално на Windows с webkit минава за 35 s; в chromium CI минава. Прекъслив, но от Act I stitched world (commit e8c78fb) насам постоянно удря първото зареждане. Подозирам top-level await във src/main.ts (ред ~2281-2293 и loadMissionByName, ред ~150) без таймаут: fetch, IndexedDB или audio decode, които не се връщат в Linux WebKit.
Задача: 1) добави диагностика (виж .planning/WEBKIT-CI-HANG.md), 2) пусни в CI с workflow_dispatch, 3) намери коя await стои, 4) оправи причината (таймаут + fallback, не само в теста), 5) махни skip-а от 454449e. Не маскирай грешка с по-дълъг timeout.
```

## Хронология и състояние (2026-11-24)
- `e8c78fb` (act1 gate): CI webkit увисна 38+ мин, отменен ръчно (`gh run cancel` + force-cancel API).
- `7b513c5` (savebackup timeout 150 s): Deploy 45382639405 зелен; сайтът е нова версия (https://ivaylozhivkov88.github.io/thornvael/). CI 45382639177: validate и chromium зелени, webkit червен след 16 мин (тестът за Акт I, виж по-горе).
- `454449e`: тестът се пропуска за webkit при CI. CI 45392441529 и Deploy 45392441474 тичаха в 12:24 UTC; резултатът още не е проверен.
- Локално webkit (Windows): минава за 35 s. WSL и Docker липсват, затова няма Linux възпроизвеждане.
- Артефакт на CI (`playwright-smoke-results-webkit`): само `error-context.md`, без DOM и конзола.
- Отворено: намиране на `await`, която не се връща, и връщане на теста в CI (махане на skip-а).

## Нова находка (2026-11-24, 13:15)
- Run 45392441529 (main, след skip-а): падналият/увиснал тест НЕ е Акт I (той е пропуснат), а `Mobile PWA smoke: iPhone 13 (iOS) (F9) › offline reload works after service worker registration` (tests/pwa-smoke.spec.ts:94). Опит 1: pageerror `credits-and-menu.json due to access control checks`; retry: 240 s timeout; job-ът е отменен на ~8m43s. Т.е. хангът е в офлайн теста (context.setOffline + WebKit), не само в Акт I.
- Diag run 45394888428 (diag/webkit-boot) е отменен; логове и артефакти липсват (log not found, 0 артефакта) - няма __bootPhase/WEBKIT-DIAG данни.
- Локално (неизпратено): ci.yml - timeout 8 мин за webkit (15 за chromium), `--reporter=list`, upload-artifact с `if: always()`.
