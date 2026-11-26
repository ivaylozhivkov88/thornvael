import { isBlockedAt } from '../map';
import { allocateSkill, computePassiveBonuses, createSkillTreeState } from '../skills/engine';
import type { SkillClass } from '../skills/types';
import { STAMINA_DRAIN, STAMINA_REGEN_IDLE, STAMINA_REGEN_WALK, calculateEffectiveMFTable, staminaMax, staminaResumeAt } from './mechanics';
import { DEFS, Elem, M, MODN, Ord, MAXS, hashStr, strike } from './combat';
import { rulesOf } from './difficulty';
import { getDifficultyCalibration } from './balance';
import { ATTR_NAMES, BUILTIN_GEMS, CLS_MAGE, CLS_WARRIOR, Cls, kitCls, Ik, LOOT_RULES, PART_COUNT, SIGIL_NAMES, SLOT_COUNT, Slot, WRIT_NAME, getItemDef, getUnidentifiedName, itemId, rollLoot, type ItemDef } from './items';
import { calculateActiveSetBonuses, ALL_SET_ITEMS, COMBINED_SET_ITEMS } from './sets';
import { ALL_UNIQUE_ARTIFACTS, UNIQUE_ARTIFACTS, rollMagicItem, rollRareItem } from './affixes';
import { ALL_RUNES } from './runes';
import { KNOWN_HI, MAX_SPELLS, SPELLS, St, maskHas } from './spelldata';
import { addStatus, clearAllStatuses } from './spells';
import { FP, dir16, safeSlideTo } from './path';
import type { Sim } from './sim';

/** The hero: attributes, skills that grow with use, pack and equipment. All integer, all inside the sim, all changed through commands. */

export const INV_MAX = 24;
export const SKILL_NAMES = ['Blade', 'Guard', 'Sorcery'] as const;
export const SKILL_MAX = 10;
export const SKILL_TIP = ['+5% blow damage per level. Grows with blows struck.', '+1 absorb per 3 levels. Grows with blows taken.', '+4% spell power per level. Grows with spells cast.'] as const;
export const DIFF_NAMES = ['Easy', 'Medium', 'Hard', 'Hell'] as const;
export const FOE_PCT = [75, 100, 150, 220] as const;
const START_DRAUGHTS = [3, 2, 1, 1] as const;
const BASE_ATTR: readonly (readonly number[])[] = [
  [8, 6, 3, 4], // Warrior: Body, Agility, Mind, Spirit
  [4, 5, 9, 6], // Mage
];

export interface Stack {
  item: number;
  n: number;
}

export type HeroSkillId =
  | 'whirlwind'
  | 'shield_charge'
  | 'iron_bulwark'
  | 'chain_lightning'
  | 'frost_nova'
  | 'teleport'
  | 'barbed_volley'
  | 'weir_snares'
  | 'gale_pin'
  | 'grave_chill'
  | 'quicklime_cloud'
  | 'bone_splinter';

export interface HeroState {
  id: number;
  cls: number;
  female: boolean;
  diff: number;
  attr: number[]; // base attributes, raised by elixirs or stat points
  skill: number[]; // Blade, Guard, Sorcery levels
  use: number[]; // uses towards the next level
  inv: Stack[];
  eq: number[]; // item id per slot, -1 when empty
  known: number; // spells 0-31 learned (bit mask)
  knownHi?: number[]; // KNOWN_HI words for spell ids 32-95; old saves lack it
  hits: number[]; // blows taken on head, torso, arms, legs since the last upkeep; old saves lack it
  mf?: number; // magic find %
  level?: number;
  xp?: number;
  xpNext?: number;
  statPoints?: number;
  skillPoints?: number;
  /** Rank per spell id (0..MAX_SPELL_RANK); each rank adds SPELL_RANK_POW % power. Spends skill points. */
  spellRank?: number[];
  skillCd?: Record<string, number>;
  classSkills?: Record<string, number>;
  name?: string;
  activeAura?: string;
  /** Run toggle (absent = walking, old saves). */
  running?: boolean;
  /** Current stamina; absent = full. */
  stamina?: number;
  /** Pinnacle Writ used: the vault is open. */
  pinnacle?: boolean;
}

export const MAX_SPELL_RANK = 10;
/** Extra spell power percent per rank. */
export const SPELL_RANK_POW = 8;
/** True when the hero has learned spell `sid`. */
export function heroKnowsSpell(h: HeroState, sid: number): boolean {
  return maskHas(h.known, h.knownHi, 0, sid);
}

/** Learn spell `sid` (any id below MAX_SPELLS). */
export function learnSpell(h: HeroState, sid: number): void {
  if (sid < 32) h.known |= 1 << sid;
  else {
    h.knownHi = h.knownHi ?? Array<number>(KNOWN_HI).fill(0);
    h.knownHi[(sid - 32) >>> 5] = (h.knownHi[(sid - 32) >>> 5] | (1 << (sid & 31))) >>> 0;
  }
}

/** Class mask of a spell: 0 for any hero, else bit 1<<cls (0 warrior, 1 mage, 2 archer, 3 necromancer). */
export function spellForHero(h: HeroState, sid: number): boolean {
  const m = SPELLS[sid]?.cls ?? 0;
  return m === 0 || (m & ((1 << h.cls) | (1 << kitCls(h.cls)))) !== 0;
}

export function spellRankOf(h: HeroState | null, sid: number): number {
  return h?.spellRank?.[sid] ?? 0;
}

/** To raise a spell's rank the hero needs rank 1 in its prerequisite spell (spell id -> prerequisite id). */
export const SPELL_PREREQ: Readonly<Record<number, number>> = {
  1: 0, 2: 0, 3: 0, 24: 1, 25: 2, 5: 4, 6: 4, 26: 5, 8: 7, 10: 9, 12: 9, 27: 10, 13: 11,
  15: 14, 17: 14, 18: 14, 29: 17, 28: 16, 21: 19, 22: 20, 30: 20, 31: 23,
};
/** Each rank in a source spell adds SPELL_SYNERGY_POW % power to the target spell. */
export const SPELL_SYNERGY: Readonly<Record<number, readonly number[]>> = {
  0: [1, 3, 24], 1: [0, 2], 2: [1, 25], 24: [1, 0], 25: [2, 3],
  4: [5, 6], 5: [4, 26], 6: [4, 5], 26: [5, 4],
  9: [10, 12], 10: [9, 27], 27: [10, 9],
  14: [18, 29], 18: [14, 17], 17: [29, 14], 29: [17, 18],
  19: [16, 7], 7: [8, 19], 8: [7], 20: [22, 30], 22: [20, 21],
};
export const SPELL_SYNERGY_POW = 4;
export function spellSynergy(h: HeroState | null, sid: number): number {
  let n = 0;
  for (const src of SPELL_SYNERGY[sid] ?? []) n += spellRankOf(h, src);
  return n * SPELL_SYNERGY_POW;
}
export function spellPrereqMet(h: HeroState | null, sid: number): boolean {
  const need = SPELL_PREREQ[sid];
  return need === undefined || spellRankOf(h, need) >= 1;
}

/** Gold to copy a spell from a scroll or tome into the spellbook. */
export const scribeFee = (tier: number): number => 15 * tier;

/** Hero commands go through the command log. */
export type HeroCommand =
  | { type: 'hero'; op: 'equip' | 'unequip' | 'use' | 'drop'; item?: number; slot?: number; expectedEquipment?: string }
  | { type: 'hero'; op: 'stat'; attr: number }
  | { type: 'hero'; op: 'rank'; spell: number }
  | { type: 'hero'; op: 'run'; on: boolean }
  | { type: 'hero'; op: 'skill'; skill: HeroSkillId; x?: number; y?: number; target?: number }
  | { type: 'hero'; op: 'aura'; aura?: string }
  | { type: 'hero'; op: 'class_skill'; skillId: string };

export type EquipmentAction = { op: 'equip'; item: number } | { op: 'unequip'; slot: number };

/**
 * Optional queued equipment precondition, not persistent state or an item-copy UID.
 * Equip observes the incoming type's pack count and destination; unequip observes only its source.
 * Unrelated pack/slot changes and pack reordering stay valid. Requirements/capacity are checked live.
 */
export function equipmentStamp(h: HeroState, action: EquipmentAction): string {
  const identity = [h.id, h.cls, h.female];
  if (action.op === 'unequip') return JSON.stringify([identity, action.op, action.slot, h.eq[action.slot]]);
  const slot = getItemDef(action.item)?.slot ?? -1;
  let count = 0;
  for (const stack of h.inv) if (stack.item === action.item) count += stack.n;
  return JSON.stringify([identity, action.op, action.item, count, slot, h.eq[slot]]);
}

/** Why an action was refused (fx type 15, v = reason). */
export const Why = { Class: 1, Need: 2, Known: 3, Full: 4, Heavy: 5, Dead: 6, None: 7, NoEffect: 8, Gold: 9, Far: 10, Busy: 11, Unidentified: 12, Tired: 13 } as const;
export const WHY_TEXT = ['', 'Wrong class for this item.', 'Attribute too low for this item.', 'You already know that spell.', 'The pack is full.', 'Too heavy to carry.', 'The hero has fallen.', 'You do not have that.', 'It would have no effect now.', 'Not enough gold.', 'Walk closer to go in.', 'You already carry three quests.', 'Item must be identified before equipping.', 'Too winded to run.'] as const;
/** Item events (fx type 14, v = item id, el = what happened). */
export const Did = { Pick: 0, Equip: 1, Use: 2, Learn: 3, Drop: 4, Unequip: 5 } as const;

