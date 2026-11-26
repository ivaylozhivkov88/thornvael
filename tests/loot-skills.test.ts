import { describe, expect, it } from 'vitest';
import {
  MAGIC_PREFIXES,
  MAGIC_SUFFIXES,
  UNIQUE_ARTIFACTS,
  rollAffix,
  rollMagicItem,
  rollRareItem,
} from '../src/sim/affixes';
import { transmuteCube } from '../src/sim/cube';
import {
  BUILTIN_GEMS,
  Ik,
  Slot,
  type ItemDef,
} from '../src/sim/item-types';
import {
  ITEMS,
  canSocket,
  getItemDef,
  socketGem,
} from '../src/sim/items';
import { calculateEffectiveMFTable } from '../src/sim/mechanics';
import { Rng } from '../src/sim/rng';
import { ALL_SETS, calculateActiveSetBonuses } from '../src/sim/sets';
import {
  MAGE_SKILL_TREE,
  WARRIOR_SKILL_TREE,
  allocateSkill,
  canAllocateSkill,
  computeActiveSkillPowerPct,
  computePassiveBonuses,
  computeSkillSynergyPct,
  createSkillTreeState,
  getBranchPoints,
  getTotalAllocatedPoints,
  respecCost,
  respecSkills,
  setLoadoutSlot,
} from '../src/skills';

describe('Loot, Affixes & Item Scaling (src/sim/*)', () => {
  it('computes effective MF diminishing returns deterministically', () => {
    const mf0 = calculateEffectiveMFTable(0);
    const mf300 = calculateEffectiveMFTable(300);
    expect(mf0.unique).toBe(0);
    expect(mf300.unique).toBeGreaterThan(100);
    expect(mf300.magic).toBe(300);
    expect(mf300.rare).toBeGreaterThan(mf300.unique);
  });

  it('produces identical rare/magic rolls for identical seeds (deterministic PRNG)', () => {
    const base = ITEMS.find((it) => it.kind === Ik.Gear && it.slot === Slot.Weapon)!;
    const mkRng = (seed: number) => {
      const r = new Rng(seed);
      return (n: number) => r.int(n);
    };
    const a = rollRareItem(base, 3, mkRng(424242));
    const b = rollRareItem(base, 3, mkRng(424242));
    const c = rollRareItem(base, 3, mkRng(999999));

    expect(a).toEqual(b);
    expect(a.rarity).toBe('rare');
    expect(a.name).not.toBe(c.name);
  });

  it('exposes rich prefix/suffix pools and mutual exclusion on magic rolls', () => {
    expect(MAGIC_PREFIXES.length).toBeGreaterThan(15);
    expect(MAGIC_SUFFIXES.length).toBeGreaterThan(15);
    expect(UNIQUE_ARTIFACTS.length).toBeGreaterThanOrEqual(18);

    const base = ITEMS.find((it) => it.kind === Ik.Gear && it.slot === Slot.Armor)!;
    const rng = new Rng(777);
    const pre = rollAffix(MAGIC_PREFIXES, 2, Slot.Armor, 0, (n) => rng.int(n));
    expect(pre).not.toBeNull();
    const magic = rollMagicItem(base, 2, (n) => rng.int(n));
    expect(magic.rarity).toBe('magic');
  });

  it('activates 2/3/4-piece set bonuses from src/sim/sets.ts', () => {
    const warden = ALL_SETS.find((s) => s.id === 'iron_warden')!;
    expect(warden).toBeDefined();
    expect(calculateActiveSetBonuses([warden.pieces[0].name, warden.pieces[1].name]).length).toBe(1);
    expect(calculateActiveSetBonuses(warden.pieces.map((p) => p.name)).length).toBe(3);
  });
});

