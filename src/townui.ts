import { DEFS } from './sim/combat';
import { mercPrice } from './sim/difficulty';
import { INV_MAX, SKILL_MAX, SKILL_NAMES, WHY_TEXT, Why, blocker } from './sim/hero';
import { ITEMS, getItemDef, itemText, Ik, Slot } from './sim/items';
import { formatItemTooltip, renderItemTooltipDom } from './heroui';
import { isSetItem } from './sim/sets';
import type { Sim } from './sim/sim';
import { SPELLS } from './sim/spelldata';
import { OFFERS, QuestType, ROLE_COUNT, Role, SHELF, gambleCost, priceOf, sellPrice, spellPrice, trainPrice, type Quest, type TownCommand } from './sim/town';
import { S } from './strings';
import { itemIcon } from './townicons';
import { equipmentLayers } from './hero-presentation';
import { buildDoll, dollSet, lookFor } from './doll';
import { playTraderBark, playTownAmbience, stopTownAmbience, playEquipSfx } from './audio';

/**
 * Building screens: tavern (mercenaries, quest board), shop (one trade screen) and school. The game is
 * paused while one is open; every action is a town command applied at once with sim.now.
 */

export interface TownUiCtx {
  sim: () => Sim;
  pause: (on: boolean) => void;
  /** Hero sheet, quick slots and stats changed. */
  changed: () => void;
  tipOn: (b: HTMLElement, text: string) => void;
  /** Called after a screen opens so the host can close other overlays. */
  onOpen: () => void;
  onShopEnter: () => void;
  onShopLeave: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function button(text: string, onclick: () => void, small = ''): HTMLButtonElement {
  const b = el('button');
  b.type = 'button';
  b.append(text);
  if (small) b.append(el('small', '', small));
  b.onclick = onclick;
  return b;
}

/** One line describing a quest, from its type and numbers. */
export function questText(sim: Sim, q: Quest): string {
  const kind = q.type === QuestType.Slay ? DEFS[sim.cb.kind[q.a]].name : DEFS[q.a]?.name ?? '';
  const n = q.type === QuestType.Cull ? q.b : q.type === QuestType.Clear ? q.ids.length : q.a;
  return S.town.questText[q.type]
    .replace('{kind}', kind.toLowerCase())
    .replace('{n}', String(n))
    .replace('{x}', String(q.pts[0] ?? ''))
    .replace('{y}', String(q.pts[1] ?? ''))
    .replace('{item}', getItemDef(q.a)?.name ?? '')
    .replace('{skill}', SKILL_NAMES[q.a] ?? '');
}

/** Moods of the shopkeeper: index into S.town.keeper and a CSS class. */
const MOOD = ['greet', 'pleased', 'sorry', 'farewell', 'thinking', 'pleased', 'sorry'] as const;

export class TownUi {
  private readonly root: HTMLElement;
  private town = -1;
  private role = -1;
  // Pending selections use slot identity; duplicate gear copies remain independent.
  private buys: number[] = [];
  private sells: number[] = [];
  private picks: { kind: 'b' | 's'; value: number }[] = [];
  private shelfPage = 0;
  private packPage = 0;
  private detailItem = -1;
  private mercIndex = 0;
  private mood = 0;
  private moodTimer = 0;
  private exitTimer = 0;
  private previousFocus: HTMLElement | null = null;
  private inertSiblings: [HTMLElement, boolean][] = [];
  private readonly cardTooltip: HTMLElement = el('div', 'hero-floating-card-tooltip');
  private shopUndoBtn: HTMLButtonElement | null = null;
  private shopBuyBtn: HTMLButtonElement | null = null;
  private shopSellBtn: HTMLButtonElement | null = null;

  constructor(private readonly ctx: TownUiCtx) {
    this.root = el('div', 'sheet town');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.tabIndex = -1;
    this.cardTooltip.hidden = true;
    document.body.append(this.cardTooltip);
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      if (event.key === 'Tab') {
        const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const first = buttons[0], last = buttons.at(-1);
        if (first && (event.shiftKey ? document.activeElement === first || document.activeElement === this.root : document.activeElement === last || document.activeElement === this.root)) {
          event.preventDefault(); (event.shiftKey ? last : first)?.focus();
        }
      }
      // Modal owns gameplay shortcuts; native button Enter/Space and Tab remain usable.
      event.stopPropagation();
    });
    this.root.hidden = true;
    document.body.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  private cmd(op: TownCommand['op'], v?: number, list?: number[]): void {
    this.ctx.sim().now({ type: 'town', op, town: this.town, v, list });
  }

