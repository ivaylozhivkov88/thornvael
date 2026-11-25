import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { OverheadNameplateLayer } from './nameplate';
import { Terrain, TILE, type GameMap } from './map';
import type { AdventureObjectDef, WaypointDef } from './mapdoc';
import { loadTerrainArt, prepareScenery } from './terrain';
import { Kind } from './sim/combat';
import { SKILL_NAMES } from './sim/hero';
import { FP, type Sim } from './sim/sim';
import { St } from './sim/spelldata';
import { S } from './strings';
import { getItemDef, Slot } from './sim/items';
import {
  UnitAtlas,
  UnitSprite,
  ALL_UNIT_ART,
  FAMILY_ART,
  EXTENDED_FAMILY_ART,
  bossSpriteDef,
  type ExtendedMonsterArt,
  type HeroWeaponVisual,
  HERO_ARMOUR_TINTS,
} from './sprites/units';
import { getSuperUniqueById } from './sim/super-uniques';
import { loadAllExtraAtlases, type ExtraAtlases } from './sprites/extra-atlases';
import { DEFAULT_ATLAS_CONCURRENCY, DEFAULT_LOAD_TIMEOUT_MS, runWithPool } from './sprites/load-pool';
import { ArtPreview } from './sprites/preview';
import { AtlasOverlayPass, type RenderBossTelegraph } from './render/atlas-overlays';
import {
  getTorchFlickerFrame,
  getBonfireFrame,
  getBannerFrame,
  getWaterWheelFrame,
  getCauldronFrame,
  getSmokeColumnFrame,
  isDungeonBiome,
} from './art-wave3';
export {
  getTorchFlickerFrame,
  getBonfireFrame,
  getBannerFrame,
  getWaterWheelFrame,
  getCauldronFrame,
  getSmokeColumnFrame,
  isDungeonBiome,
};
import { CombatAnimation, type AnimationPose } from './sprites/combat-animation';
import { VfxSystem } from './vfx';
import { CombatFeelSystem } from './feel';
import { AestheticVfxSystem, detectBiomeFromMap, type BiomeWeatherType, type BiomeAct } from './aesthetic-vfx';
import { updateAtmosphere, isReducedMotionActive, regionAtTile } from './atmosphere';
import { FxEngine, type WeatherKind } from './fx';
import { MAX_ZOOM, MIN_ZOOM, RenderCameraController } from './render/camera-controller';
import { TerrainChunkCache } from './render/chunk-cache';
import { LightingPass, SHRINE_COLORS } from './render/lighting-pass';
import { LruVramManager, estimateTextureBytes, type VramStats } from './render/vram-manager';
import {
  BUFF_COLOR,
  drawGlint,
  ELEM_COLOR,
  type Burst,
  type FamilyVisualDef,
  type PingState,
  type WorldViewOverlay,
  renderCorpseMarks,
  renderDestructiblePropsAndHeroTorch,
  renderFxEngineWorldLayers,
  renderLootAndShrines,
  renderProjectilesAndBursts,
  renderScreenOverlays,
  renderSelectionAndHover,
  renderShorelineFoam,
  renderTownArchitecture,
  renderUnitIndicators,
} from './render/world-overlays';

export { MAX_ZOOM, MIN_ZOOM, type RenderBossTelegraph };

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

function resolveFxBiomeName(biomeOrAct: BiomeWeatherType | BiomeAct | number | string): string {
  if (typeof biomeOrAct === 'number') {
    if (biomeOrAct === 2) return 'desert';
    if (biomeOrAct === 3) return 'crypt';
    if (biomeOrAct === 4) return 'caldera';
    return 'marsh';
  }
  const key = biomeOrAct.trim().toLowerCase();
  if (key === 'swamp') return 'marsh';
  if (key === 'caves') return 'crypt';
  if (key === 'hell' || key === 'volcanic') return 'caldera';
  return key || 'forest';
}

function biomeToDefaultWeather(biome: string): WeatherKind {
  switch (biome) {
    case 'marsh':
      return 'rain';
    case 'desert':
      return 'dust';
    case 'crypt':
      return 'fog';
    case 'caldera':
      return 'ash';
    case 'highlands':
      return 'snow';
    default:
      return 'clear';
  }
}

const DIR_COS = Array.from({ length: 16 }, (_, k) => Math.cos((k * Math.PI) / 8));
const DIR_SIN = Array.from({ length: 16 }, (_, k) => Math.sin((k * Math.PI) / 8));
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

/** Colours of the status pips drawn over a unit, indexed by status id. */
export const STATUS_COLORS = [0xffe070, 0x70c8ff, 0xffffff, 0x6a8cff, 0x7cd14a, 0xff7a2a, 0x9a9a9a, 0xb070c0];
export const QUALITY_NAMES = ['Low', 'Medium', 'High'] as const;
const FLOATERS = [0, 10, 24];
const FLOAT_MS = 900;
const KICK_MS = 170;
const TOPPLE_MS = 260;
const DEAD_TINT = 0x6a5a55;

