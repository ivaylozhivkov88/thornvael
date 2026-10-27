import { DEFS } from './sim/combat';
import { mercPrice } from './sim/difficulty';
import { INV_MAX, SKILL_MAX, SKILL_NAMES } from './sim/hero';
import { ITEMS, itemText } from './sim/items';
import type { Sim } from './sim/sim';
import { SPELLS } from './sim/spelldata';
import { OFFERS, QuestType, ROLE_COUNT, Role, SHELF, priceOf, sellPrice, spellPrice, trainPrice, type Quest, type TownCommand } from './sim/town';
import { S } from './strings';

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
    .replace('{item}', ITEMS[q.a]?.name ?? '')
    .replace('{skill}', SKILL_NAMES[q.a] ?? '');
}

/** Moods of the shopkeeper: index into S.town.keeper and a CSS class. */
const MOOD = ['greet', 'pleased', 'sorry', 'farewell', 'thinking', 'pleased'] as const;

export class TownUi {
  private readonly root: HTMLElement;
  private town = -1;
  private role = -1;
  // Shop picks not settled yet: shelf slots to buy, pack item ids to sell, and the order they were made in.
  private buys: number[] = [];
  private sells: number[] = [];
  private picks: ('b' | 's')[] = [];
  private mood = 0;
  private moodTimer = 0;

  constructor(private readonly ctx: TownUiCtx) {
    this.root = el('div', 'sheet town');
    this.root.setAttribute('role', 'dialog');
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
    const sim = this.ctx.sim();
    sim.now({ type: 'town', op: 'enter', town, v: role });
    if (sim.town.inside !== town * ROLE_COUNT + role) return false;
    this.town = town;
    this.role = role;
    this.buys = [];
    this.sells = [];
    this.picks = [];
    this.setMood(0);
    this.root.hidden = false;
    this.root.setAttribute('aria-label', S.town.roles[role]);
    this.ctx.pause(true);
    this.ctx.onOpen();
    this.render();
    return true;
  }

  close(): void {
    if (!this.open) return;
    this.cmd('leave');
    this.root.hidden = true;
    clearTimeout(this.moodTimer);
    this.ctx.pause(false);
    this.ctx.changed();
  }

  private setMood(m: number): void {
    this.mood = m;
    clearTimeout(this.moodTimer);
    if (m !== 0 && m !== 3) this.moodTimer = window.setTimeout(() => this.setMood(4), 2500);
    const k = this.root.querySelector('.keeper');
    if (k) this.paintKeeper(k as HTMLElement);
  }

  private paintKeeper(k: HTMLElement): void {
    k.className = `keeper ${MOOD[this.mood]}`;
    k.querySelector('.say')!.textContent = S.town.keeper[this.mood];
  }

  private render(): void {
    const sim = this.ctx.sim();
    const def = sim.towns[this.town].def;
    this.root.replaceChildren();
    const head = el('div', 'sheet-head');
    head.append(el('h2', '', `${def.name}: ${S.town.roles[this.role]}`), el('span', 'spacer'), el('b', 'gold', `${S.town.gold} ${sim.cb.gold[0]}`), button(S.town.leave, () => this.close()));
    this.root.append(head);
    if (this.role === Role.Shop) this.renderShop(sim);
    else if (this.role === Role.Tavern) this.renderTavern(sim);
    else this.renderSchool(sim);
  }

  // ---- shop ----

