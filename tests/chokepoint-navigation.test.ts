import { describe, expect, it } from 'vitest';
import { Terrain, type GameMap } from '../src/map';
import { FP, Sim } from '../src/sim/sim';
import { isChokepoint } from '../src/sim/path';

/** Create a map with an open west chamber, a 1-tile bridge at y=12, and an open east chamber. */
function bridgeMap(w = 32, h = 24, bridgeY = 12, bridgeX0 = 8, bridgeX1 = 18): GameMap {
  const blocked = new Uint8Array(w * h);
  const terrain = new Uint8Array(w * h);
  const light = new Uint8Array(w * h).fill(255);
  const height = new Uint8Array(w * h);

  // Borders
  for (let x = 0; x < w; x++) {
    blocked[0 * w + x] = 1;
    blocked[(h - 1) * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    blocked[y * w + 0] = 1;
    blocked[y * w + (w - 1)] = 1;
  }

  // Chokepoint walls dividing west and east, leaving only a 1-tile bridge at y=bridgeY
  for (let x = bridgeX0; x <= bridgeX1; x++) {
    for (let y = 1; y < h - 1; y++) {
      if (y !== bridgeY) {
        blocked[y * w + x] = 1;
        terrain[y * w + x] = Terrain.Rock;
      }
    }
  }

  return { w, h, terrain, height, blocked, objects: [], light };
}

describe('Pillar 2: Chokepoint & Bottleneck Navigation', () => {
  it('40 units pass through a 1-tile bridge without jamming, deadlocks, or giving up', () => {
    const map = bridgeMap(32, 24, 12, 10, 18);
    const numUnits = 40;
    const sim = new Sim(map, 1, Array(numUnits).fill(0));

    // Place 40 units in a compact 4x10 squad in the west chamber
    let placed = 0;
    for (let col = 3; col <= 6; col++) {
      for (let row = 7; row <= 16; row++) {
        if (placed < numUnits) {
          sim.place(placed, col, row);
          placed++;
        }
      }
    }
    expect(placed).toBe(numUnits);

    // Initial step to stabilize spatial grid
    sim.step([]);

    // Order all 40 units to move across the 1-tile bridge to the east side (x=25.5, y=12.5)
    const destX = 25.5;
    const destY = 12.5;
    sim.step([{ type: 'move', ids: Array.from({ length: numUnits }, (_, i) => i), x: destX, y: destY }]);

    // Step simulation up to 700 ticks (~28 seconds game time)
    // 40 units in single file across a 9-tile bridge at ~3.2 tiles/sec
    let allArrived = false;
    let ticks = 0;
    const maxTicks = 700;

    for (let t = 0; t < maxTicks; t++) {
      sim.step([]);
      ticks++;

      // Check how many have arrived on the east side (x >= 20)
      let arrivedCount = 0;
      for (let i = 0; i < numUnits; i++) {
        const ux = sim.x[i] / FP;
        const uy = sim.y[i] / FP;
        const distToDest = Math.hypot(ux - destX, uy - destY);
        if (ux >= 19.0 || distToDest < 3.5) {
          arrivedCount++;
        }
      }

      if (arrivedCount === numUnits) {
        allArrived = true;
        break;
      }
    }

    // Verify all 40 units arrived across the bridge
    const arrivedUnits = Array.from({ length: numUnits }, (_, i) => ({
      id: i,
      x: sim.x[i] / FP,
      y: sim.y[i] / FP,
      stuck: sim.stuck[i],
    }));

    const successfulArrivals = arrivedUnits.filter((u) => u.x >= 19.0).length;
    expect(successfulArrivals, `Expected all 40 units to cross, but only ${successfulArrivals} made it`).toBe(numUnits);
    expect(allArrived).toBe(true);

    // Verify no unit was permanently stuck or gave up in the bottleneck
    for (let i = 0; i < numUnits; i++) {
      expect(sim.stuck[i], `Unit ${i} gave up or got stuck`).toBeLessThan(200);
    }
  });

  it('guarantees exact determinism across chokepoint navigation runs', () => {
    const runSim = () => {
      const map = bridgeMap(32, 24, 12, 10, 18);
      const sim = new Sim(map, 1, Array(40).fill(0));
      let placed = 0;
      for (let col = 3; col <= 6; col++) {
        for (let row = 7; row <= 16; row++) {
          if (placed < 40) {
            sim.place(placed, col, row);
            placed++;
          }
        }
      }
      sim.step([]);
      sim.step([{ type: 'move', ids: Array.from({ length: 40 }, (_, i) => i), x: 25.5, y: 12.5 }]);
      for (let t = 0; t < 200; t++) sim.step([]);
      return sim.hash();
    };

    const hash1 = runSim();
    const hash2 = runSim();
    expect(hash1).toBe(hash2);
  });

  it('identifies chokepoints correctly using isChokepoint helper', () => {
    const map = bridgeMap(32, 24, 12, 10, 18);
    // Bridge at (12, 12) is a chokepoint (walls north and south)
    expect(isChokepoint(map, 12, 12)).toBe(true);
    // Open chamber at (4, 4) is not a chokepoint
    expect(isChokepoint(map, 4, 4)).toBe(false);
  });
});
