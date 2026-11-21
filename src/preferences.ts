export type AutoCastMode = 'off' | 'per-spell' | 'smart';
export type AutoFightMode = 'off' | 'self-defense' | 'tactical';

export interface GameplayAssists {
  autoCastMode?: AutoCastMode;
  autoHealThresholdPct?: number; // 25..90, default 65
  manaReservePct?: number; // 0..50, default 15
  autoNavigateObjectives?: boolean; // default false
  autoFightMode?: AutoFightMode; // default 'off'
  autoLootSweep?: boolean; // default false
  autoPotionThresholdPct?: number; // 0 (off), 30, 45, default 0
}

export interface Preferences extends GameplayAssists {
  sound: boolean;
  music: boolean;
  quality: number;
  weather: boolean;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export const DEFAULT_GAMEPLAY_ASSISTS: Required<GameplayAssists> = {
  autoCastMode: 'per-spell',
  autoHealThresholdPct: 65,
  manaReservePct: 15,
  autoNavigateObjectives: false,
  autoFightMode: 'off',
  autoLootSweep: false,
  autoPotionThresholdPct: 0,
};

export const DEFAULT_PREFERENCES: Preferences = {
  sound: true,
  music: true,
  quality: 2,
  weather: true,
};

function attachGameplayAssists(target: Preferences, assists: Required<GameplayAssists>): void {
  for (const [k, v] of Object.entries(assists)) {
    Object.defineProperty(target, k, {
      value: v,
      enumerable: false,
      writable: true,
      configurable: true,
    });
  }
}

attachGameplayAssists(DEFAULT_PREFERENCES, DEFAULT_GAMEPLAY_ASSISTS);

export function getGameplayAssists(prefs: Preferences): Required<GameplayAssists> {
  return {
    autoCastMode: prefs.autoCastMode ?? DEFAULT_GAMEPLAY_ASSISTS.autoCastMode,
    autoHealThresholdPct: prefs.autoHealThresholdPct ?? DEFAULT_GAMEPLAY_ASSISTS.autoHealThresholdPct,
    manaReservePct: prefs.manaReservePct ?? DEFAULT_GAMEPLAY_ASSISTS.manaReservePct,
    autoNavigateObjectives: prefs.autoNavigateObjectives ?? DEFAULT_GAMEPLAY_ASSISTS.autoNavigateObjectives,
    autoFightMode: prefs.autoFightMode ?? DEFAULT_GAMEPLAY_ASSISTS.autoFightMode,
    autoLootSweep: prefs.autoLootSweep ?? DEFAULT_GAMEPLAY_ASSISTS.autoLootSweep,
    autoPotionThresholdPct: prefs.autoPotionThresholdPct ?? DEFAULT_GAMEPLAY_ASSISTS.autoPotionThresholdPct,
  };
}

export function readPreferences(store?: Store): Preferences {
  const value: Preferences = {
    sound: DEFAULT_PREFERENCES.sound,
    music: DEFAULT_PREFERENCES.music,
    quality: DEFAULT_PREFERENCES.quality,
    weather: DEFAULT_PREFERENCES.weather,
  };

  const assists: Required<GameplayAssists> = { ...DEFAULT_GAMEPLAY_ASSISTS };

  try {
    const storage = store ?? localStorage;
    for (const key of ['sound', 'music', 'weather'] as const) {
      const raw = storage.getItem(`thornvael.${key}`);
      if (raw === 'true' || raw === 'false') value[key] = raw === 'true';
    }
    const rawQuality = storage.getItem('thornvael.quality');
    if (rawQuality !== null && /^[0-2]$/.test(rawQuality)) value.quality = Number(rawQuality);

    // Optional Gameplay Assists
    const rawCast = storage.getItem('thornvael.autoCastMode');
    if (rawCast === 'off' || rawCast === 'per-spell' || rawCast === 'smart') {
      assists.autoCastMode = rawCast;
    }

    const rawFight = storage.getItem('thornvael.autoFightMode');
    if (rawFight === 'off' || rawFight === 'self-defense' || rawFight === 'tactical') {
      assists.autoFightMode = rawFight;
    }

    const rawNav = storage.getItem('thornvael.autoNavigateObjectives');
    if (rawNav === 'true' || rawNav === 'false') {
      assists.autoNavigateObjectives = rawNav === 'true';
    }

    const rawLoot = storage.getItem('thornvael.autoLootSweep');
    if (rawLoot === 'true' || rawLoot === 'false') {
      assists.autoLootSweep = rawLoot === 'true';
    }

    const rawHeal = storage.getItem('thornvael.autoHealThresholdPct');
    if (rawHeal !== null) {
      const n = Number(rawHeal);
      if (Number.isFinite(n) && n >= 25 && n <= 90) {
        assists.autoHealThresholdPct = Math.round(n);
      }
    }

    const rawMana = storage.getItem('thornvael.manaReservePct');
    if (rawMana !== null) {
      const n = Number(rawMana);
      if (Number.isFinite(n) && n >= 0 && n <= 50) {
        assists.manaReservePct = Math.round(n);
      }
    }

    const rawPot = storage.getItem('thornvael.autoPotionThresholdPct');
    if (rawPot !== null) {
      const n = Number(rawPot);
      if (Number.isFinite(n) && n >= 0 && n <= 100) {
        assists.autoPotionThresholdPct = Math.round(n);
      }
    }
  } catch {
    /* Private browsing/storage denial retains safe defaults. */
  }

  attachGameplayAssists(value, assists);
  return value;
}

/** Only preferences use localStorage; saves and campaign progress remain in IndexedDB. */
export function writePreference<K extends keyof Preferences>(key: K, value: Preferences[K], store?: Store): boolean {
  if (key === 'quality') {
    if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 2) return false;
  } else if (key === 'sound' || key === 'music' || key === 'weather') {
    if (typeof value !== 'boolean') return false;
  } else if (key === 'autoNavigateObjectives' || key === 'autoLootSweep') {
    if (typeof value !== 'boolean') return false;
  } else if (key === 'autoCastMode') {
    if (value !== 'off' && value !== 'per-spell' && value !== 'smart') return false;
  } else if (key === 'autoFightMode') {
    if (value !== 'off' && value !== 'self-defense' && value !== 'tactical') return false;
  } else if (key === 'autoHealThresholdPct') {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 25 || value > 90) return false;
  } else if (key === 'manaReservePct') {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 50) return false;
  } else if (key === 'autoPotionThresholdPct') {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 100) return false;
  } else {
    return false;
  }

  try {
    (store ?? localStorage).setItem(`thornvael.${key}`, String(value));
    return true;
  } catch {
    return false;
  }
}
