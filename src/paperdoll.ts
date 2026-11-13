import type { Command, Sim } from './sim/sim';
import { equipmentStamp, WHY_TEXT, type EquipmentAction, type HeroState } from './sim/hero';
import { getItemDef } from './sim/items';
import {
  equipmentAction,
  equipmentPreview,
  type EquipmentSource as Sel,
} from './hero-presentation';
import { itemIcon } from './townicons';
import { playEquipSfx, playPickupRustle } from './audio';
import { S } from './strings';

export { WHY_TEXT };

export type EquipmentPreviewResult = ReturnType<typeof equipmentPreview>;

export interface EquipmentIntent {
  sim: Sim;
  hero: HeroState;
  source: Sel;
  count: number;
  action: EquipmentAction;
  stamp: string;
}

export interface Drag {
  intent: EquipmentIntent;
  pointer: number;
  x: number;
  y: number;
  events: AbortController;
  ghost: HTMLElement | null;
  target: HTMLElement | null;
  scrollFrame: number;
}

export interface PaperdollHost {
  sheet: HTMLElement;
  body: HTMLElement;
  getSim: () => Sim;
  queue: (cmd: Command) => void;
  feedback: HTMLElement;
  isPending: () => boolean;
  setPending: (p: { sim: Sim; tick: number } | null) => void;
  render: (keepFocus?: boolean) => void;
  hideCardTooltip?: () => void;
}

export class PaperdollController {
  public drag: Drag | null = null;
  public suppressedPointer: number | null = null;

  constructor(private readonly host: PaperdollHost) {}

  intent(source: Sel): EquipmentIntent | null {
    const sim = this.host.getSim();
    const hero = sim.hero;
    const action = equipmentAction(source);
    if (!hero || !action || this.host.isPending()) return null;
    return {
      sim,
      hero,
      source,
      action,
      count: hero.inv[source.slot]?.n ?? 0,
      stamp: equipmentStamp(hero, action),
    };
  }

  preview(intent: EquipmentIntent): EquipmentPreviewResult {
    const { sim, hero, source, action, stamp, count } = intent;
    if (sim !== this.host.getSim() || sim.hero !== hero || stamp !== equipmentStamp(hero, action)) return null;
    if (source.from === 'inv' && hero.inv[source.slot]?.n !== count) return null;
    return equipmentPreview(hero, sim.cb.hp[hero.id] > 0, source);
  }

  submit(intent: EquipmentIntent): void {
    if (this.host.isPending()) return;
    const preview = this.preview(intent);
    if (!preview || preview.why) {
      this.host.feedback.textContent = preview ? WHY_TEXT[preview.why] : S.hero.equipmentChanged;
      return;
    }
    this.host.setPending({ sim: intent.sim, tick: intent.sim.tick });
    this.host.queue({ type: 'hero', ...intent.action, expectedEquipment: intent.stamp });
    this.host.render(true);
  }

  press(e: PointerEvent): void {
    this.suppressedPointer = null;
    if (this.drag || !e.isPrimary || e.button !== 0 || !(e.target instanceof Element)) return;
    const source = e.target.closest<HTMLElement>('[data-source]');
    if (!source) return;
    const [from, slot, item] = source.dataset.source!.split('/');
    const intent = this.intent({ from: from === 'eq' ? 'eq' : 'inv', slot: Number(slot), item: Number(item) });
    if (!intent) return;

    const events = new AbortController();
    this.drag = { intent, pointer: e.pointerId, x: e.clientX, y: e.clientY, events, ghost: null, target: null, scrollFrame: 0 };
    const options = { signal: events.signal };

    window.addEventListener('pointermove', (event) => this.moveDrag(event), options);
    window.addEventListener('pointerup', (event) => this.endDrag(event), options);
    window.addEventListener('pointerdown', (event) => {
      if (event.pointerId !== e.pointerId) this.cancelDrag(S.hero.dragCanceled);
    }, { ...options, capture: true });
    window.addEventListener('pointercancel', (event) => {
      if (event.pointerId === e.pointerId) this.cancelDrag(S.hero.dragCanceled);
    }, options);
    this.host.sheet.addEventListener('lostpointercapture', (event) => {
      if (event.target === this.host.sheet && event.pointerId === e.pointerId) this.cancelDrag(S.hero.dragCanceled);
    }, options);
    window.addEventListener('blur', () => this.cancelDrag(), options);
    window.addEventListener('resize', () => this.cancelDrag(), options);
  }

