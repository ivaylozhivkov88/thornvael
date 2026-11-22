import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameMap } from '../src/map';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { Sim } from '../src/sim/sim';
import { St } from '../src/sim/spelldata';
import {
  SQUAD_DOUBLE_TAP_MS,
  SquadBar,
  extractSquadMembers,
  resolveMemberPortrait,
  type SquadMember,
} from '../src/ui/squad-bar';

class MockElement {
  id = '';
  className = '';
  hidden = false;
  textContent = '';
  src = '';
  alt = '';
  type = '';
  title = '';
  draggable = false;
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  style: Record<string, string> = {};
  listeners: Record<string, Array<(e?: unknown) => void>> = {};
  onclick: ((e?: unknown) => void) | null = null;

  constructor(readonly tagName = 'DIV') {}

  classList = {
    add: (...cls: string[]) => {
      const set = new Set(this.className.split(' ').filter(Boolean));
      for (const c of cls) set.add(c);
      this.className = [...set].join(' ');
    },
    remove: (...cls: string[]) => {
      const set = new Set(this.className.split(' ').filter(Boolean));
      for (const c of cls) set.delete(c);
      this.className = [...set].join(' ');
    },
    toggle: (c: string, force?: boolean) => {
      const set = new Set(this.className.split(' ').filter(Boolean));
      const next = force !== undefined ? force : !set.has(c);
      if (next) set.add(c);
      else set.delete(c);
      this.className = [...set].join(' ');
      return next;
    },
    contains: (c: string) => this.className.split(' ').filter(Boolean).includes(c),
  };

  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
    if (k === 'id') this.id = v;
    if (k === 'class') this.className = v;
  }

  getAttribute(k: string): string | null {
    return this.attrs[k] ?? null;
  }

  addEventListener(type: string, fn: (e?: unknown) => void): void {
    (this.listeners[type] ??= []).push(fn);
  }

  dispatchEvent(type: string, event?: unknown): void {
    for (const fn of this.listeners[type] ?? []) fn(event);
  }

  append(...items: Array<MockElement | string>): void {
    for (const item of items) {
      if (typeof item === 'string') {
        const text = new MockElement('#TEXT');
        text.textContent = item;
        text.parentElement = this;
        this.children.push(text);
      } else {
        item.parentElement = this;
        this.children.push(item);
      }
    }
  }

  replaceChildren(...items: Array<MockElement | string>): void {
    this.children = [];
    this.append(...items);
  }

  remove(): void {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    this.parentElement = null;
  }

  querySelector(sel: string): MockElement | null {
    const all = this.querySelectorAll(sel);
    return all[0] ?? null;
  }

  querySelectorAll(sel: string): MockElement[] {
    const out: MockElement[] = [];
    const visit = (node: MockElement): void => {
      if (matchesSelector(node, sel)) out.push(node);
      for (const ch of node.children) visit(ch);
    };
    for (const ch of this.children) visit(ch);
    return out;
  }
}

function matchesSelector(node: MockElement, sel: string): boolean {
  if (sel.startsWith('.')) return node.classList.contains(sel.slice(1));
  if (sel.startsWith('#')) return node.id === sel.slice(1);
  if (sel === '[data-unit-id]') return node.dataset.unitId !== undefined;
  return node.tagName.toLowerCase() === sel.toLowerCase();
}

let mockBody = new MockElement('BODY');

if (typeof document === 'undefined') {
  (globalThis as unknown as { document: unknown }).document = {
    get body() {
      return mockBody;
    },
    createElement: (tag: string) => new MockElement(tag.toUpperCase()),
  };
}

function makeTestSim(): Sim {
  const w = 32;
  const h = 32;
  const map: GameMap = {
    w,
    h,
    terrain: new Uint8Array(w * h),
    height: new Uint8Array(w * h),
    blocked: new Uint8Array(w * h),
    objects: [],
    light: new Uint8Array(w * h).fill(200),
  };
  const sim = new Sim(map, 1, [0, 0, 0, 0, 1], {
    kinds: [Kind.Hero, Kind.Warrior, Kind.Archer, Kind.Mage, Kind.Gnoll],
    combat: true,
  });
  sim.place(0, 5, 5);
  sim.place(1, 6, 5);
  sim.place(2, 5, 6);
  sim.place(3, 6, 6);
  sim.place(4, 15, 15);
  createHero(sim, 0, 0, false, 1);
  sim.hero!.name = 'Dain';
  sim.hero!.level = 3;
  // Unit 3 is a dormant tavern merc waiting to be hired
  sim.hidden[3] = 1;
  return sim;
}

