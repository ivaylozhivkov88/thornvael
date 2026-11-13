/**
 * Dynamic Gothic Campfire Canvas for Thornvael Hero Selection.
 * Simulates a roaring, realistic bonfire with:
 * - Charred stone hearth and glowing ember log bed
 * - Multilayered blazing flame tongues with 'lighter' composite radiance
 * - Floating turbulent ember sparks rising into the dark night sky
 * - Dynamic ground firelight that casts fluctuating amber illumination on the stone floor
 */

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  swayFreq: number;
  swayAmp: number;
  seed: number;
}

interface FlameParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
}

export class CampfireCanvas {
  public readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private animId = 0;
  private running = false;
  private lastTime = 0;

  private embers: Ember[] = [];
  private flames: FlameParticle[] = [];
  private flameSpawnTimer = 0;

  // Virtual canvas dimensions for crisp high-DPI rendering
  private readonly vW = 640;
  private readonly vH = 460;
  private readonly cx = 320;
  private readonly cy = 340; // Base position of the hearth

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sh-campfire-canvas';
    this.canvas.width = this.vW;
    this.canvas.height = this.vH;
    const c = this.canvas.getContext('2d');
    if (!c) throw new Error('2D context not available');
    this.ctx = c;

    // Seed initial embers
    for (let i = 0; i < 35; i++) {
      this.embers.push(this.spawnEmber(true));
    }
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (t: number): void => {
      if (!this.running) return;
      const dt = Math.min((t - this.lastTime) / 1000, 0.1);
      this.lastTime = t;
      this.updateAndDraw(t / 1000, dt);
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  public stop(): void {
    this.running = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = 0;
    }
  }

  private spawnEmber(randomAge = false): Ember {
    const angle = (Math.random() - 0.5) * Math.PI * 0.7;
    const speed = 35 + Math.random() * 65;
    const maxLife = 1.4 + Math.random() * 1.8;
    const life = randomAge ? Math.random() * maxLife : 0;
    const startY = this.cy - 10 + (Math.random() - 0.5) * 15;
    const startX = this.cx + (Math.random() - 0.5) * 60;

    return {
      x: startX,
      y: startY,
      vx: Math.sin(angle) * speed * 0.4,
      vy: -Math.cos(angle) * speed - 15,
      size: 1.2 + Math.random() * 2.2,
      life,
      maxLife,
      swayFreq: 2.5 + Math.random() * 3.5,
      swayAmp: 18 + Math.random() * 28,
      seed: Math.random() * 100,
    };
  }

  private spawnFlame(): FlameParticle {
    return {
      x: this.cx + (Math.random() - 0.5) * 48,
      y: this.cy - 10 + (Math.random() - 0.5) * 12,
      vx: (Math.random() - 0.5) * 18,
      vy: -110 - Math.random() * 90,
      radius: 20 + Math.random() * 18,
      life: 0,
      maxLife: 0.45 + Math.random() * 0.45,
    };
  }

