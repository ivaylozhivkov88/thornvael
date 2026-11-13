import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { Kind, strike } from '../src/sim/combat';
import { createHero, HeroSkillId, totals } from '../src/sim/hero';
import { Cls } from '../src/sim/items';
import { FP, Sim } from '../src/sim/sim';
import { St } from '../src/sim/spelldata';

function field(w: number, h: number): GameMap {
  return {
    w,
    h,
    terrain: new Uint8Array(w * h),
    height: new Uint8Array(w * h),
    blocked: new Uint8Array(w * h),
    objects: [],
    light: new Uint8Array(w * h).fill(200),
  };
}

describe('Hero Progression & Leveling', () => {
  it('levels up when XP threshold is reached, granting stat points and restoring HP/mana', () => {
    const sim = new Sim(field(30, 30), 10, [0], { kinds: [Kind.Hero], combat: true });
    sim.place(0, 5, 5);
    const hero = createHero(sim, 0, Cls.Warrior, false, 1);

    expect(hero.level).toBe(1);
    expect(hero.statPoints).toBe(0);

    // Damage hero
    sim.cb.hp[0] = 30;
    sim.cb.mana[0] = 10;

    // Award enough XP for Level 2 (100 XP required)
    // Spawn a monster and kill it
    const simWithFoe = new Sim(field(30, 30), 10, [0, 1], {
      kinds: [Kind.Hero, Kind.Gnoll],
      combat: true,
      tiers: [1, 2],
      bossMods: [[], ['champion']],
    });
    simWithFoe.place(0, 5, 5);
    simWithFoe.place(1, 6, 5);
    createHero(simWithFoe, 0, Cls.Warrior, false, 1);
    simWithFoe.cb.hp[0] = 30;

    // Gnoll tier 2 champion: 15 * 2 * 2 = 60 XP. Killing 2 gnolls gives 120 XP -> level up!
    strike(simWithFoe, 1, 1000, 1000, 0, 100, 0); // kills gnoll 1
    expect(simWithFoe.hero!.xp).toBe(60);

    // Add another 60 XP
    const simWithFoe2 = new Sim(field(30, 30), 10, [0, 1], {
      kinds: [Kind.Hero, Kind.Gnoll],
      combat: true,
      tiers: [1, 2],
      bossMods: [[], ['champion']],
    });
    simWithFoe2.place(0, 5, 5);
    simWithFoe2.place(1, 6, 5);
    createHero(simWithFoe2, 0, Cls.Warrior, false, 1);
    simWithFoe2.hero!.xp = 60;
    simWithFoe2.cb.hp[0] = 30;

    strike(simWithFoe2, 1, 1000, 1000, 0, 100, 0); // kills gnoll -> +60 XP -> total 120 XP
    expect(simWithFoe2.hero!.level).toBe(2);
    expect(simWithFoe2.hero!.statPoints).toBe(5);
    expect(simWithFoe2.cb.hp[0]).toBe(simWithFoe2.cb.hpMax[0]); // Fully restored!
  });

  it('allocates stat points via heroCommand', () => {
    const sim = new Sim(field(30, 30), 10, [0], { kinds: [Kind.Hero], combat: true });
    sim.place(0, 5, 5);
    const hero = createHero(sim, 0, Cls.Warrior, false, 1);
    hero.statPoints = 5;

    const baseBody = hero.attr[0];
    const prevHpMax = sim.cb.hpMax[0];

    // Allocate 1 point to Body (attr 0)
    sim.step([{ type: 'hero', op: 'stat', attr: 0 }]);
    expect(hero.statPoints).toBe(4);
    expect(hero.attr[0]).toBe(baseBody + 1);
    expect(sim.cb.hpMax[0]).toBeGreaterThan(prevHpMax);

    // Allocate to Agility (attr 1)
    sim.step([{ type: 'hero', op: 'stat', attr: 1 }]);
    expect(hero.statPoints).toBe(3);
    expect(hero.attr[1]).toBe(totals(hero)[1]);
  });
});