  private renderShop(sim: Sim): void {
    const h = sim.hero!;
    const shelf = sim.town.stock[this.town];
    const keeper = el('div', 'keeper');
    keeper.append(el('div', 'figure'), el('div', 'say'));
    keeper.querySelector('.figure')!.append(el('i', 'head'), el('i', 'eyes'), el('i', 'mouth'), el('i', 'body'), el('i', 'arm'));
    this.paintKeeper(keeper);
    const top = el('div', 'shop-top');
    top.append(keeper);
    const bill = el('div', 'bill lines');
    const buyTotal = this.buys.reduce((n, k) => n + priceOf(shelf[k]), 0);
    const sellTotal = this.sells.reduce((n, id) => n + sellPrice(id), 0);
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
    top.append(bill);
    this.root.append(top);

    this.root.append(el('h3', '', S.town.shelf));
    const sg = el('div', 'grid shelf');
    for (let k = 0; k < SHELF; k++) {
      const id = shelf[k];
      if (id < 0) {
        sg.append(el('div', 'cell empty'));
        continue;
      }
      const b = button(ITEMS[id].name, () => {
        const at = this.buys.indexOf(k);
        if (at >= 0) {
          this.buys.splice(at, 1);
          this.picks.splice(this.picks.lastIndexOf('b'), 1);
        } else {
          this.buys.push(k);
          this.picks.push('b');
          this.setMood(4);
        }
        this.render();
      }, String(priceOf(id)));
      b.className = `cell${this.buys.includes(k) ? ' sel' : ''}`;
      this.ctx.tipOn(b, itemText(id));
      sg.append(b);
    }
    this.root.append(sg);

    this.root.append(el('h3', '', S.town.yourPack));
    const pg = el('div', 'grid pack');
    for (let k = 0; k < INV_MAX; k++) {
      const s = h.inv[k];
      if (!s) {
        pg.append(el('div', 'cell empty'));
        continue;
      }
      const picked = this.sells.filter((id) => id === s.item).length;
      const b = button(ITEMS[s.item].name, () => {
        if (picked >= s.n) return;
        this.sells.push(s.item);
        this.picks.push('s');
        this.render();
      }, `${sellPrice(s.item)}${s.n > 1 ? `  x${s.n - picked}` : ''}`);
      b.className = `cell${picked ? ' sel' : ''}${picked >= s.n ? ' no' : ''}`;
      this.ctx.tipOn(b, itemText(s.item));
      pg.append(b);
    }
    this.root.append(pg);

    const acts = el('div', 'acts shop-acts');
    const undo = button(S.town.undo, () => {
      const last = this.picks.pop();
      if (last === 'b') this.buys.pop();
      else if (last === 's') this.sells.pop();
      this.render();
    });
    undo.disabled = this.picks.length === 0;
    const buy = button(S.town.buy, () => {
      const g0 = sim.cb.gold[0];
      this.cmd('buy', undefined, this.buys);
      const ok = sim.cb.gold[0] < g0;
      this.setMood(ok ? 1 : 2);
      if (ok) {
        this.buys = [];
        this.picks = this.picks.filter((p) => p === 's');
      }
      this.ctx.changed();
      this.render();
    });
    buy.disabled = this.buys.length === 0;
    const sell = button(S.town.sell, () => {
      this.cmd('sell', undefined, this.sells);
      this.sells = [];
      this.picks = this.picks.filter((p) => p === 'b');
      this.setMood(5);
      this.ctx.changed();
      this.render();
    });
    sell.disabled = this.sells.length === 0;
    const exit = button(S.town.leave, () => {
      this.setMood(3);
      window.setTimeout(() => this.close(), 350);
    });
    acts.append(undo, buy, sell, exit);
    this.root.append(acts, el('p', 'note', S.town.shopHelp));
  }

  // ---- tavern ----

  private renderTavern(sim: Sim): void {
    const def = sim.towns[this.town].def;
    this.root.append(el('h3', '', S.town.mercs));
    const ml = el('div', 'items');
    for (const [k, m] of (def.mercs ?? []).entries()) {
      const free = sim.hidden[m.unit] === 1 && sim.cb.hp[m.unit] > 0;
      const b = button(DEFS[sim.cb.kind[m.unit]].name, () => {
        this.cmd('hire', k);
        this.ctx.changed();
        this.render();
      }, free ? `${S.town.hire}: ${mercPrice(sim, m.price)} ${S.town.gold.toLowerCase()}` : S.town.hired);
      b.disabled = !free;
      if (free && mercPrice(sim, m.price) > sim.cb.gold[0]) b.classList.add('no');
      ml.append(b);
    }
    this.root.append(def.mercs?.length ? ml : el('p', 'note', S.town.noMercs));

    this.root.append(el('h3', '', S.town.board));
    const offers = sim.town.offers[this.town];
    const ol = el('div', 'lines');
    offers.slice(0, OFFERS).forEach((q, k) => {
      const l = el('div', 'line');
      l.append(el('span', 'grow', questText(sim, q)), el('b', '', `${S.town.reward} ${q.reward}`), button(S.town.accept, () => {
        this.cmd('accept', k);
        this.render();
      }));
      ol.append(l);
    });
    this.root.append(offers.length ? ol : el('p', 'note', S.town.noQuests));

    this.root.append(el('h3', '', S.town.yourQuests));
    const ql = el('div', 'lines');
    for (const q of sim.town.quests) {
      const l = el('div', 'line');
      l.append(el('span', 'grow', questText(sim, q)), el('b', '', `${S.town.reward} ${q.reward}`));
      ql.append(l);
    }
    this.root.append(sim.town.quests.length ? ql : el('p', 'note', S.town.none));
  }

  // ---- school ----

  private renderSchool(sim: Sim): void {
    const h = sim.hero!;
    const def = sim.towns[this.town].def;
    this.root.append(el('h3', '', S.town.spells));
    const sl = el('div', 'items');
    for (const s of def.spells ?? []) {
      const known = ((h.known >>> s) & 1) === 1;
      const b = button(SPELLS[s].name, () => {
        this.cmd('learn', s);
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
        this.cmd('train', k);
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
