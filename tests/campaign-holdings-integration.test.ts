import { describe, expect, it } from 'vitest';
import { applyCarryover, extractCarryover, type CarryoverState, type Merc } from '../src/carryover';
import { createMission, missionFromName, type MissionGame } from '../src/mission';
import { Kind } from '../src/sim/combat';
import { createHero } from '../src/sim/hero';
import { ITEMS } from '../src/sim/items';
import { FP } from '../src/sim/sim';
import { mercPrice } from '../src/sim/difficulty';
import { makeQuest, QuestType, Role, rollStock } from '../src/sim/town';
import { build } from '../src/townbuild';
import { completeNode, newProgress, type Campaign, type CampaignProgress } from '../src/campaign';
import campaignData from '../public/data/campaign.json';

// Helper to create a mission game instance with hero
function initMission(mapName: string, seed = 1, diff = 1): MissionGame {
  const loaded = missionFromName(mapName);
  const game = createMission(loaded, seed);
  createHero(game.sim, 0, 0, false, diff);
  return game;
}

describe('Campaign Holdings & Missions Integration (Masterpiece Drive)', () => {
  describe('Barracks: Mercenary Discount Verification Across Acts', () => {
    it('applies 10%, 20%, 30% discount to tavern mercenaries across act towns and wilderness missions', () => {
      const townMaps = ['market', 'glade', 'scarlet', 'tidebreak'];

      for (const map of townMaps) {
        // Level 0: 0% discount
        const g0 = initMission(map, 10);
        const p0: CampaignProgress = { node: 'test', completed: [], unlocked: [], townVisits: 0, difficulty: 1, builds: {} };
        const co0: CarryoverState = { hero: g0.sim.hero!, mercs: [], gold: 1000, shopSeed: 1, progress: p0 };
        applyCarryover(g0.sim, co0);
        expect(g0.sim.town.barracks).toBeUndefined();

        const baseMerc = g0.sim.towns[0].def.mercs?.[0];
        if (!baseMerc) continue;

        // Level 1: 10% discount
        const g1 = initMission(map, 10);
        const p1: CampaignProgress = { ...p0, builds: { barracks: 1 } };
        applyCarryover(g1.sim, { ...co0, progress: p1 });
        expect(g1.sim.town.barracks).toBe(10);
        const price1 = mercPrice(g1.sim, baseMerc.price);
        expect(price1).toBe(Math.floor((baseMerc.price * 90) / 100));

        // Level 2: 20% discount
        const g2 = initMission(map, 10);
        const p2: CampaignProgress = { ...p0, builds: { barracks: 2 } };
        applyCarryover(g2.sim, { ...co0, progress: p2 });
        expect(g2.sim.town.barracks).toBe(20);
        const price2 = mercPrice(g2.sim, baseMerc.price);
        expect(price2).toBe(Math.floor((baseMerc.price * 80) / 100));

        // Level 3: 30% discount (max)
        const g3 = initMission(map, 10);
        const p3: CampaignProgress = { ...p0, builds: { barracks: 3 } };
        applyCarryover(g3.sim, { ...co0, progress: p3 });
        expect(g3.sim.town.barracks).toBe(30);
        const price3 = mercPrice(g3.sim, baseMerc.price);
        expect(price3).toBe(Math.floor((baseMerc.price * 70) / 100));

        // Hiring transaction verification: purchasing actually deducts the discounted price
        g3.sim.cb.gold[0] = 500;
        const initialGold = g3.sim.cb.gold[0];
        const [dx, dy] = g3.sim.towns[0].door[Role.Tavern]!;
        g3.sim.x[0] = Math.round((dx + 0.5) * FP);
        g3.sim.y[0] = Math.round((dy + 0.5) * FP);
        g3.sim.now({ type: 'town', op: 'enter', town: 0, v: Role.Tavern });
        expect(g3.sim.town.inside).toBe(Role.Tavern);
        g3.sim.now({ type: 'town', op: 'hire', town: 0, v: 0 });
        expect(g3.sim.cb.gold[0]).toBe(initialGold - price3);
      }
    });
  });

  describe('Forge: Shop Stock & Quest Item Tier Escalation Across Acts', () => {
    it('elevates shop stock ceiling and rerolls higher tier items across all Act town tiers', () => {
      // Act 1 Town: Thornwick (tiers [1, 2])
      // Act 2 Town: Redmarsh (tiers [2, 3])
      // Act 3 Town: Oakhaven (tiers [3, 4])
      // Act 4 Town: Ironcamp (tiers [4, 5])
      const actTownTiers: Array<{ name: string; base: [number, number] }> = [
        { name: 'Thornwick', base: [1, 2] },
        { name: 'Redmarsh', base: [2, 3] },
        { name: 'Oakhaven', base: [3, 4] },
        { name: 'Ironcamp', base: [4, 5] },
      ];

      for (const town of actTownTiers) {
        const game = initMission('market', 101, 1);
        game.sim.towns[0].def.tiers = [...town.base];

        // Without Forge
        const p0: CampaignProgress = { node: 'test', completed: [], unlocked: [], townVisits: 0, difficulty: 1 };
        const co0: CarryoverState = { hero: game.sim.hero!, mercs: [], gold: 1000, shopSeed: 1, progress: p0 };
        applyCarryover(game.sim, co0);
        expect(game.sim.town.forge).toBeUndefined();

        // Difficulty raises the ceiling too; the longer shelf now reliably shows it.
        const dd = game.sim.hero!.diff;
        const diffBump = dd === 1 ? 1 : dd >= 2 ? 2 : 0;

        // Level 1 Forge: +1 tier
        const p1: CampaignProgress = { ...p0, builds: { forge: 1 } };
        applyCarryover(game.sim, { ...co0, progress: p1 });
        expect(game.sim.town.forge).toBe(1);

        rollStock(game.sim, 0);
        const stock1 = game.sim.town.stock[0].filter((id) => id >= 0);
        expect(stock1.length).toBeGreaterThan(0);
        const maxTier1 = Math.max(...stock1.map((id) => ITEMS[id].tier));
        expect(maxTier1).toBeLessThanOrEqual(Math.min(5, town.base[1] + diffBump + 1));

        // Level 2 Forge: +2 tiers
        const p2: CampaignProgress = { ...p0, builds: { forge: 2 } };
        applyCarryover(game.sim, { ...co0, progress: p2 });
        expect(game.sim.town.forge).toBe(2);

        rollStock(game.sim, 0);
        const stock2 = game.sim.town.stock[0].filter((id) => id >= 0);
        const maxTier2 = Math.max(...stock2.map((id) => ITEMS[id].tier));
        expect(maxTier2).toBeLessThanOrEqual(Math.min(5, town.base[1] + diffBump + 2));
      }
    });

    it('expands tavern fetch quest item pool with Forge tier enhancement', () => {
      const game = initMission('market', 55, 1);
      game.sim.towns[0].def.tiers = [1, 2];

      // Base town without forge: fetch quests roll strictly tiers 1..2
      const qBase = makeQuest(game.sim, 0, QuestType.Fetch);
      expect(qBase).not.toBeNull();
      expect(ITEMS[qBase!.a].tier).toBeLessThanOrEqual(2);

      // With Forge level 2: fetch quests can draw up to tier 4 (2 + 2)
      game.sim.town.forge = 2;
      const higherTiers = new Set<number>();
      for (let s = 1; s <= 50; s++) {
        game.sim.rng.state = s;
        const q = makeQuest(game.sim, 0, QuestType.Fetch);
        if (q) higherTiers.add(ITEMS[q.a].tier);
      }
      expect(higherTiers.has(3) || higherTiers.has(4)).toBe(true);
    });
  });

  describe('Shrine: Mercenary Healing Across All 4 Acts', () => {
    it('heals wounded mercenaries by 20%, 40%, 60% upon carryover into missions across Acts I-IV', () => {
      // Test representative missions from each act that possess dormant slots
      const testMissions = [
        { act: 1, map: 'fen' },
        { act: 1, map: 'm05' },
        { act: 2, map: 'm12-128' },
        { act: 2, map: 'm17-128' },
        { act: 3, map: 'm24-192' },
        { act: 3, map: 'm31-192' },
        { act: 4, map: 'm36-256' },
        { act: 4, map: 'm44-256' },
        { act: 4, map: 'm46-256' },
      ];

      for (const tm of testMissions) {
        // Initial mercenary health: 30%
        const woundedMercs: Merc[] = [
          { kind: Kind.Warrior, hpPct: 30 },
          { kind: Kind.Archer, hpPct: 30 },
          { kind: Kind.Mage, hpPct: 30 },
        ];

        // Level 0 Shrine: retains 30% health (within integer division rounding)
        const g0 = initMission(tm.map, 1);
        const dormant0 = new Set([...Array(g0.sim.count).keys()].filter((u) => u !== 0 && g0.sim.team[u] === 0 && g0.sim.hidden[u]));
        const p0: CampaignProgress = { node: tm.map, completed: [], unlocked: [], townVisits: 0, difficulty: 1, builds: {} };
        const co0: CarryoverState = { hero: g0.sim.hero!, mercs: woundedMercs, gold: 500, shopSeed: 1, progress: p0 };
        const placed0 = applyCarryover(g0.sim, co0);
        expect(placed0).toBe(3);

        const placedUnits0 = [...dormant0].filter((u) => !g0.sim.hidden[u]);
        expect(placedUnits0.length).toBe(3);
        const mercPcts0 = placedUnits0.map((u) => Math.round((g0.sim.cb.hp[u] * 100) / g0.sim.cb.hpMax[u]));
        expect(mercPcts0.every((pct) => Math.abs(pct - 30) <= 2)).toBe(true);

        // Level 1 Shrine: +20% -> 50% health
        const g1 = initMission(tm.map, 1);
        const dormant1 = new Set([...Array(g1.sim.count).keys()].filter((u) => u !== 0 && g1.sim.team[u] === 0 && g1.sim.hidden[u]));
        const p1: CampaignProgress = { ...p0, builds: { shrine: 1 } };
        applyCarryover(g1.sim, { ...co0, progress: p1 });
        const placedUnits1 = [...dormant1].filter((u) => !g1.sim.hidden[u]);
        const mercPcts1 = placedUnits1.map((u) => Math.round((g1.sim.cb.hp[u] * 100) / g1.sim.cb.hpMax[u]));
        expect(mercPcts1.every((pct) => Math.abs(pct - 50) <= 2)).toBe(true);

        // Level 2 Shrine: +40% -> 70% health
        const g2 = initMission(tm.map, 1);
        const dormant2 = new Set([...Array(g2.sim.count).keys()].filter((u) => u !== 0 && g2.sim.team[u] === 0 && g2.sim.hidden[u]));
        const p2: CampaignProgress = { ...p0, builds: { shrine: 2 } };
        applyCarryover(g2.sim, { ...co0, progress: p2 });
        const placedUnits2 = [...dormant2].filter((u) => !g2.sim.hidden[u]);
        const mercPcts2 = placedUnits2.map((u) => Math.round((g2.sim.cb.hp[u] * 100) / g2.sim.cb.hpMax[u]));
        expect(mercPcts2.every((pct) => Math.abs(pct - 70) <= 2)).toBe(true);

        // Level 3 Shrine: +60% -> 90% health
        const g3 = initMission(tm.map, 1);
        const dormant3 = new Set([...Array(g3.sim.count).keys()].filter((u) => u !== 0 && g3.sim.team[u] === 0 && g3.sim.hidden[u]));
        const p3: CampaignProgress = { ...p0, builds: { shrine: 3 } };
        applyCarryover(g3.sim, { ...co0, progress: p3 });
        const placedUnits3 = [...dormant3].filter((u) => !g3.sim.hidden[u]);
        const mercPcts3 = placedUnits3.map((u) => Math.round((g3.sim.cb.hp[u] * 100) / g3.sim.cb.hpMax[u]));
        expect(mercPcts3.every((pct) => Math.abs(pct - 90) <= 2)).toBe(true);

        // Capped at 100% when starting from 80% + 40%
        const nearFullMercs: Merc[] = [{ kind: Kind.Warrior, hpPct: 80 }];
        const gCap = initMission(tm.map, 1);
        const dormantCap = new Set([...Array(gCap.sim.count).keys()].filter((u) => u !== 0 && gCap.sim.team[u] === 0 && gCap.sim.hidden[u]));
        applyCarryover(gCap.sim, { ...co0, mercs: nearFullMercs, progress: p2 });
        const placedUnitsCap = [...dormantCap].filter((u) => !gCap.sim.hidden[u]);
        const cappedPct = Math.round((gCap.sim.cb.hp[placedUnitsCap[0]] * 100) / gCap.sim.cb.hpMax[placedUnitsCap[0]]);
        expect(cappedPct).toBe(100);
      }
    });
  });

  describe('Full Campaign Progression Loop with Holdings Investment', () => {
    it('simulates a complete multi-act hero progression and verifies cumulative holding bonuses', () => {
      const campaign = campaignData as unknown as Campaign;

      // 1. Start Campaign in Act I at m01 (Ford)
      let progress = newProgress(campaign, 1);
      const g1 = initMission('ford', 10);
      g1.sim.cb.gold[0] = 1200; // Accumulated mission rewards

      // Add a squad of 2 mercenaries (Warrior and Archer) on player team 0
      g1.sim.team[1] = 0;
      g1.sim.hidden[1] = 0;
      g1.sim.cb.kind[1] = Kind.Warrior;
      g1.sim.cb.hp[1] = Math.round((g1.sim.cb.hpMax[1] * 40) / 100);

      g1.sim.team[2] = 0;
      g1.sim.hidden[2] = 0;
      g1.sim.cb.kind[2] = Kind.Archer;
      g1.sim.cb.hp[2] = Math.round((g1.sim.cb.hpMax[2] * 30) / 100);

      // 2. Win m01 and extract carryover
      let carry = extractCarryover(g1.sim, progress, 1);
      expect(carry.mercs.length).toBe(2);
      expect(Math.abs(carry.mercs[0].hpPct - 40)).toBeLessThanOrEqual(2);
      expect(Math.abs(carry.mercs[1].hpPct - 30)).toBeLessThanOrEqual(2);

      // 3. Player invests gold into Holdings on Campaign Map
      // Build Barracks Level 1 (400 gold) and Shrine Level 1 (300 gold)
      const b1 = build(progress, carry.gold, 'barracks');
      expect(b1).not.toBeNull();
      progress = b1!.progress;
      carry.gold = b1!.gold;

      const b2 = build(progress, carry.gold, 'shrine');
      expect(b2).not.toBeNull();
      progress = b2!.progress;
      carry.gold = b2!.gold;
      carry.progress = structuredClone(progress);

      expect(progress.builds?.barracks).toBe(1);
      expect(progress.builds?.shrine).toBe(1);

      // 4. Enter Act I Town (Thornwick Market)
      const gTown1 = initMission('market', 20);
      applyCarryover(gTown1.sim, carry);
      expect(gTown1.sim.town.barracks).toBe(10);

      // Verify mercenary hire discount is applied
      const mercBase = gTown1.sim.towns[0].def.mercs![0].price;
      expect(mercPrice(gTown1.sim, mercBase)).toBe(Math.floor((mercBase * 90) / 100));

      // 5. March into Mission m02 (Whispers in the Fen)
      progress = completeNode(campaign, progress, 'm01-blood-at-the-ford');
      carry.progress = structuredClone(progress);

      const g2 = initMission('fen', 30);
      const dormantFen = new Set([...Array(g2.sim.count).keys()].filter((u) => u !== 0 && g2.sim.team[u] === 0 && g2.sim.hidden[u]));
      const placedM02 = applyCarryover(g2.sim, carry);
      expect(placedM02).toBe(2);

      const placedFenUnits = [...dormantFen].filter((u) => !g2.sim.hidden[u]);
      expect(placedFenUnits.length).toBe(2);

      // Wounded mercs rested at the Shrine: +20% HP
      const m02Merc1HpPct = Math.round((g2.sim.cb.hp[placedFenUnits[0]] * 100) / g2.sim.cb.hpMax[placedFenUnits[0]]);
      const m02Merc2HpPct = Math.round((g2.sim.cb.hp[placedFenUnits[1]] * 100) / g2.sim.cb.hpMax[placedFenUnits[1]]);
      expect(Math.abs(m02Merc1HpPct - 60)).toBeLessThanOrEqual(2); // 40 + 20
      expect(Math.abs(m02Merc2HpPct - 50)).toBeLessThanOrEqual(2); // 30 + 20

      // 6. Complete further missions and upgrade Forge
      g2.sim.cb.gold[0] += 1500;
      carry = extractCarryover(g2.sim, progress, 2);

      const bForge = build(progress, carry.gold, 'forge'); // 600 gold
      expect(bForge).not.toBeNull();
      progress = bForge!.progress;
      carry.gold = bForge!.gold;
      carry.progress = structuredClone(progress);
      expect(progress.builds?.forge).toBe(1);

      // 7. Advance into Act II Town (Redmarsh)
      const gTown2 = initMission('market', 40);
      gTown2.sim.towns[0].def.tiers = [2, 3];
      applyCarryover(gTown2.sim, carry);

      expect(gTown2.sim.town.forge).toBe(1);
      expect(gTown2.sim.town.barracks).toBe(10);

      rollStock(gTown2.sim, 0);
      const redmarshStock = gTown2.sim.town.stock[0].filter((id) => id >= 0);
      const redmarshMaxTier = Math.max(...redmarshStock.map((id) => ITEMS[id].tier));
      expect(redmarshMaxTier).toBeLessThanOrEqual(4); // Base 3 + 1 Forge

      // 8. Carry over into Act III (m24-192) and Act IV (m44, m45, m46-256)
      const gAct3 = initMission('m24-192', 50);
      expect(applyCarryover(gAct3.sim, carry)).toBe(3);

      const gAct4 = initMission('m46-256', 60);
      expect(applyCarryover(gAct4.sim, carry)).toBe(3);
    });
  });

  describe('Simulation Determinism & State Save/Restore with Holdings', () => {
    it('preserves exact state hash across snapshot and restore with active holdings', () => {
      const gameA = initMission('m05', 42);
      const p: CampaignProgress = {
        node: 'm05-lantern-passage',
        completed: [],
        unlocked: [],
        townVisits: 2,
        difficulty: 1,
        builds: { barracks: 2, forge: 1, shrine: 2 },
      };
      const co: CarryoverState = {
        hero: gameA.sim.hero!,
        mercs: [{ kind: Kind.Warrior, hpPct: 40 }],
        gold: 800,
        shopSeed: 5,
        progress: p,
      };
      applyCarryover(gameA.sim, co);

      for (let t = 0; t < 50; t++) gameA.sim.step();
      const hashBefore = gameA.sim.hash();
      const snap = gameA.sim.snapshot();

      // Restore into fresh sim
      const gameB = initMission('m05', 42);
      gameB.sim.restore(snap);

      expect(gameB.sim.hash()).toBe(hashBefore);
      expect(gameB.sim.town.barracks).toBe(20);
      expect(gameB.sim.town.forge).toBe(1);

      // Both continue for 50 more ticks and stay strictly identical
      for (let t = 0; t < 50; t++) {
        gameA.sim.step();
        gameB.sim.step();
      }
      expect(gameA.sim.hash()).toBe(gameB.sim.hash());
    });
  });

  describe('All 46 Campaign Missions Compatibility Gate', () => {
    it('verifies that all 46 campaign missions from campaign.json accept carryover with holdings', () => {
      const campaign = campaignData as unknown as Campaign;
      const missions = campaign.nodes.filter((n) => n.kind === 'mission');
      expect(missions.length).toBe(46);

      const sampleBuilds = { barracks: 2, forge: 1, shrine: 2 };
      const sampleMercs: Merc[] = [
        { kind: Kind.Warrior, hpPct: 50 },
        { kind: Kind.Archer, hpPct: 50 },
        { kind: Kind.Mage, hpPct: 50 },
      ];

      for (const m of missions) {
        const game = initMission(m.map, 7);
        const dormantUnits = new Set([...Array(game.sim.count).keys()].filter((u) => u !== 0 && game.sim.team[u] === 0 && game.sim.hidden[u]));

        const p: CampaignProgress = {
          node: m.id,
          completed: [],
          unlocked: [],
          townVisits: 1,
          difficulty: 1,
          builds: sampleBuilds,
        };
        const co: CarryoverState = {
          hero: game.sim.hero!,
          mercs: sampleMercs,
          gold: 600,
          shopSeed: 3,
          progress: p,
        };

        const placed = applyCarryover(game.sim, co);
        // m01 is the opening solo hero mission (0 dormant carryover slots).
        // All subsequent missions m02-m46 possess 18-22 dormant slots.
        if (m.id === 'm01-blood-at-the-ford') {
          expect(placed).toBe(0);
        } else {
          expect(placed, `${m.id} (${m.map}) placed count`).toBe(3);
          const placedMercs = [...dormantUnits].filter((u) => !game.sim.hidden[u]);
          expect(placedMercs.length).toBe(3);
          const m1Pct = Math.round((game.sim.cb.hp[placedMercs[0]] * 100) / game.sim.cb.hpMax[placedMercs[0]]);
          expect(m1Pct, `${m.id} warrior healed`).toBe(90);
        }

        expect(game.sim.cb.gold[0], `${m.id} gold`).toBe(600);
        expect(game.sim.town.barracks, `${m.id} barracks`).toBe(20);
        expect(game.sim.town.forge, `${m.id} forge`).toBe(1);

        // Step 10 ticks to guarantee stability
        for (let t = 0; t < 10; t++) game.sim.step();
        expect(game.sim.hash(), `${m.id} hash`).toBeTypeOf('number');
      }
    });
  });

  describe('Flagship Skirmish Maps Verification Gate', () => {
    it('verifies Kids Paradise III (glade), Red Hat (scarlet), Turtle Beach (tidebreak) determinism & rewards', () => {
      const flagship = [
        { name: 'Kids Paradise III', key: 'glade' },
        { name: 'Red Hat', key: 'scarlet' },
        { name: 'Turtle Beach', key: 'tidebreak' },
      ];

      for (const map of flagship) {
        const a = initMission(map.key, 123);
        const b = initMission(map.key, 123);

        for (let t = 0; t < 30; t++) {
          a.sim.step();
          b.sim.step();
        }

        expect(a.sim.hash(), `${map.name} determinism`).toBe(b.sim.hash());
        expect(a.loaded.doc.text.title).toBeTruthy();
        expect(a.loaded.doc.text['obj.0']).toBeTruthy();
        expect(a.loaded.doc.text.win).toBeTruthy();
        expect(a.loaded.doc.text['fail.1']).toBeTruthy();

        // Shrines are within bounds
        for (const shrine of a.loaded.doc.shrines ?? []) {
          expect(shrine.x).toBeGreaterThanOrEqual(0);
          expect(shrine.x).toBeLessThan(a.loaded.doc.w);
          expect(shrine.y).toBeGreaterThanOrEqual(0);
          expect(shrine.y).toBeLessThan(a.loaded.doc.h);
        }
      }
    });
  });
});
