import type { Builds } from './townbuild';
import type { StoryFlags } from './story-complete';
import { DEFAULT_STORY_FLAGS } from './story-complete';

/** Campaign data and progress: which nodes exist, which are open, which are done. Pure data, no browser access. */

export interface CampaignNode {
  id: string;
  act?: 1 | 2 | 3 | 4;
  kind: 'mission' | 'town';
  map: string; // key in BUILT_IN (mission.ts)
  title: string;
  pos: [number, number]; // position on the global map, percent
  unlocksOnVictory: string[];
  briefing: string;
  tiers?: [number, number]; // optional town shop/quest item tier range
  result?: { win: string; lose: string };
}

export const actOf = (n: CampaignNode): 1 | 2 | 3 | 4 => n.act ?? 1;

export interface Campaign {
  version: number;
  chapter: string;
  start: string;
  nodes: CampaignNode[];
}

export const DIFFICULTY_NAMES = ['easy', 'normal', 'hard', 'hell'] as const;
export type DifficultyName = (typeof DIFFICULTY_NAMES)[number];

export interface TownPortalRecord {
  zoneNodeId: string;
  map: string;
  x: number;
  y: number;
}

export interface CampaignProgress {
  difficulty: number; // index into DIFFICULTY_NAMES, same as the hero's `diff` (0 easy, 1 medium, 2 hard/nightmare, 3 hell)
  unlocked: string[];
  completed: string[];
  node: string; // the node the player stands on
  townVisits: number;
  purseClaimed?: boolean; // Thornwick opening purse paid out once across Act I / Thornwick
  ngPlusTier?: number; // New Game+ tier active for this run (0 = standard, 1 = Nightmare, 2 = Hell)
  builds?: Builds; // town buildings raised so far (src/townbuild.ts); absent in older records
  waypoints?: string[]; // list of unlocked Waypoint node IDs (always includes towns of unlocked acts)
  sessionSeed?: number; // current session seed; rotates on every Save & Exit!
  townPortal?: TownPortalRecord | null;
  storyFlags?: StoryFlags;
}

export function parseCampaign(raw: unknown): Campaign {
  const c = raw as Campaign;
  if (!c || !Array.isArray(c.nodes) || typeof c.start !== 'string') throw new Error('campaign.json is damaged.');
  const ids = new Set(c.nodes.map((n) => n.id));
  if (ids.size !== c.nodes.length) throw new Error('campaign.json has a repeated node id.');
  if (!ids.has(c.start)) throw new Error('campaign.json start node is missing.');
  for (const n of c.nodes) for (const u of n.unlocksOnVictory) if (!ids.has(u)) throw new Error(`campaign.json: ${n.id} unlocks unknown node ${u}.`);
  return c;
}

export function newProgress(c: Campaign, difficulty: number): CampaignProgress {
  return {
    difficulty,
    unlocked: [c.start],
    completed: [],
    node: c.start,
    townVisits: 0,
    waypoints: [townHubForAct(1)],
    sessionSeed: 1234567,
    townPortal: null,
    storyFlags: { ...DEFAULT_STORY_FLAGS },
  };
}

export const nodeOf = (c: Campaign, id: string): CampaignNode => {
  const n = c.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`Unknown campaign node "${id}".`);
  return n;
};

export const isOpen = (p: CampaignProgress, id: string): boolean => p.unlocked.includes(id);

/** A won mission: mark it done and open what it unlocks. Returns a new progress object. */
export function completeNode(c: Campaign, p: CampaignProgress, id: string, branch?: number): CampaignProgress {
  const n = nodeOf(c, id);
  if (!isOpen(p, id)) throw new Error(`Node ${id} is not unlocked.`);
  const unlocked = [...p.unlocked];
  const next =
    id === 'm44-threshold-choice' && branch === 1
      ? n.unlocksOnVictory.filter((u) => u === 'm45-crown-of-order')
      : id === 'm44-threshold-choice' && branch === 2
        ? n.unlocksOnVictory.filter((u) => u === 'm46-ember-reckoning')
        : n.unlocksOnVictory;
  for (const u of next) if (!unlocked.includes(u)) unlocked.push(u);
  const completed = p.completed.includes(id) ? p.completed : [...p.completed, id];
  const storyFlags = p.storyFlags ? { ...p.storyFlags } : { ...DEFAULT_STORY_FLAGS };
  if (id === 'm44-threshold-choice') {
    if (branch === 1) storyFlags.chosenBranch = 'order';
    else if (branch === 2) storyFlags.chosenBranch = 'ember';
  } else if (id === 'm10-undervault-links') {
    storyFlags.hasMorvessaRing = true;
  } else if (id === 'm16-wardstone-rupture') {
    storyFlags.cleansedQuartzWardstones = true;
  } else if (id === 'm20-deep-quarry') {
    storyFlags.evacuatedQuarryMiners = true;
  } else if (id === 'm28-sunken-citadel') {
    storyFlags.rescuedTidalShipwrights = true;
  } else if (id === 'm35-burning-harbor') {
    storyFlags.allEvacuationShipsSailed = true;
  }
  return { ...p, unlocked, completed, node: id, storyFlags };
}

/** Leaving a town: counts the visit (the shop and tavern refresh from this number). */
export function visitTown(p: CampaignProgress, id: string): CampaignProgress {
  return { ...p, node: id, townVisits: p.townVisits + 1 };
}

/** Seed for shop stock and tavern quests on this visit: the same visit number always gives the same stock. */
export const townSeed = (base: number, visits: number): number => (Math.imul(base ^ 0x9e3779b9, 31) + Math.imul(visits + 1, 0x85ebca6b)) >>> 0;

/** Return the canonical Regional Town Hub node ID for each Act. */
export function townHubForAct(act: 1 | 2 | 3 | 4): string {
  switch (act) {
    case 1:
      return 'town-thornwick';
    case 2:
      return 'town-redmarsh';
    case 3:
      return 'town-oakhaven';
    case 4:
      return 'town-ironcamp';
  }
}

/** Find the Town Hub node for the given Act in a campaign. */
export function findTownNodeForAct(c: Campaign, act: 1 | 2 | 3 | 4): CampaignNode {
  const town = c.nodes.find((n) => actOf(n) === act && n.kind === 'town');
  if (town) return town;
  const fallbackId = townHubForAct(act);
  return nodeOf(c, fallbackId);
}

export const townNodeForAct = findTownNodeForAct;

/** Generate a new deterministic session seed upon Save and Exit. */
export function nextSessionSeed(seed = 1234567, salt = 1): number {
  let s = (seed ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) || 1;
}

