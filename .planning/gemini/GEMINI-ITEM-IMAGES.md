Repo: D:\ROM 2 clone\game (Thornvael). Branch `gemini/item-images` (create from current HEAD). Never push to main. Commit often (`wip(items): ...`), stage only your own files (`git add <paths>`, never -A).

TASK: you take over generating the item/paperdoll images and cutting them out.

INPUT: `.planning/gemini/doll_prompts.json` (261 entries {key,prompt}). State: `.planning/gemini/doll-queue-state.json` (results = already generated keys; DO NOT edit or overwrite it, DO NOT touch public/itemicons or public/townart/doll except via the ingest tool below). Keep your own state in `.planning/gemini/item-images-state.json` {done:[keys], failed:[keys]}. Skip keys already in doll-queue-state.json results.

PIPELINE per key:
1. Generate the image from `prompt` with your own image generation (plain white background, centered, no text, no shadow, one single item; for gloves/boots ONE item unless the key says pair).
2. Save raw to `.planning/gemini-results/items/<key>.png` (square, >=512px).
3. Remove the background (transparent PNG) and crop tight to the item with small padding. Use sharp/python (Pillow) if you have no built-in tool; check the result visually: no white halo, item fully inside, nothing cut off.
4. Ingest: `node tools/ingest-item-image.mjs <cropped.png> <key>` (outputs 128x128). Read the tool first to see exact expected args; do not change it.
5. Record the key in item-images-state.json, commit.

PHASE 1 (TEST, stop after): do 6 items: shield--kite, offhand-mage--orb, gloves--glove-l--warrior-m, weapon--abdication, weapon--healer-seras-amputation-saw, and the first unfinished entry from doll_prompts.json (index 64). Then write `.planning/gemini/ITEM-IMAGES-TEST.md`: what tool you used, quality notes, problems (halo, pairs, style drift), time per item. STOP and wait for confirmation.

PHASE 2 (only after the user says go): process all remaining keys in order, same pipeline, keep a consistent painterly oil dark-fantasy style. Update the state file and commit every 5 items. Report unfinished at top of `.planning/gemini/ITEM-IMAGES-REPORT.md`.

RULES: original art only, English text only, no copied game assets. Do not touch: src/sim/path.ts, tests/movement.test.ts, src/main.ts, src/townui.ts, src/doll.ts. Run `npx tsc --noEmit` at the end of each phase.
