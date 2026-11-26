/**
 * Town & Hub Systems (Thornvael)
 *
 * Provides town simulation exports, town hub NPC ambient poses, idle animations,
 * Mercenary veterancy, Temple Resurrection, Runeword Assistant, Smart Item Comparison,
 * and Tavern Bounty contracts.
 */

export * from './sim/town';
export * from './sim/mercs';
export {
  type TownNpcRole,
  type TownNpcPose,
  type TownHubNpc,
  type BountyContract,
  generateTownHubNpcs,
  generateTownBounties,
} from './sim/town';

export {
  HUB_EVOLUTION,
  getHubEvolutionStage,
  isCanonicalHubId,
  normalizeHubId,
  type HubEvolutionStage,
} from './data/hub-evolution';

import { getItemDef, type ItemDef } from './sim/items';
import { RUNEWORDS, getRuneById, runeShortName, type RunewordDef } from './sim/runes';

/** Ambient pose descriptions for UI tooltips and inspector views. */
export const TOWN_NPC_POSE_DESCRIPTIONS: Record<string, string> = {
  anvil: 'Working the glowing anvil with rhythmic hammer strikes',
  counter: 'Greeting travelers and polishing tankards behind the heavy oak bar',
  patron: 'Nursing a flagon of heather ale and discussing rumors of the road',
  altar: 'Engaged in deep celestial contemplation before the astral font',
  gate_vigil: 'Standing sentinel with halberd readied, scanning the tree-line',
};

/** Human-readable display titles for town NPC roles. */
export const TOWN_NPC_ROLE_TITLES: Record<string, string> = {
  smith: 'Master Blacksmith',
  innkeeper: 'Tavern Keeper',
  villager: 'Tavern Patron',
  priest: 'Temple Priest',
  mage: 'Arcane Scholar',
  guard: 'Town Gate Guard',
};

/** Get localized or formatted role label. */
export function getTownNpcRoleTitle(role: string): string {
  return TOWN_NPC_ROLE_TITLES[role] ?? 'Town Citizen';
}

/** Get atmospheric description of an NPC's current ambient pose. */
export function getTownNpcPoseDescription(pose: string): string {
  return TOWN_NPC_POSE_DESCRIPTIONS[pose] ?? 'Engaged in quiet daily routine';
}

/* ====================================================================
   SMART ITEM COMPARISON
   ==================================================================== */

export interface ItemComparisonDiff {
  readonly stat: string;
  readonly diff: number;
  readonly formatted: string; // e.g. "▲ +14 Dmg" or "▼ -6 Def"
  readonly isPositive: boolean;
}

export interface ItemComparisonResult {
  readonly hasEquipped: boolean;
  readonly candidateName: string;
  readonly equippedName?: string;
  readonly diffs: readonly ItemComparisonDiff[];
  readonly summary: string;
}

/**
 * Compare candidate gear item against the currently equipped item in that slot.
 * Computes structured deltas for damage, defense, absorption, accuracy, HP, mana,
 * spell power, and elemental resistances.
 */