export const skillNeed = (level: number): number => 8 * (level + 1);
export const capacityOf = (body: number): number => 20 + 4 * body;

export function equippedNames(h: HeroState): string[] {
  const names: string[] = [];
  for (const id of h.eq) {
    if (id >= 0) {
      const d = getItemDef(id);
      if (d) names.push(d.name);
    }
  }
  return names;
}

/** Attributes with the bonuses of everything worn. */
export function totals(h: HeroState): number[] {
  const t = h.attr.slice();
  for (const id of h.eq) {
    if (id < 0) continue;
    const d = getItemDef(id);
    if (!d) continue;
    const a = d.attr;
    for (let k = 0; k < 4; k++) t[k] += a[k];
  }
  const bonuses = calculateActiveSetBonuses(equippedNames(h));
  for (const b of bonuses) {
    if (b.attr) {
      for (let k = 0; k < 4; k++) t[k] += b.attr[k];
    }
  }
  // Charms carried in inventory passively grant attribute bonuses (D2 system)
  for (const s of h.inv) {
    if (s.item < 0) continue;
    const d = getItemDef(s.item);
    if (!d || !d.charmSize) continue;
    for (let count = 0; count < s.n; count++) {
      for (let k = 0; k < 4; k++) t[k] += d.attr[k];
    }
  }
  return t;
}

export function weightOf(h: HeroState): number {
  let w = 0;
  for (const s of h.inv) {
    const d = getItemDef(s.item);
    if (d) w += d.w * s.n;
  }
  for (const id of h.eq) {
    if (id >= 0) {
      const d = getItemDef(id);
      if (d) w += d.w;
    }
  }
  return w;
}

export interface Derived {
  attr: number[];
  hpMax: number;
  manaMax: number;
  min: number;
  max: number;
  acc: number;
  def: number; // dodge, on every part
  abs: number; // absorb on every part (Guard skill)
  pdef: number[]; // armour per body part: head, torso, arms, legs
  pabs: number[];
  res: number[];
  pow: number;
  regen: number;
  capacity: number;
  weight: number;
  ias: number;
  fcr: number;
  fhr: number;
  manasteal: number;
  lifesteal: number;
  crushingBlow: number;
  deadlyStrike: number;
  openWounds: number;
  cannotBeFrozen: boolean;
  maxRes: readonly [number, number, number, number, number];
  crit: number;
  armorPen: number;
}

function skillClassOf(cls: number): SkillClass {
  if (cls === 1) return 'mage';
  if (cls === 2) return 'archer';
  if (cls === 3) return 'necromancer';
  return 'warrior';
}

/** Everything the gear, attributes and skills add up to. The sim copies these into the per-unit arrays. */
export function derive(h: HeroState): Derived {
  const t = totals(h);
  const base = DEFS[2]; // Hero
  let min = 0;
  let max = 0;
  let acc = 0;
  let pow = 0;
  let hp = 0;
  let mana = 0;
  let extraDef = 0;
  let extraAbs = 0;
  let extraRegen = 0;
  let ias = 0;
  let fcr = 0;
  let fhr = 0;
  let manasteal = 0;
  let lifesteal = 0;
  let crushingBlow = 0;
  let deadlyStrike = 0;
  let openWounds = 0;
  let cannotBeFrozen = false;
  const maxRes: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let crit = 0;
  let armorPen = 0;
  const res = [0, 0, 0, 0, 0];
  const pdef = [0, 0, 0, 0];
  const pabs = [0, 0, 0, 0];
  for (const id of h.eq) {
    if (id < 0) continue;
    const d = getItemDef(id);
    if (!d) continue;
    min += d.min;
    max += d.max;
    acc += d.acc;
    if (d.cover === 0) {
      extraDef += d.def;
      extraAbs += d.abs;
    } else {
      for (let k = 0; k < PART_COUNT; k++) {
        if (((d.cover >> k) & 1) === 0) continue;
        pdef[k] += d.def;
        pabs[k] += d.abs;
      }
    }
    pow += d.pow;
    hp += d.hp;
    mana += d.mana;
    ias += d.ias ?? 0;
    fcr += d.fcr ?? 0;
    fhr += d.fhr ?? 0;
    manasteal += d.manasteal ?? 0;
    lifesteal += d.lifesteal ?? 0;
    crushingBlow += d.crushingBlow ?? 0;
    deadlyStrike += d.deadlyStrike ?? 0;
    openWounds += d.openWounds ?? 0;
    if (d.cannotBeFrozen) cannotBeFrozen = true;
    if (d.maxRes) for (let k = 0; k < 5; k++) maxRes[k] += d.maxRes[k];
    crit += d.crit ?? 0;
    for (let k = 0; k < 5; k++) res[k] += d.res[k];
  }
  const bonuses = calculateActiveSetBonuses(equippedNames(h));
  for (const b of bonuses) {
    if (b.hp) hp += b.hp;
    if (b.mana) mana += b.mana;
    if (b.min) min += b.min;
    if (b.max) max += b.max;
    if (b.acc) acc += b.acc;
    if (b.def !== undefined) {
      for (let k = 0; k < PART_COUNT; k++) pdef[k] += b.def;
    }
    if ((b as { pdef?: readonly number[] }).pdef) {
      for (let k = 0; k < PART_COUNT; k++) pdef[k] += (b as { pdef?: readonly number[] }).pdef![k] ?? 0;
    }
    if (b.abs !== undefined) {
      for (let k = 0; k < PART_COUNT; k++) pabs[k] += b.abs;
    }
    if ((b as { pabs?: readonly number[] }).pabs) {
      for (let k = 0; k < PART_COUNT; k++) pabs[k] += (b as { pabs?: readonly number[] }).pabs![k] ?? 0;
    }
    if (b.pow) pow += b.pow;
    if (b.res) {
      for (let k = 0; k < 5; k++) res[k] += b.res[k];
    }
    if (b.ias) ias += b.ias;
    if (b.fcr) fcr += b.fcr;
    if (b.crit) crit += b.crit;
    if (b.lifesteal) lifesteal += b.lifesteal;
    if (b.armorPen) armorPen += b.armorPen;
    if (b.regen) extraRegen += b.regen;
  }
  // Charms carried in inventory passively grant combat bonuses (D2 system)
  for (const s of h.inv) {
    if (s.item < 0) continue;
    const d = getItemDef(s.item);
    if (!d || !d.charmSize) continue;
    for (let count = 0; count < s.n; count++) {
      min += d.min;
      max += d.max;
      acc += d.acc;
      hp += d.hp;
      mana += d.mana;
      pow += d.pow;
      ias += d.ias ?? 0;
      fcr += d.fcr ?? 0;
      fhr += d.fhr ?? 0;
      manasteal += d.manasteal ?? 0;
      lifesteal += d.lifesteal ?? 0;
      crushingBlow += d.crushingBlow ?? 0;
      deadlyStrike += d.deadlyStrike ?? 0;
      openWounds += d.openWounds ?? 0;
      if (d.cannotBeFrozen) cannotBeFrozen = true;
      if (d.maxRes) for (let k = 0; k < 5; k++) maxRes[k] += d.maxRes[k];
      crit += d.crit ?? 0;
      for (let k = 0; k < 5; k++) res[k] += d.res[k];
      for (let k = 0; k < PART_COUNT; k++) pdef[k] += d.def;
    }
  }
  const [blade, guard, sorc] = h.skill;
  const mage = kitCls(h.cls) === Cls.Mage;
  let dmgMin = min + (t[0] >> 1) + Math.floor((base.min * blade * 5) / 100) - (mage ? 4 : 0);
  let dmgMax = max + (t[0] >> 1) + Math.floor((base.max * blade * 5) / 100) - (mage ? 6 : 0);
  let extraAcc = 0;
  if (h.classSkills) {
    const passives = computePassiveBonuses(createSkillTreeState(skillClassOf(h.cls), h.level ?? 1, h.classSkills));
    extraDef += passives.def;
    extraAbs += passives.abs;
    extraAcc = passives.acc;
    res[0] += passives.fireResPct;
    pow += passives.firePowPct + passives.waterPowPct;
    hp += passives.maxHp;
    mana += passives.maxMana;
    ias += passives.iasPct ?? 0;
    fcr += passives.fcrPct ?? 0;
    crit += passives.critPct ?? 0;
    lifesteal += passives.lifestealPct ?? 0;
    if (passives.meleeDmgPct > 0) {
      dmgMin += Math.max(1, Math.round(((base.min + dmgMin) * passives.meleeDmgPct) / 100));
      dmgMax += Math.max(1, Math.round(((base.max + dmgMax) * passives.meleeDmgPct) / 100));
    }
  }
  return {
    attr: t,
    hpMax: Math.min(32000, 40 + 10 * t[0] + hp),
    manaMax: 10 + 7 * t[2] + mana,
    min: Math.max(1 - base.min, dmgMin),
    max: Math.max(1 - base.max, dmgMax),
    acc: acc + (t[1] >> 1) + extraAcc,
    def: (t[1] >> 1) + extraDef,
    abs: Math.floor(guard / 3) + extraAbs,
    pdef,
    pabs,
    res: res.map((v, k) => Math.min(95, 80 + Math.max(0, maxRes[k]), v + (t[3] >> 1))),
    pow: Math.max(0, (t[2] - 3) * 3 + sorc * 4 + pow),
    regen: (t[3] >> 2) + extraRegen,
    capacity: capacityOf(t[0]),
    weight: weightOf(h),
    ias,
    fcr,
    fhr,
    manasteal,
    lifesteal,
    crushingBlow,
    deadlyStrike,
    openWounds,
    cannotBeFrozen,
    maxRes,
    crit,
    armorPen,
  };
}

