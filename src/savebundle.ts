import type { CampaignRecord } from './flow';
import { campaignSnapshot, decodeSave, encodeSave, type SaveFile } from './save';

/** One file holding every save slot, so a phone can back up everything with a single download. */
export interface BundleEntry {
  id: string;
  file: SaveFile;
}

export interface SaveBundle {
  saves: BundleEntry[];
  campaign: CampaignRecord | null;
}

export function encodeBundle(entries: readonly BundleEntry[], campaign: CampaignRecord | null = null): string {
  return JSON.stringify({ thornvaelBundle: 2, saves: entries.map((e) => ({ id: e.id, text: encodeSave(e.file) })), campaign: campaign === null ? null : campaignSnapshot(campaign) });
}

/** Returns null when the text is not a bundle (a plain single save); throws when a bundle is damaged. */
export function decodeBundle(text: string): SaveBundle | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || !('thornvaelBundle' in raw)) return null;
  const b = raw as { thornvaelBundle?: number; saves?: Array<{ id: string; text: string }>; campaign?: unknown };
  if (b.thornvaelBundle !== 1 && b.thornvaelBundle !== 2) throw new Error('This backup is from an unsupported version.');
  if (!Array.isArray(b.saves)) throw new Error('This backup is damaged.');
  const saves = b.saves.map((s) => {
    if (!s || typeof s.id !== 'string' || typeof s.text !== 'string') throw new Error('This backup is damaged.');
    return { id: s.id, file: decodeSave(s.text) };
  });
  return { saves, campaign: b.thornvaelBundle === 1 || b.campaign === null ? null : campaignSnapshot(b.campaign) };
}
