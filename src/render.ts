import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { ObjectKind, TILE, Terrain, type GameMap } from './map';
import { FP, type Sim } from './sim/sim';

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

export interface View {
  selected: ReadonlySet<number>;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  ping: { x: number; y: number; age: number } | null; // world tile coords, age 0..1
}

export class Renderer {
  readonly app = new Application();
  readonly world = new Container();
  private readonly rings = new Graphics();
  private readonly overlay = new Graphics();
  private readonly light = new Graphics();
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
      s.tint = i === 0 && sim.team[i] === 0 ? HERO_TINT : TEAM_TINT[sim.team[i]] ?? 0xffffff;
      this.sprites.push(s);
      this.world.addChild(s);
    }
    this.world.addChild(fog);
    this.light.blendMode = 'multiply';
    this.app.stage.addChild(this.world, this.light, this.overlay);
    this.centerOn(sim.x[0] / FP, sim.y[0] / FP);
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
    this.updateFog(sim);
    this.updateLight(sim.daylight);
    const k = TILE / FP;
    const mw = this.map.w;
    for (let i = 0; i < sim.count; i++) {
      const s = this.sprites[i];
      s.x = Math.round((px[i] + (sim.x[i] - px[i]) * alpha) * k);
      s.y = Math.round((py[i] + (sim.y[i] - py[i]) * alpha) * k);
      s.zIndex = s.y;
      if (sim.team[i] !== 0) s.visible = sim.visible[Math.floor(sim.y[i] / FP) * mw + Math.floor(sim.x[i] / FP)] === 1;
    }
    this.world.sortableChildren = false;
    const r = this.rings;
    r.clear();
    for (const id of v.selected) {
      const s = this.sprites[id];
      const dir = sim.dir[id];
      r.ellipse(s.x, s.y, 11, 5)
        .stroke({ color: 0x9dff7a, width: 2 })
        .moveTo(s.x, s.y)
        .lineTo(s.x + DIR_COS[dir] * 15, s.y + DIR_SIN[dir] * 7)
        .stroke({ color: 0xffffff, width: 2 });
    }
    const o = this.overlay;
    o.clear();
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
