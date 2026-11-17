import { Container, Graphics } from 'pixi.js';

/**
 * AAA Environmental VFX & Biome Weather Architecture:
 * - 100% Render-only: zero impact on simulation state, determinism, or replay hashes.
 * - Act 1 (Swamp): Fine diagonal rain streaks, impact micro-splashes, and soft drifting marsh mist.
 * - Act 2 (Desert): Blown sand dust motes, trailing wind streaks, and undulating heat shimmer / mirage haze.
 * - Act 3 (Caves): Bioluminescent spores with pulsing glow auras, and slowly dripping stalactite droplets with expanding water ripples.
 * - Act 4 (Hell): Upward buoyant ember sparks cooling from incandescence to smoldering soot, and tumbling volcanic ash flakes.
 *
 * Performance:
 * - Zero allocations per frame: pre-allocated object pool of 160 WeatherParticle structures.
 * - Pooled PixiJS Graphics for batched single-pass rendering of particles and atmospheric haze ribbons.
 * - Quality levels: Low (25-30% particles, no haze ribbons), Med (60%), High (100%).
 * - Full parallax support with smooth viewport edge wrapping.
 */

export type BiomeWeatherType = 'swamp' | 'desert' | 'caves' | 'hell';
export type BiomeAct = 1 | 2 | 3 | 4;

export function actToBiome(act: number): BiomeWeatherType {
  switch (act) {
    case 1:
      return 'swamp';
    case 2:
      return 'desert';
    case 3:
      return 'caves';
    case 4:
      return 'hell';
    default:
      return 'swamp';
  }
}

export function biomeToAct(biome: BiomeWeatherType): BiomeAct {
  switch (biome) {
    case 'swamp':
      return 1;
    case 'desert':
      return 2;
    case 'caves':
      return 3;
    case 'hell':
      return 4;
  }
}

export function detectBiomeFromMap(mapNameOrTitle: string, terrain?: Uint8Array): BiomeWeatherType {
  const name = mapNameOrTitle.toLowerCase();

  // Keyword detection based on map naming conventions
  if (/cinder|ember|ash|hell|inferno|fire|lava|reckoning/.test(name)) return 'hell';
  if (/dune|desert|sand|redmarsh|arid|wasteland|quarry/.test(name)) return 'desert';
  if (/cave|vault|sunken|ossuary|drowned|sanctum|undervault|lantern/.test(name)) return 'caves';
  if (/fen|marsh|swamp|ford|glade|bog|mire|water|river|reach|tide/.test(name)) return 'swamp';

  // Terrain tile histogram fallback if provided (Terrain: 0 Grass, 1 Dirt, 2 Water, 3 Rock, 4 Marsh)
  if (terrain && terrain.length > 0) {
    let dirt = 0;
    let rock = 0;
    let waterMarsh = 0;
    const total = terrain.length;
    for (let i = 0; i < total; i++) {
      const t = terrain[i];
      if (t === 1) dirt++;
      else if (t === 3) rock++;
      else if (t === 2 || t === 4) waterMarsh++;
    }
    if (dirt / total >= 0.45) return 'desert';
    if (rock / total >= 0.35) return 'caves';
    if (waterMarsh / total >= 0.2) return 'swamp';
  }

  return 'swamp';
}

export interface WeatherParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  baseAlpha: number;
  color: number;
  life: number;
  maxLife: number;
  kind: number; // 0 = primary (rain, sand, spore, ember), 1 = secondary (splash, trail, drip, ash)
  phase: number;
  aux: number;
}

const POOL_CAPACITY = 160;

export class AestheticVfxSystem {
  readonly weatherLayer = new Container();
  readonly hazeGraphics = new Graphics();
  readonly weatherGraphics = new Graphics();

  private biome: BiomeWeatherType = 'swamp';
  private quality = 2; // 0 retro/low, 1 balanced/med, 2 high
  private enabled = true;

  private lastCamX = 0;
  private lastCamY = 0;
  private hasCam = false;

  private particles: WeatherParticle[];
  private targetParticleCount = 130;

