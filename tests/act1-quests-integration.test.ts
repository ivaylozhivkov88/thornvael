import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SteppedQuestAdapter } from '../src/sidequests-adapter';
import type { SteppedQuestDef } from '../src/sidequests';
import { SAVE_VERSION, migrateSave, type SaveFile } from '../src/save';

interface RawQuest extends SteppedQuestDef {
  act?: number;
  town?: string;
  unlocks_after?: string;
}

function isAct1Quest(q: RawQuest): boolean {
  return (
    q.act === 1 ||
    q.town === 'town-thornwick' ||
    Boolean(q.unlocks_after && /^m(0[1-9]|10|11)\b/.test(q.unlocks_after)) ||
    /^sq-m(0[1-9]|10|11)\b/.test(q.id)
  );
}

describe('Act 1 SteppedQuestAdapter integration', () => {
  it('drives all 22 Act 1 quests to completion through adapter hooks and survives save migration', () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '..', 'public', 'data', 'content', 'side-quests.json'), 'utf8'),
    ) as RawQuest[];
    const act1 = raw.filter(isAct1Quest);
    expect(act1.length).toBeGreaterThanOrEqual(6);

    const adapter = new SteppedQuestAdapter(act1);
    for (const q of act1) {
      for (const step of q.steps ?? []) {
        const t = step.trigger.type;
        const ref = step.trigger.ref;
        if (t === 'talk_npc') {
          adapter.onTalkNpc(ref);
        } else if (t === 'collect_item') {
          adapter.onCollectItem(ref, step.count ?? 1);
        } else if (t === 'kill_count') {
          adapter.onKillFamily(ref, step.count ?? 1);
        } else if (t === 'escort_safe') {
          adapter.onEscortSafe(ref);
        } else if (t === 'dialogue_choice') {
          adapter.onDialogueChoice(ref, 0);
        }
      }
      expect(adapter.isCompleted(q.id)).toBe(true);
    }

    const saved = adapter.save();
    const restored = new SteppedQuestAdapter(act1, saved);
    for (const q of act1) {
      expect(restored.isCompleted(q.id)).toBe(true);
    }

    const fakeSave: SaveFile = {
      format: 'thornvael-save',
      saveVersion: 5,
      gameVersion: 'test',
      createdAt: Date.now(),
      name: 'test',
      label: 'test',
      state: {
        doc: {} as SaveFile['state']['doc'],
        seed: 1,
        snap: {} as SaveFile['state']['snap'],
        ai: [],
        ui: { cam: [0, 0, 1], groups: [], slots: [], selected: [] },
        steppedQuests: saved,
      },
    };
    const migrated = migrateSave(fakeSave);
    expect(migrated.saveVersion).toBe(SAVE_VERSION);
    expect(migrated.state.steppedQuests).toEqual(saved);
  });
});
