import type { Fx } from './sim/combat';
import { St } from './sim/spelldata';

/** Pure audio decisions (no Web Audio here), so voice limits, panning and event mapping are unit-tested. */

export const MAX_VOICES = 12;

export interface SoundCue {
  name: string;
  priority: number; // higher survives a full voice pool
}

const CURSE_STATUSES = new Set<number>([St.Slow, St.Poison, St.Burn, St.Stone, St.Weaken]);
const CAST = ['', 'cast_fire', 'cast_water', 'cast_air', 'cast_earth', 'cast_astral'];

/** Which sound a combat event makes, or null for silence. Events with `v` >= 16 in type 8 are "status ended" and stay silent. */
export function cueFor(e: Pick<Fx, 'type' | 'v' | 'el'>): SoundCue | null {
  switch (e.type) {
    case 0:
      return e.el === 0 ? { name: 'hit', priority: 1 } : null; // spells have their own cast and boom sounds
    case 1:
      return { name: 'miss', priority: 1 };
    case 2:
      return { name: 'death', priority: 3 };
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
      return e.el >= 1 && e.el <= 5 ? { name: CAST[e.el], priority: 3 } : null;
    case 10:
      return { name: e.v === 1 ? 'revive' : e.v === 2 ? 'buff' : 'boom', priority: 3 };
    case 11:
      return { name: 'hit', priority: 1 };
    case 12:
      return { name: 'bow', priority: 1 };
    case 14:
      return { name: e.el === 0 ? 'gold' : e.el === 3 ? 'revive' : 'buff', priority: 4 }; // item picked up, worn, used or learned
    case 15:
      return { name: 'nomana', priority: 5 }; // an item action was refused
    case 6:
      return { name: 'buff', priority: 3 }; // a skill rose
    default:
      return null;
  }
}

/** Minimum gap in milliseconds between two plays of the same sound, so a big battle does not machine-gun it. */
export const MIN_GAP: Record<string, number> = { hit: 45, miss: 70, step1: 110, step2: 110, bow: 60, death: 70, boom: 90, gold: 80, heal: 80, buff: 80, curse: 80 };

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
