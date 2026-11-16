import { describe, expect, it } from 'vitest';
import { newProgress, type Campaign } from '../src/campaign';
import { build, healPct, levelOf, nextCost, hireDiscountPct, tierBonus } from '../src/townbuild';

const c: Campaign = { version: 1, chapter: 'c', start: 'a', nodes: [{ id: 'a', kind: 'town', map: 'm', title: 't', pos: [0, 0], unlocksOnVictory: [], briefing: '' }] };

describe('town buildings', () => {
  it('older records read as nothing built', () => {
    const p = newProgress(c, 1);
    expect(levelOf(p.builds, 'forge')).toBe(0);
    expect([hireDiscountPct(p.builds), tierBonus(p.builds), healPct(p.builds)]).toEqual([0, 0, 0]);
    expect(nextCost(p.builds, 'barracks')).toBe(400);
  });

  it('building spends gold, raises one level and keeps the old progress untouched', () => {
    const p = newProgress(c, 1);
    const r = build(p, 1000, 'shrine')!;
    expect(r.gold).toBe(700);
    expect(levelOf(r.progress.builds, 'shrine')).toBe(1);
    expect(healPct(r.progress.builds)).toBe(20);
    expect(p.builds).toBeUndefined();
  });

  it('refuses when gold is short or the building is at its top level', () => {
    const p = newProgress(c, 1);
    expect(build(p, 599, 'forge')).toBeNull();
    let cur = { progress: p, gold: 5000 };
    for (let n = 0; n < 2; n++) cur = build(cur.progress, cur.gold, 'forge')!;
    expect(tierBonus(cur.progress.builds)).toBe(2);
    expect(cur.gold).toBe(2900);
    expect(nextCost(cur.progress.builds, 'forge')).toBeNull();
    expect(build(cur.progress, cur.gold, 'forge')).toBeNull();
  });

  it('survives a JSON round trip like saves and exported records', () => {
    const r = build(newProgress(c, 1), 500, 'barracks')!;
    const back = JSON.parse(JSON.stringify(r.progress));
    expect(hireDiscountPct(back.builds)).toBe(10);
  });
});
