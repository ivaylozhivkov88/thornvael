import { blip } from './audio';
import { actOf, nodeOf, type CampaignNode } from './campaign';
import { loadCampaign, readRecord, writeRecord } from './campaignstore';
import { canEnter, newRecord, nodeUrl, RECORD_KEY, clearLast, type CampaignRecord, type HeroPick } from './flow';
import { BUILT_IN } from './mission';
import { downloadChapter, loadManifest, removeChapter, verifyChapter, type ChapterCheck, type Env, type Manifest } from './offline';
import { encodeSave } from './save';
import { applyUpdate, onUpdateWaiting, updateWaiting } from './updategate';
import { AUTO, deleteRecord, deleteSave, exportAllSaves, getSave, importSaveText, listSaves } from './savedb';
import { advanceStory, openStory, replayStory, sequenceById, sequenceForNode, skipStory, STORY_SEQUENCES, type StorySequence } from './story';
import { S } from './strings';
import { readPreferences, writePreference } from './preferences';
import { CodexUi } from './codexui';

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
  const codexUi = new CodexUi();
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
      btn('🏆 Holy Grail Codex', () => codexUi.show()),
      btn('Skirmish (11 Maps)', skirmish),
      btn(T.free, () => go('./?free=1'), 'sh-quiet'),
    );
    screen(col);
  }

  function skirmish(): void {
    mode = 'other';
    const pick: HeroPick = { cls: 0, female: false };
    let diff = 1;
    const opts = el('div', 'sh-skirmish-opts');
    const row = (names: readonly string[], get: () => number, set: (i: number) => void): HTMLElement => {
      const r = el('div', 'sh-row');
      const draw = (): void => r.replaceChildren(...names.map((n, i) => btn(n, () => (set(i), draw()), i === get() ? 'sh-on sh-small' : 'sh-small')));
      draw();
      return r;
    };
    opts.append(
      row(T.cls, () => pick.cls, (i) => (pick.cls = i)),
      row(T.sex, () => (pick.female ? 1 : 0), (i) => (pick.female = i === 1)),
      row(T.diff, () => diff, (i) => (diff = i)),
    );
    const col = el('div', 'sh-col');
    col.append(el('h2', '', 'Skirmish Maps'), opts);
    col.append(
      btn(
        '🎲 Procedural Expedition (Endless Mode)',
        () => {
          const seed = (Math.random() * 0x7fffffff) | 0;
          go(`./?expedition=${seed}&hero=${pick.cls === 1 ? 'mage' : 'warrior'},${pick.female ? 'f' : 'm'},${(['easy', 'medium', 'hard'] as const)[diff]}`);
        },
        'sh-wide sh-on',
      ),
    );
    const maps: readonly [string, string][] = [
      ['glade', 'S01 · Bracken Glade'],
      ['scarlet', 'S02 · Scarlet Ridge'],
      ['tidebreak', 'S03 · Tidebreak Cove'],
      ['blackwater', 'S04 · Blackwater Reach'],
      ['crossroads', 'S05 · Crossroads of Ash'],
      ['shattered', 'S06 · Shattered Shore'],
      ['twinfuries', 'S07 · Twin Furies'],
      ['inward', 'S08 · Inward March'],
      ['muddlefen', 'S09 · Muddlefen'],
      ['shallowford', 'S10 · Shallow Ford'],
      ['ashentier', 'S11 · Ashen Tier'],
    ];
    for (const [key, label] of maps) {
      col.append(
        btn(
          label,
          () => go(`./?mission=${encodeURIComponent(key)}&hero=${pick.cls === 1 ? 'mage' : 'warrior'},${pick.female ? 'f' : 'm'},${(['easy', 'medium', 'hard'] as const)[diff]}`),
          'sh-wide',
        ),
      );
    }
    col.append(back());
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
        currentAct = activeAct(rec);
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
  const activeAct = (r: CampaignRecord | null): 1 | 2 | 3 | 4 => {
    if (!r) return 1;
    let best = actOf(nodeOf(c, r.progress.node));
    if (!r.last && r.progress.completed.includes(r.progress.node)) {
      for (const u of r.progress.unlocked) {
        const a = actOf(nodeOf(c, u));
        if (a > best) best = a;
      }
    }
    return best;
  };
  let currentAct: 1 | 2 | 3 | 4 = activeAct(rec);
  function map(): void {
    if (!rec) return menu();
    mode = 'map';
    const r = rec;
    const acts = [...new Set(c.nodes.map((n) => actOf(n)))].sort((a, b) => a - b) as (1 | 2 | 3 | 4)[];
    if (!acts.includes(currentAct)) currentAct = acts[0] ?? 1;
    const visibleNodes = c.nodes.filter((n) => actOf(n) === currentAct);
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const stage = el('div', 'sh-map');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    for (const n of visibleNodes) {
      for (const u of n.unlocksOnVictory) {
        const m = nodeOf(c, u);
        if (!visibleIds.has(u)) {
          if (actOf(m) > currentAct) {
            const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            l.setAttribute('x1', String(n.pos[0]));
            l.setAttribute('y1', String(n.pos[1]));
            l.setAttribute('x2', '98');
            l.setAttribute('y2', String(n.pos[1]));
            l.setAttribute('class', r.progress.unlocked.includes(u) ? 'on' : '');
            svg.append(l);
          }
          continue;
        }
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
    for (const n of visibleNodes) {
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
    const actTabs = el('div', 'sh-row');
    if (acts.length > 1) {
      for (const a of acts) {
        const hasUnlocked = c.nodes.some((n) => actOf(n) === a && r.progress.unlocked.includes(n.id));
        actTabs.append(btn(`Act ${a}${hasUnlocked ? '' : ' 🔒'}`, () => ((currentAct = a), map()), a === currentAct ? 'sh-on sh-small' : 'sh-small'));
      }
    }
    const seqId = (`act-${currentAct}`) as StorySequence['id'];
    actTabs.append(btn('Story', () => showStory(seqId), 'sh-small'));
    bar.append(el('b', '', `${T.mapTitle} · ${T.diff[r.progress.difficulty]}`), actTabs, btn('🏆 Codex', () => codexUi.show(), 'sh-small'), ...banner(), btn(T.back, menu, 'sh-small'));
    screen(bar, stage);
    if (r.last) result(r.last);
  }

  function storyBanner(seqId: StorySequence['id'], backdrop: string): HTMLElement {
    const themeMap: Record<StorySequence['id'], { key: string; c1: string; c2: string; path: string }> = {
      'act-1': { key: 'ford-dawn', c1: '#384b32', c2: '#1a2718', path: 'M10 42 Q40 34 80 42 T150 42 M68 14 L92 38 M92 14 L68 38 M80 10 L80 44' },
      'act-2': { key: 'marsh-lanterns', c1: '#553f2f', c2: '#231811', path: 'M20 46 L140 46 M50 46 L50 20 M80 46 L80 14 M110 46 L110 20 M74 14 L86 14 L84 26 L76 26 Z' },
      'act-3': { key: 'sunken-citadel', c1: '#2d4154', c2: '#121d28', path: 'M42 46 L42 18 L58 18 L58 46 M102 46 L102 18 L118 18 L118 46 M58 30 L102 30 M80 12 L88 22 L80 32 L72 22 Z' },
      'act-4': { key: 'heartland-ash', c1: '#4a2b31', c2: '#1f1115', path: 'M24 46 L56 16 L80 38 L104 16 L136 46 M80 12 L86 24 L74 24 Z' },
      'ending-a': { key: 'crown-of-order', c1: '#2e4152', c2: '#142029', path: 'M52 38 L60 18 L80 30 L100 18 L108 38 Z M46 42 L114 42' },
      'ending-b': { key: 'ember-reckoning', c1: '#522c24', c2: '#24110d', path: 'M80 10 L96 28 L86 28 L94 46 L66 26 L76 26 Z M40 44 L120 44' },
    };
    const t = themeMap[seqId];
    const baseColor = backdrop.startsWith('#') ? backdrop : t.c1;
    const art = el('div', 'sh-story-art');
    art.dataset.backdrop = t.key;
    art.style.background = `radial-gradient(circle at 50% 35%, #e4bf8033, ${baseColor} 68%), linear-gradient(135deg, ${baseColor}, ${t.c2})`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 160 54');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', t.path);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', '#e4bf80');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
    art.append(svg);
    return art;
  }

  function showStory(id: StorySequence['id'], onFinish?: () => void): void {
    blip();
    let player = openStory(id);
    const m = el('div', 'sh-modal');
    const box = el('div', 'sh-box');
    const draw = (): void => {
      box.replaceChildren();
      const slide = player.sequence.slides[player.index];
      box.style.borderColor = '#d6a45b';
      const title = el('h2', '', player.sequence.title);
      const art = storyBanner(player.sequence.id, slide.backdrop);
      const heading = el('h3', '', slide.heading);
      const caption = el('p', '', slide.caption);
      const note = el('p', 'note', `Slide ${player.index + 1}/${player.sequence.slides.length} · Cue: ${slide.cue}`);
      const controls = el('div', 'sh-row');
      controls.append(
        btn(player.index + 1 < player.sequence.slides.length ? 'Next' : 'Finish', () => {
          blip();
          player = advanceStory(player);
          if (player.finished) {
            m.remove();
            onFinish?.();
          } else draw();
        }),
        btn('Replay', () => {
          blip();
          player = replayStory(player);
          draw();
        }, 'sh-small'),
        btn('Skip', () => {
          blip();
          player = skipStory(player);
          m.remove();
          onFinish?.();
        }, 'sh-small'),
      );
      box.append(title, art, heading, caption, note, controls);
    };
    draw();
    m.append(box);
    root.append(m);
  }

  // ---- briefing modal ----
  function briefing(n: CampaignNode): void {
    const m = el('div', 'sh-modal');
    const box = el('div', 'sh-box');
    const enter = (): void => {
      const seq = sequenceForNode(n.id);
      if (seq && seq.kind === 'intro') {
        m.remove();
        showStory(seq.id, () => go(nodeUrl(n)));
      } else {
        go(nodeUrl(n));
      }
    };
    box.append(el('h2', '', n.title), el('p', '', n.briefing), btn(n.kind === 'town' ? T.enterTown : T.enter, enter), btn(T.back, () => m.remove(), 'sh-small'));
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
          currentAct = activeAct(rec);
        }
        m.remove();
        map();
        const ending = last.win ? sequenceForNode(n.id) : null;
        if (ending && ending.kind === 'ending') showStory(ending.id);
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
    const status = el('p', 'note');
    col.append(btn(S.save.importFile, () => {
      const input = el('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          await importSaveText(await file.text());
          rec = await readRecord();
          await slots();
        } catch (e) {
          status.textContent = `${S.save.loadFailed} ${(e as Error).message}`;
        }
      };
      input.click();
    }), status);
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
    const text = await exportAllSaves();
    if (text === null) return false;
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
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
    const rm = btn(
      T.removeCh,
      async () => {
        if (!man) return;
        await removeChapter(env, man);
        show(await verifyChapter(env, man));
      },
      'sh-small',
    );
    rm.disabled = true;
    const exp = btn(T.exportAll, async () => {
      try {
        if (!(await exportAll())) status.textContent = T.noneToExport;
      } catch (e) {
        status.textContent = (e as Error).message;
      }
    });
    col.append(el('h2', '', T.storage), info, el('h3', '', T.chapter1), status, bar, dl, rm, exp, back());
    screen(col);
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    const keep = await navigator.storage?.persisted?.().catch(() => false);
    const count = (await listSaves().catch(() => [])).length + (rec ? 1 : 0);
    info.textContent = `${T.used}: ${est ? Math.round((est.usage ?? 0) / 1048576) : '?'} MB / ${est ? Math.round((est.quota ?? 0) / 1048576) : '?'} MB\n${T.records}: ${count}\n${T.persisted}: ${keep ? 'yes' : 'no'}`;
    try {
      man = await loadManifest(env);
      show(await verifyChapter(env, man));
      dl.disabled = false;
      rm.disabled = false;
    } catch {
      status.textContent = T.dlFailed;
    }
  }

  function settings(): void {
    mode = 'other';
    const col = el('div', 'sh-col');
    col.append(el('h2', '', T.settings), el('p', 'note', T.soundInfo));
    const prefs = readPreferences();
    const notice = el('p', 'note');
    for (const key of ['sound', 'music'] as const) {
      const control = btn('', () => {
        prefs[key] = !prefs[key];
        if (!writePreference(key, prefs[key])) notice.textContent = T.preferenceStorage;
        refresh();
      });
      const refresh = (): void => {
        control.textContent = `${T.preferenceLabels[key]}: ${prefs[key] ? T.preferenceOn : T.preferenceOff}`;
        control.setAttribute('aria-pressed', String(prefs[key]));
      };
      refresh();
      col.append(control);
    }
    const quality = btn('', () => {
      prefs.quality = (prefs.quality + 1) % 3;
      if (!writePreference('quality', prefs.quality)) notice.textContent = T.preferenceStorage;
      quality.textContent = `${S.quality}: ${T.preferenceQuality[prefs.quality]}`;
    });
    quality.textContent = `${S.quality}: ${T.preferenceQuality[prefs.quality]}`;
    col.append(quality, notice);
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
    col.append(el('h2', '', S.credits), el('p', 'note', S.creditsBody), el('h3', '', 'Story Replay'));
    const row = el('div', 'sh-row sh-credits-replay');
    row.style.cssText = 'flex-wrap: wrap; justify-content: center; max-width: 580px; gap: 8px;';
    for (const seq of STORY_SEQUENCES) {
      row.append(btn(sequenceById(seq.id).title, () => showStory(seq.id), 'sh-small'));
    }
    col.append(row, back());
    screen(col);
  }

  menu();
  return new Promise<never>(() => {});
}
