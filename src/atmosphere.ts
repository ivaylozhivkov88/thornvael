import { Container, Graphics } from 'pixi.js';

export type AtmosphereBiome =
  | 'forest'
  | 'marsh'
  | 'desert'
  | 'crypt'
  | 'highlands'
  | 'volcanic'
  | 'oasis';

export type AtmosphereEffect =
  | 'fog'
  | 'embers'
  | 'dust'
  | 'leaves'
  | 'fireflies'
  | 'spores'
  | 'snow';

export interface AtmosphereLayerConfig {
  effect: AtmosphereEffect;
  parallax: number;
  cap: number;
  speedX: number;
  speedY: number;
  colors: readonly number[];
  alphaMin: number;
  alphaMax: number;
  sizeMin: number;
  sizeMax: number;
}

export interface BiomeAtmosphereConfig {
  biome: AtmosphereBiome;
  totalCap: number;
  layers: readonly AtmosphereLayerConfig[];
}

export interface AtmosphereParticle {
  active: boolean;
  layerIndex: number;
  effect: AtmosphereEffect;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  baseAlpha: number;
  alpha: number;
  phase: number;
  parallax: number;
}

export interface AtmosphereOptions {
  lowEnd?: boolean;
  lowSpec?: boolean;
  reducedMotion?: boolean;
  quality?: number; // 0 = low, 1 = medium, 2 = high
}

const BIOME_CONFIGS: Record<AtmosphereBiome, BiomeAtmosphereConfig> = {
  marsh: {
    biome: 'marsh',
    totalCap: 56,
    layers: [
      {
        effect: 'fog',
        parallax: 0.25,
        cap: 18,
        speedX: 12,
        speedY: 2,
        colors: [0x6e8c78, 0x527064],
        alphaMin: 0.05,
        alphaMax: 0.12,
        sizeMin: 48,
        sizeMax: 96,
      },
      {
        effect: 'spores',
        parallax: 0.65,
        cap: 38,
        speedX: 6,
        speedY: -8,
        colors: [0x78e8a8, 0x98ffd0, 0x58c48c],
        alphaMin: 0.22,
        alphaMax: 0.55,
        sizeMin: 1.5,
        sizeMax: 3.4,
      },
    ],
  },
  crypt: {
    biome: 'crypt',
    totalCap: 54,
    layers: [
      {
        effect: 'fog',
        parallax: 0.22,
        cap: 18,
        speedX: -10,
        speedY: 1.5,
        colors: [0x58647c, 0x424c66],
        alphaMin: 0.05,
        alphaMax: 0.11,
        sizeMin: 52,
        sizeMax: 100,
      },
      {
        effect: 'spores',
        parallax: 0.7,
        cap: 36,
        speedX: 4,
        speedY: -10,
        colors: [0x70c8ff, 0x98a8ff, 0x56f0d0],
        alphaMin: 0.2,
        alphaMax: 0.5,
        sizeMin: 1.4,
        sizeMax: 3.2,
      },
    ],
  },
  volcanic: {
    biome: 'volcanic',
    totalCap: 68,
    layers: [
      {
        effect: 'embers',
        parallax: 0.45,
        cap: 28,
        speedX: 10,
        speedY: -36,
        colors: [0xff6a1a, 0xffaa2b, 0xff3b00],
        alphaMin: 0.35,
        alphaMax: 0.78,
        sizeMin: 1.4,
        sizeMax: 3.0,
      },
      {
        effect: 'embers',
        parallax: 0.85,
        cap: 40,
        speedX: 18,
        speedY: -54,
        colors: [0xff8c24, 0xffd166, 0xff4d14],
        alphaMin: 0.4,
        alphaMax: 0.85,
        sizeMin: 1.8,
        sizeMax: 3.8,
      },
    ],
  },
  desert: {
    biome: 'desert',
    totalCap: 60,
    layers: [
      {
        effect: 'dust',
        parallax: 0.35,
        cap: 24,
        speedX: 46,
        speedY: 6,
        colors: [0xe8c488, 0xd4a868],
        alphaMin: 0.08,
        alphaMax: 0.18,
        sizeMin: 1.8,
        sizeMax: 3.5,
      },
      {
        effect: 'dust',
        parallax: 0.8,
        cap: 36,
        speedX: 72,
        speedY: 10,
        colors: [0xf4d8a4, 0xdfb474],
        alphaMin: 0.12,
        alphaMax: 0.28,
        sizeMin: 1.2,
        sizeMax: 2.6,
      },
    ],
  },
  forest: {
    biome: 'forest',
    totalCap: 58,
    layers: [
      {
        effect: 'leaves',
        parallax: 0.5,
        cap: 26,
        speedX: 18,
        speedY: 22,
        colors: [0x68b848, 0x98c848, 0xd4a448],
        alphaMin: 0.28,
        alphaMax: 0.62,
        sizeMin: 2.4,
        sizeMax: 4.5,
      },
      {
        effect: 'fireflies',
        parallax: 0.85,
        cap: 32,
        speedX: 8,
        speedY: -5,
        colors: [0xd8ff68, 0xffe866, 0x98ff78],
        alphaMin: 0.25,
        alphaMax: 0.72,
        sizeMin: 1.6,
        sizeMax: 3.2,
      },
    ],
  },
  oasis: {
    biome: 'oasis',
    totalCap: 54,
    layers: [
      {
        effect: 'leaves',
        parallax: 0.45,
        cap: 22,
        speedX: 15,
        speedY: 18,
        colors: [0x78c858, 0xb8d860, 0xe8c060],
        alphaMin: 0.24,
        alphaMax: 0.55,
        sizeMin: 2.2,
        sizeMax: 4.2,
      },
      {
        effect: 'fireflies',
        parallax: 0.82,
        cap: 32,
        speedX: 6,
        speedY: -4,
        colors: [0xffe066, 0xb8ff78, 0x88ffd8],
        alphaMin: 0.28,
        alphaMax: 0.72,
        sizeMin: 1.6,
        sizeMax: 3.0,
      },
    ],
  },
  highlands: {
    biome: 'highlands',
    totalCap: 68,
    layers: [
      {
        effect: 'snow',
        parallax: 0.38,
        cap: 28,
        speedX: 16,
        speedY: 32,
        colors: [0xd8ecff, 0xeef6ff],
        alphaMin: 0.22,
        alphaMax: 0.48,
        sizeMin: 1.5,
        sizeMax: 2.8,
      },
      {
        effect: 'snow',
        parallax: 0.82,
        cap: 40,
        speedX: 28,
        speedY: 52,
        colors: [0xffffff, 0xe0f0ff],
        alphaMin: 0.3,
        alphaMax: 0.65,
        sizeMin: 2.0,
        sizeMax: 3.8,
      },
    ],
  },
};

