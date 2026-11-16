import { describe, expect, it } from 'vitest';
import { loadDoc, type MapDoc } from '../src/mapdoc';
import { BUILT_IN, createMission } from '../src/mission';
import { decodeSave, encodeSave, makeSave, resumeSave } from '../src/save';
import { MonsterAi, type MonsterAiExtra } from '../src/sim/bot';
import { createHero } from '../src/sim/hero';

const extra: MonsterAiExtra = { res: [[4, 500], [9, 812]], raised: [[4, [12, 15]]], windup: [[20, 5]] };

describe('monster AI timers in saves', () => {
  it('round-trips resurrect cooldowns, raised minions and boss windups', () => {
    const ai = new MonsterAi([]);
    ai.restoreExtra(structuredClone(extra));
    expect(ai.snapshotExtra()).toEqual(extra);
    expect(JSON.parse(JSON.stringify(ai.snapshotExtra()))).toEqual(extra);
  });

  it('older saves without the block start with empty timers', () => {
    const ai = new MonsterAi([]);
    ai.restoreExtra(extra);
    ai.restoreExtra(undefined);
    expect(ai.snapshotExtra()).toEqual({ res: [], raised: [], windup: [] });
  });

  it('a save file carries the timers back into the resumed game', () => {
    const g = createMission(loadDoc(BUILT_IN.ford), 5);
    createHero(g.sim, 0, 1, true, 2);
    g.ai.restoreExtra(extra);
    const file = makeSave('Test', 'label', { doc: BUILT_IN.ford as MapDoc, seed: 5, snap: g.sim.snapshot(), ai: g.ai.snapshot(), aix: g.ai.snapshotExtra(), ui: { cam: [0, 0, 1], groups: [], slots: [], selected: [] } }, 1);
    const back = resumeSave(decodeSave(encodeSave(file)));
    expect(back.ai.snapshotExtra()).toEqual(extra);
  });
});
