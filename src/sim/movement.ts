import { isBlockedAt, type GameMap } from '../map';
import { DEFS, Kind, Ord } from './combat';
import { dir16 } from './path';
import { FP, type Sim } from './sim';

/** Deadzone radius around hero (in tiles, ~12-16px) to prevent rapid jitter when mouse is on the hero. */
export const DEADZONE_TILES = 0.5;
export const DEADZONE_FP = Math.round(DEADZONE_TILES * FP);

/** Interaction radius (in tiles) for auto pickup and object trigger. */
export const INTERACTION_RADIUS_TILES = 1.5;
export const INTERACTION_RADIUS_FP = Math.round(INTERACTION_RADIUS_TILES * FP);

/** Default hero step movement speed in tiles per tick. */
export const DEFAULT_HERO_MOVE_SPEED = 0.22;

export interface SteerVector {
  vx: number;
  vy: number;
  dist: number;
  inDeadzone: boolean;
  facing: number; // 0..15
}

export interface SlideResult {
  x: number;
  y: number;
  vx: number;
  vy: number;
  slid: boolean;
  blocked: boolean;
}

export type D2InteractableType = 'item' | 'chest' | 'shrine';

export interface D2Interactable {
  type: D2InteractableType;
  x: number; // tile coordinates
  y: number;
  id?: number;
  obj?: any;
}

export type D2ControllerAction =
  | { type: 'none' }
  | { type: 'hold_ground'; reason: 'target_died' | 'stopped' }
  | { type: 'stand_attack'; x: number; y: number; button: number; facing: number }
  | { type: 'attack_target'; targetId: number; inRange: boolean; facing: number }
  | { type: 'chase_target'; targetId: number; targetX: number; targetY: number }
  | { type: 'interact'; interactable: D2Interactable }
  | { type: 'move_to_interact'; x: number; y: number; interactable: D2Interactable }
  | {
      type: 'steer';
      targetX: number;
      targetY: number;
      vx: number;
      vy: number;
      facing: number;
      inDeadzone: boolean;
      slid: boolean;
      nextX: number;
      nextY: number;
    };

/**
 * Check if a tile coordinate is blocked by terrain, walls, or map bounds.
 */
export function isPointBlocked(map: GameMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return true;
  return isBlockedAt(map, Math.floor(x), Math.floor(y));
}

/**
 * Calculate steering velocity and facing towards target coordinate.
 * If distance is within deadzone, velocity is zeroed to prevent jitter.
 */
export function calcSteerVector(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  speed: number = DEFAULT_HERO_MOVE_SPEED,
  deadzone: number = DEADZONE_TILES,
): SteerVector {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  const facing = dist > 0.0001 ? dir16(Math.round(dx * 1000), Math.round(dy * 1000)) : 0;

  if (dist <= deadzone) {
    return {
      vx: 0,
      vy: 0,
      dist,
      inDeadzone: true,
      facing,
    };
  }

  const clampedSpeed = Math.min(speed, dist);
  const vx = (dx / dist) * clampedSpeed;
  const vy = (dy / dist) * clampedSpeed;

  return {
    vx,
    vy,
    dist,
    inDeadzone: false,
    facing,
  };
}

/**
 * Obstacle Sliding / Wall Deflection:
 * When moving along (vx, vy) into an obstacle, project the movement onto the open axis
 * (horizontal or vertical wall sliding) so the hero slides smoothly along walls.
 */