  constructor() {
    this.weatherLayer.addChild(this.hazeGraphics, this.weatherGraphics);

    // Pre-allocate fixed pool with zero garbage collection overhead
    this.particles = Array.from({ length: POOL_CAPACITY }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 1,
      alpha: 1,
      baseAlpha: 1,
      color: 0xffffff,
      life: 0,
      maxLife: 1000,
      kind: 0,
      phase: 0,
      aux: 0,
    }));
  }

  init(): void {
    this.updateTargetParticleCount();
    this.resetParticles(800, 600);
  }

  setBiome(biomeOrAct: BiomeWeatherType | BiomeAct | number): void {
    const nextBiome = typeof biomeOrAct === 'number' ? actToBiome(biomeOrAct) : biomeOrAct;
    if (this.biome !== nextBiome) {
      this.biome = nextBiome;
      this.resetParticles(800, 600);
    }
  }

  getBiome(): BiomeWeatherType {
    return this.biome;
  }

  getAct(): BiomeAct {
    return biomeToAct(this.biome);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.weatherGraphics.clear();
      this.hazeGraphics.clear();
      for (let i = 0; i < POOL_CAPACITY; i++) {
        this.particles[i].active = false;
      }
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setQuality(q: number): void {
    this.quality = Math.max(0, Math.min(2, q));
    this.updateTargetParticleCount();
  }

  getQuality(): number {
    return this.quality;
  }

  getActiveParticleCount(): number {
    let count = 0;
    for (let i = 0; i < POOL_CAPACITY; i++) {
      if (this.particles[i].active) count++;
    }
    return count;
  }

  private updateTargetParticleCount(): void {
    // Low: ~35 particles, Med: ~70 particles, High: ~130 particles
    if (this.quality === 0) this.targetParticleCount = 35;
    else if (this.quality === 1) this.targetParticleCount = 70;
    else this.targetParticleCount = 130;
  }

  private resetParticles(viewW: number, viewH: number): void {
    const w = Math.max(100, viewW);
    const h = Math.max(100, viewH);
    for (let i = 0; i < POOL_CAPACITY; i++) {
      const p = this.particles[i];
      if (i < this.targetParticleCount && this.enabled) {
        this.spawnParticle(p, w, h, true);
      } else {
        p.active = false;
      }
    }
  }

  private spawnParticle(p: WeatherParticle, viewW: number, viewH: number, initialScatter = false): void {
    p.active = true;
    p.phase = Math.random() * Math.PI * 2;
    p.aux = 0;

    switch (this.biome) {
      case 'swamp': {
        // Act 1: Swamp - Soft atmospheric rainfall & ground ripples
        p.kind = Math.random() < 0.3 ? 1 : 0; // 0: Rain streak, 1: Ground splash
        if (p.kind === 0) {
          p.x = initialScatter ? Math.random() * (viewW + 200) - 100 : Math.random() * (viewW + 200) - 50;
          p.y = initialScatter ? Math.random() * viewH : -30;
          p.vx = -55 - Math.random() * 40; // gentle diagonal drift
          p.vy = 520 + Math.random() * 240; // swift raindrop velocity
          p.size = 0.7 + Math.random() * 0.25; // fine needle streak
          p.baseAlpha = 0.09 + Math.random() * 0.07; // soft atmospheric mist
          p.alpha = p.baseAlpha;
          p.color = Math.random() < 0.5 ? 0x9ac0d8 : 0x7e9eb4;
          p.life = 0;
          p.maxLife = 1200 + Math.random() * 600;
        } else {
          // Micro-splash bead
          p.x = Math.random() * viewW;
          p.y = viewH * 0.65 + Math.random() * viewH * 0.35;
          p.vx = (Math.random() - 0.5) * 60;
          p.vy = -20 - Math.random() * 30;
          p.size = 1.0;
          p.baseAlpha = 0.25;
          p.alpha = p.baseAlpha;
          p.color = 0xa8d0ec;
          p.life = 0;
          p.maxLife = 140 + Math.random() * 90;
        }
        break;
      }

      case 'desert': {
        // Act 2: Desert - Drifting sand dust motes & heat shimmer
        p.kind = Math.random() < 0.2 ? 1 : 0; // 0: Dust mote, 1: Fast wind streak
        p.x = initialScatter ? Math.random() * viewW : viewW + 15 + Math.random() * 30;
        p.y = initialScatter ? Math.random() * viewH : Math.random() * viewH;
        p.vx = -180 - Math.random() * 140; // strong horizontal desert breeze
        p.vy = 15 + Math.random() * 35;
        p.size = p.kind === 1 ? 1.5 : 1 + Math.random() * 1.5;
        p.baseAlpha = 0.3 + Math.random() * 0.35;
        p.alpha = p.baseAlpha;
        const colorPick = Math.random();
        p.color = colorPick < 0.45 ? 0xe4bb6e : colorPick < 0.8 ? 0xfcd888 : 0xc69648;
        p.life = 0;
        p.maxLife = 2000 + Math.random() * 1500;
        break;
      }

      case 'caves': {
        // Act 3: Caves - Bioluminescent spores & slow dripping droplets
        p.kind = Math.random() < 0.1 ? 1 : 0; // 0: Luminescent spore, 1: Water droplet
        if (p.kind === 0) {
          p.x = initialScatter ? Math.random() * viewW : Math.random() * viewW;
          p.y = initialScatter ? Math.random() * viewH : (Math.random() < 0.5 ? -10 : viewH + 10);
          p.vx = (Math.random() - 0.5) * 20; // gentle Brownian motion
          p.vy = (Math.random() - 0.5) * 16;
          p.size = 1.5 + Math.random() * 2;
          p.baseAlpha = 0.4 + Math.random() * 0.4;
          p.alpha = p.baseAlpha;
          const sporeColor = Math.random();
          p.color = sporeColor < 0.4 ? 0x48e5c2 : sporeColor < 0.75 ? 0x5bf088 : 0x9c88ff;
          p.life = 0;
          p.maxLife = 3500 + Math.random() * 3000;
        } else {
          // Dripping stalactite droplet
          p.x = Math.random() * viewW;
          p.y = initialScatter ? Math.random() * viewH * 0.5 : -15;
          p.vx = (Math.random() - 0.5) * 4;
          p.vy = 90 + Math.random() * 50; // starts slow then accelerates with gravity
          p.size = 1.8;
          p.baseAlpha = 0.65;
          p.alpha = p.baseAlpha;
          p.color = 0x98e8ff;
          p.life = 0;
          p.maxLife = 1800;
        }
        break;
      }

      case 'hell': {
        // Act 4: Hell - Upward rising ember sparks & falling ash
        p.kind = Math.random() < 0.35 ? 1 : 0; // 0: Upward ember, 1: Volcanic ash
        if (p.kind === 0) {
          p.x = initialScatter ? Math.random() * viewW : Math.random() * viewW;
          p.y = initialScatter ? Math.random() * viewH : viewH + 15 + Math.random() * 20;
          p.vx = (Math.random() - 0.5) * 50;
          p.vy = -80 - Math.random() * 130; // rising upward
          p.size = 1.5 + Math.random() * 2;
          p.baseAlpha = 0.7 + Math.random() * 0.3;
          p.alpha = p.baseAlpha;
          p.color = 0xfff090; // incandescent start
          p.life = 0;
          p.maxLife = 1800 + Math.random() * 1400;
        } else {
          // Charcoal volcanic ash drifting
          p.x = initialScatter ? Math.random() * viewW : Math.random() * (viewW + 100) - 50;
          p.y = initialScatter ? Math.random() * viewH : -15;
          p.vx = -45 - Math.random() * 55;
          p.vy = 30 + Math.random() * 50;
          p.size = 1.6 + Math.random() * 1.8;
          p.baseAlpha = 0.25 + Math.random() * 0.25;
          p.alpha = p.baseAlpha;
          p.color = Math.random() < 0.5 ? 0x484848 : 0x2e2e2e;
          p.life = 0;
          p.maxLife = 2600 + Math.random() * 1500;
        }
        break;
      }
    }
  }

  updateAndDraw(now: number, dtMs: number, camX: number, camY: number, _zoom: number, viewW: number, viewH: number): void {
    if (!this.enabled || this.targetParticleCount <= 0 || viewW <= 0 || viewH <= 0) {
      this.weatherGraphics.clear();
      this.hazeGraphics.clear();
      return;
    }

    const dt = Math.max(0.001, Math.min(0.1, dtMs / 1000));

    // Parallax delta from camera movements
    let dCamX = 0;
    let dCamY = 0;
    if (this.hasCam) {
      dCamX = camX - this.lastCamX;
      dCamY = camY - this.lastCamY;
    } else {
      this.hasCam = true;
    }
    this.lastCamX = camX;
    this.lastCamY = camY;

    const parallax = this.biome === 'swamp' ? 0.2 : this.biome === 'desert' ? 0.28 : this.biome === 'caves' ? 0.38 : 0.24;

    const wg = this.weatherGraphics;
    const hg = this.hazeGraphics;
    wg.clear();
    hg.clear();

    // 1. Draw atmospheric haze / mist / heat shimmer ribbons
    if (this.quality > 0) {
      this.drawAtmosphericHaze(hg, now, viewW, viewH);
    }

    // 2. Update and draw pooled weather particles
    const particles = this.particles;
    const maxActive = this.targetParticleCount;

    for (let i = 0; i < POOL_CAPACITY; i++) {
      const p = particles[i];
      if (i >= maxActive) {
        p.active = false;
        continue;
      }

      if (!p.active) {
        this.spawnParticle(p, viewW, viewH, false);
      }

      // Parallax shift
      p.x -= dCamX * parallax;
      p.y -= dCamY * parallax;

      // Update particle physics per biome
      p.life += dtMs;
      const progress = p.life / p.maxLife;

      if (progress >= 1) {
        this.spawnParticle(p, viewW, viewH, false);
        continue;
      }

      switch (this.biome) {
        case 'swamp': {
          if (p.kind === 0) {
            // Rain streak
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Viewport wrap or respawn
            if (p.y > viewH + 20 || p.x < -60 || p.x > viewW + 60) {
              this.spawnParticle(p, viewW, viewH, false);
              continue;
            }

            const streakLen = p.vy * 0.018;
            const endX = p.x + p.vx * 0.018;
            const endY = p.y + streakLen;

            wg.moveTo(p.x, p.y)
              .lineTo(endX, endY)
              .stroke({ color: p.color, width: p.size, alpha: p.alpha });
          } else {
            // Splash bead
            p.x += p.vx * dt;
            p.vy += 280 * dt; // gravity pulls back down
            p.y += p.vy * dt;
            const fade = 1 - progress;
            wg.circle(p.x, p.y, p.size * fade).fill({ color: p.color, alpha: p.baseAlpha * fade });
          }
          break;
        }

        case 'desert': {
          // Sand dust motes
          p.x += p.vx * dt;
          const wobble = Math.sin(now * 0.003 + p.phase) * 16;
          p.y += (p.vy + wobble) * dt;

          if (p.x < -30 || p.y < -20 || p.y > viewH + 20) {
            this.spawnParticle(p, viewW, viewH, false);
            continue;
          }

          const fade = progress < 0.15 ? progress / 0.15 : progress > 0.85 ? (1 - progress) / 0.15 : 1;
          const currentAlpha = p.baseAlpha * fade;

          if (p.kind === 1) {
            // Fast wind streak
            const streakTail = Math.min(12, Math.abs(p.vx) * 0.04);
            wg.moveTo(p.x, p.y)
              .lineTo(p.x + streakTail, p.y - 1)
              .stroke({ color: p.color, width: p.size, alpha: currentAlpha });
          } else {
            wg.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: currentAlpha });
          }
          break;
        }

        case 'caves': {
          if (p.kind === 0) {
            // Bioluminescent spore with pulsing glow
            p.x += (p.vx + Math.sin(now * 0.002 + p.phase) * 6) * dt;
            p.y += (p.vy + Math.cos(now * 0.002 + p.phase) * 5) * dt;

            if (p.x < -20 || p.x > viewW + 20 || p.y < -20 || p.y > viewH + 20) {
              this.spawnParticle(p, viewW, viewH, false);
              continue;
            }

            const pulse = 0.6 + 0.4 * Math.sin(now * 0.003 + p.phase);
            const fade = progress < 0.2 ? progress / 0.2 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
            const alpha = p.baseAlpha * pulse * fade;

            // Outer soft glow halo
            wg.circle(p.x, p.y, p.size * 2.2).fill({ color: p.color, alpha: alpha * 0.25 });
            // Bright core
            wg.circle(p.x, p.y, p.size).fill({ color: p.color, alpha });
          } else {
            // Dripping stalactite droplet
            p.vy += 380 * dt; // gravity acceleration
            p.y += p.vy * dt;
            p.x += p.vx * dt;

            if (p.y > viewH - 10) {
              // Impact ripple ring at ground/water baseline
              p.aux += dtMs;
              const rippleProg = Math.min(1, p.aux / 180);
              const r = 2 + rippleProg * 12;
              const rAlpha = (1 - rippleProg) * 0.6;
              wg.circle(p.x, viewH - 10, r).stroke({ color: 0x98e8ff, width: 1, alpha: rAlpha });
              if (rippleProg >= 1) {
                this.spawnParticle(p, viewW, viewH, false);
              }
              continue;
            }

            // Teardrop falling body
            wg.moveTo(p.x, p.y)
              .lineTo(p.x, p.y + Math.min(7, p.vy * 0.02))
              .stroke({ color: p.color, width: 1.4, alpha: p.alpha });
          }
          break;
        }

        case 'hell': {
          if (p.kind === 0) {
            // Upward ember spark with thermal jitter and incandescence cooling
            const jitter = Math.sin(now * 0.008 + p.phase) * 25;
            p.x += (p.vx + jitter) * dt;
            p.y += p.vy * dt;

            if (p.y < -20 || p.x < -30 || p.x > viewW + 30) {
              this.spawnParticle(p, viewW, viewH, false);
              continue;
            }

            // Incandescence color cooling lifecycle:
            // 0..0.25: incandescent yellow (0xfff090)
            // 0.25..0.6: flame orange (0xff6e1a)
            // 0.6..0.85: smoldering ruby red (0xcc2008)
            // 0.85..1.0: dark ember soot (0x4a120a)
            let color = 0xfff090;
            if (progress > 0.85) color = 0x4a120a;
            else if (progress > 0.6) color = 0xcc2008;
            else if (progress > 0.25) color = 0xff6e1a;

            const fade = progress > 0.8 ? (1 - progress) / 0.2 : 1;
            const alpha = p.baseAlpha * fade;

            // Soft radiant aura
            wg.circle(p.x, p.y, p.size * 2).fill({ color, alpha: alpha * 0.3 });
            // Spark point
            wg.circle(p.x, p.y, p.size).fill({ color, alpha });
          } else {
            // Tumbling dark volcanic ash flake
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            if (p.y > viewH + 20 || p.x < -30) {
              this.spawnParticle(p, viewW, viewH, false);
              continue;
            }

            const fade = progress < 0.2 ? progress / 0.2 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
            const alpha = p.baseAlpha * fade;
            const s = p.size;

            // Small irregular micro-diamond flake
            wg.moveTo(p.x, p.y - s)
              .lineTo(p.x + s * 0.8, p.y)
              .lineTo(p.x, p.y + s)
              .lineTo(p.x - s * 0.8, p.y)
              .fill({ color: p.color, alpha });
          }
          break;
        }
      }
    }
  }

  private drawAtmosphericHaze(g: Graphics, now: number, viewW: number, viewH: number): void {
    const t = now * 0.001;

    switch (this.biome) {
      case 'swamp': {
        // Eerie marsh mist: soft, organic ground-level fog puffs drifting slowly across the bottom half
        const fogPuffs = this.quality === 2 ? 4 : 3;
        for (let r = 0; r < fogPuffs; r++) {
          const fx = ((t * 22 + r * (viewW / fogPuffs) * 1.3) % (viewW + 200)) - 100;
          const fy = viewH * (0.55 + ((r * 0.14) % 0.38)) + Math.sin(t * 0.5 + r * 1.5) * 12;
          const rx = 130 + r * 30;
          const ry = 36 + r * 12;
          const alpha = 0.024 + 0.012 * Math.sin(t * 0.4 + r);
          g.ellipse(fx, fy, rx, ry).fill({ color: 0x5a7a70, alpha });
        }
        break;
      }

      case 'desert': {
        // Undulating heat shimmer mirage waves in lower 65% of screen
        const bandCount = this.quality === 2 ? 3 : 2;
        for (let b = 0; b < bandCount; b++) {
          const baseY = viewH * (0.5 + b * 0.16);
          const shimmer = Math.sin(t * 2.5 + b * 2) * 8;
          const alpha = 0.025 + 0.015 * Math.sin(t * 1.8 + b);

          g.moveTo(0, baseY + shimmer)
            .bezierCurveTo(
              viewW * 0.25,
              baseY - shimmer,
              viewW * 0.75,
              baseY + shimmer * 1.2,
              viewW,
              baseY - shimmer * 0.8
            )
            .stroke({ color: 0xffaa42, width: 36, alpha });
        }
        break;
      }

      case 'caves': {
        // Subterranean atmospheric moisture vignette / damp haze in corners
        const alpha = 0.03 + 0.015 * Math.sin(t * 0.8);
        g.circle(viewW * 0.15, viewH * 0.25, 120).fill({ color: 0x224455, alpha });
        g.circle(viewW * 0.85, viewH * 0.75, 140).fill({ color: 0x1a3a48, alpha });
        break;
      }

      case 'hell': {
        // Infernal bottom brimstone glow wave
        const glowPulse = 0.04 + 0.025 * Math.sin(t * 1.5);
        g.rect(0, viewH * 0.82, viewW, viewH * 0.18).fill({ color: 0xbd2408, alpha: glowPulse });
        break;
      }
    }
  }

  destroy(): void {
    this.weatherGraphics.destroy();
    this.hazeGraphics.destroy();
    this.weatherLayer.destroy({ children: true });
    this.particles = [];
  }
}
