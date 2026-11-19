/**
 * Global FX quality & accessibility configuration for Thornvael.
 * Keeps mobile particle/decal/beam budgets strictly bounded and supports
 * reduced-motion accessibility.
 */

export type FxQuality = 'high' | 'low';

export interface FxConfig {
  quality: FxQuality;
  reducedMotion: boolean;
  maxParticles: number;
  maxDecals: number;
  maxBeams: number;
  maxRipples: number;
  maxLightBursts: number;
  hitStopEnabled: boolean;
  hitStopMaxFrames: number;
  shakeEnabled: boolean;
  footstepsEnabled: boolean;
  slowMoEnabled: boolean;
}

export interface FxQualityPreset {
  maxParticles: number;
  maxDecals: number;
  maxBeams: number;
  maxRipples: number;
  maxLightBursts: number;
  hitStopMaxFrames: number;
  footstepsEnabled: boolean;
}

export const FX_PRESETS: Readonly<Record<FxQuality, FxQualityPreset>> = {
  high: {
    maxParticles: 320,
    maxDecals: 80,
    maxBeams: 16,
    maxRipples: 24,
    maxLightBursts: 20,
    hitStopMaxFrames: 4,
    footstepsEnabled: true,
  },
  low: {
    maxParticles: 96,
    maxDecals: 24,
    maxBeams: 6,
    maxRipples: 10,
    maxLightBursts: 8,
    hitStopMaxFrames: 2,
    footstepsEnabled: false,
  },
};

export interface FxConfigOptions {
  quality?: FxQuality;
  reducedMotion?: boolean;
  maxParticles?: number;
  maxDecals?: number;
  maxBeams?: number;
  maxRipples?: number;
  maxLightBursts?: number;
  hitStopEnabled?: boolean;
  hitStopMaxFrames?: number;
  shakeEnabled?: boolean;
  footstepsEnabled?: boolean;
  slowMoEnabled?: boolean;
}

/** Detect low-end mobile heuristics safely in both browser and Node/Vitest. */
export function detectLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 8;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory;
  if (typeof mem === 'number' && mem <= 3) return true;
  if (cores <= 4) return true;
  return false;
}

/** Detect OS prefers-reduced-motion safely in both browser and Node/Vitest. */
export function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Build a concrete FxConfig from presets and optional overrides. */
export function createFxConfig(opts: FxConfigOptions = {}): FxConfig {
  const quality: FxQuality = opts.quality ?? (detectLowEndDevice() ? 'low' : 'high');
  const reducedMotion = opts.reducedMotion ?? detectReducedMotion();
  const preset = FX_PRESETS[quality];

  const base: FxConfig = {
    quality,
    reducedMotion,
    maxParticles: opts.maxParticles ?? preset.maxParticles,
    maxDecals: opts.maxDecals ?? preset.maxDecals,
    maxBeams: opts.maxBeams ?? preset.maxBeams,
    maxRipples: opts.maxRipples ?? preset.maxRipples,
    maxLightBursts: opts.maxLightBursts ?? preset.maxLightBursts,
    hitStopEnabled: opts.hitStopEnabled ?? true,
    hitStopMaxFrames: opts.hitStopMaxFrames ?? preset.hitStopMaxFrames,
    shakeEnabled: opts.shakeEnabled ?? true,
    footstepsEnabled: opts.footstepsEnabled ?? preset.footstepsEnabled,
    slowMoEnabled: opts.slowMoEnabled ?? true,
  };

  return resolveEffectiveConfig(base);
}

/** Apply reducedMotion & quality invariants to an FxConfig. */
export function resolveEffectiveConfig(config: FxConfig): FxConfig {
  if (!config.reducedMotion) {
    return { ...config };
  }
  return {
    ...config,
    // Reduced motion disables camera shake, hit-stop freeze, slow-mo, and heavy emitters
    hitStopEnabled: false,
    hitStopMaxFrames: 0,
    shakeEnabled: false,
    slowMoEnabled: false,
    footstepsEnabled: false,
    maxParticles: Math.min(config.maxParticles, 48),
    maxLightBursts: Math.min(config.maxLightBursts, 6),
  };
}

/** Scale an emitter particle count according to quality and reducedMotion. */
export function scaleEmitCount(baseCount: number, config: FxConfig): number {
  if (baseCount <= 0) return 0;
  if (config.reducedMotion) {
    return Math.max(1, Math.floor(baseCount * 0.25));
  }
  if (config.quality === 'low') {
    return Math.max(1, Math.floor(baseCount * 0.4));
  }
  return baseCount;
}
