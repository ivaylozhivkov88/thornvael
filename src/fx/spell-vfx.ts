/**
 * A4 — Spell VFX Polish:
 * - Unified school color language:
 *   - fire: orange
 *   - frost (water): cyan
 *   - arcane (astral): violet
 *   - shadow: green-black
 *   - holy / earth: gold-ochre
 *   - air: electric sky-white
 * - Additive glow descriptors
 * - Transient ground light bursts
 */

import { type FxConfig } from './config';
import { FxPool } from './pool';

export type SpellSchool = 'fire' | 'frost' | 'arcane' | 'shadow' | 'holy' | 'earth' | 'air';

export interface SpellSchoolPalette {
  school: SpellSchool;
  primary: number;
  core: number;
  glow: number;
  ring: number;
}

export const SPELL_SCHOOL_PALETTES: Readonly<Record<SpellSchool, SpellSchoolPalette>> = {
  fire: {
    school: 'fire',
    primary: 0xff6a1a,
    core: 0xffd26a,
    glow: 0xff3b00,
    ring: 0xff9436,
  },
  frost: {
    school: 'frost',
    primary: 0x38d8ff,
    core: 0xe0faff,
    glow: 0x0088ff,
    ring: 0x7ae8ff,
  },
  arcane: {
    school: 'arcane',
    primary: 0xb858ff,
    core: 0xf2dcff,
    glow: 0x7020e0,
    ring: 0xd48aff,
  },
  shadow: {
    school: 'shadow',
    primary: 0x28c868,
    core: 0x98ffa8,
    glow: 0x0c2416,
    ring: 0x1a7a42,
  },
  holy: {
    school: 'holy',
    primary: 0xe8b838,
    core: 0xfff4b8,
    glow: 0xb88618,
    ring: 0xffd860,
  },
  earth: {
    school: 'earth',
    primary: 0xd4a43c,
    core: 0xf5dc88,
    glow: 0x8c6218,
    ring: 0xb59a6a,
  },
  air: {
    school: 'air',
    primary: 0x6ac8ff,
    core: 0xffffff,
    glow: 0x3888ff,
    ring: 0xd8f0ff,
  },
};

/** Resolve numeric SpellDef.school (1..5) or string name to a SpellSchool. */
export function resolveSpellSchool(school: SpellSchool | number): SpellSchool {
  if (typeof school === 'string') {
    if (school in SPELL_SCHOOL_PALETTES) return school;
    return 'arcane';
  }
  switch (school) {
    case 1:
      return 'fire';
    case 2:
      return 'frost';
    case 3:
      return 'air';
    case 4:
      return 'earth';
    case 5:
      return 'arcane';
    default:
      return 'arcane';
  }
}

export function getSpellSchoolPalette(school: SpellSchool | number): SpellSchoolPalette {
  return SPELL_SCHOOL_PALETTES[resolveSpellSchool(school)];
}

export interface GlowDescriptor {
  x: number;
  y: number;
  radius: number;
  color: number;
  alpha: number;
  blendMode: 'add';
  school: SpellSchool;
}

export interface GroundLightBurst {
  x: number;
  y: number;
  startRadius: number;
  endRadius: number;
  currentRadius: number;
  color: number;
  coreColor: number;
  alpha: number;
  lifeMs: number;
  maxLifeMs: number;
  school: SpellSchool;
  blendMode: 'add';
}

function createBurst(): GroundLightBurst {
  return {
    x: 0,
    y: 0,
    startRadius: 10,
    endRadius: 48,
    currentRadius: 10,
    color: 0xff6a1a,
    coreColor: 0xffd26a,
    alpha: 0.85,
    lifeMs: 0,
    maxLifeMs: 280,
    school: 'fire',
    blendMode: 'add',
  };
}

function resetBurst(b: GroundLightBurst): void {
  b.x = 0;
  b.y = 0;
  b.startRadius = 10;
  b.endRadius = 48;
  b.currentRadius = 10;
  b.color = 0xff6a1a;
  b.coreColor = 0xffd26a;
  b.alpha = 0.85;
  b.lifeMs = 0;
  b.maxLifeMs = 280;
  b.school = 'fire';
  b.blendMode = 'add';
}

export class SpellVfxSystem {
  readonly lightBursts: FxPool<GroundLightBurst>;

  constructor(private config: FxConfig) {
    this.lightBursts = new FxPool<GroundLightBurst>(32, createBurst, resetBurst, config.maxLightBursts);
  }

  setConfig(config: FxConfig): void {
    this.config = config;
    this.lightBursts.setCap(config.maxLightBursts);
  }

  /** Build an additive glow descriptor for a spell projectile, aura, or impact. */
  createGlowDescriptor(
    x: number,
    y: number,
    school: SpellSchool | number,
    radius = 28,
    intensity = 0.75,
  ): GlowDescriptor {
    const resolved = resolveSpellSchool(school);
    const palette = SPELL_SCHOOL_PALETTES[resolved];
    const alphaScale = this.config.quality === 'low' ? 0.65 : 1.0;
    return {
      x,
      y,
      radius,
      color: palette.glow,
      alpha: Math.max(0, Math.min(1, intensity * alphaScale)),
      blendMode: 'add',
      school: resolved,
    };
  }

  /** Emit a transient ground light burst that briefly illuminates terrain on cast/impact. */
  emitGroundLightBurst(
    x: number,
    y: number,
    school: SpellSchool | number,
    radius = 52,
    durationMs = 280,
  ): GroundLightBurst | null {
    const burst = this.lightBursts.acquire();
    if (!burst) return null;
    const resolved = resolveSpellSchool(school);
    const palette = SPELL_SCHOOL_PALETTES[resolved];
    burst.x = x;
    burst.y = y;
    burst.startRadius = Math.max(8, radius * 0.3);
    burst.endRadius = radius;
    burst.currentRadius = burst.startRadius;
    burst.color = palette.primary;
    burst.coreColor = palette.core;
    burst.alpha = this.config.reducedMotion ? 0.5 : 0.85;
    burst.lifeMs = 0;
    burst.maxLifeMs = Math.max(80, durationMs);
    burst.school = resolved;
    burst.blendMode = 'add';
    return burst;
  }

  update(dtMs: number): void {
    this.lightBursts.updateEach((b) => {
      b.lifeMs += dtMs;
      if (b.lifeMs >= b.maxLifeMs) return false;
      const t = b.lifeMs / b.maxLifeMs;
      const easeOut = 1 - (1 - t) * (1 - t);
      b.currentRadius = b.startRadius + (b.endRadius - b.startRadius) * easeOut;
      b.alpha = (this.config.reducedMotion ? 0.5 : 0.85) * (1 - t);
      return true;
    });
  }

  clear(): void {
    this.lightBursts.clear();
  }
}
