import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObjectKind, TILE, Terrain, type GameMap } from '../src/map';
import { paintTerrainChunk, prepareScenery, sceneryPlacement, terrainEdge, terrainVariant, TERRAIN_SHEET } from '../src/terrain';

function map(w = 18, h = 18): GameMap {
  return { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h),
    light: new Uint8Array(w * h).fill(255), blocked: new Uint8Array(w * h), objects: [] };
}

type Draw = { sx: number; sy: number; w: number; h: number; x: number; y: number };
function canvas() {
  const draws: Draw[] = [];
  const fills: { style: string; op: string; x: number; y: number; w: number; h: number }[] = [];
  const g = {
    imageSmoothingEnabled: true, globalCompositeOperation: 'source-over', fillStyle: '',
    save: vi.fn(), restore: vi.fn(),
    drawImage(_image: unknown, sx: number, sy: number, w: number, h: number, x: number, y: number, dw: number, dh: number) {
      expect([dw, dh]).toEqual([w, h]);
      draws.push({ sx, sy, w, h, x, y });
    },
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ style: this.fillStyle, op: this.globalCompositeOperation, x, y, w, h });
    },
  };
  return { g: g as unknown as CanvasRenderingContext2D, draws, fills };
}
const image = {} as CanvasImageSource;