/** Copy the derived numbers into the combat arrays. Hit points and mana move with their maximum. */
export function recalc(sim: Sim): void {
  const h = sim.hero;
  if (h === null) return;
  const cb = sim.cb;
  const i = h.id;
  const d = derive(h);
  const o = i * MODN;
  cb.mod[o + M.Min] = d.min;
  cb.mod[o + M.Max] = d.max;
  cb.mod[o + M.Acc] = d.acc;
  cb.mod[o + M.Def] = d.def;
  cb.mod[o + M.Abs] = d.abs;
  for (let k = 0; k < PART_COUNT; k++) {
    cb.mod[o + M.PDef + k] = d.pdef[k];
    cb.mod[o + M.PAbs + k] = d.pabs[k];
  }
  for (let k = 0; k < 5; k++) cb.mod[o + M.Res + k] = d.res[k];
  cb.mod[o + M.Pow] = d.pow;
  cb.mod[o + M.Regen] = d.regen;
  const dh = d.hpMax - cb.hpMax[i];
  cb.hpMax[i] = d.hpMax;
  if (cb.hp[i] > 0) cb.hp[i] = Math.max(1, Math.min(d.hpMax, cb.hp[i] + Math.max(0, dh)));
  const dm = d.manaMax - cb.manaMax[i];
  cb.manaMax[i] = d.manaMax;
  cb.mana[i] = Math.max(0, Math.min(d.manaMax, cb.mana[i] + Math.max(0, dm)));
  cb.known[i] = h.known;
  for (let w = 0; w < KNOWN_HI; w++) cb.knownHi[i * KNOWN_HI + w] = h.knownHi?.[w] ?? 0;
}

/** The hero a new game starts with. Also used by the creation sheet to preview the choice. */
export function startState(id: number, cls: number, female: boolean, diff: number): HeroState {
  const caster = cls === Cls.Mage || cls === 3;
  const attr = BASE_ATTR[caster ? 1 : 0].slice();
  const h: HeroState = {
    id,
    cls,
    female,
    diff,
    attr,
    skill: [0, 0, 0],
    use: [0, 0, 0],
    inv: [],
    eq: Array<number>(SLOT_COUNT).fill(-1),
    known: caster ? (1 << 0) | (1 << 4) | (1 << 7) : 1 << 7, // Fire Bolt, Frost Bolt, Healing; the warrior knows Healing
    hits: [0, 0, 0, 0],
    level: 1,
    xp: 0,
    xpNext: 100,
    statPoints: 0,
    skillPoints: 0,
    skillCd: {},
  };
  h.eq[Slot.Weapon] = itemId(caster ? 'Oak Staff' : cls === 2 ? 'Short Bow' : 'Rusty Sword');
  h.eq[Slot.Armor] = itemId(caster ? 'Cloth Robe' : cls === 2 ? 'Leather Jerkin' : 'Padded Jerkin');
  h.inv.push({ item: itemId('Healing Draught'), n: START_DRAUGHTS[diff] });
  if (caster) h.inv.push({ item: itemId('Mana Draught'), n: 1 });
  return h;
}

/** Make unit `id` the hero. Setup before the first tick: class, looks, difficulty, first kit. */
export function createHero(sim: Sim, id: number, cls: number, female: boolean, diff: number): HeroState {
  const h = startState(id, cls, female, diff);
  sim.hero = h;
  const cb = sim.cb;
  for (let j = 0; j < sim.count; j++) {
    if (sim.team[j] === 0) continue;
    cb.hpMax[j] = Math.max(1, Math.floor((cb.hpMax[j] * FOE_PCT[diff]) / 100));
    cb.hp[j] = cb.hpMax[j];
  }
  cb.hpMax[id] = 0;
  recalc(sim);
  cb.hp[id] = cb.hpMax[id];
  cb.mana[id] = cb.manaMax[id];
  cb.gold[0] = Math.floor((cb.gold[0] * rulesOf(sim).goldPct) / 100); // easy starts richer
  return h;
}

/** A skill use: a blow struck (0), a blow taken (1), a spell cast (2). */
export function heroUse(sim: Sim, skill: number): void {
  const h = sim.hero;
  if (h === null || h.skill[skill] >= SKILL_MAX) return;
  if (++h.use[skill] < skillNeed(h.skill[skill])) return;
  h.use[skill] = 0;
  h.skill[skill]++;
  recalc(sim);
  sim.cb.emit(6, sim.x[h.id], sim.y[h.id], skill, h.skill[skill]);
}

// ---- pack ----

function refuse(sim: Sim, why: number): void {
  sim.cb.emit(15, sim.x[sim.hero!.id], sim.y[sim.hero!.id], why, 0);
}

function done(sim: Sim, item: number, did: number): void {
  sim.cb.emit(14, sim.x[sim.hero!.id], sim.y[sim.hero!.id], item, did);
}

/** Put one item in the pack. Returns 0 on success or a Why code. */
export function addItem(h: HeroState, item: number): number {
  const d = getItemDef(item);
  if (!d) return Why.None;
  if (weightOf(h) + d.w > capacityOf(totals(h)[0])) return Why.Heavy;
  if (d.kind !== Ik.Gear) {
    const s = h.inv.find((x) => x.item === item);
    if (s) {
      s.n++;
      return 0;
    }
  }
  if (h.inv.length >= INV_MAX) return Why.Full;
  h.inv.push({ item, n: 1 });
  return 0;
}

export function takeItem(h: HeroState, item: number): boolean {
  const k = h.inv.findIndex((x) => x.item === item);
  if (k < 0) return false;
  if (--h.inv[k].n <= 0) h.inv.splice(k, 1);
  return true;
}

/** Why the hero cannot use item `item` right now (0 = it can). */
export function blocker(h: HeroState, item: number): number {
  const d = getItemDef(item);
  if (!d) return Why.None;
  if (d.unidentified) return Why.Unidentified;
  if (d.kind === Ik.Gear && (d.cls & (kitCls(h.cls) === Cls.Mage ? CLS_MAGE : CLS_WARRIOR)) === 0) return Why.Class;
  if (d.needv > 0 && totals(h)[d.need] < d.needv) return Why.Need;
  if (d.kind === Ik.Learn && heroKnowsSpell(h, d.spell)) return Why.Known;
  if (d.kind === Ik.Learn && !spellForHero(h, d.spell)) return Why.Class;
  return 0;
}

function equip(sim: Sim, item: number): void {
  const h = sim.hero!;
  const d = getItemDef(item);
  if (!d || d.slot < 0 || d.slot >= SLOT_COUNT) {
    refuse(sim, Why.None);
    return;
  }
  if (!h.inv.some((x) => x.item === item)) {
    refuse(sim, Why.None);
    return;
  }
  const why = blocker(h, item);
  if (why) {
    refuse(sim, why);
    return;
  }
  takeItem(h, item);
  const old = h.eq[d.slot];
  h.eq[d.slot] = item;
  if (old >= 0) h.inv.push({ item: old, n: 1 });
  else {
    for (const q of sim.town.quests) {
      if (q.type === 10) q.base = Math.max(0, q.base - 1);
    }
  }
  recalc(sim);
  done(sim, item, Did.Equip);
}

function useItem(sim: Sim, item: number): void {
  const h = sim.hero!;
  const d = getItemDef(item);
  if (!d) {
    refuse(sim, Why.None);
    return;
  }
  const cb = sim.cb;
  const i = h.id;
  if (!h.inv.some((x) => x.item === item)) {
    refuse(sim, Why.None);
    return;
  }
  if (d.kind === Ik.Gear) {
    equip(sim, item);
    return;
  }
  const why = blocker(h, item);
  if (why) {
    refuse(sim, why);
    return;
  }
  if (d.heal > 0 && d.restore > 0) {
    if (cb.hp[i] >= cb.hpMax[i] && cb.mana[i] >= cb.manaMax[i]) {
      refuse(sim, Why.NoEffect);
      return;
    }
    if (cb.hp[i] < cb.hpMax[i]) {
      const gained = Math.min(d.heal, cb.hpMax[i] - cb.hp[i]);
      cb.hp[i] += gained;
      cb.emit(7, sim.x[i], sim.y[i], gained, 0);
    }
    if (cb.mana[i] < cb.manaMax[i]) {
      cb.mana[i] = Math.min(cb.manaMax[i], cb.mana[i] + d.restore);
    }
  } else if (d.heal > 0) {
    if (cb.hp[i] >= cb.hpMax[i]) {
      refuse(sim, Why.NoEffect);
      return;
    }
    cb.hp[i] = Math.min(cb.hpMax[i], cb.hp[i] + d.heal);
    cb.emit(7, sim.x[i], sim.y[i], d.heal, 0);
  } else if (d.restore > 0) {
    if (cb.mana[i] >= cb.manaMax[i]) {
      refuse(sim, Why.NoEffect);
      return;
    }
    cb.mana[i] = Math.min(cb.manaMax[i], cb.mana[i] + d.restore);
  } else if (d.grow > 0) {
    h.attr[d.grow - 1]++;
    recalc(sim);
  } else if (d.kind === Ik.Key) {
    if (d.name !== WRIT_NAME) {
      refuse(sim, Why.NoEffect);
      return;
    }
    h.pinnacle = true;
    cb.emit(9, sim.x[i], sim.y[i], 98, 0);
  } else if (d.kind === Ik.Portal) {
    cb.emit(9, sim.x[i], sim.y[i], 99, 0);
  } else if (d.kind === Ik.Identify) {
    let unIdItem = -1;
    for (const stack of h.inv) {
      const itDef = sim.getItemDef(stack.item);
      if (itDef && itDef.unidentified) {
        unIdItem = stack.item;
        break;
      }
    }
    if (unIdItem < 0) {
      refuse(sim, Why.NoEffect);
      return;
    }
    const targetDef = sim.getItemDef(unIdItem);
    if (targetDef) {
      targetDef.unidentified = false;
      if (targetDef.trueName) targetDef.name = targetDef.trueName;
    }
    cb.emit(7, sim.x[i], sim.y[i], 0, 0);
  } else if (d.spell >= 0) {
    const fee = scribeFee(d.tier);
    if (cb.gold[0] < fee) {
      refuse(sim, Why.Gold);
      return;
    }
    cb.gold[0] -= fee;
    learnSpell(h, d.spell);
    recalc(sim);
  }
  takeItem(h, item);
  done(sim, item, d.spell >= 0 ? Did.Learn : Did.Use);
}

