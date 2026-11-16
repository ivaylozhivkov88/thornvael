import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatItemTooltip, renderItemTooltipDom } from '../src/heroui';
import { getItemDef, itemId, Slot } from '../src/sim/items';
import { startState, type HeroState } from '../src/sim/hero';
import { PaperdollController, type PaperdollHost } from '../src/paperdoll';
import { TownUi } from '../src/townui';

// Minimal DOM Mock for Node Vitest environment
class MockElement {
  id = '';
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
  style: Record<string, any> = {};

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

  hasChildNodes(): boolean {
    return this.children.length > 0;
  }

  append(...items: Array<MockElement | string>) {
    items.forEach((it) => {
      if (typeof it === 'string') {
        const textNode = new MockElement();
        textNode.textContent = it;
        textNode.parentElement = this;
        this.children.push(textNode);
      } else if (it) {
        it.parentElement = this;
        this.children.push(it);
      }
    });
  }

  replaceChildren(...items: Array<MockElement | string>) {
    this.children = [];
    this.append(...items);
  }

  contains(el: MockElement | null): boolean {
    if (!el) return false;
    let curr: MockElement | null = el;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  closest<T = MockElement>(sel: string): T | null {
    const parts = sel.split(',').map((s) => s.trim());
    let curr: MockElement | null = this;
    while (curr) {
      for (const p of parts) {
        if (p.startsWith('.') && curr.classList.contains(p.slice(1))) return curr as unknown as T;
        if (p.startsWith('#') && curr.id === p.slice(1)) return curr as unknown as T;
        if (p === '[data-equipment-target]' && curr.dataset.equipmentTarget) return curr as unknown as T;
        if (p.startsWith('[data-equipment-target=')) {
          const m = /data-equipment-target="?([^"\]]+)"?/.exec(p);
          if (m && curr.dataset.equipmentTarget === m[1]) return curr as unknown as T;
        }
        if (p === '[data-equipment-target^="eq"]' && curr.dataset.equipmentTarget?.startsWith('eq')) return curr as unknown as T;
      }
      curr = curr.parentElement;
    }
    return null;
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
    } else if (sel.includes('[data-equipment-target="')) {
      const match = /data-equipment-target="([^"]+)"/.exec(sel);
      if (match && this.dataset.equipmentTarget === match[1]) return this;
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
}

let mockElementFromPoint: (x: number, y: number) => MockElement | null = () => null;

(globalThis as unknown as { document: unknown }).document = {
  body: new MockElement(),
  getElementById: () => new MockElement(),
  createElement: () => new MockElement(),
  elementFromPoint: (x: number, y: number) => mockElementFromPoint(x, y),
};

