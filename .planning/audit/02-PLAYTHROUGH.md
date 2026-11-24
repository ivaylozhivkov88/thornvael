# 02-PLAYTHROUGH — Live Browser Playthrough & Viewport Audit (2026-11-24)

**Environment:** Chrome (`channel: 'chrome', headless: false`) against Vite dev server `http://127.0.0.1:5199/thornvael/`.  
**Screenshots:** `.planning/evidence/audit/*.png` (untracked).

## 1. Executed Scenes & Measured Results

| Scene | Viewport | `overflowX` | `overflowY` | `brokenImgs` | `hasGame` | Console/Page Errors | 404s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `01-menu-desktop` | 1280×720 | `false` | `false` | 0 | `false` | 0 | 0 |
| `02-quick-desktop` (`?quick=1`) | 1280×720 | `false` | `false` | 1 (`.tv-loading-bg-img`, `src: null`) | `true` | 0 | 0 |
| `03-redmarsh-desktop` (`town-redmarsh`) | 1280×720 | `false` | `false` | 1 (`.tv-loading-bg-img`, `src: null`) | `true` | 0 | 0 |
| `04-oakhaven-desktop` (`town-oakhaven`) | 1280×720 | `false` | `false` | 1 (`.tv-loading-bg-img`, `src: null`) | `true` | 0 | 0 |
| `05-highcrest-desktop` (`town-ironcamp`) | 1280×720 | `false` | `false` | 1 (`.tv-loading-bg-img`, `src: null`) | `true` | 0 | 0 |
| `06-menu-mobile-land` | 844×390 | `false` | `false` | 0 | `false` | 0 | 0 |
| `07-quick-mobile-land` (`?quick=1`) | 844×390 | `false` | `false` | 1 (`.tv-loading-bg-img`, `src: null`) | `true` | 0 | 0 |
| `08-menu-mobile-port` | 390×844 | `false` | `false` | 0 | `false` | 0 | 0 |

## 2. Findings
1. **[S3] Empty `<img>` on dismissed loading screen (`src/loadingscreen.ts`):** `.tv-loading-bg-img` remains in DOM with `src: null`, causing `naturalWidth === 0` (`brokenImgsCount: 1`) across all gameplay scenes. **Fix (small):** Omit or remove `src` / hide `<img>` via `display: none` or remove element when loading finishes.
2. **[S2] Headless `chrome-headless-shell.exe` WebGL crash on Windows:** Launching Playwright default headless Chromium with `--use-angle=swiftshader` triggers Windows `Unknown Hard Error`. **Workaround verified:** `channel: 'chrome', headless: false` runs cleanly with 0 WebGL/shader errors.
3. **What was NOT tested interactively in this pass (marked UNVERIFIED visually):**
   - Full interactive walkthrough of all 4 classes in Hero Creation UI (`02-PLAYTHROUGH`), opening Shop/Tavern/Spellbook/Inventory modals manually in Chrome, Act 1 missions m02–m11 live in browser, Storage & Offline screen clicks, and `stats-gl` FPS measurement on 300 live units in browser (300-unit sim step is verified in `tests/spells.test.ts` and `tests/movement.test.ts`).
