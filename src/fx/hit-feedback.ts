/**
 * A1 — Hit Feedback System:
 * - Hit-stop frame counter (2-4 frames freeze on heavy/crit hits, 0 when reducedMotion)
 * - Damage-scaled screen shake decay vector
 * - Sprite white-flash timer map
 * - Directional particle emitter per enemy family (blood, bone, ash, spark, ichor, ectoplasm)
 * - Crit "pop" floating number curve
 */

import { type FxConfig, scaleEmitCount } from './config';
import { FxPool } from './pool';

export type HitParticleMaterial = 'blood' | 'bone' | 'ash' | 'spark' | 'ichor' | 'ectoplasm';

export interface HitParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  size: number;
  color: number;
  alpha: number;
  lifeMs: number;
  maxLifeMs: number;
  material: HitParticleMaterial;
}

export interface ShakeVector {
  x: number;
  y: number;
  trauma: number;
}

export interface FloaterCurveSample {
  scale: number;
  offsetY: number;
  alpha: number;
}

export interface HitEventInput {
  x: number;
  y: number;
  dirX?: number;
  dirY?: number;
  damage: number;
  maxHp: number;
  isCrit?: boolean;
  unitId?: number;
  family?: string;
}

interface MaterialSpec {
  colors: readonly number[];
  speedMin: number;
  speedMax: number;
  gravity: number;
  drag: number;
  sizeMin: number;
  sizeMax: number;
  lifeMinMs: number;
  lifeMaxMs: number;
}

const MATERIAL_SPECS: Readonly<Record<HitParticleMaterial, MaterialSpec>> = {
  blood: {
    colors: [0x8a1010, 0xb01818, 0x5c0808, 0xc82424],
    speedMin: 48,
    speedMax: 130,
    gravity: 260,
    drag: 0.92,
    sizeMin: 2.0,
    sizeMax: 4.2,
    lifeMinMs: 220,
    lifeMaxMs: 420,
  },
  bone: {
    colors: [0xe8e0c8, 0xd4c8a8, 0xb8aa8c, 0xf5f0e0],
    speedMin: 55,
    speedMax: 145,
    gravity: 340,
    drag: 0.94,
    sizeMin: 2.2,
    sizeMax: 4.5,
    lifeMinMs: 260,
    lifeMaxMs: 480,
  },
  ash: {
    colors: [0x585050, 0x807470, 0xff6a20, 0x383232],
    speedMin: 30,
    speedMax: 95,
    gravity: -35,
    drag: 0.9,
    sizeMin: 2.0,
    sizeMax: 4.0,
    lifeMinMs: 300,
    lifeMaxMs: 560,
  },
  spark: {
    colors: [0xffd84a, 0xff9a28, 0xffffff, 0x6ac8ff],
    speedMin: 80,
    speedMax: 185,
    gravity: 140,
    drag: 0.89,
    sizeMin: 1.5,
    sizeMax: 3.2,
    lifeMinMs: 180,
    lifeMaxMs: 340,
  },
  ichor: {
    colors: [0x78c838, 0x4a8c28, 0xa8e858, 0x2e5818],
    speedMin: 40,
    speedMax: 115,
    gravity: 220,
    drag: 0.91,
    sizeMin: 2.0,
    sizeMax: 4.0,
    lifeMinMs: 240,
    lifeMaxMs: 440,
  },
  ectoplasm: {
    colors: [0x58e8d8, 0xb868ff, 0x90fff0, 0x6898ff],
    speedMin: 28,
    speedMax: 90,
    gravity: -48,
    drag: 0.93,
    sizeMin: 2.2,
    sizeMax: 4.6,
    lifeMinMs: 280,
    lifeMaxMs: 540,
  },
};

