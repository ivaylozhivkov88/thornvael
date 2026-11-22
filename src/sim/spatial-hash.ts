import { FP } from './path';

/**
 * Allocation-free flat uniform spatial hash grid backed strictly by Int32Array typed arrays.
 * Preserves ascending unit ID ordering within every cell for 100% deterministic simulation.
 */
export class FlatSpatialHash {
  readonly cellStart: Int32Array;
  readonly cellEnd: Int32Array;
  readonly cellItems: Int32Array;
  readonly unitCell: Int32Array;
  readonly occupied: Int32Array;
  readonly rowCount: Int32Array;
  occupiedN = 0;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly capacity: number,
  ) {
    const cells = w * h + 1;
    this.cellStart = new Int32Array(cells);
    this.cellEnd = new Int32Array(cells);
    this.cellItems = new Int32Array(capacity);
    this.unitCell = new Int32Array(capacity);
    this.occupied = new Int32Array(capacity);
    this.rowCount = new Int32Array(h);
  }

  /** Compute clamped grid cell index for fixed-point coordinate (fx, fy). */
  cellIndex(fx: number, fy: number): number {
    const w = this.w;
    const h = this.h;
    let gx = fx >> 8;
    let gy = fy >> 8;
    if (gx < 0) gx = 0;
    else if (gx >= w) gx = w - 1;
    if (gy < 0) gy = 0;
    else if (gy >= h) gy = h - 1;
    return gy * w + gx;
  }

  /**
   * Sparse counting-sort rebuild over living non-hidden units: O(occupied + count).
   * Caches unitCell[i] so the scatter pass skips redundant coordinate division.
   */
  rebuild(count: number, x: Int32Array, y: Int32Array, hp: Int16Array, hidden: Uint8Array): void {
    const cs = this.cellStart;
    const ce = this.cellEnd;
    const occ = this.occupied;
    for (let k = 0; k < this.occupiedN; k++) {
      const c = occ[k];
      cs[c] = 0;
      ce[c] = 0;
    }

    const w = this.w;
    const h = this.h;
    const maxX = w - 1;
    const maxY = h - 1;
    const uCell = this.unitCell;
    const rc = this.rowCount;
    rc.fill(0);
    let m = 0;

    for (let i = 0; i < count; i++) {
      if (hp[i] <= 0 || hidden[i]) {
        uCell[i] = -1;
        continue;
      }
      let gx = Math.floor(x[i] / FP);
      let gy = Math.floor(y[i] / FP);
      if (gx < 0) gx = 0;
      else if (gx > maxX) gx = maxX;
      if (gy < 0) gy = 0;
      else if (gy > maxY) gy = maxY;
      const c = gy * w + gx;
      uCell[i] = c;
      rc[gy]++;
      if (ce[c]++ === 0) occ[m++] = c;
    }

    this.occupiedN = m;
    let run = 0;
    for (let k = 0; k < m; k++) {
      const c = occ[k];
      const n = ce[c];
      cs[c] = run;
      ce[c] = run;
      run += n;
    }

    const items = this.cellItems;
    for (let i = 0; i < count; i++) {
      const c = uCell[i];
      if (c >= 0) items[ce[c]++] = i;
    }
  }
}
