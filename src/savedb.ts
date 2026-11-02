import type { Campaign } from './campaign';
import { RECORD_KEY, type CampaignRecord } from './flow';
import { campaignForSave, campaignSnapshot, decodeSave, migrateSave, type SaveFile } from './save';
import { decodeBundle, encodeBundle } from './savebundle';

/** Save slots in IndexedDB. One store, keyed by slot id; `auto` is the autosave. Values are save envelopes as they are. */
const DB = 'thornvael';
const STORE = 'saves';
export const AUTO = 'auto';

export interface SlotInfo {
  id: string;
  name: string;
  label: string;
  createdAt: number;
}

let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      opening = null;
      reject(r.error);
    };
  });
  return opening;
}

async function run<T>(mode: IDBTransactionMode, body: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = body(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Non-save records (the campaign progress) live in the same store under their own key; they never show in the slot list. */
export const RECORD_KEYS = ['campaign'];
export const putRecord = (key: string, value: unknown): Promise<unknown> => run('readwrite', (s) => s.put(value, key));
export const getRecord = (key: string): Promise<unknown> => run('readonly', (s) => s.get(key));
export const deleteRecord = (key: string): Promise<unknown> => run('readwrite', (s) => s.delete(key));

export const putSave =(id: string, save: SaveFile): Promise<unknown> => run('readwrite', (s) => s.put(save, id));
export const deleteSave = (id: string): Promise<unknown> => run('readwrite', (s) => s.delete(id));

export async function getSave(id: string): Promise<SaveFile | null> {
  const raw = await run<unknown>('readonly', (s) => s.get(id));
  return raw ? migrateSave(raw) : null;
}

/** Activating a slot explicitly replaces the global record with that slot's own snapshot. */
export async function restoreSaveCampaign(save: SaveFile, campaign: Campaign): Promise<CampaignRecord | null> {
  const rec = campaignForSave(save, campaign);
  if (rec) await putRecord(RECORD_KEY, rec);
  return rec;
}

/** Read slots and the map-only campaign together; a failed read must never yield a partial backup. */
export async function exportAllSaves(): Promise<string | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const keys = store.getAllKeys();
    const values = store.getAll();
    tx.oncomplete = () => {
      try {
        const entries = [];
        let campaign: CampaignRecord | null = null;
        for (const [i, key] of keys.result.entries()) {
          if (key === RECORD_KEY) campaign = campaignSnapshot(values.result[i]);
          else if (!RECORD_KEYS.includes(String(key))) entries.push({ id: String(key), file: migrateSave(values.result[i]) });
        }
        resolve(entries.length || campaign ? encodeBundle(entries, campaign) : null);
      } catch (e) {
        reject(e);
      }
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Validate the whole file first, then import slots + campaign atomically. Never reuse source keys. */
export async function importSaveText(text: string): Promise<void> {
  const bundle = decodeBundle(text);
  const saves = bundle ? bundle.saves.map((s) => s.file) : [decodeSave(text)];
  const campaign = bundle?.campaign;
  const db = await open();
  const prefix = `slot-import-${crypto.randomUUID()}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [i, save] of saves.entries()) store.add(save, `${prefix}-${i}`);
    // v1 bundles and single saves have no standalone record: leave the device's campaign alone.
    if (campaign) store.put(campaign, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Every slot, newest first (the autosave included). */
export async function listSaves(): Promise<SlotInfo[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out: SlotInfo[] = [];
    const req = db.transaction(STORE).objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) {
        resolve(out.sort((a, b) => b.createdAt - a.createdAt));
        return;
      }
      const v = c.value as SaveFile;
      if (RECORD_KEYS.includes(String(c.key))) {
        c.continue();
        return;
      }
      out.push({ id: String(c.key), name: v.name, label: v.label, createdAt: v.createdAt });
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
