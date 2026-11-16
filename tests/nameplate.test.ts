import { describe, expect, it } from 'vitest';
import { OverheadNameplateLayer, getUnitPlateData } from '../src/nameplate';
import { Kind } from '../src/sim/combat';
import { Sim } from '../src/sim/sim';
import { getSuperUniqueById } from '../src/sim/super-uniques';

const mockMap = {
  w: 16,
  h: 16,
  terrain: new Uint8Array(256),
  blocked: new Uint8Array(256),
  height: new Uint8Array(256),
  light: new Uint8Array(256),
} as any;

describe('ARPG In-World Overhead Monster Nameplates & Affix Titles', () => {
  it('1. Standard trash mobs have White (#FFFFFF) nameplate and no affixes', () => {
    // 2 units: hero (team 0), trash gnoll (team 1)
    const sim = new Sim(mockMap, 1, [0, 1], { kinds: [Kind.Hero, Kind.Gnoll] });
    sim.cb.hpMax[1] = 40;
    sim.cb.hp[1] = 40;
    (sim.cb.family as string[])[1] = 'briar-hound';

    const plate = getUnitPlateData(sim, 1);
    expect(plate.isEnemy).toBe(true);
    expect(plate.isChampion).toBe(false);
    expect(plate.isElite).toBe(false);
    // White color coding
    expect(plate.nameColor).toBe(0xffffff);
    expect(plate.name).toBe('Briar Hound');
    expect(plate.affixes).toBe('');
    expect(plate.hp).toBe(40);
    expect(plate.hpMax).toBe(40);
  });

  it('2. Champions have Blue (#48a0ff) nameplate and affixes in gold/cyan', () => {
    const sim = new Sim(mockMap, 1, [0, 1], { kinds: [Kind.Hero, Kind.Gnoll] });
    sim.cb.hpMax[1] = 80;
    sim.cb.hp[1] = 75;
    (sim.cb.family as string[])[1] = 'thorn-boar';
    (sim.cb.bossMods as string[][])[1] = ['extra_fast', 'champion'];

    const plate = getUnitPlateData(sim, 1);
    expect(plate.isEnemy).toBe(true);
    expect(plate.isChampion).toBe(true);
    // Blue color coding for Champions
    expect(plate.nameColor).toBe(0x48a0ff);
    expect(plate.name).toContain('Thorn Boar Champion');
    // Affixes under name
    expect(plate.affixes).toBe('Extra Fast');
    expect(plate.affixColor).toBe(0x5ce6f8);
    expect(plate.hp).toBe(75);
    expect(plate.hpMax).toBe(80);
  });

  it('3. Unique / Elite bosses have Gold (#f5c042) nameplate and affixes joined with middle dots', () => {
    const sim = new Sim(mockMap, 1, [0, 1], { kinds: [Kind.Hero, Kind.Gnoll] });
    sim.cb.hpMax[1] = 200;
    sim.cb.hp[1] = 180;
    (sim.cb.family as string[])[1] = 'ironbark';
    (sim.cb.bossMods as string[][])[1] = ['extra_fast', 'lightning_enchanted', 'stone_skin'];

    const plate = getUnitPlateData(sim, 1);
    expect(plate.isEnemy).toBe(true);
    expect(plate.isElite).toBe(true);
    // Gold color coding for Unique / Elite bosses
    expect(plate.nameColor).toBe(0xf5c042);
    expect(plate.name).toBe('Ironbark');
    // Formatted affixes: Extra Fast · Lightning Enchanted · Stone Skin
    expect(plate.affixes).toBe('Extra Fast · Lightning Enchanted · Stone Skin');
    expect(plate.affixColor).toBe(0x5ce6f8);
  });

  it('4. Named Super-Uniques have Gold (#f5c042) nameplate and signature abilities', () => {
    const sim = new Sim(mockMap, 1, [0, 1], { kinds: [Kind.Hero, Kind.Gnoll] });
    sim.cb.hpMax[1] = 500;
    sim.cb.hp[1] = 500;
    (sim.cb.family as string[])[1] = 'morvessa';
    const su = getSuperUniqueById('morvessa');
    if (su) {
      (sim.cb.bossMods as string[][])[1] = [...su.mods];
    }

    const plate = getUnitPlateData(sim, 1);
    expect(plate.isEnemy).toBe(true);
    expect(plate.isElite).toBe(true);
    // Gold color coding
    expect(plate.nameColor).toBe(0xf5c042);
    expect(plate.name).toBe('Morvessa, the Silk Widow');
    expect(plate.affixes.length).toBeGreaterThan(0);
    expect(plate.affixes).toMatch(/Poison|Extra Fast|Brood|Spine/i);
  });

  it('5. Friendly units and hero show crisp simple nameplate without cluttering resistance lists', () => {
    const sim = new Sim(mockMap, 1, [0, 0, 1], { kinds: [Kind.Hero, Kind.Archer, Kind.Gnoll] });
    sim.hero = { id: 0, cls: 0 } as any;
    sim.cb.hpMax[0] = 100;
    sim.cb.hp[0] = 85;
    sim.cb.hpMax[1] = 60;
    sim.cb.hp[1] = 60;

    // Hero
    const heroPlate = getUnitPlateData(sim, 0);
    expect(heroPlate.isEnemy).toBe(false);
    expect(heroPlate.name).toBe('Warrior');
    expect(heroPlate.nameColor).toBe(0xffdf78);
    expect(heroPlate.affixes).toBe('');

    // Archer ally
    const allyPlate = getUnitPlateData(sim, 1);
    expect(allyPlate.isEnemy).toBe(false);
    expect(allyPlate.name).toBe('Rogue Archer');
    expect(allyPlate.nameColor).toBe(0x8ae0ff);
    expect(allyPlate.affixes).toBe('');
  });

  it('6. OverheadNameplateLayer pools entries, marks active plates, and cleans up', () => {
    const sim = new Sim(mockMap, 1, [0, 0, 1], { kinds: [Kind.Hero, Kind.Archer, Kind.Gnoll] });
    sim.cb.hp[0] = 100;
    sim.cb.hp[1] = 60;
    sim.cb.hp[2] = 40;
    (sim.cb.family as string[])[2] = 'briar-hound';

    const layer = new OverheadNameplateLayer(4);
    expect(layer.container.children.length).toBe(4);

    // Mock sprites
    const sprites = [
      { visible: true, x: 100, y: 100, scale: { x: 1, y: 1 } },
      { visible: true, x: 200, y: 100, scale: { x: 1, y: 1 } },
      { visible: true, x: 300, y: 100, scale: { x: 1, y: 1 } },
    ] as any;

    // Hover enemy 2
    layer.update(sim, sprites, 1, 0, 0, 800, 600, {
      hoverUnit: 2,
      hover: { id: 2, ok: true },
      selected: new Set([0]),
    });

    expect(layer.hasPlate(2)).toBe(true);
    expect(layer.hasPlate(0)).toBe(true);
    expect(layer.hasPlate(1)).toBe(false);

    // Clear hover and selection
    layer.update(sim, sprites, 1, 0, 0, 800, 600, {
      hoverUnit: null,
      hover: null,
      selected: new Set(),
    });

    expect(layer.hasPlate(2)).toBe(false);
    expect(layer.hasPlate(0)).toBe(false);

    layer.destroy();
  });
});
