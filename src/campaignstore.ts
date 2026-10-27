import { parseCampaign, type Campaign } from './campaign';
import { parseRecord, RECORD_KEY, type CampaignRecord } from './flow';
import { getRecord, putRecord } from './savedb';

/** Browser side of the campaign: the data file and the record in IndexedDB. Kept apart from flow.ts so the rules stay testable in plain Node. */
export async function loadCampaign(): Promise<Campaign> {
  const r = await fetch(`${import.meta.env.BASE_URL}data/campaign.json`);
  if (!r.ok) throw new Error(`data/campaign.json: HTTP ${r.status}`);
  return parseCampaign(await r.json());
}

export async function readRecord(): Promise<CampaignRecord | null> {
  try {
    return parseRecord(await getRecord(RECORD_KEY));
  } catch {
    return null;
  }
}

export const writeRecord = (rec: CampaignRecord): Promise<unknown> => putRecord(RECORD_KEY, rec);
