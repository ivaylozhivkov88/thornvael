import { attachBlurMuteListeners, isMusicPlaying, setCharSelectMusic, setMainMenuMusic, setMusic, unlock } from './audio';
import { actOf, nodeOf, type CampaignNode } from './campaign';
import { loadCampaign, readRecord, writeRecord } from './campaignstore';
import { canEnter, newRecord, nodeUrl, RECORD_KEY, clearLast, type CampaignRecord, type HeroPick } from './flow';
import { BUILT_IN_NAMES } from './mission-runtime';
import {
  addCharacter,
  characterCarry,
  deleteCharacter,
  getActiveId,
  listCharacters,
  setActiveId,
  type Character,
} from './characters';
import { downloadChapter, loadManifest, removeChapter, verifyChapter, type ChapterCheck, type Env, type Manifest } from './offline';
import { encodeSave } from './save';
import { applyUpdate, onUpdateWaiting, updateWaiting } from './updategate';
import { AUTO, deleteRecord, deleteSave, exportAllSaves, getSave, importSaveText, listSaves } from './savedb';
import { actTransitionForCompletedNode, endingForCompletedNode, sequenceById, sequenceForNode, STORY_SEQUENCES, type StorySequence } from './story';
import { S } from './strings';
import { readPreferences, writePreference } from './preferences';
import { CodexUi } from './codexui';
import { getPlaquesByAct, loadLocationPlaques, type LocationPlaqueEntry } from './data/text/index';
import { loadMonsterCodex, loadHelpAndCredits, getHelpPages, getCreditLines } from './missioncontent';
import { getLoadingTip, hydrateCuratedTips } from './tips';
import { MobileControlsHelp } from './ui-extra/mobile-controls-help';
import { applyUxSettings, loadUxSettings } from './ui-extra/settings-panel';
import { btn, el } from './shell/dom';
import {
  ModalManager,
  openBriefingModal,
  openHoldingsModal,
  openResultModal,
  openStorySlideshowModal,
} from './shell/modals';
import {
  ARCHETYPES,
  buildHeroCreationScreen,
  findArchetypeIndex,
  formatCharacterClass,
  renderHeroCreateNameView,
  renderHeroSelectView,
  type Archetype,
  type HeroCreationOptions,
} from './shell/hero-select-view';
import { renderSettingsView } from './shell/settings-binder';

export { ARCHETYPES, buildHeroCreationScreen, findArchetypeIndex, type Archetype, type HeroCreationOptions };

/**
 * The screens around the game: main menu, hero creation, global map, briefing and result.
 * Every step that starts a mission or town is a page address (`?mission=..&campaign=..`), so each node begins from a clean page.
 * The campaign record lives in IndexedDB (see flow.ts). All text is set with textContent.
 */
const T = S.shell;
const MAPS: ReadonlySet<string> = BUILT_IN_NAMES;

