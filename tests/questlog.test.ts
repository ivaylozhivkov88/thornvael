import { describe, expect, it } from 'vitest';
import { QuestNavigator } from '../src/questlog';
import { Minimap } from '../src/minimap';
import { GameMap, Terrain } from '../src/map';
import { Sim, FP } from '../src/sim/sim';
import { Rng } from '../src/sim/rng';
import {
  spawnGoldPile,
  getActiveGoldPiles,
  collectGoldPile,
  placeCampaignGoldPiles,
  findNearbyWalkableTile,
  isTilePassable,
} from '../src/sim/loot';
import { createMission } from '../src/mission';
import { loadDoc } from '../src/mapdoc';
import bloodMapJson from '../src/missions/blood-at-the-ford.map.json';

function createTestMap(w = 64, h = 64): GameMap {
  const terrain = new Uint8Array(w * h).fill(Terrain.Grass);
  const height = new Uint8Array(w * h).fill(0);
  const light = new Uint8Array(w * h).fill(255);
  const blocked = new Uint8Array(w * h).fill(0);
  const objects: any[] = [];
  // Add some boundary obstacle walls
  for (let x = 0; x < w; x++) {
    blocked[x] = 1;
    blocked[(h - 1) * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    blocked[y * w] = 1;
    blocked[y * w + (w - 1)] = 1;
  }
  return { w, h, terrain, height, light, blocked, objects };
}

function createMockCanvas(w: number, h: number): HTMLCanvasElement {
  return {
    width: w,
    height: h,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    getContext: () => ({
      imageSmoothingEnabled: false,
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      createImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
      drawImage: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      stroke: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
    }),
  } as unknown as HTMLCanvasElement;
}

describe('QuestNavigator (src/questlog.ts)', () => {
  it('manages active navigation targets correctly', () => {
    const nav = new QuestNavigator();
    expect(nav.hasActiveTarget()).toBe(false);
    expect(nav.getTarget()).toBeNull();

    const target = nav.setTarget(32, 48, 'Sunken Ford');
    expect(nav.hasActiveTarget()).toBe(true);
    expect(target.x).toBe(32);
    expect(target.y).toBe(48);
    expect(target.label).toBe('Sunken Ford');
    expect(nav.getTarget()).toEqual(target);

    nav.clearTarget();
    expect(nav.hasActiveTarget()).toBe(false);
    expect(nav.getTarget()).toBeNull();
  });

  it('determines arrival distance accurately', () => {
    const nav = new QuestNavigator();
    nav.setTarget(30, 30, 'Target Shrine');

    // Outside threshold (default 2.5)
    expect(nav.isArrived(35, 30)).toBe(false);
    expect(nav.isArrived(30, 33)).toBe(false);

    // Inside threshold
    expect(nav.isArrived(30, 32)).toBe(true);
    expect(nav.isArrived(31, 31)).toBe(true);
    expect(nav.isArrived(30, 30)).toBe(true);
  });

  it('computes tile edge indicator when target is inside viewport', () => {
    const nav = new QuestNavigator();
    nav.setTarget(20, 20, 'Inside Target');

    const view = { x0: 10, y0: 10, x1: 30, y1: 30 };
    const res = nav.computeEdgeIndicator(view, 1.0);
    expect(res).not.toBeNull();
    expect(res!.isOutside).toBe(false);
    expect(res!.edgeX).toBe(20);
    expect(res!.edgeY).toBe(20);
    expect(res!.distanceTiles).toBe(0);
  });

  it('computes clamped edge coordinates and angle when target is outside viewport', () => {
    const nav = new QuestNavigator();
    nav.setTarget(60, 20, 'East Objective');

    const view = { x0: 10, y0: 10, x1: 30, y1: 30 }; // center is (20, 20)
    const res = nav.computeEdgeIndicator(view, 1.0);
    expect(res).not.toBeNull();
    expect(res!.isOutside).toBe(true);
    expect(res!.edgeX).toBeCloseTo(29, 1); // clamped to x1 - margin
    expect(res!.edgeY).toBeCloseTo(20, 1);
    expect(res!.angle).toBeCloseTo(0, 2); // 0 radians (due East)
    expect(res!.distanceTiles).toBe(40);
  });

  it('computes screen edge arrow correctly for HUD overlay', () => {
    const nav = new QuestNavigator();
    nav.setTarget(50, 50, 'Far Outpost');

    // camX: 0, camY: 0, viewW: 800, viewH: 600, zoom: 1, tileSize: 32
    // target screen is (50.5 * 32) = 1616, (50.5 * 32) = 1616 -> far outside view
    const res = nav.computeScreenEdgeArrow(0, 0, 800, 600, 1.0, 32, 32);
    expect(res).not.toBeNull();
    expect(res!.isOutside).toBe(true);
    expect(res!.screenX).toBeGreaterThanOrEqual(32);
    expect(res!.screenX).toBeLessThanOrEqual(800 - 32);
    expect(res!.screenY).toBeGreaterThanOrEqual(32);
    expect(res!.screenY).toBeLessThanOrEqual(600 - 32);
    expect(res!.angle).toBeGreaterThan(0); // pointing southeast
  });

  it('evaluates pulse wave phase seamlessly', () => {
    const nav = new QuestNavigator();
    const p0 = nav.getPulsePhase(1000, 250);
    expect(p0).toBeCloseTo(0.25, 3);
    const p1 = nav.getPulsePhase(1000, 1250);
    expect(p1).toBeCloseTo(0.25, 3);
  });
});

describe('Minimap Quest Goal & Directional Marker (src/minimap.ts)', () => {
  it('manages quest goal state on minimap', () => {
    const prevDoc = globalThis.document;
    globalThis.document = {
      createElement: () => createMockCanvas(32, 32),
    } as any;

    try {
      const map = createTestMap(32, 32);
      const canvas = createMockCanvas(32, 32);
      const minimap = new Minimap(canvas, map);

      expect(minimap.getQuestGoal()).toBeNull();
      minimap.setQuestGoal(14, 18);
      expect(minimap.getQuestGoal()).toEqual({ x: 14, y: 18 });

      minimap.setQuestGoal(null, null);
      expect(minimap.getQuestGoal()).toBeNull();
    } finally {
      globalThis.document = prevDoc;
    }
  });

  it('draws without error when quest goal is inside view or outside view', () => {
    const prevDoc = globalThis.document;
    globalThis.document = {
      createElement: () => createMockCanvas(64, 64),
    } as any;

    try {
      const map = createTestMap(64, 64);
      const canvas = createMockCanvas(64, 64);
      const minimap = new Minimap(canvas, map);
      const sim = new Sim(map, 42, [0, 1], { combat: true });

      // Target inside view
      minimap.setQuestGoal(15, 15);
      expect(() => {
        minimap.draw(sim, { x0: 10, y0: 10, x1: 25, y1: 25 }, new Set());
      }).not.toThrow();

      // Target outside view (triggers edge indicator arrow rendering on minimap)
      minimap.setQuestGoal(55, 55);
      expect(() => {
        minimap.draw(sim, { x0: 10, y0: 10, x1: 25, y1: 25 }, new Set());
      }).not.toThrow();
    } finally {
      globalThis.document = prevDoc;
    }
  });
});

describe('Interactive Gold Piles (src/sim/loot.ts)', () => {
  it('identifies passable tiles and finds nearby open spots', () => {
    const map = createTestMap(32, 32);
    expect(isTilePassable(map, 0, 0)).toBe(false); // boundary wall
    expect(isTilePassable(map, 10, 10)).toBe(true);

    const spot = findNearbyWalkableTile(map, 10, 10, 1, 2);
    expect(spot).not.toBeNull();
    expect(isTilePassable(map, spot![0], spot![1])).toBe(true);
  });

  it('spawns clickable gold piles directly into simulation loot pool', () => {
    const map = createTestMap(32, 32);
    const sim = new Sim(map, 100, [0, 1], { combat: true });

    const slot0 = spawnGoldPile(sim, 12, 14, 85);
    expect(slot0).toBeGreaterThanOrEqual(0);
    expect(sim.cb.sG[slot0]).toBe(85);
    expect(sim.cb.sX[slot0]).toBe(Math.round(12 * FP));
    expect(sim.cb.sY[slot0]).toBe(Math.round(14 * FP));

    const slot1 = spawnGoldPile(sim, 20, 22, 120);
    expect(slot1).toBeGreaterThanOrEqual(0);
    expect(sim.cb.sG[slot1]).toBe(120);

    const piles = getActiveGoldPiles(sim);
    expect(piles.length).toBe(2);
    expect(piles[0].amount).toBe(85);
    expect(piles[1].amount).toBe(120);
  });

  it('collects gold pile, increasing team treasury and emitting event 3 (sound & floaters)', () => {
    const map = createTestMap(32, 32);
    const sim = new Sim(map, 101, [0, 1], { combat: true });
    sim.cb.recordFx = true;

    const initialGold = sim.cb.gold[0];
    const slot = spawnGoldPile(sim, 15, 15, 95);

    const collected = collectGoldPile(sim, slot, 0);
    expect(collected).toBe(95);
    expect(sim.cb.gold[0]).toBe(initialGold + 95);
    expect(sim.cb.sG[slot]).toBe(0); // slot cleared

    // Verify Event 3 was emitted with coordinates and gold amount in v
    const goldEvent = sim.cb.fx.find((e) => e.type === 3 && e.v === 95);
    expect(goldEvent).toBeDefined();
    expect(goldEvent!.v).toBe(95);
  });

  it('places campaign gold piles alongside chests and camps', () => {
    const map = createTestMap(64, 64);
    const sim = new Sim(map, 102, [0, 1], { combat: true });

    const mockDoc: any = {
      name: 'Test Campaign Mission',
      w: 64,
      h: 64,
      adventureObjects: [
        { x: 15, y: 15, kind: 'watermill', rewardGold: 100 },
        { x: 40, y: 35, kind: 'windmill', rewardGold: 120 },
      ],
      units: [
        { x: 25, y: 25, team: 1, kind: 1 },
        { x: 26, y: 25, team: 1, kind: 1 },
        { x: 25, y: 26, team: 1, kind: 1 },
      ],
    };

    const count = placeCampaignGoldPiles(sim, mockDoc, new Rng(777), { maxPiles: 8 });
    expect(count).toBeGreaterThanOrEqual(3);

    const activePiles = getActiveGoldPiles(sim);
    expect(activePiles.length).toBe(count);
    for (const p of activePiles) {
      expect(p.amount).toBeGreaterThanOrEqual(25);
      expect(isTilePassable(map, Math.floor(p.tileX), Math.floor(p.tileY))).toBe(true);
    }
  });

  it('spawns gold piles in loaded campaign missions (Blood at the Ford)', () => {
    const loaded = loadDoc(bloodMapJson as any);
    const mission = createMission(loaded, 42);
    const sim = mission.sim;

    const piles = getActiveGoldPiles(sim);
    expect(piles.length).toBeGreaterThan(0);

    // Pick up the first gold pile
    const initialGold = sim.cb.gold[0];
    const first = piles[0];
    const picked = collectGoldPile(sim, first.slot, 0);
    expect(picked).toBe(first.amount);
    expect(sim.cb.gold[0]).toBe(initialGold + picked);
  });
});
