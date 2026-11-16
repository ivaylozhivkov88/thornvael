import { blip, play } from './audio';
import { CampfireCanvas } from './campfire';
import { S } from './strings';

const T = S.shell;

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

export interface Archetype {
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

export const ARCHETYPES: readonly Archetype[] = [
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

export function findArchetypeIndex(cls: 0 | 1, female: boolean): number {
  const idx = ARCHETYPES.findIndex((a) => a.cls === cls && a.female === female);
  return idx >= 0 ? idx : 0;
}

export interface HeroCreationOptions {
  base?: string;
  onStart: (arch: Archetype, diff: number) => void;
  onBack: () => void;
  createCampfire?: () => { canvas: HTMLElement; start(): void; stop(): void };
}

export function buildHeroCreationScreen(opts: HeroCreationOptions): HTMLElement {
  let selIdx = 0;
  let diff = 1;

  const base = opts.base ?? import.meta.env.BASE_URL ?? '/';
  const container = el('div', 'sh-campfire-screen');
  container.style.backgroundImage = `url("${base}townart/campfire-bg.webp"), url("${base}townart/campfire-bg.jpg")`;

  const campfire = opts.createCampfire ? opts.createCampfire() : new CampfireCanvas();
  campfire.start();

  // Dark gothic atmospheric overlays
  const vignette = el('div', 'sh-campfire-vignette');
  const mist = el('div', 'sh-campfire-mist');

  // 2-Column Campfire Layout: Left (65% Pillar Showcase Stage), Right (35% Class/Gender Selectors, Dossier & Controls)
  const leftPane = el('div', 'sh-campfire-left');
  const rightPane = el('div', 'sh-campfire-right');

  // Header (inside left pane)
  const hdr = el('div', 'sh-campfire-header');
  const brand = el('span', 'sh-campfire-brand', 'THORNVAEL');
  const title = el('h2', 'sh-campfire-title', 'SELECT YOUR CHAMPION');
  const subtitle = el('p', 'sh-campfire-subtitle', 'Stand beside the ancient stone pillar and choose your destined hero');
  hdr.append(brand, title, subtitle);

  // Stage area: Single Giant Hero Showcase next to the stone pillar & roaring campfire
  const stage = el('div', 'sh-campfire-stage');
  const hearthWrap = el('div', 'sh-campfire-hearth-wrap');
  hearthWrap.append(campfire.canvas);

  leftPane.append(hdr, stage);

  // Explicit Class (Warrior / Mage) & Gender (Male / Female) Gothic Selectors
  const selectorPanel = el('div', 'sh-archetype-selectors');
  const classRow = el('div', 'sh-selector-group class-group');
  const genderRow = el('div', 'sh-selector-group gender-group');
  selectorPanel.append(classRow, genderRow);

  const dossier = el('div', 'sh-hero-dossier');

  const selectArchetype = (newIdx: number): void => {
    const normalized = ((newIdx % ARCHETYPES.length) + ARCHETYPES.length) % ARCHETYPES.length;
    const changed = normalized !== selIdx;
    selIdx = normalized;
    const arch = ARCHETYPES[selIdx];
    if (changed) {
      play('select_hero', 5);
      play(arch.sound, 4);
    }
    drawSelectors();
    drawStage();
    updateDossier(arch);
  };

  container.tabIndex = 0;
  container.onkeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectArchetype(selIdx - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectArchetype(selIdx + 1);
    }
  };

  const drawSelectors = (): void => {
    const arch = ARCHETYPES[selIdx];
    classRow.replaceChildren(
      el('span', 'sh-selector-label', 'Class:'),
      btn(
        '⚔ Warrior',
        () => selectArchetype(findArchetypeIndex(0, ARCHETYPES[selIdx].female)),
        `sh-select-cls warrior ${arch.cls === 0 ? 'sh-on' : ''}`.trim(),
      ),
      btn(
        '🔮 Mage',
        () => selectArchetype(findArchetypeIndex(1, ARCHETYPES[selIdx].female)),
        `sh-select-cls mage ${arch.cls === 1 ? 'sh-on' : ''}`.trim(),
      ),
    );

    genderRow.replaceChildren(
      el('span', 'sh-selector-label', 'Gender:'),
      btn(
        '♂ Male',
        () => selectArchetype(findArchetypeIndex(ARCHETYPES[selIdx].cls, false)),
        `sh-select-sex male ${!arch.female ? 'sh-on' : ''}`.trim(),
      ),
      btn(
        '♀ Female',
        () => selectArchetype(findArchetypeIndex(ARCHETYPES[selIdx].cls, true)),
        `sh-select-sex female ${arch.female ? 'sh-on' : ''}`.trim(),
      ),
    );
  };

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
    const arch = ARCHETYPES[selIdx];

    const champ = el(
      'div',
      `sh-campfire-champion sh-champion-showcase champion-${arch.female ? 'f' : 'm'}-${arch.cls === 1 ? 'mage' : 'warrior'} selected`,
    );

    const groundGlow = el('div', 'sh-champion-ground-glow');
    const figureWrap = el('div', 'sh-champion-figure-wrap');

    const prevBtn = btn('◀', () => selectArchetype(selIdx - 1), 'sh-stage-nav prev');
    prevBtn.setAttribute?.('aria-label', 'Previous Champion');

    const img = document.createElement('img');
    img.className = 'sh-champion-figure';
    img.src = `${base}townart/${arch.portraitFile}`;
    img.alt = arch.name;

    const nextBtn = btn('▶', () => selectArchetype(selIdx + 1), 'sh-stage-nav next');
    nextBtn.setAttribute?.('aria-label', 'Next Champion');

    figureWrap.append(prevBtn, img, nextBtn);

    const nameplate = el('div', 'sh-champion-nameplate');
    const badgeRow = el('div', 'sh-champion-badge-row');
    const badge = el('span', `sh-champion-badge ${arch.cls === 1 ? 'mage' : 'warrior'}`, arch.classLabel);
    const genderBadge = el('span', `sh-champion-gender-badge ${arch.female ? 'female' : 'male'}`, arch.female ? '♀ FEMALE' : '♂ MALE');
    badgeRow.append(badge, genderBadge);

    const name = el('span', 'sh-champion-name', arch.name);
    const epithet = el('span', 'sh-champion-epithet', arch.epithet);
    nameplate.append(badgeRow, name, epithet);

    // Quick 4-hero roster strip under the nameplate
    const rosterStrip = el('div', 'sh-champion-roster-strip');
    ARCHETYPES.forEach((item, idx) => {
      const shortName = item.name.split(' ')[0];
      const pill = btn(
        `${item.cls === 1 ? '🔮' : '⚔'} ${shortName}`,
        () => selectArchetype(idx),
        `sh-roster-pill ${idx === selIdx ? 'sh-on' : ''}`.trim(),
      );
      rosterStrip.append(pill);
    });

    champ.append(groundGlow, figureWrap, nameplate, rosterStrip);
    stage.append(champ, hearthWrap);
  };

  drawSelectors();
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
        btn(
          name,
          () => {
            blip();
            diff = i;
            diffDesc.textContent = T.diffInfo[diff];
            drawDiff();
          },
          i === diff ? 'sh-on sh-small' : 'sh-small',
        ),
      ),
    );
  };
  drawDiff();
  diffHdr.append(diffBtns);
  diffPanel.append(diffHdr, diffDesc);

  // Action buttons: Launch directly into Act 1 seamless world
  const actions = el('div', 'sh-hero-actions');
  const startBtn = btn(
    'BEGIN CAMPAIGN',
    () => {
      blip();
      campfire.stop();
      opts.onStart(ARCHETYPES[selIdx], diff);
    },
    'sh-btn-start',
  );

  const backBtn = btn(
    T.back,
    () => {
      blip();
      campfire.stop();
      opts.onBack();
    },
    'sh-btn-back',
  );

  actions.append(startBtn, backBtn);
  controls.append(diffPanel, actions);
  rightPane.append(selectorPanel, dossier, controls);

  container.append(vignette, mist, leftPane, rightPane);
  return container;
}