export async function runShell(startWorker: () => void): Promise<never> {
  applyUxSettings(loadUxSettings());
  attachBlurMuteListeners();
  void hydrateCuratedTips();
  let locationPlaques: LocationPlaqueEntry[] = [];
  void loadLocationPlaques(import.meta.env.BASE_URL)
    .then((pack) => {
      locationPlaques = pack.entries;
    })
    .catch(() => undefined);
  void loadMonsterCodex();
  void loadHelpAndCredits();
  startWorker();
  const codexUi = new CodexUi();
  let audioUnlocked = false;
  let shellMusicKind: 'menu' | 'charSelect' = 'menu';
  const root = el('div');
  root.id = 'shell';
  root.style.setProperty('--shell-bg-image', `url("${import.meta.env.BASE_URL}loadscreens/load-map1-fords.jpg")`);
  document.body.append(root);

  const musicBtn = btn('♪ Music', () => {
    const prefs = readPreferences();
    if (!prefs.music) {
      writePreference('music', true);
      audioUnlocked = true;
      unlock();
      syncShellMusic(shellMusicKind);
      attachShellGestureUnlock();
    } else if (!isMusicPlaying()) {
      audioUnlocked = true;
      unlock();
      syncShellMusic(shellMusicKind);
    } else {
      writePreference('music', false);
      setMusic(false);
    }
    refreshMusicBtn();
    setTimeout(refreshMusicBtn, 160);
    setTimeout(refreshMusicBtn, 600);
  }, 'sh-music-btn');
  musicBtn.id = 'sh-music-btn';
  musicBtn.type = 'button';
  document.body.append(musicBtn);

  const refreshMusicBtn = (): void => {
    const wantMusic = readPreferences().music;
    if (!wantMusic) {
      musicBtn.textContent = '✕ Music: Off';
      musicBtn.classList.remove('is-playing', 'is-pending');
      musicBtn.setAttribute('aria-pressed', 'false');
      musicBtn.title = 'Enable menu music';
      return;
    }
    const playing = isMusicPlaying();
    musicBtn.textContent = playing ? '♫ Music: On' : '♪ Music';
    musicBtn.classList.toggle('is-playing', playing);
    musicBtn.classList.toggle('is-pending', !playing);
    musicBtn.setAttribute('aria-pressed', String(playing));
    musicBtn.title = playing ? 'Mute menu music' : 'Click to start menu music';
  };

  const syncShellMusic = (kind: 'menu' | 'charSelect'): void => {
    shellMusicKind = kind;
    if (!audioUnlocked || !readPreferences().music) {
      refreshMusicBtn();
      return;
    }
    if (kind === 'charSelect') setCharSelectMusic();
    else setMainMenuMusic();
    refreshMusicBtn();
    setTimeout(refreshMusicBtn, 160);
  };

  let gestureAttached = false;
  const onShellGesture = (e: Event): void => {
    if (typeof Node !== 'undefined' && e.target instanceof Node && musicBtn.contains(e.target)) return;
    if (!readPreferences().music) {
      detachShellGestureUnlock();
      refreshMusicBtn();
      return;
    }
    audioUnlocked = true;
    unlock();
    syncShellMusic(shellMusicKind);
    setTimeout(() => {
      refreshMusicBtn();
      if (isMusicPlaying()) detachShellGestureUnlock();
    }, 200);
  };
  const attachShellGestureUnlock = (): void => {
    if (gestureAttached) return;
    gestureAttached = true;
    document.addEventListener('pointerdown', onShellGesture, { capture: true, passive: true });
    document.addEventListener('click', onShellGesture, { capture: true, passive: true });
    document.addEventListener('keydown', onShellGesture, { capture: true, passive: true });
  };
  const detachShellGestureUnlock = (): void => {
    if (!gestureAttached) return;
    gestureAttached = false;
    document.removeEventListener('pointerdown', onShellGesture, { capture: true });
    document.removeEventListener('click', onShellGesture, { capture: true });
    document.removeEventListener('keydown', onShellGesture, { capture: true });
  };
  attachShellGestureUnlock();
  refreshMusicBtn();
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
  const modals = new ModalManager();
  let activeDispose: (() => void) | null = null;
  // Every game page learns which hero plays it, so the hero keeps what it earns (see characters.ts).
  const LOAD_ARTS = [
    'loadscreens/load-map1-fords.jpg',
    'loadscreens/load-map2-redmarsh.jpg',
    'loadscreens/load-map3-coast.jpg',
    'loadscreens/load-map4-caldera.jpg',
  ] as const;
  const showLoadOverlay = (titleText: string, actNum: number): void => {
    const idx = Math.max(0, Math.min(3, actNum - 1));
    const overlay = el('div', 'sh-load-overlay');
    const card = el('div', 'sh-load-card');
    const img = document.createElement('img');
    img.className = 'sh-load-art';
    img.alt = titleText;
    img.src = `${import.meta.env.BASE_URL}${LOAD_ARTS[idx]}`;
    const tip = getLoadingTip();
    card.append(el('h2', 'sh-load-title', titleText), img, el('p', 'sh-load-tip', tip));
    overlay.append(card);
    document.body.append(overlay);
  };
  const go = (url: string, meta?: { title?: string; act?: number }): void => {
    if (meta?.title) showLoadOverlay(meta.title, meta.act ?? currentAct);
    location.assign(active && url.startsWith('./?') && !url.includes('free=') && !url.includes('load=') ? `${url}&char=${encodeURIComponent(active.id)}` : url);
  };
  const screen = (...kids: HTMLElement[]): void => {
    activeDispose?.();
    activeDispose = null;
    modals.closeAll();
    root.replaceChildren(...kids);
    musicBtn.classList.toggle('is-campfire', kids.some((k) => k.classList.contains('sh-campfire-screen')));
    if (mode !== 'map' && musicBtn.parentElement !== document.body) {
      musicBtn.classList.remove('is-inline');
      document.body.append(musicBtn);
    }
  };
  const back = (): HTMLButtonElement => btn(T.back, menu, 'sh-small');
  const clsName = (x: Character): string => formatCharacterClass(x);
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
    syncShellMusic('menu');
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
      (() => {
        const row = el('div', 'sh-row');
        row.append(
          btn('Help & Guide', help),
          btn('Wiki', () => window.open(new URL('wiki.html', document.baseURI).href, '_blank', 'noopener'), 'sh-small'),
        );
        return row;
      })(),
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
    const worldStart = startNode.id === 'm01-blood-at-the-ford' ? nodeUrl(startNode).replace(/mission=[^&]+/, 'mission=act1-world') : nodeUrl(startNode);
    const url = `${worldStart}&hero=${encodeURIComponent(heroStr)}`;
    const seq = sequenceForNode(startNode.id);
    if (seq && seq.kind === 'intro') {
      showStory(seq.id, () => go(url, { title: startNode.title, act: actOf(startNode) }));
    } else {
      go(url, { title: startNode.title, act: actOf(startNode) });
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
    syncShellMusic('menu');
    const col = el('div', 'sh-col');
    const canResume = rec !== null || auto !== null;
    col.append(
      el('h1', '', S.title),
      ...banner(),
      ...(canResume
        ? [
            btn(
              'Continue Campaign',
              () => {
                if (auto && (!rec || auto.state.node)) go(`./?load=${AUTO}`);
                else map();
              },
              'sh-on',
            ),
          ]
        : []),
      btn('Single Player', charSelect),
      btn(T.credits, credits, 'sh-small'),
      btn('Storage & Offline', storage, 'sh-small'),
      btn('Settings', settings, 'sh-small'),
    );
    screen(col);
  }

  function charSelect(): void {
    mode = 'other';
    syncShellMusic('charSelect');
    screen(
      renderHeroSelectView({
        characters: chars,
        activeCharacter: active,
        onSelect: (sel) => {
          active = sel;
          setActiveId(sel.id);
          menu();
        },
        onDelete: async (victim) => {
          await deleteCharacter(victim.id);
          chars = await listCharacters();
          if (active?.id === victim.id) active = null;
          charSelect();
        },
        onCreateNew: createChar,
        onExit: title,
      }),
    );
  }

  function createChar(): void {
    mode = 'other';
    syncShellMusic('charSelect');
    const view = renderHeroCreateNameView({
      base: import.meta.env.BASE_URL,
      onMountCampfire: (campfireScreen) => screen(campfireScreen),
      onHeroCreated: async (ch) => {
        await addCharacter(ch);
        chars = await listCharacters();
        active = ch;
        setActiveId(ch.id);
        await startCampaign({ cls: ch.cls, female: ch.female }, ch.diff);
      },
      onBack: charSelect,
    });
    screen(view.element);
    view.focusInput();
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
    syncShellMusic('menu');
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
    musicBtn.classList.add('is-inline');
    bar.append(el('b', '', `${T.mapTitle} · ${T.diff[r.progress.difficulty]}`), actTabs, btn('🏆 Codex', () => codexUi.show(), 'sh-small'), btn(T.holdings, holdings, 'sh-small'), ...banner(), musicBtn, btn(T.back, menu, 'sh-small'));
    screen(bar, stage);
    if (r.last) result(r.last);
  }

  function showStory(id: StorySequence['id'], onFinish?: () => void): void {
    openStorySlideshowModal(modals, root, id, () => {
      if (!onFinish) {
        syncShellMusic(shellMusicKind);
      }
      onFinish?.();
    });
  }

  // ---- briefing modal ----
  function holdings(): void {
    if (!rec) return;
    openHoldingsModal(modals, root, {
      record: rec,
      onSaveRecord: (r) => writeRecord(r),
    });
  }

  function briefing(n: CampaignNode): void {
    const act = actOf(n);
    const actPlaques = locationPlaques.length ? getPlaquesByAct(locationPlaques, act) : [];
    const titleLower = n.title.toLowerCase();
    const matchedPlaque =
      actPlaques.find(
        (p) =>
          titleLower.includes(p.region.toLowerCase()) ||
          p.title.toLowerCase().split(/\s+/).some((w) => w.length > 4 && titleLower.includes(w)),
      ) ?? actPlaques[0] ?? null;
    openBriefingModal(modals, root, {
      node: n,
      record: rec,
      plaque: matchedPlaque ? { title: matchedPlaque.title, text: matchedPlaque.text } : null,
      tip: getLoadingTip(),
      onEnter: (handle) => {
        const seq = sequenceForNode(n.id);
        if (seq && seq.kind === 'intro') {
          handle.close();
          showStory(seq.id, () => go(nodeUrl(n), { title: n.title, act }));
        } else {
          go(nodeUrl(n), { title: n.title, act });
        }
      },
      onWaypointTravel: async (handle) => {
        handle.close();
        if (!rec) return;
        rec.progress.node = n.id;
        await writeRecord(rec);
        await deleteSave(AUTO).catch(() => undefined);
        go(nodeUrl(n), { title: n.title, act });
      },
    });
  }

  // ---- result screen: shown once after a mission or when leaving it ----
  function result(last: NonNullable<CampaignRecord['last']>): void {
    const n = nodeOf(c, last.node);
    openResultModal(modals, root, {
      node: n,
      last,
      record: rec,
      onAcknowledge: async () => {
        if (rec) {
          rec = clearLast(rec);
          await writeRecord(rec);
          currentAct = activeAct(rec);
        }
        map();
        if (last.win) {
          const completionEnding = endingForCompletedNode(n.id);
          if (completionEnding) {
            showStory(completionEnding.id);
          } else {
            const ending = sequenceForNode(n.id);
            if (ending && ending.kind === 'ending') {
              showStory(ending.id);
            } else {
              const transition = actTransitionForCompletedNode(n.id);
              if (transition) showStory(transition.id);
            }
          }
        }
      },
    });
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
    const view = renderSettingsView({
      onBack: menu,
      onEraseCampaign: async () => {
        await deleteRecord(RECORD_KEY);
        rec = null;
        menu();
      },
    });
    screen(view.element);
    activeDispose = view.dispose;
  }

  function help(): void {
    mode = 'other';
    const col = el('div', 'sh-col');
    col.append(el('h2', '', 'Help & Guide'));
    const list = el('div', 'sh-help');
    list.style.cssText = 'max-width: 620px; max-height: 58dvh; overflow-y: auto; text-align: left;';
    for (const p of getHelpPages()) list.append(el('h3', '', p.title), el('p', 'note', p.body));
    if (!getHelpPages().length) list.append(el('p', 'note', 'No help pages loaded.'));
    const touchBtn = btn('📱 Touch & Mobile Controls', () => new MobileControlsHelp().open(), 'sh-small');
    const row = el('div', 'sh-row');
    row.append(touchBtn, back());
    col.append(list, row);
    screen(col);
  }

  function credits(): void {
    mode = 'other';
    const col = el('div', 'sh-col');
    col.append(el('h2', '', S.credits), el('p', 'note', S.creditsBody), ...getCreditLines().map((c) => el('p', 'note', c.text)), el('h3', '', 'Story Replay'));
    const row = el('div', 'sh-row sh-credits-replay');
    row.style.cssText = 'flex-wrap: wrap; justify-content: center; max-width: 580px; gap: 8px;';
    const replayable: StorySequence[] = [
      ...STORY_SEQUENCES.slice(0, 2),
      sequenceById('cs_act2_end'),
      ...STORY_SEQUENCES.slice(2),
    ];
    for (const seq of replayable) {
      row.append(btn(seq.title, () => showStory(seq.id), 'sh-small'));
    }
    col.append(row, back());
    screen(col);
  }

  const shellView = new URLSearchParams(location.search).get('menu');
  if (shellView === 'map' && rec) {
    map();
  } else if (shellView === 'hub' && rec) {
    menu();
  } else if (rec?.last) {
    map();
  } else {
    title();
  }
  return new Promise<never>(() => {});
}
