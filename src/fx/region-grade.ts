/**
 * A7 — Region & Weather Color Grade System:
 * - Data-driven tint / brightness / saturation presets per biome, region, weather, and daylight
 * - Channel-accurate RGB interpolation + frame-rate-independent exponential smoothing
 */

import { type FxConfig } from './config';

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'fog' | 'dust' | 'ash' | 'snow';

export interface ColorGradePreset {
  id: string;
  tintColor: number;
  tintAlpha: number;
  brightness: number;
  saturation: number;
  contrast: number;
}

export interface BiomeGradeSchedule {
  biome: string;
  day: ColorGradePreset;
  night: ColorGradePreset;
  twilightTintColor: number;
  twilightAlpha: number;
}

export interface ColorGradeState extends ColorGradePreset {
  biome: string;
  region: string;
  weather: WeatherKind;
  daylight: number;
  enabled: boolean;
}

export interface RegionGradeContext {
  biome?: string;
  region?: string;
  weather?: WeatherKind;
  daylight?: number;
}

export const BIOME_GRADE_PRESETS: Readonly<Record<string, BiomeGradeSchedule>> = {
  forest: {
    biome: 'forest',
    day: { id: 'forest-day', tintColor: 0xdcf0d4, tintAlpha: 0.04, brightness: 1.02, saturation: 1.04, contrast: 1.0 },
    night: { id: 'forest-night', tintColor: 0x3b4d82, tintAlpha: 0.24, brightness: 0.78, saturation: 0.85, contrast: 1.05 },
    twilightTintColor: 0xd98a4e,
    twilightAlpha: 0.14,
  },
  marsh: {
    biome: 'marsh',
    day: { id: 'marsh-day', tintColor: 0x7da08c, tintAlpha: 0.11, brightness: 0.94, saturation: 0.88, contrast: 1.02 },
    night: { id: 'marsh-night', tintColor: 0x2d4854, tintAlpha: 0.28, brightness: 0.74, saturation: 0.78, contrast: 1.06 },
    twilightTintColor: 0x9b7e5c,
    twilightAlpha: 0.15,
  },
  desert: {
    biome: 'desert',
    day: { id: 'desert-day', tintColor: 0xf4cf8a, tintAlpha: 0.1, brightness: 1.06, saturation: 1.08, contrast: 1.04 },
    night: { id: 'desert-night', tintColor: 0x3c4478, tintAlpha: 0.24, brightness: 0.8, saturation: 0.84, contrast: 1.06 },
    twilightTintColor: 0xe68a4c,
    twilightAlpha: 0.16,
  },
  oasis: {
    biome: 'oasis',
    day: { id: 'oasis-day', tintColor: 0xd8ecc4, tintAlpha: 0.06, brightness: 1.04, saturation: 1.08, contrast: 1.01 },
    night: { id: 'oasis-night', tintColor: 0x36527c, tintAlpha: 0.22, brightness: 0.8, saturation: 0.88, contrast: 1.04 },
    twilightTintColor: 0xe09658,
    twilightAlpha: 0.14,
  },
  highlands: {
    biome: 'highlands',
    day: { id: 'highlands-day', tintColor: 0xc2d8ee, tintAlpha: 0.08, brightness: 1.0, saturation: 0.92, contrast: 1.05 },
    night: { id: 'highlands-night', tintColor: 0x344a7c, tintAlpha: 0.26, brightness: 0.78, saturation: 0.8, contrast: 1.08 },
    twilightTintColor: 0xb886a4,
    twilightAlpha: 0.13,
  },
  crypt: {
    biome: 'crypt',
    day: { id: 'crypt-day', tintColor: 0x5c6a92, tintAlpha: 0.18, brightness: 0.82, saturation: 0.76, contrast: 1.1 },
    night: { id: 'crypt-night', tintColor: 0x262e52, tintAlpha: 0.3, brightness: 0.7, saturation: 0.7, contrast: 1.12 },
    twilightTintColor: 0x4c587c,
    twilightAlpha: 0.22,
  },
  caldera: {
    biome: 'caldera',
    day: { id: 'caldera-day', tintColor: 0xc45428, tintAlpha: 0.15, brightness: 0.88, saturation: 1.1, contrast: 1.12 },
    night: { id: 'caldera-night', tintColor: 0x702424, tintAlpha: 0.26, brightness: 0.76, saturation: 1.02, contrast: 1.14 },
    twilightTintColor: 0xb84624,
    twilightAlpha: 0.19,
  },
};

const BIOME_ALIASES: Readonly<Record<string, string>> = {
  swamp: 'marsh',
  caves: 'crypt',
  volcanic: 'caldera',
  hell: 'caldera',
};

