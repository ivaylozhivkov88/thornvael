import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/map';
import { Kind, M, MODN, Ord } from '../src/sim/combat';
import { ScriptRuntime } from '../src/sim/script';
import { Sim, type Command } from '../src/sim/sim';
import { SPELLS } from '../src/sim/spelldata';
import { revive } from '../src/sim/spells';
import { CombatAnimation, type AnimationPose } from '../src/sprites/combat-animation';

function arena(kinds: number[] = [Kind.Hero, Kind.Golem], teams: number[] = [0, 1]): Sim {
  const w = 32, h = 24;
  const map: GameMap = { w, h, terrain: new Uint8Array(w * h), height: new Uint8Array(w * h), blocked: new Uint8Array(w * h), light: new Uint8Array(w * h), objects: [] };
  const sim = new Sim(map, 4, teams, { kinds, combat: true, hpMul: 10 });
  kinds.forEach((_, i) => sim.place(i, 5 + i * 3, 5));
  sim.cb.recordFx = true;
  sim.cb.ord.fill(Ord.Still);
  return sim;
}
function pose(a: CombatAnimation, s: Sim, id = 0): AnimationPose {
  const out: AnimationPose = { clip: 'stand', frame: -1, age: -1, finished: false, unresolved: false };
  a.sample(s, id, out);
  return out;
}
function step(s: Sim, a: CombatAnimation, cmds: Command[] = [], n = 1): void {
  for (let i = 0; i < n; i++) { s.step(i ? [] : cmds); a.observe(s); }
}
const attack = (id = 0, target = 1): Command => ({ type: 'order', order: 'attack', ids: [id], target });
const cast = (id = 0): Command => ({ type: 'order', order: 'cast', ids: [id], spell: 1, x: 9.5, y: 5.5 });

