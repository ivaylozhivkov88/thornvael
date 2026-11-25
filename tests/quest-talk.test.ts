import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/map';
import type { SteppedQuestDef } from '../src/sidequests';
import { SteppedQuestAdapter } from '../src/sidequests-adapter';
import { Sim } from '../src/sim/sim';

const all = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'public', 'data', 'content', 'side-quests.json'), 'utf8'),
) as SteppedQuestDef[];
const defs = all.filter((q) => q.steps?.length);
const GARRICK = 'npc-garrick-captain';

describe('quests are taken and turned in by talking', () => {
  it('nothing is taken before a conversation, even if foes die', () => {
    const a = new SteppedQuestAdapter(all); // the game passes the whole file
    expect(a.takenQuests()).toEqual([]);
    expect(a.npcMark(GARRICK)).toBe('!');
    expect(a.onFoeKilled('briar-hound')).toEqual([]);
    expect(a.onFamilyCleared('briar-hound')).toEqual([]);
  });

  it('take, hunt, recover, choose and get paid once', () => {
    const a = new SteppedQuestAdapter(defs);
    const taken = a.talk(GARRICK)!;
    expect(taken.rewards).toEqual([]);
    expect(a.takenQuests()).toHaveLength(1);
    expect(a.npcMark(GARRICK)).toBeNull();
    for (let i = 0; i < 12; i++) a.onFoeKilled('briar-hound');
    a.onFoeKilled('briar-hound'); // recovers the strongbox
    expect(a.npcMark(GARRICK)).toBe('?');
    const ask = a.talk(GARRICK)!;
    expect(ask.options).toHaveLength(2);
    const done = a.choose(ask.questId, GARRICK, 0)!;
    expect(done.rewards).toEqual([expect.objectContaining({ gold: 250, xp: 300 })]);
    expect(a.takenQuests()[0].completed).toBe(true);
    expect(a.talk(GARRICK)!.questId).toBe('sq03-broken-picket'); // the next one, offered separately
  });

  it('a quest taken after its foes died does not get stuck', () => {
    const a = new SteppedQuestAdapter(defs);
    a.talk('npc-fenwick-ferryman');
    a.onFamilyCleared('flintback');
    expect(a.npcMark('npc-fenwick-ferryman')).toBe('?');
    expect(a.talk('npc-fenwick-ferryman')!.rewards.length).toBeGreaterThan(0);
  });

  it('the first act world holds each giver and enough foes for every quest', () => {
    const world = JSON.parse(readFileSync(resolve(__dirname, '..', 'src', 'worlds', 'act1-world.map.json'), 'utf8'));
    const text = JSON.stringify(world);
    for (const q of defs) {
      expect(text).toContain(`"${q.giver}"`);
      for (const s of q.steps) {
        if (s.trigger.type !== 'kill_count') continue;
        const found = text.split(`"${s.trigger.ref}"`).length - 1;
        expect(found, q.id).toBeGreaterThan(s.count ?? 1);
      }
    }
  });
});

describe('quest reward command', () => {
  it('pays gold deterministically and survives snapshot/restore', () => {
    const mk = (): Sim => new Sim(generateMap(7), 5, [0, 0]);
    const a = mk();
    const b = mk();
    const before = a.cb.gold[0];
    for (const s of [a, b]) s.step([{ type: 'reward', gold: 250, xp: 300 }]);
    expect(a.cb.gold[0]).toBe(before + 250);
    expect(b.hash()).toBe(a.hash());
    const c = mk();
    c.restore(a.snapshot());
    expect(c.hash()).toBe(a.hash());
  });
});
