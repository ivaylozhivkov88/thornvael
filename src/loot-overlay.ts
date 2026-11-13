import { FP, type Sim } from './sim/sim';
import { POOLS } from './sim/combat';
import { getItemDef } from './sim/items';
import { itemRarity } from './sim/town';

export interface VisibleLootItem {
  key: string;
  code: number;
  text: string;
  cssClass: string;
  sx: number;
  sy: number;
}

export class LootOverlayManager {
  private readonly lootDropTimes = new Map<string, number>();
  private readonly lastKnownLoot = new Set<string>();
  private readonly lootBadges = new Map<string, HTMLDivElement>();
  private lootOverlayEl: HTMLElement | null = null;
  private btnAltEl: HTMLButtonElement | null = null;
  public altMobileToggle = false;

  ensureLootOverlay(): HTMLElement {
    if (!this.lootOverlayEl) {
      this.lootOverlayEl = document.getElementById('loot-overlay');
      if (!this.lootOverlayEl) {
        this.lootOverlayEl = document.createElement('div');
        this.lootOverlayEl.id = 'loot-overlay';
        document.body.appendChild(this.lootOverlayEl);
      }
    }
    return this.lootOverlayEl;
  }

  updateAltButtonStates(active: boolean): void {
    const btn1 = document.getElementById('btn-alt-loot');
    if (btn1) {
      btn1.classList.toggle('on', active);
      btn1.setAttribute('aria-pressed', String(active));
    }
    const btn2 = document.getElementById('btn-alt');
    if (btn2) {
      btn2.classList.toggle('on', active);
      btn2.setAttribute('aria-pressed', String(active));
    }
  }

  toggleLootMode(isAltHeld: boolean, toast: (m: string) => void): void {
    this.altMobileToggle = !this.altMobileToggle;
    this.updateAltButtonStates(isAltHeld || this.altMobileToggle);
    if (this.altMobileToggle) {
      toast('👁 Loot highlight active [ALT]');
    } else {
      toast('Loot highlight off');
    }
  }

  initAltButton(onToggle: () => void): void {
    this.btnAltEl = document.getElementById('btn-alt') as HTMLButtonElement | null;
    if (!this.btnAltEl) {
      this.btnAltEl = document.createElement('button');
      this.btnAltEl.id = 'btn-alt';
      this.btnAltEl.className = 'btn-alt';
      this.btnAltEl.setAttribute('aria-pressed', 'false');
      this.btnAltEl.title = 'Toggle Loot Overlay (ALT)';
      this.btnAltEl.textContent = '👁 ALT';
      const minimapEl = document.getElementById('minimap');
      if (minimapEl && minimapEl.parentNode) {
        minimapEl.parentNode.insertBefore(this.btnAltEl, minimapEl.nextSibling);
      } else {
        document.body.appendChild(this.btnAltEl);
      }
    }
    this.btnAltEl.onclick = (e) => {
      e.stopPropagation();
      onToggle();
    };
  }

  clear(): void {
    for (const el of this.lootBadges.values()) {
      el.remove();
    }
    this.lootBadges.clear();
    this.lastKnownLoot.clear();
    this.lootDropTimes.clear();
  }

