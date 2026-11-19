import { describe, expect, it } from 'vitest';
import { BOSS_MOD_IDS, blankDoc, loadDoc, validate, type MapDoc } from '../src/mapdoc';
import { createMission } from '../src/mission';
import { Kind } from '../src/sim/combat';
import { monsterFamilyById } from '../src/sim/data';
import { createHero } from '../src/sim/hero';
import { actionDef, newState } from '../src/sim/script';
import { SUPER_UNIQUES } from '../src/sim/super-uniques';
import type { Command } from '../src/sim/sim';

describe('Macro Engine Gaps (GAP-01..06)', () => {
  it('GAP-01: supports all 12 bossMods and resolves all 16 Super-Unique IDs in monsterFamilyById and validate()', () => {
    const requiredMods = [
      'fire_enchanted',
      'cold_enchanted',
      'extra_fast',
      'stone_skin',
      'magic_resistant',
      'spectral_hit',
      'blessed_aura',
      'lightning_enchanted',
      'extra_strong',
      'cursed',
      'mana_burn',
      'teleporting',
    ];
    for (const mod of requiredMods) {
      expect(BOSS_MOD_IDS).toContain(mod);
    }

    expect(SUPER_UNIQUES.length).toBe(16);
    const doc = blankDoc(64, 64, 'Super Unique Test');
    SUPER_UNIQUES.forEach((su, idx) => {
      const fam = monsterFamilyById(su.id);
      expect(fam).toBeDefined();
      expect(fam?.id).toBe(su.id);
      doc.units.push({
        kind: su.kind,
        team: 1,
        x: 10 + (idx % 10),
        y: 10 + Math.floor(idx / 10),
        tier: su.tier,
        family: su.id,
        bossMods: [...su.mods],
      });
    });

    expect(validate(doc)).toEqual([]);
  });

  it('GAP-02: allocates 16 sub-objectives (sub[0..15]) in ScriptState', () => {
    const doc = blankDoc(32, 32, 'Sub Objectives Test');
    for (let i = 0; i < 16; i++) {
      doc.text[`obj.${i}`] = `Objective ${i}`;
      doc.text[`obj.${i}.pos`] = `${10 + i},${12 + i}`;
      doc.text[`obj.${i}.kind`] = i < 6 ? 'main' : 'side';
    }
    const loaded = loadDoc(doc);
    const st = newState(loaded.def);
    expect(st.sub.length).toBe(16);
    expect(st.sub.every((v) => v === 0)).toBe(true);
  });

  it('GAP-03: giveXp action grants experience to the hero deterministically', () => {
    const def = actionDef('giveXp');
    expect(def).toBeDefined();

    const doc = blankDoc(32, 32, 'Give XP Test');
    doc.triggers.push({
      id: 'grant-xp',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'yes', a: [] }, op: 0, b: { k: 'constant', a: [1] } }],
      acts: [{ k: 'giveXp', a: [0, 250] }],
    });

    const g = createMission(loadDoc(doc), 42);
    createHero(g.sim, 0, 0, false, 1);
    expect(g.sim.hero?.level).toBe(1);
    expect(g.sim.hero?.xp).toBe(0);

    for (let t = 0; t < 10; t++) {
      const cmds: Command[] = g.ai.commands(g.sim);
      g.sim.step(cmds);
    }

    expect((g.sim.hero?.level ?? 1) >= 2 || (g.sim.hero?.xp ?? 0) > 0).toBe(true);
  });

  it('GAP-04: script variables support dialogue choice branching (vars[0..31])', () => {
    const doc = blankDoc(32, 32, 'Dialogue Branching Test');
    doc.text['msg.5'] = 'Choose the fate of the realm.';
    doc.text['msg.5.who'] = 'First Warden Ashkarath';
    doc.text['msg.5.var'] = '14';
    doc.triggers.push({
      id: 'ending-a',
      once: true,
      enabled: true,
      conds: [{ a: { k: 'variable', a: [14] }, op: 0, b: { k: 'constant', a: [1] } }],
      acts: [{ k: 'setSub', a: [11, 2] }],
    });

    const g = createMission(loadDoc(doc), 7);
    createHero(g.sim, 0, 0, false, 1);
    g.sim.script!.st.vars[14] = 1;
    g.sim.script!.st.vars[31] = 1;

    for (let t = 0; t < 10; t++) {
      g.sim.step(g.ai.commands(g.sim));
    }
    expect(g.sim.script!.st.sub[11]).toBe(2);
  });

  it('GAP-05: Region interface supports optional biome, zone, music, and ambience metadata', () => {
    const doc: MapDoc = blankDoc(64, 64, 'Regional Biome & Music Test');
    doc.regions.push({
      name: 'Ravenwatch Keep & Weeping Ossuary',
      x1: 10,
      y1: 10,
      x2: 50,
      y2: 50,
      biome: 'crypt',
      zone: 'ruinstone',
      music: 'music_explore_act1_fen',
      ambience: 'amb_ruined_sanctum',
    });
    expect(validate(doc)).toEqual([]);
    const loaded = loadDoc(doc);
    expect(loaded.doc.regions[0].biome).toBe('crypt');
    expect(loaded.doc.regions[0].zone).toBe('ruinstone');
    expect(loaded.doc.regions[0].music).toBe('music_explore_act1_fen');
    expect(loaded.doc.regions[0].ambience).toBe('amb_ruined_sanctum');
  });

  it('GAP-06: validate() allows up to 512 total units when active non-dormant units <= 300', () => {
    const doc = blankDoc(64, 64, 'Dormant Pool Test');
    // Hero is unit 0 (active). Add 250 active units + 150 dormant units = 401 total units.
    for (let i = 1; i <= 400; i++) {
      doc.units.push({
        kind: Kind.Gnoll,
        team: 1,
        x: (i % 60) + 2,
        y: Math.floor(i / 60) + 2,
        dormant: i > 250,
      });
    }
    expect(doc.units.length).toBe(401);
    expect(validate(doc)).toEqual([]);

    // If all 401 units are active (non-dormant), validate() must reject
    for (const u of doc.units) u.dormant = false;
    const errs = validate(doc);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]).toContain('300');
  });
});
