import { FP, type Command, type Sim } from './sim';
import { Rng } from './rng';

/**
 * Scripted squads. Commands come out of the same `Command` vocabulary the player uses;
 * the bot has its own PRNG (not part of sim state) because replays use the log, not the bot.
 */
export class Bot {
  private readonly rng: Rng;
  constructor(
    private readonly team: number,
    private readonly squadSize: number,
    seed: number,
  ) {
    this.rng = new Rng(seed);
  }

  commands(sim: Sim): Command[] {
    const ids: number[] = [];
    for (let i = 0; i < sim.count; i++) if (sim.team[i] === this.team) ids.push(i);
    const squads = Math.ceil(ids.length / this.squadSize);
    const out: Command[] = [];
    // Each squad re-targets every 5 seconds, staggered across squads.
    for (let s = 0; s < squads; s++) {
      if ((sim.tick + s * 7) % 125 !== 1) continue;
      const members = ids.slice(s * this.squadSize, (s + 1) * this.squadSize);
      const here = members.find((id) => sim.moving[id] === 0) ?? members[0];
      const cx = sim.x[here] / FP;
      const cy = sim.y[here] / FP;
      const x = Math.max(1, Math.min(sim.map.w - 2, cx + this.rng.int(21) - 10));
      const y = Math.max(1, Math.min(sim.map.h - 2, cy + this.rng.int(21) - 10));
      out.push({ type: 'move', ids: members, x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 });
    }
    return out;
  }
}

/** Place units: team 0 in the start meadow and the rest spread over open ground. */
export function setupSquads(sim: Sim): void {
  let b = 0;
  for (let i = 0; i < sim.count; i++) {
    if (sim.team[i] === 0) {
      const k = i;
      sim.place(i, 4 + (k % 6), sim.map.h - 10 + Math.floor(k / 6));
    } else {
      // walk the map in a scan and take free tiles
      for (;;) {
        const x = 16 + ((b * 7) % (sim.map.w - 18));
        const y = 2 + ((b * 13) % (sim.map.h - 4));
        b++;
        if (!sim.map.blocked[y * sim.map.w + x]) {
          sim.place(i, x, y);
          break;
        }
      }
    }
  }
}
