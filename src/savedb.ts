import { migrateSave, type SaveFile } from './save';

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

export const putSave = (id: string, save: SaveFile): Promise<unknown> => run('readwrite', (s) => s.put(save, id));
export const deleteSave = (id: string): Promise<unknown> => run('readwrite', (s) => s.delete(id));

export async function getSave(id: string): Promise<SaveFile | null> {
  const raw = await run<unknown>('readonly', (s) => s.get(id));
  return raw ? migrateSave(raw) : null;
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
      out.push({ id: String(c.key), name: v.name, label: v.label, createdAt: v.createdAt });
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
