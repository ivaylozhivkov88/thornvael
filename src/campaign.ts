/** Campaign data and progress: which nodes exist, which are open, which are done. Pure data, no browser access. */

export interface CampaignNode {
  id: string;
  kind: 'mission' | 'town';
  map: string; // key in BUILT_IN (mission.ts)
  title: string;
  pos: [number, number]; // position on the global map, percent
  unlocksOnVictory: string[];
  briefing: string;
  result?: { win: string; lose: string };
}

export interface Campaign {
  version: number;
  chapter: string;
  start: string;
  nodes: CampaignNode[];
}

export const DIFFICULTY_NAMES = ['easy', 'normal', 'hard'] as const;
export type DifficultyName = (typeof DIFFICULTY_NAMES)[number];

export interface CampaignProgress {
  difficulty: number; // index into DIFFICULTY_NAMES, same as the hero's `diff` (0 easy, 1 medium, 2 hard)
  unlocked: string[];
  completed: string[];
  node: string; // the node the player stands on
  townVisits: number;
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
  return { difficulty, unlocked: [c.start], completed: [], node: c.start, townVisits: 0 };
}

export const nodeOf = (c: Campaign, id: string): CampaignNode => {
  const n = c.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`Unknown campaign node "${id}".`);
  return n;
};

export const isOpen = (p: CampaignProgress, id: string): boolean => p.unlocked.includes(id);

/** A won mission: mark it done and open what it unlocks. Returns a new progress object. */
export function completeNode(c: Campaign, p: CampaignProgress, id: string): CampaignProgress {
  const n = nodeOf(c, id);
  if (!isOpen(p, id)) throw new Error(`Node ${id} is not unlocked.`);
  const unlocked = [...p.unlocked];
  for (const u of n.unlocksOnVictory) if (!unlocked.includes(u)) unlocked.push(u);
  const completed = p.completed.includes(id) ? p.completed : [...p.completed, id];
  return { ...p, unlocked, completed, node: id };
}

/** Leaving a town: counts the visit (the shop and tavern refresh from this number). */
export function visitTown(p: CampaignProgress, id: string): CampaignProgress {
  return { ...p, node: id, townVisits: p.townVisits + 1 };
}

/** Seed for shop stock and tavern quests on this visit: the same visit number always gives the same stock. */
export const townSeed = (base: number, visits: number): number => (Math.imul(base ^ 0x9e3779b9, 31) + Math.imul(visits + 1, 0x85ebca6b)) >>> 0;
