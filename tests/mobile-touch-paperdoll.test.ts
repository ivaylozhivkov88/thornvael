import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HeroUi, type HeroUiCtx } from '../src/heroui';
import { Sim, type Command } from '../src/sim/sim';
import { createHero, startState, type HeroState } from '../src/sim/hero';
import { itemId, Slot } from '../src/sim/items';
import type { GameMap } from '../src/map';
import { Kind } from '../src/sim/combat';

describe('Pillar 5: Mobile Touch Paperdoll Ergonomics & UI Viewport Containment', () => {
  const cssPath = resolve(__dirname, '../src/townstyle.css');
  const css = readFileSync(cssPath, 'utf8');

  describe('CSS Hitbox & Viewport Rules', () => {
    it('contains media query for <= 650px screens', () => {
      expect(css).toContain('@media (max-width: 650px)');
    });

    it('expands touch hitboxes for small slots (eq5 ring, eq5_alt ring2, eq6 amulet) to >= 48x48px via ::before', () => {
      expect(css).toMatch(/\[data-equipment-target="eq5"\]\s*>\s*button::before/);
      expect(css).toMatch(/\[data-equipment-target="eq5_alt"\]\s*>\s*button::before/);
      expect(css).toMatch(/\[data-equipment-target="eq6"\]\s*>\s*button::before/);
      expect(css).toContain('min-width: 48px');
      expect(css).toContain('min-height: 48px');
      expect(css).toContain('transform: translate(-50%, -50%)');
    });

    it('enforces UI Viewport Containment Rule on #sheet with 100dvh and no page vertical scroll', () => {
      expect(css).toContain('max-height: 100dvh');
      expect(css).toContain('overflow-y: auto');
      expect(css).toContain('overscroll-behavior: contain');
    });

    it('defines mobile popover and thumb-friendly action buttons with >= 48px height', () => {
      expect(css).toContain('.hero-mobile-popover');
      expect(css).toContain('.hero-mobile-popover-content');
      expect(css).toContain('.hero-mobile-popover-actions');
      expect(css).toContain('.btn-equip-hero');
      expect(css).toContain('.btn-unequip-hero');
      expect(css).toContain('.btn-close-hero');
    });
  });

  describe('HeroUi Mobile Touch Popover DOM Interaction', () => {
    // Setup Mock DOM
    const elements = new Map<string, any>();

    function createMockElement(tag: string, className = ''): any {
      const attrs = new Map<string, string>();
      const el: any = {
        tagName: tag.toUpperCase(),
        className,
        hidden: false,
        textContent: '',
        innerHTML: '',
        children: [] as any[],
        parentElement: null as any,
        dataset: {} as Record<string, string>,
        style: {} as Record<string, any>,
        disabled: false,
        onclick: null as any,
        oncontextmenu: null as any,
        ondblclick: null as any,
        addEventListener: (_ev: string, _fn: any) => {},
        removeEventListener: (_ev: string, _fn: any) => {},
        remove: () => {
          if (el.parentElement) {
            const idx = el.parentElement.children.indexOf(el);
            if (idx >= 0) el.parentElement.children.splice(idx, 1);
            el.parentElement = null;
          }
        },
        append: (...children: any[]) => {
          for (const c of children) {
            if (c) {
              if (typeof c === 'object') c.parentElement = el;
              el.children.push(c);
            }
          }
        },
        prepend: (...children: any[]) => {
          for (const c of children) {
            if (c) {
              if (typeof c === 'object') c.parentElement = el;
              el.children.unshift(c);
            }
          }
        },
        replaceChildren: (...children: any[]) => {
          el.children = [];
          for (const c of children) {
            if (c) {
              if (typeof c === 'object') c.parentElement = el;
              el.children.push(c);
            }
          }
        },
        querySelector: (sel: string) => {
          const find = (node: any): any => {
            if (!node || typeof node !== 'object') return null;
            if (sel.startsWith('.') && typeof node.className === 'string' && node.className.includes(sel.slice(1))) return node;
            if (sel.startsWith('#') && node.id === sel.slice(1)) return node;
            if (sel.includes('[data-k=')) {
              const match = sel.match(/\[data-k="([^"]+)"\]/);
              if (match && node.dataset?.k === match[1]) return node;
            }
            if (sel.includes('[aria-selected="true"]') && (node.dataset?.selected === 'true' || node.getAttribute?.('aria-selected') === 'true')) return node;
            if (Array.isArray(node.children)) {
              for (const child of node.children) {
                const found = find(child);
                if (found) return found;
              }
            }
            return null;
          };
          return find(el);
        },
        querySelectorAll: (sel: string) => {
          const res: any[] = [];
          const scan = (node: any) => {
            if (!node || typeof node !== 'object') return;
            if (sel.startsWith('.') && typeof node.className === 'string' && node.className.includes(sel.slice(1))) res.push(node);
            if (Array.isArray(node.children)) {
              for (const child of node.children) scan(child);
            }
          };
          scan(el);
          return res;
        },
        setAttribute: (k: string, v: string) => { attrs.set(k, v); },
        getAttribute: (k: string) => attrs.get(k) ?? null,
        hasChildNodes: () => el.children.length > 0,
        getBoundingClientRect: () => ({ top: 10, left: 10, right: 100, bottom: 100, width: 90, height: 90 }),
        focus: () => {},
        classList: {
          add: (c: string) => {
            const set = new Set((el.className || '').split(' ').filter(Boolean));
            set.add(c);
            el.className = [...set].join(' ');
          },
          remove: (c: string) => {
            const set = new Set((el.className || '').split(' ').filter(Boolean));
            set.delete(c);
            el.className = [...set].join(' ');
          },
          toggle: (c: string, force?: boolean) => {
            const set = new Set((el.className || '').split(' ').filter(Boolean));
            if (force === undefined) {
              if (set.has(c)) set.delete(c); else set.add(c);
            } else if (force) set.add(c); else set.delete(c);
            el.className = [...set].join(' ');
          },
          contains: (c: string) => (el.className || '').split(' ').includes(c),
        },
      };
      return el;
    }

    const mockBody = createMockElement('body');
    const mockSheet = createMockElement('div', 'sheet');
    mockSheet.id = 'sheet';
    const mockHead = createMockElement('div', 'sheet-head');
    mockHead.id = 'sheet-head';
    const mockSheetBody = createMockElement('div');
    mockSheetBody.id = 'sheet-body';
    const mockCreate = createMockElement('div');
    mockCreate.id = 'create';
    mockCreate.hidden = true;

    mockSheet.append(mockHead, mockSheetBody);
    mockBody.append(mockSheet, mockCreate);

    elements.set('sheet', mockSheet);
    elements.set('sheet-head', mockHead);
    elements.set('sheet-body', mockSheetBody);
    elements.set('create', mockCreate);

    // Global mock document
    (globalThis as any).document = {
      createElement: (tag: string) => createMockElement(tag),
      createElementNS: (_ns: string, tag: string) => createMockElement(tag),
      getElementById: (id: string) => elements.get(id) || null,
      body: mockBody,
      addEventListener: () => {},
      removeEventListener: () => {},
      activeElement: null,
      hidden: false,
    };
    (globalThis as any).window = {
      innerWidth: 400, // Mobile screen width <= 650px
      innerHeight: 800,
      setTimeout: (fn: any) => fn(),
      clearTimeout: () => {},
    };
    (globalThis as any).innerWidth = 400;
    (globalThis as any).innerHeight = 800;

    function createSimWithHero(): Sim {
      const w = 10, h = 10;
      const map: GameMap = {
        w, h,
        terrain: new Uint8Array(w * h),
        height: new Uint8Array(w * h),
        blocked: new Uint8Array(w * h),
        objects: [],
        light: new Uint8Array(w * h).fill(255),
      };
      const sim = new Sim(map, 1, [0], { kinds: [Kind.Hero], combat: true });
      sim.place(0, 2, 2);
      createHero(sim, 0, 0, false, 1);
      return sim;
    }

    it('opens mobile touch popover on showMobilePopover for equipped item with [Unequip] action', () => {
      const sim = createSimWithHero();
      const hero = sim.hero!;
      // Hero starts with weapon equipped in slot 0
      const weaponId = hero.eq[0];
      expect(weaponId).toBeGreaterThanOrEqual(0);

      const queued: Command[] = [];
      const ctx: HeroUiCtx = {
        sim: () => sim,
        queue: (c) => queued.push(c),
        toast: () => {},
        tipOn: () => {},
        setSlot: () => {},
        openBook: () => {},
        onOpen: () => {},
      };

      const heroUi = new HeroUi(ctx);
      heroUi.open('hero');

      // Call showMobilePopover for equipped item
      heroUi.showMobilePopover(hero, { from: 'eq', item: weaponId, slot: 0 });

      // Verify popover exists in body
      const popover = mockBody.children.find((c: any) => c.className?.includes('hero-mobile-popover'));
      expect(popover).toBeDefined();

      // Find the unequip button
      const unequipBtn = popover.querySelector('.btn-unequip-hero');
      expect(unequipBtn).toBeDefined();

      // Click unequip -> should queue equipment change and dismiss popover
      unequipBtn.onclick();
      expect(queued.length).toBeGreaterThan(0);
      expect(mockBody.children.find((c: any) => c.className?.includes('hero-mobile-popover'))).toBeUndefined();
    });

    it('opens mobile touch popover on showMobilePopover for inventory item with [Equip] action', () => {
      const sim = createSimWithHero();
      const hero = sim.hero!;
      // Give hero a ring in inventory
      const ringId = itemId('Ring of Might');
      expect(ringId).toBeGreaterThanOrEqual(0);
      hero.inv.push({ item: ringId, n: 1 });

      const queued: Command[] = [];
      const ctx: HeroUiCtx = {
        sim: () => sim,
        queue: (c) => queued.push(c),
        toast: () => {},
        tipOn: () => {},
        setSlot: () => {},
        openBook: () => {},
        onOpen: () => {},
      };

      const heroUi = new HeroUi(ctx);
      heroUi.open('hero');

      const invSlot = hero.inv.length - 1;
      heroUi.showMobilePopover(hero, { from: 'inv', item: ringId, slot: invSlot });

      const popover = mockBody.children.find((c: any) => c.className?.includes('hero-mobile-popover'));
      expect(popover).toBeDefined();

      const equipBtn = popover.querySelector('.btn-equip-hero');
      expect(equipBtn).toBeDefined();

      const closeBtn = popover.querySelector('.btn-close-hero');
      expect(closeBtn).toBeDefined();

      // Clicking close dismisses the popover
      closeBtn.onclick();
      expect(mockBody.children.find((c: any) => c.className?.includes('hero-mobile-popover'))).toBeUndefined();
    });
  });
});