  private updateAndDraw(time: number, dt: number): void {
    const { ctx, vW, vH, cx, cy } = this;
    ctx.clearRect(0, 0, vW, vH);

    // Dynamic fire flicker intensity
    const flicker1 = Math.sin(time * 7.4) * 0.08;
    const flicker2 = Math.sin(time * 16.7) * 0.05;
    const flicker3 = Math.sin(time * 29.1) * 0.03;
    const flicker = 1.0 + flicker1 + flicker2 + flicker3;

    // 1. Dynamic Ground Radiance (Warm radial glow on stone courtyard)
    const groundGrad = ctx.createRadialGradient(cx, cy + 10, 10, cx, cy + 10, 220 * flicker);
    groundGrad.addColorStop(0, `rgba(255, 130, 20, ${0.48 * flicker})`);
    groundGrad.addColorStop(0.35, `rgba(210, 75, 10, ${0.25 * flicker})`);
    groundGrad.addColorStop(0.7, `rgba(140, 35, 5, ${0.08 * flicker})`);
    groundGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.save();
    ctx.scale(1, 0.45); // Flatten for ground plane projection
    ctx.beginPath();
    ctx.arc(cx, (cy + 10) / 0.45, 220 * flicker, 0, Math.PI * 2);
    ctx.fillStyle = groundGrad;
    ctx.fill();
    ctx.restore();

    // 2. Charred Hearth Stone Ring
    ctx.save();
    const stones = [
      { dx: -65, dy: 10, rx: 18, ry: 10 },
      { dx: -45, dy: 18, rx: 16, ry: 9 },
      { dx: -15, dy: 24, rx: 20, ry: 10 },
      { dx: 20, dy: 22, rx: 19, ry: 10 },
      { dx: 52, dy: 14, rx: 17, ry: 9 },
      { dx: 68, dy: -2, rx: 15, ry: 8 },
      { dx: 50, dy: -14, rx: 16, ry: 8 },
      { dx: 15, dy: -20, rx: 18, ry: 9 },
      { dx: -25, dy: -19, rx: 17, ry: 8 },
      { dx: -55, dy: -8, rx: 16, ry: 9 },
    ];
    for (const s of stones) {
      ctx.beginPath();
      ctx.ellipse(cx + s.dx, cy + s.dy, s.rx, s.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#1b1715';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#382a20';
      ctx.stroke();

      // Top warm firelight rim on stones
      ctx.beginPath();
      ctx.ellipse(cx + s.dx, cy + s.dy - 1, s.rx * 0.75, s.ry * 0.45, 0, Math.PI, 0);
      ctx.strokeStyle = `rgba(255, 120, 25, ${0.4 * flicker})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();

    // 3. Charred Crossed Firewood Logs
    ctx.save();
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';

    // Log 1 (Left to right-up)
    ctx.strokeStyle = '#1a1410';
    ctx.beginPath();
    ctx.moveTo(cx - 52, cy + 12);
    ctx.lineTo(cx + 48, cy - 8);
    ctx.stroke();

    // Log 2 (Right to left-up)
    ctx.beginPath();
    ctx.moveTo(cx + 50, cy + 10);
    ctx.lineTo(cx - 46, cy - 10);
    ctx.stroke();

    // Log 3 (Center foreground)
    ctx.strokeStyle = '#120d09';
    ctx.beginPath();
    ctx.moveTo(cx - 35, cy + 18);
    ctx.lineTo(cx + 38, cy + 16);
    ctx.stroke();

    // Glowing ember cracks along logs
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = `rgba(255, 140, 20, ${0.75 * flicker})`;
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy + 8);
    ctx.lineTo(cx + 18, cy + 3);
    ctx.moveTo(cx - 8, cy - 4);
    ctx.lineTo(cx + 28, cy - 7);
    ctx.stroke();
    ctx.restore();

    // 4. Glowing Ash Bed (Deep radiant core)
    const ashGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 48);
    ashGrad.addColorStop(0, `rgba(255, 235, 130, ${0.95 * flicker})`);
    ashGrad.addColorStop(0.3, `rgba(255, 120, 15, ${0.85 * flicker})`);
    ashGrad.addColorStop(0.7, `rgba(180, 40, 5, ${0.65 * flicker})`);
    ashGrad.addColorStop(1, 'rgba(40, 10, 0, 0)');
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 48, 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = ashGrad;
    ctx.fill();
    ctx.restore();

    // 5. Roaring Flame Tongues (Additive Radiance)
    this.flameSpawnTimer += dt;
    while (this.flameSpawnTimer > 0.02) {
      this.flameSpawnTimer -= 0.02;
      this.flames.push(this.spawnFlame());
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = this.flames.length - 1; i >= 0; i--) {
      const f = this.flames[i];
      f.life += dt;
      if (f.life >= f.maxLife) {
        this.flames.splice(i, 1);
        continue;
      }

      const p = f.life / f.maxLife; // 0 to 1
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      // Inward pull toward flame crest
      f.x += (cx - f.x) * 1.8 * dt;

      const r = Math.max(1, f.radius * (1 - p * 0.7));

      let col = '';
      if (p < 0.22) {
        col = `rgba(255, 255, 210, ${0.95 * (1 - p)})`;
      } else if (p < 0.55) {
        col = `rgba(255, 160, 25, ${0.85 * (1 - p)})`;
      } else if (p < 0.8) {
        col = `rgba(220, 50, 5, ${0.65 * (1 - p)})`;
      } else {
        col = `rgba(100, 20, 0, ${0.35 * (1 - p)})`;
      }

      const fGrad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      fGrad.addColorStop(0, col);
      fGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fGrad;
      ctx.fill();
    }
    ctx.restore();

    // 6. Floating Rising Embers & Sparks
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    while (this.embers.length < 55) {
      this.embers.push(this.spawnEmber());
    }

    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.life += dt;
      if (e.life >= e.maxLife) {
        this.embers.splice(i, 1);
        continue;
      }

      const p = e.life / e.maxLife; // 0..1
      const sway = Math.sin(time * e.swayFreq + e.seed) * e.swayAmp;
      e.x += (e.vx + sway) * dt;
      e.y += e.vy * dt;

      const alpha = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
      const size = e.size * (1 - p * 0.4);

      let color = '';
      if (p < 0.3) {
        color = `rgba(255, 250, 180, ${alpha * 0.95})`;
      } else if (p < 0.65) {
        color = `rgba(255, 150, 30, ${alpha * 0.85})`;
      } else {
        color = `rgba(220, 45, 10, ${alpha * 0.75})`;
      }

      ctx.beginPath();
      ctx.arc(e.x, e.y, size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Glowing outer halo for the brightest sparks
      if (p < 0.5) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, size * 2.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 120, 10, ${alpha * 0.35})`;
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