/** Maps all Thornvael unit/monster families to their hit particle material. */
export const FAMILY_HIT_MATERIAL: Readonly<Record<string, HitParticleMaterial>> = {
  // Skeleton / Undead Bone
  'hollow-knight': 'bone',
  'hollow-king': 'bone',
  'greater-mummy': 'bone',
  'doom-knight': 'bone',
  'crowned-maw': 'bone',
  'pale-burrower': 'bone',

  // Spectral / Caster Ectoplasm
  'mire-wisp': 'ectoplasm',
  'glasswing': 'ectoplasm',
  'rift-moth': 'ectoplasm',
  'night-orchard': 'ectoplasm',
  'frost-bell': 'ectoplasm',
  'lantern-eel': 'ectoplasm',
  'witch-doctor': 'ectoplasm',
  'storm-kite': 'ectoplasm',

  // Construct / Forge / Volcanic Ash & Spark
  'cinderling': 'ash',
  'ash-weaver': 'ash',
  'cinder-shaman': 'ash',
  'cinderhorn': 'ash',
  'redglass-drake': 'ash',
  'ashkarath': 'ash',
  'basalt-brute': 'spark',
  'anvilmaw-smith': 'spark',
  'silt-colossus': 'spark',
  'golem': 'spark',
  'flintback': 'spark',
  'ironbark': 'spark',
  'stormtree': 'spark',
  'rootbound': 'ash',

  // Insectoid / Fungal / Venom Ichor
  'ruin-mite': 'ichor',
  'dune-scarab': 'ichor',
  'maggot-swarm': 'ichor',
  'spore-matron': 'ichor',
  'salt-crab': 'ichor',
  'claw-viper': 'ichor',

  // Beasts / Humanoids / Bosses Blood
  'briar-hound': 'blood',
  'thorn-boar': 'blood',
  'quill-fiend': 'blood',
  'fallen-shaman': 'blood',
  'gloom-stag': 'blood',
  'fetish-blowdart': 'blood',
  'dune-lurker': 'blood',
  'sand-raider': 'blood',
  'dune-beast': 'blood',
  'wendigo-bruiser': 'blood',
  'gnoll': 'blood',
  'imp': 'blood',
  'hero': 'blood',
  'warrior': 'blood',
  'archer': 'blood',
  'mage': 'blood',
  'morvessa': 'ectoplasm',
  'gorrathul': 'blood',
  'vesperion': 'ectoplasm',
};

export function getHitMaterialForFamily(family?: string): HitParticleMaterial {
  if (!family) return 'blood';
  return FAMILY_HIT_MATERIAL[family] ?? 'blood';
}

function createEmptyParticle(): HitParticle {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    gravity: 0,
    drag: 0.92,
    size: 2,
    color: 0xffffff,
    alpha: 1,
    lifeMs: 0,
    maxLifeMs: 300,
    material: 'blood',
  };
}

function resetParticle(p: HitParticle): void {
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.gravity = 0;
  p.drag = 0.92;
  p.size = 2;
  p.color = 0xffffff;
  p.alpha = 1;
  p.lifeMs = 0;
  p.maxLifeMs = 300;
  p.material = 'blood';
}

export class HitFeedbackSystem {
  readonly particles: FxPool<HitParticle>;
  private readonly flashes = new Map<number, { remainingMs: number; totalMs: number }>();

  private hitStopFrames = 0;
  private trauma = 0;
  private shakeTime = 0;
  private shakeX = 0;
  private shakeY = 0;
  private rngState = 0x9e3779b9;

  constructor(private config: FxConfig, maxPoolCapacity = 512) {
    const cap = Math.max(maxPoolCapacity, config.maxParticles);
    this.particles = new FxPool<HitParticle>(cap, createEmptyParticle, resetParticle, config.maxParticles);
  }

