import { isReducedMotionActive, setAtmosphereReducedMotion } from '../atmosphere';
import {
  getAmbienceVolume,
  getMasterVolume,
  getMusicVolume,
  getSfxVolume,
  getUiVolume,
  isMuteOnBlur,
  setAmbienceVolume,
  setMainMenuMusic,
  setMasterVolume,
  setMusic,
  setMusicVolume,
  setMuteOnBlur,
  setSfxVolume,
  setUiVolume,
} from '../audio';
import { DEFAULT_KEYBINDS, keybindManager } from '../keybinds';
import {
  type AutoCastMode,
  type AutoFightMode,
  type Preferences,
  readPreferences,
  writePreference,
} from '../preferences';
import { S } from '../strings';
import { MobileControlsHelp } from '../ui-extra/mobile-controls-help';
import { applyUxSettings, loadUxSettings, saveUxSettings, type TextScalePreset } from '../ui-extra/settings-panel';
import { btn, el } from './dom';

const T = S.shell;

export type AudioVolumeBus = 'master' | 'music' | 'sfx' | 'ambience' | 'ui';

const GRAPHICS_QUALITY_STORAGE_KEY = 'thornvael.graphicsQuality';
const REDUCED_MOTION_STORAGE_KEY = 'thornvael.reducedMotion';
const SETTINGS_STYLE_ID = 'sh-settings-view-style';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
}

export function getAudioBusVolume(bus: AudioVolumeBus): number {
  switch (bus) {
    case 'master':
      return clamp01(getMasterVolume());
    case 'music':
      return clamp01(getMusicVolume());
    case 'sfx':
      return clamp01(getSfxVolume());
    case 'ambience':
      return clamp01(getAmbienceVolume());
    case 'ui':
      return clamp01(getUiVolume());
  }
}

export function setAudioBusVolume(bus: AudioVolumeBus, value01: number): void {
  const clamped = clamp01(value01);
  switch (bus) {
    case 'master':
      setMasterVolume(clamped);
      break;
    case 'music':
      setMusicVolume(clamped);
      break;
    case 'sfx':
      setSfxVolume(clamped);
      break;
    case 'ambience':
      setAmbienceVolume(clamped);
      break;
    case 'ui':
      setUiVolume(clamped);
      break;
  }
}

/**
 * Binds a range input [0..100] to a specific Web Audio bus and optional percentage readout.
 */
export function bindAudioSlider(
  input: HTMLInputElement,
  bus: AudioVolumeBus,
  valueLabel?: HTMLElement | null,
  onChange?: (value01: number) => void,
): () => void {
  const syncDisplay = (v01: number): void => {
    const pct = Math.round(clamp01(v01) * 100);
    input.value = String(pct);
    if (valueLabel) valueLabel.textContent = `${pct}%`;
  };

  syncDisplay(getAudioBusVolume(bus));

  const onInput = (): void => {
    const v01 = clamp01(Number(input.value) / 100);
    setAudioBusVolume(bus, v01);
    syncDisplay(v01);
    onChange?.(v01);
  };

  input.addEventListener?.('input', onInput);
  return () => {
    input.removeEventListener?.('input', onInput);
  };
}

/**
 * Cycles and persists the 3-tier graphics quality preference (0 Low, 1 Medium, 2 High).
 */
export function bindQualityControl(
  button: HTMLButtonElement,
  prefs: Preferences,
  onStorageError?: () => void,
  onQualityChange?: (quality: number) => void,
): () => void {
  const syncDocumentQuality = (q: number): void => {
    const preset = q === 0 ? 'low' : 'high';
    try {
      localStorage.setItem(GRAPHICS_QUALITY_STORAGE_KEY, preset);
    } catch {
      // Ignore storage failures.
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.graphicsQuality = preset;
    }
  };

  const refresh = (): void => {
    button.textContent = `${S.quality}: ${T.preferenceQuality[prefs.quality]}`;
  };

  refresh();
  const handleClick = (): void => {
    prefs.quality = (prefs.quality + 1) % 3;
    if (!writePreference('quality', prefs.quality)) {
      onStorageError?.();
    }
    syncDocumentQuality(prefs.quality);
    refresh();
    onQualityChange?.(prefs.quality);
  };
  button.onclick = handleClick;
  return () => {
    if (button.onclick === handleClick) button.onclick = null;
  };
}

