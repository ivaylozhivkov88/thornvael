import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dialogueFor,
  mulberry32,
  pickGreetingNode,
  pickIdleBark,
  pickQuestNode,
  reputationTier,
  type DialogueNode,
  type TownBark,
} from '../src/dialogue';

const CONTENT_DIR = resolve(__dirname, '..', 'public', 'data', 'content');

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(CONTENT_DIR, name), 'utf8')) as T;
}

describe('Dialogue Runtime Helpers', () => {
  const npcs = loadJson<{ id: string; town: string }[]>('npcs.json');
  const act1Npcs = npcs.filter((n) => n.town === 'town-thornwick');
  const dialogues = loadJson<DialogueNode[]>('npc-dialogues.json');
  const barks = loadJson<TownBark[]>('town-barks.json');

  it('maps reputation values to low, neutral, and high tiers', () => {
    expect(reputationTier(-25)).toBe('low');
    expect(reputationTier(-1)).toBe('low');
    expect(reputationTier(0)).toBe('neutral');
    expect(reputationTier(49)).toBe('neutral');
    expect(reputationTier(50)).toBe('high');
    expect(reputationTier(100)).toBe('high');
  });

  it('picks reputation-appropriate greetings for all 8 Act 1 NPCs', () => {
    expect(act1Npcs.length).toBeGreaterThanOrEqual(8);
    for (const npc of act1Npcs) {
      const low = pickGreetingNode(dialogues, npc.id, -10);
      const neutral = pickGreetingNode(dialogues, npc.id, 10);
      const high = pickGreetingNode(dialogues, npc.id, 75);

      expect(low).not.toBeNull();
      expect(neutral).not.toBeNull();
      expect(high).not.toBeNull();

      expect(low!.node).toBe('greeting_low');
      expect(neutral!.node).toBe('greeting_neutral');
      expect(high!.node).toBe('greeting_high');
    }
    expect(pickGreetingNode(dialogues, 'npc-does-not-exist', 0)).toBeNull();
  });

  it('picks quest_before, quest_during, and quest_after nodes for all 8 Act 1 NPCs', () => {
    for (const npc of act1Npcs) {
      const before = pickQuestNode(dialogues, npc.id, null, 'before');
      const during = pickQuestNode(dialogues, npc.id, null, 'during');
      const after = pickQuestNode(dialogues, npc.id, null, 'after');

      expect(before).not.toBeNull();
      expect(during).not.toBeNull();
      expect(after).not.toBeNull();

      expect(before!.node).toBe('quest_before');
      expect(during!.node).toBe('quest_during');
      expect(after!.node).toBe('quest_after');
    }
    expect(pickQuestNode(dialogues, 'npc-does-not-exist', null, 'before')).toBeNull();
  });

  it('picks deterministic idle barks using mulberry32 across all 8 Act 1 NPCs', () => {
    const rngA = mulberry32(12345);
    const rngB = mulberry32(12345);
    expect(rngA()).toBe(rngB());
    expect(rngA()).toBe(rngB());

    for (const npc of act1Npcs) {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 50; seed++) {
        const b1 = pickIdleBark(barks, npc.id, seed);
        const b2 = pickIdleBark(barks, npc.id, seed);
        expect(b1).not.toBeNull();
        expect(b1).toEqual(b2);
        seen.add(b1!.line);
      }
      // Every Act 1 NPC has 3 idle barks; 50 seeds should hit all 3
      expect(seen.size).toBe(3);
    }

    // Town fallback when no npc-specific bark exists
    const townBark = pickIdleBark(barks, 'town-thornwick', 7);
    expect(townBark).not.toBeNull();
    expect(pickIdleBark(barks, 'npc-unknown', 7)).toBeNull();
  });

  it('resolves complete dialogue bundle via dialogueFor(npcId, state)', () => {
    const npcId = act1Npcs[0].id;
    const bundle = dialogueFor(npcId, {
      nodes: dialogues,
      barks,
      reputation: 60,
      questState: 'during',
      seed: 42,
    });
    expect(bundle.tier).toBe('high');
    expect(bundle.greeting?.node).toBe('greeting_high');
    expect(bundle.questNode?.node).toBe('quest_during');
    expect(bundle.idleBark).not.toBeNull();
  });
});
