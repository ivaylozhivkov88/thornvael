import './setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDoll, dollSet, lookFor } from '../src/doll';
import { Slot, itemId } from '../src/sim/items';
import { Sim } from '../src/sim/sim';
import { TownUi, type TownUiCtx } from '../src/townui';
import { loadDoc } from '../src/mapdoc';
import { BUILT_IN, createMission } from '../src/mission';
import { createHero } from '../src/sim/hero';

class MockNode {
  className = '';
  style: any = {
    cssText: '',
    background: '',
    boxShadow: '',
    border: '',
  };
  children: MockNode[] = [];
  src = '';
  alt = '';
  hidden = false;
  textContent = '';
  tabIndex = 0;
  scrollTop = 0;
  dataset: Record<string, string> = {};
  tagName = 'DIV';

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

  setAttribute(_k: string, _v: string) {}
  getAttribute(_k: string) { return ''; }
  removeAttribute(_k: string) {}
  addEventListener(_e: string, _fn: any) {}
  removeEventListener(_e: string, _fn: any) {}
  focus(_opt?: any) {}
  contains(_n: any) { return false; }
  replaceChildren(...items: MockNode[]) { this.children = items; }

  append(...items: MockNode[]) {
    this.children.push(...items);
  }
  querySelectorAll(sel: string): MockNode[] {
    const res: MockNode[] = [];
    if (sel.startsWith('.') && this.className.includes(sel.slice(1))) res.push(this);
    for (const c of this.children) res.push(...c.querySelectorAll(sel));
    return res;
  }
  querySelector(sel: string): MockNode | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}

(globalThis as any).document = {
  createElement: (tag: string) => {
    const n = new MockNode();
    n.tagName = tag.toUpperCase();
    return n;
  },
  createElementNS: (_ns: string, tag: string) => {
    const n = new MockNode();
    n.tagName = tag.toUpperCase();
    return n;
  },
  body: new MockNode(),
};

