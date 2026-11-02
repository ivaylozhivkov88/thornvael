import { describe, expect, it } from 'vitest';
import { townSeed } from '../src/campaign';
import { loadDoc } from '../src/mapdoc';
import { BUILT_IN, createMission, type MissionGame } from '../src/mission';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { FP, replay, type Command } from '../src/sim/sim';

const SEED = townSeed(1, 0); // main.ts uses this seed for a fresh campaign's first mission
const LIMIT = 15_000;
const route = [[19, 34], [26, 24], [31, 23], [39, 23], [50, 20]] as const;

function start(cls: number): MissionGame {
  const g = createMission(loadDoc(BUILT_IN.ford), SEED);
  createHero(g.sim, 0, cls, false, 1); // exactly the production medium hero setup
  return g;
}

const distance = (g: MissionGame, id: number, x: number, y: number): number => Math.hypot(g.sim.x[id] / FP - x, g.sim.y[id] / FP - y);
function alive(g: MissionGame, team: number): number[] {
  return Array.from({ length: g.sim.count }, (_, id) => id).filter((id) => g.sim.team[id] === team && !g.sim.hidden[id] && g.sim.cb.hp[id] > 0);
}

function probe(cls: number) {
  const g = start(cls);
  const { sim } = g;
  let waypoint = 0;
  let issued = -1;
  const checkpoints: unknown[] = [];
  const messages: { tick: number; message: number }[] = [];
  const initial = { hp: sim.cb.hp[0], mana: sim.cb.mana[0] };
  let snapshot: ReturnType<typeof sim.snapshot> | null = null;
  let minHeroHp = sim.cb.hp[0];
  let seenMessages = 0;
  while (sim.tick < LIMIT && sim.script!.st.status === 0) {
    const player: Command[] = [];
    const friends = alive(g, 0);
    if (sim.tick === 0) {
      player.push({ type: 'autocast', ids: [0], spell: cls === 1 ? 0 : 7 });
      player.push({ type: 'autocast', ids: friends.filter((id) => sim.cb.kind[id] === Kind.Mage), spell: 0 });
    }
    if (sim.tick % 25 === 0) {
      const [x, y] = route[waypoint];
      const closeEnemies = alive(g, 1).some((id) => {
        const cell = Math.floor(sim.y[id] / FP) * sim.map.w + Math.floor(sim.x[id] / FP);
        return sim.visible[cell] && distance(g, id, sim.x[0] / FP, sim.y[0] / FP) < 10;
      });
      if (waypoint < route.length - 1 && distance(g, 0, x, y) < 3 && !closeEnemies) waypoint++;
      if (issued !== waypoint) {
        const [gx, gy] = route[waypoint];
        player.push({ type: 'order', order: 'attack', ids: friends, x: gx, y: gy });
        issued = waypoint;
      }
    }
    sim.step([...g.ai.commands(sim), ...player]);
    if (sim.tick === 300) snapshot = sim.snapshot();
    minHeroHp = Math.min(minHeroHp, sim.cb.hp[0]);
    const msgs = sim.script!.st.msgs;
    while (seenMessages < msgs.length) {
      messages.push({ tick: msgs[seenMessages], message: msgs[seenMessages + 1] });
      seenMessages += 2;
    }
    if (sim.tick % 1000 === 0) checkpoints.push({ tick: sim.tick, waypoint, hero: [sim.x[0] / FP, sim.y[0] / FP], hp: sim.cb.hp[0], mana: sim.cb.mana[0], friends: alive(g, 0).length, enemies: alive(g, 1).length });
  }
  const summary = {
    cls: cls === 0 ? 'warrior' : 'mage', seed: SEED, ticks: sim.tick, status: sim.script!.st.status,
    cause: sim.script!.st.cause, waypoint, objectives: [...sim.script!.st.sub], friends: alive(g, 0).length, enemies: alive(g, 1).length,
    initial, heroHp: sim.cb.hp[0], minHeroHp, heroMana: sim.cb.mana[0], chiefHp: sim.cb.hp[12],
    commands: sim.log, messages, logEntries: sim.log.length, hash: sim.hash(), checkpoints,
    units: sim.script!.st.status === 1 ? undefined : Array.from({ length: sim.count }, (_, id) => ({ id, hp: sim.cb.hp[id], hidden: sim.hidden[id], xy: [sim.x[id] / FP, sim.y[id] / FP], moving: sim.moving[id], order: sim.cb.ord[id], target: sim.cb.tgt[id] })),
  };
  return { g, summary, snapshot };
}

describe('first mission command-only playability probe', () => {
  for (const cls of [0, 1]) {
    it(`medium ${cls === 0 ? 'warrior' : 'mage'} traverses the ford and defeats the chief with normal commands`, () => {
      const { g, summary, snapshot } = probe(cls);
      console.info('FORD_PROBE', JSON.stringify(summary));
      expect(summary.status, JSON.stringify(summary)).toBe(1);
      expect(summary.objectives.slice(0, 2)).toEqual([2, 2]);
      expect(summary.heroHp).toBeGreaterThan(0);
      expect(summary.commands.every(({ cmd }) => cmd.type === 'order' || cmd.type === 'autocast')).toBe(true);
      const again = start(cls);
      replay(again.sim, g.sim.log, g.sim.tick);
      expect(again.sim.hash()).toBe(g.sim.hash());
      expect(snapshot).not.toBeNull();
      const restored = start(cls);
      restored.sim.restore(snapshot!);
      // Replay the remaining player + AI log; the mission script regenerates its own commands.
      const remaining = g.sim.log.filter((entry) => entry.tick > restored.sim.tick);
      let cursor = 0;
      while (restored.sim.tick < g.sim.tick) {
        const cmds: Command[] = [];
        while (cursor < remaining.length && remaining[cursor].tick === restored.sim.tick + 1) cmds.push(remaining[cursor++].cmd);
        restored.sim.step(cmds);
      }
      expect(restored.sim.hash()).toBe(g.sim.hash());
    });
  }
});
