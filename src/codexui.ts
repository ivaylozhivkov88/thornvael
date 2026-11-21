import {
  exportGrailState,
  getAllBestiaryLore,
  getGrailCatalog,
  getGrailDropClue,
  getGrailEntry,
  getGrailMilestoneBoons,
  getPinnedGrailTargets,
  hydrateCodexBestiary,
  importGrailState,
  isGrailDiscovered,
  togglePinGrailTarget,
} from './codex';
import { formatItemTooltip } from './heroui';
import { getCodexLore, getMonsterCodex } from './missioncontent';
import { S } from './strings';
import { itemIconEl } from './townicons';

/**
 * Hall of Relics & Imperial Reliquary UI for Thornvael (Holy Grail v2).
 * Displays 5 Grail Tomes, Target-Farming Clues, Roll Perfection, Provenance, and Milestones.
 */

export type CodexFilter =
  | 'all'
  | 'uniques'
  | 'sets'
  | 'runewords'
  | 'trophies'
  | 'armory'
  | 'pinned'
  | 'chronicles'
  | 'bestiary';

export class CodexUi {
  private overlay: HTMLElement | null = null;
  private filter: CodexFilter = 'all';

  constructor(private readonly tipOn?: (el: HTMLElement, tip: string) => void) {}

  show(): void {
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.className = 'sheet codex-sheet';
      document.body.append(this.overlay);
    }
    this.ensureStyles();
    this.render();
    this.overlay.hidden = false;
    const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : './';
    void hydrateCodexBestiary(base)
      .then(() => {
        if (this.overlay && !this.overlay.hidden && this.filter === 'bestiary') {
          this.render();
        }
      })
      .catch(() => undefined);
  }

  hide(): void {
    if (this.overlay) this.overlay.hidden = true;
  }

  toggle(): void {
    if (this.overlay && !this.overlay.hidden) this.hide();
    else this.show();
  }

  private ensureStyles(): void {
    if (document.getElementById('codex-grail-sheet-style')) return;
    const style = document.createElement('style');
    style.id = 'codex-grail-sheet-style';
    style.textContent = `
      .codex-sheet {
        position: fixed;
        inset: 2dvh 3vw;
        max-height: 96dvh;
        height: 96dvh;
        display: flex;
        flex-direction: column;
        background: radial-gradient(circle at 50% 10%, #1a1426 0%, #0c0914 100%);
        border: 2px solid #5a4220;
        box-shadow: 0 0 35px rgba(0, 0, 0, 0.9), inset 0 0 25px rgba(212, 175, 55, 0.12);
        border-radius: 8px;
        color: #e2d9c8;
        z-index: 1000;
        box-sizing: border-box;
        overflow: hidden;
        font-family: 'Cinzel', 'Trajan Pro', Georgia, serif;
      }
      .codex-head {
        flex: 0 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 18px 8px;
        border-bottom: 1px solid #423018;
        background: rgba(20, 15, 30, 0.85);
      }
      .codex-head-titles {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .codex-head-titles h2 {
        margin: 0;
        font-size: 17px;
        color: #fef08a;
        letter-spacing: 1px;
        text-shadow: 0 0 8px rgba(212, 175, 55, 0.5);
      }
      .codex-sub-line {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 11px;
        color: #c4b5a0;
      }
      .codex-boon-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        color: #ffd700;
        background: rgba(80, 50, 10, 0.5);
        padding: 2px 7px;
        border-radius: 4px;
        border: 1px solid #785a20;
        font-weight: bold;
      }
      .codex-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .codex-btn-sm {
        background: #261910;
        color: #d4af37;
        border: 1px solid #5e411f;
        padding: 4px 9px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .codex-btn-sm:hover {
        background: #4a341e;
        border-color: #ffd700;
        color: #fff;
      }
      .codex-close {
        background: #361010;
        color: #ff9999;
        border: 1px solid #7a2222;
        width: 28px;
        height: 28px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
      }
      .codex-close:hover {
        background: #501616;
        color: #fff;
      }
      .codex-meter {
        flex: 0 0 auto;
        margin: 4px 18px 6px;
        height: 7px;
        background: #140d1c;
        border: 1px solid #3d2916;
        border-radius: 4px;
        overflow: hidden;
      }
      .codex-meter i {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, #7c3aed, #d97706, #ffd700);
        transition: width 0.3s ease;
      }
      .codex-filters {
        flex: 0 0 auto;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 4px 18px 8px;
        border-bottom: 1px solid #2e2015;
      }
      .codex-tab {
        background: #171120;
        color: #b5a48e;
        border: 1px solid #3d2b1a;
        padding: 4px 9px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .codex-tab:hover {
        background: #2c1e13;
        color: #e5d7c4;
      }
      .codex-tab.active {
        background: #452e16;
        color: #ffd700;
        border-color: #ffd700;
        font-weight: bold;
        box-shadow: 0 0 8px rgba(212, 175, 55, 0.4);
      }
      .codex-grid {
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 10px 18px 16px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
        gap: 10px;
      }
      .grail-card {
        position: relative;
        background: #120d1a;
        border: 1px solid #332213;
        border-radius: 6px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 11px;
        transition: transform 0.12s, border-color 0.12s;
      }
      .grail-card:hover {
        transform: translateY(-2px);
        border-color: #7b5928;
      }
      .grail-card.discovered {
        border-color: #63451e;
        background: #150f21;
      }
      .grail-card.undiscovered {
        background: #0b0811;
        opacity: 0.88;
        border-color: #241910;
      }
      .grail-card.primal-perfect {
        border: 2px solid #a855f7 !important;
        background: radial-gradient(circle at top left, #271038, #11081b) !important;
        box-shadow: 0 0 12px rgba(168, 85, 247, 0.65), 0 0 5px #ffd700 !important;
        animation: grailPrimalPulse 2.4s infinite ease-in-out;
      }
      @keyframes grailPrimalPulse {
        0% { box-shadow: 0 0 6px rgba(168, 85, 247, 0.5), inset 0 0 6px rgba(255, 215, 0, 0.2); }
        50% { box-shadow: 0 0 16px rgba(168, 85, 247, 0.95), inset 0 0 14px rgba(255, 215, 0, 0.4); }
        100% { box-shadow: 0 0 6px rgba(168, 85, 247, 0.5), inset 0 0 6px rgba(255, 215, 0, 0.2); }
      }
      .grail-icon-box {
        width: 44px;
        height: 44px;
        margin: 2px auto;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .grail-icon-img {
        width: 44px;
        height: 44px;
        object-fit: contain;
        image-rendering: pixelated;
      }
      .grail-silhouette {
        filter: brightness(0) contrast(1.2) drop-shadow(0 0 3px rgba(212, 175, 55, 0.35));
      }
      .grail-item-title {
        font-weight: bold;
        font-size: 11.5px;
        color: #f3e8ff;
        text-align: center;
        line-height: 1.2;
      }
      .grail-item-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 9.5px;
        color: #9f8f7a;
      }
      .grail-perfection-badge {
        font-size: 9px;
        padding: 1px 5px;
        border-radius: 3px;
        font-weight: bold;
      }
      .grail-perfection-badge.primal {
        background: linear-gradient(90deg, #9333ea, #eab308);
        color: #fff;
        text-shadow: 0 0 3px #000;
      }
      .grail-perfection-badge.high {
        background: #3b280a;
        border: 1px solid #eab308;
        color: #ffd700;
      }
      .grail-perfection-badge.normal {
        background: #1c1420;
        color: #aaa;
        border: 1px solid #332438;
      }
      .grail-provenance {
        font-size: 9px;
        color: #8c7f6b;
        line-height: 1.25;
        margin-top: auto;
        padding-top: 3px;
        border-top: 1px dashed #2d1f14;
      }
      .grail-clue-box {
        font-size: 9px;
        color: #d4a373;
        background: rgba(30, 18, 8, 0.7);
        padding: 3px 5px;
        border-radius: 4px;
        border-left: 2px solid #8b5a2b;
        line-height: 1.2;
        margin-top: 2px;
      }
      .grail-pin-btn {
        margin-top: 4px;
        background: #201726;
        border: 1px solid #4b3459;
        color: #c4b5d0;
        padding: 2px 7px;
        font-size: 9.5px;
        border-radius: 3px;
        cursor: pointer;
        align-self: center;
        transition: all 0.15s ease;
      }
      .grail-pin-btn:hover {
        background: #351c45;
        color: #ffd700;
      }
      .grail-pin-btn.pinned {
        background: #5b21b6;
        border-color: #ffd700;
        color: #ffd700;
        font-weight: bold;
      }
    `;
    document.head.appendChild(style);
  }

  private render(): void {
    if (!this.overlay) return;
    this.overlay.replaceChildren();

    const boons = getGrailMilestoneBoons();
    const catalog = getGrailCatalog();
    const pinnedKeys = new Set(getPinnedGrailTargets());

    // Head
    const head = document.createElement('div');
    head.className = 'codex-head';

    const titleBox = document.createElement('div');
    titleBox.className = 'codex-head-titles';

    const h2 = document.createElement('h2');
    h2.textContent = '🏆 THE IMPERIAL RELIQUARY & HOLY GRAIL';

    const subLine = document.createElement('div');
    subLine.className = 'codex-sub-line';

    const titleBadge = document.createElement('span');
    titleBadge.className = 'codex-boon-badge';
    titleBadge.textContent = `👑 ${boons.title}`;

    const mfBadge = document.createElement('span');
    mfBadge.className = 'codex-boon-badge';
    mfBadge.textContent = `✨ +${boons.mfBonus}% Magic Find`;

    const countText = document.createElement('span');
    countText.textContent = `${boons.discoveredCount} / ${boons.totalCount} Relics (${boons.pct}%)`;

    subLine.append(titleBadge, mfBadge, countText);
    if (boons.toNextMilestone > 0 && boons.nextMilestonePct) {
      const nextText = document.createElement('span');
      nextText.style.color = '#eab308';
      nextText.textContent = `· Next Boon at ${boons.nextMilestonePct}% (${boons.toNextMilestone} more)`;
      subLine.append(nextText);
    }

    titleBox.append(h2, subLine);

    const actions = document.createElement('div');
    actions.className = 'codex-actions';

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'codex-btn-sm';
    exportBtn.textContent = '📥 Export';
    exportBtn.title = 'Export Holy Grail save data to JSON file';
    exportBtn.onclick = () => {
      const json = exportGrailState();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `thornvael-grail-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'codex-btn-sm';
    importBtn.textContent = '📤 Import';
    importBtn.title = 'Import Holy Grail save data from JSON file';
    importBtn.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        if (importGrailState(text)) {
          this.render();
        }
      };
      input.click();
    };

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'codex-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => this.hide();

    actions.append(exportBtn, importBtn, closeBtn);
    head.append(titleBox, actions);

    // Progress Bar Meter
    const meter = document.createElement('div');
    meter.className = 'meter codex-meter';
    const meterBar = document.createElement('i');
    meterBar.style.width = `${boons.pct}%`;
    meter.append(meterBar);

    // Filter Buttons
    const filters = document.createElement('div');
    filters.className = 'codex-filters';

    const tabs: [CodexFilter, string][] = [
      ['all', `All (${boons.discoveredCount}/${boons.totalCount})`],
      ['uniques', `👑 Uniques (${boons.uniquesProgress.discovered}/${boons.uniquesProgress.total})`],
      ['sets', `🛡️ Sets (${boons.setsProgress.discovered}/${boons.setsProgress.total})`],
      ['runewords', `⚡ Runes & Words (${boons.runewordsProgress.discovered}/${boons.runewordsProgress.total})`],
      ['trophies', `💀 Trophies (${boons.trophiesProgress.discovered}/${boons.trophiesProgress.total})`],
      ['armory', `⚔️ Armory (${boons.armoryProgress.discovered}/${boons.armoryProgress.total})`],
      ['pinned', `🎯 Pinned (${pinnedKeys.size}/3)`],
      ['chronicles', S.codex.tabs.chronicles],
      ['bestiary', S.codex.tabs.bestiary],
    ];

    tabs.forEach(([f, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.className = this.filter === f ? 'codex-tab active' : 'codex-tab';
      btn.onclick = () => {
        this.filter = f;
        this.render();
      };
      filters.append(btn);
    });

    if (this.filter === 'chronicles') {
      const loreList = document.createElement('div');
      loreList.className = 'codex-lore-list';
      for (const entry of S.codex.chronicles) {
        const card = document.createElement('article');
        card.className = 'codex-lore-entry';
        const title = document.createElement('h3');
        title.className = 'codex-lore-title';
        title.textContent = entry.title;
        const subTitle = document.createElement('div');
        subTitle.className = 'codex-lore-sub';
        subTitle.textContent = entry.subtitle;
        const p = document.createElement('p');
        p.className = 'codex-lore-text';
        p.textContent = entry.text;
        card.append(title, subTitle, p);
        loreList.append(card);
      }
      for (const e of getCodexLore()) {
        const card = document.createElement('article');
        card.className = 'codex-lore-entry';
        const title = document.createElement('h3');
        title.className = 'codex-lore-title';
        title.textContent = e.title;
        const subTitle = document.createElement('div');
        subTitle.className = 'codex-lore-sub';
        subTitle.textContent = `${e.category[0].toUpperCase()}${e.category.slice(1)}${e.act ? ` - Act ${e.act}` : ''}`;
        const p = document.createElement('p');
        p.className = 'codex-lore-text';
        p.textContent = e.body;
        card.append(title, subTitle, p);
        loreList.append(card);
      }
      this.overlay.append(head, meter, filters, loreList);
      return;
    }

    if (this.filter === 'bestiary') {
      const loreList = document.createElement('div');
      loreList.className = 'codex-lore-list';
      const seenNames = new Set<string>();
      const pack = getMonsterCodex();
      for (const m of pack) {
        seenNames.add(m.name.toLowerCase());
        const card = document.createElement('article');
        card.className = 'codex-lore-entry';
        const title = document.createElement('h3');
        title.className = 'codex-lore-title';
        title.textContent = m.name;
        const meta = document.createElement('div');
        meta.className = 'codex-bestiary-meta';
        for (const t of [
          m.weakness && `Weakness: ${m.weakness}`,
          m.special && `Special: ${typeof m.special === 'string' ? m.special : (m.special as { name?: string }).name}`,
        ]) {
          if (!t) continue;
          const b = document.createElement('span');
          b.className = 'codex-bestiary-badge';
          b.textContent = t;
          meta.append(b);
        }
        const p = document.createElement('p');
        p.className = 'codex-lore-text';
        p.textContent = m.codex;
        card.append(title, meta, p);
        loreList.append(card);
      }
      for (const entry of getAllBestiaryLore()) {
        if (seenNames.has(entry.name.toLowerCase())) continue;
        seenNames.add(entry.name.toLowerCase());
        const card = document.createElement('article');
        card.className = 'codex-lore-entry';
        const title = document.createElement('h3');
        title.className = 'codex-lore-title';
        title.textContent = entry.name;
        const meta = document.createElement('div');
        meta.className = 'codex-bestiary-meta';
        if (entry.weakness) {
          const b = document.createElement('span');
          b.className = 'codex-bestiary-badge';
          b.textContent = `Weakness: ${entry.weakness}`;
          meta.append(b);
        }
        const p = document.createElement('p');
        p.className = 'codex-lore-text';
        p.textContent = entry.lore;
        card.append(title, meta, p);
        loreList.append(card);
      }
      this.overlay.append(head, meter, filters, loreList);
      return;
    }

    // Grid of Grail Items
    const grid = document.createElement('div');
    grid.className = 'codex-grid';

    const itemsToDisplay = catalog.filter((item) => {
      if (this.filter === 'pinned') return pinnedKeys.has(item.key);
      if (this.filter === 'all') return true;
      return item.tome === this.filter;
    });

    for (const item of itemsToDisplay) {
      const isDisc = isGrailDiscovered(item.key);
      const entry = getGrailEntry(item.key);
      const isPinned = pinnedKeys.has(item.key);

      const card = document.createElement('div');
      card.className = isDisc ? 'grail-card discovered' : 'grail-card undiscovered';

      if (entry?.isPrimalPerfect) {
        card.classList.add('primal-perfect');
      }

      // Icon container
      const iconBox = document.createElement('div');
      iconBox.className = 'grail-icon-box';

      if (item.baseId !== undefined && item.tome === 'armory') {
        const iconEl = itemIconEl(item.baseId);
        if (!isDisc) iconEl.classList.add('grail-silhouette');
        iconBox.append(iconEl);
      } else {
        const img = document.createElement('img');
        img.className = isDisc ? 'grail-icon-img' : 'grail-icon-img grail-silhouette';
        img.src = item.icon ?? '';
        img.alt = item.name;
        img.onerror = () => {
          img.style.display = 'none';
          iconBox.textContent = isDisc ? '✨' : '❓';
        };
        iconBox.append(img);
      }
      card.append(iconBox);

      // Title
      const title = document.createElement('div');
      title.className = 'grail-item-title';
      title.textContent = item.name;
      card.append(title);

      // Meta info (Tome / perfection)
      const meta = document.createElement('div');
      meta.className = 'grail-item-meta';

      const typeSpan = document.createElement('span');
      typeSpan.textContent = `T${item.tier ?? 1} ${item.tome.toUpperCase()}`;
      meta.append(typeSpan);

      if (isDisc && entry) {
        const perf = document.createElement('span');
        perf.className = `grail-perfection-badge ${entry.isPrimalPerfect ? 'primal' : entry.rollPerfectionPct >= 90 ? 'high' : 'normal'}`;
        perf.textContent = entry.isPrimalPerfect ? '🌟 PRIMAL 100%' : `${entry.rollPerfectionPct}% Perf`;
        meta.append(perf);
      }
      card.append(meta);

      if (isDisc && entry) {
        // Provenance Stamp
        const prov = document.createElement('div');
        prov.className = 'grail-provenance';
        const dateStr = entry.discoveredAt ? new Date(entry.discoveredAt).toLocaleDateString() : '';
        prov.textContent = `Found by ${entry.heroName || 'Hero'} (${entry.heroClass || 'Adventurer'} L${entry.heroLevel || 1}) in ${entry.missionName || 'Campaign'}${entry.droppedBy ? ` · ${entry.droppedBy}` : ''} ${dateStr ? `[${dateStr}]` : ''}`;
        card.append(prov);

        if (item.baseId !== undefined && this.tipOn) {
          const tip = formatItemTooltip(item.baseId);
          this.tipOn(card, tip);
          card.setAttribute('aria-label', tip.replace(/\n/g, ' '));
        }
      } else {
        // Hunting clue & pin button
        const clueBox = document.createElement('div');
        clueBox.className = 'grail-clue-box';
        clueBox.textContent = `🎯 Rumor: ${getGrailDropClue(item)}`;
        card.append(clueBox);

        const pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = isPinned ? 'grail-pin-btn pinned' : 'grail-pin-btn';
        pinBtn.textContent = isPinned ? '🎯 Pinned' : '🎯 Pin Target';
        pinBtn.onclick = (e) => {
          e.stopPropagation();
          togglePinGrailTarget(item.key);
          this.render();
        };
        card.append(pinBtn);
      }

      grid.append(card);
    }

    this.overlay.append(head, meter, filters, grid);
  }
}
