import { BitmapText, Container, Graphics, Sprite, Texture, TextStyle } from 'pixi.js';
import type { Sim } from './sim/sim';
import { TILE } from './map';
import { FP } from './sim/sim';
import { St } from './sim/spelldata';
import { getSuperUniqueForUnit } from './sim/super-uniques';
import { renderPaladinAura, renderUnitAuras } from './auras';

export { renderPaladinAura, renderUnitAuras };

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

const BOSS_FAMILIES = new Set(['boss', 'super_unique', 'champion', 'groktar', 'ashkarath']);
const SKELETON_FAMILIES = new Set(['skeleton', 'undead_warrior', 'bone_guard', 'ossuary']);
const CASTER_FAMILIES = new Set(['caster', 'necromancer', 'shaman', 'cultist', 'wraith', 'spectre']);

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

export interface GroundCorpseDecal {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
  color: number;
  alpha: number;
  decayRate: number; // persists and fades gently over ~8-15s
}

export interface EtherealMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  alpha: number;
  born: number;
  lifeMs: number;
}

export interface LootPopParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vz: number;
  z: number;
  color: number;
  size: number;
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
  private corpseDecals: GroundCorpseDecal[] = [];
  private sparks: SparkParticle[] = [];
  private etherealMotes: EtherealMote[] = [];
  private lootPops: LootPopParticle[] = [];
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

  /** Spawn ground corpse decal that gently fades out over ~10-15 seconds */
  spawnCorpseDecal(x: number, y: number, radius = 14, color = 0x5a0e0e): void {
    if (this.corpseDecals.length > 80) {
      this.corpseDecals.shift();
    }
    const rot = Math.random() * Math.PI * 2;
    this.corpseDecals.push({
      x,
      y,
      rx: radius * (0.85 + Math.random() * 0.3),
      ry: radius * 0.58 * (0.85 + Math.random() * 0.3),
      rot,
      color,
      alpha: 0.8,
      decayRate: 0.00007 + Math.random() * 0.00003, // gently fades out over ~10-14 seconds
    });
  }

  /** Spawn scatter of fractured skeletal bone fragments */
  spawnBoneScatter(x: number, y: number, count = 7): void {
    if (this.boneFragments.length + count > 200) {
      this.boneFragments.splice(0, count);
    }
    for (let k = 0; k < count; k++) {
      const bDist = Math.random() * 22 + 4;
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
  }

  /** Spawn ethereal spectral motes bursting upward (casters & undead) */
  spawnEtherealMotes(x: number, y: number, count = 12, color = 0xb868ff): void {
    if (this.etherealMotes.length + count > 150) {
      this.etherealMotes.splice(0, count);
    }
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      const ang = (i / Math.max(1, count)) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const spd = 20 + Math.random() * 55;
      this.etherealMotes.push({
        x: x + Math.cos(ang) * 6,
        y: y + Math.sin(ang) * 4,
        vx: Math.cos(ang) * spd,
        vy: -35 - Math.random() * 60, // buoyant upward burst
        size: 2.2 + Math.random() * 2.2,
        color,
        alpha: 1.0,
        born: now,
        lifeMs: 500 + Math.random() * 400,
      });
    }
  }

  /** Trigger boss death: crisp hit-stop (slow-mo 2-4 frames) + heavy screen shake + radial loot pop */
  triggerBossDeathPop(x: number, y: number, count = 12, now = performance.now()): void {
    // 2-4 frames micro-freeze (slow-mo hit-stop)
    this.triggerHitStop(70, now);
    // Heavy cinematic screen shake
    this.addTrauma(0.85);

    // Radial loot pop: coins & gems burst outward 360 degrees
    if (this.lootPops.length + count > 100) {
      this.lootPops.splice(0, count);
    }
    for (let i = 0; i < count; i++) {
      const ang = (i / Math.max(1, count)) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const spd = 50 + Math.random() * 70;
      const isGold = i % 3 !== 0;
      this.lootPops.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.7,
        vz: 110 + Math.random() * 75,
        z: 4,
        color: isGold ? 0xffd700 : i % 2 === 0 ? 0x00e5ff : 0xe040fb,
        size: isGold ? 2.5 + Math.random() * 1.5 : 3.0 + Math.random() * 1.5,
        born: now,
        lifeMs: 700 + Math.random() * 400,
      });
    }
  }

  /**
   * Handle Monster Family Death FX & Corpse Decals:
   * - Skeletons: collapse into bone fragments
   * - Beasts: leave temporary ground corpse decals that gently fade out
   * - Casters / Undead: burst into ethereal motes
   * - Bosses: crisp hit-stop (2-4 frames) + screen shake + radial loot pop
   */
  onMonsterDeath(
    x: number,
    y: number,
    family?: string,
    isBoss = false,
    isElite = false,
    now = performance.now(),
  ): void {
    const fam = (family ?? '').toLowerCase();
    const isBossMonster = isBoss || fam === 'boss' || BOSS_FAMILIES.has(fam);
    const isSkeleton = fam === 'skeleton' || SKELETON_FAMILIES.has(fam);
    const isCaster = fam === 'caster' || CASTER_FAMILIES.has(fam);

    if (isBossMonster) {
      this.triggerBossDeathPop(x, y, 14, now);
      this.spawnCorpseDecal(x, y, 20, 0x6a0e0e);
      this.spawnEtherealMotes(x, y, 16, 0xffa726);
      this.spawnBoneScatter(x, y, 8);
    } else if (isSkeleton) {
      this.spawnBoneScatter(x, y, isElite ? 10 : 7);
      this.spawnCorpseDecal(x, y, 12, 0x3d3024);
      this.spawnEtherealMotes(x, y, 8, 0x90caf9);
    } else if (isCaster) {
      this.spawnEtherealMotes(x, y, isElite ? 16 : 12, 0xb868ff);
      this.spawnCorpseDecal(x, y, 12, 0x2e183d);
    } else {
      // Beast default: leaves temporary ground corpse decal that gently fades out
      this.spawnCorpseDecal(x, y, isElite ? 18 : 14, 0x5a0e0e);
      this.spawnBlood(x, y, 0, 0, isElite ? 7 : 4);
    }
  }

  /** Spawn persistent death gore: dark pooled blood splatters and fractured bone fragments on terrain */
  spawnDeathGore(
    x: number,
    y: number,
    isElite = false,
    isUndead = false,
    family?: string,
    isBoss = false,
    now = performance.now(),
  ): void {
    if (family !== undefined || isBoss) {
      this.onMonsterDeath(x, y, family, isBoss, isElite, now);
      return;
    }

    // Default routing when family is unspecified
    if (isUndead) {
      this.spawnBoneScatter(x, y, isElite ? 9 : 6);
      this.spawnEtherealMotes(x, y, isElite ? 12 : 8, 0x70c8ff);
      this.spawnCorpseDecal(x, y, isElite ? 14 : 10, 0x3d3024);
    } else if (isElite) {
      this.triggerBossDeathPop(x, y, 10, now);
      this.spawnCorpseDecal(x, y, 16, 0x640c0c);
    } else {
      this.spawnCorpseDecal(x, y, 13, 0x580a0a);
    }

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
    renderUnitAuras(this.auraGraphics, sim, now, k, this.mapW);
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

    // Update Ground Blood Splatters and Corpse Decals
    this.bloodGraphics.clear();

    // 1. Temporary ground corpse decals (fade gently)
    for (let i = this.corpseDecals.length - 1; i >= 0; i--) {
      const d = this.corpseDecals[i];
      d.alpha -= d.decayRate * (dt * 1000);
      if (d.alpha <= 0) {
        this.corpseDecals.splice(i, 1);
        continue;
      }
      this.bloodGraphics.ellipse(d.x, d.y, d.rx, d.ry).fill({ color: d.color, alpha: d.alpha });
      const cos = Math.cos(d.rot);
      const sin = Math.sin(d.rot);
      this.bloodGraphics
        .ellipse(d.x + cos * 3, d.y + sin * 2, d.rx * 0.6, d.ry * 0.65)
        .fill({ color: 0x220404, alpha: d.alpha * 0.7 });
    }

    // 2. Splatters
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

    // Update Ethereal Motes (casters & undead bursting into ethereal motes)
    for (let i = this.etherealMotes.length - 1; i >= 0; i--) {
      const m = this.etherealMotes[i];
      const age = (now - m.born) / m.lifeMs;
      if (age >= 1) {
        this.etherealMotes.splice(i, 1);
        continue;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vy += 10 * dt; // gentle deceleration
      const fade = 1 - age;
      this.sparkGraphics.circle(m.x, m.y, m.size * 1.8).fill({ color: m.color, alpha: 0.22 * fade });
      this.sparkGraphics.circle(m.x, m.y, m.size * fade).fill({ color: m.color, alpha: 0.9 * fade });
      this.sparkGraphics.circle(m.x, m.y, m.size * 0.45 * fade).fill({ color: 0xffffff, alpha: fade });
    }

    // Update Radial Loot Pop (boss death)
    for (let i = this.lootPops.length - 1; i >= 0; i--) {
      const lp = this.lootPops[i];
      const age = (now - lp.born) / lp.lifeMs;
      if (age >= 1) {
        this.lootPops.splice(i, 1);
        continue;
      }
      lp.vz -= 360 * dt; // gravity
      lp.x += lp.vx * dt;
      lp.y += lp.vy * dt;
      lp.z = Math.max(0, lp.z + lp.vz * dt);
      if (lp.z <= 0 && lp.vz < -30) {
        lp.vz = -lp.vz * 0.45; // bounce
        lp.vx *= 0.6;
        lp.vy *= 0.6;
      }
      const fade = age > 0.7 ? (1 - age) / 0.3 : 1.0;
      const drawY = lp.y - lp.z;
      this.sparkGraphics.circle(lp.x, drawY, lp.size * 1.7).fill({ color: lp.color, alpha: 0.3 * fade });
      this.sparkGraphics.circle(lp.x, drawY, lp.size).fill({ color: lp.color, alpha: fade });
      this.sparkGraphics.circle(lp.x, drawY, lp.size * 0.4).fill({ color: 0xffffff, alpha: fade });
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
