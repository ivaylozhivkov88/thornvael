import type { CampaignRecord } from './flow';
import { campaignSnapshot, decodeSave, encodeSave, type SaveFile } from './save';

/** One file holding every save slot, so a phone can back up everything with a single download. */
export interface BundleEntry {
  id: string;
  file: SaveFile;
}

export interface CharactersStorePayload {
  v: number;
  list: unknown[];
}

export interface SaveBundle {
  saves: BundleEntry[];
  campaign: CampaignRecord | null;
  characters?: CharactersStorePayload | null;
  activeCharacterId?: string | null;
}

function validCharactersPayload(raw: unknown): CharactersStorePayload | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') throw new Error('This character roster snapshot is damaged.');
  const obj = raw as { v?: unknown; list?: unknown };
  if (obj.v !== 1 || !Array.isArray(obj.list)) throw new Error('This character roster snapshot is damaged.');
  for (const c of obj.list) {
    if (!c || typeof c !== 'object') throw new Error('This character roster snapshot is damaged.');
    const ch = c as { id?: unknown; name?: unknown; cls?: unknown; female?: unknown; diff?: unknown };
    if (
      typeof ch.id !== 'string' ||
      typeof ch.name !== 'string' ||
      typeof ch.cls !== 'number' ||
      typeof ch.female !== 'boolean' ||
      typeof ch.diff !== 'number'
    ) {
      throw new Error('This character roster snapshot is damaged.');
    }
  }
  return structuredClone(obj as CharactersStorePayload);
}

export function encodeBundle(
  entries: readonly BundleEntry[],
  campaign: CampaignRecord | null = null,
  characters: CharactersStorePayload | null = null,
  activeCharacterId: string | null = null,
): string {
  const payload: Record<string, unknown> = {
    thornvaelBundle: 3,
    saves: entries.map((e) => ({ id: e.id, text: encodeSave(e.file) })),
    campaign: campaign === null ? null : campaignSnapshot(campaign),
  };
  if (characters !== null && characters !== undefined) payload.characters = validCharactersPayload(characters);
  if (activeCharacterId !== null && activeCharacterId !== undefined) payload.activeCharacterId = String(activeCharacterId);
  return JSON.stringify(payload);
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
  const b = raw as {
    thornvaelBundle?: number;
    saves?: Array<{ id: string; text: string }>;
    campaign?: unknown;
    characters?: unknown;
    activeCharacterId?: unknown;
  };
  if (b.thornvaelBundle !== 1 && b.thornvaelBundle !== 2 && b.thornvaelBundle !== 3) {
    throw new Error('This backup is from an unsupported version.');
  }
  if (!Array.isArray(b.saves)) throw new Error('This backup is damaged.');
  const saves = b.saves.map((s) => {
    if (!s || typeof s.id !== 'string' || typeof s.text !== 'string') throw new Error('This backup is damaged.');
    return { id: s.id, file: decodeSave(s.text) };
  });
  const campaign = b.thornvaelBundle === 1 || b.campaign === null ? null : campaignSnapshot(b.campaign);
  const characters = b.thornvaelBundle >= 3 && b.characters !== undefined ? validCharactersPayload(b.characters) : null;
  const activeCharacterId =
    b.thornvaelBundle >= 3 && typeof b.activeCharacterId === 'string' ? b.activeCharacterId : null;
  return {
    saves,
    campaign,
    ...(characters !== null ? { characters } : {}),
    ...(activeCharacterId !== null ? { activeCharacterId } : {}),
  };
}
