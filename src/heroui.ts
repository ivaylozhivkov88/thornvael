import { DEFS, Kind, M, MODN } from './sim/combat';
import { DIFF_NAMES, INV_MAX, SKILL_MAX, SKILL_NAMES, SKILL_TIP, WHY_TEXT, blocker, derive, skillNeed, startState, type HeroState } from './sim/hero';
import { ITEMS, Ik, SLOT_COUNT, SLOT_NAMES, itemText } from './sim/items';
import type { Command, Sim } from './sim/sim';
import { SPELLS } from './sim/spelldata';
import { S } from './strings';

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
interface Sel {
  from: 'inv' | 'eq';
  item: number;
  slot: number;
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

export class HeroUi {
  tab: Tab = 'hero';
  private sel: Sel | null = null;
  private sig = '';
  private readonly sheet = document.getElementById('sheet')!;
  private readonly head = document.getElementById('sheet-head')!;
  private readonly body = document.getElementById('sheet-body')!;
  private readonly create = document.getElementById('create')!;

  constructor(private readonly ctx: HeroUiCtx) {}

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
    this.sel = null;
    this.sheet.hidden = false;
    this.render(true);
    this.head.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }

  close(): void {
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
    if (h === null) return;
    const cb = sim.cb;
    if (this.sel && (this.sel.from === 'inv' ? !h.inv.some((s) => s.item === this.sel!.item) : h.eq[this.sel.slot] !== this.sel.item)) this.sel = null;
    const sig = JSON.stringify([h, cb.hp[h.id], cb.hpMax[h.id], cb.mana[h.id], cb.manaMax[h.id], this.sel, this.tab]);
    if (!force && sig === this.sig) return;
    this.sig = sig;
    const focus = (document.activeElement as HTMLElement | null)?.dataset?.k;
    this.head.replaceChildren();
    const info = el('span', '', `${S.hero.classes[h.cls]}, ${S.hero.sexes[h.female ? 1 : 0].toLowerCase()} · ${DIFF_NAMES[h.diff]}`);
    const close = button(S.hero.close, 'close', () => this.close());
    const sp = el('span', 'spacer');
    this.head.append(tabStrip(this.tab === 'hero' ? 0 : 1, (n) => this.go(n)), info, sp, close);
    this.body.replaceChildren();
    if (this.tab === 'hero') this.renderHero(h, sim);
    else this.renderPack(h);
    if (this.sel) this.body.append(this.detail(h, this.sel));
    else this.body.append(el('p', 'note', S.hero.noSel));
    if (focus) this.sheet.querySelector<HTMLElement>(`[data-k="${focus}"]`)?.focus({ preventScroll: true });
  }

  private weightLine(h: HeroState): HTMLElement {
    const d = derive(h);
    const m = meter(d.weight >= d.capacity ? 'wt over' : 'wt', d.weight, d.capacity);
    return line(S.hero.weight, `${d.weight} / ${d.capacity}`, '', m);
  }

  private renderHero(h: HeroState, sim: Sim): void {
    const cb = sim.cb;
    const i = h.id;
    const d = derive(h);
    const b = this.body;
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
      const lvl = h.skill[k];
      sl.append(line(SKILL_NAMES[k], lvl >= SKILL_MAX ? `${S.hero.level} ${lvl} (max)` : `${S.hero.level} ${lvl}`, SKILL_TIP[k], meter('', lvl >= SKILL_MAX ? 1 : h.use[k], lvl >= SKILL_MAX ? 1 : skillNeed(lvl))));
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
    b.append(cols, el('h3', '', S.hero.equipment));
    const slots = el('div', 'slots');
    for (let s = 0; s < SLOT_COUNT; s++) {
      const id = h.eq[s];
      const bt = button(id >= 0 ? ITEMS[id].name : S.hero.empty, `eq${s}`, () => {
        if (id < 0) return;
        this.sel = this.sel?.from === 'eq' && this.sel.slot === s ? null : { from: 'eq', item: id, slot: s };
        this.render(true);
      }, SLOT_NAMES[s]);
      bt.classList.toggle('sel', this.sel?.from === 'eq' && this.sel.slot === s);
      if (id >= 0) this.ctx.tipOn(bt, itemText(id));
      slots.append(bt);
    }
    b.append(slots, this.weightLine(h));
  }

  private renderPack(h: HeroState): void {
    this.body.append(this.weightLine(h), el('h3', '', `${S.hero.pack} (${h.inv.length}/${INV_MAX})`));
    if (h.inv.length === 0) {
      this.body.append(el('p', 'note', S.hero.noItems));
      return;
    }
    const grid = el('div', 'items');
    h.inv.forEach((st, n) => {
      const d = ITEMS[st.item];
      const bt = button(st.n > 1 ? `${d.name} x${st.n}` : d.name, `inv${n}`, () => {
        this.sel = this.sel?.from === 'inv' && this.sel.item === st.item ? null : { from: 'inv', item: st.item, slot: -1 };
        this.render(true);
      }, `${S.hero.level} ${d.tier} · ${d.w * st.n} ${S.hero.weight.toLowerCase()}`);
      bt.classList.toggle('sel', this.sel?.from === 'inv' && this.sel.item === st.item);
      bt.classList.toggle('no', blocker(h, st.item) !== 0);
      this.ctx.tipOn(bt, itemText(st.item));
      grid.append(bt);
    });
    this.body.append(grid);
  }

  private detail(h: HeroState, sel: Sel): HTMLElement {
    const d = ITEMS[sel.item];
    const box = el('div', 'detail');
    box.append(el('div', '', itemText(sel.item)));
    const why = sel.from === 'inv' ? blocker(h, sel.item) : 0;
    if (why) box.append(el('div', 'note', `⚠ ${WHY_TEXT[why]}`));
    const acts = el('div', 'acts');
    if (sel.from === 'eq') {
      acts.append(button(S.hero.unequip, 'act-unequip', () => this.act({ type: 'hero', op: 'unequip', slot: sel.slot })));
    } else {
      const label = d.kind === Ik.Gear ? S.hero.equip : d.kind === Ik.Learn ? S.hero.learn : S.hero.use;
      const go = button(label, 'act-use', () => this.act({ type: 'hero', op: 'use', item: sel.item }));
      go.disabled = why !== 0;
      acts.append(go, button(S.hero.drop, 'act-drop', () => this.act({ type: 'hero', op: 'drop', item: sel.item })));
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
