import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { checkSheet, frameName, type UnitSheet } from './contract';
import { animationFrame, palette, sheetDirection, splitMask } from './palette';
import type { AnimationPose } from './combat-animation';

export const UNIT_ART = ['hero', 'archer', 'golem', 'warrior', 'mage', 'gnoll', 'imp'] as const;
export type UnitArt = typeof UNIT_ART[number];

export const BOSS_ART = ['lilithia', 'azgalor', 'malakar', 'ignis-khor'] as const;
export type BossArt = typeof BOSS_ART[number];

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
  baseArt: UnitArt;
  scale: number;
  paletteTier: number;
  auraTint: number;
  signatureColor: number;
  contract: BossSpriteContract;
}

export const BOSS_SPRITE_DEFS: Record<BossArt, BossSpriteDef> = {
  lilithia: {
    id: 'lilithia',
    name: 'Lilithia, Queen of Agony',
    baseArt: 'imp',
    scale: 1.45,
    paletteTier: 5,
    auraTint: 0x3cd070, // Venomous emerald glow
    signatureColor: 0x228b22,
    contract: {
      contract: 1,
      unit: 'lilithia',
      directions: 16,
      cell: [48, 48] as const,
      anims: { stand: 4, walk: 8, attack: 4, cast: 4, hurt: 2, die: 4 },
      mask: 'lilithia-mask.png',
    },
  },
  azgalor: {
    id: 'azgalor',
    name: 'Azgalor, Maggot Colossus',
    baseArt: 'golem',
    scale: 1.85,
    paletteTier: 5,
    auraTint: 0x60c8ff, // Glacial frost subterranean aura
    signatureColor: 0x1e90ff,
    contract: {
      contract: 1,
      unit: 'azgalor',
      directions: 16,
      cell: [48, 48] as const,
      anims: { stand: 4, walk: 8, attack: 4, cast: 4, hurt: 2, die: 4 },
      mask: 'azgalor-mask.png',
    },
  },
  malakar: {
    id: 'malakar',
    name: 'Malakar, The Tormentor',
    baseArt: 'golem',
    scale: 1.6,
    paletteTier: 5,
    auraTint: 0xa870ff, // Stormcaller astral aura
    signatureColor: 0x9370db,
    contract: {
      contract: 1,
      unit: 'malakar',
      directions: 16,
      cell: [48, 48] as const,
      anims: { stand: 4, walk: 8, attack: 4, cast: 4, hurt: 2, die: 4 },
      mask: 'malakar-mask.png',
    },
  },
  'ignis-khor': {
    id: 'ignis-khor',
    name: 'Ignis-Khor, Lord of Terror',
    baseArt: 'mage',
    scale: 1.75,
    paletteTier: 5,
    auraTint: 0xff3b1a, // Infernal crimson hellfire
    signatureColor: 0xdc143c,
    contract: {
      contract: 1,
      unit: 'ignis-khor',
      directions: 16,
      cell: [48, 48] as const,
      anims: { stand: 4, walk: 8, attack: 4, cast: 4, hurt: 2, die: 4 },
      mask: 'ignis-khor-mask.png',
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
  private readonly layers = Array.from({ length: 4 }, () => new Sprite());
  private frameKey = '';
  private paletteKey = '';
  private requestedClip = 'stand';
  private resolvedClip = 'stand';
  private finished = false;
  private unresolved = false;
  constructor(readonly atlas: UnitAtlas, readonly bossDef?: BossSpriteDef) {
    super();
    const scaleMul = bossDef ? bossDef.scale : 1;
    for (const s of this.layers) {
      s.anchor.set(0.5, 0.85);
      s.scale.set((64 / atlas.cell[0]) * scaleMul, (64 / atlas.cell[1]) * scaleMul);
      this.addChild(s);
    }
  }

  update(tick: number, moving: boolean, dir: number, team: number, armour: number, level: number, stone: boolean, pose?: AnimationPose, statusTint = 0): void {
    this.requestedClip = pose?.clip ?? (moving ? 'walk' : 'stand');
    this.resolvedClip = this.atlas.hasClip(this.requestedClip) ? this.requestedClip : moving ? 'walk' : 'stand';
    this.finished = pose?.finished ?? false;
    this.unresolved = pose?.unresolved ?? false;
    const n = pose && this.resolvedClip === this.requestedClip
      ? Math.min(this.atlas.animations[this.resolvedClip] - 1, Math.max(0, pose.frame))
      : animationFrame(tick, moving);
    const key = frameName(this.atlas.unit, this.resolvedClip, sheetDirection(dir), n);
    if (key !== this.frameKey) {
      this.atlas.get(key).forEach((tex, i) => { this.layers[i].texture = tex; });
      this.frameKey = key;
    }
    const effectiveTint = this.bossDef && statusTint === 0 ? this.bossDef.auraTint : statusTint;
    const pk = `${team}:${armour}:${level}:${stone}:${effectiveTint}`;
    if (pk !== this.paletteKey) {
      palette(team, armour, level).forEach((tint, i) => {
        this.layers[i].tint = stone ? 0x8a8a8a : effectiveTint > 0 ? effectiveTint : tint;
      });
      this.paletteKey = pk;
    }
  }

  /** Read-only diagnostics for browser regression tests and the art budget spike. */
  inspect() {
    return { unit: this.atlas.unit, frame: this.frameKey, colors: this.layers.map((s) => s.tint),
      requestedClip: this.requestedClip, resolvedClip: this.resolvedClip,
      fallback: this.requestedClip !== this.resolvedClip, finished: this.finished, unresolved: this.unresolved,
      sources: new Set(this.layers.map((s) => s.texture.source.uid)).size,
      source: this.atlas.source.source.uid, filters: this.layers.some((s) => !!s.filters), visible: this.visible };
  }
}
