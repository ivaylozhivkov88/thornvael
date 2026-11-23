# Lore & Canonical Name Locks Report (Voice & Text)

**Authority:** `THORNVAEL-MASTER-LORE-BIBLE-SCRIPT.md` (PART I §1.4 & Scenes 2, 4)  
**Voice Index Updated:** `src/voice-clips.ts` via `python tools/generate-all-voices.py --skip-tts` (1,111 total clips indexed; **no audio re-synthesized** in this pass).

---

## Summary of Canonical Name Locks Applied

1. **Hexer Saelen vs. Master Smith Kaelen**
   - **Master Kaelen** is strictly the master smith in Thornwick (`src/story-complete.ts`).
   - **Hexer Saelen** is the Act II Hexer (`m19` / `SQ2-03` / Ashen Coven / Redmarsh).
   - Unique item `uniq-kaelen-marrow-needle` renamed from *"Lancet of the Stone Circle"* to **Saelen's Marrow-Needle** with updated lore referencing **Hexer Saelen** (`public/data/content/uniques.json`, `src/data/text/item-lore.json`, and rebuilt into `src/wiki/data/`).
   - Removed unrelated `Marshal Kaelen` speaker attribution in `src/missions/ashen-tier.map.json` (`msg.1.who` -> `Marshal Vance`).
