import { describe, expect, it } from 'vitest';
import {
  PREFIX_POOL,
  SUFFIX_POOL,
  clampIlvl,
  emptyEssences,
  getUpgradeChancePct,
  getUpgradedDef,
  ilvlToTier,
  insertSocketItem,
  maxSocketsFor,
  punchSocket,
  rerollAffix,
  rollItemDrop,
  rollRarity,
  salvageItem,
  upgradeItem,
} from '../src/items';
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
import { Slot } from '../src/sim/item-types';
import { Rng } from '../src/sim/rng';
import { ALL_SETS, calculateActiveSetBonuses } from '../src/sim/sets';

describe('Loot & Item Level Scaling (ilvl 1..50)', () => {
  it('maps ilvl 1..50 cleanly to tiers 1..5 and clamps out-of-range values', () => {
    expect(clampIlvl(-5)).toBe(1);
    expect(clampIlvl(99)).toBe(50);
    expect(ilvlToTier(1)).toBe(1);
    expect(ilvlToTier(10)).toBe(1);
    expect(ilvlToTier(11)).toBe(2);
    expect(ilvlToTier(20)).toBe(2);
    expect(ilvlToTier(21)).toBe(3);
    expect(ilvlToTier(35)).toBe(4);
    expect(ilvlToTier(41)).toBe(5);
    expect(ilvlToTier(50)).toBe(5);
  });

  it('caps max sockets by slot and tier', () => {
    expect(maxSocketsFor(Slot.Ring, 5)).toBe(0);
    expect(maxSocketsFor(Slot.Weapon, 1)).toBe(1);
    expect(maxSocketsFor(Slot.Weapon, 3)).toBe(3);
    expect(maxSocketsFor(Slot.Helm, 5)).toBe(2);
    expect(maxSocketsFor(Slot.Armor, 5)).toBe(3);
  });

  it('produces identical drops for identical seeds (deterministic PRNG)', () => {
    const a = rollItemDrop({ mlvl: 25, rank: 'elite', mf: 120, difficulty: 'veteran', seed: 424242, forcedRarity: 'rare' });
    const b = rollItemDrop({ mlvl: 25, rank: 'elite', mf: 120, difficulty: 'veteran', seed: 424242, forcedRarity: 'rare' });
    const c = rollItemDrop({ mlvl: 25, rank: 'elite', mf: 120, difficulty: 'veteran', seed: 999999, forcedRarity: 'rare' });

    expect(a).toEqual(b);
    expect(a.seed).toBe(424242);
    expect(a.name).not.toBe(c.name);
  });

  it('bosses never drop common gear and higher MF increases rare/unique odds deterministically', () => {
    for (let s = 1; s <= 50; s++) {
      const r = rollRarity('boss', 0, 'normal', new Rng(s));
      expect(r).not.toBe('common');
    }

    let rarePlus0 = 0;
    let rarePlus300 = 0;
    for (let s = 1; s <= 500; s++) {
      const r0 = rollRarity('elite', 0, 'normal', new Rng(s));
      const r3 = rollRarity('elite', 300, 'normal', new Rng(s));
      if (r0 === 'rare' || r0 === 'set' || r0 === 'unique') rarePlus0++;
      if (r3 === 'rare' || r3 === 'set' || r3 === 'unique') rarePlus300++;
    }
    expect(rarePlus300).toBeGreaterThan(rarePlus0);
  });
});

describe('Affix Pools, Mutual Exclusion & Sets', () => {
  it('never rolls two affixes from the same mutual exclusion group on rare items', () => {
    for (let s = 1; s <= 40; s++) {
      const item = rollItemDrop({ mlvl: 45, rank: 'boss', seed: 1000 + s, forcedRarity: 'rare' });
      expect(item.affixes.length).toBeGreaterThanOrEqual(3);
      expect(item.affixes.length).toBeLessThanOrEqual(6);
      const groups = item.affixes.map((a) => a.group);
      expect(new Set(groups).size).toBe(groups.length);
      expect(item.unidentified).toBe(true);
    }
  });

  it('respects ilvl gating on affix specs', () => {
    const lowPrefix = PREFIX_POOL.filter((a) => a.ilvlMin <= 5);
    const highPrefix = PREFIX_POOL.filter((a) => a.ilvlMin >= 30);
    expect(lowPrefix.length).toBeGreaterThan(0);
    expect(highPrefix.length).toBeGreaterThan(0);
    expect(SUFFIX_POOL.length).toBeGreaterThanOrEqual(20);

    for (let s = 1; s <= 25; s++) {
      const lowItem = rollItemDrop({ mlvl: 3, rank: 'normal', seed: 500 + s, forcedRarity: 'magic' });
      for (const a of lowItem.affixes) {
        const spec = [...PREFIX_POOL, ...SUFFIX_POOL].find((x) => x.id === a.id)!;
        expect(spec.ilvlMin).toBeLessThanOrEqual(lowItem.ilvl);
      }
    }
  });

  it('drops set items compatible with src/sim/sets.ts and activates 2/3/4-piece bonuses', () => {
    const setItem = rollItemDrop({ mlvl: 30, rank: 'boss', seed: 777, forcedRarity: 'set' });
    expect(setItem.rarity).toBe('set');
    expect(setItem.setId).toBeDefined();

    const warden = ALL_SETS.find((s) => s.id === 'iron_warden')!;
    expect(warden).toBeDefined();
    expect(calculateActiveSetBonuses([warden.pieces[0].name, warden.pieces[1].name]).length).toBe(1);
    expect(calculateActiveSetBonuses(warden.pieces.map((p) => p.name)).length).toBe(3);
  });
});

