import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({
  registerSW: () => () => undefined,
}));

import { isReducedMotionActive, setAtmosphereReducedMotion } from '../src/atmosphere';
import { newCharacter } from '../src/characters';
import { createFxConfig } from '../src/fx/config';
import { CameraPolishSystem } from '../src/fx/camera-polish';
import { DynamicLightingSystem } from '../src/fx/dynamic-lighting';
import { generateMap, Terrain, TILE } from '../src/map';
import { Sim } from '../src/sim/sim';
import { Kind } from '../src/sim/combat';
import { LightingPass } from '../src/render/lighting-pass';
import {
  MAX_ZOOM as CTRL_MAX_ZOOM,
  MIN_ZOOM as CTRL_MIN_ZOOM,
  RenderCameraController,
} from '../src/render/camera-controller';
import * as RenderModule from '../src/render';
import * as ShellModule from '../src/shell';
import { ModalManager } from '../src/shell/modals';
import { formatCharacterClass, renderHeroSelectView } from '../src/shell/hero-select-view';
import {
  bindAudioSlider,
  bindQualityControl,
  bindReducedMotionToggle,
  getAudioBusVolume,
  renderSettingsView,
  setAudioBusVolume,
} from '../src/shell/settings-binder';

class FakeElement {
  tagName: string;
  id = '';
  className = '';
  textContent = '';
  type = '';
  value = '';
  min = '';
  max = '';
  disabled = false;
  hidden = false;
  tabIndex = -1;
  isConnected = true;
  children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  attrs: Record<string, string> = {};
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  onclick: ((ev?: unknown) => void) | null = null;
  ondblclick: ((ev?: unknown) => void) | null = null;
  onkeydown: ((ev: unknown) => void) | null = null;
  private listeners = new Map<string, Set<(ev: unknown) => void>>();

  classList = {
    add: (...cls: string[]) => {
      const set = new Set(this.className.split(/\s+/).filter(Boolean));
      for (const c of cls) set.add(c);
      this.className = [...set].join(' ');
    },
    remove: (...cls: string[]) => {
      const drop = new Set(cls);
      this.className = this.className
        .split(/\s+/)
        .filter((c) => c && !drop.has(c))
        .join(' ');
    },
  };

  constructor(
    tag = 'div',
    private readonly ownerDoc?: { activeElement: FakeElement | null },
  ) {
    this.tagName = tag.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  focus(): void {
    if (this.ownerDoc) this.ownerDoc.activeElement = this;
  }

  click(): void {
    this.onclick?.({ target: this });
  }

  append(...nodes: Array<FakeElement | string>): void {
    for (const n of nodes) {
      if (typeof n === 'string') {
        const textNode = new FakeElement('#text', this.ownerDoc);
        textNode.textContent = n;
        textNode.parentNode = this;
        this.children.push(textNode);
      } else {
        n.parentNode = this;
        this.children.push(n);
      }
    }
  }

  replaceChildren(...nodes: Array<FakeElement | string>): void {
    for (const c of this.children) c.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }

  replaceWith(...nodes: Array<FakeElement | string>): void {
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx < 0) return;
    const mapped = nodes.map((n) => {
      if (typeof n === 'string') {
        const t = new FakeElement('#text', this.ownerDoc);
        t.textContent = n;
        t.parentNode = this.parentNode;
        return t;
      }
      n.parentNode = this.parentNode;
      return n;
    });
    this.parentNode.children.splice(idx, 1, ...mapped);
    this.parentNode = null;
  }

  remove(): void {
    this.isConnected = false;
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx >= 0) this.parentNode.children.splice(idx, 1);
    this.parentNode = null;
  }

  contains(target: FakeElement | null): boolean {
    if (!target) return false;
    if (target === this) return true;
    return this.children.some((c) => c.contains(target));
  }

  addEventListener(type: string, fn: (ev: unknown) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }

  removeEventListener(type: string, fn: (ev: unknown) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  dispatch(type: string, ev: Record<string, unknown> = {}): void {
    for (const fn of this.listeners.get(type) ?? []) {
      fn({ target: this, preventDefault: () => undefined, stopPropagation: () => undefined, ...ev });
    }
  }

  querySelectorAll(): FakeElement[] {
    const out: FakeElement[] = [];
    const walk = (node: FakeElement): void => {
      for (const c of node.children) {
        if (!c.disabled && !c.hidden && (c.tagName === 'BUTTON' || c.tagName === 'INPUT' || c.tabIndex >= 0)) {
          out.push(c);
        }
        walk(c);
      }
    };
    walk(this);
    return out;
  }
}

