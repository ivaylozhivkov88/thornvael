import { beforeEach, describe, expect, it, } from 'vitest';
import {
  applyDeadzone,
  cleanGamepadName,
  GamepadController,
  getBindingDisplay,
  SkillAssignmentModal,
  D2RActionBarUi,
  type ControllerSlotBinding,
  type GamepadHost,
  BTN_CROSS,
  BTN_CIRCLE,
  BTN_SQUARE,
  BTN_TRIANGLE,
  BTN_L1,
  BTN_R1,
  BTN_L2,
  BTN_R2,
  BTN_SHARE,
  BTN_OPTIONS,
  BTN_R3,
  BTN_DPAD_UP,
  BTN_DPAD_DOWN,
  BTN_DPAD_LEFT,
  BTN_DPAD_RIGHT,
  BTN_TOUCHPAD,
} from '../src/gamepad';

// Mock DOM Element for UI tests in Node environment
class MockElement {
  id = '';
  className = '';
  hidden = false;
  textContent = '';
  innerHTML = '';
  title = '';
  style: Record<string, string> = {};
  children: MockElement[] = [];
  onclick: ((e?: unknown) => void) | null = null;

  append(...items: Array<MockElement | string>) {
    items.forEach((item) => {
      if (typeof item !== 'string') this.children.push(item);
    });
  }

  replaceChildren(...items: Array<MockElement | string>) {
    this.children = [];
    this.append(...items);
  }

  setAttribute(_k: string, _v: string) {}
}

const mockDocElements: Record<string, MockElement> = {};

function setupDomMock() {
  if (typeof document === 'undefined') {
    (global as unknown as { document: unknown }).document = {
      createElement: () => new MockElement(),
      getElementById: (id: string) => {
        if (!mockDocElements[id]) {
          const el = new MockElement();
          el.id = id;
          mockDocElements[id] = el;
        }
        return mockDocElements[id];
      },
      body: {
        append: () => {},
      },
    };
  }
}

