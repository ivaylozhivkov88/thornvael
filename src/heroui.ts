import { DEFS, Kind, M, MODN } from './sim/combat';
import { DIFF_NAMES, INV_MAX, SKILL_NAMES, SKILL_TIP, SKILL_MAX, WHY_TEXT, blocker, derive, equipmentStamp, startState, totals, type EquipmentAction, type HeroState } from './sim/hero';
import { equipmentAction, equipmentLayers, equipmentPreview, skillProgress, type EquipmentSource as Sel } from './hero-presentation';
import { ATTR_NAMES, CLS_BOTH, CLS_MAGE, CLS_WARRIOR, Cls, ITEMS, Ik, ItemDef, PART_NAMES, SLOT_COUNT, SLOT_NAMES, Slot, getItemDef, itemText } from './sim/items';
import { findSetByItemName, isSetItem, type SetBonus } from './sim/sets';
import type { Command, Sim } from './sim/sim';
import { SPELLS } from './sim/spelldata';
import { S } from './strings';
import { itemIcon } from './townicons';
import { CodexUi } from './codexui';
import { playPickupRustle, playEquipSfx } from './audio';

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

import { figure, slotWatermarkIcon } from './hero-figure';
import { PaperdollController, type Drag, type EquipmentIntent } from './paperdoll';

