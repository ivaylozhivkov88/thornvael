import type { Fx } from './sim/combat';
import { St } from './sim/spelldata';
import { getItemDef, Ik } from './sim/items';

/** Pure audio decisions (no Web Audio here), so voice limits, panning and event mapping are unit-tested. */

export const MAX_VOICES = 12;

export interface SoundCue {
  name: string;
  priority: number; // higher survives a full voice pool
}

export type WeaponSoundType = 'sword' | 'axe' | 'blunt' | 'mace' | 'hammer' | 'pierce' | 'dagger' | 'bow' | 'arrow';
export type ArmorSoundType = 'leather' | 'plate';

export const WEAPON_HITS: Record<string, readonly string[]> = {
  sword: ['hit_sword_1', 'hit_sword_2', 'hit_sword_3'],
  axe: ['hit_axe_1', 'hit_axe_2', 'hit_axe_3'],
  blunt: ['hit_blunt_1', 'hit_blunt_2', 'hit_blunt_3'],
  mace: ['hit_blunt_1', 'hit_blunt_2', 'hit_blunt_3'],
  hammer: ['hit_blunt_1', 'hit_blunt_2', 'hit_blunt_3'],
  pierce: ['hit_pierce_1', 'hit_pierce_2'],
  dagger: ['hit_dagger_1', 'hit_pierce_1', 'hit_pierce_2'],
  bow: ['hit_pierce_1', 'hit_pierce_2'],
  arrow: ['hit_pierce_1', 'hit_pierce_2'],
};

export const WEAPON_SWINGS: Record<string, readonly string[]> = {
  sword: ['swing_sword_1', 'swing_sword_2'],
  axe: ['swing_axe_1'],
  blunt: ['swing_axe_1'],
  mace: ['swing_axe_1'],
  hammer: ['swing_axe_1'],
};

export const SHIELD_BLOCKS: readonly string[] = ['block_shield_1', 'block_shield_2'];
export const POTION_DRINKS: readonly string[] = ['potion_drink_1', 'potion_drink_2'];

export const TERRAIN_STEPS: Record<string, readonly string[]> = {
  grass: ['step_grass_1', 'step_grass_2', 'step_grass_3'],
  dirt: ['step_dirt_1', 'step_dirt_2', 'step_dirt_3'],
  water: ['step_water_1', 'step_water_2'],
  marsh: ['step_water_1', 'step_water_2'],
  stone: ['step_stone_1', 'step_stone_2'],
  rock: ['step_stone_1', 'step_stone_2'],
};

const varIndices: Record<string, number> = {};

function nextVar(pool: readonly string[], key: string): string {
  const idx = (varIndices[key] ?? 0) % pool.length;
  varIndices[key] = idx + 1;
  return pool[idx];
}

export function resetAudioLogicCounters(): void {
  for (const k of Object.keys(varIndices)) delete varIndices[k];
}

export function classifyWeapon(nameOrItem: string): WeaponSoundType {
  const s = nameOrItem.toLowerCase();
  if (s.includes('axe') || s.includes('hatchet') || s.includes('decapitator')) return 'axe';
  if (s.includes('blunt') || s.includes('mace') || s.includes('hammer') || s.includes('cudgel') || s.includes('morningstar') || s.includes('greatmaul') || s.includes('staff') || s.includes('club')) return 'blunt';
  if (s.includes('dagger') || s.includes('dirk') || s.includes('stiletto') || s.includes('rondel') || s.includes('poignard') || s.includes('needle')) return 'dagger';
  if (s.includes('bow') || s.includes('arbalest') || s.includes('arrow') || s.includes('spear') || s.includes('pierce')) return 'pierce';
  return 'sword';
}

export function pickWeaponHit(weapon: string = 'sword', variant?: number): string {
  const norm = classifyWeapon(weapon);
  const pool = WEAPON_HITS[norm] ?? WEAPON_HITS.sword;
  if (variant !== undefined) return pool[Math.abs(variant) % pool.length];
  return nextVar(pool, `hit_${norm}`);
}

export function pickWeaponSwing(weapon: string = 'sword', variant?: number): string {
  const norm = classifyWeapon(weapon);
  const pool = WEAPON_SWINGS[norm] ?? WEAPON_SWINGS.sword;
  if (variant !== undefined) return pool[Math.abs(variant) % pool.length];
  return nextVar(pool, `swing_${norm}`);
}

export function pickShieldBlock(variant?: number): string {
  if (variant !== undefined) return SHIELD_BLOCKS[Math.abs(variant) % SHIELD_BLOCKS.length];
  return nextVar(SHIELD_BLOCKS, 'block_shield');
}

export function pickArmorImpact(armor: string): string {
  const norm = armor.toLowerCase();
  if (norm.includes('plate') || norm.includes('steel') || norm.includes('iron') || norm.includes('metal')) {
    return 'armor_plate';
  }
  return 'armor_leather';
}

