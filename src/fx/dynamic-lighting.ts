/**
 * A5 — Dynamic Lighting System:
 * - Soft radial additive light pools + low-res multiply darkness overlay
 * - Supports hero torch, torches, campfires, lava pools, shrines, town lamps, and spell casts
 * - Darker ambient profiles in night, crypt, and caldera/volcanic biomes
 * - Strictly capped for mobile GPUs and disabled on 'low' quality
 * - Zeroes flame flicker when reducedMotion is true
 */

import { type FxConfig } from './config';
import { FxPool } from './pool';
import { type SpellSchool, getSpellSchoolPalette } from './spell-vfx';

export type LightSourceKind = 'hero' | 'torch' | 'campfire' | 'lava' | 'spell' | 'shrine' | 'town';

export interface DynamicLightInput {
  kind: LightSourceKind;
  x: number; // world pixels
  y: number; // world pixels
  radius: number; // world pixels
  color?: number;
  intensity?: number;
  flicker?: number; // 0..0.3 relative radius/intensity jitter
}

export interface TransientSpellLight {
  x: number;
  y: number;
  startRadius: number;
  endRadius: number;
  radius: number;
  color: number;
  intensity: number;
  lifeMs: number;
  maxLifeMs: number;
}

export interface ResolvedLight {
  kind: LightSourceKind;
  screenX: number;
  screenY: number;
  screenRadius: number;
  color: number;
  intensity: number;
  carveAlpha: number;
  additiveAlpha: number;
}

export interface LightingBiomeProfile {
  biome: string;
  dayAmbient: readonly [number, number, number];
  nightAmbient: readonly [number, number, number];
  additiveBoost: number;
}

export const LIGHTING_BIOME_PROFILES: Readonly<Record<string, LightingBiomeProfile>> = {
  forest: {
    biome: 'forest',
    dayAmbient: [232, 236, 228],
    nightAmbient: [56, 66, 106],
    additiveBoost: 1.0,
  },
  marsh: {
    biome: 'marsh',
    dayAmbient: [194, 208, 200],
    nightAmbient: [42, 54, 68],
    additiveBoost: 1.05,
  },
  desert: {
    biome: 'desert',
    dayAmbient: [246, 236, 214],
    nightAmbient: [62, 60, 96],
    additiveBoost: 0.9,
  },
  oasis: {
    biome: 'oasis',
    dayAmbient: [240, 238, 224],
    nightAmbient: [58, 70, 104],
    additiveBoost: 0.95,
  },
  highlands: {
    biome: 'highlands',
    dayAmbient: [220, 230, 242],
    nightAmbient: [52, 64, 102],
    additiveBoost: 1.0,
  },
  crypt: {
    biome: 'crypt',
    dayAmbient: [98, 106, 134],
    nightAmbient: [28, 32, 56],
    additiveBoost: 1.25,
  },
  caldera: {
    biome: 'caldera',
    dayAmbient: [112, 86, 84],
    nightAmbient: [36, 22, 26],
    additiveBoost: 1.25,
  },
};

const BIOME_ALIASES: Readonly<Record<string, string>> = {
  swamp: 'marsh',
  caves: 'crypt',
  volcanic: 'caldera',
  hell: 'caldera',
};

export const DEFAULT_LIGHT_COLORS: Readonly<Record<LightSourceKind, number>> = {
  hero: 0xffb85c,
  torch: 0xff8c28,
  campfire: 0xff7018,
  lava: 0xff4410,
  spell: 0x70c8ff,
  shrine: 0x68d8ff,
  town: 0xffaa44,
};

const KIND_PRIORITY: Readonly<Record<LightSourceKind, number>> = {
  hero: 100,
  spell: 85,
  campfire: 70,
  torch: 65,
  shrine: 60,
  town: 55,
  lava: 40,
};

const MAX_MOBILE_LIGHTS_HIGH = 18;
const MAX_TRANSIENT_SPELL_LIGHTS = 12;

export function normalizeLightingBiome(biome?: string): string {
  if (!biome) return 'forest';
  const key = biome.trim().toLowerCase();
  const mapped = BIOME_ALIASES[key] ?? key;
  return mapped in LIGHTING_BIOME_PROFILES ? mapped : 'forest';
}

export function getLightingBiomeProfile(biome?: string): LightingBiomeProfile {
  return LIGHTING_BIOME_PROFILES[normalizeLightingBiome(biome)];
}

