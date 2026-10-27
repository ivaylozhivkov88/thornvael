import { registerSW } from 'virtual:pwa-register';

/**
 * Safe update gate. A new worker waits (sw.ts never calls skipWaiting by itself); this module only remembers that one is waiting.
 * Only the main menu and the global map show the banner. A running mission ignores it. Applying sends SKIP_WAITING and reloads.
 * No separate autosave step is needed: missions autosave every 60 s and on hide, and the menu and map hold no unsaved game state.
 */
let waiting = false;
let apply: (() => void) | null = null;
const listeners = new Set<() => void>();

export function registerWorker(): void {
  if (apply) return;
  const update = registerSW({
    onNeedRefresh: () => {
      waiting = true;
      listeners.forEach((f) => f());
    },
    onOfflineReady: () => {},
  });
  apply = () => void update(true);
}

export const updateWaiting = (): boolean => waiting;
export const applyUpdate = (): void => apply?.();
export function onUpdateWaiting(f: () => void): void {
  listeners.add(f);
}
