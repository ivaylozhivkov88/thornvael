import uniques1 from '../public/data/content/uniques.json';
import type { AdvanceStepResult } from './sidequests';
import { ALL_UNIQUE_ARTIFACTS } from './sim/affixes';
import { addHeroXp, addItem } from './sim/hero';
import { ITEMS, Ik, Slot, itemId, type ItemDef } from './sim/items';
import type { Sim } from './sim/sim';

interface RawUniqueLookup {
  id: string;
  name: string;
}

const UNIQUE_ID_TO_NAME = new Map<string, string>(
  (uniques1 as readonly RawUniqueLookup[]).map((u) => [u.id, u.name]),
);

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inferFallbackSlot(token: string): number {
  const s = token.toLowerCase();
  if (s.includes('shield') || s.includes('buckler')) return Slot.Shield;
  if (s.includes('ring') || s.includes('signet') || s.includes('band')) return Slot.Ring;
  if (s.includes('amulet') || s.includes('codex') || s.includes('relic') || s.includes('mortar') || s.includes('flask')) return Slot.Amulet;
  if (s.includes('helm') || s.includes('hood') || s.includes('cap')) return Slot.Helm;
  if (s.includes('boot') || s.includes('greave')) return Slot.Boots;
  if (s.includes('glove') || s.includes('gauntlet')) return Slot.Gloves;
  if (s.includes('armor') || s.includes('plate') || s.includes('robe') || s.includes('satchel')) return Slot.Armor;
  return Slot.Weapon;
}

function titleCaseToken(token: string): string {
  return token
    .replace(/^(?:item|uniq)-/i, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function grantRewardItem(sim: Sim, itemRef: string): string | null {
  if (!sim.hero) return null;

  const directId = itemId(itemRef);
  if (directId >= 0) {
    return addItem(sim.hero, directId) >= 0 ? itemRef : null;
  }

  const mappedName = UNIQUE_ID_TO_NAME.get(itemRef);
  const targetSlug = slug(itemRef.replace(/^uniq-/, ''));
  const uniqueDef =
    (mappedName ? ALL_UNIQUE_ARTIFACTS.find((u) => u.name === mappedName) : undefined) ??
    ALL_UNIQUE_ARTIFACTS.find((u) => slug(u.name) === targetSlug);

  if (uniqueDef) {
    const exactId = itemId(uniqueDef.name);
    if (exactId >= 0) {
      return addItem(sim.hero, exactId) >= 0 ? uniqueDef.name : null;
    }
    const baseIdx = Math.max(
      0,
      ITEMS.findIndex((d) => d.kind === Ik.Gear && d.slot === uniqueDef.slot && d.tier === uniqueDef.tier) >= 0
        ? ITEMS.findIndex((d) => d.kind === Ik.Gear && d.slot === uniqueDef.slot && d.tier === uniqueDef.tier)
        : ITEMS.findIndex((d) => d.kind === Ik.Gear && d.slot === uniqueDef.slot),
    );
    const inst = sim.createItemInstance(baseIdx, 'unique', uniqueDef);
    return addItem(sim.hero, inst.id) >= 0 ? uniqueDef.name : null;
  }

  const slot = inferFallbackSlot(itemRef);
  const baseIdx = Math.max(
    0,
    ITEMS.findIndex((d) => d.kind === Ik.Gear && d.slot === slot),
  );
  const baseDef = ITEMS[baseIdx] ?? ITEMS[0];
  const readableName = titleCaseToken(itemRef);
  const rewardDef: ItemDef = {
    ...baseDef,
    name: readableName,
    rarity: 'rare',
    pow: Math.max(baseDef.pow, 2),
    acc: Math.max(baseDef.acc, 4),
    def: Math.max(baseDef.def, slot === Slot.Armor || slot === Slot.Shield ? 3 : 1),
  };
  const inst = sim.createItemInstance(baseIdx, 'rare', rewardDef);
  return addItem(sim.hero, inst.id) >= 0 ? readableName : null;
}

export interface AppliedQuestRewards {
  gold: number;
  xp: number;
  items: string[];
}

/** Applies gold, hero XP, and item rewards from stepped quest advancement results into the simulation. */
export function grantSteppedQuestRewards(
  sim: Sim,
  results: readonly AdvanceStepResult[],
  notify?: (msg: string) => void,
): AppliedQuestRewards {
  let gold = 0;
  let xp = 0;
  const items: string[] = [];

  for (const res of results) {
    if (!res.advanced || !res.grantedReward) continue;
    const rew = res.grantedReward;
    if (rew.gold > 0) {
      sim.cb.gold[0] = (sim.cb.gold[0] ?? 0) + rew.gold;
      gold += rew.gold;
    }
    if (rew.xp > 0 && sim.hero) {
      addHeroXp(sim, rew.xp);
      xp += rew.xp;
    }
    if (rew.item && sim.hero) {
      const granted = grantRewardItem(sim, rew.item);
      if (granted) items.push(granted);
    }
  }

  if (notify && (gold > 0 || xp > 0 || items.length > 0)) {
    const parts: string[] = [];
    if (gold > 0) parts.push(`+${gold} gold`);
    if (xp > 0) parts.push(`+${xp} XP`);
    for (const item of items) parts.push(item);
    notify(`📜 Quest Reward: ${parts.join(', ')}`);
  }

  return { gold, xp, items };
}
