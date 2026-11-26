/**
 * D2R Resurrected PS5 Controller Support for Thornvael.
 *
 * Implements the authentic D2R console control scheme:
 * - 12 Skill / Action Bar Slots:
 *     * Primary Bar (when L2 is NOT held):
 *         - ✕ (Cross): Primary action / attack / spell / move (Slot 0)
 *         - ▢ (Square): Skill / spell 1 (Slot 1)
 *         - △ (Triangle): Skill / spell 2 (Slot 2)
 *         - ◯ (Circle): Skill / spell 3 (Slot 3)
 *         - R1: Skill / spell 4 (Slot 4)
 *         - R2: Skill / spell 5 (Slot 5)
 *     * Secondary Bar (when L2 is HELD as modifier):
 *         - L2 + ✕: Skill / spell 6 (Slot 6)
 *         - L2 + ▢: Skill / spell 7 (Slot 7)
 *         - L2 + △: Skill / spell 8 (Slot 8)
 *         - L2 + ◯: Skill / spell 9 (Slot 9)
 *         - L2 + R1: Skill / spell 10 (Slot 10)
 *         - L2 + R2: Skill / spell 11 (Slot 11)
 * - D-Pad (Belt Potions & Utility):
 *     * Up: Potion 1 (Healing Draught)
 *     * Right: Potion 2 (Mana Draught)
 *     * Down: Potion 3 (Rejuvenation / Buff)
 *     * Left: Potion 4 (Town Portal / Utility / Elixirs)
 * - Other Controls:
 *     * Left Stick: Direct 360° hero/squad movement (Run/Walk)
 *     * Right Stick: Camera pan / aiming
 *     * R3 (Right Stick Click): Highlight ground loot
 *     * Touchpad / Guide: Inventory / Character sheet
 *     * Share / Select: Quest journal
 *     * Options: Pause menu / Save and Exit
 *     * L1: Quick Skill Assignment menu / Hero select
 * - Skill Assignment UI:
 *     * Assign any known grimoire spell, hero class skill, or utility action to any of the 12 controller slots!
 */

import { SPELLS, } from './sim/spelldata';

export const DEFAULT_DEADZONE = 0.20;

export const BTN_CROSS = 0;       // ✕ / A
export const BTN_CIRCLE = 1;      // ◯ / B
export const BTN_SQUARE = 2;      // ▢ / X
export const BTN_TRIANGLE = 3;    // △ / Y
export const BTN_L1 = 4;          // LB
export const BTN_R1 = 5;          // RB
export const BTN_L2 = 6;          // LT (Secondary skill bar modifier)
export const BTN_R2 = 7;          // RT
export const BTN_SHARE = 8;       // Select / Back / View
export const BTN_OPTIONS = 9;     // Start / Menu
export const BTN_L3 = 10;
export const BTN_R3 = 11;         // Right stick press (Loot highlight)
export const BTN_DPAD_UP = 12;    // Potion 1 (Health)
export const BTN_DPAD_DOWN = 13;  // Potion 3 (Rejuv)
export const BTN_DPAD_LEFT = 14;  // Potion 4 (Portal / Utility)
export const BTN_DPAD_RIGHT = 15; // Potion 2 (Mana)
export const BTN_GUIDE = 16;      // PS button / Home
export const BTN_TOUCHPAD = 17;   // DualSense Touchpad click (Inventory)

export type ControllerSlotBinding =
  | { type: 'action'; action: 'attack' | 'move' | 'hold' | 'town_portal' | 'loot' }
  | { type: 'skill'; skillId: string; name: string; icon: string }
  | { type: 'spell'; spellId: number }
  | { type: 'empty' };

export interface D2RSlotMeta {
  index: number;
  label: string;
  badge: string;
  shortLabel: string;
  isSecondary: boolean;
  rawButton: number;
}