function createTransientLight(): TransientSpellLight {
  return {
    x: 0,
    y: 0,
    startRadius: 48,
    endRadius: 112,
    radius: 48,
    color: 0xff6a1a,
    intensity: 1,
    lifeMs: 0,
    maxLifeMs: 360,
  };
}

function resetTransientLight(l: TransientSpellLight): void {
  l.x = 0;
  l.y = 0;
  l.startRadius = 48;
  l.endRadius = 112;
  l.radius = 48;
  l.color = 0xff6a1a;
  l.intensity = 1;
  l.lifeMs = 0;
  l.maxLifeMs = 360;
}

function rgbCss(color: number, alpha: number): string {
  const r = (color >>> 16) & 0xff;
  const g = (color >>> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

export interface Canvas2DLike {
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  save(): void;
  restore(): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): {
    addColorStop(offset: number, color: string): void;
  };
  fillStyle: unknown;
  globalCompositeOperation: string;
}

export class DynamicLightingSystem {
  readonly spellLights: FxPool<TransientSpellLight>;
  private readonly maxLightsHigh: number;
  private biome = 'forest';
  private elapsedSec = 0;

  private heroLight: DynamicLightInput | null = null;
  private readonly frameLights: DynamicLightInput[] = [];
  private readonly candidates: Array<DynamicLightInput & { priority: number }> = [];
  private readonly resolved: ResolvedLight[] = [];

  constructor(private config: FxConfig, maxLightsHigh = MAX_MOBILE_LIGHTS_HIGH) {
    this.maxLightsHigh = Math.max(1, Math.floor(maxLightsHigh));
    this.spellLights = new FxPool<TransientSpellLight>(
      MAX_TRANSIENT_SPELL_LIGHTS,
      createTransientLight,
      resetTransientLight,
      this.isEnabled() ? MAX_TRANSIENT_SPELL_LIGHTS : 0,
    );
  }

  setConfig(config: FxConfig): void {
    this.config = config;
    this.spellLights.setCap(this.isEnabled() ? MAX_TRANSIENT_SPELL_LIGHTS : 0);
    if (!this.isEnabled()) {
      this.frameLights.length = 0;
      this.resolved.length = 0;
    }
  }

  /** Dynamic lighting is disabled on 'low' quality for mobile battery/fillrate safety. */
  isEnabled(): boolean {
    return this.config.quality !== 'low';
  }

  getMaxLights(): number {
    return this.isEnabled() ? this.maxLightsHigh : 0;
  }

  setBiome(biome: string): void {
    this.biome = normalizeLightingBiome(biome);
  }

  getBiome(): string {
    return this.biome;
  }

  setHeroLight(
    x: number,
    y: number,
    radius = 190,
    color = DEFAULT_LIGHT_COLORS.hero,
    intensity = 1,
  ): void {
    this.heroLight = {
      kind: 'hero',
      x,
      y,
      radius,
      color,
      intensity,
      flicker: 0.05,
    };
  }

  clearHeroLight(): void {
    this.heroLight = null;
  }

  /** Clear per-frame world light submissions (torches, campfires, lava, shrines). */
  beginFrame(): void {
    this.frameLights.length = 0;
  }

  /** Submit a world-space light for the current frame. */
  addLight(input: DynamicLightInput): void {
    if (!this.isEnabled()) return;
    if (input.radius <= 0 || (input.intensity !== undefined && input.intensity <= 0)) return;
    this.frameLights.push(input);
  }

  /** Spawn a transient additive + cutout light pool for a spell cast or impact. */
  emitSpellLight(
    x: number,
    y: number,
    school: SpellSchool | number,
    radius = 110,
    durationMs = 380,
    intensity = 0.95,
  ): TransientSpellLight | null {
    if (!this.isEnabled()) return null;
    const slot = this.spellLights.acquire();
    if (!slot) return null;
    const palette = getSpellSchoolPalette(school);
    slot.x = x;
    slot.y = y;
    slot.startRadius = Math.max(16, radius * 0.45);
    slot.endRadius = Math.max(slot.startRadius, radius);
    slot.radius = slot.startRadius;
    slot.color = palette.primary;
    slot.intensity = Math.max(0.1, Math.min(1.5, intensity));
    slot.lifeMs = 0;
    slot.maxLifeMs = Math.max(80, durationMs);
    return slot;
  }

  /** Compute ambient multiply RGB [0..255] from biome profile and sim daylight [0..255]. */
  computeAmbientColor(daylight: number): [number, number, number] {
    const profile = getLightingBiomeProfile(this.biome);
    // sim.daylight spans 75 (deep night) to 255 (noon)
    const clamped = Math.max(0, Math.min(255, daylight));
    const dayFactor = Math.max(0, Math.min(1, (clamped - 75) / 180));
    const r = Math.round(profile.nightAmbient[0] + (profile.dayAmbient[0] - profile.nightAmbient[0]) * dayFactor);
    const g = Math.round(profile.nightAmbient[1] + (profile.dayAmbient[1] - profile.nightAmbient[1]) * dayFactor);
    const b = Math.round(profile.nightAmbient[2] + (profile.dayAmbient[2] - profile.nightAmbient[2]) * dayFactor);
    return [r, g, b];
  }

  /** Advance flicker clock and transient spell light lifetimes. */
  update(dtMs: number): void {
    const dt = Math.max(0, dtMs) / 1000;
    if (!this.config.reducedMotion) {
      this.elapsedSec += dt;
    }

    this.spellLights.updateEach((l) => {
      l.lifeMs += dtMs;
      if (l.lifeMs >= l.maxLifeMs) return false;
      const t = l.lifeMs / l.maxLifeMs;
      const easeOut = 1 - (1 - t) * (1 - t);
      l.radius = l.startRadius + (l.endRadius - l.startRadius) * easeOut;
      l.intensity = 0.95 * (1 - t * t);
      return true;
    });
  }

  /**
   * Cull lights outside viewport, apply reducedMotion-safe flicker, prioritize by importance,
   * and enforce the mobile-safe light cap.
   */
  resolveVisibleLights(
    camX: number,
    camY: number,
    zoom: number,
    viewW: number,
    viewH: number,
  ): readonly ResolvedLight[] {
    this.resolved.length = 0;
    if (!this.isEnabled() || viewW <= 0 || viewH <= 0 || zoom <= 0) {
      return this.resolved;
    }

    this.candidates.length = 0;

    if (this.heroLight) {
      this.pushCandidate(this.heroLight, camX, camY, zoom, viewW, viewH);
    }

    this.spellLights.forEachActive((sl) => {
      this.pushCandidate(
        {
          kind: 'spell',
          x: sl.x,
          y: sl.y,
          radius: sl.radius,
          color: sl.color,
          intensity: sl.intensity,
          flicker: 0,
        },
        camX,
        camY,
        zoom,
        viewW,
        viewH,
      );
    });

    for (let i = 0; i < this.frameLights.length; i++) {
      this.pushCandidate(this.frameLights[i]!, camX, camY, zoom, viewW, viewH);
    }

    if (this.candidates.length > this.maxLightsHigh) {
      this.candidates.sort((a, b) => b.priority - a.priority);
    }

    const cap = Math.min(this.maxLightsHigh, this.candidates.length);
    const profile = getLightingBiomeProfile(this.biome);

    for (let i = 0; i < cap; i++) {
      const c = this.candidates[i]!;
      const flickerAmp = this.config.reducedMotion ? 0 : (c.flicker ?? defaultFlicker(c.kind));
      const phase = (c.x * 0.037 + c.y * 0.053) % (Math.PI * 2);
      const flickerMul =
        flickerAmp > 0
          ? 1 +
            flickerAmp *
              (0.65 * Math.sin(this.elapsedSec * 7.5 + phase) +
                0.35 * Math.sin(this.elapsedSec * 15.2 + phase * 1.7))
          : 1;

      const screenX = c.x * zoom - camX;
      const screenY = c.y * zoom - camY;
      const screenRadius = Math.max(4, c.radius * zoom * flickerMul);
      const intensity = Math.max(0.05, Math.min(1.5, (c.intensity ?? 1) * flickerMul));
      const baseAdd = c.kind === 'spell' ? 0.34 : c.kind === 'lava' ? 0.24 : c.kind === 'campfire' ? 0.22 : 0.17;

      this.resolved.push({
        kind: c.kind,
        screenX,
        screenY,
        screenRadius,
        color: c.color ?? DEFAULT_LIGHT_COLORS[c.kind],
        intensity,
        carveAlpha: Math.min(1, 0.85 * intensity),
        additiveAlpha: Math.min(0.65, baseAdd * intensity * profile.additiveBoost),
      });
    }

    return this.resolved;
  }

  private pushCandidate(
    input: DynamicLightInput,
    camX: number,
    camY: number,
    zoom: number,
    viewW: number,
    viewH: number,
  ): void {
    const sx = input.x * zoom - camX;
    const sy = input.y * zoom - camY;
    const sr = input.radius * zoom;
    if (sx + sr < 0 || sy + sr < 0 || sx - sr > viewW || sy - sr > viewH) return;

    const dx = sx - viewW * 0.5;
    const dy = sy - viewH * 0.5;
    const distNorm = Math.hypot(dx, dy) / Math.max(1, Math.hypot(viewW, viewH));
    const priority = KIND_PRIORITY[input.kind] * (input.intensity ?? 1) - distNorm * 10;
    this.candidates.push({ ...input, priority });
  }

  /**
   * Paint low-res multiply darkness overlay (with radial destination-out light cutouts)
   * and optional low-res additive radial light pools. Returns active lights rendered.
   */
  renderToCanvases(
    mulCtx: Canvas2DLike | null,
    addCtx: Canvas2DLike | null,
    lowW: number,
    lowH: number,
    camX: number,
    camY: number,
    zoom: number,
    viewW: number,
    viewH: number,
    daylight: number,
  ): number {
    if (!this.isEnabled() || lowW <= 0 || lowH <= 0 || viewW <= 0 || viewH <= 0) {
      if (mulCtx) mulCtx.clearRect(0, 0, Math.max(1, lowW), Math.max(1, lowH));
      if (addCtx) addCtx.clearRect(0, 0, Math.max(1, lowW), Math.max(1, lowH));
      return 0;
    }

    const scaleX = lowW / viewW;
    const scaleY = lowH / viewH;
    const [ar, ag, ab] = this.computeAmbientColor(daylight);
    const lights = this.resolveVisibleLights(camX, camY, zoom, viewW, viewH);

    if (mulCtx) {
      mulCtx.clearRect(0, 0, lowW, lowH);
      mulCtx.fillStyle = `rgb(${ar},${ag},${ab})`;
      mulCtx.fillRect(0, 0, lowW, lowH);

      if (lights.length > 0) {
        mulCtx.save();
        mulCtx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < lights.length; i++) {
          const l = lights[i]!;
          const lx = l.screenX * scaleX;
          const ly = l.screenY * scaleY;
          const lr = Math.max(2, l.screenRadius * scaleX);
          const grad = mulCtx.createRadialGradient(lx, ly, Math.min(2, lr * 0.08), lx, ly, lr);
          grad.addColorStop(0, `rgba(0,0,0,${l.carveAlpha.toFixed(3)})`);
          grad.addColorStop(0.45, `rgba(0,0,0,${(l.carveAlpha * 0.72).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          mulCtx.fillStyle = grad;
          mulCtx.beginPath();
          mulCtx.arc(lx, ly, lr, 0, Math.PI * 2);
          mulCtx.fill();
        }
        mulCtx.restore();
      }
    }

    if (addCtx) {
      addCtx.clearRect(0, 0, lowW, lowH);
      if (lights.length > 0) {
        addCtx.save();
        addCtx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < lights.length; i++) {
          const l = lights[i]!;
          const lx = l.screenX * scaleX;
          const ly = l.screenY * scaleY;
          const lr = Math.max(2, l.screenRadius * scaleX * 1.05);
          const grad = addCtx.createRadialGradient(lx, ly, 1, lx, ly, lr);
          grad.addColorStop(0, rgbCss(l.color, l.additiveAlpha));
          grad.addColorStop(0.55, rgbCss(l.color, l.additiveAlpha * 0.42));
          grad.addColorStop(1, rgbCss(l.color, 0));
          addCtx.fillStyle = grad;
          addCtx.beginPath();
          addCtx.arc(lx, ly, lr, 0, Math.PI * 2);
          addCtx.fill();
        }
        addCtx.restore();
      }
    }

    return lights.length;
  }

  clear(): void {
    this.heroLight = null;
    this.frameLights.length = 0;
    this.resolved.length = 0;
    this.spellLights.clear();
  }
}

function defaultFlicker(kind: LightSourceKind): number {
  switch (kind) {
    case 'torch':
      return 0.07;
    case 'campfire':
      return 0.09;
    case 'lava':
      return 0.05;
    case 'hero':
      return 0.04;
    default:
      return 0;
  }
}
