/** Browser-independent install lifecycle. The adapter owns events, UI and instructions. */
export interface InstallPrompt {
  preventDefault(): void;
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function isInstallPrompt(value: unknown): value is InstallPrompt {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<InstallPrompt>;
  return typeof event.preventDefault === 'function' && typeof event.prompt === 'function'
    && typeof event.userChoice?.then === 'function';
}

export function createInstallController(deps: {
  standalone(): boolean;
  render(state: { hidden: boolean; disabled: boolean }): void;
  instructions(): void;
}) {
  let deferred: InstallPrompt | null = null;
  let installed = false;
  let busy = false;
  const consumed = new WeakSet<InstallPrompt>();
  const hidden = () => installed || deps.standalone();
  const refresh = () => {
    if (hidden()) deferred = null;
    deps.render({ hidden: hidden(), disabled: busy });
  };
  refresh();
  return {
    refresh,
    defer(event: InstallPrompt) {
      if (hidden() || consumed.has(event)) return;
      event.preventDefault();
      deferred = event;
      refresh();
    },
    installed() {
      installed = true;
      refresh();
    },
    async activate(): Promise<void> {
      if (hidden() || busy) return;
      const event = deferred;
      if (!event) {
        deps.instructions();
        return;
      }
      deferred = null;
      consumed.add(event);
      busy = true;
      refresh();
      // Attach a rejection handler before prompt(), which can also throw synchronously.
      const choice = Promise.resolve(event.userChoice).catch(() => null);
      try {
        // Must run in the original click gesture, before any await.
        await event.prompt();
        if (!(await choice) && !hidden()) deps.instructions();
        // An accepted choice is not evidence of completed installation: wait for
        // appinstalled or an installed display mode before hiding the button.
      } catch {
        if (!hidden()) deps.instructions();
      } finally {
        busy = false;
        refresh();
      }
    },
  };
}