export const D2R_SLOTS: readonly D2RSlotMeta[] = [
  // Primary (No L2)
  { index: 0, label: '✕', badge: '✕', shortLabel: '✕', isSecondary: false, rawButton: BTN_CROSS },
  { index: 1, label: '▢', badge: '▢', shortLabel: '▢', isSecondary: false, rawButton: BTN_SQUARE },
  { index: 2, label: '△', badge: '△', shortLabel: '△', isSecondary: false, rawButton: BTN_TRIANGLE },
  { index: 3, label: '◯', badge: '◯', shortLabel: '◯', isSecondary: false, rawButton: BTN_CIRCLE },
  { index: 4, label: 'R1', badge: 'R1', shortLabel: 'R1', isSecondary: false, rawButton: BTN_R1 },
  { index: 5, label: 'R2', badge: 'R2', shortLabel: 'R2', isSecondary: false, rawButton: BTN_R2 },

  // Secondary (L2 Held)
  { index: 6, label: 'L2+✕', badge: 'L2+✕', shortLabel: '✕', isSecondary: true, rawButton: BTN_CROSS },
  { index: 7, label: 'L2+▢', badge: 'L2+▢', shortLabel: '▢', isSecondary: true, rawButton: BTN_SQUARE },
  { index: 8, label: 'L2+△', badge: 'L2+△', shortLabel: '△', isSecondary: true, rawButton: BTN_TRIANGLE },
  { index: 9, label: 'L2+◯', badge: 'L2+◯', shortLabel: '◯', isSecondary: true, rawButton: BTN_CIRCLE },
  { index: 10, label: 'L2+R1', badge: 'L2+R1', shortLabel: 'R1', isSecondary: true, rawButton: BTN_R1 },
  { index: 11, label: 'L2+R2', badge: 'L2+R2', shortLabel: 'R2', isSecondary: true, rawButton: BTN_R2 },
];

export const DEFAULT_D2R_BINDINGS: ControllerSlotBinding[] = [
  // Primary
  { type: 'action', action: 'attack' },      // 0: ✕ Primary Attack / Interact / Move
  { type: 'spell', spellId: 0 },             // 1: ▢ Fire Bolt / Skill 1
  { type: 'spell', spellId: 1 },             // 2: △ Fireball / Skill 2
  { type: 'spell', spellId: 7 },             // 3: ◯ Healing
  { type: 'spell', spellId: 9 },             // 4: R1 Lightning
  { type: 'spell', spellId: 17 },            // 5: R2 Poison Cloud

  // Secondary (L2 Held)
  { type: 'action', action: 'town_portal' }, // 6: L2 + ✕ Town Portal
  { type: 'spell', spellId: 19 },            // 7: L2 + ▢ Blessing
  { type: 'spell', spellId: 8 },             // 8: L2 + △ Shield
  { type: 'action', action: 'hold' },        // 9: L2 + ◯ Stand Ground
  { type: 'spell', spellId: 11 },            // 10: L2 + R1 Haste
  { type: 'spell', spellId: 15 },            // 11: L2 + R2 Stone Curse
];

const STORAGE_KEY = 'thornvael.d2r_bindings';

export function loadD2RBindings(): ControllerSlotBinding[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 12) {
          return parsed as ControllerSlotBinding[];
        }
      }
    }
  } catch {}
  return [...DEFAULT_D2R_BINDINGS];
}

export function saveD2RBindings(bindings: ControllerSlotBinding[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    }
  } catch {}
}

export interface GamepadHost {
  onCameraPan?: (dx: number, dy: number) => void;
  onExecuteSlot: (slotIdx: number, binding: ControllerSlotBinding) => void;
  onDrinkPotion: (slot: 1 | 2 | 3 | 4) => void;
  onToggleLootHighlight: () => void;
  onToggleInventory: () => void;
  onToggleQuestJournal: () => void;
  onTogglePauseMenu: () => void;
  onOpenSkillAssignment?: () => void;
  onSelectHero?: () => void;
  onL2StateChange?: (held: boolean) => void;
  toast?: (msg: string) => void;
  getKnownSpells?: () => number[];
  getHeroSkills?: () => Array<{ id: string; name: string; icon: string }>;
}

export interface GamepadOptions {
  deadzone?: number;
  autoStartLoop?: boolean;
  getGamepads?: () => (Gamepad | null)[];
}