export const REGION_GRADE_OVERRIDES: Readonly<Record<string, Partial<ColorGradePreset>>> = {
  'border-fords': { tintColor: 0xb4d2c6, tintAlpha: 0.07, brightness: 1.0 },
  'weeping-ossuary': { tintColor: 0x56648e, tintAlpha: 0.2, brightness: 0.8, saturation: 0.74 },
  'redmarsh': { tintColor: 0x8d6844, tintAlpha: 0.13, brightness: 0.92, saturation: 0.9 },
  'ironheart-cisterns': { tintColor: 0x467470, tintAlpha: 0.17, brightness: 0.83, saturation: 0.82 },
  'iron-coast': { tintColor: 0x708aa4, tintAlpha: 0.12, brightness: 0.93, saturation: 0.88 },
  'drowned-citadel': { tintColor: 0x365c7a, tintAlpha: 0.21, brightness: 0.78, saturation: 0.76 },
  'obsidian-caldera': { tintColor: 0xa84826, tintAlpha: 0.16, brightness: 0.86, saturation: 1.08 },
  'cinder-throne': { tintColor: 0xbe361c, tintAlpha: 0.2, brightness: 0.82, saturation: 1.12, contrast: 1.14 },
  'thornwick': { tintColor: 0xe6b674, tintAlpha: 0.06, brightness: 1.01 },
  'oakhaven': { tintColor: 0xdca86c, tintAlpha: 0.07, brightness: 0.99 },
  'ironcamp': { tintColor: 0xd48a54, tintAlpha: 0.08, brightness: 0.95 },
};

export const WEATHER_GRADE_MODIFIERS: Readonly<Record<WeatherKind, { tintColor: number; alphaAdd: number; brightnessMul: number; saturationMul: number }>> = {
  clear: { tintColor: 0xffffff, alphaAdd: 0, brightnessMul: 1.0, saturationMul: 1.0 },
  rain: { tintColor: 0x6c88a8, alphaAdd: 0.07, brightnessMul: 0.92, saturationMul: 0.86 },
  storm: { tintColor: 0x4a6284, alphaAdd: 0.12, brightnessMul: 0.84, saturationMul: 0.78 },
  fog: { tintColor: 0x9aaea8, alphaAdd: 0.09, brightnessMul: 0.94, saturationMul: 0.8 },
  dust: { tintColor: 0xd8b478, alphaAdd: 0.08, brightnessMul: 0.96, saturationMul: 0.92 },
  ash: { tintColor: 0x8e5642, alphaAdd: 0.09, brightnessMul: 0.9, saturationMul: 0.94 },
  snow: { tintColor: 0xc8e0f6, alphaAdd: 0.07, brightnessMul: 0.98, saturationMul: 0.85 },
};

export function normalizeGradeBiome(biome?: string): string {
  if (!biome) return 'forest';
  const k = biome.trim().toLowerCase();
  const mapped = BIOME_ALIASES[k] ?? k;
  return mapped in BIOME_GRADE_PRESETS ? mapped : 'forest';
}

export function resolveRegionOverrideKey(region?: string): string | undefined {
  if (!region) return undefined;
  const slug = region.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (slug in REGION_GRADE_OVERRIDES) return slug;
  for (const key of Object.keys(REGION_GRADE_OVERRIDES)) {
    if (slug.includes(key)) return key;
  }
  return undefined;
}

/** Per-channel linear RGB interpolation for packed 0xRRGGBB colors. */
export function lerpRgbColor(from: number, to: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const r0 = (from >>> 16) & 0xff;
  const g0 = (from >>> 8) & 0xff;
  const b0 = from & 0xff;
  const r1 = (to >>> 16) & 0xff;
  const g1 = (to >>> 8) & 0xff;
  const b1 = to & 0xff;
  const r = Math.round(r0 + (r1 - r0) * k);
  const g = Math.round(g0 + (g1 - g0) * k);
  const b = Math.round(b0 + (b1 - b0) * k);
  return (r << 16) | (g << 8) | b;
}

export class RegionGradeSystem {
  private biome = 'forest';
  private region = '';
  private weather: WeatherKind = 'clear';
  private daylight = 255;
  private lerpSpeed = 2.6;

  private current: ColorGradePreset;
  private target: ColorGradePreset;
  private curR = 255;
  private curG = 255;
  private curB = 255;

  constructor(private config: FxConfig) {
    this.target = this.computeTargetPreset();
    this.current = { ...this.target };
    this.syncFloatRgb();
  }

  private syncFloatRgb(): void {
    this.curR = (this.current.tintColor >>> 16) & 0xff;
    this.curG = (this.current.tintColor >>> 8) & 0xff;
    this.curB = this.current.tintColor & 0xff;
  }

  setConfig(config: FxConfig): void {
    this.config = config;
  }

  setContext(ctx: RegionGradeContext): void {
    let changed = false;
    if (ctx.biome !== undefined) {
      const next = normalizeGradeBiome(ctx.biome);
      if (next !== this.biome) {
        this.biome = next;
        changed = true;
      }
    }
    if (ctx.region !== undefined && ctx.region !== this.region) {
      this.region = ctx.region;
      changed = true;
    }
    if (ctx.weather !== undefined && ctx.weather !== this.weather) {
      this.weather = ctx.weather;
      changed = true;
    }
    if (ctx.daylight !== undefined) {
      const nextDay = Math.max(0, Math.min(255, ctx.daylight));
      if (nextDay !== this.daylight) {
        this.daylight = nextDay;
        changed = true;
      }
    }
    if (changed) {
      this.target = this.computeTargetPreset();
    }
  }

