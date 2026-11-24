# Master Forbidden-File Patches (`MASTER-NEEDS-CLAUDE.md`)

Ready-to-apply patches for `src/main.ts` and `src/townui.ts` (never edited directly by `gemini/fix-all` or `gemini/item-images`).

## 1. `src/main.ts` — Region Audio & Atmosphere Crossfade (A3)
```ts
import { regionAtTile, updateAtmosphere } from './atmosphere';
import { resolveRegionAudio, computeAudioCrossfade } from './region-audio';

const activeRegion = regionAtTile(currentMapDoc?.regions, heroTileX, heroTileY);
const { music, ambience } = resolveRegionAudio(activeRegion, defaultMusic, defaultAmbience);
// Crossfade music/ambience buses via computeAudioCrossfade(prevTrack, music, progress01)
// Pass `activeRegion` as 10th arg to `updateAtmosphere(..., activeRegion)`.
```

## 2. `src/main.ts` & `src/townui.ts` — Stepped Quest Adapter (A4)
```ts
import { SteppedQuestAdapter } from './sidequests-adapter';
// On campaign start/load: const questAdapter = new SteppedQuestAdapter(act1QuestDefs, save.steppedQuests);
// On enemy kill (main.ts): questAdapter.onKillFamily(family, 1);
// On item pickup (main.ts): questAdapter.onCollectItem(itemName, 1);
// On NPC talk (townui.ts): questAdapter.onTalkNpc(npcId);
// On choice click (townui.ts): questAdapter.onDialogueChoice(npcId, choiceIndex);
// On save: save.steppedQuests = questAdapter.save();
```

## 3. `src/townui.ts` & `src/main.ts` — `dialogueFor`, `tutorial.json` & `content-extras.ts` (A5, A9)
```ts
import { dialogueFor } from './dialogue';
const dlg = dialogueFor(npcId, { nodes: npcDialogues, barks: townBarks, reputation: townRep, questId, questState, seed: tick });
// Render dlg.greeting.text, dlg.questNode?.text, dlg.idleBark?.line

// In src/main.ts: load src/data/tutorial.json and show step.popup when step.trigger matches game state.
// Optional extra packs: import { loadExtraContent } from './content-extras';
```
