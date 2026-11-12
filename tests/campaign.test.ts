import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { actOf, completeNode, isOpen, newProgress, parseCampaign, townSeed, visitTown } from '../src/campaign';
import { applyCarryover, extractCarryover } from '../src/carryover';
import { afterMission, newRecord } from '../src/flow';
import type { GameMap } from '../src/map';
import { decodeSave, encodeSave, makeSave, migrateSave, SAVE_VERSION } from '../src/save';
import { Kind, enemyNear } from '../src/sim/combat';
import { RULES, mercPrice, rulesOf } from '../src/sim/difficulty';
import { createHero } from '../src/sim/hero';
import { itemId } from '../src/sim/items';
import { FP, Sim } from '../src/sim/sim';

const campaign = parseCampaign(JSON.parse(readFileSync(new URL('../public/data/campaign.json', import.meta.url), 'utf8')));

function field(w: number, h: number): GameMap {
  return { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects: [], light: new Uint8Array(w * h).fill(200) };
}

/** Hero, two reserved hidden mercenary slots (a footman and an archer kind), one foe. */
function world(diff: number, mercKinds: number[] = [Kind.Hero]): Sim {
  const kinds = [Kind.Hero, ...mercKinds.slice(1), Kind.Hero];
  const teams = [0, ...mercKinds.slice(1).map(() => 0), 1];
  const sim = new Sim(field(30, 30), 7, teams, { kinds, combat: true });
  sim.place(0, 5, 5);
  for (let j = 1; j < kinds.length - 1; j++) {
    sim.place(j, 6, 5);
    sim.hidden[j] = 1;
  }
  sim.place(kinds.length - 1, 20, 20);
  createHero(sim, 0, 0, false, diff);
  return sim;
}

describe('campaign data', () => {
  it('has the starter chapter 1 nodes plus all 46 campaign missions and 4 regional towns across 4 acts', () => {
    expect(campaign.nodes.slice(0, 5).map((n) => n.id)).toEqual(['m01-blood-at-the-ford', 'town-thornwick', 'm02-whispers-in-the-fen', 'm03-nightfall-at-ravenwatch', 'm04-the-sunken-sanctum']);
    expect(campaign.nodes.length).toBe(50);
    const missions = campaign.nodes.filter((n) => n.kind === 'mission');
    const towns = campaign.nodes.filter((n) => n.kind === 'town');
    expect(missions.length).toBe(46);
    expect(towns.map((t) => t.id)).toEqual(['town-thornwick', 'town-redmarsh', 'town-oakhaven', 'town-ironcamp']);
    expect(towns.slice(1).map((t) => t.tiers)).toEqual([
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
    expect(campaign.nodes.find((n) => n.id === 'm11-ashbrook-retreat')?.unlocksOnVictory).toContain('town-redmarsh');
    expect(campaign.nodes.find((n) => n.id === 'm23-fork-of-spears')?.unlocksOnVictory).toContain('town-oakhaven');
    expect(campaign.nodes.find((n) => n.id === 'm35-burning-harbor')?.unlocksOnVictory).toContain('town-ironcamp');
    expect(new Set(missions.map((n) => n.act ?? 1))).toEqual(new Set([1, 2, 3, 4]));
    expect(campaign.nodes.find((n) => n.id === 'm44-threshold-choice')?.unlocksOnVictory).toEqual(['m45-crown-of-order', 'm46-ember-reckoning']);
    expect(() => parseCampaign({ ...campaign, start: 'nope' })).toThrow();
  });

  it('unlocks nodes along the chain and counts town visits', () => {
    let p = newProgress(campaign, 1);
    expect(isOpen(p, 'm02-whispers-in-the-fen')).toBe(false);
    p = completeNode(campaign, p, 'm01-blood-at-the-ford');
    expect(isOpen(p, 'town-thornwick') && isOpen(p, 'm02-whispers-in-the-fen')).toBe(true);
    expect(() => completeNode(campaign, p, 'm04-the-sunken-sanctum')).toThrow();
    p = completeNode(campaign, completeNode(campaign, p, 'm02-whispers-in-the-fen'), 'm03-nightfall-at-ravenwatch');
    p = completeNode(campaign, p, 'm04-the-sunken-sanctum');
    expect(p.completed.length).toBe(4);
    expect(visitTown(p, 'town-thornwick').townVisits).toBe(1);
  });

  it('gives each town visit its own stock seed, the same every time', () => {
    expect(townSeed(5, 0)).toBe(townSeed(5, 0));
    expect(townSeed(5, 0)).not.toBe(townSeed(5, 1));
  });

  it('keeps nodes in every act separated so buttons never overlap', () => {
    for (const act of [1, 2, 3, 4] as const) {
      const nodes = campaign.nodes.filter((n) => actOf(n) === act);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = Math.abs(nodes[i].pos[0] - nodes[j].pos[0]);
          const dy = Math.abs(nodes[i].pos[1] - nodes[j].pos[1]);
          expect(dx < 22 && dy < 26, `${nodes[i].id} vs ${nodes[j].id} in act ${act}`).toBe(false);
        }
      }
    }
  });

  it('unlocks mutually exclusive branches on m44-threshold-choice based on branch parameter', () => {
    const base = {
      ...newProgress(campaign, 1),
      unlocked: ['m01-blood-at-the-ford', 'm44-threshold-choice'],
      node: 'm44-threshold-choice',
    };
    const b1 = completeNode(campaign, base, 'm44-threshold-choice', 1);
    expect(isOpen(b1, 'm45-crown-of-order')).toBe(true);
    expect(isOpen(b1, 'm46-ember-reckoning')).toBe(false);

    const b2 = completeNode(campaign, base, 'm44-threshold-choice', 2);
    expect(isOpen(b2, 'm45-crown-of-order')).toBe(false);
    expect(isOpen(b2, 'm46-ember-reckoning')).toBe(true);

    const rec = { ...newRecord(campaign, { cls: 0, female: false }, 1), progress: base };
    const afterB1 = afterMission(campaign, rec, 'm44-threshold-choice', true, null, { text: '', up: 1, size: 1, gold: 10, branch: 1 });
    expect(afterB1.progress.unlocked).toContain('m45-crown-of-order');
    expect(afterB1.progress.unlocked).not.toContain('m46-ember-reckoning');
  });
});