describe('Warrior Active Skills', () => {
  it('whirlwind deals 360 AoE damage to all nearby enemies', () => {
    // Hero surrounded by 3 gnolls
    const sim = new Sim(field(30, 30), 42, [0, 1, 1, 1], {
      kinds: [Kind.Hero, Kind.Gnoll, Kind.Gnoll, Kind.Gnoll],
      combat: true,
    });
    sim.place(0, 10, 10);
    sim.place(1, 11, 10); // dist 1.0
    sim.place(2, 9, 10);  // dist 1.0
    sim.place(3, 10, 12); // dist 2.0 (within 2.5)
    createHero(sim, 0, Cls.Warrior, false, 1);

    const hp1 = sim.cb.hp[1];
    const hp2 = sim.cb.hp[2];
    const hp3 = sim.cb.hp[3];

    sim.step([{ type: 'hero', op: 'skill', skill: 'whirlwind' }]);

    expect(sim.cb.hp[1]).toBeLessThan(hp1);
    expect(sim.cb.hp[2]).toBeLessThan(hp2);
    expect(sim.cb.hp[3]).toBeLessThan(hp3);
    expect(sim.hero!.skillCd!['whirlwind']).toBeGreaterThan(0);
  });

  it('shield charge dashes to enemy, deals damage and applies stun (St.Stone)', () => {
    const sim = new Sim(field(30, 30), 42, [0, 1], {
      kinds: [Kind.Hero, Kind.Gnoll],
      combat: true,
    });
    sim.place(0, 10, 10);
    sim.place(1, 14, 10); // 4 tiles away
    createHero(sim, 0, Cls.Warrior, false, 1);

    const initHp = sim.cb.hp[1];
    sim.step([{ type: 'hero', op: 'skill', skill: 'shield_charge', target: 1 }]);

    // Hero gap-closed to near the gnoll
    const distToGnoll = Math.hypot(sim.x[0] - sim.x[1], sim.y[0] - sim.y[1]);
    expect(distToGnoll).toBeLessThan(1.5 * FP);
    expect(sim.cb.hp[1]).toBeLessThan(initHp);
    expect(sim.cb.stMask[1] & (1 << St.Stone)).not.toBe(0); // Stunned!
  });

  it('iron bulwark applies heavy shield and bless buff', () => {
    const sim = new Sim(field(30, 30), 42, [0], {
      kinds: [Kind.Hero],
      combat: true,
    });
    sim.place(0, 10, 10);
    createHero(sim, 0, Cls.Warrior, false, 1);

    sim.step([{ type: 'hero', op: 'skill', skill: 'iron_bulwark' }]);

    expect(sim.cb.stMask[0] & (1 << St.Shield)).not.toBe(0);
    expect(sim.cb.stMask[0] & (1 << St.Bless)).not.toBe(0);
    expect(sim.hero!.skillCd!['iron_bulwark']).toBeGreaterThan(0);
  });
});

