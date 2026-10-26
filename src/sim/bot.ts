import { isBlockedAt, type GameMap } from '../map';
import { Kind } from './combat';
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

interface Pack {
  ids: number[];
  x: number; // post in tiles
  y: number;
  hunting: boolean;
  calm: number;
}

/**
 * Monster packs. Packs think every 10 ticks and act only through the shared order commands:
 * a pack guards its post; when a member engages an intruder the whole pack attack-moves on it;
 * after four calm seconds, or when it strays 22 tiles, it guards its post again.
 */
export class MonsterAi {
  constructor(private readonly packs: Pack[]) {}

  commands(sim: Sim): Command[] {
    const out: Command[] = [];
    if (sim.tick % 10 !== 3) return out;
    const cb = sim.cb;
    for (const p of this.packs) {
      const alive = p.ids.filter((id) => cb.hp[id] > 0);
      if (alive.length === 0) continue;
      const engaged = alive.find((id) => cb.tgt[id] >= 0 && cb.hp[cb.tgt[id]] > 0);
      if (!p.hunting) {
        if (engaged === undefined) continue;
        const t = cb.tgt[engaged];
        p.hunting = true;
        p.calm = 0;
        out.push({ type: 'order', order: 'attack', ids: alive, x: sim.x[t] / FP, y: sim.y[t] / FP });
        continue;
      }
      p.calm = engaged === undefined ? p.calm + 10 : 0;
      let cx = 0;
      let cy = 0;
      for (const id of alive) {
        cx += sim.x[id];
        cy += sim.y[id];
      }
      const far = Math.hypot(cx / alive.length / FP - p.x, cy / alive.length / FP - p.y) > 22;
      if (p.calm >= 100 || far) {
        p.hunting = false;
        out.push({ type: 'order', order: 'guard', ids: alive, x: p.x, y: p.y });
      }
    }
    return out;
  }
}

export interface Scenario {
  teams: number[];
  kinds: number[];
  /** Start tile per unit. */
  tiles: [number, number][];
  packs: Pack[];
}

/** Nearest open tile (spiral) to (x, y) that no earlier unit took. */
function freeTile(map: GameMap, taken: Set<number>, x: number, y: number): [number, number] {
  for (let r = 0; r < 30; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const px = x + dx;
        const py = y + dy;
        if (isBlockedAt(map, px, py) || taken.has(py * map.w + px)) continue;
        taken.add(py * map.w + px);
        return [px, py];
      }
    }
  }
  return [x, y];
}

/** The test fight: a hero's squad of 12 in the start meadow against five monster packs. */
export function fightScenario(map: GameMap): Scenario {
  const sc: Scenario = { teams: [], kinds: [], tiles: [], packs: [] };
  const taken = new Set<number>();
  const add = (team: number, kind: number, x: number, y: number): number => {
    sc.teams.push(team);
    sc.kinds.push(kind);
    sc.tiles.push(freeTile(map, taken, x, y));
    return sc.teams.length - 1;
  };
  const mine = [Kind.Hero, Kind.Warrior, Kind.Warrior, Kind.Warrior, Kind.Warrior, Kind.Warrior, Kind.Archer, Kind.Archer, Kind.Archer, Kind.Archer, Kind.Mage, Kind.Mage];
  mine.forEach((k, n) => add(0, k, 6 + (n % 4), map.h - 8 + Math.floor(n / 4)));
  const pack = (x: number, y: number, kinds: number[]): void => {
    const ids = kinds.map((k, n) => add(1, k, x + (n % 3), y + Math.floor(n / 3)));
    const [px, py] = sc.tiles[ids[0]]; // the post is a tile the pack really stands on
    sc.packs.push({ ids, x: px + 0.5, y: py + 0.5, hunting: false, calm: 0 });
  };
  pack(24, map.h - 14, [Kind.Gnoll, Kind.Gnoll, Kind.Gnoll]);
  pack(34, 30, [Kind.Gnoll, Kind.Gnoll, Kind.Imp]);
  pack(28, 10, [Kind.Imp, Kind.Imp, Kind.Gnoll]);
  pack(46, 14, [Kind.Golem, Kind.Imp, Kind.Imp]);
  pack(56, 36, [Kind.Gnoll, Kind.Gnoll, Kind.Gnoll, Kind.Archer]);
  return sc;
}

/** 150 against 150 in the open, for the combat frame-rate benchmark. Both sides get a swarm order. */
export function battleScenario(map: GameMap): Scenario {
  const sc: Scenario = { teams: [], kinds: [], tiles: [], packs: [] };
  const taken = new Set<number>();
  const mix = [Kind.Warrior, Kind.Warrior, Kind.Archer, Kind.Gnoll, Kind.Gnoll, Kind.Imp];
  for (let i = 0; i < 300; i++) {
    const team = i < 150 ? 0 : 1;
    const n = i % 150;
    const kind = team === 0 ? [Kind.Warrior, Kind.Warrior, Kind.Archer, Kind.Mage][n % 4] : mix[n % mix.length];
    const col = n % 15;
    const row = Math.floor(n / 15);
    const cx = team === 0 ? 5 + col : 32 + col;
    sc.teams.push(team);
    sc.kinds.push(kind);
    sc.tiles.push(freeTile(map, taken, cx, map.h - 12 + row));
  }
  return sc;
}

export function placeScenario(sim: Sim, sc: Scenario): void {
  sc.tiles.forEach(([x, y], i) => sim.place(i, x, y));
}

/** Pack `count` units shoulder to shoulder into the start meadow (0.55 tile apart) for crowd tests. */
export function setupCrowd(sim: Sim, count: number): void {
  for (let i = 0; i < count; i++) {
    const x = 2.3 + (i % 21) * 0.55;
    const y = sim.map.h - 11.7 + Math.floor(i / 21) * 0.55;
    sim.x[i] = sim.tx[i] = Math.round(x * FP);
    sim.y[i] = sim.ty[i] = Math.round(y * FP);
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
