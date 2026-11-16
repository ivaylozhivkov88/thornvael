import { blip, play, setMusic, unlock } from './audio';
import { CampfireCanvas } from './campfire';
import { actOf, nodeOf, type CampaignNode } from './campaign';
import { loadCampaign, readRecord, writeRecord } from './campaignstore';
import { canEnter, newRecord, nodeUrl, RECORD_KEY, clearLast, type CampaignRecord, type HeroPick } from './flow';
import { BUILT_IN } from './mission';
import { downloadChapter, loadManifest, removeChapter, verifyChapter, type ChapterCheck, type Env, type Manifest } from './offline';
import { encodeSave } from './save';
import { applyUpdate, onUpdateWaiting, updateWaiting } from './updategate';
import { AUTO, deleteRecord, deleteSave, exportAllSaves, getSave, importSaveText, listSaves } from './savedb';
import { actTransitionForCompletedNode, advanceStory, openStory, previousStory, replayStory, sequenceById, sequenceForNode, skipStory, STORY_SEQUENCES, type StorySequence } from './story';
import { S } from './strings';
import { readPreferences, writePreference } from './preferences';
import { CodexUi } from './codexui';
import { BUILDINGS, build, levelOf, nextCost } from './townbuild';

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
      btn('🏆 Hall of Relics Codex', () => codexUi.show()),
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

  interface Archetype {
    cls: 0 | 1;
    female: boolean;
    name: string;
    epithet: string;
    classLabel: string;
    portraitFile: string;
    bio: string;
    gear: string[];
    perks: string[];
    hp: number;
    mp: number;
    bars: { hp: string; mp: string; atk: string; magic: string; def: string };
    sound: string;
  }

  const ARCHETYPES: readonly Archetype[] = [
    {
      cls: 0,
      female: false,
      name: 'Dain Ironclad',
      epithet: 'Vanguard Paladin',
      classLabel: 'WARRIOR',
      portraitFile: 'portrait-warrior-m.png',
      bio: 'A battle-hardened defender of Thornwick, clad in tempered gothic plate, wielding a broad kite shield and steel bastard sword. Absorbs crushing blows and holds chokepoints against overwhelming hordes.',
      gear: ['Steel Bastard Sword', 'Tower Kite Shield', 'Tempered Plate', 'Healing Draught'],
      perks: ['+25% Shield Block', 'Heavy Armor Mastery', 'Iron Resolve'],
      hp: 160,
      mp: 30,
      bars: { hp: '85%', mp: '25%', atk: '80%', magic: '15%', def: '90%' },
      sound: 'hit',
    },
    {
      cls: 0,
      female: true,
      name: 'Selena Swiftblade',
      epithet: 'Borderlands Ranger',
      classLabel: 'WARRIOR',
      portraitFile: 'portrait-warrior-f.png',
      bio: 'A legendary mercenary duelist and ranger in hardened leather cuirass and dark cloak, wielding lethal twin curved daggers. Strikes vulnerable armor seams and turns enemy momentum into deadly counter-attacks.',
      gear: ['Twin Curved Daggers', 'Hardened Cuirass', 'Shadow Cloak', 'Healing Draught'],
      perks: ['+15% Movement Speed', '+20% Critical Strike', 'Nimble Footwork'],
      hp: 140,
      mp: 40,
      bars: { hp: '75%', mp: '30%', atk: '95%', magic: '20%', def: '65%' },
      sound: 'hit',
    },
    {
      cls: 1,
      female: false,
      name: 'Valerius Pyremaster',
      epithet: 'Flame Archmage',
      classLabel: 'MAGE',
      portraitFile: 'portrait-mage-m.png',
      bio: 'An ordained scholar from the Citadel of Embers, robed in crimson and ash-grey scholar robes, clutching an ancient ash staff crowned with a smoldering ember crystal. Obliterates enemy squads from range with devastating celestial fire.',
      gear: ['Ember Ash Staff', 'Scholar Robes', 'Fire Bolt', 'Inferno Scroll'],
      perks: ['Fire & Astral Mastery', '+30% Mana Pool', 'Elemental Overcharge'],
      hp: 80,
      mp: 130,
      bars: { hp: '45%', mp: '95%', atk: '30%', magic: '98%', def: '30%' },
      sound: 'cast_fire',
    },
    {
      cls: 1,
      female: true,
      name: 'Morrigan Frostweaver',
      epithet: 'Glacial Sorceress',
      classLabel: 'MAGE',
      portraitFile: 'portrait-mage-f.png',
      bio: 'Keeper of ancient tide-runes, wearing midnight-blue runic garments with silver embroidery and holding a frost-forged staff with glowing azure runes. Weaves freezing blizzards and restorative water mists to immobilize charging hordes.',
      gear: ['Runic Frost Staff', 'Silver Silk Garments', 'Frost Bolt', 'Ice Shield'],
      perks: ['Water & Earth Affinity', 'Battlefield Freeze', 'Quick Casting'],
      hp: 85,
      mp: 120,
      bars: { hp: '48%', mp: '90%', atk: '25%', magic: '92%', def: '40%' },
      sound: 'cast_water',
    },
  ];

  // ---- hero creation: class, sex, difficulty (classic ARPG Gothic Campfire AAA Selection) ----
  function create(): void {
    mode = 'other';
    let selIdx = 0;
    let diff = 1;

    const base = import.meta.env.BASE_URL;
    const container = el('div', 'sh-campfire-screen');
    container.style.backgroundImage = `url("${base}townart/campfire-bg.webp"), url("${base}townart/campfire-bg.jpg")`;

    // Campfire Canvas Particle System (center foreground bonfire)
    const campfire = new CampfireCanvas();
    campfire.start();

    // Dark gothic atmospheric overlays
    const vignette = el('div', 'sh-campfire-vignette');
    const mist = el('div', 'sh-campfire-mist');

    // 2-Column Campfire Layout: Left (65% Stage & Champions), Right (35% Dossier & Controls)
    const leftPane = el('div', 'sh-campfire-left');
    const rightPane = el('div', 'sh-campfire-right');

    // Header (inside left pane)
    const hdr = el('div', 'sh-campfire-header');
    const brand = el('span', 'sh-campfire-brand', 'THORNVAEL');
    const title = el('h2', 'sh-campfire-title', 'SELECT YOUR CHAMPION');
    const subtitle = el('p', 'sh-campfire-subtitle', 'Gather around the midnight flames and choose your destined hero');
    hdr.append(brand, title, subtitle);

    // Stage area: Champions arranged side-by-side around the roaring campfire
    const stage = el('div', 'sh-campfire-stage');
    const hearthWrap = el('div', 'sh-campfire-hearth-wrap');
    hearthWrap.append(campfire.canvas);

    leftPane.append(hdr, stage);

    const dossier = el('div', 'sh-hero-dossier');

    const updateDossier = (arch: Archetype): void => {
      dossier.replaceChildren();

      // Top identity banner
      const dHdr = el('div', 'sh-dossier-header');
      const dBadge = el('span', `sh-dossier-class-seal ${arch.cls === 1 ? 'mage' : 'warrior'}`, arch.classLabel);
      const dTitleWrap = el('div', 'sh-dossier-title-wrap');
      const dName = el('h3', 'sh-dossier-name', arch.name);
      const dEpithet = el('span', 'sh-dossier-epithet', arch.epithet);
      dTitleWrap.append(dName, dEpithet);
      dHdr.append(dBadge, dTitleWrap);

      // Hero biography
      const bio = el('div', 'sh-dossier-bio');
      bio.append(el('p', 'sh-dossier-desc', arch.bio));

      // Animated attribute bars
      const stats = el('div', 'sh-dossier-stats');
      const statRow = (label: string, width: string, val: string, cls: string): HTMLElement => {
        const row = el('div', 'sh-stat-row');
        const fill = el('div', `sh-stat-fill ${cls}`);
        fill.style.width = width;
        const bar = el('div', 'sh-stat-bar');
        bar.append(fill);
        row.append(el('span', 'sh-stat-label', label), bar, el('span', 'sh-stat-val', val));
        return row;
      };

      stats.append(
        statRow('Health', arch.bars.hp, `${arch.hp} HP`, 'hp'),
        statRow('Mana', arch.bars.mp, `${arch.mp} MP`, 'mp'),
        statRow('Combat Power', arch.bars.atk, arch.bars.atk, 'atk'),
        statRow('Spell Affinity', arch.bars.magic, arch.bars.magic, 'magic'),
        statRow('Defence', arch.bars.def, arch.bars.def, 'def'),
      );

      // Starting Equipment & Masteries
      const gearBox = el('div', 'sh-dossier-gear');
      gearBox.append(el('b', 'sh-dossier-subtitle', 'Starting Equipment & Masteries:'));
      const tags = el('div', 'sh-gear-tags');
      for (const g of arch.gear) tags.append(el('span', 'sh-tag', g));
      for (const p of arch.perks) tags.append(el('span', 'sh-tag perk', p));
      gearBox.append(tags);

      dossier.append(dHdr, bio, stats, gearBox);
    };

    const drawStage = (): void => {
      stage.replaceChildren();

      // Semi-circle arrangement:
      // Selena (idx 1, outer-left) | Dain (idx 0, inner-left) | Campfire | Valerius (idx 2, inner-right) | Morrigan (idx 3, outer-right)
      const renderChampion = (idx: number): HTMLElement => {
        const arch = ARCHETYPES[idx];
        const isSel = idx === selIdx;
        const champ = el('div', `sh-campfire-champion champion-${arch.female ? 'f' : 'm'}-${arch.cls === 1 ? 'mage' : 'warrior'} ${isSel ? 'selected' : ''}`);

        const groundGlow = el('div', 'sh-champion-ground-glow');
        const figureWrap = el('div', 'sh-champion-figure-wrap');
        const img = document.createElement('img');
        img.className = 'sh-champion-figure';
        img.src = `${base}townart/${arch.portraitFile}`;
        img.alt = arch.name;
        figureWrap.append(img);

        const nameplate = el('div', 'sh-champion-nameplate');
        const badge = el('span', `sh-champion-badge ${arch.cls === 1 ? 'mage' : 'warrior'}`, arch.classLabel);
        const name = el('span', 'sh-champion-name', arch.name);
        const epithet = el('span', 'sh-champion-epithet', arch.epithet);
        nameplate.append(badge, name, epithet);

        champ.append(groundGlow, figureWrap, nameplate);

        champ.onclick = () => {
          if (selIdx !== idx) {
            selIdx = idx;
            play('select_hero', 5);
            play(arch.sound, 4);
            drawStage();
            updateDossier(arch);
          }
        };

        return champ;
      };

      stage.append(
        renderChampion(1), // Selena Swiftblade
        renderChampion(0), // Dain Ironclad
        hearthWrap,        // Roaring Bonfire in center
        renderChampion(2), // Valerius Pyremaster
        renderChampion(3)  // Morrigan Frostweaver
      );
    };

    drawStage();
    updateDossier(ARCHETYPES[selIdx]);

    // Bottom controls panel: Difficulty + Action buttons
    const controls = el('div', 'sh-campfire-controls');

    // Difficulty Panel
    const diffPanel = el('div', 'sh-difficulty-panel');
    const diffHdr = el('div', 'sh-diff-header');
    diffHdr.append(el('span', 'sh-diff-label', 'Campaign Difficulty:'));
    const diffBtns = el('div', 'sh-diff-buttons');
    const diffDesc = el('p', 'sh-diff-desc', T.diffInfo[diff]);

    const drawDiff = (): void => {
      diffBtns.replaceChildren(
        ...T.diff.map((name, i) =>
          btn(name, () => {
            blip();
            diff = i;
            diffDesc.textContent = T.diffInfo[diff];
            drawDiff();
          }, i === diff ? 'sh-on sh-small' : 'sh-small')
        )
      );
    };
    drawDiff();
    diffHdr.append(diffBtns);
    diffPanel.append(diffHdr, diffDesc);

    // Action buttons: Launch directly into Act 1 seamless world
    const actions = el('div', 'sh-hero-actions');
    const startBtn = btn('BEGIN CAMPAIGN', async () => {
      blip();
      campfire.stop();
      const arch = ARCHETYPES[selIdx];
      const pick: HeroPick = { cls: arch.cls, female: arch.female };
      rec = newRecord(c, pick, diff);
      currentAct = activeAct(rec);
      await writeRecord(rec);
      await deleteSave(AUTO).catch(() => undefined);
      auto = null;
      const startNode = nodeOf(c, c.start);
      const diffStr = (['easy', 'medium', 'hard'] as const)[diff];
      const heroStr = `${arch.cls === 1 ? 'mage' : 'warrior'},${arch.female ? 'f' : 'm'},${diffStr}`;
      const url = `${nodeUrl(startNode)}&hero=${encodeURIComponent(heroStr)}`;
      const seq = sequenceForNode(startNode.id);
      if (seq && seq.kind === 'intro') {
        showStory(seq.id, () => go(url));
      } else {
        go(url);
      }
    }, 'sh-btn-start');

    const backBtn = btn(T.back, () => {
      blip();
      campfire.stop();
      menu();
    }, 'sh-btn-back');

    actions.append(startBtn, backBtn);
    controls.append(diffPanel, actions);
    rightPane.append(dossier, controls);

    container.append(vignette, mist, leftPane, rightPane);
    screen(container);
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
        wpGem.title = 'Active Waypoint';
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

      const pips = el('div', 'sh-slideshow-pips');
      for (let i = 0; i < player.sequence.slides.length; i++) {
        pips.append(el('span', `sh-slideshow-pip${i === player.index ? ' active' : ''}`));
      }

      textWrap.append(heading, caption, pips);
      content.append(art, textWrap);

      // Controls
      const controls = el('div', 'sh-slideshow-controls');
      const isLast = player.index + 1 >= player.sequence.slides.length;

      const skipBtn = btn('Пропусни [Space / Esc]', () => {
        blip();
        player = skipStory(player);
        close();
      }, 'sh-slideshow-btn sh-slideshow-btn-secondary');

      const replayBtn = btn('Повтори', () => {
        blip();
        animateTransition(() => {
          player = replayStory(player);
          draw();
        });
      }, 'sh-slideshow-btn sh-slideshow-btn-secondary');

      const nextBtn = btn(isLast ? 'Край' : 'Напред →', stepNext, 'sh-slideshow-btn sh-slideshow-btn-primary');

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

  menu();
  return new Promise<never>(() => {});
}
