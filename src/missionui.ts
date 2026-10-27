import type { MapDoc } from './mapdoc';
import type { Sim } from './sim/sim';
import { S } from './strings';

/** Host callbacks: the game owns the pause flag. */
export interface MissionHost {
  pause(on: boolean): void;
}

const OBJ_MARK = ['', '◻', '✔', '✖'];

/**
 * Briefing, dialogue, objectives and the result text of a scripted mission. All text comes from
 * the map's own string table and is shown with textContent, so a map can never inject markup.
 */
export class MissionUi {
  private readonly sheet = document.createElement('div');
  private readonly goals = document.createElement('div');
  private queue: { who: string; text: string }[] = [];
  private cursor = 0;
  private open = false;

  constructor(
    private readonly doc: MapDoc,
    private readonly host: MissionHost,
  ) {
    this.sheet.id = 'mission';
    this.sheet.className = 'sheet';
    this.sheet.hidden = true;
    this.goals.id = 'objectives';
    this.goals.hidden = true;
    document.body.append(this.sheet, this.goals);
  }

  /** True while a briefing or a dialogue line is on screen or waiting. */
  get busy(): boolean {
    return this.open || this.queue.length > 0;
  }

  private t(key: string, fallback = ''): string {
    return this.doc.text[key] ?? fallback;
  }

  private show(title: string, who: string, body: string, goals: string[], button: string, done: () => void): void {
    const s = this.sheet;
    s.replaceChildren();
    const h = document.createElement('h2');
    h.textContent = title;
    s.append(h);
    if (who) {
      const w = document.createElement('div');
      w.className = 'who';
      w.textContent = who;
      s.append(w);
    }
    const p = document.createElement('p');
    p.textContent = body;
    s.append(p);
    if (goals.length) {
      const ul = document.createElement('ul');
      for (const g of goals) {
        const li = document.createElement('li');
        li.textContent = g;
        ul.append(li);
      }
      s.append(ul);
    }
    const b = document.createElement('button');
    b.textContent = button;
    b.onclick = () => {
      s.hidden = true;
      this.open = false;
      done();
    };
    s.append(b);
    s.hidden = false;
    this.open = true;
    this.host.pause(true);
    b.focus();
  }

  /** Mission briefing: title, text and the objective list. `begin` runs when the player confirms. */
  briefing(begin: () => void): void {
    const goals: string[] = [];
    for (let i = 0; this.doc.text[`obj.${i}`] !== undefined; i++) goals.push(this.doc.text[`obj.${i}`]);
    this.show(this.t('title', this.doc.name), '', this.t('body'), goals, S.mission.begin, begin);
  }

  /** Called a few times a second: shows new messages one by one and keeps the objective list current. */
  update(sim: Sim): void {
    const st = sim.script?.st;
    if (!st) return;
    for (; this.cursor < st.msgs.length; this.cursor += 2) {
      const n = st.msgs[this.cursor + 1];
      this.queue.push({ who: this.t(`msg.${n}.who`), text: this.t(`msg.${n}`, `(${S.mission.noText} ${n})`) });
    }
    if (!this.open && this.queue.length) {
      const m = this.queue.shift()!;
      this.show(S.mission.message, m.who, m.text, [], this.queue.length ? S.mission.next : S.mission.go, () => {
        if (!this.queue.length) this.host.pause(false);
        else this.update(sim);
      });
    }
    const lines: string[] = [];
    for (let i = 0; this.doc.text[`obj.${i}`] !== undefined; i++) if (st.sub[i] > 0) lines.push(`${OBJ_MARK[st.sub[i]] ?? ''} ${this.doc.text[`obj.${i}`]}`);
    this.goals.textContent = lines.join('\n');
    this.goals.hidden = lines.length === 0;
  }

  /** After a snapshot restore: do not replay old messages. */
  resync(sim: Sim): void {
    this.cursor = sim.script?.st.msgs.length ?? 0;
    this.queue = [];
  }

  resultText(sim: Sim): string {
    const st = sim.script!.st;
    return st.status === 1 ? this.t('win', S.victoryBody) : this.t(`fail.${st.cause}`, S.defeatBody);
  }
}

/** The list of missions and tools, opened from the bar. */
export function showMissionMenu(): void {
  let el = document.getElementById('missions');
  if (!el) {
    el = document.createElement('div');
    el.id = 'missions';
    el.className = 'sheet';
    document.body.append(el);
  }
  const root = el;
  root.replaceChildren();
  const h = document.createElement('h2');
  h.textContent = S.mission.menu;
  root.append(h);
  const links: [string, string][] = [
    [S.mission.free, './'],
    [S.mission.ford, './?mission=ford'],
    [S.mission.market, './?mission=market'],
    [S.mission.test, './?mission=test'],
    [S.mission.editor, './editor.html'],
  ];
  for (const [label, href] of links) {
    const a = document.createElement('a');
    a.textContent = label;
    a.href = href;
    a.className = 'menu-link';
    root.append(a);
  }
  const close = document.createElement('button');
  close.textContent = S.mission.close;
  close.onclick = () => (root.hidden = true);
  root.append(close);
  root.hidden = false;
}
