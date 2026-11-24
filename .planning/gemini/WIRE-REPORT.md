# Thornvael Wiring Report (`gemini/fix-all`)

**Branch:** `gemini/fix-all` (never pushed to `main`)  
**Baseline:** `npx tsc --noEmit` (0 errors), `npx vitest run --maxWorkers=2` (**160 passed (160)** files, **1183 passed | 1 skipped (1184)** tests).

## Unfinished Steps
- **W1:** Wire region atmosphere & audio crossfade in `src/main.ts`
- **W2:** Wire `SteppedQuestAdapter` in `src/main.ts` & `src/townui.ts` + integration test
- **W3:** Wire `dialogueFor` & reputation tier in `src/townui.ts` + test
- **W4:** Wire `src/data/tutorial.json` in `src/main.ts` + settings toggle
- **W5:** Wire `src/content-extras.ts` where clear + report table
- **W6:** Playwright browser verification (`1280x720` & `390x844`)
- **W7:** `npm run validate` & final full `vitest`

## Completed Steps
- **Baseline:** Recorded (`160/160` test files green, `0` TS errors).
