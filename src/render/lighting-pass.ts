import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { type DynamicLightingSystem } from '../fx/dynamic-lighting';
import { Terrain, TILE, type GameMap } from '../map';
import { FP, type Sim } from '../sim/sim';

export const NIGHT_RGB: readonly [number, number, number] = [0x5a, 0x6a, 0xa6];

export const SHRINE_COLORS: Readonly<Record<string, number>> = {
  healing: 0xe84a5f,
  mana: 0x4aa3ff,
  combat: 0xff8c32,
  armor: 0xc0c8d8,
  haste: 0x62e878,
  ward: 0xd070ff,
};

export interface LightingPassRenderParams {
  dl: DynamicLightingSystem;
  sim: Sim;
  map: GameMap;
  biomeName: string;
  vt: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
  camX: number;
  camY: number;
  zoom: number;
  viewW: number;
  viewH: number;
  quality: number;
  onFallbackDaylight?: (daylight: number) => void;
}

/**
 * Handles the low-res multiply + additive dynamic lighting canvases, ambient daylight
 * fallback layer, quality toggling, and per-frame dynamic light gathering.
 */
export class LightingPass {
  readonly light = new Graphics();
  private lightKey = '';
  private dynLightMulCv?: HTMLCanvasElement;
  private dynLightMulCtx?: CanvasRenderingContext2D | null;
  private dynLightMulTex?: Texture;
  private dynLightMulSprite?: Sprite;
  private dynLightAddCv?: HTMLCanvasElement;
  private dynLightAddCtx?: CanvasRenderingContext2D | null;
  private dynLightAddTex?: Texture;
  private dynLightAddSprite?: Sprite;

  /**
   * Initializes low-res 384x216 multiply & additive sprites (when DOM canvas exists)
   * and returns the lighting display objects to attach to the stage.
   */
  initStageLayers(feelLightSprite?: Sprite | null): Container[] {
    if (typeof document !== 'undefined' && !this.dynLightMulSprite) {
      this.dynLightMulCv = document.createElement('canvas');
      this.dynLightMulCv.width = 384;
      this.dynLightMulCv.height = 216;
      this.dynLightMulCtx = this.dynLightMulCv.getContext('2d');
      this.dynLightMulTex = Texture.from(this.dynLightMulCv);
      this.dynLightMulSprite = new Sprite(this.dynLightMulTex);
      this.dynLightMulSprite.blendMode = 'multiply';
      this.dynLightMulSprite.eventMode = 'none';

      this.dynLightAddCv = document.createElement('canvas');
      this.dynLightAddCv.width = 384;
      this.dynLightAddCv.height = 216;
      this.dynLightAddCtx = this.dynLightAddCv.getContext('2d');
      this.dynLightAddTex = Texture.from(this.dynLightAddCv);
      this.dynLightAddSprite = new Sprite(this.dynLightAddTex);
      this.dynLightAddSprite.blendMode = 'add';
      this.dynLightAddSprite.eventMode = 'none';
    }

    if (this.dynLightMulSprite && this.dynLightAddSprite) {
      if (feelLightSprite) feelLightSprite.visible = false;
      return [this.dynLightMulSprite, this.dynLightAddSprite];
    }
    if (feelLightSprite) {
      return [feelLightSprite];
    }
    this.light.blendMode = 'multiply';
    return [this.light];
  }

  /** Toggle lighting layers and invalidate cached ambient key when quality changes. */
  syncQuality(quality: number, dynamicLightingEnabled: boolean, feelLightSprite?: Sprite | null): void {
    const lightOn = quality > 0 && dynamicLightingEnabled;
    this.light.visible = lightOn;
    if (this.dynLightMulSprite) this.dynLightMulSprite.visible = lightOn;
    if (this.dynLightAddSprite) this.dynLightAddSprite.visible = lightOn;
    if (feelLightSprite) feelLightSprite.visible = false;
    this.lightKey = '';
  }

