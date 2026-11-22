import { BUNDLED_LOADING_TIPS, getLoadingTip, hydrateCuratedTips } from './tips';

export interface LoadingScene {
  src: string;
  title: string;
  subtitle: string;
}

export const LOADING_SCENES: readonly LoadingScene[] = [
  {
    src: 'loadscreens/load-map1-fords.jpg',
    title: 'The Border Fords',
    subtitle: 'Act I · Thornwick & the Mist-Bound Crossing',
  },
  {
    src: 'townart/frame-hero-warrior.jpg',
    title: 'Vanguard of Iron & Oath',
    subtitle: 'Steel holds the line where banners fall',
  },
  {
    src: 'loadscreens/load-map2-redmarsh.jpg',
    title: 'The Redmarsh Wastes',
    subtitle: 'Act II · Alkali Flats & Sunken Cisterns',
  },
  {
    src: 'townart/frame-hero-mage.jpg',
    title: 'Arcanist of the Telluric Order',
    subtitle: 'Bind flame, frost, and storm to your command',
  },
  {
    src: 'loadscreens/load-map3-coast.jpg',
    title: 'The Drowned Coast',
    subtitle: 'Act III · Oakhaven Harbor & Storm Reefs',
  },
  {
    src: 'townart/frame-ashkarath.jpg',
    title: 'The Ashen Court',
    subtitle: 'Ancient wards stir beneath the caldera ash',
  },
  {
    src: 'loadscreens/load-map4-caldera.jpg',
    title: 'The Obsidian Caldera',
    subtitle: 'Act IV · Ironcamp & the Cinder Throne',
  },
];

const DEFAULT_STATUS_LINES = [
  'Forging terrain...',
  'Summoning cohort...',
  'Preparing spells...',
  'Binding arcane wards...',
] as const;

export interface LoadingScreenOptions {
  mission?: string | null;
  campaign?: string | null;
  biome?: string | null;
  baseUrl?: string;
}

function pickInitialScene(opts: LoadingScreenOptions): number {
  const c = (opts.campaign ?? '').toLowerCase();
  const m = (opts.mission ?? '').toLowerCase();
  const b = (opts.biome ?? '').toLowerCase();
  if (c.includes('map2') || c.includes('redmarsh') || b === 'marsh' || b === 'desert') return 2;
  if (c.includes('map3') || c.includes('coast') || b === 'oasis') return 4;
  if (c.includes('map4') || c.includes('caldera') || b === 'volcanic') return 6;
  if (m.includes('mage')) return 3;
  return 0;
}

/**
 * Full-viewport atmospheric loading overlay shown immediately on mission/skirmish load
 * while assets, terrain atlases, and PixiJS renderer initialize.
 */
export class LoadingScreen {
  readonly el: HTMLElement;
  private readonly imgA: HTMLImageElement;
  private readonly imgB: HTMLImageElement;
  private readonly sceneTitleEl: HTMLElement;
  private readonly sceneSubEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly tipEl: HTMLElement;
  private readonly barFillEl: HTMLElement;
  private readonly errBoxEl: HTMLElement;
  private readonly baseUrl: string;
  private sceneIdx: number;
  private activeLayer: 0 | 1 = 0;
  private statusIdx = 0;
  private customStatus = false;
  private sceneTimer: ReturnType<typeof setInterval> | null = null;
  private tipTimer: ReturnType<typeof setInterval> | null = null;
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private hidden = false;

  constructor(opts: LoadingScreenOptions = {}) {
    this.baseUrl = opts.baseUrl ?? (import.meta.env.BASE_URL ?? '/thornvael/');
    this.sceneIdx = pickInitialScene(opts);

    this.el = document.createElement('div');
    this.el.id = 'tv-loading-screen';
    this.el.className = 'tv-loading-screen';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');

    const backdrop = document.createElement('div');
    backdrop.className = 'tv-loading-backdrop';

    this.imgA = document.createElement('img');
    this.imgA.className = 'tv-loading-bg-img is-visible';
    this.imgA.alt = '';
    this.imgB = document.createElement('img');
    this.imgB.className = 'tv-loading-bg-img';
    this.imgB.alt = '';
    const vignette = document.createElement('div');
    vignette.className = 'tv-loading-vignette';
    backdrop.append(this.imgA, this.imgB, vignette);

    const panel = document.createElement('div');
    panel.className = 'tv-loading-panel';

    const header = document.createElement('div');
    header.className = 'tv-loading-header';
    const crest = document.createElement('div');
    crest.className = 'tv-loading-crest';
    crest.textContent = '✦ THORNVAEL ✦';
    this.sceneTitleEl = document.createElement('h1');
    this.sceneTitleEl.className = 'tv-loading-title';
    this.sceneSubEl = document.createElement('div');
    this.sceneSubEl.className = 'tv-loading-subtitle';
    header.append(crest, this.sceneTitleEl, this.sceneSubEl);

    const stage = document.createElement('div');
    stage.className = 'tv-loading-progress-wrap';
    const statusRow = document.createElement('div');
    statusRow.className = 'tv-loading-status-row';
    const spinner = document.createElement('span');
    spinner.className = 'tv-loading-rune-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    this.statusEl = document.createElement('span');
    this.statusEl.className = 'tv-loading-status';
    this.statusEl.textContent = DEFAULT_STATUS_LINES[0];
    statusRow.append(spinner, this.statusEl);

    const barTrack = document.createElement('div');
    barTrack.className = 'tv-loading-bar-track';
    this.barFillEl = document.createElement('div');
    this.barFillEl.className = 'tv-loading-bar-fill';
    this.barFillEl.style.width = '18%';
    barTrack.append(this.barFillEl);
    stage.append(statusRow, barTrack);

    this.errBoxEl = document.createElement('div');
    this.errBoxEl.className = 'tv-loading-error';
    this.errBoxEl.hidden = true;

    const tipWrap = document.createElement('div');
    tipWrap.className = 'tv-loading-tip-box';
    const tipLabel = document.createElement('div');
    tipLabel.className = 'tv-loading-tip-label';
    tipLabel.textContent = '✦ FIELD CHRONICLE & HINT ✦';
    this.tipEl = document.createElement('p');
    this.tipEl.className = 'tv-loading-tip';
    this.tipEl.textContent = this.nextTipText();
    tipWrap.append(tipLabel, this.tipEl);

    panel.append(header, stage, this.errBoxEl, tipWrap);
    this.el.append(backdrop, panel);

    this.applyScene(this.sceneIdx, true);

    if (typeof document !== 'undefined' && document.body) {
      document.body.append(this.el);
    }

    void hydrateCuratedTips(this.baseUrl);
    this.startTimers();
  }