  /** Update config dynamically (e.g. quality switch or reducedMotion toggle). */
  setConfig(config: FxConfig): void {
    this.config = config;
    this.particles.setCap(config.maxParticles);
    if (!config.hitStopEnabled || config.reducedMotion) {
      this.hitStopFrames = 0;
    }
    if (!config.shakeEnabled || config.reducedMotion) {
      this.trauma = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  /** Trigger hit-stop freeze for 2-4 frames (0 if reducedMotion or disabled). */
  triggerHitStop(frames: number): number {
    if (!this.config.hitStopEnabled || this.config.reducedMotion || this.config.hitStopMaxFrames <= 0) {
      this.hitStopFrames = 0;
      return 0;
    }
    const clamped = Math.max(0, Math.min(this.config.hitStopMaxFrames, Math.round(frames)));
    this.hitStopFrames = Math.max(this.hitStopFrames, clamped);
    return this.hitStopFrames;
  }

  /** Advance one render/sim frame for hit-stop; returns true if currently frozen. */
  stepHitStopFrame(): boolean {
    if (this.hitStopFrames <= 0) return false;
    this.hitStopFrames--;
    return true;
  }

  get remainingHitStopFrames(): number {
    return this.hitStopFrames;
  }

  /** Add trauma scaled by damage / maxHp and crit multiplier. */
  addDamageShake(damage: number, maxHp: number, isCrit = false): void {
    if (!this.config.shakeEnabled || this.config.reducedMotion) {
      this.trauma = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      return;
    }
    const safeMax = Math.max(1, maxHp);
    const ratio = Math.min(1, Math.max(0, damage / safeMax));
    const critBoost = isCrit ? 0.28 : 0;
    const delta = Math.min(0.85, ratio * 0.65 + critBoost);
    this.trauma = Math.min(1.0, this.trauma + delta);
  }

  /** Add direct trauma (0..1), e.g. for boss death or heavy explosions. */
  addTrauma(amount: number): void {
    if (!this.config.shakeEnabled || this.config.reducedMotion) return;
    this.trauma = Math.min(1.0, this.trauma + Math.max(0, amount));
  }

  getShake(): ShakeVector {
    return { x: this.shakeX, y: this.shakeY, trauma: this.trauma };
  }

  /** Trigger a white-flash timer on a struck unit sprite. */
  triggerFlash(unitId: number, durationMs = 90): void {
    if (durationMs <= 0) return;
    this.flashes.set(unitId, { remainingMs: durationMs, totalMs: durationMs });
  }

  /** Returns normalized flash intensity [0..1] for a unit sprite. */
  getFlashIntensity(unitId: number): number {
    const entry = this.flashes.get(unitId);
    if (!entry || entry.remainingMs <= 0) return 0;
    return Math.min(1, entry.remainingMs / Math.max(1, entry.totalMs));
  }

  isFlashing(unitId: number): boolean {
    return this.getFlashIntensity(unitId) > 0;
  }

  /** Emit directional hit particles based on enemy family material. */
  emitDirectionalBurst(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    family?: string,
    baseCount = 8,
  ): HitParticleMaterial {
    const material = getHitMaterialForFamily(family);
    const spec = MATERIAL_SPECS[material];
    const count = scaleEmitCount(baseCount, this.config);
    const baseAngle = dirX === 0 && dirY === 0 ? 0 : Math.atan2(dirY, dirX);
    const coneHalf = dirX === 0 && dirY === 0 ? Math.PI : 0.72;

    for (let i = 0; i < count; i++) {
      const p = this.particles.acquire();
      if (!p) break;
      const angle = baseAngle + (this.nextRand() * 2 - 1) * coneHalf;
      const speed = spec.speedMin + this.nextRand() * (spec.speedMax - spec.speedMin);
      p.x = x + (this.nextRand() - 0.5) * 6;
      p.y = y + (this.nextRand() - 0.5) * 6;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 18;
      p.gravity = spec.gravity;
      p.drag = spec.drag;
      p.size = spec.sizeMin + this.nextRand() * (spec.sizeMax - spec.sizeMin);
      p.color = spec.colors[Math.floor(this.nextRand() * spec.colors.length)];
      p.alpha = 1;
      p.lifeMs = 0;
      p.maxLifeMs = spec.lifeMinMs + this.nextRand() * (spec.lifeMaxMs - spec.lifeMinMs);
      p.material = material;
    }

    return material;
  }

  /** Unified handler for a combat hit event. */
  onHit(ev: HitEventInput): { material: HitParticleMaterial; hitStopFrames: number } {
    const ratio = ev.damage / Math.max(1, ev.maxHp);
    const isHeavy = ev.isCrit || ratio >= 0.25;

    let hitStopFrames = 0;
    if (ev.isCrit) {
      hitStopFrames = this.triggerHitStop(3);
    } else if (ratio >= 0.35) {
      hitStopFrames = this.triggerHitStop(4);
    } else if (isHeavy) {
      hitStopFrames = this.triggerHitStop(2);
    }

    this.addDamageShake(ev.damage, ev.maxHp, Boolean(ev.isCrit));

    if (ev.unitId !== undefined) {
      this.triggerFlash(ev.unitId, ev.isCrit ? 110 : 80);
    }

    const baseCount = ev.isCrit ? 12 : isHeavy ? 9 : 6;
    const material = this.emitDirectionalBurst(
      ev.x,
      ev.y,
      ev.dirX ?? 0,
      ev.dirY ?? 0,
      ev.family,
      baseCount,
    );

    return { material, hitStopFrames };
  }

  /**
   * Crit "pop" floating number curve.
   * @param progress normalized lifetime [0..1]
   * @param isCrit whether hit was a critical strike
   */
  evaluateFloaterCurve(progress: number, isCrit: boolean): FloaterCurveSample {
    const t = Math.max(0, Math.min(1, progress));
    const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;

    if (!isCrit || this.config.reducedMotion) {
      return {
        scale: 1,
        offsetY: -t * 26,
        alpha,
      };
    }

    // Crit pop: rapid overshoot to 1.55 in first 18%, settle to 1.05 by 40%
    let scale = 1.0;
    if (t < 0.18) {
      const k = t / 0.18;
      scale = 0.8 + 0.75 * Math.sin((k * Math.PI) / 2);
    } else if (t < 0.42) {
      const k = (t - 0.18) / 0.24;
      scale = 1.55 - 0.5 * k;
    } else {
      scale = 1.05;
    }

    return {
      scale,
      offsetY: -t * 36 - (t < 0.2 ? Math.sin((t / 0.2) * Math.PI) * 6 : 0),
      alpha,
    };
  }

  /** Advance shake, flash timers, and particles by dtMs. */
  update(dtMs: number): void {
    const dt = Math.max(0, dtMs) / 1000;

    // Update flashes
    for (const [uid, entry] of this.flashes.entries()) {
      entry.remainingMs -= dtMs;
      if (entry.remainingMs <= 0) {
        this.flashes.delete(uid);
      }
    }

    // Update screen shake
    if (!this.config.shakeEnabled || this.config.reducedMotion || this.trauma <= 0.001) {
      this.trauma = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    } else {
      this.shakeTime += dt * 42;
      const amp = this.trauma * this.trauma * 12;
      this.shakeX = Math.sin(this.shakeTime * 1.7) * amp;
      this.shakeY = Math.cos(this.shakeTime * 2.3) * amp;
      this.trauma = Math.max(0, this.trauma - dt * 2.8);
    }

    // Update particles
    const dragStep = Math.pow(0.92, dt * 60);
    this.particles.updateEach((p) => {
      p.lifeMs += dtMs;
      if (p.lifeMs >= p.maxLifeMs) return false;
      p.vy += p.gravity * dt;
      const d = p.drag === 0.92 ? dragStep : Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = 1 - p.lifeMs / p.maxLifeMs;
      return true;
    });
  }

  clear(): void {
    this.particles.clear();
    this.flashes.clear();
    this.hitStopFrames = 0;
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  private nextRand(): number {
    // Mulberry32 step for deterministic, Math.random-free bursts
    let t = (this.rngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
