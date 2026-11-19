/**
 * A8 — Camera Polish System:
 * - Exponential smooth follow damping
 * - Viewport edge-scroll margin solver with quadratic ramp
 * - Clamped zoom bounds & focal-point zoom solver
 * - Spell-cast recoil kick with spring decay
 * - Region-intro pan controller across landmark/region name
 * - All motion offsets, smoothing lag, recoil, and intro pans zeroed safely when reducedMotion is true
 */

import { type FxConfig } from './config';

export interface CameraPolishOptions {
  minZoom?: number;
  maxZoom?: number;
  followDamping?: number;
  edgeMarginPx?: number;
  edgeMaxSpeedPx?: number;
  recoilDecay?: number;
  maxRecoilPx?: number;
}

export interface EdgeScrollResult {
  dx: number;
  dy: number;
  active: boolean;
  edgeX: number; // -1..1
  edgeY: number; // -1..1
}

export interface FollowStepResult {
  camX: number;
  camY: number;
  settled: boolean;
}

export interface ZoomSolveResult {
  zoom: number;
  camX: number;
  camY: number;
}

export interface IntroPanState {
  active: boolean;
  regionName: string;
  progress: number;
  offsetX: number;
  offsetY: number;
}

export class CameraPolishSystem {
  readonly minZoom: number;
  readonly maxZoom: number;
  private readonly followDamping: number;
  private readonly edgeMarginPx: number;
  private readonly edgeMaxSpeedPx: number;
  private readonly recoilDecay: number;
  private readonly maxRecoilPx: number;

  private recoilX = 0;
  private recoilY = 0;

  private introActive = false;
  private introRegionName = '';
  private introElapsedMs = 0;
  private introDurationMs = 2200;
  private introStartOffsetX = 0;
  private introStartOffsetY = 0;
  private introOffsetX = 0;
  private introOffsetY = 0;

  constructor(private config: FxConfig, opts: CameraPolishOptions = {}) {
    this.minZoom = Math.max(0.25, opts.minZoom ?? 1);
    this.maxZoom = Math.max(this.minZoom, opts.maxZoom ?? 3);
    this.followDamping = Math.max(1, opts.followDamping ?? 9);
    this.edgeMarginPx = Math.max(4, opts.edgeMarginPx ?? 18);
    this.edgeMaxSpeedPx = Math.max(20, opts.edgeMaxSpeedPx ?? 540);
    this.recoilDecay = Math.max(1, opts.recoilDecay ?? 14);
    this.maxRecoilPx = Math.max(1, opts.maxRecoilPx ?? 10);
  }

  setConfig(config: FxConfig): void {
    this.config = config;
    if (config.reducedMotion) {
      this.zeroMotionState();
    }
  }

  private zeroMotionState(): void {
    this.recoilX = 0;
    this.recoilY = 0;
    this.introActive = false;
    this.introElapsedMs = 0;
    this.introOffsetX = 0;
    this.introOffsetY = 0;
  }