export function normalizeAtmosphereBiome(biome: string): AtmosphereBiome {
  const b = biome.toLowerCase();
  if (b === 'swamp' || b === 'marsh') return 'marsh';
  if (b === 'caves' || b === 'crypt') return 'crypt';
  if (b === 'hell' || b === 'volcanic') return 'volcanic';
  if (b === 'desert') return 'desert';
  if (b === 'highlands' || b === 'snow') return 'highlands';
  if (b === 'oasis') return 'oasis';
  return 'forest';
}

export function getBiomeAtmosphereConfig(biome: string): BiomeAtmosphereConfig {
  return BIOME_CONFIGS[normalizeAtmosphereBiome(biome)];
}

export function detectLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency;
  if (typeof cores === 'number' && cores > 0 && cores <= 2) return true;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof mem === 'number' && mem > 0 && mem <= 2) return true;
  return false;
}

let globalReducedMotionOverride: boolean | null = null;
let globalLowSpecOverride: boolean | null = null;

export function setAtmosphereReducedMotion(enabled: boolean | null): void {
  globalReducedMotionOverride = enabled;
}

export function setAtmosphereLowSpec(enabled: boolean | null): void {
  globalLowSpecOverride = enabled;
}

export function isAtmosphereLowSpecActive(): boolean {
  if (globalLowSpecOverride !== null) return globalLowSpecOverride;
  return detectLowEndDevice();
}

