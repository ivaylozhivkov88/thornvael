import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { checkSheet, frameName, type UnitSheet } from './contract';
import { animationFrame, ARMOUR_COLORS, palette, sheetDirection, splitMask } from './palette';
import type { AnimationPose } from './combat-animation';

export const UNIT_ART = ['hero', 'archer', 'golem', 'warrior', 'mage', 'gnoll', 'imp'] as const;
export const BOSS_ART = ['morvessa', 'gorrathul', 'vesperion', 'ashkarath'] as const;
export const ALL_UNIT_ART = [...UNIT_ART, ...BOSS_ART] as const;
export type UnitArt = typeof ALL_UNIT_ART[number];
export type BossArt = typeof BOSS_ART[number];
export type HeroWeaponVisual = 'sword' | 'bow' | 'staff';
export const HERO_ARMOUR_TINTS = ARMOUR_COLORS;
export const HEROIC_UNIT_SCALE = 1.35;

export interface BossSpriteContract {
  contract: number;
  unit: BossArt;
  directions: number;
  cell: readonly [number, number];
  anims: Readonly<Record<string, number>>;
  mask: string;
}

export interface BossSpriteDef {
  id: BossArt;
  name: string;
  baseArt: BossArt;
  scale: number;
  paletteTier: number;
  auraTint: number;
  signatureColor: number;
  contract: BossSpriteContract;
}

export const BOSS_SPRITE_DEFS: Record<BossArt, BossSpriteDef> = {
  morvessa: {
    id: 'morvessa',
    name: 'Morvessa, the Silk Widow',
    baseArt: 'morvessa',
    scale: 1.45,
    paletteTier: 5,
    auraTint: 0x3cd070, // Venomous emerald glow
    signatureColor: 0x228b22,
    contract: {
      contract: 1,
      unit: 'morvessa',
      directions: 16,
      cell: [48, 48] as const,
      anims: { stand: 4, walk: 8, attack: 4, cast: 4, hurt: 2, die: 4 },
      mask: 'morvessa-mask.png',
    },
  },
  gorrathul: {
    id: 'gorrathul',
    name: 'Gorrathul, the Sand Glutton',
    baseArt: 'gorrathul',
    scale: 1.85,
    paletteTier: 5,
    auraTint: 0x60c8ff, // Glacial frost subterranean aura
    signatureColor: 0x1e90ff,
    contract: {
      contract: 1,
      unit: 'gorrathul',
      directions: 16,
      cell: [48, 48] as const,
      anims: { stand: 4, walk: 8, attack: 4, cast: 4, hurt: 2, die: 4 },
      mask: 'gorrathul-mask.png',
    },
  },
  vesperion: {
    id: 'vesperion',
    name: 'Vesperion, the Hollow Choir',
    baseArt: 'vesperion',
    scale: 1.6,
    paletteTier: 5,
    auraTint: 0xa870ff, // Stormcaller astral aura
    signatureColor: 0x9370db,
    contract: {
      contract: 1,
      unit: 'vesperion',
      directions: 16,
      cell: [48, 48] as const,
      anims: { stand: 4, walk: 8, attack: 4, cast: 4, hurt: 2, die: 4 },
      mask: 'vesperion-mask.png',
    },
  },
  'ashkarath': {
    id: 'ashkarath',
    name: 'Ashkarath, the Cinder King',
    baseArt: 'ashkarath',
    scale: 1.75,
    paletteTier: 5,
    auraTint: 0xff3b1a, // Infernal crimson hellfire
    signatureColor: 0xdc143c,
    contract: {
      contract: 1,
      unit: 'ashkarath',
      directions: 16,
      cell: [48, 48] as const,
      anims: { stand: 4, walk: 8, attack: 4, cast: 4, hurt: 2, die: 4 },
      mask: 'ashkarath-mask.png',
    },
  },
};

export function isBossArt(id: string): id is BossArt {
  return (BOSS_ART as readonly string[]).includes(id);
}

export function bossSpriteDef(id: string): BossSpriteDef | undefined {
  return isBossArt(id) ? BOSS_SPRITE_DEFS[id] : undefined;
}

async function pixels(url: string): Promise<ImageData> {
  const im = new Image();
  im.src = url;
  await im.decode();
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(im, 0, 0);
  return ctx.getImageData(0, 0, cv.width, cv.height);
}

