import { describe, expect, it } from 'vitest';
import { loadDoc } from '../src/mapdoc';
import { BUILT_IN, createMission } from '../src/mission';
import { createHero } from '../src/sim/hero';
import { ITEMS } from '../src/sim/items';
import { FP, Sim, replay } from '../src/sim/sim';
import { MAX_QUESTS, QUEST_TYPES, QuestType, Role, makeQuest, priceOf, sellPrice, spellPrice, trainPrice, type TownCommand } from '../src/sim/town';

function game(seed = 1, cls = 0) {
  const g = createMission(loadDoc(BUILT_IN.market), seed);
  createHero(g.sim, 0, cls, false, 1);
  return g;
}
const put = (sim: Sim, u: number, x: number, y: number): void => {
  sim.x[u] = sim.tx[u] = Math.round((x + 0.5) * FP);
  sim.y[u] = sim.ty[u] = Math.round((y + 0.5) * FP);
};
const at = (sim: Sim, role: number): void => {
  const [x, y] = sim.towns[0].door[role]!;
  put(sim, 0, x, y);
};
const cmd = (op: TownCommand['op'], v?: number, list?: number[]): TownCommand => ({ type: 'town', op, town: 0, v, list });
const steps = (sim: Sim, n: number): void => {
  for (let t = 0; t < n; t++) sim.step();
};

