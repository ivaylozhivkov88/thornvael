# Map format (version 2)

A mission is one JSON file: `*.map.json`. Open it in the editor at `editor.html` (desktop), save it, drop it in `src/missions/` and register it in `src/mission.ts`.

| Field | Meaning |
|-------|---------|
| `format`, `version` | `"thornvael-map"` and `2`. Version 1 files (raw arrays, `strings`, `runOnce`) are migrated on load. A newer version is refused with a clear message. |
| `w`, `h` | 16 to 128 tiles per side. |
| `terrain`, `height` | Run-length arrays `[value, count, ...]` in reading order. Terrain: 0 grass, 1 dirt, 2 water, 3 rock, 4 marsh. Height 0 to 3. Blocked tiles are derived: water, rock, trees (1 tile) and buildings (2 by 2). |
| `objects` | `{kind, x, y}`; kind 0 tree, 1 building (`owner`, `hp` optional). Buildings are numbered in order for scripts. |
| `units` | `{kind, team, x, y, group?, pack?, dormant?, vip?}`. Unit 0 must be the hero (team 0). `group` is a script group id, `pack` makes monsters guard and hunt together, `dormant` starts phased out. At most 300. |
| `regions` | Named rectangles for the author's reference (the editor copies tiles from them). |
| `triggers` | `{id, once, enabled, conds[], acts[]}`: up to 3 comparisons that must all hold, up to 4 actions. A comparison is `{a, op, b}` with `a` and `b` checks and `op` an index into `= ≠ > < ≥ ≤`. Checks and actions are `{k, a}`: registry key and arguments in the order of the registry parameters (`src/sim/script.ts`). |
| `text` | Mission text by key: `title`, `body`, `obj.N`, `msg.N`, `msg.N.who`, `win`, `fail.N`. |

## Script registry

`CHECKS` (27) and `ACTIONS` (49) in `src/sim/script.ts` drive both the engine and the editor forms. Positions are tiles. Actions recorded but not yet acting: player formation, give everything, tile and unit spell duration, music node. Checks with no data yet: spell effect on a tile.

The script runs every fifth tick and is part of the simulation state: snapshots keep variables, fired triggers, repopper timers and the message log, so a restored game continues exactly.
