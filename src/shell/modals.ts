import { blip } from '../audio';
import { type CampaignNode } from '../campaign';
import { type CampaignRecord } from '../flow';
import {
  advanceStory,
  openStory,
  previousStory,
  replayStory,
  skipStory,
  type StorySequence,
} from '../story';
import { S } from '../strings';
import { getDefeatFlavor } from '../tips';
import { BUILDINGS, build, levelOf, nextCost } from '../townbuild';
import { btn, el } from './dom';

const T = S.shell;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Collect keyboard-focusable visible descendants inside a modal box. */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  if (typeof container.querySelectorAll !== 'function') return [];
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return candidates.filter((node) => {
    if (node.hidden) return false;
    if (node.getAttribute?.('aria-hidden') === 'true') return false;
    return true;
  });
}

export interface ModalHandle {
  readonly overlay: HTMLElement;
  readonly box: HTMLElement;
  isOpen(): boolean;
  close(): void;
  focusFirst(): void;
}

export interface ModalSheetOptions {
  root: HTMLElement;
  className?: string;
  boxClassName?: string;
  ariaLabel?: string;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  trapFocus?: boolean;
  onClose?: () => void;
  /** Return true if the custom handler consumed the keydown event. */
  onKeyDown?: (e: KeyboardEvent, handle: ModalHandle) => boolean | void;
}

interface ActiveModalEntry {
  handle: ModalHandle;
  opts: ModalSheetOptions;
  previousFocus: HTMLElement | null;
}

/**
 * Manages stacked shell modal sheets with ARIA dialog semantics, ESC handling,
 * backdrop click dismissal, focus trapping, and focus restoration on close.
 */
export class ModalManager {
  private readonly stack: ActiveModalEntry[] = [];
  private keyListenerAttached = false;

  private readonly onWindowKeyDown = (e: KeyboardEvent): void => {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;

    if (top.opts.onKeyDown?.(e, top.handle) === true) {
      return;
    }

    if (e.key === 'Escape' && top.opts.closeOnEscape !== false) {
      e.preventDefault();
      e.stopPropagation();
      top.handle.close();
      return;
    }

    if (e.key === 'Tab' && top.opts.trapFocus !== false) {
      this.handleFocusTrap(e, top.handle.box);
    }
  };