export function slideMove(
  map: GameMap,
  currentX: number,
  currentY: number,
  vx: number,
  vy: number,
  isBlockedFn: (map: GameMap, x: number, y: number) => boolean = isPointBlocked,
): SlideResult {
  if (vx === 0 && vy === 0) {
    return { x: currentX, y: currentY, vx: 0, vy: 0, slid: false, blocked: false };
  }

  const targetX = currentX + vx;
  const targetY = currentY + vy;

  // 1. Direct step unobstructed
  if (!isBlockedFn(map, targetX, targetY)) {
    return { x: targetX, y: targetY, vx, vy, slid: false, blocked: false };
  }

  // 2. Obstacle encountered! Wall deflection / axis projection
  const canMoveX = vx !== 0 && !isBlockedFn(map, targetX, currentY);
  const canMoveY = vy !== 0 && !isBlockedFn(map, currentX, targetY);

  if (canMoveX && !canMoveY) {
    // Wall deflects vertically -> slide horizontally along wall
    return { x: targetX, y: currentY, vx, vy: 0, slid: true, blocked: false };
  }

  if (canMoveY && !canMoveX) {
    // Wall deflects horizontally -> slide vertically along wall
    return { x: currentX, y: targetY, vx: 0, vy, slid: true, blocked: false };
  }

  if (canMoveX && canMoveY) {
    // Diagonal step into inner corner where both cardinal axes are open.
    // Slide along the axis with greater movement magnitude.
    if (Math.abs(vx) >= Math.abs(vy)) {
      return { x: targetX, y: currentY, vx, vy: 0, slid: true, blocked: false };
    } else {
      return { x: currentX, y: targetY, vx: 0, vy, slid: true, blocked: false };
    }
  }

  // 3. Both axes blocked (direct corner collision)
  return { x: currentX, y: currentY, vx: 0, vy: 0, slid: false, blocked: true };
}

/**
 * Fixed-point helper for sim step integration.
 */
export function slideMoveFP(
  map: GameMap,
  currentX_FP: number,
  currentY_FP: number,
  vx_FP: number,
  vy_FP: number,
): { x: number; y: number; slid: boolean; blocked: boolean } {
  const currentX = currentX_FP / FP;
  const currentY = currentY_FP / FP;
  const vx = vx_FP / FP;
  const vy = vy_FP / FP;
  const res = slideMove(map, currentX, currentY, vx, vy);
  return {
    x: Math.round(res.x * FP),
    y: Math.round(res.y * FP),
    slid: res.slid,
    blocked: res.blocked,
  };
}

/**
 * Classic ARPG Style Interaction Controller:
 * Handles continuous mouse-hold steering, enemy target-locking,
 * dead-enemy hold freeze, Shift force-stand attacks, obstacle sliding,
 * and automatic object/loot interaction.
 */
export class D2InteractionController {
  private isDown = false;
  private currentButton = 0; // 0: LMB, 2: RMB
  private shiftKey = false;
  private cursor = { x: 0, y: 0 }; // World tile coordinates
  private lockedEnemy: number | null = null;
  private lockedEnemyDied = false;
  private lockedInteractable: D2Interactable | null = null;

  get isHolding(): boolean {
    return this.isDown;
  }

  get button(): number {
    return this.currentButton;
  }

  get isShift(): boolean {
    return this.shiftKey;
  }

  get targetEnemyId(): number | null {
    return this.lockedEnemy;
  }

  get isTargetDead(): boolean {
    return this.lockedEnemyDied;
  }

  get currentInteractable(): D2Interactable | null {
    return this.lockedInteractable;
  }

  get cursorPos(): { x: number; y: number } {
    return { ...this.cursor };
  }

  onPointerDown(
    worldX: number,
    worldY: number,
    button = 0,
    shift = false,
    enemyId?: number,
    interactable?: D2Interactable,
  ): void {
    this.isDown = true;
    this.currentButton = button;
    this.shiftKey = shift;
    this.cursor = { x: worldX, y: worldY };
    this.lockedEnemyDied = false;

    if (enemyId !== undefined && enemyId >= 0) {
      this.lockedEnemy = enemyId;
      this.lockedInteractable = null;
    } else if (interactable) {
      this.lockedEnemy = null;
      this.lockedInteractable = interactable;
    } else {
      this.lockedEnemy = null;
      this.lockedInteractable = null;
    }
  }

  onPointerMove(worldX: number, worldY: number, shift?: boolean): void {
    this.cursor = { x: worldX, y: worldY };
    if (shift !== undefined) this.shiftKey = shift;
  }

  onPointerUp(button = 0): void {
    if (this.currentButton === button || button === -1) {
      this.isDown = false;
      this.lockedEnemy = null;
      this.lockedEnemyDied = false;
      this.lockedInteractable = null;
    }
  }

  setShift(shift: boolean): void {
    this.shiftKey = shift;
  }

