import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { OverheadNameplateLayer } from './nameplate';
import { ObjectKind, PropKind, Terrain, TILE, type GameMap } from './map';
import { loadTerrainArt, paintTerrainChunk, prepareScenery, type SceneryPlacement } from './terrain';
import { Kind } from './sim/combat';
import { SKILL_NAMES } from './sim/hero';
import { FP, type Sim } from './sim/sim';
import { SPELLS, St, Tk } from './sim/spelldata';
import { S } from './strings';
import { getItemDef, Slot } from './sim/items';
import { itemRarity } from './sim/town';
import { UnitAtlas, UnitSprite, ALL_UNIT_ART, UNIT_ART, bossSpriteDef, type HeroWeaponVisual, HERO_ARMOUR_TINTS } from './sprites/units';
import { ArtPreview } from './sprites/preview';

export function getHeroWeaponVisual(itemDef?: { name: string; cls?: number } | null): HeroWeaponVisual {
  if (!itemDef) return 'sword';
  const name = itemDef.name.toLowerCase();
  if (name.includes('bow') || name.includes('arbalest') || name.includes('arrow') || name.includes('crossbow') || name.includes('windpiercer')) return 'bow';
  if (name.includes('staff') || name.includes('wand') || name.includes('siphon') || name.includes('focus') || (itemDef.cls === 2 && !name.includes('dagger'))) return 'staff';
  return 'sword';
}

export function classifyHeroWeapon(itemDef?: { name: string; cls?: number } | null): 'sword' | 'axe' | 'staff' | 'bow' {
  if (!itemDef) return 'sword';
  const name = itemDef.name.toLowerCase();
  if (name.includes('axe') || name.includes('hatchet') || name.includes('cleaver') || name.includes('halberd') || name.includes('decapitator')) return 'axe';
  if (name.includes('bow') || name.includes('arbalest') || name.includes('arrow') || name.includes('crossbow') || name.includes('windpiercer')) return 'bow';
  if (name.includes('staff') || name.includes('wand') || name.includes('siphon') || name.includes('focus') || (itemDef.cls === 2 && !name.includes('dagger'))) return 'staff';
  return 'sword';
}

export function getHeroArmorVisualTier(itemDef?: { name: string; tier?: number } | null): number {
  if (!itemDef) return 0;
  const name = itemDef.name.toLowerCase();
  if (name.includes('astral') || name.includes('star') || name.includes('meteorite') || name.includes('celestial') || name.includes('aether')) return 5;
  if (name.includes('gilded') || name.includes('gothic') || name.includes('warlord') || name.includes('dragon') || ((itemDef.tier ?? 0) >= 5 && name.includes('plate'))) return 4;
  if (name.includes('scale') || name.includes('brigandine') || itemDef.tier === 3) return 2;
  if (name.includes('plate') || name.includes('cuirass') || itemDef.tier === 4) return 3;
  if (name.includes('chain') || name.includes('mail') || itemDef.tier === 2) return 1;
  return 0;
}
import { CombatAnimation, type AnimationPose } from './sprites/combat-animation';
import { VfxSystem } from './vfx';
import { CombatFeelSystem } from './feel';
import { AestheticVfxSystem, detectBiomeFromMap, type BiomeWeatherType, type BiomeAct } from './aesthetic-vfx';

const SHRINE_COLORS: Record<string, number> = {
  healing: 0xe84a5f,
  mana: 0x4aa3ff,
  combat: 0xff8c32,
  armor: 0xc0c8d8,
  haste: 0x62e878,
  ward: 0xd070ff,
};
const LOOT_BEAM_COLORS: Record<string, { outer: number; inner: number; height: number }> = {
  magic: { outer: 0x4a9eff, inner: 0xa8d4ff, height: 28 },
  rare: { outer: 0xe6c840, inner: 0xfff3a8, height: 34 },
  set: { outer: 0x00ff7f, inner: 0xb9f6ca, height: 38 },
  unique: { outer: 0xff9a1f, inner: 0xffd294, height: 46 },
};

function drawGlint(r: Graphics, x: number, y: number, tick: number, seed: number): void {
  const period = 85; // 3.4 seconds at 25 fps
  const phase = (tick + seed * 23) % period;
  if (phase >= 14) return;
  const progress = phase / 14;
  const size = Math.sin(progress * Math.PI) * 4.5;
  if (size < 0.5) return;
  const alpha = Math.sin(progress * Math.PI);
  r.moveTo(x - size, y).lineTo(x + size, y).stroke({ color: 0xffffff, width: 1.5, alpha });
  r.moveTo(x, y - size).lineTo(x, y + size).stroke({ color: 0xffffff, width: 1.5, alpha });
  r.circle(x, y, Math.max(0.8, size * 0.35)).fill({ color: 0xfffae0, alpha });
}
const CHUNK = 16; // tiles per chunk side, so each baked texture is 512 px
const DIR_COS = Array.from({ length: 16 }, (_, k) => Math.cos((k * Math.PI) / 8));
const DIR_SIN = Array.from({ length: 16 }, (_, k) => Math.sin((k * Math.PI) / 8));
const NIGHT = [0x5a, 0x6a, 0xa6];
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
const TEAM_TINT = [0x7ab8ff, 0xff6a5a];
const HERO_TINT = 0xffd86a;
/** Tint and size per unit kind; monsters are told apart by colour and size until the art pipeline arrives. */
const KIND_LOOK: Record<number, { tint?: number; scale: number }> = {
  [Kind.Warrior]: { scale: 1.35 },
  [Kind.Archer]: { scale: 1.25 },
  [Kind.Hero]: { tint: HERO_TINT, scale: 1.45 },
  [Kind.Mage]: { tint: 0xc9a0ff, scale: 1.28 },
  [Kind.Gnoll]: { tint: 0xc4a35a, scale: 1.35 },
  [Kind.Golem]: { tint: 0xa8a8b0, scale: 1.85 },
  [Kind.Imp]: { tint: 0xff7a3a, scale: 1.22 },
};

type FamilyOrnament =
  | 'spines'
  | 'wisp'
  | 'antlers'
  | 'shell'
  | 'totem'
  | 'scarab'
  | 'serpent'
  | 'treant'
  | 'crown'
  | 'drake'
  | 'storm'
  | 'forge'
  | 'astral'
  | 'bell'
  | 'mummy'
  | 'none';

interface FamilyVisualDef {
  scaleX: number;
  scaleY: number;
  /** 3-channel color harmony for (team, armour, level) mask layers */
  tints: readonly [number, number, number];
  auraColor: number;
  ornament: FamilyOrnament;
}

/** Distinct battlefield proportions, 3-layer color harmonies and silhouette ornaments for all 41 monster families. */
export const FAMILY_VISUALS: Readonly<Record<string, FamilyVisualDef>> = {
  // Batch A (Act 1 — Marsh / Woods)
  'briar-hound': { scaleX: 1.04, scaleY: 0.84, tints: [0xb83b2a, 0x6e4e32, 0x9c7a44], auraColor: 0xc85a32, ornament: 'spines' },
  'flintback': { scaleX: 1.32, scaleY: 1.18, tints: [0x5c8a58, 0x7a8288, 0x989e94], auraColor: 0x7a9a72, ornament: 'shell' },
  'mire-wisp': { scaleX: 0.86, scaleY: 0.96, tints: [0x38e8c8, 0x2aa8d8, 0x90fff0], auraColor: 0x40f0d0, ornament: 'wisp' },
  'ruin-mite': { scaleX: 0.82, scaleY: 0.72, tints: [0xd46a28, 0x8a5836, 0xc89a52], auraColor: 0xd47a38, ornament: 'scarab' },
  'thorn-boar': { scaleX: 1.16, scaleY: 0.94, tints: [0x8c3828, 0x5c402c, 0xd8c8a8], auraColor: 0xa85838, ornament: 'spines' },
  'quill-fiend': { scaleX: 0.95, scaleY: 1.0, tints: [0xd83848, 0x784838, 0xe8b050], auraColor: 0xe04848, ornament: 'spines' },
  'fallen-shaman': { scaleX: 1.02, scaleY: 1.08, tints: [0xe03020, 0xd8c8a0, 0xff9830], auraColor: 0xff6820, ornament: 'totem' },

  // Batch B (Act 1/2 — Forest / Coast)
  'glasswing': { scaleX: 0.9, scaleY: 1.04, tints: [0x60e0ff, 0x98d8ff, 0xe0ffff], auraColor: 0x70e8ff, ornament: 'wisp' },
  'rootbound': { scaleX: 1.42, scaleY: 1.48, tints: [0x48a840, 0x6e5034, 0x5c8838], auraColor: 0x58b848, ornament: 'treant' },
  'cinderling': { scaleX: 0.84, scaleY: 0.86, tints: [0xff5818, 0x583830, 0xffc840], auraColor: 0xff6820, ornament: 'forge' },
  'gloom-stag': { scaleX: 1.08, scaleY: 1.2, tints: [0x8868d8, 0x483c68, 0xc8d8f8], auraColor: 0x9878e8, ornament: 'antlers' },
  'salt-crab': { scaleX: 1.3, scaleY: 0.96, tints: [0xe05848, 0x5898a8, 0xd8a888], auraColor: 0x58b8c8, ornament: 'shell' },
  'fetish-blowdart': { scaleX: 0.78, scaleY: 0.8, tints: [0x78e838, 0xd8c898, 0x987040], auraColor: 0x78e838, ornament: 'totem' },
  'witch-doctor': { scaleX: 1.04, scaleY: 1.14, tints: [0x9848d8, 0x48c878, 0xe8d8a8], auraColor: 0x58d888, ornament: 'totem' },

  // Batch C (Act 2 — Desert / Dunes)
  'hollow-knight': { scaleX: 1.08, scaleY: 1.12, tints: [0x48b8c8, 0x687482, 0x98a8b8], auraColor: 0x58c8d8, ornament: 'crown' },
  'spore-matron': { scaleX: 1.12, scaleY: 1.08, tints: [0xc858b8, 0x68a848, 0x98d860], auraColor: 0x88d858, ornament: 'astral' },
  'dune-lurker': { scaleX: 1.06, scaleY: 0.88, tints: [0xd89838, 0xa87c48, 0xe8c478], auraColor: 0xd8a040, ornament: 'spines' },
  'storm-kite': { scaleX: 0.96, scaleY: 1.08, tints: [0x4898ff, 0x485888, 0xffd858], auraColor: 0x58a8ff, ornament: 'storm' },
  'basalt-brute': { scaleX: 1.54, scaleY: 1.5, tints: [0xff7828, 0x48444c, 0x686268], auraColor: 0xff8030, ornament: 'forge' },
  'sand-raider': { scaleX: 1.04, scaleY: 1.06, tints: [0xd83828, 0xc8a468, 0xe8d098], auraColor: 0xe09838, ornament: 'none' },
  'dune-scarab': { scaleX: 1.14, scaleY: 0.84, tints: [0x38d8e8, 0x387888, 0xe8c048], auraColor: 0x48e0ff, ornament: 'scarab' },
  'claw-viper': { scaleX: 1.04, scaleY: 1.16, tints: [0x28c868, 0xd8b040, 0x489858], auraColor: 0x38d878, ornament: 'serpent' },
  'dune-beast': { scaleX: 1.16, scaleY: 1.02, tints: [0xb83828, 0x987040, 0xd4a458], auraColor: 0xc87838, ornament: 'spines' },
  'maggot-swarm': { scaleX: 1.04, scaleY: 0.78, tints: [0x98e838, 0x789848, 0xb8d870], auraColor: 0x98e838, ornament: 'scarab' },

  // Batch D (Act 3 — Bog / Crypt / Mountain)
  'lantern-eel': { scaleX: 0.94, scaleY: 1.1, tints: [0xffe848, 0x286898, 0x48d8ff], auraColor: 0x48e0ff, ornament: 'wisp' },
  'ash-weaver': { scaleX: 1.04, scaleY: 1.12, tints: [0xff5820, 0x686068, 0xffa838], auraColor: 0xff6828, ornament: 'forge' },
  'pale-burrower': { scaleX: 1.1, scaleY: 0.92, tints: [0xd82838, 0xb8b0a8, 0xe8e2d8], auraColor: 0xd84848, ornament: 'spines' },
  'ironbark': { scaleX: 1.56, scaleY: 1.64, tints: [0x38e878, 0x687078, 0x586458], auraColor: 0x48e888, ornament: 'treant' },
  'rift-moth': { scaleX: 0.98, scaleY: 1.1, tints: [0xe058ff, 0x583888, 0x98c8ff], auraColor: 0xd868ff, ornament: 'astral' },
  'greater-mummy': { scaleX: 1.18, scaleY: 1.24, tints: [0x48e868, 0xd8b048, 0xd8cfb8], auraColor: 0x58e878, ornament: 'mummy' },
  'hollow-king': { scaleX: 1.26, scaleY: 1.32, tints: [0x48c8ff, 0x586880, 0xffd860], auraColor: 0x58d0ff, ornament: 'crown' },
  'wendigo-bruiser': { scaleX: 1.48, scaleY: 1.44, tints: [0x68d8ff, 0x98b8d0, 0xe8f4ff], auraColor: 0x78e0ff, ornament: 'antlers' },

  // Batch E (Act 4 — Highland / Citadel / Cinderforge)
  'crowned-maw': { scaleX: 1.2, scaleY: 1.12, tints: [0xe82838, 0x782828, 0xe8d8b0], auraColor: 0xe83838, ornament: 'crown' },
  'frost-bell': { scaleX: 1.08, scaleY: 1.18, tints: [0x78e8ff, 0xa8b8c8, 0xd8f0ff], auraColor: 0x88f0ff, ornament: 'bell' },
  'silt-colossus': { scaleX: 1.66, scaleY: 1.64, tints: [0x38a8ff, 0xd8b060, 0xb89868], auraColor: 0x48b8ff, ornament: 'crown' },
  'redglass-drake': { scaleX: 1.3, scaleY: 1.26, tints: [0xff2838, 0x981828, 0xffb838], auraColor: 0xff4828, ornament: 'drake' },
  'night-orchard': { scaleX: 1.12, scaleY: 1.18, tints: [0xb858ff, 0x382858, 0xd8c8f8], auraColor: 0xc868ff, ornament: 'astral' },
  'stormtree': { scaleX: 1.58, scaleY: 1.64, tints: [0x48d8ff, 0x484c58, 0x98e8ff], auraColor: 0x58e0ff, ornament: 'storm' },
  'doom-knight': { scaleX: 1.24, scaleY: 1.28, tints: [0xff2828, 0x383842, 0xd86828], auraColor: 0xff3828, ornament: 'crown' },
  'cinderhorn': { scaleX: 1.34, scaleY: 1.32, tints: [0xff4818, 0x682420, 0xffd048], auraColor: 0xff5820, ornament: 'drake' },
  'anvilmaw-smith': { scaleX: 1.62, scaleY: 1.56, tints: [0xff6818, 0x785838, 0xffc848], auraColor: 0xff7820, ornament: 'forge' },
};
const ELEM_COLOR = [0xffffff, 0xff9a3a, 0x6ac8ff, 0xd8f0ff, 0xb59a6a, 0xd48aff];
/** Colours of the status pips drawn over a unit, indexed by status id. */
export const STATUS_COLORS = [0xffe070, 0x70c8ff, 0xffffff, 0x6a8cff, 0x7cd14a, 0xff7a2a, 0x9a9a9a, 0xb070c0];
const BUFF_COLOR = 0x7affa0;
export const QUALITY_NAMES = ['Low', 'Medium', 'High'] as const;
const FLOATERS = [0, 10, 24];
const FLOAT_MS = 900;
const KICK_MS = 170;
const TOPPLE_MS = 260;
const DEAD_TINT = 0x6a5a55;

