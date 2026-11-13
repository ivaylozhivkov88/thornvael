export interface Preferences { sound: boolean; music: boolean; quality: number }
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export const DEFAULT_PREFERENCES: Preferences = { sound: true, music: true, quality: 2 };

export function readPreferences(store?: Store): Preferences {
  const value = { ...DEFAULT_PREFERENCES };
  try {
    const storage = store ?? localStorage;
    for (const key of ['sound', 'music'] as const) {
      const raw = storage.getItem(`thornvael.${key}`);
      if (raw === 'true' || raw === 'false') value[key] = raw === 'true';
    }
    const raw = storage.getItem('thornvael.quality');
    if (raw !== null && /^[0-2]$/.test(raw)) value.quality = Number(raw);
  } catch { /* Private browsing/storage denial retains safe defaults. */ }
  return value;
}

/** Only preferences use localStorage; saves and campaign progress remain in IndexedDB. */
export function writePreference<K extends keyof Preferences>(key: K, value: Preferences[K], store?: Store): boolean {
  if (key === 'quality' ? !Number.isInteger(value) || Number(value) < 0 || Number(value) > 2 : typeof value !== 'boolean') return false;
  try {
    (store ?? localStorage).setItem(`thornvael.${key}`, String(value));
    return true;
  } catch { return false; }
}
