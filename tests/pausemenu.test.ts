import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PauseMenu, type PauseMenuCtx } from '../src/pausemenu';
import { SPELLS } from '../src/sim/spelldata';

// Minimal DOM mock for Node Vitest environment
class MockElement {
  private _id = '';
  get id() {
    return this._id;
  }
  set id(v: string) {
    this._id = v;
    mockElements[v] = this;
  }
  className = '';
  hidden = false;
  textContent = '';
  innerHTML = '';
  value = '100';
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  dataset: Record<string, string> = {};
  title = '';
  onclick: ((e?: unknown) => void) | null = null;
  oninput: ((e?: unknown) => void) | null = null;
  listeners: Record<string, Array<(e: unknown) => void>> = {};

  style: Record<string, string> = {
    borderLeftColor: '',
  };

  classList = {
    add: (...cls: string[]) => {
      const parts = new Set(this.className.split(' ').filter(Boolean));
      cls.forEach((c) => parts.add(c));
      this.className = [...parts].join(' ');
    },
    remove: (...cls: string[]) => {
      const parts = new Set(this.className.split(' ').filter(Boolean));
      cls.forEach((c) => parts.delete(c));
      this.className = [...parts].join(' ');
    },
    toggle: (c: string, force?: boolean) => {
      const parts = new Set(this.className.split(' ').filter(Boolean));
      const has = parts.has(c);
      const shouldHave = force !== undefined ? force : !has;
      if (shouldHave) parts.add(c);
      else parts.delete(c);
      this.className = [...parts].join(' ');
      return shouldHave;
    },
    contains: (c: string) => this.className.split(' ').includes(c),
  };

