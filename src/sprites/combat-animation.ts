import type { Sim } from '../sim/sim';
import { SPELLS } from '../sim/spelldata';

export type Clip = 'stand' | 'walk' | 'attack' | 'cast' | 'hurt' | 'die';

export interface AnimationPose {
  clip: Clip;
  frame: number;
  /** Simulation ticks since the selected clip began. */
  age: number;
  finished: boolean;
  /** A recent cooldown edge could be a cast, but its source was not confirmed. */
  unresolved: boolean;
}

const COUNTS: Record<Clip, number> = { stand: 4, walk: 8, attack: 4, cast: 4, hurt: 2, die: 4 };
const TICKS: Record<Clip, number> = { stand: 10, walk: 3, attack: 2, cast: 2, hurt: 3, die: 3 };
const NONE = -1;

/** Presentation only. Observe immediately after EVERY step, before Fx consumers clear
 * the list. Call clearedFx after clearing; call reset after an in-place load.
 * Repeated observations/draws at one tick are inert. No Sim state is written.
 * Net HP loss and id-less/capped Fx cannot reconstruct every semantic event.
 */
export class CombatAnimation {
  private sim!: Sim;
  private hpRef!: Int16Array;
  private cdRef!: Uint8Array;
  private xRef!: Int32Array;
  private yRef!: Int32Array;
  private tick = 0;
  private fxCursor = 0;
  private hp = new Int16Array(0);
  private cd = new Uint8Array(0);
  private x = new Int32Array(0);
  private y = new Int32Array(0);
  private action = new Uint8Array(0); // 1 attack, 2 cast, 3 unresolved
  private edge = new Uint8Array(0); // scratch, reused each observed step
  private actionAt = new Float64Array(0);
  private hurtAt = new Float64Array(0);
  private deathAt = new Float64Array(0);
  private moving = new Uint8Array(0);
  private moveAt = new Float64Array(0);

  constructor(sim: Sim) { this.reset(sim); }

  reset(sim: Sim): void {
    const n = sim.count;
    if (this.hp.length !== n) {
      this.hp = new Int16Array(n); this.cd = new Uint8Array(n);
      this.x = new Int32Array(n); this.y = new Int32Array(n);
      this.action = new Uint8Array(n); this.edge = new Uint8Array(n);
      this.actionAt = new Float64Array(n); this.hurtAt = new Float64Array(n);
      this.deathAt = new Float64Array(n); this.moving = new Uint8Array(n);
      this.moveAt = new Float64Array(n);
    }
    this.sim = sim;
    this.hpRef = sim.cb.hp; this.cdRef = sim.cb.cd;
    this.xRef = sim.x; this.yRef = sim.y;
    this.hp.set(sim.cb.hp); this.cd.set(sim.cb.cd);
    this.x.set(sim.x); this.y.set(sim.y);
    this.moving.set(sim.moving); this.moveAt.fill(sim.tick);
    this.action.fill(0); this.edge.fill(0);
    this.actionAt.fill(NONE); this.hurtAt.fill(NONE); this.deathAt.fill(NONE);
    for (let i = 0; i < n; i++) {
      // Existing corpses start on their terminal frame, rather than dying again.
      if (sim.cb.hp[i] <= 0) this.deathAt[i] = sim.tick - 12;
    }
    this.tick = sim.tick;
    this.fxCursor = sim.cb.fx.length;
  }

  clearedFx(): void { this.fxCursor = 0; }

