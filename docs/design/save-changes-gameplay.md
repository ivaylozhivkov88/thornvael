# Persistent Save Field Proposals (Gameplay Depth)

> Note: Owned by Gameplay-AI as a proposal for `src/savedb.ts` / `src/characters.ts` integration (not modifying `src/savedb.ts` directly).

## Proposed `Character` / Save Fields (`saveVersion` bump when wired)

1. `difficultyTier?: 'wanderer' | 'veteran' | 'doomed'` (default `'wanderer'`)
   - Tracks the hero's unlocked/selected difficulty tier (`E10`).
2. `hardcore?: boolean` (default `false`)
   - Marks ironman heroes (`E11`).
3. `hardcoreFallen?: boolean` (default `false`)
   - Set to `true` when a hardcore hero dies (`hp <= 0`), locking further play and displaying a fallen tombstone on the roster.
4. `unlockedWaypoints?: string[]` (default `[]`)
   - List of waypoint IDs discovered across the 4 campaign maps (`E12`).
5. `companionOrder?: 'follow' | 'hold' | 'attack'` (default `'follow'`)
   - Persists the player's preferred mercenary stance (`E7`).
6. `clearedSideDungeons?: number[]` (default `[]`)
   - Deterministic seeds/IDs of completed side crypts (`E5`).
