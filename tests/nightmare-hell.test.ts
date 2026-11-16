import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DIFFICULTY_CALIBRATIONS,
  getDifficultyTier,
  getDifficultyCalibration,
  calculateCalibratedResist,
} from '../src/sim/balance';
import { FOE_PCT, evaluateQualityHierarchy } from '../src/sim/hero';
import { ITEMS, Ik, Slot } from '../src/sim/items';

// Minimal DOM & Storage mock for Vitest Node environment
class MockDOMElement {
  public id = '';
  public className = '';
  public style: Record<string, string> = {};
  public children: MockDOMElement[] = [];
  public parentElement: MockDOMElement | null = null;
  public eventListeners: Record<string, Function[]> = {};

  append(...children: MockDOMElement[]) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  addEventListener(type: string, handler: Function) {
    if (!this.eventListeners[type]) this.eventListeners[type] = [];
    this.eventListeners[type].push(handler);
  }

  removeEventListener(type: string, handler: Function) {
    if (!this.eventListeners[type]) return;
    this.eventListeners[type] = this.eventListeners[type].filter((h) => h !== handler);
  }

  setPointerCapture() {}
  releasePointerCapture() {}

  getBoundingClientRect() {
    return { left: 10, top: 10, width: 100, height: 100, right: 110, bottom: 110 };
  }

  querySelector(sel: string): MockDOMElement | null {
    const cls = sel.replace('.', '');
    const find = (el: MockDOMElement): MockDOMElement | null => {
      if (el.className.includes(cls)) return el;
      for (const c of el.children) {
        const res = find(c);
        if (res) return res;
      }
      return null;
    };
    return find(this);
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx >= 0) this.parentElement.children.splice(idx, 1);
      this.parentElement = null;
    }
  }
}

const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => {
    mockStorage[key] = String(val);
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  },
};

const mockBody = new MockDOMElement();
const mockDocument = {
  body: mockBody,
  createElement: () => new MockDOMElement(),
};

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).document = mockDocument;

// Dynamically import classes that touch DOM/storage
const { VirtualStick } = await import('../src/virtualstick');
const { KeybindManager, DEFAULT_KEYBINDS } = await import('../src/keybinds');

