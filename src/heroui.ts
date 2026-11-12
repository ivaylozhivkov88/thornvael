import { DEFS, Kind, M, MODN } from './sim/combat';
import { DIFF_NAMES, INV_MAX, SKILL_NAMES, SKILL_TIP, WHY_TEXT, blocker, derive, equipmentStamp, startState, type EquipmentAction, type HeroState } from './sim/hero';
import { equipmentAction, equipmentLayers, equipmentPreview, skillProgress, type EquipmentSource as Sel } from './hero-presentation';
import { ATTR_NAMES, CLS_BOTH, CLS_MAGE, CLS_WARRIOR, Cls, ITEMS, Ik, ItemDef, PART_NAMES, SLOT_COUNT, SLOT_NAMES, getItemDef, itemText } from './sim/items';
import { findSetByItemName, isSetItem, type SetBonus } from './sim/sets';
import type { Command, Sim } from './sim/sim';
import { SPELLS } from './sim/spelldata';
import { S } from './strings';
import { itemIcon } from './townicons';
import { CodexUi } from './codexui';

/** Hero, pack and creation sheets. Plain DOM buttons only, so touch, mouse and keyboard (Tab, Enter, arrows) all work the same way. */

export interface HeroUiCtx {
  sim: () => Sim;
  queue: (c: Command) => void;
  toast: (m: string) => void;
  tipOn: (b: HTMLElement, text: string) => void;
  /** Put a quick-slot value (spell id, or 100 + item id) into slot n. */
  setSlot: (n: number, v: number) => void;
  openBook: () => void;
  /** Called after a sheet opens so the host can close other overlays. */
  onOpen: () => void;
}

type Tab = 'hero' | 'pack';
const PACK_PAGE = 8;

interface EquipmentIntent {
  sim: Sim;
  hero: HeroState;
  source: Sel;
  count: number;
  action: EquipmentAction;
  stamp: string;
}

interface Drag {
  intent: EquipmentIntent;
  pointer: number;
  x: number;
  y: number;
  events: AbortController;
  ghost: HTMLElement | null;
  target: HTMLElement | null;
  scrollFrame: number;
}

const silhouettes = [
  'M22 104 10 47 17 41 32 101 36 101 37 107 27 111 30 124 24 126 20 114 15 115 13 109Z',
  'M108 91 133 101 130 131 Q123 151 108 155 Q92 147 87 130 L85 101Z',
  'M54 47 55 30 Q70 12 85 30 L86 47 78 53 77 41 63 41 62 53Z',
  'M50 63 62 58 70 65 78 58 90 63 97 79 87 87 83 118 57 118 53 87 43 79Z',
  'M48 163 64 164 63 186 43 186 43 178Z M76 164 92 163 97 178 97 186 77 186Z',
  'M27 110 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0Z',
  'M58 56 70 72 82 56 78 57 70 66 62 57Z M70 67 74 73 70 79 66 73Z',
  'M35 90 45 97 40 114 29 111Z M105 90 95 97 100 114 111 111Z',
];
const metals = ['#d9dce4', '#af824b', '#ccd1db', '#8792a6', '#74543c', '#f1c35e', '#e6ae64', '#a17b53'];

function figure(h: HeroState): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 140 200');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('hero-figure');
  const path = (shape: string, color: string) => {
    const part = document.createElementNS(ns, 'path');
    part.setAttribute('d', shape);
    part.setAttribute('fill', color);
    part.setAttribute('stroke', '#211812');
    part.setAttribute('stroke-width', '2');
    svg.append(part);
    return part;
  };
  if (h.female) path('M55 35 Q67 20 83 31 L93 67 48 67Z', '#573831');
  path('M57 44 Q54 27 70 26 Q86 27 83 44 Q80 58 70 59 Q60 58 57 44Z M55 64 44 68 29 109 34 117 43 109 57 82Z M85 64 96 68 111 109 106 117 97 109 83 82Z', '#c59470');
  path(h.cls === 1
    ? 'M52 63 64 56 76 56 88 63 84 104 102 177 38 177 56 104Z'
    : h.female
      ? 'M52 63 64 56 76 56 88 63 84 87 80 102 92 129 90 180 77 180 70 135 63 180 50 180 48 129 60 102 56 87Z'
      : 'M47 64 64 56 76 56 93 64 84 104 92 133 90 180 77 180 70 132 63 180 50 180 48 133 56 104Z',
    h.cls === 1 ? '#625588' : '#5f7376');
  for (const layer of equipmentLayers(h)) {
    const part = path(silhouettes[layer.slot], metals[layer.slot]);
    part.dataset.layer = String(layer.slot);
    part.dataset.item = String(layer.item);
  }
  return svg;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function button(text: string, key: string, onclick: () => void, small = ''): HTMLButtonElement {
  const b = el('button');
  b.type = 'button';
  b.dataset.k = key;
  b.append(text);
  if (small) b.append(el('small', '', small));
  b.onclick = onclick;
  return b;
}

