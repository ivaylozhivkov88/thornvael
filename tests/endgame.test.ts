import { describe, expect, it } from 'vitest';
import { loadDoc, validate } from '../src/mapdoc';
import { createMission } from '../src/mission';
import { Kind } from '../src/sim/combat';
import { createHero, dropLoot } from '../src/sim/hero';
import { SIGIL_NAMES, WRIT_NAME, canTransmute, getItemDef, itemId } from '../src/sim/items';
import { generatePinnacleArena } from '../src/sim/procgen';
import { Sim } from '../src/sim/sim';

const field = (w: number, h: number) => ({ w, h, blocked: new Uint8Array(w * h), terrain: new Uint8Array(w * h), height: new Uint8Array(w * h) } as never);

describe('endgame loop', () => {
  it('three different sigils make a writ; duplicates do not', () => {
    const defs = SIGIL_NAMES.map((n) => getItemDef(itemId(n))!);
    expect(canTransmute(defs)?.result.name).toBe(WRIT_NAME);
    expect(canTransmute([defs[0], defs[0], defs[1]])).toBeNull();
  });

  it('pinnacle arena validates, is deterministic and its boss has three mods', () => {
    const a = generatePinnacleArena({ seed: 9 });
    expect(validate(a)).toEqual([]);
    expect(JSON.stringify(generatePinnacleArena({ seed: 9 }))).toBe(JSON.stringify(a));
    expect(a.units.filter((u) => (u.bossMods?.length ?? 0) === 3)).toHaveLength(1);
  });

  it('the pinnacle boss always drops a unique or set item; the writ opens the vault', () => {
    const g = createMission(loadDoc(generatePinnacleArena({ seed: 3 })), 3);
    createHero(g.sim, 0, 0, false, 1);
    const sim = g.sim;
    const boss = Array.from({ length: sim.count }, (_, i) => i).find((i) => (sim.cb.bossMods[i]?.length ?? 0) === 3)!;
    sim.hero!.diff = 2;
    for (let n = 0; n < 5; n++) {
      sim.cb.bI.fill(0);
      dropLoot(sim, boss);
      const ids = Array.from(sim.cb.bI).filter((v) => v > 0).map((v) => sim.getItemDef(v - 1));
      expect(ids.some((d) => d?.rarity === 'unique' || d?.rarity === 'set')).toBe(true);
    }
    const writ = itemId(WRIT_NAME);
    sim.hero!.inv.push({ item: writ, n: 1 });
    sim.step([{ type: 'hero', op: 'use', item: writ }]);
    expect(sim.hero!.pinnacle).toBe(true);
    expect(sim.hero!.inv.some((s) => s.item === writ)).toBe(false);
  });

  it('hard elites can drop sigils, easier difficulties never do', () => {
    const run = (diff: number): number => {
      const sim = new Sim(field(24, 24), 3, [0, 1], { kinds: [Kind.Hero, Kind.Gnoll], combat: true, hpMul: 100 });
      createHero(sim, 0, 0, false, 1);
      sim.hero!.diff = diff;
      let found = 0;
      for (let n = 0; n < 40; n++) {
        (sim.cb.bossMods as string[][])[1] = ['extra_fast', 'stone_skin'];
        sim.cb.bI.fill(0);
        dropLoot(sim, 1);
        for (const v of sim.cb.bI) if (v > 0 && sim.getItemDef(v - 1)?.kind === 6) found++;
      }
      return found;
    };
    expect(run(2)).toBeGreaterThan(0);
    expect(run(1)).toBe(0);
  });
});
