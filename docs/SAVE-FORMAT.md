# Save format (version 4)

Saves live in IndexedDB (database `thornvael`, store `saves`, key = slot id; `auto` is the autosave). An exported save is the same envelope as a JSON file.

| Field | Meaning |
|-------|---------|
| `format`, `saveVersion` | `"thornvael-save"` and `4`. Versions 1–3 migrate on load (v1 lacked teams/towns, v3 added optional carryover). A newer version is refused with a clear message. |
| `gameVersion` | The game version that wrote it, for the slot list and error messages. |
| `createdAt` | Milliseconds since 1970. |
| `name`, `label` | Slot name and a line with mission, hero class and play time. |
| `state.doc` | The whole map document (see MAP-FORMAT.md), so a save does not depend on the maps a later version ships. |
| `state.seed` | The sim seed the mission was built with. |
| `state.snap` | The sim snapshot: every unit array, combat state, hero, script state, teams, towns (stock, quest offers, active quests). |
| `state.ai` | Monster pack state: `[hunting, calm]` per pack. |
| `state.ui` | Camera `[x, y, zoom]`, control groups, quick slots and the selection. |
| `state.node` | Campaign node at capture; absent for standalone missions. This field alone does not prove campaign identity. |
| `state.campaign` | Independent `CampaignRecord` snapshot (`v: 1`): hero pick, difficulty, unlocked/completed nodes, current map position, town visits, carryover hero/mercenaries/gold/quick slots and last result. Present for new campaign saves. |
| `state.carry` | Legacy optional carryover. Retained when migrating, but never used to infer campaign identity. |

In an exported file typed arrays are written as `{ "$t": "Int32Array", "b": "<base64 of the bytes>" }`.

## Rules

- Loading rebuilds the mission from `state.doc` and `state.seed`, then restores the snapshot. The game then plays on exactly as it would have (tests check the same state hash 400 ticks later).
- Autosave: every 60 seconds of play, and when the page is hidden or closed. On start the game offers "Continue" when an autosave exists. `?load=<slot id>` loads a slot.
- The first save asks the browser for persistent storage.
- On iPhone, Safari and the home-screen app keep separate storage. The Saves sheet says so; move a game with Export in one and Import in the other.
- A migration is added for every new `saveVersion`; old saves must keep loading.

## Campaign restore and legacy saves

Loading a new campaign slot explicitly restores its own campaign snapshot to the standalone `campaign` record. Loading A after starting a new B therefore resumes A's progress and uses A's difficulty, unlocks and town visits for later results. The saved simulation supplies the current in-mission hero; carryover is applied only when entering the next node. Loading a slot also ignores any conflicting `campaign` URL parameter.

Version 1–3 saves have no verifiable campaign identity, even when they have `node` or `carry`. They still resume their saved mission and simulation, with a notice that campaign progression is unavailable. Victory, defeat and town exit cannot change the device's campaign record. They cannot recover missing map progress; their next save remains standalone. No identity is invented from the current device record or from a bundle's standalone campaign record.

## All-saves backup (bundle version 2)

Export All Saves produces `{ "thornvaelBundle": 2, "saves": [{ "id": "...", "text": "<encoded save>" }], "campaign": <CampaignRecord or null> }`. The standalone campaign is separate from each slot's historical snapshot and is exported even when there are no mission slots. Read failures or damaged records fail the export instead of silently producing a partial backup.

Import from the main menu's Saves screen or the in-mission Saves sheet. The entire file is decoded and validated before writing; slots and campaign are written in one IndexedDB transaction. Every slot receives a new id (including imported autosaves and reserved source keys), so existing slots/autosave cannot be overwritten. A non-null standalone campaign explicitly replaces the device's map progress; `null` leaves existing progress alone. Loading an imported mission slot later activates that slot's historical snapshot, as usual.

Version 1 bundles (`thornvaelBundle: 1`, `saves` only) and single-save files remain importable. They do not replace or synthesize a standalone campaign. Unknown bundle/campaign versions are rejected. Older game versions cannot read v4 saves/v2 bundles; update the receiving game before transferring them.