function meter(cls: string, v: number, max: number): HTMLElement {
  const m = el('div', `meter ${cls}`);
  const i = el('i');
  i.style.width = `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
  m.append(i);
  return m;
}

function line(label: string, value: string, tip = '', extra?: HTMLElement): HTMLElement {
  const l = el('div', 'line');
  l.append(el('span', 'grow', label), el('b', '', value));
  if (extra) l.append(extra);
  if (tip) l.title = tip;
  return l;
}

/** Tab strip shared by the hero sheet and the spellbook. */
export function tabStrip(active: number, go: (n: number) => void): HTMLElement {
  const t = el('div', 'tabs');
  t.setAttribute('role', 'tablist');
  S.hero.tabs.forEach((name, n) => {
    const b = button(name, `tab${n}`, () => go(n));
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(n === active));
    b.tabIndex = n === active ? 0 : -1;
    b.onkeydown = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      go((n + (e.key === 'ArrowRight' ? 1 : 2)) % 3);
    };
    t.append(b);
  });
  return t;
}

const SCHOOL_NAMES = ['fire', 'water', 'air', 'earth', 'astral'] as const;

function formatBonusStats(b: SetBonus): string {
  const parts: string[] = [];
  if (b.hp) parts.push(`+${b.hp} HP`);
  if (b.mana) parts.push(`+${b.mana} Mana`);
  if (b.def) parts.push(`+${b.def} Def`);
  if (b.abs) parts.push(`+${b.abs} Absorb`);
  if (b.acc) parts.push(`+${b.acc} Hit`);
  if (b.min || b.max) parts.push(`+${b.min ?? 0}-${b.max ?? 0} Damage`);
  if (b.pow) parts.push(`+${b.pow}% Spell Power`);
  if (b.attr) {
    b.attr.forEach((v, idx) => {
      if (v) parts.push(`+${v} ${ATTR_NAMES[idx]}`);
    });
  }
  if (b.res) {
    const res = b.res;
    if (res.every((v) => v === res[0]) && res[0] > 0) {
      parts.push(`+${res[0]}% All Res`);
    } else {
      res.forEach((v, idx) => {
        if (v) parts.push(`+${v}% ${SCHOOL_NAMES[idx]} Res`);
      });
    }
  }
  return parts.join(', ');
}

export function formatItemTooltip(itemOrId: number | ItemDef, hero?: HeroState | null): string {
  const d = typeof itemOrId === 'number' ? getItemDef(itemOrId) : itemOrId;
  if (!d) return '';

  const p: string[] = [];
  const kind = d.kind === Ik.Gear ? SLOT_NAMES[d.slot] : d.kind === Ik.Potion ? 'Potion' : d.w > 1 ? 'Tome' : 'Scroll';
  p.push(`${d.name} (${kind}, level ${d.tier}, weight ${d.w})`);
  if (d.max > 0) p.push(`Blow damage +${d.min}-${d.max}`);
  if (d.acc) p.push(`Hit +${d.acc}`);
  if (d.cover && (d.def || d.abs)) {
    const parts = PART_NAMES.filter((_, k) => (d.cover >> k) & 1).join(', ');
    p.push(`Covers ${parts}: defence +${d.def}, absorb +${d.abs}`);
  }
  d.res.forEach((v, n) => v && p.push(`Resist ${SCHOOL_NAMES[n]} +${v}%`));
  d.attr.forEach((v, n) => v && p.push(`${ATTR_NAMES[n]} +${v}`));
  if (d.hp) p.push(`Hit points +${d.hp}`);
  if (d.mana) p.push(`Mana +${d.mana}`);
  if (d.pow) p.push(`Spell power +${d.pow}%`);
  if (d.heal) p.push(`Heals ${d.heal}`);
  if (d.restore) p.push(`Restores ${d.restore} mana`);
  if (d.grow) p.push(`Raises ${ATTR_NAMES[d.grow - 1]} by 1 for good`);
  if (d.spell >= 0 && SPELLS[d.spell]) p.push(`Teaches ${SPELLS[d.spell].name}`);
  if (d.needv > 0) p.push(`Needs ${ATTR_NAMES[d.need]} ${d.needv}`);

  // Class restriction
  if (d.kind === Ik.Gear) {
    if (d.cls === CLS_BOTH) {
      p.push('Warriors and mages');
    } else if (d.cls === CLS_WARRIOR) {
      if (hero && hero.cls === Cls.Mage) {
        p.push('⚠ Cannot equip: Warrior Only');
      } else {
        p.push('Warrior Only');
      }
    } else if (d.cls === CLS_MAGE) {
      if (hero && hero.cls === Cls.Warrior) {
        p.push('⚠ Cannot equip: Mage Only');
      } else {
        p.push('Mage Only');
      }
    }
  }

  // Set Item info
  const setDef = findSetByItemName(d.name);
  if (setDef) {
    const equippedNames = hero
      ? hero.eq.filter((id) => id >= 0).map((id) => getItemDef(id)?.name).filter(Boolean)
      : [];
    const equippedCount = setDef.pieces.filter((piece) => equippedNames.includes(piece.name)).length;

    p.push('');
    p.push(`Set: ${setDef.name} (${equippedCount}/${setDef.pieces.length})`);
    for (const piece of setDef.pieces) {
      const isEquipped = equippedNames.includes(piece.name);
      p.push(`  ${isEquipped ? '[✓]' : '[ ]'} ${piece.name}`);
    }
    p.push('Set Bonuses:');
    for (const bonus of setDef.bonuses) {
      const active = equippedCount >= bonus.pieces;
      p.push(`  ${active ? '★' : '○'} (${bonus.pieces}) ${formatBonusStats(bonus)}`);
    }
  }

  return p.join('\n');
}

export function renderItemTooltipDom(itemOrId: number | ItemDef, hero?: HeroState | null): HTMLElement {
  const d = typeof itemOrId === 'number' ? getItemDef(itemOrId) : itemOrId;
  const root = document.createElement('div');
  root.className = 'item-tooltip-box';
  if (!d) return root;

  const title = document.createElement('div');
  title.className = 'item-title';
  title.textContent = d.name;
  root.append(title);

  const kind = d.kind === Ik.Gear ? SLOT_NAMES[d.slot] : d.kind === Ik.Potion ? 'Potion' : d.w > 1 ? 'Tome' : 'Scroll';
  const sub = document.createElement('div');
  sub.className = 'note';
  sub.textContent = `${kind}, level ${d.tier}, weight ${d.w}`;
  root.append(sub);

  const stats = document.createElement('div');
  stats.className = 'item-stats-list';
  if (d.max > 0) {
    const div = document.createElement('div');
    div.textContent = `Blow damage +${d.min}-${d.max}`;
    stats.append(div);
  }
  if (d.acc) {
    const div = document.createElement('div');
    div.textContent = `Hit +${d.acc}`;
    stats.append(div);
  }
  if (d.cover && (d.def || d.abs)) {
    const parts = PART_NAMES.filter((_, k) => (d.cover >> k) & 1).join(', ');
    const div = document.createElement('div');
    div.textContent = `Covers ${parts}: defence +${d.def}, absorb +${d.abs}`;
    stats.append(div);
  }
  d.res.forEach((v, n) => {
    if (v) {
      const div = document.createElement('div');
      div.textContent = `Resist ${SCHOOL_NAMES[n]} +${v}%`;
      stats.append(div);
    }
  });
  d.attr.forEach((v, n) => {
    if (v) {
      const div = document.createElement('div');
      div.textContent = `${ATTR_NAMES[n]} +${v}`;
      stats.append(div);
    }
  });
  if (d.hp) {
    const div = document.createElement('div');
    div.textContent = `Hit points +${d.hp}`;
    stats.append(div);
  }
  if (d.mana) {
    const div = document.createElement('div');
    div.textContent = `Mana +${d.mana}`;
    stats.append(div);
  }
  if (d.pow) {
    const div = document.createElement('div');
    div.textContent = `Spell power +${d.pow}%`;
    stats.append(div);
  }
  if (d.heal) {
    const div = document.createElement('div');
    div.textContent = `Heals ${d.heal}`;
    stats.append(div);
  }
  if (d.restore) {
    const div = document.createElement('div');
    div.textContent = `Restores ${d.restore} mana`;
    stats.append(div);
  }
  if (d.grow) {
    const div = document.createElement('div');
    div.textContent = `Raises ${ATTR_NAMES[d.grow - 1]} by 1 for good`;
    stats.append(div);
  }
  if (d.spell >= 0 && SPELLS[d.spell]) {
    const div = document.createElement('div');
    div.textContent = `Teaches ${SPELLS[d.spell].name}`;
    stats.append(div);
  }
  if (d.needv > 0) {
    const div = document.createElement('div');
    div.textContent = `Needs ${ATTR_NAMES[d.need]} ${d.needv}`;
    stats.append(div);
  }
  root.append(stats);

  // Class restrictions
  if (d.kind === Ik.Gear) {
    if (d.cls === CLS_WARRIOR) {
      const tag = document.createElement('div');
      if (hero && hero.cls === Cls.Mage) {
        tag.className = 'class-warning-red';
        tag.textContent = '⚠ Cannot equip: Warrior Only';
      } else {
        tag.className = 'class-tag-gold';
        tag.textContent = 'Warrior Only';
      }
      root.append(tag);
    } else if (d.cls === CLS_MAGE) {
      const tag = document.createElement('div');
      if (hero && hero.cls === Cls.Warrior) {
        tag.className = 'class-warning-red';
        tag.textContent = '⚠ Cannot equip: Mage Only';
      } else {
        tag.className = 'class-tag-gold';
        tag.textContent = 'Mage Only';
      }
      root.append(tag);
    } else {
      const tag = document.createElement('div');
      tag.className = 'note';
      tag.textContent = 'Warriors and mages';
      root.append(tag);
    }
  }

  // Set info
  const setDef = findSetByItemName(d.name);
  if (setDef) {
    const equippedNames = hero
      ? hero.eq.filter((id) => id >= 0).map((id) => getItemDef(id)?.name).filter(Boolean)
      : [];
    const equippedCount = setDef.pieces.filter((piece) => equippedNames.includes(piece.name)).length;

    const setHeader = document.createElement('div');
    setHeader.className = 'set-name-header';
    setHeader.textContent = `${setDef.name} (${equippedCount}/${setDef.pieces.length})`;
    root.append(setHeader);

    const piecesList = document.createElement('ul');
    piecesList.className = 'set-pieces-list';
    for (const piece of setDef.pieces) {
      const isEquipped = equippedNames.includes(piece.name);
      const li = document.createElement('li');
      li.className = `set-piece ${isEquipped ? 'equipped' : 'unequipped'}`;
      li.textContent = `${isEquipped ? '✓ ' : '• '}${piece.name}`;
      piecesList.append(li);
    }
    root.append(piecesList);

    const bonusesDiv = document.createElement('div');
    bonusesDiv.className = 'set-bonuses';
    for (const bonus of setDef.bonuses) {
      const active = equippedCount >= bonus.pieces;
      const bDiv = document.createElement('div');
      bDiv.className = active ? 'set-bonus-active' : 'set-bonus-inactive';
      bDiv.textContent = `(${bonus.pieces} Pieces) ${formatBonusStats(bonus)}`;
      bonusesDiv.append(bDiv);
    }
    root.append(bonusesDiv);
  }

  return root;
}

export class HeroUi {
  tab: Tab = 'hero';
  private sel: Sel | null = null;
  private sig = '';
  private readonly sheet = document.getElementById('sheet')!;
  private readonly head = document.getElementById('sheet-head')!;
  private readonly body = document.getElementById('sheet-body')!;
  private readonly create = document.getElementById('create')!;

  private page = 0;
  private drag: Drag | null = null;
  private pending: { sim: Sim; tick: number } | null = null;
  private readonly feedback = el('p', 'hero-equipment-feedback');
  private suppressedPointer: number | null = null;
  private readonly codexUi: CodexUi;

  constructor(private readonly ctx: HeroUiCtx) {
    this.codexUi = new CodexUi((el, tip) => this.ctx.tipOn(el, tip));
    this.feedback.setAttribute('role', 'status');
    this.sheet.addEventListener('pointerdown', (e) => this.press(e));
    this.sheet.addEventListener('click', (e) => {
      if (e.detail === 0 || !(e instanceof PointerEvent) || e.pointerId !== this.suppressedPointer) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.suppressedPointer = null;
    }, true);
    this.sheet.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (this.drag) this.cancelDrag(S.hero.dragCanceled);
      else this.close();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      this.cancelDrag();
      const pending = this.pending;
      // The host clears the queue only if its frame runs while hidden.
      requestAnimationFrame(() => {
        if (document.hidden && this.pending === pending) this.pending = null;
      });
    });
  }

  private intent(source: Sel): EquipmentIntent | null {
    const sim = this.ctx.sim();
    const hero = sim.hero;
    const action = equipmentAction(source);
    if (!hero || !action || this.pending) return null;
    return { sim, hero, source, action, count: hero.inv[source.slot]?.n ?? 0, stamp: equipmentStamp(hero, action) };
  }

  private preview(intent: EquipmentIntent) {
    const { sim, hero, source, action, stamp, count } = intent;
    if (sim !== this.ctx.sim() || sim.hero !== hero || stamp !== equipmentStamp(hero, action)) return null;
    if (source.from === 'inv' && hero.inv[source.slot]?.n !== count) return null;
    return equipmentPreview(hero, sim.cb.hp[hero.id] > 0, source);
  }

  private submit(intent: EquipmentIntent): void {
    if (this.pending) return;
    const preview = this.preview(intent);
    if (!preview || preview.why) {
      this.feedback.textContent = preview ? WHY_TEXT[preview.why] : S.hero.equipmentChanged;
      return;
    }
    this.pending = { sim: intent.sim, tick: intent.sim.tick };
    this.ctx.queue({ type: 'hero', ...intent.action, expectedEquipment: intent.stamp });
    this.render(true);
  }

  private press(e: PointerEvent): void {
    this.suppressedPointer = null;
    if (this.drag || !e.isPrimary || e.button !== 0 || !(e.target instanceof Element)) return;
    const source = e.target.closest<HTMLElement>('[data-source]');
    if (!source || (e.pointerType === 'touch' && !source.classList.contains('hero-drag-handle'))) return;
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
    this.sheet.addEventListener('lostpointercapture', (event) => {
      // Touch starts with implicit capture on the handle. Its loss bubbles
      // through the sheet when we transfer capture to the sheet itself.
      if (event.target === this.sheet && event.pointerId === e.pointerId) this.cancelDrag(S.hero.dragCanceled);
    }, options);
    window.addEventListener('blur', () => this.cancelDrag(), options);
    window.addEventListener('resize', () => this.cancelDrag(), options);
  }

  private targetAt(e: PointerEvent): HTMLElement | null {
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-equipment-target]');
    return target && this.body.contains(target) ? target : null;
  }

  private moveDrag(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      this.sheet.setPointerCapture(e.pointerId);
      drag.ghost = el('div', 'hero-drag-ghost', getItemDef(drag.intent.source.item)?.name ?? '');
      drag.ghost.setAttribute('aria-hidden', 'true');
      drag.ghost.prepend(itemIcon(drag.intent.source.item));
      this.sheet.append(drag.ghost);
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
    this.feedback.textContent = preview.why ? WHY_TEXT[preview.why]
      : !matches ? S.hero.invalidEquipmentTarget
      : preview.replacement >= 0 ? `${S.hero.replaceEquipment} ${getItemDef(preview.replacement)?.name ?? ''}`
      : preview.target === 'pack' ? S.hero.returnToPack : S.hero.equip;
    this.scrollDrag(drag, e);
  }

  private scrollDrag(drag: Drag, e: PointerEvent): void {
    cancelAnimationFrame(drag.scrollFrame);
    const { top, bottom, left, right } = this.sheet.getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    if (x < left || x >= right || y < top || y >= bottom) return;
    const edge = 28;
    const delta = y < top + edge ? -6 : y >= bottom - edge ? 6 : 0;
    if (!delta) return;
    drag.scrollFrame = requestAnimationFrame(() => {
      const before = this.sheet.scrollTop;
      this.sheet.scrollTop += delta;
      if (this.sheet.scrollTop !== before) this.moveDrag(e);
    });
  }

  private endDrag(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointer) return;
    const preview = drag.ghost && this.preview(drag.intent);
    const target = drag.ghost && this.targetAt(e);
    this.cancelDrag();
    if (preview && target?.dataset.equipmentTarget === preview.target && !preview.why) this.submit(drag.intent);
    else if (drag.ghost) this.feedback.textContent = preview && preview.why ? WHY_TEXT[preview.why] : S.hero.dragCanceled;
  }

  private cancelDrag(message = ''): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.events.abort();
    cancelAnimationFrame(drag.scrollFrame);
    if (drag.ghost) this.suppressedPointer = drag.pointer;
    drag.ghost?.remove();
    drag.target?.removeAttribute('data-drop-state');
    if (this.sheet.hasPointerCapture(drag.pointer)) this.sheet.releasePointerCapture(drag.pointer);
    this.feedback.textContent = message;
  }

  get isOpen(): boolean {
    return !this.sheet.hidden;
  }

  get creating(): boolean {
    return !this.create.hidden;
  }

  open(tab: Tab = this.tab): void {
    const h = this.ctx.sim().hero;
    if (h === null) {
      this.ctx.toast(S.hero.noHero);
      return;
    }
    this.ctx.onOpen();
    this.tab = tab;
    this.page = 0;
    this.sel = null;
    this.sheet.hidden = false;
    this.render(true);
    this.head.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }

  close(): void {
    this.cancelDrag();
    this.sheet.hidden = true;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private go(n: number): void {
    if (n === 2) {
      this.close();
      this.ctx.openBook();
      return;
    }
    this.tab = n === 0 ? 'hero' : 'pack';
    this.body.querySelector('.hero-stats')?.remove();
    this.sel = null;
    this.render(true);
    this.head.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }

  /** Called a few times a second: redraws only when something shown has changed. */
  refresh(force = false): void {
    if (this.isOpen) this.render(force);
  }

  private act(c: Command): void {
    this.ctx.queue(c);
    window.setTimeout(() => this.refresh(true), 160);
  }

  private render(force: boolean): void {
    const sim = this.ctx.sim();
    const h = sim.hero;
    if (this.pending && (this.pending.sim !== sim || sim.tick > this.pending.tick)) this.pending = null;
    if (h === null) {
      this.close();
      return;
    }
    const cb = sim.cb;
    let canceled = false;
    if (this.drag && (this.drag.intent.sim !== sim || this.drag.intent.hero !== h || cb.hp[h.id] <= 0)) {
      canceled = this.drag.ghost !== null;
      this.cancelDrag(S.hero.dragCanceled);
    }
    if (this.sel && (this.sel.from === 'inv' ? h.inv[this.sel.slot]?.item !== this.sel.item : h.eq[this.sel.slot] !== this.sel.item)) this.sel = null;
    this.page = Math.min(this.page, Math.max(0, Math.ceil(h.inv.length / PACK_PAGE) - 1));
    const sig = JSON.stringify([h, cb.hp[h.id], cb.hpMax[h.id], cb.mana[h.id], cb.manaMax[h.id], this.sel, this.tab, this.page, this.pending !== null]);
    if (!force && sig === this.sig) return;
    canceled ||= this.drag?.ghost != null;
    this.cancelDrag();
    this.sig = sig;
    const statsOpen = this.body.querySelector<HTMLDetailsElement>('.hero-stats')?.open ?? (this.tab === 'hero' && innerWidth > 650);
    const focus = (document.activeElement as HTMLElement | null)?.dataset?.k;
    this.head.replaceChildren();
    const info = el('span', '', `${S.hero.classes[h.cls]}, ${S.hero.sexes[h.female ? 1 : 0].toLowerCase()} · ${DIFF_NAMES[h.diff]}`);
    const codex = button('🏆 Codex', 'codex', () => this.codexUi.toggle());
    const close = button(S.hero.close, 'close', () => this.close());
    const sp = el('span', 'spacer');
    this.head.append(tabStrip(this.tab === 'hero' ? 0 : 1, (n) => this.go(n)), info, sp, codex, close);
    this.body.replaceChildren();
    this.feedback.textContent = this.pending ? S.hero.equipmentPending : canceled ? S.hero.dragCanceled : '';
    const workspace = el('div', 'hero-workspace');
    workspace.append(this.renderEquipment(h), this.renderPack(h));
    this.body.append(el('p', 'note hero-drag-help', S.hero.dragHelp), this.feedback, workspace);
    if (this.sel) this.body.append(this.detail(h, this.sel));
    else this.body.append(el('p', 'note', S.hero.noSel));
    this.body.append(this.renderHero(h, sim, statsOpen));
    if (focus) {
      const next = this.sheet.querySelector<HTMLElement>(`[data-k="${focus}"]:not(:disabled)`);
      const source = this.sel && this.sheet.querySelector<HTMLElement>(`[data-k="${this.sel.from}${this.sel.slot}"]`);
      (next || source || this.head.querySelector<HTMLElement>('[aria-selected="true"]'))?.focus({ preventScroll: true });
    }
  }

  private weightLine(h: HeroState): HTMLElement {
    const d = derive(h);
    const m = meter(d.weight >= d.capacity ? 'wt over' : 'wt', d.weight, d.capacity);
    return line(S.hero.weight, `${d.weight} / ${d.capacity}`, '', m);
  }

  private renderHero(h: HeroState, sim: Sim, open: boolean): HTMLElement {
    const cb = sim.cb;
    const i = h.id;
    const d = derive(h);
    const b = el('details', 'hero-stats');
    b.open = open;
    b.append(el('summary', '', S.hero.heroStats));
    b.append(line(S.hp, `${cb.hp[i]} / ${cb.hpMax[i]}`, '', meter('hp', cb.hp[i], cb.hpMax[i])), line(S.mana, `${cb.mana[i]} / ${cb.manaMax[i]}`, '', meter('mp', cb.mana[i], cb.manaMax[i])));
    const cols = el('div', 'cols');
    const left = el('div');
    left.append(el('h3', '', S.hero.attributes));
    const al = el('div', 'lines');
    for (let k = 0; k < 4; k++) {
      const bonus = d.attr[k] - h.attr[k];
      al.append(line(S.hero.attrs[k], bonus ? `${d.attr[k]} (${h.attr[k]}${bonus > 0 ? '+' : ''}${bonus})` : String(d.attr[k]), S.hero.attrTips[k]));
    }
    left.append(al, el('h3', '', S.hero.skills));
    const sl = el('div', 'lines');
    for (let k = 0; k < 3; k++) {
      const { level, used, needed, remaining } = skillProgress(h, k);
      const row = el('div');
      row.dataset.skill = String(k);
      const progress = el('progress');
      progress.max = needed ?? 1;
      progress.value = needed === null ? 1 : used;
      progress.style.width = '100%';
      progress.setAttribute('aria-label', `${SKILL_NAMES[k]} progress`);
      const summary = needed === null ? 'Maximum level reached.' : `${used} / ${needed} uses · ${remaining} to level ${level + 1}.`;
      progress.setAttribute('aria-valuetext', summary);
      row.append(line(SKILL_NAMES[k], `${S.hero.level} ${level}${needed === null ? ' (max)' : ''}`), progress, el('p', 'note', `${summary} ${SKILL_TIP[k]}`));
      sl.append(row);
    }
    left.append(sl);
    const right = el('div');
    right.append(el('h3', '', S.hero.stats));
    const base = DEFS[Kind.Hero];
    const o = i * MODN;
    const cl = el('div', 'lines');
    cl.append(
      line(S.hero.blowDamage, `${base.min + cb.mod[o + M.Min]}-${base.max + cb.mod[o + M.Max]}`),
      line(S.hit, String(base.acc + cb.mod[o + M.Acc])),
      ...S.parts.map((name, k) =>
        line(
          name,
          `${base.def + cb.mod[o + M.Def] + base.pdef[k] + cb.mod[o + M.PDef + k]} / ${cb.mod[o + M.Abs] + base.pabs[k] + cb.mod[o + M.PAbs + k]}`,
          S.armourHint,
        ),
      ),
      line(S.hero.spellPower, `+${cb.mod[o + M.Pow]}%`),
      line(S.hero.regen, `${1 + cb.mod[o + M.Regen]} ${S.hero.perSecond}`),
    );
    for (let k = 0; k < 5; k++) cl.append(line(`${S.resist} ${S.schools[k + 1].toLowerCase()}`, `${Math.min(90, base.res[k] + cb.mod[o + M.Res + k])}%`));
    right.append(cl);
    cols.append(left, right);
    b.append(cols);
    return b;
  }

  private cell(face: HTMLButtonElement, source: Sel): HTMLElement {
    const cell = el('div', 'hero-gear-cell');
    cell.append(face);
    if (!equipmentAction(source)) return cell;
    const key = `${source.from}/${source.slot}/${source.item}`;
    face.dataset.source = key;
    const handle = button('⠿', `drag-${face.dataset.k}`, () => face.click());
    handle.className = 'hero-drag-handle';
    handle.dataset.source = key;
    handle.setAttribute('aria-label', `${S.hero.dragItem} ${getItemDef(source.item)?.name ?? ''}`);
    cell.append(handle);
    return cell;
  }

  private renderEquipment(h: HeroState): HTMLElement {
    const panel = el('section', 'hero-gear-panel');
    panel.append(el('h3', '', S.hero.equipment));
    const slots = el('div', 'hero-gear-board');
    slots.append(figure(h));
    for (let s = 0; s < SLOT_COUNT; s++) {
      const id = h.eq[s];
      const bt = button(id >= 0 ? (getItemDef(id)?.name ?? S.hero.empty) : S.hero.empty, `eq${s}`, () => {
        if (id < 0) return;
        this.sel = this.sel?.from === 'eq' && this.sel.slot === s ? null : { from: 'eq', item: id, slot: s };
        this.render(true);
      }, SLOT_NAMES[s]);
      bt.prepend(itemIcon(id));
      bt.classList.toggle('sel', this.sel?.from === 'eq' && this.sel.slot === s);
      if (id >= 0) {
        this.ctx.tipOn(bt, formatItemTooltip(id, h));
        const item = getItemDef(id);
        if (item) {
          const isSet = isSetItem(item.name);
          const rarity = isSet ? 'set' : (item.rarity ?? (item.tier >= 5 ? 'unique' : item.tier >= 4 ? 'rare' : item.tier >= 2 ? 'magic' : 'normal'));
          bt.dataset.rarity = rarity;
          if (isSet) bt.classList.add('rarity-set');
        }
      }
      const cell = id < 0 ? el('div', 'hero-gear-cell') : this.cell(bt, { from: 'eq', item: id, slot: s });
      if (id < 0) cell.append(bt);
      cell.dataset.equipmentTarget = `eq${s}`;
      slots.append(cell);
    }
    panel.append(slots);
    return panel;
  }

  private renderPack(h: HeroState): HTMLElement {
    const panel = el('section', 'hero-gear-panel');
    panel.append(el('h3', '', `${S.hero.pack} (${h.inv.length}/${INV_MAX})`), this.weightLine(h));
    const back = el('div', 'hero-return', S.hero.returnToPack);
    back.dataset.equipmentTarget = 'pack';
    panel.append(back);
    const grid = el('div', 'items hero-pack-grid');
    for (let index = 0; index < PACK_PAGE; index++) {
      const n = this.page * PACK_PAGE + index;
      const st = h.inv[n];
      if (!st) {
        const empty = el('div', 'hero-pack-empty', S.hero.empty);
        empty.dataset.equipmentTarget = 'pack';
        grid.append(empty);
        continue;
      }
      const d = getItemDef(st.item);
      if (!d) continue;
      const bt = button(st.n > 1 ? `${d.name} x${st.n}` : d.name, `inv${n}`, () => {
        this.sel = this.sel?.from === 'inv' && this.sel.slot === n ? null : { from: 'inv', item: st.item, slot: n };
        this.render(true);
      }, `${S.hero.level} ${d.tier} · ${d.w * st.n} ${S.hero.weight.toLowerCase()}`);
      bt.prepend(itemIcon(st.item));
      bt.classList.toggle('sel', this.sel?.from === 'inv' && this.sel.slot === n);
      bt.classList.toggle('no', blocker(h, st.item) !== 0);
      this.ctx.tipOn(bt, formatItemTooltip(st.item, h));
      const isSet = isSetItem(d.name);
      const rarity = isSet ? 'set' : (d.rarity ?? (d.tier >= 5 ? 'unique' : d.tier >= 4 ? 'rare' : d.tier >= 2 ? 'magic' : 'normal'));
      bt.dataset.rarity = rarity;
      if (isSet) bt.classList.add('rarity-set');
      grid.append(this.cell(bt, { from: 'inv', item: st.item, slot: n }));
    }
    const pages = el('div', 'hero-pack-pages');
    const go = (delta: number) => {
      if (this.drag) return;
      this.page += delta;
      this.render(true);
    };
    const prev = button('‹', 'pack-prev', () => go(-1));
    const next = button('›', 'pack-next', () => go(1));
    const count = Math.max(1, Math.ceil(h.inv.length / PACK_PAGE));
    prev.disabled = this.page === 0;
    next.disabled = this.page + 1 >= count;
    prev.setAttribute('aria-label', S.town.previousPage);
    next.setAttribute('aria-label', S.town.nextPage);
    pages.append(prev, el('span', '', `${this.page + 1} / ${count}`), next);
    panel.append(grid, pages);
    if (!h.inv.length) panel.append(el('p', 'note', S.hero.noItems));
    return panel;
  }

  private detail(h: HeroState, sel: Sel): HTMLElement {
    const d = getItemDef(sel.item);
    const box = el('div', 'detail');
    if (!d) return box;
    box.append(renderItemTooltipDom(sel.item, h));
    const intent = this.intent(sel);
    const preview = equipmentPreview(h, this.ctx.sim().cb.hp[h.id] > 0, sel);
    const why = preview?.why ?? (sel.from === 'inv' ? blocker(h, sel.item) : 0);
    if (why) box.append(el('div', 'note', `⚠ ${WHY_TEXT[why]}`));
    if (preview && preview.replacement >= 0) box.append(el('p', 'note', `${S.hero.replaceEquipment} ${getItemDef(preview.replacement)?.name ?? ''}`));
    const acts = el('div', 'acts');
    if (preview) {
      const worn = sel.from === 'eq';
      const action = button(worn ? S.hero.unequip : S.hero.equip, worn ? 'act-unequip' : 'act-use', () => {
        if (intent) this.submit(intent);
      });
      action.disabled = !intent || why !== 0;
      acts.append(action);
    }
    if (sel.from === 'inv') {
      if (!preview) {
        const go = button(d.kind === Ik.Learn ? S.hero.learn : S.hero.use, 'act-use', () => this.act({ type: 'hero', op: 'use', item: sel.item }));
        go.disabled = why !== 0;
        acts.append(go);
      }
      acts.append(button(S.hero.drop, 'act-drop', () => this.act({ type: 'hero', op: 'drop', item: sel.item })));
    }
    box.append(acts);
    if (sel.from === 'inv') {
      box.append(el('div', 'note', S.hero.quickSlot));
      const qs = el('div', 'qs');
      for (let n = 0; n < 9; n++) qs.append(button(`F${n + 4}`, `qs${n}`, () => {
        this.ctx.setSlot(n, 100 + sel.item);
        this.ctx.toast(S.hero.slotSet);
      }));
      box.append(qs);
    }
    return box;
  }

  /** The creation sheet. `onStart` runs once with the choice. */
  showCreate(onStart: (cls: number, female: boolean, diff: number) => void): void {
    this.ctx.onOpen();
    this.close();
    let cls = 0;
    let female = false;
    let diff = 1;
    const draw = (): void => {
      const c = this.create;
      c.replaceChildren();
      const head = el('div', 'sheet-head');
      head.append(el('h2', '', S.hero.createTitle));
      c.append(head);
      const cols = el('div', 'cols');
      const left = el('div');
      const right = el('div');
      cols.append(left, right);
      const group = (title: string, names: readonly string[], cur: number, tips: readonly string[] | null, set: (n: number) => void): void => {
        left.append(el('h3', '', title));
        const row = el('div', 'choice');
        row.setAttribute('role', 'radiogroup');
        names.forEach((name, n) => {
          const b = button(name, `${title}${n}`, () => {
            set(n);
            draw();
            c.querySelector<HTMLElement>(`[data-k="${title}${n}"]`)?.focus();
          });
          b.setAttribute('aria-pressed', String(n === cur));
          if (tips) b.title = tips[n];
          row.append(b);
        });
        left.append(row);
        if (tips) left.append(el('p', 'note', tips[cur]));
      };
      group(S.hero.cls, S.hero.classes, cls, S.hero.classTips, (n) => (cls = n));
      group(S.hero.sex, S.hero.sexes, female ? 1 : 0, null, (n) => (female = n === 1));
      group(S.hero.diff, S.hero.diffs, diff, S.hero.diffTips, (n) => (diff = n));
      const st = startState(0, cls, female, diff);
      const d = derive(st);
      const spells = SPELLS.filter((_, sid) => ((st.known >>> sid) & 1) === 1).map((s) => s.name).join(', ');
      right.append(el('h3', '', S.hero.attributes));
      const lines = el('div', 'lines');
      for (let k = 0; k < 4; k++) lines.append(line(S.hero.attrs[k], String(d.attr[k]), S.hero.attrTips[k]));
      lines.append(line(S.hp, String(d.hpMax)), line(S.mana, String(d.manaMax)), line(S.hero.weight, `${d.capacity}`), line(S.spellsBtn, spells));
      right.append(lines);
      c.append(cols);
      const go = button(S.hero.start, 'start', () => {
        this.create.hidden = true;
        onStart(cls, female, diff);
      });
      go.style.marginTop = '12px';
      go.style.width = '100%';
      c.append(go);
    };
    draw();
    this.create.hidden = false;
    this.create.querySelector<HTMLElement>('[data-k="start"]')?.focus();
  }
}