/**
 * Binds reduced-motion accessibility state across AtmosphereSystem, FxEngine, and DOM attributes.
 */
export function bindReducedMotionToggle(button: HTMLButtonElement, onToggle?: (reduced: boolean) => void): () => void {
  let reduced = isReducedMotionActive();

  const apply = (next: boolean): void => {
    reduced = next;
    setAtmosphereReducedMotion(next);
    try {
      localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, String(next));
    } catch {
      // Ignore storage failures.
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.reducedMotion = String(next);
    }
    button.textContent = `Reduced Motion: ${next ? T.preferenceOn : T.preferenceOff}`;
    button.setAttribute?.('aria-pressed', String(next));
  };

  apply(reduced);
  const handleClick = (): void => {
    apply(!reduced);
    onToggle?.(reduced);
  };
  button.onclick = handleClick;
  return () => {
    if (button.onclick === handleClick) button.onclick = null;
  };
}

function normalizeBoundKeyLabel(e: KeyboardEvent): string {
  if (e.code === 'Space') return 'Space';
  if (e.code === 'Escape') return 'ESC';
  if (e.code.startsWith('Digit')) return e.code.replace('Digit', '');
  if (e.code.startsWith('Key')) return e.code.replace('Key', '');
  return (e.key || e.code || '?').toUpperCase();
}

/**
 * Populates interactive keybind rebinding rows and manages safe capture listener cleanup.
 */
export function bindKeybindingsList(container: HTMLElement): () => void {
  let activeCleanup: (() => void) | null = null;

  const cancelListening = (): void => {
    activeCleanup?.();
    activeCleanup = null;
  };

  const renderRows = (): void => {
    cancelListening();
    container.replaceChildren();

    const head = el('div', 'sh-settings-kb-head');
    head.append(
      el('span', 'sh-settings-subhead', 'Keybindings'),
      btn(
        'Reset Defaults',
        () => {
          keybindManager.resetDefaults();
          renderRows();
        },
        'sh-small sh-settings-mini-btn',
      ),
    );
    container.append(head);

    const list = el('div', 'sh-settings-kb-list');
    for (const action of DEFAULT_KEYBINDS) {
      const bind = keybindManager.getBinding(action.id);
      const row = el('div', 'sh-settings-kb-row');
      const label = el('span', 'sh-settings-kb-label', action.label);
      const rebindBtn = btn(bind.key, () => undefined, 'sh-small sh-settings-kb-btn');
      rebindBtn.setAttribute?.('aria-label', `Rebind ${action.label} (${bind.key})`);

      rebindBtn.onclick = () => {
        if (activeCleanup) {
          cancelListening();
          renderRows();
          return;
        }
        rebindBtn.textContent = 'Press key...';
        rebindBtn.classList.add('sh-on');

        const onKey = (e: KeyboardEvent): void => {
          e.preventDefault();
          e.stopPropagation();
          cancelListening();
          if (e.key !== 'Escape') {
            keybindManager.setBinding(action.id, normalizeBoundKeyLabel(e), e.code);
          }
          renderRows();
        };

        window.addEventListener?.('keydown', onKey, true);
        activeCleanup = () => {
          window.removeEventListener?.('keydown', onKey, true);
        };
      };

      row.append(label, rebindBtn);
      list.append(row);
    }
    container.append(list);
  };

  renderRows();
  return () => {
    cancelListening();
  };
}