function dropBag(sim: Sim, item: number): boolean {
  const cb = sim.cb;
  const h = sim.hero!;
  for (let b = 0; b < cb.bI.length; b++) {
    if (cb.bI[b]) continue;
    cb.bX[b] = sim.x[h.id];
    cb.bY[b] = sim.y[h.id];
    cb.bI[b] = item + 1;
    return true;
  }
  return false;
}

export function xpNeededForLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.8));
}

export function addHeroXp(sim: Sim, amount: number): boolean {
  const h = sim.hero;
  if (!h || amount <= 0) return false;
  h.level = h.level ?? 1;
  h.xp = (h.xp ?? 0) + amount;
  h.xpNext = h.xpNext ?? xpNeededForLevel(h.level);
  h.statPoints = h.statPoints ?? 0;
  h.skillPoints = h.skillPoints ?? 0;
  let leveled = false;
  while (h.xp >= h.xpNext && h.level < 50) {
    h.xp -= h.xpNext;
    h.level++;
    h.xpNext = xpNeededForLevel(h.level);
    h.statPoints += 5;
    h.skillPoints += 1;
    leveled = true;
    const cb = sim.cb;
    const i = h.id;
    cb.hp[i] = cb.hpMax[i];
    cb.mana[i] = cb.manaMax[i];
    cb.emit(6, sim.x[i], sim.y[i], h.level, 1);
  }
  return leveled;
}

/** Stamina pool and run state for one tick. Absent fields mean full stamina and walking, so old replays are unchanged. */
export function staminaTick(sim: Sim, h: HeroState): void {
  const max = staminaMax(h.attr[0]);
  const cur = h.stamina ?? max;
  const moving = sim.moving[h.id] !== 0;
  if (h.running && moving) {
    const next = Math.max(0, cur - STAMINA_DRAIN);
    if (next <= 0) h.running = false;
    h.stamina = next;
  } else if (cur < max) {
    h.stamina = Math.min(max, cur + (moving ? STAMINA_REGEN_WALK : STAMINA_REGEN_IDLE));
    if (h.stamina >= max) delete h.stamina;
  }
}

/** The hero is running right now: toggled on and actually moving. */
export function heroRunning(sim: Sim): boolean {
  const h = sim.hero;
  return h !== null && h.running === true && sim.moving[h.id] !== 0;
}

export function heroTick(sim: Sim): void {
  const h = sim.hero;
  if (h && (h.running || h.stamina !== undefined)) staminaTick(sim, h);
  if (!h || !h.skillCd) return;
  for (const k in h.skillCd) {
    if (h.skillCd[k] > 0) h.skillCd[k]--;
  }
}

export function respawnHero(sim: Sim): boolean {
  const h = sim.hero;
  if (!h) return false;
  const cb = sim.cb;
  const id = h.id;

  // 15% gold penalty (skip dropping empty sacks when broke)
  const currentGold = cb.gold[0];
  if (currentGold > 0) {
    const penalty = Math.max(1, Math.floor(currentGold * 0.15));
    cb.gold[0] = Math.max(0, currentGold - penalty);

    // Drop corpse sack with penalty gold where hero died
    for (let s = 0; s < MAXS; s++) {
      if (cb.sG[s]) continue;
      cb.sX[s] = sim.x[id];
      cb.sY[s] = sim.y[id];
      cb.sG[s] = penalty;
      break;
    }
  }
  cb.emit(10, sim.x[id], sim.y[id], 0, 0);

  // Nearest shrine or spawn waypoint
  let rx = 5.5 * FP;
  let ry = 5.5 * FP;
  let minDist2 = Infinity;

  if (sim.shrines.length > 0) {
    for (const sh of sim.shrines) {
      const sx = (sh.x + 0.5) * FP;
      const sy = (sh.y + 0.5) * FP;
      const d2 = (sx - sim.x[id]) ** 2 + (sy - sim.y[id]) ** 2;
      if (d2 < minDist2) {
        minDist2 = d2;
        rx = sx;
        ry = sy;
      }
    }
  } else if (sim.towns.length > 0 && sim.towns[0].door[0]) {
    rx = (sim.towns[0].door[0][0] + 0.5) * FP;
    ry = (sim.towns[0].door[0][1] + 0.5) * FP;
  } else {
    rx = cb.px[id] || 5.5 * FP;
    ry = cb.py[id] || 5.5 * FP;
  }

  // Restore and relocate
  cb.hp[id] = cb.hpMax[id];
  cb.mana[id] = cb.manaMax[id];
  cb.ord[id] = Ord.Guard;
  cb.tgt[id] = -1;
  cb.aux[id] = 0;
  clearAllStatuses(sim, id);
  sim.stop(id);
  sim.x[id] = rx;
  sim.y[id] = ry;
  sim.tx[id] = rx;
  sim.ty[id] = ry;
  cb.px[id] = rx;
  cb.py[id] = ry;

  cb.emit(7, rx, ry, cb.hpMax[id], 5);
  return true;
}

function findSkillFoe(sim: Sim, maxRangeTiles: number, x?: number, y?: number, target?: number): number {
  const cb = sim.cb;
  if (target !== undefined && target >= 0 && target < sim.count && cb.hp[target] > 0 && sim.team[target] !== 0 && !sim.hidden[target]) {
    return target;
  }
  const h = sim.hero!;
  const gx = x !== undefined ? Math.round(x * FP) : sim.x[h.id];
  const gy = y !== undefined ? Math.round(y * FP) : sim.y[h.id];
  let bestFoe = -1;
  let bestD2 = (maxRangeTiles * FP) ** 2;
  for (let u = 0; u < sim.count; u++) {
    if (sim.team[u] === 0 || cb.hp[u] <= 0 || sim.hidden[u]) continue;
    const d2 = (sim.x[u] - gx) ** 2 + (sim.y[u] - gy) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestFoe = u;
    }
  }
  return bestFoe;
}

