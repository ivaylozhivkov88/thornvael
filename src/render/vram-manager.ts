/**
 * PixiJS v8 LRU VRAM Manager.
 * Tracks estimated GPU TextureSource byte footprints, protects pinned/active sheets,
 * and deterministically evicts least-recently-used unpinned textures under a strict byte budget.
 */

export interface VramEntryInput {
  key: string;
  bytes: number;
  pinned?: boolean;
  onEvict: () => void;
}

export interface VramStats {
  usedBytes: number;
  pinnedBytes: number;
  evictableBytes: number;
  budgetBytes: number;
  entryCount: number;
  evictions: number;
}

interface InternalVramEntry {
  key: string;
  bytes: number;
  pinned: boolean;
  onEvict: () => void;
}

const MB = 1024 * 1024;
export const DEFAULT_MOBILE_VRAM_BUDGET = 160 * MB;
export const DEFAULT_DESKTOP_VRAM_BUDGET = 220 * MB;

/** Estimate RGBA GPU footprint (with optional mipmap multiplier, default 1 for pixel/nearest sheets). */
export function estimateTextureBytes(width: number, height: number, bytesPerPixel = 4): number {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  return Math.max(1, w * h * bytesPerPixel);
}

/** Pick conservative VRAM budget for mobile/low-memory browsers vs desktop. */
export function defaultVramBudgetBytes(): number {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  const mem = nav?.deviceMemory;
  if (typeof mem === 'number' && mem > 0 && mem <= 4) return DEFAULT_MOBILE_VRAM_BUDGET;
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (coarse) return DEFAULT_MOBILE_VRAM_BUDGET;
  return DEFAULT_DESKTOP_VRAM_BUDGET;
}

export class LruVramManager {
  // JS Map preserves insertion order: oldest (LRU) is first, newest (MRU) is last.
  private readonly entries = new Map<string, InternalVramEntry>();
  private usedBytes = 0;
  private pinnedBytes = 0;
  private evictions = 0;

  constructor(readonly budgetBytes: number = defaultVramBudgetBytes()) {}

  has(key: string): boolean {
    return this.entries.has(key);
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }

  stats(): VramStats {
    return {
      usedBytes: this.usedBytes,
      pinnedBytes: this.pinnedBytes,
      evictableBytes: Math.max(0, this.usedBytes - this.pinnedBytes),
      budgetBytes: this.budgetBytes,
      entryCount: this.entries.size,
      evictions: this.evictions,
    };
  }

  /** Register (or update) a GPU allocation and enforce the VRAM budget via LRU eviction. */
  register(input: VramEntryInput, canEvict?: (key: string) => boolean): number {
    const prev = this.entries.get(input.key);
    if (prev) {
      this.usedBytes -= prev.bytes;
      if (prev.pinned) this.pinnedBytes -= prev.bytes;
      this.entries.delete(input.key);
    }
    const bytes = Math.max(1, Math.round(input.bytes));
    const pinned = Boolean(input.pinned);
    this.entries.set(input.key, {
      key: input.key,
      bytes,
      pinned,
      onEvict: input.onEvict,
    });
    this.usedBytes += bytes;
    if (pinned) this.pinnedBytes += bytes;
    return this.evictToBudget(canEvict);
  }

  /** Promote an existing resource to most-recently-used in O(1). */
  touch(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return true;
  }

  setPinned(key: string, pinned: boolean, canEvict?: (key: string) => boolean): number {
    const entry = this.entries.get(key);
    if (!entry || entry.pinned === pinned) return 0;
    entry.pinned = pinned;
    if (pinned) {
      this.pinnedBytes += entry.bytes;
      return 0;
    }
    this.pinnedBytes = Math.max(0, this.pinnedBytes - entry.bytes);
    return this.evictToBudget(canEvict);
  }

  /** Remove an entry manually without necessarily counting it as an LRU budget eviction. */
  release(key: string, invokeEvict = false): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.usedBytes = Math.max(0, this.usedBytes - entry.bytes);
    if (entry.pinned) this.pinnedBytes = Math.max(0, this.pinnedBytes - entry.bytes);
    if (invokeEvict) entry.onEvict();
    return true;
  }

  /** Evict oldest unpinned & unlocked entries until usedBytes <= budgetBytes. */
  evictToBudget(canEvict?: (key: string) => boolean): number {
    if (this.usedBytes <= this.budgetBytes) return 0;
    let evicted = 0;
    for (const [key, entry] of [...this.entries.entries()]) {
      if (this.usedBytes <= this.budgetBytes) break;
      if (entry.pinned) continue;
      if (canEvict && !canEvict(key)) continue;
      this.entries.delete(key);
      this.usedBytes = Math.max(0, this.usedBytes - entry.bytes);
      this.evictions++;
      evicted++;
      entry.onEvict();
    }
    return evicted;
  }

  clear(invokeEvict = false): void {
    if (invokeEvict) {
      for (const entry of this.entries.values()) {
        entry.onEvict();
      }
    }
    this.entries.clear();
    this.usedBytes = 0;
    this.pinnedBytes = 0;
  }
}