describe('Authentic ARPG Drag-and-Drop, Tooltip Comparison & Smooth Shop UI', () => {
  const townStylePath = resolve(__dirname, '../src/townstyle.css');
  const townStyleCss = readFileSync(townStylePath, 'utf8');

  describe('1. Item Comparison Tooltip', () => {
    let hero: HeroState;
    let weaponId1: number;
    let weaponId2: number;
    let armorId1: number;

    beforeEach(() => {
      weaponId1 = itemId('Rusty Sword') ?? 0;
      weaponId2 = itemId('Iron Sword') ?? 1;
      armorId1 = itemId('Padded Jerkin') ?? 2;
      hero = startState(0, 0, false, 1);
      hero.eq[Slot.Weapon] = weaponId1;
      hero.eq[Slot.Armor] = -1; // empty armor slot
    });

    it('formatItemTooltip displays EQUIPPED section and deltas when inspecting a different weapon', () => {
      const tip = formatItemTooltip(weaponId2, hero);
      const eqDef = getItemDef(weaponId1)!;
      expect(tip).toContain(`EQUIPPED: ${eqDef.name}`);
      expect(tip).toContain('COMPARISON vs EQUIPPED');
      expect(tip).toMatch(/Damage:/);
    });

    it('formatItemTooltip indicates currently equipped when inspecting the worn weapon', () => {
      const tip = formatItemTooltip(weaponId1, hero);
      expect(tip).toContain('[CURRENTLY EQUIPPED]');
      expect(tip).not.toContain('COMPARISON vs EQUIPPED');
    });

    it('formatItemTooltip indicates empty slot when slot has no item', () => {
      const tip = formatItemTooltip(armorId1, hero);
      expect(tip).toContain('Armor Slot Empty');
    });

    it('renderItemTooltipDom renders card comparison section with deltas', () => {
      const dom = renderItemTooltipDom(weaponId2, hero);
      expect(dom.querySelector('.card-comparison-section')).not.toBeNull();
      expect(dom.querySelector('.comparison-header')).not.toBeNull();
      expect(dom.querySelector('.comparison-eq-name')?.textContent).toBe(getItemDef(weaponId1)?.name);
      expect(dom.querySelector('.comparison-deltas')).not.toBeNull();
    });

    it('renderItemTooltipDom renders empty slot notice when slot is empty', () => {
      const dom = renderItemTooltipDom(armorId1, hero);
      expect(dom.querySelector('.empty-slot-notice')).not.toBeNull();
    });

    it('renderItemTooltipDom renders item-equipped-badge when inspecting currently equipped item', () => {
      const dom = renderItemTooltipDom(weaponId1, hero);
      expect(dom.querySelector('.item-equipped-badge')).not.toBeNull();
    });
  });

  describe('2. Direct Drag-and-Drop & Paperdoll Targeting', () => {
    it('CSS hides hero-drag-handle so users drag entire button directly', () => {
      expect(townStyleCss).toMatch(/#sheet \.hero-drag-handle\s*\{\s*display:\s*none/);
    });

    it('CSS configures hero-gear-cell button with touch-action: none and grab cursor', () => {
      expect(townStyleCss).toContain('touch-action: none');
      expect(townStyleCss).toContain('cursor: grab');
      expect(townStyleCss).toContain('cursor: grabbing');
    });

    it('CSS defines floating card tooltip and styled drag ghost', () => {
      expect(townStyleCss).toContain('.hero-floating-card-tooltip');
      expect(townStyleCss).toContain('#sheet .hero-drag-ghost');
      expect(townStyleCss).toContain('.card-comparison-section');
      expect(townStyleCss).toContain('.delta-pos');
      expect(townStyleCss).toContain('.delta-neg');
    });

    it('PaperdollController resolves paperdoll figure/board as valid target for pack items', () => {
      const body = new MockElement();
      const sheet = new MockElement();
      sheet.append(body);

      const board = new MockElement();
      board.classList.add('hero-gear-board');
      const slotWeapon = new MockElement();
      slotWeapon.dataset.equipmentTarget = 'eq0';
      board.append(slotWeapon);
      body.append(board);

      const packPanel = new MockElement();
      packPanel.classList.add('hero-pack-panel');
      packPanel.dataset.equipmentTarget = 'pack';
      body.append(packPanel);

      const hero = startState(0, 0, false, 1);
      const wep = itemId('Rusty Sword') ?? 0;
      hero.inv = [{ item: wep, n: 1 }];

      const mockSim = { hero, cb: { hp: [100] }, tick: 0 } as any;
      const host: PaperdollHost = {
        sheet: sheet as any,
        body: body as any,
        getSim: () => mockSim,
        queue: () => {},
        feedback: new MockElement() as any,
        isPending: () => false,
        setPending: () => {},
        render: () => {},
        hideCardTooltip: () => {},
      };

      const controller = new PaperdollController(host);
      const intent = controller.intent({ from: 'inv', slot: 0, item: wep });
      expect(intent).not.toBeNull();

      controller.drag = {
        intent: intent!,
        pointer: 1,
        x: 0,
        y: 0,
        events: new AbortController(),
        ghost: null,
        target: null,
        scrollFrame: 0,
      };

      mockElementFromPoint = () => board;
      const target = controller.targetAt({ clientX: 50, clientY: 50 } as any);
      expect(target).toBe(slotWeapon);

      // Drag equipped gear onto pack
      const eqIntent = controller.intent({ from: 'eq', slot: 0, item: wep });
      expect(eqIntent).not.toBeNull();
      controller.drag.intent = eqIntent!;

      mockElementFromPoint = () => packPanel;
      const packTarget = controller.targetAt({ clientX: 150, clientY: 150 } as any);
      expect(packTarget).toBe(packPanel);
    });
  });

  describe('3. Smooth Shop UI & No Portrait Flickering', () => {
    it('TownUi defines updateShopSelections method to avoid full renderShop recreation', () => {
      const townUiProto = TownUi.prototype as any;
      expect(typeof townUiProto.updateShopSelections).toBe('function');
    });

    it('TownUi contains showCardTooltip and hideCardTooltip for hover comparison in shop', () => {
      const townUiProto = TownUi.prototype as any;
      expect(typeof townUiProto.showCardTooltip).toBe('function');
      expect(typeof townUiProto.hideCardTooltip).toBe('function');
    });
  });
});