export function executeHeroSkill(
  sim: Sim,
  skill: HeroSkillId,
  x?: number,
  y?: number,
  target?: number,
): boolean {
  const h = sim.hero;
  if (!h || sim.cb.hp[h.id] <= 0) return false;
  const cb = sim.cb;
  const id = h.id;
  h.skillCd = h.skillCd ?? {};
  if ((h.skillCd[skill] ?? 0) > 0) return false;

  const d = derive(h);

  switch (skill) {
    case 'whirlwind': {
      if (h.cls !== Cls.Warrior || cb.mana[id] < 15) return false;
      cb.mana[id] -= 15;
      h.skillCd[skill] = 50; // 2.0s cooldown
      const r2 = (2.5 * FP) ** 2;
      for (let u = 0; u < sim.count; u++) {
        if (sim.team[u] === 0 || cb.hp[u] <= 0 || sim.hidden[u]) continue;
        const dx = sim.x[u] - sim.x[id];
        const dy = sim.y[u] - sim.y[id];
        if (dx * dx + dy * dy <= r2) {
          strike(sim, u, d.min + 12, d.max + 18, Elem.Physical, d.acc + 6, id);
        }
      }
      cb.emit(5, sim.x[id], sim.y[id], 25, Elem.Physical);
      heroUse(sim, 0); // Blade skill grows
      return true;
    }
    case 'shield_charge': {
      if (h.cls !== Cls.Warrior || cb.mana[id] < 12) return false;
      let tx = x !== undefined ? Math.round(x * FP) : -1;
      let ty = y !== undefined ? Math.round(y * FP) : -1;
      let foe = target ?? -1;
      if (foe >= 0 && (foe >= sim.count || cb.hp[foe] <= 0 || sim.team[foe] === 0)) foe = -1;
      if (foe >= 0) {
        tx = sim.x[foe];
        ty = sim.y[foe];
      }
      if (tx < 0 || ty < 0) return false;
      const dx = tx - sim.x[id];
      const dy = ty - sim.y[id];
      const dist = Math.hypot(dx, dy);
      if (dist > 7.0 * FP) return false;

      cb.mana[id] -= 12;
      h.skillCd[skill] = 75; // 3.0s cooldown
      const stopDist = foe >= 0 ? 0.8 * FP : 0;
      const moveDist = Math.max(0, dist - stopDist);
      const ratio = dist > 0 ? moveDist / dist : 0;
      const slid = safeSlideTo(sim.map, sim.x[id], sim.y[id], sim.x[id] + dx * ratio, sim.y[id] + dy * ratio);
      const nx = slid.x;
      const ny = slid.y;

      sim.x[id] = nx;
      sim.y[id] = ny;
      sim.tx[id] = nx;
      sim.ty[id] = ny;
      cb.px[id] = nx;
      cb.py[id] = ny;
      sim.stop(id);
      sim.markGridDirty();

      if (foe >= 0) {
        const bluntMin = Math.round(20 + totals(h)[0] * 1.5);
        const bluntMax = Math.round(28 + totals(h)[0] * 2.0);
        strike(sim, foe, bluntMin, bluntMax, Elem.Physical, d.acc + 10, id);
        addStatus(sim, foe, St.Stone, 75, 0); // Stun 3s
      }
      cb.emit(0, nx, ny, 20, Elem.Earth);
      heroUse(sim, 1); // Guard skill grows
      return true;
    }
    case 'iron_bulwark': {
      if (h.cls !== Cls.Warrior || cb.mana[id] < 20) return false;
      cb.mana[id] -= 20;
      h.skillCd[skill] = 150; // 6.0s cooldown
      const shieldVal = 80 + totals(h)[0] * 6;
      addStatus(sim, id, St.Shield, 300, shieldVal);
      addStatus(sim, id, St.Bless, 300, 0);
      cb.emit(8, sim.x[id], sim.y[id], St.Shield, 4);
      heroUse(sim, 1); // Guard skill grows
      return true;
    }
    case 'chain_lightning': {
      if (h.cls !== Cls.Mage || cb.mana[id] < 22) return false;
      let primary = target ?? -1;
      if (primary < 0 || primary >= sim.count || cb.hp[primary] <= 0 || sim.team[primary] === 0) {
        if (x !== undefined && y !== undefined) {
          const gx = Math.round(x * FP);
          const gy = Math.round(y * FP);
          let bestFoe = -1;
          let bestD2 = (7.0 * FP) ** 2;
          for (let u = 0; u < sim.count; u++) {
            if (sim.team[u] === 0 || cb.hp[u] <= 0 || sim.hidden[u]) continue;
            const d2 = (sim.x[u] - gx) ** 2 + (sim.y[u] - gy) ** 2;
            if (d2 < bestD2) {
              bestD2 = d2;
              bestFoe = u;
            }
          }
          primary = bestFoe;
        }
      }
      if (primary < 0) return false;

      cb.mana[id] -= 22;
      h.skillCd[skill] = 50; // 2.0s cooldown
      const pow = d.pow;
      let minDmg = 26 + Math.round(pow * 0.4);
      let maxDmg = 36 + Math.round(pow * 0.5);

      const hitFoes = new Set<number>();
      let cur = primary;
      hitFoes.add(cur);
      strike(sim, cur, minDmg, maxDmg, Elem.Air, d.acc + 15, id);
      cb.emit(0, sim.x[cur], sim.y[cur], minDmg, Elem.Air);

      // Arc to up to 4 more foes (total 5)
      const arcR2 = (4.0 * FP) ** 2;
      for (let hop = 0; hop < 4; hop++) {
        let nextFoe = -1;
        let nextD2 = arcR2 + 1;
        for (let u = 0; u < sim.count; u++) {
          if (sim.team[u] === 0 || cb.hp[u] <= 0 || sim.hidden[u] || hitFoes.has(u)) continue;
          const d2 = (sim.x[u] - sim.x[cur]) ** 2 + (sim.y[u] - sim.y[cur]) ** 2;
          if (d2 < nextD2) {
            nextD2 = d2;
            nextFoe = u;
          }
        }
        if (nextFoe < 0) break;
        cur = nextFoe;
        hitFoes.add(cur);
        minDmg = Math.max(1, Math.round(minDmg * 0.85));
        maxDmg = Math.max(minDmg, Math.round(maxDmg * 0.85));
        strike(sim, cur, minDmg, maxDmg, Elem.Air, d.acc + 15, id);
        cb.emit(0, sim.x[cur], sim.y[cur], minDmg, Elem.Air);
      }
      heroUse(sim, 2); // Sorcery skill grows
      return true;
    }
    case 'frost_nova': {
      if (h.cls !== Cls.Mage || cb.mana[id] < 20) return false;
      cb.mana[id] -= 20;
      h.skillCd[skill] = 75; // 3.0s cooldown
      const pow = d.pow;
      const minDmg = 18 + Math.round(pow * 0.3);
      const maxDmg = 26 + Math.round(pow * 0.4);
      const r2 = (3.5 * FP) ** 2;

      for (let u = 0; u < sim.count; u++) {
        if (sim.team[u] === 0 || cb.hp[u] <= 0 || sim.hidden[u]) continue;
        const dx = sim.x[u] - sim.x[id];
        const dy = sim.y[u] - sim.y[id];
        if (dx * dx + dy * dy <= r2) {
          strike(sim, u, minDmg, maxDmg, Elem.Water, d.acc + 15, id);
          addStatus(sim, u, St.Slow, 150, 0); // 6s Slow/Freeze
        }
      }
      cb.emit(5, sim.x[id], sim.y[id], 35, Elem.Water);
      heroUse(sim, 2); // Sorcery skill grows
      return true;
    }
    case 'teleport': {
      if (h.cls !== Cls.Mage || cb.mana[id] < 25) return false;
      let tx = x !== undefined ? Math.round(x * FP) : -1;
      let ty = y !== undefined ? Math.round(y * FP) : -1;
      if (tx < 0 || ty < 0) return false;
      const dx = tx - sim.x[id];
      const dy = ty - sim.y[id];
      const dist = Math.hypot(dx, dy);
      if (dist > 7.0 * FP) {
        const ratio = (7.0 * FP) / dist;
        tx = Math.round(sim.x[id] + dx * ratio);
        ty = Math.round(sim.y[id] + dy * ratio);
      }

      cb.mana[id] -= 25;
      h.skillCd[skill] = 100; // 4.0s cooldown
      cb.emit(9, sim.x[id], sim.y[id], 0, Elem.Astral);

      const minX = sim.map.w > 2 ? FP : 0;
      const minY = sim.map.h > 2 ? FP : 0;
      const maxX = sim.map.w > 2 ? (sim.map.w - 1) * FP - 1 : sim.map.w * FP - 1;
      const maxY = sim.map.h > 2 ? (sim.map.h - 1) * FP - 1 : sim.map.h * FP - 1;
      tx = Math.max(minX, Math.min(maxX, tx));
      ty = Math.max(minY, Math.min(maxY, ty));
      if (isBlockedAt(sim.map, tx >> 8, ty >> 8)) {
        const bdx = sim.x[id] - tx;
        const bdy = sim.y[id] - ty;
        const steps = Math.max(1, Math.ceil(Math.hypot(bdx, bdy) / 64));
        let landed = false;
        for (let s = 1; s <= steps; s++) {
          const cx = Math.max(minX, Math.min(maxX, Math.round(tx + (bdx * s) / steps)));
          const cy = Math.max(minY, Math.min(maxY, Math.round(ty + (bdy * s) / steps)));
          if (!isBlockedAt(sim.map, cx >> 8, cy >> 8)) {
            tx = cx;
            ty = cy;
            landed = true;
            break;
          }
        }
        if (!landed) {
          tx = sim.x[id];
          ty = sim.y[id];
        }
      }

      sim.x[id] = tx;
      sim.y[id] = ty;
      sim.tx[id] = tx;
      sim.ty[id] = ty;
      cb.px[id] = tx;
      cb.py[id] = ty;
      sim.stop(id);
      sim.markGridDirty();

      cb.emit(9, tx, ty, 0, Elem.Astral);

      for (let u = 0; u < sim.count; u++) {
        if (sim.team[u] === 0 || cb.hp[u] <= 0) continue;
        if (cb.tgt[u] === id) {
          const reach = DEFS[cb.kind[u]].reach;
          const edx = sim.x[u] - tx;
          const edy = sim.y[u] - ty;
          if (edx * edx + edy * edy > (reach + FP) ** 2) {
            cb.tgt[u] = -1;
          }
        }
      }
      heroUse(sim, 2); // Sorcery skill grows
      return true;
    }
    case 'barbed_volley': {
      if (h.cls !== 2 || cb.mana[id] < 13) return false;
      const primary = findSkillFoe(sim, 8.5, x, y, target);
      if (primary < 0) return false;
      cb.mana[id] -= 13;
      h.skillCd[skill] = 75;
      const minDmg = d.min + 8;
      const maxDmg = d.max + 14;
      const hit = [primary];
      const spreadR2 = (2.8 * FP) ** 2;
      for (let u = 0; u < sim.count && hit.length < 3; u++) {
        if (u === primary || sim.team[u] === 0 || cb.hp[u] <= 0 || sim.hidden[u]) continue;
        const dx = sim.x[u] - sim.x[primary];
        const dy = sim.y[u] - sim.y[primary];
        if (dx * dx + dy * dy <= spreadR2) hit.push(u);
      }
      for (const foe of hit) {
        strike(sim, foe, minDmg, maxDmg, Elem.Physical, d.acc + 12, id);
        if (cb.hp[foe] > 0) addStatus(sim, foe, St.Burn, 100, 4);
      }
      cb.emit(12, sim.x[id], sim.y[id], dir16(sim.x[primary] - sim.x[id], sim.y[primary] - sim.y[id]), 1);
      heroUse(sim, 0);
      return true;
    }
    case 'weir_snares': {
      if (h.cls !== 2 || cb.mana[id] < 16) return false;
      const gx = x !== undefined ? Math.round(x * FP) : sim.x[id];
      const gy = y !== undefined ? Math.round(y * FP) : sim.y[id];
      if (Math.hypot(gx - sim.x[id], gy - sim.y[id]) > 8.0 * FP) return false;
      cb.mana[id] -= 16;
      h.skillCd[skill] = 100;
      const r2 = (2.5 * FP) ** 2;
      for (let u = 0; u < sim.count; u++) {
        if (sim.team[u] === 0 || cb.hp[u] <= 0 || sim.hidden[u]) continue;
        const dx = sim.x[u] - gx;
        const dy = sim.y[u] - gy;
        if (dx * dx + dy * dy <= r2) {
          strike(sim, u, d.min + 6, d.max + 12, Elem.Physical, d.acc + 10, id);
          if (cb.hp[u] > 0) addStatus(sim, u, St.Slow, 125, 0);
        }
      }
      cb.emit(5, gx, gy, 25, Elem.Earth);
      heroUse(sim, 1);
      return true;
    }
    case 'gale_pin': {
      if (h.cls !== 2 || cb.mana[id] < 20) return false;
      const primary = findSkillFoe(sim, 9.0, x, y, target);
      if (primary < 0) return false;
      cb.mana[id] -= 20;
      h.skillCd[skill] = 125;
      strike(sim, primary, d.min + 18, d.max + 28, Elem.Air, d.acc + 16, id);
      if (cb.hp[primary] > 0) {
        addStatus(sim, primary, St.Stone, 75, 0);
        addStatus(sim, primary, St.Slow, 125, 0);
      }
      cb.emit(0, sim.x[primary], sim.y[primary], d.min + 18, Elem.Air);
      heroUse(sim, 0);
      return true;
    }
    case 'grave_chill': {
      if (h.cls !== 3 || cb.mana[id] < 14) return false;
      cb.mana[id] -= 14;
      h.skillCd[skill] = 80;
      const r2 = (3.0 * FP) ** 2;
      const minDmg = 16 + Math.round(d.pow * 0.35);
      const maxDmg = 24 + Math.round(d.pow * 0.45);
      for (let u = 0; u < sim.count; u++) {
        if (sim.team[u] === 0 || cb.hp[u] <= 0 || sim.hidden[u]) continue;
        const dx = sim.x[u] - sim.x[id];
        const dy = sim.y[u] - sim.y[id];
        if (dx * dx + dy * dy <= r2) {
          strike(sim, u, minDmg, maxDmg, Elem.Water, d.acc + 15, id);
          if (cb.hp[u] > 0) addStatus(sim, u, St.Slow, 125, 0);
        }
      }
      cb.emit(5, sim.x[id], sim.y[id], 30, Elem.Water);
      heroUse(sim, 2);
      return true;
    }
    case 'quicklime_cloud': {
      if (h.cls !== 3 || cb.mana[id] < 18) return false;
      const gx = x !== undefined ? Math.round(x * FP) : sim.x[id];
      const gy = y !== undefined ? Math.round(y * FP) : sim.y[id];
      if (Math.hypot(gx - sim.x[id], gy - sim.y[id]) > 8.0 * FP) return false;
      cb.mana[id] -= 18;
      h.skillCd[skill] = 110;
      const r2 = (2.8 * FP) ** 2;
      const minDmg = 14 + Math.round(d.pow * 0.3);
      const maxDmg = 22 + Math.round(d.pow * 0.4);
      for (let u = 0; u < sim.count; u++) {
        if (sim.team[u] === 0 || cb.hp[u] <= 0 || sim.hidden[u]) continue;
        const dx = sim.x[u] - gx;
        const dy = sim.y[u] - gy;
        if (dx * dx + dy * dy <= r2) {
          strike(sim, u, minDmg, maxDmg, Elem.Earth, d.acc + 12, id);
          if (cb.hp[u] > 0) {
            addStatus(sim, u, St.Weaken, 150, 0);
            addStatus(sim, u, St.Poison, 150, 3);
          }
        }
      }
      cb.emit(5, gx, gy, 28, Elem.Earth);
      heroUse(sim, 2);
      return true;
    }
    case 'bone_splinter': {
      if (h.cls !== 3 || cb.mana[id] < 22) return false;
      const primary = findSkillFoe(sim, 8.0, x, y, target);
      if (primary < 0) return false;
      cb.mana[id] -= 22;
      h.skillCd[skill] = 100;
      const minDmg = 24 + Math.round(d.pow * 0.45);
      const maxDmg = 34 + Math.round(d.pow * 0.55);
      const hits = new Set<number>([primary]);
      strike(sim, primary, minDmg, maxDmg, Elem.Astral, d.acc + 15, id);
      cb.emit(0, sim.x[primary], sim.y[primary], minDmg, Elem.Astral);
      const arcR2 = (4.0 * FP) ** 2;
      let cur = primary;
      for (let hop = 0; hop < 3; hop++) {
        let next = -1;
        let bestD2 = arcR2 + 1;
        for (let u = 0; u < sim.count; u++) {
          if (sim.team[u] === 0 || cb.hp[u] <= 0 || sim.hidden[u] || hits.has(u)) continue;
          const d2 = (sim.x[u] - sim.x[cur]) ** 2 + (sim.y[u] - sim.y[cur]) ** 2;
          if (d2 < bestD2) {
            bestD2 = d2;
            next = u;
          }
        }
        if (next < 0) break;
        cur = next;
        hits.add(cur);
        strike(sim, cur, minDmg, maxDmg, Elem.Astral, d.acc + 15, id);
        cb.emit(0, sim.x[cur], sim.y[cur], minDmg, Elem.Astral);
      }
      heroUse(sim, 2);
      return true;
    }
  }
}

