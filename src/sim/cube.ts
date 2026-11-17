/**
 * Horadric Cube Transmutation Engine for Thornvael (RoM2 Web)
 *
 * Implements exact D2 Horadric Cube mechanics:
 * 1. 3 identical gems -> 1 higher grade gem (Chipped -> Flawed -> Regular -> Flawless -> Perfect)
 * 2. 3/2 identical runes (+ required chipped/flawed/regular/flawless gem) -> 1 higher rune (El to Zod)
 * 3. Rejuvenation potion synthesis:
 *    - 3 Health + 3 Mana + 1 Chipped Gem -> Rejuvenation Potion (restores 35% HP/Mana)
 *    - 3 Health + 3 Mana + 1 Regular/Flawless Gem -> Full Rejuvenation Potion (restores 100% HP/Mana)
 *    - 3 Rejuvenation Potions -> 1 Full Rejuvenation Potion
 * 4. Socket punch recipes (Normal item + Runes + Perfect Gem -> Socketed item)
 * 5. Un-socketing recipe (Socketed item + Hel rune + Scroll of Town Portal -> Cleared sockets)
 * 6. Item re-rolling:
 *    - 3 Perfect Gems + 1 Magic Item -> Re-rolled Magic Item (same ilvl)
 *    - 6 Perfect Skulls + 1 Rare Item -> Re-rolled Rare Item (ilvl = 0.4*clvl + 0.4*ilvl)
 * 7. Jewelry transmutation (3 Magic Rings -> 1 Rare Amulet; 3 Magic Amulets -> 1 Rare Ring)
 * 8. Crafted Item Engine (Blood, Caster, Hit Power, Safety recipes)
 */

import {
  BUILTIN_GEMS,
  getGemDefByName,
  Ik,
  type ItemDef,
  Slot,
  type GemQuality,
  type GemType,
} from './item-types';
import {
  ALL_RUNES,
  getRuneById,
  getRuneByName,
  RUNE_UPGRADE_RECIPES,
} from './runes';
import { rollMagicItem, rollRareItem } from './affixes';

export interface TransmutationResult {
  recipe: string;
  result: ItemDef;
}

export interface CubeInputItem {
  name: string;
  def?: ItemDef;
}

/**
 * Transmutes a set of items inside the Horadric Cube.
 */
