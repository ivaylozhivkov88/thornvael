import { describe, expect, it } from 'vitest';
import {
  calculateHitChance,
  shouldTriggerFlinch,
  getFHRDurationFrames,
  getFHRDurationTicks,
  getFCRFrames,
  getFCRCastCooldown,
  getIASAttackCooldown,
  calculateEffectiveResistance,
  getDifficultyResistPenalty,
  calculateCrushingBlowDamage,
  calculateDeadlyStrike,
  calculateOpenWoundsDamage,
  calculateLeechAmount,
  calculateKnockback,
  calculateEffectiveMFTable,
  calculateBlockChance,
  combineCritChance,
  mitigateDamage,
} from '../src/sim/mechanics';
import {
  ALL_RUNES,
  getRuneById,
  getRuneByName,
  matchRuneword,
} from '../src/sim/runes';
import { transmuteCube } from '../src/sim/cube';
import {
  BASE_ITEMS,
  CHAMPION_TYPES,
  BOSS_AFFIXES,
} from '../src/sim/item-catalog';
import {
  ItemDef,
  Ik,
  Slot,
  socketGem,
} from '../src/sim/items';

describe('ARPG Systems & Item Catalog Architecture Gate', () => {
  describe('1. Combat Mechanics & Breakpoints', () => {
    it('calculates Chance to Hit using exact formula clamped to [5%, 95%]', () => {
      // Hit% = clamp(200 * (AR / (AR + Def)) * (Alvl / (Alvl + Dlvl)), 5%, 95%)
      // Equal AR & Def, equal levels: 200 * (100/200) * (20/40) = 200 * 0.5 * 0.5 = 50%
      expect(calculateHitChance(100, 100, 20, 20)).toBe(50);

      // Higher attacker level gives advantage:
      // 200 * 0.5 * (60 / (60 + 20)) = 100 * 0.75 = 75%
      expect(calculateHitChance(100, 100, 60, 20)).toBe(75);

      // Massive AR advantage clamps at 95%
      expect(calculateHitChance(100000, 10, 80, 20)).toBe(95);

      // Massive Defense advantage clamps at 5%
      expect(calculateHitChance(10, 100000, 10, 80)).toBe(5);

      // Edge case: 0 AR & 0 Def
      expect(calculateHitChance(0, 0, 20, 20)).toBe(50);
    });

    it('determines FHR flinch trigger when taking > 1/12th Max HP', () => {
      const maxHp = 120;
      // 1/12th of 120 is 10. Taking 10 should not flinch, 11 must flinch
      expect(shouldTriggerFlinch(10, maxHp)).toBe(false);
      expect(shouldTriggerFlinch(11, maxHp)).toBe(true);
      expect(shouldTriggerFlinch(50, maxHp)).toBe(true);
      expect(shouldTriggerFlinch(0, maxHp)).toBe(false);
    });

    it('maps FHR (Faster Hit Recovery) frame breakpoints for Warrior and Mage', () => {
      // Warrior (cls 0): 0% -> 9f, 7% -> 8f, 15% -> 7f, 27% -> 6f, 48% -> 5f, 86% -> 4f, 200% -> 3f
      expect(getFHRDurationFrames(0, 0)).toBe(9);
      expect(getFHRDurationFrames(0, 6)).toBe(9);
      expect(getFHRDurationFrames(0, 7)).toBe(8);
      expect(getFHRDurationFrames(0, 15)).toBe(7);
      expect(getFHRDurationFrames(0, 48)).toBe(5);
      expect(getFHRDurationFrames(0, 86)).toBe(4);
      expect(getFHRDurationFrames(0, 200)).toBe(3);

      // Mage (cls 1): 0% -> 15f, 5% -> 14f, 42% -> 9f, 86% -> 7f, 280% -> 5f
      expect(getFHRDurationFrames(1, 0)).toBe(15);
      expect(getFHRDurationFrames(1, 5)).toBe(14);
      expect(getFHRDurationFrames(1, 42)).toBe(9);
      expect(getFHRDurationFrames(1, 86)).toBe(7);
      expect(getFHRDurationFrames(1, 280)).toBe(5);

      // Converts accurately to sim ticks
      expect(getFHRDurationTicks(0, 86)).toBe(3); // 4 frames at 25 fps = ~3.2 ticks -> 3 ticks
    });

    it('maps FCR (Faster Cast Rate) and IAS breakpoints', () => {
      // Mage FCR: 0% -> 13f, 37% -> 10f, 105% -> 8f, 200% -> 7f
      expect(getFCRFrames(1, 0)).toBe(13);
      expect(getFCRFrames(1, 37)).toBe(10);
      expect(getFCRFrames(1, 105)).toBe(8);
      expect(getFCRFrames(1, 200)).toBe(7);

      // Cast cooldown scales with FCR
      const baseCd = 20;
      const cdWithFcr = getFCRCastCooldown(baseCd, 105, 1);
      expect(cdWithFcr).toBeLessThan(baseCd);
      expect(cdWithFcr).toBe(Math.round(20 * (8 / 13)));

      // IAS attack cooldown scales with diminishing returns
      const attackCd = 30;
      const fastAttackCd = getIASAttackCooldown(attackCd, 60);
      expect(fastAttackCd).toBeLessThan(attackCd);
      expect(fastAttackCd).toBeGreaterThanOrEqual(4);
    });

    it('handles Elemental Resistances, Max Resist gear, and Nightmare/Hell penalties', () => {
      expect(getDifficultyResistPenalty(0)).toBe(0);
      expect(getDifficultyResistPenalty(1)).toBe(0);
      expect(getDifficultyResistPenalty(2)).toBe(-40); // Nightmare: -40%
      expect(getDifficultyResistPenalty(3)).toBe(-100); // Hell: -100%

      // Standard cap at 75%
      const normalRes = calculateEffectiveResistance(120, 0, 0);
      expect(normalRes.cap).toBe(75);
      expect(normalRes.effectiveRes).toBe(75);

      // Gear with +10% Max Resist expands cap to 85%
      const expandedRes = calculateEffectiveResistance(120, 10, 0);
      expect(expandedRes.cap).toBe(85);
      expect(expandedRes.effectiveRes).toBe(85);

      // Absolute cap at 95%
      const maxExpanded = calculateEffectiveResistance(120, 30, 0);
      expect(maxExpanded.cap).toBe(95);
      expect(maxExpanded.effectiveRes).toBe(95);

      // Hell difficulty penalty: 60% base resist becomes -40% in Hell
      const hellRes = calculateEffectiveResistance(60, 0, 'hell');
      expect(hellRes.effectiveRes).toBe(-40);
    });

    it('calculates special mechanics: Crushing Blow, Deadly Strike, Open Wounds, Leech, Knockback', () => {
      // Crushing Blow:
      // Melee vs normal: 25% of 1000 HP = 250
      expect(calculateCrushingBlowDamage(1000, false, false, 0)).toBe(250);
      // Ranged vs normal: 12.5% of 1000 HP = 125
      expect(calculateCrushingBlowDamage(1000, true, false, 0)).toBe(125);
      // Melee vs boss: 12.5% of 1000 HP = 125
      expect(calculateCrushingBlowDamage(1000, false, true, 0)).toBe(125);
      // Ranged vs boss: 6.25% of 1000 HP = 62
      expect(calculateCrushingBlowDamage(1000, true, true, 0)).toBe(62);
      // Reduced by 50% physical resistance: 250 * 0.5 = 125
      expect(calculateCrushingBlowDamage(1000, false, false, 50)).toBe(125);

      // Deadly Strike: 100% chance doubles physical damage
      const dsGuaranteed = calculateDeadlyStrike(50, 100, 0);
      expect(dsGuaranteed.isDeadly).toBe(true);
      expect(dsGuaranteed.dmg).toBe(100);
      const dsFailed = calculateDeadlyStrike(50, 20, 50);
      expect(dsFailed.isDeadly).toBe(false);
      expect(dsFailed.dmg).toBe(50);

      // Open Wounds: level-based bleeding
      expect(calculateOpenWoundsDamage(10, 160)).toBeGreaterThan(0);
      expect(calculateOpenWoundsDamage(50, 160)).toBeGreaterThan(calculateOpenWoundsDamage(10, 160));

      // Life Steal / Mana Steal with difficulty penalties (1/1 normal, 1/2 nightmare, 1/3 hell)
      expect(calculateLeechAmount(100, 10, 'normal')).toBe(10);
      expect(calculateLeechAmount(100, 10, 'nightmare')).toBe(5);
      expect(calculateLeechAmount(100, 10, 'hell')).toBe(3);
      // Target with 0% drain effectiveness (e.g. skeleton)
      expect(calculateLeechAmount(100, 10, 'normal', 0)).toBe(0);

      // Knockback calculates 2D displacement away from attacker
      const kb = calculateKnockback(100, 100, 110, 100, 20);
      expect(kb.x).toBe(130);
      expect(kb.y).toBe(100);
    });

    it('computes Magic Find (MF) with diminishing returns', () => {
      // EMF_Unique = (MF * 250) / (MF + 250)
      // EMF_Set = (MF * 500) / (MF + 500)
      // EMF_Rare = (MF * 600) / (MF + 600)
      // EMF_Magic = MF (linear)
      const mf0 = calculateEffectiveMFTable(0);
      expect(mf0).toEqual({ unique: 0, set: 0, rare: 0, magic: 0 });

      const mf250 = calculateEffectiveMFTable(250);
      expect(mf250.unique).toBe(125); // (250 * 250) / 500 = 125
      expect(mf250.magic).toBe(250);

      const mf500 = calculateEffectiveMFTable(500);
      expect(mf500.unique).toBe(167); // 166.6 rounds to 167
      expect(mf500.set).toBe(250); // (500 * 500) / 1000 = 250
      expect(mf500.rare).toBe(273); // 272.7 rounds to 273
      expect(mf500.magic).toBe(500);
    });
  });

  describe('2. Itemization & Runes Database', () => {
    it('defines base items with subtypes, run penalties, and belt slot capacity', () => {
      expect(BASE_ITEMS.length).toBeGreaterThanOrEqual(30);

      const lightArmor = BASE_ITEMS.find((b) => b.id === 'quilted_armor');
      const medArmor = BASE_ITEMS.find((b) => b.id === 'chain_mail');
      const heavyArmor = BASE_ITEMS.find((b) => b.id === 'sacred_armor');

      expect(lightArmor?.runSpeedPenalty).toBe(0);
      expect(medArmor?.runSpeedPenalty).toBe(-5);
      expect(heavyArmor?.runSpeedPenalty).toBe(-10);

      const sash = BASE_ITEMS.find((b) => b.id === 'sash');
      const warBelt = BASE_ITEMS.find((b) => b.id === 'plated_belt');
      expect(sash?.beltSlots).toBe(4);
      expect(warBelt?.beltSlots).toBe(16);
    });

    it('contains all 33 runes (Eldun to Zodar) with exact properties', () => {
      expect(ALL_RUNES.length).toBe(33);

      const el = getRuneById(1);
      const zod = getRuneById(33);
      const ber = getRuneByName('beran');
      const jah = getRuneByName('jahkar');

      expect(el?.name).toBe('Rune of Eldun');
      expect(zod?.name).toBe('Rune of Zodar');
      expect(ber?.name).toBe('Rune of Beran');
      expect(ber?.weaponBonus.crushingBlow).toBe(20);
      expect(jah?.name).toBe('Rune of Jahkar');
      expect(jah?.weaponBonus.ignoreDef).toBe(true);
    });

    it('sockets runes into weapons, shields, and armors with distinct bonuses', () => {
      const baseSword: ItemDef = {
        name: 'Broad Sword',
        kind: Ik.Gear,
        slot: Slot.Weapon,
        tier: 2,
        w: 4,
        cls: 3,
        need: 0,
        needv: 0,
        min: 7,
        max: 14,
        acc: 5,
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
        sockets: 4,
        socketedGems: [],
      };

      const amnRune: ItemDef = {
        name: 'Rune of Amnir',
        kind: Ik.Gem,
        slot: -1,
        tier: 3,
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

      const socketed = socketGem(baseSword, amnRune);
      expect(socketed.socketedGems).toContain('Rune of Amnir');
      expect(socketed.lifesteal).toBe(7); // Amnir provides 7% life steal in weapons
    });

    it('assembles runewords: Shadow Veil and Aether Spirit', () => {
      // 1. Shadow Veil in Armor: Talgor + Aeth
      const armorBase: ItemDef = {
        name: 'Breast Plate',
        kind: Ik.Gear,
        slot: Slot.Armor,
        tier: 2,
        w: 5,
        cls: 3,
        need: 0,
        needv: 0,
        min: 0,
        max: 0,
        acc: 0,
        cover: 2,
        def: 25,
        abs: 2,
        res: [0, 0, 0, 0, 0],
        attr: [0, 0, 0, 0],
        hp: 0,
        mana: 0,
        pow: 0,
        heal: 0,
        restore: 0,
        grow: 0,
        spell: -1,
        sockets: 2,
        socketedGems: [],
      };

      const talRune = { name: 'Rune of Talgor', kind: Ik.Gem } as ItemDef;
      const ethRune = { name: 'Rune of Aeth', kind: Ik.Gem } as ItemDef;

      const step1 = socketGem(armorBase, talRune);
      expect(step1.name).toBe('Breast Plate'); // Incomplete
      const stealth = socketGem(step1, ethRune);
      expect(stealth.name).toContain('Shadow Veil'); // Stealth Thornvael lore name
      expect(stealth.rarity).toBe('unique');
      expect(stealth.def).toBeGreaterThan(25);

      // 2. Aether Spirit in Sword: Talgor + Thulor + Orthan + Amnir (4 sockets)
      const swordBase: ItemDef = {
        name: 'Crystal Sword',
        kind: Ik.Gear,
        slot: Slot.Weapon,
        tier: 2,
        w: 3,
        cls: 3,
        need: 0,
        needv: 0,
        min: 5,
        max: 15,
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
        sockets: 4,
        socketedGems: [],
      };

      const thulRune = { name: 'Rune of Thulor', kind: Ik.Gem } as ItemDef;
      const ortRune = { name: 'Rune of Orthan', kind: Ik.Gem } as ItemDef;
      const amnRune = { name: 'Rune of Amnir', kind: Ik.Gem } as ItemDef;

      let sword = socketGem(swordBase, talRune);
      sword = socketGem(sword, thulRune);
      sword = socketGem(sword, ortRune);
      sword = socketGem(sword, amnRune);

      expect(sword.name).toContain('Aether Spirit'); // Spirit Runeword
      expect(sword.mana).toBeGreaterThanOrEqual(100);
      expect(sword.pow).toBeGreaterThanOrEqual(25);
    });

    it('rejects runewords if socketed in the wrong order or on an invalid slot', () => {
      // Ort + Tal in Shield (invalid: should be Ralon + Orthan + Talgor for Oath of the Ancestors)
      const matched = matchRuneword(Slot.Shield, ['Rune of Orthan', 'Rune of Talgor']);
      expect(matched).toBeNull();

      // Stealth runes socketed in a Weapon (invalid slot: Shadow Veil is Armor only)
      const invalidSlotRw = matchRuneword(Slot.Weapon, ['Rune of Talgor', 'Rune of Aeth']);
      expect(invalidSlotRw).toBeNull();
    });
  });

  describe('3. Reliquary Forge Transmutation Engine', () => {
    it('transmutes 3 identical gems to 1 higher quality gem', () => {
      const chippedRubies: ItemDef[] = Array(3).fill(null).map(() => ({
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
      }));

      const res = transmuteCube(chippedRubies);
      expect(res).not.toBeNull();
      expect(res?.result.name).toBe('Flawed Ruby');
    });

    it('upgrades runes according to Reliquary Forge progression recipes', () => {
      // 1. Lower runes: 3 Eldun -> 1 Elvar (no gem required)
      const threeEls: ItemDef[] = Array(3).fill(null).map(() => ({
        name: 'Rune of Eldun', // El
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
      }));

      const eldRes = transmuteCube(threeEls);
      expect(eldRes).not.toBeNull();
      expect(eldRes?.result.name).toBe('Rune of Elvar'); // Eld

      // 2. Mid runes: 3 Thulor + Chipped Topaz -> 1 Amnir
      const threeThuls: ItemDef[] = Array(3).fill(null).map(() => ({
        name: 'Rune of Thulor', // Thul
        kind: Ik.Gem,
        slot: -1,
        tier: 2,
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
      }));
      const chippedTopaz: ItemDef = {
        name: 'Chipped Topaz',
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

      const amnRes = transmuteCube([...threeThuls, chippedTopaz]);
      expect(amnRes).not.toBeNull();
      expect(amnRes?.result.name).toBe('Rune of Amnir'); // Amn
    });

    it('synthesizes Rejuvenation Potions and Full Rejuvenation Potions', () => {
      const healPot: ItemDef = {
        name: 'Healing Draught',
        kind: Ik.Potion,
        slot: -1,
        tier: 1,
        w: 1,
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
        heal: 40,
        restore: 0,
        grow: 0,
        spell: -1,
      };
      const manaPot: ItemDef = {
        name: 'Mana Draught',
        kind: Ik.Potion,
        slot: -1,
        tier: 1,
        w: 1,
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
        restore: 35,
        grow: 0,
        spell: -1,
      };
      const chippedGem: ItemDef = {
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

      const rejuvRes = transmuteCube([
        healPot, healPot, healPot,
        manaPot, manaPot, manaPot,
        chippedGem,
      ]);

      expect(rejuvRes).not.toBeNull();
      expect(rejuvRes?.result.name).toBe('Rejuvenation Potion');

      // 3 Rejuvenation Potions -> Full Rejuvenation Potion
      const threeRejuvs = Array(3).fill(rejuvRes!.result);
      const fullRejuvRes = transmuteCube(threeRejuvs);
      expect(fullRejuvRes).not.toBeNull();
      expect(fullRejuvRes?.result.name).toBe('Full Rejuvenation Potion');
      expect(fullRejuvRes?.result.heal).toBeGreaterThanOrEqual(9999);
    });

    it('un-sockets items using Rune of Helva and Scroll of Town Portal', () => {
      const socketedArmor: ItemDef = {
        name: 'Shadow Veil (Breast Plate)',
        kind: Ik.Gear,
        slot: Slot.Armor,
        tier: 2,
        w: 5,
        cls: 3,
        need: 0,
        needv: 0,
        min: 0,
        max: 0,
        acc: 0,
        cover: 2,
        def: 40,
        abs: 2,
        res: [0, 0, 0, 30, 0],
        attr: [0, 0, 0, 0],
        hp: 0,
        mana: 15,
        pow: 0,
        heal: 0,
        restore: 0,
        grow: 0,
        spell: -1,
        sockets: 2,
        socketedGems: ['Rune of Talgor', 'Rune of Aeth'],
      };

      const helRune: ItemDef = {
        name: 'Rune of Helva', // Hel
        kind: Ik.Gem,
        slot: -1,
        tier: 3,
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

      const tpScroll: ItemDef = {
        name: 'Scroll of Town Portal',
        kind: Ik.Portal,
        slot: -1,
        tier: 1,
        w: 1,
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

      const cleared = transmuteCube([socketedArmor, helRune, tpScroll]);
      expect(cleared).not.toBeNull();
      expect(cleared?.result.socketedGems).toEqual([]);
      expect(cleared?.result.name).toBe('Breast Plate');
    });

    it('creates crafted Blood and Caster items with fixed and procedural affixes', () => {
      const magicAmulet: ItemDef = {
        name: 'Amulet of the Mind',
        kind: Ik.Gear,
        slot: Slot.Amulet,
        tier: 3,
        w: 1,
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
        attr: [0, 0, 2, 0],
        hp: 0,
        mana: 10,
        pow: 5,
        heal: 0,
        restore: 0,
        grow: 0,
        spell: -1,
        rarity: 'magic',
      };

      const ralRune: ItemDef = {
        name: 'Rune of Ralon',
        kind: Ik.Gem,
        slot: -1,
        tier: 2,
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

      const perfAmethyst: ItemDef = {
        name: 'Perfect Amethyst',
        kind: Ik.Gem,
        slot: -1,
        tier: 5,
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

      const jewelOrGem: ItemDef = {
        name: 'Topaz',
        kind: Ik.Gem,
        slot: -1,
        tier: 3,
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

      const craftRes = transmuteCube([magicAmulet, ralRune, perfAmethyst, jewelOrGem]);
      expect(craftRes).not.toBeNull();
      expect(craftRes?.result.rarity).toBe('crafted');
      expect(craftRes?.result.name).toContain('Crafted Caster Amulet');
      expect(craftRes?.result.pow).toBeGreaterThan(magicAmulet.pow);
      expect(craftRes?.result.mana).toBeGreaterThan(magicAmulet.mana);
    });
  });

  describe('4. Monster Elites, Champions & Affixes', () => {
    it('defines distinct champion pack stat multipliers', () => {
      expect(CHAMPION_TYPES.champion.hpMult).toBe(3.0);
      expect(CHAMPION_TYPES.berserker.dmgMult).toBe(3.0);
      expect(CHAMPION_TYPES.berserker.defMult).toBe(0.5);
      expect(CHAMPION_TYPES.possessed.immuneToCurse).toBe(true);
      expect(CHAMPION_TYPES.fanatic.speedMult).toBe(2.0);
      expect(CHAMPION_TYPES.ghostly.physicalRes).toBe(50);
    });

    it('contains all 12 iconic boss affixes with distinct combat mechanics', () => {
      expect(BOSS_AFFIXES.length).toBe(12);

      const affixIds = BOSS_AFFIXES.map((a) => a.id);
      expect(affixIds).toContain('lightning_enchanted');
      expect(affixIds).toContain('cold_enchanted');
      expect(affixIds).toContain('fire_enchanted');
      expect(affixIds).toContain('stone_skin');
      expect(affixIds).toContain('extra_fast');
      expect(affixIds).toContain('extra_strong');
      expect(affixIds).toContain('mana_burn');
      expect(affixIds).toContain('cursed');
      expect(affixIds).toContain('teleporting');
      expect(affixIds).toContain('spectral_hit');
    });
  });
});

describe('reference-checked combat numbers', () => {
  it('block: floor(shield*(dex-15)/(clvl*2)) capped at 75, running thirds it', () => {
    expect(calculateBlockChance(30, 0, 55, 30)).toBe(20);
    expect(calculateBlockChance(30, 0, 15, 30)).toBe(0);
    expect(calculateBlockChance(0, 50, 200, 10)).toBe(0);
    expect(calculateBlockChance(80, 50, 300, 10)).toBe(75);
    expect(calculateBlockChance(80, 50, 300, 10, true)).toBe(25);
  });
  it('crit sources combine multiplicatively', () => {
    expect(combineCritChance(50, 50)).toBe(75);
    expect(combineCritChance(0)).toBe(0);
    expect(combineCritChance(100, 30)).toBe(100);
  });
  it('mitigation order: flat, resist, absorb%, absorb flat', () => {
    expect(mitigateDamage(1000, { resist: 50, absorbPct: 50, absorbFlat: 20 })).toBe(280);
    expect(mitigateDamage(1000, { resist: 90 })).toBe(100);
    expect(mitigateDamage(1000, { resist: 80 })).toBe(200);
    expect(mitigateDamage(1000, { resist: 90, isPhysical: true })).toBe(500);
  });
});
