/**
 * Quest Log Navigation & Objective Tracking
 * Handles navigation targeting, camera centering, pulsing markers,
 * and edge-of-screen indicator arrow math for campaign objectives.
 */

export interface QuestObjective {
  readonly id: string;
  readonly text: string;
  readonly completed: boolean;
  readonly current: number;
  readonly total: number;
  readonly optional?: boolean;
  readonly targetX?: number;
  readonly targetY?: number;
}

export interface QuestReward {
  readonly gold: number;
  readonly xp: number;
  readonly renown: string;
  readonly item: string;
}

export interface QuestDossier {
  readonly id: string;
  readonly category: 'main' | 'side' | 'completed';
  readonly actTitle: string;
  readonly title: string;
  readonly location: string;
  readonly narrative: string;
  readonly objectives: readonly QuestObjective[];
  readonly rewards: QuestReward;
  readonly sealText?: string;
}

export interface ActiveNavigationTarget {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly startedAt: number;
}

export interface ViewportTiles {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface EdgeArrowResult {
  readonly isOutside: boolean;
  readonly edgeX: number;
  readonly edgeY: number;
  readonly angle: number;
  readonly distanceTiles: number;
}

export interface ScreenEdgeArrowResult {
  readonly isOutside: boolean;
  readonly screenX: number;
  readonly screenY: number;
  readonly angle: number;
  readonly distancePx: number;
}

export class QuestNavigator {
  private currentTarget: ActiveNavigationTarget | null = null;

  public setTarget(x: number, y: number, label: string, now: number = performance.now()): ActiveNavigationTarget {
    this.currentTarget = {
      x,
      y,
      label,
      startedAt: now,
    };
    return this.currentTarget;
  }

  public clearTarget(): void {
    this.currentTarget = null;
  }

  public getTarget(): ActiveNavigationTarget | null {
    return this.currentTarget;
  }

  public hasActiveTarget(): boolean {
    return this.currentTarget !== null;
  }

  /**
   * Check if a unit (e.g. hero) has arrived within threshold distance of current target.
   */
  public isArrived(unitTileX: number, unitTileY: number, threshold: number = 2.5): boolean {
    if (!this.currentTarget) return false;
    const dx = unitTileX - this.currentTarget.x;
    const dy = unitTileY - this.currentTarget.y;
    return Math.hypot(dx, dy) <= threshold;
  }

  /**
   * Calculate edge indicator on a tile viewport (such as for minimap or strategic tile math).
   */
  public computeEdgeIndicator(view: ViewportTiles, marginTiles: number = 1.0): EdgeArrowResult | null {
    if (!this.currentTarget) return null;
    const { x, y } = this.currentTarget;
    const isInside =
      x >= view.x0 + marginTiles &&
      x <= view.x1 - marginTiles &&
      y >= view.y0 + marginTiles &&
      y <= view.y1 - marginTiles;

    const cx = (view.x0 + view.x1) / 2;
    const cy = (view.y0 + view.y1) / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    if (isInside) {
      return {
        isOutside: false,
        edgeX: x,
        edgeY: y,
        angle,
        distanceTiles: dist,
      };
    }

    // Intersect ray from (cx, cy) with viewport rectangle boundary
    const halfW = Math.max(0.5, (view.x1 - view.x0) / 2 - marginTiles);
    const halfH = Math.max(0.5, (view.y1 - view.y0) / 2 - marginTiles);
    const scaleX = halfW / Math.max(Math.abs(dx), 1e-4);
    const scaleY = halfH / Math.max(Math.abs(dy), 1e-4);
    const scale = Math.min(scaleX, scaleY);

    const edgeX = cx + dx * scale;
    const edgeY = cy + dy * scale;

    return {
      isOutside: true,
      edgeX,
      edgeY,
      angle,
      distanceTiles: dist,
    };
  }

  /**
   * Compute exact screen pixel position and angle for an edge indicator arrow on the main viewport.
   */
  public computeScreenEdgeArrow(
    camX: number,
    camY: number,
    viewW: number,
    viewH: number,
    zoom: number,
    tileSize: number = 32,
    marginPx: number = 32,
  ): ScreenEdgeArrowResult | null {
    if (!this.currentTarget) return null;

    const targetWorldX = (this.currentTarget.x + 0.5) * tileSize;
    const targetWorldY = (this.currentTarget.y + 0.5) * tileSize;

    const targetScreenX = targetWorldX * zoom - camX;
    const targetScreenY = targetWorldY * zoom - camY;

    const isInside =
      targetScreenX >= marginPx &&
      targetScreenX <= viewW - marginPx &&
      targetScreenY >= marginPx &&
      targetScreenY <= viewH - marginPx;

    const cx = viewW / 2;
    const cy = viewH / 2;
    const dx = targetScreenX - cx;
    const dy = targetScreenY - cy;
    const angle = Math.atan2(dy, dx);
    const distPx = Math.hypot(dx, dy);

    if (isInside) {
      return {
        isOutside: false,
        screenX: targetScreenX,
        screenY: targetScreenY,
        angle,
        distancePx: distPx,
      };
    }

    const maxDeltaX = Math.max(10, cx - marginPx);
    const maxDeltaY = Math.max(10, cy - marginPx);
    const scaleX = maxDeltaX / Math.max(Math.abs(dx), 1e-4);
    const scaleY = maxDeltaY / Math.max(Math.abs(dy), 1e-4);
    const scale = Math.min(scaleX, scaleY);

    const screenX = cx + dx * scale;
    const screenY = cy + dy * scale;

    return {
      isOutside: true,
      screenX,
      screenY,
      angle,
      distancePx: distPx,
    };
  }

  /**
   * Get pulse wave progress (0..1) for rendering pulsing rings.
   */
  public getPulsePhase(periodMs: number = 1200, now: number = performance.now()): number {
    return (now % periodMs) / periodMs;
  }
}

/** Global singleton instance for easy cross-module access */
export const globalQuestNavigator = new QuestNavigator();