export function transmuteCube(
  items: readonly ItemDef[],
  clvl = 50,
  seed = 12345,
): TransmutationResult | null {
  if (!items || items.length === 0) return null;

  // -------------------------------------------------------------
  // 1. Gem Upgrades: 3 Identical Gems of grade N -> 1 grade N+1
  // -------------------------------------------------------------
  if (items.length === 3 && items.every((x) => x.kind === Ik.Gem && x.name === items[0].name)) {
    const g0 = getGemDefByName(items[0].name);
    if (g0) {
      const qualities: GemQuality[] = ['chipped', 'flawed', 'regular', 'flawless', 'perfect'];
      const qIdx = qualities.indexOf(g0.quality);
      if (qIdx >= 0 && qIdx < qualities.length - 1) {
        const nextQ = qualities[qIdx + 1];
        const nextGemDef = BUILTIN_GEMS.find((g) => g.type === g0.type && g.quality === nextQ);
        if (nextGemDef) {
          const nextItemDef: ItemDef = {
            name: nextGemDef.name,
            kind: Ik.Gem,
            slot: -1,
            tier: nextGemDef.tier,
            w: 0,
            cls: 3,
            need: 0,
            needv: 0,
            min: 0,
            max: 0,
            acc: 0,
            cover: 0,
            def: 0,
            abs: 0,
            res: [0, 0, 0, 0, 0],
            attr: [0, 0, 0, 0],
            hp: 0,
            mana: 0,
            pow: 0,
            heal: 0,
            restore: 0,
            grow: 0,
            spell: -1,
            rarity: 'magic',
          };
          return {
            recipe: `3 ${items[0].name} -> ${nextGemDef.name}`,
            result: nextItemDef,
          };
        }
      }
    }
  }

  // -------------------------------------------------------------
  // 2. Rune Upgrades: 3/2 Runes (+ gem if required) -> 1 Next Rune
  // -------------------------------------------------------------
  const runeItems = items.filter((x) => getRuneByName(x.name) !== undefined);
  const nonRuneItems = items.filter((x) => getRuneByName(x.name) === undefined);

  if (runeItems.length >= 2 && runeItems.every((r) => r.name === runeItems[0].name)) {
    const r0 = getRuneByName(runeItems[0].name)!;
    const upgrade = RUNE_UPGRADE_RECIPES.find((u) => u.fromRuneId === r0.id);
    if (upgrade && runeItems.length === upgrade.fromCount) {
      let gemSatisfied = false;
      if (!upgrade.gemRequired) {
        gemSatisfied = nonRuneItems.length === 0;
      } else if (nonRuneItems.length === 1 && nonRuneItems[0].kind === Ik.Gem) {
        const g = getGemDefByName(nonRuneItems[0].name);
        if (g && g.type === upgrade.gemRequired.type && g.quality === upgrade.gemRequired.quality) {
          gemSatisfied = true;
        }
      }

      if (gemSatisfied) {
        const nextRune = getRuneById(upgrade.toRuneId);
        if (nextRune) {
          const resultDef: ItemDef = {
            name: nextRune.name,
            kind: Ik.Gem,
            slot: -1,
            tier: Math.min(5, Math.ceil(nextRune.id / 7)),
            w: 0,
            cls: 3,
            need: 0,
            needv: 0,
            min: 0,
            max: 0,
            acc: 0,
            cover: 0,
            def: 0,
            abs: 0,
            res: [0, 0, 0, 0, 0],
            attr: [0, 0, 0, 0],
            hp: 0,
            mana: 0,
            pow: 0,
            heal: 0,
            restore: 0,
            grow: 0,
            spell: -1,
            rarity: 'magic',
          };
          return {
            recipe: `Transmute Runes -> ${nextRune.name} (${nextRune.d2Name})`,
            result: resultDef,
          };
        }
      }
    }
  }

  // -------------------------------------------------------------
  // 3. Rejuvenation Potions:
  //    - 3 Health + 3 Mana + 1 Chipped Gem -> Rejuvenation Potion (restores 35%)
  //    - 3 Health + 3 Mana + 1 Standard/Flawless Gem -> Full Rejuvenation Potion (restores 100%)
  //    - 3 Rejuvenation Potions -> 1 Full Rejuvenation Potion
  // -------------------------------------------------------------
  if (items.length === 3 && items.every((x) => x.name === 'Rejuvenation Potion')) {
    const fullRejuv: ItemDef = {
      name: 'Full Rejuvenation Potion',
      kind: Ik.Potion,
      slot: -1,
      tier: 4,
      w: 1,
      cls: 3,
      need: 0,
      needv: 0,
      min: 0,
      max: 0,
      acc: 0,
      cover: 0,
      def: 0,
      abs: 0,
      res: [0, 0, 0, 0, 0],
      attr: [0, 0, 0, 0],
      hp: 0,
      mana: 0,
      pow: 0,
      heal: 9999, // 100% full heal
      restore: 9999, // 100% full mana
      grow: 0,
      spell: -1,
      rarity: 'magic',
    };
    return {
      recipe: '3 Rejuvenation Potions -> Full Rejuvenation Potion',
      result: fullRejuv,
    };
  }

  if (items.length === 7) {
    const healCount = items.filter((x) => x.kind === Ik.Potion && (x.heal ?? 0) > 0).length;
    const manaCount = items.filter((x) => x.kind === Ik.Potion && (x.restore ?? 0) > 0).length;
    const gems = items.filter((x) => x.kind === Ik.Gem);
    if (healCount === 3 && manaCount === 3 && gems.length === 1) {
      const g = getGemDefByName(gems[0].name);
      const isHighGem = g && (g.quality === 'regular' || g.quality === 'flawless' || g.quality === 'perfect');
      const resultPotion: ItemDef = {
        name: isHighGem ? 'Full Rejuvenation Potion' : 'Rejuvenation Potion',
        kind: Ik.Potion,
        slot: -1,
        tier: isHighGem ? 4 : 2,
        w: 1,
        cls: 3,
        need: 0,
        needv: 0,
        min: 0,
        max: 0,
        acc: 0,
        cover: 0,
        def: 0,
        abs: 0,
        res: [0, 0, 0, 0, 0],
        attr: [0, 0, 0, 0],
        hp: 0,
        mana: 0,
        pow: 0,
        heal: isHighGem ? 9999 : 35,
        restore: isHighGem ? 9999 : 35,
        grow: 0,
        spell: -1,
        rarity: 'magic',
      };
      return {
        recipe: `3 Healing + 3 Mana + 1 ${gems[0].name} -> ${resultPotion.name}`,
        result: resultPotion,
      };
    }
  }

  // -------------------------------------------------------------
  // 4. Un-socketing Recipe:
  //    Socketed Item + Hel Rune + Scroll of Town Portal -> Cleared Sockets
  // -------------------------------------------------------------
  if (items.length === 3) {
    const gearItem = items.find((x) => x.kind === Ik.Gear && (x.sockets ?? 0) > 0);
    const helRune = items.find((x) => getRuneByName(x.name)?.id === 15);
    const tpScroll = items.find((x) => x.kind === Ik.Portal || x.name === 'Scroll of Town Portal');

    if (gearItem && helRune && tpScroll) {
      const match = gearItem.name.match(/\((.+)\)$/);
      const baseName = match ? match[1].trim() : gearItem.name;
      const clearedItem: ItemDef = {
        ...gearItem,
        socketedGems: [],
        name: baseName, // restore clean base item name if runeword was formed
      };
      return {
        recipe: `Un-socketing: Cleared all gems/runes from ${gearItem.name}`,
        result: clearedItem,
      };
    }
  }

  // -------------------------------------------------------------
  // 5. Socket Punch Recipes:
  //    - Armor + Tal + Thul + Perfect Topaz -> 1..4 Sockets
  //    - Weapon + Ral + Amn + Perfect Amethyst -> 1..6 Sockets
  //    - Helm + Ral + Thul + Perfect Sapphire -> 1..3 Sockets
  //    - Shield + Tal + Amn + Perfect Ruby -> 1..4 Sockets
  // -------------------------------------------------------------
  if (items.length === 4) {
    const gear = items.find((x) => x.kind === Ik.Gear && (x.sockets ?? 0) === 0);
    if (gear) {
      const rNames = items.filter((x) => x !== gear).map((x) => x.name);
      let socketsToAdd = 0;
      let recipeDesc = '';

      // Armor: Tal (7) + Thul (10) + Perfect Topaz
      if (gear.slot === Slot.Armor) {
        if (
          rNames.some((n) => getRuneByName(n)?.id === 7) &&
          rNames.some((n) => getRuneByName(n)?.id === 10) &&
          rNames.includes('Perfect Topaz')
        ) {
          socketsToAdd = 3;
          recipeDesc = 'Armor + Tal + Thul + Perfect Topaz -> Sockets';
        }
      }
      // Weapon: Ral (8) + Amn (11) + Perfect Amethyst / Ruby
      else if (gear.slot === Slot.Weapon) {
        if (
          rNames.some((n) => getRuneByName(n)?.id === 8) &&
          rNames.some((n) => getRuneByName(n)?.id === 11) &&
          (rNames.includes('Perfect Amethyst') || rNames.includes('Perfect Ruby'))
        ) {
          socketsToAdd = 4;
          recipeDesc = 'Weapon + Ral + Amn + Perfect Gem -> Sockets';
        }
      }
      // Helm: Ral (8) + Thul (10) + Perfect Sapphire
      else if (gear.slot === Slot.Helm) {
        if (
          rNames.some((n) => getRuneByName(n)?.id === 8) &&
          rNames.some((n) => getRuneByName(n)?.id === 10) &&
          rNames.includes('Perfect Sapphire')
        ) {
          socketsToAdd = 2;
          recipeDesc = 'Helm + Ral + Thul + Perfect Sapphire -> Sockets';
        }
      }
      // Shield: Tal (7) + Amn (11) + Perfect Ruby
      else if (gear.slot === Slot.Shield) {
        if (
          rNames.some((n) => getRuneByName(n)?.id === 7) &&
          rNames.some((n) => getRuneByName(n)?.id === 11) &&
          rNames.includes('Perfect Ruby')
        ) {
          socketsToAdd = 3;
          recipeDesc = 'Shield + Tal + Amn + Perfect Ruby -> Sockets';
        }
      }

      if (socketsToAdd > 0) {
        const socketedDef: ItemDef = {
          ...gear,
          sockets: socketsToAdd,
          socketedGems: [],
        };
        return {
          recipe: recipeDesc,
          result: socketedDef,
        };
      }
    }
  }

  // -------------------------------------------------------------
  // 6. Item Re-rolling:
  //    - 3 Perfect Gems + 1 Magic Item -> Re-rolled Magic Item
  //    - 6 Perfect Skulls + 1 Rare Item -> Re-rolled Rare Item
  // -------------------------------------------------------------
  if (items.length === 4) {
    const magicItem = items.find((x) => x.kind === Ik.Gear && x.rarity === 'magic');
    const perfGems = items.filter((x) => x.kind === Ik.Gem && x.name.startsWith('Perfect '));
    if (magicItem && perfGems.length === 3) {
      const rolled = rollMagicItem(magicItem, magicItem.tier, (n) => (seed * 31 + n) % n);
      return {
        recipe: '3 Perfect Gems + Magic Item -> Re-rolled Magic Item',
        result: rolled,
      };
    }
  }

  if (items.length === 7) {
    const rareItem = items.find((x) => x.kind === Ik.Gear && x.rarity === 'rare');
    const perfSkulls = items.filter((x) => x.kind === Ik.Gem && x.name === 'Perfect Skull');
    if (rareItem && perfSkulls.length === 6) {
      const newTier = Math.max(1, Math.min(5, Math.floor(0.4 * (clvl / 15) + 0.4 * rareItem.tier)));
      const rolled = rollRareItem(rareItem, newTier, (n) => (seed * 37 + n) % n);
      return {
        recipe: '6 Perfect Skulls + Rare Item -> Re-rolled Rare Item',
        result: rolled,
      };
    }
  }

  // -------------------------------------------------------------
  // 7. Jewelry Transmutations:
  //    - 3 Magic Rings -> 1 Rare Amulet
  //    - 3 Magic Amulets -> 1 Rare Ring
  // -------------------------------------------------------------
  if (items.length === 3 && items.every((x) => x.kind === Ik.Gear && x.slot === Slot.Ring)) {
    const avgTier = Math.min(5, Math.max(1, Math.round(items.reduce((s, x) => s + x.tier, 0) / 3)));
    const amDef: ItemDef = {
      name: 'Horadric Transmuted Amulet',
      kind: Ik.Gear,
      slot: Slot.Amulet,
      tier: avgTier,
      w: 1,
      cls: 3,
      need: 0,
      needv: 0,
      min: 0,
      max: 0,
      acc: 2,
      cover: 0,
      def: 2,
      abs: 1,
      res: [10 * avgTier, 10 * avgTier, 10 * avgTier, 10 * avgTier, 10 * avgTier],
      attr: [avgTier, avgTier, avgTier, avgTier],
      hp: 20 * avgTier,
      mana: 20 * avgTier,
      pow: 5 * avgTier,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      rarity: 'rare',
    };
    return { recipe: '3 Rings -> Horadric Rare Amulet', result: amDef };
  }

  if (items.length === 3 && items.every((x) => x.kind === Ik.Gear && x.slot === Slot.Amulet)) {
    const avgTier = Math.min(5, Math.max(1, Math.round(items.reduce((s, x) => s + x.tier, 0) / 3)));
    const ringDef: ItemDef = {
      name: 'Horadric Transmuted Ring',
      kind: Ik.Gear,
      slot: Slot.Ring,
      tier: avgTier,
      w: 0,
      cls: 3,
      need: 0,
      needv: 0,
      min: avgTier,
      max: avgTier * 2,
      acc: 3,
      cover: 0,
      def: 1,
      abs: 0,
      res: [8 * avgTier, 8 * avgTier, 8 * avgTier, 8 * avgTier, 8 * avgTier],
      attr: [avgTier, avgTier, avgTier, avgTier],
      hp: 15 * avgTier,
      mana: 15 * avgTier,
      pow: 4 * avgTier,
      heal: 0,
      restore: 0,
      grow: 0,
      spell: -1,
      rarity: 'rare',
    };
    return { recipe: '3 Amulets -> Horadric Rare Ring', result: ringDef };
  }

  // -------------------------------------------------------------
  // 8. Crafted Items Engine (Blood, Caster, Hit Power, Safety):
  //    - Caster Amulet: Magic Amulet + Ral (8) + Perfect Amethyst + Jewel/Gem
  //    - Blood Ring: Magic Ring + Sol (12) + Perfect Ruby + Jewel/Gem
  //    - Blood Gloves: Magic Gloves + Nef (4) + Perfect Ruby + Jewel/Gem
  //    - Hit Power Gloves: Magic Gloves + Ort (9) + Perfect Topaz + Jewel/Gem
  //    - Safety Shield: Magic Shield + Algor/Tal (7) + Perfect Emerald + Jewel/Gem
  // -------------------------------------------------------------
  if (items.length === 4) {
    const baseItem = items.find((x) => x.kind === Ik.Gear);
    const runes = items.filter((x) => getRuneByName(x.name) !== undefined);
    const gems = items.filter((x) => x.kind === Ik.Gem);

    if (baseItem && runes.length === 1 && gems.length >= 2) {
      const runeId = getRuneByName(runes[0].name)!.id;
      const perfGem = gems.find((g) => g.name.startsWith('Perfect '));

      // Caster Amulet: Amulet + Ral (8) + Perfect Amethyst
      if (
        baseItem.slot === Slot.Amulet &&
        runeId === 8 &&
        (perfGem?.name === 'Perfect Amethyst' || perfGem?.name === 'Perfect Sapphire')
      ) {
        const crafted: ItemDef = {
          ...baseItem,
          name: `Crafted Caster Amulet of ${baseItem.name}`,
          rarity: 'crafted',
          pow: (baseItem.pow ?? 0) + 15,
          mana: (baseItem.mana ?? 0) + 40,
          attr: [baseItem.attr[0], baseItem.attr[1], baseItem.attr[2] + 4, baseItem.attr[3] + 4],
          res: [baseItem.res[0] + 10, baseItem.res[1] + 10, baseItem.res[2] + 10, baseItem.res[3] + 10, baseItem.res[4] + 15],
        };
        return { recipe: 'Crafted Caster Amulet', result: crafted };
      }

      // Blood Ring: Ring + Sol (12) + Perfect Ruby
      if (baseItem.slot === Slot.Ring && runeId === 12 && perfGem?.name === 'Perfect Ruby') {
        const crafted: ItemDef = {
          ...baseItem,
          name: `Crafted Blood Ring of ${baseItem.name}`,
          rarity: 'crafted',
          lifesteal: (baseItem.lifesteal ?? 0) + 5,
          hp: (baseItem.hp ?? 0) + 35,
          attr: [baseItem.attr[0] + 5, baseItem.attr[1], baseItem.attr[2], baseItem.attr[3]],
          min: (baseItem.min ?? 0) + 2,
          max: (baseItem.max ?? 0) + 5,
        };
        return { recipe: 'Crafted Blood Ring', result: crafted };
      }

      // Blood Gloves: Gloves + Nef (4) + Perfect Ruby
      if (baseItem.slot === Slot.Gloves && runeId === 4 && perfGem?.name === 'Perfect Ruby') {
        const crafted: ItemDef = {
          ...baseItem,
          name: `Crafted Blood Gloves of ${baseItem.name}`,
          rarity: 'crafted',
          lifesteal: (baseItem.lifesteal ?? 0) + 3,
          hp: (baseItem.hp ?? 0) + 25,
          acc: (baseItem.acc ?? 0) + 3,
          min: (baseItem.min ?? 0) + 3,
          max: (baseItem.max ?? 0) + 6,
        };
        return { recipe: 'Crafted Blood Gloves (Crushing Blow & Life Steal)', result: crafted };
      }

      // Hit Power Gloves: Gloves + Ort (9) + Perfect Topaz
      if (baseItem.slot === Slot.Gloves && runeId === 9 && perfGem?.name === 'Perfect Topaz') {
        const crafted: ItemDef = {
          ...baseItem,
          name: `Crafted Hit Power Gloves of ${baseItem.name}`,
          rarity: 'crafted',
          acc: (baseItem.acc ?? 0) + 5,
          def: (baseItem.def ?? 0) + 4,
          res: [baseItem.res[0], baseItem.res[1], baseItem.res[2] + 25, baseItem.res[3], baseItem.res[4]],
        };
        return { recipe: 'Crafted Hit Power Gloves (Knockback & Lightning)', result: crafted };
      }

      // Safety Shield: Shield + Tal (7) + Perfect Emerald
      if (baseItem.slot === Slot.Shield && runeId === 7 && perfGem?.name === 'Perfect Emerald') {
        const crafted: ItemDef = {
          ...baseItem,
          name: `Crafted Safety Shield of ${baseItem.name}`,
          rarity: 'crafted',
          def: (baseItem.def ?? 0) + 12,
          abs: (baseItem.abs ?? 0) + 4,
          res: [baseItem.res[0] + 15, baseItem.res[1] + 15, baseItem.res[2] + 15, baseItem.res[3] + 25, baseItem.res[4] + 15],
        };
        return { recipe: 'Crafted Safety Shield (Damage Reduction & Defense)', result: crafted };
      }
    }
  }

  return null;
}