export function isReducedMotionActive(): boolean {
  if (globalReducedMotionOverride !== null) return globalReducedMotionOverride;
  if (typeof localStorage !== 'undefined') {
    try {
      if (localStorage.getItem('thornvael.reducedMotion') === 'true') return true;
    } catch {
      // storage blocked
    }
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }
  return false;
}

const MAX_POOL = 72;

export class AtmosphereSystem {
  readonly layer: Container | null;
  private readonly layerGraphics: Graphics[] = [];
  private readonly particles: AtmosphereParticle[];
  private biome: AtmosphereBiome = 'forest';
  private quality = 2;
  private lowEnd = false;
  private lowSpec = false;
  private reducedMotion = false;
  private seed = 0x9e3779b9;
  private lastCamX = 0;
  private lastCamY = 0;
  private hasCam = false;
  private elapsed = 0;
  private initialized = false;

  constructor(opts: AtmosphereOptions & { headless?: boolean } = {}) {
    this.lowEnd = opts.lowEnd ?? detectLowEndDevice();
    this.lowSpec = opts.lowSpec ?? (globalLowSpecOverride ?? this.lowEnd);
    this.reducedMotion = opts.reducedMotion ?? isReducedMotionActive();
    this.quality = opts.quality ?? 2;

    this.particles = Array.from({ length: MAX_POOL }, () => ({
      active: false,
      layerIndex: 0,
      effect: 'fog',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 2,
      color: 0xffffff,
      baseAlpha: 0.3,
      alpha: 0,
      phase: 0,
      parallax: 0.5,
    }));

    if (opts.headless || typeof document === 'undefined') {
      this.layer = null;
    } else {
      this.layer = new Container();
      this.layer.blendMode = 'add';
      this.layer.eventMode = 'none';
      for (let i = 0; i < 3; i++) {
        const g = new Graphics();
        g.blendMode = 'add';
        this.layerGraphics.push(g);
        this.layer.addChild(g);
      }
    }
  }

  private rand(): number {
    let x = this.seed | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x | 0;
    return ((x >>> 0) % 100000) / 100000;
  }

  setBiome(biome: string): void {
    const next = normalizeAtmosphereBiome(biome);
    if (next === this.biome && this.initialized) return;
    this.biome = next;
    this.initialized = false;
  }

  getBiome(): AtmosphereBiome {
    return this.biome;
  }

  setQuality(quality: number): void {
    this.quality = Math.max(0, Math.min(2, quality | 0));
    if (!this.isActive()) this.clearParticles();
  }

  setLowEnd(lowEnd: boolean): void {
    this.lowEnd = lowEnd;
    if (!this.isActive()) this.clearParticles();
  }

  setLowSpec(lowSpec: boolean): void {
    this.lowSpec = lowSpec;
    if (!this.isActive()) this.clearParticles();
  }

  isLowSpec(): boolean {
    return this.lowSpec || this.lowEnd || (globalLowSpecOverride ?? false);
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    if (!this.isActive()) this.clearParticles();
  }

  isActive(): boolean {
    return !this.lowEnd && !this.lowSpec && !this.reducedMotion && this.quality > 0;
  }

  getActiveCap(): number {
    if (!this.isActive()) return 0;
    const cfg = BIOME_CONFIGS[this.biome];
    const scale = this.quality === 1 ? 0.5 : 1;
    return Math.min(MAX_POOL, Math.floor(cfg.totalCap * scale));
  }

  getActiveCount(): number {
    let count = 0;
    for (let i = 0; i < this.particles.length; i++) {
      if (this.particles[i].active) count++;
    }
    return count;
  }

  getParticles(): readonly AtmosphereParticle[] {
    return this.particles;
  }

