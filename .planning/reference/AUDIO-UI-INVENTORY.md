# Reference Audio & UI Category Inventory

*Category names and file counts only (no assets copied), compared against Thornvael's `.planning/audio/CUE-SHEET.md` and `sfx_prompts.json` (`80` prompts).*

---

## 1. Rage of Mages II
- **Music (`music.res`):** `21` `.wav` tracks (menu, regional exploration, combat, town, victory/defeat).
- **SFX (`sfx.res`, `445` `.wav`):**
  - `characters` (`88`), `monsters` (`77`), `ambient` (`56`), `town` (`36`), `units` (`36`), `town_kaarg` (`35`), `town_druid` (`34`), `magic` (`33`), `chrgen` (`17`), root/misc (`33`).
- **Voice (`speech.res`, `1,133` `.wav`):**
  - `talk` (`491`), `shop` (`145`), `shop_kaarg` (`144`), `accept` (`95`), `town` (`95`), `shop_druid` (`91`), `reject` (`65`), `about` (`7`).
- **UI & Sprites (`graphics.res`, `4,049` files):**
  - `interface` (`1,162`), `equipment` (`1,104`), `inventory` (`491`), `units` (`337`), `structures` (`327`), `objects` (`271`), `infowindow` (`185`), `terrain` (`53`), `projectiles` (`46`), `cursors` (`46`).

---

## 2. Diablo II
- **Music (`d2music.mpq`, `d2xmusic.mpq`):** `45` + `12` archive blocks (town themes, act wilderness/dungeon suites, title/credits).
- **SFX (`d2sfx.mpq`, `2,328` `.wav`):**
  - `monster` (`1,301`), `ambient` (`323`), `skill` (`236`), `combat` (`223`), `object` (`166`), `item` (`42`), `cursor` (`24`), `quest` (`13`).
- **Voice (`d2speech.mpq`, `d2xtalk.mpq`):** `1,566` + `478` blocks (hero class callouts, town NPC gossip/quest lines, boss taunts).
- **UI (`d2data.mpq`):** `1,287` `.dc6` UI/panel/item-icon sprites + `18` `.tbl` localization string tables.

---

## 3. Heroes of Might and Magic III Complete
- **Music (`Mp3/`):** `79` `.mp3` tracks (town themes, terrain themes, battle themes, campaign/menu cues).
- **SFX (`Heroes3.snd` `1,115`, `HotA.snd` `278`, `H3ab_ahd.snd` `117`, `HotA_lng.snd` `23` = `1,533` total):**
  - Adventure map ambient loops, creature move/attack/hit/death sounds, spell cast/impact cues, UI clicks, fanfares.
- **UI (`H3bitmap.lod`, `H3ab_bmp.lod`):** `4,809` + `2,406` `.pcx` panels, portraits, town screens, and cursors; `2,565` + `347` `.def` sprite sheets.

---

## 4. Comparison to Thornvael's Audio Cue Sheet (`.planning/audio/CUE-SHEET.md`)
- **Covered Well:** Thornvael's `11` Act I–II music cues + `80` SFX prompts (`sfx-wpn-*` 14, `sfx-hit-*` 10, `sfx-spl-*` 16, `sfx-mon-*` 16, `sfx-ui-*` 12, `sfx-amb-*` 12) map cleanly to the core combat, spell, UI, and ambient categories above.
- **Notable Gaps to Fill Later:**
  1. **Quest & Object Interaction SFX (`13` + `166` in D2):** Separate distinct chimes for shrine activation, quest step advancement, and chest/door unlocks.
  2. **Cursor & Refusal Feedback (`24` in D2, `65` `reject` in RoM2):** Distinct invalid-target / out-of-mana / encumbered feedback cues.
  3. **Town-Specific Ambient Beds (`town` / `shop` in RoM2):** Separate smithy anvil bed vs tavern murmur bed vs harbor waves.
