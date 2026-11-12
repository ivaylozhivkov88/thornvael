import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/map';
import { blankDoc, loadDoc, validate } from '../src/mapdoc';
import { monsterInfo } from '../src/monster-info';
import { DEFS, Kind, M, MODN, strike } from '../src/sim/combat';
import { MONSTER_FAMILIES, MONSTER_PALETTES, monsterFamilyById, monsterPaletteByTier, parseMonsters, setMonsters } from '../src/sim/data';
import { createHero } from '../src/sim/hero';
import { Sim } from '../src/sim/sim';
import { advanceStory, openStory, replayStory, sequenceForNode, skipStory, STORY_SEQUENCES } from '../src/story';

interface MonsterCatalog {
  version: number;
  palettes: { tier: number; label: string; hex: string; hpMult: number; dmgMult: number }[];
  families: { id: string; name: string; batch: string; archetype: number; elem: number; baseHp: number; baseMin: number; baseMax: number; speed: number; ranged: boolean; caster: boolean; role: string }[];
}

describe('Monster 25-family x 5-tier catalog (P12)', () => {
  const catalog = JSON.parse(readFileSync(new URL('../public/data/monsters.json', import.meta.url), 'utf8')) as MonsterCatalog;

  it('defines 25 unique monster families across batches A-E and 5 ascending power tiers', () => {
    expect(catalog.palettes.length).toBe(5);
    expect(catalog.palettes.map((p) => p.tier)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < catalog.palettes.length; i++) {
      expect(catalog.palettes[i].hpMult).toBeGreaterThan(catalog.palettes[i - 1].hpMult);
      expect(catalog.palettes[i].dmgMult).toBeGreaterThan(catalog.palettes[i - 1].dmgMult);
    }

    expect(catalog.families.length).toBe(25);
    expect(new Set(catalog.families.map((f) => f.id)).size).toBe(25);
    expect(new Set(catalog.families.map((f) => f.name)).size).toBe(25);
    expect(new Set(catalog.families.map((f) => f.batch))).toEqual(new Set(['A', 'B', 'C', 'D', 'E']));

    for (const f of catalog.families) {
      expect(f.archetype).toBeGreaterThanOrEqual(0);
      expect(f.archetype).toBeLessThanOrEqual(6);
      expect(f.baseHp).toBeGreaterThan(0);
      expect(f.baseMin).toBeLessThanOrEqual(f.baseMax);
    }
  });

  it('installs MONSTER_PALETTES and MONSTER_FAMILIES into sim data tables and scales Sim units by tier and family', () => {
    if (MONSTER_FAMILIES.length === 0) setMonsters(parseMonsters(catalog));
    expect(MONSTER_PALETTES.length).toBe(5);
    expect(MONSTER_FAMILIES.length).toBe(25);
    expect(monsterPaletteByTier(3)?.label).toBe('Copper');
    expect(monsterFamilyById('briar-hound')?.name).toBe('Briar Hound');

    const map = generateMap(1);
    const opts = {
      combat: true,
      kinds: [Kind.Hero, Kind.Gnoll, Kind.Gnoll, Kind.Golem],
      tiers: [1, 1, 3, 5],
      families: ['', '', 'briar-hound', 'silt-colossus'],
    };
    const sim = new Sim(map, 1, [0, 1, 1, 1], opts);
    const sim2 = new Sim(map, 1, [0, 1, 1, 1], opts);

    // Unit 1: default tier 1, no family -> exact base Gnoll stats
    expect(sim.cb.hpMax[1]).toBe(DEFS[Kind.Gnoll].hp);
    expect(sim.cb.mod[1 * MODN + M.Min]).toBe(0);
    expect(sim.cb.mod[1 * MODN + M.Max]).toBe(0);

    // Unit 2: tier 3 Copper (hpMult 1.75, dmgMult 1.55) + briar-hound (baseHp 42, baseMin 4, baseMax 8)
    expect(sim.cb.tier[2]).toBe(3);
    expect(sim.cb.family[2]).toBe('briar-hound');
    expect(sim.cb.hpMax[2]).toBe(Math.round(42 * 1.75));
    expect(DEFS[Kind.Gnoll].min + sim.cb.mod[2 * MODN + M.Min]).toBe(Math.round(4 * 1.55));
    expect(DEFS[Kind.Gnoll].max + sim.cb.mod[2 * MODN + M.Max]).toBe(Math.round(8 * 1.55));

    // Unit 3: tier 5 Amethyst (hpMult 2.9, dmgMult 2.35) + silt-colossus (baseHp 210, baseMin 14, baseMax 22)
    expect(sim.cb.tier[3]).toBe(5);
    expect(sim.cb.family[3]).toBe('silt-colossus');
    expect(sim.cb.hpMax[3]).toBe(Math.round(210 * 2.9));
    expect(DEFS[Kind.Golem].min + sim.cb.mod[3 * MODN + M.Min]).toBe(Math.round(14 * 2.35));
    expect(DEFS[Kind.Golem].max + sim.cb.mod[3 * MODN + M.Max]).toBe(Math.round(22 * 2.35));

    // Determinism: same seed + same commands = same hash; snapshot + restore = same hash
    for (let i = 0; i < 4; i++) {
      sim.place(i, 6 + i, 6);
      sim2.place(i, 6 + i, 6);
    }
    sim.settle();
    sim2.settle();
    sim.step([{ type: 'order', order: 'attack', ids: [0], target: 2 }]);
    sim2.step([{ type: 'order', order: 'attack', ids: [0], target: 2 }]);
    const snap = sim.snapshot();
    for (let t = 0; t < 10; t++) {
      sim.step();
      sim2.step();
    }
    expect(sim.hash()).toBe(sim2.hash());
    const endHash = sim.hash();
    sim.restore(snap);
    for (let t = 0; t < 10; t++) sim.step();
    expect(sim.hash()).toBe(endHash);
  });

  it('validates unit tier and family on MapDoc and formats scaled monsterInfo', () => {
    const doc = blankDoc(32, 32, 'Catalog test');
    doc.units.push({ kind: Kind.Gnoll, team: 1, x: 10, y: 10, tier: 3, family: 'briar-hound' });
    expect(validate(doc)).toEqual([]);
    const loaded = loadDoc(doc);
    expect(loaded.scenario.tiers).toEqual([1, 3]);
    expect(loaded.scenario.families).toEqual(['', 'briar-hound']);

    const badDoc = blankDoc(32, 32, 'Bad catalog');
    badDoc.units.push({ kind: Kind.Gnoll, team: 1, x: 10, y: 10, tier: 6, family: 'unknown-beast' });
    const errs = validate(badDoc);
    expect(errs).toContain('Unit 1: tier must be 1 to 5.');
    expect(errs).toContain('Unit 1: unknown monster family "unknown-beast".');

    const info = monsterInfo(Kind.Gnoll, 3, 'briar-hound');
    expect(info).not.toBeNull();
    expect(info?.name).toBe('Briar Hound (Tier 3 Copper)');
    expect(info?.tier).toBe(3);
    expect(info?.family).toBe('briar-hound');
    expect(info?.role).toBe('Fast pack rusher');
    expect(info?.base.hp).toBe(Math.round(42 * 1.75));
    expect(info?.base.min).toBe(Math.round(4 * 1.55));
    expect(info?.base.max).toBe(Math.round(8 * 1.55));
    expect(info?.base.speed).toBe(115);
    expect(info?.text).toContain('Briar Hound (Tier 3 Copper)');
    expect(info?.text).toContain('Fast pack rusher');
  });

  it('applies bossMods stat bonuses, validation, monsterInfo labels, and guaranteed boss loot/gold on death (G1 & G3)', () => {
    const doc = blankDoc(32, 32, 'Boss test');
    doc.units.push({ kind: Kind.Golem, team: 1, x: 10, y: 10, tier: 2, bossMods: ['fire_enchanted', 'stone_skin'] });
    expect(validate(doc)).toEqual([]);
    const loaded = loadDoc(doc);
    expect(loaded.scenario.bossMods).toEqual([[], ['fire_enchanted', 'stone_skin']]);

    const badDoc = blankDoc(32, 32, 'Bad boss');
    badDoc.units.push({ kind: Kind.Golem, team: 1, x: 10, y: 10, bossMods: ['not_a_mod'] });
    expect(validate(badDoc)).toContain('Unit 1: invalid bossMods.');

    const info = monsterInfo(Kind.Golem, 2, '', ['fire_enchanted', 'stone_skin']);
    expect(info?.mods).toEqual(['Fire Enchanted', 'Stone Skin']);
    expect(info?.name).toContain('Fire Enchanted, Stone Skin Golem');

    const map = generateMap(1);
    const sim = new Sim(map, 1, [0, 1], {
      combat: true,
      kinds: [Kind.Hero, Kind.Golem],
      bossMods: [[], ['fire_enchanted', 'stone_skin']],
    });
    createHero(sim, 0, 0, false, 1);
    sim.place(0, 5, 5);
    sim.place(1, 6, 5);
    sim.settle();

    // Base Golem hp = 130; fire_enchanted (*1.15 = 150), stone_skin (*1.25 = 188)
    expect(sim.cb.hpMax[1]).toBe(Math.round(Math.round(130 * 1.15) * 1.25));
    expect(sim.cb.mod[1 * MODN + M.Min]).toBe(4);
    expect(sim.cb.mod[1 * MODN + M.Max]).toBe(6);
    expect(sim.cb.mod[1 * MODN + M.Res + 0]).toBe(50);
    expect(sim.cb.mod[1 * MODN + M.Def]).toBe(4);
    expect(sim.cb.mod[1 * MODN + M.Abs]).toBe(3);

    // Lethal strike guarantees item bag drop + boss bonus gold (2 mods -> +30 bonus gold)
    strike(sim, 1, 999, 999, 0, 99, 0);
    expect(sim.cb.hp[1]).toBe(0);
    expect(sim.cb.bI[0]).toBeGreaterThan(0);
    expect(sim.cb.sG[0]).toBeGreaterThanOrEqual(4 + 20 + 30);
  });
});