describe('towns', () => {
  it('the market map loads with a town, three buildings and doors on free ground', () => {
    const { sim } = game();
    expect(sim.towns.length).toBe(1);
    for (let r = 0; r < 3; r++) {
      const [x, y] = sim.towns[0].door[r]!;
      expect(sim.map.blocked[y * sim.map.w + x]).toBe(0);
    }
    steps(sim, 2);
    expect(sim.cb.gold[0]).toBe(300); // the briefing trigger hands out a purse
  });

  it('a building can only be entered from close by, and trading needs to be inside', () => {
    const { sim } = game();
    steps(sim, 2);
    put(sim, 0, 40, 30);
    sim.now(cmd('enter', Role.Shop));
    expect(sim.town.inside).toBe(-1);
    sim.now(cmd('buy', undefined, [0]));
    expect(sim.cb.gold[0]).toBe(300);
    at(sim, Role.Shop);
    sim.now(cmd('enter', Role.Shop));
    expect(sim.town.inside).toBe(Role.Shop);
  });

  it('the shop rolls stock on every entry, buys and sells at half price', () => {
    const { sim } = game();
    steps(sim, 2);
    at(sim, Role.Shop);
    sim.now(cmd('enter', Role.Shop));
    const shelf = sim.town.stock[0].slice();
    expect(ITEMS[shelf[0]].name).toBe('Healing Draught');
    expect(shelf.filter((v) => v >= 0).length).toBeGreaterThanOrEqual(8);
    const before = sim.hero!.inv.find((s) => s.item === shelf[0])?.n ?? 0;
    sim.now(cmd('buy', undefined, [0, 1]));
    expect(sim.cb.gold[0]).toBe(300 - priceOf(shelf[0]) - priceOf(shelf[1]));
    expect(sim.town.stock[0][0]).toBe(-1);
    expect(sim.hero!.inv.find((s) => s.item === shelf[0])!.n).toBe(before + 1);
    const g0 = sim.cb.gold[0];
    sim.now(cmd('sell', undefined, [shelf[0]]));
    expect(sim.cb.gold[0]).toBe(g0 + sellPrice(shelf[0]));
    // Too dear: nothing changes.
    sim.cb.gold[0] = 0;
    const left = sim.town.stock[0].findIndex((v) => v >= 0);
    sim.now(cmd('buy', undefined, [left]));
    expect(sim.town.stock[0][left]).toBeGreaterThanOrEqual(0);
    sim.now(cmd('leave'));
    sim.now(cmd('enter', Role.Shop));
    expect(sim.town.stock[0][0]).toBeGreaterThanOrEqual(0); // restocked
  });

  it('a hired mercenary appears at the tavern door and takes orders', () => {
    const { sim } = game();
    steps(sim, 2);
    const merc = sim.towns[0].def.mercs![0];
    expect(sim.hidden[merc.unit]).toBe(1);
    at(sim, Role.Tavern);
    sim.now(cmd('enter', Role.Tavern));
    sim.now(cmd('hire', 0));
    expect(sim.hidden[merc.unit]).toBe(0);
    expect(sim.cb.gold[0]).toBe(300 - merc.price);
    sim.now(cmd('hire', 0)); // already hired: no second charge
    expect(sim.cb.gold[0]).toBe(300 - merc.price);
    sim.now(cmd('leave'));
    const [dx, dy] = sim.towns[0].door[Role.Tavern]!;
    sim.step([{ type: 'move', ids: [merc.unit], x: dx + 4.5, y: dy + 2.5 }]);
    steps(sim, 60);
    expect(Math.abs(sim.x[merc.unit] / FP - (dx + 4.5))).toBeLessThan(1);
  });

  it('the school teaches spells and trains skills for gold', () => {
    const { sim } = game(1, 1);
    steps(sim, 2);
    sim.cb.gold[0] = 2000;
    at(sim, Role.School);
    sim.now(cmd('enter', Role.School));
    expect((sim.hero!.known >>> 9) & 1).toBe(0);
    sim.now(cmd('learn', 9));
    expect((sim.hero!.known >>> 9) & 1).toBe(1);
    expect(sim.cb.gold[0]).toBe(2000 - spellPrice(9));
    expect((sim.cb.known[0] >>> 9) & 1).toBe(1);
    sim.now(cmd('learn', 23)); // not taught here
    expect((sim.hero!.known >>> 23) & 1).toBe(0);
    const g0 = sim.cb.gold[0];
    sim.now(cmd('train', 0));
    expect(sim.hero!.skill[0]).toBe(1);
    expect(sim.cb.gold[0]).toBe(g0 - trainPrice(0));
  });

  it('every one of the 13 quest types can be offered on the market map', () => {
    const { sim } = game();
    steps(sim, 2);
    for (let t = 0; t < QUEST_TYPES; t++) expect(makeQuest(sim, 0, t), `type ${t}`).not.toBeNull();
  });

  it('every quest type is paid when fulfilled', () => {
    for (let type = 0; type < QUEST_TYPES; type++) {
      const { sim } = game(3 + type);
      steps(sim, 2);
      const q = makeQuest(sim, 0, type)!;
      at(sim, Role.Tavern);
      sim.now(cmd('enter', Role.Tavern));
      sim.town.offers[0] = [q];
      sim.now(cmd('accept', 0));
      expect(sim.town.quests.length, `type ${type}`).toBe(1);
      const g0 = sim.cb.gold[0];
      const kill = (u: number): void => {
        sim.cb.hp[u] = 0;
      };
      const foes = [...Array(sim.count).keys()].filter((u) => sim.team[u] !== 0 && sim.cb.hp[u] > 0);
      let extra = 0;
      switch (type) {
        case QuestType.Slay:
          kill(q.a);
          break;
        case QuestType.Cull:
          foes.filter((u) => sim.cb.kind[u] === q.a).slice(0, q.b).forEach(kill);
          break;
        case QuestType.Clear:
          q.ids.forEach(kill);
          break;
        case QuestType.Hunt:
        case QuestType.Timed:
          foes.slice(0, q.a).forEach(kill);
          break;
        case QuestType.Scout:
        case QuestType.Deliver:
          put(sim, 0, q.pts[0], q.pts[1]);
          break;
        case QuestType.Wealth:
          sim.cb.gold[0] += q.a;
          extra = q.a;
          break;
        case QuestType.Gather:
          for (let k = 0; k < q.a; k++) sim.hero!.inv[0].n++;
          break;
        case QuestType.Practice:
          sim.hero!.skill[q.a]++;
          break;
      }
      if (type === QuestType.Patrol) {
        for (let k = 0; k < 3; k++) {
          put(sim, 0, q.pts[k * 2], q.pts[k * 2 + 1]);
          steps(sim, 25);
        }
      } else if (type === QuestType.Guard) {
        put(sim, 0, q.pts[0], q.pts[1]);
        for (let k = 0; k < 32 && sim.town.quests.length; k++) {
          put(sim, 0, q.pts[0], q.pts[1]);
          sim.cb.hp[0] = sim.cb.hpMax[0]; // monsters may roam there; this test is about the timer
          steps(sim, 25);
        }
      } else if (type === QuestType.Fetch) {
        sim.hero!.inv.push({ item: q.a, n: 1 });
        sim.now(cmd('leave'));
        at(sim, Role.Tavern);
        sim.now(cmd('enter', Role.Tavern));
      } else steps(sim, 26);
      expect(sim.town.quests.length, `type ${type} paid`).toBe(0);
      expect(sim.cb.gold[0] - extra - g0, `type ${type} reward`).toBeGreaterThanOrEqual(q.reward);
    }
  });

  it('a timed hunt fails when time runs out, and only three quests fit', () => {
    const { sim } = game();
    steps(sim, 2);
    at(sim, Role.Tavern);
    sim.now(cmd('enter', Role.Tavern));
    sim.town.offers[0] = [makeQuest(sim, 0, QuestType.Timed)!];
    sim.now(cmd('accept', 0));
    steps(sim, 90 * 25 + 30);
    expect(sim.town.quests.length).toBe(0);
    sim.town.offers[0] = [0, 1, 2, 3].map(() => makeQuest(sim, 0, QuestType.Wealth)!);
    for (let k = 0; k < 4; k++) sim.now(cmd('accept', 0));
    expect(sim.town.quests.length).toBe(MAX_QUESTS);
  });

  it('a replay of a game with town commands ends on the same hash', () => {
    const { sim } = game(9);
    steps(sim, 2);
    at(sim, Role.Shop);
    steps(sim, 3);
    sim.now(cmd('enter', Role.Shop));
    sim.now(cmd('buy', undefined, [0, 2, 3]));
    sim.now(cmd('leave'));
    steps(sim, 5);
    sim.step([{ type: 'move', ids: [0], x: 10, y: 12 }]);
    steps(sim, 80);
    const fresh = game(9).sim;
    replay(fresh, sim.log.filter((l) => l.tick <= 2), 2);
    at(fresh, Role.Shop); // the same teleport the live game had (a teleport is not a command)
    replay2(fresh, sim);
    expect(fresh.hash()).toBe(sim.hash());
    expect(fresh.cb.gold[0]).toBe(sim.cb.gold[0]);
    expect(fresh.hero!.inv).toEqual(sim.hero!.inv);
  });
});

/** Replay the rest of `src`'s log onto `dst` up to src.tick, starting after dst.tick. */
function replay2(dst: Sim, src: Sim): void {
  let k = src.log.findIndex((l) => l.tick > dst.tick);
  if (k < 0) k = src.log.length;
  while (dst.tick < src.tick) {
    const t = dst.tick + 1;
    const cmds = [];
    while (k < src.log.length && src.log[k].tick === t) cmds.push(src.log[k++].cmd);
    dst.step(cmds);
  }
}
