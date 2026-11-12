import { ITEMS, getItemDef, DYNAMIC_ITEM_OFFSET } from './sim/items';
import type { Sim } from './sim/sim';

/**
 * Holy Grail Codex system for Thornvael, inspired by Diablo II Resurrected.
 * Persistently tracks every unique base and artifact item discovered by the player
 * across campaigns, skirmishes, and procedural expeditions.
 */

export const CODEX_STORAGE_KEY = 'thornvael_codex_v1';

const memoryDiscovered = new Set<number>();
const listeners = new Set<(itemId: number) => void>();

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Load the set of discovered item IDs from persistent storage or in-memory fallback. */
export function loadDiscovered(): Set<number> {
  const store = getStorage();
  if (!store) return new Set(memoryDiscovered);
  try {
    const raw = store.getItem(CODEX_STORAGE_KEY);
    if (!raw) return new Set(memoryDiscovered);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      parsed.forEach((id) => {
        if (typeof id === 'number' && id >= 0) memoryDiscovered.add(id);
      });
    }
  } catch {
    // Malformed JSON fallback
  }
  return new Set(memoryDiscovered);
}

/** Save the set of discovered item IDs to persistent storage. */
export function saveDiscovered(set: Set<number>): void {
  const arr = [...set].filter((id) => id >= 0);
  const store = getStorage();
  if (store) {
    try {
      store.setItem(CODEX_STORAGE_KEY, JSON.stringify(arr));
    } catch {
      // Storage quota or security error
    }
  }
}

/** Register a discovery listener (e.g. for toasts or HUD animations). */
export function onDiscovery(fn: (itemId: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Record an item discovery. Returns true if the item was newly discovered.
 */
export function discoverItem(itemId: number, sim?: Sim): boolean {
  if (typeof itemId !== 'number' || itemId < 0) return false;
  let targetId = itemId;
  if (targetId >= DYNAMIC_ITEM_OFFSET) {
    const inst = sim ? sim.instances.get(targetId) : undefined;
    if (inst) {
      targetId = inst.baseId;
    } else {
      const def = getItemDef(targetId);
      if (def) {
        const baseIndex = ITEMS.findIndex((b) => b.slot === def.slot && b.tier === def.tier);
        targetId = baseIndex >= 0 ? baseIndex : -1;
      } else {
        targetId = -1;
      }
    }
  }
  if (targetId < 0 || targetId >= ITEMS.length) return false;
  loadDiscovered();
  if (memoryDiscovered.has(targetId)) return false;

  memoryDiscovered.add(targetId);
  saveDiscovered(memoryDiscovered);

  for (const fn of listeners) {
    try {
      fn(targetId);
    } catch {
      // Ignore listener error
    }
  }
  return true;
}

/** Check whether a specific item has been discovered. */
export function isDiscovered(itemId: number): boolean {
  loadDiscovered();
  return memoryDiscovered.has(itemId);
}

/** Calculate overall Holy Grail completion progress. */
export function getCodexProgress(): { discovered: number; total: number; pct: number } {
  loadDiscovered();
  const total = ITEMS.length;
  const discovered = [...memoryDiscovered].filter((id) => id < total).length;
  const pct = total > 0 ? Math.round((discovered / total) * 100) : 0;
  return { discovered, total, pct };
}

/** Clear all discoveries (useful for tests and hard resets). */
export function resetCodex(): void {
  memoryDiscovered.clear();
  const store = getStorage();
  if (store) {
    try {
      store.removeItem(CODEX_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}
