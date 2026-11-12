import { Container, Graphics, Particle, ParticleContainer, Rectangle, Texture } from 'pixi.js';
import type { Sim } from './sim/sim';
import { SPELLS, St, Tk } from './sim/spelldata';
import { FP } from './sim/sim';
import { TILE } from './map';

/**
 * AAA Visual Effects System for Thornvael apex spells (indices 24–31):
 * - Meteor (fire, ground, radius 3): falling flaming rock, growing ground shadow, crater flash, scorch and embers.
 * - Inferno (fire, multi, 5 targets): leaping spinning ring of fire chaining from target to target with expanding fiery toruses.
 * - Blizzard (water, ground, radius 3.5): swirling snow vortex and crystalline ice shards over chilled ground frost.
 * - Thunderstorm (air, multi, 4 targets): forked fractal lightning bolts jumping between targets with screen-space flash.
 * - Iron Skin (earth, self): faceted metallic carapace outline with specular glint sweep on caster.
 * - Acid Rain (earth, ground, radius 3.5): angled toxic-green droplets with bubbling, sizzling caustic puddles.
 * - Mana Burn (astral, foe): inward energy suction / reverse shockwave collapsing into singularity and violent violet pop.
 * - Time Warp (astral, self): expanding ethereal clock dial with spinning hands, ripple waves, and caster afterimages.
 *
 * Performance:
 * - ParticleContainer for batched particle rendering from a single runtime procedural texture atlas.
 * - Zero allocations per frame: pre-allocated object pools for particles, effects, and lightning geometry.
 * - Respects quality settings (Low = 25% particles, Medium = 50%, High = 100%).
 * - Pure procedural runtime art (Canvas 2D): no external image files or copied assets.
 */

const MAX_PARTICLES = 650;
const MAX_METEORS = 6;
const MAX_BLIZZARDS = 4;
const MAX_ACID_RAINS = 4;
const MAX_MANA_BURNS = 6;
const MAX_THUNDERSTORMS = 6;
const MAX_INFERNO_RINGS = 8;
const MAX_TIME_WARPS = 4;
const MAX_AFTERIMAGES = 24;

interface VfxParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  drag: number;
  scale: number;
  scaleEnd: number;
  rot: number;
  vrot: number;
  alpha: number;
  alphaEnd: number;
  color: number;
  colorEnd: number;
  life: number;
  maxLife: number;
  texIdx: number;
  container: ParticleContainer | null;
  pixiParticle: Particle | null;
}

interface MeteorEffect {
  active: boolean;
  targetX: number; // world pixels
  targetY: number;
  radiusPx: number;
  elapsed: number;
  impactTime: number; // 520ms
  totalTime: number; // 2200ms
  rockRot: number;
}

interface BlizzardEffect {
  active: boolean;
  x: number;
  y: number;
  radiusPx: number;
  elapsed: number;
  totalTime: number; // 4000ms
  pulsePhase: number;
}

interface AcidRainEffect {
  active: boolean;
  x: number;
  y: number;
  radiusPx: number;
  elapsed: number;
  totalTime: number; // 4200ms
  puddleSeeds: Float32Array; // 8 puddles: [dx, dy, rx, ry] * 8 = 32 floats
  bubbleTimers: Float32Array; // 16 bubbles
}

interface ManaBurnEffect {
  active: boolean;
  targetX: number;
  targetY: number;
  elapsed: number;
  suctionTime: number; // 220ms
  totalTime: number; // 580ms
  popped: boolean;
}

interface LightningBranch {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  ptsX: Float32Array;
  ptsY: Float32Array;
  count: number;
}

interface ThunderstormEffect {
  active: boolean;
  elapsed: number;
  totalTime: number; // 260ms
  branches: LightningBranch[];
  branchCount: number;
  strobeTime: number;
}

interface InfernoRingEffect {
  active: boolean;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  elapsed: number;
  totalTime: number; // 400ms
  radius: number;
}

interface TimeWarpEffect {
  active: boolean;
  x: number;
  y: number;
  elapsed: number;
  totalTime: number; // 1200ms
}

interface AfterimageGhost {
  active: boolean;
  x: number;
  y: number;
  unitId: number;
  elapsed: number;
  maxTime: number; // 350ms
  tint: number;
  scaleX: number;
  scaleY: number;
}

interface ActiveIronSkin {
  unitId: number;
  elapsed: number;
}

// Procedural atlas sub-texture definitions on 256x256 canvas
const TEX_GLOW = 0;
const TEX_SHARD = 1;
const TEX_SPARK = 2;
const TEX_RING = 3;
const TEX_ROCK = 4;
const TEX_DROPLET = 5;
const TEX_BUBBLE = 6;
const TEX_SMOKE = 7;
const TEX_COUNT = 8;

export class VfxSystem {
  readonly groundLayer = new Container();
  readonly airLayer = new Container();
  private readonly groundGfx = new Graphics();
  private readonly airGfx = new Graphics();
  private groundParticles: ParticleContainer | null = null;
  private airParticles: ParticleContainer | null = null;

  private atlasTexture: Texture | null = null;
  private subTextures: Texture[] = [];

  // Pools
  private readonly particlePool: VfxParticle[] = [];
  private readonly meteors: MeteorEffect[] = [];
  private readonly blizzards: BlizzardEffect[] = [];
  private readonly acidRains: AcidRainEffect[] = [];
  private readonly manaBurns: ManaBurnEffect[] = [];
  private readonly thunderstorms: ThunderstormEffect[] = [];
  private readonly infernoRings: InfernoRingEffect[] = [];
  private readonly timeWarps: TimeWarpEffect[] = [];
  private readonly afterimages: AfterimageGhost[] = [];
  private readonly ironSkins: Map<number, ActiveIronSkin> = new Map();
  private readonly timeWarpUnits: Set<number> = new Set();

  private screenFlash = 0; // alpha 0..0.4
  private screenFlashDecay = 0;
  private cameraRumble = 0;
  private lastTime = 0;
  private quality = 2; // 0 Low, 1 Medium, 2 High

  // Previous projectile alive state to detect projectile hit transitions
  private prevProjAlive = new Uint8Array(256);
  private prevProjS = new Uint8Array(256);
  private prevProjT = new Int32Array(256);
  private prevProjX = new Int32Array(256);
  private prevProjY = new Int32Array(256);

  // Scratch memory for midpoint displacement lightning
  private readonly scratchPtsX = new Float32Array(64);
  private readonly scratchPtsY = new Float32Array(64);