export function pickPotionDrink(variant?: number): string {
  if (variant !== undefined) return POTION_DRINKS[Math.abs(variant) % POTION_DRINKS.length];
  return nextVar(POTION_DRINKS, 'potion_drink');
}

export function pickTerrainStep(terrain: number | string, variant?: number): string {
  let key = 'grass';
  if (typeof terrain === 'number') {
    switch (terrain) {
      case 0: key = 'grass'; break;
      case 1: key = 'dirt'; break;
      case 2: key = 'water'; break;
      case 3: key = 'stone'; break;
      case 4: key = 'water'; break;
      default: key = 'grass'; break;
    }
  } else {
    const s = terrain.toLowerCase();
    if (s.includes('dirt') || s.includes('earth') || s.includes('mud')) key = 'dirt';
    else if (s.includes('water') || s.includes('marsh') || s.includes('bog') || s.includes('swamp')) key = 'water';
    else if (s.includes('stone') || s.includes('rock') || s.includes('dungeon')) key = 'stone';
    else key = 'grass';
  }
  const pool = TERRAIN_STEPS[key] ?? TERRAIN_STEPS.grass;
  if (variant !== undefined) return pool[Math.abs(variant) % pool.length];
  return nextVar(pool, `step_${key}`);
}

export function pickMonsterDeath(kind: string | number = 'default'): string {
  const s = String(kind).toLowerCase();
  if (s.includes('skel') || s.includes('undead') || s.includes('bone')) return 'death_skeleton_1';
  if (s.includes('beast') || s.includes('wolf') || s.includes('boar') || s.includes('flesh') || s.includes('gnoll')) return 'death_beast_1';
  return 'death';
}

const CURSE_STATUSES = new Set<number>([St.Slow, St.Poison, St.Burn, St.Stone, St.Weaken]);
const CAST = ['', 'cast_fire', 'cast_water', 'cast_air', 'cast_earth', 'cast_astral'];
const APEX_SPELL_SFX: Record<number, string> = {
  24: 'spell_meteor',
  25: 'spell_inferno',
  26: 'spell_blizzard',
  27: 'spell_thunderstorm',
  28: 'spell_iron_skin',
  29: 'spell_acid_rain',
  30: 'spell_mana_burn',
  31: 'spell_time_warp',
};

export interface CueContext {
  weapon?: string;
  armor?: string;
  targetKind?: string | number;
  terrain?: string | number;
  variant?: number;
  isPotion?: boolean;
}

/** Which sound a combat event makes, or null for silence. Events with `v` >= 16 in type 8 are "status ended" and stay silent. */
export function cueFor(e: Pick<Fx, 'type' | 'v' | 'el'> & Partial<CueContext>, ctx?: CueContext): SoundCue | null {
  switch (e.type) {
    case 0: {
      if (e.el !== 0) return null; // spells have their own cast and boom sounds
      const wep = ctx?.weapon ?? e.weapon;
      if (wep) return { name: pickWeaponHit(wep, ctx?.variant ?? e.variant), priority: 1 };
      const armor = ctx?.armor ?? e.armor;
      if (armor) return { name: pickArmorImpact(armor), priority: 1 };
      return { name: 'hit', priority: 1 };
    }
    case 1:
      return { name: 'miss', priority: 1 };
    case 2: {
      const k = ctx?.targetKind ?? e.targetKind;
      if (k !== undefined) return { name: pickMonsterDeath(k), priority: 3 };
      return { name: 'death', priority: 3 };
    }
    case 3:
      return { name: 'gold', priority: 4 };
    case 4:
      return { name: 'nomana', priority: 5 };
    case 5:
      return { name: 'boom', priority: 3 };
    case 7:
      return { name: 'heal', priority: 2 };
    case 8:
      if (e.v >= 16) return null;
      return { name: CURSE_STATUSES.has(e.v) ? 'curse' : 'buff', priority: 2 };
    case 9:
      if (e.v >= 24 && e.v <= 31 && APEX_SPELL_SFX[e.v]) return { name: APEX_SPELL_SFX[e.v], priority: 4 };
      return e.el >= 1 && e.el <= 5 ? { name: CAST[e.el], priority: 3 } : null;
    case 10:
      return { name: e.v === 1 ? 'revive' : e.v === 2 ? 'buff' : 'boom', priority: 3 };
    case 11:
      return { name: pickShieldBlock(ctx?.variant ?? e.variant), priority: 2 };
    case 12:
      return { name: 'bow', priority: 1 };
    case 14: {
      // Did.Use = 2: item consumed
      if (e.el === 2) {
        let isPot = ctx?.isPotion ?? e.isPotion;
        if (isPot === undefined) {
          const d = getItemDef(e.v);
          if (d && (d.kind === Ik.Potion || /draught|potion|elixir/i.test(d.name))) isPot = true;
        }
        if (isPot) return { name: pickPotionDrink(ctx?.variant ?? e.variant), priority: 4 };
      }
      return { name: e.el === 0 ? 'gold' : e.el === 3 ? 'revive' : 'buff', priority: 4 }; // item picked up, worn, used or learned
    }
    case 15:
      return { name: 'nomana', priority: 5 }; // an item action was refused
    case 6:
      return { name: 'buff', priority: 3 }; // a skill rose
    default:
      return null;
  }
}

