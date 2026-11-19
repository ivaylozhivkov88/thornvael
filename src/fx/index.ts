/**
 * Unified FX Engine Facade for Thornvael (WISHLIST A1-A4, A9-A10).
 * Self-contained, zero-allocation pooled, mobile-safe, and reducedMotion-aware.
 */

import {
  type FxConfig,
  type FxConfigOptions,
  type FxQuality,
  createFxConfig,
  resolveEffectiveConfig,
} from './config';
import { CursorTargetSystem } from './cursor-target';
import { DeathFxSystem } from './death-fx';
import { FootstepSystem } from './footsteps';
import { HitFeedbackSystem } from './hit-feedback';
import { LootDropSystem } from './loot-drop';
import { SpellVfxSystem } from './spell-vfx';

export * from './config';
export * from './pool';
export * from './hit-feedback';
export * from './death-fx';
export * from './footsteps';
export * from './spell-vfx';
export * from './cursor-target';
export * from './loot-drop';

export interface FxEngineStats {
  quality: FxQuality;
  reducedMotion: boolean;
  hitParticles: number;
  maxParticles: number;
  corpseDecals: number;
  maxDecals: number;
  bones: number;
  motes: number;
  footsteps: number;
  lightBursts: number;
  maxLightBursts: number;
  ripples: number;
  maxRipples: number;
  lootBeams: number;
  maxBeams: number;
  timeScale: number;
}

export class FxEngine {
  private config: FxConfig;

  readonly hitFeedback: HitFeedbackSystem;
  readonly deathFx: DeathFxSystem;
  readonly footsteps: FootstepSystem;
  readonly spellVfx: SpellVfxSystem;
  readonly cursorTarget: CursorTargetSystem;
  readonly lootDrop: LootDropSystem;

  constructor(options: FxConfigOptions = {}) {
    this.config = createFxConfig(options);
    this.hitFeedback = new HitFeedbackSystem(this.config);
    this.deathFx = new DeathFxSystem(this.config, this.hitFeedback);
    this.footsteps = new FootstepSystem(this.config);
    this.spellVfx = new SpellVfxSystem(this.config);
    this.cursorTarget = new CursorTargetSystem(this.config);
    this.lootDrop = new LootDropSystem(this.config);
  }

  getConfig(): FxConfig {
    return this.config;
  }

  setQuality(quality: FxQuality): void {
    this.applyConfig(
      createFxConfig({
        quality,
        reducedMotion: this.config.reducedMotion,
      }),
    );
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.applyConfig(
      resolveEffectiveConfig({
        ...this.config,
        reducedMotion,
        hitStopEnabled: !reducedMotion,
        hitStopMaxFrames: reducedMotion ? 0 : this.config.quality === 'low' ? 2 : 4,
        shakeEnabled: !reducedMotion,
        slowMoEnabled: !reducedMotion,
        footstepsEnabled: !reducedMotion && this.config.quality === 'high',
      }),
    );
  }

  private applyConfig(next: FxConfig): void {
    this.config = next;
    this.hitFeedback.setConfig(next);
    this.deathFx.setConfig(next);
    this.footsteps.setConfig(next);
    this.spellVfx.setConfig(next);
    this.cursorTarget.setConfig(next);
    this.lootDrop.setConfig(next);
  }

  /** Advance all FX subsystems by dtMs. */
  update(dtMs: number): void {
    this.hitFeedback.update(dtMs);
    this.deathFx.update(dtMs);
    this.footsteps.update(dtMs);
    this.spellVfx.update(dtMs);
    this.cursorTarget.update(dtMs);
    this.lootDrop.update(dtMs);
  }

  /** Clear all active FX pools and timers. */
  clear(): void {
    this.hitFeedback.clear();
    this.deathFx.clear();
    this.footsteps.clear();
    this.spellVfx.clear();
    this.cursorTarget.clear();
    this.lootDrop.clear();
  }

  getStats(): FxEngineStats {
    return {
      quality: this.config.quality,
      reducedMotion: this.config.reducedMotion,
      hitParticles: this.hitFeedback.particles.activeCount,
      maxParticles: this.config.maxParticles,
      corpseDecals: this.deathFx.decals.activeCount,
      maxDecals: this.config.maxDecals,
      bones: this.deathFx.bones.activeCount,
      motes: this.deathFx.motes.activeCount,
      footsteps: this.footsteps.footsteps.activeCount,
      lightBursts: this.spellVfx.lightBursts.activeCount,
      maxLightBursts: this.config.maxLightBursts,
      ripples: this.cursorTarget.ripples.activeCount,
      maxRipples: this.config.maxRipples,
      lootBeams: this.lootDrop.beams.activeCount,
      maxBeams: this.config.maxBeams,
      timeScale: this.deathFx.getTimeScale(),
    };
  }
}
