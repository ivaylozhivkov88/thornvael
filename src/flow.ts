import { completeNode, newProgress, nodeOf, visitTown, type Campaign, type CampaignNode, type CampaignProgress } from './campaign';
import type { CarryoverState } from './carryover';

/** Pure screen-flow rules of the campaign shell: what the record holds and how it changes between screens. No browser access. */
export interface HeroPick {
  cls: number; // 0 warrior, 1 mage
  female: boolean;
}

export interface LastResult {
  node: string;
  win: boolean;
  text: string;
  up: number; // soldiers standing at the end
  size: number; // soldiers at the start of the count
  gold: number;
}

export interface CampaignRecord {
  v: 1;
  progress: CampaignProgress;
  hero: HeroPick;
  carry: CarryoverState | null; // what the hero takes into the next node; null before the first mission is won
  last: LastResult | null; // shown once on the map as the result screen
}

export const RECORD_KEY = 'campaign';

export function newRecord(c: Campaign, pick: HeroPick, difficulty: number): CampaignRecord {
  return { v: 1, progress: newProgress(c, difficulty), hero: pick, carry: null, last: null };
}

export function parseRecord(raw: unknown): CampaignRecord | null {
  const r = raw as CampaignRecord | null;
  if (!r || r.v !== 1 || !r.progress || !Array.isArray(r.progress.unlocked) || !r.hero) return null;
  return r;
}

/** The page address that starts a node: the engine reads `mission` for the map and `campaign` for the node. */
export const nodeUrl = (n: CampaignNode): string => `./?mission=${encodeURIComponent(n.map)}&campaign=${encodeURIComponent(n.id)}`;

/** A node can be entered when it is unlocked and its map ships with the game. */
export function canEnter(rec: CampaignRecord, id: string, maps: ReadonlySet<string>, c: Campaign): boolean {
  return rec.progress.unlocked.includes(id) && maps.has(nodeOf(c, id).map);
}

/** A mission ended. A win opens what it unlocks and keeps the hero's new state; a loss keeps the old state, so the player retries. */
export function afterMission(c: Campaign, rec: CampaignRecord, id: string, win: boolean, carry: CarryoverState | null, last: Omit<LastResult, 'node' | 'win'>): CampaignRecord {
  const result: LastResult = { node: id, win, ...last };
  if (!win) return { ...rec, last: result };
  const progress = completeNode(c, rec.progress, id);
  return { ...rec, progress, carry: carry ? { ...carry, progress } : rec.carry, last: result };
}

/** Leaving a town: count the visit and keep what was bought, learned or hired. */
export function afterTown(c: Campaign, rec: CampaignRecord, id: string, carry: CarryoverState | null): CampaignRecord {
  nodeOf(c, id);
  const progress = visitTown(rec.progress, id);
  return { ...rec, progress, carry: carry ? { ...carry, progress } : rec.carry, last: null };
}

/** The result screen has been shown. */
export const clearLast = (rec: CampaignRecord): CampaignRecord => ({ ...rec, last: null });