  private nextTipText(): string {
    const idx = Math.floor(Math.random() * BUNDLED_LOADING_TIPS.length);
    return getLoadingTip() || BUNDLED_LOADING_TIPS[idx]?.text || BUNDLED_LOADING_TIPS[0].text;
  }

  private applyScene(index: number, immediate = false): void {
    const scene = LOADING_SCENES[index % LOADING_SCENES.length];
    const url = `${this.baseUrl}${scene.src}`;
    this.sceneTitleEl.textContent = scene.title;
    this.sceneSubEl.textContent = scene.subtitle;
    if (immediate) {
      this.imgA.src = url;
      this.imgA.classList.add('is-visible');
      this.imgB.classList.remove('is-visible');
      this.activeLayer = 0;
      return;
    }
    const incoming = this.activeLayer === 0 ? this.imgB : this.imgA;
    const outgoing = this.activeLayer === 0 ? this.imgA : this.imgB;
    incoming.src = url;
    incoming.classList.add('is-visible');
    outgoing.classList.remove('is-visible');
    this.activeLayer = this.activeLayer === 0 ? 1 : 0;
  }

  private startTimers(): void {
    this.sceneTimer = setInterval(() => {
      if (this.hidden) return;
      this.sceneIdx = (this.sceneIdx + 1) % LOADING_SCENES.length;
      this.applyScene(this.sceneIdx);
    }, 2800);

    this.tipTimer = setInterval(() => {
      if (this.hidden) return;
      this.tipEl.textContent = this.nextTipText();
    }, 4200);

    this.statusTimer = setInterval(() => {
      if (this.hidden || this.customStatus) return;
      this.statusIdx = (this.statusIdx + 1) % DEFAULT_STATUS_LINES.length;
      this.statusEl.textContent = DEFAULT_STATUS_LINES[this.statusIdx];
    }, 1500);
  }

  private stopTimers(): void {
    if (this.sceneTimer !== null) {
      clearInterval(this.sceneTimer);
      this.sceneTimer = null;
    }
    if (this.tipTimer !== null) {
      clearInterval(this.tipTimer);
      this.tipTimer = null;
    }
    if (this.statusTimer !== null) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
  }

  /** Update progress status text and bar percentage (0..100). */
  setStatus(text: string, progressPct?: number): void {
    if (this.hidden) return;
    this.customStatus = true;
    this.statusEl.textContent = text;
    if (typeof progressPct === 'number' && Number.isFinite(progressPct)) {
      const clamped = Math.max(8, Math.min(100, Math.round(progressPct)));
      this.barFillEl.style.width = `${clamped}%`;
    }
  }

  /** Display a recoverable load error instead of leaving the screen blank/black. */
  showError(message: string): void {
    this.stopTimers();
    this.el.classList.remove('is-hiding');
    this.hidden = false;
    this.statusEl.textContent = 'Failed to unseal region';
    this.barFillEl.style.width = '100%';
    this.barFillEl.classList.add('is-error');
    this.errBoxEl.hidden = false;
    this.errBoxEl.replaceChildren();

    const msgP = document.createElement('p');
    msgP.className = 'tv-loading-err-msg';
    msgP.textContent = message || 'An unexpected error occurred while initializing the renderer or map assets.';

    const actions = document.createElement('div');
    actions.className = 'tv-loading-err-actions';

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'tv-loading-btn tv-loading-btn-primary';
    retryBtn.textContent = 'Retry';
    retryBtn.onclick = () => location.reload();

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'tv-loading-btn';
    menuBtn.textContent = 'Return to Menu';
    menuBtn.onclick = () => location.assign('./?menu=1');

    actions.append(retryBtn, menuBtn);
    this.errBoxEl.append(msgP, actions);
  }

  /** Smoothly fade out and remove the loading screen once the world is rendered. */
  hide(): void {
    if (this.hidden) return;
    this.hidden = true;
    this.stopTimers();
    this.barFillEl.style.width = '100%';
    this.el.classList.add('is-hiding');
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.el.hidden = true;
      this.el.remove();
    }, 360);
  }
}