  observe(sim: Sim): void {
    if (sim !== this.sim || sim.cb.hp !== this.hpRef || sim.cb.cd !== this.cdRef ||
        sim.x !== this.xRef || sim.y !== this.yRef || sim.count !== this.hp.length ||
        sim.tick < this.tick || sim.tick > this.tick + 1) {
      this.reset(sim);
      return;
    }
    if (sim.tick === this.tick) return;
    const cb = sim.cb;
    this.edge.fill(0);
    for (let i = 0; i < sim.count; i++) {
      if (!sim.combat || sim.hidden[i] || this.hp[i] <= 0 || cb.cd[i] <= Math.max(0, this.cd[i] - 1)) continue;
      this.edge[i] = 1;
      // Without fresh confirming Fx, any known spell with this cooldown remains
      // plausible. In particular Mage ordinary attacks collide with Fireball.
      for (let sid = 0; sid < SPELLS.length; sid++) {
        if ((cb.known[i] & (1 << sid)) && cb.cd[i] === SPELLS[sid].cd) {
          this.edge[i] = 3;
          break;
        }
      }
    }
    if (this.fxCursor > cb.fx.length) this.fxCursor = 0;
    for (let f = this.fxCursor; f < cb.fx.length; f++) {
      const fx = cb.fx[f];
      if (fx.type !== 9 || !SPELLS[fx.v]) continue;
      let candidate = -1, count = 0;
      // Do NOT spatially filter before counting: a script teleport followed by
      // separation can make the real source match neither stored position.
      for (let i = 0; i < sim.count; i++) {
        if (!this.edge[i] || !(cb.known[i] & (1 << fx.v)) || cb.cd[i] !== SPELLS[fx.v].cd) continue;
        candidate = i;
        count++;
      }
      if (count !== 1) continue;
      const i = candidate;
      if ((fx.x === this.x[i] && fx.y === this.y[i]) || (fx.x === sim.x[i] && fx.y === sim.y[i])) this.edge[i] = 2;
    }
    for (let i = 0; i < sim.count; i++) {
      if (cb.hp[i] <= 0) {
        if (this.hp[i] > 0) this.deathAt[i] = sim.tick;
        this.action[i] = 0; this.hurtAt[i] = NONE;
      } else if (this.hp[i] <= 0) {
        this.deathAt[i] = NONE; this.hurtAt[i] = NONE; this.action[i] = 0;
        this.moveAt[i] = sim.tick;
      } else {
        if (cb.hp[i] < this.hp[i]) this.hurtAt[i] = sim.tick;
        if (this.edge[i]) { this.action[i] = this.edge[i]; this.actionAt[i] = sim.tick; }
      }
      if (this.moving[i] !== sim.moving[i]) this.moveAt[i] = sim.tick;
    }
    this.hp.set(cb.hp); this.cd.set(cb.cd);
    this.x.set(sim.x); this.y.set(sim.y); this.moving.set(sim.moving);
    this.tick = sim.tick;
    this.fxCursor = cb.fx.length;
  }

  /** Writes only out; never allocates. Dead/expired bodies still request die:
   * rendering must use cb.corp and its existing corpse marker/visibility rules.
   */
  sample(sim: Sim, id: number, out: AnimationPose): void {
    let clip: Clip = sim.moving[id] ? 'walk' : 'stand';
    let age = Math.max(0, sim.tick - this.moveAt[id]);
    const actionAge = sim.tick - this.actionAt[id];
    const unresolved = this.action[id] === 3 && actionAge >= 0 && actionAge < 8;
    if (sim.cb.hp[id] <= 0) {
      clip = 'die'; age = Math.max(0, sim.tick - this.deathAt[id]);
    } else if (this.action[id] > 0 && this.action[id] < 3 && actionAge >= 0 && actionAge < 8) {
      clip = this.action[id] === 2 ? 'cast' : 'attack'; age = actionAge;
    } else if (this.hurtAt[id] !== NONE && sim.tick - this.hurtAt[id] < 6) {
      clip = 'hurt'; age = Math.max(0, sim.tick - this.hurtAt[id]);
    }
    const count = COUNTS[clip], tpf = TICKS[clip];
    out.clip = clip;
    out.age = age;
    out.finished = clip === 'die' && age >= count * tpf;
    out.frame = clip === 'die' ? Math.min(count - 1, Math.floor(age / tpf)) : Math.floor(age / tpf) % count;
    out.unresolved = unresolved;
  }
}
