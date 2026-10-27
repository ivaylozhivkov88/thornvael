import type { GameMap } from './map';
import { Elem, type HitRec } from './sim/combat';
import { PART_NAMES } from './sim/items';
import { FP, type Sim } from './sim/sim';
import { S } from './strings';

/** F3 panel: the tile under the pointer, the selected unit's path and the newest hits with every number. */

const TERRAIN = ['grass', 'dirt', 'water', 'rock', 'marsh'];
const ELEM = ['physical', 'fire', 'water', 'air', 'earth', 'astral'];
const LINES = 14;

function who(sim: Sim, i: number): string {
  return i < 0 ? 'spell' : `#${i} ${S.kinds[sim.cb.kind[i]]}`;
}

export function hitLine(sim: Sim, h: HitRec): string {
  const head = `${h.tick} ${who(sim, h.src)} > ${who(sim, h.t)}`;
  if (h.elem !== Elem.Physical) return `${head} ${ELEM[h.elem]} ${h.raw}-${h.cut}=${h.dmg}`;
  const where = `${PART_NAMES[h.part]} ${h.chance}% roll ${h.roll}`;
  return h.dmg < 0 ? `${head} ${where} miss` : `${head} ${where} ${h.raw}-${h.cut}=${h.dmg}`;
}

export class DebugPanel {
  on = false;
  private readonly el: HTMLPreElement;
  private last = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.id = 'f3';
    this.el.hidden = true;
    parent.append(this.el);
  }

  toggle(sim: Sim): boolean {
    this.on = !this.on;
    this.el.hidden = !this.on;
    sim.cb.log = this.on ? (sim.cb.log ?? []) : null;
    return this.on;
  }

  /** Refresh about five times a second; `tile` is the pointer position in tiles, or null. */
  update(sim: Sim, map: GameMap, tile: [number, number] | null, sel: readonly number[], now: number): void {
    if (!this.on || now - this.last < 200) return;
    this.last = now;
    sim.cb.log ??= []; // a new game made a new sim
    const out: string[] = ['F3 debug'];
    if (tile) {
      const [x, y] = [Math.floor(tile[0]), Math.floor(tile[1])];
      if (x >= 0 && y >= 0 && x < map.w && y < map.h) {
        const i = y * map.w + x;
        out.push(`tile ${x},${y} height ${map.height[i]} ${TERRAIN[map.terrain[i]] ?? map.terrain[i]}${map.blocked[i] ? ' BLOCKED' : ''} light ${map.light[i]}`);
      }
    }
    for (const i of sel.slice(0, 3)) {
      const pts = sim.pathOf(i);
      const left = pts ? pts.length / 2 - sim.wp[i] : 0;
      out.push(`#${i} at ${(sim.x[i] / FP).toFixed(1)},${(sim.y[i] / FP).toFixed(1)} goal ${(sim.tx[i] / FP).toFixed(1)},${(sim.ty[i] / FP).toFixed(1)} ${sim.moving[i] ? `path ${left} waypoints, stuck ${sim.stuck[i]}` : 'idle'}`);
    }
    out.push('-- hits: tick attacker > target part chance roll raw-cut=taken');
    const log = sim.cb.log;
    for (let k = Math.max(0, log.length - LINES); k < log.length; k++) out.push(hitLine(sim, log[k]));
    this.el.textContent = out.join('\n');
  }
}