describe('Architectural Decomposition: shell & render subsystems', () => {
  const origDoc = (globalThis as Record<string, unknown>).document;
  const origWin = (globalThis as Record<string, unknown>).window;
  let winListeners: Map<string, Set<(ev: unknown) => void>>;
  let fakeDoc: {
    activeElement: FakeElement | null;
    head: FakeElement;
    documentElement: FakeElement;
    createElement: (tag: string) => FakeElement;
    getElementById: (id: string) => FakeElement | null;
  };

  const installFakeDom = (): void => {
    winListeners = new Map();
    fakeDoc = {
      activeElement: null,
      head: new FakeElement('head'),
      documentElement: new FakeElement('html'),
      createElement: (tag: string) => new FakeElement(tag, fakeDoc),
      getElementById: (id: string) => fakeDoc.head.children.find((c) => c.id === id) ?? null,
    };
    (globalThis as Record<string, unknown>).document = fakeDoc;
    (globalThis as Record<string, unknown>).window = {
      innerWidth: 800,
      innerHeight: 600,
      addEventListener: (type: string, fn: (ev: unknown) => void) => {
        let set = winListeners.get(type);
        if (!set) {
          set = new Set();
          winListeners.set(type, set);
        }
        set.add(fn);
      },
      removeEventListener: (type: string, fn: (ev: unknown) => void) => {
        winListeners.get(type)?.delete(fn);
      },
      confirm: () => true,
    };
  };

  beforeEach(() => {
    setAtmosphereReducedMotion(false);
  });

  afterEach(() => {
    setAtmosphereReducedMotion(null);
    if (origDoc === undefined) delete (globalThis as Record<string, unknown>).document;
    else (globalThis as Record<string, unknown>).document = origDoc;
    if (origWin === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = origWin;
  });

  it('preserves backward-compatible public exports on src/shell.ts and src/render.ts', () => {
    expect(typeof ShellModule.runShell).toBe('function');
    expect(typeof ShellModule.buildHeroCreationScreen).toBe('function');
    expect(typeof ShellModule.findArchetypeIndex).toBe('function');
    expect(Array.isArray(ShellModule.ARCHETYPES)).toBe(true);

    expect(typeof RenderModule.Renderer).toBe('function');
    expect(typeof RenderModule.getHeroWeaponVisual).toBe('function');
    expect(typeof RenderModule.classifyHeroWeapon).toBe('function');
    expect(typeof RenderModule.getHeroArmorVisualTier).toBe('function');
    expect(RenderModule.MIN_ZOOM).toBe(CTRL_MIN_ZOOM);
    expect(RenderModule.MAX_ZOOM).toBe(CTRL_MAX_ZOOM);
    expect(RenderModule.QUALITY_NAMES).toEqual(['Low', 'Medium', 'High']);
    expect(RenderModule.FAMILY_VISUALS['hollow-knight']).toBeDefined();
    expect(RenderModule.STATUS_COLORS.length).toBeGreaterThan(0);
  });

  it('ModalManager handles stacked dialogs, ESC top-only dismissal, focus trapping, and focus restoration', () => {
    installFakeDom();
    const root = new FakeElement('div', fakeDoc);
    const triggerBtn = new FakeElement('button', fakeDoc);
    root.append(triggerBtn);
    triggerBtn.focus();

    const manager = new ModalManager();
    const onClose1 = vi.fn();
    const firstModal = manager.open({
      root: root as unknown as HTMLElement,
      ariaLabel: 'First Dialog',
      closeOnBackdrop: true,
      onClose: onClose1,
    });
    const b1 = new FakeElement('button', fakeDoc);
    const b2 = new FakeElement('button', fakeDoc);
    (firstModal.box as unknown as FakeElement).append(b1, b2);
    firstModal.focusFirst();

    expect(firstModal.box.getAttribute('role')).toBe('dialog');
    expect(firstModal.box.getAttribute('aria-modal')).toBe('true');
    expect(fakeDoc.activeElement).toBe(b1);

    // Tab wraps from last button back to first button
    b2.focus();
    for (const fn of winListeners.get('keydown') ?? []) {
      fn({ key: 'Tab', shiftKey: false, preventDefault: () => undefined, stopPropagation: () => undefined });
    }
    expect(fakeDoc.activeElement).toBe(b1);

    // Shift+Tab wraps from first button back to last button
    for (const fn of winListeners.get('keydown') ?? []) {
      fn({ key: 'Tab', shiftKey: true, preventDefault: () => undefined, stopPropagation: () => undefined });
    }
    expect(fakeDoc.activeElement).toBe(b2);

    // Open stacked second modal; ESC closes only the topmost modal
    const secondModal = manager.open({
      root: root as unknown as HTMLElement,
      ariaLabel: 'Second Dialog',
    });
    expect(manager.activeCount).toBe(2);

    for (const fn of [...(winListeners.get('keydown') ?? [])]) {
      fn({ key: 'Escape', preventDefault: () => undefined, stopPropagation: () => undefined });
    }
    expect(secondModal.isOpen()).toBe(false);
    expect(firstModal.isOpen()).toBe(true);
    expect(manager.activeCount).toBe(1);

    // Backdrop click closes first modal and restores focus to triggerBtn
    (firstModal.overlay as unknown as FakeElement).dispatch('click', { target: firstModal.overlay });
    expect(firstModal.isOpen()).toBe(false);
    expect(manager.activeCount).toBe(0);
    expect(onClose1).toHaveBeenCalledTimes(1);
    expect(fakeDoc.activeElement).toBe(triggerBtn);
    expect(winListeners.get('keydown')?.size ?? 0).toBe(0);
  });

  it('settings-binder controls audio buses, quality cycling, reducedMotion state, and cleanup', () => {
    installFakeDom();
    const prevMaster = getAudioBusVolume('master');
    const slider = new FakeElement('input', fakeDoc);
    const label = new FakeElement('span', fakeDoc);

    const unbindSlider = bindAudioSlider(
      slider as unknown as HTMLInputElement,
      'master',
      label as unknown as HTMLElement,
    );
    expect(slider.value).toBe(String(Math.round(prevMaster * 100)));
    slider.value = '45';
    slider.dispatch('input');
    expect(getAudioBusVolume('master')).toBeCloseTo(0.45, 2);
    expect(label.textContent).toBe('45%');
    unbindSlider();
    slider.value = '90';
    slider.dispatch('input');
    expect(getAudioBusVolume('master')).toBeCloseTo(0.45, 2);
    setAudioBusVolume('master', prevMaster);

    const prefs = { sound: true, music: false, quality: 1, weather: true };
    const qBtn = new FakeElement('button', fakeDoc);
    const unbindQ = bindQualityControl(qBtn as unknown as HTMLButtonElement, prefs);
    expect(qBtn.textContent).toBe('Quality: Medium');
    qBtn.click();
    expect(prefs.quality).toBe(2);
    expect(qBtn.textContent).toBe('Quality: High');
    unbindQ();
    expect(qBtn.onclick).toBeNull();

    const rmBtn = new FakeElement('button', fakeDoc);
    const unbindRm = bindReducedMotionToggle(rmBtn as unknown as HTMLButtonElement);
    expect(rmBtn.getAttribute('aria-pressed')).toBe('false');
    rmBtn.click();
    expect(isReducedMotionActive()).toBe(true);
    expect(rmBtn.getAttribute('aria-pressed')).toBe('true');
    expect(fakeDoc.documentElement.dataset.reducedMotion).toBe('true');
    unbindRm();

    const settingsView = renderSettingsView({
      onBack: () => undefined,
      onEraseCampaign: () => undefined,
    });
    expect(settingsView.element.className).toBe('sh-settings-shell');
    settingsView.dispose();
  });

  it('hero-select-view renders character classes and selection cleanly', () => {
    installFakeDom();
    const warrior = newCharacter('Dain', 0, false, 1);
    const onSelect = vi.fn();
    const view = renderHeroSelectView({
      characters: [warrior],
      activeCharacter: warrior,
      onSelect,
      onDelete: () => undefined,
      onCreateNew: () => undefined,
      onExit: () => undefined,
    });
    expect(formatCharacterClass(warrior)).toBe('Male Warrior');
    const okBtn = (view as unknown as FakeElement)
      .querySelectorAll()
      .find((el) => el.tagName === 'BUTTON' && el.textContent === 'OK');
    expect(okBtn).toBeDefined();
    okBtn!.click();
    expect(onSelect).toHaveBeenCalledWith(warrior);
  });

  it('RenderCameraController solves bounds, focal zoom, follow damping, and edge scrolling', () => {
    const map = { w: 64, h: 64 };
    const viewport = { w: 800, h: 600 };
    const cam = new RenderCameraController({
      getMap: () => map,
      getViewport: () => viewport,
    });
    const polish = new CameraPolishSystem(createFxConfig({ reducedMotion: false }));

    cam.centerOn(32, 32);
    expect(cam.camX).toBe(32 * TILE - 400);
    expect(cam.camY).toBe(32 * TILE - 300);

    // Zoom around screen anchor preserves underlying world point
    const [wxBefore, wyBefore] = cam.toTile(350, 220);
    expect(cam.zoomBy(1, 350, 220, polish)).toBe(true);
    const [wxAfter, wyAfter] = cam.toTile(350, 220);
    expect(wxAfter).toBeCloseTo(wxBefore, 1);
    expect(wyAfter).toBeCloseTo(wyBefore, 1);

    // Smooth follow moves progressively toward target, and snaps under reducedMotion
    cam.zoom = 1;
    cam.centerOn(16, 16);
    const startX = cam.camX;
    const settled = cam.stepFollow(24, 24, 50, polish);
    expect(settled).toBe(false);
    expect(cam.camX).toBeGreaterThan(startX);

    polish.setConfig(createFxConfig({ reducedMotion: true }));
    expect(cam.stepFollow(24, 24, 16, polish)).toBe(true);
    expect(cam.camX).toBe(24 * TILE - 400);

    // Edge scroll only triggers when reducedMotion is false and pointer sits inside margin
    polish.setConfig(createFxConfig({ reducedMotion: false }));
    const beforeEdge = cam.camX;
    expect(cam.stepEdgeScroll(2, 300, 100, polish)).toBe(true);
    expect(cam.camX).toBeLessThan(beforeEdge);
    expect(cam.stepEdgeScroll(-10, 300, 100, polish)).toBe(false);
  });

  it('LightingPass gathers hero/shrine/town/lava lights and renders ambient daylight fallback', () => {
    const pass = new LightingPass();
    const layers = pass.initStageLayers(null);
    // In Node without document, initStageLayers returns the fallback Graphics layer.
    expect(layers).toEqual([pass.light]);

    pass.syncQuality(0, false);
    expect(pass.light.visible).toBe(false);
    pass.syncQuality(2, true);
    expect(pass.light.visible).toBe(true);

    const map = generateMap(7);
    map.terrain[4 * map.w + 4] = Terrain.Water;
    const sim = new Sim(map, 7, [0], { kinds: [Kind.Hero], combat: true });
    sim.place(0, 10, 10);
    sim.explored.fill(1);
    sim.shrines = [
      { x: 12, y: 12, kind: 'healing' },
      { x: 14, y: 14, kind: 'mana' },
    ];
    sim.shrineCd = new Uint16Array([0, 20]); // only shrine 0 ready
    sim.towns = [{ centre: [[20, 20], [22, 20], [24, 20]], radius: 6 } as unknown as NonNullable<Sim['towns']>[number]];

    const dl = new DynamicLightingSystem(createFxConfig({ quality: 'high', reducedMotion: false }));
    pass.gatherDynamicLights(dl, sim, map, 'caldera', { x0: 0, y0: 0, x1: 20, y1: 20 });

    const resolved = dl.resolveVisibleLights(0, 0, 1, 800, 600);
    expect(resolved.some((l) => l.kind === 'hero')).toBe(true);
    expect(resolved.some((l) => l.kind === 'shrine')).toBe(true);
    expect(resolved.some((l) => l.kind === 'torch')).toBe(true);
    expect(resolved.some((l) => l.kind === 'lava')).toBe(true);

    const clearSpy = vi.spyOn(pass.light, 'clear');
    pass.renderAmbientFallback(120, 800, 600);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    pass.renderAmbientFallback(120, 800, 600);
    expect(clearSpy).toHaveBeenCalledTimes(1); // memoized key avoids duplicate redraw
  });
});
