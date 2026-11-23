import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface DialogueChoice {
  label: string;
  next: string;
  requires_flag?: string;
  sets_flag?: string;
  requires_quest?: string;
  quest_state?: string;
}

interface DialogueNode {
  id: string;
  npc: string;
  node: string;
  requires_reputation?: 'low' | 'neutral' | 'high';
  quest_id?: string;
  quest_state?: 'before' | 'during' | 'after';
  text: string;
  choices: DialogueChoice[];
}

interface TownBark {
  town: string;
  npc?: string;
  kind: string;
  line: string;
}

const CONTENT_DIR = resolve(__dirname, '..', 'public', 'data', 'content');

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(CONTENT_DIR, name), 'utf8')) as T;
}

describe('Act 1 NPC Branching Dialogues & Idle Barks', () => {
  const npcs = loadJson<{ id: string; name: string; town: string }[]>('npcs.json');
  const act1Npcs = npcs.filter((n) => n.town === 'town-thornwick');
  const dialogues = loadJson<DialogueNode[]>('npc-dialogues.json');
  const barks = loadJson<TownBark[]>('town-barks.json');
  const dialogueIds = new Set(dialogues.map((d) => d.id));

  it('covers all 8 Thornwick town, tavern, and shop NPCs', () => {
    expect(act1Npcs.length).toBeGreaterThanOrEqual(8);
  });

  it('gives every Act 1 NPC reputation greetings (low, neutral, high) with 2-4 topic options', () => {
    for (const npc of act1Npcs) {
      const npcDlgs = dialogues.filter((d) => d.npc === npc.id);
      for (const tier of ['greeting_low', 'greeting_neutral', 'greeting_high'] as const) {
        const g = npcDlgs.find((d) => d.node === tier);
        expect(g, `${npc.id} missing ${tier}`).toBeDefined();
        const topicChoices = g!.choices.filter((c) => c.next !== 'end' && !c.requires_quest);
        expect(topicChoices.length, `${npc.id}.${tier} topic count`).toBeGreaterThanOrEqual(2);
        expect(topicChoices.length, `${npc.id}.${tier} topic count`).toBeLessThanOrEqual(4);
      }
    }
  });

  it('gives every Act 1 NPC quest-aware lines (before, during, after) and valid next links', () => {
    for (const npc of act1Npcs) {
      const npcDlgs = dialogues.filter((d) => d.npc === npc.id);
      for (const state of ['quest_before', 'quest_during', 'quest_after'] as const) {
        const qn = npcDlgs.find((d) => d.node === state);
        expect(qn, `${npc.id} missing ${state}`).toBeDefined();
        expect(qn!.text.trim().length).toBeGreaterThan(20);
      }
      for (const d of npcDlgs) {
        for (const c of d.choices) {
          if (c.next !== 'end') {
            expect(dialogueIds.has(c.next), `${npc.id}:${d.id} broken next=${c.next}`).toBe(true);
          }
        }
      }
    }
  });

  it('gives every Act 1 NPC at least 3 idle barks in town-barks.json', () => {
    for (const npc of act1Npcs) {
      const npcBarks = barks.filter((b) => b.npc === npc.id && b.town === 'town-thornwick');
      expect(npcBarks.length, `${npc.id} idle bark count`).toBeGreaterThanOrEqual(3);
    }
  });
});
