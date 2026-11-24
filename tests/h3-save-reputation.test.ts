import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, migrateSave, type SaveFile } from '../src/save';
import { dialogueFor, type DialogueNode } from '../src/dialogue';

describe('H3 save v7 reputation & real dialogueFor data', () => {
  it('migrates v6 save to SAVE_VERSION 7 with default reputation 0', () => {
    const v6: SaveFile = {
      format: 'thornvael-save',
      saveVersion: 6,
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
      },
    };
    const migrated = migrateSave(v6);
    expect(migrated.saveVersion).toBe(SAVE_VERSION);
    expect(migrated.state.reputation).toBe(0);
  });

  it('queries dialogueFor with real dialogues.json nodes', () => {
    const nodes = JSON.parse(
      readFileSync(resolve(__dirname, '..', 'public', 'data', 'content', 'npc-dialogues.json'), 'utf8'),
    ) as DialogueNode[];
    expect(nodes.length).toBeGreaterThan(0);
    const res = dialogueFor('tavern', { reputation: 50, nodes, barks: [] });
    expect(res.tier).toBeDefined();
  });
});
