/**
 * A2 — Per-Family Death Effects & Corpse Decal Manager:
 * - Skeletons: collapse into bouncing/rotating bone piece scatter
 * - Beasts: leave a fading ground corpse decal (strictly capped for mobile)
 * - Casters: burst into rising spectral/arcane motes
 * - Constructs: shatter into stone/ash debris
 * - Bosses: slow-mo time scale + heavy shake + parabolic loot fountain trajectory
 */

import { type FxConfig, scaleEmitCount } from './config';
import { FxPool } from './pool';
import type { HitFeedbackSystem } from './hit-feedback';

export type DeathArchetype = 'skeleton' | 'beast' | 'caster' | 'construct' | 'boss';

export interface BonePiece {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  vrot: number;
  kind: 0 | 1 | 2; // 0: shard, 1: rib, 2: skull/joint
  alpha: number;
  lifeMs: number;
  maxLifeMs: number;
  settled: boolean;
}

export interface CorpseDecal {
  x: number;
  y: number;
  radius: number;
  rotation: number;
  color: number;
  alpha: number;
  ageMs: number;
  fadeAfterMs: number;
  fadeDurationMs: number;
  archetype: DeathArchetype;
}

export interface DeathMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: number;
  alpha: number;
  lifeMs: number;
  maxLifeMs: number;
}

export interface LootFountainArc {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vz: number;
  color: number;
}

export interface BossDeathResult {
  slowMoActive: boolean;
  timeScale: number;
  fountain: LootFountainArc[];
}

export const FAMILY_DEATH_ARCHETYPE: Readonly<Record<string, DeathArchetype>> = {
  // Skeletons / Undead
  'hollow-knight': 'skeleton',
  'hollow-king': 'skeleton',
  'greater-mummy': 'skeleton',
  'doom-knight': 'skeleton',
  'crowned-maw': 'skeleton',
  'pale-burrower': 'skeleton',

  // Casters / Spectral
  'mire-wisp': 'caster',
  'glasswing': 'caster',
  'rift-moth': 'caster',
  'night-orchard': 'caster',
  'frost-bell': 'caster',
  'lantern-eel': 'caster',
  'witch-doctor': 'caster',
  'fallen-shaman': 'caster',
  'cinder-shaman': 'caster',
  'ash-weaver': 'caster',
  'storm-kite': 'caster',
  'spore-matron': 'caster',
  'mage': 'caster',

  // Constructs / Elementals
  'basalt-brute': 'construct',
  'anvilmaw-smith': 'construct',
  'silt-colossus': 'construct',
  'golem': 'construct',
  'flintback': 'construct',
  'ironbark': 'construct',
  'stormtree': 'construct',
  'rootbound': 'construct',
  'cinderling': 'construct',

  // Bosses
  'morvessa': 'boss',
  'gorrathul': 'boss',
  'vesperion': 'boss',
  'ashkarath': 'boss',
};

export function getDeathArchetype(family?: string, isBoss = false): DeathArchetype {
  if (isBoss) return 'boss';
  if (!family) return 'beast';
  return FAMILY_DEATH_ARCHETYPE[family] ?? 'beast';
}

function createBonePiece(): BonePiece {
  return {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    rot: 0,
    vrot: 0,
    kind: 0,
    alpha: 1,
    lifeMs: 0,
    maxLifeMs: 2500,
    settled: false,
  };
}

function resetBonePiece(b: BonePiece): void {
  b.x = 0;
  b.y = 0;
  b.z = 0;
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.rot = 0;
  b.vrot = 0;
  b.kind = 0;
  b.alpha = 1;
  b.lifeMs = 0;
  b.maxLifeMs = 2500;
  b.settled = false;
}

function createCorpseDecal(): CorpseDecal {
  return {
    x: 0,
    y: 0,
    radius: 10,
    rotation: 0,
    color: 0x5c1212,
    alpha: 0.75,
    ageMs: 0,
    fadeAfterMs: 8000,
    fadeDurationMs: 2000,
    archetype: 'beast',
  };
}

function resetCorpseDecal(d: CorpseDecal): void {
  d.x = 0;
  d.y = 0;
  d.radius = 10;
  d.rotation = 0;
  d.color = 0x5c1212;
  d.alpha = 0.75;
  d.ageMs = 0;
  d.fadeAfterMs = 8000;
  d.fadeDurationMs = 2000;
  d.archetype = 'beast';
}