function unitTexture(): Texture {
  const cv = document.createElement('canvas');
  cv.width = 32;
  cv.height = 42;
  const g = cv.getContext('2d')!;

  g.fillStyle = 'rgba(0, 0, 0, 0.45)';
  g.beginPath();
  g.ellipse(16, 38, 12, 4, 0, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = '#2563eb';
  g.beginPath();
  g.moveTo(10, 16);
  g.lineTo(7, 34);
  g.lineTo(25, 34);
  g.lineTo(22, 16);
  g.closePath();
  g.fill();

  g.fillStyle = '#dce6f2';
  g.fillRect(10, 15, 12, 16);
  g.fillStyle = '#ffffff';
  g.fillRect(11, 16, 3, 14);

  g.fillStyle = '#b8c7db';
  g.beginPath();
  g.arc(16, 11, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#111827';
  g.fillRect(13, 11, 6, 2);
  g.fillStyle = '#ffd23d';
  g.fillRect(15, 4, 2, 4);

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

export type View = WorldViewOverlay;

export class Renderer {
  readonly app = new Application();
  readonly world = new Container();
  readonly nameplates = new OverheadNameplateLayer();
  private readonly rings = new Graphics();
  private readonly overlay = new Graphics();
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
  private kickX: number[] = [];
  private kickY: number[] = [];
  private kickAt: number[] = [];
  private deathAt: (number | undefined)[] = [];
  private freeText: Text[] = [];
  private fogTick = 0;
  quality = 2;
  private sprites: (Sprite | UnitSprite)[] = [];
  private artStress = false;
  private baselineArtOnly = false;
  private artPreview?: ArtPreview;
  private loadedAtlases: UnitAtlas[] = [];
  private atlasByArt = new Map<string, UnitAtlas>();
  private extendedAtlases = new Map<ExtendedMonsterArt, UnitAtlas>();
  private extendedAtlasPromises = new Map<ExtendedMonsterArt, Promise<UnitAtlas | null>>();
  private failedExtendedAtlases = new Set<ExtendedMonsterArt>();
  private activeExtendedArt = new Set<ExtendedMonsterArt>();
  private animation?: CombatAnimation;
  private readonly pose: AnimationPose = { clip: 'stand', frame: 0, age: 0, finished: false, unresolved: false };
  private fogCv!: HTMLCanvasElement;
  private fogTex!: Texture;
  private fogImg!: ImageData;
  private fogBuf32!: Uint32Array;
  private fogSeen = -1;
  private fog!: Sprite;
  vfx?: VfxSystem;
  readonly feel: CombatFeelSystem;
  readonly aestheticVfx: AestheticVfxSystem;
  readonly fxEngine: FxEngine;
  private readonly fxGroundGfx = new Graphics();
  private readonly fxWorldGfx = new Graphics();
  private readonly fxAddGfx = new Graphics();
  private readonly gradeOverlay = new Graphics();
  private _camera?: RenderCameraController;
  private _lightingPass?: LightingPass;
  private _chunkCache?: TerrainChunkCache;
  private _atlasOverlay?: AtlasOverlayPass;
  private _vram?: LruVramManager;
  private extraAtlases: ExtraAtlases | null = null;
  private activeTelegraphs: readonly RenderBossTelegraph[] = [];
  private worldAdventureObjects: readonly AdventureObjectDef[] = [];
  private worldWaypoints: readonly WaypointDef[] = [];
  private prevUnitPx: Float32Array = new Float32Array(0);
  private prevUnitPy: Float32Array = new Float32Array(0);
  private prevUnitValid: Uint8Array = new Uint8Array(0);
  private readonly activeLootKeys = new Set<string>();
  private readonly seenLootKeys = new Set<string>();
  private pingState: PingState = { lastPingX: Number.NaN, lastPingY: Number.NaN, lastPingAge: 2 };
  private currentBiomeName = 'forest';
  private currentRegionName = '';
  private currentWeather: WeatherKind = 'clear';
  private lastDrawNow = 0;
  private lastCastSid = -1;
  private contextLost = false;
  private contextTarget: EventTarget | null = null;
  private fallbackUnitTex?: Texture;

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
  };

  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    this.reloadGpuTextures();
    this.updateChunks();
    this.setQuality(this.quality);
    if (this.app?.renderer && typeof window !== 'undefined') {
      try {
        this.app.renderer.resize(window.innerWidth, window.innerHeight);
      } catch {
        // keep existing dimensions if resize is unsupported
      }
    }
    if (this.app?.renderer) {
      try {
        this.app.render();
      } catch {
        // ignore if renderer is not active
      }
    }
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly map: GameMap,
  ) {
    this.swingTrailGraphics.blendMode = 'add';
    this.fxAddGfx.blendMode = 'add';
    this.gradeOverlay.eventMode = 'none';
    this.feel = new CombatFeelSystem(map.w, map.h);
    this.aestheticVfx = new AestheticVfxSystem();
    const detected = detectBiomeFromMap('', map.terrain);
    this.aestheticVfx.setBiome(detected);
    this.currentBiomeName = resolveFxBiomeName(detected);
    this.currentWeather = biomeToDefaultWeather(this.currentBiomeName);
    this.fxEngine = new FxEngine({
      quality: this.quality === 0 ? 'low' : 'high',
      reducedMotion: isReducedMotionActive(),
    });
    this.fxEngine.dynamicLighting.setBiome(this.currentBiomeName);
    this.fxEngine.regionGrade.setContext({
      biome: this.currentBiomeName,
      weather: this.currentWeather,
      daylight: 255,
    });
    this.fxEngine.regionGrade.snapToTarget();
    this.ensureCamera();
    this.ensureLightingPass();
    this.ensureChunkCache();
    this.attachContextListeners(this.canvas);
  }

  get isContextLost(): boolean {
    return this.contextLost;
  }

  private attachContextListeners(target: EventTarget | null | undefined, forceRebind = false): void {
    if (!forceRebind && this.contextTarget === target) return;
    if (this.contextTarget && typeof this.contextTarget.removeEventListener === 'function') {
      this.contextTarget.removeEventListener('webglcontextlost', this.onContextLost);
      this.contextTarget.removeEventListener('webglcontextrestored', this.onContextRestored);
    }
    this.contextTarget = target ?? null;
    if (target && typeof target.addEventListener === 'function') {
      target.addEventListener('webglcontextlost', this.onContextLost);
      target.addEventListener('webglcontextrestored', this.onContextRestored);
    }
  }

  private reloadGpuTextures(): void {
    this.fogSeen = -1;
    this.fogTex?.source?.update();
    this.fallbackUnitTex?.source?.update();
    for (const atlas of this.loadedAtlases) {
      atlas.source?.source?.update();
    }
    for (const atlas of this.extendedAtlases?.values() ?? []) {
      atlas.source?.source?.update();
    }
    for (const child of this.ensureChunkCache().chunks.children) {
      const sprite = child as Sprite;
      sprite.texture?.source?.update();
    }
    for (const item of this.app?.stage?.children ?? []) {
      if (item instanceof Sprite) {
        item.texture?.source?.update();
      }
    }
  }

  destroy(): void {
    this.attachContextListeners(null, true);
    for (const s of this.sprites) {
      this.world.removeChild(s);
      s.destroy({ children: true });
    }
    this.sprites.length = 0;
    this.baseTint.length = 0;
    this.activeExtendedArt?.clear();
    this.releaseUnusedExtendedAtlases([]);
    this._vram?.clear(false);
  }

  private ensureVram(): LruVramManager {
    return (this._vram ??= new LruVramManager());
  }

  private isVramKeyEvictable(key: string): boolean {
    return !key.startsWith('ext:') || !this.isExtendedArtInUse(key.slice(4) as ExtendedMonsterArt);
  }

  getVramStats(): VramStats {
    return this.ensureVram().stats();
  }

  private textureFootprint(tex: Texture | null | undefined): number {
    if (!tex) return 0;
    const src = tex.source as { pixelWidth?: number; pixelHeight?: number; width?: number; height?: number } | undefined;
    const w = src?.pixelWidth ?? src?.width ?? tex.width ?? 0;
    const h = src?.pixelHeight ?? src?.height ?? tex.height ?? 0;
    return w > 0 && h > 0 ? estimateTextureBytes(w, h) : 0;
  }

  private isExtendedArtInUse(artId: ExtendedMonsterArt): boolean {
    if (this.activeExtendedArt?.has(artId)) return true;
    const atlas = this.extendedAtlases.get(artId);
    if (!atlas) return false;
    return this.sprites.some((s) => s instanceof UnitSprite && s.atlas === atlas);
  }

  private resolveExtendedArtId(famId: string | undefined): ExtendedMonsterArt | undefined {
    if (!famId) return undefined;
    const resolved = getSuperUniqueById(famId)?.family ?? famId;
    return EXTENDED_FAMILY_ART[resolved];
  }

  /** Lazily load and cache an extended monster family atlas on demand (no-op in art/crowd baseline modes). */
  async loadExtendedFamilyAtlas(famId: string): Promise<UnitAtlas | null> {
    this.ensureFxState();
    if (this.baselineArtOnly) return null;
    const artId = this.resolveExtendedArtId(famId);
    if (!artId) return null;
    this.activeExtendedArt.add(artId);
    const vramKey = `ext:${artId}`;
    const vram = this.ensureVram();
    const cached = this.extendedAtlases.get(artId);
    if (cached) {
      vram.touch(vramKey);
      return cached;
    }
    if (this.failedExtendedAtlases.has(artId)) return null;
    const pending = this.extendedAtlasPromises.get(artId);
    if (pending) return pending;
    const promise = UnitAtlas.load(artId)
      .then((atlas) => {
        this.extendedAtlases.set(artId, atlas);
        this.extendedAtlasPromises.delete(artId);
        vram.register(
          {
            key: vramKey,
            bytes: this.textureFootprint(atlas.source),
            pinned: false,
            onEvict: () => {
              const cur = this.extendedAtlases.get(artId);
              if (cur === atlas && !this.isExtendedArtInUse(artId)) {
                atlas.source.destroy(true);
                this.extendedAtlases.delete(artId);
              }
            },
          },
          (key) => this.isVramKeyEvictable(key),
        );
        return atlas;
      })
      .catch(() => {
        this.failedExtendedAtlases.add(artId);
        this.extendedAtlasPromises.delete(artId);
        return null;
      });
    this.extendedAtlasPromises.set(artId, promise);
    return promise;
  }

  /** Release GPU textures for extended monster atlases no longer used by the active mission. */
  releaseUnusedExtendedAtlases(activeFamilies: Iterable<string> = []): number {
    this.ensureFxState();
    const keepArt = new Set<ExtendedMonsterArt>();
    for (const fam of activeFamilies) {
      const artId = this.resolveExtendedArtId(fam);
      if (artId) keepArt.add(artId);
    }
    this.activeExtendedArt = keepArt;
    const vram = this.ensureVram();
    let released = 0;
    for (const [artId, atlas] of this.extendedAtlases.entries()) {
      if (keepArt.has(artId)) {
        vram.touch(`ext:${artId}`);
        continue;
      }
      const inUse = this.sprites.some((s) => s instanceof UnitSprite && s.atlas === atlas);
      if (inUse) continue;
      atlas.source.destroy(true);
      this.extendedAtlases.delete(artId);
      vram.release(`ext:${artId}`, false);
      released++;
    }
    return released;
  }

  private createUnitSprite(sim: Sim, i: number): { sprite: Sprite | UnitSprite; baseTint: number } {
    const kind = sim.cb.kind[i];
    const rawFam = sim.cb.family[i];
    const resolvedFam = rawFam ? (getSuperUniqueById(rawFam)?.family ?? rawFam) : '';
    const boss = resolvedFam ? bossSpriteDef(resolvedFam) : undefined;
    const extArtId = !this.baselineArtOnly && resolvedFam ? EXTENDED_FAMILY_ART[resolvedFam] : undefined;
    const bossAtlas = boss
      ? this.atlasByArt.get(boss.id)
      : resolvedFam && FAMILY_ART[resolvedFam]
        ? this.atlasByArt.get(FAMILY_ART[resolvedFam])
        : extArtId
          ? this.extendedAtlases.get(extArtId)
          : undefined;
    const atlases = this.loadedAtlases;
    const atlas =
      bossAtlas ??
      (this.artStress && atlases.length > 0
        ? atlases[i % atlases.length]
        : kind === Kind.Hero
          ? sim.hero?.cls === 1
            ? this.atlasByArt.get('mage')
            : sim.hero?.cls === 2
              ? this.atlasByArt.get('archer')
              : sim.hero?.cls === 3
                ? this.atlasByArt.get('necromancer')
                : this.atlasByArt.get('hero')
          : kind === Kind.Archer
            ? this.atlasByArt.get('archer')
            : kind === Kind.Golem
              ? this.atlasByArt.get('golem')
              : kind === Kind.Warrior
                ? this.atlasByArt.get('warrior')
                : kind === Kind.Mage
                  ? this.atlasByArt.get('mage')
                  : kind === Kind.Gnoll
                    ? this.atlasByArt.get('gnoll')
                    : kind === Kind.Imp
                      ? this.atlasByArt.get('imp')
                      : null);
    const s = atlas ? new UnitSprite(atlas, boss) : new Sprite(this.fallbackUnitTex);
    if (s instanceof Sprite) s.anchor.set(0.5, 0.88);
    const look = KIND_LOOK[kind] ?? { scale: 1 };
    const famVis = rawFam ? FAMILY_VISUALS[rawFam] : undefined;
    const isChamp = (sim.cb.bossMods[i]?.length ?? 0) > 0 && !boss;
    const champMul = isChamp ? 1.2 : 1;
    if (boss) {
      s.scale.set(boss.scale);
    } else if (famVis) {
      s.scale.set(famVis.scaleX * champMul * 1.32, famVis.scaleY * champMul * 1.32);
    } else {
      s.scale.set(look.scale * champMul);
    }
    if (s instanceof Sprite) {
      if (sim.team[i] === 0) s.tint = kind === Kind.Hero || kind === Kind.Mage ? look.tint! : TEAM_TINT[0];
      else if (boss?.signatureColor) s.tint = boss.signatureColor;
      else if (famVis) s.tint = famVis.auraColor;
      else s.tint = kind === Kind.Archer ? TEAM_TINT[1] : look.tint ?? TEAM_TINT[1];
    }
    return { sprite: s, baseTint: s.tint as number };
  }

  private ensureCamera(): RenderCameraController {
    return (this._camera ??= new RenderCameraController({
      getMap: () => this.map,
      getViewport: () => ({ w: this.viewW, h: this.viewH }),
    }));
  }

  private ensureLightingPass(): LightingPass {
    return (this._lightingPass ??= new LightingPass());
  }

  private ensureChunkCache(): TerrainChunkCache {
    return (this._chunkCache ??= new TerrainChunkCache());
  }

  private ensureAtlasOverlay(): AtlasOverlayPass {
    return (this._atlasOverlay ??= new AtlasOverlayPass());
  }

  get extraAtlasSet(): ExtraAtlases | null {
    return this.extraAtlases;
  }

  private atmoRegions: readonly import('./mapdoc').Region[] = [];
  setAtmosphereRegions(r: readonly import('./mapdoc').Region[] | undefined): void {
    this.atmoRegions = r ?? [];
  }

  setBossTelegraphs(list: readonly RenderBossTelegraph[]): void {
    this.activeTelegraphs = list;
  }

  setWorldFeatures(features: {
    adventureObjects?: readonly AdventureObjectDef[];
    waypoints?: readonly WaypointDef[];
  }): void {
    this.worldAdventureObjects = features.adventureObjects ?? [];
    this.worldWaypoints = features.waypoints ?? [];
  }

  get zoom(): number {
    return this.ensureCamera().zoom;
  }
  set zoom(v: number) {
    this.ensureCamera().zoom = v;
  }

  get camX(): number {
    return this.ensureCamera().camX;
  }
  set camX(v: number) {
    this.ensureCamera().camX = v;
  }

  get camY(): number {
    return this.ensureCamera().camY;
  }
  set camY(v: number) {
    this.ensureCamera().camY = v;
  }

  get viewW(): number {
    return this.app?.renderer ? this.app.screen.width : typeof window !== 'undefined' ? window.innerWidth : 800;
  }

  get viewH(): number {
    return this.app?.renderer ? this.app.screen.height : typeof window !== 'undefined' ? window.innerHeight : 600;
  }

  private marksLayer: Container | null = null;
  private questLayer: Container | null = null;

  /** World labels: town buildings and people to talk to (x, y in tiles). Call after init. */
  setMarks(marks: readonly { x: number; y: number; label: string; npc: boolean; quest?: '!' | '?' | null }[]): void {
    if (this.questLayer && !this.questLayer.destroyed) this.questLayer.destroy({ children: true });
    const quests = new Container();
    this.questLayer = quests;
    if (this.marksLayer && !this.marksLayer.destroyed) this.marksLayer.destroy({ children: true });
    const layer = new Container();
    this.marksLayer = layer;
    const g = new Graphics();
    layer.addChild(g);
    for (const m of marks) {
      const px = m.x * TILE;
      const py = m.y * TILE;
      if (m.npc) {
        g.circle(px, py - 6, 7).fill(0xe8c860).stroke({ color: 0x2a1a0e, width: 2 });
        g.rect(px - 5, py, 10, 12).fill(0x7a5a9a);
      }
      const t = new Text({
        text: m.label,
        style: {
          fontFamily: 'Georgia, serif',
          fontSize: 12,
          fontWeight: 'bold',
          fill: m.npc ? 0xf0e2bd : 0xffd870,
          stroke: { color: 0x000000, width: 3 },
        },
      });
      t.anchor.set(0.5, 1);
      t.position.set(px, py - (m.npc ? 14 : 0));
      layer.addChild(t);
      if (m.quest) {
        const q = new Text({
          text: m.quest,
          style: { fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 'bold', fill: 0xffd23a, stroke: { color: 0x000000, width: 5 } },
        });
        q.anchor.set(0.5, 1);
        q.position.set(px, py - 28);
        quests.addChild(q);
      }
    }
    this.world.addChildAt(layer, 2);
    this.world.addChild(quests); // above figures, so a quest giver is never hidden
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
    this.attachContextListeners(this.app.canvas ?? this.canvas, true);
    this.app.ticker.stop(); // main.ts drives frames
    const terrainArt = await loadTerrainArt();
    const scenery = prepareScenery(this.map);
    const chunkCache = this.ensureChunkCache();
    chunkCache.init(this.map, terrainArt, scenery);

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
    const atlasOverlay = this.ensureAtlasOverlay();
    this.world.addChild(
      chunkCache.chunks,
      this.rings,
      atlasOverlay.groundLayer,
      this.feel.bloodGraphics,
      this.dustGraphics,
      this.fxGroundGfx,
      this.feel.auraGraphics,
      this.vfx.groundLayer,
    );
    this.fog = fog;
    this.unitAngles = new Float32Array(sim.count);
    this.wasAlive = Array.from({ length: sim.count }, (_, i) => sim.cb.hp[i] > 0);
    this.prevUnitPx = new Float32Array(sim.count);
    this.prevUnitPy = new Float32Array(sim.count);
    this.prevUnitValid = new Uint8Array(sim.count);
    for (let i = 0; i < sim.count; i++) {
      this.unitAngles[i] = (sim.dir[i] * 2 * Math.PI) / 16;
    }

    for (const prev of this.sprites) {
      this.world.removeChild(prev);
      prev.destroy({ children: true });
    }
    this.sprites.length = 0;
    this.baseTint.length = 0;

    const tex = unitTexture();
    this.fallbackUnitTex = tex;
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    this.baselineArtOnly = params.has('crowd') || params.get('art') === '1' || params.get('artstress') === '1';
    this.artStress = params.get('artstress') === '1' && (params.has('crowd') || params.has('battle'));

    const neededExtended = new Set<string>();
    if (!this.baselineArtOnly) {
      for (let i = 0; i < sim.count; i++) {
        if (sim.hidden[i]) continue;
        const fam = sim.cb.family[i];
        if (fam && this.resolveExtendedArtId(fam)) neededExtended.add(fam);
      }
    }
    this.releaseUnusedExtendedAtlases(neededExtended);

    const coreSettled = await runWithPool(
      ALL_UNIT_ART.map((unit) => () => UnitAtlas.load(unit, DEFAULT_LOAD_TIMEOUT_MS)),
      DEFAULT_ATLAS_CONCURRENCY,
    );
    const atlases: UnitAtlas[] = [];
    for (let idx = 0; idx < coreSettled.length; idx++) {
      const r = coreSettled[idx]!;
      if (r.status === 'fulfilled') {
        atlases.push(r.value);
      } else {
        console.warn(`[render] Core atlas fallback for ${ALL_UNIT_ART[idx]}:`, r.reason);
      }
    }
    const extraAtlases = await loadAllExtraAtlases(DEFAULT_ATLAS_CONCURRENCY, DEFAULT_LOAD_TIMEOUT_MS);
    if (!this.baselineArtOnly && neededExtended.size > 0) {
      await runWithPool(
        [...neededExtended].map((fam) => () => this.loadExtendedFamilyAtlas(fam)),
        DEFAULT_ATLAS_CONCURRENCY,
      );
    }
    this.loadedAtlases = atlases;
    this.extraAtlases = extraAtlases;
    const vram = this.ensureVram();
    for (const atlas of atlases) {
      vram.register(
        {
          key: `core:${atlas.unit}`,
          bytes: this.textureFootprint(atlas.source),
          pinned: true,
          onEvict: () => {},
        },
        (key) => this.isVramKeyEvictable(key),
      );
    }
    if (extraAtlases) {
      for (const [k, packed] of Object.entries(extraAtlases)) {
        if (packed?.baseTexture) {
          vram.register(
            {
              key: `extra:${k}`,
              bytes: this.textureFootprint(packed.baseTexture),
              pinned: true,
              onEvict: () => {},
            },
            (key) => this.isVramKeyEvictable(key),
          );
        }
      }
    }
    vram.register(
      {
        key: 'core:fog',
        bytes: this.textureFootprint(this.fogTex),
        pinned: true,
        onEvict: () => {},
      },
      (key) => this.isVramKeyEvictable(key),
    );
    this.atlasByArt = new Map<string, UnitAtlas>(atlases.map((a) => [a.unit, a]));
    for (let i = 0; i < sim.count; i++) {
      const { sprite, baseTint } = this.createUnitSprite(sim, i);
      this.baseTint.push(baseTint);
      this.sprites.push(sprite);
      this.world.addChild(sprite);
    }

    this.dbgGrid.visible = false;
    this.dbgPath.visible = false;
    this.world.addChild(
      this.shots,
      atlasOverlay.overlayLayer,
      this.feel.sparkGraphics,
      this.feel.bubbleGraphics,
      this.feel.slashGraphics,
      this.swingTrailGraphics,
      this.heroGearGraphics,
      this.fxWorldGfx,
      this.fxAddGfx,
      this.vfx.airLayer,
      fog,
      this.dbgGrid,
      this.dbgPath,
    );

    const stageItems: Container[] = [this.world];
    stageItems.push(...this.ensureLightingPass().initStageLayers(this.feel.lightSprite));
    stageItems.push(this.gradeOverlay);
    if (this.aestheticVfx) stageItems.push(this.aestheticVfx.weatherLayer);
    if (this.feel.floaterContainer) stageItems.push(this.feel.floaterContainer);
    stageItems.push(this.floaterLayer, this.nameplates.container, this.overlay);
    this.app.stage.addChild(...stageItems);
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
    this.fxEngine.setQuality(this.quality === 0 ? 'low' : 'high');
    this.fxEngine.setReducedMotion(isReducedMotionActive());
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const res = [1, Math.min(dpr, 1.5), Math.min(dpr, 2)][this.quality];
    try {
      if (this.app.renderer && this.app.renderer.resolution !== res) {
        this.app.renderer.resolution = res;
        if (typeof window !== 'undefined') {
          this.app.renderer.resize(window.innerWidth, window.innerHeight);
        }
      }
    } catch {
      // a renderer that cannot change resolution keeps the old one
    }
    this.ensureLightingPass().syncQuality(this.quality, this.fxEngine.dynamicLighting.isEnabled(), this.feel.lightSprite);
  }

  private burst(x: number, y: number, r: number, ms: number, color: number, fill: boolean, now: number, el = 0): void {
    if (this.bursts.length < 40) this.bursts.push({ x, y, born: now, r, ms, color, fill, el });
  }

  /** Screen position of a fixed-point world point. */
  pointScreen(fx: number, fy: number): [number, number] {
    return this.ensureCamera().pointScreen(fx, fy);
  }

  setBiome(biomeOrAct: BiomeWeatherType | BiomeAct | number | string): void {
    if (typeof biomeOrAct === 'number') {
      (this.aestheticVfx as AestheticVfxSystem | undefined)?.setBiome(biomeOrAct);
    } else if (biomeOrAct === 'swamp' || biomeOrAct === 'desert' || biomeOrAct === 'caves' || biomeOrAct === 'hell') {
      (this.aestheticVfx as AestheticVfxSystem | undefined)?.setBiome(biomeOrAct);
    } else {
      const fx = resolveFxBiomeName(biomeOrAct);
      const act = fx === 'desert' ? 2 : fx === 'crypt' ? 3 : fx === 'caldera' ? 4 : 1;
      (this.aestheticVfx as AestheticVfxSystem | undefined)?.setBiome(act);
    }
    this.currentBiomeName = resolveFxBiomeName(biomeOrAct);
    this.currentWeather = biomeToDefaultWeather(this.currentBiomeName);
    this.fxEngine.dynamicLighting.setBiome(this.currentBiomeName);
    this.fxEngine.regionGrade.setContext({
      biome: this.currentBiomeName,
      region: this.currentRegionName,
      weather: this.currentWeather,
    });
  }

  /** Set region name and optional weather override for A7 region color grading. */
  setRegionContext(ctx: { biome?: string; region?: string; weather?: WeatherKind }): void {
    if (ctx.biome !== undefined) {
      this.currentBiomeName = resolveFxBiomeName(ctx.biome);
      this.fxEngine.dynamicLighting.setBiome(this.currentBiomeName);
    }
    if (ctx.region !== undefined) this.currentRegionName = ctx.region;
    if (ctx.weather !== undefined) this.currentWeather = ctx.weather;
    this.fxEngine.regionGrade.setContext({
      biome: this.currentBiomeName,
      region: this.currentRegionName,
      weather: this.currentWeather,
    });
  }

  /** Start a region intro camera pan from (fromTx, fromTy) back to (toTx, toTy) in tile coordinates. */
  triggerIntroPan(fromTx: number, fromTy: number, toTx: number, toTy: number, regionName: string, durationMs = 2200): boolean {
    return this.ensureCamera().triggerIntroPan(fromTx, fromTy, toTx, toTy, regionName, this.fxEngine.cameraPolish, durationMs);
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
          const isFlinch = hitIdx >= 0 && (isCrit || e.v >= Math.ceil(sim.cb.hpMax[hitIdx] / 12) || e.v >= 12);
          if (hitIdx >= 0) {
            const killed = sim.cb.hp[hitIdx] <= 0;
            const amp = (isCrit ? 9 : isFlinch ? 6.5 : 2.8) * (killed ? 2.0 : 1.25);
            this.kickX[hitIdx] = dirX * amp;
            this.kickY[hitIdx] = dirY * amp * 0.6;
            this.kickAt[hitIdx] = now;
          }

          if (e.el === 0) {
            this.feel?.spawnBlood(wx, wy + 16, dirX, dirY, isCrit ? 14 : isFlinch ? 8 : 4);
            this.feel?.spawnSlash(wx, wy + 12, angle, isCrit, isCrit ? 0xffd700 : 0xf0f0f0, isCrit ? 34 : 24);
          } else {
            this.feel?.spawnSparks(wx, wy + 12, ELEM_COLOR[e.el], isCrit ? 16 : isFlinch ? 10 : 6, isCrit ? 130 : 85);
          }
          this.vfx?.spawnHitSpray(wx, wy + 12, dirX, dirY, e.el === 0, isCrit);

          if (isCrit) {
            this.feel?.addTrauma(0.4);
            this.feel?.triggerHitStop(85, now);
          } else if (isFlinch) {
            this.feel?.addTrauma(0.24);
            this.feel?.triggerHitStop(55, now);
          } else if (isHero) {
            this.feel?.addTrauma(0.2);
          }

          this.fxEngine.hitFeedback.onHit({
            x: wx,
            y: wy + 12,
            dirX,
            dirY,
            damage: e.v,
            maxHp: hitIdx >= 0 ? sim.cb.hpMax[hitIdx] : Math.max(1, e.v * 2),
            isCrit,
            unitId: hitIdx >= 0 ? hitIdx : undefined,
            family: hitIdx >= 0 ? sim.cb.family[hitIdx] : undefined,
          });
        } else if (e.type === 1) this.feel.addDamageFloater('miss', wx, wy, 0xbbbbbb, false, false, now);
        else if (e.type === 3) this.feel.addDamageFloater(`+${e.v} gold`, wx, wy, 0xffd84a, false, false, now);
        else if (e.type === 4) this.feel.addDamageFloater('no mana', wx, wy, 0x6a8cff, false, false, now);
        else if (e.type === 7 && e.v > 0) this.feel.addDamageFloater(`+${e.v}`, wx, wy, BUFF_COLOR, false, false, now);
        else if (e.type === 8 && e.v < 16) this.feel.addDamageFloater(S.statuses[e.v], wx, wy, STATUS_COLORS[e.v], false, false, now);
        else if (e.type === 11) this.feel.addDamageFloater('blocked', wx, wy, 0x70c8ff, false, false, now);
        else if (e.type === 6) {
          if (e.el >= 2 && e.el <= 10 && e.v >= 0 && e.v < SKILL_NAMES.length) {
            this.feel.addDamageFloater(`${SKILL_NAMES[e.v]} ${e.el}`, wx, wy, 0xffd84a, false, false, now);
          }
        }
        else if (e.type === 5) {
          const radPx = Math.max(24, (e.v / 10) * TILE);
          if (!this.vfx?.isApexCast(this.lastCastSid)) this.burst(e.x * k, e.y * k, radPx, 480, ELEM_COLOR[e.el], true, now, e.el);
          this.fxEngine.spellVfx.emitGroundLightBurst(e.x * k, e.y * k, e.el, radPx * 0.95, 380);
          this.fxEngine.dynamicLighting.emitSpellLight(e.x * k, e.y * k, e.el, radPx * 1.45, 420, 1.05);
        } else if (e.type === 9) {
          this.lastCastSid = e.v;
          if (!this.vfx?.isApexCast(e.v)) this.burst(e.x * k, e.y * k - 8, 14, 260, ELEM_COLOR[e.el], false, now, e.el);
          this.fxEngine.spellVfx.emitGroundLightBurst(e.x * k, e.y * k - 8, e.el, 44, 260);
          this.fxEngine.dynamicLighting.emitSpellLight(e.x * k, e.y * k - 10, e.el, 105, 320, 0.85);
          const heroId = sim.hero?.id ?? 0;
          if (sim.count > heroId && Math.hypot(sim.x[heroId] - e.x, sim.y[heroId] - e.y) < FP * 1.5) {
            const dirIdx = sim.dir[heroId] & 15;
            this.fxEngine.cameraPolish.triggerSpellRecoil(DIR_COS[dirIdx], DIR_SIN[dirIdx], 4.5);
          }
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
    this.ensureCamera().centerOn(tx, ty);
  }

  clamp(): void {
    this.ensureCamera().clamp();
  }

  pan(dx: number, dy: number): void {
    this.ensureCamera().pan(dx, dy);
  }

  /** Change zoom by whole steps, keeping the world point under (sx, sy) fixed. */
  zoomBy(dir: 1 | -1, sx: number, sy: number): void {
    this.ensureCamera().zoomBy(dir, sx, sy, this.fxEngine.cameraPolish);
  }

  stepFollow(targetTileX: number, targetTileY: number, dtMs: number): boolean {
    return this.ensureCamera().stepFollow(targetTileX, targetTileY, dtMs, this.fxEngine.cameraPolish);
  }

  stepEdgeScroll(pointerX: number, pointerY: number, dtMs: number, marginPx?: number, maxSpeedPx?: number): boolean {
    return this.ensureCamera().stepEdgeScroll(pointerX, pointerY, dtMs, this.fxEngine.cameraPolish, marginPx, maxSpeedPx);
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
    return this.ensureCamera().toTile(sx, sy);
  }

  /** Screen position of unit i using the last drawn interpolated position, or null when off-screen. */
  unitScreen(i: number): [number, number] | null {
    const s = this.sprites[i];
    if (!s || !s.visible) return null;
    const x = s.x * this.zoom - this.camX;
    const y = (s.y - 6) * this.zoom - this.camY;
    return x < -40 || y < -40 || x > this.viewW + 40 || y > this.viewH + 40 ? null : [x, y];
  }

  unitArt(i: number) {
    const sprite = this.sprites[i];
    return sprite instanceof UnitSprite ? sprite.inspect() : null;
  }

  /** Observe each completed step, including catch-up steps that are never drawn. */
  observe(sim: Sim): void {
    this.animation?.observe(sim);
  }
  resetAnimation(sim: Sim): void {
    this.animation?.reset(sim);
  }
  animationPose(sim: Sim, id: number): AnimationPose {
    const out: AnimationPose = { clip: 'stand', frame: 0, age: 0, finished: false, unresolved: false };
    this.animation?.sample(sim, id, out);
    return out;
  }

  previewArt() {
    return this.artPreview?.inspect() ?? null;
  }

  /** On-demand snapshot only; atlas bytes estimate RGBA storage, not total GPU/process memory. */
  artMetrics() {
    const families: Record<string, number> = Object.fromEntries(ALL_UNIT_ART.map((u) => [u, 0]));
    const sources = new Set<number>();
    let artSprites = 0;
    let visibleArtSprites = 0;
    let onScreenArtSprites = 0;
    let filteredArtSprites = 0;
    let approxAtlasBytes = 0;
    for (const s of this.sprites) {
      if (!(s instanceof UnitSprite)) continue;
      artSprites++;
      families[s.atlas.unit] = (families[s.atlas.unit] ?? 0) + 1;
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
    for (const atlas of this.loadedAtlases) {
      const source = atlas.source.source;
      if (!sources.has(source.uid)) {
        sources.add(source.uid);
        approxAtlasBytes += source.pixelWidth * source.pixelHeight * 4;
      }
    }
    for (const atlas of this.extendedAtlases?.values() ?? []) {
      const source = atlas.source.source;
      if (!sources.has(source.uid)) {
        sources.add(source.uid);
        approxAtlasBytes += source.pixelWidth * source.pixelHeight * 4;
      }
    }
    return {
      loadedFamilies: [
        ...this.loadedAtlases.map((a) => a.unit),
        ...(this.extendedAtlases ? [...this.extendedAtlases.keys()] : []),
      ],
      stress: this.artStress,
      totalSprites: this.sprites.length,
      artSprites,
      visibleArtSprites,
      onScreenArtSprites,
      families,
      uniqueGpuSources: sources.size,
      approxAtlasBytes,
      filteredArtSprites,
      layersPerArtSprite: 4,
      quality: this.quality,
      resolution: this.app.renderer.resolution,
    };
  }

  /** Camera rectangle in tiles. */
  viewTiles(): { x0: number; y0: number; x1: number; y1: number } {
    return this.ensureCamera().viewTiles();
  }

  private updateChunks(): void {
    this.ensureChunkCache().update(this.map, this.viewTiles());
  }

  private updateFog(sim: Sim): void {
    if (!this.fogBuf32 || sim.fogVersion === this.fogSeen) return;
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
    this.ensureLightingPass().renderAmbientFallback(daylight, this.viewW, this.viewH);
  }

  private drawHeroGearOverlays(
    sim: Sim,
    heroIdx: number,
    s: Sprite | UnitSprite,
    smoothAngle: number,
    now: number,
    isAttacking: boolean,
    attackProgress: number,
  ): void {
    const g = this.heroGearGraphics;
    if (!s.visible || sim.cb.hp[heroIdx] <= 0 || !isAttacking) return;

    const hero = sim.hero;
    const weaponId = hero ? hero.eq[Slot.Weapon] : -1;
    const weaponDef = weaponId >= 0 ? getItemDef(weaponId) : undefined;
    const weaponKind = classifyHeroWeapon(weaponDef);

    const hx = s.x;
    const hy = s.y;
    const scale = s.scale.x;
    const weaponAng = smoothAngle + (attackProgress - 0.5) * 1.8;
    const handX = hx + Math.cos(weaponAng) * (7 * scale);
    const handY = hy - 14 * scale + Math.sin(weaponAng) * (4 * scale);

    if (weaponKind === 'sword' || weaponKind === 'axe') {
      const tipDist = (weaponKind === 'sword' ? 20 : 16) * scale;
      drawGlint(g, handX + Math.cos(weaponAng) * tipDist, handY + Math.sin(weaponAng) * tipDist, sim.tick, 77);
    } else if (weaponKind === 'staff') {
      const staffTipX = handX + Math.cos(weaponAng) * (24 * scale);
      const staffTipY = handY + Math.sin(weaponAng) * (24 * scale);
      const crystalPulse = 0.8 + 0.2 * Math.sin(now * 0.008);
      g.circle(staffTipX, staffTipY, 2.5 * scale * crystalPulse).fill({ color: 0x38bdf8, alpha: 0.6 });
      g.circle(staffTipX, staffTipY, 1.2 * scale).fill({ color: 0xffffff, alpha: 0.85 });
    }
  }

  draw(sim: Sim, px: Int32Array, py: Int32Array, alpha: number, v: View): void {
    this.artPreview?.draw(sim.tick);
    const now = performance.now();
    const dtMs = this.lastDrawNow > 0 ? Math.min(100, now - this.lastDrawNow) : 16;
    this.lastDrawNow = now;
    this.ensureFxState();

    // Sync quality & reducedMotion with FxEngine (covers direct renderer.quality writes from main.ts)
    const wantFxQuality = this.quality === 0 ? 'low' : 'high';
    if (this.fxEngine.getConfig().quality !== wantFxQuality) {
      this.fxEngine.setQuality(wantFxQuality);
    }
    const reducedMotion = isReducedMotionActive();
    if (this.fxEngine.getConfig().reducedMotion !== reducedMotion) {
      this.fxEngine.setReducedMotion(reducedMotion);
    }

    this.runFx(sim, now);
    this.fxEngine.update(dtMs);
    this.fxEngine.regionGrade.setDaylight(sim.daylight);

    const [rx, ry] = this.vfx?.rumbleOffset() ?? [0, 0];
    this.feel?.update(dtMs / 1000, now, this.camX, this.camY, this.zoom);
    const fxShake = this.fxEngine.hitFeedback.getShake();
    const camPolish = this.fxEngine.cameraPolish.getTotalOffset();
    this.world.scale.set(this.zoom);
    this.world.position.set(
      -this.camX + rx + (this.feel?.shakeX ?? 0) + fxShake.x * 0.5 + camPolish.x,
      -this.camY + ry + (this.feel?.shakeY ?? 0) + fxShake.y * 0.5 + camPolish.y,
    );
    this.updateChunks();
    if (this.quality > 0 || (this.fogTick++ & 1) === 0) this.updateFog(sim);
    const k = TILE / FP;
    this.feel?.renderAuras(sim, now, k);

    const vt = this.viewTiles();
    const mw = this.map.w;
    const minTx = Math.max(0, Math.floor(vt.x0));
    const maxTx = Math.min(mw - 1, Math.ceil(vt.x1));
    const minTy = Math.max(0, Math.floor(vt.y0));
    const maxTy = Math.min(this.map.h - 1, Math.ceil(vt.y1));

    this.ensureLightingPass().render({
      dl: this.fxEngine.dynamicLighting,
      sim,
      map: this.map,
      biomeName: this.currentBiomeName,
      vt,
      camX: this.camX,
      camY: this.camY,
      zoom: this.zoom,
      viewW: this.viewW,
      viewH: this.viewH,
      quality: this.quality,
      onFallbackDaylight: (daylight) => this.updateLight(daylight),
    });

    // A7 Region / Weather / Daylight Color Grade overlay
    const grade = this.fxEngine.regionGrade.getCurrentGrade();
    this.gradeOverlay.clear();
    if (grade.tintAlpha > 0.004) {
      this.gradeOverlay.rect(0, 0, this.viewW, this.viewH).fill({ color: grade.tintColor, alpha: grade.tintAlpha });
    }

    this.vfx?.updateAndDraw(sim, now, dtMs, this.zoom, this.camX, this.camY, this.overlay, this.viewW, this.viewH);
    (this.aestheticVfx as AestheticVfxSystem | undefined)?.updateAndDraw(now, dtMs, this.camX, this.camY, this.zoom, this.viewW, this.viewH);
    const atmoRegion = this.atmoRegions?.length ? regionAtTile(this.atmoRegions, Math.floor((this.camX + this.viewW / 2) / this.zoom / 32), Math.floor((this.camY + this.viewH / 2) / this.zoom / 32)) : undefined;
    updateAtmosphere(this.app?.stage, this.aestheticVfx?.getBiome?.() ?? 'swamp', dtMs, this.camX, this.camY, this.zoom, this.viewW, this.viewH, this.quality, atmoRegion);

    const cb = sim.cb;
    const z = this.zoom;
    const r = this.rings;
    r.clear();
    const frame8 = (sim.tick >> 2) & 7;

    renderShorelineFoam(r, sim, this.map, minTx, maxTx, minTy, maxTy, frame8);
    renderLootAndShrines(r, sim, mw, this.fxEngine, this.activeLootKeys, this.seenLootKeys, frame8, SHRINE_COLORS);
    renderDestructiblePropsAndHeroTorch(r, sim, this.map, minTx, maxTx, minTy, maxTy, frame8);
    renderCorpseMarks(r, sim, mw, this.sprites);

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
    if (this.prevUnitValid.length < sim.count) {
      this.prevUnitPx = new Float32Array(sim.count);
      this.prevUnitPy = new Float32Array(sim.count);
      const nextValid = new Uint8Array(sim.count);
      nextValid.set(this.prevUnitValid);
      this.prevUnitValid = nextValid;
    }
    this.heroGearGraphics.clear();

    for (let i = 0; i < sim.count; i++) {
      let s = this.sprites[i];
      if (!sim.hidden[i] && !this.baselineArtOnly && this.fallbackUnitTex && this.loadedAtlases?.length) {
        const rawFam = cb.family[i];
        const extArtId = this.resolveExtendedArtId(rawFam);
        if (extArtId && (!(s instanceof UnitSprite) || s.atlas.unit !== extArtId)) {
          if (this.extendedAtlases?.has(extArtId)) {
            const { sprite: upgraded, baseTint } = this.createUnitSprite(sim, i);
            if (s) {
              const childIdx = this.world.getChildIndex(s);
              if (childIdx >= 0) this.world.addChildAt(upgraded, childIdx);
              else this.world.addChild(upgraded);
              this.world.removeChild(s);
              s.destroy({ children: true });
            } else {
              this.world.addChild(upgraded);
            }
            this.sprites[i] = upgraded;
            this.baseTint[i] = baseTint;
            s = upgraded;
          } else if (rawFam) {
            void this.loadExtendedFamilyAtlas(rawFam);
          }
        }
      }
      if (!s) continue;
      const dead = cb.hp[i] <= 0;

      if (this.wasAlive[i] && dead) {
        const famId = cb.family[i];
        const isBoss = famId ? !!bossSpriteDef(famId) : false;
        const isElite = (cb.bossMods[i]?.length ?? 0) > 0 || isBoss;
        const isUndead = famId === 'hollow-knight' || famId === 'restless-dead';
        this.feel?.spawnDeathGore(s.x, s.y, isElite, isUndead, famId, isBoss);
        this.fxEngine.deathFx.onUnitDeath(s.x, s.y, famId, isBoss);
      }
      this.wasAlive[i] = !dead;

      if (sim.hidden[i] || (dead && (cb.corp[i] <= 0 || (s instanceof UnitSprite && !s.atlas.hasClip('die'))))) {
        s.visible = false;
        this.prevUnitValid[i] = 0;
        continue;
      }
      const isFlashing = !dead && this.fxEngine.hitFeedback.isFlashing(i);
      let statusTint = 0;
      const mask = cb.stMask[i];
      if (mask & (1 << St.Stone)) statusTint = 0x8a8a8a;
      else if (mask & (1 << St.Poison)) statusTint = 0x2ecc71;
      else if (mask & (1 << St.Slow)) statusTint = 0x60c0ff;
      else if (mask & (1 << St.Burn)) statusTint = 0xff7722;
      const effectiveStatusTint = isFlashing ? 0xffffff : statusTint;

      if (s instanceof Sprite) {
        const want = dead ? DEAD_TINT : effectiveStatusTint > 0 ? effectiveStatusTint : this.baseTint[i];
        if (s.tint !== want) s.tint = want;
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
        const f = kickT < 0.2 ? kickT / 0.2 : 1 - (kickT - 0.2) / 0.8;
        const ease = f * f * (3 - 2 * f);
        s.x += Math.round(this.kickX[i] * ease);
        s.y += Math.round(this.kickY[i] * ease);
      }
      const sx = s.x * z - this.camX;
      const sy = s.y * z - this.camY;
      const onScreen = sx > -40 && sy > -40 && sx < this.viewW + 40 && sy < this.viewH + 40;
      const tileX = Math.max(0, Math.min(mw - 1, Math.floor(sim.x[i] / FP)));
      const tileY = Math.max(0, Math.min(this.map.h - 1, Math.floor(sim.y[i] / FP)));
      const tile = tileY * mw + tileX;
      s.visible = onScreen && (dead ? !!sim.explored[tile] : sim.team[i] === 0 || sim.visible[tile] === 1);
      s.alpha = dead ? Math.min(1, cb.corp[i] / 200) : 1;

      if (s.visible && !dead) {
        if (this.prevUnitValid[i] && sim.moving[i]) {
          const dxMove = s.x - this.prevUnitPx[i];
          const dyMove = s.y - this.prevUnitPy[i];
          const terr = this.map.terrain[tile];
          const surface = terr === Terrain.Water ? 'water' : terr === Terrain.Marsh ? 'marsh' : this.currentBiomeName;
          this.fxEngine.footsteps.recordMove(i, s.x, s.y, dxMove, dyMove, surface);
        }
        this.prevUnitPx[i] = s.x;
        this.prevUnitPy[i] = s.y;
        this.prevUnitValid[i] = 1;
      } else {
        this.prevUnitValid[i] = 0;
      }

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
        s.update(sim.tick, !!sim.moving[i], smoothDir, sim.team[i], armorTier, sim.cb.tier[i] || 1, stone, this.pose, effectiveStatusTint, isHero, weaponVisual);
        if (!stone && effectiveStatusTint === 0) {
          const ch = s.layers;
          if (ch[0]) ch[0].tint = 0xffffff;
          if (isHero && sim.team[i] === 0) {
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
      stg.arc(st.x, st.y, rad, startA, endA).stroke({ color: st.color, width: 2.5 * (1 - progress * 0.5), alpha: arcAlpha });
      stg.arc(st.x, st.y, rad * 0.85, startA + 0.2, endA - 0.2).stroke({ color: 0xffffff, width: 1.2 * (1 - progress), alpha: arcAlpha * 0.9 });
    }

    const sh = this.shots;
    sh.clear();

    renderTownArchitecture(r, sh, sim, this.map, frame8);
    this.nameplates?.update(sim, this.sprites, this.zoom, this.camX, this.camY, this.viewW, this.viewH, v);
    renderUnitIndicators(
      r,
      sh,
      sim,
      this.sprites,
      v,
      this.quality,
      frame8,
      DIR_COS,
      DIR_SIN,
      STATUS_COLORS,
      FAMILY_VISUALS,
      this.nameplates,
      this.vfx,
    );
    renderSelectionAndHover(r, sim, this.sprites, this.fxEngine, v);
    renderProjectilesAndBursts(sh, sim, this.bursts, now);
    renderScreenOverlays(
      this.overlay,
      sim,
      this.sprites,
      v,
      this.fxEngine,
      this.pingState,
      this.camX,
      this.camY,
      z,
      this.viewW,
      this.viewH,
      now,
      this.vfx,
    );
    this.renderFxEngineLayers();
    this.ensureAtlasOverlay().render({
      sim,
      map: this.map,
      atlases: this.extraAtlases ?? null,
      sprites: this.sprites,
      quality: this.quality,
      reducedMotion,
      biomeName: this.currentBiomeName,
      vt,
      telegraphs: this.activeTelegraphs,
      adventureObjects: this.worldAdventureObjects,
      waypoints: this.worldWaypoints,
    });
    if (!this.contextLost && this.app?.renderer) {
      this.app.render();
    }
  }

  private ensureFxState(): void {
    const self = this as unknown as {
      fxEngine?: FxEngine;
      fxGroundGfx?: Graphics;
      fxWorldGfx?: Graphics;
      fxAddGfx?: Graphics;
      gradeOverlay?: Graphics;
      activeLootKeys?: Set<string>;
      seenLootKeys?: Set<string>;
      prevUnitPx?: Float32Array;
      prevUnitPy?: Float32Array;
      prevUnitValid?: Uint8Array;
      pingState?: PingState;
      deathAt?: (number | undefined)[];
      unitAngles?: Float32Array;
      wasAlive?: boolean[];
      heroGearGraphics?: Graphics;
      dustGraphics?: Graphics;
      swingTrailGraphics?: Graphics;
      dustPuffs?: Array<{ x: number; y: number; vx: number; vy: number; size: number; alpha: number; born: number; lifeMs: number; color: number }>;
      swingTrails?: Array<{ x: number; y: number; angle: number; radius: number; color: number; born: number; lifeMs: number }>;
      atlasByArt?: Map<string, UnitAtlas>;
      extendedAtlases?: Map<ExtendedMonsterArt, UnitAtlas>;
      extendedAtlasPromises?: Map<ExtendedMonsterArt, Promise<UnitAtlas | null>>;
      failedExtendedAtlases?: Set<ExtendedMonsterArt>;
      activeExtendedArt?: Set<ExtendedMonsterArt>;
    };
    self.fxEngine ??= new FxEngine({
      quality: this.quality === 0 ? 'low' : 'high',
      reducedMotion: isReducedMotionActive(),
    });
    self.fxGroundGfx ??= new Graphics();
    self.fxWorldGfx ??= new Graphics();
    self.fxAddGfx ??= new Graphics();
    self.gradeOverlay ??= new Graphics();
    self.activeLootKeys ??= new Set();
    self.seenLootKeys ??= new Set();
    self.prevUnitPx ??= new Float32Array(0);
    self.prevUnitPy ??= new Float32Array(0);
    self.prevUnitValid ??= new Uint8Array(0);
    self.pingState ??= { lastPingX: Number.NaN, lastPingY: Number.NaN, lastPingAge: 2 };
    self.deathAt ??= [];
    self.unitAngles ??= new Float32Array(0);
    self.wasAlive ??= [];
    self.heroGearGraphics ??= new Graphics();
    self.dustGraphics ??= new Graphics();
    self.swingTrailGraphics ??= new Graphics();
    self.dustPuffs ??= [];
    self.swingTrails ??= [];
    self.atlasByArt ??= new Map();
    self.extendedAtlases ??= new Map();
    self.extendedAtlasPromises ??= new Map();
    self.failedExtendedAtlases ??= new Set();
    self.activeExtendedArt ??= new Set();
    this.ensureCamera();
    this.ensureLightingPass();
    this.ensureChunkCache();
    this.ensureAtlasOverlay();
  }

  private renderFxEngineLayers(): void {
    renderFxEngineWorldLayers(this.fxGroundGfx, this.fxWorldGfx, this.fxAddGfx, this.fxEngine);
  }
}
