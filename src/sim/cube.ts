/**
 * Reliquary Forge Transmutation Engine for Thornvael
 *
 * Implements Reliquary Forge transmutation mechanics:
 * 1. 3 identical gems -> 1 higher grade gem (Chipped -> Flawed -> Regular -> Flawless -> Perfect)
 * 2. 3/2 identical runes (+ required chipped/flawed/regular/flawless gem) -> 1 higher rune (Eldun to Zodar)
 * 3. Rejuvenation potion synthesis:
 *    - 3 Health + 3 Mana + 1 Chipped Gem -> Rejuvenation Potion (restores 35% HP/Mana)
 *    - 3 Health + 3 Mana + 1 Regular/Flawless Gem -> Full Rejuvenation Potion (restores 100% HP/Mana)
 *    - 3 Rejuvenation Potions -> 1 Full Rejuvenation Potion
 * 4. Socket punch recipes (Normal item + Runes + Perfect Gem -> Socketed item)
 * 5. Un-socketing recipe (Socketed item + Rune of Helva + Scroll of Town Portal -> Cleared sockets)
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
} from './item-types';
import {
  getRuneById,
  getRuneByName,
  matchRuneword,
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
 * Transmutes a set of items inside the Reliquary Forge.
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
            recipe: `Transmute Runes -> ${nextRune.name}`,
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
  //    Socketed Item + Rune of Helva + Scroll of Town Portal -> Cleared Sockets
  // -------------------------------------------------------------
  if (items.length === 3) {
    const gearItem = items.find((x) => x.kind === Ik.Gear && (x.sockets ?? 0) > 0);
    const helvaRune = items.find((x) => getRuneByName(x.name)?.id === 15);
    const tpScroll = items.find((x) => x.kind === Ik.Portal || x.name === 'Scroll of Town Portal');

    if (gearItem && helvaRune && tpScroll) {
      const match = gearItem.name.match(/\((.+)\)$/);
      const baseName = match ? match[1].trim() : gearItem.name;
      let { min, max, hp, mana, def, abs, pow, grow } = gearItem;
      let acc = gearItem.acc ?? 0;
      let mf = gearItem.mf ?? 0;
      let lifesteal = gearItem.lifesteal ?? 0;
      let manasteal = gearItem.manasteal ?? 0;
      let crushingBlow = gearItem.crushingBlow ?? 0;
      let deadlyStrike = gearItem.deadlyStrike ?? 0;
      let openWounds = gearItem.openWounds ?? 0;
      let fhr = gearItem.fhr ?? 0;
      let rarity = gearItem.rarity;
      const res: [number, number, number, number, number] = [...gearItem.res];
      const attr: [number, number, number, number] = [...gearItem.attr];
      const socketed = gearItem.socketedGems ?? [];
      const rw = match ? matchRuneword(gearItem.slot, socketed) : undefined;
      if (rw) {
        min = Math.max(0, min - (rw.stats.min ?? 0));
        max = Math.max(0, max - (rw.stats.max ?? 0));
        acc = Math.max(0, acc - (rw.stats.acc ?? 0));
        def = Math.max(0, def - (rw.stats.def ?? 0));
        abs = Math.max(0, abs - (rw.stats.abs ?? 0));
        hp = Math.max(0, hp - (rw.stats.hp ?? 0));
        mana = Math.max(0, mana - (rw.stats.mana ?? 0));
        pow = Math.max(0, pow - (rw.stats.pow ?? 0));
        mf = Math.max(0, mf - (rw.stats.mf ?? 0));
        lifesteal = Math.max(0, lifesteal - (rw.stats.lifesteal ?? 0));
        if (rw.stats.res) for (let k = 0; k < 5; k++) res[k] -= rw.stats.res[k];
        if (rw.stats.attr) for (let k = 0; k < 4; k++) attr[k] -= rw.stats.attr[k];
        if (rarity === 'unique') rarity = 'normal';
      }
      const isWeapon = gearItem.slot === Slot.Weapon;
      const isShield = gearItem.slot === Slot.Shield;
      for (const sName of socketed) {
        const g = getGemDefByName(sName);
        const r = !g ? getRuneByName(sName) : undefined;
        if (g) {
          if (isWeapon) {
            min = Math.max(0, min - g.weaponBonus.min);
            max = Math.max(0, max - g.weaponBonus.max);
            if (g.weaponBonus.lifesteal) lifesteal = Math.max(0, lifesteal - g.weaponBonus.lifesteal);
            if (g.type === 'ruby') res[0] -= 5 * g.tier;
            if (g.type === 'sapphire') res[1] -= 5 * g.tier;
            if (g.type === 'topaz') res[2] -= 5 * g.tier;
            if (g.type === 'emerald') res[3] -= 5 * g.tier;
          } else {
            if (g.armorBonus.hp) hp = Math.max(0, hp - g.armorBonus.hp);
            if (g.armorBonus.mana) mana = Math.max(0, mana - g.armorBonus.mana);
            if (g.armorBonus.def) def = Math.max(0, def - g.armorBonus.def);
            if (g.armorBonus.mf) mf = Math.max(0, mf - g.armorBonus.mf);
            if (g.armorBonus.regen) grow = Math.max(0, grow - g.armorBonus.regen);
            if (g.armorBonus.attr) for (let k = 0; k < 4; k++) attr[k] -= g.armorBonus.attr[k];
          }
        } else if (r) {
          if (isWeapon) {
            if (r.weaponBonus.min) min = Math.max(0, min - r.weaponBonus.min);
            if (r.weaponBonus.max) max = Math.max(0, max - r.weaponBonus.max);
            if (r.weaponBonus.acc) acc = Math.max(0, acc - r.weaponBonus.acc);
            if (r.weaponBonus.lifesteal) lifesteal = Math.max(0, lifesteal - r.weaponBonus.lifesteal);
            if (r.weaponBonus.manasteal) manasteal = Math.max(0, manasteal - r.weaponBonus.manasteal);
            if (r.weaponBonus.crushingBlow) crushingBlow = Math.max(0, crushingBlow - r.weaponBonus.crushingBlow);
            if (r.weaponBonus.deadlyStrike) deadlyStrike = Math.max(0, deadlyStrike - r.weaponBonus.deadlyStrike);
            if (r.weaponBonus.openWounds) openWounds = Math.max(0, openWounds - r.weaponBonus.openWounds);
            if (r.weaponBonus.mf) mf = Math.max(0, mf - r.weaponBonus.mf);
            if (r.weaponBonus.elemDmg) res[r.weaponBonus.elemDmg.elem - 1] -= 5;
          } else if (isShield) {
            if (r.shieldBonus.def) def = Math.max(0, def - r.shieldBonus.def);
            if (r.shieldBonus.hp) hp = Math.max(0, hp - r.shieldBonus.hp);
            if (r.shieldBonus.mana) mana = Math.max(0, mana - r.shieldBonus.mana);
            if (r.shieldBonus.mf) mf = Math.max(0, mf - r.shieldBonus.mf);
            if (r.shieldBonus.res) for (let k = 0; k < 5; k++) res[k] -= r.shieldBonus.res[k];
            if (r.shieldBonus.attr) for (let k = 0; k < 4; k++) attr[k] -= r.shieldBonus.attr[k];
          } else {
            if (r.armorBonus.def) def = Math.max(0, def - r.armorBonus.def);
            if (r.armorBonus.hp) hp = Math.max(0, hp - r.armorBonus.hp);
            if (r.armorBonus.mana) mana = Math.max(0, mana - r.armorBonus.mana);
            if (r.armorBonus.fhr) fhr = Math.max(0, fhr - r.armorBonus.fhr);
            if (r.armorBonus.mf) mf = Math.max(0, mf - r.armorBonus.mf);
            if (r.armorBonus.res) for (let k = 0; k < 5; k++) res[k] -= r.armorBonus.res[k];
            if (r.armorBonus.attr) for (let k = 0; k < 4; k++) attr[k] -= r.armorBonus.attr[k];
          }
        }
      }
      const clearedItem: ItemDef = {
        ...gearItem,
        socketedGems: [],
        name: baseName, // restore clean base item name if runeword was formed
        rarity,
        min,
        max,
        acc,
        hp,
        mana,
        def,
        abs,
        pow,
        mf,
        lifesteal,
        manasteal,
        crushingBlow,
        deadlyStrike,
        openWounds,
        fhr,
        grow,
        res,
        attr,
      };
      return {
        recipe: `Un-socketing: Cleared all gems/runes from ${gearItem.name}`,
        result: clearedItem,
      };
    }
  }

  // -------------------------------------------------------------
  // 5. Socket Punch Recipes:
  //    - Armor + Talgor + Thulor + Perfect Topaz -> 1..4 Sockets
  //    - Weapon + Ralon + Amnir + Perfect Amethyst -> 1..6 Sockets
  //    - Helm + Ralon + Thulor + Perfect Sapphire -> 1..3 Sockets
  //    - Shield + Talgor + Amnir + Perfect Ruby -> 1..4 Sockets
  // -------------------------------------------------------------
  if (items.length === 4) {
    const gear = items.find((x) => x.kind === Ik.Gear && (x.sockets ?? 0) === 0);
    if (gear) {
      const rNames = items.filter((x) => x !== gear).map((x) => x.name);
      let socketsToAdd = 0;
      let recipeDesc = '';

      // Armor: Talgor (7) + Thulor (10) + Perfect Topaz
      if (gear.slot === Slot.Armor) {
        if (
          rNames.some((n) => getRuneByName(n)?.id === 7) &&
          rNames.some((n) => getRuneByName(n)?.id === 10) &&
          rNames.includes('Perfect Topaz')
        ) {
          socketsToAdd = 3;
          recipeDesc = 'Armor + Talgor + Thulor + Perfect Topaz -> Sockets';
        }
      }
      // Weapon: Ralon (8) + Amnir (11) + Perfect Amethyst / Ruby
      else if (gear.slot === Slot.Weapon) {
        if (
          rNames.some((n) => getRuneByName(n)?.id === 8) &&
          rNames.some((n) => getRuneByName(n)?.id === 11) &&
          (rNames.includes('Perfect Amethyst') || rNames.includes('Perfect Ruby'))
        ) {
          socketsToAdd = 4;
          recipeDesc = 'Weapon + Ralon + Amnir + Perfect Gem -> Sockets';
        }
      }
      // Helm: Ralon (8) + Thulor (10) + Perfect Sapphire
      else if (gear.slot === Slot.Helm) {
        if (
          rNames.some((n) => getRuneByName(n)?.id === 8) &&
          rNames.some((n) => getRuneByName(n)?.id === 10) &&
          rNames.includes('Perfect Sapphire')
        ) {
          socketsToAdd = 2;
          recipeDesc = 'Helm + Ralon + Thulor + Perfect Sapphire -> Sockets';
        }
      }
      // Shield: Talgor (7) + Amnir (11) + Perfect Ruby
      else if (gear.slot === Slot.Shield) {
        if (
          rNames.some((n) => getRuneByName(n)?.id === 7) &&
          rNames.some((n) => getRuneByName(n)?.id === 11) &&
          rNames.includes('Perfect Ruby')
        ) {
          socketsToAdd = 3;
          recipeDesc = 'Shield + Talgor + Amnir + Perfect Ruby -> Sockets';
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
      name: 'Forge-Bound Amulet',
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
    return { recipe: '3 Rings -> Forge-Bound Rare Amulet', result: amDef };
  }

  if (items.length === 3 && items.every((x) => x.kind === Ik.Gear && x.slot === Slot.Amulet)) {
    const avgTier = Math.min(5, Math.max(1, Math.round(items.reduce((s, x) => s + x.tier, 0) / 3)));
    const ringDef: ItemDef = {
      name: 'Forge-Bound Ring',
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
    return { recipe: '3 Amulets -> Forge-Bound Rare Ring', result: ringDef };
  }

  // -------------------------------------------------------------
  // 8. Crafted Items Engine (Blood, Caster, Hit Power, Safety):
  //    - Caster Amulet: Magic Amulet + Ralon (8) + Perfect Amethyst + Jewel/Gem
  //    - Blood Ring: Magic Ring + Solan (12) + Perfect Ruby + Jewel/Gem
  //    - Blood Gloves: Magic Gloves + Neph (4) + Perfect Ruby + Jewel/Gem
  //    - Hit Power Gloves: Magic Gloves + Orthan (9) + Perfect Topaz + Jewel/Gem
  //    - Safety Shield: Magic Shield + Talgor (7) + Perfect Emerald + Jewel/Gem
  // -------------------------------------------------------------
  if (items.length === 4) {
    const baseItem = items.find((x) => x.kind === Ik.Gear);
    const runes = items.filter((x) => getRuneByName(x.name) !== undefined);
    const gems = items.filter((x) => x.kind === Ik.Gem);

    if (baseItem && runes.length === 1 && gems.length >= 2) {
      const runeId = getRuneByName(runes[0].name)!.id;
      const perfGem = gems.find((g) => g.name.startsWith('Perfect '));

      // Caster Amulet: Amulet + Ralon (8) + Perfect Amethyst
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

      // Blood Ring: Ring + Solan (12) + Perfect Ruby
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

      // Blood Gloves: Gloves + Neph (4) + Perfect Ruby
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

      // Hit Power Gloves: Gloves + Orthan (9) + Perfect Topaz
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

      // Safety Shield: Shield + Talgor (7) + Perfect Emerald
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
