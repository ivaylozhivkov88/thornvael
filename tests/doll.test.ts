import { describe, expect, it } from 'vitest';
import { dollSet, lookFor, materialFilter, weaponKind, wornDoll } from '../src/doll';

describe('painted figure looks', () => {
  it('picks a weapon layer by item family for warriors', () => {
    const set = dollSet(0, false)!;
    expect(lookFor(set, 0, 1, 'Recurve Bow')).toBe('weapon-bow');
    expect(lookFor(set, 0, 1, 'Woodcutter Handaxe')).toBe('weapon-axe');
    expect(lookFor(set, 0, 1, 'Heavy Morningstar')).toBe('weapon-mace');
    expect(lookFor(set, 0, 1, 'Duelist Poignard')).toBe('weapon-dagger');
    expect(lookFor(set, 0, 1, 'Flamberge')).toBe('weapon');
  });

  it('keeps the staff for mages', () => {
    expect(lookFor(dollSet(1, true)!, 0, 1, 'Amber Focus Wand')).toBe('weapon');
    expect(weaponKind('Oak Staff')).toBeNull();
  });

  it('colours non-plate armour by material', () => {
    expect(materialFilter('Leather Jerkin')).not.toBe('');
    expect(materialFilter('Chain Mail')).not.toBe(materialFilter('Leather Jerkin'));
    expect(materialFilter('Plate Armor')).toBe('');
  });

  it('resolves unique paperdoll layers and generic shield/offhand kinds', () => {
    const warM = dollSet(0, false)!;
    const mageF = dollSet(1, true)!;
    expect(lookFor(warM, 3, 4, "Vok's Fissure-Plate")).toBe("armor:Vok's Fissure-Plate");
    expect(lookFor(warM, 4, 4, "Coal-Walker's Sabatons")).toBe("boots:Coal-Walker's Sabatons");
    expect(lookFor(warM, 2, 4, 'Greystone Parapet Helm')).toBe('helm:Greystone Parapet Helm');
    expect(lookFor(warM, 1, 4, 'Cinder-Crown Bulwark')).toBe('shield:Cinder-Crown Bulwark');
    expect(lookFor(warM, 0, 4, "Tollkeeper's Receipt")).toBe("weapon:Tollkeeper's Receipt");
    expect(lookFor(warM, 1, 2, 'Steel Kite Shield')).toBe('shield-kite');
    expect(lookFor(mageF, 1, 4, "Tide-Scryer's Sphere")).toBe("offhand-mage:Tide-Scryer's Sphere");
    expect(lookFor(mageF, 1, 2, 'Astral Sphere')).toBe('offhand-mage-orb');
  });

  it('renders both left and right unique glove layers in wornDoll', () => {
    const prevDoc = globalThis.document;
    const created: Array<{ className: string; src: string; alt: string; style: { cssText: string }; children: unknown[]; append: (...n: unknown[]) => void; querySelectorAll: (s: string) => unknown[] }> = [];
    const makeEl = () => {
      const el = {
        className: '',
        src: '',
        alt: '',
        style: { cssText: '' },
        children: [] as unknown[],
        append(...n: unknown[]) { el.children.push(...n); },
        querySelectorAll(sel: string) {
          const cls = sel.startsWith('.') ? sel.slice(1) : sel;
          return (el.children as Array<{ className: string }>).filter((c) => c.className === cls);
        },
      };
      created.push(el);
      return el;
    };
    (globalThis as unknown as { document: unknown }).document = { createElement: makeEl };
    try {
      const warM = dollSet(0, false)!;
      const doll = wornDoll(warM, (slot) => (slot === 7 ? { name: "Bowyers' Horn Bracer", tier: 4 } : undefined), '/') as unknown as ReturnType<typeof makeEl>;
      const srcs = (doll.querySelectorAll('.doll-layer') as Array<ReturnType<typeof makeEl>>).map((el) => el.src);
      expect(srcs.some((s) => s.includes('gloves--bowyers-horn-bracer-l--warrior-m.png'))).toBe(true);
      expect(srcs.some((s) => s.includes('gloves--bowyers-horn-bracer-r--warrior-m.png'))).toBe(true);
    } finally {
      (globalThis as unknown as { document: unknown }).document = prevDoc;
    }
  });
});