function createDeathMote(): DeathMote {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 3,
    color: 0xb868ff,
    alpha: 1,
    lifeMs: 0,
    maxLifeMs: 650,
  };
}

function resetDeathMote(m: DeathMote): void {
  m.x = 0;
  m.y = 0;
  m.vx = 0;
  m.vy = 0;
  m.radius = 3;
  m.color = 0xb868ff;
  m.alpha = 1;
  m.lifeMs = 0;
  m.maxLifeMs = 650;
}

export class DeathFxSystem {
  readonly bones: FxPool<BonePiece>;
  readonly decals: FxPool<CorpseDecal>;
  readonly motes: FxPool<DeathMote>;

  private slowMoRemainingMs = 0;
  private slowMoScale = 1.0;
  private rngState = 0x517cc1b7;

  constructor(private config: FxConfig, private readonly hitFeedback?: HitFeedbackSystem) {
    this.bones = new FxPool<BonePiece>(160, createBonePiece, resetBonePiece, Math.min(160, config.maxParticles));
    this.decals = new FxPool<CorpseDecal>(120, createCorpseDecal, resetCorpseDecal, config.maxDecals);
    this.motes = new FxPool<DeathMote>(180, createDeathMote, resetDeathMote, Math.min(180, config.maxParticles));
  }

  setConfig(config: FxConfig): void {
    this.config = config;
    this.decals.setCap(config.maxDecals);
    this.bones.setCap(Math.min(160, config.maxParticles));
    this.motes.setCap(Math.min(180, config.maxParticles));
    if (!config.slowMoEnabled || config.reducedMotion) {
      this.slowMoRemainingMs = 0;
      this.slowMoScale = 1.0;
    }
  }

  getTimeScale(): number {
    return this.slowMoRemainingMs > 0 ? this.slowMoScale : 1.0;
  }

  /** Trigger appropriate per-family death FX and return the resolved archetype. */
  onUnitDeath(
    x: number,
    y: number,
    family?: string,
    isBoss = false,
  ): { archetype: DeathArchetype; bossResult?: BossDeathResult } {
    const archetype = getDeathArchetype(family, isBoss);

    switch (archetype) {
      case 'skeleton':
        this.spawnBoneScatter(x, y, 7);
        this.spawnCorpseDecal(x, y, 'skeleton', 0x9c9278, 11);
        break;
      case 'caster':
        this.spawnCasterMotes(x, y, 12, 0xb868ff);
        this.spawnCorpseDecal(x, y, 'caster', 0x3b2458, 10);
        break;
      case 'construct':
        this.spawnBoneScatter(x, y, 6); // rubble/shards
        this.spawnCorpseDecal(x, y, 'construct', 0x48444c, 13);
        break;
      case 'boss': {
        this.spawnCasterMotes(x, y, 18, 0xff9830);
        this.spawnCorpseDecal(x, y, 'boss', 0x6a0e0e, 18);
        const bossResult = this.triggerBossDeath(x, y);
        return { archetype, bossResult };
      }
      case 'beast':
      default:
        this.spawnCorpseDecal(x, y, 'beast', 0x641010, 12);
        break;
    }

    return { archetype };
  }

  spawnBoneScatter(x: number, y: number, baseCount = 7): void {
    const count = scaleEmitCount(baseCount, this.config);
    for (let i = 0; i < count; i++) {
      const b = this.bones.acquire();
      if (!b) break;
      const angle = this.nextRand() * Math.PI * 2;
      const speed = 42 + this.nextRand() * 88;
      b.x = x + (this.nextRand() - 0.5) * 8;
      b.y = y + (this.nextRand() - 0.5) * 8;
      b.z = 4 + this.nextRand() * 6;
      b.vx = Math.cos(angle) * speed;
      b.vy = Math.sin(angle) * speed * 0.7;
      b.vz = 75 + this.nextRand() * 90;
      b.rot = this.nextRand() * Math.PI * 2;
      b.vrot = (this.nextRand() - 0.5) * 14;
      b.kind = (i % 3) as 0 | 1 | 2;
      b.alpha = 1;
      b.lifeMs = 0;
      b.maxLifeMs = 2200 + this.nextRand() * 800;
      b.settled = false;
    }
  }