export function heroCommand(sim: Sim, cmd: HeroCommand): void {
  const h = sim.hero;
  if (h === null) return;
  if (sim.cb.hp[h.id] <= 0) {
    refuse(sim, Why.Dead);
    return;
  }
  switch (cmd.op) {
    case 'equip':
      if (cmd.item !== undefined && cmd.item >= 0) {
        const d = getItemDef(cmd.item);
        if (d && d.kind === Ik.Gear) {
          if (cmd.expectedEquipment !== undefined && cmd.expectedEquipment !== equipmentStamp(h, { op: 'equip', item: cmd.item })) {
            refuse(sim, Why.None);
            return;
          }
          equip(sim, cmd.item);
        }
      }
      return;
    case 'use':
      if (cmd.item !== undefined && cmd.item >= 0) useItem(sim, cmd.item);
      return;
    case 'unequip': {
      const s = cmd.slot ?? -1;
      if (s < 0 || s >= SLOT_COUNT) return;
      if (cmd.expectedEquipment !== undefined && cmd.expectedEquipment !== equipmentStamp(h, { op: 'unequip', slot: s })) {
        refuse(sim, Why.None);
        return;
      }
      if (h.eq[s] < 0) return;
      if (h.inv.length >= INV_MAX) {
        refuse(sim, Why.Full);
        return;
      }
      const item = h.eq[s];
      h.eq[s] = -1;
      h.inv.push({ item, n: 1 });
      for (const q of sim.town.quests) {
        if (q.type === 10) q.base += 1; // moving worn gear to pack does not count as gathering loot
      }
      recalc(sim);
      done(sim, item, Did.Unequip);
      return;
    }
    case 'drop': {
      if (cmd.item === undefined || !takeItem(h, cmd.item)) {
        refuse(sim, Why.None);
        return;
      }
      if (!dropBag(sim, cmd.item)) {
        addItem(h, cmd.item);
        refuse(sim, Why.Full);
        return;
      }
      if (getItemDef(cmd.item)?.charmSize) recalc(sim);
      done(sim, cmd.item, Did.Drop);
      return;
    }
    case 'stat': {
      if (cmd.attr !== undefined && cmd.attr >= 0 && cmd.attr < 4 && (h.statPoints ?? 0) > 0) {
        h.statPoints = (h.statPoints ?? 0) - 1;
        h.attr[cmd.attr]++;
        recalc(sim);
        sim.cb.emit(6, sim.x[h.id], sim.y[h.id], cmd.attr, h.attr[cmd.attr]);
      }
      return;
    }
    case 'rank': {
      const sid = cmd.spell;
      if (Number.isInteger(sid) && sid >= 0 && sid < MAX_SPELLS && heroKnowsSpell(h, sid) && (h.skillPoints ?? 0) > 0 && spellRankOf(h, sid) < MAX_SPELL_RANK && spellPrereqMet(h, sid)) {
        h.spellRank = h.spellRank ?? Array<number>(MAX_SPELLS).fill(0);
        h.spellRank[sid]++;
        h.skillPoints = (h.skillPoints ?? 0) - 1;
        sim.cb.emit(6, sim.x[h.id], sim.y[h.id], 10 + sid, h.spellRank[sid]);
      }
      return;
    }
    case 'skill': {
      if (cmd.skill) {
        executeHeroSkill(sim, cmd.skill, cmd.x, cmd.y, cmd.target);
      }
      return;
    }
    case 'run': {
      if (cmd.on) {
        const max = staminaMax(h.attr[0]);
        if ((h.stamina ?? max) < staminaResumeAt(max)) {
          refuse(sim, Why.Tired);
          return;
        }
      }
      h.running = cmd.on ? true : undefined;
      return;
    }
    case 'aura': {
      h.activeAura = cmd.aura;
      return;
    }
    case 'class_skill': {
      const baseState = createSkillTreeState(skillClassOf(h.cls), h.level ?? 1, h.classSkills ?? {});
      const treeState = h.skillPoints !== undefined ? { ...baseState, availablePoints: h.skillPoints } : baseState;
      const nextState = allocateSkill(treeState, cmd.skillId);
      if (!nextState) return;
      h.classSkills = { ...nextState.ranks };
      h.skillPoints = nextState.availablePoints;
      recalc(sim);
      sim.cb.emit(6, sim.x[h.id], sim.y[h.id], 0, 0);
      return;
    }
  }
}

