# 05-PERF-SIZE — Performance, Bundle Size & Offline PWA Audit (2026-11-24)

## 1. Measured Sizes (Observed on `main` / `gemini/cleanup`)
- **`public/` total on `main`:** `~219–222 MB` (3,182+ files; 0 `.wav` files — audio already `.m4a`).
- **SW Precache (`dist/sw.js`) on `main`:** `12,703.25 KiB` (`12.42 MB`, 755 entries).
  - Top JS/asset weights in `dist/sw.js`: `assets/` (`6.45 MB`, including `wiki-*.js` 695 KB, `main-*.js` 643 KB, `items-*.js` 460 KB, `lore-*.js` 439 KB, `missions-act1-*.js` 369 KB, `missions-skirmish-*.js` 319 KB, `bestiary-*.js` 251 KB, `missions-act{2,3,4}` ~637 KB), `data/` (`2.02 MB`), `itemicons/` (`1.35 MB`), `townart/` (`1.35 MB`).
- **Top `public/` files:** `public/sprites/*.png` (`salt-crab.png` 2.88 MB, `dune-scarab.png` 2.53 MB, `maggot-swarm.png` 2.50 MB, `claw-viper.png` 2.46 MB, `crowned-maw.png` 2.23 MB). Note: `tools/check-repo.mjs` enforces `<= 2 MB` per binary; `sprites/**` are excluded from precache and loaded on demand (`src/sw.ts:43`).

## 2. Findings & Concrete Optimizations
1. **[S2, medium] First-load precache is 12.42 MB on `main` (`vite.config.ts:38-52`):** Precaches `wiki.html`, `editor.html`, `assets/wiki-*.js`, `assets/missions-act[234]-*`, `assets/missions-skirmish-*`, `itemicons/**`, and `townart/portraits/merc-*.jpg` even though `src/sw.ts:26-44` already provides lazy `CacheFirst` runtime caching. **Fix:** Already prototyped & verified on `gemini/cleanup` (`03e7398`), cutting precache to `7,366.34 KiB` (320 entries) with offline E7 passing.
2. **[S2, medium] 5 orphan images in `public/townart/` (~2.66 MB) & large PNG portraits:** `merchant-shop.png`, `merchant-tavern.png`, `scene-shop.jpg`, `shop.png`, `tavern.png` have 0 references; 4 class portraits (`portrait-{archer,necromancer}-{m,f}.png`) total 2.28 MB vs 0.12 MB as WebP. (Already cleaned on `gemini/cleanup` `0f0b9f3` & `03e7398`, pending merge to `main`).
3. **[S2, medium] 10 sprite atlases in `public/sprites/*.png` exceed 2 MB (`salt-crab.png` 2.88 MB .. `dune-beast.png` 2.07 MB):** Risk hitting `tools/check-repo.mjs` 2 MB binary limit and higher mobile WebGL texture memory. **Fix (medium):** Re-pack or quantize (`pngquant`/8-bit indexed RGBA) those 10 sprite sheets under 2 MB.
4. **[S3, small] `main` JS chunk (`643.34 kB`):** Above Vite's 500 kB warning threshold. Lazy-loading `townui`/`heroui`/`saveui` modals could trim initial parse time on slow 4G.
5. **Sim Performance:** Verified `< 1 ms/step` at 300 units (`tests/spells.test.ts` & `tests/movement.test.ts`).