  constructor() {
    this.groundLayer.addChild(this.groundGfx);
    this.airLayer.addChild(this.airGfx);
    this.initPools();
  }

  private initPools(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particlePool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        ax: 0,
        ay: 0,
        drag: 1,
        scale: 1,
        scaleEnd: 1,
        rot: 0,
        vrot: 0,
        alpha: 1,
        alphaEnd: 0,
        color: 0xffffff,
        colorEnd: 0xffffff,
        life: 0,
        maxLife: 1,
        texIdx: 0,
        container: null,
        pixiParticle: null,
      });
    }

    for (let i = 0; i < MAX_METEORS; i++) {
      this.meteors.push({ active: false, targetX: 0, targetY: 0, radiusPx: 96, elapsed: 0, impactTime: 520, totalTime: 2200, rockRot: 0 });
    }

    for (let i = 0; i < MAX_BLIZZARDS; i++) {
      this.blizzards.push({ active: false, x: 0, y: 0, radiusPx: 112, elapsed: 0, totalTime: 4000, pulsePhase: 0 });
    }

    for (let i = 0; i < MAX_ACID_RAINS; i++) {
      const puddleSeeds = new Float32Array(32);
      // Pre-seed 8 irregular puddle offsets and radii
      for (let p = 0; p < 8; p++) {
        const ang = (p * Math.PI * 2) / 8 + (Math.sin(p * 2.3) * 0.4);
        const dist = 25 + Math.abs(Math.sin(p * 1.7)) * 55;
        puddleSeeds[p * 4 + 0] = Math.cos(ang) * dist;
        puddleSeeds[p * 4 + 1] = Math.sin(ang) * dist * 0.55;
        puddleSeeds[p * 4 + 2] = 14 + (p % 4) * 4; // rx
        puddleSeeds[p * 4 + 3] = 7 + (p % 3) * 3; // ry
      }
      this.acidRains.push({
        active: false,
        x: 0,
        y: 0,
        radiusPx: 112,
        elapsed: 0,
        totalTime: 4200,
        puddleSeeds,
        bubbleTimers: new Float32Array(16),
      });
    }

    for (let i = 0; i < MAX_MANA_BURNS; i++) {
      this.manaBurns.push({ active: false, targetX: 0, targetY: 0, elapsed: 0, suctionTime: 220, totalTime: 580, popped: false });
    }

    for (let i = 0; i < MAX_THUNDERSTORMS; i++) {
      const branches: LightningBranch[] = [];
      for (let b = 0; b < 6; b++) {
        branches.push({
          x0: 0,
          y0: 0,
          x1: 0,
          y1: 0,
          ptsX: new Float32Array(32),
          ptsY: new Float32Array(32),
          count: 0,
        });
      }
      this.thunderstorms.push({ active: false, elapsed: 0, totalTime: 260, branches, branchCount: 0, strobeTime: 0 });
    }

    for (let i = 0; i < MAX_INFERNO_RINGS; i++) {
      this.infernoRings.push({ active: false, x: 0, y: 0, targetX: 0, targetY: 0, elapsed: 0, totalTime: 380, radius: 14 });
    }

    for (let i = 0; i < MAX_TIME_WARPS; i++) {
      this.timeWarps.push({ active: false, x: 0, y: 0, elapsed: 0, totalTime: 1200 });
    }

    for (let i = 0; i < MAX_AFTERIMAGES; i++) {
      this.afterimages.push({ active: false, x: 0, y: 0, unitId: -1, elapsed: 0, maxTime: 350, tint: 0x00e5ff, scaleX: 1, scaleY: 1 });
    }
  }

  /** Initialize runtime procedural textures and particle containers. Safe to call in browser environments. */
  init(): void {
    if (typeof document === 'undefined') return;

    // Build procedural 256x256 texture atlas
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 256;
    const g = cv.getContext('2d')!;

    // 0: GLOW (32x32 at 0, 0)
    let rad = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    rad.addColorStop(0, 'rgba(255,255,255,1)');
    rad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    rad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rad;
    g.fillRect(0, 0, 32, 32);

    // 1: SHARD (32x16 at 32, 0)
    g.save();
    g.translate(32, 0);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, 8);
    g.lineTo(16, 2);
    g.lineTo(32, 8);
    g.lineTo(16, 14);
    g.closePath();
    g.fill();
    g.restore();

    // 2: SPARK (32x32 at 64, 0) - 4-pointed sharp star
    g.save();
    g.translate(64, 0);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(16, 0);
    g.lineTo(19, 13);
    g.lineTo(32, 16);
    g.lineTo(19, 19);
    g.lineTo(16, 32);
    g.lineTo(13, 19);
    g.lineTo(0, 16);
    g.lineTo(13, 13);
    g.closePath();
    g.fill();
    g.restore();

    // 3: RING (64x64 at 0, 32) - smooth hollow ring
    g.save();
    g.translate(0, 32);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(32, 32, 24, 0, Math.PI * 2);
    g.stroke();
    g.restore();

    // 4: ROCK (32x32 at 64, 32) - faceted jagged stone
    g.save();
    g.translate(64, 32);
    g.fillStyle = '#e0e0e0';
    g.beginPath();
    g.moveTo(8, 4);
    g.lineTo(24, 2);
    g.lineTo(30, 14);
    g.lineTo(26, 28);
    g.lineTo(12, 30);
    g.lineTo(3, 20);
    g.closePath();
    g.fill();
    // facet shading
    g.fillStyle = '#9e9e9e';
    g.beginPath();
    g.moveTo(16, 14);
    g.lineTo(30, 14);
    g.lineTo(26, 28);
    g.lineTo(12, 30);
    g.closePath();
    g.fill();
    g.restore();

    // 5: DROPLET (16x32 at 96, 0) - teardrop
    g.save();
    g.translate(96, 0);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(8, 2);
    g.quadraticCurveTo(15, 16, 15, 22);
    g.arc(8, 22, 7, 0, Math.PI, false);
    g.quadraticCurveTo(1, 16, 8, 2);
    g.closePath();
    g.fill();
    g.restore();

    // 6: BUBBLE (16x16 at 96, 32) - translucent sphere with highlight
    g.save();
    g.translate(96, 32);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 1.5;
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.beginPath();
    g.arc(8, 8, 6.5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(5.5, 5.5, 1.8, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // 7: SMOKE (32x32 at 0, 96) - soft cloudy puff
    g.save();
    g.translate(0, 96);
    rad = g.createRadialGradient(16, 16, 2, 16, 16, 14);
    rad.addColorStop(0, 'rgba(255,255,255,0.8)');
    rad.addColorStop(0.6, 'rgba(255,255,255,0.3)');
    rad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rad;
    g.beginPath();
    g.arc(16, 16, 14, 0, Math.PI * 2);
    g.fill();
    g.restore();

    this.atlasTexture = Texture.from(cv);

    // Frame rectangles
    const frames = [
      new Rectangle(0, 0, 32, 32),
      new Rectangle(32, 0, 32, 16),
      new Rectangle(64, 0, 32, 32),
      new Rectangle(0, 32, 64, 64),
      new Rectangle(64, 32, 32, 32),
      new Rectangle(96, 0, 16, 32),
      new Rectangle(96, 32, 16, 16),
      new Rectangle(0, 96, 32, 32),
    ];

    this.subTextures = frames.map((f) => new Texture({ source: this.atlasTexture!.source, frame: f }));

    try {
      this.groundParticles = new ParticleContainer({
        dynamicProperties: { position: true, scale: true, rotation: true, color: true, uvs: true },
      });
      this.airParticles = new ParticleContainer({
        dynamicProperties: { position: true, scale: true, rotation: true, color: true, uvs: true },
      });
      this.groundLayer.addChild(this.groundParticles);
      this.airLayer.addChild(this.airParticles);
    } catch {
      // In tests or non-WebGL environments ParticleContainer may fall back
    }
  }

  setQuality(q: number): void {
    this.quality = Math.max(0, Math.min(2, q));
  }

  /** Spawn an individual pooled particle */
  spawnParticle(
    texIdx: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: number,
    scale: number,
    scaleEnd: number,
    maxLife: number,
    alpha = 1,
    alphaEnd = 0,
    rot = 0,
    vrot = 0,
    drag = 1,
    isAir = true,
  ): VfxParticle | null {
    // Quality throttle: Low skips some particles
    if (this.quality === 0 && Math.random() > 0.3) return null;
    if (this.quality === 1 && Math.random() > 0.65) return null;

    let p: VfxParticle | null = null;
    for (let i = 0; i < this.particlePool.length; i++) {
      if (!this.particlePool[i].active) {
        p = this.particlePool[i];
        break;
      }
    }
    if (!p) return null;

    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.ax = 0;
    p.ay = 0;
    p.drag = drag;
    p.scale = scale;
    p.scaleEnd = scaleEnd;
    p.rot = rot;
    p.vrot = vrot;
    p.alpha = alpha;
    p.alphaEnd = alphaEnd;
    p.color = color;
    p.colorEnd = color;
    p.life = 0;
    p.maxLife = maxLife;
    p.texIdx = texIdx;
    p.container = isAir ? this.airParticles : this.groundParticles;

    if (p.container && this.subTextures[texIdx]) {
      if (!p.pixiParticle) {
        p.pixiParticle = new Particle({ texture: this.subTextures[texIdx] });
        p.pixiParticle.anchorX = 0.5;
        p.pixiParticle.anchorY = 0.5;
      } else {
        p.pixiParticle.texture = this.subTextures[texIdx];
      }
      p.pixiParticle.x = x;
      p.pixiParticle.y = y;
      p.pixiParticle.scaleX = scale;
      p.pixiParticle.scaleY = scale;
      p.pixiParticle.rotation = rot;
      p.pixiParticle.tint = color;
      p.pixiParticle.alpha = alpha;
      p.container.addParticle(p.pixiParticle);
    }
    return p;
  }

  // ---- Triggers from Sim events ----

  observeFx(sim: Sim, now: number): void {
    const fx = sim.cb.fx;
    const k = TILE / FP;
    const n = fx.length;

    for (let i = 0; i < n; i++) {
      const e = fx[i];

      // Cast event (type 9): v = spell id, el = school
      if (e.type === 9) {
        const sid = e.v;
        const cx = e.x * k;
        const cy = e.y * k;

        // Ground spells (Meteor 24, Blizzard 26, Acid Rain 29): associate with the immediately following type 5
        if (sid === 24 || sid === 26 || sid === 29) {
          // Look ahead for matching type 5 ground impact in same tick
          let gx = cx, gy = cy, radTiles = 3.5;
          for (let j = i + 1; j < n; j++) {
            if (fx[j].type === 5 && fx[j].el === e.el) {
              gx = fx[j].x * k;
              gy = fx[j].y * k;
              radTiles = fx[j].v / 10;
              break;
            }
          }
          if (sid === 24) this.triggerMeteor(gx, gy, radTiles);
          else if (sid === 26) this.triggerBlizzard(gx, gy, radTiles);
          else if (sid === 29) this.triggerAcidRain(gx, gy, radTiles);
        } else if (sid === 27) {
          // Thunderstorm
          this.triggerThunderstorm(sim, e.x, e.y);
        } else if (sid === 25) {
          // Inferno
          this.triggerInfernoCast(cx, cy);
        } else if (sid === 28) {
          // Iron Skin (self)
          const uid = this.findNearestUnit(sim, e.x, e.y);
          if (uid >= 0) this.triggerIronSkin(uid, cx, cy);
        } else if (sid === 31) {
          // Time Warp (self)
          const uid = this.findNearestUnit(sim, e.x, e.y);
          if (uid >= 0) this.triggerTimeWarp(uid, cx, cy);
        }
      }
    }
  }

  private findNearestUnit(sim: Sim, fx: number, fy: number): number {
    let best = -1;
    let minD2 = 4 * FP * FP;
    for (let j = 0; j < sim.count; j++) {
      const d2 = (sim.x[j] - fx) ** 2 + (sim.y[j] - fy) ** 2;
      if (d2 < minD2) {
        minD2 = d2;
        best = j;
      }
    }
    return best;
  }

  // ---- Spell Specific Triggers ----

  triggerMeteor(gx: number, gy: number, radTiles: number): void {
    for (const m of this.meteors) {
      if (!m.active) {
        m.active = true;
        m.targetX = gx;
        m.targetY = gy;
        m.radiusPx = radTiles * TILE;
        m.elapsed = 0;
        m.rockRot = Math.random() * Math.PI * 2;
        break;
      }
    }
  }

  triggerBlizzard(gx: number, gy: number, radTiles: number): void {
    for (const b of this.blizzards) {
      if (!b.active) {
        b.active = true;
        b.x = gx;
        b.y = gy;
        b.radiusPx = radTiles * TILE;
        b.elapsed = 0;
        b.pulsePhase = 0;
        break;
      }
    }
  }

  triggerAcidRain(gx: number, gy: number, radTiles: number): void {
    for (const a of this.acidRains) {
      if (!a.active) {
        a.active = true;
        a.x = gx;
        a.y = gy;
        a.radiusPx = radTiles * TILE;
        a.elapsed = 0;
        a.bubbleTimers.fill(0);
        break;
      }
    }
  }

  triggerThunderstorm(sim: Sim, casterFx: number, casterFy: number): void {
    const k = TILE / FP;
    const cx = casterFx * k;
    const cy = casterFy * k;

    // Screen flash
    this.screenFlash = this.quality === 0 ? 0.18 : 0.38;
    this.screenFlashDecay = 0.0035;

    // Find active thunderstorm slot
    let ts: ThunderstormEffect | null = null;
    for (const t of this.thunderstorms) {
      if (!t.active) {
        ts = t;
        break;
      }
    }
    if (!ts) return;

    ts.active = true;
    ts.elapsed = 0;
    ts.strobeTime = 0;
    ts.branchCount = 0;

    // Collect targets from active projectiles with pS == 28 (sid 27 + 1)
    const targets: [number, number][] = [];
    for (let p = 0; p < sim.cb.pAlive.length; p++) {
      if (sim.cb.pAlive[p] && sim.cb.pS[p] === 28) {
        const tid = sim.cb.pT[p];
        if (tid >= 0 && tid < sim.count) {
          targets.push([sim.x[tid] * k, sim.y[tid] * k - 12]);
        }
      }
    }

    if (targets.length === 0) {
      // Fallback: pick nearest enemy in radius
      let nearestDist = 8 * FP;
      let targetId = -1;
      for (let j = 0; j < sim.count; j++) {
        if (sim.cb.hp[j] <= 0 || sim.team[j] === 0) continue;
        const d = Math.hypot(sim.x[j] - casterFx, sim.y[j] - casterFy);
        if (d < nearestDist) {
          nearestDist = d;
          targetId = j;
        }
      }
      if (targetId >= 0) targets.push([sim.x[targetId] * k, sim.y[targetId] * k - 12]);
    }

    // Build forked lightning path: Caster -> Target 0, and Target 0 -> Target 1..N
    let prevX = cx;
    let prevY = cy - 16;
    for (let t = 0; t < targets.length && ts.branchCount < ts.branches.length; t++) {
      const tx = targets[t][0];
      const ty = targets[t][1];
      this.generateFractalBolt(ts.branches[ts.branchCount], prevX, prevY, tx, ty);
      ts.branchCount++;

      // Spark burst at each target
      for (let s = 0; s < (this.quality === 2 ? 14 : 7); s++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 120;
        this.spawnParticle(TEX_SPARK, tx, ty, Math.cos(ang) * spd, Math.sin(ang) * spd, 0x7dd3fc, 0.8, 0.2, 0.35, 1, 0, 0, 0, 0.92);
      }
      prevX = tx;
      prevY = ty;
    }
  }

  private generateFractalBolt(b: LightningBranch, x0: number, y0: number, x1: number, y1: number): void {
    b.x0 = x0;
    b.y0 = y0;
    b.x1 = x1;
    b.y1 = y1;

    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    // 4 subdivision levels (16 segments)
    const count = 16;
    b.count = count + 1;
    b.ptsX[0] = x0;
    b.ptsY[0] = y0;
    b.ptsX[count] = x1;
    b.ptsY[count] = y1;

    for (let step = 1; step < count; step++) {
      const frac = step / count;
      // Perpendicular jitter with fractal envelope (t * (1-t))
      const env = Math.sin(frac * Math.PI);
      const jitter = (Math.random() - 0.5) * 28 * env;
      b.ptsX[step] = x0 + dx * frac + nx * jitter;
      b.ptsY[step] = y0 + dy * frac + ny * jitter;
    }
  }

  triggerInfernoCast(cx: number, cy: number): void {
    // Flash of flame burst at caster
    for (let i = 0; i < (this.quality === 2 ? 16 : 8); i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 90;
      this.spawnParticle(TEX_GLOW, cx, cy, Math.cos(ang) * spd, Math.sin(ang) * spd, 0xff7020, 1.2, 0.3, 0.45, 0.9, 0, 0, 0, 0.94);
    }
  }

  triggerInfernoImpact(tx: number, ty: number): void {
    for (const r of this.infernoRings) {
      if (!r.active) {
        r.active = true;
        r.x = tx;
        r.y = ty;
        r.elapsed = 0;
        r.radius = 8;
        break;
      }
    }
    // Fiery spray of embers
    for (let i = 0; i < (this.quality === 2 ? 18 : 9); i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 50 + Math.random() * 110;
      this.spawnParticle(TEX_SHARD, tx, ty, Math.cos(ang) * spd, Math.sin(ang) * spd, 0xff9900, 1.0, 0.3, 0.5, 1, 0, ang, (Math.random() - 0.5) * 6, 0.93);
    }
  }

  triggerIronSkin(unitId: number, cx: number, cy: number): void {
    this.ironSkins.set(unitId, { unitId, elapsed: 0 });
    // Metallic impact spark burst
    for (let i = 0; i < (this.quality === 2 ? 20 : 10); i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 130;
      this.spawnParticle(TEX_SPARK, cx, cy - 12, Math.cos(ang) * spd, Math.sin(ang) * spd, 0xd4af37, 1.1, 0.2, 0.4, 1, 0, 0, 0, 0.9);
    }
  }

  triggerManaBurnImplosion(tx: number, ty: number): void {
    for (const mb of this.manaBurns) {
      if (!mb.active) {
        mb.active = true;
        mb.targetX = tx;
        mb.targetY = ty;
        mb.elapsed = 0;
        mb.popped = false;

        // Spawn inward rushing streamers from radius 65
        const count = this.quality === 2 ? 28 : this.quality === 1 ? 16 : 8;
        for (let i = 0; i < count; i++) {
          const ang = (i * Math.PI * 2) / count + (Math.random() - 0.5) * 0.3;
          const r = 55 + Math.random() * 25;
          const sx = tx + Math.cos(ang) * r;
          const sy = ty + Math.sin(ang) * r;
          const spd = r / (mb.suctionTime / 1000); // exactly arrive at suctionTime
          const col = i % 2 === 0 ? 0x2979ff : 0xd500f9;
          this.spawnParticle(TEX_SHARD, sx, sy, -Math.cos(ang) * spd, -Math.sin(ang) * spd, col, 1.2, 0.2, mb.suctionTime / 1000, 0.9, 0, ang, 0, 1.0);
        }
        break;
      }
    }
  }

  triggerTimeWarp(unitId: number, cx: number, cy: number): void {
    this.timeWarpUnits.add(unitId);
    for (const tw of this.timeWarps) {
      if (!tw.active) {
        tw.active = true;
        tw.x = cx;
        tw.y = cy;
        tw.elapsed = 0;
        break;
      }
    }
  }

  // ---- Main Update & Render loop ----

  updateAndDraw(
    sim: Sim,
    now: number,
    dtMs: number,
    zoom: number,
    camX: number,
    camY: number,
    overlayGfx: Graphics,
    viewW: number,
    viewH: number,
  ): void {
    const dt = Math.min(0.1, dtMs / 1000);
    this.lastTime = now;

    // Detect projectile arrival transitions
    this.detectProjectileArrivals(sim);

    // Clear graphics frames
    this.groundGfx.clear();
    this.airGfx.clear();

    // 1. Meteors
    this.updateMeteors(dt);

    // 2. Blizzard
    this.updateBlizzards(dt);

    // 3. Acid Rain
    this.updateAcidRains(dt);

    // 4. Mana Burn Implosions
    this.updateManaBurns(dt);

    // 5. Thunderstorm Bolts
    this.updateThunderstorms(dt);

    // 6. Inferno Rings
    this.updateInfernoRings(sim, dt);

    // 7. Iron Skin Shell Shimmer
    this.updateIronSkins(sim, dt);

    // 8. Time Warp Ripples & Afterimages
    this.updateTimeWarps(sim, dt);

    // 9. Update Active Particles in ParticleContainers
    this.updateParticles(dt);

    // 10. Screen-space Flash on overlay
    this.drawScreenFlash(overlayGfx, viewW, viewH);
  }

  private detectProjectileArrivals(sim: Sim): void {
    const k = TILE / FP;
    const cb = sim.cb;
    for (let p = 0; p < cb.pAlive.length; p++) {
      const alive = cb.pAlive[p];
      const s = cb.pS[p];
      const prevAlive = this.prevProjAlive[p];
      const prevS = this.prevProjS[p];

      // A spell projectile transitioned from alive to dead -> hit!
      if (prevAlive && !alive && prevS > 0) {
        const sid = prevS - 1;
        const tx = this.prevProjX[p] * k;
        const ty = this.prevProjY[p] * k - 12;

        if (sid === 30) {
          // Mana Burn hit
          this.triggerManaBurnImplosion(tx, ty);
        } else if (sid === 25) {
          // Inferno hit
          this.triggerInfernoImpact(tx, ty);
        }
      }

      this.prevProjAlive[p] = alive;
      this.prevProjS[p] = s;
      this.prevProjT[p] = cb.pT[p];
      this.prevProjX[p] = cb.pX[p];
      this.prevProjY[p] = cb.pY[p];
    }
  }

  // --- 1. METEOR ---
  private updateMeteors(dt: number): void {
    const gg = this.groundGfx;
    const ag = this.airGfx;

    for (const m of this.meteors) {
      if (!m.active) continue;
      m.elapsed += dt * 1000;
      const t = m.elapsed / m.impactTime;

      if (t < 1) {
        // Falling phase
        // Ground shadow growing beneath impact site
        const shadowScale = 0.2 + 0.8 * (t * t);
        const shadowAlpha = 0.15 + 0.65 * t;
        const rx = 32 * shadowScale;
        const ry = 16 * shadowScale;
        gg.ellipse(m.targetX, m.targetY + 2, rx, ry).fill({ color: 0x000000, alpha: shadowAlpha });
        // Ground heat glow
        gg.ellipse(m.targetX, m.targetY + 2, rx * 0.75, ry * 0.75).fill({ color: 0xff4400, alpha: shadowAlpha * 0.5 });

        // Falling flaming rock in the sky
        const rockHeight = 240 * (1 - t * t);
        const rockX = m.targetX + 110 * (1 - t);
        const rockY = m.targetY - rockHeight;
        m.rockRot += dt * 10;

        // Rock core & flame envelope
        ag.circle(rockX, rockY, 14).fill({ color: 0xffe060, alpha: 0.95 });
        ag.circle(rockX, rockY, 19).stroke({ color: 0xff5722, width: 3, alpha: 0.85 });
        ag.circle(rockX, rockY, 24).stroke({ color: 0xd50000, width: 2, alpha: 0.5 });

        // Trailing sparks and smoke
        for (let s = 0; s < 3; s++) {
          const vx = (Math.random() - 0.5) * 40 - 50;
          const vy = (Math.random() - 0.5) * 40 - 80;
          this.spawnParticle(TEX_GLOW, rockX, rockY, vx, vy, 0xff7700, 1.0, 0.2, 0.35, 0.9, 0);
        }
      } else {
        // Impact phase
        const impactAge = (m.elapsed - m.impactTime) / (m.totalTime - m.impactTime);
        if (impactAge >= 1) {
          m.active = false;
          continue;
        }

        // Just impacted
        if (m.elapsed - m.impactTime <= dt * 1000 * 1.5) {
          // Camera shake
          this.cameraRumble = 4;
          // Spawn big burst of embers
          const emberCount = this.quality === 2 ? 40 : this.quality === 1 ? 24 : 12;
          for (let e = 0; e < emberCount; e++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 70 + Math.random() * 200;
            const col = e % 3 === 0 ? 0xfff070 : e % 3 === 1 ? 0xff6600 : 0xd50000;
            const p = this.spawnParticle(TEX_SHARD, m.targetX, m.targetY, Math.cos(ang) * spd, Math.sin(ang) * spd - 60, col, 1.2, 0.3, 0.9 + Math.random() * 0.6, 1, 0, ang, (Math.random() - 0.5) * 8, 0.96);
            if (p) p.ay = 220; // gravity
          }
        }

        const fade = 1 - impactAge;

        // Crater flash (first 250ms)
        if (impactAge < 0.2) {
          const flashT = impactAge / 0.2;
          const flashRad = 15 + m.radiusPx * 0.85 * flashT;
          ag.circle(m.targetX, m.targetY, flashRad).fill({ color: 0xffffff, alpha: (1 - flashT) * 0.9 });
          ag.circle(m.targetX, m.targetY, flashRad * 1.15).stroke({ color: 0xff6a00, width: 4, alpha: (1 - flashT) * 0.8 });
        }

        // Crater scorch on ground
        const craterRad = m.radiusPx * 0.65;
        gg.ellipse(m.targetX, m.targetY + 2, craterRad, craterRad * 0.55).fill({ color: 0x1a0800, alpha: fade * 0.75 });
        // Molten cracks
        gg.ellipse(m.targetX, m.targetY + 2, craterRad * 0.65, craterRad * 0.35).stroke({ color: 0xff4400, width: 2, alpha: fade * 0.85 });
      }
    }
  }

  // --- 2. BLIZZARD ---
  private updateBlizzards(dt: number): void {
    const gg = this.groundGfx;

    for (const b of this.blizzards) {
      if (!b.active) continue;
      b.elapsed += dt * 1000;
      if (b.elapsed >= b.totalTime) {
        b.active = false;
        continue;
      }

      const fade = Math.min(1, Math.min(b.elapsed / 400, (b.totalTime - b.elapsed) / 600));
      b.pulsePhase += dt * 2.5;

      // Ground frost decal
      const rx = b.radiusPx;
      const ry = b.radiusPx * 0.55;
      gg.ellipse(b.x, b.y, rx, ry).fill({ color: 0x64b5f6, alpha: fade * 0.18 });
      gg.ellipse(b.x, b.y, rx * 0.8, ry * 0.8).stroke({ color: 0xb3e5fc, width: 2, alpha: fade * 0.5 });
      gg.ellipse(b.x, b.y, rx * 0.45, ry * 0.45).stroke({ color: 0xffffff, width: 1.5, alpha: fade * 0.4 });

      // Spawn swirling snow and ice shards
      const spawnRate = this.quality === 2 ? 4 : this.quality === 1 ? 2 : 1;
      for (let i = 0; i < spawnRate; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 10 + Math.random() * (b.radiusPx - 15);
        const px = b.x + Math.cos(ang) * dist;
        const py = b.y + Math.sin(ang) * dist * 0.55 - 15;
        // Tangential orbital velocity + slight inward suction
        const tangSpeed = 80 + (1 - dist / b.radiusPx) * 120;
        const vx = -Math.sin(ang) * tangSpeed - Math.cos(ang) * 20;
        const vy = Math.cos(ang) * tangSpeed * 0.55 - Math.sin(ang) * 15;
        const isShard = Math.random() > 0.7;
        const tex = isShard ? TEX_SHARD : TEX_GLOW;
        const col = isShard ? 0xe0f7ff : 0x81d4fa;
        this.spawnParticle(tex, px, py, vx, vy, col, isShard ? 0.9 : 0.6, 0.2, 0.65, 0.85, 0, ang, 4);
      }
    }
  }

  // --- 3. ACID RAIN ---
  private updateAcidRains(dt: number): void {
    const gg = this.groundGfx;

    for (const a of this.acidRains) {
      if (!a.active) continue;
      a.elapsed += dt * 1000;
      if (a.elapsed >= a.totalTime) {
        a.active = false;
        continue;
      }

      const fade = Math.min(1, Math.min(a.elapsed / 400, (a.totalTime - a.elapsed) / 600));

      // Draw bubbling caustic puddles
      for (let p = 0; p < 8; p++) {
        const px = a.x + a.puddleSeeds[p * 4 + 0];
        const py = a.y + a.puddleSeeds[p * 4 + 1];
        const prx = a.puddleSeeds[p * 4 + 2];
        const pry = a.puddleSeeds[p * 4 + 3];

        gg.ellipse(px, py, prx, pry).fill({ color: 0x1b5e20, alpha: fade * 0.55 });
        gg.ellipse(px, py, prx * 0.75, pry * 0.75).stroke({ color: 0x76ff03, width: 1.5, alpha: fade * 0.65 });

        // Sizzling bubbles
        a.bubbleTimers[p] += dt * 3.5;
        if (a.bubbleTimers[p] >= 1) {
          a.bubbleTimers[p] = 0;
          const bx = px + (Math.random() - 0.5) * prx * 1.2;
          const by = py + (Math.random() - 0.5) * pry * 1.2;
          this.spawnParticle(TEX_BUBBLE, bx, by, 0, -12, 0xb2ff59, 0.7, 1.2, 0.35, 0.8, 0, 0, 0, 1, false);
        }
      }

      // Falling green droplets
      const dropCount = this.quality === 2 ? 6 : this.quality === 1 ? 3 : 1;
      for (let d = 0; d < dropCount; d++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.random() * a.radiusPx;
        const dropX = a.x + Math.cos(ang) * dist;
        const dropY = a.y + Math.sin(ang) * dist * 0.55;
        // Droplets start in air and fall down at 75-degree angle
        const startX = dropX + 25;
        const startY = dropY - 90;
        this.spawnParticle(TEX_DROPLET, startX, startY, -70, 260, 0x76ff03, 0.85, 0.6, 0.35, 0.9, 0);
      }
    }
  }

  // --- 4. MANA BURN ---
  private updateManaBurns(dt: number): void {
    const ag = this.airGfx;

    for (const mb of this.manaBurns) {
      if (!mb.active) continue;
      mb.elapsed += dt * 1000;

      if (mb.elapsed < mb.suctionTime) {
        // Suction phase: inverted collapsing shockwave
        const t = mb.elapsed / mb.suctionTime;
        const collapseRad = 65 * (1 - t * t);
        ag.circle(mb.targetX, mb.targetY, collapseRad).stroke({ color: 0x7c4dff, width: 2.5, alpha: (1 - t) * 0.85 });
        ag.circle(mb.targetX, mb.targetY, collapseRad * 0.5).stroke({ color: 0x2979ff, width: 2, alpha: (1 - t) });
      } else {
        // Pop phase
        if (!mb.popped) {
          mb.popped = true;
          // Violet pop flash & shattered mana crystal burst
          const shardCount = this.quality === 2 ? 22 : this.quality === 1 ? 14 : 7;
          for (let s = 0; s < shardCount; s++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 60 + Math.random() * 150;
            const col = s % 2 === 0 ? 0xe040fb : 0x7c4dff;
            this.spawnParticle(TEX_SPARK, mb.targetX, mb.targetY, Math.cos(ang) * spd, Math.sin(ang) * spd, col, 1.1, 0.3, 0.45, 1, 0, ang, 4);
          }
        }

        const popAge = (mb.elapsed - mb.suctionTime) / (mb.totalTime - mb.suctionTime);
        if (popAge >= 1) {
          mb.active = false;
          continue;
        }

        const fade = 1 - popAge;
        const burstRad = 10 + 38 * popAge;
        ag.circle(mb.targetX, mb.targetY, burstRad).stroke({ color: 0xd500f9, width: 2, alpha: fade * 0.9 });
        ag.circle(mb.targetX, mb.targetY, burstRad * 0.6).fill({ color: 0xffffff, alpha: fade * 0.6 });
        // Ascending vertical beam of astral energy
        ag.rect(mb.targetX - 3, mb.targetY - 50 * fade, 6, 50 * fade).fill({ color: 0xaa00ff, alpha: fade * 0.4 });
      }
    }
  }

  // --- 5. THUNDERSTORM ---
  private updateThunderstorms(dt: number): void {
    const ag = this.airGfx;

    for (const ts of this.thunderstorms) {
      if (!ts.active) continue;
      ts.elapsed += dt * 1000;
      if (ts.elapsed >= ts.totalTime) {
        ts.active = false;
        continue;
      }

      ts.strobeTime += dt * 1000;
      // Strobe jitter: re-jitter path every 45ms for electric crackle
      if (ts.strobeTime >= 45) {
        ts.strobeTime = 0;
        for (let b = 0; b < ts.branchCount; b++) {
          const br = ts.branches[b];
          this.generateFractalBolt(br, br.x0, br.y0, br.x1, br.y1);
        }
      }

      const fade = 1 - ts.elapsed / ts.totalTime;

      // Draw all active lightning branches
      for (let b = 0; b < ts.branchCount; b++) {
        const br = ts.branches[b];
        if (br.count < 2) continue;

        // Outer electric blue glow pass
        ag.moveTo(br.ptsX[0], br.ptsY[0]);
        for (let p = 1; p < br.count; p++) ag.lineTo(br.ptsX[p], br.ptsY[p]);
        ag.stroke({ color: 0x38bdf8, width: 5.5, alpha: fade * 0.65 });

        // Core blinding white pass
        ag.moveTo(br.ptsX[0], br.ptsY[0]);
        for (let p = 1; p < br.count; p++) ag.lineTo(br.ptsX[p], br.ptsY[p]);
        ag.stroke({ color: 0xffffff, width: 2.2, alpha: fade * 0.95 });

        // Forked sub-branch tendrils
        if (br.count >= 8) {
          const mid = Math.floor(br.count / 2);
          const mx = br.ptsX[mid];
          const my = br.ptsY[mid];
          const forkDx = (Math.random() - 0.5) * 35;
          const forkDy = (Math.random() - 0.5) * 35;
          ag.moveTo(mx, my).lineTo(mx + forkDx, my + forkDy).stroke({ color: 0x7dd3fc, width: 1.5, alpha: fade * 0.7 });
        }
      }
    }
  }

  // --- 6. INFERNO ---
  private updateInfernoRings(sim: Sim, dt: number): void {
    const ag = this.airGfx;
    const k = TILE / FP;

    // Draw active traveling inferno rings on projectiles (pS == 26)
    for (let p = 0; p < sim.cb.pAlive.length; p++) {
      if (!sim.cb.pAlive[p] || sim.cb.pS[p] !== 26) continue;
      const px = sim.cb.pX[p] * k;
      const py = sim.cb.pY[p] * k - 12;

      // Leaping ring of fire
      ag.circle(px, py, 9).stroke({ color: 0xffea00, width: 2 });
      ag.circle(px, py, 14).stroke({ color: 0xff6d00, width: 3, alpha: 0.85 });
      ag.circle(px, py, 18).stroke({ color: 0xd50000, width: 1.5, alpha: 0.5 });

      // Trailing embers
      if (Math.random() > 0.4) {
        this.spawnParticle(TEX_GLOW, px, py, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0xff9100, 0.9, 0.2, 0.25, 0.9, 0);
      }
    }

    // Expanding fiery toruses on struck targets
    for (const r of this.infernoRings) {
      if (!r.active) continue;
      r.elapsed += dt * 1000;
      if (r.elapsed >= r.totalTime) {
        r.active = false;
        continue;
      }

      const t = r.elapsed / r.totalTime;
      const fade = 1 - t;
      const rad = 8 + 26 * t;

      ag.circle(r.x, r.y, rad).stroke({ color: 0xffea00, width: 2.5, alpha: fade });
      ag.circle(r.x, r.y, rad * 1.25).stroke({ color: 0xff3d00, width: 3, alpha: fade * 0.75 });
      ag.circle(r.x, r.y, rad * 0.7).stroke({ color: 0xffffff, width: 1.5, alpha: fade * 0.9 });
    }
  }

  // --- 7. IRON SKIN ---
  private updateIronSkins(sim: Sim, dt: number): void {
    const ag = this.airGfx;
    const gg = this.groundGfx;
    const k = TILE / FP;

    for (const [uid, skin] of this.ironSkins.entries()) {
      if (uid < 0 || uid >= sim.count || sim.cb.hp[uid] <= 0 || !(sim.cb.stMask[uid] & (1 << St.Shield))) {
        this.ironSkins.delete(uid);
        continue;
      }

      skin.elapsed += dt * 1000;
      const ux = sim.x[uid] * k;
      const uy = sim.y[uid] * k - 12;

      // Faceted metallic carapace contour
      const hw = 15;
      const hh = 19;
      // Octagonal armor plate contour
      ag.moveTo(ux - hw + 4, uy - hh)
        .lineTo(ux + hw - 4, uy - hh)
        .lineTo(ux + hw, uy - hh + 6)
        .lineTo(ux + hw, uy + hh - 6)
        .lineTo(ux + hw - 4, uy + hh)
        .lineTo(ux - hw + 4, uy + hh)
        .lineTo(ux - hw, uy + hh - 6)
        .lineTo(ux - hw, uy - hh + 6)
        .closePath()
        .stroke({ color: 0xd4af37, width: 2, alpha: 0.9 })
        .stroke({ color: 0xc0c8d8, width: 1, alpha: 0.7 });

      // Specular glint sweep across shell facets every 1.4s
      const cycle = (skin.elapsed % 1400) / 1400;
      if (cycle < 0.35) {
        const glintT = cycle / 0.35;
        const gx0 = ux - hw + glintT * (hw * 2);
        const gy0 = uy - hh;
        const gx1 = gx0 + 12;
        const gy1 = uy + hh;
        ag.moveTo(gx0, gy0).lineTo(gx1, gy1).stroke({ color: 0xffffff, width: 3, alpha: (1 - glintT) * 0.85 });
      }

      // 3 orbiting metallic runes
      for (let r = 0; r < 3; r++) {
        const ang = (skin.elapsed * 0.002) + (r * Math.PI * 2) / 3;
        const rx = ux + Math.cos(ang) * 19;
        const ry = uy + Math.sin(ang) * 9;
        ag.rect(rx - 2, ry - 2, 4, 4).fill({ color: 0xd4af37, alpha: 0.85 }).stroke({ color: 0xffffff, width: 1 });
      }
    }
  }

  // --- 8. TIME WARP ---
  private updateTimeWarps(sim: Sim, dt: number): void {
    const gg = this.groundGfx;
    const ag = this.airGfx;
    const k = TILE / FP;

    // Expanding ethereal clock dial
    for (const tw of this.timeWarps) {
      if (!tw.active) continue;
      tw.elapsed += dt * 1000;
      if (tw.elapsed >= tw.totalTime) {
        tw.active = false;
        continue;
      }

      const t = tw.elapsed / tw.totalTime;
      const fade = 1 - t;
      const dialR = 14 + 40 * Math.sin(t * (Math.PI / 2));

      // Circular ripple waves
      gg.ellipse(tw.x, tw.y + 2, dialR, dialR * 0.55).stroke({ color: 0x00e5ff, width: 2, alpha: fade * 0.8 });
      gg.ellipse(tw.x, tw.y + 2, dialR * 0.65, dialR * 0.35).stroke({ color: 0xffd700, width: 1.5, alpha: fade * 0.6 });

      // Clock hour pips (12 marks around circumference)
      for (let h = 0; h < 12; h++) {
        const ang = (h * Math.PI) / 6;
        const px = tw.x + Math.cos(ang) * dialR;
        const py = tw.y + 2 + Math.sin(ang) * dialR * 0.55;
        gg.circle(px, py, 1.8).fill({ color: h % 3 === 0 ? 0xffd700 : 0x00e5ff, alpha: fade });
      }

      // Fast spinning clock hands
      const handAngle = tw.elapsed * 0.015;
      const handLen = dialR * 0.75;
      gg.moveTo(tw.x, tw.y + 2)
        .lineTo(tw.x + Math.cos(handAngle) * handLen, tw.y + 2 + Math.sin(handAngle) * handLen * 0.55)
        .stroke({ color: 0xffffff, width: 2, alpha: fade * 0.9 });
      gg.moveTo(tw.x, tw.y + 2)
        .lineTo(tw.x + Math.cos(handAngle * 0.1) * (handLen * 0.5), tw.y + 2 + Math.sin(handAngle * 0.1) * (handLen * 0.28))
        .stroke({ color: 0x00e5ff, width: 2.5, alpha: fade });
    }

    // Afterimages for units under Time Warp
    for (const uid of this.timeWarpUnits) {
      if (uid < 0 || uid >= sim.count || sim.cb.hp[uid] <= 0 || !(sim.cb.stMask[uid] & (1 << St.Haste))) {
        this.timeWarpUnits.delete(uid);
        continue;
      }

      const ux = sim.x[uid] * k;
      const uy = sim.y[uid] * k;

      // Spawn an afterimage if moving or every few frames
      if (sim.moving[uid] && Math.random() > 0.5) {
        for (const ai of this.afterimages) {
          if (!ai.active) {
            ai.active = true;
            ai.x = ux;
            ai.y = uy;
            ai.unitId = uid;
            ai.elapsed = 0;
            ai.tint = Math.random() > 0.5 ? 0x00e5ff : 0xe040fb;
            break;
          }
        }
      }
    }

    // Render active afterimages
    for (const ai of this.afterimages) {
      if (!ai.active) continue;
      ai.elapsed += dt * 1000;
      if (ai.elapsed >= ai.maxTime) {
        ai.active = false;
        continue;
      }

      const fade = 1 - ai.elapsed / ai.maxTime;
      // Stylized silhouette ghost
      ag.ellipse(ai.x, ai.y - 14, 9, 14).fill({ color: ai.tint, alpha: fade * 0.35 });
      ag.ellipse(ai.x, ai.y - 28, 5, 5).fill({ color: 0xffffff, alpha: fade * 0.45 });
    }
  }

  // --- 9. PARTICLES UPDATE ---
  private updateParticles(dt: number): void {
    for (let i = 0; i < this.particlePool.length; i++) {
      const p = this.particlePool[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        if (p.pixiParticle && p.container) {
          p.container.removeParticle(p.pixiParticle);
        }
        continue;
      }

      const t = p.life / p.maxLife;

      // Physics
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;

      const currentScale = p.scale + (p.scaleEnd - p.scale) * t;
      const currentAlpha = p.alpha + (p.alphaEnd - p.alpha) * t;

      if (p.pixiParticle) {
        p.pixiParticle.x = p.x;
        p.pixiParticle.y = p.y;
        p.pixiParticle.scaleX = currentScale;
        p.pixiParticle.scaleY = currentScale;
        p.pixiParticle.rotation = p.rot;
        p.pixiParticle.alpha = currentAlpha;
      }
    }
  }

  // --- 10. SCREEN FLASH ---
  drawScreenOverlay(overlayGfx: Graphics, viewW: number, viewH: number): void {
    if (this.screenFlash <= 0) return;
    overlayGfx.rect(0, 0, viewW, viewH).fill({ color: 0xe0f2fe, alpha: this.screenFlash });
    this.screenFlash = Math.max(0, this.screenFlash - this.screenFlashDecay * 60);
  }

  private drawScreenFlash(overlayGfx: Graphics, viewW: number, viewH: number): void {
    this.drawScreenOverlay(overlayGfx, viewW, viewH);
  }

  /** Query active camera rumble jitter (in world pixels) */
  rumbleOffset(): [number, number] {
    if (this.cameraRumble <= 0) return [0, 0];
    const rx = (Math.random() - 0.5) * this.cameraRumble * 2;
    const ry = (Math.random() - 0.5) * this.cameraRumble * 2;
    this.cameraRumble = Math.max(0, this.cameraRumble - 0.4);
    return [rx, ry];
  }

  /** True if unit has active Iron Skin */
  hasIronSkin(unitId: number): boolean {
    return this.ironSkins.has(unitId);
  }

  isApexCast(sid: number): boolean {
    return sid >= 24 && sid <= 31;
  }
}
