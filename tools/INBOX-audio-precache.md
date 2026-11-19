# Входяща задача: офлайн precache на новите звуци (за B2, после F2 проверява)

Намерено: 2026-11-19, CI run 44570211651 (Playwright smoke, WebKit).
Пада `tests/pwa-smoke.spec.ts:75` (offline reload след SW регистрация) на профилите Pixel 5 и iPhone 13.
Причина: новите .m4a (sfx_spell_*, ui_*, sfx_quest_*, sfx_level_up и др.) не са в precache на service worker-а,
а играта ги заявява при старт -> "TypeError: Load failed" офлайн.

Да се направи:
1. Включи всички нови аудио файлове в precache манифеста / chapter pack (виж public/chapter1-manifest.json и src/sw).
2. audio-adaptive и каталогът да не хвърлят грешка, ако файл липсва офлайн (тих fallback).
3. Пусни npx playwright test tests/pwa-smoke.spec.ts (WebKit) до зелено.
Не пипай src/sim/path.ts, models/, tools/render-unit.py. Ред в HANDNOTE: "audio precache: готово <hash>".
