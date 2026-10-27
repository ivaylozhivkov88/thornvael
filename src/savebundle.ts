import { decodeSave, encodeSave, type SaveFile } from './save';

/** One file holding every save slot, so a phone can back up everything with a single download. */
export interface BundleEntry {
  id: string;
  file: SaveFile;
}

export function encodeBundle(entries: readonly BundleEntry[]): string {
  return JSON.stringify({ thornvaelBundle: 1, saves: entries.map((e) => ({ id: e.id, text: encodeSave(e.file) })) });
}

/** Returns null when the text is not a bundle (a plain single save); throws when a bundle is damaged. */
export function decodeBundle(text: string): BundleEntry[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const b = raw as { thornvaelBundle?: number; saves?: Array<{ id: string; text: string }> };
  if (!b || b.thornvaelBundle !== 1 || !Array.isArray(b.saves)) return null;
  return b.saves.map((s) => ({ id: String(s.id), file: decodeSave(s.text) }));
}