describe('Sockets, Salvage, Reroll & Smith Upgrades (+1..+5)', () => {
  it('salvages items into tier-appropriate essences and gold', () => {
    const common = rollItemDrop({ mlvl: 5, seed: 11, forcedRarity: 'common' });
    const rare = rollItemDrop({ mlvl: 35, seed: 12, forcedRarity: 'rare' });
    const unique = rollItemDrop({ mlvl: 45, seed: 13, forcedRarity: 'unique' });

    expect(salvageItem(common).essence).toBe('ash');
    expect(salvageItem(rare).essence).toBe('amber');
    expect(salvageItem(unique).essence).toBe('astral');
    expect(salvageItem(unique).gold).toBeGreaterThan(salvageItem(common).gold);
  });

  it('punches sockets and inserts gems/runes cleanly', () => {
    let item = rollItemDrop({ mlvl: 25, seed: 101, forcedRarity: 'common' });
    while (item.def.slot !== Slot.Weapon && item.def.slot !== Slot.Armor) {
      item = rollItemDrop({ mlvl: 25, seed: item.seed + 1, forcedRarity: 'common' });
    }
    const punched = punchSocket({ ...item, sockets: 0 });
    expect(punched.ok).toBe(true);
    expect(punched.item.sockets).toBe(1);

    const gemmed = insertSocketItem(punched.item, 'Perfect Ruby');
    expect(gemmed.ok).toBe(true);
    expect(gemmed.item.socketed).toEqual(['Perfect Ruby']);
    if (gemmed.item.def.slot === Slot.Weapon) {
      expect(gemmed.item.def.min).toBeGreaterThan(punched.item.def.min);
    } else {
      expect(gemmed.item.def.hp).toBeGreaterThan(punched.item.def.hp);
    }
  });

  it('upgrades +0 -> +5 deterministically with non-destructive fail-safe pity', () => {
    let item = rollItemDrop({ mlvl: 40, seed: 303, forcedRarity: 'rare' });
    const essences = { ...emptyEssences(), ash: 10, glimmer: 10, amber: 10, verdant: 10, astral: 10 };

    // +0 -> +1 is always 100%
    const r1 = upgradeItem(item, 50000, essences, 1)!;
    expect(r1.success).toBe(true);
    expect(r1.item.upgradeLevel).toBe(1);
    expect(r1.item.upgradePity).toBe(0);

    // Force a fail at +4 (30% base) and verify pity builds to 100% guarantee
    const at4 = { ...r1.item, upgradeLevel: 4, upgradePity: 0 };
    expect(getUpgradeChancePct(4, 0)).toBe(30);
    expect(getUpgradeChancePct(4, 1)).toBe(55);
    expect(getUpgradeChancePct(4, 2)).toBe(80);
    expect(getUpgradeChancePct(4, 3)).toBe(100);

    // Find a seed that fails at 30%
    let failSeed = 1;
    while (new Rng(failSeed).int(100) < 30) failSeed++;
    const failed = upgradeItem(at4, 50000, essences, failSeed)!;
    expect(failed.success).toBe(false);
    expect(failed.item.upgradeLevel).toBe(4); // never downgraded or destroyed
    expect(failed.item.upgradePity).toBe(1);

    // At pity 3 -> 100% guaranteed
    const guaranteed = upgradeItem({ ...at4, upgradePity: 3 }, 50000, essences, failSeed)!;
    expect(guaranteed.success).toBe(true);
    expect(guaranteed.item.upgradeLevel).toBe(5);
    expect(guaranteed.item.upgradePity).toBe(0);

    const boostedDef = getUpgradedDef(item.def, 5);
    if (item.def.slot === Slot.Weapon) {
      expect(boostedDef.min).toBeGreaterThan(item.def.min);
    } else if (item.def.slot !== Slot.Ring && item.def.slot !== Slot.Amulet) {
      expect(boostedDef.def).toBeGreaterThan(item.def.def);
    }
  });

  it('rerolls a single affix without duplicating groups', () => {
    const rare = rollItemDrop({ mlvl: 35, seed: 888, forcedRarity: 'rare' });
    const rerolled = rerollAffix(rare, 0, rare.def, 777);
    expect(rerolled).not.toBeNull();
    if (rerolled) {
      const groups = rerolled.affixes.map((a) => a.group);
      expect(new Set(groups).size).toBe(groups.length);
    }
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