  private handleFocusTrap(e: KeyboardEvent, box: HTMLElement): void {
    const focusables = getFocusableElements(box);
    if (focusables.length === 0) {
      e.preventDefault();
      box.focus?.();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

    if (e.shiftKey) {
      if (!active || active === first || !box.contains?.(active)) {
        e.preventDefault();
        last.focus?.();
      }
    } else if (!active || active === last || !box.contains?.(active)) {
      e.preventDefault();
      first.focus?.();
    }
  }

  private ensureKeyListener(): void {
    if (this.keyListenerAttached || typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }
    window.addEventListener('keydown', this.onWindowKeyDown);
    this.keyListenerAttached = true;
  }

  private releaseKeyListenerIfEmpty(): void {
    if (
      this.stack.length === 0 &&
      this.keyListenerAttached &&
      typeof window !== 'undefined' &&
      typeof window.removeEventListener === 'function'
    ) {
      window.removeEventListener('keydown', this.onWindowKeyDown);
      this.keyListenerAttached = false;
    }
  }

  get activeCount(): number {
    return this.stack.length;
  }

  isOpen(): boolean {
    return this.stack.length > 0;
  }

  open(opts: ModalSheetOptions): ModalHandle {
    const overlay = el('div', opts.className ?? 'sh-modal');
    const box = el('div', opts.boxClassName ?? 'sh-box');
    box.setAttribute?.('role', 'dialog');
    box.setAttribute?.('aria-modal', 'true');
    if (opts.ariaLabel) box.setAttribute?.('aria-label', opts.ariaLabel);
    box.tabIndex = -1;

    overlay.append(box);
    opts.root.append(overlay);

    const previousFocus =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

    let open = true;
    const focusFirst = (): void => {
      if (!open) return;
      const focusables = getFocusableElements(box);
      if (focusables.length > 0) focusables[0].focus?.();
      else box.focus?.();
    };

    const onBackdropClick = (ev: MouseEvent): void => {
      if (opts.closeOnBackdrop && ev.target === overlay) {
        handle.close();
      }
    };
    overlay.addEventListener?.('click', onBackdropClick);

    const handle: ModalHandle = {
      overlay,
      box,
      isOpen: () => open,
      focusFirst,
      close: () => {
        if (!open) return;
        open = false;
        const idx = this.stack.findIndex((entry) => entry.handle === handle);
        if (idx >= 0) this.stack.splice(idx, 1);
        overlay.removeEventListener?.('click', onBackdropClick);
        overlay.remove?.();
        this.releaseKeyListenerIfEmpty();
        if (previousFocus && previousFocus.isConnected) {
          previousFocus.focus?.();
        }
        opts.onClose?.();
      },
    };

    this.stack.push({
      handle,
      opts,
      previousFocus,
    });
    this.ensureKeyListener();
    return handle;
  }

  closeTop(): boolean {
    const top = this.stack[this.stack.length - 1];
    if (!top) return false;
    top.handle.close();
    return true;
  }

  closeAll(): void {
    while (this.stack.length > 0) {
      this.closeTop();
    }
  }
}

const defaultModalManager = new ModalManager();

/** Convenience helper to open a single modal sheet with focus trap and ESC handling. */
export function openModalSheet(opts: ModalSheetOptions): ModalHandle {
  return defaultModalManager.open(opts);
}

// ---- Concrete campaign shell modals ----

export interface HoldingsModalOptions {
  record: CampaignRecord;
  onSaveRecord: (record: CampaignRecord) => void | Promise<unknown>;
}

export function openHoldingsModal(
  modals: ModalManager,
  root: HTMLElement,
  opts: HoldingsModalOptions,
): ModalHandle {
  const r = opts.record;
  const handle = modals.open({
    root,
    className: 'sh-modal sh-holdings-modal',
    boxClassName: 'sh-box sh-holdings-box',
    ariaLabel: T.holdings,
    closeOnEscape: true,
    closeOnBackdrop: true,
  });

  const draw = (): void => {
    const carry = r.carry;
    handle.box.replaceChildren(
      el('h2', '', T.holdings),
      el('p', 'sh-holdings-intro', carry ? `${T.holdingsIntro} ${T.gold}: ${carry.gold}` : T.holdingsNone),
    );
    const list = el('div', 'sh-holdings-list');
    for (const b of BUILDINGS) {
      const lv = levelOf(r.progress.builds, b.id);
      const cost = nextCost(r.progress.builds, b.id);
      const row = el('div', 'sh-row sh-hold');
      row.append(
        el('b', '', `${T.building[b.id]} · ${T.buildLevel} ${lv}/${b.cost.length}`),
        el('span', '', T.buildingInfo[b.id]),
      );
      if (cost === null) {
        row.append(el('span', 'sh-hold-max', T.buildMax));
      } else {
        const buy = btn(
          `${T.buildFor} ${cost}`,
          () => {
            if (!carry) return;
            const out = build(r.progress, carry.gold, b.id);
            if (!out) return;
            r.progress = out.progress;
            carry.gold = out.gold;
            // The next node reads builds from the carryover.
            carry.progress = { ...carry.progress, builds: out.progress.builds };
            void opts.onSaveRecord(r);
            draw();
          },
          'sh-small sh-hold-btn',
        );
        buy.disabled = !carry || carry.gold < cost;
        row.append(buy);
      }
      list.append(row);
    }
    handle.box.append(list, btn(T.back, () => handle.close(), 'sh-small sh-hold-back'));
  };

  draw();
  handle.focusFirst();
  return handle;
}

export interface BriefingModalOptions {
  node: CampaignNode;
  record: CampaignRecord | null;
  plaque?: { title: string; text: string } | null;
  tip?: string;
  onEnter: (handle: ModalHandle) => void;
  onWaypointTravel: (handle: ModalHandle) => Promise<unknown> | void;
}

export function openBriefingModal(
  modals: ModalManager,
  root: HTMLElement,
  opts: BriefingModalOptions,
): ModalHandle {
  const { node: n, record } = opts;
  const handle = modals.open({
    root,
    className: 'sh-modal',
    boxClassName: 'sh-box homm-dossier-box',
    ariaLabel: n.title,
    closeOnEscape: true,
    closeOnBackdrop: true,
  });

  const hasWp = (record?.progress.waypoints?.includes(n.id) ?? false) || n.kind === 'town';
  const isHere = n.id === record?.progress.node;

  const btnRow = el('div', 'sh-row');
  const enterBtn = btn(
    n.kind === 'town' ? `🏰 ${T.enterTown}` : `⚔ ${T.enter}`,
    () => opts.onEnter(handle),
    'sh-on',
  );
  btnRow.append(enterBtn);

  if (hasWp && !isHere && record) {
    btnRow.append(
      btn('⚡ Fast Travel via Waypoint', () => void opts.onWaypointTravel(handle), 'sh-small'),
    );
  }
  btnRow.append(btn(T.back, () => handle.close(), 'sh-small'));

  handle.box.append(
    el('h2', '', `${n.kind === 'town' ? '🏰 ' : '⚔ '}${n.title}`),
    el('p', '', n.briefing),
  );
  if (opts.plaque) {
    const pq = el('div', 'sh-briefing-plaque');
    pq.append(el('strong', '', `${opts.plaque.title}: `), document.createTextNode(opts.plaque.text));
    handle.box.append(pq);
  }
  if (opts.tip) {
    handle.box.append(el('p', 'note', `Tip: ${opts.tip}`));
  }
  handle.box.append(btnRow);
  handle.focusFirst();
  return handle;
}

export interface ResultModalOptions {
  node: CampaignNode;
  last: NonNullable<CampaignRecord['last']>;
  record: CampaignRecord | null;
  onAcknowledge: () => Promise<unknown> | void;
}

export function openResultModal(
  modals: ModalManager,
  root: HTMLElement,
  opts: ResultModalOptions,
): ModalHandle {
  const { node: n, last, record } = opts;
  let acknowledged = false;
  const acknowledge = async (handle: ModalHandle): Promise<void> => {
    if (acknowledged) return;
    acknowledged = true;
    handle.close();
    await opts.onAcknowledge();
  };

  const handle = modals.open({
    root,
    className: 'sh-modal',
    boxClassName: 'sh-box',
    ariaLabel: `${last.win ? T.victory : T.defeat}: ${n.title}`,
    closeOnEscape: true,
    closeOnBackdrop: false,
    onKeyDown: (e, h) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        void acknowledge(h);
        return true;
      }
      return false;
    },
  });

  const rawText = last.text || (last.win ? n.result?.win : n.result?.lose) || '';
  const text = !last.win && !rawText.includes('Tip:') ? [rawText, getDefeatFlavor().formatted].filter(Boolean).join('\n\n') : rawText;
  const carry = record?.carry;
  const lines = [`${T.stats}: ${last.up}/${last.size}`, `${T.gold}: ${last.gold}`];
  if (carry) lines.push(`${T.mercs}: ${carry.mercs.length}`, `${T.loot}: ${carry.hero.inv.length}`);

  handle.box.append(
    el('h2', '', `${last.win ? T.victory : T.defeat}: ${n.title}`),
    el('p', '', text),
    el('p', 'note', lines.join('\n')),
    btn(last.win ? T.toMap : T.retry, () => void acknowledge(handle)),
  );
  handle.focusFirst();
  return handle;
}