  targetAt(e: PointerEvent): HTMLElement | null {
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-equipment-target]');
    return target && this.host.body.contains(target) ? target : null;
  }

  moveDrag(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      this.host.sheet.setPointerCapture(e.pointerId);
      const ghost = document.createElement('div');
      ghost.className = 'hero-drag-ghost';
      ghost.textContent = getItemDef(drag.intent.source.item)?.name ?? '';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.prepend(itemIcon(drag.intent.source.item));
      drag.ghost = ghost;
      this.host.sheet.append(ghost);
      playPickupRustle();
    }
    const preview = this.preview(drag.intent);
    if (!preview) {
      this.cancelDrag(S.hero.equipmentChanged);
      return;
    }
    const ghost = drag.ghost;
    ghost.style.left = `${Math.max(0, Math.min(innerWidth - ghost.offsetWidth, e.clientX + 12))}px`;
    ghost.style.top = `${Math.max(0, Math.min(innerHeight - ghost.offsetHeight, e.clientY + (e.pointerType === 'touch' ? -32 : 12)))}px`;
    const target = this.targetAt(e);
    drag.target?.removeAttribute('data-drop-state');
    drag.target = target;
    const matches = target?.dataset.equipmentTarget === preview.target;
    if (target) target.dataset.dropState = matches && !preview.why ? 'valid' : 'invalid';
    this.host.feedback.textContent = preview.why ? WHY_TEXT[preview.why]
      : !matches ? S.hero.invalidEquipmentTarget
      : preview.replacement >= 0 ? `${S.hero.replaceEquipment} ${getItemDef(preview.replacement)?.name ?? ''}`
      : preview.target === 'pack' ? S.hero.returnToPack : S.hero.equip;
    this.scrollDrag(drag, e);
  }

  private scrollDrag(drag: Drag, e: PointerEvent): void {
    cancelAnimationFrame(drag.scrollFrame);
    const { top, bottom, left, right } = this.host.sheet.getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    if (x < left || x >= right || y < top || y >= bottom) return;
    const edge = 28;
    const delta = y < top + edge ? -6 : y >= bottom - edge ? 6 : 0;
    if (!delta) return;
    drag.scrollFrame = requestAnimationFrame(() => {
      const before = this.host.sheet.scrollTop;
      this.host.sheet.scrollTop += delta;
      if (this.host.sheet.scrollTop !== before) this.moveDrag(e);
    });
  }

  endDrag(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointer) return;
    const preview = drag.ghost && this.preview(drag.intent);
    const target = drag.ghost && this.targetAt(e);
    this.cancelDrag();
    if (preview && target?.dataset.equipmentTarget === preview.target && !preview.why) {
      const def = getItemDef(drag.intent.source.item);
      const isMetal = def ? (def.tier >= 3 || /sword|blade|iron|steel|plate|mail|shield|helm/i.test(def.name)) : true;
      playEquipSfx(isMetal);
      this.submit(drag.intent);
    } else if (drag.ghost) {
      this.host.feedback.textContent = preview && preview.why ? WHY_TEXT[preview.why] : S.hero.dragCanceled;
    }
  }

  cancelDrag(message = ''): void {
    this.host.hideCardTooltip?.();
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.events.abort();
    cancelAnimationFrame(drag.scrollFrame);
    if (drag.ghost) this.suppressedPointer = drag.pointer;
    drag.ghost?.remove();
    drag.target?.removeAttribute('data-drop-state');
    if (this.host.sheet.hasPointerCapture(drag.pointer)) this.host.sheet.releasePointerCapture(drag.pointer);
    if (message) this.host.feedback.textContent = message;
  }
}
