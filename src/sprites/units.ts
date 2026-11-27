import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { checkSheet, frameName, type UnitSheet } from './contract';
import { animationFrame, palette, sheetDirection, splitMask } from './palette';
import type { AnimationPose } from './combat-animation';
import { DEFAULT_LOAD_TIMEOUT_MS, fetchWithTimeout, withTimeout } from './load-pool';

export const UNIT_ART = ['hero', 'archer', 'golem', 'warrior', 'mage', 'gnoll', 'imp',
  'briar-hound', 'thorn-boar', 'flintback', 'mire-wisp', 'cinder-shaman', 'quill-fiend', 'necromancer'] as const;
/** Monster family -> dedicated body art (families without an entry use their sim kind's art). */
export const FAMILY_ART: Readonly<Record<string, (typeof UNIT_ART)[number]>> = {
  'briar-hound': 'briar-hound', 'thorn-boar': 'thorn-boar', 'flintback': 'flintback',
  'mire-wisp': 'mire-wisp', 'fallen-shaman': 'cinder-shaman', 'quill-fiend': 'quill-fiend',
};
export const BOSS_ART = ['morvessa', 'gorrathul', 'vesperion', 'ashkarath'] as const;
export const ALL_UNIT_ART = [...UNIT_ART, ...BOSS_ART] as const;
export type UnitArt = typeof ALL_UNIT_ART[number];
export const EXTENDED_MONSTER_ART = [
  'anvilmaw-smith',
  'ash-weaver',
  'basalt-brute',
  'cinderhorn',
  'cinderling',
  'claw-viper',
  'crowned-maw',
  'doom-knight',
  'dune-beast',
  'dune-lurker',
  'dune-scarab',
  'fetish-blowdart',
  'frost-bell',
  'glasswing',
  'gloom-stag',
  'greater-mummy',
  'hollow-king',
  'hollow-knight',
  'ironbark',
  'lantern-eel',
  'maggot-swarm',
  'night-orchard',
  'pale-burrower',
  'redglass-drake',
  'rift-moth',
  'rootbound',
  'ruin-mite',
  'salt-crab',
  'sand-raider',
  'silt-colossus',
  'spore-matron',
  'storm-kite',
  'stormtree',
  'wendigo-bruiser',
  'witch-doctor',
] as const;
export type ExtendedMonsterArt = typeof EXTENDED_MONSTER_ART[number];
export type AnyUnitArt = UnitArt | ExtendedMonsterArt;
/** Extended monster families -> dedicated sprite sheet id (lazy-loaded per mission). */
export const EXTENDED_FAMILY_ART: Readonly<Record<string, ExtendedMonsterArt>> = Object.fromEntries(
  EXTENDED_MONSTER_ART.map((id) => [id, id]),
) as Readonly<Record<string, ExtendedMonsterArt>>;
export type BossArt = typeof BOSS_ART[number];
export type HeroWeaponVisual = 'sword' | 'bow' | 'staff';
export const HERO_ARMOUR_TINTS = [
  0x71797e, // Tier 0: Realistic Steel Plate (authentic shaded gothic steel armor)
  0x808a96, // Tier 1: Polished Steel Plate (gleaming dark steel)
  0x8a6f4d, // Tier 2: Hardened Bronze Scale (antique bronze)
  0x71797e, // Tier 3: Heavy Gothic Plate (realistic steel plate)
  0xb8923a, // Tier 4: Ornate Gilded Plate (ceremonial gold crest on dark steel)
  0x5a7d9a, // Tier 5: Astral Meteorite Steel (deep celestial shaded cobalt)
] as const;
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

