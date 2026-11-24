import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SteppedQuestAdapter } from '../src/sidequests-adapter';
import type { SteppedQuestDef } from '../src/sidequests';

describe('H1 onCollectItem quest progression', () => {
  it('advances Act 1 collect_item step when Weighted Tariff Strongbox is collected', () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '..', 'public', 'data', 'content', 'side-quests.json'), 'utf8'),
    ) as SteppedQuestDef[];
    const defs = raw.filter((d) => Array.isArray(d.steps));
    const adapter = new SteppedQuestAdapter(defs);
    const q = defs.find((d) =>
      d.steps?.some((s) => s.trigger.type === 'collect_item' && s.trigger.ref === 'Weighted Tariff Strongbox'),
    );
    expect(q).toBeDefined();
    // Advance prerequisite talk step first
    for (const s of q!.steps ?? []) {
      if (s.trigger.type === 'talk_npc') adapter.onTalkNpc(s.trigger.ref);
      if (s.trigger.type === 'kill_count') adapter.onKillFamily(s.trigger.ref, (s as { count?: number }).count ?? 1);
    }
    const res = adapter.onCollectItem('Weighted Tariff Strongbox', 1);
    expect(res.length).toBeGreaterThan(0);
  });
});
