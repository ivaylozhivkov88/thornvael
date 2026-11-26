import { describe, expect, it } from 'vitest';
import {
  CompanionController,
  DIFFICULTY_TIERS,
  SkirmishModeController,
  WORLD_SHRINE_KINDS,
  WorldEventsDirector,
  createHardcoreRecord,
  recordHeroDeath,
} from '../src/sim/ai';

describe('E3/E6/E12/E13: WorldEventsDirector (Shrines, Quests, Waypoints, Roaming Events)', () => {
  it('activates all 5 shrine kinds and expires buffs deterministically', () => {
    const w = new WorldEventsDirector(101);
    const ids = WORLD_SHRINE_KINDS.map((k, idx) => w.addShrine(k, idx * 256, 256).id);

    for (let i = 0; i < ids.length; i++) {
      const buff = w.activateShrine(ids[i]);
      expect(buff).not.toBeNull();
      expect(w.hasBuff(WORLD_SHRINE_KINDS[i])).toBe(true);
      // Cannot reactivate while on cooldown
      expect(w.activateShrine(ids[i])).toBeNull();
    }

    for (let t = 0; t < 1500; t++) w.step(512, 512);
    expect(w.hasBuff('haste')).toBe(false);
    expect(w.hasBuff('xp')).toBe(false);
  });

  it('runs wave_defense, escort, and hunt quest state machines', () => {
    const w = new WorldEventsDirector(202);
    const waveQ = w.startWaveDefense(2, 100, 3);
    for (let i = 0; i < 6; i++) w.recordWaveFoeKilled(waveQ.id, 3);
    expect(waveQ.status).toBe('completed');

    const escortQ = w.startEscort(3, 100);
    w.advanceEscort(escortQ.id);
    w.advanceEscort(escortQ.id);
    w.advanceEscort(escortQ.id);
    expect(escortQ.status).toBe('completed');

    const failEscort = w.startEscort(3, 50);
    w.damageEscort(failEscort.id, 50);
    expect(failEscort.status).toBe('failed');

    const huntQ = w.startHunt('Grok-Champion', 999);
    w.onUnitSlain(999);
    expect(huntQ.status).toBe('completed');
    expect(huntQ.slain).toBe(true);
  });

  it('validates waypoint discovery and fast travel', () => {
    const w = new WorldEventsDirector(303);
    w.registerWaypoint('thornwick', 10, 10, true);
    w.registerWaypoint('ford', 50, 50, false);

    expect(w.canFastTravel('thornwick', 'ford')).toBeNull();
    expect(w.unlockWaypoint('ford')).toBe(true);
    const dest = w.canFastTravel('thornwick', 'ford');
    expect(dest?.key).toBe('ford');
  });

  it('spawns deterministic roaming events across identical seeds', () => {
    const a = new WorldEventsDirector(404);
    const b = new WorldEventsDirector(404);
    for (let t = 0; t < 600; t++) {
      a.step(1024, 1024, true);
      b.step(1024, 1024, true);
    }
    expect(a.events.length).toBeGreaterThan(0);
    expect(a.hash()).toBe(b.hash());
  });
});

describe('E7: CompanionController', () => {
  it('handles follow, hold, attack orders and death/resurrect', () => {
    const c = new CompanionController(1, 'warrior', 512, 512, 100, 3);
    const enemies = [{ id: 10, x: 900, y: 512, alive: true }];

    // Follow: enemy within aggro range -> attack_target
    const d1 = c.step(512, 512, enemies);
    expect(d1.action).toBe('attack_target');
    expect(d1.targetId).toBe(10);

    // Hold: enemy far from hold point -> stays at hold
    c.setOrder('hold', 512, 512);
    const farEnemy = [{ id: 11, x: 3000, y: 3000, alive: true }];
    const d2 = c.step(2800, 2800, farEnemy);
    expect(d2.action).toBe('idle');

    // Attack order reaches wider range
    c.setOrder('attack');
    const d3 = c.step(512, 512, [{ id: 12, x: 3000, y: 512, alive: true }]);
    expect(d3.action).toBe('attack_target');

    // Death + resurrect cooldown
    c.damage(100);
    expect(c.state.alive).toBe(false);
    for (let t = 0; t < 250; t++) c.step(512, 512, []);
    expect(c.state.alive).toBe(true);
  });
});

