import { isBlockedAt, type GameMap } from '../map';
import { Rng } from './rng';

export const TICKS_PER_SECOND = 25;
export const FP = 256; // fixed point: 1 tile = 256 units
export const UNIT_SPEED = Math.round((3.2 * FP) / TICKS_PER_SECOND); // 3.2 tiles per second

export type Command = { type: 'move'; ids: number[]; x: number; y: number }; // x, y in tiles (may be fractional)
export interface LoggedCommand {
  tick: number;
  cmd: Command;
}

export interface Snapshot {
  tick: number;
  rng: number;
  x: Int32Array;
  y: Int32Array;
  tx: Int32Array;
  ty: Int32Array;
  moving: Uint8Array;
}

/** Deterministic world state. No DOM, no renderer, no Math.random, no float state. */
export class Sim {
  tick = 0;
  readonly rng: Rng;
  readonly count: number;
  readonly team: Uint8Array;
  x: Int32Array;
  y: Int32Array;
  tx: Int32Array;
  ty: Int32Array;
  moving: Uint8Array;
  readonly log: LoggedCommand[] = [];

  constructor(
    readonly map: GameMap,
    seed: number,
    teams: number[],
  ) {
    this.rng = new Rng(seed);
    this.count = teams.length;
    this.team = Uint8Array.from(teams);
    this.x = new Int32Array(this.count);
    this.y = new Int32Array(this.count);
    this.tx = new Int32Array(this.count);
    this.ty = new Int32Array(this.count);
    this.moving = new Uint8Array(this.count);
  }

  /** Place unit `id` at a tile centre. Only for setup before the first tick. */
  place(id: number, tileX: number, tileY: number): void {
    this.x[id] = this.tx[id] = Math.round((tileX + 0.5) * FP);
    this.y[id] = this.ty[id] = Math.round((tileY + 0.5) * FP);
  }

  /** Advance one tick. Commands are applied first, in order, and appended to the log. */
  step(cmds: readonly Command[] = []): void {
    this.tick++;
    for (const cmd of cmds) {
      this.log.push({ tick: this.tick, cmd });
      this.apply(cmd);
    }
    for (let i = 0; i < this.count; i++) if (this.moving[i]) this.move(i);
  }

  private apply(cmd: Command): void {
    const n = cmd.ids.length;
    const cols = Math.ceil(Math.sqrt(n));
    for (let k = 0; k < n; k++) {
      const id = cmd.ids[k];
      if (id < 0 || id >= this.count) continue;
      // Spread targets on a 1-tile grid centred on the click; fall back to the click itself.
      const ox = (k % cols) - (cols - 1) / 2;
      const oy = Math.floor(k / cols) - (Math.ceil(n / cols) - 1) / 2;
      let gx = cmd.x + ox;
      let gy = cmd.y + oy;
      if (isBlockedAt(this.map, Math.floor(gx), Math.floor(gy))) {
        gx = cmd.x;
        gy = cmd.y;
      }
      if (isBlockedAt(this.map, Math.floor(gx), Math.floor(gy))) continue;
      this.tx[id] = Math.round(gx * FP);
      this.ty[id] = Math.round(gy * FP);
      this.moving[id] = 1;
    }
  }

  private move(i: number): void {
    const dx = this.tx[i] - this.x[i];
    const dy = this.ty[i] - this.y[i];
    const d2 = dx * dx + dy * dy;
    if (d2 <= UNIT_SPEED * UNIT_SPEED) {
      if (!this.blockedAt(this.tx[i], this.ty[i])) {
        this.x[i] = this.tx[i];
        this.y[i] = this.ty[i];
      }
      this.moving[i] = 0;
      return;
    }
    const d = Math.sqrt(d2);
    const sx = Math.round((dx * UNIT_SPEED) / d);
    const sy = Math.round((dy * UNIT_SPEED) / d);
    const nx = this.x[i] + sx;
    const ny = this.y[i] + sy;
    if (!this.blockedAt(nx, ny)) {
      this.x[i] = nx;
      this.y[i] = ny;
    } else if (!this.blockedAt(nx, this.y[i])) {
      this.x[i] = nx;
    } else if (!this.blockedAt(this.x[i], ny)) {
      this.y[i] = ny;
    } else {
      this.moving[i] = 0; // wedged against an obstacle; real pathing arrives in Phase 3
    }
  }

  private blockedAt(fx: number, fy: number): boolean {
    return isBlockedAt(this.map, Math.floor(fx / FP), Math.floor(fy / FP));
  }

  /** FNV-1a over tick, rng state and every per-unit array. */
  hash(): number {
    let h = 0x811c9dc5;
    const mix = (v: number): void => {
      h = Math.imul(h ^ (v & 0xff), 0x01000193);
      h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193);
      h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193);
      h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193);
    };
    mix(this.tick);
    mix(this.rng.state);
    for (let i = 0; i < this.count; i++) {
      mix(this.x[i]);
      mix(this.y[i]);
      mix(this.tx[i]);
      mix(this.ty[i]);
      mix(this.moving[i]);
    }
    return h >>> 0;
  }

  snapshot(): Snapshot {
    return {
      tick: this.tick,
      rng: this.rng.state,
      x: this.x.slice(),
      y: this.y.slice(),
      tx: this.tx.slice(),
      ty: this.ty.slice(),
      moving: this.moving.slice(),
    };
  }

  restore(s: Snapshot): void {
    this.tick = s.tick;
    this.rng.state = s.rng;
    this.x = s.x.slice();
    this.y = s.y.slice();
    this.tx = s.tx.slice();
    this.ty = s.ty.slice();
    this.moving = s.moving.slice();
  }
}

/** Replay a command log on a fresh sim for `ticks` ticks. */
export function replay(sim: Sim, log: readonly LoggedCommand[], ticks: number): void {
  let k = 0;
  for (let t = 1; t <= ticks; t++) {
    const cmds: Command[] = [];
    while (k < log.length && log[k].tick === t) cmds.push(log[k++].cmd);
    sim.step(cmds);
  }
}