describe('SquadBar HUD', () => {
  beforeEach(() => {
    mockBody = new MockElement('BODY');
  });

  it('mounts hidden when empty and renders hero + active party members when updated', () => {
    const onSelect = vi.fn();
    const bar = new SquadBar(mockBody as unknown as HTMLElement, { onSelect });

    expect(bar.el.id).toBe('squad-bar');
    expect(bar.el.hidden).toBe(true);
    expect(mockBody.children.length).toBe(1);

    const sim = makeTestSim();
    const { members, totalCount } = extractSquadMembers(sim, new Set([0]), {
      baseUrl: './',
      getMercInfo: (id) => (id === 1 ? { id: 'merc-thornwick-levyman', name: 'Alden Pike' } : null),
    });

    expect(totalCount).toBe(3); // excludes dormant unit 3 and enemy unit 4
    expect(members.map((m) => m.id)).toEqual([0, 1, 2]);
    expect(members[0].isHero).toBe(true);
    expect(members[0].level).toBe(3);
    expect(members[1].portraitUrl).toBe('./townart/portraits/merc-thornwick-levyman.jpg');
    expect(members[2].portraitUrl).toBe('./townart/friend-archer.jpg');

    bar.update(members, totalCount);

    expect(bar.el.hidden).toBe(false);
    const cards = (bar.el as unknown as MockElement).querySelectorAll('.squad-member');
    expect(cards.length).toBe(3);
    expect(cards[0].classList.contains('is-hero')).toBe(true);
    expect(cards[0].classList.contains('is-selected')).toBe(true);
    expect(cards[1].classList.contains('is-selected')).toBe(false);
    expect(cards[0].querySelector('.squad-level-badge')?.textContent).toBe('Lv 3');
  });

  it('updates HP, Mana, status badges, and selection state in-place', () => {
    const bar = new SquadBar(mockBody as unknown as HTMLElement, { onSelect: vi.fn() });
    const sim = makeTestSim();
    sim.cb.hp[1] = 30;
    sim.cb.hpMax[1] = 60;
    sim.cb.mana[0] = 50;
    sim.cb.manaMax[0] = 100;
    sim.cb.stMask[1] = (1 << St.Bless) | (1 << St.Poison);

    const first = extractSquadMembers(sim, new Set([0]), { baseUrl: './' });
    bar.update(first.members, first.totalCount);

    const cardsBefore = (bar.el as unknown as MockElement).querySelectorAll('.squad-member');
    const hpFill1 = cardsBefore[1].querySelector('.squad-hp-fill')!;
    const manaFill0 = cardsBefore[0].querySelector('.squad-mana-fill')!;
    const manaTrack1 = cardsBefore[1].querySelector('.squad-mana-track')!;
    expect(hpFill1.style.width).toBe('50%');
    expect(manaFill0.style.width).toBe('50%');
    expect(manaTrack1.classList.contains('is-empty')).toBe(true);
    expect(cardsBefore[1].querySelectorAll('.squad-status-chip').length).toBe(2);

    // Mutate vitality & selection and re-update
    sim.cb.hp[1] = 10; // critical low HP (< 28%)
    sim.cb.mana[0] = 80;
    const second = extractSquadMembers(sim, new Set([1]), { baseUrl: './' });
    bar.update(second.members, second.totalCount);

    const cardsAfter = (bar.el as unknown as MockElement).querySelectorAll('.squad-member');
    expect(cardsAfter[1]).toBe(cardsBefore[1]); // DOM node reused in place
    expect(cardsAfter[0].classList.contains('is-selected')).toBe(false);
    expect(cardsAfter[1].classList.contains('is-selected')).toBe(true);
    expect(cardsAfter[1].classList.contains('is-low-hp')).toBe(true);
    expect(cardsAfter[1].querySelector('.squad-hp-fill')?.style.width).toBe('17%');
    expect(cardsAfter[0].querySelector('.squad-mana-fill')?.style.width).toBe('80%');
  });

  it('triggers single-tap selection (normal and additive) and double-tap camera focus', () => {
    let clock = 1000;
    let additive = false;
    const onSelect = vi.fn();
    const onFocus = vi.fn();

    const bar = new SquadBar(mockBody as unknown as HTMLElement, {
      onSelect,
      onFocus,
      isAdditive: () => additive,
      now: () => clock,
    });

    const members: SquadMember[] = [
      {
        id: 0,
        name: 'Dain',
        kind: Kind.Hero,
        isHero: true,
        level: 2,
        hp: 100,
        hpMax: 100,
        mana: 50,
        manaMax: 50,
        selected: true,
        alive: true,
        fallbackIcon: '⚔️',
        statusBadges: [],
      },
      {
        id: 2,
        name: 'Alderwood Poacher',
        kind: Kind.Archer,
        isHero: false,
        level: 1,
        hp: 40,
        hpMax: 40,
        mana: 0,
        manaMax: 0,
        selected: false,
        alive: true,
        fallbackIcon: '🏹',
        statusBadges: [],
      },
    ];
    bar.update(members);

    const cards = (bar.el as unknown as MockElement).querySelectorAll('.squad-member');

    // First tap on merc 2 -> selects it exclusively
    cards[1].onclick?.({ shiftKey: false });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith(2, false);
    expect(onFocus).not.toHaveBeenCalled();

    // Update selected flag and tap again within double-tap window -> focuses camera without deselecting
    members[0].selected = false;
    members[1].selected = true;
    bar.update(members);

    clock += SQUAD_DOUBLE_TAP_MS - 50;
    cards[1].onclick?.({ shiftKey: false });
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledWith(2);
    expect(onSelect).toHaveBeenCalledTimes(1);

    // Tap after window expires -> treated as normal tap (additive toggle when Shift/addMode is on)
    clock += SQUAD_DOUBLE_TAP_MS + 100;
    additive = true;
    cards[0].onclick?.({ shiftKey: false });
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith(0, true);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('applies responsive layout classes and supports collapsing on mobile', () => {
    const bar = new SquadBar(mockBody as unknown as HTMLElement, { onSelect: vi.fn() });
    const sim = makeTestSim();
    const { members, totalCount } = extractSquadMembers(sim, new Set([0]), { baseUrl: './' });
    bar.update(members, totalCount);

    // 1080p & 720p desktop
    expect(bar.updateResponsiveLayout(1920, 1080)).toBe(false);
    expect(bar.el.classList.contains('is-compact')).toBe(false);
    expect(bar.updateResponsiveLayout(1280, 720)).toBe(false);
    expect(bar.el.classList.contains('is-compact')).toBe(false);

    // Mobile landscape (844x390 and 667x375)
    expect(bar.updateResponsiveLayout(844, 390)).toBe(true);
    expect(bar.el.classList.contains('is-compact')).toBe(true);
    expect(bar.el.classList.contains('is-mobile-landscape')).toBe(true);

    // Collapse toggle
    const toggle = (bar.el as unknown as MockElement).querySelector('.squad-bar-toggle')!;
    expect(bar.isCollapsed).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.onclick?.();
    expect(bar.isCollapsed).toBe(true);
    expect(bar.el.classList.contains('is-collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.onclick?.();
    expect(bar.isCollapsed).toBe(false);
    expect(bar.el.classList.contains('is-collapsed')).toBe(false);
  });

  it('falls back to class icon when portrait image fails to load and caps overflow cleanly', () => {
    const bar = new SquadBar(mockBody as unknown as HTMLElement, { onSelect: vi.fn() });
    const p = resolveMemberPortrait({ id: 5, kind: Kind.Mage, isHero: false, baseUrl: './', mercInfo: null });
    expect(p.fallbackIcon).toBe('🔮');
    expect(p.portraitUrl).toBe('./townart/portrait-mage-m.png');

    const sim = makeTestSim();
    const { members, totalCount } = extractSquadMembers(sim, new Set([0]), { maxMembers: 2, baseUrl: './' });
    expect(members.length).toBe(2);
    expect(totalCount).toBe(3);

    bar.update(members, totalCount);
    const overflow = (bar.el as unknown as MockElement).querySelector('.squad-bar-overflow')!;
    expect(overflow.hidden).toBe(false);
    expect(overflow.textContent).toBe('+1 more');

    const img = (bar.el as unknown as MockElement).querySelector('.squad-portrait-img')!;
    const fallback = (bar.el as unknown as MockElement).querySelector('.squad-fallback-icon')!;
    expect(img.hidden).toBe(false);
    img.dispatchEvent('error');
    expect(img.hidden).toBe(true);
    expect(fallback.hidden).toBe(false);
  });

  it('enforces viewport containment, 44px touch targets, and touch-action CSS rules', () => {
    const css = readFileSync(new URL('../src/ui/squad-bar.css', import.meta.url), 'utf8');
    expect(css).toContain('100dvh');
    expect(css).toContain('overflow: hidden');
    expect(css).toContain('touch-action: none');
    expect(css).toContain('user-select: none');
    expect(css).toMatch(/min-width:\s*44px/);
    expect(css).toMatch(/min-height:\s*44px/);
  });

  it('renders squad stance & regroup buttons and fires callbacks cleanly', () => {
    const onStanceChange = vi.fn();
    const onRegroup = vi.fn();
    const bar = new SquadBar(mockBody as unknown as HTMLElement, {
      onSelect: vi.fn(),
      onStanceChange,
      onRegroup,
      initialStance: 'guard',
    });
    const sim = makeTestSim();
    const { members, totalCount } = extractSquadMembers(sim, new Set([0]), { baseUrl: './' });
    bar.update(members, totalCount);

    const stanceBtns = (bar.el as unknown as MockElement).querySelectorAll('.squad-tactic-btn');
    expect(stanceBtns.length).toBe(4);
    const holdBtn = stanceBtns[0]!;
    const guardBtn = stanceBtns[1]!;
    const aggrBtn = stanceBtns[2]!;
    const regroupBtn = stanceBtns[3]!;

    expect(guardBtn.classList.contains('is-active')).toBe(true);
    holdBtn.onclick?.();
    expect(onStanceChange).toHaveBeenCalledWith('hold');
    expect(holdBtn.classList.contains('is-active')).toBe(true);
    expect(guardBtn.classList.contains('is-active')).toBe(false);

    aggrBtn.onclick?.();
    expect(onStanceChange).toHaveBeenCalledWith('aggressive');
    expect(aggrBtn.classList.contains('is-active')).toBe(true);

    regroupBtn.onclick?.();
    expect(onRegroup).toHaveBeenCalledTimes(1);
  });
});
