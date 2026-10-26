import { Terrain, type GameMap } from './map';
import { FP, type Sim } from './sim/sim';

const COLOR: Record<number, [number, number, number]> = {
  [Terrain.Grass]: [70, 104, 52],
  [Terrain.Dirt]: [132, 108, 76],
  [Terrain.Water]: [48, 86, 132],
  [Terrain.Rock]: [104, 104, 108],
  [Terrain.Marsh]: [78, 92, 60],
};
const SCALE = 3; // canvas pixels per tile

/** Small separate 2D canvas: one pixel per tile (terrain with fog) scaled up, plus unit dots and the camera frame. */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;
  private readonly baseCtx: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private fogSeen = -1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly map: GameMap,
  ) {
    canvas.width = map.w * SCALE;
    canvas.height = map.h * SCALE;
    this.ctx = canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.base.width = map.w;
    this.base.height = map.h;
    this.baseCtx = this.base.getContext('2d')!;
    this.img = this.baseCtx.createImageData(map.w, map.h);
  }

  /** Redraw. `view` is the camera rectangle in tiles. */
  draw(sim: Sim, view: { x0: number; y0: number; x1: number; y1: number }, selected: ReadonlySet<number>): void {
    const { map, img } = this;
    if (sim.fogVersion !== this.fogSeen) {
      this.fogSeen = sim.fogVersion;
      for (let i = 0; i < map.w * map.h; i++) {
        const c = COLOR[map.terrain[i]];
        const k = sim.visible[i] ? 1 : sim.explored[i] ? 0.45 : 0;
        const lit = (map.light[i] / 255) * k;
        img.data[4 * i] = c[0] * lit;
        img.data[4 * i + 1] = c[1] * lit;
        img.data[4 * i + 2] = c[2] * lit;
        img.data[4 * i + 3] = 255;
      }
      this.baseCtx.putImageData(img, 0, 0);
    }
    const g = this.ctx;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.base, 0, 0, map.w * SCALE, map.h * SCALE);
    for (let i = 0; i < sim.count; i++) {
      const tx = Math.floor(sim.x[i] / FP);
      const ty = Math.floor(sim.y[i] / FP);
      const mine = sim.team[i] === 0;
      if (!mine && !sim.visible[ty * map.w + tx]) continue;
      g.fillStyle = i === 0 && mine ? '#ffd86a' : mine ? (selected.has(i) ? '#b8ff9a' : '#7ab8ff') : '#ff6a5a';
      const px = (sim.x[i] / FP) * SCALE - 1;
      const py = (sim.y[i] / FP) * SCALE - 1;
      g.fillRect(Math.round(px), Math.round(py), i === 0 && mine ? 4 : 2, i === 0 && mine ? 4 : 2);
    }
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    g.strokeRect(
      Math.round(view.x0 * SCALE) + 0.5,
      Math.round(view.y0 * SCALE) + 0.5,
      Math.round((view.x1 - view.x0) * SCALE),
      Math.round((view.y1 - view.y0) * SCALE),
    );
  }

  /** Map tile coordinates for a pointer position given in client pixels. */
  tileAt(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * this.map.w, ((clientY - r.top) / r.height) * this.map.h];
  }
}