function ensureSettingsStyles(): void {
  if (typeof document === 'undefined' || !document.head || document.getElementById?.(SETTINGS_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = SETTINGS_STYLE_ID;
  style.textContent = `
    #shell .sh-settings-shell {
      display: flex;
      flex-direction: column;
      width: min(94vw, 760px);
      height: 100dvh;
      max-height: 100dvh;
      margin: 0 auto;
      padding: clamp(8px, 1.5vh, 16px) 0;
      gap: clamp(6px, 1vh, 10px);
      box-sizing: border-box;
      overflow: hidden;
    }
    #shell .sh-settings-head, #shell .sh-settings-foot {
      flex: 0 0 auto;
    }
    #shell .sh-settings-grid {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: clamp(8px, 1.4vw, 14px);
      align-content: start;
    }
    #shell .sh-settings-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: clamp(8px, 1.2vh, 12px);
      background: rgba(20, 16, 12, 0.72);
      border: 1px solid #6e5530;
      border-radius: 8px;
    }
    #shell .sh-settings-card h3 {
      margin: 0 0 2px;
      font-size: 13px;
      color: #d8b24a;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    #shell .sh-slider-row {
      display: grid;
      grid-template-columns: 74px 1fr 38px;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    #shell .sh-slider-row input[type="range"] {
      width: 100%;
      accent-color: #d8b24a;
      cursor: pointer;
    }
    #shell .sh-settings-kb-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    #shell .sh-settings-subhead {
      font-size: 12px;
      color: #d8b24a;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    #shell .sh-settings-kb-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 4px 10px;
    }
    #shell .sh-settings-kb-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-size: 12px;
    }
    #shell .sh-settings-kb-btn, #shell .sh-settings-mini-btn {
      min-height: 28px;
      padding: 2px 8px;
      font-size: 12px;
    }
    #shell .sh-settings-foot {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }
  `;
  document.head.append(style);
}

export interface SettingsViewOptions {
  onBack: () => void;
  onEraseCampaign: () => Promise<unknown> | void;
}

/**
 * Builds the shell settings view and binds preference toggles, audio sliders,
 * quality preset, reduced motion, keybindings, and campaign reset actions.
 */
export function renderSettingsView(opts: SettingsViewOptions): {
  element: HTMLElement;
  dispose: () => void;
} {
  ensureSettingsStyles();
  const cleanups: Array<() => void> = [];

  const root = el('div', 'sh-settings-shell');
  const head = el('div', 'sh-settings-head');
  const notice = el('p', 'note');
  head.append(el('h2', '', T.settings), el('p', 'note', T.soundInfo), notice);

  const prefs = readPreferences();

  // Preferences & Display Card (keeps exact button labels & aria-pressed attributes for E2E compatibility)
  const displayCard = el('div', 'sh-settings-card');
  displayCard.append(el('h3', '', 'Audio & Display'));

  for (const key of ['sound', 'music'] as const) {
    const control = btn('', () => {
      prefs[key] = !prefs[key];
      if (!writePreference(key, prefs[key])) notice.textContent = T.preferenceStorage;
      if (key === 'music') {
        if (prefs[key]) setMainMenuMusic();
        else setMusic(false, 'town');
      }
      refresh();
    });
    const refresh = (): void => {
      control.textContent = `${T.preferenceLabels[key]}: ${prefs[key] ? T.preferenceOn : T.preferenceOff}`;
      control.setAttribute?.('aria-pressed', String(prefs[key]));
    };
    refresh();
    displayCard.append(control);
  }

  const qualityBtn = btn('', () => undefined);
  cleanups.push(
    bindQualityControl(qualityBtn, prefs, () => {
      notice.textContent = T.preferenceStorage;
    }),
  );
  displayCard.append(qualityBtn);

  const reducedMotionBtn = btn('', () => undefined, 'sh-small');
  cleanups.push(bindReducedMotionToggle(reducedMotionBtn));
  displayCard.append(reducedMotionBtn);

  const ux = loadUxSettings();
  const TEXT_SCALES: readonly TextScalePreset[] = [0.9, 1, 1.15, 1.3];
  const scaleBtn = btn(
    '',
    () => {
      const idx = TEXT_SCALES.indexOf(ux.textScale);
      ux.textScale = TEXT_SCALES[(idx + 1) % TEXT_SCALES.length]!;
      saveUxSettings(ux);
      applyUxSettings(ux);
      refreshUxBtns();
    },
    'sh-small',
  );
  const cbBtn = btn(
    '',
    () => {
      ux.colorblindRarityBadges = !ux.colorblindRarityBadges;
      saveUxSettings(ux);
      applyUxSettings(ux);
      refreshUxBtns();
    },
    'sh-small',
  );
  const refreshUxBtns = (): void => {
    scaleBtn.textContent = `Text Size: ${Math.round(ux.textScale * 100)}%`;
    cbBtn.textContent = `Rarity Badges: ${ux.colorblindRarityBadges ? T.preferenceOn : T.preferenceOff}`;
    cbBtn.setAttribute?.('aria-pressed', String(ux.colorblindRarityBadges));
  };
  refreshUxBtns();
  const touchHelpBtn = btn(
    'Touch Controls Guide',
    () => {
      if (typeof document !== 'undefined' && document.head) {
        new MobileControlsHelp().open();
      }
    },
    'sh-small',
  );
  displayCard.append(scaleBtn, cbBtn, touchHelpBtn);

  // Audio Mix Sliders Card
  const audioCard = el('div', 'sh-settings-card');
  audioCard.append(el('h3', '', 'Audio Mix'));
  const buses: ReadonlyArray<{ bus: AudioVolumeBus; label: string }> = [
    { bus: 'master', label: 'Master' },
    { bus: 'music', label: 'Music' },
    { bus: 'sfx', label: 'SFX' },
    { bus: 'ambience', label: 'Ambience' },
    { bus: 'ui', label: 'UI' },
  ];
  for (const entry of buses) {
    const row = el('label', 'sh-slider-row');
    const nameEl = el('span', '', entry.label);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.setAttribute?.('aria-label', `${entry.label} volume`);
    const pctEl = el('span', '', '');
    cleanups.push(bindAudioSlider(slider, entry.bus, pctEl));
    row.append(nameEl, slider, pctEl);
    audioCard.append(row);
  }
  const blurMuteBtn = btn(
    '',
    () => {
      setMuteOnBlur(!isMuteOnBlur());
      refreshBlurMute();
    },
    'sh-small',
  );
  const refreshBlurMute = (): void => {
    const on = isMuteOnBlur();
    blurMuteBtn.textContent = `Mute on Blur: ${on ? T.preferenceOn : T.preferenceOff}`;
    blurMuteBtn.setAttribute?.('aria-pressed', String(on));
  };
  refreshBlurMute();
  audioCard.append(blurMuteBtn);

  // Keybindings Card
  const keybindsCard = el('div', 'sh-settings-card');
  cleanups.push(bindKeybindingsList(keybindsCard));

  // Gameplay Assists (Optional) Card
  const assistsCard = el('div', 'sh-settings-card');
  assistsCard.append(el('h3', '', 'Gameplay Assists (Optional)'));

  const autoCastBtn = btn(
    '',
    () => {
      const modes: AutoCastMode[] = ['off', 'per-spell', 'smart'];
      const curIdx = modes.indexOf(prefs.autoCastMode ?? 'per-spell');
      const nextMode = modes[(curIdx + 1) % modes.length]!;
      prefs.autoCastMode = nextMode;
      if (!writePreference('autoCastMode', nextMode)) notice.textContent = T.preferenceStorage;
      refreshAssists();
    },
    'sh-small',
  );

  const autoNavBtn = btn(
    '',
    () => {
      prefs.autoNavigateObjectives = !prefs.autoNavigateObjectives;
      if (!writePreference('autoNavigateObjectives', prefs.autoNavigateObjectives))
        notice.textContent = T.preferenceStorage;
      refreshAssists();
    },
    'sh-small',
  );

  const autoFightBtn = btn(
    '',
    () => {
      const modes: AutoFightMode[] = ['off', 'self-defense', 'tactical'];
      const curIdx = modes.indexOf(prefs.autoFightMode ?? 'off');
      const nextMode = modes[(curIdx + 1) % modes.length]!;
      prefs.autoFightMode = nextMode;
      if (!writePreference('autoFightMode', nextMode)) notice.textContent = T.preferenceStorage;
      refreshAssists();
    },
    'sh-small',
  );

  const autoLootBtn = btn(
    '',
    () => {
      prefs.autoLootSweep = !prefs.autoLootSweep;
      if (!writePreference('autoLootSweep', prefs.autoLootSweep)) notice.textContent = T.preferenceStorage;
      refreshAssists();
    },
    'sh-small',
  );

  const autoHealBtn = btn(
    '',
    () => {
      const thresholds = [50, 65, 80];
      const cur = prefs.autoHealThresholdPct ?? 65;
      const next = thresholds[(thresholds.indexOf(cur) + 1) % thresholds.length] ?? 65;
      prefs.autoHealThresholdPct = next;
      if (!writePreference('autoHealThresholdPct', next)) notice.textContent = T.preferenceStorage;
      refreshAssists();
    },
    'sh-small',
  );

  const manaResBtn = btn(
    '',
    () => {
      const reserves = [10, 15, 25];
      const cur = prefs.manaReservePct ?? 15;
      const next = reserves[(reserves.indexOf(cur) + 1) % reserves.length] ?? 15;
      prefs.manaReservePct = next;
      if (!writePreference('manaReservePct', next)) notice.textContent = T.preferenceStorage;
      refreshAssists();
    },
    'sh-small',
  );

  const autoPotionBtn = btn(
    '',
    () => {
      const pots = [0, 30, 45];
      const cur = prefs.autoPotionThresholdPct ?? 0;
      const next = pots[(pots.indexOf(cur) + 1) % pots.length] ?? 0;
      prefs.autoPotionThresholdPct = next;
      if (!writePreference('autoPotionThresholdPct', next)) notice.textContent = T.preferenceStorage;
      refreshAssists();
    },
    'sh-small',
  );

  const refreshAssists = (): void => {
    autoCastBtn.textContent = `Auto-Cast: ${prefs.autoCastMode ?? 'per-spell'}`;
    autoNavBtn.textContent = `Auto-Go: ${prefs.autoNavigateObjectives ? 'ON' : 'OFF'}`;
    autoFightBtn.textContent = `Auto-Fight: ${prefs.autoFightMode ?? 'off'}`;
    autoLootBtn.textContent = `Auto-Loot Sweep: ${prefs.autoLootSweep ? 'ON' : 'OFF'}`;
    autoHealBtn.textContent = `Auto-Heal: ${prefs.autoHealThresholdPct ?? 65}% HP`;
    manaResBtn.textContent = `Mana Reserve: ${prefs.manaReservePct ?? 15}%`;
    autoPotionBtn.textContent = `Auto-Potion: ${(prefs.autoPotionThresholdPct ?? 0) > 0 ? `${prefs.autoPotionThresholdPct}% HP` : 'OFF'}`;
  };
  refreshAssists();

  assistsCard.append(autoCastBtn, autoNavBtn, autoFightBtn, autoLootBtn, autoHealBtn, manaResBtn, autoPotionBtn);

  const grid = el('div', 'sh-settings-grid');
  grid.append(displayCard, audioCard, keybindsCard, assistsCard);

  // Footer with Erase Campaign confirmation and Back button
  const foot = el('div', 'sh-settings-foot');
  const ask = btn(
    T.reset,
    () => {
      const sure = btn(T.resetSure, () => void opts.onEraseCampaign());
      ask.replaceWith(el('p', 'note', T.resetAsk), sure);
    },
    'sh-small sh-quiet',
  );
  const backBtn = btn(T.back, opts.onBack, 'sh-small');
  foot.append(ask, backBtn);

  root.append(head, grid, foot);

  return {
    element: root,
    dispose: () => {
      for (const cleanup of cleanups) cleanup();
      cleanups.length = 0;
    },
  };
}
