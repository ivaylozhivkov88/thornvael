# План за довършване на Act 2, Act 3 и Act 4 (по модела на Act 1)

> **Статус:** Само план (не се започва работа по него без изрично "да").
> **Цел:** Да доведем Act 2 (Redmarsh), Act 3 (Iron Coast / Oakhaven) и Act 4 (Obsidian Caldera / Ironcamp) до същия 100% завършен и тестван стандарт като Act 1.

---

## 1. Куестове, тригери и награди (`side-quests*.json`, `sidequests*.ts`)

1. **Превръщане на 90-те Act 2–4 куеста в пълни stepped куестове:**
   - В момента Act 2 (`23`), Act 3 (`34`) и Act 4 (`33`) имат **0/90** куеста с `steps[]` (само Act 1 има `22/22` stepped).
   - Да се добавят `steps[]` (диалог → убийство/събиране/зона/ескорт → завършване с избор и награди) за куестовете в `public/data/content/side-quests.json` и `side-quests-2/3/4.json` за Acts 2–4.
2. **Добавяне на липсващия `onEnterZone` тригер:**
   - В `src/sidequests.ts` (`QuestTriggerType`) и `src/sidequests-adapter.ts` да се добави `'enter_zone'` / `onEnterZone(zoneId)` и да се извиква при смяна на регион/зона в `src/main.ts` (`regionAtTile` ~3144).
3. **Пълно покритие на Unique наградите (`src/sidequests-rewards.ts`):**
   - `UNIQUE_ID_TO_NAME` в момента чете само `uniques.json`. Да се заредят и `public/data/content/uniques-2.json` и `uniques-3.json`, така че Act 2–4 куест наградите с уникални предмети да се решават 100% точно.

---

## 2. Градове (Redmarsh, Oakhaven, Highcrest), NPC-та и диалози

1. **Контекстно мапване на градовете в `src/townui.ts`:**
   - `openLoreDialogue()` (`src/townui.ts:1136-1163`) хардкодва Thornwick NPC-тата и `dialogueFor('town-thornwick', ...)` за всички градове.
   - Да се добави мапване по текущия град (`town-redmarsh`, `town-oakhaven`, `town-ironcamp`/`highcrest-citadel`) към съответните Act 2–4 NPC-та (`npc-bram-quartermaster`, `npc-zahra-scholar`, `npc-tull-water-seller`; `npc-sera-healer`, `npc-kors-shipwright`, `npc-lyra-warden`, `npc-pip-mudlark`; `npc-rowan-commander`, `npc-vok-forgemaster`, `npc-elias-penitent`) и правилния `town-*` fallback за `town-barks.json`.
   - Да се премахне хардкоднатият звук `npc.hobb_smith.greet` / `npc.marta_alchemist.greet` (`src/townui.ts:201, 211`) в полза на град-специфични поздрави.
2. **Обновяване на градските карти (`redmarsh-outpost`, `oakhaven-bastion`, `highcrest-citadel`):**
   - Да се вдигнат `tiers` и `spells` в `towns[0]` (в момента и трите града са на Act 1 ниво `tiers: [1, 3]`, `spells: [0, 1, 4, 7, 9, 11, 19]`):
     - Act 2 (`redmarsh-outpost`): `tiers: [2, 4]`, средни магии
     - Act 3 (`oakhaven-bastion`): `tiers: [3, 5]`, висши магии
     - Act 4 (`highcrest-citadel`): `tiers: [4, 5]`, всички магии до endgame
   - Да се синхронизират поставените NPC-та в `oakhaven-bastion.map.json` (`Kors`, `Lyra`, `Pip`) и `highcrest-citadel.map.json` (`Rowan`, `Vok`, `Elias`) с `npcs.json` и `npc-dialogues.json` (или да се добавят пълни диалози за `Aldric`, `Elowen`, `Toren`, `Vance`, `Veyra`, `Elda`, `Orla`).
   - Да се добавят базови безопасни градски тригери (както в `thornwick-market.map.json`), а също да се проверят/изчистят евентуални 11 `team: 1` юнити в `thornwick-market.map.json` (отчетени при одита!).

---

## 3. Босове на Act 2, 3 и 4 (`gorrathul`, `vesperion`, `ashkarath`)

1. **Поставяне на босовете в финалните мисии и world картите:**
   - В момента `gorrathul`, `vesperion` и `ashkarath` съществуват **само** в самостоятелните арени (`gullet-of-dunes`, `drowned-choir`, `cinder-throne`), които ги няма в `campaign.json`, и **липсват** от финалните мисии и world картите:
     - **Act 2:** Постави `gorrathul` (`family: 'gorrathul'`, `bossMods`, `BossPhaseController`) в `m23-fork-of-spears-128.map.json` и `act2-world.map.json`.
     - **Act 3:** Постави `vesperion` (`family: 'vesperion'`) в `m35-burning-harbor-192.map.json` и `act3-world.map.json`.
     - **Act 4:** Постави `ashkarath` (`family: 'ashkarath'`) в `m45-crown-of-order-256.map.json`, `m46-ember-reckoning-256.map.json` и `act4-world.map.json`.
   - Проверка че за всяко финално сражение се активират съответната музика (`music_boss_*`), рев (`boss_roar_*`) и фази на боса (`BOSS_PROFILES`).

---

## 4. Скриптирани награди в мисиите (`m24..m46`) и преходи

1. **Награди при завършване на мисии в Act 3 и Act 4:**
   - В Act 2 (`m12..m23`) всички 12 мисии имат `giveMoney`, но в Act 3 **11/12** (`m24..m35`) и в Act 4 **11/11** (`m36..m46`) нямат никакви скриптирани награди в тригерите (`giveMoney`, `giveXp`, `addItem`).
   - Да се добавят балансирани `giveMoney`, `giveXp` и ключови `addItem` / рунически награди за победа в `m24..m46` (плюс проверка на останалите 8/11 в Act 1).
2. **Проверка на Act IV разклонението (`m44-threshold-choice`):**
   - Верифицирай с интеграционен тест че `choose-order` (`branch === 1`) отключва само `m45-crown-of-order`, а `choose-ember` (`branch === 2`) отключва само `m46-ember-reckoning`, и че финалът отключва New Game+ (`startNewGamePlusRecord`).

---

## 5. Офлайн пакети (Chapter 2, 3, 4) и интеграционни тестове

1. **Chapter 2–4 Manifests (`tools/make-manifest.mjs`, `src/offline.ts`, `src/shell.ts`):**
   - Разшири `make-manifest.mjs` да генерира `chapter2-manifest.json`, `chapter3-manifest.json` и `chapter4-manifest.json` (карти, спрайтове, аудио, слайдове, loadscreens за съответния акт), за да могат Acts 2–4 да се свалят и играят офлайн на телефон.
2. **Интеграционни тестове (`tests/acts-2-3-4-integration.test.ts`):**
   - Покрий автоматично: 0 врагове в градовете, наличие на `gorrathul`/`vesperion`/`ashkarath` в `m23`/`m35`/`m45`/`m46`, правилни `towns[0].tiers/spells`, Act 2–4 stepped куестове + награди + `uniques-2/3.json`, Act IV разклонение и NG+ преход.
