import { describe, expect, it } from 'vitest';
import { Kind, Ord } from '../src/sim/combat';
import { FP, Sim } from '../src/sim/sim';
import { MonsterAi } from '../src/sim/bot';

function testMap() {
  const w = 40, h = 40;
  return {
    w,
    h,
    terrain: new Uint8Array(w * h),
    height: new Uint8Array(w * h),
    blocked: new Uint8Array(w * h),
    objects: [],
    light: new Uint8Array(w * h),
  };
}

describe('Tactical Monster AI (Milestone 2)', () => {
  it('frontline swarmers push forward with swarm orders', () => {
    const map = testMap();
    const sim = new Sim(map, 10, [0, 1, 1, 1], {
      kinds: [Kind.Hero, Kind.Gnoll, Kind.Gnoll, Kind.Gnoll],
      combat: true,
    });
    sim.place(0, 10, 10);
    sim.place(1, 14, 10);
    sim.place(2, 15, 11);
    sim.place(3, 14, 12);

    const ai = new MonsterAi([{ ids: [1, 2, 3], x: 14.5, y: 11, hunting: true, calm: 0 }]);
    sim.cb.tgt[1] = 0; // engage hero

    // Tick % 10 === 3 is thinking tick
    sim.tick = 3;
    const cmds = ai.commands(sim);
    expect(cmds.length).toBeGreaterThan(0);
    const swarmCmd = cmds.find((c) => c.type === 'order' && c.order === 'swarm');
    expect(swarmCmd).toBeDefined();
    expect(swarmCmd!.type === 'order' && swarmCmd!.ids).toEqual([1, 2, 3]);
  });

  it('backline Shaman kites when enemies get too close and casts curses from range', () => {
    const map = testMap();
    const sim = new Sim(map, 10, [0, 1], {
      kinds: [Kind.Hero, Kind.Mage], // Kind.Mage serves as Shaman/caster
      combat: true,
    });
    sim.place(0, 10, 10);
    sim.place(1, 12, 10); // dist = 2 tiles (too close! < 3.0)

    const ai = new MonsterAi([{ ids: [1], x: 14, y: 10, hunting: true, calm: 0 }]);
    sim.cb.tgt[1] = 0;

    sim.tick = 3;
    const cmds = ai.commands(sim);
    const retreatCmd = cmds.find((c) => c.type === 'order' && c.order === 'retreat');
    expect(retreatCmd).toBeDefined();

    // Now place shaman at comfortable casting distance (5 tiles away)
    sim.place(1, 15, 10);
    sim.tick = 13;
    const rangeCmds = ai.commands(sim);
    const castCmd = rangeCmds.find((c) => c.type === 'order' && c.order === 'cast');
    expect(castCmd).toBeDefined();
  });

  it('balances corpse resurrection: casts resurrect with 15s cooldown and max 2 active minions', () => {
    const map = testMap();
    // 0 = Hero, 1 = Shaman, 2 = Fallen Gnoll (corpse), 3 = Fallen Gnoll 2, 4 = Fallen Gnoll 3
    const sim = new Sim(map, 10, [0, 1, 1, 1, 1], {
      kinds: [Kind.Hero, Kind.Mage, Kind.Gnoll, Kind.Gnoll, Kind.Gnoll],
      combat: true,
    });
    sim.place(0, 10, 10);
    sim.place(1, 18, 10);
    sim.place(2, 17, 10);
    sim.place(3, 17, 11);
    sim.place(4, 17, 12);

    // Kill units 2, 3, 4 to leave fresh corpses
    sim.cb.hp[2] = 0; sim.cb.corp[2] = 1000;
    sim.cb.hp[3] = 0; sim.cb.corp[3] = 1000;
    sim.cb.hp[4] = 0; sim.cb.corp[4] = 1000;

    const ai = new MonsterAi([{ ids: [1], x: 18, y: 10, hunting: true, calm: 0 }]);
    sim.cb.tgt[1] = 0;

    sim.tick = 3;
    const cmds1 = ai.commands(sim);
    const res1 = cmds1.find((c) => c.type === 'order' && c.order === 'cast' && c.spell === 24);
    expect(res1).toBeDefined();

    // Execute the cast order in sim
    sim.step(cmds1);

    // On next thinking tick (tick 13), Shaman is on 15s cooldown (375 ticks)
    sim.tick = 13;
    const cmds2 = ai.commands(sim);
    const res2 = cmds2.find((c) => c.type === 'order' && c.order === 'cast' && c.spell === 24);
    // Cooldown prevents infinite resurrection spam!
    expect(res2).toBeUndefined();

    // Fast forward past cooldown: 375 ticks later
    sim.tick = 378 + 5;
    const cmds3 = ai.commands(sim);
    const res3 = cmds3.find((c) => c.type === 'order' && c.order === 'cast' && c.spell === 24);
    expect(res3).toBeDefined(); // second resurrection succeeds
  });

  it('boss initiates heavy windup telegraphed attack when in melee range', () => {
    const map = testMap();
    const sim = new Sim(map, 10, [0, 1], {
      kinds: [Kind.Hero, Kind.Gnoll],
      bossMods: [[], ['extra_fast', 'stone_skin', 'fire_enchanted']],
      combat: true,
      hpMul: 5,
    });
    sim.place(0, 10, 10);
    sim.place(1, 11, 10); // in close melee range (1 tile)

    const ai = new MonsterAi([{ ids: [1], x: 11, y: 10, hunting: true, calm: 0 }]);
    sim.cb.tgt[1] = 0;

    sim.tick = 3; // tick % 100 < 10
    const cmds = ai.commands(sim);
    // Boss starts windup: telegraphs with hold
    const holdCmd = cmds.find((c) => c.type === 'order' && c.order === 'hold');
    expect(holdCmd).toBeDefined();
  });
});