function createMockGamepad(opts?: {
  id?: string;
  connected?: boolean;
  axes?: number[];
  buttons?: Array<{ pressed: boolean; value: number }>;
}): Gamepad {
  const axes = opts?.axes ? [...opts.axes] : [0, 0, 0, 0];
  const rawButtons = opts?.buttons ?? [];
  const buttons: GamepadButton[] = Array(18)
    .fill(null)
    .map((_, i) => {
      const b = rawButtons[i];
      return { pressed: Boolean(b?.pressed), value: b?.value ?? (b?.pressed ? 1 : 0) } as GamepadButton;
    });

  return {
    id: opts?.id ?? 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
    connected: opts?.connected ?? true,
    index: 0,
    mapping: 'standard',
    timestamp: performance.now(),
    axes,
    buttons,
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe('Gamepad Deadzone & Name Cleaner', () => {
  it('applyDeadzone filters values below deadzone to zero', () => {
    expect(applyDeadzone(0, 0)).toEqual([0, 0]);
    expect(applyDeadzone(0.1, 0)).toEqual([0, 0]);
    expect(applyDeadzone(0, 0.15)).toEqual([0, 0]);
    // Diagonal magnitude: hypot(0.12, 0.12) = ~0.169 < 0.20
    expect(applyDeadzone(0.12, 0.12)).toEqual([0, 0]);
  });

  it('applyDeadzone scales values above deadzone smoothly from 0 to 1', () => {
    const [x, y] = applyDeadzone(1.0, 0, 0.2);
    expect(x).toBeCloseTo(1.0, 2);
    expect(y).toBe(0);

    const [midX] = applyDeadzone(0.6, 0, 0.2);
    // (0.6 - 0.2) / (1 - 0.2) = 0.4 / 0.8 = 0.5
    expect(midX).toBeCloseTo(0.5, 2);
  });

  it('cleanGamepadName simplifies verbose driver identifiers', () => {
    expect(cleanGamepadName('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe(
      'DualSense Wireless Controller'
    );
    expect(cleanGamepadName('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('Xbox 360 Controller');
    expect(cleanGamepadName('')).toBe('Controller');
  });
});

describe('D2R PS5 Controller Engine & Edge-Triggering', () => {
  let mockGamepad: Gamepad | null;
  let executedSlots: Array<{ slot: number; binding: ControllerSlotBinding }>;
  let potionsDrank: number[];
  let lootToggles: number;
  let inventoryToggles: number;
  let questToggles: number;
  let pauseToggles: number;
  let heroSelects: number;
  let cameraPans: Array<[number, number]>;
  let l2States: boolean[];
  let toasts: string[];
  let host: GamepadHost;

  beforeEach(() => {
    setupDomMock();
    mockGamepad = null;
    executedSlots = [];
    potionsDrank = [];
    lootToggles = 0;
    inventoryToggles = 0;
    questToggles = 0;
    pauseToggles = 0;
    heroSelects = 0;
    cameraPans = [];
    l2States = [];
    toasts = [];

    host = {
      onExecuteSlot: (slot, binding) => executedSlots.push({ slot, binding }),
      onDrinkPotion: (s) => potionsDrank.push(s),
      onToggleLootHighlight: () => lootToggles++,
      onToggleInventory: () => inventoryToggles++,
      onToggleQuestJournal: () => questToggles++,
      onTogglePauseMenu: () => pauseToggles++,
      onSelectHero: () => heroSelects++,
      onCameraPan: (dx, dy) => cameraPans.push([dx, dy]),
      onL2StateChange: (held) => l2States.push(held),
      toast: (msg) => toasts.push(msg),
    };
  });

  const makeController = () =>
    new GamepadController(host, {
      getGamepads: () => (mockGamepad ? [mockGamepad] : []),
    });

  it('dispatches primary action bar slots (0-5) when L2 is not held', () => {
    const controller = makeController();

    // Press ✕ (Button 0)
    const buttons = Array(18).fill({ pressed: false, value: 0 });
    buttons[BTN_CROSS] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });

    controller.poll();
    expect(executedSlots).toHaveLength(1);
    expect(executedSlots[0].slot).toBe(0); // ✕ -> Slot 0

    // Press ▢ (Button 2)
    buttons[BTN_CROSS] = { pressed: false, value: 0 };
    buttons[BTN_SQUARE] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(executedSlots).toHaveLength(2);
    expect(executedSlots[1].slot).toBe(1); // ▢ -> Slot 1

    // Press △ (Button 3)
    buttons[BTN_SQUARE] = { pressed: false, value: 0 };
    buttons[BTN_TRIANGLE] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(executedSlots[2].slot).toBe(2); // △ -> Slot 2

    // Press ◯ (Button 1)
    buttons[BTN_TRIANGLE] = { pressed: false, value: 0 };
    buttons[BTN_CIRCLE] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(executedSlots[3].slot).toBe(3); // ◯ -> Slot 3

    // Press R1 (Button 5)
    buttons[BTN_CIRCLE] = { pressed: false, value: 0 };
    buttons[BTN_R1] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(executedSlots[4].slot).toBe(4); // R1 -> Slot 4

    // Press R2 (Button 7)
    buttons[BTN_R1] = { pressed: false, value: 0 };
    buttons[BTN_R2] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(executedSlots[5].slot).toBe(5); // R2 -> Slot 5
  });

  it('dispatches secondary action bar slots (6-11) when L2 is held', () => {
    const controller = makeController();

    const buttons = Array(18).fill({ pressed: false, value: 0 });
    // Hold L2 (Button 6)
    buttons[BTN_L2] = { pressed: true, value: 1 };

    // Press L2 + ✕ (Button 0)
    buttons[BTN_CROSS] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });

    controller.poll();
    expect(controller.isSecondaryBarActive).toBe(true);
    expect(l2States).toContain(true);
    expect(executedSlots[0].slot).toBe(6); // L2 + ✕ -> Slot 6

    // Press L2 + ▢ (Button 2)
    buttons[BTN_CROSS] = { pressed: false, value: 0 };
    buttons[BTN_SQUARE] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(executedSlots[1].slot).toBe(7); // L2 + ▢ -> Slot 7

    // Press L2 + △ (Button 3)
    buttons[BTN_SQUARE] = { pressed: false, value: 0 };
    buttons[BTN_TRIANGLE] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(executedSlots[2].slot).toBe(8); // L2 + △ -> Slot 8

    // Press L2 + ◯ (Button 1)
    buttons[BTN_TRIANGLE] = { pressed: false, value: 0 };
    buttons[BTN_CIRCLE] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(executedSlots[3].slot).toBe(9); // L2 + ◯ -> Slot 9

    // Press L2 + R1 (Button 5)
    buttons[BTN_CIRCLE] = { pressed: false, value: 0 };
    buttons[BTN_R1] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(executedSlots[4].slot).toBe(10); // L2 + R1 -> Slot 10

    // Press L2 + R2 (Button 7)
    buttons[BTN_R1] = { pressed: false, value: 0 };
    buttons[BTN_R2] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(executedSlots[5].slot).toBe(11); // L2 + R2 -> Slot 11

    // Release L2
    buttons[BTN_L2] = { pressed: false, value: 0 };
    buttons[BTN_R2] = { pressed: false, value: 0 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(controller.isSecondaryBarActive).toBe(false);
    expect(l2States.at(-1)).toBe(false);
  });

  it('guarantees strict edge-triggering so held buttons do not fire continuously', () => {
    const controller = makeController();

    const buttons = Array(18).fill({ pressed: false, value: 0 });
    buttons[BTN_CROSS] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });

    // Poll frame 1: button pressed
    controller.poll();
    expect(executedSlots).toHaveLength(1);

    // Poll frames 2 to 10 with button continuously held down
    for (let i = 0; i < 9; i++) {
      controller.poll();
    }
    expect(executedSlots).toHaveLength(1); // STILL exactly 1! Never spammed at 60Hz

    // Release button
    buttons[BTN_CROSS] = { pressed: false, value: 0 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(executedSlots).toHaveLength(1);

    // Press button again
    buttons[BTN_CROSS] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(executedSlots).toHaveLength(2); // Fires second distinct command!
  });

  it('maps D-Pad to Belt Potions 1-4 accurately', () => {
    const controller = makeController();
    const buttons = Array(18).fill({ pressed: false, value: 0 });

    // D-Pad Up (12) -> Potion 1 (Health)
    buttons[BTN_DPAD_UP] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(potionsDrank).toEqual([1]);

    // D-Pad Right (15) -> Potion 2 (Mana)
    buttons[BTN_DPAD_UP] = { pressed: false, value: 0 };
    buttons[BTN_DPAD_RIGHT] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(potionsDrank).toEqual([1, 2]);

    // D-Pad Down (13) -> Potion 3 (Rejuv)
    buttons[BTN_DPAD_RIGHT] = { pressed: false, value: 0 };
    buttons[BTN_DPAD_DOWN] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(potionsDrank).toEqual([1, 2, 3]);

    // D-Pad Left (14) -> Potion 4 (Utility / Portal)
    buttons[BTN_DPAD_DOWN] = { pressed: false, value: 0 };
    buttons[BTN_DPAD_LEFT] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(potionsDrank).toEqual([1, 2, 3, 4]);
  });

  it('triggers utility buttons: R3 (Loot), Touchpad (Inventory), Options (Pause), Share (Quests), L1 (Hero)', () => {
    const controller = makeController();
    const buttons = Array(18).fill({ pressed: false, value: 0 });

    // R3 (11)
    buttons[BTN_R3] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(lootToggles).toBe(1);

    // Touchpad (17)
    buttons[BTN_R3] = { pressed: false, value: 0 };
    buttons[BTN_TOUCHPAD] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(inventoryToggles).toBe(1);

    // Options (9)
    buttons[BTN_TOUCHPAD] = { pressed: false, value: 0 };
    buttons[BTN_OPTIONS] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(pauseToggles).toBe(1);

    // Share (8)
    buttons[BTN_OPTIONS] = { pressed: false, value: 0 };
    buttons[BTN_SHARE] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(questToggles).toBe(1);

    // L1 (4)
    buttons[BTN_SHARE] = { pressed: false, value: 0 };
    buttons[BTN_L1] = { pressed: true, value: 1 };
    mockGamepad = createMockGamepad({ buttons });
    controller.poll();
    expect(heroSelects).toBe(1);
  });

  it('handles analog sticks for movement and camera pan', () => {
    const controller = makeController();

    // Neutral sticks
    mockGamepad = createMockGamepad({ axes: [0.05, -0.05, 0, 0] });
    controller.poll();
    expect(controller.getMovementVector()).toEqual([0, 0]);
    expect(cameraPans).toHaveLength(0);

    // Deflected Left Stick (Move)
    mockGamepad = createMockGamepad({ axes: [0.8, -0.6, 0, 0] });
    controller.poll();
    const [mvX, mvY] = controller.getMovementVector();
    expect(mvX).toBeGreaterThan(0.6);
    expect(mvY).toBeLessThan(-0.4);

    // Deflected Right Stick (Camera Pan)
    mockGamepad = createMockGamepad({ axes: [0, 0, 0.7, 0.5] });
    controller.poll();
    expect(cameraPans.length).toBeGreaterThan(0);
    const [panX, panY] = cameraPans[0];
    expect(panX).toBeGreaterThan(0.5);
    expect(panY).toBeGreaterThan(0.3);
  });

  it('manages slot bindings customization and display labels', () => {
    const controller = makeController();
    const initial = controller.getBindings();
    expect(initial).toHaveLength(12);

    // Change binding of Slot 1 to Town Portal
    controller.setBinding(1, { type: 'action', action: 'town_portal' });
    expect(controller.getBindings()[1]).toEqual({ type: 'action', action: 'town_portal' });

    const disp = getBindingDisplay({ type: 'action', action: 'town_portal' });
    expect(disp.title).toBe('Town Portal');
    expect(disp.icon).toBe('🌀');

    // Reset bindings back to defaults
    controller.resetBindings();
    expect(controller.getBindings()[1]).toEqual({ type: 'spell', spellId: 0 });
  });

  it('renders SkillAssignmentModal and D2RActionBarUi properly', () => {
    const controller = makeController();

    const modal = new SkillAssignmentModal(controller, host);
    expect(modal.isOpen).toBe(false);
    modal.open(2);
    expect(modal.isOpen).toBe(true);
    modal.close();
    expect(modal.isOpen).toBe(false);

    const bar = new D2RActionBarUi(controller, (_slot) => {
      // modal trigger callback verified via type contract
    });

    // Hidden by default when no physical gamepad is connected
    expect(controller.hasConnectedGamepad()).toBe(false);
    const barEl = document.getElementById('d2r-action-bar')!;
    expect(barEl.hidden).toBe(true);
    expect(barEl.style.display).toBe('none');

    // Shows automatically when a gamepad connects
    mockGamepad = createMockGamepad();
    bar.syncVisibility();
    expect(controller.hasConnectedGamepad()).toBe(true);
    expect(barEl.hidden).toBe(false);
    expect(barEl.style.display).toBe('');

    // Test secondary toggle on action bar
    bar.setSecondary(true);
    bar.setSecondary(false);
    bar.destroy();
    expect(bar).toBeDefined();
  });
});
