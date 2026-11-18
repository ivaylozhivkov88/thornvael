import { blip, setMusic, unlock } from './audio';
import { actOf, nodeOf, type CampaignNode } from './campaign';
import { loadCampaign, readRecord, writeRecord } from './campaignstore';
import { canEnter, newRecord, nodeUrl, RECORD_KEY, clearLast, type CampaignRecord, type HeroPick } from './flow';
import { ARCHETYPES, buildHeroCreationScreen, findArchetypeIndex, type Archetype, type HeroCreationOptions } from './herocreation';
import { BUILT_IN } from './mission';
import { addCharacter, characterCarry, CLASS_NAMES, deleteCharacter, getActiveId, listCharacters, MAX_CHARACTERS, NAME_MAX, newCharacter, setActiveId, cleanName, type Character } from './characters';
import { downloadChapter, loadManifest, removeChapter, verifyChapter, type ChapterCheck, type Env, type Manifest } from './offline';
import { encodeSave } from './save';
import { applyUpdate, onUpdateWaiting, updateWaiting } from './updategate';
import { AUTO, deleteRecord, deleteSave, exportAllSaves, getSave, importSaveText, listSaves } from './savedb';
import { actTransitionForCompletedNode, advanceStory, openStory, previousStory, replayStory, sequenceById, sequenceForNode, skipStory, STORY_SEQUENCES, type StorySequence } from './story';
import { S } from './strings';
import { readPreferences, writePreference } from './preferences';
import { CodexUi } from './codexui';
import { loadMonsterCodex } from './missioncontent';
import { BUILDINGS, build, levelOf, nextCost } from './townbuild';

