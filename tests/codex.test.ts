import { beforeEach, describe, expect, it } from 'vitest';
import { discoverItem, getCodexProgress, isDiscovered, onDiscovery, resetCodex } from '../src/codex';
import { ITEMS } from '../src/sim/items';

describe('Holy Grail Codex system', () => {
  beforeEach(() => {
    resetCodex();
  });

  it('tracks newly discovered items and reports progress percentage', () => {
    const initial = getCodexProgress();
    expect(initial.discovered).toBe(0);
    expect(initial.pct).toBe(0);
    expect(initial.total).toBe(ITEMS.length);

    // Discover first item
    const first = discoverItem(0);
    expect(first).toBe(true);
    expect(isDiscovered(0)).toBe(true);

    // Rediscovery returns false
    const duplicate = discoverItem(0);
    expect(duplicate).toBe(false);

    // Discover second item
    discoverItem(1);
    expect(isDiscovered(1)).toBe(true);

    const progress = getCodexProgress();
    expect(progress.discovered).toBe(2);
    expect(progress.pct).toBe(Math.round((2 / ITEMS.length) * 100));
  });

  it('notifies listeners when a new item is discovered', () => {
    const events: number[] = [];
    const unsub = onDiscovery((id) => events.push(id));

    discoverItem(3);
    expect(events).toEqual([3]);

    // Duplicate does not trigger listener
    discoverItem(3);
    expect(events).toEqual([3]);

    discoverItem(5);
    expect(events).toEqual([3, 5]);

    unsub();
    discoverItem(7);
    expect(events).toEqual([3, 5]); // unsubscribed
  });

  it('ignores invalid item IDs safely', () => {
    expect(discoverItem(-1)).toBe(false);
    expect(discoverItem(999999)).toBe(false);
    expect(isDiscovered(-5)).toBe(false);
  });

  it('formats rich tooltips for Set items with equipped pieces and active bonuses', async () => {
    const { formatItemTooltip } = await import('../src/heroui');
    const { ALL_SETS } = await import('../src/sim/sets');
    const { Cls } = await import('../src/sim/items');
    const { startState } = await import('../src/sim/hero');

    const ironWardenSet = ALL_SETS[0];
    const visor = ironWardenSet.pieces[0]; // Iron Warden's Visor
    const visorId = ITEMS.findIndex((it) => it.name === visor.name);
    expect(visorId).toBeGreaterThanOrEqual(0);

    // Hero without any set pieces
    const hero = startState(0, Cls.Warrior, false, 0);
    const unequippedTip = formatItemTooltip(visorId, hero);
    expect(unequippedTip).toContain("Set: Iron Warden's Bastion (0/4)");
    expect(unequippedTip).toContain("[ ] Iron Warden's Visor");
    expect(unequippedTip).toContain("○ (2) +15 HP, +2 Def");
    expect(unequippedTip).toContain('Warrior Only');

    // Equip 2 pieces of Iron Warden
    const tower = ironWardenSet.pieces[1]; // Iron Warden's Tower (shield)
    const towerId = ITEMS.findIndex((it) => it.name === tower.name);
    hero.eq[2] = visorId; // Helm slot
    hero.eq[1] = towerId; // Shield slot

    const equippedTip = formatItemTooltip(visorId, hero);
    expect(equippedTip).toContain("Set: Iron Warden's Bastion (2/4)");
    expect(equippedTip).toContain("[✓] Iron Warden's Visor");
    expect(equippedTip).toContain("[✓] Iron Warden's Tower");
    expect(equippedTip).toContain("[ ] Iron Warden's Hauberk");
    expect(equippedTip).toContain("★ (2) +15 HP, +2 Def");
    expect(equippedTip).toContain("○ (3)");

    // Test class restriction warning for Mage viewing Warrior Only gear
    const mageHero = startState(0, Cls.Mage, false, 0);
    const mageTip = formatItemTooltip(visorId, mageHero);
    expect(mageTip).toContain('⚠ Cannot equip: Warrior Only');
  });
});
