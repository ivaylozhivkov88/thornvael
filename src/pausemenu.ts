import {
  getMasterVolume,
  getMusicVolume,
  getSfxVolume,
  setMasterVolume,
  setMusicVolume,
  setSfxVolume,
  type MusicMode,
} from './audio';
import { SPELLS, Tk, St, type SpellDef } from './sim/spelldata';
import { QUALITY_NAMES } from './render';
import { keybindManager, DEFAULT_KEYBINDS } from './keybinds';

export interface PauseMenuCtx {
  resume: () => void;
  isPaused: () => boolean;
  saveAndExit?: () => void;
  openSaves: () => void;
  exitToMain: () => void;
  setQuality: (q: number) => void;
  getQuality: () => number;
  setWeather?: (on: boolean) => void;
  isWeatherOn?: () => boolean;
  setAutoRecenter: (on: boolean) => void;
  getAutoRecenter: () => boolean;
  heroKnownSpells: () => (sid: number) => boolean;
  openSpellbook: () => void;
  openInventory: () => void;
  openStats: () => void;
  openQuests: () => void;
  toggleMusic: () => void;
  isMusicOn: () => boolean;
  toggleSfx: () => void;
  isSfxOn: () => boolean;
  openSkillAssignment?: () => void;
  isVirtualStickOn?: () => boolean;
  setVirtualStick?: (on: boolean) => void;
}

type MenuView = 'main' | 'controls' | 'codex' | 'settings';
type SphereFilter = 'all' | 'fire' | 'water' | 'air' | 'earth' | 'astral';

const SCHOOL_META: Record<number, { key: SphereFilter; name: string; icon: string; color: string; border: string }> = {
  1: { key: 'fire', name: 'Fire', icon: '🔥', color: '#ff6b3d', border: '#ff5722' },
  2: { key: 'water', name: 'Water', icon: '💧', color: '#4da6ff', border: '#2196f3' },
  3: { key: 'air', name: 'Air', icon: '⚡', color: '#ffd54f', border: '#ffc107' },
  4: { key: 'earth', name: 'Earth', icon: '🌍', color: '#81c784', border: '#4caf50' },
  5: { key: 'astral', name: 'Astral', icon: '✨', color: '#ba68c8', border: '#9c27b0' },
};

const TARGET_LABELS: Record<number, string> = {
  [Tk.Foe]: 'Foe (Enemy)',
  [Tk.Ally]: 'Ally (Hero/Merc)',
  [Tk.Ground]: 'Ground Area',
  [Tk.Multi]: 'Multi-target',
  [Tk.Self]: 'Self (Caster)',
  [Tk.Corpse]: 'Corpse',
};

const STATUS_LABELS: Record<number, string> = {
  [St.Bless]: 'Blessing (Combat buff)',
  [St.Shield]: 'Protective Shield',
  [St.Haste]: 'Haste (Speed boost)',
  [St.Slow]: 'Frost Slow (-50% speed)',
  [St.Poison]: 'Poison (Lingering damage)',
  [St.Burn]: 'Burning (Damage over time)',
  [St.Stone]: 'Stone Petrifaction (Stun)',
  [St.Weaken]: 'Weaken (Debuff)',
};

export class PauseMenu {
  private readonly root: HTMLElement;
  private view: MenuView = 'main';
  private sphereFilter: SphereFilter = 'all';

  constructor(private readonly ctx: PauseMenuCtx) {
    let el = document.getElementById('pause-menu');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pause-menu';
      document.body.append(el);
    }
    this.root = el;
    this.root.className = 'pause-menu';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Game Paused');
    this.root.hidden = true;

