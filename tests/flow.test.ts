import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCampaign } from '../src/campaign';
import type { CarryoverState } from '../src/carryover';
import { afterMission, afterTown, canEnter, clearLast, newRecord, nodeUrl, parseRecord } from '../src/flow';
import { startState } from '../src/sim/hero';

const camp = parseCampaign(JSON.parse(readFileSync('public/data/campaign.json', 'utf8')));
const maps = new Set(['ford', 'market']);
const last = { text: '', up: 3, size: 4, gold: 50 };
const carryFor = (rec: ReturnType<typeof newRecord>, gold: number): CarryoverState => ({ hero: startState(0, 1, true, 1), mercs: [{ kind: 2, hpPct: 60 }], gold, shopSeed: 1, progress: rec.progress });

describe('campaign screen flow', () => {
  it('a new game opens only the first node', () => {
    const rec = newRecord(camp, { cls: 1, female: true }, 2);
    expect(rec.progress.difficulty).toBe(2);
    expect(canEnter(rec, camp.start, maps, camp)).toBe(true);
    expect(canEnter(rec, 'town-thornwick', maps, camp)).toBe(false);
    expect(nodeUrl(camp.nodes[0])).toBe('./?mission=ford&campaign=m01-blood-at-the-ford');
  });

  it('a win opens the next nodes and keeps the hero; a node without a shipped map stays closed', () => {
    const rec = newRecord(camp, { cls: 0, female: false }, 1);
    const won = afterMission(camp, rec, camp.start, true, carryFor(rec, 120), last);
    expect(won.progress.completed).toEqual([camp.start]);
    expect(canEnter(won, 'town-thornwick', maps, camp)).toBe(true);
    expect(canEnter(won, 'm02-whispers-in-the-fen', maps, camp)).toBe(false); // unlocked, but its map is not built yet
    expect(won.carry?.gold).toBe(120);
    expect(won.carry?.progress.completed).toEqual([camp.start]);
    expect(won.last?.win).toBe(true);
  });

  it('a loss keeps the old state so the mission can be retried', () => {
    const rec = newRecord(camp, { cls: 0, female: false }, 1);
    const lost = afterMission(camp, rec, camp.start, false, carryFor(rec, 999), last);
    expect(lost.progress.completed).toEqual([]);
    expect(lost.carry).toBeNull();
    expect(lost.last?.win).toBe(false);
    expect(clearLast(lost).last).toBeNull();
  });

  it('leaving a town counts the visit and keeps what was bought', () => {
    let rec = newRecord(camp, { cls: 0, female: false }, 1);
    rec = afterMission(camp, rec, camp.start, true, carryFor(rec, 100), last);
    const out = afterTown(camp, rec, 'town-thornwick', carryFor(rec, 7));
    expect(out.progress.townVisits).toBe(1);
    expect(out.carry?.gold).toBe(7);
    expect(out.carry?.progress.townVisits).toBe(1);
    expect(out.last).toBeNull();
  });

  it('the record survives a JSON round trip and a damaged one is refused', () => {
    const rec = newRecord(camp, { cls: 1, female: false }, 0);
    expect(parseRecord(JSON.parse(JSON.stringify(rec)))?.progress.unlocked).toEqual([camp.start]);
    expect(parseRecord({ v: 2 })).toBeNull();
    expect(parseRecord(null)).toBeNull();
  });
});
