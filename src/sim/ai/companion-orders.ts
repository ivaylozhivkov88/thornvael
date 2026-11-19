export type CompanionOrder = 'follow' | 'hold' | 'attack';
export type CompanionArchetype = 'warrior' | 'archer' | 'mage';

export interface CompanionUnitState {
  id: number;
  archetype: CompanionArchetype;
  order: CompanionOrder;
  x: number; // fixed-point (FP = 256)
  y: number;
  holdX: number;
  holdY: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  resurrectCd: number;
  targetId: number; // -1 when none
  level: number;
}

export interface CompanionEnemyView {
  id: number;
  x: number;
  y: number;
  alive: boolean;
}

export interface CompanionDecision {
  action: 'idle' | 'move_to_hero' | 'move_to_hold' | 'attack_target' | 'resurrected';
  destX: number;
  destY: number;
  targetId: number;
}

export interface CompanionSnapshot {
  state: CompanionUnitState;
}

const FP = 256;
const FOLLOW_DIST_SQ = (2 * FP) * (2 * FP);
const LEASH_DIST_SQ = (10 * FP) * (10 * FP);
const AGGRO_FOLLOW_SQ = (6 * FP) * (6 * FP);
const AGGRO_ATTACK_SQ = (12 * FP) * (12 * FP);
const HOLD_RANGE_SQ = (3 * FP) * (3 * FP);
const RESURRECT_TICKS = 250;

const ORDER_CODE: Record<CompanionOrder, number> = { follow: 1, hold: 2, attack: 3 };
const ARCH_CODE: Record<CompanionArchetype, number> = { warrior: 1, archer: 2, mage: 3 };

/**
 * Deterministic Mercenary / Companion Order State Machine (E7).
 */
export class CompanionController {
  readonly state: CompanionUnitState;

  constructor(id: number, archetype: CompanionArchetype, x: number, y: number, maxHp = 180, level = 1) {
    this.state = {
      id,
      archetype,
      order: 'follow',
      x: x | 0,
      y: y | 0,
      holdX: x | 0,
      holdY: y | 0,
      hp: maxHp | 0,
      maxHp: Math.max(1, maxHp | 0),
      alive: true,
      resurrectCd: 0,
      targetId: -1,
      level: Math.max(1, level | 0),
    };
  }

  /** Issue an order (`follow` | `hold` | `attack`). */
  setOrder(order: CompanionOrder, anchorX?: number, anchorY?: number): void {
    this.state.order = order;
    if (order === 'hold') {
      this.state.holdX = (anchorX ?? this.state.x) | 0;
      this.state.holdY = (anchorY ?? this.state.y) | 0;
    }
    if (order !== 'attack') {
      this.state.targetId = -1;
    }
  }

  /** Apply damage to the companion; starts resurrect cooldown on death. */
  damage(amount: number): void {
    if (!this.state.alive || amount <= 0) return;
    this.state.hp = Math.max(0, this.state.hp - (amount | 0));
    if (this.state.hp === 0) {
      this.state.alive = false;
      this.state.targetId = -1;
      this.state.resurrectCd = RESURRECT_TICKS;
    }
  }

  /** Resurrect immediately (e.g. paid at town/shrine) or when cooldown completes. */
  resurrect(x: number, y: number): boolean {
    if (this.state.alive) return false;
    this.state.alive = true;
    this.state.hp = this.state.maxHp;
    this.state.resurrectCd = 0;
    this.state.x = x | 0;
    this.state.y = y | 0;
    return true;
  }

  /** Evaluate 1 tick of companion AI and return the deterministic decision. */
  step(heroX: number, heroY: number, enemies: readonly CompanionEnemyView[]): CompanionDecision {
    const s = this.state;
    const hx = heroX | 0;
    const hy = heroY | 0;

    if (!s.alive) {
      if (s.resurrectCd > 0) s.resurrectCd--;
      if (s.resurrectCd === 0) {
        this.resurrect(hx, hy);
        return { action: 'resurrected', destX: s.x, destY: s.y, targetId: -1 };
      }
      return { action: 'idle', destX: s.x, destY: s.y, targetId: -1 };
    }

    const heroDistSq = (s.x - hx) * (s.x - hx) + (s.y - hy) * (s.y - hy);

    // Leash check in follow mode
    if (s.order === 'follow' && heroDistSq > LEASH_DIST_SQ) {
      s.targetId = -1;
      return { action: 'move_to_hero', destX: hx, destY: hy, targetId: -1 };
    }

    const searchRangeSq =
      s.order === 'attack' ? AGGRO_ATTACK_SQ : s.order === 'hold' ? HOLD_RANGE_SQ : AGGRO_FOLLOW_SQ;
    const originX = s.order === 'hold' ? s.holdX : s.x;
    const originY = s.order === 'hold' ? s.holdY : s.y;

    let bestId = -1;
    let bestDistSq = searchRangeSq + 1;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive) continue;
      const dx = e.x - originX;
      const dy = e.y - originY;
      const d2 = dx * dx + dy * dy;
      if (d2 <= searchRangeSq && (d2 < bestDistSq || (d2 === bestDistSq && e.id < bestId))) {
        bestDistSq = d2;
        bestId = e.id;
      }
    }

    if (bestId !== -1) {
      s.targetId = bestId;
      const target = enemies.find((e) => e.id === bestId)!;
      return { action: 'attack_target', destX: target.x, destY: target.y, targetId: bestId };
    }

    s.targetId = -1;
    if (s.order === 'hold') {
      const holdDistSq = (s.x - s.holdX) * (s.x - s.holdX) + (s.y - s.holdY) * (s.y - s.holdY);
      if (holdDistSq > FP) {
        return { action: 'move_to_hold', destX: s.holdX, destY: s.holdY, targetId: -1 };
      }
      return { action: 'idle', destX: s.holdX, destY: s.holdY, targetId: -1 };
    }

    if (heroDistSq > FOLLOW_DIST_SQ) {
      return { action: 'move_to_hero', destX: hx, destY: hy, targetId: -1 };
    }
    return { action: 'idle', destX: s.x, destY: s.y, targetId: -1 };
  }

  hashInto(mix: (v: number) => void): void {
    const s = this.state;
    mix(s.id);
    mix(ARCH_CODE[s.archetype]);
    mix(ORDER_CODE[s.order]);
    mix(s.x);
    mix(s.y);
    mix(s.holdX);
    mix(s.holdY);
    mix(s.hp);
    mix(s.alive ? 1 : 0);
    mix(s.resurrectCd);
    mix(s.targetId);
    mix(s.level);
  }

  hash(): number {
    let h = 0x811c9dc5;
    this.hashInto((v) => {
      h = Math.imul(h ^ (v & 0xff), 0x01000193);
      h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193);
      h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193);
      h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193);
    });
    return h >>> 0;
  }

  snapshot(): CompanionSnapshot {
    return { state: { ...this.state } };
  }

  restore(snap: CompanionSnapshot): void {
    Object.assign(this.state, snap.state);
  }
}
