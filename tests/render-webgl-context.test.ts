import { describe, expect, it, vi } from 'vitest';
import { Sprite } from 'pixi.js';
import { generateMap } from '../src/map';
import { Renderer } from '../src/render';
import { Kind } from '../src/sim/combat';
import { FP, Sim } from '../src/sim/sim';

type Listener = (event: Event) => void;

function makeEventCanvas() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: (type: string, fn: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: Listener) => {
      listeners.get(type)?.delete(fn);
    },
    dispatch: (type: string) => {
      let prevented = false;
      const ev = {
        type,
        preventDefault: () => {
          prevented = true;
        },
      } as unknown as Event;
      for (const fn of listeners.get(type) ?? []) {
        fn(ev);
      }
      return { prevented };
    },
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

describe('Renderer WebGL context lost / restored recovery', () => {
  it('prevents default on webglcontextlost, skips render while lost, and reloads textures + renders on restore', () => {
    const map = generateMap(7);
    const canvas = makeEventCanvas();
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement, map);

    expect(canvas.listenerCount('webglcontextlost')).toBe(1);
    expect(canvas.listenerCount('webglcontextrestored')).toBe(1);
    expect(renderer.isContextLost).toBe(false);

    const sim = new Sim(map, 7, [0], { kinds: [Kind.Hero], combat: true });
    sim.x[0] = 8 * FP;
    sim.y[0] = 40 * FP;

    const fogUpdate = vi.fn();
    const fallbackUpdate = vi.fn();
    const atlasUpdate = vi.fn();
    const chunkUpdate = vi.fn();
    const appRender = vi.fn();
    const appResize = vi.fn();

    const rAny = renderer as unknown as {
      sprites: Sprite[];
      baseTint: number[];
      wasAlive: boolean[];
      fogSeen: number;
      fogTex: { source: { update: () => void } };
      fallbackUnitTex: { source: { update: () => void } };
      loadedAtlases: Array<{ source: { source: { update: () => void } } }>;
      app: { renderer: { resolution: number; resize: (w: number, h: number) => void }; render: () => void; stage: { children: unknown[] }; screen: { width: number; height: number } };
      ensureChunkCache: () => { chunks: { children: Array<{ texture: { source: { update: () => void } } }> } };
    };

    rAny.sprites = [new Sprite()];
    rAny.baseTint = [0xffd86a];
    rAny.wasAlive = [true];
    rAny.fogSeen = 5;
    rAny.fogTex = { source: { update: fogUpdate } };
    rAny.fallbackUnitTex = { source: { update: fallbackUpdate } };
    rAny.loadedAtlases = [{ source: { source: { update: atlasUpdate } } }];
    rAny.ensureChunkCache().chunks.children.push({ texture: { source: { update: chunkUpdate } } } as unknown as Sprite);
    rAny.app = {
      renderer: { resolution: 1, resize: appResize },
      render: appRender,
      stage: { children: [] },
      screen: { width: 800, height: 600 },
    };

    const lostRes = canvas.dispatch('webglcontextlost');
    expect(lostRes.prevented).toBe(true);
    expect(renderer.isContextLost).toBe(true);

    const prevX = new Int32Array([8 * FP]);
    const prevY = new Int32Array([40 * FP]);
    renderer.draw(sim, prevX, prevY, 1, {
      selected: new Set([0]),
      box: null,
      ping: null,
      hover: null,
      aim: null,
    });
    expect(appRender).not.toHaveBeenCalled();

    canvas.dispatch('webglcontextrestored');
    expect(renderer.isContextLost).toBe(false);
    expect(rAny.fogSeen).toBe(-1);
    expect(fogUpdate).toHaveBeenCalledTimes(1);
    expect(fallbackUpdate).toHaveBeenCalledTimes(1);
    expect(atlasUpdate).toHaveBeenCalledTimes(1);
    expect(chunkUpdate).toHaveBeenCalledTimes(1);
    expect(appRender).toHaveBeenCalledTimes(1);

    renderer.draw(sim, prevX, prevY, 1, {
      selected: new Set([0]),
      box: null,
      ping: null,
      hover: null,
      aim: null,
    });
    expect(appRender).toHaveBeenCalledTimes(2);

    renderer.destroy();
    expect(canvas.listenerCount('webglcontextlost')).toBe(0);
    expect(canvas.listenerCount('webglcontextrestored')).toBe(0);
  });
});