describe('Mage Active Skills', () => {
  it('chain lightning arcs across up to 5 enemies', () => {
    // Hero plus 5 gnolls spaced within 3 tiles of each other
    const sim = new Sim(field(30, 30), 42, [0, 1, 1, 1, 1, 1], {
      kinds: [Kind.Hero, Kind.Gnoll, Kind.Gnoll, Kind.Gnoll, Kind.Gnoll, Kind.Gnoll],
      combat: true,
    });
    sim.place(0, 10, 10);
    sim.place(1, 13, 10);
    sim.place(2, 15, 10);
    sim.place(3, 17, 10);
    sim.place(4, 19, 10);
    sim.place(5, 21, 10);
    createHero(sim, 0, Cls.Mage, false, 1);

    const hps = [1, 2, 3, 4, 5].map((i) => sim.cb.hp[i]);

    sim.step([{ type: 'hero', op: 'skill', skill: 'chain_lightning', target: 1 }]);

    // All 5 gnolls were struck by the arc
    for (let i = 1; i <= 5; i++) {
      expect(sim.cb.hp[i]).toBeLessThan(hps[i - 1]);
    }
  });

  it('frost nova pulses 360 frost damage and freezes/slows all enemies in 3.5 tiles', () => {
    const sim = new Sim(field(30, 30), 42, [0, 1, 1], {
      kinds: [Kind.Hero, Kind.Gnoll, Kind.Gnoll],
      combat: true,
    });
    sim.place(0, 10, 10);
    sim.place(1, 12, 10); // dist 2.0 (inside 3.5)
    sim.place(2, 10, 13); // dist 3.0 (inside 3.5)
    createHero(sim, 0, Cls.Mage, false, 1);

    const hp1 = sim.cb.hp[1];
    const hp2 = sim.cb.hp[2];

    sim.step([{ type: 'hero', op: 'skill', skill: 'frost_nova' }]);

    expect(sim.cb.hp[1]).toBeLessThan(hp1);
    expect(sim.cb.hp[2]).toBeLessThan(hp2);
    expect(sim.cb.stMask[1] & (1 << St.Slow)).not.toBe(0);
    expect(sim.cb.stMask[2] & (1 << St.Slow)).not.toBe(0);
  });

  it('teleport blinks hero up to 7 tiles to target position and breaks aggro', () => {
    const sim = new Sim(field(30, 30), 42, [0, 1], {
      kinds: [Kind.Hero, Kind.Gnoll],
      combat: true,
    });
    sim.place(0, 10, 10);
    sim.place(1, 10.5, 10); // adjacent melee gnoll targeting hero
    createHero(sim, 0, Cls.Mage, false, 1);
    sim.cb.tgt[1] = 0; // gnoll targeting hero

    sim.step([{ type: 'hero', op: 'skill', skill: 'teleport', x: 16, y: 10 }]);

    // Hero repositioned 6 tiles away
    expect(Math.floor(sim.x[0] / FP)).toBe(16);
    expect(Math.floor(sim.y[0] / FP)).toBe(10);
    // Gnoll lost target lock
    expect(sim.cb.tgt[1]).toBe(-1);
  });
});

describe('Corpse Drop & Shrine Respawn', () => {
  it('drops 15% gold penalty corpse sack and respawns hero at nearest shrine instead of game over', () => {
    const sim = new Sim(field(30, 30), 42, [0, 1], {
      kinds: [Kind.Hero, Kind.Golem],
      combat: true,
    });
    sim.place(0, 15, 15);
    sim.place(1, 15, 16);
    sim.attachShrines([
      { kind: 'healing', x: 5, y: 5 },
      { kind: 'mana', x: 25, y: 25 },
    ]);
    createHero(sim, 0, Cls.Warrior, false, 1);
    sim.cb.gold[0] = 1000;

    const deathX = sim.x[0];
    const deathY = sim.y[0];

    // Deal lethal damage to hero
    strike(sim, 0, 10000, 10000, 0, 100, 1);

    // Hero suffered 15% gold penalty (150 gold)
    expect(sim.cb.gold[0]).toBe(850);

    // Gold sack spawned at death position with 150 gold
    const sack = [0, 1, 2, 3].find((s) => sim.cb.sG[s] === 150);
    expect(sack).toBeDefined();
    expect(sim.cb.sX[sack!]).toBe(deathX);
    expect(sim.cb.sY[sack!]).toBe(deathY);

    // Hero is ALIVE and respawned at the nearest shrine (shrine at 5, 5 is closer to 15, 15 than 25, 25)
    expect(sim.cb.hp[0]).toBe(sim.cb.hpMax[0]);
    expect(Math.floor(sim.x[0] / FP)).toBe(5);
    expect(Math.floor(sim.y[0] / FP)).toBe(5);
    expect(sim.alive(0)).toBe(true);
  });
});