    // Close when clicking the dark backdrop outside the modal
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) {
        this.ctx.resume();
      }
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(initialView: MenuView = 'main'): void {
    this.view = initialView;
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
    this.view = 'main';
  }

  toggle(): void {
    if (this.isOpen) {
      this.ctx.resume();
    } else {
      this.open();
    }
  }

  handleEscape(): boolean {
    if (!this.isOpen) return false;
    if (this.view !== 'main') {
      this.view = 'main';
      this.render();
      return true;
    }
    this.ctx.resume();
    return true;
  }

  private render(): void {
    this.root.replaceChildren();

    const modal = document.createElement('div');
    modal.className = 'pause-modal';

    switch (this.view) {
      case 'main':
        this.renderMain(modal);
        break;
      case 'controls':
        this.renderControls(modal);
        break;
      case 'codex':
        this.renderCodex(modal);
        break;
      case 'settings':
        this.renderSettings(modal);
        break;
    }

    this.root.append(modal);
  }

  // ==========================================
  // VIEW: MAIN PAUSE MENU
  // ==========================================
  private renderMain(modal: HTMLElement): void {
    // Header
    const head = document.createElement('div');
    head.className = 'pause-head';

    const titleBox = document.createElement('div');
    titleBox.className = 'pause-title-box';

    const h2 = document.createElement('h2');
    h2.className = 'pause-title';
    h2.textContent = 'Game Paused';

    const divider = document.createElement('div');
    divider.className = 'gothic-divider';
    divider.innerHTML = '<span class="filigree-line"></span><span class="filigree-glyph">❖</span><span class="filigree-line"></span>';

    titleBox.append(h2, divider);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pause-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Resume Game (ESC)');
    closeBtn.onclick = () => this.ctx.resume();

    head.append(titleBox, closeBtn);

    // Body with buttons
    const body = document.createElement('div');
    body.className = 'pause-body pause-main-body';

    const menuList = document.createElement('div');
    menuList.className = 'pause-menu-list';

    const items: Array<{ icon: string; title: string; subtitle: string; badge?: string; action: () => void }> = [
      {
        icon: '⚔',
        title: 'Resume Game',
        subtitle: 'Return to battle and adventure',
        badge: 'ESC',
        action: () => this.ctx.resume(),
      },
      {
        icon: '📜',
        title: 'Controls & Hotkeys',
        subtitle: 'Keybinds cheatsheet, potions & shortcuts',
        action: () => {
          this.view = 'controls';
          this.render();
        },
      },
      {
        icon: '🎮',
        title: 'Controller Skill Assignment',
        subtitle: 'Bind spells & skills to the 12 Gamepad / DualSense slots',
        action: () => {
          this.close();
          this.ctx.openSkillAssignment?.();
        },
      },
      {
        icon: '🔮',
        title: 'Magic & Spells Codex',
        subtitle: 'The 5 Spheres, spell trees & casting rules',
        action: () => {
          this.view = 'codex';
          this.render();
        },
      },
      {
        icon: '⚙',
        title: 'Settings (Audio & Display)',
        subtitle: 'Volumes, visual quality & auto-recenter camera',
        action: () => {
          this.view = 'settings';
          this.render();
        },
      },
      {
        icon: '💾',
        title: 'Save Game / Load Game',
        subtitle: 'Manage campaign save slots and exports',
        action: () => this.ctx.openSaves(),
      },
      {
        icon: '🚪',
        title: 'Save and Exit',
        subtitle: 'Save character progress & return safely to Town Hub',
        badge: 'HUB',
        action: () => {
          if (this.ctx.saveAndExit) this.ctx.saveAndExit();
          else this.ctx.exitToMain();
        },
      },
      {
        icon: '↩',
        title: 'Exit to Main Menu',
        subtitle: 'Return to title shell',
        action: () => this.ctx.exitToMain(),
      },
    ];

    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pause-btn';
      btn.onclick = item.action;

      const iconSpan = document.createElement('span');
      iconSpan.className = 'pause-btn-icon';
      iconSpan.textContent = item.icon;

      const textBox = document.createElement('div');
      textBox.className = 'pause-btn-text';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'pause-btn-title';
      titleSpan.textContent = item.title;

      const subSpan = document.createElement('small');
      subSpan.className = 'pause-btn-sub';
      subSpan.textContent = item.subtitle;

      textBox.append(titleSpan, subSpan);
      btn.append(iconSpan, textBox);

      if (item.badge) {
        const badgeSpan = document.createElement('kbd');
        badgeSpan.className = 'pause-btn-badge';
        badgeSpan.textContent = item.badge;
        btn.append(badgeSpan);
      }

      menuList.append(btn);
    });

    body.append(menuList);
    modal.append(head, body);
  }

  // ==========================================
  // VIEW: CONTROLS & HOTKEYS
  // ==========================================
  private renderControls(modal: HTMLElement): void {
    const head = this.createSubHead('⚔ Controls & Hotkeys');
    const body = document.createElement('div');
    body.className = 'pause-body pause-controls-body';

    const intro = document.createElement('p');
    intro.className = 'pause-intro-note';
    intro.textContent = 'Command your hero and mercenaries seamlessly with mouse, touch gestures, keyboard hotkeys, and Gamepad / PS5 DualSense controllers.';
    body.append(intro);

    const sections: Array<{
      category: string;
      icon: string;
      keys: Array<{ key: string; label: string; detail: string }>;
    }> = [
      {
        category: 'Hero Movement & Targeting',
        icon: '🧭',
        keys: [
          { key: 'WASD / RMB', label: 'Move Hero', detail: 'Walk hero towards destination. Right-Click gives instant move-to.' },
          { key: 'LMB', label: 'Attack / Interact / Loot', detail: 'Strike targeted foe, talk to townsfolk, or pick up ground items.' },
          { key: 'Space', label: 'Recenter Camera', detail: 'Instantly refocus the viewport camera directly onto your hero.' },
        ],
      },
      {
        category: 'Gamepad & DualSense Controller Layout',
        icon: '🎮',
        keys: [
          { key: 'Left Stick', label: '360° Hero Movement', detail: 'Direct analog real-time movement for your hero and company.' },
          { key: 'Right Stick', label: 'Camera Pan / Aiming', detail: 'Smooth analog camera panning and directional aim.' },
          { key: '✕', label: 'Primary Action / Attack / Move', detail: 'Slot 0: Strike nearest enemy, interact, or advance forward.' },
          { key: '▢', label: 'Action Bar Skill 1', detail: 'Slot 1: Quick cast assigned primary skill/spell.' },
          { key: '△', label: 'Action Bar Skill 2', detail: 'Slot 2: Quick cast assigned secondary offensive spell.' },
          { key: '◯', label: 'Action Bar Skill 3', detail: 'Slot 3: Quick cast defensive or healing ability.' },
          { key: 'R1', label: 'Action Bar Skill 4', detail: 'Slot 4: Quick cast special grimoire spell.' },
          { key: 'R2', label: 'Action Bar Skill 5', detail: 'Slot 5: Quick cast ultimate or area-of-effect spell.' },
          { key: 'L2 (Hold)', label: 'Secondary Skill Bar (Modifier)', detail: 'Hold L2 to switch to secondary 6 slots: L2+✕, L2+▢, L2+△, L2+◯, L2+R1, L2+R2.' },
          { key: 'D-Pad Up', label: 'Potion 1 (Health)', detail: 'Quaff Belt Potion 1 (Healing Draught) for immediate HP restoration.' },
          { key: 'D-Pad Right', label: 'Potion 2 (Mana)', detail: 'Quaff Belt Potion 2 (Mana Draught) to replenish mana reserves.' },
          { key: 'D-Pad Down', label: 'Potion 3 (Rejuvenation)', detail: 'Quaff Belt Potion 3 (Greater Healing / Rejuvenation / Buffs).' },
          { key: 'D-Pad Left', label: 'Potion 4 (Utility / Portal)', detail: 'Use Belt Potion 4 (Elixirs / Utility Draughts).' },
          { key: 'R3', label: 'Highlight Ground Loot', detail: 'Right stick click: Toggle ground item pillars with rarity color beams.' },
          { key: 'Touchpad', label: 'Inventory / Hero Sheet', detail: 'DualSense touchpad click: Toggle character equipment and backpack.' },
          { key: 'Options', label: 'Game Menu (Save & Exit)', detail: 'Pause simulation cleanly and access Gothic game options.' },
          { key: 'Share / Select', label: 'Quest Journal', detail: 'View current chapter objectives, subquests, and campaign progress.' },
          { key: 'L1', label: 'Select Hero / Rebind Skills', detail: 'Center viewport on hero or access controller skill assignment.' },
        ],
      },
      {
        category: 'Belt & Survival',
        icon: '🧪',
        keys: [
          { key: '1, 2, 3, 4', label: 'Drink Belt Potions', detail: 'Quaff potions: 1 = Healing Draught, 2 = Mana Draught, 3 = Rejuvenation, 4 = Elixirs.' },
          { key: 'ALT (Hold)', label: 'Highlight Ground Loot', detail: 'Reveal and highlight all dropped loot pillars on ground with rarity glow colors.' },
        ],
      },
      {
        category: 'Panels & Codex Screens',
        icon: '📜',
        keys: [
          { key: 'Q', label: 'Quest Journal / Objectives', detail: 'Toggle HUD quest tracker banner [Q/O] or open full Quest Journal.' },
          { key: 'M', label: 'Toggle Minimap Size', detail: 'Toggle minimap between compact tactical view and large strategic overview.' },
          { key: 'Tab', label: 'Vector Automap Overlay', detail: 'Toggle semi-transparent full-screen tactical vector automap.' },
          { key: 'I', label: 'Inventory & Equipment', detail: 'Open Hero pack, equipment slots, gear inspect, and Hall of Relics Codex.' },
          { key: 'S', label: 'Spellbook & Spheres', detail: 'Open your learned Grimoire to view and cast spells or assign them to quick slots.' },
          { key: 'C', label: 'Character Stats', detail: 'Toggle detailed attributes (Body, Agility, Mind, Spirit) and combat ratings.' },
          { key: 'ESC', label: 'Pause / Game Menu', detail: 'Pause the game simulation cleanly and open this Gothic Codex menu.' },
        ],
      },
      {
        category: 'Combat & Spells Quickbar',
        icon: '⚡',
        keys: [
          { key: 'F4 - F12', label: 'Quickbar Slots 1-9', detail: 'Cast assigned spells or use quickbar scrolls & potions directly.' },
          { key: 'Ctrl + A', label: 'Toggle Autocast', detail: 'Set current armed spell to automatically cast on enemies in range.' },
          { key: '1 - 9 (Ctrl/Alt)', label: 'Squad Groups', detail: 'Ctrl+Num saves selection to group; Shift+Num adds; Num recalls group.' },
          { key: 'F3', label: 'Diagnostic Overlay', detail: 'Toggle technical frame timings, unit counts, coordinates and state hash.' },
        ],
      },
    ];

    sections.forEach((sec) => {
      const box = document.createElement('div');
      box.className = 'pause-section-box';

      const secTitle = document.createElement('h3');
      secTitle.className = 'pause-sec-title';
      secTitle.innerHTML = `<span class="sec-icon">${sec.icon}</span> ${sec.category}`;
      box.append(secTitle);

      const table = document.createElement('div');
      table.className = 'pause-hotkey-table';

      sec.keys.forEach((k) => {
        const row = document.createElement('div');
        row.className = 'pause-hotkey-row';

        const kbdBox = document.createElement('div');
        kbdBox.className = 'pause-kbd-box';

        // Split multi-keys like "WASD / RMB" or "1, 2, 3, 4" into nice badges
        const keyParts = k.key.split(/(\s*[/,]\s*)/);
        keyParts.forEach((part) => {
          if (part === '/' || part === ',') {
            const sep = document.createElement('span');
            sep.className = 'kbd-sep';
            sep.textContent = part;
            kbdBox.append(sep);
          } else if (part.trim()) {
            const kbd = document.createElement('kbd');
            kbd.className = 'gothic-kbd';
            kbd.textContent = part.trim();
            kbdBox.append(kbd);
          }
        });

        const descBox = document.createElement('div');
        descBox.className = 'pause-hotkey-desc';

        const nameSpan = document.createElement('b');
        nameSpan.textContent = k.label;

        const detailSpan = document.createElement('span');
        detailSpan.className = 'pause-hotkey-detail';
        detailSpan.textContent = k.detail;

        descBox.append(nameSpan, detailSpan);
        row.append(kbdBox, descBox);
        table.append(row);
      });

      box.append(table);
      body.append(box);
    });

    // 5. Interactive Custom Keyboard Remapping Table
    const customBox = document.createElement('div');
    customBox.className = 'pause-rebind-container';

    const customTitle = document.createElement('h3');
    customTitle.className = 'pause-sec-title';
    customTitle.innerHTML = '<span class="sec-icon">⚙️</span> Custom Key Rebinding';

    const customHeaderRow = document.createElement('div');
    customHeaderRow.style.display = 'flex';
    customHeaderRow.style.justifyContent = 'space-between';
    customHeaderRow.style.alignItems = 'center';
    customHeaderRow.style.marginBottom = '8px';

    const customDesc = document.createElement('small');
    customDesc.className = 'pause-sec-desc';
    customDesc.textContent = 'Click [Rebind] on any action, then press your preferred key on your keyboard.';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'pause-reset-btn';
    resetBtn.textContent = '↺ Reset to Defaults';
    resetBtn.onclick = () => {
      keybindManager.resetDefaults();
      this.render();
    };

    customHeaderRow.append(customDesc, resetBtn);
    customBox.append(customTitle, customHeaderRow);

    const rebindTable = document.createElement('div');
    rebindTable.className = 'pause-hotkey-table';

    DEFAULT_KEYBINDS.forEach((action) => {
      const row = document.createElement('div');
      row.className = 'pause-hotkey-row rebind-row';

      const bind = keybindManager.getBinding(action.id);

      const kbdBox = document.createElement('div');
      kbdBox.className = 'pause-kbd-box';
      const kbd = document.createElement('kbd');
      kbd.className = 'gothic-kbd';
      kbd.textContent = bind.key;
      kbdBox.append(kbd);

      const descBox = document.createElement('div');
      descBox.className = 'pause-hotkey-desc';
      const nameSpan = document.createElement('b');
      nameSpan.textContent = action.label;
      const detailSpan = document.createElement('span');
      detailSpan.className = 'pause-hotkey-detail';
      detailSpan.textContent = action.detail;
      descBox.append(nameSpan, detailSpan);

      const rebindBtn = document.createElement('button');
      rebindBtn.type = 'button';
      rebindBtn.className = 'pause-rebind-btn';
      rebindBtn.textContent = 'Rebind';

      rebindBtn.onclick = () => {
        rebindBtn.textContent = 'Press key...';
        rebindBtn.classList.add('listening');

        const keyListener = (e: KeyboardEvent) => {
          e.preventDefault();
          e.stopPropagation();
          window.removeEventListener('keydown', keyListener, true);
          let keyDisplay = e.key.toUpperCase();
          if (e.code === 'Space') keyDisplay = 'Space';
          else if (e.code === 'Escape') keyDisplay = 'ESC';
          else if (e.code.startsWith('Digit')) keyDisplay = e.code.replace('Digit', '');
          else if (e.code.startsWith('Key')) keyDisplay = e.code.replace('Key', '');

          keybindManager.setBinding(action.id, keyDisplay, e.code);
          this.render();
        };

        window.addEventListener('keydown', keyListener, true);
      };

      row.append(kbdBox, descBox, rebindBtn);
      rebindTable.append(row);
    });

    customBox.append(rebindTable);
    body.append(customBox);

    modal.append(head, body);
  }

  // ==========================================
  // VIEW: MAGIC & SPELLS CODEX
  // ==========================================
  private renderCodex(modal: HTMLElement): void {
    const head = this.createSubHead('🔮 Magic & Spells Codex');
    const body = document.createElement('div');
    body.className = 'pause-body pause-codex-body';

    // 1. Lore & Mechanics Guide Cards
    const loreSection = document.createElement('div');
    loreSection.className = 'codex-lore-section';

    const loreCards = [
      {
        icon: '🌌',
        title: 'The Five Spheres of Magic',
        text: 'All arcane forces in Thornvael flow from five primordial spheres:\n' +
          '• 🔥 Fire: Raw destruction, searing burst damage, and persistent burning status.\n' +
          '• 💧 Water: Restorative life healing, freezing frost bolts, and chilling area blizzards.\n' +
          '• ⚡ Air: Lightning strikes, jumping chain voltage, and supernatural haste enchantments.\n' +
          '• 🌍 Earth: Enduring stone armor, petrifying stuns, seismic quakes, and corrosive acid.\n' +
          '• ✨ Astral: Cosmic benedictions, enemy mind weakenings, corpse explosions, and temporal warps.',
      },
      {
        icon: '⚡',
        title: 'How to Cast Spells',
        text: 'To unleash magic in combat:\n' +
          '1. Assign spells from your Grimoire (S) to the Quickbar slots (F4-F12 or bottom buttons).\n' +
          '2. Click or tap a Quickbar slot to arm the spell (crosshair reticle appears).\n' +
          '3. Target an enemy (Foe), friendly unit (Ally), ground point (Area), or fallen corpse.\n' +
          '4. Press Ctrl+A while a spell is armed to enable Autocast when foes come in range.',
      },
      {
        icon: '📜',
        title: 'How to Learn New Spells & The Scroll System',
        text: 'New magic cannot be conjured from thin air — it must be studied and transcribed:\n' +
          '• Ancient Spell Scrolls & Grimoires: Discovered in hidden wilderness chests, dropped by rare bosses, or purchased from Town Arcanists.\n' +
          '• Inscribing: Using a Spell Scroll from your pack consumes the scroll and permanently records the spell into your Grimoire.\n' +
          '• Requirements: Advanced spells demand sufficient Mind and Spirit attributes to cast effectively.',
      },
      {
        icon: '💧',
        title: 'Mana Management & Regeneration',
        text: 'Casting spells expends Mana reserves:\n' +
          '• Natural Recovery: Mana constantly regenerates over time based on your hero\'s Mind and Spirit attributes.\n' +
          '• Blue Mana Draughts: Drink belt potions (Key 2) for rapid mana replenishment during frantic boss encounters.\n' +
          '• Shrines of Restoration: Ancient shrines dotting the wilderness fully restore Mana and Health when activated.',
      },
    ];

    loreCards.forEach((c) => {
      const card = document.createElement('div');
      card.className = 'codex-lore-card';

      const cardHead = document.createElement('h4');
      cardHead.className = 'codex-card-title';
      cardHead.innerHTML = `<span class="lore-icon">${c.icon}</span> ${c.title}`;

      const cardBody = document.createElement('p');
      cardBody.className = 'codex-card-text';
      cardBody.textContent = c.text;

      card.append(cardHead, cardBody);
      loreSection.append(card);
    });

    body.append(loreSection);

    // 2. Interactive Spheres & Spell Tree Section
    const treeHeader = document.createElement('div');
    treeHeader.className = 'codex-tree-header';

    const treeTitle = document.createElement('h3');
    treeTitle.className = 'pause-sec-title';
    treeTitle.innerHTML = '<span class="sec-icon">📖</span> Grimoire Spell Tree & Spheres';

    // Sphere Filter Tabs
    const filterBar = document.createElement('div');
    filterBar.className = 'codex-filter-bar';

    const filters: Array<{ id: SphereFilter; label: string }> = [
      { id: 'all', label: 'All Spheres' },
      { id: 'fire', label: '🔥 Fire' },
      { id: 'water', label: '💧 Water' },
      { id: 'air', label: '⚡ Air' },
      { id: 'earth', label: '🌍 Earth' },
      { id: 'astral', label: '✨ Astral' },
    ];

    filters.forEach((f) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `codex-filter-tab ${this.sphereFilter === f.id ? 'active' : ''}`;
      btn.textContent = f.label;
      btn.onclick = () => {
        this.sphereFilter = f.id;
        this.render();
      };
      filterBar.append(btn);
    });

    treeHeader.append(treeTitle, filterBar);
    body.append(treeHeader);

    // Spells Grid
    const grid = document.createElement('div');
    grid.className = 'codex-spells-grid';

    const knownMask = this.ctx.heroKnownSpells();

    SPELLS.forEach((spell: SpellDef, sid: number) => {
      const school = SCHOOL_META[spell.school];
      if (!school) return;
      if (this.sphereFilter !== 'all' && school.key !== this.sphereFilter) return;

      const isKnown = knownMask(sid);
      const isApex = sid >= 24;

      const card = document.createElement('div');
      card.className = `codex-spell-card ${isKnown ? 'known' : 'unlearned'} ${isApex ? 'apex' : ''}`;
      card.style.borderLeftColor = school.color;

      // Card Header
      const sHead = document.createElement('div');
      sHead.className = 'spell-card-head';

      const sTitle = document.createElement('div');
      sTitle.className = 'spell-card-name';
      sTitle.innerHTML = `<span class="spell-school-icon">${school.icon}</span> <b>${spell.name}</b>`;

      const sBadge = document.createElement('span');
      sBadge.className = `spell-status-badge ${isKnown ? 'known-badge' : 'scroll-badge'}`;
      sBadge.textContent = isKnown ? '✓ Learned' : '📜 Scroll Required';

      sHead.append(sTitle, sBadge);

      // Card Attributes Line
      const sStats = document.createElement('div');
      sStats.className = 'spell-card-stats';
      sStats.innerHTML = `
        <span title="Mana Cost">💧 ${spell.cost} Mana</span>
        <span title="Cooldown">⏱ ${spell.cd} ticks</span>
        <span title="Range">🎯 Range: ${spell.reach || 'Self'}</span>
        <span title="Target Kind">👥 ${TARGET_LABELS[spell.tk] ?? 'Target'}</span>
      `;

      // Effect Description
      const sEffect = document.createElement('div');
      sEffect.className = 'spell-card-effect';

      const effects: string[] = [];
      if (spell.heal) {
        effects.push(`Heals ${spell.min}-${spell.max} HP`);
      } else if (spell.min > 0 || spell.max > 0) {
        effects.push(`Deals ${spell.min}-${spell.max} ${school.name} Damage`);
      }
      if (spell.radius > 0) {
        effects.push(`Area Radius: ${spell.radius} tiles`);
      }
      if (spell.count > 0) {
        effects.push(`Strikes up to ${spell.count} targets`);
      }
      if (spell.st >= 0 && STATUS_LABELS[spell.st]) {
        effects.push(`Inflicts ${STATUS_LABELS[spell.st]} for ${spell.dur}s`);
      }
      if (spell.val > 0 && spell.st === St.Shield) {
        effects.push(`Shield absorption: ${spell.val} damage`);
      } else if (spell.val > 0 && sid === 23) { // Meditation
        effects.push(`Instantly restores ${spell.val} Mana`);
      }

      sEffect.textContent = effects.join(' · ') || 'Mystical enchantment.';

      card.append(sHead, sStats, sEffect);
      grid.append(card);
    });

    body.append(grid);
    modal.append(head, body);
  }

  // ==========================================
  // VIEW: SETTINGS
  // ==========================================
  private renderSettings(modal: HTMLElement): void {
    const head = this.createSubHead('⚙ Settings (Audio & Display)');
    const body = document.createElement('div');
    body.className = 'pause-body pause-settings-body';

    // 1. Audio Section
    const audioBox = document.createElement('div');
    audioBox.className = 'pause-section-box';

    const audioTitle = document.createElement('h3');
    audioTitle.className = 'pause-sec-title';
    audioTitle.innerHTML = '<span class="sec-icon">🔊</span> Audio & Soundtracks';
    audioBox.append(audioTitle);

    // Master Volume
    const masterRow = this.createSliderRow(
      'Master Volume',
      Math.round(getMasterVolume() * 100),
      (val) => {
        setMasterVolume(val / 100);
        try { localStorage.setItem('thornvael.masterVol', String(val / 100)); } catch {}
      }
    );

    // SFX Volume
    const sfxRow = this.createSliderRow(
      'Sound Effects (SFX)',
      Math.round(getSfxVolume() * 100),
      (val) => {
        setSfxVolume(val / 100);
        try { localStorage.setItem('thornvael.sfxVol', String(val / 100)); } catch {}
      },
      {
        toggleLabel: this.ctx.isSfxOn() ? 'Mute' : 'Unmute',
        onToggle: () => {
          this.ctx.toggleSfx();
          this.render();
        },
      }
    );

    // Music Volume
    const musicRow = this.createSliderRow(
      'Ambient Music & Town Cues',
      Math.round(getMusicVolume() * 100),
      (val) => {
        setMusicVolume(val / 100);
        try { localStorage.setItem('thornvael.musicVol', String(val / 100)); } catch {}
      },
      {
        toggleLabel: this.ctx.isMusicOn() ? 'Mute' : 'Unmute',
        onToggle: () => {
          this.ctx.toggleMusic();
          this.render();
        },
      }
    );

    audioBox.append(masterRow, sfxRow, musicRow);

    // 2. Display & Graphics Section
    const displayBox = document.createElement('div');
    displayBox.className = 'pause-section-box';

    const displayTitle = document.createElement('h3');
    displayTitle.className = 'pause-sec-title';
    displayTitle.innerHTML = '<span class="sec-icon">🖥</span> Display & Graphics';
    displayBox.append(displayTitle);

    const qualityRow = document.createElement('div');
    qualityRow.className = 'pause-setting-row';

    const qLabel = document.createElement('div');
    qLabel.className = 'pause-setting-label';
    qLabel.innerHTML = '<b>Graphics Quality</b><small>Adjust rendering resolution and visual particle effects</small>';

    const qButtons = document.createElement('div');
    qButtons.className = 'pause-segmented-control';

    const currentQ = this.ctx.getQuality();
    const qualities: Array<{ q: number; label: string }> = [
      { q: 0, label: 'Retro (Low)' },
      { q: 1, label: 'Balanced (Med)' },
      { q: 2, label: 'Crisp (High)' },
    ];

    qualities.forEach((item) => {
      const qb = document.createElement('button');
      qb.type = 'button';
      qb.className = `segmented-btn ${currentQ === item.q ? 'active' : ''}`;
      qb.textContent = item.label;
      qb.onclick = () => {
        this.ctx.setQuality(item.q);
        this.render();
      };
      qButtons.append(qb);
    });

    qualityRow.append(qLabel, qButtons);

    const weatherRow = document.createElement('div');
    weatherRow.className = 'pause-setting-row';

    const weatherLabel = document.createElement('div');
    weatherLabel.className = 'pause-setting-label';
    weatherLabel.innerHTML = '<b>Weather & Atmospheric VFX</b><small>Biome rain, drifting sand, cave spores and infernal embers</small>';

    const weatherToggle = document.createElement('button');
    weatherToggle.type = 'button';
    const isWeather = this.ctx.isWeatherOn?.() ?? true;
    weatherToggle.className = `pause-toggle-btn ${isWeather ? 'on' : ''}`;
    weatherToggle.textContent = isWeather ? 'ON' : 'OFF';
    weatherToggle.onclick = () => {
      this.ctx.setWeather?.(!isWeather);
      this.render();
    };

    weatherRow.append(weatherLabel, weatherToggle);
    displayBox.append(qualityRow, weatherRow);

    // 3. Gameplay & Camera Section
    const gameBox = document.createElement('div');
    gameBox.className = 'pause-section-box';

    const gameTitle = document.createElement('h3');
    gameTitle.className = 'pause-sec-title';
    gameTitle.innerHTML = '<span class="sec-icon">🎮</span> Gameplay & Camera';
    gameBox.append(gameTitle);

    const cameraRow = document.createElement('div');
    cameraRow.className = 'pause-setting-row';

    const camLabel = document.createElement('div');
    camLabel.className = 'pause-setting-label';
    camLabel.innerHTML = '<b>Auto-recenter Camera</b><small>Keep camera viewport centered smoothly on your hero as you walk</small>';

    const camToggle = document.createElement('button');
    camToggle.type = 'button';
    const isAutoCam = this.ctx.getAutoRecenter();
    camToggle.className = `pause-toggle-btn ${isAutoCam ? 'on' : ''}`;
    camToggle.textContent = isAutoCam ? 'ON' : 'OFF';
    camToggle.onclick = () => {
      this.ctx.setAutoRecenter(!isAutoCam);
      this.render();
    };

    cameraRow.append(camLabel, camToggle);

    const stickRow = document.createElement('div');
    stickRow.className = 'pause-setting-row';

    const stickLabel = document.createElement('div');
    stickLabel.className = 'pause-setting-label';
    stickLabel.innerHTML = '<b>Virtual Movement Stick (Touch / Mobile)</b><small>On-screen translucent 360° joystick for direct hero movement</small>';

    const stickToggle = document.createElement('button');
    stickToggle.type = 'button';
    const isStick = this.ctx.isVirtualStickOn?.() ?? false;
    stickToggle.className = `pause-toggle-btn ${isStick ? 'on' : ''}`;
    stickToggle.textContent = isStick ? 'ON' : 'OFF';
    stickToggle.onclick = () => {
      this.ctx.setVirtualStick?.(!isStick);
      this.render();
    };

    stickRow.append(stickLabel, stickToggle);
    gameBox.append(cameraRow, stickRow);

    body.append(audioBox, displayBox, gameBox);
    modal.append(head, body);
  }

  // ==========================================
  // HELPERS
  // ==========================================
  private createSubHead(title: string): HTMLElement {
    const head = document.createElement('div');
    head.className = 'pause-head pause-sub-head';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'pause-nav-btn';
    backBtn.innerHTML = '← Back to Menu';
    backBtn.onclick = () => {
      this.view = 'main';
      this.render();
    };

    const h2 = document.createElement('h2');
    h2.className = 'pause-sub-title';
    h2.textContent = title;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pause-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Resume Game (ESC)');
    closeBtn.onclick = () => this.ctx.resume();

    head.append(backBtn, h2, closeBtn);
    return head;
  }

  private createSliderRow(
    label: string,
    initialVal: number,
    onChange: (val: number) => void,
    toggle?: { toggleLabel: string; onToggle: () => void }
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'pause-setting-row';

    const labelBox = document.createElement('div');
    labelBox.className = 'pause-setting-label';
    labelBox.innerHTML = `<b>${label}</b>`;

    const ctrlBox = document.createElement('div');
    ctrlBox.className = 'pause-slider-ctrl';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(initialVal);
    slider.className = 'pause-range';

    const valSpan = document.createElement('span');
    valSpan.className = 'pause-slider-val';
    valSpan.textContent = `${initialVal}%`;

    slider.oninput = () => {
      const v = Number(slider.value);
      valSpan.textContent = `${v}%`;
      onChange(v);
    };

    ctrlBox.append(slider, valSpan);

    if (toggle) {
      const tBtn = document.createElement('button');
      tBtn.type = 'button';
      tBtn.className = 'pause-mute-btn';
      tBtn.textContent = toggle.toggleLabel;
      tBtn.onclick = toggle.onToggle;
      ctrlBox.append(tBtn);
    }

    row.append(labelBox, ctrlBox);
    return row;
  }
}