/** The hero takes the contents of bag `b`, if it fits. */
export function pickBag(sim: Sim, b: number): void {
  const h = sim.hero;
  if (h === null) return;
  const cb = sim.cb;
  const item = cb.bI[b] - 1;
  const why = addItem(h, item);
  if (why) {
    refuse(sim, why);
    return;
  }
  cb.bI[b] = 0;
  if (getItemDef(item)?.charmSize) recalc(sim);
  done(sim, item, Did.Pick);
}

export type ItemQuality = 'unique' | 'set' | 'rare' | 'magic' | 'normal';
export type MonsterRank = 'normal' | 'champion' | 'boss';

/** Quality roll base divisors inspired by classic ARPG ItemRatio.txt */
export const QUALITY_BASE_DIVISORS = {
  unique: 2000,
  set: 1000,
  rare: 400,
  magic: 120,
} as const;

export const QUALITY_FACTORS = {
  unique: 40,
  set: 20,
  rare: 10,
  magic: 5,
} as const;

/** Quality bias (reduces divisor, increasing chance of higher quality drops) */
export const QUALITY_BIAS: Record<MonsterRank, Record<'unique' | 'set' | 'rare' | 'magic', number>> = {
  normal: { unique: 0, set: 0, rare: 0, magic: 0 },
  champion: { unique: 200, set: 150, rare: 80, magic: 30 },
  boss: { unique: 500, set: 300, rare: 150, magic: 50 },
};

/**
 * Diminishing returns formula for Magic Find (MF):
 * - Magic: effectiveMF = MF (uncapped)
 * - Rare: effectiveMF = Math.floor((MF * 500) / (MF + 500))
 * - Set: effectiveMF = Math.floor((MF * 400) / (MF + 400))
 * - Unique: effectiveMF = Math.floor((MF * 250) / (MF + 250))
 */
export function calculateEffectiveMF(mf: number, quality: 'unique' | 'set' | 'rare' | 'magic'): number {
  return calculateEffectiveMFTable(mf)[quality];
}

/**
 * Divisor adjustment:
 * div = Math.max(minLimit, baseDiv - (monsterTier - itemTier) * factor - monsterBias)
 */
export function calculateQualityDivisor(
  baseDiv: number,
  monsterTier: number,
  itemTier: number,
  factor = 20,
  monsterBias = 0,
  minLimit = 1,
): number {
  return Math.max(minLimit, baseDiv - (monsterTier - itemTier) * factor - monsterBias);
}

/**
 * Chance calculation:
 * chance = Math.floor((div * 1000) / (1000 + effectiveMF * 10))
 */
export function calculateQualityChance(div: number, effectiveMF: number): number {
  return Math.max(1, Math.floor((div * 1000) / (1000 + effectiveMF * 10)));
}

/**
 * Quality roll check:
 * Success if rnd(chance) < 100.
 */
export function rollQualitySuccess(chance: number, rnd: (n: number) => number): boolean {
  if (chance <= 100) return true;
  return rnd(chance) < 100;
}

/**
 * Difficulty scaling on No-Drop rate:
 * Easy (0): +20% no-drop, tier locked.
 * Normal (1): standard.
 * Hard (2): -30% no-drop, guaranteed +1 tier on champions/bosses.
 */
export function calculateNoDropRate(baseDropChance: number, diff: number): number {
  if (baseDropChance <= 0) return 100;
  const baseNoDrop = 100 - baseDropChance;
  if (diff === 0) return Math.min(100, Math.round(baseNoDrop * 1.2));
  if (diff >= 3) return Math.max(0, Math.round(baseNoDrop * 0.55));
  if (diff === 2) return Math.max(0, Math.round(baseNoDrop * 0.7));
  return baseNoDrop;
}

export function getMonsterRank(sim: Sim, t: number): MonsterRank {
  const bmods = sim.cb.bossMods[t];
  if (bmods && (bmods.length >= 2 || bmods.includes('boss'))) return 'boss';
  if (bmods && (bmods.length === 1 || bmods.includes('champion'))) return 'champion';
  return 'normal';
}

export function getHeroMF(sim: Sim): number {
  const h = sim.hero;
  if (!h) return 0;
  let mf = (h.mf ?? 0) + (sim.ngPlusTier > 0 ? sim.ngPlusTier * 25 : 0);
  for (const id of h.eq) {
    if (id >= 0) {
      const d = getItemDef(id);
      if (d?.mf) mf += d.mf;
    }
  }
  return mf;
}

export interface LootDropResult {
  quality: ItemQuality;
  itemId: number;
  itemDef?: ItemDef;
  magicDef?: ItemDef;
}

/**
 * Evaluates the classic ARPG quality hierarchy:
 * Unique -> Set -> Rare -> Magic -> Normal
 */
export function evaluateQualityHierarchy(
  baseItemId: number,
  monsterTier: number,
  rank: MonsterRank,
  mf: number,
  rnd: (n: number) => number,
  diff?: number | string,
): LootDropResult {
  const baseItem = getItemDef(baseItemId);
  if (!baseItem || baseItem.kind !== Ik.Gear) {
    return { quality: 'normal', itemId: baseItemId, itemDef: baseItem };
  }

  const cal = getDifficultyCalibration(diff);

  // 1. Unique Check
  const effMFUnique = calculateEffectiveMF(mf, 'unique');
  const biasUnique = QUALITY_BIAS[rank].unique;
  const baseDivUnique = Math.max(1, Math.round(QUALITY_BASE_DIVISORS.unique / cal.uniqueDropMult));
  const divUnique = calculateQualityDivisor(
    baseDivUnique,
    monsterTier,
    baseItem.tier,
    QUALITY_FACTORS.unique,
    biasUnique,
  );
  const chanceUnique = calculateQualityChance(divUnique, effMFUnique);
  if (rollQualitySuccess(chanceUnique, rnd)) {
    // Pick from unified ALL_UNIQUE_ARTIFACTS matching slot/tier if available
    const exactMatches = ALL_UNIQUE_ARTIFACTS.filter((a) => a.slot === baseItem.slot && a.tier === baseItem.tier);
    let slotMatches = exactMatches.length > 0 ? exactMatches : ALL_UNIQUE_ARTIFACTS.filter((a) => a.slot === baseItem.slot);
    if (exactMatches.length > 0 && !exactMatches.some((a) => UNIQUE_ARTIFACTS.includes(a))) {
      const fallbackBuiltin = UNIQUE_ARTIFACTS.find((a) => a.slot === baseItem.slot);
      if (fallbackBuiltin) slotMatches = [fallbackBuiltin, ...exactMatches];
    }
    if (slotMatches.length > 0) {
      const match = slotMatches[rnd(slotMatches.length)];
      const regId = itemId(match.name);
      return {
        quality: 'unique',
        itemId: regId >= 0 ? regId : baseItemId,
        itemDef: match,
      };
    }
  }

  // 2. Set Check
  const effMFSet = calculateEffectiveMF(mf, 'set');
  const biasSet = QUALITY_BIAS[rank].set;
  const baseDivSet = Math.max(1, Math.round(QUALITY_BASE_DIVISORS.set / cal.setDropMult));
  const divSet = calculateQualityDivisor(
    baseDivSet,
    monsterTier,
    baseItem.tier,
    QUALITY_FACTORS.set,
    biasSet,
  );
  const chanceSet = calculateQualityChance(divSet, effMFSet);
  if (rollQualitySuccess(chanceSet, rnd)) {
    // Pick from unified COMBINED_SET_ITEMS matching slot/tier if available
    const exactMatches = COMBINED_SET_ITEMS.filter((s) => s.slot === baseItem.slot && s.tier === baseItem.tier);
    let slotMatches = exactMatches.length > 0 ? exactMatches : COMBINED_SET_ITEMS.filter((s) => s.slot === baseItem.slot);
    if (exactMatches.length > 0 && !exactMatches.some((s) => ALL_SET_ITEMS.includes(s))) {
      const fallbackBuiltin = ALL_SET_ITEMS.find((s) => s.slot === baseItem.slot);
      if (fallbackBuiltin) slotMatches = [fallbackBuiltin, ...exactMatches];
    }
    if (slotMatches.length > 0) {
      const match = slotMatches[rnd(slotMatches.length)];
      const regId = itemId(match.name);
      return {
        quality: 'set',
        itemId: regId >= 0 ? regId : baseItemId,
        itemDef: match,
      };
    }
  }

  // 3. Rare Check
  const effMFRare = calculateEffectiveMF(mf, 'rare');
  const biasRare = QUALITY_BIAS[rank].rare;
  const divRare = calculateQualityDivisor(
    QUALITY_BASE_DIVISORS.rare,
    monsterTier,
    baseItem.tier,
    QUALITY_FACTORS.rare,
    biasRare,
  );
  const chanceRare = calculateQualityChance(divRare, effMFRare);
  if (rollQualitySuccess(chanceRare, rnd)) {
    // Rare: prefix AND suffix
    const magicDef = rollRareItem(baseItem, baseItem.tier, rnd);
    return {
      quality: 'rare',
      itemId: baseItemId,
      itemDef: baseItem,
      magicDef,
    };
  }

  // 4. Magic Check
  const effMFMagic = calculateEffectiveMF(mf, 'magic');
  const biasMagic = QUALITY_BIAS[rank].magic;
  const divMagic = calculateQualityDivisor(
    QUALITY_BASE_DIVISORS.magic,
    monsterTier,
    baseItem.tier,
    QUALITY_FACTORS.magic,
    biasMagic,
  );
  const chanceMagic = calculateQualityChance(divMagic, effMFMagic);
  if (rollQualitySuccess(chanceMagic, rnd)) {
    // Magic: prefix OR suffix
    const magicDef = rollMagicItem(baseItem, baseItem.tier, rnd, 'magic');
    return {
      quality: 'magic',
      itemId: baseItemId,
      itemDef: baseItem,
      magicDef,
    };
  }

  // 5. Normal Fallback
  return {
    quality: 'normal',
    itemId: baseItemId,
    itemDef: baseItem,
  };
}

