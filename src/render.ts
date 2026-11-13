import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { ObjectKind, Terrain, TILE, type GameMap } from './map';
import { loadTerrainArt, paintTerrainChunk, prepareScenery, type SceneryPlacement } from './terrain';
import { Kind } from './sim/combat';
import { SKILL_NAMES } from './sim/hero';
import { FP, type Sim } from './sim/sim';
import { SPELLS, St, Tk } from './sim/spelldata';
import { S } from './strings';
import { getItemDef, Slot } from './sim/items';
import { itemRarity } from './sim/town';
import { UnitAtlas, UnitSprite, ALL_UNIT_ART, UNIT_ART, bossSpriteDef } from './sprites/units';
import { ArtPreview } from './sprites/preview';
import { CombatAnimation, type AnimationPose } from './sprites/combat-animation';
import { VfxSystem } from './vfx';
import { CombatFeelSystem } from './feel';

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
  [Kind.Warrior]: { scale: 1 },
  [Kind.Archer]: { scale: 0.92 },
  [Kind.Hero]: { tint: HERO_TINT, scale: 1.15 },
  [Kind.Mage]: { tint: 0xc9a0ff, scale: 0.95 },
  [Kind.Gnoll]: { tint: 0xc4a35a, scale: 1 },
  [Kind.Golem]: { tint: 0xa8a8b0, scale: 1.5 },
  [Kind.Imp]: { tint: 0xff7a3a, scale: 0.8 },
};
const ELEM_COLOR = [0xffffff, 0xff9a3a, 0x6ac8ff, 0xd8f0ff, 0xb59a6a, 0xd48aff];
/** Colours of the status pips drawn over a unit, indexed by status id. */
export const STATUS_COLORS = [0xffe070, 0x70c8ff, 0xffffff, 0x6a8cff, 0x7cd14a, 0xff7a2a, 0x9a9a9a, 0xb070c0];
const BUFF_COLOR = 0x7affa0;
export const QUALITY_NAMES = ['Low', 'Medium', 'High'] as const;
const FLOATERS = [0, 10, 24];
const FLOAT_MS = 900;

function chunkSide(map: GameMap): number {
  return Math.max(map.w, map.h) > 128 ? 32 : 16;
}

