# Contributing to Thornvael

Thornvael is an original dark-fantasy top-down RTS/ARPG built with TypeScript, Vite, PixiJS, and Preact.

## 1. Core Rules
- **Original Assets & Text Only:** Never copy text, sprites, audio, or data from commercial games. All game copy is English-only.
- **Deterministic Simulation:** Code under `src/sim/` must remain pure TypeScript with zero PixiJS, DOM, or `Math.random()` usage. Use `Rng` (`src/sim/rng.ts`).
- **Viewport Containment:** All UI screens and modals must fit within `100vh`/`100dvh` without vertical page scrolling on desktop and landscape mobile.

## 2. Verified Development Commands

Run all commands from the `game/` directory:

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run typecheck` | Run `tsc --noEmit` for app and service worker (`tsconfig.sw.json`) |
| `npm test` / `npx vitest run --maxWorkers=2` | Run the Vitest unit & headless simulation suite |
| `npm run e2e` | Run Playwright E2E tests |
| `npm run build` | Generate offline manifest, typecheck, and build production bundle |
| `npm run wiki:data` | Rebuild `src/wiki/data/*.json` from game tables & content JSON |
| `npm run check:atlases` | Validate shipped sprite atlases, PNGs, and provenance |

## 3. Adding Content & Tests
- **Quests & Dialogues:** Edit `public/data/content/side-quests*.json`, `npc-dialogues.json`, and `town-barks.json`; run `npx vitest run tests/act1-quests.test.ts tests/act1-dialogues.test.ts`.
- **Wiki Data:** After editing content JSONs or `src/sim/items.ts` / `bestiary-extra.json`, run `npm run wiki:data` so `src/wiki/data/` stays synchronized.
- **Before Opening a PR:** Ensure `npm run typecheck`, `npx vitest run --maxWorkers=2`, and `npm run build` succeed cleanly.