export class UnitAtlas {
  private readonly frames = new Map<string, readonly Texture[]>();
  readonly cell: readonly [number, number];
  readonly animations: Readonly<Record<string, number>>;
  private constructor(readonly unit: UnitArt, readonly source: Texture, sheet: UnitSheet) {
    this.cell = Object.freeze([...sheet.meta.thornvael!.cell]) as readonly [number, number];
    this.animations = Object.freeze({ ...sheet.meta.thornvael!.anims });
    const { w, h } = sheet.meta.size;
    for (const [name, f] of Object.entries(sheet.frames)) {
      const r = f.frame;
      this.frames.set(name, Array.from({ length: 4 }, (_, layer) => new Texture({
        source: source.source,
        frame: new Rectangle(r.x + (layer % 2) * w, r.y + Math.floor(layer / 2) * h, r.w, r.h),
      })));
    }
  }

  static async load(unit: UnitArt): Promise<UnitAtlas> {
    const base = `${import.meta.env.BASE_URL}sprites/`;
    const response = await fetch(`${base}${unit}.json`);
    if (!response.ok) throw new Error(`Unit atlas ${unit}: HTTP ${response.status}`);
    const sheet = await response.json() as UnitSheet;
    const errors = checkSheet(sheet);
    if (errors.length) throw new Error(`Unit atlas ${unit}: ${errors.join('; ')}`);
    if (sheet.meta.thornvael!.unit !== unit) throw new Error(`Wrong unit atlas: ${unit}`);
    const [color, mask] = await Promise.all([pixels(base + sheet.meta.image), pixels(base + sheet.meta.thornvael!.mask)]);
    const { w, h } = sheet.meta.size;
    if (color.width !== w || color.height !== h || mask.width !== w || mask.height !== h)
      throw new Error(`Unit atlas ${unit}: image dimensions differ from metadata`);
    // Four quadrants, ONE GPU source per family. Standard Pixi sprite batching,
    // no filters, custom shader, offscreen render pass or per-palette texture.
    const cv = document.createElement('canvas');
    cv.width = w * 2; cv.height = h * 2;
    const ctx = cv.getContext('2d')!;
    splitMask(color.data, mask.data).forEach((data, layer) => {
      ctx.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), (layer % 2) * w, Math.floor(layer / 2) * h);
    });
    const texture = Texture.from(cv);
    texture.source.scaleMode = 'nearest';
    return new UnitAtlas(unit, texture, sheet);
  }

  get(name: string): readonly Texture[] {
    const textures = this.frames.get(name);
    if (!textures) throw new Error(`Missing unit frame ${name}`);
    return textures;
  }

  hasClip(clip: string): boolean { return (this.animations[clip] ?? 0) > 0; }
}

export class UnitSprite extends Container {
  readonly layers = Array.from({ length: 4 }, () => new Sprite());
  readonly gearOverlay = new Graphics();
  private frameKey = '';
  private paletteKey = '';
  private requestedClip = 'stand';
  private resolvedClip = 'stand';
  private finished = false;
  private unresolved = false;
  weaponType: HeroWeaponVisual = 'sword';
  armorTier = 0;

  constructor(readonly atlas: UnitAtlas, readonly bossDef?: BossSpriteDef, readonly heroicScale = 1) {
    super();
    const scaleMul = bossDef ? bossDef.scale : heroicScale;
    for (const s of this.layers) {
      s.anchor.set(0.5, 0.85);
      s.scale.set((64 / atlas.cell[0]) * scaleMul, (64 / atlas.cell[1]) * scaleMul);
      this.addChild(s);
    }
    this.gearOverlay.scale.copyFrom(this.layers[0].scale);
    this.addChild(this.gearOverlay);
  }