  spawnCorpseDecal(
    x: number,
    y: number,
    archetype: DeathArchetype,
    color = 0x641010,
    radius = 12,
  ): CorpseDecal | null {
    const d = this.decals.acquire();
    if (!d) return null;
    d.x = x;
    d.y = y;
    d.radius = radius;
    d.rotation = this.nextRand() * Math.PI * 2;
    d.color = color;
    d.alpha = 0.75;
    d.ageMs = 0;
    d.fadeAfterMs = this.config.quality === 'low' ? 5000 : 9000;
    d.fadeDurationMs = 2000;
    d.archetype = archetype;
    return d;
  }

  spawnCasterMotes(x: number, y: number, baseCount = 12, color = 0xb868ff): void {
    const count = scaleEmitCount(baseCount, this.config);
    for (let i = 0; i < count; i++) {
      const m = this.motes.acquire();
      if (!m) break;
      const angle = (i / Math.max(1, count)) * Math.PI * 2 + this.nextRand() * 0.4;
      const speed = 24 + this.nextRand() * 52;
      m.x = x + Math.cos(angle) * 6;
      m.y = y + Math.sin(angle) * 4;
      m.vx = Math.cos(angle) * speed;
      m.vy = -38 - this.nextRand() * 54;
      m.radius = 2.2 + this.nextRand() * 2.5;
      m.color = color;
      m.alpha = 1;
      m.lifeMs = 0;
      m.maxLifeMs = 450 + this.nextRand() * 350;
    }
  }

  triggerBossDeath(x: number, y: number, lootCount = 8): BossDeathResult {
    let slowMoActive = false;
    if (this.config.slowMoEnabled && !this.config.reducedMotion) {
      this.slowMoScale = 0.35;
      this.slowMoRemainingMs = 480;
      slowMoActive = true;
    }
    this.hitFeedback?.addTrauma(0.85);

    const fountain: LootFountainArc[] = [];
    for (let i = 0; i < lootCount; i++) {
      const angle = (i / Math.max(1, lootCount)) * Math.PI * 2 + this.nextRand() * 0.3;
      const speed = 55 + this.nextRand() * 65;
      fountain.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.75,
        vz: 140 + this.nextRand() * 80,
        color: i % 3 === 0 ? 0xd48c3c : i % 2 === 0 ? 0xf7d748 : 0x4b7bec,
      });
    }

    return {
      slowMoActive,
      timeScale: this.getTimeScale(),
      fountain,
    };
  }

  update(dtMs: number): void {
    const dt = Math.max(0, dtMs) / 1000;

    if (this.slowMoRemainingMs > 0) {
      this.slowMoRemainingMs = Math.max(0, this.slowMoRemainingMs - dtMs);
      if (this.slowMoRemainingMs === 0) {
        this.slowMoScale = 1.0;
      }
    }

    this.bones.updateEach((b) => {
      b.lifeMs += dtMs;
      if (b.lifeMs >= b.maxLifeMs) return false;
      if (!b.settled) {
        b.vz -= 420 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        b.rot += b.vrot * dt;
        if (b.z <= 0) {
          b.z = 0;
          if (Math.abs(b.vz) > 45) {
            b.vz = -b.vz * 0.42;
            b.vx *= 0.65;
            b.vy *= 0.65;
            b.vrot *= 0.5;
          } else {
            b.vz = 0;
            b.vx = 0;
            b.vy = 0;
            b.vrot = 0;
            b.settled = true;
          }
        }
      }
      const fadeStart = b.maxLifeMs * 0.65;
      b.alpha = b.lifeMs > fadeStart ? Math.max(0, 1 - (b.lifeMs - fadeStart) / (b.maxLifeMs - fadeStart)) : 1;
      return true;
    });

    this.decals.updateEach((d) => {
      d.ageMs += dtMs;
      if (d.ageMs >= d.fadeAfterMs + d.fadeDurationMs) return false;
      if (d.ageMs > d.fadeAfterMs) {
        const t = (d.ageMs - d.fadeAfterMs) / Math.max(1, d.fadeDurationMs);
        d.alpha = Math.max(0, 0.75 * (1 - t));
      }
      return true;
    });

    this.motes.updateEach((m) => {
      m.lifeMs += dtMs;
      if (m.lifeMs >= m.maxLifeMs) return false;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.alpha = 1 - m.lifeMs / m.maxLifeMs;
      return true;
    });
  }

  clear(): void {
    this.bones.clear();
    this.decals.clear();
    this.motes.clear();
    this.slowMoRemainingMs = 0;
    this.slowMoScale = 1.0;
  }

  private nextRand(): number {
    let t = (this.rngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
