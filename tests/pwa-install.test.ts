import { describe, expect, it, vi } from 'vitest';
import { createInstallController, isInstallPrompt, type InstallPrompt } from '../src/pwa-install';

function harness(standalone = false) {
  let mode = standalone;
  const render = vi.fn();
  const instructions = vi.fn();
  const controller = createInstallController({ standalone: () => mode, render, instructions });
  return { controller, render, instructions, mode: (value: boolean) => { mode = value; controller.refresh(); } };
}
function prompt(outcome: 'accepted' | 'dismissed' = 'dismissed'): InstallPrompt {
  return { preventDefault: vi.fn(), prompt: vi.fn(async () => undefined), userChoice: Promise.resolve({ outcome }) };
}

describe('PWA install lifecycle without DOM', () => {
  it('offers instructions without assuming a browser supports installation', async () => {
    const h = harness();
    await h.controller.activate();
    expect(h.instructions).toHaveBeenCalledOnce();
    expect(h.render).toHaveBeenLastCalledWith({ hidden: false, disabled: false });
    expect(isInstallPrompt({ preventDefault() {} })).toBe(false);
    expect(isInstallPrompt(prompt())).toBe(true);
  });

  it.each(['accepted', 'dismissed'] as const)('consumes a %s event once; only a fresh event retries', async (outcome) => {
    const h = harness();
    const event = prompt(outcome);
    h.controller.defer(event);
    const pending = h.controller.activate();
    expect(event.prompt).toHaveBeenCalledOnce(); // synchronous user gesture
    expect(h.render).toHaveBeenLastCalledWith({ hidden: false, disabled: true });
    await h.controller.activate();
    await pending;
    expect(h.render).toHaveBeenLastCalledWith({ hidden: false, disabled: false });
    h.controller.defer(event); // a redispatched consumed object cannot be reused
    await h.controller.activate();
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(h.instructions).toHaveBeenCalledOnce();
    const fresh = prompt();
    h.controller.defer(fresh);
    await h.controller.activate();
    expect(fresh.prompt).toHaveBeenCalledOnce();
  });

  it('keeps the button busy until userChoice settles even when prompt resolves first', async () => {
    const h = harness();
    let choose!: (value: { outcome: 'dismissed' }) => void;
    const event = prompt();
    event.userChoice = new Promise((resolve) => { choose = resolve; });
    h.controller.defer(event);
    const pending = h.controller.activate();
    await Promise.resolve();
    await h.controller.activate();
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(h.render).toHaveBeenLastCalledWith({ hidden: false, disabled: true });
    choose({ outcome: 'dismissed' });
    await pending;
    expect(h.render).toHaveBeenLastCalledWith({ hidden: false, disabled: false });
  });

  it.each(['throw', 'reject', 'choice-reject'] as const)('recovers from %s without reusing the failed event', async (failure) => {
    const h = harness();
    const event = prompt();
    if (failure === 'throw') event.prompt = vi.fn(() => { throw new Error('blocked'); });
    if (failure === 'reject') event.prompt = vi.fn(async () => { throw new Error('blocked'); });
    if (failure === 'choice-reject') event.userChoice = Promise.reject(new Error('choice unavailable'));
    h.controller.defer(event);
    await h.controller.activate();
    expect(h.instructions).toHaveBeenCalledOnce();
    expect(h.render).toHaveBeenLastCalledWith({ hidden: false, disabled: false });
    await h.controller.activate();
    expect(event.prompt).toHaveBeenCalledOnce();
    const fresh = prompt();
    h.controller.defer(fresh);
    await h.controller.activate();
    expect(fresh.prompt).toHaveBeenCalledOnce();
  });

  it('appinstalled during a pending prompt stays hidden after its completion', async () => {
    const h = harness();
    let resolve!: () => void;
    const event = prompt();
    event.prompt = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    h.controller.defer(event);
    const pending = h.controller.activate();
    h.controller.installed();
    resolve();
    await pending;
    h.mode(false);
    await h.controller.activate();
    expect(h.render).toHaveBeenLastCalledWith({ hidden: true, disabled: false });
    expect(h.instructions).not.toHaveBeenCalled();
  });

  it('refreshes standalone at boot and on mode changes, discarding stale prompts', async () => {
    const h = harness(true);
    expect(h.render).toHaveBeenLastCalledWith({ hidden: true, disabled: false });
    const ignored = prompt();
    h.controller.defer(ignored);
    await h.controller.activate();
    expect(ignored.preventDefault).not.toHaveBeenCalled();
    h.mode(false);
    const event = prompt();
    h.controller.defer(event);
    h.mode(true);
    h.mode(false);
    await h.controller.activate();
    expect(event.prompt).not.toHaveBeenCalled();
    expect(h.instructions).toHaveBeenCalledOnce();
  });

  it('retains a fresh browser event arriving while an older choice is pending', async () => {
    const h = harness();
    const first = prompt();
    let resolve!: () => void;
    first.prompt = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    h.controller.defer(first);
    const pending = h.controller.activate();
    const fresh = prompt();
    h.controller.defer(fresh);
    resolve();
    await pending;
    await h.controller.activate();
    expect(fresh.prompt).toHaveBeenCalledOnce();
  });
});
