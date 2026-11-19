import {
  getAmbienceVolume,
  getMusicVolume,
  getSfxVolume,
  getUiVolume,
  setAmbienceVolume,
  setMusicVolume,
  setSfxVolume,
  setUiVolume,
} from '../audio';
import { setAtmosphereReducedMotion } from '../atmosphere';

export type GraphicsQualityPreset = 'high' | 'low';
export type TextScalePreset = 0.9 | 1 | 1.15 | 1.3;
export type ItemRarityTier = 'common' | 'magic' | 'rare' | 'set' | 'unique';

export interface UxSettingsState {
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  uiVolume: number;
  graphicsQuality: GraphicsQualityPreset;
  reducedMotion: boolean;
  textScale: TextScalePreset;
  colorblindRarityBadges: boolean;
}

export interface RarityBadgeInfo {
  rarity: ItemRarityTier;
  symbol: string;
  label: string;
  shortTag: string;
  color: string;
}

export interface SettingsPanelOptions {
  parent?: HTMLElement;
  onQualityChange?: (qualityLevel: 0 | 2, preset: GraphicsQualityPreset) => void;
  onReducedMotionChange?: (reduced: boolean) => void;
  onSettingsChange?: (state: UxSettingsState) => void;
  onClose?: () => void;
}

const STORAGE_KEYS = {
  graphicsQuality: 'thornvael.graphicsQuality',
  reducedMotion: 'thornvael.reducedMotion',
  textScale: 'thornvael.textScale',
  colorblindRarityBadges: 'thornvael.colorblindBadges',
} as const;

const RARITY_BADGES: Record<ItemRarityTier, RarityBadgeInfo> = {
  common: { rarity: 'common', symbol: '●', label: 'Common', shortTag: '[C]', color: '#d4cfc4' },
  magic: { rarity: 'magic', symbol: '▲', label: 'Magic', shortTag: '[M]', color: '#6cb2ff' },
  rare: { rarity: 'rare', symbol: '◆', label: 'Rare', shortTag: '[R]', color: '#f3d15c' },
  set: { rarity: 'set', symbol: '❖', label: 'Set', shortTag: '[S]', color: '#4ee68a' },
  unique: { rarity: 'unique', symbol: '★', label: 'Unique', shortTag: '[U]', color: '#ff9d3b' },
};

const VALID_SCALES: readonly TextScalePreset[] = [0.9, 1, 1.15, 1.3];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // ignore storage restrictions
  }
}

export function getRarityBadge(rarity: ItemRarityTier, colorblindMode = true): RarityBadgeInfo {
  const base = RARITY_BADGES[rarity] ?? RARITY_BADGES.common;
  if (!colorblindMode) {
    return { ...base, symbol: '' };
  }
  return base;
}

export function loadUxSettings(): UxSettingsState {
  const rawQuality = readStorage(STORAGE_KEYS.graphicsQuality);
  const graphicsQuality: GraphicsQualityPreset = rawQuality === 'low' ? 'low' : 'high';
  const reducedMotion = readStorage(STORAGE_KEYS.reducedMotion) === 'true';
  const rawScale = Number(readStorage(STORAGE_KEYS.textScale));
  const textScale: TextScalePreset = VALID_SCALES.includes(rawScale as TextScalePreset)
    ? (rawScale as TextScalePreset)
    : 1;
  const colorblindRarityBadges = readStorage(STORAGE_KEYS.colorblindRarityBadges) === 'true';

  return {
    musicVolume: clamp01(getMusicVolume()),
    sfxVolume: clamp01(getSfxVolume()),
    ambientVolume: clamp01(getAmbienceVolume()),
    uiVolume: clamp01(getUiVolume()),
    graphicsQuality,
    reducedMotion,
    textScale,
    colorblindRarityBadges,
  };
}

export function saveUxSettings(state: UxSettingsState): void {
  setMusicVolume(clamp01(state.musicVolume));
  setSfxVolume(clamp01(state.sfxVolume));
  setAmbienceVolume(clamp01(state.ambientVolume));
  setUiVolume(clamp01(state.uiVolume));
  writeStorage(STORAGE_KEYS.graphicsQuality, state.graphicsQuality);
  writeStorage(STORAGE_KEYS.reducedMotion, String(state.reducedMotion));
  writeStorage(STORAGE_KEYS.textScale, String(state.textScale));
  writeStorage(STORAGE_KEYS.colorblindRarityBadges, String(state.colorblindRarityBadges));
}

export function applyUxSettings(state: UxSettingsState): void {
  setAtmosphereReducedMotion(state.reducedMotion);
  if (typeof document !== 'undefined' && document.documentElement) {
    const root = document.documentElement;
    root.style.setProperty('--tv-text-scale', String(state.textScale));
    root.dataset.textScale = String(state.textScale);
    root.dataset.reducedMotion = String(state.reducedMotion);
    root.dataset.colorblindBadges = String(state.colorblindRarityBadges);
    root.dataset.graphicsQuality = state.graphicsQuality;
  }
}

