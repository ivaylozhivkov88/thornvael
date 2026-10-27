import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { ObjectKind, TILE, Terrain, type GameMap } from './map';
import { Kind } from './sim/combat';
import { SKILL_NAMES } from './sim/hero';
import { FP, type Sim } from './sim/sim';
import { SPELLS, St, Tk } from './sim/spelldata';
import { S } from './strings';

const CHUNK = 16; // tiles per chunk side, so each baked texture is 512 px
const BASE: Record<number, [number, number, number]> = {
  [Terrain.Grass]: [63, 90, 46],
  [Terrain.Dirt]: [122, 100, 70],
  [Terrain.Water]: [44, 79, 120],
  [Terrain.Rock]: [96, 96, 100],
  [Terrain.Marsh]: [70, 84, 52],
};
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

function shade(c: [number, number, number], l: number, extra = 0): string {
  const k = l / 255;
  return `rgb(${Math.min(255, Math.round(c[0] * k + extra))},${Math.min(255, Math.round(c[1] * k + extra))},${Math.min(255, Math.round(c[2] * k + extra))})`;
}

function bakeChunk(map: GameMap, cx: number, cy: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = CHUNK * TILE;
  const g = cv.getContext('2d')!;
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) {
      const x = cx * CHUNK + tx;
      const y = cy * CHUNK + ty;
      if (x >= map.w || y >= map.h) continue;
      const i = y * map.w + x;
      g.fillStyle = shade(BASE[map.terrain[i]], map.light[i], map.height[i] * 4);
      g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      // Cliff edge where the tile to the south is lower: a dark band reads as a height step.
      if (y + 1 < map.h && map.height[(y + 1) * map.w + x] < map.height[i] && map.terrain[i] !== Terrain.Water) {
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(tx * TILE, ty * TILE + TILE - 5, TILE, 5);
      }
    }
  }
  for (const o of map.objects) {
    const px = (o.x - cx * CHUNK) * TILE;
    const py = (o.y - cy * CHUNK) * TILE;
    if (px < -TILE * 2 || py < -TILE * 2 || px > CHUNK * TILE || py > CHUNK * TILE) continue;
    if (o.kind === ObjectKind.Tree) {
      g.fillStyle = '#4a3220';
      g.fillRect(px + 13, py + 18, 6, 12);
      g.fillStyle = '#1f4a1c';
      g.beginPath();
      g.arc(px + 16, py + 14, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2d6428';
      g.beginPath();
      g.arc(px + 13, py + 11, 7, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = '#6b4a2b';
      g.fillRect(px + 2, py + 14, 60, 48);
      g.fillStyle = '#8c2f27';
      g.beginPath();
      g.moveTo(px - 2, py + 18);
      g.lineTo(px + 32, py - 4);
      g.lineTo(px + 66, py + 18);
      g.fill();
      g.fillStyle = '#2a1a0e';
      g.fillRect(px + 26, py + 36, 12, 26);
    }
  }
  return cv;
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
}

export class Renderer {
  readonly app = new Application();
  readonly world = new Container();
  private readonly rings = new Graphics();
  private readonly overlay = new Graphics();
  private readonly light = new Graphics();
  private readonly shots = new Graphics();
  private readonly floaterLayer = new Container();
  private floaters: Floater[] = [];
  private bursts: Burst[] = [];
  private baseTint: number[] = [];
  private freeText: Text[] = [];
  private fogTick = 0;
  quality = 2;
  private sprites: Sprite[] = [];
  private fogCv!: HTMLCanvasElement;
  private fogTex!: Texture;
  private fogImg!: ImageData;
  private fogSeen = -1;
  private lightKey = '';
  private fog!: Sprite;
  zoom = 1;
  camX = 0;
  camY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly map: GameMap,
  ) {}

  async init(sim: Sim): Promise<void> {
    await this.app.init({
      canvas: this.canvas,
      resizeTo: window,
      background: '#14100c',
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    this.app.ticker.stop(); // main.ts drives frames
    const chunks = new Container();
    for (let cy = 0; cy * CHUNK < this.map.h; cy++) {
      for (let cx = 0; cx * CHUNK < this.map.w; cx++) {
        const s = new Sprite(Texture.from(bakeChunk(this.map, cx, cy)));
        s.position.set(cx * CHUNK * TILE, cy * CHUNK * TILE);
        chunks.addChild(s);
      }
    }
    // Fog: one pixel per tile, stretched over the map with linear filtering for soft edges.
    this.fogCv = document.createElement('canvas');
    this.fogCv.width = this.map.w;
    this.fogCv.height = this.map.h;
    this.fogImg = this.fogCv.getContext('2d')!.createImageData(this.map.w, this.map.h);
    this.fogTex = Texture.from(this.fogCv);
    const fog = new Sprite(this.fogTex);
    fog.width = this.map.w * TILE;
    fog.height = this.map.h * TILE;
    this.world.addChild(chunks, this.rings);
    this.fog = fog;
    const tex = unitTexture();
    for (let i = 0; i < sim.count; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5, 0.88);
      const kind = sim.cb.kind[i];
      const look = KIND_LOOK[kind] ?? { scale: 1 };
      s.scale.set(look.scale);
      // Your units keep the team colour (the hero stays gold); monsters use the colour of their kind.
      if (sim.team[i] === 0) s.tint = kind === Kind.Hero || kind === Kind.Mage ? look.tint! : TEAM_TINT[0];
      else s.tint = kind === Kind.Archer ? TEAM_TINT[1] : look.tint ?? TEAM_TINT[1];
      this.baseTint.push(s.tint as number);
      this.sprites.push(s);
      this.world.addChild(s);
    }
    this.world.addChild(this.shots, fog);
    this.light.blendMode = 'multiply';
    this.app.stage.addChild(this.world, this.light, this.floaterLayer, this.overlay);
    this.centerOn(sim.x[0] / FP, sim.y[0] / FP);
    this.setQuality(this.quality);
  }

  /** 0 Low, 1 Medium, 2 High: resolution, lighting, hit-point bars and floating numbers. */
  setQuality(q: number): void {
    this.quality = Math.max(0, Math.min(2, q));
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

  private burst(x: number, y: number, r: number, ms: number, color: number, fill: boolean, now: number): void {
    if (this.bursts.length < 40) this.bursts.push({ x, y, born: now, r, ms, color, fill });
  }

  /** Screen position of a fixed-point world point. */
  pointScreen(fx: number, fy: number): [number, number] {
    const k = TILE / FP;
    return [fx * k * this.zoom - this.camX, fy * k * this.zoom - this.camY];
  }

  private runFx(sim: Sim, now: number): void {
    const fx = sim.cb.fx;
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
        if (e.type === 0) this.floater(String(e.v), ELEM_COLOR[e.el], wx, wy, now);
        else if (e.type === 1) this.floater('miss', 0xbbbbbb, wx, wy, now);
        else if (e.type === 3) this.floater(`+${e.v} gold`, 0xffd84a, wx, wy, now);
        else if (e.type === 4) this.floater('no mana', 0x6a8cff, wx, wy, now);
        else if (e.type === 7 && e.v > 0) this.floater(`+${e.v}`, BUFF_COLOR, wx, wy, now);
        else if (e.type === 8 && e.v < 16) this.floater(S.statuses[e.v], STATUS_COLORS[e.v], wx, wy, now);
        else if (e.type === 11) this.floater('blocked', 0x70c8ff, wx, wy, now);
        else if (e.type === 6) this.floater(`${SKILL_NAMES[e.v]} ${e.el}`, 0xffd84a, wx, wy, now);
        else if (e.type === 5) this.burst(e.x * k, e.y * k, (e.v / 10) * TILE, 480, ELEM_COLOR[e.el], true, now);
        else if (e.type === 9) this.burst(e.x * k, e.y * k - 8, 14, 260, ELEM_COLOR[e.el], false, now);
        else if (e.type === 10) this.burst(e.x * k, e.y * k - 6, 22, 420, e.v === 1 ? BUFF_COLOR : ELEM_COLOR[5], e.v !== 2, now);
      }
    }
    fx.length = 0;
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
    return this.app.screen.width;
  }
  get viewH(): number {
    return this.app.screen.height;
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

  /** Camera rectangle in tiles. */
  viewTiles(): { x0: number; y0: number; x1: number; y1: number } {
    const s = TILE * this.zoom;
    return { x0: this.camX / s, y0: this.camY / s, x1: (this.camX + this.viewW) / s, y1: (this.camY + this.viewH) / s };
  }

  private updateFog(sim: Sim): void {
    if (sim.fogVersion === this.fogSeen) return;
    this.fogSeen = sim.fogVersion;
    const d = this.fogImg.data;
    for (let i = 0; i < this.map.w * this.map.h; i++) {
      d[4 * i] = 8;
      d[4 * i + 1] = 6;
      d[4 * i + 2] = 12;
      d[4 * i + 3] = sim.visible[i] ? 0 : sim.explored[i] ? 130 : 245;
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
    this.world.scale.set(this.zoom);
    this.world.position.set(-this.camX, -this.camY);
    if (this.quality > 0 || (this.fogTick++ & 1) === 0) this.updateFog(sim);
    this.updateLight(sim.daylight);
    const now = performance.now();
    this.runFx(sim, now);
    const k = TILE / FP;
    const mw = this.map.w;
    const cb = sim.cb;
    const z = this.zoom;
    const r = this.rings;
    r.clear();
    // Loot sacks under the units, only on ground the player has seen.
    for (let n = 0; n < cb.sG.length; n++) {
      if (!cb.sG[n]) continue;
      if (!sim.explored[Math.floor(cb.sY[n] / FP) * mw + Math.floor(cb.sX[n] / FP)]) continue;
      const sx = cb.sX[n] * k;
      const sy = cb.sY[n] * k;
      r.ellipse(sx, sy + 2, 7, 3).fill({ color: 0x000000, alpha: 0.35 });
      r.circle(sx, sy - 3, 6).fill(0xa8803c).stroke({ color: 0x4a3414, width: 1 });
      r.rect(sx - 2, sy - 10, 4, 3).fill(0xe0c060);
    }
    // Item bags: a small blue satchel with a pale clasp, so loot reads differently from gold.
    for (let n = 0; n < cb.bI.length; n++) {
      if (!cb.bI[n]) continue;
      if (!sim.explored[Math.floor(cb.bY[n] / FP) * mw + Math.floor(cb.bX[n] / FP)]) continue;
      const bx = cb.bX[n] * k;
      const by = cb.bY[n] * k;
      r.ellipse(bx, by + 2, 7, 3).fill({ color: 0x000000, alpha: 0.35 });
      r.roundRect(bx - 6, by - 9, 12, 10, 3).fill(0x3c5a8c).stroke({ color: 0x1a2a48, width: 1 });
      r.rect(bx - 2, by - 6, 4, 3).fill(0xd8e4f4);
    }
    // Bodies stay for a minute so a corpse spell has something to aim at; they sink into the ground at the end.
    for (let i = 0; i < sim.count; i++) {
      if (cb.hp[i] > 0 || cb.corp[i] <= 0) continue;
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
      if (cb.hp[i] <= 0 || sim.hidden[i]) {
        s.visible = false;
        continue;
      }
      const want = cb.stMask[i] & (1 << St.Stone) ? 0x8a8a8a : this.baseTint[i];
      if (s.tint !== want) s.tint = want;
      s.x = Math.round((px[i] + (sim.x[i] - px[i]) * alpha) * k);
      s.y = Math.round((py[i] + (sim.y[i] - py[i]) * alpha) * k);
      const sx = s.x * z - this.camX;
      const sy = s.y * z - this.camY;
      const onScreen = sx > -40 && sy > -40 && sx < this.viewW + 40 && sy < this.viewH + 40;
      s.visible = onScreen && (sim.team[i] === 0 || sim.visible[Math.floor(sim.y[i] / FP) * mw + Math.floor(sim.x[i] / FP)] === 1);
    }
    const sh = this.shots;
    sh.clear();
    // Hit-point bars: Low draws them only for selected units, Medium adds hurt units, High draws every hurt unit in view.
    for (let i = 0; i < sim.count; i++) {
      const s = this.sprites[i];
      if (!s.visible) continue;
      const hurt = cb.hp[i] < cb.hpMax[i];
      const sel = v.selected.has(i);
      if (!(sel || (hurt && this.quality > 0))) continue;
      const f = cb.hp[i] / cb.hpMax[i];
      const w = 20 * (s.scale.x > 1.2 ? 1.4 : 1);
      const y = s.y - 36 * s.scale.y;
      sh.rect(s.x - w / 2 - 1, y - 1, w + 2, 5).fill(0x000000);
      sh.rect(s.x - w / 2, y, w * f, 3).fill(sim.team[i] === 0 ? (f > 0.35 ? 0x5fd35f : 0xe0b030) : 0xe05a4a);
    }
    // Status pips above the bar, a ring for a live shield, and a mana bar under the hit-point bar of selected casters.
    for (let i = 0; i < sim.count; i++) {
      const s = this.sprites[i];
      if (!s.visible) continue;
      const m = cb.stMask[i];
      const y = s.y - 36 * s.scale.y;
      if (m) {
        let n = 0;
        for (let st = 0; st < 8; st++) {
          if (!(m & (1 << st))) continue;
          sh.rect(s.x - 12 + n * 5, y - 7, 4, 4).fill(STATUS_COLORS[st]).stroke({ color: 0x000000, width: 1 });
          n++;
        }
        if (m & (1 << St.Shield)) sh.ellipse(s.x, s.y - 12 * s.scale.y, 12, 15 * s.scale.y).stroke({ color: 0x70c8ff, width: 1.5, alpha: 0.8 });
      }
      if (v.selected.has(i) && cb.mana[i] > 0) {
        const w = 20 * (s.scale.x > 1.2 ? 1.4 : 1);
        sh.rect(s.x - w / 2, y + 4, w * Math.min(1, cb.mana[i] / Math.max(1, cb.manaMax[i])), 2).fill(0x5a8cff);
      }
    }
    for (const id of v.selected) {
      const s = this.sprites[id];
      if (!s.visible) continue;
      const dir = sim.dir[id];
      r.ellipse(s.x, s.y, 11, 5)
        .stroke({ color: 0x9dff7a, width: 2 })
        .moveTo(s.x, s.y)
        .lineTo(s.x + DIR_COS[dir] * 15, s.y + DIR_SIN[dir] * 7)
        .stroke({ color: 0xffffff, width: 2 });
    }
    if (v.hover) {
      const s = this.sprites[v.hover.id];
      if (s.visible) r.ellipse(s.x, s.y, 13, 6).stroke({ color: v.hover.ok ? 0xff5a4a : 0x999999, width: 2 });
    }
    for (let p = 0; p < cb.pAlive.length; p++) {
      if (!cb.pAlive[p]) continue;
      const wx = cb.pX[p] * k;
      const wy = cb.pY[p] * k - 14;
      const el = cb.pEl[p];
      const spell = cb.pS[p] > 0 ? SPELLS[cb.pS[p] - 1] : null;
      if (spell && (spell.tk === Tk.Ally || spell.heal)) sh.circle(wx, wy, 4).fill(BUFF_COLOR).stroke({ color: 0xffffff, width: 1 });
      else if (spell) sh.circle(wx, wy, 5).fill(ELEM_COLOR[el]).stroke({ color: 0xffffff, width: 1, alpha: 0.7 });
      else if (el === 0) {
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
      if (b.fill) sh.circle(b.x, b.y, rad).fill({ color: b.color, alpha: 0.28 * (1 - age) }).stroke({ color: b.color, width: 2, alpha: 1 - age });
      else sh.circle(b.x, b.y, rad).stroke({ color: b.color, width: 2, alpha: 1 - age });
    }
    const o = this.overlay;
    o.clear();
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