describe('Phase 11: Nightmare & Hell End-Game Calibration', () => {
  describe('Difficulty Calibration Tiers & Multipliers', () => {
    it('correctly maps various difficulty inputs to tiers', () => {
      expect(getDifficultyTier(0)).toBe('normal');
      expect(getDifficultyTier(1)).toBe('normal');
      expect(getDifficultyTier(2)).toBe('nightmare');
      expect(getDifficultyTier(3)).toBe('hell');

      expect(getDifficultyTier('normal')).toBe('normal');
      expect(getDifficultyTier('easy')).toBe('normal');
      expect(getDifficultyTier('Nightmare')).toBe('nightmare');
      expect(getDifficultyTier('Hard')).toBe('nightmare');
      expect(getDifficultyTier('HELL')).toBe('hell');
      expect(getDifficultyTier(undefined)).toBe('normal');
    });

    it('defines exact calibration values for Nightmare and Hell', () => {
      const normal = getDifficultyCalibration('normal');
      expect(normal.monsterHpMult).toBe(1.0);
      expect(normal.monsterDmgMult).toBe(1.0);
      expect(normal.allResistBonus).toBe(0);
      expect(normal.championElementalImmunity).toBe(false);
      expect(normal.uniqueDropMult).toBe(1.0);
      expect(normal.setDropMult).toBe(1.0);

      const nightmare = getDifficultyCalibration('nightmare');
      expect(nightmare.monsterHpMult).toBe(1.5);
      expect(nightmare.monsterDmgMult).toBe(1.5);
      expect(nightmare.allResistBonus).toBe(25);
      expect(nightmare.championElementalImmunity).toBe(false);
      expect(nightmare.uniqueDropMult).toBe(1.5);
      expect(nightmare.setDropMult).toBe(1.4);

      const hell = getDifficultyCalibration('hell');
      expect(hell.monsterHpMult).toBe(2.2);
      expect(hell.monsterDmgMult).toBe(2.2);
      expect(hell.allResistBonus).toBe(50);
      expect(hell.championElementalImmunity).toBe(true);
      expect(hell.uniqueDropMult).toBe(2.2);
      expect(hell.setDropMult).toBe(1.8);
    });

    it('matches FOE_PCT health multipliers across difficulty indices', () => {
      // 0: Easy (75%), 1: Normal (100%), 2: Nightmare (150%), 3: Hell (220%)
      expect(FOE_PCT[0]).toBe(75);
      expect(FOE_PCT[1]).toBe(100);
      expect(FOE_PCT[2]).toBe(150);
      expect(FOE_PCT[3]).toBe(220);
    });
  });

  describe('Resistance Calibration & Champion Immunities', () => {
    it('applies baseline resistance to foes on normal difficulty', () => {
      // Imp base water resist is -30 (weakness)
      const resWeak = calculateCalibratedResist(-30, 2, 10, true, false, 'normal');
      expect(resWeak).toBe(-30);

      const resNormal = calculateCalibratedResist(40, 1, 10, true, false, 'normal');
      expect(resNormal).toBe(40);

      // Capped at 90 on normal
      const resHigh = calculateCalibratedResist(95, 1, 10, true, false, 'normal');
      expect(resHigh).toBe(90);
    });

    it('does not modify friendly unit resistances based on foe difficulty', () => {
      const resFriend = calculateCalibratedResist(20, 1, 0, false, false, 'hell');
      expect(resFriend).toBe(20);
    });

    it('applies +25 resist bonus in Nightmare mode', () => {
      const res = calculateCalibratedResist(20, 1, 10, true, false, 'nightmare');
      expect(res).toBe(45); // 20 + 25

      const capped = calculateCalibratedResist(70, 1, 10, true, false, 'nightmare');
      expect(capped).toBe(90); // 70 + 25 = 95 -> capped at 90
    });

    it('applies +50 resist bonus in Hell mode', () => {
      const res = calculateCalibratedResist(20, 1, 10, true, false, 'hell');
      expect(res).toBe(70); // 20 + 50

      const capped = calculateCalibratedResist(50, 1, 10, true, false, 'hell');
      expect(capped).toBe(90); // 50 + 50 = 100 -> capped at 90 for non-immune element
    });

    it('grants 100% elemental immunity to Hell champions and bosses on their aligned element', () => {
      // Aligned element formula: (unitId % 5) + 1
      // If unitId = 12: 12 % 5 = 2 -> 2 + 1 = 3 (Air)
      const unitId = 12;
      const airElem = 3;
      const fireElem = 1;

      // Air is the immune element
      const resAir = calculateCalibratedResist(20, airElem, unitId, true, true, 'hell');
      expect(resAir).toBe(100);

      // Fire is not the immune element -> 20 + 50 = 70
      const resFire = calculateCalibratedResist(20, fireElem, unitId, true, true, 'hell');
      expect(resFire).toBe(70);

      // In Nightmare, champion immunity is false, so it should be capped at 90
      const resNightmare = calculateCalibratedResist(80, airElem, unitId, true, true, 'nightmare');
      expect(resNightmare).toBe(90); // 80 + 25 = 105 -> capped at 90
    });
  });

  describe('Unique and Set Drop Rate Scaling', () => {
    const swordId = ITEMS.findIndex((d) => d.kind === Ik.Gear && d.slot === Slot.Weapon);

    it('evaluates to Unique when Unique check succeeds on all difficulties', () => {
      const normalResult = evaluateQualityHierarchy(swordId, 5, 'boss', 100, () => 0, 'normal');
      const hellResult = evaluateQualityHierarchy(swordId, 5, 'boss', 100, () => 0, 'hell');

      expect(normalResult.quality).toBe('unique');
      expect(hellResult.quality).toBe('unique');
    });

    it('applies difficulty unique drop multipliers to scale drop chance', () => {
      const normalCal = getDifficultyCalibration('normal');
      const nightmareCal = getDifficultyCalibration('nightmare');
      const hellCal = getDifficultyCalibration('hell');

      expect(nightmareCal.uniqueDropMult).toBeGreaterThan(normalCal.uniqueDropMult);
      expect(hellCal.uniqueDropMult).toBeGreaterThan(nightmareCal.uniqueDropMult);
      expect(nightmareCal.setDropMult).toBeGreaterThan(normalCal.setDropMult);
      expect(hellCal.setDropMult).toBeGreaterThan(nightmareCal.setDropMult);
    });
  });
});

