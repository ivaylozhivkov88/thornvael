import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  advanceQuestStep,
  createQuestRuntimeState,
  deserializeQuestSave,
  getQuestJournalText,
  migrateQuestSave,
  serializeQuestSave,
  type SteppedQuestDef,
  type SteppedQuestSaveV1,
} from '../src/sidequests';

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

const questFiles = ['side-quests.json', 'side-quests-2.json', 'side-quests-3.json', 'side-quests-4.json'];
const allQuests = questFiles.flatMap((f) => loadJson<SteppedQuestDef[]>(f));
const act1Quests = allQuests.filter(isAct1Quest);

describe('Stepped Side-Quest Runtime (Act 1)', () => {
  it('loads all 22 Act 1 stepped quests', () => {
    expect(act1Quests).toHaveLength(22);
    for (const q of act1Quests) {
      expect(Array.isArray(q.steps)).toBe(true);
      expect(q.steps.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('simulates every Act 1 quest start-to-finish headlessly and grants rewards strictly once', () => {
    for (const q of act1Quests) {
      // Test branch 0 (and branch 1 if any choice step exists)
      const hasChoice = q.steps.some((s) => Array.isArray(s.next));
      const branches = hasChoice ? [0, 1] : [0];

      for (const choiceIdx of branches) {
        const state = createQuestRuntimeState([q]);
        const stepById = new Map(q.steps.map((s) => [s.id, s]));
        let guard = 0;

        while (!state.quests[q.id].completed && guard < 20) {
          guard++;
          const curId = state.quests[q.id].currentStepId;
          expect(curId).not.toBeNull();
          const step = stepById.get(curId!)!;
          expect(step).toBeDefined();

          // Wrong trigger ref must not advance
          const wrongRes = advanceQuestStep(state, q.id, {
            type: step.trigger.type,
            ref: '__wrong_ref__',
          });
          expect(wrongRes.advanced).toBe(false);

          // If count > 1, partial progress should not complete the step yet
          const reqCount = step.count ?? 1;
          if (reqCount > 1) {
            const partial = advanceQuestStep(state, q.id, {
              type: step.trigger.type,
              ref: step.trigger.ref,
              count: 1,
            });
            expect(partial.advanced).toBe(false);
            const remaining = reqCount - 1;
            const res = advanceQuestStep(state, q.id, {
              type: step.trigger.type,
              ref: step.trigger.ref,
              count: remaining,
              choiceIndex: choiceIdx,
            });
            expect(res.advanced).toBe(true);
          } else {
            const res = advanceQuestStep(state, q.id, {
              type: step.trigger.type,
              ref: step.trigger.ref,
              choiceIndex: choiceIdx,
            });
            expect(res.advanced).toBe(true);
          }

          if (step.trigger.sets_flag) {
            expect(state.flags[step.trigger.sets_flag]).toBe(true);
          }
          if (step.reward?.flag) {
            expect(state.flags[step.reward.flag]).toBe(true);
          }
        }

        expect(state.quests[q.id].completed).toBe(true);
        expect(state.quests[q.id].currentStepId).toBeNull();

        const journal = getQuestJournalText(state, q.id);
        expect(journal.length).toBeGreaterThanOrEqual(3);

        // Re-triggering after completion must not double-grant rewards
        const goldBefore = state.totalGold;
        const xpBefore = state.totalXp;
        const itemsBefore = state.items.length;
        const lastStep = q.steps[q.steps.length - 1];
        const replay = advanceQuestStep(state, q.id, {
          type: lastStep.trigger.type,
          ref: lastStep.trigger.ref,
        });
        expect(replay.advanced).toBe(false);
        expect(replay.grantedReward).toBeNull();
        expect(state.totalGold).toBe(goldBefore);
        expect(state.totalXp).toBe(xpBefore);
        expect(state.items.length).toBe(itemsBefore);
      }
    }
  });

  it('supports mid-quest serializeQuestSave / deserializeQuestSave without losing or duplicating progress', () => {
    const q = act1Quests.find((item) => item.id === 'sq01-tollhouse-audit')!;
    expect(q).toBeDefined();

    const state1 = createQuestRuntimeState(act1Quests);
    // Advance step-1 (talk_npc)
    const r1 = advanceQuestStep(state1, q.id, { type: 'talk_npc', ref: 'npc-garrick-captain' });
    expect(r1.advanced).toBe(true);
    // Partial progress on step-2 (kill_count 5 of 12)
    const r2a = advanceQuestStep(state1, q.id, { type: 'kill_count', ref: 'briar-hound', count: 5 });
    expect(r2a.advanced).toBe(false);

    const saved = serializeQuestSave(state1);
    expect(saved.version).toBe(2);
    expect(saved.quests[q.id].currentStepId).toBe('step-2');
    expect(saved.quests[q.id].stepCounts['step-2']).toBe(5);

    const jsonRoundtrip = JSON.parse(JSON.stringify(saved));
    const state2 = deserializeQuestSave(jsonRoundtrip, act1Quests);
    expect(state2.quests[q.id].currentStepId).toBe('step-2');
    expect(state2.quests[q.id].stepCounts['step-2']).toBe(5);
    expect(getQuestJournalText(state2, q.id)).toHaveLength(2);

    // Remaining 7 kills complete step-2
    const r2b = advanceQuestStep(state2, q.id, { type: 'kill_count', ref: 'briar-hound', count: 7 });
    expect(r2b.advanced).toBe(true);
    expect(state2.quests[q.id].currentStepId).toBe('step-3');

    // Step-3 collect_item
    const r3 = advanceQuestStep(state2, q.id, { type: 'collect_item', ref: 'Weighted Tariff Strongbox' });
    expect(r3.advanced).toBe(true);
    expect(state2.quests[q.id].currentStepId).toBe('step-4');

    // Step-4 dialogue_choice (branch 1 -> step-5b)
    const r4 = advanceQuestStep(state2, q.id, {
      type: 'dialogue_choice',
      ref: 'npc-garrick-captain',
      choiceIndex: 1,
    });
    expect(r4.advanced).toBe(true);
    expect(state2.quests[q.id].currentStepId).toBe('step-5b');

    // Complete step-5b
    const step5b = q.steps.find((s) => s.id === 'step-5b')!;
    const r5 = advanceQuestStep(state2, q.id, {
      type: step5b.trigger.type,
      ref: step5b.trigger.ref,
    });
    expect(r5.advanced).toBe(true);
    expect(r5.completedQuest).toBe(true);
    expect(state2.quests[q.id].claimedRewards).toEqual(['step-5b']);
  });

  it('migrates legacy v1 quest saves to v2', () => {
    const firstId = act1Quests[0].id;
    const secondId = act1Quests[1].id;
    const v1: SteppedQuestSaveV1 = {
      version: 1,
      activeSteps: {
        [firstId]: 'step-3',
      },
      completedQuests: [secondId],
      flags: { 'thornwick-trusted': true },
    };

    const migrated = migrateQuestSave(v1);
    expect(migrated.version).toBe(2);
    expect(migrated.quests[firstId].currentStepId).toBe('step-3');
    expect(migrated.quests[firstId].completed).toBe(false);
    expect(migrated.quests[secondId].completed).toBe(true);
    expect(migrated.quests[secondId].currentStepId).toBeNull();
    expect(migrated.flags['thornwick-trusted']).toBe(true);

    const restored = deserializeQuestSave(v1, act1Quests);
    expect(restored.quests[firstId].currentStepId).toBe('step-3');
    expect(restored.quests[secondId].completed).toBe(true);
  });
});