async function pixels(url: string, timeoutMs = DEFAULT_LOAD_TIMEOUT_MS): Promise<ImageData> {
  const im = new Image();
  im.src = url;
  await withTimeout(im.decode(), timeoutMs, `image decode ${url}`);
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
  private backingCanvas: HTMLCanvasElement | null = null;
  private reloadMeta: { colorUrl: string; maskUrl: string; w: number; h: number } | null = null;
  /** Set once at least one visible UnitSprite using this atlas has been drawn in a render pass. */
  gpuUploaded = false;

  private constructor(
    readonly unit: AnyUnitArt,
    readonly source: Texture,
    sheet: UnitSheet,
    readonly texScale = 1,
  ) {
    this.cell = Object.freeze([...sheet.meta.thornvael!.cell]) as readonly [number, number];
    this.animations = Object.freeze({ ...sheet.meta.thornvael!.anims });
    const { w, h } = sheet.meta.size;
    const qw = Math.round(w * texScale);
    const qh = Math.round(h * texScale);
    for (const [name, f] of Object.entries(sheet.frames)) {
      const r = f.frame;
      const rw = Math.max(1, Math.round(r.w * texScale));
      const rh = Math.max(1, Math.round(r.h * texScale));
      const rx = Math.round(r.x * texScale);
      const ry = Math.round(r.y * texScale);
      this.frames.set(name, Array.from({ length: 4 }, (_, layer) => new Texture({
        source: source.source,
        frame: new Rectangle(rx + (layer % 2) * qw, ry + Math.floor(layer / 2) * qh, rw, rh),
      })));
    }
  }

  private static async buildCompositeCanvas(
    colorUrl: string,
    maskUrl: string,
    w: number,
    h: number,
    texScale: number,
    timeoutMs: number,
  ): Promise<HTMLCanvasElement> {
    const color = await pixels(colorUrl, timeoutMs);
    const mask = await pixels(maskUrl, timeoutMs);
    if (color.width !== w || color.height !== h || mask.width !== w || mask.height !== h) {
      throw new Error(`Unit atlas dimensions differ from metadata`);
    }
    const qw = Math.round(w * texScale);
    const qh = Math.round(h * texScale);
    const cv = document.createElement('canvas');
    cv.width = qw * 2;
    cv.height = qh * 2;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = texScale < 1;
    if (texScale < 1) ctx.imageSmoothingQuality = 'high';
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const tmpCtx = tmp.getContext('2d')!;
    splitMask(color.data, mask.data).forEach((data, layer) => {
      tmpCtx.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
      ctx.drawImage(tmp, 0, 0, w, h, (layer % 2) * qw, Math.floor(layer / 2) * qh, qw, qh);
    });
    tmp.width = 0;
    tmp.height = 0;
    return cv;
  }

  static async load(unit: AnyUnitArt, timeoutMs = DEFAULT_LOAD_TIMEOUT_MS): Promise<UnitAtlas> {
    const base = `${import.meta.env.BASE_URL}sprites/`;
    const response = await fetchWithTimeout(`${base}${unit}.json`, timeoutMs);
    if (!response.ok) throw new Error(`Unit atlas ${unit}: HTTP ${response.status}`);
    const sheet = await response.json() as UnitSheet;
    const errors = checkSheet(sheet);
    if (errors.length) throw new Error(`Unit atlas ${unit}: ${errors.join('; ')}`);
    if (sheet.meta.thornvael!.unit !== unit) throw new Error(`Wrong unit atlas: ${unit}`);
    const { w, h } = sheet.meta.size;
    // Cap composite 4-quadrant GPU texture at 2048x2048 (16 MB instead of 64 MB).
    const texScale = Math.min(1, 2048 / Math.max(1, w * 2, h * 2));
    const colorUrl = base + sheet.meta.image;
    const maskUrl = base + sheet.meta.thornvael!.mask;
    const cv = await UnitAtlas.buildCompositeCanvas(colorUrl, maskUrl, w, h, texScale, timeoutMs);
    const texture = Texture.from(cv);
    texture.source.scaleMode = 'linear';
    const atlas = new UnitAtlas(unit, texture, sheet, texScale);
    atlas.backingCanvas = cv;
    atlas.reloadMeta = { colorUrl, maskUrl, w, h };
    return atlas;
  }

  /** Zero CPU canvas backing after GPU upload so atlas RAM stays near zero. */
  releaseCpuBacking(): void {
    if (!this.backingCanvas) return;
    this.backingCanvas.width = 0;
    this.backingCanvas.height = 0;
    this.backingCanvas = null;
  }

  /** Regenerate canvas pixels from cached sprite PNGs on WebGL context restore. */
  async reloadGpu(timeoutMs = DEFAULT_LOAD_TIMEOUT_MS): Promise<void> {
    if (!this.reloadMeta) {
      this.source?.source?.update();
      return;
    }
    const { colorUrl, maskUrl, w, h } = this.reloadMeta;
    const cv = await UnitAtlas.buildCompositeCanvas(colorUrl, maskUrl, w, h, this.texScale, timeoutMs);
    const src = this.source.source as { resource?: unknown; update: () => void };
    src.resource = cv;
    src.update();
    this.backingCanvas = cv;
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
    const invTexScale = atlas.texScale > 0 ? 1 / atlas.texScale : 1;
    for (const s of this.layers) {
      s.anchor.set(0.5, 0.85);
      s.scale.set((64 / atlas.cell[0]) * invTexScale * scaleMul, (64 / atlas.cell[1]) * invTexScale * scaleMul);
      this.addChild(s);
    }
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
        // Heroic dark fantasy materials:
        // layer 0: base full-RGB (preserves authentic skin tones on face/beard, dark leather boots/gloves, weapon hilts, shadows)
        this.layers[0].tint = 0xffffff;
        // layer 1: deep heraldic midnight navy mantle & crest
        this.layers[1].tint = 0x1e40af;
        // layer 2: authentic shaded steel plate / armor tier (DO NOT use pure white 0xe8f0fc)
        this.layers[2].tint = HERO_ARMOUR_TINTS[Math.min(HERO_ARMOUR_TINTS.length - 1, Math.max(0, armour))] ?? 0x71797e;
        // layer 3: antique burnished gold accents, lion crest & pommel
        this.layers[3].tint = weaponType === 'staff' ? 0x67e8f9 : weaponType === 'bow' ? 0xa3e635 : 0xf59e0b;
      } else {
        palette(team, armour, level).forEach((tint, i) => {
          this.layers[i].tint = tint;
        });
      }
      this.paletteKey = pk;
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
