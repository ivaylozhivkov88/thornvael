import { type CameraPolishSystem } from '../fx/camera-polish';
import { TILE } from '../map';
import { FP } from '../sim/sim';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export interface CameraViewport {
  readonly w: number;
  readonly h: number;
}

export interface CameraTileBounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface CameraControllerHost {
  getMap(): { readonly w: number; readonly h: number };
  getViewport(): CameraViewport;
}

/**
 * Manages camera viewport coordinates, bounds clamping, smooth follow damping,
 * edge scrolling, and focal-point zoom solving.
 */
export class RenderCameraController {
  camX: number;
  camY: number;
  zoom: number;

  constructor(
    private readonly host: CameraControllerHost,
    initial?: { camX?: number; camY?: number; zoom?: number },
  ) {
    this.camX = initial?.camX ?? 0;
    this.camY = initial?.camY ?? 0;
    this.zoom = initial?.zoom ?? 1;
  }

  get viewW(): number {
    return this.host.getViewport().w;
  }

  get viewH(): number {
    return this.host.getViewport().h;
  }

  /** Center camera on a tile coordinate and clamp to map bounds. */
  centerOn(tx: number, ty: number): void {
    const vp = this.host.getViewport();
    this.camX = tx * TILE * this.zoom - vp.w / 2;
    this.camY = ty * TILE * this.zoom - vp.h / 2;
    this.clamp();
  }

  /** Clamp camera coordinates within map dimensions (centering smaller maps). */
  clamp(): void {
    const map = this.host.getMap();
    const vp = this.host.getViewport();
    const mw = map.w * TILE * this.zoom;
    const mh = map.h * TILE * this.zoom;
    this.camX = mw <= vp.w ? -Math.floor((vp.w - mw) / 2) : Math.max(0, Math.min(mw - vp.w, Math.round(this.camX)));
    this.camY = mh <= vp.h ? -Math.floor((vp.h - mh) / 2) : Math.max(0, Math.min(mh - vp.h, Math.round(this.camY)));
  }

  /** Pan camera by delta screen pixels and clamp. */
  pan(dx: number, dy: number): void {
    this.camX -= dx;
    this.camY -= dy;
    this.clamp();
  }

  /** Change zoom by whole steps while keeping the world point under (sx, sy) anchored. */
  zoomBy(dir: 1 | -1, sx: number, sy: number, cameraPolish: CameraPolishSystem): boolean {
    const map = this.host.getMap();
    const vp = this.host.getViewport();
    const solved = cameraPolish.solveZoomAroundPoint(
      this.camX,
      this.camY,
      this.zoom,
      Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom + dir)),
      sx,
      sy,
      map.w,
      map.h,
      vp.w,
      vp.h,
      TILE,
    );
    if (solved.zoom === this.zoom) return false;
    this.zoom = solved.zoom;
    this.camX = solved.camX;
    this.camY = solved.camY;
    return true;
  }

  /** Smooth exponential follow damping toward a tile position (snaps under reducedMotion). */
  stepFollow(targetTileX: number, targetTileY: number, dtMs: number, cameraPolish: CameraPolishSystem): boolean {
    const vp = this.host.getViewport();
    const res = cameraPolish.stepFollow(
      this.camX,
      this.camY,
      targetTileX * TILE,
      targetTileY * TILE,
      this.zoom,
      vp.w,
      vp.h,
      dtMs,
    );
    this.camX = res.camX;
    this.camY = res.camY;
    this.clamp();
    return res.settled;
  }

  /** Apply quadratic viewport edge scroll when pointer lies inside edge margins. */
  stepEdgeScroll(
    pointerX: number,
    pointerY: number,
    dtMs: number,
    cameraPolish: CameraPolishSystem,
    marginPx?: number,
    maxSpeedPx?: number,
  ): boolean {
    const vp = this.host.getViewport();
    const res = cameraPolish.solveEdgeScroll(pointerX, pointerY, vp.w, vp.h, dtMs, marginPx, maxSpeedPx);
    if (!res.active) return false;
    this.camX += res.dx;
    this.camY += res.dy;
    this.clamp();
    return true;
  }

  /** Trigger a smooth intro pan from (fromTx, fromTy) back to (toTx, toTy) in tile coordinates. */
  triggerIntroPan(
    fromTx: number,
    fromTy: number,
    toTx: number,
    toTy: number,
    regionName: string,
    cameraPolish: CameraPolishSystem,
    durationMs = 2200,
  ): boolean {
    return cameraPolish.startIntroPan(
      fromTx * TILE,
      fromTy * TILE,
      toTx * TILE,
      toTy * TILE,
      regionName,
      durationMs,
      this.zoom,
    );
  }

  /** World point in tiles for a screen coordinate. */
  toTile(sx: number, sy: number): [number, number] {
    return [(sx + this.camX) / this.zoom / TILE, (sy + this.camY) / this.zoom / TILE];
  }

  /** Screen position of a fixed-point world coordinate. */
  pointScreen(fx: number, fy: number): [number, number] {
    const k = TILE / FP;
    return [fx * k * this.zoom - this.camX, fy * k * this.zoom - this.camY];
  }

  /** Visible camera rectangle in tile units. */
  viewTiles(): CameraTileBounds {
    const vp = this.host.getViewport();
    const s = TILE * this.zoom;
    return {
      x0: this.camX / s,
      y0: this.camY / s,
      x1: (this.camX + vp.w) / s,
      y1: (this.camY + vp.h) / s,
    };
  }
}