  addEventListener(type: string, handler: (e: unknown) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  setAttribute(k: string, v: string) {
    if (k === 'id') this.id = v;
    if (k === 'class') this.className = v;
  }

  append(...items: Array<MockElement | string>) {
    items.forEach((it) => {
      if (typeof it === 'string') {
        const textNode = new MockElement();
        textNode.textContent = it;
        textNode.parentElement = this;
        this.children.push(textNode);
      } else {
        it.parentElement = this;
        this.children.push(it);
      }
    });
  }

  replaceChildren(...items: Array<MockElement | string>) {
    this.children = [];
    this.append(...items);
  }

  querySelector(sel: string): MockElement | null {
    if (sel.startsWith('#')) {
      const targetId = sel.slice(1);
      if (this.id === targetId) return this;
      for (const ch of this.children) {
        const found = ch.querySelector(sel);
        if (found) return found;
      }
    } else if (sel.startsWith('.')) {
      const targetClass = sel.slice(1);
      if (this.classList.contains(targetClass)) return this;
      for (const ch of this.children) {
        const found = ch.querySelector(sel);
        if (found) return found;
      }
    } else if (sel === 'input' || sel === 'button' || sel === 'h2' || sel === 'kbd') {
      if (this.className.includes(sel)) return this;
      for (const ch of this.children) {
        const found = ch.querySelector(sel);
        if (found) return found;
      }
    }
    return null;
  }

  querySelectorAll(sel: string): MockElement[] {
    const results: MockElement[] = [];
    const check = (node: MockElement) => {
      if (sel.startsWith('.')) {
        const targetClass = sel.slice(1);
        if (node.classList.contains(targetClass)) results.push(node);
      }
      for (const ch of node.children) check(ch);
    };
    check(this);
    return results;
  }
}

let mockElements: Record<string, MockElement> = {};

if (typeof document === 'undefined') {
  (globalThis as unknown as { document: unknown }).document = {
    body: new MockElement(),
    getElementById: (id: string) => mockElements[id] ?? null,
    createElement: (tag: string) => {
      const el = new MockElement();
      el.className = tag;
      return el;
    },
  };
}

function collectText(node: MockElement): string {
  let s = (node.textContent || '') + ' ' + (node.innerHTML || '') + ' ';
  for (const ch of node.children) s += collectText(ch) + ' ';
  return s;
}

describe('Gothic In-Game Pause Menu & Game Codex (#pause-menu)', () => {
  let ctx: PauseMenuCtx;
  let menu: PauseMenu;
  let paused = false;
  let sfxOn = true;
  let musicOn = true;
  let quality = 2;
  let autoRecenter = false;

  beforeEach(() => {
    mockElements = {};
    paused = true;
    sfxOn = true;
    musicOn = true;
    quality = 2;
    autoRecenter = false;

    ctx = {
      resume: vi.fn(() => { paused = false; menu.close(); }),
      isPaused: vi.fn(() => paused),
      openSaves: vi.fn(),
      exitToMain: vi.fn(),
      setQuality: vi.fn((q: number) => { quality = q; }),
      getQuality: vi.fn(() => quality),
      setAutoRecenter: vi.fn((on: boolean) => { autoRecenter = on; }),
      getAutoRecenter: vi.fn(() => autoRecenter),
      heroKnownSpells: vi.fn(() => 0b10011), // knows spell 0 (Fire Bolt), 1 (Fireball), 4 (Frost Bolt)
      openSpellbook: vi.fn(),
      openInventory: vi.fn(),
      openStats: vi.fn(),
      openQuests: vi.fn(),
      toggleMusic: vi.fn(() => { musicOn = !musicOn; }),
      isMusicOn: vi.fn(() => musicOn),
      toggleSfx: vi.fn(() => { sfxOn = !sfxOn; }),
      isSfxOn: vi.fn(() => sfxOn),
    };

    menu = new PauseMenu(ctx);
  });

  it('initializes hidden and connects to #pause-menu', () => {
    expect(menu.isOpen).toBe(false);
    const root = document.getElementById('pause-menu');
    expect(root).not.toBeNull();
  });

  it('open() displays Gothic Pause Menu with header, filigree divider, and main buttons', () => {
    menu.open();
    expect(menu.isOpen).toBe(true);

    const root = document.getElementById('pause-menu') as unknown as MockElement;
    expect(root.hidden).toBe(false);

    // Title
    const title = root.querySelector('.pause-title');
    expect(title?.textContent).toBe('Game Paused');

    // Filigree divider
    const divider = root.querySelector('.gothic-divider');
    expect(divider).not.toBeNull();
    expect(divider?.innerHTML).toContain('filigree-glyph');

    // 6 Main Menu Buttons
    const buttons = root.querySelectorAll('.pause-btn');
    expect(buttons.length).toBe(6);

    const titles = buttons.map(b => b.querySelector('.pause-btn-title')?.textContent);
    expect(titles).toContain('Resume Game');
    expect(titles).toContain('Controls & Hotkeys');
    expect(titles).toContain('Magic & Spells Codex');
    expect(titles).toContain('Settings (Audio & Display)');
    expect(titles).toContain('Save Game / Load Game');
    expect(titles).toContain('Exit to Main Menu');
  });

  it('clicking "Resume Game" calls ctx.resume() and closes menu', () => {
    menu.open();
    const root = document.getElementById('pause-menu') as unknown as MockElement;
    const resumeBtn = root.querySelectorAll('.pause-btn')[0];
    expect(resumeBtn).not.toBeUndefined();

    resumeBtn.onclick?.();
    expect(ctx.resume).toHaveBeenCalled();
    expect(menu.isOpen).toBe(false);
  });

  it('Escape key handling resumes when on main view, and steps back when in sub-panel', () => {
    menu.open();
    expect(menu.isOpen).toBe(true);

    // Navigate to Controls
    const root = document.getElementById('pause-menu') as unknown as MockElement;
    const controlsBtn = root.querySelectorAll('.pause-btn')[1];
    controlsBtn.onclick?.();

    // Verify sub-view is controls
    expect(root.querySelector('.pause-sub-title')?.textContent).toContain('Controls & Hotkeys');

    // First ESC returns to main pause menu
    const handled1 = menu.handleEscape();
    expect(handled1).toBe(true);
    expect(root.querySelector('.pause-title')?.textContent).toBe('Game Paused');
    expect(menu.isOpen).toBe(true);

    // Second ESC resumes game
    const handled2 = menu.handleEscape();
    expect(handled2).toBe(true);
    expect(ctx.resume).toHaveBeenCalled();
    expect(menu.isOpen).toBe(false);
  });

  it('renders "Controls & Hotkeys" sub-panel with full visual cheatsheet', () => {
    menu.open('controls');
    const root = document.getElementById('pause-menu') as unknown as MockElement;

    const subTitle = root.querySelector('.pause-sub-title');
    expect(subTitle?.textContent).toContain('Controls & Hotkeys');

    const sections = root.querySelectorAll('.pause-section-box');
    expect(sections.length).toBe(4);

    const fullText = collectText(root);
    // Movement & Combat
    expect(fullText).toContain('WASD');
    expect(fullText).toContain('RMB');
    expect(fullText).toContain('LMB');
    expect(fullText).toContain('Space');
    // Belt Potions & ALT Loot
    expect(fullText).toContain('Drink Belt Potions');
    expect(fullText).toContain('Healing Draught');
    expect(fullText).toContain('ALT');
    // Panels & Keys
    expect(fullText).toContain('Q');
    expect(fullText).toContain('I');
    expect(fullText).toContain('S');
    expect(fullText).toContain('C');
    expect(fullText).toContain('ESC');

    // Back to Menu button
    const backBtn = root.querySelector('.pause-nav-btn');
    expect(backBtn).not.toBeNull();
    backBtn?.onclick?.();
    expect(root.querySelector('.pause-title')?.textContent).toBe('Game Paused');
  });

  it('renders "Magic & Spells Codex" sub-panel with lore, casting, learning, and mana rules', () => {
    menu.open('codex');
    const root = document.getElementById('pause-menu') as unknown as MockElement;

    const subTitle = root.querySelector('.pause-sub-title');
    expect(subTitle?.textContent).toContain('Magic & Spells Codex');

    const fullText = collectText(root);
    // The 5 Spheres
    expect(fullText).toContain('The Five Spheres of Magic');
    expect(fullText).toContain('Fire');
    expect(fullText).toContain('Water');
    expect(fullText).toContain('Air');
    expect(fullText).toContain('Earth');
    expect(fullText).toContain('Astral');

    // Casting & Learning & Mana rules
    expect(fullText).toContain('How to Cast Spells');
    expect(fullText).toContain('Quickbar');
    expect(fullText).toContain('Ancient Spell Scrolls');
    expect(fullText).toContain('Town Arcanists');
    expect(fullText).toContain('Mana Management');
    expect(fullText).toContain('Shrines of Restoration');

    // Filter tabs
    const filterTabs = root.querySelectorAll('.codex-filter-tab');
    expect(filterTabs.length).toBe(6);

    // Spell cards exist
    const spellCards = root.querySelectorAll('.codex-spell-card');
    expect(spellCards.length).toBe(SPELLS.length);

    // Spell 0 is Fire Bolt (known by hero in mock)
    expect(spellCards[0].className).toContain('known');
  });

  it('renders "Settings (Audio & Display)" sub-panel and adjusts sliders and toggles', () => {
    menu.open('settings');
    const root = document.getElementById('pause-menu') as unknown as MockElement;

    const subTitle = root.querySelector('.pause-sub-title');
    expect(subTitle?.textContent).toContain('Settings (Audio & Display)');

    // Quality buttons
    const qualityButtons = root.querySelectorAll('.segmented-btn');
    expect(qualityButtons.length).toBe(3);
    qualityButtons[1].onclick?.();
    expect(ctx.setQuality).toHaveBeenCalledWith(1);

    // Auto-recenter Camera toggle
    const camToggle = root.querySelector('.pause-toggle-btn');
    expect(camToggle).not.toBeNull();
    camToggle?.onclick?.();
    expect(ctx.setAutoRecenter).toHaveBeenCalledWith(true);

    // Mute toggles
    const muteButtons = root.querySelectorAll('.pause-mute-btn');
    expect(muteButtons.length).toBe(2);
    muteButtons[0].onclick?.();
    expect(ctx.toggleSfx).toHaveBeenCalled();
    muteButtons[1].onclick?.();
    expect(ctx.toggleMusic).toHaveBeenCalled();
  });

  it('Save and Exit buttons invoke corresponding context callbacks', () => {
    menu.open();
    const root = document.getElementById('pause-menu') as unknown as MockElement;
    const buttons = root.querySelectorAll('.pause-btn');

    // 5th button: Save Game / Load Game
    buttons[4].onclick?.();
    expect(ctx.openSaves).toHaveBeenCalled();

    // 6th button: Exit to Main Menu
    buttons[5].onclick?.();
    expect(ctx.exitToMain).toHaveBeenCalled();
  });
});
