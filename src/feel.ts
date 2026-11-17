import { BitmapText, Container, Graphics, Sprite, Texture, TextStyle } from 'pixi.js';
import type { Sim } from './sim/sim';
import { TILE } from './map';
import { FP } from './sim/sim';
import { St } from './sim/spelldata';
import { getSuperUniqueForUnit } from './sim/super-uniques';

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

export interface BoneDebris {
  x: number;
  y: number;
  rot: number;
  length: number;
  width: number;
  type: 0 | 1 | 2; // 0: shard, 1: curved rib, 2: joint bone
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
  private boneFragments: BoneDebris[] = [];
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

  /** Spawn persistent death gore: dark pooled blood splatters and fractured bone fragments on terrain */
  spawnDeathGore(x: number, y: number, isElite = false, isUndead = false): void {
    const bloodCount = isElite ? 8 : 5;
    const colors = [0x500000, 0x6e0000, 0x880808, 0x3d0000];

    // 1. Concentric and radial pooled blood splatters
    for (let b = 0; b < bloodCount; b++) {
      const dist = b === 0 ? 0 : Math.random() * (isElite ? 22 : 15);
      const ang = Math.random() * Math.PI * 2;
      const bx = x + Math.cos(ang) * dist;
      const by = y + Math.sin(ang) * (dist * 0.55);
      const rad = b === 0 ? (isElite ? 14 : 9) : Math.random() * (isElite ? 8 : 5) + 3;
      const col = colors[Math.floor(Math.random() * colors.length)];
      this.splatters.push({
        x: bx,
        y: by,
        r: rad,
        color: col,
        alpha: 0.85,
        decayRate: 0.00002, // persists ~45 seconds
      });
    }

    // 2. Fractured bone debris and shards
    const boneCount = isElite ? 8 : isUndead ? 7 : 4;
    for (let k = 0; k < boneCount; k++) {
      const bDist = Math.random() * (isElite ? 26 : 18) + 4;
      const bAng = Math.random() * Math.PI * 2;
      const fx = x + Math.cos(bAng) * bDist;
      const fy = y + Math.sin(bAng) * (bDist * 0.55);
      const type = (k % 3) as 0 | 1 | 2;
      this.boneFragments.push({
        x: fx,
        y: fy,
        rot: Math.random() * Math.PI * 2,
        length: type === 1 ? 9 + Math.random() * 5 : 5 + Math.random() * 4,
        width: type === 2 ? 3 : 1.8,
        type,
        alpha: 0.95,
        decayRate: 0.00002, // persists ~45 seconds
      });
    }

    if (this.splatters.length > 250) this.splatters.splice(0, this.splatters.length - 250);
    if (this.boneFragments.length > 200) this.boneFragments.splice(0, this.boneFragments.length - 200);
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
      const isLeader = isHero || mods.length > 0;
      const stMask = sim.cb.stMask[i];
      const hasBless = isHero && !!(stMask & (1 << St.Bless));
      const hasHaste = isHero && !!(stMask & (1 << St.Haste));
      const hasShield = isHero && !!(stMask & (1 << St.Shield));

      // 1. Fire Aura / Fanaticism: Ethereal subterranean crimson flame sigil under fire-enchanted bosses
      if (mods.includes('fire_enchanted')) {
        const pulse = 1 + 0.04 * Math.sin(now * 0.0025 + i);
        const rx = 18 * pulse;
        const ry = 8.5 * pulse;
        const rot = now * 0.0007;

        // Soft ethereal ground glow rings (additive blending)
        g.ellipse(ux, uy + 2, rx * 1.15, ry * 1.15).stroke({ color: 0x991b1b, width: 2.0, alpha: 0.14 });
        g.ellipse(ux, uy + 2, rx, ry).stroke({ color: 0xc2410c, width: 1.2, alpha: 0.25 });
        g.ellipse(ux, uy + 2, rx * 0.65, ry * 0.65).stroke({ color: 0xd97706, width: 0.8, alpha: 0.18 });

        // 6 delicate ancient runic ticks slowly drifting along perimeter
        for (let a = 0; a < 6; a++) {
          const ang = rot + a * (Math.PI / 3);
          const px = ux + Math.cos(ang) * rx;
          const py = (uy + 2) + Math.sin(ang) * ry;
          const tang = ang + Math.PI / 2;
          const rdx = Math.cos(tang) * 2.2;
          const rdy = Math.sin(tang) * 1.1;
          g.moveTo(px - rdx, py - rdy).lineTo(px + rdx, py + rdy).stroke({
            color: 0xf97316,
            width: 0.9,
            alpha: 0.35,
          });
        }

        // Delicate rising ground embers fading upward
        for (let m = 0; m < 3; m++) {
          const phase = ((now * 0.0008 + m * 0.33 + i * 0.2) % 1);
          const mAng = m * 2.09 + now * 0.0005;
          const mrx = rx * (0.4 + phase * 0.55);
          const mry = ry * (0.4 + phase * 0.55);
          const mx = ux + Math.cos(mAng) * mrx;
          const my = uy + 2 + Math.sin(mAng) * mry - phase * 5;
          g.circle(mx, my, 0.75).fill({ color: 0xfde047, alpha: (1 - phase) * 0.35 });
        }
      }

      // 2. Frost Aura / Holy Freeze: Ethereal glacial rune ring with freezing blue pulse
      if (mods.includes('cold_enchanted') || mods.includes('cold_touch') || (isHero && hasShield)) {
        const pulse = 1 + 0.04 * Math.sin(now * 0.0022 + i * 2);
        const rx = 18 * pulse;
        const ry = 8.5 * pulse;
        const rotCW = -now * 0.0006;

        // Soft glacial glow rings
        g.ellipse(ux, uy + 2, rx * 1.15, ry * 1.15).stroke({ color: 0x0369a1, width: 2.0, alpha: 0.14 });
        g.ellipse(ux, uy + 2, rx, ry).stroke({ color: 0x0284c7, width: 1.2, alpha: 0.25 });
        g.ellipse(ux, uy + 2, rx * 0.65, ry * 0.65).stroke({ color: 0x38bdf8, width: 0.8, alpha: 0.16 });

        // Expanding soft glacial mist pulse
        const wave = (now * 0.0006 + i * 0.3) % 1;
        g.ellipse(ux, uy + 2, rx * (0.4 + wave * 0.6), ry * (0.4 + wave * 0.6)).stroke({
          color: 0x7dd3fc,
          width: 0.8,
          alpha: (1 - wave) * 0.2,
        });

        // 6 delicate crystalline radial tick marks
        for (let a = 0; a < 6; a++) {
          const ang = rotCW + a * (Math.PI / 3);
          const tipX = ux + Math.cos(ang) * rx;
          const tipY = (uy + 2) + Math.sin(ang) * ry;
          const midX = ux + Math.cos(ang) * (rx * 0.82);
          const midY = (uy + 2) + Math.sin(ang) * (ry * 0.82);
          g.moveTo(midX, midY).lineTo(tipX, tipY).stroke({ color: 0xbae6fd, width: 0.9, alpha: 0.35 });
        }
      }

      // 3. Lightning / Conviction: Crackling celestial sapphire conduit
      if (mods.includes('lightning') || mods.includes('lightning_enchanted') || mods.includes('spectral_hit') || (isHero && hasHaste)) {
        const rx = 18;
        const ry = 8.5;

        // Ground conduit glow
        g.ellipse(ux, uy + 2, rx * 1.1, ry * 1.1).stroke({ color: 0x0369a1, width: 1.8, alpha: 0.12 });
        g.ellipse(ux, uy + 2, rx, ry).stroke({ color: 0x0284c7, width: 1.0, alpha: 0.22 });

        // Subtle electric current filaments
        for (let p = 0; p < 4; p++) {
          const a1 = (p / 4) * Math.PI * 2 + now * 0.0008;
          const a2 = ((p + 1) / 4) * Math.PI * 2 + now * 0.0008;
          const x1 = ux + Math.cos(a1) * rx;
          const y1 = (uy + 2) + Math.sin(a1) * ry;
          const x2 = ux + Math.cos(a2) * rx;
          const y2 = (uy + 2) + Math.sin(a2) * ry;

          const midJitter = (Math.sin(now * 0.02 + p * 3) > 0 ? 1.5 : -1.5);
          const mx = (x1 + x2) * 0.5 + Math.cos(a1 + 1.57) * midJitter;
          const my = (y1 + y2) * 0.5 + Math.sin(a1 + 1.57) * (midJitter * 0.5);

          g.moveTo(x1, y1).lineTo(mx, my).lineTo(x2, y2).stroke({ color: 0x38bdf8, width: 0.9, alpha: 0.28 });
        }
      }

      // 4. Blessed: Golden Ethereal Sanctuary Seal
      if (mods.includes('blessed_aura') || mods.includes('blessed') || (isHero && hasBless)) {
        const pulse = 1 + 0.035 * Math.sin(now * 0.002 + i);
        const rx = 18 * pulse;
        const ry = 8.5 * pulse;
        const rot = now * 0.0006;

        // Concentric soft golden sanctuary rings
        g.ellipse(ux, uy + 2, rx * 1.15, ry * 1.15).stroke({ color: 0x854d0e, width: 2.0, alpha: 0.14 });
        g.ellipse(ux, uy + 2, rx, ry).stroke({ color: 0xb45309, width: 1.2, alpha: 0.26 });
        g.ellipse(ux, uy + 2, rx * 0.65, ry * 0.65).stroke({ color: 0xd97706, width: 0.8, alpha: 0.18 });

        // 6 delicate sacred runic ticks
        for (let p = 0; p < 6; p++) {
          const ang = rot + p * (Math.PI / 3);
          const px = ux + Math.cos(ang) * rx;
          const py = (uy + 2) + Math.sin(ang) * ry;
          const inX = ux + Math.cos(ang) * (rx * 0.82);
          const inY = (uy + 2) + Math.sin(ang) * (ry * 0.82);
          g.moveTo(inX, inY).lineTo(px, py).stroke({
            color: 0xfef08a,
            width: 0.9,
            alpha: 0.35,
          });
        }
      }

      // 5. Super-Unique Signature Crown & Elemental Halo
      const su = getSuperUniqueForUnit(sim, i);
      if (su) {
        const pulse = 1 + 0.09 * Math.sin(now * 0.005 + i);
        const rx = 21 * su.visual.scale * 0.8 * pulse;
        const ry = 10.5 * su.visual.scale * 0.8 * pulse;
        const rot = -now * 0.0018;
        g.ellipse(ux, uy + 2, rx * 1.15, ry * 1.15).stroke({ color: su.visual.auraColor, width: 1.6, alpha: 0.35 });
        g.ellipse(ux, uy + 2, rx * 0.82, ry * 0.82).stroke({ color: su.visual.tint, width: 1.0, alpha: 0.25 });
        for (let p = 0; p < 8; p++) {
          const ang = rot + p * (Math.PI / 4);
          const bx = ux + Math.cos(ang) * rx;
          const by = uy + 2 + Math.sin(ang) * ry;
          const tx = ux + Math.cos(ang) * (rx * 1.25);
          const ty = uy + 2 + Math.sin(ang) * (ry * 1.25);
          g.moveTo(bx, by).lineTo(tx, ty).stroke({ color: su.visual.auraColor, width: 0.9, alpha: 0.35 });
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

    // Update & Draw Bone Fragments & Skeletal Debris
    for (let i = this.boneFragments.length - 1; i >= 0; i--) {
      const b = this.boneFragments[i];
      b.alpha -= b.decayRate * (dt * 1000);
      if (b.alpha <= 0) {
        this.boneFragments.splice(i, 1);
        continue;
      }
      const cos = Math.cos(b.rot);
      const sin = Math.sin(b.rot);
      const halfL = b.length * 0.5;
      const x1 = b.x - cos * halfL;
      const y1 = b.y - sin * halfL;
      const x2 = b.x + cos * halfL;
      const y2 = b.y + sin * halfL;

      // Dark drop shadow
      this.bloodGraphics
        .moveTo(x1 + 1, y1 + 1.5)
        .lineTo(x2 + 1, y2 + 1.5)
        .stroke({ color: 0x140e0a, width: b.width + 1.2, alpha: b.alpha * 0.65 });

      // Ivory fractured bone
      this.bloodGraphics
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({ color: 0xe5dac5, width: b.width, alpha: b.alpha });

      if (b.type === 1) {
        // Curved rib arc fragment
        const midX = (x1 + x2) * 0.5 - sin * 2.8;
        const midY = (y1 + y2) * 0.5 + cos * 2.8;
        this.bloodGraphics
          .moveTo(x1, y1)
          .lineTo(midX, midY)
          .lineTo(x2, y2)
          .stroke({ color: 0xd8cdb0, width: b.width * 0.85, alpha: b.alpha });
      } else if (b.type === 2) {
        // Joint bone nubs on ends
        this.bloodGraphics.circle(x1, y1, b.width * 0.85).fill({ color: 0xf4ede2, alpha: b.alpha });
        this.bloodGraphics.circle(x2, y2, b.width * 0.85).fill({ color: 0xf4ede2, alpha: b.alpha });
      }
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
