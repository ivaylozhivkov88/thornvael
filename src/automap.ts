import { TILE, Terrain, type GameMap } from './map';
import type { Renderer } from './render';
import { FP, type Sim } from './sim/sim';

/**
 * Classic ARPG-style Semi-Transparent Vector Automap Overlay.
 * Toggled via 'Tab' key. Controls, unit selection, and movement remain 100% active
 * while automap is open.
 */
export class AutomapOverlay {
  public enabled = false;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'automap-overlay';
    this.canvas.className = 'automap-canvas';
    const c = this.canvas.getContext('2d');
    if (!c) throw new Error('2D context failed for automap');
    this.ctx = c;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.body.appendChild(this.canvas);
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    return this.enabled;
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
  }

  public draw(sim: Sim, map: GameMap, renderer: Renderer): void {
    if (!this.enabled) return;
    const { ctx, canvas } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const zoom = renderer.zoom;
    const camX = renderer.camX;
    const camY = renderer.camY;
    const s = TILE * zoom;

    // View bounds in tiles
    const vt = renderer.viewTiles();
    const minTx = Math.max(0, Math.floor(vt.x0) - 1);
    const maxTx = Math.min(map.w - 1, Math.ceil(vt.x1) + 1);
    const minTy = Math.max(0, Math.floor(vt.y0) - 1);
    const maxTy = Math.min(map.h - 1, Math.ceil(vt.y1) + 1);

    // 1. Explored Terrain Walls, Obstacles & Water
    ctx.lineWidth = 1;
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const idx = ty * map.w + tx;
        if (!sim.explored[idx]) continue;

        const sx = tx * s - camX;
        const sy = ty * s - camY;

        if (map.blocked[idx]) {
          // Semi-transparent wall stroke (classic ARPG vector outline)
          ctx.strokeStyle = 'rgba(145, 185, 225, 0.45)';
          ctx.strokeRect(sx + 0.5, sy + 0.5, s - 1, s - 1);
        } else if (map.terrain[idx] === Terrain.Water) {
          // River / water vector fill & subtle border
          ctx.fillStyle = 'rgba(45, 135, 230, 0.22)';
          ctx.fillRect(sx, sy, s, s);
          ctx.strokeStyle = 'rgba(70, 170, 255, 0.4)';
          ctx.strokeRect(sx, sy, s, s);
        }
      }
    }

    // 2. Shrines & Known Points of Interest
    for (let n = 0; n < sim.shrines.length; n++) {
      const sh = sim.shrines[n];
      const idx = sh.y * map.w + sh.x;
      if (!sim.explored[idx]) continue;
      const sx = (sh.x + 0.5) * s - camX;
      const sy = (sh.y + 0.5) * s - camY;
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Visible Enemies (Crisp Red Dots)
    ctx.fillStyle = '#ff3333';
    ctx.strokeStyle = '#8b0000';
    ctx.lineWidth = 1;
    for (let i = 0; i < sim.count; i++) {
      if (sim.team[i] === 0 || sim.cb.hp[i] <= 0 || sim.hidden[i]) continue;
      const tx = Math.floor(sim.x[i] / FP);
      const ty = Math.floor(sim.y[i] / FP);
      if (tx < 0 || tx >= map.w || ty < 0 || ty >= map.h) continue;
      if (!sim.visible[ty * map.w + tx]) continue;

      const sx = (sim.x[i] / FP) * s - camX;
      const sy = (sim.y[i] / FP) * s - camY;

      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 4. Player Party & Hero
    const heroId = sim.hero?.id ?? 0;
    for (let i = 0; i < sim.count; i++) {
      if (sim.team[i] !== 0 || sim.cb.hp[i] <= 0 || sim.hidden[i]) continue;
      const sx = (sim.x[i] / FP) * s - camX;
      const sy = (sim.y[i] / FP) * s - camY;

      if (i === heroId) {
        // Bright Gold Crosshair & Glow
        ctx.fillStyle = '#ffe066';
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(sx - 8, sy);
        ctx.lineTo(sx + 8, sy);
        ctx.moveTo(sx, sy - 8);
        ctx.lineTo(sx, sy + 8);
        ctx.stroke();
      } else {
        // Friendly Mercenaries (Green dots)
        ctx.fillStyle = '#4ade80';
        ctx.strokeStyle = '#166534';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Subtle automap badge at top center
    ctx.fillStyle = 'rgba(212, 175, 55, 0.75)';
    ctx.font = '11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('AUTOMAP [TAB]', canvas.width / (2 * dpr), 22);

    ctx.restore();
  }
}
