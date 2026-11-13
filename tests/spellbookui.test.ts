import { beforeEach, describe, expect, it } from 'vitest';
import { SpellbookUi, SCHOOLS, SPELL_DATABASE } from '../src/spellbookui';
import { SPELLS } from '../src/sim/spelldata';
import type { Sim, Command } from '../src/sim/sim';
import { Cls, itemId } from '../src/sim/items';
import { startState } from '../src/sim/hero';

// Minimal DOM Mock for Node Vitest environment
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
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  dataset: Record<string, string> = {};
  disabled = false;
  title = '';
  onclick: ((e?: unknown) => void) | null = null;

  style = {
    setProperty: (prop: string, val: string) => {
      (this.style as unknown as Record<string, string>)[prop] = val;
    },
    borderColor: '',
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
    } else if (sel.includes('[data-page=')) {
      const match = /data-page="?([^"\]]+)"?/.exec(sel);
      if (match && this.dataset.page === match[1]) return this;
      for (const ch of this.children) {
        const found = ch.querySelector(sel);
        if (found) return found;
      }
    }
    return null;
  }

  querySelectorAll(sel: string): MockElement[] {
    const results: MockElement[] = [];
    if (sel.startsWith('.')) {
      const targetClass = sel.slice(1);
      if (this.classList.contains(targetClass)) results.push(this);
    }
    for (const ch of this.children) {
      results.push(...ch.querySelectorAll(sel));
    }
    return results;
  }

  click() {
    this.onclick?.();
  }
}

const mockElements: Record<string, MockElement> = {};
(globalThis as unknown as { document: unknown }).document = {
  body: new MockElement(),
  getElementById: (id: string) => mockElements[id] ?? null,
  createElement: () => new MockElement(),
};

