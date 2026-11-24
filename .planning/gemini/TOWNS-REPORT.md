# TOWNS-REPORT (gemini/towns-2-3-4)

## Completed: City 1 — Redmarsh Outpost (`town-redmarsh`)
- **Builder & Map:** `tools/build-redmarsh.mjs` → `src/missions/redmarsh-outpost.map.json` (56x44 salt-flats/caravan layout, 9 buildings, 87 props, 14 units, N/E gates, waypoint `wp-redmarsh`, `biome: 'desert'`, `zone: 'salt-flats'`, `light: 'noon'`, `weather: 'clear'`, `music: 'music_town_redmarsh'`, `ambience: 'amb_town_redmarsh'`).
- **Campaign & Registry:** Updated `public/data/campaign.json` (`town-redmarsh.map = "redmarsh-outpost"`), registered in `src/mission-runtime.ts` and `src/mission.ts`. NPCs (`npc-bram-quartermaster`, `npc-tull-water-seller`, `npc-zahra-scholar`) already have dialogues in `public/data/content/npc-dialogues.json`.
- **Verification:**
  - `npm run typecheck`: 0 errors.
  - `npm run validate`: `validate-all: OK (112 quests, 212 dialogues, all maps/wiki/act2/act3 valid)`.
  - `npx vitest run --maxWorkers=1 tests/redmarsh-town.test.ts tests/thornwick-town.test.ts tests/flow.test.ts`: `3 passed (3)`, `9 passed (9)`.
  - Chrome E2E (`?mission=redmarsh-outpost&campaign=town-redmarsh`): `{"ok":true,"hasGame":true,"errors":[]}`, screenshot saved to `.planning/evidence/towns/redmarsh.png` (untracked).

## Completed: City 2 — Oakhaven Bastion (`town-oakhaven`)
- **Builder & Map:** `tools/build-oakhaven.mjs` → `src/missions/oakhaven-bastion.map.json` (56x44 coastal harbor bastion with water/piers & ironwood trees, 9 buildings, 69 props, 14 units, N-Gate `(28, 4)`, waypoint `wp-oakhaven`, `biome: 'coast'`, `zone: 'iron-coast'`, `light: 'night'`, `weather: 'fog'`, `music: 'music_town_oakhaven'`, `ambience: 'amb_town_oakhaven'`).
- **Dialogues & Campaign:** Added Act 3 entry dialogues for `npc-aldric-bailiff`, `npc-elowen-scholar`, `npc-toren-master` in `public/data/content/npc-dialogues.json` (`npc-sera-healer` already present). Updated `public/data/campaign.json` (`town-oakhaven.map = "oakhaven-bastion"`), registered in `src/mission-runtime.ts` and `src/mission.ts`.
- **Verification:**
  - `npm run typecheck`: 0 errors.
  - `npm run validate`: `validate-all: OK (112 quests, 215 dialogues, all maps/wiki/act2/act3 valid)`.
  - `npx vitest run --maxWorkers=1 tests/oakhaven-town.test.ts tests/redmarsh-town.test.ts tests/flow.test.ts`: `3 passed (3)`, `9 passed (9)`.
  - Chrome E2E (`?mission=oakhaven-bastion&campaign=town-oakhaven`): `{"ok":true,"hasGame":true,"errors":[]}`, screenshot saved to `.planning/evidence/towns/oakhaven.png` (untracked).

## Remaining
- City 3 — Highcrest Citadel (`town-ironcamp`): pending