  update(
    tick: number,
    moving: boolean,
    dir: number,
    team: number,
    armour: number,
    level: number,
    stone: boolean,
    pose?: AnimationPose,
    statusTint = 0,
    isHero = false,
    weaponType: HeroWeaponVisual = 'sword',
  ): void {
    this.weaponType = weaponType;
    this.armorTier = armour;
    const isHeroUnit = this.atlas.unit === 'hero' || isHero;

    // Weapon type visual adjust: Staff attack dispatches cast animation; Bow uses ranged cadence
    let req = pose?.clip ?? (moving ? 'walk' : 'stand');
    if (isHeroUnit && !moving) {
      if (weaponType === 'staff' && req === 'attack' && this.atlas.hasClip('cast')) {
        req = 'cast';
      }
    }
    this.requestedClip = req;
    this.resolvedClip = this.atlas.hasClip(this.requestedClip) ? this.requestedClip : moving ? 'walk' : 'stand';
    this.finished = pose?.finished ?? false;
    this.unresolved = pose?.unresolved ?? false;

    let n = pose && this.resolvedClip === this.requestedClip
      ? Math.min(this.atlas.animations[this.resolvedClip] - 1, Math.max(0, pose.frame))
      : animationFrame(tick, moving);

    // Stance adjustments for weapon types when standing
    if (isHeroUnit && !moving && (!pose || pose.clip === 'stand')) {
      if (weaponType === 'staff') {
        n = Math.floor(tick / 12) % 2;
      } else if (weaponType === 'bow') {
        n = (Math.floor(tick / 10) % 2) + 2;
      }
    }

    const key = frameName(this.atlas.unit, this.resolvedClip, sheetDirection(dir), n);
    if (key !== this.frameKey) {
      this.atlas.get(key).forEach((tex, i) => { this.layers[i].texture = tex; });
      this.frameKey = key;
    }

    const effectiveTint = this.bossDef && statusTint === 0 ? this.bossDef.auraTint : statusTint;
    const pk = `${team}:${armour}:${level}:${stone}:${effectiveTint}:${isHeroUnit}:${weaponType}`;
    if (pk !== this.paletteKey) {
      if (stone) {
        this.layers.forEach((l) => { l.tint = 0x8a8a8a; });
      } else if (effectiveTint > 0) {
        this.layers.forEach((l) => { l.tint = effectiveTint; });
      } else if (isHeroUnit && team === 0) {
        // Heroic metallic gleam and royal heraldry:
        // layer 0: base full-RGB (skin tones, leather boots, outlines)
        this.layers[0].tint = 0xffffff;
        // layer 1: royal sapphire mantle, shield crest & helm plumage
        this.layers[1].tint = 0x2563eb;
        // layer 2: Equipped armor tier (Leather, Chain, Scale, Plate, Gilded, Astral/Meteorite)
        this.layers[2].tint = HERO_ARMOUR_TINTS[Math.min(5, Math.max(0, armour))] ?? 0xd6dce8;
        // layer 3: Weapon / gold embellishment & lion filigree
        this.layers[3].tint = weaponType === 'staff' ? 0x70d8ff : weaponType === 'bow' ? 0x9be368 : 0xffd23d;
      } else {
        palette(team, armour, level).forEach((tint, i) => {
          this.layers[i].tint = tint;
        });
      }
      this.paletteKey = pk;
    }

    // Dynamic distinct armor overlays and weapon overlays for hero
    this.drawGearOverlay(dir, isHeroUnit && !stone && !this.finished, armour, weaponType, tick);
  }

