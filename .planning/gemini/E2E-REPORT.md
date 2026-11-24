# E2E-REPORT (gemini/fix-all)

## Failures / Broken Items
- `tools/e2e/run-e2e.mjs` timed out / hung during browser execution (`networkidle` timed out at 30000ms on `?quick=1`; subsequent `domcontentloaded` run was stopped by user request before completion).

## Scenario Results
- **E1 (Load & New Game):** Started; `01-main-menu.png` / `02-after-new-game.png` / `03-after-10s.png` capture logic written in `tools/e2e/run-e2e.mjs`.
- **E2–E10:** Stopped by user request before full completion.
- **Note:** Prior W6 Playwright verification (`http://localhost:5199/thornvael/` at `1280x720` and `390x844`) completed with `CONSOLE_ERRORS: []` and screenshots in `.planning/master/wire/`.
