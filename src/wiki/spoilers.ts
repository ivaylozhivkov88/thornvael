import type { WikiGate, WikiIndex } from './types';

export interface SpoilerProgress {
  hasSave: boolean;
  heroLabel: string;
  maxAct: number;
  unlockedMissions: Set<string>;
}

const HIDE_PREF_KEY = 'thornvael.wiki.hideSpoilers';
const ACTIVE_CHAR_KEY = 'thornvael.activeChar';
const CLASS_NAMES = ['Warrior', 'Mage', 'Archer', 'Necromancer'];

export function readHideSpoilersPref(): boolean {
  try {
    const v = localStorage.getItem(HIDE_PREF_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export function writeHideSpoilersPref(hide: boolean): void {
  try {
    localStorage.setItem(HIDE_PREF_KEY, hide ? '1' : '0');
  } catch {
    /* ignore storage block */
  }
}

interface StoredChar {
  id: string;
  name: string;
  cls: number;
  level: number;
  played?: number;
  hero?: unknown;
}

interface StoredCampaign {
  progress?: {
    unlocked?: string[];
    completed?: string[];
    node?: string;
  };
}

interface StoredAuto {
  state?: {
    node?: string;
    campaign?: {
      unlocked?: string[];
      completed?: string[];
    };
  };
}

/** Pure progress derivation for testability and read-only IndexedDB parsing. */
export function computeSpoilerProgress(
  charsRaw: unknown,
  campaignRaw: unknown,
  autoRaw: unknown,
  activeCharId: string | null,
  actsByMissionPrefix: Record<string, number>,
): SpoilerProgress {
  const chars = (charsRaw as { v?: number; list?: StoredChar[] } | null)?.list;
  const charList = Array.isArray(chars) ? chars.filter((c) => c && typeof c.id === 'string') : [];
  const activeChar = (activeCharId ? charList.find((c) => c.id === activeCharId) : undefined) ?? charList[0] ?? null;

  const campaign = campaignRaw as StoredCampaign | null;
  const auto = autoRaw as StoredAuto | null;
  const rawNodes = [
    ...(campaign?.progress?.unlocked ?? []),
    ...(campaign?.progress?.completed ?? []),
    ...(campaign?.progress?.node ? [campaign.progress.node] : []),
    ...(auto?.state?.campaign?.unlocked ?? []),
    ...(auto?.state?.campaign?.completed ?? []),
    ...(auto?.state?.node ? [auto.state.node] : []),
  ];

  const hasSave = Boolean(activeChar || rawNodes.length > 0);
  if (!hasSave) {
    return {
      hasSave: false,
      heroLabel: 'No save detected',
      maxAct: 4,
      unlockedMissions: new Set<string>(),
    };
  }

  const unlockedMissions = new Set<string>();
  let maxAct = 1;
  for (const nodeId of rawNodes) {
    const prefix = String(nodeId).split('-')[0];
    if (/^m\d+$/i.test(prefix)) unlockedMissions.add(prefix.toLowerCase());
    if (nodeId === 'town-redmarsh') maxAct = Math.max(maxAct, 2);
    if (nodeId === 'town-oakhaven') maxAct = Math.max(maxAct, 3);
    if (nodeId === 'town-ironcamp') maxAct = Math.max(maxAct, 4);
    const act = actsByMissionPrefix[prefix];
    if (act && act > maxAct) maxAct = act;
  }

  if (rawNodes.length === 0 && activeChar) {
    if ((activeChar.played ?? 0) > 0 || activeChar.level > 1) {
      maxAct = activeChar.level >= 18 ? 4 : activeChar.level >= 12 ? 3 : activeChar.level >= 6 ? 2 : 1;
    } else {
      unlockedMissions.add('m01');
    }
  }

  const clsName = activeChar ? CLASS_NAMES[activeChar.cls] ?? 'Hero' : 'Hero';
  const heroLabel = activeChar
    ? `${activeChar.name} · Lv ${activeChar.level ?? 1} ${clsName} · Act ${maxAct}`
    : `Campaign Save · Act ${maxAct}`;

  return { hasSave: true, heroLabel, maxAct, unlockedMissions };
}

export function isGateSpoiled(
  gate: WikiGate | undefined,
  hideSpoilers: boolean,
  progress: SpoilerProgress,
  actsByMissionPrefix: Record<string, number>,
): boolean {
  if (!hideSpoilers || !progress.hasSave || !gate) return false;
  if (gate.m) {
    const mKey = gate.m.toLowerCase();
    if (progress.unlockedMissions.size > 0) {
      if (progress.unlockedMissions.has(mKey)) return false;
      const mAct = actsByMissionPrefix[mKey] ?? 1;
      return mAct > progress.maxAct || !progress.unlockedMissions.has(mKey);
    }
    return (actsByMissionPrefix[mKey] ?? 1) > progress.maxAct;
  }
  if (gate.a) {
    return gate.a > progress.maxAct;
  }
  return false;
}

/**
 * Reads active hero & campaign progress read-only from IndexedDB (`thornvael` / `saves`).
 * Aborts immediately on `onupgradeneeded` if no DB exists so it never creates or mutates game storage.
 */
export async function readSpoilerProgress(index: WikiIndex): Promise<SpoilerProgress> {
  const empty: SpoilerProgress = {
    hasSave: false,
    heroLabel: 'No save detected',
    maxAct: 4,
    unlockedMissions: new Set<string>(),
  };
  if (typeof indexedDB === 'undefined') return empty;

  let activeCharId: string | null = null;
  try {
    activeCharId = localStorage.getItem(ACTIVE_CHAR_KEY);
  } catch {
    activeCharId = null;
  }

  try {
    if (typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      if (!dbs.some((d) => d.name === 'thornvael')) return empty;
    }
  } catch {
    /* Safari fallback: guarded by onupgradeneeded abort below */
  }

  return new Promise<SpoilerProgress>((resolve) => {
    let settled = false;
    const finish = (val: SpoilerProgress) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    try {
      const req = indexedDB.open('thornvael', 1);
      req.onupgradeneeded = () => {
        try {
          req.transaction?.abort();
        } catch {
          /* ignore */
        }
        finish(empty);
      };
      req.onerror = () => finish(empty);
      req.onsuccess = () => {
        const db = req.result;
        try {
          if (!db.objectStoreNames.contains('saves')) {
            db.close();
            finish(empty);
            return;
          }
          const tx = db.transaction('saves', 'readonly');
          const store = tx.objectStore('saves');
          const rChars = store.get('characters');
          const rCamp = store.get('campaign');
          const rAuto = store.get('auto');
          tx.oncomplete = () => {
            db.close();
            finish(computeSpoilerProgress(rChars.result, rCamp.result, rAuto.result, activeCharId, index.acts ?? {}));
          };
          tx.onerror = () => {
            db.close();
            finish(empty);
          };
          tx.onabort = () => {
            db.close();
            finish(empty);
          };
        } catch {
          try {
            db.close();
          } catch {
            /* ignore */
          }
          finish(empty);
        }
      };
    } catch {
      finish(empty);
    }
  });
}