  /** Collect dynamic light sources for the visible world bounds. */
  gatherDynamicLights(
    dl: DynamicLightingSystem,
    sim: Sim,
    map: GameMap,
    biomeName: string,
    vt: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number },
  ): void {
    const k = TILE / FP;
    const mw = map.w;
    const minTx = Math.max(0, Math.floor(vt.x0));
    const maxTx = Math.min(mw - 1, Math.ceil(vt.x1));
    const minTy = Math.max(0, Math.floor(vt.y0));
    const maxTy = Math.min(map.h - 1, Math.ceil(vt.y1));

    dl.beginFrame();
    const heroIdx = sim.hero ? sim.hero.id : 0;
    if (sim.count > heroIdx && sim.cb.hp[heroIdx] > 0) {
      dl.setHeroLight(sim.x[heroIdx] * k, sim.y[heroIdx] * k, 195);
    } else {
      dl.clearHeroLight();
    }

    for (let n = 0; n < sim.shrines.length; n++) {
      if (sim.shrineCd[n] === 0) {
        const sh = sim.shrines[n];
        dl.addLight({
          kind: 'shrine',
          x: (sh.x + 0.5) * TILE,
          y: (sh.y + 0.5) * TILE,
          radius: 90,
          color: SHRINE_COLORS[sh.kind] ?? 0x68d8ff,
        });
      }
    }

    if (sim.towns?.length) {
      for (const town of sim.towns) {
        for (let role = 0; role < town.centre.length; role++) {
          const c = town.centre[role];
          if (!c) continue;
          dl.addLight({
            kind: 'torch',
            x: c[0] * TILE,
            y: (c[1] + 0.6) * TILE,
            radius: 130,
            color: role === 2 ? 0x58c8ff : 0xff8c28,
          });
        }
      }
    }

    if (biomeName === 'caldera') {
      for (let ty = minTy; ty <= maxTy; ty += 2) {
        for (let tx = minTx; tx <= maxTx; tx += 2) {
          const idx = ty * mw + tx;
          if (map.terrain[idx] === Terrain.Water && sim.explored[idx]) {
            dl.addLight({
              kind: 'lava',
              x: (tx + 0.5) * TILE,
              y: (ty + 0.5) * TILE,
              radius: 78,
              color: 0xff4410,
            });
          }
        }
      }
    }
  }

  /** Full-screen multiply ambient layer fallback when offscreen 2D canvases are absent. */
  renderAmbientFallback(daylight: number, viewW: number, viewH: number): void {
    const t = Math.max(0, Math.min(1, (255 - daylight) / 180));
    const key = `${t.toFixed(3)}:${viewW}x${viewH}`;
    if (key === this.lightKey) return;
    this.lightKey = key;
    const c = NIGHT_RGB.map((n) => Math.round(255 + (n - 255) * t));
    this.light.clear().rect(0, 0, viewW, viewH).fill((c[0] << 16) | (c[1] << 8) | c[2]);
  }

  /** Execute lighting pass for the current frame or hide lighting layers when disabled. */
  render(params: LightingPassRenderParams): void {
    const { dl, sim, map, biomeName, vt, camX, camY, zoom, viewW, viewH, quality } = params;
    if (quality > 0 && dl.isEnabled()) {
      this.gatherDynamicLights(dl, sim, map, biomeName, vt);
      if (
        this.dynLightMulCtx &&
        this.dynLightMulCv &&
        this.dynLightMulTex &&
        this.dynLightMulSprite &&
        this.dynLightAddCtx &&
        this.dynLightAddTex &&
        this.dynLightAddSprite
      ) {
        dl.renderToCanvases(
          this.dynLightMulCtx,
          this.dynLightAddCtx,
          this.dynLightMulCv.width,
          this.dynLightMulCv.height,
          camX,
          camY,
          zoom,
          viewW,
          viewH,
          sim.daylight,
        );
        this.dynLightMulTex.source.update();
        this.dynLightAddTex.source.update();
        this.dynLightMulSprite.width = viewW;
        this.dynLightMulSprite.height = viewH;
        this.dynLightMulSprite.visible = true;
        this.dynLightAddSprite.width = viewW;
        this.dynLightAddSprite.height = viewH;
        this.dynLightAddSprite.visible = true;
      } else if (params.onFallbackDaylight) {
        params.onFallbackDaylight(sim.daylight);
      } else {
        this.renderAmbientFallback(sim.daylight, viewW, viewH);
      }
    } else {
      if (this.dynLightMulSprite) this.dynLightMulSprite.visible = false;
      if (this.dynLightAddSprite) this.dynLightAddSprite.visible = false;
      this.light.visible = false;
    }
  }
}