describe('Phase 11: Mobile Virtual Analog Stick & Keybind Manager', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockBody.children = [];
  });

  describe('Virtual Analog Stick', () => {
    it('initializes with container, base, ring, and thumb elements', () => {
      const stick = new VirtualStick();
      expect(stick.root).toBeDefined();
      expect(stick.root.id).toBe('virtual-stick-container');
      expect(stick.root.querySelector('.virtual-stick-base')).toBeTruthy();
      expect(stick.root.querySelector('.virtual-stick-thumb')).toBeTruthy();
      expect(stick.root.querySelector('.virtual-stick-ring')).toBeTruthy();
      stick.destroy();
    });

    it('reports (0, 0) movement vector when idle', () => {
      const stick = new VirtualStick();
      const [dx, dy] = stick.getMovementVector();
      expect(dx).toBe(0);
      expect(dy).toBe(0);
      stick.destroy();
    });

    it('can be explicitly enabled or disabled', () => {
      const stick = new VirtualStick();
      stick.setEnabled(false);
      expect(stick.isEnabled()).toBe(false);
      expect(stick.root.style.display).toBe('none');

      stick.setEnabled(true);
      expect(stick.isEnabled()).toBe(true);
      expect(stick.root.style.display).toBe('block');
      stick.destroy();
    });
  });

  describe('KeybindManager Custom Rebinding & Persistence', () => {
    it('loads all default action keybindings initially', () => {
      const manager = new KeybindManager();
      for (const action of DEFAULT_KEYBINDS) {
        const bind = manager.getBinding(action.id);
        expect(bind.code).toBe(action.defaultCode);
        expect(bind.key).toBe(action.defaultKey);
      }
    });

    it('matches keybind by code or key name', () => {
      const manager = new KeybindManager();
      expect(manager.matches('moveUp', 'KeyW', 'w')).toBe(true);
      expect(manager.matches('moveUp', 'KeyW', 'W')).toBe(true);
      expect(manager.matches('moveUp', 'KeyX', 'x')).toBe(false);
      expect(manager.matches('quests', 'KeyQ', 'q')).toBe(true);
    });

    it('allows rebinding an action and persists to localStorage', () => {
      const manager = new KeybindManager();
      manager.setBinding('quests', 'J', 'KeyJ');

      expect(manager.getBinding('quests')).toEqual({ key: 'J', code: 'KeyJ' });
      expect(manager.matches('quests', 'KeyJ', 'j')).toBe(true);
      expect(manager.matches('quests', 'KeyQ', 'q')).toBe(false);

      // Verify persistence by loading into a new manager instance
      const reloaded = new KeybindManager();
      expect(reloaded.getBinding('quests')).toEqual({ key: 'J', code: 'KeyJ' });
    });

    it('resets custom keybindings back to defaults', () => {
      const manager = new KeybindManager();
      manager.setBinding('inventory', 'B', 'KeyB');
      expect(manager.getBinding('inventory').code).toBe('KeyB');

      manager.resetDefaults();
      expect(manager.getBinding('inventory').code).toBe('KeyI');
      expect(manager.getBinding('inventory').key).toBe('I');
    });
  });
});
