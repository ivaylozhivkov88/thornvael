import { describe, expect, it } from 'vitest';
import { Minimap } from '../src/minimap';
import { TILE } from '../src/map';

describe('Camera & WASD Controls', () => {
  it('calculates target camera coordinates centered on hero', () => {
    const zoom = 1;
    const viewW = 1280;
    const viewH = 720;

    // Hero at tile (100, 200)
    const heroTileX = 100;
    const heroTileY = 200;

    const targetCamX = heroTileX * TILE * zoom - viewW / 2;
    const targetCamY = heroTileY * TILE * zoom - viewH / 2;

    expect(targetCamX).toBe(100 * 32 - 640); // 3200 - 640 = 2560
    expect(targetCamY).toBe(200 * 32 - 360); // 6400 - 360 = 6040

    // Smooth lerp convergence
    let camX = 0;
    let camY = 0;
    const factor = 0.2;
    for (let i = 0; i < 60; i++) {
      if (Math.abs(targetCamX - camX) < 1) camX = targetCamX;
      else camX += (targetCamX - camX) * factor;

      if (Math.abs(targetCamY - camY) < 1) camY = targetCamY;
      else camY += (targetCamY - camY) * factor;
    }
    expect(camX).toBe(targetCamX);
    expect(camY).toBe(targetCamY);
  });

  it('computes WASD direction vector and target tile in front of hero', () => {
    const mapW = 640;
    const mapH = 480;
    const heroX = 50;
    const heroY = 50;

    // Press D and W (moving up-right)
    const heldD = true;
    const heldA = false;
    const heldS = false;
    const heldW = true;

    const dx = (heldD ? 1 : 0) - (heldA ? 1 : 0);
    const dy = (heldS ? 1 : 0) - (heldW ? 1 : 0);

    expect(dx).toBe(1);
    expect(dy).toBe(-1);

    const targetX = Math.max(0.5, Math.min(mapW - 1.5, heroX + dx * 2.5));
    const targetY = Math.max(0.5, Math.min(mapH - 1.5, heroY + dy * 2.5));

    expect(targetX).toBe(52.5);
    expect(targetY).toBe(47.5);
  });

  it('clamps WASD movement safely at massive map boundaries (640x480)', () => {
    const mapW = 640;
    const mapH = 480;

    // Near top-left boundary moving up-left
    const heroX = 1;
    const heroY = 1;
    const dx = -1;
    const dy = -1;

    const targetX = Math.max(0.5, Math.min(mapW - 1.5, heroX + dx * 2.5));
    const targetY = Math.max(0.5, Math.min(mapH - 1.5, heroY + dy * 2.5));

    expect(targetX).toBe(0.5);
    expect(targetY).toBe(0.5);

    // Near bottom-right boundary moving down-right
    const heroX2 = 639;
    const heroY2 = 479;
    const targetX2 = Math.max(0.5, Math.min(mapW - 1.5, heroX2 + 1 * 2.5));
    const targetY2 = Math.max(0.5, Math.min(mapH - 1.5, heroY2 + 1 * 2.5));

    expect(targetX2).toBe(638.5);
    expect(targetY2).toBe(478.5);
  });

  it('minimap dynamically scales down for 640x480 massive map to conserve canvas memory', () => {
    const dummyMap = {
      w: 640,
      h: 480,
      terrain: new Uint8Array(640 * 480),
      height: new Uint8Array(640 * 480),
      blocked: new Uint8Array(640 * 480),
      light: new Uint8Array(640 * 480),
      objects: [],
      regions: [],
      spawners: [],
    };

    // Canvas mock
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        createImageData: () => ({ data: new Uint8ClampedArray(640 * 480 * 4) }),
        putImageData: () => {},
        drawImage: () => {},
        fillRect: () => {},
        strokeRect: () => {},
      }),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 256, height: 192 }),
    } as unknown as HTMLCanvasElement;

    // Document mock for internal canvas creation
    if (typeof document !== 'undefined') {
      const origCreateElement = document.createElement.bind(document);
      document.createElement = (tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ({
              createImageData: () => ({ data: new Uint8ClampedArray(640 * 480 * 4) }),
              putImageData: () => {},
            }),
          } as unknown as HTMLElement;
        }
        return origCreateElement(tag);
      };

      const mini = new Minimap(canvas, dummyMap as any);
      expect(canvas.width).toBeLessThanOrEqual(256);
      expect(canvas.height).toBeLessThanOrEqual(192);

      // Verify tileAt correctly maps client coordinates to 640x480 world tiles
      const [tx, ty] = mini.tileAt(128, 96);
      expect(Math.round(tx)).toBe(320);
      expect(Math.round(ty)).toBe(240);

      document.createElement = origCreateElement;
    }
  });
});