export { ARCHETYPES, buildHeroCreationScreen, findArchetypeIndex, type Archetype, type HeroCreationOptions };

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
  void loadMonsterCodex();
  startWorker();
  const codexUi = new CodexUi();
  const prefs = readPreferences();
  const startShellMusic = (): void => {
    if (prefs.music) {
      unlock();
      setMusic(true, 'town');
    }
  };
  document.addEventListener('pointerdown', startShellMusic, { once: true });
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
  let chars = await listCharacters();
  let active: Character | null = chars.find((x) => x.id === getActiveId()) ?? null;
  // Every game page learns which hero plays it, so the hero keeps what it earns (see characters.ts).
  const go = (url: string): void => location.assign(active && url.startsWith('./?') && !url.includes('free=') && !url.includes('load=') ? `${url}&char=${encodeURIComponent(active.id)}` : url);
  const screen = (...kids: HTMLElement[]): void => root.replaceChildren(...kids);
  const back = (): HTMLButtonElement => btn(T.back, menu, 'sh-small');
  const clsName = (x: Character): string => `${x.female ? 'Female ' : 'Male '}${CLASS_NAMES[x.cls] ?? 'Hero'}`;
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
      el('p', 'sh-sub', active ? `Hero: ${active.name} · Level ${active.level} ${clsName(active)}` : ''),
      btn('Change Hero', charSelect, 'sh-small'),
      btn(T.newGame, create),
      cont,
      btn(T.saves, slots),
      btn(T.storage, storage),
      btn(T.settings, settings),
      btn(T.credits, credits),
      btn('🏆 Hall of Relics Codex', () => codexUi.show()),
      btn('Skirmish (23 Maps)', skirmish),
      btn(T.free, () => go('./?free=1'), 'sh-quiet'),
    );
    screen(col);
  }

  function skirmish(): void {
    mode = 'other';
    const pick: HeroPick = active ? { cls: active.cls, female: active.female } : { cls: 0, female: false };
    let diff = active ? active.diff : 1;
    let gold = 100;
    let selectedMapIdx = 0;

    const maps: readonly { key: string; name: string; tag: string }[] = [
      { key: 'glade', name: 'S01 · Bracken Glade', tag: 'Meadow' },
      { key: 'scarlet', name: 'S02 · Scarlet Ridge', tag: 'Highlands' },
      { key: 'tidebreak', name: 'S03 · Tidebreak Cove', tag: 'Coast' },
      { key: 'blackwater', name: 'S04 · Blackwater Reach', tag: 'Swamp' },
      { key: 'crossroads', name: 'S05 · Crossroads of Ash', tag: 'Volcanic' },
      { key: 'shattered', name: 'S06 · Shattered Shore', tag: 'Ruins' },
      { key: 'twinfuries', name: 'S07 · Twin Furies', tag: 'Chokepoint' },
      { key: 'inward', name: 'S08 · Inward March', tag: 'Frontier' },
      { key: 'muddlefen', name: 'S09 · Muddlefen', tag: 'Mire' },
      { key: 'shallowford', name: 'S10 · Shallow Ford', tag: 'River' },
      { key: 'ashentier', name: 'S11 · Ashen Tier', tag: 'Citadel' },
      { key: 'skirmish-twin-fords', name: 'S12 · Twin Fords of Alder', tag: 'Greywood 1v1' },
      { key: 'skirmish-ash-hourglass', name: 'S13 · The Cinder Hourglass', tag: 'Crownember 1v1' },
      { key: 'skirmish-sunken-causeway', name: 'S14 · Sunken Causeway', tag: 'Ironcoast 1v1' },
      { key: 'skirmish-fen-attrition', name: 'S15 · Blackmire Basin', tag: 'Redmarsh 1v1' },
      { key: 'skirmish-quarry-passes', name: 'S16 · Split-Stone Passes', tag: 'Redmarsh 1v1' },
      { key: 'skirmish-lantern-labyrinth', name: 'S17 · Lantern Hedge Maze', tag: 'Greywood 1v1' },
      { key: 'skirmish-night-bastion', name: 'S18 · Vigil of Ironcamp', tag: 'Crownember 1v1' },
      { key: 'skirmish-four-corners', name: 'S19 · Four-Corner Keep', tag: 'Greywood 4P' },
      { key: 'skirmish-wardstone-ring', name: 'S20 · Wardstone Atoll', tag: 'Redmarsh 4P' },
      { key: 'skirmish-riverlock-cross', name: 'S21 · Riverlock Crossroads', tag: 'Ironcoast 4P' },
      { key: 'skirmish-citadel-crown', name: 'S22 · Throne of Cinders', tag: 'Crownember 4P' },
      { key: 'skirmish-grand-estuary', name: 'S23 · Grand Iron Estuary', tag: 'Ironcoast 4P' },
    ];

    const goldAmounts = [100, 300, 600, 1200] as const;
    const goldLabels = ['100g Standard', '300g Adventurer', '600g Mercenary', '1200g Sovereign'] as const;

    const modal = el('div', 'sh-skirmish-modal');

    const header = el('div', 'sh-skirmish-header');
    header.innerHTML = `
      <div>
        <h2>⚔️ SKIRMISH PREPARATION & DEPLOYMENT</h2>
        <span class="sh-skirmish-sub">Select Hero Class, Battle Difficulty, Starting Gold Purse, and Mission Arena</span>
      </div>
    `;

    const body = el('div', 'sh-skirmish-body');

    // Left config column
    const configCol = el('div', 'sh-skirmish-config');

    const renderConfig = (): void => {
      configCol.replaceChildren();

      if (active) {
        configCol.append(el('div', 'sh-skirmish-section-title', 'YOUR HERO'), el('p', 'sh-sub', `${active.name} · Level ${active.level} ${clsName(active)}
Items, skills and levels carry over.`));
      }
      // Class section
      if (!active) configCol.append(el('div', 'sh-skirmish-section-title', 'HERO ARCHETYPE'));
      const clsRow = el('div', 'sh-row');
      if (!active) clsRow.append(
        btn('⚔️ Warrior', () => { pick.cls = 0; renderConfig(); }, pick.cls === 0 ? 'sh-on sh-small' : 'sh-small'),
        btn('🔮 Mage', () => { pick.cls = 1; renderConfig(); }, pick.cls === 1 ? 'sh-on sh-small' : 'sh-small'),
      );
      if (!active) configCol.append(clsRow);

      // Gender section
      if (!active) configCol.append(el('div', 'sh-skirmish-section-title', 'GENDER'));
      const sexRow = el('div', 'sh-row');
      if (!active) sexRow.append(
        btn('♂ Male', () => { pick.female = false; renderConfig(); }, !pick.female ? 'sh-on sh-small' : 'sh-small'),
        btn('♀ Female', () => { pick.female = true; renderConfig(); }, pick.female ? 'sh-on sh-small' : 'sh-small'),
      );
      if (!active) configCol.append(sexRow);

      // Difficulty section
      configCol.append(el('div', 'sh-skirmish-section-title', 'DIFFICULTY'));
      const diffRow = el('div', 'sh-row');
      const diffNames = ['🍃 Easy', '⚖️ Veteran', '💀 Nightmare'];
      diffRow.append(
        ...diffNames.map((dName, dIdx) =>
          btn(dName, () => { diff = dIdx; renderConfig(); }, diff === dIdx ? 'sh-on sh-small' : 'sh-small')
        )
      );
      configCol.append(diffRow);

      // Starting gold section
      configCol.append(el('div', 'sh-skirmish-section-title', 'STARTING GOLD PURSE'));
      const goldRow = el('div', 'sh-row');
      goldRow.append(
        ...goldAmounts.map((gAmt, gIdx) =>
          btn(goldLabels[gIdx], () => { gold = gAmt; renderConfig(); }, gold === gAmt ? 'sh-on sh-small' : 'sh-small')
        )
      );
      configCol.append(goldRow);
    };
    renderConfig();

    // Right maps column
    const mapsCol = el('div', 'sh-skirmish-maps');
    mapsCol.append(el('div', 'sh-skirmish-section-title', 'CHOOSE BATTLE ARENA'));

    const mapGrid = el('div', 'sh-map-grid');
    const renderMaps = (): void => {
      mapGrid.replaceChildren();
      maps.forEach((m, idx) => {
        const item = el('div', `sh-map-item ${idx === selectedMapIdx ? 'selected' : ''}`);
        item.innerHTML = `<span>${m.name}</span><span class="sh-node-tag">${m.tag}</span>`;
        item.onclick = () => {
          selectedMapIdx = idx;
          renderMaps();
        };
        mapGrid.append(item);
      });
    };
    renderMaps();
    mapsCol.append(mapGrid);

    body.append(configCol, mapsCol);

    // Footer
    const footer = el('div', 'sh-skirmish-footer');
    const startUrl = (): string => {
      const heroStr = `${pick.cls === 1 ? 'mage' : 'warrior'},${pick.female ? 'f' : 'm'},${(['easy', 'medium', 'hard'] as const)[diff]}`;
      const mKey = maps[selectedMapIdx].key;
      return `./?mission=${encodeURIComponent(mKey)}&hero=${encodeURIComponent(heroStr)}&gold=${gold}`;
    };

    const expeditionUrl = (): string => {
      const seed = (Math.random() * 0x7fffffff) | 0;
      const heroStr = `${pick.cls === 1 ? 'mage' : 'warrior'},${pick.female ? 'f' : 'm'},${(['easy', 'medium', 'hard'] as const)[diff]}`;
      return `./?expedition=${seed}&hero=${encodeURIComponent(heroStr)}&gold=${gold}`;
    };

    const depthsUrl = (): string => {
      const seed = (Math.random() * 0x7fffffff) | 0;
      const heroStr = `${pick.cls === 1 ? 'mage' : 'warrior'},${pick.female ? 'f' : 'm'},${(['easy', 'medium', 'hard'] as const)[diff]}`;
      return `./?depths=${seed}&hero=${encodeURIComponent(heroStr)}&gold=${gold}`;
    };

    footer.append(
      btn(
        '⚔️ Deploy Hero to Battle',
        () => go(startUrl()),
        'sh-on sh-wide',
      ),
      btn(
        '🎲 Procedural Endless Expedition',
        () => go(expeditionUrl()),
        'sh-small',
      ),
      btn('Endless Depths', () => go(depthsUrl()), 'sh-small'),
      btn('↩ Return to Menu', menu),
    );

    modal.append(header, body, footer);
    screen(modal);
  }

  // ---- hero creation: class, sex, difficulty (Gothic Pillar & Campfire Champion Showcase) ----
  async function startCampaign(pick: HeroPick, diff: number): Promise<void> {
    rec = newRecord(c, pick, diff);
    // A hero that has played before brings its level, gear and spells into the story.
    if (active?.hero) rec.carry = characterCarry(active, { progress: rec.progress, shopSeed: 1 });
    currentAct = activeAct(rec);
    await writeRecord(rec);
    await deleteSave(AUTO).catch(() => undefined);
    auto = null;
    const startNode = nodeOf(c, c.start);
    const diffStr = (['easy', 'medium', 'hard'] as const)[diff];
    const heroStr = `${pick.cls === 1 ? 'mage' : 'warrior'},${pick.female ? 'f' : 'm'},${diffStr}`;
    const url = `${nodeUrl(startNode)}&hero=${encodeURIComponent(heroStr)}`;
    const seq = sequenceForNode(startNode.id);
    if (seq && seq.kind === 'intro') {
      showStory(seq.id, () => go(url));
    } else {
      go(url);
    }
  }

  function create(): void {
    mode = 'other';
    if (active) {
      void startCampaign({ cls: active.cls, female: active.female }, active.diff);
      return;
    }
    charSelect();
  }

  // ---- start screen and hero select: the hero outlives any one game ----
  function title(): void {
    mode = 'other';
    const col = el('div', 'sh-col');
    col.append(
      el('h1', '', S.title),
      ...banner(),
      btn('Single Player', charSelect),
      btn(T.credits, credits, 'sh-small'),
      btn('Storage & Offline', storage, 'sh-small'),
      btn('Settings', settings, 'sh-small'),
    );
    screen(col);
  }

  function charSelect(): void {
    mode = 'other';
    let sel: Character | null = active ?? chars[0] ?? null;
    const col = el('div', 'sh-col');
    const list = el('div', 'sh-col');
    const info = el('p', 'sh-sub');
    const ok = btn('OK', () => {
      if (!sel) return;
      active = sel;
      setActiveId(sel.id);
      menu();
    });
    const del = btn('Delete Hero', () => {
      if (!sel) return;
      const victim = sel;
      if (!window.confirm(`Delete ${victim.name} forever? Level, items and skills are lost.`)) return;
      void deleteCharacter(victim.id).then(async () => {
        chars = await listCharacters();
        if (active?.id === victim.id) active = null;
        sel = chars[0] ?? null;
        charSelect();
      });
    }, 'sh-small');
    const refresh = (): void => {
      list.replaceChildren();
      for (const x of chars) {
        const row = btn(`${x.name}
Level ${x.level} ${clsName(x)}`, () => { sel = x; refresh(); }, sel?.id === x.id ? 'sh-on' : '');
        row.ondblclick = () => ok.click();
        list.append(row);
      }
      if (chars.length === 0) list.append(el('p', 'sh-sub', 'No heroes yet. Create one.'));
      ok.disabled = !sel;
      del.disabled = !sel;
      info.textContent = sel ? `${sel.name} — ${sel.played} game${sel.played === 1 ? '' : 's'} finished${sel.hero ? '' : ' · not yet played'}` : '';
    };
    refresh();
    const create1 = btn('Create New Hero', createChar);
    create1.disabled = chars.length >= MAX_CHARACTERS;
    col.append(el('h1', '', 'Select Hero'), list, info, create1, del, ok, btn('Exit', title, 'sh-small'));
    screen(col);
  }

  function createChar(): void {
    mode = 'other';
    const col = el('div', 'sh-col');
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = NAME_MAX;
    input.placeholder = 'Hero name';
    input.className = 'sh-input';
    col.append(
      el('h1', '', 'New Hero'),
      el('p', 'sh-sub', 'Name your hero.'),
      input,
      btn('Next', () => {
        const name = cleanName(input.value);
        screen(
          buildHeroCreationScreen({
            base: import.meta.env.BASE_URL,
            onStart: async (arch, diff) => {
              const ch = newCharacter(name, arch.cls, arch.female, diff);
              await addCharacter(ch);
              chars = await listCharacters();
              active = ch;
              setActiveId(ch.id);
              menu();
            },
            onBack: charSelect,
          }),
        );
      }),
      btn(T.back, charSelect, 'sh-small'),
    );
    screen(col);
    input.focus();
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
    const stage = el('div', 'sh-map homm-kingdom-map');
    // HoMM 3 Antique Parchment Corners & Compass Rose
    stage.append(
      el('div', 'homm-corner homm-corner-tl'),
      el('div', 'homm-corner homm-corner-tr'),
      el('div', 'homm-corner homm-corner-bl'),
      el('div', 'homm-corner homm-corner-br'),
      el('div', 'homm-compass-rose', '🧭')
    );

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'homm-roads-svg');

    for (const n of visibleNodes) {
      for (const u of n.unlocksOnVictory) {
        const m = nodeOf(c, u);
        const isUnlocked = r.progress.unlocked.includes(u);
        if (!visibleIds.has(u)) {
          if (actOf(m) > currentAct) {
            const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const mx = (n.pos[0] + 98) / 2;
            const my = (n.pos[1] + n.pos[1]) / 2 + 1.5;
            p.setAttribute('d', `M ${n.pos[0]} ${n.pos[1]} Q ${mx} ${my} 98 ${n.pos[1]}`);
            p.setAttribute('class', `homm-road ${isUnlocked ? 'unlocked' : 'locked'}`);
            svg.append(p);
          }
          continue;
        }
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const mx = (n.pos[0] + m.pos[0]) / 2;
        const my = (n.pos[1] + m.pos[1]) / 2 + (n.pos[0] % 2 === 0 ? 2 : -2);
        p.setAttribute('d', `M ${n.pos[0]} ${n.pos[1]} Q ${mx} ${my} ${m.pos[0]} ${m.pos[1]}`);
        p.setAttribute('class', `homm-road ${isUnlocked ? 'unlocked' : 'locked'}`);
        svg.append(p);
      }
    }
    stage.append(svg);

    for (const n of visibleNodes) {
      const open = canEnter(r, n.id, MAPS, c);
      const done = r.progress.completed.includes(n.id);
      const isHere = n.id === r.progress.node;
      const isTown = n.kind === 'town';
      const hasWp = (r.progress.waypoints?.includes(n.id) ?? false) || isTown;
      const isBoss = n.id.includes('sanctum') || n.id.includes('ossuary') || n.id.includes('gullet') || n.id.includes('choir') || n.id.includes('throne') || n.id.includes('reckoning') || n.id.includes('order');

      const b = el('button', `sh-node homm-node ${isTown ? 'homm-town' : isBoss ? 'homm-boss' : 'homm-mission'}${done ? ' done' : ''}${isHere ? ' here' : ''}`);
      b.style.left = `${n.pos[0]}%`;
      b.style.top = `${n.pos[1]}%`;
      b.disabled = !open;
      b.onclick = () => briefing(n);

      const iconWrap = el('div', 'homm-node-icon-wrap');
      const icon = el('span', 'homm-node-icon', isTown ? '🏰' : isBoss ? '💀' : '⚔');
      iconWrap.append(icon);

      if (hasWp) {
        const wpGem = el('span', 'homm-wp-gem', '🗿');
        wpGem.setAttribute('aria-label', 'Active Waypoint');
        iconWrap.append(wpGem);
      }

      if (isHere) {
        const pawn = el('div', 'homm-hero-pawn');
        pawn.innerHTML = '<span class="pawn-banner">♞</span>';
        iconWrap.append(pawn);
      }

      const plate = el('div', 'homm-node-plate');
      const nameSpan = el('span', 'homm-node-name', n.title);
      plate.append(nameSpan);

      if (!open) {
        const lockTag = el('small', 'homm-node-tag locked', T.locked);
        plate.append(lockTag);
      } else if (done) {
        const doneTag = el('small', 'homm-node-tag done', T.done);
        plate.append(doneTag);
      } else if (isTown) {
        const townTag = el('small', 'homm-node-tag town', 'TOWN HUB');
        plate.append(townTag);
      }

      b.append(iconWrap, plate);
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
    bar.append(el('b', '', `${T.mapTitle} · ${T.diff[r.progress.difficulty]}`), actTabs, btn('🏆 Codex', () => codexUi.show(), 'sh-small'), btn(T.holdings, holdings, 'sh-small'), ...banner(), btn(T.back, menu, 'sh-small'));
    screen(bar, stage);
    if (r.last) result(r.last);
  }

  function storyBanner(seqId: StorySequence['id'], backdrop: string): HTMLElement {
    const themeMap: Record<StorySequence['id'], { key: string; c1: string; c2: string; path: string }> = {
      'act-1': {
        key: 'ford-dawn',
        c1: '#384b32',
        c2: '#1a2718',
        path: 'M10 44 Q40 38 80 44 T150 44 M50 44 L50 24 M70 44 L70 20 M90 44 L90 20 M110 44 L110 24 M44 26 L116 26 M76 12 L84 12 L80 32 Z',
      },
      'act-2': {
        key: 'parched-marshes',
        c1: '#553f2f',
        c2: '#231811',
        path: 'M10 48 Q35 44 60 46 T120 45 T160 48 M40 46 L55 36 L70 46 M80 46 L95 38 L110 46 M20 38 Q50 24 85 36 T150 32 M80 8 A6 6 0 1 0 80 20 A6 6 0 1 0 80 8 M80 4 L80 7 M80 21 L80 24 M68 14 L71 14 M89 14 L92 14',
      },
      'act-3': {
        key: 'sunless-caverns',
        c1: '#2d4154',
        c2: '#121d28',
        path: 'M30 48 L30 22 Q80 6 130 22 L130 48 M45 48 L45 28 Q80 14 115 28 L115 48 M20 0 L24 16 L28 0 M60 0 L64 20 L68 0 M92 0 L96 22 L100 0 M132 0 L136 15 L140 0 M80 22 L86 32 L80 42 L74 32 Z',
      },
      'act-4': {
        key: 'infernal-sanctuary',
        c1: '#4a2b31',
        c2: '#1f1115',
        path: 'M24 48 L24 18 L36 10 L48 18 L48 48 M112 48 L112 18 L124 10 L136 18 L136 48 M48 30 L112 30 M56 48 L56 22 Q80 12 104 22 L104 48 M80 14 L88 26 L80 38 L72 26 Z M80 10 L84 18 L76 18 Z',
      },
      'ending-a': {
        key: 'cleansing-thornvael',
        c1: '#2e4152',
        c2: '#142029',
        path: 'M50 36 Q60 18 80 28 Q100 18 110 36 M44 42 Q80 34 116 42 M80 10 L84 20 L94 22 L86 30 L88 40 L80 34 L72 40 L74 30 L66 22 L76 20 Z',
      },
      'ending-b': {
        key: 'dark-sovereign',
        c1: '#522c24',
        c2: '#24110d',
        path: 'M50 44 L60 16 L72 28 L80 12 L88 28 L100 16 L110 44 Z M42 46 L118 46 M80 26 L86 36 L80 42 L74 36 Z',
      },
    };
    const t = themeMap[seqId];
    const baseColor = backdrop.startsWith('#') ? backdrop : t.c1;
    const art = el('div', 'sh-story-art sh-slideshow-art');
    art.dataset.backdrop = t.key;
    art.style.background = `radial-gradient(circle at 50% 35%, #ffd8702b, ${baseColor} 70%), linear-gradient(135deg, ${baseColor}, ${t.c2})`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 160 54');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', t.path);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', '#ffd870');
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
    const overlay = el('div', 'sh-slideshow-overlay');
    const frame = el('div', 'sh-slideshow-frame');
    const content = el('div', 'sh-slideshow-content');
    let isTransitioning = false;

    const close = (): void => {
      window.removeEventListener('keydown', handleKey);
      overlay.remove();
      onFinish?.();
    };

    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        blip();
        player = skipStory(player);
        close();
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        stepNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        stepPrev();
      }
    };
    window.addEventListener('keydown', handleKey);

    const stepNext = (): void => {
      if (isTransitioning) return;
      blip();
      if (player.index + 1 < player.sequence.slides.length) {
        animateTransition(() => {
          player = advanceStory(player);
          draw();
        });
      } else {
        player = advanceStory(player);
        close();
      }
    };

    const stepPrev = (): void => {
      if (isTransitioning || player.index === 0) return;
      blip();
      animateTransition(() => {
        player = previousStory(player);
        draw();
      });
    };

    const animateTransition = (fn: () => void): void => {
      isTransitioning = true;
      content.classList.add('fading');
      setTimeout(() => {
        fn();
        content.classList.remove('fading');
        setTimeout(() => {
          isTransitioning = false;
        }, 120);
      }, 120);
    };

    const draw = (): void => {
      frame.replaceChildren();
      const slide = player.sequence.slides[player.index];

      // Header
      const header = el('div', 'sh-slideshow-header');
      const title = el('h2', 'sh-slideshow-title', player.sequence.title);
      header.append(title);
      if (player.sequence.subtitle) {
        header.append(el('div', 'sh-slideshow-subtitle', player.sequence.subtitle));
      }

      // Center Content (fade target)
      content.replaceChildren();
      const art = storyBanner(player.sequence.id, slide.backdrop);

      const textWrap = el('div', 'sh-slideshow-text');
      const heading = el('h3', 'sh-slideshow-heading', slide.heading);
      const caption = el('p', 'sh-slideshow-caption', slide.caption);
      if (slide.reflection) {
        const refl = el('blockquote', 'sh-slideshow-reflection', slide.reflection);
        textWrap.append(heading, caption, refl);
      } else {
        textWrap.append(heading, caption);
      }

      const pips = el('div', 'sh-slideshow-pips');
      for (let i = 0; i < player.sequence.slides.length; i++) {
        pips.append(el('span', `sh-slideshow-pip${i === player.index ? ' active' : ''}`));
      }

      textWrap.append(pips);
      content.append(art, textWrap);

      // Controls
      const controls = el('div', 'sh-slideshow-controls');
      const isLast = player.index + 1 >= player.sequence.slides.length;

      const skipBtn = btn('Skip [Space / Esc]', () => {
        blip();
        player = skipStory(player);
        close();
      }, 'sh-slideshow-btn sh-slideshow-btn-secondary');

      const replayBtn = btn('Replay', () => {
        blip();
        animateTransition(() => {
          player = replayStory(player);
          draw();
        });
      }, 'sh-slideshow-btn sh-slideshow-btn-secondary');

      const nextBtn = btn(isLast ? 'Finish' : 'Next →', stepNext, 'sh-slideshow-btn sh-slideshow-btn-primary');

      controls.append(skipBtn, replayBtn, nextBtn);
      frame.append(header, content, controls);
    };

    draw();
    overlay.append(frame);
    root.append(overlay);
  }

  // ---- briefing modal ----
  function holdings(): void {
    if (!rec) return;
    const r = rec;
    const m = el('div', 'sh-modal sh-holdings-modal');
    const box = el('div', 'sh-box sh-holdings-box');
    const draw = (): void => {
      const carry = r.carry;
      box.replaceChildren(
        el('h2', '', T.holdings),
        el('p', 'sh-holdings-intro', carry ? `${T.holdingsIntro} ${T.gold}: ${carry.gold}` : T.holdingsNone),
      );
      const list = el('div', 'sh-holdings-list');
      for (const b of BUILDINGS) {
        const lv = levelOf(r.progress.builds, b.id);
        const cost = nextCost(r.progress.builds, b.id);
        const row = el('div', 'sh-row sh-hold');
        row.append(el('b', '', `${T.building[b.id]} · ${T.buildLevel} ${lv}/${b.cost.length}`), el('span', '', T.buildingInfo[b.id]));
        if (cost === null) row.append(el('span', 'sh-hold-max', T.buildMax));
        else {
          const buy = btn(`${T.buildFor} ${cost}`, () => {
            if (!carry) return;
            const out = build(r.progress, carry.gold, b.id);
            if (!out) return;
            r.progress = out.progress;
            carry.gold = out.gold;
            carry.progress = { ...carry.progress, builds: out.progress.builds }; // the next node reads builds from the carryover
            void writeRecord(r);
            draw();
          }, 'sh-small sh-hold-btn');
          buy.disabled = !carry || carry.gold < cost;
          row.append(buy);
        }
        list.append(row);
      }
      box.append(list);
      box.append(btn(T.back, () => m.remove(), 'sh-small sh-hold-back'));
    };
    draw();
    m.append(box);
    root.append(m);
  }

  function briefing(n: CampaignNode): void {
    const m = el('div', 'sh-modal');
    const box = el('div', 'sh-box homm-dossier-box');
    const enter = (): void => {
      const seq = sequenceForNode(n.id);
      if (seq && seq.kind === 'intro') {
        m.remove();
        showStory(seq.id, () => go(nodeUrl(n)));
      } else {
        go(nodeUrl(n));
      }
    };

    const hasWp = (rec?.progress.waypoints?.includes(n.id) ?? false) || n.kind === 'town';
    const isHere = n.id === rec?.progress.node;

    const btnRow = el('div', 'sh-row');
    const enterBtn = btn(n.kind === 'town' ? `🏰 ${T.enterTown}` : `⚔ ${T.enter}`, enter, 'sh-on');
    btnRow.append(enterBtn);

    if (hasWp && !isHere && rec) {
      const targetRec = rec;
      const wpBtn = btn('⚡ Fast Travel via Waypoint', async () => {
        m.remove();
        targetRec.progress.node = n.id;
        await writeRecord(targetRec);
        await deleteSave(AUTO).catch(() => undefined);
        go(nodeUrl(n));
      }, 'sh-small');
      btnRow.append(wpBtn);
    }
    btnRow.append(btn(T.back, () => m.remove(), 'sh-small'));

    box.append(
      el('h2', '', `${n.kind === 'town' ? '🏰 ' : '⚔ '}${n.title}`),
      el('p', '', n.briefing),
      btnRow,
    );
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
        if (ending && ending.kind === 'ending') {
          showStory(ending.id);
        } else if (last.win) {
          const transition = actTransitionForCompletedNode(n.id);
          if (transition) showStory(transition.id);
        }
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
        if (key === 'music') setMusic(prefs[key], 'town');
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

  title();
  return new Promise<never>(() => {});
}