  private clearParticles(): void {
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].active = false;
    }
    for (const g of this.layerGraphics) g.clear();
    if (this.layer) this.layer.visible = false;
    this.initialized = false;
  }

  private seedParticles(viewW: number, viewH: number): void {
    const cfg = BIOME_CONFIGS[this.biome];
    const scale = this.quality === 1 ? 0.5 : 1;
    let idx = 0;

    for (let li = 0; li < cfg.layers.length; li++) {
      const lc = cfg.layers[li];
      const layerCap = Math.floor(lc.cap * scale);
      for (let n = 0; n < layerCap && idx < MAX_POOL; n++) {
        const p = this.particles[idx++];
        p.active = true;
        p.layerIndex = li;
        p.effect = lc.effect;
        p.parallax = lc.parallax;
        p.x = this.rand() * viewW;
        p.y = this.rand() * viewH;
        const speedJitter = 0.75 + this.rand() * 0.5;
        p.vx = lc.speedX * speedJitter;
        p.vy = lc.speedY * speedJitter;
        p.size = lc.sizeMin + this.rand() * (lc.sizeMax - lc.sizeMin);
        p.color = lc.colors[Math.floor(this.rand() * lc.colors.length)] ?? lc.colors[0];
        p.baseAlpha = lc.alphaMin + this.rand() * (lc.alphaMax - lc.alphaMin);
        p.alpha = p.baseAlpha;
        p.phase = this.rand() * Math.PI * 2;
      }
    }

    while (idx < MAX_POOL) {
      this.particles[idx++].active = false;
    }
    this.initialized = true;
  }

  update(
    dtMs: number,
    camX: number,
    camY: number,
    zoom: number,
    viewW: number,
    viewH: number,
  ): void {
    if (!this.isActive()) {
      this.clearParticles();
      return;
    }
    if (this.layer) this.layer.visible = true;

    const w = Math.max(320, viewW);
    const h = Math.max(240, viewH);
    const dt = Math.min(0.1, Math.max(0.001, dtMs / 1000));
    this.elapsed += dt;

    if (!this.initialized) {
      this.seedParticles(w, h);
    }

    const dCamX = this.hasCam ? (camX - this.lastCamX) * zoom : 0;
    const dCamY = this.hasCam ? (camY - this.lastCamY) * zoom : 0;
    this.lastCamX = camX;
    this.lastCamY = camY;
    this.hasCam = true;

    const cap = this.getActiveCap();
    const pad = 110;

    for (let i = 0; i < MAX_POOL; i++) {
      const p = this.particles[i];
      if (!p.active || i >= cap) {
        p.active = false;
        continue;
      }

      const sway =
        p.effect === 'fireflies' || p.effect === 'spores' || p.effect === 'leaves' || p.effect === 'embers'
          ? Math.sin(this.elapsed * 2.1 + p.phase) * 14
          : p.effect === 'fog'
          ? Math.sin(this.elapsed * 0.9 + p.phase) * 8
          : p.effect === 'dust'
          ? Math.sin(this.elapsed * 1.5 + p.phase) * 6
          : p.effect === 'snow'
          ? Math.sin(this.elapsed * 2.6 + p.phase) * 8
          : 0;

      p.x += (p.vx + sway) * dt - dCamX * p.parallax;
      p.y += p.vy * dt - dCamY * p.parallax;

      if (p.x < -pad) p.x += w + pad * 2;
      else if (p.x > w + pad) p.x -= w + pad * 2;
      if (p.y < -pad) p.y += h + pad * 2;
      else if (p.y > h + pad) p.y -= h + pad * 2;

      if (p.effect === 'fireflies' || p.effect === 'spores') {
        const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.elapsed * 3.2 + p.phase));
        p.alpha = p.baseAlpha * pulse;
      } else if (p.effect === 'embers') {
        const flicker = 0.7 + 0.3 * Math.sin(this.elapsed * 6.0 + p.phase);
        p.alpha = p.baseAlpha * flicker;
      } else if (p.effect === 'fog') {
        const breathe = 0.85 + 0.15 * Math.sin(this.elapsed * 1.2 + p.phase);
        p.alpha = p.baseAlpha * breathe;
      } else {
        p.alpha = p.baseAlpha;
      }
    }

    this.draw(w, h);
  }

  private draw(viewW = 800, viewH = 600): void {
    if (!this.layer || this.layerGraphics.length === 0) return;
    for (const g of this.layerGraphics) g.clear();

    // Rising volcanic heat ripple waves
    if (this.biome === 'volcanic' && this.layerGraphics.length > 0) {
      const hg = this.layerGraphics[0];
      const t = this.elapsed;
      for (let r = 0; r < 2; r++) {
        const ry = (((viewH - (t * 40 + r * (viewH * 0.5))) % (viewH + 100)) + viewH + 100) % (viewH + 100) - 50;
        const shimmer = Math.sin(t * 3.4 + r * 2.3) * 6;
        hg.ellipse(viewW * 0.5 + Math.sin(t * 1.2 + r) * 25, ry + shimmer, viewW * 0.45, 5).fill({
          color: 0xff6611,
          alpha: 0.035 + 0.018 * Math.sin(t * 2.4 + r),
        });
      }
    }

    for (let i = 0; i < MAX_POOL; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      const g = this.layerGraphics[p.layerIndex] ?? this.layerGraphics[0];

      if (p.effect === 'fog') {
        // Drifting volumetric mist/fog wisps
        g.ellipse(p.x, p.y, p.size * 2.0, p.size * 0.58).fill({ color: p.color, alpha: p.alpha * 0.75 });
        g.ellipse(p.x - p.size * 0.65, p.y + Math.sin(p.phase) * 4, p.size * 1.15, p.size * 0.4).fill({
          color: p.color,
          alpha: p.alpha * 0.45,
        });
        g.ellipse(p.x + p.size * 0.65, p.y - Math.sin(p.phase) * 3, p.size * 0.95, p.size * 0.35).fill({
          color: p.color,
          alpha: p.alpha * 0.4,
        });
      } else if (p.effect === 'leaves') {
        const dx = Math.cos(p.phase + this.elapsed * 2.0) * p.size;
        const dy = Math.sin(p.phase + this.elapsed * 2.0) * p.size * 0.6;
        g.ellipse(p.x, p.y, Math.max(1.5, Math.abs(dx) + 1.5), Math.max(1.2, Math.abs(dy) + 1.2)).fill({
          color: p.color,
          alpha: p.alpha,
        });
      } else if (p.effect === 'embers') {
        // Rising glowing embers with warm halo and incandescent core
        g.circle(p.x, p.y, p.size * 2.2).fill({ color: 0xff3b00, alpha: p.alpha * 0.28 });
        g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: p.alpha });
        g.circle(p.x, p.y, p.size * 0.45).fill({ color: 0xfff0a0, alpha: p.alpha * 0.95 });
      } else if (p.effect === 'fireflies' || p.effect === 'spores') {
        g.circle(p.x, p.y, p.size * 2.2).fill({ color: p.color, alpha: p.alpha * 0.24 });
        g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: p.alpha });
      } else if (p.effect === 'dust') {
        // Gentle drifting dust motes
        g.circle(p.x, p.y, p.size * 1.7).fill({ color: p.color, alpha: p.alpha * 0.25 });
        g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: p.alpha });
      } else if (p.effect === 'snow') {
        // Light highland rain/snow flurries
        g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: p.alpha });
        g.moveTo(p.x, p.y).lineTo(p.x - 2.5, p.y - 4.5).stroke({ color: p.color, width: 0.8, alpha: p.alpha * 0.45 });
      } else {
        g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: p.alpha });
      }
    }
  }
}

const stageSystems = new WeakMap<Container, AtmosphereSystem>();

/**
 * Single-call hook for src/render.ts. Manages a per-stage AtmosphereSystem
 * with automatic low-end & reduced-motion disabling.
 */
export function updateAtmosphere(
  stage: Container | undefined,
  biome: string,
  dtMs: number,
  camX: number,
  camY: number,
  zoom: number,
  viewW: number,
  viewH: number,
  quality: number,
): void {
  if (!stage) return;
  let sys = stageSystems.get(stage);
  if (!sys) {
    sys = new AtmosphereSystem({ quality });
    stageSystems.set(stage, sys);
    if (sys.layer) {
      const insertAt = Math.max(0, stage.children.length - 1);
      stage.addChildAt(sys.layer, insertAt);
    }
  }
  sys.setBiome(biome);
  sys.setQuality(quality);
  sys.setReducedMotion(isReducedMotionActive());
  sys.update(dtMs, camX, camY, zoom, viewW, viewH);
}
