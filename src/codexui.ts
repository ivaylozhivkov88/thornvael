import { getCodexProgress, isDiscovered } from './codex';
import { formatItemTooltip } from './heroui';
import { Ik, ITEMS, Slot, itemText } from './sim/items';
import { findSetByItemName, isSetItem } from './sim/sets';
import { itemIcon } from './townicons';

/**
 * Hall of Relics Codex UI for Thornvael.
 * Displays all collectible items with discovery status, progress meters,
 * and category filtering.
 */

type Filter = 'all' | 'weapon' | 'armor' | 'shield' | 'jewelry' | 'magic' | 'set';

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
    h2.textContent = '🏆 Hall of Relics Codex';
    const sub = document.createElement('p');
    sub.className = 'codex-progress-text';
    sub.textContent = `${discovered} / ${total} Discovered (${pct}%)`;
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
      ['all', 'All Items'],
      ['weapon', 'Weapons'],
      ['armor', 'Armor & Helms'],
      ['shield', 'Shields'],
      ['jewelry', 'Rings & Charms'],
      ['magic', 'Scrolls & Draughts'],
      ['set', 'Set Items'],
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
        } else {
          card.title = tip;
        }
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
        } else {
          card.title = hint;
        }
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