function unitTexture(): Texture {
  const cv = document.createElement('canvas');
  cv.width = 24;
  cv.height = 32;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.beginPath();
  g.ellipse(12, 28, 9, 3.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.fillRect(6, 10, 12, 17);
  g.fillStyle = '#e8d5b0';
  g.beginPath();
  g.arc(12, 7, 5, 0, Math.PI * 2);
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
  private readonly rings = new Graphics();
  private readonly overlay = new Graphics();
  private readonly light = new Graphics();
  private readonly shots = new Graphics();
  private readonly dbgGrid = new Graphics();
  private readonly dbgPath = new Graphics();
  private dbgBuilt = false;
  private readonly floaterLayer = new Container();
  private floaters: Floater[] = [];
  private bursts: Burst[] = [];
  private baseTint: number[] = [];
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
  private lastDrawNow = 0;
  private lastCastSid = -1;
  zoom = 1;
  camX = 0;
  camY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly map: GameMap,
  ) {
    this.feel = new CombatFeelSystem(map.w, map.h);
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
    this.world.addChild(this.chunks, this.rings, this.feel.bloodGraphics, this.feel.auraGraphics, this.vfx.groundLayer);
    this.fog = fog;
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
        : kind === Kind.Hero ? atlases[0]
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
      const finalScale = boss?.scale ?? look.scale;
      s.scale.set(finalScale);
      // Your units keep the team colour (the hero stays gold); monsters use the colour of their kind.
      if (s instanceof Sprite) {
        if (sim.team[i] === 0) s.tint = kind === Kind.Hero || kind === Kind.Mage ? look.tint! : TEAM_TINT[0];
        else if (boss?.signatureColor) s.tint = boss.signatureColor;
        else s.tint = kind === Kind.Archer ? TEAM_TINT[1] : look.tint ?? TEAM_TINT[1];
      }
      this.baseTint.push(s.tint as number);
      this.sprites.push(s);
      this.world.addChild(s);
    }
    this.dbgGrid.visible = false;
    this.dbgPath.visible = false;
    this.world.addChild(this.shots, this.feel.sparkGraphics, this.feel.bubbleGraphics, this.feel.slashGraphics, this.vfx.airLayer, fog, this.dbgGrid, this.dbgPath);
    if (this.feel.lightSprite) {
      this.app.stage.addChild(this.world, this.feel.lightSprite, this.feel.floaterContainer, this.floaterLayer, this.overlay);
    } else {
      this.light.blendMode = 'multiply';
      this.app.stage.addChild(this.world, this.light, this.floaterLayer, this.overlay);
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
          for (let u = 0; u < sim.count; u++) {
            if (sim.cb.hp[u] > 0 && sim.cb.tgt[u] >= 0) {
              const target = sim.cb.tgt[u];
              if (sim.x[target] === e.x && sim.y[target] === e.y) {
                dirX = e.x - sim.x[u];
                dirY = e.y - sim.y[u];
                break;
              }
            }
          }
          const len = Math.hypot(dirX, dirY) || 1;
          dirX /= len;
          dirY /= len;
          const angle = Math.atan2(dirY, dirX);

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
      this.feel.renderLighting(this.viewW, this.viewH, heroX, heroY, this.camX, this.camY, this.zoom, sim.daylight, now, extraLights);
    } else {
      this.updateLight(sim.daylight);
    }
    this.vfx?.updateAndDraw(sim, now, dtMs, this.zoom, this.camX, this.camY, this.overlay, this.viewW, this.viewH);
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
    // Specular glints over chests/relics in scenery
    for (let oIdx = 0; oIdx < this.map.objects.length; oIdx++) {
      const obj = this.map.objects[oIdx];
      if (obj.kind === ObjectKind.House) continue;
      if (obj.x < minTx || obj.x > maxTx || obj.y < minTy || obj.y > maxTy) continue;
      const ox = (obj.x + 0.5) * TILE;
      const oy = (obj.y + 0.5) * TILE;
      if (sim.explored[obj.y * mw + obj.x]) {
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
      r.moveTo(cx - 5, cy - 2).lineTo(cx + 5, cy + 3).moveTo(cx + 5, cy - 2).lineTo(cx - 5, cy + 3).stroke({ color: 0xd8cdb0, width: 2, alpha: a });
    }
    for (let i = 0; i < sim.count; i++) {
      const s = this.sprites[i];
      const dead = cb.hp[i] <= 0;
      if (sim.hidden[i] || (dead && (cb.corp[i] <= 0 || !(s instanceof UnitSprite) || !s.atlas.hasClip('die')))) {
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
        const want = statusTint > 0 ? statusTint : this.baseTint[i];
        if (s.tint !== want) s.tint = want;
      }
      s.x = Math.round((px[i] + (sim.x[i] - px[i]) * alpha) * k);
      s.y = Math.round((py[i] + (sim.y[i] - py[i]) * alpha) * k);
      const sx = s.x * z - this.camX;
      const sy = s.y * z - this.camY;
      const onScreen = sx > -40 && sy > -40 && sx < this.viewW + 40 && sy < this.viewH + 40;
      const tile = Math.floor(sim.y[i] / FP) * mw + Math.floor(sim.x[i] / FP);
      s.visible = onScreen && (dead ? !!sim.explored[tile] : sim.team[i] === 0 || sim.visible[tile] === 1);
      s.alpha = dead ? Math.min(1, cb.corp[i] / 200) : 1;
      if (s.visible && s instanceof UnitSprite) {
        const armour = sim.hero?.id === i ? (sim.hero.eq[Slot.Armor] >= 0 ? getItemDef(sim.hero.eq[Slot.Armor])?.tier ?? 0 : 0) : 1;
        this.animation?.sample(sim, i, this.pose);
        s.update(sim.tick, !!sim.moving[i], sim.dir[i], sim.team[i], armour, sim.cb.tier[i] || 1, !!(mask & (1 << St.Stone)), this.pose, statusTint);
      }
      if (s.visible && !dead && (sim.tick & 3) === 0) {
        if (mask & (1 << St.Poison)) this.feel?.spawnPoisonBubbles(s.x, s.y - 14, 1);
        else if (mask & (1 << St.Burn)) this.feel?.spawnBurnEmbers(s.x, s.y - 12, 1);
      }
    }
    const sh = this.shots;
    sh.clear();
    // Hit-point bars: Low draws them only for selected units, Medium adds hurt units, High draws every hurt unit in view.
    for (let i = 0; i < sim.count; i++) {
      const s = this.sprites[i];
      if (!s.visible || cb.hp[i] <= 0) continue;
      const hurt = cb.hp[i] < cb.hpMax[i];
      const sel = v.selected.has(i);
      if (!(sel || (hurt && this.quality > 0))) continue;
      const f = cb.hp[i] / cb.hpMax[i];
      const w = 20 * (s.scale.x > 1.2 ? 1.4 : 1);
      const y = s.y - (s instanceof UnitSprite ? 48 : 36) * s.scale.y;
      sh.rect(s.x - w / 2 - 1, y - 1, w + 2, 5).fill(0x000000);
      sh.rect(s.x - w / 2, y, w * f, 3).fill(sim.team[i] === 0 ? (f > 0.35 ? 0x5fd35f : 0xe0b030) : 0xe05a4a);
    }
    // Status pips above the bar, a ring for a live shield, and a mana bar under the hit-point bar of selected casters.
    for (let i = 0; i < sim.count; i++) {
      const s = this.sprites[i];
      if (!s.visible || cb.hp[i] <= 0) continue;
      const m = cb.stMask[i];
      const y = s.y - (s instanceof UnitSprite ? 48 : 36) * s.scale.y;
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
      const boss = cb.family[i] ? bossSpriteDef(cb.family[i]) : undefined;
      const s = this.sprites[i];
      const auraTint = boss?.auraTint ?? 0xf4b43a;
      const baseRadius = boss ? Math.round(14 * (boss.scale / 1.3)) : 13;
      r.ellipse(s.x, s.y, baseRadius, Math.round(baseRadius * 0.46)).stroke({ color: auraTint, width: 1.5, alpha: 0.85 });
      if (boss || cb.bossMods[i]?.includes('blessed_aura')) {
        const pulse = 1 + 0.15 * Math.sin(sim.tick * 0.2);
        const outerTint = boss ? boss.auraTint : 0xffd700;
        r.ellipse(s.x, s.y, Math.round(baseRadius * 1.8 * pulse), Math.round(baseRadius * 0.9 * pulse)).stroke({ color: outerTint, width: 1.5, alpha: 0.5 });
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
      o.circle(sx, sy, (6 + v.ping.age * 16) * this.zoom).stroke({ color: 0xffffff, width: 2, alpha: 1 - v.ping.age });
    }
    this.app.render();
  }
}