  setBiome(biome: string): void {
    this.setContext({ biome });
  }

  setRegion(region?: string): void {
    this.setContext({ region: region ?? '' });
  }

  setWeather(weather: WeatherKind): void {
    this.setContext({ weather });
  }

  setDaylight(daylight: number): void {
    this.setContext({ daylight });
  }

  snapToTarget(): void {
    this.target = this.computeTargetPreset();
    this.current = { ...this.target };
    this.syncFloatRgb();
  }

  computeTargetPreset(): ColorGradePreset {
    const schedule = BIOME_GRADE_PRESETS[this.biome] ?? BIOME_GRADE_PRESETS.forest!;
    const dayFactor = Math.max(0, Math.min(1, (this.daylight - 75) / 180));

    let tintColor = lerpRgbColor(schedule.night.tintColor, schedule.day.tintColor, dayFactor);
    let tintAlpha = schedule.night.tintAlpha + (schedule.day.tintAlpha - schedule.night.tintAlpha) * dayFactor;
    let brightness = schedule.night.brightness + (schedule.day.brightness - schedule.night.brightness) * dayFactor;
    let saturation = schedule.night.saturation + (schedule.day.saturation - schedule.night.saturation) * dayFactor;
    let contrast = schedule.night.contrast + (schedule.day.contrast - schedule.night.contrast) * dayFactor;

    // Warm dawn/dusk twilight peak around dayFactor = 0.5
    const twilightBell = Math.sin(dayFactor * Math.PI);
    if (twilightBell > 0.05) {
      const tw = twilightBell * 0.45;
      tintColor = lerpRgbColor(tintColor, schedule.twilightTintColor, tw);
      tintAlpha = Math.max(tintAlpha, schedule.twilightAlpha * twilightBell);
    }

    const regionKey = resolveRegionOverrideKey(this.region);
    if (regionKey) {
      const ov = REGION_GRADE_OVERRIDES[regionKey]!;
      if (ov.tintColor !== undefined) tintColor = lerpRgbColor(tintColor, ov.tintColor, 0.55);
      if (ov.tintAlpha !== undefined) tintAlpha = Math.max(tintAlpha, ov.tintAlpha);
      if (ov.brightness !== undefined) brightness = (brightness + ov.brightness) * 0.5;
      if (ov.saturation !== undefined) saturation = (saturation + ov.saturation) * 0.5;
      if (ov.contrast !== undefined) contrast = (contrast + ov.contrast) * 0.5;
    }

    const wm = WEATHER_GRADE_MODIFIERS[this.weather] ?? WEATHER_GRADE_MODIFIERS.clear;
    if (wm.alphaAdd > 0) {
      tintColor = lerpRgbColor(tintColor, wm.tintColor, 0.35);
      tintAlpha += wm.alphaAdd;
    }
    brightness *= wm.brightnessMul;
    saturation *= wm.saturationMul;

    return {
      id: `${this.biome}:${regionKey ?? 'base'}:${this.weather}`,
      tintColor,
      tintAlpha: Math.max(0, Math.min(0.36, tintAlpha)),
      brightness: Math.max(0.65, Math.min(1.15, brightness)),
      saturation: Math.max(0.6, Math.min(1.2, saturation)),
      contrast: Math.max(0.9, Math.min(1.2, contrast)),
    };
  }

  update(dtMs: number): void {
    const dt = Math.max(0, dtMs) / 1000;
    if (dt <= 0) return;

    const k = 1 - Math.exp(-this.lerpSpeed * dt);
    const tr = (this.target.tintColor >>> 16) & 0xff;
    const tg = (this.target.tintColor >>> 8) & 0xff;
    const tb = this.target.tintColor & 0xff;
    this.curR += (tr - this.curR) * k;
    this.curG += (tg - this.curG) * k;
    this.curB += (tb - this.curB) * k;

    this.current.id = this.target.id;
    this.current.tintColor = (Math.round(this.curR) << 16) | (Math.round(this.curG) << 8) | Math.round(this.curB);
    this.current.tintAlpha += (this.target.tintAlpha - this.current.tintAlpha) * k;
    this.current.brightness += (this.target.brightness - this.current.brightness) * k;
    this.current.saturation += (this.target.saturation - this.current.saturation) * k;
    this.current.contrast += (this.target.contrast - this.current.contrast) * k;
  }

  getCurrentGrade(): ColorGradeState {
    return {
      ...this.current,
      biome: this.biome,
      region: this.region,
      weather: this.weather,
      daylight: this.daylight,
      enabled: this.config.quality !== 'low' || this.current.tintAlpha > 0,
    };
  }

  getTargetGrade(): ColorGradePreset {
    return { ...this.target };
  }

  clear(): void {
    this.region = '';
    this.weather = 'clear';
    this.daylight = 255;
    this.snapToTarget();
  }
}
