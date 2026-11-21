import type { GameMap } from '../map';
import type { MapDoc } from '../mapdoc';
import { FP, type Sim } from './sim';
import { MAXS } from './combat';
import { Rng } from './rng';

export interface GoldPileDef {
  x: number; // tile coordinates
  y: number;
  amount: number;
}

export interface GoldPlacementOptions {
  /** Maximum number of gold piles to place on the map */
  maxPiles?: number;
  /** Average gold value range per pile */
  minGold?: number;
  maxGold?: number;
  /** Whether to place gold piles near adventure objects / chests */
  nearChests?: boolean;
  /** Whether to place gold piles in enemy encampments */
  nearEnemyCamps?: boolean;
}

/**
 * Check if a map tile coordinate is within map bounds and walkable (passable).
 */
export function isTilePassable(map: GameMap, tx: number, ty: number): boolean {
  if (tx < 1 || tx >= map.w - 1 || ty < 1 || ty >= map.h - 1) return false;
  const idx = ty * map.w + tx;
  return map.blocked[idx] === 0;
}

/**
 * Find an open, walkable tile near the specified center tile within a given radius.
 */
export function findNearbyWalkableTile(
  map: GameMap,
  centerX: number,
  centerY: number,
  minDist: number = 1,
  maxDist: number = 3,
  rng?: Rng,
): [number, number] | null {
  const candidates: [number, number][] = [];
  for (let dy = -maxDist; dy <= maxDist; dy++) {
    for (let dx = -maxDist; dx <= maxDist; dx++) {
      const d = Math.hypot(dx, dy);
      if (d < minDist || d > maxDist) continue;
      const tx = centerX + dx;
      const ty = centerY + dy;
      if (isTilePassable(map, tx, ty)) {
        candidates.push([tx, ty]);
      }
    }
  }
  if (candidates.length === 0) return null;
  if (!rng) return candidates[0];
  return candidates[rng.int(candidates.length)];
}

/**
 * Spawns a clickable interactive gold pile loot entity directly in the simulation state.
 * Returns the sack slot index (0..MAXS-1) or -1 if the loot pool is exhausted.
 */
export function spawnGoldPile(sim: Sim, tileX: number, tileY: number, amount: number): number {
  if (!isTilePassable(sim.map, tileX, tileY)) {
    // If exact tile is blocked, try finding an adjacent walkable tile
    const alt = findNearbyWalkableTile(sim.map, tileX, tileY, 1, 2, sim.rng);
    if (!alt) return -1;
    tileX = alt[0];
    tileY = alt[1];
  }

  const cb = sim.cb;
  for (let s = 0; s < MAXS; s++) {
    if (cb.sG[s] === 0) {
      cb.sX[s] = Math.round(tileX * FP);
      cb.sY[s] = Math.round(tileY * FP);
      cb.sG[s] = Math.max(1, Math.round(amount));
      return s;
    }
  }
  return -1;
}

/**
 * Retrieves all currently active gold pile loot entities from the simulation.
 */
export function getActiveGoldPiles(sim: Sim): { slot: number; tileX: number; tileY: number; amount: number }[] {
  const cb = sim.cb;
  const result: { slot: number; tileX: number; tileY: number; amount: number }[] = [];
  for (let s = 0; s < MAXS; s++) {
    if (cb.sG[s] > 0) {
      result.push({
        slot: s,
        tileX: cb.sX[s] / FP,
        tileY: cb.sY[s] / FP,
        amount: cb.sG[s],
      });
    }
  }
  return result;
}

/**
 * Collects a gold pile manually or via interaction, increasing team gold
 * and triggering the gold pickup floating text and audio event (event type 3).
 */
export function collectGoldPile(sim: Sim, slot: number, team: number = 0): number {
  const cb = sim.cb;
  if (slot < 0 || slot >= MAXS || cb.sG[slot] <= 0) return 0;
  const amount = cb.sG[slot];
  cb.gold[team & 3] += amount;
  // Event 3 emits floating "+<amount>g" text and triggers 'gold' pickup audio cue
  cb.emit(3, cb.sX[slot], cb.sY[slot], amount, 0);
  cb.sG[slot] = 0;
  return amount;
}

