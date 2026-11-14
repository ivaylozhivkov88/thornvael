import { BitmapText, Container, Graphics, Sprite, Texture, TextStyle } from 'pixi.js';
import type { Sim } from './sim/sim';
import { TILE } from './map';
import { FP } from './sim/sim';
import { St } from './sim/spelldata';

/**
 * AAA Combat Feel & Dynamic Torch Lighting Engine:
 * - Screen Shake with trauma decay (frequency, pitch, yaw)
 * - Hit-Stop micro-freeze on heavy impacts and crits (30-60ms)
 * - Directional blood splatters & elemental spark bursts
 * - Melee weapon slash sweep arcs & golden cross-slashes (X) on crits
 * - GPU Decal Auras under units with blendMode = 'add' (Fire, Cold, Lightning, Blessed)
 * - Styled Floating Combat Numbers (Crits with pop, Hero damage with red urgency)
 * - Dynamic Torch Light Radius around hero with organic flame flicker
 * - Status effect particles (Poison rising bubbles, Burn embers)
 */

export interface DamageFloater {
  text: string;
  color: number;
  fontSize: number;
  isCrit: boolean;
  isHero: boolean;
  x: number;
  y: number;
  vy: number;
  scale: number;
  alpha: number;
  born: number;
  lifeMs: number;
  sprite: BitmapText;
  kind: FloaterKind;
}

type FloaterKind = 0 | 1 | 2; // normal, hero, crit

/** One white bitmap font per kind; colour comes from tint, so no re-rasterising per hit. */
const FLOATER_STYLES: TextStyle[] = [
  new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x000000, width: 3 } }),
  new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x200000, width: 3 } }),
  new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } }),
];

export interface GroundSplatter {
  x: number;
  y: number;
  r: number;
  color: number;
  alpha: number;
  decayRate: number;
}

export interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  alpha: number;
  size: number;
  born: number;
  lifeMs: number;
}

export interface SlashArc {
  x: number;
  y: number;
  angle: number;
  radius: number;
  color: number;
  isCrit: boolean;
  born: number;
  lifeMs: number;
}

export interface StatusBubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  alpha: number;
  born: number;
  lifeMs: number;
  isFire?: boolean;
}

export class CombatFeelSystem {
  // Screen Shake
  private trauma = 0;
  private shakeTime = 0;
  shakeX = 0;
  shakeY = 0;

  // Hit-Stop Freeze
  private freezeUntil = 0;

  // Particle and effect layers
  readonly bloodGraphics = new Graphics();
  readonly sparkGraphics = new Graphics();
  readonly slashGraphics = new Graphics();
  readonly auraGraphics = new Graphics();
  readonly bubbleGraphics = new Graphics();
  readonly floaterContainer = new Container();

  // Active pools
  private splatters: GroundSplatter[] = [];
  private sparks: SparkParticle[] = [];
  private slashes: SlashArc[] = [];
  private bubbles: StatusBubble[] = [];
  private floaters: DamageFloater[] = [];
  private textPool: BitmapText[][] = [[], [], []];

  // Lighting
  private lightCv!: HTMLCanvasElement;
  private lightCtx!: CanvasRenderingContext2D;
  private lightTex!: Texture;
  readonly lightSprite!: Sprite;
  private flickerPhase = 0;

  constructor(private readonly mapW: number, private readonly mapH: number) {
    this.auraGraphics.blendMode = 'add';
    this.slashGraphics.blendMode = 'add';

    // Dynamic Lighting Canvas (quarter-resolution for smooth blur and high perf)
    if (typeof document !== 'undefined') {
      this.lightCv = document.createElement('canvas');
      this.lightCv.width = 384;
      this.lightCv.height = 240;
      this.lightCtx = this.lightCv.getContext('2d')!;
      this.lightTex = Texture.from(this.lightCv);
      this.lightSprite = new Sprite(this.lightTex);
      this.lightSprite.blendMode = 'multiply';
    }
  }

  /** Trigger screen shake. Trauma 0.0 to 1.0 (clamped). */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  /** Trigger hit-stop visual freeze for duration ms. */
  triggerHitStop(ms: number, now: number): void {
    this.freezeUntil = Math.max(this.freezeUntil, now + ms);
  }