describe('carryover', () => {
  it('round-trips hero, gold and only living mercenaries', () => {
    const a = world(1, [Kind.Hero, Kind.Hero, Kind.Hero]);
    a.hero!.skill[0] = 3;
    a.hero!.eq[0] = itemId('Rusty Sword');
    a.cb.gold[0] = 321;
    a.hidden[1] = 0;
    a.hidden[2] = 0;
    a.cb.hp[1] = Math.floor(a.cb.hpMax[1] / 2);
    a.cb.hp[2] = 0; // dead
    const co = extractCarryover(a, newProgress(campaign, 1), 99);
    expect(co.mercs.length).toBe(1);
    expect(co.mercs[0].hpPct).toBeLessThanOrEqual(50);
    const json = JSON.parse(JSON.stringify(co));

    const b = world(1, [Kind.Hero, Kind.Hero, Kind.Hero]);
    expect(applyCarryover(b, json)).toBe(1);
    expect(b.hero!.skill[0]).toBe(3);
    expect(b.cb.gold[0]).toBe(321);
    expect(b.hidden[1]).toBe(0);
    expect(b.hidden[2]).toBe(1); // the second slot stays hidden
    expect(b.cb.hp[1]).toBeLessThan(b.cb.hpMax[1]);
  });

  it('is deterministic: the same carryover gives the same state hash', () => {
    const co = extractCarryover(world(1), newProgress(campaign, 1), 1);
    const a = world(1);
    const b = world(1);
    applyCarryover(a, co);
    applyCarryover(b, co);
    for (let i = 0; i < 50; i++) {
      a.step([]);
      b.step([]);
    }
    expect(a.hash()).toBe(b.hash());
  });

  it('rides in a save file and survives migration from version 2', () => {
    const sim = world(2);
    const co = extractCarryover(sim, newProgress(campaign, 2), 4);
    const save = makeSave('slot', 'x', { doc: {} as never, seed: 1, snap: sim.snapshot(), ai: [], ui: { cam: [0, 0, 1], groups: [], slots: [], selected: [] }, carry: co });
    const back = decodeSave(encodeSave(save));
    expect(back.state.carry?.progress.difficulty).toBe(2);
    const old = JSON.parse(JSON.stringify({ ...back, saveVersion: 2 }));
    old.state.snap = back.state.snap;
    expect(migrateSave(old).saveVersion).toBe(SAVE_VERSION);
  });
});

describe('difficulty rules', () => {
  it('uses corpse lifetimes of 90, 60 and 30 seconds at 25 ticks per second', () => {
    expect(RULES.map((r) => r.corpse / 25)).toEqual([90, 60, 30]);
    expect(rulesOf(world(0)).corpse).toBe(2250);
    expect(rulesOf(world(2)).corpse).toBe(750);
  });

  it('changes prices and starting gold', () => {
    expect(mercPrice(world(2), 100)).toBe(125);
    expect(mercPrice(world(1), 100)).toBe(100);
  });

  it('makes foes hunt the weakest armour on hard but the nearest unit otherwise', () => {
    const pick = (diff: number): number => {
      const sim = new Sim(field(30, 30), 7, [0, 0, 0, 1], { kinds: [Kind.Hero, Kind.Warrior, Kind.Mage, Kind.Gnoll], combat: true });
      sim.place(0, 2, 25);
      sim.place(1, 21, 20); // armoured and nearer
      sim.place(2, 24, 20); // unarmoured, farther
      sim.place(3, 20, 20);
      createHero(sim, 0, 0, false, diff);
      sim.step([]);
      return enemyNear(sim, 3, 8 * FP, sim.x[3], sim.y[3], 0);
    };
    expect(pick(1)).toBe(1);
    expect(pick(2)).toBe(2);
  });

  it('keeps every difficulty deterministic over a run', () => {
    for (const d of [0, 1, 2]) {
      const a = world(d);
      const b = world(d);
      for (let i = 0; i < 100; i++) {
        a.step([]);
        b.step([]);
      }
      expect(a.hash()).toBe(b.hash());
    }
  });
});
