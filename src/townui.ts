import { DEFS } from './sim/combat';
import { townBark, mercContent } from './missioncontent';
import { mercPrice } from './sim/difficulty';
import { INV_MAX, SKILL_MAX, SKILL_NAMES, WHY_TEXT, Why, blocker, heroKnowsSpell } from './sim/hero';
import { ITEMS, getItemDef, itemText, Ik, Slot } from './sim/items';
import { formatItemTooltip, renderItemTooltipDom } from './heroui';
import { isSetItem } from './sim/sets';
import type { Sim } from './sim/sim';
import { SPELLS } from './sim/spelldata';
import { OFFERS, isUnlimited, QuestType, reviveFee, ROLE_COUNT, Role, SHELF, gambleCost, priceOf, sellPrice, spellPrice, trainPrice, type Quest, type TownCommand } from './sim/town';
import { computeItemComparison, getCompatibleRunewordsForItem } from './town';
import { VETERAN_RANKS, templeResurrectionCost } from './sim/mercs';
import { S } from './strings';
import { createRarityBadgeEl, itemIconEl } from './townicons';
import { getRumorsByStage, loadTavernRumors, type CampaignStage, type TavernRumorEntry } from './data/text/index';
import { equipmentLayers } from './hero-presentation';
import { buildDoll, dollSet, lookFor } from './doll';
import { play, playNpcBark, playTraderBark, playTownAmbience, stopTownAmbience, playEquipSfx, blip, playSpeakerSwitchThrill, setDialogueDucking } from './audio';
import {
  getWardenHalePortraitSvg,
  getHighArcanistVaelenPortraitSvg,
  getFordScoutBrenPortraitSvg,
  getCaptainMerrickPortraitSvg,
  getTavernPatronPortraitSvg,
  paintedPortrait,
} from './missionui';

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
  private shelfScroll = 0;
  private packScroll = 0;
  private detailItem = -1;
  private mercIndex = 0;
  private mood = 0;
  private moodTimer = 0;
  private exitTimer = 0;
  private previousFocus: HTMLElement | null = null;
  private inertSiblings: [HTMLElement, boolean][] = [];
  private readonly cardTooltip: HTMLElement = el('div', 'hero-floating-card-tooltip');
  private readonly loreModal: HTMLElement = el('div', 'gothic-dialogue-overlay');
  private loreTypingTimer: number | null = null;
  private lastLoreSpeakerIdx = -1;
  private shopUndoBtn: HTMLButtonElement | null = null;
  private shopBuyBtn: HTMLButtonElement | null = null;
  private tavernRumors: TavernRumorEntry[] = [];

  private bark: string | undefined;
  constructor(private readonly ctx: TownUiCtx) {
    this.root = el('div', 'sheet town');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.tabIndex = -1;
    this.cardTooltip.hidden = true;
    this.loreModal.hidden = true;
    document.body.append(this.cardTooltip, this.loreModal);
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
    this.shelfScroll = this.packScroll = 0;
    this.detailItem = -1;
    this.mercIndex = 0;
    this.setMood(0);
    this.bark = townBark(this.ctx.sim().towns[this.town].def.name);
    if (!this.tavernRumors.length && typeof fetch === 'function') {
      const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ? import.meta.env.BASE_URL : './';
      void loadTavernRumors(base).then((p) => {
        if (Array.isArray(p?.entries)) this.tavernRumors = p.entries;
      }).catch(() => undefined);
    }
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
    this.loreModal.hidden = true;
    try { setDialogueDucking(false); } catch {}
    if (this.loreTypingTimer !== null) {
      clearInterval(this.loreTypingTimer);
      this.loreTypingTimer = null;
    }
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
    if (this.bark) this.root.append(el('p', 'muted', `"${this.bark}"`));
    const vigil = el('div', 'town-guard-vigil');
    vigil.append(
      el('span', 'guard-shield-icon', '🛡'),
      el('span', 'guard-status', `${def.name} Palisade · Gate Guards on vigilant watch`),
    );
    this.root.append(vigil);
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
  private dragToHero(b: HTMLElement, id: number, fromPack = false, toTray?: () => void): void {
    // Touch keeps native list scrolling; touch users tap items into the tray instead.
    b.style.touchAction = 'pan-y';
    const trayClass = fromPack ? '.tray-sell' : '.tray-buy';
    b.addEventListener('pointerdown', (down) => {
      if (down.button > 0 || down.pointerType === 'touch') return;
      const x0 = down.clientX, y0 = down.clientY;
      let ghost: HTMLElement | null = null;
      const move = (e: PointerEvent) => {
        if (!ghost && Math.hypot(e.clientX - x0, e.clientY - y0) > 8) {
          this.hideCardTooltip();
          ghost = el('div', 'drag-ghost');
          ghost.append(itemIconEl(id));
          document.body.append(ghost);
          b.dataset.dragging = '1';
        }
        if (!ghost) return;
        ghost.style.transform = `translate(${e.clientX - 28}px, ${e.clientY - 28}px)`;
        const at = document.elementFromPoint(e.clientX, e.clientY);
        this.root.querySelector('.hero-portrait')?.classList.toggle('drop-hot', !!at?.closest('.hero-portrait'));
        if (toTray) this.root.querySelector(trayClass)?.classList.toggle('drop-hot', !!at?.closest(trayClass));
      };
      const up = (e: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!ghost) return;
        ghost.remove();
        const at = document.elementFromPoint(e.clientX, e.clientY);
        const over = at?.closest('.hero-portrait');
        const inTray = !!toTray && !!at?.closest(trayClass);
        this.root.querySelector(trayClass)?.classList.remove('drop-hot');
        // swallow the click that follows a drag so the item is not also selected
        b.addEventListener('click', (c) => { c.stopImmediatePropagation(); c.preventDefault(); }, { capture: true, once: true });
        window.setTimeout(() => { delete b.dataset.dragging; }, 0);
        if (inTray) {
          toTray!();
        } else if (over) {
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
    actor.src = `${import.meta.env.BASE_URL}townart/merchant-${kind}.png`;
    actor.hidden = false;
    const say = el('div', 'say');
    say.setAttribute('role', 'status');
    const art = el('div', 'scene-art');
    art.append(background, actor);
    if (kind === 'shop') {
      const forgeGlow = el('div', 'forge-glow');
      const sparks = el('div', 'anvil-sparks');
      art.append(forgeGlow, sparks);
    } else {
      const hearth = el('div', 'hearth-flicker');
      art.append(hearth);
    }
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
      badge.style.cursor = 'pointer';
      badge.append(itemIconEl(swapped ? this.tryOn : layer.item));
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        this.detailItem = layer.item;
        this.updateShopSelections(sim);
      });
      doll.append(badge);
    }
    if (trySlot >= 0 && !h.eq.some((_, i) => i === trySlot && h.eq[i] >= 0)) {
      const badge = el('span', 'doll-badge preview-badge');
      badge.append(itemIconEl(this.tryOn));
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

  /** A scrolling list driven by wheel, touch drag and on-screen up/down buttons (no pages). */
  private scrollBox(grid: HTMLElement, kind: 'shelf' | 'pack'): HTMLElement {
    const wrap = el('div', 'scroll-wrap');
    const box = el('div', 'scroll-box');
    box.tabIndex = 0;
    box.append(grid);
    box.addEventListener('scroll', () => {
      if (kind === 'shelf') this.shelfScroll = box.scrollTop;
      else this.packScroll = box.scrollTop;
    });
    const step = (dir: number) => box.scrollBy({ top: dir * Math.max(100, box.clientHeight * 0.8), behavior: 'smooth' });
    const name = S.town[kind === 'shelf' ? 'shelf' : 'yourPack'];
    const up = button('▲', () => step(-1));
    const down = button('▼', () => step(1));
    up.className = down.className = 'scroll-btn';
    up.setAttribute('aria-label', `${S.town.scrollUp}: ${name}`);
    down.setAttribute('aria-label', `${S.town.scrollDown}: ${name}`);
    const btns = el('div', 'scroll-btns');
    btns.append(up, down);
    wrap.append(box, btns);
    queueMicrotask(() => { box.scrollTop = kind === 'shelf' ? this.shelfScroll : this.packScroll; });
    return wrap;
  }

  private addBuy(k: number): void {
    const id = this.ctx.sim().town.stock[this.town][k];
    if (id < 0) return;
    if (!isUnlimited(id) && this.buys.includes(k)) return;
    this.buys.push(k);
    this.picks.push({ kind: 'b', value: k });
    this.setMood(4);
  }

  private addSell(slot: number): void {
    const s = this.ctx.sim().hero!.inv[slot];
    if (!s || this.sells.filter((x) => x === slot).length >= s.n) return;
    this.sells.push(slot);
    this.picks.push({ kind: 's', value: slot });
  }

  private removeOne(kind: 'b' | 's', value: number): void {
    const list = kind === 'b' ? this.buys : this.sells;
    const at = list.lastIndexOf(value);
    if (at >= 0) list.splice(at, 1);
    for (let i = this.picks.length - 1; i >= 0; i--) {
      if (this.picks[i].kind === kind && this.picks[i].value === value) { this.picks.splice(i, 1); break; }
    }
  }

  private tradeBalance(sim: Sim): { buy: number; sell: number; bal: number; after: number } {
    const h = sim.hero!;
    const shelf = sim.town.stock[this.town];
    const buy = this.buys.reduce((n, k) => n + priceOf(shelf[k]), 0);
    const sell = this.sells.reduce((n, slot) => n + sellPrice(h.inv[slot].item), 0);
    return { buy, sell, bal: sell - buy, after: sim.cb.gold[0] + sell - buy };
  }

  /** The barter tray: what you pay, what you receive, and the running balance. */
  private renderTray(sim: Sim): HTMLElement {
    const h = sim.hero!;
    const shelf = sim.town.stock[this.town];
    const t = this.tradeBalance(sim);
    const tray = el('div', 'trade-tray');
    const side = (cls: string, title: string, kind: 'b' | 's', keys: number[], idOf: (k: number) => number, unit: (id: number) => number, total: number) => {
      const box = el('div', `tray-side ${cls}`);
      box.append(el('h4', '', `${title}: ${total}`));
      const counts = new Map<number, number>();
      for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
      if (!counts.size) box.append(el('p', 'tray-empty', kind === 'b' ? S.town.trayBuyEmpty : S.town.traySellEmpty));
      for (const [k, n] of counts) {
        const id = idOf(k);
        const name = getItemDef(id)?.name ?? '';
        const row = el('div', 'tray-row');
        const label = button(`${name}${n > 1 ? ` x${n}` : ''}  ${unit(id) * n}`, () => { this.detailItem = id; this.updateShopSelections(sim); });
        label.className = 'tray-item';
        const minus = button('−', () => { this.hideCardTooltip(); this.removeOne(kind, k); this.updateShopSelections(sim); });
        minus.className = 'tray-minus';
        minus.setAttribute('aria-label', `${S.town.removeOne}: ${name}`);
        row.append(label, minus);
        box.append(row);
      }
      return box;
    };
    const sides = el('div', 'tray-sides');
    sides.append(
      side('tray-buy', S.town.toBuy, 'b', this.buys, (k) => shelf[k], priceOf, t.buy),
      side('tray-sell', S.town.toSell, 's', this.sells, (k) => h.inv[k].item, sellPrice, t.sell),
    );
    const bill = el('div', 'bill lines');
    for (const [label, v] of [[S.town.buying, t.buy], [S.town.selling, t.sell], [S.town.balance, t.bal], [S.town.after, t.after]] as const) {
      const l = el('div', 'line');
      l.append(el('span', 'grow', label), el('b', v < 0 && label === S.town.after ? 'neg' : '', String(v)));
      bill.append(l);
    }
    tray.append(sides, bill);
    return tray;
  }
  private decorateItem(b: HTMLButtonElement, id: number): void {
    const item = getItemDef(id);
    if (!item) return;
    const label = el('span', 'item-name', item.name);
    const price = b.querySelector('small');
    const isSet = isSetItem(item.name);
    const rarity = isSet ? 'set' : (item.rarity ?? (item.tier >= 5 ? 'unique' : item.tier >= 4 ? 'rare' : item.tier >= 2 ? 'magic' : 'normal'));
    const cbBadge = createRarityBadgeEl(rarity);
    if (cbBadge) label.prepend?.(cbBadge);
    b.replaceChildren(itemIconEl(id), label);
    if (price) b.append(price);
    b.setAttribute('aria-label', `${item.name}, ${price?.textContent ?? ''}`);
    b.setAttribute('aria-pressed', String(b.classList.contains('sel')));
    b.dataset.item = String(id);
    b.dataset.rarity = rarity;
    if (isSet) b.classList.add('rarity-set');
  }

  private renderShop(sim: Sim): void {
    const h = sim.hero!;
    const shelf = sim.town.stock[this.town];
    const keeper = this.scene('shop');
    const stockPanel = el('section', 'stock-panel');
    stockPanel.append(el('h3', '', S.town.shelf));
    const sg = el('div', 'grid shelf');
    for (let k = 0; k < SHELF; k++) {
      const id = shelf[k];
      if (id === undefined || id < 0) continue;
      const unlimited = isUnlimited(id);
      const inTray = this.buys.includes(k);
      const b = button(getItemDef(id)?.name ?? '', () => {
        this.hideCardTooltip();
        this.detailItem = id;
        this.addBuy(k);
        this.updateShopSelections(sim);
      }, unlimited ? `${priceOf(id)}  ∞` : String(priceOf(id)));
      b.className = `cell${inTray ? ' sel' : ''}`;
      b.dataset.slot = String(k);
      this.decorateItem(b, id);
      b.addEventListener('pointerenter', (e) => {
        if ((e as PointerEvent).pointerType !== 'touch') this.showCardTooltip(id, b);
      });
      b.addEventListener('pointerleave', () => this.hideCardTooltip());
      this.dragToHero(b, id, false, () => { this.detailItem = id; this.addBuy(k); this.updateShopSelections(sim); });
      sg.append(b);
    }
    stockPanel.append(this.scrollBox(sg, 'shelf'));
    const packPanel = el('section', 'pack-panel');
    packPanel.append(el('h3', '', S.town.yourPack));
    const pg = el('div', 'grid pack');
    for (let k = 0; k < h.inv.length; k++) {
      const s = h.inv[k];
      const picked = this.sells.filter((slot) => slot === k).length;
      const b = button(getItemDef(s.item)?.name ?? '', () => {
        this.hideCardTooltip();
        this.detailItem = s.item;
        this.addSell(k);
        this.updateShopSelections(sim);
      }, `${sellPrice(s.item)}${s.n > 1 ? `  x${s.n - picked}` : ''}`);
      b.className = `cell${picked ? ' sel' : ''}${picked >= s.n ? ' no' : ''}`;
      b.dataset.packSlot = String(k);
      this.decorateItem(b, s.item);
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
      this.dragToHero(b, s.item, true, () => { this.detailItem = s.item; this.addSell(k); this.updateShopSelections(sim); });
      pg.append(b);
    }
    packPanel.append(this.scrollBox(pg, 'pack'));

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
    const t0 = this.tradeBalance(sim);
    const deal = button(S.town.confirmDeal, () => {
      this.hideCardTooltip();
      const t = this.tradeBalance(sim);
      const g0 = sim.cb.gold[0];
      sim.now({ type: 'town', op: 'deal', town: this.town, list: [...this.buys], list2: this.sells.map((slot) => h.inv[slot].item) });
      const ok = sim.cb.gold[0] - g0 === t.bal;
      this.setMood(ok ? 5 : sim.cb.gold[0] !== g0 ? 6 : 2);
      if (sim.cb.gold[0] !== g0) { playTraderBark('blacksmith', 'buy'); play(t.bal < 0 ? 'ui_trade_buy' : 'ui_trade_sell', 5); }
      // Sales always settle first, so pack indices are stale; unfilled one-off shelf items stay in the tray.
      this.sells = [];
      this.buys = ok ? [] : this.buys.filter((k) => shelf[k] >= 0 && !isUnlimited(shelf[k]));
      this.picks = this.buys.map((value) => ({ kind: 'b' as const, value }));
      this.ctx.changed();
      this.render();
    }, `${t0.bal >= 0 ? '+' : ''}${t0.bal}`);
    deal.className = 'deal-btn';
    deal.disabled = (this.buys.length === 0 && this.sells.length === 0) || t0.after < 0;
    this.shopBuyBtn = deal;
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

    // Mystery Gamble Slot Buttons
    const gambleSlotBar = el('div', 'mystery-gamble-bar');
    const gambleSlots: Array<{ label: string; slot: number }> = [
      { label: 'Wpn', slot: Slot.Weapon },
      { label: 'Arm', slot: Slot.Armor },
      { label: 'Hlm', slot: Slot.Helm },
      { label: 'Shd', slot: Slot.Shield },
      { label: 'Bts', slot: Slot.Boots },
      { label: 'Glv', slot: Slot.Gloves },
      { label: 'Rng', slot: Slot.Ring },
      { label: 'Amu', slot: Slot.Amulet },
    ];
    for (const gs of gambleSlots) {
      const slotBtn = el('button', 'btn-gamble-slot', gs.label);
      slotBtn.type = 'button';
      slotBtn.title = `Gamble for mystery ${gs.label} (-${gCost} gold)`;
      slotBtn.disabled = sim.cb.gold[0] < gCost || h.inv.length >= INV_MAX;
      slotBtn.onclick = () => {
        const g0 = sim.cb.gold[0];
        this.cmd('gamble', gs.slot);
        const won = sim.cb.gold[0] < g0;
        if (won) playTraderBark('blacksmith', 'buy');
        this.setMood(won ? 1 : 2);
        this.ctx.changed();
        this.render();
      };
      gambleSlotBar.append(slotBtn);
    }

    acts.append(deal, undo, gamble, gambleSlotBar, button('💬 Lore & Spoils', () => this.openLoreDialogue('shop')), exit);
    const details = el('section', 'trade-details');
    details.setAttribute('aria-label', S.town.itemDetails);
    details.append(this.renderTray(sim), this.renderDetailView(h), el('p', 'note', S.town.shopHelp));
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

    const d = getItemDef(this.detailItem);
    if (d && d.kind === Ik.Gear && d.slot >= 0) {
      const eqId = h.eq[d.slot];
      const comp = computeItemComparison(d, eqId >= 0 ? eqId : null);
      if (comp.diffs.length > 0) {
        const compPanel = el('div', 'item-comparison-panel');
        compPanel.append(el('h4', 'comp-title', `vs Equipped (${comp.equippedName ?? 'Empty'})`));
        const diffList = el('div', 'comp-diff-list');
        for (const diff of comp.diffs) {
          const deltaEl = el('span', `comp-diff-tag ${diff.isPositive ? 'is-pos' : 'is-neg'}`, diff.formatted);
          diffList.append(deltaEl);
        }
        compPanel.append(diffList);
        wrap.append(compPanel);
      }

      // Runeword Assistant
      const sockets = (d as any).sockets ?? (d.tier >= 3 ? 2 : 0);
      if (sockets >= 2) {
        const ownedRunes = h.inv.map((s) => getItemDef(s.item)?.name).filter(Boolean) as string[];
        const rwList = getCompatibleRunewordsForItem(d.slot, sockets, ownedRunes);
        if (rwList.length > 0) {
          const rwPanel = el('div', 'runeword-assistant-panel');
          rwPanel.append(el('h4', 'rw-title', `ᚱ Compatible Runewords (${rwList.length})`));
          for (const rw of rwList.slice(0, 3)) {
            const rwCard = el('div', 'rw-match-card');
            const runesText = rw.runeDetails.map((r) => (r.owned ? `✓ ${r.d2Name}` : `○ ${r.d2Name}`)).join(' + ');
            rwCard.append(
              el('strong', 'rw-name', rw.name),
              el('span', 'rw-formula', ` [${runesText}]`),
              el('small', 'rw-bonus', rw.statSummary.length > 0 ? ` ${rw.statSummary.join(', ')}` : ''),
            );
            rwPanel.append(rwCard);
          }
          wrap.append(rwPanel);
        }
      }
    }

    const invIdx = h.inv.findIndex((s) => s.item === this.detailItem);
    if (invIdx >= 0) {
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

    // 3. Rebuild the tray (lists, totals, balance) and refresh the action buttons
    this.root.querySelector('.trade-tray')?.replaceWith(this.renderTray(sim));
    const t = this.tradeBalance(sim);
    if (this.shopUndoBtn) this.shopUndoBtn.disabled = this.picks.length === 0;
    if (this.shopBuyBtn) {
      this.shopBuyBtn.disabled = (this.buys.length === 0 && this.sells.length === 0) || t.after < 0;
      const sm = this.shopBuyBtn.querySelector('small');
      if (sm) sm.textContent = `${t.bal >= 0 ? '+' : ''}${t.bal}`;
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
      const fallen = sim.hidden[m.unit] === 0 && sim.cb.hp[m.unit] <= 0;
      const b = button(DEFS[sim.cb.kind[m.unit]].name, () => {
        this.mercIndex = k;
        this.render();
      }, free ? `${S.town.hire}: ${mercPrice(sim, m.price)} ${S.town.gold.toLowerCase()}` : fallen ? `${S.town.revive}: ${reviveFee(mercPrice(sim, m.price))} ${S.town.gold.toLowerCase()}` : S.town.hired);
      b.setAttribute('aria-pressed', String(k === this.mercIndex));
      if (free && mercPrice(sim, m.price) > sim.cb.gold[0]) b.classList.add('no');
      ml.append(b);
    }
    const controls = el('div', 'tavern-controls');
    const chosen = def.mercs?.[this.mercIndex];
    if (chosen) {
      const data = DEFS[sim.cb.kind[chosen.unit]];
      const image = el('img');
      const content = mercContent(chosen.unit);
      image.src = content
        ? `${import.meta.env.BASE_URL}townart/portraits/${content.id}.jpg`
        : `${import.meta.env.BASE_URL}townart/portrait-${data.caster ? 'mage' : 'warrior'}-m.png`;
      image.alt = content?.name ?? data.name;
      const stats = el('dl');
      for (const [label, value] of [[S.town.health, `${sim.cb.hp[chosen.unit]} / ${sim.cb.hpMax[chosen.unit]}`], [S.town.damage, `${data.min}–${data.max}`], [S.town.accuracy, data.acc], [S.town.defence, data.def]] as const) stats.append(el('dt', '', label), el('dd', '', String(value)));
      // Do not mislabel a plate-armoured warrior portrait as an archer.
      if (data.ranged && !data.caster && !content) mercPanel.append(el('p', 'merc-emblem', S.town.archerEmblem));
      else mercPanel.append(image);
      mercPanel.append(el('h3', '', data.name), stats);
      const free = sim.hidden[chosen.unit] === 1 && sim.cb.hp[chosen.unit] > 0;
      const fallen = sim.hidden[chosen.unit] === 0 && sim.cb.hp[chosen.unit] <= 0;
      const hire = button(free ? S.town.hire : fallen ? S.town.revive : S.town.hired, () => {
        this.cmd(fallen ? 'revive' : 'hire', this.mercIndex);
        const hired = sim.hidden[chosen.unit] === 0 && sim.cb.hp[chosen.unit] > 0;
        this.setMood(hired ? 1 : 2);
        if (hired) playTraderBark('guildmaster', 'buy');
        this.ctx.changed();
        this.render();
      }, String(fallen ? reviveFee(mercPrice(sim, chosen.price)) : mercPrice(sim, chosen.price)));
      hire.disabled = !free && !fallen;
      controls.append(hire);
    }
    controls.append(button('📜 Rumors & Lore', () => this.openLoreDialogue('tavern')), button(S.town.leave, () => this.close()));
    mercPanel.append(def.mercs?.length ? ml : el('p', 'note', S.town.noMercs));
    const quests = el('section', 'quest-panel');
    quests.append(el('h3', '', S.town.board));
    const offers = sim.town.offers[this.town];
    const ol = el('div', 'lines');
    offers.slice(0, OFFERS).forEach((q, k) => {
      const l = el('div', 'line');
      l.append(el('span', 'grow', questText(sim, q)), el('b', '', `${S.town.reward} ${q.reward}`), button(S.town.accept, () => {
        this.cmd('accept', k);
        play('sfx_quest_accept', 5);
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

    // Tavern Bounty Board (Regional Super-Unique Boss Hunts)
    const bountyPanel = el('section', 'bounty-panel');
    bountyPanel.append(el('h3', '', '⚔ Bounty Board (Elite Hunts)'));
    const townBounties = sim.town.bounties?.[this.town] ?? [];
    if (townBounties.length > 0) {
      const bl = el('div', 'lines bounty-lines');
      townBounties.forEach((bounty, k) => {
        const l = el('div', `line bounty-card${bounty.isGrailTarget ? ' is-grail' : ''}${bounty.completed ? ' is-completed' : ''}`);
        const info = el('div', 'bounty-info');
        const header = el('strong', 'bounty-title', `${bounty.isGrailTarget ? '🏆 Grail Target: ' : ''}${bounty.name}`);
        const desc = el('small', 'bounty-desc', bounty.summary);
        info.append(header, desc);
        const rewardText = `${bounty.rewardGold}g${bounty.rewardRune ? ` + Rune [${bounty.rewardRune}]` : ''}`;
        const rew = el('b', 'bounty-reward', rewardText);
        const btn = button(
          bounty.completed ? 'Claimed' : bounty.accepted ? 'Accepted' : 'Accept Hunt',
          () => {
            if (!bounty.accepted) {
              this.cmd('accept_bounty', k);
              play('sfx_quest_accept', 5);
              playTraderBark('guildmaster', 'buy');
              this.render();
            }
          }
        );
        btn.disabled = bounty.accepted || bounty.completed;
        l.append(info, rew, btn);
        bl.append(l);
      });
      bountyPanel.append(bl);
    } else {
      bountyPanel.append(el('p', 'note', 'No active bounty notices posted for this region.'));
    }
    quests.append(bountyPanel);

    const patrons = el('div', 'tavern-patrons');
    patrons.append(
      el('span', 'patron-badge', '🍺 Old Veteran (drinking ale)'),
      el('span', 'patron-badge', '🗡 Border Scout (sharpening blade)'),
      el('span', 'patron-badge', '🎲 Mercenary Gambler (rolling dice)'),
    );
    layout.append(mercPanel, this.scene('tavern'), this.portrait(sim), controls, quests, patrons);
    this.root.append(layout);
  }

  // ---- school ----

  private renderSchool(sim: Sim): void {
    const h = sim.hero!;
    const def = sim.towns[this.town].def;
    const banner = el('div', 'school-banner');
    const crest = el('div', 'school-crest', '✦');
    const copy = el('div', 'school-copy');
    const priestFigure = el('div', 'temple-priest-figure');
    priestFigure.append(
      el('div', 'priest-idle-aura', '✨'),
      el('span', 'priest-tag', '✧ Temple Hierophant (Astral Meditation)'),
    );
    copy.append(
      el('strong', '', `${def.name} Arcane Sanctum`),
      el('p', 'note', S.town.keeper[this.mood]),
      priestFigure,
      button('✨ Lore of the Astral Veil', () => this.openLoreDialogue('school')),
    );
    banner.append(crest, copy, this.portrait(sim));
    this.root.append(banner);
    this.root.append(el('h3', '', S.town.spells));
    const sl = el('div', 'items');
    for (const s of def.spells ?? []) {
      const known = heroKnowsSpell(h, s);
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

    // Temple Resurrection for Fallen Veterans
    const fallenVets = sim.town.fallenVeterans ?? [];
    if (fallenVets.length > 0) {
      this.root.append(el('h3', 'temple-revive-header', '⚱ Temple Resurrection (Fallen Veterans)'));
      const fl = el('div', 'items fallen-vets-list');
      fallenVets.forEach((vet, k) => {
        const cost = templeResurrectionCost(vet.rank);
        const perkText = vet.perkName ? ` [${vet.perkName}]` : '';
        const rankDef = VETERAN_RANKS[vet.rank];
        const b = button(
          `Revive ${vet.name} (${rankDef.title}${perkText})`,
          () => {
            this.cmd('temple_revive', k);
            playTraderBark('alchemist', 'buy');
            this.ctx.changed();
            this.render();
          },
          `${cost} ${S.town.gold.toLowerCase()}`
        );
        if (cost > sim.cb.gold[0]) b.classList.add('no');
        fl.append(b);
      });
      this.root.append(fl);
    }
  }

  // ---- Interactive Dark Fantasy Lore & Rumors Dialogue System ----

  private openLoreDialogue(context: 'tavern' | 'school' | 'shop'): void {
    if (this.loreTypingTimer !== null) {
      clearInterval(this.loreTypingTimer);
      this.loreTypingTimer = null;
    }

    interface TopicLore {
      label: string;
      skillTag: string;
      badgeClass: string;
      sensoryBeat: string;
      speech: string;
      choices: Array<{ tag: string; text: string }>;
    }

    interface SpeakerLore {
      name: string;
      rank: string;
      portraitSvg: string;
      topics: TopicLore[];
    }

    let speakers: SpeakerLore[] = [];

    if (context === 'tavern') {
      speakers = [
        {
          name: 'Warden Hale',
          rank: 'High Captain of the Thornwick Border Guard & Knight-Commander',
          portraitSvg: paintedPortrait('npc-hale', getWardenHalePortraitSvg()),
          topics: [
            {
              label: 'The Sunken Ford Incursion',
              skillTag: 'WAR LOGIC - Formidable: Success',
              badgeClass: 'de-war-logic',
              sensoryBeat: '*(He sets down his battered iron tankard with a heavy clatter. The tallow candle flickers, illuminating deep white scars across his knuckles. He smells of wet wool, bitter chicory, and old armor oil.)*',
              speech: 'The river runs black with soot, Commander. Grok\'tar\'s highland gnolls didn\'t merely stumble down into the shallows—they were driven south by horrors stirring in the high crags. The High Council sits warm behind their granite walls in the capital, writing decrees in red wax while we drown in mud for a handful of copper. If the fords break, there is no second line of defense. Thornwick starves before the first frost.',
              choices: [
                { tag: '[War Logic]', text: 'What are their flanking dispositions along the riverbank?' },
                { tag: '[Frontier Skepticism]', text: 'And if the capital sends no reinforcements?' },
                { tag: '[Iron Will]', text: 'We will hold the shallows ourselves. Let them come.' },
              ],
            },
            {
              label: 'The High Bastion Keeps',
              skillTag: 'VETERAN FLESH - Medium: Success',
              badgeClass: 'de-war-logic',
              sensoryBeat: '*(He traces the grain of the rough timber bench, his voice dropping to a low gravelly rasp.)*',
              speech: 'Captain Merrick holds the high stone bastions with sixty men, but their supply wagons were plundered at the crossroads. Sixty men against two thousand howling spears. War out here isn\'t won by songs; it\'s won by salt pork, dry bowstrings, and boots that don\'t rot in the silt. Every casualty is an irreplaceable blade.',
              choices: [
                { tag: '[Tactical Calculus]', text: 'Can the bastion withstand a prolonged siege?' },
                { tag: '[Quartermaster\'s Eye]', text: 'We need to clear the supply road before winter sets in.' },
                { tag: '[Cohort Memory]', text: 'Sixty men who know how to hold a wall are worth five hundred conscripts.' },
              ],
            },
            {
              label: 'Ghost Cohorts of the Cataclysm',
              skillTag: 'COHORT MEMORY - Challenging: Success',
              badgeClass: 'de-cohort',
              sensoryBeat: '*(He gazes past you into the tavern shadows, where the rain drums ceaselessly against the leaded glass.)*',
              speech: 'Three centuries ago, the First Wardens swore an oath upon celestial gold. When the continental bedrock buckled, their flesh rotted away, but the words stayed chained to their marrow. They march beneath the earth in unbroken ranks—Hollow Knights who know neither fear nor fatigue. Pray you never hear their iron tread in the dark.',
              choices: [
                { tag: '[Astral Shiver]', text: 'Is there any release for them, or only destruction?' },
                { tag: '[War Logic]', text: 'Disciplined undead are still subject to kinetics. Heavy blades will shatter their bone.' },
                { tag: '[Visceral Dread]', text: 'A grim fate. Better to bleed out in the mire than march forever in rust.' },
              ],
            },
          ],
        },
        {
          name: 'Ford-Scout Bren',
          rank: 'Chief Frontier Pathfinder & Master of the River Marches',
          portraitSvg: paintedPortrait('npc-scout', getFordScoutBrenPortraitSvg()),
          topics: [
            {
              label: 'Anatomy of an Ambuscade',
              skillTag: 'TACTICAL CALCULUS - Easy: Success',
              badgeClass: 'de-tactical',
              sensoryBeat: '*(His knuckles twitch against his dagger sheath. Mud is splattered across his cheekbones; his eyes dart to the tavern door at every gust of wind.)*',
              speech: 'I crept through the willow reeds at twilight, bellied down in the cold mire. Grok\'tar\'s barbed bowmen don\'t fire from the open; they notch their horns behind the sunken silt bars and wait for the vanguard to flounder. If you march straight down the river center, their shafts will pin your halberdiers like beetles to a board. Flank along the high gravel spits—gravel holds your footing.',
              choices: [
                { tag: '[Tactical Calculus]', text: 'We take the high spit and deploy tower shields on the approach.' },
                { tag: '[Frontier Skepticism]', text: 'And if they have scouts watching the spit as well?' },
                { tag: '[Iron Will]', text: 'Speed is our armor. We cross before they can coordinate their volley.' },
              ],
            },
            {
              label: 'Barbed Iron & Venom Tracking',
              skillTag: 'PERCEPTION - Medium: Success',
              badgeClass: 'de-tactical',
              sensoryBeat: '*(He produces a snapped arrow from his sleeve, holding the jagged black iron to the candlelight.)*',
              speech: 'Smell that? Bitter almond and marsh viper gall. They dip their barbs in rancid bile. A surface scratch inflames the veins within thirty heartbeats; by sunset, your blood turns to black water. Keep your visors locked and your shields overlapping until you close distance.',
              choices: [
                { tag: '[Quartermaster\'s Eye]', text: 'Do our field chirurgeons have enough antivenom?' },
                { tag: '[War Logic]', text: 'Archers in the front, spearmen behind. We shoot them before they draw.' },
                { tag: '[Veteran Flesh]', text: 'I\'ve tasted worse poison in border broths. It won\'t stop our march.' },
              ],
            },
            {
              label: 'Sarcophagi of the River Bed',
              skillTag: 'ASTRAL SHIVER - Formidable: Success',
              badgeClass: 'de-astral',
              sensoryBeat: '*(A tremor runs through his shoulders as he lowers his voice to a breathless whisper.)*',
              speech: 'Beneath the gravel shallows lie granite tombs older than the kingdom. The river gnolls have been prying at the runic seals with crude iron picks, seeking star-silver amulets. When they strike those wardstones, the water turns freezing cold and dead fish float belly-up to the surface. Sunder their cabal before they wake what sleeps beneath the silt.',
              choices: [
                { tag: '[Astral Shiver]', text: 'The water was freezing when we crossed. The seals are already cracking.' },
                { tag: '[War Logic]', text: 'Cut down the shamans first. Break their concentration.' },
                { tag: '[Iron Will]', text: 'Let their dead wake. My blade cuts through stone and marrow alike.' },
              ],
            },
          ],
        },
        {
          name: 'Master Corin',
          rank: 'Tavern Chronicler & Informant of the Frontier Underworld',
          portraitSvg: paintedPortrait('npc-quillon', getTavernPatronPortraitSvg()),
          topics: [
            {
              label: 'Price of Grain & Smuggler Ledgers',
              skillTag: 'FRONTIER SKEPTICISM - Medium: Success',
              badgeClass: 'de-skepticism',
              sensoryBeat: '*(He wrings a stained linen rag over the counter, his dry smirk revealing two broken teeth.)*',
              speech: 'Flour is up forty percent since the border mill went up in flames, Commander. Salt is scarcer than imperial mercy, and the beer is half marsh-water. But gold? Gold still talks. Every deserter, merchant, and cutpurse passes through this taproom. If you need blades that won\'t ask questions about who gave the order, look around the hearth. Just don\'t lend them money.',
              choices: [
                { tag: '[Quartermaster\'s Eye]', text: 'Who is funding the border deserters?' },
                { tag: '[Frontier Skepticism]', text: 'And what is your cut of the smuggler traffic, Corin?' },
                { tag: '[War Logic]', text: 'Gold buys sellswords. Blood keeps them in line.' },
              ],
            },
            {
              label: 'Catacombs of the Sunless Deeps',
              skillTag: 'GALLOWS HUMOR - Challenging: Success',
              badgeClass: 'de-skepticism',
              sensoryBeat: '*(He leans in close, smelling of stale hop-mash and sour tallow.)*',
              speech: 'Old miners say that beneath the Redmarsh lies an ancient subterranean highway paved before the First Age. The vaults down there were never ransacked—only sealed when the sky rained molten iron. If you venture down into the dark, Commander, carry twice as many torches as you think you need, and don\'t drink the water. Even the rats down there have two heads.',
              choices: [
                { tag: '[War Logic]', text: 'Are the highway tunnels wide enough for a supply baggage train?' },
                { tag: '[Astral Shiver]', text: 'What sealed them? Natural rock, or ancient sorcery?' },
                { tag: '[Iron Will]', text: 'If there is a path beneath the enemy, we will march through it.' },
              ],
            },
            {
              label: 'Whispers of Blood-Stained Coin',
              skillTag: 'QUARTERMASTER\'S EYE - Easy: Success',
              badgeClass: 'de-quartermaster',
              sensoryBeat: '*(He flips a tarnished silver coin onto the counter; it rings with a dull, leaden clink.)*',
              speech: 'Notice the edge? Shaved down by coin-clippers in the garrison quartermaster\'s office. The empire pays its mercenaries with debased silver, then wonders why cohorts desert at the first sign of a gnoll war-horn. If you want loyalty on this border, you pay in steel and bread, not empty oaths.',
              choices: [
                { tag: '[Quartermaster\'s Eye]', text: 'Our company pays fair coin. We take care of our own.' },
                { tag: '[Frontier Skepticism]', text: 'Even debased silver buys arrows and tallow.' },
                { tag: '[Iron Will]', text: 'My soldiers fight for their lives and each other, not coin-clipper ledgers.' },
              ],
            },
          ],
        },
      ];
      if (this.tavernRumors.length > 0) {
        const townName = (this.ctx.sim().towns[this.town]?.def.name ?? '').toLowerCase();
        const stage: CampaignStage = townName.includes('redmarsh') ? 2 : townName.includes('oakhaven') ? 3 : townName.includes('ironcamp') ? 4 : (Math.max(1, Math.min(4, this.town + 1)) as CampaignStage);
        const stageRumors = getRumorsByStage(this.tavernRumors, stage);
        const corin = speakers[2];
        if (corin && stageRumors.length > 0) {
          const sample = stageRumors.slice(0, 4).map((r) => `• "${r.text}"`).join('  ');
          corin.topics.push({
            label: `Act ${stage} Tavern Rumors`,
            skillTag: 'FRONTIER SKEPTICISM - Easy: Success',
            badgeClass: 'de-skepticism',
            sensoryBeat: '*(Master Corin lowers his flagon and rattles off the freshest gossip whispered along the caravan route.)*',
            speech: sample,
            choices: [
              { tag: '[Quartermaster\'s Eye]', text: 'Keep your ears open for supply raids and warband movements.' },
              { tag: '[War Logic]', text: 'Every rumor hides an ambush or an unguarded cache.' },
              { tag: '[Iron Will]', text: 'Steel settles what whispered warnings start.' },
            ],
          });
        }
      }
    } else if (context === 'school') {
      speakers = [
        {
          name: 'High Arcanist Vaelen',
          rank: 'Grand Scholar of the Astral Veil & Keeper of the Primeval Runes',
          portraitSvg: paintedPortrait('npc-aldren', getHighArcanistVaelenPortraitSvg()),
          topics: [
            {
              label: 'Bleeding Membrane of the Veil',
              skillTag: 'ASTRAL SHIVER - Formidable: Success',
              badgeClass: 'de-astral',
              sensoryBeat: '*(He does not look at you; his long, bloodless fingers trace geometric spirals in the air, leaving faint trails of luminous violet mist.)*',
              speech: 'The fools in the council believe magic is a gentle celestial gift. It is not. The Astral Veil is a bleeding, scarred membrane keeping primeval cosmic hungers from swallowing our world whole. Every time an apostate or blood-shaman cracks a wardstone, that membrane stretches and thins. The cold you feel in your teeth before a lightning strike? That is the universe groaning under mortal arrogance.',
              choices: [
                { tag: '[Astral Shiver]', text: 'How much strain can the Veil endure before catastrophic rupture?' },
                { tag: '[War Logic]', text: 'Theories won\'t stop gnolls. Which spells crack stone armor?' },
                { tag: '[Veteran Flesh]', text: 'The only membrane I care about is the one keeping my blood inside my ribs.' },
              ],
            },
            {
              label: 'Runic Friction & Blood Magic',
              skillTag: 'WAR LOGIC - Medium: Success',
              badgeClass: 'de-war-logic',
              sensoryBeat: '*(He pauses, a faint, cold sneer touching his pale lips.)*',
              speech: 'Necromancy was not invented by monsters; it was commissioned by desperate imperial generals whose legions had frozen in the northern passes. When you bind an astral runic chain to cold bone, you are not resurrecting life—you are creating a mechanical puppet powered by spiritual agony. It is efficient, yes. But the debt must always be settled in blood.',
              choices: [
                { tag: '[Astral Shiver]', text: 'Is there a way to unbind those chains without destroying the vessel?' },
                { tag: '[War Logic]', text: 'If the enemy uses puppets, we strike the puppeteer.' },
                { tag: '[Iron Will]', text: 'We purge the abomination wherever it crawls.' },
              ],
            },
            {
              label: 'Primordial Cleansing of the Caldera',
              skillTag: 'PRIMORDIAL RECKONING - Heroic: Success',
              badgeClass: 'de-primordial',
              sensoryBeat: '*(His eyes flash with piercing celestial luminescence as the shadows around the sanctum stretch unnaturally.)*',
              speech: 'At the heart of the Obsidian Caldera, the bedrock breathes. Ember Overlord Vorak does not hate humanity; he simply views us as a moldering parasitic rot upon the earth\'s crust. To him, incandescent magma is the only true antiseptic. If you face him without mastering the elemental counter-spheres—stone to absorb, frost to quench—your vanguard will be reduced to ash before they can draw steel.',
              choices: [
                { tag: '[Astral Shiver]', text: 'Teach me the frost spheres. We will quench his flame.' },
                { tag: '[War Logic]', text: 'Every fire needs fuel. Sunder his conduits and he suffocates.' },
                { tag: '[Iron Will]', text: 'Let his magma boil. Our resolve was forged in colder fires.' },
              ],
            },
          ],
        },
      ];
    } else {
      speakers = [
        {
          name: 'Captain Merrick',
          rank: 'Garrison Commander of the High Keep & Master of Ordnance',
          portraitSvg: paintedPortrait('npc-commander', getCaptainMerrickPortraitSvg()),
          topics: [
            {
              label: 'Physics of Blunt Impact on Plate',
              skillTag: 'QUARTERMASTER\'S EYE - Easy: Success',
              badgeClass: 'de-quartermaster',
              sensoryBeat: '*(He heaves a dented steel breastplate onto the anvil, running heavy, scarred thumbs along the fractured rivets.)*',
              speech: 'New recruits think three millimeters of tempered steel makes them immortal. It does not. A gnoll war-pick or a basalt club doesn\'t need to pierce the cuirass—the kinetic shockwave travels straight through the metal into the ribcage, rupturing the spleen and collapsing the lungs. Mind your skull padding and check your arming doublet after every foray. Dead men don\'t get paid.',
              choices: [
                { tag: '[Quartermaster\'s Eye]', text: 'Reinforce the chest plates with boiled leather backing.' },
                { tag: '[War Logic]', text: 'Keep shields locked forward. Blunt weapons need swinging room—deny it.' },
                { tag: '[Veteran Flesh]', text: 'I\'ve felt cracked ribs before. You learn to breathe shallow.' },
              ],
            },
            {
              label: 'Harmonic Resonance in Relic Sets',
              skillTag: 'WAR LOGIC - Medium: Success',
              badgeClass: 'de-war-logic',
              sensoryBeat: '*(He taps the crossguard of an antique broadsword, producing a clear, ringing harmonic note.)*',
              speech: 'If you discover matching pieces of an antique battlegear set, never sell them for quick coin. The First Wardens forged them with harmonized astral runes. Worn together, the pieces resonate like tuned church bells, generating protective kinetic fields no single smith could ever hammer into iron.',
              choices: [
                { tag: '[Astral Shiver]', text: 'The resonance creates a subtle ward against spellcraft.' },
                { tag: '[Quartermaster\'s Eye]', text: 'We will search every ruin until the complete set is assembled.' },
                { tag: '[Iron Will]', text: 'Masterwork steel in the hands of a master soldier—nothing stands against it.' },
              ],
            },
            {
              label: 'Smuggler Caskets & Heirlooms',
              skillTag: 'FRONTIER SKEPTICISM - Challenging: Success',
              badgeClass: 'de-skepticism',
              sensoryBeat: '*(He spits iron filings onto the workshop floorboards with a grim chuckle.)*',
              speech: 'The smuggler caskets dragged out of the fens are a desperate gambler\'s game. Most hold rusted chain links and tarnished pewter rings from dead soldiers. But every hundredth box? Pried open beneath the blood-grease is a pristine ancestral blade from the old kingdom. If you have gold to burn, roll the dice. Just don\'t wager your last coin.',
              choices: [
                { tag: '[Quartermaster\'s Eye]', text: 'We gamble only what we can afford to lose.' },
                { tag: '[Frontier Skepticism]', text: 'The smugglers grease the hinges to make junk look ancient.' },
                { tag: '[Iron Will]', text: 'A true warrior makes any blade legendary through slaughter.' },
              ],
            },
          ],
        },
      ];
    }

    let activeSpeakerIdx = 0;
    let activeTopicIdx = 0;

    const renderModal = () => {
      this.loreModal.replaceChildren();
      const currentSpeaker = speakers[activeSpeakerIdx];
      const currentTopic = currentSpeaker.topics[activeTopicIdx];

      const isSwitch = this.lastLoreSpeakerIdx !== activeSpeakerIdx;
      this.lastLoreSpeakerIdx = activeSpeakerIdx;

      if (isSwitch) {
        try {
          playSpeakerSwitchThrill();
          playNpcBark(currentSpeaker.name, 0);
        } catch {
          // Safe in headless or audio-disabled test runs
        }
      }
      try {
        setDialogueDucking(true);
      } catch {
        // Safe in headless tests
      }

      const frame = el('div', `gothic-dialogue-frame${isSwitch ? ' speaker-switch-thrill' : ''}`);

      // Left Column: Speaker Portrait (Disco Elysium Grand Side Canvas)
      const portraitCol = el('div', `gothic-portrait-wrapper${isSwitch ? ' portrait-shiver-thrill' : ''}`);
      portraitCol.innerHTML = currentSpeaker.portraitSvg;

      // Right Column: Dialogue Body & Topic Selectors
      const contentCol = el('div', 'gothic-dialogue-content');

      const nameplate = el('div', 'gothic-nameplate');
      nameplate.innerHTML = `<span class="filigree-flourish">✦</span> <span class="speaker-name">${currentSpeaker.name}</span> <span class="filigree-flourish">✦</span>
        <div class="speaker-rank">${currentSpeaker.rank}</div>`;

      // Speaker selection tabs if multiple
      const speakerTabs = el('div', 'lore-speaker-tabs');
      if (speakers.length > 1) {
        speakers.forEach((sp, sIdx) => {
          const tabBtn = button(sp.name, () => {
            activeSpeakerIdx = sIdx;
            activeTopicIdx = 0;
            renderModal();
          });
          tabBtn.className = `lore-tab-btn ${sIdx === activeSpeakerIdx ? 'active' : ''}`;
          speakerTabs.append(tabBtn);
        });
      }

      // Topic Selection Pills
      const topicPills = el('div', 'lore-topic-pills');
      currentSpeaker.topics.forEach((top, tIdx) => {
        const topBtn = button(top.label, () => {
          activeTopicIdx = tIdx;
          renderModal();
        });
        topBtn.className = `lore-pill-btn ${tIdx === activeTopicIdx ? 'active' : ''}`;
        topicPills.append(topBtn);
      });

      const bodyEl = el('div', 'gothic-dialogue-body');

      const badgeEl = el('div', `de-skill-badge ${currentTopic.badgeClass}`, currentTopic.skillTag);
      const sensoryEl = el('div', 'de-sensory-beat', currentTopic.sensoryBeat);
      const speechEl = el('div', 'de-speech-text', '');

      const choicesEl = el('div', 'commander-responses-container');
      choicesEl.style.display = 'none';

      currentTopic.choices.forEach((c, cIdx) => {
        const choiceBtn = button('', () => {
          try { blip(); } catch {}
          choiceBtn.style.borderColor = '#ffd870';
          choiceBtn.style.color = '#fff';
        });
        choiceBtn.className = 'commander-choice-btn';
        choiceBtn.innerHTML = `<span class="choice-num">${cIdx + 1}.</span> <span class="choice-tag">${c.tag}</span> <span class="choice-text">"${c.text}"</span>`;
        choicesEl.append(choiceBtn);
      });

      bodyEl.append(badgeEl, sensoryEl, speechEl, choicesEl);

      const footer = el('div', 'gothic-dialogue-footer');
      const topicCounter = el('span', 'dialogue-queue-count', `Lore Entry: ${activeTopicIdx + 1}/${currentSpeaker.topics.length}`);
      const closeBtn = button('Close [Esc]', () => {
        this.loreModal.hidden = true;
        this.lastLoreSpeakerIdx = -1;
        try { setDialogueDucking(false); } catch {}
        if (this.loreTypingTimer !== null) {
          clearInterval(this.loreTypingTimer);
          this.loreTypingTimer = null;
        }
      });
      closeBtn.className = 'gothic-continue-btn';
      footer.append(topicCounter, closeBtn);

      contentCol.append(nameplate);
      if (speakers.length > 1) contentCol.append(speakerTabs);
      contentCol.append(topicPills, bodyEl, footer);
      frame.append(portraitCol, contentCol);
      this.loreModal.append(frame);

      frame.onclick = (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (this.loreTypingTimer !== null) {
          clearInterval(this.loreTypingTimer);
          this.loreTypingTimer = null;
          speechEl.textContent = fullText;
          choicesEl.style.display = 'flex';
        }
      };

      // Typewriter animation
      if (this.loreTypingTimer !== null) clearInterval(this.loreTypingTimer);
      let charIdx = 0;
      const fullText = currentTopic.speech;

      this.loreTypingTimer = window.setInterval(() => {
        if (charIdx < fullText.length) {
          speechEl.textContent += fullText[charIdx];
          if (charIdx % 3 === 0 && fullText[charIdx] !== ' ') {
            try { blip(); } catch {}
          }
          charIdx++;
        } else {
          if (this.loreTypingTimer !== null) {
            clearInterval(this.loreTypingTimer);
            this.loreTypingTimer = null;
          }
          speechEl.textContent = fullText;
          choicesEl.style.display = 'flex';
        }
      }, 16);
    };

    this.loreModal.hidden = false;
    renderModal();
  }
}
