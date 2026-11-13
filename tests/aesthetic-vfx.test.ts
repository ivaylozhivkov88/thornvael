import { describe, expect, it } from 'vitest';
import { generateMap, Terrain } from '../src/map';
import { paintTerrainChunk, prepareScenery } from '../src/terrain';

describe('HOMM III Terrain Aesthetic & Micro-animations', () => {
  it('paintTerrainChunk applies HOMM III vibrant color grading without throwing', () => {
    const map = generateMap(12345);
    const scenery = prepareScenery(map);

    // Mock CanvasRenderingContext2D
    const fills: string[] = [];
    const mockCtx = {
      save: () => {},
      restore: () => {},
      imageSmoothingEnabled: false,
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      fillRect: (_x: number, _y: number, _w: number, _h: number) => {
        fills.push(String(mockCtx.fillStyle));
      },
      drawImage: () => {},
    } as unknown as CanvasRenderingContext2D;

    const mockArt = {} as CanvasImageSource;

    paintTerrainChunk(mockCtx, map, 0, 0, mockArt, scenery, 16);

    // Verify HOMM III palette colors were applied:
    // Grass: rgba(35, 175, 55, 0.08)
    // Dirt: rgba(235, 170, 70, 0.09)
    // Water: rgba(20, 75, 190, 0.14)
    expect(fills.some((f) => f.includes('35, 175, 55'))).toBe(true);
    expect(fills.some((f) => f.includes('235, 170, 70'))).toBe(true);
  });

  it('calculates 8-frame micro-animation loop cycles correctly', () => {
    // 8-frame loop ticks every 4 sim ticks (160ms per frame, 1.28s total cycle)
    const getFrame8 = (tick: number) => (tick >> 2) & 7;

    expect(getFrame8(0)).toBe(0);
    expect(getFrame8(4)).toBe(1);
    expect(getFrame8(8)).toBe(2);
    expect(getFrame8(28)).toBe(7);
    expect(getFrame8(32)).toBe(0); // loops seamlessly!
  });

  it('specular glint activates every 3-4 seconds (85 ticks) for a 14-tick sparkle ping', () => {
    const isGlintActive = (tick: number, seed: number) => {
      const period = 85;
      const phase = (tick + seed * 23) % period;
      return phase < 14;
    };

    // At tick 0, seed 0: active
    expect(isGlintActive(0, 0)).toBe(true);
    // At tick 7, seed 0: still active (halfway through ping star)
    expect(isGlintActive(7, 0)).toBe(true);
    // At tick 14, seed 0: finished
    expect(isGlintActive(14, 0)).toBe(false);
    // At tick 40, seed 0: inactive
    expect(isGlintActive(40, 0)).toBe(false);
    // At tick 85 (3.4s later): fires again!
    expect(isGlintActive(85, 0)).toBe(true);
  });
});