2. **The Vaelen Twins (High Arcanist Vaelen vs. Siege Commander Velen)**
   - **High Arcanist Vaelen** preserved for the elder Thornwick scholar (`src/missionui.ts`, `src/townui.ts`, `src/sim/items.ts`, `map1` `msg.9.who`, `lore__high_arcanist_vaelen_*`, and Velen's dialogue lines about his brother).
   - **Siege Commander Velen** locked for the Act I Ashbrook Gate / `m11` southern commander across `campaign.json`, `m11-ashbrook-retreat.map.json`, `map1-border-fords.map.json`, `make-macro-map1.mjs`, `bosses.json`, `boss-dialogue.json`, `mission-texts.json`, `mission-radio.json`, `missions.json`, `cutscene-scripts.json`, `cutscenes.json`, `codex-entries.json`, `lore-books.json`, `loading-screens.json`, `act-endings.json`, `achievements-2.json`, `objective-hints.json`, `timeline.json`, `elevate-narrative.mjs`, and `tests/campaign-act1.test.ts`.
3. **Lord-Captain Korvus vs. Arch-Mage Malrik**
   - Aligned stale `m35-burning-harbor` entries (`mission-radio.json`, `mission-radio-extra.json`, `mission-texts.json`, `objective-hints.json`, `side-quests-2.json`, `achievement-triggers.json`) to **Lord-Captain Korvus ("The Iron Anchor")** on the Eastern War Pier and Marshal Veyra on the Western Evacuation Pier.
   - Aligned `achievements.json` (`malrik-caught`: `"Commander Malrik"` -> `"Arch-Mage Malrik"`) and `objective-hints-2.json` (`m39-flight-of-malrik`: fixed inverted escort hint to pursuing/slaying traitor **Arch-Mage Malrik** in Ashveil Gorge).
   - Verified `m37` and `map4-obsidian-caldera.map.json` (`Arch-Mage Malrik & Vaelor`, where `Vaelor, the Shattered Warden` is a distinct super-unique boss) have no Korvus/Velen/Kaelen conflicts.

---

## Voice Clips Requiring Future Re-Recording (19 Clips)

The following **19 existing `.m4a` clips** in `public/audio/voices/` have updated spoken text where `"Vaelen"` became `"Velen"` or `"Kaelen"` became `"Saelen"` (plus `"her"` -> `"his"` in `m19` briefing). Because `TEXT_VOICE_INDEX` in `src/voice-clips.ts` hashes `raw_text`, the old hash entries no longer match the updated texts; these 19 files should be deleted and re-synthesized with `python tools/generate-all-voices.py` in a future audio pass.

### 1. Siege Commander Velen (Vaelen → Velen) — 11 Clips

| Clip ID | Speaker | Voice Profile | Old Spoken Text | New Spoken Text |
| :--- | :--- | :--- | :--- | :--- |
| `bd_morvessa_intro` | `morvessa` | `en-GB-SoniaNeural (-6Hz, -5%)` | Vaelen bled his levies on your oak doors. I came with ledgers, not battering rams, to collect every sack of grain Thornwick owes. | Velen bled his levies on your oak doors. I came with ledgers, not battering rams, to collect every sack of grain Thornwick owes. |
| `boss_morvessa_pre_02_morvessa` | `morvessa` | `en-GB-SoniaNeural (-6Hz, -5%)` | Vaelen bled his levies on your oak doors. I came with ledgers, not battering rams, to collect what Thornwick owes. | Velen bled his levies on your oak doors. I came with ledgers, not battering rams, to collect what Thornwick owes. |
| `cs_act1_end_02_npc_garrick_captain` | `npc-garrick-captain` | `en-GB-ThomasNeural (-4Hz, -3%)` | Vaelen's banners are broken, though half the town is packed onto three wagons with nothing but seed-corn. | Velen's banners are broken, though half the town is packed onto three wagons with nothing but seed-corn. |
| `map__ashbrook_retreat__body` | `Warden Hale` | `en-GB-RyanNeural (-6Hz, -4%)` | Dusk settles over Ashbrook as the siege host marches on the southern gatehouse. Hold the gate against their assault waves, then counterattack up the valley road to defeat Siege Commander Vaelen. | Dusk settles over Ashbrook as the siege host marches on the southern gatehouse. Hold the gate against their assault waves, then counterattack up the valley road to defeat Siege Commander Velen. |
| `map__ashbrook_retreat__msg_3` | `Captain Isolde` | `en-IE-EmilyNeural (-2Hz, +0%)` | The siege assault breaks at the gate! Push north-east and end Vaelen’s command! | The siege assault breaks at the gate! Push north-east and end Velen’s command! |
| `map__ashbrook_retreat__msg_4` | `Captain Isolde` | `en-IE-EmilyNeural (-2Hz, +0%)` | Vaelen summons his last reserve from the upper ridge! | Velen summons his last reserve from the upper ridge! |
| `map__ashbrook_retreat__msg_5` | `Captain Isolde` | `en-IE-EmilyNeural (-2Hz, +0%)` | Siege Commander Vaelen is cut down amidst the smoke of his command tent. His field desk splits open under our blades, yielding the siege war-ledger and the six hundred gold sovereigns meant to pay his vanguard. | Siege Commander Velen is cut down amidst the smoke of his command tent. His field desk splits open under our blades, yielding the siege war-ledger and the six hundred gold sovereigns meant to pay his vanguard. |
| `map__the_border_fords_weeping_ossuary__msg_7` | `Warden Hale` | `en-GB-RyanNeural (-6Hz, -4%)` | [WAR LOGIC - Heroic: Success] *(The southern portcullis groans open, revealing the alkali dust-haze of the Redmarsh depression beyond.)* Ashbrook Gatehouse is ours and Siege Commander Vaelen has fallen! The southern road into Redmarsh Outpost lies open. | [WAR LOGIC - Heroic: Success] *(The southern portcullis groans open, revealing the alkali dust-haze of the Redmarsh depression beyond.)* Ashbrook Gatehouse is ours and Siege Commander Velen has fallen! The southern road into Redmarsh Outpost lies open. |
| `mc_m11_ashbrook_retreat_intro_03_morvessa` | `morvessa` | `en-GB-SoniaNeural (-6Hz, -5%)` | Look how tightly they huddle behind cracked mortar. Vaelen—break their hinges and salt the cellar. | Look how tightly they huddle behind cracked mortar. Velen—break their hinges and salt the cellar. |
| `mc_m11_ashbrook_retreat_intro_05_npc_hobb_smith` | `npc-hobb-smith` | `en-US-AndrewNeural (-4Hz, -4%)` | The gate timbers won't survive another hour of rams. We hold the breach, then sally up the road and kill Vaelen! | The gate timbers won't survive another hour of rams. We hold the breach, then sally up the road and kill Velen! |
| `mt_m11_ashbrook_retreat_briefing` | `Narrator` | `en-GB-RyanNeural (+0Hz, -3%)` | Iron-shod rams batter Ashbrook's southern gatehouse while Morvessa watches from the ridge. Hold the splintered postern until the townsfolk clear the north road, load the evacuation wagons, and sally out to take Commander Vaelen's head. | Iron-shod rams batter Ashbrook's southern gatehouse while Morvessa watches from the ridge. Hold the splintered postern until the townsfolk clear the north road, load the evacuation wagons, and sally out to take Commander Velen's head. |

### 2. Hexer Saelen (Kaelen → Saelen) — 8 Clips

| Clip ID | Speaker | Voice Profile | Old Spoken Text | New Spoken Text |
| :--- | :--- | :--- | :--- | :--- |
| `map__hexer_s_hollow__body` | `Warden Hale` | `en-GB-RyanNeural (-6Hz, -4%)` | A rogue blood-hexer conducts foul rites deep within Hexer's Hollow. Breach the cavern sanctuary, cut down her bone guardians, and bring an end to her maledictions. | A rogue blood-hexer conducts foul rites deep within Hexer's Hollow. Breach the cavern sanctuary, cut down his bone guardians, and bring an end to his maledictions. |
| `map__hexer_s_hollow__msg_1` | `Scholar Vane` | `en-GB-ThomasNeural (+2Hz, -3%)` | Keep water charms ready—Kaelen and his coven rely on fire imps and frost. | Keep water charms ready—Saelen and his coven rely on fire imps and frost. |
| `map__hexer_s_hollow__msg_2` | `Captain Isolde` | `en-IE-EmilyNeural (-2Hz, +0%)` | Kaelen is bleeding—his hidden acolytes are pouring out of the shrine! | Saelen is bleeding—his hidden acolytes are pouring out of the shrine! |
| `map__hexer_s_hollow__msg_3` | `Scholar Vane` | `en-GB-ThomasNeural (+2Hz, -3%)` | Hexer Kaelen falls. His staff shatters on the flagstones. | Hexer Saelen falls. His staff shatters on the flagstones. |
| `map__the_redmarsh_wastes_ironheart_cisterns__npc_tull` | `tull` | `en-GB-RyanNeural (+0Hz, -3%)` | Hexer Kaelen and the Venom Patriarch Ssorath have poisoned the central oasis well. Bring me the knuckle-bone talisman from their cauldron and I'll share our purest cistern reserves. | Hexer Saelen and the Venom Patriarch Ssorath have poisoned the central oasis well. Bring me the knuckle-bone talisman from their cauldron and I'll share our purest cistern reserves. |
| `mc_m19_hexer_capture_intro_02_npc_marta_alchemist` | `npc-marta-alchemist` | `en-US-AriaNeural (-2Hz, -2%)` | Hexer Kaelen is rotting our wounded from twenty miles away—marrow turning to grey pulp inside clean bandages. | Hexer Saelen is rotting our wounded from twenty miles away—marrow turning to grey pulp inside clean bandages. |
| `mc_m19_hexer_capture_intro_03_npc_zahra_scholar` | `npc-zahra-scholar` | `en-GB-LibbyNeural (+0Hz, +0%)` | His perimeter wards feed on fear and breath. Step through the gaps between the stones and cut Kaelen down before the chant peaks. | His perimeter wards feed on fear and breath. Step through the gaps between the stones and cut Saelen down before the chant peaks. |
| `mt_m19_hexer_capture_briefing` | `Narrator` | `en-GB-RyanNeural (+0Hz, -3%)` | Twelve black megaliths ring a fetid willow hollow where Hexer Kaelen boils marrow-rot curses that wither our wounded twenty miles away. Breathe through wet cloth, smash the perimeter censers, and cut Kaelen down at the center. | Twelve black megaliths ring a fetid willow hollow where Hexer Saelen boils marrow-rot curses that wither our wounded twenty miles away. Breathe through wet cloth, smash the perimeter censers, and cut Saelen down at the center. |

---

## Metadata-Only Change (No Re-Recording Needed)

| Clip ID | Change | Note |
| :--- | :--- | :--- |
| `map__ashen_tier__msg_1` | Speaker changed `Marshal Kaelen` → `Marshal Vance` | Spoken text is unchanged (*"Three ascents lead up from the mid-terrace to the Ashen Plateau. Break the pass guards before assaulting the summit."*), and both speakers map to the same TTS voice profile (`en-US-ChristopherNeural (-4Hz, -2%)`). |

> **Note:** `m35` radio/story dialogue, `m19` milestones/victory epilogue, and `cutscene-scripts.json` lines edited in this pass are currently outside `tools/generate-all-voices.py`'s `collect_clips()` scope (un-voiced), and `High Arcanist Vaelen` (`lore__high_arcanist_vaelen_1..3`) remains canonical and unchanged.