describe('Gothic Spellbook UI & Magic Mastery System', () => {
  let simMock: Sim;
  let slots: number[];
  let activeRmb: number | null;
  let commands: Command[];
  let toasts: string[];
  let armedSpells: number[];
  let ui: SpellbookUi;

  beforeEach(() => {
    const modal = new MockElement();
    modal.id = 'spellbook-modal';
    modal.className = 'spellbook-modal';
    modal.hidden = true;
    mockElements['spellbook-modal'] = modal;

    // Mock Sim with a Mage hero
    const hero = startState(0, Cls.Mage, false, 1);
    // Mage knows Fire Bolt (0), Frost Bolt (4), Healing (7)
    hero.known = (1 << 0) | (1 << 4) | (1 << 7);
    hero.attr[2] = 12; // Mind = 12
    hero.inv = [
      { item: itemId('Scroll of Fireball'), n: 1 }, // hero carries scroll of Fireball
    ];

    simMock = {
      hero,
      cb: {
        known: new Uint32Array(32),
        gold: [500],
      },
      count: 1,
    } as unknown as Sim;
    simMock.cb.known[0] = hero.known;

    slots = [0, 4, 7, -1, -1, -1, -1, -1];
    activeRmb = null;
    commands = [];
    toasts = [];
    armedSpells = [];

    ui = new SpellbookUi({
      sim: () => simMock,
      getSlots: () => slots,
      setSlot: (idx, sid) => {
        slots[idx] = sid;
      },
      getActiveRmb: () => activeRmb,
      setActiveRmb: (sid) => {
        activeRmb = sid;
      },
      armSpell: (sid) => {
        armedSpells.push(sid);
      },
      queue: (cmd) => {
        commands.push(cmd);
      },
      toast: (msg) => {
        toasts.push(msg);
      },
    });
  });

  it('exposes all 5 magic spheres and all 32 spells in the arcane database', () => {
    expect(SCHOOLS.length).toBe(5);
    expect(SCHOOLS.map((s) => s.sphereName)).toEqual([
      'Pyromancy',
      'Cryomancy',
      'Aeromancy',
      'Geomancy',
      'Mysticism',
    ]);
    expect(Object.keys(SPELL_DATABASE).length).toBe(32);
    expect(SPELLS.length).toBe(32);
  });

  it('opens and closes the gothic grimoire modal', () => {
    expect(ui.isOpen).toBe(false);
    ui.open();
    expect(ui.isOpen).toBe(true);

    const modal = (document as unknown as { getElementById: (id: string) => MockElement }).getElementById('spellbook-modal');
    expect(modal).not.toBeNull();
    expect(modal.hidden).toBe(false);

    ui.close();
    expect(ui.isOpen).toBe(false);
    expect(modal.hidden).toBe(true);
  });

  it('displays known spells with active status and allows RMB binding', () => {
    ui.open({ initialSpellId: 0 }); // Fire Bolt (known by Mage)
    const rightPage = (document as unknown as { getElementById: (id: string) => MockElement }).getElementById('grimoire-right-page')!;

    // Heading should be Fire Bolt
    expect(rightPage).not.toBeNull();
    const heading = rightPage.querySelector('.dossier-spell-heading');
    expect(heading?.textContent).toBe('Fire Bolt');

    // RMB button should be present
    const rmbBtn = rightPage.querySelector('.rmb-btn');
    expect(rmbBtn).not.toBeNull();
    rmbBtn?.click();

    expect(activeRmb).toBe(0);
    expect(toasts.some((t) => t.includes('Fire Bolt'))).toBe(true);
  });

  it('allows binding known spells to quickbar slots F1 - F8', () => {
    ui.open({ initialSpellId: 0 }); // Fire Bolt
    const rightPage = (document as unknown as { getElementById: (id: string) => MockElement }).getElementById('grimoire-right-page')!;

    const fkeyButtons = rightPage.querySelectorAll('.fkey-mini-btn');
    expect(fkeyButtons.length).toBe(8);
    expect(fkeyButtons[1].textContent).toBe('F2');
    fkeyButtons[1].click();

    expect(slots[1]).toBe(0); // Slot index 1 (F2) is now Fire Bolt
    expect(toasts.some((t) => t.includes('F2'))).toBe(true);
  });

  it('displays locked spells with scroll requirements and offers instant scribing if scroll is in pack', () => {
    ui.open({ initialSpellId: 1 }); // Fireball (unknown, but hero carries Scroll of Fireball)
    const rightPage = (document as unknown as { getElementById: (id: string) => MockElement }).getElementById('grimoire-right-page')!;

    const heading = rightPage.querySelector('.dossier-spell-heading');
    expect(heading?.textContent).toBe('Fireball');

    const scribeBtn = rightPage.querySelector('.scribe-btn');
    expect(scribeBtn).not.toBeNull();
    expect(scribeBtn?.disabled).toBe(false);
    scribeBtn?.click();

    expect(commands.some((c) => c.type === 'hero' && c.op === 'use')).toBe(true);
  });

  it('switches between magic spheres and selects spells in that sphere', () => {
    ui.open({ initialSchool: 2 }); // Cryomancy
    const leftPage = (document as unknown as { getElementById: (id: string) => MockElement }).getElementById('grimoire-left-page')!;

    expect(leftPage).not.toBeNull();
    const bannerTitle = leftPage.querySelector('.sphere-banner-title');
    expect(bannerTitle?.textContent).toContain('Cryomancy');
  });

  it('arms spell and closes spellbook when Cast Now is clicked', () => {
    ui.open({ initialSpellId: 0 }); // Fire Bolt (known)
    const rightPage = (document as unknown as { getElementById: (id: string) => MockElement }).getElementById('grimoire-right-page')!;
    const castBtn = rightPage.querySelector('.cast-btn');
    expect(castBtn).not.toBeNull();

    castBtn?.click();
    expect(ui.isOpen).toBe(false);
    expect(armedSpells).toContain(0);
  });
});