/** Minimum gap in milliseconds between two plays of the same sound, so a big battle does not machine-gun it. */
export const MIN_GAP: Record<string, number> = {
  hit: 45, miss: 70, step1: 110, step2: 110, bow: 60, death: 70, boom: 90, gold: 80, heal: 80, buff: 80, curse: 80,
  hit_sword_1: 45, hit_sword_2: 45, hit_sword_3: 45,
  swing_sword_1: 60, swing_sword_2: 60,
  hit_axe_1: 45, hit_axe_2: 45, hit_axe_3: 45,
  swing_axe_1: 60,
  hit_blunt_1: 45, hit_blunt_2: 45, hit_blunt_3: 45,
  hit_pierce_1: 45, hit_pierce_2: 45, hit_dagger_1: 45,
  block_shield_1: 50, block_shield_2: 50,
  armor_leather: 50, armor_plate: 50,
  potion_drink_1: 80, potion_drink_2: 80,
  step_grass_1: 100, step_grass_2: 100, step_grass_3: 100,
  step_dirt_1: 100, step_dirt_2: 100, step_dirt_3: 100,
  step_water_1: 100, step_water_2: 100,
  step_stone_1: 100, step_stone_2: 100,
  death_beast_1: 70, death_skeleton_1: 70,
};

export interface Voice {
  name: string;
  priority: number;
  start: number;
  end: number;
}

/** Decides whether a new sound may start, and which running one it replaces when all voices are busy. */
export class VoiceLimiter {
  private voices: Voice[] = [];
  private last = new Map<string, number>();
  rejected = 0;
  stolen = 0;

  constructor(readonly max = MAX_VOICES) {}

  get active(): number {
    return this.voices.length;
  }

  /** Returns 'play', 'skip' (too soon or no room), or the voice to cut ('steal'). `now` and `dur` in ms. */
  request(name: string, priority: number, now: number, dur: number): { action: 'play' | 'skip' | 'steal'; victim?: Voice; voice?: Voice } {
    this.voices = this.voices.filter((v) => v.end > now);
    const gap = MIN_GAP[name] ?? 0;
    const prev = this.last.get(name);
    if (prev !== undefined && now - prev < gap) {
      this.rejected++;
      return { action: 'skip' };
    }
    let result: { action: 'play' | 'skip' | 'steal'; victim?: Voice; voice?: Voice } = { action: 'play' };
    if (this.voices.length >= this.max) {
      // cut the lowest priority voice, oldest first, but only when the newcomer matters at least as much
      let victim = this.voices[0];
      for (const v of this.voices) if (v.priority < victim.priority || (v.priority === victim.priority && v.start < victim.start)) victim = v;
      if (victim.priority > priority) {
        this.rejected++;
        return { action: 'skip' };
      }
      this.voices.splice(this.voices.indexOf(victim), 1);
      this.stolen++;
      result = { action: 'steal', victim };
    }
    this.last.set(name, now);
    const voice = { name, priority, start: now, end: now + dur };
    this.voices.push(voice);
    result.voice = voice;
    return result;
  }
}

/**
 * Stereo pan and volume for a sound at screen point (sx, sy) in a view of w x h pixels.
 * Full volume on screen, fading to a quarter at one extra screen away and to silence beyond; pan follows the horizontal position.
 */
export function spatial(sx: number, sy: number, w: number, h: number): { pan: number; gain: number } {
  const dx = sx < 0 ? -sx : sx > w ? sx - w : 0;
  const dy = sy < 0 ? -sy : sy > h ? sy - h : 0;
  const away = Math.hypot(dx / w, dy / h); // 0 on screen, 1 means one screen width off
  const gain = away >= 1 ? 0 : 1 - 0.75 * away;
  const pan = Math.max(-0.8, Math.min(0.8, ((sx - w / 2) / (w / 2)) * 0.8));
  return { pan, gain };
}

/** Music follows the fight: battle music while enemies are in view, with six seconds of hysteresis before going back. */
export class MusicDirector {
  private last = -1e9;
  mode: 'explore' | 'battle' = 'explore';

  update(enemyInView: boolean, now: number): 'explore' | 'battle' {
    if (enemyInView) {
      this.last = now;
      this.mode = 'battle';
    } else if (this.mode === 'battle' && now - this.last > 6000) this.mode = 'explore';
    return this.mode;
  }
}
