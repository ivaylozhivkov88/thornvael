import { DEFS } from './sim/combat';
import { mercPrice } from './sim/difficulty';
import { INV_MAX, SKILL_MAX, SKILL_NAMES } from './sim/hero';
import { ITEMS, getItemDef, itemText } from './sim/items';
import { formatItemTooltip, renderItemTooltipDom } from './heroui';
import { isSetItem } from './sim/sets';
import type { Sim } from './sim/sim';
import { SPELLS } from './sim/spelldata';
import { OFFERS, QuestType, ROLE_COUNT, Role, SHELF, gambleCost, priceOf, sellPrice, spellPrice, trainPrice, type Quest, type TownCommand } from './sim/town';
import { S } from './strings';
import { itemIcon } from './townicons';
import { playTraderBark, playTownAmbience, stopTownAmbience } from './audio';

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

  constructor(private readonly ctx: TownUiCtx) {
    this.root = el('div', 'sheet town');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.tabIndex = -1;
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

  close(): void {
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

  private scene(kind: 'shop' | 'tavern'): HTMLElement {
    const keeper = el('div', 'keeper scene-panel');
    const background = el('img', 'town-backdrop');
    background.src = `${import.meta.env.BASE_URL}townart/${kind}.png`;
    background.alt = S.town.scene[kind];
    const actor = el('img', 'merchant-actor');
    actor.src = `${import.meta.env.BASE_URL}townart/merchant-${kind}.png`;
    actor.alt = '';
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
    const image = el('img');
    image.src = `${import.meta.env.BASE_URL}townart/portrait-${sim.hero!.cls ? 'mage' : 'warrior'}-${sim.hero!.female ? 'f' : 'm'}.png`;
    image.alt = S.hero.classes[sim.hero!.cls];
    figure.append(image, el('figcaption', '', S.hero.classes[sim.hero!.cls]));
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
        this.render();
      }, String(priceOf(id)));
      b.className = `cell${this.buys.includes(k) ? ' sel' : ''}`;
      b.dataset.slot = String(k);
      this.decorateItem(b, id);
      this.ctx.tipOn(b, formatItemTooltip(id, h));
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
        this.detailItem = s.item;
        if (picked >= s.n) { this.render(); return; }
        this.sells.push(k);
        this.picks.push({ kind: 's', value: k });
        this.render();
      }, `${sellPrice(s.item)}${s.n > 1 ? `  x${s.n - picked}` : ''}`);
      b.className = `cell${picked ? ' sel' : ''}${picked >= s.n ? ' no' : ''}`;
      b.dataset.packSlot = String(k);
      this.decorateItem(b, s.item);
      this.ctx.tipOn(b, formatItemTooltip(s.item, h));
      pg.append(b);
    }
    packPanel.append(pg, this.pager('pack', this.packPage, Math.ceil(INV_MAX / 10), (p) => { this.packPage = p; this.render(); }));

    const acts = el('div', 'trade-actions');
    const undo = button(S.town.undo, () => {
      const last = this.picks.pop();
      if (last) {
        const picks = last.kind === 'b' ? this.buys : this.sells;
        const index = picks.lastIndexOf(last.value);
        if (index >= 0) picks.splice(index, 1);
      }
      this.render();
    }, String(sim.cb.gold[0]));
    undo.disabled = this.picks.length === 0;
    const buy = button(S.town.buy, () => {
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
    const sell = button(S.town.sell, () => {
      this.cmd('sell', undefined, this.sells.map((slot) => h.inv[slot].item));
      this.sells = [];
      this.picks = this.picks.filter((p) => p.kind === 'b');
      this.setMood(5);
      this.ctx.changed();
      this.render();
    }, `+${sellTotal}`);
    sell.disabled = this.sells.length === 0;
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
    const detailView = this.detailItem >= 0 ? renderItemTooltipDom(this.detailItem, h) : el('p', 'selected-item', S.town.selectItem);
    details.append(bill, detailView, el('p', 'note', S.town.shopHelp));
    const layout = el('div', 'trade-layout');
    layout.append(stockPanel, keeper, acts, this.portrait(sim), packPanel, details);
    this.root.append(layout);
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
