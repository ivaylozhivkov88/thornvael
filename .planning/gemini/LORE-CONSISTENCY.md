# Act 1 & Cross-Act Lore Consistency Audit

**Date:** 2026-11-23  
**Branch:** `gemini/act1-content`  
**Sources Cross-Checked:**
- `public/data/content/side-quests*.json`
- `public/data/content/npc-dialogues.json`, `npcs.json`, `field-npcs.json`
- `public/data/content/bosses.json`, `missions.json`, `uniques*.json`
- `src/sim/super-uniques.ts`
- `src/wiki/data/*.json` (rebuilt via `tools/build-wiki-data.mjs`)
- `.planning/gemini/doll_prompts.json` (read-only, 261 paperdoll keys)

---

## 1. Mismatches Found & Fixed

| # | Category | Mismatch / Issue | Files Affected | Resolution |
|---|---|---|---|---|
| 1 | NPC / Title Collision | **Collector Vance** (disgraced Act I river toll collector) collided with **Marshal Vance** (Act IV Highcrest commander). | `public/data/content/side-quests.json`, `npc-dialogues.json`, `uniques.json`, `src/wiki/data/uniques.json`, `src/wiki/data/lore.json` | Renamed Act I tax collector to **Collector Harlon** and rebuilt wiki data. |
| 2 | NPC Name Collision | **Ferryman Hobb** (`field-alder-ferryman`) collided with Thornwick's blacksmith **Master Hobb** (`npc-hobb-smith`). | `public/data/content/field-npcs.json`, `src/wiki/data/lore.json` | Renamed `field-alder-ferryman` to **Ferryman Garren** and rebuilt wiki data. |
| 3 | NPC Name Collision | **Peddler Bram** (`field-border-peddler`, Act I) collided with **Quartermaster Bram** (`npc-bram-quartermaster`, Act II Redmarsh). | `public/data/content/field-npcs.json`, `side-quests-2.json`, `npc-dialogues.json`, `src/wiki/data/lore.json` | Renamed `field-border-peddler` to **Peddler Merrin** across quests, field NPCs, and dialogues, and rebuilt wiki data. |
| 4 | Boss / Super-Unique Name Lock | **Vaelor, the Shattered Warden** echoed the superseded `Vaelor` name that conflicts with the Vaelen twins (**High Arcanist Vaelen** / **Siege Commander Velen**). | `src/sim/super-uniques.ts`, `src/wiki/data/bestiary.json` | Renamed `fallen-warden-azrael` display name to **Valgor, the Shattered Warden** and rebuilt wiki data. |

---

## 2. Cross-Check Against `.planning/gemini/doll_prompts.json` (Read-Only)

- All **135** `weapon--*`, `helm--*`, and `armor--*` paperdoll keys in `.planning/gemini/doll_prompts.json` were cross-checked by normalized title against `src/wiki/data/items.json` (464 entries) and `src/wiki/data/uniques.json` (132 entries).
- **Result:** `135 / 135` matched by display title (`0` unmatched items).
- **Preserved Internal ID Aliases (Not Mutated for Save Compatibility):**
  - `uniq-kaelen-marrow-needle` (display title: *Saelen's Marrow Needle*) matches `weapon--saelens-marrow-needle`.
  - `uniq-tollkeeper-bill` (display title: *Tollkeeper's Receipt*) matches `weapon--tollkeepers-receipt`.
  - `town-ironcamp` (display title: *Highcrest Citadel* in `campaign.json`) is preserved as an internal ID in `npcs.json` and `side-quests*.json` to avoid breaking campaign saves.
  - `item-*` reward tokens in `side-quests-3.json` (e.g., `item-iron-buckler`, `item-alchemist-mortar`) are symbolic quest reward descriptors consistent across Acts I–IV.
