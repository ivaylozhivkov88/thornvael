/**
 * Town & Hub NPC Module (Thornvael)
 *
 * Provides town simulation exports, town hub NPC ambient poses, idle animations,
 * and dialog/bark resolution for blacksmiths, innkeepers, tavern patrons, priests, and gate guards.
 */

export * from './sim/town';
export {
  type TownNpcRole,
  type TownNpcPose,
  type TownHubNpc,
  generateTownHubNpcs,
} from './sim/town';

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