/**
 * Wires interactive gold pile loot entities into campaign map placement.
 * Automatically spawns clickable gold piles on campaign maps alongside chests,
 * adventure objects, and monster camps.
 */
export function placeCampaignGoldPiles(
  sim: Sim,
  doc?: MapDoc,
  rng: Rng = sim.rng,
  options?: GoldPlacementOptions,
): number {
  const map = sim.map;
  const maxPiles = options?.maxPiles ?? 12;
  const minGold = options?.minGold ?? 25;
  const maxGold = options?.maxGold ?? 150;
  let placedCount = 0;

  const usedLocations = new Set<number>();
  const markUsed = (tx: number, ty: number) => usedLocations.add(ty * map.w + tx);
  const isUsed = (tx: number, ty: number) => usedLocations.has(ty * map.w + tx);

  // 1. Spawn gold piles alongside adventure objects / chests
  if (options?.nearChests !== false && doc?.adventureObjects?.length) {
    for (const obj of doc.adventureObjects) {
      if (placedCount >= maxPiles) break;
      const countForObj = 1 + rng.int(2); // 1 to 2 gold piles near each chest / mill
      for (let k = 0; k < countForObj; k++) {
        if (placedCount >= maxPiles) break;
        const spot = findNearbyWalkableTile(map, obj.x, obj.y, 1, 3, rng);
        if (spot && !isUsed(spot[0], spot[1])) {
          const goldAmount = minGold + rng.int(maxGold - minGold + 1);
          const slot = spawnGoldPile(sim, spot[0], spot[1], goldAmount);
          if (slot >= 0) {
            markUsed(spot[0], spot[1]);
            placedCount++;
          }
        }
      }
    }
  }

  // 2. Spawn gold piles alongside enemy encampments and monster clusters
  if (options?.nearEnemyCamps !== false && doc?.units?.length) {
    // Collect enemy positions (team != 0)
    const enemies = doc.units.filter((u) => u.team !== 0);
    // Cluster enemies into camp anchors
    const campAnchors: { x: number; y: number; count: number }[] = [];
    for (const u of enemies) {
      let foundCamp = false;
      for (const camp of campAnchors) {
        if (Math.hypot(camp.x - u.x, camp.y - u.y) <= 6) {
          camp.count++;
          foundCamp = true;
          break;
        }
      }
      if (!foundCamp) {
        campAnchors.push({ x: u.x, y: u.y, count: 1 });
      }
    }

    // Sort camps by density/importance
    campAnchors.sort((a, b) => b.count - a.count);

    for (const camp of campAnchors) {
      if (placedCount >= maxPiles) break;
      const spot = findNearbyWalkableTile(map, camp.x, camp.y, 1, 4, rng);
      if (spot && !isUsed(spot[0], spot[1])) {
        // Camp spoils are richer
        const goldAmount = Math.round((minGold + rng.int(maxGold - minGold + 1)) * 1.25);
        const slot = spawnGoldPile(sim, spot[0], spot[1], goldAmount);
        if (slot >= 0) {
          markUsed(spot[0], spot[1]);
          placedCount++;
        }
      }
    }
  }

  // 3. Fallback: if fewer than 4 piles were placed, sprinkle across explored points of interest
  if (placedCount < Math.min(4, maxPiles)) {
    const needed = Math.min(4, maxPiles) - placedCount;
    for (let i = 0; i < needed; i++) {
      let attempts = 0;
      while (attempts < 50) {
        attempts++;
        const tx = 2 + rng.int(map.w - 4);
        const ty = 2 + rng.int(map.h - 4);
        if (isTilePassable(map, tx, ty) && !isUsed(tx, ty)) {
          const goldAmount = minGold + rng.int(maxGold - minGold + 1);
          const slot = spawnGoldPile(sim, tx, ty, goldAmount);
          if (slot >= 0) {
            markUsed(tx, ty);
            placedCount++;
            break;
          }
        }
      }
    }
  }

  return placedCount;
}