  update(
    now: number,
    sim: Sim,
    pointScreen: (fx: number, fy: number) => [number, number] | null,
    isTownOpen: boolean,
    isAltHeld: boolean,
    onPickup: (code: number) => void,
  ): void {
    if (isTownOpen) {
      for (const el of this.lootBadges.values()) el.style.display = 'none';
      return;
    }

    const cb = sim.cb;
    const mw = sim.map.w;
    const mh = sim.map.h;
    const currentActiveKeys = new Set<string>();

    // Track active gold sacks
    for (let s = 0; s < cb.sG.length; s++) {
      if (cb.sG[s] <= 0) continue;
      const key = 's' + s;
      currentActiveKeys.add(key);
      if (!this.lastKnownLoot.has(key)) {
        this.lootDropTimes.set(key, now);
        this.lastKnownLoot.add(key);
      }
    }

    // Track active item bags
    for (let b = 0; b < cb.bI.length; b++) {
      if (cb.bI[b] <= 0) continue;
      const key = 'b' + b;
      currentActiveKeys.add(key);
      if (!this.lastKnownLoot.has(key)) {
        this.lootDropTimes.set(key, now);
        this.lastKnownLoot.add(key);
      }
    }

    // Clean up inactive loot
    for (const k of this.lastKnownLoot) {
      if (!currentActiveKeys.has(k)) {
        this.lastKnownLoot.delete(k);
        this.lootDropTimes.delete(k);
        const el = this.lootBadges.get(k);
        if (el) {
          el.remove();
          this.lootBadges.delete(k);
        }
      }
    }

    const isAltActive = isAltHeld || this.altMobileToggle;
    this.updateAltButtonStates(isAltActive);

    const itemsToRender: VisibleLootItem[] = [];

    // 1. Gold sacks on explored ground
    for (let s = 0; s < cb.sG.length; s++) {
      const gold = cb.sG[s];
      if (gold <= 0) continue;
      const tx = Math.floor(cb.sX[s] / FP);
      const ty = Math.floor(cb.sY[s] / FP);
      if (tx < 0 || tx >= mw || ty < 0 || ty >= mh) continue;
      if (!sim.explored[ty * mw + tx]) continue;

      const key = 's' + s;
      const dropTime = this.lootDropTimes.get(key) ?? 0;
      const isRecent = (now - dropTime) < 3500;
      if (!isAltActive && !isRecent) continue;

      const pt = pointScreen(cb.sX[s], cb.sY[s]);
      if (!pt) continue;
      const [sx, sy] = pt;
      if (sx < -120 || sy < -60 || sx > window.innerWidth + 120 || sy > window.innerHeight + 60) continue;

      itemsToRender.push({
        key,
        code: s,
        text: `[ ${gold} Gold ]`,
        cssClass: 'd2-loot-label d2-loot-gold',
        sx,
        sy,
      });
    }

    // 2. Item bags on explored ground
    for (let b = 0; b < cb.bI.length; b++) {
      const itemCode = cb.bI[b];
      if (itemCode <= 0) continue;
      const tx = Math.floor(cb.bX[b] / FP);
      const ty = Math.floor(cb.bY[b] / FP);
      if (tx < 0 || tx >= mw || ty < 0 || ty >= mh) continue;
      if (!sim.explored[ty * mw + tx]) continue;

      const key = 'b' + b;
      const dropTime = this.lootDropTimes.get(key) ?? 0;
      const isRecent = (now - dropTime) < 3500;
      if (!isAltActive && !isRecent) continue;

      const pt = pointScreen(cb.bX[b], cb.bY[b]);
      if (!pt) continue;
      const [sx, sy] = pt;
      if (sx < -120 || sy < -60 || sx > window.innerWidth + 120 || sy > window.innerHeight + 60) continue;

      const itemId = itemCode - 1;
      const def = sim.getItemDef(itemId) ?? getItemDef(itemId);
      const rarity = def ? itemRarity(def) : 'normal';
      const name = def?.name ?? 'Item';

      itemsToRender.push({
        key,
        code: POOLS.sacks + b,
        text: name,
        cssClass: `d2-loot-label d2-loot-${rarity}`,
        sx,
        sy,
      });
    }

    // Stagger overlapping labels vertically
    itemsToRender.sort((a, b) => a.sy - b.sy || a.sx - b.sx);

    const placedRects: { x: number; y: number; w: number; h: number }[] = [];
    const overlay = this.ensureLootOverlay();
    const visibleKeys = new Set<string>();

    for (const item of itemsToRender) {
      visibleKeys.add(item.key);
      let el = this.lootBadges.get(item.key);
      if (!el) {
        el = document.createElement('div');
        el.dataset.code = String(item.code);
        const onPick = (e: Event): void => {
          e.stopPropagation();
          e.preventDefault();
          onPickup(Number(el!.dataset.code));
        };
        el.addEventListener('pointerdown', onPick);
        el.addEventListener('click', onPick);
        overlay.appendChild(el);
        this.lootBadges.set(item.key, el);
      }

      el.className = item.cssClass;
      if (el.textContent !== item.text) el.textContent = item.text;
      el.dataset.code = String(item.code);

      const approxW = Math.max(60, item.text.length * 7.5 + 16);
      const approxH = 18;
      let curY = item.sy;

      for (let attempts = 0; attempts < 10; attempts++) {
        let collided = false;
        for (const p of placedRects) {
          if (Math.abs(item.sx - p.x) < (approxW + p.w) * 0.48 && Math.abs(curY - p.y) < 18) {
            curY = p.y - 19;
            collided = true;
            break;
          }
        }
        if (!collided) break;
      }

      placedRects.push({ x: item.sx, y: curY, w: approxW, h: approxH });
      el.style.left = `${Math.round(item.sx)}px`;
      el.style.top = `${Math.round(curY)}px`;
      el.style.display = '';
    }

    for (const [k, el] of this.lootBadges) {
      if (!visibleKeys.has(k)) {
        el.style.display = 'none';
      }
    }
  }
}
