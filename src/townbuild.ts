import type { CampaignProgress } from './campaign';

/**
 * Town buildings the player raises between missions, paid from the carried gold. Pure data and rules, no browser access.
 * Levels live in `CampaignProgress.builds` (optional, so older records read as "nothing built").
 */
export type BuildingId = 'barracks' | 'forge' | 'shrine';

export interface BuildingDef {
  id: BuildingId;
  cost: readonly number[]; // gold for level 1, 2, ...; its length is the maximum level
}

export const BUILDINGS: readonly BuildingDef[] = [
  { id: 'barracks', cost: [400, 900, 1800] }, // mercenaries cost 10% less per level
  { id: 'forge', cost: [600, 1500] }, // shop and quest items one tier higher per level
  { id: 'shrine', cost: [300, 800, 1600] }, // wounded soldiers heal 20% of their health per level between nodes
];

export type Builds = Partial<Record<BuildingId, number>>;

const defOf = (id: BuildingId): BuildingDef => {
  const d = BUILDINGS.find((b) => b.id === id);
  if (!d) throw new Error(`Unknown building "${id}".`);
  return d;
};

export const levelOf = (b: Builds | undefined, id: BuildingId): number => Math.max(0, Math.min(defOf(id).cost.length, b?.[id] ?? 0));

/** Gold for the next level, or null at the top level. */
export function nextCost(b: Builds | undefined, id: BuildingId): number | null {
  const d = defOf(id);
  const lv = levelOf(b, id);
  return lv < d.cost.length ? d.cost[lv] : null;
}

/** Raise one building a level. Returns the new progress and gold, or null when it is maxed or too expensive. */
export function build(p: CampaignProgress, gold: number, id: BuildingId): { progress: CampaignProgress; gold: number } | null {
  const cost = nextCost(p.builds, id);
  if (cost === null || gold < cost) return null;
  return { progress: { ...p, builds: { ...p.builds, [id]: levelOf(p.builds, id) + 1 } }, gold: gold - cost };
}

/** Percent taken off a mercenary's hiring fee. */
export const hireDiscountPct = (b: Builds | undefined): number => 10 * levelOf(b, 'barracks');
/** Added to both ends of a town's item tier range. */
export const tierBonus = (b: Builds | undefined): number => levelOf(b, 'forge');
/** Percent of maximum health a wounded soldier regains on each hand-over. */
export const healPct = (b: Builds | undefined): number => 20 * levelOf(b, 'shrine');