const STYLE_ID = 'tv-ux-settings-style';

function ensureStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .tv-settings-backdrop {
      position: fixed;
      inset: 0;
      height: 100dvh;
      max-height: 100dvh;
      overflow: hidden;
      background: rgba(8, 7, 10, 0.78);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: clamp(8px, 2vh, 20px);
      z-index: 950;
      box-sizing: border-box;
      font-family: Georgia, serif;
      color: #efe4cf;
    }
    .tv-settings-backdrop[hidden] { display: none; }
    .tv-settings-card {
      width: min(760px, 96vw);
      max-height: 92dvh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: linear-gradient(180deg, #1e1814 0%, #120e0c 100%);
      border: 1px solid #6b5335;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.72), inset 0 0 0 1px rgba(255, 224, 150, 0.08);
      border-radius: 6px;
      padding: clamp(10px, 2vh, 18px) clamp(12px, 2.2vw, 22px);
      box-sizing: border-box;
      gap: clamp(8px, 1.4vh, 14px);
    }
    .tv-settings-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(190, 154, 96, 0.25);
      padding-bottom: 8px;
      flex: 0 0 auto;
    }
    .tv-settings-title {
      margin: 0;
      font-size: clamp(16px, 2.2vw, 21px);
      letter-spacing: 0.04em;
      color: #f3d79b;
    }
    .tv-settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: clamp(10px, 1.8vw, 18px);
      flex: 1 1 auto;
      min-height: 0;
    }
    @media (max-width: 620px) {
      .tv-settings-grid { grid-template-columns: 1fr; }
    }
    .tv-settings-section {
      background: rgba(10, 8, 7, 0.45);
      border: 1px solid rgba(168, 134, 82, 0.22);
      border-radius: 4px;
      padding: clamp(8px, 1.4vh, 12px);
      display: flex;
      flex-direction: column;
      gap: clamp(6px, 1.1vh, 10px);
    }
    .tv-settings-section h3 {
      margin: 0;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #d6b67c;
    }
    .tv-slider-row {
      display: grid;
      grid-template-columns: 78px 1fr 40px;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    .tv-slider-row input[type="range"] {
      width: 100%;
      accent-color: #d7a64d;
      cursor: pointer;
    }
    .tv-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 13px;
    }
    .tv-btn-group {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .tv-pill-btn {
      background: #27201a;
      color: #d7cbb8;
      border: 1px solid #59462d;
      border-radius: 4px;
      padding: 5px 10px;
      font-size: 12px;
      cursor: pointer;
      min-height: 30px;
    }
    .tv-pill-btn[aria-pressed="true"] {
      background: #6c4b22;
      color: #fff2d1;
      border-color: #e0b363;
    }
    .tv-settings-foot {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      border-top: 1px solid rgba(190, 154, 96, 0.22);
      padding-top: 8px;
      flex: 0 0 auto;
    }
    .tv-action-btn {
      background: linear-gradient(180deg, #5d401e 0%, #3d2812 100%);
      color: #fae7bd;
      border: 1px solid #b88a44;
      border-radius: 4px;
      padding: 7px 16px;
      font-size: 13px;
      cursor: pointer;
      min-height: 34px;
    }
  `;
  document.head.appendChild(style);
}

export class SettingsPanel {
  readonly root: HTMLElement;
  private state: UxSettingsState;
  private readonly opts: SettingsPanelOptions;
  private openState = false;

  constructor(opts: SettingsPanelOptions = {}) {
    this.opts = opts;
    this.state = loadUxSettings();
    applyUxSettings(this.state);

    if (typeof document === 'undefined') {
      this.root = {} as HTMLElement;
      return;
    }

    ensureStyles();
    this.root = document.createElement('div');
    this.root.className = 'tv-settings-backdrop';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Game Settings');

    this.render();
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });

    (opts.parent ?? document.body).appendChild(this.root);
  }

  getSettings(): UxSettingsState {
    return { ...this.state };
  }

  updateSettings(patch: Partial<UxSettingsState>): UxSettingsState {
    const prev = this.state;
    this.state = { ...this.state, ...patch };
    saveUxSettings(this.state);
    applyUxSettings(this.state);
    if (prev.graphicsQuality !== this.state.graphicsQuality) {
      this.opts.onQualityChange?.(this.state.graphicsQuality === 'high' ? 2 : 0, this.state.graphicsQuality);
    }
    if (prev.reducedMotion !== this.state.reducedMotion) {
      this.opts.onReducedMotionChange?.(this.state.reducedMotion);
    }
    this.opts.onSettingsChange?.(this.getSettings());
    if (typeof document !== 'undefined') this.render();
    return this.getSettings();
  }

  isOpen(): boolean {
    return this.openState;
  }

  open(): void {
    this.state = loadUxSettings();
    this.openState = true;
    this.root.hidden = false;
    if (typeof document !== 'undefined') this.render();
  }

  close(): void {
    this.openState = false;
    this.root.hidden = true;
    this.opts.onClose?.();
  }

  toggle(): void {
    if (this.openState) this.close();
    else this.open();
  }

  destroy(): void {
    this.root.remove?.();
  }

  private render(): void {
    const s = this.state;
    const pct = (v: number) => `${Math.round(v * 100)}%`;

    this.root.innerHTML = `
      <div class="tv-settings-card">
        <div class="tv-settings-head">
          <h2 class="tv-settings-title">Settings & Accessibility</h2>
          <button type="button" class="tv-pill-btn" data-action="close" aria-label="Close settings">Close</button>
        </div>
        <div class="tv-settings-grid">
          <section class="tv-settings-section">
            <h3>Audio Buses</h3>
            <label class="tv-slider-row">
              <span>Music</span>
              <input type="range" min="0" max="100" value="${Math.round(s.musicVolume * 100)}" data-bus="music" />
              <span>${pct(s.musicVolume)}</span>
            </label>
            <label class="tv-slider-row">
              <span>SFX</span>
              <input type="range" min="0" max="100" value="${Math.round(s.sfxVolume * 100)}" data-bus="sfx" />
              <span>${pct(s.sfxVolume)}</span>
            </label>
            <label class="tv-slider-row">
              <span>Ambient</span>
              <input type="range" min="0" max="100" value="${Math.round(s.ambientVolume * 100)}" data-bus="ambient" />
              <span>${pct(s.ambientVolume)}</span>
            </label>
            <label class="tv-slider-row">
              <span>UI</span>
              <input type="range" min="0" max="100" value="${Math.round(s.uiVolume * 100)}" data-bus="ui" />
              <span>${pct(s.uiVolume)}</span>
            </label>
          </section>

          <section class="tv-settings-section">
            <h3>Display & Accessibility</h3>
            <div class="tv-toggle-row">
              <span>Graphics Quality</span>
              <div class="tv-btn-group">
                <button type="button" class="tv-pill-btn" data-quality="high" aria-pressed="${s.graphicsQuality === 'high'}">High</button>
                <button type="button" class="tv-pill-btn" data-quality="low" aria-pressed="${s.graphicsQuality === 'low'}">Low</button>
              </div>
            </div>
            <div class="tv-toggle-row">
              <span>Reduced Motion</span>
              <button type="button" class="tv-pill-btn" data-toggle="reducedMotion" aria-pressed="${s.reducedMotion}">
                ${s.reducedMotion ? 'On' : 'Off'}
              </button>
            </div>
            <div class="tv-toggle-row">
              <span>Text Size</span>
              <div class="tv-btn-group">
                ${VALID_SCALES.map(
                  (sc) =>
                    `<button type="button" class="tv-pill-btn" data-scale="${sc}" aria-pressed="${s.textScale === sc}">${Math.round(sc * 100)}%</button>`,
                ).join('')}
              </div>
            </div>
            <div class="tv-toggle-row">
              <span>Colorblind Rarity Badges</span>
              <button type="button" class="tv-pill-btn" data-toggle="colorblind" aria-pressed="${s.colorblindRarityBadges}">
                ${s.colorblindRarityBadges ? '◆ On' : 'Off'}
              </button>
            </div>
          </section>
        </div>
        <div class="tv-settings-foot">
          <button type="button" class="tv-action-btn" data-action="close">Done</button>
        </div>
      </div>
    `;

    this.root.querySelectorAll<HTMLInputElement>('input[data-bus]').forEach((el) => {
      el.addEventListener('input', () => {
        const val = clamp01(Number(el.value) / 100);
        const bus = el.dataset.bus;
        if (bus === 'music') this.updateSettings({ musicVolume: val });
        else if (bus === 'sfx') this.updateSettings({ sfxVolume: val });
        else if (bus === 'ambient') this.updateSettings({ ambientVolume: val });
        else if (bus === 'ui') this.updateSettings({ uiVolume: val });
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('button[data-quality]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.quality === 'low' ? 'low' : 'high';
        this.updateSettings({ graphicsQuality: q });
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('button[data-scale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sc = Number(btn.dataset.scale) as TextScalePreset;
        if (VALID_SCALES.includes(sc)) this.updateSettings({ textScale: sc });
      });
    });

    this.root.querySelector('button[data-toggle="reducedMotion"]')?.addEventListener('click', () => {
      this.updateSettings({ reducedMotion: !this.state.reducedMotion });
    });

    this.root.querySelector('button[data-toggle="colorblind"]')?.addEventListener('click', () => {
      this.updateSettings({ colorblindRarityBadges: !this.state.colorblindRarityBadges });
    });

    this.root.querySelectorAll('button[data-action="close"]').forEach((btn) => {
      btn.addEventListener('click', () => this.close());
    });
  }
}