  /** Clamp zoom strictly within [minZoom, maxZoom]. */
  clampZoom(zoom: number): number {
    if (!Number.isFinite(zoom)) return this.minZoom;
    return Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  /** Clamp camera coordinates cleanly to map world bounds. */
  clampCamera(
    camX: number,
    camY: number,
    zoom: number,
    mapW: number,
    mapH: number,
    viewW: number,
    viewH: number,
    tilePx = 32,
  ): { camX: number; camY: number } {
    const z = this.clampZoom(zoom);
    const mw = mapW * tilePx * z;
    const mh = mapH * tilePx * z;
    const clampedX = mw <= viewW ? -Math.floor((viewW - mw) / 2) : Math.max(0, Math.min(mw - viewW, Math.round(camX)));
    const clampedY = mh <= viewH ? -Math.floor((viewH - mh) / 2) : Math.max(0, Math.min(mh - viewH, Math.round(camY)));
    return { camX: clampedX, camY: clampedY };
  }

  /** Solve zoom change around a screen anchor point within clamped zoom and map bounds. */
  solveZoomAroundPoint(
    camX: number,
    camY: number,
    currentZoom: number,
    requestedZoom: number,
    screenX: number,
    screenY: number,
    mapW: number,
    mapH: number,
    viewW: number,
    viewH: number,
    tilePx = 32,
  ): ZoomSolveResult {
    const prevZ = this.clampZoom(currentZoom);
    const nextZ = this.clampZoom(requestedZoom);
    if (nextZ === prevZ) {
      return { zoom: prevZ, camX, camY };
    }
    const wx = (screenX + camX) / prevZ;
    const wy = (screenY + camY) / prevZ;
    const rawX = wx * nextZ - screenX;
    const rawY = wy * nextZ - screenY;
    const clamped = this.clampCamera(rawX, rawY, nextZ, mapW, mapH, viewW, viewH, tilePx);
    return { zoom: nextZ, camX: clamped.camX, camY: clamped.camY };
  }

  /** Smooth exponential follow damping (snaps directly when reducedMotion is true). */
  stepFollow(
    currentCamX: number,
    currentCamY: number,
    targetWorldX: number,
    targetWorldY: number,
    zoom: number,
    viewW: number,
    viewH: number,
    dtMs: number,
  ): FollowStepResult {
    const z = this.clampZoom(zoom);
    const targetCamX = targetWorldX * z - viewW * 0.5;
    const targetCamY = targetWorldY * z - viewH * 0.5;

    if (this.config.reducedMotion) {
      return { camX: targetCamX, camY: targetCamY, settled: true };
    }

    const dx = targetCamX - currentCamX;
    const dy = targetCamY - currentCamY;
    if (Math.hypot(dx, dy) < 0.5) {
      return { camX: targetCamX, camY: targetCamY, settled: true };
    }

    const dt = Math.max(0, dtMs) / 1000;
    const factor = 1 - Math.exp(-this.followDamping * dt);
    return {
      camX: currentCamX + dx * factor,
      camY: currentCamY + dy * factor,
      settled: false,
    };
  }

  /**
   * Solve smooth edge-scroll displacement when pointer sits inside edge margins.
   * Zeroed when pointer is outside viewport or reducedMotion disables automated edge drift.
   */
  solveEdgeScroll(
    pointerX: number,
    pointerY: number,
    viewW: number,
    viewH: number,
    dtMs: number,
    marginPx = this.edgeMarginPx,
    maxSpeedPx = this.edgeMaxSpeedPx,
  ): EdgeScrollResult {
    if (
      this.config.reducedMotion ||
      viewW <= 0 ||
      viewH <= 0 ||
      pointerX < 0 ||
      pointerY < 0 ||
      pointerX > viewW ||
      pointerY > viewH
    ) {
      return { dx: 0, dy: 0, active: false, edgeX: 0, edgeY: 0 };
    }

    const m = Math.max(1, marginPx);
    let edgeX = 0;
    let edgeY = 0;

    if (pointerX < m) edgeX = -(1 - pointerX / m);
    else if (pointerX > viewW - m) edgeX = 1 - (viewW - pointerX) / m;

    if (pointerY < m) edgeY = -(1 - pointerY / m);
    else if (pointerY > viewH - m) edgeY = 1 - (viewH - pointerY) / m;

    if (edgeX === 0 && edgeY === 0) {
      return { dx: 0, dy: 0, active: false, edgeX: 0, edgeY: 0 };
    }

    const dt = Math.max(0, dtMs) / 1000;
    const rampX = Math.sign(edgeX) * edgeX * edgeX;
    const rampY = Math.sign(edgeY) * edgeY * edgeY;
    return {
      dx: rampX * maxSpeedPx * dt,
      dy: rampY * maxSpeedPx * dt,
      active: true,
      edgeX,
      edgeY,
    };
  }

  /** Trigger a small directional camera recoil kick on spell cast (zeroed on reducedMotion). */
  triggerSpellRecoil(dirX: number, dirY: number, strength = 5.5): { x: number; y: number } {
    if (this.config.reducedMotion || !this.config.shakeEnabled) {
      this.recoilX = 0;
      this.recoilY = 0;
      return { x: 0, y: 0 };
    }
    const len = Math.hypot(dirX, dirY);
    const nx = len > 1e-4 ? dirX / len : 0;
    const ny = len > 1e-4 ? dirY / len : -1;
    const amp = Math.min(this.maxRecoilPx, Math.max(0, strength));
    // Kick opposite the cast vector for crisp tactile weight
    this.recoilX = Math.max(-this.maxRecoilPx, Math.min(this.maxRecoilPx, this.recoilX - nx * amp));
    this.recoilY = Math.max(-this.maxRecoilPx, Math.min(this.maxRecoilPx, this.recoilY - ny * amp));
    return { x: this.recoilX, y: this.recoilY };
  }

  getRecoilOffset(): { x: number; y: number } {
    if (this.config.reducedMotion) return { x: 0, y: 0 };
    return { x: this.recoilX, y: this.recoilY };
  }

  /** Start a smooth pan across a region landmark back to the hero/focus point (skipped on reducedMotion). */
  startIntroPan(
    fromWorldX: number,
    fromWorldY: number,
    toWorldX: number,
    toWorldY: number,
    regionName: string,
    durationMs = 2200,
    zoom = 1,
  ): boolean {
    if (this.config.reducedMotion) {
      this.introRegionName = regionName;
      this.zeroMotionState();
      return false;
    }
    const z = this.clampZoom(zoom);
    this.introRegionName = regionName;
    this.introDurationMs = Math.max(250, durationMs);
    this.introElapsedMs = 0;
    this.introStartOffsetX = (toWorldX - fromWorldX) * z;
    this.introStartOffsetY = (toWorldY - fromWorldY) * z;
    this.introOffsetX = this.introStartOffsetX;
    this.introOffsetY = this.introStartOffsetY;
    this.introActive = true;
    return true;
  }

  cancelIntroPan(): void {
    this.introActive = false;
    this.introElapsedMs = 0;
    this.introOffsetX = 0;
    this.introOffsetY = 0;
  }

  getIntroState(): IntroPanState {
    if (!this.introActive || this.config.reducedMotion) {
      return {
        active: false,
        regionName: this.introRegionName,
        progress: 1,
        offsetX: 0,
        offsetY: 0,
      };
    }
    return {
      active: true,
      regionName: this.introRegionName,
      progress: Math.min(1, this.introElapsedMs / this.introDurationMs),
      offsetX: this.introOffsetX,
      offsetY: this.introOffsetY,
    };
  }

  /** Combined non-destructive screen offset (world.position shift) for recoil + intro pan. */
  getTotalOffset(): { x: number; y: number } {
    if (this.config.reducedMotion) return { x: 0, y: 0 };
    return {
      x: this.recoilX + this.introOffsetX,
      y: this.recoilY + this.introOffsetY,
    };
  }

  update(dtMs: number): void {
    if (this.config.reducedMotion) {
      this.zeroMotionState();
      return;
    }

    const dt = Math.max(0, dtMs) / 1000;
    const decay = Math.exp(-this.recoilDecay * dt);
    this.recoilX *= decay;
    this.recoilY *= decay;
    if (Math.abs(this.recoilX) < 0.05) this.recoilX = 0;
    if (Math.abs(this.recoilY) < 0.05) this.recoilY = 0;

    if (this.introActive) {
      this.introElapsedMs += Math.max(0, dtMs);
      const t = Math.min(1, this.introElapsedMs / this.introDurationMs);
      const ease = t * t * (3 - 2 * t);
      const remaining = 1 - ease;
      this.introOffsetX = this.introStartOffsetX * remaining;
      this.introOffsetY = this.introStartOffsetY * remaining;
      if (t >= 1) {
        this.cancelIntroPan();
      }
    }
  }

  clear(): void {
    this.zeroMotionState();
    this.introRegionName = '';
  }
}
