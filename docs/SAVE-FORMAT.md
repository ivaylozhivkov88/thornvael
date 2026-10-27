# Save format (version 2)

Saves live in IndexedDB (database `thornvael`, store `saves`, key = slot id; `auto` is the autosave). An exported save is the same envelope as a JSON file.

| Field | Meaning |
|-------|---------|
| `format`, `saveVersion` | `"thornvael-save"` and `2`. Version 1 saves (sim snapshots without `team` and `town`) are migrated on load. A newer version is refused with a clear message. |
| `gameVersion` | The game version that wrote it, for the slot list and error messages. |
| `createdAt` | Milliseconds since 1970. |
| `name`, `label` | Slot name and a line with mission, hero class and play time. |
| `state.doc` | The whole map document (see MAP-FORMAT.md), so a save does not depend on the maps a later version ships. |
| `state.seed` | The sim seed the mission was built with. |
| `state.snap` | The sim snapshot: every unit array, combat state, hero, script state, teams, towns (stock, quest offers, active quests). |
| `state.ai` | Monster pack state: `[hunting, calm]` per pack. |
| `state.ui` | Camera `[x, y, zoom]`, control groups, quick slots and the selection. |

In an exported file typed arrays are written as `{ "$t": "Int32Array", "b": "<base64 of the bytes>" }`.

## Rules

- Loading rebuilds the mission from `state.doc` and `state.seed`, then restores the snapshot. The game then plays on exactly as it would have (tests check the same state hash 400 ticks later).
- Autosave: every 60 seconds of play, and when the page is hidden or closed. On start the game offers "Continue" when an autosave exists. `?load=<slot id>` loads a slot.
- The first save asks the browser for persistent storage.
- On iPhone, Safari and the home-screen app keep separate storage. The Saves sheet says so; move a game with Export in one and Import in the other.
- A migration is added for every new `saveVersion`; old saves must keep loading.
