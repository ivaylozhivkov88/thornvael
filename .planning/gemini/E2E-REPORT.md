# E2E-REPORT (gemini/fix-all)

## Failures / Broken Items
- **Fixed:** `TypeError: Cannot read properties of undefined (reading 'visible')` at `Renderer.unitScreen` ([src/render.ts](file:///d:/ROM%202%20clone/game/src/render.ts#L1166-L1167)) when `this.sprites[i]` was undefined before sprite init. Fixed with `if (!s || !s.visible) return null;`.
- **Environment:** `chrome-headless-shell.exe` with SwiftShader crashed with Windows `Unknown Hard Error`; switched `tools/e2e/run-e2e.mjs` to `channel: 'chrome', headless: false` with real GPU WebGL.

## Scenario Results (Chrome, `1280x720` & `390x844`)
- **E1 (Load & New Game):** `ok: true`, `errors: []`, `failed404: []`
- **E2 (Thornwick):** `ok: true`, `canvas: { hasCanvas: true, nonBlack: true }`, `errors: []`, `brokenImgs: []`, `failed404: []`
- **E3–E6 (`?quick=1`, `window.__game`):** `ok: true`, `canvas: { hasCanvas: true, nonBlack: true }`, `hasGame: true`, `errors: []`
- **E7 (Offline on `vite preview`):** `ok: true`, `swReady: true`, `title: "Thornvael"` (after `npm run build`, 755 precached entries)
- **E8 (Mobile `390x844` touch):** `ok: true`, `overflowX: false`, `errors: []`
- **E10 (Item icons 404 check):** `ok: true`, `failed404: []`