export function computeItemComparison(
  candidate: ItemDef | number,
  equipped: ItemDef | number | null | undefined,
): ItemComparisonResult {
  const cDef = typeof candidate === 'number' ? getItemDef(candidate) : candidate;
  const eDef =
    equipped !== null && equipped !== undefined
      ? typeof equipped === 'number'
        ? getItemDef(equipped)
        : equipped
      : undefined;

  const candidateName = cDef?.name ?? 'Unknown Item';
  if (!eDef) {
    return {
      hasEquipped: false,
      candidateName,
      diffs: [],
      summary: 'No item equipped in this slot',
    };
  }

  const diffs: ItemComparisonDiff[] = [];

  // 1. Damage (average of min and max)
  const cDmg = ((cDef?.min ?? 0) + (cDef?.max ?? 0)) / 2;
  const eDmg = ((eDef.min ?? 0) + (eDef.max ?? 0)) / 2;
  if (cDmg !== eDmg) {
    const diff = Math.round((cDmg - eDmg) * 10) / 10;
    const isPositive = diff > 0;
    diffs.push({
      stat: 'Damage',
      diff,
      formatted: `${isPositive ? '▲ +' : '▼ '}${diff} Dmg`,
      isPositive,
    });
  }

  // 2. Defense
  const cDefVal = cDef?.def ?? 0;
  const eDefVal = eDef.def ?? 0;
  if (cDefVal !== eDefVal) {
    const diff = cDefVal - eDefVal;
    const isPositive = diff > 0;
    diffs.push({
      stat: 'Defense',
      diff,
      formatted: `${isPositive ? '▲ +' : '▼ '}${diff} Def`,
      isPositive,
    });
  }

  // 3. Absorption
  const cAbs = cDef?.abs ?? 0;
  const eAbs = eDef.abs ?? 0;
  if (cAbs !== eAbs) {
    const diff = cAbs - eAbs;
    const isPositive = diff > 0;
    diffs.push({
      stat: 'Absorption',
      diff,
      formatted: `${isPositive ? '▲ +' : '▼ '}${diff} Abs`,
      isPositive,
    });
  }

  // 4. Accuracy
  const cAcc = cDef?.acc ?? 0;
  const eAcc = eDef.acc ?? 0;
  if (cAcc !== eAcc) {
    const diff = cAcc - eAcc;
    const isPositive = diff > 0;
    diffs.push({
      stat: 'Accuracy',
      diff,
      formatted: `${isPositive ? '▲ +' : '▼ '}${diff} Acc`,
      isPositive,
    });
  }

  // 5. HP & Mana
  const cHp = cDef?.hp ?? 0;
  const eHp = eDef.hp ?? 0;
  if (cHp !== eHp) {
    const diff = cHp - eHp;
    const isPositive = diff > 0;
    diffs.push({
      stat: 'Max HP',
      diff,
      formatted: `${isPositive ? '▲ +' : '▼ '}${diff} HP`,
      isPositive,
    });
  }

  const cMana = cDef?.mana ?? 0;
  const eMana = eDef.mana ?? 0;
  if (cMana !== eMana) {
    const diff = cMana - eMana;
    const isPositive = diff > 0;
    diffs.push({
      stat: 'Max Mana',
      diff,
      formatted: `${isPositive ? '▲ +' : '▼ '}${diff} Mana`,
      isPositive,
    });
  }

  // 6. Spell Power
  const cPow = cDef?.pow ?? 0;
  const ePow = eDef.pow ?? 0;
  if (cPow !== ePow) {
    const diff = cPow - ePow;
    const isPositive = diff > 0;
    diffs.push({
      stat: 'Spell Power',
      diff,
      formatted: `${isPositive ? '▲ +' : '▼ '}${diff}% Pow`,
      isPositive,
    });
  }

  // 7. Elemental Resists
  const elemNames = ['Fire', 'Cold', 'Air', 'Earth', 'Astral'];
  for (let i = 0; i < 5; i++) {
    const cRes = cDef?.res?.[i] ?? 0;
    const eRes = eDef.res?.[i] ?? 0;
    if (cRes !== eRes) {
      const diff = cRes - eRes;
      const isPositive = diff > 0;
      diffs.push({
        stat: `${elemNames[i]} Resist`,
        diff,
        formatted: `${isPositive ? '▲ +' : '▼ '}${diff}% ${elemNames[i]} Res`,
        isPositive,
      });
    }
  }

  // Summary assessment
  const betterCount = diffs.filter((d) => d.isPositive).length;
  const worseCount = diffs.filter((d) => !d.isPositive).length;
  let summary = 'Equivalent stats';
  if (betterCount > 0 && worseCount === 0) summary = 'Direct Upgrade';
  else if (betterCount === 0 && worseCount > 0) summary = 'Direct Downgrade';
  else if (betterCount > 0 && worseCount > 0) summary = 'Sidegrade / Trade-off';

  return {
    hasEquipped: true,
    candidateName,
    equippedName: eDef.name,
    diffs,
    summary,
  };
}

/* ====================================================================
   INTERACTIVE RUNEWORD ASSISTANT
   ==================================================================== */

export interface RunewordRuneRequirement {
  readonly id: number;
  readonly name: string;
  readonly shortName: string;
  readonly owned: boolean;
}