export function buildStoryBanner(seqId: StorySequence['id'], backdrop: string): HTMLElement {
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

export function openStorySlideshowModal(
  modals: ModalManager,
  root: HTMLElement,
  id: StorySequence['id'],
  onFinish?: () => void,
): ModalHandle {
  blip();
  let player = openStory(id);
  const content = el('div', 'sh-slideshow-content');
  let isTransitioning = false;

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

  const handle = modals.open({
    root,
    className: 'sh-slideshow-overlay',
    boxClassName: 'sh-slideshow-frame',
    ariaLabel: player.sequence.title,
    closeOnEscape: false,
    closeOnBackdrop: false,
    onClose: onFinish,
    onKeyDown: (e, h) => {
      if (e.key === 'Escape' || e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        blip();
        player = skipStory(player);
        h.close();
        return true;
      }
      if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        stepNext();
        return true;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        stepPrev();
        return true;
      }
      return false;
    },
  });

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
      handle.close();
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

  const draw = (): void => {
    handle.box.replaceChildren();
    const slide = player.sequence.slides[player.index];

    const header = el('div', 'sh-slideshow-header');
    header.append(el('h2', 'sh-slideshow-title', player.sequence.title));
    if (player.sequence.subtitle) {
      header.append(el('div', 'sh-slideshow-subtitle', player.sequence.subtitle));
    }

    content.replaceChildren();
    const art = buildStoryBanner(player.sequence.id, slide.backdrop);
    const textWrap = el('div', 'sh-slideshow-text');
    const heading = el('h3', 'sh-slideshow-heading', slide.heading);
    const caption = el('p', 'sh-slideshow-caption', slide.caption);
    if (slide.reflection) {
      textWrap.append(heading, caption, el('blockquote', 'sh-slideshow-reflection', slide.reflection));
    } else {
      textWrap.append(heading, caption);
    }

    const pips = el('div', 'sh-slideshow-pips');
    for (let i = 0; i < player.sequence.slides.length; i++) {
      pips.append(el('span', `sh-slideshow-pip${i === player.index ? ' active' : ''}`));
    }
    textWrap.append(pips);
    content.append(art, textWrap);

    const controls = el('div', 'sh-slideshow-controls');
    const isLast = player.index + 1 >= player.sequence.slides.length;
    const skipBtn = btn(
      'Skip [Space / Esc]',
      () => {
        blip();
        player = skipStory(player);
        handle.close();
      },
      'sh-slideshow-btn sh-slideshow-btn-secondary',
    );
    const replayBtn = btn(
      'Replay',
      () => {
        blip();
        animateTransition(() => {
          player = replayStory(player);
          draw();
        });
      },
      'sh-slideshow-btn sh-slideshow-btn-secondary',
    );
    const nextBtn = btn(
      isLast ? 'Finish' : 'Next →',
      stepNext,
      'sh-slideshow-btn sh-slideshow-btn-primary',
    );

    controls.append(skipBtn, replayBtn, nextBtn);
    handle.box.append(header, content, controls);
  };

  draw();
  handle.focusFirst();
  return handle;
}
