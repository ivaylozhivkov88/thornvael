import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { checkSheet, frameName, type UnitSheet } from './contract';
import { animationFrame, palette, sheetDirection, splitMask } from './palette';
import type { AnimationPose } from './combat-animation';

export const UNIT_ART = ['hero', 'archer', 'golem', 'warrior', 'mage', 'gnoll', 'imp'] as const;
export type UnitArt = typeof UNIT_ART[number];

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
  constructor(readonly atlas: UnitAtlas) {
    super();
    for (const s of this.layers) {
      s.anchor.set(0.5, 0.85);
      s.scale.set(64 / atlas.cell[0], 64 / atlas.cell[1]);
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
    const pk = `${team}:${armour}:${level}:${stone}:${statusTint}`;
    if (pk !== this.paletteKey) {
      palette(team, armour, level).forEach((tint, i) => {
        this.layers[i].tint = stone ? 0x8a8a8a : statusTint > 0 ? statusTint : tint;
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
