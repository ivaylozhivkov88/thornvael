# Mobile UI Audit (`360x640` & `390x844`)

**Date:** 2026-11-23  
**Branch:** `gemini/big-pass`  
**Files Audited:** `src/gothic-hud.css`, `src/style.css`, `src/townstyle.css`, `src/ui/squad-bar.css`

---

## 1. Audit Checklist & Findings

| Check | Status Before | Issue Found | CSS Fix Applied |
|---|---|---|---|
| **44px Touch Targets** | Partial Fail | `.hud-btn` (`34px` min-height, `38px` at `<=720px` — verified as `38px` on `390x844` in Playwright), `.belt-slot` / `.skill-slot` (`38x38`), `.codex-close` (`36x36`), `.codex-tab` (`~26px` tall), `#shell .sh-btn` (`clamp(32px, 4.3vh, 44px)`) | Enforced `min-height: 44px; min-width: 44px` on `.hud-btn`, `.belt-slot`, `.skill-slot`, `.codex-close`, `.codex-tab`, and `#shell .sh-btn` under `@media (pointer: coarse)` / `max-width: 720px`. |
| **Portrait Overlay** | Pass | `@media (orientation: portrait) and (max-width: 700px) { #rotate { display: flex; } }` already covers `360x640` and `390x844`. | Verified `100dvh` + `z-index` containment intact. |
| **Safe-Area Insets** | Pass | `env(safe-area-inset-*)` present across `#game`, `#shell`, `#toast`, `.portraits`, `.hud-bar`, `.squad-bar`. | Preserved; added `max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 16px)` on `.sheet.codex-sheet`. |
| **Inventory Drag on Touch** | Partial | `.hero-sheet` / `[data-k^="inv"]` / `[data-k^="eq"]` could trigger browser scroll/pan during slow touch drags if not explicitly `touch-action: none`. | Added `touch-action: none; user-select: none;` to `#sheet [data-k^="inv"], #sheet [data-k^="eq"], .hero-figure`. |
| **Shop & Codex Scroll** | Partial | `.sheet.codex-sheet` used `max-height: 85vh` without `overscroll-behavior: contain` or `-webkit-overflow-scrolling: touch`; `.codex-grid` and `.shop-shelf` lacked explicit touch momentum & containment. | Updated `.sheet.codex-sheet`, `.codex-grid`, `.town .shop-shelf`, and `.town .town-body` with `-webkit-overflow-scrolling: touch; overscroll-behavior: contain;`. |