describe('Story act intros and ending slideshows (P22)', () => {
  it('provides four act intros and two ending slideshows with skip and replay transitions', () => {
    const intros = STORY_SEQUENCES.filter((s) => s.kind === 'intro');
    const endings = STORY_SEQUENCES.filter((s) => s.kind === 'ending');
    expect(intros.map((i) => i.act)).toEqual([1, 2, 3, 4]);
    expect(endings.map((e) => e.id)).toEqual(['ending-a', 'ending-b']);

    expect(sequenceForNode('m01-blood-at-the-ford')?.id).toBe('act-1');
    expect(sequenceForNode('m45-crown-of-order')?.id).toBe('ending-a');
    expect(sequenceForNode('m46-ember-reckoning')?.id).toBe('ending-b');

    let st = openStory('ending-a');
    expect(st.index).toBe(0);
    expect(st.finished).toBe(false);
    st = advanceStory(st);
    expect(st.index).toBe(1);
    expect(st.finished).toBe(false);
    st = advanceStory(st);
    expect(st.finished).toBe(true);

    st = replayStory(st);
    expect(st.index).toBe(0);
    expect(st.finished).toBe(false);
    expect(st.replays).toBe(1);

    st = skipStory(st);
    expect(st.finished).toBe(true);
    expect(st.index).toBe(st.sequence.slides.length - 1);
  });
});
