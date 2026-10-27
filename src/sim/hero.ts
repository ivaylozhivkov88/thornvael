import { DEFS, M, MODN } from './combat';
import { ATTR_NAMES, CLS_MAGE, CLS_WARRIOR, Cls, ITEMS, Ik, LOOT_RULES, PART_COUNT, SLOT_COUNT, Slot, itemId, rollLoot } from './items';
import type { Sim } from './sim';

/** The hero: attributes, skills that grow with use, pack and equipment. All integer, all inside the sim, all changed through commands. */

export const INV_MAX = 24;
export const SKILL_NAMES = ['Blade', 'Guard', 'Sorcery'] as const;
export const SKILL_MAX = 10;
export const SKILL_TIP = ['+5% blow damage per level. Grows with blows struck.', '+1 absorb per 3 levels. Grows with blows taken.', '+4% spell power per level. Grows with spells cast.'] as const;
export const DIFF_NAMES = ['Easy', 'Medium', 'Hard'] as const;
export const FOE_PCT = [75, 100, 130] as const;
const START_DRAUGHTS = [3, 2, 1] as const;
const BASE_ATTR: readonly (readonly number[])[] = [
  [8, 6, 3, 4], // Warrior: Body, Agility, Mind, Spirit
  [4, 5, 9, 6], // Mage
];

export interface Stack {
  item: number;
  n: number;
}

export interface HeroState {
  id: number;
  cls: number;
  female: boolean;
  diff: number;
  attr: number[]; // base attributes, raised by elixirs
  skill: number[]; // Blade, Guard, Sorcery levels
  use: number[]; // uses towards the next level
  inv: Stack[];
  eq: number[]; // item id per slot, -1 when empty
  known: number; // spells learned (bit mask)
}

/** Hero commands go through the command log. */
export type HeroCommand = { type: 'hero'; op: 'equip' | 'unequip' | 'use' | 'drop'; item?: number; slot?: number };

/** Why an action was refused (fx type 15, v = reason). */
export const Why = { Class: 1, Need: 2, Known: 3, Full: 4, Heavy: 5, Dead: 6, None: 7, NoEffect: 8, Gold: 9, Far: 10, Busy: 11 } as const;
export const WHY_TEXT = ['', 'Wrong class for this item.', 'Attribute too low for this item.', 'You already know that spell.', 'The pack is full.', 'Too heavy to carry.', 'The hero has fallen.', 'You do not have that.', 'It would have no effect now.', 'Not enough gold.', 'Walk closer to go in.', 'You already carry three quests.'] as const;
/** Item events (fx type 14, v = item id, el = what happened). */
export const Did = { Pick: 0, Equip: 1, Use: 2, Learn: 3, Drop: 4, Unequip: 5 } as const;

export const skillNeed = (level: number): number => 8 * (level + 1);
export const capacityOf = (body: number): number => 20 + 4 * body;

/** Attributes with the bonuses of everything worn. */
export function totals(h: HeroState): number[] {
  const t = h.attr.slice();
  for (const id of h.eq) {
    if (id < 0) continue;
    const a = ITEMS[id].attr;
    for (let k = 0; k < 4; k++) t[k] += a[k];
  }
  return t;
}

export function weightOf(h: HeroState): number {
  let w = 0;
  for (const s of h.inv) w += ITEMS[s.item].w * s.n;
  for (const id of h.eq) if (id >= 0) w += ITEMS[id].w;
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
  const res = [0, 0, 0, 0, 0];
  const pdef = [0, 0, 0, 0];
  const pabs = [0, 0, 0, 0];
  for (const id of h.eq) {
    if (id < 0) continue;
    const d = ITEMS[id];
    min += d.min;
    max += d.max;
    acc += d.acc;
    for (let k = 0; k < PART_COUNT; k++) {
      if (((d.cover >> k) & 1) === 0) continue;
      pdef[k] += d.def;
      pabs[k] += d.abs;
    }
    pow += d.pow;
    hp += d.hp;
    mana += d.mana;
    for (let k = 0; k < 5; k++) res[k] += d.res[k];
  }
  const [blade, guard, sorc] = h.skill;
  const mage = h.cls === Cls.Mage;
  const dmgMin = min + (t[0] >> 1) + Math.floor((base.min * blade * 5) / 100) - (mage ? 4 : 0);
  const dmgMax = max + (t[0] >> 1) + Math.floor((base.max * blade * 5) / 100) - (mage ? 6 : 0);
  return {
    attr: t,
    hpMax: Math.min(32000, 40 + 10 * t[0] + hp),
    manaMax: 10 + 7 * t[2] + mana,
    min: Math.max(1 - base.min, dmgMin),
    max: Math.max(1 - base.max, dmgMax),
    acc: acc + (t[1] >> 1),
    def: t[1] >> 1,
    abs: Math.floor(guard / 3),
    pdef,
    pabs,
    res: res.map((v) => Math.min(80, v + (t[3] >> 1))),
    pow: Math.max(0, (t[2] - 3) * 3 + sorc * 4 + pow),
    regen: t[3] >> 2,
    capacity: capacityOf(t[0]),
    weight: weightOf(h),
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
}

/** The hero a new game starts with. Also used by the creation sheet to preview the choice. */
export function startState(id: number, cls: number, female: boolean, diff: number): HeroState {
  const attr = BASE_ATTR[cls === Cls.Mage ? 1 : 0].slice();
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
    known: cls === Cls.Mage ? (1 << 0) | (1 << 4) | (1 << 7) : 1 << 7, // Fire Bolt, Frost Bolt, Healing; the warrior knows Healing
  };
  h.eq[Slot.Weapon] = itemId(cls === Cls.Mage ? 'Oak Staff' : 'Rusty Sword');
  h.eq[Slot.Armor] = itemId(cls === Cls.Mage ? 'Cloth Robe' : 'Padded Jerkin');
  h.inv.push({ item: itemId('Healing Draught'), n: START_DRAUGHTS[diff] });
  if (cls === Cls.Mage) h.inv.push({ item: itemId('Mana Draught'), n: 1 });
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
  const d = ITEMS[item];
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
  const d = ITEMS[item];
  if (d.kind === Ik.Gear && (d.cls & (h.cls === Cls.Mage ? CLS_MAGE : CLS_WARRIOR)) === 0) return Why.Class;
  if (d.needv > 0 && totals(h)[d.need] < d.needv) return Why.Need;
  if (d.kind === Ik.Learn && ((h.known >>> d.spell) & 1) === 1) return Why.Known;
  return 0;
}

