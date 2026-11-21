# HANDOFF — Antigravity / Thornvael Master State (Updated 2026-11-21 23:08 EET)

> **2% Quota Safety Margin Rule:** При достигане на <= 2% остатъчен лимит текущата стъпка се стабилизира, комитва и пушва веднага, този файл (`tools/HANDOFF-ANTIGRAVITY.md`) и `tools/HANDNOTE.md` се обновяват с точния следващ ред, и задачата се предава на следващия наличен агент/модел за незабавно продължаване без изчакване на потребителя.

---

## 1. Какво е ЗАВЪРШЕНО и ПУШНАТО в `origin/main` (`D:\ROM 2 clone\game`)

1. **`77a889a` — Spell & Unique Item Icons (Priority 3a & 3b)**:
   - 38 индивидуални `64x64` PNG икони за заклинания в `public/spellicons/*.png` + 20 уникални предмета в `public/itemicons/uniq-*.png`, всички регистрирани в `assets.json` (`license: "own"`).
2. **`9ce125a` — Wiki 100% Art, Minimaps, Lore & Adaptive Audio Crossfade**:
   - 251 нови графични актива в `public/wiki/minimaps/` (7 биома, 28 региона, 46 мисии) и `public/wiki/icons/` (169 икони) + `public/townart/portrait-necromancer.png`.
   - Adaptive Audio (`src/audio.ts`): 1.6s кросфейд между изследване и бой, 4.0s хистерезис, драматичен бос преход и -4dB приглушаване при магазин/диалог (`51/51` теста PASS).
3. **`e5bcbe1` & `cb92628` — Quest Log Navigate & Isolated Campaign Gold Piles**:
   - Бутон `Navigate` в Quest Log-а центрира камерата, рисува пулсиращ фар на миникартата и стрелка по ръба на екрана (`src/questlog.ts`, `src/minimap.ts`, `src/main.ts`).
   - Интерактивни златни купчини (`src/sim/loot.ts`, `src/mission.ts`) с изолиран детерминистичен PRNG и изключване на `glade` (`22/22` теста PASS вкл. `tests/skirmish-director.test.ts`).
4. **`0cf40d8` — Town Hub NPC Idle Animations & World Environmental Animations**:
   - Живи градски сцени (ковач с искри, страноприемница с камина и гости, храм с медитиращ жрец, стражи) и анимирани факли, лагерни огньове, знамена и водно колело (`src/art-wave3.ts`, `src/render/atlas-overlays.ts` — `33/33` теста PASS).
5. **`ea746a5` — Biome Atmosphere Overlays, Monster Family Death FX & Projectile Trails**:
   - Атмосферни слоеве по биоми (`src/atmosphere.ts`), специфични смъртни ефекти по семейства и бос hit-stop + loot pop (`src/feel.ts`), и следи за снаряди (`src/vfx.ts` — `23/23` теста PASS).
6. **`b84a98e` — Parallel Wiki Live Sync & Live Holy Grail Status in `wiki.html`**:
   - **2,219 / 2,219 статии** в 19 категории със 100% валидни изображения (`0` липсващи, `0` `"No lore yet."`).
   - Добавени 29 нови статии за всички нови механики + редове `Grail Tome` и `Drop Clue` във всички инфобоксове.
   - Жив Holy Grail статус и `🎯 Pin Grail Target` (до 3 цели) в `src/wiki/grail-status.ts`, `src/wiki/ArticleView.tsx` и `src/wiki/HomePage.tsx` (`13/13` Vitest + `2/2` Playwright `wiki-smoke.spec.ts` PASS).
7. **`d5e597f` & `84b2187` — Phase 1 (P0): Optional Gameplay Assists in Settings + Tactics Engine**:
   - Избираеми настройки в `src/preferences.ts`, `src/shell/settings-binder.ts`, `src/pausemenu.ts`, `src/ui-extra/settings-panel.ts` (`autoCastMode`, `autoHealThresholdPct`, `manaReservePct`, `autoNavigateObjectives`, `autoFightMode`, `autoLootSweep`, `autoPotionThresholdPct`).
   - Детерминистично тактическо ядро в `src/sim/tactics.ts`: `evaluateAutoCast`, 3 стойки (`hold`, `guard`, `aggressive`), `computeRegroupFormation`, `computeHighGroundBonus` ($\Delta h \ge 2 \rightarrow +1.5$ обсег, $+15\%$ точност, $+10\%$ крит), `stepAutoNavigate` и `performLootSweep` (`40/40` теста PASS).
8. **`81335f3` — Phase 4: 🏆 THE HOLY GRAIL & Imperial Reliquary System**:
   - 5 Колекционерски Тома в `src/codex.ts` и `src/codexui.ts` (`thornvael_grail_v2`), запазване на динамичните уникати/сетове без свиване до `baseId`, `% Roll Perfection` (`0..100%`), Primal рамка ($\ge 98\%$), ловни следи (`getGrailDropClue`), пинване до 3 цели, Account-Wide награди по прагове (`10/25/50/75/100%`) и наземен лъч `🏆 NEW GRAIL!` в `src/loot-overlay.ts` (`17/17` теста PASS).

---

## 2. Активни агенти в момента (Какво да продължи следващият агент)

1. **Subagent `c6d78b04-c20a-46cd-9636-0d1dbae081ec` (`Veterancy, Bounties & Master Gameplay Integrator` — Argon)**:
   - **Stage 1**: Финализира 5-те тестови корекции в `src/sim/town.ts`, `src/town.ts`, `tests/veterancy-bounties-runewords.test.ts` (Mercenary Veterancy, Temple Resurrection, Runeword Assistant, Item Compare, Tavern Bounties & Mystery Gamble), минава `30/30` теста и пушва.
   - **Stage 2**: Навързва `src/sim/tactics.ts`, `src/town.ts` и Holy Grail в `src/main.ts` и `src/heroui.ts` + комитва готовите E2E и `src/` фиксове (`e2e/*.spec.ts`, `src/paperdoll.ts`, `src/camera.ts`, `src/style.css`, `.github/workflows/ci.yml`).
2. **Subagent `b875ff98-0149-4866-a86f-3d894bde188a` (`Chief Project Critic & Deep Auditor` — Argon)**:
   - Изготвя максимално критичния технически и геймплеен одит на проекта (с проверка за мъртъв код, реални дроп таблици за 132-та униката от Граала, стилово единство на арта, `100dvh` спазване и монолитни модули).
3. **Автоматичен таймер `task-10571`**:
   - Настроен да събуди сесията след ресета на 5-часовия прозорец, ако нещо е останало недовършено.

---

## 3. Забранени файлове (НИКОГА не се пипат или комитват)
- `src/sim/path.ts`, `tests/movement.test.ts`, `models/`, `tools/render-unit.py`, чужди промени в `src/terrain.ts`.
