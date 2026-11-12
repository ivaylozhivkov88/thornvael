import { INV_MAX, SKILL_MAX, Why, blocker, skillNeed, type EquipmentAction, type HeroState } from './sim/hero';
import { getItemDef, Ik, SLOT_NAMES, Slot } from './sim/items';

export type EquipmentSource = { from: 'inv' | 'eq'; item: number; slot: number };

export function equipmentAction(source: EquipmentSource): EquipmentAction | null {
  if (source.from === 'eq') return { op: 'unequip', slot: source.slot };
  return getItemDef(source.item)?.kind === Ik.Gear ? { op: 'equip', item: source.item } : null;
}

export function equipmentPreview(h: HeroState, alive: boolean, source: EquipmentSource) {
  const action = equipmentAction(source);
  if (!action) return null;
  if (action.op === 'unequip') {
    return {
      action, target: 'pack', replacement: -1,
      why: !alive ? Why.Dead : h.eq[action.slot] !== source.item ? Why.None : h.inv.length >= INV_MAX ? Why.Full : 0,
    };
  }
  const slot = getItemDef(action.item)?.slot ?? 0;
  return {
    action, target: `eq${slot}`, replacement: h.eq[slot],
    why: !alive ? Why.Dead : h.inv[source.slot]?.item !== source.item ? Why.None : blocker(h, action.item),
  };
}

const layerOrder = [Slot.Armor, Slot.Boots, Slot.Gloves, Slot.Weapon, Slot.Shield, Slot.Helm, Slot.Amulet, Slot.Ring];

export function equipmentLayers(h: HeroState) {
  return layerOrder.filter((slot) => h.eq[slot] >= 0).map((slot) => ({ slot, name: SLOT_NAMES[slot], item: h.eq[slot] }));
}

/** Read-only progress for the current level; capped skills have no next threshold. */
export function skillProgress(h: Pick<HeroState, 'skill' | 'use'>, skill: number): { level: number; used: number; needed: number | null; remaining: number } {
  const level = h.skill[skill];
  const used = h.use[skill];
  const needed = level >= SKILL_MAX ? null : skillNeed(level);
  return { level, used, needed, remaining: needed === null ? 0 : Math.max(0, needed - used) };
}
