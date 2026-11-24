import { describe, expect, it } from 'vitest';
import { SteppedQuestAdapter } from '../src/sidequests-adapter';
import type { SteppedQuestDef } from '../src/sidequests';

describe('H2 onDialogueChoice', () => {
  it('advances dialogue_choice step when onDialogueChoice is called', () => {
    const defs: SteppedQuestDef[] = [
      {
        id: 'sq-choice-test',
        giver: 'tavern',
        title: 'Choice Test',
        steps: [
          {
            id: 'step-1',
            kind: 'choice',
            target: 'tavern',
            trigger: { type: 'dialogue_choice', ref: 'tavern' },
            journal: 'Made a choice.',
            next: null,
          },
        ],
      },
    ];
    const adapter = new SteppedQuestAdapter(defs);
    const res = adapter.onDialogueChoice('tavern', 0);
    expect(res.length).toBe(1);
    expect(adapter.isCompleted('sq-choice-test')).toBe(true);
  });
});
