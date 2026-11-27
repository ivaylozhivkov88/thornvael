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
/** Act I plays on the continuous `act1-world` map; `town-thornwick` routes to Thornwick Market when entered standalone. */
const worldMapOf = (n: CampaignNode): string => (
  n.id === 'town-thornwick' ? 'thornwick-market' : actOf(n) === 1 && n.kind === 'mission' ? 'act1-world' : n.map
);
export const nodeUrl = (n: CampaignNode): string => `./?mission=${encodeURIComponent(worldMapOf(n))}&campaign=${encodeURIComponent(n.id)}`;

/**
 * Direct launch URL for resuming a campaign without passing through a disconnected node-grid screen.
 * For Act I, always launches into the continuous `act1-world` (spawning at Thornwick if the record is in town).
 */
export function resumeCampaignUrl(c: Campaign, rec: CampaignRecord): string {
  const current = nodeOf(c, rec.progress.node);
  if (actOf(current) === 1) {
    if (current.kind === 'town') {
      const activeMission =
        c.nodes.find((n) => actOf(n) === 1 && n.kind === 'mission' && rec.progress.unlocked.includes(n.id) && !rec.progress.completed.includes(n.id)) ??
        nodeOf(c, c.start);
      return `${nodeUrl(activeMission)}&spawnX=14&spawnY=14`;
    }
    return nodeUrl(current);
  }
  return nodeUrl(current);
}

/** A node can be entered when it is unlocked and its map ships with the game. */
export function canEnter(rec: CampaignRecord, id: string, maps: ReadonlySet<string>, c: Campaign): boolean {
  return rec.progress.unlocked.includes(id) && maps.has(nodeOf(c, id).map);
}

/** A mission ended. A win opens what it unlocks and keeps the hero's new state; a loss keeps the old state, so the player retries. */
export function afterMission(c: Campaign, rec: CampaignRecord, id: string, win: boolean, carry: CarryoverState | null, last: Omit<LastResult, 'node' | 'win'>): CampaignRecord {
  const result: LastResult = { node: id, win, ...last };
  if (!win) return { ...rec, last: result };
  let progress = completeNode(c, rec.progress, id, last.branch);
  if (id === 'm01-blood-at-the-ford' || id === 'town-thornwick') {
    progress = { ...progress, purseClaimed: true };
  }
  return { ...rec, progress, carry: carry ? { ...carry, progress } : rec.carry, last: result };
}

/** Leaving a town: count the visit and keep what was bought, learned or hired. */
export function afterTown(c: Campaign, rec: CampaignRecord, id: string, carry: CarryoverState | null): CampaignRecord {
  nodeOf(c, id);
  let progress = visitTown(rec.progress, id);
  if (id === 'town-thornwick') progress = { ...progress, purseClaimed: true };
  return { ...rec, progress, carry: carry ? { ...carry, progress } : rec.carry, last: null };
}

export const nextDifficultyAfterVictory = (diff: number): number => Math.max(0, Math.min(3, Math.floor(diff) + 1));

/** Reset map progression into a New Game+ cycle at `nextDiff` while preserving the hero's level, stats, spells, items, and gold. */
export function startNewGamePlusRecord(c: Campaign, rec: CampaignRecord, nextDiff: number): CampaignRecord {
  const clampedDiff = Math.max(0, Math.min(3, nextDiff));
  const nextNgTier = (rec.progress.ngPlusTier ?? 0) + 1;
  const baseProgress: CampaignProgress = {
    ...newProgress(c, clampedDiff),
    ngPlusTier: nextNgTier,
    purseClaimed: rec.progress.purseClaimed,
  };
  const carry = rec.carry
    ? {
        ...structuredClone(rec.carry),
        hero: { ...rec.carry.hero, diff: clampedDiff },
        progress: baseProgress,
      }
    : null;
  return {
    v: 1,
    progress: baseProgress,
    hero: { ...rec.hero },
    carry,
    last: null,
  };
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

