import { Container, Sprite, Texture } from 'pixi.js';
import { TILE, type GameMap } from '../map';
import { paintTerrainChunk, type SceneryPlacement } from '../terrain';

export interface ChunkCoord {
  cx: number;
  cy: number;
  key: string;
  distSq: number;
}

export interface TileViewport {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function chunkSizeForMap(mapW: number, mapH: number): number {
  return Math.max(mapW, mapH) > 128 ? 32 : 16;
}

/**
 * Compute the camera's visible chunk ring (+1 chunk border around `vt`),
 * sorted closest-first and capped at `maxChunks`. Pure, deterministic, no DOM/Pixi.
 */
export function neededChunkCoords(
  mapW: number,
  mapH: number,
  vt: TileViewport,
  chunk = chunkSizeForMap(mapW, mapH),
  maxChunks = 24,
): ChunkCoord[] {
  if (mapW <= 0 || mapH <= 0 || chunk <= 0 || maxChunks <= 0) return [];
  const maxCxBound = Math.ceil(mapW / chunk) - 1;
  const maxCyBound = Math.ceil(mapH / chunk) - 1;
  const minCx = Math.max(0, Math.floor(vt.x0 / chunk) - 1);
  const maxCx = Math.min(maxCxBound, Math.floor(vt.x1 / chunk) + 1);
  const minCy = Math.max(0, Math.floor(vt.y0 / chunk) - 1);
  const maxCy = Math.min(maxCyBound, Math.floor(vt.y1 / chunk) + 1);

  const centerCx = (vt.x0 + vt.x1) / (2 * chunk);
  const centerCy = (vt.y0 + vt.y1) / (2 * chunk);

  const needed: ChunkCoord[] = [];
  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const dx = cx + 0.5 - centerCx;
      const dy = cy + 0.5 - centerCy;
      needed.push({ cx, cy, key: `${cx},${cy}`, distSq: dx * dx + dy * dy });
    }
  }
  needed.sort((a, b) => a.distSq - b.distSq);
  return needed.slice(0, maxChunks);
}

interface BakedChunk {
  cx: number;
  cy: number;
  key: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: Texture;
  sprite: Sprite;
  lastUsed: number;
}

/**
 * Bounded 24-slot LRU/distance-evicted cache of pre-baked terrain chunks.
 */
export class TerrainChunkCache {
  readonly chunks = new Container();
  private readonly maxChunks = 24;
  private chunk = 16;
  private chunkAccessSeq = 0;
  private terrainArt?: HTMLImageElement;
  private scenery: readonly SceneryPlacement[] = [];
  private readonly chunkPool: BakedChunk[] = [];
  private readonly chunkMap = new Map<string, BakedChunk>();

  init(map: GameMap, terrainArt: HTMLImageElement, scenery: readonly SceneryPlacement[]): void {
    this.terrainArt = terrainArt;
    this.scenery = scenery;
    this.chunk = chunkSizeForMap(map.w, map.h);
    this.chunks.cullable = false;
  }

  update(
    map: GameMap,
    vt: TileViewport,
  ): void {
    if (!this.terrainArt) return;
    const chunk = this.chunk;
    const chunkSizePx = chunk * TILE;
    const centerCx = (vt.x0 + vt.x1) / (2 * chunk);
    const centerCy = (vt.y0 + vt.y1) / (2 * chunk);

    const toBake = neededChunkCoords(map.w, map.h, vt, chunk, this.maxChunks);
    const activeKeys = new Set(toBake.map((n) => n.key));
    const seq = ++this.chunkAccessSeq;

    for (const req of toBake) {
      let item = this.chunkMap.get(req.key);
      if (item) {
        item.lastUsed = seq;
        item.sprite.visible = true;
        continue;
      }

      if (this.chunkPool.length < this.maxChunks) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = chunkSizePx;
        const ctx = cv.getContext('2d')!;
        paintTerrainChunk(ctx, map, req.cx, req.cy, this.terrainArt, this.scenery, chunk);
        const tex = Texture.from(cv);
        const sprite = new Sprite(tex);
        sprite.position.set(req.cx * chunkSizePx, req.cy * chunkSizePx);
        sprite.visible = true;
        this.chunks.addChild(sprite);

        item = {
          cx: req.cx,
          cy: req.cy,
          key: req.key,
          canvas: cv,
          ctx,
          tex,
          sprite,
          lastUsed: seq,
        };
        this.chunkPool.push(item);
        this.chunkMap.set(req.key, item);
      } else {
        let victim: BakedChunk | null = null;
        let maxDist = -1;
        for (const p of this.chunkPool) {
          if (!activeKeys.has(p.key)) {
            const d = (p.cx + 0.5 - centerCx) ** 2 + (p.cy + 0.5 - centerCy) ** 2;
            if (d > maxDist) {
              maxDist = d;
              victim = p;
            }
          }
        }

        if (!victim) {
          let oldest = Infinity;
          for (const p of this.chunkPool) {
            if (!activeKeys.has(p.key) && p.lastUsed < oldest) {
              oldest = p.lastUsed;
              victim = p;
            }
          }
        }

        if (victim) {
          this.chunkMap.delete(victim.key);
          victim.cx = req.cx;
          victim.cy = req.cy;
          victim.key = req.key;
          victim.lastUsed = seq;
          victim.ctx.clearRect(0, 0, chunkSizePx, chunkSizePx);
          paintTerrainChunk(victim.ctx, map, req.cx, req.cy, this.terrainArt, this.scenery, chunk);
          victim.tex.source.update();
          victim.sprite.position.set(req.cx * chunkSizePx, req.cy * chunkSizePx);
          victim.sprite.visible = true;
          this.chunkMap.set(req.key, victim);
        }
      }
    }

    for (const p of this.chunkPool) {
      if (!activeKeys.has(p.key)) {
        p.sprite.visible = false;
      }
    }
  }
}