  /** Try to go in. Returns false when the sim refused (too far, hero down); the refusal shows as a toast. */
  enter(town: number, role: number): boolean {
    if (this.open) this.close();
    const sim = this.ctx.sim();
    sim.now({ type: 'town', op: 'enter', town, v: role });
    if (sim.town.inside !== town * ROLE_COUNT + role) return false;
    this.town = town;
    this.role = role;
    this.buys = [];
    this.sells = [];
    this.picks = [];
    clearTimeout(this.exitTimer);
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.inertSiblings = [...document.body.children]
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== this.root)
      .map((node) => [node, node.inert]);
    for (const [node] of this.inertSiblings) node.inert = true;
    this.shelfPage = this.packPage = 0;
    this.detailItem = -1;
    this.mercIndex = 0;
    this.setMood(0);
    this.root.hidden = false;
    this.root.setAttribute('aria-label', S.town.roles[role]);
    this.ctx.pause(true);
    this.ctx.onOpen();
    this.render();
    this.root.focus({ preventScroll: true });
    this.root.scrollTop = 0;
    if (role === Role.Shop) {
      playTraderBark('blacksmith', 'greet');
      playTownAmbience('blacksmith');
      this.ctx.onShopEnter();
    } else if (role === Role.Tavern) {
      playTraderBark('barkeep', 'greet');
      playTownAmbience('tavern');
    } else if (role === Role.School) {
      playTraderBark('alchemist', 'greet');
      playTownAmbience('dungeon');
    }
    return true;
  }

  private showCardTooltip(itemId: number, anchor: HTMLElement): void {
    if (!this.cardTooltip) return;
    const hero = this.ctx.sim().hero;
    this.cardTooltip.replaceChildren(renderItemTooltipDom(itemId, hero));
    this.cardTooltip.hidden = false;

    const tipRect = this.cardTooltip.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const pad = 10;

    let left = anchorRect.right + pad;
    if (left + tipRect.width > window.innerWidth - pad) {
      left = anchorRect.left - tipRect.width - pad;
    }
    if (left < pad) left = pad;

    let top = anchorRect.top;
    if (top + tipRect.height > window.innerHeight - pad) {
      top = window.innerHeight - pad - tipRect.height;
    }
    if (top < pad) top = pad;

    this.cardTooltip.style.left = `${left}px`;
    this.cardTooltip.style.top = `${top}px`;
  }

  private hideCardTooltip(): void {
    if (this.cardTooltip) this.cardTooltip.hidden = true;
  }

  close(): void {
    this.hideCardTooltip();
    this.tryOn = -1;
    if (!this.open) return;
    if (this.role === Role.Shop) {
      playTraderBark('blacksmith', 'farewell');
      this.ctx.onShopLeave();
    } else if (this.role === Role.Tavern) {
      playTraderBark('barkeep', 'farewell');
    } else if (this.role === Role.School) {
      playTraderBark('alchemist', 'farewell');
    }
    stopTownAmbience();
    this.cmd('leave');
    this.root.hidden = true;
    for (const [node, wasInert] of this.inertSiblings) node.inert = wasInert;
    this.inertSiblings = [];
    clearTimeout(this.moodTimer);
    clearTimeout(this.exitTimer);
    this.ctx.pause(false);
    this.ctx.changed();
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
  }

  private setMood(m: number): void {
    this.mood = m;
    clearTimeout(this.moodTimer);
    if (m !== 0 && m !== 3) this.moodTimer = window.setTimeout(() => this.setMood(4), 2500);
    const k = this.root.querySelector('.keeper');
    if (k) this.paintKeeper(k as HTMLElement);
  }

  private paintKeeper(k: HTMLElement): void {
    k.className = `keeper scene-panel ${MOOD[this.mood]}`;
    k.querySelector('.say')!.textContent = S.town.keeper[this.mood];
  }

  private render(): void {
    this.hideCardTooltip();
    const hadFocus = this.root.contains(document.activeElement);
    const scrollTop = this.root.scrollTop;
    const sim = this.ctx.sim();
    const def = sim.towns[this.town].def;
    this.root.replaceChildren();
    this.root.className = `sheet town town--${this.role === Role.Shop ? 'shop' : this.role === Role.Tavern ? 'tavern' : 'school'}`;
    const head = el('div', 'sheet-head');
    head.append(el('h2', '', `${def.name}: ${S.town.roles[this.role]}`), el('span', 'spacer'), el('b', 'gold', `${S.town.gold} ${sim.cb.gold[0]}`));
    if (this.role !== Role.Shop) head.append(button(S.town.leave, () => this.close()));
    this.root.append(head);
    if (this.role === Role.Shop) this.renderShop(sim);
    else if (this.role === Role.Tavern) this.renderTavern(sim);
    else this.renderSchool(sim);
    // Rendering replaces controls after actions; keep keyboard ownership in the modal.
    if (hadFocus) this.root.focus({ preventScroll: true });
    this.root.scrollTop = scrollTop;
  }

  // ---- shop ----

  /** Item being tried on the hero oval (drag onto the portrait, or tap the oval while an item is selected). */
  private tryOn = -1;

  /** Pointer-drag an item cell onto the hero oval to try it on; a plain tap still selects as before. */
  private dragToHero(b: HTMLElement, id: number, fromPack = false): void {
    b.style.touchAction = 'none';
    b.addEventListener('pointerdown', (down) => {
      if (down.button > 0) return;
      const x0 = down.clientX, y0 = down.clientY;
      let ghost: HTMLElement | null = null;
      const move = (e: PointerEvent) => {
        if (!ghost && Math.hypot(e.clientX - x0, e.clientY - y0) > 8) {
          this.hideCardTooltip();
          ghost = el('div', 'drag-ghost');
          ghost.append(itemIcon(id));
          document.body.append(ghost);
          b.dataset.dragging = '1';
        }
        if (!ghost) return;
        ghost.style.transform = `translate(${e.clientX - 28}px, ${e.clientY - 28}px)`;
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.hero-portrait');
        this.root.querySelector('.hero-portrait')?.classList.toggle('drop-hot', !!over);
      };
      const up = (e: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!ghost) return;
        ghost.remove();
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.hero-portrait');
        // swallow the click that follows a drag so the item is not also selected
        b.addEventListener('click', (c) => { c.stopImmediatePropagation(); c.preventDefault(); }, { capture: true, once: true });
        window.setTimeout(() => { delete b.dataset.dragging; }, 0);
        if (over) {
          if (fromPack) {
            this.equipItem(id);
          } else {
            this.tryOn = id;
            this.detailItem = id;
            this.render();
          }
        } else {
          this.root.querySelector('.hero-portrait')?.classList.remove('drop-hot');
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  }

  private equipItem(id: number): void {
    const sim = this.ctx.sim();
    const h = sim.hero;
    if (!h) return;
    const def = getItemDef(id);
    if (!def) return;
    const why = def.kind === Ik.Gear ? blocker(h, id) : 0;
    if (why) {
      this.setMood(2);
      return;
    }
    const invSlot = h.inv.findIndex((s) => s.item === id);
    if (invSlot >= 0) {
      this.sells = this.sells.filter((slot) => slot !== invSlot);
      this.picks = this.picks.filter((p) => p.kind !== 's' || p.value !== invSlot);
    }
    const isMetal = def.slot === 0 || def.slot === 1 || def.slot === 2 || def.slot === 3 || def.slot === 4 || def.slot === 7;
    if (def.kind === Ik.Gear) {
      sim.now({ type: 'hero', op: 'equip', item: id });
    } else {
      sim.now({ type: 'hero', op: 'use', item: id });
    }
    playEquipSfx(isMetal);
    this.tryOn = -1;
    this.detailItem = id;
    this.ctx.changed();
    this.render();
  }

  private unequipSlot(slot: number): void {
    const sim = this.ctx.sim();
    const h = sim.hero;
    if (!h || slot < 0 || slot >= h.eq.length) return;
    const item = h.eq[slot];
    if (item < 0) return;
    if (h.inv.length >= INV_MAX) return;
    const def = getItemDef(item);
    const isMetal = def?.slot === 0 || def?.slot === 1 || def?.slot === 2 || def?.slot === 3 || def?.slot === 4 || def?.slot === 7;
    sim.now({ type: 'hero', op: 'unequip', slot });
    playEquipSfx(isMetal);
    this.tryOn = -1;
    this.detailItem = item;
    this.ctx.changed();
    this.render();
  }

  private scene(kind: 'shop' | 'tavern'): HTMLElement {
    const keeper = el('div', 'keeper scene-panel');
    const background = el('img', 'town-backdrop');
    background.src = `${import.meta.env.BASE_URL}townart/scene-${kind}.jpg`;
    background.alt = S.town.scene[kind];
    const actor = el('img', 'merchant-actor');
    actor.alt = '';
    actor.hidden = true; // the painted scene already contains its keeper
    const say = el('div', 'say');
    say.setAttribute('role', 'status');
    const art = el('div', 'scene-art');
    art.append(background, actor);
    keeper.append(art, say);
    this.paintKeeper(keeper);
    return keeper;
  }

  private portrait(sim: Sim): HTMLElement {
    const figure = el('figure', 'hero-portrait');
    figure.style.cursor = 'pointer';
    const image = el('img');
    image.src = `${import.meta.env.BASE_URL}townart/frame-hero-${sim.hero!.cls ? 'mage' : 'warrior'}.jpg`;
    image.alt = S.hero.classes[sim.hero!.cls];
    const h = sim.hero!;
    const trySlot = this.tryOn >= 0 ? (getItemDef(this.tryOn)?.slot ?? -1) : -1;
    const doll = el('div', 'doll-badges');
    for (const layer of equipmentLayers(h)) {
      const swapped = layer.slot === trySlot;
      const badge = el('span', `doll-badge${swapped ? ' preview-override' : ''}`);
      badge.title = swapped ? `Previewing: ${getItemDef(this.tryOn)?.name ?? ''}` : layer.name;
      badge.style.cursor = 'pointer';
      badge.append(itemIcon(swapped ? this.tryOn : layer.item));
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        this.detailItem = layer.item;
        this.updateShopSelections(sim);
      });
      doll.append(badge);
    }
    if (trySlot >= 0 && !h.eq.some((_, i) => i === trySlot && h.eq[i] >= 0)) {
      const badge = el('span', 'doll-badge preview-badge');
      badge.title = `Preview: ${getItemDef(this.tryOn)?.name ?? ''}`;
      badge.append(itemIcon(this.tryOn));
      doll.append(badge);
    }
    figure.classList.toggle('trying', this.tryOn >= 0);
    const set = dollSet(h.cls, h.female);
    let art: HTMLElement = image;
    if (set) {
      const keys: Array<{ key: string; tier: number }> = [];
      const layerSlots = [Slot.Armor, Slot.Boots, Slot.Gloves, Slot.Weapon, Slot.Shield, Slot.Helm];
      for (const slot of layerSlots) {
        const item = slot === trySlot ? this.tryOn : h.eq[slot];
        const def = item >= 0 ? getItemDef(item) : undefined;
        const k = def ? lookFor(set, slot, def.tier ?? 1, def.name) : null;
        if (k) keys.push({ key: k, tier: def?.tier ?? 1 });
      }
      art = buildDoll(set, keys, import.meta.env.BASE_URL);
    }
    const captionText = this.tryOn >= 0 ? `[Preview] ${getItemDef(this.tryOn)?.name ?? ''}` : S.hero.classes[sim.hero!.cls];
    figure.append(art, doll, el('figcaption', '', captionText));
    figure.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.doll-badges')) return;
      if (this.detailItem >= 0 && h.inv.some((s) => s.item === this.detailItem)) {
        this.equipItem(this.detailItem);
      }
    });
    return figure;
  }

  private pager(kind: 'shelf' | 'pack', current: number, count: number, change: (page: number) => void): HTMLElement {
    const row = el('div', 'town-pages');
    const before = button('‹', () => change(current - 1));
    const after = button('›', () => change(current + 1));
    before.setAttribute('aria-label', `${S.town.previousPage}: ${S.town[kind === 'shelf' ? 'shelf' : 'yourPack']}`);
    after.setAttribute('aria-label', `${S.town.nextPage}: ${S.town[kind === 'shelf' ? 'shelf' : 'yourPack']}`);
    before.disabled = current === 0;
    after.disabled = current + 1 >= count;
    row.append(before, el('span', '', `${current + 1} / ${count}`), after);
    return row;
  }

  private decorateItem(b: HTMLButtonElement, id: number): void {
    const item = getItemDef(id);
    if (!item) return;
    const label = el('span', 'item-name', item.name);
    const price = b.querySelector('small');
    b.replaceChildren(itemIcon(id), label);
    if (price) b.append(price);
    b.setAttribute('aria-label', `${item.name}, ${price?.textContent ?? ''}`);
    b.setAttribute('aria-pressed', String(b.classList.contains('sel')));
    b.dataset.item = String(id);
    const isSet = isSetItem(item.name);
    const rarity = isSet ? 'set' : (item.rarity ?? (item.tier >= 5 ? 'unique' : item.tier >= 4 ? 'rare' : item.tier >= 2 ? 'magic' : 'normal'));
    b.dataset.rarity = rarity;
    if (isSet) b.classList.add('rarity-set');
  }

  private renderShop(sim: Sim): void {
    const h = sim.hero!;
    const shelf = sim.town.stock[this.town];
    const keeper = this.scene('shop');
    const bill = el('div', 'bill lines');
    const buyTotal = this.buys.reduce((n, k) => n + priceOf(shelf[k]), 0);
    const sellTotal = this.sells.reduce((n, slot) => n + sellPrice(h.inv[slot].item), 0);
    const bal = sellTotal - buyTotal;
    for (const [label, v] of [
      [S.town.buying, buyTotal],
      [S.town.selling, sellTotal],
      [S.town.balance, bal],
      [S.town.after, sim.cb.gold[0] + bal],
    ] as const) {
      const l = el('div', 'line');
      l.append(el('span', 'grow', label), el('b', v < 0 && label === S.town.after ? 'neg' : '', String(v)));
      bill.append(l);
    }
    const stockPanel = el('section', 'stock-panel');
    stockPanel.append(el('h3', '', S.town.shelf));
    const sg = el('div', 'grid shelf');
    for (let k = this.shelfPage * 6; k < Math.min(SHELF, (this.shelfPage + 1) * 6); k++) {
      const id = shelf[k];
      if (id < 0) {
        sg.append(el('div', 'cell empty'));
        continue;
      }
      const b = button(getItemDef(id)?.name ?? '', () => {
        this.hideCardTooltip();
        this.detailItem = id;
        const at = this.buys.indexOf(k);
        if (at >= 0) {
          this.buys.splice(at, 1);
          const pick = this.picks.findIndex((p) => p.kind === 'b' && p.value === k);
          if (pick >= 0) this.picks.splice(pick, 1);
        } else {
          this.buys.push(k);
          this.picks.push({ kind: 'b', value: k });
          this.setMood(4);
        }
        this.updateShopSelections(sim);
      }, String(priceOf(id)));
      b.className = `cell${this.buys.includes(k) ? ' sel' : ''}`;
      b.dataset.slot = String(k);
      this.decorateItem(b, id);
      this.ctx.tipOn(b, formatItemTooltip(id, h));
      b.addEventListener('pointerenter', (e) => {
        if ((e as PointerEvent).pointerType !== 'touch') this.showCardTooltip(id, b);
      });
      b.addEventListener('pointerleave', () => this.hideCardTooltip());
      this.dragToHero(b, id);
      sg.append(b);
    }
    stockPanel.append(sg, this.pager('shelf', this.shelfPage, Math.ceil(SHELF / 6), (p) => { this.shelfPage = p; this.render(); }));
    const packPanel = el('section', 'pack-panel');
    packPanel.append(el('h3', '', S.town.yourPack));
    const pg = el('div', 'grid pack');
    for (let k = this.packPage * 10; k < (this.packPage + 1) * 10; k++) {
      const s = h.inv[k];
      if (!s) {
        pg.append(el('div', 'cell empty'));
        continue;
      }
      const picked = this.sells.filter((slot) => slot === k).length;
      const b = button(getItemDef(s.item)?.name ?? '', () => {
        this.hideCardTooltip();
        this.detailItem = s.item;
        if (picked >= s.n) {
          this.sells = this.sells.filter((slot) => slot !== k);
          this.picks = this.picks.filter((p) => p.kind !== 's' || p.value !== k);
        } else {
          this.sells.push(k);
          this.picks.push({ kind: 's', value: k });
        }
        this.updateShopSelections(sim);
      }, `${sellPrice(s.item)}${s.n > 1 ? `  x${s.n - picked}` : ''}`);
      b.className = `cell${picked ? ' sel' : ''}${picked >= s.n ? ' no' : ''}`;
      b.dataset.packSlot = String(k);
      this.decorateItem(b, s.item);
      this.ctx.tipOn(b, formatItemTooltip(s.item, h));
      b.addEventListener('pointerenter', (e) => {
        if ((e as PointerEvent).pointerType !== 'touch') this.showCardTooltip(s.item, b);
      });
      b.addEventListener('pointerleave', () => this.hideCardTooltip());
      b.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hideCardTooltip();
        this.equipItem(s.item);
      });
      this.dragToHero(b, s.item, true);
      pg.append(b);
    }
    packPanel.append(pg, this.pager('pack', this.packPage, Math.ceil(INV_MAX / 10), (p) => { this.packPage = p; this.render(); }));

    const acts = el('div', 'trade-actions');
    const undo = button(S.town.undo, () => {
      this.hideCardTooltip();
      const last = this.picks.pop();
      if (last) {
        const picks = last.kind === 'b' ? this.buys : this.sells;
        const index = picks.lastIndexOf(last.value);
        if (index >= 0) picks.splice(index, 1);
      }
      this.updateShopSelections(sim);
    }, String(sim.cb.gold[0]));
    undo.disabled = this.picks.length === 0;
    this.shopUndoBtn = undo;
    const buy = button(S.town.buy, () => {
      this.hideCardTooltip();
      const g0 = sim.cb.gold[0];
      this.cmd('buy', undefined, this.buys);
      const ok = sim.cb.gold[0] < g0;
      this.setMood(ok ? this.buys.some((k) => shelf[k] >= 0) ? 6 : 1 : 2);
      if (ok) {
        playTraderBark('blacksmith', 'buy');
        this.buys = this.buys.filter((k) => shelf[k] >= 0);
        this.picks = this.picks.filter((p) => p.kind === 's' || shelf[p.value] >= 0);
      }
      this.ctx.changed();
      this.render();
    }, `-${buyTotal}`);
    buy.disabled = this.buys.length === 0;
    this.shopBuyBtn = buy;
    const sell = button(S.town.sell, () => {
      this.hideCardTooltip();
      this.cmd('sell', undefined, this.sells.map((slot) => h.inv[slot].item));
      this.sells = [];
      this.picks = this.picks.filter((p) => p.kind === 'b');
      this.setMood(5);
      this.ctx.changed();
      this.render();
    }, `+${sellTotal}`);
    sell.disabled = this.sells.length === 0;
    this.shopSellBtn = sell;
    const exit = button(S.town.leave, () => {
      this.setMood(3);
      this.exitTimer = window.setTimeout(() => this.close(), 350);
    }, String(sim.cb.gold[0]));
    const gCost = gambleCost(sim);
    const gamble = button(S.town.gamble, () => {
      const g0 = sim.cb.gold[0];
      this.cmd('gamble');
      const won = sim.cb.gold[0] < g0;
      if (won) playTraderBark('blacksmith', 'buy');
      this.setMood(won ? 1 : 2);
      this.ctx.changed();
      this.render();
    }, `-${gCost}`);
    gamble.disabled = sim.cb.gold[0] < gCost || h.inv.length >= INV_MAX;
    this.ctx.tipOn(gamble, `${S.town.gambleHelp} (${gCost} ${S.town.gold})`);
    acts.append(undo, buy, sell, gamble, exit);
    const details = el('section', 'trade-details');
    details.setAttribute('aria-label', S.town.itemDetails);
    details.append(bill, this.renderDetailView(h), el('p', 'note', S.town.shopHelp));
    const layout = el('div', 'trade-layout');
    layout.append(stockPanel, keeper, acts, this.portrait(sim), packPanel, details);
    this.root.append(layout);
  }

  private renderDetailView(h: Sim['hero'] & {}): HTMLElement {
    const wrap = el('div', 'trade-detail-view');
    if (this.detailItem < 0) {
      wrap.append(el('p', 'selected-item', S.town.selectItem));
      return wrap;
    }
    const tip = renderItemTooltipDom(this.detailItem, h);
    wrap.append(tip);

    const invIdx = h.inv.findIndex((s) => s.item === this.detailItem);
    if (invIdx >= 0) {
      const d = getItemDef(this.detailItem);
      const isGear = d?.kind === Ik.Gear;
      const why = isGear ? blocker(h, this.detailItem) : 0;
      const btn = button(isGear ? S.hero.equip : S.hero.use, () => {
        this.equipItem(this.detailItem);
      });
      btn.className = 'btn-equip-pack';
      if (why) {
        btn.disabled = true;
        this.ctx.tipOn(btn, WHY_TEXT[why] ?? '');
      }
      wrap.append(btn);
    } else {
      const eqSlot = h.eq.indexOf(this.detailItem);
      if (eqSlot >= 0) {
        const btn = button(S.hero.unequip, () => {
          this.unequipSlot(eqSlot);
        });
        btn.className = 'btn-unequip-pack';
        if (h.inv.length >= INV_MAX) {
          btn.disabled = true;
          this.ctx.tipOn(btn, WHY_TEXT[Why.Full]);
        }
        wrap.append(btn);
      }
    }
    return wrap;
  }

  private updateShopSelections(sim: Sim): void {
    const h = sim.hero!;
    const shelf = sim.town.stock[this.town];

    // 1. Update shelf cell buttons
    const shelfCells = this.root.querySelectorAll<HTMLButtonElement>('.grid.shelf .cell:not(.empty)');
    for (const b of shelfCells) {
      const slot = Number(b.dataset.slot);
      const isSel = this.buys.includes(slot);
      b.classList.toggle('sel', isSel);
      b.setAttribute('aria-pressed', String(isSel));
    }

    // 2. Update pack cell buttons
    const packCells = this.root.querySelectorAll<HTMLButtonElement>('.grid.pack .cell:not(.empty)');
    for (const b of packCells) {
      const slot = Number(b.dataset.packSlot);
      const s = h.inv[slot];
      if (!s) continue;
      const picked = this.sells.filter((sl) => sl === slot).length;
      b.classList.toggle('sel', picked > 0);
      b.classList.toggle('no', picked >= s.n);
      b.setAttribute('aria-pressed', String(picked > 0));
      const priceSmall = b.querySelector('small');
      if (priceSmall) {
        priceSmall.textContent = `${sellPrice(s.item)}${s.n > 1 ? `  x${s.n - picked}` : ''}`;
      }
    }

    // 3. Update bill numbers
    const buyTotal = this.buys.reduce((n, k) => n + priceOf(shelf[k]), 0);
    const sellTotal = this.sells.reduce((n, slot) => n + sellPrice(h.inv[slot].item), 0);
    const bal = sellTotal - buyTotal;
    const after = sim.cb.gold[0] + bal;

    const billLines = this.root.querySelectorAll('.bill .line b');
    if (billLines.length >= 4) {
      billLines[0].textContent = String(buyTotal);
      billLines[1].textContent = String(sellTotal);
      billLines[2].textContent = String(bal);
      billLines[3].textContent = String(after);
      billLines[3].className = after < 0 ? 'neg' : '';
    }

    // 4. Update trade actions (undo, buy, sell)
    if (this.shopUndoBtn) {
      this.shopUndoBtn.disabled = this.picks.length === 0;
    }
    if (this.shopBuyBtn) {
      this.shopBuyBtn.disabled = this.buys.length === 0;
      const sm = this.shopBuyBtn.querySelector('small');
      if (sm) sm.textContent = `-${buyTotal}`;
    }
    if (this.shopSellBtn) {
      this.shopSellBtn.disabled = this.sells.length === 0;
      const sm = this.shopSellBtn.querySelector('small');
      if (sm) sm.textContent = `+${sellTotal}`;
    }

    // 5. Update detail view smoothly without touching portrait or keeper!
    const detailsSec = this.root.querySelector('.trade-details');
    if (detailsSec) {
      const existing = detailsSec.querySelector('.trade-detail-view, .item-tooltip-box, .selected-item');
      const replacement = this.renderDetailView(h);
      if (existing) {
        existing.replaceWith(replacement);
      }
    }
  }

  // ---- tavern ----

  private renderTavern(sim: Sim): void {
    const def = sim.towns[this.town].def;
    const layout = el('div', 'tavern-layout');
    const mercPanel = el('section', 'merc-panel');
    mercPanel.append(el('h3', '', S.town.mercs));
    const ml = el('div', 'items');
    for (const [k, m] of (def.mercs ?? []).entries()) {
      const free = sim.hidden[m.unit] === 1 && sim.cb.hp[m.unit] > 0;
      const b = button(DEFS[sim.cb.kind[m.unit]].name, () => {
        this.mercIndex = k;
        this.render();
      }, free ? `${S.town.hire}: ${mercPrice(sim, m.price)} ${S.town.gold.toLowerCase()}` : S.town.hired);
      b.setAttribute('aria-pressed', String(k === this.mercIndex));
      if (free && mercPrice(sim, m.price) > sim.cb.gold[0]) b.classList.add('no');
      ml.append(b);
    }
    const controls = el('div', 'tavern-controls');
    const chosen = def.mercs?.[this.mercIndex];
    if (chosen) {
      const data = DEFS[sim.cb.kind[chosen.unit]];
      const image = el('img');
      image.src = `${import.meta.env.BASE_URL}townart/portrait-${data.caster ? 'mage' : 'warrior'}-m.png`;
      image.alt = data.name;
      const stats = el('dl');
      for (const [label, value] of [[S.town.health, `${sim.cb.hp[chosen.unit]} / ${sim.cb.hpMax[chosen.unit]}`], [S.town.damage, `${data.min}–${data.max}`], [S.town.accuracy, data.acc], [S.town.defence, data.def]] as const) stats.append(el('dt', '', label), el('dd', '', String(value)));
      // Do not mislabel a plate-armoured warrior portrait as an archer.
      if (data.ranged && !data.caster) mercPanel.append(el('p', 'merc-emblem', S.town.archerEmblem));
      else mercPanel.append(image);
      mercPanel.append(el('h3', '', data.name), stats);
      const free = sim.hidden[chosen.unit] === 1 && sim.cb.hp[chosen.unit] > 0;
      const hire = button(free ? S.town.hire : S.town.hired, () => {
        this.cmd('hire', this.mercIndex);
        const hired = sim.hidden[chosen.unit] === 0;
        this.setMood(hired ? 1 : 2);
        if (hired) playTraderBark('guildmaster', 'buy');
        this.ctx.changed();
        this.render();
      }, String(mercPrice(sim, chosen.price)));
      hire.disabled = !free;
      controls.append(hire);
    }
    controls.append(button(S.town.leave, () => this.close()));
    mercPanel.append(def.mercs?.length ? ml : el('p', 'note', S.town.noMercs));
    const quests = el('section', 'quest-panel');
    quests.append(el('h3', '', S.town.board));
    const offers = sim.town.offers[this.town];
    const ol = el('div', 'lines');
    offers.slice(0, OFFERS).forEach((q, k) => {
      const l = el('div', 'line');
      l.append(el('span', 'grow', questText(sim, q)), el('b', '', `${S.town.reward} ${q.reward}`), button(S.town.accept, () => {
        this.cmd('accept', k);
        playTraderBark('barkeep', 'buy');
        this.render();
      }));
      ol.append(l);
    });
    quests.append(offers.length ? ol : el('p', 'note', S.town.noQuests));

    quests.append(el('h3', '', S.town.yourQuests));
    const ql = el('div', 'lines');
    for (const q of sim.town.quests) {
      const l = el('div', 'line');
      l.append(el('span', 'grow', questText(sim, q)), el('b', '', `${S.town.reward} ${q.reward}`));
      ql.append(l);
    }
    quests.append(sim.town.quests.length ? ql : el('p', 'note', S.town.none));
    layout.append(mercPanel, this.scene('tavern'), this.portrait(sim), controls, quests);
    this.root.append(layout);
  }

  // ---- school ----

  private renderSchool(sim: Sim): void {
    const h = sim.hero!;
    const def = sim.towns[this.town].def;
    const banner = el('div', 'school-banner');
    const crest = el('div', 'school-crest', '✦');
    const copy = el('div', 'school-copy');
    copy.append(
      el('strong', '', `${def.name} Arcane Sanctum`),
      el('p', 'note', S.town.keeper[this.mood]),
    );
    banner.append(crest, copy, this.portrait(sim));
    this.root.append(banner);
    this.root.append(el('h3', '', S.town.spells));
    const sl = el('div', 'items');
    for (const s of def.spells ?? []) {
      const known = ((h.known >>> s) & 1) === 1;
      const b = button(SPELLS[s].name, () => {
        const g0 = sim.cb.gold[0];
        this.cmd('learn', s);
        if (sim.cb.gold[0] < g0) playTraderBark('alchemist', 'buy');
        this.setMood(1);
        this.ctx.changed();
        this.render();
      }, known ? S.town.known : `${S.town.learn}: ${spellPrice(s)}`);
      b.disabled = known;
      if (!known && spellPrice(s) > sim.cb.gold[0]) b.classList.add('no');
      sl.append(b);
    }
    this.root.append(sl);
    this.root.append(el('h3', '', S.town.training));
    const tl = el('div', 'items');
    SKILL_NAMES.forEach((name, k) => {
      const lvl = h.skill[k];
      const max = lvl >= SKILL_MAX;
      const b = button(`${name} ${lvl}`, () => {
        const g0 = sim.cb.gold[0];
        this.cmd('train', k);
        if (sim.cb.gold[0] < g0) playTraderBark('alchemist', 'buy');
        this.setMood(1);
        this.ctx.changed();
        this.render();
      }, max ? S.town.maxed : `${S.town.train}: ${trainPrice(lvl)}`);
      b.disabled = max;
      if (!max && trainPrice(lvl) > sim.cb.gold[0]) b.classList.add('no');
      tl.append(b);
    });
    this.root.append(tl);
  }
}