describe('Shop Item Equipping & Paperdoll Layer Rendering', () => {
  const cssPath = resolve(__dirname, '../src/townstyle.css');
  const css = readFileSync(cssPath, 'utf8');

  describe('1. Paperdoll & Doll Layer CSS Integrity', () => {
    it('configures .doll-stack with border-radius: 50% and overflow: hidden to frame hero oval cleanly', () => {
      expect(css).toContain('.sheet .hero-portrait .doll-stack');
      expect(css).toMatch(/border-radius:\s*50%/);
      expect(css).toMatch(/overflow:\s*hidden/);
    });

    it('ensures .doll-layer has background transparent, no box-shadow, and no border', () => {
      expect(css).toMatch(/\.doll-layer\s*\{[^}]*background:\s*transparent\s*!important/);
      expect(css).toMatch(/\.doll-layer\s*\{[^}]*border:\s*none\s*!important/);
      expect(css).toMatch(/\.doll-layer\s*\{[^}]*box-shadow:\s*none\s*!important/);
      expect(css).toMatch(/\.doll-layer\s*\{[^}]*mix-blend-mode:\s*normal/);
    });

    it('prevents .hero-portrait.trying from applying box-shadow to .doll-layer', () => {
      expect(css).not.toMatch(/\.hero-portrait\.trying img\s*\{\s*box-shadow/);
      expect(css).toMatch(/\.hero-portrait\.trying > img/);
    });

    it('defines .btn-equip-pack and .btn-unequip-pack styles in townstyle.css', () => {
      expect(css).toContain('.btn-equip-pack');
      expect(css).toContain('.btn-unequip-pack');
    });
  });

  describe('2. Paperdoll Data & buildDoll element structure', () => {
    it('sets up warrior-m gloves layer properly', () => {
      const set = dollSet(0, false); // warrior male
      expect(set).not.toBeNull();
      expect(set?.layers.gloves).toBeDefined();
      expect(set?.layers.gloves.file).toBe('warrior-m-gloves-gauntlet.png');
      expect(set?.layers.gloves.w).toBeGreaterThan(0);
      expect(set?.layers.gloves.h).toBeGreaterThan(0);
    });

    it('lookFor finds gloves for slot 7 (Slot.Gloves)', () => {
      const set = dollSet(0, false)!;
      const key = lookFor(set, Slot.Gloves, 1, 'Leather Gloves');
      expect(key).toBe('gloves');
    });

    it('buildDoll attaches clean inline styles without ugly backgrounds or borders', () => {
      const set = dollSet(0, false)!;
      const doll = buildDoll(set, [{ key: 'gloves', tier: 1 }], 'http://localhost/');
      expect(doll.className).toBe('doll-stack');
      const layers = doll.querySelectorAll('.doll-layer');
      expect(layers.length).toBe(1);
      const layer = layers[0] as unknown as MockNode;
      expect(layer.style.cssText ?? '').toContain('background:transparent');
      expect(layer.style.cssText ?? '').toContain('border:none');
      expect(layer.style.cssText ?? '').toContain('box-shadow:none');
    });
  });

  describe('3. TownUi Shop Equipping Integration', () => {
    let sim: Sim;
    let townUi: TownUi;
    let changedSpy: () => void;

    beforeEach(() => {
      const g = createMission(loadDoc(BUILT_IN.market), 1);
      sim = g.sim;
      createHero(sim, 0, 0, false, 1);
      changedSpy = vi.fn();
      const ctx: TownUiCtx = {
        sim: () => sim,
        pause: vi.fn(),
        changed: changedSpy,
        tipOn: vi.fn(),
        onOpen: vi.fn(),
        onShopEnter: vi.fn(),
        onShopLeave: vi.fn(),
      };
      townUi = new TownUi(ctx);
    });

    it('TownUi has equipItem and unequipSlot methods', () => {
      const proto = TownUi.prototype as any;
      expect(typeof proto.equipItem).toBe('function');
      expect(typeof proto.unequipSlot).toBe('function');
    });

    it('equips gloves directly from pack in shop and updates hero state', () => {
      const h = sim.hero!;
      const glovesId = itemId('Leather Gloves');
      expect(glovesId).toBeGreaterThanOrEqual(0);

      // Add gloves to hero inventory
      h.inv.push({ item: glovesId, n: 1 });
      h.eq[Slot.Gloves] = -1; // ensure slot is empty

      const townProto = townUi as any;
      townProto.town = 0; // index of Hearthspire
      townProto.equipItem(glovesId);

      // Verify gloves equipped into hero slot 7
      expect(h.eq[Slot.Gloves]).toBe(glovesId);
      // Verify gloves removed from pack
      expect(h.inv.find((s) => s.item === glovesId)).toBeUndefined();
      expect(changedSpy).toHaveBeenCalled();
    });

    it('unequips gloves back to pack when unequipSlot is called', () => {
      const h = sim.hero!;
      const glovesId = itemId('Leather Gloves');
      expect(glovesId).toBeGreaterThanOrEqual(0);

      h.eq[Slot.Gloves] = glovesId;
      h.inv = []; // empty pack

      const townProto = townUi as any;
      townProto.town = 0;
      townProto.unequipSlot(Slot.Gloves);

      // Verify slot is empty
      expect(h.eq[Slot.Gloves]).toBe(-1);
      // Verify gloves in pack
      expect(h.inv.find((s) => s.item === glovesId)).toBeDefined();
      expect(changedSpy).toHaveBeenCalled();
    });

    it('removes item from pending sell list if user decides to equip it instead', () => {
      const h = sim.hero!;
      const glovesId = itemId('Leather Gloves');
      expect(glovesId).toBeGreaterThanOrEqual(0);

      h.inv.push({ item: glovesId, n: 1 });
      h.eq[Slot.Gloves] = -1;

      const invSlot = h.inv.findIndex((s) => s.item === glovesId);
      const townProto = townUi as any;
      townProto.town = 0;
      townProto.sells = [invSlot]; // mark this slot for sell
      townProto.picks = [{ kind: 's', value: invSlot }];

      townProto.equipItem(glovesId);

      // Selling should be cancelled since item was equipped
      expect(townProto.sells).not.toContain(invSlot);
      expect(h.eq[Slot.Gloves]).toBe(glovesId);
    });
  });
});