/** A foe fell: maybe leave an item bag where it lay. Only games with a hero have item loot. */
export function dropLoot(sim: Sim, t: number): void {
  if (sim.hero === null || sim.team[t] === 0) return;
  const rank = getMonsterRank(sim, t);
  const lootRng = sim.lootRng ?? sim.rng;
  const diff = sim.hero.diff ?? 1;
  const monsterTier = sim.cb.tier[t] || 1;
  const mf = getHeroMF(sim);
  const fam = sim.cb.family[t];
  const isPinnacle = rank === 'boss' && fam === 'hollow-king' && (sim.cb.bossMods[t]?.length ?? 0) >= 3;
  const isActBoss = isPinnacle || fam === 'morvessa' || fam === 'gorrathul' || fam === 'vesperion' || fam === 'ashkarath';

  let picks = 1;
  if (isActBoss) {
    picks = 5; // Prime Act Bosses shower 5 high-tier items
  } else if (rank === 'boss') {
    picks = 3;
  } else if (rank === 'champion') {
    picks = 2;
  } else {
    const rule = LOOT_RULES[sim.cb.kind[t]];
    if (!rule || rule[0] === 0) return;
    const noDropRate = calculateNoDropRate(rule[0], diff);
    if (lootRng.int(100) < noDropRate) return;
  }

  let lo: number;
  let hi: number;
  if (isActBoss) {
    lo = 4;
    hi = 5;
  } else if (rank === 'boss' || rank === 'champion') {
    if (diff === 0) {
      lo = Math.min(5, Math.max(1, monsterTier));
      hi = Math.min(5, Math.max(lo, monsterTier));
    } else if (diff >= 2) {
      const boosted = Math.min(5, monsterTier + (diff >= 3 ? 2 : 1));
      lo = Math.min(5, Math.max(boosted, diff >= 3 ? 4 : 3));
      hi = 5;
    } else {
      lo = Math.min(5, Math.max(monsterTier, 3));
      hi = 5;
    }
  } else {
    const rule = LOOT_RULES[sim.cb.kind[t]];
    lo = rule ? rule[1] : 1;
    hi = rule ? rule[2] : 1;
  }

  const cb = sim.cb;
  const offsets = [
    [60, -40],
    [40, -20],
    [80, -20],
    [20, -50],
    [100, -50],
  ] as const;

  for (let pick = 0; pick < picks; pick++) {
    const baseItemId = rollLoot((n) => lootRng.int(n), lo, hi);
    let drop = evaluateQualityHierarchy(baseItemId, monsterTier, rank, mf, (n) => lootRng.int(n), diff);

    if (isActBoss && pick === 0 && drop.quality !== 'unique' && drop.quality !== 'set') {
      const highTierUniques = ALL_UNIQUE_ARTIFACTS.filter((a) => a.tier >= 4);
      if (highTierUniques.length > 0) {
        const u = highTierUniques[lootRng.int(highTierUniques.length)];
        const regId = itemId(u.name);
        drop = { quality: 'unique', itemId: regId >= 0 ? regId : baseItemId, itemDef: u };
      }
    }

    // Secondary relic roll on boss/champion kills when a pick lands on Normal: allow Runes & Gems from SPECIAL_ITEMS
    if ((rank === 'boss' || rank === 'champion') && drop.quality === 'normal') {
      const relicRoll = lootRng.int(100);
      if (relicRoll < 35) {
        const eligibleRunes = ALL_RUNES.filter((r) => Math.min(5, Math.ceil(r.id / 7)) <= hi);
        if (eligibleRunes.length > 0) {
          const r = eligibleRunes[lootRng.int(eligibleRunes.length)];
          const rid = itemId(r.name);
          if (rid >= 0) drop = { quality: 'normal', itemId: rid, itemDef: getItemDef(rid) };
        }
      } else if (relicRoll < 65) {
        const eligibleGems = BUILTIN_GEMS.filter((g) => g.tier <= hi);
        if (eligibleGems.length > 0) {
          const g = eligibleGems[lootRng.int(eligibleGems.length)];
          const gid = itemId(g.name);
          if (gid >= 0) drop = { quality: 'normal', itemId: gid, itemDef: getItemDef(gid) };
        }
      }
    }

    let finalItemId = drop.itemId;
    if ((drop.quality === 'magic' || drop.quality === 'rare') && drop.magicDef) {
      const inst = sim.createItemInstance(drop.itemId, drop.quality, drop.magicDef);
      finalItemId = inst.id;
    } else if (drop.quality === 'unique' || drop.quality === 'set') {
      const targetDef = drop.itemDef ?? sim.getItemDef(drop.itemId) ?? getItemDef(drop.itemId);
      if (targetDef) {
        const unIdName = getUnidentifiedName(targetDef);
        const unIdDef: ItemDef = {
          ...targetDef,
          unidentified: true,
          trueName: targetDef.name,
          name: unIdName,
          rarity: drop.quality,
        };
        const inst = sim.createItemInstance(drop.itemId, drop.quality, unIdDef);
        finalItemId = inst.id;
      }
    }

    for (let b = 0; b < cb.bI.length; b++) {
      if (cb.bI[b]) continue;
      const off = offsets[pick] ?? [60 + pick * 20, -40];
      cb.bX[b] = sim.x[t] + off[0];
      cb.bY[b] = sim.y[t] + off[1];
      cb.bI[b] = finalItemId + 1;
      break;
    }
  }
  // Hard & Hell elites carry sigils for the endgame cube recipe.
  if (diff >= 2 && rank !== 'normal' && !isPinnacle && lootRng.int(100) < (rank === 'boss' ? 60 : 20)) {
    const kid = itemId(SIGIL_NAMES[lootRng.int(SIGIL_NAMES.length)]);
    for (let b = 0; b < cb.bI.length; b++) {
      if (cb.bI[b]) continue;
      cb.bX[b] = sim.x[t] - 40;
      cb.bY[b] = sim.y[t] - 20;
      cb.bI[b] = kid + 1;
      break;
    }
  }
}

export function cloneHero(h: HeroState | null): HeroState | null {
  return h === null ? null : {
    ...h,
    attr: h.attr.slice(),
    skill: h.skill.slice(),
    use: h.use.slice(),
    inv: h.inv.map((s) => ({ ...s })),
    eq: h.eq.slice(),
    hits: (h.hits ?? [0, 0, 0, 0]).slice(),
    level: h.level ?? 1,
    xp: h.xp ?? 0,
    xpNext: h.xpNext ?? 100,
    statPoints: h.statPoints ?? 0,
    skillPoints: h.skillPoints ?? 0,
    skillCd: h.skillCd ? { ...h.skillCd } : {},
    ...(h.classSkills ? { classSkills: { ...h.classSkills } } : {}),
    ...(h.spellRank ? { spellRank: h.spellRank.slice() } : {}),
    ...(h.knownHi ? { knownHi: h.knownHi.slice() } : {}),
  };
}

export function hashHero(h: HeroState | null, mix: (v: number) => void): void {
  if (h === null) return;
  mix(h.diff);
  for (const v of h.attr) mix(v);
  for (const v of h.skill) mix(v);
  for (const v of h.use) mix(v);
  for (const v of h.eq) mix(v + 1);
  for (const s of h.inv) {
    mix(s.item);
    mix(s.n);
  }
  mix(h.known);
  if (h.knownHi) h.knownHi.forEach((w, k) => { if (w) mix(w + k * 7919); }); // zero keeps older hashes unchanged
  if (h.hits.some((v) => v > 0)) for (const v of h.hits) mix(v); // zero keeps older hashes unchanged
  if (h.mf !== undefined && h.mf > 0) mix(h.mf);
  if ((h.level ?? 1) > 1) mix(h.level!);
  if ((h.xp ?? 0) > 0) mix(h.xp!);
  if ((h.statPoints ?? 0) > 0) mix(h.statPoints!);
  if ((h.skillPoints ?? 0) > 0) mix(h.skillPoints!);
  if (h.pinnacle) mix(0x91ac);
  if (h.running) mix(0x5a17);
  if (h.stamina !== undefined) mix(0x57a0 + h.stamina);
  if (h.activeAura) hashStr(mix, h.activeAura);
  if (h.spellRank) h.spellRank.forEach((r, i) => { if (r > 0) mix(i * 16 + r); }); // zero keeps older hashes unchanged
  if (h.skillCd) {
    for (const k of Object.keys(h.skillCd).sort()) {
      if (h.skillCd[k] > 0) {
        hashStr(mix, k);
        mix(h.skillCd[k]);
      }
    }
  }
  if (h.classSkills) {
    for (const k of Object.keys(h.classSkills).sort()) {
      const rank = h.classSkills[k];
      if (rank > 0) {
        hashStr(mix, k);
        mix(rank);
      }
    }
  }
}

export { ATTR_NAMES };