function equip(sim: Sim, item: number): void {
  const h = sim.hero!;
  const d = ITEMS[item];
  if (!h.inv.some((x) => x.item === item)) return refuse(sim, Why.None);
  const why = blocker(h, item);
  if (why) return refuse(sim, why);
  takeItem(h, item);
  const old = h.eq[d.slot];
  h.eq[d.slot] = item;
  if (old >= 0) h.inv.push({ item: old, n: 1 });
  recalc(sim);
  done(sim, item, Did.Equip);
}

function useItem(sim: Sim, item: number): void {
  const h = sim.hero!;
  const d = ITEMS[item];
  const cb = sim.cb;
  const i = h.id;
  if (!h.inv.some((x) => x.item === item)) return refuse(sim, Why.None);
  if (d.kind === Ik.Gear) return equip(sim, item);
  const why = blocker(h, item);
  if (why) return refuse(sim, why);
  if (d.heal > 0) {
    if (cb.hp[i] >= cb.hpMax[i]) return refuse(sim, Why.NoEffect);
    cb.hp[i] = Math.min(cb.hpMax[i], cb.hp[i] + d.heal);
    cb.emit(7, sim.x[i], sim.y[i], d.heal, 0);
  } else if (d.restore > 0) {
    if (cb.mana[i] >= cb.manaMax[i]) return refuse(sim, Why.NoEffect);
    cb.mana[i] = Math.min(cb.manaMax[i], cb.mana[i] + d.restore);
  } else if (d.grow > 0) {
    h.attr[d.grow - 1]++;
    recalc(sim);
  } else if (d.spell >= 0) {
    h.known |= 1 << d.spell;
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

export function heroCommand(sim: Sim, cmd: HeroCommand): void {
  const h = sim.hero;
  if (h === null) return;
  if (sim.cb.hp[h.id] <= 0) return refuse(sim, Why.Dead);
  switch (cmd.op) {
    case 'equip':
      if (cmd.item !== undefined && cmd.item >= 0 && cmd.item < ITEMS.length && ITEMS[cmd.item].kind === Ik.Gear) equip(sim, cmd.item);
      return;
    case 'use':
      if (cmd.item !== undefined && cmd.item >= 0 && cmd.item < ITEMS.length) useItem(sim, cmd.item);
      return;
    case 'unequip': {
      const s = cmd.slot ?? -1;
      if (s < 0 || s >= SLOT_COUNT || h.eq[s] < 0) return;
      if (h.inv.length >= INV_MAX) return refuse(sim, Why.Full);
      const item = h.eq[s];
      h.eq[s] = -1;
      h.inv.push({ item, n: 1 });
      recalc(sim);
      done(sim, item, Did.Unequip);
      return;
    }
    case 'drop': {
      if (cmd.item === undefined || !takeItem(h, cmd.item)) return refuse(sim, Why.None);
      if (!dropBag(sim, cmd.item)) {
        addItem(h, cmd.item);
        return refuse(sim, Why.Full);
      }
      done(sim, cmd.item, Did.Drop);
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
  done(sim, item, Did.Pick);
}

/** A foe fell: maybe leave an item bag where it lay. Only games with a hero have item loot. */
export function dropLoot(sim: Sim, t: number): void {
  if (sim.hero === null || sim.team[t] === 0) return;
  const rule = LOOT_RULES[sim.cb.kind[t]];
  if (rule[0] === 0 || sim.rng.int(100) >= rule[0]) return;
  const item = rollLoot((n) => sim.rng.int(n), rule[1], rule[2]);
  const cb = sim.cb;
  for (let b = 0; b < cb.bI.length; b++) {
    if (cb.bI[b]) continue;
    cb.bX[b] = sim.x[t] + 60;
    cb.bY[b] = sim.y[t] - 40;
    cb.bI[b] = item + 1;
    return;
  }
}

export function cloneHero(h: HeroState | null): HeroState | null {
  return h === null ? null : { ...h, attr: h.attr.slice(), skill: h.skill.slice(), use: h.use.slice(), inv: h.inv.map((s) => ({ ...s })), eq: h.eq.slice() };
}

export function hashHero(h: HeroState | null, mix: (v: number) => void): void {
  if (h === null) return;
  for (const v of h.attr) mix(v);
  for (const v of h.skill) mix(v);
  for (const v of h.use) mix(v);
  for (const v of h.eq) mix(v + 1);
  for (const s of h.inv) {
    mix(s.item);
    mix(s.n);
  }
  mix(h.known);
}

export { ATTR_NAMES };
