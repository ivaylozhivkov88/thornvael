import { nodeOf, type CampaignNode } from './campaign';
import { loadCampaign, readRecord, writeRecord } from './campaignstore';
import { canEnter, newRecord, nodeUrl, RECORD_KEY, clearLast, type CampaignRecord, type HeroPick } from './flow';
import { BUILT_IN } from './mission';
import { downloadChapter, loadManifest, verifyChapter, type ChapterCheck, type Env, type Manifest } from './offline';
import { encodeSave } from './save';
import { encodeBundle, type BundleEntry } from './savebundle';
import { applyUpdate, onUpdateWaiting, updateWaiting } from './updategate';
import { AUTO, deleteRecord, deleteSave, getSave, listSaves } from './savedb';
import { S } from './strings';

/**
 * The screens around the game: main menu, hero creation, global map, briefing and result.
 * Every step that starts a mission or town is a page address (`?mission=..&campaign=..`), so each node begins from a clean page.
 * The campaign record lives in IndexedDB (see flow.ts). All text is set with textContent.
 */
const T = S.shell;
const MAPS: ReadonlySet<string> = new Set(Object.keys(BUILT_IN));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function btn(label: string, run: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `sh-btn ${cls}`.trim(), label);
  b.onclick = run;
  return b;
}

export async function runShell(startWorker: () => void): Promise<never> {
  startWorker();
  const root = el('div');
  root.id = 'shell';
  document.body.append(root);
  const c = await loadCampaign();
  let rec = await readRecord();
  let auto = null as Awaited<ReturnType<typeof getSave>>;
  try {
    auto = await getSave(AUTO);
  } catch {
    /* storage unavailable: no Continue from a slot */
  }
  const go = (url: string): void => location.assign(url);
  const screen = (...kids: HTMLElement[]): void => root.replaceChildren(...kids);
  const back = (): HTMLButtonElement => btn(T.back, menu, 'sh-small');
  // The update banner shows only on the menu and the map, never in a mission or while a sub-screen is open.
  let mode: 'menu' | 'map' | 'other' = 'other';
  const banner = (): HTMLElement[] => (updateWaiting() ? [el('p', 'sh-update', `${T.updateBanner}`), btn(T.updateNow, applyUpdate)] : []);
  onUpdateWaiting(() => {
    if (mode === 'menu') menu();
    else if (mode === 'map') map();
  });

  // ---- main menu ----
  function menu(): void {
    mode = 'menu';
    const canContinue = rec !== null || auto !== null;
    const cont = btn(T.continue, () => {
      if (auto && (!rec || auto.state.node)) go(`./?load=${AUTO}`);
      else map();
    });
    cont.disabled = !canContinue;
    const col = el('div', 'sh-col');
    col.append(
      el('h1', '', S.title),
      ...banner(),
      btn(T.newGame, create),
      cont,
      btn(T.saves, slots),
      btn(T.storage, storage),
      btn(T.settings, settings),
      btn(T.credits, credits),
      btn(T.free, () => go('./?free=1'), 'sh-quiet'),
    );
    screen(col);
  }

  // ---- hero creation: class, sex, difficulty ----
  function create(): void {
    mode = 'other';
    const pick: HeroPick = { cls: 0, female: false };
    let diff = 1;
    const info = el('p', 'note');
    const row = (names: readonly string[], get: () => number, set: (i: number) => void): HTMLElement => {
      const r = el('div', 'sh-row');
      const draw = (): void => r.replaceChildren(...names.map((n, i) => btn(n, () => (set(i), draw(), (info.textContent = T.diffInfo[diff])), i === get() ? 'sh-on' : '')));
      draw();
      return r;
    };
    info.textContent = T.diffInfo[diff];
    const col = el('div', 'sh-col');
    col.append(
      el('h2', '', T.createTitle),
      row(T.cls, () => pick.cls, (i) => (pick.cls = i)),
      row(T.sex, () => (pick.female ? 1 : 0), (i) => (pick.female = i === 1)),
      row(T.diff, () => diff, (i) => (diff = i)),
      info,
      btn(T.start, async () => {
        rec = newRecord(c, pick, diff);
        await writeRecord(rec);
        await deleteSave(AUTO).catch(() => undefined); // an old mid-mission autosave must not outlive a new game
        auto = null;
        map();
      }),
      back(),
    );
    screen(col);
  }

  // ---- global map ----
  function map(): void {
    if (!rec) return menu();
    mode = 'map';
    const r = rec;
    const stage = el('div', 'sh-map');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    for (const n of c.nodes) {
      for (const u of n.unlocksOnVictory) {
        const m = nodeOf(c, u);
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', String(n.pos[0]));
        l.setAttribute('y1', String(n.pos[1]));
        l.setAttribute('x2', String(m.pos[0]));
        l.setAttribute('y2', String(m.pos[1]));
        l.setAttribute('class', r.progress.unlocked.includes(u) ? 'on' : '');
        svg.append(l);
      }
    }
    stage.append(svg);
    for (const n of c.nodes) {
      const open = canEnter(r, n.id, MAPS, c);
      const done = r.progress.completed.includes(n.id);
      const tag = !r.progress.unlocked.includes(n.id) ? T.locked : !MAPS.has(n.map) ? T.soon : done ? T.done : '';
      const b = btn(`${n.kind === 'town' ? '⌂ ' : ''}${n.title}${tag ? `\n(${tag})` : ''}`, () => briefing(n), `sh-node${done ? ' done' : ''}${n.id === r.progress.node ? ' here' : ''}`);
      b.style.left = `${n.pos[0]}%`;
      b.style.top = `${n.pos[1]}%`;
      b.disabled = !open;
      stage.append(b);
    }
    const bar = el('div', 'sh-bar');
    bar.append(el('b', '', `${T.mapTitle} · ${T.diff[r.progress.difficulty]}`), ...banner(), btn(T.back, menu, 'sh-small'));
    screen(bar, stage);
    if (r.last) result(r.last);
  }

  // ---- briefing modal ----
  function briefing(n: CampaignNode): void {
    const m = el('div', 'sh-modal');
    const box = el('div', 'sh-box');
    box.append(el('h2', '', n.title), el('p', '', n.briefing), btn(n.kind === 'town' ? T.enterTown : T.enter, () => go(nodeUrl(n))), btn(T.back, () => m.remove(), 'sh-small'));
    m.append(box);
    root.append(m);
  }

  // ---- result screen: shown once after a mission or when leaving it ----
  function result(last: NonNullable<CampaignRecord['last']>): void {
    const n = nodeOf(c, last.node);
    const m = el('div', 'sh-modal');
    const box = el('div', 'sh-box');
    const text = last.text || (last.win ? n.result?.win : n.result?.lose) || '';
    const carry = rec?.carry;
    const lines = [`${T.stats}: ${last.up}/${last.size}`, `${T.gold}: ${last.gold}`];
    if (carry) lines.push(`${T.mercs}: ${carry.mercs.length}`, `${T.loot}: ${carry.hero.inv.length}`);
    box.append(
      el('h2', '', `${last.win ? T.victory : T.defeat}: ${n.title}`),
      el('p', '', text),
      el('p', 'note', lines.join('\n')),
      btn(last.win ? T.toMap : T.retry, async () => {
        if (rec) {
          rec = clearLast(rec);
          await writeRecord(rec);
        }
        m.remove();
      }),
    );
    m.append(box);
    root.append(m);
  }

  // ---- saves: load or export a slot ----
  async function slots(): Promise<void> {
    mode = 'other';
    const col = el('div', 'sh-col');
    col.append(el('h2', '', T.saves));
    const list = await listSaves().catch(() => []);
    if (!list.length) col.append(el('p', 'note', T.noSaves));
    for (const s of list) {
      const row = el('div', 'sh-row');
      row.append(
        btn(`${T.load}: ${s.id === AUTO ? 'Autosave' : s.name}\n${s.label}`, () => go(`./?load=${encodeURIComponent(s.id)}`), 'sh-wide'),
        btn(T.exportSave, async () => {
          const f = await getSave(s.id);
          if (!f) return;
          const a = el('a');
          a.href = URL.createObjectURL(new Blob([encodeSave(f)], { type: 'application/json' }));
          a.download = `thornvael-${(s.id === AUTO ? 'autosave' : s.name).replace(/[^\w-]+/g, '-').toLowerCase() || 'save'}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        }, 'sh-small'),
      );
      col.append(row);
    }
    col.append(back());
    screen(col);
  }

  // ---- export every slot in one file (the iOS safety net) ----
  async function exportAll(): Promise<boolean> {
    const list = await listSaves().catch(() => []);
    const entries: BundleEntry[] = [];
    for (const s of list) {
      const file = await getSave(s.id).catch(() => undefined);
      if (file) entries.push({ id: s.id, file });
    }
    if (!entries.length) return false;
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([encodeBundle(entries)], { type: 'application/json' }));
    a.download = 'thornvael-all-saves.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return true;
  }

  // ---- storage: real numbers, the Chapter 1 download and the all-saves export ----
  async function storage(): Promise<void> {
    mode = 'other';
    const col = el('div', 'sh-col');
    const info = el('p', 'note', '…');
    const status = el('p', 'note');
    const bar = el('progress');
    bar.hidden = true;
    bar.max = 1;
    const env: Env = { caches, fetchFn: (u, i) => fetch(u, i), base: import.meta.env.BASE_URL };
    let man: Manifest | null = null;
    const show = (r: ChapterCheck): void => {
      status.textContent = r.ok ? T.ready : r.have ? T.partial.replace('{n}', String(r.missing.length)) : '';
    };
    const dl = btn(T.download, async () => {
      if (!man) return;
      dl.disabled = true;
      bar.hidden = false;
      status.textContent = T.downloading;
      const r = await downloadChapter(env, man, (d, t) => (bar.value = t ? d / t : 1));
      bar.hidden = true;
      dl.disabled = false;
      if (r.ok) show(r);
      else status.textContent = `${T.dlFailed}\n${T.partial.replace('{n}', String(r.missing.length))}`;
    });
    dl.disabled = true;
    const exp = btn(T.exportAll, async () => {
      if (!(await exportAll())) status.textContent = T.noneToExport;
    });
    col.append(el('h2', '', T.storage), info, el('h3', '', T.chapter1), status, bar, dl, exp, back());
    screen(col);
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    const keep = await navigator.storage?.persisted?.().catch(() => false);
    const count = (await listSaves().catch(() => [])).length + (rec ? 1 : 0);
    info.textContent = `${T.used}: ${est ? Math.round((est.usage ?? 0) / 1048576) : '?'} MB / ${est ? Math.round((est.quota ?? 0) / 1048576) : '?'} MB\n${T.records}: ${count}\n${T.persisted}: ${keep ? 'yes' : 'no'}`;
    try {
      man = await loadManifest(env);
      show(await verifyChapter(env, man));
      dl.disabled = false;
    } catch {
      status.textContent = T.dlFailed;
    }
  }

  function settings(): void {
    mode = 'other';
    const col = el('div', 'sh-col');
    col.append(el('h2', '', T.settings), el('p', 'note', T.soundInfo));
    const ask = btn(T.reset, () => {
      const sure = btn(T.resetSure, async () => {
        await deleteRecord(RECORD_KEY);
        rec = null;
        menu();
      });
      ask.replaceWith(el('p', 'note', T.resetAsk), sure);
    });
    col.append(ask, back());
    screen(col);
  }

  function credits(): void {
    mode = 'other';
    const col = el('div', 'sh-col');
    col.append(el('h2', '', S.credits), el('p', 'note', S.creditsBody), back());
    screen(col);
  }

  menu();
  return new Promise<never>(() => {});
}