describe('E10/E11/E14: Difficulty Tiers, Hardcore Flag & Skirmish Modes', () => {
  it('defines Wanderer, Veteran, Doomed tiers and hardcore death lock', () => {
    expect(DIFFICULTY_TIERS.map((t) => t.name)).toEqual(['Wanderer', 'Veteran', 'Doomed']);
    const hc = createHardcoreRecord(true);
    expect(recordHeroDeath(hc)).toBe(true);
    expect(hc.fallen).toBe(true);

    const sc = createHardcoreRecord(false);
    expect(recordHeroDeath(sc)).toBe(false);
    expect(sc.fallen).toBe(false);
  });

  it('resolves capture_shrines, survive_waves, and king_of_the_hill modes', () => {
    const cap = new SkirmishModeController('capture_shrines', [{ x: 512, y: 512 }], 20);
    for (let t = 0; t < 40; t++) cap.step([{ team: 0, x: 512, y: 512, alive: true }]);
    expect(cap.state.outcome).toBe('team0_win');

    const waves = new SkirmishModeController('survive_waves', [], 100, 2);
    for (let i = 0; i < 15; i++) waves.onWaveEnemySlain(); // wave 1 (6) + wave 2 (9)
    expect(waves.state.outcome).toBe('team0_win');

    const koth = new SkirmishModeController('king_of_the_hill', [{ x: 1024, y: 1024 }], 15);
    for (let t = 0; t < 30; t++) koth.step([{ team: 1, x: 1024, y: 1024, alive: true }]);
    expect(koth.state.outcome).toBe('team1_win');
  });
});

describe('E15: Deterministic Command-Log Replay Verifier', () => {
  it('verifies identical replay hashes and snapshot/restore invariance', () => {
    type Cmd = { kind: 'shrine'; id: number } | { kind: 'order'; order: 'follow' | 'hold' | 'attack' };

    const createHarness = () => {
      const world = new WorldEventsDirector(777);
      const s1 = world.addShrine('haste', 256, 256);
      world.addShrine('fortune', 768, 256);
      const comp = new CompanionController(1, 'archer', 256, 256);
      const koth = new SkirmishModeController('king_of_the_hill', [{ x: 512, y: 512 }], 100);

      return {
        step(cmds: readonly Cmd[]) {
          for (const c of cmds) {
            if (c.kind === 'shrine') world.activateShrine(c.id || s1.id);
            else comp.setOrder(c.order);
          }
          world.step(512, 512, false);
          comp.step(512, 512, [{ id: 9, x: 700, y: 512, alive: true }]);
          koth.step([{ team: 0, x: 512, y: 512, alive: true }]);
        },
        hash() {
          let h = 0x811c9dc5;
          const mix = (v: number): void => {
            h = Math.imul(h ^ (v & 0xff), 0x01000193);
            h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193);
            h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193);
            h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193);
          };
          world.hashInto(mix);
          comp.hashInto(mix);
          koth.hashInto(mix);
          return h >>> 0;
        },
        snapshot() {
          return {
            world: world.snapshot(),
            comp: comp.snapshot(),
            koth: koth.snapshot(),
          };
        },
        restore(snap: { world: ReturnType<WorldEventsDirector['snapshot']>; comp: ReturnType<CompanionController['snapshot']>; koth: ReturnType<SkirmishModeController['snapshot']> }) {
          world.restore(snap.world);
          comp.restore(snap.comp);
          koth.restore(snap.koth);
        },
      };
    };

    const log = [
      { tick: 5, cmd: { kind: 'shrine' as const, id: 1 } },
      { tick: 20, cmd: { kind: 'order' as const, order: 'attack' as const } },
      { tick: 80, cmd: { kind: 'order' as const, order: 'hold' as const } },
    ];
    const runWith = (h: ReturnType<typeof createHarness>, startTick = 1, endTick = 120) => {
      const hashes: number[] = [];
      for (let t = startTick; t <= endTick; t++) {
        h.step(log.filter((e) => e.tick === t).map((e) => e.cmd));
        hashes.push(h.hash());
      }
      return hashes;
    };
    const a = createHarness();
    const b = createHarness();
    const hashesA = runWith(a);
    const hashesB = runWith(b);
    expect(hashesA).toEqual(hashesB);

    const mid = createHarness();
    runWith(mid, 1, 60);
    const snap = mid.snapshot();
    const restored = createHarness();
    restored.restore(snap);
    const tailHashes = runWith(restored, 61, 120);
    expect(tailHashes).toEqual(hashesA.slice(60));
  });
});
