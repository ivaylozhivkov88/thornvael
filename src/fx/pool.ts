/**
 * Zero-allocation pre-allocated object pool with strict cap enforcement
 * and FIFO oldest-eviction for mobile performance.
 */

export interface PoolSlot<T> {
  active: boolean;
  seq: number;
  data: T;
}

export class FxPool<T> {
  private readonly slots: PoolSlot<T>[];
  private readonly freeIndices: Int32Array;
  private freeTop: number;
  private cap: number;
  private activeCountInternal = 0;
  private seqCounter = 0;
  private readonly resetFn: (item: T) => void;

  constructor(
    maxCapacity: number,
    factory: () => T,
    reset: (item: T) => void,
    initialCap: number = maxCapacity,
  ) {
    const cap = Math.max(1, Math.floor(maxCapacity));
    this.slots = new Array<PoolSlot<T>>(cap);
    this.freeIndices = new Int32Array(cap);
    this.resetFn = reset;

    for (let i = 0; i < cap; i++) {
      this.slots[i] = { active: false, seq: 0, data: factory() };
      // Push in reverse so index 0 is popped first
      this.freeIndices[i] = cap - 1 - i;
    }
    this.freeTop = cap;
    this.cap = Math.max(0, Math.min(cap, Math.floor(initialCap)));
  }

  get maxCapacity(): number {
    return this.slots.length;
  }

  get capLimit(): number {
    return this.cap;
  }

  get activeCount(): number {
    return this.activeCountInternal;
  }

  /**
   * Dynamically adjust the active cap (e.g. switching between 'high' and 'low' quality).
   * If currently active items exceed the new cap, oldest active items are evicted.
   */
  setCap(newCap: number): void {
    const clamped = Math.max(0, Math.min(this.slots.length, Math.floor(newCap)));
    this.cap = clamped;
    while (this.activeCountInternal > this.cap) {
      const oldestIdx = this.findOldestActiveIndex();
      if (oldestIdx < 0) break;
      this.releaseIndex(oldestIdx);
    }
  }

  /**
   * Acquire an item from the pool with zero heap allocation.
   * If at capLimit, evicts the oldest active item (FIFO) and reuses its slot.
   * Returns null only if capLimit is 0.
   */
  acquire(): T | null {
    if (this.cap <= 0) return null;

    if (this.activeCountInternal >= this.cap) {
      const oldestIdx = this.findOldestActiveIndex();
      if (oldestIdx < 0) return null;
      const slot = this.slots[oldestIdx];
      this.resetFn(slot.data);
      slot.seq = ++this.seqCounter;
      slot.active = true;
      return slot.data;
    }

    if (this.freeTop <= 0) {
      const oldestIdx = this.findOldestActiveIndex();
      if (oldestIdx < 0) return null;
      const slot = this.slots[oldestIdx];
      this.resetFn(slot.data);
      slot.seq = ++this.seqCounter;
      slot.active = true;
      return slot.data;
    }

    const idx = this.freeIndices[--this.freeTop];
    const slot = this.slots[idx];
    this.resetFn(slot.data);
    slot.active = true;
    slot.seq = ++this.seqCounter;
    this.activeCountInternal++;
    return slot.data;
  }

  /** Release a specific slot by index. */
  releaseIndex(idx: number): void {
    if (idx < 0 || idx >= this.slots.length) return;
    const slot = this.slots[idx];
    if (!slot.active) return;
    slot.active = false;
    slot.seq = 0;
    this.freeIndices[this.freeTop++] = idx;
    this.activeCountInternal--;
  }

  /** Release a specific item reference if it belongs to this pool. */
  releaseItem(item: T): boolean {
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i].active && this.slots[i].data === item) {
        this.releaseIndex(i);
        return true;
      }
    }
    return false;
  }

  /** Iterate active items; return false from visitor to release that item. */
  updateEach(visitor: (item: T) => boolean): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot.active) continue;
      if (!visitor(slot.data)) {
        this.releaseIndex(i);
      }
    }
  }

  /** Read-only iteration over active items. */
  forEachActive(visitor: (item: T) => void): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.active) visitor(slot.data);
    }
  }

  /** Release all active items. */
  clear(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.active) {
        slot.active = false;
        slot.seq = 0;
        this.freeIndices[this.freeTop++] = i;
      }
    }
    this.activeCountInternal = 0;
  }

  private findOldestActiveIndex(): number {
    let oldestIdx = -1;
    let oldestSeq = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.active && slot.seq < oldestSeq) {
        oldestSeq = slot.seq;
        oldestIdx = i;
      }
    }
    return oldestIdx;
  }
}
