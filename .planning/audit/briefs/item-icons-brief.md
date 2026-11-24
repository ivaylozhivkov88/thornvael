# Brief: Generate Remaining 246 Item Doll Icons (`gemini/item-images`)

- **Branch / Worktree:** `gemini/item-images` (`d:\ROM 2 clone\game-item-images`, currently at 15/261 done, 8 failed, 238 remaining).
- **Inputs:** `.planning/gemini/doll_prompts.json` (261 entries `{ key, prompt }`), `.planning/gemini/item-images-state.json`, `tools/ingest-item-image.mjs`.
- **Requirements:**
  1. Generate 1 item at a time (retry `failed` first, then remaining keys).
  2. Style: 128×128 cutout via `tools/ingest-item-image.mjs`, single item centred on plain white background (gloves/boots = single item, never a pair).
  3. Whitespace gate: count opaque pixels with `min(r,g,b) > 215`; must be `< 3%` of opaque pixels.
  4. Commit in batches of ~10, updating `item-images-state.json` and `ITEM-IMAGES-REPORT.md`.
  5. Register all new `.png` files in `assets.json` before merging to `main` so `npm run check:repo` passes.
