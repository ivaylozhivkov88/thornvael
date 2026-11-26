import { unlock } from './audio';
import { pickUnit, type GestureRecognizer, type Intent } from './input';
import { keybindManager } from './keybinds';
import type { LoadedMission } from './mapdoc';
import { lootPos, nearestLoot } from './sim/combat';
import type { D2Interactable, D2InteractionController } from './sim/movement';
import { FP, type Sim } from './sim/sim';
import { performLootSweep } from './sim/tactics';
import { S } from './strings';
import { RadialMenu, type RadialOrder } from './touchx';
import type { View } from './render';

export type ControlMode = 'wasd' | 'mouse';
export type InputArmKind = 'move' | 'attack' | 'guard' | 'defend' | 'spell' | 'pickup';

const CLASSIC_ORDER_KEYS: Record<string, string> = {
  m: 'move',
  a: 'attack',
  g: 'guard',
  d: 'defend',
  c: 'cast',
  w: 'swarm',
  h: 'hold',
  r: 'retreat',
  s: 'still',
  p: 'pickup',
};
const WASD_ORDER_KEYS: Record<string, string> = {
  m: 'move',
  g: 'guard',
  c: 'cast',
  h: 'hold',
  r: 'retreat',
  p: 'pickup',
};

export interface InputControllerContext {
  canvas: HTMLCanvasElement;
  pickRadius: number;
  getSim: () => Sim;
  getLoadedMission: () => LoadedMission | null;
  toTile: (sx: number, sy: number) => [number, number];
  centerOnTile: (tx: number, ty: number) => void;
  posEnemy: (id: number) => [number, number] | null;
  posMine: (id: number) => [number, number] | null;
  unitAt: (x: number, y: number, r: number) => number;
  alive: (id: number) => boolean;
  px: (id: number) => number;
  py: (id: number) => number;
  selectedIds: () => number[];
  d2Controller: D2InteractionController;
  recognizer: GestureRecognizer;
  handleIntent: (intents: Intent[]) => void;
  mods: { alt: boolean; ctrl: boolean };
  getAltMobileToggle: () => boolean;
  updateAltButtonStates: (active: boolean) => void;
  getArmed: () => InputArmKind | null;
  arm: (kind: InputArmKind | null) => void;
  getArmedSpell: () => number;
  aimInfo: (spell: number, sx: number, sy: number) => View['aim'];
  setAimView: (aim: View['aim']) => void;
  forced: () => number;
  setHover: (hover: View['hover']) => void;
  setHoveredUnit: (unit: number | null) => void;
  setBoxDrag: (box: View['box']) => void;
  getOutcome: () => 'win' | 'lose' | null;
  hideTip: () => void;
  scheduleHoldTipHide: () => void;
  orderButton: (order: string) => void;
  executeOrder: (order: InputArmKind, x: number, y: number) => void;
  isDialogueOpen: () => boolean;
  advanceDialogue: () => void;
  selectStance: (stance: number) => void;
  isJournalOpen: () => boolean;
  closeJournal: () => void;
  isHeroCreating: () => boolean;
  toggleAutomap: () => void;
  regroupSquad: () => void;
  toggleRun: () => void;
  setCameraFollow: (follow: boolean) => void;
  drinkBelt: (slot: number) => void;
  groupKey: (group: number, mode: 'set' | 'add' | 'recall') => void;
  canToggleDebugF3: () => boolean;
  toggleDebugF3: () => void;
  toggleAuto: () => void;
  castSlot: (slot: number) => void;
  isPauseMenuOpen: () => boolean;
  handlePauseMenuEscape: () => boolean;
  closePauseMenu: () => void;
  togglePauseMenu: () => void;
  togglePause: () => void;
  isTownOpen: () => boolean;
  closeTownUi: () => void;
  isSaveOpen: () => boolean;
  closeSaveUi: () => void;
  isBookOpen: () => boolean;
  closeBook: () => void;
  openBook: (spellId: number) => void;
  isHeroUiOpen: () => boolean;
  closeHeroUi: () => void;
  toggleHeroStats: () => void;
  toggleHeroInventory: () => void;
  toggleObjectivesOrQuests: () => void;
  toggleQuestLog: () => void;
  toggleMinimap: () => void;
  triggerHeroSkill: (idx: number) => void;
  toggleLoose: () => void;
  orderPickupLoot: (lootId: number) => void;
  hasActiveRmb?: () => boolean;
}