  isFrozen(now: number): boolean {
    return now < this.freezeUntil;
  }

  /** Spawn directional blood splatters on physical hit. */
  spawnBlood(x: number, y: number, dirX = 0, dirY = 0, count = 5): void {
    if (this.splatters.length > 120) {
      this.splatters.splice(0, count);
    }
    const bloodColors = [0x700a0a, 0x8a1010, 0x540606, 0x9b1616];
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 1.4;
      const dist = 6 + Math.random() * 24;
      const angle = Math.atan2(dirY, dirX) + spread;
      const sx = x + Math.cos(angle) * dist + (Math.random() - 0.5) * 8;
      const sy = y + Math.sin(angle) * dist + (Math.random() - 0.5) * 8;
      const color = bloodColors[Math.floor(Math.random() * bloodColors.length)];
      this.splatters.push({
        x: sx,
        y: sy,
        r: 2 + Math.random() * 3.5,
        color,
        alpha: 0.85,
        decayRate: 0.00015 + Math.random() * 0.0001, // persists for ~10 seconds
      });
    }
  }

  /** Spawn elemental or weapon sparks. */
  spawnSparks(x: number, y: number, color: number, count = 8, speed = 80): void {
    if (this.sparks.length > 150) {
      this.sparks.splice(0, count);
    }
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = speed * 0.4 + Math.random() * speed * 0.8;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 20, // slight upward pop
        color,
        alpha: 1.0,
        size: 1.5 + Math.random() * 2.5,
        born: performance.now(),
        lifeMs: 250 + Math.random() * 250,
      });
    }
  }

  /** Spawn melee slash sweep arc or golden cross-slash on crit. */
  spawnSlash(x: number, y: number, angle: number, isCrit = false, color = 0xffffff, radius = 24): void {
    if (this.slashes.length > 30) {
      this.slashes.shift();
    }
    this.slashes.push({
      x,
      y,
      angle,
      radius: isCrit ? 32 : radius,
      color: isCrit ? 0xffd700 : color,
      isCrit,
      born: performance.now(),
      lifeMs: isCrit ? 220 : 160,
    });
  }

  /** Spawn rising poison bubbles for poisoned units. */
  spawnPoisonBubbles(x: number, y: number, count = 2): void {
    if (this.bubbles.length > 60) this.bubbles.splice(0, count);
    for (let i = 0; i < count; i++) {
      this.bubbles.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 8,
        vy: -20 - Math.random() * 16,
        size: 2 + Math.random() * 2.5,
        color: 0x2ecc71,
        alpha: 0.8,
        born: performance.now(),
        lifeMs: 500 + Math.random() * 300,
        isFire: false,
      });
    }
  }

  /** Spawn rising burning embers for burning units. */
  spawnBurnEmbers(x: number, y: number, count = 2): void {
    if (this.bubbles.length > 60) this.bubbles.splice(0, count);
    for (let i = 0; i < count; i++) {
      this.bubbles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 12,
        vy: -28 - Math.random() * 20,
        size: 1.5 + Math.random() * 2,
        color: Math.random() > 0.4 ? 0xff5500 : 0xffaa00,
        alpha: 0.9,
        born: performance.now(),
        lifeMs: 400 + Math.random() * 250,
        isFire: true,
      });
    }
  }

  /** Add styled floating damage text */
  addDamageFloater(
    text: string,
    x: number,
    y: number,
    color: number,
    isCrit: boolean,
    isHero: boolean,
    now: number
  ): void {
    if (this.floaters.length > 50) return;

    const kind: FloaterKind = isCrit ? 2 : isHero ? 1 : 0;
    let t = this.textPool[kind].pop();
    if (!t) {
      t = new BitmapText({ text, style: FLOATER_STYLES[kind] });
      t.anchor.set(0.5, 1);
    } else {
      t.text = text;
    }
    t.tint = color;

    t.visible = true;
    t.alpha = 1.0;
    t.scale.set(isCrit ? 1.4 : 1.0);
    this.floaterContainer.addChild(t);

    this.floaters.push({
      text,
      color,
      fontSize: isCrit ? 18 : isHero ? 15 : 13,
      isCrit,
      isHero,
      x,
      y,
      vy: isCrit ? -45 : -30,
      scale: isCrit ? 1.4 : 1.0,
      alpha: 1.0,
      born: now,
      lifeMs: isCrit ? 1100 : 800,
      sprite: t,
      kind,
    });

    if (isCrit) {
      this.addTrauma(0.35);
      this.triggerHitStop(45, now);
    } else if (isHero) {
      this.addTrauma(0.2);
    }
  }

  /** Render GPU Decal Auras under units with blendMode = 'add' */
  renderAuras(sim: Sim, now: number, k: number): void {
    this.auraGraphics.clear();
    const g = this.auraGraphics;
    const count = sim.count;
    const mw = this.mapW;

    for (let i = 0; i < count; i++) {
      if (sim.cb.hp[i] <= 0 || sim.hidden[i]) continue;
      const tile = Math.floor(sim.y[i] / FP) * mw + Math.floor(sim.x[i] / FP);
      if (!sim.visible[tile]) continue;

      const ux = sim.x[i] * k;
      const uy = sim.y[i] * k;
      const mods = sim.cb.bossMods[i] || [];
      const isHero = sim.hero?.id === i;
      const hasBless = isHero && !!(sim.cb.stMask[i] & (1 << St.Bless));

      // 1. Fire Enchanted: Magma Flame Ring
      if (mods.includes('fire_enchanted')) {
        const pulse = 1 + 0.08 * Math.sin(now * 0.006 + i);
        const rx = 18 * pulse;
        const ry = 9 * pulse;
        // Outer magma ring
        g.ellipse(ux, uy + 2, rx, ry).stroke({ color: 0xff3a00, width: 2.2, alpha: 0.85 });
        // Inner molten core
        g.ellipse(ux, uy + 2, rx * 0.7, ry * 0.7).stroke({ color: 0xff8c00, width: 1.5, alpha: 0.7 });
        // 6 rotating fiery magma tongues
        for (let a = 0; a < 6; a++) {
          const ang = a * (Math.PI / 3) + now * 0.003;
          const dist = 1 + 0.18 * Math.sin(now * 0.01 + a * 2);
          const px = ux + Math.cos(ang) * rx * dist;
          const py = (uy + 2) + Math.sin(ang) * ry * dist;
          g.circle(px, py, 2.5).fill({ color: 0xffdd33, alpha: 0.9 });
        }
      }

      // 2. Cold Touch: Frost Snowflake Runes
      if (mods.includes('cold_enchanted') || mods.includes('cold_touch')) {
        const pulse = 1 + 0.05 * Math.sin(now * 0.004 + i);
        const rx = 17 * pulse;
        const ry = 8.5 * pulse;
        g.ellipse(ux, uy + 2, rx, ry).stroke({ color: 0x40a8ff, width: 1.5, alpha: 0.65 });
        const rot = now * 0.0008;
        // 6 radial snowflake arms
        for (let a = 0; a < 6; a++) {
          const ang = rot + a * (Math.PI / 3);
          const tipX = ux + Math.cos(ang) * rx;
          const tipY = (uy + 2) + Math.sin(ang) * ry;
          const midX = ux + Math.cos(ang) * (rx * 0.6);
          const midY = (uy + 2) + Math.sin(ang) * (ry * 0.6);
          g.moveTo(ux, uy + 2).lineTo(tipX, tipY).stroke({ color: 0x8ce0ff, width: 1.5, alpha: 0.85 });
          // Snowflake notch barb
          const barbAng = ang + 0.6;
          g.moveTo(midX, midY)
            .lineTo(midX + Math.cos(barbAng) * 4, midY + Math.sin(barbAng) * 2.5)
            .stroke({ color: 0xd8f4ff, width: 1, alpha: 0.8 });
          g.circle(tipX, tipY, 1.5).fill({ color: 0xffffff, alpha: 0.9 });
        }
      }

      // 3. Lightning: Crackling Electric Arcs
      if (mods.includes('lightning') || mods.includes('lightning_enchanted') || mods.includes('spectral_hit')) {
        const rx = 18;
        const ry = 9;
        const pts = 5;
        // Jittering electric arcs between nodes
        for (let p = 0; p < pts; p++) {
          const a1 = (p / pts) * Math.PI * 2 + Math.sin(now * 0.008 + p) * 0.1;
          const a2 = ((p + 1) / pts) * Math.PI * 2 + Math.sin(now * 0.008 + p + 1) * 0.1;
          const x1 = ux + Math.cos(a1) * rx;
          const y1 = (uy + 2) + Math.sin(a1) * ry;
          const x2 = ux + Math.cos(a2) * rx;
          const y2 = (uy + 2) + Math.sin(a2) * ry;
          // Midpoint with jitter
          const midJitter = Math.sin(now * 0.035 + p * 5.7) > 0.15 ? 4 : -4;
          const mx = (x1 + x2) * 0.5 + Math.cos(a1 + 1.57) * midJitter;
          const my = (y1 + y2) * 0.5 + Math.sin(a1 + 1.57) * (midJitter * 0.5);
          g.moveTo(x1, y1).lineTo(mx, my).lineTo(x2, y2).stroke({ color: 0x60a8ff, width: 2, alpha: 0.85 });
          g.moveTo(x1, y1).lineTo(mx, my).lineTo(x2, y2).stroke({ color: 0xffffff, width: 1, alpha: 0.95 });
        }
      }

      // 4. Blessed: Golden Rotating Celtic Compass
      if (mods.includes('blessed_aura') || mods.includes('blessed') || hasBless) {
        const rx = 19;
        const ry = 9.5;
        const rot = now * 0.0012;
        // Outer and inner concentric rings
        g.ellipse(ux, uy + 2, rx, ry).stroke({ color: 0xffd700, width: 1.8, alpha: 0.8 });
        g.ellipse(ux, uy + 2, rx * 0.55, ry * 0.55).stroke({ color: 0xffea70, width: 1.2, alpha: 0.65 });
        // 8-point rotating Celtic compass star
        for (let p = 0; p < 8; p++) {
          const ang = rot + p * (Math.PI / 4);
          const isCardinal = p % 2 === 0;
          const rLen = isCardinal ? 1.25 : 0.85;
          const px = ux + Math.cos(ang) * (rx * rLen);
          const py = (uy + 2) + Math.sin(ang) * (ry * rLen);
          g.moveTo(ux, uy + 2).lineTo(px, py).stroke({
            color: isCardinal ? 0xffea60 : 0xd4a020,
            width: isCardinal ? 1.8 : 1.2,
            alpha: 0.9,
          });
          if (isCardinal) {
            g.circle(px, py, 1.8).fill({ color: 0xffffff, alpha: 0.95 });
          }
        }
      }
    }
  }

  /** Update particles, screen shake, slashes, bubbles, and damage numbers */
  update(dt: number, now: number, camX: number, camY: number, zoom: number): void {
    // Screen shake decay (trauma squared gives natural feel)
    if (this.trauma > 0.001) {
      this.shakeTime += dt * 35;
      const intensity = this.trauma * this.trauma;
      const maxOffset = 14 * intensity;
      this.shakeX = Math.sin(this.shakeTime * 1.3) * maxOffset;
      this.shakeY = Math.cos(this.shakeTime * 1.7) * maxOffset;
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.trauma = 0;
    }

    // Update Ground Blood Splatters
    this.bloodGraphics.clear();
    for (let i = this.splatters.length - 1; i >= 0; i--) {
      const s = this.splatters[i];
      s.alpha -= s.decayRate * (dt * 1000);
      if (s.alpha <= 0) {
        this.splatters.splice(i, 1);
        continue;
      }
      this.bloodGraphics.circle(s.x, s.y, s.r).fill({ color: s.color, alpha: s.alpha });
    }

    // Update Sparks
    this.sparkGraphics.clear();
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      const age = (now - p.born) / p.lifeMs;
      if (age >= 1) {
        this.sparks.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt; // gravity
      const fade = 1 - age;
      this.sparkGraphics.circle(p.x, p.y, p.size * fade).fill({ color: p.color, alpha: fade });
    }

    // Update Melee Weapon Slashes (sweep arcs and crits)
    this.slashGraphics.clear();
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      const age = (now - s.born) / s.lifeMs;
      if (age >= 1) {
        this.slashes.splice(i, 1);
        continue;
      }
      const fade = 1 - age;
      const curR = s.radius * (0.8 + 0.4 * age);
      if (s.isCrit) {
        // Golden cross-slash X
        const a1 = s.angle - Math.PI / 4;
        const a2 = s.angle + Math.PI / 4;
        const dx1 = Math.cos(a1) * curR;
        const dy1 = Math.sin(a1) * (curR * 0.7);
        const dx2 = Math.cos(a2) * curR;
        const dy2 = Math.sin(a2) * (curR * 0.7);

        // Blade 1
        this.slashGraphics
          .moveTo(s.x - dx1, s.y - dy1)
          .lineTo(s.x + dx1, s.y + dy1)
          .stroke({ color: 0xff8800, width: 6 * fade, alpha: 0.7 * fade });
        this.slashGraphics
          .moveTo(s.x - dx1, s.y - dy1)
          .lineTo(s.x + dx1, s.y + dy1)
          .stroke({ color: 0xffea40, width: 3 * fade, alpha: 0.9 * fade });
        this.slashGraphics
          .moveTo(s.x - dx1, s.y - dy1)
          .lineTo(s.x + dx1, s.y + dy1)
          .stroke({ color: 0xffffff, width: 1.5 * fade, alpha: fade });

        // Blade 2
        this.slashGraphics
          .moveTo(s.x - dx2, s.y - dy2)
          .lineTo(s.x + dx2, s.y + dy2)
          .stroke({ color: 0xff8800, width: 6 * fade, alpha: 0.7 * fade });
        this.slashGraphics
          .moveTo(s.x - dx2, s.y - dy2)
          .lineTo(s.x + dx2, s.y + dy2)
          .stroke({ color: 0xffea40, width: 3 * fade, alpha: 0.9 * fade });
        this.slashGraphics
          .moveTo(s.x - dx2, s.y - dy2)
          .lineTo(s.x + dx2, s.y + dy2)
          .stroke({ color: 0xffffff, width: 1.5 * fade, alpha: fade });

        // Center flash
        this.slashGraphics.circle(s.x, s.y, 7 * fade).fill({ color: 0xfff0a0, alpha: 0.9 * fade });
      } else {
        // Sweeping melee slash arc
        const startAng = s.angle - 0.9;
        const endAng = s.angle + 0.9;
        this.slashGraphics
          .arc(s.x, s.y, curR, startAng, endAng)
          .stroke({ color: s.color, width: 4 * fade, alpha: 0.75 * fade });
        this.slashGraphics
          .arc(s.x, s.y, curR * 0.96, startAng + 0.1, endAng - 0.1)
          .stroke({ color: 0xffffff, width: 1.8 * fade, alpha: fade });
      }
    }

    // Update Status Bubbles and Embers
    this.bubbleGraphics.clear();
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      const age = (now - b.born) / b.lifeMs;
      if (age >= 1) {
        this.bubbles.splice(i, 1);
        continue;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const fade = 1 - age;
      if (b.isFire) {
        this.bubbleGraphics.circle(b.x, b.y, b.size * fade).fill({ color: b.color, alpha: fade });
      } else {
        // Translucent bubble with shiny rim
        this.bubbleGraphics
          .circle(b.x, b.y, b.size)
          .fill({ color: b.color, alpha: 0.35 * fade })
          .stroke({ color: 0x98ff98, width: 1, alpha: 0.7 * fade });
      }
    }

    // Update Floaters
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      const age = (now - f.born) / f.lifeMs;
      if (age >= 1) {
        this.floaterContainer.removeChild(f.sprite);
        f.sprite.visible = false;
        this.textPool[f.kind].push(f.sprite);
        this.floaters.splice(i, 1);
        continue;
      }

      // Pop down scale from initial crit burst
      if (f.isCrit && f.scale > 1.0) {
        f.scale = Math.max(1.0, f.scale - dt * 2.5);
        f.sprite.scale.set(f.scale);
      }

      f.y += f.vy * dt;
      f.alpha = age > 0.6 ? 1 - (age - 0.6) / 0.4 : 1.0;
      f.sprite.alpha = f.alpha;

      const sx = f.x * zoom - camX;
      const sy = f.y * zoom - camY;
      f.sprite.position.set(Math.round(sx), Math.round(sy));
    }
  }

  /**
   * Render dynamic torch lighting:
   * Ambient darkness + warm radial torch circle around hero with organic flicker.
   */
  renderLighting(
    viewW: number,
    viewH: number,
    heroWorldX: number,
    heroWorldY: number,
    camX: number,
    camY: number,
    zoom: number,
    daylight: number,
    now: number,
    extraLights: Array<{ x: number; y: number; r: number; color?: string }> = []
  ): void {
    if (!this.lightCtx) return;

    const ctx = this.lightCtx;
    const w = this.lightCv.width;
    const h = this.lightCv.height;
    ctx.clearRect(0, 0, w, h);

    // Compute ambient darkness level from day/night cycle
    // daylight: 0 (midnight) to 255 (noon). In dark fantasy, even daytime has gothic atmosphere.
    const dayFactor = Math.max(0, Math.min(1, daylight / 255));
    const ambientR = Math.round(18 + 60 * dayFactor);
    const ambientG = Math.round(20 + 62 * dayFactor);
    const ambientB = Math.round(30 + 65 * dayFactor);

    // Fill with ambient darkness
    ctx.fillStyle = `rgb(${ambientR},${ambientG},${ambientB})`;
    ctx.fillRect(0, 0, w, h);

    // Scale factors from viewport to low-res light canvas
    const scaleX = w / viewW;
    const scaleY = h / viewH;

    // Organic flame flicker calculation (subtle 3-frequency sine wave)
    this.flickerPhase += 0.05;
    const flicker = 1.0 + 0.04 * Math.sin(this.flickerPhase * 3.7) + 0.02 * Math.sin(this.flickerPhase * 8.1);

    // Hero screen position mapped to light canvas
    const heroScreenX = (heroWorldX * zoom - camX) * scaleX;
    const heroScreenY = (heroWorldY * zoom - camY) * scaleY;
    const baseTorchRadius = 180 * zoom * scaleX * flicker;

    // Cut out torchlight with 'destination-out' / gradient blending
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';

    // Primary hero torchlight aura
    const grad = ctx.createRadialGradient(
      heroScreenX,
      heroScreenY,
      8,
      heroScreenX,
      heroScreenY,
      baseTorchRadius
    );
    // Center is fully carved out (reveals 100% terrain brightness)
    grad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
    grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.95)');
    grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.55)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(heroScreenX, heroScreenY, baseTorchRadius, 0, Math.PI * 2);
    ctx.fill();

    // Extra lights (e.g. shrines, campfires, meteor spells)
    for (const l of extraLights) {
      const lx = (l.x * zoom - camX) * scaleX;
      const ly = (l.y * zoom - camY) * scaleY;
      const lr = l.r * scaleX;
      if (lx + lr < 0 || ly + lr < 0 || lx - lr > w || ly - lr > h) continue;

      const g = ctx.createRadialGradient(lx, ly, 4, lx, ly, lr);
      g.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
      g.addColorStop(0.5, 'rgba(0, 0, 0, 0.7)');
      g.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Second pass: Add warm golden rim to the torchlight edge
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const warmGrad = ctx.createRadialGradient(
      heroScreenX,
      heroScreenY,
      baseTorchRadius * 0.2,
      heroScreenX,
      heroScreenY,
      baseTorchRadius * 1.05
    );
    warmGrad.addColorStop(0, 'rgba(255, 210, 120, 0.14)');
    warmGrad.addColorStop(0.6, 'rgba(210, 140, 40, 0.08)');
    warmGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = warmGrad;
    ctx.beginPath();
    ctx.arc(heroScreenX, heroScreenY, baseTorchRadius * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Update Pixi texture
    this.lightTex.source.update();
    this.lightSprite.width = viewW;
    this.lightSprite.height = viewH;
  }
}