export interface CompatibleRuneword {
  readonly id: string;
  readonly name: string;
  readonly clvl: number;
  readonly runes: readonly string[];
  readonly runeDetails: readonly RunewordRuneRequirement[];
  readonly canFormNow: boolean;
  readonly canComplete: boolean;
  readonly missingCount: number;
  readonly warning?: string;
  readonly statSummary: readonly string[];
  readonly runeword: RunewordDef;
  readonly ownedRunes: readonly string[];
  readonly missingRunes: readonly string[];
}

/**
 * Discovers matching Runeword recipes for an item slot or ItemDef and socket count,
 * indicating owned runes vs. missing runes and warning against socketing into magical bases.
 */
export function getCompatibleRunewordsForItem(
  itemOrSlot: number | ItemDef,
  socketCount: number,
  ownedRuneNames: readonly string[],
  isBaseItemOverride?: boolean,
): readonly CompatibleRuneword[] {
  if (socketCount < 2) return [];

  let slot = typeof itemOrSlot === 'number' ? itemOrSlot : itemOrSlot.slot;
  let isBaseItem =
    isBaseItemOverride !== undefined
      ? isBaseItemOverride
      : typeof itemOrSlot === 'object'
        ? !itemOrSlot.rarity || itemOrSlot.rarity === 'normal' || itemOrSlot.rarity === 'common'
        : true;

  const ownedSet = new Set(
    ownedRuneNames.map((n) => n.toLowerCase().replace(/^rune of\s+/i, '').trim()),
  );

  const results: CompatibleRuneword[] = [];

  for (const rw of RUNEWORDS) {
    if (!rw.allowedSlots.includes(slot)) continue;
    if (rw.runeIds.length !== socketCount) continue;

    const runes: RunewordRuneRequirement[] = [];
    let allOwned = true;
    let missingCount = 0;

    for (const rId of rw.runeIds) {
      const def = getRuneById(rId);
      if (!def) continue;
      const cleanLoreName = runeShortName(def).toLowerCase().trim();
      const owned =
        ownedSet.has(cleanLoreName) ||
        ownedSet.has(def.name.toLowerCase().trim());

      if (!owned) {
        allOwned = false;
        missingCount++;
      }
      runes.push({
        id: def.id,
        name: def.name,
        shortName: runeShortName(def),
        owned,
      });
    }

    const warning = !isBaseItem
      ? '⚠️ Requires normal/grey base item (not magic/rare/unique)!'
      : undefined;

    const statSummary: string[] = [];
    if (rw.stats.min || rw.stats.max) {
      statSummary.push(`+${rw.stats.min ?? 0}-${rw.stats.max ?? 0} Damage`);
    }
    if (rw.stats.def) statSummary.push(`+${rw.stats.def} Defense`);
    if (rw.stats.hp) statSummary.push(`+${rw.stats.hp} HP`);
    if (rw.stats.mana) statSummary.push(`+${rw.stats.mana} Mana`);
    if (rw.stats.lifesteal) statSummary.push(`+${rw.stats.lifesteal}% Life Steal`);
    if (rw.stats.res) {
      const r = rw.stats.res;
      if (r[0] === r[1] && r[1] === r[2] && r[2] === r[3] && r[0] > 0) {
        statSummary.push(`All Res +${r[0]}%`);
      } else {
        if (r[0]) statSummary.push(`+${r[0]}% Fire Res`);
        if (r[1]) statSummary.push(`+${r[1]}% Water Res`);
        if (r[2]) statSummary.push(`+${r[2]}% Air Res`);
        if (r[3]) statSummary.push(`+${r[3]}% Earth Res`);
      }
    }

    results.push({
      id: rw.id,
      name: rw.name,
      clvl: rw.clvl,
      runes: runes.map((r) => r.shortName),
      runeDetails: runes,
      canFormNow: allOwned && isBaseItem,
      canComplete: allOwned && isBaseItem,
      missingCount,
      warning,
      statSummary,
      runeword: rw,
      ownedRunes: runes.filter((r) => r.owned).map((r) => r.shortName),
      missingRunes: runes.filter((r) => !r.owned).map((r) => r.shortName),
    });
  }

  // Sort: recipes player can form right now first, then by least missing runes
  return results.sort((a, b) => {
    if (a.canFormNow && !b.canFormNow) return -1;
    if (!a.canFormNow && b.canFormNow) return 1;
    return a.missingCount - b.missingCount;
  });
}