describe('CombatAnimation actual Sim', () => {
  it('distinguishes chasing from a strike and does not restart on cooldown countdown or pause', () => {
    const s = arena();
    const a = new CombatAnimation(s);
    step(s, a, [attack()]);
    expect(pose(a, s).clip).toBe('walk');
    let ticks = 0;
    while (!s.cb.cd[0] && ticks++ < 80) step(s, a);
    expect(s.cb.cd[0]).toBeGreaterThan(0);
    expect(pose(a, s)).toMatchObject({ clip: 'attack', age: 0, frame: 0 });
    const out = pose(a, s);
    expect(a.sample(s, 0, out)).toBeUndefined();
    expect(out).toEqual(pose(a, s));
    a.observe(s);
    expect(pose(a, s)).toEqual(out);
    step(s, a, [], 5);
    expect(pose(a, s)).toMatchObject({ clip: 'attack', age: 5, frame: 2 });
    step(s, a, [], 3);
    expect(pose(a, s).clip).toBe('stand');
  });

  it('confirms an unambiguous manual cast and autocast from fresh Fx only', () => {
    for (const auto of [false, true]) {
      const s = arena([Kind.Mage, Kind.Golem]);
      if (auto) { s.step(); s.step(); s.step(); } // autocast scans on tick 4
      const a = new CombatAnimation(s);
      step(s, a, auto ? [{ type: 'autocast', ids: [0], spell: 1 }, { type: 'order', order: 'guard', ids: [0] }] : [cast()]);
      expect(s.cb.fx.some(f => f.type === 9)).toBe(true);
      expect(pose(a, s)).toMatchObject({ clip: 'cast', age: 0, unresolved: false });
      step(s, a, [], 5);
      expect(pose(a, s)).toMatchObject({ clip: 'cast', age: 5, frame: 2 });
      s.cb.fx.length = 0; a.clearedFx();
      step(s, a, [], 3);
      expect(pose(a, s).clip).not.toBe('cast');
    }
  });

  it('does not animate refused casts; missing and saturated Fx remain unresolved', () => {
    const refused = arena([Kind.Mage, Kind.Golem]);
    refused.cb.mana[0] = 0;
    const ar = new CombatAnimation(refused);
    step(refused, ar, [cast()]);
    expect(pose(ar, refused)).toMatchObject({ clip: 'stand', unresolved: false });
    for (const saturated of [false, true]) {
      const s = arena([Kind.Mage, Kind.Golem]);
      if (saturated) for (let i = 0; i < 160; i++) s.cb.emit(0, 0, 0, 0, 0);
      else s.cb.recordFx = false;
      const a = new CombatAnimation(s);
      step(s, a, [cast()]);
      expect(s.cb.cd[0]).toBe(SPELLS[1].cd);
      expect(pose(a, s)).toMatchObject({ clip: 'stand', unresolved: true });
    }
  });

  it('CR01: retains an unmatched teleported caster alongside a coordinate-matching ordinary attacker', () => {
    const s = arena([Kind.Mage, Kind.Mage, Kind.Golem], [0, 0, 1]);
    s.place(0, 3, 5); s.place(1, 7, 5); s.place(2, 10, 5);
    s.attachScript(new ScriptRuntime({ triggers: [{ id: 'teleport', once: true, enabled: true, conds: [], acts: [{ k: 'teleport', a: [0, 7, 5] }] }], groups: {}, vip: [], home: [], dormant: [], buildings: [] }));
    const oldX = s.x[0], oldY = s.y[0], matchX = s.x[1], matchY = s.y[1];
    const a = new CombatAnimation(s);
    step(s, a, [cast(), attack(1, 2)]);
    const fx = s.cb.fx.find(f => f.type === 9)!;
    expect(fx).toMatchObject({ x: matchX, y: matchY });
    expect(fx.x === oldX && fx.y === oldY).toBe(false);
    expect(fx.x === s.x[0] && fx.y === s.y[0]).toBe(false);
    expect(Array.from(s.cb.cd).slice(0, 2)).toEqual([40, 40]);
    for (const id of [0, 1]) {
      expect(pose(a, s, id).unresolved).toBe(true);
      expect(['cast', 'attack']).not.toContain(pose(a, s, id).clip);
    }
  });

  it('does not guess between overlapping casters, even with two fresh cast events', () => {
    const s = arena([Kind.Mage, Kind.Mage, Kind.Golem], [0, 0, 1]);
    s.place(1, 5, 5);
    const a = new CombatAnimation(s);
    step(s, a, [cast(0), cast(1)]);
    expect(s.cb.fx.filter(f => f.type === 9)).toHaveLength(2);
    for (const i of [0, 1]) expect(pose(a, s, i)).toMatchObject({ clip: 'stand', unresolved: true });
  });

  it('observes a real melee miss as a strike and ignores blocked/out-of-range orders', () => {
    const s = arena([Kind.Warrior, Kind.Golem]);
    s.place(1, 5.7, 5);
    s.cb.mod[M.Acc] = -100;
    const a = new CombatAnimation(s);
    step(s, a, [attack()]);
    expect(s.cb.fx.some(f => f.type === 1)).toBe(true);
    expect(pose(a, s).clip).toBe('attack');
    const blocked = arena();
    for (let y = 0; y < blocked.map.h; y++) blocked.map.blocked[y * blocked.map.w + 7] = 1;
    const ab = new CombatAnimation(blocked);
    for (let i = 0; i < 45; i++) {
      step(blocked, ab, i ? [] : [attack()]);
      expect(pose(ab, blocked).clip).not.toBe('attack');
    }
  });

  it('tracks net damage, prioritizes death, clamps until corpse expiry and clears on revival', () => {
    const s = arena([Kind.Warrior, Kind.Golem]);
    s.place(1, 5.7, 5);
    s.cb.mod[M.Acc] = 100;
    const a = new CombatAnimation(s);
    step(s, a, [attack()]);
    expect(pose(a, s, 1)).toMatchObject({ clip: 'hurt', age: 0, frame: 0 });
    step(s, a, [], 3);
    expect(pose(a, s, 1)).toMatchObject({ clip: 'hurt', age: 3, frame: 1 });
    step(s, a, [], 3);
    expect(pose(a, s, 1).clip).toBe('stand');
    // Arrange a real lethal strike, not a manufactured presentation event.
    s.cb.hp[1] = 1;
    while (s.cb.hp[1] > 0) step(s, a);
    expect(s.cb.hp[1]).toBe(0);
    expect(pose(a, s, 1)).toMatchObject({ clip: 'die', age: 0, frame: 0, finished: false });
    step(s, a, [], 9);
    expect(pose(a, s, 1)).toMatchObject({ clip: 'die', age: 9, frame: 3, finished: false });
    step(s, a, [], 3);
    expect(pose(a, s, 1)).toMatchObject({ clip: 'die', frame: 3, finished: true });
    const existing = new CombatAnimation(s);
    expect(pose(existing, s, 1)).toMatchObject({ clip: 'die', frame: 3, finished: true });
    step(s, a, [], s.cb.corp[1]);
    expect(s.cb.corp[1]).toBe(0);
    expect(pose(a, s, 1)).toMatchObject({ clip: 'die', frame: 3, finished: true });
    revive(s, 1); s.cb.ord.fill(Ord.Still);
    step(s, a);
    expect(pose(a, s, 1)).toMatchObject({ clip: 'stand', unresolved: false });
  });

  it('gives an action priority over simultaneous hurt, and ages culled units without sampling', () => {
    const s = arena([Kind.Warrior, Kind.Warrior]);
    s.place(1, 5.7, 5);
    s.cb.mod[M.Acc] = 100; s.cb.mod[MODN + M.Acc] = 100;
    const a = new CombatAnimation(s);
    step(s, a, [attack(), attack(1, 0)]);
    expect(s.cb.hp[0]).toBeLessThan(s.cb.hpMax[0]);
    expect(pose(a, s)).toMatchObject({ clip: 'attack', age: 0 });
    step(s, a, [], 7);
    expect(pose(a, s, 1)).toMatchObject({ clip: 'attack', age: 7, frame: 3 });
    step(s, a);
    expect(pose(a, s, 1).clip).toBe('stand');
    s.hidden[0] = 1;
    step(s, a);
    expect(pose(a, s).clip).toBe('stand'); // frozen cooldown is not a new strike
  });

  it('reseeds after same-tick restore, rewind, missed steps, explicit reset and Sim replacement', () => {
    const s = arena([Kind.Warrior, Kind.Golem]); s.place(1, 5.7, 5);
    const initial = s.snapshot();
    const a = new CombatAnimation(s);
    step(s, a, [attack()]);
    expect(pose(a, s).clip).toBe('attack');
    const snap = s.snapshot();
    s.restore(snap); a.observe(s);
    expect(pose(a, s).clip).toBe('stand');
    s.restore(initial); a.observe(s);
    step(s, a, [attack()]);
    expect(pose(a, s).clip).toBe('attack');
    s.step(); s.step(); a.observe(s);
    expect(pose(a, s).clip).toBe('stand');
    a.reset(s);
    expect(pose(a, s).age).toBe(0);
    const other = arena();
    a.observe(other);
    expect(pose(a, other)).toMatchObject({ clip: 'stand', age: 0 });
  });

  it('loops locomotion at the specified cadence and writes the caller-owned pose', () => {
    const s = arena(); const a = new CombatAnimation(s);
    const out = pose(a, s);
    step(s, a, [], 10); a.sample(s, 0, out);
    expect(out).toMatchObject({ clip: 'stand', age: 10, frame: 1, finished: false });
    step(s, a, [{ type: 'move', ids: [0], x: 25, y: 5 }]);
    expect(pose(a, s)).toMatchObject({ clip: 'walk', age: 0, frame: 0 });
    step(s, a, [], 3);
    expect(pose(a, s)).toMatchObject({ clip: 'walk', age: 3, frame: 1 });
    step(s, a, [], 21);
    expect(pose(a, s)).toMatchObject({ clip: 'walk', age: 24, frame: 0 });
  });

  it('leaves hashes, snapshots, log and Fx untouched, including restore continuation', () => {
    const s = arena(), control = arena();
    const a = new CombatAnimation(s);
    for (let i = 0; i < 75; i++) {
      const commands = i === 0 ? [cast()] : i === 42 ? [attack()] : [];
      s.step(commands); control.step(commands);
      const before = s.snapshot(), fx = s.cb.fx.slice(), log = s.log.slice(), hash = s.hash();
      a.observe(s); pose(a, s); pose(a, s, 1);
      expect(s.hash()).toBe(hash);
      expect(s.hash()).toBe(control.hash());
      expect(s.snapshot()).toEqual(before);
      expect(s.cb.fx).toEqual(fx);
      expect(s.log).toEqual(log);
      if (i === 30) { s.restore(s.snapshot()); control.restore(control.snapshot()); a.reset(s); }
      if (i % 5 === 0) { s.cb.fx.length = 0; control.cb.fx.length = 0; a.clearedFx(); }
    }
  });
});
