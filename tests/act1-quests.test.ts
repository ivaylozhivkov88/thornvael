import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface QuestStepTrigger {
  type: string;
  ref: string;
  requires_step?: string;
  sets_flag?: string;
}

interface QuestStep {
  id: string;
  kind: 'talk' | 'fetch' | 'kill' | 'escort' | 'choice';
  target: string;
  count?: number;
  trigger: QuestStepTrigger;
  journal: string;
  next: string | string[] | null;
  reward?: { gold?: number; xp?: number; item?: string | null; flag?: string };
}

interface SideQuest {
  id: string;
  act?: number;
  town?: string;
  giver: string;
  title: string;
  unlocks_after?: string;
  mission?: string;
  steps?: QuestStep[];
}

const CONTENT_DIR = resolve(__dirname, '..', 'public', 'data', 'content');

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(CONTENT_DIR, name), 'utf8')) as T;
}

function isAct1Quest(q: SideQuest): boolean {
  return (
    q.act === 1 ||
    q.town === 'town-thornwick' ||
    Boolean(q.unlocks_after && /^m(0[1-9]|10|11)\b/.test(q.unlocks_after)) ||
    /^sq-m(0[1-9]|10|11)\b/.test(q.id)
  );
}

describe('Act 1 Quest Steps & Completability', () => {
  const questFiles = ['side-quests.json', 'side-quests-2.json', 'side-quests-3.json', 'side-quests-4.json'];
  const allQuests = questFiles.flatMap((f) => loadJson<SideQuest[]>(f));
  const act1Quests = allQuests.filter(isAct1Quest);

  const townNpcs = loadJson<{ id: string; town: string }[]>('npcs.json');
  const fieldNpcs = loadJson<{ id: string; act: number }[]>('field-npcs.json');
  const act1NpcIds = new Set([
    ...townNpcs.filter((n) => n.town === 'town-thornwick').map((n) => n.id),
    ...fieldNpcs.filter((n) => n.act === 1).map((n) => n.id),
  ]);

  it('covers all 22 Act 1 quests with 3-6 steps each', () => {
    expect(act1Quests.length).toBe(22);
    for (const q of act1Quests) {
      expect(Array.isArray(q.steps), `${q.id} missing steps[]`).toBe(true);
      expect(q.steps!.length, `${q.id} steps length`).toBeGreaterThanOrEqual(3);
      expect(q.steps!.length, `${q.id} steps length`).toBeLessThanOrEqual(6);
    }
  });

  it('uses all 5 canonical step kinds across Act 1 quests', () => {
    const kinds = new Set<string>();
    for (const q of act1Quests) {
      for (const s of q.steps ?? []) {
        kinds.add(s.kind);
      }
    }
    expect(kinds).toEqual(new Set(['talk', 'fetch', 'kill', 'escort', 'choice']));
  });

  it('ensures every Act 1 quest is completable with no dead steps, no cycles, and terminal rewards', () => {
    for (const q of act1Quests) {
      const steps = q.steps!;
      const byId = new Map(steps.map((s) => [s.id, s]));
      expect(byId.size, `${q.id} duplicate step IDs`).toBe(steps.length);

      const visited = new Set<string>();
      const queue: string[] = [steps[0].id];
      let terminalCount = 0;

      while (queue.length > 0) {
        const curId = queue.shift()!;
        expect(visited.has(curId), `${q.id} cycle at ${curId}`).toBe(false);
        visited.add(curId);

        const step = byId.get(curId);
        expect(step, `${q.id} missing step ${curId}`).toBeDefined();
        expect(step!.journal.trim().length, `${q.id}.${curId} empty journal`).toBeGreaterThan(10);
        expect(step!.trigger.type.length, `${q.id}.${curId} missing trigger.type`).toBeGreaterThan(0);
        expect(step!.trigger.ref.length, `${q.id}.${curId} missing trigger.ref`).toBeGreaterThan(0);

        if (step!.next === null) {
          terminalCount++;
          expect(step!.reward, `${q.id}.${curId} terminal step missing reward`).toBeDefined();
        } else if (Array.isArray(step!.next)) {
          expect(step!.next.length).toBeGreaterThanOrEqual(2);
          for (const n of step!.next) {
            expect(byId.has(n), `${q.id}.${curId} invalid next ${n}`).toBe(true);
            queue.push(n);
          }
        } else {
          expect(byId.has(step!.next), `${q.id}.${curId} invalid next ${step!.next}`).toBe(true);
          queue.push(step!.next);
        }
      }

      expect(visited.size, `${q.id} has unreachable/dead steps`).toBe(steps.length);
      expect(terminalCount, `${q.id} has no terminal step`).toBeGreaterThanOrEqual(1);
    }
  });

  it('ensures every Act 1 quest giver and talk/escort NPC is reachable in Act 1', () => {
    for (const q of act1Quests) {
      expect(act1NpcIds.has(q.giver), `${q.id} unreachable giver ${q.giver}`).toBe(true);
      for (const s of q.steps!) {
        if (s.kind === 'talk' || s.kind === 'escort' || s.kind === 'choice') {
          expect(act1NpcIds.has(s.target), `${q.id}.${s.id} unreachable NPC ${s.target}`).toBe(true);
        }
      }
    }
  });
});