export { figure, slotWatermarkIcon, PaperdollController, type Drag, type EquipmentIntent };

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
  root.className = 'item-tooltip-box diablo-card';
  if (!d) return root;

  const isSet = isSetItem(d.name);
  const rarity = isSet ? 'set' : (d.rarity ?? (d.tier >= 5 ? 'unique' : d.tier >= 4 ? 'rare' : d.tier >= 2 ? 'magic' : 'normal'));
  root.dataset.rarity = rarity;

  // Header: Item Name with Rarity Class
  const title = document.createElement('div');
  title.className = `item-title rarity-${rarity}`;
  title.textContent = d.name;
  root.append(title);

  // Ornate Gold Filigree Divider
  const divider = document.createElement('div');
  divider.className = 'card-filigree-divider';
  const gem = document.createElement('span');
  gem.className = 'gem';
  gem.textContent = '◆';
  divider.append(gem);
  root.append(divider);

  // Subtitle: Kind, Tier, Weight
  const kind = d.kind === Ik.Gear ? SLOT_NAMES[d.slot] : d.kind === Ik.Potion ? 'Potion' : d.w > 1 ? 'Tome' : 'Scroll';
  const sub = document.createElement('div');
  sub.className = 'item-sub-meta';
  sub.textContent = `${kind} · Level ${d.tier} · Weight ${d.w}`;
  root.append(sub);

  // Requirements Section (Attributes & Class)
  const reqsBox = document.createElement('div');
  reqsBox.className = 'item-requirements-box';

  if (d.needv > 0) {
    const currentAttr = hero ? totals(hero)[d.need] : 0;
    const met = !hero || currentAttr >= d.needv;
    const reqLine = document.createElement('div');
    reqLine.className = `item-req ${met ? 'req-met' : 'req-unmet'}`;
    reqLine.textContent = `${met ? '✓' : '✗'} Requires ${ATTR_NAMES[d.need]} ${d.needv}${!met ? ` (Current: ${currentAttr})` : ''}`;
    reqsBox.append(reqLine);
  }

  if (d.kind === Ik.Gear) {
    const classReq = document.createElement('div');
    if (d.cls === CLS_WARRIOR) {
      const wrong = hero && hero.cls === Cls.Mage;
      classReq.className = `item-class-req ${wrong ? 'req-unmet' : 'req-class-ok'}`;
      classReq.textContent = wrong ? '⚠ Cannot equip: Warrior Only' : 'Warrior Only';
      reqsBox.append(classReq);
    } else if (d.cls === CLS_MAGE) {
      const wrong = hero && hero.cls === Cls.Warrior;
      classReq.className = `item-class-req ${wrong ? 'req-unmet' : 'req-class-ok'}`;
      classReq.textContent = wrong ? '⚠ Cannot equip: Mage Only' : 'Mage Only';
      reqsBox.append(classReq);
    } else {
      classReq.className = 'item-class-req req-class-all';
      classReq.textContent = 'Warriors & Mages';
      reqsBox.append(classReq);
    }
  }

  if (reqsBox.hasChildNodes()) {
    root.append(reqsBox);
  }

  // Detailed Affixes & Stats List
  const stats = document.createElement('div');
  stats.className = 'item-stats-list';

  if (d.max > 0) {
    const div = document.createElement('div');
    div.className = 'item-stat-row damage-row';
    div.innerHTML = `<span class="stat-bullet">⚔</span> Blow Damage: <b class="stat-highlight">+${d.min}–${d.max} Physical</b>`;
    stats.append(div);
  }
  if (d.acc) {
    const div = document.createElement('div');
    div.className = 'item-stat-row acc-row';
    div.innerHTML = `<span class="stat-bullet">🎯</span> Attack Rating: <b class="stat-highlight">+${d.acc}</b>`;
    stats.append(div);
  }
  if (d.cover && (d.def || d.abs)) {
    const parts = PART_NAMES.filter((_, k) => (d.cover >> k) & 1).join(', ');
    const div = document.createElement('div');
    div.className = 'item-stat-row armor-row';
    div.innerHTML = `<span class="stat-bullet">🛡</span> Armor (${parts}): <b class="stat-highlight">+${d.def} Def, +${d.abs} Absorb</b>`;
    stats.append(div);
  }
  d.res.forEach((v, n) => {
    if (v) {
      const div = document.createElement('div');
      div.className = `item-stat-row res-row res-${SCHOOL_NAMES[n]}`;
      div.innerHTML = `<span class="stat-bullet">✦</span> Resist ${SCHOOL_NAMES[n]}: <b class="stat-highlight">+${v}%</b>`;
      stats.append(div);
    }
  });
  d.attr.forEach((v, n) => {
    if (v) {
      const div = document.createElement('div');
      div.className = 'item-stat-row attr-row';
      div.innerHTML = `<span class="stat-bullet">◈</span> +${v} to ${ATTR_NAMES[n]}`;
      stats.append(div);
    }
  });
  if (d.hp) {
    const div = document.createElement('div');
    div.className = 'item-stat-row hp-row';
    div.innerHTML = `<span class="stat-bullet">❤️</span> +${d.hp} Life`;
    stats.append(div);
  }
  if (d.mana) {
    const div = document.createElement('div');
    div.className = 'item-stat-row mana-row';
    div.innerHTML = `<span class="stat-bullet">🔷</span> +${d.mana} Mana`;
    stats.append(div);
  }
  if (d.pow) {
    const div = document.createElement('div');
    div.className = 'item-stat-row pow-row';
    div.innerHTML = `<span class="stat-bullet">🔮</span> +${d.pow}% Spell Power`;
    stats.append(div);
  }
  if (d.heal) {
    const div = document.createElement('div');
    div.className = 'item-stat-row heal-row';
    div.innerHTML = `<span class="stat-bullet">🧪</span> Restores ${d.heal} Life`;
    stats.append(div);
  }
  if (d.restore) {
    const div = document.createElement('div');
    div.className = 'item-stat-row restore-row';
    div.innerHTML = `<span class="stat-bullet">🧪</span> Restores ${d.restore} Mana`;
    stats.append(div);
  }
  if (d.grow) {
    const div = document.createElement('div');
    div.className = 'item-stat-row grow-row';
    div.innerHTML = `<span class="stat-bullet">✨</span> Raises ${ATTR_NAMES[d.grow - 1]} permanently by +1`;
    stats.append(div);
  }
  if (d.spell >= 0 && SPELLS[d.spell]) {
    const div = document.createElement('div');
    div.className = 'item-stat-row spell-row';
    div.innerHTML = `<span class="stat-bullet">📜</span> Teaches ${SPELLS[d.spell].name}`;
    stats.append(div);
  }

  if (stats.hasChildNodes()) {
    root.append(stats);
  }

  // Set Info Section
  const setDef = findSetByItemName(d.name);
  if (setDef) {
    const equippedNames = hero
      ? hero.eq.filter((id) => id >= 0).map((id) => getItemDef(id)?.name).filter(Boolean)
      : [];
    const equippedCount = setDef.pieces.filter((piece) => equippedNames.includes(piece.name)).length;

    const setSection = document.createElement('div');
    setSection.className = 'card-set-section';

    const setHeader = document.createElement('div');
    setHeader.className = 'set-name-header';
    setHeader.textContent = `Set: ${setDef.name} (${equippedCount}/${setDef.pieces.length})`;
    setSection.append(setHeader);

    const piecesList = document.createElement('ul');
    piecesList.className = 'set-pieces-list';
    for (const piece of setDef.pieces) {
      const isEquipped = equippedNames.includes(piece.name);
      const li = document.createElement('li');
      li.className = `set-piece ${isEquipped ? 'equipped' : 'unequipped'}`;
      li.textContent = `${isEquipped ? '✓ ' : '• '}${piece.name}`;
      piecesList.append(li);
    }
    setSection.append(piecesList);

    const bonusesDiv = document.createElement('div');
    bonusesDiv.className = 'set-bonuses';
    for (const bonus of setDef.bonuses) {
      const active = equippedCount >= bonus.pieces;
      const bDiv = document.createElement('div');
      bDiv.className = active ? 'set-bonus-active' : 'set-bonus-inactive';
      bDiv.textContent = `(${bonus.pieces} Pieces) ${formatBonusStats(bonus)}`;
      bonusesDiv.append(bDiv);
    }
    setSection.append(bonusesDiv);
    root.append(setSection);
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
  private readonly paperdoll: PaperdollController;
  private pending: { sim: Sim; tick: number } | null = null;
  private readonly feedback = el('p', 'hero-equipment-feedback');
  private readonly codexUi: CodexUi;
  private readonly cardTooltip: HTMLElement = el('div', 'hero-floating-card-tooltip');

  get drag(): Drag | null {
    return this.paperdoll.drag;
  }

  get suppressedPointer(): number | null {
    return this.paperdoll.suppressedPointer;
  }
  set suppressedPointer(v: number | null) {
    this.paperdoll.suppressedPointer = v;
  }

  constructor(private readonly ctx: HeroUiCtx) {
    this.codexUi = new CodexUi((el, tip) => this.ctx.tipOn(el, tip));
    this.cardTooltip.hidden = true;
    document.body.append(this.cardTooltip);
    this.feedback.setAttribute('role', 'status');
    this.paperdoll = new PaperdollController({
      sheet: this.sheet,
      body: this.body,
      getSim: () => this.ctx.sim(),
      queue: (cmd) => this.ctx.queue(cmd),
      feedback: this.feedback,
      isPending: () => this.pending !== null,
      setPending: (p) => { this.pending = p; },
      render: (keepFocus) => this.render(keepFocus ?? false),
      hideCardTooltip: () => this.hideCardTooltip(),
    });
    this.sheet.addEventListener('pointerdown', (e) => this.paperdoll.press(e));
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
    return this.paperdoll.intent(source);
  }

  private preview(intent: EquipmentIntent) {
    return this.paperdoll.preview(intent);
  }

  private submit(intent: EquipmentIntent): void {
    this.paperdoll.submit(intent);
  }

  private showCardTooltip(itemId: number, anchor: HTMLElement): void {
    if (!this.cardTooltip) return;
    const sim = this.ctx.sim();
    const hero = sim.hero;
    this.cardTooltip.replaceChildren(renderItemTooltipDom(itemId, hero));
    this.cardTooltip.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const tipRect = this.cardTooltip.getBoundingClientRect();
    let left = rect.right + 10;
    if (left + tipRect.width > window.innerWidth - 12) {
      left = Math.max(12, rect.left - tipRect.width - 10);
    }
    const top = Math.max(12, Math.min(window.innerHeight - tipRect.height - 12, rect.top));
    this.cardTooltip.style.left = `${left}px`;
    this.cardTooltip.style.top = `${top}px`;
  }

  private hideCardTooltip(): void {
    if (this.cardTooltip) this.cardTooltip.hidden = true;
  }

  private cancelDrag(message = ''): void {
    this.paperdoll.cancelDrag(message);
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
    this.hideCardTooltip();
    this.sheet.hidden = true;
  }

  toggle(tab?: Tab): void {
    if (this.isOpen && (tab === undefined || this.tab === tab)) this.close();
    else this.open(tab ?? this.tab);
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
    const base = DEFS[Kind.Hero];
    const o = i * MODN;

    const b = el('details', 'hero-stats');
    b.open = open;
    b.append(el('summary', '', S.hero.heroStats));

    // 1. Hero Level & Ornate Gold Progress Bar
    const heroLevel = h.level ?? 1;
    const xpCur = h.xp ?? 0;
    const xpMax = h.xpNext ?? 100;
    const overallProgressPct = Math.min(100, Math.round((xpCur / Math.max(1, xpMax)) * 100));

    const levelWrap = el('div', 'hero-level-wrap');
    const levelTitle = el('div', 'hero-level-title');
    levelTitle.innerHTML = `<span class="hl-class">${S.hero.classes[h.cls]}</span> · <span class="hl-badge">Level ${heroLevel}</span> <span class="hl-pct">${xpCur}/${xpMax} XP (${overallProgressPct}%)${h.statPoints ? ` · <b style="color:#ffd700">+${h.statPoints} Stat Points Available</b>` : ''}</span>`;

    const goldProgressBar = el('div', 'hero-gold-progress-bar');
    const goldProgressFill = el('div', 'gold-progress-fill');
    goldProgressFill.style.width = `${overallProgressPct}%`;
    goldProgressBar.append(goldProgressFill);
    levelWrap.append(levelTitle, goldProgressBar);
    b.append(levelWrap);

    // 2. Vitality & Mana Gothic Resource Gauges
    const gaugesRow = el('div', 'hero-resource-gauges');

    const hpGauge = el('div', 'resource-gauge hp-gauge');
    const hpFill = el('div', 'resource-fill hp-fill');
    hpFill.style.width = `${Math.max(0, Math.min(100, (cb.hp[i] / Math.max(1, cb.hpMax[i])) * 100))}%`;
    const hpInfo = el('div', 'resource-info');
    hpInfo.innerHTML = `<span class="res-title">❤️ Life: <b>${cb.hp[i]} / ${cb.hpMax[i]}</b></span><span class="res-sub">+${1 + cb.mod[o + M.Regen]}/sec regen</span>`;
    hpGauge.append(hpFill, hpInfo);

    const mpGauge = el('div', 'resource-gauge mp-gauge');
    const mpFill = el('div', 'resource-fill mp-fill');
    mpFill.style.width = `${Math.max(0, Math.min(100, (cb.mana[i] / Math.max(1, cb.manaMax[i])) * 100))}%`;
    const mpInfo = el('div', 'resource-info');
    mpInfo.innerHTML = `<span class="res-title">🔷 Mana: <b>${cb.mana[i]} / ${cb.manaMax[i]}</b></span><span class="res-sub">+${cb.mod[o + M.Pow]}% spell power</span>`;
    mpGauge.append(mpFill, mpInfo);

    gaugesRow.append(hpGauge, mpGauge);
    b.append(gaugesRow);

    // 3. Two Column Layout: Left = Primary Attributes & Skills; Right = Combat Stats & Resistances
    const cols = el('div', 'hero-char-cols');

    // Left Column
    const left = el('div', 'hero-char-left');

    // Four Primary Attributes
    left.append(el('h3', 'section-hdr', S.hero.attributes));
    const attrGrid = el('div', 'hero-attr-grid');
    const attrCrests = ['🛡', '🦅', '👁', '☀️'];
    const attrSub = [
      'Increases blow damage & item carry weight',
      'Increases attack rating & dodge defense',
      'Increases mana pool & spell effectiveness',
      'Increases mana recovery & magic resistance',
    ];

    for (let k = 0; k < 4; k++) {
      const bonus = d.attr[k] - h.attr[k];
      const card = el('div', 'hero-attr-card');
      card.title = `${S.hero.attrTips[k]} (${attrSub[k]})`;

      const iconBox = el('div', `attr-crest-box attr-c-${k}`);
      iconBox.textContent = attrCrests[k];

      const textBox = el('div', 'attr-text-box');
      const nameSpan = el('div', 'attr-name', S.hero.attrs[k]);
      const valSpan = el('div', 'attr-val');
      valSpan.innerHTML = bonus
        ? `<b class="attr-total">${d.attr[k]}</b> <small class="attr-breakdown">(${h.attr[k]}${bonus > 0 ? '+' : ''}${bonus})</small>`
        : `<b class="attr-total">${d.attr[k]}</b>`;
      textBox.append(nameSpan, valSpan);

      const elixir = h.inv.find((s) => getItemDef(s.item)?.grow === k + 1);
      const hasPoints = (h.statPoints ?? 0) > 0;
      const plusBtn = el('button', `attr-plus-btn ${hasPoints || elixir ? 'active' : 'locked'}`);
      plusBtn.type = 'button';
      plusBtn.textContent = '+';
      if (hasPoints) {
        plusBtn.title = `Allocate 1 Stat Point to ${ATTR_NAMES[k]} (${h.statPoints} points remaining)`;
        plusBtn.onclick = (e) => {
          e.stopPropagation();
          this.act({ type: 'hero', op: 'stat', attr: k });
        };
      } else if (elixir) {
        plusBtn.title = `Drink ${getItemDef(elixir.item)?.name ?? 'Elixir'} (+1 ${ATTR_NAMES[k]})`;
        plusBtn.onclick = (e) => {
          e.stopPropagation();
          this.act({ type: 'hero', op: 'use', item: elixir.item });
        };
      } else {
        plusBtn.title = `Raise attributes with level-up stat points or rare Elixirs`;
        plusBtn.disabled = true;
      }

      card.append(iconBox, textBox, plusBtn);
      attrGrid.append(card);
    }
    left.append(attrGrid);

    // Hero Skills (Blade, Guard, Sorcery)
    left.append(el('h3', 'section-hdr', S.hero.skills));
    const skillsContainer = el('div', 'hero-skills-list');
    const skillIcons = ['⚔', '🛡', '🔮'];
    const skillEffects = [
      (lvl: number) => `+${lvl * 5}% Blow Damage`,
      (lvl: number) => `+${Math.floor(lvl / 3)} Damage Absorb`,
      (lvl: number) => `+${lvl * 4}% Spell Power`,
    ];

    for (let k = 0; k < 3; k++) {
      const { level, used, needed, remaining } = skillProgress(h, k);
      const card = el('div', 'hero-skill-card');
      card.dataset.skill = String(k);

      const hdr = el('div', 'skill-card-hdr');
      hdr.innerHTML = `<span class="skill-icon-name">${skillIcons[k]} ${SKILL_NAMES[k]}</span> <span class="skill-rank-badge">Rank ${level} / ${SKILL_MAX}</span>`;

      const gaugeWrap = el('div', 'skill-gauge-wrap');
      const gaugeFill = el('div', 'skill-gauge-fill');
      const pct = needed === null ? 100 : Math.min(100, (used / needed) * 100);
      gaugeFill.style.width = `${pct}%`;
      gaugeWrap.append(gaugeFill);

      const desc = el('div', 'skill-card-desc');
      const summary = needed === null ? 'Mastered (Maximum Level)' : `${used} / ${needed} uses · ${remaining} to Rank ${level + 1}`;
      desc.innerHTML = `<span class="skill-summary">${summary}</span> <span class="skill-bonus">(${skillEffects[k](level)})</span>`;

      card.append(hdr, gaugeWrap, desc);
      skillsContainer.append(card);
    }
    left.append(skillsContainer);

    // Right Column: Combat Statistics & Elemental Resistances
    const right = el('div', 'hero-char-right');

    right.append(el('h3', 'section-hdr', S.hero.stats));
    const combatGrid = el('div', 'combat-stats-grid');

    const totalAcc = base.acc + cb.mod[o + M.Acc];
    const hitChance = Math.max(15, Math.min(95, 70 + (totalAcc - 4) * 3));
    const tileAcc = el('div', 'combat-stat-tile');
    tileAcc.innerHTML = `<div class="cstat-icon">🎯</div><div class="cstat-body"><div class="cstat-label">${S.hit}</div><div class="cstat-val">${totalAcc} <small class="cstat-sub">(~${hitChance}% Hit)</small></div></div>`;
    tileAcc.title = `Attack Rating against standard defense. Base: ${base.acc}, Mod: ${cb.mod[o + M.Acc]}`;

    const minDmg = base.min + cb.mod[o + M.Min];
    const maxDmg = base.max + cb.mod[o + M.Max];
    const tileDmg = el('div', 'combat-stat-tile');
    tileDmg.innerHTML = `<div class="cstat-icon">⚔</div><div class="cstat-body"><div class="cstat-label">${S.hero.blowDamage}</div><div class="cstat-val">${minDmg}–${maxDmg} <small class="cstat-sub">Physical</small></div></div>`;
    tileDmg.title = `Weapon and blow damage range per hit`;

    const avgDef = Math.round(S.parts.reduce((sum, _, k) => sum + (base.def + cb.mod[o + M.Def] + base.pdef[k] + cb.mod[o + M.PDef + k]), 0) / 4);
    const avgAbs = Math.round(S.parts.reduce((sum, _, k) => sum + (cb.mod[o + M.Abs] + base.pabs[k] + cb.mod[o + M.PAbs + k]), 0) / 4);
    const tileArmor = el('div', 'combat-stat-tile');
    const partDetails = S.parts.map((p, k) => `${p}: ${base.def + cb.mod[o + M.Def] + base.pdef[k] + cb.mod[o + M.PDef + k]} Def / ${cb.mod[o + M.Abs] + base.pabs[k] + cb.mod[o + M.PAbs + k]} Abs`).join(' · ');
    tileArmor.innerHTML = `<div class="cstat-icon">🛡</div><div class="cstat-body"><div class="cstat-label">Armor Absorption</div><div class="cstat-val">${avgDef} Def <span class="cstat-sep">/</span> ${avgAbs} Abs</div></div>`;
    tileArmor.title = partDetails;

    const hasShield = h.eq[Slot.Shield] >= 0;
    const blockChance = hasShield ? Math.min(75, 20 + h.skill[1] * 3 + (getItemDef(h.eq[Slot.Shield])?.def ?? 0) * 2) : 0;
    const tileBlock = el('div', 'combat-stat-tile');
    tileBlock.innerHTML = `<div class="cstat-icon">🔰</div><div class="cstat-body"><div class="cstat-label">Block Chance</div><div class="cstat-val">${blockChance}% <small class="cstat-sub">${hasShield ? 'Shield Active' : 'No Shield'}</small></div></div>`;
    tileBlock.title = hasShield ? `Shield Block chance scaling with Guard Skill (Rank ${h.skill[1]}) and Shield Defense` : `Requires an equipped offhand shield`;

    combatGrid.append(tileAcc, tileDmg, tileArmor, tileBlock);
    right.append(combatGrid);

    // Elemental Resistances Grid with Colored Shield Badges
    right.append(el('h3', 'section-hdr', 'Elemental Resistances'));
    const resGrid = el('div', 'elemental-res-grid');
    const resMeta = [
      { name: 'Fire', color: 'ruby', icon: '🔥', cap: 90 },
      { name: 'Cold', color: 'frost', icon: '❄', cap: 90 },
      { name: 'Lightning', color: 'amber', icon: '⚡', cap: 90 },
      { name: 'Poison', color: 'emerald', icon: '🍃', cap: 90 },
      { name: 'Astral', color: 'amethyst', icon: '🔮', cap: 90 },
    ];

    for (let k = 0; k < 5; k++) {
      const val = Math.min(resMeta[k].cap, base.res[k] + cb.mod[o + M.Res + k]);
      const badge = el('div', `res-shield-badge res-badge-${resMeta[k].color}`);
      badge.innerHTML = `
        <div class="badge-icon">${resMeta[k].icon}</div>
        <div class="badge-text">
          <span class="badge-name">${resMeta[k].name}</span>
          <span class="badge-val">${val}%</span>
        </div>
      `;
      badge.title = `${resMeta[k].name} Resistance: ${val}% (reduces incoming ${resMeta[k].name.toLowerCase()} spell and environmental damage)`;
      resGrid.append(badge);
    }
    right.append(resGrid);

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
      const d = id >= 0 ? getItemDef(id) : null;
      const bt = el('button');
      bt.type = 'button';
      bt.dataset.k = `eq${s}`;
      if (id >= 0 && d) {
        bt.className = 'slot-btn slot-equipped';
        bt.append(itemIcon(id));
        const labelBox = el('div', 'slot-text-wrap');
        labelBox.append(el('span', 'slot-item-name', d.name));
        labelBox.append(el('small', 'slot-meta-name', `${SLOT_NAMES[s]} · T${d.tier}`));
        bt.append(labelBox);
        this.ctx.tipOn(bt, formatItemTooltip(id, h));
        const isSet = isSetItem(d.name);
        const rarity = isSet ? 'set' : (d.rarity ?? (d.tier >= 5 ? 'unique' : d.tier >= 4 ? 'rare' : d.tier >= 2 ? 'magic' : 'normal'));
        bt.dataset.rarity = rarity;
        if (isSet) bt.classList.add('rarity-set');
        bt.addEventListener('pointerenter', (e) => {
          if ((e as PointerEvent).pointerType !== 'touch') this.showCardTooltip(id, bt);
        });
        bt.addEventListener('pointerleave', () => this.hideCardTooltip());
      } else {
        bt.className = 'slot-btn slot-empty';
        bt.append(slotWatermarkIcon(s));
        const labelBox = el('div', 'slot-text-wrap');
        labelBox.append(el('span', 'slot-empty-title', SLOT_NAMES[s]));
        labelBox.append(el('small', 'slot-empty-sub', S.hero.empty));
        bt.append(labelBox);
      }
      bt.onclick = () => {
        if (this.sel && this.sel.from === 'inv') {
          // Click-to-place: user selected an inventory item, now clicks an equipment slot
          const intent = this.intent(this.sel);
          if (intent) {
            const preview = this.preview(intent);
            if (preview && preview.target === `eq${s}` && !preview.why) {
              const def = getItemDef(this.sel.item);
              const isMetal = def ? (def.tier >= 3 || /sword|blade|iron|steel|plate|mail|shield|helm/i.test(def.name)) : true;
              playEquipSfx(isMetal);
              this.sel = null;
              this.submit(intent);
              return;
            }
          }
        }
        if (id < 0) return;
        this.hideCardTooltip();
        this.sel = this.sel?.from === 'eq' && this.sel.slot === s ? null : { from: 'eq', item: id, slot: s };
        if (this.sel) playPickupRustle();
        this.render(true);
      };
      bt.oncontextmenu = (e) => {
        if (id < 0) return;
        e.preventDefault();
        e.stopPropagation();
        const intent = this.intent({ from: 'eq', item: id, slot: s });
        if (intent) {
          playPickupRustle();
          this.submit(intent);
        }
      };
      bt.ondblclick = (e) => {
        if (id < 0) return;
        e.preventDefault();
        e.stopPropagation();
        const intent = this.intent({ from: 'eq', item: id, slot: s });
        if (intent) {
          playPickupRustle();
          this.submit(intent);
        }
      };
      bt.classList.toggle('sel', this.sel?.from === 'eq' && this.sel.slot === s);
      const cell = id < 0 ? el('div', 'hero-gear-cell') : this.cell(bt, { from: 'eq', item: id, slot: s });
      if (id < 0) cell.append(bt);
      cell.dataset.equipmentTarget = `eq${s}`;
      slots.append(cell);
    }

    // Waist: Belt slot (displays belt / potion belt status)
    const beltCell = el('div', 'hero-gear-cell');
    beltCell.dataset.equipmentTarget = 'eq8';
    const beltBt = el('button', 'slot-btn slot-empty');
    beltBt.type = 'button';
    beltBt.dataset.k = 'eq8';
    beltBt.append(slotWatermarkIcon(8));
    const beltLabel = el('div', 'slot-text-wrap');
    beltLabel.append(el('span', 'slot-empty-title', 'Waist (Belt)'));
    const beltCount = h.inv.filter((s) => getItemDef(s.item)?.kind === Ik.Potion).reduce((sum, s) => sum + s.n, 0);
    beltLabel.append(el('small', 'slot-empty-sub', beltCount > 0 ? `${beltCount} Potions` : 'Potion Belt'));
    beltBt.append(beltLabel);
    beltBt.title = 'Waist Belt: Quick-quaff potion belt (Keys 1-4)';
    beltCell.append(beltBt);
    slots.append(beltCell);

    // Finger 2 (Right Ring) slot
    const ring2Cell = el('div', 'hero-gear-cell finger-2');
    ring2Cell.dataset.equipmentTarget = 'eq5';
    const ring2Bt = el('button', 'slot-btn slot-empty');
    ring2Bt.type = 'button';
    ring2Bt.dataset.k = 'eq5_alt';
    ring2Bt.append(slotWatermarkIcon(Slot.Ring));
    const ring2Label = el('div', 'slot-text-wrap');
    ring2Label.append(el('span', 'slot-empty-title', 'Finger 2 (Ring)'));
    ring2Label.append(el('small', 'slot-empty-sub', S.hero.empty));
    ring2Bt.append(ring2Label);
    ring2Bt.title = 'Finger 2 (Ring): Secondary ring finger';
    ring2Cell.append(ring2Bt);
    slots.append(ring2Cell);

    panel.append(slots);
    return panel;
  }

  private renderPack(h: HeroState): HTMLElement {
    const panel = el('section', 'hero-gear-panel');
    panel.append(el('h3', '', `${S.hero.pack} (${h.inv.length}/${INV_MAX})`), this.weightLine(h));
    const back = el('div', 'hero-return', S.hero.returnToPack);
    back.dataset.equipmentTarget = 'pack';
    back.onclick = () => {
      if (this.sel && this.sel.from === 'eq') {
        const intent = this.intent(this.sel);
        if (intent) {
          playPickupRustle();
          this.sel = null;
          this.submit(intent);
        }
      }
    };
    panel.append(back);
    const grid = el('div', 'items hero-pack-grid');
    for (let index = 0; index < PACK_PAGE; index++) {
      const n = this.page * PACK_PAGE + index;
      const st = h.inv[n];
      if (!st) {
        const empty = el('div', 'hero-pack-empty', S.hero.empty);
        empty.dataset.equipmentTarget = 'pack';
        empty.onclick = () => {
          if (this.sel && this.sel.from === 'eq') {
            const intent = this.intent(this.sel);
            if (intent) {
              playPickupRustle();
              this.sel = null;
              this.submit(intent);
            }
          }
        };
        grid.append(empty);
        continue;
      }
      const d = getItemDef(st.item);
      if (!d) continue;
      const bt = button(st.n > 1 ? `${d.name} x${st.n}` : d.name, `inv${n}`, () => {
        this.hideCardTooltip();
        this.sel = this.sel?.from === 'inv' && this.sel.slot === n ? null : { from: 'inv', item: st.item, slot: n };
        if (this.sel) playPickupRustle();
        this.render(true);
      }, `${S.hero.level} ${d.tier} · ${d.w * st.n} ${S.hero.weight.toLowerCase()}`);
      bt.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const intent = this.intent({ from: 'inv', item: st.item, slot: n });
        if (intent) {
          const preview = this.preview(intent);
          if (preview && !preview.why) {
            const def = getItemDef(st.item);
            const isMetal = def ? (def.tier >= 3 || /sword|blade|iron|steel|plate|mail|shield|helm/i.test(def.name)) : true;
            playEquipSfx(isMetal);
            this.submit(intent);
          }
        }
      };
      bt.ondblclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const intent = this.intent({ from: 'inv', item: st.item, slot: n });
        if (intent) {
          const preview = this.preview(intent);
          if (preview && !preview.why) {
            const def = getItemDef(st.item);
            const isMetal = def ? (def.tier >= 3 || /sword|blade|iron|steel|plate|mail|shield|helm/i.test(def.name)) : true;
            playEquipSfx(isMetal);
            this.submit(intent);
          }
        }
      };
      bt.prepend(itemIcon(st.item));
      bt.classList.toggle('sel', this.sel?.from === 'inv' && this.sel.slot === n);
      bt.classList.toggle('no', blocker(h, st.item) !== 0);
      this.ctx.tipOn(bt, formatItemTooltip(st.item, h));
      const isSet = isSetItem(d.name);
      const rarity = isSet ? 'set' : (d.rarity ?? (d.tier >= 5 ? 'unique' : d.tier >= 4 ? 'rare' : d.tier >= 2 ? 'magic' : 'normal'));
      bt.dataset.rarity = rarity;
      if (isSet) bt.classList.add('rarity-set');
      bt.addEventListener('pointerenter', (e) => {
        if ((e as PointerEvent).pointerType !== 'touch') this.showCardTooltip(st.item, bt);
      });
      bt.addEventListener('pointerleave', () => this.hideCardTooltip());
      grid.append(this.cell(bt, { from: 'inv', item: st.item, slot: n }));
    }
    const pages = el('div', 'hero-pack-pages');
    const go = (delta: number) => {
      if (this.drag) return;
      this.hideCardTooltip();
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
