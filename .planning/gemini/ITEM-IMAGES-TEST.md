# Phase 1 Item Images Test Report

**Branch:** `gemini/item-images`  
**State File:** `.planning/gemini/item-images-state.json` (`6` done, `0` failed)

## 1. Pipeline & Tools Used
- **Generation:** Built-in `image-generator` subagent (`1024x1024` `.jpg` output per item, run 6 in parallel).
- **Cutout & Crop:** Python 3.12 + Pillow (`PIL`): border flood-fill transparency (`r,g,b >= 232`, neutral chroma `<= 20`) + 1px edge de-halo pass + tight bounding-box crop with `6px` padding, saved to `.planning/gemini-results/items/<key>.png` (raw) and `.planning/gemini-results/items-cropped/<key>.png` (transparent).
- **Ingest:** `node tools/ingest-item-image.mjs <cropped.png> <key>` -> writes trimmed layer to `.planning/gemini-results/doll-layers/<key>.png` and `128x128` icon to `public/itemicons/<slug>.png`.

## 2. Results & Quality Notes

| Key | Raw Size | Cropped Size | Icon Output | Quality / Notes |
|---|---:|---:|---|---|
| `shield--kite` | `1024x1024` | `915x930` | `public/itemicons/kite.png` | Clean silhouette, dark oak & weathered steel rim, no halo. |
| `offhand-mage--orb` | `1024x1024` | `817x831` | `public/itemicons/orb.png` | Smoky crystal + silver filigree, pale blue glow preserved. |
| `gloves--glove-l--warrior-m` | `1024x1024` | `573x948` | `public/itemicons/glove-l.png` | Single left gauntlet (prompt explicitly suppressed "matching pair set"). |
| `weapon--abdication` | `1024x1024` | `302x969` | `public/itemicons/abdication.png` | Full greatsword unclipped, notched blade & crown pommel crisp. |
| `weapon--healer-seras-amputation-saw` | `1024x1024` | `317x997` | `public/itemicons/healer-seras-amputation-saw.png` | Serrated flamberge spine & brass crossguard clean. |
| `weapon--inquisitors-ash-siphon` | `1024x1024` | `220x938` | `public/itemicons/inquisitors-ash-siphon.png` | Slender black steel/bone wand, crystal tip intact. |

## 3. Observations & Timing
- **Halo:** Border flood-fill + 1px de-halo pass removed the white background cleanly without eroding bright metallic/crystal highlights.
- **Pairs:** `doll_prompts.json` contained `"matching pair set"` in `gloves--glove-l--warrior-m`; overriding the instruction to explicitly request a single left gauntlet prevented pair generation. Phase 2 should apply the same single-item guard for `gloves--*` and `boots--*` unless `"pair"` is in the key.
- **Style Drift:** Consistent painterly oil dark-fantasy lighting (upper-left) across all 6 items.
- **Time per Item:** ~20–25s wall-clock per batch of 6 in parallel (~4s effective per item), plus ~2s total for Pillow cutout + `ingest-item-image.mjs`.
