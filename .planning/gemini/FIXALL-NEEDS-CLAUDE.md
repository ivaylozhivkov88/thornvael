# Forbidden-File Patches (`FIXALL-NEEDS-CLAUDE.md`)

Per `GEMINI-COMBINED.md`, `src/sim/path.ts`, `tests/movement.test.ts`, `src/doll.ts`, `src/main.ts`, `src/townui.ts`, `public/itemicons/`, `public/townart/doll/`, and `.planning/gemini/doll-queue-state.json` are untouched by `gemini/fix-all`.
Ready-to-apply patches for those files are collected below.

## 1. `src/main.ts` — Region Audio & Atmosphere Crossfade (Task 3)
- **Function / Call Site:** Main game loop / tick where `heroTileX`, `heroTileY`, and `currentMapDoc.regions` are updated.
- **Exact Patch:**
  ```ts
  import { regionAtTile, updateAtmosphere } from './atmosphere';
  import { resolveRegionAudio, computeAudioCrossfade } from './region-audio';

  const activeRegion = regionAtTile(currentMapDoc?.regions, heroTileX, heroTileY);
  const { music, ambience } = resolveRegionAudio(activeRegion, defaultMusic, defaultAmbience);
  // Crossfade music/ambience buses when track changes using computeAudioCrossfade(prevTrack, music, progress01)
  // Pass `activeRegion` as 10th arg to `updateAtmosphere(..., activeRegion)` for smooth light/weather border crossfade.
  ```

## 2. `src/main.ts` & `src/townui.ts` — Stepped Quest Adapter Wiring (Task 4)
- **Where:** `src/main.ts` (kill/loot/escort hooks + save/load) and `src/townui.ts` (NPC talk & dialogue choice hooks).
- **Exact Patch:**
  ```ts
  import { SteppedQuestAdapter } from './sidequests-adapter';
  // On campaign start/load: const questAdapter = new SteppedQuestAdapter(act1QuestDefs, save.steppedQuests);
  // On enemy kill in main.ts: questAdapter.onKillFamily(family, 1);
  // On item pickup in main.ts: questAdapter.onCollectItem(itemName, 1);
  // On NPC talk in townui.ts: questAdapter.onTalkNpc(npcId);
  // On choice click in townui.ts: questAdapter.onDialogueChoice(npcId, choiceIndex);
  // On save: save.steppedQuests = questAdapter.save();
  ```