export function applyDeadzone(x: number, y: number, deadzone = DEFAULT_DEADZONE): [number, number] {
  const mag = Math.hypot(x, y);
  if (mag <= deadzone || mag === 0) return [0, 0];
  const factor = Math.min(1, (mag - deadzone) / (1 - deadzone));
  return [(x / mag) * factor, (y / mag) * factor];
}

export function cleanGamepadName(id: string): string {
  if (!id) return 'Controller';
  let name = id.replace(/\s*\([^)]*STANDARD GAMEPAD[^)]*\)/gi, '');
  name = name.replace(/\s*\(Vendor:[^)]*\)/gi, '').trim();
  if (!name) name = id.trim();
  if (name.length > 36) {
    name = name.slice(0, 36).trim() + '...';
  }
  return name || 'Controller';
}

export class GamepadController {
  private readonly deadzone: number;
  private readonly prevButtons: boolean[] = [];
  private readonly getGamepadsFn?: () => (Gamepad | null)[];
  private leftStick: [number, number] = [0, 0];
  private rightStick: [number, number] = [0, 0];
  private rafId: number | null = null;
  private isDestroyed = false;
  private connectedCount = 0;
  private isL2Held = false;
  private bindings: ControllerSlotBinding[];

  private readonly onConnectHandler: (e: Event) => void;
  private readonly onDisconnectHandler: (e: Event) => void;

  constructor(
    private readonly host: GamepadHost,
    opts: GamepadOptions = {}
  ) {
    this.deadzone = opts.deadzone ?? DEFAULT_DEADZONE;
    this.getGamepadsFn = opts.getGamepads;
    this.bindings = loadD2RBindings();

    this.onConnectHandler = (e: Event) => {
      const gp = (e as GamepadEvent).gamepad;
      this.connectedCount++;
      const name = gp?.id ? cleanGamepadName(gp.id) : 'Controller';
      this.host.toast?.(`🎮 Controller connected: ${name}`);
    };

    this.onDisconnectHandler = (e: Event) => {
      const gp = (e as GamepadEvent).gamepad;
      this.connectedCount = Math.max(0, this.connectedCount - 1);
      const name = gp?.id ? cleanGamepadName(gp.id) : 'Controller';
      this.host.toast?.(`🎮 Controller disconnected: ${name}`);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', this.onConnectHandler);
      window.addEventListener('gamepaddisconnected', this.onDisconnectHandler);
    }

    if (opts.autoStartLoop) {
      this.start();
    }
  }

  get isSecondaryBarActive(): boolean {
    return this.isL2Held;
  }

  hasConnectedGamepad(): boolean {
    if (this.connectedCount > 0) return true;
    const list = this.getGamepadsFn
      ? this.getGamepadsFn()
      : typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
        ? Array.from(navigator.getGamepads())
        : [];
    return list.some((gp) => gp !== null && gp.connected !== false);
  }

  getBindings(): readonly ControllerSlotBinding[] {
    return this.bindings;
  }

  setBinding(slotIdx: number, binding: ControllerSlotBinding): void {
    if (slotIdx >= 0 && slotIdx < 12) {
      this.bindings[slotIdx] = binding;
      saveD2RBindings(this.bindings);
    }
  }

  resetBindings(): void {
    this.bindings = [...DEFAULT_D2R_BINDINGS];
    saveD2RBindings(this.bindings);
  }

  start(): void {
    if (this.rafId !== null || this.isDestroyed) return;
    const loop = () => {
      if (this.isDestroyed) return;
      this.poll();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    this.stop();
    if (typeof window !== 'undefined') {
      window.removeEventListener('gamepadconnected', this.onConnectHandler);
      window.removeEventListener('gamepaddisconnected', this.onDisconnectHandler);
    }
  }

  getMovementVector(): [number, number] {
    return this.leftStick;
  }

  getCameraPanVector(): [number, number] {
    return this.rightStick;
  }

  poll(): void {
    let gamepads: (Gamepad | null)[] | null = null;
    if (this.getGamepadsFn) {
      gamepads = this.getGamepadsFn();
    } else if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      gamepads = navigator.getGamepads();
    }
    if (!gamepads) return;

    let activePad: Gamepad | null = null;
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (gp && gp.connected) {
        activePad = gp;
        break;
      }
    }

