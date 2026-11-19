/**
 * A3 — Biome & Surface Footstep Emitter:
 * Emits surface-matched dust/splash/ripple particles triggered by unit stride distance:
 * - sand puff (desert, oasis, sand)
 * - snow crunch (highlands snow, snow)
 * - water / marsh ripple (water, marsh)
 * - volcanic ash flick (volcanic)
 * - stone / crypt dust (crypt, stone, ruinstone)
 * - grass turf (forest, grass)
 */

import { type FxConfig } from './config';
import { FxPool } from './pool';

export type FootstepSurface = 'sand' | 'snow' | 'water' | 'marsh' | 'volcanic' | 'stone' | 'crypt' | 'grass';
export type FootstepKind = 'puff' | 'crunch' | 'ripple' | 'ash' | 'dust';

export interface FootstepFx {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  endRadius: number;
  color: number;
  alpha: number;
  lifeMs: number;
  maxLifeMs: number;
  kind: FootstepKind;
  surface: FootstepSurface;
}

interface SurfaceStyle {
  kind: FootstepKind;
  color: number;
  startRadius: number;
  endRadius: number;
  lifeMs: number;
  upwardVy: number;
}

const SURFACE_STYLES: Readonly<Record<FootstepSurface, SurfaceStyle>> = {
  sand: { kind: 'puff', color: 0xd8b878, startRadius: 2.5, endRadius: 7.5, lifeMs: 360, upwardVy: -14 },
  snow: { kind: 'crunch', color: 0xe8f4ff, startRadius: 2.0, endRadius: 5.5, lifeMs: 320, upwardVy: -18 },
  water: { kind: 'ripple', color: 0x90d8ff, startRadius: 3.0, endRadius: 13.0, lifeMs: 460, upwardVy: 0 },
  marsh: { kind: 'ripple', color: 0x6b8e58, startRadius: 2.8, endRadius: 11.0, lifeMs: 440, upwardVy: -4 },
  volcanic: { kind: 'ash', color: 0xff6a28, startRadius: 1.8, endRadius: 4.5, lifeMs: 340, upwardVy: -24 },
  stone: { kind: 'dust', color: 0x9a9894, startRadius: 2.0, endRadius: 6.0, lifeMs: 300, upwardVy: -10 },
  crypt: { kind: 'dust', color: 0x7a8088, startRadius: 2.2, endRadius: 6.5, lifeMs: 340, upwardVy: -12 },
  grass: { kind: 'puff', color: 0x789858, startRadius: 1.8, endRadius: 4.8, lifeMs: 280, upwardVy: -12 },
};

const BIOME_TO_SURFACE: Readonly<Record<string, FootstepSurface>> = {
  desert: 'sand',
  oasis: 'sand',
  sand: 'sand',
  snow: 'snow',
  highlands: 'snow',
  water: 'water',
  marsh: 'marsh',
  volcanic: 'volcanic',
  crypt: 'crypt',
  ruinstone: 'stone',
  stone: 'stone',
  forest: 'grass',
  grass: 'grass',
};

export function resolveFootstepSurface(biomeOrSurface?: string): FootstepSurface {
  if (!biomeOrSurface) return 'stone';
  return BIOME_TO_SURFACE[biomeOrSurface.toLowerCase()] ?? 'stone';
}

function createFootstep(): FootstepFx {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 2,
    endRadius: 6,
    color: 0x9a9894,
    alpha: 0.7,
    lifeMs: 0,
    maxLifeMs: 320,
    kind: 'dust',
    surface: 'stone',
  };
}

function resetFootstep(f: FootstepFx): void {
  f.x = 0;
  f.y = 0;
  f.vx = 0;
  f.vy = 0;
  f.radius = 2;
  f.endRadius = 6;
  f.color = 0x9a9894;
  f.alpha = 0.7;
  f.lifeMs = 0;
  f.maxLifeMs = 320;
  f.kind = 'dust';
  f.surface = 'stone';
}

export class FootstepSystem {
  readonly footsteps: FxPool<FootstepFx>;
  private readonly strideAccum = new Map<number, { dist: number; side: 1 | -1 }>();
  private readonly strideDistance: number;

  constructor(private config: FxConfig, strideDistance = 22) {
    this.strideDistance = Math.max(4, strideDistance);
    const cap = Math.min(128, config.maxParticles);
    this.footsteps = new FxPool<FootstepFx>(128, createFootstep, resetFootstep, cap);
  }

  setConfig(config: FxConfig): void {
    this.config = config;
    this.footsteps.setCap(config.footstepsEnabled && !config.reducedMotion ? Math.min(128, config.maxParticles) : 0);
  }

  /**
   * Record unit displacement; emits a footstep effect whenever accumulated stride distance
   * crosses strideDistance. Returns true if a footstep was emitted.
   */
  recordMove(unitId: number, x: number, y: number, dx: number, dy: number, biomeOrSurface?: string): boolean {
    if (!this.config.footstepsEnabled || this.config.reducedMotion) {
      return false;
    }
    const stepLen = Math.hypot(dx, dy);
    if (stepLen <= 0.001) return false;

    let tracker = this.strideAccum.get(unitId);
    if (!tracker) {
      tracker = { dist: 0, side: 1 };
      this.strideAccum.set(unitId, tracker);
    }

    tracker.dist += stepLen;
    if (tracker.dist < this.strideDistance) return false;

    tracker.dist %= this.strideDistance;
    tracker.side = tracker.side === 1 ? -1 : 1;

    // Lateral offset perpendicular to movement direction
    const nx = -dy / stepLen;
    const ny = dx / stepLen;
    const offset = tracker.side * 3.5;

    const surface = resolveFootstepSurface(biomeOrSurface);
    this.emitFootstep(x + nx * offset, y + ny * offset, surface);
    return true;
  }

  emitFootstep(x: number, y: number, surface: FootstepSurface): FootstepFx | null {
    if (!this.config.footstepsEnabled || this.config.reducedMotion) return null;
    const f = this.footsteps.acquire();
    if (!f) return null;
    const style = SURFACE_STYLES[surface];
    f.x = x;
    f.y = y;
    f.vx = 0;
    f.vy = style.upwardVy;
    f.radius = style.startRadius;
    f.endRadius = style.endRadius;
    f.color = style.color;
    f.alpha = 0.72;
    f.lifeMs = 0;
    f.maxLifeMs = style.lifeMs;
    f.kind = style.kind;
    f.surface = surface;
    return f;
  }

  update(dtMs: number): void {
    const dt = Math.max(0, dtMs) / 1000;
    this.footsteps.updateEach((f) => {
      f.lifeMs += dtMs;
      if (f.lifeMs >= f.maxLifeMs) return false;
      const t = f.lifeMs / f.maxLifeMs;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.radius = f.radius + (f.endRadius - f.radius) * Math.min(1, dt * 6);
      f.alpha = 0.72 * (1 - t);
      return true;
    });
  }

  clear(): void {
    this.footsteps.clear();
    this.strideAccum.clear();
  }
}