function chunkSide(map: GameMap): number {
  return Math.max(map.w, map.h) > 128 ? 32 : 16;
}

function unitTexture(): Texture {
  const cv = document.createElement('canvas');
  cv.width = 32;
  cv.height = 42;
  const g = cv.getContext('2d')!;

  // Soft ground contact shadow
  g.fillStyle = 'rgba(0, 0, 0, 0.45)';
  g.beginPath();
  g.ellipse(16, 38, 12, 4, 0, 0, Math.PI * 2);
  g.fill();

  // Royal blue mantle / cape
  g.fillStyle = '#2563eb';
  g.beginPath();
  g.moveTo(10, 16);
  g.lineTo(7, 34);
  g.lineTo(25, 34);
  g.lineTo(22, 16);
  g.closePath();
  g.fill();

  // Polished steel plate body with metallic specular highlight
  g.fillStyle = '#dce6f2';
  g.fillRect(10, 15, 12, 16);
  g.fillStyle = '#ffffff';
  g.fillRect(11, 16, 3, 14);

  // Knight helm & visor
  g.fillStyle = '#b8c7db';
  g.beginPath();
  g.arc(16, 11, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#111827';
  g.fillRect(13, 11, 6, 2);
  g.fillStyle = '#ffd23d';
  g.fillRect(15, 4, 2, 4);

  // Kite Shield on left arm
  g.fillStyle = '#2563eb';
  g.beginPath();
  g.moveTo(7, 18);
  g.lineTo(13, 18);
  g.lineTo(10, 29);
  g.closePath();
  g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = '#ffd23d';
  g.stroke();

  // Gleaming Steel Sword on right arm
  g.fillStyle = '#ffffff';
  g.fillRect(23, 7, 2, 18);
  g.strokeStyle = '#b8c7db';
  g.lineWidth = 0.5;
  g.strokeRect(23, 7, 2, 18);
  g.fillStyle = '#ffd23d';
  g.fillRect(21, 23, 6, 2);
  g.fillRect(23, 25, 2, 3);
  g.beginPath();
  g.arc(24, 29, 1.5, 0, Math.PI * 2);
  g.fill();

  return Texture.from(cv);
}

interface Floater {
  t: Text;
  x: number;
  y: number;
  born: number;
}

export interface View {
  hover: { id: number; ok: boolean } | null; // unit under the pointer and whether the armed order may target it
  hoverUnit?: number | null; // unit currently hovered or touched
  selected: ReadonlySet<number>;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  ping: { x: number; y: number; age: number } | null; // world tile coords, age 0..1
  /** Spell reticle in screen pixels: radius in pixels for an area spell (0 otherwise), whether a cast here would work, the unit it would hit. */
  aim: { x: number; y: number; r: number; ok: boolean; target: number } | null;
}

interface Burst {
  x: number; // world pixels
  y: number;
  born: number;
  r: number; // end radius in world pixels
  ms: number;
  color: number;
  fill: boolean;
  el: number;
}

export class Renderer {
  readonly app = new Application();
  readonly world = new Container();
  readonly nameplates = new OverheadNameplateLayer();
  private readonly rings = new Graphics();
  private readonly overlay = new Graphics();
  private readonly light = new Graphics();
  private readonly shots = new Graphics();
  private dustGraphics = new Graphics();
  private heroGearGraphics = new Graphics();
  private swingTrailGraphics = new Graphics();
  private unitAngles: Float32Array = new Float32Array(0);
  private wasAlive: boolean[] = [];
  private dustPuffs: Array<{ x: number; y: number; vx: number; vy: number; size: number; alpha: number; born: number; lifeMs: number; color: number }> = [];
  private swingTrails: Array<{ x: number; y: number; angle: number; radius: number; color: number; born: number; lifeMs: number }> = [];
  private readonly dbgGrid = new Graphics();
  private readonly dbgPath = new Graphics();
  private dbgBuilt = false;
  private readonly floaterLayer = new Container();
  private floaters: Floater[] = [];
  private bursts: Burst[] = [];
  private baseTint: number[] = [];
  // Render-only hit recoil: the struck sprite is pushed away from the attacker and springs back. The sim never sees it.
  private kickX: number[] = [];
  private kickY: number[] = [];
  private kickAt: number[] = [];
  private deathAt: (number | undefined)[] = [];
  private freeText: Text[] = [];
  private fogTick = 0;
  quality = 2;
  private sprites: (Sprite | UnitSprite)[] = [];
  private artStress = false;
  private artPreview?: ArtPreview;
  private loadedAtlases: UnitAtlas[] = [];
  private animation?: CombatAnimation;
  private readonly pose: AnimationPose = { clip: 'stand', frame: 0, age: 0, finished: false, unresolved: false };
  private fogCv!: HTMLCanvasElement;
  private fogTex!: Texture;
  private fogImg!: ImageData;
  private fogBuf32!: Uint32Array;
  private fogSeen = -1;
  private lightKey = '';
  private fog!: Sprite;
  private terrainArt!: HTMLImageElement;
  private scenery: readonly SceneryPlacement[] = [];
  private chunk = 16;
  private readonly chunks = new Container();
  private readonly MAX_CHUNKS = 24;
  private chunkAccessSeq = 0;
  private readonly chunkPool: Array<{
    cx: number;
    cy: number;
    key: string;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    tex: Texture;
    sprite: Sprite;
    lastUsed: number;
  }> = [];
  private readonly chunkMap = new Map<string, {
    cx: number;
    cy: number;
    key: string;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    tex: Texture;
    sprite: Sprite;
    lastUsed: number;
  }>();
  vfx?: VfxSystem;
  readonly feel: CombatFeelSystem;
  readonly aestheticVfx: AestheticVfxSystem;
  private lastDrawNow = 0;
  private lastCastSid = -1;
  zoom = 1;
  camX = 0;
  camY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly map: GameMap,
  ) {
    this.swingTrailGraphics.blendMode = 'add';
    this.feel = new CombatFeelSystem(map.w, map.h);
    this.aestheticVfx = new AestheticVfxSystem();
    this.aestheticVfx.setBiome(detectBiomeFromMap('', map.terrain));
  }

  /** Static world labels: town buildings and people to talk to (x, y in tiles). Call after init. */
  setMarks(marks: readonly { x: number; y: number; label: string; npc: boolean }[]): void {
    const layer = new Container();
    const g = new Graphics();
    layer.addChild(g);
    for (const m of marks) {
      const px = m.x * TILE;
      const py = m.y * TILE;
      if (m.npc) {
        g.circle(px, py - 6, 7).fill(0xe8c860).stroke({ color: 0x2a1a0e, width: 2 });
        g.rect(px - 5, py, 10, 12).fill(0x7a5a9a);
      }
      const t = new Text({ text: m.label, style: { fontFamily: 'Georgia, serif', fontSize: 12, fontWeight: 'bold', fill: m.npc ? 0xf0e2bd : 0xffd870, stroke: { color: 0x000000, width: 3 } } });
      t.anchor.set(0.5, 1);
      t.position.set(px, py - (m.npc ? 14 : 0));
      layer.addChild(t);
    }
    this.world.addChildAt(layer, 2);
  }

  async init(sim: Sim): Promise<void> {
    this.animation = new CombatAnimation(sim);
    await this.app.init({
      canvas: this.canvas,
      resizeTo: window,
      background: '#14100c',
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    this.app.ticker.stop(); // main.ts drives frames
    this.terrainArt = await loadTerrainArt();
    this.scenery = prepareScenery(this.map);
    this.chunk = chunkSide(this.map);
    this.chunks.cullable = false;
    // Fog: one pixel per tile, stretched over the map with linear filtering for soft edges.
    this.fogCv = document.createElement('canvas');
    this.fogCv.width = this.map.w;
    this.fogCv.height = this.map.h;
    this.fogImg = this.fogCv.getContext('2d')!.createImageData(this.map.w, this.map.h);
    this.fogBuf32 = new Uint32Array(this.fogImg.data.buffer);
    this.fogTex = Texture.from(this.fogCv);
    const fog = new Sprite(this.fogTex);
    fog.width = this.map.w * TILE;
    fog.height = this.map.h * TILE;
    this.vfx = new VfxSystem();
    this.vfx.init();
    this.aestheticVfx?.init();
    this.world.addChild(this.chunks, this.rings, this.feel.bloodGraphics, this.dustGraphics, this.feel.auraGraphics, this.vfx.groundLayer);
    this.fog = fog;
    this.unitAngles = new Float32Array(sim.count);
    this.wasAlive = Array.from({ length: sim.count }, (_, i) => sim.cb.hp[i] > 0);
    for (let i = 0; i < sim.count; i++) {
      this.unitAngles[i] = (sim.dir[i] * 2 * Math.PI) / 16;
    }
    const tex = unitTexture();
    const atlases = await Promise.all(ALL_UNIT_ART.map((unit) => UnitAtlas.load(unit)));
    this.loadedAtlases = atlases;
    const atlasByArt = new Map<string, UnitAtlas>(atlases.map((a) => [a.unit, a]));
    const params = new URLSearchParams(location.search);
    this.artStress = params.get('artstress') === '1' && (params.has('crowd') || params.has('battle'));
    for (let i = 0; i < sim.count; i++) {
      const kind = sim.cb.kind[i];
      const boss = sim.cb.family[i] ? bossSpriteDef(sim.cb.family[i]) : undefined;
      const bossAtlas = boss ? atlasByArt.get(boss.id) : undefined;
      // Diagnostic presentation override only: retain the original sim kind and update path.
      const atlas = bossAtlas ?? (this.artStress ? atlases[i % atlases.length]
        : kind === Kind.Hero ? (sim.hero?.cls === 1 ? atlases[4] : atlases[0])
        : kind === Kind.Archer ? atlases[1]
        : kind === Kind.Golem ? atlases[2]
        : kind === Kind.Warrior ? atlases[3]
        : kind === Kind.Mage ? atlases[4]
        : kind === Kind.Gnoll ? atlases[5]
        : kind === Kind.Imp ? atlases[6]
        : null);
      const s = atlas ? new UnitSprite(atlas, boss) : new Sprite(tex);
      if (s instanceof Sprite) s.anchor.set(0.5, 0.88);
      const look = KIND_LOOK[kind] ?? { scale: 1 };
      const famVis = sim.cb.family[i] ? FAMILY_VISUALS[sim.cb.family[i]] : undefined;
      const isChamp = (sim.cb.bossMods[i]?.length ?? 0) > 0 && !boss;
      const champMul = isChamp ? 1.20 : 1;
      if (boss) {
        s.scale.set(boss.scale);
      } else if (famVis) {
        s.scale.set(famVis.scaleX * champMul * 1.32, famVis.scaleY * champMul * 1.32);
      } else {
        s.scale.set(look.scale * champMul);
      }
      // Your units keep the team colour (the hero stays gold); monsters use the colour of their kind or family.
      if (s instanceof Sprite) {
        if (sim.team[i] === 0) s.tint = kind === Kind.Hero || kind === Kind.Mage ? look.tint! : TEAM_TINT[0];
        else if (boss?.signatureColor) s.tint = boss.signatureColor;
        else if (famVis) s.tint = famVis.auraColor;
        else s.tint = kind === Kind.Archer ? TEAM_TINT[1] : look.tint ?? TEAM_TINT[1];
      }
      this.baseTint.push(s.tint as number);
      this.sprites.push(s);
      this.world.addChild(s);
    }
    this.dbgGrid.visible = false;
    this.dbgPath.visible = false;
    this.world.addChild(this.shots, this.feel.sparkGraphics, this.feel.bubbleGraphics, this.feel.slashGraphics, this.swingTrailGraphics, this.heroGearGraphics, this.vfx.airLayer, fog, this.dbgGrid, this.dbgPath);
    if (this.feel.lightSprite) {
      const stageItems = [this.world, this.feel.lightSprite];
      if (this.aestheticVfx) stageItems.push(this.aestheticVfx.weatherLayer);
      stageItems.push(this.feel.floaterContainer, this.floaterLayer, this.nameplates.container, this.overlay);
      this.app.stage.addChild(...stageItems);
    } else {
      this.light.blendMode = 'multiply';
      const stageItems = [this.world, this.light];
      if (this.aestheticVfx) stageItems.push(this.aestheticVfx.weatherLayer);
      stageItems.push(this.floaterLayer, this.nameplates.container, this.overlay);
      this.app.stage.addChild(...stageItems);
    }
    if (new URLSearchParams(location.search).get('art') === '1') {
      this.artPreview = new ArtPreview(atlases);
      this.app.stage.addChild(this.artPreview.layer);
    }
    this.centerOn(sim.x[0] / FP, sim.y[0] / FP);
    this.updateChunks();
    this.setQuality(this.quality);
  }

  /** 0 Low, 1 Medium, 2 High: resolution, lighting, hit-point bars and floating numbers. */
  setQuality(q: number): void {
    this.quality = Math.max(0, Math.min(2, q));
    this.vfx?.setQuality(this.quality);
    this.aestheticVfx?.setQuality(this.quality);
    const dpr = window.devicePixelRatio || 1;
    const res = [1, Math.min(dpr, 1.5), Math.min(dpr, 2)][this.quality];
    try {
      if (this.app.renderer.resolution !== res) {
        this.app.renderer.resolution = res;
        this.app.renderer.resize(window.innerWidth, window.innerHeight);
      }
    } catch {
      // a renderer that cannot change resolution keeps the old one
    }
    this.light.visible = this.quality > 0;
    this.lightKey = '';
  }

  private floater(text: string, color: number, wx: number, wy: number, now: number): void {
    if (this.floaters.length >= FLOATERS[this.quality]) return;
    const t =
      this.freeText.pop() ??
      new Text({ text, style: { fontFamily: 'Georgia, serif', fontSize: 12, fontWeight: 'bold', fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } });
    t.text = text;
    t.style.fill = color;
    t.anchor.set(0.5, 1);
    t.visible = true;
    this.floaterLayer.addChild(t);
    this.floaters.push({ t, x: wx, y: wy, born: now });
  }

  private burst(x: number, y: number, r: number, ms: number, color: number, fill: boolean, now: number, el = 0): void {
    if (this.bursts.length < 40) this.bursts.push({ x, y, born: now, r, ms, color, fill, el });
  }

  /** Screen position of a fixed-point world point. */
  pointScreen(fx: number, fy: number): [number, number] {
    const k = TILE / FP;
    return [fx * k * this.zoom - this.camX, fy * k * this.zoom - this.camY];
  }

  setBiome(biomeOrAct: BiomeWeatherType | BiomeAct | number): void {
    (this.aestheticVfx as AestheticVfxSystem | undefined)?.setBiome(biomeOrAct);
  }

  getBiome(): BiomeWeatherType {
    return (this.aestheticVfx as AestheticVfxSystem | undefined)?.getBiome() ?? 'swamp';
  }

  setWeatherEnabled(enabled: boolean): void {
    (this.aestheticVfx as AestheticVfxSystem | undefined)?.setEnabled(enabled);
  }

  isWeatherEnabled(): boolean {
    return this.aestheticVfx?.isEnabled() ?? true;
  }

  private runFx(sim: Sim, now: number): void {
    const fx = sim.cb.fx;
    this.vfx?.observeFx(sim, now);
    if (this.quality > 0) {
      const k = TILE / FP;
      for (const e of fx) {
        const tile = Math.floor(e.y / FP) * this.map.w + Math.floor(e.x / FP);
        if (!sim.visible[tile]) continue;
        const wx = e.x * k;
        const wy = e.y * k - 22;
        const sx = wx * this.zoom - this.camX;
        const sy = wy * this.zoom - this.camY;
        if (sx < -20 || sy < -20 || sx > this.viewW + 20 || sy > this.viewH + 20) continue;
        if (e.type === 0) {
          const isHero = sim.team[0] === 0 && e.x === sim.x[0] && e.y === sim.y[0];
          const isCrit = e.v >= 18 || e.el > 0;
          const floaterColor = isHero ? 0xff4444 : isCrit ? 0xffd700 : 0xf5f5f5;
          this.feel.addDamageFloater(String(e.v) + (isCrit ? '!' : ''), wx, wy, floaterColor, isCrit, isHero, now);

          // Find attack direction for directional blood & slashes
          let dirX = 1;
          let dirY = 0;
          let hitIdx = -1;
          for (let u = 0; u < sim.count; u++) {
            if (sim.cb.hp[u] > 0 && sim.cb.tgt[u] >= 0) {
              const target = sim.cb.tgt[u];
              if (sim.x[target] === e.x && sim.y[target] === e.y) {
                dirX = e.x - sim.x[u];
                dirY = e.y - sim.y[u];
                hitIdx = target;
                break;
              }
            }
          }
          const len = Math.hypot(dirX, dirY) || 1;
          dirX /= len;
          dirY /= len;
          const angle = Math.atan2(dirY, dirX);
          if (hitIdx >= 0) {
            const killed = sim.cb.hp[hitIdx] <= 0;
            const amp = (isCrit ? 6 : e.v >= 12 ? 4 : 2.5) * (killed ? 1.8 : 1);
            this.kickX[hitIdx] = dirX * amp;
            this.kickY[hitIdx] = dirY * amp * 0.6;
            this.kickAt[hitIdx] = now;
          }

          if (e.el === 0) {
            this.feel?.spawnBlood(wx, wy + 16, dirX, dirY, isCrit ? 10 : 5);
            this.feel?.spawnSlash(wx, wy + 12, angle, isCrit, isCrit ? 0xffd700 : 0xf0f0f0, isCrit ? 32 : 22);
          } else {
            this.feel?.spawnSparks(wx, wy + 12, ELEM_COLOR[e.el], isCrit ? 14 : 7, isCrit ? 120 : 80);
          }

          if (isCrit) {
            this.feel?.addTrauma(0.35);
            this.feel?.triggerHitStop(45, now);
          } else if (e.v >= 12) {
            this.feel?.addTrauma(0.18);
            this.feel?.triggerHitStop(30, now);
          } else if (isHero) {
            this.feel?.addTrauma(0.2);
          }
        }
        else if (e.type === 1) this.feel.addDamageFloater('miss', wx, wy, 0xbbbbbb, false, false, now);
        else if (e.type === 3) this.feel.addDamageFloater(`+${e.v} gold`, wx, wy, 0xffd84a, false, false, now);
        else if (e.type === 4) this.feel.addDamageFloater('no mana', wx, wy, 0x6a8cff, false, false, now);
        else if (e.type === 7 && e.v > 0) this.feel.addDamageFloater(`+${e.v}`, wx, wy, BUFF_COLOR, false, false, now);
        else if (e.type === 8 && e.v < 16) this.feel.addDamageFloater(S.statuses[e.v], wx, wy, STATUS_COLORS[e.v], false, false, now);
        else if (e.type === 11) this.feel.addDamageFloater('blocked', wx, wy, 0x70c8ff, false, false, now);
        else if (e.type === 6) this.feel.addDamageFloater(`${SKILL_NAMES[e.v]} ${e.el}`, wx, wy, 0xffd84a, false, false, now);
        else if (e.type === 5) {
          if (!this.vfx?.isApexCast(this.lastCastSid)) this.burst(e.x * k, e.y * k, (e.v / 10) * TILE, 480, ELEM_COLOR[e.el], true, now, e.el);
        } else if (e.type === 9) {
          this.lastCastSid = e.v;
          if (!this.vfx?.isApexCast(e.v)) this.burst(e.x * k, e.y * k - 8, 14, 260, ELEM_COLOR[e.el], false, now, e.el);
        } else if (e.type === 10) this.burst(e.x * k, e.y * k - 6, 22, 420, e.v === 1 ? BUFF_COLOR : ELEM_COLOR[5], e.v !== 2, now, e.v === 1 ? 0 : 5);
      }
    }
    fx.length = 0;
    this.animation?.clearedFx();
    for (let n = this.floaters.length - 1; n >= 0; n--) {
      const f = this.floaters[n];
      const age = (now - f.born) / FLOAT_MS;
      if (age >= 1) {
        this.floaterLayer.removeChild(f.t);
        f.t.visible = false;
        this.freeText.push(f.t);
        this.floaters.splice(n, 1);
        continue;
      }
      f.t.alpha = 1 - age * age;
      f.t.position.set(Math.round(f.x * this.zoom - this.camX), Math.round((f.y - age * 18) * this.zoom - this.camY));
    }
  }

  centerOn(tx: number, ty: number): void {
    this.camX = tx * TILE * this.zoom - this.viewW / 2;
    this.camY = ty * TILE * this.zoom - this.viewH / 2;
    this.clamp();
  }

  get viewW(): number {
    return this.app.renderer ? this.app.screen.width : (typeof window !== "undefined" ? window.innerWidth : 800);
  }
  get viewH(): number {
    return this.app.renderer ? this.app.screen.height : (typeof window !== "undefined" ? window.innerHeight : 600);
  }

  clamp(): void {
    const mw = this.map.w * TILE * this.zoom;
    const mh = this.map.h * TILE * this.zoom;
    this.camX = mw <= this.viewW ? -Math.floor((this.viewW - mw) / 2) : Math.max(0, Math.min(mw - this.viewW, Math.round(this.camX)));
    this.camY = mh <= this.viewH ? -Math.floor((this.viewH - mh) / 2) : Math.max(0, Math.min(mh - this.viewH, Math.round(this.camY)));
  }

  pan(dx: number, dy: number): void {
    this.camX -= dx;
    this.camY -= dy;
    this.clamp();
  }

  /** Change zoom by whole steps, keeping the world point under (sx, sy) fixed. */
  zoomBy(dir: 1 | -1, sx: number, sy: number): void {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom + dir));
    if (z === this.zoom) return;
    const wx = (sx + this.camX) / this.zoom;
    const wy = (sy + this.camY) / this.zoom;
    this.zoom = z;
    this.camX = wx * z - sx;
    this.camY = wy * z - sy;
    this.clamp();
  }

  /** F3 overlay: tile grid with blocked tiles (built once) and the A* paths of the given units (redrawn per frame). */
  setDebug(on: boolean): void {
    this.dbgGrid.visible = on;
    this.dbgPath.visible = on;
    if (!on || this.dbgBuilt) return;
    this.dbgBuilt = true;
    const g = this.dbgGrid;
    const { w, h, blocked, height } = this.map;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (blocked[i]) g.rect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2).fill({ color: 0xff3030, alpha: 0.35 });
        else if (height[i]) g.rect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2).fill({ color: 0xffffff, alpha: 0.05 * height[i] });
      }
    }
    for (let x = 0; x <= w; x++) g.moveTo(x * TILE, 0).lineTo(x * TILE, h * TILE);
    for (let y = 0; y <= h; y++) g.moveTo(0, y * TILE).lineTo(w * TILE, y * TILE);
    g.stroke({ color: 0x000000, width: 1, alpha: 0.25 });
  }

  drawDebugPaths(sim: Sim, ids: readonly number[]): void {
    const g = this.dbgPath;
    g.clear();
    const k = TILE / FP;
    for (const i of ids) {
      const pts = sim.pathOf(i);
      g.moveTo(sim.x[i] * k, sim.y[i] * k);
      if (pts) {
        for (let n = sim.wp[i]; n < pts.length / 2; n++) g.lineTo(pts[2 * n] * k, pts[2 * n + 1] * k);
      }
      g.lineTo(sim.tx[i] * k, sim.ty[i] * k);
      g.stroke({ color: 0x40ffff, width: 2, alpha: 0.8 });
      if (pts) for (let n = sim.wp[i]; n < pts.length / 2; n++) g.circle(pts[2 * n] * k, pts[2 * n + 1] * k, 3).fill(0x40ffff);
    }
  }

  /** World point in tiles for a screen point. */
  toTile(sx: number, sy: number): [number, number] {
    return [(sx + this.camX) / this.zoom / TILE, (sy + this.camY) / this.zoom / TILE];
  }

  /** Screen position of unit i using the last drawn interpolated position, or null when off-screen. */
  unitScreen(i: number): [number, number] | null {
    const s = this.sprites[i];
    if (!s.visible) return null;
    const x = s.x * this.zoom - this.camX;
    const y = (s.y - 6) * this.zoom - this.camY;
    return x < -40 || y < -40 || x > this.viewW + 40 || y > this.viewH + 40 ? null : [x, y];
  }

  unitArt(i: number) {
    const sprite = this.sprites[i];
    return sprite instanceof UnitSprite ? sprite.inspect() : null;
  }

  /** Observe each completed step, including catch-up steps that are never drawn. */
  observe(sim: Sim): void { this.animation?.observe(sim); }
  resetAnimation(sim: Sim): void { this.animation?.reset(sim); }
  animationPose(sim: Sim, id: number): AnimationPose {
    const out: AnimationPose = { clip: 'stand', frame: 0, age: 0, finished: false, unresolved: false };
    this.animation?.sample(sim, id, out);
    return out;
  }

  previewArt() { return this.artPreview?.inspect() ?? null; }

  /** On-demand snapshot only; atlas bytes estimate RGBA storage, not total GPU/process memory. */
  artMetrics() {
    const families: Record<string, number> = Object.fromEntries(UNIT_ART.map((u) => [u, 0]));
    const sources = new Set<number>();
    let artSprites = 0;
    let visibleArtSprites = 0;
    let onScreenArtSprites = 0;
    let filteredArtSprites = 0;
    let approxAtlasBytes = 0;
    for (const s of this.sprites) {
      if (!(s instanceof UnitSprite)) continue;
      artSprites++;
      families[s.atlas.unit]++;
      const info = s.inspect();
      if (info.filters || s.filters) filteredArtSprites++;
      if (s.visible) {
        visibleArtSprites++;
        const x = s.x * this.zoom - this.camX;
        const y = s.y * this.zoom - this.camY;
        if (x >= 0 && y >= 0 && x < this.viewW && y < this.viewH) onScreenArtSprites++;
      }
      const source = s.atlas.source.source;
      if (!sources.has(source.uid)) {
        sources.add(source.uid);
        approxAtlasBytes += source.pixelWidth * source.pixelHeight * 4;
      }
    }
    // Count every resident source, including families absent from this mission's
    // current units. Downloaded/decoded families still occupy GPU memory.
    for (const atlas of this.loadedAtlases) {
      const source = atlas.source.source;
      if (!sources.has(source.uid)) {
        sources.add(source.uid);
        approxAtlasBytes += source.pixelWidth * source.pixelHeight * 4;
      }
    }
    return { loadedFamilies: this.loadedAtlases.map((a) => a.unit), stress: this.artStress, totalSprites: this.sprites.length, artSprites, visibleArtSprites,
      onScreenArtSprites, families, uniqueGpuSources: sources.size, approxAtlasBytes,
      filteredArtSprites, layersPerArtSprite: 4, quality: this.quality, resolution: this.app.renderer.resolution };
  }

  /** Camera rectangle in tiles. */
  viewTiles(): { x0: number; y0: number; x1: number; y1: number } {
    const s = TILE * this.zoom;
    return { x0: this.camX / s, y0: this.camY / s, x1: (this.camX + this.viewW) / s, y1: (this.camY + this.viewH) / s };
  }

  private updateChunks(): void {
    if (!this.terrainArt) return;
    const chunk = this.chunk;
    const chunkSizePx = chunk * TILE;
    const vt = this.viewTiles();

    // Determine visible chunk range (+1 margin buffer)
    const minCx = Math.max(0, Math.floor(vt.x0 / chunk) - 1);
    const maxCx = Math.min(Math.ceil(this.map.w / chunk) - 1, Math.floor(vt.x1 / chunk) + 1);
    const minCy = Math.max(0, Math.floor(vt.y0 / chunk) - 1);
    const maxCy = Math.min(Math.ceil(this.map.h / chunk) - 1, Math.floor(vt.y1 / chunk) + 1);

    const centerCx = (vt.x0 + vt.x1) / (2 * chunk);
    const centerCy = (vt.y0 + vt.y1) / (2 * chunk);

    interface NeededChunk {
      cx: number;
      cy: number;
      key: string;
      distSq: number;
    }
    const needed: NeededChunk[] = [];

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = `${cx},${cy}`;
        const dx = cx + 0.5 - centerCx;
        const dy = cy + 0.5 - centerCy;
        needed.push({ cx, cy, key, distSq: dx * dx + dy * dy });
      }
    }

    // Prioritize chunks nearest to camera center
    needed.sort((a, b) => a.distSq - b.distSq);

    const toBake = needed.slice(0, this.MAX_CHUNKS);
    const activeKeys = new Set(toBake.map((n) => n.key));
    const seq = ++this.chunkAccessSeq;

    for (const req of toBake) {
      let item = this.chunkMap.get(req.key);
      if (item) {
        item.lastUsed = seq;
        item.sprite.visible = true;
        continue;
      }

      if (this.chunkPool.length < this.MAX_CHUNKS) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = chunkSizePx;
        const ctx = cv.getContext('2d')!;
        paintTerrainChunk(ctx, this.map, req.cx, req.cy, this.terrainArt, this.scenery, chunk);
        const tex = Texture.from(cv);
        const sprite = new Sprite(tex);
        sprite.position.set(req.cx * chunkSizePx, req.cy * chunkSizePx);
        sprite.visible = true;
        this.chunks.addChild(sprite);

        item = {
          cx: req.cx,
          cy: req.cy,
          key: req.key,
          canvas: cv,
          ctx,
          tex,
          sprite,
          lastUsed: seq,
        };
        this.chunkPool.push(item);
        this.chunkMap.set(req.key, item);
      } else {
        // Find victim: furthest item not in activeKeys
        let victim: (typeof this.chunkPool)[0] | null = null;
        let maxDist = -1;
        for (const p of this.chunkPool) {
          if (!activeKeys.has(p.key)) {
            const d = (p.cx + 0.5 - centerCx) ** 2 + (p.cy + 0.5 - centerCy) ** 2;
            if (d > maxDist) {
              maxDist = d;
              victim = p;
            }
          }
        }

        if (!victim) {
          let oldest = Infinity;
          for (const p of this.chunkPool) {
            if (!activeKeys.has(p.key) && p.lastUsed < oldest) {
              oldest = p.lastUsed;
              victim = p;
            }
          }
        }

        if (victim) {
          this.chunkMap.delete(victim.key);
          victim.cx = req.cx;
          victim.cy = req.cy;
          victim.key = req.key;
          victim.lastUsed = seq;
          victim.ctx.clearRect(0, 0, chunkSizePx, chunkSizePx);
          paintTerrainChunk(victim.ctx, this.map, req.cx, req.cy, this.terrainArt, this.scenery, chunk);
          victim.tex.source.update();
          victim.sprite.position.set(req.cx * chunkSizePx, req.cy * chunkSizePx);
          victim.sprite.visible = true;
          this.chunkMap.set(req.key, victim);
        }
      }
    }

    // Hide pool items that are not in active set
    for (const p of this.chunkPool) {
      if (!activeKeys.has(p.key)) {
        p.sprite.visible = false;
      }
    }
  }

  private updateFog(sim: Sim): void {
    if (sim.fogVersion === this.fogSeen) return;
    this.fogSeen = sim.fogVersion;
    const buf32 = this.fogBuf32;
    const vis = sim.visible;
    const exp = sim.explored;
    const len = this.map.w * this.map.h;
    for (let i = 0; i < len; i++) {
      buf32[i] = vis[i] ? 0x000c0608 : exp[i] ? 0x820c0608 : 0xf50c0608;
    }
    this.fogCv.getContext('2d')!.putImageData(this.fogImg, 0, 0);
    this.fogTex.source.update();
  }

  /** Day and night: one full-screen multiply layer, white at noon and blue-grey at night. */
  private updateLight(daylight: number): void {
    const t = Math.max(0, Math.min(1, (255 - daylight) / 180));
    const key = `${t.toFixed(3)}:${this.viewW}x${this.viewH}`;
    if (key === this.lightKey) return;
    this.lightKey = key;
    const c = NIGHT.map((n) => Math.round(255 + (n - 255) * t));
    this.light.clear().rect(0, 0, this.viewW, this.viewH).fill((c[0] << 16) | (c[1] << 8) | c[2]);
  }

  private drawHeroGearOverlays(
    sim: Sim,
    heroIdx: number,
    s: Sprite | UnitSprite,
    smoothAngle: number,
    now: number,
    isAttacking: boolean,
    attackProgress: number
  ): void {
    const g = this.heroGearGraphics;
    if (!s.visible || sim.cb.hp[heroIdx] <= 0) return;

    const hero = sim.hero;
    const weaponId = hero ? hero.eq[Slot.Weapon] : -1;
    const shieldId = hero ? hero.eq[Slot.Shield] : -1;
    const weaponDef = weaponId >= 0 ? getItemDef(weaponId) : undefined;
    const shieldDef = shieldId >= 0 ? getItemDef(shieldId) : undefined;
    const weaponKind = classifyHeroWeapon(weaponDef);

    const hx = s.x;
    const hy = s.y;
    const scale = s.scale.x;

    // 1. SHIELD OVERLAY (Off hand: left hand relative to forward facing angle)
    if (shieldId >= 0 || shieldDef) {
      const shieldAng = smoothAngle - 0.75;
      const sx = hx + Math.cos(shieldAng) * (11 * scale);
      const sy = hy - (13 * scale) + Math.sin(shieldAng) * (5 * scale);
      const pulseGlint = 0.8 + 0.2 * Math.sin(now * 0.005);

      // Heater Shield body
      g.moveTo(sx - 5 * scale, sy - 8 * scale)
        .lineTo(sx + 5 * scale, sy - 8 * scale)
        .lineTo(sx + 4 * scale, sy + 3 * scale)
        .lineTo(sx, sy + 9 * scale)
        .lineTo(sx - 4 * scale, sy + 3 * scale)
        .closePath()
        .fill(0x1e3a8a)
        .stroke({ color: 0xced4da, width: 1.5 * scale, alpha: 0.95 });

      // Golden heraldic boss / cross
      g.moveTo(sx, sy - 6 * scale).lineTo(sx, sy + 5 * scale).stroke({ color: 0xf59e0b, width: 1.4 * scale });
      g.moveTo(sx - 3 * scale, sy - 2 * scale).lineTo(sx + 3 * scale, sy - 2 * scale).stroke({ color: 0xf59e0b, width: 1.4 * scale });
      g.circle(sx, sy - 2 * scale, 1.4 * scale).fill(0xfef08a);

      // Specular gleam on steel rim
      g.moveTo(sx - 4 * scale, sy - 8 * scale).lineTo(sx - 1 * scale, sy - 8 * scale).stroke({ color: 0xffffff, width: 1.6 * scale, alpha: pulseGlint });
    }

    // 2. WEAPON OVERLAY (Main hand: right hand relative to facing angle)
    const weaponAng = isAttacking ? smoothAngle + (attackProgress - 0.5) * 1.8 : smoothAngle + 0.45;
    const handX = hx + Math.cos(weaponAng) * (7 * scale);
    const handY = hy - (14 * scale) + Math.sin(weaponAng) * (4 * scale);

    if (weaponKind === 'sword') {
      const tipX = handX + Math.cos(weaponAng) * (20 * scale);
      const tipY = handY + Math.sin(weaponAng) * (20 * scale);
      const guardNorm = weaponAng + Math.PI / 2;
      const gx1 = handX + Math.cos(guardNorm) * (3.5 * scale);
      const gy1 = handY + Math.sin(guardNorm) * (3.5 * scale);
      const gx2 = handX - Math.cos(guardNorm) * (3.5 * scale);
      const gy2 = handY - Math.sin(guardNorm) * (3.5 * scale);

      // Steel blade
      g.moveTo(handX, handY).lineTo(tipX, tipY).stroke({ color: 0xdbeafe, width: 2.2 * scale, alpha: 0.95 });
      g.moveTo(handX, handY).lineTo(tipX, tipY).stroke({ color: 0xffffff, width: 1.0 * scale, alpha: 1.0 });

      // Crossguard & pommel
      g.moveTo(gx1, gy1).lineTo(gx2, gy2).stroke({ color: 0xf59e0b, width: 1.5 * scale });
      const pomX = handX - Math.cos(weaponAng) * (3 * scale);
      const pomY = handY - Math.sin(weaponAng) * (3 * scale);
      g.circle(pomX, pomY, 1.3 * scale).fill(0xd97706);

      // Specular blade glint
      drawGlint(g, tipX, tipY, sim.tick, 77);

    } else if (weaponKind === 'axe') {
      const haftTipX = handX + Math.cos(weaponAng) * (18 * scale);
      const haftTipY = handY + Math.sin(weaponAng) * (18 * scale);
      // Wooden haft
      g.moveTo(handX, handY).lineTo(haftTipX, haftTipY).stroke({ color: 0x78350f, width: 2.0 * scale });

      // Bearded crescent iron blade
      const headNorm = weaponAng + Math.PI / 2;
      const b1X = haftTipX - Math.cos(weaponAng) * (3 * scale);
      const b1Y = haftTipY - Math.sin(weaponAng) * (3 * scale);
      const bTipX = b1X + Math.cos(headNorm) * (7 * scale);
      const bTipY = b1Y + Math.sin(headNorm) * (7 * scale);
      const bBeardX = bTipX - Math.cos(weaponAng) * (6 * scale);
      const bBeardY = bTipY - Math.sin(weaponAng) * (6 * scale);

      g.moveTo(b1X, b1Y)
        .lineTo(bTipX, bTipY)
        .lineTo(bBeardX, bBeardY)
        .lineTo(handX + Math.cos(weaponAng) * (8 * scale), handY + Math.sin(weaponAng) * (8 * scale))
        .closePath()
        .fill(0x64748b)
        .stroke({ color: 0xf1f5f9, width: 1.2 * scale });

      // Bronze rivet boss
      g.circle(b1X, b1Y, 1.4 * scale).fill(0xd97706);

    } else if (weaponKind === 'staff') {
      const staffBaseX = handX - Math.cos(weaponAng) * (10 * scale);
      const staffBaseY = handY - Math.sin(weaponAng) * (10 * scale);
      const staffTipX = handX + Math.cos(weaponAng) * (26 * scale);
      const staffTipY = handY + Math.sin(weaponAng) * (26 * scale);

      // Carved mahogany shaft
      g.moveTo(staffBaseX, staffBaseY).lineTo(staffTipX, staffTipY).stroke({ color: 0x5c3a21, width: 2.2 * scale });

      // Ornate finial & glowing crystal head
      const crystalPulse = 0.8 + 0.2 * Math.sin(now * 0.008);
      g.circle(staffTipX, staffTipY, 3.8 * scale * crystalPulse).fill({ color: 0x38bdf8, alpha: 0.85 });
      g.circle(staffTipX, staffTipY, 2.0 * scale).fill(0xffffff);

      // Orbiting arcane spark motes
      const sparkAng = now * 0.005;
      const sp1X = staffTipX + Math.cos(sparkAng) * (6 * scale);
      const sp1Y = staffTipY + Math.sin(sparkAng) * (4 * scale);
      g.circle(sp1X, sp1Y, 1.2 * scale).fill({ color: 0xbae6fd, alpha: 0.95 });

    } else if (weaponKind === 'bow') {
      const bTip1X = handX + Math.cos(weaponAng + 1.1) * (14 * scale);
      const bTip1Y = handY + Math.sin(weaponAng + 1.1) * (14 * scale);
      const bTip2X = handX + Math.cos(weaponAng - 1.1) * (14 * scale);
      const bTip2Y = handY + Math.sin(weaponAng - 1.1) * (14 * scale);

      // Recurve limbs
      g.moveTo(bTip1X, bTip1Y).lineTo(handX, handY).lineTo(bTip2X, bTip2Y).stroke({ color: 0x92400e, width: 2.2 * scale });
      // Silver bowstring
      g.moveTo(bTip1X, bTip1Y).lineTo(bTip2X, bTip2Y).stroke({ color: 0xf8fafc, width: 0.9 * scale, alpha: 0.85 });

      if (isAttacking) {
        // Notched bodkin arrow pointing along weaponAng
        const arrTipX = handX + Math.cos(weaponAng) * (18 * scale);
        const arrTipY = handY + Math.sin(weaponAng) * (18 * scale);
        g.moveTo(handX - Math.cos(weaponAng) * (4 * scale), handY - Math.sin(weaponAng) * (4 * scale))
          .lineTo(arrTipX, arrTipY)
          .stroke({ color: 0xd97706, width: 1.2 * scale });
        g.circle(arrTipX, arrTipY, 1.4 * scale).fill(0xffffff);
      }
    }
  }

  draw(sim: Sim, px: Int32Array, py: Int32Array, alpha: number, v: View): void {
    this.artPreview?.draw(sim.tick);
    const now = performance.now();
    const dtMs = this.lastDrawNow > 0 ? Math.min(100, now - this.lastDrawNow) : 16;
    this.lastDrawNow = now;
    this.runFx(sim, now);
    const [rx, ry] = this.vfx?.rumbleOffset() ?? [0, 0];
    this.feel?.update(dtMs / 1000, now, this.camX, this.camY, this.zoom);
    this.world.scale.set(this.zoom);
    this.world.position.set(-this.camX + rx + (this.feel?.shakeX ?? 0), -this.camY + ry + (this.feel?.shakeY ?? 0));
    this.updateChunks();
    if (this.quality > 0 || (this.fogTick++ & 1) === 0) this.updateFog(sim);
    const k = TILE / FP;
    this.feel?.renderAuras(sim, now, k);
    if (this.quality > 0 && this.feel?.lightSprite) {
      const heroX = (sim.hero ? sim.x[sim.hero.id] : sim.x[0]) * k;
      const heroY = (sim.hero ? sim.y[sim.hero.id] : sim.y[0]) * k;
      const extraLights: Array<{ x: number; y: number; r: number }> = [];
      for (let n = 0; n < sim.shrines.length; n++) {
        if (sim.shrineCd[n] === 0) {
          extraLights.push({ x: (sim.shrines[n].x + 0.5) * TILE, y: (sim.shrines[n].y + 0.5) * TILE, r: 75 * this.zoom });
        }
      }
      if (sim.towns?.length) {
        for (const town of sim.towns) {
          for (const c of town.centre) {
            if (c) extraLights.push({ x: c[0] * TILE, y: (c[1] + 0.6) * TILE, r: 120 * this.zoom });
          }
        }
      }
      this.feel.renderLighting(this.viewW, this.viewH, heroX, heroY, this.camX, this.camY, this.zoom, sim.daylight, now, extraLights);
    } else {
      this.updateLight(sim.daylight);
    }
    this.vfx?.updateAndDraw(sim, now, dtMs, this.zoom, this.camX, this.camY, this.overlay, this.viewW, this.viewH);
    (this.aestheticVfx as AestheticVfxSystem | undefined)?.updateAndDraw(now, dtMs, this.camX, this.camY, this.zoom, this.viewW, this.viewH);
    const mw = this.map.w;
    const cb = sim.cb;
    const z = this.zoom;
    const r = this.rings;
    r.clear();
    const frame8 = (sim.tick >> 2) & 7;

    // Micro-animation: Shoreline water foam 8-frame ripple loop
    const vt = this.viewTiles();
    const minTx = Math.max(0, Math.floor(vt.x0));
    const maxTx = Math.min(mw - 1, Math.ceil(vt.x1));
    const minTy = Math.max(0, Math.floor(vt.y0));
    const maxTy = Math.min(this.map.h - 1, Math.ceil(vt.y1));
    const foamPhase = frame8 / 8;
    const foamDist = foamPhase * 4;
    const foamAlpha = (1 - foamPhase) * 0.55;

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const idx = ty * mw + tx;
        if (this.map.terrain[idx] !== Terrain.Water) continue;
        if (!sim.explored[idx]) continue;
        const px = tx * TILE;
        const py = ty * TILE;
        if (ty > 0 && this.map.terrain[(ty - 1) * mw + tx] !== Terrain.Water) {
          r.ellipse(px + 16, py + foamDist + 1, 14, 1.5).fill({ color: 0xebf8ff, alpha: foamAlpha });
        }
        if (tx > 0 && this.map.terrain[ty * mw + tx - 1] !== Terrain.Water) {
          r.ellipse(px + foamDist + 1, py + 16, 1.5, 14).fill({ color: 0xebf8ff, alpha: foamAlpha });
        }
      }
    }

    // Loot sacks under the units, only on ground the player has seen.
    for (let n = 0; n < cb.sG.length; n++) {
      if (!cb.sG[n]) continue;
      if (!sim.explored[Math.floor(cb.sY[n] / FP) * mw + Math.floor(cb.sX[n] / FP)]) continue;
      const sx = cb.sX[n] * k;
      const sy = cb.sY[n] * k;
      r.ellipse(sx, sy + 2, 7, 3).fill({ color: 0x000000, alpha: 0.35 });
      r.circle(sx, sy - 3, 6).fill(0xa8803c).stroke({ color: 0x4a3414, width: 1 });
      r.rect(sx - 2, sy - 10, 4, 3).fill(0xe0c060);
      drawGlint(r, sx, sy - 8, sim.tick, n);
    }
    // Item bags: a satchel with colored clasp and vertical light beam for higher rarities (D2 loot pillar).
    for (let n = 0; n < cb.bI.length; n++) {
      if (!cb.bI[n]) continue;
      if (!sim.explored[Math.floor(cb.bY[n] / FP) * mw + Math.floor(cb.bX[n] / FP)]) continue;
      const bx = cb.bX[n] * k;
      const by = cb.bY[n] * k;
      const itemId = cb.bI[n] - 1;
      const item = getItemDef(itemId);
      const rarity = item ? itemRarity(item) : 'normal';
      const beam = LOOT_BEAM_COLORS[rarity];

      r.ellipse(bx, by + 2, 7, 3).fill({ color: 0x000000, alpha: 0.35 });
      if (beam) {
        const h = beam.height;
        const pulse = 0.85 + 0.15 * Math.sin(sim.tick * 0.15 + n);
        // Outer light beam pillar
        r.moveTo(bx - 3.5, by - 6)
          .lineTo(bx - 1, by - 6 - h)
          .lineTo(bx + 1, by - 6 - h)
          .lineTo(bx + 3.5, by - 6)
          .closePath()
          .fill({ color: beam.outer, alpha: 0.3 * pulse });
        // Incandescent inner core
        r.moveTo(bx - 1.5, by - 6)
          .lineTo(bx - 0.5, by - 6 - h)
          .lineTo(bx + 0.5, by - 6 - h)
          .lineTo(bx + 1.5, by - 6)
          .closePath()
          .fill({ color: beam.inner, alpha: 0.65 * pulse });
        // Pulsing ground light aura
        r.ellipse(bx, by + 2, 9 * pulse, 4.5 * pulse).stroke({ color: beam.outer, width: 1.5, alpha: 0.7 * pulse });
        // Satchel body tinted by rarity
        r.roundRect(bx - 6, by - 9, 12, 10, 3).fill(0x283850).stroke({ color: beam.outer, width: 1.5, alpha: 0.9 });
        r.rect(bx - 2, by - 6, 4, 3).fill(beam.inner);
      } else {
        // Standard normal satchel
        r.roundRect(bx - 6, by - 9, 12, 10, 3).fill(0x3c5a8c).stroke({ color: 0x1a2a48, width: 1 });
        r.rect(bx - 2, by - 6, 4, 3).fill(0xd8e4f4);
      }
      drawGlint(r, bx, by - 12, sim.tick, n + 50);
    }
    // Interactive world shrines: carved pedestal with a glowing crystal when ready (8-frame micro-animation).
    for (let n = 0; n < sim.shrines.length; n++) {
      const shDef = sim.shrines[n];
      if (!sim.explored[shDef.y * mw + shDef.x]) continue;
      const sx = (shDef.x + 0.5) * TILE;
      const sy = (shDef.y + 0.5) * TILE;
      const ready = sim.shrineCd[n] === 0;
      const col = SHRINE_COLORS[shDef.kind] ?? 0xf0d060;
      r.ellipse(sx, sy + 4, 10, 5).fill({ color: 0x000000, alpha: 0.4 });
      r.roundRect(sx - 6, sy - 6, 12, 11, 2).fill(0x524c44).stroke({ color: 0x2a2520, width: 1 });
      if (ready) {
        const bob = Math.sin((frame8 / 8) * Math.PI * 2) * 2;
        const crystalY = sy - 10 + bob;
        const auraR = 8 + Math.sin((frame8 / 8) * Math.PI * 2) * 1.5;
        r.ellipse(sx, crystalY + 1, auraR, auraR * 0.5).stroke({ color: col, width: 1.5, alpha: 0.65 });
        r.moveTo(sx, crystalY - 7)
          .lineTo(sx + 4, crystalY)
          .lineTo(sx, crystalY + 6)
          .lineTo(sx - 4, crystalY)
          .closePath()
          .fill(col)
          .stroke({ color: 0xffffff, width: 1, alpha: 0.85 });
        drawGlint(r, sx, crystalY - 7, sim.tick, n + 100);
      } else {
        r.circle(sx, sy - 8, 3).fill({ color: 0x3b3834, alpha: 0.85 });
      }
    }
    // Destructible Props & Specular glints over scenery
    for (let oIdx = 0; oIdx < this.map.objects.length; oIdx++) {
      const obj = this.map.objects[oIdx];
      if (obj.kind === ObjectKind.House) continue;
      if (obj.x < minTx || obj.x > maxTx || obj.y < minTy || obj.y > maxTy) continue;
      const ox = (obj.x + 0.5) * TILE;
      const oy = (obj.y + 0.5) * TILE;
      if (!sim.explored[obj.y * mw + obj.x]) continue;

      if (obj.kind === PropKind.Barrel) {
        if (obj.destroyed) {
          r.ellipse(ox, oy + 2, 7, 3.5).fill({ color: 0x3d200e, alpha: 0.65 });
          r.moveTo(ox - 5, oy).lineTo(ox + 4, oy + 3).stroke({ color: 0x784824, width: 1.5 });
          r.moveTo(ox - 3, oy + 3).lineTo(ox + 5, oy - 1).stroke({ color: 0x5a3418, width: 1.5 });
          r.circle(ox - 2, oy + 1, 1).fill(0x3a3a3a);
        } else {
          r.ellipse(ox, oy + 3, 7, 3).fill({ color: 0x000000, alpha: 0.45 });
          r.roundRect(ox - 6, oy - 11, 12, 13, 2).fill(0x784824).stroke({ color: 0x3d200e, width: 1.2 });
          r.rect(ox - 6, oy - 8, 12, 1.8).fill(0x404448);
          r.rect(ox - 6, oy - 2, 12, 1.8).fill(0x404448);
          r.ellipse(ox, oy - 11, 5, 2).fill(0x945a2e).stroke({ color: 0x3d200e, width: 0.8 });
          drawGlint(r, ox - 2, oy - 10, sim.tick, oIdx + 200);
        }
      } else if (obj.kind === PropKind.Urn) {
        if (obj.destroyed) {
          r.ellipse(ox, oy + 2, 6, 3).fill({ color: 0x4a1e10, alpha: 0.65 });
          r.moveTo(ox - 4, oy).lineTo(ox - 1, oy + 2).lineTo(ox - 3, oy + 4).closePath().fill(0xb55a30);
          r.moveTo(ox + 2, oy - 1).lineTo(ox + 5, oy + 1).lineTo(ox + 2, oy + 3).closePath().fill(0x9e4822);
        } else {
          r.ellipse(ox, oy + 3, 5, 2.5).fill({ color: 0x000000, alpha: 0.45 });
          r.ellipse(ox, oy - 5, 5.5, 6.5).fill(0xb55a30).stroke({ color: 0x5a2410, width: 1.2 });
          r.rect(ox - 2.5, oy - 12, 5, 3.5).fill(0xc86838);
          r.ellipse(ox, oy - 12, 3.5, 1.5).fill(0xe07844).stroke({ color: 0x5a2410, width: 0.8 });
          r.rect(ox - 5, oy - 6, 10, 1.5).fill(0x3880a8);
          drawGlint(r, ox, oy - 8, sim.tick, oIdx + 200);
        }
      } else if (obj.kind === PropKind.Sarcophagus) {
        if (obj.destroyed) {
          r.ellipse(ox, oy + 3, 10, 5).fill({ color: 0x000000, alpha: 0.45 });
          r.roundRect(ox - 9, oy - 12, 18, 14, 2).fill(0x383a3d).stroke({ color: 0x1a1c1e, width: 1.4 });
          r.moveTo(ox - 6, oy - 10).lineTo(ox, oy - 4).lineTo(ox + 6, oy - 7).stroke({ color: 0x141517, width: 1.5 });
        } else {
          r.ellipse(ox, oy + 4, 11, 5).fill({ color: 0x000000, alpha: 0.5 });
          r.roundRect(ox - 9, oy - 14, 18, 16, 2.5).fill(0x565b60).stroke({ color: 0x24282c, width: 1.4 });
          r.roundRect(ox - 7, oy - 13, 14, 14, 1.5).fill(0x6e747a).stroke({ color: 0x383c40, width: 0.8 });
          r.moveTo(ox, oy - 12).lineTo(ox, oy - 2).stroke({ color: 0xc49a3c, width: 1.8 });
          r.moveTo(ox - 4, oy - 9).lineTo(ox + 4, oy - 9).stroke({ color: 0xc49a3c, width: 1.8 });
          drawGlint(r, ox + 1, oy - 9, sim.tick, oIdx + 200);
        }
      } else {
        drawGlint(r, ox, oy - 10, sim.tick, oIdx + 200);
      }
    }
    // Micro-animation: Torch flame flicker on living hero
    if (sim.hero && cb.hp[sim.hero.id] > 0) {
      const hx = sim.x[sim.hero.id] * k;
      const hy = sim.y[sim.hero.id] * k;
      const flameH = 5 + (frame8 % 4) * 0.8;
      const flameW = 2.5 + ((frame8 + 1) % 3) * 0.5;
      r.ellipse(hx + 4, hy - 18, flameW, flameH * 0.5).fill({ color: 0xff7700, alpha: 0.85 });
      r.ellipse(hx + 4, hy - 17, flameW * 0.55, flameH * 0.35).fill({ color: 0xffea00, alpha: 0.95 });
    }
    // Bodies stay for a minute so a corpse spell has something to aim at; they sink into the ground at the end.
    for (let i = 0; i < sim.count; i++) {
      if (cb.hp[i] > 0 || cb.corp[i] <= 0) continue;
      const body = this.sprites[i];
      if (body instanceof UnitSprite && body.atlas.hasClip('die')) continue;
      const tile = Math.floor(sim.y[i] / FP) * mw + Math.floor(sim.x[i] / FP);
      if (!sim.explored[tile]) continue;
      const cx = sim.x[i] * k;
      const cy = sim.y[i] * k;
      const a = Math.min(1, cb.corp[i] / 200);
      r.ellipse(cx, cy + 1, 9, 4).fill({ color: 0x3a1a14, alpha: 0.7 * a });
      // Plain sprites topple over their own pool (see below); only clip-less atlases fall back to the bone mark.
      if (body instanceof UnitSprite) r.moveTo(cx - 5, cy - 2).lineTo(cx + 5, cy + 3).moveTo(cx + 5, cy - 2).lineTo(cx - 5, cy + 3).stroke({ color: 0xd8cdb0, width: 2, alpha: a });
    }
    this.deathAt ??= [];
    this.unitAngles ??= new Float32Array(sim.count);
    this.wasAlive ??= [];
    this.heroGearGraphics ??= new Graphics();
    this.dustGraphics ??= new Graphics();
    this.swingTrailGraphics ??= new Graphics();
    this.dustPuffs ??= [];
    this.swingTrails ??= [];

    // Ensure angle smoothing and life-tracking arrays are sized for current unit count
    if (this.unitAngles.length < sim.count) {
      const nextAngles = new Float32Array(sim.count);
      nextAngles.set(this.unitAngles);
      for (let i = this.unitAngles.length; i < sim.count; i++) {
        nextAngles[i] = (sim.dir[i] * 2 * Math.PI) / 16;
      }
      this.unitAngles = nextAngles;
    }
    while (this.wasAlive.length < sim.count) {
      this.wasAlive.push(cb.hp[this.wasAlive.length] > 0);
    }
    this.heroGearGraphics.clear();

    for (let i = 0; i < sim.count; i++) {
      const s = this.sprites[i];
      const dead = cb.hp[i] <= 0;

      // Track unit death for visceral gore & bone debris spawning
      if (this.wasAlive[i] && dead) {
        const isElite = (cb.bossMods[i]?.length ?? 0) > 0 || (cb.family[i] ? !!bossSpriteDef(cb.family[i]) : false);
        const isUndead = cb.family[i] === 'hollow-knight' || cb.family[i] === 'restless-dead';
        this.feel?.spawnDeathGore(s.x, s.y, isElite, isUndead);
      }
      this.wasAlive[i] = !dead;

      if (sim.hidden[i] || (dead && (cb.corp[i] <= 0 || (s instanceof UnitSprite && !s.atlas.hasClip('die'))))) {
        s.visible = false;
        continue;
      }
      let statusTint = 0;
      const mask = cb.stMask[i];
      if (mask & (1 << St.Stone)) statusTint = 0x8a8a8a;
      else if (mask & (1 << St.Poison)) statusTint = 0x2ecc71;
      else if (mask & (1 << St.Slow)) statusTint = 0x60c0ff;
      else if (mask & (1 << St.Burn)) statusTint = 0xff7722;

      if (s instanceof Sprite) {
        const want = dead ? DEAD_TINT : statusTint > 0 ? statusTint : this.baseTint[i];
        if (s.tint !== want) s.tint = want;
        // Death fallback for sprites without a die clip: topple sideways with a short ease-out.
        if (dead) {
          const diedAt = (this.deathAt[i] ??= now);
          const t = Math.min(1, (now - diedAt) / TOPPLE_MS);
          const fall = 1 - (1 - t) * (1 - t);
          s.rotation = (i & 1 ? 1 : -1) * (Math.PI / 2) * fall;
        } else if (s.rotation !== 0 || this.deathAt[i] !== undefined) {
          s.rotation = 0;
          this.deathAt[i] = undefined;
        }
      }
      s.x = Math.round((px[i] + (sim.x[i] - px[i]) * alpha) * k);
      s.y = Math.round((py[i] + (sim.y[i] - py[i]) * alpha) * k);
      const kickT = (now - (this.kickAt?.[i] ?? -1e9)) / KICK_MS;
      if (kickT >= 0 && kickT < 1) {
        // Fast shove out (first fifth), slower ease back.
        const f = kickT < 0.2 ? kickT / 0.2 : 1 - (kickT - 0.2) / 0.8;
        const ease = f * f * (3 - 2 * f);
        s.x += Math.round(this.kickX[i] * ease);
        s.y += Math.round(this.kickY[i] * ease);
      }
      const sx = s.x * z - this.camX;
      const sy = s.y * z - this.camY;
      const onScreen = sx > -40 && sy > -40 && sx < this.viewW + 40 && sy < this.viewH + 40;
      const tile = Math.floor(sim.y[i] / FP) * mw + Math.floor(sim.x[i] / FP);
      s.visible = onScreen && (dead ? !!sim.explored[tile] : sim.team[i] === 0 || sim.visible[tile] === 1);
      s.alpha = dead ? Math.min(1, cb.corp[i] / 200) : 1;

      // Smooth 16-direction angle interpolation without snapping
      const targetAngle = (sim.dir[i] * 2 * Math.PI) / 16;
      let curAngle = this.unitAngles[i] ?? targetAngle;
      let diff = targetAngle - curAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      curAngle += diff * 0.28;
      while (curAngle < 0) curAngle += Math.PI * 2;
      while (curAngle >= Math.PI * 2) curAngle -= Math.PI * 2;
      this.unitAngles[i] = curAngle;
      const smoothDir = ((Math.round((curAngle / (Math.PI * 2)) * 16) % 16) + 16) % 16;

      // Dynamic footstep dust particles spawned behind moving units
      if (s.visible && !dead && sim.moving[i] && (sim.tick + i * 5) % 5 === 0) {
        this.dustPuffs.push({
          x: s.x - Math.cos(curAngle) * 7 + (Math.random() - 0.5) * 4,
          y: s.y - Math.sin(curAngle) * 4 + (Math.random() - 0.5) * 3,
          vx: -Math.cos(curAngle) * 0.35 + (Math.random() - 0.5) * 0.2,
          vy: -Math.sin(curAngle) * 0.2 - 0.1,
          size: 2.5 + Math.random() * 2.5,
          alpha: 0.5,
          born: now,
          lifeMs: 360,
          color: 0x8a7b68,
        });
      }

      if (s.visible && s instanceof UnitSprite) {
        const isHero = sim.hero?.id === i || sim.cb.kind[i] === Kind.Hero;
        const weaponId = isHero && sim.hero ? sim.hero.eq[Slot.Weapon] : -1;
        const armorId = isHero && sim.hero ? sim.hero.eq[Slot.Armor] : -1;
        const weaponDef = weaponId >= 0 ? getItemDef(weaponId) : undefined;
        const armorDef = armorId >= 0 ? getItemDef(armorId) : undefined;
        const weaponVisual = isHero ? getHeroWeaponVisual(weaponDef) : 'sword';
        const armorTier = isHero ? getHeroArmorVisualTier(armorDef) : 1;
        this.animation?.sample(sim, i, this.pose);
        const stone = !!(mask & (1 << St.Stone));
        s.update(sim.tick, !!sim.moving[i], smoothDir, sim.team[i], armorTier, sim.cb.tier[i] || 1, stone, this.pose, statusTint, isHero, weaponVisual);
        if (!stone && statusTint === 0) {
          // Preserve unmasked full-RGB details on layer 0 and apply distinct family / hero color harmony
          const ch = s.layers;
          if (ch[0]) ch[0].tint = 0xffffff;
          if (isHero && sim.team[i] === 0) {
            // Heroic dark fantasy: deep heraldic mantle, authentic shaded armor (never flat white), golden accents
            ch[1].tint = 0x2563eb;
            ch[2].tint = HERO_ARMOUR_TINTS[Math.min(HERO_ARMOUR_TINTS.length - 1, Math.max(0, armorTier))] ?? 0x71797e;
            ch[3].tint = weaponVisual === 'staff' ? 0x70d8ff : weaponVisual === 'bow' ? 0x9be368 : 0xffd23d;
          } else {
            const famId = cb.family[i];
            const famVis = famId ? FAMILY_VISUALS[famId] : undefined;
            if (famVis && ch.length >= 4) {
              ch[1].tint = famVis.tints[0];
              ch[2].tint = famVis.tints[1];
              ch[3].tint = famVis.tints[2];
            }
          }
        }

        // Weapon swing arc trail (glowing motion slash trail) during attack animations
        if (!dead && this.pose.clip === 'attack' && this.pose.frame >= 1 && this.pose.frame <= 3 && (sim.tick & 1) === 0) {
          const swingCol = isHero ? 0x93c5fd : 0xf87171;
          const swingRadius = (isHero ? 22 : 16) * s.scale.x;
          this.swingTrails.push({
            x: s.x,
            y: s.y - 12 * s.scale.y,
            angle: curAngle,
            radius: swingRadius,
            color: swingCol,
            born: now,
            lifeMs: 160,
          });
        }

        // Render weapon & shield visual overlays based on hero's equipped items
        if (isHero && !dead) {
          const isAttacking = this.pose.clip === 'attack';
          const attackProgress = isAttacking ? this.pose.frame / 3 : 0;
          this.drawHeroGearOverlays(sim, i, s, curAngle, now, isAttacking, attackProgress);
        }
      }
      if (s.visible && !dead && (sim.tick & 3) === 0) {
        if (mask & (1 << St.Poison)) this.feel?.spawnPoisonBubbles(s.x, s.y - 14, 1);
        else if (mask & (1 << St.Burn)) this.feel?.spawnBurnEmbers(s.x, s.y - 12, 1);
      }
    }

    // Render footstep dust particles
    const dg = this.dustGraphics;
    dg.clear();
    for (let pIdx = this.dustPuffs.length - 1; pIdx >= 0; pIdx--) {
      const p = this.dustPuffs[pIdx];
      const age = now - p.born;
      if (age >= p.lifeMs) {
        this.dustPuffs.splice(pIdx, 1);
        continue;
      }
      const progress = age / p.lifeMs;
      p.x += p.vx;
      p.y += p.vy;
      const curSize = p.size * (1 + progress * 0.8);
      const curAlpha = p.alpha * (1 - progress);
      dg.ellipse(p.x, p.y, curSize, curSize * 0.6).fill({ color: p.color, alpha: curAlpha });
    }

    // Render weapon swing arc trails (additive blended slash ribbon)
    const stg = this.swingTrailGraphics;
    stg.clear();
    for (let tIdx = this.swingTrails.length - 1; tIdx >= 0; tIdx--) {
      const st = this.swingTrails[tIdx];
      const age = now - st.born;
      if (age >= st.lifeMs) {
        this.swingTrails.splice(tIdx, 1);
        continue;
      }
      const progress = age / st.lifeMs;
      const arcAlpha = (1 - progress) * 0.85;
      const startA = st.angle - 1.2 + progress * 0.4;
      const endA = st.angle + 1.2;
      const rad = st.radius;
      stg.arc(st.x, st.y, rad, startA, endA)
        .stroke({ color: st.color, width: 2.5 * (1 - progress * 0.5), alpha: arcAlpha });
      stg.arc(st.x, st.y, rad * 0.85, startA + 0.2, endA - 0.2)
        .stroke({ color: 0xffffff, width: 1.2 * (1 - progress), alpha: arcAlpha * 0.9 });
    }
    const sh = this.shots;
    sh.clear();

    // Medieval Town Hub Architecture: cobblestone plaza, warm window & torch light spills, banners and props
    if (sim.towns?.length) {
      for (const town of sim.towns) {
        let sumX = 0;
        let sumY = 0;
        let countB = 0;
        for (let role = 0; role < town.centre.length; role++) {
          const c = town.centre[role];
          if (!c) continue;
          const tileIdx = Math.min(this.map.h - 1, Math.max(0, Math.floor(c[1]))) * mw + Math.min(mw - 1, Math.max(0, Math.floor(c[0])));
          if (!sim.explored[tileIdx]) continue;
          const bx = c[0] * TILE;
          const by = c[1] * TILE;
          sumX += bx;
          sumY += by + TILE;
          countB++;

          // Dressed stone courtyard apron under and in front of the building
          r.roundRect(bx - 42, by - 26, 84, 72, 8)
            .fill({ color: 0x585248, alpha: 0.42 })
            .stroke({ color: 0x8e8474, width: 1.5, alpha: 0.55 });
          r.roundRect(bx - 36, by - 20, 72, 60, 6).stroke({ color: 0x38322a, width: 1, alpha: 0.45 });

          // Warm golden window & doorway light spill on courtyard stones
          const flicker = 0.85 + 0.15 * Math.sin(sim.tick * 0.18 + role * 2.1);
          const glowCol = role === 0 ? 0xffaa38 : role === 1 ? 0xff6820 : 0x58c8ff;
          r.ellipse(bx, by + 28, 26 * flicker, 12 * flicker).fill({ color: glowCol, alpha: 0.22 * flicker });
          r.ellipse(bx, by + 26, 15 * flicker, 7 * flicker).fill({ color: 0xffe898, alpha: 0.28 * flicker });

          // Flickering entrance torch posts flanking the building doorway
          for (const side of [-1, 1]) {
            const tx = bx + side * 28;
            const ty = by + 22;
            sh.rect(tx - 1.5, ty - 10, 3, 10).fill(0x3a2818);
            const fh = 4.5 + ((frame8 + (side > 0 ? 2 : 0)) % 3) * 0.9;
            sh.ellipse(tx, ty - 12, 3, fh * 0.6).fill({ color: role === 2 ? 0x48d8ff : 0xff7818, alpha: 0.9 });
            sh.circle(tx, ty - 12, 1.6).fill({ color: 0xfff4a8, alpha: 0.95 });
          }

          // Fluttering Heraldic Banner & role-specific architectural props
          const bannerX = bx - 34;
          const bannerY = by + 8;
          const wave = Math.sin(sim.tick * 0.14 + role) * 2;
          const bannerCol = role === 0 ? 0xc82838 : role === 1 ? 0x2858a8 : 0x7838b8;
          const trimCol = 0xf0c850;
          sh.rect(bannerX - 1, bannerY - 22, 2, 24).fill(0x4a3828);
          sh.moveTo(bannerX + 1, bannerY - 20)
            .lineTo(bannerX + 11 + wave, bannerY - 17)
            .lineTo(bannerX + 8 + wave * 0.8, bannerY - 6)
            .lineTo(bannerX + 1, bannerY - 9)
            .closePath()
            .fill(bannerCol)
            .stroke({ color: trimCol, width: 1 });

          if (role === 0) {
            // Tavern: oak ale barrels & warm lantern post
            sh.circle(bx + 32, by + 16, 4.5).fill(0x784c28).stroke({ color: 0x2c1a0c, width: 1 });
            sh.circle(bx + 37, by + 21, 4.5).fill(0x684020).stroke({ color: 0x2c1a0c, width: 1 });
          } else if (role === 1) {
            // Blacksmith: glowing forge brazier & steel anvil
            sh.circle(bx + 33, by + 18, 5.5).fill(0x383840).stroke({ color: 0x18181c, width: 1.5 });
            sh.circle(bx + 33, by + 18, 3.5 * flicker).fill({ color: 0xff5818, alpha: 0.9 });
            sh.circle(bx + 33, by + 18, 1.8).fill(0xffe068);
          } else if (role === 2) {
            // Mage School: inscribed arcane courtyard rune circle
            const rot = sim.tick * 0.03;
            r.ellipse(bx, by + 26, 20, 10).stroke({ color: 0x58d0ff, width: 1.2, alpha: 0.55 });
            for (let p = 0; p < 4; p++) {
              const a = rot + p * (Math.PI / 2);
              r.circle(bx + Math.cos(a) * 20, by + 26 + Math.sin(a) * 10, 2).fill({ color: 0xb8f4ff, alpha: 0.8 });
            }
          }
        }
        if (countB >= 2) {
          // Central Town Plaza compass medallion & fountain connecting the buildings
          const px = sumX / countB;
          const py = sumY / countB;
          r.ellipse(px, py, 34, 18)
            .fill({ color: 0x625a4e, alpha: 0.38 })
            .stroke({ color: 0x9e9280, width: 1.5, alpha: 0.55 });
          r.ellipse(px, py, 14, 7.5)
            .fill({ color: 0x286890, alpha: 0.55 })
            .stroke({ color: 0xb8b0a0, width: 2, alpha: 0.7 });
        }
      }
    }
    // Update in-world overhead ARPG nameplates and health bars
    this.nameplates?.update(sim, this.sprites, this.zoom, this.camX, this.camY, this.viewW, this.viewH, v);

    // Hit-point bars: Low draws them only for selected units, Medium adds hurt units, High draws every hurt unit in view.
    for (let i = 0; i < sim.count; i++) {
      const s = this.sprites[i];
      if (!s.visible || cb.hp[i] <= 0) continue;
      if (this.nameplates?.hasPlate(i)) continue;
      const hurt = cb.hp[i] < cb.hpMax[i];
      const sel = v.selected.has(i);
      if (!(sel || (hurt && this.quality > 0))) continue;
      const f = cb.hp[i] / cb.hpMax[i];
      const w = 20 * (s.scale.x > 1.2 ? 1.4 : 1);
      const y = s.y - (s instanceof UnitSprite ? 52 : 36) * s.scale.y;
      sh.rect(s.x - w / 2 - 1, y - 1, w + 2, 5).fill(0x000000);
      sh.rect(s.x - w / 2, y, w * f, 3).fill(sim.team[i] === 0 ? (f > 0.35 ? 0x5fd35f : 0xe0b030) : 0xe05a4a);
    }
    // Status pips above the bar, a ring for a live shield, and a mana bar under the hit-point bar of selected casters.
    for (let i = 0; i < sim.count; i++) {
      const s = this.sprites[i];
      if (!s.visible || cb.hp[i] <= 0) continue;
      const m = cb.stMask[i];
      const y = s.y - (s instanceof UnitSprite ? 52 : 36) * s.scale.y;
      if (m) {
        let n = 0;
        for (let st = 0; st < 8; st++) {
          if (!(m & (1 << st))) continue;
          sh.rect(s.x - 12 + n * 5, y - 7, 4, 4).fill(STATUS_COLORS[st]).stroke({ color: 0x000000, width: 1 });
          n++;
        }
        if (m & (1 << St.Shield)) {
          if (!this.vfx?.hasIronSkin(i)) sh.ellipse(s.x, s.y - 12 * s.scale.y, 12, 15 * s.scale.y).stroke({ color: 0x70c8ff, width: 1.5, alpha: 0.8 });
        }
      }
      if (v.selected.has(i) && cb.mana[i] > 0) {
        const w = 20 * (s.scale.x > 1.2 ? 1.4 : 1);
        sh.rect(s.x - w / 2, y + 4, w * Math.min(1, cb.mana[i] / Math.max(1, cb.manaMax[i])), 2).fill(0x5a8cff);
      }
    }
    for (let i = 0; i < sim.count; i++) {
      if ((!cb.bossMods[i]?.length && !cb.family[i]) || cb.hp[i] <= 0 || !this.sprites[i].visible) continue;
      const famId = cb.family[i];
      const boss = famId ? bossSpriteDef(famId) : undefined;
      const famVis = famId ? FAMILY_VISUALS[famId] : undefined;
      const mods = cb.bossMods[i] ?? [];
      const isElite = mods.length > 0 || !!boss;
      const s = this.sprites[i];
      let auraTint = boss?.auraTint ?? (isElite ? 0xf4b43a : famVis?.auraColor ?? 0xf4b43a);
      if (mods.includes('fire_enchanted')) {
        auraTint = 0xff4810;
      } else if (mods.includes('lightning_enchanted') || mods.includes('spectral_hit')) {
        auraTint = 0x00c8ff;
      } else if (mods.includes('extra_fast')) {
        auraTint = 0x30e850;
      }
      const baseRadius = boss ? Math.round(14 * (boss.scale / 1.3)) : isElite ? 14 : 11;

      // Ground runic / family ring
      r.ellipse(s.x, s.y, baseRadius, Math.round(baseRadius * 0.46)).stroke({
        color: auraTint,
        width: isElite ? 1.8 : 1.2,
        alpha: isElite ? 0.88 : 0.48,
      });

      if (boss || isElite || mods.includes('blessed_aura')) {
        const pulse = 1 + 0.14 * Math.sin(sim.tick * 0.2 + i);
        const outerTint = boss ? boss.auraTint : mods.includes('blessed_aura') ? 0xffd700 : auraTint;
        const rxOut = Math.round(baseRadius * 1.45 * pulse);
        const ryOut = Math.round(baseRadius * 0.68 * pulse);
        r.ellipse(s.x, s.y, rxOut, ryOut).stroke({ color: outerTint, width: 1.4, alpha: 0.55 });
        // Rotating arcane rune nodes on the ground circle for Champions & Bosses
        const nodeCount = boss ? 6 : 4;
        const rot = sim.tick * 0.05 + i;
        for (let n = 0; n < nodeCount; n++) {
          const ang = rot + (n * Math.PI * 2) / nodeCount;
          sh.circle(s.x + Math.cos(ang) * rxOut, s.y + Math.sin(ang) * ryOut, 1.8).fill({ color: 0xffffff, alpha: 0.85 });
        }
      }

      const headY = s.y - (s instanceof UnitSprite ? 52 : 36) * s.scale.y;

      // Distinct Monster Family Silhouette Ornaments on the battlefield
      if (famVis && famVis.ornament !== 'none') {
        const orn = famVis.ornament;
        const col = famVis.auraColor;
        const bob = Math.sin(sim.tick * 0.15 + i) * 2;
        if (famId === 'hollow-knight') {
          // Hollow Knights: twin piercing glowing cyan soul eyes + burnished dark steel shoulder spikes
          const eyePulse = 0.8 + 0.2 * Math.sin(sim.tick * 0.2 + i);
          sh.circle(s.x - 3, headY + 5, 1.6).fill({ color: 0x38bdf8, alpha: eyePulse });
          sh.circle(s.x + 3, headY + 5, 1.6).fill({ color: 0x38bdf8, alpha: eyePulse });
          sh.circle(s.x - 3, headY + 5, 0.8).fill({ color: 0xffffff, alpha: 0.95 });
          sh.circle(s.x + 3, headY + 5, 0.8).fill({ color: 0xffffff, alpha: 0.95 });
          sh.moveTo(s.x - 7, headY + 11).lineTo(s.x - 12, headY + 7).lineTo(s.x - 8, headY + 15).stroke({ color: 0x334155, width: 1.5 });
          sh.moveTo(s.x + 7, headY + 11).lineTo(s.x + 12, headY + 7).lineTo(s.x + 8, headY + 15).stroke({ color: 0x334155, width: 1.5 });
        } else if (famId === 'gloom-stag') {
          // Gloom Stags: corrupted bone antlers + drifting violet corruption motes
          sh.moveTo(s.x - 3, headY + 8).lineTo(s.x - 10, headY - 1).lineTo(s.x - 6, headY - 6).stroke({ color: 0xe2e8f0, width: 2.0, alpha: 0.95 });
          sh.moveTo(s.x + 3, headY + 8).lineTo(s.x + 10, headY - 1).lineTo(s.x + 6, headY - 6).stroke({ color: 0xe2e8f0, width: 2.0, alpha: 0.95 });
          sh.moveTo(s.x - 7, headY + 2).lineTo(s.x - 12, headY + 1).stroke({ color: 0xc084fc, width: 1.4 });
          sh.moveTo(s.x + 7, headY + 2).lineTo(s.x + 12, headY + 1).stroke({ color: 0xc084fc, width: 1.4 });
          const cAng = sim.tick * 0.1 + i;
          sh.circle(s.x + Math.cos(cAng) * 12, headY + Math.sin(cAng * 2) * 5, 2.0).fill({ color: 0xa855f7, alpha: 0.85 });
          sh.circle(s.x - Math.cos(cAng) * 10, headY - Math.sin(cAng * 2) * 4, 1.4).fill({ color: 0xd8b4fe, alpha: 0.9 });
        } else if (famId === 'spore-matron') {
          // Spore Matrons: toxic miasma spores orbiting fungal carapace
          for (let sp = 0; sp < 4; sp++) {
            const spAng = sim.tick * 0.08 + i + (sp * Math.PI) / 2;
            const spDist = 11 + Math.sin(sim.tick * 0.15 + sp) * 3;
            sh.circle(s.x + Math.cos(spAng) * spDist, s.y - 16 + Math.sin(spAng) * (spDist * 0.5), 2.2).fill({ color: 0x84cc16, alpha: 0.85 });
            sh.circle(s.x + Math.cos(spAng) * spDist, s.y - 16 + Math.sin(spAng) * (spDist * 0.5), 1.0).fill({ color: 0xecfccb, alpha: 0.95 });
          }
        } else if (famId === 'basalt-brute') {
          // Basalt Brutes: glowing molten magma cracks across black basalt body
          const pulse = 0.85 + 0.15 * Math.sin(sim.tick * 0.18 + i);
          const bodyY = s.y - 16 * s.scale.y;
          sh.moveTo(s.x - 6, bodyY - 6).lineTo(s.x - 1, bodyY + 1).lineTo(s.x - 4, bodyY + 8).stroke({ color: 0xf97316, width: 2.2, alpha: pulse });
          sh.moveTo(s.x + 5, bodyY - 5).lineTo(s.x + 1, bodyY).lineTo(s.x + 4, bodyY + 7).stroke({ color: 0xf97316, width: 2.2, alpha: pulse });
          sh.moveTo(s.x - 6, bodyY - 6).lineTo(s.x - 1, bodyY + 1).lineTo(s.x - 4, bodyY + 8).stroke({ color: 0xfde047, width: 1.0, alpha: pulse });
          sh.moveTo(s.x + 5, bodyY - 5).lineTo(s.x + 1, bodyY).lineTo(s.x + 4, bodyY + 7).stroke({ color: 0xfde047, width: 1.0, alpha: pulse });
        } else if (orn === 'antlers') {
          sh.moveTo(s.x - 3, headY + 8).lineTo(s.x - 9, headY + 1).lineTo(s.x - 6, headY - 3).stroke({ color: col, width: 1.6, alpha: 0.9 });
          sh.moveTo(s.x + 3, headY + 8).lineTo(s.x + 9, headY + 1).lineTo(s.x + 6, headY - 3).stroke({ color: col, width: 1.6, alpha: 0.9 });
        } else if (orn === 'wisp' || orn === 'astral') {
          const a = sim.tick * 0.12 + i;
          sh.circle(s.x + Math.cos(a) * 11, s.y - 16 + Math.sin(a * 2) * 3, 2.4).fill({ color: col, alpha: 0.9 });
          sh.circle(s.x - Math.cos(a) * 11, s.y - 16 - Math.sin(a * 2) * 3, 1.8).fill({ color: 0xffffff, alpha: 0.85 });
        } else if (orn === 'totem') {
          sh.moveTo(s.x, headY + 2 + bob).lineTo(s.x + 3.5, headY + 7 + bob).lineTo(s.x - 3.5, headY + 7 + bob).closePath().fill({ color: col, alpha: 0.88 });
        } else if (orn === 'spines') {
          for (let sp = -1; sp <= 1; sp++) {
            sh.moveTo(s.x + sp * 4, s.y - 18).lineTo(s.x + sp * 5, s.y - 24).stroke({ color: col, width: 1.5, alpha: 0.85 });
          }
        } else if (orn === 'treant') {
          sh.circle(s.x - 6, headY + 10, 2.5).fill({ color: 0x58d848, alpha: 0.85 });
          sh.circle(s.x + 6, headY + 10, 2.5).fill({ color: 0x58d848, alpha: 0.85 });
        } else if (orn === 'drake' || orn === 'forge') {
          sh.circle(s.x, s.y - 18 + bob, 2.8).fill({ color: 0xff7820, alpha: 0.85 });
          sh.circle(s.x, s.y - 18 + bob, 1.4).fill({ color: 0xffe878, alpha: 0.95 });
        } else if (orn === 'storm' || orn === 'scarab') {
          const jx = ((sim.tick + i) & 1) ? 3 : -3;
          sh.moveTo(s.x - 5, s.y - 16).lineTo(s.x + jx, s.y - 21).lineTo(s.x + 5, s.y - 15).stroke({ color: 0x70e8ff, width: 1.5, alpha: 0.9 });
        } else if (orn === 'crown') {
          sh.moveTo(s.x - 5, headY + 6).lineTo(s.x - 3, headY + 2).lineTo(s.x, headY + 5).lineTo(s.x + 3, headY + 2).lineTo(s.x + 5, headY + 6).stroke({ color: col, width: 1.5, alpha: 0.9 });
        } else if (orn === 'bell' || orn === 'mummy' || orn === 'serpent' || orn === 'shell') {
          sh.ellipse(s.x, s.y - 14, 9, 5).stroke({ color: col, width: 1.2, alpha: 0.65 });
        }
      }

      // Champion / Super-Unique / Act Boss Crown Emblem above head & Elemental Body Affixes
      if (isElite) {
        const cy = headY - 9;
        const isSuper = !!boss || mods.length >= 2;
        const crownCol = boss ? boss.auraTint : isSuper ? 0xffb830 : 0xffe066;
        if (isSuper) {
          // Ornate 5-point Super-Unique / Boss Diadem Crown with glowing center gem
          sh.moveTo(s.x - 8, cy + 5)
            .lineTo(s.x - 9, cy - 1)
            .lineTo(s.x - 4, cy + 2)
            .lineTo(s.x, cy - 4)
            .lineTo(s.x + 4, cy + 2)
            .lineTo(s.x + 9, cy - 1)
            .lineTo(s.x + 8, cy + 5)
            .closePath()
            .fill(crownCol)
            .stroke({ color: 0x241408, width: 1.2 });
          sh.circle(s.x, cy + 1, 1.8).fill(0xff2848);
        } else {
          // Crisp 3-point Elite Champion Crown
          sh.moveTo(s.x - 6, cy + 4)
            .lineTo(s.x - 6, cy - 1)
            .lineTo(s.x - 2, cy + 2)
            .lineTo(s.x, cy - 3)
            .lineTo(s.x + 2, cy + 2)
            .lineTo(s.x + 6, cy - 1)
            .lineTo(s.x + 6, cy + 4)
            .closePath()
            .fill(crownCol)
            .stroke({ color: 0x241408, width: 1 });
        }

        // Elemental body effects per bossMod
        const bodyY = s.y - 16 * s.scale.y;
        if (mods.includes('fire_enchanted')) {
          const fAng = DIR_COS[sim.dir[i]] * 8;
          const fh = 5 + (frame8 % 3) * 1.2;
          sh.ellipse(s.x + fAng, bodyY - 2, 4, fh).fill({ color: 0xff4800, alpha: 0.85 });
          sh.ellipse(s.x + fAng, bodyY - 2, 2.2, fh * 0.6).fill({ color: 0xffe858, alpha: 0.95 });
        }
        if (mods.includes('lightning_enchanted') || mods.includes('lightning') || mods.includes('spectral_hit')) {
          const seedL = (sim.tick + i * 7) & 3;
          const lx1 = s.x - 8 + seedL * 2;
          const lx2 = s.x + 8 - seedL * 2;
          sh.moveTo(lx1, bodyY - 8)
            .lineTo(s.x + (seedL & 1 ? 4 : -4), bodyY)
            .lineTo(lx2, bodyY + 7)
            .stroke({ color: 0x58c8ff, width: 2, alpha: 0.9 });
          sh.moveTo(lx1, bodyY - 8)
            .lineTo(s.x + (seedL & 1 ? 4 : -4), bodyY)
            .lineTo(lx2, bodyY + 7)
            .stroke({ color: 0xffffff, width: 1, alpha: 0.95 });
        }
        if (mods.includes('cold_enchanted') || mods.includes('cold_touch')) {
          for (let cIdx = 0; cIdx < 3; cIdx++) {
            const cAng = sim.tick * 0.08 + i + (cIdx * Math.PI * 2) / 3;
            const cx = s.x + Math.cos(cAng) * 12;
            const cyCrystal = bodyY + Math.sin(cAng) * 6;
            sh.moveTo(cx, cyCrystal - 4)
              .lineTo(cx + 2.5, cyCrystal)
              .lineTo(cx, cyCrystal + 4)
              .lineTo(cx - 2.5, cyCrystal)
              .closePath()
              .fill({ color: 0x80e8ff, alpha: 0.88 })
              .stroke({ color: 0xffffff, width: 0.8 });
          }
        }
        if (mods.includes('stone_skin')) {
          for (let gIdx = 0; gIdx < 3; gIdx++) {
            const gAng = -sim.tick * 0.06 + i + (gIdx * Math.PI * 2) / 3;
            const gx = s.x + Math.cos(gAng) * 13;
            const gy = bodyY + Math.sin(gAng) * 6.5;
            sh.roundRect(gx - 3, gy - 4, 6, 8, 1.5)
              .fill({ color: 0x98948c, alpha: 0.92 })
              .stroke({ color: 0x403c38, width: 1.2 });
          }
        }
        if (mods.includes('extra_fast')) {
          const dx = -DIR_COS[sim.dir[i]];
          const dy = -DIR_SIN[sim.dir[i]];
          for (let tr = 1; tr <= 2; tr++) {
            sh.moveTo(s.x + dx * (6 * tr), bodyY + dy * (3 * tr) - 5)
              .lineTo(s.x + dx * (6 * tr + 9), bodyY + dy * (3 * tr + 4.5) - 5)
              .stroke({ color: 0x98f8ff, width: 2, alpha: 0.65 / tr });
            sh.moveTo(s.x + dx * (6 * tr), bodyY + dy * (3 * tr) + 4)
              .lineTo(s.x + dx * (6 * tr + 8), bodyY + dy * (3 * tr + 4) + 4)
              .stroke({ color: 0xffe878, width: 1.6, alpha: 0.6 / tr });
          }
        }
      }
    }
    for (const id of v.selected) {
      const s = this.sprites[id];
      if (!s.visible || cb.hp[id] <= 0) continue;
      const dir = sim.dir[id];
      r.ellipse(s.x, s.y, 11, 5)
        .stroke({ color: 0x9dff7a, width: 2 })
        .moveTo(s.x, s.y)
        .lineTo(s.x + DIR_COS[dir] * 15, s.y + DIR_SIN[dir] * 7)
        .stroke({ color: 0xffffff, width: 2 });
    }
    if (v.hover) {
      const s = this.sprites[v.hover.id];
      if (s.visible && cb.hp[v.hover.id] > 0) r.ellipse(s.x, s.y, 13, 6).stroke({ color: v.hover.ok ? 0xff5a4a : 0x999999, width: 2 });
    }
    for (let p = 0; p < cb.pAlive.length; p++) {
      if (!cb.pAlive[p]) continue;
      const wx = cb.pX[p] * k;
      const wy = cb.pY[p] * k - 14;
      const el = cb.pEl[p];
      const spell = cb.pS[p] > 0 ? SPELLS[cb.pS[p] - 1] : null;
      if (spell && (spell.tk === Tk.Ally || spell.heal)) sh.circle(wx, wy, 4).fill(BUFF_COLOR).stroke({ color: 0xffffff, width: 1 });
      else if (spell) {
        const sid = cb.pS[p] - 1;
        if (sid >= 24 && sid <= 31) {
          if (sid === 30) {
            sh.circle(wx, wy, 6).fill(0x2979ff).stroke({ color: 0xe040fb, width: 2, alpha: 0.9 });
            sh.circle(wx, wy, 2.5).fill(0xffffff);
          }
          continue;
        }
        if (el === 1) sh.circle(wx, wy, 5).fill(ELEM_COLOR[1]).circle(wx, wy, 2.5).fill(0xfff0a0);
        else if (el === 2) sh.circle(wx, wy, 5).fill({ color: ELEM_COLOR[2], alpha: 0.8 }).stroke({ color: 0xe0f8ff, width: 1.5 });
        else if (el === 3) sh.moveTo(wx - 6, wy).lineTo(wx, wy - 3).lineTo(wx + 6, wy).lineTo(wx, wy + 3).closePath().fill(ELEM_COLOR[3]).stroke({ color: 0xffffff, width: 1 });
        else if (el === 4) sh.rect(wx - 4, wy - 4, 8, 8).fill(ELEM_COLOR[4]).stroke({ color: 0x4a3820, width: 1 });
        else if (el === 5) sh.circle(wx, wy, 5).fill(ELEM_COLOR[5]).stroke({ color: 0xffffff, width: 1, alpha: 0.85 });
        else sh.circle(wx, wy, 5).fill(ELEM_COLOR[el]).stroke({ color: 0xffffff, width: 1, alpha: 0.7 });
      } else if (el === 0) {
        const t = cb.pT[p];
        const dx = sim.x[t] - cb.pX[p];
        const dy = sim.y[t] - cb.pY[p];
        const len = Math.max(1, Math.hypot(dx, dy));
        sh.moveTo(wx, wy).lineTo(wx - (dx / len) * 9, wy - (dy / len) * 9).stroke({ color: 0xe8d8a0, width: 2 });
      } else sh.circle(wx, wy, 4).fill(ELEM_COLOR[el]);
    }
    for (let n = this.bursts.length - 1; n >= 0; n--) {
      const b = this.bursts[n];
      const age = (now - b.born) / b.ms;
      if (age >= 1) {
        this.bursts.splice(n, 1);
        continue;
      }
      const rad = b.r * (0.35 + 0.65 * age);
      const fade = 1 - age;
      if (b.fill) sh.circle(b.x, b.y, rad).fill({ color: b.color, alpha: 0.28 * fade }).stroke({ color: b.color, width: 2, alpha: fade });
      else sh.circle(b.x, b.y, rad).stroke({ color: b.color, width: 2, alpha: fade });
      if (b.el === 1) {
        // Fire: radial ember sparks
        for (let a = 0; a < 6; a++) {
          const ang = a * (Math.PI / 3) + age * 0.6;
          sh.moveTo(b.x + Math.cos(ang) * rad * 0.55, b.y + Math.sin(ang) * rad * 0.55)
            .lineTo(b.x + Math.cos(ang) * rad * 1.15, b.y + Math.sin(ang) * rad * 1.15)
            .stroke({ color: 0xffe484, width: 1.5, alpha: fade });
        }
      } else if (b.el === 2) {
        // Water: inner cooling ripple
        sh.ellipse(b.x, b.y, rad * 0.6, rad * 0.42).stroke({ color: 0xc8f4ff, width: 1.5, alpha: fade * 0.9 });
      } else if (b.el === 3) {
        // Air: jagged 4-point spark cross
        const s = rad * 1.1;
        sh.moveTo(b.x - s, b.y).lineTo(b.x + s, b.y).moveTo(b.x, b.y - s).lineTo(b.x, b.y + s).stroke({ color: 0xffffff, width: 1.5, alpha: fade });
      } else if (b.el === 4) {
        // Earth: rock shards flying outward
        for (let a = 0; a < 4; a++) {
          const ang = a * (Math.PI / 2) + 0.78;
          sh.rect(b.x + Math.cos(ang) * rad * 0.75 - 2, b.y + Math.sin(ang) * rad * 0.75 - 2, 4, 4).fill({ color: 0x8f744a, alpha: fade });
        }
      } else if (b.el === 5) {
        // Astral: glowing rune diamond
        const d = rad * 0.78;
        sh.moveTo(b.x, b.y - d).lineTo(b.x + d, b.y).lineTo(b.x, b.y + d).lineTo(b.x - d, b.y).closePath().stroke({ color: 0xf0c8ff, width: 1.5, alpha: fade });
      }
    }
    const o = this.overlay;
    o.clear();
    this.vfx?.drawScreenOverlay(o, this.viewW, this.viewH);
    if (v.aim) {
      const a = v.aim;
      const c = a.ok ? 0xffe070 : 0xff6a5a;
      if (a.r > 0) o.circle(a.x, a.y, a.r).fill({ color: c, alpha: 0.12 }).stroke({ color: c, width: 2 });
      o.circle(a.x, a.y, 13).stroke({ color: c, width: 2 });
      o.moveTo(a.x - 20, a.y).lineTo(a.x - 6, a.y).moveTo(a.x + 6, a.y).lineTo(a.x + 20, a.y).moveTo(a.x, a.y - 20).lineTo(a.x, a.y - 6).moveTo(a.x, a.y + 6).lineTo(a.x, a.y + 20).stroke({ color: c, width: 2 });
      if (a.target >= 0 && this.sprites[a.target]?.visible) {
        const t = this.sprites[a.target];
        o.ellipse(t.x * z - this.camX, (t.y - 4) * z - this.camY, 16 * z, 8 * z).stroke({ color: c, width: 3 });
      }
    }
    if (v.box) {
      const { x0, y0, x1, y1 } = v.box;
      o.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
        .fill({ color: 0x9dff7a, alpha: 0.12 })
        .stroke({ color: 0x9dff7a, width: 1 });
    }
    if (v.ping) {
      const sx = v.ping.x * TILE * this.zoom - this.camX;
      const sy = v.ping.y * TILE * this.zoom - this.camY;
      o.circle(sx, sy, (6 + v.ping.age * 22) * this.zoom).stroke({ color: 0xffd700, width: 2.5, alpha: 1 - v.ping.age });
      o.circle(sx, sy, (3 + v.ping.age * 12) * this.zoom).stroke({ color: 0xffe680, width: 1.5, alpha: (1 - v.ping.age) * 0.8 });
      o.moveTo(sx, sy - 6).lineTo(sx + 6, sy).lineTo(sx, sy + 6).lineTo(sx - 6, sy).closePath().stroke({ color: 0xffd700, width: 1.5, alpha: 1 - v.ping.age });
    }
    // Subtle directional chevron around hero pointing towards nearest enemy raider camp
    const heroId = sim.hero ? sim.hero.id : 0;
    if (sim.cb.hp[heroId] > 0) {
      const hWorldX = (sim.x[heroId] / FP) * TILE;
      const hWorldY = (sim.y[heroId] / FP) * TILE;
      const hScreenX = hWorldX * this.zoom - this.camX;
      const hScreenY = hWorldY * this.zoom - this.camY;

      if (hScreenX >= 0 && hScreenX <= this.viewW && hScreenY >= 0 && hScreenY <= this.viewH) {
        let nearestDistSq = Infinity;
        let nearestEnemyIdx = -1;
        for (let i = 0; i < sim.count; i++) {
          if (sim.team[i] !== 1 || sim.cb.hp[i] <= 0) continue;
          const eWorldX = (sim.x[i] / FP) * TILE;
          const eWorldY = (sim.y[i] / FP) * TILE;
          const dSq = (eWorldX - hWorldX) ** 2 + (eWorldY - hWorldY) ** 2;
          if (dSq < nearestDistSq) {
            nearestDistSq = dSq;
            nearestEnemyIdx = i;
          }
        }

        if (nearestEnemyIdx >= 0 && nearestDistSq > (10 * TILE) ** 2) {
          const eWorldX = (sim.x[nearestEnemyIdx] / FP) * TILE;
          const eWorldY = (sim.y[nearestEnemyIdx] / FP) * TILE;
          const angle = Math.atan2(eWorldY - hWorldY, eWorldX - hWorldX);
          const orbitR = 48 * this.zoom;
          const px = hScreenX + Math.cos(angle) * orbitR;
          const py = hScreenY + Math.sin(angle) * orbitR;

          const pulse = 0.5 + 0.5 * Math.sin(now / 400);
          const chevronAlpha = 0.35 + 0.3 * pulse;
          const sideL = 8 * this.zoom;
          const wingAngle1 = angle + 2.5;
          const wingAngle2 = angle - 2.5;

          o.moveTo(px, py)
            .lineTo(px + Math.cos(wingAngle1) * sideL, py + Math.sin(wingAngle1) * sideL)
            .stroke({ color: 0xff6a5a, width: 2, alpha: chevronAlpha });
          o.moveTo(px, py)
            .lineTo(px + Math.cos(wingAngle2) * sideL, py + Math.sin(wingAngle2) * sideL)
            .stroke({ color: 0xff6a5a, width: 2, alpha: chevronAlpha });
        }
      }
    }
    this.app.render();
  }
}