    if (!activePad) {
      this.leftStick = [0, 0];
      this.rightStick = [0, 0];
      if (this.isL2Held) {
        this.isL2Held = false;
        this.host.onL2StateChange?.(false);
      }
      return;
    }

    // 1. Analog Sticks
    const lx = activePad.axes[0] ?? 0;
    const ly = activePad.axes[1] ?? 0;
    const rx = activePad.axes[2] ?? 0;
    const ry = activePad.axes[3] ?? 0;

    this.leftStick = applyDeadzone(lx, ly, this.deadzone);
    this.rightStick = applyDeadzone(rx, ry, this.deadzone);

    if (this.rightStick[0] !== 0 || this.rightStick[1] !== 0) {
      this.host.onCameraPan?.(this.rightStick[0], this.rightStick[1]);
    }

    // 2. L2 Modifier State (Secondary Action Bar)
    const l2Btn = activePad.buttons[BTN_L2];
    const isL2NowHeld = Boolean(l2Btn && (l2Btn.pressed || l2Btn.value > 0.4));
    if (isL2NowHeld !== this.isL2Held) {
      this.isL2Held = isL2NowHeld;
      this.host.onL2StateChange?.(this.isL2Held);
    }

    // 3. Process Edge-Triggered Buttons
    const buttons = activePad.buttons;
    const count = buttons.length;

    for (let i = 0; i < count; i++) {
      // Skip L2 here since it is handled continuously as a modifier above
      if (i === BTN_L2) continue;

      const btn = buttons[i];
      const isPressed = Boolean(btn && (btn.pressed || btn.value > 0.5));
      const wasPressed = this.prevButtons[i] ?? false;

      if (isPressed && !wasPressed) {
        this.dispatchButton(i);
      }

      this.prevButtons[i] = isPressed;
    }
  }

  private dispatchButton(btnIdx: number): void {
    const isSecondary = this.isL2Held;

    switch (btnIdx) {
      // --- D2R Action Buttons (✕, ▢, △, ◯, R1, R2) ---
      case BTN_CROSS: { // 0
        const slotIdx = isSecondary ? 6 : 0;
        this.host.onExecuteSlot(slotIdx, this.bindings[slotIdx]);
        break;
      }
      case BTN_SQUARE: { // 2
        const slotIdx = isSecondary ? 7 : 1;
        this.host.onExecuteSlot(slotIdx, this.bindings[slotIdx]);
        break;
      }
      case BTN_TRIANGLE: { // 3
        const slotIdx = isSecondary ? 8 : 2;
        this.host.onExecuteSlot(slotIdx, this.bindings[slotIdx]);
        break;
      }
      case BTN_CIRCLE: { // 1
        const slotIdx = isSecondary ? 9 : 3;
        this.host.onExecuteSlot(slotIdx, this.bindings[slotIdx]);
        break;
      }
      case BTN_R1: { // 5
        const slotIdx = isSecondary ? 10 : 4;
        this.host.onExecuteSlot(slotIdx, this.bindings[slotIdx]);
        break;
      }
      case BTN_R2: { // 7
        const slotIdx = isSecondary ? 11 : 5;
        this.host.onExecuteSlot(slotIdx, this.bindings[slotIdx]);
        break;
      }

      // --- D2R D-Pad Belt Potions ---
      case BTN_DPAD_UP: // 12 -> Potion 1 (Health)
        this.host.onDrinkPotion(1);
        break;
      case BTN_DPAD_RIGHT: // 15 -> Potion 2 (Mana)
        this.host.onDrinkPotion(2);
        break;
      case BTN_DPAD_DOWN: // 13 -> Potion 3 (Rejuv / Buff)
        this.host.onDrinkPotion(3);
        break;
      case BTN_DPAD_LEFT: // 14 -> Potion 4 (Portal / Utility / Elixirs)
        this.host.onDrinkPotion(4);
        break;

      // --- Other D2R Buttons ---
      case BTN_R3: // 11 -> Right stick press (Highlight Loot)
        this.host.onToggleLootHighlight();
        break;

      case BTN_L1: // 4 -> L1 Hero select / Open skill assignment
        if (this.host.onSelectHero) this.host.onSelectHero();
        else this.host.onOpenSkillAssignment?.();
        break;

      case BTN_TOUCHPAD: // 17 -> Character sheet / Inventory
      case BTN_GUIDE:    // 16
        this.host.onToggleInventory();
        break;

      case BTN_SHARE: // 8 -> Quest journal
        this.host.onToggleQuestJournal();
        break;

      case BTN_OPTIONS: // 9 -> Pause menu (Save and Exit)
        this.host.onTogglePauseMenu();
        break;
    }
  }
}

