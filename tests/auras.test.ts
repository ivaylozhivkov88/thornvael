import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import {
  ALL_AURA_IDS,
  DEFENSIVE_UTILITY_AURAS,
  OFFENSIVE_AURAS,
  getAuraDefinition,
  getUnitActiveAuras,
  isAuraId,
  isUnitUnderConviction,
  isUnitUnderThorns,
  type AuraId,
} from '../src/sim/auras';
import { Sim } from '../src/sim/sim';
import { Kind, Elem, strike } from '../src/sim/combat';
import { St } from '../src/sim/spelldata';
import { addStatus } from '../src/sim/spells';
import { createHero } from '../src/sim/hero';
import { renderVanguardAura } from '../src/auras';
import { CombatFeelSystem } from '../src/feel';

function makeMap() {
  const w = 32;
  const h = 32;
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

describe('Vanguard Aura Visuals & Roster Engine', () => {
  describe('Complete Aura Roster', () => {
    it('contains all 17 Vanguard auras', () => {
      expect(ALL_AURA_IDS.length).toBe(17);
      expect(OFFENSIVE_AURAS.length).toBe(9);
      expect(DEFENSIVE_UTILITY_AURAS.length).toBe(8);

      const expectedOffensive: AuraId[] = [
        'might',
        'holy_fire',
        'thorns',
        'blessed_aim',
        'holy_freeze',
        'holy_shock',
        'sanctuary',
        'fanaticism',
        'conviction',
      ];
      for (const id of expectedOffensive) {
        expect(OFFENSIVE_AURAS.includes(id)).toBe(true);
        expect(isAuraId(id)).toBe(true);
      }

      const expectedDefensive: AuraId[] = [
        'prayer',
        'defiance',
        'cleansing',
        'vigor',
        'meditation',
        'redemption',
        'salvation',
        'concentration',
      ];
      for (const id of expectedDefensive) {
        expect(DEFENSIVE_UTILITY_AURAS.includes(id)).toBe(true);
        expect(isAuraId(id)).toBe(true);
      }
    });

    it('has complete visual palettes and descriptions for all 17 auras', () => {
      for (const id of ALL_AURA_IDS) {
        const def = getAuraDefinition(id);
        expect(def).toBeDefined();
        expect(def.id).toBe(id);
        expect(def.name.length).toBeGreaterThan(0);
        expect(def.basinDescription.length).toBeGreaterThan(20);
        expect(def.primaryColor).toBeGreaterThan(0);
        expect(def.secondaryColor).toBeGreaterThan(0);
        expect(def.accentColor).toBeGreaterThan(0);
        expect(def.radiusTiles).toBeGreaterThanOrEqual(6);
        expect([25, 50].includes(def.pulseIntervalTicks)).toBe(true);
        expect(['allies', 'enemies', 'both'].includes(def.target)).toBe(true);
      }
    });
  });

  describe('Active Aura Resolution & Monster Mod Mapping', () => {
    it('resolves hero active aura', () => {
      const sim = new Sim(makeMap(), 12345, [0], {
        kinds: [Kind.Hero],
        combat: true,
      });
      createHero(sim, 0, 0, false, 1);
      sim.place(0, 10, 10);
      expect(sim.hero).toBeDefined();

      // Default hero has no active aura
      expect(getUnitActiveAuras(sim, 0)).toEqual([]);

      // Set hero aura to Fanaticism
      sim.hero!.activeAura = 'fanaticism';
      expect(getUnitActiveAuras(sim, 0)).toContain('fanaticism');

      // Switch to Conviction
      sim.hero!.activeAura = 'conviction';
      expect(getUnitActiveAuras(sim, 0)).toContain('conviction');
    });

    it('maps classic champion and boss affixes to authentic Basin auras', () => {
      const sim = new Sim(makeMap(), 12345, [1, 1, 1, 1, 1], {
        kinds: [Kind.Golem, Kind.Warrior, Kind.Archer, Kind.Mage, Kind.Gnoll],
        bossMods: [
          ['extra_strong'],
          ['cold_enchanted'],
          ['lightning_enchanted'],
          ['fire_enchanted'],
          ['blessed_aura'],
        ],
        combat: true,
      });

      expect(getUnitActiveAuras(sim, 0)).toContain('might');
      expect(getUnitActiveAuras(sim, 1)).toContain('holy_freeze');
      expect(getUnitActiveAuras(sim, 2)).toContain('holy_shock');
      expect(getUnitActiveAuras(sim, 3)).toContain('holy_fire');
      expect(getUnitActiveAuras(sim, 4)).toContain('blessed_aim');
    });

    it('supports direct D2 aura names in bossMods', () => {
      const sim = new Sim(makeMap(), 12345, [1, 1, 1], {
        kinds: [Kind.Golem, Kind.Warrior, Kind.Mage],
        bossMods: [['fanaticism'], ['conviction'], ['thorns', 'meditation']],
        combat: true,
      });

      expect(getUnitActiveAuras(sim, 0)).toContain('fanaticism');
      expect(getUnitActiveAuras(sim, 1)).toContain('conviction');
      expect(getUnitActiveAuras(sim, 2)).toContain('thorns');
      expect(getUnitActiveAuras(sim, 2)).toContain('meditation');
    });
  });

  describe('Area Targeting & Conviction Decal Detection', () => {
    it('detects when an enemy is under Conviction', () => {
      const sim = new Sim(makeMap(), 12345, [0, 1, 1], {
        kinds: [Kind.Warrior, Kind.Gnoll, Kind.Gnoll],
        bossMods: [['conviction'], [], []],
        combat: true,
      });

      sim.place(0, 10, 10);
      sim.place(1, 13, 10); // 3 tiles away (within 9 tiles radius)
      sim.place(2, 25, 10); // 15 tiles away (outside radius)

      // Friendly bearer is not afflicted by own debuff
      expect(isUnitUnderConviction(sim, 0)).toBe(false);

      // Nearby enemy is under Conviction
      expect(isUnitUnderConviction(sim, 1)).toBe(true);

      // Far enemy is not under Conviction
      expect(isUnitUnderConviction(sim, 2)).toBe(false);
    });

    it('detects when friendly units are under Thorns protection', () => {
      const sim = new Sim(makeMap(), 12345, [0, 0, 1], {
        kinds: [Kind.Warrior, Kind.Archer, Kind.Gnoll],
        bossMods: [['thorns'], [], []],
        combat: true,
      });

      sim.place(0, 10, 10);
      sim.place(1, 12, 10);
      sim.place(2, 11, 10);

      expect(isUnitUnderThorns(sim, 0)).toBe(true);
      expect(isUnitUnderThorns(sim, 1)).toBe(true);
      expect(isUnitUnderThorns(sim, 2)).toBe(false);
    });
  });

  describe('Deterministic Simulation Aura Mechanics', () => {
    it('Prayer heals injured allies periodically', () => {
      const sim = new Sim(makeMap(), 12345, [0, 0], {
        kinds: [Kind.Warrior, Kind.Archer],
        bossMods: [['prayer'], []],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 11, 10);

      // Damage ally
      sim.cb.hp[1] = 20;
      const initialHp = sim.cb.hp[1];

      // Step 25 ticks to trigger Prayer pulse
      for (let t = 0; t < 26; t++) sim.step();

      expect(sim.cb.hp[1]).toBeGreaterThan(initialHp);
    });

    it('Cleansing rapidly purges poison debuffs on party', () => {
      const sim = new Sim(makeMap(), 12345, [0, 0], {
        kinds: [Kind.Warrior, Kind.Archer],
        bossMods: [['cleansing'], []],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 11, 10);

      // Apply short poison status to ally
      addStatus(sim, 1, St.Poison, 20, 1);
      expect((sim.cb.stMask[1] & (1 << St.Poison))).not.toBe(0);

      // Step 25 ticks to trigger Cleansing pulse
      for (let t = 0; t < 26; t++) sim.step();

      // Poison has been completely purged by Cleansing
      expect((sim.cb.stMask[1] & (1 << St.Poison))).toBe(0);
    });

    it('Holy Fire deals periodic fire damage to nearby enemies', () => {
      const sim = new Sim(makeMap(), 12345, [0, 1], {
        kinds: [Kind.Warrior, Kind.Gnoll],
        bossMods: [['holy_fire'], []],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 12, 10);

      const foeStartHp = sim.cb.hp[1];

      // Step 50 ticks to trigger Holy Fire 2-second pulse
      for (let t = 0; t < 51; t++) sim.step();

      expect(sim.cb.hp[1]).toBeLessThan(foeStartHp);
    });

    it('Holy Freeze slows and damages nearby enemies', () => {
      const sim = new Sim(makeMap(), 12345, [0, 1], {
        kinds: [Kind.Warrior, Kind.Gnoll],
        bossMods: [['holy_freeze'], []],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 12, 10);

      const foeStartHp = sim.cb.hp[1];

      // Step 25 ticks
      for (let t = 0; t < 26; t++) sim.step();

      expect(sim.cb.hp[1]).toBeLessThan(foeStartHp);
      expect((sim.cb.stMask[1] & (1 << St.Slow))).not.toBe(0);
    });

    it('Holy Shock deals periodic electric lightning damage to enemies', () => {
      const sim = new Sim(makeMap(), 12345, [0, 1], {
        kinds: [Kind.Warrior, Kind.Gnoll],
        bossMods: [['holy_shock'], []],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 12, 10);

      const foeStartHp = sim.cb.hp[1];

      // Step 50 ticks
      for (let t = 0; t < 51; t++) sim.step();

      expect(sim.cb.hp[1]).toBeLessThan(foeStartHp);
    });

    it('Vigor grants Haste speed boost to party members', () => {
      const sim = new Sim(makeMap(), 12345, [0, 0], {
        kinds: [Kind.Warrior, Kind.Archer],
        bossMods: [['vigor'], []],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 12, 10);

      // Step 50 ticks
      for (let t = 0; t < 51; t++) sim.step();

      expect((sim.cb.stMask[1] & (1 << St.Haste))).not.toBe(0);
    });

    it('Meditation accelerates Mana recovery for party members', () => {
      const sim = new Sim(makeMap(), 12345, [0, 0], {
        kinds: [Kind.Warrior, Kind.Mage],
        bossMods: [['meditation'], []],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 12, 10);

      sim.cb.mana[1] = 10;
      const initialMana = sim.cb.mana[1];

      // Step 25 ticks
      for (let t = 0; t < 26; t++) sim.step();

      expect(sim.cb.mana[1]).toBeGreaterThan(initialMana);
    });

    it('Redemption redeems monster corpses into Life and Mana', () => {
      const sim = new Sim(makeMap(), 12345, [0, 1], {
        kinds: [Kind.Warrior, Kind.Gnoll],
        bossMods: [['redemption'], []],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 12, 10);

      // Slay enemy to make a corpse
      sim.cb.hp[1] = 0;
      sim.cb.corp[1] = 100;

      // Injure bearer
      sim.cb.hp[0] = 30;
      sim.cb.mana[0] = 0;

      // Step 50 ticks
      for (let t = 0; t < 51; t++) sim.step();

      // Corpse has been redeemed and bearer restored
      expect(sim.cb.corp[1]).toBe(0);
      expect(sim.cb.hp[0]).toBeGreaterThan(30);
    });

    it('Thorns reflects melee physical damage back onto the attacker', () => {
      const sim = new Sim(makeMap(), 12345, [0, 1], {
        kinds: [Kind.Warrior, Kind.Gnoll],
        bossMods: [['thorns'], []],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 11, 10);

      const attackerHpBefore = sim.cb.hp[1];

      // Attacker strikes the Thorns bearer with melee physical blow until a hit lands
      for (let s = 0; s < 5 && sim.cb.hp[1] === attackerHpBefore; s++) {
        strike(sim, 0, 20, 20, Elem.Physical, 35, 1);
      }

      // Attacker should have received reflected thorns damage
      expect(sim.cb.hp[1]).toBeLessThan(attackerHpBefore);
    });
  });

  describe('PixiJS Decal Visual Renderer', () => {
    it('renders all 17 Vanguard auras without throwing', () => {
      const g = new Graphics();
      expect(g.blendMode).toBe('inherit');

      for (const id of ALL_AURA_IDS) {
        expect(() => {
          renderVanguardAura(g, id, 100, 100, 12345, 1.0, 0);
        }).not.toThrow();
      }
    });

    it('renders multi-layer ground decals inside CombatFeelSystem', () => {
      const feel = new CombatFeelSystem(32, 32);
      expect(feel.auraGraphics.blendMode).toBe('add');

      const sim = new Sim(makeMap(), 12345, [0, 1, 0], {
        kinds: [Kind.Warrior, Kind.Gnoll, Kind.Mage],
        bossMods: [['fanaticism'], ['conviction'], ['holy_shock']],
        combat: true,
      });
      sim.place(0, 10, 10);
      sim.place(1, 12, 10);
      sim.place(2, 14, 10);

      // Render unit auras onto feel.auraGraphics
      expect(() => {
        feel.renderAuras(sim, 2000, 16);
      }).not.toThrow();
    });
  });

  describe('Simulation Determinism & State Replay Gate', () => {
    it('produces identical state hashes across runs with active auras', () => {
      const createSim = () => {
        const s = new Sim(makeMap(), 424242, [0, 1, 0], {
          kinds: [Kind.Hero, Kind.Gnoll, Kind.Warrior],
          bossMods: [[], ['holy_freeze'], ['might']],
          combat: true,
        });
        createHero(s, 0, 0, false, 1);
        s.hero!.activeAura = 'fanaticism';
        s.place(0, 10, 10);
        s.place(1, 12, 10);
        s.place(2, 14, 10);
        return s;
      };

      const sim1 = createSim();
      const sim2 = createSim();

      for (let t = 0; t < 100; t++) {
        sim1.step();
        sim2.step();
        expect(sim1.hash()).toBe(sim2.hash());
      }
    });

    it('preserves hash across snapshot and restore continuation', () => {
      const sim1 = new Sim(makeMap(), 77777, [0, 1], {
        kinds: [Kind.Hero, Kind.Gnoll],
        bossMods: [[], ['holy_fire']],
        combat: true,
      });
      createHero(sim1, 0, 0, false, 1);
      sim1.hero!.activeAura = 'prayer';
      sim1.place(0, 10, 10);
      sim1.place(1, 12, 10);

      // Run 50 ticks
      for (let t = 0; t < 50; t++) sim1.step();

      // Snapshot & restore into new sim
      const snap = sim1.snapshot();
      const sim2 = new Sim(makeMap(), 0, [0, 1], {
        kinds: [Kind.Hero, Kind.Gnoll],
        bossMods: [[], ['holy_fire']],
        combat: true,
      });
      sim2.restore(snap);

      expect(sim2.hash()).toBe(sim1.hash());

      // Continue for 50 more ticks
      for (let t = 0; t < 50; t++) {
        sim1.step();
        sim2.step();
        if (sim2.hash() !== sim1.hash()) {
          console.log('Diff at t =', t);
          console.log('sim1 rng:', sim1.rng.state, 'sim2 rng:', sim2.rng.state);
          console.log('sim1 hp:', sim1.cb.hp, 'sim2 hp:', sim2.cb.hp);
          console.log('sim1 mana:', sim1.cb.mana, 'sim2 mana:', sim2.cb.mana);
          console.log('sim1 hero:', sim1.hero);
          console.log('sim2 hero:', sim2.hero);
          console.log('sim1 ord:', sim1.cb.ord, 'sim2 ord:', sim2.cb.ord);
          console.log('sim1 tgt:', sim1.cb.tgt, 'sim2 tgt:', sim2.cb.tgt);
          console.log('sim1 x:', sim1.x, 'sim2 x:', sim2.x);
          console.log('sim1 y:', sim1.y, 'sim2 y:', sim2.y);
          expect(sim2.hash()).toBe(sim1.hash());
        }
      }
    });
  });
});