  reset(): void {
    this.isDown = false;
    this.lockedEnemy = null;
    this.lockedEnemyDied = false;
    this.lockedInteractable = null;
  }

  /**
   * Evaluate one tick of D2 interaction logic for the hero unit.
   */
  step(sim: Sim, heroId = 0, moveSpeed: number = DEFAULT_HERO_MOVE_SPEED): D2ControllerAction {
    if (!this.isDown) return { type: 'none' };
    if (heroId < 0 || heroId >= sim.count || sim.cb.hp[heroId] <= 0 || sim.hidden[heroId]) {
      return { type: 'none' };
    }

    const hx = sim.x[heroId] / FP;
    const hy = sim.y[heroId] / FP;

    // 1. Shift Key: Stand Ground & Force Attack in Place
    if (this.shiftKey) {
      const dx = this.cursor.x - hx;
      const dy = this.cursor.y - hy;
      const facing = dir16(Math.round(dx * 1000), Math.round(dy * 1000));
      return {
        type: 'stand_attack',
        x: this.cursor.x,
        y: this.cursor.y,
        button: this.currentButton,
        facing,
      };
    }

    // 2. Locked Enemy Target
    if (this.lockedEnemyDied) {
      // Enemy died while button was held down: STOP and STAY PUT!
      // Do not run towards cursor into enemy packs until re-clicked.
      return { type: 'hold_ground', reason: 'target_died' };
    }

    if (this.lockedEnemy !== null) {
      const tid = this.lockedEnemy;
      const isAlive = tid >= 0 && tid < sim.count && sim.cb.hp[tid] > 0 && !sim.hidden[tid];
      if (!isAlive) {
        // Target died on this frame! Freeze hero in place as long as button remains held.
        this.lockedEnemyDied = true;
        this.lockedEnemy = null;
        return { type: 'hold_ground', reason: 'target_died' };
      }

      const tx = sim.x[tid] / FP;
      const ty = sim.y[tid] / FP;
      const dist = Math.hypot(tx - hx, ty - hy);
      const reach = (DEFS[sim.cb.kind[heroId]].reach / FP) + 0.35;
      const facing = dir16(Math.round((tx - hx) * 1000), Math.round((ty - hy) * 1000));

      if (dist <= reach) {
        // In range: repeatedly attack
        return {
          type: 'attack_target',
          targetId: tid,
          inRange: true,
          facing,
        };
      } else {
        // Out of range: continuously chase target's current position
        return {
          type: 'chase_target',
          targetId: tid,
          targetX: tx,
          targetY: ty,
        };
      }
    }

    // 3. Object Interaction / Item Pickup (dropped item, chest, shrine)
    if (this.lockedInteractable !== null) {
      const ix = this.lockedInteractable.x;
      const iy = this.lockedInteractable.y;
      const dist = Math.hypot(ix - hx, iy - hy);

      if (dist <= INTERACTION_RADIUS_TILES) {
        const item = this.lockedInteractable;
        this.lockedInteractable = null;
        return { type: 'interact', interactable: item };
      } else {
        return { type: 'move_to_interact', x: ix, y: iy, interactable: this.lockedInteractable };
      }
    }

    // 4. Continuous Mouse-Hold Movement on walkable ground
    const steer = calcSteerVector(hx, hy, this.cursor.x, this.cursor.y, moveSpeed);
    if (steer.inDeadzone) {
      return {
        type: 'steer',
        targetX: this.cursor.x,
        targetY: this.cursor.y,
        vx: 0,
        vy: 0,
        facing: steer.facing,
        inDeadzone: true,
        slid: false,
        nextX: hx,
        nextY: hy,
      };
    }

    // Obstacle sliding / wall deflection
    const slide = slideMove(sim.map, hx, hy, steer.vx, steer.vy);
    return {
      type: 'steer',
      targetX: this.cursor.x,
      targetY: this.cursor.y,
      vx: steer.vx,
      vy: steer.vy,
      facing: steer.facing,
      inDeadzone: false,
      slid: slide.slid,
      nextX: slide.x,
      nextY: slide.y,
    };
  }
}