/**
 * Returns human-readable label and icon for a controller slot binding.
 */
export function getBindingDisplay(b: ControllerSlotBinding): { title: string; icon: string; cost?: number } {
  if (b.type === 'action') {
    switch (b.action) {
      case 'attack': return { title: 'Primary Attack / Move', icon: '⚔' };
      case 'move': return { title: 'Move Only', icon: '👟' };
      case 'hold': return { title: 'Stand Ground (Hold)', icon: '🛡' };
      case 'town_portal': return { title: 'Town Portal', icon: '🌀' };
      case 'loot': return { title: 'Highlight Loot', icon: '👁' };
    }
  }
  if (b.type === 'skill') {
    return { title: b.name, icon: b.icon };
  }
  if (b.type === 'spell') {
    const sp = SPELLS[b.spellId];
    if (sp) {
      const SPHERE_ICONS = ['', '🔥', '💧', '⚡', '🌍', '✨'];
      const icon = SPHERE_ICONS[sp.school] || '🔮';
      return { title: sp.name, icon, cost: sp.cost };
    }
    return { title: `Spell #${b.spellId}`, icon: '🔮' };
  }
  return { title: 'Empty', icon: '—' };
}

/**
 * D2R Skill Assignment Modal.
 * Allows binding spells, class skills, and actions to the 12 controller buttons.
 */
export class SkillAssignmentModal {
  private readonly root: HTMLElement;
  private selectedSlot = 0;