  private drawGearOverlay(dir: number, visible: boolean, armourTier: number, weaponType: HeroWeaponVisual, tick: number): void {
    this.gearOverlay.clear();
    if (!visible) return;

    const angle = (dir / 16) * Math.PI * 2;
    const tier = Math.min(5, Math.max(0, armourTier));

    // 1. Distinct Armor Overlay Tiers:
    if (tier === 0) {
      // Leather: studded leather cuirass and harness rivets
      this.gearOverlay.circle(-3, -20, 1.2).fill(0x5c4028);
      this.gearOverlay.circle(3, -20, 1.2).fill(0x5c4028);
      this.gearOverlay.rect(-4, -18, 8, 2).fill({ color: 0x4a3220, alpha: 0.6 });
    } else if (tier === 1) {
      // Chain: chainmail specular rings & shoulder mantle glint
      this.gearOverlay.circle(-5, -22, 1.8).stroke({ color: 0xc8d4e4, width: 1, alpha: 0.75 });
      this.gearOverlay.circle(5, -22, 1.8).stroke({ color: 0xc8d4e4, width: 1, alpha: 0.75 });
      this.gearOverlay.rect(-5, -20, 10, 3).fill({ color: 0xa0b0c4, alpha: 0.45 });
    } else if (tier === 2) {
      // Scale: bronze scale plates & overlapping ridge highlights
      this.gearOverlay.moveTo(-5, -22).lineTo(0, -18).lineTo(5, -22).stroke({ color: 0xe0a050, width: 1.5, alpha: 0.8 });
      this.gearOverlay.moveTo(-4, -19).lineTo(0, -15).lineTo(4, -19).stroke({ color: 0xc88038, width: 1.5, alpha: 0.8 });
    } else if (tier === 3) {
      // Plate: polished heavy steel cuirass bevel & sharp pauldron reflection
      this.gearOverlay.roundRect(-6, -24, 12, 9, 2).stroke({ color: 0xffffff, width: 1.4, alpha: 0.85 });
      this.gearOverlay.moveTo(-4, -22).lineTo(-1, -17).stroke({ color: 0xffffff, width: 1.8, alpha: 0.9 });
    } else if (tier === 4) {
      // Gilded: ornate ceremonial golden breastplate crest & radiant gold trim
      this.gearOverlay.roundRect(-7, -25, 14, 11, 3).stroke({ color: 0xffe066, width: 1.8, alpha: 0.95 });
      this.gearOverlay.circle(0, -20, 2.5).fill(0xffd700);
      this.gearOverlay.circle(0, -20, 4).stroke({ color: 0xfff0a0, width: 1, alpha: 0.7 });
    } else if (tier === 5) {
      // Astral/Meteorite: pulsing celestial energy rune & star-matter glints
      const pulse = 0.5 + 0.5 * Math.sin(tick * 0.15);
      this.gearOverlay.roundRect(-7, -25, 14, 11, 3).stroke({ color: 0x70f0ff, width: 1.5, alpha: 0.7 + 0.3 * pulse });
      this.gearOverlay.circle(0, -20, 3 + pulse).fill({ color: 0x90f0ff, alpha: 0.85 });
      this.gearOverlay.circle(0, -20, 6 + pulse * 2).stroke({ color: 0xb080ff, width: 1.2, alpha: 0.6 * pulse });
    }

    // 2. Distinct Weapon Overlays:
    if (weaponType === 'sword') {
      const handX = Math.cos(angle - Math.PI / 3) * 8;
      const handY = -18 + Math.sin(angle - Math.PI / 3) * 5;
      const tipX = handX + Math.cos(angle + 0.2) * 14;
      const tipY = handY + Math.sin(angle + 0.2) * 14;
      this.gearOverlay.moveTo(handX, handY).lineTo(tipX, tipY).stroke({ color: 0xf0f4ff, width: 2.2, alpha: 0.9 });
      this.gearOverlay.circle(handX, handY, 1.8).fill(0xffd23d);
    } else if (weaponType === 'bow') {
      const bX = Math.cos(angle - Math.PI / 4) * 9;
      const bY = -19 + Math.sin(angle - Math.PI / 4) * 5;
      this.gearOverlay.ellipse(bX, bY, 3, 9).stroke({ color: 0x8a522a, width: 1.8, alpha: 0.9 });
      this.gearOverlay.moveTo(bX, bY - 8).lineTo(bX + 4, bY).lineTo(bX, bY + 8).stroke({ color: 0xffffff, width: 0.8, alpha: 0.75 });
    } else if (weaponType === 'staff') {
      const sX = Math.cos(angle - Math.PI / 3) * 9;
      const sY = -20 + Math.sin(angle - Math.PI / 3) * 5;
      this.gearOverlay.moveTo(sX, sY + 12).lineTo(sX, sY - 14).stroke({ color: 0x6e4a28, width: 2.0, alpha: 0.9 });
      this.gearOverlay.circle(sX, sY - 15, 3.2).fill(0x50d0ff);
      this.gearOverlay.circle(sX, sY - 15, 5).stroke({ color: 0xa0f0ff, width: 1.2, alpha: 0.8 });
    }
  }

  /** Read-only diagnostics for browser regression tests and the art budget spike. */
  inspect() {
    return {
      unit: this.atlas.unit,
      frame: this.frameKey,
      colors: this.layers.map((s) => s.tint),
      requestedClip: this.requestedClip,
      resolvedClip: this.resolvedClip,
      fallback: this.requestedClip !== this.resolvedClip,
      finished: this.finished,
      unresolved: this.unresolved,
      sources: new Set(this.layers.map((s) => s.texture.source.uid)).size,
      source: this.atlas.source.source.uid,
      filters: this.layers.some((s) => !!s.filters),
      visible: this.visible,
      weaponType: this.weaponType,
      armorTier: this.armorTier,
      heroicScale: this.heroicScale,
    };
  }
}
