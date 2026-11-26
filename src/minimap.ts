import { Terrain, type GameMap } from './map';
import { FP, type Sim } from './sim/sim';
import { MinimapPingQueue, drawMinimapPings, type MinimapPingKind } from './ui-extra/minimap-pings';

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
  private readonly scale: number;
  private questGoal: { x: number; y: number } | null = null;
  readonly pingQueue = new MinimapPingQueue({ maxPings: 12, defaultDurationMs: 3200, maxPulseRadius: 14 });

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly map: GameMap,
  ) {
    const maxDim = Math.max(map.w, map.h);
    this.scale = maxDim > 128 ? Math.max(0.25, 256 / maxDim) : SCALE;
    canvas.width = Math.round(map.w * this.scale);
    canvas.height = Math.round(map.h * this.scale);
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
    const s = this.scale;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.base, 0, 0, Math.round(map.w * s), Math.round(map.h * s));
    if (sim.shrines && Array.isArray(sim.shrines)) {
      g.fillStyle = '#ffd700';
      for (const sh of sim.shrines) {
        if (!sim.explored || !sim.explored[sh.y * map.w + sh.x]) continue;
        const sx = (sh.x + 0.5) * s - 1.5;
        const sy = (sh.y + 0.5) * s - 1.5;
        g.fillRect(Math.round(sx), Math.round(sy), 3, 3);
      }
    }
    for (let i = 0; i < sim.count; i++) {
      const tx = Math.floor(sim.x[i] / FP);
      const ty = Math.floor(sim.y[i] / FP);
      const mine = sim.team[i] === 0;
      if (sim.hidden?.[i]) continue; // dormant zone units are not on the map yet
      if (!mine && !sim.visible[ty * map.w + tx]) continue;
      g.fillStyle = i === 0 && mine ? '#ffd86a' : mine ? (selected.has(i) ? '#b8ff9a' : '#7ab8ff') : '#ff6a5a';
      const px = (sim.x[i] / FP) * s - 1;
      const py = (sim.y[i] / FP) * s - 1;
      g.fillRect(Math.round(px), Math.round(py), i === 0 && mine ? 4 : 2, i === 0 && mine ? 4 : 2);
    }

    // Subtle enemy radar pulse & directional guidance for raider camps outside vision
    const enemyCamps: { x: number; y: number }[] = [];
    for (let i = 0; i < sim.count; i++) {
      if (sim.team[i] !== 1 || sim.cb.hp[i] <= 0 || sim.hidden?.[i]) continue;
      const tx = sim.x[i] / FP;
      const ty = sim.y[i] / FP;
      const itx = Math.floor(tx);
      const ity = Math.floor(ty);
      if (itx < 0 || itx >= map.w || ity < 0 || ity >= map.h) continue;
      if (sim.visible[ity * map.w + itx]) continue;

      let found = false;
      for (const camp of enemyCamps) {
        if (Math.hypot(camp.x - tx, camp.y - ty) < 6) {
          found = true;
          break;
        }
      }
      if (!found) {
        enemyCamps.push({ x: tx, y: ty });
      }
    }

    if (enemyCamps.length > 0 && typeof performance !== 'undefined') {
      const now = performance.now();
      const pulsePhase = (now % 1600) / 1600;
      const pulseRadius = 2 + pulsePhase * 7;
      const pulseAlpha = Math.max(0, 1 - pulsePhase) * 0.65;

      g.save?.();
      for (const camp of enemyCamps) {
        const px = camp.x * s;
        const py = camp.y * s;

        if (g.beginPath && g.arc && g.stroke) {
          g.strokeStyle = `rgba(255, 65, 55, ${pulseAlpha})`;
          g.lineWidth = 1;
          g.beginPath();
          g.arc(px, py, pulseRadius, 0, Math.PI * 2);
          g.stroke();
        }

        g.fillStyle = `rgba(235, 55, 45, ${0.4 + 0.4 * (1 - pulsePhase)})`;
        g.fillRect(Math.round(px - 1), Math.round(py - 1), 2, 2);
      }

      // Directional needle from hero towards nearest raider camp outside gates
      const heroId = sim.hero ? sim.hero.id : 0;
      if (sim.cb.hp[heroId] > 0) {
        const hx = sim.x[heroId] / FP;
        const hy = sim.y[heroId] / FP;

        let nearestDist = Infinity;
        let nearestCamp = enemyCamps[0];
        for (const camp of enemyCamps) {
          const d = Math.hypot(camp.x - hx, camp.y - hy);
          if (d < nearestDist) {
            nearestDist = d;
            nearestCamp = camp;
          }
        }

        if (nearestCamp && nearestDist > 8 && g.beginPath && g.fill) {
          const angle = Math.atan2(nearestCamp.y - hy, nearestCamp.x - hx);
          const heroMinimapX = hx * s;
          const heroMinimapY = hy * s;
          const indicatorDist = Math.min(14, nearestDist * s * 0.4);
          const tipX = heroMinimapX + Math.cos(angle) * indicatorDist;
          const tipY = heroMinimapY + Math.sin(angle) * indicatorDist;

          const pulse = 0.5 + 0.5 * Math.sin(now / 350);
          g.strokeStyle = `rgba(255, 180, 50, ${0.4 + 0.35 * pulse})`;
          g.fillStyle = `rgba(255, 80, 60, ${0.6 + 0.35 * pulse})`;
          g.lineWidth = 1.2;

          const arrowSize = 3.5;
          const leftAngle = angle + 2.5;
          const rightAngle = angle - 2.5;

          g.beginPath();
          g.moveTo(tipX, tipY);
          g.lineTo(tipX + Math.cos(leftAngle) * arrowSize, tipY + Math.sin(leftAngle) * arrowSize);
          g.lineTo(heroMinimapX + Math.cos(angle) * (indicatorDist * 0.4), heroMinimapY + Math.sin(angle) * (indicatorDist * 0.4));
          g.lineTo(tipX + Math.cos(rightAngle) * arrowSize, tipY + Math.sin(rightAngle) * arrowSize);
          g.closePath();
          g.fill();
          g.stroke?.();
        }
      }
      g.restore?.();
    }
    if (this.pingQueue.size() > 0) {
      drawMinimapPings(g, this.pingQueue, s);
    }

    // --- Quest Objective Goal & Directional Indicator ---
    const goal = this.questGoal;
    if (goal) {
      const gx = goal.x * s;
      const gy = goal.y * s;
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      const pulsePhase = (now % 1200) / 1200;
      const pulseAlpha = Math.max(0, 1 - pulsePhase);

      g.save?.();

      // Outer expanding aura
      if (g.beginPath && g.arc && g.stroke) {
        g.strokeStyle = `rgba(255, 215, 0, ${pulseAlpha * 0.9})`;
        g.lineWidth = 1.8;
        g.beginPath();
        g.arc(gx, gy, 3 + pulsePhase * 8, 0, Math.PI * 2);
        g.stroke();

        // Inner glowing ring
        g.strokeStyle = `rgba(255, 245, 160, ${pulseAlpha * 0.7})`;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(gx, gy, 2 + pulsePhase * 4, 0, Math.PI * 2);
        g.stroke();
      }

      // Objective core diamond marker
      if (g.beginPath && g.moveTo && g.lineTo && g.fill) {
        const d = 4.5;
        g.beginPath();
        g.moveTo(gx, gy - d);
        g.lineTo(gx + d, gy);
        g.lineTo(gx, gy + d);
        g.lineTo(gx - d, gy);
        g.closePath();
        g.fillStyle = '#ffe066';
        g.fill();
        g.strokeStyle = '#5a3800';
        g.lineWidth = 1.2;
        g.stroke?.();
      }

      // Edge-of-viewport indicator arrow on minimap when objective is outside current camera view
      const isOutsideView =
        goal.x < view.x0 ||
        goal.x > view.x1 ||
        goal.y < view.y0 ||
        goal.y > view.y1;

      if (isOutsideView && g.beginPath && g.moveTo && g.lineTo && g.fill) {
        const vx0 = view.x0 * s;
        const vy0 = view.y0 * s;
        const vx1 = view.x1 * s;
        const vy1 = view.y1 * s;
        const cx = (vx0 + vx1) / 2;
        const cy = (vy0 + vy1) / 2;
        const dx = gx - cx;
        const dy = gy - cy;
        const angle = Math.atan2(dy, dx);

        const halfW = Math.max(2, (vx1 - vx0) / 2);
        const halfH = Math.max(2, (vy1 - vy0) / 2);
        const kEdge = Math.min(halfW / Math.max(Math.abs(dx), 1e-3), halfH / Math.max(Math.abs(dy), 1e-3));
        const edgeX = cx + dx * kEdge;
        const edgeY = cy + dy * kEdge;

        const pulseGlow = 0.6 + 0.4 * Math.sin(now / 180);
        g.fillStyle = `rgba(255, 215, 0, ${pulseGlow})`;
        g.strokeStyle = '#3a2000';
        g.lineWidth = 1.2;

        const arrowLen = 5;
        const sideAngle1 = angle + 2.4;
        const sideAngle2 = angle - 2.4;
        g.beginPath();
        g.moveTo(edgeX + Math.cos(angle) * arrowLen, edgeY + Math.sin(angle) * arrowLen);
        g.lineTo(edgeX + Math.cos(sideAngle1) * arrowLen, edgeY + Math.sin(sideAngle1) * arrowLen);
        g.lineTo(edgeX, edgeY);
        g.lineTo(edgeX + Math.cos(sideAngle2) * arrowLen, edgeY + Math.sin(sideAngle2) * arrowLen);
        g.closePath();
        g.fill();
        g.stroke?.();
      }

      g.restore?.();
    }

    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    g.strokeRect(
      Math.round(view.x0 * s) + 0.5,
      Math.round(view.y0 * s) + 0.5,
      Math.round((view.x1 - view.x0) * s),
      Math.round((view.y1 - view.y0) * s),
    );
  }

  setQuestGoal(x: number | null, y: number | null): void {
    if (x !== null && y !== null) {
      this.questGoal = { x, y };
    } else {
      this.questGoal = null;
    }
  }

  getQuestGoal(): { x: number; y: number } | null {
    return this.questGoal;
  }

  /** Push an animated tactical radar ping onto the minimap. */
  addPing(tileX: number, tileY: number, kind: MinimapPingKind = 'alert', label?: string, nowMs?: number): void {
    this.pingQueue.push(tileX, tileY, kind, nowMs, label);
  }

  clearPings(): void {
    this.pingQueue.clear();
  }

  /** Map tile coordinates for a pointer position given in client pixels. */
  tileAt(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(this.map.w - 1, ((clientX - r.left) / r.width) * this.map.w)),
      Math.max(0, Math.min(this.map.h - 1, ((clientY - r.top) / r.height) * this.map.h)),
    ];
  }
}