  constructor(
    private readonly controller: GamepadController,
    private readonly host: GamepadHost
  ) {
    let el = document.getElementById('d2r-skill-assignment-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'd2r-skill-assignment-modal';
      document.body.append(el);
    }
    this.root = el;
    this.root.className = 'pause-menu';
    this.root.hidden = true;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(initialSlot = 0): void {
    this.selectedSlot = initialSlot;
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  private render(): void {
    this.root.replaceChildren();

    const modal = document.createElement('div');
    modal.className = 'pause-modal d2r-skill-modal';
    modal.style.maxWidth = '780px';

    // Header
    const head = document.createElement('div');
    head.className = 'pause-head';

    const titleBox = document.createElement('div');
    titleBox.className = 'pause-title-box';

    const h2 = document.createElement('h2');
    h2.className = 'pause-title';
    h2.textContent = 'Controller Skill Assignment (Gamepad)';

    const divider = document.createElement('div');
    divider.className = 'gothic-divider';
    divider.innerHTML = '<span class="filigree-line"></span><span class="filigree-glyph">❖</span><span class="filigree-line"></span>';
    titleBox.append(h2, divider);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'pause-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => this.close();
    head.append(titleBox, closeBtn);

    // Body
    const body = document.createElement('div');
    body.className = 'pause-body';

    const note = document.createElement('p');
    note.className = 'pause-intro-note';
    note.textContent = 'Select a controller button below, then choose an action, spell, or hero skill to assign to it.';
    body.append(note);

    // 12 Controller Slots Grid
    const gridTitle = document.createElement('h3');
    gridTitle.className = 'pause-sec-title';
    gridTitle.innerHTML = '<span class="sec-icon">🎮</span> Controller Action Bar (12 Slots)';
    body.append(gridTitle);

    const slotContainer = document.createElement('div');
    slotContainer.style.display = 'grid';
    slotContainer.style.gridTemplateColumns = 'repeat(6, 1fr)';
    slotContainer.style.gap = '8px';
    slotContainer.style.marginBottom = '16px';

    const bindings = this.controller.getBindings();

    D2R_SLOTS.forEach((slot, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `d2r-slot-btn ${this.selectedSlot === idx ? 'selected' : ''}`;
      btn.style.display = 'flex';
      btn.style.flexDirection = 'column';
      btn.style.alignItems = 'center';
      btn.style.padding = '8px 4px';
      btn.style.background = this.selectedSlot === idx ? '#4a3319' : (slot.isSecondary ? '#19222a' : '#221915');
      btn.style.border = `2px solid ${this.selectedSlot === idx ? '#ffd54f' : '#6b4f2a'}`;
      btn.style.borderRadius = '6px';
      btn.style.cursor = 'pointer';
      btn.style.color = '#e0d8c3';

      const disp = getBindingDisplay(bindings[idx]);

      const badge = document.createElement('span');
      badge.className = 'gothic-kbd';
      badge.style.fontSize = '11px';
      badge.style.marginBottom = '4px';
      badge.textContent = slot.label;

      const icon = document.createElement('span');
      icon.style.fontSize = '20px';
      icon.textContent = disp.icon;

      const name = document.createElement('small');
      name.style.fontSize = '10px';
      name.style.whiteSpace = 'nowrap';
      name.style.overflow = 'hidden';
      name.style.textOverflow = 'ellipsis';
      name.style.maxWidth = '100%';
      name.textContent = disp.title;

      btn.append(badge, icon, name);
      btn.onclick = () => {
        this.selectedSlot = idx;
        this.render();
      };

      slotContainer.append(btn);
    });
    body.append(slotContainer);

    // Skills Picker for Selected Slot
    const targetSlotMeta = D2R_SLOTS[this.selectedSlot];
    const pickerTitle = document.createElement('h3');
    pickerTitle.className = 'pause-sec-title';
    pickerTitle.innerHTML = `<span class="sec-icon">⚡</span> Assign to Button: <strong style="color: #ffd54f">${targetSlotMeta.label}</strong>`;
    body.append(pickerTitle);

    const pickerList = document.createElement('div');
    pickerList.style.display = 'grid';
    pickerList.style.gridTemplateColumns = 'repeat(auto-fill, minmax(210px, 1fr))';
    pickerList.style.gap = '8px';
    pickerList.style.maxHeight = '280px';
    pickerList.style.overflowY = 'auto';
    pickerList.style.padding = '4px';

    const assignOption = (b: ControllerSlotBinding, label: string, icon: string, sub: string) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'pause-btn';
      item.style.padding = '8px 12px';
      item.style.minHeight = 'auto';
      item.onclick = () => {
        this.controller.setBinding(this.selectedSlot, b);
        this.host.toast?.(`🎮 Assigned ${label} to [${targetSlotMeta.label}]`);
        this.render();
      };

      const iconSpan = document.createElement('span');
      iconSpan.className = 'pause-btn-icon';
      iconSpan.textContent = icon;

      const textBox = document.createElement('div');
      textBox.className = 'pause-btn-text';

      const tSpan = document.createElement('span');
      tSpan.className = 'pause-btn-title';
      tSpan.style.fontSize = '13px';
      tSpan.textContent = label;

      const sSpan = document.createElement('small');
      sSpan.className = 'pause-btn-sub';
      sSpan.style.fontSize = '11px';
      sSpan.textContent = sub;

      textBox.append(tSpan, sSpan);
      item.append(iconSpan, textBox);
      pickerList.append(item);
    };

    // Standard Actions
    assignOption({ type: 'action', action: 'attack' }, 'Primary Attack / Move', '⚔', 'Target nearest foe or move');
    assignOption({ type: 'action', action: 'hold' }, 'Stand Ground', '🛡', 'Hold position and strike');
    assignOption({ type: 'action', action: 'town_portal' }, 'Town Portal', '🌀', 'Open portal to town');
    assignOption({ type: 'action', action: 'loot' }, 'Highlight Ground Loot', '👁', 'Toggle ground item pillars');

    // Hero Class Skills
    const heroSkills = this.host.getHeroSkills?.() || [];
    heroSkills.forEach((sk) => {
      assignOption({ type: 'skill', skillId: sk.id, name: sk.name, icon: sk.icon }, sk.name, sk.icon, 'Hero Class Special Ability');
    });

    // Learned Grimoire Spells
    const knownIds = this.host.getKnownSpells?.() || [0, 1, 4, 7, 8, 9, 11, 15, 17, 19];
    knownIds.forEach((sid) => {
      const sp = SPELLS[sid];
      if (sp) {
        const SPHERE_ICONS = ['', '🔥', '💧', '⚡', '🌍', '✨'];
        const icon = SPHERE_ICONS[sp.school] || '🔮';
        assignOption({ type: 'spell', spellId: sid }, sp.name, icon, `Mana: ${sp.cost} | Range: ${sp.reach || 12}`);
      }
    });

    body.append(pickerList);

    // Footer actions
    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.style.marginTop = '16px';
    footer.style.paddingTop = '12px';
    footer.style.borderTop = '1px solid #4a3822';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'pause-close-btn';
    resetBtn.style.padding = '6px 14px';
    resetBtn.style.fontSize = '12px';
    resetBtn.textContent = '↺ Reset to Default Bindings';
    resetBtn.onclick = () => {
      this.controller.resetBindings();
      this.host.toast?.('🎮 Controller bindings reset to defaults');
      this.render();
    };

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'pause-close-btn';
    doneBtn.style.padding = '6px 20px';
    doneBtn.style.fontSize = '13px';
    doneBtn.style.background = '#8a602a';
    doneBtn.textContent = 'Done (Close)';
    doneBtn.onclick = () => this.close();

    footer.append(resetBtn, doneBtn);
    body.append(footer);

    modal.append(head, body);
    this.root.append(modal);
  }
}

/**
 * On-Screen D2R Action Bar HUD widget.
 * Displays the 6 active skill icons (✕, ▢, △, ◯, R1, R2).
 * Flips smoothly to the secondary skills when L2 is held!
 */
export class D2RActionBarUi {
  private readonly root: HTMLElement;
  private isSecondary = false;
  private readonly onSyncHandler = (): void => {
    this.syncVisibility();
  };