describe('Sockets & Reliquary Forge Transmutation (src/sim/*)', () => {
  it('validates socket capacity and inserts gems cleanly', () => {
    const baseWeapon = getItemDef(0)!;
    const socketedBase: ItemDef = { ...baseWeapon, sockets: 2, socketedGems: [] };
    expect(canSocket(socketedBase)).toBe(true);

    const ruby = BUILTIN_GEMS.find((g) => g.name === 'Perfect Ruby')!;
    const gemmed = socketGem(socketedBase, ruby);
    expect(gemmed.socketedGems).toEqual(['Perfect Ruby']);
    expect(gemmed.min).toBeGreaterThan(socketedBase.min);
  });

  it('transmutes 3 identical gems and 3 rings cleanly in transmuteCube', () => {
    const chippedRuby: ItemDef = {
      name: 'Chipped Ruby',
      kind: Ik.Gem,
      slot: -1,
      tier: 1,
      w: 0,
      cls: 3,
      need: 0,
      needv: 0,
      min: 0,
      max: 0,
      acc: 0,
      cover: 0,
      def: 0,
      abs: 0,
      res: [0, 0, 0, 0, 0],
      attr: [0, 0, 0, 0],
      hp: 0,
      mana: 0,
      pow: 0,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
    };
    const res = transmuteCube([chippedRuby, chippedRuby, chippedRuby]);
    expect(res?.result.name).toBe('Flawed Ruby');

    const ring = ITEMS.find((it) => it.kind === Ik.Gear && it.slot === Slot.Ring)!;
    const ammy = transmuteCube([ring, ring, ring]);
    expect(ammy?.result.name).toBe('Forge-Bound Amulet');
    expect(ammy?.result.slot).toBe(Slot.Amulet);
  });
});

describe('3-Branch Skill Trees, Synergies & Gold Respec', () => {
  it('defines 3 branches and 8+ active skills for both Warrior and Mage', () => {
    const warActives = WARRIOR_SKILL_TREE.filter((s) => s.type === 'active');
    const magActives = MAGE_SKILL_TREE.filter((s) => s.type === 'active');

    expect(new Set(WARRIOR_SKILL_TREE.map((s) => s.branch))).toEqual(new Set(['Berserker', 'Guardian', 'Warlord']));
    expect(new Set(MAGE_SKILL_TREE.map((s) => s.branch))).toEqual(new Set(['Pyromancer', 'Cryomancer', 'Shadowcaller']));
    expect(warActives.length).toBeGreaterThanOrEqual(6);
    expect(magActives.length).toBeGreaterThanOrEqual(6);
  });

  it('enforces prerequisites, computes synergies & passives, and supports loadout + gold respec', () => {
    let state = createSkillTreeState('warrior', 10);
    expect(state.availablePoints).toBe(9);

    // Cannot take Tier 3 Whirlwind before Tier 1 Cleaving Arc
    expect(canAllocateSkill(state, 'war_ber_4').ok).toBe(false);

    state = allocateSkill(state, 'war_ber_2')!; // Cleaving Arc rank 1 (auto-loads slot 0)
    expect(state.loadout[0]).toBe('war_ber_2');

    state = allocateSkill(state, 'war_ber_2')!; // Cleaving Arc rank 2
    state = allocateSkill(state, 'war_ber_4')!; // Whirlwind rank 1 (synergy from Cleaving Arc!)
    expect(computeSkillSynergyPct(state, 'war_ber_4')).toBe(12); // 2 ranks * 6%
    expect(computeActiveSkillPowerPct(state, 'war_ber_4')).toBe(Math.floor((125 * 112) / 100));

    state = allocateSkill(state, 'war_ber_1')!; // Heavy Edge (+4% melee)
    const passives = computePassiveBonuses(state);
    expect(passives.meleeDmgPct).toBe(4);
    expect(getBranchPoints(state, 'Berserker')).toBe(4);
    expect(getTotalAllocatedPoints(state)).toBe(4);

    // Loadout swap
    const swapped = setLoadoutSlot(state, 5, 'war_ber_4')!;
    expect(swapped.loadout[5]).toBe('war_ber_4');

    // Respec fails with insufficient gold, succeeds with enough gold, and scales cost
    const cost1 = respecCost(10, 0);
    expect(cost1).toBe(1000);
    expect(respecSkills(swapped, cost1 - 1).ok).toBe(false);

    const res = respecSkills(swapped, 5000);
    expect(res.ok).toBe(true);
    expect(res.cost).toBe(1000);
    expect(res.state.availablePoints).toBe(9);
    expect(res.state.ranks).toEqual({});
    expect(res.state.respecCount).toBe(1);
    expect(respecCost(10, res.state.respecCount)).toBe(2000);
  });

  it('computes Mage passive and synergy scaling cleanly', () => {
    let state = createSkillTreeState('mage', 12);
    state = allocateSkill(state, 'mag_pyr_1')!; // +5% fire pow, +4% fire res
    state = allocateSkill(state, 'mag_pyr_2')!; // Cinder Bolt
    state = allocateSkill(state, 'mag_pyr_4')!; // Fireball Volley (synergy from Cinder Bolt)
    expect(computePassiveBonuses(state).firePowPct).toBe(5);
    expect(computeSkillSynergyPct(state, 'mag_pyr_4')).toBe(6);
  });
});
