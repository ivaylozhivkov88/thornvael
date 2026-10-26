/** Pure gesture recogniser: raw pointer events in, game intents out. No DOM access, so it is unit-tested. */
export type Intent =
  | { type: 'click'; x: number; y: number; additive: boolean } // mouse left click: select or clear
  | { type: 'tap'; x: number; y: number; additive: boolean } // touch tap: select a unit, else move the selection
  | { type: 'move-to'; x: number; y: number } // mouse right click
  | { type: 'box-preview'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'box'; x0: number; y0: number; x1: number; y1: number; additive: boolean }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; dir: 1 | -1; x: number; y: number };

export interface GestureOptions {
  boxMode: () => boolean; // touch: one-finger drag draws a select box instead of panning
  additive: () => boolean; // touch: the Add toggle
}

const TOUCH_SLOP = 10;
const MOUSE_SLOP = 4;
const PINCH_STEP = 1.3;

interface P {
  x0: number;
  y0: number;
  x: number;
  y: number;
  touch: boolean;
  button: number;
  shift: boolean;
  dragging: boolean;
}

export class GestureRecognizer {
  private readonly ptr = new Map<number, P>();
  private pinchBase = 0;
  private pinched = false;

  constructor(private readonly opt: GestureOptions) {}

  down(id: number, x: number, y: number, touch: boolean, button = 0, shift = false): Intent[] {
    this.ptr.set(id, { x0: x, y0: y, x, y, touch, button, shift, dragging: false });
    if (!touch && button === 2) return [{ type: 'move-to', x, y }];
    if (touch && this.ptr.size === 2) {
      this.pinchBase = this.dist();
      this.pinched = true;
      return this.endDrag();
    }
    return [];
  }

  move(id: number, x: number, y: number): Intent[] {
    const p = this.ptr.get(id);
    if (!p) return [];
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    if (p.touch && this.ptr.size >= 2) return this.pinch();
    if (this.pinched || (!p.touch && p.button !== 0)) return [];
    const slop = p.touch ? TOUCH_SLOP : MOUSE_SLOP;
    if (!p.dragging && Math.hypot(x - p.x0, y - p.y0) < slop) return [];
    p.dragging = true;
    if (!p.touch || this.opt.boxMode()) return [{ type: 'box-preview', x0: p.x0, y0: p.y0, x1: x, y1: y }];
    return [{ type: 'pan', dx, dy }];
  }

  up(id: number): Intent[] {
    const p = this.ptr.get(id);
    this.ptr.delete(id);
    if (this.ptr.size === 0) {
      const wasPinch = this.pinched;
      this.pinched = false;
      if (!p || wasPinch) return [];
    }
    if (!p || this.pinched || (!p.touch && p.button !== 0)) return [];
    if (p.dragging) {
      if (p.touch && !this.opt.boxMode()) return [];
      return [
        { type: 'box-preview', x0: 0, y0: 0, x1: 0, y1: 0 },
        { type: 'box', x0: p.x0, y0: p.y0, x1: p.x, y1: p.y, additive: p.touch ? this.opt.additive() : p.shift },
      ];
    }
    return p.touch
      ? [{ type: 'tap', x: p.x, y: p.y, additive: this.opt.additive() }]
      : [{ type: 'click', x: p.x, y: p.y, additive: p.shift }];
  }

  cancel(): void {
    this.ptr.clear();
    this.pinched = false;
  }

  wheel(dy: number, x: number, y: number): Intent[] {
    return dy === 0 ? [] : [{ type: 'zoom', dir: dy < 0 ? 1 : -1, x, y }];
  }

  private dist(): number {
    const [a, b] = [...this.ptr.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private mid(): { x: number; y: number } {
    const [a, b] = [...this.ptr.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private pinch(): Intent[] {
    if (this.ptr.size !== 2 || this.pinchBase === 0) return [];
    const r = this.dist() / this.pinchBase;
    const m = this.mid();
    if (r >= PINCH_STEP) {
      this.pinchBase = this.dist();
      return [{ type: 'zoom', dir: 1, ...m }];
    }
    if (r <= 1 / PINCH_STEP) {
      this.pinchBase = this.dist();
      return [{ type: 'zoom', dir: -1, ...m }];
    }
    return [];
  }

  private endDrag(): Intent[] {
    return [{ type: 'box-preview', x0: 0, y0: 0, x1: 0, y1: 0 }];
  }
}

/** Unit ids whose screen position is inside the box. `pos` gives screen coordinates for unit i. */
export function unitsInBox(
  count: number,
  pos: (i: number) => [number, number] | null,
  b: { x0: number; y0: number; x1: number; y1: number },
): number[] {
  const lx = Math.min(b.x0, b.x1);
  const hx = Math.max(b.x0, b.x1);
  const ly = Math.min(b.y0, b.y1);
  const hy = Math.max(b.y0, b.y1);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const p = pos(i);
    if (p && p[0] >= lx && p[0] <= hx && p[1] >= ly && p[1] <= hy) out.push(i);
  }
  return out;
}

/** Nearest unit within `radius` screen pixels of (x, y), or -1. Radius is at least 22 px so the touch target is 44 px. */
export function pickUnit(
  count: number,
  pos: (i: number) => [number, number] | null,
  x: number,
  y: number,
  radius: number,
): number {
  const r2 = radius * radius;
  let best = -1;
  let bd = r2;
  for (let i = 0; i < count; i++) {
    const p = pos(i);
    if (!p) continue;
    const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
    if (d <= bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