describe('procedural terrain contract', () => {
  it('ships a small content-addressed atlas with intact metadata, pixels and own provenance', () => {
    const sheet = JSON.parse(readFileSync('public/terrain/terrain.json', 'utf8'));
    const png = readFileSync(`public/terrain/${sheet.image}`);
    const digest = createHash('sha256').update(png).digest('hex');
    expect(sheet.pngSha256).toBe(digest);
    expect(sheet.image).toBe(`terrain-${digest.slice(0, 12)}.png`);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(sheet.size);
    expect(png.length).toBeLessThan(150 * 1024);
    expect(Object.keys(sheet.frames)).toHaveLength(126);
    const provenance = JSON.parse(readFileSync('assets.json', 'utf8')).assets;
    for (const path of [`public/terrain/${sheet.image}`, 'public/terrain/terrain.json']) {
      const entries = provenance.filter((a: { path: string }) => a.path === path);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ license: 'own', source: 'tools/make-terrain.py' });
    }
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain("'**/*.{js,css,html,png,svg,json}'");
    // Reserved art doesn't silently add a new map id or collision rule.
    expect(Object.values(Terrain)).toEqual([0, 1, 2, 3, 4]);
    expect(Object.values(ObjectKind)).toEqual([0, 1]);
    expect(sheet.unused).toEqual(['snow', 'ruin']);
  });

  it('chooses stable varied frames independently of traversal order', () => {
    const coords = Array.from({ length: 100 }, (_, i) => [i % 18, Math.floor(i / 18)]);
    for (const kind of Object.values(Terrain)) {
      const a = coords.map(([x, y]) => terrainVariant(x, y, kind));
      const b = [...coords].reverse().map(([x, y]) => terrainVariant(x, y, kind)).reverse();
      expect(a).toEqual(b);
      expect([...new Set(a)].sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('uses world neighbours for transitions at chunk and map boundaries', () => {
    const m = map();
    m.terrain[15 * m.w + 16] = Terrain.Water;
    expect(terrainEdge(m, 15, 15, 1)).toBe(Terrain.Water);
    expect(terrainEdge(m, 16, 15, 3)).toBe(-1);
    expect(terrainEdge(m, 0, 0, 0)).toBe(-1);
    expect(terrainEdge(m, 0, 0, 3)).toBe(-1);
    const c = canvas();
    paintTerrainChunk(c.g, m, 0, 0, image, []);
    const v = terrainVariant(16, 15, Terrain.Water);
    const f = TERRAIN_SHEET.frames[`edge/water/1/${v}`];
    expect(c.draws).toContainEqual({ sx: f.x, sy: f.y, w: 32, h: 32, x: 480, y: 480 });
  });

  it('retains height light/cliff cues and leaves partial chunks transparent outside the map', () => {
    const m = map(17, 18);
    m.light[16 * m.w + 16] = 128;
    m.height[16 * m.w + 16] = 2;
    const before = structuredClone(m);
    const c = canvas();
    paintTerrainChunk(c.g, m, 1, 1, image, []);
    expect(c.draws).toHaveLength(2);
    expect(c.draws.map((d) => [d.x, d.y])).toEqual([[0, 0], [0, 32]]);
    expect(c.fills).toContainEqual({ style: 'rgba(0,0,0,.35)', op: 'source-over', x: 0, y: 27, w: 32, h: 5 });
    expect(c.fills.some((f) => f.op === 'lighter')).toBe(true);
    expect(c.fills.some((f) => f.style === `rgba(0,0,0,${1 - 128 / 255})`)).toBe(true);
    expect(c.g.imageSmoothingEnabled).toBe(false);
    expect(c.g.restore).toHaveBeenCalledOnce();
    expect(m).toEqual(before);
  });

  it('keeps tree and roof overhangs on all four chunks meeting at a corner', () => {
    const m = map(34, 34);
    for (const kind of [ObjectKind.Tree, ObjectKind.House]) {
      m.objects = [{ kind, x: 16, y: 16 }];
      const scenery = prepareScenery(m);
      const p = scenery[0];
      const f = TERRAIN_SHEET.frames[p.frame];
      for (const cy of [0, 1]) for (const cx of [0, 1]) {
        const c = canvas();
        paintTerrainChunk(c.g, m, cx, cy, image, scenery);
        const object = c.draws.filter((d) => d.sx === f.x && d.sy === f.y && d.w === f.w && d.h === f.h);
        expect(object).toHaveLength(1);
        expect([object[0].x + cx * 512, object[0].y + cy * 512]).toEqual([p.x, p.y]);
      }
      const far = canvas();
      paintTerrainChunk(far.g, m, 2, 2, image, scenery);
      expect(far.draws.some((d) => d.w > TILE)).toBe(false);
    }
  });

  it('sorts scenery in world order without changing gameplay order or inventing object kinds', () => {
    const m = map();
    m.objects = [{ kind: ObjectKind.House, x: 3, y: 5 }, { kind: ObjectKind.Tree, x: 2, y: 2 }];
    m.terrain[2 * m.w + 2] = Terrain.Marsh;
    const before = structuredClone(m);
    const scenery = prepareScenery(m);
    expect(scenery.map((p) => p.frame.split('/')[0])).toEqual(['tree', 'house']);
    expect(scenery[0].frame).toBe('tree/2');
    expect(sceneryPlacement(m, { kind: 99, x: 0, y: 0 })).toBeNull();
    expect(m).toEqual(before);
  });
});

describe('terrain image loading', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('awaits one shared image, rejects network/dimension errors and permits retry', async () => {
    vi.resetModules();
    const images: FakeImage[] = [];
    class FakeImage {
      src = '';
      naturalWidth = 512;
      naturalHeight = 512;
      onload?: () => void;
      onerror?: () => void;
      constructor() { images.push(this); }
    }
    vi.stubGlobal('Image', FakeImage);
    const { loadTerrainArt } = await import('../src/terrain');
    const failed = loadTerrainArt();
    expect(loadTerrainArt()).toBe(failed);
    const failure = expect(failed).rejects.toThrow('Could not load terrain atlas');
    images[0].onerror!();
    await failure;
    const wrong = loadTerrainArt();
    const mismatch = expect(wrong).rejects.toThrow('dimensions');
    images[1].naturalWidth = 32;
    images[1].onload!();
    await mismatch;
    const good = loadTerrainArt();
    expect(images[2].src).toBe(`${import.meta.env.BASE_URL}terrain/${TERRAIN_SHEET.image}`);
    let resolved = false;
    void good.then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);
    images[2].onload!();
    expect(await good).toBe(images[2]);
    expect(loadTerrainArt()).toBe(good);
    expect(images).toHaveLength(3);
  });
});
