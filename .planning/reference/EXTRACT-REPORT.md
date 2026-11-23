# Reference Extraction Report (`gemini/reference-extract`)

**Branch:** `gemini/reference-extract` (never pushed to `main`)  
**Extract Sandbox:** `D:\ROM 2 clone\_extract\` (outside repo, never committed)

## Unfinished Tasks
- Task 7: Sound/UI Category Inventory (`AUDIO-UI-INVENTORY.md`)

## Completed Tasks
1. **Task 1 — Archive Inventory (`8595bb0`):** Built read-only `tools/extract-ref.py` supporting `.res`, `.mpq`, `.lod`, `.snd`, `.vid`, and `.zip`, and documented all archives, sizes, and file counts in `.planning/reference/ARCHIVES.md`.
2. **Task 2 — Rage of Mages II (`b3820f9`):** Documented `.res` / `data.bin` / `.alm` formats, class/spell/item/monster/XP/shop numeric bands in `.planning/reference/ROM2-DATA.md` and the 27-check / 49-action declarative quest architecture in `.planning/reference/ROM2-QUESTS-STRUCTURE.md`.
3. **Task 3 — Diablo II Item System (`307cdfa`):** Documented 3-tier base items, diminishing-MF quality divisor math, affix `alvl`/group gating, Treasure Class recursion, and socket/runeword mechanics in `.planning/reference/D2-ITEM-SYSTEM.md`.
4. **Task 4 — Diablo II Skills & Monsters (`0e8f9d7`):** Documented 3-tab x 6-row skill trees, synergy/cooldown curves, Normal/Nightmare/Hell monster scaling, resistance penalties, and charm/inventory trade-offs in `.planning/reference/D2-SKILLS-MONSTERS.md`.
5. **Task 5 — Heroes 3 Design (`e82b52e`):** Extracted `71` `.txt` tables from `H3bitmap.lod` to `_extract/homm3/` and documented creature tiers, 7-resource economy, town trees, secondary skills, spell tiers, map objects/events, AI heuristics, and battle formulas in `.planning/reference/HOMM3-DESIGN.md`.
6. **Task 6 — Cross-Game Synthesis:** Compared RoM2, D2, and HoMM3 mechanics against `src/data/**`, `src/skills/**`, and `src/sim/**`, ranking concrete proposals by value/effort in `.planning/reference/SYNTHESIS-FOR-THORNVAEL.md`.