  constructor(
    private readonly controller: GamepadController,
    private readonly onOpenModal: (slotIdx: number) => void
  ) {
    let el = document.getElementById('d2r-action-bar');
    if (!el) {
      el = document.createElement('div');
      el.id = 'd2r-action-bar';
      document.body.append(el);
    }
    this.root = el;
    this.root.className = 'd2r-action-bar';
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('gamepadconnected', this.onSyncHandler);
      window.addEventListener('gamepaddisconnected', this.onSyncHandler);
    }
    this.render();
  }

  syncVisibility(): void {
    const visible = this.controller.hasConnectedGamepad();
    this.root.hidden = !visible;
    if (this.root.style) {
      this.root.style.display = visible ? '' : 'none';
    }
  }

  destroy(): void {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('gamepadconnected', this.onSyncHandler);
      window.removeEventListener('gamepaddisconnected', this.onSyncHandler);
    }
  }

  setSecondary(secondary: boolean): void {
    if (this.isSecondary !== secondary) {
      this.isSecondary = secondary;
      this.render();
    }
  }

  render(): void {
    this.root.replaceChildren();
    this.syncVisibility();

    const startIdx = this.isSecondary ? 6 : 0;
    const bindings = this.controller.getBindings();

    for (let i = 0; i < 6; i++) {
      const slotIdx = startIdx + i;
      const slotMeta = D2R_SLOTS[slotIdx];
      const binding = bindings[slotIdx];
      const disp = getBindingDisplay(binding);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `d2r-hud-btn ${this.isSecondary ? 'secondary' : ''}`;
      btn.setAttribute('aria-label', `${slotMeta.label}: ${disp.title} (Click to rebind)`);
      btn.onclick = () => this.onOpenModal(slotIdx);

      const badge = document.createElement('span');
      badge.className = 'd2r-hud-badge';
      badge.textContent = slotMeta.shortLabel;

      const icon = document.createElement('span');
      icon.className = 'd2r-hud-icon';
      icon.textContent = disp.icon;

      btn.append(badge, icon);
      this.root.append(btn);
    }
  }
}