export interface InputControllerHandle {
  resetDesktopInput: () => void;
  isHoldShown: () => boolean;
  getPointerAt: () => [number, number] | null;
  getLastPointerPos: () => [number, number];
  heldMoveKeys: Set<string>;
  keys: Set<string>;
  getControlMode: () => ControlMode;
  setControlMode: (mode: ControlMode) => void;
}

export function createInputController(ctx: InputControllerContext): InputControllerHandle {
  const { canvas } = ctx;
  const local = (e: PointerEvent | WheelEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  let controlMode: ControlMode = (localStorage.getItem('thornvael.controls') as ControlMode) || 'wasd';
  let downAt: [number, number] | null = null;
  let holdPoint: [number, number] = [0, 0];
  let holdShown = false;
  let tipTimer = 0;
  let pointerAt: [number, number] | null = null;
  let lastPointerPos: [number, number] = [0, 0];
  const keys = new Set<string>();
  const heldMoveKeys = new Set<string>();

  const radial = new RadialMenu(document.body, (o: RadialOrder) => {
    if (o === 'hold' || o === 'retreat') ctx.orderButton(o);
    else ctx.executeOrder(o, holdPoint[0], holdPoint[1]);
  });

  function updateHover(x: number, y: number): void {
    const sim = ctx.getSim();
    pointerAt = [x, y];
    const enemy = pickUnit(sim.count, ctx.posEnemy, x, y, ctx.pickRadius);
    const mine = pickUnit(sim.count, ctx.posMine, x, y, ctx.pickRadius);
    const haveSel = ctx.selectedIds().length > 0;
    const armed = ctx.getArmed();
    let ok = false;
    let cursor = '';
    if (armed === 'spell') {
      const aim = ctx.aimInfo(ctx.getArmedSpell(), x, y);
      ctx.setAimView(aim);
      ok = Boolean(aim?.ok);
      cursor = ok ? 'crosshair' : 'not-allowed';
    } else if (armed) {
      if (armed === 'defend') ok = mine >= 0;
      else if (armed === 'pickup') {
        const [tx, ty] = ctx.toTile(x, y);
        ok = nearestLoot(sim, Math.round(tx * FP), Math.round(ty * FP), 2 * FP) >= 0;
      } else ok = true;
      cursor = ok ? 'crosshair' : 'not-allowed';
    } else if (enemy >= 0 && haveSel && ctx.forced() !== 1) {
      ok = true;
      cursor = 'crosshair';
    } else if (mine >= 0) cursor = 'pointer';
    canvas.style.cursor = cursor;
    const shown = enemy >= 0 ? enemy : mine;
    ctx.setHover(enemy >= 0 && (armed === null || armed === 'attack') ? { id: enemy, ok } : null);
    ctx.setHoveredUnit(shown >= 0 ? shown : null);
    ctx.hideTip();
  }

  function resetDesktopInput(): void {
    ctx.d2Controller.reset();
    heldMoveKeys.clear();
    keys.clear();
    ctx.mods.alt = false;
    ctx.mods.ctrl = false;
    ctx.updateAltButtonStates(ctx.getAltMobileToggle());
    pointerAt = null;
    ctx.setHoveredUnit(null);
    ctx.handleIntent(ctx.recognizer.cancel());
    ctx.setBoxDrag(null);
    downAt = null;
    clearTimeout(tipTimer);
    ctx.hideTip();
    radial.hide();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 1) e.preventDefault();
    unlock();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // synthetic pointer ids (tests) cannot be captured
    }
    ctx.mods.alt = e.altKey;
    ctx.mods.ctrl = e.ctrlKey || e.metaKey;
    const [x, y] = local(e);
    const [wx, wy] = ctx.toTile(x, y);
    const sim = ctx.getSim();
    const loadedMission = ctx.getLoadedMission();

    // The right button casts when a spell or skill sits on it; it must not also steer the hero.
    const rmbCasts = e.button === 2 && !e.shiftKey && Boolean(ctx.hasActiveRmb?.());
    if (controlMode === 'wasd' && e.pointerType === 'mouse' && (e.button === 0 || e.button === 2) && !rmbCasts) {
      const enemy = pickUnit(sim.count, ctx.posEnemy, x, y, ctx.pickRadius);
      const loot = nearestLoot(sim, Math.round(wx * FP), Math.round(wy * FP), 2.0 * FP);
      let interactable: D2Interactable | undefined;
      if (loot >= 0) {
        const [lx, ly] = lootPos(sim, loot);
        interactable = { type: 'item', x: lx / FP, y: ly / FP, id: loot };
      } else if (loadedMission?.doc?.adventureObjects) {
        const advObj = loadedMission.doc.adventureObjects.find(
          (o) => !o.visited && Math.hypot(o.x + 0.5 - wx, o.y + 0.5 - wy) <= 2.0,
        );
        if (advObj) interactable = { type: 'chest', x: advObj.x + 0.5, y: advObj.y + 0.5, obj: advObj };
      }
      if (!interactable && sim.shrines) {
        const sh = sim.shrines.find((s) => Math.hypot(s.x + 0.5 - wx, s.y + 0.5 - wy) <= 2.0);
        if (sh) interactable = { type: 'shrine', x: sh.x + 0.5, y: sh.y + 0.5, obj: sh };
      }
      ctx.d2Controller.onPointerDown(wx, wy, e.button, e.shiftKey, enemy >= 0 ? enemy : undefined, interactable);
    }

    holdShown = false;
    ctx.hideTip();
    if (e.pointerType !== 'mouse') {
      if (!e.isPrimary || downAt) {
        downAt = null;
        clearTimeout(tipTimer);
      } else {
        downAt = [x, y];
        clearTimeout(tipTimer);
        tipTimer = window.setTimeout(() => {
          if (!downAt) return;
          const i = ctx.unitAt(downAt[0], downAt[1], 28);
          if (i < 0) {
            if (ctx.selectedIds().length === 0 || ctx.getArmed() || ctx.getOutcome()) return;
            holdShown = true;
            holdPoint = [downAt[0], downAt[1]];
            radial.show(downAt[0], downAt[1], canvas.clientWidth, canvas.clientHeight, S.touch.radial);
            return;
          }
          holdShown = true;
          ctx.setHoveredUnit(i);
        }, 450);
      }
    }
    ctx.handleIntent(ctx.recognizer.down(e.pointerId, x, y, e.pointerType !== 'mouse', e.button, e.shiftKey));
  });

  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    lastPointerPos = [x, y];
    const [wx, wy] = ctx.toTile(x, y);
    ctx.mods.alt = e.altKey;
    ctx.mods.ctrl = e.ctrlKey || e.metaKey;
    if (controlMode === 'wasd' && e.pointerType === 'mouse' && ctx.d2Controller.isHolding) {
      ctx.d2Controller.onPointerMove(wx, wy, e.shiftKey);
    }
    if (downAt && Math.hypot(x - downAt[0], y - downAt[1]) > 10) {
      downAt = null;
      clearTimeout(tipTimer);
    }
    if (e.pointerType === 'mouse') updateHover(x, y);
    ctx.handleIntent(ctx.recognizer.move(e.pointerId, x, y));
  });

  canvas.addEventListener('pointerup', (e) => {
    if (controlMode === 'wasd' && e.pointerType === 'mouse') ctx.d2Controller.onPointerUp(e.button);
    ctx.mods.alt = e.altKey;
    ctx.mods.ctrl = e.ctrlKey || e.metaKey;
    ctx.updateAltButtonStates(ctx.mods.alt || ctx.getAltMobileToggle());
    downAt = null;
    clearTimeout(tipTimer);
    ctx.handleIntent(ctx.recognizer.up(e.pointerId));
    if (holdShown) ctx.scheduleHoldTipHide();
  });

  canvas.addEventListener('pointercancel', () => {
    ctx.d2Controller.reset();
    ctx.mods.alt = false;
    ctx.updateAltButtonStates(ctx.getAltMobileToggle());
    ctx.handleIntent(ctx.recognizer.cancel());
    ctx.setBoxDrag(null);
    downAt = null;
    ctx.setHoveredUnit(null);
    clearTimeout(tipTimer);
  });

  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') {
      pointerAt = null;
      ctx.setHover(null);
      ctx.setHoveredUnit(null);
      ctx.hideTip();
    }
  });

  canvas.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const [x, y] = local(e);
      ctx.handleIntent(ctx.recognizer.wheel(e.deltaY, x, y));
    },
    { passive: false },
  );

  window.addEventListener('blur', resetDesktopInput);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetDesktopInput();
  });

  window.addEventListener('keydown', (e) => {
    if (ctx.isDialogueOpen()) {
      if (e.key === ' ' || e.key === 'Enter') {
        ctx.advanceDialogue();
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        ctx.selectStance(Number(e.key));
      }
      e.preventDefault();
      return;
    }
    if (e.target instanceof Element && (e.target.closest('input, textarea, select') || (e.target instanceof HTMLElement && e.target.isContentEditable))) return;
    if (e.target instanceof HTMLButtonElement && e.key === ' ') return;
    const inSheet = e.target instanceof Element && e.target.closest('.sheet:not([hidden]), .spellbook-modal:not([hidden])') !== null;
    if (inSheet && e.key !== 'Escape' && e.key !== 'Pause' && e.code !== 'Pause' && e.key.toLowerCase() !== 'i' && e.key.toLowerCase() !== 's' && e.key.toLowerCase() !== 'b') return;
    if (ctx.isHeroCreating()) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      ctx.toggleAutomap();
      return;
    }
    if (e.key === 'Shift') ctx.d2Controller.setShift(true);
    if (e.key === 'Alt') {
      ctx.mods.alt = true;
      e.preventDefault();
    } else {
      ctx.mods.alt = e.altKey;
    }
    ctx.mods.ctrl = e.ctrlKey || e.metaKey;
    ctx.updateAltButtonStates(ctx.mods.alt || ctx.getAltMobileToggle());

    const code = e.code;
    const keyLower = e.key.toLowerCase();
    if (code === 'KeyR' && !e.repeat && !e.ctrlKey && !e.metaKey) {
      if (e.shiftKey) ctx.regroupSquad();
      else ctx.toggleRun();
      return;
    }
    const isMoveKey =
      code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD' ||
      code === 'ArrowUp' || code === 'ArrowLeft' || code === 'ArrowDown' || code === 'ArrowRight' ||
      keyLower === 'w' || keyLower === 'a' || keyLower === 's' || keyLower === 'd' ||
      keyLower === 'arrowup' || keyLower === 'arrowleft' || keyLower === 'arrowdown' || keyLower === 'arrowright';

    if (controlMode === 'wasd' && isMoveKey) {
      e.preventDefault();
      heldMoveKeys.add(code);
      heldMoveKeys.add(keyLower);
      ctx.setCameraFollow(true);
      if (e.repeat) return;
    }

    if (e.repeat && !/^Arrow(?:Left|Right|Up|Down)$/.test(e.key)) {
      e.preventDefault();
      return;
    }
    unlock();
    const noMod = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
    const matchesPotion = (id: string): boolean =>
      noMod &&
      keybindManager.matches(id, e.code, e.key) &&
      (controlMode === 'wasd' || !/^(?:Digit|Numpad)[1-4]$/.test(e.code));
    if (matchesPotion('potion1')) { e.preventDefault(); ctx.drinkBelt(1); return; }
    if (matchesPotion('potion2')) { e.preventDefault(); ctx.drinkBelt(2); return; }
    if (matchesPotion('potion3')) { e.preventDefault(); ctx.drinkBelt(3); return; }
    if (matchesPotion('potion4')) { e.preventDefault(); ctx.drinkBelt(4); return; }
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) {
      const d = Number(digit[1]);
      if (controlMode === 'wasd' && noMod && d >= 1 && d <= 4) {
        e.preventDefault();
        ctx.drinkBelt(d);
        return;
      }
      e.preventDefault();
      ctx.groupKey(d, e.ctrlKey || e.altKey ? 'set' : e.shiftKey ? 'add' : 'recall');
    } else if (e.key === 'F3' && (e.shiftKey || e.ctrlKey || ctx.canToggleDebugF3())) {
      e.preventDefault();
      ctx.toggleDebugF3();
    } else if (e.ctrlKey && keyLower === 'a') {
      e.preventDefault();
      ctx.toggleAuto();
    } else if (/^F([1-8])$/.test(e.key)) {
      e.preventDefault();
      ctx.castSlot(Number(e.key.slice(1)) - 1);
    } else if (/^F(?:9|1[0-2])$/.test(e.key)) {
      e.preventDefault();
      ctx.castSlot(Number(e.key.slice(1)) - 4);
    } else if (e.key === 'Escape' || keybindManager.matches('pause', e.code, e.key)) {
      if (ctx.isJournalOpen()) {
        ctx.closeJournal();
        return;
      }
      const qm = document.getElementById('quest-modal');
      if (ctx.isPauseMenuOpen()) {
        if (!ctx.handlePauseMenuEscape()) ctx.closePauseMenu();
      } else if (ctx.isTownOpen()) ctx.closeTownUi();
      else if (ctx.isSaveOpen()) ctx.closeSaveUi();
      else if (ctx.isBookOpen()) ctx.closeBook();
      else if (ctx.isHeroUiOpen()) ctx.closeHeroUi();
      else if (qm && !qm.hidden) qm.hidden = true;
      else if (ctx.getArmed()) ctx.arm(null);
      else ctx.togglePauseMenu();
    } else if (e.key === ' ' || e.code === 'Space' || keybindManager.matches('recenter', e.code, e.key)) {
      e.preventDefault();
      if (ctx.isPauseMenuOpen()) {
        ctx.closePauseMenu();
      } else {
        ctx.setCameraFollow(true);
        if (ctx.getSim().count > 0 && ctx.alive(0)) {
          ctx.centerOnTile(ctx.px(0), ctx.py(0));
        }
      }
    } else if (e.key === 'Pause' || e.code === 'Pause') {
      e.preventDefault();
      ctx.togglePause();
    } else if ((keybindManager.matches('quests', e.code, e.key) || keyLower === 'q' || keyLower === 'o') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      ctx.toggleObjectivesOrQuests();
    } else if (
      noMod &&
      !(controlMode === 'mouse' && keyLower === 'm' && keybindManager.getBinding('minimap').code === 'KeyM') &&
      (keybindManager.matches('minimap', e.code, e.key) || keyLower === 'm')
    ) {
      e.preventDefault();
      ctx.toggleMinimap();
    } else if (keyLower === 'w' && !e.ctrlKey && !e.altKey && controlMode !== 'wasd') {
      e.preventDefault();
      if (ctx.getSim().hero) ctx.triggerHeroSkill(1);
    } else if (keyLower === 'e' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (ctx.getSim().hero) ctx.triggerHeroSkill(2);
    } else if (keyLower === 'j' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      ctx.toggleQuestLog();
    } else if (keyLower === 't' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      ctx.openBook(-1);
    } else if ((keybindManager.matches('character', e.code, e.key) || keyLower === 'c') && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      ctx.toggleHeroStats();
    } else if (
      noMod &&
      controlMode !== 'wasd' &&
      !(controlMode === 'mouse' && keyLower === 's' && keybindManager.getBinding('spellbook').code === 'KeyS') &&
      (keybindManager.matches('spellbook', e.code, e.key) || keyLower === 's')
    ) {
      e.preventDefault();
      ctx.openBook(-1);
    } else if ((keybindManager.matches('inventory', e.code, e.key) || keyLower === 'i' || keyLower === 'b') && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      ctx.toggleHeroInventory();
    } else if (keyLower === 'f' && !e.ctrlKey && !e.altKey) {
      ctx.toggleLoose();
      const sim = ctx.getSim();
      if (sim.hero && ctx.alive(sim.hero.id)) {
        const sweep = performLootSweep(sim, sim.hero.id, 8);
        if (sweep.canLoot && sweep.targets.length > 0) {
          const lid = nearestLoot(sim, sim.x[sim.hero.id], sim.y[sim.hero.id], 8 * FP);
          if (lid >= 0) ctx.orderPickupLoot(lid);
        }
      }
    } else if (!e.ctrlKey && !e.altKey && !e.metaKey && (controlMode === 'wasd' ? WASD_ORDER_KEYS : CLASSIC_ORDER_KEYS)[keyLower]) {
      ctx.orderButton((controlMode === 'wasd' ? WASD_ORDER_KEYS : CLASSIC_ORDER_KEYS)[keyLower]);
    } else {
      keys.add(keyLower);
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') ctx.d2Controller.setShift(false);
    if (e.key === 'Alt') {
      ctx.mods.alt = false;
      e.preventDefault();
    } else {
      ctx.mods.alt = e.altKey;
    }
    ctx.mods.ctrl = e.ctrlKey || e.metaKey;
    ctx.updateAltButtonStates(ctx.mods.alt || ctx.getAltMobileToggle());
    heldMoveKeys.delete(e.code);
    heldMoveKeys.delete(e.key.toLowerCase());
    keys.delete(e.key.toLowerCase());
  });

  return {
    resetDesktopInput,
    isHoldShown: () => holdShown,
    getPointerAt: () => pointerAt,
    getLastPointerPos: () => lastPointerPos,
    heldMoveKeys,
    keys,
    getControlMode: () => controlMode,
    setControlMode: (mode: ControlMode) => {
      controlMode = mode;
    },
  };
}
