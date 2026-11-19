/**
 * A9 — Cursor & Target Feedback:
 * - Cursor state machine: default | attack | pickup | talk | blocked | cast
 * - Ground click ripple ring emitter
 * - Enemy / loot hover outline descriptors colored by rarity tier
 */

import type { ItemRarity } from '../sim/town';
import { type FxConfig } from './config';
import { FxPool } from './pool';

export type CursorState = 'default' | 'attack' | 'pickup' | 'talk' | 'blocked' | 'cast';
export type ClickRippleKind = 'move' | 'attack' | 'pickup' | 'blocked' | 'cast';
export type EnemyRank = 'normal' | 'elite' | 'boss';

export interface CursorDescriptor {
  state: CursorState;
  cssCursor: string;
  tint: number;
  label: string;
}

export interface HoverTargetInput {
  kind: 'none' | 'ground' | 'enemy' | 'loot' | 'npc' | 'blocked';
  unitId?: number;
  lootId?: string;
  rarity?: ItemRarity;
  enemyRank?: EnemyRank;
  casting?: boolean;
}

export interface HoverOutlineDescriptor {
  visible: boolean;
  targetKind: 'enemy' | 'loot' | 'npc';
  targetId: string | number;
  color: number;
  thickness: number;
  alpha: number;
  rarity?: ItemRarity;
}

export interface ClickRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: number;
  alpha: number;
  lifeMs: number;
  maxLifeMs: number;
  kind: ClickRippleKind;
}

export const RARITY_COLORS: Readonly<Record<ItemRarity, number>> = {
  normal: 0xd8d8d8,
  magic: 0x4b7bec,
  rare: 0xf7d748,
  set: 0x2ecc71,
  unique: 0xd48c3c,
};

const ENEMY_RANK_COLORS: Readonly<Record<EnemyRank, number>> = {
  normal: 0xe03838,
  elite: 0xf39c12,
  boss: 0xff2040,
};

const CURSOR_SPECS: Readonly<Record<CursorState, CursorDescriptor>> = {
  default: { state: 'default', cssCursor: 'default', tint: 0xe8e0d0, label: 'Default' },
  attack: { state: 'attack', cssCursor: 'crosshair', tint: 0xe84040, label: 'Attack' },
  pickup: { state: 'pickup', cssCursor: 'pointer', tint: 0xf7d748, label: 'Pick Up' },
  talk: { state: 'talk', cssCursor: 'pointer', tint: 0x60d898, label: 'Talk' },
  blocked: { state: 'blocked', cssCursor: 'not-allowed', tint: 0x903030, label: 'Blocked' },
  cast: { state: 'cast', cssCursor: 'crosshair', tint: 0x70c8ff, label: 'Cast' },
};

const RIPPLE_COLORS: Readonly<Record<ClickRippleKind, number>> = {
  move: 0x80e880,
  attack: 0xff4848,
  pickup: 0xf7d748,
  blocked: 0x903030,
  cast: 0x70c8ff,
};

function createRipple(): ClickRipple {
  return {
    x: 0,
    y: 0,
    radius: 4,
    maxRadius: 22,
    color: 0x80e880,
    alpha: 0.9,
    lifeMs: 0,
    maxLifeMs: 320,
    kind: 'move',
  };
}

function resetRipple(r: ClickRipple): void {
  r.x = 0;
  r.y = 0;
  r.radius = 4;
  r.maxRadius = 22;
  r.color = 0x80e880;
  r.alpha = 0.9;
  r.lifeMs = 0;
  r.maxLifeMs = 320;
  r.kind = 'move';
}

export class CursorTargetSystem {
  readonly ripples: FxPool<ClickRipple>;
  private currentState: CursorState = 'default';
  private hoverOutline: HoverOutlineDescriptor | null = null;

  constructor(private config: FxConfig) {
    this.ripples = new FxPool<ClickRipple>(32, createRipple, resetRipple, config.maxRipples);
  }

  setConfig(config: FxConfig): void {
    this.config = config;
    this.ripples.setCap(config.maxRipples);
  }

  get state(): CursorState {
    return this.currentState;
  }

  getDescriptor(): CursorDescriptor {
    return CURSOR_SPECS[this.currentState];
  }

  getHoverOutline(): HoverOutlineDescriptor | null {
    return this.hoverOutline;
  }

  /** Transition cursor state and hover outline from current pointer target. */
  updateHover(target: HoverTargetInput): CursorDescriptor {
    if (target.casting && target.kind !== 'blocked') {
      this.currentState = 'cast';
    } else {
      switch (target.kind) {
        case 'enemy':
          this.currentState = 'attack';
          break;
        case 'loot':
          this.currentState = 'pickup';
          break;
        case 'npc':
          this.currentState = 'talk';
          break;
        case 'blocked':
          this.currentState = 'blocked';
          break;
        case 'ground':
        case 'none':
        default:
          this.currentState = 'default';
          break;
      }
    }

    if (target.kind === 'enemy' && target.unitId !== undefined) {
      const rank = target.enemyRank ?? 'normal';
      this.hoverOutline = {
        visible: true,
        targetKind: 'enemy',
        targetId: target.unitId,
        color: ENEMY_RANK_COLORS[rank],
        thickness: rank === 'boss' ? 3 : 2,
        alpha: 0.9,
      };
    } else if (target.kind === 'loot' && target.lootId !== undefined) {
      const rarity = target.rarity ?? 'normal';
      this.hoverOutline = {
        visible: true,
        targetKind: 'loot',
        targetId: target.lootId,
        color: RARITY_COLORS[rarity],
        thickness: rarity === 'unique' || rarity === 'set' ? 2.5 : 1.5,
        alpha: 0.95,
        rarity,
      };
    } else if (target.kind === 'npc' && target.unitId !== undefined) {
      this.hoverOutline = {
        visible: true,
        targetKind: 'npc',
        targetId: target.unitId,
        color: 0x60d898,
        thickness: 2,
        alpha: 0.85,
      };
    } else {
      this.hoverOutline = null;
    }

    return CURSOR_SPECS[this.currentState];
  }

  /** Emit a ground click ripple ring at world coordinates. */
  emitClickRipple(x: number, y: number, kind: ClickRippleKind = 'move'): ClickRipple | null {
    const r = this.ripples.acquire();
    if (!r) return null;
    r.x = x;
    r.y = y;
    r.radius = 4;
    r.maxRadius = kind === 'blocked' ? 16 : 24;
    r.color = RIPPLE_COLORS[kind];
    r.alpha = 0.9;
    r.lifeMs = 0;
    r.maxLifeMs = this.config.reducedMotion ? 200 : 340;
    r.kind = kind;
    return r;
  }

  update(dtMs: number): void {
    this.ripples.updateEach((r) => {
      r.lifeMs += dtMs;
      if (r.lifeMs >= r.maxLifeMs) return false;
      const t = r.lifeMs / r.maxLifeMs;
      const ease = 1 - (1 - t) * (1 - t);
      r.radius = 4 + (r.maxRadius - 4) * ease;
      r.alpha = 0.9 * (1 - t);
      return true;
    });
  }

  clear(): void {
    this.ripples.clear();
    this.currentState = 'default';
    this.hoverOutline = null;
  }
}
