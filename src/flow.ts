import { actOf, completeNode, newProgress, nextSessionSeed, nodeOf, townNodeForAct, visitTown, type Campaign, type CampaignNode, type CampaignProgress } from './campaign';
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
  branch?: number;
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
/** Act I is one connected world: its start and its town both open that map. */
const worldMapOf = (n: CampaignNode): string => (n.id === 'town-thornwick' || n.id === 'm01-blood-at-the-ford' ? 'act1-world' : n.map);
export const nodeUrl = (n: CampaignNode): string => `./?mission=${encodeURIComponent(worldMapOf(n))}&campaign=${encodeURIComponent(n.id)}`;

/** A node can be entered when it is unlocked and its map ships with the game. */
export function canEnter(rec: CampaignRecord, id: string, maps: ReadonlySet<string>, c: Campaign): boolean {
  return rec.progress.unlocked.includes(id) && maps.has(nodeOf(c, id).map);
}

/** A mission ended. A win opens what it unlocks and keeps the hero's new state; a loss keeps the old state, so the player retries. */
export function afterMission(c: Campaign, rec: CampaignRecord, id: string, win: boolean, carry: CarryoverState | null, last: Omit<LastResult, 'node' | 'win'>): CampaignRecord {
  const result: LastResult = { node: id, win, ...last };
  if (!win) return { ...rec, last: result };
  const progress = completeNode(c, rec.progress, id, last.branch);
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

/**
 * D2R Save and Exit:
 * Saves the hero's progress (XP, attributes, inventory, eq, gold, spells, mercs)
 * Moves current node to the Town Hub of the current Act.
 * Rotates the session seed for the next adventure session.
 * Fully restores hero and merc HP/mana for a fresh respawn in town.
 */
export function saveAndExitRecord(c: Campaign, rec: CampaignRecord, carry: CarryoverState | null): CampaignRecord {
  const currentNode = nodeOf(c, rec.progress.node);
  const currentAct = actOf(currentNode);
  const townNode = townNodeForAct(c, currentAct);

  // Rotate session seed for fresh dynamic respawns next time hero steps into wilderness
  const newSeed = nextSessionSeed(rec.progress.sessionSeed ?? 1234567, rec.progress.townVisits + 1);

  // Ensure town node is unlocked
  const unlocked = rec.progress.unlocked.includes(townNode.id)
    ? rec.progress.unlocked
    : [...rec.progress.unlocked, townNode.id];

  // Update waypoints list to include town
  const waypoints = rec.progress.waypoints ? [...rec.progress.waypoints] : [];
  if (!waypoints.includes(townNode.id)) {
    waypoints.push(townNode.id);
  }

  const progress: CampaignProgress = {
    ...rec.progress,
    unlocked,
    node: townNode.id,
    townVisits: rec.progress.townVisits + (currentNode.kind === 'town' ? 0 : 1),
    sessionSeed: newSeed,
    waypoints,
  };

  let cleanCarry = carry ? structuredClone(carry) : (rec.carry ? structuredClone(rec.carry) : null);
  if (cleanCarry) {
    cleanCarry.progress = progress;
    // Restore living mercs to 100% HP for town spawn
    if (cleanCarry.mercs) {
      cleanCarry.mercs.forEach((m) => {
        m.hpPct = 100;
      });
    }
  }

  return {
    ...rec,
    progress,
    carry: cleanCarry,
    last: null, // No defeat/victory screen on save and exit
  };
}

