/**
 * Touch extras: double-tap to select a kind, the radial order menu (opens on a hold over open ground) and the
 * portrait strip (drag a heal or buff from the quick row onto a portrait). The maths is pure and unit-tested;
 * the DOM classes at the bottom only run in the browser.
 */

export const DOUBLE_MS = 350;
export const DOUBLE_PX = 28;

/** Two taps close in time and place on the same unit make a double tap. */
export class DoubleTap {
  private t = -1e9;
  private x = 0;
  private y = 0;
  private id = -1;

  /** Feed every tap that lands on one of your units. True when this tap completes a double tap. */
  hit(now: number, x: number, y: number, id: number): boolean {
    const dbl = id === this.id && now - this.t <= DOUBLE_MS && Math.hypot(x - this.x, y - this.y) <= DOUBLE_PX;
    this.t = dbl ? -1e9 : now;
    this.id = dbl ? -1 : id;
    this.x = x;
    this.y = y;
    return dbl;
  }
}

/** Ids of the player's living units that share `kind`. */
export function unitsOfKind(count: number, kindOf: (i: number) => number, mine: (i: number) => boolean, kind: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) if (mine(i) && kindOf(i) === kind) out.push(i);
  return out;
}

export const RADIAL_ORDERS = ['attack', 'hold', 'retreat', 'guard'] as const;
export type RadialOrder = (typeof RADIAL_ORDERS)[number];
export const RADIAL_BTN = 56; // button size in px, above the 44 px touch minimum
export const RADIAL_R = 74; // distance from the press point to a button centre

/** Button centres around a press at (cx, cy): top, right, bottom, left, nudged inside a view of w x h. */
export function radialCentres(cx: number, cy: number, w: number, h: number): [number, number][] {
  const pad = RADIAL_BTN / 2 + 4;
  const x = Math.min(Math.max(cx, pad + RADIAL_R), Math.max(pad + RADIAL_R, w - pad - RADIAL_R));
  const y = Math.min(Math.max(cy, pad + RADIAL_R), Math.max(pad + RADIAL_R, h - pad - RADIAL_R));
  return [
    [x, y - RADIAL_R],
    [x + RADIAL_R, y],
    [x, y + RADIAL_R],
    [x - RADIAL_R, y],
  ];
}

/** Index of the radial button under (px, py), or -1. */
export function radialPick(centres: readonly [number, number][], px: number, py: number): number {
  const r = RADIAL_BTN / 2;
  return centres.findIndex(([x, y]) => Math.hypot(px - x, py - y) <= r);
}

/** Portrait chips shown at once. */
export const PORTRAITS = 6;

/** The units to show as portraits: the hero first, then the rest in unit order. */
export function portraitIds(ids: readonly number[], hero: number): number[] {
  const rest = ids.filter((i) => i !== hero);
  return (ids.includes(hero) ? [hero, ...rest] : rest).slice(0, PORTRAITS);
}

/** Radial menu: four large buttons around the press point. Tapping one runs it; tapping anywhere else closes it. */
export class RadialMenu {
  private readonly root = document.createElement('div');
  private open = false;

  constructor(host: HTMLElement, private readonly onPick: (o: RadialOrder) => void) {
    this.root.className = 'radial';
    this.root.hidden = true;
    host.append(this.root);
    // A tap outside any button closes the menu.
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (this.open && !(e.target instanceof Element && e.target.closest('.radial'))) this.hide();
      },
      true,
    );
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(cx: number, cy: number, w: number, h: number, labels: Record<RadialOrder, string>): void {
    const at = radialCentres(cx, cy, w, h);
    this.root.replaceChildren();
    RADIAL_ORDERS.forEach((o, n) => {
      const b = document.createElement('button');
      b.textContent = labels[o];
      b.style.left = `${at[n][0] - RADIAL_BTN / 2}px`;
      b.style.top = `${at[n][1] - RADIAL_BTN / 2}px`;
      b.onclick = () => {
        this.hide();
        this.onPick(o);
      };
      this.root.append(b);
    });
    this.root.hidden = false;
    this.open = true;
  }

  hide(): void {
    this.root.hidden = true;
    this.open = false;
  }
}

export interface PortraitInfo {
  id: number;
  label: string;
  hpPct: number;
  hero: boolean;
  selected: boolean;
}

/** Strip of unit portraits. Tap one to select that unit; a spell dragged from the quick row and dropped on one targets it. */
export class PortraitStrip {
  readonly el: HTMLElement;
  private key = '';

  constructor(host: HTMLElement, private readonly onTap: (id: number) => void) {
    this.el = document.createElement('div');
    this.el.className = 'portraits';
    this.el.hidden = true;
    host.append(this.el);
  }

  update(list: readonly PortraitInfo[]): void {
    const key = list.map((p) => `${p.id}:${p.hpPct}:${p.selected ? 1 : 0}`).join(',');
    if (key === this.key) return;
    this.key = key;
    this.el.hidden = list.length === 0;
    this.el.replaceChildren(
      ...list.map((p) => {
        const b = document.createElement('button');
        b.dataset.unit = String(p.id);
        b.classList.toggle('hero', p.hero);
        b.classList.toggle('sel', p.selected);
        const bar = document.createElement('i');
        bar.style.width = `${p.hpPct}%`;
        b.append(p.label, bar);
        b.onclick = () => this.onTap(p.id);
        return b;
      }),
    );
  }

  /** The unit whose portrait lies under a screen point, or -1. */
  unitAt(clientX: number, clientY: number): number {
    const t = document.elementFromPoint(clientX, clientY);
    const b = t instanceof Element ? t.closest<HTMLElement>('.portraits > button') : null;
    return b ? Number(b.dataset.unit) : -1;
  }
}
