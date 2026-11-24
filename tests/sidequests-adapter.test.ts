import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type SteppedQuestDef } from '../src/sidequests';
import { SteppedQuestAdapter } from '../src/sidequests-adapter';

const CONTENT_DIR = resolve(__dirname, '..', 'public', 'data', 'content');

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(CONTENT_DIR, name), 'utf8')) as T;
}

function isAct1Quest(q: SteppedQuestDef): boolean {
  return (
    q.act === 1 ||
    q.town === 'town-thornwick' ||
    Boolean(q.unlocks_after && /^m(0[1-9]|10|11)\b/.test(q.unlocks_after)) ||
    /^sq-m(0[1-9]|10|11)\b/.test(q.id)
  );
}

describe('SteppedQuestAdapter (Task 4)', () => {
  const files = ['side-quests.json', 'side-quests-2.json', 'side-quests-3.json', 'side-quests-4.json'];
  const act1Quests = files.flatMap((f) => loadJson<SteppedQuestDef[]>(f)).filter(isAct1Quest);

  it('drives all 22 Act 1 quests to completion via adapter dispatchers', () => {
    expect(act1Quests).toHaveLength(22);

    for (const q of act1Quests) {
      const adapter = new SteppedQuestAdapter([q]);
      const stepById = new Map(q.steps.map((s) => [s.id, s]));
      let guard = 0;

      while (!adapter.isCompleted(q.id) && guard < 20) {
        guard++;
        const curId = adapter.getState().quests[q.id].currentStepId!;
        const step = stepById.get(curId)!;
        const cnt = step.count ?? 1;

        switch (step.trigger.type) {
          case 'talk_npc':
            adapter.onTalkNpc(step.trigger.ref);
            break;
          case 'collect_item':
            adapter.onCollectItem(step.trigger.ref, cnt);
            break;
          case 'kill_count':
            adapter.onKillFamily(step.trigger.ref, cnt);
            break;
          case 'escort_safe':
            adapter.onEscortSafe(step.trigger.ref);
            break;
          case 'dialogue_choice':
            adapter.onDialogueChoice(step.trigger.ref, 0);
            break;
        }
      }

      expect(adapter.isCompleted(q.id)).toBe(true);
      expect(adapter.getJournal(q.id).length).toBeGreaterThanOrEqual(3);
    }
  });
});
