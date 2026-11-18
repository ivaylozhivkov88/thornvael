import { getMonsterCodex, getCodexLore } from './missioncontent';
import { getCodexProgress, isDiscovered } from './codex';
import { formatItemTooltip } from './heroui';
import { Ik, ITEMS, Slot, itemText } from './sim/items';
import { findSetByItemName, isSetItem } from './sim/sets';
import { S } from './strings';
import { itemIcon } from './townicons';

/**
 * Hall of Relics & Imperial Codex UI for Thornvael.
 * Displays collectible relics, deep lore chronicles, and the monstrous bestiary.
 */

type Filter = 'all' | 'weapon' | 'armor' | 'shield' | 'jewelry' | 'magic' | 'set' | 'chronicles' | 'bestiary';

export class CodexUi {
  private overlay: HTMLElement | null = null;
  private filter: Filter = 'all';

  constructor(private readonly tipOn?: (el: HTMLElement, tip: string) => void) {}

  show(): void {
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.className = 'sheet codex-sheet';
      document.body.append(this.overlay);
    }
    this.render();
    this.overlay.hidden = false;
  }

  hide(): void {
    if (this.overlay) this.overlay.hidden = true;
  }

  toggle(): void {
    if (this.overlay && !this.overlay.hidden) this.hide();
    else this.show();
  }

  private render(): void {
    if (!this.overlay) return;
    const { discovered, total, pct } = getCodexProgress();
    this.overlay.replaceChildren();

    // Head
    const head = document.createElement('div');
    head.className = 'codex-head';

    const titleBox = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.textContent = S.codex.title;
    const sub = document.createElement('p');
    sub.className = 'codex-progress-text';
    sub.textContent = `${discovered} / ${total} Relics Discovered (${pct}%) · 4 Chronicles & 4 Mutations Cataloged`;
    titleBox.append(h2, sub);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'codex-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => this.hide();

    head.append(titleBox, closeBtn);

    // Progress Bar Meter
    const meter = document.createElement('div');
    meter.className = 'meter codex-meter';
    const meterBar = document.createElement('i');
    meterBar.style.width = `${pct}%`;
    meter.append(meterBar);

    // Filter Buttons
    const filters = document.createElement('div');
    filters.className = 'codex-filters';
    const tabs: [Filter, string][] = [
      ['all', S.codex.tabs.all],
      ['weapon', S.codex.tabs.weapon],
      ['armor', S.codex.tabs.armor],
      ['shield', S.codex.tabs.shield],
      ['jewelry', S.codex.tabs.jewelry],
      ['magic', S.codex.tabs.magic],
      ['set', S.codex.tabs.set],
      ['chronicles', S.codex.tabs.chronicles],
      ['bestiary', S.codex.tabs.bestiary],
    ];
    tabs.forEach(([f, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      if (this.filter === f) btn.className = 'codex-tab active';
      else btn.className = 'codex-tab';
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
      const pack = getMonsterCodex();
      if (pack.length) {
        for (const m of pack) {
          const card = document.createElement('article');
          card.className = 'codex-lore-entry';
          const title = document.createElement('h3');
          title.className = 'codex-lore-title';
          title.textContent = m.name;
          const meta = document.createElement('div');
          meta.className = 'codex-bestiary-meta';
          for (const t of [m.weakness && `Weakness: ${m.weakness}`, m.special && `Special: ${m.special}`]) {
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
        this.overlay.append(head, meter, filters, loreList);
        return;
      }
      for (const beast of S.codex.bestiary) {
        const card = document.createElement('article');
        card.className = 'codex-lore-entry';
        const title = document.createElement('h3');
        title.className = 'codex-lore-title';
        title.textContent = beast.name;
        const meta = document.createElement('div');
        meta.className = 'codex-bestiary-meta';
        const b1 = document.createElement('span');
        b1.className = 'codex-bestiary-badge';
        b1.textContent = beast.classification;
        const b2 = document.createElement('span');
        b2.className = 'codex-bestiary-badge';
        b2.textContent = beast.role;
        meta.append(b1, b2);
        const p = document.createElement('p');
        p.className = 'codex-lore-text';
        p.textContent = beast.lore;
        card.append(title, meta, p);
        loreList.append(card);
      }
      this.overlay.append(head, meter, filters, loreList);
      return;
    }

    // Items Grid
    const grid = document.createElement('div');
    grid.className = 'codex-grid';

    ITEMS.forEach((item, id) => {
      if (!this.matchesFilter(item, this.filter)) return;

      const discoveredNow = isDiscovered(id);
      const isSet = isSetItem(item.name);
      const card = document.createElement('div');
      card.className = discoveredNow ? 'codex-card discovered' : 'codex-card undiscovered';
      if (isSet) {
        card.classList.add('rarity-set');
      }

      if (discoveredNow) {
        const rarity = isSet ? 'set' : item.tier >= 5 ? 'unique' : item.tier >= 4 ? 'rare' : item.tier >= 2 ? 'magic' : 'normal';
        card.dataset.rarity = rarity;
        card.append(itemIcon(id));

        const name = document.createElement('span');
        name.className = 'item-name';
        name.textContent = item.name;
        card.append(name);

        const tierBadge = document.createElement('small');
        tierBadge.textContent = isSet ? `Set T${item.tier}` : `T${item.tier}`;
        card.append(tierBadge);

        const tip = formatItemTooltip(id);
        if (this.tipOn) {
          this.tipOn(card, tip);
        }
        card.setAttribute('aria-label', tip.replace(/\n/g, ' '));
      } else {
        if (isSet) {
          card.dataset.rarity = 'set';
        }
        const mysteryIcon = document.createElement('div');
        mysteryIcon.className = 'codex-mystery-icon';
        mysteryIcon.textContent = '?';
        card.append(mysteryIcon);

        const mysteryName = document.createElement('span');
        mysteryName.className = 'item-name mystery-text';
        mysteryName.textContent = isSet ? `??? (${findSetByItemName(item.name)?.name ?? 'Set'})` : `??? (Tier ${item.tier})`;
        card.append(mysteryName);

        const hint = isSet
          ? `Undiscovered Set Item: ${item.name} (${findSetByItemName(item.name)?.name}). Discover in expeditions.`
          : `Undiscovered Tier ${item.tier} Artifact. Discover by looting or purchasing.`;
        if (this.tipOn) {
          this.tipOn(card, hint);
        }
        card.setAttribute('aria-label', hint.replace(/\n/g, ' '));
      }

      grid.append(card);
    });

    this.overlay.append(head, meter, filters, grid);
  }

  private matchesFilter(item: (typeof ITEMS)[number], f: Filter): boolean {
    if (f === 'all') return true;
    if (f === 'set') return isSetItem(item.name);
    if (f === 'weapon') return item.kind === Ik.Gear && item.slot === Slot.Weapon;
    if (f === 'armor') return item.kind === Ik.Gear && (item.slot === Slot.Armor || item.slot === Slot.Helm || item.slot === Slot.Boots || item.slot === Slot.Gloves);
    if (f === 'shield') return item.kind === Ik.Gear && item.slot === Slot.Shield;
    if (f === 'jewelry') return item.kind === Ik.Gear && (item.slot === Slot.Ring || item.slot === Slot.Amulet);
    if (f === 'magic') return item.kind === Ik.Potion || item.kind === Ik.Learn;
    return true;
  }
}
